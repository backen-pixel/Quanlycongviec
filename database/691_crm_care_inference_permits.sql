-- Explicit, private enrollment for one bounded OpenAI draft allowance.
-- Empty on installation. No key, provider access or runtime identity is granted.
BEGIN;
CREATE TABLE IF NOT EXISTS crm_care_control.inference_policies(
 id uuid PRIMARY KEY,company_id uuid NOT NULL,actor_id uuid NOT NULL,
 provider text NOT NULL CHECK(provider='OPENAI_RESPONSES'),
 model text NOT NULL CHECK(model~'^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$'),
 credential_sha256 text NOT NULL CHECK(credential_sha256~'^[a-f0-9]{64}$'),
 approval_reference text NOT NULL CHECK(length(btrim(approval_reference)) BETWEEN 20 AND 2000),
 starts_at timestamptz NOT NULL,expires_at timestamptz NOT NULL CHECK(expires_at>starts_at),
 active boolean NOT NULL DEFAULT false,
 max_calls integer NOT NULL CHECK(max_calls BETWEEN 1 AND 100000),
 max_input_bytes integer NOT NULL CHECK(max_input_bytes BETWEEN 1000 AND 150000),
 max_output_tokens integer NOT NULL CHECK(max_output_tokens BETWEEN 256 AND 4096),
 reserve_per_call_vnd integer NOT NULL CHECK(reserve_per_call_vnd BETWEEN 1 AND 1000000),
 allowance_vnd bigint NOT NULL CHECK(allowance_vnd BETWEEN 1 AND 1000000000)
);
CREATE TABLE IF NOT EXISTS crm_care_control.inference_receipts(
 request_id uuid PRIMARY KEY REFERENCES crm_care_control.advisor_runs(request_id),
 policy_id uuid NOT NULL REFERENCES crm_care_control.inference_policies(id),
 company_id uuid NOT NULL,actor_id uuid NOT NULL,capability uuid NOT NULL DEFAULT gen_random_uuid(),
 payload_sha256 text NOT NULL CHECK(payload_sha256~'^[a-f0-9]{64}$'),
 policy_snapshot jsonb NOT NULL,reserved_vnd integer NOT NULL,
 state text NOT NULL CHECK(state IN('AUTHORIZED','USAGE_RECORDED','UNKNOWN','NOT_SENT')),
 authorized_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 dispatch_before timestamptz NOT NULL DEFAULT clock_timestamp()+interval '5 seconds',
 receipt jsonb,completed_at timestamptz
);
ALTER TABLE crm_care_control.inference_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_care_control.inference_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON crm_care_control.inference_policies,crm_care_control.inference_receipts FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION crm_care_control.inference_policy_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF (to_jsonb(NEW)-'active') IS DISTINCT FROM (to_jsonb(OLD)-'active') THEN
  RAISE EXCEPTION 'create a new approved allowance instead of rewriting history' USING ERRCODE='22023';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION crm_care_control.inference_policy_immutable() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS inference_policy_immutable ON crm_care_control.inference_policies;
CREATE TRIGGER inference_policy_immutable BEFORE UPDATE ON crm_care_control.inference_policies
 FOR EACH ROW EXECUTE FUNCTION crm_care_control.inference_policy_immutable();

CREATE OR REPLACE FUNCTION public.crm_care_inference_claim(p_actor uuid,p_company uuid,p_request uuid,p_advisor_capability uuid,
 p_policy uuid,p_credential text,p_payload text,p_input_bytes integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r crm_care_control.advisor_runs%ROWTYPE;g crm_care_control.inference_policies%ROWTYPE;
 old crm_care_control.inference_receipts%ROWTYPE;body jsonb;used bigint;calls bigint;
BEGIN
 PERFORM crm_care_control.advisor_authorize(p_actor,p_company);
 IF p_policy IS NULL OR (p_credential~'^[a-f0-9]{64}$') IS NOT TRUE OR (p_payload~'^[a-f0-9]{64}$') IS NOT TRUE
  OR p_input_bytes IS NULL OR p_input_bytes<1 THEN RAISE EXCEPTION 'invalid inference claim' USING ERRCODE='22023';END IF;
 SELECT * INTO r FROM crm_care_control.advisor_runs WHERE request_id=p_request AND company_id=p_company AND actor_id=p_actor FOR UPDATE;
 IF NOT FOUND OR r.capability IS DISTINCT FROM p_advisor_capability THEN RAISE EXCEPTION 'inference scope denied' USING ERRCODE='42501';END IF;
 -- Run before thread locks, as FINISH/CANCEL. Revalidate consent/source just before egress.
 body:=crm_care_control.advisor_context(p_actor,p_company,r.thread_id);
 SELECT * INTO g FROM crm_care_control.inference_policies WHERE id=p_policy FOR UPDATE;
 IF NOT FOUND OR g.company_id IS DISTINCT FROM p_company OR g.actor_id IS DISTINCT FROM p_actor
  OR g.credential_sha256 IS DISTINCT FROM p_credential OR g.active IS NOT TRUE
  OR clock_timestamp()<g.starts_at OR clock_timestamp()>=g.expires_at THEN RAISE EXCEPTION 'inference policy unavailable' USING ERRCODE='42501';END IF;
 SELECT * INTO old FROM crm_care_control.inference_receipts WHERE request_id=p_request;
 IF FOUND THEN
  IF old.policy_id IS DISTINCT FROM p_policy OR old.payload_sha256 IS DISTINCT FROM p_payload THEN RAISE EXCEPTION 'inference request reused' USING ERRCODE='23505';END IF;
  RETURN jsonb_build_object('requestId',p_request,'invoke',false,'state',old.state);
 END IF;
 IF r.state<>'RUNNING' OR r.expires_at<=clock_timestamp() OR md5(body::text) IS DISTINCT FROM r.context_hash THEN
  RAISE EXCEPTION 'inference context changed' USING ERRCODE='40001';END IF;
 IF p_input_bytes>g.max_input_bytes THEN RAISE EXCEPTION 'inference input too large' USING ERRCODE='22023';END IF;
 -- An unacknowledged dispatch is never recovered by another model call. Only
 -- one in-flight call per allowance; ambiguous cost stops subsequent admission.
 IF EXISTS(SELECT 1 FROM crm_care_control.inference_receipts WHERE policy_id=p_policy AND state IN('AUTHORIZED','UNKNOWN')) THEN
  RAISE EXCEPTION 'inference reconciliation required' USING ERRCODE='40001';END IF;
 SELECT count(*),coalesce(sum(reserved_vnd),0) INTO calls,used FROM crm_care_control.inference_receipts WHERE policy_id=p_policy;
 IF calls>=g.max_calls OR used+g.reserve_per_call_vnd>g.allowance_vnd THEN RAISE EXCEPTION 'inference allowance exhausted' USING ERRCODE='42501';END IF;
 INSERT INTO crm_care_control.inference_receipts(request_id,policy_id,company_id,actor_id,payload_sha256,policy_snapshot,reserved_vnd,state,dispatch_before)
 VALUES(p_request,p_policy,p_company,p_actor,p_payload,to_jsonb(g)-'credential_sha256',g.reserve_per_call_vnd,'AUTHORIZED',
  least(clock_timestamp()+interval '5 seconds',g.expires_at,r.expires_at)) RETURNING * INTO old;
 RETURN jsonb_build_object('requestId',p_request,'companyId',p_company,'actorId',p_actor,'policyId',p_policy,'invoke',true,
  'capability',old.capability,'model',g.model,'maxOutputTokens',g.max_output_tokens,'maxInputBytes',g.max_input_bytes,
  'authorizedAt',old.authorized_at,'dispatchBefore',old.dispatch_before,'reservedVnd',old.reserved_vnd);
END $$;

CREATE OR REPLACE FUNCTION public.crm_care_inference_record(p_request uuid,p_capability uuid,p_receipt jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r crm_care_control.inference_receipts%ROWTYPE;v_state text;input_n bigint;output_n bigint;total_n bigint;
BEGIN
 -- Recording costs after revocation must remain possible with the private receipt
 -- capability. This grants no read, new inference, or customer-facing operation.
 SELECT * INTO r FROM crm_care_control.inference_receipts WHERE request_id=p_request FOR UPDATE;
 IF NOT FOUND OR r.capability IS DISTINCT FROM p_capability THEN RAISE EXCEPTION 'inference receipt denied' USING ERRCODE='42501';END IF;
 IF jsonb_typeof(p_receipt) IS DISTINCT FROM 'object' OR octet_length(p_receipt::text)>2000 THEN
  RAISE EXCEPTION 'invalid usage receipt' USING ERRCODE='22023';END IF;
 v_state:=p_receipt->>'state';
 IF (v_state IN('USAGE_RECORDED','UNKNOWN','NOT_SENT')) IS NOT TRUE THEN RAISE EXCEPTION 'invalid usage state' USING ERRCODE='22023';END IF;
 IF v_state='USAGE_RECORDED' THEN
  IF (SELECT count(*) FROM jsonb_object_keys(p_receipt))<>6 OR NOT p_receipt ?& ARRAY['state','responseId','model','inputTokens','outputTokens','totalTokens']
   OR (p_receipt->>'responseId'~'^resp_[a-zA-Z0-9_-]{1,150}$') IS NOT TRUE
   OR p_receipt->>'model' IS DISTINCT FROM r.policy_snapshot->>'model'
   OR EXISTS(SELECT 1 FROM unnest(ARRAY['inputTokens','outputTokens','totalTokens']) k WHERE jsonb_typeof(p_receipt->k) IS DISTINCT FROM 'number'
    OR (p_receipt->>k~'^[0-9]{1,9}$') IS NOT TRUE) THEN RAISE EXCEPTION 'invalid usage' USING ERRCODE='22023';END IF;
  input_n:=(p_receipt->>'inputTokens')::bigint;output_n:=(p_receipt->>'outputTokens')::bigint;total_n:=(p_receipt->>'totalTokens')::bigint;
  IF total_n<>input_n+output_n OR output_n>(r.policy_snapshot->>'max_output_tokens')::integer THEN
   RAISE EXCEPTION 'inconsistent usage' USING ERRCODE='22023';END IF;
 ELSE
  IF (SELECT count(*) FROM jsonb_object_keys(p_receipt))<>2 OR NOT p_receipt ?& ARRAY['state','reason']
   OR (CASE WHEN v_state='UNKNOWN' THEN p_receipt->>'reason' IN('TRANSPORT_UNKNOWN','USAGE_UNAVAILABLE')
    ELSE p_receipt->>'reason' IN('ADMISSION_EXPIRED','DISABLED','ABORTED') END) IS NOT TRUE THEN
   RAISE EXCEPTION 'invalid usage reason' USING ERRCODE='22023';END IF;
 END IF;
 IF r.state<>'AUTHORIZED' THEN
  IF r.receipt IS DISTINCT FROM p_receipt THEN RAISE EXCEPTION 'usage receipt conflict' USING ERRCODE='23505';END IF;
  RETURN jsonb_build_object('requestId',p_request,'state',r.state,'replayed',true);
 END IF;
 UPDATE crm_care_control.inference_receipts SET state=v_state,receipt=p_receipt,completed_at=clock_timestamp() WHERE request_id=p_request;
 -- Never release reserved VND as if token usage were a settled provider invoice.
 RETURN jsonb_build_object('requestId',p_request,'state',v_state,'replayed',false);
END $$;

CREATE OR REPLACE FUNCTION public.crm_care_inference_allowance(p_actor uuid,p_company uuid,p_policy uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE g crm_care_control.inference_policies%ROWTYPE;n bigint;reserved bigint;unresolved bigint;usage_n bigint;
BEGIN
 PERFORM crm_care_control.advisor_authorize(p_actor,p_company);
 SELECT * INTO g FROM crm_care_control.inference_policies WHERE id=p_policy AND company_id=p_company AND actor_id=p_actor;
 IF NOT FOUND THEN RAISE EXCEPTION 'allowance unavailable' USING ERRCODE='42501';END IF;
 SELECT count(*),coalesce(sum(reserved_vnd),0),count(*) FILTER(WHERE state IN('AUTHORIZED','UNKNOWN')),
  count(*) FILTER(WHERE state='USAGE_RECORDED') INTO n,reserved,unresolved,usage_n FROM crm_care_control.inference_receipts WHERE policy_id=p_policy;
 RETURN jsonb_build_object('companyId',p_company,'policyId',p_policy,'model',g.model,'active',g.active,
  'startsAt',g.starts_at,'expiresAt',g.expires_at,'maxCalls',g.max_calls,'attempts',n,'reservedVnd',reserved,
  'allowanceVnd',g.allowance_vnd,'unresolved',unresolved,'usageReceipts',usage_n,'actualCostVnd',NULL,
  'costBasis','RESERVED_ALLOWANCE_NOT_PROVIDER_INVOICE','send',false);
END $$;
REVOKE ALL ON FUNCTION public.crm_care_inference_claim(uuid,uuid,uuid,uuid,uuid,text,text,integer),
 public.crm_care_inference_record(uuid,uuid,jsonb),public.crm_care_inference_allowance(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.crm_care_inference_claim(uuid,uuid,uuid,uuid,uuid,text,text,integer),
 public.crm_care_inference_record(uuid,uuid,jsonb),public.crm_care_inference_allowance(uuid,uuid,uuid) TO service_role;
COMMIT;
