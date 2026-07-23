/**
 * Upload APK crm-mobile-v2 lên Supabase Storage và gắn vào bản phát hành active.
 * Dùng khi file_url trỏ Render /uploads/... nhưng deploy chưa có file (404).
 *
 * Chạy:
 *   node scripts/upload-crm-mobile-v2-apk-storage.js
 *   PUB_VERSION=2.0.44 PUB_CODE=45 node scripts/upload-crm-mobile-v2-apk-storage.js
 */
const fs = require('fs');
const path = require('path');
const { supabase } = require('../src/config/supabase');
const { buildStandardApkFilename } = require('../src/helpers/appReleaseFilename');
const { replaceReleaseApkFile } = require('../src/helpers/appReleaseImport');

const APP_KEY = 'crm-mobile-v2';
const VERSION = process.env.PUB_VERSION || '2.0.44';
const VERSION_CODE = parseInt(process.env.PUB_CODE || '45', 10);
const FILE_NAME = buildStandardApkFilename(APP_KEY, VERSION, VERSION_CODE, { release: true });
const APK = path.resolve(__dirname, `../uploads/app-releases/${APP_KEY}/${FILE_NAME}`);

(async () => {
  if (!fs.existsSync(APK)) throw new Error(`Không thấy APK: ${APK}`);

  const { data: app, error: appErr } = await supabase
    .from('mobile_apps')
    .select('*')
    .eq('app_key', APP_KEY)
    .maybeSingle();
  if (appErr) throw appErr;
  if (!app) throw new Error(`Không tìm thấy app ${APP_KEY}`);

  const { data: release, error: relErr } = await supabase
    .from('app_releases')
    .select('*')
    .eq('app_id', app.id)
    .eq('update_type', 'apk')
    .eq('version', VERSION)
    .eq('version_code', VERSION_CODE)
    .maybeSingle();
  if (relErr) throw relErr;
  if (!release) throw new Error(`Không tìm thấy release ${VERSION} (code ${VERSION_CODE})`);

  console.log('>> Upload APK lên Supabase Storage…', FILE_NAME);
  const updated = await replaceReleaseApkFile(release, app, APK, {
    channel: release.channel || 'production',
    version: VERSION,
    version_code: VERSION_CODE,
    originalFilename: FILE_NAME,
    publicBaseUrl: (process.env.PUB_HOST || 'https://tubep-backend.onrender.com').replace(/\/$/, ''),
  });

  await supabase
    .from('app_releases')
    .update({ is_active: true, is_mandatory: false, updated_at: new Date().toISOString() })
    .eq('id', updated.id);

  await supabase
    .from('app_releases')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('app_id', app.id)
    .eq('channel', 'production')
    .eq('update_type', 'apk')
    .neq('id', updated.id);

  console.log('✓ Đã upload và cập nhật release');
  console.log('  id           :', updated.id);
  console.log('  version      :', updated.version, '(code', updated.version_code + ')');
  console.log('  storage_path :', updated.storage_path || '(fallback local URL)');
  console.log('  file_url     :', updated.file_url);
  console.log('  file_size    :', updated.file_size);
  process.exit(0);
})().catch((e) => {
  console.error('LỖI:', e.message);
  process.exit(1);
});
