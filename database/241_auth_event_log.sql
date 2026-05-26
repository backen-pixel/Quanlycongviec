-- 241_auth_event_log.sql
-- Ghi nhận chi tiết các sự kiện xác thực: login_success, login_failed, logout, auto_logout_midnight,
-- session_expired, token_invalid… Mỗi event có timestamp đến mili-giây + IP + User-Agent + device hint.
--
-- Mục đích:
--   • Audit bảo mật: ai đăng nhập lúc nào, từ thiết bị nào.
--   • Hỗ trợ AI báo cáo: "Hôm nay X đăng nhập lúc 8:01:35 từ Hà Nội, đăng xuất lúc 17:42:08".
--   • Đếm số phiên / thời lượng phiên trung bình.
--
-- Idempotent — chạy lại an toàn.

BEGIN;

CREATE TABLE IF NOT EXISTS auth_event_log (
  id           BIGSERIAL PRIMARY KEY,

  -- Người dùng (NULL nếu login_failed vì email không tồn tại)
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  email        TEXT,                       -- email nhập (kể cả khi sai)

  -- Loại event chuẩn (mở rộng dễ thêm)
  event        TEXT NOT NULL CHECK (event IN (
    'login_success',
    'login_failed',
    'logout',
    'auto_logout_midnight',
    'session_expired',
    'token_invalid',
    'password_changed'
  )),
  reason       TEXT,                       -- 'wrong_password' | 'user_disabled' | 'manual' | 'midnight' | 'idle' | …

  -- Bối cảnh kỹ thuật
  ip           TEXT,
  user_agent   TEXT,
  platform     TEXT,                       -- 'web' | 'android' | 'ios' | 'desktop'
  device_name  TEXT,                       -- "Chrome trên Windows 10" / "Pixel 7"
  session_id   TEXT,                       -- nhóm event login → logout cùng phiên (sinh từ client)

  -- Mở rộng tự do (mile, geo, ms_duration_session…)
  metadata     JSONB,

  -- Thời gian — luôn đầy đủ đến mili-giây (DB timestamptz)
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- INDEX query nhanh
CREATE INDEX IF NOT EXISTS idx_auth_event_user_time
  ON auth_event_log (user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_event_event_time
  ON auth_event_log (event, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_event_email_time
  ON auth_event_log (email, occurred_at DESC)
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_auth_event_session
  ON auth_event_log (session_id, occurred_at DESC)
  WHERE session_id IS NOT NULL;

COMMENT ON TABLE auth_event_log IS
  'Audit chi tiết login/logout/session — ghi đến mili-giây kèm IP, User-Agent, device, reason.';

COMMENT ON COLUMN auth_event_log.occurred_at IS
  'Thời điểm xảy ra event (timestamptz, đầy đủ đến ms). Dùng cho AI báo cáo "đăng nhập lúc 8:01:35".';

COMMENT ON COLUMN auth_event_log.session_id IS
  'Sinh từ client khi login_success, dùng lại cho logout → ghép cặp 1 phiên + tính ms_session_duration.';

ALTER TABLE auth_event_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_event_log_all ON auth_event_log;
CREATE POLICY auth_event_log_all ON auth_event_log FOR ALL USING (true) WITH CHECK (true);

COMMIT;
