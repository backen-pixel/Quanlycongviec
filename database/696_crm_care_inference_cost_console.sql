-- Read-only accounting for recorded care inference allowances, including Agents.
-- Does not price tokens, settle invoices, change receipts or reopen admission.
BEGIN;
CREATE OR REPLACE FUNCTION public.crm_care_inference_costs(p_actor uuid,p_company uuid,p_policy uuid DEFAULT NULL,p_after uuid DEFAULT NULL,p_unresolved boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
 PERFORM crm_care_control.advisor_authorize(p_actor,p_company);
 IF p_unresolved IS NULL OR (p_policy IS NULL AND p_unresolved) THEN RAISE EXCEPTION 'invalid receipt filter' USING ERRCODE='22023';END IF;
 IF p_policy IS NOT NULL AND NOT EXISTS(SELECT 1 FROM crm_care_control.inference_policies WHERE id=p_policy AND company_id=p_company) THEN
  RAISE EXCEPTION 'cost scope unavailable' USING ERRCODE='42501';END IF;
 IF p_after IS NOT NULL AND (CASE WHEN p_policy IS NULL THEN NOT EXISTS(
  SELECT 1 FROM crm_care_control.inference_policies WHERE id=p_after AND company_id=p_company)
  ELSE NOT EXISTS(SELECT 1 FROM crm_care_control.inference_receipts WHERE request_id=p_after AND policy_id=p_policy AND company_id=p_company AND(NOT p_unresolved OR state IN('AUTHORIZED','UNKNOWN'))) END) THEN
  RAISE EXCEPTION 'cost cursor unavailable' USING ERRCODE='42501';END IF;
 -- All totals and page rows come from this single statement snapshot. The guard
 -- refuses corrupt cross-company/principal bindings instead of dropping costs.
 WITH policies AS MATERIALIZED(
  SELECT g.* FROM crm_care_control.inference_policies g WHERE g.company_id=p_company AND(p_policy IS NULL OR g.id=p_policy)
 ), records AS MATERIALIZED(
  SELECT r.* FROM crm_care_control.inference_receipts r JOIN policies g ON g.id=r.policy_id
 ), integrity AS(
  SELECT NOT EXISTS(SELECT 1 FROM crm_care_control.inference_receipts r JOIN crm_care_control.inference_policies g ON g.id=r.policy_id
   WHERE (r.company_id=p_company OR g.company_id=p_company) AND(r.company_id<>g.company_id OR r.actor_id<>g.actor_id)) ok
 ), counts AS(
  SELECT g.id, count(r.request_id) attempts,coalesce(sum(r.reserved_vnd),0) reserved,
   count(r.request_id) FILTER(WHERE r.state='AUTHORIZED') pending,
   count(r.request_id) FILTER(WHERE r.state='UNKNOWN') unknown,
   count(r.request_id) FILTER(WHERE r.state='USAGE_RECORDED') usage,
   count(r.request_id) FILTER(WHERE r.state='NOT_SENT') not_sent,
   coalesce(sum((r.receipt->>'inputTokens')::bigint) FILTER(WHERE r.state='USAGE_RECORDED'),0) input_tokens,
   coalesce(sum((r.receipt->>'outputTokens')::bigint) FILTER(WHERE r.state='USAGE_RECORDED'),0) output_tokens,
   coalesce(sum((r.receipt->>'totalTokens')::bigint) FILTER(WHERE r.state='USAGE_RECORDED'),0) total_tokens
  FROM policies g LEFT JOIN records r ON r.policy_id=g.id GROUP BY g.id
 ), policy_rows AS(
  SELECT g.id,jsonb_build_object('policyId',g.id,'principalId',g.actor_id,'provider',g.provider,'model',g.model,
   'active',g.active,'startsAt',g.starts_at,'expiresAt',g.expires_at,'maxCalls',g.max_calls,'allowanceVnd',g.allowance_vnd,
   'attempts',c.attempts,'reservedVnd',c.reserved,'pendingReceipts',c.pending,'unknownReceipts',c.unknown,
   'usageReceipts',c.usage,'notSentReceipts',c.not_sent,'inputTokens',c.input_tokens,'outputTokens',c.output_tokens,'totalTokens',c.total_tokens) item
  FROM policies g JOIN counts c ON c.id=g.id
 ), policy_page AS(
  SELECT * FROM policy_rows WHERE p_after IS NULL OR id>p_after ORDER BY id LIMIT 21
 ), receipt_page AS(
  SELECT r.request_id id,jsonb_build_object('requestId',r.request_id,'policyId',r.policy_id,'principalId',r.actor_id,
   'state',r.state,'authorizedAt',r.authorized_at,'dispatchBefore',r.dispatch_before,'completedAt',r.completed_at,
   'reservedVnd',r.reserved_vnd,'reason',r.receipt->'reason',
   'usage',CASE WHEN r.state='USAGE_RECORDED' THEN jsonb_build_object('model',r.receipt->'model',
    'inputTokens',r.receipt->'inputTokens','outputTokens',r.receipt->'outputTokens','totalTokens',r.receipt->'totalTokens') ELSE NULL END) item
  FROM records r WHERE p_policy IS NOT NULL AND(NOT p_unresolved OR r.state IN('AUTHORIZED','UNKNOWN')) AND(p_after IS NULL OR r.request_id>p_after) ORDER BY r.request_id LIMIT 21
 )
 SELECT jsonb_build_object('companyId',p_company,'policyId',p_policy,'asOf',clock_timestamp(),'scope','RECORDED_CARE_POLICIES',
  'costBasis','RESERVED_ALLOWANCE_NOT_PROVIDER_INVOICE','actualCostVnd',NULL,'send',false,'canReconcile',false,'unresolvedOnly',p_unresolved,
  'integrityOk',(SELECT ok FROM integrity),
  'summary',(SELECT jsonb_build_object('policyCount',count(*),'attempts',coalesce(sum(attempts),0),'reservedVnd',coalesce(sum(reserved),0),
   'pendingReceipts',coalesce(sum(pending),0),'unknownReceipts',coalesce(sum(unknown),0),'usageReceipts',coalesce(sum(usage),0),
   'notSentReceipts',coalesce(sum(not_sent),0),'inputTokens',coalesce(sum(input_tokens),0),'outputTokens',coalesce(sum(output_tokens),0),
   'totalTokens',coalesce(sum(total_tokens),0)) FROM counts),
  'policy',CASE WHEN p_policy IS NOT NULL THEN(SELECT item FROM policy_rows) ELSE NULL END,
  'policies',CASE WHEN p_policy IS NULL THEN(SELECT coalesce(jsonb_agg(item ORDER BY id),'[]') FROM(SELECT * FROM policy_page ORDER BY id LIMIT 20)x) ELSE NULL END,
  'receipts',CASE WHEN p_policy IS NOT NULL THEN(SELECT coalesce(jsonb_agg(item ORDER BY id),'[]') FROM(SELECT * FROM receipt_page ORDER BY id LIMIT 20)x) ELSE NULL END,
  'nextAfter',CASE WHEN p_policy IS NULL THEN CASE WHEN(SELECT count(*) FROM policy_page)>20 THEN(SELECT id FROM policy_page ORDER BY id OFFSET 19 LIMIT 1) END
   ELSE CASE WHEN(SELECT count(*) FROM receipt_page)>20 THEN(SELECT id FROM receipt_page ORDER BY id OFFSET 19 LIMIT 1) END END) INTO result;
 IF result->>'integrityOk' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'cost integrity unavailable' USING ERRCODE='40001';END IF;
 RETURN result-'integrityOk';
END $$;
REVOKE ALL ON FUNCTION public.crm_care_inference_costs(uuid,uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.crm_care_inference_costs(uuid,uuid,uuid,uuid,boolean) TO service_role;
COMMIT;
