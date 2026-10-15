'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const {writeCrmLead,COMPANY} = require('../src/helpers/crmStageQualificationWrite');
const id='00000000-0000-4000-8000-000000000001', actor='00000000-0000-4000-8000-000000000002';
const oldLead={company_id:COMPANY,type:'lead',stage_id:'cold'};
const primaryContext={getActiveTarget:()=> 'primary',withPrimaryDatabase:fn=>fn()};
test('server constructs actor/company/expected state; atomic RPC failure never falls back to plain write',async()=>{
  const calls=[]; const db={rpc:async(name,args)=>{calls.push([name,args]);return {data:null,error:Error('synthetic atomic failure')};},
    from(){throw Error('must not write fallback');}};
  const result=await writeCrmLead({db,req:{user:{userId:actor},body:{actor_id:'forged'}},leadId:id,oldLead,patch:{stage_id:'warm'},primaryContext});
  assert.match(result.error.message,/synthetic atomic failure/);
  assert.equal(calls.length,1); assert.equal(calls[0][0],'crm_lead_stage_write_v1');
  assert.equal(calls[0][1].p_actor_id,actor);assert.equal(calls[0][1].p_expected_stage_id,'cold');
});
test('backup and missing session actor cannot call stage RPC',async()=>{
  const db={rpc(){throw Error('must not access');}};
  for(const [req,context] of [[{user:{}},primaryContext],[{user:{userId:actor}},{...primaryContext,getActiveTarget:()=> 'backup'}]]){
    const result=await writeCrmLead({db,req,leadId:id,oldLead,patch:{type:'deal'},primaryContext:context});
    assert.match(result.error.message,/STAGE_POLICY_/);
  }
});
test('only a successful primary commit queues its actual full row once; queue failure cannot report failed primary write',async()=>{
  const committed={id,company_id:COMPANY,type:'deal',stage_id:'deal',customer_id:'actual-customer',updated_at:'actual-time'};
  const seen=[]; const db={rpc:async()=>({data:committed,error:null})};
  const options={db,req:{user:{userId:actor}},leadId:id,oldLead,patch:{type:'deal',stage_id:'deal'},primaryContext};
  const result=await writeCrmLead({...options,enqueueCommittedLead:async row=>{seen.push(row);return{enqueued:true};}});
  assert.deepEqual(seen,[committed]);assert.equal(result.error,null);assert.equal(result.data,committed);
  const previous=console.warn;console.warn=()=>{};
  try{
    const failedQueue=await writeCrmLead({...options,enqueueCommittedLead:async()=>{throw Error('private queue details');}});
    assert.equal(failedQueue.error,null);assert.equal(failedQueue.data,committed);
    assert.equal(failedQueue.replicationWarning,'BACKUP_REPLICATION_ENQUEUE_FAILED');
  }finally{console.warn=previous;}
});
test('all five canonical UI mutations use atomic stage writer after their existing gates',()=>{
  const source=fs.readFileSync(path.resolve(__dirname,'../src/routes/crm/routes/leadLifecycle.js'),'utf8');
  for(const endpoint of ["r.put('/leads/:id'","r.post('/leads/:id/convert-to-deal'","r.patch('/leads/:id/stage'",
    "r.post('/leads/:id/convert-to-lead'","r.post('/leads/:id/reopen'"]){
    const start=source.indexOf(endpoint),end=source.indexOf('\nr.',start+3);
    assert.match(source.slice(start,end<0?undefined:end),/writeCrmLead\(/);
  }
  assert.match(source,/assertDealResponsible/); assert.match(source,/assertCrmStageAdvanceAllowed/);
});
