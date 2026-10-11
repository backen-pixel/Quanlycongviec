/**
 * MỘT ĐƯỜNG DUY NHẤT để đọc / chỉ tay vào khu vực — dùng chung cho TRỢ LÝ và cho NGƯỜI.
 *
 * Trước file này, tool `read_region` tự gọi `waitForPageReady` + `readRegion` ngay trong handler,
 * còn bảng "Hành động của trợ lý" chỉ in bản đồ khu vực dưới dạng JSON thô. Người dùng không có
 * cách nào biết trợ lý THẬT SỰ nhìn thấy gì bên trong một khu vực, trừ khi hỏi rồi đoán qua câu
 * trả lời.
 *
 * Nay nút "Chi tiết" trong bảng và tool của trợ lý gọi CÙNG một hàm ở đây. Nhờ vậy:
 *   · thứ người dùng thấy khi bấm là ĐÚNG thứ trợ lý nhận khi gọi tool — không phải một bản
 *     dựng lại cho đẹp, vốn sẽ lệch dần theo thời gian;
 *   · muốn thử một khu vực thì bấm là biết, khỏi tốn một lượt hỏi model;
 *   · sửa bộ đọc ở một chỗ là cả hai phía cùng đổi.
 */
import { readRegion } from './pageRegions';
import { highlightByRegion } from './uiSpotlight';
import { waitForPageReady } from './pageReady';

/**
 * Mô tả readable của bản đồ khu vực.
 *
 * Để thành hằng dùng chung, không chép chuỗi sang bảng hành động: bảng nhận ra đâu là bản đồ
 * khu vực bằng cách so ĐÚNG chuỗi này. Chép sang hai nơi thì một bên sửa câu chữ là bảng mất
 * nút "Chi tiết" mà không có lỗi nào — cùng loại hỏng im lặng như khoá hàng đợi câu hỏi.
 */
export const REGION_MAP_CONTEXT = 'Bản đồ KHU VỰC trên màn hình (lớp 1 — kiến trúc, KHÔNG chứa nội dung bản ghi). Chi tiết một khu vực phải gọi tool read_region';

/** Tên loại khu vực cho người đọc. Khoá là `kind` do pageRegions.js đặt. */
export const KIND_LABEL = {
  toolbar: 'Thanh công cụ',
  table: 'Bảng',
  list: 'Danh sách',
  strip: 'Dải',
  declared: 'Tự khai',
  form: 'Biểu mẫu',
};

/**
 * Gọi khu vực bằng gì — theo đúng luật prompt dạy trợ lý.
 *
 * Có tên thật thì gọi bằng TÊN: id `kv3` gán theo thứ tự của lần quét, trang đổi một chút là nó
 * trỏ sang khu vực khác. Khu vực VÔ DANH thì bắt buộc gọi bằng id — tên hiển thị của nó
 * ("Khu vực 2 (không có tiêu đề)") là chuỗi dựng ra, `findRegion` không khớp được.
 */
export function regionRef(region) {
  if (!region) return '';
  if (region.name_inferred === false || !region.name) return region.id;
  return region.name;
}

/**
 * Bản đồ khu vực có thể tới dưới dạng CHUỖI JSON: core lưu value của readable đã stringify
 * (xem `pretty` trong AgentActivityPanel.jsx). Trả `{regions: [], note}` khi không đọc được.
 */
export function parseRegionMap(value) {
  let v = value;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { return { regions: [], note: '' }; }
  }
  return {
    regions: Array.isArray(v?.regions) ? v.regions : [],
    note: typeof v?.note === 'string' ? v.note : '',
  };
}

/** Lớp 2 — đọc sâu một khu vực. Handler của tool `read_region` và nút "Chi tiết" đều gọi hàm này. */
export async function runReadRegion({ region, include_items }) {
  // Tool này hay được gọi ngay sau điều hướng; đọc lúc trang còn skeleton thì ra 0 khu vực và
  // model kết luận "màn hình không có gì".
  const waited = await waitForPageReady({ minMs: 0, maxMs: 6000 });
  const r = readRegion(region, { include_items: include_items !== false });
  return { ...r, page_wait: waited };
}

/** Khoanh sáng một khu vực và cho nhân vật chỉ tay vào. Tool `highlight_region` và nút "Chỉ vị trí" dùng chung. */
export function runHighlightRegion({ region }) {
  return highlightByRegion(region);
}
