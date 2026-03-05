# 📊 PHÂN TÍCH: QUY TRÌNH NỘI BỘ vs QUY TRÌNH MẪU

**Date:** 2026-03-05  
**Purpose:** So sánh và tối ưu hóa 2 loại quy trình trong TuBep Pro

---

## 🔍 1. GIỐNG & KHÁC NHAU (TL;DR)

| Tiêu chí | Quy trình Nội bộ (Workflow) | Quy trình Mẫu (Template) |
|----------|------------------------------|---------------------------|
| **Tên** | Workflow Settings / Stages | Template Sets |
| **Cấp độ** | **Toàn hệ thống** | **Từng Công ty** |
| **Mục đích** | Khung sườn 8 giai đoạn | Bản mẫu chi tiết + tasks |
| **Số lượng** | 1 bộ (8 stages) | Nhiều bộ/công ty |
| **Ai quản lý** | 👨‍💼 Admin | 👨‍💼 Manager công ty |
| **Linh hoạt** | ⚠️ Ít (global) | ✅ Cao (per-company) |
| **Tasks** | ❌ Không có | ✅ Có (chi tiết) |
| **Ví dụ** | "8 giai đoạn chuẩn" | "Tủ bếp cơ bản 6 tuần" |

---

## 📚 2. CHI TIẾT TỪNG LOẠI

### **A. QUY TRÌNH NỘI BỘ (Workflow Stages)**

**Files:**
- `WorkflowSettings.jsx` (28KB)
- `backend/routes/stages.js`
- DB: `workflow_stages`

**Cấu trúc:**
```
8 Giai đoạn Chuẩn:
1. Tư vấn (consulting)
2. Thiết kế (designing)
3. Báo giá (quoting)
4. Hợp đồng (contract_signed)
5. Sản xuất (producing)
6. Vận chuyển (shipping)
7. Lắp đặt (installing)
8. Chăm sóc KH (warranty)
```

**Đặc điểm:**
- ✅ Global (áp dụng mọi dự án)
- ✅ Chuẩn hóa quy trình
- ✅ Map với Customer Status
- ⚠️ Khó thay đổi (ảnh hưởng toàn hệ thống)

**Khi nào dùng:**
- Định nghĩa luồng chung
- Chuẩn hóa quy trình
- Báo cáo theo giai đoạn

---

### **B. QUY TRÌNH MẪU (Template Sets)**

**Files:**
- `TemplateSetsPage.jsx`
- `TemplateSetDetailPage.jsx`
- `backend/routes/companyTemplates.js`
- DB: `company_template_sets`, `company_template_tasks`

**Cấu trúc:**
```
Công ty A:
├─ "Tủ bếp cơ bản" (6 tuần)
│  ├─ Stage: Tư vấn
│  │  ├─ Task: Khảo sát (sales, 3d)
│  │  └─ Task: Báo giá (sales, 2d)
│  ├─ Stage: Thiết kế
│  │  └─ Task: Vẽ 3D (designer, 7d)
│  └─ ... (8 stages, 32 tasks)
│
└─ "Tủ bếp cao cấp" (10 tuần, 50 tasks)
```

**Đặc điểm:**
- ✅ Per-company (riêng từng công ty)
- ✅ Tasks chi tiết (assignee, timeline)
- ✅ Reusable (dùng lại cho dự án tương tự)
- ✅ Customizable (manager tự tạo/sửa)

**Khi nào dùng:**
- Tạo bản mẫu chi tiết
- Mỗi công ty quy trình riêng
- Tự động hóa tạo tasks
- Ước lượng thời gian

---

## 🔗 3. QUAN HỆ

```
WORKFLOW STAGES (Cấp 1 - Global)
├─ 8 giai đoạn chuẩn
│
↓ Được sử dụng bởi
│
TEMPLATE SETS (Cấp 2 - Per Company)
├─ Công ty A
│  ├─ Template 1 → Link 8 stages + 32 tasks
│  └─ Template 2 → Link 8 stages + 50 tasks
├─ Công ty B
│  └─ Template 1 → Link 8 stages + 40 tasks
│
↓ Tạo dự án từ
│
PROJECT (Cấp 3 - Instance)
└─ "Dự án Tủ bếp nhà A"
   ├─ Chọn template → Auto gen tasks
   └─ Có thể sửa sau khi tạo
```

**Link:**
```sql
company_template_tasks
├─ stage_id → workflow_stages.id
├─ title: "Khảo sát nhu cầu"
├─ assignee_field: "sales_person"
└─ estimated_days: 3
```

---

## ❌ 4. VẤN ĐỀ HIỆN TẠI

### **A. Workflow Settings (Quá phức tạp)**

```
WorkflowSettings.jsx: 28,000 bytes!
├─ Tab 1: Stages
├─ Tab 2: Customer Statuses
├─ Tab 3: Mapping
└─ Tab 4: ???

User: "Tôi chỉ muốn xem 8 giai đoạn!"
```

**Issues:**
❌ Too many tabs (overwhelming)  
❌ No wizard for first-time  
❌ No visual flow preview  
❌ Drag-drop hard on mobile  
❌ No timeline preview  

---

### **B. Template Sets (Thiếu tính năng)**

**Issues:**
❌ No search box  
❌ No filter by company/type  
❌ Manual task creation (slow)  
❌ No "quick add" or bulk import  
❌ No template library (mẫu sẵn)  
❌ No project preview  
❌ Can't share templates between companies  

---

## 🚀 5. ĐỀ XUẤT TỐI ƯU

### **PHƯƠNG ÁN 1: Đơn giản hóa Workflow** ⭐⭐⭐⭐⭐

#### **A. Tách thành 2 trang:**

**Trang 1: Workflow Stages (Simple)**
```jsx
// WorkflowStagesSimplified.jsx
<div>
  <h1>🔄 Quy Trình 8 Giai Đoạn</h1>
  
  {/* Visual Flow */}
  <FlowDiagram stages={stages} />
  
  {/* Timeline Preview */}
  <TimelinePreview />
  
  {/* List view */}
  <StageList stages={stages} />
</div>
```

**Trang 2: Customer Status Mapping (Separate)**
```jsx
// CustomerStatusPage.jsx
<div>
  <h1>🎯 Trạng Thái Khách Hàng</h1>
  <MappingTable stages={stages} statuses={statuses} />
</div>
```

**Benefits:**
- ✅ 1 trang 1 mục đích
- ✅ Ít overwhelming
- ✅ Mobile-friendly

---

#### **B. Thêm Visual Flow:**

```
┌──────────────────────────────────────────┐
│ Luồng Quy Trình:                         │
│                                          │
│ ① Tư vấn → ② Thiết kế → ③ Báo giá      │
│     ↓                                    │
│ ④ Hợp đồng → ⑤ Sản xuất → ⑥ Vận chuyển │
│     ↓                                    │
│ ⑦ Lắp đặt → ⑧ Chăm sóc KH              │
│                                          │
│ [Xem chi tiết từng giai đoạn ▼]        │
└──────────────────────────────────────────┘
```

---

#### **C. Timeline Preview:**

```jsx
<TimelinePreview>
  Tuần 1-2:  [████] Tư vấn
  Tuần 3-5:  [████████] Thiết kế
  Tuần 6:    [██] Báo giá
  ...
  Tổng: ~14 tuần
</TimelinePreview>
```

---

#### **D. Wizard Setup:**

```
[Lần đầu] → Wizard:

Chọn loại quy trình:
○ Tủ bếp (8 giai đoạn) ← Khuyên dùng
○ Đồ gỗ (7 giai đoạn)
○ Tùy chỉnh

[Tiếp tục] → Auto-create stages
```

---

### **PHƯƠNG ÁN 2: Cải tiến Template Sets** ⭐⭐⭐⭐⭐

#### **A. Template Library (Thư viện mẫu)**

```jsx
<TemplateLibrary>
  <Section title="Mẫu Hệ Thống (Admin)">
    <TemplateCard 
      name="🏠 Tủ bếp Cơ bản"
      duration="6 tuần"
      tasks="32 tasks"
      people="3 người"
      rating="⭐⭐⭐⭐⭐"
      actions={[
        "👁️ Xem",
        "📋 Copy vào công ty"
      ]}
    />
    <TemplateCard 
      name="⭐ Tủ bếp Cao cấp"
      duration="10 tuần"
      tasks="50 tasks"
      rating="⭐⭐⭐⭐"
    />
  </Section>
  
  <Section title="Mẫu Công ty A (Riêng)">
    <TemplateCard name="🔧 Tủ bếp Công nghiệp" />
  </Section>
</TemplateLibrary>
```

**Benefits:**
- ✅ Công ty mới có mẫu sẵn
- ✅ Best practices từ admin
- ✅ Tiết kiệm thời gian

---

#### **B. Quick Add Tasks:**

```jsx
// Thay vì thêm từng task (50 clicks)
<QuickAddModal>
  <textarea placeholder="Paste danh sách tasks (mỗi dòng 1):
Khảo sát nhu cầu
Vẽ bản vẽ 3D
Tính toán vật tư
...
"/>
  
  <select name="assignee">Sales</select>
  <input name="days" value="3" />
  
  <button>✓ Thêm 4 tasks</button>
</QuickAddModal>
```

---

#### **C. Import từ Excel:**

```jsx
<ImportExcel>
  <button>📥 Download template.xlsx</button>
  <input type="file" accept=".xlsx" />
  
  <PreviewTable>
    Stage    | Task     | Assignee | Days
    ─────────┼──────────┼──────────┼─────
    Tư vấn   | Khảo sát | sales    | 3
    Tư vấn   | Báo giá  | sales    | 2
    Thiết kế | Vẽ 3D    | designer | 7
  </PreviewTable>
  
  <button>✓ Import 32 tasks</button>
</ImportExcel>
```

---

#### **D. Template Preview:**

```jsx
<TemplatePreview template={selectedTemplate}>
  <TimelineChart>
    Tuần 1-2: Tư vấn (3 tasks)
      ├─ Khảo sát (sales, 3d)
      ├─ Báo giá (sales, 2d)
      └─ Hợp đồng (sales, 2d)
    
    Tuần 3-5: Thiết kế (5 tasks)
      ├─ Vẽ 3D (designer, 7d)
      ├─ Tính vật tư (designer, 3d)
      └─ ...
    
    Tổng: 6 tuần, 32 tasks, 3 người
  </TimelineChart>
  
  <GanttChart tasks={tasks} />
  
  <button>📋 Dùng template này</button>
</TemplatePreview>
```

---

#### **E. Search & Filter:**

```jsx
<TemplateListView>
  <SearchBar placeholder="Tìm template..." />
  
  <Filters>
    <select name="company">Tất cả công ty</select>
    <select name="type">
      <option>Tủ bếp</option>
      <option>Đồ gỗ</option>
      <option>Nội thất</option>
    </select>
    <select name="duration">
      <option>Tất cả thời gian</option>
      <option>< 4 tuần</option>
      <option>4-8 tuần</option>
      <option>> 8 tuần</option>
    </select>
  </Filters>
  
  <TemplateGrid templates={filtered} />
</TemplateListView>
```

---

## 📋 6. IMPLEMENTATION PLAN

### **Phase 1: Workflow Simplification** (1 week)

**Week 1:**
- [ ] Create `WorkflowStagesSimplified.jsx`
- [ ] Add Visual Flow diagram
- [ ] Add Timeline preview
- [ ] Move mapping to separate page
- [ ] Add wizard for first-time
- [ ] Test & deploy

**Files to create:**
```
frontend/src/pages/
├─ WorkflowStagesSimplified.jsx  (NEW)
├─ CustomerStatusPage.jsx        (NEW)
└─ components/
   ├─ FlowDiagram.jsx            (NEW)
   └─ TimelinePreview.jsx        (NEW)
```

**Lines of code:** ~800 lines

---

### **Phase 2: Template Library** (1 week)

**Week 2:**
- [ ] Create template library component
- [ ] Seed admin templates (3 mẫu)
- [ ] Add copy template functionality
- [ ] Add search & filter
- [ ] Test & deploy

**Files:**
```
frontend/src/pages/
└─ TemplateLibraryPage.jsx  (NEW)

backend/
└─ migrations/
   └─ 20_template_library.sql  (NEW)
```

**Lines:** ~600 lines

---

### **Phase 3: Quick Add & Import** (1 week)

**Week 3:**
- [ ] Quick add tasks modal
- [ ] Excel import functionality
- [ ] Template preview
- [ ] Gantt chart view
- [ ] Test & deploy

**Files:**
```
frontend/src/components/
├─ QuickAddTasksModal.jsx   (NEW)
├─ ImportExcelModal.jsx     (NEW)
└─ TemplatePreview.jsx      (NEW)
```

**Lines:** ~700 lines

---

## 📊 7. EXPECTED IMPACT

### **Before:**
```
Setup new template:
├─ Read docs: 30 min
├─ Create 50 tasks manually: 2 hours
├─ Test: 30 min
└─ Total: 3 hours 😰
```

### **After (Phase 1-3):**
```
Setup new template:
├─ Choose from library: 2 min
├─ Copy & customize: 10 min
├─ Or import Excel: 5 min
└─ Total: 15 min 😊

Time saved: -94% ⬇️
```

---

## 🎯 8. SUCCESS METRICS

**Week 1 (Phase 1):**
- Template creation time: -50%
- User satisfaction: +40%
- Support tickets: -30%

**Week 2 (Phase 2):**
- Template reuse rate: +80%
- New company setup: -60% time

**Week 3 (Phase 3):**
- Bulk import usage: >50% templates
- Total time saved: -94%

---

## 📚 9. DOCUMENTATION

### **For Users:**
```
docs/
├─ WORKFLOW_GUIDE.md         (How to setup workflow)
├─ TEMPLATE_GUIDE.md         (How to create templates)
├─ QUICK_ADD_GUIDE.md        (Bulk add tasks)
└─ IMPORT_EXCEL_GUIDE.md     (Import from Excel)
```

### **For Admins:**
```
docs/
├─ TEMPLATE_LIBRARY_ADMIN.md  (Manage library)
└─ WORKFLOW_BEST_PRACTICES.md (Recommendations)
```

---

## 🚀 10. NEXT STEPS

### **Immediate (Today):**
1. Review this analysis
2. Decide: Which phases to implement?
3. Prioritize features

### **This Week:**
1. Start Phase 1 (Workflow simplification)
2. Create wireframes
3. Get feedback

### **Next Weeks:**
1. Phase 2 (Template library)
2. Phase 3 (Quick add & import)
3. Testing & deployment

---

## ❓ FAQ

**Q: Có breaking changes không?**  
A: Không. Giữ nguyên API, chỉ thay đổi UI.

**Q: Có cần migration không?**  
A: Phase 2 cần migration (thêm admin templates).

**Q: Mất bao lâu?**  
A: 3 tuần (1 tuần/phase).

**Q: Có thể làm song song không?**  
A: Được. Phase 1 và 2 độc lập.

---

## 📞 CONTACT

**Questions?**
- Technical: See implementation files
- UX: See mockups in this doc
- Timeline: 3 weeks total

**Want to start?**
👉 Đọc tiếp: `WORKFLOW_OPTIMIZATION_PLAN.md` (tôi sẽ tạo file này nếu bạn approve)

---

**Status:** 📋 Proposal  
**Estimated:** 3 weeks  
**Impact:** -94% time, +80% reuse  
**Complexity:** Medium

Bạn có muốn tôi:
1. ✅ Tạo wireframes chi tiết hơn?
2. ✅ Viết code cho Phase 1 ngay?
3. ✅ Tạo seed data (admin templates)?

Cho tôi biết! 🚀
