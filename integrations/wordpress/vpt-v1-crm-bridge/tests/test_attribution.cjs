// Browser-independent tests of actual shipped script with synthetic fields only.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname,'../attribution.js'),'utf8');
const now = 1791302400000;
function run({url='https://vanphuthanh.net/tu-bep/',ref='',prior=null,blocked=false,saved:seed=null,extra={},win={},missing=[],marker='VPT_V1'}={}) {
 const location = new URL(url), fields={}, attrs={}, handlers={}, saved=new Map();
 let clock=now;
 if(prior) saved.set('vpt_v1_attribution_session',JSON.stringify(prior));
 if(seed) for(const [k,v] of seed) saved.set(k,v);
 const names=['utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','fbclid','ttclid','gbraid','wbraid','campaignid','adgroupid','keyword','matchtype','device','vpt_referrer_host','vpt_landing_page'];
 names.filter(k=>!missing.includes(k)).forEach(k=>fields[k]={value:''});
 const added=[];
 const form={querySelector(s){const n=s.match(/name="([^"]+)"/)[1];return n==='vpt_form'?(marker?{value:marker}:null):fields[n];},setAttribute(k,v){attrs[k]=v;},appendChild(field){added.push(field);fields[field.name]=field;}};
 const document={referrer:ref,readyState:'complete',querySelectorAll(){return[form]},addEventListener(k,v){handlers[k]=v;},createElement(tag){assert.equal(tag,'input');return {value:''};}};
 const storage={getItem(k){if(blocked)throw Error('blocked');return saved.get(k)||null;},setItem(k,v){if(blocked)throw Error('blocked');saved.set(k,v);},removeItem(k){if(blocked)throw Error('blocked');saved.delete(k);}};
 const window={location,dataLayer:[],...win};
 vm.runInNewContext(script,{window,document,sessionStorage:storage,URL,URLSearchParams,Date:{now:()=>clock},...extra});
 return {saved,added,get data(){return Object.fromEntries(names.map(k=>[k,fields[k]?.value]));},attrs,handlers,window,get prior(){return JSON.parse(saved.get('vpt_v1_attribution_session')||'null');},form,advanceTime(ms){clock+=ms;}};
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
 r.handlers.wpcf7submit({target:r.form,detail:{contactFormId:11116,apiResponse:{vpt_v1:{status:'queued',mode:'live',request_id:'synthetic-request'}}}});
 assert.equal(r.attrs['data-vpt-measurement'],'lead_request');
 assert.equal(r.window.dataLayer[0].event,'vpt_v1_lead_request');
 const out=JSON.stringify(r.window.dataLayer);assert.ok(!out.includes('vpt_referrer_host'));assert.ok(!out.includes('phone'));assert.ok(!out.includes('organic'));
});
test('Facebook ad click keeps fbclid and ad id utm for the form',()=>{
 const r=run({url:'https://vanphuthanh.net/tu-bep/?utm_source=facebook&utm_medium=paid&utm_campaign=120200000000001&utm_content=120200000000002&fbclid=synthetic-fb',ref:'https://l.facebook.com/'});
 assert.equal(r.data.fbclid,'synthetic-fb');assert.equal(r.data.utm_content,'120200000000002');
 assert.equal(r.data.utm_source,'facebook');assert.equal(r.attrs['data-vpt-attribution'],'ready');
});
test('TikTok click ID is present for old CF7 templates, without changing source or adding duplicates',()=>{
 const r=run({url:'https://vanphuthanh.net/?utm_source=TikTok&utm_medium=paid&ttclid=synthetic-tt',missing:['ttclid']});
 assert.equal(r.data.ttclid,'synthetic-tt');assert.equal(r.data.utm_source,'TikTok');
 assert.equal(r.added.length,1);assert.equal(r.added[0].type,'hidden');
 r.handlers.submit();assert.equal(r.added.length,1);
 const existing=run({url:'https://vanphuthanh.net/?ttclid=synthetic-tt'});
 assert.equal(existing.data.ttclid,'synthetic-tt');assert.equal(existing.added.length,0);
 for(const marker of ['OTHER',null]){
  const other=run({url:'https://vanphuthanh.net/?ttclid=synthetic-tt',missing:['ttclid'],marker});
  assert.equal(other.added.length,0);assert.equal(other.data.ttclid,undefined);
 }
});
test('TikTok and Zalo paid, organic and QA UTMs stay raw for backend classification',()=>{
 for(const source of ['tiktok','zalo','vpt_test']){
  for(const medium of ['paid','organic','']){
   const r=run({url:'https://vanphuthanh.net/?utm_source='+source+'&utm_medium='+medium+(source==='vpt_test'?'&ttclid=synthetic-qa':'')});
   assert.equal(r.data.utm_source,source);assert.equal(r.data.utm_medium,medium);
   assert.equal(r.data.ttclid,source==='vpt_test'?'synthetic-qa':'');
   const body=clickOn(r,'https://zalo.me/synthetic')[0].body;
   assert.equal(body.utm_source,source);assert.equal(body.utm_medium,medium||undefined);
  }
 }
});
test('TikTok click ID survives internal navigation, then clears on a new campaign or external touch',()=>{
 const first=run({url:'https://vanphuthanh.net/?utm_source=tiktok&utm_medium=paid&ttclid=synthetic-tt'});
 const next=run({url:'https://vanphuthanh.net/lien-he/',ref:'https://vanphuthanh.net/',prior:first.prior});
 assert.equal(next.data.ttclid,'synthetic-tt');assert.equal(next.prior.expires,first.prior.expires);
 assert.equal(clickOn(next,'tel:0908309222')[0].body.ttclid,'synthetic-tt');
 for(const params of ['utm_source=tiktok&utm_medium=organic','utm_source=zalo&utm_medium=paid','gclid=synthetic-google']){
  const replaced=run({url:'https://vanphuthanh.net/?'+params,prior:first.prior});
  assert.equal(replaced.data.ttclid,'');assert.equal(clickOn(replaced,'tel:0908309222')[0].body.ttclid,undefined);
 }
 const external=run({ref:'https://www.google.com/',prior:first.prior});
 assert.equal(external.data.ttclid,'');assert.equal(external.data.utm_medium,'organic');
 const google=run({url:'https://vanphuthanh.net/?gclid=synthetic-google&utm_source=google&utm_medium=cpc'});
 const tik=run({url:'https://vanphuthanh.net/?ttclid=synthetic-tt',prior:google.prior});
 assert.equal(tik.data.gclid,'');assert.equal(tik.data.utm_source,'');assert.equal(tik.data.ttclid,'synthetic-tt');
});
test('TikTok click ID is sanitized, bounded to 512 characters, and expires at the original TTL',()=>{
 for(const blocked of [false,true]){
  const r=run({url:'https://vanphuthanh.net/?ttclid=%01'+('x'.repeat(520)),blocked});
  assert.equal(r.data.ttclid,'x'.repeat(512));
  r.advanceTime(29*60*1000);r.handlers.submit();assert.equal(r.data.ttclid.length,512);
  r.advanceTime(60*1000);r.handlers.submit();assert.equal(r.data.ttclid,'');
  const late=clickOn(r,'tel:0908309222')[0].body;assert.equal(late.ttclid,undefined);
 }
 const restored=run({ref:'https://vanphuthanh.net/',prior:{expires:now+1000,fields:{ttclid:'synthetic-tt'}}});
 restored.advanceTime(1000);restored.handlers.submit();assert.equal(restored.data.ttclid,'');
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
const submit=(r,mode='live')=>r.handlers.wpcf7submit({target:r.form,detail:{contactFormId:11116,apiResponse:{vpt_v1:{status:'queued',mode,request_id:RID}}}});
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
