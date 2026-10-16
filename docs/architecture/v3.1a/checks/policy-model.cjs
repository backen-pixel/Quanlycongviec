// Pure design model. No persistence, timers, locks, network, or production authority.
const allowlist=new Set(['lead_reassign_on_ack_timeout','internal_followup_reprioritize','internal_reminder_reschedule','site_visit_later_slot_propose']);
const sameScope=(a,b)=>a.tenant_id===b.tenant_id&&a.company_id===b.company_id;
function decisionNext(d,c) {
  if(!sameScope(d.company_scope,c.scope))return 'DENIED';
  if(['DENIED','VETOED','EXPIRED','CONSUMED'].includes(d.state))return d.state;
  const auth=d.authorization_context, pre=auth.precondition;
  if(auth.target.entity_ref!==pre.entity_ref)return 'NEEDS_INPUT';
  if(pre.kind==='EXISTS_AT_VERSION'&&(!pre.version||pre.version!==d.expected_entity_revision))return 'NEEDS_INPUT';
  if(pre.kind==='ABSENT'&&(pre.version!==null||d.expected_entity_revision!=='ABSENT'))return 'NEEDS_INPUT';
  if(auth.authority_epoch!==c.authority_epoch||!c.grant_current)return 'DENIED';
  if(auth.consent_evaluation.status==='DENIED')return 'DENIED';
  if(auth.consent_evaluation.status==='UNKNOWN'||!c.consent_current)return 'NEEDS_INPUT';
  if(auth.consent_evaluation.status==='GRANTED'&&auth.consent_refs.length===0)return 'NEEDS_INPUT';
  if(auth.consent_evaluation.status==='NOT_APPLICABLE'&&!c.internal_no_contact_action)return 'NEEDS_INPUT';
  const g=['PHAP','LE','LY','TINH'].map(k=>d.gates[k].status);
  if(g.includes('DENY'))return 'DENIED';
  if(g.includes('UNKNOWN')||!c.facts_current||!c.rules_current||!c.revision_current)return 'NEEDS_INPUT';
  if(Date.parse(d.valid_until)<=c.now)return 'EXPIRED';
  if(d.authority_class==='C0')return 'READ_ONLY';
  if(!c.policy_published||!c.digest_current)return 'NEEDS_INPUT';
  if(d.authority_class==='C1')return 'AUTHORIZED';
  if(d.authority_class==='C2_NOTIFY') {
    if(!allowlist.has(d.action))return 'WAITING_APPROVAL';
    if(!c.allowlist_founder_approved)return 'NEEDS_INPUT';
    const n=d.notice;
    if(!n)return 'WAITING_NOTICE';
    if(n.state==='VETOED'||c.veto_present)return 'VETOED';
    if(n.state!=='DELIVERED'||!n.delivered_at||!n.delivery_evidence_ref||!c.recipient_authorized)return 'NEEDS_INPUT';
    if(n.digest!==d.digest||!c.digest_current)return 'NEEDS_INPUT';
    if(Date.parse(n.expires_at)<=c.now)return 'EXPIRED';
    if(!Number.isFinite(c.notice_window_ms)||c.notice_window_ms<=0||Date.parse(n.not_before)<Date.parse(n.delivered_at)+c.notice_window_ms)return 'NEEDS_INPUT';
    if(c.now<Date.parse(n.not_before))return 'NOTICE_PENDING';
    if(!c.under_dispatch_lock||n.veto_revision!==c.veto_revision)return 'NEEDS_INPUT';
    return 'AUTHORIZED';
  }
  const a=d.approval;
  const required=d.authority_class==='C3'?'C3':'C2';
  if(!a||a.authority!==required||a.digest!==d.digest||Date.parse(a.expires_at)<=c.now||!c.approver_authorized||!c.digest_current)return 'WAITING_APPROVAL';
  return 'AUTHORIZED';
}
function cycleViolations(c, spec, activeScope) {
 const v=[];
 if(!sameScope(c.company_scope,activeScope)||!sameScope(spec.company_scope,activeScope))v.push('SCOPE_MISMATCH');
 if(c.agent_spec_ref!==spec.id||c.agent_spec_version!==spec.agent_spec_version||c.prompt_hash!==spec.prompt_hash||c.model_id!==spec.model_id)v.push('SPEC_MISMATCH');
 if(c.memory_namespace!==spec.memory_namespace||!c.memory_namespace.startsWith(activeScope.tenant_id+':'+activeScope.company_id+':'))v.push('MEMORY_SCOPE');
 if(c.max_rounds!==spec.max_rounds||c.round_index>spec.max_rounds)v.push('ROUND_LIMIT');
 if(c.max_model_calls!==spec.max_model_calls||c.model_call_count>spec.max_model_calls)v.push('CALL_LIMIT');
 if(c.review&&c.review.artifact_hash!==c.artifact_hash)v.push('REVIEW_HASH');
 if(c.review&&c.review.reviewer_spec_ref===spec.id)v.push('REVIEWER_IDENTITY');
 for(const label of spec.taint.labels)if(!c.taint.labels.includes(label))v.push('TAINT_DOWNGRADE');
 for(const origin of spec.taint.origin_refs)if(!c.taint.origin_refs.includes(origin))v.push('TAINT_ORIGIN_DOWNGRADE');
 if(c.taint.policy_version!==spec.taint.policy_version)v.push('TAINT_POLICY_MISMATCH');
 return v;
}
function receiptCompletes(r) {return r.phase==='RECONCILED'&&r.outcome==='CONFIRMED';}
module.exports={decisionNext,cycleViolations,receiptCompletes,allowlist};
