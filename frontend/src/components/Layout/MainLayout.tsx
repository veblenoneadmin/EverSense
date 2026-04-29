import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useSession, authSignOut } from '../../lib/auth-client';
import Sidebar from './Sidebar';
import { LogOut, ChevronDown, Bell, CheckCheck, X, CheckSquare, AlertTriangle, Clock, CalendarDays, Users, Video, Info, Menu, ArrowLeft, ExternalLink, Settings, User } from 'lucide-react';
import { useSSE } from '../../hooks/useSSE';
import { stopTaskTimer, resumeTaskTimer } from '../../lib/task-timer';
import { EmployeeProfileModal, EmployeeInfoViewer } from '../../pages/EmployeeProfile';

import { VS } from '../../lib/theme';

function fmtElapsed(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function nowClock() {
  return new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Australia/Sydney' });
}

const pageTitles: Record<string, string> = {
  '/dashboard':   'Dashboard',
  '/brain-dump':  'Brain Dump',
  '/tasks':       'Tasks',
  '/timer':       'Timer',
  '/attendance':  'Attendance',
  '/projects':    'Projects',
  '/timesheets':  'Time Logs',
  '/clients':     'Clients',
  '/members':     'Members',
  '/reports':     'Reports',
  '/kpi-reports': 'KPI Reports',
  '/admin':       'Administration',
  '/settings':    'Settings',
};

const MainLayout: React.FC = () => {
  const { data: session } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [showDropdown, setShowDropdown] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userRole, setUserRole] = useState<string>('');
  const [pendingLeaveCount, setPendingLeaveCount] = useState<number>(0);
  const [orgId, setOrgId] = useState<string>('');

  // Notifications
  type Notif = { id: string; title: string; body: string | null; link: string | null; type: string; isRead: boolean; createdAt: string };
  const [notifications, setNotifications] = useState<Notif[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [selectedNotif, setSelectedNotif] = useState<Notif | null>(null);

  // Employee profile auto-popup (when accountant has assigned a contract to this email)
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showProfileViewer, setShowProfileViewer] = useState(false);
  const profileCheckedRef = useRef(false);

  // Wall clock
  const [currentTime, setCurrentTime] = useState(nowClock());

  // Attendance timer
  const [attendanceActive, setAttendanceActive] = useState<{ timeIn: string } | null>(null);
  const [navOnBreak, setNavOnBreak] = useState(false);
  const [navElapsed, setNavElapsed] = useState(0);
  const navTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Break + work-day modals
  // - Break-over modal: fires when on break > 60 min. Hard cap at 70 min auto-resumes.
  // - Work-day modal: fires when clocked-in elapsed >= 8h 30m. End Time/Overtime.
  const BREAK_LIMIT_SECS = 60 * 60;          // 60 min
  const BREAK_HARD_CAP_SECS = 70 * 60;        // 70 min — 10 min grace
  const WORKDAY_PROMPT_SECS = 8.5 * 3600;     // 8h 30m
  const WORKDAY_HARD_CAP_SECS = 8.5 * 3600 + 10 * 60;  // 8h 40m — 10 min grace
  const [showBreakOverModal, setShowBreakOverModal] = useState(false);
  const [showWorkOverModal, setShowWorkOverModal] = useState(false);
  // Once user picks "Overtime" on the work modal, snooze it for the rest of
  // the session so it doesn't pop again every second.
  const [workOvertimeSnoozedFor, setWorkOvertimeSnoozedFor] = useState<string | null>(null);

  useEffect(() => {
    const fetchRole = async () => {
      if (!session?.user?.id) return;
      try {
        const res = await fetch('/api/organizations');
        if (res.ok) {
          const data = await res.json();
          if (data.organizations?.length > 0) {
            setUserRole(data.organizations[0].role || '');
            setOrgId(data.organizations[0].id || '');
          }
        }
      } catch { /* ignore */ }
    };
    if (session) fetchRole();
  }, [session]);

  // Auto-popup My Profile modal when user clocks in AND accountant has assigned a contract
  // to them that they haven't signed yet. Also creates an "Employee Signup" task +
  // auto-starts the timer on it. Only fires once per session.
  const [signupTaskId, setSignupTaskId] = useState<string | null>(null);

  useEffect(() => {
    const handleAttendanceChange = async () => {
      if (!session?.user?.id || profileCheckedRef.current) return;

      // Only fire when user just clocked IN (check status endpoint)
      const statusRes = await fetch('/api/attendance/status', { credentials: 'include' }).then(r => r.ok ? r.json() : null).catch(() => null);
      if (!statusRes?.clockedIn) return;

      profileCheckedRef.current = true;

      try {
        const contractRes = await fetch('/api/contracts/my', { credentials: 'include' }).then(r => r.ok ? r.json() : null).catch(() => null);

        const contract = contractRes?.contract;
        // Fire popup if: contract exists AND the CURRENT contract is not yet signed.
        // This also handles delete-and-recreate: new contract has no signedAt → popup fires again.
        if (!contract || contract.signedAt) return;

        // Create "Employee Signup" task for this user and start the timer
        try {
          const currentOrgId = orgId;
          if (currentOrgId) {
            const headers: Record<string, string> = { 'Content-Type': 'application/json', 'x-org-id': currentOrgId };
            const taskRes = await fetch('/api/tasks', {
              method: 'POST',
              credentials: 'include',
              headers,
              body: JSON.stringify({
                title: 'Employee Signup',
                description: 'Complete your employee profile and sign your contract.',
                userId: session.user.id,
                orgId: currentOrgId,
                priority: 'High',
                status: 'in_progress',
                category: 'Onboarding',
              }),
            });
            if (taskRes.ok) {
              const data = await taskRes.json();
              const createdTaskId = data?.task?.id || data?.id;
              if (createdTaskId) {
                setSignupTaskId(createdTaskId);
                // Start the timer — both backend (for admin view) AND frontend localStorage
                // (so the timer actually ticks on the user's side)
                const startTime = Date.now();
                try {
                  // Clear any existing timer first
                  localStorage.removeItem('task_timer_active');
                  localStorage.setItem('task_timer_active', JSON.stringify({ taskId: createdTaskId, startTime }));
                  localStorage.setItem('task_timer_start', String(startTime));
                  // Notify other tabs/components to pick up the new timer
                  window.dispatchEvent(new CustomEvent('task-timer-changed', { detail: { taskId: createdTaskId, startTime } }));
                } catch { /* localStorage unavailable */ }

                await fetch('/api/tasks/timer/start', {
                  method: 'POST',
                  credentials: 'include',
                  headers,
                  body: JSON.stringify({ taskId: createdTaskId, startedAt: startTime }),
                }).catch(() => {});
              }
            }
          }
        } catch { /* non-fatal */ }

        setShowProfileModal(true);
      } catch { /* ignore */ }
    };

    // Listen for clock-in events
    window.addEventListener('attendance-change', handleAttendanceChange);
    // Also run once on mount in case they're already clocked in and haven't signed yet
    handleAttendanceChange();
    return () => window.removeEventListener('attendance-change', handleAttendanceChange);
  }, [session?.user?.id, orgId]);

  // Stop the signup task timer when the profile modal is saved & closed
  const handleProfileModalClose = async () => {
    if (signupTaskId && orgId) {
      try {
        // Stop frontend localStorage timer
        localStorage.removeItem('task_timer_active');
        localStorage.removeItem('task_timer_start');
        window.dispatchEvent(new CustomEvent('task-timer-changed', { detail: null }));

        // Stop backend timer
        const headers: Record<string, string> = { 'Content-Type': 'application/json', 'x-org-id': orgId };
        await fetch('/api/tasks/timer/stop', { method: 'POST', credentials: 'include', headers });
      } catch { /* */ }
      setSignupTaskId(null);
    }
    setShowProfileModal(false);
  };

  // Wall clock tick
  useEffect(() => {
    const id = setInterval(() => setCurrentTime(nowClock()), 1000);
    return () => clearInterval(id);
  }, []);

  // ── End-the-break helper (used by popup + auto hard-cap) ────────────────
  // Mirrors the bookkeeping done by TimeLogs.tsx handleBreak's resume branch
  // so both code paths produce the same localStorage state.
  const endBreakNow = () => {
    try {
      const startedRaw = localStorage.getItem('att_break_start');
      if (!startedRaw) return; // nothing to end
      const started = Number(startedRaw);
      const secs = Math.max(0, Math.floor((Date.now() - started) / 1000));
      const accum = Number(localStorage.getItem('att_break_accum') || 0) + secs;
      localStorage.setItem('att_break_accum', String(accum));
      localStorage.removeItem('att_break_start');
      const newCount = Number(localStorage.getItem('att_break_count') || 0) + 1;
      localStorage.setItem('att_break_count', String(newCount));
    } catch { /* localStorage unavailable */ }
    try { resumeTaskTimer(); } catch { /* */ }
    window.dispatchEvent(new CustomEvent('attendance-change'));
  };

  // ── Watcher: fires modals based on break / work elapsed ─────────────────
  // Driven by the wall-clock tick (currentTime updates every second). Cheap
  // since checks are pure localStorage + arithmetic.
  useEffect(() => {
    // Break check — uses CUMULATIVE break time (accum + current break elapsed)
    // so multiple short breaks count toward the 60-min daily total.
    const breakStartRaw = localStorage.getItem('att_break_start');
    if (breakStartRaw) {
      const breakAccum = Number(localStorage.getItem('att_break_accum') || 0);
      const currentElapsed = Math.floor((Date.now() - Number(breakStartRaw)) / 1000);
      const totalBreakSecs = breakAccum + currentElapsed;
      if (totalBreakSecs >= BREAK_HARD_CAP_SECS) {
        // Hard cap on cumulative total — auto-end the break.
        if (showBreakOverModal) setShowBreakOverModal(false);
        endBreakNow();
      } else if (totalBreakSecs >= BREAK_LIMIT_SECS && !showBreakOverModal) {
        setShowBreakOverModal(true);
      }
    } else if (showBreakOverModal) {
      // Break ended via some other path (TimeLogs page, another tab) → close popup.
      setShowBreakOverModal(false);
    }

    // Work-day check — only relevant if currently clocked in and not on break
    if (attendanceActive?.timeIn && !breakStartRaw) {
      const grossSecs = Math.floor((Date.now() - new Date(attendanceActive.timeIn).getTime()) / 1000);
      const breakAccum = Number(localStorage.getItem('att_break_accum') || 0);
      const netSecs = Math.max(0, grossSecs - breakAccum);
      const snoozed = workOvertimeSnoozedFor === attendanceActive.timeIn;
      if (netSecs >= WORKDAY_HARD_CAP_SECS && !snoozed) {
        // Hard cap (10 min after popup) and user did NOT pick Overtime →
        // auto-clock-out. Same path as the End Time button.
        if (showWorkOverModal) setShowWorkOverModal(false);
        handleEndTimeFromWorkModal();
      } else if (netSecs >= WORKDAY_PROMPT_SECS && !snoozed && !showWorkOverModal) {
        setShowWorkOverModal(true);
      }
    } else if (showWorkOverModal && !attendanceActive) {
      // User clocked out — clear the modal.
      setShowWorkOverModal(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime, attendanceActive]);

  // ── Modal action handlers ──────────────────────────────────────────────
  const handleResumeFromBreakModal = () => {
    endBreakNow();
    setShowBreakOverModal(false);
  };

  const handleEndTimeFromWorkModal = async () => {
    setShowWorkOverModal(false);
    // Total break = accum + any in-progress break elapsed (shouldn't be any
    // since modal only shows when not on break, but defensive)
    let totalBreak = Number(localStorage.getItem('att_break_accum') || 0);
    const breakStartRaw = localStorage.getItem('att_break_start');
    if (breakStartRaw) totalBreak += Math.floor((Date.now() - Number(breakStartRaw)) / 1000);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (orgId) headers['x-org-id'] = orgId;
      await fetch('/api/attendance/clock-out', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ ...(orgId && { orgId }), breakDuration: totalBreak }),
      });
      try { stopTaskTimer(); } catch { /* */ }
      try {
        localStorage.removeItem('att_break_start');
        localStorage.removeItem('att_break_accum');
        localStorage.removeItem('att_break_count');
      } catch { /* */ }
      window.dispatchEvent(new CustomEvent('attendance-change'));
    } catch (e) {
      console.error('[MainLayout] End Time clock-out failed:', e);
    }
  };

  const handleOvertimeFromWorkModal = () => {
    // Snooze for the rest of THIS session (keyed by the current timeIn).
    if (attendanceActive?.timeIn) setWorkOvertimeSnoozedFor(attendanceActive.timeIn);
    setShowWorkOverModal(false);
  };

  // Fetch attendance status
  const fetchStatus = useCallback(async () => {
    if (!session?.user?.id || !orgId) return;
    try {
      const q = new URLSearchParams({ userId: session!.user!.id, orgId }).toString();
      const res = await fetch(`/api/attendance/status?${q}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setAttendanceActive(data.active);
        setNavOnBreak(!!localStorage.getItem('att_break_start'));
      }
    } catch { /* ignore */ }
  }, [session?.user?.id, orgId]);

  useEffect(() => {
    if (!session?.user?.id || !orgId) return;
    fetchStatus();
    window.addEventListener('attendance-change', fetchStatus);
    return () => window.removeEventListener('attendance-change', fetchStatus);
  }, [session?.user?.id, orgId, fetchStatus]);

  // Fetch notifications
  const fetchNotifs = useCallback(async () => {
    if (!session?.user?.id || !orgId) return;
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications ?? []);
        setUnreadCount(data.unreadCount ?? 0);
      }
    } catch { /* ignore */ }
  }, [session?.user?.id, orgId]);

  useEffect(() => {
    if (!session?.user?.id || !orgId) return;
    fetchNotifs();
  }, [session?.user?.id, orgId, fetchNotifs]);

  // Poll pending leave count for approvers (OWNER/ADMIN/HoJ)
  useEffect(() => {
    if (!session?.user?.id || !orgId) return;
    if (!['OWNER', 'ADMIN', 'HALL_OF_JUSTICE'].includes(userRole)) return;
    let cancelled = false;
    const fetchPending = async () => {
      try {
        const res = await fetch('/api/leaves/pending');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setPendingLeaveCount(Array.isArray(data.leaves) ? data.leaves.length : 0);
      } catch { /* ignore */ }
    };
    fetchPending();
    const interval = setInterval(fetchPending, 60_000); // 1 min
    return () => { cancelled = true; clearInterval(interval); };
  }, [session?.user?.id, orgId, userRole]);

  // SSE — real-time push updates (replaces polling intervals)
  useSSE(orgId || undefined, (event, data) => {
    const d = (data || {}) as { action?: string; userId?: string; reason?: string };
    if (event === 'attendance') {
      fetchStatus();
      // If THIS user just got clocked out (manual clock-out from another tab,
      // auto-clockout cron, admin force-stop, etc.), stop their local task
      // timer so localStorage doesn't keep ticking phantom hours.
      if (d.action === 'clock-out' && d.userId === session?.user?.id) {
        try { stopTaskTimer(); } catch { /* non-fatal */ }
      }
      // Super admin reset-break: clear local break state immediately. The
      // user gets a fresh 60-min budget without having to refresh.
      if (d.action === 'reset-break' && d.userId === session?.user?.id) {
        try {
          localStorage.removeItem('att_break_start');
          localStorage.removeItem('att_break_accum');
          localStorage.removeItem('att_break_count');
          window.dispatchEvent(new CustomEvent('attendance-change'));
        } catch { /* non-fatal */ }
      }
    }
    if (event === 'notification') fetchNotifs();
    // Auto-clockout cron also broadcasts a 'timer' stop with reason='auto-clockout'
    // — same effect, defensive double-handling in case 'attendance' event is
    // missed by the listener.
    if (event === 'timer' && d.action === 'stop' && d.userId === session?.user?.id && d.reason === 'auto-clockout') {
      try { stopTaskTimer(); } catch { /* non-fatal */ }
    }
  });

  const handleMarkAllRead = async () => {
    try {
      await fetch('/api/notifications/read-all', { method: 'PUT' });
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch { /* ignore */ }
  };

  const handleNotifClick = async (notif: Notif) => {
    if (!notif.isRead) {
      fetch(`/api/notifications/${notif.id}/read`, { method: 'PUT' });
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, isRead: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
    setSelectedNotif(notif);
  };

  const handleNotifNavigate = (link: string) => {
    setShowNotifications(false);
    setSelectedNotif(null);
    navigate(link);
  };

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  // Live elapsed tick — pause on break or clock-out, subtract break time
  useEffect(() => {
    if (navTimerRef.current) clearInterval(navTimerRef.current);
    if (!attendanceActive) return; // keep last navElapsed, just stop ticking
    if (navOnBreak) return; // on break — freeze the counter

    const tick = () => {
      const gross = Math.floor((Date.now() - new Date(attendanceActive.timeIn).getTime()) / 1000);
      const breakAccum = Number(localStorage.getItem('att_break_accum') || 0);
      setNavElapsed(Math.max(0, gross - breakAccum));
    };
    tick();
    navTimerRef.current = setInterval(tick, 1000);
    return () => { if (navTimerRef.current) clearInterval(navTimerRef.current); };
  }, [attendanceActive, navOnBreak]);

  const handleSignOut = async () => {
    try {
      await authSignOut();
      // Redirect to login after logout
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout error:', error);
      // Redirect anyway even if there's an error
      window.location.href = '/login';
    }
  };

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]?.toUpperCase()).filter(Boolean).join('').slice(0, 2) || 'U';

  const pageTitle = pageTitles[location.pathname] ?? '';
  const email = session?.user?.email ?? '';
  const displayName = session?.user?.name || email.split('@')[0] || 'User';

  const notifTypeMeta: Record<string, { icon: React.ElementType; color: string }> = {
    task:     { icon: CheckSquare,  color: VS.accent },
    comment:  { icon: CheckSquare,  color: '#c586c0' },
    due_soon: { icon: Clock,        color: '#dcdcaa' },
    overdue:  { icon: AlertTriangle,color: '#f44747' },
    project:  { icon: Info,         color: '#4ec9b0' },
    calendar: { icon: CalendarDays, color: '#4ec9b0' },
    meeting:  { icon: Video,        color: '#569cd6' },
    member:   { icon: Users,        color: '#6a9955' },
    reminder: { icon: Clock,        color: '#ce9178' },
    info:     { icon: Info,         color: VS.text2  },
  };

  return (
    <div className="min-h-screen" style={{ background: VS.bg0 }}>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Auto-popup My Profile modal when the user clocks in and has an unsigned contract.
          mandatory=true → can't close until they complete it */}
      <EmployeeProfileModal open={showProfileModal} onClose={handleProfileModalClose} mandatory />

      {/* Read-only viewer — opened from the navbar user dropdown */}
      <EmployeeInfoViewer
        open={showProfileViewer}
        onClose={() => setShowProfileViewer(false)}
        onEdit={() => { setShowProfileViewer(false); setShowProfileModal(true); }}
      />

      {/* ── Break-over modal ────────────────────────────────────────────────
          Fires when on break > 60 min. Hard cap at 70 min auto-resumes. */}
      {showBreakOverModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.65)' }}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6 space-y-4"
            style={{ background: VS.bg1, border: `1px solid ${VS.border}`, boxShadow: '0 24px 64px rgba(0,0,0,0.7)' }}
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full flex items-center justify-center"
                   style={{ background: 'rgba(220,220,170,0.15)' }}>
                <Clock className="h-5 w-5" style={{ color: VS.yellow }} />
              </div>
              <div>
                <h3 className="text-base font-bold" style={{ color: VS.text0 }}>Break Time Exceeded</h3>
                <p className="text-xs mt-0.5" style={{ color: VS.text2 }}>
                  Your break has gone over the 60-minute limit. Auto-resume in 10 min if not actioned.
                </p>
              </div>
            </div>
            <button
              onClick={handleResumeFromBreakModal}
              className="w-full px-4 py-3 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ background: VS.teal, color: '#0f1f1c' }}
            >
              Resume Time
            </button>
          </div>
        </div>
      )}

      {/* ── Work-day 8h 30m modal ───────────────────────────────────────────
          Fires when worked >= 8h 30m. End Time → clocks out. Overtime →
          dismisses + snoozes for the rest of the session. */}
      {showWorkOverModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.65)' }}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6 space-y-4"
            style={{ background: VS.bg1, border: `1px solid ${VS.border}`, boxShadow: '0 24px 64px rgba(0,0,0,0.7)' }}
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full flex items-center justify-center"
                   style={{ background: `${VS.accent}22` }}>
                <Clock className="h-5 w-5" style={{ color: VS.accent }} />
              </div>
              <div>
                <h3 className="text-base font-bold" style={{ color: VS.text0 }}>You've reached 8h 30m</h3>
                <p className="text-xs mt-0.5" style={{ color: VS.text2 }}>
                  Pick "End Time" to clock out, or "Overtime" to keep working — extra time is recorded as overtime.
                  Auto-clockout in 10 min if no action.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleEndTimeFromWorkModal}
                className="flex-1 px-4 py-3 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
                style={{ background: 'rgba(244,71,71,0.15)', color: VS.red, border: `1px solid rgba(244,71,71,0.3)` }}
              >
                End Time
              </button>
              <button
                onClick={handleOvertimeFromWorkModal}
                className="flex-1 px-4 py-3 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
                style={{ background: VS.accent, color: '#fff' }}
              >
                Overtime
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Navbar */}
      <header
        className="fixed top-0 right-0 z-40 flex h-14 items-center justify-between px-3 md:px-6 md:left-60 left-0"
        style={{ background: VS.bg1, borderBottom: `1px solid ${VS.border}` }}
      >
        {/* Left — hamburger (mobile) + page title */}
        <div className="flex items-center gap-2">
          <button
            className="md:hidden flex items-center justify-center h-8 w-8 rounded-lg transition-colors"
            style={{ color: sidebarOpen ? VS.text0 : VS.text2, background: sidebarOpen ? VS.bg2 : 'transparent' }}
            onClick={() => setSidebarOpen(v => !v)}
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          {pageTitle && <h1 className="text-sm font-semibold" style={{ color: VS.text2 }}>{pageTitle}</h1>}
        </div>

        {/* Center — wall clock + attendance elapsed (absolutely centered, hidden on small screens) */}
        <div className="hidden sm:flex absolute left-1/2 -translate-x-1/2 items-center gap-3">
          <span className="text-[13px] font-mono font-semibold tabular-nums" style={{ color: VS.text1 }}>
            {currentTime}
          </span>

          {navElapsed > 0 && (
            <>
              <span style={{ color: VS.border }}>|</span>
              <div className="flex items-center gap-1.5">
                {attendanceActive && !navOnBreak && (
                  <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: VS.teal }} />
                )}
                {navOnBreak && (
                  <span className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded" style={{ background: `${VS.red}22`, color: VS.red }}>
                    Break
                  </span>
                )}
                <span
                  className="text-[13px] font-mono font-semibold tabular-nums"
                  style={{ color: attendanceActive && !navOnBreak ? VS.teal : VS.text2 }}
                >
                  {fmtElapsed(navElapsed)}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Right — notifications + user dropdown */}
        <div className="flex items-center gap-2">

          {/* Leave-approval glass card — only for approvers, only when pending > 0 */}
          {['OWNER', 'ADMIN', 'HALL_OF_JUSTICE'].includes(userRole) && pendingLeaveCount > 0 && (
            <button
              onClick={() => navigate('/leaves')}
              title={`${pendingLeaveCount} leave${pendingLeaveCount > 1 ? 's' : ''} awaiting approval`}
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all"
              style={{
                background: 'rgba(86, 156, 214, 0.12)',
                border: '1px solid rgba(86, 156, 214, 0.32)',
                color: VS.text0,
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                boxShadow: '0 4px 16px rgba(86, 156, 214, 0.15), inset 0 1px 0 rgba(255,255,255,0.08)',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(86, 156, 214, 0.2)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(86, 156, 214, 0.12)'; }}
            >
              <CalendarDays className="h-4 w-4" style={{ color: VS.accent }} />
              <span className="text-[11px] font-semibold" style={{ color: VS.text0 }}>
                {pendingLeaveCount} pending leave{pendingLeaveCount > 1 ? 's' : ''}
              </span>
            </button>
          )}

          {/* Bell icon */}
          <div className="relative">
            <button
              onClick={() => { setShowNotifications(v => !v); setShowDropdown(false); }}
              className="relative flex h-8 w-8 items-center justify-center rounded-lg transition-colors duration-150"
              style={{ background: showNotifications ? VS.bg3 : 'transparent', color: VS.text1 }}
              onMouseEnter={e => { if (!showNotifications) (e.currentTarget as HTMLElement).style.background = VS.bg2; }}
              onMouseLeave={e => { if (!showNotifications) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              title="Notifications"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white"
                  style={{ background: VS.red, minWidth: 16 }}
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => { setShowNotifications(false); setSelectedNotif(null); }} />
                <div
                  className="absolute right-0 top-full mt-2 w-[calc(100vw-1.5rem)] sm:w-80 rounded-xl z-20 overflow-hidden flex flex-col"
                  style={{ background: VS.bg1, border: `1px solid ${VS.border}`, boxShadow: '0 16px 48px rgba(0,0,0,0.7)', maxHeight: 420 }}
                  onClick={e => e.stopPropagation()}
                >
                  {selectedNotif ? (
                    /* ── Detail view ── */
                    <>
                      <div className="flex items-center justify-between px-4 py-2.5 shrink-0" style={{ borderBottom: `1px solid ${VS.border}` }}>
                        <button
                          onClick={() => setSelectedNotif(null)}
                          className="flex items-center gap-1.5 text-[12px]"
                          style={{ color: VS.text2 }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = VS.text0}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = VS.text2}
                        >
                          <ArrowLeft className="h-3.5 w-3.5" />Back
                        </button>
                        <button onClick={() => { setShowNotifications(false); setSelectedNotif(null); }} style={{ color: VS.text2, background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}>
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="flex flex-col gap-4 p-4">
                        {/* Icon + type */}
                        {(() => {
                          const meta = notifTypeMeta[selectedNotif.type] ?? notifTypeMeta.info;
                          const TypeIcon = meta.icon;
                          return (
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 shrink-0 rounded-lg flex items-center justify-center" style={{ background: `${meta.color}20` }}>
                                <TypeIcon className="h-4.5 w-4.5" style={{ color: meta.color }} />
                              </div>
                              <div>
                                <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: meta.color }}>{selectedNotif.type}</p>
                                <p className="text-[10px]" style={{ color: VS.text2 }}>{timeAgo(selectedNotif.createdAt)}</p>
                              </div>
                            </div>
                          );
                        })()}
                        {/* Title */}
                        <p className="text-[14px] font-semibold leading-snug" style={{ color: VS.text0 }}>{selectedNotif.title}</p>
                        {/* Body */}
                        {selectedNotif.body && (
                          <p className="text-[13px] leading-relaxed" style={{ color: VS.text1, background: VS.bg2, borderRadius: 8, padding: '10px 12px' }}>
                            {selectedNotif.body}
                          </p>
                        )}
                        {/* CTA */}
                        {(() => {
                          const typeLinkMap: Record<string, string> = {
                            task: '/tasks', comment: '/tasks', due_soon: '/tasks', overdue: '/tasks',
                            project: '/projects', calendar: '/calendar', meeting: '/calendar',
                            member: '/admin',
                          };
                          const dest = selectedNotif.link || typeLinkMap[selectedNotif.type] || '/dashboard';
                          return (
                            <button
                              onClick={() => handleNotifNavigate(dest)}
                              className="flex items-center justify-center gap-2 w-full py-2 rounded-lg text-[13px] font-semibold transition-opacity"
                              style={{ background: VS.accent, color: '#fff', border: 'none', cursor: 'pointer' }}
                              onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.85'}
                              onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              Go to page
                            </button>
                          );
                        })()}
                      </div>
                    </>
                  ) : (
                    /* ── List view ── */
                    <>
                      <div className="flex items-center justify-between px-4 py-2.5 shrink-0" style={{ borderBottom: `1px solid ${VS.border}` }}>
                        <span className="text-[12px] font-semibold" style={{ color: VS.text0 }}>Notifications</span>
                        <div className="flex items-center gap-2">
                          {unreadCount > 0 && (
                            <button
                              onClick={handleMarkAllRead}
                              className="flex items-center gap-1 text-[11px] transition-colors"
                              style={{ color: VS.accent }}
                              onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.75'}
                              onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
                            >
                              <CheckCheck className="h-3 w-3" />
                              Mark all read
                            </button>
                          )}
                          <button
                            onClick={() => setShowNotifications(false)}
                            className="flex h-5 w-5 items-center justify-center rounded"
                            style={{ color: VS.text2 }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = VS.text0}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = VS.text2}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="overflow-y-auto" style={{ maxHeight: 360 }}>
                        {notifications.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-10 gap-2" style={{ color: VS.text2 }}>
                            <Bell className="h-6 w-6 opacity-30" />
                            <p className="text-[12px]">No notifications yet</p>
                          </div>
                        ) : (
                          notifications.map(n => {
                            const meta = notifTypeMeta[n.type] ?? notifTypeMeta.info;
                            const TypeIcon = meta.icon;
                            return (
                              <button
                                key={n.id}
                                onClick={() => handleNotifClick(n)}
                                className="w-full text-left flex items-start gap-3 px-4 py-3 transition-colors duration-100"
                                style={{
                                  background: n.isRead ? 'transparent' : `${VS.accent}0f`,
                                  borderBottom: `1px solid ${VS.border}`,
                                }}
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = VS.bg2}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = n.isRead ? 'transparent' : `${VS.accent}0f`}
                              >
                                <div className="mt-0.5 h-6 w-6 shrink-0 rounded-md flex items-center justify-center" style={{ background: `${meta.color}20` }}>
                                  <TypeIcon className="h-3.5 w-3.5" style={{ color: meta.color }} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <p className="text-[12px] font-medium leading-snug truncate" style={{ color: n.isRead ? VS.text1 : VS.text0 }}>{n.title}</p>
                                    {!n.isRead && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: VS.accent }} />}
                                  </div>
                                  {n.body && <p className="text-[11px] mt-0.5 line-clamp-2" style={{ color: VS.text2 }}>{n.body}</p>}
                                  <p className="text-[10px] mt-1" style={{ color: VS.text2 }}>{timeAgo(n.createdAt)}</p>
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Settings gear icon */}
          <button
            onClick={() => navigate('/settings')}
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors duration-150"
            style={{ color: VS.text1 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = VS.bg2; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>

          <div className="relative">
            <button
              onClick={() => { setShowDropdown(v => !v); setShowNotifications(false); }}
              className="flex items-center gap-2.5 rounded-lg px-3 py-1.5 transition-colors duration-150"
              style={{ background: showDropdown ? VS.bg3 : 'transparent' }}
              onMouseEnter={e => { if (!showDropdown) (e.currentTarget as HTMLElement).style.background = VS.bg2; }}
              onMouseLeave={e => { if (!showDropdown) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              {/* Avatar */}
              {session?.user?.image
                ? <img src={session.user.image} alt={displayName}
                    className="h-7 w-7 rounded-full object-cover shrink-0 ring-1 ring-white/20" />
                : <div
                    className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                    style={{ background: 'linear-gradient(135deg, hsl(252 87% 62%), hsl(260 80% 70%))' }}
                  >
                    {getInitials(displayName)}
                  </div>
              }
              <div className="text-left leading-tight hidden sm:block">
                <p className="text-[12px] font-medium capitalize" style={{ color: VS.text0 }}>{displayName}</p>
                {userRole && (
                  <p className="text-[10px] capitalize" style={{ color: VS.text2 }}>{userRole.toLowerCase()}</p>
                )}
              </div>
              <ChevronDown className="h-3.5 w-3.5 shrink-0" style={{ color: VS.text2 }} />
            </button>

            {/* Dropdown */}
            {showDropdown && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowDropdown(false)} />
                <div
                  className="absolute right-0 top-full mt-2 w-56 rounded-xl z-20 overflow-hidden"
                  style={{ background: VS.bg1, border: `1px solid ${VS.border}`, boxShadow: '0 16px 48px rgba(0,0,0,0.7)' }}
                >
                  <div className="px-4 py-3" style={{ borderBottom: `1px solid ${VS.border}` }}>
                    <p className="text-[12px] font-medium capitalize" style={{ color: VS.text0 }}>{displayName}</p>
                    <p className="text-[11px] truncate mt-0.5" style={{ color: VS.text2 }}>{email}</p>
                  </div>
                  <button
                    onClick={() => { setShowDropdown(false); setShowProfileViewer(true); }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-[13px] transition-colors duration-150"
                    style={{ color: VS.text1 }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.background = `${VS.accent}14`;
                      (e.currentTarget as HTMLElement).style.color = VS.accent;
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.background = 'transparent';
                      (e.currentTarget as HTMLElement).style.color = VS.text1;
                    }}
                  >
                    <User className="h-4 w-4" />
                    Employee Info
                  </button>
                  <button
                    onClick={() => { setShowDropdown(false); navigate('/leaves'); }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-[13px] transition-colors duration-150"
                    style={{ color: VS.text1 }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.background = `${VS.accent}14`;
                      (e.currentTarget as HTMLElement).style.color = VS.accent;
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.background = 'transparent';
                      (e.currentTarget as HTMLElement).style.color = VS.text1;
                    }}
                  >
                    <CalendarDays className="h-4 w-4" />
                    Leaves
                  </button>
                  <button
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-[13px] transition-colors duration-150"
                    style={{ color: VS.text1, borderTop: `1px solid ${VS.border}` }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.background = `${VS.red}14`;
                      (e.currentTarget as HTMLElement).style.color = VS.red;
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.background = 'transparent';
                      (e.currentTarget as HTMLElement).style.color = VS.text1;
                    }}
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="md:pl-60 pt-14 min-w-0">
        <div className="p-3 sm:p-5 md:p-7">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default MainLayout;
