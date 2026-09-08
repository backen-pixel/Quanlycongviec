/**
 * Migration 576: Trương Trọng Thành → mọi dự án Phúc Đạt + VPT.
 * Usage: node scripts/run-migration-576.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '576_truong_trong_thanh_phucdat_vpt_projects.sql'),
  'utf8',
);

const PD = '29677f68-967e-4256-92fd-492bb580e888';
const VPT = '991dc79d-cbf5-49f9-a364-35227cb47635';
const USER = '646e364e-504d-4362-af1a-4f4694b0d05d';

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
SELECT u.email, u.full_name,
  (SELECT COUNT(*) FROM project_production_staff s
    WHERE s.user_id = u.id
      AND s.project_id IN (
        SELECT p.id FROM projects p
        WHERE p.company_id IN ('${PD}','${VPT}')
           OR p.logistics_company_id IN ('${PD}','${VPT}')
        UNION
        SELECT l.project_id FROM crm_leads l
        WHERE l.company_id IN ('${PD}','${VPT}') AND l.type = 'deal' AND l.project_id IS NOT NULL
      )) AS pd_vpt_staff,
  (SELECT COUNT(*) FROM lead_members lm
    JOIN crm_leads l ON l.id = lm.lead_id
    WHERE lm.user_id = u.id AND l.company_id IN ('${PD}','${VPT}') AND l.type = 'deal') AS pd_vpt_deal_members,
  (SELECT COUNT(*) FROM production_workshop_type_default_staff d
    WHERE d.user_id = u.id AND d.production_company_id IN ('${PD}','${VPT}')) AS default_types
FROM users u
WHERE u.id = '${USER}'
   OR lower(trim(u.email)) = 'trongthanh0800@gmail.com';
`;

async function main() {
  if (!TOKEN) throw new Error('Thiếu SUPABASE_ACCESS_TOKEN');
  for (const [ref, label] of [[PRIMARY_REF, 'PRIMARY'], [BACKUP_REF, 'BACKUP']]) {
    console.log(`\n=== ${label} ===`);
    const run = await runQuery(ref, SQL, label);
    console.log('run:', typeof run === 'string' ? run.slice(0, 400) : JSON.stringify(run).slice(0, 400));
    const rows = await runQuery(ref, VERIFY_SQL, `${label}-verify`);
    console.log(JSON.stringify(rows, null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
