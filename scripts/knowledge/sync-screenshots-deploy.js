#!/usr/bin/env node
/**
 * Đồng bộ ảnh bài học → backend/uploads (API serve) + frontend/public (SPA tĩnh).
 * Chạy: node scripts/knowledge/sync-screenshots-deploy.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const SRC = path.join(ROOT, 'uploads', 'knowledge-screenshots');
const TARGETS = [
  path.join(ROOT, 'backend', 'uploads', 'knowledge-screenshots'),
  path.join(ROOT, 'frontend', 'public', 'uploads', 'knowledge-screenshots'),
];

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    console.error('Thiếu thư mục nguồn:', src);
    process.exit(1);
  }
  fs.mkdirSync(dest, { recursive: true });
  const files = fs.readdirSync(src).filter((f) => f.endsWith('.png'));
  let n = 0;
  for (const f of files) {
    fs.copyFileSync(path.join(src, f), path.join(dest, f));
    n += 1;
  }
  return n;
}

let total = 0;
for (const dest of TARGETS) {
  const n = copyDir(SRC, dest);
  total = n;
  console.log(`Copied ${n} PNG → ${path.relative(ROOT, dest)}`);
}
console.log(`Done (${total} files × ${TARGETS.length} targets). Commit backend/uploads + frontend/public rồi deploy.`);
