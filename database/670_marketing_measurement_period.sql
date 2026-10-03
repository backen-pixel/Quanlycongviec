-- Align spend and acquisition to completed Vietnam calendar days. Additive:
-- historical runs remain unchanged and cannot silently certify a closed period.
BEGIN;
CREATE SCHEMA IF NOT EXISTS marketing_measurement;
REVOKE ALL ON SCHEMA marketing_measurement FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public.marketing_fb_census_runs ADD COLUMN IF NOT EXISTS measurement_policy text;
ALTER TABLE public.marketing_fb_census_runs ADD COLUMN IF NOT EXISTS measurement_until_at timestamptz;
CREATE TABLE IF NOT EXISTS marketing_measurement.census_observations(
 run_id uuid NOT NULL REFERENCES public.marketing_fb_census_runs(id),
 page_id text NOT NULL,form_id text NOT NULL,leadgen_id text NOT NULL,
 acquired_at timestamptz NOT NULL,observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),graph_version text NOT NULL,
 PRIMARY KEY(run_id,page_id,leadgen_id),CHECK(isfinite(acquired_at)),CHECK(isfinite(observed_at)),CHECK(acquired_at<=observed_at),
 CHECK(page_id~'^[0-9]{1,32}$' AND form_id~'^[0-9]{1,32}$' AND leadgen_id~'^[0-9]{1,32}$'),CHECK(graph_version~'^v[0-9]{2,3}\.0$'));
ALTER TABLE marketing_measurement.census_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON marketing_measurement.census_observations FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.marketing_fb_census_start(p_actor uuid,p_company uuid,p_trial uuid,p_request uuid,p_pages text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE t public.marketing_lead_trials%ROWTYPE;r public.marketing_fb_census_runs%ROWTYPE;s jsonb;p public.facebook_pages%ROWTYPE;end_at timestamptz;
BEGIN
 PERFORM public.marketing_fb_intake_admin(p_actor,p_company);
 IF p_request IS NULL OR coalesce(cardinality(p_pages),0) NOT BETWEEN 1 AND 100 OR EXISTS(SELECT 1 FROM unnest(p_pages)x WHERE (x~'^[0-9]{1,32}$') IS NOT TRUE) THEN RAISE EXCEPTION 'invalid census request' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('fb-census:'||p_company::text,0));
 SELECT * INTO t FROM public.marketing_lead_trials WHERE id=p_trial AND company_id=p_company FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'trial denied' USING ERRCODE='42501';END IF;
 SELECT * INTO r FROM public.marketing_fb_census_runs WHERE company_id=p_company AND request_id=p_request;
 IF FOUND THEN
  IF r.actor_id<>p_actor OR r.trial_id<>p_trial THEN RAISE EXCEPTION 'request reused' USING ERRCODE='23505';END IF;
  RETURN jsonb_build_object('id',r.id,'state',r.state,'replayed',true);
 END IF;
 IF EXISTS(SELECT 1 FROM public.marketing_fb_census_runs WHERE company_id=p_company AND trial_id=p_trial AND state='RUNNING') THEN RAISE EXCEPTION 'census already running' USING ERRCODE='40001';END IF;
 FOR p IN SELECT * FROM public.facebook_pages WHERE default_company_id=p_company ORDER BY page_id FOR SHARE LOOP
  IF p.is_active IS DISTINCT FROM true OR coalesce(p.access_token,'')='' OR NOT(p.page_id=ANY(p_pages)) THEN RAISE EXCEPTION 'page not enabled for intake' USING ERRCODE='42501';END IF;
 END LOOP;
 s:=public.marketing_fb_census_scope(p_company,p_trial);
 IF jsonb_array_length(s->'pages') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'page inventory unavailable' USING ERRCODE='22023';END IF;
 -- A Page may have been inserted after the earlier row locks were acquired.
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(s->'pages')x WHERE (x->>'active'='true' AND x->>'tokenVersion'<>md5('') AND (x->>'id')=ANY(p_pages)) IS NOT TRUE) THEN RAISE EXCEPTION 'page inventory not enabled' USING ERRCODE='42501';END IF;
 -- Recovery keeps its original operational boundary, including today's leads.
 -- Measurement alone stops at the most recent completed Vietnam day.
 end_at:=least((t.until+1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh',clock_timestamp());
 IF end_at<=t.since::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh' THEN RAISE EXCEPTION 'trial not started' USING ERRCODE='22023';END IF;
 INSERT INTO public.marketing_fb_census_runs(company_id,trial_id,trial_revision,actor_id,request_id,scope,since_at,until_at,measurement_policy,measurement_until_at)
 VALUES(p_company,p_trial,t.revision,p_actor,p_request,s,t.since::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh',end_at,'VIETNAM_CLOSED_DAY_V1',
  least(end_at,date_trunc('day',end_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh')) RETURNING * INTO r;
 INSERT INTO public.marketing_fb_census_tasks(run_id,page_id,kind) SELECT r.id,x->>'id','FORMS' FROM jsonb_array_elements(s->'pages')x;
 -- Preserve archived/previously observed forms even if omitted from the edge.
 INSERT INTO public.marketing_fb_census_forms(run_id,page_id,form_id)
 SELECT r.id,page_id,form_id FROM(
  SELECT page_id,form_id FROM public.marketing_fb_lead_bindings WHERE company_id=p_company
  UNION SELECT page_id,form_id FROM public.marketing_fb_lead_receipts WHERE company_id=p_company
 )known WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(s->'pages')x WHERE x->>'id'=known.page_id);
 INSERT INTO public.marketing_fb_census_tasks(run_id,page_id,form_id,kind) SELECT run_id,page_id,form_id,'LEADS' FROM public.marketing_fb_census_forms WHERE run_id=r.id;
 RETURN jsonb_build_object('id',r.id,'state',r.state,'replayed',false);
END $$;
CREATE OR REPLACE FUNCTION public.marketing_fb_census_commit(p_task uuid,p_token uuid,p_chunk jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE q public.marketing_fb_census_tasks%ROWTYPE;r public.marketing_fb_census_runs%ROWTYPE;x jsonb;nxt text;stamp timestamptz;receipt public.marketing_fb_lead_receipts%ROWTYPE;prior public.marketing_fb_census_items%ROWTYPE;observation marketing_measurement.census_observations%ROWTYPE;
BEGIN
 -- Run lock precedes task lock for every writer. A claim never waits on run locks.
 SELECT r0.* INTO r FROM public.marketing_fb_census_runs r0 JOIN public.marketing_fb_census_tasks q0 ON q0.run_id=r0.id WHERE q0.id=p_task FOR UPDATE OF r0;
 SELECT * INTO q FROM public.marketing_fb_census_tasks WHERE id=p_task FOR UPDATE;
 PERFORM public.marketing_fb_census_context(p_task,p_token);
 IF jsonb_typeof(p_chunk) IS DISTINCT FROM 'object' OR jsonb_typeof(p_chunk->'rows') IS DISTINCT FROM 'array' OR jsonb_array_length(p_chunk->'rows')>100 OR (p_chunk->>'graphVersion'~'^v[0-9]{2,3}\.0$') IS NOT TRUE OR NOT(p_chunk?'next') THEN RAISE EXCEPTION 'invalid census chunk' USING ERRCODE='22023';END IF;
 nxt:=p_chunk->>'next';
 IF nxt IS NOT NULL AND(length(nxt) NOT BETWEEN 1 AND 2048 OR nxt~'[\r\n]' OR nxt IS NOT DISTINCT FROM q.cursor_after OR q.cursors ? nxt) THEN RAISE EXCEPTION 'cursor loop' USING ERRCODE='22023';END IF;
 IF q.chunks>=1000 OR (q.kind='LEADS' AND (SELECT count(*) FROM marketing_measurement.census_observations WHERE run_id=r.id)+jsonb_array_length(p_chunk->'rows')>50000) OR (q.kind='FORMS' AND (SELECT count(*) FROM public.marketing_fb_census_forms WHERE run_id=r.id)+jsonb_array_length(p_chunk->'rows')>5000) THEN RAISE EXCEPTION 'census capacity exceeded' USING ERRCODE='54000';END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(p_chunk->'rows'))<>(SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(p_chunk->'rows')) THEN RAISE EXCEPTION 'duplicate chunk row' USING ERRCODE='22023';END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(p_chunk->'rows') ORDER BY value->>'id' LOOP
  IF (x->>'id'~'^[0-9]{1,32}$') IS NOT TRUE THEN RAISE EXCEPTION 'invalid provider id' USING ERRCODE='22023';END IF;
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
 -- Receipt/Page/trigger locks can wait after the first check. Expiration must
 -- roll back receipt enqueue and item evidence together, not advance a cursor.
 IF q.lease_until<=clock_timestamp() OR r.scope IS DISTINCT FROM public.marketing_fb_census_scope(r.company_id,r.trial_id) THEN RAISE EXCEPTION 'lease or scope changed during commit' USING ERRCODE='40001';END IF;
 UPDATE public.marketing_fb_census_tasks SET state=CASE WHEN nxt IS NULL THEN 'DONE' ELSE 'PENDING' END,cursor_after=nxt,cursors=CASE WHEN nxt IS NULL THEN cursors ELSE cursors||to_jsonb(nxt) END,chunks=chunks+1,lease_token=NULL,lease_until=NULL WHERE id=p_task;
 IF NOT EXISTS(SELECT 1 FROM public.marketing_fb_census_tasks WHERE run_id=r.id AND state<>'DONE') THEN UPDATE public.marketing_fb_census_runs SET state='SCANNED',finished_at=clock_timestamp() WHERE id=r.id;END IF;
 RETURN jsonb_build_object('status','RECORDED','next',nxt IS NOT NULL);
END $$;
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
   'measurementPolicy',r.measurement_policy,'scopeCurrent',r.scope=public.marketing_fb_census_scope(p_company,p_trial),'tasksPending',(SELECT count(*) FROM public.marketing_fb_census_tasks WHERE run_id=r.id AND state<>'DONE')),
  'items',coalesce((SELECT jsonb_agg(jsonb_build_object('pageId',page_id,'formId',form_id,'leadgenId',leadgen_id,'acquiredAt',acquired_at,'receiptId',receipt_id) ORDER BY page_id,leadgen_id) FROM items),'[]'::jsonb),
  'observations',coalesce((SELECT jsonb_agg(jsonb_build_object('pageId',page_id,'formId',form_id,'leadgenId',leadgen_id,'acquiredAt',acquired_at,'observedAt',observed_at,'graphVersion',graph_version) ORDER BY page_id,leadgen_id) FROM observations),'[]'::jsonb),
  'forms',coalesce((SELECT jsonb_agg(jsonb_build_object('pageId',page_id,'formId',form_id,'discovered',discovered,'expiredLeads',expired_leads) ORDER BY page_id,form_id) FROM forms),'[]'::jsonb)) FROM latest r),jsonb_build_object('status','MISSING'))
$$;
REVOKE ALL ON FUNCTION public.marketing_trial_census_inventory(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;


REVOKE ALL ON FUNCTION public.marketing_fb_census_start(uuid,uuid,uuid,uuid,text[]),public.marketing_fb_census_commit(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_fb_census_start(uuid,uuid,uuid,uuid,text[]),public.marketing_fb_census_commit(uuid,uuid,jsonb) TO service_role;
COMMIT;
