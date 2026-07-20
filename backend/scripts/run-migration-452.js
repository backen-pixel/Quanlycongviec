/**
 * Migration 452: VPT + Phúc Đạt — chỉ giữ chặn chuyển giai đoạn ở cột Đã khảo sát.
 * Usage: node scripts/run-migration-452.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '452_vpt_phucdat_blocks_only_surveyed_stage.sql'),
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
),
surveyed AS (
  SELECT ps.id
  FROM crm_pipeline_stages ps
  JOIN crm_pipelines p ON p.id = ps.pipeline_id
  WHERE p.company_id IN (SELECT id FROM cos)
    AND ps.name ILIKE '%đã khảo sát%'
)
SELECT c.name AS company,
  COUNT(*) FILTER (WHERE t.blocks_stage_advance AND t.pipeline_stage_id IN (SELECT id FROM surveyed)) AS blocks_on_surveyed,
  COUNT(*) FILTER (WHERE t.blocks_stage_advance AND (t.pipeline_stage_id IS NULL OR t.pipeline_stage_id NOT IN (SELECT id FROM surveyed))) AS blocks_elsewhere,
  COUNT(*) FILTER (WHERE tti.blocks_stage_advance AND tt.pipeline_stage_id IN (SELECT id FROM surveyed)) AS tpl_blocks_surveyed,
  COUNT(*) FILTER (WHERE tti.blocks_stage_advance AND tt.pipeline_stage_id NOT IN (SELECT id FROM surveyed)) AS tpl_blocks_elsewhere
FROM cos c
LEFT JOIN crm_leads l ON l.company_id = c.id
LEFT JOIN crm_tasks t ON t.lead_id = l.id AND COALESCE(t.status,'') <> 'cancelled'
LEFT JOIN crm_pipelines p ON p.company_id = c.id
LEFT JOIN crm_pipeline_stages ps ON ps.pipeline_id = p.id
LEFT JOIN crm_task_templates tt ON tt.pipeline_stage_id = ps.id
LEFT JOIN crm_task_template_items tti ON tti.template_id = tt.id
GROUP BY c.name
ORDER BY 1;
`;

  for (const target of [
    { ref: PRIMARY_REF, label: 'PRIMARY' },
    { ref: BACKUP_REF, label: 'BACKUP' },
  ]) {
    console.log(`\n========== ${target.label} ==========`);
    try {
      const result = await runQuery(target.ref, SQL, `${target.label}/452`);
      console.log('Migration 452 applied:', JSON.stringify(result).slice(0, 500));
      const verify = await runQuery(target.ref, verifySql, `${target.label}/verify`);
      console.log('Verify:', JSON.stringify(verify));
    } catch (e) {
      console.error(`FAIL ${target.label}:`, e.message);
      process.exitCode = 1;
    }
  }
}

main();
