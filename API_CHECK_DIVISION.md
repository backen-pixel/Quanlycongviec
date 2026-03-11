# Kiểm tra API & Dữ liệu Khối

## 1. Kiểm tra Backend API

### Endpoint 1: `/api/divisions/:divisionId/projects-overview`
**Logic:**
```javascript
// Bước 1: Lấy assignments theo division_unit_id
SELECT * FROM project_company_assignments 
WHERE division_unit_id = :divisionId

// Bước 2: Lấy tasks của các project đó
SELECT * FROM tasks 
WHERE project_id IN (các project_id từ bước 1)

// Bước 3: Group tasks theo project, tính stats
```

**Test:**
```bash
# Lấy division_id trước
curl http://localhost:4000/api/ecosystem/units | jq '.units[] | select(.code=="KD") | .id'

# Test API (thay <division-id>)
curl http://localhost:4000/api/divisions/<division-id>/projects-overview
```

**Response mong đợi:**
```json
{
  "projects": [
    {
      "assignment_id": "...",
      "project": { "id": "...", "name": "Dự án A", ... },
      "division": { "id": "...", "name": "Khối Kinh doanh", "code": "KD" },
      "company": { ... },
      "tasks": [ ... ],
      "stats": {
        "total": 10,
        "completed": 5,
        "in_progress": 3,
        "pending": 2,
        "overdue": 1,
        "completion_rate": 50
      }
    }
  ]
}
```

---

### Endpoint 2: `/api/divisions/:divisionId/task-summary`
**Logic:**
```javascript
// Bước 1: Lấy project_ids theo division_unit_id
SELECT project_id FROM project_company_assignments 
WHERE division_unit_id = :divisionId

// Bước 2: Lấy tasks + tính tổng hợp
SELECT * FROM tasks WHERE project_id IN (...)
GROUP BY status, priority
```

**Test:**
```bash
curl http://localhost:4000/api/divisions/<division-id>/task-summary
```

**Response mong đợi:**
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

## 2. Kiểm tra Dữ liệu Database

### Chạy SQL Script Kiểm tra
1. Vào **Supabase SQL Editor**
2. Copy file `backend/supabase/20_check_division_data.sql`
3. **Run** để xem:
   - ✅ 4 Khối đã tạo
   - ✅ Danh sách dự án hiện có
   - ✅ Dự án đã gán cho Khối (trong `project_company_assignments`)
   - ✅ Số tasks theo từng Khối

### Kết quả mong đợi:

#### Bước 1: Danh sách 4 Khối
```
📊 DANH SÁCH 4 KHỐI:
code | name                  | icon | description
-----|----------------------|------|----------------------------------
KD   | Khối Kinh doanh      | 💼   | Tư vấn, Thiết kế, Báo giá...
SX   | Khối Sản xuất        | 🏭   | Lên KH, Vật tư, SX thùng...
VC   | Khối Vận chuyển      | 🚛   | Vận chuyển hàng...
LD   | Khối Lắp đặt & CSKH  | 🔧   | Lắp đặt, Nghiệm thu...
```

#### Bước 2: Kiểm tra gán dự án
```
🔗 DỰ ÁN ĐÃ GÁN CHO KHỐI:
project_name         | division_name       | company_name
---------------------|--------------------|--------------
Dự án Tủ bếp A      | Khối Kinh doanh    | NULL
Dự án Tủ bếp B      | Khối Sản xuất      | NULL
```

#### Bước 3: Đếm tasks theo Khối
```
📝 TASKS THEO KHỐI:
division_code | total_projects | total_tasks | completed | in_progress
--------------|---------------|-------------|-----------|------------
KD            | 2             | 15          | 8         | 5
SX            | 1             | 10          | 6         | 3
VC            | 0             | 0           | 0         | 0
LD            | 0             | 0           | 0         | 0
```

---

## 3. Vấn đề nếu không có dữ liệu

### ❌ Nếu `project_company_assignments` trống:

**Nguyên nhân:**
- Chưa có dự án nào được gán cho Khối
- Bảng `project_company_assignments` chưa có dữ liệu

**Giải pháp:**

#### Option 1: Tạo dữ liệu mẫu (Chạy SQL)
Uncomment phần `DO $$` trong file `20_check_division_data.sql`:

```sql
-- Gán 3 dự án đầu tiên cho 3 Khối
DO $$
DECLARE
  division_kd_id UUID;
  project1_id UUID;
BEGIN
  SELECT id INTO division_kd_id FROM ecosystem_units WHERE code = 'KD' ...
  SELECT id INTO project1_id FROM projects ORDER BY created_at DESC LIMIT 1;
  
  INSERT INTO project_company_assignments (project_id, division_unit_id, ...)
  VALUES (project1_id, division_kd_id, ...);
END $$;
```

#### Option 2: Gán thủ công qua Frontend
1. Tạo dự án mới (hoặc chỉnh sửa dự án cũ)
2. Vào tab **"Luồng"** (Project Flow)
3. Click **"Gán Công ty cho Khối"**
4. Chọn Khối → Chọn Công ty (hoặc NULL)
5. Save

#### Option 3: Gán trực tiếp SQL
```sql
-- Gán dự án ID 'abc-123' cho Khối Kinh doanh
INSERT INTO project_company_assignments (
  project_id, 
  division_unit_id, 
  company_unit_id, 
  assigned_at
)
VALUES (
  'abc-123', 
  (SELECT id FROM ecosystem_units WHERE code = 'KD'), 
  NULL, 
  NOW()
);
```

---

## 4. Test Flow End-to-End

### Bước 1: Tạo 4 Khối
✅ Đã làm (file `19_create_4_divisions_users.sql`)

### Bước 2: Gán dự án cho Khối
```sql
-- Ví dụ: Gán 3 dự án đầu cho 3 Khối
INSERT INTO project_company_assignments (project_id, division_unit_id, company_unit_id)
SELECT id, (SELECT id FROM ecosystem_units WHERE code = 'KD'), NULL
FROM projects ORDER BY created_at DESC LIMIT 1;

INSERT INTO project_company_assignments (project_id, division_unit_id, company_unit_id)
SELECT id, (SELECT id FROM ecosystem_units WHERE code = 'SX'), NULL
FROM projects ORDER BY created_at DESC LIMIT 1 OFFSET 1;

INSERT INTO project_company_assignments (project_id, division_unit_id, company_unit_id)
SELECT id, (SELECT id FROM ecosystem_units WHERE code = 'VC'), NULL
FROM projects ORDER BY created_at DESC LIMIT 1 OFFSET 2;
```

### Bước 3: Test API
```bash
# Lấy division_id của Khối Kinh doanh
curl https://tubep-backend.onrender.com/api/ecosystem/units \
  -H "Authorization: Bearer <token>" | jq '.units[] | select(.code=="KD")'

# Test projects-overview
curl https://tubep-backend.onrender.com/api/divisions/<kd-id>/projects-overview \
  -H "Authorization: Bearer <token>"

# Test task-summary
curl https://tubep-backend.onrender.com/api/divisions/<kd-id>/task-summary \
  -H "Authorization: Bearer <token>"
```

### Bước 4: Login Frontend
```
Email: kinhdoanh@tubep.vn
Password: admin123
URL: https://tubep-frontend-s30w.onrender.com/divisions/<kd-id>
```

**Kết quả mong đợi:**
- 4 KPI cards hiển thị số liệu đúng
- Recent projects hiển thị dự án đã gán
- Click "Xem tất cả" → Xem chi tiết tasks

---

## 5. Debug Checklist

### ✅ Backend
- [ ] Route `/api/divisions` đã mount trong `server.js`
- [ ] File `routes/divisions.js` tồn tại
- [ ] Backend đã deploy lên Render thành công
- [ ] Test endpoint với Postman/curl → Response 200

### ✅ Database
- [ ] Bảng `project_company_assignments` có dữ liệu
- [ ] `division_unit_id` FK đúng với `ecosystem_units.id`
- [ ] Dự án có tasks (bảng `tasks`)

### ✅ Frontend
- [ ] Component `DivisionDashboardSimple` đã import
- [ ] Route `/divisions/:divisionId` đúng
- [ ] API call dùng `divisionId` từ URL params
- [ ] Frontend đã deploy lên Render

### ✅ Auth
- [ ] User đã login thành công
- [ ] Token hợp lệ trong localStorage
- [ ] API headers có `Authorization: Bearer <token>`

---

## 6. Kết luận

### API đã đúng ✅
- `/api/divisions/:id/projects-overview` ✅
- `/api/divisions/:id/task-summary` ✅
- Logic lọc theo `division_unit_id` đúng ✅

### Cần kiểm tra:
1. **Dữ liệu**: Bảng `project_company_assignments` có dự án gán cho Khối chưa?
2. **Backend deploy**: API đã live trên Render chưa?
3. **Frontend deploy**: DivisionDashboardSimple đã deploy chưa?

**Next step:** Chạy file `20_check_division_data.sql` để xem có dữ liệu không!
