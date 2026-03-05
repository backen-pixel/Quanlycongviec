// ════════════════════════════════════════════════════════════
// PERMISSION SYSTEM TEST SCRIPT
// Date: 2026-03-05
// Purpose: Test migration + middleware before applying to routes
// ════════════════════════════════════════════════════════════

const { supabase } = require('../config/supabase');
const { hasPermission, getRolePermissions } = require('../middleware/permission');

// Test colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

function log(color, message) {
  console.log(`${color}${message}${RESET}`);
}

// ─────────────────────────────────────────────────────────────
// TEST 1: Check if tables exist
// ─────────────────────────────────────────────────────────────
async function testTablesExist() {
  log(BLUE, '\n════ TEST 1: Check tables exist ════');
  
  const tables = ['role_permissions', 'user_permission_overrides', 'permission_audit_log'];
  
  for (const table of tables) {
    try {
      const { data, error } = await supabase.from(table).select('*').limit(1);
      if (error) {
        log(RED, `✗ Table ${table} ERROR: ${error.message}`);
        return false;
      }
      log(GREEN, `✓ Table ${table} exists`);
    } catch (e) {
      log(RED, `✗ Table ${table} EXCEPTION: ${e.message}`);
      return false;
    }
  }
  
  return true;
}

// ─────────────────────────────────────────────────────────────
// TEST 2: Check seed data
// ─────────────────────────────────────────────────────────────
async function testSeedData() {
  log(BLUE, '\n════ TEST 2: Check seed data ════');
  
  const roles = ['admin', 'manager', 'employee', 'sales', 'designer', 'accountant', 'production', 'installer'];
  
  for (const role of roles) {
    try {
      const { data, error } = await supabase
        .from('role_permissions')
        .select('permission')
        .eq('role', role);
      
      if (error) {
        log(RED, `✗ Role ${role} ERROR: ${error.message}`);
        return false;
      }
      
      const count = data?.length || 0;
      if (count === 0) {
        log(RED, `✗ Role ${role} has NO permissions`);
        return false;
      }
      
      log(GREEN, `✓ Role ${role}: ${count} permissions`);
    } catch (e) {
      log(RED, `✗ Role ${role} EXCEPTION: ${e.message}`);
      return false;
    }
  }
  
  return true;
}

// ─────────────────────────────────────────────────────────────
// TEST 3: Test getRolePermissions helper
// ─────────────────────────────────────────────────────────────
async function testGetRolePermissions() {
  log(BLUE, '\n════ TEST 3: Test getRolePermissions() ════');
  
  try {
    const adminPerms = await getRolePermissions('admin');
    if (!adminPerms || adminPerms.length === 0) {
      log(RED, '✗ Admin has no permissions');
      return false;
    }
    log(GREEN, `✓ Admin permissions: ${adminPerms.length}`);
    
    const employeePerms = await getRolePermissions('employee');
    if (!employeePerms || employeePerms.length === 0) {
      log(RED, '✗ Employee has no permissions');
      return false;
    }
    log(GREEN, `✓ Employee permissions: ${employeePerms.length}`);
    
    if (adminPerms.length <= employeePerms.length) {
      log(RED, '✗ Admin should have MORE permissions than employee');
      return false;
    }
    log(GREEN, `✓ Admin (${adminPerms.length}) > Employee (${employeePerms.length})`);
    
    return true;
  } catch (e) {
    log(RED, `✗ EXCEPTION: ${e.message}`);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// TEST 4: Test hasPermission with role permissions
// ─────────────────────────────────────────────────────────────
async function testHasPermissionRole() {
  log(BLUE, '\n════ TEST 4: Test hasPermission() with roles ════');
  
  try {
    // Get a test user (admin)
    const { data: adminUser } = await supabase
      .from('users')
      .select('id, role')
      .eq('role', 'admin')
      .limit(1)
      .single();
    
    if (!adminUser) {
      log(YELLOW, '⚠ No admin user found, skipping role permission test');
      return true;
    }
    
    // Test: Admin should have projects.view_all
    const hasViewAll = await hasPermission(
      adminUser.id,
      adminUser.role,
      'projects.view_all'
    );
    
    if (!hasViewAll) {
      log(RED, '✗ Admin should have projects.view_all');
      return false;
    }
    log(GREEN, '✓ Admin has projects.view_all');
    
    // Test: Admin should have projects.delete
    const hasDelete = await hasPermission(
      adminUser.id,
      adminUser.role,
      'projects.delete'
    );
    
    if (!hasDelete) {
      log(RED, '✗ Admin should have projects.delete');
      return false;
    }
    log(GREEN, '✓ Admin has projects.delete');
    
    // Get employee user
    const { data: employeeUser } = await supabase
      .from('users')
      .select('id, role')
      .eq('role', 'employee')
      .limit(1)
      .single();
    
    if (employeeUser) {
      // Test: Employee should NOT have projects.delete
      const empDelete = await hasPermission(
        employeeUser.id,
        employeeUser.role,
        'projects.delete'
      );
      
      if (empDelete) {
        log(RED, '✗ Employee should NOT have projects.delete');
        return false;
      }
      log(GREEN, '✓ Employee does NOT have projects.delete');
    }
    
    return true;
  } catch (e) {
    log(RED, `✗ EXCEPTION: ${e.message}`);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// TEST 5: Test permission override (GRANT)
// ─────────────────────────────────────────────────────────────
async function testPermissionOverride() {
  log(BLUE, '\n════ TEST 5: Test permission override ════');
  
  try {
    // Get an employee user
    const { data: user } = await supabase
      .from('users')
      .select('id, role')
      .eq('role', 'employee')
      .limit(1)
      .single();
    
    if (!user) {
      log(YELLOW, '⚠ No employee user found, skipping override test');
      return true;
    }
    
    // Before override: should NOT have reports.finance
    const beforeOverride = await hasPermission(
      user.id,
      user.role,
      'reports.finance'
    );
    
    if (beforeOverride) {
      log(RED, '✗ Employee should NOT have reports.finance before override');
      return false;
    }
    log(GREEN, '✓ Employee does NOT have reports.finance (before override)');
    
    // Add override
    await supabase.from('user_permission_overrides').insert({
      user_id: user.id,
      permission: 'reports.finance',
      is_allowed: true,
      reason: 'Test override',
      granted_by: user.id, // Self-granted for test
    });
    
    log(YELLOW, '  → Added GRANT override for reports.finance');
    
    // After override: should HAVE reports.finance
    const afterOverride = await hasPermission(
      user.id,
      user.role,
      'reports.finance'
    );
    
    if (!afterOverride) {
      log(RED, '✗ Employee SHOULD have reports.finance after override');
      return false;
    }
    log(GREEN, '✓ Employee HAS reports.finance (after override)');
    
    // Cleanup: Remove override
    await supabase.from('user_permission_overrides')
      .delete()
      .eq('user_id', user.id)
      .eq('permission', 'reports.finance');
    
    log(YELLOW, '  → Cleaned up test override');
    
    return true;
  } catch (e) {
    log(RED, `✗ EXCEPTION: ${e.message}`);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// TEST 6: Test audit logging
// ─────────────────────────────────────────────────────────────
async function testAuditLog() {
  log(BLUE, '\n════ TEST 6: Test audit logging ════');
  
  try {
    // Insert a test log
    const testLog = {
      user_id: null,
      action: 'test.permission',
      resource_type: 'test',
      resource_id: null,
      allowed: true,
      reason: 'Test audit log',
    };
    
    const { data, error } = await supabase
      .from('permission_audit_log')
      .insert(testLog)
      .select()
      .single();
    
    if (error) {
      log(RED, `✗ Failed to insert audit log: ${error.message}`);
      return false;
    }
    
    log(GREEN, `✓ Audit log created: ${data.id}`);
    
    // Verify it exists
    const { data: found } = await supabase
      .from('permission_audit_log')
      .select('*')
      .eq('id', data.id)
      .single();
    
    if (!found) {
      log(RED, '✗ Audit log not found after insert');
      return false;
    }
    log(GREEN, '✓ Audit log verified');
    
    // Cleanup
    await supabase.from('permission_audit_log').delete().eq('id', data.id);
    log(YELLOW, '  → Cleaned up test audit log');
    
    return true;
  } catch (e) {
    log(RED, `✗ EXCEPTION: ${e.message}`);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// RUN ALL TESTS
// ─────────────────────────────────────────────────────────────
async function runAllTests() {
  log(BLUE, '\n════════════════════════════════════════════════════════════');
  log(BLUE, '   PERMISSION SYSTEM TEST SUITE');
  log(BLUE, '════════════════════════════════════════════════════════════');
  
  const tests = [
    { name: 'Tables exist', fn: testTablesExist },
    { name: 'Seed data', fn: testSeedData },
    { name: 'getRolePermissions()', fn: testGetRolePermissions },
    { name: 'hasPermission() with roles', fn: testHasPermissionRole },
    { name: 'Permission override', fn: testPermissionOverride },
    { name: 'Audit logging', fn: testAuditLog },
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      const result = await test.fn();
      if (result) {
        passed++;
      } else {
        failed++;
      }
    } catch (e) {
      log(RED, `✗ Test "${test.name}" crashed: ${e.message}`);
      failed++;
    }
  }
  
  log(BLUE, '\n════════════════════════════════════════════════════════════');
  log(GREEN, `✓ PASSED: ${passed}`);
  if (failed > 0) {
    log(RED, `✗ FAILED: ${failed}`);
  }
  log(BLUE, '════════════════════════════════════════════════════════════\n');
  
  if (failed === 0) {
    log(GREEN, '🎉 ALL TESTS PASSED! Ready for Phase 3.');
    process.exit(0);
  } else {
    log(RED, '❌ SOME TESTS FAILED! Fix issues before Phase 3.');
    process.exit(1);
  }
}

// Run tests
runAllTests().catch(e => {
  log(RED, `Fatal error: ${e.message}`);
  console.error(e);
  process.exit(1);
});
