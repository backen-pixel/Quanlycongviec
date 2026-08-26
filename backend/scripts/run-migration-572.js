/** Migration 572: flexible Deal routing for customer-provided designs. */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const token = process.env.SUPABASE_ACCESS_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'database', '572_business_os_flexible_design_intake.sql'), 'utf8');

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
  console.log(`Applying migration 572 to project ${projectRef}…`);
  await runQuery(projectRef, sql);
  const verification = await runQuery(projectRef, `
    select
      exists (select 1 from information_schema.columns where table_schema='public' and table_name='business_os_process_instances' and column_name='workflow_path') as has_workflow_path,
      exists (select 1 from information_schema.columns where table_schema='public' and table_name='business_os_process_instances' and column_name='design_review_started_at') as has_review_started,
      exists (select 1 from information_schema.columns where table_schema='public' and table_name='business_os_process_instances' and column_name='design_review_completed_at') as has_review_completed;
  `);
  const row = Array.isArray(verification) ? verification[0] : verification;
  if (!row?.has_workflow_path || !row?.has_review_started || !row?.has_review_completed) {
    throw new Error(`Kiểm tra schema chưa đạt: ${JSON.stringify(verification)}`);
  }
  console.log('Migration 572 verified:', row);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
