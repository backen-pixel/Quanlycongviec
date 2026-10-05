'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { assertLegacyFacebookWriteAllowed: check, legacyFacebookPageMayWrite, normalizeScope } = require('../src/helpers/facebookLegacyWriteScope');
const { deleteLegacyFacebookContact, linkLegacyFacebookContact } = require('../src/helpers/facebookLegacyContactWrites');
const { checkedLegacyFacebookResult, checkedLegacyFacebookRows } = require('../src/helpers/facebookLegacyContactWrites');
const { deleteLeadIfAllowedForRescan, deleteOrphanCustomerIfAllowed } = require('../src/helpers/facebookLeadDeleteWhenNoPhone');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const contact = id(1), lead = id(2), customer = id(3), company = id(4), primary = { isPrimary: () => true };
function receipt(scope, allowed = true) {
  return { data: { policy: 'CARE_LEGACY_WRITE_CHECK_V1', scope, allowed,
    reason: allowed ? 'LEGACY_SCOPE' : 'MANAGED_PAGE', observedAt: '2026-10-03T08:00:00Z', reservationMade: false } };
}
function database({ allow = () => true, replies = [], response, failWrite = 0 } = {}) {
  const checks = [], reads = [], writes = [];
  return { checks, reads, writes,
    async rpc(name, { p_scope }) {
      assert.equal(name, 'crm_care_legacy_write_check'); checks.push(p_scope);
      return response ? response(p_scope) : receipt(p_scope, allow(p_scope));
    },
    from(table) {
      let action = 'read', payload;
      const q = { then(resolve, reject) {
        try {
          if (action !== 'read') {
            writes.push({ table, action, payload });
            return Promise.resolve(writes.length === failWrite ? { error: { message: 'synthetic failure' } } : { data: { id: contact } }).then(resolve, reject);
          }
          reads.push(table); assert.ok(replies.length, `unexpected read from ${table}`);
          return Promise.resolve(replies.shift()).then(resolve, reject);
        } catch (e) { return Promise.reject(e).then(resolve, reject); }
      } };
      for (const method of ['select', 'eq', 'neq', 'not', 'ilike', 'limit', 'single', 'maybeSingle']) q[method] = () => q;
      for (const method of ['delete', 'update', 'insert']) q[method] = value => { action = method; payload = value; return q; };
      return q;
    },
  };
}

test('scope normalizes IDs without broadening the requested identities', () => {
  assert.deepEqual(normalizeScope({ leadIds: [lead, lead.toUpperCase()], pageIds: ['123'] }), {
    pageIds: ['123'], contactIds: [], leadIds: [lead], customerIds: [],
  });
  for (const bad of [{}, { all: true }, { pageIds: [123] }, { leadIds: ['wrong'] }, { contactIds: Array(501).fill(contact) }]) {
    assert.throws(() => normalizeScope(bad), { code: 'LEGACY_SCOPE_UNAVAILABLE' });
  }
});
test('jsonb key order is irrelevant but returned identities must match exactly', async () => {
  const db = database({ response: scope => receipt({ customerIds: scope.customerIds, leadIds: scope.leadIds, contactIds: scope.contactIds, pageIds: scope.pageIds }) });
  assert.equal((await check(db, { contactIds: [contact] }, primary)).allowed, true);
  db.rpc = async () => receipt(normalizeScope({ contactIds: [id(99)] }));
  await assert.rejects(check(db, { contactIds: [contact] }, primary), { code: 'LEGACY_SCOPE_UNAVAILABLE' });
});
test('Backup or a Primary change rejects the current attempt', async () => {
  const db = database();
  await assert.rejects(check(db, { contactIds: [contact] }, { isPrimary: () => false }), { status: 503 });
  assert.equal(db.checks.length, 0);
  let active = true;
  db.rpc = async (_, { p_scope }) => { active = false; return receipt(p_scope); };
  await assert.rejects(check(db, { contactIds: [contact] }, { isPrimary: () => active }), { status: 503 });
});
test('managed Page is a deliberate skip; unknown state is an error, never legacy fallback', async () => {
  assert.equal(await legacyFacebookPageMayWrite(database({ allow: () => false }), '123', primary), false);
  assert.equal(await legacyFacebookPageMayWrite(database(), '123', primary), true);
  for (const response of [() => ({ error: { message: 'PRIVATE' } }), () => null, () => { throw Error('PRIVATE'); }]) {
    await assert.rejects(legacyFacebookPageMayWrite(database({ response }), '123', primary), e => e.status === 503 && !e.message.includes('PRIVATE'));
  }
});
test('malformed policy, reason, reservation or timestamp cannot authorize writes', async () => {
  for (const mutate of [x => x.policy = 'OTHER', x => x.allowed = 'true', x => x.reason = 'MANAGED_PAGE',
    x => x.reservationMade = true, x => x.observedAt = 'bad', x => x.scope.extra = []]) {
    const db = database({ response: scope => { const result = receipt(scope); mutate(result.data); return result; } });
    await assert.rejects(check(db, { contactIds: [contact] }, primary), { status: 503 });
  }
});
const operations = [
  ['delete contact', db => deleteLegacyFacebookContact(db, contact, primary)],
  ['link contact', db => linkLegacyFacebookContact(db, contact, lead, primary)],
  ['delete Lead', db => deleteLeadIfAllowedForRescan(db, lead, contact, primary)],
  ['delete Customer', db => deleteOrphanCustomerIfAllowed(db, customer, contact, primary)],
];
for (const [name, run] of operations) {
  test(`${name} makes zero reads/writes when protected or when scope cannot be verified`, async () => {
    for (const options of [{ allow: () => false }, { response: () => ({ error: { code: 'XX000' } }) }]) {
      const db = database(options);
      await assert.rejects(run(db), e => ['MANAGED_CARE_SCOPE', 'LEGACY_SCOPE_UNAVAILABLE'].includes(e.code));
      assert.deepEqual(db.reads, []); assert.deepEqual(db.writes, []);
    }
  });
}
test('legacy contact deletion stops after a failed first write', async () => {
  const db = database({ failWrite: 1 });
  await assert.rejects(deleteLegacyFacebookContact(db, contact, primary), { status: 503 });
  assert.deepEqual(db.writes.map(x => x.table), ['facebook_messages']);
});
test('legacy contact linking stops after failed mapping and preserves explicit target scope', async () => {
  const db = database({ failWrite: 1 });
  await assert.rejects(linkLegacyFacebookContact(db, contact, lead, primary), { status: 503 });
  assert.deepEqual(db.checks[0].leadIds, [lead]); assert.deepEqual(db.writes.map(x => x.table), ['facebook_contacts']);
});
test('unmanaged link/unlink and contact deletion retain their expected operations', async () => {
  for (const target of [lead, null]) {
    const db = database(); await linkLegacyFacebookContact(db, contact, target, primary);
    assert.deepEqual(db.writes.map(x => [x.table, x.payload.lead_id]), [['facebook_contacts', target], ['facebook_messages', target]]);
  }
  const db = database(); await deleteLegacyFacebookContact(db, contact, primary);
  assert.deepEqual(db.writes.map(x => x.table), ['facebook_messages', 'facebook_contacts']);
});
for (const entity of ['Lead', 'Customer']) {
  const initial = entity === 'Lead' ? { data: { id: lead, type: 'lead' } } : { data: { id: customer, phone: '' } };
  const run = db => entity === 'Lead' ? deleteLeadIfAllowedForRescan(db, lead, contact, primary) : deleteOrphanCustomerIfAllowed(db, customer, contact, primary);
  test(`${entity} cleanup never interprets a failed or missing dependency count as zero`, async () => {
    for (let position = 0; position < 4; position++) for (const invalid of [{ error: { message: 'PRIVATE' }, count: null }, { count: null }, { count: -1 }]) {
      const db = database({ replies: [initial, ...Array(position).fill({ count: 0 }), invalid] });
      await assert.rejects(run(db), { status: 503 }); assert.deepEqual(db.writes, []);
    }
  });
  test(`${entity} cleanup rejects failed reads and retains records with dependants`, async () => {
    const failed = database({ replies: [{ error: { message: 'PRIVATE' } }] });
    await assert.rejects(run(failed), { status: 503 }); assert.deepEqual(failed.writes, []);
    const used = database({ replies: [initial, { count: 1 }] });
    assert.equal((await run(used)).ok, false); assert.deepEqual(used.writes, []);
  });
}
test('orphan cleanup requires an actual contact collection and stops after first failed mutation', async () => {
  const replies = () => [{ data: { id: customer, phone: '' } }, ...Array(4).fill({ count: 0 })];
  const missing = database({ replies: [...replies(), { data: null }] });
  await assert.rejects(deleteOrphanCustomerIfAllowed(missing, customer, contact, primary), { status: 503 }); assert.deepEqual(missing.writes, []);
  const failed = database({ replies: [...replies(), { data: [{ id: contact }] }], failWrite: 1 });
  await assert.rejects(deleteOrphanCustomerIfAllowed(failed, customer, contact, primary), { status: 503 });
  assert.deepEqual(failed.writes.map(x => x.table), ['customer_interactions']);
});

// Exercise the actual legacy creator body without loading provider/cron dependencies.
const source = fs.readFileSync(path.join(__dirname, '../src/routes/facebook.js'), 'utf8');
const creator = source.slice(source.indexOf('async function createLeadFromFacebookInner('), source.indexOf('async function sendMessengerReply('));
test('actual legacy webhook handlers stop at the Page gate before contact, receipt or provider access', async () => {
  for (const name of ['handleMessagingInner', 'handleLeadGen', 'handleComment']) {
    const start = source.indexOf(`async function ${name}(`);
    assert.ok(start >= 0);
    const body = source.slice(start, source.indexOf('\n}', start) + 2);
    for (const unavailable of [false, true]) {
      const db = database(unavailable ? { response: () => ({ error: { code: 'XX000' } }) } : { allow: () => false });
      const context = { supabase: db, legacyFacebookPageMayWrite: (connection, pageId) => legacyFacebookPageMayWrite(connection, pageId, primary) };
      vm.runInNewContext(body, context);
      const run = context[name]('123', {});
      if (unavailable) await assert.rejects(run, { status: 503 }); else await run;
      assert.equal(db.checks.length, 1); assert.deepEqual(db.reads, []); assert.deepEqual(db.writes, []);
    }
  }
});
function legacyCreator(db, { atomic = false, fetchedLead = null } = {}) {
  const effects = [];
  const context = { supabase: db, console: { log() {}, warn() {} },
    checkedLegacyFacebookResult, checkedLegacyFacebookRows,
    assertLegacyFacebookWriteAllowed: (connection, scope) => check(connection, scope, primary),
    getPageConfig: async () => ({ default_company_id: company }), loadAutoLeadConfig: async () => ({}),
    resolveFacebookModuleKeyForPage: () => 'crm', resolveFacebookCreateType: () => 'lead',
    DURABLE_MESSENGER_PAGES: new Set(atomic ? ['123'] : []), isFacebookAtomicLeadScope: () => true,
    createFacebookLeadOnce: async () => { effects.push('atomic'); return { lead: { id: lead } }; },
    normalizePhoneForLeadCreation: raw => ({ ok: true, normalized: raw }),
    isPhoneBlockedForFacebookAutoLead: async () => false, fetchContactLeadId: async () => fetchedLead,
    // These tests isolate the managed-Page gate. Current-company validation is
    // exercised without these stubs in facebookLegacyCreationScope.test.js.
    loadFacebookCreationContext: async () => {
      const { data } = await db.from('facebook_contacts').select('*').eq('id', contact).single();
      return { page: { default_company_id: company }, companyId: company, contact: { id: contact, page_id: '123', ...data } };
    },
    assertFacebookCreationTargets: async () => null, assertFacebookCreationMessageLinks: async () => {},
    assertFacebookCreationAssignment: async () => null, assertFacebookCreationPipeline: async () => {},
    resolveFacebookCrmPipelineAndStage: async () => ({}), resolveFacebookSourceId: async () => null,
    findFacebookCreationCustomer: async () => (await db.from('customers').select('id').limit(2)).data?.[0] || null,
    writeFacebookCreationContact: async (_, context, patch) => checkedLegacyFacebookResult(db.from('facebook_contacts').update(patch).eq('id', context.contact.id)),
  };
  vm.runInNewContext(creator, context);
  return { effects, run: (input = { id: contact }, extra = {}) => context.createLeadFromFacebookInner('123', input, 'synthetic', extra) };
}
const discovered = [
  ['existing mapped Lead', [{ data: { lead_id: lead } }]],
  ['Lead found through Customer', [{ data: { customer_id: customer } }, { data: [{ id: lead }] }]],
  ['same PSID Lead', [{ data: { psid: '456', page_id: '123' } }, { data: [{ lead_id: lead }] }]],
  ['phone matched Lead and Customer', [{ data: {} }, { data: [{ id: customer }] }, { data: [{ id: lead }] }], { extra: { phone: '0900000000' } }],
  ['phone matched Customer without Lead', [{ data: {} }, { data: [] }, { data: [{ id: customer }] }], { extra: { phone: '0900000000' } }],
  ['current Customer supersedes stale caller', [{ data: { customer_id: customer } }], { input: { id: contact, customer_id: id(99) } }],
  ['Lead discovered by contact refresh', [{ data: {} }], { fetchedLead: lead }],
];
for (const [name, replies, options = {}] of discovered) {
  test(`actual creator stops before any mutation for protected ${name}`, async () => {
    for (const atomic of [false, true]) {
      const db = database({ replies: [...replies], allow: scope => !scope.leadIds.includes(lead) && !scope.customerIds.includes(customer) });
      const h = legacyCreator(db, { ...options, atomic });
      await assert.rejects(h.run(options.input, options.extra), { code: 'MANAGED_CARE_SCOPE' });
      assert.deepEqual(db.writes, []); assert.deepEqual(h.effects, []);
    }
  });
}
test('actual creator still reuses an allowed same-Page Lead after checking the discovered target', async () => {
  for (const atomic of [false, true]) {
    const db = database({ replies: [{ data: { psid: '456', page_id: '123' } }, { data: [{ lead_id: lead }] }] });
    const h = legacyCreator(db, { atomic }); assert.equal((await h.run()).id, lead);
    assert.ok(db.checks.some(scope => scope.leadIds.includes(lead)));
    assert.equal(db.writes.length, atomic ? 0 : 1); assert.equal(h.effects.length, atomic ? 1 : 0);
  }
});
