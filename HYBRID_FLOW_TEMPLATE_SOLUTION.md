# 🔧 GIẢI PHÁP: TÍCH HỢP LUỒNG + TEMPLATE

**Date:** 2026-03-05  
**Yêu cầu:** Giữ Luồng, nhưng tích hợp Template tốt hơn

---

## 🎯 YÊU CẦU CỤ THỂ

### **Hiện tại:**

```
QUẢN LÝ LUỒNG (WorkflowFlowsPage):
├─ Tạo Flow
├─ Add Step → Chọn Khối
│  └─ Hiển thị: Quy trình + Nhiệm vụ ← Rườm rà!
└─ Không có: Dropdown chọn Template

TẠO DỰ ÁN (CreateProjectNew):
├─ Chọn Flow
└─ Hiện: Flow Steps với Companies
```

### **Mong muốn:**

```
QUẢN LÝ LUỒNG (Simplified):
├─ Tạo Flow
├─ Add Step → Chọn Khối
│  ├─ Dropdown: Chọn Công ty (trong Khối)
│  ├─ Dropdown: Chọn Bộ Mẫu (của Công ty) ← THÊM!
│  └─ Không hiển thị: Quy trình + Nhiệm vụ chi tiết
└─ Lưu: flow_step với template_set_id

TẠO DỰ ÁN (Enhanced):
├─ Chọn Flow
├─ Hiện: Flow Steps
│  └─ Mỗi step hiện: Khối → Công ty → Template ← Rõ ràng!
└─ Khi tạo → Auto-gen tasks từ template
```

---

## 📊 PHÂN TÍCH DATABASE

### **Hiện tại có:**

```sql
workflow_flow_steps
├─ id
├─ flow_id
├─ division_unit_id (Khối)
├─ company_unit_id (Công ty)
├─ template_set_id ← ĐÃ CÓ! ✅
├─ stage_id
└─ order_index
```

**Good news:** Backend đã hỗ trợ `template_set_id`!

---

## 🛠️ GIẢI PHÁP: CẢI THIỆN UI

### **BƯỚC 1: Đơn giản hóa WorkflowFlowsPage** ⭐⭐⭐⭐⭐

**File:** `frontend/src/pages/WorkflowFlowsPage.jsx`

#### **A. Modal thêm Step (Simplified):**

```jsx
<AddStepModal flow={selectedFlow} onSaved={load}>
  {/* Step 1: Chọn Khối */}
  <div>
    <label>Khối</label>
    <select value={division} onChange={setDivision}>
      <option>-- Chọn Khối --</option>
      {divisions.map(d => (
        <option value={d.id}>{d.name}</option>
      ))}
    </select>
  </div>

  {/* Step 2: Chọn Công ty (trong Khối) */}
  {division && (
    <div>
      <label>Công ty</label>
      <select value={company} onChange={setCompany}>
        <option>-- Chọn Công ty --</option>
        {companiesInDivision.map(c => (
          <option value={c.id}>{c.name}</option>
        ))}
      </select>
    </div>
  )}

  {/* Step 3: Chọn Bộ Mẫu (của Công ty) */}
  {company && (
    <div>
      <label>Bộ Mẫu Quy Trình</label>
      <select value={templateSet} onChange={setTemplateSet}>
        <option>-- Chọn Bộ Mẫu --</option>
        {templateSetsOfCompany.map(t => (
          <option value={t.id}>
            {t.name} ({t.task_count} tasks)
          </option>
        ))}
      </select>
      
      {/* Preview nếu cần */}
      {templateSet && (
        <TemplatePreviewCard template={selectedTemplate} />
      )}
    </div>
  )}

  {/* ❌ BỎ: Hiển thị Quy trình + Nhiệm vụ chi tiết */}
  {/* ❌ BỎ: Processes (company_processes) */}
  
  <button onClick={saveStep}>Lưu</button>
</AddStepModal>
```

**Payload khi save:**
```javascript
const payload = {
  flow_id: flow.id,
  division_unit_id: division,
  company_unit_id: company,
  template_set_id: templateSet, // ← KEY!
  stage_id: autoDetectStage(templateSet), // Optional
  order_index: steps.length + 1,
};

await api.post('/flow-steps', payload);
```

---

#### **B. Hiển thị Steps (Simplified):**

```jsx
<FlowStepsList flow={selectedFlow}>
  {flow.steps.map((step, idx) => (
    <StepCard key={step.id}>
      <StepNumber>{idx + 1}</StepNumber>
      
      <StepInfo>
        <Division>{step.division?.name}</Division>
        <Arrow>→</Arrow>
        <Company>{step.company?.name}</Company>
        <Arrow>→</Arrow>
        <Template>{step.template_set?.name}</Template>
        
        {/* Badge: Task count */}
        <Badge>{step.template_set?.task_count || 0} tasks</Badge>
      </StepInfo>
      
      <Actions>
        <button onClick={() => editStep(step)}>Sửa</button>
        <button onClick={() => deleteStep(step)}>Xóa</button>
      </Actions>
    </StepCard>
  ))}
  
  <AddStepButton onClick={() => setShowAddStep(true)}>
    + Thêm Bước
  </AddStepButton>
</FlowStepsList>
```

**Ví dụ hiển thị:**
```
Flow: "8 Bước Tủ Bếp"

① Khối Miền Nam → Công ty A → Template "Tủ bếp cơ bản" (32 tasks)
② Khối Miền Nam → Công ty A → Template "Thiết kế" (5 tasks)
③ Khối Miền Bắc → Công ty D → Template "Sản xuất" (10 tasks)

[+ Thêm Bước]
```

---

#### **C. Bỏ phần phức tạp:**

**BỎ các phần này:**
- ❌ Company Processes (company_processes)
- ❌ Flow Step Processes (flow_step_processes)
- ❌ Hiển thị Tasks chi tiết trong Flow
- ❌ Checklists trong Flow

**Lý do:**
- Tasks/Checklists → Quản lý trong Template Sets
- Flow chỉ cần: Khối → Công ty → Template
- Đơn giản hơn, dễ maintain

---

### **BƯỚC 2: Cải thiện CreateProjectNew** ⭐⭐⭐⭐

**File:** `frontend/src/pages/CreateProjectNew.jsx`

#### **A. Step 2 - Flow Selection (Enhanced):**

```jsx
<Step2FlowSelection>
  <h3>Chọn Luồng Quy Trình</h3>
  
  {flows.map(flow => (
    <FlowCard 
      key={flow.id}
      selected={selectedFlow?.id === flow.id}
      onClick={() => selectFlow(flow)}
    >
      <FlowName>{flow.name}</FlowName>
      <FlowDesc>{flow.description}</FlowDesc>
      
      {/* Badge */}
      {flow.is_default && <Badge>Mặc định</Badge>}
      
      {/* Step preview */}
      <StepPreview>
        {flow.steps?.map((step, idx) => (
          <StepChip key={idx}>
            {idx + 1}. {step.division?.name} → {step.company?.name}
          </StepChip>
        ))}
      </StepPreview>
    </FlowCard>
  ))}
  
  {/* Detail view khi đã chọn */}
  {selectedFlow && (
    <FlowDetail flow={selectedFlow}>
      <Timeline>
        {selectedFlow.steps.map((step, idx) => (
          <TimelineItem key={idx}>
            <StepNumber>{idx + 1}</StepNumber>
            <StepContent>
              <Division>{step.division?.name}</Division>
              <Company>{step.company?.name}</Company>
              <Template>{step.template_set?.name}</Template>
              <TaskCount>{step.template_set?.task_count || 0} tasks</TaskCount>
            </StepContent>
          </TimelineItem>
        ))}
      </Timeline>
      
      {/* Summary */}
      <Summary>
        <TotalSteps>{selectedFlow.steps.length} bước</TotalSteps>
        <TotalTasks>
          {selectedFlow.steps.reduce((sum, s) => 
            sum + (s.template_set?.task_count || 0), 0
          )} tasks tổng
        </TotalTasks>
      </Summary>
    </FlowDetail>
  )}
</Step2FlowSelection>
```

---

#### **B. Backend tạo dự án (Auto-gen tasks):**

**Endpoint:** `POST /projects/create-with-flow`

```javascript
// backend/routes/projects.js
r.post('/create-with-flow', async (req, res) => {
  const { flow_id, name, customer_id, ...otherFields } = req.body;
  
  // 1. Get flow with steps
  const { data: flow } = await supabase
    .from('workflow_flows')
    .select('*, steps:workflow_flow_steps(*)')
    .eq('id', flow_id)
    .single();
  
  // 2. Create project
  const { data: project } = await supabase
    .from('projects')
    .insert({
      name,
      customer_id,
      flow_id,
      created_by_id: req.user.userId,
      ...otherFields,
    })
    .select()
    .single();
  
  // 3. Generate tasks from templates
  for (const step of flow.steps) {
    if (!step.template_set_id) continue;
    
    // Get template tasks
    const { data: templateTasks } = await supabase
      .from('company_template_tasks')
      .select('*')
      .eq('template_set_id', step.template_set_id)
      .order('order_index');
    
    // Create project tasks
    for (const templateTask of templateTasks) {
      await supabase.from('tasks').insert({
        project_id: project.id,
        title: templateTask.title,
        description: templateTask.description,
        stage_id: templateTask.stage_id,
        assignee_field: templateTask.assignee_field,
        estimated_days: templateTask.estimated_days,
        order_index: templateTask.order_index,
        // ... other fields
      });
    }
  }
  
  res.json({ 
    success: true, 
    project,
    message: 'Đã tạo dự án với tasks từ template'
  });
});
```

---

### **BƯỚC 3: Backend Support** ⭐⭐⭐

**File:** `backend/routes/flows.js`

#### **Đảm bảo API trả về đầy đủ:**

```javascript
// GET /flows/:id - Load full flow with templates
r.get('/:id', async (req, res) => {
  const { data: flow } = await supabase
    .from('workflow_flows')
    .select(`
      *,
      steps:workflow_flow_steps(
        *,
        division:ecosystem_units!workflow_flow_steps_division_unit_id_fkey(id,name),
        company:ecosystem_units!workflow_flow_steps_company_unit_id_fkey(id,name),
        template_set:company_template_sets(
          id, 
          name, 
          project_type,
          task_count:company_template_tasks(count)
        )
      )
    `)
    .eq('id', req.params.id)
    .single();
  
  res.json({ flow });
});
```

---

## 📋 IMPLEMENTATION CHECKLIST

### **Phase 1: Backend (1 day)**

- [ ] Update `/flows/:id` endpoint (return template_set info)
- [ ] Add `/flows/steps/:id/templates` (get templates by company)
- [ ] Update `/projects/create-with-flow` (auto-gen tasks)
- [ ] Test API with Postman

### **Phase 2: WorkflowFlowsPage (1 day)**

- [ ] Simplify AddStepModal (3 dropdowns only)
- [ ] Remove Processes UI
- [ ] Update StepCard display (show template name)
- [ ] Add TemplatePreviewCard component
- [ ] Test flow creation

### **Phase 3: CreateProjectNew (0.5 day)**

- [ ] Enhance flow selection UI
- [ ] Show template info in flow detail
- [ ] Add task count summary
- [ ] Test project creation

### **Phase 4: Testing (0.5 day)**

- [ ] Create flow with templates
- [ ] Create project from flow
- [ ] Verify tasks generated correctly
- [ ] Check edge cases (no template)

**Total: 3 days**

---

## 📊 BEFORE/AFTER COMPARISON

### **BEFORE (Hiện tại - Rườm rà)**

**Quản lý Luồng:**
```
Add Step:
├─ Chọn Khối
├─ Hiện: Danh sách Quy trình ← Rườm rà
├─ Hiện: Danh sách Nhiệm vụ ← Rườm rà
└─ Không có: Chọn Template

User: "Tôi chỉ muốn chọn Công ty + Template thôi!"
```

**Tạo Dự Án:**
```
Chọn Flow:
└─ Hiện: Step 1, 2, 3... ← Không rõ template

User: "Tasks đến từ đâu?"
```

---

### **AFTER (Đơn giản hóa)**

**Quản lý Luồng:**
```
Add Step (3 dropdowns):
① Khối: [Miền Nam ▼]
② Công ty: [Công ty A ▼]
③ Bộ Mẫu: [Tủ bếp cơ bản ▼] ← CLEAR!

Preview:
├─ "Tủ bếp cơ bản"
├─ 32 tasks
└─ 6 tuần

[Lưu]
```

**Hiển thị Steps:**
```
① Khối MN → Công ty A → "Tủ bếp cơ bản" (32 tasks)
② Khối MN → Công ty B → "Thiết kế" (5 tasks)

[+ Thêm Bước]
```

**Tạo Dự Án:**
```
Chọn Flow "8 Bước":

Timeline:
① Tư vấn: Cty A → "Tủ bếp cơ bản" (32 tasks)
② Thiết kế: Cty A → "Thiết kế" (5 tasks)
...

Tổng: 50 tasks sẽ được tạo tự động ✅

[Tạo Dự Án]
```

---

## 🎯 SUCCESS METRICS

**Week 1:**
- Flow creation time: -60%
- User confusion: -80%
- Template usage: +100%

**Week 2:**
- Project creation with correct tasks: 100%
- Support tickets about flows: -70%

---

## 🚀 QUICK START (Code ngay)

Bạn có muốn tôi:
1. ✅ Code WorkflowFlowsPage simplified ngay?
2. ✅ Update backend API?
3. ✅ Code CreateProjectNew enhanced?

**File này:** `HYBRID_FLOW_TEMPLATE_SOLUTION.md`  
**Status:** 📋 Solution ready, waiting for approval

Timeline: **3 days** nếu code ngay hôm nay! 🚀
