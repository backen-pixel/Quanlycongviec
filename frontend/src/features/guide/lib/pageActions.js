/**
 * THAO TÁC THẬT trên trang — chỉ dùng ở CHẾ ĐỘ TOÀN QUYỀN (lib/guideAccess.js).
 *
 * Ba việc: bấm một nút, đặt giá trị một trường, cuộn tới một chỗ. Không có gì hơn — mọi nghiệp
 * vụ (lọc, lưu, xoá) đều là tổ hợp của ba việc đó, y như người dùng làm bằng chuột. Nhờ vậy
 * không phải viết tool riêng cho từng trong ~200 màn hình, và không bao giờ lệch với giao diện
 * thật vì mọi thứ đi qua đúng event handler mà React đã gắn.
 *
 * VÌ SAO KHÔNG gán `el.value = x`:
 * React ghi đè property `value` trên instance của input để theo dõi thay đổi. Gán trực tiếp thì
 * DOM đổi nhưng React KHÔNG thấy — state vẫn giá trị cũ, và ngay lần render sau ô nhập bị đặt
 * về giá trị cũ. Phải gọi SETTER GỐC trên prototype (`HTMLInputElement.prototype.value`) rồi
 * mới phát event `input`/`change`; lúc đó React đọc được giá trị mới và cập nhật state thật.
 * `el.click()` thì dùng được trực tiếp — nó phát MouseEvent có bubbles nên listener uỷ quyền ở
 * gốc của React vẫn nhận.
 *
 * Mọi hàm ở đây TRẢ VỀ object mô tả kết quả, KHÔNG ném lỗi, và khi thất bại thì kèm danh sách
 * nhãn đang có trên màn hình để model tự sửa ở lượt sau thay vì đoán mò.
 */

import {
  scanRoots,
  isVisible,
  labelOfControl,
  labelOfCard,
  valueOfControl,
  readOpenableCards,
  openableCardEls,
  fold,
  SIDE_EFFECT_LINK_SELECTOR,
} from './pageState';
import { EXCLUDE_SELECTOR } from './pageStructureScanner';
import { waitForPageReady, waitNote } from './pageReady';

const CLICKABLE_SELECTOR = 'button, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="option"], summary, label';
const CONTROL_SELECTOR = 'input, select, textarea, [contenteditable="true"], [role="switch"]';

// Sau khi bấm/điền/điều hướng, trang còn gọi API. KHÔNG chờ cứng nữa — chờ theo tín hiệu
// (lib/pageReady.js), chỉ giữ mức tối thiểu để React kịp bắt đầu render và chặn trên để không
// treo lượt chat. Bấm/điền thường chỉ nạp lại một phần nên chặn trên thấp hơn điều hướng.
const CLICK_MIN_MS = 350;
const CLICK_MAX_MS = 6000;
const FILL_MIN_MS = 300;
const FILL_MAX_MS = 6000;
const NAV_MIN_MS = 800;
const NAV_MAX_MS = 12000;
const MAX_HINTS = 25;

const TRUTHY = new Set(['có', 'co', 'true', '1', 'bật', 'bat', 'yes', 'on', 'tích', 'tich']);
const FALSY = new Set(['không', 'khong', 'false', '0', 'tắt', 'tat', 'no', 'off', 'bỏ tích', 'bo tich']);

function clean(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

function excluded(el) {
  return !!el.closest(EXCLUDE_SELECTOR);
}

function labelOfClickable(el) {
  return clean(el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent);
}

/**
 * Khớp nhãn theo 3 mức, dừng ở mức đầu tiên có kết quả: bằng nhau → bắt đầu bằng → chứa.
 * Trong cùng một mức, chọn nhãn NGẮN NHẤT: trên trang thật, "Xoá" và "Xoá tất cả bộ lọc" đều
 * chứa "Xoá" — chọn ngắn nhất là chọn cái sát ý nhất, không phải cái ngẫu nhiên gặp trước.
 */
function pickByLabel(candidates, wanted) {
  const target = fold(wanted);
  if (!target) return null;

  const tiers = [[], [], []];
  for (const { el, label } of candidates) {
    const f = fold(label);
    if (!f) continue;
    if (f === target) tiers[0].push({ el, label });
    else if (f.startsWith(target)) tiers[1].push({ el, label });
    else if (f.includes(target)) tiers[2].push({ el, label });
  }

  for (const tier of tiers) {
    if (!tier.length) continue;
    tier.sort((a, b) => a.label.length - b.label.length);
    return tier[0];
  }
  return null;
}

function collect(selector, labelFn, { skipSideEffects = false } = {}) {
  const out = [];
  for (const root of scanRoots()) {
    for (const el of root.querySelectorAll(selector)) {
      if (excluded(el) || !isVisible(el)) continue;
      if (skipSideEffects && el.matches(SIDE_EFFECT_LINK_SELECTOR)) continue;
      const label = labelFn(el);
      if (label) out.push({ el, label });
    }
  }
  return out;
}

/**
 * Ứng viên cho `click_element`: nút/tab/link ĐÃ LỌC liên kết gây tác dụng phụ, CỘNG thêm thẻ/dòng bản
 * ghi bấm được (thẻ kanban, dòng bảng). Không có nhóm thứ hai thì không có cách nào mở chi tiết
 * một lead — đã đo: thẻ lead là `<div draggable onClick>`, không khớp selector nút nào.
 *
 * Thẻ đứng SAU nút trong danh sách: khi cả nút và thẻ cùng khớp một nhãn thì nút thường là ý
 * người dùng muốn hơn, và `pickByLabel` chọn nhãn ngắn nhất trong cùng bậc nên thứ tự chỉ quyết
 * định khi độ dài bằng nhau.
 */
function collectClickTargets() {
  const button = collect(CLICKABLE_SELECTOR, labelOfClickable, { skipSideEffects: true });
  // Dùng CHUNG một nguồn với `read_page_state`: thứ trợ lý ĐỌC được phải là thứ nó BẤM được.
  // Trước đây hai chỗ có selector riêng, nên trang danh sách khách hàng (div cursor-pointer
  // thuần) vừa không đọc được vừa không bấm được — xem ghi chú ở findRepeatedRows().
  const the = [];
  for (const el of openableCardEls()) {
    const label = labelOfCard(el);
    if (label) the.push({ el, label });
  }
  return button.concat(the);
}

function hints(candidates) {
  const seen = [];
  for (const { label } of candidates) {
    if (!seen.includes(label)) seen.push(label);
    if (seen.length >= MAX_HINTS) break;
  }
  return seen;
}

/** ── Chặn nhãn giống số điện thoại ────────────────────────────────────────────────────── */

const PHONE_MIN_DIGITS = 8;
// So trên chuỗi ĐÃ `fold()` (bỏ dấu) nên viết không dấu: "gọi" → "goi".
const CALL_WORDS_RE = /(goi|call|tel|sdt|phone|zalo|nhan|sms|mobile|didong)/g;
const MIN_CHARS_LEFT = 3;

/**
 * Lớp chặn THỨ HAI cho việc bấm vào số điện thoại.
 *
 * Lớp thứ nhất là `SIDE_EFFECT_LINK_SELECTOR` — loại thẻ `<a href="tel:">` khỏi ứng viên. Lớp
 * này chặn ngay ở THAM SỐ: model vẫn có thể tự gõ "0909780606" (đúng ca đã xảy ra khi nhờ "mở 1
 * lead"), và nếu trang có một nút khác vô tình khớp thì cú bấm vẫn xảy ra.
 *
 * Chỉ chặn khi CHỮ SỐ CHIẾM GẦN HẾT nhãn, không chặn mọi nhãn có số:
 *   "0909780606", "+84 909 780 606", "Gọi 0909780606"  → CHẶN
 *   "Tủ bếp Chị Hoa 0908123456"                        → cho qua (tiêu đề lead có kèm SĐT là
 *                                                        chuyện thường, người dùng vẫn muốn mở)
 *   "LEAD-6677", "Quá 17 ngày 13 giờ"                  → cho qua (chỉ 4 chữ số)
 * Đánh đổi đã nhận: nhãn kiểu "Mã 1234567890" (chữ còn lại < 3 ký tự) sẽ bị chặn oan — hiếm, và
 * kết quả trả về nói rõ lý do nên model sửa được ngay ở lượt sau.
 */
function looksLikePhoneLabel(label) {
  const s = String(label || '');
  const digitCount = s.replace(/\D/g, '').length;
  if (digitCount < PHONE_MIN_DIGITS) return false;
  const charsLeft = fold(s)
    .replace(/[\d\s.+()\-_/]/g, '')
    .replace(CALL_WORDS_RE, '');
  return charsLeft.length < MIN_CHARS_LEFT;
}

/** ── Bấm ─────────────────────────────────────────────────────────────────────────────── */

export async function clickByLabel(label) {
  if (looksLikePhoneLabel(label)) {
    return {
      ok: false,
      reason: 'label_looks_like_phone',
      openable_cards: readOpenableCards().map((c) => c.title).slice(0, MAX_HINTS),
      note: `Từ chối bấm: nhãn "${label}" trông như một số điện thoại. Bấm vào số điện thoại là`
        + ' GỌI ĐIỆN cho khách hàng, không phải mở chi tiết bản ghi. Muốn mở một lead/deal thì'
        + ' truyền TIÊU ĐỀ của thẻ — chọn một tên trong `openable_cards`.',
    };
  }
  return clickByLabelUnguarded(label);
}

async function clickByLabelUnguarded(label) {
  const candidates = collectClickTargets();
  const hit = pickByLabel(candidates, label);
  if (!hit) {
    return {
      ok: false,
      reason: 'label_not_found',
      visible: hints(candidates),
      openable_cards: readOpenableCards().map((c) => c.title).slice(0, MAX_HINTS),
      note: 'Không có nút/tab/thẻ nào khớp nhãn đó trên màn hình hiện tại. Chọn một nhãn trong'
        + ' `visible` hoặc một tiêu đề trong `openable_cards` (thẻ lead/deal, dòng bảng — bấm vào là'
        + ' mở chi tiết), hoặc điều hướng tới trang khác trước.',
    };
  }

  const { el, label: found } = hit;
  if (el.disabled || el.getAttribute('aria-disabled') === 'true') {
    return { ok: false, reason: 'button_locked', matched: found };
  }

  try {
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
  } catch { /* behavior: 'instant' không được hỗ trợ ở vài bản Safari */ }

  el.click();
  // Bấm có thể điều hướng, mở panel, hoặc nạp lại danh sách — đều cần chờ xong mới đọc tiếp.
  const waited = await waitForPageReady({ minMs: CLICK_MIN_MS, maxMs: CLICK_MAX_MS });
  return {
    ok: true,
    clicked: found,
    page_wait: waited,
    // KHÔNG giục `read_page_state` ở đây nữa. Bấm xong đọc ngay là thói quen tốn nhất: mỗi lần đọc là
    // thêm một vòng gọi model kèm một khối suy luận, mà phần lớn lần bấm không cần biết gì thêm.
    // Chỉ nhắc đọc khi bấm này MỞ RA thứ chưa biết (panel/trang mới) — lúc đó model thật sự cần
    // danh sách trường/nút mới quyết được bước sau.
    note: `Đã bấm thật. ${waitNote(waited)} Chỉ gọi \`read_page_state\` nếu vừa mở panel/trang mới và`
      + ' cần biết trong đó có gì; còn lại thì làm tiếp rồi đọc MỘT LẦN ở cuối.',
  };
}

/** ── Điền / chọn ──────────────────────────────────────────────────────────────────────── */

function setNativeValue(el, value) {
  const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
  if (desc?.set) desc.set.call(el, value);
  else el.value = value;
}

function fireInputEvents(el) {
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function setSelect(el, wanted) {
  const options = [...el.options].map((o) => ({ o, text: clean(o.textContent) }));
  const hit = pickByLabel(options.map(({ o, text }) => ({ el: o, label: text })), wanted)
    // Cho phép truyền thẳng `value` (id) — model đôi khi đọc được id từ kết quả tool khác.
    || options.filter(({ o }) => fold(o.value) === fold(wanted)).map(({ o, text }) => ({ el: o, label: text }))[0];

  if (!hit) {
    return {
      ok: false,
      reason: 'no_matching_option',
      available_options: options.map(({ text }) => text).slice(0, MAX_HINTS),
    };
  }

  setNativeValue(el, hit.el.value);
  fireInputEvents(el);
  return { ok: true, selected: hit.label };
}

function setToggle(el, wanted) {
  const f = fold(wanted);
  let desired;
  if (TRUTHY.has(f)) desired = true;
  else if (FALSY.has(f)) desired = false;
  else return { ok: false, reason: 'invalid_value', note: 'Dùng "có" hoặc "không".' };

  const current = el.type === 'checkbox' || el.type === 'radio'
    ? el.checked
    : el.getAttribute('aria-checked') === 'true';

  // Bấm thay vì gán `checked`: React theo dõi checkbox qua event, và nhiều nơi còn gắn logic
  // phụ vào onClick (mở panel con, gọi API) — bấm mới chạy đủ.
  if (current !== desired) el.click();
  return { ok: true, set_to: desired ? 'có' : 'không', changed: current !== desired };
}

export async function setFieldByLabel(label, value) {
  const candidates = collect(CONTROL_SELECTOR, labelOfControl);
  const hit = pickByLabel(candidates, label);
  if (!hit) {
    return {
      ok: false,
      reason: 'field_not_found',
      available_fields: hints(candidates),
      // Ca thất bại thường gặp NHẤT, đã đo trên /crm/dashboard: ô chọn công ty nằm trong panel
      // bộ lọc đang ĐÓNG nên không tồn tại trong DOM. Nếu không nói ra ở đây, model đọc chip
      // "Công ty: …" trên thanh lọc rồi kết luận sai là "trường này chỉ đọc, không đổi được"
      // và dừng lại — đúng ca đã tái hiện.
      note: 'Không có trường nào khớp nhãn đó ĐANG MỞ trên màn hình. Rất có thể nó nằm trong'
        + ' panel/hộp thoại chưa mở: hãy `click_element` để mở panel tương ứng (VD nút "Bộ lọc") rồi gọi'
        + ' lại `fill_field`. Đừng kết luận trường đó chỉ đọc, và đừng hỏi xin phép bấm.',
    };
  }

  const { el, label: found } = hit;
  if (el.disabled || el.readOnly) {
    return { ok: false, reason: 'field_locked', matched: label };
  }

  try {
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
  } catch { /* ignore */ }

  const tag = el.tagName.toLowerCase();
  const text = String(value ?? '');
  let result;

  if (tag === 'select') {
    result = setSelect(el, text);
  } else if (el.type === 'checkbox' || el.type === 'radio' || el.getAttribute('role') === 'switch') {
    result = setToggle(el, text);
  } else if (el.isContentEditable) {
    el.focus();
    el.textContent = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    result = { ok: true, entered: text };
  } else {
    el.focus();
    setNativeValue(el, text);
    fireInputEvents(el);
    result = { ok: true, entered: text };
  }

  if (!result.ok) return { ...result, field: label };

  /**
   * TRÌNH DUYỆT TỪ CHỐI GIÁ TRỊ TRONG IM LẶNG — phải bắt, không được báo "đã điền".
   *
   * `<input type="date">` chỉ nhận đúng `yyyy-mm-dd`. Gán "20/09/2026" vào nó KHÔNG ném lỗi:
   * thuộc tính `text` lặng lẽ thành chuỗi rỗng. Bản trước vẫn trả `ok: true` kèm
   * `entered: "20/09/2026"`, nên trợ lý tin là đã điền xong và đi tiếp tới nút Gửi — đơn nghỉ
   * không có ngày. Cùng chuyện với `type="number"` khi model gửi "50.000.000".
   *
   * Ta đã đọc lại `valueOfControl` để báo cáo; chỉ cần biến nó thành ĐIỀU KIỆN thay vì một
   * trường thông tin, kèm câu chỉ đúng định dạng để lượt sau sửa được ngay.
   */
  const kind = (el.type || '').toLowerCase();
  const FORMAT_PICKY_KINDS = {
    date: 'yyyy-mm-dd, ví dụ "2026-09-20"',
    'datetime-local': 'yyyy-mm-ddThh:mm, ví dụ "2026-09-20T14:30"',
    time: 'hh:mm 24 giờ, ví dụ "14:30"',
    month: 'yyyy-mm, ví dụ "2026-09"',
    week: 'yyyy-Www, ví dụ "2026-W38"',
    number: 'chỉ chữ số, không dấu phân cách nghìn — "50000000" chứ không phải "50.000.000"',
  };
  if (tag === 'input' && text && FORMAT_PICKY_KINDS[kind] && !valueOfControl(el)) {
    return {
      ok: false,
      reason: 'bad_format',
      field: label,
      field_type: kind,
      submitted: text,
      note: `Ô này kiểu "${kind}" và trình duyệt đã BỎ giá trị vừa gửi — ô đang rỗng, chưa`
        + ` điền được gì. Gửi lại đúng định dạng ${FORMAT_PICKY_KINDS[kind]}.`,
    };
  }

  // Đổi bộ lọc gần như luôn kéo theo một loạt request — chờ xong mới báo, để lượt sau đọc được
  // số liệu MỚI chứ không phải số cũ còn trên màn hình.
  const waited = await waitForPageReady({ minMs: FILL_MIN_MS, maxMs: FILL_MAX_MS });
  return {
    ...result,
    field: label,
    // Đọc lại từ DOM: nếu trang tự chuẩn hoá/từ chối giá trị (VD ô số, ô ngày) thì phải báo
    // đúng cái đang nằm trên màn hình, không phải cái vừa gửi vào.
    current_value: valueOfControl(el),
    page_wait: waited,
    note: waitNote(waited),
  };
}

/** ── Chờ sau điều hướng ───────────────────────────────────────────────────────────────── */

/**
 * Trang mới còn nạp dữ liệu bất đồng bộ. Chặn trên cao hơn bấm/điền (12s) vì điều hướng là nạp
 * lại CẢ trang: route lazy-load chunk, rồi mới gọi API danh sách.
 */
export function waitAfterNavigate() {
  return waitForPageReady({ minMs: NAV_MIN_MS, maxMs: NAV_MAX_MS });
}
