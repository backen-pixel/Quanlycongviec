-- Current-scope operator visibility. No delivery reset or customer confirmation command.
BEGIN;
CREATE OR REPLACE FUNCTION crm_survey_control.console_inventory(p_company uuid,p_thread uuid)
RETURNS TABLE(proposal_id uuid,created_at timestamptz,scope_ready boolean,document jsonb,legacy_view jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 WITH facts AS(
  SELECT p.*,d.state delivery_state,a.conflict,a.problem,
   coalesce(t.company_id=p_company AND fp.default_company_id=p_company AND fp.is_active=true
    AND t.page_id=p.business->>'pageId' AND t.psid=p.business->>'psid'
    AND contact.n=1 AND contact.lead_id=p.business->>'leadId' AND l.company_id=p_company
    AND l.customer_id::text IS NOT DISTINCT FROM p.business->>'customerId'
    AND(contact.customer_id IS NULL OR contact.customer_id=l.customer_id::text)
    AND(l.customer_id IS NULL OR c.company_id=p_company),false) safe,
   b.event_id,b.result booking_result,
   (SELECT result->>'reason' FROM crm_survey_control.proposal_events e WHERE e.proposal_id=p.id AND action='DISPATCH_BLOCKED' ORDER BY recorded_at DESC,id DESC LIMIT 1) blocked_reason,
   coalesce((SELECT jsonb_agg(jsonb_build_object('kind',o.kind,'state',o.state,'conflict',coalesce(oa.conflict,false)) ORDER BY o.kind)
    FROM crm_survey_control.outcomes o LEFT JOIN crm_survey_control.outcome_attempts oa ON oa.outcome_id=o.id
    WHERE o.proposal_id=p.id AND o.company_id=p_company AND o.thread_id=p_thread),'[]'::jsonb) outcomes,
   crm_survey_control.proposal_view(p.id) old_view
  FROM crm_survey_control.proposals p
  LEFT JOIN crm_survey_control.deliveries d ON d.proposal_id=p.id
  LEFT JOIN crm_survey_control.dispatch_attempts a ON a.proposal_id=p.id
  LEFT JOIN crm_survey_control.bookings b ON b.proposal_id=p.id AND b.company_id=p_company AND b.thread_id=p_thread
  LEFT JOIN public.crm_care_threads t ON t.id=p.thread_id
  LEFT JOIN public.facebook_pages fp ON fp.page_id=t.page_id
  LEFT JOIN LATERAL(SELECT count(*) n,min(x.lead_id::text) lead_id,min(to_jsonb(x)->>'customer_id') customer_id
    FROM public.facebook_contacts x WHERE x.page_id=t.page_id AND x.psid=t.psid) contact ON true
  LEFT JOIN public.crm_leads l ON l.id::text=p.business->>'leadId'
  LEFT JOIN public.customers c ON c.id=l.customer_id
  WHERE p.company_id=p_company AND p.thread_id=p_thread
 )
 SELECT id,created_at,safe,
  jsonb_build_object('proposalId',id,'createdAt',created_at,'scopeReady',safe,
   'state',CASE WHEN safe THEN state ELSE NULL END,'expiresAt',CASE WHEN safe THEN expires_at ELSE NULL END,
   'appointment',CASE WHEN safe THEN jsonb_build_object('startsAt',business->'startsAt','endsAt',business->'endsAt',
    'staffName',business->'staffName','location',business->'location','timeZone','Asia/Ho_Chi_Minh') ELSE NULL END,
   'delivery',CASE WHEN safe THEN jsonb_build_object('state',delivery_state,'conflict',coalesce(conflict,false),
    'hasProblem',problem IS NOT NULL,'blockedReason',blocked_reason) ELSE NULL END,
   'booking',CASE WHEN safe AND event_id IS NOT NULL THEN jsonb_build_object('eventId',event_id,'status',booking_result->'status') ELSE NULL END,
   'outcomes',CASE WHEN safe THEN outcomes ELSE NULL END),
  CASE WHEN safe THEN old_view ELSE NULL END
 FROM facts;
$$;
REVOKE ALL ON FUNCTION crm_survey_control.console_inventory(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.crm_survey_proposal_console(p_actor uuid,p_company uuid,p_thread uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'server required' USING ERRCODE='42501';END IF;
 PERFORM public.marketing_fb_intake_admin(p_actor,p_company);
 IF NOT marketing_measurement.source_actor_current(p_actor,p_company) THEN RAISE EXCEPTION 'current actor required' USING ERRCODE='42501';END IF;
 -- Mode, safe history, transport barriers and total all share this snapshot.
 WITH inventory AS MATERIALIZED(SELECT * FROM crm_survey_control.console_inventory(p_company,p_thread)),
 recent AS(SELECT * FROM inventory ORDER BY created_at DESC,proposal_id DESC LIMIT 50)
 SELECT jsonb_build_object('policy','SURVEY_PROPOSAL_CONSOLE_V1','companyId',p_company,'actorId',p_actor,'threadId',t.id,
  'asOf',statement_timestamp(),'careMode',t.mode,'deliveryBusy',crm_survey_control.delivery_busy(t.id),
  'items',coalesce((SELECT jsonb_agg(document ORDER BY created_at DESC,proposal_id DESC) FROM recent),'[]'::jsonb),
  'total',(SELECT count(*) FROM inventory),'canConfirmCustomer',false,'canResend',false,'aiMaySend',false)
 INTO result FROM public.crm_care_threads t JOIN public.facebook_pages fp ON fp.page_id=t.page_id
 WHERE t.id=p_thread AND t.company_id=p_company AND fp.default_company_id=p_company AND fp.is_active=true;
 IF result IS NULL THEN RAISE EXCEPTION 'thread unavailable' USING ERRCODE='42501';END IF;
 RETURN result;
END $$;

-- The prior proposer can replay an old view before checking contact scope. Keep
-- its business transaction unchanged, but guard every entry and its response.
DO $$ BEGIN
 IF to_regprocedure('crm_survey_control.propose_before_console(uuid,uuid,uuid,jsonb)') IS NULL THEN
  ALTER FUNCTION public.crm_survey_propose(uuid,uuid,uuid,jsonb) SET SCHEMA crm_survey_control;
  ALTER FUNCTION crm_survey_control.crm_survey_propose(uuid,uuid,uuid,jsonb) RENAME TO propose_before_console;
 END IF;
END $$;
REVOKE ALL ON FUNCTION crm_survey_control.propose_before_console(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.crm_survey_propose(p_actor uuid,p_company uuid,p_request uuid,p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;safe boolean;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'server required' USING ERRCODE='42501';END IF;
 PERFORM public.marketing_fb_intake_admin(p_actor,p_company);
 IF NOT marketing_measurement.source_actor_current(p_actor,p_company) THEN RAISE EXCEPTION 'current actor required' USING ERRCODE='42501';END IF;
 -- Serialize with the dispatch thread barrier. Replays only read an existing
 -- receipt; a fresh command cannot queue a replacement behind uncertain sends.
 PERFORM 1 FROM public.crm_care_threads WHERE id=(p_command->>'threadId')::uuid AND company_id=p_company FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'thread unavailable' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM crm_survey_control.proposals WHERE request_id=p_request)
  AND crm_survey_control.delivery_busy((p_command->>'threadId')::uuid) THEN
  RAISE EXCEPTION 'prior delivery unresolved' USING ERRCODE='40001';END IF;
 result:=crm_survey_control.propose_before_console(p_actor,p_company,p_request,p_command);
 SELECT scope_ready INTO safe FROM crm_survey_control.console_inventory(p_company,(result->>'threadId')::uuid) WHERE proposal_id=(result->>'proposalId')::uuid;
 IF safe IS DISTINCT FROM true THEN RAISE EXCEPTION 'proposal scope unavailable' USING ERRCODE='42501';END IF;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.crm_survey_proposal_read(p_actor uuid,p_company uuid,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'server required' USING ERRCODE='42501';END IF;
 PERFORM public.marketing_fb_intake_admin(p_actor,p_company);
 IF NOT marketing_measurement.source_actor_current(p_actor,p_company) THEN RAISE EXCEPTION 'current actor required' USING ERRCODE='42501';END IF;
 SELECT x.legacy_view INTO result FROM crm_survey_control.proposals p
 CROSS JOIN LATERAL crm_survey_control.console_inventory(p_company,p.thread_id)x
 WHERE p.id=p_id AND p.company_id=p_company AND x.proposal_id=p.id AND x.scope_ready;
 IF result IS NULL THEN RAISE EXCEPTION 'proposal scope unavailable' USING ERRCODE='42501';END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.crm_survey_proposal_console(uuid,uuid,uuid),public.crm_survey_propose(uuid,uuid,uuid,jsonb),public.crm_survey_proposal_read(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_survey_proposal_console(uuid,uuid,uuid),public.crm_survey_propose(uuid,uuid,uuid,jsonb),public.crm_survey_proposal_read(uuid,uuid,uuid) TO service_role;
COMMIT;
