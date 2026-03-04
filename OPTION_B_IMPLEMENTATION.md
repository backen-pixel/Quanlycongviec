# ✅ Option B Implementation - READY TO CODE

**Decision**: Template Set selection at project creation time  
**Date**: 2026-03-04  
**Status**: Backend ready, Frontend needs update

---

## ✅ Backend Already Supports This!

**File**: `backend/src/routes/projects.js`

```javascript
// Line 410-431
flow_assignments: [{ 
  division_unit_id, 
  company_unit_id, 
  template_set_id,  // ✅ Already supported!
  order_index 
}]

// If template_set_id → generate tasks from template
if (assignment.template_set_id) {
  const { data: tasks } = await supabase
    .from('company_template_tasks')
    .select('*')
    .eq('template_set_id', assignment.template_set_id)
    .eq('is_active', true);
  
  // Generate tasks from template...
}
```

✅ **Backend is complete!** No changes needed.

---

## 🚧 Frontend Changes Needed

**File**: `frontend/src/pages/CreateProject.jsx`

### Current Flow:
```
1. Select Flow
2. Flow shows: Division → Company → Processes
3. Submit → Generate tasks from processes
```

### New Flow (Option B):
```
1. Select Flow
2. Flow shows: Division → Company → [NEW] Template Set → Processes
3. Submit with template_set_id → Generate tasks from template
```

### Changes Required:

#### 1. Add State for Template Sets
```javascript
const [templateSets, setTemplateSets] = useState({});
const [selectedTemplateSets, setSelectedTemplateSets] = useState({});
```

#### 2. Load Template Sets when Company Selected
```javascript
const loadTemplateSets = async (companyUnitId) => {
  const { data } = await api.get(`/company-templates/units/${companyUnitId}/template-sets`);
  setTemplateSets(prev => ({ ...prev, [companyUnitId]: data.sets || [] }));
};
```

#### 3. Add Dropdown in Flow Tab
After company selection, show:
```jsx
<select 
  value={selectedTemplateSets[step.id] || ''} 
  onChange={e => setSelectedTemplateSets(prev => ({ ...prev, [step.id]: e.target.value }))}
>
  <option value="">-- Chọn bộ quy trình --</option>
  {(templateSets[step.company_unit_id] || []).map(set => (
    <option key={set.id} value={set.id}>
      {set.name} {set.is_default ? '⭐' : ''}
    </option>
  ))}
</select>
```

#### 4. Update Submit Payload
```javascript
flow_assignments: (flowDetail?.steps || [])
  .filter(s => s.company_unit_id)
  .map(s => ({
    division_unit_id: s.division_unit_id,
    company_unit_id: s.company_unit_id,
    template_set_id: selectedTemplateSets[s.id] || null,  // NEW!
    order_index: s.order_index,
  }))
```

---

## 📍 Exact Code Locations

**CreateProject.jsx structure**:
```
Line 1-50:   Imports + State
Line 51-120: useEffect + helpers
Line 121-200: Return JSX - Header + Tabs
Line 350-450: TAB 2: Quy Trình (Flow) ← EDIT HERE
Line 450-500: TAB 3: Files
Line 550-580: Footer buttons
```

**Where to add template set dropdown**:
- Around line 370-400 (inside flow tab)
- After company selection dropdown
- Before process list

---

## 🎯 Implementation Steps

1. ✅ Backend ready (no changes needed)
2. 🚧 Add template set state variables
3. 🚧 Load template sets API call
4. 🚧 Add dropdown UI in flow tab
5. 🚧 Update submit payload
6. 🚧 Test & verify

---

## 📝 Notes

- Template Set is **optional** (can be null)
- If template_set_id provided → tasks generated from template
- If not provided → tasks generated from processes (current behavior)
- Backward compatible ✅

---

## ⏱️ Time Estimate

**30-45 minutes** to complete frontend changes

---

**Status**: 📝 Ready to implement  
**Next**: Update CreateProject.jsx
