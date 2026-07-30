/**
 * Đặt hạn tư vấn trên bộ mẫu Global + Phúc Đạt + VPT:
 *  - Tư vấn lần 1: 5 phút
 *  - Tư vấn lần 2/3: 30 phút
 *  - COLD: 15 ngày
 *  - WARM: 7 ngày
 *  - HOT: 3 ngày
 *
 * Usage: node scripts/set-consulting-template-deadlines.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';

const SQL = `
WITH updated AS (
  UPDATE crm_task_template_items i
  SET
    deadline_days = CASE
      WHEN t.name IN ('Tư vấn', 'Bộ mẫu Tư vấn khách mới') THEN 0
      WHEN t.name IN ('COLD', 'Bộ mẫu Tư vấn khách Cold') THEN 15
      WHEN t.name IN ('WARM', 'Bộ mẫu Tư vấn khách Warm') THEN 7
      WHEN t.name IN ('HOT', 'Bộ mẫu Tư vấn khách Hot') THEN 3
      ELSE i.deadline_days
    END,
    deadline_hours = 0,
    deadline_minutes = CASE
      WHEN t.name IN ('Tư vấn', 'Bộ mẫu Tư vấn khách mới') AND i.title ILIKE '%lần 1%' THEN 5
      WHEN t.name IN ('Tư vấn', 'Bộ mẫu Tư vấn khách mới') AND (i.title ILIKE '%lần 2%' OR i.title ILIKE '%lần 3%') THEN 30
      ELSE 0
    END
  FROM crm_task_templates t
  LEFT JOIN crm_pipeline_stages s ON s.id = t.pipeline_stage_id
  LEFT JOIN crm_pipelines p ON p.id = s.pipeline_id
  WHERE i.template_id = t.id
    AND COALESCE(t.is_active, true)
    AND (
      t.pipeline_stage_id IS NULL
      OR p.company_id IN (
        '29677f68-967e-4256-92fd-492bb580e888',
        '991dc79d-cbf5-49f9-a364-35227cb47635'
      )
    )
    AND (
      t.name IN ('Tư vấn', 'COLD', 'WARM', 'HOT')
      OR t.name ILIKE 'Bộ mẫu Tư vấn khách%'
    )
  RETURNING t.name AS tpl, i.title, i.deadline_days, i.deadline_hours, i.deadline_minutes
)
SELECT tpl, title, deadline_days, deadline_hours, deadline_minutes, COUNT(*)::int AS n
FROM updated
GROUP BY 1, 2, 3, 4, 5
ORDER BY 1, 2;
`;

async function runQuery(ref, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ query: SQL }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${label}] ${res.status}: ${text}`);
  console.log(`\n========== ${label} ==========`);
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log(text);
  }
}

async function main() {
  if (!TOKEN) {
    console.error('Thiếu SUPABASE_ACCESS_TOKEN trong backend/.env');
    process.exit(1);
  }
  await runQuery(PRIMARY_REF, 'PRIMARY');
  await runQuery(BACKUP_REF, 'BACKUP');
  console.log('\n✅ Đã cập nhật hạn tư vấn trên bộ mẫu');
}

main().catch((e) => {
  console.error('❌', e.message || e);
  process.exit(1);
});
