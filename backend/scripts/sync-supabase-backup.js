#!/usr/bin/env node
/**
 * Đồng bộ schema + dữ liệu từ Supabase primary sang backup (pg_dump/pg_restore).
 *
 * Yêu cầu: pg_dump và pg_restore trong PATH (PostgreSQL client tools).
 *
 * Env:
 *   SUPABASE_DB_DIRECT_URL hoặc DATABASE_URL — primary (session mode, port 5432)
 *   SUPABASE_BACKUP_DB_DIRECT_URL — backup direct connection
 *
 * Usage:
 *   node scripts/sync-supabase-backup.js           # dump + restore
 *   node scripts/sync-supabase-backup.js --verify  # chỉ đếm vài bảng quan trọng
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { spawnSync } = require('child_process');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  resolvePrimaryDbDumpUrl,
  resolveBackupDbDumpUrl,
  resolvePrimaryDbUrl,
  resolveBackupDbUrl,
  buildPgPoolConfig,
} = require('../src/config/pgConnection');

const PRIMARY_URL = resolvePrimaryDbDumpUrl();
const BACKUP_URL = resolveBackupDbDumpUrl();
const VERIFY_PRIMARY_URL = resolvePrimaryDbUrl('probe');
const VERIFY_BACKUP_URL = resolveBackupDbUrl('probe');

const VERIFY_TABLES = ['users', 'crm_leads', 'projects', 'companies'];

function run(cmd, args, env = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env } });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed (exit ${r.status})`);
  }
}

async function countRows(pool, table) {
  const { rows } = await pool.query(`SELECT COUNT(*)::bigint AS n FROM public.${table}`);
  return BigInt(rows[0]?.n || 0);
}

async function verify() {
  if (!PRIMARY_URL || !BACKUP_URL) {
    throw new Error('Thiếu SUPABASE_DB_* và SUPABASE_BACKUP_DB_* trong .env');
  }
  const primary = new Pool(buildPgPoolConfig(VERIFY_PRIMARY_URL));
  const backup = new Pool(buildPgPoolConfig(VERIFY_BACKUP_URL));
  try {
    console.log('Bảng          Primary    Backup     Drift');
    console.log('─────────────────────────────────────────');
    for (const t of VERIFY_TABLES) {
      const [p, b] = await Promise.all([countRows(primary, t), countRows(backup, t)]);
      const drift = p - b;
      const flag = drift !== 0n ? ' ⚠' : '';
      console.log(`${t.padEnd(14)}${String(p).padEnd(11)}${String(b).padEnd(11)}${drift}${flag}`);
    }
  } finally {
    await primary.end();
    await backup.end();
  }
}

async function sync() {
  if (!PRIMARY_URL || !BACKUP_URL) {
    throw new Error('Thiếu SUPABASE_DB_* và SUPABASE_BACKUP_DB_* trong .env');
  }

  const dumpFile = path.join(os.tmpdir(), `supabase-backup-${Date.now()}.dump`);
  console.log('[sync] Dump primary →', dumpFile);

  run('pg_dump', [
    '-d', PRIMARY_URL,
    '--format=custom',
    '--no-owner',
    '--no-acl',
    '--file', dumpFile,
  ]);

  console.log('[sync] Restore vào backup…');
  run('pg_restore', [
    '-d', BACKUP_URL,
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-acl',
    dumpFile,
  ]);

  try { fs.unlinkSync(dumpFile); } catch { /* ignore */ }

  console.log('[sync] Xong. Chạy --verify để kiểm tra drift.');
  await verify();
}

async function main() {
  if (process.argv.includes('--verify')) {
    await verify();
    return;
  }
  await sync();
}

main().catch((e) => {
  console.error('[sync-supabase-backup]', e.message);
  process.exit(1);
});
