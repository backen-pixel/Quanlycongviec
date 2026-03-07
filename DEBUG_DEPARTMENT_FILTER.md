# DEBUG: Phòng ban user filtering

## Vấn đề
Khi chọn Phòng ban trong tab "Phân quyền chi tiết", danh sách nhân viên trống (hoặc sai).

## Nguyên nhân có thể
1. **Tên không khớp**: `ecosystem_units.name` ≠ `departments.name`
2. **Company ID sai**: `ecosystem_units.company_id` không match với `departments.company_id`
3. **Không có users**: Department thật sự không có users

## Cách kiểm tra

### Bước 1: Xem backend logs (Render)
```
1. Vào Render Dashboard
2. Chọn backend service
3. Click "Logs" tab
4. Chọn Phòng ban trong app
5. Xem logs xuất hiện
```

### Logs mẫu - Thành công:
```
Looking for department: { company_id: 'abc-123', name: 'Phòng Kế Hoạch' }
Department found: { id: 'xyz-789', name: 'Kế Hoạch' }
Users found in department: 8
```

### Logs mẫu - Thất bại:
```
Looking for department: { company_id: 'abc-123', name: 'Phòng Kế Hoạch' }
No department match for: Phòng Kế Hoạch in company: abc-123
Available departments: [
  { id: 'xyz-1', name: 'Kế Hoạch' },
  { id: 'xyz-2', name: 'Kinh Doanh' },
  { id: 'xyz-3', name: 'Sản Xuất' }
]
Fuzzy match found: { name: 'Kế Hoạch' }
Users found in department: 8
```

### Bước 2: Kiểm tra database

#### Query 1: Xem ecosystem_units của Phòng ban
```sql
SELECT 
  id, 
  name, 
  company_id, 
  level_id,
  ecosystem_levels.depth
FROM ecosystem_units
JOIN ecosystem_levels ON ecosystem_units.level_id = ecosystem_levels.id
WHERE ecosystem_levels.depth = 3
AND is_active = true;
```

Kết quả mẫu:
```
id: abc-123
name: Phòng Kế Hoạch
company_id: def-456
depth: 3
```

#### Query 2: Xem departments của company
```sql
SELECT id, name, company_id
FROM departments
WHERE company_id = 'def-456';
```

Kết quả mẫu:
```
id: xyz-789
name: Kế Hoạch
company_id: def-456
```

#### Query 3: Xem users của department
```sql
SELECT id, full_name, email, department_id
FROM users
WHERE department_id = 'xyz-789'
AND is_active = true;
```

Kết quả mẫu:
```
8 users found
```

### Bước 3: So sánh tên

**Phòng ban unit**: `Phòng Kế Hoạch`  
**Department**: `Kế Hoạch`

→ **Không khớp chính xác!**

Nhưng fuzzy match sẽ tìm thấy:
- `"Phòng Kế Hoạch".includes("Kế Hoạch")` = true ✅
- Hoặc `"Kế Hoạch".includes("Kế Hoạch")` = true ✅

## Giải pháp

### Nếu fuzzy match không hoạt động:

#### Option 1: Đổi tên ecosystem_unit cho khớp
```sql
UPDATE ecosystem_units
SET name = 'Kế Hoạch'
WHERE id = 'abc-123';
```

#### Option 2: Thêm link trực tiếp (migration)
```sql
-- Add department_id to ecosystem_units
ALTER TABLE ecosystem_units
ADD COLUMN department_id UUID REFERENCES departments(id);

-- Link existing units
UPDATE ecosystem_units eu
SET department_id = d.id
FROM departments d
WHERE eu.company_id = d.company_id
AND eu.name ILIKE '%' || d.name || '%'
AND (SELECT depth FROM ecosystem_levels WHERE id = eu.level_id) = 3;
```

#### Option 3: Tạo mapping table
```sql
CREATE TABLE ecosystem_unit_department_links (
  ecosystem_unit_id UUID REFERENCES ecosystem_units(id),
  department_id UUID REFERENCES departments(id),
  PRIMARY KEY (ecosystem_unit_id, department_id)
);
```

## Test cases

### Test 1: Exact match
```
Unit name: "Kế Hoạch"
Dept name: "Kế Hoạch"
Expected: 8 users ✅
```

### Test 2: Prefix match
```
Unit name: "Phòng Kế Hoạch"
Dept name: "Kế Hoạch"
Expected: 8 users (fuzzy match) ✅
```

### Test 3: Different company
```
Unit company_id: abc-123
Dept company_id: xyz-789
Expected: 0 users (no match) ✅
```

### Test 4: No users in department
```
Unit: "Phòng Mới"
Dept: "Phòng Mới" (exists)
Users: 0 (empty department)
Expected: 0 users ✅
```

## Troubleshooting checklist

- [ ] Backend logs show department lookup
- [ ] Company ID matches between unit and department
- [ ] Department exists in database
- [ ] Department has users
- [ ] Users are active (is_active = true)
- [ ] Fuzzy match finds department
- [ ] API returns users in response

## Quick fix script

Nếu cần link nhanh tất cả Phòng ban units với departments:

```javascript
// Run in browser console on /ecosystem page
async function linkDepartments() {
  const units = await fetch('/api/ecosystem/units').then(r => r.json());
  const depts = await fetch('/api/departments').then(r => r.json());
  
  const pbUnits = units.units.filter(u => u.level?.depth === 3);
  
  for (const unit of pbUnits) {
    const dept = depts.departments.find(d => 
      d.company_id === unit.company_id &&
      (d.name === unit.name || 
       d.name.includes(unit.name) ||
       unit.name.includes(d.name))
    );
    
    if (dept) {
      console.log(`✅ Match: ${unit.name} → ${dept.name}`);
      // TODO: Save link to database
    } else {
      console.log(`❌ No match: ${unit.name} (company: ${unit.company_id})`);
    }
  }
}
```

## Liên hệ

Nếu vẫn không hoạt động:
1. Copy backend logs
2. Copy SQL query results
3. Share screenshot of Phòng ban selection
4. Provide ecosystem_unit ID + department ID
