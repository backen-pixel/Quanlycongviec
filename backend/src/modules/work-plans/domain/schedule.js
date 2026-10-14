'use strict';

// Local production clock: fixed Asia/Ho_Chi_Minh UTC+7, no DST.
const OFFSET = 7 * 3600000;
const HOUR = 3600000;
function fail(message) { const e = new Error(message); e.status = 400; throw e; }
function normalize(input) {
  if (!input || !Array.isArray(input.stages) || !Array.isArray(input.tasks)) fail('Cần có công đoạn và nhiệm vụ');
  if (!input.tasks.length || input.tasks.length > 250 || input.stages.length > 100) fail('Kế hoạch cần 1–250 nhiệm vụ, tối đa 100 công đoạn');
  const name = (v) => { const s = String(v || '').trim(); if (!s || s.length > 200) fail('Tên phải có 1–200 ký tự'); return s; };
  const key = (v) => { const s = String(v || ''); if (!/^[a-zA-Z0-9_-]{1,80}$/.test(s)) fail('Mã công đoạn/nhiệm vụ không hợp lệ'); return s; };
  const stages = input.stages.map(s => ({ id: key(s.id), name: name(s.name) }));
  if (new Set(stages.map(s => s.id)).size !== stages.length) fail('Mã công đoạn bị trùng');
  const tasks = input.tasks.map(t => {
    if (!t || typeof t !== 'object') fail('Nhiệm vụ không hợp lệ');
    const hours = Number(t.hours);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 8000 || hours * 4 % 1 !== 0) fail('Thời lượng phải là bội số 0,25 giờ, lớn hơn 0 và không quá 8.000 giờ');
    if (!stages.some(s => s.id === t.stage_id)) fail('Nhiệm vụ chưa thuộc công đoạn hợp lệ');
    if (t.assignee_id && !/^[0-9a-f-]{36}$/i.test(t.assignee_id)) fail('Người phụ trách không hợp lệ');
    if (!Array.isArray(t.dependencies || [])) fail('Danh sách việc trước không hợp lệ');
    if (t.clock_mode && !['working','elapsed'].includes(t.clock_mode)) fail('Cách tính thời lượng không hợp lệ');
    return { id: key(t.id), name: name(t.name), stage_id: t.stage_id, hours,
      role: String(t.role || '').trim().slice(0, 100), assignee_id: t.assignee_id || null,
      required: t.required !== false, evidence_required: t.evidence_required === true, clock_mode:t.clock_mode||'working',
      dependencies: [...new Set(t.dependencies || [])].map(key) };
  });
  if (new Set(tasks.map(t => t.id)).size !== tasks.length) fail('Mã nhiệm vụ bị trùng');
  const byId = new Map(tasks.map(t => [t.id, t])); const order = []; const visiting = new Set(); const visited = new Set();
  function visit(t) {
    if (visiting.has(t.id)) fail('Các nhiệm vụ đang phụ thuộc vòng tròn');
    if (visited.has(t.id)) return;
    visiting.add(t.id);
    for (const id of t.dependencies) { if (!byId.has(id)) fail(`Không tìm thấy việc trước: ${id}`); visit(byId.get(id)); }
    visiting.delete(t.id); visited.add(t.id); order.push(t.id);
  }
  tasks.forEach(visit);
  const c = input.calendar || {};
  if (c.weekdays && !Array.isArray(c.weekdays) || c.shifts && !Array.isArray(c.shifts) || c.holidays && !Array.isArray(c.holidays)) fail('Lịch làm việc không hợp lệ');
  const weekdays = [...new Set(c.weekdays || [1, 2, 3, 4, 5, 6])];
  const shifts = (c.shifts || [[8, 12], [13, 17]]).map(s => [Number(s[0]), Number(s[1])]).sort((a,b) => a[0]-b[0]);
  if (!weekdays.length || weekdays.some(d => !Number.isInteger(d) || d < 0 || d > 6)) fail('Ngày làm việc không hợp lệ');
  if (!shifts.length || shifts.length > 8 || shifts.some((s,i) => !s.every(Number.isFinite) || s.some(h=>h*4%1!==0) || s[0] < 0 || s[1] > 24 || s[0] >= s[1] || (i && shifts[i-1][1] > s[0]))) fail('Ca làm việc không hợp lệ');
  const holidays = [...new Set(c.holidays || [])];
  if (holidays.length > 366 || holidays.some(d => !/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(Date.parse(d)))) fail('Ngày nghỉ không hợp lệ');
  return { stages, tasks, calendar: { timezone: 'Asia/Ho_Chi_Minh', weekdays, shifts, holidays }, order };
}
function clock(calendar) {
  function slots(ms) {
    const local = new Date(ms + OFFSET); const day = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
    if (!calendar.weekdays.includes(local.getUTCDay()) || calendar.holidays.includes(new Date(day).toISOString().slice(0,10))) return [];
    return calendar.shifts.map(([a,b]) => [day - OFFSET + a*HOUR, day - OFFSET + b*HOUR]);
  }
  function move(ms, hours, direction) {
    let remaining = hours * HOUR; let cursor = ms;
    for (let guard = 0; guard < 10000; guard++) {
      const localCursor=new Date(cursor+OFFSET);
      const atMidnight=localCursor.getUTCHours()===0&&localCursor.getUTCMinutes()===0&&localCursor.getUTCSeconds()===0&&localCursor.getUTCMilliseconds()===0;
      const probe=cursor-(direction<0&&atMidnight?1:0);
      const spans = slots(probe); if (direction < 0) spans.reverse();
      for (const [start,end] of spans) {
        const point = direction > 0 ? Math.max(cursor,start) : Math.min(cursor,end);
        const available = direction > 0 ? end-point : point-start;
        if (available <= 0) continue;
        if (remaining <= available) return point + direction*remaining;
        remaining -= available; cursor = direction > 0 ? end : start;
      }
      const local = new Date(probe + OFFSET);
      const midnight = Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate())-OFFSET;
      cursor = direction > 0 ? midnight+86400000 : midnight;
    }
    fail('Lịch vượt phạm vi tính toán');
  }
  return { add: (ms,h) => move(ms,h,1), subtract: (ms,h) => move(ms,h,-1) };
}
function schedule(input, deadline, now = new Date().toISOString(), execution = {}) {
  const graph = normalize(input); const finish = Date.parse(deadline); const current = Date.parse(now);
  if (!Number.isFinite(finish) || !Number.isFinite(current)) fail('Hạn hoàn thành sản xuất không hợp lệ');
  const work = clock(graph.calendar); const byId = new Map(graph.tasks.map(t => [t.id,t])); const dates = {};
  const successors = Object.fromEntries(graph.tasks.map(t => [t.id, []]));
  graph.tasks.forEach(t => t.dependencies.forEach(id => successors[id].push(t.id)));
  for (const id of [...graph.order].reverse()) {
    const end = successors[id].length ? Math.min(...successors[id].map(s => dates[s].start)) : finish;
    const task=byId.get(id);const start = task.clock_mode==='elapsed'?end-task.hours*HOUR:work.subtract(end,task.hours);
    // If deadline is outside a shift, end is the actual last working instant.
    dates[id] = { start, end: task.clock_mode==='elapsed'?end:work.add(start,task.hours) };
  }
  const forecasts = {};
  for (const id of graph.order) {
    const t = byId.get(id); const state = execution[id] || {}; const closed = !state.needs_review && ['done','waived'].includes(state.status);
    const earliest = Math.max(current, ...t.dependencies.map(d => forecasts[d]));
    forecasts[id] = closed && state.completed_at ? Date.parse(state.completed_at) : t.clock_mode==='elapsed'?earliest+t.hours*HOUR:work.add(earliest,t.hours);
  }
  const tasks = graph.tasks.map(t => ({ ...t, planned_start: new Date(dates[t.id].start).toISOString(),
    deadline: new Date(dates[t.id].end).toISOString(), forecast_finish: new Date(forecasts[t.id]).toISOString(),
    status: execution[t.id]?.status || 'pending', completed_at: execution[t.id]?.completed_at || null,
    evidence: execution[t.id]?.evidence || '', reason: execution[t.id]?.reason || '',
    needs_review: execution[t.id]?.needs_review === true,
    completed_late: !!execution[t.id]?.completed_at && Date.parse(execution[t.id].completed_at) > dates[t.id].end,
    ready: t.dependencies.every(d => !execution[d]?.needs_review && ['done','waived'].includes(execution[d]?.status)),
    overdue: (execution[t.id]?.needs_review || !['done','waived'].includes(execution[t.id]?.status)) && current > dates[t.id].end }));
  const collisions = [];
  for (let i = 0; i < tasks.length; i++) for (let j = i+1; j < tasks.length; j++) {
    const a = tasks[i]; const b = tasks[j];
    if (a.assignee_id && a.assignee_id === b.assignee_id && a.planned_start < b.deadline && b.planned_start < a.deadline)
      collisions.push({ assignee_id: a.assignee_id, tasks: [a.id,b.id] });
  }
  return { graph: { stages: graph.stages, tasks: graph.tasks, calendar: graph.calendar }, deadline: new Date(finish).toISOString(), tasks, collisions,
    forecast_finish: new Date(Math.max(...Object.values(forecasts))).toISOString(),
    feasible: Math.max(...Object.values(forecasts)) <= finish,
    stages: graph.stages.map(s => ({ ...s, complete: tasks.filter(t => t.stage_id === s.id && t.required).every(t => !t.needs_review && ['done','waived'].includes(t.status)),
      total: tasks.filter(t => t.stage_id === s.id).length })) };
}
function templateGraph(input) {
  const { stages, tasks, calendar } = normalize(input);
  return { stages, calendar: { ...calendar, holidays: [] }, tasks: tasks.map(({ assignee_id, ...t }) => ({ ...t, assignee_id: null })) };
}
module.exports = { normalize, schedule, templateGraph, clock, fail };
