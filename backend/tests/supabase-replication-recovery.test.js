'use strict';

// Pure HTTP/Redis doubles. Never import application startup, dotenv or live DB clients.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/helpers/supabaseReplication.js'), 'utf8');
const response = (status, value) => {
  let consumed = false;
  const consume = () => { if (consumed) throw Error('body already consumed'); consumed = true; };
  return { status, ok: status >= 200 && status < 300,
    async json() { consume(); if (value === undefined) throw Error('empty body'); return value; },
    async text() { consume(); return typeof value === 'string' ? value : JSON.stringify(value); } };
};
function harness(fetchImpl = async () => { throw Error('unexpected HTTP'); }, options = {}) {
  const calls = [], logs = [];
  let grantCalls = 0;
  const config = { supabaseReplicationEnabled: true, supabaseUrl: 'https://primary.invalid',
    supabaseBackupUrl: 'https://backup.invalid', supabaseServiceKey: 'synthetic-primary',
    supabaseBackupServiceKey: 'synthetic-backup' };
  const module = { exports: {} };
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length || !options.clock ? args : [options.clock.now])); }
    static now() { return options.clock ? options.clock.now : Date.now(); }
  }
  const context = { module, exports: module.exports, URL, Buffer, Date: ClockDate, setTimeout, clearTimeout,
    process: { env: { SUPABASE_REPLICATION_BATCH_SIZE: '3' } },
    console: { warn: (...args) => logs.push(args.join(' ')), log() {} },
    require(name) {
      if (name === 'crypto') return require('node:crypto');
      if (name === 'undici') return { fetch: async (url, init = {}) => {
        calls.push({ url, init }); return fetchImpl(new URL(url), init);
      } };
      if (name === '../config') return config;
      if (name === '../config/httpAgents') return { supabaseDispatcher: {} };
      if (name === '../config/redis') return { getRedisIfReady: () => options.redis || null };
      if (name === '../config/supabaseRouter') return { getActiveTarget: options.target || (() => 'primary') };
      if (name === './cronLeader') return { runIfLeader: async (_key, fn) => fn() };
      if (name === './backupSchemaGrants') return { applyBackupSchemaGrants: async () => { grantCalls++; } };
      throw Error(`unexpected module ${name}`);
    } };
  vm.runInNewContext(`${source}\nmodule.exports.private = { memQueue, ensureRowOnBackup,
    ensureFacebookContactParents, postRowToBackup, patchBackupRowByConflictColumns,
    applyRestJob, requeueReplicationJob, workerTickBatch, replicationErrorSummary };`, context);
  return { ...module.exports, calls, logs, context, get grantCalls() { return grantCalls; } };
}
const fk = (column, id, table) => ({ code: '23503',
  details: `Key (${column})=(${id}) is not present in table "${table}".` });
const job = (rest = {}) => ({ id: 'job-synthetic', type: 'rest', method: 'POST',
  path: '/rest/v1/widgets', body: '{"id":"widget-1","value":"synthetic"}', ...rest });
function redisQueue(jobs = []) {
  const values = jobs.map(value => JSON.stringify(value));
  const locks = new Map();
  return { values, locks,
    async set(key, token, ...flags) {
      assert.deepEqual(flags, ['NX'], 'consumer mutex must never auto-expire');
      if (locks.has(key)) return null;
      locks.set(key, token); return 'OK';
    },
    async get(key) { return locks.get(key) || null; },
    async rpush(_key, raw) { values.push(raw); return values.length; },
    async lrange(_key, start, end) { return values.slice(start, end < 0 ? undefined : end + 1); },
    async llen() { return values.length; },
    async eval(script, _count, key, before, after) {
      if (!script.includes('LSET')) {
        if (locks.get(key) !== before) return 0;
        locks.delete(key); return 1;
      }
      const index = values.indexOf(before); if (index < 0) return 0;
      values[index] = after; return 1;
    },
    async lrem(_key, _count, raw) {
      const index = values.indexOf(raw); if (index < 0) return 0;
      values.splice(index, 1); return 1;
    } };
}

test('a long blocked prefix does not permanently starve an unrelated row after the apply budget', async () => {
  const h = harness(async url => response(200, [{ id: url.searchParams.get('id')?.slice(3) }]));
  const future = new Date(Date.now() + 300000).toISOString();
  for (let index = 0; index < 12; index++) h.private.memQueue.push(job({ id: `blocked-${index}`,
    method: 'PATCH', path: '/rest/v1/widgets?id=eq.blocked', next_attempt_at: future }));
  h.private.memQueue.push(job({ id: 'unrelated', method: 'PATCH', path: '/rest/v1/widgets?id=eq.unrelated' }));
  const result = await h.private.workerTickBatch();
  assert.equal(result.processed, 1); assert.equal(result.deferred, 12);
  assert.equal(h.private.memQueue.length, 12);
  assert.equal(h.calls.some(call => call.url.includes('id=eq.unrelated')), true);
});

test('independent Redis worker and manual drain share a nonexpiring consumer mutex', async () => {
  const redis = redisQueue([job({ id: 'older', body: '{"value":"older"}' }), job({ id: 'newer', body: '{"value":"newer"}' })]);
  let release, entered, value;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  const a = harness(async (_url, init) => {
    const body = JSON.parse(init.body);
    if (body.value === 'older') { entered(); await gate; }
    value = body.value; return response(201);
  }, { redis });
  const b = harness(undefined, { redis });
  const running = a.private.workerTickBatch();
  await started;
  assert.equal(redis.values.length, 2);
  const denied = await b.drainReplicationQueue({ maxJobs: 3 });
  assert.equal(denied.consumer_locked, true);
  assert.equal(b.calls.length, 0);
  release(); await running;
  assert.equal(value, 'newer'); assert.equal(redis.values.length, 0);
  assert.equal(redis.locks.size, 0);
});

test('Redis mutex acquisition failure is fail-closed and does not expose the Redis error', async () => {
  const redis = redisQueue([job()]);
  redis.set = async () => { throw Error('synthetic-private-redis-address'); };
  const h = harness(undefined, { redis });
  await assert.rejects(h.private.workerTickBatch(), error => {
    assert.equal(error.code, 'REPLICATION_CONSUMER_LOCK_UNAVAILABLE');
    assert.doesNotMatch(error.message, /private-redis/); return true;
  });
  assert.equal(h.calls.length, 0); assert.equal(redis.values.length, 1);
  assert.equal(h.getReplicationStatus().applied, 0);
});

for (const status of [403, 401]) {
  test(`backup HTTP ${status} retains the denied job without granting privileges or retrying HTTP`, async () => {
    const h = harness(async () => response(status, { code: '42501', message: 'permission denied for synthetic-private-ledger',
      details: 'synthetic-private-row-identity' }));
    h.private.memQueue.push(job());
    await h.private.workerTickBatch();
    assert.equal(h.grantCalls, 0);
    assert.equal(h.calls.length, 1);
    assert.equal(h.private.memQueue.length, 1);
    assert.equal(h.private.memQueue[0].retry, 1);
    assert.equal(h.getReplicationStatus().applied, 0);
    assert.match(h.getReplicationStatus().last_error, /REPLICATION_BACKUP_PERMISSION_DENIED/);
    assert.match(h.getReplicationStatus().last_error, new RegExp(`HTTP ${status}`));
    assert.doesNotMatch(JSON.stringify(h.logs), /synthetic-private|GRANT/);
  });
}

test('lost Redis mutex ownership leaves the in-flight job unacknowledged and does not delete another owner lock', async () => {
  const redis = redisQueue([job()]);
  const h = harness(async () => {
    redis.locks.set('supabase:replication:consumer', 'different-owner');
    return response(201);
  }, { redis });
  await assert.rejects(h.private.workerTickBatch(), { code: 'REPLICATION_CONSUMER_LOCK_LOST' });
  assert.equal(redis.values.length, 1);
  assert.equal(redis.locks.get('supabase:replication:consumer'), 'different-owner');
  assert.equal(h.getReplicationStatus().applied, 0);
});

test('preserves the consumed FK response and restores the exact parent chain before the user', async () => {
  const backup = new Set(), writes = [];
  const canonical = { id: 'user-1', department_id: 'department-1' };
  const h = harness(async (url, init) => {
    const table = url.pathname.split('/').pop(), method = init.method || 'GET';
    const id = url.searchParams.get('id')?.slice(3);
    if (method === 'GET' && url.hostname === 'backup.invalid') return response(200, backup.has(id) ? [{ id }] : []);
    if (method === 'GET' && url.hostname === 'primary.invalid')
      return response(200, [table === 'users' ? canonical : { id: 'department-1', company_id: 'company-existing' }]);
    if (method === 'POST') {
      const row = JSON.parse(init.body); writes.push(table);
      if (table === 'users' && !backup.has('department-1')) return response(409, fk('department_id', 'department-1', 'departments'));
      backup.add(row.id); return response(201, [{ id: row.id }]);
    }
    throw Error('unexpected write');
  });
  await h.private.ensureRowOnBackup('users', 'user-1');
  assert.equal(backup.has('user-1'), true);
  assert.deepEqual(writes, ['users', 'departments', 'users']);
  assert.equal(h.calls.some(c => c.init.method === 'PATCH'), false);
});

test('a unique-email alias and zero-row PATCH never count as a restored canonical user', async () => {
  const h = harness(async (url, init) => {
    if (!init.method) return response(200, url.hostname === 'primary.invalid' ? [{ id: 'canonical-user', email: 'synthetic@example.invalid' }] : []);
    if (init.method === 'POST') return response(409, { code: '23505', message: 'users_email_key duplicate' });
    if (init.method === 'PATCH') return response(200, []);
    throw Error('unexpected write');
  });
  await assert.rejects(h.private.ensureRowOnBackup('users', 'canonical-user'), { code: 'REPLICATION_IDENTITY_CONFLICT' });
  assert.equal(h.calls.filter(c => c.init.method === 'PATCH').length, 1);
  assert.equal(h.calls.at(-1).url.includes('id=eq.canonical-user'), true);
  assert.equal(h.calls.some(c => /alias-user/.test(c.url)), false);
});

test('generic writes require an actual single-row ACK with the expected primary ID', async () => {
  for (const rows of [[], [{ id: 'wrong-id' }], undefined]) {
    const h = harness(async () => response(200, rows));
    await assert.rejects(h.private.postRowToBackup('users', { id: 'user-1' }), { code: 'REPLICATION_WRITE_UNCONFIRMED' });
  }
  const h = harness(async () => response(201, [{ id: 'user-1' }]));
  await h.private.postRowToBackup('users', { id: 'user-1' });
});

test('backup read errors and malformed reads are not treated as absent rows', async () => {
  for (const [status, data, code] of [[403, {}, 'REPLICATION_BACKUP_READ_FAILED'],
    [200, {}, 'REPLICATION_BACKUP_READ_INVALID'], [200, [{ id: 'other' }], 'REPLICATION_BACKUP_READ_INVALID']]) {
    const h = harness(async () => response(status, data));
    await assert.rejects(h.private.ensureRowOnBackup('users', 'user-1'), { code });
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].init.method, undefined);
  }
});

test('primary read failures and genuinely missing parents stop before dependent writes', async () => {
  for (const [status, data, code] of [[500, {}, 'REPLICATION_PRIMARY_READ_FAILED'],
    [200, null, 'REPLICATION_PRIMARY_READ_INVALID'], [200, [], 'REPLICATION_PRIMARY_ROW_MISSING']]) {
    const h = harness(async url => response(url.hostname === 'backup.invalid' ? 200 : status,
      url.hostname === 'backup.invalid' ? [] : data));
    await assert.rejects(h.private.ensureRowOnBackup('users', 'user-1'), { code });
    assert.equal(h.calls.some(c => c.init.method), false);
  }
});

test('missing customer evidence never clears the original Facebook contact FK', async () => {
  const contact = { id: 'contact-1', customer_id: 'missing-customer', lead_id: null };
  const h = harness(async () => response(200, []));
  await assert.rejects(h.private.ensureFacebookContactParents(contact), { code: 'REPLICATION_PRIMARY_ROW_MISSING' });
  assert.equal(contact.customer_id, 'missing-customer');
  assert.equal(h.calls.some(c => c.init.method), false);
});

test('natural-key fallback PATCH must acknowledge an existing row', async () => {
  const h = harness(async () => response(200, []));
  await assert.rejects(h.private.patchBackupRowByConflictColumns('widgets', ['name'], { id: 'widget-1', name: 'synthetic' }),
    { code: 'REPLICATION_WRITE_UNCONFIRMED' });
});

test('legacy singular Accept is removed, writes retain only destination auth and require affected rows', async () => {
  const h = harness(async (_url, init) => {
    assert.equal(init.headers.accept, 'application/json');
    assert.match(init.headers.prefer, /return=representation/);
    assert.equal(init.headers.authorization, 'Bearer synthetic-backup');
    assert.equal(init.headers.apikey, 'synthetic-backup');
    assert.equal(init.headers.cookie, undefined);
    return response(200, [{ project_id: 'project-1', stage_id: 'stage-1' }]);
  });
  await h.private.applyRestJob(job({ method: 'PATCH', path: '/rest/v1/project_substage_status?project_id=eq.project-1&stage_id=eq.stage-1',
    headers: { accept: 'application/vnd.pgrst.object+json', authorization: 'Bearer synthetic-primary', cookie: 'synthetic' } }));
  assert.equal(h.calls.length, 1);
  const empty = harness(async () => response(200, []));
  await assert.rejects(empty.private.applyRestJob(job({ method: 'PATCH', path: '/rest/v1/project_substage_status?project_id=eq.project-1' })),
    { code: 'REPLICATION_WRITE_UNCONFIRMED' });
  for (const rows of [[null], [{}], [{ id: 'other-row' }]]) {
    const invalid = harness(async (_url, init) => response(200, init.method ? rows : [{ id: 'widget-1' }]));
    await assert.rejects(invalid.private.applyRestJob(job({ method: 'PATCH', path: '/rest/v1/widgets?id=eq.widget-1' })),
      { code: 'REPLICATION_WRITE_UNCONFIRMED' });
  }
});

test('delete does not resurrect a missing primary row just to delete the backup copy', async () => {
  const h = harness(async (_url, init) => {
    assert.equal(init.method, 'DELETE'); return response(204);
  });
  await h.private.applyRestJob(job({ method: 'DELETE', path: '/rest/v1/widgets?id=eq.deleted-row', body: null }));
  assert.equal(h.calls.length, 1);
});

test('worker retains a real failed operation after 12 attempts and does not apply it early', async () => {
  const h = harness(async () => response(503, { message: 'synthetic outage' }));
  h.private.memQueue.push(job({ retry: 12 }));
  await h.private.workerTickBatch();
  assert.equal(h.private.memQueue.length, 1);
  assert.equal(h.private.memQueue[0].retry, 13);
  assert.equal(h.getReplicationStatus().applied, 0);
  assert.equal(h.getReplicationStatus().failed, 1);
  const before = h.calls.length;
  await h.private.workerTickBatch();
  assert.equal(h.calls.length, before);
  assert.equal(h.private.memQueue.length, 1);
  assert.equal(h.getReplicationStatus().queue_storage, 'process_memory');
});

test('a primary switch before HTTP leaves the pending job untouched for workers and manual drains', async () => {
  for (const action of ['worker', 'drain']) {
    let checks = 0;
    const h = harness(undefined, { target: () => ++checks < 2 ? 'primary' : 'backup' });
    h.private.memQueue.push(job());
    if (action === 'worker') await h.private.workerTickBatch();
    else await h.drainReplicationQueue({ maxJobs: 1 });
    assert.equal(h.private.memQueue.length, 1);
    assert.equal(h.calls.length, 0);
  }
});

test('manual drain is bounded when every retained operation is waiting for backoff', async () => {
  const h = harness(); h.private.memQueue.push(job({ next_attempt_at: new Date(Date.now() + 300000).toISOString() }));
  const result = await h.drainReplicationQueue({ maxJobs: 2 });
  assert.equal(result.processed, 0); assert.equal(result.failed, 0); assert.equal(result.deferred, 1);
  assert.equal(result.remaining, 1); assert.equal(h.calls.length, 0);
});

for (const storage of ['memory', 'redis']) {
  for (const successor of ['PATCH', 'DELETE']) {
    test(`${storage}: blocked older PATCH keeps its position before a later ${successor}, while another row progresses`, async () => {
      const clock = { now: Date.parse('2026-10-15T03:00:00Z') };
      let blocked = true, value = 'initial';
      const queue = [
        job({ id: 'older', method: 'PATCH', path: '/rest/v1/widgets?id=eq.widget-1', body: '{"value":"older"}' }),
        job({ id: 'successor', method: successor, path: '/rest/v1/widgets?id=eq.widget-1', body: successor === 'PATCH' ? '{"value":"newer"}' : null }),
        job({ id: 'unrelated', method: 'PATCH', path: '/rest/v1/widgets?id=eq.widget-2', body: '{"value":"unrelated"}' }),
      ];
      const redis = storage === 'redis' ? redisQueue(queue) : null;
      const h = harness(async (url, init) => {
        const id = url.searchParams.get('id')?.slice(3);
        if (!init.method) return response(200, [{ id }]);
        const pending = redis ? redis.values.map(JSON.parse) : h.private.memQueue;
        assert.equal(pending.some(item => item.id === (id === 'widget-2' ? 'unrelated' : init.method === 'DELETE' ? 'successor' : JSON.parse(init.body).value === 'older' ? 'older' : 'successor')), true,
          'in-flight operation remains queued until HTTP confirmation');
        if (init.method === 'DELETE') { value = 'deleted'; return response(204); }
        const body = JSON.parse(init.body);
        if (body.value === 'older' && blocked) return response(409, { code: '23505', message: 'synthetic conflict' });
        if (id === 'widget-1') value = body.value;
        return response(200, [{ id }]);
      }, { redis, clock });
      if (!redis) h.private.memQueue.push(...queue);
      const pending = () => redis ? redis.values.map(JSON.parse) : h.private.memQueue;
      await h.private.workerTickBatch();
      assert.equal(value, 'initial');
      assert.deepEqual(Array.from(pending(), item => item.id), ['older', 'successor']);
      assert.equal(pending()[0].retry, 1);
      assert.equal(h.getReplicationStatus().applied, 1);
      await h.private.workerTickBatch();
      assert.equal(value, 'initial');
      assert.deepEqual(Array.from(pending(), item => item.id), ['older', 'successor']);
      blocked = false; clock.now += 600000;
      await h.private.workerTickBatch();
      assert.equal(value, successor === 'PATCH' ? 'newer' : 'deleted');
      assert.equal(pending().length, 0);
      assert.equal(h.getReplicationStatus().applied, 3);
    });
  }
  test(`${storage}: an unconfirmed queue ACK retains the operation and never increments applied`, async () => {
    const original = job(), redis = storage === 'redis' ? redisQueue([original]) : null;
    const h = harness(async () => response(201), { redis });
    if (redis) redis.lrem = async () => 0;
    else {
      h.private.memQueue.push(original);
      h.private.memQueue.splice = () => { throw Error('synthetic ACK failure'); };
    }
    await h.private.workerTickBatch();
    const pending = redis ? redis.values.map(JSON.parse) : h.private.memQueue;
    assert.equal(pending.length, 1);
    assert.equal(pending[0].id, original.id);
    assert.equal(pending[0].retry, 1);
    assert.equal(h.getReplicationStatus().applied, 0);
  });
}

test('committed CRM projection queues one stripped REST upsert and never replays its primary RPC', async () => {
  const h = harness();
  const result = await h.enqueueCommittedCrmLeadReplication({ id: 'lead-1', stage_id: 'stage-1', weighted_value: 5, info_complete: true });
  assert.equal(result.enqueued, true);
  const pending = h.private.memQueue;
  assert.equal(pending.length, 1);
  assert.equal(pending[0].path, '/rest/v1/crm_leads?on_conflict=id');
  assert.equal(pending[0].method, 'POST');
  assert.equal(JSON.parse(pending[0].body).stage_id, 'stage-1');
  assert.equal(JSON.parse(pending[0].body).weighted_value, undefined);
  assert.equal(h.calls.length, 0);
  await assert.rejects(h.enqueueCommittedCrmLeadReplication({}), { code: 'REPLICATION_COMMITTED_ROW_INVALID' });
  assert.equal(pending.length, 1);
  const backup = harness(undefined, { target: () => 'backup' });
  assert.equal((await backup.enqueueCommittedCrmLeadReplication({ id: 'lead-1' })).skipped, true);
  assert.equal(backup.private.memQueue.length, 0);
});

test('a delayed committed RPC projection after a source delete cannot resurrect the backup row', async () => {
  const h = harness(async (url, init) => {
    if (url.hostname === 'primary.invalid') return response(200, []);
    assert.equal(init.method, 'DELETE'); return response(204);
  });
  h.private.memQueue.push(job({ id: 'concurrent-delete', method: 'DELETE', path: '/rest/v1/crm_leads?id=eq.lead-1', body: null }));
  await h.enqueueCommittedCrmLeadReplication({ id: 'lead-1', name: 'stale RPC snapshot' });
  const result = await h.private.workerTickBatch();
  assert.equal(result.processed, 2);
  assert.equal(h.calls.filter(call => call.init.method === 'POST').length, 0);
  assert.equal(h.calls.filter(call => call.init.method === 'DELETE').length, 2);
  assert.equal(h.private.memQueue.length, 0);
});

test('a committed projection mirrors a newer current primary row and retains itself on primary read error', async () => {
  const h = harness(async (url, init) => {
    if (url.hostname === 'primary.invalid') return response(200, [{ id: 'lead-1', name: 'new current value', company_id: null, code: null, type: 'lead' }]);
    if (!init.method) return response(200, []);
    assert.equal(JSON.parse(init.body).name, 'new current value');
    return response(201, [{ id: 'lead-1' }]);
  });
  await h.enqueueCommittedCrmLeadReplication({ id: 'lead-1', name: 'stale RPC snapshot' });
  await h.private.workerTickBatch();
  assert.equal(h.private.memQueue.length, 0);
  const failure = harness(async () => response(503, {}));
  await failure.enqueueCommittedCrmLeadReplication({ id: 'lead-1' });
  await failure.private.workerTickBatch();
  assert.equal(failure.private.memQueue.length, 1);
  assert.equal(failure.getReplicationStatus().applied, 0);
  assert.equal(failure.calls.some(call => call.init.method), false);
});

test('same-code lead collisions never rewrite another UUID, including within the same company', async () => {
  for (const company of ['source-company', 'other-company']) {
    const h = harness(async (url, init) => {
      assert.equal(init.method, undefined, 'identity conflict must stop before any write');
      assert.doesNotMatch(url.searchParams.get('select') || '', /tenant_id/);
      return response(200, url.searchParams.has('code') ? [{ id: 'backup-alias', company_id: company, type: 'lead' }] : []);
    });
    await assert.rejects(h.private.postRowToBackup('crm_leads', { id: 'canonical-lead', code: 'SYNTHETIC-1', type: 'lead',
      company_id: 'source-company' }), { code: 'REPLICATION_IDENTITY_CONFLICT' });
    assert.equal(h.calls.some(call => call.init.method), false);
  }
});

test('cross-type same-code aliases are retained before an insert or a deleted projection can create duplicates', async () => {
  for (const missing of [false, true]) {
    const h = harness(async (url, init) => {
      assert.equal(init.method, undefined);
      if (url.hostname === 'primary.invalid') return response(200, missing ? [] : [{ id: 'canonical-deal', type: 'deal', code: 'SYNTHETIC-1', company_id: 'company-1' }]);
      if (url.searchParams.has('code')) {
        assert.equal(url.searchParams.has('type'), false, 'identity checks must inspect aliases across every CRM type');
        return response(200, [{ id: 'old-lead-alias', type: 'lead', company_id: 'company-1' }]);
      }
      return response(200, []);
    });
    await h.enqueueCommittedCrmLeadReplication({ id: 'canonical-deal', type: 'deal', code: 'SYNTHETIC-1', company_id: 'company-1' });
    await h.private.workerTickBatch();
    assert.equal(h.private.memQueue.length, 1);
    assert.equal(h.getReplicationStatus().applied, 0);
    assert.match(h.getReplicationStatus().last_error, /REPLICATION_IDENTITY_CONFLICT/);
    assert.equal(h.calls.some(call => call.init.method), false);
  }
});

test('same UUID with a different company is retained instead of moving the backup lead context', async () => {
  const h = harness(async (url, init) => {
    assert.equal(init.method, undefined);
    assert.doesNotMatch(url.searchParams.get('select') || '', /tenant_id/);
    if (url.hostname === 'primary.invalid') return response(200, [{ id: 'lead-1', company_id: 'source-company', code: null, type: 'lead' }]);
    return response(200, [{ id: 'lead-1', company_id: 'other-company' }]);
  });
  h.private.memQueue.push(job({ method: 'PATCH', path: '/rest/v1/crm_leads?id=eq.lead-1',
    body: '{"company_id":"source-company"}' }));
  await h.private.workerTickBatch();
  assert.equal(h.private.memQueue.length, 1);
  assert.match(h.getReplicationStatus().last_error, /REPLICATION_IDENTITY_CONFLICT/);
  assert.equal(h.getReplicationStatus().applied, 0);
});

test('a stage-only CRM PATCH checks current primary ownership before touching a foreign-company backup row', async () => {
  const h = harness(async (url, init) => {
    assert.equal(init.method, undefined, 'ownership guard must run before every backup write');
    if (url.hostname === 'primary.invalid') return response(200, [{ id: 'lead-1', company_id: 'source-company', code: null, type: 'lead' }]);
    return response(200, [{ id: 'lead-1', company_id: 'other-company' }]);
  });
  h.private.memQueue.push(job({ method: 'PATCH', path: '/rest/v1/crm_leads?id=eq.lead-1', body: '{"stage_id":"stage-next"}' }));
  await h.private.workerTickBatch();
  assert.equal(h.private.memQueue.length, 1);
  assert.equal(h.private.memQueue[0].body, '{"stage_id":"stage-next"}');
  assert.equal(h.getReplicationStatus().applied, 0);
  assert.match(h.getReplicationStatus().last_error, /REPLICATION_IDENTITY_CONFLICT/);
});

test('verified source deletion reconciles an obsolete single-row PATCH before its queued DELETE without deadlock', async () => {
  const h = harness(async (url, init) => {
    if (url.hostname === 'primary.invalid') return response(200, []);
    assert.equal(init.method, 'DELETE'); return response(204);
  });
  h.private.memQueue.push(
    job({ id: 'old-stage-patch', method: 'PATCH', path: '/rest/v1/crm_leads?id=eq.lead-1', body: '{"stage_id":"old-stage"}' }),
    job({ id: 'new-delete', method: 'DELETE', path: '/rest/v1/crm_leads?id=eq.lead-1', body: null }));
  const result = await h.private.workerTickBatch();
  assert.equal(result.processed, 2); assert.equal(result.failed, 0);
  assert.equal(h.private.memQueue.length, 0);
  assert.equal(h.calls.filter(call => call.init.method === 'DELETE').length, 2);
  assert.equal(h.calls.some(call => call.init.method === 'PATCH' || call.init.method === 'POST'), false);
});

test('a stale supplied code is checked before sending the original body even when primary now uses another code', async () => {
  const h = harness(async (url, init) => {
    assert.equal(init.method, undefined, 'stale supplied-code alias must stop before any write');
    if (url.hostname === 'primary.invalid') return response(200, [{ id: 'lead-1', company_id: 'company-1', type: 'deal', code: 'CURRENT' }]);
    if (url.searchParams.get('code') === 'eq.OLD') return response(200, [{ id: 'alias-other-id', company_id: 'company-1', type: 'lead' }]);
    return response(200, []);
  });
  h.private.memQueue.push(job({ method: 'POST', path: '/rest/v1/crm_leads?on_conflict=id',
    body: '{"id":"lead-1","company_id":"company-1","type":"deal","code":"OLD"}' }));
  await h.private.workerTickBatch();
  assert.equal(h.private.memQueue.length, 1);
  assert.equal(h.getReplicationStatus().applied, 0);
  assert.match(h.getReplicationStatus().last_error, /REPLICATION_IDENTITY_CONFLICT/);
  assert.equal(h.calls.some(call => call.init.method), false);
});

test('matching CRM UUID and company can replicate using only the actual lead schema columns', async () => {
  const sourceRow = { id: 'lead-1', code: 'SYNTHETIC-1', type: 'lead', company_id: 'source-company' };
  const allowed = new Set(['id', 'code', 'type', 'company_id']);
  const h = harness(async (url, init) => {
    const selected = url.searchParams.get('select');
    if (selected) assert.equal(selected.split(',').every(column => allowed.has(column)), true);
    if (!init.method) return response(200, [sourceRow]);
    assert.equal(init.method, 'PATCH');
    assert.equal(url.searchParams.get('id'), 'eq.lead-1');
    return response(200, [{ id: 'lead-1' }]);
  });
  await h.private.postRowToBackup('crm_leads', sourceRow);
  assert.equal(h.calls.filter(call => call.init.method === 'PATCH').length, 1);
});

test('a deleted committed projection with an unresolved code alias stays queued without deleting or resurrecting either UUID', async () => {
  const h = harness(async (url, init) => {
    assert.equal(init.method, undefined);
    if (url.hostname === 'primary.invalid') return response(200, []);
    assert.doesNotMatch(url.searchParams.get('select') || '', /tenant_id/);
    return response(200, url.searchParams.has('code') ? [{ id: 'backup-alias', company_id: 'source-company', type: 'lead' }] : []);
  });
  await h.enqueueCommittedCrmLeadReplication({ id: 'lead-1', code: 'SYNTHETIC-1', type: 'lead', company_id: 'source-company' });
  await h.private.workerTickBatch();
  assert.equal(h.private.memQueue.length, 1);
  assert.equal(h.getReplicationStatus().applied, 0);
  assert.match(h.getReplicationStatus().last_error, /REPLICATION_IDENTITY_CONFLICT/);
  assert.equal(h.calls.some(call => call.init.method), false);
});

test('queued jobs omit primary credentials and exposed errors omit row IDs and contact details', async () => {
  const h = harness();
  h.maybeEnqueueRestReplication('https://primary.invalid/rest/v1/widgets', { method: 'POST',
    headers: { Authorization: 'Bearer synthetic-primary', apikey: 'synthetic-primary', Cookie: 'synthetic' }, body: '{"id":"widget-1"}' }, { status: 201 });
  await Promise.resolve();
  const headers = h.private.memQueue[0].headers;
  assert.doesNotMatch(JSON.stringify(headers), /synthetic-primary|Cookie|Authorization/i);
  const error = Error('backup upsert crm_leads → 409 ' + JSON.stringify(fk('assigned_to', 'private-user-id', 'users')));
  const summary = h.private.replicationErrorSummary(error);
  assert.match(summary, /23503/); assert.match(summary, /parent=users column=assigned_to/);
  assert.doesNotMatch(summary, /private-user-id|details|Key/);
});
