'use strict';

/**
 * Module Marketing — quản lý website bán hàng và sản phẩm của từng website.
 *
 *   /api/marketing-web/sites          — CRUD website, cần JWT + quyền admin
 *   /api/marketing-web/products       — CRUD sản phẩm của một website
 *   /api/public/web/site              — công khai: thông tin một website
 *   /api/public/web/products          — công khai: sản phẩm đã bật của một website
 *
 * Website tĩnh gọi API công khai bằng `?site=<site_key>` (VD site=bepviet).
 * Vẫn chấp nhận `?company_id=` cho site cấu hình từ trước migration 728.
 *
 * Bảng `web_products` là lớp marketing riêng, KHÔNG phải bảng `products` nội bộ:
 * `products` ở mức linh kiện và có `cost_price` (giá vốn) nên không được lộ ra web.
 * Xem database/727_web_products.sql và database/728_web_sites.sql.
 *
 * Chưa chạy migration thì API không gãy: GET trả mảng rỗng kèm `migration_required`,
 * website tự rơi về dữ liệu tĩnh của nó.
 */

const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { isAdminLike, isSystemAdmin } = require('../helpers/adminRole');

const BANG_SP = 'web_products';
const BANG_SITE = 'web_sites';

/**
 * Chưa chạy migration → bảng không tồn tại. Hai dạng lỗi khác nhau tuỳ đường đi:
 *   • Postgres thuần: code 42P01 "relation ... does not exist"
 *   • Qua PostgREST (supabase-js): code PGRST205 "Could not find the table ... in the schema cache"
 * Thiếu một trong hai là API trả 500 thay vì rơi về rỗng — đã đo thực tế.
 */
function laThieuBang(err) {
  if (!err) return false;
  const msg = err.message || '';
  return (
    err.code === '42P01'
    || err.code === 'PGRST205'
    || /relation .*(web_products|web_sites).* does not exist/i.test(msg)
    || /could not find the table .*(web_products|web_sites)/i.test(msg)
  );
}

/** Đã chạy 727 nhưng chưa chạy 728: bảng có, cột site_id chưa có. */
function laThieuCotSite(err) {
  if (!err) return false;
  const msg = err.message || '';
  return (
    err.code === '42703'
    || err.code === 'PGRST204'
    || /column .*site_id.* does not exist/i.test(msg)
    || /could not find the 'site_id' column/i.test(msg)
  );
}

/** Bỏ dấu tiếng Việt rồi chuyển thành slug URL: "Tủ bếp chữ L" → "tu-bep-chu-l". */
function taoSlug(chuoi, gioiHan = 160) {
  return String(chuoi || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, gioiHan);
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
function dungFormSanPham(body, { laTao }) {
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

function dungFormSite(body) {
  const b = body || {};
  const ten = String(b.name || '').trim();
  return {
    name: ten,
    site_key: taoSlug(b.site_key || ten, 64),
    domain: b.domain != null ? String(b.domain).trim().replace(/^https?:\/\//, '').replace(/\/+$/, '') || null : null,
    description: b.description != null ? String(b.description).trim() || null : null,
    is_active: b.is_active === undefined ? true : !!b.is_active,
  };
}

/* ══════════════════════════ Router quản trị ══════════════════════════ */

const adminRouter = Router();
adminRouter.use(auth);

adminRouter.use((req, res, next) => {
  if (!isAdminLike(req.user)) {
    return res.status(403).json({ error: 'Chỉ admin hoặc sales admin được quản lý website.' });
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

/** Đọc site và kiểm tra nó thuộc phạm vi công ty của người gọi. */
async function laySiteTrongPhamVi(req, res, siteId, companyId) {
  const { data, error } = await supabase.from(BANG_SITE).select('*').eq('id', siteId).maybeSingle();
  if (laThieuBang(error)) {
    res.status(503).json({ error: 'Chưa chạy database/728_web_sites.sql.' });
    return null;
  }
  if (error) {
    res.status(500).json({ error: error.message });
    return null;
  }
  if (!data) {
    res.status(404).json({ error: 'Không tìm thấy website.' });
    return null;
  }
  if (!isSystemAdmin(req.user) && data.company_id !== companyId) {
    res.status(403).json({ error: 'Website thuộc công ty khác.' });
    return null;
  }
  return data;
}

/* ── Website ── */

adminRouter.get('/sites', async (req, res) => {
  const scope = phamViCongTy(req, res);
  if (!scope.ok) return;

  let q = supabase.from(BANG_SITE).select('*').order('created_at', { ascending: true });
  if (scope.companyId) q = q.eq('company_id', scope.companyId);

  const { data, error } = await q;
  if (laThieuBang(error)) {
    return res.json({ items: [], migration_required: true, hint: 'Chưa chạy database/728_web_sites.sql' });
  }
  if (error) return res.status(500).json({ error: error.message });
  res.json({ items: data || [] });
});

adminRouter.post('/sites', async (req, res) => {
  const scope = phamViCongTy(req, res);
  if (!scope.ok) return;

  const form = dungFormSite(req.body);
  if (!form.name) return res.status(400).json({ error: 'Thiếu tên website.' });
  if (!form.site_key) return res.status(400).json({ error: 'Tên website không tạo được mã site hợp lệ.' });
  if (!scope.companyId) return res.status(400).json({ error: 'Chọn công ty sở hữu website trước.' });

  const { data, error } = await supabase
    .from(BANG_SITE)
    .insert({ ...form, company_id: scope.companyId, created_by: req.user?.id || null })
    .select()
    .single();

  if (laThieuBang(error)) return res.status(503).json({ error: 'Chưa chạy database/728_web_sites.sql.' });
  if (error?.code === '23505') {
    return res.status(409).json({ error: `Mã site "${form.site_key}" đã có website khác dùng. Mã phải duy nhất toàn hệ thống.` });
  }
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

adminRouter.put('/sites/:id', async (req, res) => {
  const scope = phamViCongTy(req, res);
  if (!scope.ok) return;

  const site = await laySiteTrongPhamVi(req, res, req.params.id, scope.companyId);
  if (!site) return;

  const form = dungFormSite(req.body);
  if (!form.name) return res.status(400).json({ error: 'Thiếu tên website.' });
  if (!form.site_key) return res.status(400).json({ error: 'Mã site không hợp lệ.' });

  const { data, error } = await supabase.from(BANG_SITE).update(form).eq('id', site.id).select().single();
  if (error?.code === '23505') {
    return res.status(409).json({ error: `Mã site "${form.site_key}" đã có website khác dùng.` });
  }
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

adminRouter.delete('/sites/:id', async (req, res) => {
  const scope = phamViCongTy(req, res);
  if (!scope.ok) return;

  const site = await laySiteTrongPhamVi(req, res, req.params.id, scope.companyId);
  if (!site) return;

  // Đếm trước để người xoá biết mình sắp mất bao nhiêu sản phẩm (FK là ON DELETE CASCADE).
  const { count } = await supabase
    .from(BANG_SP)
    .select('id', { count: 'exact', head: true })
    .eq('site_id', site.id);

  if ((count || 0) > 0 && String(req.query.force || '') !== '1') {
    return res.status(409).json({
      error: `Website "${site.name}" còn ${count} sản phẩm. Xoá website sẽ xoá luôn số sản phẩm này.`,
      product_count: count,
      need_force: true,
    });
  }

  const { error } = await supabase.from(BANG_SITE).delete().eq('id', site.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, deleted_products: count || 0 });
});

/* ── Sản phẩm ── */

adminRouter.get('/products', async (req, res) => {
  const scope = phamViCongTy(req, res);
  if (!scope.ok) return;

  const siteId = String(req.query.site_id || '').trim();

  let q = supabase.from(BANG_SP).select('*').order('order_index', { ascending: true }).order('created_at', { ascending: true });
  if (siteId) q = q.eq('site_id', siteId);
  else if (scope.companyId) q = q.eq('company_id', scope.companyId);

  const { data, error } = await q;
  if (laThieuBang(error)) {
    return res.json({ items: [], migration_required: true, hint: 'Chưa chạy database/727_web_products.sql' });
  }
  if (laThieuCotSite(error)) {
    return res.json({ items: [], migration_required: true, hint: 'Chưa chạy database/728_web_sites.sql' });
  }
  if (error) return res.status(500).json({ error: error.message });
  res.json({ items: data || [] });
});

adminRouter.post('/products', async (req, res) => {
  const scope = phamViCongTy(req, res);
  if (!scope.ok) return;

  const siteId = String(req.body?.site_id || req.query.site_id || '').trim();
  if (!siteId) return res.status(400).json({ error: 'Chọn website trước khi thêm sản phẩm.' });

  const site = await laySiteTrongPhamVi(req, res, siteId, scope.companyId);
  if (!site) return;

  const form = dungFormSanPham(req.body, { laTao: true });
  if (!form.name) return res.status(400).json({ error: 'Thiếu tên sản phẩm.' });
  if (!form.slug) return res.status(400).json({ error: 'Tên sản phẩm không tạo được slug hợp lệ.' });

  const { data, error } = await supabase
    .from(BANG_SP)
    // company_id lấy theo site, không lấy theo query — site là nguồn sự thật.
    .insert({ ...form, site_id: site.id, company_id: site.company_id, created_by: req.user?.id || null })
    .select()
    .single();

  if (laThieuBang(error) || laThieuCotSite(error)) {
    return res.status(503).json({ error: 'Chưa chạy đủ migration 727/728 nên chưa lưu được.' });
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
    .from(BANG_SP)
    .select('id, company_id, site_id')
    .eq('id', req.params.id)
    .maybeSingle();

  if (laThieuBang(loiDoc) || laThieuCotSite(loiDoc)) {
    return res.status(503).json({ error: 'Chưa chạy đủ migration 727/728 nên chưa lưu được.' });
  }
  if (loiDoc) return res.status(500).json({ error: loiDoc.message });
  if (!hienTai) return res.status(404).json({ error: 'Không tìm thấy sản phẩm.' });
  if (!isSystemAdmin(req.user) && hienTai.company_id !== scope.companyId) {
    return res.status(403).json({ error: 'Sản phẩm thuộc công ty khác.' });
  }

  const form = dungFormSanPham(req.body, { laTao: false });
  if (!form.name) return res.status(400).json({ error: 'Thiếu tên sản phẩm.' });

  // Cho phép chuyển sản phẩm sang website khác, nhưng site đích phải trong phạm vi.
  const siteMoi = String(req.body?.site_id || '').trim();
  if (siteMoi && siteMoi !== hienTai.site_id) {
    const site = await laySiteTrongPhamVi(req, res, siteMoi, scope.companyId);
    if (!site) return;
    form.site_id = site.id;
    form.company_id = site.company_id;
  }

  const { data, error } = await supabase.from(BANG_SP).update(form).eq('id', req.params.id).select().single();
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
    .from(BANG_SP)
    .select('id, company_id')
    .eq('id', req.params.id)
    .maybeSingle();

  if (laThieuBang(loiDoc)) return res.status(503).json({ error: 'Chưa chạy database/727_web_products.sql.' });
  if (loiDoc) return res.status(500).json({ error: loiDoc.message });
  if (!hienTai) return res.status(404).json({ error: 'Không tìm thấy sản phẩm.' });
  if (!isSystemAdmin(req.user) && hienTai.company_id !== scope.companyId) {
    return res.status(403).json({ error: 'Sản phẩm thuộc công ty khác.' });
  }

  const { error } = await supabase.from(BANG_SP).delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

/* ══════════════════════════ Router công khai ══════════════════════════ */

const publicRouter = Router();

/** Cột trả ra web — cố ý không có created_by/created_at để không lộ dữ liệu nội bộ. */
const COT_CONG_KHAI =
  'id, slug, name, category, category_key, material, material_key, price_from, price_unit, ' +
  'size_text, description, features, images, color_from, color_to, is_featured, order_index';

/**
 * Nhận ?site=<site_key> (cách dùng chuẩn) hoặc ?company_id=<uuid> (tương thích cũ).
 * Trả { loi } nếu không xác định được, { site } hoặc { companyId } nếu xác định được.
 */
async function timNguon(req) {
  const siteKey = String(req.query.site || '').trim();
  if (siteKey) {
    const { data, error } = await supabase
      .from(BANG_SITE)
      .select('id, site_key, name, domain, company_id, is_active')
      .eq('site_key', siteKey)
      .maybeSingle();
    if (laThieuBang(error)) return { chuaCaiDat: true };
    if (error) return { loi: error.message };
    if (!data || !data.is_active) return { chuaCaiDat: true };
    return { site: data };
  }

  const companyId = String(req.query.company_id || '').trim();
  if (companyId) return { companyId };
  return { loi: 'Thiếu tham số site hoặc company_id.', trangThai: 400 };
}

publicRouter.get('/site', async (req, res) => {
  const nguon = await timNguon(req);
  if (nguon.loi) return res.status(nguon.trangThai || 500).json({ error: nguon.loi });
  if (nguon.chuaCaiDat || !nguon.site) return res.json({ site: null });

  const { site } = nguon;
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ site: { site_key: site.site_key, name: site.name, domain: site.domain } });
});

publicRouter.get('/products', async (req, res) => {
  const nguon = await timNguon(req);
  if (nguon.loi) return res.status(nguon.trangThai || 500).json({ error: nguon.loi });
  // Site chưa tạo / đã tắt / chưa chạy migration: trả rỗng để website dùng dữ liệu tĩnh,
  // không bao giờ để trang trắng vì backend.
  if (nguon.chuaCaiDat) return res.json({ items: [], categories: [], materials: [], source: 'empty' });

  let q = supabase
    .from(BANG_SP)
    .select(COT_CONG_KHAI)
    .eq('is_published', true)
    .order('order_index', { ascending: true })
    .order('created_at', { ascending: true });

  q = nguon.site ? q.eq('site_id', nguon.site.id) : q.eq('company_id', nguon.companyId);

  const { data, error } = await q;
  if (laThieuBang(error) || laThieuCotSite(error)) {
    return res.json({ items: [], categories: [], materials: [], source: 'empty' });
  }
  if (error) return res.status(500).json({ error: error.message });

  const items = data || [];
  const nhom = (khoa, khoaTen) => {
    const map = new Map();
    for (const sp of items) {
      if (sp[khoa]) map.set(sp[khoa], sp[khoaTen] || sp[khoa]);
    }
    return [...map].map(([id, ten]) => ({ id, ten }));
  };

  res.set('Cache-Control', 'public, max-age=60');
  res.json({
    items,
    categories: nhom('category_key', 'category'),
    materials: nhom('material_key', 'material'),
    site: nguon.site ? { site_key: nguon.site.site_key, name: nguon.site.name } : null,
    source: 'db',
  });
});

module.exports = { adminRouter, publicRouter };
