'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createHmac}=require('node:crypto');
const {createLeadIntake}=require('../src/modules/marketingAutomation/facebookLeadIntake');
const {createCustomerCare}=require('../src/modules/marketingAutomation/facebookCustomerCare');
const src=fs.readFileSync(path.join(__dirname,'../src/routes/facebook.js'),'utf8').replace(/\r\n/g,'\n');
const hook=src.slice(src.indexOf("r.post('/webhook',"),src.indexOf('// ── HANDLE MESSENGER'));
const leadHandler=src.slice(src.indexOf('async function handleLeadGen('),src.indexOf('// ── HANDLE COMMENTS'));
const secret='isolated-webhook-secret',pages=new Set(['123']);
function harness({error=false,pending=null,care=false,careError=false,carePending=null}={}){
 const calls=[],r={post:(_,fn)=>r.handler=fn},supabase={from:()=>{calls.push('db');throw Error('unexpected legacy access');}};
 const intake=createLeadIntake({db:{rpc:async()=>{calls.push('persist');if(pending)await pending;if(error)return{error:{}};return{data:1};}},isPrimary:()=>true,pages,secret:()=>secret});
 const customerCare=createCustomerCare({db:{rpc:async()=>{calls.push('carePersist');if(carePending)await carePending;if(careError)return{error:{code:'storage'}};return{data:1}}},isPrimary:()=>true,env:care?{VPT_FB_CARE_PAGES:'123',VPT_FACEBOOK_APP_SECRET:secret}:{}});
 const context={r,supabase,facebookCustomerCare:customerCare,facebookLeadIntake:{...intake,drain:()=>calls.push('drain')},DURABLE_MESSENGER_PAGES:new Set(),enqueueMessengerEvents:async()=>calls.push('messengerInbox'),messengerReceiptWorker:{drain:()=>calls.push('messengerDrain')},FB_DISABLE_WEBHOOK_LOGS:true,console:{log(){},warn(){},error(){}},handleMessaging:async()=>calls.push('message'),handleComment:async()=>calls.push('comment'),getPageConfig:async()=>{calls.push('legacy');return null;}};
 vm.runInNewContext(leadHandler+'\n'+hook,context);
 const body={object:'page',entry:[{id:'123',changes:[{field:'leadgen',value:{leadgen_id:'789',form_id:'456'}}]}]},raw=Buffer.from(JSON.stringify(body));
 const req={body,facebookRawBody:raw,headers:{'x-hub-signature-256':'sha256='+createHmac('sha256',secret).update(raw).digest('hex')}};
 const res={status:null,sendStatus(s){this.status=s;calls.push('ack'+s);return this;}};
 return{calls,req,res,run:()=>r.handler(req,res)};
}
test('real webhook handler persists before ACK and skips legacy Lead Ads',async()=>{const h=harness();await h.run();assert.deepEqual(h.calls,['persist','messengerInbox','ack200','messengerDrain','drain']);});
test('bad signature reaches neither Messenger inbox nor legacy processing',async()=>{const h=harness();h.req.headers={};await h.run();assert.deepEqual(h.calls,['ack403']);});
test('storage failure causes503, no ACK200 or fallback',async()=>{const h=harness({error:true});await h.run();assert.deepEqual(h.calls,['persist','ack503']);});
test('no early ACK while database write remains pending',async()=>{let done;const h=harness({pending:new Promise(r=>done=r)}),p=h.run();await Promise.resolve();assert.equal(h.res.status,null);done();await p;assert.equal(h.res.status,200);});
test('malformed signed event returns400 before any database write',async()=>{const h=harness();h.req.facebookRawBody=Buffer.from(JSON.stringify({object:'page',entry:[{id:'123',changes:[{field:'leadgen',value:{}}]}]}));h.req.headers['x-hub-signature-256']='sha256='+createHmac('sha256',secret).update(h.req.facebookRawBody).digest('hex');await h.run();assert.deepEqual(h.calls,['ack400']);});
function careMessage(h){const body={object:'page',entry:[{id:'123',messaging:[{sender:{id:'456'},recipient:{id:'123'},timestamp:Date.now(),message:{mid:'care-1',text:'Đừng nhắn tin'}}]}]};h.req.body=body;h.req.facebookRawBody=Buffer.from(JSON.stringify(body));h.req.headers['x-hub-signature-256']='sha256='+createHmac('sha256',secret).update(h.req.facebookRawBody).digest('hex');return h;}
test('real handler commits signed care before ACK and legacy processing',async()=>{const h=careMessage(harness({care:true}));await h.run();assert.deepEqual(h.calls,['carePersist','messengerInbox','ack200','messengerDrain','drain','message']);});
test('care signature failure stops all receipt and legacy side effects',async()=>{const h=careMessage(harness({care:true}));h.req.headers={};await h.run();assert.deepEqual(h.calls,['ack403']);});
test('care storage failure returns503 without legacy fallback',async()=>{const h=careMessage(harness({care:true,careError:true}));await h.run();assert.deepEqual(h.calls,['carePersist','ack503']);});
test('care storage pending cannot acknowledge delivery early',async()=>{let done;const h=careMessage(harness({care:true,carePending:new Promise(r=>done=r)})),p=h.run();await Promise.resolve();assert.deepEqual(h.calls,['carePersist']);assert.equal(h.res.status,null);done();await p;assert.equal(h.res.status,200);});
test('every existing app Messenger sender blocks enrolled Pages before provider access',async()=>{
 const care=createCustomerCare({db:{},isPrimary:()=>true,env:{VPT_FB_CARE_PAGES:'123'}});
 for(const [name,args] of [['sendMessengerReply',['123','456','text']],['sendMessengerAttachment',['123','456','image','url']],['uploadMessengerAttachmentBuffer',['123']],['sendMessengerAttachmentById',['123']],['createMessengerImageSender',[{page_id:'123'}]]]){
  const start=src.indexOf('async function '+name+'('),fn=src.slice(start,src.indexOf('\n}',start)+2),calls=[];
  const context={facebookCustomerCare:care,getPageConfig:async()=>calls.push('config'),fetch:async()=>calls.push('provider')};
  vm.runInNewContext(fn,context);await assert.rejects(context[name](...args),e=>e.code==='CARE_SEND_NOT_ENABLED');assert.deepEqual(calls,[]);
 }
});
