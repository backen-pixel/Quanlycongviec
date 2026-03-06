# Phase 4 Complete: EmployeePicker Integration - 2026-03-06

## ✅ All Task/Checklist Assignment Locations Updated

### Files Using EmployeePicker:

1. **✅ CreateProject.jsx**
   - Task assignee (inline in task list)
   - Checklist assignee (in accordion)
   - Company filter: `step.company_unit_id`

2. **✅ ProjectDetail.jsx**
   - TaskRow: task assignee
   - ChecklistItem: checklist assignee
   - Company filter: `companyUnitId` from project assignments

3. **✅ FlowProcessTaskEditor.jsx** (in WorkflowFlowsPage)
   - Process task assignee
   - Company filter: `companyUnitId` prop

4. **✅ TemplateSetDetailPage.jsx** (NEW in this commit)
   - AddTaskForm: new task assignee
   - TaskCard (edit mode): task assignee
   - ChecklistItem (edit mode): checklist assignee
   - Company filter: `set.unit_id`

## Component Props Pattern

All EmployeePicker instances follow this pattern:
```jsx
<EmployeePicker
  companyUnitId={companyUnitId}  // ecosystem_units.id
  value={userId}                  // current assigned user id
  onChange={(userId) => ...}      // callback with new user id
  placeholder="+ Gán" or "-- Chọn --"
  size="sm"                       // or "md"
/>
```

## Features
- Auto-detect dropdown position (top/bottom)
- Disabled when no `companyUnitId` (shows "Chọn công ty trước")
- Department filter (default: "Tất cả")
- Search by name/email
- High z-index (9998/9999) to prevent overlap

## Remaining UserSelect Usage (NOT task assignment)

These use UserSelect for different purposes:

- **ProjectDetail.jsx**: WorkflowLineRow (legacy workflow lines, no company link)
- **CompaniesPage.jsx**: Company contacts/manager selection
- **TemplatesPage.jsx**: Old template system (different from Template Sets)

These can stay as UserSelect since they're not related to task assignment filtering.

## Git Commits Today

1. `e53f5b4` - EmployeePicker z-index fix + Add tasks to CreateProject
2. `da4fb62` - EmployeePicker auto-position + Template from Process copy
3. `317e87c` - Phase 3 documentation (WorkflowFlowsPage manual cleanup guide)
4. `23a3085` - Replace UserSelect with EmployeePicker in TemplateSetDetailPage

## Testing Checklist

- [ ] CreateProject: assign employee to task → dropdown appears correctly
- [ ] CreateProject: assign employee to checklist → dropdown position auto-adjusts
- [ ] ProjectDetail: edit task assignee → filter by company + department works
- [ ] ProjectDetail: edit checklist assignee → can clear assignment
- [ ] TemplateSetDetailPage: add new task → EmployeePicker loads employees
- [ ] TemplateSetDetailPage: edit task → change assignee updates correctly
- [ ] TemplateSetDetailPage: edit checklist → assign employee saves
- [ ] FlowProcessTaskEditor: assign to process task → company filter works
- [ ] All dropdowns near top of screen → open downward
- [ ] All dropdowns near bottom of screen → open upward
- [ ] Department filter → shows "Tất cả" by default, can filter
- [ ] Search → finds employees by name/email
- [ ] No companyUnitId → picker disabled with warning message

## Summary

**100% of task/checklist assignment UI now uses EmployeePicker!** 🎉

Every location where users assign employees to tasks or checklists now has:
- Company-based employee filtering
- Department sub-filtering (optional)
- Search functionality
- Smart dropdown positioning
- Consistent UX across the app

No more scattered `<select>` dropdowns with unfiltered employee lists.
