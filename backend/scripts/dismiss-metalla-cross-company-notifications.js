/**
 * Ẩn TB cross-company của admin Metalla (Huy + Toại).
 * Usage: node scripts/dismiss-metalla-cross-company-notifications.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';

const SQL = `
WITH metalla AS (SELECT 'b78baba2-2486-434c-a72d-9c937fac2164'::uuid AS id),
targets AS (
  SELECT unnest(ARRAY[
    'defa39da-c514-4cd8-bfe5-68fcbb8eb09b'::uuid,
    '717cee7b-dedc-4226-8979-9829cf110cb0'::uuid
  ]) AS user_id
),
cross_ids AS (
  SELECT DISTINCT n.id
  FROM notifications n
  CROSS JOIN metalla m
  JOIN targets t ON t.user_id = n.user_id
  WHERE n.dismissed_at IS NULL
    AND (
      (n.entity_type IN ('crm_deal', 'crm_lead', 'lead') AND n.entity_id ~ '^[0-9a-f-]{36}$' AND EXISTS (
        SELECT 1 FROM crm_leads cl WHERE cl.id = n.entity_id::uuid AND cl.company_id IS DISTINCT FROM m.id
      ))
      OR (n.type IN ('deal_created','lead_created','deal_won','deal_assigned') AND n.entity_id ~ '^[0-9a-f-]{36}$' AND EXISTS (
        SELECT 1 FROM crm_leads cl WHERE cl.id = n.entity_id::uuid AND cl.company_id IS DISTINCT FROM m.id
      ))
      OR (n.entity_type = 'project' AND n.entity_id ~ '^[0-9a-f-]{36}$' AND EXISTS (
        SELECT 1 FROM projects p WHERE p.id = n.entity_id::uuid AND p.company_id IS DISTINCT FROM m.id
      ))
      OR (n.entity_type = 'invoice' AND n.entity_id ~ '^[0-9a-f-]{36}$' AND EXISTS (
        SELECT 1 FROM invoices i WHERE i.id = n.entity_id::uuid AND i.company_id IS DISTINCT FROM m.id
      ))
      OR (COALESCE(n.metadata->>'lead_id','') ~ '^[0-9a-f-]{36}$' AND EXISTS (
        SELECT 1 FROM crm_leads cl WHERE cl.id = (n.metadata->>'lead_id')::uuid AND cl.company_id IS DISTINCT FROM m.id
      ))
      OR (COALESCE(n.metadata->>'project_id','') ~ '^[0-9a-f-]{36}$' AND EXISTS (
        SELECT 1 FROM projects p WHERE p.id = (n.metadata->>'project_id')::uuid AND p.company_id IS DISTINCT FROM m.id
      ))
    )
)
UPDATE notifications n
SET dismissed_at = now(), is_read = true
FROM cross_ids c
WHERE n.id = c.id
RETURNING n.id;
`;

async function run(ref, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ query: SQL }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${label}] ${res.status}: ${text}`);
  let rows = [];
  try { rows = JSON.parse(text); } catch (_) { rows = []; }
  const n = Array.isArray(rows) ? rows.length : 0;
  console.log(`\n========== ${label} ==========`);
  console.log(`Dismissed ${n} notifications`);
}

async function main() {
  if (!TOKEN) throw new Error('Thiếu SUPABASE_ACCESS_TOKEN');
  await run(PRIMARY_REF, 'PRIMARY');
  await run(BACKUP_REF, 'BACKUP');
  console.log('\n✅ Đã ẩn TB ngoài Metalla cho Huy + Toại');
}

main().catch((e) => {
  console.error('❌', e.message || e);
  process.exit(1);
});
