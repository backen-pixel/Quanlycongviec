const { supabase } = require('../config/supabase');
const { getCrmVcDeliveryStageId } = require('./workshopKanban');

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

module.exports = {
  ORDER_PHASES,
  nextDhCode,
  findMasterDealForProject,
  createChildOrderOnProject,
  createFulfillmentChildDeal,
  ensureDefaultOrderOneForProject,
  pushOrderToLogistics,
  resolveVcIntakeStageId,
};
