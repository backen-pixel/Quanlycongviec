# Implementation Plan - Template Set & Employee Assignment

## Problems to Solve

### 1. EmployeePicker z-index ✅ DONE
- Dropdown bị chìm dưới các thẻ khác
- **Fix**: Change z-index from 40/50 to 9998/9999

### 2. CreateProject - Template Set Features
**Current**: Chỉ hiển thị tasks từ template, không cho phép edit/add
**Need**: 
- Thêm nhiệm vụ vào quy trình hiện có (không tạo quy trình mới)
- Gán nhân viên cho tasks/checklists với EmployeePicker
- Lọc nhân viên theo công ty + phòng ban

### 3. Template vs Process Conflict
**Problem**: 
- WorkflowFlowsPage dùng `company_processes` (nội bộ)
- CreateProject dùng `company_template_tasks` (mẫu)
- User muốn: Template Set → có quy trình (stages) + nhiệm vụ

**Solution**: 
- Template tasks already have `stage_id` → grouped by workflow_stages
- Khi tạo dự án: load template → gen tasks → allow edit before creating project
- Khi tạo luồng: chọn template → COPY tasks into flow_step_tasks (editable)

### 4. WorkflowFlowsPage - Template Integration
**Current**: Chọn template_set_id nhưng load từ company_processes
**Need**: Khi chọn Template → hiển thị quy trình + nhiệm vụ từ Template

## Implementation Steps

### Step 1: Fix EmployeePicker z-index ✅
- Change backdrop z-40 → z-[9998]
- Change dropdown z-50 → z-[9999]

### Step 2: CreateProject - Add Task Feature
```jsx
// Add "Thêm nhiệm vụ" button in each stage group
// Modal/inline form to add task to existing stage
// Save to selectedTemplateTasks state (frontend only until project created)
```

### Step 3: CreateProject - Employee Assignment
```jsx
// Replace all assignee <select> with <EmployeePicker>
// Locations:
//   - Task assignee (in task list)
//   - Checklist assignee (in checklist accordion)
// Pass step.company_unit_id as companyUnitId prop
```

### Step 4: WorkflowFlowsPage - Show Template Tasks
```jsx
// When template_set_id selected:
//   - Load /company-templates/template-sets/:id/tasks
//   - Display grouped by stage (like CreateProject)
//   - Allow editing via FlowProcessTaskEditor
//   - Save to flow_step_tasks (not company_processes)
```

### Step 5: Backend - Add Task Endpoint
```js
// POST /company-templates/template-sets/:id/tasks
// { stage_id, title, description, order_index, ... }
// Returns created task
```

## Files to Modify

### Frontend
- [x] `components/EmployeePicker.jsx` - z-index fix
- [ ] `pages/CreateProject.jsx` - add task feature, EmployeePicker integration
- [ ] `pages/WorkflowFlowsPage.jsx` - template task display
- [ ] `components/FlowProcessTaskEditor.jsx` - integrate with templates

### Backend
- [ ] `routes/companyTemplates.js` - add POST /template-sets/:id/tasks endpoint
- [ ] (optional) `routes/companyTemplates.js` - add task validation

## Testing Checklist
- [ ] EmployeePicker dropdown appears on top of modals
- [ ] CreateProject: add task to template stage
- [ ] CreateProject: assign employee to task using EmployeePicker
- [ ] CreateProject: assign employee to checklist item
- [ ] WorkflowFlowsPage: template selection shows tasks grouped by stage
- [ ] Project creation includes newly added tasks
- [ ] Employee filtering by department works
