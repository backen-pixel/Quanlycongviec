// Đổi message thô của hàng rào chặn ghi cutover DB sang tiếng Việt.
//
// Backend đã đổi sẵn (helpers/dbWriteFence.js). File này là lớp chắn thứ hai cho
// trường hợp backend chưa deploy bản mới, hoặc lỗi đi theo đường khác — vì hầu
// hết màn hình đều alert(e.response.data.error) thẳng ra cho người dùng.

const FENCE_CODE_RE = /CUTOVER(?:_V2)?_[A-Z0-9_]{3,}/;

const RETRIABLE_CODES = new Set([
  'CUTOVER_WRITE_FENCED',
  'CUTOVER_V2_WRITE_FENCED',
  'CUTOVER_LOCK_UNAVAILABLE',
  'CUTOVER_V2_LOCK_UNAVAILABLE',
  'CUTOVER_TIMEOUT',
  'CUTOVER_V2_TIMEOUT',
]);

export const MSG_RETRIABLE = 'Hệ thống đang tạm khóa ghi để sao lưu/đồng bộ dữ liệu. '
  + 'Dữ liệu cũ vẫn xem được bình thường. Vui lòng gửi lại sau vài phút — '
  + 'thao tác vừa rồi chưa được lưu.';

export const MSG_HELD = 'Cơ sở dữ liệu đang ở trạng thái bảo trì đặc biệt nên thao tác '
  + 'ghi bị giữ lại. Vui lòng báo kỹ thuật kèm mã lỗi bên dưới, đừng bấm lại nhiều lần.';

export function fenceCodeInText(text) {
  if (typeof text !== 'string' || !text) return null;
  const m = FENCE_CODE_RE.exec(text);
  return m ? m[0] : null;
}

/** Mã CUTOVER_* trong lỗi axios (null nếu không phải lỗi hàng rào). */
export function fenceCodeFromError(err) {
  const data = err?.response?.data;
  if (data && typeof data === 'object') {
    if (data.db_code) return String(data.db_code);
    for (const field of ['error', 'message', 'details', 'hint']) {
      const code = fenceCodeInText(data[field]);
      if (code) return code;
    }
  }
  return fenceCodeInText(typeof data === 'string' ? data : err?.message);
}

export function fenceMessage(code) {
  return RETRIABLE_CODES.has(String(code || '')) ? MSG_RETRIABLE : MSG_HELD;
}

/**
 * Nếu là lỗi hàng rào thì thay message thô bằng câu tiếng Việt, giữ mã gốc ở
 * err.response.data.db_code. Trả về true khi đã đổi.
 */
export function normalizeFenceError(err) {
  const code = fenceCodeFromError(err);
  if (!code) return false;
  const text = `${fenceMessage(code)} (mã: ${code})`;
  try {
    if (err.response && typeof err.response.data === 'object' && err.response.data) {
      err.response.data.error = text;
      err.response.data.code = 'DB_WRITE_FENCED';
      err.response.data.db_code = code;
    } else if (err.response) {
      err.response.data = { error: text, code: 'DB_WRITE_FENCED', db_code: code };
    }
    err.message = text;
  } catch {
    /* lỗi đóng băng/readonly thì vẫn trả lỗi gốc */
  }
  return true;
}
