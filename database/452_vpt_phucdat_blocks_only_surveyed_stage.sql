-- 452: VPT + Phúc Đạt — chỉ giữ «chặn chuyển giai đoạn» ở cột Đã khảo sát
-- (tắt blocks_stage_advance ở các giai đoạn khác + task không gắn stage)

DO $$
DECLARE
  v_company_ids UUID[];
  v_surveyed_stage_ids UUID[];
  v_tpl INT;
  v_tasks INT;
BEGIN
  SELECT ARRAY_AGG(id) INTO v_company_ids
  FROM companies
  WHERE id IN (
      '991dc79d-cbf5-49f9-a364-35227cb47635', -- VPT
      '29677f68-967e-4256-92fd-492bb580e888'  -- Phúc Đạt
    )
     OR name ILIKE '%Vạn Phú Thành%'
     OR name ILIKE '%Phúc Đạt%'
     OR name ILIKE '%Phuc Dat%';

  IF v_company_ids IS NULL OR array_length(v_company_ids, 1) IS NULL THEN
    RAISE NOTICE '452: Không tìm thấy VPT / Phúc Đạt — bỏ qua.';
    RETURN;
  END IF;

  SELECT ARRAY_AGG(ps.id) INTO v_surveyed_stage_ids
  FROM crm_pipeline_stages ps
  JOIN crm_pipelines p ON p.id = ps.pipeline_id
  WHERE p.company_id = ANY (v_company_ids)
    AND ps.name ILIKE '%đã khảo sát%';

  IF v_surveyed_stage_ids IS NULL OR array_length(v_surveyed_stage_ids, 1) IS NULL THEN
    RAISE NOTICE '452: Không có cột Đã khảo sát — bỏ qua.';
    RETURN;
  END IF;

  -- Template items: tắt chặn nếu KHÔNG thuộc cột Đã khảo sát
  UPDATE crm_task_template_items tti
  SET blocks_stage_advance = false
  FROM crm_task_templates tt
  JOIN crm_pipeline_stages ps ON ps.id = tt.pipeline_stage_id
  JOIN crm_pipelines p ON p.id = ps.pipeline_id
  WHERE tti.template_id = tt.id
    AND p.company_id = ANY (v_company_ids)
    AND COALESCE(tti.blocks_stage_advance, false) = true
    AND NOT (tt.pipeline_stage_id = ANY (v_surveyed_stage_ids));

  GET DIAGNOSTICS v_tpl = ROW_COUNT;

  -- Tasks: tắt chặn nếu không gắn / không thuộc cột Đã khảo sát
  UPDATE crm_tasks t
  SET blocks_stage_advance = false
  FROM crm_leads l
  WHERE t.lead_id = l.id
    AND l.company_id = ANY (v_company_ids)
    AND COALESCE(t.blocks_stage_advance, false) = true
    AND COALESCE(t.status, '') <> 'cancelled'
    AND (
      t.pipeline_stage_id IS NULL
      OR NOT (t.pipeline_stage_id = ANY (v_surveyed_stage_ids))
    );

  GET DIAGNOSTICS v_tasks = ROW_COUNT;

  RAISE NOTICE '452: Tắt chặn ngoài Đã khảo sát — templates %, tasks %, surveyed_stages %, companies %.',
    v_tpl, v_tasks, v_surveyed_stage_ids, v_company_ids;
END $$;
