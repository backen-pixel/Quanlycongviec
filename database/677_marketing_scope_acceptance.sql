-- Accepted declared Facebook scope. This is a measurement decision, never a
-- provider-universe certificate, AI permission or authorization to spend.
BEGIN;
CREATE TABLE IF NOT EXISTS marketing_measurement.scope_acceptances(
 request_id uuid PRIMARY KEY, company_id uuid NOT NULL,
 trial_id uuid NOT NULL REFERENCES public.marketing_lead_trials(id), actor_id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision>0), action text NOT NULL CHECK(action IN('ACCEPT','REVOKE')),
 command jsonb NOT NULL, context_version text, report jsonb, artifact bytea,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(company_id,trial_id,revision),
 CHECK((action='ACCEPT' AND context_version IS NOT NULL AND report IS NOT NULL AND artifact IS NOT NULL)
    OR(action='REVOKE' AND context_version IS NULL AND report IS NULL AND artifact IS NULL)));
ALTER TABLE marketing_measurement.scope_acceptances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON marketing_measurement.scope_acceptances FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION marketing_measurement.scope_context(p_company uuid,p_trial uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE ctx jsonb;details jsonb;version text;
BEGIN
 -- Facts, current export status, immutable export receipt and delivery witnesses
 -- share one statement snapshot. Each contributes to the acceptance fingerprint.
 WITH c AS MATERIALIZED(SELECT marketing_measurement.measurement_context(p_company,p_trial) value)
 SELECT c.value,coalesce((SELECT jsonb_agg(jsonb_build_object('requestId',x.request_id,'result',x.result) ORDER BY x.request_id)
  FROM marketing_measurement.source_exports x WHERE x.company_id=p_company AND x.trial_id=p_trial
  AND EXISTS(SELECT 1 FROM jsonb_array_elements(c.value->'exports')e WHERE e->>'requestId'=x.request_id::text)),'[]'::jsonb)
 INTO ctx,details FROM c;
 version:=marketing_measurement.fingerprint(jsonb_build_object('policy','ACCEPTED_DECLARED_FACEBOOK_SCOPE_V1',
  'measurement',ctx->'contextVersion','delivery',ctx->'facts'->'accountDelivery','exportDetails',details));
 RETURN ctx||jsonb_build_object('contextVersion',version,'exportDetails',details);
END $$;

CREATE OR REPLACE FUNCTION marketing_measurement.scope_context_or_null(p_company uuid,p_trial uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 RETURN marketing_measurement.scope_context(p_company,p_trial);
EXCEPTION WHEN OTHERS THEN
 -- A source failure must hide current measurements, but must not prevent an
 -- authorized operator from revoking the latest acceptance. No ACCEPT uses this.
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION marketing_measurement.scope_receipt(p_row marketing_measurement.scope_acceptances)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('policy','ACCEPTED_DECLARED_FACEBOOK_SCOPE_V1','requestId',p_row.request_id,
  'companyId',p_row.company_id,'trialId',p_row.trial_id,'actorId',p_row.actor_id,'revision',p_row.revision,
  'action',p_row.action,'contextVersion',p_row.context_version,'recordedAt',p_row.recorded_at,
  'artifactSha256',p_row.command->'artifactSha256','artifactBytes',p_row.command->'artifactBytes',
  'targetRequestId',p_row.command->'targetRequestId','report',p_row.report,'replayed',false,'allowBudgetExecution',false)
$$;

CREATE OR REPLACE FUNCTION marketing_measurement.scope_command_valid(p_command jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE x jsonb;start_at timestamptz;end_at timestamptz;
BEGIN
 IF jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR octet_length(p_command::text)>500000
  OR jsonb_typeof(p_command->'expectedRevision') IS DISTINCT FROM 'number'
  OR(p_command->>'expectedRevision'~'^(0|[1-9][0-9]{0,8})$') IS NOT TRUE THEN
  RAISE EXCEPTION 'invalid scope command' USING ERRCODE='22023';END IF;
 IF p_command->>'action'='REVOKE' THEN
  IF(SELECT count(*) FROM jsonb_object_keys(p_command))<>4
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_command)k WHERE k NOT IN('action','expectedRevision','targetRequestId','reason'))
   OR(p_command->>'targetRequestId'~'^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[1-5][a-fA-F0-9]{3}-[89abAB][a-fA-F0-9]{3}-[a-fA-F0-9]{12}$') IS NOT TRUE
   OR jsonb_typeof(p_command->'reason') IS DISTINCT FROM 'string' OR length(btrim(p_command->>'reason')) NOT BETWEEN 20 AND 2000 THEN
   RAISE EXCEPTION 'invalid revoke command' USING ERRCODE='22023';END IF;
  RETURN;
 END IF;
 IF p_command->>'action' IS DISTINCT FROM 'ACCEPT' OR(SELECT count(*) FROM jsonb_object_keys(p_command))<>10
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_command)k WHERE k NOT IN('action','expectedRevision','contextVersion','reference','note','claims','manifest','exportClaims','artifactSha256','artifactBytes'))
  OR(p_command->>'contextVersion'~'^[a-f0-9]{64}$') IS NOT TRUE OR(p_command->>'artifactSha256'~'^[a-f0-9]{64}$') IS NOT TRUE
  OR jsonb_typeof(p_command->'reference') IS DISTINCT FROM 'string' OR length(btrim(p_command->>'reference')) NOT BETWEEN 8 AND 500
  OR jsonb_typeof(p_command->'note') IS DISTINCT FROM 'string' OR length(btrim(p_command->>'note')) NOT BETWEEN 20 AND 2000
  OR jsonb_typeof(p_command->'artifactBytes') IS DISTINCT FROM 'number' OR(p_command->>'artifactBytes'~'^[1-9][0-9]{0,6}$') IS NOT TRUE
  OR(p_command->>'artifactBytes')::integer>1048576
  OR jsonb_typeof(p_command->'claims') IS DISTINCT FROM 'array' OR jsonb_array_length(p_command->'claims')<>3
  OR NOT(p_command->'claims' @> '["HISTORICAL_DESTINATION_SETS_CHECKED","ALL_ACCOUNT_DELIVERY_CHECKED","EXPORT_FILTERS_TIME_AND_RETENTION_CHECKED"]'::jsonb)
  OR jsonb_typeof(p_command->'manifest') IS DISTINCT FROM 'array' OR jsonb_array_length(p_command->'manifest')>1000
  OR jsonb_typeof(p_command->'exportClaims') IS DISTINCT FROM 'array' OR jsonb_array_length(p_command->'exportClaims')>1000 THEN
  RAISE EXCEPTION 'invalid acceptance command' USING ERRCODE='22023';END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(p_command->'manifest') LOOP
  IF jsonb_typeof(x) IS DISTINCT FROM 'object' OR(SELECT count(*) FROM jsonb_object_keys(x))<>5
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(x)k WHERE k NOT IN('accountId','adId','validFrom','validUntil','destinations'))
   OR jsonb_typeof(x->'accountId') IS DISTINCT FROM 'string' OR(x->>'accountId'~'^act_[0-9]{1,32}$') IS NOT TRUE
   OR jsonb_typeof(x->'adId') IS DISTINCT FROM 'string' OR(x->>'adId'~'^[0-9]{1,32}$') IS NOT TRUE
   OR(x->>'validFrom'~'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$') IS NOT TRUE
   OR(x->>'validUntil'~'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$') IS NOT TRUE
   OR jsonb_typeof(x->'destinations') IS DISTINCT FROM 'array' OR jsonb_array_length(x->'destinations') NOT BETWEEN 1 AND 300
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(x->'destinations')d WHERE jsonb_typeof(d)<>'string' OR(d#>>'{}')!~'^[a-f0-9]{64}$')
   OR(SELECT count(*)<>count(DISTINCT value) FROM jsonb_array_elements(x->'destinations')) THEN
   RAISE EXCEPTION 'invalid historical destinations' USING ERRCODE='22023';END IF;
  start_at:=(x->>'validFrom')::timestamptz;end_at:=(x->>'validUntil')::timestamptz;
  IF NOT isfinite(start_at) OR NOT isfinite(end_at) OR start_at>=end_at THEN RAISE EXCEPTION 'invalid interval' USING ERRCODE='22023';END IF;
 END LOOP;
 FOR x IN SELECT value FROM jsonb_array_elements(p_command->'exportClaims') LOOP
  IF jsonb_typeof(x) IS DISTINCT FROM 'object' OR(SELECT count(*) FROM jsonb_object_keys(x))<>3
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(x)k WHERE k NOT IN('requestId','fileSha256','normalizedRowsDigest'))
   OR(x->>'requestId'~'^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[1-5][a-fA-F0-9]{3}-[89abAB][a-fA-F0-9]{3}-[a-fA-F0-9]{12}$') IS NOT TRUE
   OR(x->>'fileSha256'~'^[a-f0-9]{64}$') IS NOT TRUE OR(x->>'normalizedRowsDigest'~'^[a-f0-9]{64}$') IS NOT TRUE THEN
   RAISE EXCEPTION 'invalid export claims' USING ERRCODE='22023';END IF;
 END LOOP;
 IF(SELECT count(*)<>count(DISTINCT value->>'requestId') FROM jsonb_array_elements(p_command->'exportClaims')) THEN RAISE EXCEPTION 'duplicate export claim' USING ERRCODE='22023';END IF;
END $$;

CREATE OR REPLACE FUNCTION marketing_measurement.scope_view(p_company uuid,p_trial uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE ctx jsonb;history jsonb;latest marketing_measurement.scope_acceptances%ROWTYPE;state text;
BEGIN
 SELECT marketing_measurement.scope_context_or_null(p_company,p_trial) INTO ctx;
 SELECT * INTO latest FROM marketing_measurement.scope_acceptances WHERE company_id=p_company AND trial_id=p_trial ORDER BY revision DESC LIMIT 1;
 state:=CASE WHEN latest.request_id IS NULL THEN 'MISSING' WHEN latest.action='REVOKE' THEN 'REVOKED'
  WHEN NOT marketing_measurement.source_actor_current(latest.actor_id,p_company) THEN 'STALE_AUTHORITY'
  WHEN ctx IS NULL THEN 'SOURCE_UNAVAILABLE' WHEN latest.context_version IS DISTINCT FROM ctx->>'contextVersion' THEN 'CHANGED_SOURCE' ELSE 'CURRENT' END;
 SELECT coalesce(jsonb_agg(marketing_measurement.scope_receipt(x) ORDER BY revision DESC),'[]'::jsonb) INTO history
 FROM(SELECT * FROM marketing_measurement.scope_acceptances WHERE company_id=p_company AND trial_id=p_trial ORDER BY revision DESC LIMIT 20)x;
 RETURN jsonb_build_object('context',ctx,'revision',coalesce(latest.revision,0),'currentStatus',state,'history',history);
END $$;

CREATE OR REPLACE FUNCTION public.marketing_scope_prepare(p_actor uuid,p_company uuid,p_trial uuid,p_request uuid DEFAULT NULL,p_command jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE old marketing_measurement.scope_acceptances%ROWTYPE;result jsonb;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' OR NOT marketing_measurement.source_actor_current(p_actor,p_company) THEN RAISE EXCEPTION 'service authority required' USING ERRCODE='42501';END IF;
 PERFORM public.marketing_fb_intake_admin(p_actor,p_company);
 IF NOT marketing_measurement.source_actor_current(p_actor,p_company) THEN RAISE EXCEPTION 'authority changed while waiting' USING ERRCODE='42501';END IF;
 IF(p_request IS NULL)<>(p_command IS NULL) THEN RAISE EXCEPTION 'invalid request' USING ERRCODE='22023';END IF;
 IF p_request IS NOT NULL THEN
  PERFORM marketing_measurement.scope_command_valid(p_command);
  SELECT * INTO old FROM marketing_measurement.scope_acceptances WHERE request_id=p_request;
  IF FOUND THEN
   IF old.company_id<>p_company OR old.trial_id<>p_trial OR old.actor_id<>p_actor OR old.command IS DISTINCT FROM p_command THEN RAISE EXCEPTION 'request reused' USING ERRCODE='23505';END IF;
   RETURN jsonb_build_object('receipt',marketing_measurement.scope_receipt(old)||jsonb_build_object('replayed',true));
  END IF;
 END IF;
 PERFORM 1 FROM public.marketing_lead_trials WHERE id=p_trial AND company_id=p_company;
 IF NOT FOUND THEN RAISE EXCEPTION 'trial denied' USING ERRCODE='42501';END IF;
 SELECT marketing_measurement.scope_view(p_company,p_trial) INTO result;
 RETURN result||jsonb_build_object('actorId',p_actor,'companyId',p_company,'trialId',p_trial);
END $$;

CREATE OR REPLACE FUNCTION public.marketing_scope_record(p_actor uuid,p_company uuid,p_trial uuid,p_request uuid,p_command jsonb,p_report jsonb,p_artifact text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE old marketing_measurement.scope_acceptances%ROWTYPE;latest marketing_measurement.scope_acceptances%ROWTYPE;
 ctx jsonb;bytes bytea;captured timestamptz;from_at timestamptz;until_at timestamptz;cost numeric;qualified bigint;spend bigint;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' OR NOT marketing_measurement.source_actor_current(p_actor,p_company) THEN RAISE EXCEPTION 'service authority required' USING ERRCODE='42501';END IF;
 PERFORM public.marketing_fb_intake_admin(p_actor,p_company);
 IF NOT marketing_measurement.source_actor_current(p_actor,p_company) THEN RAISE EXCEPTION 'authority changed while waiting' USING ERRCODE='42501';END IF;
 IF p_request IS NULL THEN RAISE EXCEPTION 'request required' USING ERRCODE='22023';END IF;
 PERFORM marketing_measurement.scope_command_valid(p_command);
 IF p_command->>'action'='ACCEPT' THEN
  IF p_artifact IS NULL OR length(p_artifact)>1398104 OR length(p_artifact)%4<>0 OR p_artifact!~'^[A-Za-z0-9+/]*={0,2}$' THEN RAISE EXCEPTION 'invalid artifact' USING ERRCODE='22023';END IF;
  bytes:=decode(p_artifact,'base64');
  IF octet_length(bytes) NOT BETWEEN 1 AND 1048576 OR octet_length(bytes)<>(p_command->>'artifactBytes')::integer OR encode(sha256(bytes),'hex')<>p_command->>'artifactSha256'
   OR replace(encode(bytes,'base64'),E'\n','')<>p_artifact THEN RAISE EXCEPTION 'artifact mismatch' USING ERRCODE='22023';END IF;
 ELSIF p_report IS NOT NULL OR p_artifact IS NOT NULL THEN RAISE EXCEPTION 'revoke has no report or artifact' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('marketing-scope-request:'||p_request::text,0));
 SELECT * INTO old FROM marketing_measurement.scope_acceptances WHERE request_id=p_request;
 IF FOUND THEN
  IF old.company_id<>p_company OR old.trial_id<>p_trial OR old.actor_id<>p_actor OR old.command IS DISTINCT FROM p_command THEN RAISE EXCEPTION 'request reused' USING ERRCODE='23505';END IF;
  RETURN marketing_measurement.scope_receipt(old)||jsonb_build_object('replayed',true);
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('marketing-scope-stream:'||p_company::text||':'||p_trial::text,0));
 PERFORM 1 FROM public.marketing_lead_trials WHERE id=p_trial AND company_id=p_company FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'trial denied' USING ERRCODE='42501';END IF;
 SELECT * INTO latest FROM marketing_measurement.scope_acceptances WHERE company_id=p_company AND trial_id=p_trial ORDER BY revision DESC LIMIT 1;
 IF coalesce(latest.revision,0)<>(p_command->>'expectedRevision')::integer THEN RAISE EXCEPTION 'scope decision changed' USING ERRCODE='40001';END IF;
 IF p_command->>'action'='REVOKE' THEN
  IF latest.action IS DISTINCT FROM 'ACCEPT' OR latest.request_id::text IS DISTINCT FROM p_command->>'targetRequestId' THEN RAISE EXCEPTION 'revoke target changed' USING ERRCODE='40001';END IF;
 ELSE
  SELECT marketing_measurement.scope_context(p_company,p_trial) INTO ctx;
  IF ctx->>'contextVersion' IS DISTINCT FROM p_command->>'contextVersion' THEN RAISE EXCEPTION 'source changed' USING ERRCODE='40001';END IF;
  -- Only the trusted Application Service supplies this projection; browser input
  -- supplies provenance/intervals, never a spend amount or qualified count.
  IF jsonb_typeof(p_report) IS DISTINCT FROM 'object' OR octet_length(p_report::text)>20000
   OR(SELECT count(*) FROM jsonb_object_keys(p_report))<>20
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_report)k WHERE k NOT IN('policy','measurement','companyId','trialId','contextVersion','asOf','sinceAt','untilExclusive','accountIds','status','spendVnd','qualifiedLeads','costPerQualifiedLeadVnd','targetVnd','targetStatus','basis','providerUniverseVerified','allChannelsMeasured','allowBudgetExecution','qualificationAsOf'))
   OR p_report->>'policy' IS DISTINCT FROM 'ACCEPTED_DECLARED_FACEBOOK_SCOPE_V1' OR p_report->>'measurement' IS DISTINCT FROM 'QUALIFIED_SCOPE_CPQL'
   OR p_report->>'companyId' IS DISTINCT FROM p_company::text OR p_report->>'trialId' IS DISTINCT FROM p_trial::text
   OR p_report->>'contextVersion' IS DISTINCT FROM ctx->>'contextVersion' OR p_report->>'qualificationAsOf' IS DISTINCT FROM p_report->>'asOf'
   OR p_report->'accountIds' IS DISTINCT FROM ctx->'facts'->'trial'->'account_ids'
   OR p_report->'providerUniverseVerified' IS DISTINCT FROM 'false'::jsonb OR p_report->'allChannelsMeasured' IS DISTINCT FROM 'false'::jsonb
   OR p_report->'allowBudgetExecution' IS DISTINCT FROM 'false'::jsonb OR p_report->'targetVnd' IS DISTINCT FROM '250000'::jsonb
   OR p_report->>'basis' IS DISTINCT FROM 'OPERATOR_ACCEPTED_PROVENANCE_AND_SERVER_RECONCILIATION'
   OR jsonb_typeof(p_report->'spendVnd') IS DISTINCT FROM 'number' OR(p_report->>'spendVnd'~'^(0|[1-9][0-9]{0,15})$') IS NOT TRUE
   OR jsonb_typeof(p_report->'qualifiedLeads') IS DISTINCT FROM 'number' OR(p_report->>'qualifiedLeads'~'^(0|[1-9][0-9]{0,4})$') IS NOT TRUE THEN RAISE EXCEPTION 'invalid calculated report' USING ERRCODE='22023';END IF;
  spend:=(p_report->>'spendVnd')::bigint;qualified:=(p_report->>'qualifiedLeads')::bigint;
  IF spend>9007199254740991 OR qualified>5000 THEN RAISE EXCEPTION 'invalid amounts' USING ERRCODE='22023';END IF;
  IF qualified=0 THEN
   IF p_report->'costPerQualifiedLeadVnd' IS DISTINCT FROM 'null'::jsonb OR p_report->>'status' IS DISTINCT FROM 'NO_QUALIFIED_LEADS' OR p_report->>'targetStatus' IS DISTINCT FROM 'NOT_EVALUATED' THEN RAISE EXCEPTION 'zero denominator' USING ERRCODE='22023';END IF;
  ELSE
   cost:=spend::numeric/qualified;
   IF jsonb_typeof(p_report->'costPerQualifiedLeadVnd') IS DISTINCT FROM 'number' OR abs((p_report->>'costPerQualifiedLeadVnd')::numeric-cost)>greatest(0.00000001,abs(cost)*0.000000000000001)
    OR p_report->>'status' IS DISTINCT FROM 'ACCEPTED_SCOPE'
    OR p_report->>'targetStatus' IS DISTINCT FROM CASE WHEN cost<=250000 THEN 'AT_OR_BELOW_TARGET_IN_SCOPE' ELSE 'ABOVE_TARGET_IN_SCOPE' END THEN RAISE EXCEPTION 'invalid quotient' USING ERRCODE='22023';END IF;
  END IF;
  captured:=(p_report->>'asOf')::timestamptz;from_at:=(p_report->>'sinceAt')::timestamptz;until_at:=(p_report->>'untilExclusive')::timestamptz;
  IF captured IS NULL OR NOT isfinite(captured) OR captured>clock_timestamp() OR captured<clock_timestamp()-interval '60 seconds' THEN RAISE EXCEPTION 'capture expired' USING ERRCODE='40001';END IF;
  IF from_at IS NULL OR until_at IS NULL OR NOT isfinite(from_at) OR NOT isfinite(until_at) OR from_at>=until_at
   OR from_at IS DISTINCT FROM(ctx->'facts'->'providerReconciliation'->'run'->>'since')::timestamptz
   OR until_at IS DISTINCT FROM(ctx->'facts'->'providerReconciliation'->'run'->>'until')::timestamptz THEN RAISE EXCEPTION 'invalid period' USING ERRCODE='22023';END IF;
 END IF;
 INSERT INTO marketing_measurement.scope_acceptances(request_id,company_id,trial_id,actor_id,revision,action,command,context_version,report,artifact)
 VALUES(p_request,p_company,p_trial,p_actor,coalesce(latest.revision,0)+1,p_command->>'action',p_command,p_command->>'contextVersion',p_report,bytes) RETURNING * INTO old;
 IF NOT marketing_measurement.source_actor_current(p_actor,p_company) THEN RAISE EXCEPTION 'authority changed' USING ERRCODE='42501';END IF;
 IF p_command->>'action'='ACCEPT' AND(p_command->>'contextVersion' IS DISTINCT FROM marketing_measurement.scope_context(p_company,p_trial)->>'contextVersion'
  OR clock_timestamp()>captured+interval '60 seconds') THEN RAISE EXCEPTION 'source changed during acceptance' USING ERRCODE='40001';END IF;
 RETURN marketing_measurement.scope_receipt(old);
END $$;

REVOKE ALL ON FUNCTION marketing_measurement.scope_context(uuid,uuid),marketing_measurement.scope_context_or_null(uuid,uuid),
 marketing_measurement.scope_receipt(marketing_measurement.scope_acceptances),marketing_measurement.scope_command_valid(jsonb),marketing_measurement.scope_view(uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.marketing_scope_prepare(uuid,uuid,uuid,uuid,jsonb),public.marketing_scope_record(uuid,uuid,uuid,uuid,jsonb,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_scope_prepare(uuid,uuid,uuid,uuid,jsonb),public.marketing_scope_record(uuid,uuid,uuid,uuid,jsonb,jsonb,text) TO service_role;
COMMIT;
