-- Requires the runtime lead_attribution table verified in the deployment preflight.
-- Runtime metadata captured 2026-09-29: column types/defaults/FKs match this contract.
-- The historical table still has no creation migration in main: do not backfill data here.
BEGIN;
DO $$ BEGIN
  IF to_regclass('public.lead_attribution') IS NULL THEN
    RAISE EXCEPTION 'lead_attribution baseline schema must be reviewed/imported before migration 641';
  END IF;
  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('id','uuid'),('lead_id','uuid'),('contact_id','uuid'),('customer_id','uuid'),('company_id','uuid'),
      ('kenh','text'),('platform','text'),('fb_page_id','text'),('fb_ad_id','text'),('fb_adset_id','text'),
      ('fb_campaign_id','text'),('fb_campaign_name','text'),('fb_ref','text'),('fb_source','text'),
      ('raw','jsonb'),('created_at','timestamp with time zone'),('updated_at','timestamp with time zone')
    ) AS required(column_name,data_type)
    LEFT JOIN information_schema.columns actual
      ON actual.table_schema='public' AND actual.table_name='lead_attribution' AND actual.column_name=required.column_name
    WHERE actual.data_type IS DISTINCT FROM required.data_type
  ) THEN RAISE EXCEPTION 'lead_attribution schema does not match reviewed runtime contract'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=i.indkey[0]
    WHERE i.indrelid='public.lead_attribution'::regclass AND i.indisunique AND i.indnkeyatts=1
      AND a.attname='lead_id' AND (i.indpred IS NULL OR pg_get_expr(i.indpred,i.indrelid) ~ 'lead_id IS NOT NULL')
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=i.indkey[0]
    WHERE i.indrelid='public.lead_attribution'::regclass AND i.indisunique AND i.indnkeyatts=1
      AND a.attname='contact_id' AND pg_get_expr(i.indpred,i.indrelid) ~ 'lead_id IS NULL'
  ) THEN RAISE EXCEPTION 'lead_attribution reviewed unique Lead/pending-contact indexes required'; END IF;
END $$;
-- Runtime ACL is broad and RLS=false; this migration does NOT change global ACL.
-- No free-form referral/source/message/PSID/phone is added to this table.
-- Raw webhook evidence remains in the service-only receipt inbox.
-- INVOKER RPCs need explicit rights; this grants only the backend role and does
-- not broaden anon/authenticated access. Existing table ACL/RLS is a separate
-- deployment preflight because unversioned consumers may rely on it.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_attribution TO service_role;

CREATE FUNCTION public.facebook_link_attribution_v1(p_page_id text, p_contact_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE c public.facebook_contacts%ROWTYPE; a public.lead_attribution%ROWTYPE;
  target public.lead_attribution%ROWTYPE; co uuid; lead_company uuid; lead_customer uuid;
BEGIN
  SELECT * INTO c FROM public.facebook_contacts WHERE id=p_contact_id FOR UPDATE;
  IF NOT FOUND OR c.page_id IS DISTINCT FROM p_page_id THEN RAISE EXCEPTION 'Attribution contact/page mismatch'; END IF;
  SELECT default_company_id INTO co FROM public.facebook_pages WHERE page_id=p_page_id AND is_active=true;
  IF co IS NULL THEN RAISE EXCEPTION 'Attribution Page company missing'; END IF;
  IF c.lead_id IS NULL THEN RETURN false; END IF;
  SELECT company_id, customer_id INTO lead_company, lead_customer FROM public.crm_leads WHERE id=c.lead_id FOR SHARE;
  IF NOT FOUND OR lead_company IS DISTINCT FROM co THEN RAISE EXCEPTION 'Attribution Lead company mismatch'; END IF;
  SELECT * INTO target FROM public.lead_attribution WHERE lead_id=c.lead_id FOR UPDATE;
  IF target.id IS NOT NULL AND target.company_id IS DISTINCT FROM co THEN RAISE EXCEPTION 'Attribution target company mismatch'; END IF;
  SELECT * INTO a FROM public.lead_attribution WHERE contact_id=c.id AND lead_id IS NULL ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF a.id IS NULL THEN
    IF target.contact_id=c.id AND target.fb_page_id=p_page_id THEN
      UPDATE public.lead_attribution SET customer_id=lead_customer,updated_at=now()
        WHERE id=target.id AND customer_id IS DISTINCT FROM lead_customer;
      RETURN true;
    END IF;
    RETURN false;
  END IF;
  IF a.company_id IS DISTINCT FROM co OR a.fb_page_id IS DISTINCT FROM p_page_id THEN RAISE EXCEPTION 'Attribution pending scope mismatch'; END IF;
  IF target.id IS NOT NULL THEN
    -- A Lead may already have its first touch from another contact/Page. Preserve it;
    -- keep this contact's evidence pending instead of overwriting another source.
    IF target.contact_id IS DISTINCT FROM c.id OR target.fb_page_id IS DISTINCT FROM p_page_id THEN RETURN false; END IF;
    UPDATE public.lead_attribution SET
      fb_ad_id=COALESCE(target.fb_ad_id,a.fb_ad_id),
      fb_adset_id=CASE WHEN target.fb_ad_id IS NULL AND a.fb_ad_id IS NOT NULL THEN a.fb_adset_id WHEN target.fb_ad_id=a.fb_ad_id THEN COALESCE(target.fb_adset_id,a.fb_adset_id) ELSE target.fb_adset_id END,
      fb_campaign_id=CASE WHEN target.fb_ad_id IS NULL AND a.fb_ad_id IS NOT NULL THEN a.fb_campaign_id WHEN target.fb_ad_id=a.fb_ad_id THEN COALESCE(target.fb_campaign_id,a.fb_campaign_id) ELSE target.fb_campaign_id END,
      fb_campaign_name=CASE WHEN target.fb_ad_id IS NULL AND a.fb_ad_id IS NOT NULL THEN a.fb_campaign_name WHEN target.fb_ad_id=a.fb_ad_id THEN COALESCE(target.fb_campaign_name,a.fb_campaign_name) ELSE target.fb_campaign_name END,
      customer_id=lead_customer,
      raw=COALESCE(target.raw,'{}'::jsonb) || jsonb_build_object('messenger_linked_attribution_id',a.id), updated_at=now()
    WHERE id=target.id;
    DELETE FROM public.lead_attribution WHERE id=a.id;
  ELSE
    UPDATE public.lead_attribution SET lead_id=c.lead_id, customer_id=lead_customer, updated_at=now() WHERE id=a.id;
  END IF;
  RETURN true;
END;
$$;

CREATE FUNCTION public.facebook_capture_referral_v1(p_page_id text, p_contact_id uuid, p_referral jsonb, p_event_key text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE c public.facebook_contacts%ROWTYPE; a public.lead_attribution%ROWTYPE;
  co uuid; mapping jsonb; ad text; campaign text; adset text; cname text; evidence jsonb;
BEGIN
  SELECT * INTO c FROM public.facebook_contacts WHERE id=p_contact_id FOR UPDATE;
  IF NOT FOUND OR c.page_id IS DISTINCT FROM p_page_id THEN RAISE EXCEPTION 'Attribution contact/page mismatch'; END IF;
  SELECT default_company_id INTO co FROM public.facebook_pages WHERE page_id=p_page_id AND is_active=true;
  IF co IS NULL THEN RAISE EXCEPTION 'Attribution Page company missing'; END IF;
  IF jsonb_typeof(p_referral) IS DISTINCT FROM 'object' OR p_event_key IS NULL OR p_event_key !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Attribution invalid evidence'; END IF;
  ad := NULLIF(p_referral->>'ad_id','');
  IF ad IS NULL OR ad !~ '^[0-9]+$' OR (p_referral - 'ad_id') <> '{}'::jsonb THEN RAISE EXCEPTION 'Attribution requires numeric ad evidence only'; END IF;
  -- Mapping is reviewed configuration, keyed by exact Meta ad id. Never infer campaign from text.
  SELECT value->ad INTO mapping FROM public.app_settings WHERE key='facebook_ad_campaign_mapping_v1';
  IF mapping->>'page_id'=p_page_id AND mapping->>'company_id'=co::text THEN
    campaign:=NULLIF(mapping->>'campaign_id',''); adset:=NULLIF(mapping->>'adset_id',''); cname:=NULLIF(mapping->>'campaign_name','');
  END IF;
  evidence:=jsonb_build_object('event_key',p_event_key,'ad_id',ad,'recorded_at',now());
  SELECT * INTO a FROM public.lead_attribution
    WHERE contact_id=c.id AND (lead_id IS NULL OR lead_id=c.lead_id)
    ORDER BY (lead_id IS NOT NULL) DESC, created_at LIMIT 1 FOR UPDATE;
  IF a.id IS NOT NULL THEN
    IF a.company_id IS DISTINCT FROM co OR a.fb_page_id IS DISTINCT FROM p_page_id THEN RAISE EXCEPTION 'Attribution existing scope mismatch'; END IF;
    UPDATE public.lead_attribution SET
      fb_ad_id=COALESCE(a.fb_ad_id,ad),
      fb_adset_id=CASE WHEN a.fb_ad_id IS NULL AND ad IS NOT NULL THEN adset WHEN a.fb_ad_id=ad THEN COALESCE(a.fb_adset_id,adset) ELSE a.fb_adset_id END,
      fb_campaign_id=CASE WHEN a.fb_ad_id IS NULL AND ad IS NOT NULL THEN campaign WHEN a.fb_ad_id=ad THEN COALESCE(a.fb_campaign_id,campaign) ELSE a.fb_campaign_id END,
      fb_campaign_name=CASE WHEN a.fb_ad_id IS NULL AND ad IS NOT NULL THEN cname WHEN a.fb_ad_id=ad THEN COALESCE(a.fb_campaign_name,cname) ELSE a.fb_campaign_name END,
      raw=COALESCE(a.raw,'{}'::jsonb) || jsonb_build_object('messenger_first_evidence',COALESCE(a.raw->'messenger_first_evidence',evidence),'messenger_last_evidence',evidence),
      updated_at=now() WHERE id=a.id;
  ELSE
    INSERT INTO public.lead_attribution(contact_id,customer_id,company_id,kenh,platform,fb_page_id,fb_ad_id,fb_adset_id,fb_campaign_id,fb_campaign_name,raw)
    VALUES(c.id,c.customer_id,co,'messenger','facebook',p_page_id,ad,adset,campaign,cname,jsonb_build_object('messenger_first_evidence',evidence,'messenger_last_evidence',evidence)) RETURNING * INTO a;
  END IF;
  PERFORM public.facebook_link_attribution_v1(p_page_id,p_contact_id);
  RETURN (SELECT id FROM public.lead_attribution WHERE contact_id=c.id AND (lead_id IS NULL OR lead_id=c.lead_id) ORDER BY (lead_id IS NOT NULL) DESC,created_at LIMIT 1);
END;
$$;
REVOKE ALL ON FUNCTION public.facebook_capture_referral_v1(text,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.facebook_link_attribution_v1(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.facebook_capture_referral_v1(text,uuid,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.facebook_link_attribution_v1(text,uuid) TO service_role;
COMMIT;

-- Rollback: disable FB_DURABLE_MESSENGER_PAGE_IDS only after the queue drains,
-- then revert backend; preserve evidence tables/columns for audit. No data delete/backfill.
