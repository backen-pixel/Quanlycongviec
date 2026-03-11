# Hướng dẫn: Dashboard Khối & Luồng Công việc

## 🔍 Cấu trúc Database (Thực tế)

### Bảng chính:

1. **`ecosystem_units`** - Các đơn vị (Khối, Công ty, Phòng ban...)
   - `code`: KD, SX, VC, LD (4 Khối)

2. **`workflow_flows`** - Luồng công việc
   - Ví dụ: "Luồng Tủ Bếp Chuẩn"
   - `is_default`: Luồng mặc định khi tạo dự án

3. **`workflow_flow_steps`** - Các bước trong luồng
   - `flow_id` → workflow_flows
   - `division_unit_id` → ecosystem_units (Khối nào)
   - `company_unit_id` → ecosystem_units (Công ty nào - nullable)
   - `order_index`: Thứ tự (1, 2, 3, 4)

4. **`projects`** - Dự án
   - `flow_id` → workflow_flows (Dự án dùng luồng nào)

5. **`tasks`** - Nhiệm vụ
   - `project_id` → projects

### Logic lấy dữ liệu Khối:

```
Khối (division_id)
  ↓
workflow_flow_steps (WHERE division_unit_id = division_id)
  ↓
Lấy flow_ids
  ↓
projects (WHERE flow_id IN (...flow_ids))
  ↓
tasks (WHERE project_id IN (...project_ids))
```

---

## 📊 API Endpoints

### 1. `/api/divisions/:divisionId/projects-overview`

**Lấy tất cả dự án + nhiệm vụ của Khối**

**Logic:**
```sql
-- Bước 1: Lấy flows chứa Khối này
SELECT flow_id FROM workflow_flow_steps WHERE division_unit_id = :divisionId

-- Bước 2: Lấy projects dùng các flows đó
SELECT * FROM projects WHERE flow_id IN (...)

-- Bước 3: Lấy tasks của các projects
SELECT * FROM tasks WHERE project_id IN (...)

-- Bước 4: Group + tính stats
```

**Response:**
```json
{
  "projects": [
    {
      "project": { "id": "...", "name": "Dự án A", "status": "in-progress" },
      "division": { "code": "KD", "name": "Khối Kinh doanh" },
      "company": { "name": "Công ty A" },
      "tasks": [ ... ],
      "stats": {
        "total": 15,
        "completed": 8,
        "in_progress": 5,
        "pending": 2,
        "overdue": 1,
        "completion_rate": 53
      }
    }
  ]
}
```

### 2. `/api/divisions/:divisionId/task-summary`

**Tổng hợp thống kê tasks**

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

## 🧪 Kiểm tra Dữ liệu

### Chạy SQL Script:

1. Vào **Supabase SQL Editor**
2. Copy file: `backend/supabase/30_check_division_workflow.sql`
3. **Run**

### Kết quả mong đợi:

#### ✅ Danh sách 4 Khối:
```
code | name                  | icon
-----|----------------------|------
KD   | Khối Kinh doanh      | 💼
SX   | Khối Sản xuất        | 🏭
VC   | Khối Vận chuyển      | 🚛
LD   | Khối Lắp đặt & CSKH  | 🔧
```

#### ✅ Luồng công việc:
```
name                   | is_default | is_active
-----------------------|-----------|----------
Luồng Tủ Bếp Chuẩn    | true      | true
```

#### ✅ Các bước trong luồng:
```
flow_name           | order | division_code | division_name
--------------------|-------|---------------|------------------
Luồng Tủ Bếp Chuẩn  | 1     | KD            | Khối Kinh doanh
Luồng Tủ Bếp Chuẩn  | 2     | SX            | Khối Sản xuất
Luồng Tủ Bếp Chuẩn  | 3     | VC            | Khối Vận chuyển
Luồng Tủ Bếp Chuẩn  | 4     | LD            | Khối Lắp đặt
```

#### ✅ Dự án & Luồng:
```
project_name         | flow_name           | project_status
---------------------|--------------------|--------------
Dự án Tủ bếp A      | Luồng Tủ Bếp Chuẩn  | in-progress
Dự án Tủ bếp B      | Luồng Tủ Bếp Chuẩn  | planning
```

#### ✅ Dự án & Tasks theo Khối:
```
division | total_projects | total_tasks | completed | in_progress
---------|---------------|-------------|-----------|------------
KD       | 5             | 25          | 12        | 10
SX       | 4             | 20          | 10        | 8
VC       | 3             | 15          | 8         | 5
LD       | 2             | 10          | 5         | 3
```

---

## ⚠️ Nếu không có dữ liệu

### Vấn đề 1: Dự án chưa có luồng (`flow_id IS NULL`)

**Kiểm tra:**
```sql
SELECT * FROM projects WHERE flow_id IS NULL;
```

**Giải pháp:** Uncomment phần cuối trong `30_check_division_workflow.sql`:

```sql
-- Tạo luồng mẫu 4 bước
DO $$
DECLARE
  flow_id UUID;
  ...
BEGIN
  -- Tạo luồng: KD → SX → VC → LD
  INSERT INTO workflow_flows (name, ...) VALUES (...);
  INSERT INTO workflow_flow_steps (flow_id, division_unit_id, order_index) VALUES ...;
  
  -- Gán luồng cho các dự án chưa có
  UPDATE projects SET flow_id = flow_id WHERE flow_id IS NULL;
END $$;
```

### Vấn đề 2: Chưa có luồng nào

**Giải pháp:**
1. Vào **Frontend** → Menu "Workflow Hub" → Tab "Luồng"
2. Click **"Tạo luồng mới"**
3. Nhập tên: "Luồng Tủ Bếp Chuẩn"
4. Thêm 4 bước:
   - Bước 1: Khối Kinh doanh (KD) - 3 ngày
   - Bước 2: Khối Sản xuất (SX) - 7 ngày
   - Bước 3: Khối Vận chuyển (VC) - 1 ngày
   - Bước 4: Khối Lắp đặt (LD) - 2 ngày
5. **Save**

### Vấn đề 3: Dự án có luồng nhưng Dashboard trống

**Nguyên nhân:** Dự án có `flow_id` nhưng flow đó không chứa Khối bạn đang xem.

**Kiểm tra:**
```sql
-- Xem Khối KD có trong luồng nào
SELECT wf.name, wfs.order_index
FROM workflow_flow_steps wfs
JOIN workflow_flows wf ON wfs.flow_id = wf.id
WHERE wfs.division_unit_id = (
  SELECT id FROM ecosystem_units WHERE code = 'KD'
);
```

**Giải pháp:** Chỉnh sửa luồng, thêm Khối vào.

---

## 🎯 Test End-to-End

### Bước 1: Tạo 4 Khối ✅
```bash
# Đã tạo trong 19_create_4_divisions_users.sql
```

### Bước 2: Tạo Luồng 4 bước
```sql
-- Chạy phần uncommented trong 30_check_division_workflow.sql
```

### Bước 3: Tạo dự án mới với luồng
1. Vào **CreateProject**
2. Chọn **"Luồng Tủ Bếp Chuẩn"**
3. **Tạo dự án**

### Bước 4: Login & Xem Dashboard
```
Email: kinhdoanh@tubep.vn
Password: admin123
URL: /divisions/<kd-id>
```

**Kết quả:**
- 4 KPI cards hiển thị số liệu
- Recent projects hiển thị dự án vừa tạo
- Click "Xem tất cả" → Xem chi tiết tasks

---

## 🐛 Debug Checklist

### Backend
- [ ] File `routes/divisions.js` đã viết lại dùng `workflow_flows`
- [ ] API `/api/divisions/:id/projects-overview` trả về data
- [ ] Backend đã deploy lên Render

### Database
- [ ] Bảng `workflow_flows` có data
- [ ] Bảng `workflow_flow_steps` có 4 bước (KD, SX, VC, LD)
- [ ] Bảng `projects` có `flow_id` không NULL
- [ ] Bảng `tasks` có data

### Frontend
- [ ] Component `DivisionDashboardSimple` đúng
- [ ] API call `/divisions/:divisionId/projects-overview`
- [ ] Frontend đã deploy

---

## 📝 Kết luận

**Cấu trúc đúng:**
```
Khối → workflow_flow_steps → workflow_flows → projects → tasks
```

**KHÔNG dùng:**
- ❌ `project_company_assignments` (bảng này cho hệ thống khác)
- ❌ `division_projects` (từ migration cũ, không dùng nữa)

**Chạy ngay:** `30_check_division_workflow.sql` để kiểm tra! 🚀
