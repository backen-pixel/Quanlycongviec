# BÁO CÁO PHÂN QUYỀN HỆ THỐNG

## 📋 Tổng quan

### ✅ ĐÃ CÓ
- **Migration 19**: Permission system với 3 tables
  - `role_permissions` - Default permissions per role
  - `user_permission_overrides` - Grant/deny specific permissions
  - `permission_audit_log` - Audit trail
- **Middleware**: `newPermission.js` với `requirePermission()` và `checkPermission()`
- **Seed data**: Admin (39 perms), Manager (28 perms), Employee (17 perms)

### ❌ CHƯA ĐẦY ĐỦ
Nhiều routes CHƯA có permission check!

---

## 🔍 CHI TIẾT TỪNG MODULE

### 1. PROJECTS (routes/projects.js)
✅ **CÓ permission:**
- `POST /` - requirePermission('projects', 'create')
- `PUT /:id` - requirePermission('projects', 'edit')
- `DELETE /:id` - requirePermission('projects', 'delete')

❌ **THIẾU permission:**
- `GET /` - List projects (không check)
- `GET /:id` - View detail (không check)
- `GET /pending-approvals` (không check)
- `POST /create-with-flow` (không check)
- `PUT /:id/stage` - Advance stage (không check)
- `POST /:id/generate-tasks` (không check)
- `POST /:id/request-approval` (không check)
- `POST /:id/approve-advance` (không check)
- `POST /:id/check-advance` (không check)
- `GET /:id/comments` (không check)
- `POST /:id/comments` (không check)
- `GET /:id/products` (không check)
- `POST /:id/products` (không check)
- `DELETE /:id/products/:ppId` (không check)
- `GET /:id/workflow-lines` (không check)
- `POST /:id/workflow-lines` (không check)
- `PUT /:id/workflow-lines/:lineId` (không check)
- `DELETE /:id/workflow-lines/:lineId` (không check)

### 2. TASKS (routes/tasks.js)
Cần kiểm tra...

### 3. CUSTOMERS (routes/customers.js)
Cần kiểm tra...

### 4. USERS (routes/users.js)
Cần kiểm tra...

### 5. ECOSYSTEM (routes/ecosystem.js)
Cần kiểm tra...

### 6. WORKFLOWS (routes/workflowSettings.js, routes/workflows.js)
Cần kiểm tra...

### 7. TEMPLATES (routes/companyTemplates.js)
Cần kiểm tra...

### 8. APPROVALS (routes/approvals.js)
Cần kiểm tra...

---

## 🎯 KHUYẾN NGHỊ

### Mức độ ưu tiên

#### 🔴 CAO (Critical)
1. **Projects - View/List**: Employees chỉ thấy projects được gán
2. **Tasks - View/List**: Employees chỉ thấy tasks của mình
3. **Customers - All routes**: Chỉ sales/manager/admin
4. **Users - CRUD**: Chỉ admin/manager
5. **Ecosystem - Manage**: Chỉ admin

#### 🟡 TRUNG (Important)
6. **Workflows - Edit/Delete**: Chỉ admin
7. **Templates - CRUD**: Chỉ admin/manager
8. **Approvals - Approve**: Theo approval rules
9. **Settings - All**: Chỉ admin

#### 🟢 THẤP (Nice to have)
10. **Comments**: Everyone can view project comments
11. **Products**: View OK, edit = admin only

---

## 📝 PERMISSION KEYS ĐÃ ĐỊNH NGHĨA

### Projects
- `projects.view_all` - Xem tất cả dự án
- `projects.view_unit` - Xem dự án trong ecosystem unit
- `projects.view_assigned` - Xem dự án được gán
- `projects.create`
- `projects.edit_all`
- `projects.edit_assigned`
- `projects.delete`
- `projects.approve` - Approve stage advancement

### Tasks
- `tasks.view_all`
- `tasks.view_unit`
- `tasks.view_assigned`
- `tasks.create`
- `tasks.edit_all`
- `tasks.edit_assigned`
- `tasks.delete`
- `tasks.reassign`

### Customers
- `customers.view_all`
- `customers.view_unit`
- `customers.create`
- `customers.edit`
- `customers.delete`

### Ecosystem
- `ecosystem.view`
- `ecosystem.manage_unit`
- `ecosystem.manage_children`
- `ecosystem.manage_all`
- `ecosystem.add_members`
- `ecosystem.assign_roles`

### Workflows
- `workflows.view`
- `workflows.create`
- `workflows.edit`
- `workflows.delete`

### Settings
- `settings.workflow`
- `settings.templates`
- `settings.users`
- `settings.system`

---

## 🛠️ CÁCH SỬA

### VÍ DỤ: Thêm permission cho GET /projects

```javascript
// TRƯỚC
r.get('/', async (req, res) => {
  // Load projects...
});

// SAU
r.get('/', requirePermission('projects', 'view'), async (req, res) => {
  // requirePermission sẽ check:
  // - projects.view_all → thấy tất cả
  // - projects.view_unit → thấy trong unit
  // - projects.view_assigned → chỉ thấy assigned
  // Load projects dựa vào permission...
});
```

### VÍ DỤ: Custom logic trong route

```javascript
r.get('/:id', async (req, res) => {
  const userId = req.user.userId;
  const projectId = req.params.id;
  
  // Check permission
  const canViewAll = await checkPermission(userId, 'projects', 'view_all');
  const canViewAssigned = await checkPermission(userId, 'projects', 'view_assigned');
  
  if (!canViewAll && !canViewAssigned) {
    return res.status(403).json({ error: 'Không có quyền xem dự án' });
  }
  
  // If view_assigned only, check if user is assigned
  if (!canViewAll && canViewAssigned) {
    const isAssigned = await checkUserAssignedToProject(userId, projectId);
    if (!isAssigned) {
      return res.status(403).json({ error: 'Bạn không được gán vào dự án này' });
    }
  }
  
  // Load project...
});
```

---

## ✅ TODO

- [ ] Audit tất cả routes trong tất cả files
- [ ] Thêm requirePermission cho các routes quan trọng
- [ ] Test với 3 roles: admin, manager, employee
- [ ] Document permission keys cho mỗi route
- [ ] UI: Ẩn buttons/menus không có quyền
- [ ] Frontend: Check permissions trước khi gọi API

---

**Kết luận:** Có hệ thống phân quyền nhưng chưa apply đầy đủ cho tất cả routes!
