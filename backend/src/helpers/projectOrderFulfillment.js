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

async function findMasterDealForProject(projectId) {
  const { data: rows } = await supabase
    .from('crm_leads')
    .select('id, title, customer_id, company_id, pipeline_id, stage_id, assigned_to, lead_owner_id, estimated_value, parent_lead_id')
    .eq('project_id', projectId)
    .eq('type', 'deal')
    .order('created_at', { ascending: true });
  const list = rows || [];
  return list.find((d) => !d.parent_lead_id) || list[0] || null;
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
  const title = `${(parentDeal.title || 'Deal').trim()} — ${(displayLabel || 'Đơn').trim()}`;
  const { data, error } = await supabase
    .from('crm_leads')
    .insert({
      code,
      title,
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
    .select('id, project_id, fulfillment_lead_id, logistics_project_id, display_label, code, title, total')
    .eq('id', orderId)
    .single();
  if (oErr || !order) throw new Error('Không tìm thấy đơn hàng');
  if (String(order.project_id) !== String(projectId)) {
    throw new Error('Đơn không thuộc dự án này');
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

module.exports = {
  ORDER_PHASES,
  nextDhCode,
  findMasterDealForProject,
  createFulfillmentChildDeal,
  pushOrderToLogistics,
  resolveVcIntakeStageId,
};
