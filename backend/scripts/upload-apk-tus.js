/**
 * Upload APK lớn (>50MB) lên Supabase Storage qua TUS, rồi cập nhật app_releases.
 *
 *   node scripts/upload-apk-tus.js --release <id> --file path/to.apk
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const tus = require('tus-js-client');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const config = require('../src/config');
const { supabase } = require('../src/config/supabase');

const BUCKET = 'app-releases';

function parseArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2).replace(/-/g, '_');
    const next = process.argv[i + 1];
    if (next === undefined || next.startsWith('--')) args[key] = true;
    else { args[key] = next; i++; }
  }
  return args;
}

function projectIdFromUrl(url) {
  const m = String(url || '').match(/https:\/\/([^.]+)\.supabase\.co/i);
  return m ? m[1] : null;
}

function tusUpload({ filePath, storagePath, contentType }) {
  const projectId = projectIdFromUrl(config.supabaseUrl);
  if (!projectId) throw new Error('Không parse được project id từ SUPABASE_URL');

  const endpoint = `https://${projectId}.storage.supabase.co/storage/v1/upload/resumable`;
  const stat = fs.statSync(filePath);
  const stream = fs.createReadStream(filePath);

  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(stream, {
      endpoint,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      chunkSize: 6 * 1024 * 1024,
      uploadSize: stat.size,
      metadata: {
        bucketName: BUCKET,
        objectName: storagePath,
        contentType: contentType || 'application/vnd.android.package-archive',
        cacheControl: '3600',
      },
      headers: {
        authorization: `Bearer ${config.supabaseServiceKey}`,
        apikey: config.supabaseServiceKey,
        'x-upsert': 'true',
      },
      onError: reject,
      onProgress: (sent, total) => {
        const pct = total ? Math.round((sent / total) * 100) : 0;
        process.stdout.write(`\r> TUS upload: ${pct}% (${Math.round(sent / 1024 / 1024)} / ${Math.round(total / 1024 / 1024)} MB)`);
      },
      onSuccess: () => {
        process.stdout.write('\n');
        resolve();
      },
    });
    upload.start();
  });
}

async function main() {
  const args = parseArgs();
  const releaseId = args.release || args.release_id;
  const filePath = args.file;
  if (!releaseId || !filePath) {
    console.error('Cần --release và --file');
    process.exit(1);
  }
  const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  if (!fs.existsSync(abs)) {
    console.error('Không tìm thấy file:', abs);
    process.exit(1);
  }

  const { data: release, error: e1 } = await supabase
    .from('app_releases')
    .select('*, mobile_apps(*)')
    .eq('id', releaseId)
    .single();
  if (e1) throw e1;

  const app = release.mobile_apps;
  if (!app) throw new Error('Không tìm thấy app của release');

  const version = args.version || release.version || '1.0.0';
  const versionCode = args.version_code != null ? parseInt(args.version_code, 10) : release.version_code;
  const channel = args.channel || release.channel || 'production';
  const safeVersion = String(version).replace(/[^0-9A-Za-z._-]/g, '_');
  const storagePath = `${app.app_key}/${channel}/${safeVersion}_${Date.now()}.apk`;

  const buf = fs.readFileSync(abs);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const fileSize = buf.length;

  console.log(`> Upload TUS ${path.basename(abs)} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`  bucket: ${BUCKET}`);
  console.log(`  path  : ${storagePath}`);

  await tusUpload({ filePath: abs, storagePath });

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  const fileUrl = urlData.publicUrl;

  const patch = {
    storage_path: storagePath,
    file_url: fileUrl,
    external_url: null,
    sha256,
    file_size: fileSize,
    version,
    version_code: Number.isFinite(versionCode) ? versionCode : release.version_code,
    is_active: true,
    updated_at: new Date().toISOString(),
  };
  if (args.notes || args.release_notes) {
    patch.release_notes = args.notes || args.release_notes;
  }

  const { data: updated, error: e2 } = await supabase
    .from('app_releases')
    .update(patch)
    .eq('id', releaseId)
    .select('*')
    .single();
  if (e2) throw e2;

  const publicBase = (process.env.PUBLIC_API_URL || 'https://tubep-backend.onrender.com').replace(/\/$/, '');
  console.log('✓ Upload thành công');
  console.log('  version   :', updated.version, `(code ${updated.version_code})`);
  console.log('  storage   :', updated.storage_path);
  console.log('  public URL:', updated.file_url);
  console.log('  sha256    :', updated.sha256);
  console.log('  download  :', `${publicBase}/api/app-updates/download/${releaseId}`);
}

main().catch((e) => {
  console.error('❌', e.message || e);
  process.exit(1);
});
