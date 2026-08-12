/**
 * Clear crm_sync_type (Trigger VC/LĐ/CSKH) on logistics pipeline stages.
 * Usage: node scripts/run-clear-vc-triggers.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';

const SQL = `
UPDATE logistics_pipeline_stages
SET crm_sync_type = NULL
WHERE crm_sync_type IS NOT NULL;

SELECT company_id::text, name, crm_sync_type, bucket_slug, is_active
FROM logistics_pipeline_stages
WHERE is_active
ORDER BY company_id NULLS FIRST, order_index;
`;

async function runQuery(ref, query, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${label}] ${res.status}: ${text}`);
  try { return JSON.parse(text); } catch { return text; }
}

async function main() {
  if (!TOKEN) throw new Error('Thiếu SUPABASE_ACCESS_TOKEN');
  for (const [ref, label] of [[PRIMARY_REF, 'PRIMARY'], [BACKUP_REF, 'BACKUP']]) {
    console.log(`\n=== ${label} ===`);
    const rows = await runQuery(ref, SQL, label);
    console.table(Array.isArray(rows) ? rows : []);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
