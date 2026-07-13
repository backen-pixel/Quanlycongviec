/**
 * Chạy migration 418 trên Primary + Backup.
 * Usage: node scripts/run-migration-418.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(path.join(__dirname, '..', '..', 'database', '418_phuc_dat_logistics_vc_ld_task_template.sql'), 'utf8');

const VERIFY_SQL = `
SELECT t.name, t.is_active, t.is_default, COUNT(i.id)::int AS items
FROM workshop_task_templates t
LEFT JOIN workshop_task_template_items i ON i.template_id = t.id
WHERE t.workshop_area = 'logistics'
  AND t.company_id = '29677f68-967e-4256-92fd-492bb580e888'
GROUP BY t.id, t.name, t.is_active, t.is_default, t.order_index
ORDER BY t.order_index;
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
  if (!TOKEN) {
    console.error('Thiếu SUPABASE_ACCESS_TOKEN trong backend/.env');
    process.exit(1);
  }
  for (const target of [
    { ref: PRIMARY_REF, label: 'PRIMARY' },
    { ref: BACKUP_REF, label: 'BACKUP' },
  ]) {
    console.log(`\n========== ${target.label} ==========`);
    await runQuery(target.ref, SQL, `${target.label}/418`);
    console.log('OK');
    const verify = await runQuery(target.ref, VERIFY_SQL, `${target.label} verify`);
    console.log('Verify:', JSON.stringify(verify, null, 2));
  }
  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
