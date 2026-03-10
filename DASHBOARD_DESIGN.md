# Dashboard Design - TuBep Pro Management System

## 🎯 Mục tiêu
Tạo dashboard quản lý toàn diện với metrics, biểu đồ, và insights cho hệ thống quản lý tủ bếp.

## 📊 Các Phần Chính (Sections)

### 1. **KPIs Tổng Quan** (Top Section - 4 cards)
```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│   📁 DỰ ÁN  │  ✅ TASKS   │  👥 KHÁCH   │  💰 DOANH THU│
│   Tổng: 156 │   Hoàn: 89% │  Mới: +12   │   15.6 tỷ    │
│   Mới: +8   │   Quá hạn:5 │  VIP: 45    │   +12% tháng │
└─────────────┴─────────────┴─────────────┴─────────────┘
```

**Metrics:**
- **Dự án**: Tổng, Đang làm, Hoàn thành, Tăng trưởng
- **Tasks**: Tổng, % hoàn thành, Quá hạn, Đang block
- **Khách hàng**: Tổng, Mới (7 ngày), VIP (>5 dự án), Tỷ lệ quay lại
- **Doanh thu**: Tổng estimated_value, Thực tế, Dự kiến, % tăng trưởng

### 2. **Quy Trình Sản Xuất** (Production Pipeline)
```
Tư vấn       ▰▰▰▰▰▰▰▰▱▱ 25 dự án
Thiết kế     ▰▰▰▰▰▰▱▱▱▱ 18 dự án
Báo giá      ▰▰▰▰▱▱▱▱▱▱ 12 dự án
Hợp đồng     ▰▰▰▰▰▰▰▱▱▱ 20 dự án
Sản xuất     ▰▰▰▰▰▰▰▰▰▱ 28 dự án (nhiều nhất)
Giao hàng    ▰▰▰▰▰▱▱▱▱▱ 15 dự án
Lắp đặt      ▰▰▰▰▱▱▱▱▱▱ 11 dự án
Bảo hành     ▰▰▰▱▱▱▱▱▱▱  8 dự án
```

**Tính năng:**
- Thanh bar chart ngang, màu theo stage
- Click vào stage → filter projects
- Hiển thị % complete cho mỗi stage
- Icon cảnh báo nếu có bottleneck (quá nhiều dự án stuck)

### 3. **Biểu Đồ Thời Gian** (Timeline Charts)
```
┌─────────────────────────────────┬─────────────────────────┐
│  📈 Dự án theo tháng (6 tháng)  │  💼 Tasks hoàn thành    │
│  Line chart hoặc Bar chart      │  Heatmap 30 ngày        │
└─────────────────────────────────┴─────────────────────────┘
```

**Metrics:**
- Dự án: Tạo mới, Hoàn thành, Hủy theo tháng (6 tháng gần nhất)
- Tasks: Heatmap 30 ngày (như GitHub contributions)
- Doanh thu: Trend line 12 tháng

### 4. **Hiệu Suất Đội Ngũ** (Team Performance)
```
┌──────────────────────────────────────────────┐
│  TOP PERFORMERS (7 ngày)                      │
│  1. 🥇 Nguyễn Văn A    48 tasks  ⭐⭐⭐⭐⭐    │
│  2. 🥈 Trần Thị B      42 tasks  ⭐⭐⭐⭐      │
│  3. 🥉 Lê Văn C        38 tasks  ⭐⭐⭐⭐      │
│  ...                                          │
└──────────────────────────────────────────────┘
```

**Metrics:**
- Tasks completed (7/30 ngày)
- Avg completion time
- Projects owned
- Overdue rate

### 5. **Cảnh Báo & Thông Báo** (Alerts & Notifications)
```
⚠️ 5 dự án quá hạn deadline
🔴 3 tasks ưu tiên cao chưa assign
⏰ 8 checklist items cần duyệt
📋 12 approval requests chờ
```

**Loại cảnh báo:**
- Dự án quá hạn (status != done, due_date < now)
- Tasks quá hạn
- Approval chờ duyệt
- Resources overload (user có >20 tasks đang làm)
- Budget warnings (estimated_value vượt ngưỡng)

### 6. **Khách Hàng** (Customer Insights)
```
┌─────────────────────┬─────────────────────┐
│  🏆 TOP KHÁCH HÀNG  │  📍 PHÂN BỐ ĐỊA LÝ  │
│  VIP: 45 khách      │  HCM:  65%          │
│  Loyal: 120         │  HN:   20%          │
│  New: 89            │  DN:   10%          │
│                     │  Khác:  5%          │
└─────────────────────┴─────────────────────┘
```

**Metrics:**
- Top khách (theo số dự án, doanh thu)
- Tỷ lệ khách quay lại
- Avg project value per customer
- Phân bố địa lý (city)
- Customer lifetime value

### 7. **Sản Phẩm & Components**
```
┌──────────────────────────────────────────────┐
│  🛠️ MATERIALS & COMPONENTS                   │
│  Gỗ công nghiệp:  1,240 m² (stock: 85%)     │
│  Tay nắm:          450 bộ (stock: 60%) ⚠️    │
│  Ray trượt:        320 bộ (stock: 95%)       │
└──────────────────────────────────────────────┘
```

**Metrics:**
- Most used products/components
- Stock levels (nếu có inventory system)
- Component usage trend

### 8. **Hệ Sinh Thái** (Ecosystem Overview)
```
┌──────────────────────────────────────────────┐
│  🏢 TỔ CHỨC                                   │
│  Tập đoàn TuBep Pro                          │
│  ├─ Khối Sản xuất:    3 công ty              │
│  ├─ Khối Kinh doanh:  2 công ty              │
│  └─ Khối Hỗ trợ:      1 công ty              │
│                                               │
│  Total: 45 departments, 230 employees        │
└──────────────────────────────────────────────┘
```

### 9. **Activity Feed** (Real-time Updates)
```
┌──────────────────────────────────────────────┐
│  📢 HOẠT ĐỘNG GẦN ĐÂY                         │
│  🟢 2 phút - Dự án TB-2026-045 → Sản xuất    │
│  🔵 5 phút - Task "Thiết kế 3D" hoàn thành   │
│  🟡 10 phút - Khách hàng mới: ABC Corp       │
│  🟠 15 phút - Approval request #234          │
└──────────────────────────────────────────────┘
```

**Nguồn:**
- activity_logs table
- Real-time via Socket.IO
- Filter by entity_type

---

## 🎨 Layout Design

### Desktop (Wide Screen)
```
┌────────────────────────────────────────────────────────┐
│  Header: Dashboard - TuBep Pro    [Filters] [Period]   │
├────────────────────────────────────────────────────────┤
│  [KPI 1]  [KPI 2]  [KPI 3]  [KPI 4]                   │ ← Section 1
├─────────────────────────┬──────────────────────────────┤
│  📊 Production Pipeline │  ⚠️ Alerts & Warnings        │ ← Section 2 & 5
│                         │                              │
├─────────────────────────┴──────────────────────────────┤
│  📈 Timeline Charts (Dự án / Tasks)                    │ ← Section 3
├─────────────────────────┬──────────────────────────────┤
│  👥 Team Performance    │  🏆 Customer Insights        │ ← Section 4 & 6
├─────────────────────────┴──────────────────────────────┤
│  📢 Activity Feed (Real-time)                          │ ← Section 9
└────────────────────────────────────────────────────────┘
```

### Tablet/Mobile (Responsive)
```
┌──────────────────┐
│  [KPI Cards]     │
│  (2x2 grid)      │
├──────────────────┤
│  Pipeline        │
├──────────────────┤
│  Alerts          │
├──────────────────┤
│  Charts          │
│  (stacked)       │
├──────────────────┤
│  Team            │
├──────────────────┤
│  Activity Feed   │
└──────────────────┘
```

---

## 🔧 Technical Implementation

### API Endpoints Cần Tạo

#### `/api/dashboard/overview`
```json
{
  "projects": {
    "total": 156,
    "active": 89,
    "completed": 54,
    "growth": 12,
    "overdue": 5
  },
  "tasks": {
    "total": 2340,
    "completed": 2089,
    "completion_rate": 89.3,
    "overdue": 8,
    "blocked": 3
  },
  "customers": {
    "total": 254,
    "new_7d": 12,
    "vip": 45,
    "return_rate": 68.5
  },
  "revenue": {
    "total": 15600000000,
    "growth_pct": 12.5,
    "avg_project_value": 100000000
  }
}
```

#### `/api/dashboard/pipeline`
```json
{
  "stages": [
    {
      "id": "uuid",
      "name": "Tư vấn",
      "slug": "consulting",
      "color": "#3b82f6",
      "count": 25,
      "value": 2500000000,
      "avg_duration_days": 7
    }
  ]
}
```

#### `/api/dashboard/timeline?period=6m`
```json
{
  "projects": [
    { "month": "2026-03", "created": 28, "completed": 24, "cancelled": 1 }
  ],
  "revenue": [
    { "month": "2026-03", "value": 2800000000 }
  ]
}
```

#### `/api/dashboard/team?period=7d`
```json
{
  "performers": [
    {
      "user_id": "uuid",
      "name": "Nguyễn Văn A",
      "avatar": "url",
      "tasks_completed": 48,
      "projects_owned": 5,
      "avg_completion_hours": 18.5,
      "rating": 4.8
    }
  ]
}
```

#### `/api/dashboard/alerts`
```json
{
  "overdue_projects": 5,
  "overdue_tasks": 8,
  "pending_approvals": 12,
  "unassigned_high_priority": 3,
  "resource_overload": 2
}
```

#### `/api/dashboard/customers`
```json
{
  "top_customers": [
    {
      "id": "uuid",
      "name": "ABC Corp",
      "projects_count": 12,
      "total_value": 1200000000,
      "avg_value": 100000000
    }
  ],
  "geo_distribution": {
    "HCM": 65,
    "HN": 20,
    "DN": 10,
    "Other": 5
  }
}
```

---

## 🎨 UI Components Cần Tạo

### 1. `DashboardKPI.jsx`
- 4 KPI cards với animation
- Icon + value + trend indicator
- Click to drill down

### 2. `PipelineChart.jsx`
- Horizontal bar chart
- Color-coded by stage
- Hover tooltip (count, value, avg duration)

### 3. `TimelineChart.jsx`
- Line chart (projects/revenue over time)
- Recharts or Chart.js
- Period selector (7d, 30d, 3m, 6m, 1y)

### 4. `TeamLeaderboard.jsx`
- Top performers list
- Avatar + name + metrics
- Star rating
- Click to view profile

### 5. `AlertsWidget.jsx`
- List of warnings
- Color-coded by severity
- Click to navigate to entity
- Badge count

### 6. `CustomerInsights.jsx`
- Top customers table
- Geo distribution pie chart
- VIP/Loyal/New segments

### 7. `ActivityFeed.jsx`
- Real-time activity stream
- Socket.IO integration
- Filter by entity type
- Infinite scroll

### 8. `DashboardFilters.jsx`
- Date range picker
- Company filter
- Division filter
- Export buttons (PDF, Excel)

---

## 📈 Advanced Features

### 1. **Predictive Analytics**
- Dự đoán thời gian hoàn thành dự án (ML model)
- Cảnh báo khả năng trễ deadline
- Suggest resource allocation

### 2. **Comparisons**
- So sánh tháng này vs tháng trước
- So sánh giữa các công ty
- So sánh team performance

### 3. **Custom Dashboards**
- User có thể tùy chỉnh widget
- Drag & drop layout
- Save custom views

### 4. **Export & Reports**
- Export to PDF
- Excel/CSV download
- Scheduled email reports

### 5. **Real-time Updates**
- Socket.IO for live data
- Auto-refresh every 60s
- Notification badge

---

## 🚀 Implementation Plan

### Phase 1: Core Metrics (Week 1)
- ✅ KPIs overview API
- ✅ Pipeline chart
- ✅ Basic layout
- ✅ Responsive design

### Phase 2: Charts & Insights (Week 2)
- ✅ Timeline charts
- ✅ Team performance
- ✅ Customer insights
- ✅ Alerts widget

### Phase 3: Real-time & Advanced (Week 3)
- ✅ Activity feed
- ✅ Socket.IO integration
- ✅ Filters & period selector
- ✅ Export functions

### Phase 4: Polish & Optimize (Week 4)
- ✅ Animation & transitions
- ✅ Mobile optimization
- ✅ Performance tuning
- ✅ Caching strategy

---

## 🎯 Success Metrics
- Load time < 2s
- Real-time updates < 500ms latency
- Mobile responsive (100% features)
- User engagement (daily active users)
- Actionable insights (click-through rate)

---

**Next Steps:**
1. Approve design
2. Create backend API routes
3. Build frontend components
4. Test with real data
5. Deploy & monitor
