const { supabase } = require('../config/supabase');
const {
  fetchProductionWorkshopTemplatesForApply,
  fetchProductionTemplatesForPipelineStage,
} = require('./workshopTaskTemplateWorkshopType');
const { syncAssignmentFromCrmTask } = require('./crmTaskAssignmentSync');
const { getCrmVcDeliveryStageId } = require('./workshopKanban');
const { validateProductionCompanyId } = require('./productionCompanyGate');
const { loadProductionHandoverMaps, resolveSxAssigneeForTemplateItem } = require('./productionHandoverSettings');
const { resolveExecutorCompanyId, isExecutorColumnError } = require('./crossCompanyWorkspace');
const { normalizeEvidenceFileTypes } = require('./evidenceFileTypes');
const { evidenceFieldsFromTemplateChecklistItem } = require('./checklistItemEvidence');

const SX_TEMPLATE_ITEM_COLS_FULL =
  'id, template_id, title, description, priority, deadline_days, order_index, checklist, blocks_stage_advance, completion_requires_file_or_note, required_evidence_file_types, requires_quick_verdict, executor_company_id';
const SX_TEMPLATE_ITEM_COLS_LEGACY =
  'id, template_id, title, description, priority, deadline_days, order_index, checklist, blocks_stage_advance, executor_company_id';
const SX_TEMPLATE_ITEM_COLS_MIN =
  'id, template_id, title, description, priority, deadline_days, order_index, checklist, blocks_stage_advance';

async function loadHandoverMapsCached(cache, companyId) {
  const key = companyId ? String(companyId) : '__none__';
  if (!cache.has(key)) {
    cache.set(key, companyId
      ? await loadProductionHandoverMaps(companyId)
      : { responsibleUserId: null, assigneeByTemplateItemId: new Map() });
  }
  return cache.get(key);
}

function sxExecutorFieldsFromTemplateItem(it, ownerCompanyId) {
  const execId = resolveExecutorCompanyId(it, ownerCompanyId);
  if (!execId || String(execId) === String(ownerCompanyId || '')) {
    return { executor_company_id: null };
  }
  return { executor_company_id: execId };
}

function sxEvidenceFieldsFromTemplateItem(it) {
  const types = normalizeEvidenceFileTypes(it?.required_evidence_file_types);
  return {
    completion_requires_file_or_note: !!it?.completion_requires_file_or_note || types.length > 0,
    required_evidence_file_types: types,
    requires_quick_verdict: !!it?.requires_quick_verdict,
  };
}

function isSxTemplateEvidenceColumnError(err) {
  const m = String(err?.message || '').toLowerCase();
  return m.includes('required_evidence_file_types')
    || m.includes('completion_requires_file_or_note')
    || m.includes('requires_quick_verdict')
    || m.includes('quick_verdict');
}
const ORDER_PHASES = ['draft', 'confirmed', 'in_production', 'ready_logistics', 'in_logistics', 'completed'];

let _ckSeq = 0;
/**
 * Chuyển checklist mẫu (mảng chuỗi hoặc object) sang định dạng JSONB của crm_tasks.checklist:
 * mỗi phần tử { id, title, description, done } — khớp với CRMTasksTab.normalizeChecklist.
 */
function toCrmChecklist(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x, i) => {
      const title = typeof x === 'string' ? x : (x?.title || x?.label || '');
      if (!title || !String(title).trim()) return null;
      return {
        id: `ck_${Date.now().toString(36)}_${(_ckSeq++).toString(36)}_${i}`,
        title: String(title).trim(),
        description: (typeof x === 'object' && x) ? String(x.description || '') : '',
        notes: '',
        priority: (typeof x === 'object' && x?.priority) ? x.priority : 'medium',
        assignee_id: (typeof x === 'object' && (x?.assignee_id || x?.default_assignee_id))
          ? String(x.assignee_id || x.default_assignee_id)
          : null,
        done: false,
        ...evidenceFieldsFromTemplateChecklistItem(x),
      };
    })
    .filter(Boolean);
}

async function nextDhCode() {
  const year = new Date().getFullYear();
  const { data } = await supabase
    .from('code_sequences')
    .select('current_number, year')
    .eq('prefix', 'DH')
    .single();
  let num = 1;
  if (data) {
    num = data.year === year ? data.current_number + 1 : 1;
  }
  await supabase.from('code_sequences').upsert({ prefix: 'DH', current_number: num, year });
  return `DH-${year}-${String(num).padStart(3, '0')}`;
}

async function nextDealCode() {
  const year = new Date().getFullYear();
  const { data } = await supabase
    .from('code_sequences')
    .select('current_number, year')
    .eq('prefix', 'DEAL')
    .single();
  let num = 1;
  if (data) {
    num = data.year === year ? data.current_number + 1 : 1;
  }
  await supabase.from('code_sequences').upsert({ prefix: 'DEAL', current_number: num, year });
  return `DEAL-${year}-${String(num).padStart(3, '0')}`;
}

async function resolveVcIntakeStageId() {
  try {
    const { data: vcIntakeRow } = await supabase
      .from('logistics_pipeline_stages')
      .select('id')
      .eq('bucket_slug', 'delivery_pending')
      .eq('is_active', true)
      .order('order_index')
      .limit(1)
      .maybeSingle();
    if (vcIntakeRow?.id) return vcIntakeRow.id;
    const { data: vcFirstRow } = await supabase
      .from('logistics_pipeline_stages')
      .select('id')
      .eq('is_active', true)
      .order('order_index')
      .limit(1)
      .maybeSingle();
    return vcFirstRow?.id || null;
  } catch {
    return null;
  }
}

/**
 * Lead/deal gốc gắn dự án (không phải deal con/fulfillment): ưu tiên deal, sau đó lead
 * (dự án tạo từ lead tự động — createProjectFromLead — chỉ có type=lead).
 */
async function findMasterDealForProject(projectId) {
  const { data: rows } = await supabase
    .from('crm_leads')
    .select('id, type, code, title, customer_id, company_id, pipeline_id, stage_id, assigned_to, lead_owner_id, estimated_value, parent_lead_id, created_at')
    .eq('project_id', projectId)
    .is('parent_lead_id', null);
  const list = rows || [];
  const deal = list.find((r) => r.type === 'deal');
  if (deal) return deal;
  return list.find((r) => r.type === 'lead') || list[0] || null;
}

/**
 * Tạo deal con gắn dự án cha — dùng cho nhiệm vụ CRM riêng theo đơn; sau push VC project_id chuyển sang dự án logistics.
 */
async function createFulfillmentChildDeal({
  parentDeal,
  masterProjectId,
  displayLabel,
  userId,
  estimatedValue,
}) {
  const code = await nextDealCode();
  const label = (displayLabel || 'Đơn con').trim();
  const title = label;
  const parentHint = (parentDeal.title || parentDeal.code || '').trim();
  const description = parentHint
    ? `Đơn hàng con — deal cha: ${parentHint}`
    : 'Đơn hàng con (fulfillment)';
  const { data, error } = await supabase
    .from('crm_leads')
    .insert({
      code,
      title,
      description,
      type: 'deal',
      customer_id: parentDeal.customer_id,
      company_id: parentDeal.company_id,
      pipeline_id: parentDeal.pipeline_id,
      stage_id: parentDeal.stage_id,
      assigned_to: parentDeal.assigned_to || userId,
      lead_owner_id: parentDeal.lead_owner_id || parentDeal.assigned_to || userId,
      project_id: masterProjectId,
      parent_lead_id: parentDeal.id,
      estimated_value: estimatedValue != null ? estimatedValue : parentDeal.estimated_value || 0,
      created_by: userId,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

/**
 * Tạo bộ nhiệm vụ CRM theo đơn từ bộ mẫu Sản xuất mặc định.
 * - Nhiệm vụ lớn = title từ workshop_task_template_items
 * - Nhiệm vụ nhỏ (checklist) được ghép vào description để người dùng thấy ngay trong task.
 */
async function applyProductionTemplateToFulfillmentLead({
  leadId,
  createdBy,
  assigneeId = null,
  force = false,
  /** Nếu true: chỉ cho phép lấy bộ mẫu thuộc đúng company_id của deal (không fallback global / công ty khác). */
  requireTemplateCompanyMatch = false,
  /** Company của deal gọi API (ưu tiên hơn leadRow.company_id khi requireTemplateCompanyMatch). */
  dealCompanyId = null,
  /** Công ty xưởng phụ trách SX — ưu tiên khi chọn workshop_task_templates (cột Sản xuất / bàn giao). */
  templateSourceCompanyId = null,
}) {
  if (!leadId || !createdBy) return { created: 0, reason: 'missing_params' };

  const buildEmergencySxInserts = (handoverMaps = null) => {
    // Bộ tối thiểu 9 cột sx_* với 3 việc/cột (có thể chỉnh sau).
    const seed = [
      { stage_slug: 'sx_tiep_nhan', items: ['Xác nhận thông tin đơn hàng', 'Tiếp nhận file/tài liệu', 'Chốt yêu cầu kỹ thuật ban đầu'] },
      { stage_slug: 'sx_thiet_ke_ke_hoach', items: ['Dựng/duyệt bản vẽ', 'Lập BOM & định mức', 'Lập kế hoạch tiến độ'] },
      { stage_slug: 'sx_kiem_tra_cheo', items: ['Rà soát kỹ thuật chéo', 'Xác nhận điểm rủi ro', 'Phê duyệt trước sản xuất'] },
      { stage_slug: 'sx_vat_tu', items: ['Kiểm kê tồn kho', 'Mua bù vật tư thiếu', 'Cấp phát vật tư'] },
      { stage_slug: 'sx_san_xuat_thung', items: ['Chuẩn bị máy móc & jig', 'Gia công chính', 'Lắp ráp bán thành phẩm'] },
      { stage_slug: 'sx_san_xuat_alu', items: ['Chuẩn bị vật tư alu', 'Gia công alu', 'Lắp ráp & QC alu'] },
      { stage_slug: 'sx_hoan_thien', items: ['Xử lý bề mặt/hoàn thiện', 'QC cuối', 'Nghiệm thu nội bộ'] },
      { stage_slug: 'sx_dong_goi', items: ['Chuẩn bị vật liệu đóng gói', 'Đóng gói theo quy cách', 'Dán nhãn & bàn giao kho xuất'] },
      { stage_slug: 'sx_giao_hang', items: ['Tạo lệnh giao', 'Bàn giao đơn vị vận chuyển', 'Theo dõi và chốt giao'] },
    ];

    const out = [];
    let globalOrder = 1;
    for (const g of seed) {
      let local = 1;
      for (const title of g.items) {
        out.push({
          lead_id: leadId,
          title,
          description: null,
          status: 'pending',
          priority: 'medium',
          stage_slug: g.stage_slug,
          order_index: local,
          assignee_id: null,
          supervisor_id: null,
          deadline: null,
          created_by: createdBy,
          // keep stable ordering across all inserts too
          _global_order: globalOrder,
        });
        local += 1;
        globalOrder += 1;
      }
    }
    // Strip helper field
    return out.map(({ _global_order, ...row }) => row);
  };

  /** Chuẩn hoá để so khớp «đã có nhiệm vụ này chưa» (bổ sung thiếu, không nhân đôi). */
  const normalizeSxTaskText = (raw) =>
    String(raw || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

  const sxTaskFingerprint = (title, stageSlug) =>
    `${normalizeSxTaskText(title)}|${String(stageSlug || '').trim()}`;

  const filterMissingSxInserts = async (inserts) => {
    const { data: existingSx } = await supabase
      .from('crm_tasks')
      .select('title, stage_slug')
      .eq('lead_id', leadId)
      .like('stage_slug', 'sx_%');
    const keys = new Set((existingSx || []).map((t) => sxTaskFingerprint(t.title, t.stage_slug)));
    return inserts.filter((row) => !keys.has(sxTaskFingerprint(row.title, row.stage_slug)));
  };

  /** Map stage slug theo TÊN BỘ MẪU (template.name), không theo title của item. */
  const slugByTemplateName = (nameRaw) => {
    const t = normalizeSxTaskText(nameRaw);
    if (t.includes('tiep nhan')) return 'sx_tiep_nhan';
    if (t.includes('thiet ke') || t.includes('len ke hoach')) return 'sx_thiet_ke_ke_hoach';
    if (t.includes('kiem tra cheo')) return 'sx_kiem_tra_cheo';
    if (t.includes('vat tu')) return 'sx_vat_tu';
    if (t.includes('san xuat thung')) return 'sx_san_xuat_thung';
    if (t.includes('san xuat alu')) return 'sx_san_xuat_alu';
    if (t.includes('hoan thien')) return 'sx_hoan_thien';
    if (t.includes('dong goi')) return 'sx_dong_goi';
    if (t.includes('giao hang')) return 'sx_giao_hang';
    return 'sx_other';
  };

  const { count: existingCount, error: exErr } = await supabase
    .from('crm_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('lead_id', leadId)
    .like('stage_slug', 'sx_%');
  if (exErr) throw exErr;
  if ((existingCount || 0) > 0 && force) {
    // Force regen: xóa toàn bộ tasks sx_* của deal đơn rồi tạo lại đúng mapping.
    await supabase
      .from('crm_tasks')
      .delete()
      .eq('lead_id', leadId)
      .like('stage_slug', 'sx_%');
  }

  const { data: leadRow } = await supabase
    .from('crm_leads')
    .select('id, company_id, project_id')
    .eq('id', leadId)
    .maybeSingle();

  let workshopTypeId = null;
  if (leadRow?.project_id) {
    const { data: projRow } = await supabase
      .from('projects')
      .select('workshop_type_id')
      .eq('id', leadRow.project_id)
      .maybeSingle();
    workshopTypeId = projRow?.workshop_type_id || null;
  }

  if (requireTemplateCompanyMatch) {
    const normCo = (v) => (v != null && String(v).trim() !== '' ? String(v).trim() : null);
    const mustCompanyId =
      normCo(templateSourceCompanyId) || normCo(dealCompanyId) || normCo(leadRow?.company_id) || null;
    if (!mustCompanyId) return { created: 0, reason: 'missing_deal_company' };

    const handoverStrict = await loadProductionHandoverMaps(mustCompanyId);

    // Strict mode: ưu tiên template đúng company xưởng (templateSourceCompanyId) / company CRM deal, fallback global,
    // và cuối cùng emergency seed để "bằng bất cứ giá nào" vẫn có sx_* tasks.
    //
    // Truy vấn KÈM production_stage_id (migration 256) để gen task gắn cột pipeline thật → gate Kanban
    // chặn chuyển giai đoạn hoạt động chính xác. DB cũ → retry không có cột.
    const fetchTemplatesStrict = async (scopeCompanyId, wantStageCol) => fetchProductionWorkshopTemplatesForApply(supabase, {
      companyId: scopeCompanyId,
      workshopTypeId,
      wantStageCol,
    });

    let templates = [];
    let tplErr = null;
    let r1 = await fetchTemplatesStrict(mustCompanyId, true);
    if (r1.error && String(r1.error.message || '').includes('production_stage_id')) {
      r1 = await fetchTemplatesStrict(mustCompanyId, false);
    }
    templates = r1.data || [];
    tplErr = r1.error;
    if (tplErr) throw tplErr;
    if (!templates?.length) {
      let g = await fetchTemplatesStrict(null, true);
      if (g.error && String(g.error.message || '').includes('production_stage_id')) {
        g = await fetchTemplatesStrict(null, false);
      }
      if (g.error) throw g.error;
      templates = g.data || [];
    }
    if (!templates?.length) {
      const emergency = buildEmergencySxInserts(handoverStrict);
      const toAdd = await filterMissingSxInserts(emergency);
      if (!toAdd.length) {
        return { created: 0, reason: 'no_missing_sx_tasks', template_count: 0, template_names: [], company_id: mustCompanyId };
      }
      const { error: insErr } = await supabase.from('crm_tasks').insert(toAdd);
      if (insErr) throw insErr;
      return { created: toAdd.length, reason: 'emergency_seed', template_count: 0, template_names: [], company_id: mustCompanyId };
    }

    const templateIds = templates.map((t) => t.id).filter(Boolean);
    // Cố gắng select kèm blocks_stage_advance (migration 256) — fallback bỏ cờ nếu DB chưa migrate.
    const fetchItems = async (cols) => supabase
      .from('workshop_task_template_items')
      .select(cols)
      .in('template_id', templateIds)
      .order('template_id')
      .order('order_index');
    let { data: items, error: itemErr } = await fetchItems(SX_TEMPLATE_ITEM_COLS_FULL);
    if (itemErr && isSxTemplateEvidenceColumnError(itemErr)) {
      ({ data: items, error: itemErr } = await fetchItems(SX_TEMPLATE_ITEM_COLS_LEGACY));
    }
    if (itemErr && isExecutorColumnError(itemErr)) {
      ({ data: items, error: itemErr } = await fetchItems(SX_TEMPLATE_ITEM_COLS_MIN));
    }
    if (itemErr && String(itemErr.message || '').includes('blocks_stage_advance')) {
      ({ data: items, error: itemErr } = await fetchItems(
        'id, template_id, title, description, priority, deadline_days, order_index, checklist',
      ));
    }
    if (itemErr) throw itemErr;
    if (!items?.length) {
      const emergency = buildEmergencySxInserts(handoverStrict);
      const toAdd = await filterMissingSxInserts(emergency);
      if (!toAdd.length) {
        return {
          created: 0,
          reason: 'no_missing_sx_tasks',
          template_count: templates.length,
          template_names: templates.map((t) => t.name).filter(Boolean),
          company_id: mustCompanyId,
        };
      }
      const { error: insErr } = await supabase.from('crm_tasks').insert(toAdd);
      if (insErr) throw insErr;
      return {
        created: toAdd.length,
        reason: 'emergency_seed',
        template_count: templates.length,
        template_names: templates.map((t) => t.name).filter(Boolean),
        company_id: mustCompanyId,
      };
    }

    const stageSlugByTemplateId = new Map(
      (templates || [])
        .filter((t) => t?.id)
        .map((t) => [String(t.id), slugByTemplateName(t.name)]),
    );
    // Gắn task vào cột pipeline thật (production_pipeline_stages.id) — gate Kanban dùng cột này.
    const pipelineColByTemplateId = new Map(
      (templates || [])
        .filter((t) => t?.id)
        .map((t) => [String(t.id), t.production_stage_id || null]),
    );
    const templateOrder = new Map(templateIds.map((id, idx) => [String(id), idx]));
    const sortedItems = [...items].sort((a, b) => {
      const ta = templateOrder.get(String(a.template_id)) ?? 9999;
      const tb = templateOrder.get(String(b.template_id)) ?? 9999;
      if (ta !== tb) return ta - tb;
      return (Number(a.order_index) || 0) - (Number(b.order_index) || 0);
    });

    const handoverCacheStrict = new Map();
    const inserts = [];
    for (let idx = 0; idx < sortedItems.length; idx++) {
      const it = sortedItems[idx];
      const checklist = toCrmChecklist(it.checklist);
      const stageSlug = stageSlugByTemplateId.get(String(it.template_id)) || 'sx_other';
      const execCo = resolveExecutorCompanyId(it, mustCompanyId);
      const maps = await loadHandoverMapsCached(handoverCacheStrict, execCo);
      inserts.push({
        lead_id: leadId,
        title: it.title,
        description: (it.description || '').trim() || null,
        checklist,
        status: 'pending',
        priority: it.priority || 'medium',
        stage_slug: stageSlug,
        order_index: Number.isFinite(Number(it.order_index)) ? Number(it.order_index) : (idx + 1),
        assignee_id: resolveSxAssigneeForTemplateItem(it, maps),
        supervisor_id: null,
        deadline: null,
        created_by: createdBy,
        blocks_stage_advance: !!it.blocks_stage_advance,
        ...sxEvidenceFieldsFromTemplateItem(it),
        ...sxExecutorFieldsFromTemplateItem(it, mustCompanyId),
        production_pipeline_stage_id: pipelineColByTemplateId.get(String(it.template_id)) || null,
      });
    }

    const toInsertStrict = await filterMissingSxInserts(inserts);
    if (!toInsertStrict.length) {
      return {
        created: 0,
        reason: 'no_missing_sx_tasks',
        template_count: templates.length,
        template_names: templates.map((t) => t.name).filter(Boolean),
        company_id: mustCompanyId,
      };
    }
    // Insert với fallback chuỗi: nếu DB chưa apply migration 256 → strip cột mới và retry.
    let insErr = (await supabase.from('crm_tasks').insert(toInsertStrict)).error;
    if (insErr && String(insErr.message || '').includes('production_pipeline_stage_id')) {
      const stripped = toInsertStrict.map(({ production_pipeline_stage_id: _p, ...rest }) => rest);
      insErr = (await supabase.from('crm_tasks').insert(stripped)).error;
    }
    if (insErr && String(insErr.message || '').includes('blocks_stage_advance')) {
      const stripped = toInsertStrict.map(({ blocks_stage_advance: _b, production_pipeline_stage_id: _p, ...rest }) => rest);
      insErr = (await supabase.from('crm_tasks').insert(stripped)).error;
    }
    if (insErr && isSxTemplateEvidenceColumnError(insErr)) {
      const stripped = toInsertStrict.map(({
        completion_requires_file_or_note: _c,
        required_evidence_file_types: _r,
        requires_quick_verdict: _q,
        ...rest
      }) => rest);
      insErr = (await supabase.from('crm_tasks').insert(stripped)).error;
    }
    if (insErr && isExecutorColumnError(insErr)) {
      const stripped = toInsertStrict.map(({ executor_company_id: _e, ...rest }) => rest);
      insErr = (await supabase.from('crm_tasks').insert(stripped)).error;
    }
    // DB chưa apply migration 308 (cột checklist) → bỏ checklist và thử lại.
    if (insErr && String(insErr.message || '').toLowerCase().includes('checklist')) {
      const stripped = toInsertStrict.map(({ checklist: _c, ...rest }) => rest);
      insErr = (await supabase.from('crm_tasks').insert(stripped)).error;
    }
    if (insErr) throw insErr;
    return {
      created: toInsertStrict.length,
      reason: 'ok',
      template_count: templates.length,
      template_names: templates.map((t) => t.name).filter(Boolean),
      company_id: mustCompanyId,
    };
  }

  // Ưu tiên xác định "công ty SX" để lấy đúng bộ mẫu theo công ty:
  // 0) templateSourceCompanyId (API / cột Sản xuất)
  // 1) orders.sx_company_id (đơn đã chuyển SX)
  // 2) projects.company_id (dự án xưởng)
  // 3) leadRow.company_id (công ty CRM) — chỉ dùng nếu thuộc module SX
  let targetCompanyId = null;
  const normTplSrc =
    templateSourceCompanyId != null && String(templateSourceCompanyId).trim() !== ''
      ? String(templateSourceCompanyId).trim()
      : null;
  if (normTplSrc) {
    const co0 = await validateProductionCompanyId(normTplSrc);
    if (co0.ok) targetCompanyId = co0.company.id;
  }

  if (!targetCompanyId) {
    try {
      const { data: ord } = await supabase
        .from('orders')
        .select('sx_company_id')
        .eq('fulfillment_lead_id', leadId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (ord?.sx_company_id) targetCompanyId = ord.sx_company_id;
    } catch (_) { /* ignore */ }
  }

  if (!targetCompanyId && leadRow?.project_id) {
    const { data: p } = await supabase
      .from('projects')
      .select('company_id, workshop_type_id')
      .eq('id', leadRow.project_id)
      .maybeSingle();
    if (p?.company_id) targetCompanyId = p.company_id;
    if (!workshopTypeId && p?.workshop_type_id) workshopTypeId = p.workshop_type_id;
  }

  if (!targetCompanyId && leadRow?.company_id) targetCompanyId = leadRow.company_id;

  // Chỉ "scope theo công ty" khi company thuộc module SX; nếu không thì fallback sang template global.
  if (targetCompanyId) {
    const co = await validateProductionCompanyId(targetCompanyId);
    if (!co.ok) targetCompanyId = null;
  }

  const handoverLoose = targetCompanyId
    ? await loadProductionHandoverMaps(targetCompanyId)
    : { responsibleUserId: null, assigneeByTemplateItemId: new Map() };

  const fetchTemplates = async (companyMode, wantStage = true) => fetchProductionWorkshopTemplatesForApply(supabase, {
    companyId: companyMode === 'scoped' && targetCompanyId ? targetCompanyId : (companyMode === 'global' ? null : targetCompanyId),
    workshopTypeId,
    wantStageCol: wantStage,
  });

  let r1 = await fetchTemplates('scoped', true);
  if (r1.error && String(r1.error.message || '').includes('production_stage_id')) {
    r1 = await fetchTemplates('scoped', false);
  }
  let templates = r1.data;
  let tplErr = r1.error;
  if (tplErr) throw tplErr;
  if (!templates?.length) {
    let g = await fetchTemplates('global', true);
    if (g.error && String(g.error.message || '').includes('production_stage_id')) {
      g = await fetchTemplates('global', false);
    }
    templates = g.data;
    tplErr = g.error;
  }
  if (tplErr) throw tplErr;
  if (!templates?.length) {
    const emergency = buildEmergencySxInserts(handoverLoose);
    const toAdd = await filterMissingSxInserts(emergency);
    if (!toAdd.length) {
      return { created: 0, reason: 'no_missing_sx_tasks', template_count: 0, template_names: [], company_id: targetCompanyId || null };
    }
    const { error: insErr } = await supabase.from('crm_tasks').insert(toAdd);
    if (insErr) throw insErr;
    return { created: toAdd.length, reason: 'emergency_seed', template_count: 0, template_names: [], company_id: targetCompanyId || null };
  }

  const templateIds = templates.map((t) => t.id).filter(Boolean);
  const fetchItemsLoose = async (cols) => supabase
    .from('workshop_task_template_items')
    .select(cols)
    .in('template_id', templateIds)
    .order('template_id')
    .order('order_index');
  let { data: items, error: itemErr } = await fetchItemsLoose(SX_TEMPLATE_ITEM_COLS_FULL);
  if (itemErr && isSxTemplateEvidenceColumnError(itemErr)) {
    ({ data: items, error: itemErr } = await fetchItemsLoose(SX_TEMPLATE_ITEM_COLS_LEGACY));
  }
  if (itemErr && isExecutorColumnError(itemErr)) {
    ({ data: items, error: itemErr } = await fetchItemsLoose(SX_TEMPLATE_ITEM_COLS_MIN));
  }
  if (itemErr && String(itemErr.message || '').includes('blocks_stage_advance')) {
    ({ data: items, error: itemErr } = await fetchItemsLoose(
      'id, template_id, title, description, priority, deadline_days, order_index, checklist',
    ));
  }
  if (itemErr) throw itemErr;
  if (!items?.length) {
    const emergency = buildEmergencySxInserts(handoverLoose);
    const toAdd = await filterMissingSxInserts(emergency);
    if (!toAdd.length) {
      return {
        created: 0,
        reason: 'no_missing_sx_tasks',
        template_count: templates.length,
        template_names: templates.map((t) => t.name).filter(Boolean),
        company_id: targetCompanyId || null,
      };
    }
    const { error: insErr } = await supabase.from('crm_tasks').insert(toAdd);
    if (insErr) throw insErr;
    return {
      created: toAdd.length,
      reason: 'emergency_seed',
      template_count: templates.length,
      template_names: templates.map((t) => t.name).filter(Boolean),
      company_id: targetCompanyId || null,
    };
  }

  const stageSlugByTemplateId = new Map(
    (templates || [])
      .filter((t) => t?.id)
      .map((t) => [String(t.id), slugByTemplateName(t.name)]),
  );
  const pipelineColByTemplateId = new Map(
    (templates || [])
      .filter((t) => t?.id)
      .map((t) => [String(t.id), t.production_stage_id || null]),
  );

  const templateOrder = new Map(templateIds.map((id, idx) => [String(id), idx]));
  const sortedItems = [...items].sort((a, b) => {
    const ta = templateOrder.get(String(a.template_id)) ?? 9999;
    const tb = templateOrder.get(String(b.template_id)) ?? 9999;
    if (ta !== tb) return ta - tb;
    return (Number(a.order_index) || 0) - (Number(b.order_index) || 0);
  });

  const handoverCacheLoose = new Map();
  const inserts = [];
  for (let idx = 0; idx < sortedItems.length; idx++) {
    const it = sortedItems[idx];
    const checklist = toCrmChecklist(it.checklist);
    const stageSlug = stageSlugByTemplateId.get(String(it.template_id)) || 'sx_other';
    const execCo = resolveExecutorCompanyId(it, targetCompanyId);
    const maps = await loadHandoverMapsCached(handoverCacheLoose, execCo);
    inserts.push({
      lead_id: leadId,
      title: it.title,
      checklist,
      description: (it.description || '').trim() || null,
      status: 'pending',
      priority: it.priority || 'medium',
      stage_slug: stageSlug,
      order_index: Number.isFinite(Number(it.order_index)) ? Number(it.order_index) : (idx + 1),
      assignee_id: resolveSxAssigneeForTemplateItem(it, maps),
      supervisor_id: null,
      deadline: null,
      created_by: createdBy,
      blocks_stage_advance: !!it.blocks_stage_advance,
      ...sxEvidenceFieldsFromTemplateItem(it),
      ...sxExecutorFieldsFromTemplateItem(it, targetCompanyId),
      production_pipeline_stage_id: pipelineColByTemplateId.get(String(it.template_id)) || null,
    });
  }

  const toInsertLoose = await filterMissingSxInserts(inserts);
  if (!toInsertLoose.length) {
    return {
      created: 0,
      reason: 'no_missing_sx_tasks',
      template_count: templates.length,
      template_names: templates.map((t) => t.name).filter(Boolean),
      company_id: targetCompanyId || null,
    };
  }
  let insErr = (await supabase.from('crm_tasks').insert(toInsertLoose)).error;
  if (insErr && String(insErr.message || '').includes('production_pipeline_stage_id')) {
    const stripped = toInsertLoose.map(({ production_pipeline_stage_id: _p, ...rest }) => rest);
    insErr = (await supabase.from('crm_tasks').insert(stripped)).error;
  }
  if (insErr && String(insErr.message || '').includes('blocks_stage_advance')) {
    const stripped = toInsertLoose.map(({ blocks_stage_advance: _b, production_pipeline_stage_id: _p, ...rest }) => rest);
    insErr = (await supabase.from('crm_tasks').insert(stripped)).error;
  }
  if (insErr && isSxTemplateEvidenceColumnError(insErr)) {
    const stripped = toInsertLoose.map(({
      completion_requires_file_or_note: _c,
      required_evidence_file_types: _r,
      requires_quick_verdict: _q,
      ...rest
    }) => rest);
    insErr = (await supabase.from('crm_tasks').insert(stripped)).error;
  }
  if (insErr && isExecutorColumnError(insErr)) {
    const stripped = toInsertLoose.map(({ executor_company_id: _e, ...rest }) => rest);
    insErr = (await supabase.from('crm_tasks').insert(stripped)).error;
  }
  // DB chưa apply migration 308 (cột checklist) → bỏ checklist và thử lại.
  if (insErr && String(insErr.message || '').toLowerCase().includes('checklist')) {
    const stripped = toInsertLoose.map(({ checklist: _c, ...rest }) => rest);
    insErr = (await supabase.from('crm_tasks').insert(stripped)).error;
  }
  if (insErr) throw insErr;
  return {
    created: toInsertLoose.length,
    reason: 'ok',
    template_count: templates.length,
    template_names: templates.map((t) => t.name).filter(Boolean),
    company_id: targetCompanyId || null,
  };
}

/**
 * Chuyển toàn bộ dữ liệu nghiệp vụ từ deal gốc sang deal fulfillment (deal sản xuất).
 * Dùng khi tạo Đơn 1 từ deal CRM đã thắng/chuyển SX.
 */
async function migrateDealInternalsToFulfillmentLead({
  fromLeadId,
  toLeadId,
  projectId = null,
}) {
  if (!fromLeadId || !toLeadId) return { moved: false, reason: 'missing_params' };
  if (String(fromLeadId) === String(toLeadId)) return { moved: false, reason: 'same_lead' };

  // 1) Tasks + attachments task
  await supabase.from('crm_tasks').update({ lead_id: toLeadId }).eq('lead_id', fromLeadId);
  await supabase.from('crm_task_attachments').update({ lead_id: toLeadId }).eq('lead_id', fromLeadId);

  // 2) Tài liệu lead/deal
  const docPatch = { lead_id: toLeadId };
  if (projectId) docPatch.project_id = projectId;
  await supabase.from('lead_documents').update(docPatch).eq('lead_id', fromLeadId);

  // 3) Hoạt động CRM
  await supabase.from('crm_activities').update({ lead_id: toLeadId }).eq('lead_id', fromLeadId);

  // 4) Báo giá/hóa đơn gắn lead (nếu có)
  await supabase.from('quotations').update({ lead_id: toLeadId }).eq('lead_id', fromLeadId);
  await supabase.from('invoices').update({ lead_id: toLeadId }).eq('lead_id', fromLeadId);

  return { moved: true, fromLeadId, toLeadId };
}

async function pushOrderToLogistics({ orderId, projectId, userId }) {
  const { data: order, error: oErr } = await supabase
    .from('orders')
    .select('id, project_id, fulfillment_lead_id, logistics_project_id, display_label, code, title, total, order_phase')
    .eq('id', orderId)
    .single();
  if (oErr || !order) throw new Error('Không tìm thấy đơn hàng');
  if (String(order.project_id) !== String(projectId)) {
    throw new Error('Đơn không thuộc dự án này');
  }
  // Không cho nhảy thẳng VC/LĐ: phải qua SX trước, sau đó chuyển trạng thái sang 'ready_logistics'
  if (String(order.order_phase || 'draft') !== 'ready_logistics') {
    throw new Error('Chưa thể đẩy VC/LĐ. Hãy chuyển sang Sản xuất trước và đưa đơn về trạng thái "Chờ VC".');
  }
  if (order.logistics_project_id) {
    return { already: true, logistics_project_id: order.logistics_project_id, fulfillment_lead_id: order.fulfillment_lead_id };
  }
  if (!order.fulfillment_lead_id) {
    throw new Error('Đơn chưa có deal thực hiện (fulfillment). Tạo lại đơn hoặc liên hệ quản trị.');
  }

  const { data: parentProj, error: pErr } = await supabase
    .from('projects')
    .select('id, code, name, customer_id, company_id, install_address, flow_id, workshop_type_id')
    .eq('id', projectId)
    .single();
  if (pErr || !parentProj) throw new Error('Không tìm thấy dự án');

  const vcStageId = await resolveVcIntakeStageId();

  const suffix = (order.display_label || order.code || 'VC').replace(/\s+/g, '-').slice(0, 40);
  const childCode = `${parentProj.code}-VC-${suffix}`.replace(/[^A-Za-z0-9\-_.]/g, '').slice(0, 80);
  const childName = `${parentProj.name} — ${order.display_label || order.code || 'Đơn'}`;

  const { data: deliveryStage } = await supabase
    .from('workflow_stages')
    .select('id')
    .eq('slug', 'delivery')
    .limit(1)
    .maybeSingle();

  const insertPayload = {
    code: childCode,
    name: childName,
    description: `Đơn hàng ${order.code || ''} — VC/LĐ`,
    customer_id: parentProj.customer_id,
    company_id: parentProj.company_id,
    status: 'shipping',
    current_stage_id: null,
    vc_kanban_column_id: vcStageId,
    flow_id: null,
    workshop_type_id: parentProj.workshop_type_id || null,
    install_address: parentProj.install_address || null,
    estimated_value: order.total || 0,
    created_by: userId,
  };

  let { data: childProject, error: cErr } = await supabase
    .from('projects')
    .insert(insertPayload)
    .select('id, code')
    .single();
  if (cErr?.message?.includes('vc_kanban_column_id')) {
    const { vc_kanban_column_id: _v, ...noVc } = insertPayload;
    const r0 = await supabase.from('projects').insert(noVc).select('id, code').single();
    childProject = r0.data;
    cErr = r0.error;
  }
  if (cErr) {
    const retry = { ...insertPayload, code: `${parentProj.code}-VC-${String(order.id).slice(0, 8)}` };
    const r2 = await supabase.from('projects').insert(retry).select('id, code').single();
    childProject = r2.data;
    cErr = r2.error;
  }
  if (cErr) throw cErr;

  const vcDeliveryStageId = await getCrmVcDeliveryStageId();
  const leadUpd = {
    project_id: childProject.id,
    ...(vcStageId ? { vc_pipeline_stage_id: vcStageId } : {}),
    ...(vcDeliveryStageId ? { stage_id: vcDeliveryStageId } : {}),
  };
  const { error: luErr } = await supabase.from('crm_leads').update(leadUpd).eq('id', order.fulfillment_lead_id);
  if (luErr) {
    await supabase.from('projects').delete().eq('id', childProject.id);
    throw luErr;
  }

  const { error: ouErr } = await supabase
    .from('orders')
    .update({
      logistics_project_id: childProject.id,
      order_phase: 'in_logistics',
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId);
  if (ouErr) throw ouErr;

  try {
    await supabase.from('stage_transitions').insert({
      project_id: childProject.id,
      from_stage_id: null,
      to_stage_id: deliveryStage?.id || null,
      notes: `Tạo từ đơn ${order.code} (dự án ${parentProj.code})`,
      transitioned_by: userId,
    });
  } catch (_) { /* optional */ }

  try {
    const { ensureDealLeadDocumentsForModuleTransition } = require('./ensureDealLeadDocumentsForModuleTransition');
    await ensureDealLeadDocumentsForModuleTransition({
      leadId: order.fulfillment_lead_id,
      projectId: childProject.id,
    });
  } catch (e) {
    console.warn('[pushOrderToLogistics] ensure lead_documents:', e.message);
  }

  return {
    already: false,
    logistics_project_id: childProject.id,
    logistics_project_code: childProject.code,
    fulfillment_lead_id: order.fulfillment_lead_id,
  };
}

/**
 * Tạo đơn hàng con trên dự án (đồng bộ với POST /projects/:id/orders).
 * @param {{ projectId: string, userId: string, displayLabel: string, title?: string, total?: number }} p
 */
async function createChildOrderOnProject(p) {
  const { projectId, userId, displayLabel, title, total } = p;
  const label = String(displayLabel || title || '').trim();
  if (!label) throw new Error('Nhập tên đơn');

  const { data: proj, error: pe } = await supabase
    .from('projects')
    .select('id, name, customer_id')
    .eq('id', projectId)
    .single();
  if (pe || !proj) throw new Error('Không tìm thấy dự án');

  let cust = {};
  if (proj.customer_id) {
    const { data: c } = await supabase
      .from('customers')
      .select('full_name, phone, address')
      .eq('id', proj.customer_id)
      .maybeSingle();
    if (c) cust = c;
  }

  const master = await findMasterDealForProject(projectId);
  if (!master) {
    throw new Error('Dự án chưa có Lead/Deal CRM gắn (crm_leads.project_id, không phải deal con).');
  }

  const { data: lastSort } = await supabase
    .from('orders')
    .select('sort_index')
    .eq('project_id', projectId)
    .order('sort_index', { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortIndex = (lastSort?.sort_index ?? -1) + 1;

  const code = await nextDhCode();
  const childLeadId = await createFulfillmentChildDeal({
    parentDeal: master,
    masterProjectId: projectId,
    displayLabel: label,
    userId,
    estimatedValue: total != null ? Number(total) : 0,
  });

  // Tự động gắn bộ nhiệm vụ SX vào deal nhiệm vụ theo đơn (fulfillment lead)
  await applyProductionTemplateToFulfillmentLead({
    leadId: childLeadId,
    createdBy: userId,
    assigneeId: master.assigned_to || master.lead_owner_id || null,
  });

  const { data: order, error: insErr } = await supabase
    .from('orders')
    .insert({
      code,
      title: (title && String(title).trim()) || label,
      display_label: label,
      sort_index: sortIndex,
      order_phase: 'draft',
      project_id: projectId,
      lead_id: master.id,
      fulfillment_lead_id: childLeadId,
      customer_id: proj.customer_id,
      customer_name: cust.full_name || null,
      customer_phone: cust.phone || null,
      customer_address: cust.address || null,
      total: total != null ? Number(total) : 0,
      subtotal: total != null ? Number(total) : 0,
      status: 'draft',
      created_by: userId,
    })
    .select('*')
    .single();
  if (insErr) throw insErr;
  return order;
}

/**
 * Nếu dự án chưa có đơn từng lượt nào, tạo sẵn "Đơn 1" (1 bộ nhiệm vụ = 1 bản ghi order + deal fulfillment).
 * Gọi sau mọi luồng tạo dự án từ Lead/Deal.
 */
async function ensureDefaultOrderOneForProject() {
  return { created: false, reason: 'order_creation_disabled' };
}

/**
 * Đồng bộ các đơn CRM đã tạo ở deal gốc sang project SX:
 * - Gán project_id để SX nhìn thấy đủ số đơn
 * - Tạo fulfillment deal nếu thiếu
 * - Gắn bộ nhiệm vụ SX cho fulfillment deal nếu thiếu
 */
async function syncExistingCrmOrdersToProject({
  projectId,
  userId,
  parentLeadId = null,
}) {
  if (!projectId || !userId) return { synced: 0, touched: 0 };
  const master = parentLeadId
    ? await supabase
      .from('crm_leads')
      .select('id, type, code, title, customer_id, company_id, pipeline_id, stage_id, assigned_to, lead_owner_id, estimated_value')
      .eq('id', parentLeadId)
      .maybeSingle()
      .then((r) => r.data || null)
    : await findMasterDealForProject(projectId);
  if (!master?.id) return { synced: 0, touched: 0, reason: 'no_master_deal' };

  const { data: rows, error } = await supabase
    .from('orders')
    .select('id, code, title, display_label, total, lead_id, project_id, fulfillment_lead_id, sort_index, created_at')
    .eq('lead_id', master.id)
    .order('sort_index', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });
  if (error) throw error;
  if (!rows?.length) return { synced: 0, touched: 0 };

  let synced = 0;
  let touched = 0;
  for (const row of rows) {
    const patch = {};
    if (!row.project_id || String(row.project_id) !== String(projectId)) {
      patch.project_id = projectId;
      touched += 1;
    }
    let fulfillmentLeadId = row.fulfillment_lead_id || null;
    if (!fulfillmentLeadId) {
      const label = (row.display_label || row.title || row.code || 'Đơn').trim();
      fulfillmentLeadId = await createFulfillmentChildDeal({
        parentDeal: master,
        masterProjectId: projectId,
        displayLabel: label,
        userId,
        estimatedValue: Number(row.total || 0),
      });
      patch.fulfillment_lead_id = fulfillmentLeadId;
      touched += 1;
    }
    if (Object.keys(patch).length) {
      await supabase.from('orders').update(patch).eq('id', row.id);
    }
    if (fulfillmentLeadId) {
      await applyProductionTemplateToFulfillmentLead({
        leadId: fulfillmentLeadId,
        createdBy: userId,
        assigneeId: master.assigned_to || master.lead_owner_id || null,
      });
      synced += 1;
    }
  }
  return { synced, touched };
}

/** Ngày hẹn do NV tự đặt — không gán khi hoàn thành nhiệm vụ SX trước. */
async function scheduleNextSxCrmTaskAfterComplete() {
  return { ok: true, skip: 'manual_deadline_policy' };
}

/**
 * Khi thẻ SX chuyển sang cột pipeline: áp mọi bộ mẫu gắn cột đó → crm_tasks sx_* + Giao việc SX.
 * Idempotent: không nhân đôi nhiệm vụ đã có (theo title + stage_slug).
 */
async function applyProductionTemplatesOnPipelineEnter({
  projectId,
  pipelineStageId,
  userId,
  req = null,
}) {
  if (!projectId || !pipelineStageId || !userId) {
    return { created: 0, synced_assignments: 0, reason: 'missing_params' };
  }

  const { data: project } = await supabase
    .from('projects')
    .select('id, company_id, workshop_type_id')
    .eq('id', projectId)
    .maybeSingle();
  if (!project?.id) return { created: 0, synced_assignments: 0, reason: 'no_project' };

  const { data: deals } = await supabase
    .from('crm_leads')
    .select('id')
    .eq('project_id', projectId)
    .eq('type', 'deal')
    .order('created_at', { ascending: true })
    .limit(1);
  const leadId = deals?.[0]?.id || null;
  if (!leadId) return { created: 0, synced_assignments: 0, reason: 'no_deal' };

  let templates = [];
  const tplRes = await fetchProductionTemplatesForPipelineStage(supabase, {
    companyId: project.company_id,
    workshopTypeId: project.workshop_type_id,
    pipelineStageId,
  });
  if (tplRes.error) throw tplRes.error;
  templates = tplRes.data || [];
  if (!templates.length) {
    return {
      created: 0,
      synced_assignments: 0,
      reason: 'no_templates_for_stage',
      pipeline_stage_id: pipelineStageId,
    };
  }

  const handoverCache = new Map();
  const ownerCompanyId = project.company_id || null;

  const templateIds = templates.map((t) => t.id).filter(Boolean);
  const fetchItemsPipe = async (cols) => supabase
    .from('workshop_task_template_items')
    .select(cols)
    .in('template_id', templateIds)
    .order('template_id')
    .order('order_index');
  let { data: items, error: itemErr } = await fetchItemsPipe(SX_TEMPLATE_ITEM_COLS_FULL);
  if (itemErr && isSxTemplateEvidenceColumnError(itemErr)) {
    ({ data: items, error: itemErr } = await fetchItemsPipe(SX_TEMPLATE_ITEM_COLS_LEGACY));
  }
  if (itemErr && isExecutorColumnError(itemErr)) {
    ({ data: items, error: itemErr } = await fetchItemsPipe(SX_TEMPLATE_ITEM_COLS_MIN));
  }
  if (itemErr && String(itemErr.message || '').includes('blocks_stage_advance')) {
    ({ data: items, error: itemErr } = await fetchItemsPipe(
      'id, template_id, title, description, priority, deadline_days, order_index, checklist',
    ));
  }
  if (itemErr) throw itemErr;
  if (!items?.length) {
    return {
      created: 0,
      synced_assignments: 0,
      reason: 'empty_templates',
      template_count: templates.length,
      pipeline_stage_id: pipelineStageId,
    };
  }

  const normalizeSxTaskText = (raw) =>
    String(raw || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  const sxTaskFingerprint = (title, stageSlug) =>
    `${normalizeSxTaskText(title)}|${String(stageSlug || '').trim()}`;

  const { data: existingSx } = await supabase
    .from('crm_tasks')
    .select('title, stage_slug')
    .eq('lead_id', leadId)
    .like('stage_slug', 'sx_%');
  const existingKeys = new Set(
    (existingSx || []).map((t) => sxTaskFingerprint(t.title, t.stage_slug)),
  );

  const slugByTemplateName = (nameRaw) => {
    const t = normalizeSxTaskText(nameRaw);
    if (t.includes('tiep nhan')) return 'sx_tiep_nhan';
    if (t.includes('thiet ke') || t.includes('len ke hoach')) return 'sx_thiet_ke_ke_hoach';
    if (t.includes('kiem tra cheo')) return 'sx_kiem_tra_cheo';
    if (t.includes('vat tu')) return 'sx_vat_tu';
    if (t.includes('san xuat thung')) return 'sx_san_xuat_thung';
    if (t.includes('san xuat alu')) return 'sx_san_xuat_alu';
    if (t.includes('hoan thien')) return 'sx_hoan_thien';
    if (t.includes('dong goi')) return 'sx_dong_goi';
    if (t.includes('giao hang')) return 'sx_giao_hang';
    return 'sx_other';
  };

  const stageSlugByTemplateId = new Map(
    templates.filter((t) => t?.id).map((t) => [String(t.id), slugByTemplateName(t.name)]),
  );
  const templateOrder = new Map(templateIds.map((id, idx) => [String(id), idx]));
  const sortedItems = [...items].sort((a, b) => {
    const ta = templateOrder.get(String(a.template_id)) ?? 9999;
    const tb = templateOrder.get(String(b.template_id)) ?? 9999;
    if (ta !== tb) return ta - tb;
    return (Number(a.order_index) || 0) - (Number(b.order_index) || 0);
  });

  const inserts = [];
  for (let idx = 0; idx < sortedItems.length; idx++) {
    const it = sortedItems[idx];
    const checklist = toCrmChecklist(it.checklist);
    const stageSlug = stageSlugByTemplateId.get(String(it.template_id)) || 'sx_other';
    const execCo = resolveExecutorCompanyId(it, ownerCompanyId);
    const maps = await loadHandoverMapsCached(handoverCache, execCo);
    const row = {
      lead_id: leadId,
      title: it.title,
      checklist,
      description: (it.description || '').trim() || null,
      status: 'pending',
      priority: it.priority || 'medium',
      stage_slug: stageSlug,
      order_index: Number.isFinite(Number(it.order_index)) ? Number(it.order_index) : (idx + 1),
      assignee_id: resolveSxAssigneeForTemplateItem(it, maps),
      supervisor_id: null,
      deadline: null,
      created_by: userId,
      blocks_stage_advance: !!it.blocks_stage_advance,
      ...sxEvidenceFieldsFromTemplateItem(it),
      ...sxExecutorFieldsFromTemplateItem(it, ownerCompanyId),
      production_pipeline_stage_id: pipelineStageId,
    };
    if (!existingKeys.has(sxTaskFingerprint(row.title, row.stage_slug))) inserts.push(row);
  }

  if (!inserts.length) {
    return {
      created: 0,
      synced_assignments: 0,
      reason: 'no_missing_sx_tasks',
      template_count: templates.length,
      pipeline_stage_id: pipelineStageId,
    };
  }

  let insErr = (await supabase.from('crm_tasks').insert(inserts)).error;
  if (insErr && String(insErr.message || '').includes('production_pipeline_stage_id')) {
    const stripped = inserts.map(({ production_pipeline_stage_id: _p, ...rest }) => rest);
    insErr = (await supabase.from('crm_tasks').insert(stripped)).error;
  }
  if (insErr && String(insErr.message || '').includes('blocks_stage_advance')) {
    const stripped = inserts.map(({ blocks_stage_advance: _b, production_pipeline_stage_id: _p, ...rest }) => rest);
    insErr = (await supabase.from('crm_tasks').insert(stripped)).error;
  }
  if (insErr && isSxTemplateEvidenceColumnError(insErr)) {
    const stripped = inserts.map(({
      completion_requires_file_or_note: _c,
      required_evidence_file_types: _r,
      requires_quick_verdict: _q,
      ...rest
    }) => rest);
    insErr = (await supabase.from('crm_tasks').insert(stripped)).error;
  }
  if (insErr && isExecutorColumnError(insErr)) {
    const stripped = inserts.map(({ executor_company_id: _e, ...rest }) => rest);
    insErr = (await supabase.from('crm_tasks').insert(stripped)).error;
  }
  if (insErr && String(insErr.message || '').toLowerCase().includes('checklist')) {
    const stripped = inserts.map(({ checklist: _c, ...rest }) => rest);
    insErr = (await supabase.from('crm_tasks').insert(stripped)).error;
  }
  if (insErr) throw insErr;

  const { data: createdTasks } = await supabase
    .from('crm_tasks')
    .select('id, lead_id, title, description, status, priority, deadline, stage_slug, assignee_id, completed_at, executor_company_id')
    .eq('lead_id', leadId)
    .like('stage_slug', 'sx_%')
    .order('created_at', { ascending: false })
    .limit(inserts.length);

  const syncReq = req || { user: { userId } };
  let syncedAssignments = 0;
  const createdTitles = new Set(inserts.map((r) => sxTaskFingerprint(r.title, r.stage_slug)));
  for (const task of createdTasks || []) {
    if (!createdTitles.has(sxTaskFingerprint(task.title, task.stage_slug))) continue;
    if (!task.assignee_id) continue;
    try {
      const r0 = await syncAssignmentFromCrmTask(syncReq, task, [task.assignee_id], { assignmentModule: 'production' });
      if (r0?.assignmentId) syncedAssignments += 1;
    } catch (e) {
      console.warn('[applyProductionTemplatesOnPipelineEnter] sync assignment:', e.message);
    }
  }

  return {
    created: inserts.length,
    synced_assignments: syncedAssignments,
    reason: 'ok',
    template_count: templates.length,
    template_names: templates.map((t) => t.name).filter(Boolean),
    pipeline_stage_id: pipelineStageId,
    lead_id: leadId,
  };
}

module.exports = {
  ORDER_PHASES,
  nextDhCode,
  findMasterDealForProject,
  createChildOrderOnProject,
  createFulfillmentChildDeal,
  ensureDefaultOrderOneForProject,
  pushOrderToLogistics,
  resolveVcIntakeStageId,
  applyProductionTemplateToFulfillmentLead,
  applyProductionTemplatesOnPipelineEnter,
  migrateDealInternalsToFulfillmentLead,
  syncExistingCrmOrdersToProject,
  scheduleNextSxCrmTaskAfterComplete,
};
