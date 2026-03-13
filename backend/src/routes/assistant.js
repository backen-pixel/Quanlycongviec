// ═══════════════════════════════════════════════════════════════════════════
// AI ASSISTANT ENGINE — Chat thông minh cho TuBep Pro
// ═══════════════════════════════════════════════════════════════════════════
//
// Chức năng:
// 1. Gợi ý việc cần làm tiếp theo
// 2. Tạo dự án qua chat (hỏi KH, luồng, template)
// 3. Tạo lead, báo giá, tasks qua chat
// 4. Báo cáo nhanh (doanh thu, tiến độ, quá hạn)
// 5. Trả lời câu hỏi về dữ liệu

const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { supabase } = require('../config/supabase');

const r = Router();
r.use(auth);

// ─── CONTEXT BUILDER: Thu thập data cho AI ──────────────────────────────

async function buildContext(userId) {
  const [projects, tasks, leads, orders, invoices, customers, stages] = await Promise.all([
    supabase.from('projects').select('id, code, name, status, estimated_value, current_stage_id, customer_id').eq('status', 'active').order('created_at', { ascending: false }).limit(20),
    supabase.from('tasks').select('id, title, status, priority, due_date, project_id, assignee_id').eq('assignee_id', userId).neq('status', 'done').order('due_date').limit(30),
    supabase.from('crm_leads').select('id, code, title, estimated_value, stage_id, customer_id, next_follow_up, stage:crm_pipeline_stages(name, is_won, is_lost)').is('actual_close_date', null).order('created_at', { ascending: false }).limit(20),
    supabase.from('orders').select('id, code, total, status, paid_amount').neq('status', 'delivered').neq('status', 'cancelled').limit(20),
    supabase.from('invoices').select('id, code, total, paid_amount, payment_status').neq('payment_status', 'paid').limit(20),
    supabase.from('customers').select('id, full_name, phone').order('full_name').limit(50),
    supabase.from('workflow_stages').select('id, name, slug, order_index').is('company_id', null).eq('is_active', true).order('order_index'),
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
    customers: (customers.data || []).slice(0, 30).map(c => ({ id: c.id, name: c.full_name })),
    stages: (stages.data || []).map(s => ({ id: s.id, name: s.name, slug: s.slug })),
    projects: (projects.data || []).slice(0, 10).map(p => ({ id: p.id, code: p.code, name: p.name, status: p.status })),
    leads: (leads.data || []).slice(0, 10).map(l => ({ id: l.id, code: l.code, title: l.title, stage: l.stage?.name })),
  };
}

// ─── SUGGEST NEXT ACTIONS ───────────────────────────────────────────────

async function suggestNextActions(userId) {
  const ctx = await buildContext(userId);
  const suggestions = [];

  // Priority 1: Overdue tasks
  if (ctx.overdueTasks > 0) {
    suggestions.push({ priority: 'high', icon: '🔴', type: 'overdue_tasks',
      message: `Bạn có ${ctx.overdueTasks} nhiệm vụ quá hạn cần hoàn thành ngay`,
      detail: ctx.overdueTasksList.join(', '), action: '/my-tasks' });
  }

  // Priority 2: Follow-up overdue
  if (ctx.overdueFollowUps > 0) {
    suggestions.push({ priority: 'high', icon: '📞', type: 'follow_up',
      message: `${ctx.overdueFollowUps} lead cần follow-up (quá hạn)`,
      detail: ctx.overdueFollowUpsList.join(', '), action: '/crm' });
  }

  // Priority 3: Unpaid invoices
  if (ctx.unpaidInvoices > 0) {
    const fmt = new Intl.NumberFormat('vi-VN').format(ctx.totalDebt);
    suggestions.push({ priority: 'medium', icon: '💰', type: 'collect_payment',
      message: `${ctx.unpaidInvoices} hóa đơn chưa thu (${fmt}đ)`,
      action: '/crm/invoices' });
  }

  // Priority 4: Pending tasks
  if (ctx.myTasks > 0 && ctx.overdueTasks === 0) {
    suggestions.push({ priority: 'low', icon: '📋', type: 'do_tasks',
      message: `Bạn có ${ctx.myTasks} nhiệm vụ đang chờ`, action: '/my-tasks' });
  }

  // Priority 5: Open leads
  if (ctx.openLeads > 0) {
    suggestions.push({ priority: 'low', icon: '🎯', type: 'nurture_leads',
      message: `${ctx.openLeads} cơ hội đang mở — hãy chăm sóc`, action: '/crm' });
  }

  return { suggestions, context: ctx };
}

// ─── AI CHAT ENDPOINT ───────────────────────────────────────────────────

r.post('/chat', async (req, res) => {
  try {
    const { message, conversation = [] } = req.body;
    if (!message) return res.status(400).json({ error: 'Nhập tin nhắn' });

    const ctx = await buildContext(req.user.userId);

    // Check if OpenAI key is configured
    const apiKey = process.env.OPENAI_API_KEY;

    if (apiKey) {
      // Use OpenAI
      const aiResponse = await callOpenAI(apiKey, message, conversation, ctx, req.user);
      return res.json(aiResponse);
    }

    // Fallback: Smart rule-based assistant
    const response = await ruleBasedAssistant(message, ctx, req.user.userId);
    res.json(response);
  } catch (e) {
    console.error('AI Chat error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── OPENAI INTEGRATION ────────────────────────────────────────────────

async function callOpenAI(apiKey, message, conversation, ctx, user) {
  const systemPrompt = `Bạn là trợ lý AI của TuBep Pro — hệ thống quản lý công việc và CRM cho công ty tủ bếp.

NGỮ CẢNH HIỆN TẠI:
- ${ctx.activeProjects} dự án đang chạy
- ${ctx.myTasks} nhiệm vụ chưa xong (${ctx.overdueTasks} quá hạn)
- ${ctx.openLeads} lead/cơ hội đang mở (${ctx.overdueFollowUps} quá hạn follow-up)
- ${ctx.pendingOrders} đơn hàng đang xử lý
- ${ctx.unpaidInvoices} hóa đơn chưa thu (nợ: ${new Intl.NumberFormat('vi-VN').format(ctx.totalDebt)}đ)

DANH SÁCH KHÁCH HÀNG: ${ctx.customers.map(c => `${c.name} (${c.id.slice(0,8)})`).join(', ')}
DỰ ÁN: ${ctx.projects.map(p => `${p.code}: ${p.name}`).join(', ')}
LEADS: ${ctx.leads.map(l => `${l.code}: ${l.title} [${l.stage}]`).join(', ')}
QUY TRÌNH: ${ctx.stages.map(s => s.name).join(' → ')}

KHẢ NĂNG:
1. Gợi ý việc cần làm tiếp theo
2. Hướng dẫn tạo dự án, lead, báo giá
3. Báo cáo nhanh: doanh thu, tiến độ, quá hạn
4. Trả lời câu hỏi về dữ liệu
5. Khi user muốn TẠO gì đó, trả JSON action

KHI USER MUỐN TẠO/THỰC HIỆN:
Trả response bình thường + thêm field "action" nếu cần thực hiện:
- Tạo dự án: {"action":"create_project","data":{"name":"...","customer_id":"...","template":true}}
- Tạo lead: {"action":"create_lead","data":{"title":"...","customer_id":"...","estimated_value":0}}
- Gợi ý: {"action":"suggest","suggestions":[...]}
- Báo cáo: {"action":"report","type":"revenue|overdue|pipeline"}

Trả lời bằng tiếng Việt, ngắn gọn, thân thiện. Dùng emoji.
Nếu thiếu thông tin để tạo, hãy HỎI (đừng tự đoán).`;

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

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI error: ${response.status} ${err}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;

  // Try parse action from AI response
  let action = null;
  try {
    const actionMatch = content.match(/```json\n([\s\S]*?)\n```/);
    if (actionMatch) action = JSON.parse(actionMatch[1]);
  } catch {}

  return { reply: content.replace(/```json\n[\s\S]*?\n```/g, '').trim(), action, source: 'openai' };
}

// ─── RULE-BASED FALLBACK (không cần API key) ────────────────────────────

async function ruleBasedAssistant(message, ctx, userId) {
  const msg = message.toLowerCase().trim();

  // Greeting
  if (msg.match(/^(xin chào|hello|hi|chào|hey)/)) {
    return { reply: `👋 Xin chào! Tôi là trợ lý AI của TuBep Pro.\n\nHiện tại bạn có:\n• ${ctx.myTasks} nhiệm vụ (${ctx.overdueTasks} quá hạn)\n• ${ctx.openLeads} cơ hội bán hàng\n• ${ctx.unpaidInvoices} hóa đơn chưa thu\n\nTôi có thể giúp gì?` };
  }

  // Suggest / What to do
  if (msg.match(/(làm gì|việc gì|gợi ý|tiếp theo|nên làm|suggest|next)/)) {
    const { suggestions } = await suggestNextActions(userId);
    if (!suggestions.length) return { reply: '✅ Tuyệt vời! Không có việc gấp. Bạn có thể chăm sóc lead hoặc kiểm tra tiến độ dự án.' };
    const lines = suggestions.map(s => `${s.icon} **${s.message}**${s.detail ? `\n   _${s.detail}_` : ''}`);
    return { reply: `📋 **Việc cần làm:**\n\n${lines.join('\n\n')}`, action: { action: 'suggest', suggestions } };
  }

  // Report / Stats
  if (msg.match(/(báo cáo|thống kê|doanh thu|report|tổng quan|overview)/)) {
    const fmt = (n) => new Intl.NumberFormat('vi-VN').format(n);
    return { reply: `📊 **Tổng quan nhanh:**\n\n🏗️ Dự án đang chạy: **${ctx.activeProjects}**\n📋 Nhiệm vụ của bạn: **${ctx.myTasks}** (${ctx.overdueTasks} quá hạn)\n🎯 Lead đang mở: **${ctx.openLeads}**\n📦 ĐH đang xử lý: **${ctx.pendingOrders}**\n💰 Công nợ: **${fmt(ctx.totalDebt)}đ** (${ctx.unpaidInvoices} HĐ)`,
      action: { action: 'report', type: 'overview' } };
  }

  // Overdue
  if (msg.match(/(quá hạn|trễ hạn|overdue|muộn)/)) {
    if (ctx.overdueTasks === 0 && ctx.overdueFollowUps === 0) return { reply: '✅ Không có gì quá hạn! Tốt lắm 👏' };
    let reply = '⚠️ **Quá hạn:**\n\n';
    if (ctx.overdueTasks > 0) reply += `🔴 ${ctx.overdueTasks} nhiệm vụ: ${ctx.overdueTasksList.join(', ')}\n`;
    if (ctx.overdueFollowUps > 0) reply += `📞 ${ctx.overdueFollowUps} follow-up: ${ctx.overdueFollowUpsList.join(', ')}`;
    return { reply };
  }

  // Create project
  if (msg.match(/(tạo dự án|dự án mới|create project|thêm dự án)/)) {
    return {
      reply: '🏗️ **Tạo dự án mới**\n\nChọn thông tin:\n1. Khách hàng?\n2. Tên dự án?\n3. Giá trị ước tính?\n4. Dùng mẫu nhiệm vụ mặc định?\n\nHoặc gõ: "Tạo dự án [tên] cho [khách hàng]"',
      action: { action: 'prompt_create_project', customers: ctx.customers.slice(0, 10) },
    };
  }

  // Create lead
  if (msg.match(/(tạo lead|lead mới|thêm cơ hội|cơ hội mới)/)) {
    return {
      reply: '🎯 **Tạo Lead mới**\n\nCần thông tin:\n1. Tên cơ hội?\n2. Khách hàng?\n3. Giá trị ước tính?\n\nHoặc gõ: "Tạo lead [tên] KH [tên KH] giá trị [số]"',
      action: { action: 'prompt_create_lead', customers: ctx.customers.slice(0, 10) },
    };
  }

  // Pipeline
  if (msg.match(/(pipeline|phễu|funnel|lead.*giai đoạn)/)) {
    const stageCount = {};
    ctx.leads.forEach(l => { const s = l.stage || 'Chưa rõ'; stageCount[s] = (stageCount[s] || 0) + 1; });
    const lines = Object.entries(stageCount).map(([s, c]) => `• ${s}: ${c}`);
    return { reply: `🎯 **Pipeline:**\n\n${lines.join('\n')}\n\nTổng: ${ctx.openLeads} leads` };
  }

  // Customer list
  if (msg.match(/(khách hàng|customer|danh sách kh)/)) {
    const list = ctx.customers.slice(0, 10).map(c => `• ${c.name}`).join('\n');
    return { reply: `👥 **Khách hàng (top 10):**\n\n${list}\n\n_Tổng: ${ctx.customers.length} KH_` };
  }

  // Help
  if (msg.match(/(help|trợ giúp|hướng dẫn|commands|lệnh)/)) {
    return { reply: `🤖 **Tôi có thể giúp:**\n\n• "Gợi ý việc cần làm"\n• "Báo cáo tổng quan"\n• "Quá hạn gì?"\n• "Tạo dự án mới"\n• "Tạo lead mới"\n• "Pipeline đang thế nào?"\n• "Danh sách khách hàng"\n• Hoặc hỏi bất kỳ câu hỏi nào!` };
  }

  // Default
  return { reply: `Tôi hiểu bạn muốn: "${message}"\n\nTôi có thể:\n• Gợi ý việc cần làm\n• Báo cáo nhanh\n• Tạo dự án/lead\n• Trả lời câu hỏi\n\n💡 _Để thông minh hơn, thêm OPENAI_API_KEY vào biến môi trường._` };
}

// ─── ENDPOINTS ──────────────────────────────────────────────────────────

r.get('/suggestions', async (req, res) => {
  try {
    const result = await suggestNextActions(req.user.userId);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Execute action from AI
r.post('/execute', async (req, res) => {
  try {
    const { action, data } = req.body;

    if (action === 'create_project') {
      const { data: flows } = await supabase.from('workflow_flows').select('id').limit(1);
      const { data: firstStage } = await supabase.from('workflow_stages').select('id').is('company_id', null).eq('is_active', true).order('order_index').limit(1).single();
      const year = new Date().getFullYear();
      const { count } = await supabase.from('projects').select('*', { count: 'exact', head: true });
      const code = `TB-${year}-${String((count || 0) + 1).padStart(3, '0')}`;

      const { data: project, error } = await supabase.from('projects').insert({
        code, name: data.name, status: 'active',
        customer_id: data.customer_id || null,
        estimated_value: data.estimated_value || 0,
        flow_id: flows?.[0]?.id, current_stage_id: firstStage?.id,
        created_by: req.user.userId,
      }).select('*').single();
      if (error) throw error;

      // Gen tasks if template requested
      if (data.template) {
        const { generateTasksForProject } = require('../helpers/autoFlow');
        await generateTasksForProject(project.id, req.user.userId);
      }

      return res.json({ success: true, project, message: `✅ Đã tạo dự án ${code}` });
    }

    if (action === 'create_lead') {
      const { data: seqs } = await supabase.from('code_sequences').select('current_number, year').eq('prefix', 'LEAD').single();
      const year = new Date().getFullYear();
      let num = 1;
      if (seqs) { num = seqs.year === year ? (seqs.current_number || 0) + 1 : 1; await supabase.from('code_sequences').update({ current_number: num, year }).eq('prefix', 'LEAD'); }
      else { await supabase.from('code_sequences').insert({ prefix: 'LEAD', current_number: 1, year }); }
      const code = `LEAD-${year}-${String(num).padStart(3, '0')}`;

      const { data: stages } = await supabase.from('crm_pipeline_stages').select('id').order('order_index').limit(1);
      const { data: lead, error } = await supabase.from('crm_leads').insert({
        code, title: data.title, customer_id: data.customer_id || null,
        estimated_value: data.estimated_value || 0,
        stage_id: stages?.[0]?.id, created_by: req.user.userId,
      }).select('*').single();
      if (error) throw error;

      return res.json({ success: true, lead, message: `✅ Đã tạo lead ${code}` });
    }

    res.status(400).json({ error: `Action "${action}" chưa được hỗ trợ` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = r;
