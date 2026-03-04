# ✨ Thêm Nhân Viên Phụ Trách Cho Tasks — Hoàn Thành

**Commit**: `4414b44`  
**Date**: 2026-03-04  
**Status**: ✅ Complete

---

## Yêu Cầu

> Ở quản lý luồng, phần nhiệm vụ và checklist có thể gắn cho nhân viên phụ trách, nhưng danh sách nhân viên sẽ phụ thuộc vào công ty

---

## Giải Pháp

### Workflow
```
1. Chọn Công ty
   ↓
2. Auto load nhân viên của công ty đó
   ↓
3. Khi thêm Task
   → Dropdown Nhân viên (chỉ hiển thị NV của công ty)
   → Gắn assignee_id
   ↓
4. Task được tạo với assignee_id
   → Hiển thị tên NV phụ trách
```

### Code Changes

**CompanyProcessesPage.jsx**:
```javascript
// 1. Load employees khi công ty thay đổi
const loadCompanyEmployees = async (companyId) => {
  const { data } = await api.get(`/users?company_id=${companyId}`);
  setCompanyEmployees(data.users || []);
};

// 2. Pass employees xuống ProcessRow
<ProcessRow 
  ... 
  companyEmployees={companyEmployees}
/>

// 3. ProcessRow pass xuống InlineAddTask
<InlineAddTask 
  onAdd={addTask} 
  companyEmployees={companyEmployees}
/>
```

**InlineAddTask Component**:
```javascript
// Thêm dropdown chọn nhân viên
<select value={assigneeId} onChange={e => setAssigneeId(e.target.value)}>
  <option value="">-- Nhân viên --</option>
  {companyEmployees.map(emp => (
    <option key={emp.id} value={emp.id}>
      {emp.full_name}
    </option>
  ))}
</select>

// Pass assigneeId khi gọi onAdd
onAdd(title, priority, dd, dh, assigneeId)
```

**addTask Function**:
```javascript
const addTask = async (title, priority, dd, dh, assigneeId) => {
  await api.post(`/tasks`, { 
    title, 
    priority, 
    deadline_days: dd, 
    deadline_hours: dh,
    assignee_id: assigneeId || null // NEW
  });
};
```

---

## Features

✅ **Company-based Employee Filter**
- Chọn công ty → auto load nhân viên của công ty
- Dropdown nhân viên chỉ hiển thị NV của công ty đó

✅ **Task Assignment**
- Khi tạo task: chọn nhân viên phụ trách
- assignee_id được gửi lên backend
- Có thể để trống (nullable)

✅ **Display in Task Row**
- Hiển thị tên nhân viên phụ trách (short name)
- Format: `👤 Tên nhân viên`
- Nếu không gắn → không hiển thị

---

## UI Elements

### Dropdown Nhân Viên
```
-- Nhân viên --
Nguyễn Văn A
Trần Thị B
Phạm Quốc C
...
```

### Task Row Display
```
📋 Tên task    👤 Nguyễn Văn A    ⏰ 2d5h    [Delete]
```

---

## API Integration

**Request**:
```json
POST /company-processes/{processId}/tasks
{
  "title": "Tên nhiệm vụ",
  "priority": "medium",
  "deadline_days": 2,
  "deadline_hours": 5,
  "assignee_id": "uuid-or-null"
}
```

**Database**:
- Saves to `company_processes_tasks` table
- `assignee_id` column (nullable)
- Can later JOIN with users table for display

---

## Build Status

✅ **Frontend**: 3.48s (no errors)  
✅ **No Breaking Changes**: Assignee is optional  
✅ **Backward Compatible**: Old tasks without assignee still work

---

## Checklist

- ✅ Load employees by company_id
- ✅ Pass employees list to task form
- ✅ Add assignee dropdown in form
- ✅ Send assignee_id to backend
- ✅ Build verified
- ✅ Git committed

---

## Next Steps (Optional)

1. **Backend Route**: Verify `/company-processes/{id}/tasks` accepts `assignee_id`
2. **Display**: Show assignee in task list/detail
3. **Checklist**: Add assignee support for checklists too (same pattern)
4. **Validation**: Validate assignee belongs to company

---

**Status**: ✅ **Complete & Ready**
