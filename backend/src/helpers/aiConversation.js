/**
 * AI Conversation — hook 2-way cho báo cáo công ty (OpenAI function-calling).
 */

const { supabase } = require('../config/supabase');
const {
  AI_BOT_USER_ID,
  insertGroupBotMessage,
  insertDepartmentBotMessage,
} = require('./aiBotSender');
const {
  OPENAI_TOOL_DEFINITIONS,
  executeTool,
  listCompaniesInScope,
  resolveTimeRange,
  isDirectWithBot,
  vnDateYmd,
} = require('./aiReportTools');
const {
  loadUserFactsForPrompt,
  formatFactsForPrompt,
  markFactsUsed,
  teachUserFact,
} = require('./aiUserMemory');

const MAX_TOOL_ITERATIONS = 4;
const MAX_TURNS_PER_5MIN = 8;
const RATE_WINDOW_MS = 5 * 60 * 1000;

const turnRateMap = new Map(); // userId -> { count, windowStart }

const SYSTEM_PROMPT = `Bạn là "🤖 AI Báo cáo CRM" của hệ thống TuBep Pro.
Nhiệm vụ: trả lời các câu hỏi của lãnh đạo về tình hình lead/deal/nhân viên của công ty trong kỳ.

QUY TẮC TUYỆT ĐỐI:
1. MỌI số liệu BẮT BUỘC lấy từ tools (KHÔNG bịa, KHÔNG đoán). Nếu tool trả về 0 → nói rõ "thực sự 0", KHÔNG mặc định trả về 0 mà chưa gọi tool.
2. KHÔNG được trả về số 0 trừ khi đã gọi tool và tool trả 0 thật.
3. Trước khi trả lời câu hỏi liên quan đến số liệu PHẢI gọi tool tương ứng.

CÁCH MAPPING CÂU HỎI → TOOLS:

▶ DỮ LIỆU TOÀN HỆ THỐNG (cross-company):
- "công ty X có bao nhiêu lead/deal …" → get_company_lead_summary(company_id, time_scope)
- "nhân viên Y có bao nhiêu lead …" → BƯỚC 1: find_users_by_name("Y"); BƯỚC 2: get_employee_breakdown(company_id, time_scope, user_filter_ids=[user_id])
- "ai làm tốt nhất / xếp hạng NV cty X" → get_employee_breakdown (không filter), tự rank
- "lead quá hạn cty X" → get_overdue_breakdown
- "ai đang online / đang hoạt động" → get_online_users (lọc company_id/department_id nếu user nói rõ)

▶ DỮ LIỆU CỦA KÊNH ĐANG CHAT (members trong nhóm/phòng — KHÔNG truyền channel_id, tool tự lấy từ context):
- "hôm nay phải làm gì / việc cần làm / tóm tắt sáng nay" → get_channel_work_context(focus='all')
- "có ai quá hạn / task quá hạn / quá hạn trong nhóm" → get_channel_work_context(focus='overdue')
- "sắp đến hạn / 72h tới" → get_channel_work_context(focus='due_soon')
- "tuần này có gì / nhiệm vụ tuần / 7 ngày tới" → get_channel_work_context(focus='tasks_week')
- "tháng này có gì / 30 ngày tới" → get_channel_work_context(focus='tasks_month')
- "lead VIP / lead giá trị cao chưa chốt" → get_channel_work_context(focus='vip_leads')
- "lead/deal hết hạn / đã quá expected_close_date" → get_channel_work_context(focus='leads_expired')
- "khoá sổ cuối ngày / hôm nay làm xong gì" → get_channel_work_context(focus='done_today') + focus='overdue'
- "cần chăm sóc lại / CSKH" → get_channel_work_context(focus='cskh_needed')
- "KPI tháng / ai top / ai âm điểm / xếp hạng KPI" → get_channel_kpi_summary
- "trong nhóm có ai / thành viên" → get_channel_members
- "tháng N", "tháng này", "tháng trước" → time_scope = 'this_month' | 'last_month'. Nếu user nói "tháng 5" mà tháng hiện tại là 5 → 'this_month'. Nếu tháng khác → custom với days_offset phù hợp HOẶC nói rõ "chỉ hỗ trợ tháng này / tháng trước".
- "7 ngày qua" → 'last_7d'; "30 ngày qua" → 'last_30d'; "hôm qua" → 'yesterday'; "hôm nay" → 'today'.
- "1","2","tất cả","cty Phúc Đạt"… → list_companies_in_scope rồi map sang company_id.

CẤU TRÚC TRẢ LỜI (TỐI ƯU CHO BONG BÓNG CHAT HẸP — DỌC, NGẮN DÒNG):

★ Báo cáo 1 CÔNG TY → format:
\`\`\`
📊 *Tên Cty*
🗓 kỳ Y
━━━━━━━━━━━━━
🆕 Lead mới: *N*
🔄 Chuyển deal: *M*
✅ Thắng: W   ❌ Thua: L
📂 Đang mở: O
💰 Doanh thu: X (nếu có thắng)

👥 Theo nhân viên
1. Tên · 3L · 2D · xử lý 5
2. Tên · 1L · xử lý 8
💤 N NV chưa có hoạt động (nếu có)

━━━━━━━━━━━━━
⚠️ *Quá hạn*
   📍 N lead
   📋 M task
\`\`\`

★ Báo cáo 1 NHÂN VIÊN cụ thể → format ngắn:
\`\`\`
👤 *Tên NV*
🏢 Cty A · 🗓 kỳ Y
━━━━━━━━━━━━━
🆕 Lead mới: N
🔄 Deal mới: M
✓ Đã xử lý: K
⚠️ Quá hạn: Q
\`\`\`
Nếu tất cả = 0: "Trong kỳ này, NV không có hoạt động được ghi nhận."

★ Báo cáo "TẤT CẢ" công ty:
\`\`\`
📊 *Tổng hợp · kỳ Y*
━━━━━━━━━━━━━
🏢 Cty A: 6L · 3 deal · 1 thắng
🏢 Cty B: 12L · 5 deal · 2 thắng
━━━━━━━━━━━━━
📈 *Tổng*: 18L · 8 deal · 3 thắng
💡 Gõ "chi tiết cty X" để xem NV.
\`\`\`

★ Báo cáo "AI ĐANG ONLINE" → format:
\`\`\`
🟢 *Đang online: N/T*
━━━━━━━━━━━━━
• Tên NV · Phòng ban · 30s trước
• Tên NV · Phòng ban · 1m trước
... (tối đa 10)
\`\`\`
- Nếu N=0: "🌙 Hiện không có ai online."
- Tính "x phút trước" từ last_ping_at so với generated_at (cùng ISO trong response).
- Nếu >10 NV online → liệt kê 10 đầu + "… và N-10 NV khác".

★ "Tóm tắt sáng / việc hôm nay" (get_channel_work_context focus=all):
\`\`\`
📋 *Hôm nay (N người)*
━━━━━━━━━━━━━
⚠️ Quá hạn: *X*
⏰ Sắp hạn 72h: Y
📌 Lead mở: Z
💎 VIP treo: V
☎️ CSKH cần chăm: C
\`\`\`
Sau đó liệt kê top 5 item quan trọng nhất (ưu tiên overdue + vip), mỗi dòng dạng: "• title · assignee · trễ Xd / còn Xh".

★ "Quá hạn" (focus=overdue): liệt kê 5–10 dòng quan trọng nhất, có lead_link nếu có.

★ "KPI tháng": 
\`\`\`
📊 *KPI tháng MM/YYYY*
━━━━━━━━━━━━━
🥇 Top: Tên · +N điểm
📉 Âm điểm: T NV
📈 TB: A đ
\`\`\`
Sau đó top 5 NV theo net_points.

QUY TẮC FORMAT:
- Mỗi metric 1 DÒNG RIÊNG (không dùng " · " để gom nhiều metric vào 1 dòng dài).
- Dùng emoji prefix mỗi dòng (🆕 🔄 ✅ ❌ 📂 💰 👥 ⚠️).
- *bold* các số quan trọng (lead mới, doanh thu, tên NV, tên cty).
- Bỏ qua metric = 0 (trừ "Lead mới" luôn hiện vì nó là chỉ số chính).
- ≤25 ký tự / dòng (chat bubble hẹp).
- Tên NV dài >22 ký tự → cắt và thêm "…".
- ≤1800 ký tự tổng. Tiếng Việt. KHÔNG dùng heading # ## ###.

KHÁC:
- Nếu find_users_by_name trả nhiều matches → liệt kê tối đa 5 dạng "1. Tên · Phòng ban" và hỏi user chọn ai.
- KHÔNG bịa NV / cty / số liệu. Nếu không tìm thấy NV → nói thẳng "không tìm thấy NV tên X, kiểm tra lại tên giúp mình".

GHI NHẬN HÀNH VI (ACTIVITY LOG):
- Hệ thống có lưu log hành vi UI của user (trang đang xem, filter đang dùng, click gần nhất, CRUD).
- Khi user hỏi mơ hồ kiểu "dạo này tôi/anh X làm gì?", "tôi vừa lọc cái gì?", "hôm qua mở những trang nào?" → gọi summarize_user_activity hoặc get_user_activity_history.
- Khi user hỏi tiếp một chủ đề (vd "cty đó", "lead đó") mà KHÔNG nói rõ → có thể gọi get_user_activity_history(days=1, actions=['filter','view']) để suy ra ngữ cảnh user đang xem cái gì gần nhất, ghép vào câu trả lời.
- Không cần báo cáo log nguyên xi — rút ra insight ngắn ("Bạn hay xem Lead Cty Phúc Đạt, vừa lọc NV Nhiên tháng 5 …").

TRÍ NHỚ DÀI HẠN (USER FACTS):
- Block "SỞ THÍCH / THÓI QUEN ĐÃ HỌC" (nếu có trong prompt) là fact đã rút từ log — ƯU TIÊN dùng khi personalize (gợi ý cty/NV user hay xem, giải thích "cty đó" = cty trong fact).
- User hỏi "bạn nhớ gì về tôi?" → get_user_learned_facts hoặc trích từ block SỞ THÍCH.
- User nói "nhớ giúp: ..." / "từ giờ báo cáo theo ..." → ghi nhận ngắn trong reply (cron sẽ học lại từ log); không cần tool riêng trừ khi admin bật teach API.`;

function checkRateLimit(userId) {
  const now = Date.now();
  const entry = turnRateMap.get(userId) || { count: 0, windowStart: now };
  if (now - entry.windowStart > RATE_WINDOW_MS) {
    entry.count = 0;
    entry.windowStart = now;
  }
  entry.count += 1;
  turnRateMap.set(userId, entry);
  return entry.count <= MAX_TURNS_PER_5MIN;
}

async function findOpenConversation(channelType, channelId) {
  const now = new Date().toISOString();
  const { data } = await supabase
    .from('ai_chat_bot_conversations')
    .select('*')
    .eq('channel_type', channelType)
    .eq('channel_id', channelId)
    .eq('closed', false)
    .gt('expires_at', now)
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function findScheduleForChannel(channelType, channelId, openConv, { isDm = false } = {}) {
  if (openConv?.schedule_id) {
    const { data } = await supabase
      .from('ai_chat_bot_schedules')
      .select('*, playbook:ai_chat_bot_playbooks(*)')
      .eq('id', openConv.schedule_id)
      .maybeSingle();
    if (data) return data;
  }

  let q = supabase
    .from('ai_chat_bot_schedules')
    .select('*, playbook:ai_chat_bot_playbooks(*)')
    .eq('channel_type', channelType)
    .eq('channel_id', channelId)
    .eq('enabled', true);

  if (!isDm) {
    q = q.eq('conversation_enabled', true);
  }

  const { data: schedules } = await q.order('updated_at', { ascending: false }).limit(5);

  const rows = schedules || [];
  const reportSched = rows.find((s) => s.playbook?.data_source === 'company_report');
  return reportSched || rows[0] || null;
}

function messageMentionsBot(messageRow) {
  const content = String(messageRow.content || '').toLowerCase();
  if (content.includes('🤖') || content.includes('@ai') || content.includes('ai assistant')) return true;
  const mentions = messageRow.mention_user_ids;
  if (Array.isArray(mentions) && mentions.map(String).includes(AI_BOT_USER_ID)) return true;
  return false;
}

async function isReplyToBot(replyToId) {
  if (!replyToId) return false;
  const { data } = await supabase
    .from('messenger_group_messages')
    .select('user_id')
    .eq('id', replyToId)
    .maybeSingle();
  return data?.user_id === AI_BOT_USER_ID;
}

async function shouldActivateConversation({ channelKind, channelId, messageRow }) {
  const senderId = messageRow.user_id || messageRow.sender_id;
  if (!senderId || senderId === AI_BOT_USER_ID) return false;
  if (messageRow.is_system || messageRow.message_type === 'system') return false;

  if (channelKind === 'group') {
    const isDm = await isDirectWithBot(channelId);
    if (isDm) return true;

    const openConv = await findOpenConversation('group', channelId);
    if (openConv) return true;

    if (messageMentionsBot(messageRow)) return true;
    if (await isReplyToBot(messageRow.reply_to)) return true;

    return false;
  }

  /* department: phase 1 — không kích hoạt */
  return false;
}

async function loadRecentMessages(channelKind, channelId, limit = 10) {
  if (channelKind === 'group') {
    const { data } = await supabase
      .from('messenger_group_messages')
      .select('id, user_id, content, created_at, user:users(id, full_name, is_bot)')
      .eq('group_id', channelId)
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data || []).reverse();
  }
  const { data } = await supabase
    .from('department_messages')
    .select('id, sender_id, content, created_at, sender:users(id, full_name, is_bot)')
    .eq('department_id', channelId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data || []).reverse();
}

function buildChatMessages(history, userText, ctx) {
  const msgs = [];
  for (const m of history) {
    const uid = m.user_id || m.sender_id;
    const isBot = uid === AI_BOT_USER_ID || m.user?.is_bot || m.sender?.is_bot;
    const name = m.user?.full_name || m.sender?.full_name || 'User';
    const content = String(m.content || '').trim();
    if (!content) continue;
    msgs.push({
      role: isBot ? 'assistant' : 'user',
      content: isBot ? content : `${name}: ${content}`,
    });
  }
  if (userText) {
    msgs.push({
      role: 'user',
      content: JSON.stringify({
        user_message: userText,
        context: ctx,
      }),
    });
  }
  return msgs.slice(-12);
}

async function buildSystemPromptWithMemory(basePrompt, senderUserId) {
  if (!senderUserId) return basePrompt;
  const facts = await loadUserFactsForPrompt(senderUserId);
  if (!facts.length) return basePrompt;
  markFactsUsed(facts.map((f) => f.id)).catch(() => {});
  return `${basePrompt}\n\n${formatFactsForPrompt(facts)}`;
}

/** User dạy bot trực tiếp: "nhớ giúp: ..." */
async function tryCaptureUserTeaching(senderUserId, text) {
  if (!senderUserId || !text) return;
  const m = String(text).trim().match(/^(?:nhớ giúp|nhớ cho|ghi nhớ|từ giờ)\s*[:：]?\s*(.+)$/i);
  if (!m?.[1]) return;
  try {
    await teachUserFact(senderUserId, m[1].trim(), 'correction');
  } catch (e) {
    console.warn('[ai-memory] teach skip:', e.message);
  }
}

async function runOpenAiToolsLoop({ apiKey, system, messages, toolCtx }) {
  let currentMessages = [{ role: 'system', content: system }, ...messages];
  let lastCompanyId = toolCtx.last_company_id || null;

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i += 1) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.4,
        max_tokens: 1200,
        tools: OPENAI_TOOL_DEFINITIONS,
        tool_choice: 'auto',
        messages: currentMessages,
      }),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`OpenAI ${res.status}: ${t.slice(0, 200)}`);
    }

    const data = await res.json();
    const choice = data?.choices?.[0]?.message;
    if (!choice) throw new Error('OpenAI trả về rỗng');

    const toolCalls = choice.tool_calls;
    if (!toolCalls?.length) {
      const text = choice.content?.trim();
      if (!text) throw new Error('OpenAI không có nội dung');
      return { text: text.slice(0, 1900), last_company_id: lastCompanyId };
    }

    currentMessages.push(choice);

    for (const tc of toolCalls) {
      const fnName = tc.function?.name;
      let args = {};
      try {
        args = JSON.parse(tc.function?.arguments || '{}');
      } catch {
        args = {};
      }

      let result;
      try {
        result = await executeTool(fnName, args, toolCtx);
        if (fnName === 'get_company_lead_summary' && args.company_id) {
          lastCompanyId = args.company_id;
        }
      } catch (e) {
        result = { error: e.message };
      }

      currentMessages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(result).slice(0, 8000),
      });
    }
  }

  throw new Error('Vượt số vòng tool — thử lại');
}

async function postBotReply({ channelKind, channelId, content, io, channelInfo }) {
  if (channelKind === 'department') {
    return insertDepartmentBotMessage(channelId, content, io, channelInfo);
  }
  return insertGroupBotMessage(channelId, content, io, channelInfo);
}

/** Phát typing indicator cho bot. interval=null → emit 1 lần.
 *  Trả về hàm stop để gọi khi xong. */
function startBotTyping({ channelKind, channelId, io, fullName = '🤖 AI Báo cáo CRM' }) {
  if (!io || channelKind !== 'group' || !channelId) return () => {};
  const emit = (isTyping) => {
    try {
      io.to(`messenger_group:${channelId}`).emit('messenger_group:typing', {
        group_id: channelId,
        user_id: AI_BOT_USER_ID,
        full_name: fullName,
        is_typing: !!isTyping,
        ts: Date.now(),
      });
    } catch { /* ignore */ }
  };
  emit(true);
  // Tự refresh mỗi 3s để client không tự stop khi vẫn còn xử lý (frontend timeout 4s)
  const handle = setInterval(() => emit(true), 3000);
  return () => {
    clearInterval(handle);
    emit(false);
  };
}

/**
 * Entry hook — gọi sau khi user gửi tin nhắn vào kênh.
 */
async function handleIncomingMessage({ messageRow, channelKind, channelId, io }) {
  try {
    const senderId = messageRow.user_id || messageRow.sender_id;
    if (!senderId || senderId === AI_BOT_USER_ID) return;

    const activate = await shouldActivateConversation({ channelKind, channelId, messageRow });
    if (!activate) return;

    if (!checkRateLimit(String(senderId))) {
      const channelInfo = { kind: channelKind, id: channelId, name: 'Chat' };
      await postBotReply({
        channelKind,
        channelId,
        content: '⏳ Bạn đang gửi quá nhanh — chờ vài phút rồi thử lại nhé.',
        io,
        channelInfo,
      });
      return;
    }

    const openConv = await findOpenConversation(channelKind, channelId);
    const isDm = channelKind === 'group' ? await isDirectWithBot(channelId) : false;
    const schedule = await findScheduleForChannel(channelKind, channelId, openConv, { isDm });
    const personalUid = (isDm && schedule?.personal_scope_only) ? String(senderId) : null;
    if (!schedule) return;

    const companies = await listCompaniesInScope({ schedule_id: schedule.id });
    const range = resolveTimeRange(
      schedule.time_scope || 'today',
      schedule.time_scope_days_offset ?? 0,
    );

    const history = await loadRecentMessages(channelKind, channelId, 10);
    const userText = String(messageRow.content || '').trim();

    const toolCtx = {
      schedule_id: schedule.id,
      days_offset: schedule.time_scope_days_offset ?? 0,
      last_company_id: openConv?.last_company_id || null,
      companies,
      time_scope: schedule.time_scope || 'today',
      period_label: range.label_vn,
      personal_recipient_user_id: personalUid,
      sender_user_id: senderId,
      channel_kind: channelKind,
      channel_id: channelId,
    };

    const todayVn = vnDateYmd();
    const [yy, mm, dd] = todayVn.split('-');
    const chatMessages = buildChatMessages(
      history.filter((m) => m.id !== messageRow.id),
      userText,
      {
        schedule_id: schedule.id,
        default_time_scope: schedule.time_scope || 'today',
        default_period: range.label_vn,
        today_vn: `${dd}/${mm}/${yy}`,
        current_month_vn: `${parseInt(mm, 10)}/${yy}`,
        companies: companies.map((c) => ({ id: c.id, short_name: c.short_name })),
        last_company_id: toolCtx.last_company_id,
      },
    );

    await tryCaptureUserTeaching(senderId, userText);

    const apiKey = process.env.OPENAI_API_KEY;
    let replyText;

    // Bật indicator "AI đang trả lời..."
    const stopTyping = startBotTyping({ channelKind, channelId, io });
    try {
      if (apiKey) {
        const systemWithMemory = await buildSystemPromptWithMemory(SYSTEM_PROMPT, senderId);
        const result = await runOpenAiToolsLoop({
          apiKey,
          system: systemWithMemory,
          messages: chatMessages,
          toolCtx,
        });
        replyText = result.text;
        if (result.last_company_id && openConv?.id) {
          await supabase
            .from('ai_chat_bot_conversations')
            .update({ last_company_id: result.last_company_id })
            .eq('id', openConv.id);
        }
      } else {
        replyText = '🤖 AI offline — chưa cấu hình OPENAI_API_KEY. Vui lòng liên hệ admin.';
      }
    } finally {
      stopTyping();
    }

    const channelInfo =
      channelKind === 'group'
        ? { kind: 'group', id: channelId, name: 'Nhóm chat' }
        : { kind: 'department', id: channelId, name: 'Phòng ban' };

    await postBotReply({ channelKind, channelId, content: replyText, io, channelInfo });
  } catch (e) {
    console.warn('[ai-conv] handleIncomingMessage lỗi:', e.message);
  }
}

module.exports = {
  handleIncomingMessage,
  runOpenAiToolsLoop,
  shouldActivateConversation,
  isDirectWithBot,
  findOpenConversation,
};
