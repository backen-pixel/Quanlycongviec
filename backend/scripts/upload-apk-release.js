/**
 * Upload APK lên server cập nhật (không cần đăng nhập web).
 * Dùng service key Supabase từ backend/.env
 *
 *   node scripts/upload-apk-release.js --app tubep-demo --file ../demo-mobile/dist/TuBepDemo-1.0.0-release.apk --version 1.0.0 --version-code 1 --notes "v1"
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { supabase } = require('../src/config/supabase');

const BUCKET = 'app-releases';
const MB = 1024 * 1024;
const MAX_APK_BYTES = Math.min(
  (parseInt(process.env.APK_MAX_UPLOAD_MB || '512', 10) || 512) * MB,
  1024 * MB,
);

async function ensureBucket() {
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await supabase.storage.createBucket(BUCKET, {
      public: true,
      // fileSizeLimit: giới hạn global Supabase (free ~50MB) — không set ở đây nếu plan chưa nâng.
    });
    if (error) throw new Error('Tạo bucket: ' + error.message);
    console.log('> Đã tạo bucket', BUCKET);
  }
}

async function ensureApp(appKey, displayName, androidPackage) {
  const { data: existing } = await supabase.from('mobile_apps').select('*').eq('app_key', appKey).maybeSingle();
  if (existing) return existing;
  const { data, error } = await supabase.from('mobile_apps').insert({
    app_key: appKey,
    display_name: displayName || appKey,
    android_package: androidPackage || null,
    platform: 'android',
  }).select('*').single();
  if (error) throw error;
  console.log('> Đã đăng ký app', appKey);
  return data;
}

function parseArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2).replace(/-/g, '_');
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) args[key] = true;
      else { args[key] = next; i++; }
    }
  }
  return args;
}

async function main() {
  const args = parseArgs();
  const appKey = args.app;
  const filePath = args.file;
  if (!appKey || !filePath) {
    console.error('Cần --app và --file');
    process.exit(1);
  }
  const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  if (!fs.existsSync(abs)) {
    console.error('Không tìm thấy file:', abs);
    process.exit(1);
  }

  await ensureBucket();
  const app = await ensureApp(
    appKey,
    args.display_name || args.displayName,
    args.package || args.android_package,
  );

  const version = args.version || '1.0.0';
  const versionCode = args.version_code != null ? parseInt(args.version_code, 10) : null;
  const channel = args.channel || 'production';
  const buf = fs.readFileSync(abs);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const storagePath = `${appKey}/${channel}/${version}_${Date.now()}.apk`;

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(storagePath, buf, {
    contentType: 'application/vnd.android.package-archive',
    upsert: false,
  });
  if (upErr) throw new Error('Upload Storage: ' + upErr.message);

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

  const { data: rel, error } = await supabase.from('app_releases').insert({
    app_id: app.id,
    channel,
    update_type: 'apk',
    version,
    version_code: versionCode,
    storage_path: storagePath,
    file_url: urlData.publicUrl,
    file_size: buf.length,
    sha256,
    is_mandatory: args.mandatory === true || args.mandatory === 'true',
    is_active: true,
    release_notes: args.notes || null,
  }).select('*').single();
  if (error) throw error;

  console.log('✅ Phát hành APK thành công');
  console.log('   release id:', rel.id);
  console.log('   version:', version, 'code:', versionCode);
  console.log('   url:', urlData.publicUrl);
  console.log('   sha256:', sha256);
}

main().catch((e) => {
  console.error('❌', e.message || e);
  process.exit(1);
});
