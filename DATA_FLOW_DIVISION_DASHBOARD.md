# 📊 Luồng Lấy Dữ liệu Dashboard Khối

## 🎯 Tổng quan

Dashboard của mỗi Khối hiển thị:
- **Dự án** của Khối đó
- **Nhiệm vụ (Tasks)** trong các dự án
- **Thống kê**: Tổng số, hoàn thành, đang làm, quá hạn

---

## 🔍 Cấu trúc Database

```
┌─────────────────────┐
│ ecosystem_units     │  ← Bảng chứa 4 Khối (KD, SX, VC, LD)
│ - id (UUID)         │
│ - code (KD/SX...)   │
│ - name              │
└─────────────────────┘
          │
          │ division_unit_id (FK)
          ↓
┌─────────────────────────────┐
│ workflow_flow_steps         │  ← Bảng chứa các bước trong luồng
│ - id                        │
│ - flow_id (FK) ────────────┐│
│ - division_unit_id (FK)    ││  "Khối KD thuộc luồng X, bước 1"
│ - order_index (1,2,3,4)    ││
└─────────────────────────────┘│
          │                     │
          │                     │
          │                     │
          │              ┌──────┴──────────────┐
          │              │ workflow_flows      │  ← Bảng chứa luồng
          │              │ - id (UUID)         │
          │              │ - name              │
          │              │ - is_default        │
          │              └─────────────────────┘
          │                     │
          │                     │ flow_id (FK)
          │                     ↓
          │              ┌─────────────────────┐
          │              │ projects            │  ← Bảng dự án
          │              │ - id (UUID)         │
          │              │ - flow_id (FK)      │
          │              │ - name, status...   │
          │              └─────────────────────┘
          │                     │
          │                     │ project_id (FK)
          │                     ↓
          │              ┌─────────────────────┐
          │              │ tasks               │  ← Bảng nhiệm vụ
          │              │ - id (UUID)         │
          │              │ - project_id (FK)   │
          │              │ - status, priority  │
          │              └─────────────────────┘
          │
          └─────────────────────────────────────────┐
                                                    │
    Kết quả: Khối KD có những dự án nào? ←─────────┘
```

---

## 📋 API Endpoints Chi tiết

### 1️⃣ GET `/api/divisions`
**Mục đích:** Lấy danh sách tất cả các Khối

**SQL:**
```sql
SELECT id, name, code, icon, color, description
FROM ecosystem_units
WHERE level_id = (SELECT id FROM ecosystem_levels WHERE slug = 'division')
ORDER BY code;
```

**Response:**
```json
{
  "divisions": [
    { "id": "uuid-kd", "code": "KD", "name": "Khối Kinh doanh", "icon": "💼" },
    { "id": "uuid-sx", "code": "SX", "name": "Khối Sản xuất", "icon": "🏭" },
    { "id": "uuid-vc", "code": "VC", "name": "Khối Vận chuyển", "icon": "🚛" },
    { "id": "uuid-ld", "code": "LD", "name": "Khối Lắp đặt & CSKH", "icon": "🔧" }
  ]
}
```

---

### 2️⃣ GET `/api/divisions/:divisionId`
**Mục đích:** Lấy thông tin 1 Khối

**SQL:**
```sql
SELECT id, name, code, icon, color, description
FROM ecosystem_units
WHERE id = :divisionId;
```

**Response:**
```json
{
  "division": {
    "id": "uuid-kd",
    "code": "KD",
    "name": "Khối Kinh doanh",
    "icon": "💼",
    "description": "Tư vấn, Thiết kế, Báo giá, Hợp đồng"
  }
}
```

---

### 3️⃣ GET `/api/divisions/:divisionId/projects-overview`
**Mục đích:** Lấy tất cả dự án + nhiệm vụ của Khối

**Luồng xử lý:**

#### Bước 1: Tìm flows chứa Khối này
```sql
SELECT flow_id 
FROM workflow_flow_steps 
WHERE division_unit_id = :divisionId;
```

**Kết quả:** 
```
flow_id
--------
uuid-flow-1
uuid-flow-2
```

#### Bước 2: Lấy dự án dùng các flows đó
```sql
SELECT id, name, code, status, customer_name, flow_id
FROM projects 
WHERE flow_id IN ('uuid-flow-1', 'uuid-flow-2')
ORDER BY created_at DESC;
```

**Kết quả:**
```
id          | name            | flow_id
------------|-----------------|------------
uuid-p1     | Dự án A         | uuid-flow-1
uuid-p2     | Dự án B         | uuid-flow-1
uuid-p3     | Dự án C         | uuid-flow-2
```

#### Bước 3: Lấy tasks của các dự án
```sql
SELECT id, project_id, title, status, priority, due_date
FROM tasks
WHERE project_id IN ('uuid-p1', 'uuid-p2', 'uuid-p3')
ORDER BY created_at;
```

**Kết quả:**
```
id      | project_id | title           | status
--------|------------|-----------------|------------
task1   | uuid-p1    | Tư vấn khách    | done
task2   | uuid-p1    | Thiết kế 3D     | in-progress
task3   | uuid-p2    | Báo giá         | pending
```

#### Bước 4: Group tasks theo project + tính stats
```javascript
tasksByProject = {
  'uuid-p1': [task1, task2],
  'uuid-p2': [task3],
  'uuid-p3': []
}

// Tính stats cho mỗi project
stats = {
  total: 2,
  completed: 1,
  in_progress: 1,
  pending: 0,
  overdue: 0,
  completion_rate: 50  // (1/2) * 100
}
```

#### Bước 5: Response
```json
{
  "projects": [
    {
      "project": {
        "id": "uuid-p1",
        "name": "Dự án A",
        "status": "in-progress",
        "customer_name": "Ông Nguyễn"
      },
      "division": {
        "code": "KD",
        "name": "Khối Kinh doanh"
      },
      "tasks": [
        { "id": "task1", "title": "Tư vấn khách", "status": "done" },
        { "id": "task2", "title": "Thiết kế 3D", "status": "in-progress" }
      ],
      "stats": {
        "total": 2,
        "completed": 1,
        "in_progress": 1,
        "pending": 0,
        "overdue": 0,
        "completion_rate": 50
      }
    }
  ]
}
```

---

### 4️⃣ GET `/api/divisions/:divisionId/task-summary`
**Mục đích:** Tổng hợp thống kê tasks của Khối

**Luồng xử lý:**

```
Khối → flows → projects → tasks → count by status/priority
```

**SQL logic:**
```sql
-- Bước 1: Tìm flows
SELECT flow_id FROM workflow_flow_steps WHERE division_unit_id = :divisionId;

-- Bước 2: Tìm projects
SELECT id FROM projects WHERE flow_id IN (...);

-- Bước 3: Đếm tasks
SELECT 
  status,
  COUNT(*) as count
FROM tasks
WHERE project_id IN (...)
GROUP BY status;
```

**Response:**
```json
{
  "total": 50,
  "by_status": {
    "pending": 10,
    "in-progress": 20,
    "done": 20
  },
  "by_priority": {
    "low": 10,
    "medium": 30,
    "high": 8,
    "urgent": 2
  },
  "overdue": 3
}
```

---

## 🎨 Frontend: DivisionDashboardSimple

### Component load data như thế nào?

```javascript
// File: frontend/src/pages/DivisionDashboardSimple.jsx

const loadData = async () => {
  // 1. Lấy thông tin Khối
  const divisionRes = await api.get(`/ecosystem/units/${divisionId}`);
  setDivision(divisionRes.data.unit);

  // 2. Lấy tổng hợp tasks
  const summaryRes = await api.get(`/divisions/${divisionId}/task-summary`);
  setSummary(summaryRes.data);
  // → Dùng cho 4 KPI cards

  // 3. Lấy dự án + tasks chi tiết
  const projectsRes = await api.get(`/divisions/${divisionId}/projects-overview`);
  setProjects(projectsRes.data.projects || []);
  // → Dùng cho Recent Projects list
};
```

### Hiển thị Dashboard:

```jsx
{/* 4 KPI Cards */}
<KPICard title="Dự án" value={projects.length} />
<KPICard title="Nhiệm vụ" value={summary.total} />
<KPICard title="Tiến độ" value={completionRate + '%'} />
<KPICard title="Quá hạn" value={summary.overdue} />

{/* Recent Projects */}
{projects.slice(0, 5).map(item => (
  <ProjectCard 
    project={item.project}
    stats={item.stats}
    onClick={() => navigate(`/projects/${item.project.id}`)}
  />
))}
```

---

## 🧪 Test Flow

### 1. Kiểm tra Database

```sql
-- File: backend/supabase/30_check_division_workflow.sql

-- Kiểm tra Khối
SELECT * FROM ecosystem_units WHERE code = 'KD';

-- Kiểm tra Luồng
SELECT * FROM workflow_flows;

-- Kiểm tra Flow Steps
SELECT * FROM workflow_flow_steps WHERE division_unit_id = (
  SELECT id FROM ecosystem_units WHERE code = 'KD'
);

-- Kiểm tra Dự án
SELECT * FROM projects WHERE flow_id IN (
  SELECT flow_id FROM workflow_flow_steps WHERE division_unit_id = (...)
);

-- Kiểm tra Tasks
SELECT * FROM tasks WHERE project_id IN (...);
```

### 2. Test API (Postman/curl)

```bash
# Lấy danh sách Khối
curl http://localhost:4000/api/divisions \
  -H "Authorization: Bearer <token>"

# Lấy thông tin Khối KD
curl http://localhost:4000/api/divisions/<kd-id> \
  -H "Authorization: Bearer <token>"

# Lấy dự án + tasks của Khối KD
curl http://localhost:4000/api/divisions/<kd-id>/projects-overview \
  -H "Authorization: Bearer <token>"

# Lấy tổng hợp tasks của Khối KD
curl http://localhost:4000/api/divisions/<kd-id>/task-summary \
  -H "Authorization: Bearer <token>"
```

### 3. Test Frontend

```
1. Login: kinhdoanh@tubep.vn / admin123
2. URL: /divisions/<kd-id>
3. Kiểm tra:
   - 4 KPI cards hiển thị đúng số liệu
   - Recent projects hiển thị dự án
   - Click dự án → nhảy vào ProjectDetail
```

---

## ❓ FAQs

### Q1: Dashboard trống, không có dự án?

**Nguyên nhân:**
- Khối chưa có trong bất kỳ luồng nào (workflow_flow_steps)
- Hoặc không có dự án nào dùng luồng đó (projects.flow_id)

**Kiểm tra:**
```sql
-- Khối KD có trong luồng nào không?
SELECT wf.name, wfs.order_index
FROM workflow_flow_steps wfs
JOIN workflow_flows wf ON wfs.flow_id = wf.id
WHERE wfs.division_unit_id = (SELECT id FROM ecosystem_units WHERE code = 'KD');

-- Dự án nào dùng luồng đó?
SELECT p.name, p.status
FROM projects p
WHERE p.flow_id IN (
  SELECT flow_id FROM workflow_flow_steps WHERE division_unit_id = (...)
);
```

**Giải pháp:**
1. Tạo luồng mới (Workflow Hub)
2. Thêm Khối vào luồng
3. Tạo dự án mới chọn luồng đó

---

### Q2: API trả về lỗi 404?

**Nguyên nhân:**
- Route chưa được mount trong `server.js`
- Backend chưa deploy

**Kiểm tra:**
```javascript
// File: backend/src/server.js
app.use('/api/divisions', require('./routes/divisions'));
```

**Giải pháp:** Deploy backend lại

---

### Q3: Dữ liệu không đồng bộ?

**Nguyên nhân:**
- Cache browser
- Backend chưa restart

**Giải pháp:**
- Hard refresh (Ctrl+Shift+R)
- Clear cache
- Redeploy backend

---

## 🚀 Kết luận

**Luồng hoàn chỉnh:**
```
User login → Dashboard → API call → Database query → Response → Render UI
```

**Key points:**
1. ✅ Khối → workflow_flow_steps → workflow_flows → projects → tasks
2. ✅ Backend API: 3 endpoints chính
3. ✅ Frontend: Load data từ 2 API (task-summary + projects-overview)
4. ✅ Kiểm tra bằng SQL script trước khi test frontend

**Next step:** Chạy `30_check_division_workflow.sql` để verify data! 🎯
