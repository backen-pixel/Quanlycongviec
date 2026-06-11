/**
 * Gắn lại file APK cho bản phát hành đã có (upload Storage hoặc uploads local).
 *
 *   node scripts/attach-apk-to-release.js --release 5700057d-... --file ../sx-mobile/dist/sx-mobile-1.0.40-code43-release.apk
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { supabase } = require('../src/config/supabase');
const { replaceReleaseApkFile } = require('../src/helpers/appReleaseImport');

function parseArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2).replace(/-/g, '_');
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) args[key] = true;
    else { args[key] = next; i++; }
  }
  return args;
}

async function main() {
  const args = parseArgs();
  const releaseId = args.release || args.release_id;
  const filePath = args.file;
  if (!releaseId || !filePath) {
    console.error('Cần --release <uuid> và --file <đường-dẫn-apk>');
    process.exit(1);
  }

  const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  if (!fs.existsSync(abs)) {
    console.error('Không tìm thấy file:', abs);
    process.exit(1);
  }

  const { data: rel, error } = await supabase
    .from('app_releases')
    .select('*, mobile_apps(*)')
    .eq('id', releaseId)
    .maybeSingle();
  if (error) throw error;
  if (!rel) {
    console.error('Không tìm thấy release:', releaseId);
    process.exit(1);
  }

  const app = rel.mobile_apps;
  if (!app) {
    console.error('Không tìm thấy app của release');
    process.exit(1);
  }

  const base = (process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/$/, '');
  const updated = await replaceReleaseApkFile(rel, app, abs, { publicBaseUrl: base });

  console.log('✅ Đã gắn APK cho release', updated.version, `(code ${updated.version_code})`);
  console.log('   file_url:', updated.file_url);
  console.log('   storage_path:', updated.storage_path || '(local uploads)');
  console.log('   Tải thử:', `${base}/api/app-updates/download/${updated.id}`);
}

main().catch((e) => {
  console.error('❌', e.message || e);
  process.exit(1);
});
