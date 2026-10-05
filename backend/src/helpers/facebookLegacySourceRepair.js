'use strict';
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const fail = (code, status) => Object.assign(new Error(code), { code, status });
const reasons = new Set(['EXISTING_SOURCE', 'CUSTOMER_OR_LEAD_REVIEW', 'NO_ORIGINAL_EVIDENCE', 'AMBIGUOUS_EVIDENCE',
  'ORIGINAL_EVIDENCE_REVIEW', 'PAGE_SCOPE_REVIEW', 'SOURCE_SCOPE_REVIEW', 'MULTIPLE_PAGE_REVIEW', 'ORIGINAL_INTAKE_SOURCE']);

async function repairFacebookSources(db, req, { isPrimary }) {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some(k => !['company_id', 'lead_ids', 'mode', 'requestId', 'contextVersion'].includes(k))
    || !uuid(req.user?.userId) || !uuid(body.company_id) || !['preview', 'apply'].includes(body.mode)
    || !Array.isArray(body.lead_ids) || body.lead_ids.length < 1 || body.lead_ids.length > 500 || body.lead_ids.some(x => !uuid(x))
    || (body.mode === 'preview' && ('requestId' in body || 'contextVersion' in body))
    || (body.mode === 'apply' && (!uuid(body.requestId) || !/^[a-f0-9]{32}$/.test(body.contextVersion || '')))) {
    throw fail('INVALID_SOURCE_REPAIR', 400);
  }
  const leadIds = [...new Set(body.lead_ids.map(x => x.toLowerCase()))].sort();
  const companyId = body.company_id.toLowerCase();
  if (isPrimary() !== true) throw fail('PRIMARY_REQUIRED', 503);
  let response;
  try {
    response = await db.rpc('crm_facebook_source_repair', {
      p_actor: req.user.userId.toLowerCase(), p_company: companyId, p_lead_ids: leadIds, p_mode: body.mode,
      p_request_id: body.mode === 'apply' ? body.requestId.toLowerCase() : null,
      p_context_version: body.mode === 'apply' ? body.contextVersion : null,
    });
  } catch { throw fail('SOURCE_REPAIR_UNAVAILABLE', 503); }
  if (isPrimary() !== true) throw fail('SOURCE_REPAIR_UNAVAILABLE', 503);
  if (response?.error) {
    const mapping = { '42501': ['SOURCE_REPAIR_FORBIDDEN', 403], '22023': ['INVALID_SOURCE_REPAIR', 400],
      '40001': ['SOURCE_REPAIR_CONTEXT_CHANGED', 409], '23505': ['SOURCE_REPAIR_REQUEST_CONFLICT', 409],
      '55P03': ['SOURCE_REPAIR_BUSY', 409], '40P01': ['SOURCE_REPAIR_BUSY', 409] };
    throw fail(...(mapping[response.error.code] || ['SOURCE_REPAIR_UNAVAILABLE', 503]));
  }
  const x = response?.data;
  const statuses = body.mode === 'preview' ? ['READY', 'UNCHANGED', 'REVIEW'] : ['RESTORED', 'UNCHANGED', 'REVIEW'];
  if (!x || x.policy !== 'FACEBOOK_SOURCE_REPAIR_V1' || x.mode !== body.mode || x.companyId !== companyId
    || !/^[a-f0-9]{32}$/.test(x.contextVersion || '') || x.restoresCrmLabelOnly !== true || typeof x.replayed !== 'boolean'
    || !Array.isArray(x.items) || x.items.length !== leadIds.length
    || x.items.some((item, i) => !item || item.leadId !== leadIds[i] || !statuses.includes(item.status) || !reasons.has(item.reason)
      || (item.status === 'REVIEW' ? item.sourceId !== null : !uuid(item.sourceId)))
    || x.updated !== x.items.filter(item => item.status === 'RESTORED').length
    || (body.mode === 'preview' && x.replayed !== false)
    || (body.mode === 'apply' && (x.requestId !== body.requestId.toLowerCase() || x.contextVersion !== body.contextVersion))) {
    throw fail('SOURCE_REPAIR_UNAVAILABLE', 503);
  }
  // Return only the contract fields, never raw evidence/phones from a bad response.
  return { policy: x.policy, mode: x.mode, companyId, contextVersion: x.contextVersion,
    ...(body.mode === 'apply' ? { requestId: x.requestId } : {}),
    resultKind: body.mode === 'apply' ? 'RECORDED_OUTCOME' : 'CURRENT_PREVIEW',
    items: x.items.map(({ leadId, status, reason, sourceId }) => ({ leadId, status, reason, sourceId })),
    updated: x.updated, replayed: x.replayed, restoresCrmLabelOnly: true };
}
module.exports = { repairFacebookSources };
