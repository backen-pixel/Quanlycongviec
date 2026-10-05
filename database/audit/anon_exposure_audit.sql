-- SELECT-only catalog audit. Run on primary and backup; save results outside git.
-- 1a. Effective table/view grants (including inherited/PUBLIC grants).
WITH grants AS (
  SELECT r.rolname AS role_name, c.relkind, c.relname AS object_name, p.privilege
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN (VALUES ('anon'), ('authenticated')) r(rolname)
  CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p(privilege)
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r.rolname)
    AND has_table_privilege(r.rolname, c.oid, p.privilege)
)
SELECT '1a_table_view_grants' AS section, role_name, relkind, object_name, privilege,
       count(*) OVER (PARTITION BY role_name) AS role_grant_count
FROM grants ORDER BY role_name, object_name, privilege;

-- 1b. Effective sequence grants.
WITH grants AS (
  SELECT r.rolname AS role_name, c.relname AS object_name, p.privilege
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN (VALUES ('anon'), ('authenticated')) r(rolname)
  CROSS JOIN (VALUES ('USAGE'), ('SELECT'), ('UPDATE')) p(privilege)
  WHERE n.nspname = 'public' AND c.relkind = 'S'
    AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r.rolname)
    AND has_sequence_privilege(r.rolname, c.oid, p.privilege)
)
SELECT '1b_sequence_grants' AS section, role_name, object_name, privilege,
       count(*) OVER (PARTITION BY role_name) AS role_grant_count
FROM grants ORDER BY role_name, object_name, privilege;

-- 2. Public tables with RLS disabled.
SELECT '2_rls_disabled' AS section, c.relname AS object_name,
       count(*) OVER () AS object_count
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
ORDER BY c.relname;

-- 3. True policies applicable to PUBLIC, anon or authenticated.
SELECT '3_true_policy' AS section, schemaname, tablename AS object_name, policyname,
       cmd, roles, qual, with_check, count(*) OVER () AS policy_count
FROM pg_policies
WHERE schemaname = 'public'
  AND roles && ARRAY['public', 'anon', 'authenticated']::name[]
  AND (btrim(qual) = 'true' OR btrim(with_check) = 'true')
ORDER BY tablename, policyname;

-- 4. Functions anon can execute; flag SECURITY DEFINER.
SELECT '4_anon_functions' AS section,
       format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) AS object_name,
       p.prosecdef AS security_definer, count(*) OVER () AS function_count
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
ORDER BY object_name;

-- 5. Non-security_invoker views readable by anon.
SELECT '5_anon_definer_views' AS section, c.relname AS object_name,
       count(*) OVER () AS view_count
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'v'
  AND NOT (COALESCE(c.reloptions, ARRAY[]::text[]) @> ARRAY['security_invoker=true'])
  AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
  AND has_table_privilege('anon', c.oid, 'SELECT')
ORDER BY c.relname;

-- 6. Explicit default ACL entries in public for PUBLIC/anon/authenticated.
SELECT '6_default_acl' AS section, owner.rolname AS owner_name, d.defaclobjtype,
       CASE WHEN e.grantee = 0 THEN 'PUBLIC' ELSE grantee.rolname END AS grantee,
       e.privilege_type, e.is_grantable, count(*) OVER () AS grant_count
FROM pg_default_acl d
JOIN pg_roles owner ON owner.oid = d.defaclrole
JOIN pg_namespace n ON n.oid = d.defaclnamespace
CROSS JOIN LATERAL aclexplode(d.defaclacl) e
LEFT JOIN pg_roles grantee ON grantee.oid = e.grantee
WHERE n.nspname = 'public'
  AND (e.grantee = 0 OR grantee.rolname IN ('anon', 'authenticated'))
ORDER BY owner_name, d.defaclobjtype, grantee, e.privilege_type;
