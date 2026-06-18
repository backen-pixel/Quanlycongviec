-- 361_facebook_auto_master_schedule.sql
-- Chu kỳ bật/tắt công tắc TỔNG tool Facebook auto + nhật ký thời gian từng phiên.
-- Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS facebook_auto_master_schedule (
  id                 SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled            BOOLEAN NOT NULL DEFAULT false,
  run_minutes        INT NOT NULL DEFAULT 60 CHECK (run_minutes >= 1 AND run_minutes <= 1440),
  rest_minutes       INT NOT NULL DEFAULT 30 CHECK (rest_minutes >= 1 AND rest_minutes <= 1440),
  phase              TEXT NOT NULL DEFAULT 'rest' CHECK (phase IN ('run', 'rest')),
  phase_started_at   TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE facebook_auto_master_schedule IS
  'Cấu hình chu kỳ công tắc TỔNG Facebook auto (singleton id=1): chạy run_minutes → nghỉ rest_minutes → lặp';

INSERT INTO facebook_auto_master_schedule (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS facebook_auto_master_schedule_logs (
  id                   BIGSERIAL PRIMARY KEY,
  action               TEXT NOT NULL CHECK (action IN ('on', 'off')),
  phase                TEXT NOT NULL CHECK (phase IN ('run', 'rest')),
  run_minutes          INT NOT NULL,
  rest_minutes         INT NOT NULL,
  master_enabled       BOOLEAN NOT NULL,
  phase_started_at     TIMESTAMPTZ,
  phase_ends_at        TIMESTAMPTZ,
  source               TEXT NOT NULL DEFAULT 'schedule',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fb_auto_master_schedule_logs_created
  ON facebook_auto_master_schedule_logs (created_at DESC);

COMMENT ON TABLE facebook_auto_master_schedule_logs IS
  'Nhật ký bật/tắt công tắc TỔNG theo chu kỳ — lưu thời điểm và thời lượng phiên';

-- Migrate từ app_settings (nếu có)
DO $$
DECLARE
  v JSONB;
BEGIN
  SELECT value INTO v FROM app_settings WHERE key = 'fb_master_schedule' LIMIT 1;
  IF v IS NOT NULL THEN
    UPDATE facebook_auto_master_schedule SET
      enabled = COALESCE((v->>'enabled')::boolean, false),
      run_minutes = GREATEST(1, LEAST(1440, COALESCE((v->>'run_minutes')::int, 60))),
      rest_minutes = GREATEST(1, LEAST(1440, COALESCE((v->>'rest_minutes')::int, 30))),
      phase = CASE WHEN v->>'phase' = 'run' THEN 'run' ELSE 'rest' END,
      phase_started_at = CASE
        WHEN v->>'phase_started_at' IS NOT NULL AND v->>'phase_started_at' <> ''
        THEN (v->>'phase_started_at')::timestamptz
        ELSE NULL
      END,
      updated_at = now()
    WHERE id = 1;
  END IF;
END $$;

ALTER TABLE facebook_auto_master_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE facebook_auto_master_schedule_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'facebook_auto_master_schedule'
      AND policyname = 'facebook_auto_master_schedule_all'
  ) THEN
    EXECUTE 'CREATE POLICY facebook_auto_master_schedule_all ON facebook_auto_master_schedule FOR ALL USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'facebook_auto_master_schedule_logs'
      AND policyname = 'facebook_auto_master_schedule_logs_all'
  ) THEN
    EXECUTE 'CREATE POLICY facebook_auto_master_schedule_logs_all ON facebook_auto_master_schedule_logs FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;

COMMIT;
