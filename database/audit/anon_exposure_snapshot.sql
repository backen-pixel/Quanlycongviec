-- Run once per database immediately after anon_exposure_audit.sql, before migration 700.
-- This fixed-name table intentionally makes a second snapshot fail rather than overwrite evidence.
-- It stores catalog metadata only, never business rows. Restrict access to the operator.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '5min';

CREATE SCHEMA IF NOT EXISTS security_snapshot;
REVOKE ALL ON SCHEMA security_snapshot FROM PUBLIC, anon, authenticated;
CREATE TABLE security_snapshot.anon_exposure_pre_700 (
  kind text NOT NULL,
  schema_name text NOT NULL,
  object_name text NOT NULL,
  object_identity text NOT NULL,
  rls_enabled boolean,
  grants jsonb NOT NULL DEFAULT '[]'::jsonb,
  policies jsonb NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (kind, schema_name, object_identity)
);
REVOKE ALL ON security_snapshot.anon_exposure_pre_700 FROM PUBLIC, anon, authenticated;

INSERT INTO security_snapshot.anon_exposure_pre_700
  (kind, schema_name, object_name, object_identity, rls_enabled, grants, policies)
SELECT CASE WHEN c.relkind = 'S' THEN 'sequence' ELSE 'relation' END,
       n.nspname, c.relname, c.relname,
       CASE WHEN c.relkind IN ('r', 'p') THEN c.relrowsecurity ELSE NULL END,
       COALESCE((
         SELECT jsonb_agg(jsonb_build_object(
           'grantee', CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE gr.rolname END,
           'privilege', a.privilege_type, 'grantable', a.is_grantable
         ) ORDER BY a.grantee, a.privilege_type)
         FROM aclexplode(COALESCE(c.relacl,
           acldefault((CASE WHEN c.relkind = 'S' THEN 'S' ELSE 'r' END)::"char", c.relowner))) a
         LEFT JOIN pg_roles gr ON gr.oid = a.grantee
         WHERE a.grantee = 0 OR gr.rolname IN ('anon', 'authenticated', 'service_role')
       ), '[]'::jsonb),
       COALESCE((
         SELECT jsonb_agg(jsonb_build_object(
           'policyname', p.policyname, 'permissive', p.permissive,
           'roles', p.roles, 'cmd', p.cmd, 'qual', p.qual, 'with_check', p.with_check
         ) ORDER BY p.policyname)
         FROM pg_policies p
         WHERE p.schemaname = n.nspname AND p.tablename = c.relname
           AND p.roles && ARRAY['public', 'anon', 'authenticated']::name[]
           AND (btrim(p.qual) = 'true' OR btrim(p.with_check) = 'true')
       ), '[]'::jsonb)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S');

INSERT INTO security_snapshot.anon_exposure_pre_700
  (kind, schema_name, object_name, object_identity, grants)
SELECT 'function', n.nspname, p.proname,
       format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)),
       COALESCE((
         SELECT jsonb_agg(jsonb_build_object(
           'grantee', CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE gr.rolname END,
           'privilege', a.privilege_type, 'grantable', a.is_grantable
         ) ORDER BY a.grantee, a.privilege_type)
         FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
         LEFT JOIN pg_roles gr ON gr.oid = a.grantee
         WHERE a.grantee = 0 OR gr.rolname IN ('anon', 'authenticated', 'service_role')
       ), '[]'::jsonb)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public';

-- Preserve per-schema default ACLs for both migration owner roles, including empty sets.
INSERT INTO security_snapshot.anon_exposure_pre_700
  (kind, schema_name, object_name, object_identity, grants)
SELECT 'default_acl', 'public', r.rolname, r.rolname || ':' || t.objtype,
       COALESCE((
         SELECT jsonb_agg(jsonb_build_object(
           'grantee', CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE gr.rolname END,
           'privilege', a.privilege_type, 'grantable', a.is_grantable
         ) ORDER BY a.grantee, a.privilege_type)
         FROM pg_default_acl d
         JOIN pg_namespace n ON n.oid = d.defaclnamespace
         CROSS JOIN LATERAL aclexplode(d.defaclacl) a
         LEFT JOIN pg_roles gr ON gr.oid = a.grantee
         WHERE d.defaclrole = r.oid AND n.nspname = 'public'
           AND d.defaclobjtype = t.objtype::"char"
           AND (a.grantee = 0 OR gr.rolname IN ('anon', 'authenticated'))
       ), '[]'::jsonb)
FROM pg_roles r CROSS JOIN (VALUES ('r'), ('S'), ('f')) t(objtype)
WHERE r.rolname IN ('postgres', 'supabase_admin');

COMMIT;
