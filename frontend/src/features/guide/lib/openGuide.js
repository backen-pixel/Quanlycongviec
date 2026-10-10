/**
 * Mở khung Trợ lý hướng dẫn (CopilotKit) từ BẤT KỲ chỗ nào trong app.
 *
 * Vì sao cần: `CopilotSidebar` của thư viện chỉ có prop `defaultOpen`, KHÔNG có prop điều khiển
 * `open`/`onOpenChange` (đã tra `CopilotSidebarProps` trong bản .d.mts đi kèm). Nên không thể
 * nâng trạng thái mở/đóng lên React state của mình — muốn mở từ ngoài phải đi qua đúng nút bật
 * tắt mà thư viện dựng ra.
 *
 * Dùng sự kiện DOM chứ không phải context: chỗ gọi (thanh chat nhanh) nằm trong một cây portal
 * khác hẳn và KHÔNG nằm dưới `CopilotKitProvider`, nên không có context nào để dùng chung. Sự
 * kiện toàn cục là ràng buộc lỏng nhất và không kéo bundle CopilotKit vào chỗ gọi.
 */
export const EVENT_OPEN = 'guide:open';

/** Selector do thư viện dựng — đã đo trên DOM thật, không phải đoán. */
const SIDEBAR_SELECTOR = '[data-copilot-sidebar]';
const TOGGLE_BUTTON_SELECTOR = '.copilotKitButton';

/** Panel đang mở? Thư viện đặt aria-hidden="true" khi đóng (đã đo). */
export function isGuideOpen() {
  const sb = document.querySelector(SIDEBAR_SELECTOR);
  return !!sb && sb.getAttribute('aria-hidden') === 'false';
}

/**
 * Bấm nút bật/tắt của thư viện nếu panel đang đóng. Trả về true nếu đã có panel để thao tác —
 * false nghĩa là panel chưa mount, người gọi cần mount trước.
 */
export function openPanelIfClosed() {
  if (!document.querySelector(SIDEBAR_SELECTOR)) return false;
  if (isGuideOpen()) return true;
  document.querySelector(TOGGLE_BUTTON_SELECTOR)?.click();
  return true;
}

/** Yêu cầu mở trợ lý. An toàn khi trợ lý chưa từng được mở lần nào (sẽ mount rồi mở). */
export function openGuideAssistant() {
  window.dispatchEvent(new CustomEvent(EVENT_OPEN));
}

/**
 * MỞ KHUNG CHAT theo yêu cầu người dùng — khác `openGuideAssistant()`.
 *
 * `openGuideAssistant()` chỉ MOUNT trợ lý (để nhân vật và cầu nối sống); khung chat nay mặc định
 * ĐÓNG, nên hàm đó không còn mở khung nữa. Hàm này mới là hàm bấm nút bật/tắt.
 *
 * Phải chờ và thử lại: lần đầu, khung chat còn chưa tải xong nên nút bật/tắt chưa tồn tại. Cùng
 * bài học với cầu nối ô hỏi — đừng cho rằng thao tác thành công chỉ vì đã gọi hàm.
 */
export function openChatWindow({ maxMs = 4000, tickMs = 150 } = {}) {
  openGuideAssistant();
  if (openPanelIfClosed()) return;

  let remaining = Math.ceil(maxMs / tickMs);
  const timer = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0 || openPanelIfClosed()) clearInterval(timer);
  }, tickMs);
}

/* ─────────────────── Cầu nối cho Ô HỎI NỔI ───────────────────
 *
 * Ô hỏi phải hiện NGAY khi vào trang, nhưng CopilotKit chỉ được tải khi thật sự cần (634 KB
 * gzip — xem AppGuideCopilot.jsx). Hai yêu cầu này chỉ dung hoà được bằng cách tách đôi:
 *
 *   - Vỏ ô hỏi nằm trong bundle chính, không import CopilotKit. Người dùng gõ và bấm gửi.
 *   - Câu hỏi được XẾP HÀNG ở đây, rồi phát sự kiện mở trợ lý.
 *   - Panel (đã tải xong) lấy câu trong hàng đợi ra và gửi cho agent.
 *
 * Nhờ vậy: trang nào cũng có ô hỏi, mà lần vào đầu tiên vẫn không tải CopilotKit.
 */

export const EVENT_ASK = 'guide:ask';

/**
 * Hàng đợi để trên `window`, KHÔNG để ở biến module.
 *
 * Biến module đúng về lý thuyết — Rollup gom module dùng chung vào chunk chính, chunk tải chậm
 * chỉ import lại. Đã kiểm: chuỗi 'guide:ask' chỉ xuất hiện ở MỘT chunk, tức một bản duy nhất.
 * Nhưng thực tế câu hỏi ĐẦU TIÊN vẫn mất im lặng: không lỗi nào bị ném, `addMessage` không hề
 * được gọi, nghĩa là lúc cầu nối rút hàng đợi thì hàng đợi đã rỗng. Tôi không cô lập được chính
 * xác vì sao.
 *
 * Nên bỏ hẳn lớp nghi ngờ đó: `window` chỉ có một, không phụ thuộc cách bundler chia chunk.
 * Đây không phải mê tín — nó biến một thứ "đúng theo lý thuyết" thành thứ "đúng bất kể".
 */
const QUEUE_KEY = '__guide_hang_doi';
let running = false;
const runWatchers = new Set();

/** Vỏ ô hỏi gọi hàm này khi người dùng gửi câu hỏi. */
export function askGuide(question) {
  const text = String(question || '').trim();
  if (!text) return;
  try { window[QUEUE_KEY] = text; } catch { /* ignore */ }
  // Mở trợ lý trước: nếu panel chưa mount thì đây là thứ khiến nó mount.
  openGuideAssistant();
  window.dispatchEvent(new CustomEvent(EVENT_ASK));
}

/** Panel gọi hàm này để lấy câu hỏi đang chờ (lấy xong thì xoá — không gửi lại hai lần). */
export function takeQueuedQuestion() {
  try {
    const text = window[QUEUE_KEY] || null;
    window[QUEUE_KEY] = null;
    return text;
  } catch {
    return null;
  }
}

/**
 * TRẢ CÂU HỎI VỀ HÀNG ĐỢI khi lần gửi vừa rồi không thành.
 *
 * Có hàm riêng chứ không để cầu nối tự gán `window['__guide_hang_doi']`: chuỗi khoá khi đó bị
 * chép sang hai file, và một bên đổi tên là câu hỏi rơi vào một hàng đợi không ai đọc — im lặng
 * đúng như mọi lỗi khác của đường này. Ở đây còn phát lại `EVENT_ASK` để nhịp rút thức dậy
 * ngay, thay vì chờ đúng lúc bộ đếm giờ còn sống.
 */
export function requeueQuestion(question) {
  const text = String(question || '').trim();
  if (!text) return;
  try { window[QUEUE_KEY] = text; } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(EVENT_ASK));
}

/** Còn câu nào đang chờ gửi không. */
export function hasQueuedQuestion() {
  try { return !!window[QUEUE_KEY]; } catch { return false; }
}

export const EVENT_ASK_FAILED = 'guide:o-hoi-that-bai';

/**
 * HẾT CÁCH GỬI — trả chữ về cho người dùng thay vì nuốt.
 *
 * Đường gửi câu hỏi đi qua nhiều nhịp bất định (panel mount, agent bị thay, thread khởi tạo
 * lại). Đã vá từng nhịp, nhưng không thể chứng minh là đã hết ca hụt. Nên chốt một đáy: hết
 * hạn thử lại mà câu hỏi vẫn nằm đó thì ĐƯA LẠI VÀO Ô NHẬP và mở ô hỏi ra. Người dùng thấy
 * nguyên câu mình vừa gõ, bấm gửi lại là xong — thay vì đứng nhìn màn hình không có gì xảy ra.
 */
export function reportAskFailed(question) {
  const text = String(question || '').trim();
  if (!text) return;
  window.dispatchEvent(new CustomEvent(EVENT_ASK_FAILED, { detail: { text } }));
}

/** Ô hỏi đăng ký nhận lại câu hỏi không gửi được. */
export function watchAskFailed(cb) {
  const g = (e) => cb(String(e?.detail?.text || ''));
  window.addEventListener(EVENT_ASK_FAILED, g);
  return () => window.removeEventListener(EVENT_ASK_FAILED, g);
}

/** Panel báo ra ngoài là agent đang chạy, để vỏ ô hỏi khoá ô nhập. */
export function setRunning(v) {
  const fresh = !!v;
  if (fresh === running) return;
  running = fresh;
  for (const cb of runWatchers) {
    try { cb(running); } catch { /* một người nghe lỗi không làm hỏng người khác */ }
  }
}

export function watchRunning(cb) {
  runWatchers.add(cb);
  try { cb(running); } catch { /* ignore */ }
  return () => runWatchers.delete(cb);
}

/* ─────────────────── Lời thoại TẠM của nhân vật ───────────────────
 *
 * Dùng khi một hành động sắp che màn hình — mở tour hướng dẫn là ca điển hình. Trước đây tour
 * bật ra ngay lập tức: người dùng đang nhìn trang thì đột nhiên có lớp phủ trùm lên, không hiểu
 * vì sao. Nhân vật phải nói một câu TRƯỚC, rồi mới mở.
 *
 * Tách khỏi `mascotState.js` vì nguồn khác hẳn: bên đó SUY RA trạng thái từ luồng message, còn
 * đây là câu do chính đoạn mã hành động CHỦ ĐỘNG đặt, kèm hạn dùng.
 */

let tempLine = null;
let expiryTimer = 0;
const lineWatchers = new Set();

function notifyLine() {
  for (const cb of lineWatchers) {
    try { cb(tempLine); } catch { /* ignore */ }
  }
}

/**
 * @param {{text: string, state?: string, ms?: number}} line
 */
export function setTempLine(line) {
  clearTimeout(expiryTimer);
  tempLine = line && line.text ? { text: line.text, state: line.state || 'answering' } : null;
  notifyLine();
  if (tempLine) {
    expiryTimer = setTimeout(() => { tempLine = null; notifyLine(); }, line.ms || 2500);
  }
}

export function watchTempLine(cb) {
  lineWatchers.add(cb);
  try { cb(tempLine); } catch { /* ignore */ }
  return () => lineWatchers.delete(cb);
}

/* ─────────────────── CÂU HỎI XÁC NHẬN — hiện trên NHÂN VẬT ───────────────────
 * Tool `navigate_to_page` chạy theo lối human-in-the-loop: agent chỉ ĐỀ NGHỊ, chỉ khi con
 * người bấm "Đồng ý" mới thật sự chuyển trang. Thẻ hỏi do CopilotKit vẽ nằm TRONG khung chat —
 * mà khung chat nay mặc định ĐÓNG. Người dùng thấy nhân vật báo "đang chờ bạn xác nhận" nhưng
 * không có chỗ nào để bấm, và lượt chạy của agent treo cho tới khi họ tự mở khung chat ra.
 *
 * Kênh này đưa đúng câu hỏi đó ra ngoài cho nhân vật. HAI NƠI, MỘT NGUỒN: cả hai cùng gọi một
 * cặp hàm `agree` / `decline`, nên trả lời ở đâu cũng như nhau và bên kia tự tắt (thẻ trong khung
 * chat đổi trạng thái → effect dọn kênh này).
 */
let confirm = null;
const confirmWatchers = new Set();

function notifyConfirm() {
  for (const cb of confirmWatchers) {
    try { cb(confirm); } catch { /* ignore */ }
  }
}

/**
 * @param {{text: string, agree?: (()=>void)|null, decline?: ()=>void, confirm_label?: string}|null} ask
 */
export function setConfirm(ask) {
  confirm = ask && ask.text ? ask : null;
  notifyConfirm();
}

export function watchConfirm(cb) {
  confirmWatchers.add(cb);
  try { cb(confirm); } catch { /* ignore */ }
  return () => confirmWatchers.delete(cb);
}

/* ─────────────────── BẬT/TẮT THANH HỎI NỔI ───────────────────
 * Thanh hỏi trước đây hiện sẵn ở mọi trang. Nay nó ẩn, và nhân vật là nút mở: bấm vào nhân vật
 * thì thanh hiện ra, bấm × (hoặc bấm lại nhân vật) thì thanh biến đi.
 *
 * Kênh sự kiện chứ không phải prop, vì hai đầu nằm ở hai bundle khác nhau: nhân vật thật sống
 * trong bundle CopilotKit tải chậm, còn thanh hỏi và nút mở nằm trong bundle chính.
 */
export const EVENT_ASK_BAR = 'guide:o-hoi';

/** @param {boolean|undefined} show — bỏ trống = đảo trạng thái. */
export function toggleAskBar(show) {
  window.dispatchEvent(new CustomEvent(EVENT_ASK_BAR, { detail: { show } }));
}

/** Ô hỏi đăng ký nghe. `cb(show)` — `show` là `undefined` nghĩa là ĐẢO trạng thái. */
export function watchAskBar(cb) {
  const g = (e) => cb(e?.detail?.show);
  window.addEventListener(EVENT_ASK_BAR, g);
  return () => window.removeEventListener(EVENT_ASK_BAR, g);
}
