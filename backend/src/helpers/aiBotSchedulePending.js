/**
 * Lịch bot chờ xác nhận — backend tự create khi user trả lời OK/huỷ,
 * không phụ thuộc LLM gọi lại manage_ai_bot_schedule.
 */
const { supabase } = require('../config/supabase');

const PENDING_TTL_MS = 15 * 60 * 1000;
const CONV_TTL_MS = 30 * 60 * 1000;

const CONFIRM_EXACT_RE = /^(ok|oke|okay|đồng ý|dong y|xác nhận|xac nhan|tạo lịch|tao lich|tạo đi|tao di|yes|y|👍|✅)(\s*[!.,]?)?$/i;
const CANCEL_EXACT_RE = /^(huỷ|hủy|huy|cancel|không|khong|no|n|stop|bỏ|bo|thôi|thoi)(\s*[!.,]?)?$/i;

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

function normalizeConfirmText(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function isScheduleConfirmYes(text) {
  const raw = String(text || '').trim();
  if (!raw) return false;
  if (isScheduleConfirmCancel(raw)) return false;
  if (CONFIRM_EXACT_RE.test(raw)) return true;
  const t = normalizeConfirmText(raw);
  if (CONFIRM_EXACT_RE.test(t)) return true;
  if (/^(ok|yes|dong y|xac nhan|tao).*(lich|di|nhe|nha)?$/.test(t)) return true;
  if (/^tao\s*(lich|schedule)/.test(t)) return true;
  return false;
}

function isScheduleConfirmCancel(text) {
  const raw = String(text || '').trim();
  if (!raw) return false;
  if (CANCEL_EXACT_RE.test(raw)) return true;
  const t = normalizeConfirmText(raw);
  return CANCEL_EXACT_RE.test(t) || /^(huy|khong|bo)\s*(lich|di)?$/.test(t);
}

async function clearPendingSchedule(channelKind, channelId) {
  const conv = await findOpenConversation(channelKind, channelId);
  if (!conv?.id) return;
  const session_context = { ...(conv.session_context || {}) };
  delete session_context.pending_schedule;
  delete session_context.pending_reminder_draft;
  await supabase
    .from('ai_chat_bot_conversations')
    .update({ session_context })
    .eq('id', conv.id);
}

/**
 * Lưu args tạo lịch sau preview — gắn user + kênh, hết hạn 15 phút.
 */
async function savePendingSchedule(ctx, scheduleArgs) {
  const channelKind = ctx?.channel_kind;
  const channelId = ctx?.channel_id;
  const scheduleId = ctx?.schedule_id;
  const userId = ctx?.sender_user_id;
  if (!channelKind || !channelId || !scheduleId || !userId || !scheduleArgs) return null;

  const pending = {
    args: scheduleArgs,
    user_id: userId,
    expires_at: new Date(Date.now() + PENDING_TTL_MS).toISOString(),
    created_at: new Date().toISOString(),
  };

  const conv = await findOpenConversation(channelKind, channelId);
  const session_context = { ...(conv?.session_context || {}), pending_schedule: pending };
  const expires_at = new Date(Date.now() + CONV_TTL_MS).toISOString();

  if (conv?.id) {
    await supabase
      .from('ai_chat_bot_conversations')
      .update({ session_context, expires_at })
      .eq('id', conv.id);
    return conv.id;
  }

  const { data, error } = await supabase
    .from('ai_chat_bot_conversations')
    .insert({
      schedule_id: scheduleId,
      channel_type: channelKind,
      channel_id: channelId,
      expires_at,
      session_context,
    })
    .select('id')
    .single();
  if (error) {
    console.warn('[ai-schedule-pending] save lỗi:', error.message);
    return null;
  }
  return data?.id;
}

/** Lưu draft lịch nhắc thiếu nội dung — chờ user trả lời tin tiếp theo. */
async function savePendingReminderDraft(ctx, draftArgs) {
  const channelKind = ctx?.channel_kind;
  const channelId = ctx?.channel_id;
  const scheduleId = ctx?.schedule_id;
  const userId = ctx?.sender_user_id;
  if (!channelKind || !channelId || !scheduleId || !userId || !draftArgs) return null;

  const draft = {
    args: draftArgs,
    user_id: userId,
    expires_at: new Date(Date.now() + PENDING_TTL_MS).toISOString(),
    created_at: new Date().toISOString(),
  };

  const conv = await findOpenConversation(channelKind, channelId);
  const session_context = { ...(conv?.session_context || {}), pending_reminder_draft: draft };
  delete session_context.pending_schedule;
  const expires_at = new Date(Date.now() + CONV_TTL_MS).toISOString();

  if (conv?.id) {
    await supabase
      .from('ai_chat_bot_conversations')
      .update({ session_context, expires_at })
      .eq('id', conv.id);
    return conv.id;
  }

  const { data, error } = await supabase
    .from('ai_chat_bot_conversations')
    .insert({
      schedule_id: scheduleId,
      channel_type: channelKind,
      channel_id: channelId,
      expires_at,
      session_context,
    })
    .select('id')
    .single();
  if (error) {
    console.warn('[ai-schedule-pending] reminder draft save lỗi:', error.message);
    return null;
  }
  return data?.id;
}

async function getPendingReminderDraft(channelKind, channelId, userId) {
  const conv = await findOpenConversation(channelKind, channelId);
  const draft = conv?.session_context?.pending_reminder_draft;
  if (!draft?.args) return null;
  if (String(draft.user_id) !== String(userId)) return null;
  if (new Date(draft.expires_at) < new Date()) {
    await clearPendingSchedule(channelKind, channelId);
    return null;
  }
  return draft;
}

async function clearPendingReminderDraft(channelKind, channelId) {
  const conv = await findOpenConversation(channelKind, channelId);
  if (!conv?.id) return;
  const session_context = { ...(conv.session_context || {}) };
  delete session_context.pending_reminder_draft;
  await supabase
    .from('ai_chat_bot_conversations')
    .update({ session_context })
    .eq('id', conv.id);
}

/**
 * User trả lời nội dung nhắc sau khi bot hỏi. Trả { handled: true, text } nếu đã xử lý.
 */
async function tryHandlePendingReminderContent({
  userText,
  senderUserId,
  channelKind,
  channelId,
  toolCtx,
}) {
  const draft = await getPendingReminderDraft(channelKind, channelId, senderUserId);
  if (!draft) return { handled: false };

  const raw = String(userText || '').trim();
  if (!raw) return { handled: false };

  if (isScheduleConfirmCancel(raw)) {
    await clearPendingReminderDraft(channelKind, channelId);
    return {
      handled: true,
      text: '❌ *Đã huỷ* — không tạo lịch nhắc.\n_Gửi lại yêu cầu nếu muốn tạo lần nữa._',
    };
  }

  if (isScheduleConfirmYes(raw)) {
    return {
      handled: true,
      text: '📝 Bạn chưa gửi nội dung nhắc — hãy trả lời tên/việc cần nhắc (vd «mua đồ») hoặc **huỷ**.',
    };
  }

  let body = raw.replace(/^(chi ten|chỉ tên|ten thoi|tên thôi|noi dung|nội dung)\s*[:：]?\s*/i, '').trim();
  if (!body) {
    return {
      handled: true,
      text: '📝 Vui lòng gửi nội dung nhắc (vd «mua đồ abc») hoặc **huỷ**.',
    };
  }

  const nameOnly = body.length <= 48 && body.split(/\s+/).length <= 6;

  try {
    const { createAiBotSchedule } = require('./aiBotSkills');
    await clearPendingReminderDraft(channelKind, channelId);
    const result = await createAiBotSchedule(
      {
        ...draft.args,
        report_type: 'reminder',
        reminder_text: body,
        reminder_name: body,
        name_only: nameOnly,
        dry_run: true,
        instruction: `${draft.args.instruction || ''} ${body}`.trim(),
      },
      toolCtx,
    );

    if (result.need_content) {
      await savePendingReminderDraft(toolCtx, draft.args);
      return { handled: true, text: result.text };
    }

    const errText = formatPendingError(result);
    if (errText) return { handled: true, text: errText };

    return {
      handled: true,
      text: result.text || '📋 Đã cập nhật nội dung — trả lời **OK** để tạo lịch.',
    };
  } catch (e) {
    return { handled: true, text: `⚠️ ${e.message}` };
  }
}

async function getPendingSchedule(channelKind, channelId, userId) {
  const conv = await findOpenConversation(channelKind, channelId);
  const pending = conv?.session_context?.pending_schedule;
  if (!pending?.args) return null;
  if (String(pending.user_id) !== String(userId)) return null;
  if (new Date(pending.expires_at) < new Date()) {
    await clearPendingSchedule(channelKind, channelId);
    return null;
  }
  return pending;
}

function formatPendingError(result) {
  if (result?.error === 'slot_passed_today' && result.text) return result.text;
  if (result?.ok === false && result.text) return result.text;
  if (result?.error === 'multiple_companies' && result.matches?.length) {
    const list = result.matches.map((m) => `• ${m.name}`).join('\n');
    return `⚠️ Nhiều công ty trùng tên — chọn rõ hơn:\n${list}`;
  }
  if (result?.error === 'multiple_departments' && result.matches?.length) {
    const list = result.matches.map((m) => `• ${m.name}`).join('\n');
    return `⚠️ Nhiều phòng ban trùng — chọn rõ hơn:\n${list}`;
  }
  if (result?.error) {
    if (typeof result.error === 'string') return `⚠️ Không tạo được lịch: ${result.error}`;
    return `⚠️ Không tạo được lịch: ${JSON.stringify(result.error)}`;
  }
  return null;
}

/**
 * Xử lý OK/huỷ trước khi gọi OpenAI. Trả { handled: true, text } nếu đã xử lý.
 */
async function tryHandlePendingScheduleConfirmation({
  userText,
  senderUserId,
  channelKind,
  channelId,
  toolCtx,
}) {
  const pending = await getPendingSchedule(channelKind, channelId, senderUserId);
  if (!pending) return { handled: false };

  if (isScheduleConfirmCancel(userText)) {
    await clearPendingSchedule(channelKind, channelId);
    try {
      const { cancelFlowForChannel } = require('./aiBotTaskFlow');
      await cancelFlowForChannel(channelKind, channelId, 'cancelled');
    } catch { /* ignore */ }
    return {
      handled: true,
      text: '❌ *Đã huỷ* — không tạo lịch bot.\n_Gửi lại yêu cầu nếu muốn xem trước lần nữa._',
    };
  }

  if (!isScheduleConfirmYes(userText)) return { handled: false };

  try {
    const { createAiBotSchedule } = require('./aiBotSkills');
    const result = await createAiBotSchedule(
      {
        ...pending.args,
        dry_run: false,
        skip_pending_save: true,
        proposal_id: pending.args.proposal_id,
        flow_id: pending.args.flow_id,
      },
      toolCtx,
    );
    await clearPendingSchedule(channelKind, channelId);

    const errText = formatPendingError(result);
    if (errText) return { handled: true, text: errText };

    return {
      handled: true,
      text: result.text || '✅ Đã tạo lịch bot.',
    };
  } catch (e) {
    return { handled: true, text: `⚠️ ${e.message}` };
  }
}

module.exports = {
  savePendingSchedule,
  savePendingReminderDraft,
  clearPendingSchedule,
  clearPendingReminderDraft,
  getPendingSchedule,
  getPendingReminderDraft,
  tryHandlePendingScheduleConfirmation,
  tryHandlePendingReminderContent,
  isScheduleConfirmYes,
  isScheduleConfirmCancel,
};
