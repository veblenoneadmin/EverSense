import { useState, useEffect, useCallback } from 'react';
import { useSession } from '../lib/auth-client';
import { useOrganization } from '../contexts/OrganizationContext';
import { useApiClient } from '../lib/api-client';
import { EverSenseLogo } from '../components/EverSenseLogo';
import {
  CheckCircle2, AlertTriangle, FolderOpen, TrendingUp,
  CheckSquare, BarChart3, ArrowRight, Circle,
  Target, Zap, Clock, Activity, DollarSign, Timer,
  CalendarClock,
} from 'lucide-react';

import { VS } from '../lib/theme';

// ── Helpers ─────────────────────────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
function fmtDate() {
  return new Date().toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  not_started: { label: 'Not Started', color: VS.text2,  bg: 'rgba(144,144,144,0.12)' },
  in_progress:  { label: 'In Progress', color: VS.blue,   bg: 'rgba(86,156,214,0.12)'  },
  completed:    { label: 'Completed',   color: VS.teal,   bg: 'rgba(78,201,176,0.12)'  },
  on_hold:      { label: 'On Hold',     color: VS.yellow, bg: 'rgba(220,220,170,0.12)' },
  cancelled:    { label: 'Cancelled',   color: VS.orange, bg: 'rgba(206,145,120,0.12)' },
};

const PRIORITY_CFG: Record<string, { label: string; color: string }> = {
  low:    { label: 'Low',    color: VS.teal   },
  medium: { label: 'Medium', color: VS.yellow },
  high:   { label: 'High',   color: VS.red    },
  urgent: { label: 'Urgent', color: VS.purple },
};

// ── Sub-components ───────────────────────────────────────────────────────────
function StatCard({
  label, value, sub, color, icon: Icon,
}: {
  label: string; value: string | number; sub?: string; color: string;
  icon: React.ElementType;
}) {
  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{ background: VS.bg1, border: `1px solid ${VS.border}` }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: VS.text2 }}>
          {label}
        </span>
        <div
          className="h-8 w-8 rounded-lg flex items-center justify-center"
          style={{ background: `${color}18`, border: `1px solid ${color}33` }}
        >
          <Icon className="h-4 w-4" style={{ color }} />
        </div>
      </div>
      <div>
        <div className="text-2xl font-bold tabular-nums leading-none" style={{ color: VS.text0 }}>{value}</div>
        {sub && <div className="text-[11px] mt-1" style={{ color: VS.text2 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ── Types ────────────────────────────────────────────────────────────────────
interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
}

interface Project {
  id: string;
  name: string;
  color: string;
  status: string;
  tasks: Task[];
}

interface ClientInfo {
  id: string;
  name: string;
  email?: string;
  company?: string;
  hourlyRate?: number;
  orgId: string;
}

interface Billing {
  totalHours: number;
  billableHours: number;
  billableAmount: number;
}

// ── Main component ────────────────────────────────────────────────────────────
export function ClientDashboard() {
  const { data: session } = useSession();
  const { currentOrg, isLoading: orgLoading } = useOrganization();
  const apiClient = useApiClient();

  const [client, setClient]     = useState<ClientInfo | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [billing, setBilling]   = useState<Billing>({ totalHours: 0, billableHours: 0, billableAmount: 0 });
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!session?.user?.id || !currentOrg?.id) return;
    try {
      setLoading(true);
      const data = await apiClient.fetch('/api/clients/my');
      if (data.success) {
        setClient(data.client);
        setProjects(data.projects ?? []);
        if (data.billing) setBilling(data.billing);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id, currentOrg?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (!session || orgLoading || !currentOrg) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: VS.bg0 }}>
        <div className="flex flex-col items-center gap-4">
          <EverSenseLogo width={560} height={110} />
          <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: VS.accent }} />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6 p-6" style={{ background: VS.bg0, minHeight: '100vh' }}>
        <div className="animate-pulse space-y-6">
          <div className="h-8 rounded-lg w-64" style={{ background: VS.bg2 }} />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 rounded-xl" style={{ background: VS.bg1 }} />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 h-64 rounded-xl" style={{ background: VS.bg1 }} />
            <div className="h-64 rounded-xl" style={{ background: VS.bg1 }} />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div
          className="rounded-xl p-5"
          style={{ background: VS.bg1, border: `1px solid ${VS.red}40` }}
        >
          <div className="flex items-center gap-2" style={{ color: VS.red }}>
            <AlertTriangle className="h-4 w-4" /> {error}
          </div>
        </div>
      </div>
    );
  }

  // ── Derived stats ──────────────────────────────────────────────────────────
  const allTasks   = projects.flatMap(p => p.tasks);
  const total      = allTasks.length;
  const completed  = allTasks.filter(t => t.status === 'completed').length;
  const inProgress = allTasks.filter(t => t.status === 'in_progress').length;
  const overdue    = allTasks.filter(t =>
    t.dueDate && new Date(t.dueDate) < new Date()
    && t.status !== 'completed' && t.status !== 'cancelled'
  );
  const completion = total > 0 ? Math.round((completed / total) * 100) : 0;

  const statusCounts = allTasks.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {});
  const maxStatusCount = Math.max(...Object.values(statusCounts), 1);

  const priorityCounts = allTasks.reduce<Record<string, number>>((acc, t) => {
    const p = (t.priority ?? 'low').toLowerCase();
    acc[p] = (acc[p] ?? 0) + 1;
    return acc;
  }, {});

  // All tasks sorted by most recently updated, for the "Recent Tasks" panel
  const recentTasks = [...allTasks]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 10)
    .map(task => {
      const proj = projects.find(p => p.tasks.some(t => t.id === task.id));
      return { ...task, projectName: proj?.name };
    });

  // Per-project progress
  const projectProgress = projects.map(p => {
    const t = p.tasks.length;
    const c = p.tasks.filter(tk => tk.status === 'completed').length;
    const ip = p.tasks.filter(tk => tk.status === 'in_progress').length;
    return { ...p, total: t, completed: c, inProgress: ip, pct: t > 0 ? Math.round((c / t) * 100) : 0 };
  });

  // Upcoming deadlines (next 14 days, not completed/cancelled)
  const now = new Date();
  const in14d = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const upcoming = allTasks
    .filter(t => t.dueDate && t.status !== 'completed' && t.status !== 'cancelled')
    .filter(t => {
      const d = new Date(t.dueDate!);
      return d >= now && d <= in14d;
    })
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
    .slice(0, 8)
    .map(t => {
      const proj = projects.find(p => p.tasks.some(tk => tk.id === t.id));
      const d = new Date(t.dueDate!);
      const daysLeft = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return { ...t, projectName: proj?.name, projectColor: proj?.color, daysLeft };
    });

  const displayName = client?.name || session?.user?.email?.split('@')[0] || 'there';

  // ── No client record found ─────────────────────────────────────────────────
  if (!client) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: VS.text0 }}>
            {getGreeting()}, {displayName}
          </h1>
          <p className="text-[13px] mt-1" style={{ color: VS.text2 }}>{fmtDate()}</p>
        </div>
        <div
          className="rounded-xl p-12 text-center"
          style={{ background: VS.bg1, border: `1px solid ${VS.border}` }}
        >
          <FolderOpen className="h-12 w-12 mx-auto mb-4 opacity-30" style={{ color: VS.text2 }} />
          <p className="text-[15px] font-semibold" style={{ color: VS.text1 }}>No client profile found</p>
          <p className="text-[13px] mt-2" style={{ color: VS.text2 }}>
            Contact your account manager to get access to your projects.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: VS.text0 }}>
            {getGreeting()}, {displayName}
          </h1>
          <p className="text-[13px] mt-1" style={{ color: VS.text2 }}>
            {client.company ? `${client.company} · ` : ''}{fmtDate()}
          </p>
        </div>
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] shrink-0"
          style={{ background: VS.bg2, border: `1px solid ${VS.border}`, color: VS.text2 }}
        >
          <Activity className="h-3.5 w-3.5" style={{ color: VS.teal }} />
          {currentOrg.name}
        </div>
      </div>

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="Total Tasks"
          value={total}
          sub={`${completion}% complete`}
          icon={CheckSquare}
          color={VS.blue}
        />
        <StatCard
          label="Completed"
          value={completed}
          sub={total > 0 ? `${completion}% done` : undefined}
          icon={CheckCircle2}
          color={VS.teal}
        />
        <StatCard
          label="In Progress"
          value={inProgress}
          icon={Clock}
          color={VS.yellow}
        />
        <StatCard
          label="Overdue"
          value={overdue.length}
          sub={overdue.length === 0 ? 'All on track!' : 'Need attention'}
          icon={AlertTriangle}
          color={overdue.length === 0 ? VS.teal : VS.red}
        />
      </div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── LEFT (2/3) ── */}
        <div className="lg:col-span-2 space-y-6">

          {/* Task Status Breakdown */}
          <div
            className="rounded-xl p-5"
            style={{ background: VS.bg1, border: `1px solid ${VS.border}` }}
          >
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="h-4 w-4" style={{ color: VS.accent }} />
              <h2 className="text-[13px] font-bold" style={{ color: VS.text0 }}>Task Status Overview</h2>
              <span className="ml-auto text-[11px]" style={{ color: VS.text2 }}>{total} total</span>
            </div>
            {total === 0 ? (
              <div className="py-8 text-center text-[13px]" style={{ color: VS.text2 }}>No tasks yet</div>
            ) : (
              <div className="space-y-3">
                {Object.entries(STATUS_CFG).map(([key, cfg]) => {
                  const count = statusCounts[key] ?? 0;
                  const pct   = Math.round((count / (total || 1)) * 100);
                  const barW  = Math.round((count / maxStatusCount) * 100);
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <div className="w-24 shrink-0 text-[12px] font-medium" style={{ color: VS.text1 }}>
                        {cfg.label}
                      </div>
                      <div className="flex-1 h-6 rounded-md overflow-hidden" style={{ background: VS.bg2 }}>
                        <div
                          className="h-full rounded-md transition-all duration-700"
                          style={{
                            width: `${barW}%`,
                            minWidth: count > 0 ? 24 : 0,
                            background: `${cfg.color}30`,
                            borderLeft: `3px solid ${cfg.color}`,
                          }}
                        />
                      </div>
                      <div className="w-14 text-right shrink-0">
                        <span className="text-[13px] font-bold tabular-nums" style={{ color: VS.text0 }}>{count}</span>
                        <span className="text-[10px] ml-1" style={{ color: VS.text2 }}>{pct}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent Tasks */}
          <div
            className="rounded-xl p-5"
            style={{ background: VS.bg1, border: `1px solid ${VS.border}` }}
          >
            <div className="flex items-center gap-2 mb-4">
              <CheckSquare className="h-4 w-4" style={{ color: VS.blue }} />
              <h2 className="text-[13px] font-bold" style={{ color: VS.text0 }}>Recent Tasks</h2>
              <span className="ml-auto text-[11px]" style={{ color: VS.text2 }}>{total} tasks</span>
            </div>
            <div className="space-y-1">
              {recentTasks.length === 0 ? (
                <div className="py-8 text-center text-[13px]" style={{ color: VS.text2 }}>No tasks yet</div>
              ) : recentTasks.map((task, i) => {
                const sCfg = STATUS_CFG[task.status] ?? STATUS_CFG.not_started;
                const pCfg = PRIORITY_CFG[(task.priority ?? 'low').toLowerCase()] ?? PRIORITY_CFG.low;
                const isOverdue = task.dueDate && new Date(task.dueDate) < new Date()
                  && task.status !== 'completed' && task.status !== 'cancelled';
                return (
                  <div
                    key={task.id ?? i}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors hover:bg-white/[0.03]"
                  >
                    <Circle className="h-2 w-2 shrink-0" style={{ color: pCfg.color, fill: pCfg.color }} />
                    <div className="flex-1 min-w-0">
                      <div
                        className="text-[13px] truncate"
                        style={{
                          color: task.status === 'completed' ? VS.text2 : VS.text0,
                          textDecoration: task.status === 'completed' ? 'line-through' : 'none',
                        }}
                      >
                        {task.title}
                      </div>
                      {(task as any).projectName && (
                        <div className="text-[11px] truncate" style={{ color: VS.text2 }}>
                          {(task as any).projectName}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isOverdue && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded"
                          style={{ background: `${VS.red}18`, color: VS.red }}>
                          Overdue
                        </span>
                      )}
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                        style={{ background: sCfg.bg, color: sCfg.color }}
                      >
                        {sCfg.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Project Progress */}
          {projectProgress.length > 0 && (
            <div
              className="rounded-xl p-5"
              style={{ background: VS.bg1, border: `1px solid ${VS.border}` }}
            >
              <div className="flex items-center gap-2 mb-4">
                <FolderOpen className="h-4 w-4" style={{ color: VS.orange }} />
                <h2 className="text-[13px] font-bold" style={{ color: VS.text0 }}>Project Progress</h2>
                <span className="ml-auto text-[11px]" style={{ color: VS.text2 }}>{projects.length} projects</span>
              </div>
              <div className="space-y-4">
                {projectProgress.map(p => (
                  <div key={p.id}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: p.color || VS.accent }} />
                        <span className="text-[12px] font-medium truncate" style={{ color: VS.text0 }}>{p.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="text-[11px] tabular-nums" style={{ color: VS.text2 }}>
                          {p.completed}/{p.total} tasks
                        </span>
                        <span className="text-[12px] font-bold tabular-nums" style={{ color: p.pct === 100 ? VS.teal : VS.accent }}>
                          {p.pct}%
                        </span>
                      </div>
                    </div>
                    <div className="h-2.5 rounded-full overflow-hidden" style={{ background: VS.bg2 }}>
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${p.pct}%`,
                          background: p.pct === 100
                            ? VS.teal
                            : `linear-gradient(90deg, ${p.color || VS.accent}, ${p.color || VS.accent}99)`,
                        }}
                      />
                    </div>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-[10px]" style={{ color: VS.teal }}>{p.completed} done</span>
                      <span className="text-[10px]" style={{ color: VS.blue }}>{p.inProgress} active</span>
                      <span className="text-[10px]" style={{ color: VS.text2 }}>{p.total - p.completed - p.inProgress} pending</span>
                      {p.status === 'on_hold' && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                          style={{ background: `${VS.yellow}18`, color: VS.yellow }}>On Hold</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upcoming Deadlines */}
          <div
            className="rounded-xl p-5"
            style={{ background: VS.bg1, border: `1px solid ${VS.border}` }}
          >
            <div className="flex items-center gap-2 mb-4">
              <CalendarClock className="h-4 w-4" style={{ color: VS.purple }} />
              <h2 className="text-[13px] font-bold" style={{ color: VS.text0 }}>Upcoming Deadlines</h2>
              <span className="ml-auto text-[11px]" style={{ color: VS.text2 }}>Next 14 days</span>
            </div>
            {upcoming.length === 0 ? (
              <div className="py-6 text-center">
                <CheckCircle2 className="h-6 w-6 mx-auto mb-2 opacity-40" style={{ color: VS.teal }} />
                <p className="text-[12px]" style={{ color: VS.text2 }}>No upcoming deadlines — you're all clear!</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {upcoming.map((t, i) => {
                  const isUrgent = t.daysLeft <= 2;
                  const isSoon = t.daysLeft <= 5;
                  const dueLabelColor = isUrgent ? VS.red : isSoon ? VS.yellow : VS.text2;
                  const dueLabel = t.daysLeft === 0 ? 'Today' : t.daysLeft === 1 ? 'Tomorrow' : `${t.daysLeft} days`;
                  return (
                    <div
                      key={t.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors"
                      style={{
                        background: i % 2 === 0 ? 'transparent' : VS.bg2 + '44',
                        borderLeft: `3px solid ${isUrgent ? VS.red : isSoon ? VS.yellow : VS.border2}`,
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium truncate" style={{ color: VS.text0 }}>{t.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {t.projectName && (
                            <span className="text-[10px] flex items-center gap-1" style={{ color: VS.text2 }}>
                              <span className="h-1.5 w-1.5 rounded-full inline-block" style={{ background: t.projectColor || VS.accent }} />
                              {t.projectName}
                            </span>
                          )}
                          <span className="text-[10px]" style={{ color: VS.text2 }}>
                            {new Date(t.dueDate!).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                          </span>
                        </div>
                      </div>
                      <span
                        className="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                        style={{
                          background: `${dueLabelColor}15`,
                          color: dueLabelColor,
                          border: `1px solid ${dueLabelColor}33`,
                        }}
                      >
                        {dueLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* ── RIGHT (1/3) ── */}
        <div className="space-y-6">

          {/* Project Health */}
          <div
            className="rounded-xl p-5"
            style={{ background: VS.bg1, border: `1px solid ${VS.border}` }}
          >
            <div className="flex items-center gap-2 mb-4">
              <FolderOpen className="h-4 w-4" style={{ color: VS.orange }} />
              <h2 className="text-[13px] font-bold" style={{ color: VS.text0 }}>Project Overview</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Total',     value: projects.length,                                          color: VS.text1  },
                { label: 'Active',    value: projects.filter(p => p.status === 'active').length,       color: VS.teal   },
                { label: 'Completed', value: projects.filter(p => p.status === 'completed').length,    color: VS.blue   },
                { label: 'On Hold',   value: projects.filter(p => p.status === 'on_hold').length,      color: VS.yellow },
              ].map(item => (
                <div
                  key={item.label}
                  className="rounded-lg p-3 text-center"
                  style={{ background: VS.bg2, border: `1px solid ${VS.border}` }}
                >
                  <div className="text-xl font-bold tabular-nums" style={{ color: item.color }}>{item.value}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: VS.text2 }}>{item.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Billing Summary */}
          <div
            className="rounded-xl p-5"
            style={{ background: VS.bg1, border: `1px solid ${VS.border}` }}
          >
            <div className="flex items-center gap-2 mb-4">
              <DollarSign className="h-4 w-4" style={{ color: VS.teal }} />
              <h2 className="text-[13px] font-bold" style={{ color: VS.text0 }}>Billing Summary</h2>
            </div>
            <div className="space-y-3">
              {/* Total Hours */}
              <div
                className="flex items-center justify-between px-3 py-2.5 rounded-lg"
                style={{ background: VS.bg2, border: `1px solid ${VS.border}` }}
              >
                <div className="flex items-center gap-2">
                  <Timer className="h-3.5 w-3.5" style={{ color: VS.blue }} />
                  <span className="text-[12px]" style={{ color: VS.text1 }}>Total Hours</span>
                </div>
                <span className="text-[14px] font-bold tabular-nums" style={{ color: VS.text0 }}>
                  {billing.totalHours.toFixed(1)}h
                </span>
              </div>
              {/* Billable Hours */}
              <div
                className="flex items-center justify-between px-3 py-2.5 rounded-lg"
                style={{ background: VS.bg2, border: `1px solid ${VS.border}` }}
              >
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5" style={{ color: VS.yellow }} />
                  <span className="text-[12px]" style={{ color: VS.text1 }}>Billable Hours</span>
                </div>
                <span className="text-[14px] font-bold tabular-nums" style={{ color: VS.yellow }}>
                  {billing.billableHours.toFixed(1)}h
                </span>
              </div>
              {/* Billable Amount */}
              <div
                className="flex items-center justify-between px-3 py-2.5 rounded-lg"
                style={{ background: `${VS.teal}10`, border: `1px solid ${VS.teal}30` }}
              >
                <div className="flex items-center gap-2">
                  <DollarSign className="h-3.5 w-3.5" style={{ color: VS.teal }} />
                  <span className="text-[12px] font-medium" style={{ color: VS.teal }}>Billable Amount</span>
                </div>
                <span className="text-[15px] font-bold tabular-nums" style={{ color: VS.teal }}>
                  ${billing.billableAmount.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              {/* Hourly Rate badge */}
              {(client?.hourlyRate ?? 0) > 0 && (
                <div className="text-[11px] text-center pt-1" style={{ color: VS.text2 }}>
                  Rate: ${client!.hourlyRate}/hr
                </div>
              )}
            </div>
          </div>

          {/* Priority Distribution */}
          <div
            className="rounded-xl p-5"
            style={{ background: VS.bg1, border: `1px solid ${VS.border}` }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Target className="h-4 w-4" style={{ color: VS.purple }} />
              <h2 className="text-[13px] font-bold" style={{ color: VS.text0 }}>Task Priority Mix</h2>
            </div>
            <div className="space-y-2.5">
              {(['urgent', 'high', 'medium', 'low'] as const).map(p => {
                const cfg   = PRIORITY_CFG[p];
                const count = priorityCounts[p] ?? 0;
                const pct   = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                  <div key={p} className="flex items-center gap-3">
                    <div className="w-16 text-[12px] font-medium capitalize" style={{ color: VS.text1 }}>
                      {cfg.label}
                    </div>
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: VS.bg2 }}>
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, background: cfg.color }}
                      />
                    </div>
                    <div className="w-8 text-right text-[12px] font-bold tabular-nums" style={{ color: VS.text0 }}>
                      {count}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Overdue Tasks */}
          {overdue.length > 0 && (
            <div
              className="rounded-xl p-5"
              style={{ background: VS.bg1, border: `1px solid rgba(244,71,71,0.25)` }}
            >
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="h-4 w-4" style={{ color: VS.red }} />
                <h2 className="text-[13px] font-bold" style={{ color: VS.red }}>Overdue Tasks</h2>
                <span className="ml-auto text-[11px] px-2 py-0.5 rounded-full"
                  style={{ background: `${VS.red}18`, color: VS.red }}>
                  {overdue.length}
                </span>
              </div>
              <div className="space-y-2">
                {overdue.slice(0, 5).map((task, i) => (
                  <div key={task.id ?? i} className="flex items-start gap-2">
                    <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" style={{ color: VS.red }} />
                    <div className="min-w-0">
                      <div className="text-[12px] truncate" style={{ color: VS.text1 }}>{task.title}</div>
                      {task.dueDate && (
                        <div className="text-[11px]" style={{ color: VS.red }}>
                          Due {new Date(task.dueDate).toLocaleDateString('en-AU', {
                            day: 'numeric', month: 'short',
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Completion Progress */}
          <div
            className="rounded-xl p-5"
            style={{ background: VS.bg1, border: `1px solid ${VS.border}` }}
          >
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-4 w-4" style={{ color: VS.purple }} />
              <h2 className="text-[13px] font-bold" style={{ color: VS.text0 }}>Overall Progress</h2>
            </div>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-[12px] mb-2">
                  <span style={{ color: VS.text2 }}>Task Completion</span>
                  <span className="font-bold tabular-nums" style={{ color: VS.teal }}>{completion}%</span>
                </div>
                <div className="h-3 rounded-full overflow-hidden" style={{ background: VS.bg2 }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${completion}%`,
                      background: `linear-gradient(90deg, ${VS.teal}, ${VS.accent})`,
                    }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1">
                {[
                  { label: 'Done',     value: completed,  color: VS.teal   },
                  { label: 'Active',   value: inProgress, color: VS.blue   },
                  { label: 'Overdue',  value: overdue.length, color: VS.red },
                ].map(s => (
                  <div key={s.label} className="text-center">
                    <div className="text-[15px] font-bold tabular-nums" style={{ color: s.color }}>{s.value}</div>
                    <div className="text-[10px]" style={{ color: VS.text2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div
            className="rounded-xl p-5"
            style={{ background: VS.bg1, border: `1px solid ${VS.border}` }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Zap className="h-4 w-4" style={{ color: VS.yellow }} />
              <h2 className="text-[13px] font-bold" style={{ color: VS.text0 }}>Quick Links</h2>
            </div>
            <div className="space-y-2">
              {[
                { label: 'My Projects',  href: '/projects', color: VS.orange, icon: FolderOpen  },
                { label: 'All Tasks', href: '/tasks', color: VS.blue, icon: CheckSquare },
              ].map(a => {
                const Icon = a.icon;
                return (
                  <a
                    key={a.href}
                    href={a.href}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all hover:bg-white/[0.04]"
                    style={{ border: `1px solid ${VS.border}`, textDecoration: 'none' }}
                  >
                    <div
                      className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: `${a.color}18`, border: `1px solid ${a.color}33` }}
                    >
                      <Icon className="h-3.5 w-3.5" style={{ color: a.color }} />
                    </div>
                    <span className="text-[13px] font-medium" style={{ color: VS.text1 }}>{a.label}</span>
                    <ArrowRight className="h-3.5 w-3.5 ml-auto" style={{ color: VS.text2 }} />
                  </a>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
