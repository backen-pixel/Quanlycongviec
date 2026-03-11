# Kế Hoạch: Dashboard Theo Khối (Division Dashboard)

## 🎯 Mục Tiêu

Tạo dashboard riêng cho từng **Khối** (Division) với:
- Phân quyền theo cấp bậc (Tập đoàn → Khối → Công ty → Phòng ban)
- Lọc dữ liệu tự động theo user's company/division
- Quản lý chi tiết nhiệm vụ theo dự án
- Dashboard riêng cho từng khối

---

## 📊 Phân Cấp Tổ Chức (Hierarchy)

```
🏛️ Tập đoàn TuBep Pro
  │
  ├─ 🏢 Khối Sản xuất (Division)
  │   ├─ 🏭 Công ty Xưởng 1
  │   │   ├─ 👥 Phòng Kế hoạch
  │   │   ├─ 👥 Phòng Sản xuất
  │   │   └─ 👥 Phòng QC
  │   └─ 🏭 Công ty Xưởng 2
  │
  ├─ 💼 Khối Kinh doanh (Division)
  │   ├─ 🏢 Công ty Bán hàng HN
  │   │   ├─ 👥 Phòng Tư vấn
  │   │   └─ 👥 Phòng Thiết kế
  │   └─ 🏢 Công ty Bán hàng HCM
  │
  └─ 🛠️ Khối Hỗ trợ (Division)
      ├─ 🚛 Công ty Vận chuyển
      └─ 🔧 Công ty Lắp đặt
```

---

## 🔐 Phân Quyền (Access Control)

### 1. **Cấp Tập đoàn** (Group Level)
- **Vai trò**: CEO, COO, CFO
- **Quyền**: Xem tất cả divisions/companies
- **Dashboard**: Tổng quan toàn công ty

### 2. **Cấp Khối** (Division Level)
- **Vai trò**: Giám đốc Khối (Division Manager)
- **Quyền**: Xem tất cả companies trong khối mình
- **Dashboard**: Division Dashboard

### 3. **Cấp Công ty** (Company Level)
- **Vai trò**: Giám đốc Công ty (Company Manager)
- **Quyền**: Xem công ty mình + departments
- **Dashboard**: Company Dashboard

### 4. **Cấp Phòng ban** (Department Level)
- **Vai trò**: Trưởng phòng (Department Manager)
- **Quyền**: Xem phòng ban mình
- **Dashboard**: Department Dashboard

### 5. **Cấp Nhân viên** (Employee Level)
- **Vai trò**: Nhân viên
- **Quyền**: Xem tasks của mình
- **Dashboard**: My Tasks

---

## 📋 Dashboard Theo Khối - Chi Tiết

### **Dashboard Khối Sản xuất** (Production Division)

#### **A. Header Section**
```
🏢 Khối Sản xuất
────────────────────────────────────────
📅 Tháng 3/2026          [Lọc: Tất cả công ty ▼]
👤 Nguyễn Văn A (Giám đốc Khối)
```

#### **B. KPI Cards (4 cards)**
```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│ 📁 DỰ ÁN    │ ✅ TASKS    │ 👷 NHÂN SỰ  │ 📊 TIẾN ĐỘ   │
│ 28 dự án    │ 156 tasks   │ 45 người    │ 68% hoàn tất │
│ 5 đang delay│ 12 quá hạn  │ 5 quá tải   │ +12% tháng   │
└─────────────┴─────────────┴─────────────┴─────────────┘
```

**Metrics:**
- **Dự án**: Tổng, Đang làm, Hoàn thành, Delay
- **Tasks**: Tổng, Hoàn thành, Quá hạn, Blocked
- **Nhân sự**: Tổng, Active, Overload (>20 tasks)
- **Tiến độ**: % hoàn thành, Tăng trưởng

#### **C. Phân Bổ Dự Án Theo Công Ty**
```
┌──────────────────────────────────────────────┐
│ 🏭 Phân Bổ Dự Án Theo Công Ty               │
├──────────────────────────────────────────────┤
│ 🏭 Công ty Xưởng 1 (25 NV)    18 dự án      │
│    ▰▰▰▰▰▰▰▰▰▱                               │
│    ▼ Chi tiết:                               │
│       • Đang sản xuất: 12 dự án             │
│       • Hoàn thiện: 4 dự án                 │
│       • Đóng gói: 2 dự án                   │
│                                              │
│ 🏭 Công ty Xưởng 2 (20 NV)    10 dự án      │
│    ▰▰▰▰▰▱▱▱▱▱                               │
└──────────────────────────────────────────────┘
```

**Features:**
- Click vào công ty → drill down chi tiết
- Hiển thị số nhân viên
- Phân bổ dự án theo stage
- Bar chart with company color

#### **D. Danh Sách Dự Án (Project List)**
```
┌──────────────────────────────────────────────────────────┐
│ 📋 Dự Án Đang Thực Hiện                                  │
│ [Lọc: Công ty ▼] [Stage ▼] [Ưu tiên ▼] [🔍 Tìm kiếm]   │
├──────────────────────────────────────────────────────────┤
│ TB-2026-045 │ Tủ bếp Vinhomes │ Xưởng 1 │ Sản xuất │ 🔴 │
│ Tasks: 15/20 (75%) │ Deadline: 15/03/2026 │ ⚠️ Delay 2 ngày│
│                                                           │
│ TB-2026-046 │ Nhà bếp Golden │ Xưởng 2 │ Hoàn thiện │ 🟡│
│ Tasks: 8/12 (66%) │ Deadline: 20/03/2026 │ ✅ Đúng hạn   │
└──────────────────────────────────────────────────────────┘
```

**Columns:**
- Mã dự án
- Tên dự án
- Công ty phụ trách
- Giai đoạn hiện tại
- Progress bar (% tasks hoàn thành)
- Deadline & status
- Ưu tiên (🔴 Cao, 🟡 TB, 🟢 Thấp)

**Actions:**
- Click → Project detail
- Filter by company/stage/priority
- Search by code/name
- Sort by deadline/progress

#### **E. Timeline Gantt (Optional)**
```
┌──────────────────────────────────────────────┐
│ 📅 Timeline Dự Án (Gantt Chart)              │
├──────────────────────────────────────────────┤
│ TB-045 │▰▰▰▰▰▰▰▱▱▱│ 70%   Tuần 1   Tuần 2   │
│ TB-046 │▰▰▰▰▰▱▱▱▱▱│ 50%                      │
│ TB-047 │▰▰▱▱▱▱▱▱▱▱│ 20%                      │
└──────────────────────────────────────────────┘
```

#### **F. Nhiệm Vụ Theo Dự Án (Task Breakdown)**
```
┌──────────────────────────────────────────────┐
│ ✅ Nhiệm Vụ Theo Dự Án: TB-2026-045          │
│ [Lọc: Giai đoạn ▼] [Người thực hiện ▼]      │
├──────────────────────────────────────────────┤
│ ✅ Lên kế hoạch sản xuất │ Hoàn thành │ A   │
│ 🔵 Chuẩn bị vật tư       │ Đang làm   │ B   │
│ ⏳ Sản xuất thùng        │ Chờ        │ C   │
│ ❌ Lắp phụ kiện          │ Bị chặn    │ D   │
└──────────────────────────────────────────────┘
```

**Task details:**
- Tên task
- Status (Todo/Doing/Review/Done/Blocked)
- Assignee (người thực hiện)
- Due date
- Priority
- Dependencies (task phụ thuộc)

#### **G. Cảnh Báo & Rủi Ro**
```
┌──────────────────────────────────────────────┐
│ ⚠️ Cảnh Báo                                   │
├──────────────────────────────────────────────┤
│ 🔴 5 dự án quá hạn deadline                  │
│ 🟠 12 tasks chưa assign                      │
│ 🟡 3 nhân viên quá tải (>20 tasks)           │
│ 🔵 2 dự án thiếu vật tư                      │
└──────────────────────────────────────────────┘
```

#### **H. Hiệu Suất Nhân Sự**
```
┌──────────────────────────────────────────────┐
│ 👷 Hiệu Suất Nhân Sự (Top 5)                 │
├──────────────────────────────────────────────┤
│ 🥇 Nguyễn Văn A │ Xưởng 1 │ 45 tasks │⭐⭐⭐⭐⭐│
│ 🥈 Trần Văn B   │ Xưởng 2 │ 38 tasks │⭐⭐⭐⭐  │
│ 🥉 Lê Văn C     │ Xưởng 1 │ 35 tasks │⭐⭐⭐⭐  │
└──────────────────────────────────────────────┘
```

**Metrics per person:**
- Tasks completed (7/30 ngày)
- Avg completion time
- On-time rate
- Quality score

#### **I. Biểu Đồ Thống Kê**
```
┌─────────────────────────┬─────────────────────┐
│ 📈 Tiến Độ Theo Tuần    │ 🔥 Bottlenecks      │
│ (Line chart)            │ (Top delays)        │
├─────────────────────────┼─────────────────────┤
│ 💰 Giá Trị Dự Án        │ 📊 Phân Bố Tasks    │
│ (Bar chart by company)  │ (Pie chart by status│
└─────────────────────────┴─────────────────────┘
```

---

## 📋 Dashboard Khối Kinh doanh (Sales Division)

### **Khác biệt so với Khối Sản xuất:**

#### **A. KPI Cards**
```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│ 🤝 KHÁCH    │ 💰 DOANH THU│ 📋 BÁO GIÁ  │ 📝 HỢP ĐỒNG  │
│ 254 khách   │ 15.6 tỷ     │ 45 báo giá  │ 28 HĐ ký    │
│ +12 mới     │ +12% tháng  │ 12 chốt     │ Rate: 62%   │
└─────────────┴─────────────┴─────────────┴─────────────┘
```

#### **B. Pipeline Sales (Funnel)**
```
┌──────────────────────────────────────────────┐
│ 🔄 Pipeline Bán Hàng                         │
├──────────────────────────────────────────────┤
│ Tư vấn       ████████████ 50 leads           │
│ Thiết kế     ████████     30 khách           │
│ Báo giá      ██████       20 khách           │
│ Hợp đồng     ████         15 khách (chốt)   │
└──────────────────────────────────────────────┘
```

#### **C. Top Khách Hàng**
```
┌──────────────────────────────────────────────┐
│ 🏆 Top Khách Hàng VIP                        │
├──────────────────────────────────────────────┤
│ ABC Corp     │ 12 dự án │ 2.4 tỷ  │ HCM    │
│ XYZ Ltd      │ 8 dự án  │ 1.6 tỷ  │ HN     │
│ Golden Real  │ 5 dự án  │ 1.2 tỷ  │ DN     │
└──────────────────────────────────────────────┘
```

#### **D. Conversion Rate**
```
Lead → Tư vấn:    80%  ▰▰▰▰▰▰▰▰▱▱
Tư vấn → Thiết kế: 60%  ▰▰▰▰▰▰▱▱▱▱
Thiết kế → Báo giá: 66%  ▰▰▰▰▰▰▰▱▱▱
Báo giá → Hợp đồng: 75%  ▰▰▰▰▰▰▰▰▱▱
```

---

## 📋 Dashboard Khối Hỗ trợ (Support Division)

### **Đặc điểm:**

#### **A. KPI Cards**
```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│ 🚛 VẬN ĐƠN  │ 🔧 LẮP ĐẶT  │ ⏱️ SLA      │ ⭐ HÀI LÒNG  │
│ 45 đơn      │ 28 công trình│ 92% đúng hạn│ 4.5/5 sao   │
│ 3 delay     │ 2 chờ phê d │ ⚠️ 3 trễ    │ 120 reviews │
└─────────────┴─────────────┴─────────────┴─────────────┘
```

#### **B. Lịch Trình Vận Chuyển/Lắp Đặt**
```
┌──────────────────────────────────────────────┐
│ 📅 Lịch Trình Tuần Này                       │
├──────────────────────────────────────────────┤
│ T2 │ 🚛 Giao TB-045 → Vinhomes │ 8h-12h │ ✅│
│ T3 │ 🔧 Lắp TB-046 → Golden    │ 9h-17h │ 🔵│
│ T4 │ 🚛 Giao TB-047 → Sunrise  │ 8h-11h │ ⏳│
└──────────────────────────────────────────────┘
```

#### **C. Đánh Giá Chất Lượng**
```
┌──────────────────────────────────────────────┐
│ ⭐ Đánh Giá Chất Lượng Lắp Đặt               │
├──────────────────────────────────────────────┤
│ 5 sao: ████████████████████ 75%             │
│ 4 sao: ██████              15%             │
│ 3 sao: ███                  8%             │
│ 2 sao: ██                   2%             │
└──────────────────────────────────────────────┘
```

---

## 🔧 Technical Implementation

### **1. Database Schema**

#### **Thêm cột vào bảng users:**
```sql
ALTER TABLE users ADD COLUMN division_id UUID REFERENCES ecosystem_units(id);
ALTER TABLE users ADD COLUMN company_id UUID REFERENCES ecosystem_units(id);
ALTER TABLE users ADD COLUMN role VARCHAR(50); -- 'group_admin', 'division_manager', 'company_manager', 'department_manager', 'employee'

CREATE INDEX idx_users_division ON users(division_id);
CREATE INDEX idx_users_company ON users(company_id);
```

#### **Permission matrix table:**
```sql
CREATE TABLE user_division_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  division_id UUID REFERENCES ecosystem_units(id),
  access_level VARCHAR(20), -- 'full', 'read_only', 'own_company'
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, division_id)
);
```

### **2. Backend API Routes**

#### **Division Dashboard Endpoint:**
```javascript
// GET /api/divisions/:divisionId/dashboard
// Returns KPIs, projects, tasks for specific division
// Auto-filters by user's access level

router.get('/:divisionId/dashboard', auth, async (req, res) => {
  const { divisionId } = req.params;
  const userId = req.user.userId;
  
  // Check access
  const hasAccess = await checkDivisionAccess(userId, divisionId);
  if (!hasAccess) return res.status(403).json({ error: 'Access denied' });
  
  // Get KPIs
  const kpis = await getDivisionKPIs(divisionId, userId);
  
  // Get projects
  const projects = await getDivisionProjects(divisionId, userId);
  
  // Get tasks
  const tasks = await getDivisionTasks(divisionId, userId);
  
  res.json({ kpis, projects, tasks });
});
```

### **3. Frontend Routes**

```javascript
// App.jsx routes
<Route path="/divisions" element={<DivisionsListPage />} />
<Route path="/divisions/:divisionId" element={<DivisionDashboardPage />} />
<Route path="/divisions/:divisionId/projects" element={<DivisionProjectsPage />} />
<Route path="/divisions/:divisionId/tasks" element={<DivisionTasksPage />} />
```

### **4. Access Control Logic**

```javascript
// helpers/accessControl.js

async function checkDivisionAccess(userId, divisionId) {
  const user = await supabase.from('users')
    .select('role, division_id, company_id')
    .eq('id', userId)
    .single();
    
  // Group admin: access all
  if (user.role === 'group_admin') return true;
  
  // Division manager: access own division
  if (user.role === 'division_manager') {
    return user.division_id === divisionId;
  }
  
  // Company manager: access if company belongs to division
  if (user.role === 'company_manager') {
    const company = await supabase.from('ecosystem_units')
      .select('parent_id')
      .eq('id', user.company_id)
      .single();
    return company.parent_id === divisionId;
  }
  
  return false;
}
```

---

## 📁 File Structure

```
frontend/src/
├── pages/
│   ├── divisions/
│   │   ├── DivisionsListPage.jsx       // Danh sách các khối
│   │   ├── DivisionDashboardPage.jsx   // Dashboard chi tiết khối
│   │   ├── DivisionProjectsPage.jsx    // Dự án của khối
│   │   └── DivisionTasksPage.jsx       // Tasks của khối
│   │
│   └── DashboardNew.jsx                // Dashboard tổng (group level)
│
├── components/
│   ├── divisions/
│   │   ├── DivisionKPICards.jsx
│   │   ├── DivisionProjectList.jsx
│   │   ├── DivisionTaskBreakdown.jsx
│   │   ├── DivisionTeamPerformance.jsx
│   │   └── DivisionAlerts.jsx
│   │
│   └── shared/
│       ├── ProjectCard.jsx
│       ├── TaskList.jsx
│       └── GanttChart.jsx
│
backend/src/routes/
├── divisions.js                        // Division APIs
├── divisionProjects.js                 // Projects filtered by division
└── divisionTasks.js                    // Tasks filtered by division
```

---

## 🎯 Implementation Phases

### **Phase 1: Setup (Week 1)**
- [ ] Database migration (add division_id, company_id to users)
- [ ] Create permission matrix table
- [ ] Seed ecosystem data (divisions, companies)
- [ ] Assign users to divisions/companies

### **Phase 2: Backend (Week 2)**
- [ ] Division dashboard API endpoint
- [ ] Access control middleware
- [ ] Filter projects by division
- [ ] Filter tasks by division/company
- [ ] KPI calculation logic

### **Phase 3: Frontend (Week 3)**
- [ ] DivisionsListPage (list all divisions)
- [ ] DivisionDashboardPage (main dashboard)
- [ ] KPI cards component
- [ ] Project list component
- [ ] Task breakdown component

### **Phase 4: Advanced Features (Week 4)**
- [ ] Gantt chart timeline
- [ ] Team performance metrics
- [ ] Real-time updates (Socket.IO)
- [ ] Export reports (PDF/Excel)
- [ ] Mobile responsive

---

## 🚀 Quick Start Guide

### **1. Chạy migrations:**
```bash
cd backend/supabase
psql -h ... -d ... -f 16_ecosystem.sql
psql -h ... -d ... -f 26_division_access.sql
```

### **2. Seed data:**
```bash
psql -h ... -d ... -f SEED_ECOSYSTEM.sql
```

### **3. Assign user to division:**
```sql
UPDATE users SET 
  division_id = (SELECT id FROM ecosystem_units WHERE slug = 'production-division'),
  role = 'division_manager'
WHERE email = 'manager@tubep.vn';
```

### **4. Test access:**
```bash
curl -H "Authorization: Bearer <token>" \
  https://api.tubep.vn/api/divisions/production-division/dashboard
```

---

## 📊 Expected Results

### **User: Giám đốc Khối Sản xuất**
- Sees: All projects in Production Division
- Sees: Tasks from Xưởng 1 + Xưởng 2
- Cannot see: Sales or Support division data

### **User: Giám đốc Công ty Xưởng 1**
- Sees: Only Xưởng 1 projects
- Cannot see: Xưởng 2 data

### **User: CEO (Group Admin)**
- Sees: Everything (all divisions)
- Can switch between division dashboards

---

**🎉 Kết quả:** Mỗi khối có dashboard riêng, phân quyền tự động, quản lý chi tiết theo dự án!
