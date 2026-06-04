const { supabase } = require('../config/supabase');

const CALL_LOG_PREFIX = ':call_log:';
const MSG_USER_SELECT =
  '*, user:users!messenger_group_messages_user_id_fkey(id, full_name, avatar, is_bot)';

function directPairKey(userIdA, userIdB) {
  const a = String(userIdA);
  const b = String(userIdB);
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

async function resolveDirectMessengerGroupId(userIdA, userIdB) {
  const key = directPairKey(userIdA, userIdB);
  const { data } = await supabase
    .from('messenger_groups')
    .select('id')
    .eq('direct_pair_key', key)
    .maybeSingle();
  return data?.id || null;
}

async function fetchUserNames(userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
  const out = {};
  if (!ids.length) return out;
  const { data } = await supabase.from('users').select('id, full_name, email').in('id', ids);
  for (const u of data || []) {
    out[String(u.id)] = u.full_name || u.email || 'Thành viên';
  }
  return out;
}

function parseCallLogPayload(content) {
  const raw = content == null ? '' : String(content).trim();
  if (!raw.startsWith(CALL_LOG_PREFIX)) return null;
  try {
    const parsed = JSON.parse(raw.slice(CALL_LOG_PREFIX.length));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function formatDuration(sec) {
  const n = Math.max(0, Math.floor(Number(sec) || 0));
  if (n < 1) return '0:00';
  const m = Math.floor(n / 60);
  const s = n % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Nhãn hiển thị trong chat / preview theo người xem.
 * @param {object} payload
 * @param {string} [viewerUserId]
 */
function formatCallLogLine(payload, viewerUserId) {
  if (!payload || payload.v !== 1) return null;
  const kindLabel = payload.kind === 'video' ? 'Video' : 'Thoại';
  const me = viewerUserId != null ? String(viewerUserId) : '';
  const callerId = String(payload.callerId || payload.hostId || '');

  if (payload.isGroup) {
    switch (payload.status) {
      case 'completed':
        return `📞 Cuộc gọi nhóm ${kindLabel} · ${formatDuration(payload.durationSec)}`;
      case 'missed':
        return `📞 Cuộc gọi nhóm nhỡ (${kindLabel})`;
      case 'cancelled':
        return `📞 Đã huỷ cuộc gọi nhóm (${kindLabel})`;
      default:
        return `📞 Cuộc gọi nhóm (${kindLabel})`;
    }
  }

  const isOutgoing = !!(me && callerId && me === callerId);

  switch (payload.status) {
    case 'completed':
      return isOutgoing
        ? `📞 Cuộc gọi đi (${kindLabel}) · ${formatDuration(payload.durationSec)}`
        : `📞 Cuộc gọi đến (${kindLabel}) · ${formatDuration(payload.durationSec)}`;
    case 'missed':
      return isOutgoing
        ? `📞 Cuộc gọi đi · không có phản hồi (${kindLabel})`
        : `📞 Cuộc gọi nhỡ (${kindLabel})`;
    case 'rejected':
      return isOutgoing
        ? `📞 Bị từ chối (${kindLabel})`
        : `📞 Cuộc gọi đến · đã từ chối (${kindLabel})`;
    case 'busy':
      return isOutgoing
        ? `📞 Máy bận (${kindLabel})`
        : `📞 Cuộc gọi đến · máy bận (${kindLabel})`;
    case 'cancelled':
      return isOutgoing
        ? `📞 Đã huỷ cuộc gọi (${kindLabel})`
        : `📞 Cuộc gọi nhỡ (${kindLabel})`;
    default:
      return `📞 Cuộc gọi (${kindLabel})`;
  }
}

function buildCallLogStorageContent(payload) {
  return `${CALL_LOG_PREFIX}${JSON.stringify({ v: 1, ...payload })}`;
}

async function fetchMessengerMessageById(id) {
  const { data, error } = await supabase
    .from('messenger_group_messages')
    .select(MSG_USER_SELECT)
    .eq('id', id)
    .single();
  if (error || !data) return null;
  return data;
}

/**
 * Ghi tin nhắn hệ thống cuộc gọi vào nhóm chat và broadcast realtime.
 */
async function persistMessengerCallLog(io, { groupId, actorUserId, payload }) {
  if (!groupId || !payload) return null;
  const content = buildCallLogStorageContent(payload);
  const actor = actorUserId || payload.callerId || payload.hostId;
  if (!actor) return null;

  const { data, error } = await supabase
    .from('messenger_group_messages')
    .insert({
      group_id: groupId,
      user_id: actor,
      content,
      message_type: 'call',
      is_system: true,
    })
    .select('id')
    .single();
  if (error) {
    console.warn('[messenger-call-log] insert failed:', error.message);
    return null;
  }

  const full = await fetchMessengerMessageById(data.id);
  if (io && full) {
    io.to(`messenger_group:${groupId}`).emit('messenger_group:chat', full);
  }
  return full;
}

function mapRejectReasonToStatus(reason, { endedByUserId, callerId, answeredAt } = {}) {
  const r = String(reason || '').toLowerCase();
  if (r === 'rejected') return 'rejected';
  if (r === 'busy') return 'busy';
  if (r === 'no_answer') return 'missed';
  if (answeredAt) return 'completed';
  if (String(endedByUserId) === String(callerId)) return 'cancelled';
  return 'missed';
}

async function finalizeDirectCallLog(io, session, { status, endedByUserId, reason } = {}) {
  if (!session || session.logged) return;
  if (!session.groupId) {
    console.warn('[messenger-call-log] skip 1-1: chưa có nhóm chat messenger', {
      callerId: session.callerId,
      calleeId: session.calleeId,
    });
    return;
  }
  session.logged = true;

  let finalStatus = status;
  if (!finalStatus) {
    if (session.answeredAt) finalStatus = 'completed';
    else {
      finalStatus = mapRejectReasonToStatus(reason, {
        endedByUserId,
        callerId: session.callerId,
        answeredAt: session.answeredAt,
      });
    }
  }

  let durationSec = 0;
  if (finalStatus === 'completed' && session.answeredAt) {
    durationSec = Math.max(1, Math.round((Date.now() - session.answeredAt) / 1000));
  }

  const names = await fetchUserNames([session.callerId, session.calleeId]);
  await persistMessengerCallLog(io, {
    groupId: session.groupId,
    actorUserId: session.callerId,
    payload: {
      status: finalStatus,
      kind: session.kind || 'audio',
      isGroup: false,
      callerId: session.callerId,
      calleeId: session.calleeId,
      callerName: names[session.callerId],
      calleeName: names[session.calleeId],
      durationSec,
    },
  });
}

async function finalizeGroupCallLog(io, call) {
  if (!call || call.logged || !call.groupId) return;
  call.logged = true;

  const connectedAt = call.connectedAt || null;
  const durationSec =
    connectedAt != null ? Math.max(1, Math.round((Date.now() - connectedAt) / 1000)) : 0;
  const status = connectedAt ? 'completed' : 'missed';

  const names = await fetchUserNames([call.hostId]);
  await persistMessengerCallLog(io, {
    groupId: call.groupId,
    actorUserId: call.hostId,
    payload: {
      status,
      kind: call.kind || 'audio',
      isGroup: true,
      hostId: call.hostId,
      hostName: names[call.hostId] || call.participants?.get?.(call.hostId)?.name,
      durationSec,
      participantCount: call.participants?.size || 0,
    },
  });
}

module.exports = {
  CALL_LOG_PREFIX,
  directPairKey,
  resolveDirectMessengerGroupId,
  parseCallLogPayload,
  formatCallLogLine,
  formatDuration,
  buildCallLogStorageContent,
  persistMessengerCallLog,
  fetchUserNames,
  mapRejectReasonToStatus,
  finalizeDirectCallLog,
  finalizeGroupCallLog,
};
