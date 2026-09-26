'use strict';

/**
 * Catalog-only preflight; does not prove staging identity or release readiness.
 * No application .env, application RPC, customer rows, DDL, or migrations.
 * Run only after independently verifying the exact authorized staging target:
 * VPT_MESSENGER_PREFLIGHT_ENV=staging
 * VPT_MESSENGER_PREFLIGHT_TARGET=hostname:port/database
 * VPT_MESSENGER_PREFLIGHT_URL=<secret connection URL; never commit/log it>
 * node backend/scripts/verify-messenger-staging-schema.js
 * Remote URLs require ?sslmode=verify-full. Output is sanitized JSON.
 * Exit 0 = catalog checks pass, 1 = catalog mismatch, 2 = unknown/error.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const TABLES = {
  facebook_contacts: { id: 'uuid', page_id: 'text', lead_id: 'uuid', customer_id: 'uuid' },
  facebook_messages: { id: 'uuid', contact_id: 'uuid', facebook_occurred_at: 'timestamp with time zone',
    detected_phone: 'text', signature_verified: 'boolean' },
  facebook_ad_campaign_mappings: { fb_ad_id: 'text', page_id: 'text', campaign_id: 'text' },
  facebook_messenger_ad_attributions: { contact_id: 'uuid', page_id: 'text', fb_ad_id: 'text',
    campaign_id: 'text', attributed_at: 'timestamp with time zone', fb_event_timestamp_ms: 'bigint', signature_verified: 'boolean' },
  facebook_messenger_phone_exclusions: { facebook_message_id: 'uuid', contact_id: 'uuid', page_id: 'text', reason: 'text' },
  facebook_messenger_webhook_receipts: { receipt_key: 'text', page_id: 'text', partner_psid: 'text', event: 'jsonb',
    event_timestamp_ms: 'bigint', status: 'text', attempts: 'integer', available_at: 'timestamp with time zone',
    lease_token: 'uuid', lease_until: 'timestamp with time zone', received_at: 'timestamp with time zone',
    completed_at: 'timestamp with time zone', updated_at: 'timestamp with time zone', last_error: 'text' },
  crm_leads: { id: 'uuid', customer_id: 'uuid', company_id: 'uuid', source_id: 'uuid' },
  customers: { id: 'uuid' },
};
const RESTRICTED = ['facebook_ad_campaign_mappings', 'facebook_messenger_ad_attributions',
  'facebook_messenger_phone_exclusions', 'facebook_messenger_webhook_receipts'];
const FUNCTIONS = [
  ['facebook_messenger_receipts_claim', 'integer, integer, text[]', true, '637_facebook_messenger_webhook_receipts.sql'],
  ['facebook_messenger_receipts_renew', 'text, uuid, integer', true, '637_facebook_messenger_webhook_receipts.sql'],
  ['facebook_messenger_receipts_finish', 'text, uuid', true, '637_facebook_messenger_webhook_receipts.sql'],
  ['facebook_messenger_receipts_fail', 'text, uuid, text', true, '637_facebook_messenger_webhook_receipts.sql'],
  ['facebook_messenger_receipts_health', 'text[]', true, '637_facebook_messenger_webhook_receipts.sql'],
  ['fb_campaign_phone_numbers_in_range', 'text[], text[], timestamp with time zone, timestamp with time zone', false,
    '639_facebook_messenger_verified_daily_attribution.sql'],
  ['fb_campaign_phone_attribution_capabilities', '', false, '639_facebook_messenger_verified_daily_attribution.sql'],
  ['guard_verified_facebook_message_write', '', false, '639_facebook_messenger_verified_daily_attribution.sql'],
];
const RESULTS = {
  facebook_messenger_receipts_claim: 'SETOF public.facebook_messenger_webhook_receipts',
  facebook_messenger_receipts_renew: 'boolean', facebook_messenger_receipts_finish: 'boolean',
  facebook_messenger_receipts_fail: 'boolean',
  facebook_messenger_receipts_health: 'TABLE(pending_count bigint, processing_count bigint, dead_count bigint, oldest_pending_at timestamp with time zone)',
  fb_campaign_phone_numbers_in_range: 'TABLE(campaign_id text, phone_contacts bigint)',
  fb_campaign_phone_attribution_capabilities: 'jsonb', guard_verified_facebook_message_write: 'trigger',
};
const hash = (value) => crypto.createHash('sha256').update(String(value).replace(/\r\n/g, '\n').trim()).digest('hex');
function expectedBodyHash(name, file) {
  const source = fs.readFileSync(path.join(__dirname, '../../database', file), 'utf8');
  const match = source.match(new RegExp('CREATE OR REPLACE FUNCTION public\\.' + name + '\\([\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$;', 'i'));
  if (!match) throw Object.assign(new Error('Local contract unavailable'), { safeCode: 'local_contract_unavailable' });
  return hash(match[1]);
}

// All identifiers in these SELECTs are fixed; only object-name arrays are parameters.
const QUERIES = {
  tables: `SELECT c.relname AS name, c.relkind AS kind, c.relrowsecurity AS rls,
    a.attname AS column_name, pg_catalog.format_type(a.atttypid, a.atttypmod) AS type,
    a.attnotnull AS not_null
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    WHERE n.nspname = 'public' AND c.relname = ANY($1::text[]) ORDER BY c.relname, a.attnum`,
  functions: `SELECT p.proname AS name, pg_catalog.oidvectortypes(p.proargtypes) AS args,
    p.prosecdef AS security_definer, p.proconfig AS config, p.prosrc AS body,
    p.provolatile AS volatility, l.lanname AS language,
    pg_catalog.pg_get_function_result(p.oid) AS result,
    EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) x
      WHERE x.grantee = 0 AND x.privilege_type = 'EXECUTE') AS public_execute
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_catalog.pg_language l ON l.oid = p.prolang
    WHERE n.nspname = 'public' AND p.proname = ANY($1::text[]) ORDER BY p.proname, args`,
  tablePrivileges: `SELECT c.relname AS name, r.rolname AS role,
    pg_catalog.has_table_privilege(r.oid, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS any_access,
    pg_catalog.has_table_privilege(r.oid, c.oid, 'SELECT') AND pg_catalog.has_table_privilege(r.oid, c.oid, 'INSERT')
      AND pg_catalog.has_table_privilege(r.oid, c.oid, 'UPDATE') AND pg_catalog.has_table_privilege(r.oid, c.oid, 'DELETE') AS crud,
    EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))) x
      WHERE x.grantee = 0) AS public_access
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN pg_catalog.pg_roles r WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
    AND r.rolname IN ('anon', 'authenticated', 'service_role') ORDER BY c.relname, r.rolname`,
  functionPrivileges: `SELECT p.proname AS name, pg_catalog.oidvectortypes(p.proargtypes) AS args, r.rolname AS role,
    pg_catalog.has_function_privilege(r.oid, p.oid, 'EXECUTE') AS execute
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN pg_catalog.pg_roles r WHERE n.nspname = 'public' AND p.proname = ANY($1::text[])
    AND r.rolname IN ('anon', 'authenticated', 'service_role') ORDER BY p.proname, args, r.rolname`,
  trigger: `SELECT t.tgname AS name, t.tgenabled AS enabled, t.tgtype AS type,
    p.proname AS function_name, pn.nspname AS function_schema
    FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid
    JOIN pg_catalog.pg_namespace pn ON pn.oid = p.pronamespace
    WHERE n.nspname = 'public' AND c.relname = 'facebook_messages' AND NOT t.tgisinternal
    AND t.tgname = 'guard_verified_facebook_message_write'`,
  index: `SELECT i.indisunique AS is_unique, i.indisvalid AS is_valid, i.indisready AS is_ready,
    pg_catalog.pg_get_indexdef(i.indexrelid) AS definition
    FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid = i.indexrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'idx_fb_messenger_receipt_one_processing'`,
};

function parseTarget(env) {
  if (env.VPT_MESSENGER_PREFLIGHT_ENV !== 'staging') throw { safeCode: 'explicit_staging_target_required' };
  let url;
  try { url = new URL(env.VPT_MESSENGER_PREFLIGHT_URL); } catch { throw { safeCode: 'invalid_connection_configuration' }; }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username || url.hash
    || !/^\/[^/]+$/.test(url.pathname)) throw { safeCode: 'invalid_connection_configuration' };
  const target = `${url.hostname}:${url.port || 5432}${url.pathname}`;
  if (target !== env.VPT_MESSENGER_PREFLIGHT_TARGET) throw { safeCode: 'target_identity_mismatch' };
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if ([...url.searchParams.keys()].some((key) => key !== 'sslmode') || url.searchParams.getAll('sslmode').length > 1)
    throw { safeCode: 'connection_overrides_not_allowed' };
  const sslMode = url.searchParams.get('sslmode');
  if ((!local && sslMode !== 'verify-full') || (local && sslMode && !['disable', 'verify-full'].includes(sslMode)))
    throw { safeCode: 'verified_tls_required' };
  let database, user, password;
  try {
    database = decodeURIComponent(url.pathname.slice(1));
    user = decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
  } catch { throw { safeCode: 'invalid_connection_configuration' }; }
  return { host: url.hostname.replace(/^\[|\]$/g, ''), port: Number(url.port || 5432),
    database, user, password, ssl: sslMode === 'verify-full' ? { rejectUnauthorized: true } : false,
    application_name: 'vpt_messenger_catalog_preflight', connectionTimeoutMillis: 10000,
    query_timeout: 15000, options: '-c default_transaction_read_only=on',
    target_fingerprint: hash(target) };
}

function evaluate(snapshot) {
  const checks = [];
  function check(id, expected, observed, known = true) {
    checks.push({ id, status: !known ? 'unknown' : JSON.stringify(expected) === JSON.stringify(observed) ? 'pass' : 'fail',
      expected, observed: known ? observed : null });
  }
  for (const [table, columns] of Object.entries(TABLES)) {
    const rows = snapshot.tables.filter((r) => r.name === table);
    check(`table:${table}`, true, rows.length > 0);
    if (!rows.length) continue;
    check(`table:${table}:kind`, true, ['r', 'p'].includes(rows[0].kind));
    for (const [column, type] of Object.entries(columns)) {
      const row = rows.find((r) => r.column_name === column);
      check(`column:${table}.${column}`, type, row?.type || 'missing');
      if (column === 'signature_verified') check(`column:${table}.${column}:not_null`, true, row?.not_null === true);
    }
    if (RESTRICTED.includes(table)) {
      check(`table:${table}:rls`, true, rows[0].rls === true);
      for (const role of ['anon', 'authenticated', 'service_role']) {
        const grant = snapshot.tablePrivileges.find((r) => r.name === table && r.role === role);
        check(`table:${table}:${role}:access`, role === 'service_role',
          role === 'service_role' ? grant?.crud : grant?.any_access, !!grant);
        if (grant) check(`table:${table}:${role}:public_access`, false, grant.public_access);
      }
    }
  }
  for (const [name, args, definer, file] of FUNCTIONS) {
    const candidates = snapshot.functions.filter((r) => r.name === name);
    check(`function:${name}:signatures`, [args], candidates.map((r) => r.args).sort());
    const row = candidates.find((r) => r.args === args);
    if (!row) continue;
    check(`function:${name}:body_sha256`, expectedBodyHash(name, file), row.body == null ? null : hash(row.body), row.body != null);
    check(`function:${name}:result`, RESULTS[name], row.result);
    const stable = name === 'facebook_messenger_receipts_health' || name.startsWith('fb_campaign_');
    check(`function:${name}:volatility`, stable ? 's' : 'v', row.volatility);
    check(`function:${name}:language`, stable ? 'sql' : 'plpgsql', row.language);
    check(`function:${name}:security_definer`, definer, row.security_definer);
    check(`function:${name}:search_path`, true, Array.isArray(row.config) && row.config.includes('search_path=pg_catalog, public'));
    check(`function:${name}:public_execute`, false, row.public_execute);
    for (const role of ['anon', 'authenticated', 'service_role']) {
      if (name === 'guard_verified_facebook_message_write' && role === 'service_role') continue;
      const grant = snapshot.functionPrivileges.find((r) => r.name === name && r.args === args && r.role === role);
      check(`function:${name}:${role}:execute`, role === 'service_role', grant?.execute, !!grant);
    }
  }
  const trigger = snapshot.trigger[0];
  check('verified_message_trigger', true, !!trigger && ['O', 'A'].includes(trigger.enabled) && trigger.type === 31
    && trigger.function_schema === 'public' && trigger.function_name === 'guard_verified_facebook_message_write');
  const index = snapshot.index[0];
  check('one_conversation_lease_index', true, !!index && index.is_unique && index.is_valid && index.is_ready
    && /ON public\.facebook_messenger_webhook_receipts USING btree \(page_id, partner_psid\)/.test(index.definition)
    && /WHERE \(status = 'processing'::text\)$/.test(index.definition));
  return { scope: 'catalog_preflight_only', catalog_status: checks.some((c) => c.status === 'fail') ? 'fail'
    : checks.some((c) => c.status === 'unknown') ? 'unknown' : 'pass', checks,
    deployment_identity_verified: false, staging_acceptance_verified: false, crm_acceptance_verified: false,
    automation_ready: false, remaining_gates: ['deployed_sha_and_database_identity', 'full_schema_integration',
      'crm_linkage_not_retry_safe', 'process_crash_recovery', 'messenger_live_e2e_not_verified'] };
}

async function inspect(client) {
  let begun = false;
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    begun = true;
    await client.query("SET LOCAL statement_timeout = '10s'");
    await client.query("SET LOCAL lock_timeout = '2s'");
    await client.query("SET LOCAL search_path = pg_catalog");
    const snapshot = {};
    for (const [name, query] of Object.entries(QUERIES)) {
      const values = name === 'tables' ? [Object.keys(TABLES)] : name === 'tablePrivileges' ? [RESTRICTED]
        : ['functions', 'functionPrivileges'].includes(name) ? [FUNCTIONS.map((f) => f[0])] : [];
      snapshot[name] = (await client.query(query, values)).rows;
    }
    return evaluate(snapshot);
  } finally {
    if (begun) await client.query('ROLLBACK');
  }
}

function sanitizedError(error) {
  const allowed = new Set(['explicit_staging_target_required', 'invalid_connection_configuration', 'target_identity_mismatch',
    'connection_overrides_not_allowed', 'verified_tls_required', 'local_contract_unavailable']);
  return { scope: 'catalog_preflight_only', catalog_status: 'unknown', automation_ready: false,
    error: allowed.has(error?.safeCode) ? error.safeCode : 'catalog_inspection_failed',
    sqlstate: /^[0-9A-Z]{5}$/.test(error?.code || '') ? error.code : null };
}
async function main(env = process.env, Client) {
  let client;
  try {
    const { target_fingerprint, ...config } = parseTarget(env);
    const PgClient = Client || require('pg').Client;
    client = new PgClient(config);
    await client.connect();
    return { ...(await inspect(client)), target_fingerprint };
  } catch (error) { return sanitizedError(error); }
  finally { if (client) await client.end().catch(() => {}); }
}
if (require.main === module) main().then((result) => {
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.catalog_status === 'pass' ? 0 : result.catalog_status === 'fail' ? 1 : 2;
});
module.exports = { main, parseTarget, inspect, evaluate, sanitizedError, QUERIES, FUNCTIONS, TABLES, expectedBodyHash };
