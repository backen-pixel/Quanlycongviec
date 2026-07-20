-- 451: VPT + Phúc Đạt — bắt buộc minh chứng Hình ảnh cho NV «Hình ảnh thực tế»
-- (mẫu template + task đã sinh trên deal; không đụng task cancelled)

DO $$
DECLARE
  v_company_ids UUID[];
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
    RAISE NOTICE '451: Không tìm thấy VPT / Phúc Đạt — bỏ qua.';
    RETURN;
  END IF;

  UPDATE crm_task_template_items tti
  SET completion_requires_file_or_note = true,
      required_evidence_file_types = '["image"]'::jsonb
  FROM crm_task_templates tt
  JOIN crm_pipeline_stages ps ON ps.id = tt.pipeline_stage_id
  JOIN crm_pipelines p ON p.id = ps.pipeline_id
  WHERE tti.template_id = tt.id
    AND p.company_id = ANY (v_company_ids)
    AND LOWER(TRIM(tti.title)) = LOWER('Hình ảnh thực tế');

  GET DIAGNOSTICS v_tpl = ROW_COUNT;

  UPDATE crm_tasks t
  SET completion_requires_file_or_note = true,
      required_evidence_file_types = '["image"]'::jsonb
  FROM crm_leads l
  WHERE t.lead_id = l.id
    AND l.company_id = ANY (v_company_ids)
    AND LOWER(TRIM(t.title)) = LOWER('Hình ảnh thực tế')
    AND COALESCE(t.status, '') <> 'cancelled';

  GET DIAGNOSTICS v_tasks = ROW_COUNT;

  RAISE NOTICE '451: Đã bật minh chứng ảnh «Hình ảnh thực tế» — templates %, tasks %, companies %.',
    v_tpl, v_tasks, v_company_ids;
END $$;
