const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { isSystemAdmin } = require('../helpers/adminRole');
const { assertCompanyOwnedRow } = require('../helpers/projectAccessScope');
const r = Router();

// ═══════════════════════════════════════════
// FIXED ROUTES (must come before /:id)
// ═══════════════════════════════════════════

function requireStageAdmin(req, res) {
  if (!['admin', 'manager'].includes(req.user.role)) {
    res.status(403).json({ error: 'Không có quyền' });
    return false;
  }
  return true;
}

// PUT /stages/reorder — reorder stages
r.put('/reorder', auth, async (req, res) => {
  try {
    if (!requireStageAdmin(req, res)) return;
    const { order } = req.body;
    if (!Array.isArray(order)) return res.status(400).json({ error: 'Cần mảng order' });
    const userCompany = req.user?.company_id ? String(req.user.company_id) : '';
    for (const item of order) {
      if (!isSystemAdmin(req.user) && userCompany) {
        const { data: row } = await supabase.from('workflow_stages').select('id, company_id').eq('id', item.id).maybeSingle();
        if (!assertCompanyOwnedRow(req, res, row, { label: 'giai đoạn workflow' })) return;
      }
      await supabase.from('workflow_stages').update({ order_index: item.order_index }).eq('id', item.id);
    }
    const { data } = await supabase.from('workflow_stages').select('*').order('order_index');
    res.json({ stages: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ CUSTOMER STATUSES ═══
r.get('/customer-statuses', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('customer_statuses').select('*').order('order_index');
    if (error) return res.json({ statuses: [] });
    res.json({ statuses: data || [] });
  } catch (e) { res.json({ statuses: [] }); }
});

r.post('/customer-statuses', auth, async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role))
      return res.status(403).json({ error: 'Không có quyền' });
    const { name, slug, color, icon, description, order_index } = req.body;
    if (!name || !slug) return res.status(400).json({ error: 'Cần name và slug' });
    let oi = order_index;
    if (oi === undefined || oi === null) {
      const { data: mx } = await supabase.from('customer_statuses').select('order_index').order('order_index', { ascending: false }).limit(1);
      oi = (mx?.[0]?.order_index || 0) + 1;
    }
    const { data, error } = await supabase.from('customer_statuses')
      .insert({ name, slug, color: color || '#6B7280', icon: icon || '', description: description || '', order_index: oi, is_active: true })
      .select().single();
    if (error) throw error;
    res.json({ status: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.put('/customer-statuses/:csId', auth, async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role))
      return res.status(403).json({ error: 'Không có quyền' });
    const { name, slug, color, icon, description, is_active } = req.body;
    const update = {};
    if (name !== undefined) update.name = name;
    if (slug !== undefined) update.slug = slug;
    if (color !== undefined) update.color = color;
    if (icon !== undefined) update.icon = icon;
    if (description !== undefined) update.description = description;
    if (is_active !== undefined) update.is_active = is_active;
    const { data, error } = await supabase.from('customer_statuses')
      .update(update).eq('id', req.params.csId).select().single();
    if (error) throw error;
    res.json({ status: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.delete('/customer-statuses/:csId', auth, async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role))
      return res.status(403).json({ error: 'Không có quyền' });
    const { error } = await supabase.from('customer_statuses').delete().eq('id', req.params.csId);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ STAGE ↔ CUSTOMER STATUS MAPPING ═══
r.get('/status-mapping', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('stage_customer_status_map')
      .select('*, stage:workflow_stages(*), customer_status:customer_statuses(*)');
    if (error) return res.json({ mappings: [] });
    res.json({ mappings: data || [] });
  } catch (e) { res.json({ mappings: [] }); }
});

r.put('/status-mapping', auth, async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role))
      return res.status(403).json({ error: 'Không có quyền' });
    const { mappings } = req.body;
    if (!Array.isArray(mappings)) return res.status(400).json({ error: 'Cần mảng mappings' });
    for (const m of mappings) {
      if (!m.stage_id || !m.customer_status_id) continue;
      await supabase.from('stage_customer_status_map').delete().eq('stage_id', m.stage_id);
      await supabase.from('stage_customer_status_map')
        .insert({ stage_id: m.stage_id, customer_status_id: m.customer_status_id });
    }
    const { data } = await supabase.from('stage_customer_status_map')
      .select('*, stage:workflow_stages(*), customer_status:customer_statuses(*)');
    res.json({ mappings: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════
// WORKFLOW STAGES CRUD (/:id routes LAST)
// ═══════════════════════════════════════════

// GET /stages — all stages
r.get('/', auth, async (req, res) => {
  try {
    const isAdmin = ['admin', 'manager'].includes(req.user.role);
    const { company_id } = req.query;
    // Chỉ chặn khi cố đọc workflow của công ty khác — không ép lọc theo company user
    // (19 giai đoạn mặc định company_id=null vẫn phải hiện cho mọi công ty).
    if (
      company_id
      && !isSystemAdmin(req.user)
      && req.user?.company_id
      && String(company_id) !== String(req.user.company_id)
      && company_id !== ''
    ) {
      return res.status(403).json({ error: 'Không xem được giai đoạn của công ty khác' });
    }
    let q = supabase.from('workflow_stages').select('*').order('order_index');
    if (!isAdmin) q = q.eq('is_active', true);
    if (company_id) q = q.eq('company_id', company_id);
    else if (company_id === '') q = q.is('company_id', null); // chỉ stages mặc định
    const { data, error } = await q;
    if (error) throw error;
    res.json({ stages: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /stages — create
r.post('/', auth, async (req, res) => {
  try {
    if (!requireStageAdmin(req, res)) return;
    let { name, slug, description, color, icon, order_index, company_id } = req.body;
    if (!name || !slug) return res.status(400).json({ error: 'Cần name và slug' });
    if (!isSystemAdmin(req.user) && req.user?.company_id) {
      company_id = req.user.company_id;
    }
    let oi = order_index;
    if (oi === undefined || oi === null) {
      const { data: mx } = await supabase.from('workflow_stages').select('order_index').order('order_index', { ascending: false }).limit(1);
      oi = (mx?.[0]?.order_index || 0) + 1;
    }
    const { data, error } = await supabase.from('workflow_stages')
      .insert({ name, slug, description: description || '', color: color || '#3B82F6', icon: icon || '', order_index: oi, is_active: true, company_id: company_id || null })
      .select().single();
    if (error) throw error;
    res.json({ stage: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /stages/:id — update
r.put('/:id', auth, async (req, res) => {
  try {
    if (!requireStageAdmin(req, res)) return;
    const { data: existing } = await supabase
      .from('workflow_stages')
      .select('id, company_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!isSystemAdmin(req.user)) {
      if (!assertCompanyOwnedRow(req, res, existing, { label: 'giai đoạn workflow' })) return;
    }
    const { name, slug, description, color, icon, is_active, company_id } = req.body;
    const update = {};
    if (name !== undefined) update.name = name;
    if (slug !== undefined) update.slug = slug;
    if (description !== undefined) update.description = description;
    if (color !== undefined) update.color = color;
    if (icon !== undefined) update.icon = icon;
    if (is_active !== undefined) update.is_active = is_active;
    if (company_id !== undefined && isSystemAdmin(req.user)) update.company_id = company_id || null;
    const { data, error } = await supabase.from('workflow_stages')
      .update(update).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ stage: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /stages/:id
r.delete('/:id', auth, async (req, res) => {
  try {
    if (!requireStageAdmin(req, res)) return;
    const { data: existing } = await supabase
      .from('workflow_stages')
      .select('id, company_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!isSystemAdmin(req.user)) {
      if (!assertCompanyOwnedRow(req, res, existing, { label: 'giai đoạn workflow' })) return;
    }
    const { data: tasks } = await supabase.from('tasks').select('id').eq('stage_id', req.params.id).limit(1);
    if (tasks?.length) return res.status(400).json({ error: 'Không thể xóa — còn nhiệm vụ liên kết. Hãy vô hiệu hóa thay vì xóa.' });
    const { data: projects } = await supabase.from('projects').select('id').eq('current_stage_id', req.params.id).limit(1);
    if (projects?.length) return res.status(400).json({ error: 'Không thể xóa — còn dự án liên kết. Hãy vô hiệu hóa thay vì xóa.' });
    const { error } = await supabase.from('workflow_stages').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = r;
