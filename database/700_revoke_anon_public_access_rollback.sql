-- Use only with the same database's security_snapshot.anon_exposure_pre_700.
-- Restores the recorded privilege/grant-option matrix, RLS flags and dropped
-- policies for pre-700 public objects. Keep the snapshot for verification.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '5min';

DO $rollback$
DECLARE obj record;
DECLARE grant_row record;
DECLARE policy_row jsonb;
DECLARE object_sql text;
DECLARE grantee_sql text;
DECLARE role_sql text;
DECLARE ddl text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM security_snapshot.anon_exposure_pre_700) THEN
    RAISE EXCEPTION 'anon exposure snapshot is empty';
  END IF;

  FOR obj IN
    SELECT * FROM security_snapshot.anon_exposure_pre_700
    WHERE kind IN ('relation', 'sequence', 'function')
    ORDER BY kind, object_identity
  LOOP
    IF obj.kind = 'function' THEN
      object_sql := format('FUNCTION %s', obj.object_identity);
    ELSIF obj.kind = 'sequence' THEN
      object_sql := format('SEQUENCE %I.%I', obj.schema_name, obj.object_name);
    ELSE
      object_sql := format('TABLE %I.%I', obj.schema_name, obj.object_name);
    END IF;

    EXECUTE format('REVOKE ALL ON %s FROM PUBLIC, anon, authenticated, service_role', object_sql);
    FOR grant_row IN
      SELECT value->>'grantee' AS grantee,
             value->>'privilege' AS privilege,
             (value->>'grantable')::boolean AS grantable
      FROM jsonb_array_elements(obj.grants)
    LOOP
      grantee_sql := CASE WHEN grant_row.grantee = 'PUBLIC' THEN 'PUBLIC'
                          ELSE quote_ident(grant_row.grantee) END;
      EXECUTE format('GRANT %s ON %s TO %s%s', grant_row.privilege,
                     object_sql, grantee_sql,
                     CASE WHEN grant_row.grantable THEN ' WITH GRANT OPTION' ELSE '' END);
    END LOOP;

    IF obj.kind = 'relation' AND obj.rls_enabled IS FALSE THEN
      EXECUTE format('ALTER TABLE %I.%I DISABLE ROW LEVEL SECURITY',
                     obj.schema_name, obj.object_name);
    END IF;

    IF obj.kind = 'relation' THEN
      FOR policy_row IN SELECT value FROM jsonb_array_elements(obj.policies)
      LOOP
        SELECT string_agg(CASE WHEN role_name = 'public' THEN 'PUBLIC'
                               ELSE quote_ident(role_name) END, ', ')
          INTO role_sql
        FROM jsonb_array_elements_text(policy_row->'roles') AS r(role_name);
        ddl := format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s',
                      policy_row->>'policyname', obj.schema_name, obj.object_name,
                      policy_row->>'permissive', policy_row->>'cmd', role_sql);
        IF policy_row->>'qual' IS NOT NULL THEN
          ddl := ddl || format(' USING (%s)', policy_row->>'qual');
        END IF;
        IF policy_row->>'with_check' IS NOT NULL THEN
          ddl := ddl || format(' WITH CHECK (%s)', policy_row->>'with_check');
        END IF;
        EXECUTE ddl;
      END LOOP;
    END IF;
  END LOOP;

  FOR obj IN
    SELECT * FROM security_snapshot.anon_exposure_pre_700
    WHERE kind = 'default_acl' ORDER BY object_identity
  LOOP
    object_sql := CASE split_part(obj.object_identity, ':', 2)
      WHEN 'r' THEN 'TABLES' WHEN 'S' THEN 'SEQUENCES' WHEN 'f' THEN 'FUNCTIONS'
      ELSE NULL END;
    IF object_sql IS NULL THEN
      RAISE EXCEPTION 'Unknown default ACL object type: %', obj.object_identity;
    END IF;
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON %s FROM PUBLIC, anon, authenticated',
                   obj.object_name, object_sql);
    FOR grant_row IN
      SELECT value->>'grantee' AS grantee,
             value->>'privilege' AS privilege,
             (value->>'grantable')::boolean AS grantable
      FROM jsonb_array_elements(obj.grants)
    LOOP
      grantee_sql := CASE WHEN grant_row.grantee = 'PUBLIC' THEN 'PUBLIC'
                          ELSE quote_ident(grant_row.grantee) END;
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT %s ON %s TO %s%s',
                     obj.object_name, grant_row.privilege, object_sql, grantee_sql,
                     CASE WHEN grant_row.grantable THEN ' WITH GRANT OPTION' ELSE '' END);
    END LOOP;
  END LOOP;
END
$rollback$;

COMMIT;
