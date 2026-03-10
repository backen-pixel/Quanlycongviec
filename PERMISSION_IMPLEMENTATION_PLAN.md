# PERMISSION IMPLEMENTATION PLAN

## 🎯 MỤC TIÊU
Thêm `requirePermission()` middleware cho TẤT CẢ routes trong hệ thống

## 📋 CHECKLIST

### ✅ ĐÃ XONG (3/150+ routes)
- [x] POST /projects - create
- [x] PUT /projects/:id - edit  
- [x] DELETE /projects/:id - delete

### 🔄 ĐANG LÀM (Projects - 18 routes)
- [x] GET /pending-approvals - requirePermission('projects', 'view')
- [x] GET / - requirePermission('projects', 'view')
- [x] GET /:id - requirePermission('projects', 'view')
- [ ] POST /create-with-flow - requirePermission('projects', 'create')
- [ ] PUT /:id/stage - requirePermission('projects', 'approve')
- [ ] POST /:id/generate-tasks - requirePermission('projects', 'edit')
- [ ] POST /:id/request-approval - requirePermission('projects', 'view')
- [ ] POST /:id/approve-advance - requirePermission('projects', 'approve')
- [ ] POST /:id/check-advance - requirePermission('projects', 'view')
- [ ] GET /:id/comments - requirePermission('projects', 'view')
- [ ] POST /:id/comments - requirePermission('projects', 'view')
- [ ] GET /:id/products - requirePermission('projects', 'view')
- [ ] POST /:id/products - requirePermission('projects', 'edit')
- [ ] DELETE /:id/products/:ppId - requirePermission('projects', 'edit')
- [ ] GET /:id/workflow-lines - requirePermission('projects', 'view')
- [ ] POST /:id/workflow-lines - requirePermission('projects', 'edit')
- [ ] PUT /:id/workflow-lines/:lineId - requirePermission('projects', 'edit')
- [ ] DELETE /:id/workflow-lines/:lineId - requirePermission('projects', 'edit')
- [ ] PUT /:id/workflow-lines-order - requirePermission('projects', 'edit')

### ⏳ TODO - Tasks
- [ ] GET / - requirePermission('tasks', 'view')
- [ ] GET /:id - requirePermission('tasks', 'view')
- [ ] POST / - requirePermission('tasks', 'create')
- [ ] PUT /:id - requirePermission('tasks', 'edit')
- [ ] DELETE /:id - requirePermission('tasks', 'delete')
- [ ] POST /:id/checklists - requirePermission('tasks', 'edit')
- [ ] PUT /checklists/:id - requirePermission('tasks', 'edit')
- [ ] DELETE /checklists/:id - requirePermission('tasks', 'edit')

### ⏳ TODO - Customers  
- [ ] GET / - requirePermission('customers', 'view')
- [ ] GET /:id - requirePermission('customers', 'view')
- [ ] POST / - requirePermission('customers', 'create')
- [ ] PUT /:id - requirePermission('customers', 'edit')
- [ ] DELETE /:id - requirePermission('customers', 'delete')

### ⏳ TODO - Users
- [ ] GET / - requirePermission('settings', 'users')
- [ ] GET /:id - requirePermission('settings', 'users')
- [ ] POST / - requirePermission('settings', 'users')
- [ ] PUT /:id - requirePermission('settings', 'users')
- [ ] DELETE /:id - requirePermission('settings', 'users')

### ⏳ TODO - Ecosystem
- [ ] GET /levels - requirePermission('ecosystem', 'view')
- [ ] POST /levels - requirePermission('ecosystem', 'manage_all')
- [ ] PUT /levels/:id - requirePermission('ecosystem', 'manage_all')
- [ ] DELETE /levels/:id - requirePermission('ecosystem', 'manage_all')
- [ ] GET /tree - requirePermission('ecosystem', 'view')
- [ ] GET /units - requirePermission('ecosystem', 'view')
- [ ] POST /units - requirePermission('ecosystem', 'manage_unit')
- [ ] PUT /units/:id - requirePermission('ecosystem', 'manage_unit')
- [ ] DELETE /units/:id - requirePermission('ecosystem', 'manage_all')
- [ ] GET /units/:id/members - requirePermission('ecosystem', 'view')
- [ ] POST /units/:id/members - requirePermission('ecosystem', 'add_members')
- [ ] DELETE /units/:id/members/:userId - requirePermission('ecosystem', 'add_members')

### ⏳ TODO - Workflows
- [ ] GET / - requirePermission('workflows', 'view')
- [ ] GET /:id - requirePermission('workflows', 'view')
- [ ] POST / - requirePermission('workflows', 'create')
- [ ] PUT /:id - requirePermission('workflows', 'edit')
- [ ] DELETE /:id - requirePermission('workflows', 'delete')

### ⏳ TODO - Templates (companyTemplates.js)
- [ ] GET /sets - requirePermission('settings', 'templates')
- [ ] GET /sets/:id - requirePermission('settings', 'templates')
- [ ] POST /sets - requirePermission('settings', 'templates')
- [ ] PUT /sets/:id - requirePermission('settings', 'templates')
- [ ] DELETE /sets/:id - requirePermission('settings', 'templates')
- [ ] GET /sets/:id/tasks - requirePermission('settings', 'templates')
- [ ] POST /sets/:setId/tasks - requirePermission('settings', 'templates')
- [ ] PUT /template-tasks/:id - requirePermission('settings', 'templates')
- [ ] DELETE /template-tasks/:id - requirePermission('settings', 'templates')
- [ ] POST /projects/:projectId/generate-from-template - requirePermission('projects', 'create')

### ⏳ TODO - Companies
- [ ] GET / - requirePermission('ecosystem', 'view')
- [ ] POST / - requirePermission('ecosystem', 'manage_all')
- [ ] PUT /:id - requirePermission('ecosystem', 'manage_all')
- [ ] DELETE /:id - requirePermission('ecosystem', 'manage_all')

### ⏳ TODO - Departments
- [ ] GET / - requirePermission('ecosystem', 'view')
- [ ] POST / - requirePermission('ecosystem', 'manage_unit')
- [ ] PUT /:id - requirePermission('ecosystem', 'manage_unit')
- [ ] DELETE /:id - requirePermission('ecosystem', 'manage_unit')

### ⏳ TODO - Teams
- [ ] GET / - requirePermission('ecosystem', 'view')
- [ ] POST / - requirePermission('ecosystem', 'manage_unit')
- [ ] PUT /:id - requirePermission('ecosystem', 'manage_unit')
- [ ] DELETE /:id - requirePermission('ecosystem', 'manage_unit')

### ⏳ TODO - Products
- [ ] GET / - No permission (public or basic auth)
- [ ] POST / - requirePermission('settings', 'system')
- [ ] PUT /:id - requirePermission('settings', 'system')
- [ ] DELETE /:id - requirePermission('settings', 'system')

### ⏳ TODO - Approvals
- [ ] GET /project/:projectId - requirePermission('projects', 'view')
- [ ] GET /check-auto/:projectId - requirePermission('projects', 'view')
- [ ] POST /request - requirePermission('projects', 'view')
- [ ] POST /:approvalId/decide - requirePermission('projects', 'approve')
- [ ] POST /:approvalId/re-request - requirePermission('projects', 'view')

### ⏳ TODO - Workflow Flows
- [ ] GET / - requirePermission('workflows', 'view')
- [ ] GET /:id - requirePermission('workflows', 'view')
- [ ] POST / - requirePermission('workflows', 'create')
- [ ] PUT /:id - requirePermission('workflows', 'edit')
- [ ] DELETE /:id - requirePermission('workflows', 'delete')
- [ ] POST /:flowId/steps - requirePermission('workflows', 'edit')
- [ ] PUT /steps/:stepId - requirePermission('workflows', 'edit')
- [ ] DELETE /steps/:stepId - requirePermission('workflows', 'edit')

## 📊 PROGRESS
- Completed: 3/150+ (2%)
- In Progress: 3/150+
- Remaining: 144/150+ (98%)

## 🎯 ESTIMATION
- ~30 routes/hour with careful testing
- Total time: ~5 hours
- Should do in phases to test incrementally

## 🔧 IMPLEMENTATION STRATEGY

### Phase 1: Critical (1 hour) ⚠️
1. Projects view/list routes
2. Tasks view/list routes
3. Users CRUD
4. Customers CRUD

### Phase 2: Important (1 hour)
5. Ecosystem management
6. Workflows CRUD
7. Templates CRUD

### Phase 3: Medium (2 hours)
8. Companies/Departments/Teams
9. Products
10. Approvals
11. Project sub-routes (comments, products, etc.)

### Phase 4: Testing & Fixes (1 hour)
12. Test with 3 roles
13. Fix permission denied errors
14. Update frontend to hide unauthorized actions

## 🚨 RISKS
- Breaking existing functionality
- Over-restrictive permissions
- Need thorough testing with each role
- Frontend may need updates to handle 403 errors

## ✅ SUCCESS CRITERIA
- All routes have appropriate permission checks
- Admin can do everything
- Manager has limited access
- Employee only sees assigned items
- No unauthorized access possible
- Audit log captures all permission checks
