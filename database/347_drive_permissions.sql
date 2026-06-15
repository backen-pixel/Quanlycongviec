-- 347_drive_permissions.sql
-- Module Drive: ACL chia sẻ nội bộ (file hoặc folder → user/department/company/role).
-- Permissions kế thừa: 1 folder share thì mọi file/folder con kế thừa quyền đó.
-- Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS drive_acl (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type        VARCHAR(16) NOT NULL CHECK (target_type IN ('folder','file','root')),
  -- target_id: drive_folders.id | drive_files.id | drive_roots.id (tuỳ target_type).
  target_id          UUID NOT NULL,
  principal_type     VARCHAR(16) NOT NULL CHECK (principal_type IN ('user','department','company','role','everyone')),
  -- principal_id: NULL khi principal_type='everyone'.
  principal_id       UUID,
  role               VARCHAR(16) NOT NULL CHECK (role IN ('viewer','commenter','editor','owner')),
  granted_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_drive_acl
  ON drive_acl(target_type, target_id, principal_type, COALESCE(principal_id::text, '*'));
CREATE INDEX IF NOT EXISTS idx_drive_acl_target ON drive_acl(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_drive_acl_principal
  ON drive_acl(principal_type, principal_id);

COMMENT ON TABLE drive_acl IS
  'Module Drive: ACL phân quyền nội bộ. Quyền cha thừa kế cho mọi con (resolve trong app code).';

COMMIT;
