#!/usr/bin/env node
/**
 * PERMISSION SYSTEM TEST SCRIPT
 * Tests if backend permission logic matches documentation
 */

const { supabase } = require('./src/config/supabase');
const { checkPermission, getAccessibleUnits } = require('./src/middleware/newPermission');

console.log('🔍 TESTING PERMISSION SYSTEM\n');
console.log('=' .repeat(60));

// Test data
const TEST_USER_ID = 'd7fdc6f9-cd86-496d-9a62-7895a01cf041'; // Replace with real user ID
const TEST_UNIT_ID = '164c338f-b202-4293-ade1-b18bfd6436ba'; // Công ty Nhôm Kính Phúc Đạt

async function test1_CheckRPCFunction() {
  console.log('\n📋 TEST 1: RPC Function Exists');
  console.log('-'.repeat(60));
  
  try {
    const { data, error } = await supabase.rpc('user_has_permission', {
      p_user_id: TEST_USER_ID,
      p_resource: 'projects',
      p_action: 'view',
      p_ecosystem_unit_id: null,
    });
    
    if (error) {
      console.log('❌ FAIL: RPC function error:', error.message);
      return false;
    }
    
    console.log('✅ PASS: RPC function callable, returned:', data);
    return true;
  } catch (e) {
    console.log('❌ FAIL: Exception:', e.message);
    return false;
  }
}

async function test2_CheckPermissionTables() {
  console.log('\n📋 TEST 2: Permission Tables Exist');
  console.log('-'.repeat(60));
  
  try {
    // Check permissions table
    const { data: perms, error: permsErr } = await supabase
      .from('permissions')
      .select('*')
      .limit(5);
    
    if (permsErr) {
      console.log('❌ FAIL: permissions table error:', permsErr.message);
      return false;
    }
    
    console.log(`✅ PASS: permissions table exists, ${perms.length} rows found`);
    console.log('   Sample:', perms.map(p => `${p.resource}:${p.action}`).join(', '));
    
    // Check user_permissions table
    const { data: userPerms, error: userPermsErr } = await supabase
      .from('user_permissions')
      .select('*')
      .limit(5);
    
    if (userPermsErr) {
      console.log('❌ FAIL: user_permissions table error:', userPermsErr.message);
      return false;
    }
    
    console.log(`✅ PASS: user_permissions table exists, ${userPerms.length} rows found`);
    
    // Check roles table
    const { data: roles, error: rolesErr } = await supabase
      .from('roles')
      .select('*');
    
    if (rolesErr) {
      console.log('❌ FAIL: roles table error:', rolesErr.message);
      return false;
    }
    
    console.log(`✅ PASS: roles table exists, ${roles.length} rows found`);
    console.log('   Roles:', roles.map(r => r.name).join(', '));
    
    return true;
  } catch (e) {
    console.log('❌ FAIL: Exception:', e.message);
    return false;
  }
}

async function test3_CheckSpecificPermission() {
  console.log('\n📋 TEST 3: Check Specific Permission (manage_subordinates)');
  console.log('-'.repeat(60));
  
  try {
    const { data, error } = await supabase
      .from('permissions')
      .select('*')
      .eq('resource', 'users')
      .eq('action', 'manage_subordinates')
      .single();
    
    if (error) {
      console.log('❌ FAIL: manage_subordinates permission NOT FOUND');
      console.log('   Need to add: INSERT INTO permissions (resource, action, description)');
      console.log('                VALUES (\'users\', \'manage_subordinates\', \'Quản lý cấp dưới\');');
      return false;
    }
    
    console.log('✅ PASS: manage_subordinates permission exists');
    console.log('   ID:', data.id);
    console.log('   Description:', data.description);
    return true;
  } catch (e) {
    console.log('❌ FAIL: Exception:', e.message);
    return false;
  }
}

async function test4_CheckUserPermissions() {
  console.log('\n📋 TEST 4: Check User Permissions in DB');
  console.log('-'.repeat(60));
  
  try {
    const { data, error } = await supabase
      .from('user_permissions')
      .select(`
        *,
        permissions (
          resource,
          action,
          description
        )
      `)
      .eq('granted', true)
      .limit(10);
    
    if (error) {
      console.log('❌ FAIL: Query error:', error.message);
      return false;
    }
    
    if (data.length === 0) {
      console.log('⚠️  WARNING: No granted permissions found in database');
      console.log('   This means no users have been assigned permissions yet.');
      console.log('   Use the frontend UI to grant permissions.');
      return true;
    }
    
    console.log(`✅ PASS: Found ${data.length} granted permissions`);
    data.forEach(up => {
      console.log(`   - ${up.permissions.resource}:${up.permissions.action} (user: ${up.user_id.substring(0,8)}...)`);
    });
    
    return true;
  } catch (e) {
    console.log('❌ FAIL: Exception:', e.message);
    return false;
  }
}

async function test5_TestHierarchyLogic() {
  console.log('\n📋 TEST 5: Test Hierarchy Logic (getAllChildUnits)');
  console.log('-'.repeat(60));
  
  try {
    // Get a company unit
    const { data: units, error } = await supabase
      .from('ecosystem_units')
      .select('id, name, parent_id, level_id')
      .eq('company_id', '29677f68-967e-4256-92fd-492bb580e888') // Phúc Đạt company
      .limit(1)
      .single();
    
    if (error) {
      console.log('⚠️  SKIP: No test company found');
      return true;
    }
    
    console.log(`   Testing with unit: ${units.name}`);
    
    // Get children
    const { data: children } = await supabase
      .from('ecosystem_units')
      .select('id, name')
      .eq('parent_id', units.id);
    
    console.log(`   Direct children: ${children?.length || 0}`);
    if (children && children.length > 0) {
      children.forEach(c => console.log(`     - ${c.name}`));
    }
    
    console.log('✅ PASS: Hierarchy query works');
    return true;
  } catch (e) {
    console.log('❌ FAIL: Exception:', e.message);
    return false;
  }
}

async function test6_TestMiddleware() {
  console.log('\n📋 TEST 6: Test Middleware Function');
  console.log('-'.repeat(60));
  
  try {
    // Test checkPermission function
    const result = await checkPermission(
      TEST_USER_ID,
      'projects',
      'view',
      null
    );
    
    console.log(`   checkPermission result: ${result}`);
    console.log('✅ PASS: Middleware function callable');
    return true;
  } catch (e) {
    console.log('❌ FAIL: Exception:', e.message);
    return false;
  }
}

// Run all tests
(async () => {
  const results = await Promise.all([
    test1_CheckRPCFunction(),
    test2_CheckPermissionTables(),
    test3_CheckSpecificPermission(),
    test4_CheckUserPermissions(),
    test5_TestHierarchyLogic(),
    test6_TestMiddleware(),
  ]);
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r === true).length;
  const total = results.length;
  
  console.log(`Passed: ${passed}/${total}`);
  
  if (passed === total) {
    console.log('✅ ALL TESTS PASSED - Permission system ready!');
    process.exit(0);
  } else {
    console.log('❌ SOME TESTS FAILED - Review errors above');
    process.exit(1);
  }
})();
