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
  ]);
  
  // CRM tables may not exist yet - safe queries
  let leads = { data: [] }, orders = { data: [] }, invoices = { data: [] };
  try { leads = await supabase.from('crm_leads').select('id,code,title,estimated_value,stage_id,customer_id,next_follow_up,stage:crm_pipeline_stages(name,is_won,is_lost)').is('actual_close_date',null).order('created_at',{ascending:false}).limit(20); } catch {}
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

  // Create order
  if (m.match(/(tạo|thêm)\s+(đơn hàng|đh|order)/)) {
    const custMatch = m.match(/(?:cho|kh|khách)\s+(.+?)(?:\s|$)/i);
    const custName = custMatch?.[1]?.trim();
    const customer = findCustomer(custName, ctx.customers);
    return { action: 'create_order', data: { customer_id: customer?.id, customer_name: customer?.name || custName }};
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

  // Suggest
  if (m.match(/(làm gì|việc gì|gợi ý|tiếp theo|nên làm|suggest|next)/)) return { action: 'suggest' };

  // Report
  if (m.match(/(báo cáo|thống kê|doanh thu|report|tổng quan|overview)/)) return { action: 'report' };

  // Overdue
  if (m.match(/(quá hạn|trễ hạn|overdue|muộn)/)) return { action: 'overdue' };

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

// ─── MAIN CHAT ──────────────────────────────────────────────────────────
r.post('/chat', async (req, res) => {
  try {
    const { message, conversation = [] } = req.body;
    if (!message) return res.status(400).json({ error: 'Nhập tin nhắn' });

    const ctx = await buildContext(req.user.userId);
    const intent = parseIntent(message, ctx);

    // ── EXECUTABLE ACTIONS ──
    if (ACTIONS[intent.action]) {
      const data = intent.data || {};

      // Need more info?
      if (intent.action === 'create_project' && (!data.name || data.name.length < 2)) {
        const list = ctx.customers.slice(0,15).map((c,i) => `${i+1}. ${c.name}`).join('\n');
        return res.json({ reply: `🏗️ **Tạo dự án**\n\nGõ: "Tạo dự án [tên] cho [KH] giá [số] triệu"\n\n📋 KH:\n${list}`, action: { action: 'prompt', type: 'create_project', customers: ctx.customers.slice(0,15) }});
      }
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
      return res.json({ reply: `📊 **Tổng quan:**\n\n🏗️ DA: **${ctx.activeProjects}**\n📋 NV: **${ctx.myTasks}** (${ctx.overdueTasks} quá hạn)\n🎯 Lead: **${ctx.openLeads}**\n📦 ĐH: **${ctx.pendingOrders}**\n💰 Nợ: **${fmt(ctx.totalDebt)}đ** (${ctx.unpaidInvoices} HĐ)` });
    }

    if (intent.action === 'overdue') {
      if (!ctx.overdueTasks && !ctx.overdueFollowUps) return res.json({ reply: '✅ Không quá hạn! 👏' });
      let r = '⚠️ **Quá hạn:**\n';
      if (ctx.overdueTasks) r += `\n🔴 ${ctx.overdueTasks} NV: ${ctx.overdueTasksList.join(', ')}`;
      if (ctx.overdueFollowUps) r += `\n📞 ${ctx.overdueFollowUps} follow-up: ${ctx.overdueFollowUpsList.join(', ')}`;
      return res.json({ reply: r });
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
      return res.json({ reply: `🤖 **Tôi làm được:**\n\n**Tạo:**\n• "Tạo KH Nguyễn A SĐT 090xxx"\n• "Tạo dự án Tủ bếp cho Nguyễn A giá 150tr"\n• "Tạo lead Tủ bếp gỗ sồi cho Trần B"\n• "Tạo báo giá cho Nguyễn A"\n• "Tạo đơn hàng cho Nguyễn A"\n\n**Hành động:**\n• "Chuyển giai đoạn DA TB-2026-001"\n• "Chuyển lead LEAD-001 sang Chốt"\n• "Hoàn thành NV [tên]"\n• "Thu 50 triệu"\n• "Ghi cuộc gọi: tư vấn KH"\n\n**Tự động:**\n• "Luồng tự động cho Nguyễn A DA Tủ bếp"\n  → Tạo KH + Lead + BG + DA + Tasks\n\n**Xem:**\n• "Gợi ý việc cần làm"\n• "Báo cáo"\n• "Quá hạn?"\n• "Danh sách KH/DA"` });
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
