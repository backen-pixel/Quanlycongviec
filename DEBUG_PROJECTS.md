# DEBUG: Tại sao không thấy dự án?

## ✅ Đã sửa (commit a72ee21)

### Logic mới: 4 cách để nhân viên thấy dự án

Nhân viên sẽ thấy dự án nếu **BẤT KỲ** điều kiện nào sau đây đúng:

#### 1️⃣ **Admin/Manager/Director** → Thấy TẤT CẢ
```javascript
if (role === 'admin' || 'manager' || 'director') {
  // Xem tất cả projects, không filter
}
```

#### 2️⃣ **Có quyền ecosystem** → Thấy dự án của công ty mình quản lý
```javascript
if (hasEcosystemPermissions) {
  // Lấy company_ids từ ecosystem_units user có quyền
  // Hiển thị projects thuộc các công ty đó
}
```

#### 3️⃣ **Là thành viên team** → Thấy dự án mình tham gia
```javascript
if (isTeamMember) {
  // Hiển thị projects mà user là:
  // - created_by (người tạo)
  // - responsible_person_id (người chịu trách nhiệm)
  // - sales_person_id (nhân viên kinh doanh)
  // - designer_id (thiết kế)
  // - project_manager_id (quản lý dự án)
}
```

#### 4️⃣ **Được gán nhiệm vụ** → Thấy dự án có task của mình ⭐ MỚI
```javascript
if (hasAssignedTasks) {
  // Query tasks table: assignee_id = userId
  // Lấy tất cả project_ids
  // Hiển thị các projects đó
}
```

**Kết hợp:** Nếu user thỏa mãn nhiều điều kiện → thấy UNION của tất cả projects

---

## 🔍 Cách kiểm tra nếu vẫn không thấy dự án

### 1. Kiểm tra role của user
```sql
SELECT id, full_name, email, role 
FROM users 
WHERE email = 'your-email@example.com';
```

**Nếu role = `admin`, `manager`, hoặc `director`:**
→ Phải thấy TẤT CẢ projects (không filter)

**Nếu role khác (`employee`, `department_head`, ...):**
→ Chuyển bước 2

---

### 2. Kiểm tra user có permissions không
```sql
SELECT up.*, eu.name as unit_name, p.resource, p.action
FROM user_permissions up
JOIN ecosystem_units eu ON eu.id = up.ecosystem_unit_id
JOIN permissions p ON p.id = up.permission_id
WHERE up.user_id = 'YOUR_USER_ID'
  AND up.granted = true;
```

**Nếu có kết quả:**
→ User có permissions, backend sẽ lọc theo ecosystem units
→ Kiểm tra bước 3

**Nếu KHÔNG có kết quả:**
→ User chưa được gán permissions
→ Backend fallback: chỉ thấy projects mà user tham gia
→ Kiểm tra bước 4

---

### 3. Kiểm tra ecosystem_units có company_id không
```sql
SELECT eu.*, c.name as company_name
FROM ecosystem_units eu
LEFT JOIN companies c ON c.id = eu.company_id
WHERE eu.id IN (
  SELECT ecosystem_unit_id 
  FROM user_permissions 
  WHERE user_id = 'YOUR_USER_ID' 
    AND granted = true
);
```

**Nếu company_id = NULL:**
→ Unit chưa link với công ty
→ Backend không filter được
→ **FIX:** Link ecosystem_unit với company (update `ecosystem_units.company_id`)

**Nếu có company_id:**
→ Backend sẽ filter projects theo company_id này
→ Chuyển bước 5

---

### 4. Kiểm tra user có được gán task nào không ⭐
```sql
SELECT t.id, t.title, t.project_id, p.code, p.name
FROM tasks t
JOIN projects p ON p.id = t.project_id
WHERE t.assignee_id = 'YOUR_USER_ID';
```

**Nếu có kết quả:**
→ User được gán tasks
→ Backend sẽ tự động hiển thị các projects tương ứng
→ **KHÔNG cần làm gì thêm!**

**Nếu KHÔNG có kết quả:**
→ User chưa được gán task nào
→ Chuyển bước 5 (kiểm tra team member)

---

### 5. Kiểm tra user có là team member không
```sql
SELECT id, code, name, created_by, responsible_person_id
FROM projects
WHERE created_by = 'YOUR_USER_ID'
   OR responsible_person_id = 'YOUR_USER_ID'
   OR sales_person_id = 'YOUR_USER_ID'
   OR designer_id = 'YOUR_USER_ID'
   OR project_manager_id = 'YOUR_USER_ID';
```

**Nếu KHÔNG có kết quả:**
→ User chưa tham gia dự án nào
→ **FIX:** Thêm user vào dự án (update projects hoặc tạo mới)

---

### 6. Kiểm tra projects có company_id đúng không
```sql
SELECT p.id, p.code, p.name, p.company_id, c.name as company_name
FROM projects p
LEFT JOIN companies c ON c.id = p.company_id
WHERE p.company_id IN (
  SELECT company_id 
  FROM ecosystem_units 
  WHERE id IN (
    SELECT ecosystem_unit_id 
    FROM user_permissions 
    WHERE user_id = 'YOUR_USER_ID' 
      AND granted = true
  )
);
```

**Nếu KHÔNG có kết quả:**
→ Không có dự án nào thuộc công ty mà user có quyền
→ **FIX:** Tạo dự án mới hoặc update `projects.company_id`

---

## 🚀 Giải pháp nhanh

### Cách 1: Nâng role lên admin (tạm thời)
```sql
UPDATE users SET role = 'admin' WHERE email = 'your-email@example.com';
```
→ User sẽ thấy TẤT CẢ projects

### Cách 2: Gán user vào task ⭐ KHUYẾN NGHỊ
```sql
-- Tìm task cần gán
SELECT id, title, project_id FROM tasks WHERE project_id = 'PROJECT_ID';

-- Gán user vào task
UPDATE tasks 
SET assignee_id = 'YOUR_USER_ID'
WHERE id = 'TASK_ID';
```
→ User sẽ **TỰ ĐỘNG** thấy project khi có task được gán!

### Cách 3: Thêm user vào dự án (team member)
```sql
UPDATE projects 
SET responsible_person_id = 'YOUR_USER_ID'
WHERE id = 'PROJECT_ID';
```

### Cách 4: Gán permissions cho user (ecosystem)
```sql
-- 1. Tạo ecosystem_unit (nếu chưa có)
INSERT INTO ecosystem_units (name, level_id, company_id)
VALUES ('Phòng Kinh doanh', 'LEVEL_ID', 'COMPANY_ID')
RETURNING id;

-- 2. Gán permission cho user
INSERT INTO user_permissions (user_id, permission_id, ecosystem_unit_id, granted)
SELECT 
  'YOUR_USER_ID',
  id,
  'UNIT_ID',
  true
FROM permissions
WHERE resource = 'projects' AND action = 'all_companies';
```

---

## 📊 Test API trực tiếp

```bash
# Lấy user token
TOKEN="your-jwt-token"

# Test API
curl -H "Authorization: Bearer $TOKEN" \
  "https://tubep-backend.onrender.com/api/projects?limit=10"
```

**Kết quả mong đợi:**
```json
{
  "projects": [...], // Phải có dữ liệu
  "total": 5,
  "page": 1,
  "totalPages": 1
}
```

**Nếu vẫn empty:**
→ Check server logs tại Render dashboard
→ Hoặc gửi cho tôi response để debug
