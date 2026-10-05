'use strict';
const uuid = x => typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const object = x => x && typeof x === 'object' && !Array.isArray(x);
const only = (x, keys) => object(x) && Object.keys(x).every(k => keys.includes(k));
const version = x => typeof x === 'string' && /^[a-f0-9]{32}$/.test(x);
const date = x => typeof x === 'string' && Number.isFinite(Date.parse(x));
const nullableText = x => x === null || typeof x === 'string';
const count = x => Number.isSafeInteger(x) && x >= 0;
const state = x => ['PENDING', 'ACKNOWLEDGED'].includes(x);
const careMode = x => ['WAITING', 'HUMAN_REQUESTED', 'HUMAN_ACTIVE', 'OPTED_OUT'].includes(x);
const appointment = x => only(x, ['startsAt', 'endsAt', 'location', 'status', 'timeZone']) && date(x.startsAt) && date(x.endsAt) && nullableText(x.location) && nullableText(x.status) && x.timeZone === 'Asia/Ho_Chi_Minh';
const receipt = (x, company) => only(x, ['proposalId', 'companyId', 'requestId', 'actorId', 'state', 'receivedVersion', 'messageCount', 'receivedAt', 'replayed', 'aiMaySend'])
  && x.companyId === company && uuid(x.proposalId) && uuid(x.requestId) && uuid(x.actorId) && x.state === 'ACKNOWLEDGED'
  && version(x.receivedVersion) && count(x.messageCount) && date(x.receivedAt) && typeof x.replayed === 'boolean' && x.aiMaySend === false;
function validView(x, company) {
  return only(x, ['proposalId', 'companyId', 'threadId', 'eventId', 'state', 'createdAt', 'recipientId', 'recipientName', 'ownerId', 'regionId', 'regionName', 'leadId', 'leadTitle', 'requirements', 'customer', 'appointment', 'confirmedAppointment', 'careMode', 'careReason', 'deliveryConflict', 'messageCount', 'receipt', 'bookingStatus', 'version', 'assignmentCurrent', 'appointmentUnchanged', 'canAcknowledge', 'aiMaySend', 'messages', 'nextBefore'])
    && x.companyId === company && [x.proposalId, x.threadId, x.eventId, x.recipientId, x.regionId, x.leadId].every(uuid)
    && (x.ownerId === null || uuid(x.ownerId)) && state(x.state) && date(x.createdAt) && version(x.version)
    && [x.recipientName, x.regionName, x.leadTitle, x.requirements, x.careReason].every(nullableText)
    && only(x.customer, ['id', 'name', 'phone', 'email']) && (x.customer.id === null || uuid(x.customer.id)) && [x.customer.name, x.customer.phone, x.customer.email].every(nullableText)
    && appointment(x.appointment) && only(x.confirmedAppointment, ['startsAt', 'endsAt', 'location']) && date(x.confirmedAppointment.startsAt) && date(x.confirmedAppointment.endsAt) && typeof x.confirmedAppointment.location === 'string'
    && careMode(x.careMode) && [x.deliveryConflict, x.assignmentCurrent, x.appointmentUnchanged, x.canAcknowledge].every(v => typeof v === 'boolean')
    && count(x.messageCount) && x.bookingStatus === 'BOOKED_HANDOFF_PENDING' && x.aiMaySend === false
    && (x.receipt === null || (receipt(x.receipt, company) && x.receipt.proposalId === x.proposalId && x.receipt.actorId === x.recipientId))
    && (x.state === 'ACKNOWLEDGED') === (x.receipt !== null)
    && (!x.canAcknowledge || (x.state === 'PENDING' && x.assignmentCurrent && x.appointmentUnchanged))
    && Array.isArray(x.messages) && x.messages.length <= 50 && x.messageCount >= x.messages.length && new Set(x.messages.map(m => m.id)).size === x.messages.length
    && x.messages.every(m => only(m, ['id', 'direction', 'intent', 'content', 'attachments', 'sent_at']) && uuid(m.id) && ['inbound', 'outbound'].includes(m.direction)
      && ['MESSAGE', 'REQUEST_HUMAN', 'OPT_OUT', 'OUTBOUND_ECHO'].includes(m.intent) && typeof m.content === 'string' && Array.isArray(m.attachments) && date(m.sent_at))
    && (x.nextBefore === null || (x.nextBefore === x.messages[0]?.id && uuid(x.nextBefore)));
}
function validQueue(x, company, requestedState) {
  return only(x, ['companyId', 'state', 'items', 'counts', 'unavailableCount', 'version', 'nextAfter', 'observedAt', 'aiMaySend']) && x.companyId === company && x.state === requestedState
    && only(x.counts, ['PENDING', 'ACKNOWLEDGED']) && count(x.counts.PENDING) && count(x.counts.ACKNOWLEDGED) && count(x.unavailableCount)
    && version(x.version) && date(x.observedAt) && x.aiMaySend === false && Array.isArray(x.items) && x.items.length <= 50
    && new Set(x.items.map(i => i.proposalId)).size === x.items.length
    && x.items.every(i => only(i, ['proposalId', 'state', 'createdAt', 'scopeReady', 'appointment', 'title', 'careMode']) && uuid(i.proposalId) && i.state === requestedState && date(i.createdAt) && typeof i.scopeReady === 'boolean'
      && (i.scopeReady ? appointment(i.appointment) && nullableText(i.title) && careMode(i.careMode) : i.appointment === null && i.title === null && i.careMode === null))
    && (x.nextAfter === null || (uuid(x.nextAfter) && x.nextAfter === x.items.at(-1)?.proposalId));
}
function createSurveyHandoffs({ db, isPrimary, env = process.env }) {
  const enabled = () => env.VPT_SURVEY_HANDOFFS === '1' && isPrimary() === true;
  async function handle(req, res, operation) {
    res.set('Cache-Control', 'no-store');
    if (!enabled()) return res.status(503).json({ error: 'Nhận bàn giao khảo sát chưa được mở.' });
    const actor = req.user?.userId || req.user?.id, b = operation === 'ack' ? req.body : req.query, company = b?.companyId;
    if (!uuid(actor) || !uuid(company) || (req.user?.id && req.user?.userId && req.user.id !== req.user.userId)) return res.status(403).json({ error: 'Không xác định được quyền nhận bàn giao.' });
    let name, args;
    if (operation === 'queue' && only(b, ['companyId', 'state', 'after', 'version']) && state(b.state) && ((b.after === undefined && b.version === undefined) || (uuid(b.after) && version(b.version)))) {
      name = 'crm_survey_handoff_queue'; args = { p_state: b.state, p_after: b.after || null, p_version: b.version || null };
    } else if (operation === 'read' && only(b, ['companyId', 'proposalId', 'before', 'version']) && uuid(b.proposalId) && ((b.before === undefined && b.version === undefined) || (uuid(b.before) && version(b.version)))) {
      name = 'crm_survey_handoff_read'; args = { p_id: b.proposalId, p_before: b.before || null, p_version: b.version || null };
    } else if (operation === 'ack' && only(b, ['companyId', 'requestId', 'command']) && uuid(b.requestId) && only(b.command, ['proposalId', 'expectedVersion']) && uuid(b.command.proposalId) && version(b.command.expectedVersion)) {
      name = 'crm_survey_handoff_ack'; args = { p_request: b.requestId, p_command: b.command };
    } else return res.status(400).json({ error: 'Yêu cầu nhận bàn giao không hợp lệ.' });
    try {
      if (!enabled()) throw Error('Primary unavailable');
      const r = await db.rpc(name, { p_actor: actor, p_company: company, ...args });
      if (r?.error) throw Object.assign(Error('Storage unavailable'), { code: r.error.code });
      const x = r?.data;
      const valid = operation === 'queue' ? validQueue(x, company, b.state) : operation === 'read' ? validView(x, company) && x.proposalId === b.proposalId && (!b.version || x.version === b.version) && (!x.canAcknowledge || x.recipientId === actor)
        : receipt(x, company) && x.proposalId === b.command.proposalId && x.actorId === actor && x.requestId === b.requestId && x.receivedVersion === b.command.expectedVersion;
      if (!enabled() || !valid) throw Error('Invalid handoff result');
      return res.json(x);
    } catch (e) {
      const status = e.code === '42501' ? 403 : ['40001', '23505'].includes(e.code) ? 409 : ['22023', '22P02'].includes(e.code) ? 400 : 503;
      return res.status(status).json({ error: status === 409 ? 'Hồ sơ đã thay đổi. Tải lại trước khi xác nhận.' : 'Chưa truy cập được bàn giao trong phạm vi hiện tại.' });
    }
  }
  return { handle };
}
module.exports = { createSurveyHandoffs, validView, validQueue, receipt };
