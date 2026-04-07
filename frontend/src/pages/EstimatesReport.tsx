import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from '../lib/auth-client';
import { useOrganization } from '../contexts/OrganizationContext';
import { useApiClient } from '../lib/api-client';
import {
  Clock, Target, TrendingUp, TrendingDown, AlertTriangle,
  BarChart3, Download, ChevronDown, Search,
} from 'lucide-react';
import { VS } from '../lib/theme';
import { exportCSV, exportPDF } from '../lib/export-utils';

// ── Types ────────────────────────────────────────────────────────────────────
interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  estimatedHours: number;
  actualHours: number;
  projectId?: string;
  project?: string;
  userId: string;
  assignees?: { id: string; name: string; email: string }[];
  dueDate?: string;
  completedAt?: string;
  createdAt: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtH(h: number): string {
  if (!h) return '0h';
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

function variancePct(est: number, act: number): number | null {
  if (!est) return null;
  return Math.round(((act - est) / est) * 100);
}

function accuracyPct(est: number, act: number): number {
  if (!est && !act) return 100;
  if (!est) return 0;
  return Math.max(0, Math.round((1 - Math.abs(act - est) / est) * 100));
}

// ── Component ────────────────────────────────────────────────────────────────
export function EstimatesReport() {
  const { data: session } = useSession();
  const { currentOrg } = useOrganization();
  const apiClient = useApiClient();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupBy, setGroupBy] = useState<'task' | 'project' | 'assignee'>('task');
  const [filterStatus, setFilterStatus] = useState<'all' | 'completed' | 'active'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showExport, setShowExport] = useState(false);

  const fetchTasks = useCallback(async () => {
    if (!session?.user?.id || !currentOrg?.id) return;
    try {
      setLoading(true);
      const data = await apiClient.fetch('/api/tasks?limit=500');
      if (data.success) {
        setTasks((data.tasks || []).filter((t: Task) => t.estimatedHours > 0 || t.actualHours > 0));
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [session?.user?.id, currentOrg?.id]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return tasks.filter(t => {
      if (filterStatus === 'completed' && t.status !== 'completed') return false;
      if (filterStatus === 'active' && (t.status === 'completed' || t.status === 'cancelled')) return false;
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        return t.title.toLowerCase().includes(s) || (t.project || '').toLowerCase().includes(s);
      }
      return true;
    });
  }, [tasks, filterStatus, searchTerm]);

  // ── Summary stats ──────────────────────────────────────────────────────────
  const totalEst = filtered.reduce((s, t) => s + (t.estimatedHours || 0), 0);
  const totalAct = filtered.reduce((s, t) => s + (t.actualHours || 0), 0);
  const totalVariance = totalAct - totalEst;
  const avgAccuracy = filtered.length > 0
    ? Math.round(filtered.reduce((s, t) => s + accuracyPct(t.estimatedHours, t.actualHours), 0) / filtered.length)
    : 0;
  const overEstimated = filtered.filter(t => t.actualHours < t.estimatedHours * 0.8).length;
  const underEstimated = filtered.filter(t => t.actualHours > t.estimatedHours * 1.2).length;

  // ── Grouped data ───────────────────────────────────────────────────────────
  const grouped = useMemo(() => {
    if (groupBy === 'task') return null; // show flat table

    const map = new Map<string, { label: string; est: number; act: number; count: number }>();
    for (const t of filtered) {
      let key: string, label: string;
      if (groupBy === 'project') {
        key = t.projectId || '__none__';
        label = t.project || 'No Project';
      } else {
        const a = t.assignees?.[0];
        key = a?.id || t.userId || '__none__';
        label = a?.name || a?.email || 'Unassigned';
      }
      const existing = map.get(key) || { label, est: 0, act: 0, count: 0 };
      existing.est += t.estimatedHours || 0;
      existing.act += t.actualHours || 0;
      existing.count++;
      map.set(key, existing);
    }
    return [...map.values()].sort((a, b) => b.act - a.act);
  }, [filtered, groupBy]);

  // ── Export ─────────────────────────────────────────────────────────────────
  const headers = groupBy === 'task'
    ? ['Task', 'Project', 'Status', 'Priority', 'Estimated', 'Actual', 'Variance', 'Accuracy']
    : [groupBy === 'project' ? 'Project' : 'Assignee', 'Tasks', 'Estimated', 'Actual', 'Variance', 'Accuracy'];

  const exportRows = () => {
    if (groupBy === 'task') {
      return filtered.map(t => [
        t.title, t.project || '—', t.status, t.priority,
        fmtH(t.estimatedHours), fmtH(t.actualHours),
        `${variancePct(t.estimatedHours, t.actualHours) ?? '—'}%`,
        `${accuracyPct(t.estimatedHours, t.actualHours)}%`,
      ]);
    }
    return (grouped || []).map(g => [
      g.label, String(g.count), fmtH(g.est), fmtH(g.act),
      `${variancePct(g.est, g.act) ?? '—'}%`,
      `${accuracyPct(g.est, g.act)}%`,
    ]);
  };

  const handleExportCSV = () => { exportCSV([headers, ...exportRows()], `estimates-vs-actuals.csv`); setShowExport(false); };
  const handleExportPDF = () => {
    exportPDF({
      title: 'Estimates vs Actuals Report',
      subtitle: `${currentOrg?.name || 'Organization'} · ${filtered.length} tasks`,
      filename: `estimates-vs-actuals.pdf`,
      headers, rows: exportRows(),
      summaryCards: [
        { label: 'Estimated', value: fmtH(totalEst) },
        { label: 'Actual', value: fmtH(totalAct) },
        { label: 'Variance', value: `${totalVariance >= 0 ? '+' : ''}${fmtH(Math.abs(totalVariance))}` },
        { label: 'Accuracy', value: `${avgAccuracy}%` },
      ],
      orientation: 'landscape',
    });
    setShowExport(false);
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 rounded-lg w-64" style={{ background: VS.bg2 }} />
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
            {[...Array(6)].map((_, i) => <div key={i} className="h-24 rounded-xl" style={{ background: VS.bg1 }} />)}
          </div>
          <div className="h-64 rounded-xl" style={{ background: VS.bg1 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: VS.text0 }}>Estimates vs Actuals</h1>
          <p className="text-[12px] mt-0.5" style={{ color: VS.text2 }}>
            Compare estimated hours with actual time spent across tasks
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Export */}
          <div className="relative">
            <button onClick={() => setShowExport(v => !v)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] font-semibold"
              style={{ background: `${VS.accent}18`, color: VS.accent, border: `1px solid ${VS.accent}33` }}>
              <Download className="h-3.5 w-3.5" /> Export <ChevronDown className="h-3 w-3" />
            </button>
            {showExport && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowExport(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 rounded-lg overflow-hidden shadow-xl"
                  style={{ background: VS.bg0, border: `1px solid ${VS.border2}`, minWidth: 160 }}>
                  <button onClick={handleExportCSV}
                    className="flex items-center gap-2.5 w-full px-4 py-2.5 text-left text-[12px] font-medium hover:opacity-80"
                    style={{ color: VS.text0, borderBottom: `1px solid ${VS.border}` }}>
                    Export as CSV
                  </button>
                  <button onClick={handleExportPDF}
                    className="flex items-center gap-2.5 w-full px-4 py-2.5 text-left text-[12px] font-medium hover:opacity-80"
                    style={{ color: VS.text0 }}>
                    Export as PDF
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'Estimated', value: fmtH(totalEst), icon: Target, color: VS.blue },
          { label: 'Actual', value: fmtH(totalAct), icon: Clock, color: VS.teal },
          { label: 'Variance', value: `${totalVariance >= 0 ? '+' : ''}${fmtH(Math.abs(totalVariance))}`, icon: totalVariance > 0 ? TrendingUp : TrendingDown, color: totalVariance > 0 ? VS.red : VS.teal },
          { label: 'Accuracy', value: `${avgAccuracy}%`, icon: BarChart3, color: avgAccuracy >= 80 ? VS.teal : avgAccuracy >= 60 ? VS.yellow : VS.red },
          { label: 'Over-Estimated', value: String(overEstimated), icon: TrendingDown, color: VS.yellow },
          { label: 'Under-Estimated', value: String(underEstimated), icon: AlertTriangle, color: VS.red },
        ].map(card => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-xl p-4" style={{ background: VS.bg1, border: `1px solid ${VS.border}` }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: VS.text2 }}>{card.label}</span>
                <Icon className="h-4 w-4" style={{ color: card.color }} />
              </div>
              <div className="text-xl font-bold tabular-nums" style={{ color: card.color }}>{card.value}</div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: VS.text2 }} />
          <input type="text" placeholder="Search tasks..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            className="pl-8 pr-3 py-1.5 rounded text-[12px] focus:outline-none"
            style={{ background: VS.bg3, border: `1px solid ${VS.border}`, color: VS.text0, width: 180 }} />
        </div>
        <div className="flex items-center gap-1 rounded-lg overflow-hidden" style={{ border: `1px solid ${VS.border}` }}>
          {(['all', 'completed', 'active'] as const).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className="px-3 py-1.5 text-[11px] font-semibold capitalize"
              style={filterStatus === s ? { background: VS.accent, color: '#fff' } : { background: VS.bg3, color: VS.text2 }}>
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-lg overflow-hidden" style={{ border: `1px solid ${VS.border}` }}>
          {(['task', 'project', 'assignee'] as const).map(g => (
            <button key={g} onClick={() => setGroupBy(g)}
              className="px-3 py-1.5 text-[11px] font-semibold capitalize"
              style={groupBy === g ? { background: VS.accent, color: '#fff' } : { background: VS.bg3, color: VS.text2 }}>
              {g === 'task' ? 'By Task' : g === 'project' ? 'By Project' : 'By Assignee'}
            </button>
          ))}
        </div>
        <span className="text-[11px] ml-auto" style={{ color: VS.text2 }}>{filtered.length} tasks</span>
      </div>

      {/* Variance bar (visual) */}
      {totalEst > 0 && (
        <div className="rounded-xl p-5" style={{ background: VS.bg1, border: `1px solid ${VS.border}` }}>
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="h-4 w-4" style={{ color: VS.accent }} />
            <h2 className="text-[13px] font-bold" style={{ color: VS.text0 }}>Overall Variance</h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex justify-between text-[11px] mb-1">
                <span style={{ color: VS.blue }}>Estimated: {fmtH(totalEst)}</span>
                <span style={{ color: VS.teal }}>Actual: {fmtH(totalAct)}</span>
              </div>
              <div className="relative h-6 rounded-full overflow-hidden" style={{ background: VS.bg2 }}>
                <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, (totalEst / Math.max(totalEst, totalAct)) * 100)}%`, background: `${VS.blue}55` }} />
                <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, (totalAct / Math.max(totalEst, totalAct)) * 100)}%`, background: `${VS.teal}55`, borderRight: `2px solid ${VS.teal}` }} />
              </div>
              <div className="flex justify-between text-[10px] mt-1" style={{ color: VS.text2 }}>
                <span>0h</span>
                <span>{fmtH(Math.max(totalEst, totalAct))}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Data table */}
      <div className="rounded-xl overflow-hidden" style={{ background: VS.bg1, border: `1px solid ${VS.border}` }}>
        <table className="w-full text-[12px]">
          <thead>
            <tr style={{ borderBottom: `1px solid ${VS.border}`, background: VS.bg2 }}>
              {headers.map(h => (
                <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: VS.text2 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groupBy === 'task' ? (
              filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center" style={{ color: VS.text2 }}>No tasks with time estimates found</td></tr>
              ) : filtered.map((t, i) => {
                const vPct = variancePct(t.estimatedHours, t.actualHours);
                const acc = accuracyPct(t.estimatedHours, t.actualHours);
                const isOver = t.actualHours > t.estimatedHours * 1.2;
                const isUnder = t.actualHours < t.estimatedHours * 0.8;
                return (
                  <tr key={t.id} style={{ background: i % 2 === 0 ? 'transparent' : `${VS.bg2}44`, borderBottom: `1px solid ${VS.border}22` }}>
                    <td className="px-4 py-3 font-medium" style={{ color: VS.text0, maxWidth: 200 }}>
                      <div className="truncate">{t.title}</div>
                    </td>
                    <td className="px-4 py-3" style={{ color: VS.text2 }}>{t.project || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                        style={{
                          background: t.status === 'completed' ? `${VS.teal}18` : `${VS.blue}18`,
                          color: t.status === 'completed' ? VS.teal : VS.blue,
                        }}>
                        {t.status === 'completed' ? 'Done' : t.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3" style={{ color: VS.text1 }}>{t.priority}</td>
                    <td className="px-4 py-3 tabular-nums font-medium" style={{ color: VS.blue }}>{fmtH(t.estimatedHours)}</td>
                    <td className="px-4 py-3 tabular-nums font-medium" style={{ color: VS.teal }}>{fmtH(t.actualHours)}</td>
                    <td className="px-4 py-3 tabular-nums font-semibold" style={{ color: isOver ? VS.red : isUnder ? VS.yellow : VS.text1 }}>
                      {vPct !== null ? `${vPct >= 0 ? '+' : ''}${vPct}%` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1.5 rounded-full overflow-hidden" style={{ background: VS.bg2 }}>
                          <div className="h-full rounded-full" style={{ width: `${acc}%`, background: acc >= 80 ? VS.teal : acc >= 60 ? VS.yellow : VS.red }} />
                        </div>
                        <span className="tabular-nums" style={{ color: acc >= 80 ? VS.teal : acc >= 60 ? VS.yellow : VS.red }}>{acc}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              !grouped || grouped.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center" style={{ color: VS.text2 }}>No data</td></tr>
              ) : grouped.map((g, i) => {
                const vPct = variancePct(g.est, g.act);
                const acc = accuracyPct(g.est, g.act);
                const isOver = g.act > g.est * 1.2;
                return (
                  <tr key={g.label} style={{ background: i % 2 === 0 ? 'transparent' : `${VS.bg2}44`, borderBottom: `1px solid ${VS.border}22` }}>
                    <td className="px-4 py-3 font-medium" style={{ color: VS.text0 }}>{g.label}</td>
                    <td className="px-4 py-3 tabular-nums" style={{ color: VS.text1 }}>{g.count}</td>
                    <td className="px-4 py-3 tabular-nums font-medium" style={{ color: VS.blue }}>{fmtH(g.est)}</td>
                    <td className="px-4 py-3 tabular-nums font-medium" style={{ color: VS.teal }}>{fmtH(g.act)}</td>
                    <td className="px-4 py-3 tabular-nums font-semibold" style={{ color: isOver ? VS.red : VS.text1 }}>
                      {vPct !== null ? `${vPct >= 0 ? '+' : ''}${vPct}%` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: VS.bg2 }}>
                          <div className="h-full rounded-full" style={{ width: `${acc}%`, background: acc >= 80 ? VS.teal : acc >= 60 ? VS.yellow : VS.red }} />
                        </div>
                        <span className="tabular-nums" style={{ color: acc >= 80 ? VS.teal : acc >= 60 ? VS.yellow : VS.red }}>{acc}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
