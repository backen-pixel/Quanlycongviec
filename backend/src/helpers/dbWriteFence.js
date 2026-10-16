// Hàng rào chặn ghi của cutover DB.
//
// Các schema vpt_cutover_* gắn trigger lên bảng public. Khi vận hành đóng hàng
// rào để chụp dữ liệu, mọi INSERT/UPDATE/DELETE bị trigger ném exception với
// message thô kiểu CUTOVER_V2_WRITE_FENCED. Route chỉ trả `e.message` nên chuỗi
// đó đi thẳng ra alert() của trình duyệt — người dùng không hiểu gì.
//
// Đây là nơi duy nhất đổi message thô sang tiếng Việt. Không tự mở/đóng hàng
// rào; việc đó chỉ chủ sở hữu DB làm bằng CLI vận hành.

const FENCE_CODE_RE = /CUTOVER(?:_V2)?_[A-Z0-9_]{3,}/;

// Các trường có thể chứa message lỗi của Postgres. Chỉ soi đúng những trường
// này để không đụng vào nội dung do người dùng nhập (bình luận, mô tả...).
const ERROR_FIELDS = ['error', 'message', 'details', 'hint', 'raw_message'];

// Hàng rào đang đóng theo kế hoạch — chờ vài phút là ghi lại được.
const RETRIABLE_CODES = new Set([
  'CUTOVER_WRITE_FENCED',
  'CUTOVER_V2_WRITE_FENCED',
  'CUTOVER_LOCK_UNAVAILABLE',
  'CUTOVER_V2_LOCK_UNAVAILABLE',
  'CUTOVER_TIMEOUT',
  'CUTOVER_V2_TIMEOUT',
]);

const MSG_RETRIABLE = 'Hệ thống đang tạm khóa ghi để sao lưu/đồng bộ dữ liệu. '
  + 'Dữ liệu cũ vẫn xem được bình thường. Vui lòng gửi lại sau vài phút — '
  + 'thao tác vừa rồi chưa được lưu.';

const MSG_HELD = 'Cơ sở dữ liệu đang ở trạng thái bảo trì đặc biệt nên thao tác '
  + 'ghi bị giữ lại. Vui lòng báo kỹ thuật kèm mã lỗi bên dưới, đừng bấm lại nhiều lần.';

const CLIENT_CODE = 'DB_WRITE_FENCED';
const RETRY_AFTER_SECONDS = 60;

/** Lấy mã CUTOVER_* trong một chuỗi (null nếu không có). */
function fenceCodeInText(text) {
  if (typeof text !== 'string' || !text) return null;
  const m = FENCE_CODE_RE.exec(text);
  return m ? m[0] : null;
}

/** Lấy mã CUTOVER_* trong body JSON lỗi (chỉ soi các trường message chuẩn). */
function detectFenceCode(body) {
  if (typeof body === 'string') return fenceCodeInText(body);
  if (!body || typeof body !== 'object') return null;
  for (const field of ERROR_FIELDS) {
    const code = fenceCodeInText(body[field]);
    if (code) return code;
  }
  return null;
}

function isRetriableFence(code) {
  return RETRIABLE_CODES.has(String(code || ''));
}

/** Body trả cho client: tiếng Việt + giữ mã gốc để kỹ thuật tra cứu. */
function fenceErrorBody(code) {
  const retriable = isRetriableFence(code);
  return {
    error: retriable ? MSG_RETRIABLE : MSG_HELD,
    code: CLIENT_CODE,
    db_code: code,
    retriable,
  };
}

/**
 * Middleware: bọc res.json để đổi message hàng rào sang tiếng Việt.
 * Đặt trước các route /api/*.
 */
function dbWriteFenceResponder(req, res, next) {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    let code = null;
    try {
      code = detectFenceCode(body);
    } catch {
      code = null;
    }
    if (!code) return originalJson(body);
    const friendly = fenceErrorBody(code);
    if (isRetriableFence(code)) {
      try { res.set('Retry-After', String(RETRY_AFTER_SECONDS)); } catch { /* header đã gửi */ }
    }
    // Chỉ nâng lên 503 khi route vốn đã báo lỗi; body 2xx chỉ đổi chữ.
    if (res.statusCode >= 400) res.status(503);
    return originalJson({ ...(body && typeof body === 'object' ? body : {}), ...friendly });
  };
  return next();
}

module.exports = {
  CLIENT_CODE,
  FENCE_CODE_RE,
  MSG_HELD,
  MSG_RETRIABLE,
  RETRY_AFTER_SECONDS,
  detectFenceCode,
  fenceCodeInText,
  fenceErrorBody,
  isRetriableFence,
  dbWriteFenceResponder,
};
