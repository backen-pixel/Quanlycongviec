'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const express = require('express');
const source = fs.readFileSync(path.join(__dirname, '../src/routes/metaFeedback.js'), 'utf8');
const mod = { exports: {} };
vm.runInNewContext(`(function(require,module){${source}\n})`, { Object, Array, Number })
  (name => name === 'express' ? express : { isTenantScopeEnforced: req => req.tenantContext?.enforced === true }, mod);
const { createMetaFeedbackRouter } = mod.exports;
const COMPANY = '991dc79d-cbf5-49f9-a364-35227cb47635', OTHER = '11111111-1111-4111-8111-111111111111';
async function withServer(options, run) {
  let previews = 0, sends = 0;
  const runtime = { getConfig: () => ({ target: { company_id: COMPANY }, enabled: true, ready: true, ...options.config }),
    preview: async () => { previews++; if (options.fail) throw Error('private token'); return { counts: { qualified_reconciled: 0 } }; },
    drain: async () => { sends++; return { status: 'completed', sent: 0 }; } };
  const app = express(); app.use(express.json());
  app.use('/api/meta-feedback', createMetaFeedbackRouter({ runtime, authenticate: (req, res, next) => {
    if (options.noAuth) return res.status(401).json({ error: 'auth' });
    req.user = { role: options.role || 'admin', company_id: options.company || COMPANY };
    req.tenantContext = { enforced: true }; req.tenantCompanyIds = options.tenant || [COMPANY]; next();
  } }));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try { await run(async (route, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/meta-feedback${route}`, body === undefined ? {}
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, cache: response.headers.get('cache-control'), body: await response.json() };
  }, () => ({ previews, sends })); }
  finally { await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }); }
}
test('real HTTP denies other role/company/tenant and client-supplied scope before runtime access', async () => {
  for (const options of [{ noAuth: true }, { role: 'sales' }, { company: OTHER }, { tenant: [OTHER] }])
    await withServer(options, async (send, calls) => {
      assert.equal((await send('/preview')).status, options.noAuth ? 401 : 403);
      assert.deepEqual(calls(), { previews: 0, sends: 0 });
    });
  await withServer({}, async (send, calls) => {
    assert.equal((await send(`/preview?company_id=${OTHER}`)).status, 403);
    assert.deepEqual(calls(), { previews: 0, sends: 0 });
  });
});
test('missing source returns sanitized 503 and no-store; valid zero remains explicit', async () => {
  await withServer({ fail: true }, async send => {
    const r = await send('/preview'); assert.equal(r.status, 503); assert.equal(r.cache, 'no-store');
    assert.equal(r.body.reason_code, 'SOURCE_UNAVAILABLE'); assert.doesNotMatch(JSON.stringify(r.body), /private|token/);
  });
  await withServer({}, async send => assert.equal((await send('/preview')).body.counts.qualified_reconciled, 0));
});
test('command rejects arbitrary destination, malformed limits and disabled delivery without any send', async () => {
  await withServer({}, async (send, calls) => {
    for (const body of [{ dataset_id: '123' }, { company_id: OTHER }, { limit: 0 }, { limit: 21 }, { limit: '1' }, []])
      assert.equal((await send('/run', body)).status, 400);
    assert.equal(calls().sends, 0); assert.equal((await send('/run', { limit: 1 })).status, 200);
    assert.equal(calls().sends, 1);
  });
  await withServer({ config: { enabled: false } }, async (send, calls) => {
    assert.equal((await send('/run', {})).status, 409); assert.equal(calls().sends, 0);
  });
});
