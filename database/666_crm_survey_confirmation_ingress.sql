-- Signed webhook adapter -> durable confirmation -> atomic booking.
-- The trusted Express receiver authenticates raw Meta bytes before this RPC.
-- No HTTP/AI tool accepts normalized events or customer-confirmed booleans.
BEGIN;
CREATE TABLE IF NOT EXISTS crm_survey_control.ingress_pages(
 page_id text PRIMARY KEY,company_id uuid NOT NULL,active boolean NOT NULL DEFAULT false,
 release_reference text NOT NULL CHECK(length(btrim(release_reference)) BETWEEN 20 AND 2000)
);
CREATE TABLE IF NOT EXISTS crm_survey_control.ingress_results(
 message_id uuid PRIMARY KEY,page_id text NOT NULL,proposal_id uuid NOT NULL,
 confirmation_payload text NOT NULL,
 state text NOT NULL CHECK(state IN ('RECEIVED','WAITING','BOOKED','REJECTED','BLOCKED')),
 result jsonb,received_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE crm_survey_control.ingress_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_survey_control.ingress_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON crm_survey_control.ingress_pages,crm_survey_control.ingress_results FROM PUBLIC,anon,authenticated,service_role;

-- Runtime trust boundary: even legacy backup grants on public functions must
-- not let anon/authenticated call the receiver/reconciler as a server worker.
CREATE OR REPLACE FUNCTION crm_survey_control.require_ingress_role()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION 'survey ingress denied' USING ERRCODE='42501';
 END IF;
END $$;

CREATE OR REPLACE FUNCTION crm_survey_control.consume_ingress(p_message uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_ingress crm_survey_control.ingress_results%ROWTYPE;v_result jsonb;v_enrolled boolean;
BEGIN
 SELECT * INTO v_ingress FROM crm_survey_control.ingress_results WHERE message_id=p_message;
 IF NOT FOUND THEN RAISE EXCEPTION 'survey receipt unavailable' USING ERRCODE='42501';END IF;
 -- Do not lock ingress before book: book serializes by thread/calendar/proposal.
 -- Reconcile and webhook follow the same order to avoid an ingress/thread cycle.
 IF v_ingress.state IN ('BOOKED','REJECTED','BLOCKED') THEN RETURN v_ingress.result;END IF;
 SELECT true INTO v_enrolled FROM crm_survey_control.ingress_pages x
  JOIN crm_survey_control.proposals p ON p.company_id=x.company_id
  WHERE x.page_id=v_ingress.page_id AND x.active AND p.id=v_ingress.proposal_id FOR SHARE OF x;
 IF v_enrolled IS NOT TRUE THEN
  v_result:=jsonb_build_object('status','BLOCKED','reason','INGRESS_NOT_ENROLLED','reservationMade',false);
 ELSE
  BEGIN
   v_result:=crm_survey_control.book(p_message);
  EXCEPTION WHEN insufficient_privilege THEN
   -- A revoked actor or changed Page must not discard the already received
   -- STOP/message. The domain subtransaction has no booking side effects.
   v_result:=jsonb_build_object('status','BLOCKED','reason','CURRENT_AUTHORITY_UNAVAILABLE','reservationMade',false);
  END;
 END IF;
 UPDATE crm_survey_control.ingress_results SET
  state=CASE v_result->>'status' WHEN 'BOOKED_HANDOFF_PENDING' THEN 'BOOKED'
   WHEN 'WAITING_FOR_DELIVERY' THEN 'WAITING' WHEN 'REJECTED' THEN 'REJECTED' ELSE 'BLOCKED' END,
  result=v_result WHERE message_id=p_message AND state IN ('RECEIVED','WAITING') RETURNING result INTO v_result;
 IF NOT FOUND THEN
  -- Another worker may have finished while this one waited for current
  -- authority/enrollment. A terminal result must never be overwritten.
  SELECT result INTO v_result FROM crm_survey_control.ingress_results WHERE message_id=p_message;
 END IF;
 RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION public.crm_survey_receive(p_events jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_count integer;v_event jsonb;v_payload text;v_parts text[];v_message public.crm_care_messages%ROWTYPE;
 v_thread public.crm_care_threads%ROWTYPE;v_proposal crm_survey_control.proposals%ROWTYPE;
 v_delivery crm_survey_control.deliveries%ROWTYPE;v_prior crm_survey_control.ingress_results%ROWTYPE;v_reason text;
BEGIN
 PERFORM crm_survey_control.require_ingress_role();
 -- Persist/process the ENTIRE batch first. STOP, takeover requests and unknown
 -- outbound echoes must win regardless of message sort order in the batch.
 v_count:=public.crm_care_receive(p_events);
 FOR v_event IN SELECT value FROM jsonb_array_elements(p_events)
  WHERE value ? 'confirmationPayload' ORDER BY value->>'pageId',value->>'psid',value->>'mid' LOOP
  v_payload:=v_event->>'confirmationPayload';
  IF jsonb_typeof(v_event->'confirmationPayload') IS DISTINCT FROM 'string'
   OR v_payload !~ '^VPT_SURVEY_V1:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   THEN RAISE EXCEPTION 'invalid confirmation payload' USING ERRCODE='22023';END IF;
  v_parts:=string_to_array(v_payload,':');v_reason:=NULL;
  SELECT * INTO v_message FROM public.crm_care_messages WHERE page_id=v_event->>'pageId' AND provider_mid=v_event->>'mid';
  SELECT * INTO v_thread FROM public.crm_care_threads WHERE id=v_message.thread_id;
  SELECT * INTO v_prior FROM crm_survey_control.ingress_results WHERE message_id=v_message.id;
  IF FOUND THEN
   IF v_prior.confirmation_payload IS DISTINCT FROM v_payload THEN RAISE EXCEPTION 'conflicting confirmation replay' USING ERRCODE='23505';END IF;
   CONTINUE;
  END IF;
  SELECT * INTO v_proposal FROM crm_survey_control.proposals WHERE id=v_parts[2]::uuid;
  SELECT * INTO v_delivery FROM crm_survey_control.deliveries WHERE proposal_id=v_parts[2]::uuid;
  IF v_message.direction<>'inbound' OR v_message.intent<>'MESSAGE' THEN v_reason:='CUSTOMER_CONTROL';
  ELSIF v_proposal.id IS NULL OR v_delivery.proposal_id IS NULL
   OR v_proposal.thread_id IS DISTINCT FROM v_thread.id OR v_proposal.company_id IS DISTINCT FROM v_thread.company_id
   OR v_proposal.business->>'pageId' IS DISTINCT FROM v_thread.page_id OR v_proposal.business->>'psid' IS DISTINCT FROM v_thread.psid
   OR v_delivery.confirmation_token IS DISTINCT FROM v_parts[3]::uuid THEN v_reason:='CONFIRMATION_MISMATCH';END IF;
  INSERT INTO crm_survey_control.ingress_results(message_id,page_id,proposal_id,confirmation_payload,state,result)
  VALUES(v_message.id,v_thread.page_id,v_parts[2]::uuid,v_payload,CASE WHEN v_reason IS NULL THEN 'RECEIVED' ELSE 'REJECTED' END,
   CASE WHEN v_reason IS NOT NULL THEN jsonb_build_object('status','REJECTED','reason',v_reason,'reservationMade',false) END);
  IF v_reason IS NULL THEN
   INSERT INTO crm_survey_control.inbound_receipts(message_id,proposal_id,page_id,psid,confirmation_token,payload_hash)
   VALUES(v_message.id,v_proposal.id,v_thread.page_id,v_thread.psid,v_parts[3]::uuid,v_message.payload_hash);
  END IF;
 END LOOP;
 -- All receipts are durable in this transaction before any calendar command.
 -- Replays also retry WAITING receipts after a previously late delivery ACK.
 FOR v_prior IN SELECT i.* FROM crm_survey_control.ingress_results i
  JOIN public.crm_care_messages m ON m.id=i.message_id
  WHERE i.state IN ('RECEIVED','WAITING') AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_events) e
   WHERE e->>'pageId'=m.page_id AND e->>'mid'=m.provider_mid)
  ORDER BY i.page_id,m.thread_id,i.message_id LOOP
  PERFORM crm_survey_control.consume_ingress(v_prior.message_id);
 END LOOP;
 RETURN v_count;
END $$;

-- Used by the future delivery worker after ACK and by bounded recovery. No
-- operator/AI HTTP endpoint exposes this function. It cannot mint delivery.
CREATE OR REPLACE FUNCTION public.crm_survey_confirmation_reconcile(p_page text,p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_id uuid;v_result jsonb;v_items jsonb:='[]';
BEGIN
 PERFORM crm_survey_control.require_ingress_role();
 IF p_page IS NULL OR p_page !~ '^[0-9]{1,32}$' OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
  RAISE EXCEPTION 'invalid confirmation recovery scope' USING ERRCODE='22023';END IF;
 FOR v_id IN SELECT i.message_id FROM crm_survey_control.ingress_results i
  LEFT JOIN crm_survey_control.proposals p ON p.id=i.proposal_id
  LEFT JOIN crm_survey_control.deliveries d ON d.proposal_id=p.id
  LEFT JOIN public.crm_care_threads t ON t.id=p.thread_id
  LEFT JOIN crm_survey_control.ingress_pages x ON x.page_id=i.page_id AND x.company_id=p.company_id
  WHERE i.page_id=p_page AND i.state IN ('RECEIVED','WAITING')
   AND (d.state='SENT' OR p.id IS NULL OR p.state<>'OPEN' OR p.expires_at<=clock_timestamp()
    OR t.mode IS DISTINCT FROM 'WAITING' OR x.active IS DISTINCT FROM true)
  ORDER BY i.received_at,i.message_id LIMIT p_limit LOOP
  v_result:=crm_survey_control.consume_ingress(v_id);
  v_items:=v_items||jsonb_build_array(jsonb_build_object('messageId',v_id,'status',v_result->>'status'));
 END LOOP;
 RETURN jsonb_build_object('pageId',p_page,'items',v_items);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA crm_survey_control FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.crm_survey_receive(jsonb),public.crm_survey_confirmation_reconcile(text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_survey_receive(jsonb),public.crm_survey_confirmation_reconcile(text,integer) TO service_role;
COMMIT;
