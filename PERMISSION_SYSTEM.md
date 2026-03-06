# Permission System Architecture - TuBep Pro

## Overview
3-level hierarchical permission system with role-based access control (RBAC) + granular per-user overrides.

## Database Schema (Migration 24)

### Core Tables
```sql
roles                    -- Admin, Manager, Employee, Viewer
├─ id, name, description, is_system
└─ role_permissions      -- M:N join with permissions

permissions              -- 25+ permissions
├─ id, resource, action, description
└─ Grouped: projects, workflows, templates, users, ecosystem, reports, settings

user_roles               -- User → Role assignments
├─ user_id, role_id, ecosystem_unit_id (scope)
└─ Unique: (user_id, role_id, ecosystem_unit_id)

user_permissions         -- Granular overrides
├─ user_id, permission_id, ecosystem_unit_id, granted (bool)
└─ Unique: (user_id, permission_id, ecosystem_unit_id)
```

### Permission Check RPC
```sql
user_has_permission(user_id, resource, action, unit_id)
→ Checks user_roles + role_permissions
→ Checks user_permissions (direct grants/revokes)
→ Handles hierarchy (division includes companies)
```

## 3 Permission Levels

### Level 1: Role-based (Global/Scoped)
- Predefined roles with permission sets
- Scope options: Global, Division, Company, Department, Team
- Example: "Manager" role in "Division A" → access all child units

### Level 2: Hierarchical (Inherited)
- Parent scope includes children
- Division → Companies → Departments → Teams
- Backend: `getAllChildUnits()` BFS recursive
- Example: Division admin sees all companies/depts/teams

### Level 3: Granular (Per-User Overrides)
- Toggle individual permissions per user per unit
- Overrides role permissions
- Example: Employee A in Company B has "view" but not "edit"

## UI Structure

### /permissions - Unified 3-tab interface

**Tab 1: Vai trò & Quyền**
- Left: Roles list (admin, manager, employee, viewer)
- Right: Permission grid (grouped by resource)
- Toggle permissions for selected role
- Create new roles (non-system)

**Tab 2: Gán vai trò**
- User list with filters (Division/Company/Dept)
- Click user → UserRolesModal
- Assign role with optional scope (ecosystem_unit_id)
- Shows current roles with scope breadcrumb

**Tab 3: Phân quyền chi tiết**
- Left: Ecosystem tree (collapsible)
- Right: Multi-select users + bulk permission toggles
- [✅ grant] [❌ revoke] buttons per permission
- Bulk operations for fast mass assignment

## Workflows

### Scenario 1: Department-level Access
```
1. Create role "dept_supervisor"
2. Toggle permissions: projects view/edit, users view
3. Go to Tab 2 → Select user "Nguyễn A"
4. Assign "dept_supervisor" scoped to "Phòng Kế Hoạch"
5. Result: User A can view/edit projects in that dept only
```

### Scenario 2: Company-wide Admin
```
1. Use system role "manager"
2. Tab 2 → Select user "Trần B"
3. Assign "manager" scoped to "Công ty Phúc Đạt"
4. Result: User B manages all depts/teams in that company
```

### Scenario 3: Custom Permissions
```
1. Tab 3 → Select "Công ty A"
2. Check 10 designers
3. Click ✅ "edit" for "templates" resource
4. Click ❌ "delete" for "templates" resource
5. Result: 10 designers can edit but not delete templates
```

## Backend Filtering Logic

### Projects Endpoint
```javascript
// Check permission
const hasPerm = await checkPermission(userId, 'projects', 'all_companies');

if (hasPerm) {
  // See all projects
  query = supabase.from('projects').select('*');
} else {
  // Filter by accessible companies
  const units = await getUserAccessibleUnits(userId);
  const companyIds = units.filter(u => u.company_id).map(u => u.company_id);
  query = query.in('company_id', companyIds);
}
```

### Users Endpoint
```javascript
// Division filter
if (ecosystem_unit_id) {
  const allUnits = await getAllChildUnits(ecosystem_unit_id); // BFS
  const companyIds = extractCompanyIds(allUnits);
  const deptIds = await getDepartments(companyIds);
  query = query.in('department_id', deptIds);
}
```

## Key Files

### Backend
- `backend/supabase/24_permission_system.sql` - Schema + RPC
- `backend/src/routes/permissions.js` - Permission API (300 lines)
- `backend/src/routes/projects.js` - Filtering logic
- `backend/src/routes/users.js` - Division/Company/Dept filters
- `backend/src/routes/ecosystem.js` - Unit management

### Frontend
- `frontend/src/pages/PermissionsPage.jsx` - Main 3-tab UI (400 lines)
- `frontend/src/components/UserRolesModal.jsx` - Role assignment modal (250 lines)
- `frontend/src/components/EcosystemPermissionsTab.jsx` - Bulk permissions (400 lines)
- `frontend/src/pages/UsersPage.jsx` - User filters + role menu

## Common Patterns

### Checking Permissions (Frontend)
```javascript
// Check if user can edit projects
const canEdit = await api.post('/permissions/check', {
  user_id: currentUser.id,
  resource: 'projects',
  action: 'edit',
  unit_id: selectedProject.company_id
});
```

### Bulk Permission Grant (Frontend)
```javascript
// Grant "view" to 10 users in Company A
await Promise.all(
  selectedUsers.map(userId =>
    api.post('/permissions/users/custom-permission', {
      user_id: userId,
      permission_id: viewPermId,
      ecosystem_unit_id: companyA.id,
      granted: true
    })
  )
);
```

### Hierarchical Unit Resolution (Backend)
```javascript
// Get all child units (BFS, 3 levels)
async function getAllChildUnits(unitId) {
  const allIds = [unitId];
  let queue = [unitId];
  while (queue.length > 0) {
    const children = await supabase
      .from('ecosystem_units')
      .select('id')
      .in('parent_id', queue);
    const childIds = children.data.map(c => c.id);
    allIds.push(...childIds);
    queue = childIds;
  }
  return allIds;
}
```

## Performance Considerations

- **Caching**: User roles/permissions cached in session (TODO)
- **Filtering**: Apply filters early (SQL level, not JS)
- **Bulk operations**: Use Promise.all for parallel requests
- **Tree loading**: Only load needed levels (level param)
- **Avoid N+1**: Use JOIN/select expansion where possible

## Security Notes

- System roles (is_system=true) cannot be deleted
- Permission checks run server-side (never trust frontend)
- ecosystem_unit_id validates unit exists + user has access
- Default deny: no permission = access denied
- Audit trail: granted_by/granted_at columns (TODO: implement)

## Future Enhancements

- [ ] Permission change audit log
- [ ] Role templates (quick assign common sets)
- [ ] Permission groups (bundle related permissions)
- [ ] Time-based permissions (expiry dates)
- [ ] Delegation (temporary permission grants)
- [ ] Frontend permission caching
- [ ] Permission diff view (before/after)
- [ ] Bulk import/export roles
