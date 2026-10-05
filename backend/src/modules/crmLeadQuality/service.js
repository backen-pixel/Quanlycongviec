'use strict';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = (code, status) => Object.assign(new Error(code), { code, status });

// This service is a CRM writer. Actor and company are server-authenticated
// context, never fields accepted from an AI or a browser payload.
function createLeadQualityService({ db, isPrimary }) {
  async function call(name, context, args = {}) {
    if (!isPrimary()) throw fail('PRIMARY_REQUIRED', 503);
    if (![context?.actorId, context?.companyId, context?.leadId].every(x => typeof x === 'string' && UUID.test(x))) throw fail('INVALID_CONTEXT', 400);
    const { data, error } = await db.rpc(name, { p_actor_id: context.actorId, p_company_id: context.companyId, p_lead_id: context.leadId, ...args });
    if (error) {
      const mapping = { '42501': ['FORBIDDEN', 403], 'P0002': ['NOT_FOUND', 404], '40001': ['STALE_CONTEXT', 409], '23505': ['IDEMPOTENCY_CONFLICT', 409], '22023': ['INVALID_QUALIFICATION', 400] };
      const [code, status] = mapping[error.code] || ['QUALITY_UNAVAILABLE', 503];
      throw fail(code, status);
    }
    if (!data || typeof data !== 'object' || !['PENDING', 'QUALIFIED', 'REJECTED'].includes(data.status) || !Number.isSafeInteger(data.revision) || !/^[a-f0-9]{32}$/.test(data.contextVersion || '')) throw fail('QUALITY_UNAVAILABLE', 503);
    return data;
  }
  return {
    read: context => call('crm_lead_quality_read', context),
    record(context, body) {
      if (!body || Array.isArray(body) || Object.keys(body).some(k => !['requestId', 'expectedRevision', 'contextVersion', 'status', 'contactVerified', 'demandMatches', 'serviceAreaVerified', 'evidence'].includes(k))) throw fail('INVALID_QUALIFICATION', 400);
      if (!UUID.test(body.requestId || '') || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0 || !/^[a-f0-9]{32}$/.test(body.contextVersion || '') || !['PENDING', 'QUALIFIED', 'REJECTED'].includes(body.status)) throw fail('INVALID_QUALIFICATION', 400);
      if (['contactVerified', 'demandMatches', 'serviceAreaVerified'].some(k => typeof body[k] !== 'boolean') || typeof body.evidence !== 'string' || body.evidence.trim().length < 20 || body.evidence.length > 2000) throw fail('INVALID_QUALIFICATION', 400);
      if (body.status === 'QUALIFIED' && [body.contactVerified, body.demandMatches, body.serviceAreaVerified].some(v => v !== true)) throw fail('INVALID_QUALIFICATION', 400);
      return call('crm_lead_quality_record', context, {
        p_request_id: body.requestId, p_expected_revision: body.expectedRevision, p_context_version: body.contextVersion,
        p_decision: { status: body.status, contactVerified: body.contactVerified, demandMatches: body.demandMatches, serviceAreaVerified: body.serviceAreaVerified, evidence: body.evidence.trim() },
      });
    },
  };
}
module.exports = { createLeadQualityService };
