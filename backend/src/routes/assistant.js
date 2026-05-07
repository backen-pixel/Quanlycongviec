const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const { ACTIONS, findCustomer, findProject, findLead, parseValue, fmt } = require('../helpers/aiActions');

const r = Router();
r.use(auth);

// ─── CONTEXT BUILDER ────────────────────────────────────────────────────
async function buildContext(userId) {
  const results = await Promise.all([
    supabase.from('projects').select('id,code,name,status,estimated_value,current_stage_id,customer_id').eq('status','active').order('created_at',{ascending:false}).limit(20),
    supabase.from('tasks').select('id,title,status,priority,due_date,project_id,assignee_id').eq('assignee_id',userId).neq('status','done').order('due_date').limit(30),
    supabase.from('customers').select('id,full_name,phone').order('full_name').limit(100),
    supabase.from('workflow_stages').select('id,name,slug,order_index').is('company_id',null).eq('is_active',true).order('order_index'),
    supabase.from('users').select('id,full_name,email,role').limit(50),
    supabase.from('workflow_flows').select('id,name').order('name'),
  ]);
  
  // CRM tables may not exist yet - safe queries
  let leads = { data: [] }, orders = { data: [] }, invoices = { data: [] };
  try { leads = await supabase.from('crm_leads').select('id,code,title,estimated_value,stage_id,customer_id,next_follow_up,stage:crm_pipeline_stages!crm_leads_stage_id_fkey(name,is_won,is_lost)').is('actual_close_date',null).order('created_at',{ascending:false}).limit(20); } catch {}
  try { orders = await supabase.from('orders').select('id,code,total,status,paid_amount').neq('status','delivered').neq('status','cancelled').limit(20); } catch {}
  try { invoices = await supabase.from('invoices').select('id,code,total,paid_amount,payment_status').neq('payment_status','paid').limit(20); } catch {}

  const tasks = results[1].data || [];
  const overdueTasks = tasks.filter(t => t.due_date && new Date(t.due_date) < new Date());
  const overdueFollowUps = (leads.data || []).filter(l => l.next_follow_up && new Date(l.next_follow_up) < new Date() && !l.stage?.is_won && !l.stage?.is_lost);
  const unpaidInvoices = (invoices.data || []).filter(i => i.payment_status !== 'paid');
  const totalDebt = unpaidInvoices.reduce((s, i) => s + ((i.total||0) - (i.paid_amount||0)), 0);

  return {
    activeProjects: (results[0].data||[]).length,
    myTasks: tasks.length,
    overdueTasks: overdueTasks.length,
    overdueTasksList: overdueTasks.slice(0,5).map(t => t.title),
    openLeads: (leads.data||[]).length,
    overdueFollowUps: overdueFollowUps.length,
    overdueFollowUpsList: overdueFollowUps.slice(0,5).map(l => l.code+': '+l.title),
    pendingOrders: (orders.data||[]).length,
    unpaidInvoices: unpaidInvoices.length,
    totalDebt,
    customers: (results[2].data||[]).map(c => ({ id:c.id, name:c.full_name, phone:c.phone })),
    stages: (results[3].data||[]).map(s => ({ id:s.id, name:s.name, slug:s.slug })),
    users: (results[4].data||[]).map(u => ({ id:u.id, name:u.full_name, email:u.email, role:u.role })),
    flows: (results[5].data||[]).map(f => ({ id:f.id, name:f.name })),
    projects: (results[0].data||[]).slice(0,10).map(p => ({ id:p.id, code:p.code, name:p.name, status:p.status })),
    leads: (leads.data||[]).slice(0,10).map(l => ({ id:l.id, code:l.code, title:l.title, stage:l.stage?.name })),
    orders: (orders.data||[]).slice(0,10).map(o => ({ id:o.id, code:o.code, total:o.total, status:o.status })),
    invoices: unpaidInvoices.slice(0,10).map(i => ({ id:i.id, code:i.code, total:i.total, paid:i.paid_amount })),
  };
}

// ─── INTENT PARSER ──────────────────────────────────────────────────────
function parseIntent(msg, ctx) {
  const m = msg.toLowerCase().trim();

  // Full flow
  if (m.match(/(luồng|full flow|tự động|từ a.*z|toàn bộ)/)) {
    const custMatch = m.match(/(?:cho|kh|khách)\s+(.+?)(?:\s+(?:sđt|sdt|phone|điện thoại)\s+(\S+))?(?:\s+(?:dự án|da|tên)\s+(.+?))?(?:\s+(?:giá|value)\s+(.+?))?$/i);
    return { action: 'full_flow', data: {
      customer_name: custMatch?.[1]?.trim(), customer_phone: custMatch?.[2],
      project_name: custMatch?.[3]?.trim(), estimated_value: parseValue(custMatch?.[4]),
    }};
  }

  // Create customer
  if (m.match(/(tạo|thêm)\s+(khách|kh|customer)/)) {
    const match = m.match(/(?:tạo|thêm)\s+(?:khách|kh|customer)\s*(?:hàng)?\s+(.+?)(?:\s+(?:sđt|sdt|phone|đt)\s+(\S+))?(?:\s+(?:email)\s+(\S+))?$/i);
    return { action: 'create_customer', data: { name: match?.[1]?.replace(/\s*(sđt|sdt|phone|đt|email)\s.*/i,'').trim(), phone: match?.[2], email: match?.[3] }};
  }

  // Create project
  if (m.match(/(tạo|thêm)\s+(dự\s*án|project|da)/)) {
    const match = m.match(/(?:tạo|thêm)\s+(?:dự\s*án|project|da)\s+(.+?)(?:\s+(?:cho|kh|khách)\s+(.+?))?(?:\s+(?:giá|value|gt)\s+(.+?))?$/i);
    const name = match?.[1]?.replace(/\s*(?:cho|kh|khách|giá|value)\s.*/i,'').trim();
    const custName = match?.[2]?.replace(/\s*(?:giá|value)\s.*/i,'').trim();
    const customer = findCustomer(custName, ctx.customers);
    return { action: 'create_project', data: { name, customer_id: customer?.id, customer_name: custName, estimated_value: parseValue(match?.[3]), template: true }};
  }

  // Create lead
  if (m.match(/(tạo|thêm)\s+(lead|cơ hội)/)) {
    const match = m.match(/(?:tạo|thêm)\s+(?:lead|cơ hội)\s+(.+?)(?:\s+(?:cho|kh|khách)\s+(.+?))?(?:\s+(?:giá|value|gt)\s+(.+?))?$/i);
    const title = match?.[1]?.replace(/\s*(?:cho|kh|khách|giá|value)\s.*/i,'').trim();
    const custName = match?.[2]?.replace(/\s*(?:giá|value)\s.*/i,'').trim();
    const customer = findCustomer(custName, ctx.customers);
    return { action: 'create_lead', data: { title, customer_id: customer?.id, estimated_value: parseValue(match?.[3]) }};
  }

  // Create quotation
  if (m.match(/(tạo|thêm)\s+(báo giá|bg|quotation)/)) {
    const custMatch = m.match(/(?:cho|kh|khách)\s+(.+?)(?:\s|$)/i);
    const custName = custMatch?.[1]?.trim();
    const customer = findCustomer(custName, ctx.customers);
    return { action: 'create_quotation', data: { customer_id: customer?.id, customer_name: customer?.name || custName, items: [] }, needItems: true };
  }

  // Create invoice
  if (m.match(/(tạo|thêm)\s+(hóa đơn|hđ|invoice)/)) {
    return { action: 'create_invoice', data: {} };
  }

  // Record payment
  if (m.match(/(thu tiền|thanh toán|payment|thu\s+\d)/)) {
    const amtMatch = m.match(/(\d[\d.,]*)\s*(triệu|tr|nghìn|k)?/);
    return { action: 'record_payment', data: { amount: parseValue(amtMatch?.[0]), method: m.includes('tiền mặt') ? 'cash' : 'transfer' }};
  }

  // Create task
  if (m.match(/(tạo|thêm)\s+(nhiệm vụ|nv|task|việc)/)) {
    const match = m.match(/(?:tạo|thêm)\s+(?:nhiệm vụ|nv|task|việc)\s+(.+?)(?:\s+(?:cho|giao)\s+(.+?))?(?:\s+(?:hạn|deadline)\s+(.+?))?$/i);
    const title = match?.[1]?.replace(/\s*(?:cho|giao|hạn|deadline)\s.*/i,'').trim();
    return { action: 'create_task', data: { title, due_date: match?.[3] }};
  }

  // Complete task
  if (m.match(/(hoàn thành|xong|done|complete)\s+(nhiệm vụ|nv|task|việc)/)) {
    return { action: 'complete_task', data: {} };
  }

  // Advance stage
  if (m.match(/(chuyển|tiến|advance)\s*(giai đoạn|stage|bước)/)) {
    const projMatch = m.match(/(?:dự án|da|project)\s+(.+?)$/i);
    const project = findProject(projMatch?.[1], ctx.projects);
    return { action: 'advance_stage', data: { project_id: project?.id, project_name: projMatch?.[1] }};
  }

  // Move lead stage
  if (m.match(/(chuyển|move)\s+lead/)) {
    const match = m.match(/lead\s+(.+?)\s+(?:sang|về|→|->)\s+(.+?)$/i);
    const lead = findLead(match?.[1], ctx.leads);
    return { action: 'move_lead', data: { lead_id: lead?.id, stage_name: match?.[2] }};
  }

  // Add activity
  if (m.match(/(ghi|log|thêm)\s*(hoạt động|activity|ghi chú|cuộc gọi|gặp)/)) {
    const typeMap = { 'gọi': 'call', 'gặp': 'meeting', 'email': 'email', 'zalo': 'zalo', 'thăm': 'visit' };
    let type = 'note';
    for (const [k, v] of Object.entries(typeMap)) { if (m.includes(k)) { type = v; break; } }
    const noteMatch = m.match(/(?:nội dung|note|:)\s*(.+?)$/i);
    return { action: 'add_activity', data: { type, note: noteMatch?.[1] || msg }};
  }

  // Accept quotation
  if (m.match(/(chấp nhận|accept|duyệt)\s*(bg|báo giá|quotation)/)) {
    return { action: 'accept_quotation', data: {} };
  }

  // Search
  if (m.match(/(tìm|search|tìm kiếm|tra cứu)\s+(.+)/)) {
    const match = m.match(/(?:tìm|search|tìm kiếm|tra cứu)\s+(.+?)$/i);
    return { action: 'search', data: { query: match?.[1]?.trim() }};
  }

  // Update project
  if (m.match(/(cập nhật|sửa|update|đổi)\s+(dự án|da|project)/)) {
    const projMatch = m.match(/(?:dự án|da|project)\s+(.+?)(?:\s+(?:thành|→|->|=)\s+(.+?))?$/i);
    const project = findProject(projMatch?.[1], ctx.projects);
    // Parse updates from text
    const updates = {};
    const prioMatch = m.match(/(?:ưu tiên|priority)\s*(cao|thấp|trung bình|high|medium|low)/i);
    if (prioMatch) updates.priority = { 'cao':'high', 'thấp':'low', 'trung bình':'medium' }[prioMatch[1]] || prioMatch[1];
    const nameMatch = m.match(/(?:tên|name)\s*(?:thành|→|=|:)\s*(.+?)$/i);
    if (nameMatch) updates.name = nameMatch[1].trim();
    const valMatch = m.match(/(?:giá|gt|value)\s*(\d[\d.,]*)\s*(triệu|tr)?/i);
    if (valMatch) updates.estimated_value = parseValue(valMatch[0]);
    return { action: 'update_project', data: { project_id: project?.id, updates }};
  }

  // Delete project
  if (m.match(/(xóa|delete|hủy)\s+(dự án|da|project)/)) {
    const projMatch = m.match(/(?:dự án|da|project)\s+(.+?)$/i);
    const project = findProject(projMatch?.[1], ctx.projects);
    return { action: 'delete_project', data: { project_id: project?.id }};
  }

  // Update task
  if (m.match(/(cập nhật|sửa|update|đổi)\s+(nhiệm vụ|nv|task)/)) {
    return { action: 'update_task', data: {} };
  }

  // Delete task
  if (m.match(/(xóa|delete)\s+(nhiệm vụ|nv|task)/)) {
    return { action: 'delete_task', data: {} };
  }

  // List tasks of project
  if (m.match(/(xem|list|danh sách)\s*(nhiệm vụ|nv|task|việc)\s*(của|dự án|da|project)?/)) {
    const projMatch = m.match(/(?:của|dự án|da|project)\s+(.+?)$/i);
    const project = findProject(projMatch?.[1], ctx.projects);
    return { action: 'list_tasks', data: { project_id: project?.id }};
  }

  // Project detail
  if (m.match(/(xem|chi tiết|detail)\s*(dự án|da|project)\s+/)) {
    const projMatch = m.match(/(?:dự án|da|project)\s+(.+?)$/i);
    const project = findProject(projMatch?.[1], ctx.projects);
    return { action: 'project_detail', data: { project_id: project?.id }};
  }

  // Customer detail
  if (m.match(/(xem|chi tiết)\s*(khách|kh|customer)\s+/)) {
    const custMatch = m.match(/(?:khách|kh|customer)\s+(.+?)$/i);
    const customer = findCustomer(custMatch?.[1], ctx.customers);
    return { action: 'customer_detail', data: { customer_id: customer?.id }};
  }

  // Delete customer
  if (m.match(/(xóa|delete)\s+(khách|kh|customer)/)) {
    const custMatch = m.match(/(?:khách|kh|customer)\s+(.+?)$/i);
    const customer = findCustomer(custMatch?.[1], ctx.customers);
    return { action: 'delete_customer', data: { customer_id: customer?.id }};
  }

  // Delete lead
  if (m.match(/(xóa|delete)\s+lead/)) {
    const match = m.match(/lead\s+(.+?)$/i);
    const lead = findLead(match?.[1], ctx.leads);
    return { action: 'delete_lead', data: { lead_id: lead?.id }};
  }

  // Assign project person
  if (m.match(/(giao|assign|phân công)\s+(kinh doanh|thiết kế|quản lý|giám sát)/)) {
    const match = m.match(/(?:giao|assign|phân công)\s+(kinh doanh|thiết kế|quản lý|giám sát)\s+(?:cho|→|=)?\s*(.+?)(?:\s+(?:dự án|da)\s+(.+?))?$/i);
    const user = ctx.users.find(u => u.name?.toLowerCase().includes(match?.[2]?.toLowerCase()));
    const project = findProject(match?.[3], ctx.projects);
    return { action: 'assign_project_person', data: { project_id: project?.id, role: match?.[1], user_id: user?.id, user_name: user?.name || match?.[2] }};
  }

  // Suggest
  if (m.match(/(làm gì|việc gì|gợi ý|tiếp theo|nên làm|suggest|next)/)) return { action: 'suggest' };

  // Report
  if (m.match(/(báo cáo|thống kê|report|tổng quan|overview)/)) return { action: 'report' };

  // Revenue
  if (m.match(/(doanh thu|revenue|tiền|thu nhập|lợi nhuận|công nợ)/)) return { action: 'revenue' };

  // Overdue
  if (m.match(/(quá hạn|trễ hạn|overdue|muộn|deadline)/)) return { action: 'overdue' };

  // Greeting
  if (m.match(/^(xin chào|hello|hi|chào|hey)/)) return { action: 'greeting' };

  // Customers
  if (m.match(/(khách hàng|customer|danh sách kh)/)) return { action: 'list_customers' };

  // Projects
  if (m.match(/(danh sách|list)\s*(dự án|da|project)/)) return { action: 'list_projects' };

  // Help
  if (m.match(/(help|trợ giúp|hướng dẫn|lệnh|command)/)) return { action: 'help' };

  return { action: 'unknown' };
}

// ─── WIZARD: Multi-step project creation ────────────────────────────────
function extractWizardData(conversation) {
  // Extract data collected from wizard steps in conversation
  const data = {};
  for (const m of conversation) {
    const flowMatch = m.content?.match(/\[DATA:flow_id=(.+?)\]/);
    const flowNameMatch = m.content?.match(/\[DATA:flow_name=(.+?)\]/);
    const custMatch = m.content?.match(/\[DATA:customer_id=(.+?)\]/);
    const custNameMatch = m.content?.match(/\[DATA:customer_name=(.+?)\]/);
    const newCustMatch = m.content?.match(/\[DATA:new_customer=(.+?)\]/);
    const newCustPhoneMatch = m.content?.match(/\[DATA:new_customer_phone=(.+?)\]/);
    const nameMatch = m.content?.match(/\[DATA:project_name=(.+?)\]/);
    const valueMatch = m.content?.match(/\[DATA:estimated_value=(.+?)\]/);
    const addrMatch = m.content?.match(/\[DATA:install_address=(.+?)\]/);
    if (flowMatch) data.flow_id = flowMatch[1];
    if (flowNameMatch) data.flow_name = flowNameMatch[1];
    if (custMatch) data.customer_id = custMatch[1];
    if (custNameMatch) data.customer_name = custNameMatch[1];
    if (newCustMatch) data.new_customer = newCustMatch[1];
    if (newCustPhoneMatch) data.new_customer_phone = newCustPhoneMatch[1];
    if (nameMatch) data.project_name = nameMatch[1];
    if (valueMatch) data.estimated_value = parseFloat(valueMatch[1]);
    if (addrMatch) data.install_address = addrMatch[1];
  }
  return data;
}

async function handleWizard(wizType, step, answer, conversation, ctx, userId, res) {
  if (wizType !== 'project') return res.json({ reply: 'Wizard không hợp lệ' });

  const ans = answer.trim();
  const data = extractWizardData(conversation);

  // Cancel
  if (ans.match(/^(hủy|cancel|thôi|bỏ)$/i)) {
    return res.json({ reply: '❌ Đã hủy tạo dự án.' });
  }

  // Step 1: Choose flow → Step 2: Customer
  if (step === 1) {
    const num = parseInt(ans);
    let flow = null;
    if (num > 0 && num <= ctx.flows.length) {
      flow = ctx.flows[num - 1];
    } else {
      flow = ctx.flows.find(f => f.name.toLowerCase().includes(ans.toLowerCase()));
    }
    if (!flow && ctx.flows.length) {
      return res.json({ reply: `❌ Không tìm thấy luồng "${ans}". Nhập lại số (1-${ctx.flows.length}):\n[WIZARD:project:1]` });
    }

    const flowId = flow?.id || 'default';
    const flowName = flow?.name || 'Mặc định';
    const custList = ctx.customers.map((c,i) => `**${i+1}.** ${c.name}${c.phone ? ' ('+c.phone+')' : ''}`).join('\n');

    return res.json({
      reply: `✅ Luồng: **${flowName}**\n\n👤 **Bước 2/5: Khách hàng**\n${custList || '_(chưa có KH)_'}\n\nNhập số chọn KH cũ, hoặc "mới [tên] [SĐT]" để tạo mới:\nVD: "1" hoặc "mới Nguyễn Văn A 0901234567"\n[WIZARD:project:2]\n[DATA:flow_id=${flowId}][DATA:flow_name=${flowName}]`,
      action: { action: 'wizard', step: 2, customers: ctx.customers }
    });
  }

  // Step 2: Customer → Step 3: Project name
  if (step === 2) {
    let custId = null, custName = null, isNew = false, newPhone = null;
    const newMatch = ans.match(/^(?:mới|new|tạo mới)\s+(.+?)(?:\s+(\d{9,11}))?$/i);

    if (newMatch) {
      isNew = true;
      custName = newMatch[1].replace(/\s*\d{9,11}\s*$/, '').trim();
      newPhone = newMatch[2] || null;
    } else {
      const num = parseInt(ans);
      let customer = null;
      if (num > 0 && num <= ctx.customers.length) {
        customer = ctx.customers[num - 1];
      } else {
        customer = findCustomer(ans, ctx.customers);
      }
      if (!customer) {
        return res.json({ reply: `❌ Không tìm thấy KH "${ans}".\nNhập số (1-${ctx.customers.length}) hoặc "mới [tên] [SĐT]":\n[WIZARD:project:2]\n[DATA:flow_id=${data.flow_id}][DATA:flow_name=${data.flow_name}]` });
      }
      custId = customer.id;
      custName = customer.name;
    }

    const dataTag = isNew
      ? `[DATA:new_customer=${custName}]${newPhone ? '[DATA:new_customer_phone='+newPhone+']' : ''}`
      : `[DATA:customer_id=${custId}][DATA:customer_name=${custName}]`;

    return res.json({
      reply: `✅ KH: **${custName}**${isNew ? ' _(mới)_' : ''}\n\n📝 **Bước 3/5: Tên dự án**\n\nNhập tên dự án:\nVD: "Tủ bếp gỗ sồi biệt thự"\n[WIZARD:project:3]\n[DATA:flow_id=${data.flow_id}][DATA:flow_name=${data.flow_name}]${dataTag}`
    });
  }

  // Step 3: Project name → Step 4: Value
  if (step === 3) {
    if (ans.length < 2) {
      return res.json({ reply: `❌ Tên quá ngắn. Nhập lại tên dự án:\n[WIZARD:project:3]\n[DATA:flow_id=${data.flow_id}][DATA:flow_name=${data.flow_name}]${data.customer_id ? '[DATA:customer_id='+data.customer_id+'][DATA:customer_name='+data.customer_name+']' : '[DATA:new_customer='+data.new_customer+']'+(data.new_customer_phone ? '[DATA:new_customer_phone='+data.new_customer_phone+']' : '')}` });
    }

    const prevData = `[DATA:flow_id=${data.flow_id}][DATA:flow_name=${data.flow_name}]${data.customer_id ? '[DATA:customer_id='+data.customer_id+'][DATA:customer_name='+data.customer_name+']' : '[DATA:new_customer='+data.new_customer+']'+(data.new_customer_phone ? '[DATA:new_customer_phone='+data.new_customer_phone+']' : '')}`;

    return res.json({
      reply: `✅ Tên DA: **${ans}**\n\n💰 **Bước 4/5: Giá trị dự án**\n\nNhập giá trị (VNĐ):\nVD: "150 triệu", "200tr", "1.5 tỷ"\nHoặc "bỏ qua" nếu chưa biết\n[WIZARD:project:4]\n${prevData}[DATA:project_name=${ans}]`
    });
  }

  // Step 4: Value → Step 5: Address
  if (step === 4) {
    const value = ans.match(/bỏ qua|skip/i) ? 0 : parseValue(ans);
    const prevData = `[DATA:flow_id=${data.flow_id}][DATA:flow_name=${data.flow_name}]${data.customer_id ? '[DATA:customer_id='+data.customer_id+'][DATA:customer_name='+data.customer_name+']' : '[DATA:new_customer='+data.new_customer+']'+(data.new_customer_phone ? '[DATA:new_customer_phone='+data.new_customer_phone+']' : '')}[DATA:project_name=${data.project_name}]`;

    return res.json({
      reply: `✅ Giá trị: **${value ? fmt(value) + 'đ' : 'Chưa xác định'}**\n\n📍 **Bước 5/5: Địa chỉ lắp đặt**\n\nNhập địa chỉ:\nVD: "123 Nguyễn Huệ, Q1, HCM"\nHoặc "bỏ qua"\n[WIZARD:project:5]\n${prevData}[DATA:estimated_value=${value}]`
    });
  }

  // Step 5: Address → CONFIRM & CREATE
  if (step === 5) {
    const address = ans.match(/bỏ qua|skip/i) ? null : ans;

    // Collect all data
    const flowId = data.flow_id === 'default' ? null : data.flow_id;
    const flowName = data.flow_name || 'Mặc định';
    const projectName = data.project_name;
    const estimatedValue = data.estimated_value || 0;

    // Create customer if new
    let customerId = data.customer_id;
    let customerName = data.customer_name || data.new_customer;
    if (data.new_customer && !data.customer_id) {
      const custR = await ACTIONS.create_customer({ name: data.new_customer, phone: data.new_customer_phone }, userId);
      customerId = custR.data.id;
      customerName = custR.data.full_name;
    }

    // Create project
    const projR = await ACTIONS.create_project({
      name: projectName,
      customer_id: customerId,
      estimated_value: estimatedValue,
      flow_id: flowId,
      template: true,
    }, userId);

    // Update address if provided
    if (address && projR.data?.id) {
      await supabase.from('projects').update({ install_address: address }).eq('id', projR.data.id);
    }

    return res.json({
      reply: `🎉 **Tạo dự án thành công!**\n\n📋 **${projR.data?.code}: ${projectName}**\n👤 KH: ${customerName}${data.new_customer ? ' _(mới)_' : ''}\n📍 Luồng: ${flowName}\n💰 GT: ${estimatedValue ? fmt(estimatedValue) + 'đ' : '—'}\n🏠 ĐC: ${address || '—'}\n\n✅ Đã tạo + bộ NV mặc định`,
      action: { action: 'navigate', url: `/projects/${projR.data?.id}` },
      created: { type: 'project', id: projR.data?.id }
    });
  }

  return res.json({ reply: 'Wizard lỗi. Gõ "Tạo dự án" để bắt đầu lại.' });
}

// ─── MAIN CHAT ──────────────────────────────────────────────────────────
r.post('/chat', async (req, res) => {
  try {
    const { message, conversation = [] } = req.body;
    if (!message) return res.status(400).json({ error: 'Nhập tin nhắn' });

    const ctx = await buildContext(req.user.userId);

    // ── CHECK WIZARD STATE (multi-step creation) ──
    const lastAssistant = [...conversation].reverse().find(m => m.role === 'assistant');
    const wizardMatch = lastAssistant?.content?.match(/\[WIZARD:(\w+):(\d+)\]/);
    if (wizardMatch) {
      const [, wizType, stepStr] = wizardMatch;
      const step = parseInt(stepStr);
      return handleWizard(wizType, step, message, conversation, ctx, req.user.userId, res);
    }

    const intent = parseIntent(message, ctx);

    // ── PROJECT CREATION WIZARD — start ──
    if (intent.action === 'create_project') {
      const flowList = ctx.flows.map((f,i) => `**${i+1}.** ${f.name}`).join('\n');
      return res.json({
        reply: `🏗️ **Tạo dự án mới**\n\n📋 **Bước 1/5: Chọn luồng**\n${flowList || '_(chưa có luồng — sẽ dùng mặc định)_'}\n\nNhập số (VD: "1") hoặc tên luồng:\n[WIZARD:project:1]`,
        action: { action: 'wizard', type: 'create_project', step: 1, flows: ctx.flows }
      });
    }

    // ── EXECUTABLE ACTIONS ──
    if (ACTIONS[intent.action]) {
      const data = intent.data || {};

      if (intent.action === 'create_lead' && (!data.title || data.title.length < 2)) {
        const list = ctx.customers.slice(0,15).map((c,i) => `${i+1}. ${c.name}`).join('\n');
        return res.json({ reply: `🎯 **Tạo lead**\n\nGõ: "Tạo lead [tên] cho [KH] giá [số] triệu"\n\n📋 KH:\n${list}`, action: { action: 'prompt', type: 'create_lead', customers: ctx.customers.slice(0,15) }});
      }
      if (intent.action === 'create_customer' && (!data.name || data.name.length < 2)) {
        return res.json({ reply: '👤 **Tạo KH**\n\nGõ: "Tạo KH [tên] SĐT [số]"\nVD: "Tạo KH Nguyễn Văn A SĐT 0901234567"' });
      }
      if (intent.action === 'full_flow' && !data.customer_name) {
        const list = ctx.customers.slice(0,10).map((c,i) => `${i+1}. ${c.name}`).join('\n');
        return res.json({ reply: `🚀 **Luồng tự động A-Z**\n\nGõ: "Luồng tự động cho [KH] dự án [tên] giá [số] triệu"\n\n📋 KH:\n${list}` });
      }
      if (intent.needItems) {
        return res.json({ reply: `📄 **Tạo báo giá cho ${data.customer_name || 'KH'}**\n\nGõ thêm sản phẩm:\n"Tủ bếp Acrylic 3m, SL 1, giá 45 triệu; Bàn đá Marble, SL 1, giá 25 triệu"\n\nHoặc vào trang BG để thêm chi tiết.`, action: { action: 'prompt', type: 'create_quotation' }});
      }
      if (intent.action === 'record_payment' && !data.invoice_id) {
        if (!ctx.invoices.length) return res.json({ reply: '⚠️ Không có HĐ chưa thu.' });
        const list = ctx.invoices.slice(0,10).map((i,idx) => `${idx+1}. ${i.code} — Còn: ${fmt((i.total||0)-(i.paid||0))}đ`).join('\n');
        return res.json({ reply: `💰 **Thu tiền**\n\nChọn HĐ:\n${list}\n\nGõ: "Thu 50 triệu HĐ [mã]"`, action: { action: 'prompt', type: 'record_payment', invoices: ctx.invoices }});
      }

      try {
        const result = await ACTIONS[intent.action](data, req.user.userId, ctx);
        return res.json({ reply: result.message, action: result.navigate ? { action: 'navigate', url: result.navigate } : null, created: result.data ? { type: intent.action, id: result.data.id } : null });
      } catch (e) {
        return res.json({ reply: `❌ Lỗi ${intent.action}: ${e.message}` });
      }
    }

    // ── INFO ACTIONS ──
    if (intent.action === 'suggest') {
      const suggestions = [];
      if (ctx.overdueTasks > 0) suggestions.push({ icon: '🔴', message: `${ctx.overdueTasks} NV quá hạn: ${ctx.overdueTasksList.join(', ')}`, action: '/my-tasks' });
      if (ctx.overdueFollowUps > 0) suggestions.push({ icon: '📞', message: `${ctx.overdueFollowUps} lead cần follow-up`, action: '/crm' });
      if (ctx.unpaidInvoices > 0) suggestions.push({ icon: '💰', message: `${ctx.unpaidInvoices} HĐ chưa thu (${fmt(ctx.totalDebt)}đ)`, action: '/crm/invoices' });
      if (ctx.myTasks > 0) suggestions.push({ icon: '📋', message: `${ctx.myTasks} NV đang chờ`, action: '/my-tasks' });
      if (ctx.openLeads > 0) suggestions.push({ icon: '🎯', message: `${ctx.openLeads} lead đang mở`, action: '/crm' });
      if (!suggestions.length) return res.json({ reply: '✅ Không có việc gấp! 👏' });
      return res.json({ reply: `📋 **Việc cần làm:**\n\n${suggestions.map(s => `${s.icon} ${s.message}`).join('\n')}`, action: { action: 'suggest', suggestions } });
    }

    if (intent.action === 'report') {
      // Deep statistics
      const [allProjects, allTasks, revenueData] = await Promise.all([
        supabase.from('projects').select('id,code,name,status,estimated_value,created_at').order('created_at',{ascending:false}).limit(100),
        supabase.from('tasks').select('id,status,due_date').limit(500),
        supabase.from('orders').select('id,total,status,paid_amount').limit(200),
      ]);
      const projects = allProjects.data || [];
      const tasks = allTasks.data || [];
      const orders = revenueData.data || [];

      const pByStatus = {};
      projects.forEach(p => { pByStatus[p.status] = (pByStatus[p.status]||0) + 1; });
      const totalValue = projects.reduce((s,p) => s + (p.estimated_value||0), 0);

      const tDone = tasks.filter(t => t.status === 'done').length;
      const tOverdue = tasks.filter(t => t.status !== 'done' && t.due_date && new Date(t.due_date) < new Date()).length;
      const tRate = tasks.length ? Math.round(tDone/tasks.length*100) : 0;

      const totalRevenue = orders.reduce((s,o) => s + (o.total||0), 0);
      const totalPaid = orders.reduce((s,o) => s + (o.paid_amount||0), 0);

      // This month
      const thisMonth = new Date(); thisMonth.setDate(1); thisMonth.setHours(0,0,0,0);
      const newThisMonth = projects.filter(p => new Date(p.created_at) >= thisMonth).length;
      const revenueThisMonth = orders.filter(o => new Date(o.created_at) >= thisMonth).reduce((s,o) => s + (o.total||0), 0);

      return res.json({ reply: `📊 **BÁO CÁO TỔNG HỢP**\n\n🏗️ **Dự án:** ${projects.length} tổng\n${Object.entries(pByStatus).map(([k,v]) => `   • ${k}: ${v}`).join('\n')}\n   💰 Tổng giá trị: ${fmt(totalValue)}đ\n   📈 Mới tháng này: ${newThisMonth}\n\n📋 **Nhiệm vụ:** ${tasks.length} tổng\n   ✅ Hoàn thành: ${tDone} (${tRate}%)\n   🔴 Quá hạn: ${tOverdue}\n   ⏳ Còn lại: ${tasks.length - tDone}\n\n💰 **Doanh thu:**\n   📦 Tổng ĐH: ${fmt(totalRevenue)}đ\n   ✅ Đã thu: ${fmt(totalPaid)}đ\n   ❗ Còn nợ: ${fmt(totalRevenue - totalPaid)}đ\n   📈 Tháng này: ${fmt(revenueThisMonth)}đ\n\n🎯 **CRM:**\n   • ${ctx.openLeads} lead đang mở\n   • ${ctx.pendingOrders} ĐH đang xử lý\n   • ${ctx.unpaidInvoices} HĐ chưa thu` });
    }

    if (intent.action === 'overdue') {
      // Detailed overdue report
      const [overdueProj, overdueTasks] = await Promise.all([
        supabase.from('projects').select('id,code,name,install_date,design_deadline').neq('status','completed').neq('status','cancelled').or('install_date.lt.'+new Date().toISOString()+',design_deadline.lt.'+new Date().toISOString()).limit(20),
        supabase.from('tasks').select('id,title,due_date,assignee:users!tasks_assignee_id_fkey(full_name),project:projects(code)').neq('status','done').lt('due_date',new Date().toISOString()).order('due_date').limit(20),
      ]);
      const op = overdueProj.data || [];
      const ot = overdueTasks.data || [];

      let reply = '⚠️ **BÁO CÁO QUÁ HẠN**\n\n';

      if (op.length) {
        reply += `🏗️ **${op.length} DA quá deadline:**\n`;
        op.slice(0,10).forEach(p => {
          const date = p.install_date || p.design_deadline;
          reply += `• ${p.code}: ${p.name} (hạn: ${new Date(date).toLocaleDateString('vi')})\n`;
        });
        reply += '\n';
      }

      if (ot.length) {
        reply += `📋 **${ot.length} NV quá hạn:**\n`;
        ot.slice(0,10).forEach(t => {
          reply += `• ${t.project?.code || '—'}: ${t.title} — ${t.assignee?.full_name || '?'} (hạn: ${new Date(t.due_date).toLocaleDateString('vi')})\n`;
        });
        reply += '\n';
      }

      if (ctx.overdueFollowUps > 0) {
        reply += `📞 **${ctx.overdueFollowUps} follow-up quá hạn:**\n${ctx.overdueFollowUpsList.join('\n')}\n`;
      }

      if (!op.length && !ot.length && !ctx.overdueFollowUps) reply = '✅ Không có gì quá hạn! 👏';
      return res.json({ reply });
    }

    if (intent.action === 'revenue') {
      const [orders, invoices, payments] = await Promise.all([
        supabase.from('orders').select('id,code,total,status,paid_amount,customer_name,created_at').order('created_at',{ascending:false}).limit(100),
        supabase.from('invoices').select('id,code,total,paid_amount,payment_status,customer_name').limit(100),
        supabase.from('payment_records').select('id,amount,payment_method,created_at').order('created_at',{ascending:false}).limit(50),
      ]);
      const allOrders = orders.data || [];
      const allInv = invoices.data || [];
      const allPay = payments.data || [];

      const totalRevenue = allOrders.reduce((s,o) => s + (o.total||0), 0);
      const totalPaid = allInv.reduce((s,i) => s + (i.paid_amount||0), 0);
      const totalDebt = allInv.filter(i => i.payment_status !== 'paid').reduce((s,i) => s + ((i.total||0)-(i.paid_amount||0)), 0);

      // This month
      const thisMonth = new Date(); thisMonth.setDate(1); thisMonth.setHours(0,0,0,0);
      const revenueMonth = allOrders.filter(o => new Date(o.created_at) >= thisMonth).reduce((s,o) => s + (o.total||0), 0);
      const paidMonth = allPay.filter(p => new Date(p.created_at) >= thisMonth).reduce((s,p) => s + (p.amount||0), 0);

      // Top 5 unpaid
      const unpaid = allInv.filter(i => i.payment_status !== 'paid').sort((a,b) => ((b.total||0)-(b.paid_amount||0)) - ((a.total||0)-(a.paid_amount||0)));

      let reply = `💰 **BÁO CÁO DOANH THU**\n\n📦 Tổng ĐH: **${fmt(totalRevenue)}đ** (${allOrders.length} đơn)\n✅ Đã thu: **${fmt(totalPaid)}đ**\n❗ Công nợ: **${fmt(totalDebt)}đ**\n\n📈 **Tháng này:**\n• ĐH mới: ${fmt(revenueMonth)}đ\n• Thu tiền: ${fmt(paidMonth)}đ`;

      if (unpaid.length) {
        reply += `\n\n🔴 **Top công nợ:**`;
        unpaid.slice(0,5).forEach(i => {
          reply += `\n• ${i.code}: ${i.customer_name||'?'} — còn ${fmt((i.total||0)-(i.paid_amount||0))}đ`;
        });
      }

      return res.json({ reply });
    }

    if (intent.action === 'greeting') {
      return res.json({ reply: `👋 Chào! Tôi giúp gì?\n\n• ${ctx.myTasks} NV (${ctx.overdueTasks} quá hạn)\n• ${ctx.openLeads} lead\n• ${ctx.unpaidInvoices} HĐ chưa thu` });
    }

    if (intent.action === 'list_customers') {
      return res.json({ reply: `👥 **KH (${ctx.customers.length}):**\n\n${ctx.customers.slice(0,20).map(c => `• ${c.name}${c.phone ? ' — '+c.phone : ''}`).join('\n')}` });
    }

    if (intent.action === 'list_projects') {
      return res.json({ reply: `🏗️ **DA đang chạy (${ctx.projects.length}):**\n\n${ctx.projects.map(p => `• ${p.code}: ${p.name}`).join('\n')}` });
    }

    if (intent.action === 'help') {
      return res.json({ reply: `🤖 **AI — Điều khiển TOÀN BỘ hệ thống:**\n\n**🆕 Tạo:**\n• "Tạo KH Nguyễn A SĐT 090xxx"\n• "Tạo dự án Tủ bếp cho Nguyễn A giá 150tr"\n• "Tạo lead/báo giá/đơn hàng/hóa đơn"\n• "Tạo NV [tên] cho DA [code]"\n• "Luồng tự động cho [KH] DA [tên]"\n\n**✏️ Sửa/Xóa:**\n• "Sửa DA [code] giá 200tr"\n• "Xóa DA/KH/Lead/NV [tên]"\n• "Đổi ưu tiên DA [code] cao"\n\n**👥 Phân công:**\n• "Giao kinh doanh cho Nguyễn A DA [code]"\n• "Giao NV [tên] cho [NV]"\n• "Chuyển giai đoạn DA [code]"\n\n**💰 Tài chính:**\n• "Thu 50 triệu"\n• "Duyệt BG"\n• "Doanh thu" / "Công nợ"\n\n**📊 Thống kê:**\n• "Báo cáo" — tổng hợp\n• "Quá hạn" — DA + NV\n• "Doanh thu" — thu/nợ\n\n**🔍 Tra cứu:**\n• "Tìm [tên KH/DA/NV]"\n• "Xem DA [code]"\n• "Xem NV của DA [code]"\n• "Xem KH [tên]"\n• "Danh sách KH/DA"` });
    }

    // ── OPENAI FALLBACK ──
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      try {
        const aiResp = await callOpenAI(apiKey, message, conversation, ctx);
        if (aiResp.action && ACTIONS[aiResp.action.action]) {
          try {
            const result = await ACTIONS[aiResp.action.action](aiResp.action.data || {}, req.user.userId, ctx);
            return res.json({ reply: `${aiResp.reply}\n\n${result.message}`, action: result.navigate ? { action: 'navigate', url: result.navigate } : null });
          } catch (e) {
            return res.json({ reply: `${aiResp.reply}\n\n❌ ${e.message}` });
          }
        }
        return res.json(aiResp);
      } catch (e) {
        console.error('OpenAI error:', e.message);
      }
    }

    // Default
    res.json({ reply: `Tôi chưa hiểu "${message}".\n\nGõ "help" để xem lệnh.` });
  } catch (e) {
    console.error('Chat error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── OPENAI ─────────────────────────────────────────────────────────────
async function callOpenAI(apiKey, message, conversation, ctx) {
  const actionList = Object.keys(ACTIONS).join(', ');
  const systemPrompt = `Bạn là trợ lý AI TuBep Pro. Trả lời tiếng Việt, ngắn gọn.

Context: ${ctx.activeProjects} DA, ${ctx.myTasks} tasks (${ctx.overdueTasks} quá hạn), ${ctx.openLeads} leads, nợ ${fmt(ctx.totalDebt)}đ.
KH: ${ctx.customers.slice(0,15).map(c => c.name+'('+c.id.slice(0,8)+')').join(', ')}
DA: ${ctx.projects.map(p => p.code+':'+p.name).join(', ')}

Khi user muốn thực hiện action, trả JSON trong \`\`\`json block:
{"action":"<action_name>","data":{...}}
Actions: ${actionList}
VD tạo DA: {"action":"create_project","data":{"name":"Tủ bếp","customer_id":"abc123","estimated_value":150000000}}
VD full flow: {"action":"full_flow","data":{"customer_name":"Nguyễn A","project_name":"Tủ bếp","estimated_value":150000000}}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversation.slice(-10).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: message },
  ];

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages, temperature: 0.7, max_tokens: 1000 }),
  });
  if (!response.ok) throw new Error('OpenAI: ' + response.status);

  const data = await response.json();
  const content = data.choices[0].message.content;

  let action = null;
  try { const m = content.match(/```json\s*([\s\S]*?)\s*```/); if (m) action = JSON.parse(m[1]); } catch {}

  return { reply: content.replace(/```json\s*[\s\S]*?\s*```/g, '').trim(), action, source: 'openai' };
}

// ─── SUGGESTIONS ────────────────────────────────────────────────────────
r.get('/suggestions', async (req, res) => {
  try {
    const ctx = await buildContext(req.user.userId);
    const suggestions = [];
    if (ctx.overdueTasks) suggestions.push({ priority:'high', icon:'🔴', message:`${ctx.overdueTasks} NV quá hạn`, action:'/my-tasks' });
    if (ctx.overdueFollowUps) suggestions.push({ priority:'high', icon:'📞', message:`${ctx.overdueFollowUps} follow-up quá hạn`, action:'/crm' });
    if (ctx.unpaidInvoices) suggestions.push({ priority:'medium', icon:'💰', message:`${ctx.unpaidInvoices} HĐ chưa thu (${fmt(ctx.totalDebt)}đ)`, action:'/crm/invoices' });
    if (ctx.myTasks) suggestions.push({ priority:'low', icon:'📋', message:`${ctx.myTasks} NV chờ`, action:'/my-tasks' });
    res.json({ suggestions });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── EXECUTE (backup endpoint) ──────────────────────────────────────────
r.post('/execute', async (req, res) => {
  try {
    const { action, data } = req.body;
    if (!ACTIONS[action]) return res.status(400).json({ error: 'Action không hỗ trợ: ' + action });
    const ctx = await buildContext(req.user.userId);
    const result = await ACTIONS[action](data, req.user.userId, ctx);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = r;
