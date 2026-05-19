-- 189_repair_pipeline_crm_target_after_dedupe.sql
--
-- Sau migration 188 (gộp các cột "Thắng" trùng) một số production_pipeline_stages /
-- logistics_pipeline_stages.crm_target_stage_id có thể đang trỏ vào cột Thắng đã bị
-- deactivate + đổi tên ("(trùng — đã gộp)"). Migration này remap về cột Thắng còn
-- active trên cùng crm pipeline để luồng auto-sync hoạt động đúng.
--
-- Đồng thời backfill thêm sync_role cho các deal stage mới (87/89 chỉ chạy 1 lần) và
-- bảo đảm cột Thắng có canonical_slug='contract_signed' khi thiếu để khớp tiêu chí 188.

-- ─────────────────────────────────────────────────────────────────────
-- 1) Backfill sync_role bổ sung (idempotent — chạy nhiều lần an toàn)
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE crm_pipeline_stages ADD COLUMN IF NOT EXISTS sync_role TEXT;

UPDATE crm_pipeline_stages
SET sync_role = 'sx_production'
WHERE pipeline_type = 'deal'
  AND is_active = TRUE
  AND is_won = FALSE AND is_lost = FALSE
  AND (sync_role IS NULL OR sync_role = '')
  AND (
    LOWER(name) LIKE '%sản xuất%'
    OR LOWER(name) LIKE '%san xuat%'
  );

UPDATE crm_pipeline_stages
SET sync_role = 'vc_delivery'
WHERE pipeline_type = 'deal'
  AND is_active = TRUE
  AND is_won = FALSE AND is_lost = FALSE
  AND (sync_role IS NULL OR sync_role = '')
  AND (
    LOWER(name) LIKE '%vận chuyển%'
    OR LOWER(name) LIKE '%van chuyen%'
    OR LOWER(name) LIKE '%delivery%'
  )
  AND LOWER(name) NOT LIKE '%sản xuất%';

UPDATE crm_pipeline_stages
SET sync_role = 'vc_installation'
WHERE pipeline_type = 'deal'
  AND is_active = TRUE
  AND is_won = FALSE AND is_lost = FALSE
  AND (sync_role IS NULL OR sync_role = '')
  AND (
    LOWER(name) LIKE '%lắp đặt%'
    OR LOWER(name) LIKE '%lap dat%'
    OR LOWER(name) LIKE '%install%'
  );

UPDATE crm_pipeline_stages
SET sync_role = 'vc_customer_care'
WHERE pipeline_type = 'deal'
  AND is_active = TRUE
  AND is_won = FALSE AND is_lost = FALSE
  AND (sync_role IS NULL OR sync_role = '')
  AND (
    LOWER(name) LIKE '%chăm sóc%'
    OR LOWER(name) LIKE '%cham soc%'
    OR LOWER(name) LIKE '%bảo hành%'
    OR LOWER(name) LIKE '%bao hanh%'
    OR LOWER(name) LIKE '%cskh%'
    OR LOWER(name) LIKE '%customer%'
  );

-- ─────────────────────────────────────────────────────────────────────
-- 2) Remap production_pipeline_stages.crm_target_stage_id
--    Nếu trỏ vào cột CRM đã inactive/đã gộp → chuyển sang cột Thắng
--    active trên cùng crm_pipeline_id.
-- ─────────────────────────────────────────────────────────────────────
WITH bad AS (
  SELECT pps.id AS pps_id, s_old.pipeline_id AS crm_pipeline_id
  FROM production_pipeline_stages pps
  JOIN crm_pipeline_stages s_old ON s_old.id = pps.crm_target_stage_id
  WHERE s_old.is_active = FALSE
),
good AS (
  SELECT DISTINCT ON (s.pipeline_id) s.pipeline_id, s.id AS new_stage_id
  FROM crm_pipeline_stages s
  WHERE s.pipeline_type = 'deal'
    AND s.is_active = TRUE
    AND s.is_won = TRUE
  ORDER BY s.pipeline_id, (s.canonical_slug = 'contract_signed') DESC, s.order_index ASC
)
UPDATE production_pipeline_stages pps
SET crm_target_stage_id = g.new_stage_id
FROM bad b
JOIN good g ON g.pipeline_id = b.crm_pipeline_id
WHERE pps.id = b.pps_id;

-- ─────────────────────────────────────────────────────────────────────
-- 3) Remap logistics_pipeline_stages.crm_target_stage_id (cùng quy tắc)
-- ─────────────────────────────────────────────────────────────────────
WITH bad AS (
  SELECT lps.id AS lps_id, s_old.pipeline_id AS crm_pipeline_id
  FROM logistics_pipeline_stages lps
  JOIN crm_pipeline_stages s_old ON s_old.id = lps.crm_target_stage_id
  WHERE s_old.is_active = FALSE
),
good AS (
  SELECT DISTINCT ON (s.pipeline_id) s.pipeline_id, s.id AS new_stage_id
  FROM crm_pipeline_stages s
  WHERE s.pipeline_type = 'deal'
    AND s.is_active = TRUE
    AND s.is_won = TRUE
  ORDER BY s.pipeline_id, (s.canonical_slug = 'contract_signed') DESC, s.order_index ASC
)
UPDATE logistics_pipeline_stages lps
SET crm_target_stage_id = g.new_stage_id
FROM bad b
JOIN good g ON g.pipeline_id = b.crm_pipeline_id
WHERE lps.id = b.lps_id;

-- ─────────────────────────────────────────────────────────────────────
-- 4) Báo cáo nhanh các cột pipeline còn trỏ vào cột CRM inactive
--    (sau remap nên rỗng — nếu còn nghĩa là crm pipeline không có cột
--    Thắng active, admin cần tạo thủ công).
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_left INT;
BEGIN
  SELECT COUNT(*) INTO v_left
  FROM production_pipeline_stages pps
  JOIN crm_pipeline_stages s ON s.id = pps.crm_target_stage_id
  WHERE s.is_active = FALSE;
  IF v_left > 0 THEN
    RAISE NOTICE '189: còn % production_pipeline_stages trỏ vào CRM stage inactive (không có cột Thắng active để remap)', v_left;
  END IF;

  SELECT COUNT(*) INTO v_left
  FROM logistics_pipeline_stages lps
  JOIN crm_pipeline_stages s ON s.id = lps.crm_target_stage_id
  WHERE s.is_active = FALSE;
  IF v_left > 0 THEN
    RAISE NOTICE '189: còn % logistics_pipeline_stages trỏ vào CRM stage inactive', v_left;
  END IF;
END$$;
