/**
 * Smoke test: user_module_roles sync + effective permissions union
 * Usage: node scripts/test-user-module-roles-smoke.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const {
  normalizeModuleRolesMap,
  derivePrimaryRole,
  deriveDriveModule,
  syncUserModuleRoles,
  getUserModuleRolesMap,
  listUserModuleRoles,
} = require('../src/helpers/userModuleRoles');
const { getEffectivePermissions } = require('../src/helpers/effectivePermissions');
const { supabase } = require('../src/config/supabase');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log('--- unit: normalize / derive ---');
  const map = normalizeModuleRolesMap({
    crm: 'sales',
    production: 'production_staff',
    logistics: 'driver',
    bogus: 'admin',
    accounting: 'hacker',
  });
  assert(map.crm === 'sales', 'crm role');
  assert(map.production === 'production_staff', 'sx role');
  assert(map.logistics === 'driver', 'vc role');
  assert(!map.bogus, 'reject unknown module');
  assert(!map.accounting, 'reject invalid accounting role');
  assert(derivePrimaryRole(map) === 'production_staff', `primary got ${derivePrimaryRole(map)}`);
  assert(deriveDriveModule(map) === 'crm', 'drive prefers crm');
  assert(derivePrimaryRole(map, { isSystemAdmin: true }) === 'admin', 'system admin');
  console.log('PASS unit');

  console.log('\n--- db: pick a user with module roles ---');
  const { data: sample, error } = await supabase
    .from('user_module_roles')
    .select('user_id')
    .limit(1);
  if (error) throw error;
  assert(sample?.length, 'cần ít nhất 1 row user_module_roles (đã backfill)');
  const userId = sample[0].user_id;
  const before = await getUserModuleRolesMap(userId);
  console.log('user', userId, 'before', before);

  const testMap = {
    crm: 'sales_admin',
    production: 'production_admin',
  };
  const synced = await syncUserModuleRoles(userId, testMap, { grantedBy: null });
  assert(synced.primaryRole === 'sales_admin' || synced.primaryRole === 'production_admin', `primary got ${synced.primaryRole}`);
  assert(synced.driveModule === 'crm', 'drive crm');
  const after = await getUserModuleRolesMap(userId);
  assert(after.crm === 'sales_admin' && after.production === 'production_admin', 'synced map');
  assert(!after.logistics, 'logistics cleared');
  console.log('PASS sync', after);

  const eff = await getEffectivePermissions(userId);
  assert(eff.module_roles && typeof eff.module_roles === 'object', 'module_roles on effective payload');
  assert(eff.module_roles.crm === 'sales_admin' && eff.module_roles.production === 'production_admin', 'effective module_roles map');
  const granted = (eff.permissions || []).filter((p) => p.effective).length;
  console.log('effective grants:', granted, 'sources include', [...new Set((eff.permissions || []).filter((p) => p.effective).map((p) => p.source))]);
  assert(granted > 0, 'cần có quyền hiệu lực từ role template');
  console.log('PASS effective', eff.module_roles);

  // restore
  await syncUserModuleRoles(userId, before);
  const restored = await listUserModuleRoles(userId);
  console.log('restored rows', restored.length);
  console.log('\nALL SMOKE PASS');
}

main().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});
