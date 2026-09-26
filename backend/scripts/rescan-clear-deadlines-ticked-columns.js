/**
 * Quét deal/dự án đang ở cột đã tích tắt hạn và xóa hạn còn sót.
 * CRM: counts_as_completed_revenue. SX: Tắt hạn hoặc VC/LĐ. VC: Tắt hạn hoặc Xong.
 * Usage: node scripts/rescan-clear-deadlines-ticked-columns.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';

const SQL = `
WITH sx_cols AS (
  SELECT id FROM production_pipeline_stages
  WHERE clears_deadline = true OR is_handover_to_logistics = true
),
vc_cols AS (
  SELECT id FROM logistics_pipeline_stages
  WHERE clears_deadline = true OR dashboard_kpi = 'completed'
),
crm_cols AS (
  SELECT id FROM crm_pipeline_stages WHERE counts_as_completed_revenue = true
),
sx_projects AS (
  SELECT p.id FROM projects p WHERE p.sx_kanban_column_id IN (SELECT id FROM sx_cols)
),
vc_projects AS (
  SELECT p.id FROM projects p WHERE p.vc_kanban_column_id IN (SELECT id FROM vc_cols)
),
crm_deals AS (
  SELECT l.id, l.project_id FROM crm_leads l
  WHERE l.type = 'deal' AND l.stage_id IN (SELECT id FROM crm_cols)
),
scope_projects AS (
  SELECT id FROM sx_projects
  UNION SELECT id FROM vc_projects
  UNION SELECT project_id FROM crm_deals WHERE project_id IS NOT NULL
),
scope_deals AS (
  SELECT id FROM crm_deals
  UNION
  SELECT l.id FROM crm_leads l
  WHERE l.type = 'deal' AND l.project_id IN (SELECT id FROM scope_projects)
),
upd_leads AS (
  UPDATE crm_leads l
  SET deadline_disabled_at = COALESCE(l.deadline_disabled_at, now()),
      deadline_disabled_reason = COALESCE(l.deadline_disabled_reason, 'Đã tắt deadline vì đang ở cột tích tắt hạn'),
      kanban_deadline_at = NULL,
      kanban_deadline_reason = 'Đã tắt deadline vì đang ở cột tích tắt hạn',
      updated_at = now()
  WHERE l.id IN (SELECT id FROM scope_deals)
    AND (l.deadline_disabled_at IS NULL OR l.kanban_deadline_at IS NOT NULL)
  RETURNING l.id
),
upd_tasks AS (
  UPDATE crm_tasks t
  SET deadline = NULL, updated_at = now()
  WHERE t.lead_id IN (SELECT id FROM scope_deals)
    AND t.deadline IS NOT NULL
    AND COALESCE(t.stage_slug, '') NOT LIKE 'sx_%'
    AND COALESCE(t.stage_slug, '') NOT LIKE 'vc_%'
    AND COALESCE(t.stage_slug, '') NOT LIKE 'ld_%'
  RETURNING t.id
),
upd_projects AS (
  UPDATE projects p
  SET sx_kanban_deadline_at = NULL,
      sx_kanban_deadline_reason = NULL,
      production_deadline = NULL,
      production_finish_date = NULL,
      deadline = NULL,
      updated_at = now()
  WHERE p.id IN (SELECT id FROM scope_projects)
    AND (
      p.sx_kanban_deadline_at IS NOT NULL
      OR p.production_deadline IS NOT NULL
      OR p.production_finish_date IS NOT NULL
      OR p.deadline IS NOT NULL
    )
  RETURNING p.id
)
SELECT
  (SELECT count(*) FROM scope_deals) AS deal_trong_pham_vi,
  (SELECT count(*) FROM scope_projects) AS du_an_trong_pham_vi,
  (SELECT count(*) FROM upd_leads) AS deal_da_tat,
  (SELECT count(*) FROM upd_tasks) AS nhiem_vu_da_xoa_han,
  (SELECT count(*) FROM upd_projects) AS du_an_da_xoa_han;
`;

async function main() {
  if (!TOKEN) throw new Error('Thiếu SUPABASE_ACCESS_TOKEN');
  const res = await fetch(`https://api.supabase.com/v1/projects/${PRIMARY_REF}/database/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ query: SQL }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text}`);
  console.log(text);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
