# Migration 23: Workflow Supervisors & Deadlines

## Mục đích
1. **Thêm người giám sát** cho từng quy trình trong luồng
2. **Thêm quản lý thời gian** (deadline) cho tasks và checklists trong template
3. **Tự động tính deadline** khi tạo dự án từ template

## Thay đổi Database

### 1. Supervisor cho Flow Steps
```sql
ALTER TABLE workflow_flow_steps
ADD COLUMN supervisor_id UUID → users;
```
Mỗi step trong luồng có thể có người giám sát riêng.

### 2. Supervisor + Deadline cho Template Tasks
```sql
ALTER TABLE company_template_tasks
ADD COLUMN supervisor_id UUID → users,
ADD COLUMN deadline_days INT,
ADD COLUMN deadline_type TEXT;
```

**deadline_type:**
- `from_start`: Tính từ ngày bắt đầu dự án
- `from_prev_task`: Tính từ khi task trước hoàn thành
- `from_stage_start`: Tính từ khi dự án vào stage này

**Ví dụ:**
- Task "Khảo sát": deadline_days=3, deadline_type=from_start
  → Deadline = Ngày bắt đầu + 3 ngày
- Task "Thiết kế": deadline_days=5, deadline_type=from_prev_task
  → Deadline = Ngày task "Khảo sát" hoàn thành + 5 ngày

### 3. Deadline cho Template Checklists
```sql
ALTER TABLE company_template_checklists
ADD COLUMN deadline_days INT,
ADD COLUMN deadline_type TEXT;
```

**deadline_type:**
- `from_task_start`: Từ khi task bắt đầu
- `from_prev_checklist`: Từ khi checklist trước hoàn thành
- `from_stage_start`: Từ khi vào stage

## Cách chạy Migration

### Supabase Dashboard
1. Vào: https://supabase.com/dashboard/project/kdxypztstbeovyedmvem
2. **SQL Editor**
3. Copy nội dung `23_workflow_supervisors_deadlines.sql`
4. **Run** ▶️

## Sau khi chạy

### UI cần thêm (TODO):

#### 1. Trang Template Sets (`/workflow-hub` → tab "Bộ Quy Trình Mẫu")
Khi tạo/sửa task trong template:
```
[Task Form]
  Tên nhiệm vụ: [_____________]
  Mô tả: [_____________]
  
  👁️ Người giám sát: [Dropdown chọn user]
  
  ⏰ Deadline:
    Số ngày: [3] ngày
    Tính từ: [▼ Dropdown]
      • Từ ngày bắt đầu dự án
      • Từ task trước hoàn thành
      • Từ khi vào quy trình
```

#### 2. Khi tạo dự án từ template
Backend tự động tính deadline:
```javascript
// Pseudo code
if (templateTask.deadline_days) {
  let baseDate;
  if (type === 'from_start') baseDate = project.start_date;
  if (type === 'from_prev_task') baseDate = prevTask.completed_at;
  if (type === 'from_stage_start') baseDate = project.stage_started_at;
  
  task.deadline = addDays(baseDate, templateTask.deadline_days);
}
```

#### 3. Workflow Flows - Set supervisor per step
Trang `/workflow-hub` → tab "Quản Lý Luồng":
```
[Flow Step]
  Quy trình: Tư vấn
  Công ty: Công ty A
  👁️ Giám sát: [Dropdown chọn user]  ← MỚI
```

## Cấu trúc dữ liệu

### Template Task với deadline
```json
{
  "id": "uuid",
  "title": "Khảo sát hiện trường",
  "stage_id": "consulting-stage-id",
  "supervisor_id": "user-id-123",
  "deadline_days": 3,
  "deadline_type": "from_start"
}
```

### Task được tạo từ template
```json
{
  "id": "task-uuid",
  "title": "Khảo sát hiện trường",
  "template_task_id": "template-uuid",
  "supervisor_id": "user-id-123",
  "deadline": "2026-03-13T00:00:00Z"  ← Tự động tính!
}
```

## Benefits

✅ **Phân quyền rõ ràng:** Mỗi quy trình có người giám sát riêng  
✅ **Quản lý thời gian:** Template đã có deadline → Dự án tự động có timeline  
✅ **Tái sử dụng:** Set một lần trong template, dùng mãi mãi  
✅ **Linh hoạt:** 3 cách tính deadline phù hợp nhiều tình huống  

## Next Steps

1. ✅ Chạy migration
2. ⏳ Thêm UI vào TemplateSetsPage (form task)
3. ⏳ Thêm UI vào WorkflowFlowsPage (flow step supervisor)
4. ⏳ Backend: Auto-calculate deadline khi generate tasks từ template
5. ⏳ Frontend: Hiển thị supervisor + deadline trong project detail
