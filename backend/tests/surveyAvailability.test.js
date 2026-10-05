'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createSurveyAvailability,validCommand,validAvailability}=require('../src/modules/marketingAutomation/surveyAvailability');
const actor=randomUUID(),company=randomUUID(),staff=randomUUID(),region=randomUUID(),thread=randomUUID(),request=randomUUID();
const command={action:'SAVE',staffId:staff,regionId:region,expectedRevision:0,reason:'Synthetic roster source verification',document:{calendarSource:'CRM_COMPLETE',externalCalendarCoverage:'ALL_BUSY_IN_CRM',sourceReference:'Synthetic source; no actual staff schedule',validUntil:'2027-01-03T10:00:00Z',bufferMinutes:30,slots:[{startsAt:'2027-01-02T02:00:00Z',endsAt:'2027-01-02T03:00:00Z'}]}};
const good={companyId:company,threadId:thread,status:'NO_CONFIRMED_OPTION',items:[],reservationMade:false,customerConfirmationRequired:true};
async function call(operation='availability',{data=good,error,env={VPT_SURVEY_ADMIN:'1'},primary=()=>true,user={userId:actor},input,after}={}){
 const calls=[],service=createSurveyAvailability({db:{rpc:async(name,args)=>{calls.push({name,args});after?.();return{data,error}}},isPrimary:primary,env});
 const b=input|| (operation==='availability'?{companyId:company,threadId:thread,from:'2027-01-02T00:00:00Z',to:'2027-01-03T00:00:00Z'}:operation==='read'?{companyId:company,staffId:staff,regionId:region}:{companyId:company,requestId:request,command});
 const res={code:200,headers:{},set(k,v){this.headers[k]=v;return this},status(x){this.code=x;return this},json(x){this.body=x;return this}};await service.handle({user,query:b,body:b},res,operation);return{...res,calls};
}
test('survey source requires complete explicit calendar coverage and bounded fields',()=>{assert.equal(validCommand(command),true);for(const document of[{...command.document,externalCalendarCoverage:undefined},{...command.document,calendarSource:'UNVERIFIED'},{...command.document,bufferMinutes:181},{...command.document,slots:[]},{...command.document,slots:[{...command.document.slots[0],customerConfirmed:true}]}])assert.equal(validCommand({...command,document}),false);assert.equal(validCommand({...command,actorId:actor}),false)});
test('survey endpoints default off and never query backup',async()=>{for(const x of[{env:{}},{primary:()=>false}]){const r=await call('availability',x);assert.equal(r.code,503);assert.equal(r.calls.length,0)}});
test('survey availability passes only server actor and validated scoped range',async()=>{const r=await call();assert.equal(r.code,200);assert.equal(r.headers['Cache-Control'],'no-store');assert.equal(r.calls[0].name,'crm_survey_availability');assert.equal(r.calls[0].args.p_actor,actor);assert.equal(r.body.reservationMade,false)});

test('PostgreSQL offset timestamps pass through actual availability API, UI state and proposal validator',async()=>{
 const state=await import('../../frontend/src/components/facebook/surveyProposalState.mjs');
 const proposal=require('../src/modules/marketingAutomation/surveyProposals');
 const now=Date.now(),offset=n=>new Date(n).toISOString().replace('Z','+00:00');
 const option={staffId:staff,regionId:region,optionId:'a'.repeat(32),version:'b'.repeat(32),startsAt:offset(now+3600000),endsAt:offset(now+7200000),snapshotExpiresAt:offset(now+30000),sourceValidUntil:offset(now+86400000)};
 const raw={...good,status:'AVAILABLE_SNAPSHOT',items:[option]};
 const response=await call('availability',{data:raw});assert.equal(response.code,200);
 const selected=state.availableOptions(response.body,company,thread,now).items[0];
 const p={actorId:actor,companyId:company,threadId:thread,requestId:request,command:{threadId:thread,optionId:selected.optionId,startsAt:selected.startsAt,endsAt:selected.endsAt,location:'Synthetic approved survey location'}};
 const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 const saved=state.savePendingProposal(storage,p);
 assert.equal(proposal.validCommand(saved.command),true);assert.deepEqual(state.readPendingProposal(storage,actor,company,thread),saved);
 assert.match(saved.command.startsAt,/Z$/);assert.equal(Date.parse(saved.command.startsAt),Date.parse(option.startsAt));
 assert.equal(Date.parse(saved.command.endsAt),Date.parse(option.endsAt));assert.equal(raw.items[0].startsAt,option.startsAt);
});
test('survey rejects actor ambiguity, additional rights and false confirmation input',async()=>{assert.equal((await call('availability',{user:{userId:actor,id:staff}})).code,403);for(const input of[{companyId:company,threadId:thread,actorId:staff},{companyId:company,threadId:thread,from:'tomorrow',to:'next week'},{companyId:company,threadId:thread,from:'2027-01-02T00:00:00Z',to:'2027-01-03T00:00:00Z',customerConfirmed:true}]){const r=await call('availability',{input});assert.equal(r.code,400);assert.equal(r.calls.length,0)}});
test('survey rejects wrong scope, malformed options and invented booking success',async()=>{for(const data of[{...good,companyId:staff},{...good,threadId:staff},{...good,reservationMade:true},{...good,status:'AVAILABLE_SNAPSHOT'},{...good,status:'AVAILABLE_SNAPSHOT',items:[{staffId:staff,regionId:region}]}])assert.equal((await call('availability',{data})).code,503)});
test('survey source change verifies exact receipt identity and uses authenticated actor',async()=>{const data={companyId:company,staffId:staff,regionId:region,revision:1,action:'SAVE',requestId:request,accepted:true,reservationMade:false};const r=await call('change',{data});assert.equal(r.code,200);assert.equal(r.calls[0].args.p_actor,actor);assert.equal(r.calls[0].args.p_request,request);assert.deepEqual(r.calls[0].args.p_command,command);assert.equal((await call('change',{data:{...data,requestId:randomUUID()}})).code,503)});
test('survey read does not convert missing storage into an empty roster',async()=>{assert.equal((await call('read',{data:null})).code,503);assert.equal((await call('read',{data:{companyId:company,staffId:staff,regionId:region,revision:0,reservationMade:false}})).code,200)});
test('survey error and mid-request failover preserve unavailable state',async()=>{for(const [code,status] of[['42501',403],['40001',409],['23505',409],['22008',400],['XX000',503]])assert.equal((await call('availability',{error:{code}})).code,status);let live=true;assert.equal((await call('availability',{primary:()=>live,after:()=>{live=false}})).code,503)});
test('survey snapshot cannot reach the client after its time fence expired',()=>{const now=Date.now(),iso=n=>new Date(n).toISOString(),option={staffId:staff,regionId:region,optionId:'a'.repeat(32),version:'b'.repeat(32),startsAt:iso(now+3600000),endsAt:iso(now+7200000),sourceValidUntil:iso(now+86400000),snapshotExpiresAt:iso(now+30000)},r={...good,status:'AVAILABLE_SNAPSHOT',items:[option]};assert.equal(validAvailability(r,company,thread,now),true);for(const patch of[{snapshotExpiresAt:iso(now)},{sourceValidUntil:iso(now-1)},{startsAt:iso(now)},{endsAt:iso(now+3500000)}])assert.equal(validAvailability({...r,items:[{...option,...patch}]},company,thread,now),false)});
