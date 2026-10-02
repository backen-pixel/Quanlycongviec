-- Durable provider enumeration, not a completeness attestation or budget grant.
BEGIN;
CREATE TABLE IF NOT EXISTS public.marketing_fb_census_runs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,trial_id uuid NOT NULL,trial_revision integer NOT NULL,
 actor_id uuid NOT NULL,request_id uuid NOT NULL,scope jsonb NOT NULL,since_at timestamptz NOT NULL,until_at timestamptz NOT NULL,
 state text NOT NULL DEFAULT 'RUNNING' CHECK(state IN('RUNNING','SCANNED','FAILED')),
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(),finished_at timestamptz,failure_code text,
 UNIQUE(company_id,request_id),CHECK(until_at>since_at));
CREATE TABLE IF NOT EXISTS public.marketing_fb_census_tasks(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),run_id uuid NOT NULL REFERENCES public.marketing_fb_census_runs(id),
 page_id text NOT NULL,form_id text NOT NULL DEFAULT '',kind text NOT NULL CHECK(kind IN('FORMS','LEADS')),
 state text NOT NULL DEFAULT 'PENDING' CHECK(state IN('PENDING','LEASED','DONE','FAILED')),
 cursor_after text,cursors jsonb NOT NULL DEFAULT '[]',chunks integer NOT NULL DEFAULT 0,
 lease_token uuid,lease_until timestamptz,attempts integer NOT NULL DEFAULT 0,failure_code text,
 UNIQUE(run_id,page_id,form_id,kind));
CREATE TABLE IF NOT EXISTS public.marketing_fb_census_forms(
 run_id uuid NOT NULL REFERENCES public.marketing_fb_census_runs(id),page_id text NOT NULL,form_id text NOT NULL,
 status text,expired_leads integer,discovered boolean NOT NULL DEFAULT false,PRIMARY KEY(run_id,page_id,form_id));
CREATE TABLE IF NOT EXISTS public.marketing_fb_census_items(
 run_id uuid NOT NULL REFERENCES public.marketing_fb_census_runs(id),page_id text NOT NULL,form_id text NOT NULL,
 leadgen_id text NOT NULL,acquired_at timestamptz NOT NULL,receipt_id uuid NOT NULL,
 PRIMARY KEY(run_id,page_id,leadgen_id));
CREATE INDEX IF NOT EXISTS marketing_fb_census_pending ON public.marketing_fb_census_tasks(state,lease_until) WHERE state IN('PENDING','LEASED');
ALTER TABLE public.marketing_fb_census_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_fb_census_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_fb_census_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_fb_census_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketing_fb_census_runs,public.marketing_fb_census_tasks,public.marketing_fb_census_forms,public.marketing_fb_census_items FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.marketing_fb_census_scope(p_company uuid,p_trial uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('trial',(SELECT to_jsonb(t) FROM public.marketing_lead_trials t WHERE t.id=p_trial AND t.company_id=p_company),
  'pages',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.page_id,'active',p.is_active,'tokenVersion',md5(coalesce(p.access_token,''))) ORDER BY p.page_id) FROM public.facebook_pages p WHERE p.default_company_id=p_company),'[]'::jsonb),
  'bindings',coalesce((SELECT jsonb_agg(jsonb_build_object('pageId',b.page_id,'formId',b.form_id,'revision',b.revision,'company',b.company_id) ORDER BY b.page_id,b.form_id) FROM public.marketing_fb_lead_bindings b WHERE b.company_id=p_company),'[]'::jsonb))
$$;
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
 end_at:=least((t.until+1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh',clock_timestamp());
 IF end_at<=t.since::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh' THEN RAISE EXCEPTION 'trial not started' USING ERRCODE='22023';END IF;
 INSERT INTO public.marketing_fb_census_runs(company_id,trial_id,trial_revision,actor_id,request_id,scope,since_at,until_at)
 VALUES(p_company,p_trial,t.revision,p_actor,p_request,s,t.since::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh',end_at) RETURNING * INTO r;
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

CREATE OR REPLACE FUNCTION public.marketing_fb_census_claim(p_pages text[],p_token uuid)
RETURNS SETOF public.marketing_fb_census_tasks LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF p_token IS NULL OR coalesce(cardinality(p_pages),0) NOT BETWEEN 1 AND 100 OR EXISTS(SELECT 1 FROM unnest(p_pages)x WHERE (x~'^[0-9]{1,32}$') IS NOT TRUE) THEN RAISE EXCEPTION 'invalid claim' USING ERRCODE='22023';END IF;
 RETURN QUERY WITH pick AS(SELECT q.id FROM public.marketing_fb_census_tasks q JOIN public.marketing_fb_census_runs r ON r.id=q.run_id
  WHERE r.state='RUNNING' AND q.page_id=ANY(p_pages) AND(q.state='PENDING' OR(q.state='LEASED' AND q.lease_until<=clock_timestamp()))
  ORDER BY r.started_at,q.kind,q.id LIMIT 1 FOR UPDATE OF q SKIP LOCKED)
 UPDATE public.marketing_fb_census_tasks q SET state='LEASED',lease_token=p_token,lease_until=clock_timestamp()+interval '60 seconds',attempts=attempts+1 FROM pick WHERE q.id=pick.id RETURNING q.*;
END $$;
CREATE OR REPLACE FUNCTION public.marketing_fb_census_context(p_task uuid,p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE q public.marketing_fb_census_tasks%ROWTYPE;r public.marketing_fb_census_runs%ROWTYPE;p public.facebook_pages%ROWTYPE;
BEGIN
 SELECT * INTO q FROM public.marketing_fb_census_tasks WHERE id=p_task;
 IF NOT FOUND OR q.state<>'LEASED' OR q.lease_token IS DISTINCT FROM p_token OR q.lease_until<=clock_timestamp() THEN RAISE EXCEPTION 'lease lost' USING ERRCODE='40001';END IF;
 SELECT * INTO r FROM public.marketing_fb_census_runs WHERE id=q.run_id;
 IF r.state<>'RUNNING' THEN RAISE EXCEPTION 'run closed' USING ERRCODE='40001';END IF;
 PERFORM public.marketing_fb_intake_admin(r.actor_id,r.company_id);
 SELECT * INTO p FROM public.facebook_pages WHERE page_id=q.page_id FOR SHARE;
 IF NOT FOUND OR p.default_company_id IS DISTINCT FROM r.company_id OR p.is_active IS DISTINCT FROM true OR coalesce(p.access_token,'')='' THEN RAISE EXCEPTION 'page revoked' USING ERRCODE='42501';END IF;
 IF r.scope IS DISTINCT FROM public.marketing_fb_census_scope(r.company_id,r.trial_id) THEN RAISE EXCEPTION 'scope changed' USING ERRCODE='40001';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.marketing_fb_census_tasks WHERE id=p_task AND state='LEASED' AND lease_token=p_token AND lease_until>clock_timestamp()) THEN RAISE EXCEPTION 'lease expired during context read' USING ERRCODE='40001';END IF;
 RETURN jsonb_build_object('pageId',q.page_id,'formId',q.form_id,'kind',q.kind,'after',q.cursor_after,'pageToken',p.access_token,'since',r.since_at,'until',r.until_at);
END $$;

CREATE OR REPLACE FUNCTION public.marketing_fb_census_commit(p_task uuid,p_token uuid,p_chunk jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE q public.marketing_fb_census_tasks%ROWTYPE;r public.marketing_fb_census_runs%ROWTYPE;x jsonb;nxt text;stamp timestamptz;receipt public.marketing_fb_lead_receipts%ROWTYPE;prior public.marketing_fb_census_items%ROWTYPE;
BEGIN
 -- Run lock precedes task lock for every writer. A claim never waits on run locks.
 SELECT r0.* INTO r FROM public.marketing_fb_census_runs r0 JOIN public.marketing_fb_census_tasks q0 ON q0.run_id=r0.id WHERE q0.id=p_task FOR UPDATE OF r0;
 SELECT * INTO q FROM public.marketing_fb_census_tasks WHERE id=p_task FOR UPDATE;
 PERFORM public.marketing_fb_census_context(p_task,p_token);
 IF jsonb_typeof(p_chunk) IS DISTINCT FROM 'object' OR jsonb_typeof(p_chunk->'rows') IS DISTINCT FROM 'array' OR jsonb_array_length(p_chunk->'rows')>100 OR (p_chunk->>'graphVersion'~'^v[0-9]{2,3}\.0$') IS NOT TRUE OR NOT(p_chunk?'next') THEN RAISE EXCEPTION 'invalid census chunk' USING ERRCODE='22023';END IF;
 nxt:=p_chunk->>'next';
 IF nxt IS NOT NULL AND(length(nxt) NOT BETWEEN 1 AND 2048 OR nxt~'[\r\n]' OR nxt IS NOT DISTINCT FROM q.cursor_after OR q.cursors ? nxt) THEN RAISE EXCEPTION 'cursor loop' USING ERRCODE='22023';END IF;
 IF q.chunks>=1000 OR (SELECT count(*) FROM public.marketing_fb_census_items WHERE run_id=r.id)+jsonb_array_length(p_chunk->'rows')>50000 OR (SELECT count(*) FROM public.marketing_fb_census_forms WHERE run_id=r.id)+jsonb_array_length(p_chunk->'rows')>5000 THEN RAISE EXCEPTION 'census capacity exceeded' USING ERRCODE='54000';END IF;
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
   IF stamp IS NULL OR NOT isfinite(stamp) THEN RAISE EXCEPTION 'invalid acquisition time' USING ERRCODE='22023';END IF;
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

CREATE OR REPLACE FUNCTION public.marketing_fb_census_fail(p_task uuid,p_token uuid,p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE q public.marketing_fb_census_tasks%ROWTYPE;
BEGIN
 PERFORM 1 FROM public.marketing_fb_census_runs r JOIN public.marketing_fb_census_tasks t ON t.run_id=r.id WHERE t.id=p_task FOR UPDATE OF r;
 SELECT * INTO q FROM public.marketing_fb_census_tasks WHERE id=p_task FOR UPDATE;
 IF NOT FOUND OR q.state<>'LEASED' OR q.lease_token IS DISTINCT FROM p_token OR q.lease_until<=clock_timestamp() THEN RAISE EXCEPTION 'lease lost' USING ERRCODE='40001';END IF;
 IF p_code NOT IN('CENSUS_CONFIG','CENSUS_PROVIDER_UNAVAILABLE','CENSUS_PAGING_INVALID','CENSUS_PAGING_LOOP','CENSUS_ROW_INVALID','CENSUS_SCOPE_MISMATCH','CENSUS_STORAGE_UNAVAILABLE') OR p_code IS NULL THEN RAISE EXCEPTION 'invalid error code' USING ERRCODE='22023';END IF;
 UPDATE public.marketing_fb_census_tasks SET state='FAILED',failure_code=p_code,lease_token=NULL,lease_until=NULL WHERE id=p_task;
 UPDATE public.marketing_fb_census_runs SET state='FAILED',failure_code=p_code,finished_at=clock_timestamp() WHERE id=q.run_id;
 RETURN jsonb_build_object('status','FAILED');
END $$;

CREATE OR REPLACE FUNCTION public.marketing_fb_census_status(p_actor uuid,p_company uuid,p_trial uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
 PERFORM public.marketing_fb_intake_admin(p_actor,p_company);
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
  'coverage','API_ENUMERATION_ONLY','cpqlReady',false) INTO result FROM latest r;
 RETURN jsonb_build_object('companyId',p_company,'trialId',p_trial,'run',result,'allowBudgetExecution',false);
END $$;
REVOKE ALL ON FUNCTION public.marketing_fb_census_scope(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.marketing_fb_census_start(uuid,uuid,uuid,uuid,text[]),public.marketing_fb_census_claim(text[],uuid),public.marketing_fb_census_context(uuid,uuid),public.marketing_fb_census_commit(uuid,uuid,jsonb),public.marketing_fb_census_fail(uuid,uuid,text),public.marketing_fb_census_status(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_fb_census_start(uuid,uuid,uuid,uuid,text[]),public.marketing_fb_census_claim(text[],uuid),public.marketing_fb_census_context(uuid,uuid),public.marketing_fb_census_commit(uuid,uuid,jsonb),public.marketing_fb_census_fail(uuid,uuid,text),public.marketing_fb_census_status(uuid,uuid,uuid) TO service_role;
COMMIT;
