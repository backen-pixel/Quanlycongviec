/**
 * AI Báo cáo công ty — gửi menu / báo cáo khi schedule chạy (playbook company_report).
 */

const { supabase } = require('../config/supabase');
const {
  insertGroupBotMessage,
  insertDepartmentBotMessage,
} = require('./aiBotSender');
const {
  listCompaniesInScope,
  resolveTimeRange,
  formatCompanyReportText,
  getCompanyLeadSummary,
  isDirectWithBot,
  getDmRecipientUserId,
  AI_BOT_USER_ID,
} = require('./aiReportTools');

/** Bot typing indicator (giống aiConversation.startBotTyping nhưng nội bộ) */
function startBotTyping(io, channelType, channelId, fullName = '🤖 AI Báo cáo CRM') {
  if (!io || channelType !== 'group' || !channelId) return () => {};
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
  const handle = setInterval(() => emit(true), 3000);
  return () => {
    clearInterval(handle);
    emit(false);
  };
}

function buildMenuText(companies, periodLabel) {
  const lines = [`📊 Báo cáo công ty (${periodLabel})`, ''];
  companies.forEach((c) => {
    lines.push(`${c.index}) ${c.short_name}`);
  });
  lines.push(`${companies.length + 1}) Tất cả`);
  lines.push('', '(Trả lời số hoặc gõ tên công ty)');
  return lines.join('\n');
}

async function buildAllCompaniesSummary(companies, schedule) {
  const lines = [`📊 Tổng hợp tất cả công ty · ${resolveTimeRange(schedule.time_scope || 'today', schedule.time_scope_days_offset ?? 0).label_vn}`, ''];
  let totalNew = 0;
  let totalDeal = 0;
  let totalWon = 0;
  let totalLost = 0;

  for (const c of companies) {
    const s = await getCompanyLeadSummary({
      company_id: c.id,
      schedule_id: schedule.id,
    });
    lines.push(`• ${c.short_name}: ${s.new_leads} lead · ${s.converted_to_deal} deal · ${s.won} thắng · ${s.lost} thua`);
    totalNew += s.new_leads;
    totalDeal += s.converted_to_deal;
    totalWon += s.won;
    totalLost += s.lost;
  }

  lines.push('', `Tổng: ${totalNew} lead mới · ${totalDeal} chuyển deal · ${totalWon} thắng · ${totalLost} thua`);
  lines.push('', 'Gõ "chi tiết <tên cty>" để xem theo nhân viên.');
  return lines.join('\n').slice(0, 1900);
}

async function openGroupConversation(schedule, channelType, channelId, messageId) {
  if (!schedule.conversation_enabled) return null;
  if (channelType !== 'group') return null;

  const ttlMin = Math.max(5, schedule.conversation_ttl_minutes || 60);
  const expiresAt = new Date(Date.now() + ttlMin * 60 * 1000).toISOString();

  await supabase
    .from('ai_chat_bot_conversations')
    .update({ closed: true })
    .eq('channel_type', channelType)
    .eq('channel_id', channelId)
    .eq('closed', false);

  const { data, error } = await supabase
    .from('ai_chat_bot_conversations')
    .insert({
      schedule_id: schedule.id,
      channel_type: channelType,
      channel_id: channelId,
      expires_at: expiresAt,
      last_message_id: messageId || null,
    })
    .select('id')
    .single();

  if (error) {
    console.warn('[ai-report-menu] open conversation lỗi:', error.message);
    return null;
  }
  return data?.id || null;
}

/**
 * Gửi menu hoặc báo cáo trực tiếp cho playbook company_report.
 */
async function runReportMenuSend(schedule, playbook, channelInfo, io) {
  const range = resolveTimeRange(
    schedule.time_scope || 'today',
    schedule.time_scope_days_offset ?? 0,
  );

  let content;
  const isGroup = schedule.channel_type === 'group';
  let isDm = false;
  let personalUid = null;
  if (isGroup) {
    isDm = await isDirectWithBot(schedule.channel_id);
    if (isDm && schedule.personal_scope_only) {
      personalUid = await getDmRecipientUserId(schedule.channel_id);
    }
  }

  const stopTyping = startBotTyping(io, schedule.channel_type, schedule.channel_id);
  try {
    const companies = await listCompaniesInScope({
      schedule_id: schedule.id,
      personal_recipient_user_id: personalUid,
    });

    if (companies.length === 0) {
      content = `📊 Không có công ty nào trong phạm vi báo cáo (${range.label_vn}). Kiểm tra công ty trên lịch.`;
    } else if (companies.length === 1) {
      content = await formatCompanyReportText({
        company_id: companies[0].id,
        schedule_id: schedule.id,
        personal_recipient_user_id: personalUid,
      });
    } else if (isDm) {
      /* DM với nhiều công ty — vẫn show menu */
      content = buildMenuText(companies, range.label_vn);
    } else {
      content = buildMenuText(companies, range.label_vn);
    }
  } finally {
    stopTyping();
  }

  let inserted;
  if (schedule.channel_type === 'department') {
    inserted = await insertDepartmentBotMessage(schedule.channel_id, content, io, channelInfo);
  } else {
    inserted = await insertGroupBotMessage(schedule.channel_id, content, io, channelInfo);
  }

  if (isGroup && !isDm && schedule.conversation_enabled) {
    await openGroupConversation(schedule, 'group', schedule.channel_id, inserted?.id);
  }

  return {
    status: 'ok',
    message_id: inserted?.id || null,
    preview: content.slice(0, 240),
    playbook_code: playbook.code,
  };
}

module.exports = {
  runReportMenuSend,
  buildMenuText,
  buildAllCompaniesSummary,
  openGroupConversation,
};
