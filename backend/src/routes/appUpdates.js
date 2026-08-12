/**
 * App Update Server — quản lý phiên bản & phân phối cập nhật cho nhiều app Android nội bộ.
 *
 *  Public (không cần đăng nhập — app gọi trước khi login):
 *    GET  /api/app-updates/check       — so sánh phiên bản, trả link tải APK
 *    GET  /api/app-updates/latest      — bản APK đầy đủ mới nhất (trang Tải app)
 *    GET  /api/app-updates/ota-current — phiên bản OTA (jsbundle) đang active trên server
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
const axios = require('axios');
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
const { notifyAppReleaseIfActive } = require('../helpers/appUpdateNotify');
const { importApkFile, replaceReleaseApkFile, replaceReleaseOtaFile, backfillOtaSizes } = require('../helpers/appReleaseImport');
const { deleteAppReleaseById, clearReleaseBucketFilesOnly } = require('../helpers/appReleaseDelete');
const {
  apkFilenameForRelease,
  resolveLocalApkPath,
  resolveDiskPathFromFileUrl,
  statFileSizeSafe,
  buildPublicDownloadUrl,
  isReleaseApkAvailable,
} = require('../helpers/appReleaseDownload');
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

function currentUserId(req) {
  return req.user?.userId || req.user?.id || null;
}

async function getUserScanDir(userId, appId) {
  if (!userId || !appId) return '';
  const { data } = await supabase
    .from('app_scan_dirs')
    .select('scan_dir')
    .eq('user_id', userId)
    .eq('app_id', appId)
    .maybeSingle();
  return data?.scan_dir || '';
}

async function findApp({ appKey, appId }) {
  let q = supabase.from('mobile_apps').select('*');
  if (appId) q = q.eq('id', appId);
  else q = q.eq('app_key', appKey);
  const { data } = await q.maybeSingle();
  return data || null;
}

function downloadUrlFor(release, publicBase) {
  // Ưu tiên URL Storage/CDN trực tiếp — proxy qua Render dễ timeout/mất file
  // khi app mobile tải APK ~20MB (ENOENT khi đọc cache sau tải).
  const fileUrl = String(release.file_url || '').trim();
  if (fileUrl && /^https?:\/\//i.test(fileUrl) && !/\/uploads\/app-releases\//i.test(fileUrl)) {
    return fileUrl;
  }
  const external = String(release.external_url || '').trim();
  if (external && /^https?:\/\//i.test(external)) return external;
  return buildPublicDownloadUrl(publicBase, release.id);
}

/** So sánh semver đơn giản: âm nếu a < b, 0 nếu bằng, dương nếu a > b. */
function compareVersionNames(a, b) {
  const pa = String(a || '').trim().split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b || '').trim().split('.').map((x) => parseInt(x, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da !== db) return da - db;
  }
  return 0;
}

function clientNeedsUpdate(clientCode, clientVersion, latest) {
  if (!latest) return false;
  const latestCode = latest.version_code;
  const latestVer = String(latest.version || '').trim();
  const clientVer = String(clientVersion || '').trim();

  // Khớp chính xác tên bản (vd. 2.0.57 === 2.0.57)
  if (clientVer && latestVer && clientVer === latestVer) return false;

  // Tên phiên bản đã khớp / mới hơn → coi là đã cập nhật (tránh loop khi versionCode lệch tên).
  if (clientVer && latestVer) {
    const byName = compareVersionNames(clientVer, latestVer);
    if (byName >= 0) return false;
  }

  if (Number.isFinite(clientCode) && latestCode != null) {
    if (clientCode >= latestCode) return false;
  }

  if (clientVer && latestVer && compareVersionNames(clientVer, latestVer) < 0) return true;
  if (Number.isFinite(clientCode) && latestCode != null && clientCode < latestCode) return true;
  return false;
}

async function streamRemoteApk(res, remoteUrl, filename, expectedSize) {
  const upstream = await axios.get(remoteUrl, {
    responseType: 'stream',
    maxRedirects: 5,
    timeout: 600000,
    validateStatus: (s) => s >= 200 && s < 400,
  });
  const ct = String(upstream.headers['content-type'] || '').toLowerCase();
  if (ct.includes('application/json') || ct.includes('text/html')) {
    upstream.data.destroy?.();
    return res.status(502).json({ error: 'Nguồn APK ngoài trả về dữ liệu lỗi' });
  }
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  const len = upstream.headers['content-length'];
  if (len) res.setHeader('Content-Length', String(len));
  else if (expectedSize) res.setHeader('Content-Length', String(expectedSize));
  upstream.data.pipe(res);
}

/** Ưu tiên file trên disk (uploads local) trước khi redirect Storage/external. */
function resolveReleaseApkDiskPath(release, appKey) {
  return resolveLocalApkPath(release, appKey) || resolveDiskPathFromFileUrl(release.file_url);
}

function effectiveReleaseFileSize(release, appKey) {
  const diskPath = resolveReleaseApkDiskPath(release, appKey);
  if (diskPath) {
    const onDisk = statFileSizeSafe(diskPath);
    if (onDisk != null && onDisk > 0) return onDisk;
  }
  const sz = Number(release.file_size);
  return Number.isFinite(sz) && sz > 0 ? sz : null;
}

function sendApkFile(res, diskPath, filename) {
  const size = statFileSizeSafe(diskPath);
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  if (size != null && size > 0) res.setHeader('Content-Length', String(size));
  return res.sendFile(diskPath);
}

function computeStorageStats(releases) {
  let total_bytes = 0;
  let release_count = 0;
  let sized_count = 0;
  for (const r of releases || []) {
    release_count += 1;
    const sz = Number(r.file_size);
    if (Number.isFinite(sz) && sz > 0) {
      total_bytes += sz;
      sized_count += 1;
    }
  }
  return {
    total_bytes,
    release_count,
    sized_count,
    unsized_count: release_count - sized_count,
  };
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

    const needsUpdate = clientNeedsUpdate(clientCode, clientVersion, latest);
    const apkReady = isReleaseApkAvailable(latest, appKey);
    const hasNewer = needsUpdate && apkReady;

    res.json({
      updateAvailable: hasNewer,
      mandatory: hasNewer && latest.is_mandatory,
      latestVersion: latest.version,
      latestVersionCode: latest.version_code,
      downloadUrl: hasNewer ? downloadUrlFor(latest, publicBaseUrl(req)) : null,
      size: effectiveReleaseFileSize(latest, appKey),
      sha256: latest.sha256,
      releaseNotes: latest.release_notes || null,
      apkReady,
      needsUpdate,
    });
  } catch (e) {
    console.error('[appUpdates] check:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /latest?app=crm-mobile-v2&channel=production — bản APK đầy đủ mới nhất (trang Tải app)
r.get('/latest', async (req, res) => {
  try {
    const appKey = String(req.query.app || '').trim();
    if (!appKey) return res.status(400).json({ error: 'Thiếu tham số app' });
    const channel = String(req.query.channel || 'production').trim();

    const app = await findApp({ appKey });
    if (!app || !app.is_active) {
      return res.status(404).json({ error: 'App không tồn tại hoặc đã tắt' });
    }

    const { data: rows } = await supabase
      .from('app_releases')
      .select('id, version, version_code, file_size, sha256, release_notes, is_mandatory, created_at, updated_at, storage_path, file_url, external_url, update_type')
      .eq('app_id', app.id)
      .eq('channel', channel)
      .eq('update_type', 'apk')
      .eq('is_active', true)
      .order('version_code', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1);

    const latest = rows?.[0] || null;
    if (!latest) {
      return res.json({
        available: false,
        appKey,
        displayName: app.display_name || appKey,
        version: null,
        versionCode: null,
        downloadUrl: null,
      });
    }

    const apkReady = isReleaseApkAvailable(latest, appKey);

    res.json({
      available: apkReady,
      appKey,
      displayName: app.display_name || appKey,
      releaseId: latest.id,
      version: latest.version,
      versionCode: latest.version_code,
      downloadUrl: apkReady ? downloadUrlFor(latest, publicBaseUrl(req)) : null,
      size: effectiveReleaseFileSize(latest, appKey),
      sha256: latest.sha256,
      releaseNotes: latest.release_notes || null,
      mandatory: latest.is_mandatory,
      publishedAt: latest.updated_at || latest.created_at,
      apkReady,
    });
  } catch (e) {
    console.error('[appUpdates] latest:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /ota-current?app=tubep-demo&runtime=1.0.0&channel=production
r.get('/ota-current', async (req, res) => {
  try {
    const appKey = String(req.query.app || '').trim();
    if (!appKey) return res.status(400).json({ error: 'Thiếu tham số app' });
    const channel = String(req.query.channel || 'production').trim();
    const runtimeVersion = String(req.query.runtime || req.query.runtimeVersion || '').trim();

    const app = await findApp({ appKey });
    if (!app || !app.is_active) {
      return res.status(404).json({ error: 'App không tồn tại hoặc đã tắt' });
    }

    let q = supabase
      .from('app_releases')
      .select('id, version, runtime_version, release_notes, is_mandatory, manifest, created_at, updated_at')
      .eq('app_id', app.id)
      .eq('channel', channel)
      .eq('update_type', 'jsbundle')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1);
    if (runtimeVersion) q = q.eq('runtime_version', runtimeVersion);

    const { data: rows } = await q;
    const rel = rows?.[0] || null;
    if (!rel) {
      return res.json({ available: false, version: null });
    }

    res.json({
      available: true,
      version: rel.version,
      runtimeVersion: rel.runtime_version,
      releaseNotes: rel.release_notes || null,
      mandatory: rel.is_mandatory,
      updateId: rel.manifest?.id || null,
      publishedAt: rel.updated_at || rel.created_at,
      source: 'server',
    });
  } catch (e) {
    console.error('[appUpdates] ota-current:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /download/:releaseId — phục vụ APK (local uploads) hoặc redirect Storage/external
r.get('/download/:releaseId', async (req, res) => {
  try {
    const { data: rel } = await supabase
      .from('app_releases')
      .select('*, mobile_apps(app_key, display_name)')
      .eq('id', req.params.releaseId)
      .maybeSingle();
    if (!rel) return res.status(404).json({ error: 'Không tìm thấy phiên bản' });
    if (rel.update_type !== 'apk') {
      return res.status(400).json({ error: 'Chỉ hỗ trợ tải bản phát hành APK' });
    }

    const appKey = rel.mobile_apps?.app_key || null;
    const localPath = resolveReleaseApkDiskPath(rel, appKey);
    const filename = localPath
      ? path.basename(localPath)
      : apkFilenameForRelease(rel, appKey || 'app');

    supabase.from('app_update_logs').insert({
      app_id: rel.app_id, to_version: rel.version, action: 'download',
      platform: 'android',
    }).then(() => {}, () => {});

    if (localPath) {
      return sendApkFile(res, localPath, filename);
    }

    let remote = rel.external_url
      || (rel.file_url && /^https?:\/\//i.test(rel.file_url) ? rel.file_url : null);
    if (!remote && rel.storage_path) {
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(rel.storage_path);
      remote = urlData?.publicUrl || null;
    }
    if (remote) {
      if (/\/uploads\/app-releases\//i.test(remote)) {
        return res.status(404).json({
          error: 'File APK không còn trên server — admin hãy upload lại bản phát hành (Phát hành → chọn .apk)',
        });
      }
      // Redirect thẳng CDN — tránh stream qua Render (dễ đứt với APK lớn trên mạng mobile).
      return res.redirect(302, remote);
    }

    return res.status(404).json({
      error: 'Không tìm thấy file APK trên server — hãy upload lại bản phát hành',
    });
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

    const ids = (apps || []).map((a) => a.id);
    let latestByApp = {};
    const statsByApp = {};
    if (ids.length) {
      const { data: rels } = await supabase
        .from('app_releases')
        .select('app_id, version, version_code, update_type, is_active, created_at, file_size')
        .in('app_id', ids)
        .order('created_at', { ascending: false });
      const grouped = {};
      for (const rel of rels || []) {
        if (!grouped[rel.app_id]) grouped[rel.app_id] = [];
        grouped[rel.app_id].push(rel);
        if (rel.is_active && !latestByApp[rel.app_id]) latestByApp[rel.app_id] = rel;
      }
      for (const id of ids) {
        statsByApp[id] = computeStorageStats(grouped[id] || []);
      }
    }
    res.json({
      apps: (apps || []).map((a) => ({
        ...a,
        latest_release: latestByApp[a.id] || null,
        storage_stats: statsByApp[a.id] || computeStorageStats([]),
      })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /apps — đăng ký app mới
r.post('/apps', requireAdmin, async (req, res) => {
  try {
    const { app_key, display_name, android_package, platform, icon_url, apk_scan_dir } = req.body;
    if (!app_key || !display_name) {
      return res.status(400).json({ error: 'app_key và display_name là bắt buộc' });
    }
    const { data, error } = await supabase.from('mobile_apps').insert({
      app_key: String(app_key).trim(),
      display_name: String(display_name).trim(),
      android_package: android_package || null,
      platform: platform || 'android',
      icon_url: icon_url || null,
      apk_scan_dir: apk_scan_dir ? String(apk_scan_dir).trim() : null,
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
    ['display_name', 'android_package', 'platform', 'icon_url', 'is_active', 'apk_scan_dir'].forEach((f) => {
      if (req.body[f] !== undefined) {
        patch[f] = f === 'apk_scan_dir' && typeof req.body[f] === 'string'
          ? (req.body[f].trim() || null)
          : req.body[f];
      }
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
    const userScanDir = await getUserScanDir(currentUserId(req), app.id);
    const result = await scanAppReleaseFiles(app, { userScanDir });
    res.json(result);
  } catch (e) {
    console.error('[appUpdates] scan-files:', e);
    res.status(500).json({ error: e.message });
  }
});

// PUT /apps/:appId/scan-dir — lưu thư mục quét APK riêng của nhân viên hiện tại
r.put('/apps/:appId/scan-dir', requireAdmin, async (req, res) => {
  try {
    const userId = currentUserId(req);
    if (!userId) return res.status(401).json({ error: 'Chưa đăng nhập' });
    const app = await findApp({ appId: req.params.appId });
    if (!app) return res.status(404).json({ error: 'App không tồn tại' });

    const raw = typeof req.body?.scan_dir === 'string' ? req.body.scan_dir.trim() : '';
    const { error } = await supabase
      .from('app_scan_dirs')
      .upsert(
        { user_id: userId, app_id: app.id, scan_dir: raw || null, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,app_id' },
      );
    if (error) throw error;

    const result = await scanAppReleaseFiles(app, { userScanDir: raw });
    res.json({ my_scan_dir: raw, scan: result });
  } catch (e) {
    console.error('[appUpdates] save scan-dir:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /apps/:appId/scan-import — import file APK hợp lệ (tự đọc version từ tên file)
r.post('/apps/:appId/scan-import', requireAdmin, async (req, res) => {
  try {
    const app = await findApp({ appId: req.params.appId });
    if (!app) return res.status(404).json({ error: 'App không tồn tại' });

    const userScanDir = await getUserScanDir(currentUserId(req), app.id);
    const scan = await scanAppReleaseFiles(app, { userScanDir });
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
        notifyAppReleaseIfActive(app, rel);
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
    const releases = data || [];
    const app = await findApp({ appId: req.params.appId });
    if (app) await backfillOtaSizes(app, releases);
    res.json({
      releases,
      storage_summary: computeStorageStats(releases),
    });
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
    const name = file.originalname || '';
    const ok = /\.(apk|aab|hbc|bundle|js)$/i.test(name)
      || file.mimetype === 'application/vnd.android.package-archive'
      || file.mimetype === 'application/javascript'
      || file.mimetype === 'application/octet-stream';
    cb(ok ? null : new Error('Chấp nhận .apk hoặc bundle OTA (.hbc, .bundle, .js)'), ok);
  },
});

function releaseFileUploadSingle(req, res, next) {
  diskUpload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: `File vượt quá ${Math.round(MAX_APK_BYTES / MB)}MB. Tăng env APK_MAX_UPLOAD_MB hoặc dùng external_url.`,
      });
    }
    return res.status(400).json({ error: err.message || 'Lỗi upload' });
  });
}

/** @deprecated alias */
const apkUploadSingle = releaseFileUploadSingle;

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
    }

    if (!resolvedVersion) {
      if (tmpPath) fs.unlink(tmpPath, () => {});
      return res.status(400).json({
        error: 'version là bắt buộc — nhập trong form phát hành (tên file APK không bắt buộc chứa số phiên bản).',
      });
    }

  if (tmpPath) {
      await ensureBucket();
      const data = await importApkFile(app, tmpPath, {
        channel: channel || 'production',
        version: resolvedVersion,
        version_code: resolvedCode,
        originalFilename: req.file?.originalname || undefined,
        is_mandatory: is_mandatory === true || is_mandatory === 'true',
        is_active: is_active === undefined ? true : (is_active === true || is_active === 'true'),
        release_notes: release_notes || null,
        created_by: req.user.userId || req.user.id || null,
        publicBaseUrl: publicBaseUrl(req),
      });
      fs.unlink(tmpPath, () => {});
      notifyAppReleaseIfActive(app, data);
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
    notifyAppReleaseIfActive(app, data);
    res.status(201).json(data);
  } catch (e) {
    if (tmpPath) fs.unlink(tmpPath, () => {});
    console.error('[appUpdates] create release:', e);
    res.status(500).json({ error: e.message });
  }
});

// PUT /releases/:id — sửa metadata và (tuỳ chọn) thay file (multipart field: file)
r.put('/releases/:id', requireAdmin, releaseFileUploadSingle, async (req, res) => {
  const tmpPath = req.file?.path;
  try {
    const { data: existing } = await supabase
      .from('app_releases')
      .select('*, mobile_apps(*)')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!existing) {
      if (tmpPath) fs.unlink(tmpPath, () => {});
      return res.status(404).json({ error: 'Không tìm thấy phiên bản' });
    }

    const app = existing.mobile_apps;
    if (!app) {
      if (tmpPath) fs.unlink(tmpPath, () => {});
      return res.status(404).json({ error: 'App không tồn tại' });
    }

    if (tmpPath) {
      await ensureBucket();
      if (existing.update_type === 'apk') {
        await replaceReleaseApkFile(existing, app, tmpPath, {
          channel: req.body.channel || existing.channel,
          version: req.body.version ? String(req.body.version).trim() : undefined,
          version_code: req.body.version_code,
          originalFilename: req.file?.originalname || undefined,
          publicBaseUrl: publicBaseUrl(req),
        });
      } else if (existing.update_type === 'jsbundle') {
        await replaceReleaseOtaFile(existing, app, tmpPath, {
          runtime_version: req.body.runtime_version || existing.runtime_version,
        });
      } else {
        fs.unlink(tmpPath, () => {});
        return res.status(400).json({ error: 'Loại phát hành không hỗ trợ thay file' });
      }
    }

    const patch = { updated_at: new Date().toISOString() };

    if (req.body.version !== undefined) {
      const v = String(req.body.version).trim();
      if (!v) return res.status(400).json({ error: 'version không được rỗng' });
      patch.version = v;
    }
    if (req.body.version_code !== undefined) {
      const raw = req.body.version_code;
      if (raw === '' || raw === null) patch.version_code = null;
      else {
        const n = parseInt(raw, 10);
        if (!Number.isFinite(n)) return res.status(400).json({ error: 'version_code phải là số' });
        patch.version_code = n;
      }
    }
    if (req.body.runtime_version !== undefined) {
      const rv = String(req.body.runtime_version).trim();
      patch.runtime_version = rv || null;
    }
    if (req.body.channel !== undefined) {
      patch.channel = String(req.body.channel).trim() || 'production';
    }
    if (req.body.release_notes !== undefined) {
      patch.release_notes = req.body.release_notes ? String(req.body.release_notes) : null;
    }
    if (req.body.external_url !== undefined) {
      patch.external_url = req.body.external_url ? String(req.body.external_url).trim() : null;
    }
    if (req.body.is_mandatory !== undefined) {
      patch.is_mandatory = req.body.is_mandatory === true || req.body.is_mandatory === 'true';
    }
    if (req.body.is_active !== undefined) {
      patch.is_active = req.body.is_active === true || req.body.is_active === 'true';
    }

    const hasMeta = Object.keys(patch).length > 1;
    let data;
    if (hasMeta) {
      const { data: updated, error } = await supabase.from('app_releases')
        .update(patch).eq('id', req.params.id).select('*').single();
      if (error) throw error;
      data = updated;
    } else if (tmpPath) {
      const { data: updated, error } = await supabase.from('app_releases')
        .select('*').eq('id', req.params.id).single();
      if (error) throw error;
      data = updated;
    } else {
      const { data: updated, error } = await supabase.from('app_releases')
        .select('*').eq('id', req.params.id).single();
      if (error) throw error;
      data = updated;
    }

    if (tmpPath) fs.unlink(tmpPath, () => {});
    const becameActive = patch.is_active === true && existing.is_active !== true;
    if (becameActive || (data?.is_active && patch.is_active === true)) {
      notifyAppReleaseIfActive(app, data);
    }
    res.json(data);
  } catch (e) {
    if (tmpPath) fs.unlink(tmpPath, () => {});
    console.error('[appUpdates] put release:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /releases/:id/run — bật phát hành bản này (bắt buộc), tắt các bản cùng loại/kênh/runtime
r.post('/releases/:id/run', requireAdmin, async (req, res) => {
  try {
    const { data: rel } = await supabase
      .from('app_releases')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!rel) return res.status(404).json({ error: 'Không tìm thấy phiên bản' });

    if (rel.update_type === 'jsbundle') {
      if (!rel.manifest?.launchAsset?.url) {
        return res.status(400).json({ error: 'OTA chưa có bundle — upload file trước khi chạy' });
      }
    } else if (rel.update_type === 'apk') {
      if (!rel.file_url && !rel.external_url) {
        return res.status(400).json({ error: 'APK chưa có file — upload trước khi chạy' });
      }
    }

    let offQ = supabase
      .from('app_releases')
      .update({ is_active: false, is_mandatory: false, updated_at: new Date().toISOString() })
      .eq('app_id', rel.app_id)
      .eq('channel', rel.channel)
      .eq('update_type', rel.update_type)
      .neq('id', rel.id);
    if (rel.update_type === 'jsbundle' && rel.runtime_version) {
      offQ = offQ.eq('runtime_version', rel.runtime_version);
    }
    const { error: offErr } = await offQ;
    if (offErr) throw offErr;

    const patch = {
      is_active: true,
      is_mandatory: true,
      updated_at: new Date().toISOString(),
    };

    // OTA: expo-updates chỉ áp dụng bản có createdAt MỚI HƠN bản đang chạy.
    // Khi ép chạy (kể cả bản code cũ hơn), đóng dấu manifest id + createdAt mới
    // để máy coi đây là bản mới nhất và buộc tải về, tránh bị "không cài được".
    if (rel.update_type === 'jsbundle' && rel.manifest) {
      patch.manifest = {
        ...rel.manifest,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };
    }

    const { data: updated, error } = await supabase
      .from('app_releases')
      .update(patch)
      .eq('id', rel.id)
      .select('*')
      .single();
    if (error) throw error;

    const { data: appRow } = await supabase
      .from('mobile_apps')
      .select('id, app_key, display_name')
      .eq('id', rel.app_id)
      .maybeSingle();
    if (appRow) notifyAppReleaseIfActive(appRow, updated);

    res.json({ release: updated });
  } catch (e) {
    console.error('[appUpdates] run release:', e);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /releases/:id/file — xóa file trên bucket, giữ bản ghi phiên bản
r.delete('/releases/:id/file', requireAdmin, async (req, res) => {
  try {
    const result = await clearReleaseBucketFilesOnly(req.params.id);
    if (!result.found) return res.status(404).json({ error: 'Không tìm thấy phiên bản' });
    res.json({
      success: true,
      release: result.release,
      storageFilesRemoved: result.storageFilesRemoved,
      fileErrors: result.errors?.length ? result.errors : undefined,
    });
  } catch (e) {
    console.error('[appUpdates] delete release file:', e);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /releases/:id — xóa bucket Storage + bản ghi DB (giữ file local uploads)
r.delete('/releases/:id', requireAdmin, async (req, res) => {
  try {
    const result = await deleteAppReleaseById(req.params.id);
    if (!result.found) return res.status(404).json({ error: 'Không tìm thấy phiên bản' });
    res.json({
      success: true,
      storageFilesRemoved: result.storageFilesRemoved,
      fileErrors: result.errors?.length ? result.errors : undefined,
    });
  } catch (e) {
    console.error('[appUpdates] delete release:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;
