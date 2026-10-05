'use strict';
// Execute real modules against synthetic ports. No credentials, .env, provider or DB.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '..');
function load(file, deps = {}, { env = {}, expose = [], ...extra } = {}) {
  const module = { exports: {} }, state = { env };
  const imports = [], logs = [];
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  vm.runInNewContext(source + (expose.length ? '\nmodule.exports.__test = {' + expose.join(',') + '};' : ''), {
    module, exports: module.exports, process: state, __dirname: path.dirname(path.join(root, file)),
    Buffer, URL, Date, Intl, Response, setTimeout: () => ({ unref() {} }), clearTimeout() {},
    console: { log: (...v) => logs.push(v), warn: (...v) => logs.push(v), error: (...v) => logs.push(v) },
    fetch() { throw Error('Network prohibited'); },
    require(name) { imports.push(name); if (Object.hasOwn(deps, name)) return deps[name]; throw Error('Undeclared dependency: ' + name); },
    ...extra,
  }, { filename: file, timeout: 2000 });
  return { api: module.exports, state, imports, logs };
}
const guard = () => load('src/helpers/backupSchemaGrants.js');
const plain = value => JSON.parse(JSON.stringify(value));
test('retired grant helper always denies before config/PG or any external dependency', async () => {
  const x = guard();
  for (const options of [undefined, {}, { force: true }, { force: false }]) {
    await assert.rejects(x.api.applyBackupSchemaGrants(options), e => e.code === 'BACKUP_GRANT_MIGRATION_REQUIRED');
  }
  assert.deepEqual(x.imports, []);
});
test('both legacy CLIs fail before loading environment, connecting or spawning tools', async () => {
  const clone = load('scripts/clone-primary-to-backup.js', {}, { env: { SUPABASE_BACKUP_ALLOW_FULL_CLONE: '1' } });
  assert.equal(clone.state.exitCode, 1); assert.deepEqual(clone.imports, []);
  assert.match(clone.logs.flat().join(' '), /BACKUP_CLONE_REMEDIATION_REQUIRED/);
  const fix = load('scripts/fix-backup-schema-grants.js', { '../src/helpers/backupSchemaGrants': guard().api });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fix.state.exitCode, 1);
  assert.deepEqual(fix.imports, ['../src/helpers/backupSchemaGrants']);
  assert.match(fix.logs.flat().join(' '), /BACKUP_GRANT_MIGRATION_REQUIRED/);
});

function replication({ redisEnabled = false, status = 403, body = 'permission denied for table protected', storageError = null, fetchReply = null } = {}) {
  const queue = [], calls = [];
  const redis = {
    lpush: async (_, x) => queue.unshift(x), rpush: async (_, x) => queue.push(x),
    lpop: async () => queue.shift() || null, llen: async () => queue.length,
    lrange: async (_, a, b) => queue.slice(a, b + 1),
  };
  const client = { storage: { from: () => ({ download: async () => ({ data: { arrayBuffer: async () => new ArrayBuffer(0) } }),
    upload: async () => { calls.push('storage'); return { error: storageError }; } }) } };
  const x = load('src/helpers/supabaseReplication.js', {
    crypto: { randomUUID }, undici: { fetch: async (...args) => {
      calls.push(args); return fetchReply ? fetchReply(...args) : new Response(status === 204 ? null : body, { status });
    } },
    '../config': { supabaseReplicationEnabled: true, supabaseUrl: 'https://primary.invalid',
      supabaseBackupUrl: 'https://backup.invalid', supabaseBackupServiceKey: 'synthetic-test-only' },
    '../config/httpAgents': { supabaseDispatcher: null },
    '../config/redis': { getRedisIfReady: () => redisEnabled ? redis : null },
    '../config/supabaseRouter': { getActiveTarget: () => 'primary', getPrimaryClient: () => client, getBackupClient: () => client },
    './cronLeader': {}, './backupSchemaGrants': guard().api,
  }, { expose: ['backupFetchWithoutPrivilegeRepair', 'redisPush', 'redisPopNonBlocking', 'workerTickBatch', 'requeueReplicationJob', 'upsertFacebookContactOnBackup', 'postRowToBackup'] });
  return { ...x, calls };
}
test('HTTP wrapper sends once and preserves success JSON and error body including FK details', async () => {
  const x = replication();
  for (const status of [200, 401, 403, 409, 500]) {
    let calls = 0;
    const body = JSON.stringify({ code: status === 409 ? '23503' : '42501', message: 'synthetic error details' });
    const result = await x.api.__test.backupFetchWithoutPrivilegeRepair(async () => { calls++; return new Response(body, { status }); });
    assert.equal(calls, 1); assert.equal(result.res.status, status);
    assert.equal(result.text, status === 200 ? '' : body);
    if (status === 200) assert.deepEqual(await result.res.json(), JSON.parse(body));
    else assert.equal(result.res.bodyUsed, true);
  }
});
for (const contact of [false, true]) {
  test(`downstream ${contact ? 'contact' : 'generic row'} caller keeps permission details and handles FK response`, async () => {
    const row = contact ? { id: 'child', page_id: 'p', psid: 'ps' } : { id: 'child' };
    const denied = replication({ status: 400, body: '{"code":"42501","message":"synthetic denied"}' });
    const invoke = x => contact ? x.api.__test.upsertFacebookContactOnBackup(row) : x.api.__test.postRowToBackup('synthetic_rows', row);
    await assert.rejects(invoke(denied), /42501/);
    assert.equal(denied.calls.length, 1);
    let writes = 0;
    const x = replication({ fetchReply: async (_, init) => {
      if (init.method === 'POST') {
        writes++;
        return writes === 1
          ? new Response('Key (parent_id)=(parent) is not present in table "synthetic_parents"', { status: 409 })
          : new Response('[{"id":"child"}]', { status: 200 });
      }
      return new Response('[{"id":"parent"}]', { status: 200 });
    } });
    const result = await invoke(x);
    assert.equal(writes, 2); if (contact) assert.equal(result, 'child');
  });
}
for (const redisEnabled of [false, true]) {
  test(`mixed queue, redis=${redisEnabled}: denied job is retained without starving an allowed write`, async () => {
    const x = replication({ redisEnabled, fetchReply: async url => new Response(url.includes('blocked') ? 'denied' : null,
      { status: url.includes('blocked') ? 403 : 204 }) });
    const blocked = { id: 'blocked', type: 'rest', method: 'POST', path: '/rest/v1/blocked', body: '{"keep":true}', enqueued_at: 'kept', retry: 12 };
    const good = { id: 'good', type: 'rest', method: 'POST', path: '/rest/v1/allowed', body: '{}' };
    // LPUSH prepends in Redis, while memory pushes; arrange the same observed order.
    for (const job of redisEnabled ? [good, blocked] : [blocked, good]) await x.api.__test.redisPush(job);
    const first = await x.api.drainReplicationQueue({ maxJobs: 100 });
    assert.equal(first.failed, 1); assert.equal(first.remaining, 2); assert.equal(x.calls.length, 1);
    await x.api.__test.workerTickBatch();
    assert.equal(x.api.getReplicationStatus().applied, 1); assert.equal(await x.api.getQueueDepth(), 1);
    assert.equal(x.calls.filter(([url]) => url.includes('allowed')).length, 1);
    const kept = await x.api.__test.redisPopNonBlocking();
    assert.equal(kept.id, blocked.id); assert.equal(kept.body, blocked.body); assert.equal(kept.enqueued_at, blocked.enqueued_at);
  });
  for (const status of [401, 403, 400]) {
    test(`permission ${status}, redis=${redisEnabled}: one failure per batch, retains identity beyond retry 12`, async () => {
      const x = replication({ redisEnabled, status, body: status === 400 ? '{"code":"42501","message":"denied"}' : 'denied' });
      const job = { id: randomUUID(), type: 'rest', path: '/rest/v1/test_table', method: 'POST', body: '{"id":"synthetic"}',
        headers: {}, enqueued_at: '2026-10-05T00:00:00Z', retry: 12 };
      await x.api.__test.redisPush(job);
      const result = await x.api.drainReplicationQueue({ maxJobs: 100 });
      assert.equal(result.processed, 0); assert.equal(result.failed, 1); assert.equal(result.remaining, 1);
      assert.equal(x.calls.length, 1); assert.equal(x.api.getReplicationStatus().applied, 0);
      const kept = plain(await x.api.__test.redisPopNonBlocking());
      assert.equal(kept.id, job.id); assert.equal(kept.body, job.body); assert.equal(kept.enqueued_at, job.enqueued_at);
      assert.equal(kept.retry, 13);
      await x.api.__test.redisPush(kept);
      await x.api.__test.workerTickBatch();
      assert.equal(x.calls.length, 2); assert.equal(await x.api.getQueueDepth(), 1);
    });
  }
  test(`storage permission metadata, redis=${redisEnabled}: retained past retry 12`, async () => {
    const x = replication({ redisEnabled, storageError: { statusCode: '403', message: 'denied' } });
    const job = { id: randomUUID(), type: 'storage', bucket: 'synthetic', path: 'file.txt', retry: 12, enqueued_at: 'kept' };
    await x.api.__test.redisPush(job);
    const result = await x.api.drainReplicationQueue({ maxJobs: 100 });
    assert.equal(result.failed, 1); assert.equal(result.remaining, 1); assert.equal(x.calls.length, 1);
    const kept = await x.api.__test.redisPopNonBlocking(); assert.equal(kept.id, job.id); assert.equal(kept.enqueued_at, 'kept');
  });
}
test('successful replication still drains, ordinary failure retains existing retry limit', async () => {
  const x = replication({ status: 204 });
  x.api.maybeEnqueueRestReplication('https://primary.invalid/rest/v1/test_table', { method: 'POST', body: '{}' }, { status: 201 });
  await new Promise(resolve => setImmediate(resolve));
  const result = await x.api.drainReplicationQueue();
  assert.equal(result.processed, 1); assert.equal(result.remaining, 0); assert.equal(x.api.getReplicationStatus().applied, 1);
  await x.api.__test.requeueReplicationJob({ id: 'ordinary', retry: 12 }, new Error('unrelated failure'));
  assert.equal(await x.api.getQueueDepth(), 0);
});

function backupSync(inc) {
  const saves = [], calls = [];
  const x = load('src/helpers/supabaseBackupSync.js', {
    '../config/supabase': { supabase: { from(table) { assert.equal(table, 'app_settings'); return { upsert: async row => { saves.push(plain(row)); return {}; } }; } } },
    '../config/pgConnection': { resolvePrimaryDbUrl: () => 'synthetic-primary', resolveBackupDbUrl: () => 'synthetic-backup' },
    './appSettingsCache': { getAppSettingValue: async () => ({}), invalidateAppSettingKey() {} }, './cronLeader': {},
    './supabaseIncrementalDbSync': { runIncrementalDbSyncPrimaryToBackup: async () => { calls.push('incremental'); return inc; } },
    './supabaseStorageSync': { runStorageSync: async () => { calls.push('storage'); } },
  }, { env: { SUPABASE_BACKUP_ALLOW_FULL_CLONE: '1' } });
  return { ...x, saves, calls };
}
test('normal backup sync keeps existing privileges, records success without grant helper', async () => {
  const x = backupSync({ ok: true, mode: 'incremental' });
  const result = await x.api.runBackupSync({ verifyAfter: false });
  assert.equal(result.ok, true); assert.deepEqual(x.calls, ['incremental', 'storage']);
  assert.equal(x.saves[0].value.last_run_status, 'success');
  assert.equal(x.imports.some(n => /backupSchemaGrants|child_process/.test(n)), false);
});
for (const inc of [{ ok: false, full_clone_required: true }, { ok: false, error: '42501 permission denied' }]) {
  test(`backup failure ${JSON.stringify(inc)} stops before storage/clone and records failed status`, async () => {
    const x = backupSync(inc);
    await assert.rejects(x.api.runBackupSync({ verifyAfter: false }), /BACKUP_CLONE_REMEDIATION_REQUIRED|42501/);
    assert.deepEqual(x.calls, ['incremental']); assert.equal(x.saves[0].value.last_run_status, 'failed');
    assert.equal(x.api.isJobRunning(), false); assert.equal(x.api.getBackupJobPublicSnapshot().status, 'error');
    assert.equal(x.imports.some(n => /backupSchemaGrants|child_process/.test(n)), false);
  });
}

function manualSwitch() {
  const calls = [];
  const x = load('src/helpers/supabaseManualSwitch.js', {
    crypto: require('node:crypto'), '../config': { supabaseBackupUrl: 'https://backup.invalid', supabaseBackupServiceKey: 'synthetic' },
    '../config/supabaseRouter': { getActiveTarget: () => 'primary', setActiveTarget: () => { throw Error('Switch prohibited'); },
      runHealthCheck: async () => ({ primary: { healthy: true }, backup: { healthy: true } }) },
    './supabaseSwitchSync': { runPreSwitchSync: async () => ({ remaining: 1 }), isLogSyncComplete: () => false,
      runLogBasedSwitchSync: async () => { calls.push('logSync'); } },
    './supabaseBackupSync': { verifyBackup: async () => ({ all_ok: false, rows: [] }), isJobRunning: () => false,
      setBackupSyncLogListener() {}, runBackupSync() { throw Error('Legacy fallback must not run'); } },
    './supabaseStorageSync': { verifyStorageSync: async () => ({ all_ok: false, rows: [] }), runStorageSync: async () => { calls.push('storage'); } },
    './supabaseFailback': { getPendingCount: async () => 0 }, './supabaseReplication': { getQueueDepth: async () => 1 },
    './supabaseIncrementalDbSync': { runIncrementalDbSyncPrimaryToBackup: async () => ({ ok: false, full_clone_required: true }) },
  }, { env: { SUPABASE_BACKUP_ALLOW_FULL_CLONE: '1' }, expose: ['runAutoFullSyncForSwitch'] });
  return { ...x, calls };
}
test('manual switch cannot fall back to retired clone even with old environment flag', async () => {
  const x = manualSwitch();
  const result = await x.api.prepareManualSwitch('backup', 'synthetic-admin');
  assert.equal(result.ok, false); assert.equal(result.sync_verified_100, false); assert.equal(result.token, undefined);
  assert.equal(result.steps.find(s => s.id === 'full_sync').detail.error, 'BACKUP_CLONE_REMEDIATION_REQUIRED');
  assert.deepEqual(x.calls, ['logSync']);
  await assert.rejects(x.api.__test.runAutoFullSyncForSwitch('primary', 'backup', 'synthetic-admin', { needDb: true, needStorage: true }), /BACKUP_CLONE_REMEDIATION_REQUIRED/);
  assert.deepEqual(x.calls, ['logSync']);
});
