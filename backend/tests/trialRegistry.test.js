'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const registry = require('../src/modules/marketingAutomation/trialRegistry');

const companyId = '11111111-1111-4111-8111-111111111111';
const actorId = '22222222-2222-4222-8222-222222222222';
const base = { companyId, actorId };
function fakeDb() {
  const trials = new Map(), scopes = [], events = new Map();
  let next = 0;
  const error = code => ({ data: null, error: { message: code, code } });
  return { trials, scopes, events,
    from(table) {
      assert.equal(table, 'p1_trials');
      return { select: () => ({ eq: (_field, id) => ({ maybeSingle: async () =>
        ({ data: trials.get(id) || null, error: null }) }) }) };
    },
    async rpc(name, a) {
      assert.equal(name, 'p1_trial_command_v1');
      const { _command: kind, _company_id: company, _actor_id: actor,
        _request_id: request, _trial_id: id, _expected_revision: rev, _payload: p } = a;
      const key = `${company}/${request}`, input = JSON.stringify([kind,id,rev,p,actor]);
      if (events.has(key)) {
        const prior = events.get(key);
        return prior.input === input ? { data: prior.result, error: null } : error('REQUEST_CONFLICT');
      }
      let t = trials.get(id), scope = null;
      if (kind === 'create') {
        if (!p.name || (p.hcm_share_pct ?? 80) + (p.can_tho_share_pct ?? 20) !== 100) return error('INVALID_COMMAND');
        t = { id: `trial-${++next}`, company_id: company, name: p.name, timezone: p.timezone || 'Asia/Ho_Chi_Minh',
          start_date: p.start_date || null, end_date: p.end_date || null, cap_vnd: p.cap_vnd ?? 100000000,
          hcm_share_pct: p.hcm_share_pct ?? 80, can_tho_share_pct: p.can_tho_share_pct ?? 20,
          status: 'DRAFT', revision: 1 };
        trials.set(t.id, t);
      } else {
        if (!t) return error('TRIAL_NOT_FOUND');
        if (t.company_id !== company) return error('COMPANY_MISMATCH');
        if (t.revision !== rev) return error('REVISION_CONFLICT');
        if (t.status === 'CLOSED') return error('TRIAL_CLOSED');
        if (kind === 'update') {
          if (t.status === 'APPROVED' && !p.reason) return error('REASON_REQUIRED');
          t = { ...t, ...p, status: 'DRAFT', revision: rev + 1 };
        } else if (kind === 'scope') {
          if (t.status === 'APPROVED' && !p.reason) return error('REASON_REQUIRED');
          scope = { ...p, id: `scope-${scopes.length + 1}`, company_id: company, trial_id: id };
          scopes.push(scope); t = { ...t, status: 'DRAFT', revision: rev + 1 };
        } else if (kind === 'approve') {
          const days = t.start_date && t.end_date &&
            (Date.parse(t.end_date) - Date.parse(t.start_date)) / 86400000;
          if (!scopes.some(s => s.trial_id === id) || days !== 29 ||
            t.hcm_share_pct + t.can_tho_share_pct !== 100) return error('TRIAL_NOT_READY');
          t = { ...t, status: 'APPROVED', revision: rev + 1, approved_by: actor };
        } else if (kind === 'close') {
          if (t.status !== 'APPROVED') return error('INVALID_STATE');
          t = { ...t, status: 'CLOSED', revision: rev + 1 };
        }
        trials.set(id, t);
      }
      const result = { trial: t, scope };
      events.set(key, { input, result });
      return { data: result, error: null };
    }
  };
}
const draft = (db, requestId = 'create', payload = { name: 'Đợt giả lập' }) =>
  registry.createDraftTrial(db, { ...base, requestId, payload });
const act = (db, fn, trial, requestId, payload = {}) =>
  registry[fn](db, { ...base, requestId, trialId: trial.id, expectedRevision: trial.revision, payload });
async function prepared(db, endDate = '2026-10-30') {
  let t = (await draft(db, 'create', { name: 'Đợt giả lập', start_date: '2026-10-01', end_date: endDate })).trial;
  t = (await act(db, 'addScope', t, 'scope', { provider: 'FACEBOOK', account_id: 'synthetic-account' })).trial;
  return t;
}

test('DRAFT accepts unknown dates; approve rejects missing dates or scope', async () => {
  const db = fakeDb(); let t = (await draft(db)).trial;
  assert.equal(t.start_date, null);
  await assert.rejects(act(db, 'approveTrial', t, 'approve'), { code: 'TRIAL_NOT_READY' });
  t = (await act(db, 'updateDraftTrial', t, 'dates', { start_date: '2026-10-01', end_date: '2026-10-30' })).trial;
  await assert.rejects(act(db, 'approveTrial', t, 'approve'), { code: 'TRIAL_NOT_READY' });
  assert.equal(db.events.size, 2);
});
test('30 calendar days approves; 29 and 31 do not', async () => {
  for (const [end, valid] of [['2026-10-29',false],['2026-10-30',true],['2026-10-31',false]]) {
    const db = fakeDb(), t = await prepared(db, end);
    if (valid) assert.equal((await act(db, 'approveTrial', t, 'approve')).trial.status, 'APPROVED');
    else await assert.rejects(act(db, 'approveTrial', t, 'approve'), { code: 'TRIAL_NOT_READY' });
  }
});
test('share, revision, replay payload and company guards', async () => {
  const db = fakeDb();
  await assert.rejects(draft(db, 'bad', { name: 'x', hcm_share_pct: 79 }), { code: 'INVALID_COMMAND' });
  const first = await draft(db); assert.deepEqual(await draft(db), first);
  assert.equal(db.trials.size, 1); assert.equal(db.events.size, 1);
  await assert.rejects(draft(db, 'create', { name: 'khác' }), { code: 'REQUEST_CONFLICT' });
  await assert.rejects(registry.updateDraftTrial(db, { ...base, requestId: 'stale', trialId: first.trial.id,
    expectedRevision: 2, payload: { name: 'x' } }), { code: 'REVISION_CONFLICT' });
  await assert.rejects(registry.getTrial(db, { companyId: actorId, trialId: first.trial.id }), { code: 'COMPANY_MISMATCH' });
  await assert.rejects(registry.closeTrial(db, { ...base, companyId: actorId, requestId: 'wrong',
    trialId: first.trial.id, expectedRevision: 1 }), { code: 'COMPANY_MISMATCH' });
  await assert.rejects(registry.createDraftTrial(db, { ...base, actorId: '', requestId: 'empty-actor',
    payload: { name: 'x' } }), { code: 'INVALID_ACTOR' });
});
test('each successful command has one event; approved revision needs reason; closed is final', async () => {
  const db = fakeDb(); let t = await prepared(db);
  t = (await act(db, 'approveTrial', t, 'approve')).trial;
  assert.equal(db.events.size, 3);
  await assert.rejects(act(db, 'updateDraftTrial', t, 'no-reason', { name: 'new' }), { code: 'REASON_REQUIRED' });
  t = (await act(db, 'updateDraftTrial', t, 'revise', { name: 'new', reason: 'Correction' })).trial;
  assert.equal(t.status, 'DRAFT'); assert.equal(db.events.size, 4);
  t = (await act(db, 'approveTrial', t, 'reapprove')).trial;
  t = (await act(db, 'closeTrial', t, 'close')).trial;
  assert.equal(db.events.size, 6);
  await assert.rejects(act(db, 'updateDraftTrial', t, 'late', { name: 'x' }), { code: 'TRIAL_CLOSED' });
  await assert.rejects(act(db, 'addScope', t, 'late-scope', { provider: 'GOOGLE', account_id: 'x' }), { code: 'TRIAL_CLOSED' });
});
test('SQL safety guards and no environment access', () => {
  const moduleText = fs.readFileSync(path.join(__dirname, '../src/modules/marketingAutomation/trialRegistry.js'), 'utf8');
  assert.doesNotMatch(moduleText, /process\.env/);
  for (const suffix of ['', '_rollback']) {
    const sql = fs.readFileSync(path.join(__dirname, `../../database/710_p1_trial_registry${suffix}.sql`), 'utf8');
    for (const guard of [/lock_timeout/i, /ENABLE ROW LEVEL SECURITY/i, /REVOKE ALL/i]) assert.match(sql, guard);
    for (const forbidden of [/CREATE\s+TRIGGER/i, /LOCK\s+TABLE/i, /pg_advisory/i,
      /ALTER\s+TABLE\s+(?!public\.(?:p1_(?:trials|trial_scopes|trial_config_events)|%I))(?:\w|%)+/i]) assert.doesNotMatch(sql, forbidden);
  }
});
