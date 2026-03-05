# 🎯 BỔ SUNG: GÁN NHÂN VIÊN CỤ THỂ CHO TASKS

**Date:** 2026-03-05  
**Update:** Thêm khả năng gán nhân viên theo Công ty/Khối

---

## 🆕 YÊU CẦU BỔ SUNG

### **Hiện tại:**
```
Task:
├─ title: "Khảo sát nhu cầu"
├─ assignee_field: "sales_person" ← Chỉ là field!
└─ Khi tạo dự án → Dự án assign sales_person_id

❌ Vấn đề: Không chọn nhân viên cụ thể trong Flow
```

### **Mong muốn:**
```
Task trong Flow:
├─ title: "Khảo sát nhu cầu"
├─ assignee_field: "sales_person" (fallback)
├─ assigned_user_id: "user-123" ← Nhân viên cụ thể!
└─ assigned_user: "Nguyễn Văn A" (Công ty A, Khối MN)

✅ Khi tạo dự án → Task assign trực tiếp cho user-123
```

---

## 📊 DATABASE UPDATE

### **Bổ sung column:**

```sql
-- Update flow_step_tasks table
ALTER TABLE flow_step_tasks
ADD COLUMN assigned_user_id UUID REFERENCES users(id),
ADD COLUMN assigned_company_unit_id UUID REFERENCES ecosystem_units(id);

-- Index
CREATE INDEX idx_flow_step_tasks_assigned_user ON flow_step_tasks(assigned_user_id);

-- Comment
COMMENT ON COLUMN flow_step_tasks.assigned_user_id IS 'Nhân viên được gán cụ thể (optional, override assignee_field)';
COMMENT ON COLUMN flow_step_tasks.assigned_company_unit_id IS 'Công ty của nhân viên (for filtering)';
```

**Migration file:** `backend/migrations/22_flow_task_assign_user.sql`

---

## 🎨 UI/UX DESIGN

### **Task Editor với gán nhân viên:**

```
┌────────────────────────────────────────────────────────┐
│ ✏️ Sửa Task: "Khảo sát nhu cầu"                       │
├────────────────────────────────────────────────────────┤
│                                                        │
│ Tên task:                                              │
│ [Khảo sát nhu cầu khách hàng ................... ]   │
│                                                        │
│ Mô tả:                                                 │
│ [Textarea ..................................... ]   │
│                                                        │
│ ─────────────────────────────────────────────────────│
│                                                        │
│ 👤 NGƯỜI THỰC HIỆN                                    │
│                                                        │
│ Chế độ gán:                                           │
│ ○ Tự động (theo vai trò)                             │
│ ● Chọn nhân viên cụ thể                              │
│                                                        │
│ {Nếu chọn "Tự động"}                                  │
│   Vai trò: [Sales ▼]                                  │
│   → Dự án sẽ tự động gán cho sales_person_id         │
│                                                        │
│ {Nếu chọn "Cụ thể"}                                   │
│   ┌─────────────────────────────────────────┐        │
│   │ Lọc theo:                                │        │
│   │ Công ty: [Công ty A ▼]                  │        │
│   │                                          │        │
│   │ Chọn nhân viên:                          │        │
│   │ ┌─ Nguyễn Văn A ─────────────── ○       │        │
│   │ │  📧 nguyena@tubep.vn                   │        │
│   │ │  📞 0987654321                         │        │
│   │ │  🏢 Công ty A · Khối Miền Nam         │        │
│   │ │  👔 Phòng Tư vấn (Sales)              │        │
│   │ └────────────────────────────────        │        │
│   │                                          │        │
│   │ ┌─ Trần Thị B ─────────────── ○         │        │
│   │ │  📧 tranb@tubep.vn                     │        │
│   │ │  🏢 Công ty A · Khối Miền Nam         │        │
│   │ └────────────────────────────────        │        │
│   │                                          │        │
│   │ [Tìm kiếm nhân viên .............. 🔍]  │        │
│   └─────────────────────────────────────────┘        │
│                                                        │
│ Thời gian ước tính: [3] ngày                          │
│                                                        │
│ ─────────────────────────────────────────────────────│
│                                                        │
│ ✅ CHECKLIST                                          │
│                                                        │
│ ☐ Điền form khảo sát           [Gán: Same as task]   │
│ ☐ Chụp ảnh hiện trường         [Gán: Trần Thị B ▼]   │
│ ☐ Báo cáo cho quản lý          [Gán: Manager ▼]      │
│                                                        │
│ [+ Thêm checklist]                                    │
│                                                        │
│ [Đóng]  [💾 Lưu]                                     │
└────────────────────────────────────────────────────────┘
```

---

## 🔄 WORKFLOW LOGIC

### **A. Load danh sách nhân viên (theo công ty/khối):**

```javascript
// Frontend: FlowStepTaskManager.jsx
const [employees, setEmployees] = useState([]);
const [selectedCompany, setSelectedCompany] = useState(null);

// Load employees when company selected
useEffect(() => {
  if (flowStep.company_unit_id) {
    loadEmployees(flowStep.company_unit_id);
  }
}, [flowStep.company_unit_id]);

const loadEmployees = async (companyUnitId) => {
  try {
    // Get employees in this company (via ecosystem)
    const { data } = await api.get(`/ecosystem/company-users/${companyUnitId}`);
    
    setEmployees(data.users.map(user => ({
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
      role: user.role,
      department: user.department?.name,
      company: user.company?.name,
      division: user.company?.parent?.name,
    })));
  } catch (error) {
    console.error('Load employees error:', error);
  }
};
```

---

### **B. Task Editor với User Selection:**

```jsx
// TaskEditModal.jsx (enhanced)
function TaskEditModal({ task, onSave, onCancel, employees }) {
  const [form, setForm] = useState(task);
  const [assignMode, setAssignMode] = useState(
    task.assigned_user_id ? 'specific' : 'auto'
  );
  const [searchQuery, setSearchQuery] = useState('');

  // Filter employees by search
  const filteredEmployees = employees.filter(emp =>
    emp.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold mb-4">Sửa Task</h3>

        {/* Task info */}
        <div className="space-y-3 mb-6">
          <div>
            <label className="block text-sm font-medium mb-1">Tên task</label>
            <input
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Mô tả</label>
            <textarea
              value={form.description || ''}
              onChange={e => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
        </div>

        {/* Assignment section */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-3">👤 Người thực hiện</label>

          {/* Assignment mode */}
          <div className="flex gap-4 mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="assignMode"
                checked={assignMode === 'auto'}
                onChange={() => setAssignMode('auto')}
                className="text-blue-600"
              />
              <span>Tự động (theo vai trò)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="assignMode"
                checked={assignMode === 'specific'}
                onChange={() => setAssignMode('specific')}
                className="text-blue-600"
              />
              <span>Chọn nhân viên cụ thể</span>
            </label>
          </div>

          {/* Auto assignment */}
          {assignMode === 'auto' && (
            <div>
              <label className="block text-sm font-medium mb-1">Vai trò</label>
              <select
                value={form.assignee_field || 'sales_person'}
                onChange={e => setForm({ 
                  ...form, 
                  assignee_field: e.target.value,
                  assigned_user_id: null // Clear specific assignment
                })}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="sales_person">Sales</option>
                <option value="designer">Designer</option>
                <option value="production_manager">Production Manager</option>
                <option value="installer">Installer</option>
                <option value="project_manager">Project Manager</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Dự án sẽ tự động gán cho người có vai trò này
              </p>
            </div>
          )}

          {/* Specific user assignment */}
          {assignMode === 'specific' && (
            <div>
              <div className="mb-2">
                <input
                  type="text"
                  placeholder="Tìm kiếm nhân viên..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div className="border rounded-lg max-h-64 overflow-y-auto">
                {filteredEmployees.length === 0 ? (
                  <div className="p-4 text-center text-gray-500 text-sm">
                    Không tìm thấy nhân viên
                  </div>
                ) : (
                  filteredEmployees.map(emp => (
                    <label
                      key={emp.id}
                      className={`
                        flex items-start gap-3 p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0
                        ${form.assigned_user_id === emp.id ? 'bg-blue-50' : ''}
                      `}
                    >
                      <input
                        type="radio"
                        name="assigned_user"
                        checked={form.assigned_user_id === emp.id}
                        onChange={() => setForm({ 
                          ...form, 
                          assigned_user_id: emp.id,
                          assignee_field: null // Clear auto assignment
                        })}
                        className="mt-1"
                      />
                      
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900">{emp.full_name}</div>
                        <div className="text-xs text-gray-600 space-y-0.5 mt-1">
                          <div className="flex items-center gap-1">
                            📧 {emp.email}
                          </div>
                          {emp.phone && (
                            <div className="flex items-center gap-1">
                              📞 {emp.phone}
                            </div>
                          )}
                          <div className="flex items-center gap-1">
                            🏢 {emp.company} · {emp.division}
                          </div>
                          {emp.department && (
                            <div className="flex items-center gap-1">
                              👔 {emp.department}
                            </div>
                          )}
                        </div>
                      </div>

                      {emp.avatar && (
                        <img
                          src={emp.avatar}
                          alt={emp.full_name}
                          className="w-10 h-10 rounded-full"
                        />
                      )}
                    </label>
                  ))
                )}
              </div>

              {form.assigned_user_id && (
                <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-sm text-green-800">
                  ✓ Đã chọn: {employees.find(e => e.id === form.assigned_user_id)?.full_name}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Estimated days */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-1">Thời gian ước tính</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={form.estimated_days}
              onChange={e => setForm({ ...form, estimated_days: parseInt(e.target.value) })}
              className="w-24 px-3 py-2 border rounded-lg"
            />
            <span className="text-sm text-gray-600">ngày</span>
          </div>
        </div>

        {/* Checklists */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium">✅ Checklist</label>
            <button
              onClick={() => {
                const newChecklist = {
                  label: 'Checklist mới',
                  is_required: false,
                  assigned_user_id: form.assigned_user_id, // Inherit from task
                };
                setForm({
                  ...form,
                  checklists: [...(form.checklists || []), newChecklist]
                });
              }}
              className="text-sm text-blue-600 hover:underline"
            >
              + Thêm checklist
            </button>
          </div>

          {form.checklists?.map((checklist, idx) => (
            <ChecklistItem
              key={idx}
              checklist={checklist}
              employees={employees}
              onChange={(updated) => {
                const newChecklists = [...form.checklists];
                newChecklists[idx] = updated;
                setForm({ ...form, checklists: newChecklists });
              }}
              onDelete={() => {
                setForm({
                  ...form,
                  checklists: form.checklists.filter((_, i) => i !== idx)
                });
              }}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={() => onSave(form)}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            💾 Lưu
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            Hủy
          </button>
        </div>
      </div>
    </div>
  );
}

// Checklist item component
function ChecklistItem({ checklist, employees, onChange, onDelete }) {
  return (
    <div className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg mb-2">
      <input
        type="checkbox"
        checked={false}
        disabled
        className="mt-1"
      />
      
      <div className="flex-1 space-y-2">
        <input
          type="text"
          value={checklist.label}
          onChange={e => onChange({ ...checklist, label: e.target.value })}
          placeholder="Nội dung checklist..."
          className="w-full px-2 py-1 border rounded text-sm"
        />
        
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={checklist.is_required}
              onChange={e => onChange({ ...checklist, is_required: e.target.checked })}
            />
            Bắt buộc
          </label>
          
          <select
            value={checklist.assigned_user_id || 'same'}
            onChange={e => onChange({ 
              ...checklist, 
              assigned_user_id: e.target.value === 'same' ? null : e.target.value 
            })}
            className="text-xs px-2 py-1 border rounded"
          >
            <option value="same">Cùng người với task</option>
            <option value="">Không gán cụ thể</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>
                {emp.full_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        onClick={onDelete}
        className="p-1 text-red-600 hover:bg-red-100 rounded"
      >
        🗑️
      </button>
    </div>
  );
}
```

---

## 🔌 BACKEND API UPDATE

### **A. Endpoint để lấy nhân viên theo công ty:**

```javascript
// backend/routes/ecosystem.js (already exists)
// GET /ecosystem/company-users/:companyId

r.get('/company-users/:companyId', async (req, res) => {
  try {
    // Get departments of this company
    const { data: depts } = await supabase
      .from('departments')
      .select('id')
      .eq('company_id', req.params.companyId)
      .eq('is_active', true);
    
    const deptIds = (depts || []).map(d => d.id);

    // Get users in these departments
    let users = [];
    if (deptIds.length) {
      const { data } = await supabase
        .from('users')
        .select(`
          id, full_name, email, phone, avatar, role,
          department:departments(id,name,company_id),
          company:companies!departments_company_id_fkey(
            id, name,
            division:ecosystem_units!companies_division_unit_id_fkey(id,name)
          )
        `)
        .in('department_id', deptIds)
        .eq('is_active', true)
        .order('full_name');
      users = data || [];
    }

    res.json({ users, department_ids: deptIds });
  } catch (e) { 
    res.status(500).json({ error: e.message }); 
  }
});
```

---

### **B. Update create project logic:**

```javascript
// POST /projects/create-with-flow
r.post('/create-with-flow', async (req, res) => {
  const { flow_id, name, customer_id, ...rest } = req.body;
  
  // 1. Get flow with steps & tasks & assigned users
  const { data: flow } = await supabase
    .from('workflow_flows')
    .select(`
      *,
      steps:workflow_flow_steps(
        *,
        tasks:flow_step_tasks(
          *,
          assigned_user:users(id,full_name,email),
          checklists:flow_step_task_checklists(*)
        )
      )
    `)
    .eq('id', flow_id)
    .single();
  
  // 2. Create project
  const { data: project } = await supabase
    .from('projects')
    .insert({
      name,
      customer_id,
      flow_id,
      created_by_id: req.user.userId,
      ...rest,
    })
    .select()
    .single();
  
  // 3. Generate tasks
  for (const step of flow.steps) {
    for (const flowTask of step.tasks) {
      // Determine assignee_id
      let assigneeId = null;
      
      if (flowTask.assigned_user_id) {
        // Use specific user
        assigneeId = flowTask.assigned_user_id;
      } else if (flowTask.assignee_field) {
        // Use field from project (e.g., project.sales_person_id)
        assigneeId = project[flowTask.assignee_field + '_id'];
      }
      
      // Create project task
      const { data: projectTask } = await supabase
        .from('tasks')
        .insert({
          project_id: project.id,
          title: flowTask.title,
          description: flowTask.description,
          stage_id: flowTask.stage_id,
          assignee_id: assigneeId, // ← Specific user!
          estimated_days: flowTask.estimated_days,
          order_index: flowTask.order_index,
        })
        .select()
        .single();
      
      // Create checklists
      for (const checklist of flowTask.checklists) {
        await supabase.from('task_checklists').insert({
          task_id: projectTask.id,
          label: checklist.label,
          is_required: checklist.is_required,
          order_index: checklist.order_index,
          assigned_user_id: checklist.assigned_user_id || assigneeId, // Inherit from task
        });
      }
    }
  }
  
  res.json({ 
    success: true, 
    project,
    message: `Đã tạo dự án với ${totalTasks} tasks (gán cụ thể)`
  });
});
```

---

## 📋 UPDATED IMPLEMENTATION CHECKLIST

### **Phase 1: Database (0.5 day)**
- [ ] Create migration `22_flow_task_assign_user.sql`
- [ ] Add columns: `assigned_user_id`, `assigned_company_unit_id`
- [ ] Update `task_checklists` table (add `assigned_user_id`)
- [ ] Run migration

### **Phase 2: Backend API (1 day)**
- [ ] Verify `/ecosystem/company-users/:id` endpoint
- [ ] Update CRUD task endpoints (support assigned_user_id)
- [ ] Update `/projects/create-with-flow` (use assigned users)
- [ ] Test with Postman

### **Phase 3: Frontend (1.5 days)**
- [ ] Create enhanced `TaskEditModal` (user selection)
- [ ] Add `EmployeeList` component
- [ ] Add `ChecklistItem` with user assignment
- [ ] Load employees by company
- [ ] Integrate into `FlowStepTaskManager`

### **Phase 4: Testing (0.5 day)**
- [ ] Create flow with assigned users
- [ ] Test user filtering by company
- [ ] Test checklist assignment
- [ ] Create project → Verify correct assignments

**Total: 3.5 days**

---

## 📊 BEFORE/AFTER

### **BEFORE (Chỉ có assignee_field):**
```
Flow Task:
├─ title: "Khảo sát"
└─ assignee_field: "sales_person"

Khi tạo dự án:
└─ Gán cho: project.sales_person_id (ai được chọn lúc tạo DA)

❌ Vấn đề: Không biết trước ai làm
```

### **AFTER (Có assigned_user_id):**
```
Flow Task:
├─ title: "Khảo sát"
├─ assigned_user_id: "user-123"
└─ assigned_user: "Nguyễn Văn A"

Khi tạo dự án:
└─ Gán cho: user-123 (Nguyễn Văn A) ✅

✅ Lợi ích: 
   - Biết trước ai làm
   - Load balancing
   - Chuyên môn hóa
```

---

## 🎯 USE CASES

### **1. Chuyên môn hóa:**
```
Task "Thiết kế 3D":
└─ Gán cho: Trần Thị B (Designer chuyên 3D)

Task "Thiết kế kỹ thuật":
└─ Gán cho: Lê Văn C (Designer kỹ thuật)
```

### **2. Load balancing:**
```
Công ty A có 3 sales:
├─ Sales A: 5 dự án (overload)
├─ Sales B: 2 dự án
└─ Sales C: 1 dự án

→ Gán task cho Sales C (ít việc nhất)
```

### **3. Handoff giữa công ty:**
```
Step 1: Công ty A → Gán cho: Nguyễn Văn A (Sales, Cty A)
Step 2: Công ty B → Gán cho: Hoàng Thị D (Designer, Cty B)
```

---

## 🚀 READY TO IMPLEMENT

**Timeline: 3.5 days**

Bạn có muốn tôi:
1. ✅ Tạo migration SQL?
2. ✅ Code Backend API?
3. ✅ Code Frontend components?
4. ✅ Code tất cả luôn?

File này: `FLOW_TASK_USER_ASSIGNMENT.md`  
Ready! 🔥
