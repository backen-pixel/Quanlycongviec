/**
 * CRM Taxonomy — nguồn lead (sources) và phân loại nguồn (source-categories).
 */
const { Router } = require('express');
const { supabase } = require('../../../config/supabase');
const {
  invalidateSources,
  getCrmSourcesList,
  getCrmSourceCategoriesList,
} = require('../../../helpers/crmTaxonomyCache');
const { userIsAdmin, scopedAdminCompanyId, requireUserCompanyId } = require('../shared/requestScope');

const r = Router();

/** Phân loại nguồn: global (company_id null) khớp mọi nguồn; phân loại theo cty chỉ khớp nguồn cùng công ty */
async function assertCategoryFitsSource(sb, categoryId, sourceCompanyId) {
  if (!categoryId) return { ok: true };
  const { data: cat, error } = await sb.from('crm_source_categories').select('id, company_id').eq('id', categoryId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!cat) return { ok: false, error: 'Phân loại không tồn tại' };
  if (!cat.company_id) return { ok: true };
  if (!sourceCompanyId) {
    return { ok: false, error: 'Phân loại này thuộc một công ty — nguồn chung (không công ty) không được gắn' };
  }
  if (String(cat.company_id) !== String(sourceCompanyId)) {
    return { ok: false, error: 'Phân loại và nguồn phải cùng công ty' };
  }
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// SOURCES — bao gồm nguồn thông thường + FB pages gộp
// ═══════════════════════════════════════════════════════════════════════════
r.get('/sources', async (req, res) => {
  try {
    const qCo = req.query.company_id && String(req.query.company_id).trim() ? String(req.query.company_id).trim() : null;
    let filterCo = qCo;
    const sacSrc = scopedAdminCompanyId(req);
    if (sacSrc) {
      filterCo = sacSrc;
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      filterCo = cid;
    }

    const includeInactive = userIsAdmin(req.user?.role) && String(req.query.include_inactive) === '1';
    const data = await getCrmSourcesList({ filterCo, includeInactive });

    let pagesQ = supabase
      .from('facebook_pages')
      .select('id, page_id, page_name, is_active, default_company_id')
      .eq('is_active', true);
    if (filterCo) {
      pagesQ = pagesQ.or(`default_company_id.is.null,default_company_id.eq.${filterCo}`);
    }
    const { data: rawPages, error: pgErr } = await pagesQ;
    if (pgErr) throw pgErr;

    const pages = (rawPages || [])
      .filter(p => p.page_id)
      .sort((a, b) => (a.page_name || '').localeCompare(b.page_name || ''))
      .map(p => ({
        id: p.id,
        page_id: p.page_id,
        page_name: (p.page_name || '').trim(),
        is_active: !!p.is_active,
        default_company_id: p.default_company_id || null,
        source_key: p.page_id,
        page_ids: [p.page_id],
        page_count: 1,
      }));

    res.json({ sources: data || [], fb_pages: pages });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// SOURCE CATEGORIES — Phân loại nguồn (chung / theo công ty)
// ═══════════════════════════════════════════════════════════════════════════
r.get('/source-categories', async (req, res) => {
  try {
    let filterCo = req.query.company_id && String(req.query.company_id).trim() ? String(req.query.company_id).trim() : null;
    const sacCat = scopedAdminCompanyId(req);
    if (sacCat) {
      filterCo = sacCat;
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      filterCo = cid;
    }
    const includeInactive = userIsAdmin(req.user?.role) && String(req.query.include_inactive) === '1';
    const data = await getCrmSourceCategoriesList({ filterCo, includeInactive });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/source-categories', async (req, res) => {
  try {
    if (!userIsAdmin(req.user?.role)) return res.status(403).json({ error: 'Chỉ admin' });
    const b = req.body || {};
    if (!b.name?.trim()) return res.status(400).json({ error: 'Thiếu tên phân loại' });
    let company_id = b.company_id === '' || b.company_id === undefined ? null : b.company_id;
    if (company_id && typeof company_id !== 'string') company_id = String(company_id);

    const { data: lastRow } = await supabase
      .from('crm_source_categories')
      .select('order_index')
      .order('order_index', { ascending: false })
      .limit(1);
    const nextOrder = (lastRow?.[0]?.order_index ?? 0) + 1;

    const { data, error } = await supabase
      .from('crm_source_categories')
      .insert({
        name: b.name.trim(),
        icon: b.icon?.trim() || null,
        color: b.color?.trim() || null,
        order_index: b.order_index ?? nextOrder,
        company_id,
        is_active: b.is_active !== false,
      })
      .select('*')
      .single();
    if (error) throw error;
    invalidateSources();
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/source-categories/:id', async (req, res) => {
  try {
    if (!userIsAdmin(req.user?.role)) return res.status(403).json({ error: 'Chỉ admin' });
    const { data: existing, error: exErr } = await supabase
      .from('crm_source_categories')
      .select('id, company_id')
      .eq('id', req.params.id)
      .single();
    if (exErr) throw exErr;
    const b = req.body || {};
    const update = {};
    if (b.name !== undefined) update.name = String(b.name || '').trim();
    if (b.icon !== undefined) update.icon = b.icon?.trim() || null;
    if (b.color !== undefined) update.color = b.color?.trim() || null;
    if (b.order_index !== undefined) update.order_index = b.order_index;
    if (b.is_active !== undefined) update.is_active = !!b.is_active;
    if (b.company_id !== undefined) {
      update.company_id = b.company_id === '' || b.company_id === null ? null : String(b.company_id);
    }
    if (update.name === '') return res.status(400).json({ error: 'Tên không được trống' });

    const { data, error } = await supabase
      .from('crm_source_categories')
      .update(update)
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;
    invalidateSources();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.delete('/source-categories/:id', async (req, res) => {
  try {
    if (!userIsAdmin(req.user?.role)) return res.status(403).json({ error: 'Chỉ admin' });
    const { count } = await supabase
      .from('crm_sources')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', req.params.id);
    if ((count || 0) > 0) {
      return res.status(400).json({ error: `Không xóa được — ${count} nguồn đang dùng phân loại này` });
    }
    const { error } = await supabase.from('crm_source_categories').delete().eq('id', req.params.id);
    if (error) throw error;
    invalidateSources();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// SOURCES — Tạo / sửa (admin)
// ═══════════════════════════════════════════════════════════════════════════
r.post('/sources', async (req, res) => {
  try {
    if (!userIsAdmin(req.user?.role)) return res.status(403).json({ error: 'Chỉ admin' });
    const b = req.body || {};
    if (!b.name?.trim()) return res.status(400).json({ error: 'Thiếu tên nguồn' });
    let company_id = b.company_id === '' || b.company_id === undefined ? null : String(b.company_id);
    const category_id = b.category_id === '' || b.category_id === undefined ? null : String(b.category_id);
    const chk = await assertCategoryFitsSource(supabase, category_id, company_id);
    if (!chk.ok) return res.status(400).json({ error: chk.error });

    const { data, error } = await supabase
      .from('crm_sources')
      .insert({
        name: b.name.trim(),
        icon: b.icon?.trim() || '📎',
        color: b.color?.trim() || null,
        company_id,
        category_id,
        is_active: b.is_active !== false,
      })
      .select('*, category:crm_source_categories(id, name, icon, color, company_id)')
      .single();
    if (error) throw error;
    invalidateSources();
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/sources/:id', async (req, res) => {
  try {
    if (!userIsAdmin(req.user?.role)) return res.status(403).json({ error: 'Chỉ admin' });
    const b = req.body || {};
    const { data: existing, error: exErr } = await supabase
      .from('crm_sources')
      .select('id, company_id, category_id')
      .eq('id', req.params.id)
      .single();
    if (exErr) throw exErr;

    let company_id = existing.company_id;
    if (b.company_id !== undefined) {
      company_id = b.company_id === '' || b.company_id === null ? null : String(b.company_id);
    }
    let category_id = existing.category_id;
    if (b.category_id !== undefined) {
      category_id = b.category_id === '' || b.category_id === null ? null : String(b.category_id);
    }
    const chk = await assertCategoryFitsSource(supabase, category_id, company_id);
    if (!chk.ok) return res.status(400).json({ error: chk.error });

    const update = {};
    if (b.name !== undefined) update.name = String(b.name || '').trim();
    if (b.icon !== undefined) update.icon = b.icon?.trim() || null;
    if (b.color !== undefined) update.color = b.color?.trim() || null;
    if (b.is_active !== undefined) update.is_active = !!b.is_active;
    if (b.company_id !== undefined) update.company_id = company_id;
    if (b.category_id !== undefined) update.category_id = category_id;
    if (update.name === '') return res.status(400).json({ error: 'Tên không được trống' });

    const { data, error } = await supabase
      .from('crm_sources')
      .update(update)
      .eq('id', req.params.id)
      .select('*, category:crm_source_categories(id, name, icon, color, company_id)')
      .single();
    if (error) throw error;
    invalidateSources();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;
