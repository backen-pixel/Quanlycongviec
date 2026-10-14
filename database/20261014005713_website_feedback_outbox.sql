-- Website-qualified Meta feedback only; no native Form or initial browser Lead dispatch.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';

CREATE TABLE public.website_feedback_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  dataset_id text NOT NULL CHECK(dataset_id ~ '^[0-9]{1,32}$'),
  ad_account_id text NOT NULL CHECK(ad_account_id ~ '^act_[0-9]{1,32}$'),
  site_host text NOT NULL CHECK(site_host='vanphuthanh.net'),
  mode text NOT NULL CHECK(mode IN ('test','production')),
  event_id text NOT NULL CHECK(event_id ~ '^vptw_[a-f0-9]{56}$'),
  identity_key text NOT NULL CHECK(identity_key ~ '^[a-f0-9]{64}$'),
  event_name text NOT NULL CHECK(event_name='VPTCRMQualifiedLead'),
  lead_id uuid NOT NULL,
  source_receipt_id uuid NOT NULL,
  landing_url text NOT NULL CHECK(landing_url ~ '^https://vanphuthanh\.net/[^?#[:cntrl:]]*$'),
  fbclid text NOT NULL CHECK(fbclid ~ '^[A-Za-z0-9_-]+$' AND length(fbclid) BETWEEN 1 AND 500),
  captured_ms bigint NOT NULL CHECK(captured_ms>0 AND captured_ms<=9007199254740991),
  qualification_id uuid NOT NULL,
  qualification_revision integer NOT NULL,
  context_hash text NOT NULL CHECK(context_hash ~ '^[a-f0-9]{64}$'),
  payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','accepted','held','unknown','cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
  lease_token uuid,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  accepted_at timestamptz,
  fbtrace_id text CHECK(fbtrace_id IS NULL OR fbtrace_id ~ '^[A-Za-z0-9_-]{1,200}$'),
  stale boolean NOT NULL DEFAULT false,
  reason_code text CHECK(reason_code IS NULL OR reason_code ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  UNIQUE(company_id,dataset_id,identity_key,event_name,mode),
  UNIQUE(mode,event_id),
  CHECK(qualification_id IS NOT NULL AND qualification_revision>=1),
  CHECK((status='processing' AND lease_token IS NOT NULL AND locked_until IS NOT NULL)
    OR (status<>'processing' AND lease_token IS NULL AND locked_until IS NULL)),
  CHECK((status='accepted' AND accepted_at IS NOT NULL AND fbtrace_id IS NOT NULL)
    OR (status<>'accepted' AND accepted_at IS NULL AND fbtrace_id IS NULL))
);
CREATE INDEX web_feedback_pending_idx ON public.website_feedback_outbox(company_id,dataset_id,mode,created_at,id)
  WHERE status='pending';
CREATE TABLE public.website_feedback_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id uuid NOT NULL REFERENCES public.website_feedback_outbox(id),
  lease_token uuid NOT NULL UNIQUE,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  finished_at timestamptz,
  status text NOT NULL CHECK(status IN ('processing','accepted','held','unknown','cancelled')),
  receipt jsonb CHECK(receipt IS NULL OR jsonb_typeof(receipt)='object'),
  reason_code text CHECK(reason_code IS NULL OR reason_code ~ '^[A-Z][A-Z0-9_]{0,63}$')
);
ALTER TABLE public.website_feedback_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_feedback_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.website_feedback_outbox,public.website_feedback_attempts FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.website_feedback_outbox,public.website_feedback_attempts TO service_role;

CREATE FUNCTION public.web_feedback_assert_target_v1(p_target jsonb,p_mode text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF current_user<>'service_role' THEN RAISE EXCEPTION 'META_SERVICE_ROLE_REQUIRED' USING ERRCODE='42501'; END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('test','production') OR p_target IS NULL
    OR jsonb_typeof(p_target)<>'object' OR (p_target-ARRAY['company_id','dataset_id','ad_account_id','site_host'])<>'{}'::jsonb
    OR (p_target->>'company_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') IS NOT TRUE
    OR (p_target->>'dataset_id' ~ '^[0-9]{1,32}$') IS NOT TRUE
    OR (p_target->>'site_host'='vanphuthanh.net') IS NOT TRUE
    OR (p_target->>'ad_account_id' ~ '^act_[0-9]{1,32}$') IS NOT TRUE
  THEN RAISE EXCEPTION 'META_TARGET_INVALID' USING ERRCODE='22023'; END IF;
END $$;

CREATE FUNCTION public.web_feedback_source_current_v1(p_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' SET statement_timeout='5s' AS $$
DECLARE item public.website_feedback_outbox; receipt public.website_intake_receipts; prior public.p1_qualification_events;
  expected_user jsonb; expected_payload jsonb;
BEGIN
  IF current_user<>'service_role' THEN RAISE EXCEPTION 'META_SERVICE_ROLE_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO item FROM public.website_feedback_outbox WHERE id=p_id;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT r.* INTO receipt FROM public.website_intake_receipts r JOIN public.crm_leads l ON l.id=r.lead_id
    WHERE r.id=item.source_receipt_id AND r.lead_id=item.lead_id AND r.company_id=item.company_id
      AND r.customer_id=l.customer_id AND l.company_id=r.company_id AND l.type IN ('lead','deal') AND l.is_test IS FALSE
      AND r.site_host=item.site_host AND r.form_id='11116' AND r.source=l.intake_attribution
      AND l.website_intake->>'request_id'=r.id::text
      AND l.website_intake->>'api_key_fingerprint'=encode(sha256(convert_to(r.api_key_id::text,'UTF8')),'hex')
      AND r.saved_at=l.created_at AND r.landing_url=item.landing_url;
  IF NOT FOUND OR receipt.measurement_consent IS NOT TRUE OR receipt.consent_version<>'VPT_ADS_V1'
    OR receipt.fbc IS NULL OR receipt.captured_at IS NULL OR receipt.source->>'kenh'<>'website'
    OR (receipt.source->>'platform' IN ('facebook','instagram')) IS NOT TRUE
    OR receipt.source->>'fbclid' IS DISTINCT FROM item.fbclid
    OR nullif(btrim(receipt.source->>'gclid'),'') IS NOT NULL
    OR nullif(btrim(receipt.source->>'gbraid'),'') IS NOT NULL OR nullif(btrim(receipt.source->>'wbraid'),'') IS NOT NULL
    OR receipt.fbc !~ '^fb[.][0-2][.][0-9]{13}[.][A-Za-z0-9_-]+$' OR length(receipt.fbc)>519
    OR split_part(receipt.fbc,'.',3) IS DISTINCT FROM item.captured_ms::text
    OR split_part(receipt.fbc,'.',4) IS DISTINCT FROM item.fbclid
    OR item.captured_ms IS DISTINCT FROM floor(extract(epoch FROM receipt.captured_at)*1000)::bigint
    OR receipt.captured_at>receipt.submitted_at OR receipt.submitted_at>receipt.saved_at
    OR (receipt.fbp IS NOT NULL AND (receipt.fbp !~ '^fb[.][0-2][.][0-9]{13}[.][0-9]{1,30}$'
      OR split_part(receipt.fbp,'.',3)::bigint>floor(extract(epoch FROM receipt.submitted_at)*1000))) THEN RETURN false; END IF;
  SELECT * INTO prior FROM public.p1_qualification_events WHERE company_id=item.company_id
    AND canonical_lead_id=item.lead_id ORDER BY revision DESC LIMIT 1;
  IF prior.id IS NULL OR prior.id IS DISTINCT FROM item.qualification_id OR prior.revision IS DISTINCT FROM item.qualification_revision
    OR prior.context_hash IS DISTINCT FROM item.context_hash OR prior.status<>'QUALIFIED' OR prior.actor_id IS NULL
    OR prior.contact_usable IS NOT TRUE OR prior.need_in_scope IS NOT TRUE OR prior.area_in_service IS NOT TRUE
    OR nullif(btrim(prior.evidence_ref),'') IS NULL OR prior.recorded_at<=receipt.saved_at THEN RETURN false; END IF;
  expected_user:=jsonb_build_object('fbc',receipt.fbc,'external_id',jsonb_build_array(item.identity_key));
  IF receipt.fbp IS NOT NULL THEN expected_user:=expected_user||jsonb_build_object('fbp',receipt.fbp); END IF;
  expected_payload:=jsonb_build_object('event_name','VPTCRMQualifiedLead','event_time',floor(extract(epoch FROM prior.recorded_at))::bigint,
    'event_id',item.event_id,'action_source','system_generated','user_data',expected_user,
    'custom_data',jsonb_build_object('event_source','crm','lead_event_source','VPT CRM'));
  RETURN item.payload IS NOT DISTINCT FROM expected_payload;
END $$;

CREATE FUNCTION public.web_feedback_enqueue_v1(p_row jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET lock_timeout='2s' SET statement_timeout='5s' AS $$
DECLARE target jsonb; item public.website_feedback_outbox; epoch bigint;
BEGIN
  target:=jsonb_build_object('company_id',p_row->>'company_id','dataset_id',p_row->>'dataset_id',
    'ad_account_id',p_row->>'ad_account_id','site_host',p_row->>'site_host');
  PERFORM public.web_feedback_assert_target_v1(target,p_row->>'mode');
  IF p_row IS NULL OR jsonb_typeof(p_row)<>'object'
    OR (p_row-ARRAY['company_id','dataset_id','ad_account_id','site_host','mode','event_id','event_name','identity_key',
      'lead_id','source_receipt_id','context_hash','qualification_id','qualification_revision','landing_url','fbclid','captured_ms','payload'])<>'{}'::jsonb
    OR (p_row->>'event_id' ~ '^vptw_[a-f0-9]{56}$') IS NOT TRUE
    OR (p_row->>'identity_key' ~ '^[a-f0-9]{64}$') IS NOT TRUE OR (p_row->>'context_hash' ~ '^[a-f0-9]{64}$') IS NOT TRUE
    OR (p_row->>'event_name'='VPTCRMQualifiedLead') IS NOT TRUE
    OR (p_row->'payload'->>'event_time' ~ '^[0-9]{1,11}$') IS NOT TRUE
    OR jsonb_typeof(p_row->'fbclid') IS DISTINCT FROM 'string'
  THEN RAISE EXCEPTION 'META_EVENT_INVALID' USING ERRCODE='22023'; END IF;
  epoch:=(p_row->'payload'->>'event_time')::bigint;
  IF epoch>floor(extract(epoch FROM clock_timestamp())) OR epoch<floor(extract(epoch FROM clock_timestamp()))-604800
  THEN RAISE EXCEPTION 'META_EVENT_TIME_INVALID' USING ERRCODE='22023'; END IF;
  INSERT INTO public.website_feedback_outbox(company_id,dataset_id,ad_account_id,site_host,mode,event_id,identity_key,event_name,
    lead_id,source_receipt_id,qualification_id,qualification_revision,context_hash,landing_url,fbclid,captured_ms,payload)
  VALUES((p_row->>'company_id')::uuid,p_row->>'dataset_id',p_row->>'ad_account_id',p_row->>'site_host',p_row->>'mode',
    p_row->>'event_id',p_row->>'identity_key',p_row->>'event_name',(p_row->>'lead_id')::uuid,(p_row->>'source_receipt_id')::uuid,
    (p_row->>'qualification_id')::uuid,(p_row->>'qualification_revision')::integer,p_row->>'context_hash',p_row->>'landing_url',
    p_row->>'fbclid',(p_row->>'captured_ms')::bigint,p_row->'payload')
  ON CONFLICT(company_id,dataset_id,identity_key,event_name,mode) DO NOTHING;
  SELECT * INTO STRICT item FROM public.website_feedback_outbox WHERE company_id=(p_row->>'company_id')::uuid
    AND dataset_id=p_row->>'dataset_id' AND identity_key=p_row->>'identity_key' AND event_name=p_row->>'event_name'
    AND mode=p_row->>'mode' FOR UPDATE;
  IF item.event_id IS DISTINCT FROM p_row->>'event_id' OR item.site_host IS DISTINCT FROM p_row->>'site_host'
    OR item.ad_account_id IS DISTINCT FROM p_row->>'ad_account_id' OR item.lead_id IS DISTINCT FROM (p_row->>'lead_id')::uuid
    OR item.source_receipt_id IS DISTINCT FROM (p_row->>'source_receipt_id')::uuid
    OR item.landing_url IS DISTINCT FROM p_row->>'landing_url' OR item.fbclid IS DISTINCT FROM p_row->>'fbclid'
    OR item.captured_ms IS DISTINCT FROM (p_row->>'captured_ms')::bigint
  THEN RAISE EXCEPTION 'META_EVENT_KEY_CONFLICT' USING ERRCODE='23505'; END IF;
  -- Never reopen an attempted/accepted/unconfirmed event. Fresh unattempted proof
  -- may replace an unsent revision; source predicate below remains mandatory.
  IF item.attempts=0 AND item.status IN ('pending','held','cancelled') THEN
    UPDATE public.website_feedback_outbox SET payload=p_row->'payload',context_hash=p_row->>'context_hash',
      qualification_id=(p_row->>'qualification_id')::uuid,qualification_revision=(p_row->>'qualification_revision')::integer,
      status='pending',reason_code=NULL,stale=false,updated_at=clock_timestamp() WHERE id=item.id RETURNING * INTO item;
    IF NOT public.web_feedback_source_current_v1(item.id)
    THEN RAISE EXCEPTION 'META_SOURCE_CHANGED' USING ERRCODE='40001'; END IF;
  END IF;
  RETURN to_jsonb(item);
END $$;

-- An unresolved delivery or changed accepted identity is a per-target stop.
-- It never automatically clears merely because a source/catalog becomes fresh.
CREATE FUNCTION public.web_feedback_guard_v1(p_target jsonb,p_mode text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' SET statement_timeout='5s' AS $$
DECLARE unknown_count bigint; stale_count bigint; expired_count bigint; blocked boolean;
BEGIN
  PERFORM public.web_feedback_assert_target_v1(p_target,p_mode);
  SELECT count(*) FILTER(WHERE status='unknown'),count(*) FILTER(WHERE status='accepted' AND stale),
    count(*) FILTER(WHERE status='processing' AND locked_until<=clock_timestamp())
    INTO unknown_count,stale_count,expired_count FROM public.website_feedback_outbox
    WHERE company_id=(p_target->>'company_id')::uuid AND dataset_id=p_target->>'dataset_id'
      AND ad_account_id=p_target->>'ad_account_id' AND site_host=p_target->>'site_host' AND mode=p_mode;
  blocked:=unknown_count+stale_count+expired_count>0;
  RETURN jsonb_build_object('blocked',blocked,'reason_code',CASE WHEN blocked THEN 'META_HISTORY_REVIEW_REQUIRED' END,
    'unknown',unknown_count,'accepted_stale',stale_count,'expired_processing',expired_count);
END $$;

CREATE FUNCTION public.web_feedback_claim_v1(p_target jsonb,p_mode text,p_lease_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET lock_timeout='2s' SET statement_timeout='5s' AS $$
DECLARE item public.website_feedback_outbox; expired record; stamp timestamptz:=clock_timestamp(); scanned integer;
BEGIN
  PERFORM public.web_feedback_assert_target_v1(p_target,p_mode);
  IF p_lease_token IS NULL THEN RAISE EXCEPTION 'META_LEASE_REQUIRED' USING ERRCODE='22023'; END IF;
  -- Serialize lease decisions for this exact target. A prior send whose DB
  -- completion is not confirmed remains the sole processing event until it is
  -- completed or expires into UNKNOWN; another identity cannot bypass it.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    (p_target->>'company_id')::uuid::text||'|'||(p_target->>'dataset_id')||'|'||(p_target->>'ad_account_id')||'|'
      ||(p_target->>'site_host')||'|'||p_mode,0));
  stamp:=clock_timestamp();
  FOR expired IN SELECT id,lease_token FROM public.website_feedback_outbox WHERE company_id=(p_target->>'company_id')::uuid
    AND dataset_id=p_target->>'dataset_id' AND ad_account_id=p_target->>'ad_account_id' AND site_host=p_target->>'site_host'
    AND mode=p_mode AND status='processing' AND locked_until<=stamp FOR UPDATE SKIP LOCKED LIMIT 100 LOOP
    UPDATE public.website_feedback_attempts SET status='unknown',finished_at=stamp,reason_code='META_LEASE_EXPIRED'
      WHERE outbox_id=expired.id AND lease_token=expired.lease_token AND status='processing';
    UPDATE public.website_feedback_outbox SET status='unknown',lease_token=NULL,locked_until=NULL,
      reason_code='META_LEASE_EXPIRED',updated_at=stamp WHERE id=expired.id;
  END LOOP;
  IF (public.web_feedback_guard_v1(p_target,p_mode)->>'blocked')::boolean THEN RETURN NULL; END IF;
  IF EXISTS(SELECT 1 FROM public.website_feedback_outbox WHERE company_id=(p_target->>'company_id')::uuid
    AND dataset_id=p_target->>'dataset_id' AND ad_account_id=p_target->>'ad_account_id' AND site_host=p_target->>'site_host'
    AND mode=p_mode AND status='processing' AND locked_until>stamp) THEN RETURN NULL; END IF;
  FOR scanned IN 1..100 LOOP
    SELECT * INTO item FROM public.website_feedback_outbox WHERE company_id=(p_target->>'company_id')::uuid
      AND dataset_id=p_target->>'dataset_id' AND ad_account_id=p_target->>'ad_account_id' AND site_host=p_target->>'site_host'
      AND mode=p_mode AND status='pending' ORDER BY created_at,event_name,id FOR UPDATE SKIP LOCKED LIMIT 1;
    IF NOT FOUND THEN RETURN NULL; END IF;
    EXIT WHEN public.web_feedback_source_current_v1(item.id);
    UPDATE public.website_feedback_outbox SET status='cancelled',reason_code='META_SOURCE_CHANGED',updated_at=stamp WHERE id=item.id;
    item:=NULL;
  END LOOP;
  IF item.id IS NULL THEN RETURN NULL; END IF;
  UPDATE public.website_feedback_outbox SET status='processing',lease_token=p_lease_token,
    locked_until=stamp+interval '120 seconds',attempts=attempts+1,updated_at=stamp WHERE id=item.id RETURNING * INTO item;
  INSERT INTO public.website_feedback_attempts(outbox_id,lease_token,status) VALUES(item.id,p_lease_token,'processing');
  RETURN to_jsonb(item);
END $$;

CREATE FUNCTION public.web_feedback_preflight_v1(p_id uuid,p_lease_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET statement_timeout='5s' AS $$
DECLARE item public.website_feedback_outbox;
BEGIN
  IF current_user<>'service_role' THEN RAISE EXCEPTION 'META_SERVICE_ROLE_REQUIRED' USING ERRCODE='42501'; END IF;
  IF p_id IS NULL OR p_lease_token IS NULL THEN RETURN false; END IF;
  SELECT * INTO item FROM public.website_feedback_outbox WHERE id=p_id;
  IF NOT FOUND OR item.status<>'processing' OR item.lease_token IS DISTINCT FROM p_lease_token
    OR item.locked_until<=clock_timestamp() THEN RETURN false; END IF;
  IF (public.web_feedback_guard_v1(jsonb_build_object('company_id',item.company_id::text,'dataset_id',item.dataset_id,
    'ad_account_id',item.ad_account_id,'site_host',item.site_host),item.mode)->>'blocked')::boolean THEN RETURN false; END IF;
  RETURN public.web_feedback_source_current_v1(p_id);
END $$;

CREATE FUNCTION public.web_feedback_finish_v1(p_id uuid,p_lease_token uuid,p_status text,p_receipt jsonb,p_reason_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET lock_timeout='2s' SET statement_timeout='5s' AS $$
DECLARE item public.website_feedback_outbox; stamp timestamptz:=clock_timestamp();
BEGIN
  IF current_user<>'service_role' THEN RAISE EXCEPTION 'META_SERVICE_ROLE_REQUIRED' USING ERRCODE='42501'; END IF;
  IF p_id IS NULL OR p_lease_token IS NULL OR p_status IS NULL OR p_status NOT IN ('accepted','held','unknown','cancelled')
    OR (p_reason_code IS NOT NULL AND p_reason_code !~ '^[A-Z][A-Z0-9_]{0,63}$')
  THEN RAISE EXCEPTION 'META_COMPLETION_INVALID' USING ERRCODE='22023'; END IF;
  IF p_status='accepted' THEN
    IF p_receipt IS NULL OR jsonb_typeof(p_receipt)<>'object' OR (p_receipt-ARRAY['events_received','fbtrace_id'])<>'{}'::jsonb
      OR p_receipt->'events_received' IS DISTINCT FROM '1'::jsonb
      OR jsonb_typeof(p_receipt->'fbtrace_id') IS DISTINCT FROM 'string'
      OR (p_receipt->>'fbtrace_id' ~ '^[A-Za-z0-9_-]{1,200}$') IS NOT TRUE
    THEN RAISE EXCEPTION 'META_RECEIPT_INVALID' USING ERRCODE='22023'; END IF;
  ELSIF p_receipt IS NOT NULL THEN RAISE EXCEPTION 'META_RECEIPT_INVALID' USING ERRCODE='22023'; END IF;
  SELECT * INTO item FROM public.website_feedback_outbox WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR item.status<>'processing' OR item.lease_token IS DISTINCT FROM p_lease_token
    OR (item.locked_until<=stamp AND p_status<>'unknown') THEN RETURN false; END IF;
  UPDATE public.website_feedback_outbox SET status=p_status,lease_token=NULL,locked_until=NULL,updated_at=stamp,
    accepted_at=CASE WHEN p_status='accepted' THEN stamp END,
    fbtrace_id=CASE WHEN p_status='accepted' THEN p_receipt->>'fbtrace_id' END,
    reason_code=p_reason_code WHERE id=item.id;
  UPDATE public.website_feedback_attempts SET status=p_status,finished_at=stamp,receipt=p_receipt,reason_code=p_reason_code
    WHERE outbox_id=item.id AND lease_token=p_lease_token AND status='processing';
  RETURN true;
END $$;

CREATE FUNCTION public.web_feedback_reconcile_v1(p_target jsonb,p_mode text,p_current jsonb,
  p_history_complete boolean DEFAULT false,p_history_current jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET lock_timeout='2s' SET statement_timeout='5s' AS $$
DECLARE item public.website_feedback_outbox; current_row jsonb; cancelled_count integer:=0; stale_count integer:=0;
BEGIN
  PERFORM public.web_feedback_assert_target_v1(p_target,p_mode);
  IF p_history_complete IS NULL OR p_current IS NULL OR jsonb_typeof(p_current)<>'array' OR jsonb_array_length(p_current)>1000
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_current) AS e(value)
      WHERE jsonb_typeof(e.value)<>'object' OR (e.value->>'event_id' ~ '^vptw_[a-f0-9]{56}$') IS NOT TRUE
        OR (e.value->>'context_hash' ~ '^[a-f0-9]{64}$') IS NOT TRUE)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_current) AS e(value) GROUP BY e.value->>'event_id' HAVING count(*)>1)
  THEN RAISE EXCEPTION 'META_CURRENT_INVALID' USING ERRCODE='22023'; END IF;
  IF p_history_current IS NOT NULL AND (jsonb_typeof(p_history_current)<>'array' OR jsonb_array_length(p_history_current)>1000
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_history_current) AS e(value)
      WHERE jsonb_typeof(e.value)<>'object' OR (e.value->>'event_id' ~ '^vptw_[a-f0-9]{56}$') IS NOT TRUE
        OR (e.value->>'context_hash' ~ '^[a-f0-9]{64}$') IS NOT TRUE)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_history_current) AS e(value) GROUP BY e.value->>'event_id' HAVING count(*)>1))
  THEN RAISE EXCEPTION 'META_CURRENT_INVALID' USING ERRCODE='22023'; END IF;
  FOR item IN SELECT * FROM public.website_feedback_outbox WHERE company_id=(p_target->>'company_id')::uuid
    AND dataset_id=p_target->>'dataset_id' AND ad_account_id=p_target->>'ad_account_id' AND site_host=p_target->>'site_host'
    AND mode=p_mode AND status IN ('pending','accepted') FOR UPDATE LOOP
    SELECT value INTO current_row FROM jsonb_array_elements(
      CASE WHEN item.status='accepted' AND p_history_current IS NOT NULL THEN p_history_current ELSE p_current END)
      WHERE value->>'event_id'=item.event_id;
    -- A delivery window/freshness gate is not evidence of revocation. Only a
    -- complete lifetime audit snapshot may invalidate accepted proof by absence.
    IF item.status='accepted' AND current_row IS NULL AND NOT p_history_complete THEN CONTINUE; END IF;
    IF current_row IS NULL OR current_row->>'context_hash' IS DISTINCT FROM item.context_hash
      OR current_row->>'source_receipt_id' IS DISTINCT FROM item.source_receipt_id::text
      OR current_row->>'qualification_id' IS DISTINCT FROM item.qualification_id::text
      OR current_row->>'qualification_revision' IS DISTINCT FROM item.qualification_revision::text
      OR current_row->'payload' IS DISTINCT FROM item.payload
      OR current_row->>'landing_url' IS DISTINCT FROM item.landing_url
      OR current_row->>'fbclid' IS DISTINCT FROM item.fbclid
      OR current_row->>'captured_ms' IS DISTINCT FROM item.captured_ms::text THEN
      IF item.status='pending' THEN
        UPDATE public.website_feedback_outbox SET status='cancelled',reason_code='META_ELIGIBILITY_CHANGED',updated_at=clock_timestamp()
          WHERE id=item.id; cancelled_count:=cancelled_count+1;
      ELSE
        UPDATE public.website_feedback_outbox SET stale=true,reason_code='META_ACCEPTED_REVIEW_REQUIRED',updated_at=clock_timestamp()
          WHERE id=item.id; stale_count:=stale_count+1;
      END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('cancelled',cancelled_count,'accepted_review_required',stale_count);
END $$;

CREATE FUNCTION public.web_feedback_list_v1(p_target jsonb,p_mode text,p_limit integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' SET statement_timeout='5s' AS $$
DECLARE result jsonb;
BEGIN
  PERFORM public.web_feedback_assert_target_v1(p_target,p_mode);
  IF p_limit IS NULL OR p_limit<1 OR p_limit>500 THEN RAISE EXCEPTION 'META_LIMIT_INVALID' USING ERRCODE='22023'; END IF;
  SELECT jsonb_build_object('counts',coalesce((SELECT jsonb_object_agg(status,n) FROM (
      SELECT status,count(*) n FROM public.website_feedback_outbox WHERE company_id=(p_target->>'company_id')::uuid
        AND dataset_id=p_target->>'dataset_id' AND ad_account_id=p_target->>'ad_account_id'
        AND site_host=p_target->>'site_host' AND mode=p_mode GROUP BY status) counts),'{}'::jsonb),
    'rows',coalesce((SELECT jsonb_agg(to_jsonb(records)) FROM (SELECT * FROM public.website_feedback_outbox
      WHERE company_id=(p_target->>'company_id')::uuid AND dataset_id=p_target->>'dataset_id'
        AND ad_account_id=p_target->>'ad_account_id' AND site_host=p_target->>'site_host' AND mode=p_mode
      ORDER BY created_at DESC,id LIMIT p_limit) records),'[]'::jsonb)) INTO result;
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.web_feedback_assert_target_v1(jsonb,text),public.web_feedback_enqueue_v1(jsonb),
  public.web_feedback_guard_v1(jsonb,text),
  public.web_feedback_source_current_v1(uuid),public.web_feedback_preflight_v1(uuid,uuid),
  public.web_feedback_claim_v1(jsonb,text,uuid),public.web_feedback_finish_v1(uuid,uuid,text,jsonb,text),
  public.web_feedback_reconcile_v1(jsonb,text,jsonb,boolean,jsonb),public.web_feedback_list_v1(jsonb,text,integer)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.web_feedback_assert_target_v1(jsonb,text),public.web_feedback_enqueue_v1(jsonb),
  public.web_feedback_guard_v1(jsonb,text),
  public.web_feedback_source_current_v1(uuid),public.web_feedback_preflight_v1(uuid,uuid),
  public.web_feedback_claim_v1(jsonb,text,uuid),public.web_feedback_finish_v1(uuid,uuid,text,jsonb,text),
  public.web_feedback_reconcile_v1(jsonb,text,jsonb,boolean,jsonb),public.web_feedback_list_v1(jsonb,text,integer) TO service_role;
COMMENT ON TABLE public.website_feedback_outbox IS 'Website CRM qualified feedback only; no native or initial browser Lead. Test and production isolated. ACCEPTED is provider receipt, not attributed conversion. Expired send leases remain UNKNOWN, never retried blindly.';
COMMIT;
