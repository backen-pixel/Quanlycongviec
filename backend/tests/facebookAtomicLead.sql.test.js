'use strict';

// Run with PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.cjs
// or install @electric-sql/pglite locally. No application config is imported.
// PGlite runs one connection: these tests verify real PostgreSQL SQL semantics,
// rollback, permissions and replay, not independent-session lock contention.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const migration = fs.readFileSync(path.resolve(__dirname, '../../database/639_facebook_contact_lead_atomic.sql'), 'utf8');

const pageId = '409741855550833';
const companyId = '991dc79d-cbf5-49f9-a364-35227cb47635';
const otherCompanyId = '99999999-0000-4000-8000-000000000001';
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const payload = (n, extra = {}) => ({ code: `LEAD-TEST-${n}`, title: 'Synthetic fixture', type: 'lead', company_id: companyId, ...extra });

test('atomic RPC real SQL: replay, link repair, rollback, scope and privileges', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE public.facebook_pages (
      page_id TEXT PRIMARY KEY, is_active BOOLEAN DEFAULT true,
      default_company_id UUID, default_module_key TEXT, default_target_type TEXT
    );
    CREATE TABLE public.crm_leads (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code TEXT, title TEXT,
      type TEXT, company_id UUID, customer_id UUID, source_id UUID, stage_id UUID,
      pipeline_id UUID, region_id UUID, lead_type_id UUID, install_address TEXT,
      description TEXT, lead_owner_id UUID, assigned_to UUID, created_by UUID,
      stage_entered_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now(),
      retained_default TEXT DEFAULT 'default-preserved'
    );
    CREATE TABLE public.facebook_contacts (
      id UUID PRIMARY KEY, page_id TEXT, lead_id UUID REFERENCES public.crm_leads(id) ON DELETE SET NULL,
      customer_id UUID, updated_at TIMESTAMPTZ DEFAULT now()
    );
    INSERT INTO public.facebook_pages VALUES ('${pageId}', true, '${companyId}', 'crm', 'lead');
    GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO service_role;
  `);
  await db.exec(migration);
  // Re-applying the candidate should preserve data and not duplicate objects.
  await db.exec(migration);
  const contact = async (n) => db.query('INSERT INTO public.facebook_contacts(id,page_id) VALUES($1,$2)', [id(n), pageId]);
  const call = async (n, data = payload(n), existing = null, page = pageId, company = companyId) => {
    const { rows } = await db.query('SELECT public.create_facebook_contact_lead_once($1,$2,$3,$4::jsonb,$5) AS result', [id(n), page, company, JSON.stringify(data), existing]);
    return rows[0].result;
  };
  const count = async () => Number((await db.query('SELECT count(*) AS n FROM public.crm_leads')).rows[0].n);

  await t.test('insert/link commit together and defaults survive', async () => {
    await contact(1);
    const result = await call(1, payload(1, { customer_id: id(99), description: "Text '); DROP TABLE crm_leads; --" }));
    assert.equal(result.created, true);
    assert.equal(result.lead.facebook_contact_id, id(1));
    assert.equal(result.lead.retained_default, 'default-preserved');
    const link = (await db.query('SELECT lead_id,customer_id FROM public.facebook_contacts WHERE id=$1', [id(1)])).rows[0];
    assert.equal(link.lead_id, result.lead.id);
    assert.equal(link.customer_id, id(99));
    const repeated = await call(1, payload(1, { customer_id: id(98) }));
    assert.equal(repeated.created, false);
    assert.equal(repeated.lead.id, result.lead.id);
    assert.equal(await count(), 1);
  });

  await t.test('replay repairs cleared contact link from durable identity', async () => {
    await db.query('UPDATE public.facebook_contacts SET lead_id=NULL WHERE id=$1', [id(1)]);
    const result = await call(1);
    assert.equal(result.created, false);
    assert.equal(await count(), 1);
    const linked = (await db.query('SELECT lead_id FROM public.facebook_contacts WHERE id=$1', [id(1)])).rows[0];
    assert.equal(linked.lead_id, result.lead.id);
  });

  await t.test('existing lead attachment uses same transaction and returns false', async () => {
    await contact(2);
    const original = await call(1);
    const result = await call(2, payload(2), original.lead.id);
    assert.equal(result.created, false);
    assert.equal(result.lead.id, original.lead.id);
    assert.equal(result.lead.facebook_contact_id, id(1));
    assert.equal(await count(), 1);
  });

  await t.test('failed contact link rolls the newly inserted lead back', async () => {
    await contact(3);
    await db.exec(`CREATE FUNCTION public.reject_test_link() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.id = '${id(3)}'::UUID AND NEW.lead_id IS NOT NULL THEN RAISE EXCEPTION 'synthetic link failure'; END IF;
      RETURN NEW; END $$;
      CREATE TRIGGER reject_test_link BEFORE UPDATE ON public.facebook_contacts FOR EACH ROW EXECUTE FUNCTION public.reject_test_link();`);
    await assert.rejects(() => call(3), /synthetic link failure/);
    assert.equal(await count(), 1);
    await db.exec('DROP TRIGGER reject_test_link ON public.facebook_contacts; DROP FUNCTION public.reject_test_link();');
    const result = await call(3);
    assert.equal(result.created, true);
    assert.equal(await count(), 2);
  });

  await t.test('wrong Page/company/type, injected identifiers and stale candidate fail closed', async () => {
    await contact(4);
    await assert.rejects(() => call(4, payload(4), null, 'wrong-page'), /unsupported scope/);
    await assert.rejects(() => call(4, payload(4), null, pageId, otherCompanyId), /unsupported scope/);
    await assert.rejects(() => call(4, payload(4, { company_id: otherCompanyId })), /payload scope mismatch/);
    await assert.rejects(() => call(4, payload(4, { type: 'deal' })), /payload scope mismatch/);
    await assert.rejects(() => call(4, payload(4, { id: id(88) })), /unsupported payload field/);
    await assert.rejects(() => call(4, payload(4, { 'x);DROP TABLE crm_leads;--': 1 })), /unsupported payload field/);
    await assert.rejects(() => call(4, payload(4), id(87)), /candidate lead scope mismatch/);
    await db.query('UPDATE public.facebook_pages SET default_company_id=$1 WHERE page_id=$2', [otherCompanyId, pageId]);
    await assert.rejects(() => call(4), /Page configuration mismatch/);
    await db.query('UPDATE public.facebook_pages SET default_company_id=$1 WHERE page_id=$2', [companyId, pageId]);
    assert.equal(await count(), 2);
  });

  await t.test('existing cross-company contact link is not reused or overwritten', async () => {
    const badLead = (await db.query("INSERT INTO public.crm_leads(type,company_id) VALUES('lead',$1) RETURNING id", [otherCompanyId])).rows[0].id;
    await db.query('UPDATE public.facebook_contacts SET lead_id=$1 WHERE id=$2', [badLead, id(4)]);
    await assert.rejects(() => call(4), /existing link scope mismatch/);
    assert.equal((await db.query('SELECT lead_id FROM public.facebook_contacts WHERE id=$1', [id(4)])).rows[0].lead_id, badLead);
  });

  await t.test('unique identity rejects a second direct insert with the same contact', async () => {
    await assert.rejects(() => db.query("INSERT INTO public.crm_leads(type,company_id,facebook_contact_id) VALUES('lead',$1,$2)", [companyId, id(1)]), (error) => error.code === '23505');
  });

  await t.test('service_role only and invoker semantics', async () => {
    const signature = 'public.create_facebook_contact_lead_once(uuid,text,uuid,jsonb,uuid)';
    for (const role of ['anon', 'authenticated']) {
      const row = (await db.query('SELECT has_function_privilege($1,$2,\'EXECUTE\') AS allowed', [role, signature])).rows[0];
      assert.equal(row.allowed, false);
    }
    assert.equal((await db.query('SELECT has_function_privilege($1,$2,\'EXECUTE\') AS allowed', ['service_role', signature])).rows[0].allowed, true);
    assert.equal((await db.query("SELECT prosecdef FROM pg_proc WHERE oid=$1::regprocedure", [signature])).rows[0].prosecdef, false);
    await db.exec('SET ROLE service_role');
    assert.equal((await call(1)).created, false);
    await db.exec('RESET ROLE');
  });
});
