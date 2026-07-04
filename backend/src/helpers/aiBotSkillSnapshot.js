/**
 * Snapshot skill library khi mở phiên chat (OpenClaw session snapshot).
 */
const { listLibrarySkills } = require('./aiBotSkillLibrary');
const { supabase } = require('../config/supabase');

async function ensureSkillSnapshot(channelKind, channelId, openConv) {
  if (openConv?.skill_snapshot?.length) {
    return { snapshot: openConv.skill_snapshot, convId: openConv.id };
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
    return { snapshot, convId: null };
  }

  await supabase
    .from('ai_chat_bot_conversations')
    .update({ skill_snapshot: snapshot })
    .eq('id', openConv.id);

  return { snapshot, convId: openConv.id };
}

function formatSnapshotForPrompt(snapshot) {
  if (!snapshot?.length) return '';
  const lines = ['SKILL SNAPSHOT PHIÊN (ổn định trong session — ưu tiên khi user gọi /skill):'];
  snapshot.slice(0, 15).forEach((s) => {
    lines.push(`• ${s.code} — ${s.title}${s.when_to_use ? `: ${s.when_to_use}` : ''}`);
  });
  return lines.join('\n');
}

module.exports = {
  ensureSkillSnapshot,
  formatSnapshotForPrompt,
};
