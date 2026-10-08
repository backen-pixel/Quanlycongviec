'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createDraftService } = require('../src/modules/aiReplyDraft/service');
const { createMockProvider, ProviderError } = require('../src/modules/aiReplyDraft/provider');

const leadId = '11111111-1111-4111-8111-111111111111';
const companyId = '22222222-2222-4222-8222-222222222222';
const customerId = '33333333-3333-4333-8333-333333333333';
const caps = { maxDraftsPerDay: 10, maxTokensPerDay: 10000, maxVndPerDay: 10000,
  maxDraftsPerLead: 5 };
const pricing = { usdPer1kIn: 0.001, usdPer1kOut: 0.002, vndPerUsd: 25000 };
function fixture({ text = 'Dạ {TEN_KHACH}, mình muốn làm tủ bếp theo kiểu nào ạ?',
  last = 'inbound', safe = true, enabled = true, companyIds = [companyId],
  customCaps = caps, errorTable = null, missingLead = false, noInbound = false } = {}) {
  const provider = createMockProvider([text]);
  const events = [];
  const db = { from(table) {
    const query = { filters: {}, select() { return this; }, eq(k, v) { this.filters[k] = v; return this; },
      not() { return this; }, order() { return this; }, limit() { return this; },
      async maybeSingle() {
        if (table === errorTable) return { error: { message: 'secret customer content' } };
        if (table === 'crm_leads' && missingLead) return { data: null };
        if (table === 'crm_leads') return { data: { id: leadId, company_id: companyId,
          customer_id: customerId, install_address: '45 Đường Lê Lợi' } };
        return { data: { full_name: 'Nguyễn Văn Tuấn', address: '12 Nguyễn Huệ' } };
      }, then(resolve) {
        const rows = [{ direction: 'inbound', content: safe
          ? 'Anh Tuấn ở 12 Nguyễn Huệ, 45 Đường Lê Lợi, SĐT 0912345678 cần tủ bếp'
          : 'gửi a@b nhé', sent_by: null }];
        if (noInbound) rows[0].direction = 'outbound';
        if (last === 'outbound') rows.unshift({ direction: 'outbound', content: 'Đã trả lời', sent_by: customerId });
        resolve({ data: rows });
      } };
    return query;
  } };
  const store = { async getByRequest(_db, { requestId }) {
      return events.find(e => e.request_id === requestId) || null;
    }, async getUsage() { return { drafts: 0, tokens: 0, vnd: 0, draftsForLead: 0 }; },
    async recordGenerated(_db, input) {
      const event = { lead_id: input.leadId, draft_id: input.draftId, kind: 'GENERATED',
        draft_text: input.payload.draft_text, request_id: input.requestId };
      events.push(event); return { event };
    }, async recordDiscarded(_db, input) {
      assert.equal(input.payload.draft_text, undefined);
      const event = { lead_id: input.leadId, draft_id: input.draftId, kind: 'DISCARDED',
        draft_text: null, policy_reasons: input.payload.policy_reasons, request_id: input.requestId };
      events.push(event); return { event };
    } };
  const service = createDraftService({ db, store, provider,
    now: () => new Date('2026-10-08T00:00:00Z'), config: { enabled, companyIds,
      caps: customCaps, pricing, maxOutputTokens: 100, promptVersion: 'p2-test' } });
  return { service, provider, store, db, events };
}
const generate = f => f.service.generateForLead(leadId, { requestId: 'request-1' });

test('disabled, company, already replied, unsafe and missing caps deny before provider', async () => {
  for (const [options, status] of [
    [{ enabled: false }, 'DISABLED'], [{ companyIds: [] }, 'COMPANY_NOT_ENABLED'],
    [{ last: 'outbound' }, 'ALREADY_REPLIED'], [{ safe: false }, 'UNSAFE_CONTEXT'],
    [{ missingLead: true }, 'LEAD_NOT_FOUND'], [{ noInbound: true }, 'NO_INBOUND'], [{ errorTable: 'crm_leads' }, 'DRAFT_ERROR'],
    [{ customCaps: null }, 'BUDGET_DENIED'],
    [{ customCaps: { ...caps, maxDraftsPerDay: 0 } }, 'BUDGET_DENIED']]) {
    const f = fixture(options);
    assert.equal((await generate(f)).status, status);
    assert.equal(f.provider.calls.length, 0);
  }
});

test('anonymizes sentinels, saves only validated draft and replays request', async () => {
  const f = fixture();
  const first = await generate(f);
  assert.equal(first.status, 'GENERATED');
  assert.equal(f.events.length, 1);
  assert.equal((await generate(f)).draftId, first.draftId);
  assert.equal(f.provider.calls.length, 1);
  const sent = JSON.stringify(f.provider.calls[0]);
  for (const secret of ['0912345678', 'Tuấn', 'Nguyễn Huệ', 'Lê Lợi'])
    assert.ok(!sent.includes(secret), secret);
});

test('invalid draft stores no text; provider error exposes only safe code', async () => {
  const f = fixture({ text: 'Giảm 50% nhé!' });
  assert.equal((await generate(f)).status, 'DISCARDED');
  assert.equal(f.events[0].draft_text, null);
  assert.equal(f.events[0].policy_reasons[0], 'PRICE_MENTION');
  const failed = fixture();
  failed.provider.generate = async () => { throw new Error('key-secret and customer text'); };
  assert.deepEqual(await generate(failed), { status: 'PROVIDER_ERROR', reason: 'PROVIDER_ERROR' });
  const coded = fixture();
  coded.provider.generate = async () => { throw new ProviderError('PROVIDER_TIMEOUT'); };
  assert.equal((await generate(coded)).status, 'PROVIDER_TIMEOUT');
});

test('same in-flight request calls provider once', async () => {
  const f = fixture();
  const [a, b] = await Promise.all([generate(f), generate(f)]);
  assert.deepEqual(a, b);
  assert.equal(f.provider.calls.length, 1);
});

test('new module has no env, send imports or content logs', () => {
  for (const file of ['service.js', 'store.js']) {
    const source = fs.readFileSync(path.join(__dirname, '../src/modules/aiReplyDraft', file), 'utf8');
    assert.doesNotMatch(source, /process\.env|sendMessengerReply|console\./);
  }
});
