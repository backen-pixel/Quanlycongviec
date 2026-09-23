/**
 * Gộp / tách cột Kanban sản xuất và VC/LĐ.
 *
 * Cột lớn = giai đoạn NỐI TIẾP, cột nhỏ bên trong = việc SONG SONG.
 * SX: `production_pipeline_stages.group_key` (database/604).
 * VC: `logistics_pipeline_stages.group_key` (database/632).
 * Cột chưa gán group_key tự đứng riêng → công ty chưa cấu hình thấy bảng y như cũ.
 *
 * Không dựng giao diện riêng: chỉ biến đổi mảng pipeline rồi đưa vào đúng KanbanView,
 * nên cột gộp trông giống hệt cột thường vì nó LÀ cột thường.
 */

/**
 * Tên cột lớn: người dùng tự đặt ở trang Cài đặt pipeline — `group_key` CHÍNH LÀ tên hiển thị.
 * Bảng dưới chỉ để dịch đẹp mấy khoá slug có sẵn; khoá tự đặt hiện nguyên văn.
 */
export const SX_NHAN_COT_LON = {
  tiep_nhan: 'Tiếp nhận',
  ke_hoach: 'Kế hoạch',
  duyet: 'Duyệt',
  gia_cong: 'Gia công',
  hoan_thien: 'Hoàn thiện',
  dong_goi: 'Đóng gói',
  cong_no: 'Công nợ',
};

export const VC_NHAN_COT_LON = {
  giao_hang: 'Giao hàng',
  lap_dat: 'Lắp đặt',
  bao_hanh: 'Bảo hành',
  hoan_thanh: 'Hoàn thành',
};

const NHAN_COT_LON = { ...SX_NHAN_COT_LON, ...VC_NHAN_COT_LON };

/** Nhãn hiển thị của một cột lớn. Khoá `__rieng__…` là cột đứng một mình → không có nhãn. */
export function nhanCotLon(key) {
  const k = String(key || '').trim();
  if (!k || k.startsWith('__rieng__')) return '';
  return NHAN_COT_LON[k] || k;
}

/** Đưa tên tiếng Việt về slug sẵn có (`Tiếp nhận` → `tiep_nhan`); tên tự đặt giữ nguyên. */
export function khoaCotLonTuNhan(ten) {
  const t = String(ten || '').trim();
  if (!t) return '';
  if (NHAN_COT_LON[t]) return t;
  const hit = Object.entries(NHAN_COT_LON).find(([, v]) => v === t);
  return hit ? hit[0] : t;
}

export function khoaNhom(stage) {
  const k = String(stage?.group_key || '').trim();
  return k || `__rieng__${stage?.id}`;
}

/** Số thứ tự cột lớn do user đặt (`group_sort`). Null = chưa tùy chỉnh. */
export function thuTuNhom(g) {
  if (Number.isFinite(Number(g?.thuTu)) && Number(g.thuTu) > 0) return Number(g.thuTu);
  const ds = Array.isArray(g?.ds) ? g.ds : (Array.isArray(g?.cotNho) ? g.cotNho : []);
  const nums = ds
    .map((x) => Number(x?.group_sort))
    .filter((n) => Number.isFinite(n) && n > 0);
  return nums.length ? Math.min(...nums) : null;
}

/**
 * Thứ tự cột lớn: `group_sort` nếu đã tùy chỉnh trên trang Cài đặt pipeline.
 * Chưa đặt thì xếp theo order_index cột nhỏ — riêng Đóng gói luôn sau Hoàn thiện
 * (cột «Vệ sinh đóng gói» có thể đứng trước «Chờ giao hàng»).
 */
export function sapXepNhomCotLon(nhom) {
  const ds = Array.isArray(nhom) ? nhom : [];
  const withThuTu = ds.map((g) => ({ ...g, thuTu: thuTuNhom(g) }));
  const hasCustom = withThuTu.some((g) => Number.isFinite(g.thuTu) && g.thuTu > 0);
  if (hasCustom) {
    return withThuTu.sort((a, b) => {
      const aRieng = String(a.key || '').startsWith('__rieng__');
      const bRieng = String(b.key || '').startsWith('__rieng__');
      if (!aRieng && !bRieng) {
        const ta = Number.isFinite(a.thuTu) && a.thuTu > 0 ? a.thuTu : 9999;
        const tb = Number.isFinite(b.thuTu) && b.thuTu > 0 ? b.thuTu : 9999;
        if (ta !== tb) return ta - tb;
      }
      return Number(a?.moc ?? 9999) - Number(b?.moc ?? 9999);
    });
  }
  const mocHt = withThuTu.find((g) => g.key === 'hoan_thien');
  const mocHoanThien = mocHt != null ? Number(mocHt.moc) : null;
  const mocHienThi = (g) => {
    const m = Number(g?.moc ?? 9999);
    if (g?.key === 'dong_goi' && mocHoanThien != null && m <= mocHoanThien) {
      return mocHoanThien + 0.5;
    }
    return m;
  };
  return [...withThuTu].sort((a, b) => mocHienThi(a) - mocHienThi(b));
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
  return sapXepNhomCotLon(nhom.map((g) => {
    const cotNho = [...g.cotNho].sort((a, b) => (Number(a?.order_index) || 0) - (Number(b?.order_index) || 0));
    return {
      ...g,
      cotNho,
      nhan: nhanCotLon(g.key) || cotNho[0]?.name || 'Khác',
      riengLe: String(g.key || '').startsWith('__rieng__'),
      chiMotCot: !String(g.key || '').startsWith('__rieng__') && cotNho.length === 1,
      soDuAn: cotNho.reduce((a, c) => a + (c.items?.length || 0), 0),
      moc: Math.min(...cotNho.map((c) => Number(c?.order_index ?? 9999))),
    };
  }));
}

/** Có đáng bật nút Gộp không — chỉ khi thật sự có nhóm nhiều hơn 1 cột. */
export function coTheGopCot(pipeline) {
  return gomCotTheoNhom(pipeline).some((g) => !g.riengLe);
}

/**
 * Trả về mảng pipeline đã gộp để đưa thẳng vào KanbanView.
 * Nhóm đang mở giữ nguyên các cột nhỏ; nhóm đang thu thành 1 cột ảo.
 * Cột lớn chỉ có 1 cột nhỏ: giữ cột thật (kéo thả được) nhưng hiện tên cột lớn.
 */
export function gopPipeline(pipeline, nhomDangMo) {
  const mo = nhomDangMo instanceof Set ? nhomDangMo : new Set(nhomDangMo || []);
  return gomCotTheoNhom(pipeline).flatMap((g) => {
    if (g.riengLe) return g.cotNho;
    if (g.chiMotCot) {
      const c = g.cotNho[0] || {};
      return [{ ...c, name: g.nhan }];
    }
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

const LS_SX_GOP_COT = 'sx_gop_cot_pref_v1';
const SX_GOP_COT_MAC_DINH_USER_ID = 'e679aa3f-efa0-4a57-8d81-5374950dc8d4';

function foldTenNv(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Nguyễn Phạm Hùng (Phúc Đạt) — Kanban SX mặc định Gộp cột; user khác mặc định tách. */
export function userMacDinhGopCotSx(user) {
  if (!user) return false;
  if (String(user.id || '') === SX_GOP_COT_MAC_DINH_USER_ID) return true;
  if (String(user.email || '').toLowerCase().trim() === 'kinhphucdat@gmail.com') return true;
  return foldTenNv(user.full_name) === 'nguyen pham hung';
}

export function docSxGopCot(user) {
  try {
    if (user?.id) {
      const map = JSON.parse(localStorage.getItem(LS_SX_GOP_COT) || '{}');
      if (map && Object.prototype.hasOwnProperty.call(map, String(user.id))) {
        return !!map[String(user.id)];
      }
    }
  } catch { /* ignore */ }
  return userMacDinhGopCotSx(user);
}

export function ghiSxGopCot(user, value) {
  if (!user?.id) return;
  try {
    const map = JSON.parse(localStorage.getItem(LS_SX_GOP_COT) || '{}') || {};
    map[String(user.id)] = !!value;
    localStorage.setItem(LS_SX_GOP_COT, JSON.stringify(map));
  } catch { /* ignore */ }
}

const LS_VC_GOP_COT = 'vc_gop_cot_pref_v1';

export function docVcGopCot(user) {
  try {
    if (user?.id) {
      const map = JSON.parse(localStorage.getItem(LS_VC_GOP_COT) || '{}');
      if (map && Object.prototype.hasOwnProperty.call(map, String(user.id))) {
        return !!map[String(user.id)];
      }
    }
  } catch { /* ignore */ }
  return false;
}

export function ghiVcGopCot(user, value) {
  if (!user?.id) return;
  try {
    const map = JSON.parse(localStorage.getItem(LS_VC_GOP_COT) || '{}') || {};
    map[String(user.id)] = !!value;
    localStorage.setItem(LS_VC_GOP_COT, JSON.stringify(map));
  } catch { /* ignore */ }
}
