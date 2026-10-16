#!/usr/bin/env node
/**
 * Chạy và theo dõi migration /database/*.sql trên DB primary / backup.
 * Sổ ghi: bảng public.schema_migrations (database/722_schema_migrations.sql — tự tạo khi apply/baseline).
 *
 *   node scripts/migrate.js status   [--target primary|backup] [--via pg|api]
 *   node scripts/migrate.js apply    <file|số> [--target primary|backup|both] [--via pg|api] [--force] [--yes]
 *   node scripts/migrate.js baseline --upto <số> [--target primary|backup|both] [--via pg|api] [--yes]
 *
 * Không có --yes: chỉ in kế hoạch, không ghi gì.
 * --via pg  : dùng SUPABASE_DB_DIRECT_URL / SUPABASE_DB_URL / DATABASE_URL (backup: SUPABASE_BACKUP_DB_*)
 * --via api : dùng Supabase Management API (SUPABASE_ACCESS_TOKEN + PRIMARY_PROJECT_REF / BACKUP_PROJECT_REF)
 * Mặc định: api nếu có token + ref (cách nhóm đang dùng), ngược lại pg.
 *
 * apply nối lệnh ghi sổ vào CUỐI nội dung file và gửi một lần: SQL lỗi thì không ghi sổ.
 * Với --via pg (simple query) và file không tự có BEGIN/COMMIT, cả hai chạy trong cùng một
 * transaction ngầm định. Lỗi ở giữa file trên --via api: kiểm lại bằng `status` trước khi chạy lại.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const plan = require('./lib/migrationPlan');
const {
  resolvePrimaryDbUrl,
  resolveBackupDbUrl,
  primaryProjectRef,
  backupProjectRef,
} = require('../src/config/pgConnection');

const DB_DIR = path.join(__dirname, '..', '..', 'database');
const BOOTSTRAP_FILE = '722_schema_migrations.sql';

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--yes' || a === '--force') out[a.slice(2)] = true;
    else if (a.startsWith('--')) out[a.slice(2)] = argv[i += 1];
    else out._.push(a);
  }
  return out;
}

function readMigrations() {
  return plan.listMigrations(fs.readdirSync(DB_DIR)).map((filename) => {
    const content = fs.readFileSync(path.join(DB_DIR, filename), 'utf8');
    return { filename, content, checksum: plan.checksumOf(content) };
  });
}

function appliedBy() {
  let user = 'unknown';
  try { user = os.userInfo().username; } catch (_) { /* ignore */ }
  return `${user}@${os.hostname()}`.replace(/[^\w.@-]/g, '_').slice(0, 120);
}

function makeConnector(target, via) {
  const url = target === 'backup' ? resolveBackupDbUrl('session') : resolvePrimaryDbUrl('session');
  const ref = target === 'backup' ? backupProjectRef() : primaryProjectRef();
  const token = process.env.SUPABASE_ACCESS_TOKEN || '';
  const mode = via || (token && ref ? 'api' : 'pg');

  if (mode === 'pg') {
    if (!url) throw new Error(`[${target}] thiếu URL Postgres trong backend/.env`);
    const { Client } = require('pg');
    return {
      label: `${target} (pg, ref ${ref || '?'})`,
      async query(sql) {
        const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
        await client.connect();
        try {
          const res = await client.query(sql);
          const last = Array.isArray(res) ? res[res.length - 1] : res;
          return last?.rows || [];
        } finally {
          await client.end();
        }
      },
    };
  }
  if (mode === 'api') {
    if (!token || !ref) throw new Error(`[${target}] thiếu SUPABASE_ACCESS_TOKEN hoặc project ref`);
    return {
      label: `${target} (api, ref ${ref})`,
      async query(sql) {
        const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ query: sql }),
        });
        const text = await res.text();
        if (!res.ok) {
          const err = new Error(`HTTP ${res.status}: ${text.slice(0, 1000)}`);
          if (/42P01|does not exist/i.test(text)) err.code = '42P01';
          throw err;
        }
        try { return JSON.parse(text) || []; } catch { return []; }
      },
    };
  }
  throw new Error(`--via không hợp lệ: ${via}`);
}

function targetsOf(arg) {
  const t = arg || 'primary';
  if (t === 'both') return ['primary', 'backup'];
  if (t === 'primary' || t === 'backup') return [t];
  throw new Error(`--target không hợp lệ: ${t}`);
}

async function readApplied(conn) {
  try {
    return await conn.query('SELECT filename, checksum, source, applied_at FROM public.schema_migrations');
  } catch (e) {
    if (e.code === '42P01') return null;
    throw e;
  }
}

async function ensureTable(conn) {
  const sql = fs.readFileSync(path.join(DB_DIR, BOOTSTRAP_FILE), 'utf8');
  await conn.query(sql);
}

async function cmdStatus(args, files) {
  const [target] = targetsOf(args.target);
  const conn = makeConnector(target, args.via);
  const applied = await readApplied(conn);
  console.log(`DB: ${conn.label}`);
  if (applied == null) {
    console.log('Chưa có bảng public.schema_migrations — chạy: node scripts/migrate.js baseline --upto <số> --yes');
    return;
  }
  const s = plan.computeStatus(files, applied);
  const baseline = applied.filter((r) => r.source === 'baseline').length;
  console.log(`File migration: ${files.length} · đã ghi sổ: ${s.appliedCount} (baseline ${baseline})`);
  console.log(`Chưa chạy (${s.pending.length}):`);
  s.pending.forEach((f) => console.log(`  - ${f}`));
  if (s.changed.length) {
    console.log(`File đã sửa SAU khi ghi sổ (${s.changed.length}) — kiểm tra lại:`);
    s.changed.forEach((c) => console.log(`  ! ${c.filename}${c.source === 'baseline' ? ' (baseline)' : ''}`));
  }
  if (s.missing.length) {
    console.log(`Có trong sổ nhưng không còn file (${s.missing.length}):`);
    s.missing.forEach((f) => console.log(`  ? ${f}`));
  }
}

async function cmdApply(args, files) {
  if (!args._[1]) throw new Error('Thiếu file: node scripts/migrate.js apply <file|số>');
  const filename = plan.resolveTarget(args._[1], files.map((f) => f.filename));
  const file = files.find((f) => f.filename === filename);
  const by = appliedBy();
  for (const target of targetsOf(args.target)) {
    const conn = makeConnector(target, args.via);
    const applied = (await readApplied(conn)) || [];
    const row = applied.find((r) => r.filename === filename);
    if (row && !args.force) {
      if (row.checksum === file.checksum) {
        console.log(`[${conn.label}] ${filename} đã chạy (${row.source}) — bỏ qua.`);
      } else {
        console.log(`[${conn.label}] ${filename} đã ghi sổ nhưng nội dung KHÁC — không chạy lại. Dùng --force nếu chắc chắn.`);
        process.exitCode = 2;
      }
      continue;
    }
    if (!args.yes) {
      console.log(`[${conn.label}] SẼ chạy ${filename}${row ? ' (--force, chạy lại)' : ''}. Thêm --yes để thực hiện.`);
      continue;
    }
    await ensureTable(conn);
    const sql = `${file.content}\n;\n${plan.recordSql({ filename, checksum: file.checksum, appliedBy: by, force: !!args.force })}`;
    const t0 = Date.now();
    await conn.query(sql);
    console.log(`[${conn.label}] OK ${filename} (${Date.now() - t0} ms)`);
  }
}

async function cmdBaseline(args, files) {
  const upto = Number(args.upto);
  if (!Number.isInteger(upto)) throw new Error('Thiếu --upto <số>: đánh dấu mọi migration có số ≤ upto là đã chạy');
  const rows = files.filter((f) => plan.migrationNumber(f.filename) <= upto);
  for (const target of targetsOf(args.target)) {
    const conn = makeConnector(target, args.via);
    const applied = (await readApplied(conn)) || [];
    const have = new Set(applied.map((r) => r.filename));
    const todo = rows.filter((r) => !have.has(r.filename));
    if (!args.yes) {
      console.log(`[${conn.label}] SẼ ghi baseline ${todo.length} file (số ≤ ${upto}, không chạy SQL). Thêm --yes để thực hiện.`);
      continue;
    }
    await ensureTable(conn);
    if (todo.length) await conn.query(plan.baselineSql(todo, appliedBy()));
    console.log(`[${conn.label}] Đã ghi baseline ${todo.length} file.`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = readMigrations();
  const cmd = args._[0];
  if (cmd === 'status') return cmdStatus(args, files);
  if (cmd === 'apply') return cmdApply(args, files);
  if (cmd === 'baseline') return cmdBaseline(args, files);
  console.error('Dùng: node scripts/migrate.js status | apply <file|số> | baseline --upto <số>  [--target primary|backup|both] [--via pg|api] [--yes]');
  process.exitCode = 1;
}

main().catch((e) => {
  console.error(e.message || e);
  process.exitCode = 1;
});
