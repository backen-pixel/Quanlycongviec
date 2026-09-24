const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeMessengerAdTouch: normalize, captureMessengerAdTouch: capture, responseSla } = require('../src/helpers/facebookAdAttribution');
const page='409741855550833', contact='contact-test';
const event = { sender: {id:'1234567'}, timestamp:1790213220000, referral:{source:'ADS', ad_id:'120251440561920435'} };
test('exact string ID and original event time; no customer PII',()=>{
  const r=normalize(page,event,contact);assert.equal(r.ad_id,event.referral.ad_id);
  assert.equal(r.occurred_at,new Date(event.timestamp).toISOString());assert.equal(r.verification_status,'unverified_webhook');
  assert.ok(!JSON.stringify(r).includes('1234567'));
});
test('standalone, message and postback referrals deduplicate',()=>{
  const expected=normalize(page,event,contact).event_key;
  for(const k of ['message','postback'])assert.equal(normalize(page,{...event,referral:undefined,[k]:{referral:event.referral}},contact).event_key,expected);
});
test('no inference from customer text, numbers, echoes or organic referral',()=>{
  assert.equal(normalize(page,{...event,referral:undefined,message:{text:'ad_id.120251440561920435'}},contact),null);
  assert.equal(normalize(page,{...event,message:{is_echo:true}},contact),null);
  assert.equal(normalize(page,{...event,sender:{id:page}},contact),null);
  assert.equal(normalize(page,{...event,referral:{source:'SHORTLINK',ad_id:event.referral.ad_id}},contact),null);
  assert.equal(normalize(page,{...event,referral:{source:'ADS',ad_id:120251440561920435}},contact),null);
});
test('conflicting ad IDs and missing timestamp rejected',()=>{
  assert.equal(normalize(page,{...event,message:{referral:{source:'ADS',ad_id:'120251544807490435'}}},contact),null);
  assert.equal(normalize(page,{...event,timestamp:null},contact),null);
});
test('different page, contact, ad or time remain distinct touches',()=>{
  const first=normalize(page,event,contact).event_key;
  assert.notEqual(normalize(page,event,'other').event_key,first);
  assert.notEqual(normalize('123456',event,contact).event_key,first);
  assert.notEqual(normalize(page,{...event,timestamp:event.timestamp+1},contact).event_key,first);
});
test('capture is idempotent and errors propagate to caller',async()=>{
  const seen=new Map(); const db={from:t=>{if(t==='facebook_pages') return {select:()=>({eq:()=>({maybeSingle:async()=>({data:{default_company_id:'company-test'},error:null})})})};assert.equal(t,'facebook_ad_touches');return {upsert:async(r,o)=>{assert.equal(o.ignoreDuplicates,true);seen.set(r.event_key,r);return {error:null};}};}};
  await capture(db,page,event,contact);await capture(db,page,event,contact);assert.equal(seen.size,1);
  await assert.rejects(()=>capture({from:t=>t==='facebook_pages'?{select:()=>({eq:()=>({maybeSingle:async()=>({data:{default_company_id:'company-test'}})})})}:{upsert:async()=>({error:new Error('db unavailable')})}},page,event,contact), /db unavailable/);
});
test('SLA uses human timestamp only; strict under five minutes',()=>{
  const t='2026-09-24T01:00:00Z';
  assert.equal(responseSla(t,'2026-09-24T01:04:59Z').status,'MET');
  assert.equal(responseSla(t,'2026-09-24T01:05:00Z').status,'MISSED');
  assert.equal(responseSla(t,null,Date.parse('2026-09-24T01:03:00Z')).status,'DUE_SOON');
  assert.equal(responseSla(t,null,Date.parse('2026-09-24T01:05:00Z')).status,'OVERDUE');
  assert.equal(responseSla(t,'2026-09-24T00:59:00Z').status,'UNKNOWN');
});

test('missing company never captures evidence',async()=>{
 const db={from:t=>{assert.equal(t,'facebook_pages');return {select:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:null})})})};}};
 assert.equal(await capture(db,page,event,contact),false);
});
