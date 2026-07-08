-- 405: Phúc Đạt — bỏ yêu cầu file/ghi chú khi hoàn thành nhiệm vụ «Bản vẽ 2D» / «Bản vẽ 3D»
-- (mẫu + task đã sinh trên mọi deal)

DO $$
DECLARE
  v_company_id UUID;
BEGIN
  SELECT id INTO v_company_id
  FROM companies
  WHERE name ILIKE '%Phúc Đạt%' OR name ILIKE '%Phuc Dat%'
  ORDER BY CASE WHEN name ILIKE '%Phúc Đạt%' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE NOTICE '405: Không tìm thấy công ty Phúc Đạt — bỏ qua.';
    RETURN;
  END IF;

  UPDATE crm_task_template_items tti
  SET completion_requires_file_or_note = false,
      required_evidence_file_types = '[]'::jsonb
  FROM crm_task_templates tt
  JOIN crm_pipeline_stages ps ON ps.id = tt.pipeline_stage_id
  JOIN crm_pipelines p ON p.id = ps.pipeline_id
  WHERE tti.template_id = tt.id
    AND p.company_id = v_company_id
    AND TRIM(tti.title) IN ('Bản vẽ 2D', 'Bản vẽ 3D');

  UPDATE crm_tasks t
  SET completion_requires_file_or_note = false,
      required_evidence_file_types = '[]'::jsonb
  FROM crm_leads l
  WHERE t.lead_id = l.id
    AND l.company_id = v_company_id
    AND TRIM(t.title) IN ('Bản vẽ 2D', 'Bản vẽ 3D');

  RAISE NOTICE '405: Đã tắt minh chứng Bản vẽ 2D/3D cho Phúc Đạt (company %).', v_company_id;
END $$;
