const { Router } = require('express');
const {
  loadActiveShare,
  publicImageSrc,
  bumpViewCount,
  toLocalUploadPath,
} = require('../helpers/publicShareLinks');

const r = Router();

function shareGone(res, reason) {
  const expired = reason === 'expired';
  return res.status(410).json({
    error: expired ? 'Link đã hết hạn' : 'Link đã bị vô hiệu hóa',
    reason: expired ? 'expired' : 'revoked',
  });
}

function shareNotFound(res) {
  return res.status(404).json({ error: 'Không tìm thấy link' });
}

/** GET /api/public/share/:token — metadata + URL ảnh (không JWT, không PII). */
r.get('/share/:token', async (req, res) => {
  try {
    const loaded = await loadActiveShare(req.params.token);
    if (loaded.error === 'db') {
      console.error('GET /public/share:', loaded.detail);
      return res.status(500).json({ error: 'Lỗi tải link' });
    }
    if (loaded.error === 'expired' || loaded.error === 'revoked' || loaded.error === 'gone') {
      return shareGone(res, loaded.error);
    }
    if (loaded.error || !loaded.row) return shareNotFound(res);

    const row = loaded.row;
    const token = row.token;
    const stored = Array.isArray(row.payload?.images) ? row.payload.images : [];
    const images = stored.map((img, index) => ({
      src: publicImageSrc(token, index, img.url),
      name: img.name || `anh-${index + 1}`,
      mime: img.mime || 'image/jpeg',
      index,
    }));

    bumpViewCount(row.id);
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({
      title: row.title || 'Ảnh chia sẻ',
      expires_at: row.expires_at || null,
      unlimited: !row.expires_at,
      images,
    });
  } catch (e) {
    console.error('GET /public/share:', e.message);
    res.status(500).json({ error: e.message || 'Lỗi tải link' });
  }
});

/** GET /api/public/share/:token/file/:index — proxy file /uploads (không JWT). */
r.get('/share/:token/file/:index', async (req, res) => {
  try {
    const loaded = await loadActiveShare(req.params.token);
    if (loaded.error === 'expired' || loaded.error === 'revoked' || loaded.error === 'gone') {
      return shareGone(res, loaded.error);
    }
    if (loaded.error || !loaded.row) return shareNotFound(res);

    const stored = Array.isArray(loaded.row.payload?.images) ? loaded.row.payload.images : [];
    const index = parseInt(String(req.params.index || ''), 10);
    if (!Number.isInteger(index) || index < 0 || index >= stored.length) {
      return res.status(404).json({ error: 'Không tìm thấy ảnh' });
    }
    const localPath = toLocalUploadPath(stored[index]?.url);
    if (!localPath) return res.status(404).json({ error: 'Ảnh này không tải qua máy chủ' });

    const { resolveUploadDownloadSource, sendUploadDownloadResponse } = require('../helpers/localUploadServe');
    const resolved = await resolveUploadDownloadSource(localPath);
    if (!resolved) return res.status(404).json({ error: 'Không tìm thấy file' });

    const downloadName = stored[index]?.name || resolved.basename || `anh-${index + 1}`;
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return sendUploadDownloadResponse(res, resolved, downloadName, { inline: true });
  } catch (e) {
    console.error('GET /public/share/file:', e.message);
    res.status(500).json({ error: e.message || 'Lỗi tải ảnh' });
  }
});

module.exports = r;
