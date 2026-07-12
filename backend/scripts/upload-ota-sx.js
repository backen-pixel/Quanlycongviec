/**
 * Upload OTA bundle cho sx-mobile lên Supabase storage và cập nhật app_releases.
 * Chạy: node backend/scripts/upload-ota-sx.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'app-releases';
const APP_KEY = 'sx-mobile';
const RUNTIME_VERSION = '1.0.40';
const CHANNEL = 'production';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function sha256Base64Url(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function md5Hex(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

async function main() {
  const distDir = path.join(__dirname, '../../sx-mobile/dist');
  const metaFile = path.join(distDir, 'metadata.json');
  if (!fs.existsSync(metaFile)) {
    console.error('Không tìm thấy dist/metadata.json. Hãy chạy: npx expo export --platform android');
    process.exit(1);
  }
  const meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
  const bundleRel = meta?.fileMetadata?.android?.bundle;
  if (!bundleRel) { console.error('metadata.json thiếu android.bundle'); process.exit(1); }
  const bundlePath = path.join(distDir, bundleRel);
  if (!fs.existsSync(bundlePath)) { console.error('Không tìm thấy file bundle:', bundlePath); process.exit(1); }

  // Tìm app
  const { data: app } = await supabase.from('mobile_apps').select('*').eq('app_key', APP_KEY).maybeSingle();
  if (!app) { console.error(`Không tìm thấy app '${APP_KEY}' trong mobile_apps`); process.exit(1); }
  console.log(`App: ${app.display_name || app.app_key} (id=${app.id})`);

  // Tìm bản OTA đang active cho runtime version này
  let { data: release } = await supabase
    .from('app_releases')
    .select('*')
    .eq('app_id', app.id)
    .eq('update_type', 'jsbundle')
    .eq('channel', CHANNEL)
    .eq('runtime_version', RUNTIME_VERSION)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const buf = fs.readFileSync(bundlePath);
  const updateId = release?.manifest?.id || crypto.randomUUID();
  const bundleKey = md5Hex(buf);
  const basePath = `${APP_KEY}/ota/${RUNTIME_VERSION}/${updateId}`;
  const storagePath = `${basePath}/${bundleKey}.bundle`;

  console.log(`Bundle: ${bundleRel} (${(buf.length / 1024).toFixed(1)} kB)`);
  console.log(`Upload → bucket=${BUCKET} path=${storagePath}`);

  // Xóa files cũ nếu có
  if (release?.manifest?.launchAsset?.url) {
    const oldKey = release.manifest.launchAsset.key;
    const oldPath = `${APP_KEY}/ota/${release.runtime_version || RUNTIME_VERSION}/${release.manifest.id || ''}/${oldKey}.bundle`;
    await supabase.storage.from(BUCKET).remove([oldPath]).catch(() => {});
    console.log(`Đã xóa bundle cũ: ${oldPath}`);
  }

  // Upload bundle mới
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(storagePath, buf, {
    contentType: 'application/javascript',
    upsert: true,
  });
  if (upErr) { console.error('Upload thất bại:', upErr.message); process.exit(1); }
  console.log('Upload bundle xong.');

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  const launchAsset = {
    hash: sha256Base64Url(buf),
    key: bundleKey,
    contentType: 'application/javascript',
    fileExtension: '.bundle',
    url: urlData.publicUrl,
  };

  // Upload assets
  const assetEntries = meta?.fileMetadata?.android?.assets || [];
  const uploadedAssets = [];
  for (const asset of assetEntries) {
    const assetPath = path.join(distDir, asset.path);
    if (!fs.existsSync(assetPath)) continue;
    const assetBuf = fs.readFileSync(assetPath);
    const assetKey = md5Hex(assetBuf);
    const ext = `.${asset.ext || 'bin'}`;
    const assetStoragePath = `${APP_KEY}/ota/${RUNTIME_VERSION}/${updateId}/${assetKey}${ext}`;
    const { error: assetErr } = await supabase.storage.from(BUCKET).upload(assetStoragePath, assetBuf, {
      contentType: asset.ext === 'ttf' ? 'font/ttf' : 'image/png',
      upsert: true,
    });
    if (assetErr) {
      console.warn(`  Asset ${asset.path} upload lỗi: ${assetErr.message}`);
      continue;
    }
    const { data: assetUrl } = supabase.storage.from(BUCKET).getPublicUrl(assetStoragePath);
    uploadedAssets.push({
      hash: sha256Base64Url(assetBuf),
      key: assetKey,
      contentType: asset.ext === 'ttf' ? 'font/ttf' : 'image/png',
      fileExtension: ext,
      url: assetUrl.publicUrl,
    });
  }
  console.log(`Đã upload ${uploadedAssets.length}/${assetEntries.length} assets.`);

  const manifest = {
    id: updateId,
    createdAt: new Date().toISOString(),
    runtimeVersion: RUNTIME_VERSION,
    launchAsset,
    assets: uploadedAssets,
    metadata: {},
    extra: { expoClient: { name: app.display_name || APP_KEY } },
  };

  if (release) {
    // Cập nhật release hiện có
    const { error } = await supabase.from('app_releases').update({
      manifest,
      runtime_version: RUNTIME_VERSION,
      file_size: buf.length,
      is_active: true,
      updated_at: new Date().toISOString(),
    }).eq('id', release.id);
    if (error) { console.error('Update DB thất bại:', error.message); process.exit(1); }
    console.log(`Đã cập nhật release id=${release.id} → is_active=true`);
  } else {
    // Tạo release mới
    const { data: newRel, error } = await supabase.from('app_releases').insert({
      app_id: app.id,
      version: RUNTIME_VERSION,
      runtime_version: RUNTIME_VERSION,
      channel: CHANNEL,
      update_type: 'jsbundle',
      manifest,
      file_size: buf.length,
      is_active: true,
      is_mandatory: false,
    }).select('id').single();
    if (error) { console.error('Tạo release thất bại:', error.message); process.exit(1); }
    console.log(`Đã tạo release mới id=${newRel.id}`);
  }

  console.log('\n✓ OTA upload hoàn tất. App sẽ nhận update sau lần khởi động tiếp theo.');
  console.log(`  Runtime: ${RUNTIME_VERSION} | UpdateId: ${updateId}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
