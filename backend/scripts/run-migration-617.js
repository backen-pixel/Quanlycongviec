/**
 * 617: Phúc Đạt — thêm NV Vân vào deal đang ký HĐ trở đi.
 * Usage: node scripts/run-migration-617.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '617_phucdat_van_signed_deal_members.sql'),
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
  try { return JSON.parse(text); } catch { return text; }
}

const VERIFY_SQL = `
SELECT st.name AS stage_name, COUNT(*) AS deals_with_van
FROM crm_leads l
JOIN crm_pipeline_stages st ON st.id = l.stage_id
JOIN lead_members m ON m.lead_id = l.id AND m.user_id = '83c00741-0828-4e7f-b3bc-b2cfa8ccecc5'
WHERE l.company_id = '29677f68-967e-4256-92fd-492bb580e888'
  AND l.type = 'deal'
GROUP BY st.name, st.order_index
ORDER BY st.order_index;
`;

async function main() {
  if (!TOKEN) throw new Error('Thiếu SUPABASE_ACCESS_TOKEN');
  for (const [ref, label] of [[PRIMARY_REF, 'PRIMARY'], [BACKUP_REF, 'BACKUP']]) {
    console.log(`\n=== ${label} ===`);
    const out = await runQuery(ref, SQL, label);
    console.log(JSON.stringify(out, null, 2).slice(0, 1500));
    const rows = await runQuery(ref, VERIFY_SQL, `${label}-verify`);
    console.log(JSON.stringify(rows, null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
