-- 147_crm_leads_kpi_fields.sql
-- Bổ sung field phục vụ tính KPI Sales Admin / Deal cho ngành tủ bếp:
--   * first_touch_time          : thời điểm cham lead lần đầu (call/zalo/note…)
--   * lead_temperature          : Cold / Warm / Hot — auto từ expected_construction_time
--   * expected_construction_time: 3 mức (>2 tháng / 1-2 tháng / <1 tháng)
--   * info_complete             : computed boolean — KPI A3 "Lead đủ thông tin chuẩn"
-- Idempotent.

BEGIN;

ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS first_touch_time         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lead_temperature         TEXT,
  ADD COLUMN IF NOT EXISTS expected_construction_time TEXT;

COMMENT ON COLUMN crm_leads.first_touch_time IS
  'Thời điểm cham lead lần đầu (insert vào crm_activities hoặc voice_recordings). Phục vụ KPI A1/A2 (tốc độ phản hồi).';
COMMENT ON COLUMN crm_leads.lead_temperature IS
  'cold | warm | hot — auto theo expected_construction_time, hoặc set tay';
COMMENT ON COLUMN crm_leads.expected_construction_time IS
  'over_2m (>2 tháng) | 1_2m (1-2 tháng) | under_1m (<1 tháng)';

ALTER TABLE crm_leads
  DROP CONSTRAINT IF EXISTS crm_leads_lead_temperature_check;
ALTER TABLE crm_leads
  ADD CONSTRAINT crm_leads_lead_temperature_check
  CHECK (lead_temperature IS NULL OR lead_temperature IN ('cold','warm','hot'));

ALTER TABLE crm_leads
  DROP CONSTRAINT IF EXISTS crm_leads_expected_construction_time_check;
ALTER TABLE crm_leads
  ADD CONSTRAINT crm_leads_expected_construction_time_check
  CHECK (expected_construction_time IS NULL OR expected_construction_time IN ('over_2m','1_2m','under_1m'));

CREATE INDEX IF NOT EXISTS idx_crm_leads_first_touch_time
  ON crm_leads (first_touch_time)
  WHERE first_touch_time IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_leads_lead_temperature
  ON crm_leads (lead_temperature)
  WHERE lead_temperature IS NOT NULL;

-- info_complete: computed = STORED nếu Postgres hỗ trợ (>=12). Để tương thích, dùng VIEW phụ
-- + cột BOOLEAN nullable do trigger cập nhật. Ở đây dùng GENERATED…STORED.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'crm_leads' AND column_name = 'info_complete'
  ) THEN
    EXECUTE $sql$
      ALTER TABLE crm_leads
        ADD COLUMN info_complete BOOLEAN GENERATED ALWAYS AS (
          phone IS NOT NULL AND length(btrim(phone)) > 0
          AND customer_id IS NOT NULL
          AND region_id IS NOT NULL
          AND COALESCE(estimated_value, 0) > 0
          AND expected_construction_time IS NOT NULL
          AND install_address IS NOT NULL AND length(btrim(install_address)) > 0
        ) STORED
    $sql$;
  END IF;
END $$;

COMMENT ON COLUMN crm_leads.info_complete IS
  'TRUE khi đủ 6 field bắt buộc: phone, customer_id, region_id, estimated_value>0, expected_construction_time, install_address. Phục vụ KPI A3.';

CREATE INDEX IF NOT EXISTS idx_crm_leads_info_complete
  ON crm_leads (info_complete) WHERE info_complete = true;

-- ─── Trigger 1: auto map expected_construction_time → lead_temperature ────────
CREATE OR REPLACE FUNCTION fn_crm_lead_auto_temperature()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.expected_construction_time IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.lead_temperature IS NULL OR
     (TG_OP = 'UPDATE' AND OLD.expected_construction_time IS DISTINCT FROM NEW.expected_construction_time
                       AND OLD.lead_temperature = NEW.lead_temperature) THEN
    NEW.lead_temperature := CASE NEW.expected_construction_time
      WHEN 'over_2m'  THEN 'cold'
      WHEN '1_2m'     THEN 'warm'
      WHEN 'under_1m' THEN 'hot'
      ELSE NEW.lead_temperature
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_lead_auto_temperature_ins ON crm_leads;
DROP TRIGGER IF EXISTS trg_crm_lead_auto_temperature_upd ON crm_leads;
CREATE TRIGGER trg_crm_lead_auto_temperature_ins
  BEFORE INSERT ON crm_leads
  FOR EACH ROW EXECUTE FUNCTION fn_crm_lead_auto_temperature();
CREATE TRIGGER trg_crm_lead_auto_temperature_upd
  BEFORE UPDATE OF expected_construction_time ON crm_leads
  FOR EACH ROW EXECUTE FUNCTION fn_crm_lead_auto_temperature();

-- ─── Trigger 2: set first_touch_time khi có activity đầu tiên ─────────────────
CREATE OR REPLACE FUNCTION fn_crm_set_first_touch_time()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE crm_leads
     SET first_touch_time = COALESCE(NEW.activity_date, NEW.created_at, NOW())
   WHERE id = NEW.lead_id
     AND first_touch_time IS NULL
     AND COALESCE(NEW.type, '') NOT IN ('system', 'auto');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_activities_first_touch ON crm_activities;
CREATE TRIGGER trg_crm_activities_first_touch
  AFTER INSERT ON crm_activities
  FOR EACH ROW EXECUTE FUNCTION fn_crm_set_first_touch_time();

-- Hỗ trợ thêm voice_recordings (nếu có) — nguồn cham lead khác.
DO $$
BEGIN
  IF to_regclass('public.voice_recordings') IS NOT NULL THEN
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION fn_crm_set_first_touch_time_voice()
      RETURNS TRIGGER AS $body$
      BEGIN
        IF NEW.lead_id IS NULL THEN
          RETURN NEW;
        END IF;
        UPDATE crm_leads
           SET first_touch_time = COALESCE(NEW.created_at, NOW())
         WHERE id = NEW.lead_id AND first_touch_time IS NULL;
        RETURN NEW;
      END;
      $body$ LANGUAGE plpgsql;
    $sql$;

    -- Chỉ tạo trigger nếu voice_recordings có cột lead_id
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='voice_recordings' AND column_name='lead_id'
    ) THEN
      EXECUTE 'DROP TRIGGER IF EXISTS trg_voice_first_touch ON voice_recordings';
      EXECUTE 'CREATE TRIGGER trg_voice_first_touch AFTER INSERT ON voice_recordings FOR EACH ROW EXECUTE FUNCTION fn_crm_set_first_touch_time_voice()';
    END IF;
  END IF;
END $$;

-- ─── Backfill ────────────────────────────────────────────────────────────────
-- 1) Map temperature từ expected_construction_time có sẵn (nếu lead đã có)
UPDATE crm_leads
   SET lead_temperature = CASE expected_construction_time
     WHEN 'over_2m'  THEN 'cold'
     WHEN '1_2m'     THEN 'warm'
     WHEN 'under_1m' THEN 'hot'
   END
 WHERE expected_construction_time IS NOT NULL
   AND lead_temperature IS NULL;

-- 2) Backfill first_touch_time từ activity sớm nhất của lead
UPDATE crm_leads l
   SET first_touch_time = a.first_at
  FROM (
    SELECT lead_id, MIN(COALESCE(activity_date, created_at)) AS first_at
      FROM crm_activities
     WHERE lead_id IS NOT NULL
       AND COALESCE(type, '') NOT IN ('system', 'auto')
     GROUP BY lead_id
  ) a
 WHERE a.lead_id = l.id
   AND l.first_touch_time IS NULL;

COMMIT;
