/**
 * Gộp / tách cột Kanban sản xuất.
 *
 * Cột lớn = giai đoạn NỐI TIẾP, cột nhỏ bên trong = việc SONG SONG.
 * Nhóm lấy từ `production_pipeline_stages.group_key` (database/604).
 * Cột chưa gán group_key tự đứng riêng → công ty chưa cấu hình thấy bảng y như cũ.
 *
 * Không dựng giao diện riêng: chỉ biến đổi mảng pipeline rồi đưa vào đúng KanbanView,
 * nên cột gộp trông giống hệt cột thường vì nó LÀ cột thường.
 */

/**
 * Tên cột lớn: người dùng tự đặt ở trang Cài đặt pipeline — `group_key` CHÍNH LÀ tên hiển thị.
 * Bảng dưới chỉ để dịch đẹp mấy khoá slug có sẵn từ migration 604; khoá tự đặt hiện nguyên văn.
 */
export const SX_NHAN_COT_LON = {
  tiep_nhan: 'Tiếp nhận',
  ke_hoach: 'Kế hoạch',
  duyet: 'Duyệt',
  gia_cong: 'Gia công',
  hoan_thien: 'Hoàn thiện',
  cong_no: 'Công nợ',
};

/** Nhãn hiển thị của một cột lớn. Khoá `__rieng__…` là cột đứng một mình → không có nhãn. */
export function nhanCotLon(key) {
  const k = String(key || '').trim();
  if (!k || k.startsWith('__rieng__')) return '';
  return SX_NHAN_COT_LON[k] || k;
}

export function khoaNhom(stage) {
  const k = String(stage?.group_key || '').trim();
  return k || `__rieng__${stage?.id}`;
}

/** Gom stage theo group_key; cột lớn xếp theo order_index nhỏ nhất. */
export function gomCotTheoNhom(pipeline) {
  const nhom = [];
  const chiMuc = new Map();
  (pipeline || []).forEach((stage) => {
    const key = khoaNhom(stage);
    if (!chiMuc.has(key)) {
      chiMuc.set(key, nhom.length);
      nhom.push({ key, cotNho: [] });
    }
    nhom[chiMuc.get(key)].cotNho.push(stage);
  });
  return nhom
    .map((g) => ({
      ...g,
      nhan: nhanCotLon(g.key) || g.cotNho[0]?.name || 'Khác',
      riengLe: g.cotNho.length === 1,
      soDuAn: g.cotNho.reduce((a, c) => a + (c.items?.length || 0), 0),
      // Xếp theo order_index NHỎ NHẤT chứ không theo thứ tự gặp: board Cánh kính có nhóm
      // xen kẽ — «vệ sinh đóng gói» (cột 7) thuộc Hoàn thiện, «thu tiền» (cột 8) thuộc
      // Công nợ — xếp theo thứ tự gặp sẽ ra sai giai đoạn.
      moc: Math.min(...g.cotNho.map((c) => Number(c?.order_index ?? 9999))),
    }))
    .sort((a, b) => a.moc - b.moc);
}

/** Có đáng bật nút Gộp không — chỉ khi thật sự có nhóm nhiều hơn 1 cột. */
export function coTheGopCot(pipeline) {
  return gomCotTheoNhom(pipeline).some((g) => !g.riengLe);
}

/**
 * Trả về mảng pipeline đã gộp để đưa thẳng vào KanbanView.
 * Nhóm đang mở (hoặc chỉ có 1 cột) giữ nguyên các cột nhỏ; nhóm đang thu thành 1 cột ảo.
 */
export function gopPipeline(pipeline, nhomDangMo) {
  const mo = nhomDangMo instanceof Set ? nhomDangMo : new Set(nhomDangMo || []);
  return gomCotTheoNhom(pipeline).flatMap((g) => {
    if (g.riengLe) return g.cotNho;
    if (mo.has(g.key)) {
      // Nhóm ĐANG MỞ: giữ nguyên cột nhỏ nhưng gắn dấu để KanbanView bọc chúng
      // vào một khung CỘT LỚN (giai đoạn nối tiếp) — bên trong là việc song song.
      return g.cotNho.map((c) => ({
        ...c,
        __nhomKey: g.key,
        __nhomNhan: g.nhan,
        __nhomSoCot: g.cotNho.length,
        __nhomSoDuAn: g.soDuAn,
      }));
    }
    const dau = g.cotNho[0] || {};
    return [{
      ...dau,
      id: `grp:${g.key}`,
      name: g.nhan,
      items: g.cotNho.flatMap((c) => c.items || []),
      // Cột ảo: không cho kéo thả vào vì không biết thả vào cột nhỏ nào.
      __cotGop: true,
      __groupKey: g.key,
      __soCotNho: g.cotNho.length,
    }];
  });
}
