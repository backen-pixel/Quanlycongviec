-- Provider ad delivery, coupled atomically to its whole-account spend run.
-- No destination acceptance, live enrollment or spending authority is granted.
BEGIN;
CREATE SCHEMA IF NOT EXISTS marketing_measurement;
REVOKE ALL ON SCHEMA marketing_measurement FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE IF NOT EXISTS marketing_measurement.account_delivery_evidence(
 run_id bigint PRIMARY KEY REFERENCES public.marketing_spend_sync_runs(id),
 company_id uuid NOT NULL,ad_account_id text NOT NULL,
 payload jsonb NOT NULL,payload_digest text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp());
ALTER TABLE marketing_measurement.account_delivery_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON marketing_measurement.account_delivery_evidence FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION marketing_measurement.validate_delivery(p_snapshot jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE d jsonb:=p_snapshot->'delivery';r jsonb;w jsonb;dt date;v numeric;field text;
 days date[]:='{}';keys text[]:='{}';labels text[]:='{}';expected text[]:=ARRAY['BEFORE_DAILY','BEFORE_TOTAL','AD_DAILY','AD_TOTAL','AFTER_DAILY','AFTER_TOTAL'];
BEGIN
 IF jsonb_typeof(d) IS DISTINCT FROM 'object' OR d->>'policy' IS DISTINCT FROM 'META_ACCOUNT_DELIVERY_V1'
  OR (d->>'graphVersion'~'^v[0-9]{2,3}\.0$') IS NOT TRUE OR d->>'destinationCoverage' IS DISTINCT FROM 'UNVERIFIED'
  OR(d->>'rowDigest'~'^[a-f0-9]{64}$') IS NOT TRUE OR jsonb_typeof(d->'accountDays') IS DISTINCT FROM 'array'
  OR jsonb_typeof(d->'adDays') IS DISTINCT FROM 'array' OR jsonb_typeof(d->'witnesses') IS DISTINCT FROM 'array'
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(d)k WHERE k<>ALL(ARRAY['policy','graphVersion','accountDays','adDays','witnesses','rowDigest','destinationCoverage'])) THEN
  RAISE EXCEPTION 'invalid delivery evidence' USING ERRCODE='22023';END IF;
 IF jsonb_array_length(d->'adDays')>5000 OR jsonb_array_length(d->'accountDays') NOT BETWEEN 1 AND 93 OR jsonb_array_length(d->'witnesses')<>6 THEN
  RAISE EXCEPTION 'delivery evidence limit' USING ERRCODE='22023';END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(d->'accountDays') LOOP
  IF jsonb_typeof(r) IS DISTINCT FROM 'object' OR(r->>'date'~'^\d{4}-\d{2}-\d{2}$') IS NOT TRUE
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(r)k WHERE k<>ALL(ARRAY['date','amountVnd','impressions','clicks'])) THEN RAISE EXCEPTION 'invalid delivery day' USING ERRCODE='22023';END IF;
  dt:=(r->>'date')::date;
  IF dt=ANY(days) OR dt<(p_snapshot->>'since')::date OR dt>(p_snapshot->>'until')::date THEN RAISE EXCEPTION 'delivery day scope' USING ERRCODE='22023';END IF;
  days:=array_append(days,dt);
  FOREACH field IN ARRAY ARRAY['amountVnd','impressions','clicks'] LOOP
   IF jsonb_typeof(r->field) IS DISTINCT FROM 'number' OR(r->>field~'^(0|[1-9][0-9]*)$') IS NOT TRUE THEN RAISE EXCEPTION 'invalid delivery metric' USING ERRCODE='22023';END IF;
   v:=(r->>field)::numeric;IF v>9007199254740991 THEN RAISE EXCEPTION 'delivery metric overflow' USING ERRCODE='22023';END IF;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_snapshot->'days')x WHERE x->>'date'=r->>'date' AND x->'amountVnd'=r->'amountVnd') THEN RAISE EXCEPTION 'delivery spend mismatch' USING ERRCODE='22023';END IF;
 END LOOP;
 IF cardinality(days)<>(p_snapshot->>'until')::date-(p_snapshot->>'since')::date+1 THEN RAISE EXCEPTION 'delivery missing days' USING ERRCODE='22023';END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(d->'adDays') LOOP
  IF jsonb_typeof(r) IS DISTINCT FROM 'object' OR(r->>'date'~'^\d{4}-\d{2}-\d{2}$') IS NOT TRUE
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(r)k WHERE k<>ALL(ARRAY['date','adId','adsetId','campaignId','amountVnd','impressions','clicks'])) THEN RAISE EXCEPTION 'invalid delivery ad' USING ERRCODE='22023';END IF;
  FOREACH field IN ARRAY ARRAY['adId','adsetId','campaignId'] LOOP
   IF jsonb_typeof(r->field) IS DISTINCT FROM 'string' OR(r->>field~'^[0-9]{1,32}$') IS NOT TRUE THEN RAISE EXCEPTION 'invalid delivery id' USING ERRCODE='22023';END IF;
  END LOOP;
  dt:=(r->>'date')::date;
  IF NOT dt=ANY(days) OR concat(r->>'adId',':',r->>'date')=ANY(keys) THEN RAISE EXCEPTION 'duplicate or outside delivery ad' USING ERRCODE='22023';END IF;
  keys:=array_append(keys,concat(r->>'adId',':',r->>'date'));
  FOREACH field IN ARRAY ARRAY['amountVnd','impressions','clicks'] LOOP
   IF jsonb_typeof(r->field) IS DISTINCT FROM 'number' OR(r->>field~'^(0|[1-9][0-9]*)$') IS NOT TRUE THEN RAISE EXCEPTION 'invalid delivery metric' USING ERRCODE='22023';END IF;
   v:=(r->>field)::numeric;IF v>9007199254740991 THEN RAISE EXCEPTION 'delivery metric overflow' USING ERRCODE='22023';END IF;
  END LOOP;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(d->'adDays')x GROUP BY x->>'adId' HAVING count(DISTINCT x->>'adsetId')>1 OR count(DISTINCT x->>'campaignId')>1) THEN RAISE EXCEPTION 'delivery ad conflict' USING ERRCODE='22023';END IF;
 FOREACH field IN ARRAY ARRAY['amountVnd','impressions','clicks'] LOOP
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(d->'accountDays')a WHERE(a->>field)::numeric IS DISTINCT FROM
   (SELECT coalesce(sum((x->>field)::numeric),0) FROM jsonb_array_elements(d->'adDays')x WHERE x->>'date'=a->>'date')) THEN RAISE EXCEPTION 'delivery totals mismatch' USING ERRCODE='22023';END IF;
  IF(SELECT sum((a->>field)::numeric) FROM jsonb_array_elements(d->'accountDays')a)>9007199254740991 THEN RAISE EXCEPTION 'delivery totals overflow' USING ERRCODE='22023';END IF;
 END LOOP;
 FOR w IN SELECT value FROM jsonb_array_elements(d->'witnesses') LOOP
  IF jsonb_typeof(w) IS DISTINCT FROM 'object' OR NOT coalesce(w->>'label'=ANY(expected),false) OR(w->>'label')=ANY(labels)
   OR jsonb_typeof(w->'pages') IS DISTINCT FROM 'number' OR(w->>'pages'~'^[1-9][0-9]*$') IS NOT TRUE
   OR jsonb_typeof(w->'rows') IS DISTINCT FROM 'number' OR(w->>'rows'~'^(0|[1-9][0-9]*)$') IS NOT TRUE
   OR(w->>'digest'~'^[a-f0-9]{64}$') IS NOT TRUE
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(w)k WHERE k<>ALL(ARRAY['label','pages','rows','digest'])) THEN RAISE EXCEPTION 'invalid delivery witness' USING ERRCODE='22023';END IF;
  IF(w->>'pages')::numeric>50 OR(w->>'rows')::numeric>5000 THEN RAISE EXCEPTION 'delivery witness limit' USING ERRCODE='22023';END IF;
  labels:=array_append(labels,w->>'label');
 END LOOP;
 IF(SELECT (x->>'rows')::int FROM jsonb_array_elements(d->'witnesses')x WHERE x->>'label'='AD_DAILY')<>jsonb_array_length(d->'adDays')
  OR(SELECT (x->>'rows')::int FROM jsonb_array_elements(d->'witnesses')x WHERE x->>'label'='AD_TOTAL')<>(SELECT count(DISTINCT x->>'adId') FROM jsonb_array_elements(d->'adDays')x) THEN RAISE EXCEPTION 'delivery witness counts mismatch' USING ERRCODE='22023';END IF;
 RETURN d;
END $$;

DO $$ BEGIN
 IF to_regprocedure('marketing_measurement.spend_finish_base(bigint,uuid,jsonb,text)') IS NULL THEN
  ALTER FUNCTION public.marketing_spend_finish(bigint,uuid,jsonb,text) RENAME TO spend_finish_base;
  ALTER FUNCTION public.spend_finish_base(bigint,uuid,jsonb,text) SET SCHEMA marketing_measurement;
 END IF;
END $$;
REVOKE ALL ON FUNCTION marketing_measurement.spend_finish_base(bigint,uuid,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
-- Keep the legacy validator private even if an operational tool later grants
-- broad function access. current_setting(role) retains the caller's role.
DO $$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('marketing_measurement.spend_finish_base(bigint,uuid,jsonb,text)'::regprocedure);
 IF position('service authority required' IN definition)=0 THEN
  definition:=replace(replace(definition,E'\r\n',E'\n'),E'BEGIN\n',E'BEGIN\n  IF current_setting(''role'',true) IS DISTINCT FROM ''service_role'' THEN RAISE EXCEPTION ''service authority required'' USING ERRCODE=''42501''; END IF;\n');
  IF position('service authority required' IN definition)=0 THEN RAISE EXCEPTION 'unexpected legacy validator definition';END IF;
  EXECUTE definition;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.marketing_spend_finish(p_id bigint,p_company uuid,p_snapshot jsonb,p_failure text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE run public.marketing_spend_sync_runs%ROWTYPE;d jsonb;result jsonb;old marketing_measurement.account_delivery_evidence%ROWTYPE;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service authority required' USING ERRCODE='42501';END IF;
 SELECT * INTO run FROM public.marketing_spend_sync_runs WHERE id=p_id AND company_id=p_company FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'spend scope denied' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM public.fb_ad_accounts WHERE ad_account_id=run.ad_account_id AND company_id=p_company AND bat IS TRUE AND(token_het_han IS NULL OR token_het_han>clock_timestamp()) FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'account scope revoked' USING ERRCODE='42501';END IF;
 IF p_snapshot ? 'delivery' THEN d:=marketing_measurement.validate_delivery(p_snapshot);END IF;
 SELECT * INTO old FROM marketing_measurement.account_delivery_evidence WHERE run_id=p_id;
 IF run.state<>'RUNNING' AND(d IS DISTINCT FROM old.payload) THEN RAISE EXCEPTION 'delivery evidence changed' USING ERRCODE='22023';END IF;
 result:=marketing_measurement.spend_finish_base(p_id,p_company,p_snapshot-'delivery',p_failure);
 IF d IS NOT NULL AND run.state='RUNNING' THEN
  INSERT INTO marketing_measurement.account_delivery_evidence(run_id,company_id,ad_account_id,payload,payload_digest)
   VALUES(p_id,p_company,run.ad_account_id,d,encode(sha256(convert_to(d::text,'UTF8')),'hex'));
 END IF;
 RETURN result||jsonb_build_object('deliveryEvidence',CASE WHEN d IS NULL THEN NULL ELSE jsonb_build_object('runId',p_id,'payloadDigest',encode(sha256(convert_to(d::text,'UTF8')),'hex')) END);
END $$;

-- Read the witness in the SAME statement snapshot as trial spend and receipts.
-- It is server-only input; the public projection below must still bound output.
DO $$ BEGIN
 IF to_regprocedure('marketing_measurement.trial_facts_without_delivery(uuid,uuid)') IS NULL THEN
  ALTER FUNCTION marketing_measurement.trial_facts(uuid,uuid) RENAME TO trial_facts_without_delivery;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION marketing_measurement.trial_facts(p_company uuid,p_trial uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 WITH f AS MATERIALIZED(SELECT marketing_measurement.trial_facts_without_delivery(p_company,p_trial) value)
 SELECT value||jsonb_build_object('accountDelivery',coalesce((SELECT jsonb_agg(jsonb_build_object(
  'runId',e.run_id,'companyId',e.company_id,'accountId',e.ad_account_id,'payload',e.payload,'payloadDigest',e.payload_digest,'recordedAt',e.recorded_at) ORDER BY e.ad_account_id)
  FROM marketing_measurement.account_delivery_evidence e WHERE e.company_id=p_company AND EXISTS(SELECT 1 FROM jsonb_array_elements(value->'runs')r WHERE(r->>'id')::bigint=e.run_id)),'[]'::jsonb)) FROM f
$$;
REVOKE ALL ON FUNCTION marketing_measurement.validate_delivery(jsonb),marketing_measurement.trial_facts_without_delivery(uuid,uuid),marketing_measurement.trial_facts(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.marketing_lead_trial_snapshot(p_actor uuid,p_company uuid,p_trial uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service required' USING ERRCODE='42501';END IF;
 PERFORM public.marketing_fb_intake_admin(p_actor,p_company);
 IF NOT marketing_measurement.source_actor_current(p_actor,p_company) THEN RAISE EXCEPTION 'current authority required' USING ERRCODE='42501';END IF;
 SELECT marketing_measurement.trial_facts(p_company,p_trial) INTO result;
 IF result IS NULL THEN RAISE EXCEPTION 'trial not found' USING ERRCODE='P0002';END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.marketing_lead_trial_snapshot(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_lead_trial_snapshot(uuid,uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.marketing_spend_finish(bigint,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_spend_finish(bigint,uuid,jsonb,text) TO service_role;
COMMIT;
