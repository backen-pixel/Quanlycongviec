'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const qualification = require('../src/modules/marketingAutomation/qualification');

const companyId = '11111111-1111-4111-8111-111111111111';
const otherCompanyId = '22222222-2222-4222-8222-222222222222';
const actorId = '33333333-3333-4333-8333-333333333333';
const canonicalLeadId = '44444444-4444-4444-8444-444444444444';
const base = { companyId, actorId, canonicalLeadId };
const flags = { contact_usable: true, need_in_scope: true, area_in_service: true };
const error = code => ({ data: null, error: { message: code, code } });
function fakeDb() {
  const events = [], calls = [];
  let raceOnce = false;
  return { events, calls, race() { raceOnce = true; },
    async rpc(name, args) {
      calls.push({ name, args });
      const company = args._company_id, lead = args._canonical_lead_id;
      const matching = events.filter(e => e.company_id === company && e.canonical_lead_id === lead);
      if (name === 'p1_qualification_state_v1') return { data: matching.at(-1) || null, error: null };
      assert.equal(name, 'p1_qualification_command_v1');
      if (raceOnce) { raceOnce = false; return error('23505'); }
      const { _command: kind, _actor_id: actor, _request_id: request,
        _expected_revision: revision, _payload: payload } = args;
      const input = { kind, lead, revision, payload, actor };
      const prior = events.find(e => e.company_id === company && e.request_id === request);
      if (prior) return JSON.stringify(prior.input) === JSON.stringify(input)
        ? { data: { event: prior }, error: null } : error('REQUEST_CONFLICT');
      if (!['set','revoke'].includes(kind) || !payload || Array.isArray(payload)) return error('INVALID_COMMAND');
      const allowed = kind === 'set'
        ? ['status','contact_usable','need_in_scope','area_in_service','evidence_ref','reason','context_hash']
        : ['reason','context_hash'];
      if (Object.keys(payload).some(key => !allowed.includes(key))) return error('INVALID_COMMAND');
      if (kind === 'set' && (!['PENDING','QUALIFIED','REJECTED'].includes(payload.status)
        || ['contact_usable','need_in_scope','area_in_service'].some(key => typeof payload[key] !== 'boolean')))
        return error('INVALID_COMMAND');
      const status = kind === 'revoke' ? 'PENDING' : payload.status;
      if ((status === 'REJECTED' || kind === 'revoke') && !payload.reason?.trim()) return error('REASON_REQUIRED');
      if (status === 'QUALIFIED' && !payload.evidence_ref?.trim()) return error('EVIDENCE_REQUIRED');
      if (status === 'QUALIFIED' && Object.keys(flags).some(key => payload[key] !== true)) return error('INVALID_COMMAND');
      if (!matching.length && events.some(e => e.canonical_lead_id === lead)) return error('COMPANY_MISMATCH');
      if ((matching.at(-1)?.revision || 0) !== revision) return error('REVISION_CONFLICT');
      const event = { id: `synthetic-${events.length + 1}`, company_id: company,
        canonical_lead_id: lead, revision: revision + 1, status,
        contact_usable: kind === 'revoke' ? false : payload.contact_usable,
        need_in_scope: kind === 'revoke' ? false : payload.need_in_scope,
        area_in_service: kind === 'revoke' ? false : payload.area_in_service,
        evidence_ref: payload.evidence_ref || null, reason: payload.reason || null,
        actor_id: actor, request_id: request, input };
      events.push(event);
      return { data: { event }, error: null };
    }
  };
}
const set = (db, requestId, expectedRevision, payload, rest = {}) =>
  qualification.setQualification(db, { ...base, ...rest, requestId, expectedRevision, payload });
const revoke = (db, requestId, expectedRevision, payload) =>
  qualification.revokeQualification(db, { ...base, requestId, expectedRevision, payload });

test('admin policy is company scoped and role list is injectable', () => {
  const can = qualification.canMarkQualified;
  assert.equal(can({ role: 'admin', userCompanyId: companyId }, companyId), true);
  assert.equal(can({ role: 'admin', userCompanyId: otherCompanyId }, companyId), false);
  assert.equal(can({ role: 'admin', userCompanyId: null }, companyId), true);
  assert.equal(can({ role: 'admin', userCompanyId: '' }, companyId), true);
  assert.equal(can({ role: 'sales_admin', userCompanyId: companyId }, companyId), false);
  assert.equal(can({ role: '', userCompanyId: null }, companyId), false);
  assert.equal(can({ role: 'admin', userCompanyId: null }, ''), false);
  assert.equal(can({ role: 'admin', userCompanyId: 1 }, companyId), false);
  assert.equal(can({ role: 'admin', userCompanyId: companyId }, 1), false);
  assert.equal(can({ role: 'sales_admin', userCompanyId: companyId }, companyId, ['sales_admin']), true);
});

test('PENDING → QUALIFIED → REJECTED → revoke creates one event per command', async () => {
  const db = fakeDb();
  let event = (await set(db, 'pending', 0, { status: 'PENDING', ...flags })).event;
  assert.equal(event.revision, 1);
  event = (await set(db, 'qualified', 1, { status: 'QUALIFIED', ...flags, evidence_ref: 'proof-A' })).event;
  assert.equal(event.revision, 2);
  event = (await set(db, 'rejected', 2, { status: 'REJECTED', ...flags, reason: 'Out of scope' })).event;
  assert.equal(event.revision, 3);
  event = (await revoke(db, 'revoke', 3, { reason: 'Review reopened' })).event;
  assert.equal(event.status, 'PENDING'); assert.equal(event.revision, 4);
  assert.equal(event.contact_usable, false);
  assert.deepEqual(await qualification.getQualification(db, base), event);
  assert.equal(db.events.length, 4);
});

test('qualification requires all flags and evidence; rejected and revoke require reason', async () => {
  const db = fakeDb();
  await assert.rejects(set(db, 'flag', 0, { status: 'QUALIFIED', ...flags, area_in_service: false,
    evidence_ref: 'proof-A' }), { code: 'INVALID_COMMAND' });
  await assert.rejects(set(db, 'evidence', 0, { status: 'QUALIFIED', ...flags }), { code: 'EVIDENCE_REQUIRED' });
  await assert.rejects(set(db, 'reject', 0, { status: 'REJECTED', ...flags }), { code: 'REASON_REQUIRED' });
  await assert.rejects(revoke(db, 'revoke', 0, {}), { code: 'REASON_REQUIRED' });
  assert.equal(db.events.length, 0);
});

test('revision, replay, unknown payload and company guards', async () => {
  const db = fakeDb(), payload = { status: 'PENDING', ...flags };
  const first = await set(db, 'first', 0, payload);
  assert.deepEqual(await set(db, 'first', 0, payload), first);
  await assert.rejects(set(db, 'first', 0, { ...payload, reason: 'Changed' }), { code: 'REQUEST_CONFLICT' });
  await assert.rejects(set(db, 'stale', 0, payload), { code: 'REVISION_CONFLICT' });
  await assert.rejects(set(db, 'unknown', 1, { ...payload, unexpected: true }), { code: 'INVALID_COMMAND' });
  await assert.rejects(set(db, 'foreign', 0, payload, { companyId: otherCompanyId }), { code: 'COMPANY_MISMATCH' });
  assert.equal(await qualification.getQualification(db, { companyId: otherCompanyId, canonicalLeadId }), null);
  assert.equal(db.events.length, 1);
});

test('adapter checks empty arguments and retries one unique race', async () => {
  const db = fakeDb(); db.race();
  await set(db, 'retry', 0, { status: 'PENDING', ...flags });
  assert.equal(db.calls.length, 2); assert.equal(db.events.length, 1);
  await assert.rejects(set(db, '', 1, { status: 'PENDING', ...flags }), { code: 'INVALID_REQUEST' });
  await assert.rejects(set(db, 'bad', -1, { status: 'PENDING', ...flags }), { code: 'INVALID_COMMAND' });
  await assert.rejects(qualification.getQualification(db, { companyId, canonicalLeadId: '' }), { code: 'INVALID_LEAD' });
});

test('SQL has local guards and only P1 table alterations (static check, not SQL execution)', () => {
  const moduleText = fs.readFileSync(path.join(__dirname, '../src/modules/marketingAutomation/qualification.js'), 'utf8');
  assert.doesNotMatch(moduleText, /process\.env|leadQuality\.js/);
  for (const suffix of ['', '_rollback']) {
    const sql = fs.readFileSync(path.join(__dirname, `../../database/712_p1_qualification${suffix}.sql`), 'utf8');
    for (const guard of [/lock_timeout/i, /ENABLE ROW LEVEL SECURITY/i, /REVOKE ALL/i,
      /REVOKE ALL[^;]+FROM[^;]*\bservice_role\b/i]) assert.match(sql, guard);
    for (const forbidden of [/CREATE\s+TRIGGER/i, /LOCK\s+TABLE/i, /pg_advisory/i,
      /ALTER\s+TABLE\s+(?!public\.p1_qualification_events\b)/i]) assert.doesNotMatch(sql, forbidden);
  }
});
