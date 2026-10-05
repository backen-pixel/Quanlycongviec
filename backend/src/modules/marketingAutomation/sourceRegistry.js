'use strict';
const uuid = x => typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const hash = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const object = x => !!x && typeof x === 'object' && !Array.isArray(x);
const text = (x, min, max) => typeof x === 'string' && x.trim().length >= min && x.length <= max;
const date = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x + 'T00:00:00Z')) && new Date(x + 'T00:00:00Z').toISOString().slice(0, 10) === x;
const fail = (message = 'SOURCE_REGISTRY_UNAVAILABLE', status = 503) => { throw Object.assign(new Error(message), { status }); };
const kinds = ['META_LEAD_ADS', 'MESSENGER', 'WEBSITE', 'PHONE', 'OTHER', 'NO_LEAD_SOURCE', 'UNRESOLVED_FORM'];
function entry(x) {
  if (!object(x) || Object.keys(x).some(k => !['accountId', 'kind', 'pageId', 'formId', 'destination'].includes(k)) || !kinds.includes(x.kind)) return false;
  const numeric = x => typeof x === 'string' && /^[0-9]{1,32}$/.test(x);
  if (x.kind === 'UNRESOLVED_FORM') return x.accountId === null && numeric(x.pageId) && numeric(x.formId) && text(x.destination, 10, 500);
  if (typeof x.accountId !== 'string' || !/^act_[0-9]{1,32}$/.test(x.accountId)) return false;
  if (['META_LEAD_ADS', 'MESSENGER'].includes(x.kind)) return numeric(x.pageId) && x.destination === null && (x.kind === 'META_LEAD_ADS' ? numeric(x.formId) : x.formId === null);
  return x.pageId === null && x.formId === null && text(x.destination, 3, 500);
}
function commandValid(x) {
  return object(x) && !Object.keys(x).some(k => !['expectedRevision', 'expectedInventoryVersion', 'sourceReference', 'sourceDate', 'sourceNote', 'entries'].includes(k)) &&
    Number.isSafeInteger(x.expectedRevision) && x.expectedRevision >= 0 && x.expectedRevision <= 999999999 && hash(x.expectedInventoryVersion) &&
    text(x.sourceReference, 8, 500) && text(x.sourceNote, 20, 2000) && date(x.sourceDate) && Array.isArray(x.entries) && x.entries.length > 0 && x.entries.length <= 300 && x.entries.every(entry);
}
// Narrow the SQL projection explicitly; never forward private inventory material.
function projectRegistry(raw, company, trial) {
  if (raw === undefined) return null; // old SQL deployments have no registry yet
  if (!object(raw) || raw.version !== 1 || raw.companyId !== company || raw.trialId !== trial || !Number.isFinite(Date.parse(raw.asOf)) || !hash(raw.inventoryVersion) ||
    !['MISSING', 'CURRENT', 'STALE_AUTHORITY', 'STALE_CONFIGURATION'].includes(raw.status) || raw.providerCoverage !== 'UNVERIFIED' || raw.allowBudgetExecution !== false) fail();
  const i = raw.inventory, d = raw.declaration;
  if (!object(i) || i.trial?.id !== trial || i.trial?.company_id !== company || !Number.isSafeInteger(i.trial.revision) || i.trial.revision < 1 || !date(i.trial.since) || !date(i.trial.until) ||
    !Array.isArray(i.trial.account_ids) || !i.trial.account_ids.every(x => /^act_[0-9]{1,32}$/.test(x)) ||
    !Array.isArray(i.accounts) || i.accounts.length > 100 || !Array.isArray(i.pages) || i.pages.length > 100 || !Array.isArray(i.knownForms) || i.knownForms.length > 1000 || !Array.isArray(raw.gaps)) fail();
  if (i.accounts.some(a => !/^act_[0-9]{1,32}$/.test(a.id) || ![true, false, null].includes(a.active) || (a.expiresAt !== null && !Number.isFinite(Date.parse(a.expiresAt)))) ||
    i.pages.some(p => !/^[0-9]{1,32}$/.test(p.pageId) || ![true, false, null].includes(p.active)) ||
    i.knownForms.some(f => !/^[0-9]{1,32}$/.test(f.pageId) || !/^[0-9]{1,32}$/.test(f.formId) || (f.accountId !== null && !/^act_[0-9]{1,32}$/.test(f.accountId)) || typeof f.bindingActive !== 'boolean')) fail();
  const codes = ['TRIAL_ACCOUNT_ROSTER_CHANGED', 'ACCOUNT_UNAVAILABLE', 'FORM_ROUTING_UNVERIFIED', 'FORM_ACCOUNT_UNRESOLVED', 'ENTRYPOINT_COVERAGE_UNVERIFIED', 'PAGE_UNAVAILABLE', 'KNOWN_FORM_NOT_DECLARED'];
  if (raw.gaps.length > 2000 || raw.gaps.some(g => !object(g) || !codes.includes(g.code))) fail();
  if ((raw.status === 'MISSING') !== (d === null)) fail();
  if (d && (!Number.isSafeInteger(d.revision) || d.revision < 1 || !Number.isSafeInteger(d.trialRevision) || d.trialRevision < 1 || !Array.isArray(d.accountIds) || !d.accountIds.every(a => /^act_[0-9]{1,32}$/.test(a)) ||
    !Array.isArray(d.entries) || !d.entries.length || d.entries.length > 300 || !d.entries.every(entry) || !text(d.sourceReference, 8, 500) || !text(d.sourceNote, 20, 2000) || !date(d.sourceDate) ||
    !hash(d.declarationDigest) || !uuid(d.recordedBy) || !Number.isFinite(Date.parse(d.recordedAt)))) fail();
  return { version: 1, companyId: company, trialId: trial, asOf: raw.asOf, inventoryVersion: raw.inventoryVersion, status: raw.status,
    inventory: { trial: { id: trial, company_id: company, revision: i.trial.revision, since: i.trial.since, until: i.trial.until, account_ids: i.trial.account_ids },
      accounts: i.accounts.map(a => ({ id: a.id, active: a.active, expiresAt: a.expiresAt })), pages: i.pages.map(p => ({ pageId: p.pageId, active: p.active })),
      knownForms: i.knownForms.map(f => ({ pageId: f.pageId, formId: f.formId, accountId: f.accountId, bindingActive: f.bindingActive })) },
    declaration: d ? { revision: d.revision, trialRevision: d.trialRevision, accountIds: d.accountIds, entries: d.entries,
      sourceReference: d.sourceReference, sourceDate: d.sourceDate, sourceNote: d.sourceNote, declarationDigest: d.declarationDigest, recordedBy: d.recordedBy, recordedAt: d.recordedAt } : null,
    gaps: raw.gaps.map(g => Object.fromEntries(['code', 'accountId', 'pageId', 'formId', 'kind'].filter(k => g[k] !== undefined).map(k => [k, g[k]]))),
    providerCoverage: 'UNVERIFIED', allowBudgetExecution: false };
}
function createSourceRegistry({ db, isPrimary, env = process.env }) {
  return async (req, res, write = false) => {
    res.set('Cache-Control', 'no-store');
    if (env.VPT_MARKETING_SOURCE_REGISTRY !== '1' || env.VPT_MARKETING_TRIAL_REPORT !== '1' || isPrimary() !== true) return res.status(503).json({ error: 'Danh mục nguồn khách chưa được mở.' });
    const actor = req.user?.userId, company = req.query?.company_id, trial = req.params?.trialId;
    if (!uuid(actor) || !uuid(company) || !uuid(trial) || (req.user.id && req.user.id !== actor)) return res.status(403).json({ error: 'Không xác định được phạm vi truy cập.' });
    if (write && (!object(req.body) || Object.keys(req.body).some(k => !['requestId', 'command'].includes(k)) || !uuid(req.body.requestId) || !commandValid(req.body.command))) return res.status(400).json({ error: 'Cần điền đủ phạm vi, tài liệu tham chiếu và lý do xác nhận.' });
    try {
      const { data, error } = await db.rpc(write ? 'marketing_source_registry_set' : 'marketing_source_registry_read', { p_actor: actor, p_company: company, p_trial: trial,
        ...(write ? { p_request: req.body.requestId, p_command: req.body.command } : {}) });
      if (error) fail(error.code === '40001' ? 'SOURCE_CHANGED' : 'SOURCE_REGISTRY_UNAVAILABLE', ({ '42501': 403, '40001': 409, '23505': 409, '22023': 400, '22007': 400, '22008': 400, '22P02': 400 })[error.code] || 503);
      if (!write) { if (data?.actorId !== actor) fail(); return res.json({ ...projectRegistry(data, company, trial), actorId: actor }); }
      if (data?.companyId !== company || data?.trialId !== trial || data?.requestId !== req.body.requestId || !Number.isSafeInteger(data.revision) || data.revision !== req.body.command.expectedRevision + 1 ||
        !hash(data.declarationDigest) || !Number.isFinite(Date.parse(data.recordedAt)) || typeof data.replayed !== 'boolean' || data.purpose !== 'DECLARED_BUSINESS_SCOPE' || data.allowBudgetExecution !== false) fail();
      return res.json({ companyId: company, trialId: trial, actorId: actor, requestId: data.requestId, revision: data.revision, recordedAt: data.recordedAt,
        declarationDigest: data.declarationDigest, replayed: data.replayed, purpose: data.purpose, allowBudgetExecution: false });
    } catch (e) {
      return res.status(e.status || 503).json({ code: e.message === 'SOURCE_CHANGED' ? 'SOURCE_CHANGED' : 'UNAVAILABLE', error: e.status === 409 ? 'Danh mục hoặc cấu hình đã đổi. Tải lại để đối chiếu trước khi xác nhận mới.' : e.status === 403 ? 'Không còn quyền trong phạm vi này.' :
        e.status === 400 ? 'Danh mục chưa đủ hoặc có nguồn mâu thuẫn; cần kiểm tra lại.' : 'Chưa xác nhận được kết quả. Nếu đã gửi, hãy kiểm tra lại cùng yêu cầu.' });
    }
  };
}
module.exports = { createSourceRegistry, projectRegistry, commandValid };
