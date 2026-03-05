# 📖 GIẢI THÍCH CHI TIẾT CÁC QUYỀN - TuBep Pro

**Date**: 2026-03-05  
**Purpose**: Hướng dẫn đầy đủ về ý nghĩa và cách hoạt động của từng quyền

---

## MỤC LỤC
1. [Quyền Dự án (Projects)](#1-quyền-dự-án-projects)
2. [Quyền Công việc (Tasks)](#2-quyền-công-việc-tasks)
3. [Quyền Khách hàng (Customers)](#3-quyền-khách-hàng-customers)
4. [Quyền Hệ sinh thái (Ecosystem)](#4-quyền-hệ-sinh-thái-ecosystem)
5. [Quyền Quy trình (Workflows)](#5-quyền-quy-trình-workflows)
6. [Quyền Báo cáo (Reports)](#6-quyền-báo-cáo-reports)
7. [Quyền Cài đặt (Settings)](#7-quyền-cài-đặt-settings)
8. [Ma trận quyền theo vai trò](#8-ma-trận-quyền-theo-vai-trò)

---

## 1. QUYỀN DỰ ÁN (Projects)

### `projects.view_all` — Xem tất cả dự án

**Ý nghĩa**: Có thể xem mọi dự án trong toàn hệ thống, không giới hạn theo đơn vị hay người tạo.

**Ai cần**:
- ✅ Admin (quản trị viên)
- ✅ Manager (quản lý cấp cao)
- ✅ Sales Manager (quản lý kinh doanh)
- ❌ Nhân viên thường (employee)

**Hoạt động**:
```javascript
// Backend check
if (user has 'projects.view_all') {
  // Trả về TẤT CẢ dự án
  SELECT * FROM projects ORDER BY created_at DESC;
} else {
  // Chỉ trả dự án được phép xem
  SELECT * FROM projects WHERE id IN (accessible_project_ids);
}
```

**UI hiển thị**:
- Trang `/projects` → Hiển thị tất cả dự án
- Dashboard → Thống kê toàn hệ thống
- Search → Tìm được mọi dự án

**VD thực tế**:
- **Admin**: Xem 500 dự án của cả công ty
- **Manager Công ty A**: Chỉ xem 50 dự án của Công ty A
- **Nhân viên**: Chỉ xem 3 dự án được gán

---

### `projects.view_unit` — Xem dự án của đơn vị

**Ý nghĩa**: Xem dự án thuộc đơn vị mình quản lý (Khối/Công ty/Phòng ban).

**Ai cần**:
- ✅ Director Khối → Xem DA của tất cả Công ty trong Khối
- ✅ Manager Công ty → Xem DA của Công ty
- ✅ Trưởng phòng → Xem DA của Phòng ban

**Hoạt động**:
```javascript
// 1. Lấy danh sách đơn vị user có quyền
const units = await getUserAccessibleUnits(userId);
// VD: [khoi-mn, cty-a, cty-b, pb-1, pb-2]

// 2. Lọc dự án theo units
SELECT * FROM projects 
WHERE flow_assignments @> '[{"company_unit_id": "cty-a"}]'
   OR flow_assignments @> '[{"company_unit_id": "cty-b"}]';
```

**VD thực tế**:
- **Director Khối Miền Nam**: Xem dự án của Công ty A, B, C trong Khối MN
- **Manager Công ty A**: Chỉ xem dự án của Công ty A
- **Trưởng phòng Thiết kế**: Xem dự án mà Phòng Thiết kế tham gia

---

### `projects.view_assigned` — Xem dự án được gán

**Ý nghĩa**: Chỉ xem dự án mà user được gán làm việc (sales, designer, PM...).

**Ai cần**:
- ✅ Employee (nhân viên thường)
- ✅ Designer (thiết kế viên)
- ✅ Sales (tư vấn viên)
- ❌ Không dành cho quản lý

**Hoạt động**:
```javascript
// Lọc dự án theo user_id
SELECT * FROM projects 
WHERE sales_person_id = userId
   OR designer_id = userId
   OR project_manager_id = userId
   OR production_manager_id = userId
   OR id IN (
     SELECT project_id FROM tasks WHERE assignee_id = userId
   );
```

**UI hiển thị**:
- Trang `/my-tasks` → Chỉ dự án liên quan
- Dashboard → Số liệu cá nhân
- Không thấy dự án của người khác

**VD thực tế**:
- **Thiết kế viên A**: Xem 5 dự án được gán thiết kế
- **Sales B**: Xem 10 dự án mình tư vấn
- **Không thấy**: 490 dự án khác của công ty

---

### `projects.create` — Tạo dự án mới

**Ý nghĩa**: Được phép tạo dự án mới trong hệ thống.

**Ai cần**:
- ✅ Admin
- ✅ Manager
- ✅ Sales (tạo dự án sau khi tư vấn khách)
- ❌ Designer, Production (không tạo dự án)

**Hoạt động**:
```javascript
// Backend route: POST /projects
r.post('/', requirePermission('projects.create'), async (req, res) => {
  // 1. Check permission ✓
  // 2. Validate dữ liệu
  // 3. Insert vào DB
  const project = await supabase.from('projects').insert({
    name: req.body.name,
    customer_id: req.body.customer_id,
    created_by_id: req.user.userId,
    // ...
  });
  
  // 4. Return project
  res.json({ project });
});
```

**UI hiển thị**:
- Nút **"+ Tạo dự án"** xuất hiện
- Form tạo dự án accessible
- Redirect sau khi tạo thành công

**VD thực tế**:
- **Sales**: Tạo dự án sau khi tư vấn khách thành công
- **Manager**: Tạo dự án nội bộ
- **Designer**: Không có nút "Tạo dự án" (chỉ được gán vào)

---

### `projects.edit_all` — Sửa tất cả dự án

**Ý nghĩa**: Sửa bất kỳ dự án nào, không giới hạn (nguy hiểm!).

**Ai cần**:
- ✅ Admin (cần sửa mọi thứ)
- ✅ Manager cấp cao
- ❌ Employee, Designer, Sales

**Hoạt động**:
```javascript
// Backend route: PUT /projects/:id
r.put('/:id', requirePermission('projects.edit_all'), async (req, res) => {
  // Không cần check ownership, sửa luôn
  await supabase.from('projects').update({
    name: req.body.name,
    estimated_value: req.body.estimated_value,
    // ...
  }).eq('id', req.params.id);
});
```

**Nguy hiểm**:
⚠️ Có thể sửa dự án của người khác  
⚠️ Có thể thay đổi giá trị, trạng thái  
⚠️ Cần audit log chặt chẽ  

**VD thực tế**:
- **Admin**: Sửa lỗi dữ liệu dự án
- **Manager**: Cập nhật giá trị dự án quan trọng
- **Log**: "Admin sửa DA-001: giá trị 50M → 70M"

---

### `projects.edit_assigned` — Sửa dự án được gán

**Ý nghĩa**: Chỉ sửa dự án mà mình được gán (sales, designer, PM...).

**Ai cần**:
- ✅ Employee
- ✅ Designer (sửa thông tin thiết kế)
- ✅ Sales (cập nhật thông tin khách)

**Hoạt động**:
```javascript
r.put('/:id', requirePermission('projects.edit_assigned'), async (req, res) => {
  // 1. Kiểm tra ownership
  const project = await supabase.from('projects')
    .select('sales_person_id, designer_id, project_manager_id')
    .eq('id', req.params.id).single();
  
  const isAssigned = [
    project.sales_person_id,
    project.designer_id,
    project.project_manager_id
  ].includes(req.user.userId);
  
  if (!isAssigned) {
    return res.status(403).json({ error: 'Không có quyền sửa dự án này' });
  }
  
  // 2. Cho phép sửa
  await supabase.from('projects').update(req.body).eq('id', req.params.id);
});
```

**Giới hạn**:
- Chỉ sửa được dự án liên quan đến mình
- Không sửa được dự án của người khác
- An toàn hơn `edit_all`

---

### `projects.delete` — Xóa dự án

**Ý nghĩa**: Xóa dự án khỏi hệ thống (CỰC KỲ NGUY HIỂM!).

**Ai cần**:
- ✅ Admin (trong trường hợp đặc biệt)
- ❌ Manager (thường KHÔNG nên có)
- ❌ Employee

**Hoạt động**:
```javascript
r.delete('/:id', requirePermission('projects.delete'), async (req, res) => {
  // 1. Log audit (BẮT BUỘC)
  await logAudit(req.user.userId, 'projects.delete', req.params.id, {
    project_name: project.name,
    reason: req.body.reason, // Bắt buộc có lý do
  });
  
  // 2. Soft delete (khuyến nghị)
  await supabase.from('projects').update({
    deleted_at: new Date(),
    deleted_by: req.user.userId,
  }).eq('id', req.params.id);
  
  // Hoặc hard delete (nguy hiểm)
  // await supabase.from('projects').delete().eq('id', req.params.id);
});
```

**Bảo vệ**:
- ⚠️ Yêu cầu lý do xóa
- ⚠️ Audit log chi tiết
- ⚠️ Khuyến nghị soft delete (deleted_at)
- ⚠️ Xác nhận 2 lần trước khi xóa

**VD thực tế**:
- **Admin**: Xóa dự án test, dự án nhầm lẫn
- **Audit log**: "Admin xóa DA-999: Lý do: Dự án test"

---

### `projects.approve` — Duyệt chuyển giai đoạn

**Ý nghĩa**: Duyệt cho dự án chuyển sang giai đoạn tiếp theo (Tư vấn → Thiết kế → ...).

**Ai cần**:
- ✅ Manager
- ✅ Director đơn vị
- ✅ PM (Project Manager)
- ❌ Employee thường

**Hoạt động**:
```javascript
r.post('/:id/advance-stage', requirePermission('projects.approve'), async (req, res) => {
  // 1. Kiểm tra điều kiện
  const project = await getProject(req.params.id);
  const currentStage = project.current_stage;
  const nextStage = getNextStage(currentStage);
  
  // 2. Kiểm tra tasks hoàn thành
  const { stageTasksDone, stageTasksTotal } = await getStageProgress(project.id, currentStage.id);
  if (stageTasksDone < stageTasksTotal) {
    return res.status(400).json({ error: 'Chưa hoàn thành hết công việc' });
  }
  
  // 3. Chuyển stage
  await supabase.from('projects').update({
    status: nextStage.slug,
    current_stage_id: nextStage.id,
  }).eq('id', req.params.id);
  
  // 4. Tạo approval record
  await supabase.from('project_approvals').insert({
    project_id: req.params.id,
    from_stage: currentStage.slug,
    to_stage: nextStage.slug,
    approved_by: req.user.userId,
  });
  
  // 5. Notify team
  await notifyStageAdvance(project, currentStage, nextStage);
});
```

**Quy trình**:
1. Manager kiểm tra tiến độ
2. Xác nhận tất cả tasks hoàn thành
3. Bấm "Chuyển giai đoạn"
4. Hệ thống ghi log + notify team

**VD thực tế**:
- **PM**: Duyệt dự án từ "Thiết kế" → "Báo giá"
- **Manager**: Duyệt "Báo giá" → "Hợp đồng"
- **Notify**: "Dự án DA-001 đã chuyển sang Hợp đồng"

---

## 2. QUYỀN CÔNG VIỆC (Tasks)

### `tasks.view_all` — Xem tất cả công việc

**Ý nghĩa**: Xem mọi task trong hệ thống, không giới hạn.

**Ai cần**:
- ✅ Admin
- ✅ Manager
- ❌ Employee

**Hoạt động**:
```javascript
if (user has 'tasks.view_all') {
  SELECT * FROM tasks ORDER BY created_at DESC;
} else {
  SELECT * FROM tasks WHERE assignee_id = userId;
}
```

**UI hiển thị**:
- Trang `/tasks` → Tất cả công việc
- Filter theo assignee, stage, priority
- Export danh sách công việc

---

### `tasks.view_unit` — Xem công việc của đơn vị

**Ý nghĩa**: Xem tasks của đơn vị mình quản lý.

**Ai cần**:
- ✅ Director Khối
- ✅ Manager Công ty
- ✅ Trưởng phòng

**Hoạt động**:
```javascript
// 1. Lấy units
const units = await getUserAccessibleUnits(userId);

// 2. Lấy projects của units
const projects = await getProjectsByUnits(units);

// 3. Lấy tasks của projects
SELECT * FROM tasks WHERE project_id IN (project_ids);
```

**VD thực tế**:
- **Manager Công ty A**: Xem 200 tasks của Công ty A
- **Trưởng phòng Thiết kế**: Xem 50 tasks của team Thiết kế

---

### `tasks.view_assigned` — Xem công việc được gán

**Ý nghĩa**: Chỉ xem tasks được gán cho mình.

**Ai cần**:
- ✅ Employee (mặc định)
- ✅ Designer
- ✅ Mọi nhân viên

**Hoạt động**:
```javascript
SELECT * FROM tasks 
WHERE assignee_id = userId
   OR id IN (
     SELECT task_id FROM task_participants WHERE user_id = userId
   );
```

**UI hiển thị**:
- Trang `/my-tasks` → Chỉ tasks của mình
- Dashboard → Số tasks cần làm
- Notifications → Alerts khi có task mới

---

### `tasks.create` — Tạo công việc mới

**Ý nghĩa**: Tạo task mới (trong dự án hoặc cá nhân).

**Ai cần**:
- ✅ Manager
- ✅ PM
- ✅ Team Lead
- ❌ Employee thường (trừ khi được override)

**Hoạt động**:
```javascript
r.post('/', requirePermission('tasks.create'), async (req, res) => {
  const task = await supabase.from('tasks').insert({
    project_id: req.body.project_id,
    title: req.body.title,
    assignee_id: req.body.assignee_id,
    created_by_id: req.user.userId,
  }).select().single();
  
  // Notify assignee
  if (task.assignee_id) {
    await notify(task.assignee_id, 'task_assigned', task);
  }
});
```

**VD thực tế**:
- **PM**: Tạo task "Thiết kế bản vẽ" gán cho Designer
- **Team Lead**: Tạo task "Review code" cho dev

---

### `tasks.edit_all` — Sửa tất cả công việc

**Ý nghĩa**: Sửa bất kỳ task nào.

**Ai cần**:
- ✅ Admin
- ✅ Manager
- ❌ Employee

**Hoạt động**:
```javascript
r.put('/:id', requirePermission('tasks.edit_all'), async (req, res) => {
  await supabase.from('tasks').update({
    title: req.body.title,
    status: req.body.status,
    assignee_id: req.body.assignee_id,
  }).eq('id', req.params.id);
});
```

---

### `tasks.edit_assigned` — Sửa công việc được gán

**Ý nghĩa**: Chỉ sửa task của mình.

**Ai cần**:
- ✅ Employee (mặc định)
- ✅ Mọi người (với tasks của mình)

**Hoạt động**:
```javascript
r.put('/:id', requirePermission('tasks.edit_assigned'), async (req, res) => {
  const task = await supabase.from('tasks')
    .select('assignee_id').eq('id', req.params.id).single();
  
  if (task.assignee_id !== req.user.userId) {
    return res.status(403).json({ error: 'Không có quyền' });
  }
  
  // Chỉ cho sửa một số fields
  await supabase.from('tasks').update({
    status: req.body.status,      // OK
    notes: req.body.notes,         // OK
    // assignee_id: KHÔNG cho đổi
  }).eq('id', req.params.id);
});
```

**Giới hạn**:
- Chỉ sửa status, notes, time_logged
- Không đổi assignee, priority
- Không sửa task của người khác

---

### `tasks.delete` — Xóa công việc

**Ý nghĩa**: Xóa task (nguy hiểm).

**Ai cần**:
- ✅ Admin
- ❌ Manager (thường không cần)
- ❌ Employee

**Hoạt động**: Tương tự `projects.delete` (cần audit log)

---

### `tasks.reassign` — Gán lại người thực hiện

**Ý nghĩa**: Đổi assignee của task.

**Ai cần**:
- ✅ Manager
- ✅ PM
- ✅ Team Lead
- ❌ Employee thường

**Hoạt động**:
```javascript
r.put('/:id/reassign', requirePermission('tasks.reassign'), async (req, res) => {
  const oldTask = await getTask(req.params.id);
  
  await supabase.from('tasks').update({
    assignee_id: req.body.new_assignee_id,
  }).eq('id', req.params.id);
  
  // Notify old assignee
  await notify(oldTask.assignee_id, 'task_unassigned', oldTask);
  
  // Notify new assignee
  await notify(req.body.new_assignee_id, 'task_assigned', oldTask);
  
  // Log
  await logAudit(req.user.userId, 'tasks.reassign', req.params.id, {
    from: oldTask.assignee_id,
    to: req.body.new_assignee_id,
  });
});
```

**VD thực tế**:
- **PM**: Nhân viên A nghỉ → gán task cho nhân viên B
- **Team Lead**: Load balancing giữa các thành viên

---

## 3. QUYỀN KHÁCH HÀNG (Customers)

### `customers.view_all` — Xem tất cả khách hàng

**Ý nghĩa**: Xem toàn bộ database khách hàng.

**Ai cần**:
- ✅ Admin
- ✅ Sales Manager
- ❌ Sales thường (chỉ xem KH của mình)

**Hoạt động**:
```javascript
if (user has 'customers.view_all') {
  SELECT * FROM customers ORDER BY created_at DESC;
} else {
  SELECT * FROM customers WHERE sales_person_id = userId;
}
```

**Bảo mật**:
⚠️ Database khách hàng = tài sản công ty  
⚠️ Cần hạn chế quyền truy cập  
⚠️ Log khi export data  

---

### `customers.view_unit` — Xem khách hàng của đơn vị

**Ý nghĩa**: Xem KH thuộc đơn vị mình quản lý.

**Ai cần**:
- ✅ Manager Công ty
- ✅ Sales Leader

**Hoạt động**:
```javascript
const units = await getUserAccessibleUnits(userId);
SELECT * FROM customers 
WHERE created_by IN (
  SELECT id FROM users WHERE unit_id IN (units)
);
```

---

### `customers.create` — Tạo khách hàng mới

**Ý nghĩa**: Thêm KH vào hệ thống.

**Ai cần**:
- ✅ Sales
- ✅ Manager
- ❌ Designer, Production

**Hoạt động**:
```javascript
r.post('/', requirePermission('customers.create'), async (req, res) => {
  const customer = await supabase.from('customers').insert({
    full_name: req.body.full_name,
    phone: req.body.phone,
    created_by: req.user.userId,
  }).select().single();
  
  res.json({ customer });
});
```

---

### `customers.edit` — Sửa thông tin khách hàng

**Ý nghĩa**: Cập nhật thông tin KH.

**Ai cần**:
- ✅ Sales (KH của mình)
- ✅ Manager (mọi KH)

**Hoạt động**:
```javascript
r.put('/:id', requirePermission('customers.edit'), async (req, res) => {
  // Có thể kết hợp check ownership
  const customer = await getCustomer(req.params.id);
  
  if (!user.has('customers.edit_all') && customer.created_by !== userId) {
    return res.status(403).json({ error: 'Không có quyền' });
  }
  
  await supabase.from('customers').update(req.body).eq('id', req.params.id);
});
```

---

### `customers.delete` — Xóa khách hàng

**Ý nghĩa**: Xóa KH (RẤT NGUY HIỂM - mất data vĩnh viễn).

**Ai cần**:
- ✅ Admin (trong trường hợp đặc biệt)
- ❌ Hầu như không ai nên có

**Bảo vệ**:
- Soft delete (recommended)
- Audit log chi tiết
- Kiểm tra xem KH có dự án không

---

## 4. QUYỀN HỆ SINH THÁI (Ecosystem)

### `ecosystem.view` — Xem cấu trúc hệ sinh thái

**Ý nghĩa**: Xem org chart, cấu trúc tổ chức.

**Ai cần**:
- ✅ Mọi người (public info)

**Hoạt động**:
```javascript
SELECT * FROM ecosystem_units WHERE is_active = true;
SELECT * FROM ecosystem_levels;
```

**UI hiển thị**:
- Trang `/ecosystem` → Tree view
- Org chart interactive

---

### `ecosystem.manage_unit` — Quản lý đơn vị của mình

**Ý nghĩa**: Quản lý đơn vị mà mình là director/manager.

**Ai cần**:
- ✅ Director đơn vị
- ✅ Manager đơn vị

**Hoạt động**:
```javascript
// Check membership
const membership = await supabase.from('ecosystem_unit_members')
  .select('unit_role')
  .eq('unit_id', unitId)
  .eq('user_id', userId)
  .single();

if (['director', 'manager'].includes(membership.unit_role)) {
  // Allow edit unit info
  await supabase.from('ecosystem_units').update({
    name: req.body.name,
    description: req.body.description,
  }).eq('id', unitId);
}
```

---

### `ecosystem.manage_children` — Quản lý đơn vị con

**Ý nghĩa**: Quản lý các đơn vị cấp dưới (Khối → Công ty → Phòng ban).

**Ai cần**:
- ✅ Director Khối (quản lý Công ty)
- ✅ Director Công ty (quản lý Phòng ban)

**Hoạt động**:
```javascript
const membership = await getUnitMembership(userId, unitId);

if (membership.can_manage_children && membership.unit_role === 'director') {
  // Get children
  const children = await supabase.from('ecosystem_units')
    .select('*')
    .eq('parent_id', unitId);
  
  // Allow manage
  return children;
}
```

**VD thực tế**:
- **Director Khối MN**: Tạo/sửa/xóa Công ty A, B, C
- **Director Công ty A**: Tạo/sửa Phòng ban Thiết kế, Sản xuất

---

### `ecosystem.manage_all` — Quản lý toàn bộ hệ sinh thái

**Ý nghĩa**: Toàn quyền với mọi đơn vị.

**Ai cần**:
- ✅ Admin (ONLY)

**Hoạt động**:
- Tạo/sửa/xóa bất kỳ unit nào
- Thay đổi hierarchy
- Tạo/xóa levels

---

### `ecosystem.add_members` — Thêm thành viên vào đơn vị

**Ý nghĩa**: Thêm user vào unit.

**Ai cần**:
- ✅ Director/Manager đơn vị
- ✅ HR

**Hoạt động**:
```javascript
r.post('/units/:id/members', requirePermission('ecosystem.add_members'), async (req, res) => {
  // Check can manage this unit
  const canManage = await canManageUnit(req.user.userId, req.user.role, req.params.id);
  if (!canManage) return res.status(403).json({ error: 'Không có quyền' });
  
  // Add member
  await supabase.from('ecosystem_unit_members').insert({
    unit_id: req.params.id,
    user_id: req.body.user_id,
    unit_role: req.body.unit_role || 'member',
  });
});
```

---

### `ecosystem.assign_roles` — Gán vai trò trong đơn vị

**Ý nghĩa**: Đổi unit_role của thành viên (member → manager → director).

**Ai cần**:
- ✅ Director đơn vị
- ✅ Admin

**Hoạt động**:
```javascript
r.put('/units/:unitId/members/:userId/role', requirePermission('ecosystem.assign_roles'), async (req, res) => {
  await supabase.from('ecosystem_unit_members')
    .update({ unit_role: req.body.unit_role })
    .eq('unit_id', req.params.unitId)
    .eq('user_id', req.params.userId);
  
  // Log
  await logAudit(req.user.userId, 'ecosystem.assign_roles', req.params.unitId, {
    target_user: req.params.userId,
    new_role: req.body.unit_role,  });
});
```

---

## 5. QUYỀN QUY TRÌNH (Workflows)

### `workflows.view` — Xem quy trình

**Ý nghĩa**: Xem danh sách flows, stages, templates.

**Ai cần**:
- ✅ Mọi người (để hiểu quy trình làm việc)

**Hoạt động**:
```javascript
SELECT * FROM workflow_flows;
SELECT * FROM workflow_stages;
```

---

### `workflows.create` — Tạo quy trình

**Ý nghĩa**: Tạo luồng mới (8 bước, workflow flow).

**Ai cần**:
- ✅ Admin
- ✅ Manager cấp cao
- ❌ Employee

**Hoạt động**:
```javascript
r.post('/flows', requirePermission('workflows.create'), async (req, res) => {
  const flow = await supabase.from('workflow_flows').insert({
    name: req.body.name,
    description: req.body.description,
  }).select().single();
  
  // Insert steps
  for (const step of req.body.steps) {
    await supabase.from('workflow_flow_steps').insert({
      flow_id: flow.id,
      stage_id: step.stage_id,
      order_index: step.order_index,
    });
  }
});
```

---

### `workflows.edit` — Sửa quy trình

**Ý nghĩa**: Chỉnh sửa flows, stages.

**Ai cần**:
- ✅ Admin
- ✅ Manager phụ trách quy trình

---

### `workflows.delete` — Xóa quy trình

**Ý nghĩa**: Xóa flow (nguy hiểm nếu đang có dự án dùng).

**Ai cần**:
- ✅ Admin (sau khi kiểm tra)

**Bảo vệ**:
```javascript
// Kiểm tra xem flow có đang được dùng không
const projects = await supabase.from('projects')
  .select('id')
  .eq('flow_id', flowId);

if (projects.length > 0) {
  return res.status(400).json({ 
    error: `Không thể xóa: ${projects.length} dự án đang dùng flow này` 
  });
}
```

---

## 6. QUYỀN BÁO CÁO (Reports)

### `reports.view_all` — Xem tất cả báo cáo

**Ý nghĩa**: Xem mọi báo cáo (tiến độ, doanh thu, KPI...).

**Ai cần**:
- ✅ Admin
- ✅ Manager cấp cao
- ❌ Employee

---

### `reports.view_unit` — Xem báo cáo đơn vị

**Ý nghĩa**: Chỉ xem báo cáo của đơn vị mình.

**Ai cần**:
- ✅ Director/Manager đơn vị

**Hoạt động**:
```javascript
const units = await getUserAccessibleUnits(userId);

// Dashboard stats chỉ của units
const stats = await getStatsForUnits(units);
```

---

### `reports.export` — Xuất báo cáo

**Ý nghĩa**: Download báo cáo ra Excel/PDF.

**Ai cần**:
- ✅ Manager
- ❌ Employee (tránh leak data)

**Hoạt động**:
```javascript
r.get('/reports/export', requirePermission('reports.export'), async (req, res) => {
  const data = await getReportData(req.query);
  
  // Log export
  await logAudit(req.user.userId, 'reports.export', null, {
    report_type: req.query.type,
    date_range: req.query.range,
  });
  
  // Generate Excel
  const excel = generateExcel(data);
  res.download(excel);
});
```

---

### `reports.finance` — Xem báo cáo tài chính

**Ý nghĩa**: Xem doanh thu, chi phí, lợi nhuận (NHẠY CẢM!).

**Ai cần**:
- ✅ Admin
- ✅ CEO/CFO
- ✅ Kế toán trưởng
- ❌ Manager thường
- ❌ Employee

**Hoạt động**:
```javascript
r.get('/reports/finance', requirePermission('reports.finance'), async (req, res) => {
  const stats = {
    total_revenue: await getTotalRevenue(),
    total_cost: await getTotalCost(),
    profit: revenue - cost,
    by_company: await getRevenueByCompany(),
  };
  
  // Log (quan trọng!)
  await logAudit(req.user.userId, 'reports.finance', null, {
    viewed_at: new Date(),
    ip: req.ip,
  });
  
  res.json(stats);
});
```

**Bảo mật**:
⚠️ Thông tin nhạy cảm nhất  
⚠️ Phải log mọi truy cập  
⚠️ Có thể thêm 2FA  

---

## 7. QUYỀN CÀI ĐẶT (Settings)

### `settings.workflow` — Cấu hình quy trình

**Ý nghĩa**: Sửa stages, flows, templates.

**Ai cần**:
- ✅ Admin
- ✅ Process Manager

---

### `settings.templates` — Quản lý mẫu

**Ý nghĩa**: Tạo/sửa/xóa template sets, task templates.

**Ai cần**:
- ✅ Admin
- ✅ Manager

---

### `settings.users` — Quản lý người dùng

**Ý nghĩa**: Tạo/sửa/xóa users, reset password.

**Ai cần**:
- ✅ Admin
- ✅ HR
- ❌ Manager thường

**Hoạt động**:
```javascript
r.post('/users', requirePermission('settings.users'), async (req, res) => {
  const user = await supabase.from('users').insert({
    email: req.body.email,
    full_name: req.body.full_name,
    role: req.body.role,
    password: await bcrypt.hash(req.body.password, 10),
  }).select().single();
  
  // Log
  await logAudit(req.user.userId, 'settings.users', user.id, {
    action: 'create_user',
    email: req.body.email,
  });
});
```

---

### `settings.system` — Cài đặt hệ thống

**Ý nghĩa**: Cấu hình toàn hệ thống (NGUY HIỂM NHẤT!).

**Ai cần**:
- ✅ Admin (ONLY)

**Bao gồm**:
- Database migrations
- System config
- Feature flags
- API keys

---

## 8. MA TRẬN QUYỀN THEO VAI TRÒ

### Admin (Toàn quyền)
```
✅ projects.* (tất cả)
✅ tasks.* (tất cả)
✅ customers.* (tất cả)
✅ ecosystem.* (tất cả)
✅ workflows.* (tất cả)
✅ reports.* (tất cả)
✅ settings.* (tất cả)
```

### Manager (Quản lý cấp cao)
```
✅ projects.view_all
✅ projects.create
✅ projects.edit_all
✅ projects.approve
✅ tasks.view_all
✅ tasks.create
✅ tasks.edit_all
✅ tasks.reassign
✅ customers.view_all
✅ customers.create
✅ customers.edit
✅ ecosystem.manage_unit
✅ ecosystem.add_members
✅ reports.view_all
✅ reports.export
❌ projects.delete
❌ reports.finance (cần override)
❌ settings.system
```

### Employee (Nhân viên thường)
```
✅ projects.view_assigned
✅ projects.edit_assigned (limited)
✅ tasks.view_assigned
✅ tasks.edit_assigned
✅ ecosystem.view
❌ projects.create
❌ projects.delete
❌ tasks.create
❌ customers.view_all
❌ reports.*
❌ settings.*
```

### Sales (Tư vấn viên)
```
✅ projects.view_all (hoặc view_unit)
✅ projects.create
✅ projects.edit_assigned
✅ tasks.view_assigned
✅ tasks.edit_assigned
✅ customers.view_all (hoặc view_unit)
✅ customers.create
✅ customers.edit
❌ projects.delete
❌ tasks.delete
❌ reports.finance
```

### Designer (Thiết kế viên)
```
✅ projects.view_assigned
✅ projects.edit_assigned (thiết kế)
✅ tasks.view_assigned
✅ tasks.edit_assigned
❌ projects.create
❌ customers.*
❌ reports.*
```

### Director Khối (Giám đốc Khối)
```
✅ projects.view_unit (tất cả công ty trong khối)
✅ projects.create
✅ projects.edit_all (trong unit)
✅ projects.approve
✅ tasks.view_unit
✅ tasks.create
✅ tasks.reassign
✅ ecosystem.manage_unit
✅ ecosystem.manage_children
✅ ecosystem.add_members
✅ reports.view_unit
✅ reports.export
❌ projects.delete (cần override)
❌ reports.finance (cần override)
```

---

## 📊 TỔNG KẾT

### Nguyên tắc thiết kế quyền:

1. **Least Privilege**: Cho quyền tối thiểu cần thiết
2. **Separation of Duties**: Tách quyền view/edit/delete
3. **Audit Everything**: Log mọi hành động nhạy cảm
4. **Hierarchy-based**: Kế thừa từ trên xuống
5. **Override Capability**: Có thể gán đặc biệt khi cần

### Quyền nguy hiểm (cần cẩn thận):

⚠️ **DELETE permissions** - Có thể mất data  
⚠️ **reports.finance** - Thông tin nhạy cảm  
⚠️ **settings.system** - Ảnh hưởng toàn hệ thống  
⚠️ **ecosystem.manage_all** - Thay đổi cấu trúc tổ chức  

### Best practices:

✅ Luôn check permission trước khi thực hiện action  
✅ Log audit cho mọi thao tác quan trọng  
✅ Soft delete thay vì hard delete  
✅ Yêu cầu lý do khi delete/override  
✅ Review permissions định kỳ  
✅ Revoke quyền khi nhân viên rời công ty  

---

**Next**: Bạn muốn implement hệ thống này không? Tôi sẵn sàng code! 🚀
