'use strict';
const { fail } = require('./schedule');
function reportWindow(date, now = new Date().toISOString()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) fail('Ngày báo cáo cần YYYY-MM-DD');
  const start = Date.parse(`${date}T00:00:00+07:00`);
  if (!Number.isFinite(start) || new Date(start + 7 * 3600000).toISOString().slice(0, 10) !== date) fail('Ngày báo cáo không hợp lệ');
  if (start > Date.parse(now)) fail('Ngày báo cáo chưa diễn ra');
  return { start, end: Math.min(start + 86400000, Date.parse(now)), date, read_at: now };
}
function summarizePlans(plans, window) {
  const totals = { projects: plans.length, tasks: 0, due_in_day: 0, completed_in_day: 0, due_completed_on_time: 0, overdue_at_cutoff: 0, needs_review: 0 };
  const tasks = [];
  for (const { project_id, document, actor_id, can_manage } of plans) {
    if (!document?.active) continue;
    if (document.active.plan_schema_version !== 2) fail('Kế hoạch cần được duyệt lại để có mốc lịch báo cáo');
    for (const t of document.active.planned_tasks) {
      if (!can_manage && t.assignee_id !== actor_id) continue;
      const actual = document.execution?.[t.id] || {};
      const closed = !actual.needs_review && ['done', 'waived'].includes(actual.status);
      const completed = Date.parse(actual.completed_at);
      const due = Date.parse(t.deadline);
      const dueInDay = due >= window.start && due < window.start + 86400000;
      const doneInDay = actual.status === 'done' && !actual.needs_review && completed >= window.start && completed < window.end;
      totals.tasks++;
      if (dueInDay) totals.due_in_day++;
      if (doneInDay) totals.completed_in_day++;
      if (dueInDay && actual.status === 'done' && closed && completed <= due) totals.due_completed_on_time++;
      if (!closed && due < window.end) totals.overdue_at_cutoff++;
      if (actual.needs_review) totals.needs_review++;
      tasks.push({ ...t, project_id, status: actual.needs_review ? 'needs_review' : actual.status || 'pending', completed_at: actual.completed_at || null, overdue: !closed && due < window.end, completed_in_day: doneInDay });
    }
  }
  tasks.sort((a,b) => a.deadline.localeCompare(b.deadline));
  return { ...window, cutoff_at: new Date(window.end).toISOString(), totals, tasks };
}
module.exports = { reportWindow, summarizePlans };
