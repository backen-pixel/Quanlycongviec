# 📊 Dashboard Chính - Phân quyền Thông minh

## 🎯 Concept

**Thay vì:** Dashboard riêng cho từng Khối  
**Bây giờ:** **Dashboard CHÍNH duy nhất** với phân quyền tự động

### Logic phân quyền:

```
┌──────────────────────────────────────────┐
│ User login → Xác định vai trò            │
└──────────────────────────────────────────┘
           │
           ↓
    ┌─────────────┐
    │ Vai trò?    │
    └─────────────┘
           │
      ┌────┴────┐
      │         │
      ↓         ↓
┌──────────┐  ┌──────────────────┐
│ Giám đốc │  │ Nhân viên thường │
│ Quản lý  │  └──────────────────┘
│ Giám sát │            │
└──────────┘            ↓
      │        ┌─────────────────┐
      ↓        │ CHỈ XEM:        │
┌─────────────────┐  │ - Dự án tạo     │
│ XEM TẤT CẢ +    │  │ - Dự án có task │
│ FILTER:         │  │   được giao     │
│ - Tất cả        │  └─────────────────┘
│ - Theo Khối     │
│ - Theo Công ty  │
│ - Theo Phòng ban│
│ - Của tôi       │
└─────────────────┘
```

---

## 📋 API Endpoints

### 1️⃣ GET `/api/dashboard-main`
**Lấy dashboard đầy đủ với phân quyền tự động**

**Query params:**
- `filter`: `all` | `division` | `company` | `department` | `mine`

**Logic:**
```javascript
// 1. Lấy user info (role, department, company, division)
// 2. Kiểm tra vai trò
if (hasFullAccess) {
  // Giám đốc/Quản lý/Giám sát
  if (filter === 'division') {
    // Lọc theo Khối
  } else if (filter === 'company') {
    // Lọc theo Công ty
  } else if (filter === 'department') {
    // Lọc theo Phòng ban
  } else {
    // Tất cả dự án
  }
} else {
  // Nhân viên thường
  // CHỈ dự án của mình (tạo hoặc có task)
}

// 3. Lấy projects + tasks
// 4. Tính stats
// 5. Response
```

**Response:**
```json
{
  "user": {
    "id": "...",
    "name": "Nguyễn Văn A",
    "email": "a@company.vn",
    "role": "manager",
    "department": "Kinh doanh",
    "company": "Công ty A",
    "has_full_access": true
  },
  "stats": {
    "total_projects": 50,
    "active_projects": 30,
    "completed_projects": 20,
    "total_tasks": 200,
    "my_tasks": 15,
    "completed_tasks": 100,
    "in_progress_tasks": 80,
    "pending_tasks": 20,
    "overdue_tasks": 5,
    "my_overdue_tasks": 2
  },
  "projects": [
    {
      "id": "...",
      "name": "Dự án A",
      "status": "in-progress",
      "task_count": 20,
      "my_task_count": 5,
      "completed_tasks": 10,
      "overdue_tasks": 1
    }
  ],
  "filters": {
    "current": "all",
    "available": ["all", "division", "company", "department", "mine"]
  }
}
```

---

### 2️⃣ GET `/api/dashboard-main/stats`
**Chỉ lấy thống kê (nhanh hơn)**

**Response:**
```json
{
  "total_projects": 50,
  "total_tasks": 200,
  "my_tasks": 15,
  "completed_tasks": 100,
  "in_progress_tasks": 80,
  "pending_tasks": 20,
  "overdue_tasks": 5,
  "my_overdue_tasks": 2
}
```

---

## 🔐 Vai trò & Quyền

### Vai trò có full access:
- ✅ `admin` - Quản trị viên
- ✅ `director` - Giám đốc
- ✅ `manager` - Quản lý
- ✅ `supervisor` - Giám sát

**Quyền:**
- Xem tất cả dự án
- Filter theo: Tất cả, Khối, Công ty, Phòng ban, Của tôi

### Vai trò restricted:
- ❌ `employee` - Nhân viên thường
- ❌ `staff` - Nhân viên
- ❌ Bất kỳ role nào khác

**Quyền:**
- Chỉ xem dự án của mình:
  - Dự án mình tạo (`created_by = userId`)
  - Dự án có task được giao (`tasks.assigned_to = userId`)
- Không có filter (chỉ có "Của tôi")

---

## 🎨 Frontend Implementation

### Component: DashboardMain.jsx

```javascript
import { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth';
import api from '../lib/api';

export default function DashboardMain() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, [filter]);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/dashboard-main?filter=${filter}`);
      setData(res.data);
    } catch (error) {
      console.error('Load dashboard error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!data) return <Loading />;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1>Dashboard - {data.user.name}</h1>
        <p>Vai trò: {data.user.role} | {data.user.department}</p>
      </div>

      {/* Filter (nếu có quyền) */}
      {data.user.has_full_access && (
        <div className="mb-6">
          <select 
            value={filter} 
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">Tất cả dự án</option>
            <option value="division">Theo Khối</option>
            <option value="company">Theo Công ty</option>
            <option value="department">Theo Phòng ban</option>
            <option value="mine">Của tôi</option>
          </select>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard title="Dự án" value={data.stats.total_projects} />
        <StatCard title="Nhiệm vụ của tôi" value={data.stats.my_tasks} />
        <StatCard title="Hoàn thành" value={data.stats.completed_tasks} />
        <StatCard title="Quá hạn của tôi" value={data.stats.my_overdue_tasks} alert />
      </div>

      {/* Projects List */}
      <div>
        {data.projects.map(project => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </div>
  );
}
```

---

## 🔍 Ví dụ Phân quyền

### Ví dụ 1: Giám đốc
```
User: director@company.vn
Role: director
Department: Ban giám đốc
Company: Công ty A

→ has_full_access = true
→ Filters available: [all, division, company, department, mine]
→ Mặc định: Xem TẤT CẢ dự án
→ Có thể filter theo Khối, Công ty, Phòng ban
```

### Ví dụ 2: Quản lý Kinh doanh
```
User: kinhdoanh@tubep.vn
Role: manager
Department: Kinh doanh
Division: Khối Kinh doanh (KD)
Company: Công ty Kinh doanh Hà Nội

→ has_full_access = true
→ Filters available: [all, division, company, department, mine]
→ Filter = 'division': Chỉ dự án của Khối Kinh doanh
→ Filter = 'company': Chỉ dự án của Công ty Kinh doanh HN
```

### Ví dụ 3: Nhân viên Thiết kế
```
User: designer@tubep.vn
Role: employee
Department: Thiết kế
Company: Công ty Sản xuất

→ has_full_access = false
→ Filters available: [mine] (chỉ có 1 option)
→ Chỉ xem:
  - Dự án #123 (tạo bởi mình)
  - Dự án #456 (có task "Thiết kế 3D" assigned cho mình)
→ KHÔNG xem dự án khác
```

---

## 🛠️ Database Setup

### Cần có sẵn:
1. ✅ `users.role` - Vai trò
2. ✅ `users.department_id` - Phòng ban
3. ✅ `users.primary_division_id` - Khối (thêm nếu chưa có)
4. ✅ `departments.company_id` - Công ty

### Migration (nếu thiếu):
```sql
-- Thêm primary_division_id vào users (nếu chưa có)
ALTER TABLE users ADD COLUMN IF NOT EXISTS primary_division_id UUID REFERENCES ecosystem_units(id);

-- Update users với division dựa trên department
UPDATE users u
SET primary_division_id = (
  SELECT division_unit_id 
  FROM workflow_flow_steps wfs
  JOIN departments d ON d.id = u.department_id
  JOIN companies c ON c.id = d.company_id
  WHERE wfs.company_unit_id = c.id
  LIMIT 1
)
WHERE u.department_id IS NOT NULL;
```

---

## 🧪 Test Cases

### Test 1: Giám đốc xem tất cả
```bash
# Login as director
TOKEN=$(curl -X POST .../api/auth/login -d '{"email":"admin@tubep.vn","password":"admin123"}' | jq -r '.token')

# Get dashboard
curl .../api/dashboard-main?filter=all -H "Authorization: Bearer $TOKEN"

# Expected: Tất cả dự án
```

### Test 2: Quản lý lọc theo Khối
```bash
# Login as manager
TOKEN=$(...)

# Get dashboard - filter by division
curl .../api/dashboard-main?filter=division -H "Authorization: Bearer $TOKEN"

# Expected: Chỉ dự án của Khối
```

### Test 3: Nhân viên chỉ xem của mình
```bash
# Login as employee
TOKEN=$(...)

# Get dashboard (không cần filter, auto = 'mine')
curl .../api/dashboard-main -H "Authorization: Bearer $TOKEN"

# Expected: Chỉ dự án mình tạo/tham gia
```

---

## 🚀 Deploy

### Backend
1. Code đã push: `backend/src/routes/dashboardMain.js`
2. Route mounted: `app.use('/api/dashboard-main', ...)`
3. Deploy: Render auto-deploy hoặc manual

### Frontend
1. Tạo component: `DashboardMain.jsx`
2. Route: `/` hoặc `/dashboard`
3. Replace `DashboardNew.jsx` hiện tại

---

## ✅ Lợi ích

1. **Đơn giản hơn:** 1 dashboard thay vì nhiều dashboards
2. **Phân quyền tự động:** Không cần user chọn Khối
3. **Linh hoạt:** Giám đốc có thể filter, nhân viên tự động filter
4. **Bảo mật:** Nhân viên không thấy dự án khác
5. **UX tốt:** Mỗi user thấy đúng dữ liệu của mình

---

**File:** `backend/src/routes/dashboardMain.js` (10KB)  
**API:** `/api/dashboard-main` + `/api/dashboard-main/stats`
