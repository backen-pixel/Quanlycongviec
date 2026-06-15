/**
 * Phát hành APK crm-mobile-v2 lên chức năng "Cập nhật app" (production).
 *
 * Cơ chế production: APK phục vụ trực tiếp từ server Render
 *   https://tubep-backend.onrender.com/uploads/app-releases/crm-mobile-v2/<file>.apk
 * → file APK phải được commit vào git rồi deploy lên Render.
 *
 * Chạy: node scripts/publish-crm-mobile-v2.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { supabase } = require('../src/config/supabase');

const APP_KEY = 'crm-mobile-v2';
const VERSION = process.env.PUB_VERSION || '2.0.19';
const VERSION_CODE = parseInt(process.env.PUB_CODE || '20', 10);
const PUBLIC_HOST = (process.env.PUB_HOST || 'https://tubep-backend.onrender.com').replace(/\/$/, '');
const FILE_NAME = `crm-mobile-v2-${VERSION}-code${VERSION_CODE}-release.apk`;
const APK = path.resolve(__dirname, `../uploads/app-releases/crm-mobile-v2/${FILE_NAME}`);
const FILE_URL = `${PUBLIC_HOST}/uploads/app-releases/crm-mobile-v2/${FILE_NAME}`;
const RELEASE_NOTES =
  process.env.PUB_NOTES
  || 'Icon ứng dụng mới; thêm giao diện Sáng (chuyển Sáng/Tối trong Menu, app nhớ lựa chọn).';

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
  console.log('\n⚠ Bước cuối: commit + push file APK để Render deploy thì link tải mới hoạt động.');
  process.exit(0);
})().catch((e) => {
  console.error('LỖI:', e.message);
  process.exit(1);
});
