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
  LEADS_FROM_UNCONNECTED_ADS: 'Có khách đến từ quảng cáo chưa thuộc tài khoản đã nối',
  UNCONNECTED_ADS_EXCLUDED: 'Đã loại khách đến từ quảng cáo của tài khoản khác (thuê ngoài)',
  SPEND_AD_LEVEL_ONLY: 'Chi tiêu mới đối chiếu ở cấp quảng cáo',
  SPEND_ACCOUNT_TOTAL_MISMATCH: 'Tổng chi tiêu từng quảng cáo lệch tổng của tài khoản (có thể thiếu quảng cáo)',
  FIRST_PAID_SOURCE_UNVERIFIED: 'Chưa xác minh nguồn trả phí đầu tiên',
  MILESTONE_IS_STAGE_PROXY: 'Mốc theo bước bán hàng chỉ là chỉ số thay thế',
  NO_MATURE_WINDOW: 'Chưa đủ cửa sổ chi tiêu cho nhóm qua 4 ngày',
}[code] || 'Nguồn dữ liệu chưa đủ để đối chiếu');
export const milestoneCostLabel = cost => cost?.status === 'PROVISIONAL'
  ? formatVnd(cost.vnd_ceil)
  : cost?.status === 'NO_QUALIFIED_LEADS' ? 'Chưa có khách đạt mốc' : 'Chưa biết';
export const scopeStatusLabel = status => ({
  VERIFIED: 'Đã đối chiếu toàn bộ quảng cáo', PARTIAL: 'Một phần quảng cáo ngoài phạm vi',
  NONE_IN_SCOPE: 'Chưa có quảng cáo nào trong phạm vi',
  UNKNOWN: 'Chưa xác định được phạm vi quảng cáo',
}[status] || 'Chưa xác định được phạm vi quảng cáo');
export function scopeWarning(scope) {
  if (scope?.status === 'VERIFIED') return null;
  return `${scope?.not_in_connected_accounts ?? 0}/${scope?.candidates ?? 0} khách đến từ quảng cáo chưa thuộc tài khoản quảng cáo đã nối — chi tiêu của các quảng cáo này chưa được tính, nên chi phí mỗi khách hiện CHƯA ĐỦ TIN CẬY. Cần nối thêm tài khoản quảng cáo sở hữu các quảng cáo này.`;
}
export const connectedOnly = summary => summary?.measurement_scope === 'CONNECTED_AD_ACCOUNTS_ONLY';
export const excludedNote = summary => `Chỉ đo quảng cáo của tài khoản đã nối (VPT 01). ${summary?.excluded_unconnected_ads ?? 0}/${summary?.scope_check?.candidates ?? 0} khách đến từ quảng cáo tài khoản khác (thuê ngoài) được loại khỏi phép tính, theo quyết định ngày 10/10/2026.`;
export const scopeAdLabel = ad => `${ad.title || 'Chưa có tiêu đề'} · ${ad.ad_id} · ${ad.leads} khách`;
export const milestoneReliabilityLabel = reliability => reliability === 'LOW_UNCONNECTED_ADS'
  ? 'chưa đủ tin cậy' : 'Tạm tính';
export function milestoneTargetMultiple(cost, targetVnd) {
  if (cost?.status !== 'PROVISIONAL' || !Number.isSafeInteger(cost.numerator_vnd) ||
      cost.numerator_vnd < 0 || !Number.isSafeInteger(cost.denominator) ||
      cost.denominator < 1 || !Number.isSafeInteger(targetVnd) || targetVnd < 1) return null;
  const base = BigInt(targetVnd) * BigInt(cost.denominator);
  const tenths = (BigInt(cost.numerator_vnd) * 10n + base / 2n) / base;
  return `${tenths / 10n},${tenths % 10n}`;
}
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
