/**
 * Copy file Storage NextGo từ bucket nguồn → bucket đích.
 * Cần dump (file_attachments + crm_task_attachments + drive_files) và env đích.
 *
 *   node scripts/copy-nextgo-storage.js --dry-run
 *   node scripts/copy-nextgo-storage.js --apply
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const io = require('./lib/nextgoInstanceIo');

const DRY = !process.argv.includes('--apply') || process.argv.includes('--dry-run');
const IN_DIR = path.join(__dirname, '..', 'uploads', '_nextgo_instance_export');
const BUCKET = process.env.NEXTGO_STORAGE_BUCKET || process.env.SUPABASE_STORAGE_BUCKET || 'uploads';

function client(url, key, label) {
  if (!url || !key) throw new Error(`Thiếu creds ${label}`);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function pathFromUrl(fileUrl) {
  if (!fileUrl) return null;
  const s = String(fileUrl);
  const marker = `/object/public/${BUCKET}/`;
  const i = s.indexOf(marker);
  if (i >= 0) return decodeURIComponent(s.slice(i + marker.length).split('?')[0]);
  const m2 = s.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/);
  if (m2) return decodeURIComponent(m2[1].split('?')[0]);
  if (!s.startsWith('http')) return s.replace(/^\//, '');
  return null;
}

async function main() {
  const src = client(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, 'nguồn');
  const destUrl = process.env.NEXTGO_SUPABASE_URL;
  const destKey = process.env.NEXTGO_SUPABASE_SERVICE_ROLE_KEY;
  if (!DRY && destUrl && destUrl.replace(/\/$/, '') === String(process.env.SUPABASE_URL || '').replace(/\/$/, '')) {
    throw new Error('Từ chối copy storage vào cùng project nguồn.');
  }
  const dest = DRY ? null : client(destUrl, destKey, 'đích');

  const files = [
    ...io.readNdjson(IN_DIR, 'file_attachments').map((r) => r.file_url),
    ...io.readNdjson(IN_DIR, 'crm_task_attachments').map((r) => r.file_url),
    ...io.readNdjson(IN_DIR, 'drive_files').map((r) => r.storage_path || r.file_url || r.path),
  ].filter(Boolean);

  const paths = [...new Set(files.map(pathFromUrl).filter(Boolean))];
  console.log(DRY ? '=== DRY-RUN copy storage ===' : '=== COPY storage NextGo ===');
  console.log('Bucket:', BUCKET, 'files:', paths.length);

  let ok = 0;
  let skip = 0;
  let fail = 0;
  for (const p of paths) {
    if (DRY) {
      skip += 1;
      continue;
    }
    const { data, error } = await src.storage.from(BUCKET).download(p);
    if (error || !data) {
      fail += 1;
      console.warn('  miss', p, error?.message || '');
      continue;
    }
    const buf = Buffer.from(await data.arrayBuffer());
    const up = await dest.storage.from(BUCKET).upload(p, buf, { upsert: true });
    if (up.error) {
      fail += 1;
      console.warn('  upload fail', p, up.error.message);
    } else {
      ok += 1;
      if (ok % 20 === 0) console.log('  copied', ok);
    }
  }
  console.log({ ok, listed: paths.length, drySkipped: DRY ? paths.length : skip, fail });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
