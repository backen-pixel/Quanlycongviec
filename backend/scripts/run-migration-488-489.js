/**
 * Migration 488: deadline bucket chỉ lấy NV cột hiện tại.
 * Migration 489: Phúc Đạt — xóa deadline Hot tạo sớm (gồm hạn 2/8).
 * Usage: node scripts/run-migration-488-489.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';

const SQL_488 = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '488_crm_deadline_current_stage_tasks.sql'),
  'utf8',
);
const SQL_489 = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '489_phuc_dat_clear_premature_hot_deadlines.sql'),
  'utf8',
);

async function runQuery(ref, query, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${label}] ${res.status}: ${text}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function main() {
  if (!TOKEN) {
    console.error('Thiếu SUPABASE_ACCESS_TOKEN trong backend/.env');
    process.exit(1);
  }

  const verifySql = `
SELECT
  CASE WHEN pg_get_functiondef(p.oid) LIKE '%pipeline_stage_id IS NULL OR t.pipeline_stage_id = s.stage_id%'
    THEN true ELSE false END AS has_current_stage_filter
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'crm_deadline_bucket_counts'
LIMIT 1;

SELECT i.title, i.deadline_days, i.deadline_hours, i.deadline_minutes
FROM crm_task_template_items i
JOIN crm_task_templates t ON t.id = i.template_id
WHERE t.pipeline_stage_id = '2ed1fd4e-cb9f-4d7b-9af0-9785c9d63700'
ORDER BY i.order_index;

SELECT
  COUNT(*) FILTER (
    WHERE t.deadline IS NOT NULL
      AND t.pipeline_stage_id = '2ed1fd4e-cb9f-4d7b-9af0-9785c9d63700'
      AND l.stage_id IS DISTINCT FROM '2ed1fd4e-cb9f-4d7b-9af0-9785c9d63700'
  ) AS premature_hot_deadlines,
  COUNT(*) FILTER (
    WHERE t.deadline IS NOT NULL
      AND (t.deadline AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = '2026-08-02'
  ) AS open_deadline_on_2_8
FROM crm_tasks t
JOIN crm_leads l ON l.id = t.lead_id
WHERE l.company_id = '29677f68-967e-4256-92fd-492bb580e888'
  AND COALESCE(t.status, '') NOT IN ('completed', 'done', 'cancelled', 'canceled');
`;

  for (const target of [
    { ref: PRIMARY_REF, label: 'PRIMARY' },
    { ref: BACKUP_REF, label: 'BACKUP' },
  ]) {
    console.log(`\n========== ${target.label} ==========`);
    try {
      const r488 = await runQuery(target.ref, SQL_488, `${target.label}/488`);
      console.log('Migration 488 applied:', JSON.stringify(r488).slice(0, 400));
      const r489 = await runQuery(target.ref, SQL_489, `${target.label}/489`);
      console.log('Migration 489 applied:', JSON.stringify(r489).slice(0, 400));
      const verify = await runQuery(target.ref, verifySql, `${target.label}/verify`);
      console.log('Verify:', JSON.stringify(verify, null, 2).slice(0, 2000));
    } catch (e) {
      console.error(`${target.label} failed:`, e.message);
      process.exitCode = 1;
    }
  }
}

main();
