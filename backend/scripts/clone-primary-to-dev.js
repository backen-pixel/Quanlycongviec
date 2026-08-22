#!/usr/bin/env node
/**
 * Clone schema + data primary (qlycv) → QLCV_DEV (xfqlxilgjudfsrbsyasq)
 * qua pg_dump/pg_restore — chỉ schema public (bảng + dữ liệu).
 *
 * Env:
 *   SUPABASE_DB_URL (primary pooler)
 *   SUPABASE_DEV_DB_URL (DEV pooler) hoặc CLONE_TARGET_DB_URL
 *   SUPABASE_ACCESS_TOKEN (optional: đặt mật khẩu DEV tạm nếu thiếu URL)
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const DEV_REF = process.env.DEV_PROJECT_REF || 'xfqlxilgjudfsrbsyasq';
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
  console.log(`[clone-dev] pg_dump ${user}@${host}:${port}/${database}`);
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

function runPsqlSql(connectionUrl, sql, label) {
  const { parsePgConnectionUrl, pgCliEnv } = require('../src/config/pgConnection');
  const { host, port, user, database } = parsePgConnectionUrl(connectionUrl);
  const psql = findPgBin('psql');
  const r = spawnSync(psql, [
    '-h', host,
    '-p', port,
    '-U', user,
    '-d', database,
    '-v', 'ON_ERROR_STOP=1',
    '-c', sql,
  ], {
    env: pgCliEnv(connectionUrl),
    stdio: 'inherit',
  });
  if (r.status !== 0) throw new Error(`${label} failed (exit ${r.status})`);
}

async function listExtensions(connectionUrl) {
  const { Client } = require('pg');
  const { buildPgPoolConfig } = require('../src/config/pgConnection');
  const client = new Client(buildPgPoolConfig(connectionUrl));
  await client.connect();
  try {
    const { rows } = await client.query(`
      SELECT e.extname, n.nspname AS schema
      FROM pg_extension e
      JOIN pg_namespace n ON n.oid = e.extnamespace
      ORDER BY e.extname
    `);
    return rows;
  } finally {
    await client.end().catch(() => {});
  }
}

function prepareTargetSchemaForRestore(connectionUrl, extensions) {
  const extInPublic = (extensions || []).filter((e) => e.schema === 'public');
  const lines = [
    'DROP SCHEMA IF EXISTS public CASCADE;',
    'CREATE SCHEMA public;',
    'GRANT ALL ON SCHEMA public TO postgres;',
    'GRANT ALL ON SCHEMA public TO public;',
    'GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;',
    'CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;',
  ];
  for (const { extname } of extInPublic) {
    if (extname !== 'pg_trgm') {
      lines.push(`CREATE EXTENSION IF NOT EXISTS "${extname}" WITH SCHEMA public;`);
    }
  }
  console.log('[clone-dev] Chuẩn bị schema public trên DEV…');
  runPsqlSql(connectionUrl, lines.join('\n'), 'prepare DEV schema');
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

async function runPgRestore(connectionUrl, dumpFile) {
  const { parsePgConnectionUrl, pgRestoreEnv } = require('../src/config/pgConnection');
  const { host, port, user, database } = parsePgConnectionUrl(connectionUrl);
  console.log('[clone-dev] pg_restore →', `${user}@${host}:${port}/${database}`);
  const pgRestore = findPgBin('pg_restore');
  const args = [
    '-h', host,
    '-p', port,
    '-U', user,
    '-d', database,
    '--no-owner',
    '--no-acl',
    dumpFile,
  ];
  const r = spawnSync(pgRestore, args, {
    env: pgRestoreEnv(connectionUrl),
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);

  const tableCount = await countPublicTables(connectionUrl);
  console.log(`[clone-dev] DEV có ${tableCount} bảng public sau pg_restore`);
  const minTables = Math.max(50, parseInt(process.env.SUPABASE_CLONE_MIN_TABLES || '200', 10));
  if (tableCount < minTables) {
    throw new Error(`pg_restore không đủ bảng trên DEV (${tableCount} < ${minTables}) — exit ${r.status}`);
  }
  if (r.status !== 0) {
    const out = `${r.stdout || ''}\n${r.stderr || ''}`;
    if (/schema "public" already exists/i.test(out)) {
      console.log('[clone-dev] pg_restore exit', r.status, '(CREATE SCHEMA public trùng — bỏ qua)');
      return;
    }
    throw new Error(`pg_restore failed (exit ${r.status})`);
  }
}

async function testPgConnect(label, connectionUrl) {
  const { Client } = require('pg');
  const { buildPgPoolConfig, withPgCircuitBreakerRetry } = require('../src/config/pgConnection');
  await withPgCircuitBreakerRetry(async () => {
    const client = new Client(buildPgPoolConfig(connectionUrl));
    await client.connect();
    try {
      const { rows } = await client.query('SELECT current_user AS u');
      console.log(`[clone-dev] ${label}: kết nối OK (${rows[0]?.u})`);
    } finally {
      await client.end().catch(() => {});
    }
  }, {
    label,
    onWait: (msg) => console.log(`[clone-dev] ${msg}`),
  });
}

async function verifyCounts(primaryUrl, targetUrl) {
  const { Client } = require('pg');
  const { buildPgPoolConfig } = require('../src/config/pgConnection');
  const tables = ['users', 'crm_leads', 'projects', 'companies', 'notifications'];
  const pc = new Client(buildPgPoolConfig(primaryUrl));
  const tc = new Client(buildPgPoolConfig(targetUrl));
  await pc.connect();
  await tc.connect();
  console.log('\nVerify:');
  console.log('Table          Primary    DEV');
  for (const t of tables) {
    const p = await pc.query(`SELECT COUNT(*)::bigint AS n FROM public.${t}`);
    const d = await tc.query(`SELECT COUNT(*)::bigint AS n FROM public.${t}`);
    console.log(`${t.padEnd(15)}${String(p.rows[0].n).padEnd(11)}${d.rows[0].n}`);
  }
  await pc.end();
  await tc.end();
}

async function applyGrants(connectionUrl) {
  const { Client } = require('pg');
  const { buildPgPoolConfig } = require('../src/config/pgConnection');
  const client = new Client(buildPgPoolConfig(connectionUrl));
  await client.connect();
  try {
    await client.query(`
GRANT USAGE ON SCHEMA public TO service_role, anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role, authenticated',
      r.tablename
    );
  END LOOP;
  FOR r IN
    SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public'
  LOOP
    EXECUTE format(
      'GRANT USAGE, SELECT ON public.%I TO service_role, authenticated',
      r.sequence_name
    );
  END LOOP;
END $$;
    `);
    console.log('[clone-dev] Grants service_role OK');
  } finally {
    await client.end().catch(() => {});
  }
}

function resolveDevDumpUrl() {
  const {
    normalizeSupabasePoolerUrl,
    toSessionPoolerUrl,
  } = require('../src/config/pgConnection');
  const raw = process.env.CLONE_TARGET_DB_URL
    || process.env.SUPABASE_DEV_DB_URL
    || '';
  if (!raw) return '';
  const pool = normalizeSupabasePoolerUrl(raw, DEV_REF);
  if (process.env.PG_DUMP_USE_DIRECT === '1') {
    return process.env.SUPABASE_DEV_DB_DIRECT_URL || pool;
  }
  return toSessionPoolerUrl(pool) || pool;
}

function resolvePrimaryCloneDumpUrl() {
  const {
    resolvePrimaryDbDumpUrl,
    toSessionPoolerUrl,
    normalizeSupabasePoolerUrl,
  } = require('../src/config/pgConnection');
  if (process.env.CLONE_PRIMARY_DB_URL) {
    return process.env.CLONE_PRIMARY_DB_URL;
  }
  // User tạm clone_temp — tránh rotate mật khẩu postgres production khi .env stale
  if (process.env.CLONE_TEMP_PASSWORD) {
    const enc = encodeURIComponent(process.env.CLONE_TEMP_PASSWORD);
    return `postgresql://clone_temp.${PRIMARY_REF}:${enc}@aws-1-ap-south-1.pooler.supabase.com:5432/postgres`;
  }
  const primary = resolvePrimaryDbDumpUrl();
  return primary || '';
}

async function main() {
  const {
    describePgTarget,
    toSessionPoolerUrl,
    normalizeSupabasePoolerUrl,
  } = require('../src/config/pgConnection');

  let primaryDumpUrl = resolvePrimaryCloneDumpUrl();
  let targetDumpUrl = resolveDevDumpUrl();

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const reuseDump = process.env.CLONE_REUSE_DUMP || '';
  const dumpFile = reuseDump && fs.existsSync(reuseDump)
    ? reuseDump
    : path.join(OUT_DIR, `dev_${Date.now()}.dump`);

  if (!targetDumpUrl) {
    if (!TOKEN) throw new Error('Thiếu SUPABASE_DEV_DB_URL và SUPABASE_ACCESS_TOKEN');
    const clonePassword = process.env.CLONE_DB_PASSWORD
      || (fs.existsSync(path.join(__dirname, '../uploads/_tmp_dev_db_pw.txt'))
        ? fs.readFileSync(path.join(__dirname, '../uploads/_tmp_dev_db_pw.txt'), 'utf8').trim()
        : crypto.randomBytes(18).toString('base64url'));
    console.log('[clone-dev] Đặt mật khẩu DB trên DEV…');
    await setDbPassword(DEV_REF, clonePassword);
    const poolerHost = process.env.SUPABASE_DEV_POOLER_HOST || 'aws-0-us-west-1.pooler.supabase.com';
    const encoded = encodeURIComponent(clonePassword);
    const poolUrl = `postgresql://postgres.${DEV_REF}:${encoded}@${poolerHost}:6543/postgres`;
    targetDumpUrl = toSessionPoolerUrl(normalizeSupabasePoolerUrl(poolUrl, DEV_REF)) || poolUrl;
    console.log('[clone-dev] Target URL built for', DEV_REF);
  }

  if (!primaryDumpUrl && !reuseDump) {
    throw new Error('Thiếu CLONE_PRIMARY_DB_URL / CLONE_TEMP_PASSWORD / SUPABASE_DB_URL');
  }

  if (primaryDumpUrl) console.log('[clone-dev] Primary:', describePgTarget(primaryDumpUrl));
  console.log('[clone-dev] DEV:    ', describePgTarget(targetDumpUrl));
  console.log('[clone-dev] Dump:   ', dumpFile);

  if (TOKEN) {
    const chkDev = await mgmtQuery(DEV_REF, 'SELECT current_user AS u');
    console.log('[clone-dev] DEV mgmt OK:', chkDev[0]?.u);
  }

  if (primaryDumpUrl) await testPgConnect('Primary dump source', primaryDumpUrl);
  await testPgConnect('DEV DB', targetDumpUrl);

  if (!(reuseDump && fs.existsSync(reuseDump))) {
    console.log('[clone-dev] pg_dump primary →', dumpFile);
    runPgDump(primaryDumpUrl, dumpFile);
  } else {
    console.log('[clone-dev] Reuse dump file (skip pg_dump)');
  }

  // Extensions: lấy từ dump source nếu có, không thì mặc định pg_trgm
  let extensions = [{ extname: 'pg_trgm', schema: 'public' }];
  if (primaryDumpUrl) {
    try {
      extensions = await listExtensions(primaryDumpUrl);
    } catch (e) {
      console.log('[clone-dev] listExtensions skip:', e.message);
    }
  }
  console.log('[clone-dev] Extensions:', extensions.map((e) => `${e.extname}@${e.schema}`).join(', ') || '(none)');
  prepareTargetSchemaForRestore(targetDumpUrl, extensions);

  console.log('[clone-dev] pg_restore vào DEV…');
  await runPgRestore(targetDumpUrl, dumpFile);

  console.log('[clone-dev] Verify row counts…');
  // Verify DEV vs expected via Management API if primary pooler auth stale
  if (primaryDumpUrl) {
    try {
      await verifyCounts(primaryDumpUrl, targetDumpUrl);
    } catch (e) {
      console.log('[clone-dev] verify via PG skip:', e.message);
      if (TOKEN) {
        const tables = ['users', 'crm_leads', 'projects', 'companies', 'notifications'];
        console.log('\nVerify (mgmt primary vs DEV PG):');
        for (const t of tables) {
          const p = await mgmtQuery(PRIMARY_REF, `SELECT COUNT(*)::bigint AS n FROM public.${t}`);
          const { Client } = require('pg');
          const { buildPgPoolConfig } = require('../src/config/pgConnection');
          const c = new Client(buildPgPoolConfig(targetDumpUrl));
          await c.connect();
          const d = await c.query(`SELECT COUNT(*)::bigint AS n FROM public.${t}`);
          await c.end();
          console.log(`${t.padEnd(15)}${String(p[0]?.n).padEnd(11)}${d.rows[0].n}`);
        }
      }
    }
  }

  await applyGrants(targetDumpUrl);
  console.log('[clone-dev] Hoàn tất primary → QLCV_DEV.');
}

main().catch((e) => {
  console.error('[clone-dev]', e.message);
  process.exit(1);
});
