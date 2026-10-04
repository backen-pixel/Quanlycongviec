-- Current company activity is required for identity inventory and decisions.
BEGIN;
CREATE OR REPLACE FUNCTION public.crm_identity_review_admin(p_actor uuid,p_company uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE u public.users%ROWTYPE;c public.companies%ROWTYPE;t jsonb;
BEGIN
 SELECT * INTO u FROM public.users WHERE id=p_actor FOR SHARE;
 IF NOT FOUND OR u.is_active IS DISTINCT FROM true THEN RAISE EXCEPTION 'actor denied' USING ERRCODE='42501';END IF;
 SELECT * INTO c FROM public.companies WHERE id=p_company FOR SHARE;
 IF NOT FOUND OR to_jsonb(c)->>'is_active' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'company denied' USING ERRCODE='42501';END IF;
 IF to_jsonb(c)->>'tenant_id' IS NOT NULL THEN
  SELECT to_jsonb(x) INTO t FROM public.tenants x WHERE id=(to_jsonb(c)->>'tenant_id')::uuid FOR SHARE;
  IF NOT FOUND OR t->>'is_active' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'tenant denied' USING ERRCODE='42501';END IF;
 END IF;
 IF (u.role::text='platform_admin' OR
  (u.company_id=p_company AND u.role::text IN('admin','sales_admin') AND to_jsonb(u)->>'tenant_id' IS NOT DISTINCT FROM to_jsonb(c)->>'tenant_id') OR
  (u.company_id IS NULL AND u.role::text IN('ecosystem_admin','admin') AND to_jsonb(u)->>'tenant_id' IS NOT NULL AND to_jsonb(u)->>'tenant_id'=to_jsonb(c)->>'tenant_id')) IS NOT TRUE
 THEN RAISE EXCEPTION 'company identity review denied' USING ERRCODE='42501';END IF;
END $$;
REVOKE ALL ON FUNCTION public.crm_identity_review_admin(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
