'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeDrafts } = require('../src/modules/aiReplyDraft/report');

const ev = (draft_id, revision, kind, extra = {}) => ({ draft_id, revision, kind, ...extra });

test('classifies each draft by its first and last event', () => {
  const r = summarizeDrafts([
    ev('a', 1, 'GENERATED', { cost_vnd: 3, prompt_tokens: 300, completion_tokens: 50 }), ev('a', 2, 'SENT_BY_HUMAN'),
    ev('b', 1, 'GENERATED', { cost_vnd: 3 }), ev('b', 2, 'EDITED'), ev('b', 3, 'SENT_BY_HUMAN'),
    ev('c', 1, 'GENERATED', { cost_vnd: 2 }), ev('c', 2, 'REJECTED'),
    ev('d', 1, 'GENERATED', { cost_vnd: 2 }),
    ev('e', 1, 'DISCARDED', { cost_vnd: 1, policy_reasons: ['WRONG_PRONOUN', 'TOO_LONG'] }),
    ev('f', 1, 'DISCARDED', { cost_vnd: 1, policy_reasons: ['WRONG_PRONOUN'] }),
  ]);
  assert.deepEqual({ ...r, discard_reasons: { ...r.discard_reasons } }, {
    generated: 4, discarded: 2, sent_unchanged: 1, sent_edited: 1, rejected: 1, pending: 1, sent: 2,
    cost_vnd: 12, tokens: 350, discard_reasons: { WRONG_PRONOUN: 2, TOO_LONG: 1 }, use_rate_pct: 67 });
});
test('order of rows does not matter and empty input is safe', () => {
  const r = summarizeDrafts([ev('a', 2, 'SENT_BY_HUMAN'), ev('a', 1, 'GENERATED')]);
  assert.equal(r.sent_unchanged, 1);
  const empty = summarizeDrafts([]);
  assert.equal(empty.generated, 0);
  assert.equal(empty.use_rate_pct, null);
  assert.equal(summarizeDrafts(null).cost_vnd, 0);
});
test('bad cost values count as zero, not NaN', () => {
  assert.equal(summarizeDrafts([ev('a', 1, 'GENERATED', { cost_vnd: 'x' })]).cost_vnd, 0);
});
