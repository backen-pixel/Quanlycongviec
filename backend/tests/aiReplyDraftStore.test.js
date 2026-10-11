'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const store = require('../src/modules/aiReplyDraft/store');
const companyId = '11111111-1111-4111-8111-111111111111';
const leadId = '22222222-2222-4222-8222-222222222222';
const draftId = '33333333-3333-4333-8333-333333333333';
const input = { companyId, leadId, draftId, requestId: 'r1', expectedRevision: 0,
  payload: { draft_text: 'Xin chào' } };

test('adapter maps command names, errors and retries one unique race', async () => {
  const calls = [];
  const db = { async rpc(name, args) {
    calls.push({ name, args });
    return calls.length === 1 ? { error: { code: '23505' } }
      : { data: { event: { kind: 'GENERATED' } } };
  } };
  assert.equal((await store.recordGenerated(db, input)).event.kind, 'GENERATED');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].args._command, 'generated');
  await assert.rejects(store.recordEdited(db, input), { code: 'INVALID_COMMAND' });
  await assert.rejects(store.recordGenerated(db, { ...input, requestId: '' }), { code: 'INVALID_REQUEST' });
  const conflict = { rpc: async () => ({ error: { message: 'REQUEST_CONFLICT' } }) };
  await assert.rejects(store.recordDiscarded(conflict, input), { code: 'REQUEST_CONFLICT' });
});

test('usage maps SQL names and validates day', async () => {
  const db = { rpc: async () => ({ data: { drafts: 2, tokens: 15, vnd: 4, drafts_for_lead: 1 } }) };
  assert.deepEqual(await store.getUsage(db, { companyId, leadId, day: '2026-10-08' }),
    { drafts: 2, tokens: 15, vnd: 4, draftsForLead: 1 });
  await assert.rejects(store.getUsage(db, { companyId, leadId, day: 'bad' }), { code: 'INVALID_DAY' });
});

test('SQL has guarded invoker RPC, append-only grants and no locking trigger', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../../database/714_ai_reply_drafts.sql'), 'utf8');
  const rollback = fs.readFileSync(path.join(__dirname, '../../database/714_ai_reply_drafts_rollback.sql'), 'utf8');
  for (const guard of [/lock_timeout/i, /ENABLE ROW LEVEL SECURITY/i, /REVOKE ALL[^;]+FROM service_role/i]) assert.match(rollback, guard);
  for (const guard of [/lock_timeout/i, /ENABLE ROW LEVEL SECURITY/i,
    /REVOKE ALL[^;]+FROM service_role/i, /GRANT SELECT, INSERT/i,
    /SECURITY INVOKER SET search_path = ''/i, /REQUEST_CONFLICT/,
    /REVISION_CONFLICT/, /COMPANY_MISMATCH/, /INVALID_COMMAND/, /DRAFT_CLOSED/,
    /'generated','discarded','edited','sent_by_human','rejected'/]) assert.match(sql, guard);
  for (const forbidden of [/CREATE\s+TRIGGER/i, /LOCK\s+TABLE/i, /pg_advisory/i,
    /GRANT (?:UPDATE|DELETE)/i]) { assert.doesNotMatch(sql, forbidden); assert.doesNotMatch(rollback, forbidden); }
});
