'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {createProcessWork}=require('../src/helpers/processWork');
const {trackRouterHandlers}=require('../src/helpers/trackedRouter');
const gate=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
function request(server,path,method='POST'){
 return new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port:server.address().port,path,method,agent:false},res=>{let body='';res.on('data',x=>{body+=x;});res.on('end',()=>resolve({status:res.statusCode,body}));});req.on('error',reject);req.end();});
}
test('Express 5 actual router: ACK does not release handler/child work; stopped admission is 503', {skip:process.env.VPT_EXPRESS_TEST!=='1',timeout:10000},async t=>{
 const express=require('express'),app=express(),router=express.Router(),work=createProcessWork({scope:'EXPRESS_TEST'}),parent=gate(),child=gate();
 trackRouterHandlers(router,work);let invoked=0;
 router.post('/webhook',[(req,res,next)=>{req.synthetic=true;next();},async(req,res)=>{
  assert.equal(req.synthetic,true);invoked++;res.status(200).send('ACK');await parent.promise;work.track(child.promise);
 }]);
 app.use(router);app.use((error,req,res,next)=>{if(res.headersSent)return next(error);res.status(error.status||500).send(error.code||'ERROR');});
 const server=http.createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 assert.equal((await request(server,'/webhook')).status,200);work.stop();assert.equal((await work.waitForIdle({timeoutMs:1})).timedOut,true);
 parent.resolve();await new Promise(resolve=>setImmediate(resolve));assert.equal(work.status().activeCount,1);
 const blocked=await request(server,'/webhook');assert.equal(blocked.status,503);assert.equal(blocked.body,'PROCESS_STOPPING');assert.equal(invoked,1);
 child.resolve();assert.equal((await work.waitForIdle({timeoutMs:1000})).locallyDrained,true);assert.equal(work.status().processesDrained,false);
});
test('Express 5 actual router: rejected async handlers reach error middleware once', {skip:process.env.VPT_EXPRESS_TEST!=='1',timeout:10000},async t=>{
 const express=require('express'),app=express(),router=express.Router(),work=createProcessWork({scope:'EXPRESS_TEST'});let errors=0;
 trackRouterHandlers(router,work);router.get('/error',async()=>{throw Object.assign(Error('synthetic'),{status:409});});
 app.use(router);app.use((error,req,res,next)=>{errors++;res.status(error.status).end();});
 const server=http.createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 assert.equal((await request(server,'/error','GET')).status,409);assert.equal(errors,1);work.stop();assert.equal((await work.waitForIdle()).locallyDrained,true);
});
test('Express 5 nested handlers remain tracked after client disconnect and HTTP close', {skip:process.env.VPT_EXPRESS_TEST!=='1',timeout:10000},async t=>{
 const express=require('express'),app=express(),parent=express.Router(),child=express.Router(),work=createProcessWork({scope:'FACEBOOK_TEST'});
 const entered=gate(),rpc=gate(),closed=gate();let persisted=0;
 trackRouterHandlers(parent,work);trackRouterHandlers(child,work);
 child.post('/commit',async(req,res)=>{res.once('close',()=>closed.resolve());entered.resolve();await rpc.promise;persisted++;res.end('done');});
 parent.use('/lead-intake',child);app.use('/facebook',parent);
 const server=http.createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{rpc.resolve();server.close();});
 const req=http.request({host:'127.0.0.1',port:server.address().port,path:'/facebook/lead-intake/commit',method:'POST',agent:false});req.on('error',()=>{});req.end();
 await entered.promise;req.destroy();await closed.promise;work.stop();await new Promise(resolve=>server.close(resolve));
 assert.equal((await work.waitForIdle({timeoutMs:0})).timedOut,true);assert.equal(persisted,0);rpc.resolve();assert.equal((await work.waitForIdle({timeoutMs:1000})).locallyDrained,true);assert.equal(persisted,1);
});
