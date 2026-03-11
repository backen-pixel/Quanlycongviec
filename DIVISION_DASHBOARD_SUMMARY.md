# Kế Hoạch Hoàn Thiện: Dashboard Tổng + Dashboard Từng Khối

## 🎯 Kiến Trúc Hệ Thống

```
                 🏛️ DASHBOARD TỔNG
                  (Group Level)
             CEO/COO - Xem tất cả khối
                Route: /dashboard
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
   🏭 SẢN XUẤT     💼 KINH DOANH    🛠️ HỖ TRỢ
   Production      Sales           Support
   /divisions/1    /divisions/2    /divisions/3
```

**Nguyên tắc:**
- Dashboard tổng = Overview toàn công ty (giữ nguyên hiện tại + nâng cấp)
- Mỗi khối có dashboard riêng với KPI & features đặc thù
- Phân quyền tự động: User chỉ thấy khối mình quản lý
- Quick jump giữa các dashboard

---

## 📊 1. DASHBOARD TỔNG (Group Dashboard) - Nâng Cấp

### Route: `/dashboard`

### **A. Giữ Nguyên (Hiện Tại)**
- ✅ 4 KPI cards (Dự án, Tasks, Khách hàng, Doanh thu)
- ✅ Phân bổ dự án theo giai đoạn
- ✅ Cảnh báo & Alerts
- ✅ Activity feed

### **B. Thêm Mới**

#### **B1. Quick Jump Buttons**
```
Header:
🏛️ Dashboard Tổng              👤 CEO Nguyễn Văn A

Quick Jump: [🏭 Sản xuất] [💼 Kinh doanh] [🛠️ Hỗ trợ]
```

#### **B2. Division Overview Cards (Clickable)**
```
┌──────────────────────────────────────────────────────┐
│ 🏢 Tổng Quan Theo Khối                                │
├──────────────────────────────────────────────────────┤
│ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
│ │ 🏭 Sản xuất    │ │ 💼 Kinh doanh  │ │ 🛠️ Hỗ trợ      │
│ │ 28 dự án       │ │ 85 leads       │ │ 45 đơn hàng    │
│ │ 156 tasks      │ │ 28 HĐ ký       │ │ 92% SLA        │
│ │ 🔴 5 cảnh báo  │ │ 🟡 2 cảnh báo  │ │ ✅ Ổn định     │
│ │ [Chi tiết →]   │ │ [Chi tiết →]   │ │ [Chi tiết →]   │
│ └────────────────┘ └────────────────┘ └────────────────┘
└──────────────────────────────────────────────────────┘
```

**Features:**
- Click card → Navigate to division dashboard
- Summary metrics per division
- Alert badges (🔴 Critical, 🟡 Warning, ✅ OK)

#### **B3. Comparison Matrix**
```
┌──────────────────────────────────────────────────────┐
│ 📊 So Sánh Hiệu Suất Khối                            │
├──────────────────────────────────────────────────────┤
│ Metric        │ Sản xuất │ Kinh doanh │ Hỗ trợ      │
│───────────────┼──────────┼────────────┼─────────────│
│ Hoàn thành    │ 85% ✅   │ 84% ✅     │ 92% ✅      │
│ On-time rate  │ 86% ✅   │ 90% ✅     │ 95% ✅      │
│ Workload/người│ 3.5 🟡   │ 2.4 ✅     │ 2.0 ✅      │
│ Doanh thu     │ 8.5 tỷ   │ 6.2 tỷ     │ 1.0 tỷ      │
└──────────────────────────────────────────────────────┘
```

---

## 🏭 2. DASHBOARD KHỐI SẢN XUẤT (Production)

### Route: `/divisions/production` hoặc `/divisions/:id`

### **ĐẶC THÙ RIÊNG**
- **Focus**: Timeline, Material tracking, Quality control
- **Metrics**: Output (m²/ngày), Efficiency, Material stock, Defect rate

### **KPI Cards (4 cards đặc thù)**
```
┌────────────┬────────────┬────────────┬────────────┐
│ 🏭 SẢN LƯỢNG│ ⚙️ HIỆU SUẤT│ 📦 VẬT TƯ  │ ⭐ CHẤT LƯỢNG│
│ 28 dự án   │ 87% công   │ 92% đủ     │ 98.5% đạt  │
│ 156 m²/ngày│ suất máy   │ ⚠️ 3 thiếu │ 2 lỗi/tháng│
└────────────┴────────────┴────────────┴────────────┘
```

### **Widgets Đặc Biệt**

#### **1. Material Tracking Table**
```
📦 Tình Trạng Vật Tư
─────────────────────────────────────
Gỗ MDF 18mm   │ 500 tấm │ 450 cần │ ✅ Đủ
Gỗ MDF 20mm   │ 100 tấm │ 150 cần │ 🔴 Thiếu 50
Tay nắm inox  │ 200 bộ  │ 180 cần │ ✅ Đủ
```

#### **2. Gantt Timeline**
```
📅 Timeline Sản Xuất (2 tuần)
─────────────────────────────────────
TB-045 [X1] │▰▰▰▰▰▰▰▱▱▱│ 70% ✅
TB-046 [X2] │  ▰▰▰▰▱▱▱▱▱│ 50% 🟡
TB-047 [X1] │      ▰▰▱▱▱│ 30% ⏳
```

#### **3. Quality Control**
```
⭐ Kiểm Soát Chất Lượng
─────────────────────────────────────
• Sản phẩm kiểm tra: 156 bộ
• Đạt chuẩn: 154 bộ (98.7%) ✅
• Lỗi nhỏ: 2 bộ
• Lỗi lớn: 0 bộ 🎉
```

#### **4. Task Breakdown Per Project**
```
✅ Tasks: TB-045 (Xưởng 1)
─────────────────────────────────────
Kế hoạch SX    │ ✅ Hoàn tất │ Nguyễn A
Chuẩn bị VT    │ ✅ Hoàn tất │ Trần B
Cắt gỗ         │ 🔵 Đang làm │ Lê C (80%)
Gia công thùng │ 🔵 Đang làm │ Phạm D (60%)
Lắp phụ kiện   │ ⏳ Chờ      │ (Chưa giao)
```

---

## 💼 3. DASHBOARD KHỐI KINH DOANH (Sales)

### Route: `/divisions/sales`

### **ĐẶC THÙ RIÊNG**
- **Focus**: Lead conversion, Sales pipeline, Customer journey
- **Metrics**: Leads, Deals, Conversion rate, Revenue

### **KPI Cards (4 cards đặc thù)**
```
┌────────────┬────────────┬────────────┬────────────┐
│ 🤝 LEADS   │ 💰 DOANH THU│ 📋 BÁO GIÁ │ 📝 HỢP ĐỒNG│
│ 85 leads   │ 8.5 tỷ     │ 45 BG      │ 28 HĐ ký   │
│ +15 mới    │ +18% tháng │ 12 chốt    │ Conv: 62%  │
└────────────┴────────────┴────────────┴────────────┘
```

### **Widgets Đặc Biệt**

#### **1. Sales Funnel**
```
🔄 Pipeline Bán Hàng
─────────────────────────────────────
Leads        ████████████ 85 khách (100%)
               ↓ 80%
Tư vấn       █████████    68 khách (80%)
               ↓ 60%
Thiết kế     ██████       40 khách (47%)
               ↓ 75%
Báo giá      ████         30 khách (35%)
               ↓ 93%
Hợp đồng     ███          28 khách (33%)
```

#### **2. Customer Journey**
```
🗺️ Hành Trình: Vinhomes JSC
─────────────────────────────────────
01/03 │ 📞 Lead đến → Assign: Nguyễn D
02/03 │ 💬 Tư vấn lần 1 → Gửi catalog
05/03 │ 🏠 Khảo sát → Đo đạc
07/03 │ 🎨 Gửi bản vẽ 3D → Sửa
10/03 │ 🎨 Bản vẽ v2 → ✅ OK
12/03 │ 💰 Báo giá 120tr → Chờ
```

#### **3. Lead Management**
```
🎯 Quản Lý Leads
─────────────────────────────────────
Vinhomes JSC  │ Website│ Báo giá│ Nguyễn D│ 🔴 HOT
Value: 120tr │ Last: 2 ngày │ Next: 15/03
[View] [Call] [Email]
```

#### **4. Sales Leaderboard**
```
👔 Bảng Xếp Hạng Sales
─────────────────────────────────────
🥇 Nguyễn D │ 8 deals│ 2.3 tỷ│ Conv: 45%
🥈 Trần E   │ 6 deals│ 1.8 tỷ│ Conv: 40%
🥉 Lê F     │ 5 deals│ 1.5 tỷ│ Conv: 38%
```

---

## 🛠️ 4. DASHBOARD KHỐI HỖ TRỢ (Support)

### Route: `/divisions/support`

### **ĐẶC THÙ RIÊNG**
- **Focus**: Logistics, Installation schedule, Customer satisfaction
- **Metrics**: Deliveries, Installations, SLA, CSAT score

### **KPI Cards (4 cards đặc thù)**
```
┌────────────┬────────────┬────────────┬────────────┐
│ 🚛 VẬN ĐƠN │ 🔧 LẮP ĐẶT │ ⏱️ SLA     │ ⭐ HÀI LÒNG│
│ 45 đơn     │ 28 công    │ 92% đúng   │ 4.5/5 sao  │
│ 3 delay    │ trình      │ hạn        │ 120 reviews│
└────────────┴────────────┴────────────┴────────────┘
```

### **Widgets Đặc Biệt**

#### **1. Schedule Calendar**
```
📅 Lịch Trình Tuần Này
─────────────────────────────────────
T2 │ 🚛 Giao TB-045 → Vinhomes│ 8h-12h │ ✅
T3 │ 🔧 Lắp TB-046 → Golden   │ 9h-17h │ 🔵
T4 │ 🚛 Giao TB-047 → Sunrise │ 8h-11h │ ⏳
T5 │ 🔧 Lắp TB-048 → ABC Corp │ 13h-18h│ ⏳
```

#### **2. Route Map (Future)**
```
🗺️ Bản Đồ Giao Hàng
─────────────────────────────────────
[Interactive map showing delivery routes]
• HN: 3 điểm (Đỏ = Delay, Xanh = On track)
• HCM: 2 điểm
```

#### **3. Customer Feedback**
```
⭐ Đánh Giá Chất Lượng
─────────────────────────────────────
5 sao: ████████████████ 75%
4 sao: █████            15%
3 sao: ██                8%
2 sao: ▌                 2%

Top feedback:
"Lắp đặt nhanh, chuyên nghiệp" (18 reviews)
"Tay nghề cao, sạch sẽ" (12 reviews)
```

#### **4. Installation Team Performance**
```
👷 Hiệu Suất Đội Lắp Đặt
─────────────────────────────────────
🥇 Đội A │ 12 công trình│ 98% on-time│ 4.8⭐
🥈 Đội B │ 10 công trình│ 95% on-time│ 4.6⭐
🥉 Đội C │ 8 công trình │ 90% on-time│ 4.5⭐
```

---

## 🔐 Phân Quyền (Access Control)

### **Logic Phân Quyền**

```javascript
User Login → Check role & division_id

if (role === 'group_admin') {
  // CEO/COO
  show: Dashboard Tổng (full access)
  allow: Jump to any division dashboard
}

if (role === 'division_manager') {
  // Giám đốc Khối
  show: Dashboard Tổng (read-only)
  redirect: Own division dashboard (/divisions/:divisionId)
  deny: Other divisions
}

if (role === 'company_manager') {
  // Giám đốc Công ty
  redirect: Company dashboard (/companies/:companyId)
  filter: Only own company data
}

if (role === 'employee') {
  // Nhân viên
  redirect: My Tasks (/tasks/my)
}
```

---

## 🔧 Implementation Plan

### **Phase 1: Database & Access (Week 1)**

```sql
-- Add columns to users table
ALTER TABLE users 
  ADD COLUMN division_id UUID REFERENCES ecosystem_units(id),
  ADD COLUMN company_id UUID REFERENCES ecosystem_units(id),
  ADD COLUMN role VARCHAR(50);

-- Assign users to divisions
UPDATE users SET 
  division_id = (SELECT id FROM ecosystem_units WHERE name = 'Khối Sản xuất'),
  role = 'division_manager'
WHERE email = 'production.manager@tubep.vn';
```

### **Phase 2: Backend APIs (Week 2)**

```javascript
// New routes
GET /api/divisions                    // List divisions
GET /api/divisions/:id                // Division info
GET /api/divisions/:id/dashboard      // Division dashboard data
GET /api/divisions/:id/projects       // Projects filtered by division
GET /api/divisions/:id/tasks          // Tasks filtered by division
GET /api/divisions/:id/kpis           // Division-specific KPIs

// Middleware
checkDivisionAccess(userId, divisionId) → true/false
```

### **Phase 3: Frontend (Week 3)**

```
frontend/src/
├── pages/
│   ├── DashboardNew.jsx             // Dashboard Tổng (nâng cấp)
│   └── divisions/
│       ├── DivisionsListPage.jsx    // List all divisions
│       ├── ProductionDashboard.jsx  // Khối Sản xuất
│       ├── SalesDashboard.jsx       // Khối Kinh doanh
│       └── SupportDashboard.jsx     // Khối Hỗ trợ
│
└── components/
    └── divisions/
        ├── DivisionKPICards.jsx
        ├── MaterialTrackingTable.jsx  // Sản xuất
        ├── SalesFunnel.jsx            // Kinh doanh
        └── ScheduleCalendar.jsx       // Hỗ trợ
```

### **Phase 4: Testing & Polish (Week 4)**

- [ ] Test phân quyền (CEO, Division Manager, Employee)
- [ ] Test filters (company, project, task)
- [ ] Mobile responsive
- [ ] Real-time updates
- [ ] Export reports

---

## 📊 Data Flow Example

### **User Story: Giám đốc Khối Sản xuất**

1. **Login** → Check role = `division_manager`, division_id = `production-division`
2. **Redirect** → `/divisions/production`
3. **Load KPIs** → Filter: `projects.division_id = user.division_id`
4. **Show companies** → `Xưởng 1`, `Xưởng 2` (children of production division)
5. **Click project** → `/projects/:id` (filtered, only production projects)
6. **See tasks** → All tasks from production division users

**Cannot see:**
- Khối Kinh doanh data
- Khối Hỗ trợ data
- Other divisions

---

## 🎯 Success Metrics

### **Dashboard Tổng**
- ✅ Show overview of all divisions
- ✅ Quick jump to division dashboards
- ✅ Comparison matrix
- ✅ Alert aggregation

### **Division Dashboards**
- ✅ Unique KPIs per division type
- ✅ Specialized widgets (Material, Funnel, Calendar)
- ✅ Drill-down capability (division → company → project → task)
- ✅ Auto-filter by user's division

### **Performance**
- Load time < 2s
- Real-time updates
- Mobile responsive
- Export reports (PDF/Excel)

---

## 📁 Quick Start Commands

```bash
# 1. Run migrations
psql -h ... -d ... -f backend/supabase/26_division_access.sql

# 2. Seed divisions
psql -h ... -d ... -f backend/supabase/SEED_ECOSYSTEM.sql

# 3. Assign user to division
UPDATE users SET division_id = '...', role = 'division_manager' WHERE email = '...';

# 4. Build frontend
cd frontend && npm run build

# 5. Test
curl -H "Authorization: Bearer <token>" https://api.tubep.vn/api/divisions/production/dashboard
```

---

## 🎉 Final Result

**CEO login:**
- See: Dashboard Tổng with all divisions
- Can: Jump to any division dashboard
- Access: Full

**Giám đốc Khối Sản xuất login:**
- See: Production dashboard only
- Can: View Xưởng 1 + Xưởng 2
- Cannot: See other divisions

**Mỗi khối có:**
- ✅ KPIs đặc thù riêng
- ✅ Widgets chuyên biệt
- ✅ Phân quyền tự động
- ✅ Chi tiết đến từng task

---

**📖 Tổng kết:**
- 1 Dashboard Tổng (Group) - Overview toàn công ty
- 3 Dashboard Khối (Divisions) - Mỗi khối có đặc thù riêng
- Phân quyền tự động theo user role
- Deep dive: Tổng → Khối → Công ty → Task
