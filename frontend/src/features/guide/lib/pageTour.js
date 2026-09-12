/**
 * Nối trợ lý với HƯỚNG DẪN CÓ SẴN TRONG GIAO DIỆN (product tour).
 *
 * Hệ thống đã có tour từng bước cho vài màn hình chính — nút "Hướng dẫn chi tiết" trên trang
 * chi tiết Lead/Deal mở một tour 52 bước, mỗi bước tô sáng đúng phần tử và giải thích nó. Đó là
 * hướng dẫn do CHÍNH NGƯỜI LÀM RA SẢN PHẨM viết, bám sát giao diện thật.
 *
 * Trước file này, trợ lý không biết tour tồn tại: người dùng hỏi "thanh tiêu đề hồ sơ để làm
 * gì" thì nó tự mô tả lại màn hình bằng lời — dài hơn, dễ sai hơn, và bỏ phí thứ tốt hơn đang
 * nằm sẵn cách một cú bấm.
 *
 * BA QUYẾT ĐỊNH:
 *
 * 1. Mở bằng SỰ KIỆN, không bấm nút. `ProductTourProvider` (mount toàn app ở App.jsx) nghe
 *    `product-tour:start` với `{ id, startIndex }`. Đi đường này thì tour mở được ở MỌI trang
 *    có tour, kể cả trang không vẽ nút "Hướng dẫn chi tiết", và mở được ĐÚNG BƯỚC — thứ mà bấm
 *    nút không làm được (bấm nút luôn vào bước đầu).
 *
 * 2. Ngữ cảnh đẩy mỗi lượt chỉ mang TÊN TOUR + SỐ BƯỚC, không mang danh sách 52 tiêu đề bước.
 *    Cùng nguyên tắc hai lớp ở pageRegions.js: biết cái gì tồn tại thì đẩy, chi tiết thì kéo.
 *    Đo được: tiêu đề của riêng tour Lead/Deal đã là ~1.100 ký tự — đắt hơn cả bản đồ khu vực.
 *
 * 3. Khớp bước bằng TỪ KHOÁ, làm ở tool chứ không ở model. Model chỉ truyền lại điều người dùng
 *    hỏi; tool bỏ dấu rồi dò trong tiêu đề bước. Không khớp thì trả về danh sách tiêu đề để
 *    model chọn lại — vẫn rẻ, vì chỉ trả khi thật sự cần.
 */

import { TOURS, resolveTourStartIndex } from '../../../lib/productTour/tours';
import { fold } from './pageState';
import { setTempLine } from './openGuide';

/**
 * Gán tay cho những trang mà dữ liệu tour KHÔNG tự phân biệt được.
 *
 * Đã đo: cả 5 tour đều khai `waitForPath: '/crm'` ở ít nhất một bước — `/crm` là prefix
 * BẮT-TẤT. Nên luật "prefix khớp dài nhất" trên `/crm/dashboard` hay `/crm/customers` sẽ hoà
 * điểm giữa 5 tour và rơi vào tour khai TRƯỚC, tức chọn theo thứ tự trong file — chọn bừa.
 * Mở nhầm tour thì các bước trỏ vào phần tử không tồn tại, tour hiện trạng thái "mất mục tiêu".
 *
 * Ở đây chỉ liệt kê các ca nhập nhằng. Tour nào khai path riêng (`/crm/events`,
 * `/crm/assignments`, `/crm/leads`) thì luật tự động bên dưới lo, không cần thêm vào bảng.
 */
const HAND_ANCHORS = [
  ['/crm/dashboard', 'crm-familiar'],
];

/**
 * Tour đang mở có phải do TRỢ LÝ mở không.
 *
 * Cần phân biệt vì tour của sản phẩm được thiết kế để ĐI XUYÊN NHIỀU TRANG — các bước khai
 * `waitForPath` riêng — nên đóng tour ở mọi lần đổi route là phá đúng cái tính năng đó. Thứ hỏng
 * là ca khác: trợ lý mở tour ở màn hình này, rồi vì một việc KHÔNG liên quan mà `navigate_to_page`
 * kéo người dùng sang màn hình khác. Tour ở lại, trỏ vào phần tử không còn tồn tại, và hiện
 * "Không tìm thấy vị trí trên màn hình" — đã thấy đúng như vậy khi tour bước 9/32 của Dashboard
 * CRM còn treo trên /crm/reports.
 *
 * Nên chỉ đóng tour NÀO DO TRỢ LÝ MỞ, và chỉ khi chính trợ lý điều hướng đi.
 */
let openedByGuide = false;

/** Trợ lý sắp chuyển trang: dẹp tour do chính nó mở. Tour người dùng tự mở thì không đụng tới. */
export function closeGuideTour() {
  if (!openedByGuide) return false;
  openedByGuide = false;
  window.dispatchEvent(new CustomEvent('product-tour:stop'));
  return true;
}

/** Số đoạn của một prefix: '/crm' → 1, '/crm/leads' → 2. */
function segmentCount(p) {
  return String(p || '').split('/').filter(Boolean).length;
}

/**
 * Tour nào gắn với path này?
 *  1. Bảng gán tay.
 *  2. Bước có `waitForPath` khớp và ĐỦ CỤ THỂ (≥2 đoạn) — dài nhất thắng.
 *
 * Không khớp gì thì trả `null`: thà nói "trang này chưa có hướng dẫn" còn hơn mở một tour lạc
 * đề rồi để người dùng bấm qua 30 bước không liên quan.
 */
function findTour(pathname) {
  const path = String(pathname || '');

  for (const [tienTo, id] of HAND_ANCHORS) {
    if (path.startsWith(tienTo) && TOURS[id]?.steps?.length) return { id, def: TOURS[id] };
  }

  let best = null;
  let bestLen = -1;
  for (const [id, def] of Object.entries(TOURS)) {
    if (!def?.steps?.length) continue;
    for (const s of def.steps) {
      if (!s.waitForPath) continue;
      const prefixes = Array.isArray(s.waitForPath) ? s.waitForPath : [s.waitForPath];
      for (const p of prefixes) {
        if (!p || !path.startsWith(p) || segmentCount(p) < 2) continue;
        if (String(p).length > bestLen) {
          bestLen = String(p).length;
          best = { id, def };
        }
      }
    }
  }
  return best;
}

/**
 * LỚP 1 — gộp vào readable "Màn hình người dùng đang xem", KHÔNG thêm readable mới.
 *
 * Thêm readable riêng là tốn thêm phần `description` (~70 ký tự) ở MỌI lượt, kể cả những trang
 * không có tour. Gộp vào readable sẵn có thì trang không có tour tốn đúng 0 ký tự.
 */
export function tourForPath(pathname) {
  const t = findTour(pathname);
  if (!t) return undefined;
  return {
    id: t.id,
    name: t.def.title,
    step_count: t.def.steps.length,
    note: 'Màn hình này CÓ hướng dẫn từng bước dựng sẵn trong giao diện. Người dùng hỏi cách'
      + ' dùng thì gọi `open_page_tour` trước khi tự mô tả.',
  };
}

const MAX_TITLES_RETURNED = 60;

/**
 * Nói trước bao lâu rồi mới bật tour.
 *
 * Không phải hiệu ứng cho đẹp. Tour là một LỚP PHỦ trùm lên trang: bật ra không báo trước thì
 * người dùng đang nhìn dở việc của mình bỗng bị che, và không hiểu vì sao. Một câu ngắn kèm TÊN
 * BƯỚC sắp mở là đủ để họ biết chuyện gì đang xảy ra và đó có đúng thứ mình hỏi không.
 *
 * 1,1 giây: đủ đọc một dòng ngắn, chưa đủ để thấy chậm. Đây cũng là 1,1 giây cộng thêm vào lượt
 * chạy của model, nên không nới rộng hơn.
 */
const MOUNT_WAIT_MS = 1100;

/**
 * LỚP 2 — mở tour, cố gắng vào ĐÚNG bước liên quan tới câu hỏi.
 *
 * Thứ tự chọn bước:
 *  1. `keyword` khớp tiêu đề bước (bỏ dấu, khớp một phần) — khớp NHIỀU bước thì lấy bước đầu.
 *  2. Không có `keyword` hoặc không khớp → bước đầu tiên gắn với path hiện tại
 *     (`resolveTourStartIndex`), tức chỗ người dùng đang đứng, không phải bước 1 của cả tour.
 */
export async function openTour(keyword, { pathname } = {}) {
  if (typeof window === 'undefined') return { ok: false, reason: 'no_dom' };

  const path = pathname || window.location?.pathname || '';
  const t = findTour(path);
  if (!t) {
    return {
      ok: false,
      reason: 'no_tour_on_page',
      note: 'Màn hình này chưa có hướng dẫn dựng sẵn. Hãy tự hướng dẫn bằng lời, hoặc dùng'
        + ' `search_knowledge_base`.',
    };
  }

  const { id, def } = t;
  const titles = def.steps.map((s) => String(s.title || ''));

  let idx = -1;
  const need = fold(keyword || '');
  if (need.length >= 2) idx = titles.findIndex((x) => fold(x).includes(need));

  const keywordMatched = idx >= 0;
  if (!keywordMatched) idx = resolveTourStartIndex(id, path);

  // Nói trước — xem CHO_NOI_MS. Câu thoại nêu ĐÚNG TÊN BƯỚC sắp mở, để người dùng đối chiếu
  // được ngay với điều mình vừa hỏi.
  const stepName = titles[idx] || def.title;
  setTempLine({
    text: `Để ta mở chỉ dẫn “${stepName}” cho ngươi…`,
    state: 'answering',
    ms: MOUNT_WAIT_MS + 900,
  });
  await new Promise((r) => { setTimeout(r, MOUNT_WAIT_MS); });

  window.dispatchEvent(new CustomEvent('product-tour:start', {
    detail: { id, startIndex: idx },
  }));
  openedByGuide = true;

  const out = {
    ok: true,
    tour: def.title,
    step: idx + 1,
    total_steps: def.steps.length,
    step_name: titles[idx] || '',
    matched_keyword: keywordMatched,
    note: 'Đã mở hướng dẫn ngay trên màn hình người dùng. Nói NGẮN GỌN là đã mở tới bước nào'
      + ' và bảo họ bấm "Tiếp" để đi tiếp — ĐỪNG chép lại nội dung từng bước.',
  };

  // Không khớp từ khoá thì đưa danh sách tiêu đề để model gọi lại cho trúng. Chỉ trả trong
  // trường hợp này — trả mặc định là mỗi lần dùng tool đều gánh thêm cả nghìn ký tự.
  if (!keywordMatched && keyword) {
    out.steps = titles.slice(0, MAX_TITLES_RETURNED);
    out.note = `Không có bước nào khớp "${keyword}", nên đã mở ở bước hợp với trang hiện tại.`
      + ' Xem `steps`; nếu có tên sát hơn thì gọi lại tool với đúng tên đó.';
  }

  return out;
}
