/**
 * Hạn thẻ tổng quan: CRM và VC/LĐ dùng hạn module.
 * Sản xuất lấy hạn từ lịch 7 ngày tính lùi theo ngày lắp (kế hoạch SX),
 * theo nhóm hạn của việc còn mở. Hạn giao hàng của dự án không kéo cả danh mục vào Quá hạn.
 * Danh mục chỉ hoàn thành khi việc nhỏ bên trong đã xong.
 */
const { MODULE, resolveModuleDeadline, isInstallDeadlineClosed } = require('./moduleDeadlinePolicy');
const { isSxPipelineStageNoDeadline } = require('./crmPipelineSla');
const { companyDeadlineIsoFromYmd } = require('./companyDeadlineClock');
const {
  ymdFromUnknownDate,
  resolveSxPlanInstallYmd,
  buildSxInstallBackPlan,
  endYmdForDeadlineGroup,
  sxStageDeadlineGroup,
} = require('./sxWorkshopSchedule');

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

function ymdOf(value) {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  const dateOnly = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateOnly && text.length <= 10) return dateOnly[1];
  const ts = new Date(text).getTime();
  if (!Number.isFinite(ts)) return null;
  const shifted = new Date(ts + 7 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

function countsAsTaskOrAssignmentDeadline(task) {
  const source = String(task?.source || '');
  if (!source) return true;
  return source === 'crm_task' || source === 'crm_assignment';
}

const CRM_WORK_DONE = new Set(['done', 'completed']);

function normTaskTitle(value) {
  return String(value || '').trim().toLowerCase();
}

function sxCrmSyncKey(projectId, title) {
  const project = String(projectId || '');
  const name = normTaskTitle(title);
  if (!project || !name) return '';
  return `${project}\t${name}`;
}

function crmSxRowState(status) {
  const s = String(status || '').toLowerCase();
  if (CRM_WORK_DONE.has(s)) return 'done';
  if (s === 'cancelled' || s === 'canceled') return 'skip';
  return 'open';
}

/**
 * Cùng tên trên dự án: chỉ coi xong khi mọi bản CRM SX của tên đó đã xong.
 * Còn một bản đang mở thì việc xưởng cùng tên chưa xong. Nhóm hạn lấy từ bản còn mở.
 */
function indexSxCrmCompletion(rows, leadProjectById) {
  const map = new Map();
  const projects = leadProjectById instanceof Map ? leadProjectById : new Map();
  for (const row of rows || []) {
    const slug = String(row?.stage_slug || '');
    if (!slug.startsWith('sx_') && !row?.production_pipeline_stage_id) continue;
    const projectId = projects.get(String(row.lead_id || ''));
    const key = sxCrmSyncKey(projectId, row.title);
    if (!key) continue;
    const state = crmSxRowState(row.status);
    const stageId = row.production_pipeline_stage_id ? String(row.production_pipeline_stage_id) : '';
    const prev = map.get(key);
    if (!prev) {
      map.set(key, {
        done: state === 'done',
        hasOpen: state === 'open',
        stageId,
        openStageId: state === 'open' ? stageId : '',
      });
      continue;
    }
    if (state === 'open') {
      prev.hasOpen = true;
      prev.done = false;
      if (stageId) prev.openStageId = stageId;
    } else if (state === 'done' && !prev.hasOpen) {
      prev.done = true;
    }
    if (!prev.stageId && stageId) prev.stageId = stageId;
  }
  return map;
}

function workshopChildDone(task, crmIndex) {
  const status = String(task?.status || '').toLowerCase();
  if (status === 'done' || status === 'completed' || status === 'cancelled' || status === 'canceled') return true;
  const key = sxCrmSyncKey(task?.project_id, task?.title);
  if (!key || !(crmIndex instanceof Map)) return false;
  return crmIndex.get(key)?.done === true;
}

function deadlineGroupForWorkshopChild(task, crmIndex, stageById) {
  const key = sxCrmSyncKey(task?.project_id, task?.title);
  const hit = key && crmIndex instanceof Map ? crmIndex.get(key) : null;
  const stageId = hit?.openStageId || hit?.stageId || '';
  const stage = stageId && stageById instanceof Map ? stageById.get(stageId) : null;
  return stage ? (sxStageDeadlineGroup(stage) || '') : '';
}

/** Hạn cuối của một nhóm trong lịch 7 ngày (lùi từ ngày lắp). */
function sxInstallPlanDeadlineIso(project, deadlineGroup) {
  const group = String(deadlineGroup || '').trim();
  if (!group || !project) return null;
  const installYmd = resolveSxPlanInstallYmd(project);
  if (!installYmd) return null;
  const startYmd = ymdFromUnknownDate(project.sx_reception_date)
    || ymdFromUnknownDate(project.created_at);
  const plan = buildSxInstallBackPlan(installYmd, {
    startYmd,
    slipDays: project.sx_schedule_slip_days,
  });
  const endYmd = endYmdForDeadlineGroup(plan, group);
  if (!endYmd) return null;
  return companyDeadlineIsoFromYmd(endYmd, project.company_id);
}

function earliestSxPlanDeadline(project, deadlineGroups) {
  const isos = [];
  const seen = new Set();
  for (const group of deadlineGroups || []) {
    const key = String(group || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const iso = sxInstallPlanDeadlineIso(project, key);
    if (iso) isos.push(iso);
  }
  isos.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  return isos[0] || null;
}

function earliestOpenChildDeadline(openChildren, skipYmd = null) {
  const deadlines = (openChildren || [])
    .filter(countsAsTaskOrAssignmentDeadline)
    .map((task) => task.deadline)
    .filter(Boolean)
    .filter((deadline) => !skipYmd || ymdOf(deadline) !== skipYmd)
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
  const deadlineOff = moduleKey === MODULE.LOGISTICS
    ? isInstallDeadlineClosed(item, stage)
    : moduleKey === MODULE.PRODUCTION && isSxPipelineStageNoDeadline(stage);
  if (deadlineOff && moduleKey !== MODULE.PRODUCTION) return null;
  const moduleAt = deadlineOff ? null : (resolved.deadlineAt || null);
  if (moduleKey === MODULE.PRODUCTION) {
    return earliestOpenChildDeadline(openChildren, ymdOf(moduleAt));
  }
  return moduleAt || childDeadline || null;
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
  indexSxCrmCompletion,
  workshopChildDone,
  deadlineGroupForWorkshopChild,
  sxInstallPlanDeadlineIso,
  earliestSxPlanDeadline,
  STAMP_TABLE,
};
