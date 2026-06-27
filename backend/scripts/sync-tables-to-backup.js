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

function run(cmd, args, label, connectionUrl, envMode = 'default') {
  const { pgCliEnv, pgRestoreEnv } = require('../src/config/pgConnection');
  const env = envMode === 'restore'
    ? pgRestoreEnv(connectionUrl)
    : pgCliEnv(connectionUrl);
  const r = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: false,
    env: connectionUrl ? env : process.env,
  });
  if (r.status !== 0) throw new Error(`${label} failed (exit ${r.status})`);
}

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

/** Sắp bảng cha trước con (FK nội bộ danh sách) — tránh lỗi khi replica role bị hạn chế. */
async function sortTablesByDependencies(tables, primaryUrl) {
  const set = new Set(tables);
  if (set.size <= 1) return tables;
  const { Client } = require('pg');
  const { buildPgPoolConfig } = require('../src/config/pgConnection');
  const client = new Client(buildPgPoolConfig(primaryUrl));
  await client.connect();
  try {
    const { rows } = await client.query(`
      SELECT tc.table_name AS child, ccu.table_name AS parent
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
       AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name = ANY($1::text[])
        AND ccu.table_name = ANY($1::text[])
    `, [tables]);
    const deps = new Map();
    for (const t of tables) deps.set(t, new Set());
    for (const { child, parent } of rows) {
      if (child === parent) continue;
      if (deps.has(child) && deps.has(parent)) deps.get(child).add(parent);
    }
    const sorted = [];
    const temp = new Set();
    const perm = new Set();
    function visit(n) {
      if (perm.has(n)) return;
      if (temp.has(n)) return;
      temp.add(n);
      for (const p of deps.get(n) || []) visit(p);
      temp.delete(n);
      perm.add(n);
      sorted.push(n);
    }
    for (const t of tables) visit(t);
    return sorted;
  } finally {
    await client.end().catch(() => {});
  }
}

async function countPublicTables(connectionUrl) {
  const { Client } = require('pg');
  const { buildPgPoolConfig } = require('../src/config/pgConnection');
  const client = new Client(buildPgPoolConfig(connectionUrl));
  await client.connect();
  try {
    const { rows } = await client.query(`
      SELECT COUNT(*)::int AS n
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);
    return Number(rows[0]?.n || 0);
  } finally {
    await client.end().catch(() => {});
  }
}

async function tableExistsOnBackup(backupUrl, table) {
  const { Client } = require('pg');
  const { buildPgPoolConfig } = require('../src/config/pgConnection');
  const client = new Client(buildPgPoolConfig(backupUrl));
  await client.connect();
  try {
    const { rows } = await client.query(`
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1 AND table_type = 'BASE TABLE'
      LIMIT 1
    `, [table]);
    return rows.length > 0;
  } finally {
    await client.end().catch(() => {});
  }
}

async function syncOneTable(primaryUrl, backupUrl, table) {
  const { parsePgConnectionUrl } = require('../src/config/pgConnection');
  const exists = await tableExistsOnBackup(backupUrl, table);
  if (!exists) {
    throw new Error(`Bảng public.${table} chưa có trên backup — cần clone full trước`);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const dumpFile = path.join(OUT_DIR, `table_${table}_${Date.now()}.dump`);
  const pgDump = findPgBin('pg_dump');
  const psql = findPgBin('psql');
  const pgRestore = findPgBin('pg_restore');
  const primary = parsePgConnectionUrl(primaryUrl);
  const backup = parsePgConnectionUrl(backupUrl);

  console.log(`[sync-table] ${table}: dump data-only từ primary…`);
  run(pgDump, [
    '-h', primary.host,
    '-p', primary.port,
    '-U', primary.user,
    '-d', primary.database,
    '-t', `public.${table}`,
    '--data-only',
    '--no-owner',
    '--no-acl',
    '-F', 'c',
    '-f', dumpFile,
  ], `pg_dump ${table}`, primaryUrl);

  console.log(`[sync-table] ${table}: xóa dữ liệu cũ trên backup…`);
  run(psql, [
    '-h', backup.host,
    '-p', backup.port,
    '-U', backup.user,
    '-d', backup.database,
    '-v', 'ON_ERROR_STOP=1',
    '-c', `SET session_replication_role = replica; DELETE FROM public.${quoteIdent(table)}; SET session_replication_role = DEFAULT;`,
  ], `clear ${table}`, backupUrl, 'restore');

  console.log(`[sync-table] ${table}: tắt trigger user trước restore…`);
  run(psql, [
    '-h', backup.host,
    '-p', backup.port,
    '-U', backup.user,
    '-d', backup.database,
    '-v', 'ON_ERROR_STOP=1',
    '-c', `ALTER TABLE public.${quoteIdent(table)} DISABLE TRIGGER USER;`,
  ], `disable triggers ${table}`, backupUrl, 'restore');

  console.log(`[sync-table] ${table}: restore data vào backup (tắt trigger/FK tạm)…`);
  run(pgRestore, [
    '-h', backup.host,
    '-p', backup.port,
    '-U', backup.user,
    '-d', backup.database,
    '--data-only',
    '--no-owner',
    '--no-acl',
    dumpFile,
  ], `pg_restore ${table}`, backupUrl, 'restore');

  run(psql, [
    '-h', backup.host,
    '-p', backup.port,
    '-U', backup.user,
    '-d', backup.database,
    '-v', 'ON_ERROR_STOP=1',
    '-c', `ALTER TABLE public.${quoteIdent(table)} ENABLE TRIGGER USER;`,
  ], `enable triggers ${table}`, backupUrl, 'restore');

  try { fs.unlinkSync(dumpFile); } catch { /* ignore */ }
  console.log(`[sync-table] ${table}: xong`);
}

async function main() {
  const {
    resolvePrimaryDbDumpUrl,
    resolveBackupDbDumpUrl,
  } = require('../src/config/pgConnection');
  const primaryUrl = resolvePrimaryDbDumpUrl();
  const backupUrl = resolveBackupDbDumpUrl();
  if (!primaryUrl || !backupUrl) {
    throw new Error('Thiếu SUPABASE_DB_* / SUPABASE_BACKUP_DB_* trong backend/.env');
  }
  const backupTables = await countPublicTables(backupUrl);
  if (backupTables < 50) {
    throw new Error(`Backup chỉ có ${backupTables} bảng public — cần clone full trước (schema chưa đầy đủ)`);
  }
  let tables = parseTablesArg();
  try {
    tables = await sortTablesByDependencies(tables, primaryUrl);
  } catch (e) {
    console.warn(`[sync-table] Không sắp thứ tự FK: ${e.message} — dùng thứ tự gốc`);
  }
  console.log(`[sync-table] Incremental ${tables.length} bảng → backup`);
  for (const table of tables) {
    await syncOneTable(primaryUrl, backupUrl, table);
  }
  console.log('[sync-table] Hoàn tất');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
