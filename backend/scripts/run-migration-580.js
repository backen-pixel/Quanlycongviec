/** Migration 580: Standard Project change record contract. */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const token = process.env.SUPABASE_ACCESS_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'database', '580_project_change_record_contract.sql'), 'utf8');

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
  console.log(`Applying migration 580 to project ${projectRef}…`);
  await runQuery(projectRef, sql);
  const verification = await runQuery(projectRef, `
    select count(*)::int as contract_columns
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'project_incidents'
      and column_name in (
        'change_type', 'cause', 'phase_key', 'owner_user_id', 'cost_impact',
        'schedule_impact_days', 'cost_bearer', 'requires_approval', 'approval_status',
        'approval_notes', 'approved_by', 'approved_at', 'rejected_reason',
        'attachments', 'related_links'
      );
  `);
  const row = Array.isArray(verification) ? verification[0] : verification;
  if (Number(row?.contract_columns || 0) !== 15) {
    throw new Error(`Kiểm tra schema chưa đạt: ${JSON.stringify(verification)}`);
  }
  console.log('Migration 580 verified:', row);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
