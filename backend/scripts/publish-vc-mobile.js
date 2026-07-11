/**
 * Phát hành APK vc-mobile lên chức năng "Cập nhật app".
 *
 *   node scripts/publish-vc-mobile.js
 *   PUB_VERSION=1.0.10 PUB_CODE=11 node scripts/publish-vc-mobile.js
 *
 * Sau khi upload storage, smoke-check /api/app-updates/check.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { supabase } = require('../src/config/supabase');
const { buildStandardApkFilename } = require('../src/helpers/appReleaseFilename');
const { replaceReleaseApkFile } = require('../src/helpers/appReleaseImport');

const APP_KEY = 'vc-mobile';
const VERSION = process.env.PUB_VERSION || '1.0.10';
const VERSION_CODE = parseInt(process.env.PUB_CODE || '11', 10);
const PUBLIC_HOST = (process.env.PUB_HOST || 'https://tubep-backend.onrender.com').replace(/\/$/, '');
const FILE_NAME = buildStandardApkFilename(APP_KEY, VERSION, VERSION_CODE, { release: true });
const APK = path.resolve(__dirname, `../../vc-mobile/dist/${FILE_NAME}`);
const RELEASE_NOTES =
  process.env.PUB_NOTES
  || [
    `VC/LĐ ${VERSION} (code ${VERSION_CODE})`,
    '• Ghi chú nhân viên (nhiều lần) qua task_comments — không còn lỗi cột notes',
    '• Nút Chụp nhanh / Quay video trên nhiệm vụ',
    '• Bộ mẫu VC/LĐ chung 6 việc; trang web tải app /vc/download-app',
  ].join('\n');

async function smokeCheck() {
  const url = `${PUBLIC_HOST}/api/app-updates/check?app=${APP_KEY}&version=0.0.1&versionCode=1`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    console.log('\n>> Smoke /check:', JSON.stringify({
      updateAvailable: data.updateAvailable,
      latestVersion: data.latestVersion,
      latestVersionCode: data.latestVersionCode,
      apkReady: data.apkReady,
      size: data.size,
      downloadUrl: data.downloadUrl,
    }));
    if (!data.updateAvailable || Number(data.latestVersionCode) !== VERSION_CODE) {
      console.warn('⚠ Check chưa khớp version/code mong đợi — kiểm tra lại admin Cập nhật App.');
    }
    if (data.downloadUrl) {
      const dl = await fetch(data.downloadUrl, { method: 'HEAD' });
      console.log(`>> Smoke /download: ${dl.status} length=${dl.headers.get('content-length')}`);
    }
  } catch (e) {
    console.warn('⚠ Smoke check lỗi:', e.message);
  }
}

async function uploadToProductionDisk(releaseId) {
  if (process.env.SKIP_UPLOAD === '1' || process.env.SKIP_UPLOAD === 'true') {
    console.log('⏭ Bỏ qua upload Render disk (SKIP_UPLOAD).');
    return;
  }
  const script = path.join(__dirname, 'upload-apk-to-production.js');
  if (!fs.existsSync(script)) return;
  console.log('\n>> Upload APK lên disk production (Render)…');
  const r = spawnSync(
    process.execPath,
    [
      script,
      '--release', releaseId,
      '--file', APK,
      '--version', VERSION,
      '--version-code', String(VERSION_CODE),
    ],
    { stdio: 'inherit', cwd: path.join(__dirname, '..'), env: process.env },
  );
  if (r.status !== 0) {
    console.warn('⚠ Upload Render disk thất bại — vẫn dùng Supabase Storage (file_url).');
  }
}

(async () => {
  if (!fs.existsSync(APK)) {
    throw new Error(`Không thấy APK: ${APK} — chạy npm run build:apk trong vc-mobile trước`);
  }

  const { data: app, error: appErr } = await supabase
    .from('mobile_apps')
    .select('*')
    .eq('app_key', APP_KEY)
    .maybeSingle();
  if (appErr) throw appErr;
  if (!app) throw new Error(`Chưa có app ${APP_KEY} trong mobile_apps — chạy migration 416_vc_mobile_app.sql`);

  let { data: release } = await supabase
    .from('app_releases')
    .select('*')
    .eq('app_id', app.id)
    .eq('update_type', 'apk')
    .eq('version', VERSION)
    .eq('version_code', VERSION_CODE)
    .maybeSingle();

  if (!release) {
    const { data: created, error: insErr } = await supabase
      .from('app_releases')
      .insert({
        app_id: app.id,
        channel: 'production',
        update_type: 'apk',
        version: VERSION,
        version_code: VERSION_CODE,
        is_active: false,
        release_notes: RELEASE_NOTES,
      })
      .select('*')
      .single();
    if (insErr) throw insErr;
    release = created;
  }

  console.log('>> Upload APK vc-mobile…', FILE_NAME);
  const updated = await replaceReleaseApkFile(release, app, APK, {
    channel: 'production',
    version: VERSION,
    version_code: VERSION_CODE,
    originalFilename: FILE_NAME,
    publicBaseUrl: PUBLIC_HOST,
  });

  await supabase
    .from('app_releases')
    .update({
      is_active: true,
      is_mandatory: process.env.PUB_MANDATORY === '1',
      release_notes: RELEASE_NOTES,
      updated_at: new Date().toISOString(),
    })
    .eq('id', updated.id);

  await supabase
    .from('app_releases')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('app_id', app.id)
    .eq('channel', 'production')
    .eq('update_type', 'apk')
    .neq('id', updated.id);

  await uploadToProductionDisk(updated.id);
  await smokeCheck();

  console.log('\n✓ vc-mobile release ready');
  console.log('  version:', VERSION, 'code:', VERSION_CODE);
  console.log('  file_url:', updated.file_url);
  process.exit(0);
})().catch((e) => {
  console.error('LỖI:', e.message);
  process.exit(1);
});
