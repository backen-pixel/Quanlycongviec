/**
 * Khi deal/dự án vào cột hoàn thành của CRM / SX / VC-LĐ:
 * hoàn thành nhiệm vụ còn mở + tắt deadline còn mở của đúng module đó.
 */

const { supabase } = require('../config/supabase');
const { isLogisticsWorkshopTask, isInstallLogisticsStageRow } = require('./logisticsTaskSplit');
const { applyAssignmentStatusColumn } = require('./crmTaskAssignmentSync');

const TERMINAL_STATUSES = new Set(['completed', 'done', 'cancelled', 'canceled']);
const CHUNK = 120;

function uniqIds(list) {
  return [...new Set((list || []).map((x) => String(x || '').trim()).filter(Boolean))];
}

function chunk(arr, size = CHUNK) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function isTerminalStatus(status) {
  return TERMINAL_STATUSES.has(String(status || '').toLowerCase());
}

function foldVi(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .trim();
}

/** Cột CRM «Hoàn thành» (cờ doanh thu hoặc tên/slug). */
function isCrmCompletedStage(stage) {
  if (!stage) return false;
  if (stage.counts_as_completed_revenue) return true;
  const slug = String(stage.canonical_slug || stage.slug || '').toLowerCase().trim();
  if (slug === 'completed' || slug === 'done') return true;
  const name = foldVi(stage.name);
  return name === 'hoan thanh' || name.startsWith('hoan thanh ');
}

/** Cột VC/LĐ «Hoàn thành». */
function isLogisticsCompletedColumn(col) {
  if (!col) return false;
  const slug = String(col.bucket_slug || col.slug || '').toLowerCase().trim();
  if (slug === 'completed' || slug === 'done' || slug === 'install_completed') return true;
  const name = foldVi(col.name);
  return name === 'hoan thanh' || name === 'hoan thien'
    || name.startsWith('hoan thanh ') || name.startsWith('hoan thien ');
}

/**
 * `projects.status` theo cột Kanban VC/LĐ — không phụ thuộc workflow_stage_id
 * (nhiều cột công ty chỉ gắn bucket_slug / tên).
 * @returns {'shipping'|'installing'|'warranty'|'completed'|null}
 */
function projectStatusFromLogisticsColumn(col) {
  if (!col) return null;
  if (isLogisticsCompletedColumn(col)) return 'completed';
  if (isInstallLogisticsStageRow(col)) return 'installing';
  const slug = String(col.bucket_slug || col.slug || '').toLowerCase().trim();
  if (slug === 'warranty' || slug === 'customer-care' || slug === 'customer_care' || slug.includes('warranty')) {
    return 'warranty';
  }
  if (slug === 'acceptance') return 'installing';
  if (
    slug === 'delivered'
    || slug === 'delivery'
    || slug === 'shipping'
    || slug === 'delivery_pending'
  ) {
    return 'shipping';
  }
  const name = foldVi(col.name);
  if (name.includes('bao hanh') || name.includes('cham soc')) return 'warranty';
  if (
    name.includes('dang giao')
    || name.includes('van chuyen')
    || name.includes('da giao')
    || name.includes('cho giao')
    || name.includes('tiep nhan giao')
  ) {
    return 'shipping';
  }
  return null;
}

function crmTaskMatchesModule(task, moduleKey) {
  const slug = String(task?.stage_slug || '');
  if (moduleKey === 'production') return slug.startsWith('sx_');
  if (moduleKey === 'logistics') return slug.startsWith('vc_') || slug.startsWith('ld_');
  return !slug.startsWith('sx_') && !slug.startsWith('vc_') && !slug.startsWith('ld_');
}

function markChecklistItemsDone(checklist) {
  if (!Array.isArray(checklist)) return checklist;
  let changed = false;
  const next = checklist.map((item) => {
    if (!item || typeof item !== 'object') return item;
    if (item.done === true && item.is_completed !== false) return item;
    changed = true;
    return { ...item, done: true, is_completed: true };
  });
  return changed ? next : checklist;
}

function workshopTaskMatchesModule(task, moduleKey) {
  const logistics = isLogisticsWorkshopTask(task);
  if (moduleKey === 'logistics') return logistics;
  if (moduleKey === 'production') return !logistics;
  return false;
}

async function fetchOpenCrmTasks(leadIds) {
  const ids = uniqIds(leadIds);
  if (!ids.length) return [];
  const rows = [];
  for (const part of chunk(ids)) {
    const { data, error } = await supabase
      .from('crm_tasks')
      .select('id, lead_id, stage_slug, status, checklist')
      .in('lead_id', part);
    if (error) {
      console.warn('[completeOpenWork] crm_tasks fetch:', error.message);
      continue;
    }
    for (const t of data || []) {
      if (!isTerminalStatus(t.status)) rows.push(t);
    }
  }
  return rows;
}

async function fetchWorkshopTasks(projectIds) {
  const ids = uniqIds(projectIds);
  if (!ids.length) return [];
  const rows = [];
  for (const part of chunk(ids)) {
    let { data, error } = await supabase
      .from('tasks')
      .select('id, project_id, status, metadata, title, stage:workflow_stages(slug)')
      .in('project_id', part);
    if (error && String(error.message || '').includes('workflow_stages')) {
      ({ data, error } = await supabase
        .from('tasks')
        .select('id, project_id, status, metadata, title')
        .in('project_id', part));
    }
    if (error) {
      console.warn('[completeOpenWork] tasks fetch:', error.message);
      continue;
    }
    rows.push(...(data || []));
  }
  return rows;
}

async function completeCrmTaskRows(tasks) {
  if (!tasks.length) return { count: 0, ids: [] };
  const nowIso = new Date().toISOString();
  const ids = tasks.map((t) => t.id).filter(Boolean);
  for (const part of chunk(ids)) {
    const { error } = await supabase
      .from('crm_tasks')
      .update({ status: 'completed', completed_at: nowIso, updated_at: nowIso })
      .in('id', part)
      .not('status', 'in', '(completed,done,cancelled,canceled)');
    if (error) {
      console.warn('[completeOpenWork] crm_tasks complete:', error.message);
    }
  }
  const checklistPatches = tasks.filter((t) => {
    const next = markChecklistItemsDone(t.checklist);
    return next !== t.checklist;
  });
  for (const part of chunk(checklistPatches, 40)) {
    await Promise.all(part.map(async (t) => {
      const checklist = markChecklistItemsDone(t.checklist);
      const { error } = await supabase
        .from('crm_tasks')
        .update({ checklist, updated_at: nowIso })
        .eq('id', t.id);
      if (error && !String(error.message || '').toLowerCase().includes('checklist')) {
        console.warn('[completeOpenWork] crm_tasks checklist:', error.message);
      }
    }));
  }
  return { count: ids.length, ids };
}

async function completeWorkshopTaskRows(tasks) {
  if (!tasks.length) return { count: 0, ids: [] };
  const nowIso = new Date().toISOString();
  const ids = tasks.map((t) => t.id).filter(Boolean);
  for (const part of chunk(ids)) {
    let { error } = await supabase
      .from('tasks')
      .update({ status: 'done', completed_at: nowIso, updated_at: nowIso })
      .in('id', part)
      .not('status', 'in', '(done,completed,cancelled,canceled)');
    if (error && /completed_at/.test(String(error.message || ''))) {
      ({ error } = await supabase
        .from('tasks')
        .update({ status: 'done', updated_at: nowIso })
        .in('id', part)
        .not('status', 'in', '(done,completed,cancelled,canceled)'));
    }
    if (error) {
      console.warn('[completeOpenWork] tasks complete:', error.message);
    }
  }
  for (const part of chunk(ids)) {
    let { error } = await supabase
      .from('task_checklists')
      .update({ is_completed: true, completed_at: nowIso })
      .in('task_id', part)
      .eq('is_completed', false);
    if (error && /completed_at/.test(String(error.message || ''))) {
      ({ error } = await supabase
        .from('task_checklists')
        .update({ is_completed: true })
        .in('task_id', part)
        .eq('is_completed', false));
    }
    if (error && !String(error.message || '').includes('task_checklists')) {
      console.warn('[completeOpenWork] task_checklists:', error.message);
    }
  }
  return { count: ids.length, ids };
}

async function completeLinkedAssignments({ leadIds, crmTaskIds, moduleKey }) {
  const nowIso = new Date().toISOString();
  const patch = await applyAssignmentStatusColumn({
    status: 'completed',
    completed_at: nowIso,
    updated_at: nowIso,
  }, 'completed');
  const legacy = { status: 'completed', completed_at: nowIso, updated_at: nowIso };
  const taskIds = uniqIds(crmTaskIds);
  const leads = uniqIds(leadIds);
  let count = 0;

  for (const part of chunk(taskIds)) {
    let { data, error } = await supabase
      .from('crm_assignments')
      .update(patch)
      .in('crm_task_id', part)
      .not('status', 'in', '(completed,done,cancelled,canceled)')
      .select('id');
    if (error && /crm_task_id/.test(String(error.message || ''))) break;
    if (error) {
      ({ data, error } = await supabase
        .from('crm_assignments')
        .update(legacy)
        .in('crm_task_id', part)
        .not('status', 'in', '(completed,done,cancelled,canceled)')
        .select('id'));
    }
    if (error) console.warn('[completeOpenWork] assignments task_id:', error.message);
    else count += (data || []).length;
  }

  if (leads.length) {
    for (const part of chunk(leads)) {
      let { data, error } = await supabase
        .from('crm_assignments')
        .update(patch)
        .in('lead_id', part)
        .eq('assignment_module', moduleKey)
        .not('status', 'in', '(completed,done,cancelled,canceled)')
        .select('id');
      if (error && /assignment_module/.test(String(error.message || ''))) break;
      if (error) {
        ({ data, error } = await supabase
          .from('crm_assignments')
          .update(legacy)
          .in('lead_id', part)
          .eq('assignment_module', moduleKey)
          .not('status', 'in', '(completed,done,cancelled,canceled)')
          .select('id'));
      }
      if (error && /assignment_module/.test(String(error.message || ''))) break;
      if (error) console.warn('[completeOpenWork] assignments module:', error.message);
      else count += (data || []).length;
    }
  }
  return count;
}

async function clearCrmLeadDeadlines(leadIds) {
  const ids = uniqIds(leadIds);
  if (!ids.length) return 0;
  const nowIso = new Date().toISOString();
  let n = 0;
  for (const part of chunk(ids)) {
    let { data, error } = await supabase
      .from('crm_leads')
      .update({
        kanban_deadline_at: null,
        kanban_deadline_reason: null,
        expected_close_date: null,
        next_follow_up: null,
        updated_at: nowIso,
      })
      .in('id', part)
      .select('id');
    if (error && /kanban_deadline|expected_close_date|next_follow_up/.test(String(error.message || ''))) {
      ({ data, error } = await supabase
        .from('crm_leads')
        .update({ updated_at: nowIso })
        .in('id', part)
        .select('id'));
    }
    if (error) {
      console.warn('[completeOpenWork] crm lead deadlines:', error.message);
    } else {
      n += (data || []).length;
    }
  }
  return n;
}

async function cancelOpenEvents({ leadIds, projectIds, module, reason }) {
  const nowIso = new Date().toISOString();
  const patch = {
    status: 'cancelled',
    cancel_reason: reason,
    updated_at: nowIso,
  };
  const leads = uniqIds(leadIds);
  const projects = uniqIds(projectIds);
  for (const part of chunk(leads)) {
    if (!part.length) continue;
    const { error } = await supabase
      .from('crm_events')
      .update(patch)
      .in('lead_id', part)
      .eq('module', module)
      .in('status', ['planned', 'in_progress']);
    if (error) console.warn('[completeOpenWork] cancel events lead:', error.message);
  }
  for (const part of chunk(projects)) {
    if (!part.length) continue;
    const { error } = await supabase
      .from('crm_events')
      .update(patch)
      .in('project_id', part)
      .eq('module', module)
      .in('status', ['planned', 'in_progress']);
    if (error) console.warn('[completeOpenWork] cancel events project:', error.message);
  }
}

async function clearLogisticsProjectDeadlines(projectIds) {
  const ids = uniqIds(projectIds);
  if (!ids.length) return 0;
  const nowIso = new Date().toISOString();
  let n = 0;
  for (const part of chunk(ids)) {
    const { data, error } = await supabase
      .from('projects')
      .update({ deadline: null, updated_at: nowIso })
      .in('id', part)
      .select('id');
    if (error) {
      console.warn('[completeOpenWork] logistics project deadline:', error.message);
    } else {
      n += (data || []).length;
    }
  }
  return n;
}

/**
 * @param {{ module: 'crm'|'production'|'logistics', leadIds?: string[], projectIds?: string[] }} opts
 */
async function completeOpenWorkOnModuleDone({ module, leadIds = [], projectIds = [] } = {}) {
  const moduleKey = String(module || '').toLowerCase();
  if (!['crm', 'production', 'logistics'].includes(moduleKey)) {
    return { crm_tasks: 0, workshop_tasks: 0, assignments: 0 };
  }

  let leads = uniqIds(leadIds);
  const projects = uniqIds(projectIds);

  if (moduleKey !== 'crm' && projects.length) {
    for (const part of chunk(projects)) {
      const { data, error } = await supabase
        .from('crm_leads')
        .select('id')
        .eq('type', 'deal')
        .in('project_id', part);
      if (error) {
        console.warn('[completeOpenWork] deals for projects:', error.message);
        break;
      }
      leads = uniqIds([...leads, ...(data || []).map((d) => d.id)]);
    }
  }

  const openCrm = (await fetchOpenCrmTasks(leads)).filter((t) => crmTaskMatchesModule(t, moduleKey));
  const crmResult = await completeCrmTaskRows(openCrm);

  let workshopResult = { count: 0, ids: [] };
  if (moduleKey === 'production' || moduleKey === 'logistics') {
    const allWs = await fetchWorkshopTasks(projects);
    const matched = allWs.filter((t) => !isTerminalStatus(t.status) && workshopTaskMatchesModule(t, moduleKey));
    workshopResult = await completeWorkshopTaskRows(matched);
  }

  const assignments = await completeLinkedAssignments({
    leadIds: leads,
    crmTaskIds: crmResult.ids,
    moduleKey,
  });

  if (moduleKey === 'crm') {
    await clearCrmLeadDeadlines(leads);
  }
  if (moduleKey === 'logistics') {
    await clearLogisticsProjectDeadlines(projects);
    await cancelOpenEvents({
      leadIds: leads,
      projectIds: projects,
      module: 'logistics',
      reason: 'Tự hủy khi kéo dự án VC/LĐ sang cột hoàn thành',
    });
  }

  return {
    crm_tasks: crmResult.count,
    workshop_tasks: workshopResult.count,
    assignments,
  };
}

module.exports = {
  isCrmCompletedStage,
  isLogisticsCompletedColumn,
  projectStatusFromLogisticsColumn,
  completeOpenWorkOnModuleDone,
};
