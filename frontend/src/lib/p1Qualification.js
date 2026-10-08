export const stateLabel = status => ({ PENDING: 'Chờ', QUALIFIED: 'Hợp lệ', REJECTED: 'Loại' }[status] || 'Chờ');
export const errorLabel = code => ({
  REVISION_CONFLICT: 'Dữ liệu đã đổi, đã tải lại', REQUEST_CONFLICT: 'Yêu cầu này đã dùng cho nội dung khác. Hãy chỉnh nội dung rồi thử lại.',
  SOURCE_UNAVAILABLE: 'Chưa tải được nguồn dữ liệu. Vui lòng thử lại.', WRITE_UNAVAILABLE: 'Chưa lưu được. Vui lòng thử lại.',
  TRIAL_DATES_MISSING: 'Đợt thử chưa có đủ ngày bắt đầu và kết thúc.',
}[code] || 'Không xử lý được yêu cầu. Vui lòng thử lại.');
export const formatVnd = amount => Number.isSafeInteger(amount) && amount >= 0
  ? `${new Intl.NumberFormat('vi-VN').format(amount)} đ` : 'Chưa biết';
export const summaryReasonLabel = code => ({
  NO_FACEBOOK_SCOPE: 'Đợt thử chưa có tài khoản Facebook', ACCOUNT_UNAVAILABLE: 'Tài khoản quảng cáo chưa sẵn sàng',
  INVALID_INPUT: 'Khoảng ngày hoặc tài khoản chưa hợp lệ', INVALID_ROW_SCOPE: 'Có dòng chi tiêu ngoài phạm vi',
  DUPLICATE_AD_DAY: 'Có dòng chi tiêu trùng ngày', ROW_CURRENCY: 'Đơn vị tiền trên dòng chi tiêu chưa đúng',
  INVALID_AMOUNT: 'Số tiền chi tiêu chưa hợp lệ', SYNC_CURRENCY: 'Đơn vị tiền đồng bộ chưa đúng',
  SYNC_FAILED: 'Lần đồng bộ chi tiêu bị lỗi', INCOMPLETE_SYNC: 'Dữ liệu đồng bộ chưa đầy đủ',
  SYNC_WINDOW_UNPROVEN: 'Chưa phủ đủ ngày của đợt thử', STALE_SYNC: 'Dữ liệu chi tiêu chưa được cập nhật',
  AMOUNT_OVERFLOW: 'Tổng chi tiêu vượt giới hạn tính toán',
  DUPLICATE_ACCOUNT_SCOPE: 'Tài khoản quảng cáo xuất hiện nhiều lần trong phạm vi đợt thử',
  IDENTITY_NOT_RECONCILED: 'Chưa gộp khách trùng',
  AD_ACCOUNT_SCOPE_UNVERIFIED: 'Chưa lọc khách theo tài khoản quảng cáo',
  SPEND_AD_LEVEL_ONLY: 'Chi tiêu mới đối chiếu ở cấp quảng cáo',
  FIRST_PAID_SOURCE_UNVERIFIED: 'Chưa xác minh nguồn trả phí đầu tiên',
}[code] || 'Nguồn dữ liệu chưa đủ để đối chiếu');
export function summaryCostLabel(cost) {
  if (cost?.status === 'PROVISIONAL' && Number.isSafeInteger(cost.vnd_ceil))
    return `Chi phí mỗi khách hợp lệ (TẠM TÍNH): ${formatVnd(cost.vnd_ceil)} — mục tiêu ≤ ${formatVnd(cost.target_vnd)}`;
  if (cost?.status === 'NO_QUALIFIED_LEADS') return 'Chưa có khách hợp lệ';
  return 'Chưa biết';
}
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
