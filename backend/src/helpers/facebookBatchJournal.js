'use strict';
const { randomUUID } = require('node:crypto');
const uuid = x => typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const failure = (code = 'BATCH_JOURNAL_UNAVAILABLE', status = 503) => Object.assign(new Error(code), { code, status });
function linkReviewValid(x) {
  return x?.policy === 'FACEBOOK_BATCH_LINK_RECONCILIATION_V1' && uuid(x.commandId)
    && Number.isFinite(Date.parse(x.recordedAt)) && x.linkVerified === true && x.claimRetained === true
    && x.businessReconciled === false && x.processesDrained === false;
}
function validateRun(run, actor, company, request) {
  if (!run || run.policy !== 'FACEBOOK_BATCH_JOURNAL_V1' || run.actorId !== actor || run.companyId !== company || run.requestId !== request
    || !['RUNNING', 'COMPLETED', 'REVIEW'].includes(run.state) || !Array.isArray(run.items) || !run.items.length || run.items.length > 500
    || new Set(run.items.map(x => x.contactId)).size !== run.items.length
    || run.items.some(x => !uuid(x.contactId) || !['PENDING', 'RUNNING', 'LINKED', 'SKIPPED', 'UNKNOWN', 'CANCELLED', 'RECONCILED_LINKED'].includes(x.state)
      || (['LINKED','RECONCILED_LINKED'].includes(x.state) && (x.result?.status !== 'linked' || x.result?.contact_id !== x.contactId || !uuid(x.result?.lead_id)))
      || (x.state === 'RECONCILED_LINKED' && (run.state !== 'REVIEW' || !linkReviewValid(x.reconciliation)))
      || (x.state === 'SKIPPED' && (x.result?.status !== 'skipped' || x.result?.contact_id !== x.contactId
        || !['MANUAL_TRIGGER','SYNC_PAUSED','PHONE_REQUIRED','MESSAGE_THRESHOLD'].includes(x.result?.reason))))
    || (run.state === 'COMPLETED' && run.items.some(x => !['LINKED','SKIPPED'].includes(x.state)))
    || !Number.isFinite(Date.parse(run.createdAt)) || !Number.isFinite(Date.parse(run.updatedAt))) throw failure();
  return { policy: run.policy, actorId: actor, companyId: company, requestId: request, state: run.state,
    createdAt: run.createdAt, updatedAt: run.updatedAt,
    items: run.items.map(x => ({ contactId: x.contactId, state: x.state,
      ...(x.state === 'RECONCILED_LINKED' ? { reconciliation: { policy: x.reconciliation.policy, commandId: x.reconciliation.commandId,
        recordedAt: x.reconciliation.recordedAt, linkVerified: true, claimRetained: true, businessReconciled: false, processesDrained: false } } : {}),
      result: ['LINKED','RECONCILED_LINKED'].includes(x.state)
      ? { contact_id: x.contactId, status: 'linked', lead_id: x.result.lead_id }
      : x.state === 'SKIPPED' ? { contact_id: x.contactId, status: 'skipped', reason: x.result.reason } : null })) };
}
function journalSettled(run) {
  return !!run && ['COMPLETED','REVIEW'].includes(run.state) && run.items.length > 0
    && run.items.every(x => ['LINKED','SKIPPED','CANCELLED'].includes(x.state));
}
function journalResponse(run) {
  const count = state => run.items.filter(x => x.state === state).length;
  const settled = journalSettled(run);
  return { status: settled ? 200 : 202, body: { company_id: run.companyId, total: run.items.length,
    processed: count('LINKED'), reconciled_links: count('RECONCILED_LINKED'), skipped: count('SKIPPED'), failed: count('UNKNOWN'), unprocessed: count('PENDING') + count('RUNNING') + count('CANCELLED'),
    results: run.items.filter(x => x.result).map(x => x.result), journal: run, reconciliation_required: !settled,
    ...(!settled ? { error: 'Lượt xử lý đã được lưu. Đọc lại tiến độ; hồ sơ chưa rõ kết quả cần đối soát trước khi tiếp tục.' } : {}) } };
}
function createFacebookBatchJournal({ db, isPrimary }) {
  async function rpc(name, args) {
    if (isPrimary() !== true) throw failure('PRIMARY_REQUIRED');
    let response; try { response = await db.rpc(name, args); } catch { throw failure(); }
    if (isPrimary() !== true) throw failure();
    if (response?.error) {
      const map = { '42501': ['BATCH_JOURNAL_FORBIDDEN', 403], '22023': ['BATCH_JOURNAL_INVALID', 400],
        '40001': ['BATCH_JOURNAL_CONFLICT', 409], '23505': ['BATCH_JOURNAL_CLAIMED', 409], '55P03': ['BATCH_JOURNAL_BUSY', 409], '40P01': ['BATCH_JOURNAL_BUSY', 409] };
      throw failure(...(map[response.error.code] || []));
    }
    return response?.data;
  }
  function context(req, company, request) {
    const actor = req?.user?.userId || req?.user?.id;
    if (req?.user?.userId && req?.user?.id && (!uuid(req.user.id) || !uuid(req.user.userId) || req.user.id.toLowerCase() !== req.user.userId.toLowerCase())) throw failure('BATCH_JOURNAL_FORBIDDEN', 403);
    if (![actor, company, request].every(uuid)) throw failure('BATCH_JOURNAL_INVALID', 400);
    return { actor: actor.toLowerCase(), company: company.toLowerCase(), request: request.toLowerCase() };
  }
  async function read(req, company, request) {
    const c = context(req, company, request);
    return validateRun(await rpc('crm_facebook_batch_read', { p_actor: c.actor, p_company: c.company, p_request: c.request }), c.actor, c.company, c.request);
  }
  return { read, async stop(req, request) {
    const b = req.body;
    if (!b || Array.isArray(b) || Object.keys(b).some(k => !['company_id','contact_ids'].includes(k))
      || !Array.isArray(b.contact_ids) || !b.contact_ids.length || b.contact_ids.length > 500 || !b.contact_ids.every(uuid)) throw failure('BATCH_JOURNAL_INVALID',400);
    const c = context(req,b.company_id,request), ids = b.contact_ids.map(x => x.toLowerCase());
    if (new Set(ids).size !== ids.length) throw failure('BATCH_JOURNAL_INVALID',400);
    const run = validateRun(await rpc('crm_facebook_batch_stop',{p_actor:c.actor,p_company:c.company,p_request:c.request,p_ids:ids}),c.actor,c.company,c.request);
    if (JSON.stringify(run.items.map(x => x.contactId)) !== JSON.stringify(ids) || run.state === 'RUNNING'
      || run.items.some(x => ['PENDING','RUNNING'].includes(x.state))) throw failure();
    return run;
  }, async list(req, company, before = null) {
    const c = context(req, company, before || randomUUID());
    const x = await rpc('crm_facebook_batch_list', { p_actor: c.actor, p_company: c.company, p_before: before });
    if (!x || !Array.isArray(x.runs) || x.runs.length > 20 || (x.nextCursor !== null && !uuid(x.nextCursor))
      || x.runs.some(r => !uuid(r.requestId) || !['RUNNING', 'REVIEW', 'COMPLETED'].includes(r.state) || !Number.isFinite(Date.parse(r.createdAt)))) throw failure();
    return { runs: x.runs.map(({ requestId, state, createdAt }) => ({ requestId, state, createdAt })), nextCursor: x.nextCursor };
  }, async begin(req, company, ids) {
    const c = context(req, company, req.body?.requestId), token = randomUUID();
    const r = await rpc('crm_facebook_batch_begin', { p_actor: c.actor, p_company: c.company, p_request: c.request, p_ids: ids, p_token: token });
    const run = validateRun(r?.run, c.actor, c.company, c.request);
    if (typeof r?.execute !== 'boolean' || JSON.stringify(run.items.map(x => x.contactId)) !== JSON.stringify(ids)) throw failure();
    const step = async (action, id = null, result = null) => {
      if (await rpc('crm_facebook_batch_step', { p_request: c.request, p_token: token, p_contact: id, p_action: action, p_result: result }) !== true) throw failure();
    };
    return { execute: r.execute, run, start: id => step('START', id), check: id => step('CHECK', id),
      result: (id, value) => step('RESULT', id, value), stop: () => step('STOP'), finish: () => step('FINISH'),
      read: () => read(req, c.company, c.request) };
  } };
}
module.exports = { createFacebookBatchJournal, journalResponse, validateRun, journalSettled };
