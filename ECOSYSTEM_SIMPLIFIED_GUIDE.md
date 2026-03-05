# 🏢 HƯỚNG DẪN HỆ SINH THÁI - ĐƠN GIẢN HÓA (2026-03-05)

## 🎯 TỔNG QUAN CẢI TIẾN

Chúng tôi đã đơn giản hóa **Hệ Sinh Thái** để người dùng mới dễ sử dụng hơn:

### ✅ **Những gì đã thay đổi:**

1. **🧙 Setup Wizard** - Hướng dẫn từng bước cho lần đầu
2. **📋 List View** - Chế độ danh sách thu gọn, dễ điều hướng
3. **🌳 Diagram View** - Giữ nguyên sơ đồ cây (cho ai đã quen)
4. **❓ Help Panel** - Hướng dẫn ngay trong trang
5. **🎨 UI thân thiện** - Ngôn ngữ rõ ràng, icons trực quan

---

## 📖 HƯỚNG DẪN CHO NGƯỜI DÙNG MỚI

### **1. LẦN ĐẦU SỬ DỤNG**

Khi bạn vào trang **"Cấu Trúc Công Ty"** lần đầu:

```
┌────────────────────────────────────────┐
│ 🏢 THIẾT LẬP CẤU TRÚC CÔNG TY          │
├────────────────────────────────────────┤
│ Chào mừng! Hãy thiết lập công ty       │
│ của bạn trong 4 bước đơn giản          │
│                                        │
│ Progress: ■□□□ 25%                    │
│                                        │
│ BƯỚC 1/4: Tạo Khối                    │
│ "Khối là nhóm các công ty"             │
│                                        │
│ [Input fields...]                      │
│                                        │
│ [Quay lại]  [Tiếp tục ▶]              │
└────────────────────────────────────────┘
```

**4 bước:**
1. **Tạo Khối** (VD: Miền Nam, Miền Bắc)
2. **Tạo Công ty** (VD: Công ty Tủ Bếp A)
3. **Chọn Phòng ban** (Tư vấn, Thiết kế, Sản xuất...)
4. **Xác nhận** → Tạo tất cả cùng lúc

**Ưu điểm:**
- ✅ Không cần hiểu khái niệm phức tạp
- ✅ Có gợi ý và ví dụ mỗi bước
- ✅ Có thể "Bỏ qua" nếu đã quen
- ✅ Có tooltip "Trợ giúp" mỗi bước

---

### **2. CHẾ ĐỘ XEM**

Sau khi thiết lập xong, bạn có **2 chế độ xem**:

#### **📋 Chế độ Danh sách** (Mặc định - Dễ nhất)

```
┌─────────────────────────────────────┐
│ 🏢 Cấu Trúc Công Ty                 │
├─────────────────────────────────────┤
│ [Tìm kiếm: ......] [🔍]            │
│                                     │
│ [▼] 📦 Khối Miền Nam               │
│     └─ [▼] 🏢 Công ty A            │
│         ├─ [▶] 👔 PB Tư vấn        │
│         ├─ [▶] 🎨 PB Thiết kế      │
│         └─ [▶] 🏭 PB Sản xuất      │
│                                     │
│ [▶] 📦 Khối Miền Bắc               │
│                                     │
│ [+ Thêm Khối]                      │
└─────────────────────────────────────┘
```

**Thao tác:**
- Click **▼/▶** để mở/đóng
- Click **tên đơn vị** để xem chi tiết
- Nút **Sửa** để chỉnh sửa
- Nút **+** để thêm đơn vị con

**Phù hợp:**
- ✅ Người mới
- ✅ Mobile
- ✅ Danh sách dài (>20 đơn vị)
- ✅ Tìm kiếm nhanh

---

#### **🌳 Chế độ Sơ đồ** (Visual)

```
            [Tập đoàn]
                │
        ┌───────┴───────┐
     [Khối MN]       [Khối MB]
        │               │
    ┌───┴───┐       ┌───┴───┐
  [Cty A] [Cty B] [Cty C] [Cty D]
```

**Thao tác:**
- **Kéo** để di chuyển canvas
- **Ctrl + Scroll** để zoom in/out
- **Click nút Reset** để về mặc định

**Phù hợp:**
- ✅ Xem tổng quan
- ✅ Hiểu cấu trúc phân cấp
- ✅ Desktop (màn hình lớn)
- ✅ Trình bày cho sếp

---

### **3. CHUYỂN ĐỔI CHẾ ĐỘ**

Bấm nút toggle ở góc trên:

```
┌─────────────────────────────┐
│ [📋 Danh sách] [🌳 Sơ đồ]  │
│  ← Active        Inactive → │
└─────────────────────────────┘
```

---

### **4. HƯỚNG DẪN NGAY TRONG TRANG**

Bấm nút **"❓ Hướng dẫn"** → Hiện panel:

```
┌──────────────────────────────────────────┐
│ ❓ Hướng dẫn sử dụng                     │
├──────────────────────────────────────────┤
│ • 📋 Chế độ Danh sách: ...              │
│ • 🌳 Chế độ Sơ đồ: ...                  │
│ • 📋 Cấu trúc: Khối > Công ty > PB      │
│ • ⚡ Thao tác nhanh: ...                │
└──────────────────────────────────────────┘
```

**Nội dung:**
- Giải thích mỗi chế độ
- Hướng dẫn thao tác
- Giải thích khái niệm (Khối, Công ty, PB)
- Tips sử dụng nhanh

---

## 🔧 CHO ADMIN/MANAGER

### **Thêm đơn vị**

**Cách 1: Qua Wizard (Lần đầu)**
1. Vào trang "Cấu Trúc Công Ty"
2. Bấm **"Bắt đầu thiết lập"**
3. Làm theo 4 bước
4. Bấm **"Hoàn tất"**

**Cách 2: Thêm thủ công**
1. Chọn đơn vị cha (hoặc "Thêm gốc")
2. Bấm nút **"+"**
3. Điền form
4. Bấm **"Lưu"**

---

### **Sửa đơn vị**

1. Click vào **tên đơn vị** trong List/Diagram
2. Modal hiện ra với thông tin
3. Chỉnh sửa
4. Bấm **"Lưu"**

**Có thể sửa:**
- Tên, mô tả
- Thêm/xóa thành viên
- Gán vai trò (Giám đốc, Quản lý, Nhân viên)
- Link với Công ty/Phòng ban thật

---

### **Xóa đơn vị**

⚠️ **Cẩn thận!** Xóa đơn vị sẽ xóa cả các đơn vị con.

1. Click vào đơn vị
2. Bấm nút **"Xóa"** (màu đỏ)
3. Xác nhận

---

## 📊 SO SÁNH 2 CHẾ ĐỘ

| Tính năng | 📋 Danh sách | 🌳 Sơ đồ |
|-----------|-------------|---------|
| **Dễ dùng** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Mobile** | ✅ Tốt | ❌ Khó |
| **Tìm kiếm** | ✅ Có | ❌ Không |
| **Visual** | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Tốc độ** | ⚡ Nhanh | 🐌 Chậm (nhiều unit) |
| **Thao tác** | Click | Kéo + Zoom |

**Khuyên dùng:**
- 👉 **Danh sách** cho công việc hàng ngày
- 👉 **Sơ đồ** cho overview và trình bày

---

## 🎓 KHÁI NIỆM CƠ BẢN

### **Khối (Division)**
- **Là gì:** Nhóm các công ty (VD: Miền Nam, Miền Bắc, Miền Trung)
- **Khi nào cần:** Khi có nhiều chi nhánh/vùng
- **Nếu chỉ có 1 văn phòng:** Tạo 1 Khối tên "Trụ sở chính"

### **Công ty (Company)**
- **Là gì:** Đơn vị kinh doanh (VD: Công ty Tủ Bếp A, Công ty Đồ Gỗ B)
- **Khi nào cần:** Mỗi pháp nhân/đơn vị riêng
- **Thuộc:** 1 Khối

### **Phòng ban (Department)**
- **Là gì:** Bộ phận trong công ty (Tư vấn, Thiết kế, Sản xuất...)
- **Khi nào cần:** Phân chia công việc
- **Thuộc:** 1 Công ty

### **Nhân viên (Member)**
- **Là gì:** Người trong phòng ban
- **Vai trò:** Giám đốc, Quản lý, Trưởng nhóm, Nhân viên
- **Thuộc:** 1 hoặc nhiều Phòng ban

---

## 🚀 WORKFLOW THỰC TẾ

### **Ví dụ: Công ty Tủ Bếp TuBep Pro**

**Bước 1: Thiết lập**
```
Tập đoàn TuBep Pro
│
├─ Khối Miền Nam
│  ├─ Công ty A (Tủ bếp Thiết kế)
│  │  ├─ PB Tư vấn (3 người)
│  │  ├─ PB Thiết kế (2 người)
│  │  ├─ PB Sản xuất (5 người)
│  │  └─ PB Lắp đặt (4 người)
│  │
│  └─ Công ty B (Tủ bếp Cao cấp)
│     ├─ PB Tư vấn (2 người)
│     └─ PB Thiết kế (3 người)
│
└─ Khối Miền Bắc
   └─ Công ty C
      └─ ...
```

**Bước 2: Gán nhân viên**
1. Vào **PB Tư vấn** của Công ty A
2. Bấm **"+ Thêm nhân viên"**
3. Chọn người từ danh sách hoặc mời mới
4. Gán vai trò: **Trưởng phòng** hoặc **Nhân viên**

**Bước 3: Tạo dự án**
1. Khi tạo dự án → Chọn **Công ty A**
2. Hệ thống tự động gán:
   - Tasks cho từng Phòng ban
   - Người phụ trách theo vai trò
   - Luồng công việc chuẩn

**Bước 4: Theo dõi**
- Dashboard hiển thị tiến độ theo Công ty/Phòng ban
- Báo cáo theo Khối
- Dễ dàng thay đổi cấu trúc khi cần

---

## 💡 TIPS & TRICKS

### **1. Tìm kiếm nhanh**
- Trong **List View**: Có ô tìm kiếm
- Gõ tên Khối/Công ty/Phòng ban
- Kết quả highlight ngay

### **2. Keyboard shortcuts**
- **Enter** trong Wizard: Tiếp tục bước tiếp
- **Esc**: Đóng modal
- **Tab**: Di chuyển giữa các field

### **3. Mobile usage**
- Dùng **List View** (dễ hơn Sơ đồ)
- Scroll dọc để xem toàn bộ
- Click để mở/đóng từng cấp

### **4. Best practices**
- ✅ Đặt tên rõ ràng (tránh viết tắt)
- ✅ Gán Giám đốc/Quản lý cho mỗi đơn vị
- ✅ Review cấu trúc định kỳ (3-6 tháng)
- ✅ Xóa đơn vị không dùng (để gọn)

---

## ❓ FAQ

### **Q: Wizard chỉ chạy 1 lần?**
A: Không! Bạn có thể chạy lại wizard bằng cách:
- Xóa tất cả đơn vị (admin)
- Hoặc bấm nút "Bắt đầu thiết lập" khi chưa có unit

### **Q: Có thể thay đổi sau khi tạo?**
A: Có! Mọi thứ đều có thể sửa/xóa sau.

### **Q: Làm sao để import dữ liệu có sẵn?**
A: Liên hệ admin để import CSV/Excel vào database.

### **Q: Giới hạn số lượng đơn vị?**
A: Không giới hạn. Nhưng nên:
- < 50 đơn vị: Dùng cả List và Sơ đồ
- > 50 đơn vị: Ưu tiên List View (nhanh hơn)

### **Q: Có thể có nhiều Giám đốc?**
A: Không. Mỗi đơn vị chỉ nên có 1 Giám đốc (director).
- Nếu cần nhiều người quản lý → Gán vai trò "Quản lý" (manager)

---

## 🛠️ CHO DEVELOPER

### **Files đã thay đổi:**

1. **Frontend:**
   - `frontend/src/components/EcosystemSetupWizard.jsx` (NEW)
   - `frontend/src/components/EcosystemListView.jsx` (NEW)
   - `frontend/src/pages/EcosystemPage.jsx` (UPDATED)

2. **Backend:**
   - `backend/src/routes/ecosystem.js` (UPDATED - added `/setup-wizard` endpoint)

### **API Endpoint mới:**

```http
POST /ecosystem/setup-wizard
Content-Type: application/json

{
  "divisions": [
    { "name": "Khối Miền Nam", "description": "..." }
  ],
  "companies": [
    { "name": "Công ty A", "type": "kitchen", "divisionIndex": 0 }
  ],
  "departments": [
    { "id": "sales", "label": "Tư vấn", "defaultCount": 3 }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Đã tạo 12 đơn vị",
  "units": [...]
}
```

### **Testing:**

```bash
# Start frontend
cd frontend && npm run dev

# Start backend
cd backend && npm run dev

# Test wizard:
1. Login as admin
2. Go to /ecosystem
3. Click "Bắt đầu thiết lập"
4. Complete 4 steps
5. Verify units created
```

---

## 📈 NEXT STEPS

### **Phase 2: Enhancements**
- [ ] Search box trong List View
- [ ] Filter theo Khối/Công ty
- [ ] Export structure to Excel
- [ ] Import from CSV
- [ ] Drag-drop để re-order
- [ ] Color coding theo level
- [ ] Role-based permissions UI

### **Phase 3: Advanced**
- [ ] Template structures (save/load)
- [ ] Duplicate unit với children
- [ ] Bulk edit (chọn nhiều đơn vị)
- [ ] History & Rollback
- [ ] Notification khi thay đổi cấu trúc

---

## 📞 HỖ TRỢ

Nếu gặp vấn đề:
1. Bấm nút **"❓ Hướng dẫn"** trong trang
2. Xem **FAQ** phía trên
3. Liên hệ admin/developer

---

**Cập nhật:** 2026-03-05  
**Phiên bản:** 1.0 - Simplified Ecosystem  
**Người tạo:** OpenClaw AI Assistant
