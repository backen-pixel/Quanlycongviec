-- 482: Nhiệm vụ «Hình ảnh thực tế» đã sinh trên deal không còn chặn chuyển giai đoạn.
-- Chỉ cập nhật task hiện có; không thay đổi bộ mẫu dùng cho deal tạo mới.

DO $$
DECLARE
  v_tasks INT;
BEGIN
  UPDATE crm_tasks t
  SET blocks_stage_advance = false,
      completion_requires_file_or_note = false,
      required_evidence_file_types = '[]'::jsonb,
      requires_quick_verdict = false
  FROM crm_leads l
  WHERE t.lead_id = l.id
    AND l.type = 'deal'
    AND LOWER(TRIM(t.title)) = LOWER('Hình ảnh thực tế')
    AND (
      COALESCE(t.blocks_stage_advance, false)
      OR COALESCE(t.completion_requires_file_or_note, false)
      OR COALESCE(t.required_evidence_file_types, '[]'::jsonb) <> '[]'::jsonb
      OR COALESCE(t.requires_quick_verdict, false)
    );

  GET DIAGNOSTICS v_tasks = ROW_COUNT;
  RAISE NOTICE '482: Đã bỏ toàn bộ chặn trên % nhiệm vụ «Hình ảnh thực tế» của deal hiện có.', v_tasks;
END $$;
