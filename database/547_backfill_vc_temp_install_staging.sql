-- 547: Backfill dự án đã lập kế hoạch VC/LĐ vào cột «lắp đặt tạm»
--
-- Trường hợp: Sale đã chọn công ty VC + ngày lắp/lấy hàng trước khi công ty đó
-- có cột is_temp_install_staging → thẻ không vào cột tạm.
-- Chỉ kéo các dự án chưa bàn giao thật và đang orphan (không cột / cột global / CT khác).

DO $$
DECLARE
  v_updated INT := 0;
BEGIN
  WITH candidates AS (
    SELECT p.id AS project_id, temp.id AS temp_stage_id
    FROM projects p
    JOIN logistics_pipeline_stages temp
      ON temp.company_id = p.logistics_company_id
     AND temp.is_temp_install_staging = true
     AND COALESCE(temp.is_active, true) = true
    WHERE p.logistics_company_id IS NOT NULL
      AND (p.install_date IS NOT NULL OR p.pickup_at IS NOT NULL)
      AND COALESCE(p.vc_handover_status, '') NOT IN ('scheduled', 'confirmed', 'external')
      AND COALESCE(p.vc_temp_staged, false) = false
      AND (
        p.vc_kanban_column_id IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM logistics_pipeline_stages s
          WHERE s.id = p.vc_kanban_column_id
            AND s.company_id = p.logistics_company_id
            AND COALESCE(s.is_temp_install_staging, false) = false
        )
      )
  )
  UPDATE projects p
  SET vc_kanban_column_id = c.temp_stage_id,
      vc_temp_staged = true,
      updated_at = NOW()
  FROM candidates c
  WHERE p.id = c.project_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE '547: backfill % dự án vào cột lắp đặt tạm.', v_updated;
END $$;
