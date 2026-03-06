# Migration Plan - Sessions 2026-03-06

## URGENT: Migrations cần chạy trên Supabase

### Migration 21: flow_step_tasks (ĐÃ TẠO, CHƯA CHẠY)
File: `backend/migrations/21_flow_step_tasks.sql`
Tạo bảng flow_step_tasks + flow_step_task_checklists

### Migration 22: template_source_process (ĐÃ TẠO, CHƯA CHẠY)
File: `backend/supabase/22_template_source_process.sql`
```sql
ALTER TABLE company_template_sets
ADD COLUMN IF NOT EXISTS source_process_id UUID 
REFERENCES company_processes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_template_sets_source_process 
ON company_template_sets(source_process_id);
```

### Migration 23: template_checklist_assignee (ĐÃ TẠO, CHƯA CHẠY)
File: `backend/supabase/23_template_checklist_assignee.sql`
```sql
ALTER TABLE company_template_checklists
ADD COLUMN IF NOT EXISTS default_assignee_id UUID 
REFERENCES users(id) ON DELETE SET NULL;
```

### Migration 24: permission_system (MỚI TẠO, CHƯA CHẠY)
File: `backend/supabase/24_permission_system.sql`
- Tạo bảng: roles, permissions, role_permissions, user_roles, user_permissions
- Function: user_has_permission(user_id, resource, action, unit_id)
- Default roles: admin, manager, employee, viewer
- Default permissions: projects (view/create/edit/delete), workflows, templates, users, ecosystem, reports, settings

## Tóm tắt các issue đã fix (hôm nay):

1. ✅ EmployeePicker z-index + dropdown position
2. ✅ Template Set auto-copy from Process (multi-select)
3. ✅ EmployeePicker global cache (no reload flicker)
4. ✅ Checklist assignee error (added default_assignee_id column)
5. ✅ CreateProject pre-fill assignees from template
6. ✅ Inline EmployeePicker on template task/checklist rows
7. ✅ Multi-process copy in TemplateSetDetailPage
8. ✅ WorkflowHubPage - merged 3 pages into 1 with guided steps
9. ✅ Checklist notes JSON format consistency (always JSON)

## Chưa làm (cần làm tiếp):

### Issue 2: Permission System UI
- [ ] Frontend: PermissionsPage.jsx - bảng phân quyền
- [ ] Frontend: Role management (CRUD roles)
- [ ] Frontend: Assign roles to users
- [ ] Frontend: Toggle permissions per role
- [ ] Backend: API routes /permissions, /roles, /user-roles
- [ ] Middleware: Check permissions before allowing actions

### Issue 3: Company-scoped data visibility
- [ ] Backend: Filter projects/workflows/templates by user's company
- [ ] SQL: Add WHERE clauses checking user's ecosystem_unit_id
- [ ] Frontend: Hide cross-company data
- [ ] API: /projects should only return projects user has access to

## Git commits hôm nay:
1. `e53f5b4` - EmployeePicker + Add tasks
2. `da4fb62` - Auto-position + Copy Process→Template
3. `317e87c` - Phase 3 docs
4. `23a3085` - EmployeePicker everywhere
5. `3ddd1dc` - Bug fixes (z-index + auto-copy + error msg)
6. `f661497` - 3 critical bugs (copy 0 tasks, multi-process, portal)
7. `77e686e` - Scroll flicker fix
8. `b8138b7` - Inline picker + pre-fill
9. `1709c57` - Checklist assignee + cache
10. `e6b400f` - WorkflowHubPage
11. `b7132a1` - Multi-select in detail page
12. **(NEXT)** - Notes JSON fix + Permission migration
