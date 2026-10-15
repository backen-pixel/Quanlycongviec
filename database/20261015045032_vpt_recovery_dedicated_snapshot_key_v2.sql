-- Backup only; v1 migration is already applied and must remain unchanged.
-- New snapshots require a dedicated 32-byte key and a retained UUID key version.
-- Legacy JWT-derived rows remain decryptable only with their original JWT key.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
ALTER TABLE vpt_recovery_20261015.identity_repair_snapshots ADD COLUMN key_id uuid;
ALTER TABLE vpt_recovery_20261015.identity_repair_snapshots
  DROP CONSTRAINT identity_repair_snapshots_algorithm_check;
ALTER TABLE vpt_recovery_20261015.identity_repair_snapshots
  ADD CONSTRAINT identity_repair_snapshots_algorithm_check CHECK (
    algorithm IN ('aes-256-gcm/hkdf-sha256/jwt_secret_v1','aes-256-gcm/hkdf-sha256/dedicated_key_v2')),
  ADD CONSTRAINT identity_repair_snapshots_key_version_check CHECK (
    (algorithm='aes-256-gcm/hkdf-sha256/jwt_secret_v1' AND key_id IS NULL) OR
    (algorithm='aes-256-gcm/hkdf-sha256/dedicated_key_v2' AND key_id IS NOT NULL));
COMMENT ON COLUMN vpt_recovery_20261015.identity_repair_snapshots.key_id IS
  'Non-secret UUID identifying the exact retained VPT_RECOVERY_SNAPSHOT_KEY version; key bytes are never stored here. Keep prior key versions in protected operational storage until their snapshots are no longer required.';
COMMENT ON TABLE vpt_recovery_20261015.identity_repair_snapshots IS
  'Owner-only encrypted rollback snapshots. New v2 rows use a separate canonical base64 32-byte key VPT_RECOVERY_SNAPSHOT_KEY and UUID VPT_RECOVERY_SNAPSHOT_KEY_ID bound in AAD. Rotation requires retaining every original key version. Legacy v1 rows require their original JWT_SECRET version. No key is stored in this table; no app ACLs are changed.';
COMMIT;
