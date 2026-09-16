/**
 * Tách cột Kanban xưởng thành nhiều tab (Sản xuất, Công nợ, tab tự thêm).
 *
 * Cột nào có `board_tab` thì vào đúng tab đó. Chưa gán: cột lớn «Công nợ»
 * của Tủ bếp → tab Công nợ; Cánh kính / Cửa giữ thanh toán trên Sản xuất.
 *
 * Tab vẫn là Kanban y hệt: cùng KanbanView, cùng thẻ, cùng kéo thả.
 *
 * CỬA RA: cột công nợ ĐẦU TIÊN có thể giữ lại trên tab Sản xuất (giuCuaRa).
 */

export const TAB_SX = 'sx';
export const TAB_CONG_NO = 'cong_no';

const NHAN_TAB_CO_DINH = {
  sx: 'Sản xuất',
  cong_no: 'Công nợ',
};

/** Bỏ dấu + thường hoá: 'Công nợ' và 'cong_no' phải ra cùng một khoá. */
function chuanHoaKhoa(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_');
}

export function khoaTabKanban(v) {
  const t = String(v || '').trim().replace(/\s+/g, ' ');
  if (!t) return TAB_SX;
  const slug = chuanHoaKhoa(t);
  if (slug === 'sx' || slug === 'san_xuat') return TAB_SX;
  if (slug === 'cong_no') return TAB_CONG_NO;
  if (NHAN_TAB_CO_DINH[t]) return t;
  const hit = Object.entries(NHAN_TAB_CO_DINH).find(([, nhan]) => nhan === t);
  if (hit) return hit[0];
  return t.slice(0, 80);
}

/** @deprecated dùng khoaTabKanban — giữ tên cũ vì form/settings đang gọi. */
export function chuanHoaTabKanban(v) {
  return khoaTabKanban(v);
}

export function nhanTabKanban(key) {
  const k = khoaTabKanban(key);
  return NHAN_TAB_CO_DINH[k] || k;
}

export function laTabCoDinh(key) {
  const k = khoaTabKanban(key);
  return k === TAB_SX || k === TAB_CONG_NO;
}

function tenLoaiXuong(stage) {
  return chuanHoaKhoa(stage?.workshop_type?.name);
}

/** Cánh kính / Cửa giữ cột thanh toán trên bảng xưởng (không dời sang tab Công nợ). */
export function laCotCongNo(stage) {
  if (chuanHoaKhoa(stage?.group_key) !== TAB_CONG_NO) return false;
  const loai = tenLoaiXuong(stage);
  if (loai === 'canh_kinh' || loai === 'cua') return false;
  const ten = chuanHoaKhoa(stage?.name);
  if (ten === 'doi_thanh_toan' || ten.startsWith('no_qua_han')) return false;
  return true;
}

/**
 * Tab Dashboard mà cột này thuộc về.
 * Có `board_tab` thì dùng đúng giá trị đã setup; chưa có thì suy ra như cũ.
 */
export function tabKanbanCot(stage) {
  const raw = String(stage?.board_tab || '').trim();
  if (raw) return khoaTabKanban(raw);
  return laCotCongNo(stage) ? TAB_CONG_NO : TAB_SX;
}

/** Tab của một cột lớn = tab của các cột nhỏ bên trong. */
export function tabKanbanNhom(ds) {
  const list = Array.isArray(ds) ? ds : [];
  const keys = [];
  const seen = new Set();
  list.forEach((s) => {
    const k = tabKanbanCot(s);
    if (seen.has(k)) return;
    seen.add(k);
    keys.push(k);
  });
  if (!keys.length) return TAB_SX;
  if (keys.length === 1) return keys[0];
  return keys.find((k) => k !== TAB_SX) || TAB_SX;
}

/**
 * Danh sách tab để setup / Dashboard.
 * Luôn có Sản xuất + Công nợ; thêm tab tự tạo và tab đang dùng trên cột.
 */
export function dsTabKanban(stages, extra = []) {
  const seen = new Set();
  const ra = [];
  const add = (raw) => {
    const key = khoaTabKanban(raw);
    if (!key || seen.has(key)) return;
    seen.add(key);
    ra.push({ key, label: nhanTabKanban(key) });
  };
  add(TAB_SX);
  add(TAB_CONG_NO);
  (extra || []).forEach(add);
  (stages || []).forEach((st) => add(tabKanbanCot(st)));
  return ra;
}

/**
 * @returns {{ cotSX: any[], cotCongNo: any[], cuaRa: any|null, theoTab: Map<string, any[]> }}
 */
export function tachCotTheoTab(pipeline, { giuCuaRa = true } = {}) {
  const ds = Array.isArray(pipeline) ? pipeline : [];
  const theoTab = new Map();
  ds.forEach((c) => {
    const k = tabKanbanCot(c);
    if (!theoTab.has(k)) theoTab.set(k, []);
    theoTab.get(k).push(c);
  });
  const cotCongNo = theoTab.get(TAB_CONG_NO) || [];
  if (![...theoTab.keys()].some((k) => k !== TAB_SX)) {
    return { cotSX: ds, cotCongNo: [], cuaRa: null, theoTab };
  }

  const cuaRa = cotCongNo.length
    ? cotCongNo.reduce(
      (a, b) => (Number(b?.order_index ?? 9999) < Number(a?.order_index ?? 9999) ? b : a),
      cotCongNo[0],
    )
    : null;
  const boQua = new Set();
  theoTab.forEach((list, key) => {
    if (key === TAB_SX) return;
    list.forEach((c) => boQua.add(String(c?.id)));
  });
  if (giuCuaRa && cuaRa) boQua.delete(String(cuaRa.id));

  return {
    cotSX: ds.filter((c) => !boQua.has(String(c?.id))),
    cotCongNo,
    cuaRa,
    theoTab,
  };
}

/** Số thẻ của một bộ cột — ưu tiên tổng server (stageCounts), chưa có thì đếm thẻ đã tải. */
export function demTheCot(cot, stageCounts) {
  return (cot || []).reduce((a, c) => {
    const n = Number(stageCounts?.[String(c?.id)]);
    return a + (Number.isFinite(n) && n > 0 ? n : (c?.items?.length || 0));
  }, 0);
}
