const { Router } = require('express');
const { requirePermission } = require('../middleware/newPermission');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');

const r = Router();
r.use(auth);

// ═══════════════════════════════════════════
// PRODUCT CODE PARTS (Thành phần mã sản phẩm)
// ═══════════════════════════════════════════
const CODE_PART_TYPES = ['group', 'spec', 'standard', 'category', 'style', 'glass', 'type_standard', 'side', 'size'];
const CODE_PART_LABELS = {
  group: 'Nhóm SP', spec: 'Quy cách', standard: 'Tiêu chuẩn', category: 'Loại/Phân loại',
  style: 'Hình thức', glass: 'Kính', type_standard: 'Chuẩn loại', side: 'Hông', size: 'Kích thước quy ước',
};

// Get all code parts grouped by type
r.get('/code-parts', async (req, res) => {
  try {
    const { data } = await supabase.from('product_code_parts')
      .select('*').eq('is_active', true).order('order_index');
    // Group by part_type
    const grouped = {};
    CODE_PART_TYPES.forEach(t => { grouped[t] = { label: CODE_PART_LABELS[t], items: [] }; });
    (data || []).forEach(d => {
      if (grouped[d.part_type]) grouped[d.part_type].items.push(d);
    });
    res.json({ codeParts: grouped, types: CODE_PART_TYPES, labels: CODE_PART_LABELS });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// CRUD code parts
r.post('/code-parts', async (req, res) => {
  try {
    const { part_type, code, name, description, order_index } = req.body;
    if (!CODE_PART_TYPES.includes(part_type)) return res.status(400).json({ error: 'Loại không hợp lệ' });
    const { data, error } = await supabase.from('product_code_parts').insert({
      part_type, code: code.toUpperCase(), name, description: description || null, order_index: order_index || 0,
    }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.put('/code-parts/:id', async (req, res) => {
  try {
    const update = {};
    ['code', 'name', 'description', 'order_index', 'is_active'].forEach(f => {
      if (req.body[f] !== undefined) update[f] = req.body[f];
    });
    if (update.code) update.code = update.code.toUpperCase();
    const { data, error } = await supabase.from('product_code_parts').update(update).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.delete('/code-parts/:id', async (req, res) => {
  try {
    await supabase.from('product_code_parts').delete().eq('id', req.params.id);
    res.json({ message: 'Đã xóa' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════
// AUTO-GENERATE PRODUCT CODE from parts
// ═══════════════════════════════════════════
function buildProductCode(parts) {
  // parts = { group: 'TB', spec: 'L', standard: 'TC', category: 'GO', style: 'HĐ', glass: 'KK', type_standard: 'A', side: 'HT', size: 'M' }
  return CODE_PART_TYPES.map(t => parts[t] || '').filter(Boolean).join('-');
}

// ═══════════════════════════════════════════
// EXCEL IMPORT / EXPORT
// ═══════════════════════════════════════════

// Export products to Excel (returns JSON rows — frontend builds xlsx)
r.get('/export', async (req, res) => {
  try {
    const { category_id, status } = req.query;
    let q = supabase.from('products').select('*, category:product_categories(name)').order('code');
    if (category_id) q = q.eq('category_id', category_id);
    if (status && status !== 'all') q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;

    const rows = (data || []).map((p, i) => ({
      'STT': i + 1,
      'nhóm sp': p.code_group || '',
      'mã quy cách': p.code_spec || '',
      'mã tiêu chuẩn': p.code_standard || '',
      'mã loại/ phân loại': p.code_category || '',
      'mã hình thức': p.code_style || '',
      'mã kính': p.code_glass || '',
      'mã chuẩn loại': p.code_type_std || '',
      'mã hông': p.code_side || '',
      'mã Kích thước quy ước': p.code_size || '',
      'MÃ THÀNH PHẨM': p.code,
      'TÊN THÀNH PHẨM': p.name,
      'GIÁ BÁN GỒM VAT 10%': p.selling_price || 0,
      'GIÁ BÁN CHƯA VAT 10%': p.base_price || 0,
      'đơn vị tính': p.unit || 'cái',
    }));

    res.json({ rows, total: rows.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Import products from parsed Excel data (frontend sends JSON array)
r.post('/import', async (req, res) => {
  try {
    const { rows, mode = 'upsert' } = req.body; // mode: 'insert' | 'upsert' | 'preview'
    if (!rows?.length) return res.status(400).json({ error: 'Không có dữ liệu' });

    const results = { created: 0, updated: 0, errors: [], preview: [] };

    // Helper: get value from row by exact key
    const g = (row, key) => (row[key] ?? '').toString().trim();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      try {
        const code = g(row, 'MÃ THÀNH PHẨM');
        const name = g(row, 'TÊN THÀNH PHẨM');
        const sellingPrice = parseFloat(row['GIÁ BÁN GỒM VAT 10%'] || 0) || 0;
        const basePrice = parseFloat(row['GIÁ BÁN CHƯA VAT 10%'] || 0) || 0;
        const unit = g(row, 'đơn vị tính') || 'cái';

        const codeGroup = g(row, 'nhóm sp');
        const codeSpec = g(row, 'mã quy cách');
        const codeStandard = g(row, 'mã tiêu chuẩn');
        const codeCategory = g(row, 'mã loại/ phân loại');
        const codeStyle = g(row, 'mã hình thức');
        const codeGlass = g(row, 'mã kính');
        const codeTypeStd = g(row, 'mã chuẩn loại');
        const codeSide = g(row, 'mã hông');
        const codeSize = g(row, 'mã Kích thước quy ước');

        if (!name) { results.errors.push({ row: rowNum, error: 'Thiếu tên sản phẩm' }); continue; }

        // Auto-gen code if empty
        const finalCode = code || buildProductCode({ group: codeGroup, spec: codeSpec, standard: codeStandard, category: codeCategory, style: codeStyle, glass: codeGlass, type_standard: codeTypeStd, side: codeSide, size: codeSize });

        // Auto-calc price
        const finalSellingPrice = sellingPrice || (basePrice ? Math.round(basePrice * 1.1) : 0);
        const finalBasePrice = basePrice || (sellingPrice ? Math.round(sellingPrice / 1.1) : 0);

        const productData = {
          name, unit,
          selling_price: finalSellingPrice,
          base_price: finalBasePrice,
          code_group: codeGroup || null, code_spec: codeSpec || null, code_standard: codeStandard || null,
          code_category: codeCategory || null, code_style: codeStyle || null, code_glass: codeGlass || null,
          code_type_std: codeTypeStd || null, code_side: codeSide || null, code_size: codeSize || null,
          status: 'active', updated_at: new Date().toISOString(),
        };

        if (mode === 'preview') {
          results.preview.push({ row: rowNum, code: finalCode, name, selling_price: finalSellingPrice, base_price: finalBasePrice, unit, action: 'preview' });
          continue;
        }

        if (mode === 'upsert' && finalCode) {
          // Check existing by code
          const { data: existing } = await supabase.from('products').select('id').eq('code', finalCode).limit(1).single();
          if (existing) {
            await supabase.from('products').update(productData).eq('id', existing.id);
            results.updated++;
            continue;
          }
        }

        // Insert new
        productData.code = finalCode || `SP-${String(Date.now()).slice(-6)}`;
        await supabase.from('products').insert(productData);
        results.created++;
      } catch (rowErr) {
        results.errors.push({ row: rowNum, error: rowErr.message || 'Lỗi không xác định' });
      }
    }

    res.json({
      message: mode === 'preview'
        ? `Preview ${results.preview.length} sản phẩm`
        : `Import hoàn tất: ${results.created} tạo mới, ${results.updated} cập nhật, ${results.errors.length} lỗi`,
      ...results,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════
// PRODUCT CATEGORIES (Loại sản phẩm)
// ═══════════════════════════════════════════

r.get('/categories', async (req, res) => {
  try {
    const { data } = await supabase.from('product_categories').select('*').order('order_index');
    res.json({ categories: data });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

r.post('/categories', async (req, res) => {
  try {
    const b = req.body;
    const slug = b.slug || b.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const { data, error } = await supabase.from('product_categories').insert({
      name: b.name, slug, description: b.description || null,
      parent_id: b.parent_id || null, image_url: b.image_url || null, order_index: b.order_index || 0,
    }).select().single();
    if (error) throw error;
    res.status(201).json({ category: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

r.put('/categories/:id', async (req, res) => {
  try {
    const b = req.body;
    const update = {};
    ['name', 'description', 'parent_id', 'image_url', 'order_index', 'is_active'].forEach(f => {
      if (b[f] !== undefined) update[f] = b[f];
    });
    const { data, error } = await supabase.from('product_categories').update(update).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ category: data });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

r.delete('/categories/:id', async (req, res) => {
  try {
    const { count } = await supabase.from('products').select('id', { count: 'exact', head: true }).eq('category_id', req.params.id);
    if (count > 0) return res.status(400).json({ error: `Không thể xóa — danh mục có ${count} sản phẩm` });
    await supabase.from('product_categories').delete().eq('id', req.params.id);
    res.json({ message: 'Đã xóa' });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// ═══════════════════════════════════════════
// PRODUCTS (Sản phẩm)
// ═══════════════════════════════════════════

r.get('/', async (req, res) => {
  try {
    const { search, category_id, status, page = 1, limit = 50 } = req.query;
    let q = supabase.from('products').select('*, category:product_categories(id,name,slug)', { count: 'exact' });
    if (search) q = q.or(`name.ilike.%${search}%,code.ilike.%${search}%,sku.ilike.%${search}%`);
    if (category_id) q = q.eq('category_id', category_id);
    if (status && status !== 'all') q = q.eq('status', status);
    const p = +page, l = +limit;
    q = q.order('created_at', { ascending: false }).range((p - 1) * l, p * l - 1);
    const { data, count, error } = await q;
    if (error) throw error;
    res.json({ products: data, total: count });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

r.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('products').select('*, category:product_categories(id,name,slug)')
      .eq('id', req.params.id).single();
    if (error) throw error;

    // BOM (cấu trúc sản phẩm)
    const { data: structures } = await supabase.from('product_structures')
      .select('*, component:product_components(id,code,name,unit,unit_price,material,category)')
      .eq('product_id', req.params.id).order('order_index');

    // Tính tổng chi phí BOM
    let bomCost = 0;
    structures?.forEach(s => {
      if (s.component?.unit_price && s.quantity) bomCost += s.component.unit_price * s.quantity;
    });

    res.json({ product: { ...data, structures: structures || [], bomCost } });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

r.post('/', async (req, res) => {
  try {
    const b = req.body;
    // Auto-gen code from parts or sequential
    let code = b.code;
    if (!code && (b.code_group || b.code_spec)) {
      code = buildProductCode(b);
    }
    if (!code) {
      const { count } = await supabase.from('products').select('id', { count: 'exact', head: true });
      code = `SP-${String((count || 0) + 1).padStart(4, '0')}`;
    }

    // Auto-calc prices
    const sellingPrice = b.selling_price || (b.base_price ? Math.round(b.base_price * 1.1) : 0);
    const basePrice = b.base_price || (b.selling_price ? Math.round(b.selling_price / 1.1) : 0);

    const { data, error } = await supabase.from('products').insert({
      code, name: b.name, description: b.description || null,
      category_id: b.category_id || null, sku: b.sku || null, unit: b.unit || 'cái',
      base_price: basePrice, cost_price: b.cost_price || 0, selling_price: sellingPrice,
      vat_rate: b.vat_rate ?? 10,
      image_url: b.image_url || null, dimensions: b.dimensions || null,
      material: b.material || null, color: b.color || null, finish: b.finish || null,
      specifications: b.specifications || null, status: 'active',
      stock_quantity: b.stock_quantity || 0, min_stock: b.min_stock || 0, tags: b.tags || [],
      // Code parts
      code_group: b.code_group || null, code_spec: b.code_spec || null,
      code_standard: b.code_standard || null, code_category: b.code_category || null,
      code_style: b.code_style || null, code_glass: b.code_glass || null,
      code_type_std: b.code_type_std || null, code_side: b.code_side || null,
      code_size: b.code_size || null,
    }).select('*, category:product_categories(id,name)').single();
    if (error) throw error;
    res.status(201).json({ product: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

r.put('/:id', async (req, res) => {
  try {
    const b = req.body;
    const update = { updated_at: new Date().toISOString() };
    const fields = ['name', 'description', 'category_id', 'sku', 'unit', 'base_price', 'cost_price',
      'selling_price', 'vat_rate',
      'image_url', 'dimensions', 'material', 'color', 'finish', 'specifications', 'status',
      'stock_quantity', 'min_stock', 'tags',
      'code_group', 'code_spec', 'code_standard', 'code_category', 'code_style',
      'code_glass', 'code_type_std', 'code_side', 'code_size'];
    fields.forEach(f => { if (b[f] !== undefined) update[f] = b[f]; });

    // Auto-calc price if one provided
    if (b.selling_price && !b.base_price) update.base_price = Math.round(b.selling_price / 1.1);
    if (b.base_price && !b.selling_price) update.selling_price = Math.round(b.base_price * 1.1);

    // Auto-regen code from parts
    if (b.code_group || b.code_spec) {
      const merged = { ...b };
      update.code = buildProductCode(merged);
    }

    const { data, error } = await supabase.from('products').update(update).eq('id', req.params.id)
      .select('*, category:product_categories(id,name)').single();
    if (error) throw error;
    res.json({ product: data });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

r.delete('/:id', async (req, res) => {
  try {
    await supabase.from('product_structures').delete().eq('product_id', req.params.id);
    await supabase.from('project_products').delete().eq('product_id', req.params.id);
    await supabase.from('products').delete().eq('id', req.params.id);
    res.json({ message: 'Đã xóa' });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// ═══════════════════════════════════════════
// PRODUCT COMPONENTS (Thành phần / vật tư)
// ═══════════════════════════════════════════

r.get('/components/list', async (req, res) => {
  try {
    const { search, category, page = 1, limit = 50 } = req.query;
    let q = supabase.from('product_components').select('*', { count: 'exact' });
    if (search) q = q.or(`name.ilike.%${search}%,code.ilike.%${search}%`);
    if (category) q = q.eq('category', category);
    const p = +page, l = +limit;
    q = q.order('name').range((p - 1) * l, p * l - 1);
    const { data, count, error } = await q;
    if (error) throw error;
    res.json({ components: data, total: count });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

r.post('/components', async (req, res) => {
  try {
    const b = req.body;
    const { count } = await supabase.from('product_components').select('id', { count: 'exact', head: true });
    const code = b.code || `VT-${String((count || 0) + 1).padStart(4, '0')}`;
    const { data, error } = await supabase.from('product_components').insert({
      code, name: b.name, description: b.description || null, category: b.category || 'other',
      unit: b.unit || 'cái', unit_price: b.unit_price || 0,
      supplier: b.supplier || null, supplier_code: b.supplier_code || null,
      material: b.material || null, specifications: b.specifications || null,
      stock_quantity: b.stock_quantity || 0, min_stock: b.min_stock || 5,
      image_url: b.image_url || null,
    }).select().single();
    if (error) throw error;
    res.status(201).json({ component: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

r.put('/components/:id', async (req, res) => {
  try {
    const b = req.body;
    const update = { updated_at: new Date().toISOString() };
    const fields = ['name', 'description', 'category', 'unit', 'unit_price', 'supplier', 'supplier_code',
      'material', 'specifications', 'stock_quantity', 'min_stock', 'image_url', 'is_active'];
    fields.forEach(f => { if (b[f] !== undefined) update[f] = b[f]; });
    const { data, error } = await supabase.from('product_components').update(update).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ component: data });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

r.delete('/components/:id', async (req, res) => {
  try {
    const { count } = await supabase.from('product_structures').select('id', { count: 'exact', head: true }).eq('component_id', req.params.id);
    if (count > 0) return res.status(400).json({ error: `Không thể xóa — vật tư đang dùng trong ${count} sản phẩm` });
    await supabase.from('product_components').delete().eq('id', req.params.id);
    res.json({ message: 'Đã xóa' });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// ═══════════════════════════════════════════
// PRODUCT STRUCTURES (BOM - Cấu trúc sản phẩm)
// ═══════════════════════════════════════════

r.post('/:id/structures', async (req, res) => {
  try {
    const b = req.body;
    const { data, error } = await supabase.from('product_structures').insert({
      product_id: req.params.id, component_id: b.component_id,
      quantity: b.quantity || 1, unit: b.unit || null, notes: b.notes || null, order_index: b.order_index || 0,
    }).select('*, component:product_components(id,code,name,unit,unit_price,material,category)').single();
    if (error) throw error;
    res.status(201).json({ structure: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

r.put('/:productId/structures/:structId', async (req, res) => {
  try {
    const b = req.body;
    const update = {};
    ['quantity', 'unit', 'notes', 'order_index'].forEach(f => { if (b[f] !== undefined) update[f] = b[f]; });
    const { data, error } = await supabase.from('product_structures').update(update).eq('id', req.params.structId)
      .select('*, component:product_components(id,code,name,unit,unit_price,material,category)').single();
    if (error) throw error;
    res.json({ structure: data });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

r.delete('/:productId/structures/:structId', async (req, res) => {
  try {
    await supabase.from('product_structures').delete().eq('id', req.params.structId);
    res.json({ message: 'Đã xóa' });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

module.exports = r;
