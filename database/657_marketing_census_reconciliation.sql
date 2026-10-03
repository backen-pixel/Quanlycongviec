-- Read-only census/CRM reconciliation within the trial's one SQL snapshot.
BEGIN;
CREATE OR REPLACE FUNCTION public.marketing_trial_census_inventory(p_company uuid,p_trial uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 WITH latest AS(SELECT * FROM public.marketing_fb_census_runs WHERE company_id=p_company AND trial_id=p_trial ORDER BY started_at DESC,id DESC LIMIT 1),
 items AS(SELECT i.* FROM public.marketing_fb_census_items i JOIN latest r ON r.id=i.run_id ORDER BY i.page_id,i.leadgen_id LIMIT 5001),
 forms AS(SELECT f.* FROM public.marketing_fb_census_forms f JOIN latest r ON r.id=f.run_id ORDER BY f.page_id,f.form_id LIMIT 5001)
 SELECT coalesce((SELECT jsonb_build_object('version',1,'companyId',p_company,'trialId',p_trial,'status','AVAILABLE',
  'complete',(SELECT count(*)<=5000 FROM items) AND(SELECT count(*)<=5000 FROM forms),
  'run',jsonb_build_object('id',r.id,'state',r.state,'trialRevision',r.trial_revision,'since',r.since_at,'until',r.until_at,'startedAt',r.started_at,'finishedAt',r.finished_at,
   'scopeCurrent',r.scope=public.marketing_fb_census_scope(p_company,p_trial),'tasksPending',(SELECT count(*) FROM public.marketing_fb_census_tasks WHERE run_id=r.id AND state<>'DONE')),
  'items',coalesce((SELECT jsonb_agg(jsonb_build_object('pageId',page_id,'formId',form_id,'leadgenId',leadgen_id,'acquiredAt',acquired_at,'receiptId',receipt_id) ORDER BY page_id,leadgen_id) FROM items),'[]'::jsonb),
  'forms',coalesce((SELECT jsonb_agg(jsonb_build_object('pageId',page_id,'formId',form_id,'discovered',discovered,'expiredLeads',expired_leads) ORDER BY page_id,form_id) FROM forms),'[]'::jsonb)) FROM latest r),jsonb_build_object('status','MISSING'))
$$;
REVOKE ALL ON FUNCTION public.marketing_trial_census_inventory(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.marketing_lead_trial_snapshot(p_actor uuid,p_company uuid,p_trial uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
 PERFORM public.crm_identity_review_admin(p_actor,p_company);
 -- All business inputs below are read by ONE SQL statement. Stable helpers
 -- retain that statement's MVCC snapshot, even during concurrent legacy writes.
 WITH trial AS(SELECT * FROM public.marketing_lead_trials WHERE id=p_trial AND company_id=p_company),
 leads AS(SELECT * FROM public.crm_leads WHERE company_id=p_company ORDER BY id LIMIT 5001),
 sources AS(SELECT * FROM public.crm_lead_source_evidence WHERE company_id=p_company ORDER BY id LIMIT 5001),
 receipts AS(SELECT * FROM public.marketing_fb_lead_receipts WHERE company_id=p_company ORDER BY id LIMIT 5001),
 identity AS(SELECT public.marketing_trial_identity_inventory(p_company) value),
 quality AS(
  SELECT l.id,to_jsonb(l) lj,coalesce(to_jsonb(c),'{}'::jsonb) cj,
   to_jsonb(r) rj,to_jsonb(u) uj,to_jsonb(co) company,
   EXISTS(SELECT 1 FROM public.user_company_regions WHERE user_id=l.assigned_to AND region_id=l.region_id) membership,
   (SELECT jsonb_object_agg(v.entity||':'||v.entity_id::text,v.revision) FROM public.crm_lead_quality_source_versions v
    WHERE (v.entity,v.entity_id) IN(('crm_leads',l.id),('customers',l.customer_id),('company_regions',l.region_id),('users',l.assigned_to))) versions,
   (SELECT to_jsonb(e) FROM public.crm_lead_quality_events e WHERE e.company_id=p_company AND e.lead_id=l.id ORDER BY revision DESC LIMIT 1) evidence
  FROM leads l LEFT JOIN public.customers c ON c.id=l.customer_id AND c.company_id=p_company
  LEFT JOIN public.company_regions r ON r.id=l.region_id AND r.company_id=p_company
  LEFT JOIN public.users u ON u.id=l.assigned_to AND u.company_id=p_company
  JOIN public.companies co ON co.id=p_company
 ), qualities AS(
  SELECT jsonb_build_object('leadId',id,'companyId',p_company,'regionId',lj->'region_id','ownerId',lj->'assigned_to',
   'firstKnownAt',(SELECT min(v::timestamptz) FROM (VALUES(lj->>'first_touch_time'),(lj->>'created_at'),(cj->>'created_at')) dates(v) WHERE v IS NOT NULL),
   'historyComplete',lj->>'created_at' IS NOT NULL AND(lj->>'customer_id' IS NULL OR cj->>'created_at' IS NOT NULL),
   'contextVersion',public.marketing_trial_quality_context(lj,cj,rj,uj,company,membership,versions),
   'routingReady',coalesce(membership AND rj->>'is_active'='true' AND uj->>'is_active'='true' AND uj->>'tenant_id' IS NOT DISTINCT FROM company->>'tenant_id',false),
   'evidence',CASE WHEN evidence IS NOT NULL THEN jsonb_build_object('id',evidence->'id','contextVersion',evidence->'context_version','status',evidence->'decision'->'status',
     'contactVerified',evidence->'decision'->'contactVerified','demandMatches',evidence->'decision'->'demandMatches','serviceAreaVerified',evidence->'decision'->'serviceAreaVerified',
     'recordedAt',evidence->'recorded_at','recordedBy',evidence->'actor_id') ELSE NULL END) value FROM quality
 )
 SELECT jsonb_build_object('companyId',p_company,'trial',to_jsonb(t),'asOf',clock_timestamp(),
  'complete',(SELECT count(*)<=5000 FROM leads) AND (SELECT count(*)<=5000 FROM sources) AND (SELECT count(*)<=5000 FROM receipts),
  'identity',(SELECT value FROM identity),
  'qualities',coalesce((SELECT jsonb_agg(value) FROM qualities),'[]'::jsonb),
  'accounts',coalesce((SELECT jsonb_agg(jsonb_build_object('ad_account_id',a.ad_account_id,'company_id',a.company_id,'bat',a.bat,'token_het_han',a.token_het_han)) FROM public.fb_ad_accounts a WHERE a.company_id=p_company OR a.ad_account_id=ANY(t.account_ids)),'[]'::jsonb),
  'runs',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT DISTINCT ON(ad_account_id) * FROM public.marketing_spend_sync_runs WHERE company_id=p_company AND ad_account_id=ANY(t.account_ids) ORDER BY ad_account_id,id DESC)x),'[]'::jsonb),
  'sources',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'receiptId',s.receipt_id,'leadId',s.lead_id,'companyId',s.company_id,'provider',s.provider,'source',s.source_kind,'acquiredAt',s.acquired_at,'proof',s.proof)) FROM sources s),'[]'::jsonb),
  'receipts',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'pageId',r.page_id,'formId',r.form_id,'leadgenId',r.leadgen_id,'state',r.state,'leadId',r.lead_id,'receivedAt',r.received_at,'failureCode',r.failure_code)) FROM receipts r),'[]'::jsonb),
  'providerReconciliation',public.marketing_trial_census_inventory(p_company,p_trial),
  'surveyCoverage','NOT_CONNECTED') INTO result FROM trial t;
 IF result IS NULL THEN RAISE EXCEPTION 'trial missing' USING ERRCODE='P0002';END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.marketing_lead_trial_snapshot(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_lead_trial_snapshot(uuid,uuid,uuid) TO service_role;
COMMIT;
