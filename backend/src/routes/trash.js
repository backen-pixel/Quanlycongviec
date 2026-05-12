// Route /api/trash — Thùng rác (xóa giả) cho lead/deal và file ghi chú.
// Chỉ admin (role = 'admin' hoặc 'superadmin'/'super_admin') được phép xem,
// phục hồi hoặc xóa vĩnh viễn.
const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const { restoreTrashItem } = require('../helpers/trashSnapshot');

const r = Router();
r.use(auth);

const ADMIN_ROLES = new Set(['admin', 'superadmin', 'super_admin']);

function requireAdmin(req, res, next) {
  if (!ADMIN_ROLES.has(req.user?.role)) {
    return res.status(403).json({ error: 'Chỉ admin được truy cập thùng rác' });
  }
  next();
}

// GET /api/trash — list các mục đã xóa giả
r.get('/', requireAdmin, async (req, res) => {
  try {
    const { entity_type, q } = req.query;
    let query = supabase
      .from('trash_items')
      .select('id, entity_type, entity_id, entity_label, company_id, deleted_by, deleted_at, purge_after, delete_reason, deleter:users!trash_items_deleted_by_fkey(id, full_name)')
      .order('deleted_at', { ascending: false })
      .limit(500);

    // Admin công ty (không phải super_admin) chỉ thấy thùng rác công ty mình
    const isSuper = req.user?.role === 'superadmin' || req.user?.role === 'super_admin';
    if (!isSuper && req.user?.company_id) {
      query = query.or(`company_id.eq.${req.user.company_id},company_id.is.null`);
    }
    if (entity_type) query = query.eq('entity_type', entity_type);
    if (q) query = query.ilike('entity_label', `%${q}%`);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ items: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/trash/:id/restore — phục hồi 1 mục
r.post('/:id/restore', requireAdmin, async (req, res) => {
  const out = await restoreTrashItem(supabase, req.params.id);
  if (!out.ok) return res.status(400).json({ error: out.error });
  res.json({ success: true });
});

// DELETE /api/trash/:id — xóa vĩnh viễn
r.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { error } = await supabase.from('trash_items').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/trash/empty — dọn sạch (admin công ty: chỉ company mình)
r.post('/empty', requireAdmin, async (req, res) => {
  try {
    const isSuper = req.user?.role === 'superadmin' || req.user?.role === 'super_admin';
    let q = supabase.from('trash_items').delete();
    if (!isSuper && req.user?.company_id) {
      q = q.eq('company_id', req.user.company_id);
    } else {
      q = q.neq('id', '00000000-0000-0000-0000-000000000000');
    }
    const { error } = await q;
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;
