-- 442: Metalla — bỏ hết hạn cột pipeline Sản xuất (sla_days = 0, không bắt buộc deadline thẻ).

BEGIN;

DO $$
DECLARE
  v_metalla UUID;
  n_updated INT := 0;
BEGIN
  SELECT id INTO v_metalla FROM companies
  WHERE id = 'b78baba2-2486-434c-a72d-9c937fac2164'
     OR name ILIKE '%Metall%' OR short_name ILIKE '%Metall%'
  ORDER BY CASE WHEN id = 'b78baba2-2486-434c-a72d-9c937fac2164' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_metalla IS NULL THEN
    RAISE NOTICE '442: Không tìm thấy công ty Metalla — bỏ qua.';
    RETURN;
  END IF;

  UPDATE production_pipeline_stages
  SET
    sla_days = 0,
    requires_deadline = false
  WHERE company_id = v_metalla
    AND (
      sla_days IS DISTINCT FROM 0
      OR COALESCE(requires_deadline, false) IS DISTINCT FROM false
    );

  GET DIAGNOSTICS n_updated = ROW_COUNT;

  -- Dọn deadline thẻ Kanban SX còn sót (nếu có)
  UPDATE projects
  SET
    sx_kanban_deadline_at = NULL,
    sx_kanban_deadline_reason = NULL
  WHERE company_id = v_metalla
    AND (sx_kanban_deadline_at IS NOT NULL OR NULLIF(trim(sx_kanban_deadline_reason), '') IS NOT NULL);

  RAISE NOTICE '442: Metalla=% | cột cập nhật sla/requires_deadline=%', v_metalla, n_updated;
END $$;

COMMIT;
