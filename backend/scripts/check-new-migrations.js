#!/usr/bin/env node
/**
 * CI: kiểm tra file migration MỚI trong PR (tên đúng quy ước, không trùng số).
 *   node backend/scripts/check-new-migrations.js <base-ref>      vd origin/main
 * File cũ trùng số không bị chặn (đã có trước) — chỉ file thêm mới phải đúng.
 * Sửa file migration đã có trên base: chỉ cảnh báo (không sửa migration đã chạy production).
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { checkNewMigrations } = require('./lib/migrationPlan');

const ROOT = path.join(__dirname, '..', '..');
const DB_DIR = path.join(ROOT, 'database');

function gitNames(base, filter) {
  const out = execFileSync('git', ['diff', '--name-only', `--diff-filter=${filter}`, `${base}...HEAD`, '--', 'database/'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return out.split('\n').map((s) => s.trim()).filter(Boolean)
    .filter((p) => /^database\/[^/]+\.sql$/i.test(p))
    .map((p) => p.slice('database/'.length));
}

const base = process.argv[2];
if (!base) {
  console.error('Dùng: node backend/scripts/check-new-migrations.js <base-ref>');
  process.exit(1);
}

const added = gitNames(base, 'A');
const modified = gitNames(base, 'M');
const errors = checkNewMigrations(added, fs.readdirSync(DB_DIR));

for (const f of modified) {
  console.log(`::warning file=database/${f}::Sửa migration đã có — nếu file đã chạy trên production, hãy thêm file mới thay vì sửa.`);
}
for (const e of errors) console.log(`::error::${e}`);
console.log(`Migration mới: ${added.length} · sửa: ${modified.length} · lỗi: ${errors.length}`);
process.exit(errors.length ? 1 : 0);
