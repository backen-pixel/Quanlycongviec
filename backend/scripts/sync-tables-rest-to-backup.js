#!/usr/bin/env node
/**
 * Đồng bộ vài bảng Primary → Backup qua Supabase REST (khi pg_dump lỗi auth pooler).
 * Usage: node scripts/sync-tables-rest-to-backup.js --tables crm_leads,tasks
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { createClient } = require('@supabase/supabase-js');

function parseTables() {
  const i = process.argv.indexOf('--tables');
  if (i < 0 || !process.argv[i + 1]) throw new Error('Cần --tables t1,t2');
  return process.argv[i + 1].split(',').map((s) => s.trim()).filter(Boolean);
}

const OMIT = {
  crm_leads: ['weighted_value', 'info_complete'],
};

const ON_CONFLICT = {
  project_production_staff: 'project_id,user_id',
};

function clients() {
  return {
    primary: createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
    backup: createClient(process.env.SUPABASE_BACKUP_URL, process.env.SUPABASE_BACKUP_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
  };
}

function strip(row, table) {
  const out = { ...row };
  for (const k of OMIT[table] || []) delete out[k];
  return out;
}

async function fetchAll(client, table) {
  const pageSize = 1000;
  let from = 0;
  const out = [];
  for (;;) {
    const { data, error } = await client.from(table).select('*').range(from, from + pageSize - 1);
    if (error) throw new Error(`${table} fetch: ${error.message}`);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

async function syncTable(primary, backup, table) {
  console.log(`[rest-sync] ${table}: đọc Primary…`);
  const rows = await fetchAll(primary, table);
  console.log(`[rest-sync] ${table}: ${rows.length} row → Backup`);
  const batch = table === 'projects' ? 15 : 100;
  const onConflict = ON_CONFLICT[table] || 'id';
  for (let i = 0; i < rows.length; i += batch) {
    const chunk = rows.slice(i, i + batch).map((r) => strip(r, table));
    const { error } = await backup.from(table).upsert(chunk, { onConflict });
    if (error) throw new Error(`${table} upsert batch ${i}: ${error.message}`);
    if (table === 'projects') process.stdout.write(`  ${Math.min(i + batch, rows.length)}/${rows.length}\n`);
  }
  console.log(`[rest-sync] ${table}: xong`);
}

async function main() {
  const tables = parseTables();
  const { primary, backup } = clients();
  for (const table of tables) {
    await syncTable(primary, backup, table);
  }
  console.log('[rest-sync] Hoàn tất');
}

main().catch((e) => {
  console.error('[rest-sync] Lỗi:', e.message);
  process.exit(1);
});
