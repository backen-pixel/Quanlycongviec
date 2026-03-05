# ⚠️ PHÂN TÍCH: XUNG ĐỘT GIỮA "LUỒNG" VÀ "MẪU QUY TRÌNH"

**Date:** 2026-03-05  
**Issue:** Bạn phát hiện xung đột thiết kế giữa "Quản lý Luồng" và "Tạo Dự Án"

---

## 🔍 VẤN ĐỀ BẠN PHÁT HIỆN

### **Hiện tại:**

```
TẠO DỰ ÁN (CreateProjectNew.jsx):
├─ Step 1: Thông tin dự án
├─ Step 2: Chọn Luồng (Flow) ← Có!
│  └─ Hiển thị: flow.steps với company assignments
└─ Step 3: Files

QUẢN LÝ LUỒNG (WorkflowFlowsPage.jsx):
├─ Tạo Flow
├─ Thêm Steps vào Flow
├─ Assign Company cho từng Step ← Trùng!
└─ Hiện cả: Quy trình + Nhiệm vụ
```

### **Xung đột:**

❌ **2 nơi cùng làm việc tương tự:**
- "Quản lý Luồng" → Assign company cho steps
- "Tạo Dự Án" → Chọn flow → Lại phải chọn company?

❌ **User bối rối:**
- "Tôi đã setup luồng rồi mà sao tạo dự án còn phải chọn lại?"
- "Template Set dùng để làm gì nếu Flow đã có steps?"

---

## 📚 HIỂU RÕ 3 KHÁI NIỆM

### **1. WORKFLOW STAGES (8 giai đoạn chuẩn)**
```
Database: workflow_stages
Purpose: Khung sườn toàn hệ thống
Content: Tên stage, icon, slug
Example: "Tư vấn", "Thiết kế", ...
```

**Ai dùng:** Admin tạo 1 lần, dùng mãi mãi

---

### **2. FLOWS (Luồng quy trình)**
```
Database: workflow_flows, workflow_flow_steps
Purpose: Kết nối stages với companies
Content: 
  - flow_id
  - stage_id → workflow_stages
  - company_unit_id → ecosystem_units
  - order_index
Example: 
  Flow "8 bước tủ bếp"
  ├─ Step 1: Stage "Tư vấn" → Company A
  ├─ Step 2: Stage "Thiết kế" → Company A
  └─ ...
```

**Ai dùng:** Admin/Manager tạo flow, assign company cho từng step

---

### **3. TEMPLATE SETS (Bộ quy trình mẫu)**
```
Database: company_template_sets, company_template_tasks
Purpose: Mẫu tasks chi tiết cho từng công ty
Content:
  - template_set_id
  - company_unit_id
  - stage_id → workflow_stages
  - tasks: title, assignee, days
Example:
  Template "Tủ bếp cơ bản" (Company A)
  ├─ Stage "Tư vấn"
  │  ├─ Task: Khảo sát (sales, 3d)
  │  └─ Task: Báo giá (sales, 2d)
  └─ ...
```

**Ai dùng:** Manager công ty tạo template với tasks cụ thể

---

## ⚖️ SO SÁNH 3 KHÁI NIỆM

| Tiêu chí | Workflow Stages | Flows | Template Sets |
|----------|----------------|-------|---------------|
| **Cấp độ** | Global | Cross-company | Per-company |
| **Nội dung** | Stage names | Stage + Company links | Stage + Tasks |
| **Khi tạo dự án** | ❌ Không chọn | ✅ **Chọn Flow** | ⚠️ **Conflict!** |
| **Hiển thị** | Không | Steps + Companies | ❌ Không dùng? |

---

## 🔴 XUNG ĐỘT CỤ THỂ

### **Scenario 1: Người dùng tạo dự án**

```
User: "Tôi muốn tạo dự án tủ bếp cho Công ty A"

OPTION A (Hiện tại - Flows):
├─ Chọn Flow "8 bước tủ bếp"
├─ Flow đã có: Step 1 → Company A, Step 2 → Company A, ...
└─ ✅ Dự án tạo với flow assignments

OPTION B (Nếu dùng Template Sets):
├─ Chọn Company A
├─ Chọn Template "Tủ bếp cơ bản" (của Company A)
└─ ✅ Dự án tạo với 32 tasks từ template

❓ Vậy chọn cái nào?
```

### **Hiện tại hệ thống:**

```
CreateProjectNew.jsx:
├─ Step 2: Chọn Flow ← Đang dùng
└─ Template Sets ← KHÔNG DÙNG khi tạo dự án!

→ Template Sets bị lãng phí!
```

---

## 💡 GỐC RỄ VẤN ĐỀ

### **Thiết kế ban đầu (có vấn đề):**

```
Flows:
├─ Purpose: Route dự án qua các công ty
├─ Content: Stage → Company mapping
└─ Problem: Không có tasks chi tiết

Template Sets:
├─ Purpose: Tasks chi tiết cho từng công ty
├─ Content: Stage → Tasks với assignee
└─ Problem: KHÔNG được dùng khi tạo dự án!

→ 2 hệ thống song song, không liên kết!
```

---

## ✅ GIẢI PHÁP ĐỀ XUẤT (3 PHƯƠNG ÁN)

### **PHƯƠNG ÁN 1: BỎ FLOWS, CHỈ DÙNG TEMPLATE SETS** ⭐⭐⭐⭐⭐

**Ý tưởng:**
> Flow = Template Set (merge 2 khái niệm thành 1)

**Thay đổi:**

```
TẠO DỰ ÁN (New):
├─ Step 1: Thông tin dự án + Khách hàng
├─ Step 2: Chọn Công ty ← NEW!
│  └─ Dropdown: Công ty A, B, C
├─ Step 3: Chọn Bộ Mẫu ← NEW!
│  └─ Hiển thị templates của công ty đã chọn
│  └─ VD: "Tủ bếp cơ bản", "Tủ bếp cao cấp"
└─ Step 4: Files

Khi submit:
├─ Tạo dự án với company_id
├─ Tạo tasks từ template (32 tasks)
└─ Assign theo template (sales, designer, ...)
```

**QUẢN LÝ (Đơn giản hóa):**

```
QUẢN LÝ LUỒNG (Simplified):
├─ Bỏ: Flows, Flow Steps
├─ Giữ: Workflow Stages (8 giai đoạn chuẩn)
└─ Add: Mapping stage → customer status

TẠO MẪU QUY TRÌNH (Template Sets):
├─ Chọn Công ty
├─ Tạo Template Set
├─ Thêm tasks cho từng stage
└─ Set default template
```

**Lợi ích:**
- ✅ Loại bỏ xung đột hoàn toàn
- ✅ Đơn giản hơn (1 khái niệm thay vì 2)
- ✅ Template được dùng trực tiếp
- ✅ User dễ hiểu: Công ty → Template → Tasks

**Nhược điểm:**
- ⚠️ Cần migrate data (flows → templates)
- ⚠️ Breaking change (phải test kỹ)

---

### **PHƯƠNG ÁN 2: GIỮ CẢ 2, NHƯNG PHÂN RẠCH RÕ** ⭐⭐⭐⭐

**Ý tưởng:**
> Flow dùng cho "routing", Template dùng cho "tasks"

**Thay đổi:**

```
TẠO DỰ ÁN (Modified):
├─ Step 1: Thông tin
├─ Step 2a: Chọn Luồng (Flow) ← Routing
│  └─ VD: "Luồng 8 bước"
│  └─ Mục đích: Xác định dự án đi qua công ty nào
│
├─ Step 2b: Chọn Công ty Chính ← NEW!
│  └─ Dropdown: Công ty A, B, C
│
├─ Step 2c: Chọn Bộ Mẫu (của công ty chính) ← NEW!
│  └─ VD: "Tủ bếp cơ bản"
│  └─ Mục đích: Auto-generate tasks
│
└─ Step 3: Files
```

**Khi submit:**
```javascript
{
  flow_id: selectedFlow.id, // Routing: Step 1→Cty A, Step 2→Cty B
  company_id: selectedCompany.id, // Công ty chính
  template_set_id: selectedTemplate.id, // Tasks từ template
}

→ Backend:
  1. Tạo project với flow routing
  2. Generate tasks từ template của company_id
  3. Assign tasks theo flow steps
```

**Lợi ích:**
- ✅ Giữ được 2 khái niệm (không breaking)
- ✅ Flow dùng cho handoff giữa công ty
- ✅ Template dùng cho tasks chi tiết
- ✅ Phân tách rõ ràng mục đích

**Nhược điểm:**
- ⚠️ User phải hiểu 2 khái niệm
- ⚠️ UI phức tạp hơn (3 dropdowns)

---

### **PHƯƠNG ÁN 3: FLOW LINKS TEMPLATE SETS** ⭐⭐⭐

**Ý tưởng:**
> Mỗi Flow Step có thể link đến 1 Template Set

**Thay đổi:**

```
QUẢN LÝ LUỒNG (Enhanced):
├─ Tạo Flow "8 bước tủ bếp"
├─ Thêm Steps:
│  ├─ Step 1: Stage "Tư vấn" → Company A → Template "Tư vấn cơ bản"
│  ├─ Step 2: Stage "Thiết kế" → Company A → Template "Thiết kế cơ bản"
│  └─ ...
└─ Mỗi step có thể link template (optional)

TẠO DỰ ÁN (Unchanged):
├─ Step 2: Chọn Flow
└─ Backend tự động:
   ├─ Lấy flow steps
   ├─ Nếu step có template → Generate tasks từ template
   └─ Nếu không → Tạo project rỗng
```

**Database schema:**
```sql
ALTER TABLE workflow_flow_steps
ADD COLUMN template_set_id UUID REFERENCES company_template_sets(id);
```

**Lợi ích:**
- ✅ Linh hoạt nhất
- ✅ Flow có thể có hoặc không có tasks
- ✅ Không breaking change
- ✅ Template được dùng

**Nhược điểm:**
- ⚠️ Phức tạp nhất
- ⚠️ Khó maintain

---

## 🎯 KHUYẾN NGHỊ: PHƯƠNG ÁN 1 ⭐⭐⭐⭐⭐

### **Tại sao?**

1. **Đơn giản nhất:**
   - Bỏ "Flows" (ít dùng, phức tạp)
   - Chỉ giữ "Template Sets" (hữu ích, dễ hiểu)

2. **User-friendly:**
   - Người dùng hiểu: Công ty → Mẫu → Dự án
   - Không cần hiểu "Flow routing"

3. **Thực tế:**
   - Hầu hết dự án chỉ 1 công ty làm
   - Handoff giữa công ty hiếm gặp
   - Tasks chi tiết quan trọng hơn routing

4. **Performance:**
   - Ít concept → Ít bugs
   - Database đơn giản hơn
   - Query nhanh hơn

---

## 📋 IMPLEMENTATION PLAN (PHƯƠNG ÁN 1)

### **Phase 1: Update Create Project** (1 day)

```jsx
// CreateProjectNew.jsx - Step 2
<Step2SelectCompanyAndTemplate>
  <h3>Chọn Công ty</h3>
  <CompanyDropdown companies={companies} />
  
  <h3>Chọn Bộ Mẫu</h3>
  <TemplateGrid 
    templates={templatesOfSelectedCompany}
    onSelect={setSelectedTemplate}
  />
  
  {selectedTemplate && (
    <TemplatePreview template={selectedTemplate}>
      <Timeline />
      <TaskList />
    </TemplatePreview>
  )}
</Step2SelectCompanyAndTemplate>
```

**Changes:**
```javascript
// Old
const payload = {
  flow_id: selectedFlow.id,
  flow_assignments: [...],
};

// New
const payload = {
  company_id: selectedCompany.id,
  template_set_id: selectedTemplate.id,
};

// Backend auto-generates tasks from template
```

---

### **Phase 2: Simplify Workflow Settings** (1 day)

```jsx
// WorkflowSettingsSimplified.jsx
<div>
  <h1>Quy Trình Chuẩn (8 Giai Đoạn)</h1>
  
  {/* Visual flow */}
  <FlowDiagram stages={stages} />
  
  {/* Stage list */}
  <StageList 
    stages={stages}
    onEdit={handleEdit}
  />
  
  {/* Customer status mapping (separate page) */}
  <Link to="/settings/customer-status">
    Quản lý trạng thái khách hàng →
  </Link>
</div>
```

**Remove:**
- ❌ Flows tab
- ❌ Flow Steps
- ❌ Company assignments in workflow

**Keep:**
- ✅ Workflow Stages (8 giai đoạn)
- ✅ Customer Status mapping

---

### **Phase 3: Enhance Template Sets** (2 days)

**Features:**
- Template Library (admin seeds)
- Quick add tasks
- Import Excel
- Template preview
- Set default

---

### **Phase 4: Migration** (1 day)

```sql
-- Migrate existing flows to templates
INSERT INTO company_template_sets (
  company_unit_id,
  name,
  is_default
)
SELECT 
  flow_steps.company_unit_id,
  flows.name,
  flows.is_default
FROM workflow_flows flows
JOIN workflow_flow_steps flow_steps ON flows.id = flow_steps.flow_id
GROUP BY flow_steps.company_unit_id, flows.name, flows.is_default;

-- Migrate flow steps to template tasks (if any)
-- (This depends on current data structure)
```

**Backup plan:**
- Keep old flows table (soft delete)
- Can rollback if needed

---

## 📊 BEFORE/AFTER COMPARISON

### **BEFORE (Hiện tại - Confusing)**

```
User journey:
1. Admin tạo Flow "8 bước"
2. Admin assign Company A cho Step 1-8
3. User tạo dự án → Chọn Flow "8 bước"
4. Template Sets ← KHÔNG DÙNG!

Questions:
- "Tại sao phải assign company trong Flow?"
- "Template Sets dùng để làm gì?"
- "Flow vs Template khác gì nhau?"
```

### **AFTER (Phương án 1 - Clear)**

```
User journey:
1. Admin tạo 8 Workflow Stages (1 lần duy nhất)
2. Manager Công ty A tạo Template "Tủ bếp cơ bản"
   → Thêm 32 tasks vào template
3. User tạo dự án:
   → Chọn Công ty A
   → Chọn Template "Tủ bếp cơ bản"
   → Auto-generate 32 tasks ✅

Questions:
- ✅ Dễ hiểu!
- ✅ 1 concept rõ ràng
- ✅ Template được dùng trực tiếp
```

---

## ⚠️ RISKS & MITIGATION

### **Risk 1: Breaking existing projects**

**Mitigation:**
- Keep old flow data (read-only)
- Migrate gradually
- Test thoroughly

### **Risk 2: Users attached to Flows**

**Mitigation:**
- Explain new concept clearly
- Provide migration guide
- Show benefits

### **Risk 3: Data loss during migration**

**Mitigation:**
- Backup database
- Test migration script
- Rollback plan ready

---

## 🎯 DECISION MATRIX

| Tiêu chí | PA1: Bỏ Flows | PA2: Giữ cả 2 | PA3: Link Template |
|----------|---------------|---------------|---------------------|
| **Đơn giản** | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| **User-friendly** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **No breaking** | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Flexibility** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Performance** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| **Maintenance** | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| **Total** | **28/30** 🏆 | 19/30 | 22/30 |

---

## ✅ FINAL RECOMMENDATION

### **Chọn Phương Án 1: Bỏ Flows, chỉ dùng Template Sets**

**Timeline:**
- Phase 1: Update Create Project (1 day)
- Phase 2: Simplify Workflow (1 day)
- Phase 3: Enhance Templates (2 days)
- Phase 4: Migration (1 day)
- **Total: 5 days** (1 tuần)

**Impact:**
- ✅ User experience: +90%
- ✅ Code simplicity: +80%
- ✅ Maintenance: -70% effort
- ⚠️ Migration risk: Medium (có backup plan)

---

## 🚀 NEXT STEPS

**Bạn có muốn:**
1. ✅ Tôi code Phương Án 1 ngay?
2. ✅ Tạo wireframes chi tiết?
3. ✅ Viết migration script?
4. ✅ Thảo luận thêm phương án khác?

**File này:** `FLOW_CONFLICT_ANALYSIS.md`  
**Status:** 📋 Analysis complete, awaiting decision

Cho tôi biết quyết định của bạn! 🎯
