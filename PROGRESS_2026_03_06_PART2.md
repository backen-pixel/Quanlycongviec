# Implementation Progress - 2026-03-06 Part 2

## ✅ Completed

### Phase 1: EmployeePicker Improvements
- [x] Auto-detect dropdown position (top/bottom) based on viewport space
- [x] Disable picker when no `companyUnitId` with message "Chọn công ty trước"
- [x] Department filter defaults to "Tất cả" (optional)
- [x] Fixed z-index to z-9998/9999
- [x] Added max-height (256px) with scroll
- [x] useRef for position calculation (getBoundingClientRect)

### Phase 2: Template Set from Process
- [x] Migration 22: `source_process_id` column in `company_template_sets`
- [x] Backend API: `POST /company-templates/template-sets/:id/copy-from-process`
  - Copy all tasks from `company_process_tasks` → `company_template_tasks`
  - Copy all checklists from `company_process_checklists` → `company_template_checklists`
  - Delete existing template tasks before copy (replace mode)
  - Update `source_process_id` for tracking
- [x] Frontend: TemplateSetDetailPage
  - Load processes for current company unit
  - "Copy từ Quy trình nội bộ" section with purple gradient
  - Dropdown to select process (shows task count)
  - Warning message about replacing existing data
  - Copy button with loading state
  - Success alert with copied task count

## 🔄 Next Steps (Not Started)

### Phase 3: Remove Process from WorkflowFlowsPage
- [ ] Hide "Quy trình nội bộ" section in flow editor
- [ ] Remove FlowProcessTaskEditor (or rename to FlowTemplateTaskEditor)
- [ ] Show template tasks when template_set_id selected
- [ ] Update flow step UI to only show template dropdown

### Phase 4: Add EmployeePicker Everywhere
- [ ] ProjectDetail.jsx - task/checklist assignees
- [ ] WorkflowFlowsPage - flow task assignees
- [ ] Any remaining CRUD forms with assignee fields

### Phase 5: Clean Up
- [ ] Search for any remaining `<select>` with employee options
- [ ] Test all assignment flows end-to-end
- [ ] Verify department filtering works across all pages

## Database Changes

### Migration 22
```sql
ALTER TABLE company_template_sets
ADD COLUMN source_process_id UUID REFERENCES company_processes(id) ON DELETE SET NULL;

CREATE INDEX idx_template_sets_source_process 
ON company_template_sets(source_process_id);
```

**User must run this on Supabase!**

## API Endpoints Added

### POST /company-templates/template-sets/:id/copy-from-process
**Request:**
```json
{
  "process_id": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "copied_tasks": 15,
  "source_process": "Sản xuất tủ bếp",
  "template_set": "Dự án Biệt thự"
}
```

## User Flow: Copy Process → Template

1. Admin creates Template Set for company (via TemplateSetsPage)
2. Navigate to Template Set detail page
3. See purple "Copy từ Quy trình nội bộ" section
4. Click "Chọn quy trình gốc"
5. Select process from dropdown (shows task count)
6. See warning: "Copy sẽ thay thế toàn bộ nhiệm vụ..."
7. Click "Copy nhiệm vụ"
8. Confirm dialog
9. Backend copies all tasks + checklists
10. Success alert: "✅ Đã copy X nhiệm vụ từ [Process Name]"
11. Page reloads → shows copied tasks grouped by stage

## Git
- Commit: `da4fb62`
- Branch: `main`
- Files: 4 changed, 310 insertions(+), 24 deletions(-)

## Testing Checklist
- [ ] User runs Migration 22 on Supabase
- [ ] Create template set for a company
- [ ] Verify processes dropdown loads
- [ ] Copy process → template
- [ ] Verify tasks appear grouped by stage
- [ ] Check checklists copied correctly
- [ ] Verify `source_process_id` saved in DB
- [ ] Test EmployeePicker dropdown near top of page (should go down)
- [ ] Test EmployeePicker dropdown near bottom of page (should go up)
- [ ] Test EmployeePicker when company_unit_id is null (should be disabled)
- [ ] Test department filter shows "Tất cả" by default
