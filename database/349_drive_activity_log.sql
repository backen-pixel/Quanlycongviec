-- 349_drive_activity_log.sql
-- Module Drive: nhật ký hoạt động (audit) — đồng thời dùng cho mục "Gần đây".
-- Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS drive_activity_log (
  id            BIGSERIAL PRIMARY KEY,
  actor_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  -- action: upload | download | open | rename | move | trash | restore | delete_forever
  --         | share | unshare | star | unstar | create_folder | create_root
  action        VARCHAR(32) NOT NULL,
  target_type   VARCHAR(16) NOT NULL CHECK (target_type IN ('folder','file','root')),
  target_id     UUID NOT NULL,
  target_name   TEXT,
  root_id       UUID REFERENCES drive_roots(id) ON DELETE CASCADE,
  meta          JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drive_activity_target
  ON drive_activity_log(target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_drive_activity_actor
  ON drive_activity_log(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_drive_activity_root
  ON drive_activity_log(root_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_drive_activity_action
  ON drive_activity_log(action, created_at DESC);

COMMENT ON TABLE drive_activity_log IS
  'Module Drive: nhật ký hoạt động phục vụ audit + mục "Gần đây".';

COMMIT;
