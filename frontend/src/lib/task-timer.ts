// Shared task-timer utilities — operate directly on localStorage so they work
// even when the Tasks component is not mounted. After updating localStorage,
// a window event is dispatched so Tasks can sync its React state if it IS open.

function safeParse<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(key) || 'null') as T; } catch { return null; }
}

function clearBackendTimer(taskId?: string, beganAt?: number, elapsed?: number) {
  // If we have session data, POST it so the backend writes a time_logs row
  // for the Time-by-Person breakdown. Otherwise just clear active_timers
  // (old behaviour — preserved for any caller that doesn't know the session).
  const body = taskId && beganAt && elapsed && elapsed > 0
    ? JSON.stringify({ taskId, beganAt, endedAt: Date.now(), duration: elapsed })
    : '{}';
  fetch('/api/tasks/timer/stop', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body,
  }).catch(() => {});
}

function notifyBackendTimerStart(taskId: string, startedAt: number) {
  fetch('/api/tasks/timer/start', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId, startedAt }) }).catch(() => {});
}

export function pauseTaskTimer() {
  const active = safeParse<{ taskId: string; startTime: number }>('task_timer_active');
  if (!active?.taskId || localStorage.getItem('task_timer_paused')) return;

  const storedStart = Number(localStorage.getItem('task_timer_start') || 0);
  const elapsed = storedStart ? Math.floor((Date.now() - storedStart) / 1000) : 0;
  const accum = safeParse<Record<string, number>>('task_timers') || {};
  accum[active.taskId] = (accum[active.taskId] || 0) + elapsed;
  localStorage.setItem('task_timers', JSON.stringify(accum));
  localStorage.removeItem('task_timer_start');
  localStorage.setItem('task_timer_paused', active.taskId);

  // Pass session data so the backend writes a time_logs row for this segment.
  clearBackendTimer(active.taskId, storedStart || undefined, elapsed);
  window.dispatchEvent(new CustomEvent('task-timer-pause'));
}

export function resumeTaskTimer() {
  const pausedTaskId = localStorage.getItem('task_timer_paused');
  if (!pausedTaskId) return;

  const startTime = Date.now();
  localStorage.setItem('task_timer_active', JSON.stringify({ taskId: pausedTaskId, startTime }));
  localStorage.setItem('task_timer_start', String(startTime));
  localStorage.removeItem('task_timer_paused');

  notifyBackendTimerStart(pausedTaskId, startTime);
  window.dispatchEvent(new CustomEvent('task-timer-resume'));
}

export function stopTaskTimer() {
  const active = safeParse<{ taskId: string; startTime: number }>('task_timer_active');
  const pausedTaskId = localStorage.getItem('task_timer_paused');
  const taskId = active?.taskId || pausedTaskId;
  if (!taskId) return;

  const storedStart = Number(localStorage.getItem('task_timer_start') || 0);
  const elapsed = storedStart ? Math.floor((Date.now() - storedStart) / 1000) : 0;
  if (elapsed > 0) {
    const accum = safeParse<Record<string, number>>('task_timers') || {};
    accum[taskId] = (accum[taskId] || 0) + elapsed;
    localStorage.setItem('task_timers', JSON.stringify(accum));
  }
  localStorage.removeItem('task_timer_active');
  localStorage.removeItem('task_timer_start');
  localStorage.removeItem('task_timer_paused');

  // Pass session data so the backend writes a time_logs row. Without this,
  // time worked right before clock-out is lost from contribution totals.
  clearBackendTimer(taskId, storedStart || undefined, elapsed);
  window.dispatchEvent(new CustomEvent('task-timer-stop'));
}
