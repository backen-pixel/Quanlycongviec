/**
 * Gửi thêm bản copy báo cáo (cùng nội dung) qua DM bot tới admin / team.
 */
const { supabase } = require('../config/supabase');
const { isSystemAdmin } = require('./adminRole');
const { normalizeVnSearch } = require('./aiBotSkills');

const AI_BOT_USER_ID = '00000000-0000-0000-0000-0000000000a1';

async function resolveSystemAdminUserIds() {
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, role, company_id, is_active')
    .eq('is_active', true)
    .in('role', ['admin', 'platform_admin']);
  if (error) throw new Error(error.message);
  return (data || [])
    .filter((u) => {
      if (u.role === 'platform_admin') return true;
      const n = normalizeVnSearch(u.full_name);
      if (/admin he thong/.test(n)) return true;
      if (isSystemAdmin(u) && (/^khoa$|^nam$/.test(n.trim()))) return true;
      return false;
    })
    .map((u) => String(u.id));
}

async function resolveKhoaItTeamUserIds() {
  const { data: groups } = await supabase
    .from('messenger_groups')
    .select('id')
    .ilike('name', 'Trò chuyện: Khoa IT%');
  const groupIds = (groups || []).map((g) => g.id);
  if (!groupIds.length) return [];

  const { data: members, error } = await supabase
    .from('messenger_group_members')
    .select('user_id')
    .in('group_id', groupIds);
  if (error) throw new Error(error.message);

  const userIds = [...new Set((members || []).map((m) => String(m.user_id)).filter((id) => id !== AI_BOT_USER_ID))];
  if (!userIds.length) return [];

  const { data: users } = await supabase
    .from('users')
    .select('id, is_active, is_bot')
    .in('id', userIds);

  return (users || [])
    .filter((u) => u.is_active !== false && !u.is_bot)
    .map((u) => String(u.id));
}

async function resolveTeamUserIds(teamLabel) {
  const q = normalizeVnSearch(teamLabel);
  if (!q) return [];
  if (q.includes('khoa it') || q === 'it' || q.includes('khoa it')) {
    return resolveKhoaItTeamUserIds();
  }
  return [];
}

/**
 * Gom danh sách user nhận bản copy báo cáo.
 */
async function resolveBroadcastRecipients({
  notify_system_admins = false,
  notify_team = null,
  broadcast_user_ids = null,
  recipient_user_ids = null,
  exclude_user_id = null,
} = {}) {
  const ids = new Set([
    ...(Array.isArray(broadcast_user_ids) ? broadcast_user_ids : []),
    ...(Array.isArray(recipient_user_ids) ? recipient_user_ids : []),
  ].filter(Boolean).map(String));

  if (notify_system_admins) {
    for (const uid of await resolveSystemAdminUserIds()) ids.add(uid);
  }
  if (notify_team) {
    for (const uid of await resolveTeamUserIds(notify_team)) ids.add(uid);
  }
  if (exclude_user_id) ids.delete(String(exclude_user_id));
  ids.delete(AI_BOT_USER_ID);
  return [...ids];
}

async function loadBroadcastRecipientNames(userIds) {
  if (!userIds?.length) return [];
  const { data } = await supabase
    .from('users')
    .select('id, full_name')
    .in('id', userIds.slice(0, 30));
  return (data || []).map((u) => u.full_name || u.id.slice(0, 8));
}

async function getPrimaryChannelRecipientUserId(schedule) {
  if (schedule?.channel_type !== 'group' || !schedule?.channel_id) return null;
  const { data: g } = await supabase
    .from('messenger_groups')
    .select('is_direct')
    .eq('id', schedule.channel_id)
    .maybeSingle();
  if (!g?.is_direct) return null;
  const { data: members } = await supabase
    .from('messenger_group_members')
    .select('user_id')
    .eq('group_id', schedule.channel_id);
  const hit = (members || []).find((m) => String(m.user_id) !== AI_BOT_USER_ID);
  return hit?.user_id || null;
}

/**
 * Gửi cùng nội dung báo cáo qua DM bot tới từng user (bỏ qua kênh chính nếu trùng).
 */
async function broadcastReportCopy(content, userIds, io, { excludeUserId = null } = {}) {
  const { ensureDmGroupWithBot, insertGroupBotMessage, loadChannelInfo } = require('./aiBotSender');
  const seen = new Set();
  let ok = 0;
  let fail = 0;

  for (const uid of userIds || []) {
    const id = String(uid);
    if (!id || seen.has(id)) continue;
    if (excludeUserId && id === String(excludeUserId)) continue;
    seen.add(id);
    try {
      const gid = await ensureDmGroupWithBot(id);
      if (!gid) { fail += 1; continue; }
      const channelInfo = await loadChannelInfo('group', gid);
      await insertGroupBotMessage(gid, content, io, channelInfo);
      ok += 1;
    } catch (e) {
      fail += 1;
      console.warn('[ai-bot-broadcast] DM fail', id, e.message);
    }
  }
  return { ok, fail, total: seen.size };
}

module.exports = {
  resolveBroadcastRecipients,
  resolveSystemAdminUserIds,
  resolveKhoaItTeamUserIds,
  loadBroadcastRecipientNames,
  getPrimaryChannelRecipientUserId,
  broadcastReportCopy,
};
