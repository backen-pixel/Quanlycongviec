-- 146_crm_pipeline_stages_canonical_slug.sql
-- Thêm canonical_slug cho crm_pipeline_stages để KPI tính trên slug chuẩn (theo file Excel),
-- không phụ thuộc tên stage cụ thể của từng pipeline. Mọi pipeline (VPT, công ty mới…) chỉ cần
-- gắn slug đúng là KPI chạy được.
--
-- 15 slug chuẩn (xem KPI_CRM_SalesAdmin_Deal_TuBep.xlsx):
--   Lead:  lead_new, not_contacted, cold, warm, hot, survey_scheduled, survey_done
--   Deal:  designing, quoted, negotiating, waiting_deposit, contract_signed,
--          producing, installing, completed, lost
--
-- Idempotent.

BEGIN;

ALTER TABLE crm_pipeline_stages
  ADD COLUMN IF NOT EXISTS canonical_slug TEXT;

COMMENT ON COLUMN crm_pipeline_stages.canonical_slug IS
  'Slug chuẩn theo quy trình tủ bếp (Excel): lead_new, not_contacted, cold, warm, hot, survey_scheduled, survey_done, designing, quoted, negotiating, waiting_deposit, contract_signed, producing, installing, completed, lost';

-- Drop CHECK cũ (nếu có) rồi add lại để idempotent với danh sách mới
ALTER TABLE crm_pipeline_stages
  DROP CONSTRAINT IF EXISTS crm_pipeline_stages_canonical_slug_check;

ALTER TABLE crm_pipeline_stages
  ADD CONSTRAINT crm_pipeline_stages_canonical_slug_check
  CHECK (canonical_slug IS NULL OR canonical_slug IN (
    'lead_new','not_contacted','cold','warm','hot',
    'survey_scheduled','survey_done',
    'designing','quoted','negotiating','waiting_deposit','contract_signed',
    'producing','installing','completed','lost'
  ));

CREATE INDEX IF NOT EXISTS idx_crm_pipeline_stages_canonical_slug
  ON crm_pipeline_stages (canonical_slug)
  WHERE canonical_slug IS NOT NULL;

-- ─── Mapping pipeline VPT (`CRM — Bếp Vạn Phú Thành`) ────────────────────────
-- Map theo nội dung migration 125. Dùng UPDATE…WHERE pipeline_id thuộc pipeline VPT
-- nhưng cũng hỗ trợ trường hợp pipeline được clone sang công ty khác cùng tên stage.

DO $$
DECLARE
  v_pipeline_ids UUID[];
BEGIN
  SELECT ARRAY_AGG(p.id) INTO v_pipeline_ids
    FROM crm_pipelines p
   WHERE p.name ILIKE 'CRM — Bếp Vạn Phú Thành%'
      OR p.name ILIKE 'CRM - Bếp Vạn Phú Thành%';

  IF v_pipeline_ids IS NULL OR array_length(v_pipeline_ids, 1) = 0 THEN
    RAISE NOTICE '146: Không tìm thấy pipeline VPT, bỏ qua mapping mặc định.';
    RETURN;
  END IF;

  -- Lead pipeline (9 stage)
  UPDATE crm_pipeline_stages SET canonical_slug = 'lead_new'
   WHERE pipeline_id = ANY(v_pipeline_ids) AND pipeline_type = 'lead' AND name = 'TIẾP NHẬN';

  UPDATE crm_pipeline_stages SET canonical_slug = 'not_contacted'
   WHERE pipeline_id = ANY(v_pipeline_ids) AND pipeline_type = 'lead' AND name = 'LIÊN HỆ KHÔNG PHẢN HỒI';

  UPDATE crm_pipeline_stages SET canonical_slug = 'cold'
   WHERE pipeline_id = ANY(v_pipeline_ids) AND pipeline_type = 'lead' AND name = 'CHUẨN BỊ XÂY';

  UPDATE crm_pipeline_stages SET canonical_slug = 'warm'
   WHERE pipeline_id = ANY(v_pipeline_ids) AND pipeline_type = 'lead' AND name = 'GIAI ĐOẠN XÂY THÔ';

  UPDATE crm_pipeline_stages SET canonical_slug = 'hot'
   WHERE pipeline_id = ANY(v_pipeline_ids) AND pipeline_type = 'lead' AND name = 'NHÀ GẦN HOÀN THIỆN';

  UPDATE crm_pipeline_stages SET canonical_slug = 'survey_scheduled'
   WHERE pipeline_id = ANY(v_pipeline_ids) AND pipeline_type = 'lead'
     AND (name ILIKE 'ĐANG HẸN KHẢO SÁT%');

  UPDATE crm_pipeline_stages SET canonical_slug = 'survey_done'
   WHERE pipeline_id = ANY(v_pipeline_ids) AND pipeline_type = 'lead'
     AND (name ILIKE 'Gặp%SHOW%' OR name ILIKE '%SHOW ROOM%' OR name ILIKE '%Xưởng%');

  UPDATE crm_pipeline_stages SET canonical_slug = 'lost'
   WHERE pipeline_id = ANY(v_pipeline_ids) AND pipeline_type = 'lead'
     AND (name ILIKE '%KO TÌM NĂNG%' OR name ILIKE '%KHÔNG CÒN NHU CẦU%' OR is_lost = true);

  -- Deal pipeline (11 stage)
  UPDATE crm_pipeline_stages SET canonical_slug = 'designing'
   WHERE pipeline_id = ANY(v_pipeline_ids) AND pipeline_type = 'deal'
     AND name = 'ĐÃ KHẢO SÁT ĐANG BÁO GIÁ';

  UPDATE crm_pipeline_stages SET canonical_slug = 'quoted'
   WHERE pipeline_id = ANY(v_pipeline_ids) AND pipeline_type = 'deal'
     AND name = 'ĐÃ GỬI BÁO GIÁ KHÁCH HÀNG';

  UPDATE crm_pipeline_stages SET canonical_slug = 'negotiating'
   WHERE pipeline_id = ANY(v_pipeline_ids) AND pipeline_type = 'deal'
     AND name = 'THEO DÕI THÊM';

  UPDATE crm_pipeline_stages SET canonical_slug = 'lost'
   WHERE pipeline_id = ANY(v_pipeline_ids) AND pipeline_type = 'deal'
     AND (name = 'CHÊ GIÁ CAO' OR is_lost = true);

  UPDATE crm_pipeline_stages SET canonical_slug = 'waiting_deposit'
   WHERE pipeline_id = ANY(v_pipeline_ids) AND pipeline_type = 'deal'
     AND name IN ('CỌC RA NĂM LÀM', 'CỌC LÊN BẢN VẼ');

  UPDATE crm_pipeline_stages SET canonical_slug = 'contract_signed'
   WHERE pipeline_id = ANY(v_pipeline_ids) AND pipeline_type = 'deal'
     AND name = 'ĐÃ KÝ HỢP ĐỒNG';

  UPDATE crm_pipeline_stages SET canonical_slug = 'producing'
   WHERE pipeline_id = ANY(v_pipeline_ids) AND pipeline_type = 'deal'
     AND name = 'ĐANG SẢN XUẤT';

  UPDATE crm_pipeline_stages SET canonical_slug = 'installing'
   WHERE pipeline_id = ANY(v_pipeline_ids) AND pipeline_type = 'deal'
     AND name = 'ĐANG LẮP ĐẶT';

  UPDATE crm_pipeline_stages SET canonical_slug = 'completed'
   WHERE pipeline_id = ANY(v_pipeline_ids) AND pipeline_type = 'deal'
     AND name IN ('CÔNG NỢ', 'CHĂM SÓC KHÁCH HÀNG');

  RAISE NOTICE '146: Mapped canonical_slug cho % pipeline VPT.', array_length(v_pipeline_ids, 1);
END $$;

-- Backfill canonical_slug vào history records đã tạo bởi migration 145 ---------
UPDATE crm_lead_stage_history h
   SET to_canonical_slug = s.canonical_slug
  FROM crm_pipeline_stages s
 WHERE h.to_stage_id = s.id
   AND h.to_canonical_slug IS NULL
   AND s.canonical_slug IS NOT NULL;

UPDATE crm_lead_stage_history h
   SET from_canonical_slug = s.canonical_slug
  FROM crm_pipeline_stages s
 WHERE h.from_stage_id = s.id
   AND h.from_canonical_slug IS NULL
   AND s.canonical_slug IS NOT NULL;

COMMIT;
