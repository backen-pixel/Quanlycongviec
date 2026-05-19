-- 188_dedupe_deal_won_stages.sql
-- Gộp các cột deal trùng tên "Thắng" trên cùng một pipeline về một cột chính.
--
-- Tiêu chí cột chính (giữ lại):
--   1) is_won = TRUE
--   2) canonical_slug = 'contract_signed' (nếu có)
--   3) order_index nhỏ nhất
--
-- Cột dư:
--   - Chuyển toàn bộ crm_leads.stage_id sang cột chính
--   - Set is_active = FALSE (giữ lại để truy vết lịch sử KPI)
--   - Đổi tên kèm hậu tố "(trùng — đã gộp)" để admin nhận biết trong Settings

DO $$
DECLARE
  v_pipeline_id UUID;
  v_keep_id UUID;
  v_drop_ids UUID[];
BEGIN
  FOR v_pipeline_id IN
    SELECT s.pipeline_id
    FROM crm_pipeline_stages s
    WHERE s.pipeline_type = 'deal'
      AND s.is_active = TRUE
      AND lower(regexp_replace(s.name, '\s+', '', 'g')) IN ('thắng', 'thang', 'thắng.', 'thang.')
    GROUP BY s.pipeline_id
    HAVING COUNT(*) > 1
  LOOP
    -- Chọn cột chính: ưu tiên is_won=TRUE; nếu nhiều, lấy canonical_slug='contract_signed'; cuối cùng theo order_index
    SELECT id INTO v_keep_id
    FROM crm_pipeline_stages
    WHERE pipeline_id = v_pipeline_id
      AND pipeline_type = 'deal'
      AND lower(regexp_replace(name, '\s+', '', 'g')) IN ('thắng', 'thang', 'thắng.', 'thang.')
    ORDER BY
      is_won DESC,
      (canonical_slug = 'contract_signed') DESC,
      order_index ASC,
      created_at ASC
    LIMIT 1;

    -- Lấy các cột dư cần gộp
    SELECT ARRAY_AGG(id) INTO v_drop_ids
    FROM crm_pipeline_stages
    WHERE pipeline_id = v_pipeline_id
      AND pipeline_type = 'deal'
      AND lower(regexp_replace(name, '\s+', '', 'g')) IN ('thắng', 'thang', 'thắng.', 'thang.')
      AND id <> v_keep_id;

    IF v_drop_ids IS NULL OR array_length(v_drop_ids, 1) = 0 THEN
      CONTINUE;
    END IF;

    RAISE NOTICE '188: pipeline % giữ Thắng %, gộp %', v_pipeline_id, v_keep_id, v_drop_ids;

    -- Chuyển deal đang ở cột dư sang cột chính
    UPDATE crm_leads
    SET stage_id = v_keep_id,
        updated_at = NOW()
    WHERE stage_id = ANY(v_drop_ids);

    -- Đánh dấu cột dư: tắt, đổi tên để admin thấy ngay
    UPDATE crm_pipeline_stages
    SET is_active = FALSE,
        is_won = FALSE,
        name = name || ' (trùng — đã gộp)',
        updated_at = NOW()
    WHERE id = ANY(v_drop_ids);

    -- Đảm bảo cột chính giữ is_won=TRUE
    UPDATE crm_pipeline_stages
    SET is_won = TRUE,
        updated_at = NOW()
    WHERE id = v_keep_id;
  END LOOP;
END
$$;

-- Index hỗ trợ phát hiện trùng tên (không phải UNIQUE để không vỡ DB có history)
CREATE INDEX IF NOT EXISTS idx_crm_pipeline_stages_pipeline_name_active
  ON crm_pipeline_stages(pipeline_id, lower(name))
  WHERE is_active = TRUE;
