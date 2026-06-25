/**
 * Module Vận chuyển (VC)
 * API prefix: /api/logistics
 * Quản lý dự án ở giai đoạn giao hàng / lắp đặt / bảo hành
 */
const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/newPermission');
const { notifyMultiple: notifyMultipleShared } = require('../helpers/notifications');
const { syncCrmLeadFromLogisticsStage, syncVcPipelineStageToLead, emitCrmBadgeUpdateForProject } = require('../helpers/workshopKanban');
const { effectiveWorkshopCompanyId, normalizeWorkshopCompanyId } = require('../helpers/workshopCompanyScope');
const { applyWorkshopProjectVisibilityScope, userCanAccessCrossWorkshopProductionProject, isCrossWorkshopProductionViewer, isMetallaOrHucabiCompanyIdSync, userNeedsParticipantOnlyProductionScopeForWorkshop, userCanAccessProductionProjectAsParticipant } = require('../helpers/dealParticipantProduction');
const { leadDocVisibleForModuleAndUser } = require('../helpers/documentShareScope');
const { writeAuditLog } = require('../helpers/auditLog');

const r = Router();
r.use(auth);

const LOGISTICS_STAGE_SLUGS = ['delivery', 'installation', 'customer-care'];
const LOGISTICS_STATUSES = ['shipping', 'installing', 'warranty', 'completed'];
const INTAKE_BUCKET = 'delivery_pending'; // projects bàn giao từ sản xuất sang VC

// Bảng cấu hình Kanban cho module VC
const VC_PIPELINE_TABLE = 'logistics_pipeline_stages';

function calcTaskProgress(tasks) {
  if (!tasks?.length) return 0;
  return Math.round((tasks.filter((t) => t.status === 'done').length / tasks.length) * 100);
}

async function getLogisticsStageMap() {
  const { data: stages = [] } = await supabase
    .from('workflow_stages')
    .select('id, slug, name, color, icon')
    .in('slug', LOGISTICS_STAGE_SLUGS)
    .order('order_index');
  const bySlug = {};
  stages.forEach((s) => { bySlug[s.slug] = s; });
  return { stages, bySlug, ids: stages.map((s) => s.id).filter(Boolean) };
}

function buildLogisticsScopeFilter(stageIds) {
  const parts = [];
  if (stageIds.length) parts.push(`current_stage_id.in.(${stageIds.join(',')})`);
  parts.push(`status.in.(${LOGISTICS_STATUSES.join(',')})`);
  return parts.join(',');
}

/** Áp cờ vc_deleted_at IS NULL — graceful nếu cột chưa tồn tại (migration 242 chưa chạy). */
function applyVcNotDeletedFilter(query) {
  try { return query.is('vc_deleted_at', null); } catch { return query; }
}
const IS_VC_DELETED_AT_MISSING = (err) =>
  !!err && String(err.message || '').toLowerCase().includes('vc_deleted_at');
const IS_VC_DELETE_REASON_MISSING = (err) =>
  !!err && String(err.message || '').toLowerCase().includes('vc_delete_reason');

const VC_SELECT_FULL = `id, company_id, name, color, icon, order_index, is_active, progress_percent, workflow_stage_id, bucket_slug, crm_sync_type,
      crm_target_stage_id, crm_target_stage:crm_pipeline_stages(id, name, color, icon, order_index),
      workflow_stage:workflow_stages(id, slug, name, color, icon)`;

/** Khi DB chưa có cột company_id — truy vấn không lọc theo công ty */
const VC_SELECT_NO_COMPANY = `id, name, color, icon, order_index, is_active, progress_percent, workflow_stage_id, bucket_slug, crm_sync_type,
      crm_target_stage_id, crm_target_stage:crm_pipeline_stages(id, name, color, icon, order_index),
      workflow_stage:workflow_stages(id, slug, name, color, icon)`;

function isLogisticsCompanyIdMissing(err) {
  if (!err) return false;
  const s = String(err.message || err.details || '').toLowerCase();
  return s.includes('company_id') && (s.includes('does not exist') || s.includes('could not find'));
}

async function loadLogisticsPipelineRows(includeInactive = false, companyId = null, legacyUnscoped = false) {
  const cid = legacyUnscoped ? null : normalizeWorkshopCompanyId(companyId);
  const selectStr = legacyUnscoped ? VC_SELECT_NO_COMPANY : VC_SELECT_FULL;

  const runBase = (scope) => {
    let q = supabase.from(VC_PIPELINE_TABLE).select(selectStr).order('order_index');
    if (!includeInactive) q = q.eq('is_active', true);
    if (!legacyUnscoped && cid && scope === 'scoped') q = q.eq('company_id', cid);
    if (!legacyUnscoped && scope === 'global') q = q.is('company_id', null);
    return q;
  };

  const runWithFallback = async (scope) => {
    let { data, error } = await runBase(scope);
    if (error && isLogisticsCompanyIdMissing(error)) {
      return loadLogisticsPipelineRows(includeInactive, companyId, true);
    }
    if (error && error.message?.includes('progress_percent')) {
      const slim = legacyUnscoped
        ? 'id, name, color, icon, order_index, is_active, workflow_stage_id, bucket_slug, crm_sync_type, crm_target_stage_id, crm_target_stage:crm_pipeline_stages(id, name, color, icon, order_index), workflow_stage:workflow_stages(id, slug, name, color, icon)'
        : 'id, company_id, name, color, icon, order_index, is_active, workflow_stage_id, bucket_slug, crm_sync_type, crm_target_stage_id, crm_target_stage:crm_pipeline_stages(id, name, color, icon, order_index), workflow_stage:workflow_stages(id, slug, name, color, icon)';
      let q2 = supabase
        .from(VC_PIPELINE_TABLE)
        .select(slim)
        .order('order_index');
      if (!includeInactive) q2 = q2.eq('is_active', true);
      if (!legacyUnscoped && cid && scope === 'scoped') q2 = q2.eq('company_id', cid);
      if (!legacyUnscoped && scope === 'global') q2 = q2.is('company_id', null);
      ({ data, error } = await q2);
      if (error && isLogisticsCompanyIdMissing(error)) {
        return loadLogisticsPipelineRows(includeInactive, companyId, true);
      }
    }
    if (error && error.message?.includes('crm_target_stage_id')) {
      const slim = legacyUnscoped
        ? 'id, name, color, icon, order_index, is_active, workflow_stage_id, bucket_slug, crm_sync_type, workflow_stage:workflow_stages(id, slug, name, color, icon)'
        : 'id, company_id, name, color, icon, order_index, is_active, workflow_stage_id, bucket_slug, crm_sync_type, workflow_stage:workflow_stages(id, slug, name, color, icon)';
      let q2 = supabase
        .from(VC_PIPELINE_TABLE)
        .select(slim)
        .order('order_index');
      if (!includeInactive) q2 = q2.eq('is_active', true);
      if (!legacyUnscoped && cid && scope === 'scoped') q2 = q2.eq('company_id', cid);
      if (!legacyUnscoped && scope === 'global') q2 = q2.is('company_id', null);
      ({ data, error } = await q2);
      if (error && isLogisticsCompanyIdMissing(error)) {
        return loadLogisticsPipelineRows(includeInactive, companyId, true);
      }
    }
    return { data, error };
  };

  let data;
  if (legacyUnscoped || !cid) {
    const r = await runWithFallback(legacyUnscoped ? 'all' : 'global');
    if (r.error) {
      console.warn('[logistics] logistics_pipeline_stages not ready:', r.error.message);
      return null;
    }
    data = r.data;
  } else {
    const scoped = await runWithFallback('scoped');
    if (scoped.error) {
      console.warn('[logistics] logistics_pipeline_stages not ready:', scoped.error.message);
      return null;
    }
    if ((scoped.data || []).length) {
      data = scoped.data;
    } else {
      const g = await runWithFallback('global');
      if (g.error) {
        console.warn('[logistics] logistics_pipeline_stages not ready:', g.error.message);
        return null;
      }
      data = g.data;
    }
  }
  return data || [];
}

function defaultLogisticsStages() {
  return [
    { id: '__vc_intake', name: 'Chờ vận chuyển', slug: 'delivery_pending', icon: '📦', color: '#f97316', bucket_slug: INTAKE_BUCKET, workflow_stage_id: null, order_index: 1 },
    { id: '__vc_ship', name: 'Đang vận chuyển', slug: 'delivery', icon: '🚚', color: '#ea580c', bucket_slug: null, workflow_stage_id: null, order_index: 2 },
    { id: '__vc_install', name: 'Đang lắp đặt', slug: 'installation', icon: '🔧', color: '#d97706', bucket_slug: null, workflow_stage_id: null, order_index: 3 },
    { id: '__vc_warranty', name: 'Bảo hành', slug: 'customer-care', icon: '🤝', color: '#0f766e', bucket_slug: null, workflow_stage_id: null, order_index: 4 },
    { id: '__vc_done', name: 'Hoàn thành', slug: 'completed', icon: '✅', color: '#16a34a', bucket_slug: null, workflow_stage_id: null, order_index: 5 },
  ];
}

async function getResolvedLogisticsStages(companyId = null) {
  const rows = await loadLogisticsPipelineRows(false, companyId);
  if (rows && rows.length > 0) return { stages: rows };
  const { stages: wfStages, bySlug } = await getLogisticsStageMap();
  const defaults = defaultLogisticsStages();
  const merged = defaults.map((d) => {
    const wf = bySlug[d.slug];
    return { ...d, workflow_stage_id: wf?.id || d.workflow_stage_id, workflow_stage: wf || null };
  });
  return { stages: merged };
}

function enrichOneLogisticsProject(project, sortedKanban) {
  const intakeCol = sortedKanban.find((c) => c.bucket_slug === INTAKE_BUCKET);
  const firstCol = sortedKanban[0] || null;
  const colIdSet = new Set(sortedKanban.map((c) => String(c.id)));
  const stageSlug = project.current_stage?.slug;
  const status = project.status;
  let matchedCol = null;

  if (project.vc_kanban_column_id && colIdSet.has(String(project.vc_kanban_column_id))) {
    matchedCol = sortedKanban.find((c) => String(c.id) === String(project.vc_kanban_column_id)) || null;
  }

  if (!matchedCol) {
    for (const col of sortedKanban) {
      if (col.bucket_slug === INTAKE_BUCKET) continue;
      const ws = col.workflow_stage;
      if (ws && ws.slug === stageSlug) { matchedCol = col; break; }
      if (col.slug === stageSlug) { matchedCol = col; break; }
      if (col.slug === status) { matchedCol = col; break; }
    }
  }

  const inScope = LOGISTICS_STATUSES.includes(status) || LOGISTICS_STAGE_SLUGS.includes(stageSlug);
  if (!matchedCol && inScope) {
    matchedCol = intakeCol || firstCol;
  }

  return {
    ...project,
    vc_kanban_column_id: matchedCol?.id || project.vc_kanban_column_id || null,
    vc_intake: !matchedCol?.workflow_stage_id || matchedCol?.bucket_slug === INTAKE_BUCKET,
    vc_pipeline_percent: matchedCol?.progress_percent ?? null,
  };
}

/** Gắn vc_kanban_column_id theo pipeline VC theo công ty (filterCompanyId = dashboard filter admin). */
async function enrichProjectsForLogistics(projects, filterCompanyId = null) {
  const f = normalizeWorkshopCompanyId(filterCompanyId);
  const keyFor = (p) => {
    if (f) return `__f:${f}`;
    const id = p.logistics_company_id || p.company_id || p.company?.id;
    return id ? String(id) : '__global__';
  };
  const keys = f ? [`__f:${f}`] : [...new Set((projects || []).map(keyFor))];
  const cache = new Map();
  for (const key of keys) {
    const cid = key.startsWith('__f:') ? key.slice(4) : (key === '__global__' ? null : key);
    const { stages } = await getResolvedLogisticsStages(cid);
    const sorted = [...stages].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    cache.set(key, sorted);
  }
  return (projects || []).map((p) => enrichOneLogisticsProject(p, cache.get(keyFor(p))));
}

function buildLogisticsPipelineSummary(stages, projects) {
  return stages.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    icon: s.icon,
    bucket_slug: s.bucket_slug,
    count: projects.filter((p) => p.vc_kanban_column_id === s.id).length,
    value: projects
      .filter((p) => p.vc_kanban_column_id === s.id)
      .reduce((sum, p) => sum + (p.estimated_value || 0), 0),
  }));
}

// ─── Pipeline Stages CRUD ──────────────────────────────────────────────────

r.get('/pipeline-stages', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const includeInactive = req.query.all === 'true';
    const company_id = effectiveWorkshopCompanyId(req, req.query.company_id);
    const rows = await loadLogisticsPipelineRows(includeInactive, company_id);
    if (rows === null) {
      const { stages } = await getResolvedLogisticsStages(company_id);
      return res.json(stages);
    }
    res.json(rows || []);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

r.post('/pipeline-stages', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const b = req.body;
    if (!b.name?.trim()) return res.status(400).json({ error: 'Thiếu tên cột' });
    const insertCompanyId = effectiveWorkshopCompanyId(req, b.company_id);
    if (b.bucket_slug && b.bucket_slug !== INTAKE_BUCKET) {
      return res.status(400).json({ error: 'bucket_slug không hợp lệ' });
    }
    const scopedRows = await loadLogisticsPipelineRows(true, insertCompanyId);
    if (b.bucket_slug === INTAKE_BUCKET) {
      const hasIntake = (scopedRows || []).some((r) => r.bucket_slug === INTAKE_BUCKET);
      if (hasIntake) return res.status(400).json({ error: 'Đã có cột chờ vận chuyển trong phạm vi công ty này' });
    }
    const nextOrder = (scopedRows || []).reduce((m, r) => Math.max(m, Number(r.order_index) || 0), 0) + 1;
    const isIntakeRow = b.bucket_slug === INTAKE_BUCKET;
    const insertPayload = {
      name: b.name.trim(),
      color: b.color || '#f97316',
      icon: b.icon || '📦',
      order_index: b.order_index ?? nextOrder,
      is_active: b.is_active !== false,
      progress_percent: b.progress_percent ?? null,
      workflow_stage_id: isIntakeRow ? null : (b.workflow_stage_id || null),
      bucket_slug: b.bucket_slug || null,
      crm_sync_type: isIntakeRow ? null : (b.crm_sync_type || null),
      crm_target_stage_id: isIntakeRow ? null : (b.crm_target_stage_id || null),
      company_id: insertCompanyId || null,
    };
    const vcSelect = 'id, name, color, icon, order_index, is_active, workflow_stage_id, bucket_slug, crm_sync_type, workflow_stage:workflow_stages(id, slug, name, color, icon)';
    let { data, error } = await supabase
      .from(VC_PIPELINE_TABLE)
      .insert(insertPayload)
      .select(`${vcSelect}, crm_target_stage_id, crm_target_stage:crm_pipeline_stages(id, name, color, icon, order_index)`)
      .single();
    // Graceful: crm_target_stage_id column may not exist yet
    if (error && error.message?.includes('crm_target_stage_id')) {
      const { crm_target_stage_id: _t, ...payloadWithout } = insertPayload;
      const r2 = await supabase.from(VC_PIPELINE_TABLE).insert(payloadWithout).select(vcSelect).single();
      data = r2.data; error = r2.error;
    }
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

r.put('/pipeline-stages/:id', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const b = req.body;
    const { data: existingRow } = await supabase
      .from(VC_PIPELINE_TABLE).select('bucket_slug').eq('id', req.params.id).single();
    const update = {};
    ['name', 'color', 'icon', 'order_index', 'is_active', 'workflow_stage_id', 'bucket_slug',
      'crm_sync_type', 'crm_target_stage_id', 'progress_percent'].forEach((f) => {
      if (b[f] !== undefined) update[f] = b[f];
    });
    if (existingRow?.bucket_slug === INTAKE_BUCKET) {
      update.workflow_stage_id = null;
      update.crm_sync_type = null;
      update.crm_target_stage_id = null;
    }
    if (update.bucket_slug && update.bucket_slug !== INTAKE_BUCKET) {
      return res.status(400).json({ error: 'bucket_slug không hợp lệ' });
    }
    const vcSelect = 'id, name, color, icon, order_index, is_active, workflow_stage_id, bucket_slug, crm_sync_type, workflow_stage:workflow_stages(id, slug, name, color, icon)';
    let { data, error } = await supabase
      .from(VC_PIPELINE_TABLE)
      .update(update)
      .eq('id', req.params.id)
      .select(`${vcSelect}, crm_target_stage_id, crm_target_stage:crm_pipeline_stages(id, name, color, icon, order_index)`)
      .single();
    // Graceful: crm_target_stage_id column may not exist yet
    if (error && error.message?.includes('crm_target_stage_id')) {
      const { crm_target_stage_id: _t, ...updateWithout } = update;
      const r2 = await supabase.from(VC_PIPELINE_TABLE).update(updateWithout).eq('id', req.params.id).select(vcSelect).single();
      data = r2.data; error = r2.error;
    }
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

r.delete('/pipeline-stages/:id', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const { data: row } = await supabase
      .from(VC_PIPELINE_TABLE).select('bucket_slug').eq('id', req.params.id).single();
    if (row?.bucket_slug === INTAKE_BUCKET) {
      return res.status(400).json({ error: 'Không xóa cột chờ vận chuyển — chỉ có thể ẩn' });
    }
    await supabase.from(VC_PIPELINE_TABLE).delete().eq('id', req.params.id);
    res.json({ message: 'Đã xóa' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

r.put('/pipeline-stages-reorder', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const { stages } = req.body;
    for (const s of stages || []) {
      await supabase.from(VC_PIPELINE_TABLE).update({ order_index: s.order_index }).eq('id', s.id);
    }
    res.json({ message: 'Đã sắp xếp lại' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── Dashboard ─────────────────────────────────────────────────────────────

r.get('/dashboard', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const { division_id, company_id: companyIdQuery, workshop_type_id } = req.query;
    const company_id = effectiveWorkshopCompanyId(req, companyIdQuery);
    const { ids: stageIds } = await getLogisticsStageMap();
    const { stages: kanbanStages } = await getResolvedLogisticsStages(company_id);
    const sortedKanban = [...kanbanStages].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

    const orFilter = buildLogisticsScopeFilter(stageIds);
    if (!orFilter) return res.json({ kpis: {}, pipeline: [], projects: [] });

    let query = supabase
      .from('projects')
      .select(`id, code, name, estimated_value, status, deadline, created_at, company_id, logistics_company_id,
        current_stage_id, vc_kanban_column_id,
        current_stage:workflow_stages(id, slug, name, color, icon),
        customer:customers(id, full_name),
        company:companies!projects_company_id_fkey(id, name, short_name),
        logistics_company:companies!projects_logistics_company_id_fkey(id, name, short_name),
        workshop_type:workshop_project_types(id, name, applies_to),
        tasks(id, status)`)
      .or(orFilter);
    query = applyVcNotDeletedFilter(query);

    if (division_id) query = query.eq('division_id', division_id);
    if (company_id) query = query.or(`company_id.eq.${company_id},logistics_company_id.eq.${company_id}`);
    if (workshop_type_id) query = query.eq('workshop_type_id', workshop_type_id);
    ({ query } = await applyWorkshopProjectVisibilityScope(query, req.user, company_id, null));

    let { data: projectsRaw, error: dashErr } = await query.order('created_at', { ascending: false });
    if (dashErr && IS_VC_DELETED_AT_MISSING(dashErr)) {
      // Migration 242 chưa chạy — retry không filter cờ này
      let qNoSoft = supabase
        .from('projects')
        .select(`id, code, name, estimated_value, status, deadline, created_at, company_id, logistics_company_id,
          current_stage_id, vc_kanban_column_id,
          current_stage:workflow_stages(id, slug, name, color, icon),
          customer:customers(id, full_name),
          company:companies!projects_company_id_fkey(id, name, short_name),
          logistics_company:companies!projects_logistics_company_id_fkey(id, name, short_name),
          workshop_type:workshop_project_types(id, name, applies_to),
          tasks(id, status)`)
        .or(orFilter);
      if (division_id) qNoSoft = qNoSoft.eq('division_id', division_id);
      if (company_id) qNoSoft = qNoSoft.or(`company_id.eq.${company_id},logistics_company_id.eq.${company_id}`);
      if (workshop_type_id) qNoSoft = qNoSoft.eq('workshop_type_id', workshop_type_id);
      const rNoSoft = await qNoSoft.order('created_at', { ascending: false });
      projectsRaw = rNoSoft.data;
      dashErr = rNoSoft.error;
    }
    // Graceful degradation nếu vc_kanban_column_id chưa tồn tại
    if (dashErr && dashErr.message?.includes('vc_kanban_column_id')) {
      let q2 = supabase
        .from('projects')
        .select(`id, code, name, estimated_value, status, deadline, created_at, workshop_type_id, company_id, logistics_company_id,
          current_stage_id,
          current_stage:workflow_stages(id, slug, name, color, icon),
          customer:customers(id, full_name),
          company:companies!projects_company_id_fkey(id, name, short_name),
          logistics_company:companies!projects_logistics_company_id_fkey(id, name, short_name),
          tasks(id, status)`)
        .or(orFilter);
      if (division_id) q2 = q2.eq('division_id', division_id);
      if (company_id) q2 = q2.or(`company_id.eq.${company_id},logistics_company_id.eq.${company_id}`);
      if (workshop_type_id) q2 = q2.eq('workshop_type_id', workshop_type_id);
      const { data: d0 } = await q2.order('created_at', { ascending: false });
      projectsRaw = d0;
    } else if (dashErr && dashErr.message?.includes('workshop_project_types')) {
      let q2 = supabase
        .from('projects')
        .select(`id, code, name, estimated_value, status, deadline, created_at, workshop_type_id, vc_kanban_column_id, company_id, logistics_company_id,
          current_stage_id,
          current_stage:workflow_stages(id, slug, name, color, icon),
          customer:customers(id, full_name),
          company:companies!projects_company_id_fkey(id, name, short_name),
          logistics_company:companies!projects_logistics_company_id_fkey(id, name, short_name),
          tasks(id, status)`)
        .or(orFilter);
      if (division_id) q2 = q2.eq('division_id', division_id);
      if (company_id) q2 = q2.or(`company_id.eq.${company_id},logistics_company_id.eq.${company_id}`);
      if (workshop_type_id) q2 = q2.eq('workshop_type_id', workshop_type_id);
      const { data, error: e2 } = await q2.order('created_at', { ascending: false });
      if (e2 && e2.message?.includes('vc_kanban_column_id')) {
        let q3 = supabase
          .from('projects')
          .select(`id, code, name, estimated_value, status, deadline, created_at, workshop_type_id, company_id, logistics_company_id,
            current_stage_id,
            current_stage:workflow_stages(id, slug, name, color, icon),
            customer:customers(id, full_name),
            company:companies!projects_company_id_fkey(id, name, short_name),
            logistics_company:companies!projects_logistics_company_id_fkey(id, name, short_name),
            tasks(id, status)`)
          .or(orFilter);
        if (division_id) q3 = q3.eq('division_id', division_id);
        if (company_id) q3 = q3.or(`company_id.eq.${company_id},logistics_company_id.eq.${company_id}`);
        if (workshop_type_id) q3 = q3.eq('workshop_type_id', workshop_type_id);
        const d3 = await q3.order('created_at', { ascending: false });
        projectsRaw = d3.data;
      } else {
        projectsRaw = data;
      }
    }
    const projects = projectsRaw || [];

    const enrichedVc = await enrichProjectsForLogistics(projects, company_id);
    const enhanced = enrichedVc.map((p) => ({
      ...p,
      progress: calcTaskProgress(p.tasks),
      task_total: p.tasks?.length || 0,
      done_tasks: p.tasks?.filter((t) => t.status === 'done').length || 0,
    }));

    const overdueCount = enhanced.filter((p) =>
      p.deadline && new Date(p.deadline) < new Date() && p.status !== 'completed'
    ).length;

    const kpis = {
      total_projects: enhanced.length,
      shipping: enhanced.filter((p) => p.status === 'shipping' || p.current_stage?.slug === 'delivery').length,
      installing: enhanced.filter((p) => p.status === 'installing' || p.current_stage?.slug === 'installation').length,
      warranty: enhanced.filter((p) => p.status === 'warranty' || p.current_stage?.slug === 'customer-care').length,
      completed: enhanced.filter((p) => p.status === 'completed').length,
      overdue: overdueCount,
      total_value: enhanced.reduce((s, p) => s + (p.estimated_value || 0), 0),
      avg_progress: enhanced.length
        ? Math.round(enhanced.reduce((s, p) => s + (p.progress || 0), 0) / enhanced.length)
        : 0,
    };

    res.json({ kpis, pipeline: buildLogisticsPipelineSummary(sortedKanban, enhanced), projects: enhanced });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── Projects list ──────────────────────────────────────────────────────────

r.get('/projects', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const { search, priority, page = 1, limit = 100, division_id, company_id: companyIdQuery, workshop_type_id } = req.query;
    const company_id = effectiveWorkshopCompanyId(req, companyIdQuery);
    const parsedPage = Math.max(parseInt(page) || 1, 1);
    const parsedLimit = Math.min(Math.max(parseInt(limit) || 100, 1), 500);
    const { ids: stageIds } = await getLogisticsStageMap();
    const { stages: kanbanStages } = await getResolvedLogisticsStages(company_id);
    const sortedKanban = [...kanbanStages].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

    const orFilter = buildLogisticsScopeFilter(stageIds);
    if (!orFilter) return res.json({ projects: [], total: 0 });

    let query = supabase
      .from('projects')
      .select(`id, code, name, estimated_value, priority, deadline, created_at, status, notes, company_id, logistics_company_id,
        current_stage_id, vc_kanban_column_id,
        current_stage:workflow_stages(id, slug, name, color, icon),
        customer:customers(id, full_name, phone),
        company:companies!projects_company_id_fkey(id, name, short_name),
        logistics_company:companies!projects_logistics_company_id_fkey(id, name, short_name),
        logistics_person:users!projects_logistics_person_id_fkey(id, full_name, avatar),
        production_person:users!projects_production_person_id_fkey(id, full_name),
        sales_person:users!projects_sales_person_id_fkey(id, full_name),
        workshop_type:workshop_project_types(id, name, applies_to),
        tasks(id, status)`, { count: 'exact' })
      .or(orFilter);
    query = applyVcNotDeletedFilter(query);

    if (search) query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`);
    if (priority) query = query.eq('priority', priority);
    if (division_id) query = query.eq('division_id', division_id);
    if (company_id) query = query.or(`company_id.eq.${company_id},logistics_company_id.eq.${company_id}`);
    if (workshop_type_id) query = query.eq('workshop_type_id', workshop_type_id);
    ({ query } = await applyWorkshopProjectVisibilityScope(query, req.user, company_id, null));

    let { data: projectsRaw, error } = await query
      .order('created_at', { ascending: false })
      .range((parsedPage - 1) * parsedLimit, parsedPage * parsedLimit - 1);

    if (error && IS_VC_DELETED_AT_MISSING(error)) {
      // Migration 242 chưa chạy — retry không có cờ
      let qNoSoft = supabase
        .from('projects')
        .select(`id, code, name, estimated_value, priority, deadline, created_at, status, notes, company_id, logistics_company_id,
          current_stage_id, vc_kanban_column_id,
          current_stage:workflow_stages(id, slug, name, color, icon),
          customer:customers(id, full_name, phone),
          company:companies!projects_company_id_fkey(id, name, short_name),
          logistics_company:companies!projects_logistics_company_id_fkey(id, name, short_name),
          logistics_person:users!projects_logistics_person_id_fkey(id, full_name, avatar),
          production_person:users!projects_production_person_id_fkey(id, full_name),
          sales_person:users!projects_sales_person_id_fkey(id, full_name),
          workshop_type:workshop_project_types(id, name, applies_to),
          tasks(id, status)`, { count: 'exact' })
        .or(orFilter);
      if (search) qNoSoft = qNoSoft.or(`name.ilike.%${search}%,code.ilike.%${search}%`);
      if (priority) qNoSoft = qNoSoft.eq('priority', priority);
      if (division_id) qNoSoft = qNoSoft.eq('division_id', division_id);
      if (company_id) qNoSoft = qNoSoft.or(`company_id.eq.${company_id},logistics_company_id.eq.${company_id}`);
      if (workshop_type_id) qNoSoft = qNoSoft.eq('workshop_type_id', workshop_type_id);
      const r2 = await qNoSoft
        .order('created_at', { ascending: false })
        .range((parsedPage - 1) * parsedLimit, parsedPage * parsedLimit - 1);
      projectsRaw = r2.data;
      error = r2.error;
    }

    let projects = projectsRaw || [];

    // Fallback if logistics_person column / FK doesn't exist yet
    const isLogisticsPersonError = (err) =>
      err?.message?.includes('logistics_person_id') ||
      err?.message?.includes('logistics_person') ||
      err?.message?.includes('projects_logistics_person') ||
      (err?.message?.includes('relationship') && err?.message?.includes('users'));
    if (error && isLogisticsPersonError(error)) {
      // Thử lại không có logistics_person join
      let fb2q = supabase
        .from('projects')
        .select(`id, code, name, estimated_value, priority, deadline, created_at, status,
          current_stage_id, vc_kanban_column_id,
          current_stage:workflow_stages(id, slug, name, color, icon),
          customer:customers(id, full_name, phone),
          company:companies!projects_company_id_fkey(id, name, short_name),
          logistics_company:companies!projects_logistics_company_id_fkey(id, name, short_name),
          tasks(id, status)`, { count: 'exact' })
        .or(orFilter);
      if (division_id) fb2q = fb2q.eq('division_id', division_id);
      if (company_id) fb2q = fb2q.or(`company_id.eq.${company_id},logistics_company_id.eq.${company_id}`);
      if (workshop_type_id) fb2q = fb2q.eq('workshop_type_id', workshop_type_id);
      const fb2 = await fb2q
        .order('created_at', { ascending: false })
        .range((parsedPage - 1) * parsedLimit, parsedPage * parsedLimit - 1);

      if (!fb2.error) {
        projects = fb2.data || [];
        error = null;
      } else {
        // Thử lại tiếp không có bất kỳ user join nào
        let fb3q = supabase
          .from('projects')
          .select(`id, code, name, estimated_value, priority, deadline, created_at, status,
            current_stage_id,
            current_stage:workflow_stages(id, slug, name, color, icon),
            customer:customers(id, full_name, phone),
            tasks(id, status)`)
          .or(orFilter);
        if (division_id) fb3q = fb3q.eq('division_id', division_id);
        if (company_id) fb3q = fb3q.eq('company_id', company_id);
        if (workshop_type_id) fb3q = fb3q.eq('workshop_type_id', workshop_type_id);
        const fb3 = await fb3q
          .order('created_at', { ascending: false })
          .range((parsedPage - 1) * parsedLimit, parsedPage * parsedLimit - 1);
        projects = fb3.data || [];
        error = fb3.error;
      }
    }

    if (error && projects.length === 0) throw error;

    const enrichedVc = await enrichProjectsForLogistics(projects, company_id);
    const enhanced = enrichedVc.map((p) => ({
      ...p,
      progress: calcTaskProgress(p.tasks),
      task_total: p.tasks?.length || 0,
      done_tasks: p.tasks?.filter((t) => t.status === 'done').length || 0,
    }));

    res.json({ projects: enhanced, total: enhanced.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── Project detail ─────────────────────────────────────────────────────────
/**
 * Workshop type fields (migration 97 + 251).
 * Cần trả về `workshop_type_id` + embed `workshop_type:workshop_project_types(...)`
 * để Frontend hiển thị badge "Đã phân loại" và load pipeline VC theo loại.
 */
const VC_WORKSHOP_TYPE_SCALAR = 'workshop_type_id,';
const VC_WORKSHOP_TYPE_EMBED = 'workshop_type:workshop_project_types(id, name, applies_to),';

const LOGISTICS_DETAIL_SELECT_FULL = `
        id, company_id, code, name, estimated_value, status, deadline, created_at, notes, priority,
        production_deadline, production_note, install_address, vc_kanban_column_id,
        current_stage_id, ${VC_WORKSHOP_TYPE_SCALAR}
        ${VC_WORKSHOP_TYPE_EMBED}
        current_stage:workflow_stages(id, slug, name, color, icon),
        customer:customers(id, full_name, phone, email, address),
        company:companies!projects_company_id_fkey(id, name, short_name),
        logistics_company:companies!projects_logistics_company_id_fkey(id, name, short_name),
        logistics_person:users!projects_logistics_person_id_fkey(id, full_name, avatar),
        installer_person:users!projects_installer_person_id_fkey(id, full_name, avatar),
        production_person:users!projects_production_person_id_fkey(id, full_name, avatar),
        sales_person:users!projects_sales_person_id_fkey(id, full_name),
        supervisor:users!projects_supervisor_id_fkey(id, full_name),
        assignee:users!projects_assigned_to_fkey(id, full_name),
        delivery_team:workshop_teams!projects_delivery_team_id_fkey(id, name, color, type),
        installation_team:workshop_teams!projects_installation_team_id_fkey(id, name, color, type),
        tasks(id, title, status, priority, due_date, stage_id, stage:workflow_stages(id, slug, name))`;

const LOGISTICS_DETAIL_SELECT_NO_TEAMS = `
        id, company_id, code, name, estimated_value, status, deadline, created_at, notes, priority,
        production_deadline, production_note, install_address, vc_kanban_column_id,
        current_stage_id, ${VC_WORKSHOP_TYPE_SCALAR}
        ${VC_WORKSHOP_TYPE_EMBED}
        current_stage:workflow_stages(id, slug, name, color, icon),
        customer:customers(id, full_name, phone, email, address),
        company:companies!projects_company_id_fkey(id, name, short_name),
        logistics_company:companies!projects_logistics_company_id_fkey(id, name, short_name),
        logistics_person:users!projects_logistics_person_id_fkey(id, full_name, avatar),
        production_person:users!projects_production_person_id_fkey(id, full_name, avatar),
        sales_person:users!projects_sales_person_id_fkey(id, full_name),
        supervisor:users!projects_supervisor_id_fkey(id, full_name),
        assignee:users!projects_assigned_to_fkey(id, full_name),
        tasks(id, title, status, priority, due_date, stage_id, stage:workflow_stages(id, slug, name))`;

const LOGISTICS_DETAIL_SELECT_NO_VC_K = `
        id, company_id, code, name, estimated_value, status, deadline, created_at, notes, priority,
        production_deadline, production_note, install_address,
        current_stage_id, ${VC_WORKSHOP_TYPE_SCALAR}
        ${VC_WORKSHOP_TYPE_EMBED}
        current_stage:workflow_stages(id, slug, name, color, icon),
        customer:customers(id, full_name, phone, email, address),
        company:companies!projects_company_id_fkey(id, name, short_name),
        logistics_company:companies!projects_logistics_company_id_fkey(id, name, short_name),
        production_person:users!projects_production_person_id_fkey(id, full_name, avatar),
        sales_person:users!projects_sales_person_id_fkey(id, full_name),
        supervisor:users!projects_supervisor_id_fkey(id, full_name),
        assignee:users!projects_assigned_to_fkey(id, full_name),
        tasks(id, title, status, priority, due_date, stage_id, stage:workflow_stages(id, slug, name))`;

// Fallback cực thấp: DB chưa có FK projects → users / workshop_teams
const LOGISTICS_DETAIL_SELECT_NO_USERS = `
        id, company_id, code, name, estimated_value, status, deadline, created_at, notes, priority,
        production_deadline, production_note, install_address, vc_kanban_column_id,
        current_stage_id, ${VC_WORKSHOP_TYPE_SCALAR}
        ${VC_WORKSHOP_TYPE_EMBED}
        current_stage:workflow_stages(id, slug, name, color, icon),
        customer:customers(id, full_name, phone, email, address),
        company:companies!projects_company_id_fkey(id, name, short_name),
        logistics_company:companies!projects_logistics_company_id_fkey(id, name, short_name),
        tasks(id, title, status, priority, due_date, stage_id, stage:workflow_stages(id, slug, name))`;

function vcStripWorkshopTypeEmbed(sel) {
  return sel.replace(VC_WORKSHOP_TYPE_EMBED, '');
}
function vcStripWorkshopTypeAll(sel) {
  return sel.replace(VC_WORKSHOP_TYPE_EMBED, '').replace(VC_WORKSHOP_TYPE_SCALAR, '');
}

async function fetchLogisticsProjectRow(projectUuid) {
  const baseTries = [
    LOGISTICS_DETAIL_SELECT_FULL,
    LOGISTICS_DETAIL_SELECT_NO_TEAMS,
    LOGISTICS_DETAIL_SELECT_NO_VC_K,
    LOGISTICS_DETAIL_SELECT_NO_USERS,
  ];
  /**
   * Chain biến thể workshop_type:
   *  - 'full':    có cả scalar + embed
   *  - 'no_embed': chỉ scalar (FK chưa nạp trên PostgREST)
   *  - 'no_col':   bỏ cả workshop_type_id (DB chưa migrate)
   */
  const transforms = [
    (sel) => sel,
    vcStripWorkshopTypeEmbed,
    vcStripWorkshopTypeAll,
  ];
  let lastErr = null;
  for (const baseSel of baseTries) {
    for (const tx of transforms) {
      const sel = tx(baseSel);
      const { data, error } = await supabase.from('projects').select(sel).eq('id', projectUuid).single();
      if (!error && data) return { data, error: null };
      lastErr = error;
      if (error?.code === 'PGRST116') return { data: null, error };
      const msg = String(error?.message || '');
      // Workshop_type relationship/column issues → thử biến thể tiếp theo trên CÙNG baseSel
      if (msg.includes('workshop_project_types') || msg.includes('workshop_type_id')) continue;
      // Các lỗi cũ → break inner loop để chuyển baseSel tiếp theo
      if (msg.includes("relationship between 'projects' and 'users'")) break;
      if (msg.includes('schema cache') && msg.includes('projects') && msg.includes('users')) break;
      if (msg.includes('vc_kanban_column_id') && baseSel !== LOGISTICS_DETAIL_SELECT_NO_VC_K) break;
      if (
        msg.includes('installer_person_id')
        || msg.includes('workshop_teams')
        || msg.includes('delivery_team')
        || msg.includes('installation_team')
      ) break;
      if (
        msg.includes('logistics_person_id')
        || msg.includes('logistics_person')
        || msg.includes('projects_logistics_person')
      ) break;
      // Lỗi khác → trả về luôn
      return { data: null, error };
    }
  }
  return { data: null, error: lastErr };
}

r.get('/projects/:id', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const rawId = String(req.params.id || '').trim();
    let projectId = rawId;
    let { data: project, error } = await fetchLogisticsProjectRow(projectId);

    if (error || !project) {
      const { data: leadRow, error: leadErr } = await supabase
        .from('crm_leads')
        .select('project_id, title, type')
        .eq('id', rawId)
        .maybeSingle();
      if (!leadErr && leadRow?.project_id) {
        projectId = leadRow.project_id;
        ({ data: project, error } = await fetchLogisticsProjectRow(projectId));
      }
    }

    if (error || !project) {
      // Distinguish "not found" vs "select failed" (missing columns/relationships)
      try {
        const { data: bare, error: bareErr } = await supabase
          .from('projects')
          .select('id, code, status, current_stage_id, vc_kanban_column_id')
          .eq('id', projectId)
          .maybeSingle();
        if (!bareErr && bare?.id && error && error.code !== 'PGRST116') {
          console.error('[logistics/projects/:id] select failed for existing project:', error);
          return res.status(500).json({
            error: 'Lỗi tải chi tiết dự án VC',
            details: error.message || String(error),
            project_id: bare.id,
            project_code: bare.code || null,
          });
        }
      } catch (_) { /* ignore */ }
      return res.status(404).json({ error: 'Dự án không tồn tại' });
    }

    const rowId = project.id;

    // Kiểm tra dự án có trong scope VC (đồng bộ với list + dự án chỉ có Kanban VC / đơn bàn giao)
    const { ids: stageIds } = await getLogisticsStageMap();
    const stageSlug = project.current_stage?.slug;
    let inScope = LOGISTICS_STATUSES.includes(project.status)
      || (stageSlug && LOGISTICS_STAGE_SLUGS.includes(stageSlug))
      || stageIds.includes(String(project.current_stage_id));

    if (!inScope && project.vc_kanban_column_id) {
      inScope = true;
    }
    if (!inScope) {
      const { count, error: ocErr } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('logistics_project_id', rowId);
      if (!ocErr && (count || 0) > 0) inScope = true;
    }

    if (!inScope) {
      return res.status(403).json({ error: 'Dự án này chưa ở giai đoạn vận chuyển' });
    }

    const workshopCoId = project.logistics_company_id || project.company_id;
    if (await userNeedsParticipantOnlyProductionScopeForWorkshop(req.user, workshopCoId)) {
      const okParticipant = await userCanAccessProductionProjectAsParticipant(
        req.user.userId,
        rowId,
        req.user,
      );
      if (!okParticipant) {
        return res.status(403).json({ error: 'Chỉ xem dự án các deal bạn tham gia' });
      }
    } else if (isCrossWorkshopProductionViewer(req.user) && isMetallaOrHucabiCompanyIdSync(workshopCoId)) {
      const crossOk = await userCanAccessCrossWorkshopProductionProject(req.user, rowId);
      if (!crossOk) {
        return res.status(403).json({ error: 'Dự án không thuộc deal công ty của bạn tại xưởng này' });
      }
    }

    const viewerCompanyId = req.user?.company_id || null;
    const ownerCompanyId = project.company_id || project.logistics_company_id || null;
    if (viewerCompanyId && ownerCompanyId && String(viewerCompanyId) !== String(ownerCompanyId)) {
      const crossOk = await userCanAccessCrossWorkshopProductionProject(req.user, rowId);
      if (!crossOk) {
        return res.status(403).json({ error: 'Dự án không thuộc phạm vi công ty của bạn' });
      }
    }

    // A) VC dùng chung tài liệu CRM (lead_documents) đã chia sẻ sang xưởng.
    // (Tài liệu nội bộ VC nếu có sẽ nằm trong file_attachments / dự án đầy đủ.)
    const { data: sharedRaw, error: sharedErr } = await supabase
      .from('lead_documents')
      .select('id, lead_id, project_id, name, doc_type, file_url, file_name, file_size, mime_type, notes, created_at, created_by, allowed_departments, allowed_companies, allowed_share_modules, shared_to_workshop, crm_stage_slug')
      .eq('project_id', rowId)
      .eq('shared_to_workshop', true)
      .order('created_at', { ascending: false });
    if (sharedErr) console.warn('[logistics/projects/:id] lead_documents shared:', sharedErr.message);
    const sharedDocs = (Array.isArray(sharedRaw) ? sharedRaw : []).filter((d) => {
      // Nhiệm vụ / tài liệu giai đoạn SX chỉ thuộc module Sản xuất — không hiển thị ở Vận chuyển
      if (String(d.crm_stage_slug || '').startsWith('sx_')) return false;
      return leadDocVisibleForModuleAndUser(d, 'logistics', req.user);
    });
    const docs = [];

    // CRM deals + badge SX/VC để tab chi tiết VC không mất tag module Sản xuất sau khi reload/move stage.
    let crmDeals = [];
    try {
      const { data: crmDealsRaw, error: crmDealsErr } = await supabase
        .from('crm_leads')
        .select(`
          id, name, type,
          stage:crm_pipeline_stages(id, name, color, is_won),
          sx_pipeline_stage:production_pipeline_stages(id, name, color, icon, bucket_slug, company:companies(id, name, short_name)),
          vc_pipeline_stage:logistics_pipeline_stages(id, name, color, icon, bucket_slug)
        `)
        .eq('project_id', rowId)
        .eq('type', 'deal');
      if (crmDealsErr) throw crmDealsErr;
      crmDeals = Array.isArray(crmDealsRaw) ? crmDealsRaw : [];
    } catch (crmDealsBadgeErr) {
      console.warn('[logistics/projects/:id] crm_leads badges:', crmDealsBadgeErr.message);
      const { data: crmDealsRaw2, error: crmDealsErr2 } = await supabase
        .from('crm_leads')
        .select('id, name, type, stage:crm_pipeline_stages(id, name, color, is_won)')
        .eq('project_id', rowId)
        .eq('type', 'deal');
      if (crmDealsErr2) console.warn('[logistics/projects/:id] crm_leads:', crmDealsErr2.message);
      crmDeals = Array.isArray(crmDealsRaw2) ? crmDealsRaw2 : [];
    }

    // Stage transitions
    const { data: transitionsRaw, error: transErr } = await supabase
      .from('stage_transitions')
      .select('id, from_stage_id, to_stage_id, created_at, notes, transitioned_by, from_stage:workflow_stages!stage_transitions_from_stage_id_fkey(id,name), to_stage:workflow_stages!stage_transitions_to_stage_id_fkey(id,name)')
      .eq('project_id', rowId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (transErr) console.warn('[logistics/projects/:id] stage_transitions:', transErr.message);
    const transitions = Array.isArray(transitionsRaw) ? transitionsRaw : [];

    // Comments (DB có thể thiếu relationship projects↔users, fallback không join user)
    let comments = [];
    try {
      const c1 = await supabase
        .from('project_comments')
        .select('id, content, created_at, user:users!project_comments_user_id_fkey(id, full_name, avatar)')
        .eq('project_id', rowId)
        .order('created_at', { ascending: false })
        .limit(30);
      if (c1.error && String(c1.error.message || '').includes("relationship between 'project_comments' and 'users'")) {
        const c2 = await supabase
          .from('project_comments')
          .select('id, content, created_at, user_id')
          .eq('project_id', rowId)
          .order('created_at', { ascending: false })
          .limit(30);
        if (c2.error) console.warn('[logistics/projects/:id] project_comments fb:', c2.error.message);
        comments = Array.isArray(c2.data) ? c2.data : [];
      } else {
        if (c1.error) console.warn('[logistics/projects/:id] project_comments:', c1.error.message);
        comments = Array.isArray(c1.data) ? c1.data : [];
      }
    } catch (ce) {
      console.warn('[logistics/projects/:id] project_comments catch:', ce.message);
      comments = [];
    }

    // Incidents
    let incidents = [];
    try {
      const incRes = await supabase
        .from('project_incidents')
        .select('*')
        .eq('project_id', rowId)
        .order('created_at', { ascending: false })
        .limit(20);
      incidents = incRes.data || [];
    } catch (_) { /* bảng chưa có hoặc lỗi tạm thời */ }

    const pcid = project.company_id || project.company?.id || null;
    const { stages: kStages } = await getResolvedLogisticsStages(pcid ? String(pcid) : null);
    const sortedK = [...kStages].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    const [vcRow] = await enrichProjectsForLogistics([project], pcid ? String(pcid) : null);

    res.json({
      project: {
        ...project,
        vc_kanban_column_id: vcRow.vc_kanban_column_id,
        vc_intake: vcRow.vc_intake,
        taskProgress: calcTaskProgress(project.tasks),
        documents: docs,
        sharedDocuments: sharedDocs,
        crmDeals: crmDeals || [],
        stageTransitions: transitions || [],
        recentComments: comments || [],
        incidents: incidents || [],
        vcKanbanStages: sortedK.map((c) => ({
          id: c.id, name: c.name, color: c.color, icon: c.icon,
          bucket_slug: c.bucket_slug,
          workflow_stage_id: c.workflow_stage_id || c.workflow_stage?.id,
          slug: c.workflow_stage?.slug,
        })),
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── Stage move ──────────────────────────────────────────────────────────────

r.patch('/projects/:id/stage', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const { id } = req.params;
    // stage_id = workflow_stages.id (tùy chọn), vc_stage_id = logistics_pipeline_stages.id (ưu tiên)
    const { stage_id, vc_stage_id, move_to_intake } = req.body;
    const userId = req.user.userId;

    const { data: project } = await supabase
      .from('projects')
      .select('id, current_stage_id, code, name, status, company_id')
      .eq('id', id)
      .single();
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (move_to_intake === true || move_to_intake === 'true') {
      // Tìm cột intake/first để lưu vc_kanban_column_id
      const pcid = project.company_id ? String(project.company_id) : null;
      const { stages: kStages } = await getResolvedLogisticsStages(pcid).catch(() => ({ stages: [] }));
      const intakeCol = kStages.find((c) => c.bucket_slug === INTAKE_BUCKET) || kStages[0] || null;
      const intakeColId = intakeCol?.id && !String(intakeCol.id).startsWith('__') ? intakeCol.id : null;

      const intakeUpdate = { current_stage_id: null };
      if (intakeColId) intakeUpdate.vc_kanban_column_id = intakeColId;
      await supabase.from('projects').update(intakeUpdate).eq('id', id)
        .catch(() => supabase.from('projects').update({ current_stage_id: null }).eq('id', id));

      try {
        await supabase.from('stage_transitions').insert({
          project_id: id, from_stage_id: project.current_stage_id, to_stage_id: null,
          notes: 'Kéo về cột chờ vận chuyển (Kanban VC)', transitioned_by: userId,
        });
      } catch (te) { console.warn('[logistics] stage_transitions intake:', te.message); }

      if (intakeColId) {
        await syncVcPipelineStageToLead(id, intakeColId).catch((ve) => console.warn('[logistics/intake] sync vc stage:', ve.message));
      }

      const { data: updated } = await supabase
        .from('projects').select('id, code, name, status, current_stage_id, vc_kanban_column_id, current_stage:workflow_stages(id, slug, name, color)').eq('id', id).single()
        .catch(() => supabase.from('projects').select('id, code, name, status, current_stage_id, current_stage:workflow_stages(id, slug, name, color)').eq('id', id).single());
      return res.json({ project: updated?.data || updated });
    }

    // Cần ít nhất một trong: stage_id (workflow_stages) hoặc vc_stage_id (logistics_pipeline_stages)
    if (!stage_id && !vc_stage_id) return res.status(400).json({ error: 'Cần stage_id hoặc vc_stage_id hoặc move_to_intake' });

    // Nếu chỉ có vc_stage_id, tìm workflow_stage_id tương ứng (nếu có)
    let resolvedStageId = stage_id || null;
    let vcPipeStageRow = null;
    if (vc_stage_id) {
      const { data: vcRow } = await supabase
        .from(VC_PIPELINE_TABLE)
        .select('id, name, crm_sync_type, crm_target_stage_id, workflow_stage_id')
        .eq('id', vc_stage_id)
        .maybeSingle();
      vcPipeStageRow = vcRow;
      if (vcRow?.workflow_stage_id && !resolvedStageId) {
        resolvedStageId = vcRow.workflow_stage_id;
      }
    }

    const targetStage = resolvedStageId
      ? (await supabase.from('workflow_stages').select('id, slug').eq('id', resolvedStageId).single()).data
      : null;

    const statusMap = {
      delivery: 'shipping',
      installation: 'installing',
      'customer-care': 'warranty',
    };

    const updatePayload = {};
    if (resolvedStageId) updatePayload.current_stage_id = resolvedStageId;
    if (vc_stage_id) updatePayload.vc_kanban_column_id = vc_stage_id;
    if (statusMap[targetStage?.slug]) updatePayload.status = statusMap[targetStage.slug];

    // Thử update với vc_kanban_column_id; nếu cột chưa tồn tại, fallback không có cột đó
    let { error: updateError } = await supabase.from('projects').update(updatePayload).eq('id', id);
    if (updateError && updateError.message?.includes('vc_kanban_column_id')) {
      const fallbackPayload = { ...updatePayload };
      delete fallbackPayload.vc_kanban_column_id;
      ({ error: updateError } = await supabase.from('projects').update(fallbackPayload).eq('id', id));
    }
    if (updateError) throw updateError;

    try {
      await supabase.from('stage_transitions').insert({
        project_id: id,
        from_stage_id: project.current_stage_id,
        to_stage_id: resolvedStageId || null,
        transitioned_by: userId,
      });
    } catch (e) {
      console.warn('[logistics] stage_transitions:', e.message);
    }

    let updated = null;
    try {
      const r1 = await supabase
        .from('projects')
        .select('id, code, name, status, current_stage_id, vc_kanban_column_id, current_stage:workflow_stages(id, slug, name, color)')
        .eq('id', id)
        .single();
      if (!r1.error) updated = r1.data;
      else throw r1.error;
    } catch (_) {
      const r2 = await supabase
        .from('projects')
        .select('id, code, name, status, current_stage_id, current_stage:workflow_stages(id, slug, name, color)')
        .eq('id', id)
        .single();
      updated = r2.data;
    }

    // Kiểm tra cột VC có cờ crm_sync_type → đồng bộ CRM deal
    try {
      // Dùng vcPipeStageRow từ lookup trên nếu đã có
      let vcPipeStage = vcPipeStageRow;
      if (!vcPipeStage && resolvedStageId) {
        const { data } = await supabase
          .from(VC_PIPELINE_TABLE)
          .select('id, crm_sync_type, name')
          .eq('workflow_stage_id', resolvedStageId)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();
        vcPipeStage = data;
      }

      // Luôn cập nhật vc_pipeline_stage_id cho deal CRM
      const syncId = vcPipeStage?.id || vc_stage_id || null;
      if (syncId) {
        await syncVcPipelineStageToLead(id, syncId);
        const io = req.app.get('io');
        emitCrmBadgeUpdateForProject(id, io).catch(() => {});
      }

      if (vcPipeStage?.crm_sync_type || vcPipeStage?.crm_target_stage_id) {
        // Truyền full row để syncCrmLeadFromLogisticsStage ưu tiên crm_target_stage_id
        await syncCrmLeadFromLogisticsStage(id, vcPipeStage);

        // Thông báo đồng bộ CRM ← VC (không gửi role sale — tránh spam NVKD với tin kiểu xưởng/vận chuyển)
        try {
          const { data: mgrUsers } = await supabase
            .from('users').select('id').in('role', ['manager', 'admin', 'sales_admin']).eq('is_active', true);
          const crmRecipients = (mgrUsers || []).map((u) => u.id).filter((uid) => uid !== userId);
          const labelMap = { delivery: 'Vận chuyển', installation: 'Lắp đặt', customer_care: 'Chăm sóc KH' };
          const syncLabel = vcPipeStage.crm_sync_type ? (labelMap[vcPipeStage.crm_sync_type] || vcPipeStage.crm_sync_type) : 'CRM';
          if (crmRecipients.length) {
            await notifyMultipleShared(req, crmRecipients, 'crm_stage_changed',
              `📋 CRM: Deal chuyển sang ${syncLabel}`,
              `Dự án ${updated.code || updated.name} đã đạt mốc "${vcPipeStage.name}" — deal CRM tự động cập nhật`,
              'project', id);
          }
        } catch (crmNotifErr) {
          console.warn('[logistics/stage] notify CRM sync:', crmNotifErr.message);
        }
      }
    } catch (crmSyncErr) {
      console.warn('[logistics/stage] crm_sync_type:', crmSyncErr.message);
    }

    // Thông báo nhân viên VC
    try {
      const { data: vcUsers } = await supabase
        .from('users').select('id').in('role', ['logistics', 'installer', 'manager']).eq('is_active', true);
      const recipientIds = (vcUsers || []).map((u) => u.id).filter((uid) => uid !== userId);
      if (recipientIds.length) {
        const stageName = updated.current_stage?.name || '';
        await notifyMultipleShared(req, recipientIds, 'logistics_stage_changed',
          `🚚 VC: ${stageName}`,
          `Dự án ${updated.code || updated.name} vừa chuyển sang "${stageName}"`,
          'project', id);
      }
    } catch (notifErr) {
      console.warn('[logistics/stage] notify:', notifErr.message);
    }

    const io = req.app.get('io');
    if (io) io.emit('project:stage_changed', updated);

    res.json({ project: updated });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── Incidents ──────────────────────────────────────────────────────────────

r.get('/projects/:id/incidents', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('project_incidents')
      .select('*')
      .eq('project_id', req.params.id)
      .order('created_at', { ascending: false });
    if (error) return res.json([]);
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/projects/:id/incidents', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const { title, description, severity = 'medium' } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Thiếu tiêu đề sự cố' });
    const { data, error } = await supabase
      .from('project_incidents')
      .insert({ project_id: req.params.id, title: title.trim(), description, severity, reported_by: req.user.userId, status: 'open' })
      .select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

r.patch('/projects/:projectId/incidents/:incidentId', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const update = {};
    ['title', 'description', 'severity', 'status'].forEach((f) => { if (req.body[f] !== undefined) update[f] = req.body[f]; });
    if (['resolved', 'closed'].includes(update.status)) {
      update.resolved_at = new Date().toISOString();
      update.resolved_by = req.user.userId;
    }
    const { data, error } = await supabase
      .from('project_incidents').update(update).eq('id', req.params.incidentId).eq('project_id', req.params.projectId).select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── Thùng rác VC (soft delete) ─────────────────────────────────────────────
// Migration: database/242_vc_soft_delete.sql

const VC_ADMIN_ROLES = new Set(['admin', 'superadmin', 'super_admin']);
function isVcAdmin(user) { return VC_ADMIN_ROLES.has(user?.role); }

const VC_TRASH_SELECT = `id, code, name, status, priority, deadline, created_at, company_id, logistics_company_id,
  vc_deleted_at, vc_deleted_by, vc_delete_reason,
  customer:customers(id, full_name, phone),
  company:companies!projects_company_id_fkey(id, name, short_name),
  logistics_company:companies!projects_logistics_company_id_fkey(id, name, short_name),
  deleted_user:users!projects_vc_deleted_by_fkey(id, full_name)`;

const VC_TRASH_SELECT_FALLBACK = `id, code, name, status, priority, deadline, created_at, company_id, logistics_company_id,
  vc_deleted_at, vc_deleted_by, vc_delete_reason,
  customer:customers(id, full_name, phone),
  company:companies!projects_company_id_fkey(id, name, short_name),
  logistics_company:companies!projects_logistics_company_id_fkey(id, name, short_name)`;

const VC_TRASH_SELECT_NO_REASON = `id, code, name, status, priority, deadline, created_at, company_id, logistics_company_id,
  vc_deleted_at, vc_deleted_by,
  customer:customers(id, full_name, phone),
  company:companies!projects_company_id_fkey(id, name, short_name),
  logistics_company:companies!projects_logistics_company_id_fkey(id, name, short_name),
  deleted_user:users!projects_vc_deleted_by_fkey(id, full_name)`;

const VC_TRASH_SELECT_FALLBACK_NO_REASON = `id, code, name, status, priority, deadline, created_at, company_id, logistics_company_id,
  vc_deleted_at, vc_deleted_by,
  customer:customers(id, full_name, phone),
  company:companies!projects_company_id_fkey(id, name, short_name),
  logistics_company:companies!projects_logistics_company_id_fkey(id, name, short_name)`;

// DELETE /api/logistics/projects/:id — soft-delete khỏi module VC
r.delete('/projects/:id', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const { id } = req.params;
    const rawReason = req.body?.delete_reason ?? req.query?.delete_reason ?? '';
    const deleteReason = String(rawReason || '').trim().slice(0, 500) || null;

    const { data: project, error: pErr } = await supabase
      .from('projects')
      .select('id, code, name, company_id, logistics_company_id')
      .eq('id', id)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!project) return res.status(404).json({ error: 'Không tìm thấy dự án' });

    const buildPatch = (includeReason) => {
      const patch = {
        vc_deleted_at: new Date().toISOString(),
        vc_deleted_by: req.user.userId,
      };
      if (includeReason) patch.vc_delete_reason = deleteReason;
      return patch;
    };

    let { error } = await supabase.from('projects').update(buildPatch(true)).eq('id', id);
    // Migration 243 chưa chạy — bỏ delete_reason rồi thử lại
    if (error && IS_VC_DELETE_REASON_MISSING(error)) {
      const retry = await supabase.from('projects').update(buildPatch(false)).eq('id', id);
      error = retry.error;
    }
    if (error) {
      if (IS_VC_DELETED_AT_MISSING(error)) {
        return res.status(503).json({
          error: 'Tính năng Thùng rác VC chưa được kích hoạt. Vui lòng chạy migration 242_vc_soft_delete.sql',
        });
      }
      throw error;
    }

    void writeAuditLog(req, {
      module: 'logistics',
      action: 'soft_delete',
      entity_type: 'project',
      entity_id: id,
      entity_label: project.name || project.code || id,
      company_id: project.logistics_company_id || project.company_id,
      metadata: { delete_reason: deleteReason, source: 'vc_kanban' },
    });

    const io = req.app.get('io');
    if (io) io.emit('logistics:project_trashed', { id });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/logistics/trash — danh sách dự án đã xóa khỏi VC
r.get('/trash', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const { search, company_id: companyIdQuery, deleted_by: deletedByQ } = req.query;
    const company_id = effectiveWorkshopCompanyId(req, companyIdQuery);

    const buildQuery = (selectCols) => {
      let q = supabase
        .from('projects')
        .select(selectCols)
        .not('vc_deleted_at', 'is', null)
        .order('vc_deleted_at', { ascending: false })
        .limit(500);
      if (company_id) q = q.or(`company_id.eq.${company_id},logistics_company_id.eq.${company_id}`);
      if (deletedByQ) q = q.eq('vc_deleted_by', deletedByQ);
      if (search) q = q.or(`name.ilike.%${search}%,code.ilike.%${search}%`);
      return q;
    };

    let { data, error } = await buildQuery(VC_TRASH_SELECT);
    if (error && IS_VC_DELETE_REASON_MISSING(error)) {
      const r2 = await buildQuery(VC_TRASH_SELECT_NO_REASON);
      data = r2.data;
      error = r2.error;
    }
    if (error && (error.message?.includes('projects_vc_deleted_by_fkey') || error.message?.includes('relationship'))) {
      const r2 = await buildQuery(VC_TRASH_SELECT_FALLBACK);
      data = r2.data;
      error = r2.error;
      if (error && IS_VC_DELETE_REASON_MISSING(error)) {
        const r3 = await buildQuery(VC_TRASH_SELECT_FALLBACK_NO_REASON);
        data = r3.data;
        error = r3.error;
      }
    }
    if (error && IS_VC_DELETED_AT_MISSING(error)) {
      return res.json({ items: [], migration_required: true });
    }
    if (error) throw error;
    res.json({ items: data || [] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/logistics/trash/:id/restore — phục hồi dự án về module VC
r.post('/trash/:id/restore', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const { id } = req.params;
    const { data: project, error: gErr } = await supabase
      .from('projects')
      .select('id, name, code, company_id, logistics_company_id, vc_deleted_at')
      .eq('id', id)
      .maybeSingle();
    if (gErr) {
      if (IS_VC_DELETED_AT_MISSING(gErr)) {
        return res.status(503).json({ error: 'Tính năng Thùng rác VC chưa được kích hoạt' });
      }
      throw gErr;
    }
    if (!project) return res.status(404).json({ error: 'Không tìm thấy dự án' });
    if (!project.vc_deleted_at) return res.status(400).json({ error: 'Dự án không nằm trong thùng rác' });

    const patchRestore = { vc_deleted_at: null, vc_deleted_by: null, vc_delete_reason: null };
    let { error } = await supabase.from('projects').update(patchRestore).eq('id', id);
    if (error && IS_VC_DELETE_REASON_MISSING(error)) {
      const { vc_delete_reason: _omit, ...rest } = patchRestore;
      void _omit;
      const retry = await supabase.from('projects').update(rest).eq('id', id);
      error = retry.error;
    }
    if (error) throw error;

    void writeAuditLog(req, {
      module: 'logistics',
      action: 'restore',
      entity_type: 'project',
      entity_id: id,
      entity_label: project.name || project.code || id,
      company_id: project.logistics_company_id || project.company_id,
      metadata: { source: 'vc_trash' },
    });

    const io = req.app.get('io');
    if (io) io.emit('logistics:project_restored', { id });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/logistics/trash/:id — xóa vĩnh viễn (chỉ admin)
r.delete('/trash/:id', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    if (!isVcAdmin(req.user)) {
      return res.status(403).json({ error: 'Chỉ admin được xóa vĩnh viễn' });
    }
    const { id } = req.params;
    const { data: project, error: gErr } = await supabase
      .from('projects')
      .select('id, name, code, company_id, logistics_company_id, vc_deleted_at')
      .eq('id', id)
      .maybeSingle();
    if (gErr && IS_VC_DELETED_AT_MISSING(gErr)) {
      return res.status(503).json({ error: 'Tính năng Thùng rác VC chưa được kích hoạt' });
    }
    if (gErr) throw gErr;
    if (!project) return res.status(404).json({ error: 'Không tìm thấy dự án' });
    if (!project.vc_deleted_at) {
      return res.status(400).json({ error: 'Chỉ xóa vĩnh viễn dự án đã ở thùng rác. Hãy xóa mềm trước.' });
    }

    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) throw error;

    void writeAuditLog(req, {
      module: 'logistics',
      action: 'purge',
      entity_type: 'project',
      entity_id: id,
      entity_label: project.name || project.code || id,
      company_id: project.logistics_company_id || project.company_id,
      metadata: { source: 'vc_trash' },
    });

    const io = req.app.get('io');
    if (io) io.emit('logistics:project_purged', { id });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;
