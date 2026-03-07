# HƯỚNG DẪN DEPLOY PERMISSION SYSTEM

## ✅ ĐÃ HOÀN THÀNH

1. ✅ Migration 24 tables (permissions, user_permissions, roles, etc)
2. ✅ RPC function `user_has_permission()`
3. ✅ Middleware `newPermission.js`
4. ✅ Projects route enforcement
5. ✅ Data filtering by scope

## ⚠️ CẦN THỰC HIỆN NGAY

### Step 1: Run Migration 26 trên Supabase

1. Vào https://supabase.com/dashboard/project/kdxypztstbeovyedmvem/sql/new
2. Copy/paste nội dung file: `backend/supabase/26_manage_subordinates.sql`
3. Click "Run"

**Nội dung**:
\`\`\`sql
INSERT INTO permissions (resource, action, description) VALUES
  ('users', 'manage_subordinates', '🛡️ Quản lý cấp dưới (chỉ Giám đốc, Quản lý, Giám sát)')
ON CONFLICT (resource, action) DO UPDATE SET description = EXCLUDED.description;

-- Grant to admin + manager roles
...
\`\`\`

### Step 2: Deploy Backend lên Render

Backend đã có code mới (commit `fdf6d87`).

**Render sẽ auto-deploy** từ GitHub push.

Kiểm tra:
1. Vào https://dashboard.render.com/web/srv-xxx (tubep-backend)
2. Xem "Events" tab → đợi "Deploy succeeded"
3. Test API: `GET https://tubep-backend.onrender.com/api/projects`

### Step 3: Deploy Frontend (đã có code rồi)

Frontend đã ready từ commit `e336d5b`.

**Render sẽ auto-deploy**.

### Step 4: Test End-to-End

#### Test 1: Permission Enforcement
```bash
# User KHÔNG có quyền projects:create
POST /api/projects
→ Expect: 403 Forbidden

# Response:
{
  "error": "Không có quyền thực hiện hành động này",
  "details": {
    "resource": "projects",
    "action": "create"
  }
}
```

#### Test 2: Data Filtering
```bash
# User có quyền projects:view @ Company A
GET /api/projects
→ Expect: Chỉ trả về projects của Company A

# KHÔNG trả về projects của Company B, C, D
```

#### Test 3: All Companies Permission
```bash
# User có quyền projects:all_companies
GET /api/projects
→ Expect: Trả về TẤT CẢ projects (không filter)
```

---

## 📊 KIỂM TRA NHANH

### Backend Ready?
```bash
cd backend
node test-permissions.js
```
**Expect**: 6/6 tests PASS (sau khi chạy Migration 26)

### Frontend Ready?
1. Vào https://tubep-frontend-s30w.onrender.com/permissions
2. Login: admin@tubep.vn / admin123
3. Tab "Phân quyền chi tiết"
4. Chọn đơn vị → vai trò → user → toggle quyền
5. Check network: POST /api/permissions/users/custom-permission
6. **Expect**: 200 OK

### Permissions Enforced?
1. Logout
2. Login as user KHÔNG có quyền
3. Vào /projects
4. **Expect**: Chỉ thấy projects trong scope của mình

---

## 🚀 DEPLOYMENT CHECKLIST

- [ ] Run Migration 26 trên Supabase
- [ ] Deploy backend (auto từ GitHub)
- [ ] Deploy frontend (auto từ GitHub)
- [ ] Test permission enforcement (403 when no permission)
- [ ] Test data filtering (only accessible companies)
- [ ] Test all_companies permission (see all)
- [ ] Verify test script: 6/6 PASS

---

## ⏱️ THỜI GIAN ƯỚC TÍNH

- Migration 26: **2 phút**
- Auto-deploy backend: **3-4 phút**
- Auto-deploy frontend: **2-3 phút**
- Testing: **10 phút**

**TỔNG**: ~20 phút

---

## 🔧 TROUBLESHOOTING

### "manage_subordinates not found"
→ Chạy Migration 26

### "403 Forbidden" cho mọi request
→ User chưa có role nào
→ Vào frontend grant role/permissions

### Vẫn thấy all projects
→ Backend chưa deploy code mới
→ Check Render dashboard: latest commit = fdf6d87?

### RPC function error
→ Migration 24 chưa chạy
→ Check: SELECT * FROM permissions LIMIT 1;

---

**Created**: 2026-03-07 03:10 UTC  
**Status**: ✅ READY TO DEPLOY  
**Commits**: Frontend (e336d5b), Backend (fdf6d87)
