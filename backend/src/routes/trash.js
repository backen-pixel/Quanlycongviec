// Route /api/trash — Thùng rác (xóa giả) cho lead/deal và file ghi chú.
// Chỉ admin (role = 'admin' hoặc 'superadmin'/'super_admin') được phép xem,
// phục hồi hoặc xóa vĩnh viễn.
const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const { restoreTrashItem } = require('../helpers/trashSnapshot');
const { writeAuditLog } = require('../helpers/auditLog');
const { canAccessTrash, isAdminLike, isProductionAdmin, isLogisticsAdmin } = require('../helpers/adminRole');

const r = Router();
r.use(auth);

function requireTrashAccess(req, res, next) {
  if (!canAccessTrash(req.user)) {
    return res.status(403).json({ error: 'Không có quyền truy cập thùng rác' });
  }
  next();
}

// GET /api/trash — list các mục đã xóa giả
const TRASH_SELECT_WITH_REASON =
  'id, entity_type, entity_id, entity_label, company_id, deleted_by, deleted_at, purge_after, delete_reason, deleter:users!trash_items_deleted_by_fkey(id, full_name)';
const TRASH_SELECT_NO_REASON =
  'id, entity_type, entity_id, entity_label, company_id, deleted_by, deleted_at, purge_after, deleter:users!trash_items_deleted_by_fkey(id, full_name)';

r.get('/', requireTrashAccess, async (req, res) => {
  try {
    let { entity_type, q } = req.query;
    if (isProductionAdmin(req.user) && !isAdminLike(req.user)) {
      if (entity_type && entity_type !== 'project') {
        return res.status(403).json({ error: 'Chỉ được xem thùng rác Sản xuất (dự án)' });
      }
      entity_type = entity_type || 'project';
    }
    if (isLogisticsAdmin(req.user) && !isAdminLike(req.user)) {
      return res.status(403).json({
        error: 'Thùng rác Vận chuyển dùng API /api/logistics/trash',
      });
    }
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
r.get('/:id', requireTrashAccess, async (req, res) => {
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
r.post('/:id/restore', requireTrashAccess, async (req, res) => {
  const { data: before } = await supabase.from('trash_items').select('id, entity_type, entity_id, entity_label, company_id').eq('id', req.params.id).maybeSingle();
  const out = await restoreTrashItem(supabase, req.params.id);
  if (!out.ok) {
    return res.status(400).json({ error: out.error, errors: out.errors || [] });
  }
  void writeAuditLog(req, {
    module: 'trash',
    action: 'restore',
    entity_type: before?.entity_type,
    entity_id: before?.entity_id,
    entity_label: before?.entity_label,
    company_id: before?.company_id,
    metadata: { trash_item_id: req.params.id, restore_errors: out.errors || [] },
  });
  res.json({ success: true, errors: out.errors || [] });
});

// DELETE /api/trash/:id — xóa vĩnh viễn
r.delete('/:id', requireTrashAccess, async (req, res) => {
  try {
    const { data: before } = await supabase
      .from('trash_items')
      .select('id, entity_type, entity_id, entity_label, company_id')
      .eq('id', req.params.id)
      .maybeSingle();
    const { error } = await supabase.from('trash_items').delete().eq('id', req.params.id);
    if (error) throw error;
    void writeAuditLog(req, {
      module: 'trash',
      action: 'purge',
      entity_type: before?.entity_type,
      entity_id: before?.entity_id,
      entity_label: before?.entity_label,
      company_id: before?.company_id,
      metadata: { trash_item_id: req.params.id },
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/trash/empty — dọn sạch (admin công ty: chỉ company mình)
r.post('/empty', requireTrashAccess, async (req, res) => {
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
    void writeAuditLog(req, {
      module: 'trash',
      action: 'empty',
      metadata: { scope: isSuper ? 'all' : String(req.user?.company_id || '') },
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;
