-- Backup only. Private encrypted rollback records for one reviewed three-row repair.
-- No public table, existing ACL, business rule, role binding or measurement change.
BEGIN;
CREATE SCHEMA vpt_recovery_20261015 AUTHORIZATION CURRENT_USER;
REVOKE ALL ON SCHEMA vpt_recovery_20261015 FROM PUBLIC,anon,authenticated,service_role,authenticator;
CREATE TABLE vpt_recovery_20261015.identity_repair_snapshots (
  id uuid PRIMARY KEY,
  operation text NOT NULL CHECK (operation='same_uuid_email_department_user_v1'),
  source_project text NOT NULL CHECK (source_project='kdxypztstbeovyedmvem'),
  backup_project text NOT NULL CHECK (backup_project='atcfpgxkgbszglrelfgr'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  algorithm text NOT NULL CHECK (algorithm='aes-256-gcm/hkdf-sha256/jwt_secret_v1'),
  salt bytea NOT NULL CHECK (octet_length(salt)=32),
  nonce bytea NOT NULL CHECK (octet_length(nonce)=12),
  auth_tag bytea NOT NULL CHECK (octet_length(auth_tag)=16),
  ciphertext bytea NOT NULL CHECK (octet_length(ciphertext)>0),
  ciphertext_sha256 text NOT NULL CHECK (ciphertext_sha256 ~ '^[a-f0-9]{64}$'),
  applied_at timestamptz,
  result jsonb CHECK (result IS NULL OR result='{"alias_email_updates":1,"department_inserts":1,"user_inserts":1}'::jsonb)
);
ALTER TABLE vpt_recovery_20261015.identity_repair_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE vpt_recovery_20261015.identity_repair_snapshots FORCE ROW LEVEL SECURITY;
REVOKE ALL ON vpt_recovery_20261015.identity_repair_snapshots FROM PUBLIC,anon,authenticated,service_role,authenticator;
COMMENT ON TABLE vpt_recovery_20261015.identity_repair_snapshots IS
  'Owner-only AES-GCM rollback snapshots. Recovery requires the exact JWT_SECRET version used for HKDF; rotation without retaining that private key version makes decryption unavailable. Not exposed to Data API.';
COMMIT;
