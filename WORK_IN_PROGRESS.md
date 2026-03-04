# 🚧 Work In Progress: Template Sets + Flow Integration

**Date**: 2026-03-04  
**Status**: 📝 In Progress

---

## ✅ Completed (Step 1 & 2)

### 1. Assignee for CompanyProcessesPage
- ✅ Load employees by company_id
- ✅ Dropdown assignee when adding task
- ✅ Send assignee_id to backend
- **Commit**: `4414b44`

### 2. Template Sets Management UI
- ✅ Created `/template-sets` page
- ✅ List template sets by company
- ✅ Create/Edit/Delete/Set Default
- ✅ Navigate to detail page
- ✅ Added to sidebar
- **Commit**: `d6929d5`

---

## 🚧 To Do (Step 3 - Complex)

### 3.1 Add Assignee to WorkflowFlowsPage
**Challenge**: Flow tasks không thuộc company cụ thể nào
- Option A: Load all users (not ideal)
- Option B: Only when task linked to company process
- **Decision needed**: How to handle assignee in flow-level tasks?

### 3.2 Connect Flows to Template Sets
**Architecture Change Needed**:

Current flow:
```
Flow → Steps → Division (Khối) → Company → Company Processes → Tasks
```

New flow (with template sets):
```
Flow → Steps → Division (Khối) → Company → Template Set → Processes → Tasks
```

**Changes Required**:

1. **Backend (companyTemplates.js)**:
   - ✅ Already has template sets routes
   - ✅ Has tasks for template sets
   - Need: Link flow steps to template_set_id (not just company_unit_id)

2. **Frontend (WorkflowFlowsPage.jsx)**:
   - Add dropdown: Select Template Set (after company selection)
   - Load processes from template set (not from company)
   - Save `template_set_id` with flow step

3. **Database Schema**:
   Current:
   ```sql
   flow_steps:
     - division_unit_id
     - company_unit_id
     - selected_process_ids[]
   ```
   
   Need to add:
   ```sql
   flow_steps:
     - division_unit_id
     - company_unit_id
     - template_set_id  -- NEW!
     - selected_process_ids[]
   ```

---

## 📋 Implementation Plan

### Phase A: Flow → Template Set Link

**File**: `backend/src/routes/flows.js`
1. Accept `template_set_id` in flow step creation
2. When loading flow details, include template_set info
3. Filter processes by template_set_id

**File**: `frontend/src/pages/WorkflowFlowsPage.jsx`
1. After company selection → Load template sets
2. Add dropdown: "Chọn bộ quy trình"
3. After template set selection → Load processes from that set
4. Save template_set_id when creating/updating flow

### Phase B: Assignee in Flow Tasks

**Option 1 (Recommended)**: 
- Flow tasks không có assignee khi tạo
- Chỉ khi gen project từ flow → task mới có assignee (từ company)

**Option 2**:
- Flow step có company → load employees của company đó
- Task trong flow có default_assignee_id

### Phase C: Backend Migration

Need SQL migration:
```sql
ALTER TABLE flow_steps 
ADD COLUMN template_set_id UUID REFERENCES company_template_sets(id);

ALTER TABLE flow_step_processes
ADD COLUMN template_set_id UUID REFERENCES company_template_sets(id);
```

---

## 🎯 Current Blockers

1. **Schema Change**: Need to add `template_set_id` to flow_steps
2. **Complexity**: Flow editing UI needs major refactor
3. **Time**: This is a 2-3 hour task minimum

---

## 💡 Simplified Approach (Alternative)

Instead of linking flow directly to template set:

**Keep current architecture**:
- Flow → Company Processes (as-is)
- Company Processes can belong to multiple Template Sets
- When creating project → Select template set → Gen tasks from that set

**Advantage**:
- No schema change needed
- Less complexity
- Template Sets become "project-time choice" not "flow-time choice"

**Implementation**:
1. ✅ Template Sets page (done)
2. ✅ Company Processes (done)
3. 🚧 Project creation: Add dropdown "Chọn bộ quy trình" → Load tasks from set

---

## 🤔 Decision Point

**Question for user**: 

Bạn muốn:

**Option A** (Complex): Flow kết nối trực tiếp với Template Set
- Khi tạo flow → chọn template set → load processes/tasks
- Cần thay đổi database schema
- Cần refactor flow editor UI

**Option B** (Simple): Template Set chỉ dùng lúc tạo dự án
- Flow vẫn chọn company processes (như hiện tại)
- Khi tạo dự án → chọn template set → load tasks từ set đó
- Không cần thay đổi database
- Ít code hơn

**Tôi recommend Option B** (đơn giản, nhanh, ít bug)

---

**Status**: ⏸️ Paused - Waiting for decision
