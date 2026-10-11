'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadDraftConfig, PILOT_FACTS } = require('../src/modules/aiReplyDraft/config');
const { validateDraft } = require('../src/modules/aiReplyDraft/policy');

const base = { P2_AI_DRAFTS_ENABLED: '1', P2_AI_DRAFTS_VND_PER_USD: '26000' };

test('defaults: 5 USD/day cap rounded up to whole VND, 50/day, 3/lead', () => {
  const c = loadDraftConfig(base);
  assert.equal(c.enabled, true);
  assert.deepEqual({ ...c.caps }, { maxDraftsPerDay: 50, maxTokensPerDay: 200000,
    maxDraftsPerLead: 3, maxVndPerDay: 130000 });
  assert.equal(c.pricing.vndPerUsd, 26000);
  assert.equal(c.maxOutputTokens, 300);
});
test('enabled only for exactly "1"', () => {
  for (const v of [undefined, '0', 'true', '']) assert.equal(loadDraftConfig({ ...base, P2_AI_DRAFTS_ENABLED: v }).enabled, false);
});
test('missing or malformed rate or caps yields null caps (service denies)', () => {
  assert.equal(loadDraftConfig({ P2_AI_DRAFTS_ENABLED: '1' }).caps, null);
  for (const bad of ['0', '-5', '26000.5', 'abc'])
    assert.equal(loadDraftConfig({ ...base, P2_AI_DRAFTS_VND_PER_USD: bad }).caps, null);
  assert.equal(loadDraftConfig({ ...base, P2_AI_DRAFTS_MAX_PER_DAY: 'x' }).caps, null);
  assert.equal(loadDraftConfig({ ...base, P2_AI_DRAFTS_MAX_USD_PER_DAY: '-1' }).caps, null);
});
test('overrides apply and cap rounds up', () => {
  const c = loadDraftConfig({ ...base, P2_AI_DRAFTS_MAX_USD_PER_DAY: '0.5', P2_AI_DRAFTS_VND_PER_USD: '25001',
    P2_AI_DRAFTS_MAX_PER_DAY: '10' });
  assert.equal(c.caps.maxVndPerDay, 12501);
  assert.equal(c.caps.maxDraftsPerDay, 10);
});
test('allow-lists parse comma separated ids and default to empty', () => {
  const c = loadDraftConfig({ ...base, P2_AI_DRAFTS_USER_IDS: ' a , b ,', P2_AI_DRAFTS_PAGE_IDS: 'p' });
  assert.deepEqual([...c.userIds], ['a', 'b']);
  assert.deepEqual([...c.pageIds], ['p']);
  assert.deepEqual([...c.companyIds], []);
});
test('pilot facts are exactly three addresses: no phone, price, hours or workshop', () => {
  const text = PILOT_FACTS.join(' | ');
  assert.equal(PILOT_FACTS.length, 3);
  assert.doesNotMatch(text, /0\d{9}|₫|đồng|giờ|xưởng|Võ Hoành/i);
  assert.match(text, /56 Lê Thúc Hoạch/);
  assert.match(text, /20 Nguyễn Cơ Thạch/);
  assert.match(text, /172 Đường 3\/2/);
});
test('policy accepts a draft that quotes the approved addresses', () => {
  const draft = 'Dạ anh ghé showroom 56 Lê Thúc Hoạch, P. Phú Thọ Hòa, Q. Tân Phú hoặc Chi nhánh 3 tại 20 Nguyễn Cơ Thạch, KĐT Sala, Quận 2. Anh tiện ghé nơi nào ạ?';
  assert.equal(validateDraft(draft, { allowedFacts: [...PILOT_FACTS] }).ok, true);
});
test('config module never reads process.env', () => {
  const src = fs.readFileSync(path.join(__dirname, '../src/modules/aiReplyDraft/config.js'), 'utf8');
  assert.doesNotMatch(src, /process\.env|console\./);
});
