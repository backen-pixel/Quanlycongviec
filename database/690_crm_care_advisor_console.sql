-- Advisor request discovery and cancellation before/after BEGIN acknowledgement.
-- No provider configuration, runtime identity or outbound grant.
BEGIN;
CREATE TABLE IF NOT EXISTS crm_care_control.advisor_cancellations(
 request_id uuid PRIMARY KEY,company_id uuid NOT NULL,actor_id uuid NOT NULL,thread_id uuid NOT NULL,
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 20 AND 2000),
 outcome text NOT NULL CHECK(outcome IN('ABSENT_CANCELLED','CLOSED','ALREADY_TERMINAL')),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE crm_care_control.advisor_cancellations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON crm_care_control.advisor_cancellations FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.crm_care_advisor_list(p_actor uuid,p_company uuid,p_thread uuid,p_after uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE care jsonb;items jsonb;cursor_time timestamptz;more boolean;
BEGIN
 PERFORM crm_care_control.advisor_authorize(p_actor,p_company);
 care:=public.crm_care_read(p_actor,p_company,p_thread);
 IF p_after IS NOT NULL THEN
  SELECT created_at INTO cursor_time FROM crm_care_control.advisor_runs
   WHERE request_id=p_after AND actor_id=p_actor AND company_id=p_company AND thread_id=p_thread;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid advisor cursor' USING ERRCODE='42501';END IF;
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('requestId',x.request_id,'state',x.state,'attempt',x.attempt,
  'retryOf',x.retry_of,'createdAt',x.created_at,'needsReconciliation',x.state='RUNNING' AND x.expires_at<=clock_timestamp())
  ORDER BY x.created_at DESC,x.request_id DESC),'[]'::jsonb) INTO items FROM(
   SELECT * FROM crm_care_control.advisor_runs WHERE actor_id=p_actor AND company_id=p_company AND thread_id=p_thread
    AND(p_after IS NULL OR(created_at,request_id)<(cursor_time,p_after)) ORDER BY created_at DESC,request_id DESC LIMIT 21)x;
 more:=jsonb_array_length(items)>20;IF more THEN items:=items-20;END IF;
 RETURN jsonb_build_object('companyId',p_company,'threadId',p_thread,'version',care->'version','careMode',care->'mode',
  'routingReady',care->'target'->'routingReady','historyTruncated',care->'historyTruncated',
  'threadBusy',EXISTS(SELECT 1 FROM crm_care_control.advisor_runs WHERE company_id=p_company AND thread_id=p_thread AND state='RUNNING'),
  'items',items,'nextAfter',CASE WHEN more THEN items->19->'requestId' ELSE 'null'::jsonb END,'send',false,'aiMaySend',false);
END $$;

CREATE OR REPLACE FUNCTION public.crm_care_advisor_cancel(p_actor uuid,p_company uuid,p_request uuid,p_thread uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE old crm_care_control.advisor_cancellations%ROWTYPE;r crm_care_control.advisor_runs%ROWTYPE;v_outcome text;
BEGIN
 PERFORM crm_care_control.advisor_authorize(p_actor,p_company);
 IF p_request IS NULL OR p_thread IS NULL OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 20 AND 2000 THEN
  RAISE EXCEPTION 'invalid cancellation' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('care-advisor:'||p_request::text,0));
 SELECT * INTO old FROM crm_care_control.advisor_cancellations WHERE request_id=p_request FOR UPDATE;
 IF FOUND THEN
  IF old.actor_id IS DISTINCT FROM p_actor OR old.company_id IS DISTINCT FROM p_company OR old.thread_id IS DISTINCT FROM p_thread
   OR old.reason IS DISTINCT FROM p_reason THEN RAISE EXCEPTION 'cancellation reused' USING ERRCODE='23505';END IF;
  PERFORM public.crm_care_read(p_actor,p_company,p_thread);
  RETURN jsonb_build_object('companyId',p_company,'threadId',p_thread,'requestId',p_request,
   'outcome',old.outcome,'replayed',true,'send',false);
 END IF;
 -- Same run->thread lock order as FINISH/CLOSE. A result already committed is
 -- preserved; cancellation is never reported as proof that inference did not run.
 SELECT * INTO r FROM crm_care_control.advisor_runs WHERE request_id=p_request FOR UPDATE;
 IF FOUND AND(r.actor_id IS DISTINCT FROM p_actor OR r.company_id IS DISTINCT FROM p_company OR r.thread_id IS DISTINCT FROM p_thread) THEN
  RAISE EXCEPTION 'request scope denied' USING ERRCODE='42501';END IF;
 PERFORM public.crm_care_read(p_actor,p_company,p_thread);
 IF r.request_id IS NULL THEN v_outcome:='ABSENT_CANCELLED';
 ELSIF r.state='RUNNING' THEN
  PERFORM public.crm_care_advisor_close(p_actor,p_company,p_request,p_reason);
  v_outcome:='CLOSED';
 ELSE v_outcome:='ALREADY_TERMINAL';END IF;
 INSERT INTO crm_care_control.advisor_cancellations(request_id,company_id,actor_id,thread_id,reason,outcome)
 VALUES(p_request,p_company,p_actor,p_thread,p_reason,v_outcome);
 RETURN jsonb_build_object('companyId',p_company,'threadId',p_thread,'requestId',p_request,
  'outcome',v_outcome,'replayed',false,'send',false);
END $$;

DO $$ BEGIN
 IF to_regprocedure('crm_care_control.advisor_begin_before_console(uuid,uuid,uuid,uuid,text)') IS NULL THEN
  ALTER FUNCTION public.crm_care_advisor_begin(uuid,uuid,uuid,uuid,text) SET SCHEMA crm_care_control;
  ALTER FUNCTION crm_care_control.crm_care_advisor_begin(uuid,uuid,uuid,uuid,text) RENAME TO advisor_begin_before_console;
 END IF;
 IF to_regprocedure('crm_care_control.advisor_retry_before_console(uuid,uuid,uuid,uuid,text,text)') IS NULL THEN
  ALTER FUNCTION public.crm_care_advisor_retry(uuid,uuid,uuid,uuid,text,text) SET SCHEMA crm_care_control;
  ALTER FUNCTION crm_care_control.crm_care_advisor_retry(uuid,uuid,uuid,uuid,text,text) RENAME TO advisor_retry_before_console;
 END IF;
END $$;
REVOKE ALL ON FUNCTION crm_care_control.advisor_begin_before_console(uuid,uuid,uuid,uuid,text),crm_care_control.advisor_retry_before_console(uuid,uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.crm_care_advisor_begin(p_actor uuid,p_company uuid,p_request uuid,p_thread uuid,p_version text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM crm_care_control.advisor_authorize(p_actor,p_company);
 IF p_request IS NULL THEN RAISE EXCEPTION 'request required' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('care-advisor:'||p_request::text,0));
 IF EXISTS(SELECT 1 FROM crm_care_control.advisor_cancellations WHERE request_id=p_request) THEN
  RAISE EXCEPTION 'request cancelled; read historical outcome' USING ERRCODE='40001';END IF;
 RETURN crm_care_control.advisor_begin_before_console(p_actor,p_company,p_request,p_thread,p_version);
END $$;
CREATE OR REPLACE FUNCTION public.crm_care_advisor_retry(p_actor uuid,p_company uuid,p_request uuid,p_previous uuid,p_version text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM crm_care_control.advisor_authorize(p_actor,p_company);
 IF p_request IS NULL THEN RAISE EXCEPTION 'request required' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('care-advisor:'||p_request::text,0));
 IF EXISTS(SELECT 1 FROM crm_care_control.advisor_cancellations WHERE request_id=p_request) THEN
  RAISE EXCEPTION 'retry cancelled; read historical outcome' USING ERRCODE='40001';END IF;
 RETURN crm_care_control.advisor_retry_before_console(p_actor,p_company,p_request,p_previous,p_version,p_reason);
END $$;
REVOKE ALL ON FUNCTION public.crm_care_advisor_list(uuid,uuid,uuid,uuid),public.crm_care_advisor_cancel(uuid,uuid,uuid,uuid,text),public.crm_care_advisor_begin(uuid,uuid,uuid,uuid,text),public.crm_care_advisor_retry(uuid,uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.crm_care_advisor_list(uuid,uuid,uuid,uuid),public.crm_care_advisor_cancel(uuid,uuid,uuid,uuid,text),public.crm_care_advisor_begin(uuid,uuid,uuid,uuid,text),public.crm_care_advisor_retry(uuid,uuid,uuid,uuid,text,text) TO service_role;
COMMIT;
