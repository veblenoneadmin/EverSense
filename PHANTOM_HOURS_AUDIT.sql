-- ════════════════════════════════════════════════════════════════════════════
-- PHANTOM HOURS AUDIT — find impossibly inflated time_logs rows
-- ════════════════════════════════════════════════════════════════════════════
-- These queries are READ-ONLY. They find rows that look wrong, so you can
-- review them before deciding whether to clean up.
--
-- A phantom row is one where:
--   · Single time_log entry has duration > 12 hours (impossible — daily cap is 8h)
--   · OR time_log duration > containing attendance_log's duration
--   · OR time_log spans multiple days (begin and end on different dates)
-- ════════════════════════════════════════════════════════════════════════════


-- ── Q1: Single-entry inflated rows (>12h on one task in one entry) ──────────
SELECT u.email AS userEmail,
       m.title AS taskTitle,
       tl.id   AS timeLogId,
       tl.taskId,
       tl.begin,
       tl.end,
       tl.duration                    AS secs,
       ROUND(tl.duration / 3600, 2)   AS hours,
       tl.category
  FROM time_logs tl
  JOIN User u        ON u.id = tl.userId
  LEFT JOIN macro_tasks m ON m.id = tl.taskId
 WHERE tl.duration > 12 * 3600       -- 12 hours
 ORDER BY tl.duration DESC
 LIMIT 100;


-- ── Q2: time_logs that span multiple calendar days (likely leak across sessions) ─
SELECT u.email AS userEmail,
       m.title AS taskTitle,
       tl.id   AS timeLogId,
       tl.begin,
       tl.end,
       DATEDIFF(tl.end, tl.begin) AS days_span,
       ROUND(tl.duration / 3600, 2) AS hours
  FROM time_logs tl
  JOIN User u        ON u.id = tl.userId
  LEFT JOIN macro_tasks m ON m.id = tl.taskId
 WHERE tl.end IS NOT NULL
   AND DATEDIFF(tl.end, tl.begin) >= 1   -- spans 1+ day boundaries
 ORDER BY days_span DESC, tl.duration DESC
 LIMIT 100;


-- ── Q3: time_logs whose duration exceeds the attendance row that contained them ─
-- This finds rows where the user logged MORE task time than they were even
-- clocked in for — clearest signal of inflation.
SELECT u.email AS userEmail,
       m.title AS taskTitle,
       tl.id   AS timeLogId,
       ROUND(tl.duration / 3600, 2)  AS task_hours,
       ROUND(al.duration / 3600, 2)  AS attendance_hours,
       ROUND((tl.duration - al.duration) / 3600, 2) AS excess_hours,
       al.timeIn,
       al.timeOut
  FROM time_logs tl
  JOIN User u   ON u.id = tl.userId
  LEFT JOIN macro_tasks m   ON m.id = tl.taskId
  -- Match each time_log to the attendance_log whose [timeIn, timeOut] window contains tl.begin
  JOIN attendance_logs al ON al.userId = tl.userId
                          AND tl.begin >= al.timeIn
                          AND (al.timeOut IS NULL OR tl.begin < al.timeOut)
 WHERE tl.end IS NOT NULL
   AND al.timeOut IS NOT NULL
   AND tl.duration > al.duration + 600  -- task time > attendance time by >10 min
 ORDER BY excess_hours DESC
 LIMIT 100;


-- ── Q4: Per-task drift summary (time_logs SUM vs macro_tasks.actualHours) ───
-- This is what the reconciliation cron flags. Run it now to see the current state.
SELECT m.id,
       m.title,
       u.email AS primaryUserEmail,
       ROUND(SUM(tl.duration) / 3600, 2)  AS time_logs_total_hours,
       m.actualHours                       AS actualHours_recorded,
       ROUND(SUM(tl.duration) / 3600 - CAST(m.actualHours AS DECIMAL(10,2)), 2) AS drift_hours
  FROM macro_tasks m
  LEFT JOIN time_logs tl ON tl.taskId = m.id AND tl.end IS NOT NULL
  LEFT JOIN User u ON u.id = m.userId
 GROUP BY m.id
HAVING ABS(time_logs_total_hours - CAST(actualHours_recorded AS DECIMAL(10,2))) > 0.5
 ORDER BY ABS(drift_hours) DESC
 LIMIT 100;


-- ════════════════════════════════════════════════════════════════════════════
-- POSSIBLE CLEANUP STATEMENTS (DO NOT RUN UNTIL REVIEWED)
-- ════════════════════════════════════════════════════════════════════════════
-- These are commented out by default. Review the results of Q1-Q4 first,
-- then decide which fix (if any) is appropriate per row.

-- ── Option A: Cap each time_log at the attendance row's duration ────────────
-- Sets duration to MIN(current_duration, attendance.duration). Conservative.
-- UPDATE time_logs tl
--   JOIN attendance_logs al ON al.userId = tl.userId
--                           AND tl.begin >= al.timeIn
--                           AND (al.timeOut IS NULL OR tl.begin < al.timeOut)
--    SET tl.duration = LEAST(tl.duration, al.duration),
--        tl.end      = LEAST(tl.end, al.timeOut)
--  WHERE tl.duration > al.duration + 600;

-- ── Option B: Hard-cap any single time_log at 8 hours ───────────────────────
-- For rows where Q1 returns hours > 12. Aggressive but simple.
-- UPDATE time_logs SET duration = 8 * 3600 WHERE duration > 12 * 3600;

-- ── Option C: Delete time_logs that span multiple days ──────────────────────
-- For Q2 results. Most aggressive — only do this for clearly broken rows.
-- DELETE FROM time_logs WHERE end IS NOT NULL AND DATEDIFF(end, begin) >= 1;
