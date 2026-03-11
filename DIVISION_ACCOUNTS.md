# 🔑 4 Tài khoản Dashboard Khối

## Hướng dẫn Setup

### Bước 1: Chạy SQL Script
1. Vào **Supabase Dashboard** → Project `kdxypztstbeovyedmvem`
2. Mở **SQL Editor**
3. Copy nội dung file `backend/supabase/19_create_4_divisions_users.sql`
4. Paste vào editor và **Run**

Script sẽ tự động:
- ✅ Tạo 4 Khối (Divisions)
- ✅ Tạo 4 tài khoản quản lý
- ✅ Gán users vào Khối tương ứng
- ✅ Gán Stage Groups cho từng Khối

---

## 📋 4 Tài khoản & Dashboard

### 1. 💼 Khối Kinh doanh
**Email:** `kinhdoanh@tubep.vn`  
**Password:** `admin123`  
**Tên:** Trưởng Khối Kinh doanh  
**Khối:** Kinh doanh (KD)  
**Quy trình:** Tư vấn → Thiết kế → Báo giá → Hợp đồng  
**Màu:** 🔵 Xanh dương (#3B82F6)  
**Icon:** 💼

**Dashboard URL:**
```
https://tubep-frontend-s30w.onrender.com/divisions/{id-khối-kinh-doanh}
```

---

### 2. 🏭 Khối Sản xuất
**Email:** `sanxuat@tubep.vn`  
**Password:** `admin123`  
**Tên:** Trưởng Khối Sản xuất  
**Khối:** Sản xuất (SX)  
**Quy trình:** Lên KH → Vật tư → SX thùng → Hoàn thiện → ACS → Đóng gói  
**Màu:** 🟠 Cam (#F59E0B)  
**Icon:** 🏭

**Dashboard URL:**
```
https://tubep-frontend-s30w.onrender.com/divisions/{id-khối-san-xuat}
```

---

### 3. 🚛 Khối Vận chuyển
**Email:** `vanchuyen@tubep.vn`  
**Password:** `admin123`  
**Tên:** Trưởng Khối Vận chuyển  
**Khối:** Vận chuyển (VC)  
**Quy trình:** Vận chuyển hàng đến công trình  
**Màu:** 🟢 Xanh lá (#10B981)  
**Icon:** 🚛

**Dashboard URL:**
```
https://tubep-frontend-s30w.onrender.com/divisions/{id-khối-van-chuyen}
```

---

### 4. 🔧 Khối Lắp đặt & CSKH
**Email:** `lapdathb@tubep.vn`  
**Password:** `admin123`  
**Tên:** Trưởng Khối Lắp đặt  
**Khối:** Lắp đặt & CSKH (LD)  
**Quy trình:** Lắp đặt → Nghiệm thu → Bàn giao → Chăm sóc KH  
**Màu:** 🔴 Đỏ (#EF4444)  
**Icon:** 🔧

**Dashboard URL:**
```
https://tubep-frontend-s30w.onrender.com/divisions/{id-khối-lap-dat}
```

---

## 🎯 Cách Đăng nhập & Xem Dashboard

### Cách 1: Đăng nhập trực tiếp
1. Vào trang login: `https://tubep-frontend-s30w.onrender.com/login`
2. Nhập email + password (ví dụ: `kinhdoanh@tubep.vn` / `admin123`)
3. Sau khi đăng nhập, vào **Hệ sinh thái** (menu sidebar)
4. Click vào **Khối** tương ứng → Xem Dashboard

### Cách 2: Lấy URL trực tiếp
1. Đăng nhập bằng tài khoản `admin@tubep.vn` / `admin123`
2. Vào **Hệ sinh thái**
3. Click vào từng Khối → Copy URL từ browser
   - URL sẽ có dạng: `/divisions/{division-id}`
4. Logout → Đăng nhập bằng tài khoản Khối tương ứng → Paste URL

---

## 📊 Dashboard mỗi Khối hiển thị gì?

Mỗi tài khoản khi đăng nhập sẽ thấy:

### 1. **KPI Cards** (4 thẻ thống kê)
- 📁 Dự án (tổng số, đang làm, hoàn thành)
- ✅ Công việc (% hoàn thành, tasks đã xong/tổng)
- 👥 Nhân sự (số thành viên trong Khối)
- 📈 Tiến độ (% hoàn thành chung)

### 2. **Quick Action Button**
- 🗂️ **"Xem tất cả Dự án & Nhiệm vụ theo Khối"**
  - Click → Nhảy đến `/divisions/{id}/projects`
  - Hiển thị:
    - 4 summary cards (Tổng NV, Hoàn thành, Đang làm, Quá hạn)
    - Danh sách dự án (expandable)
    - Tasks chi tiết (status, priority, assignee, due date)

### 3. **Charts & Alerts**
- 📊 Biểu đồ phân bổ dự án
- ⚠️ Cảnh báo (overdue projects, high-priority tasks)

### 4. **Active Projects**
- Danh sách dự án đang hoạt động
- Link nhanh đến từng dự án

### 5. **Members**
- Danh sách thành viên trong Khối
- Vai trò (manager, member)

---

## 🔐 Quyền truy cập

Mỗi tài khoản chỉ thấy:
- ✅ Dự án được giao cho Khối của mình
- ✅ Tasks thuộc các dự án đó
- ✅ Thành viên trong Khối

**Ví dụ:**
- `kinhdoanh@tubep.vn` → Chỉ thấy dự án ở giai đoạn Tư vấn/Thiết kế/Báo giá/Hợp đồng
- `sanxuat@tubep.vn` → Chỉ thấy dự án ở giai đoạn Sản xuất
- `vanchuyen@tubep.vn` → Chỉ thấy dự án ở giai đoạn Vận chuyển
- `lapdathb@tubep.vn` → Chỉ thấy dự án ở giai đoạn Lắp đặt & CSKH

---

## 🧪 Test Flow

### Scenario: Dự án từ Kinh doanh → Sản xuất → Vận chuyển → Lắp đặt

1. **Login as `kinhdoanh@tubep.vn`**
   - Tạo dự án mới
   - Giai đoạn: Tư vấn → Thiết kế → Báo giá → Hợp đồng
   - Xem dashboard: Dự án xuất hiện ở Khối Kinh doanh

2. **Chuyển dự án sang Sản xuất**
   - Admin/PM: Gán dự án cho Khối Sản xuất (via Project Flow tab)
   - Login as `sanxuat@tubep.vn`
   - Xem dashboard: Dự án xuất hiện ở Khối Sản xuất
   - Xem tasks: Lên KH, Vật tư, SX thùng, Hoàn thiện, ACS, Đóng gói

3. **Chuyển sang Vận chuyển**
   - Gán cho Khối Vận chuyển
   - Login as `vanchuyen@tubep.vn`
   - Xem dashboard: Dự án xuất hiện, tasks vận chuyển

4. **Chuyển sang Lắp đặt**
   - Gán cho Khối Lắp đặt
   - Login as `lapdathb@tubep.vn`
   - Xem dashboard: Dự án xuất hiện, tasks lắp đặt + CSKH

---

## 📝 Notes

- Tất cả 4 tài khoản đều có `role = 'manager'`
- Password mặc định: `admin123` (nên đổi sau khi test xong)
- Nếu cần nhiều user hơn cho mỗi Khối, tạo thêm user và gán vào `ecosystem_unit_members`

---

## 🆘 Troubleshooting

### Không thấy dự án trong Dashboard?
- ✅ Kiểm tra dự án đã được gán cho Khối chưa (bảng `project_company_assignments`)
- ✅ Kiểm tra user đã được gán vào Khối chưa (bảng `ecosystem_unit_members`)

### Dashboard trống rỗng?
- ✅ Chưa có dự án nào được gán cho Khối
- ✅ Tạo dự án mới và gán cho Khối (via CreateProject hoặc ProjectDetail → Flow tab)

### Không đăng nhập được?
- ✅ Kiểm tra email/password đúng chưa
- ✅ Kiểm tra script SQL đã chạy thành công chưa
- ✅ Verify trong Supabase: `SELECT * FROM users WHERE email LIKE '%tubep.vn'`

---

**Happy Testing! 🎉**
