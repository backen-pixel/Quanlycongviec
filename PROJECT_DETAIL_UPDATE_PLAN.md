# 📋 ProjectDetail Update Plan - Sync với Template Sets System

**Date**: 2026-03-04  
**Purpose**: Đồng bộ ProjectDetail.jsx với hệ thống Template Sets mới

---

## 🎯 MỤC TIÊU

Cập nhật view chi tiết dự án để:
1. ✅ Hiển thị template set đã chọn
2. ✅ Hiển thị assignee cho tasks/checklists
3. ✅ Filter employees theo company khi assign
4. ✅ Sync với workflow flow-based structure
5. ✅ Cập nhật logic duyệt (approval)
6. ✅ Tổng hợp files theo template sets

---

## 📊 CURRENT STATE (ProjectDetail.jsx)

### Architecture Hiện Tại:
```
Project
├─ Status: consulting → design → quotation → ...
├─ Workflow Lines (legacy):
│  ├─ consulting_person
│  ├─ design_person
│  └─ ...
├─ Tasks (flat list, no template sets)
└─ Comments/Files/Approvals
```

### Issues:
❌ Không hiển thị template set
❌ Tasks không group theo template
❌ Không có assignee rõ ràng
❌ Workflow lines cũ (person-based, not company-based)
❌ Approval không theo template structure

---

## 🆕 NEW ARCHITECTURE (Needed)

### New Structure:
```
Project
├─ Flow: {flow_name}
├─ Flow Assignments:
│  ├─ Step 1: Division → Company → Template Set
│  │  ├─ Template: "Mẫu Kinh Doanh Chuẩn"
│  │  ├─ Tasks (from template):
│  │  │  ├─ Task 1 (Assignee: User A)
│  │  │  └─ Task 2 (Assignee: User B)
│  │  └─ Progress: 2/5 tasks done
│  ├─ Step 2: Division → Company → Template Set
│  └─ ...
├─ Status: Based on flow progress
└─ Approvals: Based on template rules
```

---

## 📝 CHANGES NEEDED

### 1. Load Flow & Template Data

**Current**:
```javascript
api.get(`/projects/${id}`)
```

**Add**:
```javascript
// Load flow structure
const flow = project.flow;
const flowAssignments = project.flow_assignments || [];

// For each assignment, load template set info
flowAssignments.forEach(async assignment => {
  const templateSet = await api.get(`/company-templates/template-sets/${assignment.template_set_id}`);
  // Store template set info
});
```

### 2. Display Template Sets in UI

**Add Section**:
```jsx
<div className="bg-blue-50 rounded-lg p-4">
  <h4>Bộ Quy Trình Đang Dùng</h4>
  {flowAssignments.map(assignment => (
    <div key={assignment.id}>
      <p>{assignment.company.name}</p>
      <p>Template: {assignment.template_set?.name}</p>
      <p>Tasks: {assignment.tasks_completed} / {assignment.tasks_total}</p>
    </div>
  ))}
</div>
```

### 3. Group Tasks by Template/Company

**Current**: Flat task list
```jsx
<div>
  {tasks.map(task => <TaskCard />)}
</div>
```

**New**: Grouped by flow step
```jsx
{flowAssignments.map(assignment => (
  <div key={assignment.id}>
    <h3>{assignment.company.name} - {assignment.template_set.name}</h3>
    {assignment.tasks.map(task => (
      <TaskCard 
        task={task} 
        assignee={task.assignee}
        checklists={task.checklists}
      />
    ))}
  </div>
))}
```

### 4. Show Assignee Info

**Add to TaskCard**:
```jsx
<div className="task-assignee">
  👤 {task.assignee?.full_name || 'Chưa gán'}
</div>

{task.checklists?.map(check => (
  <div>
    ☑️ {check.name}
    👤 {check.assignee?.full_name}
  </div>
))}
```

### 5. Update Task Assignment Logic

**When Assigning**:
```javascript
// Filter employees by company of current flow step
const companyId = task.flow_assignment.company_unit_id;
const employees = await api.get(`/users?company_id=${companyId}`);

// Show dropdown with filtered employees
<UserSelect 
  users={employees} 
  value={task.assignee_id}
  onChange={assigneeId => updateTask(task.id, { assignee_id: assigneeId })}
/>
```

### 6. Update Approval Logic

**Current**: Stage-based approval
**New**: Template-based approval

```javascript
// Check if template set has approval rules
const templateSet = assignment.template_set;
if (templateSet.requires_approval) {
  // Show approval UI
  // Check approval_rules table for this template
}
```

### 7. File Upload per Template

**Add**:
```javascript
// Files organized by template set
<div>
  <h4>Files - {templateSet.name}</h4>
  <FileList files={assignment.files} />
  <FileUploadButton 
    onUpload={files => uploadToAssignment(assignment.id, files)}
  />
</div>
```

---

## 🗂️ FILE STRUCTURE

### Files to Update:

1. **ProjectDetail.jsx** (main file)
   - Add flow/template display
   - Update task grouping
   - Add assignee display

2. **TaskDetailModal.jsx**
   - Show assignee
   - Show checklist assignees
   - Filter employees by company

3. **TaskCreateModal.jsx**
   - Pre-select template set
   - Filter employees by company
   - Set default assignee

4. **ProjectFlowTab.jsx** (already exists)
   - May need updates for template sets
   - Show template set progress

---

## 📊 DATABASE QUERIES NEEDED

### Main Project Query:
```sql
SELECT 
  projects.*,
  flow:workflow_flows(id, name),
  flow_assignments:project_company_assignments(
    *,
    company:ecosystem_units(id, name),
    template_set:company_template_sets(id, name),
    tasks:project_tasks(
      *,
      assignee:users(id, full_name),
      checklists:project_checklists(
        *,
        assignee:users(id, full_name)
      )
    )
  )
FROM projects
WHERE id = $1
```

---

## ⏱️ ESTIMATION

### Time Required:
- **Research & Planning**: 1 hour (DONE - this document)
- **Backend API updates**: 1-2 hours
  - Update /projects/:id to include flow_assignments with template data
  - Update task queries to include assignees
- **Frontend ProjectDetail update**: 2-3 hours
  - Redesign layout with template sections
  - Add assignee display
  - Update task grouping
- **Testing**: 1 hour
- **Total**: 5-7 hours

### Complexity: 🔴 High
- Many interconnected components
- Backward compatibility needed
- Complex data structure

---

## 🎯 ALTERNATIVE: MINIMAL UPDATE

If full redesign is too much, minimal changes:

### Option A: Just Show Info (1 hour)
- Add "Template Set" label in project header
- Show assignee name in task card
- No major restructuring

### Option B: Incremental (2-3 hours)
- Keep current layout
- Add template set info sidebar
- Show assignee inline with tasks
- Update assign dropdown to filter by company

### Option C: Full Redesign (5-7 hours)
- Complete restructure as described above
- Fully template-based UI
- All features integrated

---

## 🤔 DECISION POINT

**Question for user**: 

Bạn muốn:

**A. Minimal Update** (1 hour)
- Just show template name & assignee
- Keep current layout

**B. Incremental** (2-3 hours)
- Add template sections
- Better assignee display
- Company-filtered employees

**C. Full Redesign** (5-7 hours)
- Complete template-based UI
- All new features fully integrated
- Best UX but most work

**My Recommendation**: **Option B** (Incremental)
- Good balance of features vs time
- Users get key benefits
- Can upgrade to C later if needed

---

## 📋 CHECKLIST (For Implementation)

### Backend:
- [ ] Update GET /projects/:id with flow_assignments
- [ ] Include template_set data in response
- [ ] Include assignee data for tasks/checklists
- [ ] Add endpoint to update assignee

### Frontend:
- [ ] Display template set name in project header
- [ ] Show assignee in task cards (inline)
- [ ] Show checklist assignee
- [ ] Filter employees by company in assign dropdown
- [ ] Update TaskDetailModal to show assignees
- [ ] Add template progress indicators

### Testing:
- [ ] Create project with template sets
- [ ] Assign employees to tasks
- [ ] Verify employees filtered by company
- [ ] Test checklist assignee
- [ ] Verify approval flow

---

**Status**: 📝 Planning Complete - Waiting for Decision

**Next**: User chooses option A/B/C, then we implement
