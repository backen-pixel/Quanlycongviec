-- Read-only company operations, independent of advertising measurement dates.
BEGIN;
CREATE OR REPLACE FUNCTION public.marketing_operations_snapshot(p_actor uuid,p_company uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service required' USING ERRCODE='42501';END IF;
 PERFORM public.marketing_fb_intake_admin(p_actor,p_company);
 IF NOT marketing_measurement.source_actor_current(p_actor,p_company) THEN RAISE EXCEPTION 'current authority required' USING ERRCODE='42501';END IF;
 -- Stable identity/handoff helpers share this single statement's MVCC snapshot.
 WITH threads AS MATERIALIZED(SELECT * FROM public.crm_care_threads WHERE company_id=p_company ORDER BY id LIMIT 5001),
 facts AS(
  SELECT t.*,l.id AS mapped_lead,l.region_id,l.assigned_to,
   coalesce(fp.default_company_id=p_company AND fp.is_active=true AND fc.n=1 AND l.company_id=p_company
    AND(l.customer_id IS NULL OR c.company_id=p_company)
    AND(fc.customer_id IS NULL OR fc.customer_id=l.customer_id::text),false) AS mapping_ready,
   coalesce(l.company_id=p_company AND r.company_id=p_company AND r.is_active=true AND u.company_id=p_company AND u.is_active=true
    AND u.tenant_id IS NOT DISTINCT FROM co.tenant_id
    AND EXISTS(SELECT 1 FROM public.user_company_regions ur WHERE ur.user_id=l.assigned_to AND ur.region_id=l.region_id),false) AS owner_ready,
   marketing_measurement.source_actor_current(t.claimed_by,p_company) AS handler_ready,
   msg.last_inbound,msg.last_outbound
  FROM threads t
  LEFT JOIN public.facebook_pages fp ON fp.page_id=t.page_id
  LEFT JOIN LATERAL(SELECT count(*) n,min(x.lead_id::text) lead_id,min(to_jsonb(x)->>'customer_id') customer_id
   FROM public.facebook_contacts x WHERE x.page_id=t.page_id AND x.psid=t.psid) fc ON true
  LEFT JOIN public.crm_leads l ON l.id::text=fc.lead_id
  LEFT JOIN public.customers c ON c.id=l.customer_id
  LEFT JOIN public.company_regions r ON r.id=l.region_id
  LEFT JOIN public.users u ON u.id=l.assigned_to
  JOIN public.companies co ON co.id=p_company
  LEFT JOIN LATERAL(SELECT max(sent_at) FILTER(WHERE direction='inbound') last_inbound,max(sent_at) FILTER(WHERE direction='outbound') last_outbound
   FROM public.crm_care_messages m WHERE m.thread_id=t.id AND m.page_id=t.page_id) msg ON true
 ), handoffs AS MATERIALIZED(SELECT * FROM crm_survey_control.handoff_inventory(p_company) ORDER BY proposal_id LIMIT 5001)
 SELECT jsonb_build_object('policy','MARKETING_OPERATIONS_V1','companyId',p_company,'actorId',p_actor,'asOf',clock_timestamp(),
  'complete',(SELECT count(*)<=5000 FROM threads) AND(SELECT count(*)<=5000 FROM handoffs),
  'identity',public.marketing_trial_identity_inventory(p_company),
  'threads',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'scopeReady',mapping_ready,
   'leadId',CASE WHEN mapping_ready THEN mapped_lead ELSE NULL END,
   'mode',CASE WHEN mapping_ready THEN mode ELSE NULL END,
   'ownerReady',mapping_ready AND owner_ready,'handlerReady',mapping_ready AND handler_ready,
   'ownerId',CASE WHEN mapping_ready AND owner_ready THEN assigned_to ELSE NULL END,
   'claimedBy',CASE WHEN mapping_ready AND handler_ready THEN claimed_by ELSE NULL END,
   'regionId',CASE WHEN mapping_ready AND owner_ready THEN region_id ELSE NULL END,
   'humanDeadline',CASE WHEN mapping_ready THEN human_deadline ELSE NULL END,
   'lastInboundAt',CASE WHEN mapping_ready THEN last_inbound ELSE NULL END,
   'lastOutboundAt',CASE WHEN mapping_ready THEN last_outbound ELSE NULL END) ORDER BY id) FROM facts),'[]'::jsonb),
  'bookings',coalesce((SELECT jsonb_agg(jsonb_build_object('id',proposal_id,'scopeReady',scope_ready,
   'leadId',CASE WHEN scope_ready THEN document->'leadId' ELSE NULL END,
   'threadId',CASE WHEN scope_ready THEN document->'threadId' ELSE NULL END,
   'state',CASE WHEN scope_ready THEN document->'state' ELSE NULL END,
   'assigned',scope_ready AND assigned,'unchanged',scope_ready AND consistent,
   'recipientId',CASE WHEN scope_ready AND assigned THEN recipient_id ELSE NULL END,
   'appointment',CASE WHEN scope_ready THEN document->'appointment' ELSE NULL END,
   'receipt',CASE WHEN scope_ready THEN document->'receipt' ELSE NULL END,
   'deliveryConflict',CASE WHEN scope_ready THEN document->'deliveryConflict' ELSE NULL END) ORDER BY proposal_id) FROM handoffs),'[]'::jsonb),
  'aiMaySend',false,'allowBudgetExecution',false) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.marketing_operations_snapshot(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_operations_snapshot(uuid,uuid) TO service_role;
COMMIT;
