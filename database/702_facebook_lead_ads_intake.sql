-- H1 Lead Ads: explicit operator binding, atomic CRM intake and durable handoff.
-- No enrollment/activation, task generation, phone merge, AI or external sends.
-- Requires reviewed baseline 19/21/23/34/42/108/119/129/131/383/385/638/639/701.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';

CREATE TABLE IF NOT EXISTS public.facebook_lead_ads_bindings (
  page_id text NOT NULL REFERENCES public.facebook_pages(page_id),
  form_id text NOT NULL CHECK (form_id ~ '^[0-9]{1,32}$'),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  recipient_id uuid NOT NULL REFERENCES public.users(id),
  pipeline_id uuid NOT NULL REFERENCES public.crm_pipelines(id),
  stage_id uuid NOT NULL REFERENCES public.crm_pipeline_stages(id),
  source_id uuid NOT NULL REFERENCES public.crm_sources(id),
  region_id uuid REFERENCES public.company_regions(id),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(page_id,form_id)
);
CREATE OR REPLACE FUNCTION public.facebook_lead_ads_binding_revision_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF NEW.page_id IS DISTINCT FROM OLD.page_id OR NEW.form_id IS DISTINCT FROM OLD.form_id THEN
    RAISE EXCEPTION 'FB_INBOX_BINDING_IDENTITY_IMMUTABLE' USING ERRCODE='22023';
  END IF;
  NEW.version:=OLD.version+1;
  NEW.created_at:=OLD.created_at;
  NEW.updated_at:=clock_timestamp();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS facebook_lead_ads_binding_revision ON public.facebook_lead_ads_bindings;
CREATE TRIGGER facebook_lead_ads_binding_revision BEFORE UPDATE ON public.facebook_lead_ads_bindings
  FOR EACH ROW EXECUTE FUNCTION public.facebook_lead_ads_binding_revision_v1();

CREATE TABLE IF NOT EXISTS public.facebook_lead_ads_intake_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id text NOT NULL,
  form_id text NOT NULL,
  leadgen_id text NOT NULL UNIQUE,
  inbox_id uuid NOT NULL,
  binding_version integer NOT NULL,
  company_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  pipeline_id uuid NOT NULL,
  stage_id uuid NOT NULL,
  source_id uuid NOT NULL,
  region_id uuid,
  lead_id uuid NOT NULL UNIQUE,
  customer_id uuid NOT NULL,
  contact_id uuid NOT NULL UNIQUE,
  attribution_id uuid NOT NULL UNIQUE,
  lead_ad_id uuid NOT NULL UNIQUE,
  notification_id uuid NOT NULL UNIQUE,
  lead_data jsonb NOT NULL CHECK(jsonb_typeof(lead_data)='object'),
  provider_data jsonb NOT NULL CHECK(jsonb_typeof(provider_data)='object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(page_id,form_id,leadgen_id)
);
-- Deliberately no cascading FK on evidence IDs. Deletion/movement of a CRM row
-- must invalidate replay, not erase proof or recreate the deleted customer.
CREATE OR REPLACE FUNCTION public.facebook_lead_ads_receipt_immutable_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  RAISE EXCEPTION 'FB_INBOX_RECEIPT_IMMUTABLE' USING ERRCODE='42501';
END;
$$;
DROP TRIGGER IF EXISTS facebook_lead_ads_receipt_immutable ON public.facebook_lead_ads_intake_receipts;
CREATE TRIGGER facebook_lead_ads_receipt_immutable BEFORE UPDATE OR DELETE ON public.facebook_lead_ads_intake_receipts
  FOR EACH ROW EXECUTE FUNCTION public.facebook_lead_ads_receipt_immutable_v1();
ALTER TABLE public.facebook_lead_ads_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facebook_lead_ads_intake_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.facebook_lead_ads_bindings,public.facebook_lead_ads_intake_receipts
  FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.facebook_lead_ads_bindings,public.facebook_lead_ads_intake_receipts TO service_role;
CREATE INDEX IF NOT EXISTS facebook_page_inbox_lead_ads_due
  ON public.facebook_page_inbox(page_id,queue_order,available_at)
  WHERE status<>'done' AND payload->>'kind'='change' AND payload->'event'->>'field'='leadgen';

CREATE OR REPLACE FUNCTION public.facebook_page_inbox_claim_lead_ads_v1(p_token uuid,p_page_ids text[])
RETURNS SETOF public.facebook_page_inbox LANGUAGE plpgsql SECURITY INVOKER
SET search_path='' SET lock_timeout='1s' SET statement_timeout='5s' AS $$
DECLARE candidate record; picked public.facebook_page_inbox; stamp timestamptz;
BEGIN
  IF current_user<>'service_role' THEN RAISE EXCEPTION 'FB_INBOX_SERVICE_ROLE_REQUIRED' USING ERRCODE='42501'; END IF;
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'FB_INBOX_READ_COMMITTED_REQUIRED' USING ERRCODE='25001';
  END IF;
  IF p_token IS NULL OR cardinality(p_page_ids) IS NULL OR cardinality(p_page_ids)<1 OR cardinality(p_page_ids)>100
    OR EXISTS(SELECT 1 FROM unnest(p_page_ids) x WHERE x IS NULL OR x !~ '^[0-9]{1,32}$') THEN
    RAISE EXCEPTION 'FB_INBOX_INVALID_LEAD_ADS_CLAIM' USING ERRCODE='22023';
  END IF;
  FOR candidate IN
    SELECT i.id,i.page_id FROM public.facebook_page_inbox i
    WHERE i.page_id=ANY(p_page_ids) AND i.payload->>'kind'='change' AND i.payload->'event'->>'field'='leadgen'
      AND i.status<>'done' AND i.available_at<=clock_timestamp()
      AND (i.status='pending' OR i.locked_until<=clock_timestamp())
    ORDER BY i.queue_order LIMIT 1000
  LOOP
    -- Same mutex as 701. Due-order lane: retry backoff cannot block another
    -- independent leadgen. Messenger stays pending; any live Page lease blocks.
    IF NOT pg_try_advisory_xact_lock(hashtextextended('facebook_page_inbox.page:'||candidate.page_id,0)) THEN CONTINUE; END IF;
    SELECT i.* INTO picked FROM public.facebook_page_inbox i WHERE i.id=candidate.id
      AND i.status<>'done' AND i.available_at<=clock_timestamp()
      AND (i.status='pending' OR i.locked_until<=clock_timestamp())
      AND NOT EXISTS(SELECT 1 FROM public.facebook_page_inbox busy WHERE busy.page_id=i.page_id
        AND busy.status='processing' AND busy.locked_until>clock_timestamp())
      FOR UPDATE OF i SKIP LOCKED;
    IF NOT FOUND THEN CONTINUE; END IF;
    stamp:=clock_timestamp();
    UPDATE public.facebook_page_inbox SET status='processing',attempts=attempts+1,
      lease_token=p_token,locked_until=stamp+interval '120 seconds' WHERE id=picked.id RETURNING * INTO picked;
    RETURN NEXT picked;
    RETURN;
  END LOOP;
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.facebook_lead_ads_intake_v1(
  p_inbox_id uuid,p_lease_token uuid,p_binding_version integer,p_lead_data jsonb,p_provider_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp SET lock_timeout='2s' SET statement_timeout='10s' AS $$
DECLARE
  item public.facebook_page_inbox; binding public.facebook_lead_ads_bindings;
  page public.facebook_pages; company public.companies; recipient public.users;
  pipeline public.crm_pipelines; stage public.crm_pipeline_stages; source public.crm_sources;
  region public.company_regions; receipt public.facebook_lead_ads_intake_receipts;
  contact public.facebook_contacts; lead public.crm_leads; customer public.customers;
  ad public.facebook_lead_ads; attribution public.lead_attribution;
  event_value jsonb; form text; leadgen text; v_phone text; full_name text; email text;
  new_lead uuid:=gen_random_uuid(); new_customer uuid:=gen_random_uuid(); new_contact uuid:=gen_random_uuid();
  new_attr uuid:=gen_random_uuid(); new_ad uuid:=gen_random_uuid(); new_notification uuid:=gen_random_uuid();
  new_receipt uuid:=gen_random_uuid(); stamp timestamptz; acquired_at timestamptz; tenant_active boolean;
  notice public.notifications;
BEGIN
  -- Definer is needed to lock an operator-owned binding without granting its UPDATE
  -- privilege to the application. Never callable by browser/JWT/Agent roles.
  IF (current_setting('role',true)='service_role' OR
      (current_setting('role',true)='none' AND session_user='service_role')) IS NOT TRUE THEN
    RAISE EXCEPTION 'FB_INBOX_SERVICE_ROLE_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'FB_INBOX_READ_COMMITTED_REQUIRED' USING ERRCODE='25001';
  END IF;
  -- Legacy triggers 145/392 use unqualified public names. Keep public before
  -- pg_temp, but accept it as a definer search path only when untrusted roles
  -- cannot CREATE there. No schema privilege is changed by this migration.
  IF has_schema_privilege('anon','public','CREATE') OR has_schema_privilege('authenticated','public','CREATE')
      OR has_schema_privilege('service_role','public','CREATE') THEN
    RAISE EXCEPTION 'FB_INBOX_SCHEMA_SCOPE_UNSAFE' USING ERRCODE='42501';
  END IF;
  IF to_regnamespace('crm_care_control') IS NOT NULL OR to_regclass('public.marketing_fb_lead_bindings') IS NOT NULL THEN
    RAISE EXCEPTION 'FB_INBOX_CARE_SCOPE_REVIEW_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.crm_leads'::regclass
      AND tgname IN ('trg_auto_gen_tasks_on_insert','trg_auto_gen_tasks_on_update') AND tgenabled<>'D') THEN
    RAISE EXCEPTION 'FB_INBOX_LEGACY_TASK_TRIGGER_REVIEW_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF p_inbox_id IS NULL OR p_lease_token IS NULL OR p_binding_version IS NULL OR p_binding_version<1 THEN
    RAISE EXCEPTION 'FB_INBOX_INVALID_INTAKE_REQUEST' USING ERRCODE='22023';
  END IF;
  SELECT * INTO item FROM public.facebook_page_inbox WHERE id=p_inbox_id FOR UPDATE;
  IF NOT FOUND OR item.status<>'processing' OR item.lease_token IS DISTINCT FROM p_lease_token
     OR item.locked_until<=clock_timestamp() THEN RAISE EXCEPTION 'FB_INBOX_LEASE_LOST' USING ERRCODE='40001'; END IF;
  event_value:=item.payload->'event'->'value';
  IF (item.payload->>'kind'='change' AND item.payload->'event'->>'field'='leadgen'
      AND jsonb_typeof(event_value)='object'
      AND event_value->>'form_id' ~ '^[0-9]{1,32}$' AND event_value->>'leadgen_id' ~ '^[0-9]{1,32}$'
      AND item.page_id ~ '^[0-9]{1,32}$'
      AND (NOT(event_value ? 'page_id') OR event_value->>'page_id'=item.page_id)) IS NOT TRUE THEN
    RAISE EXCEPTION 'FB_INBOX_LEAD_ADS_ENVELOPE_REQUIRED' USING ERRCODE='22023';
  END IF;
  form:=event_value->>'form_id'; leadgen:=event_value->>'leadgen_id';
  IF (jsonb_typeof(p_lead_data)='object' AND jsonb_typeof(p_lead_data->'full_name')='string'
      AND length(btrim(p_lead_data->>'full_name')) BETWEEN 1 AND 255
      AND p_lead_data->>'full_name'=btrim(p_lead_data->>'full_name')
      AND jsonb_typeof(p_lead_data->'phone')='string' AND p_lead_data->>'phone' ~ '^0[1-9][0-9]{8}$'
      AND (NOT(p_lead_data ? 'email') OR p_lead_data->'email'='null'::jsonb OR
        (jsonb_typeof(p_lead_data->'email')='string' AND length(p_lead_data->>'email')<=255))
      AND (NOT(p_lead_data ? 'address') OR p_lead_data->'address'='null'::jsonb OR
        (jsonb_typeof(p_lead_data->'address')='string' AND length(p_lead_data->>'address')<=4000))
      AND (NOT(p_lead_data ? 'description') OR p_lead_data->'description'='null'::jsonb OR
        (jsonb_typeof(p_lead_data->'description')='string' AND length(p_lead_data->>'description')<=16000))
      AND jsonb_typeof(p_lead_data->'field_data') IN ('array','object')
      AND pg_column_size(p_lead_data)<=100000) IS NOT TRUE THEN
    RAISE EXCEPTION 'FB_INBOX_LEAD_DATA_INVALID' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_lead_data) x WHERE x NOT IN
      ('full_name','phone','email','address','description','field_data')) THEN
    RAISE EXCEPTION 'FB_INBOX_LEAD_DATA_INVALID' USING ERRCODE='22023';
  END IF;
  IF (jsonb_typeof(p_provider_data)='object' AND p_provider_data->>'id'=leadgen
      AND p_provider_data->>'form_id'=form AND p_provider_data->>'form_page_id'=item.page_id
      AND jsonb_typeof(p_provider_data->'field_data')='array' AND pg_column_size(p_provider_data)<=200000
      AND (NOT(event_value ? 'ad_id') OR (event_value->>'ad_id' IS NOT NULL
        AND p_provider_data->>'ad_id'=event_value->>'ad_id'))) IS NOT TRUE THEN
    RAISE EXCEPTION 'FB_INBOX_PROVIDER_IDENTITY_MISMATCH' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_provider_data) x WHERE x IN
      ('access_token','app_secret','authorization','headers','credential')) THEN
    RAISE EXCEPTION 'FB_INBOX_PROVIDER_CREDENTIAL_FORBIDDEN' USING ERRCODE='22023';
  END IF;
  IF p_provider_data ? 'created_time' THEN
    BEGIN
      acquired_at:=(p_provider_data->>'created_time')::timestamptz;
      IF acquired_at IS NULL OR NOT isfinite(acquired_at) THEN RAISE EXCEPTION 'invalid time'; END IF;
    EXCEPTION WHEN others THEN RAISE EXCEPTION 'FB_INBOX_PROVIDER_TIME_INVALID' USING ERRCODE='22023'; END;
  END IF;
  v_phone:=p_lead_data->>'phone'; full_name:=p_lead_data->>'full_name'; email:=nullif(p_lead_data->>'email','');
  -- Identity lock is global because the legacy leadgen_id constraint is global too.
  PERFORM pg_advisory_xact_lock(hashtextextended('facebook.lead_ads.intake:'||leadgen,0));
  SELECT * INTO receipt FROM public.facebook_lead_ads_intake_receipts WHERE leadgen_id=leadgen;
  IF FOUND AND (receipt.page_id IS DISTINCT FROM item.page_id OR receipt.form_id IS DISTINCT FROM form
      OR receipt.lead_data IS DISTINCT FROM p_lead_data OR receipt.provider_data IS DISTINCT FROM p_provider_data) THEN
    RAISE EXCEPTION 'FB_INBOX_LEAD_RECEIPT_CONFLICT' USING ERRCODE='23505';
  END IF;
  -- Existing contact is locked before Page, matching the order used by RPC639.
  IF receipt.id IS NOT NULL THEN
    SELECT * INTO contact FROM public.facebook_contacts WHERE id=receipt.contact_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'FB_INBOX_LEAD_RECEIPT_REVIEW_REQUIRED' USING ERRCODE='40001'; END IF;
  END IF;
  SELECT * INTO page FROM public.facebook_pages WHERE page_id=item.page_id FOR SHARE;
  IF NOT FOUND OR page.is_active IS NOT TRUE OR page.auto_create_lead IS NOT TRUE
      OR coalesce(nullif(btrim(page.default_module_key),''),'crm')<>'crm'
      OR coalesce(nullif(btrim(page.default_target_type),''),'lead')<>'lead' THEN
    RAISE EXCEPTION 'FB_INBOX_PAGE_INTAKE_DISABLED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO binding FROM public.facebook_lead_ads_bindings WHERE page_id=item.page_id AND form_id=form FOR SHARE;
  IF NOT FOUND OR binding.active IS NOT TRUE OR binding.version<>p_binding_version
      OR binding.company_id IS DISTINCT FROM page.default_company_id THEN
    RAISE EXCEPTION 'FB_INBOX_LEAD_BINDING_CHANGED' USING ERRCODE='40001';
  END IF;
  SELECT * INTO company FROM public.companies WHERE id=binding.company_id FOR SHARE;
  IF NOT FOUND OR company.is_active IS NOT TRUE OR company.tenant_id IS NULL THEN RAISE EXCEPTION 'FB_INBOX_COMPANY_UNAVAILABLE' USING ERRCODE='42501'; END IF;
  SELECT * INTO recipient FROM public.users WHERE id=binding.recipient_id FOR SHARE;
  -- Current company-bound Admin/Sales Admin is the configured receiving authority.
  -- No lookup by display name/email, no fallback Page creator/system administrator.
  IF NOT FOUND OR recipient.is_active IS NOT TRUE OR recipient.company_id IS DISTINCT FROM company.id
      OR recipient.tenant_id IS DISTINCT FROM company.tenant_id
      OR (lower(btrim(recipient.role::text)) IN ('admin','sales_admin')) IS NOT TRUE THEN
    RAISE EXCEPTION 'FB_INBOX_LEAD_RECIPIENT_UNAVAILABLE' USING ERRCODE='42501';
  END IF;
  IF company.tenant_id IS NOT NULL THEN
    SELECT is_active INTO tenant_active FROM public.tenants WHERE id=company.tenant_id FOR SHARE;
    IF NOT FOUND OR tenant_active IS NOT TRUE THEN RAISE EXCEPTION 'FB_INBOX_TENANT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
  END IF;
  SELECT * INTO pipeline FROM public.crm_pipelines WHERE id=binding.pipeline_id FOR SHARE;
  IF NOT FOUND OR pipeline.is_active IS NOT TRUE OR pipeline.company_id IS DISTINCT FROM company.id THEN
    RAISE EXCEPTION 'FB_INBOX_PIPELINE_SCOPE_INVALID' USING ERRCODE='42501';
  END IF;
  SELECT * INTO stage FROM public.crm_pipeline_stages WHERE id=binding.stage_id FOR SHARE;
  IF NOT FOUND OR stage.is_active IS NOT TRUE OR stage.pipeline_id IS DISTINCT FROM pipeline.id
      OR (stage.pipeline_type IN ('lead','both')) IS NOT TRUE OR stage.is_won IS TRUE OR stage.is_lost IS TRUE THEN
    RAISE EXCEPTION 'FB_INBOX_LEAD_STAGE_INVALID' USING ERRCODE='42501';
  END IF;
  SELECT * INTO source FROM public.crm_sources WHERE id=binding.source_id FOR SHARE;
  IF NOT FOUND OR source.is_active IS NOT TRUE OR source.company_id IS DISTINCT FROM company.id THEN
    RAISE EXCEPTION 'FB_INBOX_SOURCE_SCOPE_INVALID' USING ERRCODE='42501';
  END IF;
  IF binding.region_id IS NOT NULL THEN
    SELECT * INTO region FROM public.company_regions WHERE id=binding.region_id FOR SHARE;
    IF NOT FOUND OR region.is_active IS NOT TRUE OR region.company_id IS DISTINCT FROM company.id THEN
      RAISE EXCEPTION 'FB_INBOX_REGION_SCOPE_INVALID' USING ERRCODE='42501';
    END IF;
  END IF;
  -- Row locks cannot protect the absence of a newly blocked phone. Brief SHARE
  -- lock makes block/unblock serialize with the whole intake (lock timeout bound).
  LOCK TABLE public.crm_auto_lead_blocked_phones IN SHARE MODE;
  IF EXISTS(SELECT 1 FROM public.crm_auto_lead_blocked_phones WHERE phone_last9=right(v_phone,9)) THEN
    RAISE EXCEPTION 'FB_INBOX_LEAD_PHONE_BLOCKED' USING ERRCODE='42501';
  END IF;
  IF receipt.id IS NOT NULL THEN
    IF receipt.company_id IS DISTINCT FROM binding.company_id OR receipt.recipient_id IS DISTINCT FROM binding.recipient_id
        OR receipt.pipeline_id IS DISTINCT FROM binding.pipeline_id OR receipt.stage_id IS DISTINCT FROM binding.stage_id
        OR receipt.source_id IS DISTINCT FROM binding.source_id OR receipt.region_id IS DISTINCT FROM binding.region_id
        OR receipt.binding_version<>binding.version THEN
      RAISE EXCEPTION 'FB_INBOX_LEAD_BINDING_CHANGED' USING ERRCODE='40001';
    END IF;
    SELECT * INTO lead FROM public.crm_leads WHERE id=receipt.lead_id FOR SHARE;
    IF NOT FOUND OR lead.company_id IS DISTINCT FROM company.id OR lead.type IS DISTINCT FROM 'lead'
        OR lead.customer_id IS DISTINCT FROM receipt.customer_id OR lead.facebook_contact_id IS DISTINCT FROM receipt.contact_id
        OR lead.assigned_to IS DISTINCT FROM recipient.id OR lead.lead_owner_id IS DISTINCT FROM recipient.id THEN
      RAISE EXCEPTION 'FB_INBOX_LEAD_RECEIPT_REVIEW_REQUIRED' USING ERRCODE='40001';
    END IF;
    SELECT * INTO customer FROM public.customers WHERE id=receipt.customer_id FOR SHARE;
    IF NOT FOUND OR customer.company_id IS DISTINCT FROM company.id
        OR contact.page_id IS DISTINCT FROM item.page_id OR contact.psid IS DISTINCT FROM 'leadad_'||leadgen
        OR contact.lead_id IS DISTINCT FROM lead.id OR contact.customer_id IS DISTINCT FROM customer.id THEN
      RAISE EXCEPTION 'FB_INBOX_LEAD_RECEIPT_REVIEW_REQUIRED' USING ERRCODE='40001';
    END IF;
    SELECT * INTO ad FROM public.facebook_lead_ads WHERE id=receipt.lead_ad_id FOR SHARE;
    IF NOT FOUND OR ad.page_id IS DISTINCT FROM item.page_id OR ad.form_id IS DISTINCT FROM form OR ad.leadgen_id IS DISTINCT FROM leadgen
        OR ad.lead_id IS DISTINCT FROM lead.id OR ad.customer_id IS DISTINCT FROM customer.id OR ad.processed IS NOT TRUE THEN
      RAISE EXCEPTION 'FB_INBOX_LEAD_RECEIPT_REVIEW_REQUIRED' USING ERRCODE='40001';
    END IF;
    SELECT * INTO attribution FROM public.lead_attribution WHERE id=receipt.attribution_id FOR SHARE;
    IF NOT FOUND OR attribution.lead_id IS DISTINCT FROM lead.id OR attribution.company_id IS DISTINCT FROM company.id
        OR attribution.contact_id IS DISTINCT FROM contact.id OR attribution.customer_id IS DISTINCT FROM customer.id
        OR attribution.fb_page_id IS DISTINCT FROM item.page_id OR attribution.fb_form_id IS DISTINCT FROM form
        OR attribution.fb_leadgen_id IS DISTINCT FROM leadgen THEN
      RAISE EXCEPTION 'FB_INBOX_LEAD_RECEIPT_REVIEW_REQUIRED' USING ERRCODE='40001';
    END IF;
    SELECT * INTO notice FROM public.notifications WHERE id=receipt.notification_id FOR SHARE;
    IF NOT FOUND OR notice.user_id IS DISTINCT FROM recipient.id OR notice.entity_id::text IS DISTINCT FROM lead.id::text
        OR notice.entity_type IS DISTINCT FROM 'crm_lead' OR notice.type::text IS DISTINCT FROM 'system'
        OR notice.metadata->>'receiptId' IS DISTINCT FROM receipt.id::text
        OR notice.metadata->>'companyId' IS DISTINCT FROM company.id::text THEN
      RAISE EXCEPTION 'FB_INBOX_LEAD_HANDOFF_REVIEW_REQUIRED' USING ERRCODE='40001';
    END IF;
    IF item.locked_until<=clock_timestamp() THEN RAISE EXCEPTION 'FB_INBOX_LEASE_LOST' USING ERRCODE='40001'; END IF;
    RETURN jsonb_build_object('status','existing','leadId',receipt.lead_id,'customerId',receipt.customer_id,
      'contactId',receipt.contact_id,'receiptId',receipt.id,'recipientId',receipt.recipient_id);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('facebook.lead_ads.phone:'||company.id::text||':'||v_phone,0));
  IF EXISTS(SELECT 1 FROM public.facebook_lead_ads WHERE leadgen_id=leadgen)
      OR EXISTS(SELECT 1 FROM public.facebook_contacts WHERE page_id=item.page_id AND psid='leadad_'||leadgen) THEN
    RAISE EXCEPTION 'FB_INBOX_LEAD_RECEIPT_REVIEW_REQUIRED' USING ERRCODE='40001';
  END IF;
  IF EXISTS(SELECT 1 FROM public.customers c WHERE c.company_id=company.id
      AND regexp_replace(regexp_replace(c.phone,'[^0-9]','','g'),'^(0084|84)','0')=v_phone) THEN
    RAISE EXCEPTION 'FB_INBOX_LEAD_PHONE_REVIEW_REQUIRED' USING ERRCODE='40001';
  END IF;
  IF item.locked_until<=clock_timestamp() THEN RAISE EXCEPTION 'FB_INBOX_LEASE_LOST' USING ERRCODE='40001'; END IF;
  stamp:=clock_timestamp();
  INSERT INTO public.customers(id,full_name,phone,email,address,source,company_id,assigned_to)
    VALUES(new_customer,full_name,v_phone,email,p_lead_data->>'address','Facebook',company.id,recipient.id);
  INSERT INTO public.facebook_contacts(id,page_id,psid,fb_name,phone,email,customer_id)
    VALUES(new_contact,item.page_id,'leadad_'||leadgen,full_name,v_phone,email,new_customer);
  -- Separate prefix avoids contaminating the legacy LEAD-% numeric MAX+1 parser.
  -- UUID avoids code races without resetting or sharing the old counter.
  INSERT INTO public.crm_leads(id,code,title,type,customer_id,stage_id,source_id,pipeline_id,company_id,
      region_id,assigned_to,lead_owner_id,created_by,description,facebook_contact_id)
    VALUES(new_lead,'FBLEAD-'||new_lead::text,full_name,'lead',new_customer,stage.id,source.id,pipeline.id,company.id,
      binding.region_id,recipient.id,recipient.id,NULL,p_lead_data->>'description',new_contact);
  UPDATE public.facebook_contacts SET lead_id=new_lead,updated_at=stamp WHERE id=new_contact;
  INSERT INTO public.facebook_lead_ads(id,page_id,leadgen_id,form_id,field_data,full_name,phone,email,raw_data,customer_id,lead_id,processed)
    VALUES(new_ad,item.page_id,leadgen,form,p_lead_data->'field_data',full_name,v_phone,email,p_provider_data,new_customer,new_lead,true);
  INSERT INTO public.lead_attribution(id,lead_id,contact_id,customer_id,company_id,kenh,platform,
      fb_page_id,fb_form_id,fb_leadgen_id,fb_ad_id,fb_adset_id,fb_campaign_id,cham_dau_luc,raw)
    VALUES(new_attr,new_lead,new_contact,new_customer,company.id,'lead_ads',coalesce(p_provider_data->>'platform','facebook'),
      item.page_id,form,leadgen,p_provider_data->>'ad_id',p_provider_data->>'adset_id',p_provider_data->>'campaign_id',
      coalesce(acquired_at,stamp),jsonb_build_object('intake_receipt_id',new_receipt,'provider_data',p_provider_data,
        'acquired_time_known',acquired_at IS NOT NULL,'paid_status','UNVERIFIED'));
  INSERT INTO public.notifications(id,user_id,type,title,message,entity_type,entity_id,metadata)
    VALUES(new_notification,recipient.id,'system','Lead mới từ biểu mẫu Facebook',full_name,
      'crm_lead',new_lead,jsonb_build_object('kind','facebook_lead_ads_intake','receiptId',new_receipt,'companyId',company.id));
  INSERT INTO public.facebook_lead_ads_intake_receipts(id,page_id,form_id,leadgen_id,inbox_id,binding_version,company_id,
      recipient_id,pipeline_id,stage_id,source_id,region_id,lead_id,customer_id,contact_id,attribution_id,lead_ad_id,
      notification_id,lead_data,provider_data)
    VALUES(new_receipt,item.page_id,form,leadgen,item.id,binding.version,company.id,recipient.id,pipeline.id,stage.id,
      source.id,binding.region_id,new_lead,new_customer,new_contact,new_attr,new_ad,new_notification,p_lead_data,p_provider_data);
  -- FK/trigger work may wait after earlier checks. Throwing rolls back every new row.
  IF item.locked_until<=clock_timestamp() THEN RAISE EXCEPTION 'FB_INBOX_LEASE_LOST' USING ERRCODE='40001'; END IF;
  RETURN jsonb_build_object('status','created','leadId',new_lead,'customerId',new_customer,
    'contactId',new_contact,'receiptId',new_receipt,'recipientId',recipient.id);
END;
$$;

REVOKE ALL ON FUNCTION public.facebook_lead_ads_binding_revision_v1(),public.facebook_lead_ads_receipt_immutable_v1()
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.facebook_page_inbox_claim_lead_ads_v1(uuid,text[]),
  public.facebook_lead_ads_intake_v1(uuid,uuid,integer,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.facebook_page_inbox_claim_lead_ads_v1(uuid,text[]),
  public.facebook_lead_ads_intake_v1(uuid,uuid,integer,jsonb,jsonb) TO service_role;
COMMENT ON TABLE public.facebook_lead_ads_bindings IS 'Operator-configured explicit Page/form intake; empty and inactive by default. Company Admin receiving scope, not Agent/send/paid-Lead approval.';
COMMENT ON TABLE public.facebook_lead_ads_intake_receipts IS 'Immutable atomic Customer/Lead/contact/source/notification handoff proof. No tasks, paid qualification or external notification delivery claim.';
COMMIT;
