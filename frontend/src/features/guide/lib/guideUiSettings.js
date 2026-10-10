/**
 * HỎI MÁY CHỦ hai công tắc của trợ lý rồi ghi vào bản sao cục bộ (guideUiFlags.js):
 * `full_access` (trợ lý có được tự bấm nút không) và `show_activity_panel` (bày hay ẩn bảng
 * Hành động). Cả hai chỉnh ở /settings/tro-ly-huong-dan, lưu trong `app_settings`.
 *
 * ═══════════════ VÌ SAO PHẢI ĐI VÒNG QUA localStorage ═══════════════
 *
 * `FULL_ACCESS` trong guideAccess.js là HẰNG đọc một lần lúc import, và nhánh mount tool dựa
 * thẳng vào nó (`{FULL_ACCESS ? <A/> : <B/>}`). Đó không phải sự cẩu thả: giá trị hằng thì
 * nhánh không bao giờ đổi giữa hai lần render, nên thứ tự hook của React luôn ổn định. Một
 * giá trị về BẤT ĐỒNG BỘ từ máy chủ thì làm đúng điều ngược lại — nó lật nhánh giữa chừng.
 *
 * Nên đường đi là: fetch → ghi vào localStorage → LẦN TẢI TRANG SAU mới có hiệu lực. Trễ một
 * nhịp, nhưng đổi lại không có ca nào React vỡ thứ tự hook. Đây cũng đúng nếp mà chính
 * guideAccess.js đã ghi từ đầu: "Đổi cờ trong localStorage phải TẢI LẠI TRANG mới có tác dụng
 * — cố tình như vậy."
 *
 * Bảng Hành động thì KHÁC: nó là một component mount/unmount trọn gói, không phải một nhánh
 * bên trong danh sách hook, nên cờ của nó áp dụng được NGAY qua `onShowPanelChange`.
 *
 * Phần ĐỌC cờ nằm ở guideUiFlags.js chứ không ở đây — xem chú thích đầu tệp đó cho lý do
 * (vòng import làm cả nhánh trợ lý im lặng không mount).
 */
import api from '../../../lib/api';
import { writeFlags, serverFullAccess } from './guideUiFlags';

let loaded = false;

/**
 * Hỏi máy chủ MỘT LẦN mỗi phiên, giống `loadMascotSet`.
 *
 * Trả về `true` khi cờ toàn quyền vừa đổi so với thứ trang này đã dựng — bên gọi dùng nó để
 * mời người dùng tải lại, thay vì để họ bấm tắt rồi ngồi xem trợ lý tiếp tục tự bấm nút mà
 * không hiểu vì sao.
 */
export function loadGuideUiSettings() {
  if (loaded) return Promise.resolve(false);
  loaded = true;
  const truocDo = serverFullAccess();
  return api.get('/copilotkit/ui-settings')
    .then((res) => {
      const d = res?.data || {};
      writeFlags({ full: d.full_access, panel: d.show_activity_panel });
      return typeof d.full_access === 'boolean' && truocDo !== null && d.full_access !== truocDo;
    })
    .catch(() => false); // mất mạng hay 401 → giữ nguyên cờ đã nhớ, không báo gì
}

/**
 * Hỏi lại NGAY, bỏ qua chốt một-lần-mỗi-phiên.
 *
 * Dành cho đúng một chỗ: màn hình cài đặt vừa bấm Lưu. Người vừa tắt bảng Hành động mà vẫn thấy
 * nó nằm đó cho tới khi tự tải lại trang sẽ nghĩ là nút không ăn — mà nút thì ăn rồi, chỉ là
 * bản sao trong trình duyệt chưa được hỏi lại.
 */
export function refreshGuideUiSettings() {
  loaded = false;
  return loadGuideUiSettings();
}

export { serverShowPanel, onShowPanelChange } from './guideUiFlags';
