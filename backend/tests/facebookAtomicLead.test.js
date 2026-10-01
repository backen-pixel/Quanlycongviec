'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createFacebookLeadOnce,
  isFacebookAtomicLeadScope,
  FACEBOOK_ATOMIC_LEAD_PAGE_ID: pageId,
  FACEBOOK_ATOMIC_LEAD_COMPANY_ID: companyId,
} = require('../src/helpers/facebookAtomicLead');

const contactId = '10000000-0000-4000-8000-000000000001';
const leadId = '20000000-0000-4000-8000-000000000001';
const leadData = { code: 'LEAD-TEST', title: 'Synthetic', type: 'lead', company_id: companyId };
const args = { pageId, companyId, contactId, leadData };
const lead = { ...leadData, id: leadId };

test('routes only the reviewed VPT CRM Lead scope', () => {
  assert.equal(isFacebookAtomicLeadScope(args), true);
  assert.equal(isFacebookAtomicLeadScope({ ...args, pageId: 'other' }), false);
  assert.equal(isFacebookAtomicLeadScope({ ...args, companyId: leadId }), false);
  assert.equal(isFacebookAtomicLeadScope({ ...args, moduleKey: 'production' }), false);
  assert.equal(isFacebookAtomicLeadScope({ ...args, createType: 'deal' }), false);
});

test('sends the atomic contract and returns created flag without mutating input', async () => {
  const input = { ...args, leadData: { ...leadData, description: 'value with $1 and quotes', stage_id: undefined } };
  const supabase = { rpc: async (name, params) => {
    assert.equal(name, 'create_facebook_contact_lead_once');
    assert.deepEqual(params, {
      p_contact_id: contactId, p_page_id: pageId, p_company_id: companyId,
      p_lead_data: { ...leadData, description: input.leadData.description },
      p_existing_lead_id: null,
    });
    return { data: { lead, created: true }, error: null };
  } };
  assert.deepEqual(await createFacebookLeadOnce(supabase, input), { lead, created: true });
  assert.equal(Object.hasOwn(input.leadData, 'stage_id'), true);
});

test('reused lead stays created:false and carries candidate to the RPC', async () => {
  const supabase = { rpc: async (_, params) => {
    assert.equal(params.p_existing_lead_id, leadId);
    return { data: { lead, created: false }, error: null };
  } };
  assert.deepEqual(await createFacebookLeadOnce(supabase, { ...args, existingLeadId: leadId }), { lead, created: false });
});

test('scope and unexpected columns fail before touching the client', async () => {
  const supabase = { rpc: () => assert.fail('RPC must not run') };
  for (const invalid of [
    { ...args, pageId: 'other' },
    { ...args, companyId: leadId },
    { ...args, contactId: 'unsafe' },
    { ...args, existingLeadId: 'unsafe' },
    { ...args, leadData: { ...leadData, type: 'deal' } },
    { ...args, leadData: { ...leadData, company_id: leadId } },
    { ...args, leadData: { ...leadData, id: leadId } },
    { ...args, leadData: { ...leadData, facebook_contact_id: contactId } },
  ]) await assert.rejects(() => createFacebookLeadOnce(supabase, invalid));
});

test('RPC failure never falls back to a direct insert', async () => {
  let calls = 0;
  const supabase = {
    rpc: async () => { calls++; return { error: { message: 'connection lost', code: '08006' } }; },
    from: () => assert.fail('no fallback insert'),
  };
  await assert.rejects(() => createFacebookLeadOnce(supabase, args), { code: '08006' });
  assert.equal(calls, 1);
});

test('malformed or cross-company RPC response is rejected', async () => {
  for (const data of [null, [], { lead }, { lead, created: 1 },
    { lead: { ...lead, type: 'deal' }, created: false },
    { lead: { ...lead, company_id: leadId }, created: true },
  ]) await assert.rejects(() => createFacebookLeadOnce({ rpc: async () => ({ data }) }, args));
});
