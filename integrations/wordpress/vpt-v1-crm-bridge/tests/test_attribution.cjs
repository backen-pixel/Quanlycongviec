// Browser-independent tests of actual shipped script with synthetic fields only.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname,'../attribution.js'),'utf8');
const now = 1791302400000;
function run({url='https://vanphuthanh.net/tu-bep/',ref='',prior=null,blocked=false,saved:seed=null,extra={},win={},measure=false,cookies=''}={}) {
 const location = new URL(url), fields={}, attrs={}, handlers={}, saved=new Map();
 let clock=now;
 if(prior) saved.set('vpt_v1_attribution_session',JSON.stringify(prior));
 if(seed) for(const [k,v] of seed) saved.set(k,v);
 const names=['utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','fbclid','gbraid','wbraid','campaignid','adgroupid','keyword','matchtype','device','vpt_referrer_host','vpt_landing_page','vpt_fbc','vpt_fbp','vpt_fb_captured_at'];
 names.forEach(k=>fields[k]={value:''});
 fields['your-ads-consent']={checked:measure};
 const form={querySelector(s){const n=s.match(/name="([^"]+)"/)[1];return n==='vpt_form'?{value:'VPT_V1'}:fields[n];},setAttribute(k,v){attrs[k]=v;}};
 const document={referrer:ref,readyState:'complete',cookie:cookies,querySelectorAll(){return[form]},addEventListener(k,v){handlers[k]=v;}};
 const storage={getItem(k){if(blocked)throw Error('blocked');return saved.get(k)||null;},setItem(k,v){if(blocked)throw Error('blocked');saved.set(k,v);},removeItem(k){if(blocked)throw Error('blocked');saved.delete(k);}};
 const window={location,dataLayer:[],...win};
 class ClockDate extends Date { static now(){return clock;} }
 vm.runInNewContext(script,{window,document,sessionStorage:storage,URL,URLSearchParams,Date:ClockDate,...extra});
 return {saved,get data(){return Object.fromEntries(names.map(k=>[k,fields[k].value]));},attrs,handlers,window,get prior(){return JSON.parse(saved.get('vpt_v1_attribution_session')||'null');},form,advanceTime(ms){clock+=ms;}};
}
test('Google organic entry retains sanitized landing and host',()=>{
 const r=run({url:'https://vanphuthanh.net/tu-bep/?private=synthetic#secret',ref:'https://www.google.com.vn/search?q=private'});
 assert.equal(r.data.utm_medium,'organic');assert.equal(r.data.utm_source,'google');
 assert.equal(r.data.vpt_referrer_host,'www.google.com.vn');assert.equal(r.data.vpt_landing_page,'https://vanphuthanh.net/tu-bep/');
 assert.equal(r.data.gclid,'');assert.equal(r.attrs['data-vpt-attribution'],'ready');
});
test('Organic entry carries over internal page navigation',()=>{
 const first=run({ref:'https://www.google.com/'});const next=run({ref:'https://vanphuthanh.net/tu-bep/',url:'https://vanphuthanh.net/san-pham/bao-gia-tu-bep/',prior:first.prior});
 assert.equal(next.data.utm_medium,'organic');assert.equal(next.data.vpt_landing_page,first.data.vpt_landing_page);assert.equal(next.prior.expires,first.prior.expires);
});
test('Direct and unknown referrers are not SEO',()=>{
 for(const ref of ['','https://google.com.evil.invalid/','https://www.facebook.com/','https://news.google.com/'])assert.equal(run({ref}).data.utm_medium,'');
 assert.equal(run().attrs['data-vpt-attribution'],'direct');
});
test('Paid UTM and click-only entry take precedence over Google referrer',()=>{
 for(const params of ['gclid=synthetic','gbraid=synthetic','wbraid=synthetic','utm_source=google&utm_medium=cpc','utm_source=chatgpt&utm_medium=paid']){
  const r=run({url:'https://vanphuthanh.net/?'+params,ref:'https://www.google.com/'});assert.notEqual(r.data.utm_medium,'organic');
 }
});
test('New campaign clears old organic and click IDs',()=>{
 const first=run({url:'https://vanphuthanh.net/?gclid=oldsynthetic&utm_source=google&utm_medium=cpc'});
 const next=run({url:'https://vanphuthanh.net/tu-bep/?utm_source=chatgpt&utm_medium=paid',prior:first.prior});
 assert.equal(next.data.gclid,'');assert.equal(next.data.utm_source,'chatgpt');
});
test('Empty, repeated, invalid or oversize Facebook click starts a new source boundary without retaining a prior Google click',()=>{
 const first=run({url:'https://vanphuthanh.net/?gclid=oldsynthetic&utm_source=google&utm_medium=cpc'});
 const params=['fbclid','fbclid=','fbclid=&fbclid=newFacebookClick','fbclid=newClick&fbclid=anotherClick',
  ...['x'.repeat(501),'invalid click','invalid/slash','invalid\u0000click'].map(click=>'fbclid='+encodeURIComponent(click))];
 for(const query of params){
  const next=run({url:'https://vanphuthanh.net/tu-bep/?'+query,prior:first.prior,measure:true});
  assert.equal(next.data.gclid,'');assert.equal(next.data.utm_source,'');assert.equal(next.data.utm_medium,'');
  assert.equal(next.data.fbclid,'');assert.equal(next.data.vpt_fbc,'');
  assert.equal(next.data.vpt_landing_page,'https://vanphuthanh.net/tu-bep/');
  assert.notEqual(next.prior.sid,first.prior.sid);
 }
 const valid=run({url:'https://vanphuthanh.net/tu-bep/?fbclid='+ 'x'.repeat(500),prior:first.prior,measure:true});
 assert.equal(valid.data.gclid,'');assert.equal(valid.data.fbclid.length,500);
 assert.equal(valid.data.vpt_fbc,`fb.1.${now}.${'x'.repeat(500)}`);
});
test('New external touch does not inherit previous paid click',()=>{
 const first=run({url:'https://vanphuthanh.net/?gclid=oldsynthetic&utm_source=google&utm_medium=cpc'});
 const next=run({ref:'https://www.google.com/',prior:first.prior});
 assert.equal(next.data.gclid,'');assert.equal(next.data.utm_medium,'organic');
});
test('Expired session and broken storage degrade without inventing SEO',()=>{
 assert.equal(run({prior:{expires:now-1,fields:{utm_source:'google',utm_medium:'organic'}}}).data.utm_medium,'');
 assert.equal(run({blocked:true}).data.utm_medium,'');assert.equal(run({blocked:true,ref:'https://www.google.com/'}).data.utm_medium,'organic');
});
test('Expired SEO session is not revived by internal navigation',()=>{
 assert.equal(run({ref:'https://vanphuthanh.net/tu-bep/',prior:{expires:now-1,fields:{utm_source:'google',utm_medium:'organic'}}}).data.utm_medium,'');
});
test('Organic form kept open retains source within TTL and clears all attribution after TTL',()=>{
 for(const blocked of [false,true]){
  const r=run({ref:'https://www.google.com/',blocked});
  r.advanceTime(29*60*1000);r.handlers.submit();
  assert.equal(r.data.utm_source,'google');assert.equal(r.data.utm_medium,'organic');
  assert.equal(r.attrs['data-vpt-attribution'],'ready');
  r.advanceTime(2*60*1000);r.handlers.submit();
  assert.ok(Object.values(r.data).every(value=>value===''));
  assert.equal(r.attrs['data-vpt-attribution'],'direct');assert.equal(r.prior,null);
 }
});
test('Paid form kept open retains complete bundle within TTL and clears it after TTL',()=>{
 for(const params of ['utm_source=google&utm_medium=cpc&gclid=synthetic&campaignid=synthetic-campaign','utm_source=chatgpt&utm_medium=paid&utm_content=synthetic-variant']){
  for(const blocked of [false,true]){
   const r=run({url:'https://vanphuthanh.net/?'+params,ref:'https://www.google.com/',blocked});
   const initial=r.data;
   r.advanceTime(29*60*1000);r.handlers.submit();assert.deepEqual(r.data,initial);
   r.advanceTime(2*60*1000);r.handlers.submit();
   assert.ok(Object.values(r.data).every(value=>value===''));
   assert.equal(r.attrs['data-vpt-attribution'],'direct');assert.equal(r.prior,null);
  }
 }
});
test('Restored source expires at original deadline when submitting an open form',()=>{
 const r=run({ref:'https://vanphuthanh.net/tu-bep/',prior:{expires:now+2*60*1000,fields:{utm_source:'google',utm_medium:'organic',vpt_landing_page:'https://vanphuthanh.net/tu-bep/'}}});
 r.advanceTime(60*1000);r.handlers.submit();assert.equal(r.data.utm_medium,'organic');
 assert.equal(r.prior.expires,now+2*60*1000);
 r.advanceTime(2*60*1000);r.handlers.submit();
 assert.ok(Object.values(r.data).every(value=>value===''));assert.equal(r.prior,null);
});
test('Attribution expires at the exact TTL boundary without reviving page query',()=>{
 const r=run({url:'https://vanphuthanh.net/?utm_source=google&utm_medium=cpc&gclid=synthetic'});
 r.advanceTime(30*60*1000);r.handlers.submit();
 assert.ok(Object.values(r.data).every(value=>value===''));assert.equal(r.prior,null);
 r.handlers.submit();assert.ok(Object.values(r.data).every(value=>value===''));
});
test('Measurement is queued request only and emits no contact/referrer data',()=>{
 const r=run({ref:'https://www.google.com/'});
 r.handlers.wpcf7submit({target:r.form,detail:{contactFormId:11116,apiResponse:{vpt_v1:{status:'queued',mode:'live',request_id:'synthetic-request',measurement_consent:true,consent_version:'VPT_ADS_V1'}}}});
 assert.equal(r.attrs['data-vpt-measurement'],'lead_request');
 assert.equal(r.window.dataLayer[0].event,'vpt_v1_lead_request');
 const out=JSON.stringify(r.window.dataLayer);assert.ok(!out.includes('vpt_referrer_host'));assert.ok(!out.includes('phone'));assert.ok(!out.includes('organic'));
});
test('Facebook ad click keeps fbclid and ad id utm for the form',()=>{
 const r=run({url:'https://vanphuthanh.net/tu-bep/?utm_source=facebook&utm_medium=paid&utm_campaign=120200000000001&utm_content=120200000000002&fbclid=synthetic-fb',ref:'https://l.facebook.com/'});
 assert.equal(r.data.fbclid,'synthetic-fb');assert.equal(r.data.utm_content,'120200000000002');
 assert.equal(r.data.utm_source,'facebook');assert.equal(r.attrs['data-vpt-attribution'],'ready');
});
test('Meta matching is empty without optional measurement choice and clears on expiry',()=>{
 const r=run({url:'https://vanphuthanh.net/?fbclid=actualClick_123',cookies:`_fbc=fb.1.${now-5000}.actualClick_123; _fbp=fb.1.${now-6000}.123456789`});
 assert.equal(r.data.vpt_fbc,'');assert.equal(r.data.vpt_fbp,'');
 r.handlers.change({target:{name:'your-ads-consent'}});assert.equal(r.data.vpt_fbc,'');
 const yes=run({url:'https://vanphuthanh.net/?fbclid=actualClick_123',measure:true,cookies:`_fbc=fb.1.${now-5000}.actualClick_123`});
 assert.equal(yes.data.vpt_fbc,`fb.1.${now-5000}.actualClick_123`);
 assert.equal(yes.data.vpt_fb_captured_at,new Date(now-5000).toISOString());
 yes.advanceTime(30*60*1000);yes.handlers.submit();assert.equal(yes.data.vpt_fbc,'');
});
test('URL matching keeps actual original click time across submit/navigation, never a later verify time',()=>{
 const r=run({url:'https://vanphuthanh.net/?fbclid=actualClick_123',measure:true});
 assert.equal(r.data.vpt_fbc,`fb.1.${now}.actualClick_123`);
 r.advanceTime(60000);r.handlers.submit();assert.equal(r.data.vpt_fb_captured_at,new Date(now).toISOString());
 const next=run({url:'https://vanphuthanh.net/tu-bep/',ref:'https://vanphuthanh.net/',prior:r.prior,measure:true});
 assert.equal(next.data.vpt_fbc,`fb.1.${now}.actualClick_123`);
});
test('Cookie from a different click and oversize click IDs cannot be joined to the source',()=>{
 const r=run({url:'https://vanphuthanh.net/?fbclid=newClick',measure:true,cookies:`_fbc=fb.1.${now-6000}.oldClick`});
 assert.equal(r.data.vpt_fbc,`fb.1.${now}.newClick`);
 const long=run({url:'https://vanphuthanh.net/?fbclid='+ 'x'.repeat(501),measure:true});
 assert.equal(long.data.fbclid,'');assert.equal(long.data.vpt_fbc,'');
});
test('Explicit declined measurement receipt neither queues Google conversion nor leaks matching IDs',()=>{
 const r=run({url:'https://vanphuthanh.net/?fbclid=actualClick',measure:true});
 r.handlers.wpcf7submit({target:r.form,detail:{contactFormId:11116,apiResponse:{vpt_v1:{status:'queued',mode:'live',request_id:'synthetic-request',measurement_consent:false}}}});
 assert.equal(r.attrs['data-vpt-crm-status'],'queued');
 assert.equal(r.attrs['data-vpt-ads-dispatch'],'consent_declined');assert.equal(r.window.dataLayer.length,0);
});
function clickOn(r,href){
 const beacons=[];r.window.navigator={sendBeacon(url,body){beacons.push({url,body:JSON.parse(body)});return true;}};
 r.handlers.click({target:{closest(){return {getAttribute(){return href;}};}}});
 return beacons;
}
test('Call, Zalo and Messenger clicks send one beacon per visit with the visit source',()=>{
 const r=run({url:'https://vanphuthanh.net/tu-bep/?utm_source=facebook&utm_medium=paid&utm_content=120200000000002&fbclid=synthetic-fb&keyword=private',ref:'https://l.facebook.com/'});
 const call=clickOn(r,'tel:0908309222');
 assert.equal(call.length,1);assert.equal(call[0].url,'https://tubep-backend.onrender.com/api/external/web-events');
 const b=call[0].body;assert.equal(b.kind,'call');assert.match(b.session_key,/^[0-9a-f]{32}$/);
 assert.equal(b.utm_content,'120200000000002');assert.equal(b.fbclid,'synthetic-fb');assert.equal(b.page_url,'https://vanphuthanh.net/tu-bep/');
 assert.equal(b.landing_url,'https://vanphuthanh.net/tu-bep/');assert.equal(b.referrer_host,'l.facebook.com');
 assert.equal(b.keyword,undefined);assert.doesNotMatch(JSON.stringify(b),/0908309222/);
 assert.equal(clickOn(r,'tel:0908309222').length,0);
 assert.equal(clickOn(r,'https://zalo.me/0908309222')[0].body.kind,'zalo');
 assert.equal(clickOn(r,'https://www.messenger.com/t/2083771045205323/')[0].body.kind,'messenger');
 assert.equal(clickOn(r,'https://m.me/somepage').length,0);
 assert.equal(clickOn(r,'https://vanphuthanh.net/lien-he/').length,0);
 assert.equal(r.window.dataLayer.filter(e=>/^vpt_click_/.test(e.event)).length,3);
});
test('Visit key survives internal navigation and expires with the source',()=>{
 const first=run({ref:'https://www.google.com/'});const sid=first.prior.sid;assert.match(sid,/^[0-9a-f]{32}$/);
 const next=run({ref:'https://vanphuthanh.net/tu-bep/',url:'https://vanphuthanh.net/lien-he/',prior:first.prior});
 assert.equal(next.prior.sid,sid);
 next.advanceTime(31*60*1000);const late=clickOn(next,'tel:0908309222')[0].body;
 assert.equal(late.utm_source,undefined);assert.equal(late.landing_url,undefined);
 const fresh=run({ref:'https://l.facebook.com/',prior:first.prior});assert.notEqual(fresh.prior.sid,sid);
});
test('Blocked storage still sends the click without throwing',()=>{
 const r=run({blocked:true});assert.equal(clickOn(r,'tel:0908309222').length,1);
});
// 0.3.1: Google Ads conversion only after the CRM confirmed the lead.
function confirmHarness(states, opts = {}) {
 const timers=[];const asked=[];
 const extra={setTimeout:(fn)=>{timers.push(fn);return timers.length;}};
 const win={fetch:(url)=>{asked.push(url);const state=states.shift()||'pending';return Promise.resolve({ok:true,json:()=>Promise.resolve({state})});}};
 const r=run({...opts,extra,win});
 const tick=async()=>{const fn=timers.shift();if(fn){fn();await new Promise(res=>setImmediate(res));await new Promise(res=>setImmediate(res));}};
 return {r,timers,asked,tick};
}
const RID='11111111-2222-4333-8444-555555555555';
const submit=(r,mode='live',proof={measurement_consent:true,consent_version:'VPT_ADS_V1'})=>r.handlers.wpcf7submit({target:r.form,detail:{contactFormId:11116,apiResponse:{vpt_v1:{status:'queued',mode,request_id:RID,...proof}}}});
const conversions=r=>r.window.dataLayer.filter(e=>e&&e[0]==='event'&&e[1]==='conversion');
test('Conversion waits for CRM confirmation and fires once',async()=>{
 const h=confirmHarness(['pending','confirmed']);submit(h.r);
 assert.equal(conversions(h.r).length,0);assert.equal(h.r.attrs['data-vpt-ads-dispatch'],'awaiting_crm');
 assert.equal(h.r.window.dataLayer[0].event,'vpt_v1_lead_request');
 await h.tick();assert.equal(conversions(h.r).length,0);
 await h.tick();assert.equal(conversions(h.r).length,1);
 assert.equal(h.asked[0],'/wp-json/vpt-v1/v1/receipt/'+RID);
 const c=conversions(h.r)[0][2];assert.equal(c.send_to,'AW-460207797/fC1UCJTQnYIdELXtuNsB');assert.equal(c.transaction_id,RID);
 assert.ok(h.r.window.dataLayer.some(e=>e.event==='vpt_v1_lead_confirmed'));
 assert.equal(h.r.attrs['data-vpt-ads-dispatch'],'confirmed');assert.equal(h.timers.length,0);
 submit(h.r);assert.equal(h.timers.length,0);
});
test('Failed or unknown CRM delivery never reports a conversion',async()=>{
 for(const state of ['failed','unknown']){
  const h=confirmHarness([state]);submit(h.r);await h.tick();
  assert.equal(conversions(h.r).length,0);assert.equal(h.r.attrs['data-vpt-ads-dispatch'],state);assert.equal(h.timers.length,0);
 }
});
test('Test mode confirms only to the diagnostic goal',async()=>{
 const h=confirmHarness(['confirmed']);submit(h.r,'test');await h.tick();
 assert.equal(conversions(h.r)[0][2].send_to,'AW-460207797/qwtDCI-6q4IdELXtuNsB');
});
test('Wait resumes on the next page of the visit and stops after 10 minutes',async()=>{
 const first=confirmHarness([]);submit(first.r);
 const pending=first.r.saved.get('vpt_v1_pending_conversions');assert.match(pending,new RegExp(RID));
 const next=confirmHarness(['confirmed'],{saved:[['vpt_v1_pending_conversions',pending]]});
 await next.tick();assert.equal(conversions(next.r).length,1);
 const late=confirmHarness(['pending'],{saved:[['vpt_v1_pending_conversions',pending]]});
 late.r.advanceTime(11*60*1000);await late.tick();assert.equal(conversions(late.r).length,0);assert.equal(late.timers.length,0);
});
test('Confirmation arriving at or after the deadline clears the wait without firing a conversion',async()=>{
 for(const elapsed of [10*60*1000,10*60*1000+1]){
  const timers=[];let respond;let asked=0;
  const r=run({extra:{setTimeout(fn){timers.push(fn);return timers.length;}},
   win:{fetch(){asked++;return new Promise(resolve=>{respond=resolve;});}}});
  submit(r);timers.shift()();assert.equal(asked,1);assert.equal(conversions(r).length,0);
  r.advanceTime(elapsed);respond({ok:true,json:()=>Promise.resolve({state:'confirmed'})});
  await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));
  assert.equal(conversions(r).length,0);assert.equal(r.attrs['data-vpt-ads-dispatch'],'timeout');
  assert.equal(r.saved.get('vpt_v1_pending_conversions'),'[]');assert.equal(timers.length,0);
 }
});

test('Missing/non-boolean measurement consent or wrong consent version never queues Google measurement',async()=>{
 const proofs=[{}, {consent_version:'VPT_ADS_V1'}, {measurement_consent:true},
  {measurement_consent:true,consent_version:'old'}, {measurement_consent:true,consent_version:null}];
 for(const value of [undefined,null,false,1,0,'true','false',[],{}])
  proofs.push({measurement_consent:value,consent_version:'VPT_ADS_V1'});
 for(const proof of proofs){
  const h=confirmHarness(['confirmed']);submit(h.r,'live',proof);await h.tick();
  assert.equal(conversions(h.r).length,0);assert.equal(h.r.window.dataLayer.length,0);
  assert.equal(h.asked.length,0);assert.equal(h.timers.length,0);
  assert.equal(h.r.saved.has('vpt_v1_pending_conversions'),false);
 }
});

test('Old, declined, wrong-version and expired pending entries clear without receiving or emitting conversions',async()=>{
 const stale={rid:RID,test:false,until:now+600000};
 for(const entry of [stale,{...stale,measurement_consent:false,consent_version:'VPT_ADS_V1'},
  {...stale,measurement_consent:'true',consent_version:'VPT_ADS_V1'},
  {...stale,measurement_consent:true,consent_version:'old'},
  {...stale,measurement_consent:true,consent_version:'VPT_ADS_V1',test:'true'},
  {...stale,measurement_consent:true,consent_version:'VPT_ADS_V1',until:String(now+600000)},
  {...stale,measurement_consent:true,consent_version:'VPT_ADS_V1',until:now+3600000},
  {...stale,measurement_consent:true,consent_version:'VPT_ADS_V1',until:now-1}]){
  const h=confirmHarness(['confirmed'],{saved:[['vpt_v1_pending_conversions',JSON.stringify([entry])]]});
  await h.tick();assert.equal(h.asked.length,0);assert.equal(conversions(h.r).length,0);
  assert.equal(h.timers.length,0);assert.equal(h.r.saved.get('vpt_v1_pending_conversions'),'[]');
 }
 const h=confirmHarness(['confirmed']);submit(h.r);
 const pending=JSON.parse(h.r.saved.get('vpt_v1_pending_conversions'));
 assert.equal(pending[0].measurement_consent,true);assert.equal(pending[0].consent_version,'VPT_ADS_V1');
});

test('Null/malformed pending records cannot stop confirmation of a valid approved record',async()=>{
 const entry={rid:RID,test:false,until:now+600000,measurement_consent:true,consent_version:'VPT_ADS_V1'};
 const h=confirmHarness(['confirmed'],{saved:[['vpt_v1_pending_conversions',JSON.stringify([null,{},'old',entry])]]});
 assert.equal(h.timers.length,1);await h.tick();assert.equal(conversions(h.r).length,1);
 assert.equal(h.r.saved.get('vpt_v1_pending_conversions'),'[]');
});
