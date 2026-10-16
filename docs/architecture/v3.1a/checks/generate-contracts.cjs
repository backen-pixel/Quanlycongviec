// Offline schema/fixture generator. No app imports or credentials.
const fs=require('fs'),path=require('path');
const out=path.resolve(__dirname,'../contracts');fs.mkdirSync(out,{recursive:true});
const str={type:'string',minLength:1,maxLength:256};
const id={type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9_:-]{2,127}$'};
const hash={type:'string',pattern:'^[a-f0-9]{64}$'};
const timestamp={type:'string',format:'date-time'};
const en=(...v)=>({type:'string',enum:v}),ref=n=>({$ref:'#/definitions/'+n});
const arr=(s,min=0)=>({type:'array',items:s,minItems:min,maxItems:256,uniqueItems:true});
const obj=p=>({type:'object',additionalProperties:false,properties:p,required:Object.keys(p)});
const nullable=s=>({anyOf:[s,{type:'null'}]});
const common={id,schema_version:{const:'3.1a.1'},company_scope:ref('Scope'),trace_id:id,created_at:timestamp};
const rec=(name,p)=>obj({...common,record_type:{const:name},...p});
const definitions={
Scope:obj({tenant_id:id,company_id:id}),
Taint:obj({labels:arr(en('EXTERNAL_UNTRUSTED','AI_GENERATED','VALIDATED_FACT'),1),origin_refs:arr(id,1),policy_version:str}),
Gate:obj({status:en('PASS','DENY','UNKNOWN'),rule_refs:arr(id,1),reason_code:id,evidence_refs:arr(id)}),
Approval:obj({approval_id:id,actor_ref:id,authority:en('C2','C3'),digest:hash,expires_at:timestamp}),
Notice:obj({notice_id:id,recipient_ref:id,delivery_evidence_ref:nullable(id),state:en('PENDING','DELIVERED','FAILED','UNKNOWN','VETOED'),digest:hash,delivered_at:nullable(timestamp),not_before:timestamp,expires_at:timestamp,veto_revision:{type:'integer',minimum:0}}),
};
definitions.AuthorizationContext=obj({principal_ref:id,principal_kind:en('USER','SERVICE'),delegation_ref:nullable(id),authority_epoch:{type:'integer',minimum:0},grant_ref:id,target:obj({entity_ref:id,account_ref:nullable(id)}),consent_refs:arr(id),consent_evaluation:obj({status:en('NOT_APPLICABLE','GRANTED','DENIED','UNKNOWN'),purpose:id,reason_code:id}),precondition:obj({kind:en('EXISTS_AT_VERSION','ABSENT'),entity_ref:id,version:nullable(str)})});
definitions.SnapshotRef=obj({id,version:str,hash});
definitions.IntakeAcceptanceReceipt=rec('IntakeAcceptanceReceipt',{intake_ref:id,phase:en('DURABLE','PROJECTED'),outcome:en('CONFIRMED','CONFLICT','QUARANTINED'),binding_id:id,event_key:hash,evidence_refs:arr(id,1),projection_ref:nullable(id)});
definitions.IntakeEvent=rec('IntakeEvent',{
connector:en('website_form','meta_lead_ads','zalo_oa'),binding_id:id,binding_version:str,
native_account_id:id,native_event_id:id,event_type:id,occurred_at:timestamp,
idempotency_key:hash,canonical_payload_hash:hash,raw_payload_ref:id,taint:ref('Taint'),
authentication:en('VERIFIED'),transport:en('WEBHOOK','POLL','FORM'),
consent_ref:nullable(id),intake_status:en('DURABLE','PROJECTED','QUARANTINED','CONFLICT')
});
definitions.FactProjection=rec('FactProjection',{
entity_ref:id,source_ref:id,source_revision:str,as_of:timestamp,expires_at:timestamp,
authority:en('DOMAIN_VERIFIED','EXTERNAL_CLAIM','AI_GENERATED'),
value:nullable({anyOf:[{type:'number'},{type:'boolean'},str]}),unit:nullable(str),
missing_reason:nullable(id),coverage:{type:'number',minimum:0,maximum:1},
metric_definition_version:str,taint:ref('Taint'),evidence_refs:arr(id,1)
});
definitions.DecisionRecord=rec('DecisionRecord',{
authorization_context:ref('AuthorizationContext'),fact_refs:arr(ref('SnapshotRef'),1),rule_refs:arr(ref('SnapshotRef'),1),action:id,payload_hash:hash,fact_snapshot_hash:hash,rule_snapshot_hash:hash,expected_entity_revision:str,
authority_class:en('C0','C1','C2_NOTIFY','C2_APPROVE','C3'),
gates:obj({PHAP:ref('Gate'),LE:ref('Gate'),LY:ref('Gate'),TINH:ref('Gate')}),
state:en('PROPOSED','EVALUATING','NEEDS_INPUT','DENIED','WAITING_APPROVAL','WAITING_NOTICE','NOTICE_PENDING','AUTHORIZED','VETOED','EXPIRED','CONSUMED','READ_ONLY'),
valid_until:timestamp,approval:nullable(ref('Approval')),notice:nullable(ref('Notice')),
policy_ref:id,authorization_basis:nullable(en('READ_ONLY','PUBLISHED_POLICY','EXPLICIT_APPROVAL','NOTICE_WINDOW_ELAPSED')),
digest:hash
});
definitions.Command=rec('Command',{
decision_ref:id,decision_digest:hash,action:id,payload_ref:id,payload_hash:hash,effect_key:hash,
expected_entity_revision:str,state:en('RECEIVED','VALIDATED','READY','EXECUTING','SUCCEEDED','FAILED_NO_EFFECT','UNKNOWN','RECONCILING','CANCEL_REQUESTED','CANCELLED','REJECTED','MANUAL_REVIEW'),
deadline:timestamp,attempt:{type:'integer',minimum:0},fence:{type:'integer',minimum:0},lease_owner:nullable(id),lease_until:nullable(timestamp),
reservation_ref:nullable(id),last_receipt_ref:nullable(id)
});
definitions.Receipt=rec('Receipt',{
command_ref:id,effect_key:hash,phase:en('ACCEPTED','COMMITTED','RECONCILED'),
outcome:en('CONFIRMED','NO_EFFECT','UNKNOWN'),provider_ref:nullable(id),evidence_refs:arr(id,1),
observed_at:timestamp,adapter_version:str,request_hash:hash,result_hash:hash
});
const d6={taint:ref('Taint'),max_rounds:{type:'integer',minimum:1,maximum:10},agent_spec_version:str,prompt_hash:hash,model_id:str};
definitions.AgentSpec=rec('AgentSpec',{
...d6,role:en('WORKER','REVIEWER'),allowed_tools:arr(id),capability:en('C0','PROPOSE_ONLY'),
memory_namespace:id,eval_version:str,max_model_calls:{type:'integer',minimum:1,maximum:100},
budget_policy_ref:id,output_label:{const:'AI_GENERATED'}
});
definitions.CycleRecord=rec('CycleRecord',{
...d6,agent_spec_ref:id,session_ref:id,memory_namespace:id,round_index:{type:'integer',minimum:0},
model_call_count:{type:'integer',minimum:0},max_model_calls:{type:'integer',minimum:1,maximum:100},
objective_ref:id,fact_refs:arr(id),rule_refs:arr(id),resource_refs:arr(id),
decision_refs:arr(id),command_refs:arr(id),outcome_refs:arr(id),adjustment_refs:arr(id),
artifact_hash:hash,review:nullable(obj({verdict:en('PASS','FAIL'),artifact_hash:hash,reviewer_spec_ref:id,eval_version:str})),
state:en('OPEN','NEEDS_INPUT','REVIEW','COMPLETE','ROUND_LIMIT','BUDGET_BLOCKED','WAITING_MEASUREMENT'),
output_label:{const:'AI_GENERATED'}
});

definitions.DecisionRecord.allOf=[
 {if:{properties:{state:{enum:['AUTHORIZED','CONSUMED']}}},then:{properties:{
   authority_class:{not:{const:'C0'}},
   authorization_basis:{enum:['PUBLISHED_POLICY','EXPLICIT_APPROVAL','NOTICE_WINDOW_ELAPSED']},
   gates:{properties:Object.fromEntries(['PHAP','LE','LY','TINH'].map(k=>[k,{properties:{status:{const:'PASS'}}}]))}
 }}},
 {if:{properties:{state:{const:'READ_ONLY'}}},then:{properties:{authority_class:{const:'C0'},authorization_basis:{const:'READ_ONLY'}}}}
];

const names=['IntakeAcceptanceReceipt','IntakeEvent','FactProjection','DecisionRecord','Command','Receipt','CycleRecord','AgentSpec'];
const schema={$schema:'http://json-schema.org/draft-07/schema#',$id:'urn:bos:v31a:contracts',title:'V3.1a design contracts, not deployed routes',definitions,oneOf:names.map(ref)};
fs.writeFileSync(path.join(out,'bos-contracts.schema.json'),JSON.stringify(schema,null,2)+'\n');
const H='a'.repeat(64), scope={tenant_id:'tenant_synthetic',company_id:'company_synthetic'};
const base=(name)=>({id:name.toLowerCase()+'_synthetic',schema_version:'3.1a.1',company_scope:scope,trace_id:'trace_synthetic',created_at:'2026-10-16T07:00:00Z',record_type:name});
const taint={labels:['EXTERNAL_UNTRUSTED'],origin_refs:['source_synthetic'],policy_version:'taint-v1'};
const gate={status:'PASS',rule_refs:['rule_synthetic_v1'],reason_code:'FACT_VERIFIED',evidence_refs:['evidence_synthetic']};
const D6={taint:{...taint,labels:['EXTERNAL_UNTRUSTED','AI_GENERATED']},max_rounds:3,agent_spec_version:'spec-1',prompt_hash:H,model_id:'MODEL_PIN_PENDING'};
const fixtures=[
{...base('IntakeEvent'),connector:'website_form',binding_id:'binding_synthetic',binding_version:'v1',native_account_id:'account_synthetic',native_event_id:'event_synthetic',event_type:'form_submitted',occurred_at:'2026-10-16T06:59:00Z',idempotency_key:H,canonical_payload_hash:H,raw_payload_ref:'encrypted_blob_synthetic',taint,authentication:'VERIFIED',transport:'FORM',consent_ref:null,intake_status:'DURABLE'},
{...base('FactProjection'),entity_ref:'lead_synthetic',source_ref:'crm_synthetic',source_revision:'1',as_of:'2026-10-16T07:00:00Z',expires_at:'2026-10-16T08:00:00Z',authority:'DOMAIN_VERIFIED',value:12,unit:'minutes',missing_reason:null,coverage:1,metric_definition_version:'ack_elapsed_v1',taint:{labels:['VALIDATED_FACT'],origin_refs:['crm_synthetic'],policy_version:'taint-v1'},evidence_refs:['evidence_synthetic']},
{...base('DecisionRecord'),authorization_context:{principal_ref:'service_synthetic',principal_kind:'SERVICE',delegation_ref:null,authority_epoch:1,grant_ref:'grant_synthetic',target:{entity_ref:'lead_synthetic',account_ref:null},consent_refs:[],consent_evaluation:{status:'NOT_APPLICABLE',purpose:'internal_assignment',reason_code:'INTERNAL_ONLY_NO_CUSTOMER_CONTACT'},precondition:{kind:'EXISTS_AT_VERSION',entity_ref:'lead_synthetic',version:'7'}},fact_refs:[{id:'fact_synthetic',version:'1',hash:H}],rule_refs:[{id:'rule_synthetic',version:'1',hash:H}],action:'lead_reassign_on_ack_timeout',payload_hash:H,fact_snapshot_hash:H,rule_snapshot_hash:H,expected_entity_revision:'7',authority_class:'C2_NOTIFY',gates:{PHAP:gate,LE:gate,LY:gate,TINH:gate},state:'NOTICE_PENDING',valid_until:'2026-10-16T08:00:00Z',approval:null,notice:{notice_id:'notice_synthetic',recipient_ref:'owner_synthetic',delivery_evidence_ref:'delivery_synthetic',state:'DELIVERED',digest:H,delivered_at:'2026-10-16T07:00:00Z',not_before:'2026-10-16T07:10:00Z',expires_at:'2026-10-16T08:00:00Z',veto_revision:0},policy_ref:'policy_pending_founder',authorization_basis:null,digest:H},
{...base('Command'),decision_ref:'decisionrecord_synthetic',decision_digest:H,action:'lead_reassign_on_ack_timeout',payload_ref:'payload_synthetic',payload_hash:H,effect_key:H,expected_entity_revision:'7',state:'RECEIVED',deadline:'2026-10-16T08:00:00Z',attempt:0,fence:0,lease_owner:null,lease_until:null,reservation_ref:null,last_receipt_ref:null},
{...base('Receipt'),command_ref:'command_synthetic',effect_key:H,phase:'ACCEPTED',outcome:'UNKNOWN',provider_ref:null,evidence_refs:['request_synthetic'],observed_at:'2026-10-16T07:00:01Z',adapter_version:'adapter-v1',request_hash:H,result_hash:H},
{...base('AgentSpec'),...D6,role:'WORKER',allowed_tools:['facts_read','decision_propose'],capability:'PROPOSE_ONLY',memory_namespace:'tenant_synthetic:company_synthetic:worker',eval_version:'eval-v1',max_model_calls:8,budget_policy_ref:'budget_pending_founder',output_label:'AI_GENERATED'},
{...base('CycleRecord'),...D6,agent_spec_ref:'agentspec_synthetic',session_ref:'session_synthetic',memory_namespace:'tenant_synthetic:company_synthetic:worker',round_index:1,model_call_count:2,max_model_calls:8,objective_ref:'objective_synthetic',fact_refs:['factprojection_synthetic'],rule_refs:['rule_synthetic_v1'],resource_refs:[],decision_refs:['decisionrecord_synthetic'],command_refs:[],outcome_refs:[],adjustment_refs:[],artifact_hash:H,review:{verdict:'PASS',artifact_hash:H,reviewer_spec_ref:'reviewer_synthetic',eval_version:'eval-v1'},state:'REVIEW',output_label:'AI_GENERATED'}
];
fixtures.push({...base('IntakeAcceptanceReceipt'),intake_ref:'intakeevent_synthetic',phase:'DURABLE',outcome:'CONFIRMED',binding_id:'binding_synthetic',event_key:H,evidence_refs:['inbox_commit_synthetic'],projection_ref:null});
fs.writeFileSync(path.join(out,'fixtures.json'),JSON.stringify({data_class:'SYNTHETIC',authorization:'NONE',records:fixtures},null,2)+'\n');
console.log('Wrote 8 contract definitions and 8 synthetic records');
