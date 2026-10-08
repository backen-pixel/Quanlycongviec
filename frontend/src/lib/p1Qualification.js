export const stateLabel = status => ({ PENDING: 'Chờ', QUALIFIED: 'Hợp lệ', REJECTED: 'Loại' }[status] || 'Chờ');
export const errorLabel = code => ({
  REVISION_CONFLICT: 'Dữ liệu đã đổi, đã tải lại', REQUEST_CONFLICT: 'Yêu cầu này đã dùng cho nội dung khác. Hãy chỉnh nội dung rồi thử lại.',
  SOURCE_UNAVAILABLE: 'Chưa tải được nguồn dữ liệu. Vui lòng thử lại.', WRITE_UNAVAILABLE: 'Chưa lưu được. Vui lòng thử lại.',
  TRIAL_DATES_MISSING: 'Đợt thử chưa có đủ ngày bắt đầu và kết thúc.',
}[code] || 'Không xử lý được yêu cầu. Vui lòng thử lại.');
export function validateForm(kind, form) {
  if (kind === 'QUALIFIED' && (!form.contact_usable || !form.need_in_scope ||
    !form.area_in_service || !form.evidence_ref?.trim()))
    return 'Cần đủ ba xác nhận và mã tham chiếu.';
  if ((kind === 'REJECTED' || kind === 'revoke') && !form.reason?.trim()) return 'Cần nhập lý do.';
  return null;
}
export function commandBody(kind, form, revision, requestId) {
  const base = { request_id: requestId, expected_revision: revision };
  if (kind === 'revoke') return { ...base, reason: form.reason.trim() };
  if (kind === 'REJECTED') return { ...base, status: kind, contact_usable: false,
    need_in_scope: false, area_in_service: false, reason: form.reason.trim() };
  return { ...base, status: kind, contact_usable: true, need_in_scope: true,
    area_in_service: true, evidence_ref: form.evidence_ref.trim() };
}
export function createRequestIdentity(uuid = () => crypto.randomUUID()) {
  let id;
  return {
    current() { return id ||= uuid(); },
    reset() { id = undefined; },
  };
}
