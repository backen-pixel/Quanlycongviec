-- 244: Nhật ký audit chung (hành động quan trọng trên entity).
-- Bổ sung auth_event_log (đăng nhập) và user_activity_log (UI).

CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  company_id uuid,
  module text NOT NULL,
  entity_type text,
  entity_id uuid,
  action text NOT NULL,
  entity_label text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb,
  ip inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_user_idx ON audit_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_module_idx ON audit_log (module, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON audit_log (entity_type, entity_id);

COMMENT ON TABLE audit_log IS 'Audit trail: trash restore/purge, admin actions, …';
