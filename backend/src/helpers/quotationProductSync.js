/**
 * Đồng bộ dòng báo giá ↔ danh mục Sản phẩm (bảng `products`).
 *
 * Mục tiêu: mỗi khi tạo/sửa báo giá (nhập tay hoặc từ Excel), tự động gán
 * `product_id` cho từng dòng — nếu công ty đã có sản phẩm cùng tên thì liên
 * kết, chưa có thì tạo mới trong danh mục. Nhờ vậy các báo giá sau chỉ cần
 * so khớp theo `product_id` (ổn định) thay vì so tên (dễ lệch chính tả).
 */
const { supabase } = require('../config/supabase');

function stripDiacritics(str) {
  return String(str || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd');
}

/** Mã sản phẩm gợi ý từ tên: viết hoa không dấu, rút gọn mỗi từ, nối bằng "-". */
function slugifyProductCode(name) {
  const ascii = stripDiacritics(name).toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const words = ascii.split('-').filter(Boolean);
  const abbrev = words.slice(0, 6).map((w) => w.slice(0, 4)).join('-');
  return abbrev || 'SP';
}

/** Sinh mã sản phẩm không trùng (cột `products.code` có UNIQUE). */
async function generateUniqueProductCode(name) {
  const base = slugifyProductCode(name);
  for (let attempt = 0; attempt < 5; attempt++) {
    const suffix = attempt === 0 ? '' : `-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const candidate = `${base}${suffix}`.slice(0, 60);
    const { data } = await supabase.from('products').select('id').eq('code', candidate).maybeSingle();
    if (!data) return candidate;
  }
  return `${base}-${Date.now()}`.slice(0, 60);
}

/**
 * Với mỗi item (đã build từ quotation_items, có name/unit/unit_price/length/width/height):
 * - Có sản phẩm cùng tên (cùng công ty) trong danh mục → gán `product_id`, điền thêm kích
 *   thước nếu danh mục đang thiếu (không đè giá/kích thước đã có sẵn).
 * - Chưa có → tạo sản phẩm mới từ dữ liệu dòng báo giá rồi gán `product_id`.
 *
 * Mutates từng `item.product_id` trực tiếp — gọi hàm này TRƯỚC khi insert quotation_items.
 * @param {Array<Record<string, any>>} items
 * @param {string|null} companyId
 */
async function syncQuotationItemsWithProductCatalog(items, companyId) {
  const synced = [];
  const created = [];
  for (const item of items || []) {
    const name = String(item.name || '').trim();
    if (item.product_id) continue; // Đã chọn sẵn sản phẩm (vd. từ dropdown) → giữ nguyên, không dò lại
    if (name.length < 3) continue;
    try {
      let q = supabase.from('products').select('id, dimensions').ilike('name', name);
      q = companyId ? q.eq('company_id', companyId) : q.is('company_id', null);
      const { data: existingRows } = await q.limit(1);
      const existing = existingRows?.[0];
      if (existing) {
        item.product_id = existing.id;
        synced.push({ name, product_id: existing.id });
        const dim = existing.dimensions || {};
        const hasDim = dim.ngang || dim.cao || dim.sau;
        if (!hasDim && (item.length || item.width || item.height)) {
          await supabase.from('products').update({
            dimensions: { ngang: item.length || null, cao: item.height || null, sau: item.width || null },
            updated_at: new Date().toISOString(),
          }).eq('id', existing.id);
        }
        continue;
      }

      const code = await generateUniqueProductCode(name);
      const dimensions = (item.length || item.width || item.height)
        ? { ngang: item.length || null, cao: item.height || null, sau: item.width || null }
        : null;
      const { data: newRow, error } = await supabase.from('products').insert({
        code, name, unit: item.unit || 'cái',
        selling_price: item.unit_price || 0,
        dimensions,
        company_id: companyId || null,
        status: 'active',
      }).select('id').single();
      if (error) throw error;
      item.product_id = newRow.id;
      created.push({ name, product_id: newRow.id });
    } catch (e) {
      console.warn('[quotationProductSync] Lỗi đồng bộ dòng:', name.slice(0, 40), '—', e.message);
    }
  }
  if (synced.length || created.length) {
    console.log(`[quotationProductSync] Liên kết ${synced.length} dòng, tạo mới ${created.length} sản phẩm`);
  }
  return { synced, created };
}

module.exports = { syncQuotationItemsWithProductCatalog, generateUniqueProductCode, slugifyProductCode };
