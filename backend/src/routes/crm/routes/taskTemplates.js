/**
 * CRM Task templates + tasks overview/planner.
 */
const { Router } = require('express');
const { supabase } = require('../../../config/supabase');
const { isCrmSystemAdminUser } = require('../../../helpers/crmAccessRoles');
const { isAdminLike, isSystemAdmin } = require('../../../helpers/adminRole');
const { assertRegionBelongsToCompany, normalizeRegionIdList } = require('../../../helpers/crmRegionScope');
const { getDefaultPipelineIdForCompany } = require('../../../helpers/crmTaxonomyCache');
const { applyCrmTaskTemplatesToCompanyRegions } = require('../../../helpers/autoGenCrmTasks');
const { isExecutorColumnError } = require('../../../helpers/crossCompanyWorkspace');
const {
  templateItemAssigneePatch,
  isDefaultAssigneeIdsColumnError,
} = require('../../../helpers/templateItemAssignees');
const { requireUserCompanyId, scopedAdminCompanyId } = require('../shared/requestScope');

const r = Router();

r.get('/tasks/overview', async (req, res) => {
  try {
    let effectiveCompanyId = null;
    if (!isSystemAdmin(req.user)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      effectiveCompanyId = cid;
    } else {
      const q = req.query.company_id;
      effectiveCompanyId = q && String(q).trim() ? String(q).trim() : null;
    }

    let leadIds = null;
    if (effectiveCompanyId) {
      const { data: leads, error: leErr } = await supabase.from('crm_leads').select('id').eq('company_id', effectiveCompanyId);
      if (leErr) throw leErr;
      leadIds = (leads || []).map((x) => x.id);
      if (!leadIds.length) return res.json([]);
    }

    const { status, assignee_id, stage_slug, type } = req.query;
    const taskScope = String(req.query?.task_scope || 'all').toLowerCase();
    let q = supabase.from('crm_tasks')
      .select('*, lead:crm_leads(id,title,code,type,project_id,customer:customers(id,full_name)), assignee:users!crm_tasks_assignee_id_fkey(id,full_name,avatar), supervisor:users!crm_tasks_supervisor_id_fkey(id,full_name,avatar)')
      .order('deadline', { ascending: true, nullsFirst: false });
    if (leadIds?.length) q = q.in('lead_id', leadIds);
    if (status) q = q.eq('status', status);
    if (assignee_id) q = q.eq('assignee_id', assignee_id);
    if (stage_slug) q = q.eq('stage_slug', stage_slug);
    const { data, error } = await q;
    if (error) throw error;
    let rows = data || [];
    if (type) rows = rows.filter((t) => (t.lead?.type || '') === type);
    if (taskScope === 'production') {
      rows = rows.filter((t) => String(t.stage_slug || '').startsWith('sx_') || t.production_pipeline_stage_id);
    } else if (taskScope === 'crm') {
      rows = rows.filter((t) => !String(t.stage_slug || '').startsWith('sx_'));
    }
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET CRM tasks planner (grouped by assignee)
r.get('/tasks/planner', async (req, res) => {
  try {
    let effectiveCompanyId = null;
    if (!isSystemAdmin(req.user)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      effectiveCompanyId = cid;
    } else {
      const q = req.query.company_id;
      effectiveCompanyId = q && String(q).trim() ? String(q).trim() : null;
    }
    let leadIds = null;
    if (effectiveCompanyId) {
      const { data: leads, error: leErr } = await supabase.from('crm_leads').select('id').eq('company_id', effectiveCompanyId);
      if (leErr) throw leErr;
      leadIds = (leads || []).map((x) => x.id);
      if (!leadIds.length) return res.json({ assignees: [], unassigned: [] });
    }

    let tq = supabase.from('crm_tasks')
      .select('*, lead:crm_leads(id,title,code,type), assignee:users!crm_tasks_assignee_id_fkey(id,full_name,avatar)')
      .in('status', ['pending', 'in_progress'])
      .order('deadline', { ascending: true, nullsFirst: false });
    if (leadIds?.length) tq = tq.in('lead_id', leadIds);
    const { data, error } = await tq;
    if (error) throw error;

    // Group by assignee
    const byAssignee = {};
    const unassigned = [];
    (data || []).forEach(t => {
      if (t.assignee_id) {
        if (!byAssignee[t.assignee_id]) byAssignee[t.assignee_id] = { user: t.assignee, tasks: [] };
        byAssignee[t.assignee_id].tasks.push(t);
      } else {
        unassigned.push(t);
      }
    });
    res.json({ assignees: Object.values(byAssignee), unassigned });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function crmTemplateMatchesLeadType(pipelineType, leadType) {
  const lt = String(leadType || 'both').toLowerCase();
  if (lt === 'both') return true;
  const pt = String(pipelineType || '').toLowerCase();
  return !pt || pt === 'both' || pt === lt;
}

async function resolveCrmBundleTemplateScope(sb, pipelineId, leadType) {
  const { data: stages, error: stErr } = await sb
    .from('crm_pipeline_stages')
    .select('id, pipeline_type')
    .eq('pipeline_id', pipelineId)
    .eq('is_active', true);
  if (stErr) throw stErr;

  const stageIds = (stages || [])
    .filter((s) => crmTemplateMatchesLeadType(s.pipeline_type, leadType))
    .map((s) => s.id);
  if (!stageIds.length) return { stageIds: [], templateIds: [] };

  const { data: rows, error: tplErr } = await sb
    .from('crm_task_templates')
    .select('id, pipeline_type, pipeline_stage_id')
    .eq('is_active', true)
    .in('pipeline_stage_id', stageIds);
  if (tplErr) throw tplErr;

  const templateIds = (rows || [])
    .filter((row) => crmTemplateMatchesLeadType(row.pipeline_type, leadType))
    .map((row) => row.id)
    .filter(Boolean);
  return { stageIds, templateIds };
}

// GET task templates
r.get('/task-templates', async (req, res) => {
  try {
    // Tham số:
    //   ?pipeline_id=<uuid>  → trả về cả bộ mẫu thuộc pipeline đó (pipeline_stage_id IN stages của pipeline)
    //                          VÀ bộ mẫu Global (pipeline_stage_id IS NULL).
    //   ?company_id=<uuid>   → mọi bộ mẫu pipeline của công ty (qua stages thuộc pipelines công ty).
    //   ?scope=global        → chỉ trả về bộ mẫu Global (pipeline_stage_id IS NULL).
    //   ?scope=pipeline      → chỉ trả về bộ mẫu thuộc pipeline (pipeline_stage_id NOT NULL).
    //   (mặc định)           → trả về TẤT CẢ (giữ tương thích frontend cũ).
    const pipelineId = req.query.pipeline_id ? String(req.query.pipeline_id).trim() : null;
    const companyId = req.query.company_id ? String(req.query.company_id).trim() : null;
    const scope = String(req.query.scope || '').trim();

    let q = supabase
      .from('crm_task_templates')
      .select('*, items:crm_task_template_items(*), pipeline_stage:crm_pipeline_stages!crm_task_templates_pipeline_stage_id_fkey(id, name, color, icon, order_index, pipeline_id, pipeline_type)')
      .eq('is_active', true)
      .order('order_index');

    if (scope === 'global') {
      q = q.is('pipeline_stage_id', null);
    } else if (scope === 'pipeline') {
      q = q.not('pipeline_stage_id', 'is', null);
    }

    if (pipelineId) {
      const { data: stages, error: stErr } = await supabase
        .from('crm_pipeline_stages')
        .select('id')
        .eq('pipeline_id', pipelineId);
      if (stErr) throw stErr;
      const stageIds = (stages || []).map((s) => s.id);
      if (stageIds.length === 0) {
        // Pipeline không có stage nào → chỉ trả global
        q = q.is('pipeline_stage_id', null);
      } else if (scope === 'pipeline') {
        q = q.in('pipeline_stage_id', stageIds);
      } else {
        const orClause = `pipeline_stage_id.in.(${stageIds.join(',')}),pipeline_stage_id.is.null`;
        q = q.or(orClause);
      }
    } else if (companyId) {
      const { data: companyPipelines, error: plErr } = await supabase
        .from('crm_pipelines')
        .select('id')
        .eq('company_id', companyId);
      if (plErr) throw plErr;
      const pipelineIds = (companyPipelines || []).map((p) => p.id);
      if (!pipelineIds.length) {
        if (scope === 'pipeline') return res.json([]);
        q = q.is('pipeline_stage_id', null);
      } else {
        const { data: stages, error: stErr } = await supabase
          .from('crm_pipeline_stages')
          .select('id')
          .in('pipeline_id', pipelineIds);
        if (stErr) throw stErr;
        const stageIds = (stages || []).map((s) => s.id);
        if (!stageIds.length) {
          if (scope === 'pipeline') return res.json([]);
          q = q.is('pipeline_stage_id', null);
        } else {
          q = q.in('pipeline_stage_id', stageIds);
        }
      }
    }

    const { data, error } = await q;
    if (error) {
      // Fallback nếu chưa chạy migration 214 (column pipeline_stage_id chưa có)
      if (String(error.message || '').includes('pipeline_stage_id')) {
        const { data: fbData, error: fbErr } = await supabase
          .from('crm_task_templates')
          .select('*, items:crm_task_template_items(*)')
          .eq('is_active', true)
          .order('order_index');
        if (fbErr) throw fbErr;
        return res.json(fbData || []);
      }
      throw error;
    }
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// CRM Task Templates CRUD
r.post('/task-templates', async (req, res) => {
  try {
    const b = req.body;
    // Auto-detect pipeline_type from stage_slug
    let autoType = b.stage_slug?.startsWith('deal_') ? 'deal' : (b.pipeline_type || 'both');
    // Slug hiệu lực: ưu tiên slug user gửi; nếu gắn vào pipeline_stage_id thì derive từ stage thật.
    // Mục đích: tương thích với DB chưa chạy migration 215 (stage_slug NOT NULL).
    let effectiveStageSlug = b.stage_slug || null;

    if (b.pipeline_stage_id) {
      const { data: st } = await supabase
        .from('crm_pipeline_stages')
        .select('pipeline_type, name, id')
        .eq('id', b.pipeline_stage_id)
        .maybeSingle();
      if (st?.pipeline_type) autoType = st.pipeline_type;
      if (!effectiveStageSlug && st) {
        // Tạo 1 slug ngắn cho legacy column. Prefix tránh trùng với slug global cũ.
        const baseName = (st.name || '').toString().toLowerCase().normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        const shortId = String(st.id || '').slice(0, 8);
        effectiveStageSlug = `pl_${baseName || 'stage'}_${shortId}`.slice(0, 60);
      }
    }
    // Nếu vẫn không có slug (rất hiếm: không gắn pipeline_stage_id, cũng không gửi slug)
    if (!effectiveStageSlug) effectiveStageSlug = 'pl_unassigned';

    const insertBody = {
      name: b.name,
      stage_slug: effectiveStageSlug,
      description: b.description || null,
      is_default: b.is_default || false,
      order_index: b.order_index || 0,
      pipeline_type: autoType,
    };
    if (b.pipeline_stage_id) insertBody.pipeline_stage_id = b.pipeline_stage_id;

    const { data, error } = await supabase.from('crm_task_templates').insert(insertBody).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.put('/task-templates/set-default-bundle', async (req, res) => {
  try {
    const pipelineId = req.body.pipeline_id && String(req.body.pipeline_id).trim();
    const leadTypeRaw = String(req.body.lead_type || 'both').toLowerCase();
    const leadType = ['lead', 'deal', 'both'].includes(leadTypeRaw) ? leadTypeRaw : 'both';
    const markDefault = req.body.is_default !== false;
    const templateIds = Array.isArray(req.body.template_ids)
      ? req.body.template_ids.map(String).filter(Boolean)
      : null;

    if (!pipelineId) return res.status(400).json({ error: 'Thiếu pipeline_id' });

    const { data: pipelineRow, error: plErr } = await supabase
      .from('crm_pipelines')
      .select('id, company_id')
      .eq('id', pipelineId)
      .maybeSingle();
    if (plErr) throw plErr;
    if (!pipelineRow) return res.status(400).json({ error: 'Pipeline không tồn tại' });

    const sac = scopedAdminCompanyId(req);
    if (!isCrmSystemAdminUser(req.user) && !isAdminLike(req.user)) {
      if (sac && pipelineRow.company_id && String(sac) !== String(pipelineRow.company_id)) {
        return res.status(403).json({ error: 'Pipeline không thuộc công ty của bạn' });
      }
    }

    const { stageIds, templateIds: scopeTemplateIds } = await resolveCrmBundleTemplateScope(
      supabase,
      pipelineId,
      leadType,
    );
    if (!stageIds.length) {
      return res.status(400).json({ error: 'Pipeline không có giai đoạn phù hợp loại Lead/Deal đã chọn' });
    }

    // Chỉ bỏ mặc định các bộ thuộc ĐÚNG pipeline + loại Lead/Deal này — không đụng pipeline khác.
    if (scopeTemplateIds.length) {
      const { error: clearErr } = await supabase
        .from('crm_task_templates')
        .update({ is_default: false })
        .in('id', scopeTemplateIds);
      if (clearErr) throw clearErr;
    }

    if (!markDefault) {
      return res.json({ ok: true, updated: 0, is_default: false, pipeline_id: pipelineId, lead_type: leadType });
    }

    let ids = templateIds;
    if (!ids?.length) {
      ids = scopeTemplateIds;
    } else {
      const allowed = new Set(scopeTemplateIds.map(String));
      ids = ids.filter((id) => allowed.has(String(id)));
    }

    if (!ids.length) {
      return res.status(400).json({ error: 'Không có bộ mẫu nào để đặt mặc định cho pipeline này' });
    }

    const { data: updated, error: updErr } = await supabase
      .from('crm_task_templates')
      .update({ is_default: true })
      .in('id', ids)
      .select('id, name, is_default, order_index, pipeline_stage_id');
    if (updErr) throw updErr;

    res.json({
      ok: true,
      updated: updated?.length || 0,
      is_default: true,
      pipeline_id: pipelineId,
      lead_type: leadType,
      templates: (updated || []).sort((a, b) => (a.order_index || 0) - (b.order_index || 0)),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/task-templates/:id', async (req, res) => {
  try {
    const update = {};
    ['name', 'stage_slug', 'description', 'is_default', 'is_active', 'order_index', 'pipeline_type', 'pipeline_stage_id'].forEach(f => {
      if (req.body[f] !== undefined) update[f] = req.body[f];
    });

    if (update.is_default === true) {
      const { data: cur } = await supabase
        .from('crm_task_templates')
        .select('pipeline_stage_id, pipeline_type')
        .eq('id', req.params.id)
        .maybeSingle();
      const stageId = update.pipeline_stage_id || cur?.pipeline_stage_id || null;
      const tplType = update.pipeline_type || cur?.pipeline_type || null;
      if (stageId) {
        const { data: siblings } = await supabase
          .from('crm_task_templates')
          .select('id, pipeline_type')
          .eq('pipeline_stage_id', stageId)
          .neq('id', req.params.id);
        const toClear = (siblings || [])
          .filter((row) => {
            if (!tplType) return true;
            const pt = String(row.pipeline_type || '').toLowerCase();
            const tt = String(tplType || '').toLowerCase();
            if (!pt || pt === 'both') return true;
            if (!tt || tt === 'both') return true;
            return pt === tt;
          })
          .map((row) => row.id);
        if (toClear.length) {
          await supabase
            .from('crm_task_templates')
            .update({ is_default: false })
            .in('id', toClear);
        }
      }
    }

    // Nếu user chuyển sang gắn pipeline_stage_id và muốn clear stage_slug → derive slug từ stage thật
    // (tránh vi phạm NOT NULL khi DB chưa chạy migration 215).
    if (update.pipeline_stage_id && (update.stage_slug === null || update.stage_slug === '')) {
      const { data: st } = await supabase
        .from('crm_pipeline_stages')
        .select('id, name')
        .eq('id', update.pipeline_stage_id)
        .maybeSingle();
      if (st) {
        const baseName = (st.name || '').toString().toLowerCase().normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        const shortId = String(st.id || '').slice(0, 8);
        update.stage_slug = `pl_${baseName || 'stage'}_${shortId}`.slice(0, 60);
      } else {
        delete update.stage_slug; // không update gì để giữ slug cũ
      }
    } else if (update.stage_slug === null || update.stage_slug === '') {
      // Không cho phép set NULL trực tiếp (vi phạm constraint), bỏ field này
      delete update.stage_slug;
    }

    const { data, error } = await supabase.from('crm_task_templates').update(update).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.delete('/task-templates/:id', async (req, res) => {
  try {
    await supabase.from('crm_task_template_items').delete().eq('template_id', req.params.id);
    const { error } = await supabase.from('crm_task_templates').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Áp dụng bộ mẫu CRM cho toàn bộ lead/deal thuộc mọi khu vực của công ty (theo pipeline).
r.post('/task-templates/apply-to-company-regions', async (req, res) => {
  try {
    const b = req.body || {};
    const companyId = b.company_id && String(b.company_id).trim();
    if (!companyId) return res.status(400).json({ error: 'Thiếu company_id' });

    const sac = scopedAdminCompanyId(req);
    if (!isCrmSystemAdminUser(req.user) && !isAdminLike(req.user)) {
      if (!sac || String(sac) !== String(companyId)) {
        return res.status(403).json({ error: 'Chỉ admin công ty hoặc admin hệ thống mới áp dụng bộ mẫu cho toàn công ty' });
      }
    }

    let pipelineId = b.pipeline_id && String(b.pipeline_id).trim();
    if (pipelineId) {
      const { data: pl } = await supabase
        .from('crm_pipelines')
        .select('id, company_id')
        .eq('id', pipelineId)
        .maybeSingle();
      if (!pl) return res.status(400).json({ error: 'Pipeline không tồn tại' });
      if (pl.company_id && String(pl.company_id) !== String(companyId)) {
        return res.status(400).json({ error: 'Pipeline không thuộc công ty đã chọn' });
      }
    } else {
      pipelineId = await getDefaultPipelineIdForCompany(companyId);
    }
    if (!pipelineId) {
      return res.status(400).json({ error: 'Công ty chưa có pipeline CRM (chọn pipeline hoặc tạo pipeline mặc định)' });
    }

    const regionIds = normalizeRegionIdList(b.region_ids);
    if (regionIds.length) {
      for (const rid of regionIds) {
        const chk = await assertRegionBelongsToCompany(supabase, companyId, rid);
        if (!chk.ok) return res.status(400).json({ error: chk.error || 'Khu vực không hợp lệ' });
      }
    }

    const leadTypeRaw = String(b.lead_type || 'both').toLowerCase();
    const leadType = ['lead', 'deal', 'both'].includes(leadTypeRaw) ? leadTypeRaw : 'both';

    const result = await applyCrmTaskTemplatesToCompanyRegions({
      companyId,
      pipelineId,
      leadType,
      regionIds: regionIds.length ? regionIds : null,
      userId: req.user?.userId,
    });

    if (!result.ok) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Template items CRUD
r.post('/task-templates/:tplId/items', async (req, res) => {
  try {
    const b = req.body;
    const { data: existing } = await supabase.from('crm_task_template_items').select('order_index').eq('template_id', req.params.tplId).order('order_index', { ascending: false }).limit(1);
    const nextOrder = (existing?.[0]?.order_index || 0) + 1;
    let { data, error } = await supabase.from('crm_task_template_items').insert({
      template_id: req.params.tplId,
      title: b.title, description: b.description || null,
      priority: b.priority || 'medium', deadline_days: b.deadline_days || 0,
      order_index: nextOrder, checklist: b.checklist || [],
      executor_company_id: b.executor_company_id || null,
      completion_requires_file_or_note: !!b.completion_requires_file_or_note
        || (Array.isArray(b.required_evidence_file_types) && b.required_evidence_file_types.length > 0),
      required_evidence_file_types: Array.isArray(b.required_evidence_file_types) ? b.required_evidence_file_types : [],
      completion_requires_customer_note: !!b.completion_requires_customer_note,
      completion_requires_customer_contact: !!b.completion_requires_customer_contact,
      requires_quick_verdict: !!b.requires_quick_verdict,
      blocks_stage_advance: !!b.blocks_stage_advance,
      show_excel_quotation_upload: !!b.show_excel_quotation_upload,
      ...templateItemAssigneePatch(b),
    }).select().single();
    if (error && /required_evidence_file_types|requires_quick_verdict/.test(error.message || '')) {
      return res.status(503).json({
        error: 'Database chưa có cột minh chứng (migration 315/316). Chạy database/315_task_required_evidence_file_types.sql trên Supabase rồi thử lại.',
        code: 'db_migration_required_evidence',
      });
    }
    if (error && isExecutorColumnError(error)) {
      return res.status(503).json({
        error: 'Database chưa có cột giao việc chéo (migration 323). Chạy database/323_crm_task_template_executor_company.sql trên Supabase rồi thử lại.',
        code: 'db_migration_executor_company',
      });
    }
    if (error && isDefaultAssigneeIdsColumnError(error)) {
      return res.status(503).json({
        error: 'Database chưa có cột default_assignee_ids (migration 331). Chạy database/331_template_item_default_assignee_ids.sql trên Supabase rồi thử lại.',
        code: 'db_migration_default_assignee_ids',
      });
    }
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Update template item (checklist, reorder, etc.)
r.put('/task-templates/:tplId/items/:itemId', async (req, res) => {
  try {
    const update = {};
    ['title', 'description', 'priority', 'deadline_days', 'order_index', 'checklist', 'default_allowed_companies', 'default_allowed_departments', 'executor_company_id', 'completion_requires_file_or_note', 'required_evidence_file_types', 'completion_requires_customer_note', 'completion_requires_customer_contact', 'requires_quick_verdict', 'blocks_stage_advance', 'show_excel_quotation_upload'].forEach(f => {
      if (req.body[f] !== undefined) update[f] = req.body[f];
    });
    Object.assign(update, templateItemAssigneePatch(req.body));
    if (req.body.executor_company_id === '' || req.body.executor_company_id === null) {
      update.executor_company_id = null;
    }
    let { data, error } = await supabase.from('crm_task_template_items')
      .update(update).eq('id', req.params.itemId).select().single();
    if (error && /required_evidence_file_types|completion_requires_file_or_note|requires_quick_verdict/.test(error.message || '')) {
      return res.status(503).json({
        error: 'Database chưa có cột minh chứng (migration 315/316). Chạy database/315_task_required_evidence_file_types.sql trên Supabase rồi thử lại.',
        code: 'db_migration_required_evidence',
      });
    }
    if (error && isExecutorColumnError(error)) {
      return res.status(503).json({
        error: 'Database chưa có cột giao việc chéo (migration 323). Chạy database/323_crm_task_template_executor_company.sql trên Supabase rồi thử lại.',
        code: 'db_migration_executor_company',
      });
    }
    if (error && isDefaultAssigneeIdsColumnError(error)) {
      return res.status(503).json({
        error: 'Database chưa có cột default_assignee_ids (migration 331). Chạy database/331_template_item_default_assignee_ids.sql trên Supabase rồi thử lại.',
        code: 'db_migration_default_assignee_ids',
      });
    }
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.delete('/task-templates/:tplId/items/:itemId', async (req, res) => {
  try {
    const { error } = await supabase.from('crm_task_template_items').delete().eq('id', req.params.itemId);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


module.exports = r;
