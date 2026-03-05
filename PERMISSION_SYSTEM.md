# 🔐 HỆ THỐNG PHÂN QUYỀN - TuBep Pro

**Date**: 2026-03-05
**Status**: Proposal / Design Document

---

## 📊 HIỆN TRẠNG

### Hệ sinh thái
```
Tập đoàn (depth=0)
  └── Khối (depth=1, Division)
       └── Công ty (depth=2, Company)
            └── Phòng ban (depth=3, Department)
                 └── Team (depth=4)
                      └── Nhân viên
```

### Vai trò hiện tại
**Global roles** (users.role):
- admin, manager, employee, sales, designer, accountant, production, installer

**Unit roles** (ecosystem_unit_members.unit_role):
- director, manager, member, viewer

### ❌ Vấn đề
- Phân quyền đơn giản (1 role global)
- Không phân quyền theo đơn vị
- Không kiểm soát chi tiết (ai làm được gì)
- Không kế thừa quyền từ trên xuống
- Không audit log

---

## 🎯 ĐỀ XUẤT: RBAC + SCOPE-BASED (OPTION A)

### Nguyên tắc
1. **Role-based**: Mỗi role có permissions mặc định
2. **Scope-based**: Quyền giới hạn theo đơn vị (unit)
3. **Hierarchy**: Kế thừa quyền từ trên xuống
4. **Override**: Có thể gán/thu hồi quyền đặc biệt

### Cách hoạt động
```
User
 ├── Global Role → Default Permissions
 ├── Unit Memberships (many units)
 │    ├── Unit A: director, can_manage_children=true
 │    └── Unit B: member
 └── Permission Overrides (special grants/denies)
```

---

## 📋 CÁC LOẠI QUYỀN

### 1. DỰ ÁN (Projects)
- `projects.view_all` - Xem tất cả
- `projects.view_unit` - Xem dự án đơn vị
- `projects.view_assigned` - Xem DA được gán
- `projects.create` - Tạo mới
- `projects.edit_all` - Sửa tất cả
- `projects.edit_assigned` - Sửa DA được gán
- `projects.delete` - Xóa
- `projects.approve` - Duyệt chuyển stage

### 2. CÔNG VIỆC (Tasks)
- `tasks.view_all` - Xem tất cả CV
- `tasks.view_unit` - Xem CV đơn vị
- `tasks.view_assigned` - Xem CV được gán
- `tasks.create` - Tạo CV
- `tasks.edit_all` - Sửa tất cả
- `tasks.edit_assigned` - Sửa CV được gán
- `tasks.delete` - Xóa CV
- `tasks.reassign` - Gán lại người làm

### 3. KHÁCH HÀNG (Customers)
- `customers.view_all` - Xem tất cả KH
- `customers.view_unit` - Xem KH đơn vị
- `customers.create` - Tạo KH
- `customers.edit` - Sửa KH
- `customers.delete` - Xóa KH

### 4. HỆ SINH THÁI (Ecosystem)
- `ecosystem.view` - Xem cấu trúc
- `ecosystem.manage_unit` - Quản lý đơn vị mình
- `ecosystem.manage_children` - Quản lý đơn vị con
- `ecosystem.manage_all` - Quản lý toàn bộ
- `ecosystem.add_members` - Thêm thành viên
- `ecosystem.assign_roles` - Gán vai trò

### 5. QUY TRÌNH (Workflows)
- `workflows.view` - Xem quy trình
- `workflows.create` - Tạo quy trình
- `workflows.edit` - Sửa quy trình
- `workflows.delete` - Xóa quy trình

### 6. BÁO CÁO (Reports)
- `reports.view_all` - Xem tất cả BC
- `reports.view_unit` - Xem BC đơn vị
- `reports.export` - Xuất BC
- `reports.finance` - Xem BC tài chính (nhạy cảm)

### 7. CÀI ĐẶT (Settings)
- `settings.workflow` - Cấu hình quy trình
- `settings.templates` - Quản lý mẫu
- `settings.users` - Quản lý user
- `settings.system` - Cài đặt hệ thống

---

## 💾 DATABASE SCHEMA

### Bảng 1: `role_permissions` (Quyền mặc định)
```sql
CREATE TABLE role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role VARCHAR(50) NOT NULL,
  permission VARCHAR(100) NOT NULL,
  is_allowed BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(role, permission)
);

-- Seed admin
INSERT INTO role_permissions (role, permission) VALUES
('admin', 'projects.view_all'),
('admin', 'projects.create'),
('admin', 'projects.edit_all'),
('admin', 'projects.delete'),
('admin', 'tasks.view_all'),
('admin', 'ecosystem.manage_all'),
('admin', 'settings.system'),
('admin', 'reports.finance');

-- Seed manager
INSERT INTO role_permissions (role, permission) VALUES
('manager', 'projects.view_all'),
('manager', 'projects.create'),
('manager', 'tasks.view_all'),
('manager', 'ecosystem.manage_unit');

-- Seed employee
INSERT INTO role_permissions (role, permission) VALUES
('employee', 'projects.view_assigned'),
('employee', 'tasks.view_assigned'),
('employee', 'tasks.edit_assigned');
```

### Bảng 2: `user_permission_overrides` (Gán đặc biệt)
```sql
CREATE TABLE user_permission_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  permission VARCHAR(100) NOT NULL,
  is_allowed BOOLEAN NOT NULL,
  unit_id UUID REFERENCES ecosystem_units(id) ON DELETE CASCADE,
  reason TEXT,
  granted_by UUID REFERENCES users(id),
  granted_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  UNIQUE(user_id, permission, unit_id)
);
```

### Bảng 3: `permission_audit_log` (Audit trail)
```sql
CREATE TABLE permission_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id UUID,
  unit_id UUID,
  allowed BOOLEAN NOT NULL,
  reason TEXT,
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_user ON permission_audit_log(user_id, created_at DESC);
```

---

## 🔧 BACKEND LOGIC

### Check Permission Function
```javascript
async function hasPermission(userId, permission, resourceUnitId = null) {
  const user = await getUser(userId);
  
  // 1. Check role permissions
  const rolePerms = await getRolePermissions(user.role);
  if (rolePerms.includes(permission)) return true;
  
  // 2. Check DENY override (highest priority)
  const deny = await getUserOverride(userId, permission, null);
  if (deny && !deny.is_allowed) return false;
  
  // 3. Check unit-based access
  if (resourceUnitId) {
    const accessible = await getUserAccessibleUnits(userId, user.role);
    if (!accessible.includes(resourceUnitId)) return false;
    
    // Check unit role
    const membership = await getUnitMembership(userId, resourceUnitId);
    if (membership && ['director','manager'].includes(membership.unit_role)) {
      const unitPerms = getUnitRolePermissions(membership.unit_role);
      if (unitPerms.includes(permission)) return true;
    }
  }
  
  // 4. Check ALLOW override
  const allow = await getUserOverride(userId, permission, resourceUnitId);
  if (allow && allow.is_allowed) return true;
  
  return false;
}
```

### Middleware
```javascript
// backend/src/middleware/permission.js
function requirePermission(permission) {
  return async (req, res, next) => {
    const allowed = await hasPermission(req.user.userId, permission);
    
    await logPermissionCheck(req.user.userId, permission, allowed);
    
    if (!allowed) {
      return res.status(403).json({ 
        error: 'Không có quyền',
        permission 
      });
    }
    next();
  };
}
```

### Sử dụng
```javascript
// routes/projects.js
r.get('/', requirePermission('projects.view_all'), async (req, res) => {
  // ...
});

r.post('/', requirePermission('projects.create'), async (req, res) => {
  // ...
});

r.delete('/:id', requirePermission('projects.delete'), async (req, res) => {
  // ...
});
```

---

## 🎨 FRONTEND

### Hook: usePermission
```javascript
// hooks/usePermission.js
export function usePermission() {
  const { user } = useAuth();
  
  const can = (permission) => {
    if (['admin','manager'].includes(user?.role)) return true;
    return user?.permissions?.includes(permission) || false;
  };
  
  return { can };
}
```

### Component
```javascript
function ProjectActions({ project }) {
  const { can } = usePermission();
  
  return (
    <div>
      {can('projects.edit_all') && <button>Sửa</button>}
      {can('projects.delete') && <button>Xóa</button>}
    </div>
  );
}
```

---

## 📝 USE CASES

### Case 1: Director Khối
**Setup**:
- Role: `employee`
- Unit: Khối Miền Nam (depth=1), unit_role=`director`, can_manage_children=`true`

**Quyền**:
✅ Xem/sửa dự án của tất cả Công ty trong Khối
✅ Thêm nhân viên vào Công ty
✅ Tạo dự án cho Công ty
❌ Xóa dự án (cần override)

### Case 2: Manager Công ty
**Setup**:
- Role: `manager`
- Unit: Công ty A, unit_role=`manager`, can_manage_children=`false`

**Quyền**:
✅ Xem/sửa dự án Công ty A
✅ Tạo dự án cho Công ty A
❌ Không thấy Công ty B
❌ Không quản lý Phòng ban (can_manage_children=false)

### Case 3: Nhân viên Designer
**Setup**:
- Role: `designer`
- Unit: Team Thiết kế, unit_role=`member`

**Quyền**:
✅ Xem CV được gán
✅ Sửa CV được gán
❌ Không xem dự án khác
❌ Không tạo dự án

---

## 🚀 ROADMAP TRIỂN KHAI

### Phase 1: Setup (2-3 giờ)
- [ ] Tạo 3 bảng: role_permissions, user_permission_overrides, permission_audit_log
- [ ] Seed data cho role_permissions (admin, manager, employee)
- [ ] Test migration

### Phase 2: Backend Core (3-4 giờ)
- [ ] Viết hasPermission() function
- [ ] Viết requirePermission() middleware
- [ ] Viết helper functions (getRolePermissions, getUserOverride, etc)
- [ ] Test với Postman

### Phase 3: Apply to Routes (2-3 giờ)
- [ ] Apply middleware vào /projects routes
- [ ] Apply vào /tasks routes
- [ ] Apply vào /customers routes
- [ ] Apply vào /ecosystem routes

### Phase 4: Frontend (2-3 giờ)
- [ ] Tạo usePermission hook
- [ ] API: GET /auth/my-permissions
- [ ] Apply vào components (show/hide buttons)
- [ ] Test UI

### Phase 5: Admin UI (3-4 giờ)
- [ ] Trang quản lý permissions
- [ ] Gán/thu hồi quyền cho user
- [ ] Xem audit log
- [ ] Test end-to-end

**Tổng thời gian**: 12-17 giờ

---

## ✅ LỢI ÍCH

1. **Bảo mật tốt hơn**: Kiểm soát chi tiết ai làm được gì
2. **Linh hoạt**: 1 user nhiều vai trò ở nhiều đơn vị
3. **Kế thừa tự động**: Director Khối → auto quản lý Công ty
4. **Audit trail**: Log đầy đủ ai làm gì, khi nào
5. **Mở rộng dễ**: Thêm permission mới chỉ cần insert DB
6. **Tương thích**: Dùng lại ecosystem hiện tại

---

## 🎯 KẾT LUẬN

**Đề xuất triển khai OPTION A**:
- ✅ Đơn giản, dễ maintain
- ✅ Ít thay đổi DB (3 bảng mới)
- ✅ Logic rõ ràng
- ✅ Linh hoạt đủ cho 90% use cases
- ✅ Có thể nâng cấp sau (thêm ABAC nếu cần)

**Next step**: Bạn OK với thiết kế này → tôi code luôn!
