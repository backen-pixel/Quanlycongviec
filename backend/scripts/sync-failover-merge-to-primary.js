#!/usr/bin/env node
/**
 * Merge dữ liệu Backup → Primary sau failover (chỉ row Backup mới hơn hoặc trong cửa sổ thời gian).
 *
 * Usage:
 *   node scripts/sync-failover-merge-to-primary.js
 *   node scripts/sync-failover-merge-to-primary.js --since 2026-06-29T03:05:00Z --until 2026-06-29T03:47:00Z
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { createClient } = require('@supabase/supabase-js');

const DEFAULT_SINCE = '2026-06-29T03:05:00.000Z';
const DEFAULT_UNTIL = '2026-06-29T03:47:00.000Z';

const TABLE_SPECS = [
  { table: 'projects', tsCol: 'updated_at', omit: [] },
  { table: 'crm_leads', tsCol: 'updated_at', omit: ['weighted_value', 'info_complete'] },
  { table: 'crm_lead_stage_history', tsCol: 'created_at', omit: [] },
  { table: 'project_production_staff', tsCol: 'created_at', omit: [], onConflict: 'project_id,user_id' },
  { table: 'notifications', tsCol: 'created_at', omit: [] },
];

function parseArgs() {
  const sinceIdx = process.argv.indexOf('--since');
  const untilIdx = process.argv.indexOf('--until');
  return {
    since: sinceIdx >= 0 ? process.argv[sinceIdx + 1] : DEFAULT_SINCE,
    until: untilIdx >= 0 ? process.argv[untilIdx + 1] : DEFAULT_UNTIL,
  };
}

function buildClient(url, key, label) {
  if (!url || !key) throw new Error(`Thiếu env ${label}`);
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function fetchAllRows(client, table, tsCol, since, until) {
  const pageSize = 500;
  let from = 0;
  const out = [];
  for (;;) {
    const { data, error } = await client
      .from(table)
      .select('*')
      .gte(tsCol, since)
      .lte(tsCol, until)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`${table} fetch: ${error.message}`);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

async function getPrimaryTs(client, table, id, tsCol) {
  const { data, error } = await client
    .from(table)
    .select(`id, ${tsCol}`)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`${table} primary lookup ${id}: ${error.message}`);
  return data;
}

function isNewer(backupTs, primaryTs) {
  if (!primaryTs) return true;
  return new Date(backupTs).getTime() > new Date(primaryTs).getTime();
}

function stripRow(row, omit = []) {
  if (!omit?.length) return row;
  const out = { ...row };
  for (const k of omit) delete out[k];
  return out;
}

async function upsertRows(primary, table, rows, { omit = [], onConflict = 'id' } = {}) {
  const batch = 50;
  for (let i = 0; i < rows.length; i += batch) {
    const chunk = rows.slice(i, i + batch).map((r) => stripRow(r, omit));
    const { error } = await primary.from(table).upsert(chunk, { onConflict });
    if (error) throw new Error(`${table} upsert: ${error.message}`);
  }
}

async function mergeTable(primary, backup, spec, since, until) {
  const { table, tsCol } = spec;
  console.log(`\n[merge] ${table} (${tsCol} ${since} → ${until})…`);
  const backupRows = await fetchAllRows(backup, table, tsCol, since, until);
  console.log(`[merge] ${table}: ${backupRows.length} row trên Backup trong cửa sổ`);
  if (!backupRows.length) return { table, scanned: 0, merged: 0 };

  const toMerge = [];
  for (const row of backupRows) {
    const pri = await getPrimaryTs(primary, table, row.id, tsCol);
    if (isNewer(row[tsCol], pri?.[tsCol])) toMerge.push(row);
  }
  console.log(`[merge] ${table}: ${toMerge.length} row cần ghi lên Primary`);
  if (toMerge.length) {
    await upsertRows(primary, table, toMerge, {
      omit: spec.omit,
      onConflict: spec.onConflict || 'id',
    });
  }
  return { table, scanned: backupRows.length, merged: toMerge.length };
}

async function main() {
  const { since, until } = parseArgs();
  const primary = buildClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    'SUPABASE_URL / SERVICE_ROLE',
  );
  const backup = buildClient(
    process.env.SUPABASE_BACKUP_URL,
    process.env.SUPABASE_BACKUP_SERVICE_ROLE_KEY,
    'SUPABASE_BACKUP_URL / BACKUP_SERVICE_ROLE',
  );

  console.log('[merge] Backup → Primary');
  console.log('[merge] Cửa sổ:', since, '→', until);

  const summary = [];
  for (const spec of TABLE_SPECS) {
    summary.push(await mergeTable(primary, backup, spec, since, until));
  }

  console.log('\n[merge] Hoàn tất:');
  for (const s of summary) {
    console.log(`  ${s.table}: ${s.merged}/${s.scanned} row merged`);
  }
}

main().catch((e) => {
  console.error('[merge] Lỗi:', e.message);
  process.exit(1);
});
