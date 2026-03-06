# HƯỚNG DẪN PHÂN QUYỀN ADMIN/CEO - TuBep Pro

## Bước 1: Chạy Migration (Nếu chưa)

1. Vào Supabase Dashboard: https://supabase.com/dashboard
2. Chọn project `kdxypztstbeovyedmvem`
3. Vào SQL Editor
4. Copy nội dung file `backend/supabase/24_permission_system.sql`
5. Paste và RUN
6. Kiểm tra: Vào Table Editor → tìm tables `roles`, `permissions`

## Bước 2: Phân quyền cho Admin (CEO)

### Option 1: Gán vai trò "Admin" có sẵn (Nhanh nhất)

**Trên web app:**

1. **Vào trang Phân quyền**
   - URL: `https://tubep-frontend-s30w.onrender.com/permissions`
   - Click menu bên trái: 🛡️ **Phân quyền**

2. **Chuyển sang Tab 2: "Gán vai trò"**
   - Click tab thứ 2: 👥 **Gán vai trò**

3. **Tìm user CEO**
   - Dùng ô tìm kiếm phía trên: gõ tên CEO
   - Hoặc dùng bộ lọc dropdown: Khối/Công ty/Phòng ban

4. **Click vào card của CEO**
   - Hộp thoại mở ra với tiêu đề "Phân quyền cho [Tên CEO]"

5. **Gán vai trò Admin**
   - Dropdown "Chọn vai trò": Chọn **Admin**
   - Dropdown "Phạm vi": Chọn **Toàn hệ thống**
   - Click nút **"Thêm vai trò"**

6. **Kiểm tra**
   - Vai trò Admin xuất hiện trong danh sách
   - Badge màu đỏ: "Admin • Toàn hệ thống"
   - CEO giờ có FULL quyền toàn bộ hệ thống ✅

### Option 2: Tạo vai trò custom "CEO" (Chi tiết hơn)

**Bước 2.1: Tạo vai trò mới**

1. Vào **Tab 1: "Vai trò & Quyền"**
2. Click nút **"+ Tạo vai trò mới"** (góc trên bên phải)
3. Điền form:
   - **Tên vai trò**: CEO
   - **Mô tả**: Giám đốc điều hành - Full quyền toàn hệ thống
4. Click **"Tạo"**

**Bước 2.2: Bật tất cả quyền cho vai trò CEO**

1. Click vào vai trò **"CEO"** vừa tạo (list bên trái)
2. Bên phải hiện các nhóm quyền:
   - ☑️ **projects** (Dự án): Tick hết 5 quyền
     - ✅ view (Xem danh sách)
     - ✅ create (Tạo mới)
     - ✅ edit (Chỉnh sửa)
     - ✅ delete (Xóa)
     - ✅ all_companies (Xem tất cả công ty)
   - ☑️ **workflows** (Quy trình): Tick hết 4 quyền
   - ☑️ **templates** (Bộ mẫu): Tick hết 4 quyền
   - ☑️ **users** (Nhân viên): Tick hết 4 quyền
   - ☑️ **ecosystem** (Cấu trúc): Tick hết 4 quyền
   - ☑️ **reports** (Báo cáo): Tick hết 4 quyền
   - ☑️ **settings** (Cài đặt): Tick hết 4 quyền

3. Click nút **"💾 Lưu thay đổi"** (góc trên bên phải)

**Bước 2.3: Gán vai trò CEO cho user**

1. Chuyển sang **Tab 2: "Gán vai trò"**
2. Tìm user CEO trong danh sách
3. Click vào card → modal mở ra
4. Dropdown "Chọn vai trò": Chọn **CEO**
5. Dropdown "Phạm vi": Chọn **Toàn hệ thống**
6. Click **"Thêm vai trò"**

## Bước 3: Kiểm tra phân quyền

### Test 1: Xem dự án toàn công ty

1. Đăng nhập bằng tài khoản CEO
2. Vào trang **Dự án** (Projects)
3. **Kỳ vọng**: Thấy dự án từ TẤT CẢ các công ty (A, B, C...)
4. **So sánh**: Nhân viên bình thường chỉ thấy dự án công ty mình

### Test 2: Quản lý nhân viên

1. Vào trang **Nhân viên** (/users)
2. **Kỳ vọng**: Thấy tất cả nhân viên trong hệ thống
3. Click menu (3 chấm) → **Phân quyền**
4. **Kỳ vọng**: Có thể gán/xóa vai trò cho bất kỳ ai

### Test 3: Quản lý hệ sinh thái

1. Vào trang **Hệ sinh thái** (/ecosystem)
2. **Kỳ vọng**: Thấy toàn bộ cây tổ chức (Khối/Cty/PB/Team)
3. Thử tạo/sửa/xóa đơn vị
4. **Kỳ vọng**: Không bị chặn

## Bước 4: Test UX/UI (Đánh giá trải nghiệm)

### Checklist UX/UI

**Tab 1: Vai trò & Quyền**
- [ ] Danh sách vai trò rõ ràng, dễ nhìn?
- [ ] Số lượng quyền hiển thị (badge)?
- [ ] Grid quyền được nhóm theo module?
- [ ] Checkbox lớn, dễ click?
- [ ] Màu sắc phân biệt (xanh = có, xám = không)?
- [ ] Nút "Lưu thay đổi" nổi bật?

**Tab 2: Gán vai trò**
- [ ] Danh sách nhân viên có avatar/tên rõ?
- [ ] Bộ lọc (Khối/Cty/PB) hoạt động smooth?
- [ ] Click vào card mở modal ngay lập tức?
- [ ] Modal hiển thị vai trò hiện tại của user?
- [ ] Dropdown vai trò đầy đủ?
- [ ] Dropdown phạm vi (scope) dễ hiểu?
- [ ] Nút "Thêm vai trò" phản hồi ngay?
- [ ] Badge vai trò có màu sắc đẹp?
- [ ] Nút xóa vai trò (×) dễ thấy?

**Tab 3: Phân quyền chi tiết**
- [ ] Cây hệ sinh thái expand/collapse mượt?
- [ ] Icon level (🏢📦🏭👥⚡) dễ phân biệt?
- [ ] Checkbox chọn nhiều nhân viên hoạt động?
- [ ] Nút "Chọn tất cả" rõ ràng?
- [ ] Grid quyền [✅ bật] [❌ tắt] trực quan?
- [ ] Nhóm quyền theo resource (projects, users...)?
- [ ] Thông báo sau khi lưu rõ ràng?
- [ ] Loading state khi đang xử lý?

**Overall**
- [ ] Responsive trên mobile/tablet?
- [ ] Không có lỗi hiển thị (overlapping, text bị cut)?
- [ ] Màu sắc nhất quán (purple theme)?
- [ ] Font size đủ lớn, dễ đọc?
- [ ] Spacing hợp lý, không bị chật?
- [ ] Transition/animation mượt?
- [ ] Error message (nếu có) rõ ràng?

## Bước 5: Scenario Testing (Kịch bản thực tế)

### Scenario 1: Phân quyền cho 10 trưởng phòng cùng lúc

**Mục tiêu**: Gán vai trò "Manager" cho 10 người trong 1 phút

**Các bước**:
1. Tab 2: Gán vai trò
2. Lọc theo "Khối Quản Lý"
3. Dùng tìm kiếm hoặc scroll
4. Click từng user → chọn Manager → Thêm
5. **Đếm thời gian**: Mất bao lâu?
6. **Đánh giá**: Có cách nào nhanh hơn?

**Cải tiến đề xuất**: Multi-select + bulk assign (đã có ở Tab 3)

### Scenario 2: Phân quyền chi tiết cho team Designer

**Mục tiêu**: 5 designer chỉ được edit templates, không được delete

**Các bước**:
1. Tab 3: Phân quyền chi tiết
2. Chọn "Phòng Thiết Kế"
3. ✅ Check 5 designers
4. Click ✅ "edit" trong nhóm "templates"
5. Click ❌ "delete" trong nhóm "templates"
6. Kiểm tra: 5 người đều có quyền edit, không có delete

**Đánh giá**: UX này có dễ không? Có bị nhầm lẫn giữa ✅ và ❌?

### Scenario 3: Xem history vai trò của 1 nhân viên

**Mục tiêu**: Kiểm tra nhân viên X đang có vai trò gì

**Các bước**:
1. Tab 2: Gán vai trò
2. Tìm nhân viên X
3. Click vào card
4. Xem danh sách vai trò hiện tại
5. **Đánh giá**: Có dễ đọc không? Có đủ thông tin (scope, ngày gán...)?

## Bước 6: Báo cáo kết quả

Sau khi test, điền checklist sau:

### Điểm mạnh
- [ ] Giao diện thống nhất, đẹp mắt
- [ ] Dễ tìm kiếm/lọc nhân viên
- [ ] Phân quyền nhanh (bulk operations)
- [ ] Rõ ràng, không bị confuse
- [ ] Responsive tốt

### Điểm yếu (cần cải thiện)
- [ ] Loading chậm ở bước nào?
- [ ] Có bước nào phức tạp, khó hiểu?
- [ ] UI/UX có vấn đề gì? (màu sắc, font, spacing...)
- [ ] Thiếu tính năng gì? (search, sort, export...)
- [ ] Performance issues? (lag, freeze...)

### Đề xuất cải tiến
- Bulk role assignment ở Tab 2 (giống Tab 3)
- Role history/audit log
- Quick filters (preset: "Quản lý", "Nhân viên", "Chưa phân quyền")
- Export danh sách quyền ra Excel
- Notification khi quyền thay đổi
- Permission templates (copy từ user khác)

---

## Tổng kết

**Quy trình phân quyền Admin/CEO**:
```
1. Migration 24 ✅
2. Gán role "Admin" với scope "Toàn hệ thống" ✅
3. Test quyền: Projects, Users, Ecosystem ✅
4. Đánh giá UX/UI (checklist) 📋
5. Test scenarios thực tế 🎬
6. Báo cáo kết quả + đề xuất 📊
```

**Thời gian ước tính**: 15-20 phút cho toàn bộ flow (kể cả test UX)

**Liên hệ hỗ trợ**: Nếu gặp vấn đề, chụp màn hình + mô tả lỗi.
