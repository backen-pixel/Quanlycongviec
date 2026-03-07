# HƯỚNG DẪN SỬ DỤNG - TAB PHÂN QUYỀN CHI TIẾT

## TỔNG QUAN

Tab **Phân quyền chi tiết** cho phép phân quyền theo **hệ sinh thái** (Khối/Công ty/Phòng ban/Team) với **vai trò cụ thể** trong từng đơn vị.

**Điểm khác biệt với Tab 1 & 2:**
- Tab 1: Quản lý vai trò TOÀN HỆ THỐNG (Admin, Manager, Employee)
- Tab 2: Gán vai trò toàn hệ thống cho users
- **Tab 3**: Gán vai trò + quyền TRONG từng đơn vị cụ thể

---

## WORKFLOW 3 BƯỚC

```
┌─────────────────────────────────────────────────┐
│ Bước 1: Chọn đơn vị                             │
│    ↓                                             │
│ Bước 2: Chọn vai trò + nhân viên                │
│    ↓                                             │
│ Bước 3: Bật/tắt quyền                           │
└─────────────────────────────────────────────────┘
```

---

## BƯỚC 1: CHỌN ĐƠN VỊ TRONG CÂY HỆ SINH THÁI

### Giao diện

Bên trái màn hình: Cây đơn vị (tree view) với cấu trúc phân cấp:

```
🏢 Tập đoàn TuBep
  ▶ 📦 Khối Sản Xuất
  ▼ 📦 Khối Kinh Doanh
    ▶ 🏭 Công ty A
    ▼ 🏭 Công ty B
      👥 Phòng Kế Hoạch
      👥 Phòng Kinh Doanh
      ⚡ Team Design
```

### Thao tác

1. **Click vào đơn vị** → Chọn đơn vị để phân quyền
   - Click icon ▶/▼ → Expand/collapse children
   - Click tên đơn vị → Select + load data

2. **Đơn vị được chọn** → Highlight màu tím + border trái

3. **Dữ liệu tải về**:
   - Danh sách nhân viên trong đơn vị đó (hierarchical)
   - Permissions hiện tại của nhân viên

### Ví dụ

```
Click "Khối Kinh Doanh"
→ API: GET /ecosystem/units/{khoi-id}/users
→ Trả về: 35 nhân viên (từ Công ty A, B, C)
→ Bên phải hiển thị panel với 35 nhân viên
```

---

## BƯỚC 2: CHỌN VAI TRÒ + NHÂN VIÊN

### 2.1. Chọn vai trò trong đơn vị

Sau khi chọn đơn vị, hiển thị 6 nút vai trò:

```
[🔴 Giám đốc] [🟣 Quản lý] [🔵 Giám sát]
[🟣 Trưởng nhóm] [🟢 Nhân viên] [⚪ Hỗ trợ]
```

**Vai trò:**
- **Giám đốc** (high): Quyền cao nhất trong đơn vị
- **Quản lý** (medium): Quản lý cấp dưới
- **Giám sát** (medium): Giám sát hoạt động
- **Trưởng nhóm** (medium): Quản lý team nhỏ
- **Nhân viên** (low): Nhân viên thông thường
- **Hỗ trợ** (low): Nhân viên hỗ trợ

**Thao tác:**
- Click vào 1 vai trò → Nút highlight màu tương ứng
- Danh sách nhân viên xuất hiện (Bước 2.2)

**Vai trò ảnh hưởng gì?**
- Lọc permissions khả dụng (Bước 3)
- Ví dụ: "Nhân viên" chỉ thấy permissions "view", không có "delete"

### 2.2. Chọn nhân viên

Sau khi chọn vai trò, hiển thị danh sách nhân viên với **checkboxes**:

```
Bước 2: Chọn nhân viên làm Quản lý
                                [Chọn tất cả]

☑ (A) Nguyễn Văn A
    nguyenvana@example.com

☐ (B) Trần Thị B
    tranthib@example.com

☑ (C) Lê Văn C
    levanc@example.com
```

**Thao tác:**
- Click checkbox → Chọn/bỏ chọn user
- Click "Chọn tất cả" → Select all/deselect all
- Có thể chọn **nhiều users cùng lúc** (multi-select)

**Nếu danh sách rỗng:**
```
┌───────────────────────────────────────┐
│ Chưa có nhân viên trong Công ty A.   │
│ Click "+ Gán nhân viên" để thêm.     │
└───────────────────────────────────────┘
```

→ Cần gán nhân viên vào đơn vị trước (xem mục "Gán nhân viên")

---

## BƯỚC 3: BẬT/TẮT QUYỀN

Sau khi chọn ít nhất 1 nhân viên, hiển thị **Permission Grid**:

```
Bước 3: Bật/tắt quyền cho 3 Quản lý đã chọn

┌────────────────────────────────────────┐
│ PROJECTS                                │
├────────────────────────────────────────┤
│ [✅ view]   [❌ view]                  │
│ [✅ create] [❌ create]                │
│ [✅ edit]   [❌ edit]                  │
│ [✅ delete] [❌ delete] (không khả dụng)│
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│ USERS                                   │
├────────────────────────────────────────┤
│ [✅ view]   [❌ view]                  │
│ [✅ create] [❌ create]                │
│ [✅ edit]   [❌ edit]                  │
│ [✅ delete] [❌ delete] (không khả dụng)│
└────────────────────────────────────────┘
```

### Thao tác

**Bulk Grant (✅ nút xanh):**
- Click ✅ "view" → 3 users được grant "view" permission
- API: 3 parallel requests (Promise.all)
- Toast: "✅ Đã bật quyền cho 3 nhân viên"

**Bulk Revoke (❌ nút đỏ):**
- Click ❌ "delete" → 3 users bị revoke "delete" permission
- API: 3 parallel requests
- Toast: "✅ Đã tắt quyền cho 3 nhân viên"

### Permissions được lọc tự động

**Ví dụ 1: Giám đốc ở Công ty**
- Hiển thị: TẤT CẢ permissions (view, create, edit, delete, all_companies)
- Không lọc gì

**Ví dụ 2: Quản lý ở Phòng ban**
- Hiển thị: view, create, edit (projects, users, workflows)
- Ẩn: delete, all_companies
- Lý do: Quản lý phòng ban không được xóa hoặc xem toàn công ty

**Ví dụ 3: Nhân viên ở Team**
- Hiển thị: view (projects, templates)
- Ẩn: create, edit, delete, all_companies
- Lý do: Nhân viên chỉ xem, không chỉnh sửa

### Nếu không có quyền nào

```
┌──────────────────────────────────────────┐
│ ⚠️ Vai trò "Nhân viên" trong "Team A"  │
│ không có quyền nào khả dụng.            │
└──────────────────────────────────────────┘
```

→ Chọn vai trò khác hoặc đơn vị cấp cao hơn

---

## HOẠT ĐỘNG PHỤ: GÁN NHÂN VIÊN VÀO ĐƠN VỊ

### Khi nào cần

Khi danh sách Bước 2 rỗng:
```
Chưa có nhân viên trong Khối Kinh Doanh.
Click "+ Gán nhân viên" để thêm.
```

### Thao tác

**1. Click "+ Gán nhân viên"** (góc phải header)

**2. Modal mở ra:**

```
┌────────────────────────────────────────┐
│ Gán nhân viên vào Khối Kinh Doanh     │
├────────────────────────────────────────┤
│ 🔍 Tìm kiếm: [_______________]        │
│                                         │
│ Công ty:    [-- Tất cả --▼]          │
│ Phòng ban:  [-- Tất cả --▼]          │
│                                         │
│ Tìm thấy 50 nhân viên                  │
├────────────────────────────────────────┤
│ ○ (A) Nguyễn Văn A                    │
│    nguyenvana@...                      │
│    Phòng Kế Hoạch                      │
│                                         │
│ ● (B) Trần Thị B  ← Selected          │
│    tranthib@...                        │
│    Phòng Kinh Doanh                    │
├────────────────────────────────────────┤
│ [Hủy]  [Thêm]                         │
└────────────────────────────────────────┘
```

**3. Lọc nhân viên:**
- Gõ tìm kiếm: Filter real-time theo tên/email
- Chọn Công ty: Lọc theo công ty
- Chọn Phòng ban: Lọc theo phòng ban

**4. Chọn 1 nhân viên:**
- Click radio button
- Chỉ chọn được 1 user mỗi lần

**5. Click "Thêm":**
- API: POST /ecosystem/units/members
- Modal đóng
- User mới xuất hiện trong danh sách Bước 2
- **Vai trò + users đã chọn GIỮ NGUYÊN** (không reset)

---

## WORKFLOW ĐẦY ĐỦ - VÍ DỤ THỰC TẾ

### Kịch bản: Gán quyền cho 5 Quản lý Khối Kinh Doanh

**Bước 1: Chọn Khối Kinh Doanh**
```
1. Click ▼ "Khối Kinh Doanh" trong cây
2. Đơn vị highlight màu tím
3. Bên phải load: 35 nhân viên
```

**Bước 2: Chọn vai trò + users**
```
4. Click nút "🟣 Quản lý"
5. Danh sách 35 users hiển thị
6. Check 5 users: Nguyễn A, Trần B, Lê C, Phạm D, Hoàng E
```

**Bước 3: Grant permissions**
```
7. Permission grid xuất hiện (lọc cho "Quản lý")
8. Click ✅ "view" trong "PROJECTS"
   → 5 users có quyền view projects
9. Click ✅ "create" trong "PROJECTS"
   → 5 users có quyền create projects
10. Click ✅ "edit" trong "PROJECTS"
   → 5 users có quyền edit projects
11. Click ✅ "view" trong "USERS"
   → 5 users có quyền view users
12. Done! 5 Quản lý đã có đầy đủ quyền
```

**Tổng thời gian: ~30 giây**

---

## SO SÁNH VỚI PHƯƠNG PHÁP KHÁC

### Cách cũ (Tab 2 - Gán vai trò toàn hệ thống):

```
Gán role "Manager" cho 5 users:
1. Click user 1 → modal → select "Manager" → save
2. Click user 2 → modal → select "Manager" → save
3. Click user 3 → modal → select "Manager" → save
4. Click user 4 → modal → select "Manager" → save
5. Click user 5 → modal → select "Manager" → save
→ Tổng: 5 lần mở modal, 5 lần save
→ Thời gian: ~2 phút
→ Quyền: Toàn hệ thống (không giới hạn trong Khối)
```

### Cách mới (Tab 3 - Phân quyền chi tiết):

```
Gán quyền "Quản lý Khối KB" cho 5 users:
1. Click "Khối KB"
2. Click "Quản lý"
3. Check 5 users
4. Click ✅ 4 permissions
→ Tổng: 7 clicks
→ Thời gian: ~30 giây (4x nhanh hơn!)
→ Quyền: Trong Khối KB only (chính xác hơn)
```

---

## CÁC TÍNH NĂNG ĐẶC BIỆT

### 1. State Persistence (Giữ trạng thái)

**Khi grant/revoke permissions:**
- Vai trò vẫn được chọn ✅
- Users vẫn được check ✅
- Có thể tiếp tục toggle permissions khác

**Khi gán thêm nhân viên:**
- Modal đóng
- Vai trò vẫn được chọn ✅
- Users cũ vẫn checked ✅
- User mới xuất hiện trong list

### 2. Hierarchical Filtering (Lọc phân cấp)

**Users tự động lọc theo cấp:**
- Chọn Khối → users từ các công ty trong khối
- Chọn Công ty → users từ các phòng ban
- Chọn Phòng ban → users trong phòng đó
- Chọn Team → users được gán vào team

### 3. Permission Inheritance (Kế thừa quyền)

**Quyền phân cấp:**
- Giám đốc Khối → Quản lý tất cả công ty dưới khối
- Quản lý Công ty → Quản lý tất cả phòng ban
- Giám sát Phòng ban → Giám sát team

**Backend tự động check:**
- User có quyền ở cấp cao → tự động có quyền ở cấp thấp
- Ví dụ: Giám đốc Khối KB có quyền edit → tự động edit được projects trong Công ty A, B, C

### 4. Bulk Operations (Thao tác hàng loạt)

**Multi-select users:**
- Check 10 users → Click ✅ 1 lần
- Backend: 10 parallel requests
- Time: ~2 giây (thay vì 10× riêng lẻ)

**Multiple permissions:**
- Chọn users 1 lần
- Toggle nhiều permissions liên tục
- Không cần re-select

---

## DEBUG & TROUBLESHOOTING

### Không thấy users sau khi chọn vai trò

**Kiểm tra:**
1. Console logs (F12):
   ```
   👥 Normalized users: 0 []
   ```
   → Không có users trong đơn vị

2. Click "+ Gán nhân viên" → Thêm users

### Users bị reset sau khi grant permission

**Đã fix trong commit 6201c50**
- Nếu vẫn bị → Hard refresh (Ctrl+Shift+F5)
- Clear browser cache

### Permission grid rỗng

**Nguyên nhân:**
- Vai trò "Nhân viên" ở cấp "Team" → không có quyền nào

**Giải pháp:**
- Chọn vai trò cao hơn (Quản lý, Giám đốc)
- Hoặc chọn đơn vị cấp cao hơn (Công ty, Khối)

### API trả về 304 Not Modified

**Đã fix trong commit 89fac8f**
- Backend thêm no-cache headers
- Nếu vẫn gặp → Hard refresh

---

## SHORTCUT & TIPS

**Tip 1: Chọn tất cả nhanh**
```
Click "Chọn tất cả" → All users checked
Click ✅ "view" → Grant cho tất cả
```

**Tip 2: Tìm user nhanh trong modal**
```
Gõ "Nguyễn" trong search box
→ Kết quả instant filter
→ Chọn → Thêm
→ Total: 5 giây
```

**Tip 3: Workflow hiệu quả**
```
1 lần setup (chọn đơn vị + vai trò)
→ Toggle 10 permissions
→ Không cần re-select
```

**Tip 4: Debug console**
```
F12 → Console tab
→ Xem logs:
   🔄 Loading unit data...
   👥 Normalized users: 25
→ Biết ngay có bao nhiêu users
```

---

## KẾT LUẬN

**Tab Phân quyền chi tiết** cung cấp:
✅ Phân quyền theo hệ sinh thái (Khối/Cty/PB/Team)
✅ Vai trò cụ thể trong từng đơn vị
✅ Bulk operations (nhanh × 4)
✅ State persistence (không reset)
✅ Hierarchical filtering (chính xác)
✅ Permission inheritance (tự động)

**Thích hợp cho:**
- Phân quyền chi tiết theo bộ phận
- Gán hàng loạt cho nhiều users
- Quản lý phân cấp rõ ràng
- Workflow phức tạp với nhiều đơn vị

**Không thích hợp cho:**
- Phân quyền toàn hệ thống (dùng Tab 1 & 2)
- Gán 1-2 users (overkill, dùng Tab 2 nhanh hơn)
- Setup ban đầu (cần tạo roles trước ở Tab 1)
