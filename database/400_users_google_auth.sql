-- 400: Google Sign-In cho users (kết hợp SaaS checkout email)
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'password';

COMMENT ON COLUMN users.google_id IS 'Google sub — đăng nhập OAuth';
COMMENT ON COLUMN users.auth_provider IS 'password | google | both';

CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_unique
  ON users (google_id) WHERE google_id IS NOT NULL;
