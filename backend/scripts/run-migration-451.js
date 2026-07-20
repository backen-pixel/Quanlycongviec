/**
 * Migration 451: VPT + Phúc Đạt — bắt buộc minh chứng ảnh cho «Hình ảnh thực tế».
 * Usage: node scripts/run-migration-451.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '451_vpt_phucdat_hinh_anh_thuc_te_require_image.sql'),
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
WITH cos AS (
  SELECT id, name FROM companies
  WHERE id IN (
    '991dc79d-cbf5-49f9-a364-35227cb47635',
    '29677f68-967e-4256-92fd-492bb580e888'
  )
)
SELECT 'template' AS kind, c.name AS company,
  COUNT(*) AS n,
  COUNT(*) FILTER (WHERE i.completion_requires_file_or_note) AS req_note,
  COUNT(*) FILTER (WHERE i.required_evidence_file_types @> '["image"]'::jsonb) AS req_image
FROM cos c
JOIN crm_pipelines p ON p.company_id = c.id
JOIN crm_pipeline_stages s ON s.pipeline_id = p.id
JOIN crm_task_templates t ON t.pipeline_stage_id = s.id
JOIN crm_task_template_items i ON i.template_id = t.id
WHERE LOWER(TRIM(i.title)) = LOWER('Hình ảnh thực tế')
GROUP BY c.name
UNION ALL
SELECT 'task', c.name,
  COUNT(*),
  COUNT(*) FILTER (WHERE t.completion_requires_file_or_note),
  COUNT(*) FILTER (WHERE t.required_evidence_file_types @> '["image"]'::jsonb)
FROM cos c
JOIN crm_leads l ON l.company_id = c.id
JOIN crm_tasks t ON t.lead_id = l.id
WHERE LOWER(TRIM(t.title)) = LOWER('Hình ảnh thực tế')
  AND COALESCE(t.status, '') <> 'cancelled'
GROUP BY c.name
ORDER BY 1, 2;
`;

  for (const target of [
    { ref: PRIMARY_REF, label: 'PRIMARY' },
    { ref: BACKUP_REF, label: 'BACKUP' },
  ]) {
    console.log(`\n========== ${target.label} ==========`);
    try {
      const result = await runQuery(target.ref, SQL, `${target.label}/451`);
      console.log('Migration 451 applied:', JSON.stringify(result).slice(0, 400));
      const verify = await runQuery(target.ref, verifySql, `${target.label}/verify`);
      console.log('Verify:', JSON.stringify(verify));
    } catch (e) {
      console.error(`FAIL ${target.label}:`, e.message);
      process.exitCode = 1;
    }
  }
}

main();
