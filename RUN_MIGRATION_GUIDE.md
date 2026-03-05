# ⚠️ HƯỚNG DẪN CHẠY MIGRATION & TEST

**QUAN TRỌNG**: Bạn cần chạy migration trên Supabase production database!

---

## 🎯 BƯỚC 1: RUN MIGRATION (BẮT BUỘC)

### Option A: Supabase Dashboard (KHUYẾN NGHỊ)

1. Mở **Supabase Dashboard**: https://supabase.com/dashboard/project/kdxypztstbeovyedmvem
2. Click **SQL Editor** (sidebar trái)
3. Click **+ New query**
4. Copy toàn bộ nội dung file: `backend/migrations/19_permission_system.sql`
5. Paste vào editor
6. Click **Run** (hoặc Ctrl+Enter)
7. Đợi ~5 giây
8. Kiểm tra output: `Success. No rows returned`

### Option B: psql command line

```bash
# Cần có Supabase connection string
export DATABASE_URL="postgresql://postgres:[password]@db.kdxypztstbeovyedmvem.supabase.co:5432/postgres"

# Run migration
psql $DATABASE_URL -f backend/migrations/19_permission_system.sql
```

---

## 🧪 BƯỚC 2: CHẠY TEST (Kiểm tra migration thành công)

### Test trên production (cần deploy backend trước):

```bash
# SSH vào server Render (hoặc local nếu có DATABASE_URL)
cd backend
node src/test-permissions.js
```

### Test qua API (sau khi deploy):

```bash
# 1. Login để lấy token
curl -X POST https://tubep-backend.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@tubep.vn","password":"admin123"}'

# Lưu token vào biến
export TOKEN="<token từ response>"

# 2. Get my permissions
curl https://tubep-backend.onrender.com/api/auth/my-permissions \
  -H "Authorization: Bearer $TOKEN"

# Expected: {"permissions":["projects.view_all","projects.delete",...], "role":"admin"}

# 3. Check specific permission
curl -X POST https://tubep-backend.onrender.com/api/auth/check-permission \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"permission":"projects.delete"}'

# Expected: {"allowed":true,"permission":"projects.delete"}
```

---

## ✅ VERIFY MIGRATION THÀNH CÔNG

### Kiểm tra qua Supabase Dashboard:

1. Mở **Table Editor**
2. Tìm bảng `role_permissions`
3. Xem data → Phải có 141 rows (8 roles × permissions)
4. Tìm bảng `user_permission_overrides` → Empty OK
5. Tìm bảng `permission_audit_log` → Empty OK

### Hoặc chạy SQL query:

```sql
-- Count permissions per role
SELECT role, COUNT(*) as count 
FROM role_permissions 
GROUP BY role 
ORDER BY count DESC;
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

## 🚀 SAU KHI MIGRATION THÀNH CÔNG

**Backend sẽ tự động**:
- Load permissions từ DB
- Check quyền khi user login
- Log audit trail

**Test API endpoints mới**:
- `GET /api/auth/my-permissions` - Xem quyền của mình
- `POST /api/auth/check-permission` - Check 1 quyền cụ thể

---

## 📊 KẾT QUẢ MONG ĐỢI

### Admin login:
```json
{
  "permissions": [
    "projects.view_all",
    "projects.create",
    "projects.edit_all",
    "projects.delete",
    "tasks.view_all",
    "ecosystem.manage_all",
    "reports.finance",
    ...
  ],
  "role": "admin"
}
```

### Employee login:
```json
{
  "permissions": [
    "projects.view_assigned",
    "projects.edit_assigned",
    "tasks.view_assigned",
    "tasks.edit_assigned",
    "ecosystem.view",
    ...
  ],
  "role": "employee"
}
```

---

## ❌ NẾU CÓ LỖI

### Error: "relation does not exist"
→ Migration chưa chạy. Quay lại Bước 1.

### Error: "0 rows" khi count permissions
→ Seed data failed. Re-run migration.

### API trả về "Lỗi hệ thống"
→ Backend chưa restart sau migration. Deploy lại.

---

## 📝 CHO TÔI BIẾT KẾT QUẢ

Sau khi chạy migration + test, cho tôi biết:

1. ✅ Migration chạy thành công? (Success/Fail)
2. ✅ Có 141 rows trong `role_permissions`? (Yes/No)
3. ✅ API `/auth/my-permissions` trả về data? (Yes/No)
4. ✅ Admin có 39 permissions? (Yes/No)

**Nếu tất cả YES** → Ready for Phase 3! 🎉
