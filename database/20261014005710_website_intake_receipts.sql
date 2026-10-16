-- Additive website intake evidence. Legacy rows remain NULL; no historical backfill.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
ALTER TABLE public.crm_leads ADD COLUMN website_intake jsonb;
CREATE TABLE public.website_intake_receipts (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL,
  lead_id uuid NOT NULL UNIQUE,
  customer_id uuid NOT NULL,
  api_key_id uuid NOT NULL,
  form_id text NOT NULL CHECK(form_id='11116'),
  site_host text NOT NULL CHECK(site_host='vanphuthanh.net'),
  submitted_at timestamptz NOT NULL,
  saved_at timestamptz NOT NULL,
  landing_url text NOT NULL CHECK(length(landing_url)<=1000),
  source jsonb NOT NULL CHECK(jsonb_typeof(source)='object'),
  fbc text,
  fbp text,
  captured_at timestamptz,
  measurement_consent boolean NOT NULL,
  consent_version text NOT NULL CHECK(consent_version='VPT_ADS_V1'),
  CHECK(submitted_at<=saved_at),
  CHECK(captured_at IS NULL OR captured_at<=submitted_at)
);
ALTER TABLE public.website_intake_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.website_intake_receipts FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.website_intake_receipts TO service_role;

-- Resolve the dedicated integration privately. Its UUID is a credential in
-- legacy auth, so only a one-way fingerprint may enter the public Lead JSON.
CREATE FUNCTION public.website_intake_key_v1(p_company_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE key_id uuid; matches bigint;
BEGIN
  IF current_user<>'service_role' THEN RAISE EXCEPTION 'WEB_SERVICE_ROLE_REQUIRED' USING ERRCODE='42501'; END IF;
  IF p_company_id IS DISTINCT FROM '991dc79d-cbf5-49f9-a364-35227cb47635'::uuid
  THEN RAISE EXCEPTION 'WEB_INTAKE_INVALID' USING ERRCODE='22023'; END IF;
  SELECT min(k.id::text)::uuid,count(*) INTO key_id,matches FROM public.external_api_keys k
    WHERE k.company_id=p_company_id AND k.name='VPT_V1_CF7_CRM_Admin_HCM' AND k.active IS TRUE;
  IF matches<>1 THEN RAISE EXCEPTION 'WEB_INTAKE_INVALID' USING ERRCODE='22023'; END IF;
  RETURN key_id;
END $$;

CREATE FUNCTION public.website_intake_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE m jsonb; submitted timestamptz; captured timestamptz; key_id uuid;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.website_intake IS DISTINCT FROM OLD.website_intake THEN
      RAISE EXCEPTION 'WEB_INTAKE_IMMUTABLE' USING ERRCODE='22023';
    END IF;
    RETURN NEW;
  END IF;
  m:=NEW.website_intake;
  IF m IS NULL THEN RETURN NEW; END IF;
  IF current_user<>'service_role' THEN RAISE EXCEPTION 'WEB_SERVICE_ROLE_REQUIRED' USING ERRCODE='42501'; END IF;
  key_id:=public.website_intake_key_v1(NEW.company_id);
  IF NEW.company_id<>'991dc79d-cbf5-49f9-a364-35227cb47635'::uuid OR NEW.customer_id IS NULL
    OR jsonb_typeof(m)<>'object' OR m->'version' IS DISTINCT FROM '1'::jsonb
    OR (m-ARRAY['version','request_id','form_id','site_host','submitted_at','landing_url','captured_at',
      'fbc','fbp','measurement_consent','consent_version','api_key_fingerprint'])<>'{}'::jsonb
    OR NOT(m ?& ARRAY['version','request_id','form_id','site_host','submitted_at','landing_url','captured_at',
      'fbc','fbp','measurement_consent','consent_version','api_key_fingerprint'])
    OR (m->>'request_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') IS NOT TRUE
    OR jsonb_typeof(m->'api_key_fingerprint') IS DISTINCT FROM 'string'
    OR m->>'api_key_fingerprint' IS DISTINCT FROM encode(sha256(convert_to(key_id::text,'UTF8')),'hex')
    OR m->>'form_id'<>'11116' OR m->>'site_host'<>'vanphuthanh.net' OR m->>'consent_version'<>'VPT_ADS_V1'
    OR jsonb_typeof(m->'measurement_consent') IS DISTINCT FROM 'boolean'
    OR (m->>'landing_url' ~ '^https://vanphuthanh\.net/[^?#[:cntrl:]]*$') IS NOT TRUE
    OR length(m->>'landing_url')>1000 OR NEW.intake_attribution->>'kenh' IS DISTINCT FROM 'website'
    OR NEW.intake_attribution->>'landing_url' IS DISTINCT FROM m->>'landing_url'
  THEN RAISE EXCEPTION 'WEB_INTAKE_INVALID' USING ERRCODE='22023'; END IF;
  BEGIN
    submitted:=(m->>'submitted_at')::timestamptz;
    captured:=(m->>'captured_at')::timestamptz;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'WEB_INTAKE_TIME_INVALID' USING ERRCODE='22023';
  END;
  IF NEW.created_at IS NULL OR NEW.created_at>clock_timestamp() OR submitted IS NULL
    OR submitted>NEW.created_at OR submitted<NEW.created_at-interval '30 days'
    OR (captured IS NOT NULL AND captured>submitted)
  THEN RAISE EXCEPTION 'WEB_INTAKE_TIME_INVALID' USING ERRCODE='22023'; END IF;
  IF m->'measurement_consent'='false'::jsonb AND
    (m->'fbc' IS DISTINCT FROM 'null'::jsonb OR m->'fbp' IS DISTINCT FROM 'null'::jsonb OR m->'captured_at' IS DISTINCT FROM 'null'::jsonb)
  THEN RAISE EXCEPTION 'WEB_INTAKE_CONSENT_INVALID' USING ERRCODE='22023'; END IF;
  IF m->'fbc' IS DISTINCT FROM 'null'::jsonb THEN
    IF jsonb_typeof(m->'fbc') IS DISTINCT FROM 'string'
      OR (m->>'fbc' ~ '^fb\.[0-2]\.[0-9]{13}\.[A-Za-z0-9_-]+$') IS NOT TRUE
      OR length(split_part(m->>'fbc','.',4))>500
      OR captured IS NULL OR split_part(m->>'fbc','.',3)::bigint<>floor(extract(epoch FROM captured)*1000)::bigint
      OR split_part(m->>'fbc','.',4) IS DISTINCT FROM NEW.intake_attribution->>'fbclid'
    THEN RAISE EXCEPTION 'WEB_INTAKE_MATCH_INVALID' USING ERRCODE='22023'; END IF;
  ELSIF captured IS NOT NULL THEN RAISE EXCEPTION 'WEB_INTAKE_MATCH_INVALID' USING ERRCODE='22023'; END IF;
  IF m->'fbp' IS DISTINCT FROM 'null'::jsonb THEN
    IF jsonb_typeof(m->'fbp') IS DISTINCT FROM 'string'
      OR (m->>'fbp' ~ '^fb\.[0-2]\.[0-9]{13}\.[0-9]{1,30}$') IS NOT TRUE
      OR split_part(m->>'fbp','.',3)::bigint>floor(extract(epoch FROM submitted)*1000)::bigint
    THEN RAISE EXCEPTION 'WEB_INTAKE_MATCH_INVALID' USING ERRCODE='22023'; END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION public.website_intake_receipt_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE l public.crm_leads; m jsonb; key_id uuid;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'WEB_RECEIPT_IMMUTABLE' USING ERRCODE='22023'; END IF;
  IF current_user<>'service_role' THEN RAISE EXCEPTION 'WEB_SERVICE_ROLE_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO l FROM public.crm_leads WHERE id=NEW.lead_id;
  m:=l.website_intake;
  key_id:=public.website_intake_key_v1(NEW.company_id);
  IF NOT FOUND OR m IS NULL
    OR NEW.id IS DISTINCT FROM (m->>'request_id')::uuid
    OR NEW.company_id IS DISTINCT FROM l.company_id OR NEW.customer_id IS DISTINCT FROM l.customer_id
    OR NEW.api_key_id IS DISTINCT FROM key_id
    OR m->>'api_key_fingerprint' IS DISTINCT FROM encode(sha256(convert_to(key_id::text,'UTF8')),'hex')
    OR NEW.source IS DISTINCT FROM l.intake_attribution
    OR NEW.saved_at IS DISTINCT FROM l.created_at OR NEW.submitted_at IS DISTINCT FROM (m->>'submitted_at')::timestamptz
    OR NEW.form_id IS DISTINCT FROM m->>'form_id' OR NEW.site_host IS DISTINCT FROM m->>'site_host'
    OR NEW.landing_url IS DISTINCT FROM m->>'landing_url' OR NEW.fbc IS DISTINCT FROM m->>'fbc'
    OR NEW.fbp IS DISTINCT FROM m->>'fbp' OR NEW.captured_at IS DISTINCT FROM (m->>'captured_at')::timestamptz
    OR NEW.measurement_consent IS DISTINCT FROM (m->>'measurement_consent')::boolean
    OR NEW.consent_version IS DISTINCT FROM m->>'consent_version'
  THEN RAISE EXCEPTION 'WEB_RECEIPT_PROJECTION_INVALID' USING ERRCODE='22023'; END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION public.website_intake_project_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE m jsonb:=NEW.website_intake; key_id uuid;
BEGIN
  IF m IS NULL THEN RETURN NEW; END IF;
  key_id:=public.website_intake_key_v1(NEW.company_id);
  INSERT INTO public.website_intake_receipts(id,company_id,lead_id,customer_id,api_key_id,form_id,site_host,
    submitted_at,saved_at,landing_url,source,fbc,fbp,captured_at,measurement_consent,consent_version)
  VALUES((m->>'request_id')::uuid,NEW.company_id,NEW.id,NEW.customer_id,key_id,
    m->>'form_id',m->>'site_host',(m->>'submitted_at')::timestamptz,NEW.created_at,m->>'landing_url',NEW.intake_attribution,
    m->>'fbc',m->>'fbp',(m->>'captured_at')::timestamptz,(m->>'measurement_consent')::boolean,m->>'consent_version');
  RETURN NEW;
END $$;
CREATE TRIGGER website_intake_guard_v1 BEFORE INSERT OR UPDATE ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.website_intake_guard_v1();
CREATE TRIGGER website_intake_project_v1 AFTER INSERT ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.website_intake_project_v1();
CREATE TRIGGER website_intake_receipt_guard_v1 BEFORE INSERT OR UPDATE OR DELETE ON public.website_intake_receipts
  FOR EACH ROW EXECUTE FUNCTION public.website_intake_receipt_guard_v1();
REVOKE ALL ON FUNCTION public.website_intake_key_v1(uuid),public.website_intake_guard_v1(),public.website_intake_project_v1(),public.website_intake_receipt_guard_v1()
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.website_intake_key_v1(uuid),public.website_intake_guard_v1(),public.website_intake_project_v1(),public.website_intake_receipt_guard_v1()
  TO service_role;
COMMENT ON TABLE public.website_intake_receipts IS 'Website11116 intake snapshot, atomic with saved Lead/projection. Consent false never exports matching IDs. Not proof Meta attributed a paid click. No historical fabrication.';
COMMIT;
