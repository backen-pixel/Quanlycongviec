'use strict';
const uuid = x => typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const object = x => x && typeof x === 'object' && !Array.isArray(x);
const only = (x, keys) => object(x) && Object.keys(x).every(k => keys.includes(k));
const instant = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(x) && Number.isFinite(Date.parse(x));
const fail = code => Object.assign(new Error(code), { code });
function validCommand(c) {
  return only(c, ['threadId', 'optionId', 'startsAt', 'endsAt', 'location']) && uuid(c.threadId)
    && typeof c.optionId === 'string' && /^[a-f0-9]{32}$/.test(c.optionId)
    && instant(c.startsAt) && instant(c.endsAt) && Date.parse(c.endsAt) > Date.parse(c.startsAt)
    && typeof c.location === 'string' && c.location.trim().length >= 10 && c.location.trim().length <= 1000;
}
function validView(data, company) {
  return only(data, ['proposalId', 'companyId', 'threadId', 'state', 'business', 'expiresAt', 'reservationMade', 'booking', 'deliveryState', 'customerConfirmationRequired', 'requestId', 'replayed'])
    && data.companyId === company && uuid(data.proposalId) && uuid(data.threadId)
    && ['OPEN', 'SUPERSEDED', 'BOOKED', 'REJECTED'].includes(data.state)
    && ['QUEUED', 'SENDING', 'SENT', 'UNCERTAIN'].includes(data.deliveryState)
    && data.reservationMade === (data.state === 'BOOKED') && data.customerConfirmationRequired === (data.state !== 'BOOKED')
    && object(data.business) && data.business.companyId === company;
}
function createSurveyProposals({ db, isPrimary, env = process.env }) {
  const enabled = () => env.VPT_SURVEY_PROPOSALS === '1' && isPrimary() === true;
  async function handle(req, res, operation) {
    res.set('Cache-Control', 'no-store');
    if (!enabled()) return res.status(503).json({ error: 'Đề xuất khảo sát chưa được mở.' });
    const actor = req.user?.userId || req.user?.id;
    const b = operation === 'propose' ? req.body : req.query;
    const company = b?.companyId;
    if (!uuid(actor) || !uuid(company) || (req.user?.id && req.user?.userId && req.user.id !== req.user.userId)) return res.status(403).json({ error: 'Không xác định được phạm vi đề xuất.' });
    if ((operation === 'propose' && (!only(b, ['companyId', 'requestId', 'command']) || !uuid(b.requestId) || !validCommand(b.command)))
      || (operation === 'read' && (!only(b, ['companyId', 'proposalId']) || !uuid(b.proposalId)))
      || !['propose', 'read'].includes(operation)) return res.status(400).json({ error: 'Đề xuất khảo sát không hợp lệ.' });
    try {
      if (!enabled()) throw fail('PRIMARY_ONLY_REQUIRED');
      const r = await db.rpc(operation === 'propose' ? 'crm_survey_propose' : 'crm_survey_proposal_read', {
        p_actor: actor, p_company: company,
        ...(operation === 'propose' ? { p_request: b.requestId, p_command: b.command } : { p_id: b.proposalId }),
      });
      if (r?.error) throw fail(r.error.code);
      if (!enabled() || !validView(r?.data, company)
        || (operation === 'propose' && (r.data.requestId !== b.requestId || r.data.threadId !== b.command.threadId || typeof r.data.replayed !== 'boolean'))
        || (operation === 'read' && r.data.proposalId !== b.proposalId)) throw fail('INVALID_SURVEY_RESULT');
      return res.json(r.data);
    } catch (e) {
      const status = e.code === '42501' ? 403 : ['23505', '40001'].includes(e.code) ? 409 : ['22023', '22P02', '22007', '22008'].includes(e.code) ? 400 : 503;
      return res.status(status).json({ ...(e.code==='40001'?{reason:'STALE_OPTION'}:['22023','22P02','22007','22008'].includes(e.code)?{reason:'INVALID_INPUT'}:{}), error: status === 409 ? 'Thông tin khảo sát đã thay đổi. Tải lại để chọn giờ và đề xuất mới.' : 'Chưa thực hiện được đề xuất trong phạm vi hiện tại.' });
    }
  }
  // Customer confirmation and dispatch are intentionally not operator commands.
  return { handle };
}
module.exports = { createSurveyProposals, validCommand, validView };
