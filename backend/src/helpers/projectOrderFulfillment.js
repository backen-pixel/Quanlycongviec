const { supabase } = require('../config/supabase');
const { getCrmVcDeliveryStageId } = require('./workshopKanban');
const { validateProductionCompanyId } = require('./productionCompanyGate');

const ORDER_PHASES = ['draft', 'confirmed', 'in_production', 'ready_logistics', 'in_logistics', 'completed'];

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
}) {
  if (!leadId || !createdBy) return { created: 0, reason: 'missing_params' };

  const { count: existingCount, error: exErr } = await supabase
    .from('crm_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('lead_id', leadId)
    .like('stage_slug', 'sx_%');
  if (exErr) throw exErr;
  if ((existingCount || 0) > 0) {
    if (!force) return { created: 0, reason: 'already_has_sx_tasks' };
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

  if (requireTemplateCompanyMatch) {
    const mustCompanyId = dealCompanyId || leadRow?.company_id || null;
    if (!mustCompanyId) return { created: 0, reason: 'missing_deal_company' };

    // Strict mode: chỉ lấy template đúng company_id của deal (không global fallback).
    let { data: templates, error: tplErr } = await supabase
      .from('workshop_task_templates')
      .select('id, name, is_default, order_index, company_id')
      .eq('workshop_area', 'production')
      .eq('is_active', true)
      .eq('company_id', mustCompanyId)
      .order('order_index', { ascending: true });
    if (tplErr?.message?.includes('order_index')) {
      const r2 = await supabase
        .from('workshop_task_templates')
        .select('id, name, is_default, company_id')
        .eq('workshop_area', 'production')
        .eq('is_active', true)
        .eq('company_id', mustCompanyId);
      templates = r2.data;
      tplErr = r2.error;
    }
    if (tplErr) throw tplErr;
    if (!templates?.length) return { created: 0, reason: 'no_production_templates_for_deal_company', company_id: mustCompanyId };

    const templateIds = templates.map((t) => t.id).filter(Boolean);
    const { data: items, error: itemErr } = await supabase
      .from('workshop_task_template_items')
      .select('template_id, title, description, priority, order_index, checklist')
      .in('template_id', templateIds)
      .order('template_id')
      .order('order_index');
    if (itemErr) throw itemErr;
    if (!items?.length) return { created: 0, reason: 'template_items_empty', company_id: mustCompanyId };

    const normalizeText = (raw) => String(raw || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

    const slugByTemplateName = (nameRaw) => {
      const t = normalizeText(nameRaw);
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
      (templates || [])
        .filter((t) => t?.id)
        .map((t) => [String(t.id), slugByTemplateName(t.name)]),
    );
    const templateOrder = new Map(templateIds.map((id, idx) => [String(id), idx]));
    const sortedItems = [...items].sort((a, b) => {
      const ta = templateOrder.get(String(a.template_id)) ?? 9999;
      const tb = templateOrder.get(String(b.template_id)) ?? 9999;
      if (ta !== tb) return ta - tb;
      return (Number(a.order_index) || 0) - (Number(b.order_index) || 0);
    });

    const inserts = sortedItems.map((it, idx) => {
      const checklist = Array.isArray(it.checklist) ? it.checklist.filter(Boolean) : [];
      const checklistText = checklist.length
        ? `\n\nNhiệm vụ nhỏ:\n${checklist.map((x, i) => `${i + 1}. ${x}`).join('\n')}`
        : '';
      const stageSlug = stageSlugByTemplateId.get(String(it.template_id)) || 'sx_other';
      return {
        lead_id: leadId,
        title: it.title,
        description: `${it.description || ''}${checklistText}`.trim() || null,
        status: 'pending',
        priority: it.priority || 'medium',
        stage_slug: stageSlug,
        order_index: Number.isFinite(Number(it.order_index)) ? Number(it.order_index) : (idx + 1),
        assignee_id: assigneeId || null,
        supervisor_id: null,
        deadline: null,
        created_by: createdBy,
      };
    });

    const { error: insErr } = await supabase.from('crm_tasks').insert(inserts);
    if (insErr) throw insErr;
    return {
      created: inserts.length,
      reason: 'ok',
      template_count: templates.length,
      template_names: templates.map((t) => t.name).filter(Boolean),
      company_id: mustCompanyId,
    };
  }

  // Ưu tiên xác định "công ty SX" để lấy đúng bộ mẫu theo công ty:
  // 1) orders.sx_company_id (đơn đã chuyển SX)
  // 2) projects.company_id (dự án xưởng)
  // 3) leadRow.company_id (công ty CRM) — chỉ dùng nếu thuộc module SX
  let targetCompanyId = null;
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

  if (!targetCompanyId && leadRow?.project_id) {
    const { data: p } = await supabase
      .from('projects')
      .select('company_id')
      .eq('id', leadRow.project_id)
      .maybeSingle();
    if (p?.company_id) targetCompanyId = p.company_id;
  }

  if (!targetCompanyId && leadRow?.company_id) targetCompanyId = leadRow.company_id;

  // Chỉ "scope theo công ty" khi company thuộc module SX; nếu không thì fallback sang template global.
  if (targetCompanyId) {
    const co = await validateProductionCompanyId(targetCompanyId);
    if (!co.ok) targetCompanyId = null;
  }

  const fetchTemplates = async (companyMode) => {
    let q = supabase
      .from('workshop_task_templates')
      .select('id, name, is_default, order_index, company_id')
      .eq('workshop_area', 'production')
      .eq('is_active', true);
    if (companyMode === 'scoped' && targetCompanyId) q = q.eq('company_id', targetCompanyId);
    if (companyMode === 'global') q = q.is('company_id', null);
    q = q.order('order_index', { ascending: true });
    const r = await q;
    if (r.error?.message?.includes('order_index')) {
      let q2 = supabase
        .from('workshop_task_templates')
        .select('id, name, is_default, company_id')
        .eq('workshop_area', 'production')
        .eq('is_active', true);
      if (companyMode === 'scoped' && targetCompanyId) q2 = q2.eq('company_id', targetCompanyId);
      if (companyMode === 'global') q2 = q2.is('company_id', null);
      return await q2;
    }
    return r;
  };

  let { data: templates, error: tplErr } = await fetchTemplates('scoped');
  if (tplErr) throw tplErr;
  if (!templates?.length) {
    const g = await fetchTemplates('global');
    templates = g.data;
    tplErr = g.error;
  }
  if (tplErr) throw tplErr;
  if (!templates?.length) return { created: 0, reason: 'no_production_templates_for_company' };

  const templateIds = templates.map((t) => t.id).filter(Boolean);
  const { data: items, error: itemErr } = await supabase
    .from('workshop_task_template_items')
    .select('template_id, title, description, priority, order_index, checklist')
    .in('template_id', templateIds)
    .order('template_id')
    .order('order_index');
  if (itemErr) throw itemErr;
  if (!items?.length) return { created: 0, reason: 'template_items_empty' };

  const normalizeText = (raw) => String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  // Map stage slug theo TÊN BỘ MẪU (template.name), không theo title của item.
  // Vì item title thường là việc nhỏ (vd "Xác nhận thông tin đơn hàng") không chứa tên giai đoạn.
  const slugByTemplateName = (nameRaw) => {
    const t = normalizeText(nameRaw);
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
    (templates || [])
      .filter((t) => t?.id)
      .map((t) => [String(t.id), slugByTemplateName(t.name)]),
  );

  const templateOrder = new Map(templateIds.map((id, idx) => [String(id), idx]));
  const sortedItems = [...items].sort((a, b) => {
    const ta = templateOrder.get(String(a.template_id)) ?? 9999;
    const tb = templateOrder.get(String(b.template_id)) ?? 9999;
    if (ta !== tb) return ta - tb;
    return (Number(a.order_index) || 0) - (Number(b.order_index) || 0);
  });

  const inserts = sortedItems.map((it, idx) => {
    const checklist = Array.isArray(it.checklist) ? it.checklist.filter(Boolean) : [];
    const checklistText = checklist.length
      ? `\n\nNhiệm vụ nhỏ:\n${checklist.map((x, i) => `${i + 1}. ${x}`).join('\n')}`
      : '';
    const stageSlug = stageSlugByTemplateId.get(String(it.template_id)) || 'sx_other';
    return {
      lead_id: leadId,
      title: it.title,
      description: `${it.description || ''}${checklistText}`.trim() || null,
      status: 'pending',
      priority: it.priority || 'medium',
      stage_slug: stageSlug,
      order_index: Number.isFinite(Number(it.order_index)) ? Number(it.order_index) : (idx + 1),
      assignee_id: assigneeId || null,
      supervisor_id: null,
      deadline: null,
      created_by: createdBy,
    };
  });

  const { error: insErr } = await supabase.from('crm_tasks').insert(inserts);
  if (insErr) throw insErr;
  return {
    created: inserts.length,
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
async function ensureDefaultOrderOneForProject({ projectId, userId, defaultLabel = 'Đơn 1' }) {
  if (!projectId || !userId) {
    return { created: false, reason: 'missing params' };
  }
  const { data: anyOrder, error: cErr } = await supabase
    .from('orders')
    .select('id')
    .eq('project_id', projectId)
    .limit(1);
  if (cErr) {
    console.warn('[ensureDefaultOrderOneForProject] query orders', cErr.message);
    return { created: false, reason: cErr.message };
  }
  if (anyOrder?.length) {
    return { created: false, reason: 'already_has_orders' };
  }
  if (!(await findMasterDealForProject(projectId))) {
    return { created: false, reason: 'no_parent_crm_lead' };
  }
  try {
    const master = await findMasterDealForProject(projectId);
    const orderTitle =
      master?.title && String(master.title).trim()
        ? `${String(master.title).trim()} — ${defaultLabel}`
        : master?.code
          ? `${String(master.code).trim()} — ${defaultLabel}`
          : defaultLabel;
    const order = await createChildOrderOnProject({
      projectId,
      userId,
      displayLabel: defaultLabel,
      title: orderTitle,
      total: 0,
    });
    try {
      await supabase.from('activity_logs').insert({
        user_id: userId, action: 'created', entity_type: 'order', entity_id: order.id,
        description: `Hệ thống tạo sẵn ${defaultLabel} (đơn hàng & nhiệm vụ đầu) trên dự án ${projectId}`,
      });
    } catch (_) { /* bảng optional */ }
    if (master?.id) {
      try {
        await supabase.from('crm_activities').insert({
          lead_id: master.id, type: 'note',
          title: `📦 ${defaultLabel} (tự động)`,
          description: `Hệ thống tạo sẵn bộ nhiệm vụ từng lượt — **${defaultLabel}**. Thêm **Đơn 2, 3…** khi có đợt bàn giao mới.`,
          created_by: userId,
        });
      } catch (_) { /* optional */ }
    }
    return { created: true, order };
  } catch (e) {
    console.warn('[ensureDefaultOrderOneForProject]', e.message);
    return { created: false, reason: e.message || 'create_failed' };
  }
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
  migrateDealInternalsToFulfillmentLead,
  syncExistingCrmOrdersToProject,
};
