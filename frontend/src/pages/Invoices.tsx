import { useEffect, useMemo, useState } from 'react';
import { useApiClient } from '../lib/api-client';
import { useOrganization } from '../contexts/OrganizationContext';
import { VS } from '../lib/theme';
import { FileText, Plus, RefreshCw, Check, X, Trash2, CalendarDays } from 'lucide-react';

type InvoiceStatus = 'ISSUED' | 'PAID' | 'VOID';

interface LeaveEntry { type: string; from: string; to: string; days: number; reason: string | null; }
interface Invoice {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  periodStart: string;
  periodEnd: string;
  issueDate: string;
  salary: number;
  amount: number;
  leaveDays: number;
  leaveBreakdown: LeaveEntry[];
  status: InvoiceStatus;
  notes: string | null;
  createdAt: string;
}

interface Member { id: string; name: string; email: string; salary: number; }

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n);
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDateShort(d: string) {
  return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

function StatusPill({ status }: { status: InvoiceStatus }) {
  const cfg = {
    ISSUED: { bg: `${VS.yellow}22`, color: VS.yellow, label: 'Issued' },
    PAID:   { bg: `${VS.teal}22`,   color: VS.teal,   label: 'Paid' },
    VOID:   { bg: `${VS.red}22`,    color: VS.red,    label: 'Void' },
  }[status];
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider"
      style={{ background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

export function Invoices() {
  const api = useApiClient();
  const { currentOrg } = useOrganization();
  const role = currentOrg?.role || 'STAFF';
  const isPrivileged = ['OWNER', 'ADMIN', 'HALL_OF_JUSTICE', 'ACCOUNTANT'].includes(role);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [filterStatus, setFilterStatus] = useState<InvoiceStatus | 'ALL'>('ALL');
  const [filterUser, setFilterUser] = useState<string>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const fetchInvoices = async () => {
    try {
      const d = await api.fetch('/api/invoices');
      setInvoices(d.invoices || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  const fetchMembers = async () => {
    if (!isPrivileged) return;
    try {
      const d = await api.fetch('/api/employee-profiles/all');
      setMembers((d.profiles || []).map((p: any) => ({
        id: p.userId,
        name: p.userName || p.legalName || p.userEmail,
        email: p.userEmail,
        salary: Number(p.salary || 0),
      })));
    } catch { /* ignore */ }
  };

  useEffect(() => { fetchInvoices(); fetchMembers(); }, [isPrivileged]);

  const handleGenerate = async () => {
    if (!isPrivileged) return;
    setGenerating(true);
    try {
      const r = await api.fetch('/api/invoices/generate', { method: 'POST', body: JSON.stringify({}) });
      alert(`Generated ${r.created} invoice(s). Skipped ${r.skipped} (already exist).`);
      await fetchInvoices();
    } catch {
      alert('Failed to generate invoices.');
    } finally { setGenerating(false); }
  };

  const handleUpdateStatus = async (id: string, status: InvoiceStatus) => {
    try {
      await api.fetch(`/api/invoices/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setInvoices(prev => prev.map(i => i.id === id ? { ...i, status } : i));
    } catch { alert('Failed to update.'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this invoice?')) return;
    try {
      await api.fetch(`/api/invoices/${id}`, { method: 'DELETE' });
      setInvoices(prev => prev.filter(i => i.id !== id));
      setSelectedId(null);
    } catch { alert('Failed to delete.'); }
  };

  const filtered = useMemo(() => invoices.filter(i =>
    (filterStatus === 'ALL' || i.status === filterStatus) &&
    (filterUser === 'ALL' || i.userId === filterUser)
  ), [invoices, filterStatus, filterUser]);

  const selected = selectedId ? invoices.find(i => i.id === selectedId) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-6 h-6 rounded-full animate-spin" style={{ border: `2px solid ${VS.border}`, borderTopColor: VS.accent }} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: VS.text0 }}>
            <FileText className="h-5 w-5" style={{ color: VS.accent }} />
            Invoices
          </h1>
          <p className="text-xs mt-1" style={{ color: VS.text2 }}>
            Bi-weekly payroll · 1st–15th and 16th–end of month · Salary split in half per period.
          </p>
        </div>
        {isPrivileged && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold"
              style={{ background: VS.bg2, border: `1px solid ${VS.border}`, color: VS.text1 }}>
              <Plus className="h-4 w-4" /> Manual Invoice
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
              style={{ background: VS.accent, color: '#fff' }}>
              <RefreshCw className={`h-4 w-4 ${generating ? 'animate-spin' : ''}`} />
              {generating ? 'Generating…' : 'Generate Current Period'}
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      {isPrivileged && (
        <div className="flex flex-wrap items-center gap-3">
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)}
            className="px-3 py-2 rounded-lg text-xs"
            style={{ background: VS.bg2, border: `1px solid ${VS.border}`, color: VS.text0 }}>
            <option value="ALL">All Status</option>
            <option value="ISSUED">Issued</option>
            <option value="PAID">Paid</option>
            <option value="VOID">Void</option>
          </select>
          <select value={filterUser} onChange={e => setFilterUser(e.target.value)}
            className="px-3 py-2 rounded-lg text-xs"
            style={{ background: VS.bg2, border: `1px solid ${VS.border}`, color: VS.text0 }}>
            <option value="ALL">All Members</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ background: VS.bg1, border: `1px solid ${VS.border}` }}>
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-xs" style={{ color: VS.text2 }}>
            No invoices{filterStatus !== 'ALL' || filterUser !== 'ALL' ? ' match the current filters' : ' yet'}.
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: VS.bg2, borderBottom: `1px solid ${VS.border}` }}>
                <th className="px-4 py-2.5 text-left font-semibold uppercase tracking-wider text-[10px]" style={{ color: VS.text2 }}>Employee</th>
                <th className="px-4 py-2.5 text-left font-semibold uppercase tracking-wider text-[10px]" style={{ color: VS.text2 }}>Period</th>
                <th className="px-4 py-2.5 text-right font-semibold uppercase tracking-wider text-[10px]" style={{ color: VS.text2 }}>Salary</th>
                <th className="px-4 py-2.5 text-right font-semibold uppercase tracking-wider text-[10px]" style={{ color: VS.text2 }}>Amount</th>
                <th className="px-4 py-2.5 text-center font-semibold uppercase tracking-wider text-[10px]" style={{ color: VS.text2 }}>Leave</th>
                <th className="px-4 py-2.5 text-center font-semibold uppercase tracking-wider text-[10px]" style={{ color: VS.text2 }}>Status</th>
                <th className="px-4 py-2.5 text-right font-semibold uppercase tracking-wider text-[10px]" style={{ color: VS.text2 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => (
                <tr key={inv.id} className="cursor-pointer"
                  onClick={() => setSelectedId(inv.id)}
                  style={{ borderBottom: `1px solid ${VS.border}` }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = VS.bg2}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                  <td className="px-4 py-2.5">
                    <div className="font-semibold" style={{ color: VS.text0 }}>{inv.userName || inv.userEmail}</div>
                    {inv.userName && <div className="text-[11px]" style={{ color: VS.text2 }}>{inv.userEmail}</div>}
                  </td>
                  <td className="px-4 py-2.5" style={{ color: VS.text1 }}>
                    {fmtDateShort(inv.periodStart)} → {fmtDateShort(inv.periodEnd)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: VS.text2 }}>{fmtCurrency(inv.salary)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold" style={{ color: VS.text0 }}>{fmtCurrency(inv.amount)}</td>
                  <td className="px-4 py-2.5 text-center">
                    {inv.leaveDays > 0 ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                        style={{ background: `${VS.purple}22`, color: VS.purple }}>
                        {inv.leaveDays} day{inv.leaveDays > 1 ? 's' : ''}
                      </span>
                    ) : <span style={{ color: VS.text2 }}>—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-center"><StatusPill status={inv.status} /></td>
                  <td className="px-4 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                    {isPrivileged && (
                      <div className="flex gap-1 justify-end">
                        {inv.status !== 'PAID' && (
                          <button onClick={() => handleUpdateStatus(inv.id, 'PAID')}
                            className="p-1 rounded"
                            style={{ color: VS.teal }}
                            title="Mark as paid">
                            <Check className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {inv.status !== 'VOID' && (
                          <button onClick={() => handleUpdateStatus(inv.id, 'VOID')}
                            className="p-1 rounded"
                            style={{ color: VS.red }}
                            title="Void">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button onClick={() => handleDelete(inv.id)}
                          className="p-1 rounded"
                          style={{ color: VS.text2 }}
                          title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail modal */}
      {selected && <DetailModal invoice={selected} onClose={() => setSelectedId(null)} />}

      {/* Create modal */}
      {showCreate && (
        <CreateModal
          members={members}
          onClose={() => setShowCreate(false)}
          onCreated={fetchInvoices}
        />
      )}
    </div>
  );
}

// ── Detail Modal ─────────────────────────────────────────────────────────────
function DetailModal({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden max-h-[90vh] flex flex-col"
        style={{ background: VS.bg1, border: `1px solid ${VS.border}`, boxShadow: '0 24px 64px rgba(0,0,0,0.7)' }}>

        <div className="px-5 py-4 flex items-center justify-between"
          style={{ background: VS.bg2, borderBottom: `1px solid ${VS.border}` }}>
          <div>
            <div className="text-[10px] uppercase tracking-widest" style={{ color: VS.text2 }}>Invoice</div>
            <div className="text-sm font-bold" style={{ color: VS.text0 }}>{invoice.userName || invoice.userEmail}</div>
          </div>
          <StatusPill status={invoice.status} />
        </div>

        <div className="p-5 space-y-5 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: VS.text2 }}>Period</div>
              <div className="text-sm" style={{ color: VS.text0 }}>{fmtDate(invoice.periodStart)}</div>
              <div className="text-xs" style={{ color: VS.text2 }}>→ {fmtDate(invoice.periodEnd)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: VS.text2 }}>Issue Date</div>
              <div className="text-sm" style={{ color: VS.text0 }}>{fmtDate(invoice.issueDate)}</div>
            </div>
          </div>

          <div className="rounded-lg p-4 space-y-2" style={{ background: VS.bg2, border: `1px solid ${VS.border}` }}>
            <div className="flex justify-between items-center">
              <span className="text-xs" style={{ color: VS.text2 }}>Monthly Salary</span>
              <span className="text-sm tabular-nums" style={{ color: VS.text1 }}>{fmtCurrency(invoice.salary)}</span>
            </div>
            <div className="flex justify-between items-center pt-2" style={{ borderTop: `1px solid ${VS.border}` }}>
              <span className="text-xs font-semibold" style={{ color: VS.text0 }}>Amount Due (½ month)</span>
              <span className="text-lg font-bold tabular-nums" style={{ color: VS.accent }}>{fmtCurrency(invoice.amount)}</span>
            </div>
          </div>

          {invoice.leaveBreakdown.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-widest mb-2 flex items-center gap-1.5" style={{ color: VS.purple }}>
                <CalendarDays className="h-3 w-3" /> Leave in this period
              </div>
              <div className="space-y-1.5">
                {invoice.leaveBreakdown.map((l, i) => (
                  <div key={i} className="flex justify-between items-center px-3 py-2 rounded-lg text-xs"
                    style={{ background: `${VS.purple}11`, border: `1px solid ${VS.purple}33` }}>
                    <div>
                      <span className="capitalize font-semibold" style={{ color: VS.purple }}>{l.type}</span>
                      <span className="ml-2" style={{ color: VS.text1 }}>{fmtDateShort(l.from)} → {fmtDateShort(l.to)}</span>
                      {l.reason && <span className="ml-2 italic" style={{ color: VS.text2 }}>· {l.reason}</span>}
                    </div>
                    <span className="font-semibold tabular-nums" style={{ color: VS.purple }}>{l.days}d</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] italic mt-2" style={{ color: VS.text2 }}>
                Leave is shown for reference — no deduction applied to the invoice amount.
              </p>
            </div>
          )}

          {invoice.notes && (
            <div>
              <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: VS.text2 }}>Notes</div>
              <div className="text-xs" style={{ color: VS.text1 }}>{invoice.notes}</div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 flex justify-end" style={{ borderTop: `1px solid ${VS.border}` }}>
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-semibold"
            style={{ background: VS.bg2, border: `1px solid ${VS.border}`, color: VS.text1 }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Create Modal ─────────────────────────────────────────────────────────────
function CreateModal({ members, onClose, onCreated }: {
  members: Member[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const api = useApiClient();
  const today = new Date();
  const y = today.getUTCFullYear(), m = today.getUTCMonth(), d = today.getUTCDate();
  const defaultStart = d <= 15 ? new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10) : new Date(Date.UTC(y, m, 16)).toISOString().slice(0, 10);
  const defaultEnd   = d <= 15 ? new Date(Date.UTC(y, m, 15)).toISOString().slice(0, 10) : new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);

  const [userId, setUserId] = useState(members[0]?.id || '');
  const [periodStart, setStart] = useState(defaultStart);
  const [periodEnd, setEnd] = useState(defaultEnd);
  const [salary, setSalary] = useState(members[0]?.salary || 0);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const m = members.find(x => x.id === userId);
    if (m) setSalary(m.salary);
  }, [userId, members]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.fetch('/api/invoices', {
        method: 'POST',
        body: JSON.stringify({
          userId, periodStart, periodEnd,
          salary,
          amount: +(salary / 2).toFixed(2),
          notes: notes || null,
        }),
      });
      onCreated();
      onClose();
    } catch {
      alert('Failed to create invoice.');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <form onSubmit={submit}
        className="w-full max-w-md rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        style={{ background: VS.bg1, border: `1px solid ${VS.border}`, boxShadow: '0 24px 64px rgba(0,0,0,0.7)' }}>
        <div>
          <h3 className="text-sm font-bold" style={{ color: VS.text0 }}>Manual Invoice</h3>
          <p className="text-[11px] mt-0.5" style={{ color: VS.text2 }}>Create an invoice outside the bi-weekly schedule.</p>
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-wider mb-1 block" style={{ color: VS.text2 }}>Employee</label>
          <select value={userId} onChange={e => setUserId(e.target.value)} required
            className="w-full px-3 py-2 rounded-lg text-xs"
            style={{ background: VS.bg2, border: `1px solid ${VS.border}`, color: VS.text0 }}>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] uppercase tracking-wider mb-1 block" style={{ color: VS.text2 }}>Period Start</label>
            <input type="date" value={periodStart} onChange={e => setStart(e.target.value)} required
              className="w-full px-3 py-2 rounded-lg text-xs"
              style={{ background: VS.bg2, border: `1px solid ${VS.border}`, color: VS.text0 }} />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider mb-1 block" style={{ color: VS.text2 }}>Period End</label>
            <input type="date" value={periodEnd} onChange={e => setEnd(e.target.value)} required
              className="w-full px-3 py-2 rounded-lg text-xs"
              style={{ background: VS.bg2, border: `1px solid ${VS.border}`, color: VS.text0 }} />
          </div>
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-wider mb-1 block" style={{ color: VS.text2 }}>Monthly Salary</label>
          <input type="number" step="0.01" value={salary} onChange={e => setSalary(parseFloat(e.target.value) || 0)}
            className="w-full px-3 py-2 rounded-lg text-xs"
            style={{ background: VS.bg2, border: `1px solid ${VS.border}`, color: VS.text0 }} />
          <div className="text-[11px] mt-1" style={{ color: VS.text2 }}>
            Invoice amount will be {fmtCurrency(salary / 2)} (½ month).
          </div>
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-wider mb-1 block" style={{ color: VS.text2 }}>Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            className="w-full px-3 py-2 rounded-lg text-xs resize-none"
            style={{ background: VS.bg2, border: `1px solid ${VS.border}`, color: VS.text0 }} />
        </div>

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg text-xs font-semibold"
            style={{ background: VS.bg2, color: VS.text1, border: `1px solid ${VS.border}` }}>
            Cancel
          </button>
          <button type="submit" disabled={saving || !userId}
            className="flex-1 px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
            style={{ background: VS.accent, color: '#fff' }}>
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}
