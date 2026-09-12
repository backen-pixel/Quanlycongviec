/**
 * Đọc TRẠNG THÁI THẬT của trang đang xem — chỉ dùng ở CHẾ ĐỘ TOÀN QUYỀN (lib/guideAccess.js).
 *
 * Khác hẳn hai module đọc trang có sẵn:
 *  - `pageStructureScanner.js` trả về KHUNG (tên nút/tab/trường), đã lọc PII → không biết bộ
 *    lọc đang chọn gì.
 *  - `screenMetrics.js` trả về CON SỐ đếm dạng "nhãn + số" trong một phần tử lá.
 * Cả hai đều KHÔNG trả GIÁ TRỊ của select/input — nên trợ lý không thể trả lời "bộ lọc này
 * đang lọc của công ty nào". Đó chính là lý do file này tồn tại.
 *
 * Ở đây KHÔNG lọc PII: chế độ toàn quyền là bản thử nghiệm, chủ hệ thống đã chấp nhận cho trợ
 * lý thấy đúng những gì người dùng đang thấy trên màn hình của chính họ.
 *
 * Phạm vi quét: <main> + mọi popover/dialog đang mở. PHẢI có phần popover — thanh bộ lọc của
 * nhiều trang (VD /crm/dashboard) nằm trong panel nổi render qua portal ra ngoài <main>; chỉ
 * quét <main> là đọc được đúng con số 0 trường. Luôn loại vùng khung chat của chính trợ lý,
 * nếu không nó đọc lại hội thoại của mình.
 *
 * Giới hạn đã biết: tab "đang chọn" chỉ nhận ra được khi giao diện đánh dấu bằng
 * aria-selected / aria-current / data-state / class active. Trang tô màu tab bằng class
 * Tailwind động (VD CRMDashboard) thì KHÔNG suy ra được — trả về mảng rỗng thay vì đoán bừa.
 */

import { EXCLUDE_SELECTOR, scanRoots, hasOpenDialog, maskPhoneNumbers } from './pageStructureScanner';

// `scanRoots` (và POPOVER_SELECTOR của nó) đã chuyển sang pageStructureScanner.js để ngữ cảnh
// ĐẨY-tự-động và các tool ĐỌC dùng chung ĐÚNG một phạm vi quét — trước đây scanner chỉ đọc
// <main> nên hộp thoại đang mở không bao giờ vào ngữ cảnh gửi lên model.
// Re-export: pageActions.js vẫn `import { scanRoots } from './pageState'`.
export { scanRoots };

/**
 * PHẠM VI QUÉT của một hàm đọc: cả trang, hoặc gói gọn trong MỘT khu vực.
 *
 * Mọi hàm đọc dưới đây vốn lặp thẳng `scanRoots()` — tức luôn quét cả trang. Điều đó đúng với
 * `read_page_state` (lớp 2 toàn trang) nhưng chặn đường `read_region` (lớp 2 một khu vực): gọi lại
 * chúng từ pageRegions.js là trả về dữ liệu toàn trang, phá đúng cái mà kiến trúc hai lớp dựng
 * ra để tránh. Hệ quả trước đây: khu vực nào cũng chỉ đọc được ô nhập + tên nút, còn bảng và
 * mọi cặp "nhãn → giá trị" dạng chữ thuần thì biến mất.
 *
 * Thêm tham số `root` tuỳ chọn, mặc định giữ nguyên hành vi cũ — `read_page_state` không đổi một chữ.
 */
function scopeOf(root) {
  return root ? [root] : scanRoots();
}

const CONTROL_SELECTOR = 'input, select, textarea, [contenteditable="true"], [role="combobox"], [role="switch"]';
const CLICKABLE_SELECTOR = 'button, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="option"], summary';

/**
 * Liên kết CÓ HẬU QUẢ NGOÀI TRÌNH DUYỆT — phải loại khỏi danh sách "bấm được".
 *
 * Ca thật đã xảy ra: nhờ trợ lý "mở 1 lead", `read_page_state` liệt kê `Gọi 0909780606` (thẻ
 * `<a href="tel:…">` trong thẻ kanban) vào `clickable_buttons`. Trợ lý suy ra hợp lý rằng mấy cái đó
 * LÀ các lead, rồi `click_element` bấm đúng vào đó — tức gọi điện cho khách. Không bao giờ mở được
 * chi tiết, mà lại gây hậu quả thật.
 */
export const SIDE_EFFECT_LINK_SELECTOR = 'a[href^="tel:"], a[href^="mailto:"], a[href^="sms:"], a[download]';

/**
 * Vùng chứa MỘT BẢN GHI mà bấm vào là mở chi tiết: thẻ kanban, dòng bảng, mục danh sách.
 *
 * Không có cách nào đọc `onClick` của React từ DOM, nên lọc bằng `cursor: pointer` — dấu hiệu
 * chung nhất cho "chỗ này bấm được", và chính giao diện phải tự khai bằng CSS mới dùng được.
 * Thẻ lead trong repo này là `<div draggable="true" data-crm-pipeline-card onClick=…>` — không
 * khớp bất kỳ selector nào ở `CLICKABLE_SELECTOR`, nên trước đây trợ lý KHÔNG có đường nào mở
 * được một lead.
 */
const CARD_CONTAINER_SELECTOR = [
  '[draggable="true"]',
  '[data-crm-pipeline-card]',
  'tbody tr',
  '[role="row"]',
  '[role="listitem"]',
].join(', ');
const MAX_CARDS = 40;
const MAX_CARD_LABEL_CANDIDATES = 6;

/**
 * LỐI THỨ HAI: DÒNG LẶP LẠI — cho những trang KHÔNG dùng markup nào ở trên.
 *
 * Đã đo trên `/crm/customers`: 1.000 khách hàng được vẽ bằng
 * `<div class="p-4 flex … cursor-pointer" onClick=…>` — không `table`, không `li`, không
 * `role`, không `draggable`. Kết quả: `openable_cards` = 0, `table` = null, `clickable_buttons` = 1.
 * Tức trợ lý KHÔNG THẤY một khách hàng nào trên chính trang danh sách khách hàng, dù trang có
 * 22.464 ký tự chữ. Cùng kiểu này còn có /crm/events, /tasks, /projects, /mua-hang/products…
 *
 * Nhận ra bằng HÌNH DẠNG chứ không bằng thẻ: một danh sách bản ghi là NHIỀU phần tử cùng một
 * chữ ký class, `cursor: pointer`, CÓ CHỮ, và có ít nhất `MIN_REPEATS` cái.
 */
const MIN_REPEATS = 3;
const MIN_CHARS_PER_ROW = 3;
const MAX_REPEAT_SCAN = 20000; // đo trên /crm/customers: 7.013 phần tử, getComputedStyle hết 3ms

function classSignature(el) {
  return String(el.className || '').split(/\s+/).filter(Boolean).sort().join(' ');
}

function isPointer(el) {
  if (typeof getComputedStyle !== 'function') return false;
  try { return getComputedStyle(el).cursor === 'pointer'; } catch { return false; }
}

/** Các phần tử là DÒNG BẢN GHI theo hình dạng lặp lại. Trả về mảng phần tử DOM. */
export function findRepeatedRows({ phaiBamDuoc = true, root: within = null, skip = null } = {}) {
  const group = new Map();
  let scanned = 0;
  for (const root of scopeOf(within)) {
    for (const el of root.querySelectorAll('div, section, article')) {
      if (scanned >= MAX_REPEAT_SCAN) break;
      scanned += 1;
      if (excluded(el) || !isVisible(el)) continue;
      // Nút/link đã có lối đọc riêng ở `readClickables`. Không loại ra thì trên /crm/tasks bộ dò
      // chọn nhóm 1.000 link con "LEAD-2026-430 …" NẰM TRONG mỗi dòng công việc, tưởng đó là
      // danh sách bản ghi — vừa trùng `clickable_buttons` vừa sai tầng.
      if (el.matches(CLICKABLE_SELECTOR) || el.matches(SIDE_EFFECT_LINK_SELECTOR)) continue;
      if (skip && skip(el)) continue;
      if (phaiBamDuoc && !isPointer(el)) continue;
      // Phải CÓ CHỮ mới là một bản ghi. Không lọc thì nhóm đông nhất thường là avatar / ô màu /
      // icon — đã đo trên /crm/zalo và /dashboard: trúng nhóm 200 và 195 phần tử rỗng chữ, nên
      // `openable_cards` = 0 trong khi `openable_cards_total` = 200, vừa vô dụng vừa mâu thuẫn.
      if ((el.textContent || '').trim().length < MIN_CHARS_PER_ROW) continue;
      const sig = classSignature(el);
      if (!sig) continue;
      let g = group.get(sig);
      if (!g) { g = []; group.set(sig, g); }
      g.push(el);
    }
  }
  let best = [];
  for (const g of group.values()) {
    if (g.length < MIN_REPEATS) continue;
    if (g.length > best.length) best = g;
  }
  // Bỏ ứng viên nằm LỒNG trong ứng viên khác — giữ tầng ngoài cùng.
  const set = new Set(best);
  return best.filter((el) => {
    let p = el.parentElement;
    while (p) { if (set.has(p)) return false; p = p.parentElement; }
    return true;
  });
}

const MAX_CONTROLS = 60;
const MAX_BUTTONS = 60;
const MAX_LABEL_LEN = 60;
const MAX_VALUE_LEN = 120;
const MAX_OPTIONS = 40;
const MAX_TABLE_ROWS = 25;
const MAX_TABLE_COLS = 12;
const MAX_CELL_LEN = 60;

// `export` để pageRegions.js dùng chung — cắt chuỗi an toàn với emoji là thứ đã trả giá một
// lần (nửa emoji lọt lên model), không được viết lại bản thứ hai ở file khác.
export function clean(text, max = MAX_VALUE_LEN) {
  /**
   * CHE SỐ ĐIỆN THOẠI TRƯỚC KHI CẮT, không phải sau.
   *
   * `clean` cắt chuỗi dài rồi thêm "…". Che sau khi cắt thì một số bị cắt cụt giữa chừng —
   * "…-033932…" — vẫn còn 6 chữ số đầu và không còn khớp mẫu số điện thoại nữa, nên lọt lưới.
   * Che trước thì nó đã thành "***xxx" rồi, cắt kiểu gì cũng không lộ thêm.
   *
   * Đặt ở ĐÂY vì đây là cửa duy nhất: 35 chỗ trong tệp này và cả `pageRegions` đều đi qua nó.
   */
  const s = maskPhoneNumbers(String(text ?? '')).replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  // Cắt theo KÝ TỰ NGƯỜI ĐỌC, không theo mã đơn vị UTF-16: slice() cắt trúng giữa một cặp thay
  // thế (surrogate pair) là ra NỬA EMOJI. Đã đo trên /permissions: tiêu đề thẻ ra một ký tự
  // hỏng — model không đối chiếu lại được với bất cứ thứ gì đang hiện trên màn hình.
  return `${[...s].slice(0, max - 1).join('')}…`;
}

/** Bỏ dấu + hạ chữ thường để so nhãn/tên option cho người gõ thiếu dấu. */
export function fold(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeId(id) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(id);
  return String(id).replace(/["\\]/g, '\\$&');
}

function excluded(el) {
  return !!el.closest(EXCLUDE_SELECTOR);
}

/** Phần tử có thật sự đang hiển thị (không display:none, không kích thước 0). */
export function isVisible(el) {
  if (!el || !el.getClientRects) return false;
  if (el.getClientRects().length === 0) return false;
  const st = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null;
  if (st && (st.visibility === 'hidden' || st.opacity === '0')) return false;
  return true;
}

/**
 * Suy ra nhãn của một control. Thứ tự bám theo mức độ tin cậy giảm dần; bước "đi lên tối đa 3
 * tầng tìm <label>" là bước bắt được mẫu phổ biến nhất trong mã nguồn này:
 *     <div><label>Công ty</label><select>…</select></div>
 * — label KHÔNG có `for`, cũng KHÔNG bọc control, nên hai bước chuẩn phía trên đều trượt.
 */
export function labelOfControl(el) {
  const aria = el.getAttribute?.('aria-label');
  if (aria) return clean(aria, MAX_LABEL_LEN);

  const labelledBy = el.getAttribute?.('aria-labelledby');
  if (labelledBy) {
    const src = document.getElementById(labelledBy);
    if (src) return clean(src.textContent, MAX_LABEL_LEN);
  }

  if (el.id) {
    const l = document.querySelector(`label[for="${escapeId(el.id)}"]`);
    if (l) return clean(l.textContent, MAX_LABEL_LEN);
  }

  const wrap = el.closest('label');
  if (wrap) {
    // `wrap.textContent` GỒM CẢ chữ của chính control. Với `<select>` bọc trong `<label>` không
    // có chữ riêng, nó ra nguyên danh sách option dính liền:
    // "Tất cả Công Ty MetallaHCBCông ty Nhôm Kính Phúc Đạt…" — nhãn vô nghĩa, và trợ lý không
    // gọi tên được trường để `fill_field` (đã gặp trên /crm/events).
    // Trừ đi phần chữ của control rồi mới lấy; không còn gì thì coi như label rỗng, rơi xuống
    // các bước sau.
    // Trừ trên chuỗi CHƯA CẮT: `clean()` mặc định cắt ở 120 ký tự và thêm "…", nên trừ hai
    // chuỗi đã cắt thì không bao giờ khớp — nhãn ra rỗng và trường thành "(không nhãn)".
    const root = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();
    const own = root(wrap.textContent).replace(root(el.textContent), '').trim();
    if (own) return clean(own, MAX_LABEL_LEN);
  }

  let p = el.parentElement;
  for (let box = 0; p && box < 3; box += 1, p = p.parentElement) {
    const l = p.querySelector('label');
    if (l && !l.contains(el)) return clean(l.textContent, MAX_LABEL_LEN);
  }

  return clean(el.getAttribute?.('placeholder') || el.getAttribute?.('name') || '', MAX_LABEL_LEN);
}

/**
 * Ô TÌM KIẾM TỰ DO khác hẳn một bộ lọc, nên phải gọi tên riêng.
 *
 * Trước đây nó ra `kind: "text"` — giống mọi ô nhập khác. Panel Bộ lọc lại đóng mặc định, nên
 * thứ DUY NHẤT trợ lý nhìn thấy khi cần tìm gì đó là ô tìm kiếm, và nó luôn gõ vào đấy. Tìm tự
 * do chỉ khớp chuỗi (tên/SĐT/mã), không lọc được theo công ty / nhân viên / giai đoạn / thời
 * gian — sai công cụ cho phần lớn yêu cầu.
 */
const SEARCH_HINT_RE = /tìm|tim kiem|search|tra cứu nhanh/i;

function isSearchBox(el, label) {
  if (el.tagName?.toLowerCase() !== 'input') return false;
  const t = (el.type || 'text').toLowerCase();
  if (t === 'search') return true;
  if (t !== 'text') return false;
  return SEARCH_HINT_RE.test(`${label || ''} ${el.getAttribute('placeholder') || ''}`);
}

function controlKind(el, label) {
  const tag = el.tagName?.toLowerCase();
  if (tag === 'select') return el.multiple ? 'multi_select' : 'select';
  if (tag === 'textarea') return 'textarea';
  if (tag === 'input') {
    const t = (el.type || 'text').toLowerCase();
    if (t === 'checkbox') return 'checkbox';
    if (t === 'radio') return 'radio';
    if (isSearchBox(el, label)) return 'search_box';
    return t; // text, date, number…
  }
  if (el.getAttribute?.('role') === 'switch') return 'switch';
  if (el.getAttribute?.('role') === 'combobox') return 'combobox';
  return 'text';
}

/** Giá trị đang hiển thị của control, ở dạng NGƯỜI ĐỌC ĐƯỢC (text của option, không phải id). */
export function valueOfControl(el) {
  const tag = el.tagName?.toLowerCase();

  if (tag === 'select') {
    const picked = [...(el.selectedOptions || [])].map((o) => clean(o.textContent, MAX_LABEL_LEN));
    return picked.length ? picked.join(', ') : '';
  }

  if (tag === 'input') {
    const t = (el.type || 'text').toLowerCase();
    if (t === 'checkbox' || t === 'radio') return el.checked ? 'có' : 'không';
    return clean(el.value);
  }

  if (tag === 'textarea') return clean(el.value);

  const role = el.getAttribute?.('role');
  if (role === 'switch') return el.getAttribute('aria-checked') === 'true' ? 'có' : 'không';

  return clean(el.textContent);
}

function optionsOf(el) {
  if (el.tagName?.toLowerCase() !== 'select') return undefined;
  const opts = [...el.options].slice(0, MAX_OPTIONS).map((o) => clean(o.textContent, MAX_LABEL_LEN));
  return opts.length ? opts : undefined;
}

/** Định dạng bắt buộc của các ô nhập kén giá trị — dùng chung với kiểm tra ở pageActions.js. */
const INPUT_FORMAT_HINTS = {
  date: 'Điền bằng `fill_field`, giá trị yyyy-mm-dd (VD "2026-09-20"). Đừng bấm vào ô này.',
  'datetime-local': 'Điền bằng `fill_field`, giá trị yyyy-mm-ddThh:mm.',
  time: 'Điền bằng `fill_field`, giá trị hh:mm (24 giờ).',
  month: 'Điền bằng `fill_field`, giá trị yyyy-mm.',
  week: 'Điền bằng `fill_field`, giá trị yyyy-Www.',
  number: 'Chỉ chữ số, không dấu phân cách nghìn.',
};

/** Mọi control đang hiển thị trong các gốc quét, kèm giá trị hiện tại. */
export function readControls() {
  const out = [];
  for (const root of scanRoots()) {
    for (const el of root.querySelectorAll(CONTROL_SELECTOR)) {
      if (out.length >= MAX_CONTROLS) return out;
      if (excluded(el) || !isVisible(el)) continue;
      if (el.type === 'hidden') continue;

      const label = labelOfControl(el);
      const value = valueOfControl(el);
      if (!label && !value) continue;

      const item = { label: label || '(không nhãn)', value, kind: controlKind(el, label) };
      const opts = optionsOf(el);
      if (opts) item.options = opts;
      /**
       * Ô ngày/giờ/số: nói LUÔN định dạng, đừng bắt trợ lý thử rồi hỏng.
       *
       * `<input type="date">` trông như một thứ để BẤM VÀO RỒI CHỌN, và model cũng đọc nó như
       * vậy — nên nó hay đi gọi `click_element` lên ô ngày (không mở được lịch của trình duyệt bằng
       * `.click()`), hoặc gọi `fill_field` với "20/09/2026" thì trình duyệt lặng lẽ bỏ giá trị.
       * Cách đúng là ghi thẳng chuỗi ISO. Một trường 30 ký tự ở đây rẻ hơn hai lượt gọi hỏng.
       */
      const dd = INPUT_FORMAT_HINTS[(el.type || '').toLowerCase()];
      if (dd) item.format = dd;
      if (el.disabled) item.locked = true;
      out.push(item);
    }
  }
  return out;
}

/**
 * Cặp nhãn → giá trị dạng CHỈ ĐỌC: `<label>Công ty</label><div>Công ty của bạn</div>`.
 * Không phải control nên `readControls` bỏ qua, nhưng với người dùng bị khoá phạm vi một công
 * ty thì đây LÀ chỗ duy nhất hiện tên công ty đang lọc.
 */
export function readReadonlyPairs(within = null, skip = null) {
  const out = [];
  for (const root of scopeOf(within)) {
    for (const el of root.querySelectorAll('label')) {
      if (out.length >= MAX_CONTROLS) return out;
      if (excluded(el) || !isVisible(el)) continue;
      if (skip && skip(el)) continue;
      const block = el.parentElement;
      if (!block) continue;
      if (block.querySelector(CONTROL_SELECTOR)) continue; // đã có control → readControls lo

      const label = clean(el.textContent, MAX_LABEL_LEN);
      const full = clean(block.textContent);
      const value = clean(full.startsWith(label) ? full.slice(label.length) : full);
      if (!label || !value) continue;
      out.push({ label, value, kind: 'readonly' });
    }
  }
  return out;
}

/**
 * Chip / dòng dạng `Nhãn: giá trị` nằm ngay trong một phần tử lá.
 *
 * ĐÂY LÀ ĐƯỜNG DUY NHẤT đọc được bộ lọc khi panel lọc ĐANG ĐÓNG — và đó là trạng thái thường
 * gặp nhất. Đã đo trên /crm/dashboard: công ty đang lọc hiện ở một <span> lá
 * "Công ty: Công ty Nhôm Kính Phúc Đạt", còn <select> thật thì nằm trong popover chưa mở nên
 * không tồn tại trong DOM → `readControls` trả về đúng con số 0 cho bộ lọc công ty.
 *
 * Nhãn PHẢI không chứa chữ số: nếu không, "Cập nhật 09:31" sẽ bị đọc thành nhãn "Cập nhật 09"
 * giá trị "31", và mọi khoảng giờ "12:30 - 14:00" cũng lọt vào.
 */
const CHIP_RE = /^([^\d:]{2,28}?)\s*:\s*(.{1,80})$/;

/**
 * Chip bộ lọc KHÔNG bao giờ nằm trong một thẻ bản ghi. Loại vùng này để tiêu đề/ghi chú của
 * từng lead ("Tủ bếp: nhà anh Nam") không bị đọc thành một bộ lọc đang bật — cùng loại lỗi đã
 * làm `screenMetrics.js` báo "Cửa sắt trượt Quay - Chị Châu - Quận" = 9.
 */
const DATA_CONTAINER_SELECTOR = '[draggable="true"], tr, li, [role="row"], [role="listitem"], [role="gridcell"]';

export function readInlineLabelValuePairs(within = null, skip = null) {
  const out = [];
  const seen = new Set();
  for (const root of scopeOf(within)) {
    for (const el of root.querySelectorAll('*')) {
      if (out.length >= MAX_CONTROLS) return out;
      if (el.children.length > 0) continue; // chỉ phần tử lá
      if (excluded(el) || !isVisible(el)) continue;
      if (skip && skip(el)) continue;
      if (el.closest(DATA_CONTAINER_SELECTOR)) continue;

      const m = clean(el.textContent).match(CHIP_RE);
      if (!m) continue;
      const label = clean(m[1], MAX_LABEL_LEN);
      const value = clean(m[2]);
      if (!label || !value) continue;

      const key = `${fold(label)}::${fold(value)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ label, value, kind: 'display_label' });
    }
  }
  return out;
}

/**
 * Cặp NHÃN → GIÁ TRỊ dạng "nhãn là một phần tử lá, giá trị nằm ở phần tử KẾ BÊN".
 *
 * Đây là mẫu của mọi TRANG CHI TIẾT trong hệ thống này, và cả ba bộ đọc trước đều trượt:
 * `readControls` cần control, `readReadonlyPairs` cần thẻ `<label>`, `readInlineLabelValuePairs`
 * cần nhãn và giá trị nằm CHUNG một phần tử lá. Cấu trúc thật (đã đo trên `/crm/leads/<id>`):
 *
 *     <div><p>👤 Tên</p><p>CHỊ LOAN</p></div>
 *     <div><p>Người phụ trách</p><div><p>Lê Minh Tiển</p><button>Chuyển người phụ trách</button></div></div>
 *
 * Nên trợ lý mở được trang chi tiết mà KHÔNG đọc được người phụ trách, SĐT, giá trị deal…
 *
 * Hai chi tiết bắt buộc:
 *  - Giá trị phải BỎ chữ nằm trong `button`/`a`: ô "Người phụ trách" có kèm nút "Chuyển người
 *    phụ trách", lấy cả thì giá trị thành "Lê Minh TiểnChuyển người phụ trách".
 *  - Nhãn phải NGẮN (≤ 30 ký tự, ≤ 5 từ, không kết câu). Không chặn thì mọi câu hướng dẫn dài
 *    trên trang đều thành "nhãn" của đoạn text ngay sau nó.
 */
const MAX_PAIR_LABEL_LEN = 30;
const MAX_PAIR_LABEL_WORDS = 5;
const MAX_PAIRS = 50;
const MAX_VALUE_LEAVES = 3;

/**
 * Lấy chữ của phần tử GIÁ TRỊ. Ba mẫu cùng tồn tại trên một trang chi tiết, nên phải có ba
 * bậc — thiếu bậc nào là mất hẳn một nhóm thông tin:
 *
 *  1. `<div><p>Lê Minh Tiển</p><button>Chuyển người phụ trách</button></div>`
 *     → phải BỎ chữ trong nút, không thì giá trị thành "Lê Minh TiểnChuyển người phụ trách".
 *  2. Giá trị nằm CHÍNH TRONG một `<button>` (ô bấm-để-sửa) → bỏ chữ trong nút vô điều kiện là
 *     giá trị rỗng. Nên chỉ ưu tiên chữ ngoài nút, hết thì lấy cả chữ trong nút.
 *  3. `<p>CHỊ LOAN<svg><path/></svg></p>` — giá trị là TEXT NODE TRỰC TIẾP, lá duy nhất là
 *     `<path>` rỗng. Đây là mẫu của cả khối KHÁCH HÀNG (Tên, SĐT, Email, Địa chỉ, MST); thiếu
 *     bậc cuối thì toàn bộ khối đó biến mất khỏi `read_page_state` — đúng lỗi đã đo: trợ lý mở được
 *     trang chi tiết mà không đọc được tên và SĐT khách.
 *
 * Nguyên tắc chung: KHÔNG BAO GIỜ trả rỗng khi phần tử có chữ.
 */
function valueTextOf(el) {
  if (!el.children.length) return clean(el.textContent);
  const outsideButtons = [];
  const all = [];
  let seen = 0;
  for (const leaf of el.querySelectorAll('*')) {
    if (leaf.children.length) continue;
    seen += 1;
    if (seen > 40) break; // chặn quét cả một khối lớn
    const t = clean(leaf.textContent);
    if (!t) continue;
    if (all.length < MAX_VALUE_LEAVES) all.push(t);
    if (!leaf.closest('button, a[href], [role="button"]') && outsideButtons.length < MAX_VALUE_LEAVES) {
      outsideButtons.push(t);
    }
    if (outsideButtons.length >= MAX_VALUE_LEAVES) break;
  }
  if (outsideButtons.length) return outsideButtons.join(' · ');
  if (all.length) return all.join(' · ');
  return clean(el.textContent); // bậc 3 — chữ nằm ở text node trực tiếp
}

function isValidLabel(text) {
  if (!text || text.length > MAX_PAIR_LABEL_LEN) return false;
  if (/[.!?:]$/.test(text)) return false; // kết câu → là câu, không phải nhãn
  // Nhãn chỉ có emoji ("💰", "📅") là icon đứng cạnh khối nhãn+giá trị thật, nên nó tạo ra một
  // cặp TRÙNG: `"💰" → "Giá trị · 50.000.000đ"` ngay trước `"Giá trị" → "50.000.000đ"`.
  // Bỏ đi thì danh sách gọn một nửa và không mất thông tin nào.
  if (!/[\p{L}\p{N}]/u.test(text)) return false;
  // Chữ cái đầu trong ô avatar ("C", "A", "B") và số thứ tự ("0", "3", "5") không phải TÊN của
  // thứ đứng cạnh nó — chúng chỉ tình cờ là phần tử liền trước. Đã đo trên panel chi tiết khách
  // hàng: sinh ra `"C" → "CHỊ LINH"`, `"0" → "0918728082"`, `"5" → "5115"`. Cặp đầu còn đoán
  // được, cặp cuối là rác thuần — mà model không có cách nào biết cái nào là rác.
  if (text.length === 1) return false;
  if (/^\d+$/.test(text)) return false;
  return text.split(/\s+/).length <= MAX_PAIR_LABEL_WORDS;
}

/** @returns {Array<{label: string, value: string}>} */
export function readFieldPairs(within = null, skip = null) {
  const out = [];
  const seen = new Set();
  for (const root of scopeOf(within)) {
    for (const el of root.querySelectorAll('p, span, div, dt, th, label')) {
      if (out.length >= MAX_PAIRS) return out;
      if (el.children.length) continue; // nhãn phải là phần tử lá
      if (excluded(el) || !isVisible(el)) continue;
      if (skip && skip(el)) continue;
      if (el.closest(CARD_CONTAINER_SELECTOR)) continue; // ruột thẻ/dòng — đã có lối đọc riêng
      // Ô trong BẢNG không bao giờ là cặp nhãn→giá trị. Hai <th> cạnh nhau chỉ là hai tiêu đề
      // cột, nhưng phép "lá + phần tử kế bên" ở đây đọc chúng thành "Tên deal → Giai đoạn",
      // "Giai đoạn → Giá trị" — dữ liệu bịa, mà nhìn rất giống thật. Bảng đã có readFirstTable.
      if (el.closest('table')) continue;

      const label = clean(el.textContent, MAX_PAIR_LABEL_LEN);
      if (!isValidLabel(label)) continue;

      const sib = el.nextElementSibling;
      if (!sib || !isVisible(sib)) continue;

      const value = valueTextOf(sib);
      if (!value || value === label) continue;

      const key = fold(label);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ label, value });
    }
  }
  return out;
}

/**
 * Nhãn của một thẻ/dòng bản ghi: ưu tiên tiêu đề, rồi `title`, rồi đoạn text lá đầu tiên đủ
 * ngắn. KHÔNG lấy toàn bộ textContent của thẻ — thẻ kanban chứa cả tên, SĐT, giá trị, nhãn
 * giai đoạn; ghép hết lại thì nhãn dài vô dụng và không khớp được gì.
 */
export function labelOfCard(el) {
  const h = el.querySelector('h1, h2, h3, h4, h5, h6');
  if (h) {
    const t = clean(h.textContent, MAX_LABEL_LEN);
    if (t) return t;
  }
  const title = clean(el.getAttribute?.('title') || '', MAX_LABEL_LEN);
  if (title) return title;
  for (const leaf of el.querySelectorAll('*')) {
    if (leaf.children.length) continue;
    const t = clean(leaf.textContent, MAX_LABEL_LEN);
    if (t.length >= 3) return t;
  }
  // Bậc cuối: chữ nằm ở TEXT NODE trực tiếp của chính phần tử, con duy nhất lại là <svg> rỗng.
  // Đo trên /crm/tasks: <a>LEAD-2026-430 Chị Nương Quận 8<svg><path/></svg></a> — mọi lá đều
  // rỗng nên vòng trên trả '' và thẻ bị loại khỏi `openable_cards` dù nó có chữ rõ ràng.
  return clean(el.textContent, MAX_LABEL_LEN);
}

/**
 * Mọi cách gọi tên một thẻ, theo thứ tự ưu tiên — để thẻ nào bị trùng tên còn LỐI LÙI.
 *
 * Vì sao cần: `labelOfCard` chỉ trả MỘT nhãn, và nhãn ưu tiên cao lại hay là chữ dùng chung.
 * Đã đo trên /crm/assignments: cả 648 thẻ đều mang `title="Click xem chi tiết — kéo để chuyển
 * cột"` (hướng dẫn thao tác, không phải tên bản ghi) nên sau khi khử trùng lặp `openable_cards`
 * chỉ còn ĐÚNG 1 mục — trợ lý tưởng trang có một việc duy nhất. /knowledge trùng kiểu này với
 * huy hiệu "Bắt buộc": 57 thẻ còn 2.
 */
export function cardLabelCandidates(el) {
  const out = [];
  const add = (t) => { const c = clean(t, MAX_LABEL_LEN); if (c && !out.includes(c)) out.push(c); };
  add(el.querySelector('h1, h2, h3, h4, h5, h6')?.textContent);
  add(el.getAttribute?.('title'));
  for (const leaf of el.querySelectorAll('*')) {
    if (leaf.children.length) continue;
    const t = clean(leaf.textContent, MAX_LABEL_LEN);
    if (t.length >= 3) add(t);
    if (out.length >= MAX_CARD_LABEL_CANDIDATES) break;
  }
  add(el.textContent);
  return out;
}

/** Có phải chỗ giao diện tự khai là bấm được? (xem CARD_CONTAINER_SELECTOR) */
function isOpenableCard(el) {
  if (typeof getComputedStyle !== 'function') return false;
  try {
    return getComputedStyle(el).cursor === 'pointer';
  } catch {
    return false;
  }
}

/**
 * Thẻ / dòng bản ghi MỞ ĐƯỢC bằng cách bấm — thứ mà `readClickables` không thấy.
 * @returns {Array<{title: string}>}
 */
let _cardTotal = 0;

/** Tổng số thẻ/dòng TÌM THẤY ở lần `readOpenableCards()` gần nhất (trước khi cắt còn MAX_CARDS). */
export function lastCardTotal() { return _cardTotal; }

/**
 * Gom mọi phần tử là "một bản ghi mở được": markup chuẩn TRƯỚC, dòng lặp lại BÙ SAU.
 * Dùng CHUNG cho cả `read_page_state` lẫn `click_element` — thứ trợ lý ĐỌC được phải đúng là thứ nó BẤM được.
 */
export function openableCardEls() {
  const els = [];
  const seen = new Set();
  for (const root of scanRoots()) {
    for (const el of root.querySelectorAll(CARD_CONTAINER_SELECTOR)) {
      if (excluded(el) || !isVisible(el) || !isOpenableCard(el)) continue;
      if (seen.has(el)) continue;
      seen.add(el); els.push(el);
    }
  }
  // Chỉ bù khi markup chuẩn không thấy gì — tránh trộn hai tầng khác nhau trên cùng một trang.
  if (els.length === 0) {
    for (const el of findRepeatedRows()) { if (!seen.has(el)) { seen.add(el); els.push(el); } }
  }
  return els;
}

export function readOpenableCards() {
  const out = [];
  const seen = new Set();
  const els = openableCardEls();
  _cardTotal = els.length;
  for (const el of els) {
    if (out.length >= MAX_CARDS) break;
    // Lấy ứng viên ĐẦU TIÊN chưa dùng, thay vì bỏ luôn thẻ khi nhãn ưu tiên bị trùng.
    const title = cardLabelCandidates(el).find((t) => !seen.has(t));
    if (!title) continue;
    seen.add(title);
    out.push({ title });
  }
  return out;
}

/** Nút/tab/link đang hiển thị, kèm cờ khoá — dùng để agent biết bấm được cái gì. */
let _buttonTotal = 0;

/** Tổng số nút TÌM THẤY ở lần `readClickables()` gần nhất (trước khi cắt còn MAX_BUTTONS). */
export function lastButtonTotal() { return _buttonTotal; }

const MAX_LIST_ITEMS = 40;

/**
 * Danh sách bản ghi CHỈ ĐỌC — trang có bản ghi nhưng giao diện không cho bấm vào chúng.
 *
 * Đã đo trên `/mua-hang/products`: 500 sản phẩm, 59.887 ký tự chữ, nhưng thẻ sản phẩm KHÔNG
 * `cursor: pointer` và 500 `<button>` duy nhất trên trang là icon sửa ẩn
 * (`opacity-0 group-hover:opacity-100`, không chữ) — loại đúng ở `readClickables`. Kết quả:
 * trợ lý không liệt kê nổi một sản phẩm nào dù người dùng đang nhìn thấy cả trang đầy.
 *
 * Tách hẳn khỏi `openable_cards` để trợ lý KHÔNG đi bấm những mục này rồi báo là đã mở.
 */
export function readDisplayList(root = null, skip = null) {
  const out = [];
  const seen = new Set();
  for (const el of findRepeatedRows({ phaiBamDuoc: false, root, skip })) {
    if (out.length >= MAX_LIST_ITEMS) break;
    const name = cardLabelCandidates(el).find((t) => !seen.has(t));
    if (!name) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

export function readClickables() {
  const out = [];
  const seen = new Set();
  _buttonTotal = 0;
  for (const root of scanRoots()) {
    for (const el of root.querySelectorAll(CLICKABLE_SELECTOR)) {
      if (excluded(el) || !isVisible(el)) continue;
      if (el.matches(SIDE_EFFECT_LINK_SELECTOR)) continue; // tel:/mailto: — xem ghi chú ở selector
      const label = clean(el.getAttribute('aria-label') || el.textContent, MAX_LABEL_LEN);
      if (!label) continue;
      const key = `${label}::${el.getAttribute('role') || el.tagName}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // Đếm TRƯỚC khi cắt: `out` dừng ở MAX_BUTTONS nhưng `_buttonTotal` phải là con số thật, nếu
      // không trợ lý đọc 60 nút rồi kết luận trang chỉ có 60 chỗ bấm — đo trên /crm/tasks: 461.
      _buttonTotal += 1;
      if (out.length >= MAX_BUTTONS) continue;
      const item = { label };
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') item.locked = true;
      if (el.getAttribute('aria-selected') === 'true' || el.getAttribute('data-state') === 'active') item.selected = true;
      out.push(item);
    }
  }
  return out;
}

/** Tab đang chọn — chỉ khi giao diện có đánh dấu tường minh (xem ghi chú đầu file). */
export function readActiveTabs(within = null, skip = null) {
  const out = [];
  for (const root of scopeOf(within)) {
    // `aria-pressed="true"` PHẢI có trong danh sách: nhóm tab Leads/Deals/Khách hàng của
    // /crm/dashboard là các <button> bật/tắt, không phải role=tab. Thiếu nó thì `active_tab`
    // rỗng và trợ lý không biết đang xem loại bản ghi nào — đã đo: nó mở một LEAD rồi báo với
    // người dùng là "đã mở deal".
    const marked = root.querySelectorAll(
      '[role="tab"][aria-selected="true"], [aria-current="page"], [aria-current="true"],'
      + ' [role="tab"][data-state="active"], [aria-pressed="true"]',
    );
    for (const el of marked) {
      if (excluded(el) || !isVisible(el)) continue;
      if (skip && skip(el)) continue;
      const label = clean(el.getAttribute('aria-label') || el.textContent, MAX_LABEL_LEN);
      if (label && !out.includes(label)) out.push(label);
    }
  }
  return out;
}

/** Bảng đầu tiên đang hiển thị: tiêu đề cột + tối đa 25 dòng đầu. */
export function readFirstTable(within = null, skip = null) {
  for (const root of scopeOf(within)) {
    // `root` CÓ THỂ CHÍNH LÀ cái <table>. Khi gọi từ `read_region`, khu vực được dò theo hình
    // dạng lặp nên rất hay trùng khít với thẻ <table>; `querySelectorAll` chỉ tìm con cháu, bỏ
    // sót chính nó — và kết quả là khu vực bảng trả về "không có bảng nào".
    const items = root.matches?.('table') ? [root, ...root.querySelectorAll('table')] : root.querySelectorAll('table');
    for (const table of items) {
      if (excluded(table) || !isVisible(table)) continue;
      if (skip && skip(table)) continue;

      const cols = [...table.querySelectorAll('thead th, thead td')]
        .slice(0, MAX_TABLE_COLS)
        .map((th) => clean(th.textContent, MAX_CELL_LEN));

      const trs = [...table.querySelectorAll('tbody tr')].filter((tr) => isVisible(tr));
      const rows = trs.slice(0, MAX_TABLE_ROWS).map((tr) => [...tr.children]
        .slice(0, MAX_TABLE_COLS)
        .map((td) => clean(td.textContent, MAX_CELL_LEN)));

      if (!cols.length && !rows.length) continue;
      return {
        cols,
        rows,
        rows_read: rows.length,
        table_row_total: trs.length,
        note: trs.length > rows.length
          ? `Bảng có ${trs.length} dòng đang render, chỉ đọc ${rows.length} dòng đầu.`
          : '',
      };
    }
  }
  return null;
}

/**
 * Tìm GẦN ĐÚNG một từ khoá trong nội dung ĐANG HIỂN THỊ.
 *
 * Vì sao cần, đo trên `/crm/events`: trang có 88 sự kiện, trong đó nhiều sự kiện ghi
 * "Phụ trách: Nguyễn Ngọc Linh". Gõ "Linh" vào ô tìm của app → **0 sự kiện**, vì ô tìm đó chỉ
 * khớp tiêu đề sự kiện, KHÔNG khớp tên người phụ trách. Panel Bộ lọc CÓ trường
 * "Người tạo / phụ trách", nhưng danh sách người trong đó bị giới hạn theo công ty đang chọn —
 * chọn Metalla thì không có Linh. Nên khi bộ lọc chưa nới được phạm vi, đây là lối duy nhất
 * trả lời được "kiểm tra Linh trong event": đọc thẳng những gì đang hiện.
 *
 * Khớp bỏ dấu và khớp MỘT PHẦN (`fold` + `includes`): "linh" khớp "Nguyễn Ngọc Linh",
 * "Nhật Linh"; "hoang" khớp "Hoàng Thị P.". Đây là chỗ khác hẳn ô tìm của app.
 *
 * Trả về theo KHỐI chứa (dòng/thẻ/mục danh sách) chứ không theo từng phần tử lá, để mỗi kết quả
 * là một bản ghi đọc được chứ không phải một mẩu chữ rời.
 */
const ROW_SELECTOR = '[draggable="true"], [data-crm-pipeline-card], tbody tr, [role="row"], [role="listitem"], li, article';
const MAX_HITS = 25;
const MAX_SNIPPET = 220;
// Trèo lên tìm khối ĐỦ NGỮ CẢNH. Đo trên /crm/events: phần tử lá là `<span>Nguyễn Ngọc Linh</span>`,
// cha gần nhất chỉ là "Phụ trách: Nguyễn Ngọc Linh" (27 ký tự) — không cho biết đó là sự kiện
// nào, và nhiều sự kiện cùng người phụ trách sẽ ra đoạn trích y hệt rồi bị gộp làm một. Khối sự
// kiện thật nằm cao hơn 4 tầng (584 ký tự).
const MIN_HOLDER_LEN = 80;
const MAX_HOLDER_LEN = 1500; // trèo quá đà là ôm cả trang
const MAX_CLIMB = 6;

function findHolder(el) {
  const row = el.closest(ROW_SELECTOR);
  if (row) return row;
  let best = el;
  let p = el.parentElement;
  for (let i = 0; i < MAX_CLIMB && p; i += 1, p = p.parentElement) {
    const len = (p.textContent || '').trim().length;
    if (len > MAX_HOLDER_LEN) break; // giữ `best` của vòng trước
    best = p;
    if (len >= MIN_HOLDER_LEN) break;
  }
  return best;
}

export function searchOnPage(keyword, { max = MAX_HITS } = {}) {
  const target = fold(keyword);
  if (!target) return { keyword: keyword, results: [], note: 'Từ khoá rỗng.' };

  const hits = [];
  const seenHolders = new Set();
  const seenText = new Set();

  for (const root of scanRoots()) {
    for (const el of root.querySelectorAll('*')) {
      if (hits.length >= max) break;
      if (el.children.length) continue; // chỉ phần tử lá
      if (excluded(el) || !isVisible(el)) continue;
      if (!fold(el.textContent).includes(target)) continue;

      const holder = findHolder(el);
      if (seenHolders.has(holder)) continue;
      seenHolders.add(holder);

      const content = clean(holder.textContent, MAX_SNIPPET);
      if (!content || seenText.has(content)) continue;
      seenText.add(content);
      hits.push({ content });
    }
  }

  return {
    keyword: keyword,
    match_count: hits.length,
    results: hits,
    // Nói rõ phạm vi: đây là lý do 0 kết quả KHÔNG chứng minh được là không tồn tại.
    note: hits.length
      ? `Tìm gần đúng (bỏ dấu, khớp một phần) trong phần ĐANG HIỂN THỊ của ${window.location?.pathname || 'trang'}.`
        + ' Nếu trang đang lọc theo công ty/thời gian hoặc còn trang sau thì đây chưa phải toàn bộ hệ thống.'
      : 'Không thấy trong phần ĐANG HIỂN THỊ. Chưa kết luận là không tồn tại: hãy nới bộ lọc'
        + ' (công ty = tất cả, mở rộng khoảng thời gian), xoá ô tìm kiếm, rồi tìm lại.',
  };
}

/**
 * Ảnh chụp trạng thái trang cho tool `read_page_state`.
 * @param {{include_table?: boolean}} opts  include_table=false để tiết kiệm token khi chỉ cần bộ lọc.
 */
export function readPageState({ include_table = true } = {}) {
  if (typeof document === 'undefined') return { note: 'Không có DOM.' };

  const state = {
    path: window.location?.pathname || '',
    page_title: clean(document.querySelector('main h1, main h2')?.textContent || document.title, MAX_LABEL_LEN),
    active_tab: readActiveTabs(),
    fields_and_filters: [...readControls(), ...readReadonlyPairs(), ...readInlineLabelValuePairs()],
    clickable_buttons: readClickables(),
    // Danh sách bản ghi mở được. Thiếu mục này, trợ lý không thấy lead/deal nào tồn tại trên
    // kanban và đi đoán từ danh sách nút — dẫn tới bấm vào liên kết gọi điện.
    openable_cards: readOpenableCards(),
    // Thông tin của TRANG CHI TIẾT (người phụ trách, SĐT, giá trị deal…). Tách riêng khỏi
    // `fields_and_filters` vì đây là DỮ LIỆU bản ghi, không phải bộ lọc.
    details: readFieldPairs(),
  };

  // Nói RÕ tổng số tìm thấy. Thiếu chỗ này, trợ lý đọc danh sách dài 40 rồi kết luận "trang có
  // 40 khách hàng" trong khi thực tế là 1.000 — đã đo trên /crm/customers.
  const buttonTotal = lastButtonTotal();
  if (buttonTotal > state.clickable_buttons.length) state.clickable_buttons_total = buttonTotal;

  const cardTotal = lastCardTotal();
  if (cardTotal > state.openable_cards.length) {
    state.openable_cards_total = cardTotal;
    state.openable_cards_note = `Trang đang hiển thị ${cardTotal} bản ghi, danh sách trên chỉ là`
      + ` ${state.openable_cards.length} cái đầu. Muốn tìm một tên cụ thể thì dùng find_on_page`
      + ' hoặc thu hẹp bộ lọc, ĐỪNG kết luận từ danh sách bị cắt này.';
  }

  if (include_table) {
    const table = readFirstTable();
    if (table) state.table = table;
  }

  // Lối cuối: trang có bản ghi nhưng không mở được và cũng không phải bảng. Chỉ chạy khi hai lối
  // kia trắng tay — nếu không, cùng một dữ liệu sẽ hiện hai lần ở hai mục khác nhau.
  if (!state.openable_cards.length && !state.table) {
    const items = readDisplayList();
    if (items.length) {
      state.readonly_items = items;
      state.readonly_items_note = 'Đây là các mục ĐANG HIỂN THỊ nhưng KHÔNG bấm mở được'
        + ' (giao diện không cho). Chỉ dùng để đọc/đếm/đối chiếu, đừng gọi click_element lên chúng.';
    }
  }

  /**
   * Nói RÕ là đang đọc một hộp thoại. Thiếu câu này, trợ lý mở hộp thoại "Tạo đơn nghỉ" rồi đọc
   * màn hình, thấy biến mất hết lưới lịch và thanh bộ lọc, và tưởng vừa điều hướng sang trang
   * khác — hoặc tệ hơn, tưởng trang bị hỏng.
   */
  if (hasOpenDialog()) {
    state.dialog_open = true;
    state.dialog_note = 'Màn hình đang có một HỘP THOẠI mở. Mọi thứ liệt kê ở đây là nội'
      + ' dung CỦA HỘP THOẠI — phần trang phía sau tạm thời không đọc được, và cũng không bấm'
      + ' được vì bị hộp thoại chặn. Muốn quay lại trang thì đóng hộp thoại trước.';
  }

  state.note = 'Đây là những gì ĐANG hiển thị trên màn hình theo bộ lọc hiện tại, không phải'
    + ' tổng toàn hệ thống. Trường có `value` rỗng nghĩa là chưa chọn/chưa nhập.'
    // Không nói rõ chỗ này thì model đọc `kind: display_label` thành "cố định, không sửa được"
    // rồi dừng — đã tái hiện với bộ lọc công ty trên /crm/dashboard.
    + ' `kind` = "display_label" hoặc "readonly" chỉ nghĩa là chỗ ĐANG HIỂN THỊ giá trị đó không'
    + ' phải ô nhập — KHÔNG có nghĩa là không đổi được. Ô chọn thật thường nằm trong panel chưa'
    + ' mở; `click_element` mở panel (VD "Bộ lọc") rồi `fill_field` là đổi được.'
    // Chặn ca đã đo: mở một thẻ ở tab Leads rồi báo với người dùng là "đã mở deal".
    + ' `openable_cards` là các bản ghi của TAB ĐANG MỞ (xem `active_tab`) — KHÔNG phải mọi loại.'
    + ' Người dùng hỏi deal/khách hàng mà `active_tab` đang là Leads thì phải `click_element` sang'
    + ' đúng tab ("Deals" / "Khách hàng") rồi `read_page_state` lại trước khi mở thẻ.'
    // Panel Bộ lọc đóng mặc định nên danh sách này thường CHỈ có ô tìm kiếm — dễ khiến model
    // tưởng trang không lọc được gì và gõ đại vào ô tìm.
    + ' TÌM KIẾM: ưu tiên BỘ LỌC trước. Trường `kind: "search_box"` là tìm tự do theo chuỗi'
    + ' (tên/SĐT/mã), KHÔNG lọc được theo công ty / nhân viên / giai đoạn / thời gian. Nếu danh'
    + ' sách trên đây chưa có trường lọc cần dùng thì panel lọc đang ĐÓNG — `click_element "Bộ lọc"`'
    + ' rồi `read_page_state` lại. Chỉ dùng ô tìm kiếm khi thứ cần tìm là một chuỗi cụ thể mà không bộ'
    + ' lọc nào phủ được.';
  return state;
}

/** Bản gọn cho readable gửi mỗi lượt: chỉ bộ lọc/trường + tab, KHÔNG kèm bảng. */
export function readFilterSnapshot() {
  if (typeof document === 'undefined') return { fields_and_filters: [] };
  return {
    active_tab: readActiveTabs(),
    fields_and_filters: [...readControls(), ...readReadonlyPairs(), ...readInlineLabelValuePairs()],
  };
}
