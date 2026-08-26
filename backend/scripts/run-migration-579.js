/** Migration 579: Ensure Logistics Customer Care stage. */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const token = process.env.SUPABASE_ACCESS_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'database', '579_logistics_customer_care_stage.sql'), 'utf8');

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
  console.log(`Applying migration 579 to project ${projectRef}…`);
  await runQuery(projectRef, sql);
  const verification = await runQuery(projectRef, `
    select
      count(*)::int as active_customer_care_stages,
      count(distinct coalesce(company_id::text, '__global__'))::int as covered_scopes
    from logistics_pipeline_stages
    where is_active = true and crm_sync_type = 'customer_care';
  `);
  const row = Array.isArray(verification) ? verification[0] : verification;
  if (!row || Number(row.active_customer_care_stages || 0) < 1) {
    throw new Error(`Kiểm tra schema/config chưa đạt: ${JSON.stringify(verification)}`);
  }
  console.log('Migration 579 verified:', row);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
