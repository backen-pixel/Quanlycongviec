# HỆ THỐNG PHÂN QUYỀN TUBEP PRO - PHÂN TÍCH TOÀN DIỆN

Ngày: 2026-03-07
Phiên bản: Sau 43 commits refactor

---

## 📊 TỔNG QUAN HỆ THỐNG

### Kiến trúc 3 tầng:

```
┌─────────────────────────────────────────────┐
│  1. VAI TRÒ VỊ TRÍ (Position Roles)        │
│     - Giám đốc, Quản lý, Giám sát...       │
│     - CHỈ LÀ NHÃN (label/metadata)         │
│     - Gán cho nhân viên                     │
└─────────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────────┐
│  2. QUYỀN HỆ THỐNG (Permissions)           │
│     - Xem dự án, Tạo dự án...              │
│     - Quản lý cấp dưới (đặc biệt)          │
│     - Toggle ON/OFF cho từng nhân viên     │
└─────────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────────┐
│  3. PHẠM VI (Scope)                        │
│     - ecosystem_unit_id (Khối/Công ty/PB)  │
│     - Quyền chỉ có hiệu lực trong scope    │
└─────────────────────────────────────────────┘
```

---

## 🎭 1. VAI TRÒ VỊ TRÍ (Position Roles)

### Danh sách vai trò:

```javascript
POSITION_ROLES = [
  { id: 'director',   name: 'Giám đốc',    level: 'high' },
  { id: 'manager',    name: 'Quản lý',     level: 'medium' },
  { id: 'supervisor', name: 'Giám sát',    level: 'medium' },
  { id: 'leader',     name: 'Trưởng nhóm', level: 'medium' },
  { id: 'employee',   name: 'Nhân viên',   level: 'low' },
  { id: 'support',    name: 'Hỗ trợ',      level: 'low' },
]
```

### Chức năng:

✅ **CHỈ LÀ NHÃN** - không kiểm soát quyền trực tiếp
- Gán cho user: `user.position_role = 'director'`
- Hiển thị trong UI: badge, card, profile
- Lưu trong DB: `user_permissions.position_role`

❌ **KHÔNG kiểm soát**:
- Không tự động grant permissions
- Không block phân quyền
- Không quyết định scope

### Ví dụ:

```
Nguyễn Văn A - position_role: "employee"
→ Vẫn có thể được cấp quyền "Xem tất cả dự án"
→ Vẫn có thể có scope "Toàn công ty"

Trần Thị B - position_role: "director"
→ Không tự động có quyền gì
→ Phải được phân quyền thủ công
```

---

## 🔐 2. HỆ THỐNG QUYỀN (Permissions)

### Cấu trúc Database:

```sql
-- Bảng permissions (danh sách quyền có sẵn)
CREATE TABLE permissions (
  id UUID PRIMARY KEY,
  resource VARCHAR(50),    -- 'projects', 'users', 'workflows'...
  action VARCHAR(50),      -- 'view', 'create', 'edit', 'delete'
  description TEXT,
  is_active BOOLEAN
);

-- Bảng user_permissions (quyền của từng user)
CREATE TABLE user_permissions (
  id UUID PRIMARY KEY,
  user_id UUID,
  permission_id UUID,
  ecosystem_unit_id UUID,  -- Scope: Khối/Công ty/Phòng ban
  position_role VARCHAR,   -- Label vai trò (metadata)
  granted BOOLEAN,         -- true = có quyền, false = thu hồi
  created_at TIMESTAMP
);
```

### 7 nhóm quyền:

#### 📁 Dự án (projects):
- `projects:view` - Xem danh sách dự án
- `projects:create` - Tạo dự án mới
- `projects:edit` - Chỉnh sửa thông tin dự án
- `projects:delete` - Xóa dự án
- `projects:all_companies` - Xem dự án của tất cả công ty

#### 👥 Nhân viên (users):
- `users:view` - Xem danh sách nhân viên
- `users:create` - Thêm nhân viên mới
- `users:edit` - Chỉnh sửa thông tin nhân viên
- `users:delete` - Xóa nhân viên
- **`users:manage_subordinates`** - 🛡️ Quản lý cấp dưới ⭐

#### 🔀 Quy trình (workflows):
- `workflows:view` - Xem quy trình
- `workflows:create` - Tạo quy trình mới
- `workflows:edit` - Chỉnh sửa quy trình
- `workflows:delete` - Xóa quy trình

#### 📋 Bộ mẫu (templates):
- `templates:view` - Xem bộ mẫu
- `templates:create` - Tạo bộ mẫu
- `templates:edit` - Chỉnh sửa bộ mẫu
- `templates:delete` - Xóa bộ mẫu

#### 🏢 Cấu trúc công ty (ecosystem):
- `ecosystem:view` - Xem cấu trúc tổ chức
- `ecosystem:edit` - Sửa cấu trúc tổ chức

#### 📊 Báo cáo (reports):
- `reports:view` - Xem báo cáo
- `reports:export` - Xuất dữ liệu

#### ⚙️ Cài đặt (settings):
- `settings:view` - Xem cài đặt hệ thống
- `settings:edit` - Thay đổi cài đặt

### ⭐ Quyền đặc biệt: `manage_subordinates`

**Mục đích**: Phân biệt vai trò quản lý vs thực hiện

**Chỉ cấp cho**: Giám đốc, Quản lý, Giám sát

**Khi CÓ quyền này**:
- Quản lý toàn bộ đơn vị và cấp dưới
- Phê duyệt công việc của cấp dưới
- Xem báo cáo tổng hợp
- Gán/xóa nhân viên trong scope

**Khi KHÔNG CÓ quyền này** (Trưởng nhóm, Nhân viên):
- Chỉ làm công việc được giao
- Chỉ quản lý trong phạm vi nhỏ (team/phòng)
- Không phê duyệt cho cấp khác
- Không xem báo cáo cấp cao

---

## 📍 3. PHẠM VI (Scope)

### Cấu trúc phân cấp:

```
0. Tập đoàn 🏢 (root)
   ↓
1. Khối 📦 (division)
   ↓
2. Công ty 🏭 (company)
   ↓
3. Phòng ban 👥 (department)
   ↓
4. Đội nhóm ⚡ (team)
```

### Logic scope:

```javascript
// Quyền ở cấp cao → bao gồm cấp thấp
user_permissions {
  user_id: "A",
  permission: "projects:view",
  ecosystem_unit_id: "Công ty A",  // Level 2
}

→ User A có quyền "Xem dự án" ở:
  ✅ Công ty A
  ✅ Phòng ban 1, 2, 3 (thuộc Công ty A)
  ✅ Đội nhóm a, b, c (thuộc các phòng ban)
```

### Ví dụ thực tế:

#### Case 1: Trưởng phòng
```
Nguyễn Văn A
- position_role: "leader"
- Permissions:
  * projects:view (scope: Phòng Marketing)
  * projects:create (scope: Phòng Marketing)
- KHÔNG CÓ: manage_subordinates

→ Kết quả:
  ✅ Xem dự án của Phòng Marketing
  ✅ Tạo dự án cho Phòng Marketing
  ❌ Không xem dự án Phòng khác
  ❌ Không quản lý nhân viên
```

#### Case 2: Quản lý
```
Trần Thị B
- position_role: "manager"
- Permissions:
  * projects:view (scope: Công ty A)
  * projects:create (scope: Công ty A)
  * users:manage_subordinates (scope: Công ty A)

→ Kết quả:
  ✅ Xem dự án TOÀN BỘ Công ty A
  ✅ Tạo dự án cho MỌI phòng ban
  ✅ Quản lý nhân viên Công ty A
  ✅ Quản lý TẤT CẢ phòng ban, đội nhóm
```

#### Case 3: Giám đốc
```
Lê Văn C
- position_role: "director"
- Permissions:
  * ALL permissions (scope: Tập đoàn)

→ Kết quả:
  ✅ Toàn quyền trên tất cả
  ✅ Mọi công ty, phòng ban, nhân viên
```

---

## 🔄 WORKFLOW PHÂN QUYỀN

### Bước 1: Chọn đơn vị (Scope)
```
[Cây hệ sinh thái]
🏢 Tập đoàn VPT
  📦 Khối Sản xuất
    🏭 Công ty Nhôm Kính Phúc Đạt  ← Click chọn
      👥 Phòng Kinh doanh
      👥 Phòng Kỹ thuật
```

### Bước 2: Chọn vai trò + nhân viên
```
Vai trò: [Quản lý]  ← Chọn label để gán

Tìm kiếm: "Nguyễn"
→ Nguyễn Văn A (ketoan@...)
→ Nguyễn Thị B (kinhdoanh@...)  ← Click chọn
```

### Bước 3: Phân quyền

**Option A: Từ vai trò hệ thống (Tab 1)**
```
[Manager - 15 quyền]

📋 Chi tiết:
  📁 Dự án
    ✓ Xem danh sách
    ✓ Tạo mới
    ✓ Chỉnh sửa
  👥 Nhân viên
    ✓ Xem danh sách
    ✓ Quản lý cấp dưới

[✅ Áp dụng toàn bộ quyền]
```

**Option B: Tùy chỉnh chi tiết**
```
📁 Dự án
  Xem dự án          [Đã cấp] ⚫───
  Tạo dự án          [Đã cấp] ⚫───
  Chỉnh sửa       [Chưa cấp] ───⚪
  
👥 Nhân viên
  Xem danh sách   [Chưa cấp] ───⚪
  🛡️ Quản lý cấp dưới [Đã cấp] ⚫───
```

### Kết quả lưu DB:

```sql
INSERT INTO user_permissions (
  user_id: "nguyen-thi-b-id",
  permission_id: "projects:view",
  ecosystem_unit_id: "cong-ty-phuc-dat-id",
  position_role: "manager",
  granted: true
);

INSERT INTO user_permissions (
  user_id: "nguyen-thi-b-id",
  permission_id: "users:manage_subordinates",
  ecosystem_unit_id: "cong-ty-phuc-dat-id",
  position_role: "manager",
  granted: true
);
```

---

## ✅ ƯU ĐIỂM CỦA HỆ THỐNG

### 1. Linh hoạt cao
- ✅ Bất kỳ user nào cũng có thể có bất kỳ quyền nào
- ✅ Không bị ràng buộc bởi vai trò vị trí
- ✅ Dễ điều chỉnh khi tổ chức thay đổi

### 2. Phân cấp rõ ràng
- ✅ Scope dựa trên cấu trúc tổ chức thực tế
- ✅ Quyền ở cấp cao tự động bao gồm cấp thấp
- ✅ Dễ hiểu: Công ty > Phòng ban > Đội nhóm

### 3. Kiểm soát chi tiết
- ✅ Granular permissions (từng quyền riêng lẻ)
- ✅ Quyền "Quản lý cấp dưới" tách biệt rõ ràng
- ✅ Toggle ON/OFF dễ dàng

### 4. Audit trail tốt
- ✅ Lưu `position_role` để biết vai trò khi cấp quyền
- ✅ Timestamp `created_at` để tracking
- ✅ Flag `granted` để thu hồi mà không xóa record

### 5. Tái sử dụng
- ✅ Template từ Tab 1 → áp dụng nhanh
- ✅ Copy permissions từ user khác
- ✅ Nhất quán quyền trong cùng vai trò

---

## ⚠️ HẠN CHẾ VÀ RỦI RO

### 1. Phức tạp cho admin
❌ **Vấn đề**: Phân quyền từng user = nhiều bước
- Có 100 nhân viên → phân quyền 100 lần?
- Dễ nhầm lẫn, quên cấp quyền

💡 **Giải pháp**:
- Tạo role templates sẵn (Tab 1)
- Bulk assign cho nhiều users cùng lúc (TODO)
- Default permissions cho vai trò mới (TODO)

### 2. Không có role hierarchy
❌ **Vấn đề**: Vai trò không kế thừa quyền
- "Giám đốc" không tự động có quyền của "Quản lý"
- Phải grant từng quyền riêng lẻ

💡 **Giải pháp hiện tại**:
- Dùng role templates
- Copy từ user có vai trò tương tự

💡 **Giải pháp tương lai**:
- Thêm role inheritance: Director extends Manager

### 3. Scope overlap
❌ **Vấn đề**: User có nhiều scope gây nhầm lẫn
```
User A:
- projects:view @ Công ty A
- projects:view @ Công ty B
→ Có quyền ở cả 2? Hay chỉ 1?
```

💡 **Giải pháp hiện tại**:
- Backend check: ANY matching scope → granted
- UI: Hiển thị tất cả scopes của user

### 4. Không có time-based permissions
❌ **Vấn đề**: Quyền vĩnh viễn
- Không tự động hết hạn
- Phải thu hồi thủ công

💡 **Giải pháp tương lai**:
- Thêm `expires_at` timestamp
- Cron job auto-revoke

### 5. Thiếu approval workflow
❌ **Vấn đề**: Ai cũng có thể grant permissions
- Không có quy trình phê duyệt
- Rủi ro bảo mật cao

💡 **Giải pháp tương lai**:
- Thêm approval flow
- Chỉ admin cấp cao approve
- Log mọi thay đổi quyền

---

## 🔍 SO SÁNH VỚI THỰC TẾ

### ✅ PHÙ HỢP với:

#### 1. Công ty vừa và nhỏ (10-200 người)
- ✅ Cấu trúc rõ ràng: Công ty → Phòng ban
- ✅ Ít thay đổi tổ chức
- ✅ Admin có thời gian setup

#### 2. Doanh nghiệp có phân cấp rõ
- ✅ Giám đốc → Quản lý → Nhân viên
- ✅ Scope theo địa lý hoặc sản phẩm
- ✅ Cần kiểm soát chặt chẽ

#### 3. Ngành sản xuất, xây dựng
- ✅ Dự án rõ ràng (scope cụ thể)
- ✅ Cần phân quyền chi tiết
- ✅ Nhiều cấp quản lý

### ❌ KHÔNG PHÙ HỢP với:

#### 1. Startup nhỏ (<10 người)
- ❌ Quá phức tạp
- ❌ Mọi người làm nhiều việc
- ❌ Cần flexibility cao hơn

**Nên dùng**: Role-based đơn giản (Admin/User)

#### 2. Tổ chức matrix
- ❌ 1 người thuộc nhiều team
- ❌ Reporting line phức tạp
- ❌ Scope không rõ ràng

**Nên dùng**: Attribute-based (ABAC)

#### 3. Thay đổi nhanh
- ❌ Tổ chức thay đổi hàng tháng
- ❌ Nhân viên đổi vai trò liên tục
- ❌ Không có admin maintain

**Nên dùng**: Động hơn, ít cứng nhắc hơn

---

## 🎯 KẾT LUẬN

### Điểm mạnh:
1. ⭐⭐⭐⭐⭐ **Granular control**: Chi tiết đến từng quyền
2. ⭐⭐⭐⭐⭐ **Scope-based**: Phù hợp cấu trúc tổ chức
3. ⭐⭐⭐⭐ **Flexible**: Không bị giới hạn bởi vai trò
4. ⭐⭐⭐⭐ **Audit-friendly**: Track được lịch sử

### Điểm yếu:
1. ⚠️ **Phức tạp**: Cần đào tạo admin
2. ⚠️ **Thủ công**: Chưa có bulk operations
3. ⚠️ **Thiếu automation**: Không tự động theo vai trò
4. ⚠️ **Không có expiry**: Quyền vĩnh viễn

### Phù hợp?

#### ✅ **CÓ** - Nếu bạn là:
- Công ty tủ bếp 20-100 người
- Cấu trúc: Công ty → Phòng ban (KD, Sản xuất, Lắp đặt)
- Cần phân quyền rõ: Giám đốc xem tất cả, Trưởng phòng chỉ phòng mình
- Có 1-2 admin IT maintain

#### ❌ **KHÔNG** - Nếu bạn là:
- Startup 5 người (overkill)
- Tổ chức phẳng (không cấp bậc)
- Thay đổi liên tục
- Không có IT staff

### Đánh giá tổng thể: **8/10**

**Phù hợp thực tế**: ✅ **CÓ** cho TuBep Pro (công ty tủ bếp)

**Lý do**:
- Ngành sản xuất tủ bếp → cấu trúc rõ ràng
- Dự án rõ scope (công ty A, phòng ban B)
- Cần kiểm soát chi tiết (ai xem dự án nào)
- Có phân cấp quản lý (GĐ → QL → Trưởng nhóm)

---

## 📝 KHUYẾN NGHỊ CẢI TIẾN

### Ngắn hạn (1-2 tuần):
1. ✅ **Bulk assign**: Chọn nhiều users → grant cùng lúc
2. ✅ **Copy permissions**: Copy từ user A sang user B
3. ✅ **Default permissions**: Vai trò mới tự động có quyền cơ bản

### Trung hạn (1-2 tháng):
4. ✅ **Role inheritance**: Director kế thừa quyền Manager
5. ✅ **Permission groups**: Gom quyền thành nhóm (Basic, Advanced, Admin)
6. ✅ **Audit log UI**: Xem lịch sử thay đổi quyền

### Dài hạn (3-6 tháng):
7. ✅ **Approval workflow**: Phê duyệt khi cấp quyền cao
8. ✅ **Time-based**: Quyền tạm thời (expires_at)
9. ✅ **AI recommendations**: Gợi ý quyền dựa trên vai trò tương tự

---

**Tài liệu này được tạo**: 2026-03-07 02:57 UTC
**Sau**: 43 commits refactor hệ thống phân quyền
**Trạng thái**: Production-ready, cần deploy để test thực tế
