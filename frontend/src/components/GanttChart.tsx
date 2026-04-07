import React, { useMemo, useRef, useState } from 'react';
import { VS } from '../lib/theme';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';

interface Task {
  id: string;
  title: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'on_hold' | 'cancelled';
  priority: 'Urgent' | 'High' | 'Medium' | 'Low';
  dueDate?: string;
  createdAt: string;
  estimatedHours: number;
  actualHours: number;
  assignees?: { id: string; name: string; email: string; image?: string | null }[];
  project?: string;
}

interface GanttChartProps {
  tasks: Task[];
  onTaskClick?: (task: Task) => void;
}

const STATUS_COLORS: Record<string, string> = {
  not_started: '#569cd6',
  in_progress: '#dcdcaa',
  on_hold:     '#f44747',
  completed:   '#4ec9b0',
  cancelled:   '#ce9178',
};

const STATUS_LABELS: Record<string, string> = {
  not_started: 'To Do',
  in_progress: 'In Progress',
  on_hold:     'On Hold',
  completed:   'Done',
  cancelled:   'Cancelled',
};

const PRIORITY_MARKERS: Record<string, string> = {
  Urgent: '#c586c0',
  High:   '#f44747',
  Medium: '#dcdcaa',
  Low:    '#4ec9b0',
};

function getInitials(name?: string) {
  if (!name) return '?';
  return name.split(/[\s@.]+/).filter(Boolean).map(s => s[0]?.toUpperCase()).slice(0, 2).join('');
}

const AVATAR_COLORS = [
  'linear-gradient(135deg,#6366f1,#8b5cf6)',
  'linear-gradient(135deg,#f59e0b,#ef4444)',
  'linear-gradient(135deg,#10b981,#06b6d4)',
  'linear-gradient(135deg,#ec4899,#f43f5e)',
  'linear-gradient(135deg,#3b82f6,#6366f1)',
];

function avatarGradient(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

type ZoomLevel = 'day' | 'week' | 'month';

export default function GanttChart({ tasks, onTaskClick }: GanttChartProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<ZoomLevel>('week');
  const [offset, setOffset] = useState(0); // weeks offset from current

  const ROW_HEIGHT = 44;
  const HEADER_HEIGHT = 52;
  const LABEL_WIDTH = 300;
  const DAY_WIDTH = zoom === 'day' ? 48 : zoom === 'week' ? 24 : 8;

  // Sort tasks: in_progress first, then by priority, then by due date
  const sortedTasks = useMemo(() => {
    const priorityOrder: Record<string, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
    const statusOrder: Record<string, number> = { in_progress: 0, not_started: 1, on_hold: 2, completed: 3, cancelled: 4 };
    return [...tasks].sort((a, b) => {
      const sd = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
      if (sd !== 0) return sd;
      const pd = (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9);
      if (pd !== 0) return pd;
      const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return da - db;
    });
  }, [tasks]);

  // Timeline range
  const { rangeStart, rangeEnd, totalDays, columns } = useMemo(() => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    let start: Date, end: Date;
    if (zoom === 'month') {
      start = new Date(today);
      start.setUTCMonth(start.getUTCMonth() - 1 + offset * 3);
      start.setUTCDate(1);
      end = new Date(start);
      end.setUTCMonth(end.getUTCMonth() + 6);
    } else if (zoom === 'week') {
      start = new Date(today);
      start.setUTCDate(start.getUTCDate() - start.getUTCDay() - 7 + offset * 14);
      end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 56);
    } else {
      start = new Date(today);
      start.setUTCDate(start.getUTCDate() - 3 + offset * 7);
      end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 21);
    }

    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

    // Build column headers
    const cols: { label: string; subLabel?: string; x: number; width: number; isToday?: boolean; isWeekend?: boolean }[] = [];
    if (zoom === 'day') {
      for (let i = 0; i < days; i++) {
        const d = new Date(start);
        d.setUTCDate(d.getUTCDate() + i);
        const isWeekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
        const isToday = d.toISOString().slice(0, 10) === today.toISOString().slice(0, 10);
        cols.push({
          label: d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
          subLabel: d.getUTCDate().toString(),
          x: i * DAY_WIDTH,
          width: DAY_WIDTH,
          isToday,
          isWeekend,
        });
      }
    } else if (zoom === 'week') {
      for (let i = 0; i < days; i++) {
        const d = new Date(start);
        d.setUTCDate(d.getUTCDate() + i);
        const isWeekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
        const isToday = d.toISOString().slice(0, 10) === today.toISOString().slice(0, 10);
        const isMonday = d.getUTCDay() === 1;
        cols.push({
          label: isMonday || i === 0 ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '',
          x: i * DAY_WIDTH,
          width: DAY_WIDTH,
          isToday,
          isWeekend,
        });
      }
    } else {
      for (let i = 0; i < days; i++) {
        const d = new Date(start);
        d.setUTCDate(d.getUTCDate() + i);
        const isFirst = d.getUTCDate() === 1;
        const isToday = d.toISOString().slice(0, 10) === today.toISOString().slice(0, 10);
        cols.push({
          label: isFirst || i === 0 ? d.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }) : '',
          x: i * DAY_WIDTH,
          width: DAY_WIDTH,
          isToday,
        });
      }
    }

    return { rangeStart: start, rangeEnd: end, totalDays: days, columns: cols };
  }, [zoom, offset, DAY_WIDTH]);

  // Map task to bar position
  function getTaskBar(task: Task) {
    const created = new Date(task.createdAt);
    created.setUTCHours(0, 0, 0, 0);

    // End date: dueDate if set, otherwise created + estimatedHours (min 1 day)
    let end: Date;
    if (task.dueDate) {
      end = new Date(task.dueDate);
      end.setUTCHours(0, 0, 0, 0);
    } else {
      end = new Date(created);
      const daysFromHours = Math.max(1, Math.ceil(task.estimatedHours / 8));
      end.setUTCDate(end.getUTCDate() + daysFromHours);
    }

    // Ensure min 1 day width
    if (end <= created) {
      end = new Date(created);
      end.setUTCDate(end.getUTCDate() + 1);
    }

    const startOffset = (created.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24);
    const duration = (end.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);

    return {
      x: startOffset * DAY_WIDTH,
      width: Math.max(duration * DAY_WIDTH, DAY_WIDTH),
      startDate: created,
      endDate: end,
    };
  }

  const chartWidth = totalDays * DAY_WIDTH;
  const chartHeight = sortedTasks.length * ROW_HEIGHT;
  const todayX = ((new Date().getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24)) * DAY_WIDTH;

  return (
    <div className="flex flex-col flex-1 overflow-hidden rounded-xl" style={{ background: VS.bg1, border: `1px solid ${VS.border}` }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: `1px solid ${VS.border}`, background: VS.bg2 }}>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOffset(o => o - 1)}
            className="p-1.5 rounded-lg transition-colors hover:opacity-80"
            style={{ background: VS.bg3, border: `1px solid ${VS.border}`, color: VS.text1 }}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setOffset(0)}
            className="px-3 py-1 rounded-lg text-[11px] font-semibold transition-colors hover:opacity-80"
            style={{ background: VS.accent + '22', border: `1px solid ${VS.accent}55`, color: VS.accent }}
          >
            Today
          </button>
          <button
            onClick={() => setOffset(o => o + 1)}
            className="p-1.5 rounded-lg transition-colors hover:opacity-80"
            style={{ background: VS.bg3, border: `1px solid ${VS.border}`, color: VS.text1 }}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {(['day', 'week', 'month'] as const).map(z => (
            <button
              key={z}
              onClick={() => { setZoom(z); setOffset(0); }}
              className="px-3 py-1 rounded-lg text-[11px] font-semibold transition-all"
              style={zoom === z
                ? { background: VS.accent, color: '#fff', border: `1px solid ${VS.accent}` }
                : { background: VS.bg3, color: VS.text1, border: `1px solid ${VS.border}` }
              }
            >
              {z === 'day' ? 'Day' : z === 'week' ? 'Week' : 'Month'}
            </button>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3">
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-sm" style={{ background: STATUS_COLORS[key] }} />
              <span className="text-[10px]" style={{ color: VS.text2 }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Chart body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Task labels (frozen left column) */}
        <div className="flex-shrink-0 overflow-y-auto" style={{ width: LABEL_WIDTH, borderRight: `1px solid ${VS.border}` }}>
          {/* Header spacer */}
          <div style={{ height: HEADER_HEIGHT, borderBottom: `1px solid ${VS.border}`, background: VS.bg2 }} />
          {/* Task rows */}
          {sortedTasks.map((task, i) => (
            <div
              key={task.id}
              className="flex items-center gap-2.5 px-3 cursor-pointer transition-colors hover:opacity-90"
              style={{
                height: ROW_HEIGHT,
                borderBottom: `1px solid ${VS.border}`,
                background: i % 2 === 0 ? 'transparent' : VS.bg2 + '66',
              }}
              onClick={() => onTaskClick?.(task)}
            >
              {/* Priority dot */}
              <div
                className="h-2 w-2 rounded-full flex-shrink-0"
                style={{ background: PRIORITY_MARKERS[task.priority] }}
                title={task.priority}
              />
              {/* Title */}
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium truncate" style={{ color: VS.text0 }}>
                  {task.title}
                </p>
                <p className="text-[10px] truncate" style={{ color: VS.text2 }}>
                  {task.project || STATUS_LABELS[task.status]}
                </p>
              </div>
              {/* Assignee avatars */}
              <div className="flex -space-x-1.5">
                {(task.assignees || []).slice(0, 2).map(a => (
                  <div
                    key={a.id}
                    className="h-5 w-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white border border-black/30"
                    style={{ background: avatarGradient(a.name || a.email) }}
                    title={a.name || a.email}
                  >
                    {getInitials(a.name || a.email)}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Timeline area (scrollable) */}
        <div ref={scrollRef} className="flex-1 overflow-auto">
          <div style={{ width: chartWidth, minHeight: '100%' }}>
            {/* Column headers */}
            <div className="sticky top-0 z-10 flex" style={{ height: HEADER_HEIGHT, borderBottom: `1px solid ${VS.border}`, background: VS.bg2 }}>
              {columns.map((col, i) => (
                <div
                  key={i}
                  className="flex-shrink-0 flex flex-col items-center justify-center"
                  style={{
                    width: col.width,
                    borderRight: col.label ? `1px solid ${VS.border}` : 'none',
                    background: col.isToday ? VS.accent + '15' : col.isWeekend ? VS.bg3 + '55' : 'transparent',
                  }}
                >
                  {col.label && (
                    <span className="text-[10px] font-medium" style={{ color: col.isToday ? VS.accent : VS.text2 }}>
                      {col.label}
                    </span>
                  )}
                  {col.subLabel && (
                    <span className="text-[11px] font-bold" style={{ color: col.isToday ? VS.accent : VS.text1 }}>
                      {col.subLabel}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Task bars */}
            <div style={{ position: 'relative' }}>
              {/* Row backgrounds + grid lines */}
              {sortedTasks.map((_, i) => (
                <div
                  key={i}
                  style={{
                    height: ROW_HEIGHT,
                    borderBottom: `1px solid ${VS.border}`,
                    background: i % 2 === 0 ? 'transparent' : VS.bg2 + '66',
                  }}
                />
              ))}

              {/* Weekend shading */}
              {columns.filter(c => c.isWeekend).map((col, i) => (
                <div
                  key={`we-${i}`}
                  style={{
                    position: 'absolute', top: 0, left: col.x, width: col.width, height: chartHeight,
                    background: VS.bg3 + '33', pointerEvents: 'none',
                  }}
                />
              ))}

              {/* Today line */}
              {todayX >= 0 && todayX <= chartWidth && (
                <div
                  style={{
                    position: 'absolute', top: 0, left: todayX, width: 2, height: chartHeight,
                    background: VS.accent, zIndex: 5, opacity: 0.7,
                  }}
                />
              )}

              {/* Task bars overlay */}
              {sortedTasks.map((task, i) => {
                const bar = getTaskBar(task);
                const color = STATUS_COLORS[task.status] || VS.blue;
                const progress = task.estimatedHours > 0
                  ? Math.min(task.actualHours / task.estimatedHours, 1)
                  : task.status === 'completed' ? 1 : 0;

                return (
                  <div
                    key={task.id}
                    className="absolute cursor-pointer group"
                    style={{
                      top: i * ROW_HEIGHT + 8,
                      left: Math.max(bar.x, 0),
                      width: Math.min(bar.width, chartWidth - Math.max(bar.x, 0)),
                      height: ROW_HEIGHT - 16,
                    }}
                    onClick={() => onTaskClick?.(task)}
                  >
                    {/* Bar background */}
                    <div
                      className="h-full rounded-md transition-all group-hover:opacity-90"
                      style={{
                        background: color + '30',
                        border: `1px solid ${color}66`,
                        position: 'relative',
                        overflow: 'hidden',
                      }}
                    >
                      {/* Progress fill */}
                      <div
                        className="absolute inset-0 rounded-md"
                        style={{
                          width: `${progress * 100}%`,
                          background: color + '55',
                        }}
                      />
                      {/* Label inside bar */}
                      {bar.width > 60 && (
                        <span
                          className="absolute inset-0 flex items-center px-2 text-[10px] font-medium truncate"
                          style={{ color: VS.text0, zIndex: 1 }}
                        >
                          {task.title}
                        </span>
                      )}
                    </div>

                    {/* Tooltip on hover */}
                    <div
                      className="absolute left-0 bottom-full mb-1 hidden group-hover:block z-20 pointer-events-none"
                      style={{ minWidth: 200 }}
                    >
                      <div className="rounded-lg p-2.5 text-[11px] shadow-xl" style={{ background: VS.bg0, border: `1px solid ${VS.border2}`, color: VS.text0 }}>
                        <p className="font-semibold mb-1">{task.title}</p>
                        <div className="flex items-center gap-2 mb-0.5">
                          <div className="h-2 w-2 rounded-sm" style={{ background: color }} />
                          <span style={{ color: VS.text2 }}>{STATUS_LABELS[task.status]}</span>
                          <span style={{ color: PRIORITY_MARKERS[task.priority] }}>({task.priority})</span>
                        </div>
                        <p style={{ color: VS.text2 }}>
                          {bar.startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
                          {' — '}
                          {bar.endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
                        </p>
                        {task.estimatedHours > 0 && (
                          <p style={{ color: VS.text2 }}>
                            {task.actualHours}h / {task.estimatedHours}h ({Math.round(progress * 100)}%)
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Empty state */}
      {sortedTasks.length === 0 && (
        <div className="flex items-center justify-center py-16" style={{ color: VS.text2 }}>
          <p className="text-sm">No tasks with dates to display on the Gantt chart.</p>
        </div>
      )}
    </div>
  );
}
