import { useState, useEffect, useCallback } from 'react';
import { useSession } from '../lib/auth-client';
import { useApiClient } from '../lib/api-client';
import { useOrganization } from '../contexts/OrganizationContext';
import { useSSE } from '../hooks/useSSE';
import {
  Zap,
  CheckCircle2,
  Lock,
  ChevronDown,
  ChevronRight,
  Flag,
  Circle,
} from 'lucide-react';
import { VS } from '../lib/theme';

interface TaskPreview {
  id: string;
  title: string;
  status: string;
  priority: string;
  milestoneId: string;
  assigneeName: string | null;
  assigneeImage: string | null;
}

interface MilestoneItem {
  id: string;
  projectId: string;
  projectName: string;
  projectColor: string | null;
  projectPriority: string;
  name: string;
  description: string | null;
  dueDate: string | null;
  status: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  taskTotal: number;
  taskCompleted: number;
  taskInProgress: number;
  taskPreviews: TaskPreview[];
}

const priorityColors: Record<string, string> = {
  Urgent: '#f44747',
  High: '#ce9178',
  Medium: '#dcdcaa',
  Low: '#6a9955',
  high: '#ce9178',
  medium: '#dcdcaa',
  low: '#6a9955',
};

function avatarGradient(name: string) {
  const colors = ['#007acc', '#569cd6', '#4ec9b0', '#c586c0', '#ce9178', '#6a9955', '#dcdcaa'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export function Milestones() {
  const { data: session } = useSession();
  const { currentOrg, isLoading: orgLoading } = useOrganization();
  const apiClient = useApiClient();

  const [currently, setCurrently] = useState<MilestoneItem[]>([]);
  const [completed, setCompleted] = useState<MilestoneItem[]>([]);
  const [upcoming, setUpcoming] = useState<MilestoneItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCompleted, setExpandedCompleted] = useState(false);
  const [expandedUpcoming, setExpandedUpcoming] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [showAllMembers, setShowAllMembers] = useState(false);
  const isAdminOrOwner = currentOrg?.role === 'OWNER' || currentOrg?.role === 'ADMIN';
  const canToggle = isAdminOrOwner || currentOrg?.role === 'STAFF';

  const fetchMilestones = async (showLoader = true) => {
    if (!session?.user?.id || !currentOrg?.id) return;
    try {
      if (showLoader) setLoading(true);
      const params = new URLSearchParams();
      if (showAll) params.set('showAll', 'true');
      if (!showAllMembers) params.set('userId', session.user.id);
      const qs = params.toString();
      const data = await apiClient.fetch(`/api/projects/milestones/overview${qs ? '?' + qs : ''}`, { method: 'GET' });
      if (data.success) {
        setCurrently(data.currently || []);
        setCompleted(data.completed || []);
        setUpcoming(data.upcoming || []);
      }
    } catch (err) {
      console.error('[Milestones] fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMilestones(); }, [session?.user?.id, currentOrg?.id, showAll, showAllMembers]);

  // Real-time updates
  useSSE(currentOrg?.id || undefined, useCallback((event: string) => {
    if (event === 'task' || event === 'milestone') {
      fetchMilestones(false);
    }
  }, []));

  if (!session || orgLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: VS.accent }} />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: VS.accent }} />
      </div>
    );
  }

  const noMilestones = currently.length === 0 && completed.length === 0 && upcoming.length === 0;

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 'calc(100vh - 56px)' }}>

      {/* Header */}
      <div className="px-3 md:px-6 py-3 md:py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${VS.border}` }}>
        <div className="flex items-center gap-3">
          <Flag className="h-5 w-5" style={{ color: VS.accent }} />
          <div>
            <h1 className="text-lg font-bold tracking-tight" style={{ color: VS.text0 }}>
              Milestones
              <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded align-middle"
                style={{ background: VS.bg3, color: VS.text2, border: `1px solid ${VS.border}` }}>
                {showAllMembers ? 'All Members' : 'My Milestones'}
              </span>
            </h1>
            <p className="text-xs mt-0.5" style={{ color: VS.text2 }}>
              {currently.length} active · {completed.length} completed · {upcoming.length} upcoming
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canToggle && (
            <button
              onClick={() => setShowAllMembers(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all hover:opacity-90 active:scale-95"
              style={showAllMembers
                ? { background: VS.blue, border: `1px solid ${VS.blue}`, color: '#fff' }
                : { background: VS.bg1, border: `1px solid ${VS.border}`, color: VS.text1 }
              }
            >
              {showAllMembers ? 'My Milestones' : 'All Members'}
            </button>
          )}
          {isAdminOrOwner && (
            <button
              onClick={() => { setShowAll(v => !v); if (!showAll) { setExpandedCompleted(true); setExpandedUpcoming(true); } }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all hover:opacity-90 active:scale-95"
              style={showAll
                ? { background: VS.accent, border: `1px solid ${VS.accent}`, color: '#fff' }
                : { background: VS.bg1, border: `1px solid ${VS.border}`, color: VS.text1 }
              }
            >
              {showAll ? 'Active Only' : 'Show All'}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 md:px-6 py-4 space-y-6">

        {noMilestones && (
          <div className="flex flex-col items-center justify-center py-20">
            <Flag className="h-12 w-12 mb-4" style={{ color: VS.text2, opacity: 0.4 }} />
            <p className="text-sm font-medium" style={{ color: VS.text1 }}>No milestones yet</p>
            <p className="text-xs mt-1" style={{ color: VS.text2 }}>Generate tasks for a project to create milestones automatically.</p>
          </div>
        )}

        {/* ── Currently Working ── */}
        {currently.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Zap className="h-4 w-4" style={{ color: '#dcdcaa' }} />
              <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: VS.text0 }}>Currently Working</h2>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {currently.map(ms => (
                <MilestoneCard key={ms.id} milestone={ms} variant="active" />
              ))}
            </div>
          </section>
        )}

        {/* ── Completed ── */}
        {completed.length > 0 && (
          <section>
            <button
              onClick={() => setExpandedCompleted(v => !v)}
              className="flex items-center gap-2 mb-3 hover:opacity-80 transition-opacity"
            >
              <CheckCircle2 className="h-4 w-4" style={{ color: VS.teal }} />
              <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: VS.text2 }}>
                Completed ({completed.length})
              </h2>
              {expandedCompleted
                ? <ChevronDown className="h-3.5 w-3.5" style={{ color: VS.text2 }} />
                : <ChevronRight className="h-3.5 w-3.5" style={{ color: VS.text2 }} />
              }
            </button>
            {expandedCompleted && (
              <div className="space-y-2">
                {completed.map(ms => (
                  <MilestoneCard key={ms.id} milestone={ms} variant="completed" />
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── Upcoming ── */}
        {upcoming.length > 0 && (
          <section>
            <button
              onClick={() => setExpandedUpcoming(v => !v)}
              className="flex items-center gap-2 mb-3 hover:opacity-80 transition-opacity"
            >
              <Lock className="h-4 w-4" style={{ color: VS.text2 }} />
              <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: VS.text2 }}>
                Upcoming ({upcoming.length})
              </h2>
              {expandedUpcoming
                ? <ChevronDown className="h-3.5 w-3.5" style={{ color: VS.text2 }} />
                : <ChevronRight className="h-3.5 w-3.5" style={{ color: VS.text2 }} />
              }
            </button>
            {expandedUpcoming && (
              <div className={showAll ? 'grid grid-cols-1 lg:grid-cols-2 gap-4' : 'space-y-2'}>
                {upcoming.map(ms => (
                  <MilestoneCard key={ms.id} milestone={ms} variant={showAll ? 'active' : 'upcoming'} />
                ))}
              </div>
            )}
            {!expandedUpcoming && (
              <p className="text-xs ml-6" style={{ color: VS.text2, fontStyle: 'italic' }}>
                Complete current milestones to unlock
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function MilestoneCard({ milestone: ms, variant }: { milestone: MilestoneItem; variant: 'active' | 'completed' | 'upcoming' }) {
  const progress = ms.taskTotal > 0 ? Math.round((ms.taskCompleted / ms.taskTotal) * 100) : 0;
  const isActive = variant === 'active';
  const isCompleted = variant === 'completed';
  const isUpcoming = variant === 'upcoming';

  return (
    <div
      className="rounded-lg p-4 transition-all"
      style={{
        background: isActive ? VS.bg1 : VS.bg2,
        border: `1px solid ${isActive ? VS.accent + '55' : VS.border}`,
        opacity: isUpcoming ? 0.6 : 1,
      }}
    >
      {/* Project + Milestone name */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {ms.projectColor && (
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: ms.projectColor }} />
            )}
            <span className="text-[11px] font-medium truncate" style={{ color: VS.text2 }}>
              {ms.projectName}
            </span>
          </div>
          <h3 className="text-sm font-semibold" style={{ color: VS.text0 }}>
            {isUpcoming && <Lock className="inline h-3 w-3 mr-1.5" style={{ color: VS.text2 }} />}
            {isCompleted && <CheckCircle2 className="inline h-3 w-3 mr-1.5" style={{ color: VS.teal }} />}
            {ms.name}
          </h3>
          {ms.description && (
            <p className="text-xs mt-0.5 line-clamp-1" style={{ color: VS.text2 }}>{ms.description}</p>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <span className="text-lg font-bold" style={{ color: isCompleted ? VS.teal : VS.text0 }}>{progress}%</span>
          <p className="text-[10px]" style={{ color: VS.text2 }}>
            {ms.taskCompleted}/{ms.taskTotal} tasks
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full overflow-hidden mb-3" style={{ background: VS.bg3 }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${progress}%`,
            background: isCompleted ? VS.teal : VS.accent,
          }}
        />
      </div>

      {/* Task previews (active only) */}
      {isActive && ms.taskPreviews.length > 0 && (
        <div className="space-y-1.5">
          {ms.taskPreviews.map(task => (
            <div
              key={task.id}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded"
              style={{ background: VS.bg2 }}
            >
              <Circle className="h-3 w-3 flex-shrink-0" style={{ color: priorityColors[task.priority] || VS.text2 }} />
              <span className="text-xs truncate flex-1" style={{ color: VS.text1 }}>{task.title}</span>
              {task.assigneeName && (
                <div
                  className="h-5 w-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0"
                  style={{ background: avatarGradient(task.assigneeName) }}
                  title={task.assigneeName}
                >
                  {getInitials(task.assigneeName)}
                </div>
              )}
              <span
                className="text-[9px] px-1.5 py-0.5 rounded font-medium flex-shrink-0"
                style={{
                  background: (priorityColors[task.priority] || VS.text2) + '22',
                  color: priorityColors[task.priority] || VS.text2,
                }}
              >
                {task.priority}
              </span>
            </div>
          ))}
          {ms.taskTotal - ms.taskCompleted > ms.taskPreviews.length && (
            <p className="text-[10px] pl-2.5" style={{ color: VS.text2 }}>
              +{ms.taskTotal - ms.taskCompleted - ms.taskPreviews.length} more tasks
            </p>
          )}
        </div>
      )}

      {/* Due date */}
      {ms.dueDate && (
        <p className="text-[10px] mt-2" style={{ color: VS.text2 }}>
          Due: {new Date(ms.dueDate).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}
