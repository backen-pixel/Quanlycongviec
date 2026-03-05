# 🧪 TEST PERMISSION SYSTEM

**Date**: 2026-03-05  
**Phase**: 2.5 - Testing before applying to routes

---

## 📋 CHECKLIST

### Step 1: Run Migration ✓

**⚠️ IMPORTANT**: Chạy migration 19 trên Supabase hoặc local database

```bash
# Option A: Supabase Dashboard
1. Mở Supabase Dashboard
2. Go to SQL Editor
3. Paste nội dung file: backend/migrations/19_permission_system.sql
4. Click "Run"
5. Verify: "Success. No rows returned"

# Option B: psql command line
psql $DATABASE_URL -f backend/migrations/19_permission_system.sql
```

**Expected output**:
```
CREATE TABLE
CREATE INDEX
CREATE INDEX
...
INSERT 0 39  (admin permissions)
INSERT 0 28  (manager permissions)
...
```

---

### Step 2: Verify Tables ✓

```bash
# Check if tables exist
psql $DATABASE_URL -c "\dt role_permissions"
psql $DATABASE_URL -c "\dt user_permission_overrides"
psql $DATABASE_URL -c "\dt permission_audit_log"
```

**Expected**: 3 tables found

---

### Step 3: Verify Seed Data ✓

```bash
# Count permissions per role
psql $DATABASE_URL -c "
SELECT role, COUNT(*) as count 
FROM role_permissions 
GROUP BY role 
ORDER BY count DESC;
"
```

**Expected output**:
```
   role    | count 
-----------+-------
 admin     |    39
 manager   |    28
 sales     |    14
 accountant|    10
 employee  |     8
 production|     8
 designer  |     7
 installer |     7
```

---

### Step 4: Run Test Script ✓

```bash
cd backend
node src/test-permissions.js
```

**Expected output**:
```
════════════════════════════════════════════════════════════
   PERMISSION SYSTEM TEST SUITE
════════════════════════════════════════════════════════════

════ TEST 1: Check tables exist ════
✓ Table role_permissions exists
✓ Table user_permission_overrides exists
✓ Table permission_audit_log exists

════ TEST 2: Check seed data ════
✓ Role admin: 39 permissions
✓ Role manager: 28 permissions
✓ Role employee: 8 permissions
✓ Role sales: 14 permissions
✓ Role designer: 7 permissions
✓ Role accountant: 10 permissions
✓ Role production: 8 permissions
✓ Role installer: 7 permissions

════ TEST 3: Test getRolePermissions() ════
✓ Admin permissions: 39
✓ Employee permissions: 8
✓ Admin (39) > Employee (8)

════ TEST 4: Test hasPermission() with roles ════
✓ Admin has projects.view_all
✓ Admin has projects.delete
✓ Employee does NOT have projects.delete

════ TEST 5: Test permission override ════
✓ Employee does NOT have reports.finance (before override)
  → Added GRANT override for reports.finance
✓ Employee HAS reports.finance (after override)
  → Cleaned up test override

════ TEST 6: Test audit logging ════
✓ Audit log created: <uuid>
✓ Audit log verified
  → Cleaned up test audit log

════════════════════════════════════════════════════════════
✓ PASSED: 6
════════════════════════════════════════════════════════════

🎉 ALL TESTS PASSED! Ready for Phase 3.
```

---

## ✅ SUCCESS CRITERIA

All tests must PASS:

1. ✓ Tables exist
2. ✓ Seed data (8 roles, 141 permissions total)
3. ✓ getRolePermissions() works
4. ✓ hasPermission() works
5. ✓ Override mechanism works
6. ✓ Audit logging works

---

## ❌ IF TESTS FAIL

### Error: "relation does not exist"
**Fix**: Migration chưa chạy → Run Step 1

### Error: "No rows returned"
**Fix**: Seed data chưa có → Check migration có INSERT statements

### Error: "Admin has 0 permissions"
**Fix**: Seed failed → Re-run migration với TRUNCATE trước

### Error: "Cannot connect to database"
**Fix**: Check DATABASE_URL environment variable

---

## 🚀 NEXT STEP (PHASE 3)

Khi ALL TESTS PASSED → Ready to apply permissions to routes:

```bash
# Apply to projects routes
# Apply to tasks routes
# Apply to customers routes
# ...
```

---

## 📊 MANUAL VERIFICATION (Optional)

### Check admin permissions:
```sql
SELECT permission FROM role_permissions 
WHERE role = 'admin' 
ORDER BY permission;
```

### Check employee permissions:
```sql
SELECT permission FROM role_permissions 
WHERE role = 'employee' 
ORDER BY permission;
```

### Check recent audit logs:
```sql
SELECT * FROM permission_audit_log 
ORDER BY created_at DESC 
LIMIT 10;
```

---

**Status**: ⏳ Waiting for test results...
