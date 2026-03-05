# 🔧 GIẢI PHÁP CUỐI: FLOW + TEMPLATE CRUD

**Date:** 2026-03-05  
**Yêu cầu:** Chọn Template → Hiển thị + CRUD Tasks & Checklist

---

## 🎯 YÊU CẦU CHÍNH XÁC

### **Workflow quản lý Luồng:**

```
Add/Edit Step:
├─ Dropdown 1: Chọn Khối
├─ Dropdown 2: Chọn Công ty
├─ Dropdown 3: Chọn Bộ Mẫu ← Chọn template
│
└─ [Sau khi chọn Template] ← Hiển thị:
   ├─ Danh sách Tasks từ Template
   ├─ Danh sách Checklists từ Template
   └─ CRUD: Thêm/Sửa/Xóa Task & Checklist
```

**Lưu ý quan trọng:**
- ✅ Tasks/Checklists **từ Template** (read from template)
- ✅ Có thể **CRUD** ngay trong Flow (override template)
- ✅ Lưu vào: `flow_step_tasks` (custom per flow)
- ✅ Khi tạo dự án → Dùng flow tasks (không phải template)

---

## 📊 DATABASE SCHEMA

### **Cần bổ sung:**

```sql
-- Tasks riêng cho Flow Step (override template)
CREATE TABLE flow_step_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flow_step_id UUID REFERENCES workflow_flow_steps(id) ON DELETE CASCADE,
  
  -- Link to template task (if based on template)
  template_task_id UUID REFERENCES company_template_tasks(id),
  
  -- Task info (can override template)
  title TEXT NOT NULL,
  description TEXT,
  stage_id UUID REFERENCES workflow_stages(id),
  assignee_field TEXT, -- 'sales_person', 'designer', etc.
  estimated_days INT DEFAULT 1,
  order_index INT DEFAULT 0,
  
  -- Metadata
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Checklists riêng cho Flow Step Task
CREATE TABLE flow_step_task_checklists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flow_step_task_id UUID REFERENCES flow_step_tasks(id) ON DELETE CASCADE,
  
  -- Link to template checklist (if based on template)
  template_checklist_id UUID REFERENCES company_template_checklists(id),
  
  -- Checklist info
  label TEXT NOT NULL,
  order_index INT DEFAULT 0,
  is_required BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_flow_step_tasks_step ON flow_step_tasks(flow_step_id);
CREATE INDEX idx_flow_step_tasks_stage ON flow_step_tasks(stage_id);
CREATE INDEX idx_flow_step_task_checklists_task ON flow_step_task_checklists(flow_step_task_id);
```

**Migration file:** `backend/migrations/21_flow_step_tasks.sql`

---

## 🎨 UI/UX DESIGN

### **WorkflowFlowsPage - Edit Step Modal:**

```
┌────────────────────────────────────────────────────────┐
│ ✏️ Chỉnh Sửa Bước #1                                  │
├────────────────────────────────────────────────────────┤
│                                                        │
│ ① Khối:     [Khối Miền Nam ▼]                        │
│ ② Công ty:  [Công ty A ▼]                            │
│ ③ Bộ Mẫu:   [Tủ bếp cơ bản ▼] (32 tasks)            │
│                                                        │
│ ─────────────────────────────────────────────────────│
│                                                        │
│ 📋 NHIỆM VỤ (Tasks)                                   │
│                                                        │
│ [+ Thêm từ Template]  [+ Tạo task mới]               │
│                                                        │
│ ┌─ Task 1 ──────────────────────────── [🗑️] [✏️]    │
│ │  ✓ Khảo sát nhu cầu                               │
│ │  Assignee: sales | 3 ngày                         │
│ │                                                    │
│ │  Checklist:                                        │
│ │  ☐ Điền form khảo sát                             │
│ │  ☐ Chụp ảnh hiện trường                           │
│ │  [+ Thêm checklist]                               │
│ └──────────────────────────────────────────────────│
│                                                        │
│ ┌─ Task 2 ──────────────────────────── [🗑️] [✏️]    │
│ │  ✓ Báo giá sơ bộ                                  │
│ │  Assignee: sales | 2 ngày                         │
│ │                                                    │
│ │  Checklist:                                        │
│ │  ☐ Tính toán vật tư                               │
│ │  ☐ Gửi email báo giá                              │
│ │  [+ Thêm checklist]                               │
│ └──────────────────────────────────────────────────│
│                                                        │
│ [Đóng]  [💾 Lưu Tất Cả]                             │
└────────────────────────────────────────────────────────┘
```

---

## 🔄 WORKFLOW LOGIC

### **A. Khi chọn Template:**

```javascript
// Frontend: WorkflowFlowsPage.jsx
const handleTemplateSelect = async (templateSetId) => {
  setSelectedTemplate(templateSetId);
  
  // Load template tasks
  const { data } = await api.get(`/company-templates/template-sets/${templateSetId}/tasks`);
  
  setTemplateTasks(data.tasks); // Show template tasks
  
  // Check if flow step already has custom tasks
  const { data: flowTasks } = await api.get(`/flow-steps/${flowStepId}/tasks`);
  
  if (flowTasks.length > 0) {
    // Use flow custom tasks
    setStepTasks(flowTasks);
  } else {
    // Copy from template (not saved yet)
    setStepTasks(data.tasks.map(t => ({
      ...t,
      template_task_id: t.id,
      id: null, // Not saved yet
    })));
  }
};
```

---

### **B. CRUD Operations:**

#### **1. Thêm Task từ Template:**

```javascript
const addTaskFromTemplate = (templateTask) => {
  const newTask = {
    flow_step_id: currentFlowStep.id,
    template_task_id: templateTask.id,
    title: templateTask.title,
    description: templateTask.description,
    stage_id: templateTask.stage_id,
    assignee_field: templateTask.assignee_field,
    estimated_days: templateTask.estimated_days,
    order_index: stepTasks.length + 1,
  };
  
  setStepTasks([...stepTasks, newTask]);
};
```

#### **2. Tạo Task mới (không từ template):**

```javascript
const createCustomTask = () => {
  const newTask = {
    flow_step_id: currentFlowStep.id,
    template_task_id: null, // Custom task
    title: 'Task mới',
    description: '',
    assignee_field: 'sales_person',
    estimated_days: 1,
    order_index: stepTasks.length + 1,
  };
  
  setStepTasks([...stepTasks, newTask]);
};
```

#### **3. Sửa Task:**

```javascript
const updateTask = (taskId, updates) => {
  setStepTasks(tasks => 
    tasks.map(t => t.id === taskId ? { ...t, ...updates } : t)
  );
};
```

#### **4. Xóa Task:**

```javascript
const deleteTask = async (taskId) => {
  if (!confirm('Xóa task này?')) return;
  
  // If task has id (saved), delete from DB
  if (taskId) {
    await api.delete(`/flow-steps/tasks/${taskId}`);
  }
  
  setStepTasks(tasks => tasks.filter(t => t.id !== taskId));
};
```

#### **5. Thêm Checklist:**

```javascript
const addChecklist = (taskId) => {
  const newChecklist = {
    flow_step_task_id: taskId,
    label: 'Checklist mới',
    order_index: task.checklists.length + 1,
    is_required: false,
  };
  
  setStepTasks(tasks => 
    tasks.map(t => 
      t.id === taskId 
        ? { ...t, checklists: [...t.checklists, newChecklist] }
        : t
    )
  );
};
```

#### **6. Lưu tất cả:**

```javascript
const saveAllTasks = async () => {
  try {
    // Save/update tasks
    for (const task of stepTasks) {
      if (task.id) {
        // Update existing
        await api.put(`/flow-steps/tasks/${task.id}`, task);
      } else {
        // Create new
        const { data } = await api.post('/flow-steps/tasks', task);
        task.id = data.task.id;
      }
      
      // Save checklists
      for (const checklist of task.checklists) {
        if (checklist.id) {
          await api.put(`/flow-steps/tasks/${task.id}/checklists/${checklist.id}`, checklist);
        } else {
          await api.post(`/flow-steps/tasks/${task.id}/checklists`, checklist);
        }
      }
    }
    
    alert('✅ Lưu thành công!');
  } catch (error) {
    alert('❌ Lỗi: ' + error.message);
  }
};
```

---

## 🔌 BACKEND API

### **Endpoints cần thêm:**

```javascript
// backend/routes/flows.js

// ─── Get flow step tasks ───
r.get('/steps/:stepId/tasks', async (req, res) => {
  const { data: tasks } = await supabase
    .from('flow_step_tasks')
    .select(`
      *,
      stage:workflow_stages(id,name,slug,icon),
      checklists:flow_step_task_checklists(*)
    `)
    .eq('flow_step_id', req.params.stepId)
    .eq('is_active', true)
    .order('order_index');
  
  res.json({ tasks });
});

// ─── Create flow step task ───
r.post('/steps/tasks', async (req, res) => {
  const { flow_step_id, title, ...rest } = req.body;
  
  const { data: task } = await supabase
    .from('flow_step_tasks')
    .insert({ flow_step_id, title, ...rest })
    .select()
    .single();
  
  res.json({ task });
});

// ─── Update flow step task ───
r.put('/steps/tasks/:taskId', async (req, res) => {
  const { data: task } = await supabase
    .from('flow_step_tasks')
    .update(req.body)
    .eq('id', req.params.taskId)
    .select()
    .single();
  
  res.json({ task });
});

// ─── Delete flow step task ───
r.delete('/steps/tasks/:taskId', async (req, res) => {
  await supabase
    .from('flow_step_tasks')
    .delete()
    .eq('id', req.params.taskId);
  
  res.json({ success: true });
});

// ─── Checklist CRUD (similar) ───
r.post('/steps/tasks/:taskId/checklists', async (req, res) => {
  const { label, order_index, is_required } = req.body;
  
  const { data: checklist } = await supabase
    .from('flow_step_task_checklists')
    .insert({
      flow_step_task_id: req.params.taskId,
      label,
      order_index,
      is_required,
    })
    .select()
    .single();
  
  res.json({ checklist });
});

r.put('/steps/tasks/:taskId/checklists/:checklistId', async (req, res) => {
  const { data: checklist } = await supabase
    .from('flow_step_task_checklists')
    .update(req.body)
    .eq('id', req.params.checklistId)
    .select()
    .single();
  
  res.json({ checklist });
});

r.delete('/steps/tasks/:taskId/checklists/:checklistId', async (req, res) => {
  await supabase
    .from('flow_step_task_checklists')
    .delete()
    .eq('id', req.params.checklistId);
  
  res.json({ success: true });
});
```

---

## 💾 TẠO DỰ ÁN VỚI FLOW

### **Backend logic update:**

```javascript
// POST /projects/create-with-flow
r.post('/create-with-flow', async (req, res) => {
  const { flow_id, name, customer_id, ...rest } = req.body;
  
  // 1. Get flow with steps
  const { data: flow } = await supabase
    .from('workflow_flows')
    .select(`
      *,
      steps:workflow_flow_steps(
        *,
        tasks:flow_step_tasks( ← Use flow tasks, not template!
          *,
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
  
  // 3. Generate tasks from FLOW (not template)
  for (const step of flow.steps) {
    for (const flowTask of step.tasks) {
      // Create project task
      const { data: projectTask } = await supabase
        .from('tasks')
        .insert({
          project_id: project.id,
          title: flowTask.title,
          description: flowTask.description,
          stage_id: flowTask.stage_id,
          assignee_field: flowTask.assignee_field,
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
        });
      }
    }
  }
  
  res.json({ 
    success: true, 
    project,
    message: `Đã tạo dự án với ${totalTasks} tasks`
  });
});
```

---

## 🎨 FRONTEND COMPONENT

### **FlowStepTaskManager.jsx:**

```jsx
import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Plus, Edit, Trash2, Check, X } from 'lucide-react';

export default function FlowStepTaskManager({ flowStep, templateSetId }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingTask, setEditingTask] = useState(null);

  // Load tasks (from flow or template)
  useEffect(() => {
    loadTasks();
  }, [flowStep.id, templateSetId]);

  const loadTasks = async () => {
    setLoading(true);
    try {
      // Try to load flow tasks first
      const { data: flowTasks } = await api.get(`/flows/steps/${flowStep.id}/tasks`);
      
      if (flowTasks.length > 0) {
        setTasks(flowTasks);
      } else if (templateSetId) {
        // Load from template (as starter)
        const { data: templateTasks } = await api.get(`/company-templates/template-sets/${templateSetId}/tasks`);
        setTasks(templateTasks.map(t => ({
          ...t,
          template_task_id: t.id,
          id: null, // Not saved yet
        })));
      }
    } catch (error) {
      console.error('Load tasks error:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveTask = async (task) => {
    try {
      if (task.id) {
        // Update
        await api.put(`/flows/steps/tasks/${task.id}`, task);
      } else {
        // Create
        const { data } = await api.post('/flows/steps/tasks', {
          ...task,
          flow_step_id: flowStep.id,
        });
        task.id = data.task.id;
      }
      
      // Save checklists
      for (const checklist of task.checklists || []) {
        if (checklist.id) {
          await api.put(`/flows/steps/tasks/${task.id}/checklists/${checklist.id}`, checklist);
        } else {
          await api.post(`/flows/steps/tasks/${task.id}/checklists`, checklist);
        }
      }
      
      loadTasks();
      setEditingTask(null);
    } catch (error) {
      alert('Lỗi: ' + error.message);
    }
  };

  const deleteTask = async (taskId) => {
    if (!confirm('Xóa task này?')) return;
    try {
      await api.delete(`/flows/steps/tasks/${taskId}`);
      loadTasks();
    } catch (error) {
      alert('Lỗi: ' + error.message);
    }
  };

  const addChecklist = (taskIndex) => {
    const newTasks = [...tasks];
    if (!newTasks[taskIndex].checklists) {
      newTasks[taskIndex].checklists = [];
    }
    newTasks[taskIndex].checklists.push({
      label: 'Checklist mới',
      order_index: newTasks[taskIndex].checklists.length + 1,
      is_required: false,
    });
    setTasks(newTasks);
  };

  if (loading) return <div>Đang tải...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold">📋 Nhiệm Vụ ({tasks.length})</h3>
        <button
          onClick={() => setEditingTask({ title: '', assignee_field: 'sales_person', estimated_days: 1 })}
          className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm flex items-center gap-1"
        >
          <Plus className="w-4 h-4" /> Tạo task mới
        </button>
      </div>

      {tasks.map((task, idx) => (
        <div key={task.id || idx} className="p-4 bg-gray-50 rounded-lg border">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h4 className="font-semibold text-gray-900">{task.title}</h4>
              <p className="text-sm text-gray-600">
                Assignee: {task.assignee_field} | {task.estimated_days} ngày
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setEditingTask(task)}
                className="p-1.5 text-blue-600 hover:bg-blue-100 rounded"
              >
                <Edit className="w-4 h-4" />
              </button>
              <button
                onClick={() => deleteTask(task.id)}
                className="p-1.5 text-red-600 hover:bg-red-100 rounded"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Checklists */}
          {task.checklists && task.checklists.length > 0 && (
            <div className="mt-3 pl-4 space-y-1">
              <div className="text-xs font-semibold text-gray-700 mb-1">Checklist:</div>
              {task.checklists.map((checklist, cIdx) => (
                <div key={checklist.id || cIdx} className="flex items-center gap-2 text-sm">
                  <Check className="w-3 h-3 text-gray-400" />
                  <span>{checklist.label}</span>
                  {checklist.is_required && <span className="text-red-500">*</span>}
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => addChecklist(idx)}
            className="mt-2 text-xs text-blue-600 hover:underline"
          >
            + Thêm checklist
          </button>
        </div>
      ))}

      {/* Edit Modal */}
      {editingTask && (
        <TaskEditModal
          task={editingTask}
          onSave={saveTask}
          onCancel={() => setEditingTask(null)}
        />
      )}
    </div>
  );
}

// TaskEditModal component (simplified)
function TaskEditModal({ task, onSave, onCancel }) {
  const [form, setForm] = useState(task);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl p-6 max-w-md w-full">
        <h3 className="text-lg font-bold mb-4">
          {task.id ? 'Sửa Task' : 'Tạo Task Mới'}
        </h3>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Tên task</label>
            <input
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Assignee</label>
            <select
              value={form.assignee_field}
              onChange={e => setForm({ ...form, assignee_field: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg"
            >
              <option value="sales_person">Sales</option>
              <option value="designer">Designer</option>
              <option value="production_manager">Production Manager</option>
              <option value="installer">Installer</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Estimated days</label>
            <input
              type="number"
              value={form.estimated_days}
              onChange={e => setForm({ ...form, estimated_days: parseInt(e.target.value) })}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={() => onSave(form)}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg"
          >
            Lưu
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 border rounded-lg"
          >
            Hủy
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## 📋 IMPLEMENTATION CHECKLIST

### **Phase 1: Database (0.5 day)**
- [ ] Create migration `21_flow_step_tasks.sql`
- [ ] Add tables: `flow_step_tasks`, `flow_step_task_checklists`
- [ ] Run migration on Supabase
- [ ] Verify tables created

### **Phase 2: Backend API (1 day)**
- [ ] Add endpoints: CRUD tasks
- [ ] Add endpoints: CRUD checklists
- [ ] Update `/projects/create-with-flow` (use flow tasks)
- [ ] Test with Postman

### **Phase 3: Frontend Component (1 day)**
- [ ] Create `FlowStepTaskManager.jsx`
- [ ] Integrate into `WorkflowFlowsPage.jsx`
- [ ] Add Task Edit Modal
- [ ] Add Checklist UI

### **Phase 4: Testing (0.5 day)**
- [ ] Create flow with template
- [ ] Add/edit/delete tasks
- [ ] Add checklists
- [ ] Create project from flow
- [ ] Verify tasks generated

**Total: 3 days**

---

## 🎉 FINAL RESULT

### **User Experience:**

```
1. Quản lý Luồng:
   ├─ Chọn Khối, Công ty, Template
   ├─ Hiện tasks từ template
   ├─ CRUD tasks & checklists
   └─ Lưu vào flow

2. Tạo Dự Án:
   ├─ Chọn Flow
   ├─ Hiện flow steps + tasks
   ├─ Bấm "Tạo Dự Án"
   └─ Auto-gen 50 tasks với checklists ✅
```

**Timeline: 3 days**  
**Ready to code!** 🚀

---

Bạn có muốn tôi:
1. ✅ Tạo migration SQL ngay?
2. ✅ Code Backend API?
3. ✅ Code Frontend component?

Cho tôi biết! 🔥
