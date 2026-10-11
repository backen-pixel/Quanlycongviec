/**
 * BẢN SAO CỜ MÁY CHỦ trong localStorage — chỉ đọc/ghi, KHÔNG gọi mạng.
 *
 * ═══════════════ VÌ SAO TÁCH KHỎI guideUiSettings.js ═══════════════
 *
 * `guideAccess.js` cần đọc cờ này NGAY LÚC IMPORT (hằng `FULL_ACCESS` tính một lần, xem chú
 * thích ở đó). Nếu nó import thẳng tệp có `import api from '../../../lib/api'` thì sinh ra một
 * vòng: guideAccess → guideUiSettings → lib/api → … → guideAccess. Vòng import không báo lỗi
 * gì cả; nó chỉ làm một hàm thành `undefined` đúng lúc module kia đang khởi tạo, rồi cả nhánh
 * trợ lý im lặng không mount. Đã đo đúng ca này: thanh hỏi còn, nhân vật và khung chat biến mất,
 * console sạch trơn.
 *
 * Nên tệp này KHÔNG ĐƯỢC import bất cứ thứ gì. Đó là toàn bộ lý do nó tồn tại — đừng thêm
 * import vào đây, kể cả một helper nhỏ.
 */

const LS_SRV_FULL = 'guide.srv.fullAccess';
const LS_SRV_PANEL = 'guide.srv.showPanel';

const listeners = new Set();       // nghe cờ bảng Hành động
const fullListeners = new Set();   // nghe cờ toàn quyền

function readFlag(key) {
  try {
    const v = localStorage.getItem(key);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch { /* localStorage bị chặn */ }
  return null; // chưa hỏi máy chủ lần nào → để bên gọi rơi xuống mặc định của nó
}

export function writeFlags({ full, panel }) {
  try {
    if (typeof full === 'boolean') localStorage.setItem(LS_SRV_FULL, full ? '1' : '0');
    if (typeof panel === 'boolean') localStorage.setItem(LS_SRV_PANEL, panel ? '1' : '0');
  } catch { /* ignore */ }
  if (typeof panel === 'boolean') {
    listeners.forEach((fn) => { try { fn(panel); } catch { /* ignore */ } });
  }
  if (typeof full === 'boolean') {
    fullListeners.forEach((fn) => { try { fn(full); } catch { /* ignore */ } });
  }
}

/** Cờ toàn quyền máy chủ đang đặt — `null` nghĩa là CHƯA BIẾT, không phải là tắt. */
export function serverFullAccess() {
  return readFlag(LS_SRV_FULL);
}

/** Có bày bảng Hành động không. Chưa hỏi được máy chủ thì `true` — giữ nguyên nếp cũ. */
export function serverShowPanel() {
  const v = readFlag(LS_SRV_PANEL);
  return v === null ? true : v;
}

/**
 * TOÀN QUYỀN CÓ CÒN HIỆU LỰC NGAY LÚC NÀY KHÔNG — đọc mỗi lần gọi, không nhớ.
 *
 * Khác hẳn hằng `FULL_ACCESS` của guideAccess.js: hằng đó quyết định MOUNT nhóm tool nào và
 * buộc phải cố định suốt vòng đời trang. Hàm này quyết định tool có ĐƯỢC CHẠY hay không, và
 * câu đó phải trả lời lại ở từng lần gọi.
 *
 * Thiếu nó thì có một lỗ đã đo được: người quản trị tắt toàn quyền, máy chủ chuyển sang chế độ
 * đọc ngay — nhưng mọi tab đang mở vẫn giữ nhóm tool cũ đã mount, nên trợ lý vẫn bấm nút và
 * điền form thật cho tới khi ai đó tải lại trang. Tắt mà không tắt.
 *
 * `null` (chưa hỏi được máy chủ) KHÔNG phải là tắt — giữ nguyên hành vi theo cờ lúc build.
 */
export function fullAccessStillOn() {
  return readFlag(LS_SRV_FULL) !== false;
}

/**
 * Nghe thay đổi của cờ toàn quyền. Trả về hàm huỷ đăng ký.
 *
 * Cần cho hai chỗ KHAI BÁO chứ không phải chỗ thực thi: khối ngữ cảnh "Quyền của bạn" gửi lên
 * model, và lời gọi `/debug/prompt` của bảng Ngữ cảnh. Cả hai tính một lần lúc mount bằng hằng
 * `FULL_ACCESS`, nên khi quyền bị thu giữa phiên thì model VẪN ĐƯỢC BẢO là nó có toàn quyền —
 * rồi gọi tool và bị `guardFullAccessTool` chặn. Nói một đằng chặn một nẻo là cách chắc chắn
 * làm model thử đi thử lại.
 */
export function onFullAccessChange(fn) {
  fullListeners.add(fn);
  return () => fullListeners.delete(fn);
}

/** Nghe thay đổi của cờ bảng Hành động. Trả về hàm huỷ đăng ký. */
export function onShowPanelChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
