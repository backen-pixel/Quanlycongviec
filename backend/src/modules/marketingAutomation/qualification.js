'use strict';

// Until P1-3, canonicalLeadId is crm_leads.id. P1-3 must handle duplicate counting
// through its identity map; this module neither merges nor infers duplicate people.
// Callers authenticate the actor and check CRM company/role before using this adapter.
function failure(code) { const error = new Error(code); error.code = code; return error; }
function required(value, code) {
  if (typeof value !== 'string' || !value.trim()) throw failure(code);
}
function canMarkQualified({ role, userCompanyId } = {}, leadCompanyId, allowedRoles = ['admin']) {
  return typeof role === 'string' && role.length > 0 && Array.isArray(allowedRoles)
    && allowedRoles.includes(role) && typeof leadCompanyId === 'string'
    && leadCompanyId.trim().length > 0
    && ((userCompanyId == null || userCompanyId === '')
      || (typeof userCompanyId === 'string' && userCompanyId === leadCompanyId));
}
function unwrap({ data, error }) {
  if (error) {
    const code = ['REQUEST_CONFLICT','COMPANY_MISMATCH','REVISION_CONFLICT',
      'REASON_REQUIRED','EVIDENCE_REQUIRED','INVALID_COMMAND']
      .find(item => error.message?.includes(item));
    throw failure(code || error.code || 'QUALIFICATION_ERROR');
  }
  return data;
}
async function command(db, kind, { companyId, actorId, requestId, canonicalLeadId,
  expectedRevision, payload = {} } = {}) {
  required(companyId, 'INVALID_COMPANY'); required(actorId, 'INVALID_ACTOR');
  required(requestId, 'INVALID_REQUEST'); required(canonicalLeadId, 'INVALID_LEAD');
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0 ||
    !payload || typeof payload !== 'object' || Array.isArray(payload))
    throw failure('INVALID_COMMAND');
  const args = { _command: kind, _company_id: companyId, _actor_id: actorId,
    _request_id: requestId, _canonical_lead_id: canonicalLeadId,
    _expected_revision: expectedRevision, _payload: payload };
  try { return unwrap(await db.rpc('p1_qualification_command_v1', args)); }
  catch (error) {
    // Retry once if a concurrent replay wins the unique request key.
    if (error.code !== '23505') throw error;
    return unwrap(await db.rpc('p1_qualification_command_v1', args));
  }
}
const setQualification = (db, input) => command(db, 'set', input);
const revokeQualification = (db, input) => command(db, 'revoke', input);
async function getQualification(db, { companyId, canonicalLeadId } = {}) {
  required(companyId, 'INVALID_COMPANY'); required(canonicalLeadId, 'INVALID_LEAD');
  return unwrap(await db.rpc('p1_qualification_state_v1',
    { _company_id: companyId, _canonical_lead_id: canonicalLeadId }));
}
module.exports = { canMarkQualified, setQualification, revokeQualification, getQualification };
