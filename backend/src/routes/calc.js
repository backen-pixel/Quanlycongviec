/**
 * Module Tính toán — REST API.
 *   /api/calc/categories        CRUD danh mục
 *   /api/calc/product-types     CRUD loại sản phẩm trong danh mục
 *   /api/calc/variables         CRUD biến đầu vào của loại
 *   /api/calc/formulas          CRUD công thức (AST)
 *   /api/calc/rules             CRUD rule (điều kiện → công thức)
 *   /api/calc/compute           Tính tay 1 lượt (chưa lưu)
 *   /api/calc/runs              Lịch sử tính + lưu kết quả
 *   /api/calc/import-3d         Upload file 3D + trả về items + auto-tính
 *   /api/calc/imports           List/Get/Delete file đã import
 *   /api/calc/parsers           Liệt kê parser hỗ trợ (FE hiện badge)
 */

const { Router } = require('express');
const multer = require('multer');
const path = require('path');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const {
  evalFormulaAst,
  evalConditionAst,
  astToText,
  computeForProductType,
} = require('../helpers/calcEngine');
const { parse3dFile, listSupportedFormats } = require('../helpers/calc3dParsers');

const r = Router();
r.use(auth);

const MB = 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * MB },
});

const onErr = (res, e, msg = 'Lỗi') => {
  console.error('[calc]', e);
  res.status(500).json({ error: msg, detail: e?.message });
};

// ─────────────────────────────────────────────────────────────
// Helper: load đầy đủ rules + formulas của 1 product_type
async function loadProductTypeBundle(productTypeId) {
  const [variablesRes, formulasRes, rulesRes, typeRes] = await Promise.all([
    supabase.from('calc_variables').select('*').eq('product_type_id', productTypeId).order('sort_order'),
    supabase.from('calc_formulas').select('*').eq('product_type_id', productTypeId).order('sort_order'),
    supabase.from('calc_rules').select('*').eq('product_type_id', productTypeId).order('priority'),
    supabase.from('calc_product_types').select('*').eq('id', productTypeId).maybeSingle(),
  ]);
  if (!typeRes.data) throw new Error('Không tìm thấy loại sản phẩm.');
  const formulas = formulasRes.data || [];
  const formulasById = {};
  formulas.forEach((f) => { formulasById[f.id] = f; });
  return {
    type: typeRes.data,
    variables: variablesRes.data || [],
    formulas,
    formulasById,
    rules: rulesRes.data || [],
  };
}

// ═══════════════════════════════════════════════════════════════
// CATEGORIES
// ═══════════════════════════════════════════════════════════════
r.get('/categories', async (req, res) => {
  try {
    let q = supabase.from('calc_categories').select('*').order('sort_order').order('created_at');
    if (req.query.active === '1') q = q.eq('is_active', true);
    if (req.query.company_id) q = q.eq('company_id', req.query.company_id);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ categories: data || [] });
  } catch (e) { onErr(res, e); }
});

r.post('/categories', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name) return res.status(400).json({ error: 'Thiếu tên danh mục' });
    const { data, error } = await supabase.from('calc_categories').insert({
      code: b.code || null,
      name: b.name,
      description: b.description || null,
      icon: b.icon || null,
      sort_order: Number(b.sort_order) || 0,
      is_active: b.is_active !== false,
      company_id: b.company_id || null,
      created_by: req.user.userId,
    }).select().single();
    if (error) throw error;
    res.status(201).json({ category: data });
  } catch (e) { onErr(res, e); }
});

r.put('/categories/:id', async (req, res) => {
  try {
    const b = req.body || {};
    const update = { updated_at: new Date().toISOString() };
    ['code', 'name', 'description', 'icon', 'sort_order', 'is_active', 'company_id']
      .forEach((k) => { if (b[k] !== undefined) update[k] = b[k]; });
    const { data, error } = await supabase
      .from('calc_categories').update(update).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ category: data });
  } catch (e) { onErr(res, e); }
});

r.delete('/categories/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('calc_categories').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { onErr(res, e); }
});

// ═══════════════════════════════════════════════════════════════
// PRODUCT TYPES
// ═══════════════════════════════════════════════════════════════
r.get('/product-types', async (req, res) => {
  try {
    let q = supabase.from('calc_product_types').select('*').order('sort_order');
    if (req.query.category_id) q = q.eq('category_id', req.query.category_id);
    if (req.query.active === '1') q = q.eq('is_active', true);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ product_types: data || [] });
  } catch (e) { onErr(res, e); }
});

r.get('/product-types/:id', async (req, res) => {
  try {
    const bundle = await loadProductTypeBundle(req.params.id);
    res.json({
      product_type: bundle.type,
      variables: bundle.variables,
      formulas: bundle.formulas,
      rules: bundle.rules,
    });
  } catch (e) { onErr(res, e); }
});

r.post('/product-types', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name || !b.category_id) return res.status(400).json({ error: 'Thiếu name hoặc category_id' });
    const { data, error } = await supabase.from('calc_product_types').insert({
      category_id: b.category_id,
      code: b.code || null,
      name: b.name,
      description: b.description || null,
      default_unit: b.default_unit || 'mm',
      result_unit: b.result_unit || null,
      sort_order: Number(b.sort_order) || 0,
      is_active: b.is_active !== false,
      match_keywords: Array.isArray(b.match_keywords) ? b.match_keywords : null,
      created_by: req.user.userId,
    }).select().single();
    if (error) throw error;
    res.status(201).json({ product_type: data });
  } catch (e) { onErr(res, e); }
});

r.put('/product-types/:id', async (req, res) => {
  try {
    const b = req.body || {};
    const update = { updated_at: new Date().toISOString() };
    ['code', 'name', 'description', 'default_unit', 'result_unit', 'sort_order', 'is_active', 'match_keywords', 'category_id']
      .forEach((k) => { if (b[k] !== undefined) update[k] = b[k]; });
    const { data, error } = await supabase
      .from('calc_product_types').update(update).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ product_type: data });
  } catch (e) { onErr(res, e); }
});

r.delete('/product-types/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('calc_product_types').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { onErr(res, e); }
});

// ═══════════════════════════════════════════════════════════════
// VARIABLES
// ═══════════════════════════════════════════════════════════════
r.get('/variables', async (req, res) => {
  try {
    let q = supabase.from('calc_variables').select('*').order('sort_order');
    if (req.query.product_type_id) q = q.eq('product_type_id', req.query.product_type_id);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ variables: data || [] });
  } catch (e) { onErr(res, e); }
});

r.post('/variables', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.product_type_id || !b.var_key || !b.label) {
      return res.status(400).json({ error: 'Thiếu product_type_id, var_key hoặc label' });
    }
    const cleanKey = String(b.var_key).trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
    const { data, error } = await supabase.from('calc_variables').insert({
      product_type_id: b.product_type_id,
      var_key: cleanKey,
      label: b.label,
      data_type: b.data_type || 'number',
      unit: b.unit || null,
      default_value: b.default_value ?? null,
      min_value: b.min_value ?? null,
      max_value: b.max_value ?? null,
      is_required: b.is_required !== false,
      is_dimension: !!b.is_dimension,
      dim_axis: b.dim_axis || null,
      sort_order: Number(b.sort_order) || 0,
      description: b.description || null,
    }).select().single();
    if (error) throw error;
    res.status(201).json({ variable: data });
  } catch (e) { onErr(res, e); }
});

r.put('/variables/:id', async (req, res) => {
  try {
    const b = req.body || {};
    const update = {};
    ['var_key', 'label', 'data_type', 'unit', 'default_value', 'min_value', 'max_value',
     'is_required', 'is_dimension', 'dim_axis', 'sort_order', 'description']
      .forEach((k) => { if (b[k] !== undefined) update[k] = b[k]; });
    if (update.var_key) update.var_key = String(update.var_key).trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
    const { data, error } = await supabase.from('calc_variables').update(update).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ variable: data });
  } catch (e) { onErr(res, e); }
});

r.delete('/variables/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('calc_variables').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { onErr(res, e); }
});

// ═══════════════════════════════════════════════════════════════
// FORMULAS
// ═══════════════════════════════════════════════════════════════
r.get('/formulas', async (req, res) => {
  try {
    let q = supabase.from('calc_formulas').select('*').order('sort_order');
    if (req.query.product_type_id) q = q.eq('product_type_id', req.query.product_type_id);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ formulas: data || [] });
  } catch (e) { onErr(res, e); }
});

r.post('/formulas', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.product_type_id || !b.name) return res.status(400).json({ error: 'Thiếu product_type_id hoặc name' });
    const ast = b.ast || { type: 'num', value: 0 };
    const { data, error } = await supabase.from('calc_formulas').insert({
      product_type_id: b.product_type_id,
      name: b.name,
      description: b.description || null,
      ast,
      expression_text: astToText(ast),
      is_active: b.is_active !== false,
      sort_order: Number(b.sort_order) || 0,
      created_by: req.user.userId,
    }).select().single();
    if (error) throw error;
    res.status(201).json({ formula: data });
  } catch (e) { onErr(res, e); }
});

r.put('/formulas/:id', async (req, res) => {
  try {
    const b = req.body || {};
    const update = { updated_at: new Date().toISOString() };
    ['name', 'description', 'is_active', 'sort_order'].forEach((k) => { if (b[k] !== undefined) update[k] = b[k]; });
    if (b.ast) {
      update.ast = b.ast;
      update.expression_text = astToText(b.ast);
    }
    const { data, error } = await supabase.from('calc_formulas').update(update).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ formula: data });
  } catch (e) { onErr(res, e); }
});

r.delete('/formulas/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('calc_formulas').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { onErr(res, e); }
});

// ═══════════════════════════════════════════════════════════════
// RULES
// ═══════════════════════════════════════════════════════════════
r.get('/rules', async (req, res) => {
  try {
    let q = supabase.from('calc_rules').select('*').order('priority');
    if (req.query.product_type_id) q = q.eq('product_type_id', req.query.product_type_id);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ rules: data || [] });
  } catch (e) { onErr(res, e); }
});

r.post('/rules', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.product_type_id || !b.name) return res.status(400).json({ error: 'Thiếu product_type_id hoặc name' });
    const cond = b.condition_ast || (b.is_default ? { type: 'noop' } : { type: 'true' });
    const { data, error } = await supabase.from('calc_rules').insert({
      product_type_id: b.product_type_id,
      name: b.name,
      description: b.description || null,
      priority: Number(b.priority) || 100,
      condition_ast: cond,
      condition_text: astToText(cond),
      formula_id: b.formula_id || null,
      is_default: !!b.is_default,
      is_active: b.is_active !== false,
    }).select().single();
    if (error) throw error;
    res.status(201).json({ rule: data });
  } catch (e) { onErr(res, e); }
});

r.put('/rules/:id', async (req, res) => {
  try {
    const b = req.body || {};
    const update = { updated_at: new Date().toISOString() };
    ['name', 'description', 'priority', 'formula_id', 'is_default', 'is_active'].forEach((k) => {
      if (b[k] !== undefined) update[k] = b[k];
    });
    if (b.condition_ast) {
      update.condition_ast = b.condition_ast;
      update.condition_text = astToText(b.condition_ast);
    }
    const { data, error } = await supabase.from('calc_rules').update(update).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ rule: data });
  } catch (e) { onErr(res, e); }
});

r.delete('/rules/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('calc_rules').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { onErr(res, e); }
});

// ═══════════════════════════════════════════════════════════════
// COMPUTE — tính tay 1 lượt (không lưu trừ khi save=1)
// ═══════════════════════════════════════════════════════════════
r.post('/compute', async (req, res) => {
  try {
    const { product_type_id, inputs, save, notes } = req.body || {};
    if (!product_type_id) return res.status(400).json({ error: 'Thiếu product_type_id' });
    const bundle = await loadProductTypeBundle(product_type_id);

    // Áp default cho biến chưa nhập
    const ctx = { ...(inputs || {}) };
    bundle.variables.forEach((v) => {
      if (ctx[v.var_key] === undefined && v.default_value !== null && v.default_value !== undefined) {
        ctx[v.var_key] = Number(v.default_value);
      }
    });

    const out = computeForProductType({
      rules: bundle.rules,
      formulasById: bundle.formulasById,
      inputs: ctx,
    });

    let runId = null;
    if (save === 1 || save === true || save === '1') {
      const { data: run } = await supabase.from('calc_runs').insert({
        product_type_id,
        inputs: ctx,
        matched_rule_id: out.matched_rule_id,
        applied_formula_id: out.applied_formula_id,
        result: out.result,
        result_unit: bundle.type.result_unit || null,
        breakdown: out.breakdown,
        source: 'manual',
        notes: notes || null,
        created_by: req.user.userId,
      }).select('id').single();
      runId = run?.id || null;
    }

    res.json({
      product_type: bundle.type,
      inputs: ctx,
      ...out,
      result_unit: bundle.type.result_unit || null,
      run_id: runId,
    });
  } catch (e) {
    res.status(400).json({ error: e?.message || 'Compute lỗi' });
  }
});

// ═══════════════════════════════════════════════════════════════
// RUNS — lịch sử
// ═══════════════════════════════════════════════════════════════
r.get('/runs', async (req, res) => {
  try {
    let q = supabase.from('calc_runs').select(`
      *, product_type:calc_product_types(id,name,result_unit,category_id),
      creator:users!calc_runs_created_by_fkey(id,full_name)
    `).order('created_at', { ascending: false }).limit(Number(req.query.limit) || 50);
    if (req.query.product_type_id) q = q.eq('product_type_id', req.query.product_type_id);
    if (req.query.import_id) q = q.eq('import_id', req.query.import_id);
    if (req.query.mine === '1') q = q.eq('created_by', req.user.userId);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ runs: data || [] });
  } catch (e) { onErr(res, e); }
});

r.delete('/runs/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('calc_runs').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { onErr(res, e); }
});

// ═══════════════════════════════════════════════════════════════
// 3D IMPORT
// ═══════════════════════════════════════════════════════════════
r.get('/parsers', (req, res) => {
  res.json({ parsers: listSupportedFormats() });
});

/**
 * Upload file 3D + auto-tính.
 * Body: form-data field "file" + "category_id" (optional, narrow ngữ cảnh map)
 */
r.post('/import-3d', upload.single('file'), async (req, res) => {
  try {
    const f = req.file;
    if (!f) return res.status(400).json({ error: 'Thiếu file' });
    const ext = path.extname(f.originalname).toLowerCase();
    const fileMeta = {
      name: f.originalname,
      ext,
      mime: f.mimetype,
      size: f.size,
    };
    const parsed = await parse3dFile({ buffer: f.buffer, file: fileMeta });

    // Map item → product_type theo match_keywords
    let productTypes = [];
    {
      let q = supabase.from('calc_product_types').select('*').eq('is_active', true);
      if (req.body?.category_id) q = q.eq('category_id', req.body.category_id);
      const { data } = await q;
      productTypes = data || [];
    }

    const matchItem = (item) => {
      const hay = String(item.name || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      let best = null;
      for (const pt of productTypes) {
        const kws = (pt.match_keywords || []).map((k) => String(k).toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
        if (kws.some((k) => k && hay.includes(k))) { best = pt; break; }
      }
      return best;
    };

    // Cache bundle theo product_type để tránh load nhiều lần
    const bundleCache = new Map();
    const getBundle = async (id) => {
      if (!bundleCache.has(id)) bundleCache.set(id, await loadProductTypeBundle(id));
      return bundleCache.get(id);
    };

    const enriched = [];
    let total = 0;
    for (const item of parsed.items) {
      const pt = matchItem(item);
      const row = { ...item, matched_type_id: pt?.id || null, matched_type_name: pt?.name || null };
      if (pt) {
        try {
          const bundle = await getBundle(pt.id);
          const inputs = {};
          bundle.variables.forEach((v) => {
            if (v.is_dimension) {
              if (v.dim_axis === 'W') inputs[v.var_key] = Number(item.w) || 0;
              else if (v.dim_axis === 'H') inputs[v.var_key] = Number(item.h) || 0;
              else if (v.dim_axis === 'D') inputs[v.var_key] = Number(item.d) || 0;
            } else if (v.default_value !== null && v.default_value !== undefined) {
              inputs[v.var_key] = Number(v.default_value);
            }
          });
          const out = computeForProductType({
            rules: bundle.rules,
            formulasById: bundle.formulasById,
            inputs,
          });
          const qty = Number(item.qty) || 1;
          row.unit_value = out.result;
          row.qty_value = out.result * qty;
          row.applied_formula_id = out.applied_formula_id;
          row.matched_rule_id = out.matched_rule_id;
          row.inputs = inputs;
          total += row.qty_value;
        } catch (e) {
          row.compute_error = e.message;
        }
      }
      enriched.push(row);
    }

    const { data: imp, error } = await supabase.from('calc_3d_imports').insert({
      file_name: f.originalname,
      file_path: `(memory)/${f.originalname}`,
      file_size: f.size,
      format: parsed.format,
      status: 'parsed',
      raw_meta: parsed.meta,
      items: enriched,
      total_result: total,
      created_by: req.user.userId,
    }).select().single();
    if (error) throw error;

    res.status(201).json({ import: imp, parser_status: parsed.parser_status });
  } catch (e) {
    res.status(400).json({ error: e?.message || 'Import lỗi' });
  }
});

r.get('/imports', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('calc_3d_imports')
      .select('id,file_name,format,status,total_result,total_currency,created_at,created_by')
      .order('created_at', { ascending: false })
      .limit(Number(req.query.limit) || 50);
    if (error) throw error;
    res.json({ imports: data || [] });
  } catch (e) { onErr(res, e); }
});

r.get('/imports/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('calc_3d_imports').select('*').eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    res.json({ import: data });
  } catch (e) { onErr(res, e); }
});

r.delete('/imports/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('calc_3d_imports').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { onErr(res, e); }
});

module.exports = r;
