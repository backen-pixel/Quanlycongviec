const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const { isAdminLike } = require('../helpers/adminRole');
const {
  newShareToken,
  sanitizeShareImages,
  sanitizeShareTitle,
  resolveExpiresAtFromBody,
  loadShareByToken,
  isValidShareToken,
} = require('../helpers/publicShareLinks');

const r = Router();
r.use(auth);

function canManageShare(req, row) {
  const uid = String(req.user?.userId || req.user?.id || '');
  if (row?.created_by && String(row.created_by) === uid) return true;
  return isAdminLike(req.user);
}

function shareOwnerPayload(row) {
  const expiresAt = row?.expires_at || null;
  const revokedAt = row?.revoked_at || null;
  const expired = !!(expiresAt && new Date(expiresAt).getTime() < Date.now());
  return {
    token: row.token,
    path: `/s/${row.token}`,
    expires_at: expiresAt,
    revoked_at: revokedAt,
    unlimited: !expiresAt,
    active: !revokedAt && !expired,
  };
}

async function loadOwnedShare(req, res) {
  const token = String(req.params.token || '').trim();
  if (!isValidShareToken(token)) {
    res.status(404).json({ error: 'Không tìm thấy link' });
    return null;
  }
  const loaded = await loadShareByToken(token);
  if (loaded.error === 'db') {
    res.status(500).json({ error: 'Lỗi tải link' });
    return null;
  }
  if (loaded.error || !loaded.row) {
    res.status(404).json({ error: 'Không tìm thấy link' });
    return null;
  }
  if (!canManageShare(req, loaded.row)) {
    res.status(403).json({ error: 'Không có quyền quản lý link này' });
    return null;
  }
  return loaded.row;
}

/** POST /api/share/comment-images — tạo link xem ảnh, không chứa PII khách hàng. */
r.post('/comment-images', async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const images = sanitizeShareImages(req.body?.images);
    if (!images.length) {
      return res.status(400).json({ error: 'Không có ảnh hợp lệ để chia sẻ' });
    }

    const title = sanitizeShareTitle(req.body?.title, images.length);
    const { expiresAt } = resolveExpiresAtFromBody(req.body, { required: true });
    const token = newShareToken();
    const companyId = req.user?.company_id || null;

    const { data, error } = await supabase
      .from('public_share_links')
      .insert({
        token,
        kind: 'comment_images',
        title,
        payload: { images },
        created_by: userId,
        company_id: companyId,
        expires_at: expiresAt,
      })
      .select('token, expires_at, revoked_at, created_by')
      .single();

    if (error) {
      console.error('POST /share/comment-images:', error.message);
      return res.status(500).json({ error: 'Không tạo được link xem' });
    }

    res.json(shareOwnerPayload(data));
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('POST /share/comment-images:', e.message);
    res.status(status).json({ error: e.message || 'Lỗi tạo link' });
  }
});

r.get('/:token', async (req, res) => {
  try {
    const row = await loadOwnedShare(req, res);
    if (!row) return;
    res.json(shareOwnerPayload(row));
  } catch (e) {
    res.status(500).json({ error: e.message || 'Lỗi tải link' });
  }
});

r.patch('/:token', async (req, res) => {
  try {
    const row = await loadOwnedShare(req, res);
    if (!row) return;
    if (row.revoked_at) {
      return res.status(410).json({ error: 'Link đã bị vô hiệu hóa' });
    }
    const resolved = resolveExpiresAtFromBody(req.body);
    if (resolved.skip) {
      return res.status(400).json({ error: 'Thiếu hạn xem mới' });
    }
    const { data, error } = await supabase
      .from('public_share_links')
      .update({ expires_at: resolved.expiresAt })
      .eq('id', row.id)
      .select('token, expires_at, revoked_at, created_by')
      .single();
    if (error) {
      console.error('PATCH /share:', error.message);
      return res.status(500).json({ error: 'Không đổi được hạn xem' });
    }
    res.json(shareOwnerPayload(data));
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('PATCH /share:', e.message);
    res.status(status).json({ error: e.message || 'Lỗi đổi hạn xem' });
  }
});

r.post('/:token/revoke', async (req, res) => {
  try {
    const row = await loadOwnedShare(req, res);
    if (!row) return;
    if (row.revoked_at) return res.json(shareOwnerPayload(row));
    const { data, error } = await supabase
      .from('public_share_links')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', row.id)
      .select('token, expires_at, revoked_at, created_by')
      .single();
    if (error) {
      console.error('POST /share/revoke:', error.message);
      return res.status(500).json({ error: 'Không vô hiệu hóa được link' });
    }
    res.json(shareOwnerPayload(data));
  } catch (e) {
    res.status(500).json({ error: e.message || 'Lỗi vô hiệu hóa link' });
  }
});

module.exports = r;
