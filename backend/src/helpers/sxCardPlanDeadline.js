/**
 * Hạn thẻ SX = hạn của cột Kanban đang đứng, tính lùi từ ngày lắp, chốt 17:30.
 * Việc mẫu còn mở ở nhóm sớm hơn không kéo cả thẻ về quá hạn.
 * Ghi vào projects.sx_kanban_deadline_at. Không ghi xuống tasks.due_date.
 */
const { supabase } = require('../config/supabase');
const { companyDeadlineIsoFromYmd } = require('./companyDeadlineClock');
const { AUTO_REASON, computeSxInstallPlanDeadline } = require('./sxInstallPlanKanbanDeadline');
const {
  indexSxCrmCompletion,
  workshopChildDone,
  deadlineGroupForWorkshopChild,
  earliestSxPlanDeadline,
} = require('./projectOverviewDeadline');

const PROJECT_COLS = 'id, company_id, workshop_type_id, sx_kanban_column_id, install_date, delivery_date, production_finish_date, sx_reception_date, created_at, sx_schedule_slip_days';

function columnClearsCardDeadline(stage) {
  return !!(stage?.clears_deadline || stage?.is_handover_to_logistics);
}

/** Thẻ chưa có cột: hạn sớm nhất của nhóm việc còn mở. */
async function earliestOpenGroupIso(project, projectId) {
  const { data: taskRows } = await supabase
    .from('tasks')
    .select('id, title, status, project_id')
    .eq('project_id', projectId);
  const tasks = taskRows || [];
  const { data: leads } = await supabase
    .from('crm_leads')
    .select('id')
    .eq('project_id', projectId)
    .eq('type', 'deal');
  const leadIds = (leads || []).map((l) => l.id).filter(Boolean);
  let crmRows = [];
  if (leadIds.length) {
    const { data } = await supabase
      .from('crm_tasks')
      .select('id, lead_id, title, status, stage_slug, production_pipeline_stage_id')
      .in('lead_id', leadIds)
      .or('stage_slug.like.sx_%,production_pipeline_stage_id.not.is.null');
    crmRows = data || [];
  }
  const leadProjectById = new Map((leads || []).map((l) => [String(l.id), String(projectId)]));
  const crmIndex = indexSxCrmCompletion(crmRows, leadProjectById);
  const stageIds = [...new Set(crmRows.map((r) => r.production_pipeline_stage_id).filter(Boolean))];
  let stageById = new Map();
  if (stageIds.length) {
    const { data: stageRows } = await supabase
      .from('production_pipeline_stages')
      .select('id, group_key, deadline_group, name')
      .in('id', stageIds);
    stageById = new Map((stageRows || []).map((s) => [String(s.id), s]));
  }
  const openTasks = tasks.filter((task) => !workshopChildDone(task, crmIndex));
  if (tasks.length && !openTasks.length) return null;
  const groups = [];
  for (const task of openTasks) {
    const group = deadlineGroupForWorkshopChild(task, crmIndex, stageById);
    if (group) groups.push(group);
  }
  if (groups.length) return earliestSxPlanDeadline(project, groups);
  return null;
}

async function syncSxCardDeadline(projectId) {
  if (!projectId) return null;
  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select(PROJECT_COLS)
    .eq('id', projectId)
    .maybeSingle();
  if (projErr) throw projErr;
  if (!project) return null;

  let stage = null;
  let siblings = [];
  if (project.sx_kanban_column_id) {
    const { data: col } = await supabase
      .from('production_pipeline_stages')
      .select('id, deadline_group, group_key, clears_deadline, is_handover_to_logistics, company_id')
      .eq('id', project.sx_kanban_column_id)
      .maybeSingle();
    stage = col || null;
  }
  if (project.company_id) {
    const { data: sibs } = await supabase
      .from('production_pipeline_stages')
      .select('id, deadline_group, group_key')
      .eq('company_id', project.company_id);
    siblings = sibs || [];
  }

  let iso = null;
  if (!columnClearsCardDeadline(stage)) {
    if (stage) {
      iso = computeSxInstallPlanDeadline(project, stage, siblings)?.iso || null;
    } else {
      // Thẻ chưa có cột: vẫn ưu tiên NGÀY LẮP ĐẶT cho thống nhất với thẻ đã có cột.
      // Chỉ khi chưa có ngày lắp mới lùi về hạn sớm nhất của nhóm việc còn mở.
      const { resolveSxPlanInstallYmd } = require('./sxWorkshopSchedule');
      const installYmd = resolveSxPlanInstallYmd(project);
      iso = (installYmd ? companyDeadlineIsoFromYmd(installYmd, project.company_id) : null)
        || await earliestOpenGroupIso(project, projectId);
    }
  }

  const patch = iso
    ? {
      sx_kanban_deadline_at: new Date(iso).toISOString(),
      sx_kanban_deadline_reason: AUTO_REASON,
    }
    : { sx_kanban_deadline_at: null, sx_kanban_deadline_reason: null };
  const { error: updErr } = await supabase.from('projects').update(patch).eq('id', projectId);
  if (updErr && /sx_kanban_deadline/.test(String(updErr.message || ''))) return null;
  if (updErr) throw updErr;
  return patch;
}

module.exports = { syncSxCardDeadline, columnClearsCardDeadline };
