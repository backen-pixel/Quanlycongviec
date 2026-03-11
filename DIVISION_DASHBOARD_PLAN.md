# Kế Hoạch: Hệ Thống Dashboard Đa Cấp (Multi-Level Dashboard System)

## 🎯 Kiến Trúc Tổng Thể

```
┌─────────────────────────────────────────────────────────┐
│        🏛️ DASHBOARD TỔNG (Group Dashboard)              │
│        CEO/COO/CFO - Xem toàn công ty                   │
│        Route: /dashboard                                 │
└─────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│ 🏭 KHỐI SẢN XUẤT│ │ 💼 KHỐI KD    │ │ 🛠️ KHỐI HỖ TRỢ │
│ Division 1    │ │ Division 2    │ │ Division 3    │
│ /divisions/1  │ │ /divisions/2  │ │ /divisions/3  │
└───────────────┘ └───────────────┘ └───────────────┘
```

**Nguyên tắc:**
- Dashboard tổng (cũ) giữ nguyên cho quản lý tập đoàn
- Mỗi khối có dashboard riêng biệt với đặc thù riêng
- Phân quyền tự động theo user's division
- Deep dive capability (drill down từ tổng → khối → công ty → task)

---

## 📊 DASHBOARD TỔNG (Group Level) - Giữ Nguyên & Nâng Cấp

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

### **Route:** `/dashboard` (giữ nguyên)

### **A. Header với Quick Jump**
```
🏛️ Dashboard Tổng - Tập Đoàn TuBep Pro
────────────────────────────────────────────────────
📅 Tháng 3/2026          👤 CEO Nguyễn Văn A

Quick Jump: [🏭 Sản xuất] [💼 Kinh doanh] [🛠️ Hỗ trợ]
```

### **B. KPI Cards - Tổng Quan (Hiện tại - giữ nguyên)**
```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│ 📁 156 dự án│ ✅ 89.3%    │ 👥 254 khách│ 💰 15.6 tỷ   │
│ +8 mới      │ tasks       │ +12 mới     │ +12.5% ↑    │
└─────────────┴─────────────┴─────────────┴─────────────┘
```

### **C. Phân Bổ Dự Án Theo Giai Đoạn (Hiện tại - giữ nguyên)**
```
💬 Tư vấn       13 dự án  ▰▰▰▰▰▰▰▰▰▰
🎨 Thiết kế      4 dự án  ▰▰▰▰▱▱▱▱▱▱
...
```

### **D. THÊM MỚI: Overview Theo Khối**
```
┌──────────────────────────────────────────────────────────┐
│ 🏢 Tổng Quan Theo Khối (Clickable Cards)                 │
├──────────────────────────────────────────────────────────┤
│ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ │
│ │ 🏭 Khối Sản xuất │ │ 💼 Khối KD      │ │ 🛠️ Khối Hỗ trợ   │ │
│ │ 28 dự án        │ │ 45 leads        │ │ 35 đơn hàng     │ │
│ │ 156 tasks       │ │ 12 hợp đồng     │ │ 28 lắp đặt      │ │
│ │ 45 nhân sự      │ │ 35 nhân sự      │ │ 22 nhân sự      │ │
│ │ 🔴 5 cảnh báo   │ │ 🟡 2 cảnh báo   │ │ ✅ Ổn định      │ │
│ │ [Chi tiết →]    │ │ [Chi tiết →]    │ │ [Chi tiết →]    │ │
│ └─────────────────┘ └─────────────────┘ └─────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

**Features:**
- Click vào card → Navigate to division dashboard
- Show summary metrics per division
- Alert badges (🔴 Critical, 🟡 Warning, ✅ OK)
- Real-time status updates

### **E. Cảnh Báo & Hoạt Động (Hiện tại - giữ nguyên)**
```
⚠️ Cảnh báo: 5 dự án quá hạn, 8 tasks...
📢 Hoạt động: Recent activities...
```

### **F. THÊM MỚI: Matrix So Sánh Khối**
```
┌──────────────────────────────────────────────────────────┐
│ 📊 So Sánh Hiệu Suất Giữa Các Khối                       │
├──────────────────────────────────────────────────────────┤
│ Metric          │ Sản xuất │ Kinh doanh │ Hỗ trợ       │
│─────────────────┼──────────┼────────────┼──────────────│
│ Dự án hoàn tất  │ 24/28 ✅ │ 38/45 🟡   │ 32/35 ✅     │
│ On-time rate    │ 85.7% ✅ │ 84.4% ✅   │ 91.4% ✅     │
│ Tasks/người     │ 3.5 🟡   │ 2.8 ✅     │ 4.1 🔴       │
│ Avg lead time   │ 45 ngày  │ 30 ngày    │ 15 ngày      │
└──────────────────────────────────────────────────────────┘
```

---

## 🏭 DASHBOARD KHỐI SẢN XUẤT (Production Division)

### **Route:** `/divisions/production` hoặc `/divisions/:id`

### **Đặc Thù Riêng:**
- Focus: **Timeline, Material tracking, Quality control**
- Metrics: **Production output, Efficiency, Defect rate**
- View: **Gantt chart, Material inventory**

### **A. Header với Breadcrumb**
```
🏛️ Tập đoàn > 🏭 Khối Sản xuất
────────────────────────────────────────────────────
📅 Tháng 3/2026          👤 Giám đốc Sản xuất - Trần Văn B

[← Quay lại Dashboard Tổng] | [Xuất báo cáo 📄] | [Cài đặt ⚙️]
```

### **B. KPI Cards - Đặc Thù Sản Xuất**
```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│ 🏭 SẢN LƯỢNG│ ⚙️ HIỆU SUẤT│ 📦 VẬT TƯ   │ ⭐ CHẤT LƯỢNG│
│ 28 dự án    │ 87% công suất│ 92% đủ     │ 98.5% đạt   │
│ 156 m²/ngày │ +5% ↑       │ ⚠️ 3 thiếu  │ 2 lỗi/tháng │
└─────────────┴─────────────┴─────────────┴─────────────┘
```

**Giải thích:**
- **Sản lượng**: m² tủ bếp/ngày, số dự án đang làm
- **Hiệu suất**: % công suất máy móc, năng suất/người
- **Vật tư**: % đủ nguyên liệu, cảnh báo thiếu
- **Chất lượng**: % đạt chuẩn, số lỗi/tháng

### **C. Phân Bổ Theo Công Ty (Expandable)**
```
┌──────────────────────────────────────────────────────────┐
│ 🏭 Phân Bổ Sản Xuất Theo Công Ty                         │
├──────────────────────────────────────────────────────────┤
│ 🏭 Công ty Xưởng 1 (25 NV, 10 máy)    18 dự án (64%)    │
│    ▰▰▰▰▰▰▰▰▰▱ [Xem chi tiết ▼]                          │
│                                                           │
│    ├─ Đang sản xuất: 12 dự án (45m², deadline 15/03)    │
│    ├─ Hoàn thiện:     4 dự án (15m², on track)          │
│    ├─ Đóng gói:       2 dự án (8m², chờ vận chuyển)     │
│    └─ ⚠️ Cảnh báo: Thiếu gỗ MDF 20mm (50 tấm)           │
│                                                           │
│ 🏭 Công ty Xưởng 2 (20 NV, 8 máy)     10 dự án (36%)    │
│    ▰▰▰▰▰▱▱▱▱▱ [Xem chi tiết ▼]                          │
└──────────────────────────────────────────────────────────┘
```

**Features:**
- Click expand → Show detailed breakdown
- Real-time inventory alerts
- Material shortage warnings
- Production capacity indicator

### **D. Gantt Chart Timeline - Đặc Thù Sản Xuất**
```
┌──────────────────────────────────────────────────────────┐
│ 📅 Timeline Sản Xuất (2 tuần tới)                        │
├──────────────────────────────────────────────────────────┤
│ Dự án         │ Tuần 1        │ Tuần 2        │ Status  │
│───────────────┼───────────────┼───────────────┼─────────│
│ TB-045 [X1]   │▰▰▰▰▰▰▰▱▱▱    │               │ 70% ✅  │
│ TB-046 [X2]   │    ▰▰▰▰▰▱▱▱▱▱│               │ 50% 🟡  │
│ TB-047 [X1]   │               │▰▰▰▱▱▱▱▱▱▱    │ 30% ⏳  │
│ TB-048 [X2]   │               │  ▰▰▰▰▱▱▱▱▱▱  │ Chờ VT  │
└──────────────────────────────────────────────────────────┘
```

**Chú thích:**
- [X1] = Xưởng 1, [X2] = Xưởng 2
- Color: ✅ On track, 🟡 At risk, 🔴 Delayed

### **E. Bảng Vật Tư (Material Tracking) - ĐẶC THÙ**
```
┌──────────────────────────────────────────────────────────┐
│ 📦 Tình Trạng Vật Tư                                     │
├──────────────────────────────────────────────────────────┤
│ Vật tư           │ Tồn kho │ Cần dùng │ Status         │
│──────────────────┼─────────┼──────────┼────────────────│
│ Gỗ MDF 18mm      │ 500 tấm │ 450 tấm  │ ✅ Đủ (110%)  │
│ Gỗ MDF 20mm      │ 100 tấm │ 150 tấm  │ 🔴 Thiếu 50   │
│ Tay nắm inox     │ 200 bộ  │ 180 bộ   │ ✅ Đủ (111%)  │
│ Ray trượt Blum   │ 80 bộ   │ 95 bộ    │ 🟡 Thiếu 15   │
│ Phụ kiện tủ      │ 350 bộ  │ 300 bộ   │ ✅ Đủ (117%)  │
└──────────────────────────────────────────────────────────┘

[Đặt hàng vật tư] [Lịch sử nhập kho] [Báo cáo tồn kho]
```

### **F. Danh Sách Dự Án Chi Tiết**
```
┌──────────────────────────────────────────────────────────┐
│ 📋 Dự Án Đang Sản Xuất                                   │
│ Lọc: [Xưởng ▼] [Giai đoạn ▼] [Ưu tiên ▼] [🔍 Tìm]      │
├──────────────────────────────────────────────────────────┤
│ TB-2026-045 │ Tủ bếp Vinhomes │ Xưởng 1 │ Sản xuất     │
│ ▰▰▰▰▰▰▰▱▱▱ 15/20 tasks (75%)                           │
│ 📅 Deadline: 15/03/2026 (còn 5 ngày) ⚠️ Delay 2 ngày   │
│ 📦 Vật tư: ✅ Đủ | 👷 NV: 5 người | 💰 120 triệu        │
│ [Xem tasks] [Timeline] [Báo cáo]                        │
│                                                           │
│ TB-2026-046 │ Nhà bếp Golden │ Xưởng 2 │ Hoàn thiện    │
│ ▰▰▰▰▰▰▰▰▱▱ 8/12 tasks (66%)                            │
│ 📅 Deadline: 20/03/2026 (còn 10 ngày) ✅ On track      │
│ 📦 Vật tư: 🟡 Thiếu ray trượt | 👷 NV: 3 | 💰 85 triệu  │
│ [Xem tasks] [Timeline] [Báo cáo]                        │
└──────────────────────────────────────────────────────────┘
```

### **G. Tasks Breakdown Per Project - ĐẶC THÙ**
```
┌──────────────────────────────────────────────────────────┐
│ ✅ Chi Tiết Tasks: TB-2026-045 (Xưởng 1)                 │
├──────────────────────────────────────────────────────────┤
│ Stage           │ Tasks        │ Progress │ Assignee     │
│─────────────────┼──────────────┼──────────┼──────────────│
│ Kế hoạch SX     │ ✅ Hoàn tất  │ 100%     │ Nguyễn A     │
│ Chuẩn bị VT     │ ✅ Hoàn tất  │ 100%     │ Trần B       │
│ Cắt gỗ          │ 🔵 Đang làm  │ 80%      │ Lê C         │
│ Gia công thùng  │ 🔵 Đang làm  │ 60%      │ Phạm D       │
│ Lắp phụ kiện    │ ⏳ Chờ       │ 0%       │ (Chưa giao)  │
│ Sơn/hoàn thiện  │ ⏳ Chờ       │ 0%       │ (Chưa giao)  │
│ QC kiểm tra     │ ⏳ Chờ       │ 0%       │ (Chưa giao)  │
│ Đóng gói        │ ⏳ Chờ       │ 0%       │ (Chưa giao)  │
└──────────────────────────────────────────────────────────┘

[Assign tasks] [Update progress] [Báo cáo vấn đề]
```

### **H. Quality Control Dashboard - ĐẶC THÙ**
```
┌──────────────────────────────────────────────────────────┐
│ ⭐ Kiểm Soát Chất Lượng                                   │
├──────────────────────────────────────────────────────────┤
│ Tháng này:                                                │
│ • Sản phẩm kiểm tra:  156 bộ                             │
│ • Đạt chuẩn:          154 bộ (98.7%) ✅                  │
│ • Lỗi nhỏ:            2 bộ (1.3%) - Đã sửa               │
│ • Lỗi lớn:            0 bộ (0%) 🎉                       │
│                                                           │
│ Top lỗi phổ biến:                                        │
│ 1. Ray trượt không trơn (2 lần)                          │
│ 2. Sơn bị lem (1 lần)                                    │
│                                                           │
│ [Báo cáo chi tiết] [Lịch sử QC] [Tạo vấn đề mới]       │
└──────────────────────────────────────────────────────────┘
```

### **I. Team Performance - Sản Xuất**
```
┌──────────────────────────────────────────────────────────┐
│ 👷 Hiệu Suất Thợ Sản Xuất (Top 5 tuần này)              │
├──────────────────────────────────────────────────────────┤
│ 🥇 Nguyễn Văn A │ Xưởng 1 │ 25m² │ 98% chất lượng │⭐⭐⭐⭐⭐│
│ 🥈 Trần Văn B   │ Xưởng 2 │ 22m² │ 95% chất lượng │⭐⭐⭐⭐  │
│ 🥉 Lê Văn C     │ Xưởng 1 │ 20m² │ 97% chất lượng │⭐⭐⭐⭐  │
│ 4. Phạm Văn D   │ Xưởng 2 │ 18m² │ 96% chất lượng │⭐⭐⭐⭐  │
│ 5. Hoàng Văn E  │ Xưởng 1 │ 17m² │ 94% chất lượng │⭐⭐⭐    │
└──────────────────────────────────────────────────────────┘

Metrics: m² hoàn thành, % chất lượng, tốc độ, ít lỗi
```

---

## 💼 DASHBOARD KHỐI KINH DOANH (Sales Division)

### **Route:** `/divisions/sales`

### **Đặc Thù Riêng:**
- Focus: **Sales pipeline, Lead conversion, Revenue**
- Metrics: **Leads, Deals closed, Conversion rate, Revenue**
- View: **Funnel chart, Customer journey**

### **A. Header**
```
🏛️ Tập đoàn > 💼 Khối Kinh doanh
────────────────────────────────────────────────────
📅 Tháng 3/2026          👤 Giám đốc Kinh doanh - Lê Thị C

[← Quay lại] | [CRM] | [Báo giá] | [Hợp đồng]
```

### **B. KPI Cards - Đặc Thù Kinh Doanh**
```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│ 🤝 LEADS    │ 💰 DOANH THU│ 📋 BÁO GIÁ  │ 📝 HỢP ĐỒNG  │
│ 85 leads    │ 8.5 tỷ      │ 45 báo giá  │ 28 HĐ ký    │
│ +15 mới     │ +18% tháng  │ 12 chốt     │ Conv: 62%   │
└─────────────┴─────────────┴─────────────┴─────────────┘
```

### **C. Sales Pipeline Funnel - ĐẶC THÙ**
```
┌──────────────────────────────────────────────────────────┐
│ 🔄 Pipeline Bán Hàng (Funnel)                            │
├──────────────────────────────────────────────────────────┤
│                                                           │
│ Leads đầu vào         ████████████ 85 khách  (100%)     │
│                              ↓ 80% conversion            │
│ Tư vấn               █████████    68 khách  (80%)       │
│                              ↓ 60% conversion            │
│ Thiết kế             ██████       40 khách  (47%)       │
│                              ↓ 75% conversion            │
│ Báo giá              ████         30 khách  (35%)       │
│                              ↓ 93% conversion            │
│ Hợp đồng ký          ███          28 khách  (33%) ✅    │
│                                                           │
│ Tổng conversion rate: 33% (Benchmark: 30%)               │
└──────────────────────────────────────────────────────────┘
```

### **D. Phân Bổ Theo Công Ty (Chi nhánh)**
```
┌──────────────────────────────────────────────────────────┐
│ 🏢 Phân Bổ Kinh Doanh Theo Chi Nhánh                     │
├──────────────────────────────────────────────────────────┤
│ 🏢 Chi nhánh Hà Nội (15 NV)      45 leads, 18 deals     │
│    ▰▰▰▰▰▰▰▰▱▱ 5.2 tỷ (61%)                              │
│    ▼ Chi tiết:                                            │
│       • Tư vấn: 20 khách | Thiết kế: 12 | Báo giá: 8    │
│       • Hợp đồng: 18 ký | Avg deal: 289 triệu            │
│       • Top sales: Nguyễn D (8 deals)                    │
│                                                           │
│ 🏢 Chi nhánh HCM (20 NV)         40 leads, 10 deals     │
│    ▰▰▰▰▰▱▱▱▱▱ 3.3 tỷ (39%)                              │
└──────────────────────────────────────────────────────────┘
```

### **E. Customer Journey Map - ĐẶC THÙ**
```
┌──────────────────────────────────────────────────────────┐
│ 🗺️ Hành Trình Khách Hàng: Vinhomes JSC                   │
├──────────────────────────────────────────────────────────┤
│ Timeline:                                                 │
│ 01/03 │ 📞 Lead đến (Website) → Assign: Nguyễn D        │
│ 02/03 │ 💬 Tư vấn lần 1 (1h) → Gửi catalog              │
│ 05/03 │ 🏠 Khảo sát hiện trường → Đo đạc                │
│ 07/03 │ 🎨 Gửi bản vẽ 3D → Khách yêu cầu sửa            │
│ 10/03 │ 🎨 Gửi bản vẽ v2 → ✅ Khách OK                   │
│ 12/03 │ 💰 Gửi báo giá 120 triệu → Chờ phản hồi         │
│ 15/03 │ 📞 Follow up → Thương lượng giá                 │
│ 18/03 │ 💰 Báo giá cuối 115 triệu → ✅ Khách đồng ý     │
│ 20/03 │ 📝 Ký hợp đồng → Cọc 30 triệu                   │
│ ▶ NEXT│ → Chuyển sang Khối Sản xuất                     │
└──────────────────────────────────────────────────────────┘
```

### **F. Lead Management - ĐẶC THÙ**
```
┌──────────────────────────────────────────────────────────┐
│ 🎯 Quản Lý Leads                                         │
│ Lọc: [Nguồn ▼] [Stage ▼] [Sales ▼] [🔍 Tìm]            │
├──────────────────────────────────────────────────────────┤
│ Vinhomes JSC │ Website │ Báo giá │ Nguyễn D │ 🔴 HOT    │
│ Value: 120 triệu │ Last contact: 2 ngày │ Next: 15/03   │
│ [👁️ View] [✏️ Edit] [📞 Call] [✉️ Email]                │
│                                                           │
│ Golden Real  │ Referral│ Thiết kế│ Trần E   │ 🟡 WARM   │
│ Value: 85 triệu │ Last contact: 5 ngày │ Next: 18/03    │
│ [Actions...]                                              │
└──────────────────────────────────────────────────────────┘
```

### **G. Top Customers & Revenue**
```
┌──────────────────────────────────────────────────────────┐
│ 🏆 Top Khách Hàng VIP (12 tháng)                         │
├──────────────────────────────────────────────────────────┤
│ 1. ABC Corp     │ 12 dự án │ 2.4 tỷ  │ HCM │ ⭐⭐⭐⭐⭐  │
│ 2. XYZ Ltd      │ 8 dự án  │ 1.6 tỷ  │ HN  │ ⭐⭐⭐⭐⭐  │
│ 3. Golden Real  │ 5 dự án  │ 1.2 tỷ  │ DN  │ ⭐⭐⭐⭐    │
│ 4. Vinhomes     │ 4 dự án  │ 980 tr  │ HCM │ ⭐⭐⭐⭐⭐  │
│ 5. Sunrise Dev  │ 3 dự án  │ 750 tr  │ HN  │ ⭐⭐⭐⭐    │
│                                                           │
│ [Xem tất cả] [Export] [Gửi ưu đãi VIP]                  │
└──────────────────────────────────────────────────────────┘
```

### **H. Sales Team Leaderboard - ĐẶC THÙ**
```
┌──────────────────────────────────────────────────────────┐
│ 👔 Bảng Xếp Hạng Sales (Tháng này)                       │
├──────────────────────────────────────────────────────────┤
│ 🥇 Nguyễn Văn D │ HN  │ 8 deals │ 2.3 tỷ │ Conv: 45% │🏆│
│ 🥈 Trần Thị E   │ HCM │ 6 deals │ 1.8 tỷ │ Conv: 40% │  │
│ 🥉 Lê Văn F     │ HN  │ 5 deals │ 1.5 tỷ │ Conv: 38% │  │
│ 4. Phạm Thị G   │ HCM │ 4 deals │ 1.2 tỷ │ Conv: 35% │  │
│ 5. Hoàng Văn H  │ HN  │ 3 deals │ 900tr  │ Conv: 30% │  │
└──────────────────────────────────────────────────────────┘

Metrics: Deals closed, Revenue, Conversion rate, Avg deal size
```

---

## 🛠️ DASHBOARD KHỐI HỖ TRỢ (Support Division)

### **Route:** `/divisions/support`

### **Đặc Thù Riêng:**
- Focus: **Logistics, Installation, SLA compliance**
- Metrics: **Deliveries, Installations, On-time rate, Customer satisfaction**
- View: **Calendar, Route map, Feedback**

### **A. Header**
```
🏛️ Tập đoàn > 🛠️ Khối Hỗ trợ
────────────────────────────────────────────────────
📅 Tháng 3/2026          👤 Giám đốc Hỗ trợ - Vũ Văn I

[← Quay lại] | [Lịch trình] | [Bản đồ] | [Đánh giá]
```

### **B. KPI Cards - Đặc Thù Hỗ Trợ**
```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│ 🚛 VẬN ĐƠN  │ 🔧 LẮP ĐẶT  │ ⏱️ SLA      │ ⭐ HÀ