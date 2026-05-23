/**
 * AI Chat Bot — helper gửi tin nhắn từ "🤖 AI Assistant" vào:
 *   - Chat phòng ban  (department_messages)
 *   - Nhóm chat       (messenger_group_messages)
 *
 * Bot user UUID cố định (seed trong migration 223_ai_chat_bot.sql).
 * Tin nhắn bot luôn đánh dấu `is_system = true` để frontend render khác biệt
 * (avatar/icon 🤖, không bật bong bóng spam).
 *
 * Sinh nội dung: dùng OpenAI gpt-4o-mini với 4 loại prompt:
 *   - daily_brief : tóm tắt việc cần làm hôm nay của phòng ban / nhóm
 *   - overdue     : danh sách công việc quá hạn của thành viên kênh
 *   - kpi         : tình hình KPI tháng của thành viên (tóm gọn)
 *   - custom      : chạy theo custom_prompt do admin nhập
 *
 * Nếu thiếu OPENAI_API_KEY hoặc OpenAI lỗi → fallback sang template tĩnh
 * dùng đúng dữ liệu đã build (vẫn gửi vào chat, nhưng có cảnh báo nhỏ).
 */

const { supabase } = require('../config/supabase');

const AI_BOT_USER_ID = '00000000-0000-0000-0000-0000000000a1';
const AI_BOT_DISPLAY_NAME = '🤖 AI Assistant';

/* ════════════════════ NOTIFICATIONS (web socket + FCM/Expo cho app mobile) ════════════════════ */

/**
 * Sau khi bot post một tin nhắn vào kênh, tạo notification + đẩy push
 * cho mọi thành viên (trừ chính bot). Push mobile dùng channel chat (cùng
 * loại như tin nhắn user thật) nên Android sẽ nổi heads-up + bubble.
 *
 * - kind: 'group' (messenger_groups) hoặc 'department'
 * - id: group_id hoặc department_id
 * - msgRow: dòng vừa insert (đã có id)
 * - channelInfo: { name, ... } để hiển thị tiêu đề
 */
async function notifyBotMessageRecipients({ kind, id, msgRow, channelInfo, io }) {
  if (!msgRow || !id) return;

  // Load danh sách user (loại bot)
  let memberIds = [];
  if (kind === 'group') {
    const { data } = await supabase
      .from('messenger_group_members')
      .select('user_id')
      .eq('group_id', id);
    memberIds = (data || [])
      .map((m) => String(m.user_id))
      .filter((uid) => uid && uid !== AI_BOT_USER_ID);
  } else if (kind === 'department') {
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('department_id', id)
      .eq('is_active', true);
    memberIds = (data || [])
      .map((u) => String(u.id))
      .filter((uid) => uid && uid !== AI_BOT_USER_ID);
  }
  if (!memberIds.length) return;

  // Preview ngắn cho phần body của notification
  const raw = typeof msgRow.content === 'string' ? msgRow.content.trim() : '';
  const preview = raw ? (raw.length > 140 ? `${raw.slice(0, 137)}…` : raw) : '[Tin nhắn AI]';

  const channelName = channelInfo?.name || (kind === 'group' ? 'Nhóm chat' : 'Phòng ban');
  const notifType = kind === 'group' ? 'messenger_chat' : 'department_chat';
  const titleBase = kind === 'group' ? `Messenger · ${channelName}` : channelName;
  const senderName = AI_BOT_DISPLAY_NAME;

  const metadata = {
    group_name: kind === 'group' ? channelName : undefined,
    dept_name: kind === 'department' ? channelName : undefined,
    sender_name: senderName,
    sender_avatar: null,
    sender_id: AI_BOT_USER_ID,
    is_bot: true,
    bubble_key: String(id),
    bubble_wake: true,
    message_id: msgRow.id ? String(msgRow.id) : '',
    message_type: 'text',
  };

  // Lazy-require để tránh circular & để cron context không bắt buộc có req.app
  let sendMobilePush;
  try {
    ({ sendMobilePush } = require('../services/pushSender'));
  } catch {
    sendMobilePush = null;
  }

  for (const uid of memberIds) {
    try {
      const { data: notif, error } = await supabase
        .from('notifications')
        .insert({
          user_id: uid,
          type: notifType,
          title: titleBase,
          message: `${senderName}: ${preview}`,
          entity_type: kind === 'group' ? 'messenger_group' : 'department',
          entity_id: id,
          metadata,
        })
        .select()
        .single();
      if (error || !notif) continue;

      // Realtime cho web
      if (io) io.to(`user:${uid}`).emit('notification', notif);

      // Push xuống app mobile (Expo + FCM). sendMobilePush đã tự lọc theo
      // user notification preferences nên ai tắt chat thì không nhận.
      if (sendMobilePush) {
        void sendMobilePush(uid, notif);
      }
    } catch (e) {
      console.warn('[ai-bot] push notif lỗi cho user', uid, ':', e.message || e);
    }
  }
}

/* ════════════════════ FORMATTERS ════════════════════ */

const fmtMoney = (n) => (Number(n) || 0).toLocaleString('vi-VN');
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('vi-VN') : '—');
const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—';

/* ════════════════════ THU THẬP CONTEXT ════════════════════ */

/**
 * Lấy danh sách user_id thuộc kênh (để giới hạn dữ liệu phân tích vào đúng team đang chat).
 * - department: lấy users.department_id = channelId
 * - group:      lấy messenger_group_members.user_id (loại bot ra)
 */
async function loadChannelMemberIds(channelType, channelId) {
  if (channelType === 'department') {
    const { data } = await supabase
      .from('users')
      .select('id, full_name')
      .eq('department_id', channelId)
      .eq('is_active', true);
    return (data || [])
      .filter((u) => u.id !== AI_BOT_USER_ID)
      .map((u) => ({ id: u.id, full_name: u.full_name }));
  }
  // group
  const { data } = await supabase
    .from('messenger_group_members')
    .select('user_id, user:users(id, full_name, is_active)')
    .eq('group_id', channelId);
  return (data || [])
    .map((m) => m.user)
    .filter((u) => u && u.is_active && u.id !== AI_BOT_USER_ID)
    .map((u) => ({ id: u.id, full_name: u.full_name }));
}

/**
 * Lấy thông tin tên kênh để bot xưng hô và gắn tiêu đề.
 */
async function loadChannelInfo(channelType, channelId) {
  if (channelType === 'department') {
    const { data } = await supabase
      .from('departments')
      .select('id, name, color')
      .eq('id', channelId)
      .maybeSingle();
    return data ? { kind: 'department', id: data.id, name: data.name, color: data.color } : null;
  }
  const { data } = await supabase
    .from('messenger_groups')
    .select('id, name, is_direct')
    .eq('id', channelId)
    .maybeSingle();
  return data ? { kind: 'group', id: data.id, name: data.name, is_direct: !!data.is_direct } : null;
}

/**
 * Tóm hoạt động cần làm của các thành viên trong kênh (ưu tiên CRM + tasks).
 * Trả về object thuần để nhúng vào prompt LLM hoặc fallback template.
 */
async function buildChannelContextPayload(memberIds) {
  const now = Date.now();
  const horizon72h = new Date(now + 72 * 3600 * 1000).toISOString();
  const floor14d = new Date(now - 14 * 24 * 3600 * 1000).toISOString();
  const nowIso = new Date(now).toISOString();

  if (!memberIds.length) {
    return {
      members: [],
      crm_tasks_overdue: [],
      crm_tasks_due_soon: [],
      tasks_overdue: [],
      tasks_due_soon: [],
      leads_open: [],
      generated_at: nowIso,
    };
  }
  const ids = memberIds.map((m) => m.id);
  const nameMap = new Map(memberIds.map((m) => [m.id, m.full_name]));

  /* CRM tasks: pending/in_progress, có deadline, assignee ∈ kênh */
  let crmOverdue = [];
  let crmDueSoon = [];
  try {
    const { data } = await supabase
      .from('crm_tasks')
      .select('id, title, deadline, priority, assignee_id, lead:crm_leads(code, title)')
      .in('assignee_id', ids)
      .in('status', ['pending', 'in_progress'])
      .not('deadline', 'is', null)
      .gte('deadline', floor14d)
      .lte('deadline', horizon72h)
      .order('deadline', { ascending: true })
      .limit(40);
    (data || []).forEach((t) => {
      const dlMs = new Date(t.deadline).getTime();
      const item = {
        title: t.title,
        deadline: t.deadline,
        priority: t.priority || null,
        assignee: nameMap.get(t.assignee_id) || '—',
        lead_code: t.lead?.code || null,
        lead_title: t.lead?.title || null,
        hours_to_deadline: Math.round((dlMs - now) / 3600000),
      };
      if (dlMs < now) crmOverdue.push({ ...item, overdue: true });
      else crmDueSoon.push({ ...item, overdue: false });
    });
  } catch (e) {
    /* bảng có thể chưa tồn tại — bỏ qua */
  }

  /* Task chung (projects/tasks) */
  let tOverdue = [];
  let tDueSoon = [];
  try {
    const { data } = await supabase
      .from('tasks')
      .select('id, title, due_date, priority, assignee_id, project_id')
      .in('assignee_id', ids)
      .neq('status', 'done')
      .not('due_date', 'is', null)
      .gte('due_date', floor14d)
      .lte('due_date', horizon72h)
      .order('due_date', { ascending: true })
      .limit(40);
    (data || []).forEach((t) => {
      const dlMs = new Date(t.due_date).getTime();
      const item = {
        title: t.title,
        due_date: t.due_date,
        priority: t.priority || null,
        assignee: nameMap.get(t.assignee_id) || '—',
        hours_to_deadline: Math.round((dlMs - now) / 3600000),
      };
      if (dlMs < now) tOverdue.push({ ...item, overdue: true });
      else tDueSoon.push({ ...item, overdue: false });
    });
  } catch (e) {
    /* ignore */
  }

  /* Lead đang mở do thành viên kênh phụ trách */
  let leads = [];
  try {
    const { data } = await supabase
      .from('crm_leads')
      .select('id, code, title, estimated_value, assigned_to, stage:crm_pipeline_stages!crm_leads_stage_id_fkey(name, is_won, is_lost)')
      .in('assigned_to', ids)
      .is('actual_close_date', null)
      .order('updated_at', { ascending: false })
      .limit(20);
    (data || []).forEach((l) => {
      if (l.stage?.is_won || l.stage?.is_lost) return;
      leads.push({
        code: l.code,
        title: l.title,
        estimated_value: l.estimated_value,
        assignee: nameMap.get(l.assigned_to) || '—',
        stage: l.stage?.name || '—',
      });
    });
  } catch (e) {
    /* ignore */
  }

  return {
    members: memberIds.map((m) => m.full_name),
    crm_tasks_overdue: crmOverdue,
    crm_tasks_due_soon: crmDueSoon,
    tasks_overdue: tOverdue,
    tasks_due_soon: tDueSoon,
    leads_open: leads,
    generated_at: nowIso,
  };
}

/**
 * KPI tháng (tổng ròng) cho từng thành viên — đọc kpi_ledger.
 * Bảng có thể chưa tồn tại → trả mảng rỗng, OpenAI sẽ tự bỏ qua.
 */
async function buildKpiPayload(memberIds) {
  if (!memberIds.length) return { period: null, rows: [] };
  const today = new Date();
  const periodStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
  const ids = memberIds.map((m) => m.id);
  const nameMap = new Map(memberIds.map((m) => [m.id, m.full_name]));
  try {
    const { data } = await supabase
      .from('crm_kpi_ledger')
      .select('user_id, points')
      .in('user_id', ids)
      .gte('occurred_at', periodStart);
    const sumMap = new Map();
    (data || []).forEach((r) => {
      sumMap.set(r.user_id, (sumMap.get(r.user_id) || 0) + (r.points || 0));
    });
    const rows = [...sumMap.entries()]
      .map(([uid, pts]) => ({ name: nameMap.get(uid) || '—', net_points: pts }))
      .sort((a, b) => b.net_points - a.net_points);
    return { period: periodStart.slice(0, 7), rows };
  } catch {
    return { period: periodStart.slice(0, 7), rows: [] };
  }
}

/* ════════════════════ FALLBACK TEMPLATE (khi không có OpenAI) ════════════════════ */

/**
 * Khi OpenAI offline: vẫn gửi tin nhắn dạng template tĩnh để team có thông tin.
 * Dựa theo data_source của playbook (channel_context / kpi / none).
 */
function fallbackTemplate(playbook, channelInfo, payload, customPrompt) {
  const header = `${playbook?.icon || '🤖'} ${playbook?.name || 'AI Assistant'} · ${channelInfo?.name || 'Kênh'} · ${new Date().toLocaleString('vi-VN')}`;
  const lines = [header, ''];
  const ds = playbook?.data_source || 'channel_context';

  if (ds === 'channel_context') {
    const allOverdue = [...(payload.crm_tasks_overdue || []), ...(payload.tasks_overdue || [])];
    const dueSoon = [...(payload.crm_tasks_due_soon || []), ...(payload.tasks_due_soon || [])];
    lines.push(
      `⚠️ Quá hạn: ${allOverdue.length} · Sắp hạn (≤72h): ${dueSoon.length} · Lead đang mở: ${(payload.leads_open || []).length}`,
    );
    if (allOverdue.length) {
      lines.push('', '🔴 Quá hạn:');
      allOverdue.slice(0, 8).forEach((t) => {
        const lead = t.lead_code ? ` — ${t.lead_code}` : '';
        lines.push(`- ${t.title}${lead} · ${t.assignee}`);
      });
    }
    if (dueSoon.length) {
      lines.push('', '⏰ Sắp đến hạn:');
      dueSoon.slice(0, 6).forEach((t) => {
        const lead = t.lead_code ? ` — ${t.lead_code}` : '';
        lines.push(`- ${t.title}${lead} · ${t.assignee} · còn ${t.hours_to_deadline}h`);
      });
    }
    if (!allOverdue.length && !dueSoon.length) {
      lines.push('', '✅ Không có công việc gấp. Tận dụng thời gian chăm sóc lead mới!');
    }
  } else if (ds === 'kpi') {
    if (!payload.rows?.length) {
      lines.push('Chưa có dữ liệu KPI tháng cho thành viên kênh.');
    } else {
      lines.push('📊 KPI tháng (điểm ròng):');
      payload.rows.slice(0, 10).forEach((r) => {
        const tag = r.net_points >= 0 ? '🟢' : '🔴';
        lines.push(`- ${tag} ${r.name}: ${r.net_points >= 0 ? '+' : ''}${r.net_points}`);
      });
    }
  } else if (ds === 'none') {
    lines.push(playbook?.system_prompt?.slice(0, 500) || '(Chưa cấu hình nội dung.)');
  }

  if (customPrompt) {
    lines.push('', `📝 Yêu cầu thêm: ${customPrompt.slice(0, 200)}`);
  }

  lines.push('', '_Bot AI · cấu hình lịch tại /settings/ai-chat-bot_');
  return lines.join('\n').slice(0, 2000);
}

/* ════════════════════ OPENAI GENERATOR ════════════════════ */

const SYSTEM_PROMPT_BASE = `Bạn là trợ lý nội bộ "🤖 AI Assistant" của hệ thống TuBep Pro.
Bạn đang ĐĂNG TIN NHẮN trực tiếp vào một kênh chat (phòng ban hoặc nhóm) — cả team sẽ đọc.

QUY TẮC BẮT BUỘC:
- Trả lời tiếng Việt, văn phong thân thiện, súc tích, không nịnh.
- Không quá 1500 ký tự. Không dùng heading #/##. Có thể dùng emoji hợp lý.
- Mọi nội dung phải DỰA TRÊN dữ liệu trong context_pack — KHÔNG bịa thêm task/lead/KPI.
- Khi nhắc tên người, dùng đúng tên trong payload.members hoặc trong task/lead.
- Mở đầu bằng tiêu đề ngắn (1 dòng). Sau đó là các gạch đầu dòng "- ".
- Kết thúc bằng 1 câu khuyến khích hoặc nhắc tiếp theo (1 dòng).`;

/**
 * Gọi OpenAI theo playbook đã chọn — system_prompt + max_tokens + temperature đều
 * lấy từ DB nên admin có thể tinh chỉnh không cần đụng code.
 */
async function callOpenAiForBot({ apiKey, playbook, channelInfo, payload, customPrompt }) {
  const userContent = JSON.stringify(
    {
      channel: channelInfo,
      playbook: { code: playbook.code, name: playbook.name, data_source: playbook.data_source },
      admin_instruction: customPrompt || playbook.user_prompt_extra || undefined,
      context_pack: payload,
    },
    null,
    0,
  ).slice(0, 12000);

  const system = `${SYSTEM_PROMPT_BASE}\n\n${playbook.system_prompt || ''}`.slice(0, 4000);
  const maxTokens = Math.max(200, Math.min(4000, playbook.max_tokens || 700));
  const temperature = Math.max(0, Math.min(1.5, Number(playbook.temperature) || 0.55));

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ],
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`OpenAI ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text || typeof text !== 'string') throw new Error('OpenAI trả về rỗng');
  return text.trim().slice(0, 2000);
}

/* ════════════════════ PLAYBOOK LOADER ════════════════════ */

/**
 * Lấy playbook cho schedule:
 *   - Ưu tiên schedule.playbook_id (mới)
 *   - Fallback: tìm builtin playbook theo schedule.prompt_kind (cũ)
 *   - Fallback cuối: trả 1 playbook ảo "daily_brief" để vẫn chạy được
 */
async function resolvePlaybookForSchedule(schedule) {
  if (schedule.playbook_id) {
    const { data, error } = await supabase
      .from('ai_chat_bot_playbooks')
      .select('*')
      .eq('id', schedule.playbook_id)
      .maybeSingle();
    if (!error && data) return data;
  }
  if (schedule.prompt_kind) {
    const { data } = await supabase
      .from('ai_chat_bot_playbooks')
      .select('*')
      .eq('code', schedule.prompt_kind)
      .eq('is_builtin', true)
      .maybeSingle();
    if (data) return data;
  }
  // Bảng playbooks chưa kịp migrate — fallback tối thiểu
  return {
    id: null,
    code: 'daily_brief',
    name: 'Tóm tắt hôm nay',
    icon: '📋',
    data_source: 'channel_context',
    system_prompt: 'Tóm tắt việc cần làm hôm nay cho kênh.',
    max_tokens: 700,
    temperature: 0.55,
    enabled: true,
  };
}

/* ════════════════════ INSERT MESSAGE + EMIT SOCKET ════════════════════ */

async function insertDepartmentBotMessage(departmentId, content, io, channelInfo) {
  const { data, error } = await supabase
    .from('department_messages')
    .insert({
      department_id: departmentId,
      sender_id: AI_BOT_USER_ID,
      content,
      is_system: true,
    })
    .select(`
      *,
      sender:users!department_messages_sender_id_fkey(id, full_name, avatar, role, is_bot)
    `)
    .single();
  if (error) throw new Error(`insert department_messages: ${error.message}`);

  if (io) {
    io.to(`dept:${departmentId}`).emit('department_message', {
      department_id: departmentId,
      message: data,
    });
  }

  // Thông báo + push mobile (FCM/Expo) cho thành viên phòng ban
  await notifyBotMessageRecipients({
    kind: 'department',
    id: departmentId,
    msgRow: data,
    channelInfo,
    io,
  });

  return data;
}

async function insertGroupBotMessage(groupId, content, io, channelInfo) {
  // Bot không cần là thành viên — emit thẳng vào room (mọi thành viên đã join sẽ nhận).
  const { data, error } = await supabase
    .from('messenger_group_messages')
    .insert({
      group_id: groupId,
      user_id: AI_BOT_USER_ID,
      content,
      message_type: 'text',
      is_system: true,
    })
    .select('*, user:users!messenger_group_messages_user_id_fkey(id, full_name, avatar, is_bot)')
    .single();
  if (error) throw new Error(`insert messenger_group_messages: ${error.message}`);

  if (io) {
    io.to(`messenger_group:${groupId}`).emit('messenger_group:chat', data);
  }

  // Thông báo + push mobile (FCM/Expo) cho thành viên nhóm
  await notifyBotMessageRecipients({
    kind: 'group',
    id: groupId,
    msgRow: data,
    channelInfo,
    io,
  });

  return data;
}

/* ════════════════════ MAIN: GENERATE + SEND ════════════════════ */

/**
 * Sinh nội dung AI theo schedule và gửi vào kênh.
 * @param {object} schedule  Hàng từ ai_chat_bot_schedules
 * @param {object} io        Socket.IO server
 * @returns {Promise<{ status:'ok'|'error'|'skipped', message?:string, message_id?:string, error?:string, preview?:string }>}
 */
async function runScheduleSend(schedule, io) {
  const channelInfo = await loadChannelInfo(schedule.channel_type, schedule.channel_id);
  if (!channelInfo) {
    return { status: 'error', error: 'Không tìm thấy kênh' };
  }

  const playbook = await resolvePlaybookForSchedule(schedule);
  if (!playbook) {
    return { status: 'error', error: 'Không tìm thấy mẫu nội dung (playbook)' };
  }
  if (playbook.enabled === false) {
    return { status: 'skipped', error: `Mẫu "${playbook.name}" đang tắt` };
  }

  const memberIds = await loadChannelMemberIds(schedule.channel_type, schedule.channel_id);

  let payload;
  const ds = playbook.data_source || 'channel_context';
  if (ds === 'kpi') {
    payload = await buildKpiPayload(memberIds);
  } else if (ds === 'none') {
    payload = { members: memberIds.map((m) => m.full_name) };
  } else {
    payload = await buildChannelContextPayload(memberIds);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  let content;
  let usedFallback = false;
  if (apiKey) {
    try {
      content = await callOpenAiForBot({
        apiKey,
        playbook,
        channelInfo,
        payload,
        customPrompt: schedule.custom_prompt,
      });
    } catch (e) {
      console.warn('[ai-bot] OpenAI lỗi, dùng fallback:', e.message);
      content = fallbackTemplate(playbook, channelInfo, payload, schedule.custom_prompt);
      usedFallback = true;
    }
  } else {
    content = fallbackTemplate(playbook, channelInfo, payload, schedule.custom_prompt);
    usedFallback = true;
  }

  if (usedFallback) {
    content += '\n\n_(AI offline — bản nhắc tĩnh)_';
  }

  try {
    let inserted;
    if (schedule.channel_type === 'department') {
      inserted = await insertDepartmentBotMessage(schedule.channel_id, content, io, channelInfo);
    } else {
      inserted = await insertGroupBotMessage(schedule.channel_id, content, io, channelInfo);
    }
    return {
      status: 'ok',
      message_id: inserted?.id || null,
      preview: content.slice(0, 240),
      playbook_code: playbook.code,
    };
  } catch (e) {
    return { status: 'error', error: e.message };
  }
}

module.exports = {
  AI_BOT_USER_ID,
  AI_BOT_DISPLAY_NAME,
  runScheduleSend,
  resolvePlaybookForSchedule,
  // exported for testing / debugging:
  buildChannelContextPayload,
  buildKpiPayload,
  fallbackTemplate,
  loadChannelMemberIds,
  loadChannelInfo,
  insertDepartmentBotMessage,
  insertGroupBotMessage,
};
