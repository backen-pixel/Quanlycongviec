/**
 * Quét khung giao diện của trang đang xem — gửi lên model MỖI LƯỢT HỎI (readable "Cấu trúc
 * giao diện"). Chỉ được lấy KHUNG (tên nút/tab/trường), TUYỆT ĐỐI không lấy dữ liệu khách
 * hàng thật. Bốn lớp phòng vệ dưới đây, không được bớt lớp nào (xem
 * docs/guide-assistant-current.md §7 cho ca thật đã audit ra số điện thoại lọt qua bộ lọc
 * thiếu lớp 2 và 3):
 *
 *  1. CHỈ quét trong <main> VÀ trong lớp phủ đang mở (hộp thoại/menu) — xem `scanRoots`.
 *     Không quét phần còn lại của trang: widget nổi (dock chat, panel ghim...) nằm ngoài
 *     <main> và thường chứa tên người dùng/nội dung tin nhắn thật.
 *  2. Whitelist theo VAI TRÒ phần tử: chỉ <button>, [role=tab], [role=menuitem], <label>,
 *     [placeholder]. KHÔNG lấy <h1>/<h2> — trên trang chi tiết, tiêu đề chính thường là tên
 *     khách hàng. KHÔNG lấy [role=option] — xem ghi chú ở INCLUDE_SELECTOR.
 *  3. Lọc PII theo pattern: số điện thoại, email, tiền, mã LEAD-/DEAL-.
 *  4. Giới hạn độ dài nhãn (2–40 ký tự) và số mục mỗi nhóm (tối đa 60) — nhãn dữ liệu thật
 *     thường dài bất thường hoặc lặp lại hàng loạt (danh sách khách hàng).
 *
 * Vùng loại trừ [class*="copilotKit"] PHẢI đứng đầu danh sách — không loại thì trợ lý đọc
 * lại chính hội thoại của mình, vừa tốn token vừa tự nhiễu.
 */

export const EXCLUDE_SELECTOR = '[class*="copilotKit"], [class*="cpk-"], [data-copilot-popup],'
  // Giao diện của CHÍNH trợ lý cũng phải nằm ngoài tầm quét. Nhân vật, ô hỏi, vòng sáng và lớp
  // phủ của tour đều là thứ trợ lý tự vẽ ra — đọc lại chúng rồi kể cho model nghe là nó tưởng
  // trang có một ô nhập tên "Hỏi ta bất cứ điều gì…", và tệ hơn: lớp phủ tour phủ kín màn hình
  // nên sẽ lọt vào bộ dò lớp phủ nổi bên dưới và trở thành một "khu vực" giả.
  // `.guide-act` (bảng Hành động của trợ lý): nay nó hiện NỘI DUNG khu vực — nút, bảng, danh
  // sách. Lọt vào tầm quét là trợ lý đọc lại chính kết quả đọc của mình thành một khu vực mới.
  + ' .app-guide-mascot, .app-guide-askbar, .app-guide-spotlight, [data-product-tour-overlay],'
  + ' .guide-act, .guide-act-open';

/**
 * [role=menuitem] CÓ, [role=option] KHÔNG — và đây là ranh giới cố ý:
 * menu là danh sách LỆNH ("Sửa", "Xoá", "Nhân bản") — đúng thứ người dùng hỏi "bấm nút nào".
 * listbox là danh sách DỮ LIỆU (chọn khách hàng, chọn nhân viên) — đọc vào là tên người thật
 * lọt lên model, mà bộ lọc PII theo pattern KHÔNG bắt được tên người (xem lớp 8 của
 * screenMetrics.js). Cần biết một dropdown có những lựa chọn nào thì gọi tool `read_page_state`,
 * chỗ đó có `options` của từng `<select>` và chỉ chạy khi model chủ động hỏi.
 */
const INCLUDE_SELECTOR = 'button, [role="tab"], [role="menuitem"], label, [placeholder]';

/** Dùng chung với screenMetrics.js — hai module có mục đích khác nhau (khung vs chỉ số)
 *  nhưng cùng một tập PII cần chặn, nên chia sẻ đúng MỘT nguồn để sửa một chỗ là đủ. */
export const PII_PATTERNS = [
  /\d{5,}/, // số điện thoại / mã số dài
  /@/, // email
  /·/, // app hay nối "tên · SĐT"
  /\b(LEAD|DEAL)-\d+/i,
];

/*
 * ĐÃ BỎ mẫu `\d+[.,]\d{3}` (số tiền có phân tách nghìn). Chủ hệ thống quyết định số tiền cứ hiển
 * thị bình thường cho model — đây là dữ liệu người dùng đang TỰ NHÌN THẤY trên màn hình của họ,
 * và giấu nó chỉ làm trợ lý trả lời "mình không đọc được" cho đúng loại câu hỏi dễ nhất.
 *
 * Mẫu đó còn gây một lỗi rất khó thấy: nhãn tab "Leads 2.903" khớp nó, nên tab ĐANG MỞ là tab
 * duy nhất biến mất khỏi ngữ cảnh, và trợ lý trả lời như đang đứng ở tab Deals.
 */

/* ─────────────────────── CHE SỐ ĐIỆN THOẠI ───────────────────────
 *
 * Số điện thoại không bị bỏ mục như trước, mà bị CHE còn 3 chữ số cuối: "0937608020" → "***020".
 * Đủ để người dùng đối chiếu "đúng cái số đuôi 020 đó", mà số đầy đủ thì không rời hệ thống.
 *
 * CHẶN BẰNG MÃ, KHÔNG BẰNG LỜI DẶN. Chỉ dẫn hệ thống có thể bị một câu hỏi khéo léo lách qua;
 * hàm này nằm trên đường ra duy nhất nên không có lối vòng. Nó chạy ở CẢ chế độ toàn quyền —
 * trước đây `FULL_ACCESS` bỏ qua mọi bộ lọc, và đã đo: lớp 2 trả nguyên "+84 96 912 21 18".
 *
 * PHÂN BIỆT VỚI TIỀN là chỗ dễ sai nhất: "10.000.000.000" có sẵn chuỗi con "0.000.000.000"
 * trông y hệt một số điện thoại. Ba lớp chặn:
 *   1. không bắt đầu ngay sau một chữ số hay dấu phân tách — tức không cắt ngang một con số;
 *   2. bỏ qua chuỗi đúng dạng nhóm nghìn `123.456.789`;
 *   3. rút hết chữ số rồi phải khớp dạng số Việt Nam: 0 + 8–10 số, hoặc 84 + 8–10 số.
 */
const PHONE_CANDIDATE_RE = /(?:\+?84|0)[\d\s.\-()]{7,16}/g;
const THOUSANDS_GROUPED_RE = /^\d{1,3}(?:[.,]\d{3})+$/;

export function maskPhoneNumbers(text) {
  const s = String(text ?? '');
  if (!s) return s;
  return s.replace(PHONE_CANDIDATE_RE, (m, vt) => {
    const before = vt > 0 ? s[vt - 1] : '';
    if (/[\d.,]/.test(before)) return m;
    const err = m.replace(/[^\d]+$/, '');   // bỏ đuôi không phải số, để không nuốt dấu câu
    const below = m.slice(err.length);
    if (THOUSANDS_GROUPED_RE.test(err)) return m;
    const count = err.replace(/\D/g, '');
    const isPhone = /^0\d{8,10}$/.test(count) || /^84\d{8,10}$/.test(count);
    return (isPhone ? `***${count.slice(-3)}` : err) + below;
  });
}

/**
 * Lớp phủ nổi lên trên <main>: hộp thoại, menu, popover. Trước đây hằng số này nằm ở
 * pageState.js; chuyển về đây vì `scanRoots` giờ dùng chung cho cả hai module, và pageState
 * ĐÃ import từ file này (EXCLUDE_SELECTOR) nên để chiều phụ thuộc ngược lại là vòng lặp import.
 */
const POPOVER_SELECTOR = [
  '[role="dialog"]',
  '[role="menu"]',
  '[role="listbox"]',
  '[data-radix-popper-content-wrapper]',
  '[data-headlessui-portal]',
  '[data-popover]',
].join(', ');

const MIN_LABEL_LEN = 2;
const MAX_LABEL_LEN = 40;
const MAX_ITEMS_PER_GROUP = 60;

/**
 * Các gốc cần quét: <main> trước, rồi mọi popover/dialog KHÔNG nằm trong gốc đã có (tránh đọc
 * hai lần khi dialog render bên trong <main>).
 */
/**
 * LỚP PHỦ NỔI KHÔNG KHAI BÁO GÌ — bộ dò theo hình dạng, không theo thuộc tính.
 *
 * Đây là chỗ vá một điểm mù đã làm hỏng nguyên một nhóm thao tác: trợ lý bấm "Thêm Lead", hộp
 * thoại BẬT LÊN THẬT trên màn hình, nhưng mọi tool đọc màn hình đều không thấy gì. Lý do là hộp
 * thoại của CRM được `createPortal` thẳng ra `<body>` (cố ý, để thanh menu z-30 không đè lên nó)
 * và thân nó chỉ là `<div class="fixed inset-0 …">` — không `role="dialog"`, không thuộc tính
 * của thư viện nào. Nó vừa nằm NGOÀI `<main>`, vừa không khớp `POPOVER_SELECTOR`.
 *
 * Đã đếm: riêng CRMDashboard.jsx có 9 hộp thoại kiểu này và ĐÚNG 0 cái khai báo `role="dialog"`.
 * Nên đây không phải một ca lẻ — nó là cách dựng modal mặc định của cả dự án.
 *
 * Vì thế bộ dò này nhận diện theo HÌNH DẠNG chứ không theo khai báo: con trực tiếp của `<body>`,
 * định vị nổi, đủ lớn, và có thứ bấm/điền được bên trong. Ba điều kiện sau là thứ phân biệt một
 * hộp thoại với một khay thông báo hay một tooltip — chúng nhỏ, hoặc rỗng điều khiển.
 *
 * Cách sửa "đúng chuẩn" là gắn `role="dialog"` vào từng modal, nhưng đó là sửa ở 9+ chỗ trong mã
 * sản phẩm và mỗi modal viết sau lại phải nhớ; bộ dò này nằm gọn trong tính năng trợ lý và bắt
 * được cả những modal chưa viết.
 */
const MIN_OVERLAY_WIDTH = 200;
const MIN_OVERLAY_HEIGHT = 120;
const MIN_OVERLAY_RATIO = 0.12;   // phải phủ ít nhất 12% khung nhìn thì mới coi là lớp phủ
const MIN_DIALOG_RATIO = 0.3; // phủ ≥30% thì coi là HỘP THOẠI chặn cả trang phía sau
const OVERLAY_CONTROL_SELECTOR = 'button, a[href], input, textarea, select, [role="button"], [role="tab"]';

function overlayRatio(el) {
  const r = el.getBoundingClientRect();
  if (r.width < MIN_OVERLAY_WIDTH || r.height < MIN_OVERLAY_HEIGHT) return 0;
  const vw = window.innerWidth || 1;
  const vh = window.innerHeight || 1;
  return (r.width * r.height) / (vw * vh);
}

function isFloatingOverlay(el) {
  if (el.tagName === 'MAIN' || el.querySelector('main')) return false;
  if (el.closest(EXCLUDE_SELECTOR)) return false;
  if (overlayRatio(el) < MIN_OVERLAY_RATIO) return false;
  let position;
  try { position = getComputedStyle(el).position; } catch { return false; }
  if (position !== 'fixed' && position !== 'absolute') return false;
  return !!el.querySelector(OVERLAY_CONTROL_SELECTOR);
}

/**
 * HỘP THOẠI ĐANG MỞ THÌ CHỈ ĐỌC HỘP THOẠI — phần nền phía sau coi như không tồn tại.
 *
 * Không phải để tiết kiệm token, mà vì thứ tự quét đang làm hỏng đúng việc người dùng cần. Hộp
 * thoại "Tạo đơn nghỉ" nằm TRONG `<main>` (không portal ra body), và nằm ở CUỐI cây DOM. Mọi
 * hàm đọc đều duyệt theo thứ tự DOM rồi cắt ở một trần cứng — `readClickables` dừng ở 60 nút.
 * Trang lịch nghỉ có sẵn một lưới ngày đầy nút phía trên, nên vừa đủ để form bị đẩy ra ngoài
 * trần: trợ lý mở được hộp thoại nhưng đọc `read_page_state` xong không thấy nút "Gửi đơn nghỉ" nào,
 * và kết luận là màn hình không có chỗ gửi.
 *
 * Bỏ nền đi là đúng bản chất chứ không phải mẹo: hộp thoại chặn tương tác với mọi thứ sau nó,
 * nên nút phía sau có đọc được cũng không bấm được. Trần 60 nay dành trọn cho form.
 *
 * Ngưỡng 30% khung nhìn để KHÔNG nuốt nhầm menu thả xuống hay popover nhỏ — những thứ đó vẫn
 * cần đọc kèm cả trang phía sau.
 */
function findDialog(root) {
  const out = [];
  for (const el of root.querySelectorAll('div, section, dialog, [role="dialog"]')) {
    if (out.some((r) => r.contains(el))) continue;
    if (!el.getClientRects().length) continue;
    if (!isFloatingOverlay(el)) continue;
    if (overlayRatio(el) < MIN_DIALOG_RATIO) continue;
    let position;
    try { position = getComputedStyle(el).position; } catch { continue; }
    if (position !== 'fixed') continue;   // absolute lớn thường là panel trong trang, không phải hộp thoại
    out.push(el);
  }
  return out;
}

export function scanRoots() {
  if (typeof document === 'undefined') return [];
  const roots = [];
  const main = document.querySelector('main');
  if (main) roots.push(main);

  for (const el of document.querySelectorAll(POPOVER_SELECTOR)) {
    if (el.closest(EXCLUDE_SELECTOR)) continue;
    if (!el.getClientRects().length) continue; // đang ẩn
    if (roots.some((r) => r.contains(el))) continue;
    roots.push(el);
  }

  // Khu vực TỰ KHAI nằm ngoài `<main>` (menu thả xuống, bảng nổi vẽ qua portal) cũng là một gốc quét.
  // Trang đã nói rõ "đây là một khu vực" thì không để việc nó có role/z-index nào quyết định trợ lý
  // có nhìn thấy hay không. Khu vực nằm trong `<main>` thì đã được gốc `<main>` bao, bỏ qua.
  for (const el of document.querySelectorAll('[data-guide-khu-vuc]')) {
    if (el.closest(EXCLUDE_SELECTOR)) continue;
    if (!el.getClientRects().length) continue;
    if (roots.some((r) => r.contains(el))) continue;
    roots.push(el);
  }

  // Chỉ duyệt CON TRỰC TIẾP của <body>: `createPortal(node, document.body)` đặt đúng ở đó, và
  // body thường chỉ có vài con nên phép này rẻ dù `scanRoots` bị gọi lại mỗi vài giây.
  for (const el of Array.from(document.body?.children || [])) {
    if (!el.getClientRects().length) continue;
    if (roots.some((r) => r.contains(el) || el.contains(r))) continue;
    if (isFloatingOverlay(el)) roots.push(el);
  }

  // Hộp thoại lớn đang mở → nó là toàn bộ màn hình, bỏ hết phần còn lại. Xem findDialog().
  // Tìm cả trong `<main>` (hộp thoại của trang lịch nghỉ nằm trong đó) lẫn trong các gốc vừa gom.
  const dialog = [];
  for (const r of roots) {
    if (isFloatingOverlay(r) && overlayRatio(r) >= MIN_DIALOG_RATIO) dialog.push(r);
    else dialog.push(...findDialog(r));
  }
  if (dialog.length) {
    const loc = dialog.filter((el, i) => !dialog.some((k, j) => j !== i && k.contains(el)));
    // Giữ lại popover đang nổi TRÊN hộp thoại (menu thả xuống mở từ trong form) — bỏ nó đi là
    // trợ lý không đọc được danh sách lựa chọn mà chính nó vừa mở.
    const outside = roots.filter((r) => r !== main && !loc.some((h) => h.contains(r) || r.contains(h)));
    return loc.concat(outside);
  }

  if (roots.length === 0 && document.body) roots.push(document.body);
  return roots;
}

/** Màn hình có đang bị một hộp thoại che không — để `read_page_state` nói rõ cho model. */
export function hasOpenDialog() {
  if (typeof document === 'undefined') return false;
  const root = document.querySelector('main') || document.body;
  if (!root) return false;
  return findDialog(root).length > 0
    || Array.from(document.body?.children || [])
      .some((el) => el.getClientRects().length && isFloatingOverlay(el) && overlayRatio(el) >= MIN_DIALOG_RATIO);
}

/**
 * Badge ĐẾM ở cuối nhãn: "Leads 2.903", "Deals 56".
 *
 * Tối đa MỘT nhóm nghìn (≤ 999.999). Đủ cho mọi bộ đếm trong hệ thống, mà vẫn không nhận nhầm
 * một con số tiền dài kiểu "383.296.273" (hai nhóm) hay số điện thoại "0912345678" (liền khối).
 */
const TRAILING_COUNT_BADGE_RE = /^(.*\p{L})\s+\d{1,3}(?:[.,]\d{3})?$/u;

/**
 * VÌ SAO PHẢI THA BADGE ĐẾM — lỗi đã đo, và nó TỰ XUẤT HIỆN theo thời gian.
 *
 * `PII_PATTERNS` có mẫu `\d+[.,]\d{3}` để chặn số tiền rò ra. Nhãn nút tab là "Leads 2.903" —
 * khớp mẫu đó, nên nút bị loại HẲN khỏi readable. Hậu quả trên /crm/dashboard: `buttons` liệt kê
 * "Deals 56" và "Khách hàng 134" nhưng KHÔNG có "Leads", tức tab ĐANG MỞ là tab duy nhất vô
 * hình. Trợ lý nhìn vào đó và trả lời như đang ở Deals.
 *
 * Đáng sợ ở chỗ nó tự đến: khi còn dưới 1.000 lead thì nhãn là "Leads 903" — qua lọt. Vượt 1.000
 * là có dấu phân tách nghìn và tab tự tàng hình, không ai đổi một dòng mã nào.
 *
 * Cách tha: chỉ khi phần CHỮ phía trước sạch PII. `stripBadge` không dùng được ở đây vì nó cắt
 * cả "Quý 4" thành "Quý" — chú thích của nó đã nói rõ, và đó vẫn là ràng buộc đúng.
 *
 * CHỈ ÁP CHO NÚT TRONG NHÓM TAB (`allowBadge`), không áp cho mọi nhãn. Đã thử bản rộng và đo được
 * chỗ rò: "Dự kiến 50.000" cũng qua lọt — tiền dưới một triệu, đúng loại dữ liệu mà lớp 1 cam
 * kết không bao giờ chứa. Nới một bộ lọc PII thì phải nới đúng bằng bề rộng của lỗi cần sửa.
 */
function isSafeLabel(text, allowBadge = false) {
  const t = String(text || '').trim();
  if (t.length < MIN_LABEL_LEN || t.length > MAX_LABEL_LEN) return false;
  if (!PII_PATTERNS.some((re) => re.test(t))) return true;
  if (!allowBadge) return false;
  const m = TRAILING_COUNT_BADGE_RE.exec(t);
  return !!m && !PII_PATTERNS.some((re) => re.test(m[1]));
}

/** "Cài đặt11" → "Cài đặt" — chỉ cắt số dính liền chữ, không phá "Top 10" hay "Quý 4". */
function stripBadge(text) {
  return String(text || '').replace(/([\p{L}])\d{1,3}$/u, '$1').trim();
}

function labelOf(el) {
  const raw = el.getAttribute('placeholder')
    || el.getAttribute('aria-label')
    || el.textContent
    || '';
  return stripBadge(maskPhoneNumbers(raw).replace(/\s+/g, ' ').trim());
}

/**
 * Có phải một nút trong NHÓM TAB không?
 *
 * `role="tab"` là ca chuẩn. Ca thứ hai là segmented control dựng bằng `<button aria-pressed>` —
 * đúng thứ mà nhóm Leads / Deals / Khách hàng của /crm/dashboard đang dùng.
 *
 * Đòi thêm ít nhất HAI anh em cùng có `aria-pressed`: một nút bật/tắt lẻ (VD "Ghim tab") cũng có
 * thuộc tính đó nhưng không phải tab, xếp nó vào `tabs` là mô tả sai cấu trúc màn hình.
 */
function isTabGroup(el) {
  if (el.getAttribute('role') === 'tab') return true;
  if (!el.hasAttribute('aria-pressed')) return false;
  const parent = el.parentElement;
  if (!parent) return false;
  let n = 0;
  for (const c of parent.children) if (c.hasAttribute?.('aria-pressed')) n += 1;
  return n >= 2;
}

/**
 * Trạng thái ĐANG CHỌN, gắn thẳng vào nhãn.
 *
 * Biết trên trang có ba tab mà không biết tab nào đang mở thì gần như vô dụng: trợ lý từng mở
 * một LEAD rồi báo với người dùng là "đã mở deal". `readActiveTabs` (pageState.js) đã vá ca này
 * cho đường KÉO (`read_page_state`) từ lâu — chỗ này là đường ĐẨY, gửi mỗi lượt, và chưa từng được vá.
 */
function isSelected(el) {
  return el.getAttribute('aria-selected') === 'true'
    || el.getAttribute('aria-pressed') === 'true'
    || el.getAttribute('aria-current') === 'page'
    || el.getAttribute('aria-current') === 'true'
    || el.getAttribute('data-state') === 'active';
}

function excludedByCopilot(el) {
  return !!el.closest(EXCLUDE_SELECTOR);
}

/**
 * Đưa một nhóm ra kết quả: cắt còn MAX_ITEMS_PER_GROUP nhưng KÈM tổng số thật.
 *
 * Vì sao phải kèm tổng: trước đây nhóm bị cắt IM LẶNG — trang có 80 nút thì model nhận đúng 60
 * và không có cách nào biết là đã bị cắt, nên nó kết luận "trang chỉ có ngần này nút". Đây đúng
 * loại lỗi mà `the_mo_duoc_tong` trong pageState.js sinh ra để chặn, chỉ là chưa áp cho scanner.
 */
function emitGroup(set) {
  const all = [...set];
  if (all.length <= MAX_ITEMS_PER_GROUP) return { items: all, tong: null };
  return { items: all.slice(0, MAX_ITEMS_PER_GROUP), tong: all.length };
}

/**
 * Quét <main> + lớp phủ đang mở → { tabs, buttons, fields, note }.
 * An toàn khi gọi ngoài trình duyệt (SSR) hoặc khi chưa có <main> — trả object rỗng.
 */
export function scanPageStructure() {
  if (typeof document === 'undefined') return { tabs: [], buttons: [], fields: [], note: '' };

  // `scanRoots` lùi về <body> khi trang không có <main> lẫn lớp phủ. Với TOOL thì đó là lựa
  // chọn đúng (thà đọc thừa còn hơn mù), nhưng với ngữ cảnh ĐẨY-tự-động thì không: quét cả
  // <body> là gom luôn dock chat và panel nổi — vi phạm lớp 1. Bỏ gốc <body>, thà rỗng.
  const root = scanRoots().filter((r) => r !== document.body);
  if (root.length === 0) {
    return { tabs: [], buttons: [], fields: [], note: 'Không tìm thấy <main> trên trang này.' };
  }

  // LỚP PHỦ QUÉT TRƯỚC <main>. Không phải chuyện thẩm mỹ — đã đo: trang nền có 80 nút, mở một
  // hộp thoại thì `buttons_total` lên 82 nhưng hai nút CỦA HỘP THOẠI bị cắt mất, vì Set nhận
  // nút của <main> trước và ngưỡng 60 chặt trước khi tới lượt hộp thoại. Người dùng đang mở
  // hộp thoại thì thứ họ hỏi nằm trong đó, nên nó phải vào Set đầu tiên.
  const main = document.querySelector('main');
  const roots = [...root.filter((r) => r !== main), ...root.filter((r) => r === main)];

  const tabs = new Set();
  const buttons = new Set();
  const fields = new Set();

  for (const root of roots) {
    for (const el of root.querySelectorAll(INCLUDE_SELECTOR)) {
      if (excludedByCopilot(el)) continue;
      const raw = labelOf(el);
      const isTab = isTabGroup(el);
      if (!isSafeLabel(raw, isTab)) continue;

      // Không cắt ở đây nữa: phải đếm hết mới biết tổng thật. Set tự khử trùng lặp nên số phần
      // tử là số nhãn KHÁC NHAU, không phải số thẻ DOM — không phình theo bảng nghìn dòng.
      const label = isSelected(el) ? `${raw} (đang chọn)` : raw;
      if (isTab) tabs.add(label);
      else if (el.tagName === 'LABEL' || el.hasAttribute('placeholder')) fields.add(label);
      else buttons.add(label);
    }
  }

  const t = emitGroup(tabs);
  const b = emitGroup(buttons);
  const f = emitGroup(fields);

  const out = { tabs: t.items, buttons: b.items, fields: f.items };
  if (t.tong) out.tabs_total = t.tong;
  if (b.tong) out.buttons_total = b.tong;
  if (f.tong) out.fields_total = f.tong;

  const notes = [];
  // Lớp phủ đang mở thì nút trong đó trộn lẫn với nút của trang nền — phải nói ra, không thì
  // model chỉ người dùng bấm một nút đang bị hộp thoại che.
  const overlayCount = roots.length - (main ? 1 : 0);
  if (overlayCount > 0) {
    notes.push(`Đang có ${overlayCount} lớp phủ (hộp thoại/menu) MỞ trên trang. Các mục BÊN TRONG`
      + ' lớp phủ được liệt kê TRƯỚC, phần còn lại là của trang nền phía sau — trang nền đang'
      + ' bị che, đừng chỉ người dùng bấm vào đó khi chưa đóng lớp phủ.');
  }
  if (t.tong || b.tong || f.tong) {
    notes.push(`Danh sách đã bị CẮT còn ${MAX_ITEMS_PER_GROUP} mục mỗi nhóm — xem *_tong để biết`
      + ' số thật, đừng kết luận trang chỉ có ngần này.');
  }

  out.note = notes.join(' ');
  return out;
}
