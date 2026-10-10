/**
 * Chờ trang NẠP XONG trước khi trợ lý đọc tiếp.
 *
 * VẤN ĐỀ: sau khi điều hướng (hoặc bấm nút / đổi bộ lọc), trang còn đang gọi API. Trước đây chỉ
 * chờ cứng 1.800ms rồi đọc luôn, nên trợ lý đọc phải khung rỗng / skeleton và kết luận thiếu
 * thông tin — mà nó KHÔNG biết là mình đọc sớm, nên nói chắc chắn một điều sai.
 *
 * VÌ SAO KHÔNG CHỈ TĂNG SỐ GIÂY: trang nhẹ thì chờ thừa (mỗi lượt tool cộng thêm vài giây, chuỗi
 * 4 bước thành cả chục giây), trang nặng thì vẫn chờ thiếu. Nên chờ theo TÍN HIỆU, có chặn trên.
 *
 * BA TÍN HIỆU, phải đạt cả ba mới coi là xong:
 *
 *  1. Không còn dấu hiệu đang tải nào đang hiển thị. Trong mã nguồn này: `.animate-spin`
 *     (236 file), `.animate-pulse` (28 file), và chữ "Đang tải" (144 file) — nên bắt cả class
 *     lẫn chữ. `[aria-busy]` KHÔNG dùng ở đây (0 file) nhưng vẫn bắt cho tương lai.
 *  2. Mạng im: không request nào KẾT THÚC trong `QUIET_MS` gần nhất. Đo bằng
 *     `PerformanceObserver` — KHÔNG vá `window.fetch`/`XMLHttpRequest`. Vá global là sửa hành vi
 *     của cả ứng dụng thật chỉ để phục vụ một tính năng phụ; hỏng thì hỏng toàn app.
 *     Đánh đổi: PerformanceObserver chỉ báo khi request XONG, nên không biết có request đang
 *     bay. Bù lại bằng tín hiệu 1 và 3.
 *  3. DOM đứng yên qua `STABLE_TICKS` nhịp liền.
 *
 * Luôn trả về CHUYỆN GÌ ĐÃ XẢY RA (`reason`, `still_loading`) để tool nói thật cho model biết là
 * trang có thể chưa xong — đó là cách chặn "nói chắc một điều sai" ở gốc.
 */

const POLL_MS = 150;
const QUIET_MS = 450;
const STABLE_TICKS = 2;

/** Dấu hiệu tải CHẮC CHẮN: spinner, progress bar, aria-busy. */
const LOADING_SELECTOR = '.animate-spin, [role="progressbar"], [aria-busy="true"]';

/**
 * `.animate-pulse` là dấu hiệu YẾU — chỉ tính khi phần tử KHÔNG CÓ CHỮ.
 *
 * Ca thật đã đo trên `/crm/leads/<id>`: badge đỏ "Quá 17 ngày 13 giờ" dùng `animate-pulse` để
 * gây chú ý, không phải skeleton. Coi nó là "đang tải" thì `waitForPageReady` cháy hết 14s trên
 * MỌI trang có badge quá hạn, rồi báo `still_loading: true` → trợ lý đọc lại vô ích và nói với
 * người dùng là trang chưa tải xong dù nó xong từ lâu.
 *
 * Skeleton thật là ô rỗng chờ dữ liệu → không có chữ. Đó là chỗ tách được hai loại.
 */
const PULSE_SELECTOR = '.animate-pulse';
const LOADING_TEXT_RE = /đang tải|đang nạp|loading[.…]/i;
// Chỉ soi chữ "đang tải" trong vùng nội dung — khung chat của trợ lý cũng có chữ tương tự.
const LOADING_TEXT_SCOPE = 'main';
const MAX_TEXT_PROBE = 40; // số phần tử lá kiểm chữ mỗi nhịp, đủ để bắt banner mà không quét cả trang

/* ── Tín hiệu mạng: một mốc thời gian duy nhất, không tích luỹ entry ── */

let lastResourceEnd = 0;
let observerStarted = false;

function ensureNetworkObserver() {
  if (observerStarted || typeof PerformanceObserver === 'undefined') return;
  observerStarted = true;
  try {
    const po = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      if (entries.length) lastResourceEnd = performance.now();
    });
    po.observe({ type: 'resource', buffered: false });
  } catch {
    observerStarted = false; // trình duyệt không hỗ trợ → bỏ tín hiệu 2, còn hai tín hiệu kia
  }
}

function networkQuiet(now) {
  if (!observerStarted) return true; // không đo được thì đừng chặn vô hạn
  return now - lastResourceEnd >= QUIET_MS;
}

/* ── Tín hiệu giao diện ── */

function hasLoadingSign() {
  if (typeof document === 'undefined') return false;
  const root = document.querySelector(LOADING_TEXT_SCOPE) || document.body;
  if (!root) return false;

  for (const el of root.querySelectorAll(LOADING_SELECTOR)) {
    if (el.getClientRects().length) return true;
  }

  for (const el of root.querySelectorAll(PULSE_SELECTOR)) {
    if ((el.textContent || '').trim()) continue; // có chữ → badge nhấp nháy, không phải skeleton
    if (el.getClientRects().length) return true;
  }

  // Quét chữ: chỉ phần tử lá, có giới hạn. Dùng textContent (không ép layout như innerText).
  let n = 0;
  for (const el of root.querySelectorAll('span, div, p, td, h1, h2, h3')) {
    if (el.children.length) continue;
    const t = el.textContent;
    if (t && t.length < 40 && LOADING_TEXT_RE.test(t) && el.getClientRects().length) return true;
    n += 1;
    if (n >= MAX_TEXT_PROBE) break;
  }
  return false;
}

/** Chữ ký DOM rẻ tiền: số phần tử + độ dài text. textContent không ép reflow. */
function domSignature() {
  if (typeof document === 'undefined') return '0';
  const root = document.querySelector('main') || document.body;
  if (!root) return '0';
  return `${root.querySelectorAll('*').length}:${(root.textContent || '').length}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {{minMs?: number, maxMs?: number}} opts
 *   minMs — chờ tối thiểu, cho React kịp bắt đầu render (nếu không thì nhịp đo đầu tiên bắt được
 *   trang CŨ đang đứng yên và kết luận "xong" ngay).
 * @returns {Promise<{waited_ms:number, reason:'stable'|'timeout', still_loading:boolean}>}
 */
export async function waitForPageReady({ minMs = 500, maxMs = 9000 } = {}) {
  ensureNetworkObserver();
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  // Đường tắt: `minMs === 0` nghĩa là người gọi KHÔNG vừa gây ra thay đổi nào (tool đọc thuần).
  // Lúc đó nếu trang không có dấu hiệu tải và mạng đã im sẵn thì chẳng có gì để chờ — trả về
  // ngay. Thiếu nhánh này thì mỗi lần đọc chỉ số trên trang đang đứng yên vẫn tốn ~1,2s.
  // KHÔNG áp cho `minMs > 0` (vừa bấm/điền/điều hướng): lúc đó React chưa kịp render nên "mạng
  // im" chỉ là chưa kịp bắt đầu, kết luận xong là sai.
  if (minMs === 0 && !hasLoadingSign() && networkQuiet(now())) {
    return { waited_ms: Math.round(now() - start), reason: 'stable', still_loading: false };
  }

  if (minMs > 0) await sleep(minMs);

  let sig = domSignature();
  let stableFor = 0;

  while (now() - start < maxMs) {
    await sleep(POLL_MS);

    const nextSig = domSignature();
    if (nextSig === sig) stableFor += 1;
    else { stableFor = 0; sig = nextSig; }

    const loading = hasLoadingSign();
    if (!loading && stableFor >= STABLE_TICKS && networkQuiet(now())) {
      return { waited_ms: Math.round(now() - start), reason: 'stable', still_loading: false };
    }
  }

  return {
    waited_ms: Math.round(now() - start),
    reason: 'timeout',
    still_loading: hasLoadingSign(),
  };
}

/**
 * Ghi chú kèm vào kết quả tool. Nói thẳng khi trang CHƯA xong để model đọc lại thay vì kết luận
 * bừa trên dữ liệu nửa vời.
 */
export function waitNote(waited) {
  if (!waited) return '';
  if (waited.reason === 'stable') return `Trang đã nạp xong sau ${waited.waited_ms}ms.`;
  return waited.still_loading
    ? `Đã chờ ${waited.waited_ms}ms mà trang VẪN đang tải. Số liệu đọc lúc này có thể còn thiếu —`
      + ' hãy gọi lại tool đọc một lần nữa trước khi kết luận, hoặc nói rõ với người dùng là trang chưa tải xong.'
    : `Đã chờ hết ${waited.waited_ms}ms; trang không còn dấu hiệu tải nhưng chưa hoàn toàn đứng yên.`;
}
