-- 459: Vạn Phú Thành — bỏ cột Lead «Gặp SHOW ROOM OR Xưởng»,
-- chuyển lead sang «CHUẨN BỊ XÂY» (3 khu vực: HCM / Cần Thơ / Q2).
-- Idempotent.

DO $$
DECLARE
  v_moved int := 0;
BEGIN
  -- HCM (pipeline chính)
  UPDATE crm_leads
  SET stage_id = '605981fd-ad3e-4d6e-aa41-ed13909e1724', -- CHUẨN BỊ XÂY
      stage_entered_at = NOW(),
      updated_at = NOW()
  WHERE stage_id = 'b37a6287-bc4c-461e-ac8f-1c6f8addff13'; -- Gặp SHOW ROOM OR Xưởng
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  UPDATE crm_task_templates
  SET pipeline_stage_id = '605981fd-ad3e-4d6e-aa41-ed13909e1724'
  WHERE pipeline_stage_id = 'b37a6287-bc4c-461e-ac8f-1c6f8addff13';

  -- Cần Thơ
  UPDATE crm_leads
  SET stage_id = '820643a6-a77b-4262-aec9-693f0ecef9eb',
      stage_entered_at = NOW(),
      updated_at = NOW()
  WHERE stage_id = 'e6d213e0-f392-4346-a48f-cc4c5e75912b';

  UPDATE crm_task_templates
  SET pipeline_stage_id = '820643a6-a77b-4262-aec9-693f0ecef9eb'
  WHERE pipeline_stage_id = 'e6d213e0-f392-4346-a48f-cc4c5e75912b';

  -- Q2
  UPDATE crm_leads
  SET stage_id = 'e4ad2f45-e6f8-4f35-92bb-3c026fd63027',
      stage_entered_at = NOW(),
      updated_at = NOW()
  WHERE stage_id = 'e5b08adf-a945-4684-b8fd-2e5d04f45f45';

  UPDATE crm_task_templates
  SET pipeline_stage_id = 'e4ad2f45-e6f8-4f35-92bb-3c026fd63027'
  WHERE pipeline_stage_id = 'e5b08adf-a945-4684-b8fd-2e5d04f45f45';

  DELETE FROM crm_pipeline_stages
  WHERE id IN (
    'b37a6287-bc4c-461e-ac8f-1c6f8addff13',
    'e6d213e0-f392-4346-a48f-cc4c5e75912b',
    'e5b08adf-a945-4684-b8fd-2e5d04f45f45'
  )
  AND name ILIKE '%SHOW%';

  RAISE NOTICE '459: VPT — đã chuyển lead từ Gặp SHOW ROOM → CHUẨN BỊ XÂY và xóa cột (HCM moved≈%).', v_moved;
END $$;
