-- 548: Remap dự án VPT đang trỏ cột VC global → cột cùng bucket/name của pipeline VPT
-- Tránh thẻ «orphan» bị đổ nhầm vào cột đầu (Dự án sắp tới) trên board theo công ty.

DO $$
DECLARE
  v_vpt UUID := '991dc79d-cbf5-49f9-a364-35227cb47635';
  v_updated INT := 0;
BEGIN
  SELECT id INTO v_vpt
  FROM companies
  WHERE id = '991dc79d-cbf5-49f9-a364-35227cb47635'
     OR name ILIKE '%Vạn Phú Thành%'
     OR short_name ILIKE 'VPT'
  ORDER BY CASE WHEN id = '991dc79d-cbf5-49f9-a364-35227cb47635' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_vpt IS NULL THEN
    RAISE NOTICE '548: Không tìm thấy VPT — bỏ qua.';
    RETURN;
  END IF;

  WITH mapped AS (
    SELECT
      p.id AS project_id,
      COALESCE(
        (
          SELECT s2.id
          FROM logistics_pipeline_stages s2
          WHERE s2.company_id = p.logistics_company_id
            AND s.bucket_slug IS NOT NULL
            AND s2.bucket_slug = s.bucket_slug
            AND COALESCE(s2.is_active, true) = true
          ORDER BY s2.order_index
          LIMIT 1
        ),
        (
          SELECT s2.id
          FROM logistics_pipeline_stages s2
          WHERE s2.company_id = p.logistics_company_id
            AND lower(trim(s2.name)) = lower(trim(s.name))
            AND COALESCE(s2.is_active, true) = true
          ORDER BY s2.order_index
          LIMIT 1
        ),
        (
          SELECT s2.id
          FROM logistics_pipeline_stages s2
          WHERE s2.company_id = p.logistics_company_id
            AND s2.bucket_slug = 'delivery_pending'
            AND COALESCE(s2.is_active, true) = true
          ORDER BY s2.order_index
          LIMIT 1
        )
      ) AS new_stage_id
    FROM projects p
    JOIN logistics_pipeline_stages s ON s.id = p.vc_kanban_column_id
    WHERE p.logistics_company_id = v_vpt
      AND s.company_id IS NULL
      AND COALESCE(p.vc_temp_staged, false) = false
  )
  UPDATE projects p
  SET vc_kanban_column_id = m.new_stage_id,
      updated_at = NOW()
  FROM mapped m
  WHERE p.id = m.project_id
    AND m.new_stage_id IS NOT NULL
    AND m.new_stage_id IS DISTINCT FROM p.vc_kanban_column_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE '548: remap % dự án VPT từ cột global → cột công ty.', v_updated;
END $$;
