# Hướng Dẫn: Thêm Người Quan Sát / Giám Sát

## Tóm tắt
Hệ thống TuBep Pro hỗ trợ 2 loại vai trò theo dõi:

1. **Người quan sát (Observer)**: Xem nhiệm vụ, nhận thông báo, không tham gia thực hiện
2. **Người giám sát (Supervisor)**: Theo dõi toàn bộ dự án/quy trình

---

## 1. NHIỆM VỤ (Tasks) - Người Hỗ Trợ & Quan Sát

### Cách thêm:
1. Mở chi tiết nhiệm vụ (click vào task)
2. Chuyển sang tab **"Thành viên"** (icon 👥)
3. Thấy 2 phần:
   - **Người hỗ trợ** (xanh dương) - tham gia làm việc
   - **Người quan sát** (tím) - chỉ theo dõi

### Quyền hạn:
- **Người hỗ trợ**: Được assign task, comment, checklist, time log
- **Người quan sát**: Chỉ xem, nhận thông báo khi task có thay đổi

### Cơ sở dữ liệu:
- **Bảng**: `task_participants`
- **Cột**: `role` = `'participant'` hoặc `'observer'`

### API:
```bash
# Thêm người quan sát
POST /tasks/:taskId/participants
Body: { user_id: "xxx", role: "observer" }

# Xóa người quan sát
DELETE /tasks/:taskId/participants/:userId
```

---

## 2. DỰ ÁN (Projects) - Người Giám Sát

### Cách thêm:
1. Khi **tạo dự án mới** (CreateProjectNew.jsx)
2. Ở bước **"Thông Tin"**, tìm dropdown:
   - **🧑 Người Giám Sát** (không bắt buộc)
3. Chọn 1 người từ danh sách

### Quyền hạn:
- Người giám sát có thể **xem toàn bộ dự án**
- Theo dõi tiến độ, task, timeline, documents
- Nhận thông báo về các sự kiện quan trọng

### Cơ sở dữ liệu:
- **Bảng**: `projects`
- **Cột**: `supervisor_id` (UUID, FK → users)

### Hiển thị:
- Ở trang chi tiết dự án, hiển thị người giám sát trong phần info

---

## 3. QUY TRÌNH (Workflow Flow Steps)

### Cơ sở dữ liệu:
- **Bảng**: `workflow_flow_steps`
- **Cột**: `supervisor_id`

### Chưa có UI:
- Hiện tại DB đã support, nhưng chưa có giao diện để chọn
- Có thể thêm vào form tạo/sửa Flow Template (tương tự như chọn công ty/bộ phận)

---

## 4. Component Dùng Chung: `ParticipantManager`

File: `frontend/src/components/ParticipantManager.jsx`

### Props:
```jsx
<ParticipantManager
  entityType="task"          // hoặc "project"
  entityId={taskId}
  participants={task.participants}
  onUpdated={loadTask}
  readOnly={false}           // true = chỉ xem
/>
```

### Tính năng:
- ✅ Thêm người hỗ trợ (participant)
- ✅ Thêm người quan sát (observer)
- ✅ Xóa người khỏi danh sách
- ✅ Avatar + tên + email
- ✅ Icon phân biệt (👁️ cho observer)
- ✅ Lọc user chưa được thêm (tránh trùng)

---

## 5. Backend Routes

### Tasks:
```javascript
// routes/tasks.js
POST   /:taskId/participants           // Thêm hỗ trợ/quan sát
DELETE /:taskId/participants/:userId   // Xóa
```

### Projects:
```javascript
// routes/projects.js
POST /create-with-flow
Body: { ..., supervisor_id: "xxx" }
```

---

## 6. Migrations

### Đã chạy:
- ✅ `03_bitrix_logic.sql` - task_participants table
- ✅ `22_project_supervisor.sql` - projects.supervisor_id
- ✅ `23_workflow_supervisors_deadlines.sql` - workflow_flow_steps.supervisor_id

### Kiểm tra:
```sql
SELECT * FROM task_participants WHERE role = 'observer';
SELECT * FROM projects WHERE supervisor_id IS NOT NULL;
```

---

## 7. Checklist / Quy trình - Chưa có

Hiện tại:
- **Checklist** dùng chung với task (checklist thuộc task → dùng task participants)
- **Quy trình luồng** có field `supervisor_id` nhưng chưa có UI

Cần bổ sung:
- UI chọn supervisor cho flow steps (trong form tạo flow template)
- Khi generate task từ template → inherit supervisor từ flow step

---

## 8. Tương lai: Thông báo & Quyền hạn

### Thông báo:
- Người quan sát nhận notify khi:
  - Task thay đổi status
  - Có comment mới
  - Checklist hoàn thành

### Quyền hạn:
- Có thể giới hạn chỉ **admin/manager** mới thêm/xóa người quan sát
- Người giám sát dự án có thể nhảy vào bất kỳ task nào trong dự án

---

## 9. Giao diện Mới

### TaskDetailModal - Tab "Thành viên":
- Trước: Chỉ hiển thị list tĩnh
- Sau: Có nút **+ Thêm** cho Hỗ trợ và Quan sát
- Hover vào người → nút X để xóa

### CreateProjectNew - Form tạo dự án:
- Thêm dropdown **Người Giám Sát** (sau Ưu Tiên)
- Icon: 🧑 User
- Màu: Indigo (tím nhạt)

---

## 10. Demo

```bash
# Build frontend
cd frontend && npm run build

# Restart backend
cd backend && npm run dev
```

### Test:
1. Tạo dự án mới → chọn người giám sát
2. Tạo task → vào tab Thành viên → thêm quan sát
3. Kiểm tra DB:
   ```sql
   SELECT * FROM task_participants WHERE role = 'observer';
   SELECT * FROM projects WHERE supervisor_id IS NOT NULL;
   ```

---

## Tổng kết

| Loại | Field/Table | UI Đã Có | API Đã Có |
|------|-------------|----------|-----------|
| **Task - Hỗ trợ** | task_participants (role=participant) | ✅ | ✅ |
| **Task - Quan sát** | task_participants (role=observer) | ✅ | ✅ |
| **Dự án - Giám sát** | projects.supervisor_id | ✅ | ✅ |
| **Quy trình - Giám sát** | workflow_flow_steps.supervisor_id | ❌ | ✅ (DB) |
| **Checklist** | (dùng chung task) | ✅ | ✅ |

---

✅ **Hoàn thành**: Task + Project supervisor UI + API
🔜 **Tương lai**: Flow step supervisor UI + notification system
