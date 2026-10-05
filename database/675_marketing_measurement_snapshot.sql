-- Immutable observed measurements; no completeness or spend authorization.
BEGIN;
CREATE OR REPLACE FUNCTION marketing_measurement.trial_facts(p_company uuid,p_trial uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
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
 SELECT jsonb_build_object('companyId',p_company,'trial',to_jsonb(t),'asOf',statement_timestamp(),
  'complete',(SELECT count(*)<=5000 FROM leads) AND (SELECT count(*)<=5000 FROM sources) AND (SELECT count(*)<=5000 FROM receipts),
  'identity',(SELECT value FROM identity),
  'qualities',coalesce((SELECT jsonb_agg(value) FROM qualities),'[]'::jsonb),
  'accounts',coalesce((SELECT jsonb_agg(jsonb_build_object('ad_account_id',a.ad_account_id,'company_id',a.company_id,'bat',a.bat,'token_het_han',a.token_het_han)) FROM public.fb_ad_accounts a WHERE a.company_id=p_company OR a.ad_account_id=ANY(t.account_ids)),'[]'::jsonb),
  'runs',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT DISTINCT ON(ad_account_id) * FROM public.marketing_spend_sync_runs WHERE company_id=p_company AND ad_account_id=ANY(t.account_ids) ORDER BY ad_account_id,id DESC)x),'[]'::jsonb),
  'sources',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'receiptId',s.receipt_id,'leadId',s.lead_id,'companyId',s.company_id,'provider',s.provider,'source',s.source_kind,'acquiredAt',s.acquired_at,'proof',s.proof)) FROM sources s),'[]'::jsonb),
  'receipts',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'pageId',r.page_id,'formId',r.form_id,'leadgenId',r.leadgen_id,'state',r.state,'leadId',r.lead_id,'receivedAt',r.received_at,'failureCode',r.failure_code)) FROM receipts r),'[]'::jsonb),
  'providerReconciliation',public.marketing_trial_census_inventory(p_company,p_trial),
  'sourceRegistry',marketing_measurement.source_registry_projection(p_company,p_trial),
  'surveyCoverage','NOT_CONNECTED') FROM trial t;
$$;

-- Hash set-valued facts independently of query plan row ordering.
CREATE OR REPLACE FUNCTION marketing_measurement.canonical_set(p_value jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
 IF jsonb_typeof(p_value)='array' THEN
  SELECT coalesce(jsonb_agg(v ORDER BY v::text),'[]'::jsonb) INTO result FROM(SELECT marketing_measurement.canonical_set(value) v FROM jsonb_array_elements(p_value))x;
 ELSIF jsonb_typeof(p_value)='object' THEN
  SELECT coalesce(jsonb_object_agg(key,marketing_measurement.canonical_set(value)),'{}'::jsonb) INTO result FROM jsonb_each(p_value);
 ELSE result:=p_value;END IF;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION marketing_measurement.fingerprint(p_value jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT encode(sha256(convert_to(marketing_measurement.canonical_set(p_value)::text,'UTF8')),'hex')
$$;

-- V2 excludes processing leases/retry counters and only excludes receipts whose
-- acquisition is proved outside the measurement window without conflicting proof.
-- Unknown acquisition, orphan proofs and envelope conflicts remain dependencies.
CREATE OR REPLACE FUNCTION marketing_measurement.export_context(p_company uuid,p_trial uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE body jsonb;signature jsonb;
BEGIN
 WITH source AS MATERIALIZED(SELECT marketing_measurement.source_registry_projection(p_company,p_trial) registry,public.marketing_trial_census_inventory(p_company,p_trial) census),
 receipts AS MATERIALIZED(
  SELECT r.* FROM public.marketing_fb_lead_receipts r CROSS JOIN source x
  LEFT JOIN public.crm_lead_source_evidence s ON s.receipt_id=r.id AND s.company_id=p_company
  LEFT JOIN marketing_measurement.census_observations o ON o.run_id=(x.census->'run'->>'id')::uuid AND o.page_id=r.page_id AND o.leadgen_id=r.leadgen_id
  WHERE r.company_id=p_company AND NOT coalesce(
   x.census->'run'->>'state'='SCANNED' AND x.census->'run'->>'scopeCurrent'='true'
   AND o.form_id=r.form_id AND(o.acquired_at<(x.census->'run'->>'since')::timestamptz OR o.acquired_at>=(x.census->'run'->>'until')::timestamptz)
   AND(s.id IS NULL OR(s.lead_id=r.lead_id AND s.provider='META_LEAD_ADS_V1' AND s.proof->>'pageId'=r.page_id AND s.proof->>'formId'=r.form_id
    AND s.proof->>'leadgenId'=r.leadgen_id AND s.acquired_at=o.acquired_at AND(s.proof->>'acquiredAt')::timestamptz=s.acquired_at AND s.proof->>'source'=s.source_kind)),false)
  ORDER BY r.id LIMIT 5001),
 proofs AS MATERIALIZED(SELECT s.* FROM public.crm_lead_source_evidence s WHERE s.company_id=p_company
  AND(EXISTS(SELECT 1 FROM receipts r WHERE r.id=s.receipt_id) OR NOT EXISTS(SELECT 1 FROM public.marketing_fb_lead_receipts r WHERE r.id=s.receipt_id AND r.company_id=p_company)) ORDER BY s.id LIMIT 5001)
 SELECT jsonb_build_object('policy','SOURCE_EXPORT_BUSINESS_CONTEXT_V2','registry',registry-'asOf','census',census,
  'receiptCount',(SELECT count(*) FROM receipts),'sourceCount',(SELECT count(*) FROM proofs),
  'receiptDigest',(SELECT marketing_measurement.fingerprint(coalesce(jsonb_agg(jsonb_build_object('id',r.id,'page',r.page_id,'form',r.form_id,'leadgen',r.leadgen_id,
   'state',CASE WHEN r.state IN('PENDING','LEASED') THEN 'UNPROCESSED' ELSE r.state END,'lead',r.lead_id,'customer',r.customer_id,'binding',r.binding_revision)),'[]'::jsonb)) FROM receipts r),
  'sourceDigest',(SELECT marketing_measurement.fingerprint(coalesce(jsonb_agg(jsonb_build_object('id',s.id,'receipt',s.receipt_id,'lead',s.lead_id,'provider',s.provider,'source',s.source_kind,'acquiredAt',s.acquired_at,'proof',s.proof-'fetchedAt','routing',s.routing)),'[]'::jsonb)) FROM proofs s),
  'relevantReceiptIds',coalesce((SELECT jsonb_agg(id ORDER BY id) FROM receipts),'[]'::jsonb),
  'relevantObservations',coalesce((SELECT jsonb_agg(v) FROM jsonb_array_elements(census->'observations')v WHERE EXISTS(SELECT 1 FROM receipts r WHERE r.page_id=v->>'pageId' AND r.leadgen_id=v->>'leadgenId')),'[]'::jsonb))
 INTO body FROM source WHERE registry IS NOT NULL;
 IF(body->>'receiptCount')::int>5000 OR(body->>'sourceCount')::int>5000 THEN RAISE EXCEPTION 'source scope too large' USING ERRCODE='54000';END IF;
 signature:=jsonb_set(body,'{census}',(body->'census')-'observations');
 RETURN(body-'relevantObservations')||jsonb_build_object('contextVersion',marketing_measurement.fingerprint(signature));
END $$;

CREATE TABLE IF NOT EXISTS marketing_measurement.measurement_snapshots(
 request_id uuid PRIMARY KEY,company_id uuid NOT NULL,trial_id uuid NOT NULL REFERENCES public.marketing_lead_trials(id),
 actor_id uuid NOT NULL,command jsonb NOT NULL,context_version text NOT NULL,captured_at timestamptz NOT NULL,
 calculation_version text NOT NULL,report jsonb NOT NULL,report_digest text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE INDEX IF NOT EXISTS marketing_measurement_snapshots_trial ON marketing_measurement.measurement_snapshots(company_id,trial_id,recorded_at DESC);
ALTER TABLE marketing_measurement.measurement_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON marketing_measurement.measurement_snapshots FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION marketing_measurement.measurement_context(p_company uuid,p_trial uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE facts jsonb;exports jsonb;dependencies jsonb;gates jsonb;export_version text;relevant_receipts jsonb;normalized_receipts jsonb;
BEGIN
 -- Both STABLE helpers and the evidence rows below share this statement snapshot.
 WITH f AS MATERIALIZED(SELECT marketing_measurement.trial_facts(p_company,p_trial) value),
 e AS MATERIALIZED(SELECT marketing_measurement.export_context(p_company,p_trial) value),
 latest AS(SELECT DISTINCT ON(page_id,form_id) x.* FROM marketing_measurement.source_exports x
  WHERE x.company_id=p_company AND x.trial_id=p_trial ORDER BY page_id,form_id,recorded_at DESC,request_id DESC)
 SELECT f.value,e.value->>'contextVersion',e.value->'relevantReceiptIds',
  coalesce((SELECT jsonb_agg(jsonb_build_object('requestId',x.request_id,'pageId',x.page_id,'formId',x.form_id,
   'status',x.result->'status','censusRunId',x.result->'censusRunId','registryDigest',x.result->'registryDigest',
   'fileSha256',x.result->'fileSha256','normalizedRowsDigest',x.result->'normalizedRowsDigest','exportedAt',x.result->'exportedAt','recordedAt',x.recorded_at,
   'currentStatus',CASE WHEN NOT marketing_measurement.source_actor_current(x.actor_id,p_company) THEN 'STALE_AUTHORITY' WHEN x.context_version IS DISTINCT FROM e.value->>'contextVersion' THEN 'STALE_CONTEXT' ELSE 'CURRENT' END) ORDER BY x.page_id,x.form_id) FROM latest x),'[]'::jsonb)
 INTO facts,export_version,relevant_receipts,exports FROM f CROSS JOIN e;
 IF facts IS NULL OR facts->>'complete' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'trial facts unavailable' USING ERRCODE='54000';END IF;
 IF jsonb_array_length(exports)>1000 THEN RAISE EXCEPTION 'too many exports' USING ERRCODE='54000';END IF;
 SELECT coalesce(jsonb_agg((r-'receivedAt'-'failureCode')||jsonb_build_object('state',CASE WHEN r->>'state' IN('PENDING','LEASED') THEN 'UNPROCESSED' ELSE r->>'state' END)),'[]'::jsonb)
 INTO normalized_receipts FROM jsonb_array_elements(facts->'receipts')r WHERE relevant_receipts ? (r->>'id');
 dependencies:=jsonb_build_object(
  'trial',marketing_measurement.fingerprint(facts->'trial'),
  'identity',marketing_measurement.fingerprint((facts->'identity')-'asOf'),
  'qualification',marketing_measurement.fingerprint(facts->'qualities'),
  'spend',marketing_measurement.fingerprint(jsonb_build_array(facts->'accounts',facts->'runs')),
  'source',marketing_measurement.fingerprint(jsonb_build_array(facts->'sources',normalized_receipts,(facts->'providerReconciliation')-'observations')),
  'registry',marketing_measurement.fingerprint((facts->'sourceRegistry')-'asOf'),
  'exports',marketing_measurement.fingerprint(exports),'exportContext',export_version);
 gates:=jsonb_build_object('closedDay',(statement_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
  'spendFresh',(SELECT coalesce(jsonb_agg(jsonb_build_array(r->'id',(r->>'started_at')::timestamptz BETWEEN statement_timestamp()-interval '6 hours' AND statement_timestamp())),'[]'::jsonb) FROM jsonb_array_elements(facts->'runs')r),
  'censusFresh',coalesce((facts->'providerReconciliation'->'run'->>'finishedAt')::timestamptz BETWEEN statement_timestamp()-interval '6 hours' AND statement_timestamp(),false));
 RETURN jsonb_build_object('facts',facts,'exports',exports,'dependencies',dependencies,
  'contextVersion',marketing_measurement.fingerprint(jsonb_build_object('policy','MARKETING_MEASUREMENT_SNAPSHOT_V1','dependencies',dependencies,'timeGates',gates)));
END $$;

CREATE OR REPLACE FUNCTION marketing_measurement.snapshot_receipt(p_row marketing_measurement.measurement_snapshots)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('policy','MARKETING_MEASUREMENT_SNAPSHOT_V1','requestId',p_row.request_id,'companyId',p_row.company_id,'trialId',p_row.trial_id,
  'actorId',p_row.actor_id,'contextVersion',p_row.context_version,'capturedAt',p_row.captured_at,'recordedAt',p_row.recorded_at,
  'calculationVersion',p_row.calculation_version,'reportDigest',p_row.report_digest,'report',p_row.report,'replayed',false,'allowBudgetExecution',false)
$$;

CREATE OR REPLACE FUNCTION public.marketing_measurement_prepare(p_actor uuid,p_company uuid,p_trial uuid,p_request uuid DEFAULT NULL,p_version text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE ctx jsonb;history jsonb;old marketing_measurement.measurement_snapshots%ROWTYPE;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' OR NOT marketing_measurement.source_actor_current(p_actor,p_company) THEN RAISE EXCEPTION 'service authority required' USING ERRCODE='42501';END IF;
 PERFORM public.marketing_fb_intake_admin(p_actor,p_company);
 IF(p_request IS NULL)<>(p_version IS NULL) OR(p_version IS NOT NULL AND p_version!~'^[a-f0-9]{64}$') THEN RAISE EXCEPTION 'invalid request' USING ERRCODE='22023';END IF;
 IF p_request IS NOT NULL THEN
  SELECT * INTO old FROM marketing_measurement.measurement_snapshots WHERE request_id=p_request;
  IF FOUND THEN
   IF old.company_id<>p_company OR old.trial_id<>p_trial OR old.actor_id<>p_actor OR old.context_version<>p_version THEN RAISE EXCEPTION 'request reused' USING ERRCODE='23505';END IF;
   RETURN jsonb_build_object('receipt',marketing_measurement.snapshot_receipt(old)||jsonb_build_object('replayed',true));
  END IF;
 END IF;
 WITH c AS MATERIALIZED(SELECT marketing_measurement.measurement_context(p_company,p_trial) value),
 recent AS(SELECT x.* FROM marketing_measurement.measurement_snapshots x WHERE company_id=p_company AND trial_id=p_trial ORDER BY recorded_at DESC,request_id DESC LIMIT 20)
 SELECT c.value,coalesce((SELECT jsonb_agg(jsonb_build_object('receipt',marketing_measurement.snapshot_receipt(x),
  'currentStatus',CASE WHEN NOT marketing_measurement.source_actor_current(x.actor_id,p_company) THEN 'STALE_AUTHORITY' WHEN x.context_version IS DISTINCT FROM c.value->>'contextVersion' THEN 'CHANGED_SINCE_CAPTURE' ELSE 'UNCHANGED_INPUTS' END) ORDER BY x.recorded_at DESC,x.request_id DESC) FROM recent x),'[]'::jsonb)
 INTO ctx,history FROM c;
 IF p_version IS NOT NULL AND p_version IS DISTINCT FROM ctx->>'contextVersion' THEN RAISE EXCEPTION 'measurement changed' USING ERRCODE='40001';END IF;
 RETURN ctx||jsonb_build_object('actorId',p_actor,'companyId',p_company,'trialId',p_trial,'history',history);
END $$;

CREATE OR REPLACE FUNCTION public.marketing_measurement_record(p_actor uuid,p_company uuid,p_trial uuid,p_request uuid,p_version text,p_report jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE old marketing_measurement.measurement_snapshots%ROWTYPE;ctx jsonb;captured timestamptz;recorded timestamptz;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' OR NOT marketing_measurement.source_actor_current(p_actor,p_company) THEN RAISE EXCEPTION 'service authority required' USING ERRCODE='42501';END IF;
 PERFORM public.marketing_fb_intake_admin(p_actor,p_company);
 IF p_request IS NULL OR(p_version~'^[a-f0-9]{64}$') IS NOT TRUE THEN RAISE EXCEPTION 'invalid request' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('marketing-measurement-request:'||p_request::text,0));
 SELECT * INTO old FROM marketing_measurement.measurement_snapshots WHERE request_id=p_request;
 IF FOUND THEN
  IF old.company_id<>p_company OR old.trial_id<>p_trial OR old.actor_id<>p_actor OR old.context_version<>p_version THEN RAISE EXCEPTION 'request reused' USING ERRCODE='23505';END IF;
  RETURN marketing_measurement.snapshot_receipt(old)||jsonb_build_object('replayed',true);
 END IF;
 PERFORM 1 FROM public.marketing_lead_trials WHERE id=p_trial AND company_id=p_company FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'trial denied' USING ERRCODE='42501';END IF;
 SELECT marketing_measurement.measurement_context(p_company,p_trial) INTO ctx;
 IF ctx->>'contextVersion' IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'measurement changed' USING ERRCODE='40001';END IF;
 -- The Application Service calculates the report; only this private service RPC
 -- accepts that projection. The browser never supplies any report or raw facts.
 IF jsonb_typeof(p_report) IS DISTINCT FROM 'object' OR octet_length(p_report::text)>500000
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_report)k WHERE k NOT IN('calculationVersion','companyId','trialId','asOf','status','period','spend','counts','observedMeasurement','dependencies','obligations','targetStatus','allowBudgetExecution'))
  OR p_report->>'calculationVersion' IS DISTINCT FROM 'OBSERVED_TRIAL_REPORT_V1'
  OR p_report->>'companyId' IS DISTINCT FROM p_company::text OR p_report->>'trialId' IS DISTINCT FROM p_trial::text
  OR p_report->>'status' IS DISTINCT FROM 'SAVED_OBSERVED_INCOMPLETE' OR p_report->>'targetStatus' IS DISTINCT FROM 'NOT_EVALUATED'
  OR p_report->'allowBudgetExecution' IS DISTINCT FROM 'false'::jsonb OR p_report->'dependencies' IS DISTINCT FROM ctx->'dependencies'
  OR jsonb_typeof(p_report->'obligations') IS DISTINCT FROM 'array' OR jsonb_array_length(p_report->'obligations')>3000
  OR p_report->'period'->>'policy' IS DISTINCT FROM 'VIETNAM_CLOSED_DAY_V1' THEN RAISE EXCEPTION 'invalid calculated report' USING ERRCODE='22023';END IF;
 captured:=(p_report->>'asOf')::timestamptz;
 IF captured IS NULL OR NOT isfinite(captured) OR captured>clock_timestamp() OR captured<clock_timestamp()-interval '60 seconds'
  OR p_report->'period'->>'qualificationAsOf' IS DISTINCT FROM p_report->>'asOf'
  THEN RAISE EXCEPTION 'capture expired' USING ERRCODE='40001';END IF;
 recorded:=clock_timestamp();
 INSERT INTO marketing_measurement.measurement_snapshots(request_id,company_id,trial_id,actor_id,command,context_version,captured_at,calculation_version,report,report_digest,recorded_at)
 VALUES(p_request,p_company,p_trial,p_actor,jsonb_build_object('requestId',p_request,'contextVersion',p_version),p_version,captured,'OBSERVED_TRIAL_REPORT_V1',p_report,marketing_measurement.fingerprint(p_report),recorded) RETURNING * INTO old;
 IF NOT marketing_measurement.source_actor_current(p_actor,p_company) OR p_version IS DISTINCT FROM marketing_measurement.measurement_context(p_company,p_trial)->>'contextVersion'
  OR clock_timestamp()>captured+interval '60 seconds' THEN RAISE EXCEPTION 'measurement changed during save' USING ERRCODE='40001';END IF;
 RETURN marketing_measurement.snapshot_receipt(old);
END $$;

REVOKE ALL ON FUNCTION marketing_measurement.trial_facts(uuid,uuid),marketing_measurement.canonical_set(jsonb),marketing_measurement.fingerprint(jsonb),
 marketing_measurement.measurement_context(uuid,uuid),marketing_measurement.snapshot_receipt(marketing_measurement.measurement_snapshots) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.marketing_measurement_prepare(uuid,uuid,uuid,uuid,text),public.marketing_measurement_record(uuid,uuid,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_measurement_prepare(uuid,uuid,uuid,uuid,text),public.marketing_measurement_record(uuid,uuid,uuid,uuid,text,jsonb) TO service_role;
COMMIT;

