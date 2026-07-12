/**
 * Snapshot skill library + lịch bot kênh khi mở phiên chat (OpenClaw session snapshot).
 */
const { listLibrarySkills } = require('./aiBotSkillLibrary');
const { supabase } = require('../config/supabase');

async function loadChannelReportSchedules(channelKind, channelId) {
  if (!channelKind || !channelId) return [];
  const { data } = await supabase
    .from('ai_chat_bot_schedules')
    .select('id, title, run_slots, time_scope, enabled, schedule_kind, company_whitelist, department_whitelist, playbook:ai_chat_bot_playbooks(name, data_source, code)')
    .eq('channel_type', channelKind)
    .eq('channel_id', channelId)
    .eq('enabled', true)
    .order('updated_at', { ascending: false })
    .limit(12);
  return (data || []).filter((s) => (s.schedule_kind || 'report') !== 'reminder');
}

async function ensureSkillSnapshot(channelKind, channelId, openConv) {
  const channelRows = await loadChannelReportSchedules(channelKind, channelId);
  const scheduleSnap = channelRows.map((s) => ({
    id: s.id,
    title: s.title,
    time_scope: s.time_scope,
    playbook: s.playbook?.name || s.playbook?.code,
    data_source: s.playbook?.data_source,
  }));

  if (openConv?.skill_snapshot?.length) {
    return {
      snapshot: openConv.skill_snapshot,
      channelSchedules: scheduleSnap,
      convId: openConv.id,
    };
  }

  const lib = listLibrarySkills({ enabled_only: true });
  const snapshot = (lib.skills || []).map((s) => ({
    code: s.code,
    title: s.title,
    skill_type: s.skill_type,
    summary: s.summary,
    when_to_use: s.when_to_use || s.instruction || s.summary,
  }));

  if (!openConv?.id) {
    return { snapshot, channelSchedules: scheduleSnap, convId: null };
  }

  await supabase
    .from('ai_chat_bot_conversations')
    .update({ skill_snapshot: snapshot })
    .eq('id', openConv.id);

  return { snapshot, channelSchedules: scheduleSnap, convId: openConv.id };
}

function formatSnapshotForPrompt(snapshot, channelSchedules = []) {
  const parts = [];
  if (channelSchedules?.length) {
    parts.push('LỊCH BOT BÁO CÁO ĐÃ CẤU HÌNH TRONG KÊNH (gửi BC → send_report; tạo lịch mới → kế thừa bot/skill dưới):');
    channelSchedules.slice(0, 10).forEach((s) => {
      parts.push(`• ${s.title} · ${s.playbook || '—'} (${s.data_source || '—'}) · kỳ ${s.time_scope || 'today'}`);
    });
  }
  if (snapshot?.length) {
    parts.push('SKILL / BOT CÓ SẴN (tạo lịch: preview_skill hoặc preview — hệ thống khớp tự động):');
    snapshot.slice(0, 15).forEach((s) => {
      parts.push(`• ${s.code} — ${s.title}${s.when_to_use ? `: ${s.when_to_use}` : ''}`);
    });
  }
  return parts.join('\n');
}

module.exports = {
  ensureSkillSnapshot,
  formatSnapshotForPrompt,
  loadChannelReportSchedules,
};
