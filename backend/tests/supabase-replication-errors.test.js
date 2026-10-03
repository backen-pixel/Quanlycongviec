const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Execute the actual helper in isolation. No application import, .env, network,
// DB, Redis, timers, server or automatic worker startup is allowed.
const filename = path.join(__dirname, '..', 'src', 'helpers', 'supabaseReplication.js');
const source = fs.readFileSync(filename, 'utf8');
const CONTACT = { id: 'contact-test', page_id: 'page-test', psid: 'psid-test' };
const PRIVATE = 'PRIVATE_CUSTOMER_0900000000_TOKEN';
const fkText = 'Key (customer_id)=(parent-test) is not present in table "customers".';
const jsonError = (code, details = PRIVATE) => JSON.stringify({ code, details, hint: PRIVATE, message: PRIVATE });
const response = (status, body = '') => new Response(body, { status });
const jsonResponse = (status, value) => response(status, JSON.stringify(value));

function harness(steps = [], options = {}) {
  const calls = [];
  const warnings = [];
  const grants = [];
  const unexpected = () => { throw new Error('Unexpected isolated dependency call'); };
  const dependencies = {
    crypto: { randomUUID: () => 'test-job-id' },
    undici: {
      async fetch(url, init = {}) {
        const call = { url: String(url), ...init };
        calls.push(call);
        assert.ok(steps.length, `Unexpected mocked fetch: ${init.method || 'GET'}`);
        const step = steps.shift();
        if (typeof step === 'function') return step(call);
        return step;
      },
    },
    '../config': {
      supabaseUrl: 'https://primary.invalid', supabaseServiceKey: 'primary-test-key',
      supabaseBackupUrl: 'https://backup.invalid', supabaseBackupServiceKey: 'backup-test-key',
      supabaseReplicationEnabled: true,
    },
    '../config/httpAgents': { supabaseDispatcher: {} },
    '../config/redis': { getRedisIfReady: () => options.redis || null },
    './cronLeader': { runIfLeader: unexpected },
    '../config/supabaseRouter': {
      getActiveTarget: () => 'primary',
      getPrimaryClient: options.getPrimaryClient || unexpected,
      getBackupClient: options.getBackupClient || unexpected,
    },
    './backupSchemaGrants': {
      async applyBackupSchemaGrants(args) {
        assert.equal(options.allowGrants, true, 'Unexpected schema-grant attempt');
        grants.push(args);
        assert.equal(args.force, true);
        args.onLog(PRIVATE);
        if (options.grantError) throw new Error(PRIVATE);
      },
    },
  };
  const sandbox = {
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unmocked import: ${name}`);
      return dependencies[name];
    },
    module: { exports: {} }, URL, Buffer,
    process: { env: { SUPABASE_REPLICATION_BATCH_SIZE: '2' } },
    console: { warn: (...args) => warnings.push(args), log: unexpected, error: unexpected },
    setTimeout: unexpected, clearTimeout: unexpected,
  };
  vm.runInNewContext(source + `\nmodule.exports.testing = {
    upsertFacebookContactOnBackup, postRowToBackup, parseFkMissingFromError,
    backupFetchWithGrantRetry, applyRestJob, workerTickBatch,
    isDeferrableReplicationError, requeueReplicationJob, memQueue,
  };`, sandbox, { filename: 'isolated-supabaseReplication.js', timeout: 1000 });
  return {
    api: sandbox.module.exports, t: sandbox.module.exports.testing,
    calls, warnings, grants,
    done() { assert.equal(steps.length, 0, 'Every expected mocked fetch must run'); },
  };
}

function expectSafe(err, status, code) {
  assert.equal(err.message, `Backup request failed → ${status}${code ? ` (code ${code})` : ''}`);
  assert.ok(!err.message.includes(PRIVATE));
  return true;
}

test('contact and generic errors retain the consumed HTTP 400 body code safely', async () => {
  for (const kind of ['contact', 'generic']) {
    const res = response(400, jsonError('PGRST204'));
    const h = harness([res]);
    const operation = kind === 'contact'
      ? h.t.upsertFacebookContactOnBackup(CONTACT)
      : h.t.postRowToBackup('test_rows', { id: 'row-test' });
    await assert.rejects(operation, (err) => expectSafe(err, 400, 'PGRST204'));
    assert.equal(res.bodyUsed, true);
    await assert.rejects(res.text(), TypeError, 'Real Response forbids a second body read');
    assert.equal(h.grants.length, 0);
    h.done();
  }
});

test('successful contact body stays unread until JSON is consumed; generic success returns', async () => {
  const h = harness([jsonResponse(201, [{ id: 'saved-contact' }]), response(201)]);
  assert.equal(await h.t.upsertFacebookContactOnBackup(CONTACT), 'saved-contact');
  await h.t.postRowToBackup('test_rows', { id: 'row-test' });
  assert.equal(h.calls.length, 2);
  h.done();
});

test('JSON details and plaintext FK forms resolve one parent and retry each affected caller', async () => {
  for (const kind of ['contact', 'generic']) {
    for (const text of [fkText, jsonError('23503', fkText)]) {
      const h = harness([
        response(400, text),
        (call) => {
          assert.equal(call.url, 'https://backup.invalid/rest/v1/customers?id=eq.parent-test&select=id');
          return jsonResponse(200, []);
        },
        (call) => {
          assert.equal(call.url, 'https://primary.invalid/rest/v1/customers?id=eq.parent-test&select=*');
          return jsonResponse(200, [{ id: 'parent-test' }]);
        },
        (call) => {
          assert.equal(call.method, 'POST');
          assert.equal(call.url, 'https://backup.invalid/rest/v1/customers?on_conflict=id');
          return response(201);
        },
        jsonResponse(201, [{ id: 'saved-contact' }]),
      ]);
      if (kind === 'contact') assert.equal(await h.t.upsertFacebookContactOnBackup(CONTACT), 'saved-contact');
      else await h.t.postRowToBackup('test_rows', { id: 'row-test' });
      assert.equal(h.calls.length, 5);
      assert.equal(h.grants.length, 0);
      h.done();
    }
  }
});

test('unsupported composite, malformed and ambiguous foreign keys make no parent requests', async () => {
  const invalid = [
    'Key (customer_id, company_id)=(parent-test, company-test) is not present in table "customers".',
    'Key (customer_id)=(one,two) is not present in table "customers".',
    'Key (customer_id)=(parent-test) is not present in table "customers?secret=1".',
    `${fkText}\n${fkText}`,
    JSON.stringify({ code: '23503', details: [fkText] }),
    JSON.stringify({ code: '23503', details: null, message: fkText }),
    JSON.stringify({ code: 'PGRST204', details: fkText }),
    '{"code":"23503","details": malformed}',
  ];
  for (const text of invalid) {
    const h = harness([response(400, text)]);
    assert.equal(h.t.parseFkMissingFromError(text), null);
    await assert.rejects(h.t.postRowToBackup('test_rows', { id: 'row-test' }));
    assert.equal(h.calls.length, 1);
    h.done();
  }
});

test('FK repair keeps the existing recursion caps at contact depth 6 and generic depth 4', async () => {
  for (const kind of ['contact', 'generic']) {
    const h = harness([response(400, jsonError('23503', fkText))]);
    const operation = kind === 'contact'
      ? h.t.upsertFacebookContactOnBackup(CONTACT, 6)
      : h.t.postRowToBackup('test_rows', { id: 'row-test' }, 4);
    await assert.rejects(operation, (err) => {
      expectSafe(err, 400, '23503');
      assert.equal(h.t.isDeferrableReplicationError(err), true);
      return true;
    });
    assert.equal(h.calls.length, 1);
    h.done();
  }
});

test('duplicate body code on non-409 responses still triggers contact and generic PATCH', async () => {
  for (const kind of ['contact', 'generic']) {
    const h = harness([
      response(400, jsonError('23505')),
      (call) => {
        assert.equal(call.method, 'PATCH');
        const payload = JSON.parse(call.body);
        assert.equal(Object.hasOwn(payload, 'id'), false);
        assert.equal(Object.hasOwn(payload, 'created_at'), false);
        return jsonResponse(200, [{ id: 'patched-contact' }]);
      },
    ]);
    if (kind === 'contact') assert.equal(await h.t.upsertFacebookContactOnBackup(CONTACT), 'patched-contact');
    else await h.t.postRowToBackup('test_rows', { id: 'row-test', created_at: 'synthetic', value: 'kept' });
    assert.equal(h.calls.length, 2);
    h.done();
  }
});

test('contact duplicate PATCH failures expose only the final status and valid code', async () => {
  const h = harness([response(409, jsonError('23505')), response(400, jsonError('PGRST204'))]);
  await assert.rejects(h.t.upsertFacebookContactOnBackup(CONTACT), (err) => expectSafe(err, 400, 'PGRST204'));
  h.done();
});

test('mocked 401/403 + 42501 grants retry exactly once and retain the final body', async () => {
  for (const status of [401, 403]) {
    const h = harness([
      response(status, jsonError('42501')),
      response(400, jsonError('PGRST204')),
    ], { allowGrants: true });
    await assert.rejects(h.t.postRowToBackup('test_rows', { id: 'row-test' }), (err) => expectSafe(err, 400, 'PGRST204'));
    assert.equal(h.grants.length, 1);
    assert.equal(h.calls.length, 2);
    assert.ok(!JSON.stringify(h.warnings).includes(PRIVATE));
    h.done();
  }
  const h = harness([response(403, jsonError('42501')), response(403, jsonError('42501'))], { allowGrants: true });
  await assert.rejects(h.t.upsertFacebookContactOnBackup(CONTACT), (err) => {
    expectSafe(err, 403, '42501');
    assert.equal(h.t.isDeferrableReplicationError(err), true);
    return true;
  });
  assert.equal(h.grants.length, 1);
  assert.equal(h.calls.length, 2);
  h.done();
});

test('unrelated HTTP errors never trigger grants; failed mock grant remains private', async () => {
  for (const [status, code] of [[400, '42501'], [403, 'PGRST204'], [401, 'PGRST301']]) {
    const h = harness([response(status, jsonError(code))]);
    await assert.rejects(h.t.postRowToBackup('test_rows', { id: 'row-test' }), (err) => expectSafe(err, status, code));
    assert.equal(h.grants.length, 0);
    h.done();
  }
  const h = harness([response(403, jsonError('42501'))], { allowGrants: true, grantError: true });
  await assert.rejects(h.t.postRowToBackup('test_rows', { id: 'row-test' }), (err) => expectSafe(err, 403, '42501'));
  assert.equal(h.grants.length, 1);
  assert.ok(!JSON.stringify(h.warnings).includes(PRIVATE));
  h.done();
});

function job(overrides = {}) {
  return {
    id: 'job-test', type: 'rest', method: 'POST',
    path: `/rest/v1/test_rows?private_filter=eq.${PRIVATE}`,
    body: JSON.stringify({ id: 'row-test', contact: PRIVATE }),
    ...overrides,
  };
}

test('drain/status hides arbitrary, long, malformed and hostile response content', async () => {
  const cases = [
    [jsonError('PGRST204'), 'PGRST204'],
    [jsonError('22P02'), '22P02'],
    [jsonError('P0001'), 'P0001'],
    [jsonError('XX000'), 'XX000'],
    [jsonError(PRIVATE), null],
    [jsonError('pgrst204'), null],
    [jsonError('PGRST204\n' + PRIVATE), null],
    [JSON.stringify({ code: { value: PRIVATE }, message: PRIVATE }), null],
    [`<html>${PRIVATE.repeat(2000)}</html>`, null],
    ['{malformed:' + PRIVATE, null],
    [PRIVATE, null],
  ];
  for (const [body, code] of cases) {
    const h = harness([response(400, body)]);
    h.t.memQueue.push(job());
    const result = await h.api.drainReplicationQueue({ maxJobs: 1 });
    assert.equal(result.failed, 1);
    assert.equal(result.remaining, 1);
    const status = h.api.getReplicationStatus();
    assert.equal(status.last_error, `Backup request failed → 400${code ? ` (code ${code})` : ''}`);
    assert.equal(status.failed, 1);
    assert.ok(!JSON.stringify(status).includes(PRIVATE));
    assert.ok(!JSON.stringify(h.warnings).includes(PRIVATE));
    assert.equal(h.t.memQueue[0].retry, 1);
    h.done();
  }
});

test('worker warnings and retry-exhaustion logs hide path, bucket, body and upstream text', async () => {
  const h = harness([response(400, jsonError('PGRST204'))]);
  h.t.memQueue.push(job());
  await h.t.workerTickBatch();
  assert.equal(h.warnings.length, 1);
  assert.match(h.warnings[0].join(' '), /400.*PGRST204/);
  await h.t.requeueReplicationJob(job({ retry: 12, bucket: PRIVATE }), new Error(PRIVATE));
  assert.equal(h.warnings.length, 2);
  assert.ok(!JSON.stringify(h.warnings).includes(PRIVATE));
  assert.equal(h.t.memQueue.length, 1, 'Exhausted job is not requeued');
  h.done();
});

test('sanitized errors preserve deferrable classification, queue placement and batch continuation', async () => {
  const h = harness([response(400, jsonError('23503')), response(201)]);
  const first = job();
  const second = job({ id: 'second-job' });
  h.t.memQueue.push(first, second);
  const result = await h.t.workerTickBatch();
  // Preserve the existing memory-queue behavior: a deferrable job is unshifted,
  // so its successful retry runs before second-job in this two-item batch.
  assert.equal(result.processed, 1);
  assert.equal(h.t.memQueue.length, 1);
  assert.equal(h.t.memQueue[0].id, 'second-job');
  assert.equal(h.api.getReplicationStatus().last_error, 'Backup request failed → 400 (code 23503)');
  assert.ok(!JSON.stringify(h.warnings).includes(PRIVATE));
  h.done();
});

test('unstructured network and storage errors cannot escape into public health or warnings', async () => {
  const network = harness([() => { throw new Error(PRIVATE); }]);
  network.t.memQueue.push(job());
  await network.t.workerTickBatch();
  assert.equal(network.api.getReplicationStatus().last_error, 'Replication operation failed');
  assert.ok(!JSON.stringify(network.warnings).includes(PRIVATE));
  network.done();

  const storage = harness([], {
    getPrimaryClient: () => ({ storage: { from: () => ({ download: async () => ({ error: new Error(PRIVATE) }) }) } }),
    getBackupClient: () => ({}),
  });
  storage.t.memQueue.push(job({ type: 'storage', bucket: PRIVATE, path: PRIVATE }));
  await storage.api.drainReplicationQueue({ maxJobs: 1 });
  assert.equal(storage.api.getReplicationStatus().last_error, 'Replication operation failed');
  assert.ok(!JSON.stringify(storage.warnings).includes(PRIVATE));
  storage.done();
});

test('Redis enqueue failure logs never contain the thrown connection details', async () => {
  const h = harness([], {
    redis: { lpush: async () => { throw new Error(PRIVATE); } },
  });
  h.api.maybeEnqueueRestReplication('https://primary.invalid/rest/v1/test_rows', { method: 'POST', body: '{}' }, { status: 201 });
  h.api.replicateStorageUpload({ bucket: PRIVATE, storagePath: PRIVATE });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.warnings.length, 2);
  assert.ok(!JSON.stringify(h.warnings).includes(PRIVATE));
  h.done();
});
