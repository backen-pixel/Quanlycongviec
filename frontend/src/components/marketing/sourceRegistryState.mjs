export const uuid = x => typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const hash = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
export const kinds = { META_LEAD_ADS: 'Biểu mẫu Facebook', MESSENGER: 'Messenger', WEBSITE: 'Website', PHONE: 'Điện thoại', OTHER: 'Điểm nhận khác', NO_LEAD_SOURCE: 'Không có điểm nhận khách — cần lý do', UNRESOLVED_FORM: 'Biểu mẫu cũ chưa xác định tài khoản' };
export function registryResult(x, actor, company, trial) {
  if (!x || x.actorId !== actor || x.companyId !== company || x.trialId !== trial || x.version !== 1 || !hash(x.inventoryVersion) || !Number.isFinite(Date.parse(x.asOf)) ||
    !['MISSING', 'CURRENT', 'STALE_AUTHORITY', 'STALE_CONFIGURATION'].includes(x.status) || x.providerCoverage !== 'UNVERIFIED' || x.allowBudgetExecution !== false ||
    x.inventory?.trial?.id !== trial || x.inventory?.trial?.company_id !== company || !Array.isArray(x.inventory?.accounts) || !Array.isArray(x.inventory?.knownForms) || !Array.isArray(x.gaps) ||
    ((x.status === 'MISSING') !== (x.declaration === null)) || (x.declaration && (!Number.isSafeInteger(x.declaration.revision) || x.declaration.revision < 1 || !Array.isArray(x.declaration.entries) || !hash(x.declaration.declarationDigest)))) throw Error('Danh mục trả về không khớp phạm vi. Cần tải lại.');
  return x;
}
export function receiptResult(x, request, actor, company, trial) {
  if (!x || x.actorId !== actor || x.companyId !== company || x.trialId !== trial || x.requestId !== request.requestId || x.revision !== request.command.expectedRevision + 1 ||
    !hash(x.declarationDigest) || !Number.isFinite(Date.parse(x.recordedAt)) || typeof x.replayed !== 'boolean' || x.purpose !== 'DECLARED_BUSINESS_SCOPE' || x.allowBudgetExecution !== false) throw Error('Chưa xác nhận được kết quả lưu danh mục.');
  return x;
}
export function initialEntries(x) {
  if (x.declaration) return x.declaration.entries.map(e => ({ ...e }));
  const accounts = x.inventory.accounts.map(a => a.id);
  const entries = x.inventory.knownForms.map(f => ({ accountId: accounts.includes(f.accountId) ? f.accountId : null,
    kind: accounts.includes(f.accountId) ? 'META_LEAD_ADS' : 'UNRESOLVED_FORM', pageId: f.pageId, formId: f.formId, destination: accounts.includes(f.accountId) ? null : '' }));
  // An account without observed Leads requires an explicit destination choice.
  for (const accountId of accounts) if (!entries.some(e => e.accountId === accountId)) entries.push({ accountId, kind: '', pageId: null, formId: null, destination: '' });
  return entries;
}
function pendingValid(x) {
  return !!x && uuid(x.requestId) && x.command && Number.isSafeInteger(x.command.expectedRevision) && x.command.expectedRevision >= 0 && hash(x.command.expectedInventoryVersion) &&
    typeof x.command.sourceReference === 'string' && typeof x.command.sourceNote === 'string' && typeof x.command.sourceDate === 'string' && Array.isArray(x.command.entries) && x.command.entries.length <= 300;
}
const key = (a, c, t) => `vpt-source-registry:v1:${a}:${c}:${t}`;
export function pendingRead(storage, actor, company, trial) {
  const raw = storage.getItem(key(actor, company, trial)); if (!raw) return null;
  const x = JSON.parse(raw); if (!pendingValid(x)) throw Error('Yêu cầu đang chờ bị hỏng.'); return x;
}
export function pendingSave(storage, actor, company, trial, x) {
  if (!pendingValid(x)) throw Error('Yêu cầu chưa hợp lệ.');
  const encoded = JSON.stringify(x); storage.setItem(key(actor, company, trial), encoded);
  if (storage.getItem(key(actor, company, trial)) !== encoded) throw Error('Không lưu được yêu cầu.');
}
export function pendingClear(storage, actor, company, trial) { storage.removeItem(key(actor, company, trial)); }
