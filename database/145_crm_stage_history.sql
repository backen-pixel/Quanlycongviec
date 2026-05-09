-- 145_crm_stage_history.sql
-- Lưu lịch sử chuyển stage cho từng lead/deal (ledger từng giai đoạn) — phục vụ tính KPI:
--   * Thời gian ở từng stage (time-in-stage)
--   * Tỷ lệ chuyển đổi stage-to-stage (Khảo sát→Báo giá, Báo giá→Ký HD, …)
--   * SLA breach theo stage
-- Trigger BEFORE UPDATE OF stage_id sẽ đóng record cũ và mở record mới.
-- Idempotent: an toàn để chạy lại.

BEGIN;

CREATE TABLE IF NOT EXISTS crm_lead_stage_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  pipeline_type TEXT,                 -- 'lead' | 'deal' tại thời điểm chuyển
  from_stage_id UUID REFERENCES crm_pipeline_stages(id) ON DELETE SET NULL,
  to_stage_id   UUID REFERENCES crm_pipeline_stages(id) ON DELETE SET NULL,
  from_canonical_slug TEXT,
  to_canonical_slug   TEXT,
  entered_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  exited_at   TIMESTAMPTZ,
  duration_seconds BIGINT,
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  crm_lead_stage_history IS 'Ledger từng lần đổi stage của crm_leads. Mỗi record = quãng thời gian lead ở 1 stage.';
COMMENT ON COLUMN crm_lead_stage_history.entered_at  IS 'Thời điểm vào stage (= stage_entered_at của record mới)';
COMMENT ON COLUMN crm_lead_stage_history.exited_at   IS 'Thời điểm rời stage (chỉ điền khi đã chuyển sang stage khác)';
COMMENT ON COLUMN crm_lead_stage_history.duration_seconds IS 'exited_at - entered_at, tính sẵn để query KPI nhanh';
COMMENT ON COLUMN crm_lead_stage_history.from_canonical_slug IS 'Snapshot canonical_slug của stage cũ (xem migration 146)';
COMMENT ON COLUMN crm_lead_stage_history.to_canonical_slug   IS 'Snapshot canonical_slug của stage mới';

CREATE INDEX IF NOT EXISTS idx_crm_lead_stage_history_lead_entered
  ON crm_lead_stage_history (lead_id, entered_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_lead_stage_history_to_slug
  ON crm_lead_stage_history (to_canonical_slug, entered_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_lead_stage_history_open
  ON crm_lead_stage_history (lead_id) WHERE exited_at IS NULL;

-- Trigger ghi log mỗi khi đổi stage_id ----------------------------------------
CREATE OR REPLACE FUNCTION fn_log_crm_lead_stage_change()
RETURNS TRIGGER AS $$
DECLARE
  v_from_slug TEXT;
  v_to_slug   TEXT;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  IF TG_OP = 'UPDATE' AND (OLD.stage_id IS NOT DISTINCT FROM NEW.stage_id) THEN
    RETURN NEW;
  END IF;

  -- Lấy canonical_slug nếu cột tồn tại (migration 146 sẽ thêm)
  BEGIN
    SELECT canonical_slug INTO v_from_slug FROM crm_pipeline_stages WHERE id = OLD.stage_id;
  EXCEPTION WHEN undefined_column THEN
    v_from_slug := NULL;
  END;
  BEGIN
    SELECT canonical_slug INTO v_to_slug FROM crm_pipeline_stages WHERE id = NEW.stage_id;
  EXCEPTION WHEN undefined_column THEN
    v_to_slug := NULL;
  END;

  -- Đóng record đang mở (nếu có)
  UPDATE crm_lead_stage_history
     SET exited_at = v_now,
         duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (v_now - entered_at))::BIGINT)
   WHERE lead_id = NEW.id AND exited_at IS NULL;

  -- Mở record mới
  INSERT INTO crm_lead_stage_history (
    lead_id, pipeline_type,
    from_stage_id, to_stage_id,
    from_canonical_slug, to_canonical_slug,
    entered_at, changed_by
  ) VALUES (
    NEW.id, NEW.type,
    OLD.stage_id, NEW.stage_id,
    v_from_slug, v_to_slug,
    v_now,
    COALESCE(NEW.lead_owner_id, NEW.assigned_to)
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_log_crm_lead_stage_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_to_slug TEXT;
BEGIN
  IF NEW.stage_id IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT canonical_slug INTO v_to_slug FROM crm_pipeline_stages WHERE id = NEW.stage_id;
  EXCEPTION WHEN undefined_column THEN
    v_to_slug := NULL;
  END;

  INSERT INTO crm_lead_stage_history (
    lead_id, pipeline_type, to_stage_id, to_canonical_slug,
    entered_at, changed_by
  ) VALUES (
    NEW.id, NEW.type, NEW.stage_id, v_to_slug,
    COALESCE(NEW.stage_entered_at, NEW.created_at, NOW()),
    COALESCE(NEW.lead_owner_id, NEW.assigned_to, NEW.created_by)
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_lead_stage_history_update ON crm_leads;
CREATE TRIGGER trg_crm_lead_stage_history_update
  AFTER UPDATE OF stage_id ON crm_leads
  FOR EACH ROW
  WHEN (OLD.stage_id IS DISTINCT FROM NEW.stage_id)
  EXECUTE FUNCTION fn_log_crm_lead_stage_change();

DROP TRIGGER IF EXISTS trg_crm_lead_stage_history_insert ON crm_leads;
CREATE TRIGGER trg_crm_lead_stage_history_insert
  AFTER INSERT ON crm_leads
  FOR EACH ROW
  EXECUTE FUNCTION fn_log_crm_lead_stage_insert();

-- Backfill record đầu cho mọi lead chưa có history -----------------------------
INSERT INTO crm_lead_stage_history (
  lead_id, pipeline_type, to_stage_id, entered_at, changed_by
)
SELECT l.id, l.type, l.stage_id,
       COALESCE(l.stage_entered_at, l.created_at, NOW()),
       COALESCE(l.lead_owner_id, l.assigned_to, l.created_by)
  FROM crm_leads l
  LEFT JOIN crm_lead_stage_history h ON h.lead_id = l.id
 WHERE h.id IS NULL
   AND l.stage_id IS NOT NULL;

COMMIT;
