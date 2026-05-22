/**
 * API: Phân loại dự án Sản xuất / Vận chuyển (workshop_project_types) — theo công ty
 */
const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/newPermission');
const { isSystemAdmin } = require('../helpers/adminRole');

const r = Router();
r.use(auth);

function userIsAdmin(user) {
  return isSystemAdmin(user);
}

function requireUserCompanyId(req, res) {
  const cid = req.user?.company_id;
  if (!cid) {
    res.status(400).json({ error: 'Thiếu company_id của tài khoản. Gán công ty cho user hoặc dùng tài khoản admin.' });
    return null;
  }
  return String(cid);
}

function matchesModule(appliesTo, module) {
  if (!module) return true;
  if (appliesTo === 'both') return true;
  return String(appliesTo) === String(module);
}

r.get('/project-types', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const { company_id, module, all: allParam } = req.query;
    let companyId = company_id || null;
    if (!userIsAdmin(req.user)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      if (companyId && String(companyId) !== String(cid)) {
        return res.status(403).json({ error: 'Không có quyền xem loại của công ty khác' });
      }
      companyId = cid;
    } else {
      if (!companyId) return res.json([]);
    }
    let q = supabase
      .from('workshop_project_types')
      .select('*')
      .eq('company_id', companyId)
      .order('order_index');
    if (String(allParam) !== 'true') q = q.eq('is_active', true);
    const { data, error } = await q;
    if (error) throw error;
    let rows = data || [];
    if (module) {
      rows = rows.filter((t) => matchesModule(t.applies_to, module));
    }
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

r.post('/project-types', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name?.trim()) return res.status(400).json({ error: 'Thiếu tên loại' });
    let company_id = b.company_id || null;
    if (!userIsAdmin(req.user)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      company_id = cid;
    }
    if (!company_id) return res.status(400).json({ error: 'Thiếu company_id' });
    const at = String(b.applies_to || 'both');
    const applies_to = ['production', 'logistics', 'both'].includes(at) ? at : 'both';
    const { data: last } = await supabase
      .from('workshop_project_types')
      .select('order_index')
      .eq('company_id', company_id)
      .order('order_index', { ascending: false })
      .limit(1);
    const nextOrder = (last?.[0]?.order_index ?? 0) + 1;
    const { data, error } = await supabase
      .from('workshop_project_types')
      .insert({
        company_id,
        name: b.name.trim(),
        applies_to,
        order_index: b.order_index ?? nextOrder,
        is_active: b.is_active !== false,
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/project-types/:id', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const b = req.body || {};
    const { data: existing, error: exErr } = await supabase
      .from('workshop_project_types')
      .select('id, company_id')
      .eq('id', req.params.id)
      .single();
    if (exErr) throw exErr;
    if (!userIsAdmin(req.user)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      if (String(existing.company_id || '') !== String(cid)) {
        return res.status(403).json({ error: 'Không có quyền sửa loại của công ty khác' });
      }
    }
    const update = { updated_at: new Date().toISOString() };
    ['name', 'order_index', 'is_active'].forEach((f) => {
      if (b[f] !== undefined) update[f] = b[f];
    });
    if (b.applies_to !== undefined) {
      const at = String(b.applies_to || 'both');
      update.applies_to = ['production', 'logistics', 'both'].includes(at) ? at : 'both';
    }
    if (b.name !== undefined) update.name = String(b.name).trim();
    const { data, error } = await supabase
      .from('workshop_project_types')
      .update(update)
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.delete('/project-types/:id', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const { data: existing, error: exErr } = await supabase
      .from('workshop_project_types')
      .select('id, company_id')
      .eq('id', req.params.id)
      .single();
    if (exErr) throw exErr;
    if (!userIsAdmin(req.user)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      if (String(existing.company_id || '') !== String(cid)) {
        return res.status(403).json({ error: 'Không có quyền xóa loại của công ty khác' });
      }
    }
    const { count } = await supabase
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('workshop_type_id', req.params.id);
    if ((count || 0) > 0) {
      return res.status(400).json({ error: `Không thể xóa — ${count} dự án đang dùng loại này` });
    }
    const { error } = await supabase.from('workshop_project_types').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;
