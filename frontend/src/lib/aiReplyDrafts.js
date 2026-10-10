// Client for the pilot AI-draft API. It only reads/records drafts: sending stays with the staff
// member through the existing Facebook reply flow.
const API = import.meta.env.VITE_API_URL || '';
const BASE = `${API}/api/ai-reply-drafts`;
const headers = () => ({
  Authorization: `Bearer ${localStorage.getItem('token')}`,
  'Content-Type': 'application/json',
});
const newRequestId = () => (globalThis.crypto?.randomUUID?.()
  ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export const draftStatusLabel = status => ({
  DISABLED: 'Tính năng soạn nháp đang tắt.',
  COMPANY_NOT_ENABLED: 'Công ty này chưa nằm trong phạm vi thử nghiệm.',
  NO_INBOUND: 'Khách chưa nhắn tin nên chưa có gì để soạn nháp.',
  ALREADY_REPLIED: 'Nhân viên đã trả lời tin mới nhất.',
  UNSAFE_CONTEXT: 'Hội thoại có thông tin cá nhân chưa ẩn được nên không soạn nháp.',
  BUDGET_DENIED: 'Đã chạm hạn mức soạn nháp hôm nay.',
  DISCARDED: 'Bản nháp không đạt quy tắc nên đã bị loại. Hãy tự soạn.',
  PROVIDER_AUTH: 'Chưa cấu hình dịch vụ soạn nháp.',
  PROVIDER_RATE_LIMIT: 'Dịch vụ soạn nháp đang quá tải, thử lại sau.',
  PROVIDER_TIMEOUT: 'Dịch vụ soạn nháp phản hồi chậm, thử lại sau.',
}[status] || 'Chưa soạn được bản nháp. Hãy tự soạn.');

async function call(path, options) {
  try {
    const response = await fetch(`${BASE}${path}`, { headers: headers(), ...options });
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  } catch {
    return { ok: false, status: 0, body: {} };
  }
}

export async function isDraftEnabled() {
  return (await call('/config')).ok;
}

export async function generateDraft(leadId) {
  const result = await call(`/leads/${encodeURIComponent(leadId)}/generate`, {
    method: 'POST', body: JSON.stringify({ request_id: newRequestId() }) });
  if (!result.ok) return { status: 'ERROR' };
  return result.body;
}

export async function recordDraft(action, draftId, { leadId, revision, text }) {
  const result = await call(`/drafts/${encodeURIComponent(draftId)}/${action}`, {
    method: 'POST', body: JSON.stringify({ request_id: newRequestId(), lead_id: leadId,
      expected_revision: revision, ...(action === 'rejected' ? {} : { draft_text: text }) }) });
  return result.ok ? result.body : null;
}

// After staff send through the normal reply flow: record an edit (if the text changed) then the send.
export async function recordSentDraft(draft, sentText) {
  let revision = draft.revision;
  if (sentText !== draft.text) {
    const edited = await recordDraft('edited', draft.draftId, { ...draft, revision, text: sentText });
    if (!edited) return false;
    revision = edited.revision;
  }
  return Boolean(await recordDraft('sent', draft.draftId, { ...draft, revision, text: sentText }));
}

export async function getDraftReport(days = 7) {
  const result = await call(`/report?days=${days === 30 ? 30 : 7}`);
  return result.ok ? result.body : null;
}

export const discardReasonLabel = code => ({
  WRONG_PRONOUN: 'Sai xưng hô', TOO_LONG: 'Quá dài', PRICE_MENTION: 'Nhắc giá', PII_LEAK: 'Lộ thông tin cá nhân',
  LINK: 'Có đường link', RISKY_PROMISE: 'Hứa hẹn', IDENTITY_CLAIM: 'Nhận là người thật', PROMPT_LEAK: 'Lộ lời dặn',
  NOT_VIETNAMESE: 'Không phải tiếng Việt', UNFILLED_PLACEHOLDER: 'Còn nhãn chưa thay', EMPTY: 'Rỗng',
}[code] || code);
