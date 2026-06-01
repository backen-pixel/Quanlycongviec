#!/usr/bin/env node
/**
 * Upload ảnh bài học lên Supabase Storage — bucket `attachments`, thư mục `knowledge/`.
 *
 *   node scripts/knowledge/upload-screenshots-storage.js
 *   node scripts/knowledge/upload-screenshots-storage.js --dry-run
 *
 * Cần backend/.env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Sau upload: node scripts/knowledge/build-seeds.js → chạy SQL seed trên DB
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require(path.join(__dirname, '../../backend/node_modules/@supabase/supabase-js'));
const {
  COURSES, LESSONS_PER_COURSE, lessonImageFile, CAPTURE_SRC_DIR,
} = require('./screenshots/manifest');

const ROOT = path.join(__dirname, '../..');
const CAPTURE_ABS = path.join(ROOT, CAPTURE_SRC_DIR);
const BACKEND_ENV = path.join(ROOT, 'backend', '.env');
const URLS_OUT = path.join(__dirname, 'screenshots', 'storage-urls.json');

const BUCKET = process.env.SUPABASE_KNOWLEDGE_BUCKET || 'attachments';
const FOLDER = (process.env.SUPABASE_KNOWLEDGE_FOLDER || 'knowledge').replace(/^\/+|\/+$/g, '');

function loadEnv() {
  if (!fs.existsSync(BACKEND_ENV)) {
    console.error('Thiếu', BACKEND_ENV);
    process.exit(1);
  }
  require(path.join(__dirname, '../../backend/node_modules/dotenv')).config({ path: BACKEND_ENV });
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong backend/.env');
    process.exit(1);
  }
  return createClient(url, key);
}

function resolveLocalFile(file) {
  const p = path.join(CAPTURE_ABS, file);
  if (fs.existsSync(p)) return p;
  const alt = path.join(ROOT, 'backend', 'uploads', 'knowledge-screenshots', file);
  if (fs.existsSync(alt)) return alt;
  return null;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const supabase = dryRun ? null : loadEnv();
  const mapping = {};
  let uploaded = 0;
  let skipped = 0;

  for (const course of COURSES) {
    for (let n = 1; n <= LESSONS_PER_COURSE; n += 1) {
      const file = lessonImageFile(course, n);
      const localPath = resolveLocalFile(file);
      if (!localPath) {
        console.warn('Thiếu file:', file);
        skipped += 1;
        continue;
      }

      const objectPath = `${FOLDER}/${file}`.replace(/\/+/g, '/');
      if (dryRun) {
        console.log('[dry-run]', objectPath, '←', path.relative(ROOT, localPath));
        mapping[file] = `https://example.supabase.co/storage/v1/object/public/${BUCKET}/${objectPath}`;
        uploaded += 1;
        continue;
      }

      const buffer = fs.readFileSync(localPath);
      const { error } = await supabase.storage.from(BUCKET).upload(objectPath, buffer, {
        contentType: 'image/png',
        upsert: true,
        cacheControl: '31536000',
      });

      if (error) {
        console.error('Upload lỗi', file, error.message);
        process.exit(1);
      }

      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
      mapping[file] = urlData.publicUrl;
      console.log('OK', file, '→', objectPath);
      uploaded += 1;
    }
  }

  if (!dryRun) {
    fs.writeFileSync(URLS_OUT, `${JSON.stringify(mapping, null, 2)}\n`, 'utf8');
    console.log(`\nWrote ${path.relative(ROOT, URLS_OUT)} (${Object.keys(mapping).length} URLs)`);
  }

  console.log(`\nUpload: ${uploaded} OK, ${skipped} thiếu file`);
  console.log('Tiếp theo: node scripts/knowledge/build-seeds.js');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
