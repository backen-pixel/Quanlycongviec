-- 461: VPT khu vực TP.HCM — hiện lại cột Lead «Gặp SHOW ROOM OR Xưởng»
-- và đưa lead đã chuyển sang CHUẨN BỊ XÂY bởi migration 459 về lại cột này.
-- Chỉ áp dụng pipeline HCM (không đụng Q2 / Cần Thơ).
-- Idempotent.

DO $$
DECLARE
  v_pipeline_id UUID := '78e6251c-aea1-46bc-a19f-a401f1de7f34'; -- CRM — Bếp Vạn Phú Thành (HCM)
  v_showroom_id UUID := 'b37a6287-bc4c-461e-ac8f-1c6f8addff13';
  v_cbx_id UUID := '605981fd-ad3e-4d6e-aa41-ed13909e1724'; -- CHUẨN BỊ XÂY
  v_moved int := 0;
  v_exists boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM crm_pipeline_stages WHERE id = v_showroom_id
  ) INTO v_exists;

  IF NOT v_exists THEN
    INSERT INTO crm_pipeline_stages (
      id, name, color, icon, order_index, pipeline_type, pipeline_id,
      is_won, is_lost, is_active, send_zalo_on_enter, canonical_slug
    ) VALUES (
      v_showroom_id,
      'Gặp SHOW ROOM OR Xưởng',
      '#D946EF',
      '🏪',
      8,
      'lead',
      v_pipeline_id,
      false,
      false,
      true,
      false,
      'survey_done'
    );
  ELSE
    UPDATE crm_pipeline_stages
    SET name = 'Gặp SHOW ROOM OR Xưởng',
        color = '#D946EF',
        icon = '🏪',
        order_index = 8,
        pipeline_type = 'lead',
        pipeline_id = v_pipeline_id,
        is_won = false,
        is_lost = false,
        is_active = true,
        canonical_slug = COALESCE(canonical_slug, 'survey_done')
    WHERE id = v_showroom_id;
  END IF;

  -- Lead HCM bị 459 chuyển showroom → CHUẨN BỊ XÂY (batch timestamp + from_stage null
  -- vì stage đã bị xóa / history mất FK) và vẫn đang ở CHUẨN BỊ XÂY.
  UPDATE crm_leads l
  SET stage_id = v_showroom_id,
      stage_entered_at = NOW(),
      updated_at = NOW()
  WHERE l.stage_id = v_cbx_id
    AND l.id IN (
      SELECT h.lead_id
      FROM crm_lead_stage_history h
      WHERE h.to_stage_id = v_cbx_id
        AND h.entered_at = '2026-07-21 09:33:25.733472+00'
        AND h.from_stage_id IS NULL
    );
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  RAISE NOTICE '461: VPT HCM — đã hiện lại Gặp SHOW ROOM OR Xưởng, chuyển lại % lead.', v_moved;
END $$;
