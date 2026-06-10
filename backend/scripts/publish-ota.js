/**
 * Phát hành bản cập nhật JS (OTA jsbundle) qua expo-updates self-hosted.
 *
 *  1. Chạy `expo export` trong thư mục app mobile → tạo dist/ (bundle + assets + metadata.json).
 *  2. Upload bundle + assets lên Supabase Storage (bucket app-releases).
 *  3. Dựng manifest theo Expo Updates protocol, lưu vào bảng app_releases (update_type=jsbundle).
 *
 *  Cách dùng (chạy từ thư mục backend):
 *    node scripts/publish-ota.js --app crm-mobile --dir ../crm-mobile --runtime 1.3.35 --version 1.3.35
 *
 *  Tham số:
 *    --app      app_key trong bảng mobile_apps (bắt buộc)
 *    --dir      đường dẫn tới project mobile (bắt buộc)
 *    --runtime  runtimeVersion — phải khớp app.json (mặc định = --version)
 *    --version  version hiển thị (mặc định đọc từ app.json)
 *    --channel  kênh phát hành (mặc định production)
 *    --platform android | ios (mặc định android)
 *    --notes    ghi chú phát hành
 *    --skip-export  bỏ qua bước expo export (dùng dist có sẵn)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { supabase } = require('../src/config/supabase');

const BUCKET = 'app-releases';

const MIME = {
  js: 'application/javascript', hbc: 'application/javascript',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp',
  ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2',
  json: 'application/json', mp3: 'audio/mpeg', mp4: 'video/mp4', wav: 'audio/wav',
  pdf: 'application/pdf', xml: 'text/xml', txt: 'text/plain',
};

function parseArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) { args[key] = true; }
      else { args[key] = next; i++; }
    }
  }
  return args;
}

function sha256Base64Url(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function md5Hex(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

async function ensureBucket() {
  try {
    const { data } = await supabase.storage.getBucket(BUCKET);
    if (!data) await supabase.storage.createBucket(BUCKET, { public: true, fileSizeLimit: '512MB' });
  } catch (e) { /* ignore */ }
}

async function uploadFile(storagePath, buffer, contentType) {
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType, upsert: true,
  });
  if (error) throw new Error(`Upload ${storagePath}: ${error.message}`);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

async function main() {
  const args = parseArgs();
  const appKey = args.app;
  const mobileDir = args.dir;
  if (!appKey || !mobileDir) {
    console.error('Thiếu --app và --dir. Xem hướng dẫn ở đầu file.');
    process.exit(1);
  }
  const platform = args.platform || 'android';
  const channel = args.channel || 'production';
  const projectDir = path.isAbsolute(mobileDir) ? mobileDir : path.join(process.cwd(), mobileDir);

  // Đọc version từ app.json nếu không truyền
  const appJson = JSON.parse(fs.readFileSync(path.join(projectDir, 'app.json'), 'utf8'));
  const version = args.version || appJson.expo?.version;
  const runtimeVersion = args.runtime || version;
  console.log(`> App=${appKey} platform=${platform} version=${version} runtime=${runtimeVersion} channel=${channel}`);

  // 1) expo export
  const distDir = path.join(projectDir, 'dist');
  if (!args['skip-export']) {
    console.log('> Đang chạy expo export (android)...');
    execSync(`npx expo export --platform ${platform} --output-dir dist`, {
      cwd: projectDir, stdio: 'inherit',
    });
  }

  // 2) Đọc metadata.json
  const metaPath = path.join(distDir, 'metadata.json');
  if (!fs.existsSync(metaPath)) throw new Error('Không tìm thấy dist/metadata.json — expo export thất bại?');
  const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const fileMeta = metadata.fileMetadata?.[platform];
  if (!fileMeta) throw new Error(`metadata.json không có fileMetadata.${platform}`);

  // Lookup app
  const { data: app } = await supabase.from('mobile_apps').select('*').eq('app_key', appKey).maybeSingle();
  if (!app) throw new Error(`App "${appKey}" chưa đăng ký (bảng mobile_apps)`);

  await ensureBucket();

  const updateId = crypto.randomUUID();
  const basePath = `${appKey}/ota/${runtimeVersion}/${updateId}`;

  // 3a) Bundle (launchAsset)
  const bundleBuf = fs.readFileSync(path.join(distDir, fileMeta.bundle));
  const bundleKey = md5Hex(bundleBuf);
  const bundleStorage = `${basePath}/${bundleKey}.bundle`;
  console.log(`> Upload bundle (${(bundleBuf.length / 1024).toFixed(0)} KB)...`);
  const bundleUrl = await uploadFile(bundleStorage, bundleBuf, 'application/javascript');
  const launchAsset = {
    hash: sha256Base64Url(bundleBuf),
    key: bundleKey,
    contentType: 'application/javascript',
    fileExtension: '.bundle',
    url: bundleUrl,
  };

  let totalBytes = bundleBuf.length;

  // 3b) Assets
  const assets = [];
  for (const asset of fileMeta.assets || []) {
    const buf = fs.readFileSync(path.join(distDir, asset.path));
    totalBytes += buf.length;
    const key = md5Hex(buf);
    const ext = (asset.ext || '').replace(/^\./, '');
    const contentType = MIME[ext.toLowerCase()] || 'application/octet-stream';
    const storagePath = `${basePath}/assets/${key}`;
    const url = await uploadFile(storagePath, buf, contentType);
    assets.push({
      hash: sha256Base64Url(buf),
      key,
      contentType,
      fileExtension: ext ? `.${ext}` : '',
      url,
    });
  }
  console.log(`> Đã upload ${assets.length} asset.`);

  // 4) Manifest (Expo Updates protocol)
  const manifest = {
    id: updateId,
    createdAt: new Date().toISOString(),
    runtimeVersion,
    launchAsset,
    assets,
    metadata: {},
    extra: { expoClient: { name: app.display_name } },
  };

  // Tắt các bản jsbundle cũ cùng runtime+channel rồi chèn bản mới (active)
  await supabase.from('app_releases')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('app_id', app.id).eq('channel', channel).eq('update_type', 'jsbundle')
    .eq('runtime_version', runtimeVersion);

  const isMandatory = args.mandatory === true || args.mandatory === 'true';

  const { data: rel, error } = await supabase.from('app_releases').insert({
    app_id: app.id,
    channel,
    update_type: 'jsbundle',
    version,
    runtime_version: runtimeVersion,
    manifest,
    file_size: totalBytes,
    is_active: true,
    is_mandatory: isMandatory,
    release_notes: typeof args.notes === 'string' ? args.notes : null,
  }).select('id').single();
  if (error) throw error;

  console.log(`\n✅ Đã phát hành OTA: release ${rel.id} (update ${updateId})`);
  console.log(`   App mở lên sẽ tự tải bundle mới qua /api/app-updates/manifest?app=${appKey}`);
}

main().catch((e) => {
  console.error('❌', e.message || e);
  process.exit(1);
});
