-- Explicitly reviewed source adoption only. Never creates or edits legacy CRM entities.
BEGIN;
CREATE TABLE IF NOT EXISTS public.marketing_fb_legacy_proposals(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid NOT NULL,company_id uuid NOT NULL,
 receipt_id uuid NOT NULL,context_version text NOT NULL,target jsonb NOT NULL,
 proof jsonb NOT NULL,matched_fields text[] NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS public.marketing_fb_legacy_events(
 request_id uuid PRIMARY KEY,proposal_id uuid NOT NULL UNIQUE,actor_id uuid NOT NULL,company_id uuid NOT NULL,
 command jsonb NOT NULL,result jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp());
ALTER TABLE public.marketing_fb_legacy_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_fb_legacy_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketing_fb_legacy_proposals,public.marketing_fb_legacy_events FROM PUBLIC,anon,authenticated,service_role;

-- Credentials/contact context is server-only. Both historical mappings must exist
-- and agree; incomplete or conflicting mappings need separate investigation.
CREATE OR REPLACE FUNCTION public.marketing_fb_legacy_context(p_actor uuid,p_company uuid,p_receipt uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.marketing_fb_lead_receipts%ROWTYPE;a jsonb;f jsonb;l jsonb;c jsonb;q jsonb;ctx jsonb;
 b public.marketing_fb_lead_bindings%ROWTYPE;token uuid:=gen_random_uuid();target jsonb;version text;
BEGIN
 PERFORM public.marketing_fb_intake_admin(p_actor,p_company);
 SELECT * INTO r FROM public.marketing_fb_lead_receipts WHERE id=p_receipt AND company_id=p_company FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'receipt unavailable' USING ERRCODE='42501';END IF;
 IF r.state<>'REVIEW' OR r.failure_code IS DISTINCT FROM 'LEGACY_RECONCILIATION_REQUIRED'
  OR r.lead_id IS NOT NULL OR r.customer_id IS NOT NULL
  OR EXISTS(SELECT 1 FROM public.crm_lead_source_evidence WHERE receipt_id=r.id)
 THEN RAISE EXCEPTION 'receipt needs different resolution' USING ERRCODE='40001';END IF;
 -- Natural keys are unique in migration42. Lock existing rows, including xmin
 -- in the short-lived approval version so an A→B→A edit invalidates the proposal.
 SELECT to_jsonb(x)||jsonb_build_object('_rowVersion',x.xmin::text) INTO a FROM public.facebook_lead_ads x WHERE leadgen_id=r.leadgen_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'legacy mapping incomplete' USING ERRCODE='40001';END IF;
 SELECT to_jsonb(x)||jsonb_build_object('_rowVersion',x.xmin::text) INTO f FROM public.facebook_contacts x WHERE page_id=r.page_id AND psid='leadad_'||r.leadgen_id FOR SHARE;
 IF NOT FOUND OR a->>'page_id' IS DISTINCT FROM r.page_id OR a->>'form_id' IS DISTINCT FROM r.form_id
  OR a->>'lead_id' IS NULL OR a->>'customer_id' IS NULL
  OR f->>'lead_id' IS DISTINCT FROM a->>'lead_id' OR f->>'customer_id' IS DISTINCT FROM a->>'customer_id'
 THEN RAISE EXCEPTION 'legacy mapping incomplete or conflicting' USING ERRCODE='40001';END IF;
 q:=public.crm_lead_quality_context(p_actor,p_company,(a->>'lead_id')::uuid);
 IF q->>'readyToQualify' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'current CRM routing unavailable' USING ERRCODE='40001';END IF;
 SELECT to_jsonb(x) INTO l FROM public.crm_leads x WHERE id=(a->>'lead_id')::uuid;
 SELECT to_jsonb(x) INTO c FROM public.customers x WHERE id=(a->>'customer_id')::uuid;
 IF l->>'company_id' IS DISTINCT FROM p_company::text OR c->>'company_id' IS DISTINCT FROM p_company::text
  OR l->>'customer_id' IS DISTINCT FROM a->>'customer_id'
 THEN RAISE EXCEPTION 'legacy CRM scope mismatch' USING ERRCODE='42501';END IF;
 SELECT * INTO b FROM public.marketing_fb_lead_bindings WHERE page_id=r.page_id AND form_id=r.form_id FOR SHARE;
 -- Borrow the existing current-routing validator in this transaction only.
 -- The original receipt is restored before return; no worker can see this lease.
 UPDATE public.marketing_fb_lead_receipts SET state='LEASED',binding_revision=b.revision,lease_token=token,lease_until=clock_timestamp()+interval '120 seconds' WHERE id=r.id;
 ctx:=public.marketing_fb_lead_context(r.id,token);
 UPDATE public.marketing_fb_lead_receipts SET state=r.state,binding_revision=r.binding_revision,lease_token=r.lease_token,lease_until=r.lease_until WHERE id=r.id;
 target:=jsonb_build_object('leadId',l->'id','customerId',c->'id','code',l->'code','title',l->'title',
  'regionId',l->'region_id','assignedTo',l->'assigned_to');
 version:=md5(jsonb_build_object('receipt',to_jsonb(r),'legacyAd',a,'legacyContact',f,
  'crmContext',q->'contextVersion','routingContext',ctx->'contextVersion')::text);
 RETURN jsonb_build_object('companyId',p_company,'receipt',jsonb_build_object('id',r.id,'page_id',r.page_id,'form_id',r.form_id,'leadgen_id',r.leadgen_id),
  'receiptVersion',md5(to_jsonb(r)::text),'contextVersion',version,'providerContext',ctx,'target',target,
  'contacts',jsonb_build_object('leadPhone',l->'phone','customerPhone',c->'phone','leadEmail',l->'email','customerEmail',c->'email'));
END $$;

CREATE OR REPLACE FUNCTION public.marketing_fb_legacy_prepare(p_actor uuid,p_company uuid,p_receipt uuid,p_context_version text,p_proof jsonb,p_matches text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE ctx jsonb;r jsonb;cfg jsonb;p public.marketing_fb_legacy_proposals%ROWTYPE;
BEGIN
 ctx:=public.marketing_fb_legacy_context(p_actor,p_company,p_receipt);r:=ctx->'receipt';cfg:=ctx->'providerContext'->'routing';
 IF ctx->>'contextVersion' IS DISTINCT FROM p_context_version THEN RAISE EXCEPTION 'context changed' USING ERRCODE='40001';END IF;
 IF jsonb_typeof(p_proof) IS DISTINCT FROM 'object' OR p_proof->>'provider' IS DISTINCT FROM 'META_LEAD_ADS_V1'
  OR p_proof->>'pageId' IS DISTINCT FROM r->>'page_id' OR p_proof->>'formId' IS DISTINCT FROM r->>'form_id' OR p_proof->>'leadgenId' IS DISTINCT FROM r->>'leadgen_id'
  OR (p_proof->>'source' IN ('PAID','ORGANIC','UNKNOWN')) IS NOT TRUE
  OR p_proof->>'acquiredAt' IS NULL OR (p_proof->>'acquiredAt')::timestamptz>clock_timestamp()+interval '5 minutes'
  OR p_proof->>'fetchedAt' IS NULL OR (p_proof->>'fetchedAt')::timestamptz<clock_timestamp()-interval '5 minutes' OR (p_proof->>'fetchedAt')::timestamptz>clock_timestamp()+interval '5 minutes'
  OR (p_proof->>'graphVersion'~'^v[0-9]{2,3}\.0$') IS NOT TRUE
  OR coalesce(cardinality(p_matches),0) NOT BETWEEN 1 AND 2
  OR EXISTS(SELECT 1 FROM unnest(p_matches) v WHERE v IS NULL OR v NOT IN ('phone','email'))
  OR (SELECT count(DISTINCT v) FROM unnest(p_matches) v)<>cardinality(p_matches)
 THEN RAISE EXCEPTION 'invalid provider proof' USING ERRCODE='22023';END IF;
 IF p_proof->>'source'='PAID' THEN
  IF p_proof->>'accountId' IS DISTINCT FROM cfg->>'accountId' OR EXISTS(SELECT 1 FROM unnest(ARRAY['adId','adsetId','campaignId']) k WHERE (p_proof->>k~'^[0-9]{1,32}$') IS NOT TRUE) THEN RAISE EXCEPTION 'paid scope mismatch' USING ERRCODE='22023';END IF;
 ELSIF EXISTS(SELECT 1 FROM unnest(ARRAY['accountId','adId','adsetId','campaignId']) k WHERE p_proof->>k IS NOT NULL) THEN RAISE EXCEPTION 'unverified paid fields' USING ERRCODE='22023';END IF;
 INSERT INTO public.marketing_fb_legacy_proposals(actor_id,company_id,receipt_id,context_version,target,proof,matched_fields,expires_at)
 VALUES(p_actor,p_company,p_receipt,p_context_version,ctx->'target',p_proof,p_matches,
  least(clock_timestamp()+interval '5 minutes',(p_proof->>'fetchedAt')::timestamptz+interval '5 minutes')) RETURNING * INTO p;
 RETURN jsonb_build_object('companyId',p.company_id,'receiptId',p.receipt_id,'proposalId',p.id,'target',p.target,
  'matchedFields',p.matched_fields,'sourceKind',p.proof->'source','acquiredAt',p.proof->'acquiredAt','expiresAt',p.expires_at);
END $$;

CREATE OR REPLACE FUNCTION public.marketing_fb_legacy_commit(p_actor uuid,p_company uuid,p_request uuid,p_command jsonb,p_pages text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE p public.marketing_fb_legacy_proposals%ROWTYPE;e public.marketing_fb_legacy_events%ROWTYPE;ctx jsonb;proof_id uuid;result jsonb;
BEGIN
 PERFORM public.marketing_fb_intake_admin(p_actor,p_company);
 IF p_request IS NULL OR jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR p_command->>'proposalId' IS NULL
  OR jsonb_typeof(p_command->'reason') IS DISTINCT FROM 'string' OR length(btrim(p_command->>'reason')) NOT BETWEEN 20 AND 2000
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_command) k WHERE k NOT IN ('proposalId','reason'))
 THEN RAISE EXCEPTION 'invalid review command' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('fb-legacy-review:'||p_request::text,0));
 SELECT * INTO e FROM public.marketing_fb_legacy_events WHERE request_id=p_request;
 IF FOUND THEN
  IF e.actor_id IS DISTINCT FROM p_actor OR e.company_id IS DISTINCT FROM p_company OR e.command IS DISTINCT FROM p_command THEN RAISE EXCEPTION 'request reused' USING ERRCODE='23505';END IF;
  RETURN e.result||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO p FROM public.marketing_fb_legacy_proposals WHERE id=(p_command->>'proposalId')::uuid AND actor_id=p_actor AND company_id=p_company;
 IF NOT FOUND THEN RAISE EXCEPTION 'proposal unavailable' USING ERRCODE='42501';END IF;
 IF p.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'proposal expired' USING ERRCODE='40001';END IF;
 ctx:=public.marketing_fb_legacy_context(p_actor,p_company,p.receipt_id);
 IF coalesce(cardinality(p_pages),0) NOT BETWEEN 1 AND 100 OR ((ctx->'receipt'->>'page_id')=ANY(p_pages)) IS NOT TRUE THEN RAISE EXCEPTION 'page not enabled' USING ERRCODE='42501';END IF;
 IF ctx->>'contextVersion' IS DISTINCT FROM p.context_version OR ctx->'target' IS DISTINCT FROM p.target OR p.expires_at<=clock_timestamp()
 THEN RAISE EXCEPTION 'approved context changed or expired' USING ERRCODE='40001';END IF;
 INSERT INTO public.crm_lead_source_evidence(receipt_id,company_id,lead_id,customer_id,provider,source_kind,acquired_at,proof,routing)
 VALUES(p.receipt_id,p_company,(p.target->>'leadId')::uuid,(p.target->>'customerId')::uuid,'META_LEAD_ADS_V1',p.proof->>'source',(p.proof->>'acquiredAt')::timestamptz,p.proof,
  jsonb_build_object('kind','LEGACY_REVIEW_V1','proposalId',p.id,'reviewedBy',p_actor,'target',p.target,'matchedFields',p.matched_fields,
   'bindingRevision',ctx->'providerContext'->'bindingRevision','config',ctx->'providerContext'->'routing')) RETURNING id INTO proof_id;
 UPDATE public.marketing_fb_lead_receipts SET state='DONE',lead_id=(p.target->>'leadId')::uuid,customer_id=(p.target->>'customerId')::uuid,
  completed_at=clock_timestamp(),failure_code=NULL,lease_token=NULL,lease_until=NULL WHERE id=p.receipt_id;
 result:=jsonb_build_object('accepted',true,'companyId',p_company,'receiptId',p.receipt_id,'leadId',p.target->'leadId','proofId',proof_id,'replayed',false);
 INSERT INTO public.marketing_fb_legacy_events(request_id,proposal_id,actor_id,company_id,command,result) VALUES(p_request,p.id,p_actor,p_company,p_command,result);
 IF p.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'proposal expired before commit' USING ERRCODE='40001';END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.marketing_fb_legacy_context(uuid,uuid,uuid),public.marketing_fb_legacy_prepare(uuid,uuid,uuid,text,jsonb,text[]),public.marketing_fb_legacy_commit(uuid,uuid,uuid,jsonb,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_fb_legacy_context(uuid,uuid,uuid),public.marketing_fb_legacy_prepare(uuid,uuid,uuid,text,jsonb,text[]),public.marketing_fb_legacy_commit(uuid,uuid,uuid,jsonb,text[]) TO service_role;
COMMIT;
