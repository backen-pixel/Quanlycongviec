# 2026-03-06 - Employee Assignment & Template Task Management

## Issues Fixed

### 1. EmployeePicker Z-Index Issue ✅
**Problem**: Dropdown bị chìm dưới các modal/cards khác

**Solution**:
- Changed backdrop z-index: `z-40` → `z-[9998]`
- Changed dropdown z-index: `z-50` → `z-[9999]`
- File: `frontend/src/components/EmployeePicker.jsx`

### 2. Add Tasks to Template Set in CreateProject ✅
**Problem**: Không thể thêm nhiệm vụ vào quy trình khi tạo dự án

**Solution**:
- Added states: `addedTasks`, `showAddTask`, `newTask`
- Added handlers: `handleAddTaskClick`, `handleSaveNewTask`, `handleCancelAddTask`, `handleDeleteAddedTask`
- Added inline form in each stage group with "+ Thêm" button
- New tasks displayed with blue border + "MỚI" badge
- Can delete newly added tasks before project creation
- File: `frontend/src/pages/CreateProject.jsx`

### 3. Backend Support for Added Tasks ✅
**Problem**: Backend không xử lý tasks được thêm mới từ frontend

**Solution**:
- Added `added_tasks` array to payload (frontend sends temp tasks with `_temp_id`)
- Backend inserts `added_tasks` into `company_template_tasks` before generating project tasks
- Created `tempIdToRealIdMap` to map temp IDs → real task IDs
- Updated assignment lookup to check temp IDs for newly added tasks
- File: `backend/src/routes/projects.js`

## User Flow

### Create Project with Custom Tasks
1. User selects Flow → Company → Template Set
2. System displays tasks grouped by stage (workflow process)
3. User clicks "+ Thêm" button on any stage header
4. Inline form appears (blue background)
5. User enters task title + description
6. Click "Lưu" or press Enter → task added to list (blue border, "MỚI" badge)
7. User can assign employee to new task using EmployeePicker
8. User can delete new task with X button
9. When user submits project → backend:
   - Inserts new tasks into `company_template_tasks` table
   - Generates project tasks from full template (including new tasks)
   - Applies employee assignments (including for new tasks)

## Technical Details

### Frontend State Management
```javascript
const [addedTasks, setAddedTasks] = useState({}); 
// Structure: { "templateSetId_stageId": [{ _temp_id, title, description, order_index, stage }] }

const [showAddTask, setShowAddTask] = useState(null);
// Structure: { templateSetId, stageId, stageName } or null

const [newTask, setNewTask] = useState({ title: '', description: '' });
```

### Payload Structure
```javascript
{
  // ... other project fields
  added_tasks: [
    {
      template_set_id: "uuid",
      stage_id: "uuid",
      title: "Task title",
      description: "Task description",
      order_index: 9999,
      _temp_id: "temp_123456"
    }
  ],
  task_assignments: {
    "temp_123456": "user_uuid", // Assignment for newly added task
    "real_task_uuid": "user_uuid" // Assignment for template task
  }
}
```

### Backend Flow
1. Insert `added_tasks` into `company_template_tasks`
2. Build `tempIdToRealIdMap` (temp_id → real task.id)
3. Load template tasks (now includes newly added tasks)
4. For each task:
   - Check assignment with task.id
   - If not found, reverse lookup in tempIdToRealIdMap
   - Use mapped temp_id to find assignment
5. Create project tasks with correct assignees

## Files Modified
- `frontend/src/components/EmployeePicker.jsx` - z-index fix
- `frontend/src/pages/CreateProject.jsx` - add task UI + state management
- `backend/src/routes/projects.js` - handle added_tasks in create-with-flow

## Next Steps (Not Implemented Yet)
- [ ] WorkflowFlowsPage - show template tasks when template_set_id selected
- [ ] ProjectDetail.jsx - integrate EmployeePicker for task assignment editing
- [ ] Template Set management page - dedicated CRUD for template tasks
- [ ] Validation: prevent duplicate task titles within same stage
- [ ] Bulk import tasks from CSV/Excel
