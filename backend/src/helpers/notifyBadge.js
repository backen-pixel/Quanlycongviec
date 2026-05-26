/**
 * Phát sự kiện socket để client refresh badge sidebar (social, assignments, updates).
 * @param {import('socket.io').Server|{ get: Function }} appOrIo
 * @param {'social'|'assignments'|'updates'|'events'} channel
 * @param {Record<string, unknown>} [extra]
 */
function emitNotifyBadge(appOrIo, channel, extra = {}) {
  const io = appOrIo?.emit ? appOrIo : (typeof appOrIo?.get === 'function' ? appOrIo.get('io') : null);
  if (!io?.emit) return;
  io.emit('notify:badge', { channel, ts: Date.now(), ...extra });
}

module.exports = { emitNotifyBadge };
