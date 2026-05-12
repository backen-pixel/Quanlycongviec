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
const TRASH_SELECT_WITH_REASON =
  'id, entity_type, entity_id, entity_label, company_id, deleted_by, deleted_at, purge_after, delete_reason, deleter:users!trash_items_deleted_by_fkey(id, full_name)';
const TRASH_SELECT_NO_REASON =
  'id, entity_type, entity_id, entity_label, company_id, deleted_by, deleted_at, purge_after, deleter:users!trash_items_deleted_by_fkey(id, full_name)';

r.get('/', requireAdmin, async (req, res) => {
  try {
    const { entity_type, q } = req.query;
    const isSuper = req.user?.role === 'superadmin' || req.user?.role === 'super_admin';

    const buildQuery = (selectCols) => {
      let query = supabase
        .from('trash_items')
        .select(selectCols)
        .order('deleted_at', { ascending: false })
        .limit(500);
      if (!isSuper && req.user?.company_id) {
        query = query.or(`company_id.eq.${req.user.company_id},company_id.is.null`);
      }
      if (entity_type) query = query.eq('entity_type', entity_type);
      if (q) query = query.ilike('entity_label', `%${q}%`);
      return query;
    };

    let { data, error } = await buildQuery(TRASH_SELECT_WITH_REASON);
    // Cột delete_reason chưa được migrate (file 156_trash_items_delete_reason.sql)
    // → fallback select không kèm cột này, không làm hỏng UI.
    if (error && /delete_reason|column .* does not exist/i.test(String(error.message || ''))) {
      const fb = await buildQuery(TRASH_SELECT_NO_REASON);
      data = fb.data;
      error = fb.error;
    }
    if (error) throw error;
    res.json({ items: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/trash/:id — xem chi tiết (snapshot) 1 mục đã xóa
r.get('/:id', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('trash_items')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Không tìm thấy' });

    const isSuper = req.user?.role === 'superadmin' || req.user?.role === 'super_admin';
    if (!isSuper && req.user?.company_id && data.company_id && String(data.company_id) !== String(req.user.company_id)) {
      return res.status(403).json({ error: 'Không có quyền xem mục này' });
    }

    res.json(data);
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
