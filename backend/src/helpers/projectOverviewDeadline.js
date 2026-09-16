/**
 * Hạn thẻ tổng quan nhiệm vụ dự án = hạn module (CRM / SX / VC-LĐ)
 * theo lane của nhóm việc. Việc con trống hạn được ghi cùng hạn module.
 */
const { MODULE, resolveModuleDeadline } = require('./moduleDeadlinePolicy');

const STAMP_TABLE = Object.freeze({
  task: { table: 'tasks', column: 'due_date' },
  crm_task: { table: 'crm_tasks', column: 'deadline' },
  crm_assignment: { table: 'crm_assignments', column: 'deadline' },
});
const STAMP_ID_CHUNK = 80;

function moduleKeyForOwnerLane(lane) {
  if (lane === 'sales') return MODULE.CRM;
  if (lane === 'logistics') return MODULE.LOGISTICS;
  return MODULE.PRODUCTION;
}

function earliestOpenChildDeadline(openChildren) {
  const deadlines = (openChildren || [])
    .map((task) => task.deadline)
    .filter(Boolean)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  return deadlines[0] || null;
}

function resolveOverviewGroupDeadline({
  lane,
  project = null,
  lead = null,
  sxStage = null,
  vcStage = null,
  openChildren = [],
} = {}) {
  const moduleKey = moduleKeyForOwnerLane(lane);
  const childDeadline = earliestOpenChildDeadline(openChildren);
  let item = null;
  let stage = null;
  if (moduleKey === MODULE.CRM) {
    item = {
      ...(lead || {}),
      crm_next_open_task_deadline: lead?.crm_next_open_task_deadline || childDeadline,
    };
    stage = lead?.stage || null;
  } else if (moduleKey === MODULE.LOGISTICS) {
    item = project;
    stage = vcStage || project?.vc_pipeline_stage || null;
  } else {
    item = project;
    stage = sxStage || project?.sx_pipeline_stage || null;
  }
  const resolved = resolveModuleDeadline(moduleKey, item, { stage, forDisplay: true });
  return resolved.deadlineAt || childDeadline || null;
}

function collectOpenChildDeadlineStamps(deadline, openChildren) {
  if (!deadline) return [];
  const ts = new Date(deadline).getTime();
  if (!Number.isFinite(ts)) return [];
  const iso = new Date(ts).toISOString();
  const rows = [];
  for (const child of openChildren || []) {
    if (child?.deadline || !child?.source_id) continue;
    const source = String(child.source || '');
    if (!STAMP_TABLE[source]) continue;
    rows.push({ source, id: String(child.source_id), iso });
  }
  return rows;
}

function bucketStampRows(rows) {
  const buckets = new Map();
  for (const row of rows || []) {
    const spec = STAMP_TABLE[row?.source];
    if (!spec || !row?.id || !row?.iso) continue;
    const key = `${row.source}\t${row.iso}`;
    if (!buckets.has(key)) buckets.set(key, { spec, iso: row.iso, ids: [] });
    buckets.get(key).ids.push(row.id);
  }
  return [...buckets.values()];
}

async function stampOpenChildModuleDeadlines(rows, client) {
  const db = client || require('../config/supabase').supabase;
  const buckets = bucketStampRows(rows);
  let stamped = 0;
  for (const bucket of buckets) {
    const unique = [...new Set(bucket.ids.map(String))];
    for (let i = 0; i < unique.length; i += STAMP_ID_CHUNK) {
      const part = unique.slice(i, i + STAMP_ID_CHUNK);
      const { error, count } = await db
        .from(bucket.spec.table)
        .update({ [bucket.spec.column]: bucket.iso }, { count: 'exact' })
        .in('id', part)
        .is(bucket.spec.column, null);
      if (error) {
        console.warn('[project-overview] stamp child deadline:', bucket.spec.table, error.message);
        continue;
      }
      stamped += Number(count) || 0;
    }
  }
  return stamped;
}

module.exports = {
  moduleKeyForOwnerLane,
  earliestOpenChildDeadline,
  resolveOverviewGroupDeadline,
  collectOpenChildDeadlineStamps,
  bucketStampRows,
  stampOpenChildModuleDeadlines,
  STAMP_TABLE,
};
