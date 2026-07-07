# Hướng dẫn chuyển Deal CRM sang Sản xuất

Mẫu thực tế: Công ty Nhôm Kính Phúc Đạt · Deal DEAL-2026-440 → Dự án xưởng TB-2026-337 · Phân loại Cửa

Ảnh minh họa full màn hình (1920×1080) nằm trong `docs/huong-dan-chuyen-deal-sx/` và hiển thị trên Có gì mới? (`/updates`).

---

## Tổng quan luồng

```text
CRM Kanban (Deal)
    → Chuyển cột nhanh / kéo thả sang cột Thắng (Phúc Đạt: «Đã ký hợp đồng.»)
    → Popup «Chuyển Deal sang Sản xuất»: chọn Công ty SX + Phân loại → Tiếp tục
    → Tự tạo dự án xưởng (mã TB-YYYY-NNN)
    → Xưởng SX: Kanban cột «Tiếp nhận»
    → Up bản vẽ (tab Tài liệu) + đính kèm bản vẽ trong Bình luận để trao đổi
    → CRM xác nhận → xưởng chuyển cột pipeline tiếp theo
```

### Phân công theo vai trò

NVKD / Admin CRM
- Chuyển deal sang cột Thắng, chọn xưởng và phân loại
- Theo dõi bình luận và tài liệu từ xưởng, phản hồi xác nhận

Nhân viên Sản xuất
- Nhận thẻ ở cột Tiếp nhận
- Up bản vẽ tab Tài liệu; đính kèm file trong Bình luận khi cần trao đổi nhanh

Admin
- Cấu hình pipeline, phân loại xưởng (Tủ bếp / Cửa / Cánh kính…) tại Pipeline xưởng

---

## Chuẩn bị

1. Đăng nhập TuBep Pro (CRM hoặc Xưởng SX).
2. Lọc Công ty: Công ty Nhôm Kính Phúc Đạt trên CRM Dashboard.
3. Mở tab Deals (Kanban).
4. Deal cần chuyển phải chưa có dự án xưởng — thường là deal đang ở các cột trước Thắng.

---

## Bước 1 — CRM: Chuyển deal sang cột Thắng và chọn công ty sản xuất

### 1.1. Xác định deal trên Kanban

- Vào CRM → Dashboard CRM → tab Deals.
- Bộ lọc: Công ty Nhôm Kính Phúc Đạt.
- Tìm deal (VD: DEAL-2026-440 — CT - ANH HƯỜNG) đang ở cột trước Thắng (VD: Đã cọc thiết kế.).

![Deal trước khi chuyển Thắng](../frontend/public/release-notes/sx-crm-deal-truoc-chuyen-thang.png)

Ghi chú trên ảnh:
- (1) Tab Deals — không dùng tab Leads.
- (2) Chip lọc Công ty Nhôm Kính Phúc Đạt.
- (3) Thẻ deal — nút Chuyển cột nhanh trên thẻ.
- (4) Cột đích Đã ký hợp đồng. = cột Thắng của Phúc Đạt.

### 1.2. Chuyển sang cột Thắng

Cách A — Chuyển cột nhanh (khuyến nghị): Bấm nút chuyển cột trên thẻ → chọn 🎉 Đã ký hợp đồng.

Cách B — Kéo thả: Kéo thẻ deal sang cột Đã ký hợp đồng.

### 1.3. Popup «Chuyển Deal sang Sản xuất»

Ngay khi deal vào cột Thắng, hệ thống hiện popup bắt buộc:

![Chọn công ty và phân loại sản xuất](../frontend/public/release-notes/sx-crm-chon-cong-ty-san-xuat.png)

Ghi chú trên ảnh:
- (1) Tiêu đề Chuyển Deal sang Sản xuất — deal đã Thắng.
- (2) Công ty Sản xuất (bắt buộc): Phúc Đạt tự SX → chọn Công ty Nhôm Kính Phúc Đạt; có thể chọn xưởng khác nếu gia công ngoài.
- (3) Phân loại sản xuất (bắt buộc): Tủ bếp, Cánh kính, Cửa… — quyết định pipeline Kanban xưởng.
- (4) Tiếp tục — tạo dự án TB-… và liên kết deal.

![Deal đã nằm ở cột Thắng](../frontend/public/release-notes/sx-crm-deal-cot-thang.png)

Sau khi tạo dự án, tab CRM có thể chuyển sang Đơn hàng. Deal vẫn xem được ở cột Đã ký hợp đồng khi lọc deal.

---

## Bước 2 — Sản xuất: Deal hiển thị ở cột Tiếp nhận

### 2.1. Mở module Xưởng SX

- Bấm CRM — chuyển sang Xưởng SX trên sidebar.
- Vào Deal vào xưởng (`/sx/dashboard`).

### 2.2. Lọc đúng xưởng và phân loại

- Xưởng / Công ty Sản xuất: Công ty Nhôm Kính Phúc Đạt
- Phân loại: Cửa (khớp bước 1)
- Tìm kiếm: TB-2026-337 hoặc tên khách

Lưu ý: Nếu không thấy thẻ, kiểm tra lọc xưởng đang trỏ sai công ty, hoặc phân loại Kanban không khớp (Tủ bếp vs Cửa).

![Dự án ở cột Tiếp nhận](../frontend/public/release-notes/sx-kanban-tiep-nhan.png)

Ghi chú trên ảnh:
- (1) Chip Xưởng: Công ty Nhôm Kính Phúc Đạt + Phân loại: Cửa.
- (2) Cột Tiếp nhận — cột đầu pipeline phân loại Cửa.
- (3) Thẻ TB-2026-337 — badge CRM, tên khách và NVKD.
- (4) Nhãn MỚI — vừa bàn giao từ CRM.

Bấm tiêu đề thẻ → mở Chi tiết dự án (`/sx/projects/{id}`).

---

## Bước 3 — Sản xuất: Tài liệu, bình luận và trao đổi bản vẽ

### 3.1. Lưu bản vẽ chính thức — tab Tài liệu

1. Từ Kanban, mở dự án TB-2026-337.
2. Chọn tab 📋 Tài liệu.
3. Bấm Upload file xưởng → chọn file bản vẽ (PDF, DWG, JPG…).
4. (Tuỳ chọn) Bấm Chia sẻ CRM trên file vừa up → bên CRM/deal cũng thấy tài liệu.

Gợi ý:
- File chỉ dùng nội bộ xưởng: up bình thường, không bật chia sẻ CRM.
- Cần NVKD duyệt trên deal: bật Chia sẻ CRM sau khi up.

![Tab Tài liệu — Upload file xưởng](../frontend/public/release-notes/sx-tab-tai-lieu-upload.png)

Ghi chú trên ảnh:
- (1) Tab 📋 Tài liệu trong chi tiết TB-2026-337.
- (2) Nút Upload file xưởng.
- (3) Chú thích tài liệu CRM (tím) vs tài liệu xưởng; nút Chia sẻ CRM.
- (4) Banner vàng: tài liệu CRM chưa chia sẻ xưởng.
- (5) Pipeline stepper đang ở Tiếp nhận.

### 3.2. Trao đổi nhanh — đính kèm bản vẽ trong Bình luận

Tab Tài liệu phù hợp để lưu bản vẽ chính thức. Khi cần trao đổi, hỏi nhanh hoặc gửi bản phác thảo, dùng Bình luận kèm file:

Tab Bình luận (trong chi tiết dự án)
1. Mở tab 💬 Bình luận.
2. Bấm biểu tượng đính kèm (kẹp giấy) ở ô soạn thảo → chọn file bản vẽ.
3. Hoặc dán trực tiếp ảnh/PDF vào ô soạn (Ctrl+V).
4. Gõ nội dung ngắn, VD: «Đính kèm bản vẽ SX, nhờ CRM kiểm tra và phản hồi».
5. Dùng @ để nhắc NVKD phụ trách deal → bấm Đăng.

Bình luận nhanh (từ Kanban)
- Bấm Bình luận nhanh trên thẻ → gõ lời nhắn text (không đính kèm file).
- Dùng khi chỉ cần nhắc CRM đã up bản vẽ ở tab Tài liệu.
- Cần gửi kèm file → vào chi tiết dự án, tab Bình luận.

![Bình luận nhanh — đợi CRM xác nhận](../frontend/public/release-notes/sx-binh-luan-doi-crm.png)

Ghi chú trên ảnh:
- (1) Popup Bình luận nhanh gắn mã TB-2026-337.
- (2) Nội dung mẫu nhắc CRM kiểm tra bản vẽ.
- (3) CRM thấy bình luận trên deal hoặc tab Bình luận chi tiết dự án.

Phía CRM: mở deal → tab Bình luận → xem file đính kèm, trả lời hoặc đính kèm bản chỉnh sửa ngay trong luồng.

### 3.3. Phía CRM xác nhận

1. Mở deal DEAL-2026-440 (hoặc link từ thẻ CRM trên Kanban xưởng).
2. Kiểm tra tab Tài liệu và Bình luận (kể cả file đính kèm).
3. Phản hồi «Đã OK bản vẽ» hoặc yêu cầu chỉnh sửa.
4. Sau khi OK → xưởng Chuyển cột nhanh sang Thiết kế và lập kế hoạch.

---

## Xử lý sự cố thường gặp

Không hiện popup chọn xưởng
- Nguyên nhân: Deal đã có dự án liên kết.
- Cách xử lý: Mở deal kiểm tra; dùng thẻ trên Kanban SX, không chuyển lại cột Thắng.

Popup báo thiếu phân loại
- Nguyên nhân: Công ty chưa khai báo phân loại.
- Cách xử lý: SX → Pipeline xưởng → thêm phân loại.

Kanban SX trống
- Nguyên nhân: Lọc sai xưởng hoặc phân loại.
- Cách xử lý: Bộ lọc → Công ty Sản xuất = Phúc Đạt, Phân loại = đúng loại bước 1.

Cột «Tiếp nhận đơn hàng về SX» vs «Tiếp nhận»
- Nguyên nhân: Phân loại Tủ bếp vs Cửa dùng pipeline khác.
- Cách xử lý: Đổi phân loại trên dropdown Kanban.

CRM không thấy bản vẽ
- Nguyên nhân: Chưa Chia sẻ CRM (tab Tài liệu) hoặc chỉ up nội bộ xưởng.
- Cách xử lý: Bật Chia sẻ CRM trên file, hoặc gửi lại qua Bình luận kèm đính kèm.

---

## Đường dẫn nhanh

- CRM Deals (Phúc Đạt): `/crm/dashboard` + lọc công ty
- Kanban xưởng: `/sx/dashboard?company={company_id}`
- Chi tiết dự án + Tài liệu: `/sx/projects/{project_id}?tab=documents`
- Chi tiết dự án + Bình luận: `/sx/projects/{project_id}?tab=comments`
- Chi tiết deal CRM: `/crm/leads/{deal_id}`
- Cấu hình pipeline xưởng: `/sx/pipeline-settings`
- Hướng dẫn (Có gì mới?): `/updates`

---

## Xem trên Có gì mới?

Toàn bộ hướng dẫn (ảnh full màn hình + ghi chú) tại menu Có gì mới? (`/updates`), mục 🏭 Hướng dẫn — Chuyển Deal CRM sang Sản xuất (mẫu Phúc Đạt) — v2.4.0.

![Trang Có gì mới — hướng dẫn CRM → SX](../docs/huong-dan-chuyen-deal-sx/05-co-gi-moi-updates.png)

---

## Tài liệu liên quan

- [HUONG_DAN_CRM.md](./HUONG_DAN_CRM.md) — luồng Lead/Deal tổng quát

Cập nhật: 07/07/2026 — môi trường dev TuBep Pro, công ty Phúc Đạt.
