'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createSurveyHandoffs}=require('../src/modules/marketingAutomation/surveyHandoffs');
const company=randomUUID(),actor=randomUUID(),proposal=randomUUID(),request=randomUUID(),version='a'.repeat(32),at='2027-01-01T02:00:00Z';
const result={proposalId:proposal,companyId:company,requestId:request,actorId:actor,state:'ACKNOWLEDGED',receivedVersion:version,messageCount:5,receivedAt:at,replayed:false,aiMaySend:false};
const body={companyId:company,requestId:request,command:{proposalId:proposal,expectedVersion:version}};
async function run({op='ack',input=body,data=result,error,user={id:actor},env={VPT_SURVEY_HANDOFFS:'1'},isPrimary=()=>true,afterRpc=()=>{}}={}){
 const calls=[],res={code:200,headers:{},set(k,v){this.headers[k]=v;return this},status(n){this.code=n;return this},json(x){this.body=x;return this}};
 await createSurveyHandoffs({env,isPrimary,db:{rpc:async(...args)=>{calls.push(args);afterRpc();return{data,error}}}}).handle({user,body:input,query:input},res,op);return{...res,calls};
}
test('handoff is default-off and primary-only',async()=>{for(const options of [{env:{}},{isPrimary:()=>false}]){const r=await run(options);assert.equal(r.code,503);assert.equal(r.calls.length,0)}});
test('handoff actor is server-established and receipt has exact request, scope, recipient and version',async()=>{const r=await run();assert.equal(r.code,200);assert.equal(r.headers['Cache-Control'],'no-store');assert.deepEqual(r.calls[0],['crm_survey_handoff_ack',{p_actor:actor,p_company:company,p_request:request,p_command:body.command}]);assert.equal((await run({user:{id:actor,userId:randomUUID()}})).code,403)});
test('handoff rejects actor, send, booking, takeover, proxy or unpaired cursor inputs before storage',async()=>{for(const options of [{input:{...body,actorId:actor}},{input:{...body,command:{...body.command,recipientId:actor}}},{op:'send'},{op:'book'},{op:'queue',input:{companyId:company,state:'PENDING',after:proposal}},{op:'read',input:{companyId:company,proposalId:proposal,version}}]){const r=await run(options);assert.equal(r.code,400);assert.equal(r.calls.length,0)}});
test('handoff never passes secret fields or wrong/stale receipts through',async()=>{for(const patch of [{companyId:randomUUID()},{actorId:randomUUID()},{requestId:randomUUID()},{proposalId:randomUUID()},{receivedVersion:'b'.repeat(32)},{confirmationToken:'private'},{aiMaySend:true}])assert.equal((await run({data:{...result,...patch}})).code,503)});
test('handoff errors preserve permission, stale and unknown distinctions without source details',async()=>{for(const [code,status] of [['42501',403],['40001',409],['23505',409],['22023',400],['XX000',503]]){const r=await run({error:{code,message:'SECRET'}});assert.equal(r.code,status);assert.equal(JSON.stringify(r.body).includes('SECRET'),false)}});
test('primary change after database commit is uncertain and exact persisted request remains retryable',async()=>{let primary=true;assert.equal((await run({isPrimary:()=>primary,afterRpc:()=>{primary=false}})).code,503);assert.equal((await run({data:{...result,replayed:true}})).code,200)});
test('queue scope, counts and opaque unavailable rows are validated',async()=>{const q={companyId:company,state:'PENDING',items:[{proposalId:proposal,state:'PENDING',createdAt:at,scopeReady:false,appointment:null,title:null,careMode:null}],counts:{PENDING:1,ACKNOWLEDGED:0},unavailableCount:1,version,nextAfter:null,observedAt:at,aiMaySend:false};const options={op:'queue',input:{companyId:company,state:'PENDING'},data:q};assert.equal((await run(options)).code,200);for(const patch of [{companyId:randomUUID()},{counts:null},{items:[{...q.items[0],title:'foreign data'}]}])assert.equal((await run({...options,data:{...q,...patch}})).code,503)});

function handoffView() {
 const appointment={startsAt:at,endsAt:'2027-01-01T03:00:00Z',location:'Synthetic location',status:'CONFIRMED',timeZone:'Asia/Ho_Chi_Minh'};
 return {proposalId:proposal,companyId:company,threadId:randomUUID(),eventId:randomUUID(),state:'PENDING',createdAt:at,recipientId:actor,recipientName:'Synthetic admin',ownerId:null,regionId:randomUUID(),regionName:'HCM',leadId:randomUUID(),leadTitle:'Synthetic lead',requirements:null,
  customer:{id:null,name:'Synthetic customer',phone:null,email:null},appointment,confirmedAppointment:{startsAt:appointment.startsAt,endsAt:appointment.endsAt,location:appointment.location},careMode:'HUMAN_REQUESTED',careReason:null,deliveryConflict:false,messageCount:1,receipt:null,bookingStatus:'BOOKED_HANDOFF_PENDING',version,assignmentCurrent:true,appointmentUnchanged:true,canAcknowledge:true,aiMaySend:false,
  messages:[{id:randomUUID(),direction:'inbound',intent:'MESSAGE',content:'Synthetic request',attachments:[],sent_at:at}],nextBefore:null};
}

test('read returns a validated customer handoff without enabling AI and pins pagination to its version',async()=>{
 const view=handoffView(),cursor=randomUUID();view.nextBefore=view.messages[0].id;
 const r=await run({op:'read',input:{companyId:company,proposalId:proposal,before:cursor,version},data:view});
 assert.equal(r.code,200);assert.deepEqual(r.body,view);assert.equal(r.headers['Cache-Control'],'no-store');
 assert.deepEqual(r.calls[0],['crm_survey_handoff_read',{p_actor:actor,p_company:company,p_id:proposal,p_before:cursor,p_version:version}]);
});

for(const [label,change] of [
 ['foreign company',x=>x.companyId=randomUUID()],['wrong proposal',x=>x.proposalId=randomUUID()],
 ['wrong recipient for acknowledgement',x=>x.recipientId=randomUUID()],['stale version',x=>x.version='b'.repeat(32)],
 ['unknown care mode',x=>x.careMode='AI_ACTIVE'],['wrong time zone',x=>x.appointment.timeZone='UTC'],
 ['unexpected secret field',x=>x.customer.accessToken='synthetic-secret'],['duplicate messages',x=>{x.messages.push({...x.messages[0]});x.messageCount=2;}],
 ['impossible message count',x=>x.messageCount=0],['wrong pagination anchor',x=>x.nextBefore=randomUUID()],
 ['acknowledgement without receipt',x=>x.state='ACKNOWLEDGED'],['changed assignment still ackable',x=>x.assignmentCurrent=false],
 ['changed appointment still ackable',x=>x.appointmentUnchanged=false],['AI permission expansion',x=>x.aiMaySend=true],
 ['invalid message timestamp',x=>x.messages[0].sent_at='invalid'],['malformed attachment list',x=>x.messages[0].attachments=null],
]) test('handoff read fails closed for '+label,async()=>{
 const data=handoffView();change(data);
 const r=await run({op:'read',input:{companyId:company,proposalId:proposal,before:randomUUID(),version},data});
 assert.equal(r.code,503);assert.equal(r.body.customer,undefined);assert.equal(r.body.messages,undefined);
});

test('acknowledged handoff keeps the original recipient receipt and cannot be acknowledged again',async()=>{
 const data=handoffView();Object.assign(data,{state:'ACKNOWLEDGED',canAcknowledge:false,receipt:{...result}});
 const options={op:'read',input:{companyId:company,proposalId:proposal},data};
 assert.equal((await run(options)).code,200);
 data.receipt.actorId=randomUUID();assert.equal((await run(options)).code,503);
});

test('ready queue retains appointment and care mode with a matching last-item cursor',async()=>{
 const view=handoffView(),q={companyId:company,state:'PENDING',items:[{proposalId:proposal,state:'PENDING',createdAt:at,scopeReady:true,appointment:view.appointment,title:'Synthetic lead',careMode:'WAITING'}],counts:{PENDING:1,ACKNOWLEDGED:0},unavailableCount:0,version,nextAfter:proposal,observedAt:at,aiMaySend:false};
 const r=await run({op:'queue',input:{companyId:company,state:'PENDING',after:randomUUID(),version},data:q});assert.equal(r.code,200);
 q.nextAfter=randomUUID();assert.equal((await run({op:'queue',input:{companyId:company,state:'PENDING'},data:q})).code,503);
});
