'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createHmac}=require('node:crypto');
const {createLeadIntake}=require('../src/modules/marketingAutomation/facebookLeadIntake');
const src=fs.readFileSync(path.join(__dirname,'../src/routes/facebook.js'),'utf8').replace(/\r\n/g,'\n');
const hook=src.slice(src.indexOf("r.post('/webhook',"),src.indexOf('// ── HANDLE MESSENGER'));
const leadHandler=src.slice(src.indexOf('async function handleLeadGen('),src.indexOf('// ── HANDLE COMMENTS'));
const secret='isolated-webhook-secret',pages=new Set(['123']);
function harness({error=false,pending=null}={}){
 const calls=[],r={post:(_,fn)=>r.handler=fn},supabase={from:()=>{calls.push('db');throw Error('unexpected legacy access');}};
 const intake=createLeadIntake({db:{rpc:async()=>{calls.push('persist');if(pending)await pending;if(error)return{error:{}};return{data:1};}},isPrimary:()=>true,pages,secret:()=>secret});
 const context={r,supabase,facebookLeadIntake:{...intake,drain:()=>calls.push('drain')},DURABLE_MESSENGER_PAGES:new Set(),enqueueMessengerEvents:async()=>calls.push('messengerInbox'),messengerReceiptWorker:{drain:()=>calls.push('messengerDrain')},FB_DISABLE_WEBHOOK_LOGS:true,console:{log(){},warn(){},error(){}},handleMessaging:async()=>calls.push('message'),handleComment:async()=>calls.push('comment'),getPageConfig:async()=>{calls.push('legacy');return null;}};
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
