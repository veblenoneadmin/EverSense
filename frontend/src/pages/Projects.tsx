import { useState, useEffect, useRef } from 'react';
import { useSession } from '../lib/auth-client';
import { useApiClient } from '../lib/api-client';
import { useOrganization } from '../contexts/OrganizationContext';
import {
  Building2,
  Plus,
  Calendar,
  Clock,
  Target,
  AlertCircle,
  CheckCircle2,
  MoreHorizontal,
  Activity,
  Edit3,
  Trash2,
  CheckSquare,
  Zap,
  Eye,
  X,
  User,
  ChevronRight,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import { ProjectModal } from '../components/ProjectModal';
import GanttChart from '../components/GanttChart';
import { LayoutList, GanttChartSquare, Paperclip, Upload, Download, FileText, Image, File as FileIcon, Flag, Plus as PlusIcon } from 'lucide-react';

import { VS } from '../lib/theme';

const PROJECT_STATUS: Record<string, { label: string; accent: string; bg: string; text: string }> = {
  planning:  { label: 'Planning',  accent: VS.blue,   bg: 'rgba(86,156,214,0.12)',  text: VS.blue   },
  active:    { label: 'Active',    accent: VS.teal,   bg: 'rgba(78,201,176,0.12)',  text: VS.teal   },
  on_hold:   { label: 'On Hold',   accent: VS.red,    bg: 'rgba(244,71,71,0.12)',   text: VS.red    },
  completed: { label: 'Completed', accent: VS.green,  bg: 'rgba(106,153,85,0.12)',  text: VS.green  },
  cancelled: { label: 'Cancelled', accent: VS.orange, bg: 'rgba(206,145,120,0.12)', text: VS.orange },
};

const PROJECT_PRIORITY: Record<string, { label: string; text: string; border: string }> = {
  high:   { label: 'HIGH', text: VS.red,    border: VS.red    },
  medium: { label: 'MED',  text: VS.yellow, border: VS.yellow },
  low:    { label: 'LOW',  text: VS.teal,   border: VS.teal   },
};

const TASK_STATUS: Record<string, { label: string; color: string }> = {
  not_started: { label: 'To Do',       color: VS.text2  },
  in_progress: { label: 'In Progress', color: VS.blue   },
  on_hold:     { label: 'On Hold',     color: VS.orange },
  completed:   { label: 'Done',        color: VS.green  },
  cancelled:   { label: 'Cancelled',   color: VS.red    },
};

const TASK_PRIORITY: Record<string, { label: string; color: string }> = {
  High:   { label: 'HIGH', color: VS.red    },
  Medium: { label: 'MED',  color: VS.yellow },
  Low:    { label: 'LOW',  color: VS.teal   },
};

interface DatabaseProject {
  id: string;
  name: string;
  description: string | null;
  status: 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled';
  priority: 'high' | 'medium' | 'low';
  client?: { id: string; name: string; email: string } | null;
  clientId?: string | null;
  clientName?: string | null;
  startDate: string | null;
  endDate: string | null;
  budget: number | null;
  spent: number;
  progress: number;
  estimatedHours: number;
  hoursLogged: number;
  color: string;
  createdAt: string;
  updatedAt: string;
  orgId: string;
  teamMembers?: string[];
  tasks?: { total: number; completed: number; inProgress: number; pending: number };
  tags?: string[];
}

interface OverviewTask {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  estimatedHours: number;
  actualHours?: number;
  createdAt?: string;
  dueDate?: string;
  requiredSkills: string[];
  assignee: {
    userId: string;
    name: string;
    email: string;
    image: string | null;
    workload?: number;
    skillScore?: number;
    topSkillName?: string | null;
    topSkillLevel?: number;
  } | null;
}

const parseClientFromDescription = (description: string | null): string | null => {
  if (!description) return null;
  const match = description.match(/^CLIENT:([^|]+)\|DESC:/);
  return match ? match[1] : null;
};

const parseDescriptionFromCombined = (description: string | null): string => {
  if (!description) return '';
  const match = description.match(/^CLIENT:[^|]+\|DESC:(.*)$/);
  return match ? match[1] : description;
};

function fmtDate(dateStr: string | null) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'active':    return <Activity className="h-4 w-4" />;
    case 'completed': return <CheckCircle2 className="h-4 w-4" />;
    case 'on_hold':   return <AlertCircle className="h-4 w-4" />;
    case 'planning':  return <Target className="h-4 w-4" />;
    default:          return <Building2 className="h-4 w-4" />;
  }
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

const inputCls = 'px-3 py-1.5 rounded text-xs focus:outline-none focus:ring-1 focus:ring-[#007acc]/50 transition-all';
const inputStyle: React.CSSProperties = { background: VS.bg3, border: `1px solid ${VS.border}`, color: VS.text1 };

// ── Overview Modal ─────────────────────────────────────────────────────────────
function OverviewModal({
  project,
  tasks,
  loading,
  onClose,
  onRegenerate,
  regenerating,
}: {
  project: DatabaseProject;
  tasks: OverviewTask[];
  loading: boolean;
  onClose: () => void;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  const [overviewTab, setOverviewTab] = useState<'list' | 'gantt' | 'milestones' | 'files'>('list');
  const apiClient = useApiClient();
  const sCfg = PROJECT_STATUS[project.status] || PROJECT_STATUS.planning;

  // Milestones
  interface MilestoneTask { id: string; title: string; status: string; priority: string; milestoneId: string | null; assigneeName: string | null; assigneeEmail: string | null }
  interface Milestone { id: string; name: string; description: string | null; dueDate: string | null; status: string; sortOrder: number; createdAt: string; tasks: MilestoneTask[] }
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [milestonesLoading, setMilestonesLoading] = useState(false);
  const [newMilestone, setNewMilestone] = useState({ name: '', description: '', dueDate: '' });
  const [addingMilestone, setAddingMilestone] = useState(false);
  const [showAddMilestone, setShowAddMilestone] = useState(false);
  const [expandedMilestoneId, setExpandedMilestoneId] = useState<string | null>(null);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragOverMilestoneId, setDragOverMilestoneId] = useState<string | null>(null);

  // Derive unassigned tasks from the tasks prop (same data as List tab)
  const assignedTaskIds = new Set(milestones.flatMap(m => m.tasks.map(t => t.id)));
  const unassignedTasks = tasks.filter(t => !assignedTaskIds.has(t.id));

  const fetchMilestones = async () => {
    setMilestonesLoading(true);
    try {
      const data = await apiClient.fetch(`/api/projects/${project.id}/milestones`);
      if (data.success) setMilestones(data.milestones || []);
    } catch (e: any) { console.error('[Milestones] fetch error:', e.message); }
    finally { setMilestonesLoading(false); }
  };

  const handleAssignTask = async (taskId: string, milestoneId: string) => {
    console.log('[Milestones] Assigning task', taskId, 'to milestone', milestoneId);
    try {
      const res = await apiClient.fetch(`/api/projects/${project.id}/milestones/${milestoneId}/tasks`, {
        method: 'PATCH',
        body: JSON.stringify({ taskId, action: 'assign' }),
      });
      console.log('[Milestones] Assign result:', res);
      if (res.success) fetchMilestones();
      else console.error('Assign failed:', res.error);
    } catch (e: any) { console.error('Assign error:', e.message); }
  };

  const handleUnassignTask = async (taskId: string, milestoneId: string) => {
    try {
      const res = await apiClient.fetch(`/api/projects/${project.id}/milestones/${milestoneId}/tasks`, {
        method: 'PATCH',
        body: JSON.stringify({ taskId, action: 'unassign' }),
      });
      if (res.success) fetchMilestones();
      else console.error('Unassign failed:', res.error);
    } catch (e: any) { console.error('Unassign error:', e.message); }
  };

  const handleDeleteProjectTask = async (taskId: string) => {
    if (!confirm('Delete this task?')) return;
    try {
      await apiClient.fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
      fetchMilestones();
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (overviewTab === 'milestones') fetchMilestones();
  }, [overviewTab, project.id]);

  const handleAddMilestone = async () => {
    if (!newMilestone.name.trim()) return;
    setAddingMilestone(true);
    try {
      await apiClient.fetch(`/api/projects/${project.id}/milestones`, {
        method: 'POST',
        body: JSON.stringify({
          name: newMilestone.name.trim(),
          description: newMilestone.description || null,
          dueDate: newMilestone.dueDate ? new Date(newMilestone.dueDate + 'T00:00:00.000Z').toISOString() : null,
          sortOrder: milestones.length,
        }),
      });
      setNewMilestone({ name: '', description: '', dueDate: '' });
      setShowAddMilestone(false);
      fetchMilestones();
    } catch { /* ignore */ }
    finally { setAddingMilestone(false); }
  };

  const handleToggleMilestone = async (ms: Milestone) => {
    const newStatus = ms.status === 'completed' ? 'active' : 'completed';
    try {
      await apiClient.fetch(`/api/projects/${project.id}/milestones/${ms.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      setMilestones(prev => prev.map(m => m.id === ms.id ? { ...m, status: newStatus } : m));
    } catch { /* ignore */ }
  };

  const handleDeleteMilestone = async (id: string) => {
    try {
      await apiClient.fetch(`/api/projects/${project.id}/milestones/${id}`, { method: 'DELETE' });
      setMilestones(prev => prev.filter(m => m.id !== id));
    } catch { /* ignore */ }
  };

  // Project files
  const [files, setFiles] = useState<{ id: string; name: string; mimeType: string; size: number; category: string; createdAt: string; userId: string; userName: string; userEmail: string }[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = async () => {
    setFilesLoading(true);
    try {
      const data = await apiClient.fetch(`/api/projects/${project.id}/files`);
      if (data.success) setFiles(data.files || []);
    } catch { /* ignore */ }
    finally { setFilesLoading(false); }
  };

  useEffect(() => {
    if (overviewTab === 'files') fetchFiles();
  }, [overviewTab, project.id]);

  const handleFileUpload = async (fileList: FileList | null) => {
    if (!fileList) return;
    setUploading(true);
    try {
      for (const file of Array.from(fileList)) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.includes(',') ? result.split(',')[1] : result);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        await apiClient.fetch(`/api/projects/${project.id}/files`, {
          method: 'POST',
          body: JSON.stringify({ name: file.name, mimeType: file.type, size: file.size, data: base64 }),
        });
      }
      fetchFiles();
    } catch { /* ignore */ }
    finally { setUploading(false); }
  };

  const handleFileDownload = async (fileId: string, fileName: string) => {
    try {
      const data = await apiClient.fetch(`/api/projects/${project.id}/files/${fileId}/download`);
      if (data.success && data.file?.data) {
        const byteChars = atob(data.file.data);
        const byteArray = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
        const blob = new Blob([byteArray], { type: data.file.mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = fileName; a.click();
        URL.revokeObjectURL(url);
      }
    } catch { /* ignore */ }
  };

  const handleFileDelete = async (fileId: string) => {
    try {
      await apiClient.fetch(`/api/projects/${project.id}/files/${fileId}`, { method: 'DELETE' });
      setFiles(f => f.filter(x => x.id !== fileId));
    } catch { /* ignore */ }
  };

  const taskStats = {
    total:      tasks.length,
    done:       tasks.filter(t => t.status === 'completed').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    todo:       tasks.filter(t => t.status === 'not_started').length,
    assigned:   tasks.filter(t => t.assignee).length,
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl overflow-hidden"
        style={{ background: VS.bg1, border: `1px solid ${VS.border}`, boxShadow: '0 32px 64px rgba(0,0,0,0.8)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 shrink-0"
          style={{ borderBottom: `1px solid ${VS.border}` }}>
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${sCfg.accent}, ${sCfg.accent}99)` }}>
              {getStatusIcon(project.status)}
            </div>
            <div>
              <p className="text-[14px] md:text-[15px] font-bold truncate" style={{ color: VS.text0 }}>{project.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: sCfg.bg, color: sCfg.text, border: `1px solid ${sCfg.accent}44` }}>
                  {sCfg.label}
                </span>
                <span className="text-[11px]" style={{ color: VS.text2 }}>
                  {tasks.length} task{tasks.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: VS.text2 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = VS.bg3; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-4 gap-px shrink-0"
          style={{ background: VS.border, borderBottom: `1px solid ${VS.border}` }}>
          {[
            { label: 'Total Tasks', value: taskStats.total,      color: VS.blue   },
            { label: 'Assigned',    value: taskStats.assigned,   color: VS.teal   },
            { label: 'In Progress', value: taskStats.inProgress, color: VS.yellow },
            { label: 'Done',        value: taskStats.done,       color: VS.green  },
          ].map(s => (
            <div key={s.label} className="flex flex-col items-center py-3" style={{ background: VS.bg2 }}>
              <p className="text-[18px] font-bold" style={{ color: s.color }}>{s.value}</p>
              <p className="text-[10px] mt-0.5" style={{ color: VS.text2 }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* List / Gantt / Files toggle */}
        {!loading && (
          <div className="flex items-center gap-1.5 px-3 md:px-6 py-2 shrink-0 overflow-x-auto" style={{ borderBottom: `1px solid ${VS.border}`, background: VS.bg2 }}>
            {[
              { id: 'list' as const, label: 'List', icon: LayoutList },
              { id: 'gantt' as const, label: 'Gantt', icon: GanttChartSquare },
              { id: 'milestones' as const, label: `Milestones${milestones.length ? ` (${milestones.length})` : ''}`, icon: Flag },
              { id: 'files' as const, label: `Files${files.length ? ` (${files.length})` : ''}`, icon: Paperclip },
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setOverviewTab(tab.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap shrink-0"
                  style={overviewTab === tab.id
                    ? { background: VS.accent, color: '#fff' }
                    : { background: VS.bg3, color: VS.text2 }
                  }
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Task list / Gantt */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-7 w-7 border-b-2" style={{ borderColor: VS.accent }} />
            </div>
          ) : tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <CheckSquare className="h-8 w-8 mb-3" style={{ color: VS.text2 }} />
              <p className="text-sm font-medium" style={{ color: VS.text1 }}>No tasks yet</p>
              <p className="text-xs mt-1" style={{ color: VS.text2 }}>Click "Generate Tasks" to auto-create tasks for this project</p>
            </div>
          ) : overviewTab === 'gantt' ? (
            <div className="p-4" style={{ minHeight: 300 }}>
              <GanttChart
                tasks={tasks.map(t => ({
                  id: t.id,
                  title: t.title,
                  status: (t.status as any) || 'not_started',
                  priority: (t.priority as any) || 'Medium',
                  dueDate: t.dueDate,
                  createdAt: t.createdAt || new Date().toISOString(),
                  estimatedHours: t.estimatedHours || 0,
                  actualHours: t.actualHours || 0,
                  assignees: t.assignee ? [{ id: t.assignee.userId, name: t.assignee.name, email: t.assignee.email, image: t.assignee.image }] : [],
                }))}
              />
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: `1px solid ${VS.border}` }}>
                  {['Task', 'Skills', 'Priority', 'Assignee', 'Hours', 'Status', ''].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left font-medium" style={{ color: VS.text2 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tasks.map((task, i) => {
                  const tStatus = TASK_STATUS[task.status]   || { label: task.status, color: VS.text2 };
                  const tPri    = TASK_PRIORITY[task.priority] || { label: task.priority?.toUpperCase() || '—', color: VS.text2 };
                  return (
                    <tr key={task.id}
                      style={{ background: i % 2 === 0 ? 'transparent' : `${VS.bg2}66`, borderBottom: `1px solid ${VS.border}22` }}>
                      {/* Task title */}
                      <td className="px-4 py-3" style={{ maxWidth: 200 }}>
                        <p className="font-medium truncate" style={{ color: VS.text0 }}>{task.title}</p>
                        {task.description && (
                          <p className="truncate mt-0.5" style={{ color: VS.text2 }}>{task.description}</p>
                        )}
                      </td>
                      {/* Required skills */}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {task.requiredSkills.length ? task.requiredSkills.map(s => (
                            <span key={s} className="px-1.5 py-0.5 rounded text-[10px]"
                              style={{ background: `${VS.purple}22`, color: VS.purple, border: `1px solid ${VS.purple}44` }}>
                              {s}
                            </span>
                          )) : <span style={{ color: VS.text2 }}>—</span>}
                        </div>
                      </td>
                      {/* Priority */}
                      <td className="px-4 py-3">
                        <span className="font-bold" style={{ color: tPri.color }}>{tPri.label}</span>
                      </td>
                      {/* Assignee */}
                      <td className="px-4 py-3">
                        {task.assignee ? (
                          <div className="flex items-center gap-2">
                            <div className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                              style={{ background: 'linear-gradient(135deg, hsl(252 87% 62%), hsl(260 80% 70%))' }}>
                              {getInitials(task.assignee.name)}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-medium" style={{ color: VS.text0, maxWidth: 100 }}>{task.assignee.name}</p>
                              {task.assignee.topSkillName && (
                                <p className="truncate" style={{ color: VS.teal, maxWidth: 100 }}>
                                  {task.assignee.topSkillName} {'★'.repeat(task.assignee.topSkillLevel || 0)}
                                </p>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5" style={{ color: VS.text2 }}>
                            <User className="h-3.5 w-3.5" />
                            Unassigned
                          </div>
                        )}
                      </td>
                      {/* Estimated hours */}
                      <td className="px-4 py-3" style={{ color: VS.text1 }}>
                        {task.estimatedHours ? `${task.estimatedHours}h` : '—'}
                      </td>
                      {/* Status */}
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                          style={{ background: `${tStatus.color}18`, color: tStatus.color, border: `1px solid ${tStatus.color}44` }}>
                          {tStatus.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => handleDeleteProjectTask(task.id)}
                          className="text-[10px] px-2 py-0.5 rounded font-medium transition-colors hover:opacity-80"
                          style={{ color: VS.red, background: `${VS.red}15`, border: `1px solid ${VS.red}33` }}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {/* ── MILESTONES TAB ── */}
          {overviewTab === 'milestones' && (
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[13px] font-semibold" style={{ color: VS.text0 }}>
                  Milestones
                  <span className="ml-2 text-[11px] font-normal" style={{ color: VS.text2 }}>
                    {milestones.filter(m => m.status === 'completed').length}/{milestones.length} completed
                  </span>
                </h3>
                <button onClick={() => setShowAddMilestone(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all hover:opacity-90"
                  style={{ background: VS.accent, color: '#fff' }}>
                  <PlusIcon className="h-3.5 w-3.5" /> Add Milestone
                </button>
              </div>

              {/* Add milestone form */}
              {showAddMilestone && (
                <div className="rounded-lg p-4 space-y-3" style={{ background: VS.bg2, border: `1px solid ${VS.accent}33` }}>
                  <input type="text" value={newMilestone.name}
                    onChange={e => setNewMilestone(p => ({ ...p, name: e.target.value }))}
                    placeholder="Milestone name..."
                    className="w-full px-3 py-2 rounded-lg text-[13px] focus:outline-none"
                    style={{ background: VS.bg3, border: `1px solid ${VS.border}`, color: VS.text0 }}
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') handleAddMilestone(); if (e.key === 'Escape') setShowAddMilestone(false); }}
                  />
                  <textarea value={newMilestone.description}
                    onChange={e => setNewMilestone(p => ({ ...p, description: e.target.value }))}
                    placeholder="Description (optional)"
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg text-[12px] resize-none focus:outline-none"
                    style={{ background: VS.bg3, border: `1px solid ${VS.border}`, color: VS.text1 }}
                  />
                  <div className="flex items-center gap-3">
                    <input type="date" value={newMilestone.dueDate}
                      onChange={e => setNewMilestone(p => ({ ...p, dueDate: e.target.value }))}
                      className="px-3 py-1.5 rounded-lg text-[12px] focus:outline-none"
                      style={{ background: VS.bg3, border: `1px solid ${VS.border}`, color: VS.text1 }}
                    />
                    <div className="flex-1" />
                    <button onClick={() => { setShowAddMilestone(false); setNewMilestone({ name: '', description: '', dueDate: '' }); }}
                      className="px-3 py-1.5 rounded-lg text-[12px] font-medium"
                      style={{ background: VS.bg3, border: `1px solid ${VS.border}`, color: VS.text1 }}>
                      Cancel
                    </button>
                    <button onClick={handleAddMilestone} disabled={addingMilestone || !newMilestone.name.trim()}
                      className="px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white disabled:opacity-40"
                      style={{ background: VS.accent }}>
                      {addingMilestone ? 'Adding...' : 'Add'}
                    </button>
                  </div>
                </div>
              )}

              {/* Milestone list */}
              {milestonesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2" style={{ borderColor: VS.accent }} />
                </div>
              ) : milestones.length === 0 && !showAddMilestone ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Flag className="h-8 w-8 mb-3 opacity-30" style={{ color: VS.text2 }} />
                  <p className="text-[13px] font-medium" style={{ color: VS.text1 }}>No milestones yet</p>
                  <p className="text-[11px] mt-1" style={{ color: VS.text2 }}>Add milestones to track project progress</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Unassigned tasks — shown at TOP for easy drag-down to milestones */}
                  {unassignedTasks.length > 0 && (
                    <div className="rounded-xl overflow-hidden transition-all"
                      style={{
                        border: `1px dashed ${dragOverMilestoneId === '__unassigned__' ? VS.orange : VS.accent + '44'}`,
                        background: dragOverMilestoneId === '__unassigned__' ? `${VS.orange}08` : `${VS.accent}06`,
                      }}
                      onDragOver={e => { e.preventDefault(); setDragOverMilestoneId('__unassigned__'); }}
                      onDragLeave={() => setDragOverMilestoneId(null)}
                      onDrop={e => {
                        e.preventDefault();
                        setDragOverMilestoneId(null);
                        if (dragTaskId) {
                          const fromMs = milestones.find(m => m.tasks.some(t => t.id === dragTaskId));
                          if (fromMs) handleUnassignTask(dragTaskId, fromMs.id);
                          setDragTaskId(null);
                        }
                      }}
                    >
                      <div className="px-4 py-2.5 flex items-center gap-2" style={{ borderBottom: `1px solid ${VS.border}22` }}>
                        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: VS.accent }}>
                          {dragTaskId ? 'Drop here to unassign' : 'Project Tasks'}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: `${VS.accent}18`, color: VS.accent }}>{unassignedTasks.length} unassigned</span>
                        <span className="text-[10px] ml-auto" style={{ color: VS.text2 }}>Drag tasks to milestones below ↓</span>
                      </div>
                      <div className="divide-y" style={{ borderColor: VS.border + '22' }}>
                        {unassignedTasks.map(t => {
                          const tColor = t.status === 'completed' ? VS.teal : t.status === 'in_progress' ? VS.yellow : VS.text2;
                          const aName = t.assignee?.name || null;
                          return (
                            <div key={t.id}
                              draggable
                              onDragStart={() => setDragTaskId(t.id)}
                              onDragEnd={() => { setDragTaskId(null); setDragOverMilestoneId(null); }}
                              className="flex items-center gap-2.5 px-4 py-2.5 cursor-grab active:cursor-grabbing hover:bg-white/[0.03] transition-all"
                              style={{ opacity: dragTaskId === t.id ? 0.4 : 1 }}
                            >
                              <div className="h-2 w-2 rounded-full shrink-0" style={{ background: tColor }} />
                              <span className="text-[12px] font-medium flex-1 truncate" style={{ color: VS.text0 }}>{t.title}</span>
                              {aName && <span className="text-[10px] shrink-0" style={{ color: VS.text2 }}>{aName}</span>}
                              <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0" style={{ background: `${tColor}18`, color: tColor }}>
                                {t.status === 'completed' ? 'Done' : t.status === 'in_progress' ? 'Active' : 'To Do'}
                              </span>
                              {milestones.length > 0 && (
                                <select
                                  value=""
                                  onChange={e => { if (e.target.value) handleAssignTask(t.id, e.target.value); }}
                                  className="px-1.5 py-0.5 rounded text-[10px] focus:outline-none shrink-0"
                                  style={{ background: VS.bg3, border: `1px solid ${VS.border}`, color: VS.text2, maxWidth: 100 }}
                                >
                                  <option value="" disabled>→ Move to...</option>
                                  {milestones.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                </select>
                              )}
                              <button onClick={e => { e.stopPropagation(); handleDeleteProjectTask(t.id); }}
                                className="text-[10px] px-2 py-0.5 rounded font-medium shrink-0 transition-colors hover:opacity-80"
                                style={{ color: VS.red, background: `${VS.red}15`, border: `1px solid ${VS.red}33` }}>
                                Delete
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Milestones */}
                  {milestones.map((ms) => {
                    const isDone = ms.status === 'completed';
                    const isOverdue = ms.dueDate && !isDone && new Date(ms.dueDate) < new Date();
                    const dotColor = isDone ? VS.teal : isOverdue ? VS.red : VS.blue;
                    const isExpanded = expandedMilestoneId === ms.id;
                    const doneTasks = ms.tasks.filter(t => t.status === 'completed').length;
                    return (
                      <div key={ms.id} className="rounded-xl overflow-hidden transition-all"
                        style={{
                          border: `1px solid ${dragOverMilestoneId === ms.id ? VS.accent : isDone ? VS.teal + '33' : VS.border}`,
                          background: dragOverMilestoneId === ms.id ? `${VS.accent}12` : VS.bg2,
                          boxShadow: dragOverMilestoneId === ms.id ? `0 0 0 2px ${VS.accent}33` : 'none',
                        }}
                        onDragOver={e => { e.preventDefault(); setDragOverMilestoneId(ms.id); }}
                        onDragLeave={() => setDragOverMilestoneId(null)}
                        onDrop={e => {
                          e.preventDefault();
                          setDragOverMilestoneId(null);
                          if (dragTaskId) { handleAssignTask(dragTaskId, ms.id); setDragTaskId(null); }
                        }}
                      >
                        {/* Milestone header */}
                        <div className="flex items-center gap-3 px-4 py-3 group cursor-pointer"
                          onClick={() => setExpandedMilestoneId(isExpanded ? null : ms.id)}>
                          <button
                            onClick={e => { e.stopPropagation(); handleToggleMilestone(ms); }}
                            className="h-7 w-7 rounded-full flex items-center justify-center shrink-0 transition-all hover:scale-110"
                            style={{ background: isDone ? dotColor : VS.bg1, border: `2px solid ${dotColor}` }}
                            title={isDone ? 'Mark pending' : 'Mark completed'}
                          >
                            {isDone ? <CheckCircle2 className="h-3.5 w-3.5 text-white" /> : <Flag className="h-3 w-3" style={{ color: dotColor }} />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-[13px] font-semibold truncate" style={{ color: isDone ? VS.text2 : VS.text0, textDecoration: isDone ? 'line-through' : 'none' }}>
                                {ms.name}
                              </p>
                              {isOverdue && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: `${VS.red}18`, color: VS.red }}>OVERDUE</span>}
                              {isDone && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: `${VS.teal}18`, color: VS.teal }}>DONE</span>}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              {ms.dueDate && <span className="text-[10px]" style={{ color: isOverdue ? VS.red : VS.text2 }}>Due {new Date(ms.dueDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>}
                              <span className="text-[10px]" style={{ color: VS.text2 }}>{doneTasks}/{ms.tasks.length} tasks</span>
                            </div>
                          </div>
                          {/* Progress mini bar */}
                          {ms.tasks.length > 0 && (
                            <div className="w-16 h-1.5 rounded-full overflow-hidden shrink-0" style={{ background: VS.bg3 }}>
                              <div className="h-full rounded-full" style={{ width: `${Math.round((doneTasks / ms.tasks.length) * 100)}%`, background: dotColor }} />
                            </div>
                          )}
                          <button onClick={e => { e.stopPropagation(); handleDeleteMilestone(ms.id); }}
                            className="opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity p-1 shrink-0"
                            style={{ color: VS.red }}>
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>

                        {/* Expanded: tasks list + assign dropdown */}
                        {isExpanded && (
                          <div style={{ borderTop: `1px solid ${VS.border}` }}>
                            {ms.tasks.length > 0 && (
                              <div className="divide-y" style={{ borderColor: VS.border + '44' }}>
                                {ms.tasks.map(t => {
                                  const tColor = t.status === 'completed' ? VS.teal : t.status === 'in_progress' ? VS.yellow : VS.text2;
                                  return (
                                    <div key={t.id}
                                      draggable
                                      onDragStart={() => setDragTaskId(t.id)}
                                      onDragEnd={() => { setDragTaskId(null); setDragOverMilestoneId(null); }}
                                      className="flex items-center gap-2 px-4 py-2 group/task cursor-grab active:cursor-grabbing"
                                      style={{ opacity: dragTaskId === t.id ? 0.4 : 1 }}
                                    >
                                      <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: tColor }} />
                                      <span className="text-[12px] flex-1 truncate" style={{ color: t.status === 'completed' ? VS.text2 : VS.text0, textDecoration: t.status === 'completed' ? 'line-through' : 'none' }}>{t.title}</span>
                                      {t.assigneeName && <span className="text-[10px] shrink-0" style={{ color: VS.text2 }}>{t.assigneeName}</span>}
                                      <button onClick={e => { e.stopPropagation(); handleUnassignTask(t.id, ms.id); }}
                                        className="text-[10px] px-2 py-0.5 rounded font-medium shrink-0 transition-colors hover:opacity-80"
                                        style={{ color: VS.orange, background: `${VS.orange}15`, border: `1px solid ${VS.orange}33` }}>
                                        ✕ Remove
                                      </button>
                                      <button onClick={e => { e.stopPropagation(); handleDeleteProjectTask(t.id); }}
                                        className="text-[10px] px-2 py-0.5 rounded font-medium shrink-0 transition-colors hover:opacity-80"
                                        style={{ color: VS.red, background: `${VS.red}15`, border: `1px solid ${VS.red}33` }}>
                                        Delete
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            {/* Assign unassigned tasks */}
                            <div className="px-4 py-2" style={{ background: `${VS.accent}08`, borderTop: `1px solid ${VS.border}22` }}>
                              {unassignedTasks.length > 0 ? (
                                <select
                                  value=""
                                  onChange={e => { if (e.target.value) handleAssignTask(e.target.value, ms.id); }}
                                  className="w-full px-2 py-1.5 rounded text-[11px] focus:outline-none"
                                  style={{ background: VS.bg3, border: `1px solid ${VS.border}`, color: VS.text1 }}
                                >
                                  <option value="" disabled>+ Add task to this milestone ({unassignedTasks.length} available)</option>
                                  {unassignedTasks.map(t => (
                                    <option key={t.id} value={t.id}>{t.title}</option>
                                  ))}
                                </select>
                              ) : (
                                <p className="text-[11px] py-1" style={{ color: VS.text2 }}>
                                  {ms.tasks.length === 0 ? 'No unassigned tasks — create tasks for this project first' : 'All tasks assigned to milestones'}
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                </div>
              )}
            </div>
          )}

          {/* ── FILES TAB ── */}
          {overviewTab === 'files' && (
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[13px] font-semibold" style={{ color: VS.text0 }}>
                  Project Files
                  <span className="ml-2 text-[11px] font-normal" style={{ color: VS.text2 }}>{files.length} files</span>
                </h3>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all hover:opacity-90 disabled:opacity-50"
                  style={{ background: VS.accent, color: '#fff' }}
                >
                  <Upload className="h-3.5 w-3.5" />
                  {uploading ? 'Uploading...' : 'Upload File'}
                </button>
                <input ref={fileInputRef} type="file" multiple className="hidden"
                  onChange={e => handleFileUpload(e.target.files)} />
              </div>

              {filesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2" style={{ borderColor: VS.accent }} />
                </div>
              ) : files.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Paperclip className="h-8 w-8 mb-3 opacity-30" style={{ color: VS.text2 }} />
                  <p className="text-[13px] font-medium" style={{ color: VS.text1 }}>No files yet</p>
                  <p className="text-[11px] mt-1" style={{ color: VS.text2 }}>Upload briefs, assets, or documents for this project</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {files.map((f, i) => {
                    const isImage = f.mimeType?.startsWith('image/');
                    const isPdf = f.mimeType === 'application/pdf' || f.name.endsWith('.pdf');
                    const FIcon = isImage ? Image : isPdf ? FileText : FileIcon;
                    const sizeStr = f.size < 1024 ? `${f.size} B` : f.size < 1048576 ? `${(f.size / 1024).toFixed(1)} KB` : `${(f.size / 1048576).toFixed(1)} MB`;
                    return (
                      <div key={f.id}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg group transition-colors"
                        style={{ background: i % 2 === 0 ? VS.bg2 : 'transparent', border: `1px solid ${VS.border}22` }}
                      >
                        <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: `${isImage ? VS.purple : isPdf ? VS.red : VS.blue}15` }}>
                          <FIcon className="h-4 w-4" style={{ color: isImage ? VS.purple : isPdf ? VS.red : VS.blue }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium truncate" style={{ color: VS.text0 }}>{f.name}</p>
                          <p className="text-[10px]" style={{ color: VS.text2 }}>
                            {f.userName || f.userEmail || 'Unknown'} · {sizeStr} · {new Date(f.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => handleFileDownload(f.id, f.name)}
                            className="h-7 w-7 rounded-lg flex items-center justify-center transition-colors"
                            style={{ color: VS.accent, background: `${VS.accent}15` }} title="Download">
                            <Download className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => handleFileDelete(f.id)}
                            className="h-7 w-7 rounded-lg flex items-center justify-center transition-colors"
                            style={{ color: VS.red, background: `${VS.red}15` }} title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 shrink-0"
          style={{ borderTop: `1px solid ${VS.border}` }}>
          <p className="text-[11px]" style={{ color: VS.text2 }}>
            Staff are auto-assigned based on skill rating and current workload
          </p>
          <button
            onClick={onRegenerate}
            disabled={regenerating}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
            style={{ background: VS.accent }}
          >
            {regenerating ? (
              <><div className="h-3 w-3 border border-white/40 border-t-white rounded-full animate-spin" /> Generating...</>
            ) : (
              <><Zap className="h-3.5 w-3.5" /> Regenerate Tasks</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Projects() {
  const { data: session } = useSession();
  const { currentOrg } = useOrganization();
  const apiClient = useApiClient();

  const [projects, setProjects] = useState<DatabaseProject[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string; email?: string; company?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [editingProject, setEditingProject] = useState<DatabaseProject | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [userRole, setUserRole] = useState<string>('');

  // ── Tasks dropdown per card ──
  const [expandedTasksId, setExpandedTasksId] = useState<string | null>(null);
  const [projectTasksMap, setProjectTasksMap] = useState<Record<string, { id: string; title: string; status: string; priority: string; assignee?: string }[]>>({});
  const [tasksFetchingId, setTasksFetchingId] = useState<string | null>(null);

  const toggleProjectTasks = async (projectId: string) => {
    if (expandedTasksId === projectId) { setExpandedTasksId(null); return; }
    setExpandedTasksId(projectId);
    if (projectTasksMap[projectId]) return; // already cached
    setTasksFetchingId(projectId);
    try {
      const data = await apiClient.fetch(`/api/tasks?projectId=${projectId}`);
      setProjectTasksMap(m => ({ ...m, [projectId]: data.tasks || [] }));
    } catch { /* ignore */ }
    finally { setTasksFetchingId(null); }
  };

  // ── Overview / generate state ──
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [overviewProject, setOverviewProject] = useState<DatabaseProject | null>(null);
  const [overviewTasks, setOverviewTasks] = useState<OverviewTask[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const fetchClients = async () => {
    try {
      const data = await apiClient.fetch('/api/clients/slim');
      if (data.success) setClients(data.clients || []);
    } catch { /* ignore */ }
  };

  const fetchProjects = async () => {
    if (!session?.user?.id) return;
    try {
      setLoading(true);
      // Backend handles CLIENT role filtering via membership check
      const data = await apiClient.fetch(`/api/projects?userId=${session.user.id}&limit=100`);
      if (data.success) setProjects(data.projects || []);
      else setProjects([]);
    } catch { setProjects([]); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (session?.user?.id) {
      // Sync role from OrganizationContext for UI gating (hide/show buttons)
      const role = currentOrg?.role || '';
      setUserRole(role);
      fetchProjects();
      fetchClients();
    }
  }, [session?.user?.id, currentOrg?.id, currentOrg?.role]);

  const handleDeleteProject = async (project: DatabaseProject) => {
    if (!confirm(`Delete "${project.name}"? This cannot be undone.`)) return;
    try {
      const data = await apiClient.fetch(`/api/projects/${project.id}`, { method: 'DELETE' });
      if (data.success) await fetchProjects();
    } catch { alert('Failed to delete project.'); }
  };

  const handleUpdateProject = async (projectData: any) => {
    if (!editingProject) return;
    try {
      const clientName         = projectData.clientName || '';
      const description        = projectData.description || '';
      const combinedDescription = clientName ? `CLIENT:${clientName}|DESC:${description}` : description;
      const data = await apiClient.fetch(`/api/projects/${editingProject.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: projectData.name, description: combinedDescription,
          priority: projectData.priority || 'medium', status: projectData.status || 'planning',
          budget: projectData.budget ? parseFloat(projectData.budget) : undefined,
          startDate: projectData.startDate ? new Date(projectData.startDate).toISOString() : undefined,
          endDate: projectData.endDate ? new Date(projectData.endDate).toISOString() : undefined,
          color: projectData.color || 'bg-primary',
          clientId: projectData.clientId || undefined,
        }),
      });
      if (data.success) { await fetchProjects(); setEditingProject(null); }
    } catch { /* ignore */ }
  };

  const handleCreateProject = async (projectData: any) => {
    try {
      const orgId              = currentOrg?.id || 'org_1757046595553';
      const clientName         = projectData.clientName || '';
      const description        = projectData.description || '';
      const combinedDescription = clientName ? `CLIENT:${clientName}|DESC:${description}` : description;
      const data = await apiClient.fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId, name: projectData.name, description: combinedDescription,
          priority: projectData.priority || 'medium', status: projectData.status || 'planning',
          budget: projectData.budget ? parseFloat(projectData.budget) : undefined,
          startDate: projectData.startDate ? new Date(projectData.startDate).toISOString() : undefined,
          endDate: projectData.endDate ? new Date(projectData.endDate).toISOString() : undefined,
          color: projectData.color || 'bg-primary',
          clientId: projectData.clientId || undefined,
        }),
      });
      if (data.success) { await fetchProjects(); setShowNewProjectModal(false); }
    } catch { /* ignore */ }
  };

  // ── Generate tasks for a project ──────────────────────────────────────────
  const handleGenerateTasks = async (project: DatabaseProject) => {
    setGeneratingId(project.id);
    try {
      const data = await apiClient.fetch(`/api/projects/${project.id}/generate-tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (data.success) {
        setOverviewProject(project);
        setOverviewTasks(data.tasks || []);
        await fetchProjects();
      } else {
        alert(data.error || 'Failed to generate tasks');
      }
    } catch {
      alert('Failed to generate tasks. Please try again.');
    } finally {
      setGeneratingId(null);
    }
  };

  // ── Load existing tasks for a project ─────────────────────────────────────
  const handleViewOverview = async (project: DatabaseProject) => {
    setOverviewProject(project);
    setOverviewTasks([]);
    setOverviewLoading(true);
    try {
      const data = await apiClient.fetch(`/api/projects/${project.id}/overview`);
      if (data.success) setOverviewTasks(data.tasks || []);
    } catch { /* ignore */ }
    finally { setOverviewLoading(false); }
  };

  // ── Regenerate tasks from overview modal ──────────────────────────────────
  const handleRegenerate = async () => {
    if (!overviewProject) return;
    setRegenerating(true);
    try {
      const data = await apiClient.fetch(`/api/projects/${overviewProject.id}/generate-tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (data.success) {
        // Reload the full overview (includes previously generated tasks too)
        const ov = await apiClient.fetch(`/api/projects/${overviewProject.id}/overview`);
        if (ov.success) setOverviewTasks(ov.tasks || []);
        await fetchProjects();
      }
    } catch { /* ignore */ }
    finally { setRegenerating(false); }
  };

  const filteredProjects = projects.filter(p => {
    if (filterStatus !== 'all' && p.status !== filterStatus) return false;
    if (filterPriority !== 'all' && p.priority !== filterPriority) return false;
    return true;
  });

  const stats = {
    total:     projects.length,
    active:    projects.filter(p => p.status === 'active').length,
    completed: projects.filter(p => p.status === 'completed').length,
    totalHours: projects.reduce((s, p) => s + p.hoursLogged, 0),
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: VS.accent }} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 'calc(100vh - 56px)' }}>

      {/* ── Header bar ── */}
      <div
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-6 py-4"
        style={{ borderBottom: `1px solid ${VS.border}` }}
      >
        <div>
          <h1 className="text-lg font-bold tracking-tight" style={{ color: VS.text0 }}>
            Projects
            <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded align-middle"
              style={{ background: VS.bg3, color: VS.text2, border: `1px solid ${VS.border}` }}>
              Portfolio
            </span>
          </h1>
          <p className="text-xs mt-0.5" style={{ color: VS.text2 }}>
            {filteredProjects.length}{filteredProjects.length !== projects.length ? ` / ${projects.length}` : ''} projects
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={inputCls} style={inputStyle}>
            <option value="all">All Status</option>
            <option value="planning">Planning</option>
            <option value="active">Active</option>
            <option value="on_hold">On Hold</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className={inputCls} style={inputStyle}>
            <option value="all">All Priority</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          {userRole !== 'CLIENT' && (
            <button
              onClick={() => setShowNewProjectModal(true)}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-semibold text-white transition-all hover:opacity-90"
              style={{ background: VS.accent }}
            >
              <Plus className="h-3.5 w-3.5" />
              New Project
            </button>
          )}
        </div>
      </div>

      {/* ── Stats strip ── */}
      <div
        className="grid grid-cols-2 sm:grid-cols-4 gap-px shrink-0"
        style={{ background: VS.border, borderBottom: `1px solid ${VS.border}` }}
      >
        {[
          { label: 'Total',     value: stats.total,     icon: Building2,    color: VS.blue   },
          { label: 'Active',    value: stats.active,    icon: Activity,     color: VS.teal   },
          { label: 'Completed', value: stats.completed, icon: CheckCircle2, color: VS.green  },
          { label: 'Hrs Logged', value: `${stats.totalHours}h`, icon: Clock, color: VS.yellow },
        ].map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="flex items-center gap-3 px-5 py-3" style={{ background: VS.bg1 }}>
              <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: `${s.color}18`, border: `1px solid ${s.color}44` }}>
                <Icon className="h-3.5 w-3.5" style={{ color: s.color }} />
              </div>
              <div>
                <p className="text-base font-bold leading-tight" style={{ color: VS.text0 }}>{s.value}</p>
                <p className="text-[10px]" style={{ color: VS.text2 }}>{s.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Projects grid ── */}
      <div className="flex-1 overflow-y-auto p-5">
        {filteredProjects.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-20 rounded-2xl"
            style={{ border: `1px dashed ${VS.border}` }}
          >
            <div className="h-12 w-12 rounded-2xl flex items-center justify-center mb-4" style={{ background: VS.bg3 }}>
              <Building2 className="h-6 w-6" style={{ color: VS.text2 }} />
            </div>
            <p className="text-sm font-semibold" style={{ color: VS.text1 }}>No projects found</p>
            <p className="text-xs mt-1" style={{ color: VS.text2 }}>
              {filterStatus !== 'all' || filterPriority !== 'all' ? 'Try adjusting your filters' : 'Create your first project to get started'}
            </p>
            {userRole !== 'CLIENT' && (
              <button
                onClick={() => setShowNewProjectModal(true)}
                className="mt-4 flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white"
                style={{ background: VS.accent }}
              >
                <Plus className="h-3.5 w-3.5" /> New Project
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredProjects.map(project => {
              const sCfg    = PROJECT_STATUS[project.status] || PROJECT_STATUS.planning;
              const pCfg    = PROJECT_PRIORITY[project.priority] || PROJECT_PRIORITY.medium;
              const client  = project.client?.name || parseClientFromDescription(project.description);
              const desc    = parseDescriptionFromCombined(project.description);
              const isOver  = project.endDate && new Date(project.endDate) < new Date() && project.status !== 'completed' && project.status !== 'cancelled';
              const isGenerating = generatingId === project.id;

              return (
                <div
                  key={project.id}
                  className="rounded-2xl overflow-hidden transition-all duration-150 relative group"
                  style={{
                    background:  VS.bg2,
                    border:      `1px solid ${sCfg.accent}44`,
                    borderTop:   `3px solid ${sCfg.accent}`,
                    boxShadow:   '0 4px 20px rgba(0,0,0,0.4)',
                    opacity:     isGenerating ? 0.7 : 1,
                  }}
                >
                  {/* Generating overlay */}
                  {isGenerating && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-2xl"
                      style={{ background: 'rgba(0,0,0,0.55)' }}>
                      <div className="animate-spin rounded-full h-7 w-7 border-b-2" style={{ borderColor: VS.teal }} />
                      <p className="text-[12px] font-semibold" style={{ color: VS.teal }}>Generating tasks…</p>
                    </div>
                  )}

                  {/* ── Card header ── */}
                  <div className="px-4 pt-5 pb-3">
                    <div className="flex items-start gap-2">
                      <div
                        className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0 text-white"
                        style={{ background: `linear-gradient(135deg, ${sCfg.accent}, ${sCfg.accent}99)` }}
                      >
                        {getStatusIcon(project.status)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-bold leading-snug" style={{ color: VS.text0 }}>{project.name}</p>
                        <p className="text-[11px] truncate mt-0.5" style={{ color: VS.text2 }}>
                          {client || 'No client assigned'}
                        </p>
                      </div>

                      {/* Context menu */}
                      <div className="relative shrink-0">
                        <button
                          onClick={e => { e.stopPropagation(); setOpenMenuId(openMenuId === project.id ? null : project.id); }}
                          className="h-6 w-6 flex items-center justify-center rounded-lg transition-all opacity-0 group-hover:opacity-100"
                          style={{ color: VS.text2, background: VS.bg3 }}
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                        {openMenuId === project.id && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                            <div
                              className="absolute right-0 top-full mt-1 z-20 rounded-xl overflow-hidden py-1 min-w-[150px]"
                              style={{ background: VS.bg1, border: `1px solid ${VS.border}`, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
                            >
                              {/* Generate Tasks */}
                              {userRole !== 'CLIENT' && (
                                <button
                                  onClick={() => { setOpenMenuId(null); handleGenerateTasks(project); }}
                                  className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-white/5 transition-colors"
                                  style={{ color: VS.teal }}
                                >
                                  <Zap className="h-3 w-3" /> Generate Tasks
                                </button>
                              )}
                              {/* View Overview */}
                              <button
                                onClick={() => { setOpenMenuId(null); handleViewOverview(project); }}
                                className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-white/5 transition-colors"
                                style={{ color: VS.blue }}
                              >
                                <Eye className="h-3 w-3" /> View Overview
                                <ChevronRight className="h-3 w-3 ml-auto" />
                              </button>
                              {/* Edit & Delete — owner/admin only */}
                              {(userRole === 'OWNER' || userRole === 'ADMIN') && (
                                <>
                                  <div style={{ height: 1, background: VS.border, margin: '2px 0' }} />
                                  <button
                                    onClick={() => { setEditingProject(project); setOpenMenuId(null); }}
                                    className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-white/5 transition-colors"
                                    style={{ color: VS.text0 }}
                                  >
                                    <Edit3 className="h-3 w-3" /> Edit project
                                  </button>
                                  <div style={{ height: 1, background: VS.border, margin: '2px 0' }} />
                                  <button
                                    onClick={() => { setOpenMenuId(null); handleDeleteProject(project); }}
                                    className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-red-500/10 transition-colors"
                                    style={{ color: VS.red }}
                                  >
                                    <Trash2 className="h-3 w-3" /> Delete
                                  </button>
                                </>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    <p className="text-[12px] mt-2.5 line-clamp-2 leading-relaxed" style={{ color: VS.text2 }}>
                      {desc || '\u00a0'}
                    </p>

                    <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full"
                        style={{ background: sCfg.bg, color: sCfg.text, border: `1px solid ${sCfg.accent}44` }}>
                        {sCfg.label}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded"
                        style={{ background: `${pCfg.border}18`, color: pCfg.text, border: `1px solid ${pCfg.border}44` }}>
                        {pCfg.label}
                      </span>
                    </div>
                  </div>

                  {/* ── Progress ── */}
                  <div className="px-4 pb-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px]" style={{ color: VS.text2 }}>Progress</span>
                      <span className="text-[11px] font-semibold" style={{ color: VS.text1 }}>{project.progress}%</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: VS.bg3 }}>
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{ width: `${project.progress}%`, background: `linear-gradient(90deg, ${sCfg.accent}, ${sCfg.accent}88)` }}
                      />
                    </div>
                  </div>

                  <div style={{ borderTop: `1px dashed ${VS.border}` }} />

                  {/* ── Stats row ── */}
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1 text-[12px]" style={{ color: VS.text2 }}>
                        <CheckSquare className="h-3.5 w-3.5" />
                        {project.tasks?.completed || 0}/{project.tasks?.total || 0}
                      </span>
                      <span className="flex items-center gap-1 text-[12px]" style={{ color: VS.text2 }}>
                        <Clock className="h-3.5 w-3.5" />
                        {Number(project.hoursLogged) % 1 === 0 ? project.hoursLogged : Number(project.hoursLogged).toFixed(1)}h
                      </span>
                    </div>
                    <span className="text-[12px] font-medium" style={{ color: isOver ? VS.red : VS.text2 }}>
                      {project.endDate ? (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {fmtDate(project.endDate)}
                        </span>
                      ) : '—'}
                    </span>
                  </div>

                  {/* ── Tasks toggle ── */}
                  <div style={{ borderTop: `1px dashed ${VS.border}` }}>
                    <button
                      onClick={() => toggleProjectTasks(project.id)}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-[12px] transition-colors hover:bg-white/5"
                      style={{ color: expandedTasksId === project.id ? VS.accent : VS.text2 }}
                    >
                      <span className="flex items-center gap-1.5">
                        <CheckSquare className="h-3.5 w-3.5" />
                        Tasks ({project.tasks?.total || 0})
                      </span>
                      {tasksFetchingId === project.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : expandedTasksId === project.id
                          ? <ChevronDown className="h-3.5 w-3.5" />
                          : <ChevronRight className="h-3.5 w-3.5" />
                      }
                    </button>

                    {expandedTasksId === project.id && (
                      <div className="px-4 pb-3 space-y-1.5">
                        {(projectTasksMap[project.id] || []).length === 0 ? (
                          <p className="text-[11px] py-1" style={{ color: VS.text2 }}>No tasks yet</p>
                        ) : (projectTasksMap[project.id] || []).map(task => {
                          const tsCfg = TASK_STATUS[task.status] || { label: task.status, color: VS.text2 };
                          const tpCfg = TASK_PRIORITY[task.priority] || { label: task.priority, color: VS.text2 };
                          return (
                            <div key={task.id}
                              className="flex items-center gap-2 rounded-lg px-2.5 py-2"
                              style={{ background: VS.bg3, border: `1px solid ${VS.border}` }}
                            >
                              <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: tsCfg.color }} />
                              <span className="flex-1 text-[12px] truncate" style={{ color: VS.text1 }}>{task.title}</span>
                              <span className="text-[10px] font-semibold shrink-0" style={{ color: tpCfg.color }}>{tpCfg.label}</span>
                              <span className="text-[10px] shrink-0" style={{ color: tsCfg.color }}>{tsCfg.label}</span>
                              {task.assignee && (
                                <span className="text-[10px] truncate max-w-[70px] shrink-0" style={{ color: VS.text2 }}>{task.assignee}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Create / Edit modals ── */}
      <ProjectModal
        isOpen={showNewProjectModal}
        onClose={() => setShowNewProjectModal(false)}
        onSave={handleCreateProject}
        clients={clients}
      />
      <ProjectModal
        isOpen={!!editingProject}
        onClose={() => setEditingProject(null)}
        onSave={handleUpdateProject}
        clients={clients}
        project={editingProject ? {
          id: editingProject.id,
          name: editingProject.name,
          description: parseDescriptionFromCombined(editingProject.description),
          color: editingProject.color,
          status: editingProject.status,
          startDate: editingProject.startDate,
          endDate: editingProject.endDate,
          createdAt: new Date(editingProject.createdAt),
          updatedAt: new Date(editingProject.updatedAt),
          clientName: parseClientFromDescription(editingProject.description) || undefined,
        } : undefined}
      />

      {/* ── Project Overview Modal ── */}
      {overviewProject && (
        <OverviewModal
          project={overviewProject}
          tasks={overviewTasks}
          loading={overviewLoading}
          onClose={() => { setOverviewProject(null); setOverviewTasks([]); }}
          onRegenerate={handleRegenerate}
          regenerating={regenerating}
        />
      )}

      {/* Click-outside for context menus */}
      {openMenuId && <div className="fixed inset-0 z-[5]" onClick={() => setOpenMenuId(null)} />}
    </div>
  );
}
