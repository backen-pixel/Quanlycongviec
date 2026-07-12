/**
 * Upload APK lên server cập nhật (không cần đăng nhập web).
 * Dùng service key Supabase từ backend/.env
 *
 *   node scripts/upload-apk-release.js --app crm-mobile-v2 --file ../crm-mobile-v2/dist/crm-mobile-v2-2.0.1-code2-release.apk --version 2.0.1 --version-code 2 --notes "v2"
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { supabase } = require('../src/config/supabase');
const { importApkFile } = require('../src/helpers/appReleaseImport');
const { buildStandardApkFilename } = require('../src/helpers/appReleaseFilename');

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

  const app = await ensureApp(
    appKey,
    args.display_name || args.displayName,
    args.package || args.android_package,
  );

  const version = args.version || '1.0.0';
  const versionCode = args.version_code != null ? parseInt(args.version_code, 10) : null;
  const channel = args.channel || 'production';
  const publicBaseUrl = (
    args.public_base_url
    || process.env.PUBLIC_API_URL
    || 'https://tubep-backend.onrender.com'
  ).replace(/\/$/, '');

  const rel = await importApkFile(app, abs, {
    channel,
    version,
    version_code: versionCode,
    is_mandatory: args.mandatory === true || args.mandatory === 'true',
    release_notes: args.notes || null,
    publicBaseUrl,
  });

  const standardName = buildStandardApkFilename(appKey, version, versionCode, { release: true });
  console.log('✅ Phát hành APK thành công');
  console.log('   release id:', rel.id);
  console.log('   version:', rel.version, 'code:', rel.version_code);
  console.log('   file_url:', rel.file_url);
  console.log('   download API:', `${publicBaseUrl}/api/app-updates/download/${rel.id}`);
  console.log('   tên chuẩn:', standardName);
  console.log('   sha256:', rel.sha256);
}

main().catch((e) => {
  console.error('❌', e.message || e);
  process.exit(1);
});
