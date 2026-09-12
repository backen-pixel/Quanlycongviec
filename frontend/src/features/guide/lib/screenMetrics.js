/**
 * Đọc CHỈ SỐ TỔNG HỢP (số đếm) đang hiển thị trên màn hình hiện tại — VD "Kênh Facebook: 3",
 * "Leads 4.188", "Quá hạn 12". Đây là lớp khác hẳn `pageStructureScanner.js`: scanner chỉ mô
 * tả khung (tên nút/tab), còn ở đây ta CHỦ ĐỘNG đọc con số thật trên trang — nên cần thêm một
 * lớp phòng vệ mà scanner không cần.
 *
 * TÁM LỚP CHẶN, không được bớt lớp nào. Lớp 4–8 thêm sau khi một tiêu đề thẻ lead lọt vào
 * khung chat dưới dạng chỉ số (xem ghi chú ở DATA_CONTAINER_SELECTOR) — ba lớp đầu KHÔNG đủ:
 *
 *  1. Lọc PII trên nhãn VÀ trên toàn chuỗi văn bản (dùng chung PII_PATTERNS với scanner) —
 *     chặn số điện thoại/email/tiền đi kèm nhãn.
 *  2. Số phải TRÔNG NHƯ SỐ ĐẾM: thuần chữ số (không dấu phân cách nghìn), 1–6 chữ số, không có
 *     số 0 dẫn đầu. Lớp này chặn số điện thoại dài và số tiền có phân tách nghìn — "150.000.000"
 *     có dấu chấm nên KHÔNG khớp pattern thuần số, còn "0971816646" dài hơn 6 chữ số.
 *  3. Giới hạn số lượng khớp (≤ 20). Vượt ngưỡng nhiều khả năng đây là một BẢNG DỮ LIỆU (danh
 *     sách khách hàng...) chứ không phải vài ô thống kê — từ chối an toàn, trả về rỗng thay vì
 *     đoán bừa cái nào là "chỉ số" cái nào là dữ liệu.
 *  4. Bỏ hẳn mọi thứ nằm trong VÙNG CHỨA BẢN GHI (thẻ kéo được, <tr>, <li>, role=row/listitem).
 *  5. Bỏ thẻ tiêu đề <h1>–<h6> — tiêu đề thường là TÊN, không phải nhãn thống kê.
 *  6. Bỏ khi số là PHẦN CỦA TÊN: từ ngay trước số là "Quận"/"Lô"/"Tháng"/"Đợt"…
 *  7. Bỏ nhãn có dấu nối kiểu tiêu đề bản ghi ("A - B - C").
 *  8. Bỏ nhãn có kính ngữ (Chị/Anh/Ông/Bà/Cô/Chú) — bộ lọc PII theo pattern KHÔNG bắt tên người.
 *
 * Chỉ nhận nhãn+số nằm CHUNG một phần tử LÁ (không có element con), cách nhau bởi khoảng
 * trắng — dạng phổ biến của thẻ thống kê/badge trong giao diện ("Chưa làm 12", "Kênh đã kết
 * nối 3"). Không khớp được cấu trúc nhãn/số nằm ở hai phần tử tách rời — chấp nhận bỏ sót còn
 * hơn đoán sai (nguyên tắc D6: sai thì báo to, không đoán bừa).
 */
import { EXCLUDE_SELECTOR, PII_PATTERNS } from './pageStructureScanner';

// 28, không phải 40: nhãn thẻ thống kê thật đều ngắn ("Deals", "Khách hàng", "Kênh đã kết
// nối"). Nới tới 40 là vừa đủ chỗ cho tiêu đề một bản ghi lọt vào — xem lớp 4 dưới đây.
const MAX_LABEL_LEN = 28;
const MAX_ITEMS = 20;
const LABEL_NUMBER_RE = /^(.{2,}?)\s+(\d{1,6})$/;

/**
 * LỚP 4 — VÙNG CHỨA BẢN GHI. Số nằm trong thẻ kanban / dòng bảng / mục danh sách là DỮ LIỆU,
 * không phải chỉ số, kể cả khi nó trông y hệt một badge.
 *
 * Ca thật đã lọt (2026-08-24, /crm/dashboard): tiêu đề một thẻ lead
 *     <h4>Cửa sắt trượt Quay - Chị Châu - Quận 9</h4>   (trong <div draggable="true">)
 * bị đọc thành chỉ số `nhan: "Cửa sắt trượt Quay - Chị Châu - Quận", so: 9` và trợ lý đem lên
 * khung chat như một con số thống kê. Số 9 là **số quận trong địa chỉ**, không phải số đếm gì
 * cả — và tên khách "Chị Châu" lọt luôn qua bộ lọc PII vì tên người không khớp pattern nào.
 *
 * Chấp nhận đánh đổi: trang nào đặt thẻ thống kê trong <li> hoặc <tr> thì từ nay không đọc
 * được. Đúng nguyên tắc D6 — bỏ sót còn hơn báo một con số sai.
 */
const DATA_CONTAINER_SELECTOR = '[draggable="true"], tr, li, [role="row"], [role="listitem"], [role="gridcell"], [data-lead-id], [data-deal-id]';

/** LỚP 5 — tiêu đề. Cùng lý do pageStructureScanner từ chối <h1>/<h2>: tiêu đề thường là TÊN. */
const HEADING_RE = /^H[1-6]$/;

/**
 * LỚP 6 — số là PHẦN CỦA TÊN, không phải số đếm. Từ đứng ngay trước số quyết định điều đó:
 * "Quận 9", "Lô 12", "Tháng 8", "Đợt 2" — số dính vào nhãn chứ không đếm nhãn.
 * So sánh trên chuỗi đã hạ chữ thường (không dùng cờ /i cho chữ có dấu Việt).
 */
const NUMBER_BELONGS_TO_NAME = new Set([
  'quận', 'phường', 'xã', 'huyện', 'ấp', 'thôn', 'khu', 'lô', 'tổ', 'hẻm', 'ngõ', 'đường',
  'số', 'stt', 'tầng', 'căn', 'nhà', 'phòng', 'block', 'zone', 'km',
  'quý', 'tháng', 'tuần', 'ngày', 'năm', 'kỳ', 'đợt', 'lần', 'cấp', 'loại', 'mã', 'top',
]);

/** LỚP 7 — dấu hiệu đây là tiêu đề bản ghi được nối từ nhiều mảnh: "A - B - C". */
const NAME_SEPARATOR_RE = /\s[-–—|/]\s/;

/** LỚP 8 — kính ngữ = có tên người trong đó. Bộ lọc PII theo pattern KHÔNG bắt được tên người. */
const HONORIFIC_RE = /(^|\s)(chị|anh|ông|bà|cô|chú|em|mr|ms|mrs)\s/;

function isCountLike(digits) {
  if (!/^\d{1,6}$/.test(digits)) return false;
  if (digits.length > 1 && digits[0] === '0') return false;
  return true;
}

function isSafeText(text) {
  return !PII_PATTERNS.some((re) => re.test(text));
}

/** Nhãn có thật sự trông như nhãn của một thẻ thống kê? (lớp 6–8) */
function looksLikeMetricLabel(label) {
  const low = label.toLowerCase();
  if (NAME_SEPARATOR_RE.test(label)) return false;
  if (HONORIFIC_RE.test(low)) return false;
  const lastWord = low.split(/\s+/).pop();
  if (NUMBER_BELONGS_TO_NAME.has(lastWord)) return false;
  return true;
}

/**
 * Đọc chỉ số hiển thị trong <main> hiện tại.
 * @returns {Array<{nhan: string, so: number}>} rỗng nếu không tìm thấy HOẶC nghi là bảng dữ liệu.
 */
export function readScreenMetrics() {
  if (typeof document === 'undefined') return [];
  const main = document.querySelector('main');
  if (!main) return [];

  const results = [];
  const seen = new Set();
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_ELEMENT, {
    acceptNode(el) {
      if (el.closest(EXCLUDE_SELECTOR)) return NodeFilter.FILTER_REJECT;
      // REJECT (cắt cả nhánh con) chứ không SKIP: mọi thứ bên trong một thẻ bản ghi hay một
      // tiêu đề đều là dữ liệu của bản ghi đó, không cần xét tiếp phần tử con nào.
      if (el.closest(DATA_CONTAINER_SELECTOR)) return NodeFilter.FILTER_REJECT;
      if (HEADING_RE.test(el.tagName)) return NodeFilter.FILTER_REJECT;
      if (el.children.length > 0) return NodeFilter.FILTER_SKIP; // chỉ xét phần tử lá
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let node = walker.nextNode();
  while (node) {
    const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
    const m = text.match(LABEL_NUMBER_RE);
    if (m) {
      const label = m[1].trim();
      const digits = m[2];
      if (
        label.length <= MAX_LABEL_LEN
        && isCountLike(digits)
        && looksLikeMetricLabel(label)
        && isSafeText(label)
        && isSafeText(text)
      ) {
        const key = `${label}::${digits}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push({ nhan: label, so: Number(digits) });
          if (results.length > MAX_ITEMS) return []; // nghi bảng dữ liệu — từ chối an toàn
        }
      }
    }
    node = walker.nextNode();
  }

  return results;
}
