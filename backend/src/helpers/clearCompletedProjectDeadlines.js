/**
 * Tắt deadline còn sót trên dự án / deal đã hoàn thành (cột Đã công / Đã thu / Hoàn thành).
 * Dùng khi kéo cột, bật cờ cột, và khi job deadline quét lại.
 */

const { supabase } = require('../config/supabase');
const {
  completeOpenWorkOnModuleDone,
  clearAllProjectDeadlinesOnInstallationDone,
  isCrmCompletedStage,
  isLogisticsCompletedColumn,
} = require('./completeOpenWorkOnModuleDone');
const { isSxDeliveredStage } = require('./crmPipelineSla');
const { projectDeadlinePatchOnModuleDone } = require('./moduleDeadlinePolicy');

const PAGE = 800;
const IN_CHUNK = 120;

function uniqIds(list) {
  return [...new Set((list || []).map((x) => String(x || '').trim()).filter(Boolean))];
}

function chunk(arr, size = IN_CHUNK) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, size + i));
  return out;
}

async function fetchAllRows(table, select, apply) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select(select).range(from, from + PAGE - 1);
    if (apply) q = apply(q);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

/**
 * Kéo vào cột SX «Hoàn thành» / Đã công / Đã thu:
 * chỉ xóa deadline SX + hoàn thành NV SX còn mở + hủy lịch hẹn SX.
 * Không đụng deadline CRM, VC/LĐ và các ngày giao/lắp lịch sử.
 */
async function clearSxSchedulesOnCompletedForProjects(projectIds, { completeWork = true } = {}) {
  const ids = uniqIds(projectIds);
  if (!ids.length) return { projects: 0 };
  const nowIso = new Date().toISOString();

  const projectPatch = projectDeadlinePatchOnModuleDone('production', nowIso);

  for (const part of chunk(ids)) {
    let { error: projErr } = await supabase.from('projects').update(projectPatch).in('id', part);
    if (projErr) {
      const m = String(projErr.message || '');
      const fallback = { ...projectPatch };
      if (/sx_kanban_deadline/.test(m)) {
        delete fallback.sx_kanban_deadline_at;
        delete fallback.sx_kanban_deadline_reason;
      }
      if (/production_deadline/.test(m)) delete fallback.production_deadline;
      if (/production_finish_date/.test(m)) delete fallback.production_finish_date;
      ({ error: projErr } = await supabase.from('projects').update(fallback).in('id', part));
      if (projErr && !/sx_kanban_deadline|production_deadline|production_finish_date/.test(String(projErr.message || ''))) {
        throw projErr;
      }
    }
  }

  const deals = [];
  for (const part of chunk(ids)) {
    const { data, error: dealErr } = await supabase
      .from('crm_leads')
      .select('id')
      .eq('type', 'deal')
      .in('project_id', part);
    if (dealErr) throw dealErr;
    deals.push(...(data || []));
  }
  const leadIds = uniqIds(deals.map((d) => d.id));

  if (leadIds.length) {
    for (const part of chunk(leadIds)) {
      const { error: crmTaskErr } = await supabase
        .from('crm_tasks')
        .update({ deadline: null, updated_at: nowIso })
        .in('lead_id', part)
        .like('stage_slug', 'sx_%')
        .not('deadline', 'is', null);
      if (crmTaskErr) {
        console.warn('[clearCompletedDeadlines] clear sx task deadlines:', crmTaskErr.message);
      }
    }

    for (const part of chunk(leadIds)) {
      const { error: evtErr } = await supabase
        .from('crm_events')
        .update({
          status: 'cancelled',
          cancel_reason: 'Tự hủy khi kéo dự án SX sang cột hoàn thành',
          updated_at: nowIso,
        })
        .in('lead_id', part)
        .eq('module', 'production')
        .in('status', ['planned', 'in_progress']);
      if (evtErr) {
        console.warn('[clearCompletedDeadlines] cancel production events:', evtErr.message);
      }
    }
  }

  for (const part of chunk(ids)) {
    const { error: projEvtErr } = await supabase
      .from('crm_events')
      .update({
        status: 'cancelled',
        cancel_reason: 'Tự hủy khi kéo dự án SX sang cột hoàn thành',
        updated_at: nowIso,
      })
      .in('project_id', part)
      .eq('module', 'production')
      .in('status', ['planned', 'in_progress']);
    if (projEvtErr) {
      console.warn('[clearCompletedDeadlines] cancel project production events:', projEvtErr.message);
    }
  }

  if (completeWork) {
    try {
      await completeOpenWorkOnModuleDone({
        module: 'production',
        leadIds,
        projectIds: ids,
      });
    } catch (doneErr) {
      console.warn('[clearCompletedDeadlines] complete SX tasks:', doneErr.message);
    }
  }

  return { projects: ids.length, leads: leadIds.length };
}

async function loadSxDoneColumnIds() {
  const rows = await fetchAllRows(
    'production_pipeline_stages',
    'id, counts_as_completed_revenue, counts_as_collected_revenue',
  );
  return uniqIds(rows
    .filter((c) => c.counts_as_completed_revenue || c.counts_as_collected_revenue)
    .map((c) => c.id));
}

async function loadSxDeadlineClearColumnIds() {
  const rows = await fetchAllRows(
    'production_pipeline_stages',
    'id, name, bucket_slug, counts_as_completed_revenue, counts_as_collected_revenue',
  );
  return uniqIds(rows
    .filter((c) => (
      c.counts_as_completed_revenue
      || c.counts_as_collected_revenue
      || isSxDeliveredStage(c)
    ))
    .map((c) => c.id));
}

async function loadVcDoneColumnIds() {
  const rows = await fetchAllRows(
    'logistics_pipeline_stages',
    'id, name, bucket_slug',
  );
  return uniqIds(rows.filter((c) => isLogisticsCompletedColumn(c)).map((c) => c.id));
}

async function loadCrmDoneStageIds() {
  const rows = await fetchAllRows(
    'crm_pipeline_stages',
    'id, name, canonical_slug, counts_as_completed_revenue',
  );
  return uniqIds(rows.filter((s) => isCrmCompletedStage(s)).map((s) => s.id));
}

async function collectIdsByColumn(table, selectCol, column, colIds) {
  const ids = [];
  for (const part of chunk(colIds)) {
    const rows = await fetchAllRows(table, selectCol, (q) => q.in(column, part));
    for (const r of rows) {
      if (r[selectCol] || r.id) ids.push(r[selectCol] || r.id);
    }
  }
  return uniqIds(ids);
}

/** Dự án ở cột Đã giao/Đã công/Đã thu phải không còn nguồn quá hạn SX. */
async function findSxDeadlineClearProjectIds() {
  const colIds = await loadSxDeadlineClearColumnIds();
  const fromStatus = await fetchAllRows('projects', 'id', (q) => q.eq('status', 'completed'));
  if (!colIds.length) return uniqIds(fromStatus.map((p) => p.id));

  const fromProjects = await collectIdsByColumn('projects', 'id', 'sx_kanban_column_id', colIds);
  const fromLeads = [];
  for (const part of chunk(colIds)) {
    const rows = await fetchAllRows(
      'crm_leads',
      'project_id',
      (q) => q.eq('type', 'deal').in('sx_pipeline_stage_id', part).not('project_id', 'is', null),
    );
    fromLeads.push(...rows.map((r) => r.project_id));
  }
  return uniqIds([
    ...fromStatus.map((p) => p.id),
    ...fromProjects,
    ...fromLeads,
  ]);
}

async function findCompletedCrmLeadIds() {
  const stageIds = await loadCrmDoneStageIds();
  if (!stageIds.length) return [];
  const ids = [];
  for (const part of chunk(stageIds)) {
    const rows = await fetchAllRows('crm_leads', 'id', (q) => q.in('stage_id', part));
    ids.push(...rows.map((r) => r.id));
  }
  return uniqIds(ids);
}

async function findCompletedVcProjectIds() {
  const colIds = await loadVcDoneColumnIds();
  if (!colIds.length) return [];
  return collectIdsByColumn('projects', 'id', 'vc_kanban_column_id', colIds);
}

async function clearCrmCompletedLeadDeadlines(leadIds) {
  const ids = uniqIds(leadIds);
  if (!ids.length) return { leads: 0 };
  const nowIso = new Date().toISOString();
  for (const part of chunk(ids)) {
    let { error } = await supabase
      .from('crm_leads')
      .update({
        kanban_deadline_at: null,
        kanban_deadline_reason: null,
        expected_close_date: null,
        next_follow_up: null,
        updated_at: nowIso,
      })
      .in('id', part);
    if (error && /kanban_deadline|expected_close_date|next_follow_up/.test(String(error.message || ''))) {
      ({ error } = await supabase
        .from('crm_leads')
        .update({ kanban_deadline_at: null, kanban_deadline_reason: null, updated_at: nowIso })
        .in('id', part));
    }
    if (error) console.warn('[clearCompletedDeadlines] CRM lead deadlines:', error.message);
  }
  for (const part of chunk(ids)) {
    const { error } = await supabase
      .from('crm_tasks')
      .update({ deadline: null, updated_at: nowIso })
      .in('lead_id', part)
      .not('deadline', 'is', null);
    if (error) console.warn('[clearCompletedDeadlines] clear CRM task deadlines:', error.message);
  }
  return { leads: ids.length };
}

async function clearVcCompletedProjectDeadlines(projectIds) {
  const ids = uniqIds(projectIds);
  if (!ids.length) return { projects: 0 };
  const nowIso = new Date().toISOString();
  for (const part of chunk(ids)) {
    const { error } = await supabase
      .from('projects')
      .update({ deadline: null, updated_at: nowIso })
      .in('id', part);
    if (error) console.warn('[clearCompletedDeadlines] VC project deadline:', error.message);
  }
  return { projects: ids.length };
}

/**
 * Quét lại mọi dự án / deal đang ở cột hoàn thành và tắt deadline còn sót.
 */
async function rescanCompletedAndClearDeadlines() {
  const sxIds = await findSxDeadlineClearProjectIds();
  const crmLeadIds = await findCompletedCrmLeadIds();
  const vcIds = await findCompletedVcProjectIds();
  const completedStatusRows = await fetchAllRows(
    'projects',
    'id',
    (q) => q.eq('status', 'completed'),
  );
  const fullyCompletedProjectIds = uniqIds([
    ...vcIds,
    ...completedStatusRows.map((p) => p.id),
  ]);

  const sx = await clearSxSchedulesOnCompletedForProjects(sxIds, { completeWork: false });
  const crm = await clearCrmCompletedLeadDeadlines(crmLeadIds);
  const vc = await clearVcCompletedProjectDeadlines(vcIds);
  const allModules = await clearAllProjectDeadlinesOnInstallationDone({
    projectIds: fullyCompletedProjectIds,
  });

  const summary = {
    sx_projects: sxIds.length,
    crm_leads: crmLeadIds.length,
    vc_projects: vcIds.length,
    fully_completed_projects: fullyCompletedProjectIds.length,
    sx,
    crm,
    vc,
    all_modules: allModules,
  };
  console.info('[clearCompletedDeadlines] rescan', summary);
  return summary;
}

async function loadCompletedKanbanColumnSets() {
  const [sx, vc] = await Promise.all([loadSxDoneColumnIds(), loadVcDoneColumnIds()]);
  return {
    sxDone: new Set(sx),
    vcDone: new Set(vc),
  };
}

function projectIsInCompletedKanban(project, sets) {
  if (!project || project._crmOnly) return false;
  if (String(project.status || '') === 'completed') return true;
  if (project.sx_kanban_column_id && sets.sxDone.has(String(project.sx_kanban_column_id))) return true;
  if (project.vc_kanban_column_id && sets.vcDone.has(String(project.vc_kanban_column_id))) return true;
  return false;
}

module.exports = {
  clearSxSchedulesOnCompletedForProjects,
  rescanCompletedAndClearDeadlines,
  loadCompletedKanbanColumnSets,
  projectIsInCompletedKanban,
  loadCrmDoneStageIds,
};
