-- Adds one private, append-only scope-revision ledger. Existing V1/V2 objects,
-- manifests, journals, registrations and business rows are not changed.
BEGIN;
CREATE SCHEMA vpt_cutover_scope_v3_20261016 AUTHORIZATION CURRENT_USER;
REVOKE ALL ON SCHEMA vpt_cutover_scope_v3_20261016 FROM PUBLIC,anon,authenticated,service_role,authenticator;
CREATE TABLE vpt_cutover_scope_v3_20261016.revisions (
  run_id uuid NOT NULL,
  site text NOT NULL CHECK(site IN ('primary','backup')),
  project_ref text NOT NULL,
  base_manifest_sha256 text NOT NULL CHECK(base_manifest_sha256 ~ '^[a-f0-9]{64}$'),
  revision_manifest_sha256 text NOT NULL CHECK(revision_manifest_sha256 ~ '^[a-f0-9]{64}$' AND revision_manifest_sha256<>base_manifest_sha256),
  manifest jsonb NOT NULL,
  owner_oid oid NOT NULL DEFAULT current_user::regrole::oid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(run_id,site),
  CHECK((site='primary' AND project_ref='kdxypztstbeovyedmvem') OR (site='backup' AND project_ref='atcfpgxkgbszglrelfgr'))
);
ALTER TABLE vpt_cutover_scope_v3_20261016.revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vpt_cutover_scope_v3_20261016.revisions FORCE ROW LEVEL SECURITY;
DO $policy$
BEGIN
  EXECUTE format('CREATE POLICY owner_only ON vpt_cutover_scope_v3_20261016.revisions FOR ALL TO %I USING(true) WITH CHECK(true)',current_user);
END
$policy$;
CREATE FUNCTION vpt_cutover_scope_v3_20261016.immutable_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $body$
BEGIN
  RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='CUTOVER_V3_IMMUTABLE_REVISION';
END
$body$;
REVOKE ALL ON FUNCTION vpt_cutover_scope_v3_20261016.immutable_revision() FROM PUBLIC,anon,authenticated,service_role,authenticator;
CREATE TRIGGER immutable_revision BEFORE UPDATE OR DELETE OR TRUNCATE ON vpt_cutover_scope_v3_20261016.revisions
FOR EACH STATEMENT EXECUTE FUNCTION vpt_cutover_scope_v3_20261016.immutable_revision();
ALTER TABLE vpt_cutover_scope_v3_20261016.revisions ENABLE ALWAYS TRIGGER immutable_revision;
REVOKE ALL ON ALL TABLES IN SCHEMA vpt_cutover_scope_v3_20261016 FROM PUBLIC,anon,authenticated,service_role,authenticator;
COMMIT;
