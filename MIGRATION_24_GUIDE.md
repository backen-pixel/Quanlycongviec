# ⚠️ MIGRATION 24 - Hướng dẫn kiểm tra và chạy

## Bước 1: Kiểm tra bảng `roles` đã tồn tại chưa

Truy cập Supabase Dashboard → SQL Editor → chạy lệnh:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('roles', 'permissions', 'role_permissions', 'user_roles', 'user_permissions');
```

**Kết quả mong đợi**: Nếu Migration 24 đã chạy → sẽ thấy 5 bảng
**Nếu chưa có** → chạy Bước 2

---

## Bước 2: Chạy Migration 24

Copy toàn bộ nội dung file `backend/supabase/24_permission_system.sql` → paste vào SQL Editor → Execute

---

## Bước 3: Verify - Kiểm tra dữ liệu default

Sau khi chạy migration, check xem có 4 roles mặc định không:

```sql
SELECT name, description, is_system 
FROM roles 
ORDER BY is_system DESC;
```

**Kết quả mong đợi**:
```
name      | description              | is_system
----------|--------------------------|----------
admin     | Toàn quyền hệ thống      | true
manager   | Quản lý công ty           | true
employee  | Nhân viên                 | true
viewer    | Chỉ xem                   | true
```

---

## Bước 4: Check permissions (25+ rows)

```sql
SELECT COUNT(*) as total_permissions FROM permissions;
SELECT resource, COUNT(*) as actions 
FROM permissions 
GROUP BY resource 
ORDER BY resource;
```

**Kết quả mong đợi**:
```
resource    | actions
------------|--------
projects    | 5
workflows   | 4
templates   | 4
users       | 4
ecosystem   | 2
reports     | 2
settings    | 2
```

---

## Bước 5: Test function `user_has_permission`

```sql
-- Example: Check if a user (replace with real user_id) has 'projects' 'view' permission
SELECT user_has_permission(
  '934c6eb9-3367-427b-9b8f-88bb23d393a5'::uuid,  -- user_id (thay bằng user thật)
  'projects',                                     -- resource
  'view',                                         -- action
  NULL                                            -- ecosystem_unit_id (NULL = global)
);
```

---

## ⚠️ Lưu ý quan trọng

Migration 24 **CHỈ TẠO CẤU TRÚC BẢN** (tables + default data).

**CHƯA GÁN ROLES CHO USERS** → Sau khi chạy migration:
1. Vào trang `/permissions` (Frontend)
2. Xem 4 roles: admin, manager, employee, viewer
3. Chỉnh sửa permissions nếu cần (chỉ non-system roles)
4. Sau đó vào trang Users → gán roles cho nhân viên (Part 2)

---

## Nếu gặp lỗi

**Lỗi: `relation "roles" already exists`**
→ Migration đã chạy rồi, skip

**Lỗi: `duplicate key value violates unique constraint`**
→ Default data đã có, skip

**Lỗi khác**
→ Gửi full error message để debug

---

## Next Step: Part 2

Sau khi Migration 24 OK → tiếp tục code:
- ✅ Assign roles to users UI
- ✅ Company-scoped data filtering
- ✅ Permission middleware
