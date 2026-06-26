#!/usr/bin/env node
/**
 * Đồng bộ incremental vài bảng primary → backup (data-only, không clone cả DB).
 *
 * Usage:
 *   node scripts/sync-tables-to-backup.js --tables users,crm_leads
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '../uploads/_clone');

function parseTablesArg() {
  const i = process.argv.indexOf('--tables');
  if (i < 0 || !process.argv[i + 1]) {
    throw new Error('Cần --tables t1,t2,...');
  }
  return process.argv[i + 1].split(',').map((s) => s.trim()).filter(Boolean);
}

function findPgBin(name) {
  const paths = [
    `C:\\Program Files\\PostgreSQL\\17\\bin\\${name}.exe`,
    `C:\\Program Files\\PostgreSQL\\16\\bin\\${name}.exe`,
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  const which = spawnSync('where', [name], { encoding: 'utf8', shell: true });
  if (which.status === 0) return which.stdout.trim().split('\n')[0].trim();
  return name;
}

function run(cmd, args, label) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: false });
  if (r.status !== 0) throw new Error(`${label} failed (exit ${r.status})`);
}

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function syncOneTable(primaryUrl, backupUrl, table) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const dumpFile = path.join(OUT_DIR, `table_${table}_${Date.now()}.dump`);
  const pgDump = findPgBin('pg_dump');
  const psql = findPgBin('psql');
  const pgRestore = findPgBin('pg_restore');

  console.log(`[sync-table] ${table}: dump data-only từ primary…`);
  run(pgDump, [
    primaryUrl,
    '-t', `public.${table}`,
    '--data-only',
    '--no-owner',
    '--no-acl',
    '-F', 'c',
    '-f', dumpFile,
  ], `pg_dump ${table}`);

  console.log(`[sync-table] ${table}: xóa dữ liệu cũ trên backup…`);
  run(psql, [
    backupUrl,
    '-c', `TRUNCATE TABLE public.${quoteIdent(table)} RESTART IDENTITY CASCADE`,
  ], `truncate ${table}`);

  console.log(`[sync-table] ${table}: restore data vào backup…`);
  run(pgRestore, [
    '-d', backupUrl,
    '--data-only',
    '--disable-triggers',
    '--no-owner',
    '--no-acl',
    dumpFile,
  ], `pg_restore ${table}`);

  try { fs.unlinkSync(dumpFile); } catch { /* ignore */ }
  console.log(`[sync-table] ${table}: xong`);
}

function main() {
  const primaryUrl = process.env.SUPABASE_DB_DIRECT_URL || process.env.SUPABASE_DB_URL;
  const backupUrl = process.env.SUPABASE_BACKUP_DB_DIRECT_URL || process.env.SUPABASE_BACKUP_DB_URL;
  if (!primaryUrl || !backupUrl) {
    throw new Error('Thiếu SUPABASE_DB_* / SUPABASE_BACKUP_DB_* trong backend/.env');
  }
  const tables = parseTablesArg();
  console.log(`[sync-table] Incremental ${tables.length} bảng → backup`);
  for (const table of tables) {
    syncOneTable(primaryUrl, backupUrl, table);
  }
  console.log('[sync-table] Hoàn tất');
}

main();
