// Nguồn dữ liệu sản phẩm: ưu tiên API của ERP, hỏng thì rơi về dữ liệu tĩnh.
//
// Cấu hình bằng biến môi trường lúc build (Render → Environment):
//   VITE_API_URL     = https://tubep-backend.onrender.com
//   VITE_COMPANY_ID  = <uuid công ty sở hữu website, lấy trong ERP → Marketing → Sản phẩm website>
//
// Thiếu một trong hai biến → chạy hoàn toàn bằng dữ liệu tĩnh, web vẫn đầy đủ.

import { SAN_PHAM, DANH_MUC, VAT_LIEU } from '../data/sanPham';

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
const COMPANY_ID = import.meta.env.VITE_COMPANY_ID || '';
const TIMEOUT_MS = 8000;

/** Dạng chuẩn mà toàn bộ giao diện dùng — cả API lẫn dữ liệu tĩnh đều quy về đây. */
function tuApi(row) {
  const anh = Array.isArray(row.images) ? row.images[0] : null;
  return {
    id: row.id,
    slug: row.slug,
    ten: row.name,
    danhMuc: row.category_key || '',
    danhMucTen: row.category || '',
    vatLieu: row.material_key || '',
    vatLieuTen: row.material || '',
    gia: Number(row.price_from) || 0,
    donVi: row.price_unit || 'm dài',
    kichThuoc: row.size_text || '',
    moTa: row.description || '',
    tienIch: Array.isArray(row.features) ? row.features : [],
    mau: [row.color_from || '#e2d6c3', row.color_to || '#5b4a36'],
    noiBat: !!row.is_featured,
    anh: anh || undefined,
  };
}

function tuTinh(sp) {
  return {
    ...sp,
    slug: sp.id,
    danhMucTen: DANH_MUC.find((d) => d.id === sp.danhMuc)?.ten || sp.danhMuc,
    vatLieuTen: VAT_LIEU.find((v) => v.id === sp.vatLieu)?.ten || sp.vatLieu,
  };
}

/** Danh sách lọc suy ra từ chính sản phẩm đang có — không cần cấu hình riêng. */
function nhomLoc(dsSanPham, khoa, khoaTen) {
  const map = new Map();
  for (const sp of dsSanPham) {
    if (sp[khoa]) map.set(sp[khoa], sp[khoaTen] || sp[khoa]);
  }
  return [...map].map(([id, ten]) => ({ id, ten }));
}

export function duLieuTinh() {
  const sanPham = SAN_PHAM.map(tuTinh);
  return {
    sanPham,
    danhMuc: nhomLoc(sanPham, 'danhMuc', 'danhMucTen'),
    vatLieu: nhomLoc(sanPham, 'vatLieu', 'vatLieuTen'),
    nguon: 'tinh',
  };
}

export async function layDanhMucSanPham() {
  if (!API_URL || !COMPANY_ID) return duLieuTinh();

  const huy = new AbortController();
  const hen = setTimeout(() => huy.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL}/api/public/web/products?company_id=${encodeURIComponent(COMPANY_ID)}`, {
      signal: huy.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();
    const items = Array.isArray(json.items) ? json.items : [];
    // ERP chưa nhập mẫu nào (hoặc chưa chạy migration) → giữ dữ liệu tĩnh thay vì web trống trơn.
    if (items.length === 0) return duLieuTinh();

    const sanPham = items.map(tuApi);
    return {
      sanPham,
      danhMuc: json.categories?.length ? json.categories : nhomLoc(sanPham, 'danhMuc', 'danhMucTen'),
      vatLieu: json.materials?.length ? json.materials : nhomLoc(sanPham, 'vatLieu', 'vatLieuTen'),
      nguon: 'api',
    };
  } catch (e) {
    console.warn('[catalog] không lấy được dữ liệu từ ERP, dùng dữ liệu tĩnh:', e.message);
    return duLieuTinh();
  } finally {
    clearTimeout(hen);
  }
}
