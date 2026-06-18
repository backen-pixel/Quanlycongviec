/**
 * Phát hành APK sx-mobile lên chức năng "Cập nhật app" (production).
 *
 *   node scripts/publish-sx-mobile.js
 *   SKIP_UPLOAD=1 node scripts/publish-sx-mobile.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { supabase } = require('../src/config/supabase');

const { buildStandardApkFilename } = require('../src/helpers/appReleaseFilename');

const APP_KEY = 'sx-mobile';
const VERSION = process.env.PUB_VERSION || '1.0.56';
const VERSION_CODE = parseInt(process.env.PUB_CODE || '59', 10);
const PUBLIC_HOST = (process.env.PUB_HOST || 'https://tubep-backend.onrender.com').replace(/\/$/, '');
const FILE_NAME = buildStandardApkFilename(APP_KEY, VERSION, VERSION_CODE, { release: true });
const APK = path.resolve(__dirname, `../uploads/app-releases/sx-mobile/${FILE_NAME}`);
const FILE_URL = `${PUBLIC_HOST}/uploads/app-releases/sx-mobile/${FILE_NAME}`;
const RELEASE_NOTES =
  process.env.PUB_NOTES
  || 'Chia sẻ ảnh/PDF từ app khác vào chat nội bộ (Share → Quản lý sản xuất).';

async function uploadApkToProduction(releaseId) {
  if (process.env.SKIP_UPLOAD === '1' || process.env.SKIP_UPLOAD === 'true') {
    console.log('⏭ Bỏ qua upload production (SKIP_UPLOAD).');
    return;
  }
  console.log('\n>> Upload APK lên server production…');
  const script = path.join(__dirname, 'upload-apk-to-production.js');
  const r = spawnSync(
    process.execPath,
    [
      script,
      '--release',
      releaseId,
      '--file',
      APK,
      '--version',
      VERSION,
      '--version-code',
      String(VERSION_CODE),
    ],
    { stdio: 'inherit', cwd: path.join(__dirname, '..'), env: process.env },
  );
  if (r.status !== 0) {
    console.warn('\n⚠ Upload production thất bại — chạy thủ công:');
    console.warn(`  node scripts/upload-apk-to-production.js --release ${releaseId} --file ${APK}`);
  }
}

(async () => {
  if (!fs.existsSync(APK)) throw new Error(`Không thấy file APK: ${APK}`);
  const buf = fs.readFileSync(APK);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const fileSize = buf.length;

  const { data: app, error } = await supabase
    .from('mobile_apps')
    .select('*')
    .eq('app_key', APP_KEY)
    .maybeSingle();
  if (error) throw error;
  if (!app) throw new Error(`Không tìm thấy app "${APP_KEY}" trong bảng mobile_apps.`);

  const { data: existing } = await supabase
    .from('app_releases')
    .select('id')
    .eq('app_id', app.id)
    .eq('update_type', 'apk')
    .eq('version', VERSION)
    .eq('version_code', VERSION_CODE)
    .maybeSingle();

  const payload = {
    app_id: app.id,
    channel: 'production',
    update_type: 'apk',
    version: VERSION,
    version_code: VERSION_CODE,
    storage_path: null,
    file_url: FILE_URL,
    external_url: null,
    file_size: fileSize,
    sha256,
    is_mandatory: false,
    is_active: true,
    release_notes: RELEASE_NOTES,
  };

  let rel;
  if (existing) {
    const { data, error: e } = await supabase
      .from('app_releases')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (e) throw e;
    rel = data;
    console.log('✓ Cập nhật bản phát hành đã có.');
  } else {
    const { data, error: e } = await supabase.from('app_releases').insert(payload).select('*').single();
    if (e) throw e;
    rel = data;
    console.log('✓ Tạo bản phát hành mới.');
  }

  await supabase
    .from('app_releases')
    .update({ is_active: false, is_mandatory: false, updated_at: new Date().toISOString() })
    .eq('app_id', app.id)
    .eq('channel', 'production')
    .eq('update_type', 'apk')
    .neq('id', rel.id);

  console.log('  version :', rel.version, '(code', rel.version_code + ')');
  console.log('  size    :', (fileSize / 1024 / 1024).toFixed(1), 'MB');
  console.log('  file_url:', rel.file_url);
  console.log('  id      :', rel.id);

  await uploadApkToProduction(rel.id);
  process.exit(0);
})().catch((e) => {
  console.error('LỖI:', e.message);
  process.exit(1);
});
