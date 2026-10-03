-- Operator recovery only. Does not enable intake or change any live binding.
BEGIN;
CREATE TABLE IF NOT EXISTS public.marketing_fb_lead_recovery_events(
 request_id uuid PRIMARY KEY,actor_id uuid NOT NULL,company_id uuid NOT NULL,
 receipt_id uuid NOT NULL,command jsonb NOT NULL,before_state jsonb NOT NULL,
 after_state jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp());
ALTER TABLE public.marketing_fb_lead_recovery_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketing_fb_lead_recovery_events FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.marketing_fb_lead_console(p_actor uuid,p_company uuid,p_after uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE bindings jsonb;counts jsonb;items jsonb;after_time timestamptz;next_id uuid;more boolean;
BEGIN
 PERFORM public.marketing_fb_intake_admin(p_actor,p_company);
 IF p_after IS NOT NULL THEN
  SELECT received_at INTO after_time FROM public.marketing_fb_lead_receipts WHERE id=p_after AND company_id=p_company;
  IF NOT FOUND THEN RAISE EXCEPTION 'cursor unavailable' USING ERRCODE='22023';END IF;
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'pageId',b.page_id,'pageName',CASE WHEN p.page_id IS NULL THEN 'Page không còn trong công ty' ELSE coalesce(to_jsonb(p)->>'page_name',b.page_id) END,
  'formId',b.form_id,'revision',b.revision,'active',b.config->'active',
  'ownerName',coalesce(to_jsonb(u)->>'full_name',to_jsonb(u)->>'name','Người nhận cần kiểm tra'),
  'regionName',coalesce(to_jsonb(rg)->>'name','Khu vực cần kiểm tra'),
  'productName',coalesce(to_jsonb(k)->>'name','Sản phẩm cần kiểm tra')
 ) ORDER BY b.page_id,b.form_id),'[]'::jsonb) INTO bindings
 FROM public.marketing_fb_lead_bindings b
 LEFT JOIN public.facebook_pages p ON p.page_id=b.page_id AND p.default_company_id=p_company
 LEFT JOIN public.users u ON u.id=(b.config->>'ownerId')::uuid AND u.company_id=p_company
 LEFT JOIN public.company_regions rg ON rg.id=(b.config->>'regionId')::uuid AND rg.company_id=p_company
 LEFT JOIN public.crm_lead_types k ON k.id=(b.config->>'leadTypeId')::uuid AND k.company_id=p_company
 WHERE b.company_id=p_company;
 SELECT coalesce(jsonb_object_agg(state,n),'{}'::jsonb) INTO counts FROM(
  SELECT state,count(*) n FROM public.marketing_fb_lead_receipts WHERE company_id=p_company GROUP BY state)x;
 WITH selected AS (
  SELECT r.* FROM public.marketing_fb_lead_receipts r
  WHERE r.company_id=p_company AND r.state<>'DONE' AND (p_after IS NULL OR (r.received_at,r.id)>(after_time,p_after))
  ORDER BY r.received_at,r.id LIMIT 51
 ), visible AS(SELECT * FROM selected ORDER BY received_at,id LIMIT 50), projected AS(
  SELECT r.received_at,r.id,jsonb_build_object('id',r.id,'pageId',r.page_id,'formId',r.form_id,
   'state',r.state,'failureCode',r.failure_code,'attempts',r.attempts,'receivedAt',r.received_at,
   'bindingRevision',r.binding_revision,'currentBindingRevision',b.revision,'version',md5(to_jsonb(r)::text),
   'retryBlock',CASE
    WHEN r.lead_id IS NOT NULL OR r.customer_id IS NOT NULL OR r.completed_at IS NOT NULL OR EXISTS(SELECT 1 FROM public.crm_lead_source_evidence e WHERE e.receipt_id=r.id) THEN 'CRM_ALREADY_LINKED'
    WHEN r.failure_code='ENVELOPE_SCOPE_CONFLICT' THEN 'SCOPE_CONFLICT'
    WHEN r.failure_code='LEGACY_RECONCILIATION_REQUIRED' OR EXISTS(SELECT 1 FROM public.facebook_lead_ads a WHERE a.leadgen_id=r.leadgen_id) OR EXISTS(SELECT 1 FROM public.facebook_contacts c WHERE c.page_id=r.page_id AND c.psid='leadad_'||r.leadgen_id) THEN 'LEGACY_RECONCILIATION_REQUIRED'
    WHEN r.state='LEASED' THEN 'WORKER_OWNS_RECEIPT'
    WHEN r.state='PENDING' AND r.failure_code IS NULL THEN 'ALREADY_QUEUED'
    WHEN b.revision IS NULL OR b.config->>'active' IS DISTINCT FROM 'true' THEN 'BINDING_UNAVAILABLE'
    WHEN p.page_id IS NULL OR p.is_active IS DISTINCT FROM true THEN 'PAGE_UNAVAILABLE'
    ELSE NULL END
  ) value FROM visible r
  LEFT JOIN public.marketing_fb_lead_bindings b ON b.page_id=r.page_id AND b.form_id=r.form_id AND b.company_id=p_company
  LEFT JOIN public.facebook_pages p ON p.page_id=r.page_id AND p.default_company_id=p_company
 )
 SELECT coalesce((SELECT jsonb_agg(value ORDER BY received_at,id) FROM projected),'[]'::jsonb),
 (SELECT count(*)>50 FROM selected),(SELECT id FROM visible ORDER BY received_at DESC,id DESC LIMIT 1)
 INTO items,more,next_id;
 RETURN jsonb_build_object('companyId',p_company,'observedAt',clock_timestamp(),'bindings',bindings,
  'receiptCounts',counts,'items',items,'nextCursor',CASE WHEN more THEN next_id ELSE NULL END,
  'uniquePaidCoverage','INCOMPLETE');
END $$;

CREATE OR REPLACE FUNCTION public.marketing_fb_lead_recover(p_actor uuid,p_company uuid,p_request uuid,p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.marketing_fb_lead_receipts%ROWTYPE;b public.marketing_fb_lead_bindings%ROWTYPE;
 e public.marketing_fb_lead_recovery_events%ROWTYPE;before_value jsonb;page public.facebook_pages%ROWTYPE;token uuid:=gen_random_uuid();ctx jsonb;
BEGIN
 PERFORM public.marketing_fb_intake_admin(p_actor,p_company);
 IF p_request IS NULL OR jsonb_typeof(p_command) IS DISTINCT FROM 'object'
  OR jsonb_typeof(p_command->'receiptId') IS DISTINCT FROM 'string'
  OR (p_command->>'expectedVersion'~'^[a-f0-9]{32}$') IS NOT TRUE
  OR jsonb_typeof(p_command->'bindingRevision') IS DISTINCT FROM 'number'
  OR (p_command->>'bindingRevision'~'^[1-9][0-9]{0,8}$') IS NOT TRUE
  OR jsonb_typeof(p_command->'reason') IS DISTINCT FROM 'string' OR length(btrim(p_command->>'reason')) NOT BETWEEN 20 AND 2000
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_command) k WHERE k NOT IN('receiptId','expectedVersion','bindingRevision','reason'))
 THEN RAISE EXCEPTION 'invalid recovery' USING ERRCODE='22023';END IF;
 -- Serialize a request identifier even when reused against another receipt.
 PERFORM pg_advisory_xact_lock(hashtextextended('fb-recovery:'||p_request::text,0));
 SELECT * INTO e FROM public.marketing_fb_lead_recovery_events WHERE request_id=p_request;
 IF FOUND THEN
  IF e.actor_id IS DISTINCT FROM p_actor OR e.company_id IS DISTINCT FROM p_company OR e.command IS DISTINCT FROM p_command THEN RAISE EXCEPTION 'request reused' USING ERRCODE='23505';END IF;
  -- A replay acknowledges only the recorded action; it never restores old state.
  RETURN jsonb_build_object('accepted',true,'replayed',true,'receiptId',e.receipt_id);
 END IF;
 SELECT * INTO r FROM public.marketing_fb_lead_receipts WHERE id=(p_command->>'receiptId')::uuid AND company_id=p_company FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'receipt denied' USING ERRCODE='42501';END IF;
 IF md5(to_jsonb(r)::text) IS DISTINCT FROM p_command->>'expectedVersion' THEN RAISE EXCEPTION 'receipt changed' USING ERRCODE='40001';END IF;
 IF r.state NOT IN('PENDING','REVIEW') OR (r.state='PENDING' AND r.failure_code IS NULL)
  OR r.lead_id IS NOT NULL OR r.customer_id IS NOT NULL OR r.completed_at IS NOT NULL
  OR r.failure_code IN('ENVELOPE_SCOPE_CONFLICT','LEGACY_RECONCILIATION_REQUIRED')
  OR EXISTS(SELECT 1 FROM public.crm_lead_source_evidence WHERE receipt_id=r.id)
  OR EXISTS(SELECT 1 FROM public.facebook_lead_ads WHERE leadgen_id=r.leadgen_id)
  OR EXISTS(SELECT 1 FROM public.facebook_contacts WHERE page_id=r.page_id AND psid='leadad_'||r.leadgen_id)
 THEN RAISE EXCEPTION 'manual reconciliation required' USING ERRCODE='40001';END IF;
 SELECT * INTO b FROM public.marketing_fb_lead_bindings WHERE page_id=r.page_id AND form_id=r.form_id AND company_id=p_company FOR SHARE;
 IF NOT FOUND OR b.revision IS DISTINCT FROM (p_command->>'bindingRevision')::integer OR b.config->>'active' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'binding changed' USING ERRCODE='40001';END IF;
 SELECT * INTO page FROM public.facebook_pages WHERE page_id=r.page_id AND default_company_id=p_company AND is_active IS TRUE FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'page denied' USING ERRCODE='42501';END IF;
 before_value:=to_jsonb(r);
 -- Validate the complete current routing with the SAME validator used at CRM commit.
 -- The temporary lease is transaction-local; any failure rolls everything back.
 UPDATE public.marketing_fb_lead_receipts SET state='LEASED',binding_revision=b.revision,lease_token=token,lease_until=clock_timestamp()+interval '120 seconds' WHERE id=r.id;
 ctx:=public.marketing_fb_lead_context(r.id,token);
 UPDATE public.marketing_fb_lead_receipts SET state='PENDING',failure_code=NULL,lease_token=NULL,lease_until=NULL,next_attempt_at=clock_timestamp()
 WHERE id=r.id RETURNING * INTO r;
 INSERT INTO public.marketing_fb_lead_recovery_events(request_id,actor_id,company_id,receipt_id,command,before_state,after_state)
 VALUES(p_request,p_actor,p_company,r.id,p_command,before_value,to_jsonb(r));
 RETURN jsonb_build_object('accepted',true,'replayed',false,'receiptId',r.id);
END $$;
REVOKE ALL ON FUNCTION public.marketing_fb_lead_console(uuid,uuid,uuid),public.marketing_fb_lead_recover(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_fb_lead_console(uuid,uuid,uuid),public.marketing_fb_lead_recover(uuid,uuid,uuid,jsonb) TO service_role;
COMMIT;
