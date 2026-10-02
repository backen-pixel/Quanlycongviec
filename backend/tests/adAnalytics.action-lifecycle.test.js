// Exercises actual report effect and action callbacks with controlled asynchronous completions.
// Synthetic dependency harness; browser and CRM acceptance require separate evidence.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const sourcePath = process.env.REVIEW_UI_SOURCE || path.resolve(__dirname, '../../frontend/src/pages/AdAnalyticsPage.jsx');
const source = fs.readFileSync(sourcePath, 'utf8');
const flush = () => new Promise(setImmediate);
function callback(name, deps) {
  const marker = `const ${name} = useCallback(`;
  const start = source.indexOf(marker), finish = source.indexOf(`, [${deps}]);`, start);
  assert.ok(start >= 0 && finish > start, `Locate actual ${name}`);
  return '(' + source.slice(start + marker.length, finish) + ')';
}
const effectEnd = source.indexOf('}, [tai]);');
const effectStart = source.lastIndexOf('useEffect(', effectEnd);
assert.ok(effectStart >= 0 && effectEnd > effectStart);
const effect = '(' + source.slice(effectStart + 'useEffect('.length, effectEnd + 1) + ')';
const onDone = source.match(/onXong=\{(async \(\) => \{[^\n]+?)\} \/>/)?.[1];
assert.ok(onDone, 'Locate actual marketing completion callback');
function harness() {
  const state = {}, requests = [], actions = [];
  const reportRequestId = { current: 0 }, refreshReportRef = { current: null };
  let cleanup;
  const api = {
    get(url, options) { return new Promise(resolve => requests.push({url, company: options.params.company_id, resolve, done:false})); },
    put(url) { return new Promise(resolve => actions.push({url, resolve})); },
    post(url) { return new Promise(resolve => actions.push({url, resolve})); },
  };
  function mount(company) {
    cleanup?.();
    const context = {api, params:{company_id:company}, tab:'campaigns', reportRequestId, refreshReportRef,
      tenMoi:'Synthetic name', tenLo:'Synthetic bulk', chon:new Set(['synthetic-ad']),
      taiMkt: () => new Promise(resolve => actions.push({url:'synthetic-marketing-read', resolve}))};
    for (const key of ['setDangTai','setLoi','setTongQuan','setRows','setNhanXet','setTomTat','setTinhLuc',
      'setDangLuu','setDangSua','setTenMoi','setChon','setTenLo','setDangChayLai']) context[key] = value => {state[key]=value;};
    const ctx=vm.createContext(context);
    ctx.tai=vm.runInContext(callback('tai','tab, params'),ctx);
    const handlers={
      luuTen:vm.runInContext(callback('luuTen','tenMoi, tai'),ctx),
      luuTenLo:vm.runInContext(callback('luuTenLo','tenLo, chon, tai'),ctx),
      chayLaiPhanTich:vm.runInContext(callback('chayLaiPhanTich','tai'),ctx),
      onXong:vm.runInContext('('+onDone+')',ctx),
    };
    cleanup=vm.runInContext(effect,ctx)();
    return handlers;
  }
  async function drainReports() {
    for (let step=0;step<8;step++) {
      const pending=requests.filter(r=>!r.done);
      if (!pending.length) {await flush();if (!requests.some(r=>!r.done)) break;continue;}
      for (const r of pending) {
        r.done=true;
        r.resolve(r.url.endsWith('/summary')?{data:{marker:r.company}}:{data:{data:[{marker:r.company}]}});
      }
      await flush();
    }
  }
  return {state,requests,actions,mount,drainReports,unmount(){cleanup?.();cleanup=undefined;}};
}
for (const action of ['luuTen','luuTenLo','chayLaiPhanTich','onXong']) {
  test(`late ${action}: preserve current company after a filter change`,async()=>{
    const h=harness();const a=h.mount('A');await h.drainReports();
    const done=a[action]('synthetic-ad');assert.equal(h.actions.length,1);
    h.mount('B');await h.drainReports();assert.equal(h.state.setTongQuan.marker,'B');
    const before=h.requests.length;h.actions[0].resolve({data:{ok:true}});await flush();
    await h.drainReports();await done;
    assert.equal(h.state.setTongQuan?.marker,'B','An old completion must not relabel A data as selected company B');
    assert.equal(h.state.setRows[0]?.marker,'B');
    assert.ok(h.requests.slice(before).every(r=>r.company==='B'),'Only the current scope may be refreshed');
  });
  test(`late ${action}: no report refresh after unmount`,async()=>{
    const h=harness();const a=h.mount('A');await h.drainReports();const done=a[action]('synthetic-ad');
    h.unmount();const before=h.requests.length;h.actions[0].resolve({data:{ok:true}});await flush();
    await h.drainReports();await done;assert.equal(h.requests.length,before);
  });
  test(`${action}: successful completion still refreshes unchanged scope`,async()=>{
    const h=harness();const a=h.mount('A');await h.drainReports();const before=h.requests.length;
    const done=a[action]('synthetic-ad');h.actions[0].resolve({data:{ok:true}});await flush();
    await h.drainReports();await done;assert.equal(h.requests.length,before+2);assert.equal(h.state.setTongQuan.marker,'A');
  });
}
