/**
 * Nhãn và màu của lỗi — một nguồn duy nhất cho trang quản lý, thẻ Kanban và hộp chi tiết.
 *
 * Mã trạng thái (`tiep_nhan`…) phải khớp hằng `TRANG_THAI` ở backend/src/routes/baoLoi.js:
 * backend lọc theo đúng bốn chuỗi đó, gửi chuỗi khác là route im lặng bỏ qua bộ lọc chứ
 * không báo sai — nên đừng đặt thêm trạng thái ở riêng phía giao diện.
 */

export const TRANG_THAI = [
  { id: 'tiep_nhan',  nhan: 'Tiếp nhận',  mau: '#94A3B8', nen: 'bg-slate-100',   chu: 'text-slate-700' },
  { id: 'dang_lam',   nhan: 'Đang làm',   mau: '#3B82F6', nen: 'bg-blue-100',    chu: 'text-blue-700' },
  { id: 'dang_cho',   nhan: 'Đang chờ',   mau: '#F59E0B', nen: 'bg-amber-100',   chu: 'text-amber-800' },
  { id: 'hoan_thanh', nhan: 'Hoàn thành', mau: '#10B981', nen: 'bg-emerald-100', chu: 'text-emerald-700' },
];

export const MUC_DO = [
  { id: 'low',      nhan: 'Nhẹ',       mau: '#94A3B8', nen: 'bg-slate-100',  chu: 'text-slate-700' },
  { id: 'medium',   nhan: 'Vừa',       mau: '#F59E0B', nen: 'bg-amber-100',  chu: 'text-amber-800' },
  { id: 'high',     nhan: 'Nặng',      mau: '#F97316', nen: 'bg-orange-100', chu: 'text-orange-800' },
  { id: 'critical', nhan: 'Chặn việc', mau: '#EF4444', nen: 'bg-rose-100',   chu: 'text-rose-700' },
];

export const NGUON_LOI = {
  loi_van_hanh: { nhan: 'Lỗi vận hành', giaiThich: 'Người làm sai quy trình' },
  loi_he_thong: { nhan: 'Lỗi hệ thống', giaiThich: 'Phần mềm hỏng' },
};

export const trangThai = (id) => TRANG_THAI.find((x) => x.id === id) || TRANG_THAI[0];
export const mucDo = (id) => MUC_DO.find((x) => x.id === id) || MUC_DO[1];

/** Lỗi đã đóng — dùng để loại khỏi bảng hạn và khỏi ô đếm «đang mở». */
export const daXong = (x) => x?.status === 'hoan_thanh';

/** Quá hạn mà chưa xong. Lỗi xong rồi thì hạn cũ không còn là vấn đề. */
export const quaHan = (x) => !!x?.deadline && !daXong(x) && new Date(x.deadline) < new Date();

// ── Dấu vết kỹ thuật ────────────────────────────────────────────────────────
export const MOC_DAU_VET = '───── Thành phần bị lỗi ─────';

/**
 * Backend dán dấu vết DOM vào CUỐI mô tả (xem baoLoi.js, route POST) chứ không để cột
 * riêng. Tách lại khi hiển thị: lời người dùng kể và thông số máy ghi là hai thứ đọc theo
 * hai kiểu — trộn chung một khối chữ thì câu «bấm Lưu không thấy gì» chìm giữa đống CSS.
 *
 * @returns {{ loiKe: string, dauVet: Array<{ten: string, gt: string}> }}
 */
export function tachMoTa(moTa) {
  const t = String(moTa || '');
  const i = t.indexOf(MOC_DAU_VET);
  if (i < 0) return { loiKe: t.trim(), dauVet: [] };
  const dong = t.slice(i + MOC_DAU_VET.length)
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
  return {
    loiKe: t.slice(0, i).trim(),
    dauVet: dong.map((d) => {
      const v = d.indexOf(':');
      return v > 0 ? { ten: d.slice(0, v), gt: d.slice(v + 1).trim() } : { ten: '', gt: d };
    }),
  };
}

/**
 * Một dòng gọn chỉ đúng chỗ hỏng, cho thẻ Kanban rộng 15rem.
 *
 * Ưu tiên «Khu vực · Nội dung» (người đọc nhận ra ngay: «Deal · nút Lưu»); không có thì
 * mới rơi xuống đường dẫn trang, vì URL dài và ít gợi hình hơn.
 */
export function choHong(dauVet) {
  const lay = (ten) => (dauVet || []).find((x) => x.ten === ten)?.gt || '';
  const kv = lay('Khu vực');
  const nd = lay('Nội dung');
  if (kv || nd) return [kv, nd].filter(Boolean).join(' · ');
  return lay('Màn hình') || lay('Trang') || '';
}

/** "16/10 14:30" — đủ để so ngày, ngắn để nhét vào thẻ. */
export function gioNgan(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const hai = (n) => String(n).padStart(2, '0');
  return `${hai(d.getDate())}/${hai(d.getMonth() + 1)} ${hai(d.getHours())}:${hai(d.getMinutes())}`;
}

/** "16/10/2026" */
export function ngay(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const hai = (n) => String(n).padStart(2, '0');
  return `${hai(d.getDate())}/${hai(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Giá trị cho <input type="datetime-local"> — input này không nhận chuỗi ISO có múi giờ. */
export function choONhapGio(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const hai = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${hai(d.getMonth() + 1)}-${hai(d.getDate())}T${hai(d.getHours())}:${hai(d.getMinutes())}`;
}
