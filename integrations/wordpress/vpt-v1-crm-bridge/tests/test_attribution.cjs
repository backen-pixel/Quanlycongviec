// Browser-independent tests of actual shipped script with synthetic fields only.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname,'../attribution.js'),'utf8');
const now = 1791302400000;
function run({url='https://vanphuthanh.net/tu-bep/',ref='',prior=null,blocked=false}={}) {
 const location = new URL(url), fields={}, attrs={}, handlers={}, saved=new Map();
 let clock=now;
 if(prior) saved.set('vpt_v1_attribution_session',JSON.stringify(prior));
 const names=['utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','gbraid','wbraid','campaignid','adgroupid','keyword','matchtype','device','vpt_referrer_host','vpt_landing_page'];
 names.forEach(k=>fields[k]={value:''});
 const form={querySelector(s){const n=s.match(/name="([^"]+)"/)[1];return n==='vpt_form'?{value:'VPT_V1'}:fields[n];},setAttribute(k,v){attrs[k]=v;}};
 const document={referrer:ref,readyState:'complete',querySelectorAll(){return[form]},addEventListener(k,v){handlers[k]=v;}};
 const storage={getItem(k){if(blocked)throw Error('blocked');return saved.get(k)||null;},setItem(k,v){if(blocked)throw Error('blocked');saved.set(k,v);},removeItem(k){if(blocked)throw Error('blocked');saved.delete(k);}};
 const window={location,dataLayer:[]};
 vm.runInNewContext(script,{window,document,sessionStorage:storage,URL,URLSearchParams,Date:{now:()=>clock}});
 return {get data(){return Object.fromEntries(names.map(k=>[k,fields[k].value]));},attrs,handlers,window,get prior(){return JSON.parse(saved.get('vpt_v1_attribution_session')||'null');},form,advanceTime(ms){clock+=ms;}};
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
