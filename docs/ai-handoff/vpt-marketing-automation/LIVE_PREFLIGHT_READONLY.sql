-- Read-only catalog evidence. Never executes business RPCs or changes grants.
-- Missing objects or NULL permissions mean UNKNOWN/STOP, never PASS.
-- This is a bounded check, not certification of every permission or a restore.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '10s';
WITH expected(name) AS (VALUES
 ('public.marketing_fb_lead_bindings'),('public.marketing_fb_lead_receipts'),
 ('public.crm_lead_source_evidence'),('public.crm_lead_quality_events'),
 ('public.crm_lead_identity_events'),('public.marketing_spend_sync_runs')
), objects AS (
 SELECT e.name,c.oid,c.relrowsecurity FROM expected e
 LEFT JOIN pg_class c ON c.oid=to_regclass(e.name)
), roles AS (SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role'))
SELECT jsonb_build_object(
 'observedAt',clock_timestamp(),
 'readOnly',current_setting('transaction_read_only'),
 'requiredTables',(SELECT jsonb_agg(jsonb_build_object('name',name,'exists',oid IS NOT NULL,'rls',relrowsecurity) ORDER BY name) FROM objects),
 'directTablePermissions',(SELECT jsonb_agg(jsonb_build_object('object',o.name,'role',r.rolname,
   'allowed',CASE WHEN o.oid IS NOT NULL THEN has_table_privilege(r.rolname,o.oid,'SELECT,INSERT,UPDATE,DELETE') END)
   ORDER BY o.name,r.rolname) FROM objects o CROSS JOIN roles r),
 'internalIntakeHelper',(SELECT jsonb_agg(jsonb_build_object('role',r.rolname,
   'exists',to_regprocedure('public.marketing_fb_intake_admin(uuid,uuid)') IS NOT NULL,
   'execute',CASE WHEN to_regprocedure('public.marketing_fb_intake_admin(uuid,uuid)') IS NOT NULL
     THEN has_function_privilege(r.rolname,to_regprocedure('public.marketing_fb_intake_admin(uuid,uuid)'),'EXECUTE') END)
   ORDER BY r.rolname) FROM roles r),
 'publicRelationsExposedToBrowserRoles',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f') AND
   (has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE'))),
 'publicTablesWithoutRls',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity),
 'privateSchemaDirectAccess',(SELECT coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'role',r.rolname,
   'usage',has_schema_privilege(r.rolname,n.oid,'USAGE')) ORDER BY n.nspname,r.rolname),'[]'::jsonb)
   FROM pg_namespace n CROSS JOIN roles r WHERE n.nspname IN ('crm_care_control','crm_survey_control','crm_legacy_hold'))
) AS evidence;
ROLLBACK;
