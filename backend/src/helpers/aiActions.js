// ═══════════════════════════════════════════════════════════════════════════
// AI ACTION ENGINE — Thực hiện MỌI thao tác thay con người
// ═══════════════════════════════════════════════════════════════════════════

const { supabase } = require('../config/supabase');

// ─── AUTO CODE GENERATOR ────────────────────────────────────────────────
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

// ─── FIND HELPERS ───────────────────────────────────────────────────────
function findCustomer(name, customers) {
  if (!name) return null;
  const n = name.toLowerCase().trim();
  return customers.find(c => c.name.toLowerCase() === n) ||
    customers.find(c => c.name.toLowerCase().includes(n)) ||
    customers.find(c => n.includes(c.name.toLowerCase()));
}

function findProject(nameOrCode, projects) {
  if (!nameOrCode) return null;
  const n = nameOrCode.toLowerCase().trim();
  return projects.find(p => p.code?.toLowerCase() === n) ||
    projects.find(p => p.name?.toLowerCase().includes(n)) ||
    projects.find(p => n.includes(p.name?.toLowerCase()));
}

function findLead(nameOrCode, leads) {
  if (!nameOrCode) return null;
  const n = nameOrCode.toLowerCase().trim();
  return leads.find(l => l.code?.toLowerCase() === n) ||
    leads.find(l => l.title?.toLowerCase().includes(n)) ||
    leads.find(l => n.includes(l.title?.toLowerCase()));
}

function parseValue(str) {
  if (!str) return 0;
  let v = parseFloat(String(str).replace(/[.,\s]/g, ''));
  const s = String(str).toLowerCase();
  if (s.includes('triệu') || s.includes('tr')) v *= 1000000;
  else if (s.includes('tỷ')) v *= 1000000000;
  else if (s.includes('nghìn') || s.includes('k')) v *= 1000;
  else if (v > 0 && v < 1000) v *= 1000000;
  return isNaN(v) ? 0 : v;
}

const fmt = (n) => new Intl.NumberFormat('vi-VN').format(n || 0);

// ═══════════════════════════════════════════════════════════════════════════
// ALL ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

const ACTIONS = {

  // ─── 1. KHÁCH HÀNG ─────────────────────────────────────────────────────
  create_customer: async ({ name, phone, email, address }, userId) => {
    const { data, error } = await supabase.from('customers').insert({
      full_name: name, phone, email, address, created_by: userId,
    }).select('*').single();
    if (error) throw error;
    return { success: true, message: `✅ Tạo KH: **${data.full_name}**${phone ? ` — ${phone}` : ''}`, data };
  },

  update_customer: async ({ customer_id, updates }) => {
    const map = {};
    if (updates.name) map.full_name = updates.name;
    if (updates.phone) map.phone = updates.phone;
    if (updates.email) map.email = updates.email;
    if (updates.address) map.address = updates.address;
    const { data, error } = await supabase.from('customers').update(map).eq('id', customer_id).select('*').single();
    if (error) throw error;
    return { success: true, message: `✅ Cập nhật KH: **${data.full_name}**`, data };
  },

  // ─── 2. DỰ ÁN ─────────────────────────────────────────────────────────
  create_project: async ({ name, customer_id, estimated_value, template }, userId) => {
    // Auto code like projects route
    const year = new Date().getFullYear();
    const { data: lastP } = await supabase.from('projects').select('code').like('code', `TB-${year}-%`).order('code', { ascending: false }).limit(1);
    const lastNum = lastP?.[0]?.code ? parseInt(lastP[0].code.split('-').pop()) || 0 : 0;
    const code = `TB-${year}-${String(lastNum + 1).padStart(3, '0')}`;

    const { data: flows } = await supabase.from('workflow_flows').select('id').limit(1);
    const { data: firstStage } = await supabase.from('workflow_stages').select('id').eq('slug', 'consulting').single();

    const { data, error } = await supabase.from('projects').insert({
      code, name, status: 'consulting', customer_id: customer_id || null,
      estimated_value: estimated_value || 0,
      flow_id: flows?.[0]?.id, current_stage_id: firstStage?.id || null,
      created_by: userId, priority: 'medium',
    }).select('*').single();
    if (error) throw error;

    if (template !== false) {
      try { const { generateTasksForProject } = require('./autoFlow'); await generateTasksForProject(data.id, userId); } catch {}
    }
    return { success: true, message: `✅ Tạo DA **${code}**: ${name} | ${fmt(estimated_value)}đ`, data, navigate: `/projects/${data.id}` };
  },

  advance_stage: async ({ project_id }) => {
    const { data: proj } = await supabase.from('projects').select('id, code, current_stage_id').eq('id', project_id).single();
    if (!proj) throw new Error('DA không tồn tại');
    const { data: stages } = await supabase.from('workflow_stages').select('id, name, order_index').is('company_id', null).eq('is_active', true).order('order_index');
    const idx = stages.findIndex(s => s.id === proj.current_stage_id);
    const next = stages[idx + 1];
    if (!next) return { success: false, message: `⚠️ ${proj.code} đã ở giai đoạn cuối` };
    await supabase.from('projects').update({ current_stage_id: next.id, updated_at: new Date().toISOString() }).eq('id', project_id);
    return { success: true, message: `✅ **${proj.code}** → **${next.name}**`, navigate: `/projects/${project_id}` };
  },

  // ─── 3. LEAD ───────────────────────────────────────────────────────────
  create_lead: async ({ title, customer_id, estimated_value, source }, userId) => {
    const code = await nextCode('LEAD');
    const { data: pipeStages } = await supabase.from('crm_pipeline_stages').select('id').order('order_index').limit(1);
    const { data, error } = await supabase.from('crm_leads').insert({
      code, title, customer_id: customer_id || null,
      estimated_value: estimated_value || 0, source,
      stage_id: pipeStages?.[0]?.id, created_by: userId,
    }).select('*').single();
    if (error) throw error;
    return { success: true, message: `✅ Tạo lead **${code}**: ${title} | ${fmt(estimated_value)}đ`, data, navigate: `/crm/leads/${data.id}` };
  },

  move_lead: async ({ lead_id, stage_name }) => {
    const { data: stages } = await supabase.from('crm_pipeline_stages').select('id, name, is_won, is_lost').order('order_index');
    const stage = stages.find(s => s.name.toLowerCase().includes(stage_name.toLowerCase()));
    if (!stage) return { success: false, message: `⚠️ Không thấy "${stage_name}". Có: ${stages.map(s => s.name).join(', ')}` };
    const updates = { stage_id: stage.id, updated_at: new Date().toISOString() };
    if (stage.is_won) updates.actual_close_date = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase.from('crm_leads').update(updates).eq('id', lead_id).select('code').single();
    if (error) throw error;
    return { success: true, message: `✅ Lead ${data.code} → **${stage.name}**${stage.is_won ? ' 🎉' : ''}` };
  },

  add_activity: async ({ lead_id, type, note }, userId) => {
    const icons = { call: '📞', meeting: '🤝', email: '📧', zalo: '💬', note: '📝', visit: '🏠' };
    const { error } = await supabase.from('crm_activities').insert({ lead_id, type: type || 'note', note, created_by: userId });
    if (error) throw error;
    return { success: true, message: `${icons[type] || '📝'} Đã ghi: ${note}` };
  },

  // ─── 4. BÁO GIÁ ───────────────────────────────────────────────────────
  create_quotation: async ({ customer_id, customer_name, items, discount_value, discount_type, tax_rate, note }, userId) => {
    const code = await nextCode('BG');
    const qItems = (items || []).map((item, i) => ({
      item_order: i + 1, product_name: item.name || item.product_name || '',
      description: item.description || '', unit: item.unit || 'bộ',
      quantity: item.quantity || 1, unit_price: item.price || item.unit_price || 0,
      amount: (item.quantity || 1) * (item.price || item.unit_price || 0),
    }));
    const subtotal = qItems.reduce((s, i) => s + i.amount, 0);
    const discAmt = (discount_type === 'percent') ? subtotal * (discount_value || 0) / 100 : (discount_value || 0);
    const afterDisc = subtotal - discAmt;
    const taxAmt = afterDisc * (tax_rate || 10) / 100;
    const total = afterDisc + taxAmt;

    const { data, error } = await supabase.from('quotations').insert({
      code, customer_id, customer_name, status: 'draft',
      subtotal, discount_type: discount_type || 'amount', discount_value: discount_value || 0,
      discount_amount: discAmt, tax_rate: tax_rate || 10, tax_amount: taxAmt, total, note, created_by: userId,
    }).select('*').single();
    if (error) throw error;

    if (qItems.length) await supabase.from('quotation_items').insert(qItems.map(i => ({ ...i, quotation_id: data.id })));
    return { success: true, message: `✅ Tạo BG **${code}** | ${qItems.length} SP | Tổng: **${fmt(total)}đ**`, data, navigate: `/crm/quotations/${data.id}` };
  },

  accept_quotation: async ({ quotation_id }, userId) => {
    const { data: q } = await supabase.from('quotations').select('*').eq('id', quotation_id).single();
    if (!q) throw new Error('BG không tồn tại');
    await supabase.from('quotations').update({ status: 'accepted' }).eq('id', quotation_id);

    // Auto tạo ĐH
    const { data: qItems } = await supabase.from('quotation_items').select('*').eq('quotation_id', quotation_id).order('item_order');
    const orderR = await ACTIONS.create_order({ customer_id: q.customer_id, customer_name: q.customer_name, items: qItems, from_quotation_id: quotation_id }, userId);

    return { success: true, message: `✅ BG ${q.code} chấp nhận!\n${orderR.message}`, navigate: orderR.navigate };
  },

  // ─── 5. ĐƠN HÀNG ─────────────────────────────────────────────────────
  create_order: async ({ customer_id, customer_name, items, from_quotation_id }, userId) => {
    const code = await nextCode('DH');
    let orderItems = items || [];
    if (from_quotation_id && !orderItems.length) {
      const { data: qItems } = await supabase.from('quotation_items').select('*').eq('quotation_id', from_quotation_id).order('item_order');
      orderItems = (qItems || []).map(i => ({ product_name: i.product_name, description: i.description, unit: i.unit, quantity: i.quantity, unit_price: i.unit_price, amount: i.amount, item_order: i.item_order }));
    }
    const total = orderItems.reduce((s, i) => s + (i.amount || (i.quantity || 1) * (i.unit_price || 0)), 0);

    const { data, error } = await supabase.from('orders').insert({
      code, customer_id, customer_name, status: 'confirmed',
      total, paid_amount: 0, quotation_id: from_quotation_id || null, created_by: userId,
    }).select('*').single();
    if (error) throw error;

    if (orderItems.length) await supabase.from('order_items').insert(orderItems.map(i => ({ ...i, order_id: data.id })));
    return { success: true, message: `✅ Tạo ĐH **${code}** | Tổng: **${fmt(total)}đ**`, data, navigate: `/crm/orders/${data.id}` };
  },

  update_order_status: async ({ order_id, status }) => {
    const ts = {};
    if (status === 'shipped') ts.shipped_date = new Date().toISOString().split('T')[0];
    if (status === 'delivered') ts.delivered_date = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase.from('orders').update({ status, ...ts, updated_at: new Date().toISOString() }).eq('id', order_id).select('code').single();
    if (error) throw error;
    return { success: true, message: `✅ ĐH ${data.code} → **${status}**` };
  },

  // ─── 6. HÓA ĐƠN ──────────────────────────────────────────────────────
  create_invoice: async ({ order_id, customer_id, customer_name }, userId) => {
    const code = await nextCode('HD');
    let items = [], total = 0;
    if (order_id) {
      const { data: order } = await supabase.from('orders').select('*, items:order_items(*)').eq('id', order_id).single();
      if (order) {
        customer_id = customer_id || order.customer_id;
        customer_name = customer_name || order.customer_name;
        total = order.total || 0;
        items = (order.items || []).map(i => ({ product_name: i.product_name, description: i.description, unit: i.unit, quantity: i.quantity, unit_price: i.unit_price, amount: i.amount, item_order: i.item_order }));
      }
    }
    const { data, error } = await supabase.from('invoices').insert({
      code, order_id, customer_id, customer_name, total, paid_amount: 0, payment_status: 'unpaid', created_by: userId,
    }).select('*').single();
    if (error) throw error;

    if (items.length) await supabase.from('invoice_items').insert(items.map(i => ({ ...i, invoice_id: data.id })));
    return { success: true, message: `✅ Tạo HĐ **${code}** | Tổng: **${fmt(total)}đ**`, data, navigate: `/crm/invoices/${data.id}` };
  },

  // ─── 7. THU TIỀN ──────────────────────────────────────────────────────
  record_payment: async ({ invoice_id, amount, method, note }, userId) => {
    const { data: inv } = await supabase.from('invoices').select('*').eq('id', invoice_id).single();
    if (!inv) throw new Error('HĐ không tồn tại');
    const { error } = await supabase.from('payment_records').insert({
      invoice_id, amount, payment_method: method || 'transfer', note, received_by: userId,
    });
    if (error) throw error;
    const newPaid = (inv.paid_amount || 0) + amount;
    const status = newPaid >= inv.total ? 'paid' : 'partial';
    await supabase.from('invoices').update({ paid_amount: newPaid, payment_status: status }).eq('id', invoice_id);
    return { success: true, message: `✅ Thu **${fmt(amount)}đ** (${method || 'CK'}) | Đã thu: ${fmt(newPaid)}/${fmt(inv.total)}đ ${status === 'paid' ? '✅ Đủ!' : ''}` };
  },

  // ─── 8. TASK ───────────────────────────────────────────────────────────
  create_task: async ({ title, project_id, assignee_id, due_date, priority, stage_id }, userId) => {
    const { data, error } = await supabase.from('tasks').insert({
      title, project_id, assignee_id, due_date, priority: priority || 'medium',
      stage_id, status: 'pending', created_by_id: userId,
    }).select('*').single();
    if (error) throw error;
    return { success: true, message: `✅ Tạo NV: **${title}**${due_date ? ` | Hạn: ${due_date}` : ''}` };
  },

  complete_task: async ({ task_id }) => {
    const { data, error } = await supabase.from('tasks').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', task_id).select('title').single();
    if (error) throw error;
    return { success: true, message: `✅ Xong: **${data.title}**` };
  },

  assign_task: async ({ task_id, assignee_id, assignee_name }) => {
    const { data, error } = await supabase.from('tasks').update({ assignee_id }).eq('id', task_id).select('title').single();
    if (error) throw error;
    return { success: true, message: `✅ Giao **${data.title}** → ${assignee_name || 'NV'}` };
  },

  // ─── 9. FULL FLOW — TỰ ĐỘNG TỪ A-Z ──────────────────────────────────
  full_flow: async ({ customer_name, customer_phone, project_name, items, estimated_value }, userId, ctx) => {
    const results = [];

    // 1. Tìm/tạo KH
    let customer = findCustomer(customer_name, ctx?.customers || []);
    if (!customer) {
      const r = await ACTIONS.create_customer({ name: customer_name, phone: customer_phone }, userId);
      customer = { id: r.data.id, name: r.data.full_name };
      results.push(`👤 ${r.message}`);
    } else {
      results.push(`👤 KH: **${customer.name}**`);
    }

    // 2. Tạo Lead
    const leadR = await ACTIONS.create_lead({ title: project_name || `Tủ bếp ${customer.name}`, customer_id: customer.id, estimated_value }, userId);
    results.push(`🎯 ${leadR.message}`);

    // 3. Tạo BG nếu có items
    let quotation = null;
    if (items && items.length) {
      const bgR = await ACTIONS.create_quotation({ customer_id: customer.id, customer_name: customer.name, items }, userId);
      quotation = bgR.data;
      results.push(`📄 ${bgR.message}`);
    }

    // 4. Tạo DA + Tasks
    const projR = await ACTIONS.create_project({ name: project_name || `Tủ bếp ${customer.name}`, customer_id: customer.id, estimated_value, template: true }, userId);
    results.push(`🏗️ ${projR.message}`);

    return { success: true, message: `🚀 **Hoàn tất luồng tự động!**\n\n${results.join('\n')}`, navigate: projR.navigate };
  },
};

module.exports = { ACTIONS, findCustomer, findProject, findLead, parseValue, fmt, nextCode };
