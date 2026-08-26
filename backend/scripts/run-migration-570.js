/**
 * Migration 570: Qualification task template + SLA escalation.
 * Usage: npm run db:migrate:570
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const token = process.env.SUPABASE_ACCESS_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
const sql = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '570_business_os_qualification_automation.sql'),
  'utf8',
);

function projectRefFromUrl(value) {
  try {
    const host = new URL(value).hostname;
    return host.endsWith('.supabase.co') ? host.split('.')[0] : '';
  } catch {
    return '';
  }
}

async function runQuery(projectRef, query) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`${response.status}: ${body}`);
  try { return JSON.parse(body); } catch { return body; }
}

async function main() {
  const projectRef = process.env.PRIMARY_PROJECT_REF || projectRefFromUrl(supabaseUrl);
  if (!token) throw new Error('Thiếu SUPABASE_ACCESS_TOKEN trong backend/.env');
  if (!projectRef) throw new Error('Không xác định được Supabase project ref từ SUPABASE_URL.');
  console.log(`Applying migration 570 to project ${projectRef}…`);
  await runQuery(projectRef, sql);
  const verification = await runQuery(projectRef, `
    select
      to_regclass('public.business_os_stage_automations') is not null as has_automations,
      to_regclass('public.business_os_stage_task_template_items') is not null as has_task_items,
      to_regclass('public.business_os_stage_automation_versions') is not null as has_versions,
      to_regclass('public.business_os_sla_escalations') is not null as has_escalations,
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'crm_tasks'
          and column_name = 'business_os_template_item_key'
      ) as has_task_trace;
  `);
  const row = Array.isArray(verification) ? verification[0] : verification;
  if (!row?.has_automations || !row?.has_task_items || !row?.has_versions
    || !row?.has_escalations || !row?.has_task_trace) {
    throw new Error(`Kiểm tra schema chưa đạt: ${JSON.stringify(verification)}`);
  }
  console.log('Migration 570 verified:', row);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
