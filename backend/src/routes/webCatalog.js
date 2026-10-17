'use strict';

/**
 * Danh mục sản phẩm của website bán hàng (bảng `web_products`).
 *
 *   /api/marketing-web/products       — quản trị, cần JWT + quyền admin (module marketing)
 *   /api/public/web/products          — công khai, không cần đăng nhập, website gọi trực tiếp
 *
 * Bảng `web_products` là lớp marketing riêng, KHÔNG phải bảng `products` nội bộ:
 * `products` ở mức linh kiện và có `cost_price` (giá vốn) nên không được lộ ra web.
 * Xem database/727_web_products.sql.
 *
 * Chưa chạy migration 727 thì API không gãy: GET trả mảng rỗng kèm `migration_required`,
 * website tự rơi về dữ liệu tĩnh của nó.
 */

const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { isAdminLike, isSystemAdmin } = require('../helpers/adminRole');

const TABLE = 'web_products';

/** Postgres 42P01 = undefined_table. Supabase trả code này khi chưa chạy migration. */
function laThieuBang(err) {
  if (!err) return false;
  return err.code === '42P01' || /relation .*web_products.* does not exist/i.test(err.message || '');
}

/** Bỏ dấu tiếng Việt rồi chuyển thành slug URL: "Tủ bếp chữ L" → "tu-bep-chu-l". */
function taoSlug(chuoi) {
  return String(chuoi || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
}

function mangChuoi(giaTri) {
  if (Array.isArray(giaTri)) return giaTri.map((v) => String(v).trim()).filter(Boolean);
  if (typeof giaTri === 'string') {
    return giaTri
      .split('\n')
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

function soTien(giaTri) {
  const n = Number(giaTri);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Chỉ các cột được phép ghi — body thừa trường gì cũng bị bỏ qua. */
function dungForm(body, { laTao }) {
  const b = body || {};
  const ten = String(b.name || '').trim();
  const out = {
    name: ten,
    category: b.category != null ? String(b.category).trim() || null : null,
    category_key: taoSlug(b.category_key || b.category) || null,
    material: b.material != null ? String(b.material).trim() || null : null,
    material_key: taoSlug(b.material_key || b.material) || null,
    price_from: soTien(b.price_from),
    price_unit: String(b.price_unit || 'm dài').trim().slice(0, 32),
    size_text: b.size_text != null ? String(b.size_text).trim() || null : null,
    description: b.description != null ? String(b.description).trim() || null : null,
    features: mangChuoi(b.features),
    images: mangChuoi(b.images),
    color_from: b.color_from ? String(b.color_from).trim().slice(0, 16) : null,
    color_to: b.color_to ? String(b.color_to).trim().slice(0, 16) : null,
    is_featured: !!b.is_featured,
    is_published: b.is_published === undefined ? true : !!b.is_published,
    order_index: Number.isFinite(Number(b.order_index)) ? Number(b.order_index) : 0,
  };
  const slug = taoSlug(b.slug || ten);
  if (laTao || b.slug !== undefined) out.slug = slug;
  return out;
}

/* ══════════════════════════ Router quản trị ══════════════════════════ */

const adminRouter = Router();
adminRouter.use(auth);

adminRouter.use((req, res, next) => {
  if (!isAdminLike(req.user)) {
    return res.status(403).json({ error: 'Chỉ admin hoặc sales admin được sửa sản phẩm website.' });
  }
  next();
});

/**
 * Admin hệ thống chọn công ty qua ?company_id (website nào cũng xem được).
 * Người khác bị khoá vào công ty của mình — không mượn company_id trong body được.
 */
function phamViCongTy(req, res) {
  if (isSystemAdmin(req.user)) {
    const q = req.query.company_id || req.body?.company_id;
    const id = q && String(q).trim() ? String(q).trim() : null;
    return { ok: true, companyId: id };
  }
  const cid = req.user?.company_id || null;
  if (!cid) {
    res.status(400).json({ error: 'Tài khoản chưa gắn công ty. Gán công ty rồi đăng nhập lại.' });
    return { ok: false, companyId: null };
  }
  return { ok: true, companyId: cid };
}

adminRouter.get('/products', async (req, res) => {
  const scope = phamViCongTy(req, res);
  if (!scope.ok) return;

  let q = supabase.from(TABLE).select('*').order('order_index', { ascending: true }).order('created_at', { ascending: true });
  if (scope.companyId) q = q.eq('company_id', scope.companyId);

  const { data, error } = await q;
  if (laThieuBang(error)) {
    return res.json({ items: [], migration_required: true, hint: 'Chưa chạy database/727_web_products.sql' });
  }
  if (error) return res.status(500).json({ error: error.message });
  res.json({ items: data || [] });
});

adminRouter.post('/products', async (req, res) => {
  const scope = phamViCongTy(req, res);
  if (!scope.ok) return;

  const form = dungForm(req.body, { laTao: true });
  if (!form.name) return res.status(400).json({ error: 'Thiếu tên sản phẩm.' });
  if (!form.slug) return res.status(400).json({ error: 'Tên sản phẩm không tạo được slug hợp lệ.' });
  if (!scope.companyId) return res.status(400).json({ error: 'Chọn công ty sở hữu website trước khi thêm sản phẩm.' });

  const { data, error } = await supabase
    .from(TABLE)
    .insert({ ...form, company_id: scope.companyId, created_by: req.user?.id || null })
    .select()
    .single();

  if (laThieuBang(error)) {
    return res.status(503).json({ error: 'Chưa chạy database/727_web_products.sql nên chưa lưu được.' });
  }
  if (error?.code === '23505') {
    return res.status(409).json({ error: `Slug "${form.slug}" đã có sản phẩm khác dùng. Đổi tên hoặc nhập slug khác.` });
  }
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

adminRouter.put('/products/:id', async (req, res) => {
  const scope = phamViCongTy(req, res);
  if (!scope.ok) return;

  const { data: hienTai, error: loiDoc } = await supabase
    .from(TABLE)
    .select('id, company_id')
    .eq('id', req.params.id)
    .maybeSingle();

  if (laThieuBang(loiDoc)) {
    return res.status(503).json({ error: 'Chưa chạy database/727_web_products.sql nên chưa lưu được.' });
  }
  if (loiDoc) return res.status(500).json({ error: loiDoc.message });
  if (!hienTai) return res.status(404).json({ error: 'Không tìm thấy sản phẩm.' });
  if (!isSystemAdmin(req.user) && hienTai.company_id !== scope.companyId) {
    return res.status(403).json({ error: 'Sản phẩm thuộc công ty khác.' });
  }

  const form = dungForm(req.body, { laTao: false });
  if (!form.name) return res.status(400).json({ error: 'Thiếu tên sản phẩm.' });

  const { data, error } = await supabase.from(TABLE).update(form).eq('id', req.params.id).select().single();
  if (error?.code === '23505') {
    return res.status(409).json({ error: `Slug "${form.slug}" đã có sản phẩm khác dùng.` });
  }
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

adminRouter.delete('/products/:id', async (req, res) => {
  const scope = phamViCongTy(req, res);
  if (!scope.ok) return;

  const { data: hienTai, error: loiDoc } = await supabase
    .from(TABLE)
    .select('id, company_id')
    .eq('id', req.params.id)
    .maybeSingle();

  if (laThieuBang(loiDoc)) return res.status(503).json({ error: 'Chưa chạy database/727_web_products.sql.' });
  if (loiDoc) return res.status(500).json({ error: loiDoc.message });
  if (!hienTai) return res.status(404).json({ error: 'Không tìm thấy sản phẩm.' });
  if (!isSystemAdmin(req.user) && hienTai.company_id !== scope.companyId) {
    return res.status(403).json({ error: 'Sản phẩm thuộc công ty khác.' });
  }

  const { error } = await supabase.from(TABLE).delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

/* ══════════════════════════ Router công khai ══════════════════════════ */

const publicRouter = Router();

/** Cột trả ra web — cố ý không có created_by/created_at để không lộ dữ liệu nội bộ. */
const COT_CONG_KHAI =
  'id, slug, name, category, category_key, material, material_key, price_from, price_unit, ' +
  'size_text, description, features, images, color_from, color_to, is_featured, order_index';

publicRouter.get('/products', async (req, res) => {
  const companyId = String(req.query.company_id || '').trim();
  if (!companyId) {
    return res.status(400).json({ error: 'Thiếu company_id.' });
  }

  const { data, error } = await supabase
    .from(TABLE)
    .select(COT_CONG_KHAI)
    .eq('company_id', companyId)
    .eq('is_published', true)
    .order('order_index', { ascending: true })
    .order('created_at', { ascending: true });

  // Chưa chạy migration: trả rỗng thay vì 500 để website rơi về dữ liệu tĩnh, không trắng trang.
  if (laThieuBang(error)) return res.json({ items: [], source: 'empty' });
  if (error) return res.status(500).json({ error: error.message });

  const items = data || [];
  const nhom = (khoa, ten) => {
    const map = new Map();
    for (const sp of items) {
      if (sp[khoa]) map.set(sp[khoa], sp[ten] || sp[khoa]);
    }
    return [...map].map(([id, label]) => ({ id, ten: label }));
  };

  res.set('Cache-Control', 'public, max-age=60');
  res.json({
    items,
    categories: nhom('category_key', 'category'),
    materials: nhom('material_key', 'material'),
    source: 'db',
  });
});

module.exports = { adminRouter, publicRouter };
