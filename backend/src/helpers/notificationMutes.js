/**
 * Tắt tạm thông báo theo entity (bình luận deal / tin nhắn Messenger).
 * muted_until NULL = đến khi mở lại; có giá trị = hết hạn sau thời điểm đó.
 */
const { supabase } = require('../config/supabase');

const MUTE_DURATIONS = {
  '1h': 1,
  '2h': 2,
  '3h': 3,
  '8h': 8,
  indefinite: null,
  until: null,
};

const COMMENT_ENTITY_TYPES = new Set(['lead', 'crm_lead', 'crm_deal']);

const MUTE_SCOPES = {
  comment_added: { entityType: 'lead', notifType: 'comment_added' },
  messenger_chat: { entityType: 'messenger_group', notifType: 'messenger_chat' },
};

function resolveMuteUntil(duration) {
  const key = String(duration || '').toLowerCase().trim();
  if (!(key in MUTE_DURATIONS)) return { error: 'duration không hợp lệ (1h|2h|3h|8h|indefinite)' };
  const hours = MUTE_DURATIONS[key];
  if (hours == null) return { mutedUntil: null, durationKey: 'indefinite' };
  return {
    mutedUntil: new Date(Date.now() + hours * 60 * 60 * 1000).toISOString(),
    durationKey: key,
  };
}

function resolveCommentLeadId(entityType, entityId, metadata) {
  const meta = metadata && typeof metadata === 'object' ? metadata : {};
  if (meta.lead_id) return String(meta.lead_id);
  if (COMMENT_ENTITY_TYPES.has(String(entityType || '')) && entityId) return String(entityId);
  return null;
}

function resolveMessengerGroupId(entityType, entityId, metadata) {
  const meta = metadata && typeof metadata === 'object' ? metadata : {};
  if (meta.group_id || meta.bubble_key) return String(meta.group_id || meta.bubble_key);
  if (String(entityType || '') === 'messenger_group' && entityId) return String(entityId);
  return null;
}

function isMuteActive(row) {
  if (!row) return false;
  if (row.muted_until == null) return true;
  return new Date(row.muted_until).getTime() > Date.now();
}

async function fetchMuteRow(userId, entityType, entityId, muteScope) {
  const { data, error } = await supabase
    .from('notification_mutes')
    .select('id, muted_until, entity_type, entity_id, mute_scope')
    .eq('user_id', userId)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('mute_scope', muteScope)
    .maybeSingle();

  if (error) {
    if (error.code === '42P01' || /notification_mutes/i.test(error.message || '')) return null;
    console.warn('[notificationMutes] check error:', error.message);
    return null;
  }
  return data;
}

/**
 * True nếu user đang tắt TB comment_added cho lead/deal này.
 */
async function isCommentMutedForUser(userId, entityType, entityId, metadata = null) {
  if (!userId) return false;
  const leadId = resolveCommentLeadId(entityType, entityId, metadata);
  if (!leadId) return false;
  const data = await fetchMuteRow(userId, 'lead', leadId, 'comment_added');
  return isMuteActive(data);
}

/**
 * True nếu user đang tắt TB messenger_chat cho nhóm này.
 */
async function isMessengerMutedForUser(userId, entityType, entityId, metadata = null) {
  if (!userId) return false;
  const groupId = resolveMessengerGroupId(entityType, entityId, metadata);
  if (!groupId) return false;
  const data = await fetchMuteRow(userId, 'messenger_group', groupId, 'messenger_chat');
  return isMuteActive(data);
}

async function upsertMute(userId, { scope, entityId, duration }) {
  const cfg = MUTE_SCOPES[scope];
  if (!cfg) return { error: 'scope không hợp lệ (comment_added|messenger_chat)' };
  const id = String(entityId || '').trim();
  if (!id) return { error: 'Thiếu entity_id' };

  const resolved = resolveMuteUntil(duration);
  if (resolved.error) return { error: resolved.error };

  const row = {
    user_id: userId,
    entity_type: cfg.entityType,
    entity_id: id,
    mute_scope: scope,
    muted_until: resolved.mutedUntil,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('notification_mutes')
    .upsert(row, { onConflict: 'user_id,entity_type,entity_id,mute_scope' })
    .select()
    .single();

  if (error) return { error: error.message };
  return { mute: data, duration: resolved.durationKey, scope, notifType: cfg.notifType };
}

async function clearMute(userId, { scope, entityId }) {
  const cfg = MUTE_SCOPES[scope];
  if (!cfg) return { error: 'scope không hợp lệ' };
  const id = String(entityId || '').trim();
  if (!id) return { error: 'Thiếu entity_id' };

  const { error } = await supabase
    .from('notification_mutes')
    .delete()
    .eq('user_id', userId)
    .eq('entity_type', cfg.entityType)
    .eq('entity_id', id)
    .eq('mute_scope', scope);
  if (error) return { error: error.message };
  return { ok: true };
}

async function upsertCommentMute(userId, leadId, duration) {
  return upsertMute(userId, { scope: 'comment_added', entityId: leadId, duration });
}

async function clearCommentMute(userId, leadId) {
  return clearMute(userId, { scope: 'comment_added', entityId: leadId });
}

async function getCommentMute(userId, leadId) {
  const data = await fetchMuteRow(userId, 'lead', leadId, 'comment_added');
  if (!isMuteActive(data)) return { mute: null };
  return { mute: data };
}

async function listActiveMutes(userId, scopes = null) {
  let q = supabase
    .from('notification_mutes')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(300);
  if (Array.isArray(scopes) && scopes.length) {
    q = q.in('mute_scope', scopes);
  }
  const { data, error } = await q;
  if (error) return { error: error.message };
  const mutes = (data || []).filter(isMuteActive);
  return { mutes };
}

async function listActiveCommentMutes(userId) {
  return listActiveMutes(userId, ['comment_added']);
}

module.exports = {
  MUTE_DURATIONS,
  MUTE_SCOPES,
  resolveMuteUntil,
  resolveCommentLeadId,
  resolveMessengerGroupId,
  isCommentMutedForUser,
  isMessengerMutedForUser,
  upsertMute,
  clearMute,
  upsertCommentMute,
  clearCommentMute,
  getCommentMute,
  listActiveCommentMutes,
  listActiveMutes,
  isMuteActive,
};
