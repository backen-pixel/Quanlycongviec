-- 406: Phúc Đạt — bỏ yêu cầu file/ghi chú khi hoàn thành cho TẤT CẢ nhiệm vụ
-- (áp dụng cho mẫu nhiệm vụ trong mọi pipeline stage + task đã sinh trên mọi deal của Phúc Đạt)

DO $$
DECLARE
  v_company_id UUID;
  v_tpl_count  INT;
  v_task_count INT;
BEGIN
  SELECT id INTO v_company_id
  FROM companies
  WHERE name ILIKE '%Phúc Đạt%' OR name ILIKE '%Phuc Dat%'
  ORDER BY CASE WHEN name ILIKE '%Phúc Đạt%' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE NOTICE '406: Không tìm thấy công ty Phúc Đạt — bỏ qua.';
    RETURN;
  END IF;

  -- Mẫu nhiệm vụ
  WITH upd AS (
    UPDATE crm_task_template_items tti
    SET completion_requires_file_or_note = false,
        required_evidence_file_types = '[]'::jsonb
    FROM crm_task_templates tt
    JOIN crm_pipeline_stages ps ON ps.id = tt.pipeline_stage_id
    JOIN crm_pipelines p ON p.id = ps.pipeline_id
    WHERE tti.template_id = tt.id
      AND p.company_id = v_company_id
      AND (tti.completion_requires_file_or_note = true
           OR COALESCE(jsonb_array_length(tti.required_evidence_file_types), 0) > 0)
    RETURNING tti.id
  )
  SELECT COUNT(*) INTO v_tpl_count FROM upd;

  -- Task đã sinh trên deal
  WITH upd AS (
    UPDATE crm_tasks t
    SET completion_requires_file_or_note = false,
        required_evidence_file_types = '[]'::jsonb
    FROM crm_leads l
    WHERE t.lead_id = l.id
      AND l.company_id = v_company_id
      AND (t.completion_requires_file_or_note = true
           OR COALESCE(jsonb_array_length(t.required_evidence_file_types), 0) > 0)
    RETURNING t.id
  )
  SELECT COUNT(*) INTO v_task_count FROM upd;

  RAISE NOTICE '406: Phúc Đạt (company %) — đã tắt minh chứng cho % mẫu và % task.',
    v_company_id, v_tpl_count, v_task_count;
END $$;
