import { useEffect, useMemo, useState } from 'react';
import { useApiClient } from '../lib/api-client';
import { VS } from '../lib/theme';
import { CalendarDays, Plus, Clock, CheckCircle2, XCircle } from 'lucide-react';

type LeaveType = 'annual' | 'sick';
type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

interface LeaveRow {
  id: string;
  type: string;
  status: LeaveStatus;
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
  approvedAt: string | null;
  createdAt: string;
}

interface LeavesResponse {
  leaves: LeaveRow[];
  allowances: { annual: number; sick: number };
  used: { annual: number; sick: number };
  remaining: { annual: number; sick: number };
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return iso; }
}

function StatusPill({ status }: { status: LeaveStatus }) {
  const cfg = {
    PENDING:  { color: VS.yellow, bg: `${VS.yellow}22`, label: 'Pending' },
    APPROVED: { color: VS.teal,   bg: `${VS.teal}22`,   label: 'Approved' },
    REJECTED: { color: VS.red,    bg: `${VS.red}22`,    label: 'Rejected' },
  }[status];
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider"
      style={{ color: cfg.color, background: cfg.bg }}>
      {status === 'PENDING' && <Clock className="h-3 w-3" />}
      {status === 'APPROVED' && <CheckCircle2 className="h-3 w-3" />}
      {status === 'REJECTED' && <XCircle className="h-3 w-3" />}
      {cfg.label}
    </span>
  );
}

export function Leaves() {
  const api = useApiClient();
  const [data, setData] = useState<LeavesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<{ type: LeaveType; startDate: string; endDate: string; reason: string }>({
    type: 'annual',
    startDate: '',
    endDate: '',
    reason: '',
  });

  const fetchLeaves = async () => {
    try {
      const d: LeavesResponse = await api.fetch('/api/leaves/my');
      setData(d);
    } catch {
      setData({ leaves: [], allowances: { annual: 10, sick: 5 }, used: { annual: 0, sick: 0 }, remaining: { annual: 10, sick: 5 } });
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchLeaves(); }, []);

  const pending  = useMemo(() => data?.leaves.filter(l => l.status === 'PENDING') ?? [], [data]);
  const approved = useMemo(() => data?.leaves.filter(l => l.status === 'APPROVED') ?? [], [data]);
  const rejected = useMemo(() => data?.leaves.filter(l => l.status === 'REJECTED') ?? [], [data]);

  const estimatedDays = useMemo(() => {
    if (!form.startDate || !form.endDate) return 0;
    const s = new Date(form.startDate), e = new Date(form.endDate);
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return 0;
    return Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  }, [form.startDate, form.endDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.startDate || !form.endDate) return;
    setSubmitting(true);
    try {
      await api.fetch('/api/leaves/my', {
        method: 'POST',
        body: JSON.stringify({
          type: form.type,
          startDate: new Date(form.startDate + 'T00:00:00.000Z').toISOString(),
          endDate: new Date(form.endDate + 'T00:00:00.000Z').toISOString(),
          reason: form.reason || null,
        }),
      });
      setShowModal(false);
      setForm({ type: 'annual', startDate: '', endDate: '', reason: '' });
      await fetchLeaves();
    } catch {
      alert('Failed to submit leave request.');
    } finally { setSubmitting(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-6 h-6 rounded-full animate-spin" style={{ border: `2px solid ${VS.border}`, borderTopColor: VS.accent }} />
      </div>
    );
  }

  const allowances = data!.allowances;
  const used = data!.used;
  const remaining = data!.remaining;

  const BalanceCard = ({ label, total, usedDays, remainDays, color }: { label: string; total: number; usedDays: number; remainDays: number; color: string }) => (
    <div className="rounded-xl p-5" style={{ background: VS.bg1, border: `1px solid ${VS.border}` }}>
      <div className="text-[11px] uppercase tracking-wider mb-2" style={{ color: VS.text2 }}>{label}</div>
      <div className="flex items-baseline gap-2">
        <div className="text-3xl font-bold font-mono" style={{ color }}>{remainDays}</div>
        <div className="text-xs" style={{ color: VS.text2 }}>/ {total} left</div>
      </div>
      <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ background: VS.bg2 }}>
        <div className="h-full transition-all" style={{
          width: `${Math.min(100, (usedDays / Math.max(1, total)) * 100)}%`,
          background: color,
        }} />
      </div>
      <div className="text-[11px] mt-2" style={{ color: VS.text2 }}>{usedDays} used this year</div>
    </div>
  );

  const LeaveRow = ({ l }: { l: LeaveRow }) => (
    <div className="flex items-center justify-between p-4" style={{ borderTop: `1px solid ${VS.border}` }}>
      <div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold capitalize" style={{ color: VS.text0 }}>{l.type}</span>
          <StatusPill status={l.status} />
        </div>
        <div className="text-xs mt-1" style={{ color: VS.text2 }}>
          {fmtDate(l.startDate)} → {fmtDate(l.endDate)} · {l.days} day{l.days > 1 ? 's' : ''}
        </div>
        {l.reason && <div className="text-xs mt-1 italic" style={{ color: VS.text1 }}>{l.reason}</div>}
      </div>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: VS.text0 }}>
            <CalendarDays className="h-5 w-5" style={{ color: VS.accent }} />
            Leaves
          </h1>
          <p className="text-xs mt-1" style={{ color: VS.text2 }}>Manage your leave requests and balance.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors"
          style={{ background: VS.accent, color: '#fff' }}
        >
          <Plus className="h-4 w-4" /> Request Leave
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BalanceCard label="Annual Leave" total={allowances.annual} usedDays={used.annual} remainDays={remaining.annual} color={VS.teal} />
        <BalanceCard label="Sick Leave"   total={allowances.sick}   usedDays={used.sick}   remainDays={remaining.sick}   color={VS.purple} />
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: VS.bg1, border: `1px solid ${VS.border}` }}>
        <div className="p-4 flex items-center justify-between">
          <div className="text-sm font-semibold" style={{ color: VS.text0 }}>Pending Requests</div>
          <div className="text-xs" style={{ color: VS.text2 }}>{pending.length}</div>
        </div>
        {pending.length === 0
          ? <div className="p-6 text-center text-xs" style={{ color: VS.text2, borderTop: `1px solid ${VS.border}` }}>No pending requests.</div>
          : pending.map(l => <LeaveRow key={l.id} l={l} />)}
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: VS.bg1, border: `1px solid ${VS.border}` }}>
        <div className="p-4 flex items-center justify-between">
          <div className="text-sm font-semibold" style={{ color: VS.text0 }}>Approved Leaves</div>
          <div className="text-xs" style={{ color: VS.text2 }}>{approved.length}</div>
        </div>
        {approved.length === 0
          ? <div className="p-6 text-center text-xs" style={{ color: VS.text2, borderTop: `1px solid ${VS.border}` }}>No approved leaves yet.</div>
          : approved.map(l => <LeaveRow key={l.id} l={l} />)}
      </div>

      {rejected.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ background: VS.bg1, border: `1px solid ${VS.border}` }}>
          <div className="p-4 flex items-center justify-between">
            <div className="text-sm font-semibold" style={{ color: VS.text0 }}>Rejected</div>
            <div className="text-xs" style={{ color: VS.text2 }}>{rejected.length}</div>
          </div>
          {rejected.map(l => <LeaveRow key={l.id} l={l} />)}
        </div>
      )}

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-md rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            style={{ background: VS.bg1, border: `1px solid ${VS.border}`, boxShadow: '0 24px 64px rgba(0,0,0,0.7)' }}
          >
            <div>
              <h3 className="text-sm font-bold" style={{ color: VS.text0 }}>Request Leave</h3>
              <p className="text-[11px] mt-0.5" style={{ color: VS.text2 }}>Submit a request for approval.</p>
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-wider mb-1 block" style={{ color: VS.text2 }}>Type</label>
              <select
                value={form.type}
                onChange={e => setForm(p => ({ ...p, type: e.target.value as LeaveType }))}
                className="w-full px-3 py-2 rounded-lg text-xs"
                style={{ background: VS.bg2, border: `1px solid ${VS.border}`, color: VS.text0 }}
              >
                <option value="annual">Annual Leave</option>
                <option value="sick">Sick Leave</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] uppercase tracking-wider mb-1 block" style={{ color: VS.text2 }}>Start Date</label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))}
                  required
                  className="w-full px-3 py-2 rounded-lg text-xs"
                  style={{ background: VS.bg2, border: `1px solid ${VS.border}`, color: VS.text0 }}
                />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider mb-1 block" style={{ color: VS.text2 }}>End Date</label>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))}
                  required
                  className="w-full px-3 py-2 rounded-lg text-xs"
                  style={{ background: VS.bg2, border: `1px solid ${VS.border}`, color: VS.text0 }}
                />
              </div>
            </div>

            {estimatedDays > 0 && (
              <div className="text-xs" style={{ color: VS.text1 }}>
                {estimatedDays} day{estimatedDays > 1 ? 's' : ''} ·{' '}
                <span style={{ color: VS.text2 }}>
                  {form.type === 'annual'
                    ? `${remaining.annual} annual remaining`
                    : `${remaining.sick} sick remaining`}
                </span>
              </div>
            )}

            <div>
              <label className="text-[11px] uppercase tracking-wider mb-1 block" style={{ color: VS.text2 }}>Reason (optional)</label>
              <textarea
                value={form.reason}
                onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 rounded-lg text-xs resize-none"
                style={{ background: VS.bg2, border: `1px solid ${VS.border}`, color: VS.text0 }}
                placeholder="e.g. Family event, medical appointment"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 rounded-lg text-xs font-semibold"
                style={{ background: VS.bg2, color: VS.text1, border: `1px solid ${VS.border}` }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !form.startDate || !form.endDate}
                className="flex-1 px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
                style={{ background: VS.accent, color: '#fff' }}
              >
                {submitting ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
