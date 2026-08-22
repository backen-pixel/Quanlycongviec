/**
 * CRM: danh mục loại lỗi Không gian chung + NV chịu trách nhiệm / vai trò.
 */
const { Router } = require('express');
const { supabase } = require('../../../config/supabase');
const { isSystemAdmin } = require('../../../helpers/adminRole');
const {
  UUID_RE,
  normalizeSourceKind,
  isErrorTypeSchemaError,
  canManageErrorTypes,
  listErrorTypes,
  replaceErrorTypeStaff,
} = require('../../../helpers/sharedWorkspaceErrorTypes');

const r = Router();

r.get('/error-types', async (req, res) => {
  try {
    const includeInactive = canManageErrorTypes(req) && String(req.query.include_inactive || '') === '1';
    const types = await listErrorTypes({ includeInactive });
    res.json({ error_types: types, company_id: null });
  } catch (e) {
    if (isErrorTypeSchemaError(e)) return res.json({ error_types: [], company_id: null });
    res.status(500).json({ error: e.message });
  }
});

r.post('/error-types', async (req, res) => {
  try {
    if (!canManageErrorTypes(req)) return res.status(403).json({ error: 'Chỉ admin được thêm loại lỗi' });
    const b = req.body || {};
    const name = String(b.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Nhập tên loại lỗi' });
    const { data: last } = await supabase
      .from('shared_workspace_error_types')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1);
    const nextOrder = (last?.[0]?.sort_order ?? 0) + 10;
    const { data, error } = await supabase
      .from('shared_workspace_error_types')
      .insert({
        name,
        company_id: null,
        source_kind: normalizeSourceKind(b.source_kind),
        is_active: b.is_active !== false,
        sort_order: Number.isFinite(Number(b.sort_order)) ? Number(b.sort_order) : nextOrder,
        slug: null,
      })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json({ ...data, staff: [] });
  } catch (e) {
    if (isErrorTypeSchemaError(e)) {
      return res.status(503).json({ error: 'Chưa chạy migration loại lỗi (549).' });
    }
    if (/unique|duplicate/i.test(e.message || '')) {
      return res.status(400).json({ error: 'Tên loại lỗi đã tồn tại' });
    }
    res.status(500).json({ error: e.message });
  }
});

r.put('/error-types/:id', async (req, res) => {
  try {
    if (!canManageErrorTypes(req)) return res.status(403).json({ error: 'Chỉ admin được sửa loại lỗi' });
    const id = String(req.params.id || '');
    if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID không hợp lệ' });
    const { data: existing, error: exErr } = await supabase
      .from('shared_workspace_error_types')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (exErr) throw exErr;
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy loại lỗi' });
    if (!isSystemAdmin(req.user) && existing.company_id && req.user?.company_id
      && String(existing.company_id) !== String(req.user.company_id)) {
      return res.status(403).json({ error: 'Không sửa loại lỗi công ty khác' });
    }
    const b = req.body || {};
    const update = { updated_at: new Date().toISOString() };
    if (b.name !== undefined) {
      const name = String(b.name || '').trim();
      if (!name) return res.status(400).json({ error: 'Tên không được trống' });
      update.name = name;
    }
    if (b.source_kind !== undefined) update.source_kind = normalizeSourceKind(b.source_kind, existing.source_kind);
    if (b.is_active !== undefined) update.is_active = !!b.is_active;
    if (b.sort_order !== undefined && Number.isFinite(Number(b.sort_order))) {
      update.sort_order = Number(b.sort_order);
    }
    const { data, error } = await supabase
      .from('shared_workspace_error_types')
      .update(update)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    if (/unique|duplicate/i.test(e.message || '')) {
      return res.status(400).json({ error: 'Tên loại lỗi đã tồn tại' });
    }
    res.status(500).json({ error: e.message });
  }
});

r.delete('/error-types/:id', async (req, res) => {
  try {
    if (!canManageErrorTypes(req)) return res.status(403).json({ error: 'Chỉ admin được xóa loại lỗi' });
    const id = String(req.params.id || '');
    if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID không hợp lệ' });
    const { data: existing, error: exErr } = await supabase
      .from('shared_workspace_error_types')
      .select('id, slug, company_id')
      .eq('id', id)
      .maybeSingle();
    if (exErr) throw exErr;
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy loại lỗi' });
    if (existing.slug) {
      return res.status(400).json({ error: 'Không xóa loại lỗi mặc định — có thể đổi tên hoặc tắt' });
    }
    if (!isSystemAdmin(req.user) && existing.company_id && req.user?.company_id
      && String(existing.company_id) !== String(req.user.company_id)) {
      return res.status(403).json({ error: 'Không xóa loại lỗi công ty khác' });
    }
    const { error } = await supabase.from('shared_workspace_error_types').delete().eq('id', id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/error-types/:id/staff', async (req, res) => {
  try {
    if (!canManageErrorTypes(req)) return res.status(403).json({ error: 'Chỉ admin được gán nhân viên loại lỗi' });
    const id = String(req.params.id || '');
    if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID không hợp lệ' });
    const { data: existing, error: exErr } = await supabase
      .from('shared_workspace_error_types')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (exErr) throw exErr;
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy loại lỗi' });
    const staff = Array.isArray(req.body?.staff) ? req.body.staff : [];
    await replaceErrorTypeStaff(id, staff);
    const types = await listErrorTypes({ includeInactive: true });
    const updated = types.find((t) => String(t.id) === String(id));
    res.json(updated || { id, staff: [] });
  } catch (e) {
    if (isErrorTypeSchemaError(e)) {
      return res.status(503).json({ error: 'Chưa chạy migration loại lỗi (549).' });
    }
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;
