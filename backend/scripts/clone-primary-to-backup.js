#!/usr/bin/env node
/**
 * Clone schema + data primary → backup qua pg_dump/pg_restore + Supabase Management API.
 *
 * Env: SUPABASE_ACCESS_TOKEN, PRIMARY_PROJECT_REF, BACKUP_PROJECT_REF
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

function runPgDump(host, password, outFile) {
  const pgDump = findPgBin('pg_dump');
  const args = [
    '-h', host,
    '-p', '5432',
    '-U', 'postgres',
    '-d', 'postgres',
    '-n', 'public',
    '--no-owner',
    '--no-acl',
    '-F', 'c',
    '-f', outFile,
  ];
  const r = spawnSync(pgDump, args, {
    env: { ...process.env, PGPASSWORD: password },
    stdio: 'inherit',
  });
  if (r.status !== 0) throw new Error(`pg_dump failed (exit ${r.status})`);
}

function runPgRestore(host, password, dumpFile, emptyTarget = true) {
  const pgRestore = findPgBin('pg_restore');
  const args = [
    '-h', host,
    '-p', '5432',
    '-U', 'postgres',
    '-d', 'postgres',
    '--no-owner',
    '--no-acl',
    '--disable-triggers',
    ...(emptyTarget ? [] : ['--clean', '--if-exists']),
    dumpFile,
  ];
  const r = spawnSync(pgRestore, args, {
    env: { ...process.env, PGPASSWORD: password },
    stdio: 'inherit',
  });
  if (r.status !== 0) throw new Error(`pg_restore failed (exit ${r.status})`);
}

async function verifyCounts(primaryHost, backupHost, password) {
  const { Client } = require('pg');
  const tables = ['users', 'crm_leads', 'projects', 'companies', 'notifications'];
  const pc = new Client({
    host: primaryHost, port: 5432, user: 'postgres', password, database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });
  const bc = new Client({
    host: backupHost, port: 5432, user: 'postgres', password, database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });
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
  if (!TOKEN) throw new Error('Thiếu SUPABASE_ACCESS_TOKEN');

  const primaryHost = `db.${PRIMARY_REF}.supabase.co`;
  const backupHost = `db.${BACKUP_REF}.supabase.co`;
  const clonePassword = process.env.CLONE_DB_PASSWORD || crypto.randomBytes(18).toString('base64url');

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const dumpFile = path.join(OUT_DIR, `full_${Date.now()}.dump`);

  console.log('[clone] Kiểm tra kết nối primary (Management API)…');
  const chk = await mgmtQuery(PRIMARY_REF, 'SELECT current_user AS u');
  console.log('[clone] Primary user:', chk[0]?.u);

  console.log('[clone] Đặt mật khẩu DB tạm cho primary + backup (REST API không bị ảnh hưởng)…');
  await setDbPassword(PRIMARY_REF, clonePassword);
  await setDbPassword(BACKUP_REF, clonePassword);

  console.log('[clone] pg_dump primary →', dumpFile);
  runPgDump(primaryHost, clonePassword, dumpFile);

  console.log('[clone] pg_restore vào backup…');
  runPgRestore(backupHost, clonePassword, dumpFile);

  console.log('[clone] Verify row counts…');
  await verifyCounts(primaryHost, backupHost, clonePassword);

  const credFile = path.join(OUT_DIR, '_clone_db_credentials.txt');
  fs.writeFileSync(credFile, [
    `# Generated ${new Date().toISOString()}`,
    `PRIMARY_DB_HOST=${primaryHost}`,
    `BACKUP_DB_HOST=${backupHost}`,
    `CLONE_DB_PASSWORD=${clonePassword}`,
    `SUPABASE_BACKUP_DB_URL=postgresql://postgres.${BACKUP_REF}:${encodeURIComponent(clonePassword)}@aws-1-ap-south-1.pooler.supabase.com:6543/postgres`,
    `SUPABASE_BACKUP_DB_DIRECT_URL=postgresql://postgres:${encodeURIComponent(clonePassword)}@${backupHost}:5432/postgres`,
    '',
    '# Thêm 2 dòng SUPABASE_BACKUP_DB_* vào backend/.env và Render env',
  ].join('\n'), 'utf8');

  console.log('[clone] Hoàn tất. Credentials:', credFile);
}

main().catch((e) => {
  console.error('[clone]', e.message);
  process.exit(1);
});
