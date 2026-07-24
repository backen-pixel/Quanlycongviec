-- 463: Bảng tắt tạm thông báo bình luận theo từng deal/lead.
-- muted_until NULL = tắt đến khi người dùng mở lại thủ công.
-- muted_until = thời điểm hết hạn (1h/2h/3h/8h).

CREATE TABLE IF NOT EXISTS notification_mutes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type text NOT NULL DEFAULT 'lead',
  entity_id uuid NOT NULL,
  mute_scope text NOT NULL DEFAULT 'comment_added',
  muted_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, entity_type, entity_id, mute_scope)
);

CREATE INDEX IF NOT EXISTS idx_notification_mutes_user_scope
  ON notification_mutes (user_id, mute_scope, entity_id);

COMMENT ON TABLE notification_mutes IS 'Tắt tạm thông báo theo entity (vd: bình luận deal) trong khoảng thời gian hoặc đến khi mở lại';
COMMENT ON COLUMN notification_mutes.muted_until IS 'NULL = đến khi mở lại; ngược lại hết hạn sau thời điểm này';
