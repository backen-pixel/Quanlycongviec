const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { supabase } = require('../config/supabase');

const r = Router();
r.use(auth);

// ─── CONTEXT BUILDER ────────────────────────────────────────────────────

async function buildContext(userId) {
  const [projects, tasks, leads, orders, invoices, customers, stages, flows] = await Promise.all([
    supabase.from('projects').select('id, code, name, status, estimated_value, current_stage_id, customer_id').eq('status', 'active').order('created_at', { ascending: false }).limit(20),
    supabase.from('tasks').select('id, title, status, priority, due_date, project_id, assignee_id').eq('assignee_id', userId).neq('status', 'done').order('due_date').limit(30),
    supabase.from('crm_leads').select('id, code, title, estimated_value, stage_id, customer_id, next_follow_up, stage:crm_pipeline_stages(name, is_won, is_lost)').is('actual_close_date', null).order('created_at', { ascending: false }).limit(20).maybeSingle() ? 
      supabase.from('crm_leads').select('id, code, title, estimated_value, stage_id, customer_id, next_follow_up, stage:crm_pipeline_stages(name, is_won, is_lost)').is('actual_close_date', null).order('created_at', { ascending: false }).limit(20) :
      { data: [] },
    supabase.from('orders').select('id, code, total, status, paid_amount').neq('status', 'delivered').neq('status', 'cancelled').limit(20),
    supabase.from('invoices').select('id, code, total, paid_amount, payment_status').neq('payment_status', 'paid').limit(20),
    supabase.from('customers').select('id, full_name, phone').order('full_name').limit(50),
    supabase.from('workflow_stages').select('id, name, slug, order_index').is('company_id', null).eq('is_active', true).order('order_index'),
    supabase.from('workflow_flows').select('id, name').limit(5),
  ]);

  const overdueTasks = (tasks.data || []).filter(t => t.due_date && new Date(t.due_date) < new Date());
  const overdueFollowUps = (leads.data || []).filter(l => l.next_follow_up && new Date(l.next_follow_up) < new Date() && !l.stage?.is_won && !l.stage?.is_lost);
  const unpaidInvoices = (invoices.data || []).filter(i => i.payment_status !== 'paid');
  const totalDebt = unpaidInvoices.reduce((s, i) => s + ((i.total || 0) - (i.paid_amount || 0)), 0);

  return {
    activeProjects: (projects.data || []).length,
    myTasks: (tasks.data || []).length,
    overdueTasks: overdueTasks.length,
    overdueTasksList: overdueTasks.slice(0, 5).map(t => t.title),
    openLeads: (leads.data || []).length,
    overdueFollowUps: overdueFollowUps.length,
    overdueFollowUpsList: overdueFollowUps.slice(0, 5).map(l => `${l.code}: ${l.title}`),
    pendingOrders: (orders.data || []).length,
    unpaidInvoices: unpaidInvoices.length,
    totalDebt,
    customers: (customers.data || []).map(c => ({ id: c.id, name: c.full_name, phone: c.phone })),
    stages: (stages.data || []).map(s => ({ id: s.id, name: s.name, slug: s.slug })),
    flows: (flows.data || []).map(f => ({ id: f.id, name: f.name })),
    projects: (projects.data || []).slice(0, 10).map(p => ({ id: p.id, code: p.code, name: p.name, status: p.status })),
    leads: (leads.data || []).slice(0, 10).map(l => ({ id: l.id, code: l.code, title: l.title, stage: l.stage?.name })),
  };
}

// ─── HELPER: Create project ─────────────────────────────────────────────

async function createProject({ name, customer_id, estimated_value, template }, userId) {
  const { data: flows } = await supabase.from('workflow_flows').select('id').limit(1);
  const { data: firstStage } = await supabase.from('workflow_stages').select('id').is('company_id', null).eq('is_active', true).order('order_index').limit(1).single();
  const year = new Date().getFullYear();
  const { count } = await supabase.from('projects').select('*', { count: 'exact', head: true });
  const code = `TB-${year}-${String((count || 0) + 1).padStart(3, '0')}`;

  const { data: project, error } = await supabase.from('projects').insert({
    code, name, status: 'active',
    customer_id: customer_id || null,
    estimated_value: estimated_value || 0,
    flow_id: flows?.[0]?.id, current_stage_id: firstStage?.id,
    created_by: userId,
  }).select('*').single();
  if (error) throw error;

  if (template) {
    try { const { generateTasksForProject } = require('../helpers/autoFlow'); await generateTasksForProject(project.id, userId); } catch {}
  }

  return project;
}

// ─── HELPER: Create lead ────────────────────────────────────────────────

async function createLead({ title, customer_id, estimated_value }, userId) {
  const year = new Date().getFullYear();
  const { data: seqs } = await supabase.from('code_sequences').select('current_number, year').eq('prefix', 'LEAD').single();
  let num = 1;
  if (seqs) { num = seqs.year === year ? (seqs.current_number || 0) + 1 : 1; await supabase.from('code_sequences').update({ current_number: num, year }).eq('prefix', 'LEAD'); }
  else { await supabase.from('code_sequences').insert({ prefix: 'LEAD', current_number: 1, year }); }
  const code = `LEAD-${year}-${String(num).padStart(3, '0')}`;

  const { data: stages } = await supabase.from('crm_pipeline_stages').select('id').order('order_index').limit(1);
  const { data: lead, error } = await supabase.from('crm_leads').insert({
    code, title, customer_id: customer_id || null,
    estimated_value: estimated_value || 0,
    stage_id: stages?.[0]?.id, created_by: userId,
  }).select('*').single();
  if (error) throw error;
  return lead;
}

// ─── HELPER: Find customer by name ──────────────────────────────────────

function findCustomer(name, customers) {
  if (!name) return null;
  const n = name.toLowerCase().trim();
  return customers.find(c => c.name.toLowerCase() === n) ||
    customers.find(c => c.name.toLowerCase().includes(n)) ||
    customers.find(c => n.includes(c.name.toLowerCase()));
}

// ─── SUGGEST NEXT ACTIONS ───────────────────────────────────────────────

async function suggestNextActions(userId) {
  const ctx = await buildContext(userId);
  const suggestions = [];

  if (ctx.overdueTasks > 0) {
    suggestions.push({ priority: 'high', icon: '🔴', type: 'overdue_tasks',
      message: `${ctx.overdueTasks} nhiệm vụ quá hạn`, detail: ctx.overdueTasksList.join(', '), action: '/my-tasks' });
  }
  if (ctx.overdueFollowUps > 0) {
    suggestions.push({ priority: 'high', icon: '📞', type: 'follow_up',
      message: `${ctx.overdueFollowUps} lead cần follow-up`, detail: ctx.overdueFollowUpsList.join(', '), action: '/crm' });
  }
  if (ctx.unpaidInvoices > 0) {
    suggestions.push({ priority: 'medium', icon: '💰', type: 'collect_payment',
      message: `${ctx.unpaidInvoices} hóa đơn chưa thu (${new Intl.NumberFormat('vi-VN').format(ctx.totalDebt)}đ)`, action: '/crm/invoices' });
  }
  if (ctx.myTasks > 0 && ctx.overdueTasks === 0) {
    suggestions.push({ priority: 'low', icon: '📋', type: 'do_tasks',
      message: `${ctx.myTasks} nhiệm vụ đang chờ`, action: '/my-tasks' });
  }
  if (ctx.openLeads > 0) {
    suggestions.push({ priority: 'low', icon: '🎯', type: 'nurture_leads',
      message: `${ctx.openLeads} cơ hội đang mở`, action: '/crm' });
  }
  return { suggestions, context: ctx };
}

// ─── SMART PARSER: Nhận diện ý định + trích xuất data ────────────────────

function parseCreateProject(msg, customers) {
  // "Tạo dự án Tủ bếp Anh Minh cho Nguyễn Văn Minh giá 150 triệu"
  const m = msg.match(/(?:tạo|thêm)\s+dự\s*án\s+(.+?)(?:\s+(?:cho|khách|kh)\s+(.+?))?(?:\s+(?:giá|giá trị|value)\s+(\d[\d.,]*)\s*(triệu|tr|nghìn|k)?)?$/i);
  if (!m) return null;

  const name = m[1]?.replace(/(?:cho|khách|kh)\s+.*/i, '').trim();
  const customerName = m[2]?.replace(/(?:giá|giá trị|value)\s+.*/i, '').trim();
  let value = parseFloat((m[3] || '0').replace(/[.,]/g, ''));
  const unit = m[4]?.toLowerCase();
  if (unit === 'triệu' || unit === 'tr') value *= 1000000;
  else if (unit === 'nghìn' || unit === 'k') value *= 1000;

  const customer = findCustomer(customerName, customers);

  return { name: name || 'Dự án mới', customer_id: customer?.id, customer_name: customer?.name || customerName, estimated_value: value, template: true };
}

function parseCreateLead(msg, customers) {
  const m = msg.match(/(?:tạo|thêm)\s+lead\s+(.+?)(?:\s+(?:khách|kh|cho)\s+(.+?))?(?:\s+(?:giá|giá trị|value)\s+(\d[\d.,]*)\s*(triệu|tr|nghìn|k)?)?$/i);
  if (!m) return null;

  const title = m[1]?.replace(/(?:cho|khách|kh)\s+.*/i, '').trim();
  const customerName = m[2]?.replace(/(?:giá|giá trị|value)\s+.*/i, '').trim();
  let value = parseFloat((m[3] || '0').replace(/[.,]/g, ''));
  const unit = m[4]?.toLowerCase();
  if (unit === 'triệu' || unit === 'tr') value *= 1000000;
  else if (unit === 'nghìn' || unit === 'k') value *= 1000;

  const customer = findCustomer(customerName, customers);

  return { title: title || 'Lead mới', customer_id: customer?.id, customer_name: customer?.name || customerName, estimated_value: value };
}

// ─── MAIN CHAT ──────────────────────────────────────────────────────────

r.post('/chat', async (req, res) => {
  try {
    const { message, conversation = [] } = req.body;
    if (!message) return res.status(400).json({ error: 'Nhập tin nhắn' });

    const ctx = await buildContext(req.user.userId);
    const apiKey = process.env.OPENAI_API_KEY;

    // ── RULE-BASED: Try parse direct actions first (works with or without AI) ──
    const msg = message.toLowerCase().trim();

    // Direct create project
    if (msg.match(/(tạo|thêm)\s+(dự\s*án|project)/)) {
      const parsed = parseCreateProject(message, ctx.customers);

      if (parsed && parsed.name && parsed.name !== 'Dự án mới') {
        // Enough info → create directly
        try {
          const project = await createProject(parsed, req.user.userId);
          return res.json({
            reply: `✅ **Đã tạo dự án thành công!**\n\n📁 Mã: **${project.code}**\n📝 Tên: ${parsed.name}\n👤 KH: ${parsed.customer_name || 'Chưa chọn'}\n💰 Giá trị: ${new Intl.NumberFormat('vi-VN').format(parsed.estimated_value || 0)}đ\n📋 Nhiệm vụ mẫu: Đã tạo\n\n🔗 Click để xem →`,
            action: { action: 'navigate', url: `/projects/${project.id}` },
            created: { type: 'project', id: project.id, code: project.code },
          });
        } catch (e) {
          return res.json({ reply: `❌ Lỗi tạo dự án: ${e.message}` });
        }
      }

      // Not enough info → ask with customer list
      const customerList = ctx.customers.slice(0, 15).map((c, i) => `${i + 1}. ${c.name}`).join('\n');
      return res.json({
        reply: `🏗️ **Tạo dự án mới**\n\nVui lòng cho biết:\n• Tên dự án? (VD: "Tủ bếp căn hộ A.Minh")\n• Khách hàng?\n\n📋 **Chọn KH:**\n${customerList}\n\n💡 Gõ: "Tạo dự án [tên] cho [tên KH]"\nVD: "Tạo dự án Tủ bếp gỗ sồi cho ${ctx.customers[0]?.name || 'Nguyễn Văn A'}"`,
        action: { action: 'prompt_create_project', customers: ctx.customers.slice(0, 15) },
      });
    }

    // Direct create lead
    if (msg.match(/(tạo|thêm)\s+(lead|cơ hội)/)) {
      const parsed = parseCreateLead(message, ctx.customers);

      if (parsed && parsed.title && parsed.title !== 'Lead mới') {
        try {
          const lead = await createLead(parsed, req.user.userId);
          return res.json({
            reply: `✅ **Đã tạo lead thành công!**\n\n🎯 Mã: **${lead.code}**\n📝 Tên: ${parsed.title}\n👤 KH: ${parsed.customer_name || 'Chưa chọn'}\n💰 Giá trị: ${new Intl.NumberFormat('vi-VN').format(parsed.estimated_value || 0)}đ`,
            action: { action: 'navigate', url: `/crm/leads/${lead.id}` },
            created: { type: 'lead', id: lead.id, code: lead.code },
          });
        } catch (e) {
          return res.json({ reply: `❌ Lỗi tạo lead: ${e.message}` });
        }
      }

      const customerList = ctx.customers.slice(0, 15).map((c, i) => `${i + 1}. ${c.name}`).join('\n');
      return res.json({
        reply: `🎯 **Tạo Lead mới**\n\nVui lòng cho biết:\n• Tên cơ hội?\n• Khách hàng?\n• Giá trị ước tính?\n\n📋 **Chọn KH:**\n${customerList}\n\n💡 Gõ: "Tạo lead [tên] cho [tên KH] giá [số] triệu"`,
        action: { action: 'prompt_create_lead', customers: ctx.customers.slice(0, 15) },
      });
    }

    // Suggest
    if (msg.match(/(làm gì|việc gì|gợi ý|tiếp theo|nên làm|suggest|next)/)) {
      const { suggestions } = await suggestNextActions(req.user.userId);
      if (!suggestions.length) return res.json({ reply: '✅ Không có việc gấp! Tốt lắm 👏' });
      const lines = suggestions.map(s => `${s.icon} **${s.message}**${s.detail ? `\n   _${s.detail}_` : ''}`);
      return res.json({ reply: `📋 **Việc cần làm:**\n\n${lines.join('\n\n')}`, action: { action: 'suggest', suggestions } });
    }

    // Report
    if (msg.match(/(báo cáo|thống kê|doanh thu|report|tổng quan|overview)/)) {
      const fmt = (n) => new Intl.NumberFormat('vi-VN').format(n);
      return res.json({ reply: `📊 **Tổng quan:**\n\n🏗️ Dự án: **${ctx.activeProjects}**\n📋 Nhiệm vụ: **${ctx.myTasks}** (${ctx.overdueTasks} quá hạn)\n🎯 Lead: **${ctx.openLeads}**\n📦 Đơn hàng: **${ctx.pendingOrders}**\n💰 Công nợ: **${fmt(ctx.totalDebt)}đ** (${ctx.unpaidInvoices} HĐ)` });
    }

    // Overdue
    if (msg.match(/(quá hạn|trễ hạn|overdue|muộn)/)) {
      if (ctx.overdueTasks === 0 && ctx.overdueFollowUps === 0) return res.json({ reply: '✅ Không có gì quá hạn! 👏' });
      let reply = '⚠️ **Quá hạn:**\n\n';
      if (ctx.overdueTasks > 0) reply += `🔴 ${ctx.overdueTasks} nhiệm vụ: ${ctx.overdueTasksList.join(', ')}\n`;
      if (ctx.overdueFollowUps > 0) reply += `📞 ${ctx.overdueFollowUps} follow-up: ${ctx.overdueFollowUpsList.join(', ')}`;
      return res.json({ reply });
    }

    // Greeting
    if (msg.match(/^(xin chào|hello|hi|chào|hey)/)) {
      return res.json({ reply: `👋 Chào bạn! Tôi là trợ lý TuBep Pro.\n\n• ${ctx.myTasks} nhiệm vụ (${ctx.overdueTasks} quá hạn)\n• ${ctx.openLeads} cơ hội\n• ${ctx.unpaidInvoices} HĐ chưa thu\n\nTôi giúp gì?` });
    }

    // Pipeline
    if (msg.match(/(pipeline|phễu|funnel)/)) {
      const stageCount = {};
      ctx.leads.forEach(l => { const s = l.stage || '?'; stageCount[s] = (stageCount[s] || 0) + 1; });
      return res.json({ reply: `🎯 **Pipeline:**\n\n${Object.entries(stageCount).map(([s, c]) => `• ${s}: ${c}`).join('\n')}\n\nTổng: ${ctx.openLeads} leads` });
    }

    // Customers
    if (msg.match(/(khách hàng|customer|danh sách kh)/)) {
      return res.json({ reply: `👥 **KH (${ctx.customers.length}):**\n\n${ctx.customers.slice(0, 15).map(c => `• ${c.name}${c.phone ? ` — ${c.phone}` : ''}`).join('\n')}` });
    }

    // Help
    if (msg.match(/(help|trợ giúp|hướng dẫn|lệnh)/)) {
      return res.json({ reply: `🤖 **Lệnh:**\n\n• "Tạo dự án [tên] cho [KH]" → tạo ngay\n• "Tạo lead [tên] cho [KH] giá [số] triệu"\n• "Gợi ý việc cần làm"\n• "Báo cáo tổng quan"\n• "Quá hạn gì?"\n• "Danh sách khách hàng"\n• Hoặc hỏi tự do (cần OpenAI key)` });
    }

    // ── OPENAI: Free-form chat ──
    if (apiKey) {
      const aiResponse = await callOpenAI(apiKey, message, conversation, ctx);
      
      // If AI returns action, execute it
      if (aiResponse.action?.action === 'create_project' && aiResponse.action.data) {
        try {
          const d = aiResponse.action.data;
          const customer = d.customer_id ? null : findCustomer(d.customer_name, ctx.customers);
          const project = await createProject({ ...d, customer_id: d.customer_id || customer?.id, template: true }, req.user.userId);
          return res.json({
            reply: `${aiResponse.reply}\n\n✅ Đã tạo: **${project.code}**`,
            action: { action: 'navigate', url: `/projects/${project.id}` },
            created: { type: 'project', id: project.id, code: project.code },
          });
        } catch (e) {
          return res.json({ reply: `${aiResponse.reply}\n\n❌ Lỗi tạo: ${e.message}` });
        }
      }

      if (aiResponse.action?.action === 'create_lead' && aiResponse.action.data) {
        try {
          const d = aiResponse.action.data;
          const customer = d.customer_id ? null : findCustomer(d.customer_name, ctx.customers);
          const lead = await createLead({ ...d, customer_id: d.customer_id || customer?.id }, req.user.userId);
          return res.json({
            reply: `${aiResponse.reply}\n\n✅ Đã tạo: **${lead.code}**`,
            action: { action: 'navigate', url: `/crm/leads/${lead.id}` },
            created: { type: 'lead', id: lead.id, code: lead.code },
          });
        } catch (e) {
          return res.json({ reply: `${aiResponse.reply}\n\n❌ Lỗi tạo: ${e.message}` });
        }
      }

      return res.json(aiResponse);
    }

    // Default
    res.json({ reply: `Tôi hiểu: "${message}"\n\nThử:\n• "Tạo dự án [tên] cho [KH]"\n• "Gợi ý việc cần làm"\n• "Báo cáo"\n\n💡 Thêm OPENAI_API_KEY để chat tự do.` });
  } catch (e) {
    console.error('Chat error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── OPENAI ─────────────────────────────────────────────────────────────

async function callOpenAI(apiKey, message, conversation, ctx) {
  const systemPrompt = `Bạn là trợ lý AI của TuBep Pro — quản lý công việc & CRM tủ bếp.

CONTEXT:
- ${ctx.activeProjects} dự án, ${ctx.myTasks} tasks (${ctx.overdueTasks} quá hạn)
- ${ctx.openLeads} leads, ${ctx.pendingOrders} ĐH, ${ctx.unpaidInvoices} HĐ chưa thu
- Nợ: ${new Intl.NumberFormat('vi-VN').format(ctx.totalDebt)}đ

KH: ${ctx.customers.slice(0, 20).map(c => `${c.name}(${c.id.slice(0,8)})`).join(', ')}
DA: ${ctx.projects.map(p => `${p.code}:${p.name}`).join(', ')}

QUAN TRỌNG - KHI USER MUỐN TẠO:
Trả JSON block chính xác format này (trong \`\`\`json):
Tạo dự án: {"action":"create_project","data":{"name":"tên","customer_id":"id hoặc null","customer_name":"tên KH","estimated_value":0}}
Tạo lead: {"action":"create_lead","data":{"title":"tên","customer_id":"id hoặc null","customer_name":"tên KH","estimated_value":0}}

Luôn match tên KH với danh sách KH ở trên để lấy đúng customer_id.
Trả lời tiếng Việt, ngắn gọn, có emoji.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversation.slice(-10).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: message },
  ];

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages, temperature: 0.7, max_tokens: 1000 }),
  });

  if (!response.ok) throw new Error(`OpenAI: ${response.status}`);

  const data = await response.json();
  const content = data.choices[0].message.content;

  let action = null;
  try {
    const m = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (m) action = JSON.parse(m[1]);
  } catch {}

  return { reply: content.replace(/```json\s*[\s\S]*?\s*```/g, '').trim(), action, source: 'openai' };
}

// ─── SUGGESTIONS ENDPOINT ───────────────────────────────────────────────

r.get('/suggestions', async (req, res) => {
  try { res.json(await suggestNextActions(req.user.userId)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── EXECUTE ENDPOINT (backup) ──────────────────────────────────────────

r.post('/execute', async (req, res) => {
  try {
    const { action, data } = req.body;
    if (action === 'create_project') {
      const project = await createProject(data, req.user.userId);
      return res.json({ success: true, project, message: `✅ Đã tạo ${project.code}` });
    }
    if (action === 'create_lead') {
      const lead = await createLead(data, req.user.userId);
      return res.json({ success: true, lead, message: `✅ Đã tạo ${lead.code}` });
    }
    res.status(400).json({ error: `Action "${action}" chưa hỗ trợ` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = r;
