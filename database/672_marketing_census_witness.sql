-- Accepted collector-page evidence. Traversal is not provider completeness.
-- Additive: no old pages or lease times are fabricated. Pause/drain workers first.
BEGIN;
ALTER TABLE public.marketing_fb_census_tasks ADD COLUMN IF NOT EXISTS lease_started_at timestamptz;
CREATE TABLE IF NOT EXISTS marketing_measurement.census_pages(
 run_id uuid NOT NULL REFERENCES public.marketing_fb_census_runs(id),task_id uuid NOT NULL REFERENCES public.marketing_fb_census_tasks(id),
 ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 1000),page_id text NOT NULL,form_id text NOT NULL,kind text NOT NULL CHECK(kind IN('FORMS','LEADS')),
 graph_version text NOT NULL CHECK(graph_version~'^v[0-9]{2,3}\.0$'),rows jsonb NOT NULL CHECK(jsonb_typeof(rows)='array' AND jsonb_array_length(rows)<=100),
 body jsonb NOT NULL CHECK(jsonb_typeof(body)='object'),page_digest text NOT NULL CHECK(page_digest~'^[a-f0-9]{64}$'),recorded_at timestamptz NOT NULL,
 PRIMARY KEY(task_id,ordinal),CHECK(isfinite(recorded_at)));
CREATE INDEX IF NOT EXISTS marketing_census_pages_run ON marketing_measurement.census_pages(run_id,task_id,ordinal);
ALTER TABLE marketing_measurement.census_pages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON marketing_measurement.census_pages FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.marketing_fb_census_claim(p_pages text[],p_token uuid)
RETURNS SETOF public.marketing_fb_census_tasks LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service required' USING ERRCODE='42501';END IF;
 IF p_token IS NULL OR coalesce(cardinality(p_pages),0) NOT BETWEEN 1 AND 100 OR EXISTS(SELECT 1 FROM unnest(p_pages)x WHERE (x~'^[0-9]{1,32}$') IS NOT TRUE) THEN RAISE EXCEPTION 'invalid claim' USING ERRCODE='22023';END IF;
 RETURN QUERY WITH pick AS(SELECT q.id FROM public.marketing_fb_census_tasks q JOIN public.marketing_fb_census_runs r ON r.id=q.run_id
  WHERE r.state='RUNNING' AND q.page_id=ANY(p_pages) AND(q.state='PENDING' OR(q.state='LEASED' AND q.lease_until<=clock_timestamp()))
  ORDER BY r.started_at,q.kind,q.id LIMIT 1 FOR UPDATE OF q SKIP LOCKED)
 UPDATE public.marketing_fb_census_tasks q SET state='LEASED',lease_token=p_token,lease_until=clock_timestamp()+interval '60 seconds',lease_started_at=clock_timestamp(),attempts=attempts+1 FROM pick WHERE q.id=pick.id RETURNING q.*;
END $$;
CREATE OR REPLACE FUNCTION public.marketing_fb_census_commit(p_task uuid,p_token uuid,p_chunk jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE q public.marketing_fb_census_tasks%ROWTYPE;r public.marketing_fb_census_runs%ROWTYPE;x jsonb;nxt text;stamp timestamptz;receipt public.marketing_fb_lead_receipts%ROWTYPE;prior public.marketing_fb_census_items%ROWTYPE;observation marketing_measurement.census_observations%ROWTYPE;canonical_rows jsonb;page_body jsonb;previous_digest text;accepted_at timestamptz;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service required' USING ERRCODE='42501';END IF;
 -- Run lock precedes task lock for every writer. A claim never waits on run locks.
 SELECT r0.* INTO r FROM public.marketing_fb_census_runs r0 JOIN public.marketing_fb_census_tasks q0 ON q0.run_id=r0.id WHERE q0.id=p_task FOR UPDATE OF r0;
 SELECT * INTO q FROM public.marketing_fb_census_tasks WHERE id=p_task FOR UPDATE;
 PERFORM public.marketing_fb_census_context(p_task,p_token);
 IF NOT marketing_measurement.source_actor_current(r.actor_id,r.company_id) THEN RAISE EXCEPTION 'current authority required' USING ERRCODE='42501';END IF;
 IF jsonb_typeof(p_chunk) IS DISTINCT FROM 'object' OR jsonb_typeof(p_chunk->'rows') IS DISTINCT FROM 'array' OR jsonb_array_length(p_chunk->'rows')>100 OR (p_chunk->>'graphVersion'~'^v[0-9]{2,3}\.0$') IS NOT TRUE OR NOT(p_chunk?'next') THEN RAISE EXCEPTION 'invalid census chunk' USING ERRCODE='22023';END IF;
 IF q.lease_started_at IS NULL OR q.lease_started_at>clock_timestamp() THEN RAISE EXCEPTION 'unwitnessed lease; reclaim required' USING ERRCODE='40001';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_chunk) AS keys(key) WHERE keys.key NOT IN('rows','next','graphVersion'))
  OR jsonb_typeof(p_chunk->'graphVersion') IS DISTINCT FROM 'string'
  OR jsonb_typeof(p_chunk->'next') NOT IN('string','null') THEN RAISE EXCEPTION 'unexpected census fields' USING ERRCODE='22023';END IF;
 IF EXISTS(SELECT 1 FROM marketing_measurement.census_pages w WHERE w.run_id=r.id AND w.graph_version<>p_chunk->>'graphVersion') THEN RAISE EXCEPTION 'graph version changed' USING ERRCODE='40001';END IF;
 IF (SELECT count(*) FROM marketing_measurement.census_pages w WHERE w.run_id=r.id)>=5000 THEN RAISE EXCEPTION 'witness capacity exceeded' USING ERRCODE='54000';END IF;
 nxt:=p_chunk->>'next';
 IF nxt IS NOT NULL AND(length(nxt) NOT BETWEEN 1 AND 2048 OR nxt~'[\r\n]' OR nxt IS NOT DISTINCT FROM q.cursor_after OR q.cursors ? nxt) THEN RAISE EXCEPTION 'cursor loop' USING ERRCODE='22023';END IF;
 IF q.chunks>=1000 OR (q.kind='LEADS' AND (SELECT count(*) FROM marketing_measurement.census_observations WHERE run_id=r.id)+jsonb_array_length(p_chunk->'rows')>50000) OR (q.kind='FORMS' AND (SELECT count(*) FROM public.marketing_fb_census_forms WHERE run_id=r.id)+jsonb_array_length(p_chunk->'rows')>5000) THEN RAISE EXCEPTION 'census capacity exceeded' USING ERRCODE='54000';END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(p_chunk->'rows'))<>(SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(p_chunk->'rows')) THEN RAISE EXCEPTION 'duplicate chunk row' USING ERRCODE='22023';END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(p_chunk->'rows') ORDER BY value->>'id' LOOP
  IF jsonb_typeof(x) IS DISTINCT FROM 'object' OR jsonb_typeof(x->'id') IS DISTINCT FROM 'string' OR (x->>'id'~'^[0-9]{1,32}$') IS NOT TRUE THEN RAISE EXCEPTION 'invalid provider id' USING ERRCODE='22023';END IF;
  IF q.kind='FORMS' THEN
   IF x->>'status' IS NULL OR x->>'status' NOT IN('ACTIVE','ARCHIVED','DELETED','DRAFT') OR (x->>'expiredLeads' IS NOT NULL AND (x->>'expiredLeads'~'^[0-9]{1,9}$') IS NOT TRUE) THEN RAISE EXCEPTION 'invalid form' USING ERRCODE='22023';END IF;
   INSERT INTO public.marketing_fb_census_forms(run_id,page_id,form_id,status,expired_leads,discovered) VALUES(r.id,q.page_id,x->>'id',x->>'status',(x->>'expiredLeads')::integer,true)
   ON CONFLICT(run_id,page_id,form_id) DO UPDATE SET status=excluded.status,expired_leads=excluded.expired_leads,discovered=true;
   INSERT INTO public.marketing_fb_census_tasks(run_id,page_id,form_id,kind) VALUES(r.id,q.page_id,x->>'id','LEADS') ON CONFLICT DO NOTHING;
  ELSE
   stamp:=(x->>'acquiredAt')::timestamptz;
   IF stamp IS NULL OR NOT isfinite(stamp) OR stamp>clock_timestamp() THEN RAISE EXCEPTION 'invalid acquisition time' USING ERRCODE='22023';END IF;
   -- Keep all enumerated timestamps, including records outside the measured
   -- period. Recover through the original fixed operational until_at below.
   SELECT * INTO observation FROM marketing_measurement.census_observations
    WHERE run_id=r.id AND page_id=q.page_id AND leadgen_id=x->>'id';
   IF FOUND AND(observation.form_id<>q.form_id OR observation.acquired_at<>stamp OR observation.graph_version<>p_chunk->>'graphVersion') THEN
    RAISE EXCEPTION 'provider observation changed' USING ERRCODE='40001';
   END IF;
   INSERT INTO marketing_measurement.census_observations(run_id,page_id,form_id,leadgen_id,acquired_at,graph_version)
    VALUES(r.id,q.page_id,q.form_id,x->>'id',stamp,p_chunk->>'graphVersion') ON CONFLICT DO NOTHING;
   IF stamp>=r.since_at AND stamp<r.until_at THEN
    SELECT * INTO prior FROM public.marketing_fb_census_items WHERE run_id=r.id AND page_id=q.page_id AND leadgen_id=x->>'id';
    IF FOUND AND(prior.form_id<>q.form_id OR prior.acquired_at<>stamp) THEN RAISE EXCEPTION 'provider evidence changed' USING ERRCODE='40001';END IF;
    -- The same durable receipt path handles webhook delivery and recovered IDs.
    PERFORM public.marketing_fb_lead_enqueue(jsonb_build_array(jsonb_build_object('pageId',q.page_id,'formId',q.form_id,'leadgenId',x->>'id')),encode(sha256(convert_to('CENSUS:'||r.id::text||':'||q.page_id||':'||q.form_id||':'||(x->>'id'),'UTF8')),'hex'));
    SELECT * INTO receipt FROM public.marketing_fb_lead_receipts WHERE page_id=q.page_id AND leadgen_id=x->>'id';
    INSERT INTO public.marketing_fb_census_items(run_id,page_id,form_id,leadgen_id,acquired_at,receipt_id) VALUES(r.id,q.page_id,q.form_id,x->>'id',stamp,receipt.id) ON CONFLICT DO NOTHING;
   END IF;
  END IF;
 END LOOP;
 -- Store only the accepted metadata contract, never arbitrary provider fields.
 SELECT coalesce(jsonb_agg(CASE WHEN q.kind='FORMS' THEN jsonb_build_object('id',item.value->>'id','status',item.value->>'status','expiredLeads',(item.value->>'expiredLeads')::integer)
  ELSE jsonb_build_object('id',item.value->>'id','acquiredAt',(item.value->>'acquiredAt')::timestamptz) END ORDER BY item.value->>'id'),'[]'::jsonb)
 INTO canonical_rows FROM jsonb_array_elements(p_chunk->'rows') AS item(value);
 SELECT w.page_digest INTO previous_digest FROM marketing_measurement.census_pages w WHERE w.task_id=q.id AND w.ordinal=q.chunks;
 accepted_at:=clock_timestamp();
 page_body:=jsonb_build_object('policy','CENSUS_PAGE_WITNESS_V1','runId',r.id,'taskId',q.id,'ordinal',q.chunks+1,'previousDigest',previous_digest,
  'pageId',q.page_id,'formId',q.form_id,'kind',q.kind,'scopeDigest',encode(sha256(convert_to(r.scope::text,'UTF8')),'hex'),
  'since',r.since_at,'recoveryUntil',r.until_at,'measurementUntil',r.measurement_until_at,'graphVersion',p_chunk->>'graphVersion',
  'leaseStartedAt',q.lease_started_at,'acceptedAt',accepted_at,
  'inputCursorDigest',CASE WHEN q.cursor_after IS NULL THEN NULL ELSE encode(sha256(convert_to(q.cursor_after,'UTF8')),'hex') END,
  'outputCursorDigest',CASE WHEN nxt IS NULL THEN NULL ELSE encode(sha256(convert_to(nxt,'UTF8')),'hex') END,'terminal',nxt IS NULL,'rows',canonical_rows);
 INSERT INTO marketing_measurement.census_pages(run_id,task_id,ordinal,page_id,form_id,kind,graph_version,rows,body,page_digest,recorded_at)
 VALUES(r.id,q.id,q.chunks+1,q.page_id,q.form_id,q.kind,p_chunk->>'graphVersion',canonical_rows,page_body,encode(sha256(convert_to(page_body::text,'UTF8')),'hex'),accepted_at);
 -- Receipt/Page/trigger locks can wait after the first check. Expiration must
 -- roll back receipt enqueue and item evidence together, not advance a cursor.
 IF q.lease_until<=clock_timestamp() OR r.scope IS DISTINCT FROM public.marketing_fb_census_scope(r.company_id,r.trial_id) THEN RAISE EXCEPTION 'lease or scope changed during commit' USING ERRCODE='40001';END IF;
 UPDATE public.marketing_fb_census_tasks SET state=CASE WHEN nxt IS NULL THEN 'DONE' ELSE 'PENDING' END,cursor_after=nxt,cursors=CASE WHEN nxt IS NULL THEN cursors ELSE cursors||to_jsonb(nxt) END,chunks=chunks+1,lease_token=NULL,lease_until=NULL WHERE id=p_task;
 IF NOT EXISTS(SELECT 1 FROM public.marketing_fb_census_tasks WHERE run_id=r.id AND state<>'DONE') THEN UPDATE public.marketing_fb_census_runs SET state='SCANNED',finished_at=clock_timestamp() WHERE id=r.id;END IF;
 RETURN jsonb_build_object('status','RECORDED','next',nxt IS NOT NULL);
END $$;
CREATE OR REPLACE FUNCTION marketing_measurement.census_witness(p_run uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 WITH run AS(SELECT * FROM public.marketing_fb_census_runs WHERE id=p_run),
 pages AS(SELECT w.*,lag(w.page_digest) OVER seq AS previous_digest,lag(w.body->>'outputCursorDigest') OVER seq AS previous_cursor
  FROM marketing_measurement.census_pages w WHERE run_id=p_run WINDOW seq AS(PARTITION BY w.task_id ORDER BY w.ordinal)),
 tasks AS(SELECT q.*,count(w.task_id) AS witnessed,
   coalesce(bool_and(w.ordinal BETWEEN 1 AND q.chunks
    AND(CASE WHEN w.ordinal=1 THEN w.body->>'inputCursorDigest' IS NULL AND w.body->>'previousDigest' IS NULL
      ELSE w.previous_digest IS NOT NULL AND w.previous_cursor IS NOT NULL AND w.body->>'previousDigest'=w.previous_digest AND w.body->>'inputCursorDigest'=w.previous_cursor END)
    AND(w.body->>'terminal')::boolean=(w.ordinal=q.chunks AND q.state='DONE')
    AND((w.body->>'terminal')::boolean=(w.body->>'outputCursorDigest' IS NULL))),false) AS ordinal_valid,
   coalesce(bool_or(w.ordinal=q.chunks AND w.body->>'terminal'='true'),false) AS terminal
  FROM public.marketing_fb_census_tasks q LEFT JOIN pages w ON w.task_id=q.id WHERE q.run_id=p_run GROUP BY q.id),
 ids AS(SELECT DISTINCT w.page_id,w.form_id,item.value->>'id' AS id FROM pages w CROSS JOIN LATERAL jsonb_array_elements(w.rows) AS item(value) WHERE w.kind='LEADS'),
 stats AS(SELECT count(*)::integer AS page_count,count(DISTINCT graph_version)::integer AS version_count,min(graph_version) AS graph_version,
  coalesce(sum(jsonb_array_length(rows)) FILTER(WHERE kind='LEADS'),0)::integer AS lead_rows,
  min((body->>'leaseStartedAt')::timestamptz) AS lease_start,max(recorded_at) AS accepted_at,
  encode(sha256(convert_to(coalesce(jsonb_agg(page_digest ORDER BY task_id,ordinal),'[]'::jsonb)::text,'UTF8')),'hex') AS digest FROM pages),
 task_stats AS(SELECT count(*)::integer AS total,count(*) FILTER(WHERE state='DONE' AND cursor_after IS NULL AND chunks>0 AND witnessed=chunks AND ordinal_valid AND terminal)::integer AS terminal_count FROM tasks)
 SELECT jsonb_build_object('policy','CENSUS_PAGE_WITNESS_V1',
  'status',CASE WHEN s.page_count=0 THEN 'MISSING' WHEN r.scope IS DISTINCT FROM public.marketing_fb_census_scope(r.company_id,r.trial_id) THEN 'STALE_SCOPE'
   WHEN r.state='FAILED' THEN 'FAILED' WHEN r.state='SCANNED' AND ts.total>0 AND ts.terminal_count=ts.total AND s.version_count=1 THEN 'TRAVERSED' ELSE 'PARTIAL' END,
  'pages',s.page_count,'tasks',ts.total,'terminalTasks',ts.terminal_count,'graphVersion',s.graph_version,'leaseStartedAt',s.lease_start,'lastAcceptedAt',s.accepted_at,
  'since',r.since_at,'recoveryUntil',r.until_at,'measurementUntil',r.measurement_until_at,
  'scopeDigest',encode(sha256(convert_to(r.scope::text,'UTF8')),'hex'),'pagesDigest',s.digest,
  'leadRows',s.lead_rows,'uniqueLeadIds',(SELECT count(*)::integer FROM ids),'repeatedLeadRows',s.lead_rows-(SELECT count(*)::integer FROM ids),
  'leadIdsDigest',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_array(page_id,form_id,id) ORDER BY page_id,form_id,id),'[]'::jsonb)::text,'UTF8')),'hex') FROM ids),
  'providerCoverage','UNVERIFIED','cpqlReady',false) FROM run r CROSS JOIN stats s CROSS JOIN task_stats ts
$$;
CREATE OR REPLACE FUNCTION public.marketing_fb_census_status(p_actor uuid,p_company uuid,p_trial uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service required' USING ERRCODE='42501';END IF;
 PERFORM public.marketing_fb_intake_admin(p_actor,p_company);
 IF NOT marketing_measurement.source_actor_current(p_actor,p_company) THEN RAISE EXCEPTION 'current authority required' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.marketing_lead_trials WHERE id=p_trial AND company_id=p_company) THEN RAISE EXCEPTION 'trial denied' USING ERRCODE='42501';END IF;
 WITH latest AS(SELECT * FROM public.marketing_fb_census_runs WHERE company_id=p_company AND trial_id=p_trial ORDER BY started_at DESC,id DESC LIMIT 1)
 SELECT jsonb_build_object('id',r.id,'state',r.state,'since',r.since_at,'until',r.until_at,'startedAt',r.started_at,'finishedAt',r.finished_at,'failureCode',r.failure_code,
  'scopeCurrent',r.scope=public.marketing_fb_census_scope(p_company,p_trial),
  'forms',(SELECT count(*) FROM public.marketing_fb_census_forms WHERE run_id=r.id),
  'undiscoveredKnownForms',(SELECT count(*) FROM public.marketing_fb_census_forms WHERE run_id=r.id AND NOT discovered),
  'expiredForms',(SELECT count(*) FROM public.marketing_fb_census_forms WHERE run_id=r.id AND expired_leads>0),
  'enumerated',(SELECT count(*) FROM public.marketing_fb_census_items WHERE run_id=r.id),
  'awaitingIntake',(SELECT count(*) FROM public.marketing_fb_census_items i LEFT JOIN public.marketing_fb_lead_receipts x ON x.id=i.receipt_id WHERE i.run_id=r.id AND(x.state IS DISTINCT FROM 'DONE' OR x.company_id IS DISTINCT FROM p_company OR x.form_id IS DISTINCT FROM i.form_id)),
  'tasksPending',(SELECT count(*) FROM public.marketing_fb_census_tasks WHERE run_id=r.id AND state<>'DONE'),
  'witness',marketing_measurement.census_witness(r.id),'coverage','API_ENUMERATION_ONLY','cpqlReady',false) INTO result FROM latest r;
 RETURN jsonb_build_object('companyId',p_company,'trialId',p_trial,'run',result,'allowBudgetExecution',false);
END $$;
REVOKE ALL ON FUNCTION marketing_measurement.census_witness(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.marketing_fb_census_claim(text[],uuid),public.marketing_fb_census_commit(uuid,uuid,jsonb),public.marketing_fb_census_status(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_fb_census_claim(text[],uuid),public.marketing_fb_census_commit(uuid,uuid,jsonb),public.marketing_fb_census_status(uuid,uuid,uuid) TO service_role;
COMMIT;
