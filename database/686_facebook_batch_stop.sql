-- Stop intent is durable even if BEGIN has not arrived. Never release UNKNOWN.
BEGIN;
CREATE TABLE IF NOT EXISTS crm_batch_control.stops(
 request_id uuid PRIMARY KEY REFERENCES crm_batch_control.runs(request_id),
 actor_id uuid NOT NULL,company_id uuid NOT NULL,contact_ids uuid[] NOT NULL,
 before_run jsonb,after_run jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE crm_batch_control.stops ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON crm_batch_control.stops FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.crm_facebook_batch_stop(p_actor uuid,p_company uuid,p_request uuid,p_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='3s' AS $$
DECLARE r crm_batch_control.runs%ROWTYPE;before_run jsonb;after_run jsonb;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'server required' USING ERRCODE='42501';END IF;
 IF p_request IS NULL OR p_actor IS NULL OR p_company IS NULL OR coalesce(cardinality(p_ids),0) NOT BETWEEN 1 AND 500
  OR array_ndims(p_ids) IS DISTINCT FROM 1 OR array_position(p_ids,NULL) IS NOT NULL
  OR cardinality(p_ids)<>(SELECT count(DISTINCT x) FROM unnest(p_ids)x) THEN RAISE EXCEPTION 'invalid batch stop' USING ERRCODE='22023';END IF;
 PERFORM crm_batch_control.authorize(p_actor,p_company,p_ids);
 -- Same request lock as BEGIN: cancellation wins even against a delayed BEGIN.
 PERFORM pg_advisory_xact_lock(hashtextextended('fb-batch-request:'||p_request::text,0));
 SELECT * INTO r FROM crm_batch_control.runs WHERE request_id=p_request FOR UPDATE;
 IF FOUND THEN
  IF r.actor_id<>p_actor OR r.company_id<>p_company OR r.contact_ids<>p_ids THEN RAISE EXCEPTION 'batch stop request reused' USING ERRCODE='23505';END IF;
  PERFORM crm_batch_control.authorize_history(p_request);
  IF EXISTS(SELECT 1 FROM crm_batch_control.stops WHERE request_id=p_request) THEN RETURN crm_batch_control.view_run(p_request);END IF;
  before_run:=crm_batch_control.view_run(p_request);
  -- START/CHECK/RESULT and this RPC serialize on the run row. An HTTP write
  -- already dispatched is not cancelled by a database state change.
  UPDATE crm_batch_control.items SET state='UNKNOWN',result=NULL WHERE request_id=p_request AND state='RUNNING';
  UPDATE crm_batch_control.items SET state='CANCELLED' WHERE request_id=p_request AND state='PENDING';
  UPDATE crm_batch_control.runs SET token_hash=md5(gen_random_uuid()::text),
   state=CASE WHEN EXISTS(SELECT 1 FROM crm_batch_control.items WHERE request_id=p_request AND state IN('UNKNOWN','CANCELLED')) THEN 'REVIEW' ELSE 'COMPLETED' END,
   updated_at=clock_timestamp() WHERE request_id=p_request;
 ELSE
  -- Tombstone records the exact cancelled selection; no contact claim is taken.
  INSERT INTO crm_batch_control.runs VALUES(p_request,p_actor,p_company,p_ids,md5(gen_random_uuid()::text),'REVIEW',clock_timestamp(),clock_timestamp());
  INSERT INTO crm_batch_control.items(request_id,contact_id,ordinal,state) SELECT p_request,x,n,'CANCELLED' FROM unnest(p_ids) WITH ORDINALITY a(x,n);
 END IF;
 after_run:=crm_batch_control.view_run(p_request);
 INSERT INTO crm_batch_control.stops(request_id,actor_id,company_id,contact_ids,before_run,after_run) VALUES(p_request,p_actor,p_company,p_ids,before_run,after_run);
 RETURN after_run;
END $$;
REVOKE ALL ON FUNCTION public.crm_facebook_batch_stop(uuid,uuid,uuid,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_facebook_batch_stop(uuid,uuid,uuid,uuid[]) TO service_role;
COMMIT;
