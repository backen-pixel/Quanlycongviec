# 📖 HƯỚNG DẪN SỬ DỤNG CRM — TuBep Pro

## Mục lục
0. [Admin hệ thống và Admin công ty](#0-admin-hệ-thống-và-admin-công-ty)
1. [Tổng quan luồng CRM](#1-tổng-quan-luồng-crm)
2. [Tạo Lead mới](#2-tạo-lead-mới)
3. [Quản lý Lead — Pipeline Kanban](#3-quản-lý-lead--pipeline-kanban)
4. [Chuyển Lead → Deal](#4-chuyển-lead--deal)
5. [Quản lý Deal — Pipeline Kanban](#5-quản-lý-deal--pipeline-kanban)
6. [Tạo Báo giá từ Lead/Deal](#6-tạo-báo-giá-từ-leaddeal)
7. [Báo giá → Đơn hàng (tự động)](#7-báo-giá--đơn-hàng-tự-động)
8. [Tạo Dự án từ Deal](#8-tạo-dự-án-từ-deal)
9. [Đơn hàng → Hóa đơn → Thu tiền](#9-đơn-hàng--hóa-đơn--thu-tiền)
10. [Auto-Flow Engine (tự động hóa)](#10-auto-flow-engine)

---

## 0. Admin hệ thống và Admin công ty

Trong hệ thống dùng **cùng role `admin`** trong bảng nhân sự; phân biệt bằng trường **công ty** trên tài khoản (`users.company_id`):

| Loại | Điều kiện | Quyền gần đúng |
|------|-----------|----------------|
| **Admin hệ thống (tổng)** | `role = admin` và **không** gán `company_id` | Xem và lọc **mọi công ty** trên CRM (dropdown công ty, pipeline, lead/deal toàn hệ thống). |
| **Admin công ty** | `role = admin` và **có** `company_id` | Quản trị CRM **chỉ trong công ty đó**: API và danh sách công ty chỉ trả một công ty; không mở được dữ liệu lead/deal công ty khác. Vẫn là admin trong phạm vi công ty (gán NV, sửa pipeline công ty mình, v.v.). |

Nhân viên không phải admin vẫn chỉ thấy lead/deal theo quy tắc phụ trách như trước.

---

## 1. Tổng quan luồng CRM

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│   LEAD   │───▶│   DEAL   │───▶│  BÁO GIÁ │───▶│ ĐƠN HÀNG │───▶│ HÓA ĐƠN │
│ (Cơ hội) │    │(Đã chốt) │    │          │    │          │    │  + Thu $ │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
                      │                                │
                      ▼                                ▼
                ┌──────────┐                    ┌──────────┐
                │  DỰ ÁN   │───────────────────▶│  TASKS   │
                │ (Project) │                    │ (Auto-gen)│
                └──────────┘                    └──────────┘
```

**2 pipeline song song:**
- **Lead Pipeline**: Mới → Liên hệ → Khảo sát → Đề xuất → **Chuyển Deal** ✅
- **Deal Pipeline**: Tư vấn → Thiết kế → Báo giá → Hợp đồng → **Thắng** ✅ / Thua ❌

---

## 2. Tạo Lead mới

### Cách 1: Từ CRM Dashboard
1. Vào **CRM** (menu bên trái, mục "CRM" hoặc `/crm`)
2. Click nút **"+ Thêm Lead"** (góc trên phải)
3. Điền thông tin:
   - **Tiêu đề**: VD: "Tủ bếp chữ L gỗ sồi - Anh Minh"
   - **Khách hàng**: Chọn KH có sẵn hoặc tạo mới
   - **Giá trị ước tính**: VD: 150,000,000
   - **Nguồn**: Zalo, Facebook, Website, Giới thiệu...
   - **Mức ưu tiên**: Cao / Trung bình / Thấp
   - **Công ty**: Gán cho đơn vị nào xử lý
4. Click **"Lưu"**
5. Lead xuất hiện ở cột đầu tiên trên Kanban board

### Cách 2: Từ AI Assistant
- Gõ trong chat AI: "Tạo lead mới cho anh Nguyễn Văn A, SĐT 0901234567, cần tủ bếp 150 triệu"

---

## 3. Quản lý Lead — Pipeline Kanban

### Xem Kanban
- CRM Dashboard hiển thị **Kanban board** — kéo thả lead giữa các cột
- Mỗi cột = 1 giai đoạn pipeline (VD: Mới → Liên hệ → Khảo sát...)

### Vào chi tiết Lead
- Click vào card lead → Mở trang **LeadDetail** (`/crm/leads/:id`)
- Trang này có:
  - **Pipeline Progress**: Thanh tiến trình — click vào bước để chuyển giai đoạn
  - **Thông tin KH**: Tên, SĐT, email, địa chỉ — click để sửa inline
  - **Tab Công việc**: Tự động tạo task theo giai đoạn (tư vấn, khảo sát...)
  - **Tab Tài liệu**: Upload file / nhập văn bản (yêu cầu KH, bản vẽ, số đo...)
  - **Tab Hoạt động**: Ghi lại gọi điện, gặp mặt, email, Zalo...

### Di chuyển Lead qua các giai đoạn
- **Cách 1**: Trên Pipeline Progress → Click vào bước tiếp theo
- **Cách 2**: Trên CRM Dashboard → Kéo thả card sang cột mới

### Thêm hoạt động
1. Trong LeadDetail → Tab **"💬 Hoạt động"**
2. Click **"+ Thêm"**
3. Chọn loại: Gọi điện / Gặp mặt / Email / Zalo / Ghi chú
4. Nhập tiêu đề + nội dung + kết quả
5. Lưu → Hiển thị trên timeline

---

## 4. Chuyển Lead → Deal

### Điều kiện chuyển đổi
- Khách hàng phải có đầy đủ: **Tên** + **SĐT**
- Nếu thiếu → hệ thống báo lỗi, yêu cầu bổ sung

### Cách chuyển
1. Vào **LeadDetail** (`/crm/leads/:id`)
2. Click nút **"⚡ Chuyển Deal"** (nút xanh lá, góc trên phải)
3. Popup xác nhận hiển thị:
   - ✅ Yêu cầu: Tên KH + SĐT
   - 💡 Giải thích: Lead chuyển sang pipeline Deal
4. Click **"🚀 Chuyển sang Deal"**
5. **Kết quả**:
   - Lead biến thành Deal
   - Chuyển sang pipeline Deal (Tư vấn → Thiết kế → Báo giá → Hợp đồng → Thắng)
   - Tất cả tài liệu, hoạt động, công việc được giữ lại
   - Badge hiển thị "🎯 DEAL" thay vì "💼 LEAD"

### ⚠️ Lưu ý quan trọng
- Chuyển Lead → Deal là **MỘT CHIỀU** (không quay lại Lead được)
- Sau khi chuyển Deal, bạn có thể:
  - Tạo Báo giá
  - Tạo Dự án
  - Theo dõi qua pipeline Deal

---

## 5. Quản lý Deal — Pipeline Kanban

### Pipeline Deal gồm các giai đoạn:
1. **Tư vấn** → Tiếp tục tư vấn, làm rõ yêu cầu
2. **Thiết kế** → Thiết kế, bản vẽ, mẫu 3D
3. **Báo giá** → Gửi báo giá cho KH
4. **Hợp đồng** → Đàm phán, ký hợp đồng
5. **Thắng** ✅ → Chốt thành công → Tạo dự án
6. **Thua** ❌ → Đánh dấu thất bại

### Auto Tasks
- Khi Deal chuyển sang giai đoạn mới → hệ thống **tự động tạo công việc**
- VD: Chuyển sang "Thiết kế" → Tạo task: "Khảo sát thực tế", "Lên bản vẽ 2D/3D"...
- Xem trong tab **"✅ Công việc"** của LeadDetail

---

## 6. Tạo Báo giá từ Lead/Deal

### Bước 1: Mở form tạo báo giá
- **Cách 1**: Trong LeadDetail → Click nút **"📄 Báo giá"** → Tự điền thông tin KH
- **Cách 2**: Vào **CRM > Báo giá** → Click **"+ Tạo báo giá"**

### Bước 2: Điền thông tin
1. **Thông tin KH**: Tên, SĐT, địa chỉ (tự điền nếu từ Lead/Deal)
2. **Tiêu đề**: VD: "Báo giá tủ bếp chữ L gỗ sồi"

### Bước 3: Thêm sản phẩm (3 cách)
- **🔍 Cách 1 — Gõ tên SP**: Gõ trực tiếp vào ô "Tên hàng hóa" → Dropdown gợi ý → Click chọn → Tự điền giá, mã, ĐVT
- **🔍 Cách 2 — Nút Tìm & thêm**: Click **"Tìm & thêm sản phẩm"** → Modal popup → Lọc nhóm ngành → Chọn nhiều SP → Thêm tất cả
- **📝 Cách 3 — Nhập tay**: Click **"Thêm dòng trống"** → Nhập tên, giá, SL thủ công

### Bước 4: Điền chi tiết
- **SL, Đơn giá**: Nhập trực tiếp
- **CK%**: Chiết khấu theo dòng
- **%VAT**: Thuế VAT theo dòng (mặc định 0%)
- **Kích thước**: Cao × Rộng × Dài (nếu cần)
- **CTKM / KM**: Chương trình khuyến mãi

### Bước 5: Điều khoản + Lưu
- **Hiệu lực đến**: Ngày hết hạn báo giá
- **Điều khoản thanh toán**: Chọn có sẵn hoặc nhập tùy chỉnh
- Click **"💾 Lưu"**

### Bước 6: Gửi & Xuất PDF
- Trạng thái: 📝 Nháp → 📤 Đã gửi KH → ✅ KH chấp nhận / ❌ Từ chối
- Click **"Xuất PDF"** → Download file PDF gửi cho KH

---

## 7. Báo giá → Đơn hàng (tự động)

### Khi KH chấp nhận báo giá
1. Trong form sửa báo giá → Chọn trạng thái **"✅ KH chấp nhận"**
2. **Auto-Flow** tự động kích hoạt:
   - ✅ Tạo **Đơn hàng** từ báo giá (copy toàn bộ sản phẩm + giá)
   - ✅ Tạo **Dự án** tự động (nếu có template)
   - ✅ Gen **Tasks** tự động (theo template)
3. Popup thông báo: "🚀 Tự động tạo ĐH DH-2026-001 + Dự án TB-2026-005"

### Tạo đơn hàng thủ công
- Vào **CRM > Đơn hàng** → Click **"+ Tạo đơn hàng"**
- Form tương tự báo giá: chọn KH, thêm SP, tính tổng

---

## 8. Tạo Dự án từ Deal

### Khi nào tạo dự án?
- **Tự động**: Khi BG chấp nhận hoặc ĐH xác nhận (Auto-Flow)
- **Thủ công**: Khi Deal đạt "Thắng" hoặc bất cứ lúc nào

### Tạo dự án thủ công
1. Trong **LeadDetail** (Deal đã Thắng) → Click **"📁 Tạo dự án"**
2. Hoặc vào **Công việc > Dự án** → Click **"+ Tạo dự án"**
3. Nếu từ Deal, URL sẽ là `/projects/create?deal_id=xxx` → Tự điền thông tin KH

### Form tạo dự án gồm:
1. **Tab Thông tin**: Tên dự án, KH, địa chỉ lắp đặt, giá trị, deadline
2. **Tab Luồng công việc**: Chọn workflow flow → Hiển thị các bước (Khối)
3. **Tab Tasks**: Chọn template set cho mỗi Khối → Xem tasks sẽ được tạo
4. **Tab Phân công**: Gán nhân viên cho từng task

### Sau khi tạo dự án:
- Dự án xuất hiện trong **Công việc > Dự án** (Kanban)
- Tasks được gen tự động theo template
- Mỗi Khối (Tư vấn, Thiết kế, Sản xuất...) có tasks riêng
- Deal liên kết với dự án → Badge "📁 Xem dự án" trong LeadDetail

---

## 9. Đơn hàng → Hóa đơn → Thu tiền

### Tạo hóa đơn từ đơn hàng
1. Vào **CRM > Đơn hàng** → Click vào đơn hàng
2. Click nút **"🧾 Tạo hóa đơn"** → Tự copy toàn bộ sản phẩm + KH
3. Hóa đơn xuất hiện trong **CRM > Hóa đơn**

### Tạo hóa đơn thủ công
- **CRM > Hóa đơn** → **"+ Tạo hóa đơn"** → Nhập KH, SP, giá

### Thu tiền
1. Vào chi tiết hóa đơn (`/crm/invoices/:id`)
2. Click **"💵 Thu tiền"** (chỉ hiện khi còn nợ)
3. Nhập:
   - **Số tiền**: Mặc định = số còn nợ
   - **Hình thức**: Chuyển khoản / Tiền mặt
   - **Số GD / Ghi chú**: Mã giao dịch ngân hàng
4. Click **"Xác nhận thu"**
5. Tiến độ thanh toán cập nhật: Thanh progress bar + trạng thái

### Trạng thái thanh toán
- 🔴 **Chưa TT**: 0%
- 🟡 **Đã TT một phần**: 1-99%
- 🟢 **Đã TT đủ**: 100%

### Xuất PDF / In hóa đơn
- Nút **"📥 Xuất PDF"** → Download PDF
- Nút **"🖨️ In hóa đơn"** → Mở cửa sổ in

---

## 10. Auto-Flow Engine

### Tự động hóa toàn bộ:

| Sự kiện | Hành động tự động |
|---------|-------------------|
| Lead chốt (Pipeline "Thắng") | Tự tạo Project + Gen Tasks |
| Báo giá được chấp nhận | Tự tạo Đơn hàng + Project |
| Đơn hàng xác nhận | Tự tạo Project (nếu chưa có) + Gen Tasks |
| Project chuyển stage Sản xuất | Sync ĐH → "Đang SX" |
| Project chuyển stage Giao hàng | Sync ĐH → "Đang giao" |
| Project hoàn thành | Tự tạo Hóa đơn từ ĐH chưa xuất |

### Flow liên kết:
- **Lead** → `customer_id`, `project_id`
- **Báo giá** → `lead_id`, `customer_id`
- **Đơn hàng** → `quotation_id`, `customer_id`, `lead_id`
- **Hóa đơn** → `order_id`, `customer_id`
- **Dự án** → `customer_id`, liên kết qua Lead/Deal

---

## 📌 Tóm tắt nhanh — Flow hoàn chỉnh

```
1. Tạo Lead → Tư vấn, khảo sát, ghi hoạt động
2. Chuyển Lead → Deal (khi KH có nhu cầu rõ)
3. Trong Deal: Thiết kế → Báo giá
4. Tạo Báo giá (tìm SP, nhập giá, xuất PDF)
5. KH chấp nhận BG → Auto tạo ĐH + Project
6. Quản lý dự án: Tư vấn → Thiết kế → SX → Lắp đặt
7. Từ ĐH tạo Hóa đơn → Thu tiền
8. Hoàn thành! 🎉
```

---

## ⚠️ Lưu ý trước khi dùng

### SQL cần chạy trên Supabase (theo thứ tự):
1. `database/19_crm_sales.sql` — Bảng CRM core
2. `database/20_product_code_structure.sql` — Mã sản phẩm
3. `database/21_product_categories.sql` — Nhóm ngành

### Cài đặt Pipeline
- Vào **CRM > ⚙️ Cài đặt Pipeline** (`/crm/pipeline-settings`)
- Tùy chỉnh giai đoạn Lead + Deal
- Thêm/xóa/đổi tên/đổi thứ tự

### Cài đặt Nguồn (Sources)
- Nguồn khách hàng: Facebook, Zalo, Website, Giới thiệu...
- Quản lý trong Pipeline Settings
