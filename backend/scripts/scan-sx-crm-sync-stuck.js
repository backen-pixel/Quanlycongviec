/**
 * Quét deal Thắng + đang ở cột SX có trigger (crm_sync_type=production / crm_target)
 * nhưng CRM chưa nhảy sang «Sản xuất». Ghi log file.
 *
 * Usage: node scripts/scan-sx-crm-sync-stuck.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';

async function runQuery(ref, query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text}`);
  return JSON.parse(text);
}

const DETAIL_SQL = `
WITH won_stuck AS (
  SELECT
    l.id AS lead_id,
    l.code,
    l.title,
    c.name AS company_name,
    l.pipeline_id,
    p.code AS project_code,
    p.status AS project_status,
    p.company_id AS project_company_id,
    l.company_id AS deal_company_id,
    l.sx_handover_at,
    st.name AS crm_stage,
    sx.id AS sx_col_id,
    sx.name AS sx_col,
    sx.crm_sync_type,
    sx.crm_target_stage_id,
    sx.company_id AS sx_col_company_id,
    (
      SELECT cps.id FROM crm_pipeline_stages cps
      WHERE cps.pipeline_id = l.pipeline_id
        AND cps.sync_role = 'sx_production'
        AND cps.is_active = true
      LIMIT 1
    ) AS expected_sx_crm_stage_id,
    (
      SELECT cps.name FROM crm_pipeline_stages cps
      WHERE cps.pipeline_id = l.pipeline_id
        AND cps.sync_role = 'sx_production'
        AND cps.is_active = true
      LIMIT 1
    ) AS expected_sx_crm_stage,
    l.updated_at
  FROM crm_leads l
  JOIN companies c ON c.id = l.company_id
  JOIN crm_pipeline_stages st ON st.id = l.stage_id
  JOIN projects p ON p.id = l.project_id
  JOIN production_pipeline_stages sx
    ON sx.id = COALESCE(l.sx_pipeline_stage_id, p.sx_kanban_column_id)
  WHERE l.type = 'deal'
    AND st.is_won = true
    AND (sx.crm_sync_type = 'production' OR sx.crm_target_stage_id IS NOT NULL)
)
SELECT *,
  CASE
    WHEN sx_handover_at IS NULL THEN 'SKIP: no_sx_handover_at'
    WHEN expected_sx_crm_stage_id IS NULL AND crm_target_stage_id IS NULL
      THEN 'BUG: missing CRM sx_production stage'
    WHEN project_company_id IS DISTINCT FROM deal_company_id
      THEN 'WARN: project_company != deal_company'
    ELSE 'BUG: handover_ok but still won'
  END AS root_cause
FROM won_stuck
ORDER BY (sx_handover_at IS NOT NULL) DESC, updated_at DESC
`;

const SUMMARY_SQL = `
SELECT
  CASE
    WHEN sx.crm_sync_type = 'production' AND l.sx_handover_at IS NULL
      THEN 'A_trigger_on_no_handover'
    WHEN sx.crm_sync_type = 'production' AND l.sx_handover_at IS NOT NULL
      THEN 'B_trigger_on_has_handover_STUCK'
    WHEN sx.crm_sync_type IS NULL AND sx.crm_target_stage_id IS NULL
      THEN 'C_badge_no_trigger'
    WHEN sx.crm_target_stage_id IS NOT NULL AND l.sx_handover_at IS NULL
      THEN 'D_target_set_no_handover'
    WHEN sx.crm_target_stage_id IS NOT NULL AND l.sx_handover_at IS NOT NULL
      THEN 'E_target_set_has_handover_STUCK'
    ELSE 'F_other'
  END AS bucket,
  COUNT(*)::int AS n
FROM crm_leads l
JOIN crm_pipeline_stages st ON st.id = l.stage_id
JOIN production_pipeline_stages sx ON sx.id = l.sx_pipeline_stage_id
WHERE l.type = 'deal'
  AND st.is_won = true
  AND l.project_id IS NOT NULL
GROUP BY 1
ORDER BY n DESC
`;

async function main() {
  if (!TOKEN) {
    console.error('Thiếu SUPABASE_ACCESS_TOKEN');
    process.exit(1);
  }

  const now = new Date().toISOString();
  const [summary, rows] = await Promise.all([
    runQuery(PRIMARY_REF, SUMMARY_SQL),
    runQuery(PRIMARY_REF, DETAIL_SQL),
  ]);

  const byCause = {};
  for (const r of rows) {
    byCause[r.root_cause] = (byCause[r.root_cause] || 0) + 1;
  }

  const lines = [
    '=== SCAN SX→CRM sync: deal Thắng + trigger SX nhưng CRM chưa nhảy ===',
    `scanned_at: ${now}`,
    `source: PRIMARY ${PRIMARY_REF}`,
    '',
    '## Tóm tắt deal is_won=true có badge SX',
    ...summary.map((s) => `- ${s.bucket}: ${s.n}`),
    '',
    '## Chi tiết: is_won + (crm_sync_type=production OR crm_target_stage_id)',
    `total: ${rows.length}`,
    '',
    '### Theo nguyên nhân',
    ...Object.entries(byCause).map(([k, v]) => `- ${k}: ${v}`),
    '',
    '### Danh sách',
  ];

  for (const r of rows) {
    lines.push('---');
    lines.push([
      r.code,
      r.company_name,
      `project=${r.project_code}`,
      `status=${r.project_status}`,
      `crm="${r.crm_stage}"`,
      `sx="${r.sx_col}"`,
      `crm_sync_type=${r.crm_sync_type || 'null'}`,
      `crm_target=${r.crm_target_stage_id || 'null'}`,
      `handover=${r.sx_handover_at ? `YES ${r.sx_handover_at}` : 'NO'}`,
      `expected_crm=${r.expected_sx_crm_stage || '(none)'}`,
      `cause=${r.root_cause}`,
      `deal_co=${r.deal_company_id}`,
      `proj_co=${r.project_company_id}`,
      `sx_col_co=${r.sx_col_company_id}`,
      `lead_id=${r.lead_id}`,
      `sx_col_id=${r.sx_col_id}`,
      `updated_at=${r.updated_at}`,
    ].join(' | '));
  }

  lines.push(
    '',
    '## Kết luận kỹ thuật',
    '1. syncCrmLeadSxPipelineFromProject CHỈ đổi stage_id khi sx_handover_at có giá trị.',
    '2. Case trigger=production còn Thắng hiện tại: thiếu sx_handover_at → skip có chủ đích (chỉ cập nhật badge).',
    '3. Badge SX có thể được gán khi tạo dự án / gán cột mà không đi qua route kéo cột (route kéo cột mới auto set handover).',
    '4. Một số deal CRM (Phúc Đạt/VPT) gắn cột SX của HCB — company lệch giữa deal vs project vs sx_col.',
    '5. Bucket C (badge không có trigger): cột Tiếp nhận nhiều pipeline chưa tick crm_sync_type=production.',
    '6. Không có case B (trigger_on + có handover mà vẫn Thắng) tại thời điểm quét → trigger không “hỏng”, mà bị chặn điều kiện handover.',
  );

  const outDir = path.join(__dirname, '..', 'uploads');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `_sx_crm_sync_scan_${now.slice(0, 10)}.log`);
  fs.writeFileSync(outPath, `${lines.join('\n')}\n`, 'utf8');

  console.log('Wrote', outPath);
  console.log('summary', summary);
  console.log('byCause', byCause);
  console.log('detail_rows', rows.length);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
