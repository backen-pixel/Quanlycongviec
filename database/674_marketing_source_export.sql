-- Source-export comparisons preserve evidence; matching is not full coverage.
BEGIN;
CREATE TABLE IF NOT EXISTS marketing_measurement.source_exports(
 request_id uuid PRIMARY KEY,company_id uuid NOT NULL,trial_id uuid NOT NULL REFERENCES public.marketing_lead_trials(id),actor_id uuid NOT NULL,
 page_id text NOT NULL,form_id text NOT NULL,context_version text NOT NULL,command jsonb NOT NULL,result jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE INDEX IF NOT EXISTS marketing_source_exports_scope ON marketing_measurement.source_exports(trial_id,page_id,form_id,recorded_at DESC);
ALTER TABLE marketing_measurement.source_exports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON marketing_measurement.source_exports FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.marketing_trial_census_inventory(p_company uuid,p_trial uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 WITH latest AS(SELECT * FROM public.marketing_fb_census_runs WHERE company_id=p_company AND trial_id=p_trial ORDER BY started_at DESC,id DESC LIMIT 1),
 items AS(SELECT i.* FROM public.marketing_fb_census_items i JOIN latest r ON r.id=i.run_id
   WHERE i.acquired_at<coalesce(r.measurement_until_at,r.until_at) ORDER BY i.page_id,i.leadgen_id LIMIT 5001),
 observations AS(SELECT o.* FROM marketing_measurement.census_observations o JOIN latest r ON r.id=o.run_id
   WHERE EXISTS(SELECT 1 FROM public.marketing_fb_lead_receipts x WHERE x.company_id=p_company AND x.page_id=o.page_id AND x.leadgen_id=o.leadgen_id)
   ORDER BY o.page_id,o.leadgen_id LIMIT 5001),
 forms AS(SELECT f.* FROM public.marketing_fb_census_forms f JOIN latest r ON r.id=f.run_id ORDER BY f.page_id,f.form_id LIMIT 5001)
 SELECT coalesce((SELECT jsonb_build_object('version',2,'companyId',p_company,'trialId',p_trial,'status','AVAILABLE',
  'complete',(SELECT count(*)<=5000 FROM items) AND(SELECT count(*)<=5000 FROM forms) AND(SELECT count(*)<=5000 FROM observations),
  'run',jsonb_build_object('id',r.id,'state',r.state,'trialRevision',r.trial_revision,'since',r.since_at,'until',coalesce(r.measurement_until_at,r.until_at),'recoveryUntil',r.until_at,'startedAt',r.started_at,'finishedAt',r.finished_at,
   'witness',marketing_measurement.census_witness(r.id),'measurementPolicy',r.measurement_policy,'scopeCurrent',r.scope=public.marketing_fb_census_scope(p_company,p_trial),'tasksPending',(SELECT count(*) FROM public.marketing_fb_census_tasks WHERE run_id=r.id AND state<>'DONE')),
  'measuredEvidence',jsonb_build_object('policy','MEASURED_SOURCE_TUPLES_V1','count',(SELECT count(*) FROM items),'digest',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_array(page_id,form_id,leadgen_id,extract(epoch FROM acquired_at)) ORDER BY page_id,leadgen_id),'[]'::jsonb)::text,'UTF8')),'hex') FROM items)),
  'items',coalesce((SELECT jsonb_agg(jsonb_build_object('pageId',page_id,'formId',form_id,'leadgenId',leadgen_id,'acquiredAt',acquired_at,'receiptId',receipt_id) ORDER BY page_id,leadgen_id) FROM items),'[]'::jsonb),
  'observations',coalesce((SELECT jsonb_agg(jsonb_build_object('pageId',page_id,'formId',form_id,'leadgenId',leadgen_id,'acquiredAt',acquired_at,'observedAt',observed_at,'graphVersion',graph_version) ORDER BY page_id,leadgen_id) FROM observations),'[]'::jsonb),
  'forms',coalesce((SELECT jsonb_agg(jsonb_build_object('pageId',page_id,'formId',form_id,'discovered',discovered,'expiredLeads',expired_leads) ORDER BY page_id,form_id) FROM forms),'[]'::jsonb)) FROM latest r),jsonb_build_object('status','MISSING'))
$$;


CREATE OR REPLACE FUNCTION marketing_measurement.export_context(p_company uuid,p_trial uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE body jsonb;
BEGIN
 WITH source AS(SELECT marketing_measurement.source_registry_projection(p_company,p_trial) registry,public.marketing_trial_census_inventory(p_company,p_trial) census),
 receipts AS MATERIALIZED(SELECT * FROM public.marketing_fb_lead_receipts WHERE company_id=p_company ORDER BY id LIMIT 5001),
 proofs AS MATERIALIZED(SELECT * FROM public.crm_lead_source_evidence WHERE company_id=p_company ORDER BY id LIMIT 5001)
 SELECT jsonb_build_object('registry',registry-'asOf','census',census,'receiptCount',(SELECT count(*) FROM receipts),'sourceCount',(SELECT count(*) FROM proofs),
  'receiptDigest',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]'::jsonb)::text,'UTF8')),'hex') FROM receipts x),
  'sourceDigest',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]'::jsonb)::text,'UTF8')),'hex') FROM proofs x)) INTO body FROM source WHERE registry IS NOT NULL;
 IF(body->>'receiptCount')::int>5000 OR(body->>'sourceCount')::int>5000 THEN RAISE EXCEPTION 'source scope too large' USING ERRCODE='54000';END IF;
 RETURN body||jsonb_build_object('contextVersion',encode(sha256(convert_to(body::text,'UTF8')),'hex'));
END;
$$;

CREATE OR REPLACE FUNCTION public.marketing_source_export_read(p_actor uuid,p_company uuid,p_trial uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' OR NOT marketing_measurement.source_actor_current(p_actor,p_company) THEN RAISE EXCEPTION 'current service authority required' USING ERRCODE='42501';END IF;
 PERFORM public.marketing_fb_intake_admin(p_actor,p_company);
 WITH ctx AS MATERIALIZED(SELECT marketing_measurement.export_context(p_company,p_trial) value),
 latest AS(SELECT DISTINCT ON(page_id,form_id) e.* FROM marketing_measurement.source_exports e WHERE company_id=p_company AND trial_id=p_trial ORDER BY page_id,form_id,recorded_at DESC,request_id DESC)
 SELECT jsonb_build_object('policy','SOURCE_EXPORT_COMPARISON_V1','actorId',p_actor,'companyId',p_company,'trialId',p_trial,'asOf',statement_timestamp(),
  'contextVersion',value->'contextVersion','registry',value->'registry','census',value->'census',
  'exports',coalesce((SELECT jsonb_agg(jsonb_build_object('receipt',e.result,'currentStatus',CASE WHEN NOT marketing_measurement.source_actor_current(e.actor_id,p_company) THEN 'STALE_AUTHORITY' WHEN e.context_version<>value->>'contextVersion' THEN 'STALE_CONTEXT' ELSE 'CURRENT' END) ORDER BY e.page_id,e.form_id) FROM latest e),'[]'::jsonb),
  'providerCoverage','UNVERIFIED','allowBudgetExecution',false) INTO result FROM ctx WHERE value IS NOT NULL;
 IF result IS NULL THEN RAISE EXCEPTION 'trial denied' USING ERRCODE='42501';END IF;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.marketing_source_export_record(p_actor uuid,p_company uuid,p_trial uuid,p_request uuid,p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE ctx jsonb;reg jsonb;census jsonb;r jsonb;x jsonb;old marketing_measurement.source_exports%ROWTYPE;export_time timestamptz;since_at timestamptz;until_at timestamptz;rows_normal jsonb;comparison jsonb;result jsonb;recorded timestamptz;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' OR NOT marketing_measurement.source_actor_current(p_actor,p_company) THEN RAISE EXCEPTION 'current service authority required' USING ERRCODE='42501';END IF;
 PERFORM public.marketing_fb_intake_admin(p_actor,p_company);
 IF p_request IS NULL OR p_trial IS NULL OR jsonb_typeof(p_command) IS DISTINCT FROM 'object'
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_command)k WHERE k NOT IN('contextVersion','pageId','formId','rows','fileSha256','fileBytes','encoding','parser','delimiter','columns','exportedAt','sourceReference','sourceNote'))
  OR(p_command->>'contextVersion'~'^[a-f0-9]{64}$') IS NOT TRUE OR(p_command->>'fileSha256'~'^[a-f0-9]{64}$') IS NOT TRUE
  OR jsonb_typeof(p_command->'contextVersion') IS DISTINCT FROM 'string' OR jsonb_typeof(p_command->'fileSha256') IS DISTINCT FROM 'string'
  OR jsonb_typeof(p_command->'pageId') IS DISTINCT FROM 'string' OR jsonb_typeof(p_command->'formId') IS DISTINCT FROM 'string'
  OR(p_command->>'pageId'~'^[0-9]{1,32}$') IS NOT TRUE OR(p_command->>'formId'~'^[0-9]{1,32}$') IS NOT TRUE
  OR jsonb_typeof(p_command->'rows') IS DISTINCT FROM 'array' OR jsonb_array_length(p_command->'rows')>5000
  OR jsonb_typeof(p_command->'fileBytes') IS DISTINCT FROM 'number' OR(p_command->>'fileBytes'~'^[1-9][0-9]{0,6}$') IS NOT TRUE OR(p_command->>'fileBytes')::int>1048576
  OR p_command->>'parser' IS DISTINCT FROM 'DELIMITED_SOURCE_IDS_V1' OR coalesce(p_command->>'encoding','') NOT IN('UTF-8','UTF-16LE')
  OR coalesce(p_command->>'delimiter','') NOT IN(',', ';', E'\t') OR jsonb_typeof(p_command->'columns') IS DISTINCT FROM 'object'
  OR jsonb_typeof(p_command->'sourceReference') IS DISTINCT FROM 'string' OR length(btrim(p_command->>'sourceReference')) NOT BETWEEN 8 AND 500
  OR jsonb_typeof(p_command->'sourceNote') IS DISTINCT FROM 'string' OR length(btrim(p_command->>'sourceNote')) NOT BETWEEN 20 AND 2000
  OR(p_command->>'exportedAt'~'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$') IS NOT TRUE THEN RAISE EXCEPTION 'invalid evidence' USING ERRCODE='22023';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_command->'columns')k WHERE k NOT IN('id','createdAt','formId'))
  OR jsonb_typeof(p_command->'columns'->'id') IS DISTINCT FROM 'string' OR length(p_command->'columns'->>'id') NOT BETWEEN 1 AND 120
  OR jsonb_typeof(p_command->'columns'->'createdAt') IS DISTINCT FROM 'string' OR length(p_command->'columns'->>'createdAt') NOT BETWEEN 1 AND 120
  OR (jsonb_typeof(p_command->'columns'->'formId') IS DISTINCT FROM 'null' AND(jsonb_typeof(p_command->'columns'->'formId') IS DISTINCT FROM 'string' OR length(p_command->'columns'->>'formId') NOT BETWEEN 1 AND 120))
  OR (SELECT count(*)<>count(DISTINCT value) FROM jsonb_each_text(p_command->'columns') WHERE value IS NOT NULL) THEN RAISE EXCEPTION 'invalid columns' USING ERRCODE='22023';END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(p_command->'rows') LOOP
  IF jsonb_typeof(x) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(x)k WHERE k NOT IN('leadgenId','formId','acquiredAt'))
   OR jsonb_typeof(x->'leadgenId') IS DISTINCT FROM 'string' OR(x->>'leadgenId'~'^[0-9]{1,32}$') IS NOT TRUE OR jsonb_typeof(x->'formId') IS DISTINCT FROM 'string' OR(x->>'formId'~'^[0-9]{1,32}$') IS NOT TRUE
   OR(x->>'acquiredAt'~'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$') IS NOT TRUE THEN RAISE EXCEPTION 'invalid row' USING ERRCODE='22023';END IF;
  export_time:=(x->>'acquiredAt')::timestamptz;IF NOT isfinite(export_time) THEN RAISE EXCEPTION 'finite timestamp required' USING ERRCODE='22023';END IF;
 END LOOP;
 -- One append is the evidence and audit record. Replay checks current authority
 -- first, then returns the unchanged historical receipt even if source changed.
 PERFORM pg_advisory_xact_lock(hashtextextended('marketing-export-request:'||p_request::text,0));
 SELECT * INTO old FROM marketing_measurement.source_exports WHERE request_id=p_request;
 IF FOUND THEN
  IF old.company_id<>p_company OR old.trial_id<>p_trial OR old.actor_id<>p_actor OR old.command IS DISTINCT FROM p_command THEN RAISE EXCEPTION 'request reused' USING ERRCODE='23505';END IF;
  RETURN old.result||jsonb_build_object('replayed',true);
 END IF;
 PERFORM 1 FROM public.marketing_lead_trials WHERE id=p_trial AND company_id=p_company FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'trial denied' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM marketing_measurement.source_registry WHERE trial_id=p_trial AND company_id=p_company FOR SHARE;
 SELECT marketing_measurement.export_context(p_company,p_trial) INTO ctx;
 IF ctx IS NULL OR ctx->>'contextVersion' IS DISTINCT FROM p_command->>'contextVersion' THEN RAISE EXCEPTION 'context changed' USING ERRCODE='40001';END IF;
 reg:=ctx->'registry';census:=ctx->'census';r:=census->'run';
 IF reg->>'status' IS DISTINCT FROM 'CURRENT' OR census->>'complete' IS DISTINCT FROM 'true' OR r->>'state' IS DISTINCT FROM 'SCANNED' OR r->>'scopeCurrent' IS DISTINCT FROM 'true'
  OR r->'witness'->>'status' IS DISTINCT FROM 'TRAVERSED' OR r->>'measurementPolicy' IS DISTINCT FROM 'VIETNAM_CLOSED_DAY_V1'
  OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(reg->'declaration'->'entries')e WHERE e->>'kind'='META_LEAD_ADS' AND e->>'pageId'=p_command->>'pageId' AND e->>'formId'=p_command->>'formId')
  OR NOT EXISTS(SELECT 1 FROM public.facebook_pages p WHERE p.page_id=p_command->>'pageId' AND p.default_company_id=p_company AND p.is_active IS TRUE) THEN RAISE EXCEPTION 'scope not ready' USING ERRCODE='40001';END IF;
 since_at:=(r->>'since')::timestamptz;until_at:=(r->>'until')::timestamptz;export_time:=(p_command->>'exportedAt')::timestamptz;
 IF until_at<=since_at OR export_time<until_at OR export_time>clock_timestamp() OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_command->'rows')z WHERE(z->>'acquiredAt')::timestamptz>export_time) THEN RAISE EXCEPTION 'invalid export time' USING ERRCODE='22023';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('leadgenId',e->>'leadgenId','formId',e->>'formId','acquiredEpoch',extract(epoch FROM(e->>'acquiredAt')::timestamptz)) ORDER BY e->>'leadgenId',e->>'formId',e->>'acquiredAt'),'[]'::jsonb) INTO rows_normal FROM jsonb_array_elements(p_command->'rows')e;
 WITH exported AS(SELECT e->>'leadgenId' id,e->>'formId' form,(e->>'acquiredEpoch')::numeric stamp FROM jsonb_array_elements(rows_normal)e),
 in_period AS(SELECT * FROM exported WHERE stamp>=extract(epoch FROM since_at) AND stamp<extract(epoch FROM until_at)),
 grouped AS(SELECT e.id,min(e.form) form,min(e.stamp) stamp,count(*) n,count(DISTINCT(e.form,e.stamp)) variants FROM exported e WHERE EXISTS(SELECT 1 FROM in_period p WHERE p.id=e.id)
  OR EXISTS(SELECT 1 FROM marketing_measurement.census_observations z WHERE z.run_id=(r->>'id')::uuid AND z.page_id=p_command->>'pageId' AND z.form_id=p_command->>'formId' AND z.leadgen_id=e.id AND z.acquired_at>=since_at AND z.acquired_at<until_at) GROUP BY e.id),
 observed AS(SELECT o.leadgen_id id,o.form_id form,extract(epoch FROM o.acquired_at) stamp FROM marketing_measurement.census_observations o WHERE o.run_id=(r->>'id')::uuid AND o.page_id=p_command->>'pageId'
  AND((o.form_id=p_command->>'formId' AND o.acquired_at>=since_at AND o.acquired_at<until_at) OR EXISTS(SELECT 1 FROM grouped g WHERE g.id=o.leadgen_id))),
 compared AS(SELECT coalesce(e.id,o.id) id,e.form exported_form,o.form observed_form,e.stamp exported_stamp,o.stamp observed_stamp,
  CASE WHEN e.variants>1 OR(e.id IS NOT NULL AND e.form<>p_command->>'formId') THEN 'EXPORT_CONFLICT' WHEN e.id IS NULL THEN 'NOT_IN_EXPORT' WHEN o.id IS NULL THEN 'NOT_OBSERVED' WHEN e.form<>o.form OR e.stamp<>o.stamp THEN 'SOURCE_CONFLICT' ELSE 'MATCHED' END reason FROM grouped e FULL JOIN observed o USING(id))
 SELECT jsonb_build_object('rows',jsonb_array_length(rows_normal),'inPeriodRows',(SELECT count(*) FROM in_period),'outsidePeriodRows',(SELECT count(*) FROM exported WHERE stamp<extract(epoch FROM since_at) OR stamp>=extract(epoch FROM until_at)),
  'uniqueExportIds',(SELECT count(DISTINCT id) FROM in_period),'duplicateRows',(SELECT count(*)-count(DISTINCT id) FROM exported),'observedIds',(SELECT count(*) FROM observed),
  'matched',(SELECT count(*) FROM compared WHERE reason='MATCHED'),'notInExport',(SELECT count(*) FROM compared WHERE reason='NOT_IN_EXPORT'),'notObserved',(SELECT count(*) FROM compared WHERE reason='NOT_OBSERVED'),
  'conflicts',(SELECT count(*) FROM compared WHERE reason IN('EXPORT_CONFLICT','SOURCE_CONFLICT')),
  'differences',coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM(SELECT id,reason,exported_form AS "exportedForm",observed_form AS "observedForm",exported_stamp AS "exportedEpoch",observed_stamp AS "observedEpoch" FROM compared WHERE reason<>'MATCHED' ORDER BY id LIMIT 100)d),'[]'::jsonb)) INTO comparison;
 recorded:=clock_timestamp();
 result:=jsonb_build_object('policy','SOURCE_EXPORT_COMPARISON_V1','actorId',p_actor,'companyId',p_company,'trialId',p_trial,'requestId',p_request,'recordedAt',recorded,'replayed',false,
  'pageId',p_command->>'pageId','formId',p_command->>'formId','contextVersion',ctx->>'contextVersion','censusRunId',r->>'id','registryDigest',reg->'declaration'->>'declarationDigest','pagesDigest',r->'witness'->>'pagesDigest',
  'sinceAt',since_at,'untilExclusive',until_at,'fileSha256',p_command->>'fileSha256','fileBytes',p_command->'fileBytes','normalizedRowsDigest',encode(sha256(convert_to(rows_normal::text,'UTF8')),'hex'),
  'exportedAt',p_command->>'exportedAt','sourceReference',p_command->>'sourceReference','sourceNote',p_command->>'sourceNote','comparison',comparison,
  'status',CASE WHEN(comparison->>'conflicts')::int>0 OR(comparison->>'notInExport')::int>0 OR(comparison->>'notObserved')::int>0 THEN 'DISCREPANCIES' WHEN(comparison->>'duplicateRows')::int>0 THEN 'DUPLICATE_ROWS' WHEN(comparison->>'uniqueExportIds')::int=0 THEN 'EMPTY_COMPARISON' ELSE 'MATCHED_EXPORTED_IDS' END,
  'providerCoverage','UNVERIFIED','allowBudgetExecution',false);
 INSERT INTO marketing_measurement.source_exports(request_id,company_id,trial_id,actor_id,page_id,form_id,context_version,command,result,recorded_at) VALUES(p_request,p_company,p_trial,p_actor,p_command->>'pageId',p_command->>'formId',ctx->>'contextVersion',p_command,result,recorded);
 IF NOT marketing_measurement.source_actor_current(p_actor,p_company) OR ctx->>'contextVersion' IS DISTINCT FROM marketing_measurement.export_context(p_company,p_trial)->>'contextVersion' THEN RAISE EXCEPTION 'context changed during save' USING ERRCODE='40001';END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION marketing_measurement.export_context(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.marketing_source_export_read(uuid,uuid,uuid),public.marketing_source_export_record(uuid,uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_source_export_read(uuid,uuid,uuid),public.marketing_source_export_record(uuid,uuid,uuid,uuid,jsonb) TO service_role;
COMMIT;
