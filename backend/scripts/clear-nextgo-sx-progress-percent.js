/**
 * Xóa progress_percent trên cột pipeline SX NextGo (giống các công ty khác — không hiện thanh %).
 * Usage: node scripts/clear-nextgo-sx-progress-percent.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';

const SQL = `
UPDATE production_pipeline_stages p
SET progress_percent = NULL
FROM companies c
WHERE p.company_id = c.id
  AND (c.name ILIKE '%NextGo%' OR c.short_name ILIKE '%NextGo%')
  AND p.progress_percent IS NOT NULL;

SELECT p.name, p.progress_percent, p.order_index
FROM production_pipeline_stages p
JOIN companies c ON c.id = p.company_id
WHERE (c.name ILIKE '%NextGo%' OR c.short_name ILIKE '%NextGo%')
  AND p.is_active IS DISTINCT FROM false
ORDER BY p.order_index;
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
    console.error('Thiếu SUPABASE_ACCESS_TOKEN');
    process.exit(1);
  }
  for (const target of [
    { ref: PRIMARY_REF, label: 'PRIMARY' },
    { ref: BACKUP_REF, label: 'BACKUP' },
  ]) {
    console.log(`\n========== ${target.label} ==========`);
    try {
      const out = await runQuery(target.ref, SQL, target.label);
      console.log(JSON.stringify(out, null, 2));
    } catch (e) {
      console.error(`FAIL ${target.label}:`, e.message);
      process.exitCode = 1;
    }
  }
}

main();
