'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const file = 'frontend/src/pages/AdAnalyticsPage.jsx';
const source = process.env.PR19_UI_REVIEW_BASELINE === '1'
  ? cp.execFileSync('git', ['show', 'cfaeae22bcce4b393352e95c337956110f84b1eb:' + file], {cwd: root, encoding: 'utf8'})
  : fs.readFileSync(path.join(root, file), 'utf8');
const begin = 'const tai = useCallback(async () => {';
const end = '}, [tab, params]);';
const start = source.indexOf(begin), finish = source.indexOf(end, start);
assert.ok(start >= 0 && finish > start, 'actual report callback must be located');
const body = source.slice(start + begin.length, finish);
const flush = () => new Promise(setImmediate);
const plain = x => JSON.parse(JSON.stringify(x));
function harness() {
  const state = {setTongQuan: {marker: 'previous'}, setRows: [{marker: 'previous'}]};
  const requests = []; const reportRequestId = {current: 0};
  function launch(company) {
    const scope = {params: {company_id: company}, tab: 'campaigns', reportRequestId,
      api: {get(url) {return new Promise((resolve, reject) => requests.push({company, url, resolve, reject}));}}};
    for (const key of ['setDangTai','setLoi','setTongQuan','setRows','setNhanXet','setTomTat','setTinhLuc']) scope[key] = value => {state[key] = plain(value);};
    return vm.runInNewContext(`(async () => {${body}})()`, scope, {timeout: 1000});
  }
  function request(company, suffix) {return requests.find(x => x.company === company && x.url.endsWith(suffix));}
  async function succeed(company) {
    request(company, '/summary').resolve({data: {marker: company}}); await flush();
    request(company, '/campaigns').resolve({data: {data: [{marker: company}]}}); await flush();
  }
  return {state, requests, launch, request, succeed};
}
test('UI async: clear previous figures as a new filter starts', async () => {
  const h = harness(); const done = h.launch('A');
  assert.equal(h.state.setTongQuan, null); assert.deepEqual(h.state.setRows, []);
  await h.succeed('A'); await done;
});
test('UI async: publish summary only together with successful detail', async () => {
  const h = harness(); const done = h.launch('A');
  h.request('A','/summary').resolve({data: {marker: 'A'}}); await flush();
  assert.equal(h.state.setTongQuan, null);
  h.request('A','/campaigns').resolve({data: {data: []}}); await done;
});
test('UI async: older detail cannot overwrite newer company data', async () => {
  const h = harness(); const a = h.launch('A');
  h.request('A','/summary').resolve({data: {marker: 'A'}}); await flush();
  const b = h.launch('B'); await h.succeed('B'); await b;
  h.request('A','/campaigns').resolve({data: {data: [{marker: 'A'}]}}); await a;
  assert.equal(h.state.setTongQuan.marker,'B'); assert.equal(h.state.setRows[0].marker,'B');
});
test('UI async: older summary cannot start or commit obsolete detail', async () => {
  const h = harness(); const a = h.launch('A'); const b = h.launch('B');
  await h.succeed('B'); await b;
  h.request('A','/summary').resolve({data: {marker: 'A'}}); await flush();
  const stale = h.request('A','/campaigns'); if (stale) stale.resolve({data:{data:[{marker:'A'}]}});
  await a; assert.equal(h.state.setTongQuan.marker,'B'); assert.equal(h.state.setRows[0].marker,'B'); assert.equal(stale,undefined);
});
test('UI async: older failure cannot erase newer successful data', async () => {
  const h = harness(); const a = h.launch('A'); const b = h.launch('B');
  await h.succeed('B'); await b;
  h.request('A','/summary').reject({response:{data:{error:'old failure'}}}); await a;
  assert.equal(h.state.setTongQuan?.marker,'B'); assert.equal(h.state.setLoi,'');
});
test('UI async: older completion cannot end newer loading indicator', async () => {
  const h = harness(); const a = h.launch('A'); const b = h.launch('B');
  h.request('A','/summary').reject(new Error('old failure')); await a;
  assert.equal(h.state.setDangTai,true); await h.succeed('B'); await b;
});
test('UI async: current detail failure clears all figures and marks an error', async () => {
  const h = harness(); const done = h.launch('A');
  h.request('A','/summary').resolve({data:{marker:'A'}}); await flush();
  h.request('A','/campaigns').reject({response:{data:{error:'current failure'}}}); await done;
  assert.equal(h.state.setTongQuan,null); assert.deepEqual(h.state.setRows,[]); assert.equal(h.state.setLoi,'current failure'); assert.equal(h.state.setDangTai,false);
});
function key(g,tab='campaigns',i=0) {
  const expression = source.match(/const khoa = ([\s\S]*?);/)[1];
  return vm.runInNewContext(expression,{g,tab,i});
}
test('UI row identity: different campaign IDs with same label have different keys', () => {
  assert.notEqual(key({campaign_id:'one',campaign_name:'Same'}),key({campaign_id:'two',campaign_name:'Same'}));
});
test('UI row identity: unnamed campaign fallback is stable when row order changes', () => {
  const g={ad_ids:['ad-two','ad-one']};assert.equal(key(g,'campaigns',0),key(g,'campaigns',7));
  assert.notEqual(key(g),key({ad_ids:['other']}));
});
test('UI row identity: campaign ID wins over label changes', () => {
  assert.equal(key({campaign_id:'one',campaign_name:'Before'}),key({campaign_id:'one',campaign_name:'After'}));
});