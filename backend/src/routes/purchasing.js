/**
 * Module Mua hàng — thương hiệu, catalog SP, Lệnh đặt hàng (PO)
 * API prefix: /api/purchasing
 */
const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/newPermission');
const { isSystemAdmin, isAdminLike } = require('../helpers/adminRole');

const r = Router();
r.use(auth);

const PO_STATUSES = new Set([
  'draft', 'submitted', 'confirmed', 'ordered',
  'partial_received', 'received', 'cancelled',
]);
const BILL_STATUSES = new Set(['draft', 'confirmed', 'partial_paid', 'paid', 'cancelled']);

const PO_SELECT = `
  id, code, company_id, lead_id, supplier_id,
  customer_name, customer_phone, customer_address,
  title, notes, order_date, expected_date,
  subtotal, tax_rate, tax_amount, total, status,
  submitted_at, confirmed_at, ordered_at, received_at, cancelled_at, cancel_reason,
  created_by, created_at, updated_at,
  supplier:suppliers(id, name, contact_phone),
  creator:users!purchase_orders_created_by_fkey(id, full_name, email),
  lead:crm_leads(id, title, code, type),
  items:purchase_order_items(*)
`;

const PO_SELECT_V2 = `
  id, code, company_id, lead_id, project_id, supplier_id,
  customer_name, customer_phone, customer_address,
  title, notes, order_date, expected_date, due_date,
  subtotal, tax_rate, tax_amount, total, paid_amount, payment_status, status,
  submitted_at, confirmed_at, ordered_at, received_at, cancelled_at, cancel_reason,
  created_by, created_at, updated_at,
  supplier:suppliers(id, name, contact_phone),
  creator:users!purchase_orders_created_by_fkey(id, full_name, email),
  lead:crm_leads(id, title, code, type, project_id),
  project:projects(id, code, name),
  items:purchase_order_items(*)
`;

function isMissingFinanceSchema(error) {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === '42P01' || error?.code === '42703'
    || message.includes('supplier_bills') || message.includes('supplier_payments')
    || message.includes('project_id') || message.includes('purchase_request_id');
}

async function loadPurchaseOrder(poId) {
  const v2 = await supabase.from('purchase_orders').select(PO_SELECT_V2).eq('id', poId).maybeSingle();
  if (!v2.error) return v2;
  if (!isMissingFinanceSchema(v2.error)) return v2;
  return supabase.from('purchase_orders').select(PO_SELECT).eq('id', poId).maybeSingle();
}

function resolveCompanyId(req, override) {
  if (isSystemAdmin(req.user) && override && String(override).trim()) {
    return String(override).trim();
  }
  return req.user?.company_id || null;
}

function num(v, fallback = 0) {
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function calcTotals(items, taxRate) {
  const subtotal = (items || []).reduce((s, it) => s + num(it.amount), 0);
  const rate = num(taxRate, 10);
  const tax_amount = Math.round(subtotal * rate) / 100;
  return { subtotal, tax_rate: rate, tax_amount, total: subtotal + tax_amount };
}

function normalizeItems(rawItems) {
  return (rawItems || []).map((it, idx) => {
    const quantity = num(it.quantity, 1);
    const unit_price = num(it.unit_price, 0);
    const amount = it.amount != null ? num(it.amount) : Math.round(quantity * unit_price * 100) / 100;
    const item = {
      product_id: it.product_id || null,
      item_order: it.item_order != null ? Number(it.item_order) : idx,
      name: String(it.name || '').trim() || 'Hạng mục',
      description: it.description ? String(it.description).trim() : null,
      unit: it.unit ? String(it.unit).trim() : 'cái',
      quantity,
      unit_price,
      amount,
      brand_name: it.brand_name ? String(it.brand_name).trim() : null,
      sku: it.sku ? String(it.sku).trim() : null,
      image_url: it.image_url || null,
      notes: it.notes ? String(it.notes).trim() : null,
    };
    if (it.purchase_request_id) item.purchase_request_id = it.purchase_request_id;
    if (it.received_quantity !== undefined) item.received_quantity = Math.max(0, num(it.received_quantity));
    if (['pending', 'pass', 'fail'].includes(String(it.qc_status || ''))) item.qc_status = String(it.qc_status);
    return item;
  }).filter((it) => it.name);
}

async function assertProjectBusinessScope(companyId, projectId) {
  if (!projectId) return { project: null };
  const { data: project, error } = await supabase
    .from('projects')
    .select('id, company_id, code, name')
    .eq('id', projectId)
    .maybeSingle();
  if (error) throw error;
  if (!project) return { error: 'Không tìm thấy Project' };
  if (String(project.company_id || '') === String(companyId || '')) return { project };

  const directLead = await supabase
    .from('crm_leads')
    .select('id')
    .eq('project_id', projectId)
    .eq('company_id', companyId)
    .limit(1)
    .maybeSingle();
  if (directLead.data) return { project };

  const { data: links } = await supabase
    .from('crm_deal_projects')
    .select('deal_id')
    .eq('project_id', projectId);
  const dealIds = (links || []).map((row) => row.deal_id).filter(Boolean);
  if (dealIds.length) {
    const linkedLead = await supabase
      .from('crm_leads')
      .select('id')
      .in('id', dealIds)
      .eq('company_id', companyId)
      .limit(1)
      .maybeSingle();
    if (linkedLead.data) return { project };
  }
  return { error: 'Project không thuộc phạm vi nghiệp vụ của công ty đang chọn' };
}

async function nextLdhCode() {
  const year = new Date().getFullYear();
  const prefix = `LDH-${year}-`;
  const { data } = await supabase
    .from('purchase_orders')
    .select('code')
    .like('code', `${prefix}%`)
    .order('code', { ascending: false })
    .limit(20);
  let max = 0;
  for (const row of data || []) {
    const m = String(row.code || '').match(/LDH-\d{4}-(\d+)/i);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

async function nextSupplierBillCode(companyId) {
  const year = new Date().getFullYear();
  const prefix = `HDNCC-${year}-`;
  const { data, error } = await supabase
    .from('supplier_bills')
    .select('code')
    .eq('company_id', companyId)
    .like('code', `${prefix}%`)
    .order('code', { ascending: false })
    .limit(20);
  if (error) throw error;
  let max = 0;
  for (const row of data || []) {
    const match = String(row.code || '').match(/HDNCC-\d{4}-(\d+)/i);
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

async function assertBillInScope(req, res, billId) {
  const { data: bill, error } = await supabase
    .from('supplier_bills')
    .select('*')
    .eq('id', billId)
    .maybeSingle();
  if (error) {
    if (isMissingFinanceSchema(error)) res.status(503).json({ error: 'Chưa áp dụng migration 581 cho công nợ nhà cung cấp', code: 'SUPPLIER_PAYABLES_SCHEMA_REQUIRED' });
    else res.status(500).json({ error: error.message });
    return null;
  }
  if (!bill) {
    res.status(404).json({ error: 'Không tìm thấy hóa đơn nhà cung cấp' });
    return null;
  }
  if (!isSystemAdmin(req.user) && req.user?.company_id
      && String(bill.company_id) !== String(req.user.company_id)) {
    res.status(403).json({ error: 'Không có quyền truy cập hóa đơn nhà cung cấp này' });
    return null;
  }
  return bill;
}

async function syncPurchaseOrderPayment(purchaseOrderId) {
  if (!purchaseOrderId) return;
  const { data: bills, error } = await supabase
    .from('supplier_bills')
    .select('total, paid_amount, status')
    .eq('purchase_order_id', purchaseOrderId)
    .neq('status', 'cancelled');
  if (error) throw error;
  const paidAmount = (bills || []).reduce((sum, bill) => sum + num(bill.paid_amount), 0);
  const { data: po, error: poError } = await supabase
    .from('purchase_orders')
    .select('total')
    .eq('id', purchaseOrderId)
    .maybeSingle();
  if (poError) throw poError;
  const total = num(po?.total);
  const paymentStatus = paidAmount <= 0 ? 'unpaid' : (total > 0 && paidAmount >= total ? 'paid' : 'partial');
  const { error: updateError } = await supabase
    .from('purchase_orders')
    .update({ paid_amount: paidAmount, payment_status: paymentStatus, updated_at: new Date().toISOString() })
    .eq('id', purchaseOrderId);
  if (updateError) throw updateError;
}

async function syncSupplierBillPayment(billId) {
  const { data: bill, error: billError } = await supabase
    .from('supplier_bills')
    .select('*')
    .eq('id', billId)
    .single();
  if (billError) throw billError;
  const { data: payments, error: paymentError } = await supabase
    .from('supplier_payments')
    .select('amount')
    .eq('supplier_bill_id', billId);
  if (paymentError) throw paymentError;
  const paidAmount = (payments || []).reduce((sum, payment) => sum + num(payment.amount), 0);
  let status = bill.status;
  if (!['draft', 'cancelled'].includes(status)) {
    status = paidAmount <= 0 ? 'confirmed' : (num(bill.total) > 0 && paidAmount >= num(bill.total) ? 'paid' : 'partial_paid');
  }
  const { data: updated, error: updateError } = await supabase
    .from('supplier_bills')
    .update({ paid_amount: paidAmount, status, updated_at: new Date().toISOString() })
    .eq('id', billId)
    .select('*')
    .single();
  if (updateError) throw updateError;
  await syncPurchaseOrderPayment(bill.purchase_order_id);
  return updated;
}

async function writePurchasingAudit(req, {
  companyId, entityType, entityId, action, before = null, after = null,
}) {
  const { error } = await supabase.from('work_audit_logs').insert({
    company_id: companyId,
    actor_user_id: req.user?.id || req.user?.userId || null,
    entity_type: entityType,
    entity_id: entityId,
    action,
    before,
    after,
  });
  if (error) console.warn('[purchasing audit]', error.message);
}

async function assertPoInScope(req, res, poId) {
  const { data: row } = await supabase
    .from('purchase_orders')
    .select('id, company_id, status, lead_id')
    .eq('id', poId)
    .maybeSingle();
  if (!row) {
    res.status(404).json({ error: 'Không tìm thấy lệnh đặt hàng' });
    return null;
  }
  if (!isSystemAdmin(req.user) && req.user?.company_id
      && row.company_id && String(row.company_id) !== String(req.user.company_id)) {
    res.status(403).json({ error: 'Không có quyền truy cập lệnh đặt hàng này' });
    return null;
  }
  return row;
}

// ═══ BRANDS ═══════════════════════════════════════════════════

r.get('/brands', requirePermission('mua_hang_brands', 'view'), async (req, res) => {
  try {
    const companyId = resolveCompanyId(req, req.query.company_id);
    let q = supabase
      .from('product_brands')
      .select('*')
      .eq('is_active', true)
      .order('name');
    // Global (company_id null) + company-scoped
    if (companyId && !isSystemAdmin(req.user)) {
      q = q.or(`company_id.eq.${companyId},company_id.is.null`);
    } else if (companyId) {
      q = q.or(`company_id.eq.${companyId},company_id.is.null`);
    }
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[purchasing] list brands', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

r.post('/brands', requirePermission('mua_hang_brands', 'edit'), async (req, res) => {
  try {
    const b = req.body || {};
    const name = String(b.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Thiếu tên thương hiệu' });
    const companyId = resolveCompanyId(req, b.company_id);
    const { data, error } = await supabase.from('product_brands').insert({
      company_id: companyId,
      name,
      code: b.code ? String(b.code).trim().toUpperCase() : null,
      logo_url: b.logo_url || null,
      notes: b.notes ? String(b.notes).trim() : null,
      is_active: true,
    }).select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('[purchasing] create brand', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

r.put('/brands/:id', requirePermission('mua_hang_brands', 'edit'), async (req, res) => {
  try {
    const { id } = req.params;
    const b = req.body || {};
    const update = { updated_at: new Date().toISOString() };
    ['name', 'code', 'logo_url', 'notes'].forEach((f) => {
      if (b[f] !== undefined) update[f] = b[f] == null ? null : String(b[f]).trim();
    });
    if (b.is_active !== undefined) update.is_active = !!b.is_active;
    if (update.code) update.code = update.code.toUpperCase();
    const { data, error } = await supabase
      .from('product_brands')
      .update(update)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[purchasing] update brand', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

r.delete('/brands/:id', requirePermission('mua_hang_brands', 'admin'), async (req, res) => {
  try {
    const { error } = await supabase
      .from('product_brands')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[purchasing] delete brand', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

// ═══ PRODUCTS (filter brand) ══════════════════════════════════

r.get('/products', requirePermission('mua_hang_products', 'view'), async (req, res) => {
  try {
    const companyId = resolveCompanyId(req, req.query.company_id);
    let q = supabase
      .from('products')
      .select('*, category:product_categories(id,name,slug), brand:product_brands(id,name,code,logo_url)')
      .order('name');
    if (companyId) q = q.eq('company_id', companyId);
    if (req.query.brand_id) q = q.eq('brand_id', req.query.brand_id);
    if (req.query.category_id) q = q.eq('category_id', req.query.category_id);
    if (req.query.q) {
      const s = String(req.query.q).trim();
      q = q.or(`name.ilike.%${s}%,code.ilike.%${s}%,sku.ilike.%${s}%`);
    }
    if (req.query.status) q = q.eq('status', req.query.status);
    else q = q.neq('status', 'inactive');
    const { data, error } = await q.limit(500);
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[purchasing] list products', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

r.post('/products', requirePermission('mua_hang_products', 'edit'), async (req, res) => {
  try {
    const b = req.body || {};
    const name = String(b.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Thiếu tên sản phẩm' });
    const companyId = resolveCompanyId(req, b.company_id) || req.user?.company_id;
    if (!companyId && !isSystemAdmin(req.user)) {
      return res.status(400).json({ error: 'Thiếu company_id' });
    }
    let code = b.code ? String(b.code).trim() : null;
    if (!code) {
      const { count } = await supabase.from('products').select('id', { count: 'exact', head: true });
      code = `MH-${String((count || 0) + 1).padStart(4, '0')}`;
    }
    const { data, error } = await supabase.from('products').insert({
      code,
      name,
      description: b.description || null,
      category_id: b.category_id || null,
      brand_id: b.brand_id || null,
      sku: b.sku || null,
      unit: b.unit || 'cái',
      base_price: num(b.base_price),
      cost_price: num(b.cost_price),
      selling_price: num(b.selling_price, num(b.cost_price)),
      vat_rate: num(b.vat_rate, 10),
      image_url: b.image_url || null,
      dimensions: b.dimensions || null,
      material: b.material || null,
      color: b.color || null,
      specifications: b.specifications || null,
      status: 'active',
      company_id: companyId || null,
    }).select('*, category:product_categories(id,name), brand:product_brands(id,name,code)')
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('[purchasing] create product', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

r.put('/products/:id', requirePermission('mua_hang_products', 'edit'), async (req, res) => {
  try {
    const b = req.body || {};
    const update = { updated_at: new Date().toISOString() };
    const fields = [
      'name', 'description', 'category_id', 'brand_id', 'sku', 'unit',
      'base_price', 'cost_price', 'selling_price', 'vat_rate',
      'image_url', 'dimensions', 'material', 'color', 'specifications', 'status', 'code',
    ];
    fields.forEach((f) => {
      if (b[f] !== undefined) update[f] = b[f];
    });
    const { data, error } = await supabase
      .from('products')
      .update(update)
      .eq('id', req.params.id)
      .select('*, category:product_categories(id,name), brand:product_brands(id,name,code)')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[purchasing] update product', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

// ═══ CATEGORIES (reuse product_categories, Hafele-focused list) ══

r.get('/categories', requirePermission('mua_hang_products', 'view'), async (req, res) => {
  try {
    const companyId = resolveCompanyId(req, req.query.company_id);
    let q = supabase
      .from('product_categories')
      .select('*')
      .eq('is_active', true)
      .order('order_index');
    if (companyId) {
      q = q.or(`company_id.eq.${companyId},company_id.is.null`);
    }
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[purchasing] list categories', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

r.post('/categories', requirePermission('mua_hang_products', 'edit'), async (req, res) => {
  try {
    const b = req.body || {};
    const name = String(b.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Thiếu tên danh mục' });
    const companyId = resolveCompanyId(req, b.company_id);
    const slug = b.slug
      ? String(b.slug).trim()
      : name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const { data, error } = await supabase.from('product_categories').insert({
      name,
      slug,
      description: b.description || null,
      parent_id: b.parent_id || null,
      image_url: b.image_url || null,
      order_index: num(b.order_index, 0),
      company_id: companyId,
      is_active: true,
    }).select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('[purchasing] create category', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

r.put('/categories/:id', requirePermission('mua_hang_products', 'edit'), async (req, res) => {
  try {
    const b = req.body || {};
    const update = { updated_at: new Date().toISOString() };
    ['name', 'slug', 'description', 'parent_id', 'image_url', 'order_index', 'is_active'].forEach((f) => {
      if (b[f] !== undefined) update[f] = b[f];
    });
    const { data, error } = await supabase
      .from('product_categories')
      .update(update)
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[purchasing] update category', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

// ═══ PURCHASE ORDERS (Lệnh đặt hàng) ══════════════════════════

r.get('/orders', requirePermission('mua_hang_orders', 'view'), async (req, res) => {
  try {
    const companyId = resolveCompanyId(req, req.query.company_id);
    const listSelectV2 = `
      id, code, company_id, lead_id, project_id, supplier_id,
      customer_name, customer_phone, title, notes,
      order_date, expected_date, due_date, subtotal, tax_rate, tax_amount, total,
      paid_amount, payment_status, status, submitted_at, created_by, created_at, updated_at,
      supplier:suppliers(id, name), creator:users!purchase_orders_created_by_fkey(id, full_name),
      lead:crm_leads(id, title, code, type, project_id), project:projects(id, code, name)
    `;
    const listSelectLegacy = `
      id, code, company_id, lead_id, supplier_id,
      customer_name, customer_phone, title, notes,
      order_date, expected_date, subtotal, tax_rate, tax_amount, total, status,
      submitted_at, created_by, created_at, updated_at,
      supplier:suppliers(id, name), creator:users!purchase_orders_created_by_fkey(id, full_name),
      lead:crm_leads(id, title, code, type)
    `;
    const buildQuery = (select) => {
      let query = supabase.from('purchase_orders').select(select).order('created_at', { ascending: false });
      if (companyId) query = query.eq('company_id', companyId);
      if (req.query.project_id) query = query.eq('project_id', req.query.project_id);
      if (req.query.lead_id) query = query.eq('lead_id', req.query.lead_id);
      if (req.query.supplier_id) query = query.eq('supplier_id', req.query.supplier_id);
      if (req.query.inbox === '1' || req.query.inbox === 'true') query = query.neq('status', 'draft');
      else if (req.query.status) query = query.eq('status', req.query.status);
      return query.limit(500);
    };

    let { data, error } = await buildQuery(listSelectV2);
    if (error && isMissingFinanceSchema(error) && !req.query.project_id) {
      ({ data, error } = await buildQuery(listSelectLegacy));
    }
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[purchasing] list orders', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

r.get('/orders/:id', requirePermission('mua_hang_orders', 'view'), async (req, res) => {
  try {
    const row = await assertPoInScope(req, res, req.params.id);
    if (!row) return;
    const { data, error } = await loadPurchaseOrder(req.params.id);
    if (error) throw error;
    if (data?.items) {
      data.items = [...data.items].sort((a, b) => (a.item_order || 0) - (b.item_order || 0));
    }
    res.json(data);
  } catch (e) {
    console.error('[purchasing] get order', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

r.post('/orders', requirePermission('mua_hang_orders', 'edit'), async (req, res) => {
  try {
    const b = req.body || {};
    let companyId = resolveCompanyId(req, b.company_id) || req.user?.company_id || null;

    // Snapshot customer from lead if provided
    let customer_name = b.customer_name || null;
    let customer_phone = b.customer_phone || null;
    let customer_address = b.customer_address || null;
    let titleFromLead = null;
    if (b.lead_id) {
      const { data: lead } = await supabase
        .from('crm_leads')
        .select('id, title, code, phone, address, company_id, project_id, customer:customers(full_name, phone, address)')
        .eq('id', b.lead_id)
        .maybeSingle();
      if (lead) {
        if (companyId && lead.company_id && String(companyId) !== String(lead.company_id)) {
          return res.status(400).json({ error: 'Deal không thuộc công ty đang lập đơn mua hàng' });
        }
        if (!companyId && lead.company_id) companyId = lead.company_id;
        if (!customer_name) customer_name = lead.customer?.full_name || lead.title;
        if (!customer_phone) customer_phone = lead.customer?.phone || lead.phone;
        if (!customer_address) customer_address = lead.customer?.address || lead.address;
        titleFromLead = lead.customer?.full_name || lead.title || lead.code || null;
        if (!b.project_id && lead.project_id) b.project_id = lead.project_id;
      }
    }

    if (!companyId) return res.status(400).json({ error: 'Thiếu company_id' });
    if (b.project_id) {
      const scopedProject = await assertProjectBusinessScope(companyId, b.project_id);
      if (scopedProject.error) return res.status(400).json({ error: scopedProject.error });
    }

    const items = normalizeItems(b.items);
    const totals = calcTotals(items, b.tax_rate);
    const code = await nextLdhCode();
    const status = PO_STATUSES.has(String(b.status || '')) ? String(b.status) : 'draft';
    // Có gắn deal → tiêu đề theo lead/KH; không thì dùng title gửi lên hoặc mã LDH
    const title = titleFromLead
      || (b.title ? String(b.title).trim() : null)
      || `Đặt hàng ${code}`;

    const insertRow = {
      code,
      company_id: companyId,
      lead_id: b.lead_id || null,
      supplier_id: b.supplier_id || null,
      customer_name,
      customer_phone,
      customer_address,
      title,
      notes: b.notes ? String(b.notes).trim() : null,
      order_date: b.order_date || new Date().toISOString().slice(0, 10),
      expected_date: b.expected_date || null,
      ...totals,
      status,
      submitted_at: status !== 'draft' ? new Date().toISOString() : null,
      created_by: req.user?.id || null,
    };
    if (b.project_id) insertRow.project_id = b.project_id;
    if (b.due_date) insertRow.due_date = b.due_date;

    let { data: po, error } = await supabase.from('purchase_orders').insert(insertRow).select('*').single();
    if (error && isMissingFinanceSchema(error) && (insertRow.project_id || insertRow.due_date)) {
      delete insertRow.project_id;
      delete insertRow.due_date;
      ({ data: po, error } = await supabase.from('purchase_orders').insert(insertRow).select('*').single());
    }
    if (error) throw error;

    if (items.length) {
      const rows = items.map((it) => ({ ...it, purchase_order_id: po.id }));
      const { error: ie } = await supabase.from('purchase_order_items').insert(rows);
      if (ie) throw ie;
    }

    const { data: full } = await loadPurchaseOrder(po.id);
    res.status(201).json(full || po);
  } catch (e) {
    console.error('[purchasing] create order', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

r.put('/orders/:id', requirePermission('mua_hang_orders', 'edit'), async (req, res) => {
  try {
    const existing = await assertPoInScope(req, res, req.params.id);
    if (!existing) return;

    const b = req.body || {};
    const update = { updated_at: new Date().toISOString() };
    ['title', 'notes', 'customer_name', 'customer_phone', 'customer_address',
      'order_date', 'expected_date', 'due_date', 'supplier_id', 'lead_id', 'project_id'].forEach((f) => {
      if (b[f] !== undefined) update[f] = b[f] === '' ? null : b[f];
    });
    if (update.project_id) {
      const scopedProject = await assertProjectBusinessScope(existing.company_id, update.project_id);
      if (scopedProject.error) return res.status(400).json({ error: scopedProject.error });
    }
    if (b.status !== undefined && PO_STATUSES.has(String(b.status))) {
      update.status = String(b.status);
    }

    // Giữ tiêu đề theo deal khi có lead_id
    const leadIdForTitle = update.lead_id !== undefined ? update.lead_id : existing.lead_id;
    if (leadIdForTitle && (b.sync_title_from_lead || b.title === undefined)) {
      const { data: lead } = await supabase
        .from('crm_leads')
        .select('id, title, code, customer:customers(full_name)')
        .eq('id', leadIdForTitle)
        .maybeSingle();
      if (lead) {
        update.title = lead.customer?.full_name || lead.title || lead.code || update.title;
      }
    }

    if (Array.isArray(b.items)) {
      const items = normalizeItems(b.items);
      const totals = calcTotals(items, b.tax_rate !== undefined ? b.tax_rate : undefined);
      Object.assign(update, totals);
      if (b.tax_rate !== undefined) update.tax_rate = num(b.tax_rate, 10);

      await supabase.from('purchase_order_items').delete().eq('purchase_order_id', req.params.id);
      if (items.length) {
        const rows = items.map((it) => ({ ...it, purchase_order_id: req.params.id }));
        const { error: ie } = await supabase.from('purchase_order_items').insert(rows);
        if (ie) throw ie;
      }
    } else if (b.tax_rate !== undefined) {
      const { data: cur } = await supabase
        .from('purchase_orders')
        .select('subtotal')
        .eq('id', req.params.id)
        .single();
      const totals = calcTotals([{ amount: cur?.subtotal || 0 }], b.tax_rate);
      Object.assign(update, totals);
    }

    const { error } = await supabase
      .from('purchase_orders')
      .update(update)
      .eq('id', req.params.id);
    if (error) throw error;

    const { data: full } = await loadPurchaseOrder(req.params.id);
    res.json(full);
  } catch (e) {
    console.error('[purchasing] update order', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

r.post('/orders/:id/submit', requirePermission('mua_hang_orders', 'edit'), async (req, res) => {
  try {
    const existing = await assertPoInScope(req, res, req.params.id);
    if (!existing) return;
    if (existing.status !== 'draft') {
      return res.status(400).json({ error: 'Chỉ gửi được lệnh ở trạng thái nháp' });
    }
    const { data, error } = await supabase
      .from('purchase_orders')
      .update({
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select(PO_SELECT)
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[purchasing] submit order', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

r.post('/orders/:id/status', requirePermission('mua_hang_orders', 'edit'), async (req, res) => {
  try {
    const existing = await assertPoInScope(req, res, req.params.id);
    if (!existing) return;
    const status = String(req.body?.status || '').trim();
    if (!PO_STATUSES.has(status)) {
      return res.status(400).json({ error: 'Trạng thái không hợp lệ' });
    }
    if (status === 'draft') {
      return res.status(400).json({ error: 'Không thể chuyển về nháp' });
    }
    const update = {
      status,
      updated_at: new Date().toISOString(),
    };
    const now = new Date().toISOString();
    if (status === 'confirmed') update.confirmed_at = now;
    if (status === 'ordered') update.ordered_at = now;
    if (status === 'received') update.received_at = now;
    if (status === 'cancelled') {
      update.cancelled_at = now;
      update.cancel_reason = req.body?.cancel_reason || null;
    }
    const { data, error } = await supabase
      .from('purchase_orders')
      .update(update)
      .eq('id', req.params.id)
      .select(PO_SELECT)
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[purchasing] status order', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

r.delete('/orders/:id', requirePermission('mua_hang_orders', 'edit'), async (req, res) => {
  try {
    const existing = await assertPoInScope(req, res, req.params.id);
    if (!existing) return;
    const { error } = await supabase.from('purchase_orders').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[purchasing] delete order', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

// ═══ SUPPLIER BILLS & PAYMENTS (Công nợ phải trả) ═══════════

r.get('/bills', requirePermission('mua_hang_orders', 'view'), async (req, res) => {
  try {
    const companyId = resolveCompanyId(req, req.query.company_id);
    if (!companyId) return res.status(400).json({ error: 'Thiếu company_id' });
    let query = supabase
      .from('supplier_bills')
      .select(`
        *, supplier:suppliers(id, name, contact_phone),
        purchase_order:purchase_orders(id, code, title, total),
        project:projects(id, code, name)
      `)
      .eq('company_id', companyId)
      .order('bill_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (req.query.project_id) query = query.eq('project_id', req.query.project_id);
    if (req.query.purchase_order_id) query = query.eq('purchase_order_id', req.query.purchase_order_id);
    if (req.query.supplier_id) query = query.eq('supplier_id', req.query.supplier_id);
    if (req.query.status) query = query.eq('status', req.query.status);
    const { data, error } = await query.limit(500);
    if (error) {
      if (isMissingFinanceSchema(error)) return res.status(503).json({ error: 'Chưa áp dụng migration 581 cho công nợ nhà cung cấp', code: 'SUPPLIER_PAYABLES_SCHEMA_REQUIRED' });
      throw error;
    }
    res.json(data || []);
  } catch (error) {
    console.error('[purchasing] list supplier bills', error);
    res.status(500).json({ error: error.message || 'Không tải được hóa đơn nhà cung cấp' });
  }
});

r.get('/bills/:id', requirePermission('mua_hang_orders', 'view'), async (req, res) => {
  try {
    const bill = await assertBillInScope(req, res, req.params.id);
    if (!bill) return;
    const { data: payments, error } = await supabase
      .from('supplier_payments')
      .select('*')
      .eq('supplier_bill_id', bill.id)
      .order('payment_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ ...bill, payments: payments || [] });
  } catch (error) {
    console.error('[purchasing] get supplier bill', error);
    res.status(500).json({ error: error.message || 'Không tải được hóa đơn nhà cung cấp' });
  }
});

r.post('/bills', requirePermission('mua_hang_orders', 'edit'), async (req, res) => {
  try {
    const body = req.body || {};
    const companyId = resolveCompanyId(req, body.company_id) || req.user?.company_id;
    if (!companyId) return res.status(400).json({ error: 'Thiếu company_id' });

    let purchaseOrder = null;
    if (body.purchase_order_id) {
      const result = await supabase
        .from('purchase_orders')
        .select('id, company_id, project_id, supplier_id, subtotal, tax_amount, total')
        .eq('id', body.purchase_order_id)
        .maybeSingle();
      if (result.error) {
        if (isMissingFinanceSchema(result.error)) return res.status(503).json({ error: 'Cần áp dụng migration 581 trước khi ghi hóa đơn nhà cung cấp', code: 'SUPPLIER_PAYABLES_SCHEMA_REQUIRED' });
        throw result.error;
      }
      purchaseOrder = result.data;
      if (!purchaseOrder || String(purchaseOrder.company_id) !== String(companyId)) {
        return res.status(400).json({ error: 'Đơn mua hàng không thuộc công ty đang chọn' });
      }
    }

    const projectId = body.project_id || purchaseOrder?.project_id || null;
    if (projectId) {
      const scopedProject = await assertProjectBusinessScope(companyId, projectId);
      if (scopedProject.error) return res.status(400).json({ error: scopedProject.error });
    }
    const total = body.total !== undefined ? num(body.total) : num(purchaseOrder?.total);
    const subtotal = body.subtotal !== undefined ? num(body.subtotal) : (num(purchaseOrder?.subtotal) || total);
    const taxAmount = body.tax_amount !== undefined ? num(body.tax_amount) : num(purchaseOrder?.tax_amount);
    const requestedStatus = String(body.status || 'draft');
    if (!['draft', 'confirmed', 'cancelled'].includes(requestedStatus)) {
      return res.status(400).json({ error: 'Trạng thái thanh toán chỉ được cập nhật từ giao dịch chi' });
    }
    const status = requestedStatus;
    if (status !== 'draft' && total <= 0) return res.status(400).json({ error: 'Hóa đơn xác nhận phải có tổng tiền lớn hơn 0' });

    const { data: company } = await supabase.from('companies').select('tenant_id').eq('id', companyId).maybeSingle();
    const code = body.code ? String(body.code).trim().toUpperCase() : await nextSupplierBillCode(companyId);
    const { data, error } = await supabase
      .from('supplier_bills')
      .insert({
        tenant_id: req.user?.tenant_id || company?.tenant_id || null,
        company_id: companyId,
        project_id: projectId,
        purchase_order_id: purchaseOrder?.id || null,
        supplier_id: body.supplier_id || purchaseOrder?.supplier_id || null,
        code,
        supplier_invoice_number: body.supplier_invoice_number ? String(body.supplier_invoice_number).trim() : null,
        bill_date: body.bill_date || new Date().toISOString().slice(0, 10),
        due_date: body.due_date || null,
        subtotal,
        tax_amount: taxAmount,
        total,
        status,
        notes: body.notes ? String(body.notes).trim() : null,
        created_by: req.user?.id || req.user?.userId || null,
      })
      .select('*')
      .single();
    if (error) {
      if (isMissingFinanceSchema(error)) return res.status(503).json({ error: 'Chưa áp dụng migration 581 cho công nợ nhà cung cấp', code: 'SUPPLIER_PAYABLES_SCHEMA_REQUIRED' });
      throw error;
    }
    await syncPurchaseOrderPayment(data.purchase_order_id);
    await writePurchasingAudit(req, {
      companyId: data.company_id,
      entityType: 'supplier_bill',
      entityId: data.id,
      action: 'business_os.supplier_bill.created',
      after: { code: data.code, project_id: data.project_id, purchase_order_id: data.purchase_order_id, total: data.total, status: data.status },
    });
    res.status(201).json(data);
  } catch (error) {
    console.error('[purchasing] create supplier bill', error);
    res.status(500).json({ error: error.message || 'Không tạo được hóa đơn nhà cung cấp' });
  }
});

r.put('/bills/:id', requirePermission('mua_hang_orders', 'edit'), async (req, res) => {
  try {
    const existing = await assertBillInScope(req, res, req.params.id);
    if (!existing) return;
    const body = req.body || {};
    const update = { updated_at: new Date().toISOString() };
    ['supplier_invoice_number', 'bill_date', 'due_date', 'notes'].forEach((field) => {
      if (body[field] !== undefined) update[field] = body[field] === '' ? null : body[field];
    });
    ['subtotal', 'tax_amount', 'total'].forEach((field) => {
      if (body[field] !== undefined) update[field] = Math.max(0, num(body[field]));
    });
    if (body.status !== undefined) {
      const status = String(body.status);
      if (!BILL_STATUSES.has(status)) return res.status(400).json({ error: 'Trạng thái hóa đơn nhà cung cấp không hợp lệ' });
      if (['partial_paid', 'paid'].includes(status)) return res.status(400).json({ error: 'Trạng thái thanh toán được tính tự động từ giao dịch chi' });
      update.status = status;
    }
    const effectiveTotal = update.total !== undefined ? update.total : num(existing.total);
    if ((update.status || existing.status) !== 'draft' && (update.status || existing.status) !== 'cancelled' && effectiveTotal <= 0) {
      return res.status(400).json({ error: 'Hóa đơn xác nhận phải có tổng tiền lớn hơn 0' });
    }
    if (effectiveTotal < num(existing.paid_amount)) return res.status(400).json({ error: 'Tổng hóa đơn không được thấp hơn số tiền đã chi' });

    const { data, error } = await supabase
      .from('supplier_bills')
      .update(update)
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw error;
    await syncPurchaseOrderPayment(existing.purchase_order_id);
    await writePurchasingAudit(req, {
      companyId: existing.company_id,
      entityType: 'supplier_bill',
      entityId: existing.id,
      action: 'business_os.supplier_bill.updated',
      before: { total: existing.total, status: existing.status, due_date: existing.due_date },
      after: { total: data.total, status: data.status, due_date: data.due_date },
    });
    res.json(data);
  } catch (error) {
    console.error('[purchasing] update supplier bill', error);
    res.status(500).json({ error: error.message || 'Không cập nhật được hóa đơn nhà cung cấp' });
  }
});

r.post('/bills/:id/payments', requirePermission('mua_hang_orders', 'edit'), async (req, res) => {
  try {
    const bill = await assertBillInScope(req, res, req.params.id);
    if (!bill) return;
    if (['draft', 'cancelled'].includes(bill.status)) return res.status(400).json({ error: 'Chỉ ghi chi cho hóa đơn đã xác nhận' });
    const amount = num(req.body?.amount);
    if (amount <= 0) return res.status(400).json({ error: 'Số tiền chi phải lớn hơn 0' });
    const outstanding = Math.max(0, num(bill.total) - num(bill.paid_amount));
    if (amount > outstanding) return res.status(400).json({ error: `Số tiền chi vượt công nợ còn lại ${outstanding}` });

    const { data, error } = await supabase
      .from('supplier_payments')
      .insert({
        tenant_id: bill.tenant_id || req.user?.tenant_id || null,
        company_id: bill.company_id,
        project_id: bill.project_id,
        supplier_bill_id: bill.id,
        amount,
        payment_date: req.body?.payment_date || new Date().toISOString().slice(0, 10),
        payment_method: req.body?.payment_method ? String(req.body.payment_method).trim() : null,
        reference_number: req.body?.reference_number ? String(req.body.reference_number).trim() : null,
        notes: req.body?.notes ? String(req.body.notes).trim() : null,
        created_by: req.user?.id || req.user?.userId || null,
      })
      .select('*')
      .single();
    if (error) throw error;
    const updatedBill = await syncSupplierBillPayment(bill.id);
    await writePurchasingAudit(req, {
      companyId: bill.company_id,
      entityType: 'supplier_payment',
      entityId: data.id,
      action: 'business_os.supplier_payment.created',
      after: { supplier_bill_id: bill.id, project_id: bill.project_id, amount: data.amount, payment_date: data.payment_date },
    });
    res.status(201).json({ payment: data, bill: updatedBill });
  } catch (error) {
    console.error('[purchasing] create supplier payment', error);
    res.status(500).json({ error: error.message || 'Không ghi được giao dịch chi' });
  }
});

r.delete('/bills/:billId/payments/:paymentId', requirePermission('mua_hang_orders', 'edit'), async (req, res) => {
  try {
    const bill = await assertBillInScope(req, res, req.params.billId);
    if (!bill) return;
    const { data: payment } = await supabase
      .from('supplier_payments')
      .select('id, amount, payment_date')
      .eq('id', req.params.paymentId)
      .eq('supplier_bill_id', bill.id)
      .maybeSingle();
    if (!payment) return res.status(404).json({ error: 'Không tìm thấy giao dịch chi' });
    const { error } = await supabase.from('supplier_payments').delete().eq('id', payment.id);
    if (error) throw error;
    const updatedBill = await syncSupplierBillPayment(bill.id);
    await writePurchasingAudit(req, {
      companyId: bill.company_id,
      entityType: 'supplier_payment',
      entityId: payment.id,
      action: 'business_os.supplier_payment.deleted',
      before: { supplier_bill_id: bill.id, project_id: bill.project_id, amount: payment.amount, payment_date: payment.payment_date },
    });
    res.json({ ok: true, bill: updatedBill });
  } catch (error) {
    console.error('[purchasing] delete supplier payment', error);
    res.status(500).json({ error: error.message || 'Không xóa được giao dịch chi' });
  }
});

// Suppliers list (reuse table)
r.get('/suppliers', requirePermission('mua_hang_orders', 'view'), async (req, res) => {
  try {
    const companyId = resolveCompanyId(req, req.query.company_id);
    let q = supabase.from('suppliers').select('*').eq('is_active', true).order('name');
    if (companyId) q = q.eq('company_id', companyId);
    const { data, error } = await q;
    if (error) {
      if (String(error.message || '').includes('suppliers')) return res.json([]);
      throw error;
    }
    res.json(data || []);
  } catch (e) {
    console.error('[purchasing] list suppliers', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

module.exports = r;
