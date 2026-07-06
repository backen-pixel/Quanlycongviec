/**
 * Call session state — Redis (multi-instance) + in-memory fallback.
 * Group call + legacy direct call (call:invite flow trong server.js).
 */
const { getRedisIfReady } = require('../config/redis');

const TTL_SEC = 4 * 3600;
const KEY_G = (id) => `call:s:g:${id}`;
const KEY_GIDX = (gid) => `call:s:gidx:${gid}`;
const KEY_G_ACTIVE = 'call:s:g:active';
const KEY_D = (id) => `call:s:d:${id}`;
const KEY_D_ACTIVE = 'call:s:d:active';

const memGroup = new Map();
const memGroupByGid = new Map();
const memDirect = new Map();

function serializeGroup(call) {
  return JSON.stringify({
    groupId: call.groupId,
    groupName: call.groupName,
    hostId: call.hostId,
    kind: call.kind,
    startedAt: call.startedAt,
    connectedAt: call.connectedAt,
    logged: !!call.logged,
    participants: [...call.participants.entries()],
    invitedIds: [...(call.invitedIds || [])],
    pendingJoinRequests: [...(call.pendingJoinRequests || new Map()).entries()],
  });
}

function deserializeGroup(raw) {
  const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return {
    groupId: o.groupId,
    groupName: o.groupName,
    hostId: o.hostId,
    kind: o.kind,
    startedAt: o.startedAt,
    connectedAt: o.connectedAt ?? null,
    logged: !!o.logged,
    participants: new Map(o.participants || []),
    invitedIds: new Set(o.invitedIds || []),
    pendingJoinRequests: new Map(o.pendingJoinRequests || []),
  };
}

async function getGroupCall(callId) {
  if (!callId) return null;
  const redis = getRedisIfReady();
  if (redis) {
    try {
      const raw = await redis.get(KEY_G(callId));
      if (raw) return deserializeGroup(raw);
    } catch { /* fallback */ }
  }
  return memGroup.get(String(callId)) || null;
}

async function setGroupCall(callId, call) {
  const id = String(callId);
  const redis = getRedisIfReady();
  if (redis) {
    try {
      const payload = serializeGroup(call);
      await redis.set(KEY_G(id), payload, 'EX', TTL_SEC);
      if (call.groupId) {
        await redis.set(KEY_GIDX(call.groupId), id, 'EX', TTL_SEC);
      }
      await redis.sadd(KEY_G_ACTIVE, id);
      await redis.expire(KEY_G_ACTIVE, TTL_SEC);
      return;
    } catch { /* fallback */ }
  }
  memGroup.set(id, call);
  if (call.groupId) memGroupByGid.set(String(call.groupId), id);
}

async function deleteGroupCall(callId) {
  const id = String(callId);
  const call = await getGroupCall(id);
  const redis = getRedisIfReady();
  if (redis) {
    try {
      await redis.del(KEY_G(id));
      if (call?.groupId) await redis.del(KEY_GIDX(call.groupId));
      await redis.srem(KEY_G_ACTIVE, id);
    } catch { /* ignore */ }
  }
  memGroup.delete(id);
  if (call?.groupId) memGroupByGid.delete(String(call.groupId));
}

async function hasGroupCall(callId) {
  const redis = getRedisIfReady();
  if (redis) {
    try {
      const n = await redis.exists(KEY_G(String(callId)));
      if (n) return true;
    } catch { /* fallback */ }
  }
  return memGroup.has(String(callId));
}

async function findGroupCallByGroupId(groupId) {
  if (!groupId) return null;
  const gid = String(groupId);
  const redis = getRedisIfReady();
  if (redis) {
    try {
      const callId = await redis.get(KEY_GIDX(gid));
      if (callId) {
        const call = await getGroupCall(callId);
        if (call) return { callId, call };
      }
    } catch { /* fallback */ }
  }
  const callId = memGroupByGid.get(gid);
  if (!callId) return null;
  const call = memGroup.get(callId);
  return call ? { callId, call } : null;
}

async function listActiveGroupCallIds() {
  const redis = getRedisIfReady();
  if (redis) {
    try {
      return (await redis.smembers(KEY_G_ACTIVE)) || [];
    } catch { /* fallback */ }
  }
  return [...memGroup.keys()];
}

async function forEachGroupCallWithParticipant(uid, fn) {
  const u = String(uid);
  const ids = await listActiveGroupCallIds();
  for (const callId of ids) {
    const call = await getGroupCall(callId);
    if (call?.participants?.has(u)) {
      await fn(callId, call);
    }
  }
}

/** Load → mutate → save. mutator return false để bỏ qua save. */
async function mutateGroupCall(callId, mutator) {
  const call = await getGroupCall(callId);
  if (!call) return null;
  const save = await mutator(call);
  if (save === false) return call;
  await setGroupCall(callId, call);
  return call;
}

async function getDirectCall(callId) {
  if (!callId) return null;
  const redis = getRedisIfReady();
  if (redis) {
    try {
      const raw = await redis.get(KEY_D(String(callId)));
      if (raw) return JSON.parse(raw);
    } catch { /* fallback */ }
  }
  return memDirect.get(String(callId)) || null;
}

async function setDirectCall(callId, session) {
  const id = String(callId);
  const redis = getRedisIfReady();
  if (redis) {
    try {
      await redis.set(KEY_D(id), JSON.stringify(session), 'EX', TTL_SEC);
      await redis.sadd(KEY_D_ACTIVE, id);
      await redis.expire(KEY_D_ACTIVE, TTL_SEC);
      return;
    } catch { /* fallback */ }
  }
  memDirect.set(id, session);
}

async function deleteDirectCall(callId) {
  const id = String(callId);
  const redis = getRedisIfReady();
  if (redis) {
    try {
      await redis.del(KEY_D(id));
      await redis.srem(KEY_D_ACTIVE, id);
    } catch { /* ignore */ }
  }
  memDirect.delete(id);
}

async function listActiveDirectCallIds() {
  const redis = getRedisIfReady();
  if (redis) {
    try {
      return (await redis.smembers(KEY_D_ACTIVE)) || [];
    } catch { /* fallback */ }
  }
  return [...memDirect.keys()];
}

async function forEachDirectCallForCallee(calleeId, fn) {
  const u = String(calleeId);
  const ids = await listActiveDirectCallIds();
  for (const callId of ids) {
    const session = await getDirectCall(callId);
    if (session && String(session.calleeId) === u) {
      await fn(callId, session);
    }
  }
}

module.exports = {
  getGroupCall,
  setGroupCall,
  deleteGroupCall,
  hasGroupCall,
  findGroupCallByGroupId,
  mutateGroupCall,
  getDirectCall,
  setDirectCall,
  deleteDirectCall,
  forEachGroupCallWithParticipant,
  forEachDirectCallForCallee,
};
