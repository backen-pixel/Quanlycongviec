/**
 * Tách cột CÔNG NỢ khỏi bảng xưởng thành một tab riêng.
 *
 * Cột nào thuộc cột lớn «Công nợ» (production_pipeline_stages.group_key) thì dời sang
 * tab Công nợ. Tủ bếp: 5 cột công nợ sau «Đã giao». Cánh kính / Cửa: thu tiền,
 * Đợi thanh toán, nợ quá hạn nằm trên bảng xưởng — không dời tab.
 *
 * Tab Công nợ vẫn là Kanban y hệt: cùng KanbanView, cùng thẻ, cùng kéo thả.
 * Khác duy nhất là bộ cột đưa vào.
 *
 * CỬA RA: cột công nợ ĐẦU TIÊN được giữ lại trên tab Sản xuất. Nếu dời hết thì thẻ ở cột
 * cuối của xưởng («Đơn hàng đã giao») không còn chỗ nào để kéo tới và sẽ kẹt lại đó.
 */

const KHOA_CONG_NO = 'cong_no';

/** Bỏ dấu + thường hoá: 'Công nợ' và 'cong_no' phải ra cùng một khoá. */
function chuanHoaKhoa(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_');
}

function tenLoaiXuong(stage) {
  return chuanHoaKhoa(stage?.workshop_type?.name);
}

/** Cánh kính / Cửa giữ cột thanh toán trên bảng xưởng (không dời sang tab Công nợ). */
export function laCotCongNo(stage) {
  if (chuanHoaKhoa(stage?.group_key) !== KHOA_CONG_NO) return false;
  const loai = tenLoaiXuong(stage);
  if (loai === 'canh_kinh' || loai === 'cua') return false;
  const ten = chuanHoaKhoa(stage?.name);
  if (ten === 'doi_thanh_toan' || ten.startsWith('no_qua_han')) return false;
  return true;
}

/**
 * @returns {{ cotSX: any[], cotCongNo: any[], cuaRa: any|null }}
 * cotSX      – cột cho tab Sản xuất (kèm cửa ra nếu giuCuaRa)
 * cotCongNo  – toàn bộ cột công nợ, cho tab Công nợ
 * cuaRa      – cột công nợ đầu tiên (order_index nhỏ nhất)
 */
export function tachCotTheoTab(pipeline, { giuCuaRa = true } = {}) {
  const ds = Array.isArray(pipeline) ? pipeline : [];
  const cotCongNo = ds.filter(laCotCongNo);
  if (!cotCongNo.length) return { cotSX: ds, cotCongNo: [], cuaRa: null };

  const cuaRa = cotCongNo.reduce(
    (a, b) => (Number(b?.order_index ?? 9999) < Number(a?.order_index ?? 9999) ? b : a),
    cotCongNo[0],
  );
  const boQua = new Set(cotCongNo.map((c) => String(c?.id)));
  if (giuCuaRa && cuaRa) boQua.delete(String(cuaRa.id));

  return {
    cotSX: ds.filter((c) => !boQua.has(String(c?.id))),
    cotCongNo,
    cuaRa,
  };
}

/** Số thẻ của một bộ cột — ưu tiên tổng server (stageCounts), chưa có thì đếm thẻ đã tải. */
export function demTheCot(cot, stageCounts) {
  return (cot || []).reduce((a, c) => {
    const n = Number(stageCounts?.[String(c?.id)]);
    return a + (Number.isFinite(n) && n > 0 ? n : (c?.items?.length || 0));
  }, 0);
}
