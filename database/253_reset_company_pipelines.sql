-- 253_reset_company_pipelines.sql
-- ⚠️  DỌN SẠCH PIPELINE — chạy 1 LẦN khi muốn cấu hình lại từ đầu.
--
-- Tác động:
--   1. Tất cả `projects.workshop_type_id` → NULL (deal đi vào nhóm «Chưa phân loại»)
--   2. XÓA mọi cột `production_pipeline_stages` thuộc công ty (company_id IS NOT NULL)
--      • Cột Global (company_id IS NULL) được GIỮ LẠI để fallback Kanban
--      • Phân loại (`workshop_project_types`) được GIỮ LẠI nguyên vẹn
--
-- Hệ quả tự động (qua FK):
--   • crm_leads.sx_pipeline_stage_id           → SET NULL
--   • tasks.production_stage_id                → SET NULL
--   • workshop_task_templates.production_stage_id → CASCADE (xóa template gắn cột vừa xóa)
--
-- Sau khi chạy:
--   • Dashboard SX hiển thị fallback 3 cột mặc định (workflow_stages: Sản xuất / Giao hàng / CSKH)
--   • Tất cả deal hiện tại nằm trong nhóm «Chưa phân loại» (workshop_type_id = NULL)
--   • Vào /sx/pipeline-settings → chọn công ty + phân loại → cấu hình lại từ đầu
--
-- Có thể chạy lại an toàn (idempotent).

BEGIN;

-- 1) Đưa toàn bộ deal về «Chưa phân loại»
UPDATE projects
   SET workshop_type_id = NULL
 WHERE workshop_type_id IS NOT NULL;

-- 2) Báo cáo trước khi xóa (chỉ ghi RAISE NOTICE — không ảnh hưởng)
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
    FROM production_pipeline_stages
   WHERE company_id IS NOT NULL;
  RAISE NOTICE 'Sẽ xóa % cột pipeline (company_id IS NOT NULL).', v_count;
END $$;

-- 3) Xóa cột pipeline scope theo công ty
DELETE FROM production_pipeline_stages
 WHERE company_id IS NOT NULL;

COMMIT;

-- ─── Báo cáo nhanh sau khi chạy ──────────────────────────────────────────
-- SELECT
--   (SELECT COUNT(*) FROM production_pipeline_stages WHERE company_id IS NULL)     AS cot_global_con_lai,
--   (SELECT COUNT(*) FROM production_pipeline_stages WHERE company_id IS NOT NULL) AS cot_cong_ty_con_lai,
--   (SELECT COUNT(*) FROM workshop_project_types)                                  AS phan_loai_con_lai,
--   (SELECT COUNT(*) FROM projects WHERE workshop_type_id IS NULL)                 AS deal_chua_phan_loai;
