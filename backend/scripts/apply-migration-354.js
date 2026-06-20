/**
 * Backfill quyền tier vào role_permissions (354)
 * node scripts/apply-migration-354.js
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function runViaPg() {
  const { Client } = require('pg');
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!url) return false;
  const sql = fs.readFileSync(
    path.join(__dirname, '..', '..', 'database', '354_backfill_role_tier_permissions.sql'),
    'utf8',
  );
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query(sql);
  await client.end();
  return true;
}

async function runViaSupabase() {
  const { supabase } = require('../src/config/supabase');

  async function backfillAll(roleName) {
    const { data: role } = await supabase.from('roles').select('id').eq('name', roleName).maybeSingle();
    if (!role?.id) {
      console.log(`  skip ${roleName} — không có role`);
      return;
    }
    const { data: perms } = await supabase.from('permissions').select('id').eq('is_active', true);
    const rows = (perms || []).map((p) => ({ role_id: role.id, permission_id: p.id }));
    if (!rows.length) return;
    const { error } = await supabase.from('role_permissions').upsert(rows, {
      onConflict: 'role_id,permission_id',
      ignoreDuplicates: true,
    });
    if (error) throw error;
    console.log(`  ${roleName}: backfill ${rows.length} permissions`);
  }

  async function backfillFilter(roleName, filterFn) {
    const { data: role } = await supabase.from('roles').select('id').eq('name', roleName).maybeSingle();
    if (!role?.id) return;
    const { data: perms } = await supabase.from('permissions').select('id, resource, action').eq('is_active', true);
    const rows = (perms || []).filter(filterFn).map((p) => ({ role_id: role.id, permission_id: p.id }));
    if (!rows.length) return;
    const { error } = await supabase.from('role_permissions').upsert(rows, {
      onConflict: 'role_id,permission_id',
      ignoreDuplicates: true,
    });
    if (error) throw error;
    console.log(`  ${roleName}: +${rows.length} permissions`);
  }

  console.log('354 via Supabase API:');
  await backfillAll('admin');
  await backfillAll('sales_admin');

  await backfillFilter('production_admin', (p) =>
    p.resource.startsWith('sx_') || ['projects', 'workflows', 'templates', 'reports'].includes(p.resource),
  );
  await backfillFilter('logistics_admin', (p) =>
    p.resource.startsWith('vc_') || ['projects', 'workflows', 'templates', 'reports'].includes(p.resource),
  );

  for (const rn of ['crm_production_admin', 'crm_production_staff', 'production_staff']) {
    await backfillFilter(rn, (p) =>
      p.resource.startsWith('crm_')
      || p.resource.startsWith('sx_')
      || ['projects', 'workflows', 'templates', 'reports', 'ecosystem'].includes(p.resource),
    );
  }

  await supabase.from('roles').upsert(
    { name: 'customer_care', description: 'Chăm sóc khách hàng (CSKH)', is_system: true },
    { onConflict: 'name' },
  );
  await backfillFilter('customer_care', (p) =>
    [
      'crm_dashboard', 'crm_pipeline', 'crm_leads', 'crm_deals', 'crm_tasks',
      'crm_follow_up', 'crm_customers', 'crm_assignments', 'crm_reports',
    ].includes(p.resource) && ['view', 'edit'].includes(p.action),
  );
}

async function main() {
  const usedPg = await runViaPg().catch(() => false);
  if (usedPg) {
    console.log('354: backfill role tier permissions OK (pg)');
    return;
  }
  await runViaSupabase();
  console.log('354: backfill role tier permissions OK (supabase)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
