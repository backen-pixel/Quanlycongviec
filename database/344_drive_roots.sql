-- 344_drive_roots.sql
-- Module Drive: bảng gốc map scope → folder gốc trên Google Drive.
-- Mỗi root tương ứng 1 vùng lưu trữ độc lập: Drive cá nhân (user), Drive công ty, hoặc Drive chung.
-- Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS drive_roots (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope              VARCHAR(16) NOT NULL CHECK (scope IN ('user','company','shared')),
  -- owner_id: user_id khi scope='user', company_id khi scope='company', NULL khi scope='shared'.
  owner_id           UUID,
  name               TEXT NOT NULL,
  google_folder_id   TEXT NOT NULL UNIQUE,
  -- changes.list page token để sync incremental (mỗi root 1 token riêng).
  start_page_token   TEXT,
  last_synced_at     TIMESTAMPTZ,
  created_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1 user/company chỉ có tối đa 1 root mỗi scope; nhiều shared roots OK.
CREATE UNIQUE INDEX IF NOT EXISTS uq_drive_roots_user
  ON drive_roots(owner_id) WHERE scope = 'user';
CREATE UNIQUE INDEX IF NOT EXISTS uq_drive_roots_company
  ON drive_roots(owner_id) WHERE scope = 'company';

CREATE INDEX IF NOT EXISTS idx_drive_roots_scope ON drive_roots(scope);

COMMENT ON TABLE drive_roots IS
  'Module Drive: gốc lưu trữ (user/company/shared) ánh xạ tới 1 folder Google Drive.';

COMMIT;
