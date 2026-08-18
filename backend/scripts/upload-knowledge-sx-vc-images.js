#!/usr/bin/env node
/**
 * Upload ảnh + PDF của khoá «Kế hoạch SX & VC/LĐ» lên Supabase Storage
 * (bucket `attachments`, thư mục `knowledge/`) để bài học hiển thị được ở mọi môi trường.
 *
 *   node scripts/upload-knowledge-sx-vc-images.js
 *   node scripts/upload-knowledge-sx-vc-images.js --dry-run
 *
 * Frontend map `/uploads/knowledge-screenshots/<file>` → URL public của bucket này
 * (xem frontend/src/lib/publicFileUrl.js).
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const ROOT = path.join(__dirname, '../..');
const GUIDE_DIR = path.join(ROOT, 'frontend', 'public', 'guides', 'sx-vc-ld-ke-hoach');
const PDF_PATH = path.join(ROOT, 'frontend', 'public', 'guides', 'pdf', '06-ke-hoach-sx-va-vc-ld.pdf');
const BUCKET = process.env.SUPABASE_KNOWLEDGE_BUCKET || 'attachments';
const FOLDER = (process.env.SUPABASE_KNOWLEDGE_FOLDER || 'knowledge').replace(/^\/+|\/+$/g, '');

/** file nguồn → tên object trên storage (dùng trong seed SQL) */
const FILES = [
  ['01-vc-setup-cot-lap-dat-tam.png', 'sx-vc-01-cot-lap-dat-tam.png'],
  ['02-vc-setup-tich-o-lap-dat-tam.png', 'sx-vc-02-tich-o-lap-dat-tam.png'],
  ['03-crm-nut-thiet-lap-ke-hoach.png', 'sx-vc-03-nut-ke-hoach.png'],
  ['04-form-ke-hoach-buoc-1-2.png', 'sx-vc-04-form-ngay-gio.png'],
  ['04-form-ke-hoach-cac-buoc.png', 'sx-vc-04b-form-cac-buoc.png'],
  ['05-form-chon-vc-va-ghi-chu.png', 'sx-vc-05-chon-vc-ghi-chu.png'],
  ['06-sua-lich-ghi-chu-vc.png', 'sx-vc-06-sua-lich.png'],
  ['07-vc-board-cot-tam.png', 'sx-vc-07-board-cot-tam.png'],
  ['07b-vc-the-tam-ghi-chu.png', 'sx-vc-07b-the-tam-ghi-chu.png'],
  ['08-sx-hoan-thien-cot-ban-giao.png', 'sx-vc-08-sx-ban-giao.png'],
  ['09-crm-the-ban-giao-xac-nhan.png', 'sx-vc-09-the-ban-giao.png'],
  ['09b-crm-chon-ban-giao.png', 'sx-vc-09b-chon-ban-giao.png'],
];

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!dryRun && (!url || !key)) {
    console.error('Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong backend/.env');
    process.exit(1);
  }
  const supabase = dryRun ? null : createClient(url, key);

  const jobs = FILES.map(([src, dest]) => ({
    localPath: path.join(GUIDE_DIR, src),
    objectName: dest,
    contentType: 'image/png',
  }));
  jobs.push({
    localPath: PDF_PATH,
    objectName: 'sx-vc-huong-dan-ke-hoach.pdf',
    contentType: 'application/pdf',
  });

  let ok = 0;
  for (const job of jobs) {
    if (!fs.existsSync(job.localPath)) {
      console.error('Thiếu file nguồn:', path.relative(ROOT, job.localPath));
      process.exit(1);
    }
    const objectPath = `${FOLDER}/${job.objectName}`;
    if (dryRun) {
      console.log('[dry-run]', objectPath, '←', path.relative(ROOT, job.localPath));
      ok += 1;
      continue;
    }
    const { error } = await supabase.storage.from(BUCKET).upload(objectPath, fs.readFileSync(job.localPath), {
      contentType: job.contentType,
      upsert: true,
      cacheControl: '31536000',
    });
    if (error) {
      console.error('Upload lỗi', job.objectName, error.message);
      process.exit(1);
    }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
    console.log('OK', job.objectName, '→', data.publicUrl);
    ok += 1;
  }

  console.log(`\n${ok}/${jobs.length} file đã lên storage. Seed dùng đường dẫn /uploads/knowledge-screenshots/<tên file>.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
