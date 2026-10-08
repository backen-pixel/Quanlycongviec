'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { MILESTONE_SLUGS, loadMilestoneReached, summarizeMilestone } =
  require('../src/modules/marketingAutomation/stageMilestone');

const touch = (lead_id, cham_dau_luc = '2026-10-07T02:42:44.061Z') =>
  ({ lead_id, cham_dau_luc });
const stage = (lead_id, slug, entered_at, changed_by = 'staff') =>
  ({ lead_id, to_canonical_slug: slug, entered_at, changed_by });
function dbRows(rows, fail = false) {
  const chunks = [], pages = [];
  return { chunks, pages, from(name) {
    assert.equal(name, 'crm_lead_stage_history');
    let selected = rows, start = 0, end = 0;
    const q = {
      select() { return q; },
      in(key, values) { if (key === 'lead_id') chunks.push(values);
        selected = selected.filter(row => values.includes(row[key])); return q; },
      not(key) { selected = selected.filter(row => row[key] != null); return q; },
      order() { return q; },
      range(a, b) { start = a; end = b + 1; pages.push(a); return q; },
      then(resolve) { return Promise.resolve({ data: selected.slice(start, end),
        error: fail ? Error('private DB') : null }).then(resolve); },
    };
    return q;
  } };
}

test('only human milestone transitions after touch count; timestamps are absolute', async () => {
  const rows = [stage('a', 'cold', '2026-10-08T00:00:00Z'),
    stage('a', 'lost', '2026-10-08T00:00:00Z'), stage('a', null, '2026-10-08T00:00:00Z'),
    stage('a', 'warm', '2026-10-08T00:00:00Z'),
    stage('a', 'hot', '2026-10-07T02:42:44Z'),
    stage('a', 'hot', '2026-10-07 02:42:44.061234+00'),
    stage('a', 'quoted', '2026-10-07T04:00:00Z'),
    stage('a', 'hot', '2026-10-07T03:00:00Z', ''),
    stage('a', 'hot', 'broken'), stage('b', 'completed', '2026-10-08T00:00:00Z')];
  const result = await loadMilestoneReached(dbRows(rows), [touch('a'), touch('b')]);
  assert.deepEqual([...result.reachedByLead.keys()], ['a', 'b']);
  assert.equal(result.reachedByLead.get('a'), '2026-10-07 02:42:44.061234+00');
  assert.equal(result.invalidTimestamps, 1);
  assert.ok(!MILESTONE_SLUGS.includes('lost'));
});

test('cold, warm and hot each make a lead valid; unclassified or lost leads do not', async () => {
  const rows = [stage('cold-only', 'cold', '2026-10-07T04:00:00Z'), stage('warm-only', 'warm', '2026-10-07T04:00:00Z'),
    stage('hot-only', 'hot', '2026-10-07T04:00:00Z'), stage('new-only', 'lead_new', '2026-10-07T04:00:00Z'),
    stage('silent', 'not_contacted', '2026-10-07T04:00:00Z'), stage('gone', 'lost', '2026-10-07T04:00:00Z'),
    stage('unmapped', null, '2026-10-07T04:00:00Z')];
  const ids = ['cold-only', 'warm-only', 'hot-only', 'new-only', 'silent', 'gone', 'unmapped'];
  const result = await loadMilestoneReached(dbRows(rows), ids.map(id => touch(id)));
  assert.deepEqual([...result.reachedByLead.keys()].sort(), ['cold-only', 'hot-only', 'warm-only']);
  for (const slug of ['cold', 'warm', 'hot']) assert.ok(MILESTONE_SLUGS.includes(slug));
});

test('history pages and lead chunks are complete; DB errors throw', async () => {
  const candidates = Array.from({ length: 101 }, (_, i) => touch(`lead-${i}`));
  const rows = [...Array.from({ length: 501 }, (_, i) =>
    stage('lead-0', 'hot', new Date(Date.parse('2026-10-07T03:00:00Z') + i).toISOString())),
  stage('lead-100', 'hot', '2026-10-08T00:00:00Z')];
  const db = dbRows(rows), result = await loadMilestoneReached(db, candidates);
  assert.equal(db.chunks[0].length, 100); assert.equal(db.chunks.at(-1).length, 1);
  assert.ok(db.pages.includes(500)); assert.equal(result.reachedByLead.size, 2);
  await assert.rejects(loadMilestoneReached(dbRows(rows, true), candidates), /private DB/);
});

test('integer ceiling, unknown spend, zero denominator and exact maturity boundary', () => {
  const nowMs = Date.parse('2026-10-08T12:00:00Z');
  const candidates = [touch('a', new Date(nowMs - 4 * 86400000).toISOString()),
    touch('b', new Date(nowMs - 4 * 86400000 - 1).toISOString()),
    touch('c', new Date(nowMs - 4 * 86400000 + 1).toISOString())];
  const reachedByLead = new Map(candidates.map(row => [row.lead_id, 'x']));
  const full = summarizeMilestone({ candidates, reachedByLead,
    spendAll: { vnd: 1000001 }, spendMature: { vnd: 999999 }, nowMs });
  assert.equal(full.cost_to_date.vnd_ceil, 333334);
  assert.equal(full.cost_mature.vnd_ceil, 500000);
  assert.equal(full.mature_candidates, 2); assert.equal(full.mature_reached, 2);
  const zero = summarizeMilestone({ candidates, reachedByLead: new Map(),
    spendAll: { vnd: 5 }, spendMature: { vnd: null, reason: 'NO_MATURE_WINDOW' }, nowMs });
  assert.equal(zero.cost_to_date.status, 'NO_QUALIFIED_LEADS');
  assert.equal(zero.cost_to_date.vnd_ceil, null);
  assert.equal(zero.cost_mature.status, 'UNKNOWN');
  assert.equal(zero.cost_mature.reason, 'NO_MATURE_WINDOW');
  assert.equal(summarizeMilestone({ candidates, reachedByLead,
    spendAll: { vnd: null }, spendMature: { vnd: 6 }, nowMs }).cost_to_date.status, 'UNKNOWN');
});
