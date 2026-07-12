// ═══════════════════════════════════════════════════════════════════════════
// AUTO-FLOW ENGINE v2: Tự động hóa TOÀN BỘ luồng CRM ↔ Công việc
// ═══════════════════════════════════════════════════════════════════════════
//
// LUỒNG TỰ ĐỘNG:
// 1. Lead chốt (is_won)      → Auto tạo Project + Gen Tasks
// 2. BG chấp nhận (accepted)  → Tạo dự án nếu lead chưa có (không tạo đơn hàng)
// 3. ĐH xác nhận (confirmed) → Auto tạo Project (nếu chưa có) + Gen Tasks
// 4. Project chuyển stage     → Sync ĐH status (SX → processing, Giao → shipped...)
// 5. Project hoàn thành       → Auto tạo Hóa đơn từ ĐH chưa xuất HĐ
// 6. Follow-up quá hạn        → API cảnh báo
// 7. Task hoàn thành hết       → Suggest advance project stage
//
// TẤT CẢ liên kết qua: lead_id, project_id, order_id, quotation_id, customer_id
// ═══════════════════════════════════════════════════════════════════════════

const { supabase } = require('../config/supabase');
// ─── HELPERS ─────────────────────────────────────────────────────────────

async function nextCode(prefix) {
  const year = new Date().getFullYear();
  const { data } = await supabase.from('code_sequences').select('current_number, year').eq('prefix', prefix).single();
  let num = 1;
  if (data) {
    num = data.year === year ? (data.current_number || 0) + 1 : 1;
    await supabase.from('code_sequences').update({ current_number: num, year }).eq('prefix', prefix);
  } else {
    await supabase.from('code_sequences').insert({ prefix, current_number: 1, year });
  }
  return `${prefix}-${year}-${String(num).padStart(3, '0')}`;
}

async function nextProjectCode() {
  const yr = new Date().getFullYear();
  const { data } = await supabase.from('projects').select('code').like('code', `TB-${yr}-%`).order('code', { ascending: false }).limit(1);
  const lastNum = data?.[0]?.code ? parseInt(data[0].code.split('-').pop()) : 0;
  return `TB-${yr}-${String(lastNum + 1).padStart(3, '0')}`;
}

async function getDefaultFlow() {
  const { data } = await supabase.from('workflow_flows').select('id').limit(1);
  return data?.[0]?.id || null;
}

async function getFirstStage() {
  const { data } = await supabase.from('workflow_stages')
    .select('id').is('company_id', null).eq('is_active', true)
    .order('order_index').limit(1).single();
  return data?.id || null;
}

// ─── 1. LEAD CHỐT → AUTO PROJECT + TASKS ────────────────────────────────

async function onLeadWon(leadId, userId) {
  const { data: lead } = await supabase.from('crm_leads')
    .select('*, customer:customers(id, full_name), type')
    .eq('id', leadId).single();
  if (!lead) return null;

  // For deals that reached "Thắng" stage, just log (no project creation, project already exists)
  if (lead.type === 'deal') {
    await supabase.from('crm_activities').insert({
      lead_id: leadId, type: 'note', title: '🎉 Deal Thắng!',
      description: `Deal chốt thành công`,
      created_by: userId,
    }).catch(() => {});
    return { code: lead.project_id ? 'existing' : null, existing: true };
  }

  // For leads (backwards compatibility): this should not be called for leads with new flow
  // Links existing quotations/orders to project if lead was converted
  let project = null;
  if (lead.project_id) {
    const { data: p } = await supabase.from('projects').select('*').eq('id', lead.project_id).single();
    project = p;
  }

  if (project) {
    await Promise.all([
      supabase.from('quotations').update({ project_id: project.id }).eq('lead_id', leadId).is('project_id', null),
      supabase.from('orders').update({ project_id: project.id }).eq('lead_id', leadId).is('project_id', null),
    ]);
  }

  await supabase.from('crm_activities').insert({
    lead_id: leadId, type: 'note', title: '🎉 Chốt thành công!',
    description: `Lead chốt deal${project ? ' — DA: ' + project.code : ''}`,
    created_by: userId,
  }).catch(() => {});

  return project;
}

async function createProjectFromLead(lead, userId, overrideFlowId) {
  const [defaultFlowId, firstStageId, code] = await Promise.all([getDefaultFlow(), getFirstStage(), nextProjectCode()]);
  const flowId = overrideFlowId || lead.flow_id || defaultFlowId;

  const { data: project, error } = await supabase.from('projects').insert({
    code, name: lead.title, status: 'consulting', customer_id: lead.customer_id,
    estimated_value: lead.estimated_value, flow_id: flowId,
    current_stage_id: firstStageId, created_by: userId,
  }).select('*').single();
  if (error) throw error;

  // Link lead to project
  await supabase.from('crm_leads').update({ project_id: project.id, updated_at: new Date().toISOString() }).eq('id', lead.id);

  try {
    const { ensureDealLeadDocumentsForModuleTransition } = require('./ensureDealLeadDocumentsForModuleTransition');
    await ensureDealLeadDocumentsForModuleTransition({ leadId: lead.id, projectId: project.id });
  } catch (e) {
    console.warn('[createProjectFromLead] ensure lead_documents:', e.message);
  }

  // Auto create tasks for Tư vấn stage using stageFlow
  let stageFlow = null;
  try { stageFlow = require('./stageFlow'); } catch {}
  if (stageFlow && firstStageId) {
    try {
      await stageFlow.createStageTasksFromFlow(project.id, firstStageId, 'consulting', userId, null);
    } catch (e) { console.error('Auto tasks consulting:', e.message); }
  }

  // NOTE: Không tự tạo Đơn 1/2/... từ deal/project. Đơn hàng chỉ tạo thủ công tại tab Đơn hàng.

  return project;
}

// ─── 2. BÁO GIÁ CHẤP NHẬN → DỰ ÁN (không tạo đơn hàng) ───────────────

async function createProjectFromAcceptedQuotation(quote, userId) {
  if (!quote?.lead_id) return null;
  const { data: lead } = await supabase.from('crm_leads').select('project_id').eq('id', quote.lead_id).single();
  if (!lead) return null;
  if (lead.project_id) {
    await supabase
      .from('quotations')
      .update({ project_id: lead.project_id, updated_at: new Date().toISOString() })
      .eq('id', quote.id)
      .is('project_id', null);
    return { id: lead.project_id, code: 'existing', existing: true };
  }

  const [flowId, firstStageId, code] = await Promise.all([getDefaultFlow(), getFirstStage(), nextProjectCode()]);
  const { data: project, error } = await supabase
    .from('projects')
    .insert({
      code,
      name: quote.title || `Báo giá ${quote.code}`,
      status: 'active',
      customer_id: quote.customer_id,
      estimated_value: quote.total,
      flow_id: flowId,
      current_stage_id: firstStageId,
      created_by: userId,
    })
    .select('*')
    .single();
  if (error) throw error;

  await supabase.from('orders').update({ project_id: project.id }).eq('lead_id', quote.lead_id).is('project_id', null);
  await supabase.from('crm_leads').update({ project_id: project.id, updated_at: new Date().toISOString() }).eq('id', quote.lead_id);
  await supabase.from('quotations').update({ project_id: project.id, updated_at: new Date().toISOString() }).eq('id', quote.id);

  await generateTasksForProject(project.id, userId);
  return project;
}

async function onQuotationAccepted(quotationId, userId) {
  const { data: quote } = await supabase.from('quotations').select('*').eq('id', quotationId).single();
  if (!quote) return null;

  let autoProject = null;
  if (quote.lead_id) {
    const { data: lead } = await supabase.from('crm_leads').select('project_id').eq('id', quote.lead_id).single();
    if (lead && !lead.project_id) {
      autoProject = await createProjectFromAcceptedQuotation(quote, userId);
    }
  }

  return { order: null, autoProject };
}

// ─── 3. ĐƠN HÀNG XÁC NHẬN → AUTO PROJECT ──────────────────────────────

async function onOrderConfirmed(orderId, userId) {
  const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).single();
  if (!order || order.project_id) return null;

  // Check lead đã có project chưa
  if (order.lead_id) {
    const { data: lead } = await supabase.from('crm_leads').select('project_id').eq('id', order.lead_id).single();
    if (lead?.project_id) {
      await supabase.from('orders').update({ project_id: lead.project_id }).eq('id', orderId);
      return { id: lead.project_id, code: 'existing', existing: true };
    }
  }

  // Tạo project mới
  const [flowId, firstStageId, code] = await Promise.all([getDefaultFlow(), getFirstStage(), nextProjectCode()]);

  const { data: project } = await supabase.from('projects').insert({
    code, name: order.title || `Đơn hàng ${order.code}`,
    status: 'active', customer_id: order.customer_id,
    estimated_value: order.total, flow_id: flowId,
    current_stage_id: firstStageId, created_by: userId,
  }).select('*').single();

  // Link
  await supabase.from('orders').update({ project_id: project.id }).eq('id', orderId);
  if (order.lead_id) {
    await supabase.from('crm_leads').update({ project_id: project.id }).eq('id', order.lead_id);
    await supabase.from('quotations').update({ project_id: project.id }).eq('lead_id', order.lead_id);
  }

  await generateTasksForProject(project.id, userId);
  return project;
}

// ─── 4. PROJECT CHUYỂN STAGE → SYNC ĐH STATUS ──────────────────────────

async function onProjectStageChanged(projectId, newStageId) {
  // Lấy slug của stage mới
  const { data: stage } = await supabase.from('workflow_stages')
    .select('slug').eq('id', newStageId).single();
  if (!stage?.slug) return;

  const prefix = stage.slug.split('-')[0];
  const STAGE_TO_ORDER = {
    'consulting': 'confirmed', 'design': 'confirmed', 'quotation': 'confirmed',
    'contract': 'confirmed', 'production': 'processing',
    'shipping': 'shipped', 'installation': 'delivered',
  };

  const orderStatus = STAGE_TO_ORDER[prefix];
  if (!orderStatus) return;

  // Update tất cả ĐH của project này
  const { data: orders } = await supabase.from('orders')
    .select('id, status').eq('project_id', projectId)
    .neq('status', 'cancelled');

  for (const order of (orders || [])) {
    // Chỉ tiến lên, không lùi
    const ORDER_RANK = { draft: 0, confirmed: 1, processing: 2, shipped: 3, delivered: 4 };
    if ((ORDER_RANK[orderStatus] || 0) > (ORDER_RANK[order.status] || 0)) {
      const updates = { status: orderStatus, updated_at: new Date().toISOString() };
      if (orderStatus === 'processing') updates.processing_at = new Date().toISOString();
      if (orderStatus === 'shipped') updates.shipped_at = new Date().toISOString();
      if (orderStatus === 'delivered') updates.delivered_at = new Date().toISOString();
      await supabase.from('orders').update(updates).eq('id', order.id);
    }
  }

  return orderStatus;
}

// ─── 5. PROJECT HOÀN THÀNH → AUTO TẠO HÓA ĐƠN ─────────────────────────

async function onProjectCompleted(projectId, userId) {
  // Lấy ĐH của project chưa có HĐ
  const { data: orders } = await supabase.from('orders')
    .select('*').eq('project_id', projectId).neq('status', 'cancelled');

  const { data: existingInvoices } = await supabase.from('invoices')
    .select('order_id').eq('project_id', projectId);

  const invoicedOrderIds = new Set((existingInvoices || []).map(i => i.order_id).filter(Boolean));
  const uninvoicedOrders = (orders || []).filter(o => !invoicedOrderIds.has(o.id));

  if (!uninvoicedOrders.length) return [];

  const created = [];
  for (const order of uninvoicedOrders) {
    const invCode = await nextCode('HD');
    const { data: oItems } = await supabase.from('order_items').select('*').eq('order_id', order.id);

    const { data: invoice } = await supabase.from('invoices').insert({
      code: invCode, order_id: order.id, project_id: projectId,
      customer_id: order.customer_id, customer_name: order.customer_name,
      customer_phone: order.customer_phone, customer_address: order.customer_address,
      customer_tax_code: order.customer_tax_code,
      title: order.title, subtotal: order.subtotal,
      discount_type: order.discount_type, discount_value: order.discount_value,
      discount_amount: order.discount_amount, tax_rate: order.tax_rate,
      tax_amount: order.tax_amount, total: order.total,
      created_by: userId,
    }).select('*').single();

    if (oItems?.length) {
      const iItems = oItems.map(oi => ({
        invoice_id: invoice.id, product_id: oi.product_id, order_item_id: oi.id,
        item_order: oi.item_order, name: oi.name, description: oi.description,
        unit: oi.unit, quantity: oi.quantity, unit_price: oi.unit_price,
        discount_percent: oi.discount_percent, amount: oi.amount,
      }));
      await supabase.from('invoice_items').insert(iItems);
    }

    // Update order: delivered
    await supabase.from('orders').update({ status: 'delivered', delivered_at: new Date().toISOString() }).eq('id', order.id);

    created.push(invoice);
  }

  return created;
}

// ─── 6. FOLLOW-UP CẢNH BÁO ─────────────────────────────────────────────

async function getOverdueFollowUps() {
  const now = new Date().toISOString();
  const { data } = await supabase.from('crm_leads')
    .select('id, code, title, type, next_follow_up, customer:customers(full_name), assignee:users!crm_leads_assigned_to_fkey(full_name), stage:crm_pipeline_stages!crm_leads_stage_id_fkey(name, icon, is_won, is_lost)')
    .eq('type', 'lead')               // chỉ lead, không deal
    .lt('next_follow_up', now)
    .is('actual_close_date', null);    // chưa chốt

  // Loại lead đã thắng (chuyển deal) hoặc đã thua (mất)
  return (data || []).filter(l => !l.stage?.is_won && !l.stage?.is_lost);
}

async function getStaleLeads(daysSinceActivity = 7) {
  const cutoff = new Date(Date.now() - daysSinceActivity * 86400000).toISOString();
  const { data } = await supabase.from('crm_leads')
    .select('id, code, title, type, last_activity_at, customer:customers(full_name), assignee:users!crm_leads_assigned_to_fkey(full_name), stage:crm_pipeline_stages!crm_leads_stage_id_fkey(name, icon, is_won, is_lost)')
    .eq('type', 'lead')               // chỉ lead, không deal
    .or(`last_activity_at.lt.${cutoff},last_activity_at.is.null`)
    .is('actual_close_date', null);

  return (data || []).filter(l => !l.stage?.is_won && !l.stage?.is_lost);
}

// ─── 7. GEN TASKS TỪ TEMPLATE ──────────────────────────────────────────

async function generateTasksForProject(projectId, userId) {
  const { data: templateSets } = await supabase.from('company_template_sets')
    .select('id').eq('is_default', true).limit(1);
  const setId = templateSets?.[0]?.id;
  if (!setId) return 0;

  const { data: templates } = await supabase.from('company_template_tasks')
    .select('*').eq('template_set_id', setId).order('order_index');
  if (!templates?.length) return 0;

  const { data: stages } = await supabase.from('workflow_stages')
    .select('id, slug, name, order_index').is('company_id', null).eq('is_active', true)
    .order('order_index');

  const tasks = templates.map(t => {
    const stage = stages?.find(s => s.id === t.stage_id) || stages?.[0];
    return {
      project_id: projectId, title: t.title, description: t.description,
      stage_id: stage?.id, priority: t.priority || 'medium',
      status: 'todo', created_by: userId,
    };
  });

  if (tasks.length) await supabase.from('tasks').insert(tasks);
  return tasks.length;
}

// ─── 8. PROJECT CRM SUMMARY ────────────────────────────────────────────

async function getProjectCRMSummary(projectId) {
  const [leads, quotes, orders, invoices] = await Promise.all([
    supabase.from('crm_leads').select('id, code, title, estimated_value, stage_id, stage:crm_pipeline_stages!crm_leads_stage_id_fkey(name, icon, is_won)').eq('project_id', projectId),
    supabase.from('quotations').select('id, code, title, total, status').eq('project_id', projectId),
    supabase.from('orders').select('id, code, title, total, status, paid_amount').eq('project_id', projectId),
    supabase.from('invoices').select('id, code, title, total, paid_amount, payment_status').eq('project_id', projectId),
  ]);

  const totalOrders = (orders.data || []).reduce((s, o) => s + (o.total || 0), 0);
  const totalInvoiced = (invoices.data || []).reduce((s, i) => s + (i.total || 0), 0);
  const totalPaid = (invoices.data || []).reduce((s, i) => s + (i.paid_amount || 0), 0);

  return {
    leads: leads.data || [], quotes: quotes.data || [],
    orders: orders.data || [], invoices: invoices.data || [],
    stats: { totalOrders, totalInvoiced, totalPaid,
      totalDebt: totalInvoiced - totalPaid,
      needsInvoice: totalOrders > 0 && totalInvoiced < totalOrders,
      fullyPaid: (totalInvoiced - totalPaid) <= 0 && totalInvoiced > 0 }
  };
}

module.exports = {
  onLeadWon, onQuotationAccepted, onOrderConfirmed,
  onProjectStageChanged, onProjectCompleted,
  getOverdueFollowUps, getStaleLeads,
  generateTasksForProject, getProjectCRMSummary, createProjectFromLead,
};
