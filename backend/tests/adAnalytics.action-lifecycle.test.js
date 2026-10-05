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
const effectEnd = source.indexOf('}, [taiHienTai]);');
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
    get(url, options) { return new Promise((resolve,reject) => requests.push({url, company: options.params.company_id, resolve, reject, done:false})); },
    put(url) { return new Promise((resolve,reject) => actions.push({url, resolve, reject})); },
    post(url) { return new Promise((resolve,reject) => actions.push({url, resolve, reject})); },
  };
  function mount(company, view = 'table') {
    cleanup?.();
    const context = {api, params:{company_id:company, page_id:'synthetic-page'}, pageId:'synthetic-page', tab:'campaigns', reportRequestId, refreshReportRef,
      tenMoi:'Synthetic name', tenLo:'Synthetic bulk', chon:new Set(['synthetic-ad']),
      taiMkt: () => new Promise(resolve => actions.push({url:'synthetic-marketing-read', resolve}))};
    for (const key of ['setDangTai','setLoi','setTongQuan','setRows','setNhanXet','setTomTat','setTinhLuc',
      'setDangLuu','setDangSua','setTenMoi','setChon','setTenLo','setDangChayLai',
      'setHoSo','setDsQc','setDsBai','setTaiHoSo','setTaiDsQc','setTaiDsBai','setXemLead','setXemAnh','setLoiThaoTac']) context[key] = value => {state[key]=value;};
    const ctx=vm.createContext(context);
    ctx.tai=vm.runInContext(callback('tai','tab, params'),ctx);
    ctx.taiHoSoPage=vm.runInContext(callback('taiHoSoPage','params'),ctx);
    ctx.taiDanhSachQc=vm.runInContext(callback('taiDanhSachQc','pageId, params'),ctx);
    ctx.taiDanhSachBai=vm.runInContext(callback('taiDanhSachBai','pageId, params'),ctx);
    ctx.manHinh=view === 'cards' ? 'the' : 'chi_tiet';
    ctx.kieuCt=view === 'posts' ? 'bai' : view === 'ads' ? 'qc' : 'bang';
    ctx.taiHienTai=vm.runInContext(source.match(/const taiHienTai = ([\s\S]*?);/)[1],ctx);
    const handlers={
      luuTen:vm.runInContext(callback('luuTen','tenMoi, tai'),ctx),
      luuTenLo:vm.runInContext(callback('luuTenLo','tenLo, chon, tai'),ctx),
      chayLaiPhanTich:vm.runInContext(callback('chayLaiPhanTich','tai'),ctx),
      onXong:vm.runInContext('('+onDone+')',ctx),
    };
    cleanup=vm.runInContext(effect,ctx)();
    return handlers;
  }
  async function drainReports(company) {
    const active = r => !r.done && (!company || r.company === company);
    for (let step=0;step<8;step++) {
      const pending=requests.filter(active);
      if (!pending.length) {await flush();if (!requests.some(active)) break;continue;}
      for (const r of pending) {
        r.done=true;
        r.resolve(r.url.endsWith('/summary')?{data:{marker:r.company}}:{data:{data:[{marker:r.company}]}});
      }
      await flush();
    }
  }
  return {state,requests,actions,mount,drainReports,unmount(){cleanup?.();cleanup=undefined;}};
}
for(const [view,field] of [['cards','setHoSo'],['posts','setDsBai'],['ads','setDsQc']]) {
  for(const action of ['luuTen','luuTenLo','chayLaiPhanTich','onXong']) {
    test(`${action}: late table action refreshes current ${view} view only`,async()=>{
      const h=harness();const a=h.mount('A');await h.drainReports();
      const done=a[action]('synthetic-ad');h.mount('B',view);await h.drainReports();
      const before=h.requests.length;h.actions[0].resolve({data:{ok:true}});await flush();
      await h.drainReports();await done;
      assert.equal(h.state[field][0].marker,'B');assert.equal(h.state.setTongQuan.marker,'B');
      assert.ok(h.requests.slice(before).every(r=>r.company==='B'&&!r.url.endsWith('/campaigns')));
      assert.equal(h.requests.length,before+2);
    });
  }
  for(const failure of [false,true]) {
    test(`${view}: late ${failure?'failure':'success'} cannot replace newer company`,async()=>{
      const h=harness();h.mount('A',view);h.mount('B',view);await h.drainReports('B');
      if(failure) for(const r of h.requests.filter(r=>r.company==='A')) {r.done=true;r.reject(new Error('old failure'));}
      else await h.drainReports('A');
      await flush();assert.equal(h.state[field][0].marker,'B');assert.equal(h.state.setTongQuan.marker,'B');
      assert.equal(h.state.setLoi,'');
    });
  }
  for(const action of ['luuTen','luuTenLo','chayLaiPhanTich']) {
    test(`${view}: rejected old ${action} does not hide current report`,async()=>{
      const h=harness();const a=h.mount('A');await h.drainReports();
      const done=a[action]('synthetic-ad');h.mount('B',view);await h.drainReports();
      h.actions[0].reject({response:{data:{error:'Old action failed'}}});await done;
      assert.equal(h.state[field][0].marker,'B');assert.equal(h.state.setLoi,'');assert.equal(h.state.setLoiThaoTac,'');
    });
  }
  test(`${view}: current error clears snapshot and preserves UNKNOWN`,async()=>{
    const h=harness();h.mount('A',view);await h.drainReports();h.mount('B',view);
    assert.equal(h.state[field].length,0);assert.equal(h.state.setTongQuan,null);
    for(const r of h.requests.filter(r=>!r.done)) {r.done=true;r.reject({response:{data:{error:'Unavailable'}}});}
    await flush();assert.equal(h.state[field].length,0);assert.equal(h.state.setTongQuan,null);
    assert.equal(h.state.setLoi,'Unavailable');
  });
  test(`${view}: pending read after unmount cannot write state`,async()=>{
    const h=harness();h.mount('A',view);h.unmount();const snapshot=JSON.stringify(h.state);
    await h.drainReports();assert.equal(JSON.stringify(h.state),snapshot);
  });
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
