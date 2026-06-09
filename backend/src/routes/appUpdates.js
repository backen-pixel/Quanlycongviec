/**
 * App Update Server — quản lý phiên bản & phân phối cập nhật cho nhiều app Android nội bộ.
 *
 *  Public (không cần đăng nhập — app gọi trước khi login):
 *    GET  /api/app-updates/check       — so sánh phiên bản, trả link tải APK / thông tin OTA
 *    GET  /api/app-updates/manifest     — Expo Updates protocol (jsbundle OTA)
 *    GET  /api/app-updates/download/:id — redirect tới file APK
 *
 *  Admin (auth + role admin):
 *    GET    /api/app-updates/apps
 *    POST   /api/app-updates/apps
 *    GET    /api/app-updates/apps/:appId/releases
 *    POST   /api/app-updates/apps/:appId/releases     (upload APK)
 *    PUT    /api/app-updates/releases/:id
 *    DELETE /api/app-updates/releases/:id
 */
const { Router } = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { isAdminLike } = require('../helpers/adminRole');
const { parseReleaseFilename, FILENAME_RULE_TEXT, buildStandardApkFilename } = require('../helpers/appReleaseFilename');
const { scanAppReleaseFiles } = require('../helpers/appReleaseScan');
const { importApkFile } = require('../helpers/appReleaseImport');
const config = require('../config');

const r = Router();

function publicBaseUrl(req) {
  if (process.env.PUBLIC_API_URL) return process.env.PUBLIC_API_URL.replace(/\/$/, '');
  const host = req.get('x-forwarded-host') || req.get('host');
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  if (host) return `${proto}://${host}`;
  return `http://localhost:${config.port}`;
}

const BUCKET = 'app-releases';
const MB = 1024 * 1024;
// APK thường 50-150MB; cho phép tới 512MB (env APK_MAX_UPLOAD_MB).
const MAX_APK_BYTES = (() => {
  const raw = parseInt(process.env.APK_MAX_UPLOAD_MB || '512', 10);
  const mb = Number.isFinite(raw) && raw > 0 ? raw : 512;
  return Math.min(mb * MB, 1024 * MB);
})();

// ── Đảm bảo bucket tồn tại (public, giới hạn lớn cho APK) ──────────────────────
let _bucketReady = false;
async function ensureBucket() {
  if (_bucketReady) return;
  try {
    const { data: existing } = await supabase.storage.getBucket(BUCKET);
    if (!existing) {
      await supabase.storage.createBucket(BUCKET, {
        public: true,
        fileSizeLimit: `${Math.round(MAX_APK_BYTES / MB)}MB`,
      });
    }
    _bucketReady = true;
  } catch (e) {
    // Không chặn request nếu bucket đã tồn tại / lỗi quyền — log để theo dõi.
    console.warn('[appUpdates] ensureBucket:', e?.message || e);
    _bucketReady = true;
  }
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function requireAdmin(req, res, next) {
  if (!isAdminLike(req.user)) {
    return res.status(403).json({ error: 'Chỉ admin mới được quản lý phiên bản app' });
  }
  next();
}

async function findApp({ appKey, appId }) {
  let q = supabase.from('mobile_apps').select('*');
  if (appId) q = q.eq('id', appId);
  else q = q.eq('app_key', appKey);
  const { data } = await q.maybeSingle();
  return data || null;
}

function downloadUrlFor(release) {
  return release.external_url || release.file_url || null;
}

// ═══════════════════════════════════════════════════════════════
//  PUBLIC — không cần đăng nhập
// ═══════════════════════════════════════════════════════════════

// GET /check?app=crm-mobile&platform=android&versionCode=51&version=1.3.35&channel=production
r.get('/check', async (req, res) => {
  try {
    const appKey = String(req.query.app || '').trim();
    if (!appKey) return res.status(400).json({ error: 'Thiếu tham số app' });
    const channel = String(req.query.channel || 'production').trim();
    const clientCode = parseInt(req.query.versionCode, 10);
    const clientVersion = String(req.query.version || '').trim();

    const app = await findApp({ appKey });
    if (!app || !app.is_active) {
      return res.status(404).json({ error: 'App không tồn tại hoặc đã tắt' });
    }

    const { data: rows } = await supabase
      .from('app_releases')
      .select('*')
      .eq('app_id', app.id)
      .eq('channel', channel)
      .eq('update_type', 'apk')
      .eq('is_active', true)
      .order('version_code', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1);

    const latest = rows?.[0] || null;

    // Log best-effort (không chặn response)
    supabase.from('app_update_logs').insert({
      app_id: app.id,
      from_version: clientVersion || null,
      to_version: latest?.version || null,
      device_id: req.query.deviceId ? String(req.query.deviceId) : null,
      platform: String(req.query.platform || app.platform),
      action: 'check',
    }).then(() => {}, () => {});

    if (!latest) {
      return res.json({ updateAvailable: false, latestVersion: null });
    }

    const hasNewer = Number.isFinite(clientCode) && latest.version_code != null
      ? latest.version_code > clientCode
      : false;

    res.json({
      updateAvailable: hasNewer,
      mandatory: hasNewer && latest.is_mandatory,
      latestVersion: latest.version,
      latestVersionCode: latest.version_code,
      downloadUrl: hasNewer ? downloadUrlFor(latest) : null,
      size: latest.file_size,
      sha256: latest.sha256,
      releaseNotes: latest.release_notes || null,
    });
  } catch (e) {
    console.error('[appUpdates] check:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /download/:releaseId — redirect tới file (tiện đặt link cố định)
r.get('/download/:releaseId', async (req, res) => {
  try {
    const { data: rel } = await supabase
      .from('app_releases')
      .select('*')
      .eq('id', req.params.releaseId)
      .maybeSingle();
    if (!rel) return res.status(404).json({ error: 'Không tìm thấy phiên bản' });
    const url = downloadUrlFor(rel);
    if (!url) return res.status(404).json({ error: 'Phiên bản chưa có file' });
    supabase.from('app_update_logs').insert({
      app_id: rel.app_id, to_version: rel.version, action: 'download',
      platform: 'android',
    }).then(() => {}, () => {});
    res.redirect(302, url);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
//  EXPO UPDATES PROTOCOL — manifest cho OTA jsbundle (public)
//  Tham khảo: https://docs.expo.dev/technical-specs/expo-updates-1/
// ═══════════════════════════════════════════════════════════════

function multipartManifest(res, parts) {
  const boundary = `boundary${crypto.randomBytes(8).toString('hex')}`;
  res.setHeader('expo-protocol-version', '1');
  res.setHeader('expo-sfv-version', '0');
  res.setHeader('cache-control', 'private, max-age=0');
  res.setHeader('content-type', `multipart/mixed; boundary=${boundary}`);
  let body = '';
  for (const part of parts) {
    body += `--${boundary}\r\n`;
    body += `Content-Type: application/json; charset=utf-8\r\n`;
    body += `Content-Disposition: form-data; name="${part.name}"\r\n\r\n`;
    body += `${JSON.stringify(part.value)}\r\n`;
  }
  body += `--${boundary}--\r\n`;
  res.status(200).send(body);
}

// GET /manifest?app=crm-mobile  (headers: expo-runtime-version, expo-channel-name, expo-platform)
r.get('/manifest', async (req, res) => {
  try {
    const appKey = String(req.query.app || '').trim();
    if (!appKey) return res.status(400).json({ error: 'Thiếu tham số app' });

    const runtimeVersion = String(req.headers['expo-runtime-version'] || req.query.runtimeVersion || '').trim();
    const channel = String(req.headers['expo-channel-name'] || req.query.channel || 'production').trim();
    const protocolVersion = parseInt(req.headers['expo-protocol-version'] || '1', 10);

    const app = await findApp({ appKey });
    if (!app) return res.status(404).json({ error: 'App không tồn tại' });

    let q = supabase
      .from('app_releases')
      .select('*')
      .eq('app_id', app.id)
      .eq('channel', channel)
      .eq('update_type', 'jsbundle')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1);
    if (runtimeVersion) q = q.eq('runtime_version', runtimeVersion);

    const { data: rows } = await q;
    const rel = rows?.[0];

    // Không có bản OTA phù hợp → báo client giữ bundle hiện tại.
    if (!rel || !rel.manifest) {
      if (protocolVersion >= 1) {
        return multipartManifest(res, [{ name: 'directive', value: { type: 'noUpdateAvailable' } }]);
      }
      return res.status(404).json({ error: 'Không có bản cập nhật' });
    }

    // Protocol 0: trả thẳng JSON manifest. Protocol >= 1: multipart/mixed.
    if (protocolVersion === 0) {
      res.setHeader('expo-protocol-version', '0');
      res.setHeader('expo-sfv-version', '0');
      res.setHeader('cache-control', 'private, max-age=0');
      return res.status(200).json(rel.manifest);
    }
    return multipartManifest(res, [{ name: 'manifest', value: rel.manifest }]);
  } catch (e) {
    console.error('[appUpdates] manifest:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN — auth + role admin
// ═══════════════════════════════════════════════════════════════
r.use(auth);

// GET /apps — danh sách app + phiên bản mới nhất
r.get('/apps', async (req, res) => {
  try {
    const { data: apps, error } = await supabase
      .from('mobile_apps')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;

    // Phiên bản apk mới nhất cho mỗi app
    const ids = (apps || []).map((a) => a.id);
    let latestByApp = {};
    if (ids.length) {
      const { data: rels } = await supabase
        .from('app_releases')
        .select('app_id, version, version_code, update_type, is_active, created_at')
        .in('app_id', ids)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      for (const rel of rels || []) {
        if (!latestByApp[rel.app_id]) latestByApp[rel.app_id] = rel;
      }
    }
    res.json({ apps: (apps || []).map((a) => ({ ...a, latest_release: latestByApp[a.id] || null })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /apps — đăng ký app mới
r.post('/apps', requireAdmin, async (req, res) => {
  try {
    const { app_key, display_name, android_package, platform, icon_url } = req.body;
    if (!app_key || !display_name) {
      return res.status(400).json({ error: 'app_key và display_name là bắt buộc' });
    }
    const { data, error } = await supabase.from('mobile_apps').insert({
      app_key: String(app_key).trim(),
      display_name: String(display_name).trim(),
      android_package: android_package || null,
      platform: platform || 'android',
      icon_url: icon_url || null,
    }).select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    if (String(e.message).includes('duplicate')) {
      return res.status(409).json({ error: 'app_key đã tồn tại' });
    }
    res.status(500).json({ error: e.message });
  }
});

// PUT /apps/:appId — sửa thông tin app
r.put('/apps/:appId', requireAdmin, async (req, res) => {
  try {
    const patch = { updated_at: new Date().toISOString() };
    ['display_name', 'android_package', 'platform', 'icon_url', 'is_active'].forEach((f) => {
      if (req.body[f] !== undefined) patch[f] = req.body[f];
    });
    const { data, error } = await supabase.from('mobile_apps')
      .update(patch).eq('id', req.params.appId).select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /filename-rule — quy tắc tên file APK
r.get('/filename-rule', (_, res) => {
  res.json({
    rule: FILENAME_RULE_TEXT,
    example: buildStandardApkFilename('crm-mobile', '1.3.35', 51, { release: true }),
  });
});

// GET /apps/:appId/scan-files — quét thư mục APK, đọc phiên bản từ tên file
r.get('/apps/:appId/scan-files', async (req, res) => {
  try {
    const app = await findApp({ appId: req.params.appId });
    if (!app) return res.status(404).json({ error: 'App không tồn tại' });
    const result = await scanAppReleaseFiles(app);
    res.json(result);
  } catch (e) {
    console.error('[appUpdates] scan-files:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /apps/:appId/scan-import — import file APK hợp lệ (tự đọc version từ tên file)
r.post('/apps/:appId/scan-import', requireAdmin, async (req, res) => {
  try {
    const app = await findApp({ appId: req.params.appId });
    if (!app) return res.status(404).json({ error: 'App không tồn tại' });

    const scan = await scanAppReleaseFiles(app);
    const paths = Array.isArray(req.body?.paths) ? req.body.paths : null;
    const toImport = paths
      ? scan.importable.filter((f) => paths.includes(f.path))
      : scan.importable;

    if (!toImport.length) {
      return res.json({
        imported: [],
        skipped: scan.skipped,
        already_imported: scan.already_imported,
        message: 'Không có file APK mới hợp lệ để import',
      });
    }

    const base = publicBaseUrl(req);
    const imported = [];
    const failed = [];
    for (const f of toImport) {
      try {
        const rel = await importApkFile(app, f.path, {
          channel: req.body?.channel || 'production',
          is_mandatory: req.body?.is_mandatory === true,
          release_notes: req.body?.release_notes || `Import tự động: ${f.name}`,
          created_by: req.user.userId || req.user.id || null,
          publicBaseUrl: base,
        });
        imported.push(rel);
      } catch (err) {
        failed.push({ path: f.path, name: f.name, error: err.message });
      }
    }

    res.json({
      imported,
      failed,
      skipped: scan.skipped,
      already_imported: scan.already_imported,
    });
  } catch (e) {
    console.error('[appUpdates] scan-import:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /apps/:appId/releases — lịch sử phát hành
r.get('/apps/:appId/releases', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('app_releases')
      .select('*, creator:users!app_releases_created_by_fkey(id, full_name)')
      .eq('app_id', req.params.appId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ releases: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Upload APK (disk → Storage) ──
const diskUpload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (req, file, cb) =>
      cb(null, `apk_${Date.now()}_${Math.random().toString(36).slice(2)}.apk`),
  }),
  limits: { fileSize: MAX_APK_BYTES },
  fileFilter: (req, file, cb) => {
    const ok = /\.(apk|aab)$/i.test(file.originalname)
      || file.mimetype === 'application/vnd.android.package-archive'
      || file.mimetype === 'application/octet-stream';
    cb(ok ? null : new Error('Chỉ chấp nhận file .apk'), ok);
  },
});

function apkUploadSingle(req, res, next) {
  diskUpload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: `APK vượt quá ${Math.round(MAX_APK_BYTES / MB)}MB. Tăng env APK_MAX_UPLOAD_MB hoặc dùng external_url.`,
      });
    }
    return res.status(400).json({ error: err.message || 'Lỗi upload' });
  });
}

// POST /apps/:appId/releases — tạo bản phát hành (kèm upload APK hoặc external_url)
r.post('/apps/:appId/releases', requireAdmin, apkUploadSingle, async (req, res) => {
  const tmpPath = req.file?.path;
  try {
    const app = await findApp({ appId: req.params.appId });
    if (!app) {
      if (tmpPath) fs.unlink(tmpPath, () => {});
      return res.status(404).json({ error: 'App không tồn tại' });
    }

    const {
      version, version_code, channel, runtime_version, update_type,
      external_url, is_mandatory, is_active, release_notes,
    } = req.body;

    let resolvedVersion = version ? String(version).trim() : '';
    let resolvedCode = version_code != null && version_code !== '' ? parseInt(version_code, 10) : null;

    if (tmpPath && req.file?.originalname) {
      const parsed = parseReleaseFilename(req.file.originalname);
      if (!resolvedVersion && parsed.ok) resolvedVersion = parsed.version;
      if (resolvedCode == null && parsed.ok && parsed.versionCode != null) resolvedCode = parsed.versionCode;
      if (!parsed.ok && !resolvedVersion) {
        fs.unlink(tmpPath, () => {});
        return res.status(400).json({ error: parsed.error });
      }
    }

    if (!resolvedVersion) {
      if (tmpPath) fs.unlink(tmpPath, () => {});
      return res.status(400).json({
        error: 'version là bắt buộc — nhập tay hoặc đặt tên file có số phiên bản (vd: app-1.0.0-code2.apk)',
      });
    }

  if (tmpPath) {
      await ensureBucket();
      const data = await importApkFile(app, tmpPath, {
        channel: channel || 'production',
        version: resolvedVersion,
        version_code: resolvedCode,
        is_mandatory: is_mandatory === true || is_mandatory === 'true',
        is_active: is_active === undefined ? true : (is_active === true || is_active === 'true'),
        release_notes: release_notes || null,
        created_by: req.user.userId || req.user.id || null,
        publicBaseUrl: publicBaseUrl(req),
      });
      fs.unlink(tmpPath, () => {});
      return res.status(201).json(data);
    }

    if (!external_url) {
      return res.status(400).json({ error: 'Cần upload file APK hoặc cung cấp external_url' });
    }

    const { data, error } = await supabase.from('app_releases').insert({
      app_id: app.id,
      channel: channel || 'production',
      update_type: update_type || 'apk',
      version: resolvedVersion,
      version_code: Number.isFinite(resolvedCode) ? resolvedCode : null,
      runtime_version: runtime_version || null,
      external_url: external_url || null,
      is_mandatory: is_mandatory === true || is_mandatory === 'true',
      is_active: is_active === undefined ? true : (is_active === true || is_active === 'true'),
      release_notes: release_notes || null,
      created_by: req.user.userId || req.user.id || null,
    }).select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    if (tmpPath) fs.unlink(tmpPath, () => {});
    console.error('[appUpdates] create release:', e);
    res.status(500).json({ error: e.message });
  }
});

// PUT /releases/:id — bật/tắt active, mandatory, sửa notes…
r.put('/releases/:id', requireAdmin, async (req, res) => {
  try {
    const patch = { updated_at: new Date().toISOString() };
    ['version', 'version_code', 'channel', 'is_mandatory', 'is_active', 'release_notes', 'external_url']
      .forEach((f) => { if (req.body[f] !== undefined) patch[f] = req.body[f]; });
    const { data, error } = await supabase.from('app_releases')
      .update(patch).eq('id', req.params.id).select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /releases/:id — xóa file Storage + bản ghi
r.delete('/releases/:id', requireAdmin, async (req, res) => {
  try {
    const { data: rel } = await supabase.from('app_releases')
      .select('storage_path').eq('id', req.params.id).maybeSingle();
    if (rel?.storage_path) {
      await supabase.storage.from(BUCKET).remove([rel.storage_path]);
    }
    const { error } = await supabase.from('app_releases').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = r;
