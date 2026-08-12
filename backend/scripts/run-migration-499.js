/**
 * Migration 499: Xóa nhiệm vụ chụp hình / nghiệm thu trên mọi deal CRM.
 * Usage: node scripts/run-migration-499.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '499_delete_crm_deal_photo_handover_tasks.sql'),
  'utf8',
);

const VERIFY_SQL = `
SELECT lower(trim(t.title)) AS title_norm, COUNT(*) AS cnt
FROM crm_tasks t
JOIN crm_leads cl ON cl.id = t.lead_id
WHERE cl.type = 'deal'
  AND lower(trim(t.title)) IN (
    'chụp hình nhận hàng tại xưởng',
    'chụp hình nhận hàng tại công trình',
    'nghiệm thu công trình',
    'chụp hình bàn giao công trình'
  )
GROUP BY 1
ORDER BY 1;
`;

const VERIFY_TEMPLATE_SQL = `
SELECT COUNT(*) AS template_items_left
FROM crm_task_template_items
WHERE lower(trim(title)) IN (
  'chụp hình nhận hàng tại xưởng',
  'chụp hình nhận hàng tại công trình',
  'nghiệm thu công trình',
  'chụp hình bàn giao công trình'
);
`;

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
  if (!TOKEN) throw new Error('Thiếu SUPABASE_ACCESS_TOKEN trong backend/.env');

  for (const [ref, label] of [[PRIMARY_REF, 'PRIMARY'], [BACKUP_REF, 'BACKUP']]) {
    console.log(`\n=== ${label} (${ref}) ===`);
    const before = await runQuery(ref, VERIFY_SQL, `${label}-before`);
    console.log('Before tasks:');
    console.table(before);

    await runQuery(ref, SQL, label);

    const after = await runQuery(ref, VERIFY_SQL, `${label}-after`);
    const templates = await runQuery(ref, VERIFY_TEMPLATE_SQL, `${label}-templates`);
    console.log('After tasks (expect empty):');
    console.table(after);
    console.log('Template items left:', templates);
  }
  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
