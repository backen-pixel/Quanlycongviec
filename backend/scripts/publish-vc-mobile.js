/**
 * Phát hành APK vc-mobile lên chức năng "Cập nhật app".
 *
 *   node scripts/publish-vc-mobile.js
 */
const fs = require('fs');
const path = require('path');
const { supabase } = require('../src/config/supabase');
const { buildStandardApkFilename } = require('../src/helpers/appReleaseFilename');
const { replaceReleaseApkFile } = require('../src/helpers/appReleaseImport');

const APP_KEY = 'vc-mobile';
const VERSION = process.env.PUB_VERSION || '1.0.2';
const VERSION_CODE = parseInt(process.env.PUB_CODE || '3', 10);
const PUBLIC_HOST = (process.env.PUB_HOST || 'https://tubep-backend.onrender.com').replace(/\/$/, '');
const FILE_NAME = buildStandardApkFilename(APP_KEY, VERSION, VERSION_CODE, { release: true });
const APK = path.resolve(__dirname, `../../vc-mobile/dist/${FILE_NAME}`);

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
        release_notes: `VC mobile ${VERSION}`,
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
    .update({ is_active: true, is_mandatory: false, updated_at: new Date().toISOString() })
    .eq('id', updated.id);

  await supabase
    .from('app_releases')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('app_id', app.id)
    .eq('channel', 'production')
    .eq('update_type', 'apk')
    .neq('id', updated.id);

  console.log('✓ vc-mobile release ready');
  console.log('  file_url:', updated.file_url);
  process.exit(0);
})().catch((e) => {
  console.error('LỖI:', e.message);
  process.exit(1);
});
