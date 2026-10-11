'use strict';

const CODES = ['REQUEST_CONFLICT', 'COMPANY_MISMATCH', 'REVISION_CONFLICT', 'INVALID_COMMAND', 'DRAFT_CLOSED'];
const fail = code => Object.assign(new Error(code), { code });
const required = (value, code) => { if (typeof value !== 'string' || !value.trim()) throw fail(code); };
function unwrap({ data, error }) {
  if (error) throw fail(CODES.find(code => error.message?.includes(code)) || 'DRAFT_STORE_ERROR');
  return data;
}
async function command(db, kind, { companyId, actorId = null, requestId, leadId,
  draftId, expectedRevision, payload = {} } = {}) {
  required(companyId, 'INVALID_COMPANY'); required(requestId, 'INVALID_REQUEST');
  required(leadId, 'INVALID_LEAD'); required(draftId, 'INVALID_DRAFT');
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0 ||
    !payload || typeof payload !== 'object' || Array.isArray(payload) ||
    (['generated', 'discarded'].includes(kind) ? expectedRevision !== 0
      : expectedRevision < 1 || typeof actorId !== 'string' || !actorId.trim())) throw fail('INVALID_COMMAND');
  const args = { _command: kind, _company_id: companyId, _actor_id: actorId,
    _request_id: requestId, _lead_id: leadId, _draft_id: draftId,
    _expected_revision: expectedRevision, _payload: payload };
  let result = await db.rpc('ai_reply_draft_command_v1', args);
  if (result.error?.code === '23505') result = await db.rpc('ai_reply_draft_command_v1', args);
  return unwrap(result);
}
const recordGenerated = (db, input) => command(db, 'generated', input);
const recordDiscarded = (db, input) => command(db, 'discarded', input);
const recordEdited = (db, input) => command(db, 'edited', input);
const recordSentByHuman = (db, input) => command(db, 'sent_by_human', input);
const recordRejected = (db, input) => command(db, 'rejected', input);
async function getUsage(db, { companyId, leadId, day } = {}) {
  required(companyId, 'INVALID_COMPANY'); required(leadId, 'INVALID_LEAD');
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw fail('INVALID_DAY');
  const data = unwrap(await db.rpc('ai_reply_draft_usage_v1',
    { _company_id: companyId, _lead_id: leadId, _day: day }));
  return { drafts: data?.drafts, tokens: data?.tokens, vnd: Number(data?.vnd),
    draftsForLead: data?.drafts_for_lead };
}
async function getByRequest(db, { companyId, requestId } = {}) {
  required(companyId, 'INVALID_COMPANY'); required(requestId, 'INVALID_REQUEST');
  return unwrap(await db.from('ai_reply_draft_events')
    .select('lead_id,draft_id,kind,draft_text,policy_reasons,request_id')
    .eq('company_id', companyId).eq('request_id', requestId).maybeSingle());
}
module.exports = { recordGenerated, recordDiscarded, recordEdited, recordSentByHuman, recordRejected, getUsage, getByRequest };
