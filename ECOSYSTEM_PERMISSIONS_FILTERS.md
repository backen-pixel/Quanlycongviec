# HỆ THỐNG LỌC NHÂN VIÊN - TAB PHÂN QUYỀN CHI TIẾT

## TỔNG QUAN

Tab "Phân quyền chi tiết" có **2 CƠ CHẾ LỌC NHÂN VIÊN** độc lập:

### 1. LỌC TỰ ĐỘNG THEO ĐƠN VỊ (Bước 1 → Bước 2)
### 2. LỌC THỦ CÔNG TRONG MODAL "GÁN NHÂN VIÊN"

---

## CƠ CHẾ 1: LỌC TỰ ĐỘNG THEO ĐƠN VỊ

### Workflow:
```
Bước 1: Chọn đơn vị từ cây hệ sinh thái
   ↓
Bước 2: Danh sách nhân viên tự động lọc theo đơn vị đó
   ↓
Bước 3: Chọn users + phân quyền
```

### Chi tiết lọc theo cấp:

#### **LEVEL 0: TẬP ĐOÀN 🏢**
```
API: GET /ecosystem/units/{tap-doan-id}/users
Logic: Lấy TẤT CẢ users trong hệ thống

Query:
SELECT * FROM users 
WHERE is_active = true

Ví dụ:
- Chọn "Tập đoàn TuBep"
- Kết quả: 150 users (toàn bộ nhân viên)
```

---

#### **LEVEL 1: KHỐI 📦**
```
API: GET /ecosystem/units/{khoi-id}/users
Logic: Lấy users trong các CÔNG TY thuộc khối này

Bước 1: Tìm các công ty con
  SELECT id, company_id 
  FROM ecosystem_units 
  WHERE parent_id = '{khoi-id}' OR id = '{khoi-id}'
  AND company_id IS NOT NULL

Bước 2: Lấy departments của các công ty
  SELECT id 
  FROM departments 
  WHERE company_id IN (company_ids)

Bước 3: Lấy users của departments
  SELECT id, full_name, email, department_id, departments(name)
  FROM users 
  WHERE department_id IN (dept_ids) 
  AND is_active = true

Ví dụ:
- Chọn "Khối Kinh Doanh"
- Công ty con: Công ty A, Công ty B
- Departments: 7 phòng ban
- Kết quả: 35 users
```

---

#### **LEVEL 2: CÔNG TY 🏭**
```
API: GET /ecosystem/units/{cong-ty-id}/users
Logic: Lấy users trong các PHÒNG BAN của công ty

Bước 1: Lấy departments của công ty
  SELECT id 
  FROM departments 
  WHERE company_id = '{company_id}'

Bước 2: Lấy users của departments
  SELECT * 
  FROM users 
  WHERE department_id IN (dept_ids) 
  AND is_active = true

Ví dụ:
- Chọn "Công ty Nhôm Kính Phúc Đạt"
- Departments: Kế Hoạch, Kinh Doanh, Sản Xuất, Kỹ Thuật, Nhân Sự
- Kết quả: 25 users
```

---

#### **LEVEL 3: PHÒNG BAN 👥**
```
API: GET /ecosystem/units/{phong-ban-id}/users
Logic: Lấy users trong PHÒNG BAN này

Bước 1: Tìm department tương ứng
  SELECT id 
  FROM departments 
  WHERE company_id = '{unit.company_id}'
  AND name = '{unit.name}'  -- Match by name

Bước 2: Lấy users
  SELECT * 
  FROM users 
  WHERE department_id = '{dept_id}' 
  AND is_active = true

Ví dụ:
- Chọn "Phòng Kế Hoạch"
- Kết quả: 8 users trong phòng đó
```

---

#### **LEVEL 4: TEAM ⚡**
```
API: GET /ecosystem/units/{team-id}/users
Logic: Lấy users được GÁN VÀO TEAM (ecosystem_unit_members)

Bước 1: Lấy members
  SELECT user_id 
  FROM ecosystem_unit_members 
  WHERE unit_id = '{team-id}'

Bước 2: Lấy user details
  SELECT * 
  FROM users 
  WHERE id IN (user_ids) 
  AND is_active = true

Ví dụ:
- Chọn "Team Thiết Kế"
- Kết quả: 5 users được gán vào team
```

---

## CƠ CHẾ 2: LỌC THỦ CÔNG TRONG MODAL "GÁN NHÂN VIÊN"

### Khi nào dùng:
Click nút **"+ Gán nhân viên"** để thêm user vào đơn vị

### Modal có 3 bộ lọc:

```
┌─────────────────────────────────────┐
│ Gán nhân viên vào {Tên đơn vị}      │
├─────────────────────────────────────┤
│ 🔍 Tìm kiếm: [_____________]        │  ← BỘ LỌC 1: Tìm theo tên/email
│                                      │
│ Công ty:    [-- Tất cả --▼]        │  ← BỘ LỌC 2: Chọn công ty
│                                      │
│ Phòng ban:  [-- Tất cả --▼]        │  ← BỘ LỌC 3: Chọn phòng ban
│                                      │
│ Tìm thấy 25 nhân viên               │
├─────────────────────────────────────┤
│ ○ (A) Nguyễn Văn A                 │
│    nguyenvana@...                   │
│    Phòng Kế Hoạch                   │
├─────────────────────────────────────┤
│ [Hủy]  [Thêm]                       │
└─────────────────────────────────────┘
```

### BỘ LỌC 1: TÌM KIẾM (Search)

```javascript
Input: "Nguyễn"
Logic: Filter client-side (real-time)

Code:
if (searchTerm) {
  const term = searchTerm.toLowerCase();
  filtered = filtered.filter(u =>
    u.full_name?.toLowerCase().includes(term) ||
    u.email?.toLowerCase().includes(term)
  );
}

Ví dụ:
- Gõ "Nguyễn" → 15 kết quả
- Gõ "Trần Thị" → 3 kết quả
- Gõ "@gmail" → 8 kết quả
```

### BỘ LỌC 2: CÔNG TY (Company)

**Hiển thị khi nào:**
- Đơn vị = Khối (level 1)
- Đơn vị = Tập đoàn (level 0)

**Logic:**
```javascript
// Load companies under selected unit
if (unit.level <= 1) {
  const childCompanies = allUnits.filter(u => {
    if (unit.level === 0) return u.level.depth === 2; // All companies
    if (unit.level === 1) return u.parent_id === unit.id; // Companies in this Khối
  });
  setCompanies(childCompanies);
}

// When company selected → load departments
if (selectedCompany) {
  const depts = await api.get(`/departments?company_id=${selectedCompany}`);
  setDepartments(depts);
}

// Filter users by departments of selected company
const deptIds = departments.filter(d => d.company_id === selectedCompany).map(d => d.id);
filtered = users.filter(u => deptIds.includes(u.department_id));
```

**Ví dụ:**
```
Đơn vị: Khối Kinh Doanh
Dropdown Công ty:
- -- Tất cả --
- Công ty A
- Công ty B

Chọn "Công ty A"
→ 15 users (thuộc các phòng ban của Công ty A)
```

### BỘ LỌC 3: PHÒNG BAN (Department)

**Hiển thị khi nào:**
- Đơn vị = Công ty (level 2), HOẶC
- Đã chọn công ty ở bộ lọc 2

**Logic:**
```javascript
// Load departments
if (unit.level === 2) {
  const depts = await api.get(`/departments?company_id=${unit.company_id}`);
  setDepartments(depts);
} else if (selectedCompany) {
  // Already loaded when company selected
}

// Filter users by selected department
if (selectedDepartment) {
  filtered = users.filter(u => u.department_id === selectedDepartment);
}
```

**Ví dụ:**
```
Đơn vị: Công ty A
Dropdown Phòng ban:
- -- Tất cả --
- Phòng Kế Hoạch
- Phòng Kinh Doanh
- Phòng Sản Xuất

Chọn "Phòng Kế Hoạch"
→ 8 users (chỉ users trong phòng đó)
```

---

## CASCADING FILTERS (Lọc liên hoàn)

### Ví dụ: Gán nhân viên vào Khối

```
Bước 1: Click "+ Gán nhân viên" trong Khối Kinh Doanh
→ Modal mở
→ Load: 50 users (tất cả users trong Công ty A, B)

Bước 2: Chọn Công ty A
→ Departments load: KH, KD, SX
→ Users filtered: 25 (chỉ Công ty A)

Bước 3: Chọn Phòng Kế Hoạch
→ Users filtered: 8 (chỉ PB Kế Hoạch)

Bước 4: Gõ "Nguyễn"
→ Users filtered: 2 (Nguyễn A, Nguyễn B)

Bước 5: Click user → Thêm
→ User được gán vào ecosystem_unit_members
```

---

## SO SÁNH 2 CƠ CHẾ

| Tính năng | Lọc tự động (Bước 2) | Lọc modal (Gán NV) |
|-----------|----------------------|--------------------|
| **Khi nào** | Sau khi chọn đơn vị | Click "+ Gán nhân viên" |
| **Mục đích** | Hiển thị users ĐÃ TRONG đơn vị | Tìm users ĐỂ THÊM vào đơn vị |
| **Scope** | Hierarchical (theo cấp) | Toàn hệ thống (có filter) |
| **Số users** | Ít (chỉ users trong unit) | Nhiều (toàn bộ minus existing) |
| **Filters** | Không (tự động) | 3 filters (search/company/dept) |
| **API** | GET /units/:id/users | GET /users (full list) |
| **Client filter** | Không | Có (instant) |

---

## EDGE CASES

### 1. Đơn vị không có nhân viên
```
Bước 2 hiển thị:
"Chưa có nhân viên. Click 'Gán nhân viên' để thêm."
```

### 2. Modal không tìm thấy users
```
"Không tìm thấy nhân viên"
- Có thể do: tất cả users đã được gán
- Hoặc: search quá cụ thể
```

### 3. Tập đoàn (level 0)
```
Bước 2: Hiển thị TẤT CẢ users (có thể 100+)
Modal: Cần dùng search để tìm
→ Performance warning nếu > 500 users
```

### 4. Team chưa có members
```
Bước 2: Danh sách trống
Modal: Hiện tất cả users (để gán vào)
```

---

## PERFORMANCE

### Lọc tự động (Bước 2):
- **Khối**: 3 queries (~500ms)
- **Công ty**: 2 queries (~300ms)
- **Phòng ban**: 2 queries (~200ms)
- **Team**: 1 query (~100ms)
- ✅ Cached (không reload trừ khi đổi unit)

### Modal filters:
- **Initial load**: 3 parallel requests (~1s)
- **Search filter**: Client-side (instant <10ms)
- **Company filter**: Client-side (~20ms)
- **Dept filter**: Client-side (~15ms)
- ✅ No API calls after initial load

---

## DEBUG TIPS

### Kiểm tra lọc tự động:
```javascript
console.log('Selected unit:', selectedUnit);
console.log('Unit depth:', getUnitDepth(selectedUnit));
console.log('Loaded users:', unitUsers);
```

### Kiểm tra modal filters:
```javascript
console.log('All users loaded:', allUsers.length);
console.log('Companies:', companies);
console.log('Departments:', departments);
console.log('Filtered users:', filteredUsers.length);
```

### Network tab:
```
1. Chọn unit → GET /ecosystem/units/{id}/users
2. Click "+ Gán NV" → GET /users, GET /departments, GET /ecosystem/units
3. Chọn dropdown → (no request, client-side)
```

---

## CODE REFERENCES

### Backend:
- `backend/src/routes/ecosystem.js` line ~790
  - `GET /units/:unitId/users` (hierarchical filtering)

### Frontend:
- `frontend/src/components/EcosystemPermissionsTab.jsx`
  - Line ~60: `loadUnitPermissions()` (load users for step 2)
  - Line ~440: `AddUserModal` component
  - Line ~470: `loadData()` (modal load all users)
  - Line ~520: `applyFilters()` (client-side filtering)

---

## TÓM TẮT

**Lọc tự động (Bước 2)**:
- Theo cấp hệ sinh thái (0→1→2→3→4)
- API trả về đúng users của đơn vị
- Không cần thao tác thêm

**Lọc modal (Gán nhân viên)**:
- 3 bộ lọc: Search + Company + Department
- Cascading (liên hoàn)
- Real-time (client-side)
- Để tìm và thêm users mới

**Cả 2 cơ chế bổ trợ cho nhau** để quản lý phân quyền hiệu quả! 🎯
