# Phase 3: Remove Process from WorkflowFlowsPage - MANUAL CLEANUP NEEDED

## Problem
WorkflowFlowsPage.jsx (596 lines) có quá nhiều logic liên quan đến `company_processes` cần xóa. File quá phức tạp để edit tự động.

## Changes Needed

### 1. Remove Imports
```javascript
// DELETE these lines:
import ProcessTaskEditor from '../components/ProcessTaskEditor';
import FlowProcessTaskEditor from '../components/FlowProcessTaskEditor';

// KEEP:
import FlowStepTaskManager from '../components/FlowStepTaskManager';
```

### 2. Update Page Description
Line ~56:
```javascript
// OLD:
<p className="text-xs text-gray-500 mt-0.5">Luồng → Khối → Công ty → Quy trình nội bộ → Nhiệm vụ → Checklist</p>

// NEW:
<p className="text-xs text-gray-500 mt-0.5">Luồng → Khối → Công ty → Bộ quy trình mẫu → Nhiệm vụ</p>
```

### 3. FlowForm State - Remove Process-related
Line ~244:
```javascript
// DELETE these states:
const [processesMap, setProcessesMap] = useState({});
const [expandedProcessId, setExpandedProcessId] = useState(null);

// DELETE from steps:
selected_process_ids: (s.processes || []).map(p => p.id),
```

### 4. Remove loadProcesses Function
Lines ~279-285:
```javascript
// DELETE entire function:
const loadProcesses = async (companyUnitId) => { ... };
```

### 5. Remove Process Calls
Delete all calls to `loadProcesses(s.company_unit_id)`

### 6. Remove toggleProcess Function
Find and DELETE:
```javascript
const toggleProcess = (stepKey, processId) => { ... };
```

### 7. Remove generateProcesses Function
Find and DELETE:
```javascript
const generateProcesses = async (companyUnitId, stepKey) => { ... };
```

### 8. Update Save Logic
In `save()` function, DELETE:
```javascript
await api.put(`/company-processes/flow-step/${savedStep.id}/processes`, {
  processes: procIds.map((pid, j) => ({ process_id: pid, order_index: j, is_required: true })),
});
```

### 9. Remove Process UI Section
In FlowForm render (around line ~475-530), DELETE entire "Quy trình nội bộ" section:
```javascript
{/* DELETE FROM HERE */}
<div>
  <button ... onClick={() => setExpandedStep(...)}>
    <Layers className="h-3 w-3" /> Quy trình nội bộ ...
  </button>
  {isExpanded && (
    <>
      {processes.length > 0 ? ( ... ) : ( ... )}
    </>
  )}
</div>
{/* TO HERE */}
```

KEEP ONLY the Template dropdown section.

### 10. Remove FlowProcessTaskEditor
DELETE:
```javascript
<FlowProcessTaskEditor
  companyUnitId={step.company_unit_id}
  divisionUnitId={step.division_unit_id}
  processes={processes.filter(p => ...)}
  onTasksUpdate={() => {}}
/>
```

### 11. Remove ProcessCard Component
Delete entire `ProcessCard` function (lines ~184-228)

### 12. Update FlowCard Display
In FlowCard component, DELETE:
```javascript
const processes = step.processes || [];
{processes.length > 0 && <span ...>{processes.length} quy trình</span>}
```

REPLACE with:
```javascript
const templateSet = step.template_set || null;
{templateSet && <span className="text-[10px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded">
  <Layers className="h-2 w-2 inline" /> {templateSet.name}
</span>}
```

### 13. Simplify Expanded Step View
In FlowCard expanded section, REPLACE process list with simple template info display.

## Recommended Approach

**Option A: Manual Edit (SAFER)**
1. Open WorkflowFlowsPage.jsx in editor
2. Follow checklist above
3. Remove each section carefully
4. Test after each change

**Option B: Complete Rewrite (FASTER)**
1. Backup current file
2. Create new simplified version
3. Copy only template-related logic
4. Test thoroughly

## Testing Checklist After Changes
- [ ] Page loads without errors
- [ ] Can create new flow
- [ ] Can select division → company
- [ ] Template dropdown shows available templates
- [ ] Can select template
- [ ] FlowStepTaskManager displays when template selected
- [ ] Can save flow with template_set_id
- [ ] Expand flow shows template info (not processes)
- [ ] No console errors about missing processes

## Alternative: Keep Both (Migration Period)
If you want to keep both Process and Template for now:
1. Add toggle button "Nguồn: Quy trình nội bộ | Bộ mẫu"
2. Show one or the other based on toggle
3. Phase out Process gradually

Your choice! Which approach do you prefer? 🤔
