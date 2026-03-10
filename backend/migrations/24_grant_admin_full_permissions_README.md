# Migration 24: Grant Full Permissions to admin@tubep.vn

## Mục đích
Cấp toàn bộ quyền (33 permissions) cho tài khoản admin@tubep.vn

## Permissions được cấp

### Projects (5)
- projects.view_all
- projects.create
- projects.edit_all
- projects.delete
- projects.approve

### Tasks (5)
- tasks.view_all
- tasks.create
- tasks.edit_all
- tasks.delete
- tasks.reassign

### Customers (4)
- customers.view_all
- customers.create
- customers.edit
- customers.delete

### Ecosystem (6)
- ecosystem.view
- ecosystem.manage_all
- ecosystem.manage_unit
- ecosystem.manage_children
- ecosystem.add_members
- ecosystem.assign_roles

### Workflows (4)
- workflows.view
- workflows.create
- workflows.edit
- workflows.delete

### Reports (3)
- reports.view_all
- reports.export
- reports.finance

### Settings (4)
- settings.workflow
- settings.templates
- settings.users
- settings.system

**Total: 33 permissions**

## Cách chạy

### Supabase Dashboard (Khuyến nghị)
1. Vào: https://supabase.com/dashboard/project/kdxypztstbeovyedmvem
2. Click **SQL Editor**
3. Copy toàn bộ nội dung file `24_grant_admin_full_permissions.sql`
4. Click **Run** ▶️

### Kết quả mong đợi
```
NOTICE: Granted 33 permissions to admin@tubep.vn (user_id: ...)

email              | permission            | is_allowed | reason
-------------------|-----------------------|------------|------------------
admin@tubep.vn     | customers.create      | true       | Admin full access
admin@tubep.vn     | customers.delete      | true       | Admin full access
admin@tubep.vn     | customers.edit        | true       | Admin full access
...
(33 rows)
```

## Kiểm tra

### Sau khi chạy migration:

```sql
-- Count permissions
SELECT COUNT(*) 
FROM user_permission_overrides upo
JOIN users u ON u.id = upo.user_id
WHERE u.email = 'admin@tubep.vn';
-- Expected: 33

-- List all permissions
SELECT permission, is_allowed, reason
FROM user_permission_overrides upo
JOIN users u ON u.id = upo.user_id
WHERE u.email = 'admin@tubep.vn'
ORDER BY permission;
```

### Test login
1. Login với `admin@tubep.vn` / `admin123`
2. Thử truy cập tất cả modules:
   - ✅ Projects → View all
   - ✅ Tasks → View all
   - ✅ Customers → Full CRUD
   - ✅ Users → Manage
   - ✅ Ecosystem → Full access
   - ✅ Workflows → Full access
   - ✅ Templates → Full access
   - ✅ Companies/Departments/Teams → Full access

## Lưu ý

- Migration này dùng `user_permission_overrides` (không phải `role_permissions`)
- Permissions này override role-based permissions
- Có thể thu hồi bằng cách DELETE từ bảng `user_permission_overrides`
- Nếu user không tồn tại, migration sẽ báo lỗi

## Rollback

Nếu cần thu hồi quyền:

```sql
DELETE FROM user_permission_overrides
WHERE user_id = (SELECT id FROM users WHERE email = 'admin@tubep.vn');
```

Sau đó user sẽ quay về quyền của role (admin role vẫn có 39 permissions từ migration 19).
