/**
 * 616: HCB — cột pipeline Đóng gói cho Tủ bếp / Cửa / Cánh kính.
 * Usage: node scripts/run-migration-616.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '616_hcb_dong_goi_pipeline_column.sql'),
  'utf8',
).split('-- HOÀN TÁC:')[0];

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
SELECT wt.name AS loai, pps.name, pps.order_index, pps.group_key, pps.is_packaging_done
FROM production_pipeline_stages pps
JOIN companies c ON c.id = pps.company_id
JOIN workshop_project_types wt ON wt.id = pps.workshop_type_id
WHERE (c.short_name = 'HCB' OR c.name ILIKE '%Hucabi%')
  AND wt.name IN ('Tủ bếp', 'Cửa', 'Cánh kính')
  AND (
    pps.group_key = 'dong_goi'
    OR lower(trim(pps.name)) IN ('đóng gói', 'vệ sinh đóng gói', 'đơn hàng đã chuẩn bị xong')
  )
ORDER BY wt.name, pps.order_index, pps.name;
`;

async function main() {
  if (!TOKEN) throw new Error('Thiếu SUPABASE_ACCESS_TOKEN');
  for (const [ref, label] of [[PRIMARY_REF, 'PRIMARY'], [BACKUP_REF, 'BACKUP']]) {
    console.log(`\\n=== ${label} ===`);
    await runQuery(ref, SQL, label);
    const rows = await runQuery(ref, VERIFY_SQL, `${label}-verify`);
    console.log(JSON.stringify(rows, null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
