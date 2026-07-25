/**
 * Migration 470: Pipeline VC/LĐ Phúc Đạt + bật «Chuyển LĐ» trên Giao hàng.
 * Usage: node scripts/run-migration-470.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '470_phuc_dat_vc_ld_handover_to_install.sql'),
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
SELECT name, order_index, bucket_slug, is_handover_to_install, is_active
FROM logistics_pipeline_stages
WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888'
  AND is_active = true
ORDER BY order_index, name;
`;

  for (const [label, ref] of [['PRIMARY', PRIMARY_REF], ['BACKUP', BACKUP_REF]]) {
    console.log(`\n=== ${label} (${ref}) ===`);
    await runQuery(ref, SQL, label);
    console.log(await runQuery(ref, verifySql, `${label}-verify`));
  }
  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
