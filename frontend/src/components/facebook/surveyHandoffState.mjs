export const uuid = x => typeof x === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(x);
export const version = x => typeof x === 'string' && /^[a-f0-9]{32}$/.test(x);
const count = x => Number.isSafeInteger(x) && x >= 0;
export function queueResult(x, company, state) {
  if (!x || x.companyId !== company || x.state !== state || !version(x.version) || x.aiMaySend !== false
    || !count(x.counts?.PENDING) || !count(x.counts?.ACKNOWLEDGED) || !count(x.unavailableCount)
    || !Array.isArray(x.items) || x.items.length > 50 || new Set(x.items.map(i => i.proposalId)).size !== x.items.length
    || x.items.some(i => !uuid(i.proposalId) || i.state !== state || typeof i.scopeReady !== 'boolean' || (!i.scopeReady && (i.title !== null || i.appointment !== null || i.careMode !== null)))
    || !(x.nextAfter === null || (uuid(x.nextAfter) && x.nextAfter === x.items.at(-1)?.proposalId))) throw Error('Danh sách bàn giao chưa được xác minh.');
  return x;
}
export function detailResult(x, company, proposal) {
  if (!x || x.companyId !== company || x.proposalId !== proposal || !uuid(x.threadId) || !uuid(x.recipientId) || !version(x.version)
    || !['PENDING', 'ACKNOWLEDGED'].includes(x.state) || !['WAITING', 'OPTED_OUT', 'HUMAN_ACTIVE', 'HUMAN_REQUESTED'].includes(x.careMode)
    || x.aiMaySend !== false || typeof x.canAcknowledge !== 'boolean' || !count(x.messageCount) || !x.appointment || !x.customer
    || !Array.isArray(x.messages) || x.messages.length > 50 || x.messages.some(m => !uuid(m.id) || typeof m.content !== 'string' || !Array.isArray(m.attachments))
    || new Set(x.messages.map(m => m.id)).size !== x.messages.length || !(x.nextBefore === null || x.nextBefore === x.messages[0]?.id)) throw Error('Hồ sơ bàn giao chưa được xác minh.');
  return x;
}
export function receiptResult(x, pending, actor) {
  if (!x || x.companyId !== pending.companyId || x.proposalId !== pending.command.proposalId || x.requestId !== pending.requestId || x.actorId !== actor
    || x.receivedVersion !== pending.command.expectedVersion || x.state !== 'ACKNOWLEDGED' || typeof x.replayed !== 'boolean' || x.aiMaySend !== false
    || !Number.isFinite(Date.parse(x.receivedAt))) throw Error('Chưa xác minh được kết quả nhận bàn giao.');
  return x;
}
const key = (actor, company) => `vpt-survey-handoff:${actor}:${company}`;
export function pendingRead(storage, actor, company) {
  const raw = storage.getItem(key(actor, company));
  if (raw === null) return null;
  const x = JSON.parse(raw);
  if (!x || x.companyId !== company || !uuid(x.requestId) || !uuid(x.command?.proposalId) || !version(x.command?.expectedVersion)
    || Object.keys(x).sort().join(',') !== 'command,companyId,requestId' || Object.keys(x.command).sort().join(',') !== 'expectedVersion,proposalId') throw Error('Cần kiểm tra yêu cầu nhận bàn giao đã lưu.');
  return x;
}
export function pendingSave(storage, actor, company, x) {
  storage.setItem(key(actor, company), JSON.stringify(x));
  if (JSON.stringify(pendingRead(storage, actor, company)) !== JSON.stringify(x)) throw Error('Không lưu được yêu cầu để đối chiếu.');
}
export function pendingClear(storage, actor, company) {
  storage.removeItem(key(actor, company));
  if (storage.getItem(key(actor, company)) !== null) throw Error('Chưa xóa được yêu cầu đã đối chiếu.');
}
