# DEBUG: Tại sao không thấy dự án?

## ✅ Đã sửa (commit d650c2a)

### Vấn đề trước đây:
1. Backend kiểm tra `user_permissions` table để lấy `ecosystem_units` user có quyền
2. Nếu user chưa có permissions → `accessibleUnits = []`
3. → Backend trả về `projects: []` (empty)

### Giải pháp:
**3 luồng xử lý:**

#### 1. Admin/Manager/Director → Thấy TẤT CẢ
```javascript
if (role === 'admin' || 'manager' || 'director') {
  // Bypass ecosystem filter, xem tất cả projects
}
```

#### 2. User thường có permissions → Lọc theo công ty
```javascript
if (accessibleUnits.length > 0) {
  // Lấy company_ids từ ecosystem_units
  // Filter projects theo company_id
}
```

#### 3. User thường KHÔNG có permissions → Xem dự án của mình
```javascript
if (accessibleUnits.length === 0) {
  // Fallback: chỉ xem projects mà user là:
  // - created_by
  // - responsible_person_id
  // - sales_person_id
  // - designer_id
  // - project_manager_id
}
```

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

### 4. Kiểm tra user có tham gia dự án nào không
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

### 5. Kiểm tra projects có company_id đúng không
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

### Cách 2: Thêm user vào dự án
```sql
UPDATE projects 
SET responsible_person_id = 'YOUR_USER_ID'
WHERE id = 'PROJECT_ID';
```

### Cách 3: Gán permissions cho user
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
