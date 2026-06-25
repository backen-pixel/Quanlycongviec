/**
 * CRM Pipelines — pipeline/stages, lead-types, referrers, Zalo OA settings.
 */
const { Router } = require('express');
const { supabase } = require('../../../config/supabase');
const {
  invalidatePipelinesAndStages,
  invalidateSources,
  getPipelinesList,
  getDefaultPipelineIdForCompany,
  getPipelineIdForCompanyRegion,
  getStagesByPipelineId,
  getCrmLeadTypesList,
} = require('../../../helpers/crmTaxonomyCache');
const { normalizePipelineStageSlaDaysForDb } = require('../../../helpers/crmPipelineSla');
const { validateProductionCompanyId } = require('../../../helpers/productionCompanyGate');
const {
  sendZaloTemplateMessage,
  buildDealTemplateData,
  fillTemplateDataFromStructure,
  pickDealZaloTemplatePayload,
  resolveZaloDealTemplateId,
  normalizeVnPhoneTo84,
  formatVnPhoneLocal0From84,
} = require('../../../helpers/zaloOa');
const {
  userIsAdmin,
  scopedAdminCompanyId,
  requireUserCompanyId,
  requireUserCompanyIdResolved,
} = require('../shared/requestScope');
const {
  respondIfCrmPipelinesTableMissing,
  fetchPipelineWithStagesById,
  getZaloNotifySettings,
  upsertZaloNotifySettings,
  maskZaloAccessTokenPreview,
  maskCustomerPhoneDisplay,
  isDealStageHoanThanhForZalo,
  shallowMergeTemplateData,
  fetchCrmPipelineZaloSlice,
  executeZaloDealStageNotify,
  normalizePipelineStagesList,
} = require('../shared/pipelineHelpers');

const r = Router();

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINES — Ống bán hàng theo Công ty
// ═══════════════════════════════════════════════════════════════════════════
r.get('/pipelines', async (req, res) => {
  try {
    const activeOnly = req.query.active !== 'false';
    let companyFilter = null;
    const sacPl = scopedAdminCompanyId(req);
    if (sacPl) {
      companyFilter = sacPl;
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      companyFilter = cid;
    }
    const data = await getPipelinesList({ companyFilter, activeOnly });
    res.json(data);
  } catch (e) {
    if (respondIfCrmPipelinesTableMissing(res, e)) return;
    res.status(500).json({ error: crmRouteErrorText(e) || 'Lỗi server' });
  }
});

r.get('/pipelines/:id', async (req, res) => {
  try {
    const { data, error } = await fetchPipelineWithStagesById(req.params.id);
    if (error) throw error;
    const sacPl1 = scopedAdminCompanyId(req);
    if (sacPl1) {
      if (String(data.company_id || '') !== String(sacPl1)) return res.status(403).json({ error: 'Không có quyền xem pipeline công ty khác' });
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      if (String(data.company_id || '') !== String(cid)) return res.status(403).json({ error: 'Không có quyền xem pipeline công ty khác' });
    }
    if (data?.stages) data.stages.sort((a, b) => a.order_index - b.order_index);
    res.json(data);
  } catch (e) {
    if (respondIfCrmPipelinesTableMissing(res, e)) return;
    res.status(500).json({ error: crmRouteErrorText(e) || 'Lỗi server' });
  }
});

r.post('/pipelines', async (req, res) => {
  try {
    const b = req.body;
    if (!b.name) return res.status(400).json({ error: 'Thiếu tên pipeline' });
    const sacPNew = scopedAdminCompanyId(req);
    if (sacPNew) {
      if (b.company_id && String(b.company_id) !== String(sacPNew)) {
        return res.status(403).json({ error: 'Không thể tạo pipeline cho công ty khác' });
      }
      b.company_id = sacPNew;
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      if (b.company_id && String(b.company_id) !== String(cid)) return res.status(403).json({ error: 'Không thể tạo pipeline cho công ty khác' });
      b.company_id = cid;
    }
    const { data, error } = await supabase.from('crm_pipelines').insert({
      name: b.name, company_id: b.company_id || null, description: b.description || null,
      is_default: b.is_default || false, is_active: true,
    }).select('*, company:companies(id, name)').single();
    if (error) throw error;

    // Auto-create default stages (lead + deal)
    const defaultLead = [
      { name: 'Mới', icon: '🆕', color: '#94A3B8', order_index: 1 },
      { name: 'Đã liên hệ', icon: '📞', color: '#3B82F6', order_index: 2 },
      { name: 'Đang tư vấn', icon: '💬', color: '#8B5CF6', order_index: 3 },
      { name: 'Chờ phản hồi', icon: '⏳', color: '#F59E0B', order_index: 4 },
      { name: 'Chuyển Deal', icon: '✅', color: '#10B981', order_index: 5, is_won: true },
      { name: 'Mất', icon: '❌', color: '#EF4444', order_index: 6, is_lost: true },
    ];
    const defaultDeal = [
      { name: 'Deal mới', icon: '🆕', color: '#06B6D4', order_index: 1 },
      { name: 'Báo giá', icon: '💰', color: '#F59E0B', order_index: 2 },
      { name: 'Đàm phán', icon: '🤝', color: '#8B5CF6', order_index: 3 },
      { name: 'Ký hợp đồng', icon: '📝', color: '#3B82F6', order_index: 4 },
      { name: 'Thắng', icon: '🏆', color: '#10B981', order_index: 5, is_won: true },
      { name: 'Thua', icon: '❌', color: '#EF4444', order_index: 6, is_lost: true },
    ];
    const stages = [
      ...defaultLead.map(s => ({ ...s, pipeline_id: data.id, pipeline_type: 'lead', is_active: true })),
      ...defaultDeal.map(s => ({ ...s, pipeline_id: data.id, pipeline_type: 'deal', is_active: true })),
    ];
    await supabase.from('crm_pipeline_stages').insert(stages);

    invalidatePipelinesAndStages();
    res.status(201).json(data);
  } catch (e) {
    if (respondIfCrmPipelinesTableMissing(res, e)) return;
    res.status(500).json({ error: crmRouteErrorText(e) || 'Lỗi server' });
  }
});

r.put('/pipelines/:id', async (req, res) => {
  try {
    const sacPUp = scopedAdminCompanyId(req);
    if (sacPUp) {
      const { data: existing } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', req.params.id).single();
      if (!existing) return res.status(404).json({ error: 'Không tìm thấy pipeline' });
      if (String(existing.company_id || '') !== String(sacPUp)) return res.status(403).json({ error: 'Không có quyền sửa pipeline công ty khác' });
      if (req.body.company_id !== undefined && String(req.body.company_id || '') !== String(sacPUp)) {
        return res.status(403).json({ error: 'Không thể đổi pipeline sang công ty khác' });
      }
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      const { data: existing } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', req.params.id).single();
      if (!existing) return res.status(404).json({ error: 'Không tìm thấy pipeline' });
      if (String(existing.company_id || '') !== String(cid)) return res.status(403).json({ error: 'Không có quyền sửa pipeline công ty khác' });
      // Non-admin không được đổi company_id
      if (req.body.company_id !== undefined && String(req.body.company_id || '') !== String(cid)) {
        return res.status(403).json({ error: 'Không thể đổi pipeline sang công ty khác' });
      }
    }
    const update = {};
    ['name', 'company_id', 'description', 'is_default', 'is_active'].forEach(f => {
      if (req.body[f] !== undefined) update[f] = req.body[f];
    });
    if (req.body.zalo_template_id !== undefined) {
      const zt = req.body.zalo_template_id;
      update.zalo_template_id = zt == null || String(zt).trim() === '' ? null : String(zt).trim();
    }
    if (req.body.zalo_merge_template_data !== undefined) {
      const m = req.body.zalo_merge_template_data;
      update.zalo_merge_template_data =
        m && typeof m === 'object' && !Array.isArray(m) ? m : {};
    }
    if (req.body.allow_employee_delete_lead !== undefined) {
      update.allow_employee_delete_lead = !!req.body.allow_employee_delete_lead;
    }
    if (req.body.allow_employee_delete_deal !== undefined) {
      update.allow_employee_delete_deal = !!req.body.allow_employee_delete_deal;
    }
    update.updated_at = new Date().toISOString();
    let { data, error } = await supabase.from('crm_pipelines').update(update)
      .eq('id', req.params.id).select('*, company:companies(id, name)').single();
    if (error && /allow_employee_delete_(lead|deal)/.test(error.message || '')) {
      delete update.allow_employee_delete_lead;
      delete update.allow_employee_delete_deal;
      ({ data, error } = await supabase.from('crm_pipelines').update(update)
        .eq('id', req.params.id).select('*, company:companies(id, name)').single());
    }
    if (error) throw error;
    invalidatePipelinesAndStages();
    res.json(data);
  } catch (e) {
    if (respondIfCrmPipelinesTableMissing(res, e)) return;
    res.status(500).json({ error: crmRouteErrorText(e) || 'Lỗi server' });
  }
});

r.delete('/pipelines/:id', async (req, res) => {
  try {
    const sacPDel = scopedAdminCompanyId(req);
    if (sacPDel) {
      const { data: existing } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', req.params.id).single();
      if (!existing) return res.status(404).json({ error: 'Không tìm thấy pipeline' });
      if (String(existing.company_id || '') !== String(sacPDel)) return res.status(403).json({ error: 'Không có quyền xóa pipeline công ty khác' });
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      const { data: existing } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', req.params.id).single();
      if (!existing) return res.status(404).json({ error: 'Không tìm thấy pipeline' });
      if (String(existing.company_id || '') !== String(cid)) return res.status(403).json({ error: 'Không có quyền xóa pipeline công ty khác' });
    }
    // Check leads using this pipeline
    const { count } = await supabase.from('crm_leads').select('id', { count: 'exact', head: true })
      .eq('pipeline_id', req.params.id);
    if (count > 0) return res.status(400).json({ error: `Không thể xóa — ${count} lead/deal đang dùng pipeline này` });
    // Delete stages first, then pipeline
    await supabase.from('crm_pipeline_stages').delete().eq('pipeline_id', req.params.id);
    await supabase.from('crm_pipelines').delete().eq('id', req.params.id);
    invalidatePipelinesAndStages();
    res.json({ message: 'Đã xóa pipeline' });
  } catch (e) {
    if (respondIfCrmPipelinesTableMissing(res, e)) return;
    res.status(500).json({ error: crmRouteErrorText(e) || 'Lỗi server' });
  }
});

// Copy pipeline (clone stages) — admin only
r.post('/pipelines/:id/copy', async (req, res) => {
  try {
    if (!userIsAdmin(req.user?.role)) return res.status(403).json({ error: 'Chỉ admin được copy pipeline' });
    const sourceId = req.params.id;
    const b = req.body || {};
    const targetCompanyId = b.target_company_id || null;
    if (!targetCompanyId) return res.status(400).json({ error: 'Thiếu target_company_id' });
    const sacCopy = scopedAdminCompanyId(req);
    if (sacCopy) {
      if (String(targetCompanyId) !== String(sacCopy)) {
        return res.status(403).json({ error: 'Chỉ được copy pipeline trong công ty của bạn' });
      }
      const { data: srcRow } = await supabase.from('crm_pipelines').select('company_id').eq('id', sourceId).maybeSingle();
      if (String(srcRow?.company_id || '') !== String(sacCopy)) {
        return res.status(403).json({ error: 'Pipeline nguồn không thuộc công ty của bạn' });
      }
    }

    const { data: src, error: srcErr } = await supabase
      .from('crm_pipelines')
      .select('id, name, description, is_active, allow_employee_delete_lead, allow_employee_delete_deal, stages:crm_pipeline_stages(*)')
      .eq('id', sourceId)
      .single();
    if (srcErr) throw srcErr;

    const name = (b.name || '').trim() || `${src.name} (Copy)`;
    const copyInsert = {
      name,
      company_id: targetCompanyId,
      description: src.description || null,
      is_default: !!b.set_default,
      is_active: src.is_active !== false,
    };
    if (src.allow_employee_delete_lead !== undefined) {
      copyInsert.allow_employee_delete_lead = src.allow_employee_delete_lead !== false;
    }
    if (src.allow_employee_delete_deal !== undefined) {
      copyInsert.allow_employee_delete_deal = src.allow_employee_delete_deal !== false;
    }
    let { data: created, error: insErr } = await supabase.from('crm_pipelines').insert(copyInsert)
      .select('*, company:companies(id, name)').single();
    if (insErr && /allow_employee_delete_(lead|deal)/.test(insErr.message || '')) {
      delete copyInsert.allow_employee_delete_lead;
      delete copyInsert.allow_employee_delete_deal;
      ({ data: created, error: insErr } = await supabase.from('crm_pipelines').insert(copyInsert)
        .select('*, company:companies(id, name)').single());
    }
    if (insErr) throw insErr;

    const stages = (src.stages || []).slice().sort((a, b2) => (a.order_index ?? 0) - (b2.order_index ?? 0));
    if (stages.length) {
      const inserts = stages.map((s) => ({
        pipeline_id: created.id,
        pipeline_type: s.pipeline_type,
        name: s.name,
        color: s.color,
        icon: s.icon,
        order_index: s.order_index,
        is_active: s.is_active !== false,
        is_won: !!s.is_won,
        is_lost: !!s.is_lost,
        send_zalo_on_enter: !!s.send_zalo_on_enter,
        create_event_on_enter: !!s.create_event_on_enter,
        sync_role: s.sync_role || null,
        default_probability: s.default_probability != null && s.default_probability !== '' ? s.default_probability : null,
        description: s.description != null && String(s.description).trim() !== '' ? String(s.description).trim() : null,
        counts_as_won_revenue: !!s.counts_as_won_revenue,
        counts_as_completed_revenue: !!s.counts_as_completed_revenue,
        counts_as_expected_revenue: !!s.counts_as_expected_revenue,
      }));
      await supabase.from('crm_pipeline_stages').insert(inserts);
    }

    invalidatePipelinesAndStages();
    res.status(201).json({ pipeline: created, stages_copied: stages.length });
  } catch (e) {
    if (respondIfCrmPipelinesTableMissing(res, e)) return;
    res.status(500).json({ error: crmRouteErrorText(e) || e.message || 'Lỗi server' });
  }
});


// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE STAGES (CRUD)
// ═══════════════════════════════════════════════════════════════════════════
r.get('/pipeline-stages', async (req, res) => {
  const { type, pipeline_id, company_id: companyIdQuery, region_id: regionIdQuery } = req.query;
  const sacSt = scopedAdminCompanyId(req);
  const activeOnly = req.query.all !== 'true';

  let effectivePipelineId = pipeline_id || null;

  if (pipeline_id) {
    // Permission check theo pipeline đang truy vấn (single-row lookup, không cache)
    if (sacSt) {
      const { data: pl } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', pipeline_id).maybeSingle();
      if (!pl) return res.json([]);
      if (String(pl.company_id || '') !== String(sacSt)) return res.status(403).json({ error: 'Không có quyền xem stage của pipeline công ty khác' });
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = await requireUserCompanyIdResolved(req, res);
      if (!cid) return;
      const { data: pl } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', pipeline_id).maybeSingle();
      if (!pl) return res.json([]);
      if (String(pl.company_id || '') !== String(cid)) return res.status(403).json({ error: 'Không có quyền xem stage của pipeline công ty khác' });
    }
  } else if (companyIdQuery) {
    const companyId = String(companyIdQuery || '').trim();
    if (!companyId) return res.json([]);
    if (sacSt) {
      if (String(companyId) !== String(sacSt)) return res.status(403).json({ error: 'Không có quyền xem stage pipeline công ty khác' });
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = await requireUserCompanyIdResolved(req, res);
      if (!cid) return;
      if (String(companyId) !== String(cid)) return res.status(403).json({ error: 'Không có quyền xem stage pipeline công ty khác' });
    }
    const regionId = String(regionIdQuery || '').trim();
    effectivePipelineId = regionId
      ? await getPipelineIdForCompanyRegion(companyId, regionId)
      : await getDefaultPipelineIdForCompany(companyId);
  } else if (sacSt) {
    effectivePipelineId = await getDefaultPipelineIdForCompany(sacSt);
  } else if (!userIsAdmin(req.user?.role)) {
    const cid = await requireUserCompanyIdResolved(req, res);
    if (!cid) return;
    effectivePipelineId = await getDefaultPipelineIdForCompany(cid);
  }

  let data;
  if (effectivePipelineId) {
    data = await getStagesByPipelineId(effectivePipelineId, { type: type || null, activeOnly });
  } else {
    // Admin xem toàn bộ (không filter pipeline_id) — không cache nhánh hiếm này.
    let q = supabase.from('crm_pipeline_stages').select('*').order('order_index', { ascending: true });
    if (type) q = q.eq('pipeline_type', type);
    if (activeOnly) q = q.eq('is_active', true);
    const { data: rows } = await q;
    data = rows || [];
  }

  const ensureStageId = String(req.query.ensure_stage_id || '').trim();
  if (ensureStageId && !data.some((s) => String(s.id) === ensureStageId)) {
    const { data: extra } = await supabase
      .from('crm_pipeline_stages')
      .select('*')
      .eq('id', ensureStageId)
      .maybeSingle();
    if (extra) data = [...data, extra];
  }
  res.json(normalizePipelineStagesList(data));
});

r.post('/pipeline-stages', async (req, res) => {
  try {
    const b = req.body;
    if (!b.name || !b.pipeline_type) return res.status(400).json({ error: 'Thiếu tên hoặc loại pipeline' });
    const sacPst = scopedAdminCompanyId(req);
    if (sacPst) {
      if (!b.pipeline_id) return res.status(400).json({ error: 'Thiếu pipeline_id' });
      const { data: pl } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', b.pipeline_id).single();
      if (String(pl.company_id || '') !== String(sacPst)) return res.status(403).json({ error: 'Không thể thêm stage vào pipeline công ty khác' });
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      if (!b.pipeline_id) return res.status(400).json({ error: 'Thiếu pipeline_id' });
      const { data: pl } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', b.pipeline_id).single();
      if (String(pl.company_id || '') !== String(cid)) return res.status(403).json({ error: 'Không thể thêm stage vào pipeline công ty khác' });
    }
    // Auto order_index within pipeline_id + pipeline_type
    let orderQ = supabase.from('crm_pipeline_stages')
      .select('order_index').eq('pipeline_type', b.pipeline_type).order('order_index', { ascending: false }).limit(1);
    if (b.pipeline_id) orderQ = orderQ.eq('pipeline_id', b.pipeline_id);
    const { data: existing } = await orderQ;
    const nextOrder = (existing?.[0]?.order_index || 0) + 1;
    let defaultProbability = null;
    if (b.default_probability !== undefined && b.default_probability !== null && b.default_probability !== '') {
      const n = Number(b.default_probability);
      if (Number.isFinite(n)) defaultProbability = Math.max(0, Math.min(100, Math.round(n)));
    }
    const stageDesc =
      b.description != null && String(b.description).trim() !== ''
        ? String(b.description).trim()
        : null;
    const slaInsert =
      b.sla_days !== undefined ? normalizePipelineStageSlaDaysForDb(b.sla_days) : undefined;
    const insertObj = {
      name: b.name, pipeline_type: b.pipeline_type, pipeline_id: b.pipeline_id || null,
      color: b.color || '#94A3B8', icon: b.icon || null, order_index: b.order_index ?? nextOrder,
      is_won: b.is_won || false, is_lost: b.is_lost || false, is_active: true,
      send_zalo_on_enter: !!b.send_zalo_on_enter,
      create_event_on_enter: !!b.create_event_on_enter,
      sync_role: b.sync_role || null,
      default_probability: defaultProbability,
      description: stageDesc,
      ...(b.requires_deadline !== undefined ? { requires_deadline: !!b.requires_deadline } : {}),
      ...(b.allow_revert_to_lead !== undefined ? { allow_revert_to_lead: !!b.allow_revert_to_lead } : {}),
      ...(slaInsert !== undefined ? { sla_days: slaInsert } : {}),
      ...(b.counts_as_won_revenue !== undefined
        ? { counts_as_won_revenue: b.counts_as_won_revenue == null ? null : !!b.counts_as_won_revenue }
        : {}),
      ...(b.counts_as_completed_revenue !== undefined
        ? { counts_as_completed_revenue: b.counts_as_completed_revenue == null ? null : !!b.counts_as_completed_revenue }
        : {}),
      ...(b.counts_as_expected_revenue !== undefined
        ? { counts_as_expected_revenue: b.counts_as_expected_revenue == null ? null : !!b.counts_as_expected_revenue }
        : {}),
    };
    let { data, error } = await supabase.from('crm_pipeline_stages').insert(insertObj).select().single();
    // Chưa chạy migration requires_deadline → bỏ cột rồi thử lại để không vỡ tạo cột.
    if (error && /requires_deadline/.test(error.message || '')) {
      delete insertObj.requires_deadline;
      ({ data, error } = await supabase.from('crm_pipeline_stages').insert(insertObj).select().single());
    }
    if (error && /allow_revert_to_lead/.test(error.message || '')) {
      delete insertObj.allow_revert_to_lead;
      ({ data, error } = await supabase.from('crm_pipeline_stages').insert(insertObj).select().single());
    }
    if (error) throw error;
    invalidatePipelinesAndStages();
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.put('/pipeline-stages/:id', async (req, res) => {
  try {
    const b = req.body;
    const sacPsu = scopedAdminCompanyId(req);
    if (sacPsu) {
      const { data: st } = await supabase.from('crm_pipeline_stages').select('id, pipeline_id').eq('id', req.params.id).single();
      const { data: pl } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', st.pipeline_id).single();
      if (String(pl.company_id || '') !== String(sacPsu)) return res.status(403).json({ error: 'Không có quyền sửa stage pipeline công ty khác' });
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      const { data: st } = await supabase.from('crm_pipeline_stages').select('id, pipeline_id').eq('id', req.params.id).single();
      const { data: pl } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', st.pipeline_id).single();
      if (String(pl.company_id || '') !== String(cid)) return res.status(403).json({ error: 'Không có quyền sửa stage pipeline công ty khác' });
    }
    const update = {};
    ['name', 'color', 'icon', 'order_index', 'is_won', 'is_lost', 'is_active', 'send_zalo_on_enter', 'create_event_on_enter', 'sync_role'].forEach(f => {
      if (b[f] !== undefined) update[f] = (f === 'send_zalo_on_enter' || f === 'create_event_on_enter') ? !!b[f] : b[f];
    });
    if (b.requires_deadline !== undefined) update.requires_deadline = !!b.requires_deadline;
    if (b.allow_revert_to_lead !== undefined) update.allow_revert_to_lead = !!b.allow_revert_to_lead;
    if (b.counts_as_won_revenue !== undefined) {
      update.counts_as_won_revenue = b.counts_as_won_revenue == null ? null : !!b.counts_as_won_revenue;
    }
    if (b.counts_as_completed_revenue !== undefined) {
      update.counts_as_completed_revenue = b.counts_as_completed_revenue == null ? null : !!b.counts_as_completed_revenue;
    }
    if (b.counts_as_expected_revenue !== undefined) {
      update.counts_as_expected_revenue = b.counts_as_expected_revenue == null ? null : !!b.counts_as_expected_revenue;
    }
    if (b.sla_days !== undefined) {
      update.sla_days = normalizePipelineStageSlaDaysForDb(b.sla_days);
    }
    if (b.description !== undefined) {
      update.description =
        b.description == null || String(b.description).trim() === ''
          ? null
          : String(b.description).trim();
    }
    if (b.default_probability !== undefined) {
      if (b.default_probability === null || b.default_probability === '') {
        update.default_probability = null;
      } else {
        const n = Number(b.default_probability);
        update.default_probability = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null;
      }
    }
    let { data, error } = await supabase.from('crm_pipeline_stages').update(update)
      .eq('id', req.params.id).select().single();
    if (error && /requires_deadline/.test(error.message || '')) {
      delete update.requires_deadline;
      ({ data, error } = await supabase.from('crm_pipeline_stages').update(update)
        .eq('id', req.params.id).select().single());
    }
    if (error && /allow_revert_to_lead/.test(error.message || '')) {
      delete update.allow_revert_to_lead;
      ({ data, error } = await supabase.from('crm_pipeline_stages').update(update)
        .eq('id', req.params.id).select().single());
    }
    if (error) throw error;
    invalidatePipelinesAndStages();
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * Liệt kê các cột Production Pipeline đang map về cột CRM này (qua crm_target_stage_id).
 * Phục vụ UI «Gán nhanh cột SX» trong CRM Settings.
 */
r.get('/pipeline-stages/:id/production-columns', async (req, res) => {
  try {
    const stageId = req.params.id;
    const { data: stage } = await supabase
      .from('crm_pipeline_stages')
      .select('id, name, sync_role')
      .eq('id', stageId)
      .maybeSingle();
    if (!stage) return res.status(404).json({ error: 'Stage không tồn tại' });

    const { data: allCols, error } = await supabase
      .from('production_pipeline_stages')
      .select(`
        id, name, color, icon, order_index, bucket_slug, is_active,
        company_id, workshop_type_id, crm_target_stage_id,
        company:companies(id, name),
        workshop_type:workshop_project_types(id, name)
      `)
      .eq('is_active', true)
      .order('order_index');
    if (error) throw error;

    const cols = (allCols || []).map((c) => ({
      ...c,
      assigned: String(c.crm_target_stage_id || '') === String(stageId),
    }));

    res.json({
      stage: { id: stage.id, name: stage.name, sync_role: stage.sync_role || null },
      production_columns: cols,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Bulk-gán nhiều cột production_pipeline_stages vào cột CRM này (set crm_target_stage_id).
 * Body: { production_pipeline_stage_ids: string[], replace_existing?: boolean }
 *  - replace_existing=true: cột nào trước đây gán về stage này nhưng KHÔNG có trong danh sách mới
 *    sẽ được đặt lại crm_target_stage_id = null (bỏ gán).
 */
r.post('/pipeline-stages/:id/assign-production-columns', async (req, res) => {
  try {
    const stageId = req.params.id;
    const ids = Array.isArray(req.body?.production_pipeline_stage_ids)
      ? req.body.production_pipeline_stage_ids.filter(Boolean).map(String)
      : [];
    const replaceExisting = req.body?.replace_existing !== false;

    const { data: stage } = await supabase
      .from('crm_pipeline_stages')
      .select('id, name')
      .eq('id', stageId)
      .maybeSingle();
    if (!stage) return res.status(404).json({ error: 'Stage CRM không tồn tại' });

    let assignedCount = 0;
    let unassignedCount = 0;

    if (ids.length) {
      const { data: assigned, error: aErr } = await supabase
        .from('production_pipeline_stages')
        .update({ crm_target_stage_id: stageId, crm_sync_type: null })
        .in('id', ids)
        .select('id');
      if (aErr) throw aErr;
      assignedCount = (assigned || []).length;
    }

    if (replaceExisting) {
      let q = supabase
        .from('production_pipeline_stages')
        .update({ crm_target_stage_id: null })
        .eq('crm_target_stage_id', stageId);
      if (ids.length) q = q.not('id', 'in', `(${ids.join(',')})`);
      const { data: unassigned, error: uErr } = await q.select('id');
      if (uErr) throw uErr;
      unassignedCount = (unassigned || []).length;
    }

    res.json({
      stage_id: stageId,
      assigned_count: assignedCount,
      unassigned_count: unassignedCount,
      total_target_columns: ids.length,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.delete('/pipeline-stages/:id', async (req, res) => {
  try {
    const sacPsd = scopedAdminCompanyId(req);
    if (sacPsd) {
      const { data: st } = await supabase.from('crm_pipeline_stages').select('id, pipeline_id').eq('id', req.params.id).single();
      const { data: pl } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', st.pipeline_id).single();
      if (String(pl.company_id || '') !== String(sacPsd)) return res.status(403).json({ error: 'Không có quyền xóa stage pipeline công ty khác' });
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      const { data: st } = await supabase.from('crm_pipeline_stages').select('id, pipeline_id').eq('id', req.params.id).single();
      const { data: pl } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', st.pipeline_id).single();
      if (String(pl.company_id || '') !== String(cid)) return res.status(403).json({ error: 'Không có quyền xóa stage pipeline công ty khác' });
    }
    // Check if any leads use this stage
    const { count } = await supabase.from('crm_leads').select('id', { count: 'exact', head: true })
      .eq('stage_id', req.params.id);
    if (count > 0) return res.status(400).json({ error: `Không thể xóa — ${count} lead/deal đang dùng giai đoạn này` });
    await supabase.from('crm_pipeline_stages').delete().eq('id', req.params.id);
    invalidatePipelinesAndStages();
    res.json({ message: 'Đã xóa' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// LEAD/DEAL TYPES — Phân loại theo Công ty
// ═══════════════════════════════════════════════════════════════════════════
r.get('/lead-types', async (req, res) => {
  try {
    const companyId = req.query.company_id || null;
    const sacLt = scopedAdminCompanyId(req);
    if (sacLt) {
      if (companyId && String(companyId) !== String(sacLt)) {
        return res.status(403).json({ error: 'Không có quyền xem loại của công ty khác' });
      }
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      if (companyId && String(companyId) !== String(cid)) return res.status(403).json({ error: 'Không có quyền xem loại của công ty khác' });
    }
    const cidFinal = companyId || (req.user?.company_id || null);
    if (!cidFinal) return res.json([]);
    const data = await getCrmLeadTypesList({
      companyId: cidFinal,
      activeOnly: req.query.all !== 'true',
    });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/lead-types', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name?.trim()) return res.status(400).json({ error: 'Thiếu tên loại' });
    let company_id = b.company_id || null;
    if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      company_id = cid;
    }
    if (!company_id) return res.status(400).json({ error: 'Thiếu company_id' });

    const applies_to = ['lead','deal','both'].includes(String(b.applies_to || 'both')) ? String(b.applies_to || 'both') : 'both';
    const { data: last } = await supabase.from('crm_lead_types')
      .select('order_index')
      .eq('company_id', company_id)
      .order('order_index', { ascending: false })
      .limit(1);
    const nextOrder = (last?.[0]?.order_index ?? 0) + 1;

    let defaultProductionCompanyId = null;
    if (b.default_production_company_id != null && String(b.default_production_company_id).trim() !== '') {
      const pv = await validateProductionCompanyId(b.default_production_company_id);
      if (!pv.ok) return res.status(400).json({ error: pv.error });
      defaultProductionCompanyId = pv.company.id;
    }

    const { data, error } = await supabase.from('crm_lead_types').insert({
      company_id,
      name: b.name.trim(),
      applies_to,
      order_index: b.order_index ?? nextOrder,
      is_active: b.is_active !== false,
      workshop_production_templates: !!b.workshop_production_templates,
      default_production_company_id: defaultProductionCompanyId,
      updated_at: new Date().toISOString(),
    }).select('*').single();
    if (error) throw error;
    invalidateSources();
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/lead-types/:id', async (req, res) => {
  try {
    const b = req.body || {};
    const { data: existing, error: exErr } = await supabase.from('crm_lead_types').select('id, company_id').eq('id', req.params.id).single();
    if (exErr) throw exErr;
    if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      if (String(existing.company_id || '') !== String(cid)) return res.status(403).json({ error: 'Không có quyền sửa loại của công ty khác' });
    }

    const update = {};
    ['name', 'order_index', 'is_active'].forEach((f) => { if (b[f] !== undefined) update[f] = b[f]; });
    if (b.workshop_production_templates !== undefined) update.workshop_production_templates = !!b.workshop_production_templates;
    if (b.applies_to !== undefined) {
      const at = String(b.applies_to || 'both');
      update.applies_to = ['lead','deal','both'].includes(at) ? at : 'both';
    }
    if (b.default_production_company_id !== undefined) {
      const raw = b.default_production_company_id;
      if (raw === null || raw === '') {
        update.default_production_company_id = null;
      } else {
        const pv = await validateProductionCompanyId(raw);
        if (!pv.ok) return res.status(400).json({ error: pv.error });
        update.default_production_company_id = pv.company.id;
      }
    }
    update.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from('crm_lead_types').update(update).eq('id', req.params.id).select('*').single();
    if (error) throw error;
    invalidateSources();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Người giới thiệu (theo công ty) ─────────────────────────────────────────
r.get('/referrers', async (req, res) => {
  try {
    const companyId = req.query.company_id || null;
    const sacRef = scopedAdminCompanyId(req);
    if (sacRef) {
      if (companyId && String(companyId) !== String(sacRef)) {
        return res.status(403).json({ error: 'Không có quyền xem người giới thiệu của công ty khác' });
      }
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      if (companyId && String(companyId) !== String(cid)) {
        return res.status(403).json({ error: 'Không có quyền xem người giới thiệu của công ty khác' });
      }
    }
    const cidFinal = companyId || (req.user?.company_id || null);
    if (!cidFinal) return res.json({ items: [] });
    const { listCrmReferrers } = require('../../helpers/crmReferrers');
    const items = await listCrmReferrers(cidFinal);
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/referrers', async (req, res) => {
  try {
    const b = req.body || {};
    let company_id = b.company_id || null;
    if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      company_id = cid;
    }
    if (!company_id) return res.status(400).json({ error: 'Thiếu company_id' });
    const { upsertCrmReferrer, normalizeReferrerName } = require('../../helpers/crmReferrers');
    const nameTrim = normalizeReferrerName(b.name);
    if (!nameTrim) return res.status(400).json({ error: 'Nhập tên người giới thiệu' });
    const saved = await upsertCrmReferrer({
      companyId: company_id,
      name: nameTrim,
      userId: req.user.userId,
    });
    if (!saved) {
      return res.status(503).json({ error: 'Chưa cài bảng người giới thiệu — chạy migration 337' });
    }
    res.status(saved.created ? 201 : 200).json(saved);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.delete('/lead-types/:id', async (req, res) => {
  try {
    const { data: existing, error: exErr } = await supabase.from('crm_lead_types').select('id, company_id').eq('id', req.params.id).single();
    if (exErr) throw exErr;
    if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      if (String(existing.company_id || '') !== String(cid)) return res.status(403).json({ error: 'Không có quyền xóa loại của công ty khác' });
    }

    const { count } = await supabase.from('crm_leads')
      .select('id', { count: 'exact', head: true })
      .eq('lead_type_id', req.params.id);
    if ((count || 0) > 0) return res.status(400).json({ error: `Không thể xóa — ${count} lead/deal đang dùng loại này` });

    const { error } = await supabase.from('crm_lead_types').delete().eq('id', req.params.id);
    if (error) throw error;
    invalidateSources();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Reorder pipeline stages
r.put('/pipeline-stages-reorder', async (req, res) => {
  try {
    const { stages } = req.body; // [{ id, order_index }]
    for (const s of stages || []) {
      await supabase.from('crm_pipeline_stages').update({ order_index: s.order_index }).eq('id', s.id);
    }
    invalidatePipelinesAndStages();
    res.json({ message: 'Đã sắp xếp lại' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ ZALO OA — Gửi tin qua SĐT (cấu hình + test) ═══
r.get('/zalo-notify-settings', async (_req, res) => {
  try {
    const s = await getZaloNotifySettings();
    res.json({
      enabled: s.enabled,
      template_id: s.template_id,
      sending_mode: s.sending_mode,
      has_token: !!(s.access_token && s.access_token.length > 8),
      merge_template_data: s.merge_template_data || {},
      template_structure: s.template_structure,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.put('/zalo-notify-settings', async (req, res) => {
  try {
    const prev = await getZaloNotifySettings();
    let nextTemplateStructure = prev.template_structure;
    if (req.body.template_structure !== undefined) {
      if (req.body.template_structure === null) {
        nextTemplateStructure = null;
      } else if (typeof req.body.template_structure === 'object' && !Array.isArray(req.body.template_structure)) {
        nextTemplateStructure = Object.keys(req.body.template_structure).length ? req.body.template_structure : null;
      }
    }
    const next = {
      ...prev,
      enabled: req.body.enabled !== undefined ? !!req.body.enabled : prev.enabled,
      template_id: req.body.template_id !== undefined ? String(req.body.template_id || '').trim() : prev.template_id,
      sending_mode: req.body.sending_mode !== undefined ? String(req.body.sending_mode || '1') : prev.sending_mode,
      merge_template_data:
        req.body.merge_template_data !== undefined
          ? (typeof req.body.merge_template_data === 'object' && req.body.merge_template_data ? req.body.merge_template_data : {})
          : prev.merge_template_data,
      template_structure: nextTemplateStructure,
      access_token: prev.access_token,
    };
    if (req.body.access_token !== undefined && String(req.body.access_token).trim() !== '') {
      next.access_token = String(req.body.access_token).trim();
    }
    await upsertZaloNotifySettings(next);
    res.json({
      enabled: next.enabled,
      template_id: next.template_id,
      sending_mode: next.sending_mode,
      has_token: !!(next.access_token && next.access_token.length > 8),
      merge_template_data: next.merge_template_data || {},
      template_structure: next.template_structure,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/zalo-notify-test', async (req, res) => {
  try {
    const s = await getZaloNotifySettings();
    const token = (req.body.access_token && String(req.body.access_token).trim()) || s.access_token;
    const tid = (req.body.template_id && String(req.body.template_id).trim()) || s.template_id;
    if (!token || !tid) {
      return res.status(400).json({ error: 'Cần access_token và template_id (lưu trong cấu hình hoặc gửi kèm body)' });
    }
    const phone = req.body.phone;
    const templateData = req.body.template_data && typeof req.body.template_data === 'object' ? { ...req.body.template_data } : {};
    Object.keys(templateData).forEach((k) => {
      if (templateData[k] != null && typeof templateData[k] !== 'string') templateData[k] = String(templateData[k]);
    });
    const trackingId = (req.body.tracking_id && String(req.body.tracking_id).slice(0, 48).replace(/[^a-zA-Z0-9_-]/g, '')) || `test${Date.now()}`.slice(0, 48);
    const result = await sendZaloTemplateMessage({
      accessToken: token,
      phone,
      templateId: tid,
      templateData,
      trackingId,
      sendingMode: req.body.sending_mode != null ? String(req.body.sending_mode) : s.sending_mode,
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ Zalo OA — Xem trước + gửi thủ công khi deal ở cột «Hoàn thành» ═══
r.get('/leads/:id/zalo-notify-preview', async (req, res) => {
  try {
    const leadId = req.params.id;
    const { data: lead } = await supabase.from('crm_leads')
      .select('id, code, title, type, stage_id, estimated_value, pipeline_id, customer:customers(id, full_name, phone, email, address)')
      .eq('id', leadId)
      .single();
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy' });
    if (lead.type !== 'deal') return res.status(400).json({ error: 'Chỉ áp dụng cho deal' });

    const { data: stage } = await supabase.from('crm_pipeline_stages')
      .select('id, name, is_won, send_zalo_on_enter, pipeline_type')
      .eq('id', lead.stage_id)
      .single();
    if (!isDealStageHoanThanhForZalo(stage)) {
      return res.status(400).json({
        error:
          'Chỉ hiển thị khi deal đang ở cột «Hoàn thành» (tên giai đoạn deal chứa «Hoàn thành»). Thêm cột này trong Cài đặt Pipeline → Deal và kéo deal vào đó.',
      });
    }

    const settings = await getZaloNotifySettings();
    const plZalo = await fetchCrmPipelineZaloSlice(lead.pipeline_id);
    const effectiveTemplateId = resolveZaloDealTemplateId(plZalo.zalo_template_id || settings.template_id);
    const mergedMerge = shallowMergeTemplateData(settings.merge_template_data, plZalo.zalo_merge_template_data);
    const fullTemplateData = buildDealTemplateData(lead, lead.customer, mergedMerge);
    const templateData = pickDealZaloTemplatePayload(fullTemplateData, effectiveTemplateId);
    const rawPhone = String(lead.customer?.phone || '').trim();
    const normalized = normalizeVnPhoneTo84(rawPhone);
    const phoneCanonicalLocal = formatVnPhoneLocal0From84(normalized);
    const { data: prevSend } = await supabase.from('crm_zalo_stage_sends')
      .select('msg_id, error_message, tracking_id, updated_at')
      .eq('lead_id', leadId)
      .eq('stage_id', lead.stage_id)
      .maybeSingle();

    const hasToken = !!(settings.access_token && settings.access_token.length > 8);
    const eligible = !!(settings.enabled && hasToken && normalized);

    res.json({
      eligible,
      stage: {
        id: stage.id,
        name: stage.name,
        is_won: !!stage.is_won,
        send_zalo_on_enter: !!stage.send_zalo_on_enter,
      },
      zalo_app: {
        enabled: settings.enabled,
        template_id: settings.template_id || null,
        effective_template_id: effectiveTemplateId,
        sending_mode: settings.sending_mode || '1',
        has_access_token: hasToken,
        access_token_preview: hasToken ? maskZaloAccessTokenPreview(settings.access_token) : '',
        merge_template_data: settings.merge_template_data || {},
      },
      pipeline_zalo: {
        pipeline_id: lead.pipeline_id || null,
        pipeline_name: plZalo.pipeline?.name || null,
        zalo_template_id: plZalo.zalo_template_id,
        zalo_merge_template_data: plZalo.zalo_merge_template_data || {},
        merged_preview: mergedMerge,
      },
      customer: {
        full_name: lead.customer?.full_name || lead.title || '',
        phone_display: maskCustomerPhoneDisplay(lead.customer?.phone),
      },
      destination_phone_e164: normalized || null,
      destination_phone_ok: !!normalized,
      phone_for_zalo_84: normalized || null,
      phone_canonical_local: phoneCanonicalLocal || null,
      template_data: templateData,
      request_payload_preview: {
        phone: normalized || null,
        template_id: effectiveTemplateId,
        template_data: templateData,
        sending_mode: settings.sending_mode && settings.sending_mode !== '1' ? settings.sending_mode : undefined,
        tracking_id: '(tự sinh khi gửi)',
      },
      previous_send: prevSend
        ? {
            msg_id: prevSend.msg_id,
            error_message: prevSend.error_message,
            tracking_id: prevSend.tracking_id,
            updated_at: prevSend.updated_at,
          }
        : null,
      hints: {
        pipeline_toggle:
          'Trên Cài đặt Pipeline → Deal: bật nút «Zalo» trên cột «Hoàn thành» để tự gửi khi kéo deal vào cột đó (mỗi deal + cột tối đa 1 lần thành công).',
        settings:
          'access_token (bắt buộc) + Zalo OA chung. Theo từng pipeline CRM: chỉnh template_id / merge JSON — ghi đè chung cho deal thuộc pipeline đó (Cài đặt Pipeline → «Zalo theo pipeline»).',
        after_failed_send:
          'Nếu lần trước Zalo báo lỗi (chưa có msg_id): sửa cấu hình/template rồi bấm «Gửi thông báo Zalo» lại — không cần xóa bản ghi.',
        phone_normalize:
          'SĐT lưu dạng 09…, +84…, 0084… hoặc có khoảng trắng vẫn được — hệ thống tự chuẩn hóa 84… khi gọi Zalo. Sau khi gửi thành công, SĐT khách có thể được cập nhật dạng 0xxxxxxxxx trên thẻ Khách hàng.',
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Điền template_data theo object mẫu (key) + dữ liệu deal — dùng trước khi gửi Zalo thủ công */
r.post('/leads/:id/zalo-template-fill', async (req, res) => {
  try {
    const leadId = req.params.id;
    const { data: lead } = await supabase.from('crm_leads')
      .select('id, code, title, type, stage_id, estimated_value, pipeline_id, customer:customers(id, full_name, phone, email, address)')
      .eq('id', leadId)
      .single();
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy' });
    if (lead.type !== 'deal') return res.status(400).json({ error: 'Chỉ áp dụng cho deal' });

    const { data: stage } = await supabase.from('crm_pipeline_stages')
      .select('id, name, pipeline_type')
      .eq('id', lead.stage_id)
      .single();
    if (!isDealStageHoanThanhForZalo(stage)) {
      return res.status(400).json({ error: 'Chỉ dùng khi deal đang ở cột «Hoàn thành»' });
    }

    const settings = await getZaloNotifySettings();
    const plZalo = await fetchCrmPipelineZaloSlice(lead.pipeline_id);
    const mergedMerge = shallowMergeTemplateData(settings.merge_template_data, plZalo.zalo_merge_template_data);

    const bodyStruct = req.body?.structure;
    let structure;
    if (isValidDealZaloTemplateStructure(bodyStruct)) {
      structure = bodyStruct;
    } else if (isValidDealZaloTemplateStructure(settings.template_structure)) {
      structure = settings.template_structure;
    } else {
      structure = getDefaultDealZaloTemplateStructure();
    }

    const filled = fillTemplateDataFromStructure(structure, lead, lead.customer, mergedMerge);
    res.json({ filled });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/leads/:id/zalo-notify-send', async (req, res) => {
  try {
    const leadId = req.params.id;
    const force = !!req.body?.force;
    const rawTd = req.body?.template_data;
    const templateDataOverride =
      rawTd && typeof rawTd === 'object' && !Array.isArray(rawTd) && Object.keys(rawTd).length > 0 ? rawTd : null;

    const { data: lead } = await supabase.from('crm_leads').select('id, type, stage_id').eq('id', leadId).single();
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy' });
    if (lead.type !== 'deal') return res.status(400).json({ error: 'Chỉ áp dụng cho deal' });

    const { data: stage } = await supabase.from('crm_pipeline_stages')
      .select('id, name, is_won, pipeline_type')
      .eq('id', lead.stage_id)
      .single();
    if (!isDealStageHoanThanhForZalo(stage)) {
      return res.status(400).json({ error: 'Chỉ gửi được khi deal đang ở cột «Hoàn thành»' });
    }

    const out = await executeZaloDealStageNotify({
      leadId,
      stageId: lead.stage_id,
      pipelineType: stage.pipeline_type,
      sendZaloOnEnter: true,
      allowWithoutStageFlag: true,
      force,
      templateDataOverride,
    });
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;
