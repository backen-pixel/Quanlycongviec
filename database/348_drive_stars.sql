-- 348_drive_stars.sql
-- Module Drive: đánh dấu sao theo từng user.
-- Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS drive_stars (
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type  VARCHAR(16) NOT NULL CHECK (target_type IN ('folder','file')),
  target_id    UUID NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_drive_stars_user ON drive_stars(user_id, created_at DESC);

COMMENT ON TABLE drive_stars IS
  'Module Drive: bookmark/sao đánh dấu file-folder theo user.';

COMMIT;
