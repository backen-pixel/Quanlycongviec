/**
 * KÊNH BÁO "TOUR ĐANG CHỈ VÀO PHẦN TỬ NÀO".
 *
 * Tour vẽ lỗ sáng và tooltip; nhân vật hệ thống (features/guide/GuideMascot.jsx) muốn đứng cạnh
 * đúng phần tử đó và trỏ tay vào. Hai bên không được biết nhau:
 *
 *  - Nếu provider import thẳng nhân vật thì tour phụ thuộc vào trợ lý — tắt trợ lý là tour hỏng.
 *  - Nếu nhân vật tự dò DOM tìm lỗ sáng thì mỗi lần đổi cách vẽ overlay là nó chỉ trượt.
 *
 * Nên bên SINH ra thông tin (tour) giữ kênh này, bên tiêu thụ đăng ký nghe. Không có người nghe
 * thì `datTieuDiem` chỉ gán một biến — tour chạy y như cũ.
 *
 * Chỉ báo KHI ĐỔI. `updateRect` của provider chạy lại mỗi 120 ms để bám layout; báo mỗi nhịp thì
 * nhân vật re-render 8 lần/giây suốt cả tour.
 */

/** @type {{ el: Element, buoc: number, tong: number, tieuDe: string } | null} */
let hienTai = null;
const nguoiNghe = new Set();

function bao() {
  for (const cb of nguoiNghe) {
    try { cb(hienTai); } catch { /* một người nghe lỗi không được làm hỏng tour */ }
  }
}

/** Đặt tiêu điểm hiện tại. Truyền `null` để xoá. */
export function datTieuDiem(tin) {
  const cu = hienTai;
  if (!tin) {
    if (!cu) return;
    hienTai = null;
    bao();
    return;
  }
  if (cu && cu.el === tin.el && cu.buoc === tin.buoc) return;
  hienTai = tin;
  bao();
}

export function xoaTieuDiem() {
  datTieuDiem(null);
}

/** Đăng ký nghe (gọi ngay một lần với giá trị hiện tại). Trả về hàm huỷ đăng ký. */
export function theoDoiTieuDiem(cb) {
  nguoiNghe.add(cb);
  try { cb(hienTai); } catch { /* ignore */ }
  return () => nguoiNghe.delete(cb);
}
