/**
 * NGỮ CẢNH HAI LỚP — bản đồ khu vực (lớp 1) và khoan sâu vào một khu vực (lớp 2).
 *
 * VẤN ĐỀ: readable "Cấu trúc giao diện" trả về một danh sách PHẲNG tên nút/tab/trường. Model
 * biết trên màn hình có nút "Thêm KH" nhưng KHÔNG biết màn hình được chia thành mấy vùng, vùng
 * nào đang chứa bản ghi, vùng nào là bộ lọc. Đã đo trên /crm/customers: 4.892 phần tử bấm được,
 * readable gửi lên đúng **2 nhãn** — model không hề biết trang đang hiển thị 1.000 khách hàng.
 * Ngược lại, đổ hết dữ liệu lên mỗi lượt thì vừa tốn token vừa lộ dữ liệu khách hàng.
 *
 * CÁCH LÀM: tách đôi.
 *
 *   LỚP 1 — `scanRegions()`, đẩy tự động mỗi lượt. Chỉ có KIẾN TRÚC: mỗi khu vực một dòng
 *   (tên, loại, chứa bao nhiêu mục, bao nhiêu điều khiển). KHÔNG nội dung bản ghi. Rẻ, khoảng
 *   một dòng ~70 ký tự cho mỗi khu vực, tối đa 15 khu vực.
 *
 *   LỚP 2 — `readRegion(ref)`, chỉ chạy khi model CHỦ ĐỘNG gọi tool `read_region`. Đọc sâu
 *   ĐÚNG một khu vực: điều khiển kèm giá trị, nút, và danh sách mục bên trong.
 *
 * Nói theo ví dụ của chủ hệ thống: lớp 1 biết "khu vực này chứa các lead", lớp 2 biết "trong đó
 * có những lead nào".
 *
 * RANH GIỚI DỮ LIỆU — khác nhau theo chế độ, cố ý:
 *   - Lớp 1 KHÔNG BAO GIỜ chứa nội dung bản ghi, ở cả hai chế độ. Tên khu vực còn phải qua bộ
 *     lọc PII + kính ngữ, vì tiêu đề vùng trên trang chi tiết thường chính là tên khách hàng.
 *   - Lớp 2 ở chế độ TOÀN QUYỀN trả về tiêu đề từng mục. Ở chế độ CHỈ HƯỚNG DẪN thì chỉ trả về
 *     SỐ LƯỢNG — trợ lý vẫn hướng dẫn được ("khu vực Deals đang có 512 thẻ") mà dữ liệu khách
 *     hàng không rời hệ thống.
 */

import { EXCLUDE_SELECTOR, PII_PATTERNS, scanRoots } from './pageStructureScanner';
import {
  isVisible,
  labelOfControl,
  valueOfControl,
  cardLabelCandidates,
  clean,
  SIDE_EFFECT_LINK_SELECTOR,
  // Sáu hàm đọc sâu dưới đây VỐN ĐÃ CÓ và `read_page_state` vốn đã dùng — lớp 2 thì không, nên khu vực
  // nào cũng chỉ đọc được ô nhập + tên nút. Chúng nhận tham số `root` để bó vào đúng một khu vực.
  readFieldPairs,
  readReadonlyPairs,
  readInlineLabelValuePairs,
  readFirstTable,
  readActiveTabs,
  readDisplayList,
} from './pageState';
import { FULL_ACCESS } from './guideAccess';

/* ─────────────────────────── Hằng số ─────────────────────────── */

const CONTROL_SELECTOR = 'input, select, textarea, [contenteditable="true"], [role="combobox"], [role="switch"]';
const CLICKABLE_SELECTOR = 'button, a[href], [role="button"], [role="tab"], [role="menuitem"], summary';

// Giống `findRepeatedRows` của pageState — một danh sách bản ghi là NHIỀU phần tử cùng chữ ký
// class, có chữ, bấm được. Khác một điểm: ở đây lấy MỌI nhóm, không chỉ nhóm đông nhất, vì mỗi
// nhóm là một KHU VỰC riêng (cột kanban Leads và cột Deals là hai nhóm khác nhau).
const MIN_REPEATS = 3;
/**
 * Lối dò ANH EM RUỘT được hạ xuống 2, lối dò dòng-lặp-lại thì KHÔNG.
 *
 * Vì sao chỉ hạ một bên: lối anh em ruột còn một điều kiện cấu trúc thứ hai (nhóm phải chiếm
 * phần lớn số con của cha), nên hạ sàn ở đó không mở cửa cho rác. Lối kia gom theo chữ ký class
 * trên toàn trang, hạ xuống 2 là mọi cặp div trùng class đều thành khu vực.
 *
 * Cái nó cứu: cột kanban 2 thẻ. Trước đây cột như vậy không có nhóm nào → không thành khu vực →
 * `read_region` không vào được, và trợ lý trả lời "không có cột đó" rất chắc chắn.
 */
const MIN_SIBLING_REPEATS = 2;
const MIN_CHARS_PER_ROW = 3;
const MAX_SCAN = 20000;

const MAX_REGIONS = 15;
/** Trần riêng cho khu vực tự khai — xem chỗ cắt trong detectRegions. */
const MAX_DECLARED = 30;
const MAX_NAME_LEN = 48;
const MAX_L2_ITEMS = 40;
/**
 * Số DÒNG đọc được của mỗi mục (xem chỗ dựng `ra.muc`). Trước đây là 1 — mỗi thẻ deal bị vắt
 * còn đúng một chuỗi trong khi `cardLabelCandidates` đã gom sẵn tới 6 nhãn.
 *
 * Thu xuống 2 dòng khi khu vực đông mục: 40 mục × 4 dòng × 60 ký tự ≈ 9.600 ký tự cho MỘT lần
 * gọi tool, đắt hơn cả `read_page_state` — đúng thứ mà lớp 2 sinh ra để tránh.
 */
const MAX_ROWS_PER_ITEM = 4;
const FEW_ITEMS_THRESHOLD = 20;
const MAX_L2_CONTROLS = 40;
const MAX_L2_BUTTONS = 40;
const MAX_L2_FIELDS = 40;
const MAX_CLIMB_COMMON = 12;
// Trang kanban có hàng trăm <h?> (mỗi thẻ một cái). Không cần duyệt hết mới biết vùng vô danh.
const MAX_HEADING_CHECKS = 20;
/** Leo tối đa mấy tầng cha để tìm tiêu đề, và xét tối đa mấy tiêu đề ở mỗi tầng. */
const MAX_CLIMB_FOR_NAME = 3;
const MAX_PARENT_HEADING_CHECKS = 40;

/** Kính ngữ = có tên người. Bộ lọc PII theo pattern KHÔNG bắt được tên người — xem screenMetrics.js lớp 8. */
const HONORIFIC_RE = /(^|\s)(chị|anh|ông|bà|cô|chú|em|mr|ms|mrs)\s/;

/* ─────────────────────────── Tiện ích ─────────────────────────── */

function excluded(el) {
  return !!el.closest(EXCLUDE_SELECTOR);
}

function classSignature(el) {
  return String(el.className || '').split(/\s+/).filter(Boolean).sort().join(' ');
}

function isPointer(el) {
  if (typeof getComputedStyle !== 'function') return false;
  try { return getComputedStyle(el).cursor === 'pointer'; } catch { return false; }
}

/** Phần tử có nằm trong một vùng bấm được nào đó (tính tới `container`, không tính chính nó)? */
function insideClickable(el, container) {
  let p = el.parentElement;
  while (p && p !== container) {
    if (isPointer(p)) return true;
    p = p.parentElement;
  }
  return false;
}

/**
 * Tên khu vực có an toàn để gửi lên model không.
 * Dùng ở LỚP 1 nên phải chặt: lớp 1 đi kèm MỌI lượt hỏi, kể cả chế độ chỉ hướng dẫn.
 */
function isSafeName(text) {
  const t = String(text || '').trim();
  if (t.length < 2 || t.length > MAX_NAME_LEN) return false;
  if (!isPiiFree(t)) return false;
  if (HONORIFIC_RE.test(t.toLowerCase())) return false;
  return true;
}

/**
 * Tổ tiên chung gần nhất của một nhóm phần tử — đây chính là "khu vực" chứa chúng.
 * Leo có giới hạn: gặp trang dựng phẳng thì cứ leo mãi sẽ ra <main>, mất hết ý nghĩa phân vùng.
 */
function commonAncestor(els) {
  if (!els.length) return null;
  let p = els[0].parentElement;
  let climb = 0;
  while (p && climb < MAX_CLIMB_COMMON) {
    let enough = true;
    for (const e of els) { if (!p.contains(e)) { enough = false; break; } }
    if (enough) return p;
    p = p.parentElement;
    climb += 1;
  }
  return null;
}

/**
 * Đặt tên cho một khu vực. Thứ tự theo độ tin cậy giảm dần; `data-guide-khu-vuc` là lối cho
 * người viết giao diện đặt tên tường minh khi ba lối tự động đều ra tên xấu.
 */
function nameOf(container, items = [], defaultName = '') {
  // Khu vực "còn lại" KHÔNG được suy tên: container của nó là <main>, nên mọi lối suy luận dưới
  // đây sẽ bắt trúng tiêu đề của một vùng khác. Đã đo trên /crm/dashboard: thanh công cụ bị đặt
  // tên "Chờ sale xác nhận" — tên một cột kanban.
  if (defaultName) return { name: defaultName, name_from: 'default' };

  const own = container.getAttribute?.('data-guide-khu-vuc');
  if (isSafeName(own)) return { name: own.trim(), name_from: 'declared' };

  const aria = container.getAttribute?.('aria-label');
  if (isSafeName(aria)) return { name: aria.trim(), name_from: 'aria_label' };

  /**
   * Tiêu đề BÊN TRONG khu vực — nhưng KHÔNG được nằm trong một mục của chính khu vực đó.
   *
   * Ca thật đã lọt (đo trên /crm/customers): khu vực danh sách 999 khách hàng được đặt tên
   * "THÚY BE" — tên khách hàng đầu tiên, vì mỗi dòng khách vẽ tiêu đề bằng <h?>. Bộ lọc PII
   * theo pattern lẫn bộ lọc kính ngữ đều KHÔNG bắt được (không chữ số, không "chị/anh").
   * Chặn bằng cấu trúc, không bằng cách đoán chuỗi: tiêu đề nằm trong một MỤC thì nó là tên
   * của mục, không phải tên của vùng chứa mục.
   */
  const firstItem = items.length ? items[0] : null;
  let checks = 0;
  for (const h of container.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    if (checks >= MAX_HEADING_CHECKS) break; // trang kanban có hàng trăm tiêu đề thẻ, không quét hết
    if (!isVisible(h) || excluded(h)) continue;
    checks += 1;
    /**
     * Luật MẠNH NHẤT trong ba luật ở đây, và là luật duy nhất bắt được ca cuối: tiêu đề nằm
     * bên trong một vùng BẤM ĐƯỢC thì nó là tiêu đề của BẢN GHI đó, không phải của khu vực.
     *
     * Ca thật (đo trên /crm/dashboard): vùng 3 thẻ bị đặt tên "[FB Deal] Bếp Công Nghiệp" — tên
     * một deal. Hai luật dưới đây đều trượt vì cái <h?> ấy nằm trong một thẻ có chữ ký class
     * KHÁC, nên nó không thuộc `items` của vùng này và cũng đứng TRƯỚC mục đầu tiên của vùng.
     * Đã đo lại tổ tiên của nó: hai tầng liền kề đều `cursor: pointer`.
     *
     * `continue` chứ không `break`: tiêu đề thật của vùng có thể nằm sau vài thẻ trong DOM.
     */
    if (insideClickable(h, container)) continue;
    if (items.some((m) => m.contains(h))) break; // chạm tiêu đề của mục đầu tiên là dừng hẳn
    // Quy tắc thứ hai, cũng thuần cấu trúc: TIÊU ĐỀ CỦA MỘT VÙNG LUÔN ĐỨNG TRƯỚC NỘI DUNG VÙNG
    // ĐÓ. Đã đo trên /crm/dashboard: một vùng 3 thẻ bị đặt tên "[FB Deal] Bếp Công Nghiệp" —
    // tên một deal thật, lấy từ <h?> của thẻ KHÁC nằm cùng container nhưng không thuộc nhóm
    // `items`. Quy tắc "không nằm trong mục" một mình không chặn được ca này.
    if (firstItem && (h.compareDocumentPosition(firstItem) & Node.DOCUMENT_POSITION_PRECEDING)) break;
    const t = (h.textContent || '').replace(/\s+/g, ' ').trim();
    if (isSafeName(t)) return { name: t, name_from: 'heading_inside' };
  }

  /**
   * TIÊU ĐỀ GẦN NHẤT PHÍA TRÊN — leo lên cha, không chỉ nhìn anh em ruột.
   *
   * Luật cũ đòi anh em liền trước PHẢI LÀ `<h1-6>`. Đã đo trên /crm/dashboard: 7/9 khu vực vô
   * danh dù cột nào cũng có tiêu đề `<h3>` hiện rành rành. Lý do là hình dạng thật của một cột:
   *
   *     .kanban-column-surface          ← gốc cột
   *       ├ div (header dính)           ← chứa <h3> "Deal mới."
   *       └ … → div.relative.w-full     ← KHU VỰC (7 thẻ), KHÔNG có anh em nào phía trước
   *
   * Tiêu đề không phải anh em của khu vực, cũng không nằm trong khu vực — nó ở một TẦNG CHA.
   * Cả hai luật cũ đều không với tới, nên `read_region` chỉ gọi được bằng `kv3`, trong khi
   * prompt lại dặn ưu tiên `name` vì id đổi sau mỗi lần bấm.
   *
   * LẤY CÁI CUỐI CÙNG, KHÔNG PHẢI CÁI ĐẦU. Khi leo tới tầng bảng kanban, mọi tiêu đề cột đều
   * đứng trước khu vực; lấy cái đầu là cột nào cũng mang tên "Deal mới.". Tiêu đề gần nhất phía
   * trên mới là tiêu đề của chính vùng đó — đúng cách người đọc trang hiểu.
   */
  let parent = container.parentElement;
  for (let climb = 0; climb < MAX_CLIMB_FOR_NAME && parent; climb += 1) {
    let near = '';
    let xet2 = 0;
    for (const h of parent.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
      if (xet2 >= MAX_PARENT_HEADING_CHECKS) break;
      if (container.contains(h)) continue;   // tiêu đề của bản ghi BÊN TRONG vùng
      // Phải ĐỨNG TRƯỚC vùng: tiêu đề đi trước nội dung nó đặt tên cho.
      if (!(h.compareDocumentPosition(container) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
      if (!isVisible(h) || excluded(h)) continue;
      xet2 += 1;
      const t = (h.textContent || '').replace(/\s+/g, ' ').trim();
      if (isSafeName(t)) near = t;   // giữ cái sau cùng — gần vùng nhất
    }
    if (near) return { name: near, name_from: 'heading_above' };
    parent = parent.parentElement;
  }

  return { name: '', name_from: 'none' };
}

/* ─────────────────────────── Dò khu vực ─────────────────────────── */

/**
 * MỌI nhóm dòng lặp lại trên trang (khác `findRepeatedRows` của pageState — chỗ đó chỉ lấy nhóm
 * đông nhất vì nó đi tìm "danh sách bản ghi của trang", còn ở đây mỗi nhóm là một khu vực).
 */
function repeatGroups() {
  const group = new Map();
  let scanned = 0;
  for (const root of scanRoots()) {
    for (const el of root.querySelectorAll('div, section, article')) {
      if (scanned >= MAX_SCAN) break;
      scanned += 1;
      if (excluded(el) || !isVisible(el)) continue;
      if (el.matches(CLICKABLE_SELECTOR)) continue;
      if (!isPointer(el)) continue;
      if ((el.textContent || '').trim().length < MIN_CHARS_PER_ROW) continue;
      const sig = classSignature(el);
      if (!sig) continue;
      let g = group.get(sig);
      if (!g) { g = []; group.set(sig, g); }
      g.push(el);
    }
  }

  const out = [];
  for (const g of group.values()) {
    if (g.length < MIN_REPEATS) continue;
    // Bỏ phần tử nằm LỒNG trong phần tử khác cùng nhóm — giữ tầng ngoài cùng.
    const set = new Set(g);
    const outside = g.filter((el) => {
      let p = el.parentElement;
      while (p) { if (set.has(p)) return false; p = p.parentElement; }
      return true;
    });
    if (outside.length >= MIN_REPEATS) out.push(outside);
  }
  return out;
}

/**
 * NHÓM ANH EM RUỘT — lối dò thứ hai, cho những vùng KHÔNG bấm được.
 *
 * ═══════════════ HAI THỨ `repeatGroups` KHÔNG THẤY ═══════════════
 *
 * Nó bắt buộc `cursor: pointer`, vì nó đi tìm DÒNG BẢN GHI. Cái giá, đo trên /crm/dashboard:
 *
 *  1. Dải 6 thẻ KPI (Tổng deal, Đang xử lý, Hủy/Thua, Giá trị dự kiến…) — chỉ để đọc, không bấm
 *     được, nên KHÔNG có trong bản đồ. Trợ lý không biết trang có phần KPI, dù đó là thứ người
 *     dùng hay hỏi nhất.
 *  2. Cột kanban. Cột được nhận ra GIÁN TIẾP qua thẻ bên trong (gom thẻ → leo lên tổ tiên chung),
 *     nên cột dưới 3 thẻ thì không có nhóm, không có cột. Đã thấy thật: bảng có ~6 cột, bản đồ
 *     nhận ra 1, và trợ lý trả lời "không có cột đó" rất chắc chắn.
 *
 * ═══════════════ VÌ SAO KHÔNG BỎ HẲN `isPointer` ═══════════════
 *
 * Bỏ ra thì mọi div bọc layout có cùng class đều thành "khu vực": trang phức tạp sẽ đẻ ra hàng
 * chục nhóm rác, và vì bản đồ xếp theo SỐ MỤC giảm dần, rác đông người sẽ đẩy khu vực thật ra
 * khỏi trần 15.
 *
 * Nên thay điều kiện "bấm được" bằng một điều kiện CẤU TRÚC chặt hơn: nhóm phải là ANH EM RUỘT
 * cùng một cha, VÀ chiếm phần lớn số con của cha đó. Một dải KPI hay một hàng cột kanban thoả
 * ngay (6/6 con); còn div bọc layout rải rác trong cây thì gần như không bao giờ thoả.
 *
 * Khu vực trả về là CHÍNH NGƯỜI CHA — nó là cái "dải" / "bảng" mà người dùng nhìn thấy, còn các
 * anh em là mục bên trong. Nhờ vậy cột 0 thẻ vẫn hiện ra, dưới dạng một mục của khu vực bảng.
 */
const MIN_CHILD_RATIO = 0.5;

function siblingGroups() {
  const byParent = new Map(); // cha -> Map(chữ ký -> [el])
  let scanned = 0;

  for (const root of scanRoots()) {
    for (const el of root.querySelectorAll('div, section, article, li')) {
      if (scanned >= MAX_SCAN) break;
      scanned += 1;
      if (excluded(el) || !isVisible(el)) continue;
      if ((el.textContent || '').trim().length < MIN_CHARS_PER_ROW) continue;
      const sig = classSignature(el);
      if (!sig) continue;
      const parent = el.parentElement;
      if (!parent || excluded(parent)) continue;

      let m = byParent.get(parent);
      if (!m) { m = new Map(); byParent.set(parent, m); }
      if (!m.has(sig)) m.set(sig, []);
      m.get(sig).push(el);
    }
  }

  const out = [];
  for (const [parent, m] of byParent) {
    const childCount = parent.children?.length || 0;
    if (childCount < MIN_SIBLING_REPEATS) continue;
    for (const g of m.values()) {
      if (g.length < MIN_SIBLING_REPEATS) continue;
      /**
       * Nhóm 2 phần tử phải chiếm TRỌN số con của cha; nhóm từ 3 trở lên chỉ cần quá nửa.
       *
       * Hai phần tử trùng chữ ký class là chuyện xảy ra khắp nơi (hai nút cạnh nhau, hai ô của
       * một hàng). Đòi tỉ lệ 1.0 thì chỉ còn lại đúng hình dạng cần bắt: một cái hộp mà toàn bộ
       * nội dung của nó là hai mục cùng kiểu — cột kanban 2 thẻ chính là ca đó.
       */
      const threshold = g.length >= MIN_REPEATS ? MIN_CHILD_RATIO : 1;
      if (g.length / childCount < threshold) continue;
      out.push({ parent, items: g });
    }
  }
  return out;
}

/**
 * SỐ MỤC THẬT do giao diện tự khai, qua `data-guide-so-items`.
 *
 * Vì sao cần: bộ dò đếm phần tử DOM, mà danh sách ẢO HOÁ chỉ dựng phần lọt khung. Đã đo trên
 * /crm/dashboard — cột kanban 18 deal chỉ có 7 thẻ trong DOM (vùng cuộn 383px, thẻ 238px,
 * overscan 6). Con số đó còn đổi theo chiều cao cửa sổ và vị trí cuộn: cùng một cột, hai người
 * dùng nghe hai đáp án.
 *
 * Không có cách nào SUY RA tổng từ DOM khi phần còn lại chưa được dựng. Nên lối duy nhất đúng là
 * để giao diện khai ra — nơi duy nhất biết. Xem components/KanbanColumnVirtualList.jsx.
 *
 * Tìm cả trên chính khu vực lẫn trong nó: khu vực hay là tổ tiên chung của nhóm thẻ, còn thuộc
 * tính thì nằm trên đúng cái hộp chứa danh sách.
 */
function declaredItemCount(el) {
  /**
   * `Number(null)` LÀ 0, KHÔNG phải NaN. Bản đầu của hàm này viết
   * `Number(x?.getAttribute?.(...))` rồi kiểm `Number.isFinite` — phần tử KHÔNG có thuộc tính
   * cũng cho ra 0 và lọt qua như một lời khai hợp lệ. Đo được ngay: bảng kanban và dải KPI đều
   * báo `item_count=0` trong khi bên trong có 8 và 3 mục.
   */
  const read = (x) => {
    const raw = x?.getAttribute?.('data-guide-so-muc');
    if (raw === null || raw === undefined || raw === '') return null;
    const v = Number(raw);
    return Number.isFinite(v) && v >= 0 ? v : null;
  };

  const above = read(el);
  if (above !== null) return above;

  /**
   * Chỉ nhận khi bên trong có ĐÚNG MỘT lời khai.
   *
   * Khu vực cột kanban chính là phần tử mang thuộc tính → nhánh trên bắt được. Khu vực BẢNG thì
   * chứa 8 lời khai của 8 cột; lấy cái đầu tiên là gán số thẻ của cột 1 cho cả bảng — sai, và
   * sai một cách rất khó thấy. Nhiều lời khai nghĩa là vùng này là cái khung chứa nhiều danh
   * sách, tổng của chính nó chưa ai khai; quay về đếm DOM, mà với bảng thì đếm DOM ra 8 cột —
   * đúng luôn.
   */
  const list = el?.querySelectorAll?.('[data-guide-so-muc]');
  return list && list.length === 1 ? read(list[0]) : null;
}

/** `excludeSet` = các container của khu vực khác; dùng cho khu vực "còn lại" (xem doKhuVuc). */
function skipEl(el, excludeSet) {
  if (excluded(el) || !isVisible(el)) return true;
  /**
   * Liên kết `tel:` / `mailto:` / `sms:` / `download` KHÔNG phải nút giao diện — chúng là DỮ
   * LIỆU của bản ghi được vẽ dưới dạng link. `readClickables` của pageState đã loại từ lâu,
   * chỗ này thì chưa, và đã trả giá: hỏi "khu vực Chờ sale xác nhận có nút gì" thì lớp 2 trả
   * về một đống "0932 527 883", "0568792222"… Model phải tự suy luận để loại chúng ra — vừa
   * tốn bước, vừa là chỗ nó có thể suy sai. Tệ hơn: đó là số điện thoại khách hàng, tức lớp 2
   * đang tuồn PII qua ngả "danh sách nút".
   */
  if (el.matches?.(SIDE_EFFECT_LINK_SELECTOR)) return true;
  return !!excludeSet && excludeSet.some((c) => c.contains(el));
}

function countInside(container, selector, excludeSet) {
  let n = 0;
  for (const el of container.querySelectorAll(selector)) {
    if (skipEl(el, excludeSet)) continue;
    n += 1;
  }
  return n;
}

/**
 * Dò mọi khu vực trên màn hình. Trả về mảng bản ghi NỘI BỘ (có kèm phần tử DOM) — hàm công khai
 * `scanRegions()` mới là thứ cắt bỏ DOM để gửi lên model.
 */
function detectRegions() {
  const raw = [];

  // 1. Bảng — khu vực rõ ràng nhất, không cần đoán.
  for (const root of scanRoots()) {
    for (const t of root.querySelectorAll('table')) {
      if (excluded(t) || !isVisible(t)) continue;
      const rows = [...t.querySelectorAll('tbody tr')].filter((r) => isVisible(r));
      raw.push({ el: t, kind: 'table', items: rows });
    }
  }

  // 2. Nhóm dòng lặp lại BẤM ĐƯỢC → tổ tiên chung là khu vực.
  for (const group of repeatGroups()) {
    const c = commonAncestor(group);
    if (!c || excluded(c)) continue;
    raw.push({ el: c, kind: 'list', items: group });
  }

  /**
   * 2b. Nhóm ANH EM RUỘT không bấm được → chính người cha là khu vực.
   *
   * Đây là lối duy nhất thấy được dải thẻ KPI và HÀNG CỘT kanban. Đặt SAU lối 2 là cố ý: khử
   * trùng bên dưới giữ bản có NHIỀU MỤC hơn cho cùng một container, nên cột kanban có 29 thẻ
   * vẫn thắng bản "cột này là 1 mục của bảng" — bảng chỉ hiện ra như một khu vực riêng khi
   * người cha của các cột chưa bị lối nào khác nhận.
   */
  for (const { parent, items } of siblingGroups()) {
    raw.push({ el: parent, kind: 'strip', items });
  }

  /**
   * 2c. KHU VỰC DO GIAO DIỆN TỰ KHAI — `data-guide-khu-vuc="Tên khu vực"`.
   *
   * ═══════════ VÌ SAO PHẢI CÓ LỐI NÀY ═══════════
   *
   * Ba lối trên đều ĐOÁN theo hình dạng: nhóm phần tử anh em cùng chữ ký class, tối thiểu 2–3
   * cái. Đoán được phần lớn, nhưng hụt đúng những chỗ người dùng hay hỏi nhất:
   *
   *   · Cột kanban RỖNG hoặc chỉ có 1 thẻ — không đủ số lượng để thành nhóm, nên biến mất khỏi
   *     bản đồ. Đo trên /crm/dashboard: bảng có 8 cột mà bản đồ chỉ ra 4, và cột "Chuyển Deal."
   *     (0 thẻ) không bao giờ xuất hiện. Trợ lý trả lời "không có cột đó" rất chắc chắn.
   *   · Dải KPI: các thẻ đôi khi khác chữ ký class nhau nên nhóm bị vỡ.
   *
   * Không thể sửa bằng cách hạ ngưỡng: hạ nữa thì mọi cặp div trùng class thành khu vực, và
   * rác đông người sẽ đẩy khu vực thật ra khỏi trần 15.
   *
   * Nên: chỗ nào giao diện BIẾT nó là một khu vực thì cứ khai ra, khỏi để bộ dò đoán. Khai rồi
   * thì LUÔN có mặt, kể cả khi rỗng — `nameOf` vốn đã đọc thuộc tính này để đặt tên, giờ nó
   * quyết định luôn việc CÓ LÀ khu vực hay không.
   *
   * `items` lấy nhóm anh em ruột đông nhất bên trong: cột kanban khai trên gốc cột, còn thẻ nằm
   * sâu vài tầng. Không có nhóm nào thì để rỗng — khu vực rỗng vẫn là một khu vực.
   */
  for (const root of scanRoots()) {
    for (const el of root.querySelectorAll('[data-guide-khu-vuc]')) {
      if (excluded(el) || !isVisible(el)) continue;
      /**
       * MỤC DO TRANG TỰ KHAI — `data-guide-muc` trên từng mục, thắng phép đoán theo chữ ký class.
       *
       * Phép đoán gom các phần tử anh em CÙNG class, mà giao diện hay đổi class theo trạng thái:
       * ô ngày đang chọn thêm `ring-2`, ô hôm nay thêm nền xanh, ô đang được rê chuột tô vàng.
       * Đo trên /crm/events: lịch tháng 8 có 31 ngày mà nhóm đoán ra 28, và trợ lý nhận cảnh báo
       * "danh sách ảo hoá, chỉ dựng 28/31" — sai hoàn toàn, lịch không ảo hoá gì cả.
       *
       * Chỉ lấy mục thuộc ĐÚNG khu vực này (khu vực tự khai gần nhất bao nó là `el`), để khu vực cha
       * không nuốt mục của khu vực con cũng tự khai.
       */
      const marked = [...el.querySelectorAll('[data-guide-muc]')]
        .filter((x) => x.parentElement?.closest('[data-guide-khu-vuc]') === el && isVisible(x));
      let items = marked;
      if (!items.length) {
        for (const { parent, items: g } of siblingGroups()) {
          if (parent !== el && !el.contains(parent)) continue;
          if (g.length > items.length) items = g;
        }
      }
      raw.push({ el, kind: 'declared', items });
    }
  }

  // 3. Biểu mẫu.
  for (const root of scanRoots()) {
    for (const f of root.querySelectorAll('form')) {
      if (excluded(f) || !isVisible(f)) continue;
      raw.push({ el: f, kind: 'form', items: [] });
    }
  }

  /**
   * KHỬ TRÙNG: hai lối dò có thể trỏ về cùng một container, phải chọn một.
   *
   * Luật cũ là "giữ bản NHIỀU MỤC hơn", và nó chọn sai đúng ở chỗ quan trọng nhất. Bảng kanban
   * được nhận theo hai cách:
   *
   *   · lối dò dòng-lặp-lại  → muc = 54 THẺ (tổ tiên chung của mọi thẻ chính là bảng)
   *   · lối dò anh-em-ruột   → muc = 8 CỘT  (8 cột là con trực tiếp của bảng)
   *
   * 54 > 8 nên bảng lấy bản THẺ. Hai hậu quả đo được trên /crm/dashboard:
   *   1. `item_count` của bảng là 54 — một con số đúng nhưng vô nghĩa về kiến trúc; cái người dùng
   *      hỏi là "bảng có mấy cột".
   *   2. Vì `items` là các thẻ chứ không phải các cột, lá chắn trong `nameOf` — *tiêu đề nằm
   *      trong một mục thì bỏ qua* — không bắt được tiêu đề CỘT. Bảng cướp tên "Deal mới." của
   *      cột 1, rồi trùng tên với chính cột đó, và `findRegion` khớp tên chính xác lại trả về cái
   *      đầu tiên — hỏi "Deal mới." ra cả bảng 54 thẻ thay vì ra cột.
   *
   * Luật mới: bản nào có mục BAO TRÙM mục của bản kia thì bản đó THÔ HƠN, và thô hơn mới là
   * kiến trúc. Chỉ khi không bên nào bao trùm bên nào mới quay về đếm số mục.
   */
  const covers = (x, y) => y.items.length > 0
    && y.items.some((e) => x.items.some((m) => m !== e && m.contains(e)));

  const byEl = new Map();
  for (const r of raw) {
    const prev = byEl.get(r.el);
    if (!prev) { byEl.set(r.el, r); continue; }
    // Bản KHAI BÁO thắng mọi bản đoán trên cùng phần tử: nó mang tên thật do giao diện đặt.
    if (r.kind === 'declared' && prev.kind !== 'declared') { byEl.set(r.el, r); continue; }
    if (prev.kind === 'declared' && r.kind !== 'declared') continue;
    if (covers(r, prev)) byEl.set(r.el, r);        // r thô hơn → r thắng
    else if (covers(prev, r)) continue;              // cu thô hơn → giữ cu
    else if (r.items.length > prev.items.length) byEl.set(r.el, r);
  }

  const list = [...byEl.values()];

  // Quan hệ lồng nhau: giữ cả hai tầng nhưng GHI RÕ cái nào nằm trong cái nào. Cột kanban nằm
  // trong bảng kanban là thông tin có ích, xoá đi thì model mất luôn khái niệm phân cấp.
  const linkParents = () => {
    for (const a of list) {
      a.trongEl = null;
      for (const b of list) {
        if (a === b || !b.el.contains(a.el)) continue;
        if (!a.trongEl || a.trongEl.contains(b.el)) a.trongEl = b.el;
      }
    }
  };
  linkParents();

  /**
   * GỘP KHU VỰC ĐOÁN VÀO KHU VỰC TỰ KHAI BAO NGOÀI NÓ — khi nó không có danh tính riêng.
   *
   * Khai `data-guide-khu-vuc` cho một vùng là nói "vùng này là một khối, tên nó là X". Nhưng bộ dò
   * vẫn chạy bên trong và nhặt ra các dải/danh sách con, rồi đặt tên cho chúng bằng tiêu đề gần
   * nhất phía trên — mà tiêu đề gần nhất chính là tiêu đề của khu vực tự khai. Đo được hai ca:
   *
   *   · /crm/dashboard: cột "Báo giá." (tự khai) chứa dải thẻ cũng tên "Báo giá.". Gọi
   *     `read_region("Báo giá.")` luôn ra cột, dải con không bao giờ với tới được; dấu 🤖 trong
   *     bảng Hành động gắn vào cả hai; và 4 bản trùng chiếm 4 chỗ trong trần 15.
   *   · /crm/leads/:id: thẻ Khách hàng bị nhận hai lần cùng tên "Khách hàng"; khối deadline trong
   *     Thông tin thành "Khu vực 8 (không có tiêu đề)".
   *
   * Luật: khu vực ĐOÁN (không phải tự khai, không phải biểu mẫu) nằm trong một khu vực tự khai thì
   * bị gộp vào khi nó VÔ DANH hoặc TRÙNG TÊN với khu vực chứa nó. Gộp chứ không mất: khu vực cha
   * loại trừ khu vực con khỏi phần đọc sâu, nên bỏ con đi là nội dung của con quay về trong kết
   * quả đọc của cha — đầy đủ hơn, không phải ít hơn. Khu vực con có tên RIÊNG thì giữ nguyên.
   *
   * Thêm một ca gộp nữa: tên MƯỢN từ tiêu đề phía trên (`heading_above`). Bên trong một khu vực tự
   * khai, tiêu đề đứng trên một dải con gần như luôn là tiêu đề của chính khu vực đó hoặc của cả
   * khối, không phải danh tính riêng của dải. Đo trên /crm/events: vỏ "Feed sự kiện" đã khai, nhưng
   * dải thẻ bên trong mượn tiêu đề thành "Feed sự kiện(293 sự kiện)" — lệch đúng một số đếm nên luật
   * trùng tên không bắt được, và trang có hai khu vực cho cùng một feed. Dải con có tiêu đề BÊN
   * TRONG nó (`heading_inside`) hay `aria-label` riêng thì vẫn giữ.
   *
   * Biểu mẫu luôn giữ: một biểu mẫu biến mất là trợ lý không biết trang có chỗ nhập liệu.
   */
  const regionOfEl = new Map(list.map((r) => [r.el, r]));
  const nameCache = new Map();
  const naming = (r) => {
    if (!nameCache.has(r)) nameCache.set(r, nameOf(r.el, r.items, r.defaultName));
    return nameCache.get(r);
  };
  const nameFor = (r) => naming(r).name || '';
  const absorbed = new Set();
  for (const r of list) {
    if (r.kind === 'declared' || r.kind === 'form') continue;
    let owner = null;
    for (let p = r.trongEl; p; p = regionOfEl.get(p)?.trongEl) {
      const pr = regionOfEl.get(p);
      if (!pr) break;
      if (pr.kind === 'declared') { owner = pr; break; }
    }
    if (!owner) continue;
    const own = nameFor(r);
    const parent = regionOfEl.get(r.trongEl);
    const borrowed = naming(r).name_from === 'heading_above';
    if (!own || borrowed || own === nameFor(owner) || (parent && own === nameFor(parent))) absorbed.add(r);
  }
  if (absorbed.size) {
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (absorbed.has(list[i])) list.splice(i, 1);
    }
    linkParents(); // khu vực bị gộp có thể từng là cha của khu vực khác — nối lại quan hệ
  }

  /**
   * Xếp hạng HAI TẦNG. Tầng ngoài là LOẠI, tầng trong mới là số mục.
   *
   * Vì sao không xếp thuần theo số mục như trước: `form` luôn được đẩy vào với `items: []`
   * (xem lối dò 3), nên nó vĩnh viễn đứng cuối bảng và là thứ ĐẦU TIÊN rơi khỏi trần 15 trên
   * mọi trang đủ đông khu vực. Một biểu mẫu bị bỏ khỏi bản đồ là trợ lý không biết trang có chỗ
   * nhập liệu — hỏng nặng hơn hẳn việc thiếu một danh sách.
   *
   * Biểu mẫu thường chỉ 1–2 cái mỗi trang nên ưu tiên chúng tốn nhiều nhất 2 chỗ. Trong cùng
   * một loại thì vẫn nhiều mục lên trước — đó là thứ người dùng đang nhìn và hay hỏi nhất.
   */
  /**
   * Khu vực TỰ KHAI đứng đầu, rồi tới biểu mẫu, rồi phần còn lại.
   *
   * Khai báo là lời của người viết giao diện: "đây chắc chắn là một khu vực". Để nó rơi khỏi trần
   * 15 vì ít mục hơn một nhóm thẻ nào đó thì cả cơ chế khai báo thành vô nghĩa — đúng lúc nó
   * sinh ra để cứu những vùng ÍT mục (cột kanban rỗng).
   */
  const kindRank = (r) => {
    if (r.kind === 'declared') return 0;
    if (r.kind === 'form') return 1;
    return 2;
  };
  list.sort((x, y) => kindRank(x) - kindRank(y) || y.items.length - x.items.length);
  /**
   * TRẦN 15 CHỈ ÁP CHO KHU VỰC ĐOÁN — khu vực tự khai luôn có mặt (tối đa MAX_DECLARED).
   *
   * Trần 15 sinh ra để rác của bộ dò không làm phình ngữ cảnh. Khu vực tự khai thì không phải
   * rác: mỗi cái là một chỗ người viết giao diện đã chủ động đặt tên. Đếm trên /crm/dashboard sau
   * khi khai đủ thanh tab, tìm kiếm & bộ lọc, chế độ xem, KPI và bảng kanban: 15–16 khu vực tự khai,
   * trong đó 8 là cột kanban — trần chung sẽ cắt đúng những cột RỖNG (ít mục nhất), tức là quay lại
   * đúng lỗi "không có cột đó" mà khai báo sinh ra để chữa.
   */
  const declaredOut = list.filter((r) => r.kind === 'declared').slice(0, MAX_DECLARED);
  const guessedOut = list.filter((r) => r.kind !== 'declared')
    .slice(0, Math.max(0, MAX_REGIONS - 1 - declaredOut.length));
  const out = [...declaredOut, ...guessedOut];
  const trimmed = list.length - out.length;

  /**
   * KHU VỰC "CÒN LẠI" — mọi điều khiển/nút KHÔNG nằm trong khu vực nào ở trên.
   *
   * Bỏ mục này là bản đồ nói dối theo kiểu tệ nhất: đã đo trên /crm/customers, ba lối dò phía
   * trên chỉ ra ĐÚNG một khu vực (danh sách 999 khách), còn ô lọc công ty và nút "Thêm KH" thì
   * không thuộc khu vực nào — model nhìn bản đồ sẽ tưởng trang chỉ có mỗi danh sách.
   *
   * KHÔNG leo tìm tổ tiên chung cho đám còn lại: trên trang dựng phẳng, tổ tiên chung của chúng
   * là <main>, tức một "khu vực" bao trùm cả trang, vô nghĩa. Thay vào đó dùng chính <main> làm
   * container nhưng kèm `excludeSet` — mọi lần đọc sâu sẽ bỏ phần đã thuộc khu vực khác.
   */
  const root = scanRoots()[0];
  if (root) {
    const insideRegion = (el) => out.some((r) => r.el.contains(el));
    let remaining = 0;
    for (const el of root.querySelectorAll(`${CONTROL_SELECTOR}, ${CLICKABLE_SELECTOR}`)) {
      if (excluded(el) || !isVisible(el) || insideRegion(el)) continue;
      remaining += 1;
      if (remaining >= 3) break; // đủ để kết luận, không cần đếm hết
    }
    if (remaining >= 3) {
      out.unshift({
        el: root,
        kind: 'toolbar',
        items: [],
        excludeSet: out.map((r) => r.el),
        defaultName: 'Thanh công cụ & bộ lọc của trang',
      });
    }
  }

  /**
   * KHU VỰC CON TRỰC TIẾP của mỗi khu vực — nền của phép loại trừ ở CẢ HAI LỚP.
   *
   * Trước đây `excludeSet` chỉ được đặt cho đúng một khu vực (`toolbar`), nên mọi khu vực
   * khác đọc XUYÊN QUA con của nó. Hậu quả đo được trên dải cột kanban: `read_region` của dải
   * quét gộp cả 6 cột rồi `break` ở phần tử thứ 40 — trả về nút của cột đầu, hết, không một
   * dòng nào báo là đã cắt.
   *
   * TÍNH SAU KHI CẮT, cố ý. Loại trừ một khu vực đã bị bỏ khỏi bản đồ thì nội dung của nó không
   * còn lối nào đọc được nữa. `trongEl` thì tính trên danh sách ĐẦY ĐỦ, nên khu vực có cha bị
   * cắt sẽ không khớp `b.trongEl === a.el` của ông nó — tức nó vẫn đọc được từ tầng trên. Sai
   * số nghiêng về phía đọc thừa, không về phía mù.
   */
  for (const a of out) {
    a.conEl = out.filter((b) => b !== a && b.trongEl === a.el).map((b) => b.el);
  }

  return { list: out, trimmed };
}

/** Mọi thứ phải bỏ qua khi đọc bên trong khu vực `r`: khu vực khác (nếu có) + khu vực con. */
function excludeSetOf(r) {
  return [...(r.excludeSet || []), ...(r.conEl || [])];
}

/* ─────────────────────────── LỚP 1 ─────────────────────────── */

/**
 * Bản đồ khu vực — đẩy lên model MỖI LƯỢT. Chỉ kiến trúc, không nội dung.
 * @returns {{regions: Array, note: string}}
 */
export function scanRegions() {
  if (typeof document === 'undefined') return { regions: [], note: '' };

  const { list, trimmed } = detectRegions();
  // Rỗng là một TÍN HIỆU, không phải lỗi — system prompt đã dặn "bản đồ trống thì gọi read_page_state".
  if (list.length === 0) return { regions: [] };

  const idOfEl = new Map();
  list.forEach((r, i) => idOfEl.set(r.el, `kv${i + 1}`));

  let unnamed = 0;
  const regions = list.map((r, i) => {
    const { name, name_from } = nameOf(r.el, r.items, r.defaultName);
    const finalName = name || r.defaultName || '';
    if (!finalName) unnamed += 1;
    const item = {
      id: `kv${i + 1}`,
      name: finalName || `Khu vực ${i + 1} (không có tiêu đề)`,
      kind: r.kind,
    };
    if (!finalName) item.name_inferred = false;
    // `default` là tên cố định của khu vực "còn lại" — không phải đoán, đừng gắn cờ đoán.
    else if (name && !['declared', 'aria_label', 'default'].includes(name_from)) item.name_inferred = true;
    /**
     * `item_count` GIỮ NGUYÊN TÊN — chỉ dẫn hệ thống, bảng Hành động và tool đọc sâu đều đang trỏ
     * vào nó; đổi tên là hỏng ba chỗ để đổi lấy một chút rõ nghĩa.
     *
     * Thay vào đó là cờ `item_count_estimated`: có nghĩa "con số này chỉ đếm được phần DOM đang
     * dựng, giao diện chưa khai tổng thật". Trước đây không có cờ nào, và chỉ dẫn còn ghi
     * `item_count` là "con số THẬT" — nên trợ lý khẳng định cột có 7 deal trong khi tiêu đề ngay
     * trên đầu cột ghi 18.
     */
    const declaredCount = declaredItemCount(r.el);
    if (declaredCount !== null) {
      item.item_count = declaredCount;
      if (r.items.length && r.items.length !== declaredCount) item.items_rendered = r.items.length;
    } else if (r.items.length) {
      item.item_count = r.items.length;
      item.item_count_estimated = true;
    }
    /**
     * Đếm bằng CÙNG phép loại trừ mà lớp 2 sẽ dùng — nếu không, hai lớp nói hai con số khác nhau
     * về cùng một khu vực: bản đồ ghi `button_count: 87` (gộp cả 6 cột con) rồi `read_region` trả về 3
     * nút. Model không có cách nào biết cái nào đúng, và nó thường tin con số lớn hơn.
     */
    const skip = excludeSetOf(r);
    const controlsRead = countInside(r.el, CONTROL_SELECTOR, skip);
    if (controlsRead) item.control_count = controlsRead;
    const buttons = countInside(r.el, CLICKABLE_SELECTOR, skip);
    if (buttons) item.button_count = buttons;
    if (r.trongEl && idOfEl.has(r.trongEl)) item.inside = idOfEl.get(r.trongEl);
    return item;
  });

  /**
   * KHÔNG giải thích cách dùng bản đồ ở đây. Toàn bộ giao thức hai lớp đã nằm trong
   * `SYSTEM_PROMPT` (§ "Ngữ cảnh HAI LỚP") — thứ được PROMPT CACHE giữ lại. Nhắc lại ở readable
   * là trả tiền hai lần cho cùng một câu chữ, ở phần KHÔNG cache được, mỗi lượt hỏi.
   *
   * Đo được: bản đầu tiên của readable này tốn 870–930 ký tự, trong đó ~600 là chữ hướng dẫn
   * trùng lặp — tức 2/3 dung lượng không mang dữ liệu nào.
   *
   * Chỉ giữ lại ghi chú PHỤ THUỘC DỮ LIỆU (số vùng vô danh) — cái mà system prompt không thể
   * biết trước, và chỉ xuất hiện khi thật sự có.
   */
  const out = { regions };
  if (unnamed) out.unnamed_region_count = unnamed;
  /**
   * NÓI RA khi bản đồ đã bị cắt. Trần 15 vốn im lặng: model đọc 14 dòng và tin đó là toàn bộ
   * màn hình, rồi kết luận "trang không có khu vực nào tên X" — một câu sai mà nghe rất chắc.
   */
  if (trimmed > 0) {
    out.dropped_region_count = trimmed;
    out.note = `Màn hình còn ${trimmed} khu vực nữa không lọt vào bản đồ (trần ${MAX_REGIONS}).`
      + ' Không thấy vùng cần tìm ở đây thì gọi `read_page_state`, ĐỪNG kết luận là nó không tồn tại.';
  }
  return out;
}

/* ─────────────────────────── LỚP 2 ─────────────────────────── */

/* ─────────────────────── Lọc PII cho CHẾ ĐỘ ĐỌC ───────────────────────
 *
 * Lớp 2 trước đây trả `valueOfControl(el)` NGUYÊN VĂN ở CẢ HAI chế độ. Tài liệu thì ghi chế độ
 * đọc "lọc PII ở mọi đường" — hai thứ không khớp nhau, và cái lọt qua là thứ đắt nhất: giá trị
 * người dùng vừa gõ vào ô tìm kiếm, thường chính là tên khách hàng.
 *
 * Chế độ toàn quyền giữ nguyên KHÔNG lọc — đó là quyết định đã ghi rõ ở đầu pageState.js: nó chỉ
 * đọc đúng thứ người dùng đang tự nhìn trên màn hình của chính họ.
 *
 * BIẾT TRƯỚC GIỚI HẠN: `PII_PATTERNS` bắt theo MẪU (chữ số dài, @, tiền, mã LEAD/DEAL) nên nó
 * KHÔNG bắt được tên người trần trụi. Vì thế không dựa mình nó: ô nhập TỰ DO bị ẩn thẳng, không
 * cần xét mẫu — thứ người dùng tự gõ thì không đoán được nội dung, mà đoán sai ở đây là lộ thật.
 */

/** Ô mà nội dung do người dùng GÕ RA, không chọn từ danh sách app định sẵn. */
function isFreeTextInput(el) {
  const tag = el.tagName?.toLowerCase();
  if (tag === 'textarea') return true;
  if (el.getAttribute?.('contenteditable') === 'true') return true;
  if (tag !== 'input') return false;
  const kind = (el.type || 'text').toLowerCase();
  return ['text', 'search', 'tel', 'email', 'url', 'password'].includes(kind);
}

function isPiiFree(t) {
  return !PII_PATTERNS.some((re) => re.test(String(t || '')));
}

/** Giá trị hiển thị được ở chế độ đọc, hoặc chuỗi thay thế. `null` = bỏ hẳn mục. */
function safeValue(value, { freeText = false } = {}) {
  if (FULL_ACCESS) return value;
  if (!value) return value;
  if (freeText) return '(đã ẩn — ô nhập tự do)';
  return isPiiFree(value) ? value : '(đã ẩn)';
}

/**
 * Ba hàm đọc dưới đây trả `{ ds, total }` chứ không trả thẳng mảng.
 *
 * `total` là số phần tử HỢP LỆ tìm được trước khi cắt còn 40. Thiếu con số đó, việc cắt là im
 * lặng: model nhận 40 nút, không có gì báo còn 47 cái nữa, và nó kết luận "khu vực này không có
 * nút Xuất Excel". `read_page_state` đã làm đúng từ lâu (`nut_bam_duoc_tong`) — lớp 2 thì chưa.
 *
 * Vì `total` phải đếm hết nên KHÔNG được `break` sớm nữa; đổi thành ngừng ĐẨY VÀO `out` mà vẫn
 * chạy tiếp vòng lặp. Cái giá là quét trọn `querySelectorAll` của một khu vực — nhỏ, vì phạm vi
 * đã bó vào khu vực và đã trừ khu vực con.
 */
function readControlsIn(container, excludeSet) {
  const out = [];
  let total = 0;
  for (const el of container.querySelectorAll(CONTROL_SELECTOR)) {
    if (skipEl(el, excludeSet) || el.type === 'hidden') continue;
    const label = labelOfControl(el);
    const raw = valueOfControl(el);
    if (!label && !raw) continue;
    const value = safeValue(raw, { freeText: isFreeTextInput(el) });
    const item = { label: label || '(không nhãn)', value };
    if (el.tagName?.toLowerCase() === 'select') {
      const choices = [...el.options].slice(0, 20).map((o) => clean(o.textContent, 40));
      // Danh sách lựa chọn do app dựng, nhưng nội dung có thể là tên khách / mã hồ sơ.
      item.options = FULL_ACCESS ? choices : choices.filter(isPiiFree);
    }
    if (el.disabled) item.locked = true;
    total += 1;
    if (out.length < MAX_L2_CONTROLS) out.push(item);
  }
  return { list: out, total };
}

/**
 * Cặp NHÃN → GIÁ TRỊ dạng chữ thuần, gộp từ ba lối đọc đã có.
 *
 * Đây là lỗ thủng lớn nhất của lớp 2 cũ: `readControlsIn` chỉ quét
 * `input, select, textarea, [contenteditable], [role=combobox], [role=switch]`, nên mọi thông
 * tin hiển thị dạng CHỮ — trạng thái, ngày tạo, người phụ trách, tổng tiền — không nằm ở
 * `controls`, cũng không phải `buttons`, cũng không phải `items`. Chúng biến mất hoàn toàn khỏi
 * kết quả, và trợ lý trả lời "khu vực này không có thông tin đó" trong khi nó đang hiện rành
 * rành trên màn hình.
 */
function readFieldsIn(container, skip = null) {
  const out = [];
  const seen = new Set();
  const merged = [
    ...readFieldPairs(container, skip),
    ...readReadonlyPairs(container, skip),
    ...readInlineLabelValuePairs(container, skip),
  ];
  let total = 0;
  for (const c of merged) {
    const key = `${c.label}::${c.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // Cặp nhãn→giá trị là NỘI DUNG hiển thị, không phải cấu hình bộ lọc — chế độ đọc bỏ hẳn
    // cặp bẩn thay vì thay bằng "(đã ẩn)": một dòng "Điện thoại: (đã ẩn)" chẳng giúp gì.
    if (!FULL_ACCESS && !isPiiFree(c.value)) continue;
    total += 1;
    if (out.length < MAX_L2_FIELDS) out.push({ label: c.label, value: c.value });
  }
  return { list: out, total };
}

function readButtonsIn(container, excludeSet) {
  const out = [];
  const seen = new Set();
  for (const el of container.querySelectorAll(CLICKABLE_SELECTOR)) {
    if (skipEl(el, excludeSet)) continue;
    const label = clean(el.getAttribute('aria-label') || el.textContent || '', 40);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    if (out.length < MAX_L2_BUTTONS) out.push(label);
  }
  // `seen.size` là tổng nhãn KHÁC NHAU — đúng thứ cần đếm, vì `out` cũng đã khử trùng.
  return { list: out, total: seen.size };
}

/**
 * Khoan sâu vào ĐÚNG một khu vực.
 *
 * `ref` khớp theo thứ tự: id (`kv3`) → tên đúng y hệt → tên chứa chuỗi (không phân biệt hoa
 * thường). Không khớp thì trả về danh sách khu vực đang có để model chọn lại — KHÔNG đoán bừa
 * một khu vực gần đúng, vì đoán sai ở đây là trả lời sai về dữ liệu.
 *
 * `id` gán theo THỨ TỰ dò của lần quét NÀY, mà lớp 1 lại là ảnh chụp từ đầu lượt. Trang đổi
 * giữa chừng (bấm một nút, đổi tab) thì `kv3` có thể đã là khu vực khác — nên kết quả LUÔN kèm
 * `name` để model tự đối chiếu, và nên ưu tiên gọi bằng `name`.
 */
/**
 * Đổi một `ref` của model thành khu vực thật trên DOM.
 *
 * Tách riêng khỏi `readRegion` vì có HAI người dùng chung phép khớp này: tool đọc sâu (lớp 2) và
 * tool CHỈ TAY vào khu vực (`highlightByRegion` trong uiSpotlight.js). Để mỗi bên tự khớp lấy là
 * sẽ tới ngày trợ lý đọc đúng khu vực này rồi chỉ tay vào khu vực khác.
 *
 * @returns {{ok: true, idx, el, name, kind, r}|{ok: false, reason, available_regions}}
 */
export function findRegion(ref) {
  if (typeof document === 'undefined') return { ok: false, reason: 'no_dom' };

  const { list } = detectRegions();
  if (list.length === 0) return { ok: false, reason: 'no_regions' };

  const name = list.map((r) => nameOf(r.el, r.items, r.defaultName).name);
  const need = String(ref || '').trim();
  const lowestCommon = need.toLowerCase();

  let idx = -1;
  const mId = /^kv(\d+)$/i.exec(need);
  if (mId) idx = Number(mId[1]) - 1;
  if (idx < 0 || idx >= list.length) idx = name.findIndex((t) => t && t.toLowerCase() === lowestCommon);
  if (idx < 0) idx = name.findIndex((t) => t && t.toLowerCase().includes(lowestCommon) && lowestCommon.length >= 2);
  // Khớp NGƯỢC: model nói "Thông tin", tên vùng thật là "THÔNG TIN CHUNG". Nhánh trên chỉ bắt
  // được chiều tên-chứa-chỉ-định; chiều kia cũng thường đúng, miễn chuỗi model đưa đủ dài để
  // không khớp bừa.
  if (idx < 0 && lowestCommon.length >= 3) idx = name.findIndex((t) => t && lowestCommon.includes(t.toLowerCase()));

  if (idx < 0) {
    return {
      ok: false,
      reason: 'region_not_found',
      available_regions: list.map((r, i) => ({ id: `kv${i + 1}`, name: name[i] || `Khu vực ${i + 1}`, kind: r.kind })),
    };
  }

  return {
    ok: true,
    idx,
    r: list[idx],
    el: list[idx].el,
    name: name[idx] || `Khu vực ${idx + 1} (không có tiêu đề)`,
    kind: list[idx].kind,
    // `readRegion` cần cả hai để kể tên khu vực CON — thứ nó vừa cố ý loại khỏi phần đọc sâu.
    list,
    allNames: name,
  };
}

export function readRegion(ref, { include_items = true } = {}) {
  const found = findRegion(ref);
  if (!found.ok) {
    const out = { ok: false, reason: found.reason };
    if (found.available_regions) out.available_regions = found.available_regions;
    return out;
  }
  const { idx, r, name } = found;
  const out = {
    ok: true,
    id: `kv${idx + 1}`,
    name,
    kind: r.kind,
  };

  /**
   * PHÉP LOẠI TRỪ nay gồm CẢ KHU VỰC CON, không chỉ `r.excludeSet` của khu vực "còn lại".
   *
   * Đọc xuyên qua con là lỗi lặng lẽ nhất của lớp 2 cũ: đọc dải cột kanban thì `readButtonsIn` quét gộp
   * cả 6 cột, chạm trần 40 ở giữa cột đầu, và trả về một danh sách trông rất bình thường. Không
   * ai nhìn ra là sai, kể cả model.
   *
   * Bù lại bằng `child_regions` ở cuối: đã cắt con ra thì phải chỉ đường tới chúng, nếu không thì
   * chỉ là đổi kiểu mù này lấy kiểu mù khác.
   */
  const excludeSet = excludeSetOf(r);
  const skip = (el) => skipEl(el, excludeSet);

  const controlsRead = readControlsIn(r.el, excludeSet);
  out.controls = controlsRead.list;
  if (controlsRead.total > controlsRead.list.length) out.controls_total = controlsRead.total;

  const buttons = readButtonsIn(r.el, excludeSet);
  out.buttons = buttons.list;
  if (buttons.total > buttons.list.length) out.buttons_total = buttons.total;

  const fields = readFieldsIn(r.el, skip);
  if (fields.list.length) out.fields = fields.list;
  if (fields.total > fields.list.length) out.fields_total = fields.total;

  const tab = readActiveTabs(r.el, skip).filter((t) => FULL_ACCESS || isPiiFree(t));
  if (tab.length) out.active_tab = tab;

  /**
   * BẢNG. 54/157 trang trong hệ thống có `<table>`, và lớp 2 cũ không đọc lấy một ô: mỗi `<tr>`
   * bị `cardLabelCandidates` rút thành MỘT chuỗi rồi xếp vào `items`, mất sạch cột.
   *
   * Chế độ đọc chỉ lấy TIÊU ĐỀ CỘT và số dòng — đúng luật đang áp cho `items`: đếm được, không
   * đọc nội dung bản ghi. Tiêu đề cột là tên trường do app đặt, không phải dữ liệu khách hàng.
   */
  const table = readFirstTable(r.el, skip);
  if (table) {
    out.table = FULL_ACCESS
      ? table
      : {
        columns: table.columns,
        table_row_total: table.table_row_total,
        note: `Chế độ chỉ hướng dẫn: chỉ báo cột và SỐ DÒNG (${table.table_row_total}),`
          + ' không đọc nội dung từng dòng.',
      };
  }

  // Sổ nhãn đã dùng cho `items` — `lists` ở cuối hàm trừ theo sổ này. Khai ở ngoài vì hai
  // chỗ dùng nằm ở hai khối `if` khác nhau.
  const usedLabels = new Set();

  if (r.items.length) {
    const declaredCount = declaredItemCount(r.el);
    out.item_total = declaredCount !== null ? declaredCount : r.items.length;
    if (declaredCount === null) {
      out.item_count_estimated = true;
    } else if (declaredCount !== r.items.length) {
      out.items_rendered = r.items.length;
      out.virtualization_note = `Khu vực này có ${declaredCount} mục, nhưng giao diện chỉ DỰNG`
        + ` ${r.items.length} cái đang lọt khung (danh sách ảo hoá). Danh sách dưới đây là phần`
        + ' đang dựng, KHÔNG phải toàn bộ — câu hỏi "có bao nhiêu" thì lấy `item_total`.';
    }
    if (!include_items) {
      out.items_note = 'Không đọc nội dung mục vì `include_items: false`.';
    } else if (!FULL_ACCESS) {
      // Chế độ chỉ hướng dẫn: đếm được, không đọc được. Trợ lý vẫn nói được "khu vực này đang có
      // 512 thẻ" mà tên khách hàng không rời hệ thống.
      out.items_note = `Chế độ chỉ hướng dẫn: chỉ báo SỐ LƯỢNG (${out.item_total}), không đọc nội`
        + ' dung từng bản ghi. Hướng dẫn người dùng tự mở xem.';
    } else {
      /**
       * MỖI MỤC NHIỀU DÒNG. Bản cũ gọi `cardLabelCandidates(el).find(...)` — hàm đó gom sẵn tới 6
       * nhãn của một thẻ (tiêu đề, công ty, giá trị, ngày, người phụ trách) rồi `.find()` giữ
       * đúng MỘT và vứt phần còn lại. Dữ liệu đã nằm trong tay, bị bỏ ở dòng cuối cùng.
       *
       * Bỏ luôn `seen` toàn cục của bản cũ: nó dùng để chọn một nhãn PHÂN BIỆT được giữa các
       * mục, nhưng cái giá là hai bản ghi trùng tên thì bản thứ hai bị đẩy sang một nhãn khác
       * hoặc mất hẳn. Có nhiều dòng rồi thì không cần mẹo đó nữa, và hai thẻ giống nhau HIỆN
       * RA LÀ HAI — đúng thực tế màn hình.
       */
      const rowCount = r.items.length > FEW_ITEMS_THRESHOLD ? 2 : MAX_ROWS_PER_ITEM;
      const items = [];
      for (const el of r.items) {
        if (items.length >= MAX_L2_ITEMS) break;
        /**
         * Giá trị `data-guide-muc` (nếu có) đứng ĐẦU dòng: đó là danh tính của mục do trang đặt —
         * "Ngày 2/8" cho một ô lịch. Thiếu nó thì mục chỉ còn tên các sự kiện bên trong, và trợ lý
         * không biết sự kiện rơi vào ngày nào: số ngày vẽ bằng một `<span>` chỉ có chữ số, bộ gom
         * nhãn bỏ qua.
         */
        const head = String(el.getAttribute?.('data-guide-muc') || '').trim();
        const rows = [...(head ? [head] : []), ...cardLabelCandidates(el).filter((t) => t !== head)]
          .slice(0, rowCount + (head ? 1 : 0));
        if (!rows.length) continue;
        // Gom TỪNG nhãn vào sổ, không gom chuỗi đã ghép: `lists` bên dưới trừ theo nhãn lẻ.
        for (const d of rows) usedLabels.add(d);
        items.push(rows.join(' · '));
      }
      out.items = items;
      if (r.items.length > items.length) {
        out.items_note = `Giao diện đang dựng ${r.items.length} mục, danh sách trên chỉ là`
          + ` ${items.length} cái đầu — đừng kết luận số lượng từ danh sách đã cắt, hãy dùng`
          + ' `item_total`.';
      }
    }
  }

  /**
   * Danh sách CHỈ ĐỌC — mục KHÔNG bấm mở được. Tách khỏi `items` để trợ lý không đi bấm rồi báo
   * là đã mở.
   *
   * Tính SAU `items` và trừ đi phần đã có ở đó, cố ý. Hai lối dò chạy trên cùng một DOM và trên
   * khu vực dạng danh sách chúng hay trúng đúng một nhóm — đo được: cùng 4 mục hiện ở cả hai
   * trường. Lặp như vậy vừa tốn token hai lần vừa gợi ý sai rằng khu vực có 8 thứ.
   */
  if (FULL_ACCESS) {
    /**
     * TRỪ THEO NHÃN LẺ, không trừ theo chuỗi đã ghép.
     *
     * Phép trừ cũ so `lists` với chính phần tử của `ra.muc`. Nó đúng khi mỗi mục là MỘT
     * chuỗi; từ lúc mỗi mục thành "tên · mã · ngày · trạng thái" thì không còn khớp `"tên"` nữa,
     * và cùng một bản ghi hiện ở cả hai trường. Đã đo trên một cột kanban: 8/8 mục lặp lại y
     * nguyên — vừa tốn token hai lần vừa gợi ý sai rằng khu vực có 16 thứ, đúng cái bẫy mà phép
     * trừ này sinh ra để chặn.
     */
    const list = readDisplayList(r.el, skip).filter((t) => !usedLabels.has(t));
    if (list.length) out.lists = list;
  }

  /**
   * KHU VỰC CON — nửa còn lại của phép loại trừ ở đầu hàm.
   *
   * Vừa cắt con ra khỏi phần đọc sâu thì phải nói con nằm ở đâu, nếu không model đọc dải cột
   * kanban và thấy một khu vực gần như rỗng rồi kết luận trang không có gì. Có danh sách này nó
   * biết ngay bước tiếp theo là `read_region` vào đúng cột cần xem.
   */
  const child = (found.list || [])
    .map((x, i) => ({ x, i }))
    .filter(({ x }) => x !== r && x.trongEl === r.el)
    .map(({ x, i }) => {
      const m = { id: `kv${i + 1}`, name: found.allNames?.[i] || `Khu vực ${i + 1}`, kind: x.kind };
      if (x.items.length) m.item_count = x.items.length;
      return m;
    });
  if (child.length) {
    out.child_regions = child;
    out.child_note = `Khu vực này chứa ${child.length} khu vực con. Nội dung BÊN TRONG chúng KHÔNG`
      + ' nằm trong kết quả này — muốn xem thì gọi `read_region` với tên hoặc id của khu vực con.';
  }

  out.note = 'Đây là nội dung ĐANG hiển thị của riêng khu vực này theo bộ lọc hiện tại, không'
    + ' phải toàn hệ thống.';
  return out;
}
