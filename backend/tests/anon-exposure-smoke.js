/**
 * Staging-only direct PostgREST denial check. Never import backend config/.env.
 * Run only after the operator has applied migration 700 to a staging copy.
 */
'use strict';

const { fetch } = require('undici');

if (process.env.ANON_SMOKE_TARGET !== 'staging') {
  console.error('ANON_SMOKE_TARGET must be staging');
  process.exit(2);
}

const baseUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
if (!baseUrl || !anonKey) {
  console.error('SUPABASE_URL and SUPABASE_ANON_KEY are required');
  process.exit(2);
}

const tables = ['crm_leads', 'customers', 'users', 'projects'];
const neverMatch = 'id=eq.00000000-0000-0000-0000-000000000000&id=eq.11111111-1111-1111-1111-111111111111';
const attempts = [];
for (const table of tables) {
  attempts.push({ name: `${table} GET`, method: 'GET', path: `rest/v1/${table}?select=id&limit=1` });
  attempts.push({ name: `${table} POST`, method: 'POST', path: `rest/v1/${table}`,
    body: { id: 'invalid-uuid' } });
  attempts.push({ name: `${table} PATCH`, method: 'PATCH', path: `rest/v1/${table}?${neverMatch}`,
    body: { id: 'invalid-uuid' } });
  attempts.push({ name: `${table} DELETE`, method: 'DELETE', path: `rest/v1/${table}?${neverMatch}` });
}
// Read-only STABLE RPC; an empty page list cannot return business rows.
attempts.push({ name: 'fb_unattended_count_by_page RPC', method: 'POST',
  path: 'rest/v1/rpc/fb_unattended_count_by_page', body: { p_page_ids: [] } });

async function main() {
  let failures = 0;
  for (const attempt of attempts) {
    let status = 'network-error';
    let denied = false;
    try {
      const response = await fetch(new URL(attempt.path, `${baseUrl.replace(/\/$/, '')}/`), {
        method: attempt.method,
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: attempt.body ? JSON.stringify(attempt.body) : undefined,
        signal: AbortSignal.timeout(10000),
      });
      status = response.status;
      denied = status === 401 || status === 403;
      if (!denied) {
        // Inspect only the machine-readable error code; never print response data.
        const result = await response.json().catch(() => null);
        denied = result?.code === '42501' || result?.code === 'PGRST301';
      } else {
        await response.body?.cancel();
      }
    } catch {
      // A network failure is not evidence of denied database access.
    }
    console.log(`${attempt.name}: ${status} ${denied ? 'PASS' : 'FAIL'}`);
    if (!denied) failures += 1;
  }
  process.exitCode = failures ? 1 : 0;
}

main().catch(() => { console.error('smoke: FAIL'); process.exitCode = 1; });
