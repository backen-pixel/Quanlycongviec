-- 407: Nhiệm vụ «Bản vẽ sản xuất» — checklist 5 mục + tự chia sẻ ghi chú/file sang SX
-- Áp dụng: Phúc Đạt, Vạn Phú Thành (và công ty clone pipeline tương tự nếu có mẫu trùng tên).

DO $$
DECLARE
  v_company RECORD;
  v_checklist JSONB := $json$[
    {
      "title": "ĐẦY ĐỦ FILE SKP",
      "required_evidence_file_types": ["sketchup"],
      "completion_requires_file_or_note": true,
      "shared_to_project": true,
      "allowed_share_modules": ["production"]
    },
    {
      "title": "MÔ TẢ EXCEL",
      "required_evidence_file_types": ["excel"],
      "completion_requires_file_or_note": true,
      "shared_to_project": true,
      "allowed_share_modules": ["production"]
    },
    {
      "title": "HÌNH 3D",
      "required_evidence_file_types": ["render", "image"],
      "completion_requires_file_or_note": true,
      "shared_to_project": true,
      "allowed_share_modules": ["production"]
    },
    {
      "title": "HÌNH THỰC TẾ",
      "required_evidence_file_types": ["image"],
      "completion_requires_file_or_note": true,
      "shared_to_project": true,
      "allowed_share_modules": ["production"]
    },
    {
      "title": "THÔNG TIN PHỤ KIỆN",
      "required_evidence_file_types": ["note", "excel", "document"],
      "completion_requires_file_or_note": true,
      "shared_to_project": true,
      "allowed_share_modules": ["production"]
    }
  ]$json$::jsonb;
  v_tpl_count INT := 0;
  v_task_count INT := 0;
BEGIN
  FOR v_company IN
    SELECT id, name FROM companies
    WHERE name ILIKE '%Phúc Đạt%' OR name ILIKE '%Phuc Dat%'
       OR name ILIKE '%Vạn Phú Thành%' OR name ILIKE '%Van Phu Thanh%'
       OR name ILIKE '%VPT%'
    ORDER BY name
  LOOP
  -- (A) Cập nhật mẫu CRM
    UPDATE crm_task_template_items tti
    SET checklist = v_checklist
    FROM crm_task_templates tt
    JOIN crm_pipeline_stages ps ON ps.id = tt.pipeline_stage_id
    JOIN crm_pipelines p ON p.id = ps.pipeline_id
    WHERE tti.template_id = tt.id
      AND p.company_id = v_company.id
      AND TRIM(tti.title) = 'Bản vẽ sản xuất';

    GET DIAGNOSTICS v_tpl_count = ROW_COUNT;

    -- (B) Gán checklist cho task đã sinh (chỉ khi checklist rỗng hoặc thiếu mục)
    UPDATE crm_tasks t
    SET checklist = v_checklist,
        updated_at = NOW()
    FROM crm_leads l
    WHERE t.lead_id = l.id
      AND l.company_id = v_company.id
      AND TRIM(t.title) = 'Bản vẽ sản xuất'
      AND (
        t.checklist IS NULL
        OR jsonb_array_length(COALESCE(t.checklist, '[]'::jsonb)) = 0
        OR NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(t.checklist, '[]'::jsonb)) ck
          WHERE UPPER(TRIM(ck->>'title')) = 'ĐẦY ĐỦ FILE SKP'
        )
      );

    GET DIAGNOSTICS v_task_count = ROW_COUNT;

    RAISE NOTICE '407 [%]: template %, tasks %', v_company.name, v_tpl_count, v_task_count;
  END LOOP;
END $$;
