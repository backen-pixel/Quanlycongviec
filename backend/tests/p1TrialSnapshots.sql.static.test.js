'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const sql = fs.readFileSync(path.join(__dirname, '../../database/713_p1_trial_snapshots.sql'), 'utf8');
const rollback = fs.readFileSync(path.join(__dirname, '../../database/713_p1_trial_snapshots_rollback.sql'), 'utf8');
test('snapshot migration is bounded, append-only and access restricted', () => {
  assert.match(sql, /SET LOCAL lock_timeout/i);
  assert.match(sql, /SET LOCAL statement_timeout/i);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/i);
  assert.match(sql, /REVOKE ALL ON public\.p1_trial_snapshots FROM service_role/i);
  assert.match(sql, /GRANT SELECT, INSERT ON public\.p1_trial_snapshots TO service_role/i);
  assert.match(sql, /SECURITY INVOKER SET search_path = ''/i);
  assert.doesNotMatch(sql, /CREATE TRIGGER|CREATE POLICY|LOCK TABLE|pg_advisory|\bUPDATE public\.|\bDELETE FROM public\./i);
  assert.doesNotMatch(sql, /ALTER TABLE public\.(?!p1_trial_snapshots\b)/i);
  assert.match(rollback, /IF EXISTS \(SELECT 1 FROM public\.p1_trial_snapshots LIMIT 1\)/i);
});
