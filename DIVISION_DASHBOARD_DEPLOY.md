# Hướng Dẫn Deploy Division Dashboard System

## ✅ Đã Hoàn Thành

### **Backend:**
- ✅ Migration `27_division_dashboard.sql` (division_projects, division_members tables)
- ✅ API routes: `/api/divisions` (GET), `/api/divisions/:id/dashboard` (GET)
- ✅ Generic KPI calculation (projects, tasks, members, progress)
- ✅ Alerts system (overdue projects/tasks, unassigned, blocked)

### **Frontend:**
- ✅ DivisionsListPage: Grid cards với stats (projects, tasks, members, alerts)
- ✅ DivisionDashboard: Single template cho mọi khối
  - 4 KPI cards (Dự án, Công việc, Nhân sự, Tiến độ)
  - Project list với filter (all/active/completed)
  - Task Kanban (Todo/Doing/Done)
  - Alerts widget
- ✅ Routes: `/divisions`, `/divisions/:divisionId`
- ✅ Build: 3.63s (1063KB JS bundle)

---

## 🚀 Deployment Steps

### **1. Deploy Backend (Render)**

Backend tự động deploy khi push. Check logs:
```
https://dashboard.render.com/web/srv-...
```

**Verify API:**
```bash
curl https://tubep-backend.onrender.com/api/divisions \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Expected: `{ divisions: [...] }`

---

### **2. Run Database Migration**

Connect to Supabase và chạy migration:

```bash
# Via Supabase Dashboard → SQL Editor
# Copy nội dung từ backend/supabase/27_division_dashboard.sql
```

**Hoặc CLI:**
```bash
psql "postgresql://postgres.kdxypztstbeovyedmvem:[YOUR_PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres" \
  -f backend/supabase/27_division_dashboard.sql
```

**Verify:**
```sql
-- Check tables created
SELECT table_name FROM information_schema.tables 
WHERE table_name IN ('division_projects', 'division_members');

-- Check divisions
SELECT name, slug, icon FROM ecosystem_units
WHERE level_id = (SELECT id FROM ecosystem_levels WHERE slug = 'division');

-- Check project assignments (auto-assigned by migration)
SELECT 
  eu.name as division_name,
  COUNT(dp.project_id) as project_count
FROM ecosystem_units eu
LEFT JOIN division_projects dp ON dp.division_id = eu.id
WHERE eu.level_id = (SELECT id FROM ecosystem_levels WHERE slug = 'division')
GROUP BY eu.id, eu.name;
```

---

### **3. Deploy Frontend (Render)**

Frontend cũng tự động deploy. Wait 2-3 minutes.

**Verify:**
```
https://tubep-frontend-s30w.onrender.com/divisions
```

Bạn sẽ thấy danh sách khối (nếu có dữ liệu trong ecosystem_units).

---

## 📊 Test Flow

### **Test Case 1: Xem danh sách khối**

1. Login: `admin@tubep.vn` / `admin123`
2. Navigate: `https://tubep-frontend-s30w.onrender.com/divisions`
3. **Expected:**
   - Grid của các khối (nếu có dữ liệu)
   - Mỗi card hiển thị: icon, tên, stats (projects, tasks, members, alerts)
   - Click card → Navigate to `/divisions/:id`

**Nếu trống:**
- Cần tạo khối từ Ecosystem page trước
- Hoặc chạy SEED_ECOSYSTEM.sql để tạo dữ liệu mẫu

---

### **Test Case 2: Xem dashboard khối**

1. Click vào 1 khối (ví dụ: 🏭 Khối Sản xuất)
2. URL: `/divisions/{uuid}`
3. **Expected:**
   - Header: Icon + tên khối
   - 4 KPI cards (Dự án, Công việc, Nhân sự, Tiến độ)
   - Danh sách dự án (nếu có project assigned to division)
   - Task Kanban (Todo/Doing/Done)
   - Alerts widget (cảnh báo quá hạn, chưa giao, etc.)

**Nếu trống:**
- Khối chưa có dự án → Cần assign projects to division
- Xem bước 4 bên dưới

---

### **Test Case 3: Filter projects**

1. Trong DivisionDashboard, click dropdown filter
2. Select: "Đang làm" hoặc "Hoàn thành"
3. **Expected:** Project list tự động filter

---

### **Test Case 4: Assign project to division (Manual)**

**Via Supabase SQL Editor:**
```sql
-- Get division ID
SELECT id, name FROM ecosystem_units 
WHERE level_id = (SELECT id FROM ecosystem_levels WHERE slug = 'division');

-- Get project IDs
SELECT id, code, name FROM projects LIMIT 5;

-- Assign project to division
INSERT INTO division_projects (division_id, project_id, role)
VALUES (
  'YOUR_DIVISION_UUID',
  'YOUR_PROJECT_UUID',
  'owner'
);
```

Refresh dashboard → Dự án sẽ hiển thị!

---

## 🛠️ Troubleshooting

### **Issue 1: "Division not found" 404**

**Cause:** Division UUID không tồn tại hoặc không phải level = 'Khối'

**Fix:**
```sql
-- Check divisions
SELECT id, name, slug FROM ecosystem_units
WHERE level_id = (SELECT id FROM ecosystem_levels WHERE slug = 'division');
```

Nếu trống → Tạo khối từ Ecosystem page hoặc chạy SEED_ECOSYSTEM.sql

---

### **Issue 2: Dashboard trống (no projects/tasks)**

**Cause:** Khối chưa có dự án assign

**Fix 1: Auto-assign (chạy lại phần cuối migration)**
```sql
-- Production projects → Production division
INSERT INTO division_projects (division_id, project_id, role)
SELECT 
  (SELECT id FROM ecosystem_units WHERE slug = 'production-division'),
  p.id,
  'owner'
FROM projects p
WHERE p.status IN ('producing')
ON CONFLICT (division_id, project_id) DO NOTHING;
```

**Fix 2: Manual assign** (xem Test Case 4)

---

### **Issue 3: API 401 Unauthorized**

**Cause:** Token expired hoặc không có trong header

**Fix:**
- Logout → Login lại
- Check localStorage: `localStorage.getItem('token')`

---

### **Issue 4: Frontend build warning (1063KB bundle)**

**Not critical** — Vẫn chạy được, chỉ là warning.

**Future fix:** Code-splitting with React.lazy()
```jsx
const DivisionDashboard = React.lazy(() => import('./pages/DivisionDashboard'));
```

---

## 📁 Created Files

```
backend/
├── src/routes/divisions.js          (11KB, 320 lines)
└── supabase/27_division_dashboard.sql (6KB, 185 lines)

frontend/
└── src/pages/
    ├── DivisionsListPage.jsx        (4.4KB, 140 lines)
    └── DivisionDashboard.jsx        (14.5KB, 450 lines)
```

---

## 🔗 API Endpoints

### **GET /api/divisions**
List all divisions with stats

**Response:**
```json
{
  "divisions": [
    {
      "id": "uuid",
      "name": "Khối Sản xuất",
      "slug": "production-division",
      "icon": "🏭",
      "color": "#F59E0B",
      "stats": {
        "projects": 12,
        "tasks": 45,
        "members": 8,
        "alerts": 3
      }
    }
  ]
}
```

---

### **GET /api/divisions/:divisionId/dashboard**
Dashboard data for specific division

**Response:**
```json
{
  "division": { "id": "...", "name": "...", ... },
  "kpis": {
    "projects": { "total": 12, "active": 8, "completed": 4, "overdue": 2 },
    "tasks": { "total": 45, "completed": 30, "completion_rate": 66.7 },
    "members": { "total": 8 },
    "progress": 66.7
  },
  "projects": [ {...}, {...} ],
  "tasks": [ {...}, {...} ],
  "members": [ {...}, {...} ],
  "alerts": {
    "overdue_projects": 2,
    "overdue_tasks": 5,
    "unassigned_tasks": 3,
    "blocked_tasks": 1
  }
}
```

---

## 🎯 Next Steps (Optional Enhancements)

### **1. Add Menu Item**
Update Sidebar.jsx:
```jsx
<NavItem to="/divisions" icon={Building2} label="Quản Lý Theo Khối" />
```

### **2. Admin UI: Assign Projects**
Create page để assign/unassign projects từ UI (thay vì SQL)

### **3. Member Management**
Add UI để add/remove members từ division

### **4. Dashboard Charts**
Add trend charts (progress over time, project completion rate)

### **5. Export Reports**
Export division dashboard to PDF/Excel

---

## ✅ Verification Checklist

- [ ] Migration chạy thành công (tables created)
- [ ] Backend API trả về data `/api/divisions`
- [ ] Frontend build thành công (no errors)
- [ ] `/divisions` page hiển thị danh sách khối
- [ ] Click vào khối → Navigate to `/divisions/:id`
- [ ] Dashboard hiển thị KPIs, projects, tasks, alerts
- [ ] Filter projects works (all/active/completed)
- [ ] No console errors

---

## 🎉 Success Criteria

**Hệ thống thành công khi:**
1. ✅ Có thể xem danh sách tất cả khối
2. ✅ Click vào khối → Xem dashboard chi tiết
3. ✅ Dashboard hiển thị dữ liệu đúng (projects, tasks của khối đó)
4. ✅ Thêm khối mới → Tự động có dashboard (không cần code)
5. ✅ Assign project → Tự động hiện trong dashboard khối đó

---

**Git commit:** `9d5d8b5`  
**Deploy status:** Pending (wait for Render auto-deploy)  
**Estimated deploy time:** 2-3 minutes
