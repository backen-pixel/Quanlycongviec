/**
 * CRM: danh mục loại phát sinh + SLA hạn (Không gian chung).
 */
const { Router } = require('express');
const { supabase } = require('../../../config/supabase');
const { isSystemAdmin } = require('../../../helpers/adminRole');
const {
  UUID_RE,
  LEGACY_SLUGS,
  isPhatSinhKindSchemaError,
  normalizeSlaMode,
  normalizeSlaDays,
  slugFromName,
  canManagePhatSinhKinds,
  slaHint,
  listPhatSinhKinds,
  invalidatePhatSinhKindsCache,
} = require('../../../helpers/sharedWorkspacePhatSinhKinds');

const r = Router();

function timeToPg(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const h = String(Math.min(23, Math.max(0, Number(m[1])))).padStart(2, '0');
  const mi = String(Math.min(59, Math.max(0, Number(m[2])))).padStart(2, '0');
  return `${h}:${mi}:00`;
}

function withHint(row) {
  return { ...row, sla_hint: slaHint(row) };
}

r.get('/phat-sinh-kinds', async (req, res) => {
  try {
    const includeInactive = canManagePhatSinhKinds(req) && String(req.query.include_inactive || '') === '1';
    const kinds = await listPhatSinhKinds({ includeInactive });
    res.json({ phat_sinh_kinds: kinds.map(withHint), company_id: null });
  } catch (e) {
    if (isPhatSinhKindSchemaError(e)) return res.json({ phat_sinh_kinds: [], company_id: null });
    res.status(500).json({ error: e.message });
  }
});

r.post('/phat-sinh-kinds', async (req, res) => {
  try {
    if (!canManagePhatSinhKinds(req)) return res.status(403).json({ error: 'Chỉ admin được thêm loại phát sinh' });
    const b = req.body || {};
    const name = String(b.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Nhập tên loại phát sinh' });
    const sla_mode = normalizeSlaMode(b.sla_mode);
    const sla_days = normalizeSlaDays(b.sla_days, sla_mode === 'working_days' ? 3 : 1);
    const cutoff_time = sla_mode === 'noon_cutoff'
      ? (timeToPg(b.cutoff_time) || '12:00:00')
      : null;
    const { data: last } = await supabase
      .from('shared_workspace_phat_sinh_kinds')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1);
    const nextOrder = (last?.[0]?.sort_order ?? 0) + 10;
    const slug = slugFromName(name);
    const { data, error } = await supabase
      .from('shared_workspace_phat_sinh_kinds')
      .insert({
        name,
        company_id: null,
        slug,
        sla_mode,
        sla_days,
        cutoff_time,
        is_active: b.is_active !== false,
        sort_order: Number.isFinite(Number(b.sort_order)) ? Number(b.sort_order) : nextOrder,
      })
      .select('*')
      .single();
    if (error) throw error;
    invalidatePhatSinhKindsCache();
    res.status(201).json(withHint(data));
  } catch (e) {
    if (isPhatSinhKindSchemaError(e)) {
      return res.status(503).json({ error: 'Chưa chạy migration loại phát sinh (551).' });
    }
    if (/unique|duplicate/i.test(e.message || '')) {
      return res.status(400).json({ error: 'Tên / mã loại phát sinh đã tồn tại' });
    }
    res.status(500).json({ error: e.message });
  }
});

r.put('/phat-sinh-kinds/:id', async (req, res) => {
  try {
    if (!canManagePhatSinhKinds(req)) return res.status(403).json({ error: 'Chỉ admin được sửa loại phát sinh' });
    const id = String(req.params.id || '');
    if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID không hợp lệ' });
    const { data: existing, error: exErr } = await supabase
      .from('shared_workspace_phat_sinh_kinds')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (exErr) throw exErr;
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy loại phát sinh' });
    if (!isSystemAdmin(req.user) && existing.company_id && req.user?.company_id
      && String(existing.company_id) !== String(req.user.company_id)) {
      return res.status(403).json({ error: 'Không sửa loại phát sinh công ty khác' });
    }
    const b = req.body || {};
    const update = { updated_at: new Date().toISOString() };
    if (b.name !== undefined) {
      const name = String(b.name || '').trim();
      if (!name) return res.status(400).json({ error: 'Tên không được trống' });
      update.name = name;
    }
    if (b.sla_mode !== undefined) update.sla_mode = normalizeSlaMode(b.sla_mode, existing.sla_mode);
    if (b.sla_days !== undefined) update.sla_days = normalizeSlaDays(b.sla_days, existing.sla_days);
    if (b.cutoff_time !== undefined) {
      update.cutoff_time = timeToPg(b.cutoff_time);
    }
    if (b.is_active !== undefined) update.is_active = !!b.is_active;
    if (b.sort_order !== undefined && Number.isFinite(Number(b.sort_order))) {
      update.sort_order = Number(b.sort_order);
    }
    const nextMode = update.sla_mode || existing.sla_mode;
    if (nextMode !== 'noon_cutoff') update.cutoff_time = null;
    else if (update.cutoff_time == null && !existing.cutoff_time) update.cutoff_time = '12:00:00';
    const { data, error } = await supabase
      .from('shared_workspace_phat_sinh_kinds')
      .update(update)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    invalidatePhatSinhKindsCache();
    res.json(withHint(data));
  } catch (e) {
    if (/unique|duplicate/i.test(e.message || '')) {
      return res.status(400).json({ error: 'Tên loại phát sinh đã tồn tại' });
    }
    res.status(500).json({ error: e.message });
  }
});

r.delete('/phat-sinh-kinds/:id', async (req, res) => {
  try {
    if (!canManagePhatSinhKinds(req)) return res.status(403).json({ error: 'Chỉ admin được xóa loại phát sinh' });
    const id = String(req.params.id || '');
    if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID không hợp lệ' });
    const { data: existing, error: exErr } = await supabase
      .from('shared_workspace_phat_sinh_kinds')
      .select('id, slug, company_id')
      .eq('id', id)
      .maybeSingle();
    if (exErr) throw exErr;
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy loại phát sinh' });
    if (LEGACY_SLUGS.has(String(existing.slug || '')) && !existing.company_id) {
      return res.status(400).json({ error: 'Không xóa loại mặc định — có thể đổi tên, SLA hoặc tắt' });
    }
    if (!isSystemAdmin(req.user) && existing.company_id && req.user?.company_id
      && String(existing.company_id) !== String(req.user.company_id)) {
      return res.status(403).json({ error: 'Không xóa loại phát sinh công ty khác' });
    }
    const { error } = await supabase.from('shared_workspace_phat_sinh_kinds').delete().eq('id', id);
    if (error) throw error;
    invalidatePhatSinhKindsCache();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;
