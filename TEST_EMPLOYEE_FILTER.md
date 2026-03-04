# 🧪 Test Employee Filter by Company

**Date**: 2026-03-04  
**Purpose**: Verify employees are filtered by company_id correctly

---

## 🎯 What to Test

Verify that when assigning tasks/checklists, the employee dropdown shows ONLY employees from the relevant company.

---

## 📋 Test Steps

### Setup

1. **Ensure you have**:
   - At least 2 companies (Công ty A, Công ty B)
   - Each company has employees:
     - Company A: Nguyễn Văn A, Trần Thị B
     - Company B: Lê Văn C, Phạm Thị D
   - A flow with multiple steps (each step assigned to different companies)
   - Template sets for each company

### Test 1: Create New Project

1. Go to **Tạo Dự Án** (Create Project)
2. Fill in project info (Tab 1)
3. Select a flow that has multiple companies (Tab 2)
4. Expand **Step 1** (e.g., assigned to Company A)
5. Select a template set
6. **Check Console Logs**:
   ```
   🔍 Loading employees for company: <company-a-id>
   ✅ Loaded employees: 2 for company: <company-a-id>
   📋 Task: [Task Name] { company_unit_id: <company-a-id>, employees_count: 2, checklists: 3 }
   ```

7. **Check Task Assignee Dropdown**:
   - Click on assignee dropdown
   - Should see: "Nguyễn Văn A", "Trần Thị B" ONLY ✅
   - Should NOT see: "Lê Văn C", "Phạm Thị D" ❌

8. **Check Checklist Assignee Dropdown**:
   - Expand checklist (click ▶ 📋 Checklist)
   - Click on checklist assignee dropdown
   - Should see same filtered list ✅

### Test 2: Different Company in Same Flow

1. In the same project creation flow
2. Expand **Step 2** (e.g., assigned to Company B)
3. Select template set for Company B
4. **Check Console Logs**:
   ```
   🔍 Loading employees for company: <company-b-id>
   ✅ Loaded employees: 2 for company: <company-b-id>
   ```

5. **Check Task Assignee Dropdown**:
   - Should see: "Lê Văn C", "Phạm Thị D" ONLY ✅
   - Should NOT see: "Nguyễn Văn A", "Trần Thị B" ❌

---

## ✅ Expected Results

### Console Logs Should Show:

```javascript
// When expanding Step 1 (Company A)
🔍 Loading employees for company: abc-123-company-a
GET /users?company_id=abc-123-company-a
✅ Loaded employees: 2 for company: abc-123-company-a

Rendering step: "Bước 1" {
  company_unit_id: "abc-123-company-a",
  sets: 2,
  selectedSetId: "template-set-1",
  tasks: 5,
  employees: 2  // ← Should match loaded count
}

📋 Task: "Nhiệm vụ 1" {
  company_unit_id: "abc-123-company-a",
  employees_count: 2,  // ← Correct!
  checklists: 3
}

// When expanding Step 2 (Company B)
🔍 Loading employees for company: xyz-456-company-b
GET /users?company_id=xyz-456-company-b
✅ Loaded employees: 2 for company: xyz-456-company-b

Rendering step: "Bước 2" {
  company_unit_id: "xyz-456-company-b",
  employees: 2  // ← Different employees!
}
```

### Dropdowns Should Show:

**Step 1 (Company A) Dropdowns**:
```
👤 Chưa gán
👤 Nguyễn Văn A
👤 Trần Thị B
```

**Step 2 (Company B) Dropdowns**:
```
👤 Chưa gán
👤 Lê Văn C
👤 Phạm Thị D
```

---

## ❌ Common Issues & Fixes

### Issue 1: Dropdown Empty

**Symptom**:
```javascript
employees_count: 0
```

**Possible Causes**:
1. `loadCompanyEmployees()` not called
2. Wrong company_id
3. Backend filter not working
4. No employees in that company

**Fix**:
- Check console for API call
- Verify company_id is correct
- Check backend has employees with that company's department

### Issue 2: Wrong Employees Shown

**Symptom**: Dropdown shows employees from different company

**Possible Causes**:
1. `step.company_unit_id` is null/undefined
2. Using wrong key to lookup employees
3. Backend filter not applied

**Fix**:
- Check `step.company_unit_id` value in console
- Verify `companyEmployees[step.company_unit_id]` lookup
- Test backend API directly: `GET /users?company_id={id}`

### Issue 3: All Employees Shown

**Symptom**: Dropdown shows ALL employees regardless of company

**Possible Causes**:
1. Backend filter not implemented
2. Wrong parameter name (should be `company_id`)
3. Backend returning unfiltered list

**Fix**:
- Check backend `users.js` route
- Verify it filters by `department.company_id`
- Test API: should return fewer users

---

## 🔧 Backend Verification

### Test Backend Directly

```bash
# Get all users (should be many)
curl http://localhost:3001/api/users

# Get users for Company A (should be filtered)
curl http://localhost:3001/api/users?company_id=abc-123-company-a

# Compare counts - second should be less than first
```

### Check Backend Code

File: `backend/src/routes/users.js`

Should have:
```javascript
const { company_id } = req.query;

// ... load users with department join ...

// Filter by company_id
let all = data || [];
if (company_id) {
  all = all.filter(u => u.department?.company_id === company_id);
}

res.json({ users: all });
```

---

## 📊 Success Criteria

✅ **Test passes if**:
1. Console shows API calls with correct `company_id`
2. Console shows correct employee count per company
3. Dropdowns show only employees of that company
4. Different steps show different employees
5. No errors in console
6. Can successfully assign employees
7. Assignment saved correctly on submit

❌ **Test fails if**:
1. Dropdown shows all employees
2. Dropdown empty when should have employees
3. Wrong employees shown
4. API not called
5. Console errors

---

## 🚀 Quick Test Command

Open browser console and run:
```javascript
// Should show cached employees per company
console.log('Cached employees:', companyEmployees);

// Should show structure like:
// {
//   "company-a-id": [{ id, full_name }, ...],
//   "company-b-id": [{ id, full_name }, ...]
// }
```

---

**Status**: Test instructions ready  
**Next**: Run test in browser after deploy
