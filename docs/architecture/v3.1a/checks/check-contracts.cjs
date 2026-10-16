// Usage: node check-contracts.cjs /absolute/path/to/existing/ajv
const fs=require('fs'),path=require('path'),assert=require('assert');
const Ajv=require(process.argv[2]);const ajv=new Ajv({allErrors:true,strict:false,validateFormats:true});
ajv.addFormat('date-time',{type:'string',validate:v=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(v)&&Number.isFinite(Date.parse(v))});
const dir=path.resolve(__dirname,'../contracts');
const schema=JSON.parse(fs.readFileSync(path.join(dir,'bos-contracts.schema.json')));
const records=JSON.parse(fs.readFileSync(path.join(dir,'fixtures.json'))).records;
const validate=ajv.compile(schema), clone=x=>JSON.parse(JSON.stringify(x));
const results=[];const check=(name,fn)=>{fn();results.push({name,status:'PASS',class:'LOCAL_DESIGN_CHECK'});};
for(const r of records)check('valid_'+r.record_type,()=>assert(validate(r),JSON.stringify(validate.errors)));
const spec=records.find(x=>x.record_type==='AgentSpec'),cycle=records.find(x=>x.record_type==='CycleRecord');
for(const original of [spec,cycle])for(const key of ['taint','company_scope','max_rounds','agent_spec_version','prompt_hash','model_id'])check('missing_'+original.record_type+'_'+key,()=>{let x=clone(original);delete x[key];assert(!validate(x));});
check('reviewer_cannot_return_replacement_text',()=>{let x=clone(cycle);x.review.replacement='rewrite';assert(!validate(x));});
check('scope_cannot_be_wildcard',()=>{let x=clone(spec);x.company_scope.company_id='*';assert(!validate(x));});
check('unknown_record_property_rejected',()=>{let x=clone(spec);x.execute_shell=true;assert(!validate(x));});
check('gate_unknown_enum_rejected',()=>{let x=clone(records[2]);x.gates.TINH.status='SOFT_ALLOW';assert(!validate(x));});
const {decisionNext,cycleViolations,receiptCompletes,allowlist}=require('./policy-model.cjs');
const d=records[2],ctx={scope:d.company_scope,facts_current:true,rules_current:true,revision_current:true,now:Date.parse('2026-10-16T07:20:00Z'),policy_published:true,allowlist_founder_approved:true,veto_present:false,digest_current:true,under_dispatch_lock:true,veto_revision:0,approver_authorized:true,authority_epoch:1,grant_current:true,consent_current:true,internal_no_contact_action:true,notice_window_ms:600000,recipient_authorized:true};
for(const gate of ['PHAP','LE','LY','TINH'])for(const [value,expected] of [['DENY','DENIED'],['UNKNOWN','NEEDS_INPUT']])check(gate+'_'+value,()=>{let x=clone(d);x.gates[gate].status=value;assert.equal(decisionNext(x,ctx),expected);});
check('all_four_low_risk_actions_notice_path',()=>{for(const action of allowlist){let x=clone(d);x.action=action;assert.equal(decisionNext(x,ctx),'AUTHORIZED');}});
for(const [name,patch,want] of [['veto',{veto_present:true},'VETOED'],['window_not_elapsed',{now:Date.parse('2026-10-16T07:05:00Z')},'NOTICE_PENDING'],['unapproved_allowlist',{allowlist_founder_approved:false},'NEEDS_INPUT'],['expired',{now:Date.parse('2026-10-16T08:00:00Z')},'EXPIRED'],['stale_facts',{facts_current:false},'NEEDS_INPUT'],['stale_rules',{rules_current:false},'NEEDS_INPUT'],['stale_revision',{revision_current:false},'NEEDS_INPUT'],['no_lock',{under_dispatch_lock:false},'NEEDS_INPUT'],['veto_race_revision',{veto_revision:1},'NEEDS_INPUT'],['company_mismatch',{scope:{...ctx.scope,company_id:'other_company'}},'DENIED']])check(name,()=>assert.equal(decisionNext(d,{...ctx,...patch}),want));
check('unknown_notice_delivery',()=>{let x=clone(d);x.notice.state='UNKNOWN';assert.equal(decisionNext(x,ctx),'NEEDS_INPUT');});
check('customer_message_outside_allowlist',()=>{let x=clone(d);x.action='customer_message_send';assert.equal(decisionNext(x,ctx),'WAITING_APPROVAL');});
check('notice_does_not_create_approval',()=>{let x=clone(d);decisionNext(x,ctx);assert.equal(x.approval,null);});
for(const cl of ['C2_APPROVE','C3'])check('explicit_'+cl,()=>{let x=clone(d);x.authority_class=cl;x.notice=null;assert.equal(decisionNext(x,ctx),'WAITING_APPROVAL');x.approval={approval_id:'approval_synthetic',actor_ref:'actor_synthetic',authority:cl==='C3'?'C3':'C2',digest:d.digest,expires_at:'2026-10-16T08:00:00Z'};assert.equal(decisionNext(x,ctx),'AUTHORIZED');x.approval.digest='b'.repeat(64);assert.equal(decisionNext(x,ctx),'WAITING_APPROVAL');});
for(const [cl,want] of [['C0','READ_ONLY'],['C1','AUTHORIZED']])check(cl,()=>{let x=clone(d);x.authority_class=cl;assert.equal(decisionNext(x,ctx),want);});
check('valid_cycle',()=>assert.deepEqual(cycleViolations(cycle,spec,ctx.scope),[]));
for(const [name,mutate,want] of [['memory_company',x=>x.memory_namespace='other:company:worker','MEMORY_SCOPE'],['company_session',x=>x.company_scope.company_id='other_company','SCOPE_MISMATCH'],['review_hash',x=>x.review.artifact_hash='b'.repeat(64),'REVIEW_HASH'],['round_limit',x=>x.round_index=4,'ROUND_LIMIT'],['call_limit',x=>x.model_call_count=9,'CALL_LIMIT'],['taint_downgrade',x=>x.taint.labels=['VALIDATED_FACT'],'TAINT_DOWNGRADE'],['prompt_version',x=>x.prompt_hash='b'.repeat(64),'SPEC_MISMATCH']])check(name,()=>{let x=clone(cycle);mutate(x);assert(cycleViolations(x,spec,ctx.scope).includes(want));});
check('accepted_receipt_is_not_business_success',()=>assert(!receiptCompletes(records[4])));

for(const [state,want] of [['CONSUMED','CONSUMED'],['DENIED','DENIED'],['VETOED','VETOED'],['EXPIRED','EXPIRED']])check('terminal_'+state,()=>{let x=clone(d);x.authority_class='C1';x.state=state;assert.equal(decisionNext(x,ctx),want);});
check('late_delivery_cannot_shorten_window',()=>{let x=clone(d);x.notice.delivered_at='2026-10-16T07:09:59Z';assert.equal(decisionNext(x,ctx),'NEEDS_INPUT');});
check('delivery_evidence_required',()=>{let x=clone(d);x.notice.delivery_evidence_ref=null;assert.equal(decisionNext(x,ctx),'NEEDS_INPUT');});
check('recipient_must_have_veto_authority',()=>assert.equal(decisionNext(d,{...ctx,recipient_authorized:false}),'NEEDS_INPUT'));
check('consent_na_cannot_bypass_customer_contact',()=>assert.equal(decisionNext(d,{...ctx,internal_no_contact_action:false}),'NEEDS_INPUT'));
for(const [name,mutate,want] of [
 ['target_precondition_mismatch',x=>x.authorization_context.precondition.entity_ref='other_entity','NEEDS_INPUT'],
 ['version_precondition_mismatch',x=>x.authorization_context.precondition.version='8','NEEDS_INPUT'],
 ['absent_precondition_wrong_version',x=>x.authorization_context.precondition.kind='ABSENT','NEEDS_INPUT'],
 ['consent_denied',x=>x.authorization_context.consent_evaluation.status='DENIED','DENIED'],
 ['consent_unknown',x=>x.authorization_context.consent_evaluation.status='UNKNOWN','NEEDS_INPUT'],
 ['consent_granted_missing_refs',x=>x.authorization_context.consent_evaluation.status='GRANTED','NEEDS_INPUT'],
 ['authority_epoch_revoked',x=>x.authorization_context.authority_epoch=0,'DENIED']
])check(name,()=>{let x=clone(d);mutate(x);assert.equal(decisionNext(x,ctx),want);});
check('valid_absent_precondition',()=>{let x=clone(d);x.authorization_context.precondition={kind:'ABSENT',entity_ref:'lead_synthetic',version:null};x.expected_entity_revision='ABSENT';assert.equal(decisionNext(x,ctx),'AUTHORIZED');});
check('taint_origin_swap_rejected',()=>{let x=clone(cycle);x.taint.origin_refs=['other_source'];assert(cycleViolations(x,spec,ctx.scope).includes('TAINT_ORIGIN_DOWNGRADE'));});
check('taint_policy_swap_rejected',()=>{let x=clone(cycle);x.taint.policy_version='other_policy';assert(cycleViolations(x,spec,ctx.scope).includes('TAINT_POLICY_MISMATCH'));});

check('C1_stale_digest',()=>{let x=clone(d);x.authority_class='C1';assert.equal(decisionNext(x,{...ctx,digest_current:false}),'NEEDS_INPUT');});
const auditPath=path.join(dir,'audit-report.schema.json');
if(fs.existsSync(auditPath)){const a=JSON.parse(fs.readFileSync(auditPath));const Ajv2020=require(path.join(process.argv[2],'dist/2020'));const auditAjv=new Ajv2020({allErrors:true,strict:false});auditAjv.addFormat('date',{type:'string',validate:v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))});const av=auditAjv.compile(a);check('audit_schema',()=>assert(av(JSON.parse(fs.readFileSync(path.resolve(dir,'../audit-report.json')))),JSON.stringify(av.errors)));}
fs.writeFileSync(path.join(__dirname,'contract-results.json'),JSON.stringify({observed_at:new Date().toISOString(),validator:'Ajv '+require(path.join(process.argv[2],'package.json')).version,kind:'LOCAL_DESIGN_CHECK_NOT_RUNTIME',count:results.length,results},null,2)+'\n');
console.log(results.length+' local schema/semantic checks PASS; future runtime acceptance remains NOT_RUN');
