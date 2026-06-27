#!/usr/bin/env node
/**
 * Clone schema + data primary → backup qua pg_dump/pg_restore.
 *
 * Env: SUPABASE_DB_URL, SUPABASE_BACKUP_DB_URL (pooler 6543 — script tự dùng session pooler 5432 cho dump/restore)
 * Optional: SUPABASE_ACCESS_TOKEN + PRIMARY/BACKUP_PROJECT_REF nếu cần đặt mật khẩu tạm (local dev)
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const OUT_DIR = path.join(__dirname, '../uploads/_clone');

async function mgmtQuery(projectRef, sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`query ${projectRef} failed (${res.status}): ${text}`);
  return text ? JSON.parse(text) : [];
}

async function setDbPassword(projectRef, password) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/password`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`set password ${projectRef} failed (${res.status}): ${text}`);
  }
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

function runPgDump(connectionUrl, outFile) {
  const { parsePgConnectionUrl, pgCliEnv } = require('../src/config/pgConnection');
  const { host, port, user, database } = parsePgConnectionUrl(connectionUrl);
  console.log(`[clone] pg_dump ${user}@${host}:${port}/${database}`);
  const pgDump = findPgBin('pg_dump');
  const args = [
    '-h', host,
    '-p', port,
    '-U', user,
    '-d', database,
    '-n', 'public',
    '--no-owner',
    '--no-acl',
    '-F', 'c',
    '-f', outFile,
  ];
  const r = spawnSync(pgDump, args, {
    env: pgCliEnv(connectionUrl),
    stdio: 'inherit',
  });
  if (r.status !== 0) throw new Error(`pg_dump failed (exit ${r.status})`);
}

function runPgRestore(connectionUrl, dumpFile) {
  const { parsePgConnectionUrl, pgCliEnv } = require('../src/config/pgConnection');
  const { host, port, user, database } = parsePgConnectionUrl(connectionUrl);
  console.log(`[clone] pg_restore → ${user}@${host}:${port}/${database}`);
  const pgRestore = findPgBin('pg_restore');
  const args = [
    '-h', host,
    '-p', port,
    '-U', user,
    '-d', database,
    '--no-owner',
    '--no-acl',
    '--clean',
    '--if-exists',
    '--single-transaction',
    dumpFile,
  ];
  const r = spawnSync(pgRestore, args, {
    env: pgCliEnv(connectionUrl),
    stdio: 'inherit',
  });
  if (r.status !== 0) throw new Error(`pg_restore failed (exit ${r.status})`);
}

async function testPgConnect(label, connectionUrl) {
  const { Client } = require('pg');
  const { buildPgPoolConfig, withPgCircuitBreakerRetry } = require('../src/config/pgConnection');
  await withPgCircuitBreakerRetry(async () => {
    const client = new Client(buildPgPoolConfig(connectionUrl));
    await client.connect();
    try {
      const { rows } = await client.query('SELECT current_user AS u');
      console.log(`[clone] ${label}: kết nối OK (${rows[0]?.u})`);
    } finally {
      await client.end().catch(() => {});
    }
  }, {
    label,
    onWait: (msg) => console.log(`[clone] ${msg}`),
  });
}

async function verifyCounts(primaryUrl, backupUrl) {
  const { Client } = require('pg');
  const { buildPgPoolConfig } = require('../src/config/pgConnection');
  const tables = ['users', 'crm_leads', 'projects', 'companies', 'notifications'];
  const pc = new Client(buildPgPoolConfig(primaryUrl));
  const bc = new Client(buildPgPoolConfig(backupUrl));
  await pc.connect();
  await bc.connect();
  console.log('\nVerify:');
  console.log('Table          Primary    Backup');
  for (const t of tables) {
    const p = await pc.query(`SELECT COUNT(*)::bigint AS n FROM public.${t}`);
    const b = await bc.query(`SELECT COUNT(*)::bigint AS n FROM public.${t}`);
    console.log(`${t.padEnd(15)}${String(p.rows[0].n).padEnd(11)}${b.rows[0].n}`);
  }
  await pc.end();
  await bc.end();
}

async function main() {
  const {
    resolvePrimaryDbDumpUrl,
    resolveBackupDbDumpUrl,
    resolvePrimaryDbUrl,
    resolveBackupDbUrl,
    describePgTarget,
  } = require('../src/config/pgConnection');

  const primaryDumpUrl = resolvePrimaryDbDumpUrl();
  const backupDumpUrl = resolveBackupDbDumpUrl();
  if (!primaryDumpUrl || !backupDumpUrl) {
    throw new Error('Thiếu SUPABASE_DB_URL / SUPABASE_BACKUP_DB_URL (pooler 6543) trên Render');
  }

  console.log('[clone] Primary target:', describePgTarget(primaryDumpUrl));
  console.log('[clone] Backup target:', describePgTarget(backupDumpUrl));

  const useEnvCredentials = process.env.SUPABASE_CLONE_SKIP_PASSWORD_RESET === '1'
    || !!(process.env.SUPABASE_DB_URL && process.env.SUPABASE_BACKUP_DB_URL);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const dumpFile = path.join(OUT_DIR, `full_${Date.now()}.dump`);

  if (!useEnvCredentials) {
    if (!TOKEN) throw new Error('Thiếu SUPABASE_ACCESS_TOKEN hoặc SUPABASE_DB_URL/SUPABASE_BACKUP_DB_URL');
    const clonePassword = process.env.CLONE_DB_PASSWORD || crypto.randomBytes(18).toString('base64url');
    console.log('[clone] Kiểm tra kết nối primary (Management API)…');
    const chk = await mgmtQuery(PRIMARY_REF, 'SELECT current_user AS u');
    console.log('[clone] Primary user:', chk[0]?.u);
    console.log('[clone] Đặt mật khẩu DB tạm cho primary + backup…');
    await setDbPassword(PRIMARY_REF, clonePassword);
    await setDbPassword(BACKUP_REF, clonePassword);
  } else {
    console.log('[clone] Dùng mật khẩu từ SUPABASE_DB_URL / SUPABASE_BACKUP_DB_URL (session pooler cho dump/restore)');
  }

  await testPgConnect('Primary DB', primaryDumpUrl);
  await testPgConnect('Backup DB', backupDumpUrl);

  console.log('[clone] pg_dump primary →', dumpFile);
  runPgDump(primaryDumpUrl, dumpFile);

  console.log('[clone] pg_restore vào backup (clean + if-exists)…');
  runPgRestore(backupDumpUrl, dumpFile);

  console.log('[clone] Verify row counts…');
  await verifyCounts(
    resolvePrimaryDbUrl('probe') || primaryDumpUrl,
    resolveBackupDbUrl('probe') || backupDumpUrl,
  );

  console.log('[clone] Hoàn tất.');
}

main().catch((e) => {
  const { primaryProjectRef, backupProjectRef, isPgPasswordAuthError } = require('../src/config/pgConnection');
  console.error('[clone]', e.message);
  if (isPgPasswordAuthError(e)) {
    console.error(
      `[clone] Render env: SUPABASE_DB_URL user=postgres.${primaryProjectRef()} | `
      + `SUPABASE_BACKUP_DB_URL user=postgres.${backupProjectRef()} — mật khẩu lấy từ Supabase Dashboard → Settings → Database`,
    );
  }
  process.exit(1);
});
