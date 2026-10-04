'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { fork } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { createWorkerDrain, createWorkerGroup } = require('../src/helpers/workerDrain');
const { createProcessWork } = require('../src/helpers/processWork');
const { installWorkerShutdown, configureWorkerShutdown } = require('../src/helpers/workerShutdown');
function gate() { let resolve, reject; const promise = new Promise((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; }
const flush = () => new Promise(resolve => setImmediate(resolve));
function timers() {
 const intervals = [], immediates = [], cleared = [];
 const make = (list, fn) => { const t = { fn, unref() { this.unreferenced = true; } }; list.push(t); return t; };
 return { intervals, immediates, cleared, setInterval: fn => make(intervals, fn), setImmediate: fn => make(immediates, fn),
  clearInterval: t => cleared.push(t), clearImmediate: t => cleared.push(t) };
}
test('group owns timer/immediate and ignores callbacks already queued when stopped', async () => {
 const t = timers(); let calls = 0;
 const w = createWorkerDrain(() => { calls++; }), group = createWorkerGroup({ w }, { timers: t });
 group.schedule(['w'], 5000); assert.equal(t.intervals[0].unreferenced, true); assert.equal(t.immediates[0].unreferenced, true);
 group.stop(); for (const x of [...t.intervals, ...t.immediates]) x.fn(); await flush();
 assert.equal(calls, 0); assert.equal(t.cleared.length, 2); assert.equal(group.schedule(['w'], 1), false);
 assert.equal(group.status().processesDrained, false); assert.equal(group.status().notCovered.length, 4);
});
test('scheduler snapshots membership/names and catches sync, async and logger failures', async () => {
 const t = timers(), errors = []; let a = 0, b = 0;
 const wrap = drain => ({ drain, stop() {}, waitForIdle: async () => ({}), status: () => ({}) });
 const workers = { a: wrap(() => { a++; throw Error('private'); }), b: wrap(async () => { b++; throw Error('private'); }) };
 const group = createWorkerGroup(workers, { timers: t, onError: async n => { errors.push(n); throw Error('logger'); } });
 const names = ['a', 'b']; group.schedule(names, 100); names.length = 0; workers.a = null; workers.b = null;
 t.immediates[0].fn(); await flush(); assert.equal(a, 1); assert.equal(b, 1); assert.deepEqual(errors.sort(), ['a', 'b']); group.stop();
});
test('group stops every worker even when a member throws; schedule inputs stay bounded', () => {
 let otherStopped = false;
 const a = { drain() {}, stop() { throw Error('private'); }, waitForIdle() {}, status() { return {}; } };
 const b = { ...a, stop() { otherStopped = true; } }, group = createWorkerGroup({ a, b });
 for (const delay of [0, -1, 2147483648, NaN, '10']) assert.throws(() => group.schedule(['a'], delay), TypeError);
 for (const names of [[], ['a', 'a'], ['missing'], null]) assert.throws(() => group.schedule(names, 1), TypeError);
 assert.throws(() => group.stop(), AggregateError); assert.equal(otherStopped, true); assert.equal(group.status().stopped, true);
});
function harness({ workers, timeoutMs = 1000, holdHttp = false, holdSocket = false, serverError, stopHook, onReport } = {}) {
 const proc = new EventEmitter(), exits = [], reports = [], calls = []; let httpClose, socketClose;
 workers ||= createWorkerGroup({ a: createWorkerDrain(() => {}) });
 const options = { workers, timeoutMs, processLike: proc, revision: 'a'.repeat(40), exit: code => exits.push(code),
  server: { close(cb) { calls.push('http'); httpClose = cb; if (stopHook) stopHook(); if (serverError) throw Error('secret'); if (!holdHttp) cb(); }, closeIdleConnections() { calls.push('idle'); } },
  io: { close(cb) { calls.push('socket'); socketClose = cb; if (!holdSocket) cb(); } },
  onReport: report => { reports.push(report); return onReport?.(report); } };
 const shutdown = installWorkerShutdown(options);
 return { shutdown, workers, proc, exits, reports, calls, options, closeHttp: e => httpClose(e), closeSocket: () => socketClose() };
}
test('default-off configuration installs no signal handlers; only explicit 1 enables', () => {
 const proc = new EventEmitter();
 for (const value of [undefined, '', 'true', '0', 1]) assert.equal(configureWorkerShutdown({ env: { VPT_WORKER_SHUTDOWN: value }, processLike: proc }), null);
 assert.equal(proc.listenerCount('SIGTERM'), 0);
 const h = harness(); const p = new EventEmitter();
 assert.ok(configureWorkerShutdown({ ...h.options, processLike: p, env: { VPT_WORKER_SHUTDOWN: '1' } }));
 assert.equal(p.listenerCount('SIGTERM'), 1); assert.equal(p.listenerCount('SIGINT'), 1);
});
test('shutdown stops every worker synchronously and waits through result persistence and network close', async () => {
 const entered = gate(), result = gate();
 const a = createWorkerDrain(async () => { entered.resolve(); await result.promise; });
 const b = createWorkerDrain(() => {}), workers = createWorkerGroup({ a, b });
 const run = a.drain(); await entered.promise;
 const h = harness({ workers, holdHttp: true, holdSocket: true });
 const pending = h.shutdown.begin('SIGTERM'); assert.equal(a.isStopped(), true); assert.equal(b.isStopped(), true);
 assert.deepEqual(h.calls, ['http', 'idle', 'socket']); assert.equal(h.shutdown.isStopping(), true);
 h.closeHttp(); h.closeSocket(); await flush(); assert.deepEqual(h.exits, []);
 result.resolve(); await run; const report = await pending;
 assert.deepEqual(h.exits, [0]); assert.equal(report.workers.locallyDrained, true); assert.equal(report.processesDrained, false);
 assert.equal(report.processTerminationRequired, true); assert.equal(report.revision, 'a'.repeat(40));
});
test('drained workers do not bypass still-open HTTP or socket connections', async () => {
 const h = harness({ holdHttp: true, holdSocket: true }); const pending = h.shutdown.begin();
 await flush(); assert.deepEqual(h.exits, []); h.closeHttp(); await flush(); assert.deepEqual(h.exits, []);
 h.closeSocket(); const report = await pending; assert.equal(report.timedOut, false); assert.deepEqual(h.exits, [0]);
});
test('SIGTERM/SIGINT and reentrant begin share one stop/report/exit', async () => {
 let h, reentrant; const workers = createWorkerGroup({ a: createWorkerDrain(() => {}) });
 let stops = 0; const stop = workers.stop; workers.stop = () => { stops++; return stop(); };
 h = harness({ workers, holdHttp: true, stopHook: () => { reentrant = h.shutdown.begin('SIGINT'); } });
 h.proc.emit('SIGTERM'); const pending = h.shutdown.begin(); h.proc.emit('SIGINT');
 assert.equal(reentrant, pending); assert.equal(stops, 1); h.closeHttp(); await pending;
 assert.equal(h.reports.length, 1); assert.deepEqual(h.exits, [0]); assert.equal(h.reports[0].signal, 'SIGTERM');
 assert.equal(h.shutdown.begin(), pending);
});
test('deadline retains active work; late completion never reports or exits a second time', async () => {
 const entered = gate(), result = gate(), a = createWorkerDrain(async () => { entered.resolve(); await result.promise; });
 const run = a.drain(); await entered.promise; const h = harness({ workers: createWorkerGroup({ a }), timeoutMs: 10, holdHttp: true });
 const report = await h.shutdown.begin(); assert.equal(report.timedOut, true); assert.equal(a.status().active, true);
 assert.equal(report.workers.locallyDrained, false); assert.equal(report.processesDrained, false); assert.deepEqual(h.exits, [1]);
 result.resolve(); await run; h.closeHttp(); await flush(); assert.equal(h.reports.length, 1); assert.deepEqual(h.exits, [1]);
});
test('shutdown admission returns retryable 503 before downstream handler runs', async () => {
 const h = harness({ holdHttp: true }); let next = 0; const headers = {}, res = {
  setHeader(k, v) { headers[k] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
 h.shutdown.middleware({}, res, () => next++); assert.equal(next, 1); const pending = h.shutdown.begin();
 h.shutdown.middleware({}, res, () => next++); assert.equal(next, 1); assert.equal(res.code, 503); assert.equal(res.body.code, 'SERVER_STOPPING');
 assert.deepEqual(headers, { Connection: 'close', 'Retry-After': '30' }); h.closeHttp(); await pending;
});
for (const failure of ['stop', 'wait', 'status', 'http', 'httpCallback', 'idle', 'socket', 'socketCallback', 'socketAsync', 'socketCallbackThenReject']) test(`shutdown ${failure} error never reports clean completion or leaks raw errors`, async () => {
 const workers = createWorkerGroup({ a: createWorkerDrain(() => {}) });
 if (failure === 'stop') workers.stop = () => { throw Error('secret'); };
 if (failure === 'wait') workers.waitForIdle = async () => { throw Error('secret'); };
 if (failure === 'status') { workers.waitForIdle = () => new Promise(() => {}); workers.status = () => { throw Error('secret'); }; }
 const h = harness({ workers, timeoutMs: 10, serverError: failure === 'http', holdHttp: failure === 'httpCallback', onReport: async () => { throw Error('secret'); } });
 if (failure === 'idle') h.options.server.closeIdleConnections = () => { throw Error('secret'); };
 if (failure === 'socket') h.options.io.close = () => { throw Error('secret'); };
 if (failure === 'socketCallback') h.options.io.close = cb => cb(Error('secret'));
 if (failure === 'socketAsync') h.options.io.close = async () => { throw Error('secret'); };
 if (failure === 'socketCallbackThenReject') h.options.io.close = async cb => { cb(); await Promise.resolve(); throw Error('secret'); };
 const pending = h.shutdown.begin(); if (failure === 'httpCallback') h.closeHttp(Error('secret'));
 const report = await pending; await flush(); assert.ok(report.errors.length); assert.equal(report.processesDrained, false);
 assert.equal(report.scope, 'REGISTERED_WORKERS_THIS_PROCESS'); assert.deepEqual(h.exits, [1]); assert.ok(!JSON.stringify(report).includes('secret'));
  assert.equal(report.notCovered.length, 4); if (failure === 'status') assert.equal(report.timedOut, true);
});
test('already-closed HTTP server is harmless and untrusted revision/signal are omitted', async () => {
 const h = harness({ holdHttp: true }); h.options.revision = 'secret';
 h.options.io.close = async cb => cb({ code: 'ERR_SERVER_NOT_RUNNING' });
 const shutdown = installWorkerShutdown({ ...h.options, processLike: new EventEmitter() });
 const pending = shutdown.begin('secret'); h.closeHttp({ code: 'ERR_SERVER_NOT_RUNNING' }); const r = await pending;
 assert.equal(r.revision, null); assert.equal(r.signal, 'INTERNAL'); assert.deepEqual(r.errors, []);
 for (const timeoutMs of [0, -1, 30001, '10', NaN]) assert.throws(() => installWorkerShutdown({ timeoutMs }), TypeError);
});
test('group rechecks members when an active worker spawns a child in a previously idle member', async () => {
 const parent=gate(),child=gate(),entered=gate(),legacy=createProcessWork({scope:'LEGACY'});
 const worker=createWorkerDrain(async()=>{entered.resolve();await parent.promise;legacy.track(child.promise);});
 const run=worker.drain();await entered.promise;const group=createWorkerGroup({legacy,worker});group.stop();
 let completed=false;const waiting=group.waitForIdle({timeoutMs:1000}).then(r=>{completed=true;return r;});
 parent.resolve();await run;await flush();assert.equal(completed,false);assert.equal(legacy.status().active,true);
 child.resolve();const r=await waiting;assert.equal(r.timedOut,false);assert.equal(r.locallyDrained,true);
});
test('late child shares the original group deadline and cannot get a fresh full timeout',async()=>{
 const child=gate(),legacy=createProcessWork({scope:'LEGACY'}),parent=gate(),entered=gate();
 const worker=createWorkerDrain(async()=>{entered.resolve();await parent.promise;legacy.track(child.promise);});const run=worker.drain();await entered.promise;
 const group=createWorkerGroup({legacy,worker});group.stop();const waiting=group.waitForIdle({timeoutMs:10});parent.resolve();await run;
 const r=await waiting;assert.equal(r.timedOut,true);assert.equal(r.locallyDrained,false);assert.equal(legacy.status().active,true);child.resolve();await legacy.waitForIdle();
});
test('shutdown refuses success when a worker observation says it is not drained',async()=>{
 const h=harness({workers:{stop(){},status(){return{active:true,locallyDrained:false};},async waitForIdle(){return{locallyDrained:false,timedOut:false};}}});
 const r=await h.shutdown.begin();assert.deepEqual(h.exits,[1]);assert.ok(r.errors.includes('WORKERS_NOT_DRAINED'));
});
test('router registers durable and legacy lifecycle handles under the existing scheduling flags', async () => {
 const source = fs.readFileSync(path.join(__dirname, '../src/routes/facebook.js'), 'utf8');
 const start = source.indexOf('// One registry owns'), end = source.indexOf('// ═', start); assert.ok(start > 0 && end > start);
 const t = timers(), workers = [], fake = () => { const w = createWorkerDrain(() => {}); workers.push(w); return w; };
 const intake = fake(); intake.pages = new Set(['synthetic']);
 const context = { r: {}, supabase: {}, DURABLE_MESSENGER_PAGES: new Set(['synthetic']), handleMessaging() {}, console,
  createMessengerReceiptWorker: fake, createWorkerGroup: w => createWorkerGroup(w, { timers: t }),
  facebookLeadIntake: intake, facebookLeadCensus: fake(), facebookSurveyDispatch: fake(), facebookSurveyOutcomes: fake(), facebookCareRuntime: fake(),
  legacyWork: createProcessWork({ scope: 'FACEBOOK_LEGACY_THIS_PROCESS' }), autoTool: { shutdown: fake() },
  autoPipelineStates: new Map(), clearFbMasterScheduleTimer() {}, stopScanTimer() {}, clearRescanPhonesScheduleTimer() {},
  require: name => { assert.ok(/cronLeader|batchQueue|fbMarketingSyncRunner/.test(name)); return { shutdown: fake() }; },
  process: { env: { VPT_SURVEY_CONFIRMATIONS: '1', VPT_CARE_RUNTIME: '1' } } };
 vm.runInNewContext(source.slice(start, end), context);
 assert.equal(t.intervals.length, 4); assert.equal(t.immediates.length, 4); context.r.workerDrainGroup.stop();
 assert.equal(workers.length, 10); assert.ok(workers.every(w => w.isStopped()));
 assert.equal(context.legacyWork.isStopped(), true);
 assert.equal((await context.r.workerDrainGroup.waitForIdle()).locallyDrained, true);
 const server = fs.readFileSync(path.join(__dirname, '../src/server.js'), 'utf8');
 assert.ok(server.indexOf('workerShutdown.middleware') < server.indexOf("app.use('/api"));
 assert.equal((server.match(/configureWorkerShutdown\(/g) || []).length, 1);
 assert.ok(server.includes('workers: facebookRouter.workerDrainGroup'));
});

for (const mode of ['persist', 'timeout']) test(`native process signals: ${mode} keeps the in-flight receipt and exits once`, { skip: process.platform === 'win32', timeout: 15000 }, async () => {
 const child = fork(path.join(__dirname, 'fixtures/workerShutdown.child.cjs'), [mode], { silent: true, execArgv: [] });
 let stdout = '', stderr = '', signalled = false, released = false;
 const events = []; let buffer = '';
 child.stderr.on('data', chunk => { stderr += chunk; });
 child.stdout.on('data', chunk => {
  stdout += chunk; buffer += chunk;
  let index;
  while ((index = buffer.indexOf('\n')) >= 0) {
   const row = JSON.parse(buffer.slice(0, index)); buffer = buffer.slice(index + 1); events.push(row);
   if (row.event === 'STOPPED_ADMISSION' && mode === 'persist' && !released) {
    released = true; child.kill('SIGINT'); child.send('release');
   }
  }
 });
 const done = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal })); });
 const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
 child.on('message', message => { if (message.event === 'READY' && !signalled) { signalled = true; child.kill('SIGTERM'); } });
 try {
  const exit = await done; assert.equal(exit.signal, null, stderr + stdout); assert.equal(exit.code, mode === 'persist' ? 0 : 1, stderr + stdout);
  assert.equal(events.filter(x => x.event === 'STOPPED_ADMISSION').length, 1); const reports = events.filter(x => x.event === 'REPORT'); assert.equal(reports.length, 1);
  assert.equal(reports[0].report.processesDrained, false); assert.equal(reports[0].report.timedOut, mode === 'timeout');
  assert.equal(events.some(x => x.event === 'PERSISTED'), mode === 'persist');
  assert.equal(reports[0].report.workers.members.receipt.active, mode === 'timeout');
  if (mode === 'persist') assert.ok(events.findIndex(x => x.event === 'PERSISTED') < events.findIndex(x => x.event === 'REPORT'));
 } finally { clearTimeout(timer); if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); }
});
