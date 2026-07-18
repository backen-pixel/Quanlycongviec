/**
 * Phát sự kiện socket để client refresh badge sidebar (social, assignments, updates).
 * Ưu tiên user → company → broadcast toàn cục (fallback).
 * @param {import('socket.io').Server|{ get: Function }} appOrIo
 * @param {'social'|'assignments'|'updates'|'events'} channel
 * @param {Record<string, unknown>} [extra]
 */
const { emitScoped } = require('./socketEmit');

function emitNotifyBadge(appOrIo, channel, extra = {}) {
  const io = appOrIo?.emit ? appOrIo : (typeof appOrIo?.get === 'function' ? appOrIo.get('io') : null);
  if (!io?.emit) return;
  const companyId = extra.company_id || extra.companyId || null;
  const userId = extra.user_id || extra.userId || null;
  emitScoped(
    io,
    { userId, companyId },
    'notify:badge',
    { channel, ts: Date.now(), ...extra },
  );
}

module.exports = { emitNotifyBadge };
