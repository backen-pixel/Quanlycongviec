# Báo cáo công việc tuần 03/08/2026 – 09/08/2026

| | |
|---|---|
| **Người thực hiện** | Phan Nguyễn Đăng Khoa |
| **Giai đoạn** | 03/08/2026 – 09/08/2026 (tuần này) |
| **Ngày lập báo cáo** | 03/08/2026 |

---

## 1. Công việc thường xuyên

| STT | DANH MỤC | NỘI DUNG CÔNG VIỆC | KẾT QUẢ ĐẠT ĐƯỢC | TRẠNG THÁI |
|-----|----------|--------------------|------------------|------------|
| 1 | Hỗ trợ – VC/LĐ | Hỗ trợ hướng dẫn quy trình bàn giao VC/LĐ cho CRM và Sản xuất (Sale chọn công ty VC → xác nhận 2 bên Xưởng/VC → khóa lịch) | Nhân sự CRM/SX nắm flow bàn giao; giảm sai bước khi chuyển dự án sang VC/LĐ | Đang thực hiện |
| 2 | Phân quyền | Phân quyền MCP / Hệ thống / module (CRM, SX, VC/LĐ) theo vai trò vận hành | Phân quyền đúng scope; MCP và quyền hệ thống cấu hình theo nhu cầu triển khai | Đang thực hiện |
| 3 | Triển khai – cấu hình | Hướng dẫn cấu hình pipeline bàn giao: phụ trách VC/LĐ, QL giao hàng (xác nhận SX), người xác nhận bàn giao VC | Công ty SX/VC có cấu hình người bấm xác nhận riêng, không lẫn phụ trách dự án | Đang thực hiện |
| 4 | Triển khai – vận hành | Hỗ trợ triển khai module VC/LĐ trên thực tế: kiểm tra cột Kanban, mẫu công việc, sync CRM sau bàn giao | Module VC/LĐ sẵn sàng dùng; checklist triển khai theo công ty | Đang thực hiện |
| 5 | Hướng dẫn UI | Bổ sung / dùng product tour và hướng dẫn thao tác chuyển app, menu CRM–Events liên quan quy trình mới | Người dùng mới theo được bước thao tác trên giao diện | Đang thực hiện |

---

## 2. Công việc phát triển

| STT | DANH MỤC | NỘI DUNG CÔNG VIỆC | KẾT QUẢ ĐẠT ĐƯỢC | TRẠNG THÁI |
|-----|----------|--------------------|------------------|------------|
| 1 | Module VC/LĐ | Triển khai module Vận chuyển / Lắp đặt (VC/LĐ): pipeline, bàn giao từ SX, sync deal CRM | Module VC/LĐ vận hành được end-to-end từ SX → VC → LĐ | Đang thực hiện |
| 2 | Quy trình bàn giao | Chỉnh flow bàn giao: Sale chọn công ty + ngày → chờ xác nhận 2 bên; chỉ khi đủ xác nhận mới tạo 3 sự kiện lịch (Giao hàng xưởng + Vận chuyển + Lắp đặt) rồi khóa lịch | Tránh tạo/sửa lịch sớm; lịch chỉ khóa sau khi Xưởng và VC/LĐ đã xác nhận | Hoàn thành (dev) |
| 3 | Cấu hình bàn giao | Thêm người xác nhận riêng: QL giao hàng phía SX (`delivery_confirm_user_id`) và người xác nhận VC/LĐ (`handover_confirm_user_id`) — migration 494 + UI pipeline settings | Cấu hình được người bấm «Xác nhận» khác phụ trách chính dự án | Hoàn thành (dev) |
| 4 | Lịch / Events | Mở rộng lịch & feed sự kiện theo module (SX/VC), khu vực Lead, bản đồ khảo sát — phục vụ theo dõi bàn giao VC/LĐ | Lọc/xem sự kiện bàn giao theo module và địa bàn rõ hơn | Đang thực hiện |
| 5 | Giao việc liên module | Cải thiện panel giao việc trên deal: điều hướng đúng board CRM/SX theo `assignment_module` (gồm VC/LĐ) | Từ deal mở đúng bảng giao việc theo module | Hoàn thành (dev) |

---

## 3. Tóm tắt quy trình triển khai VC/LĐ (tuần này)

1. **Cấu hình** — Pipeline SX (cột bàn giao VC) + Pipeline VC/LĐ; gán phụ trách / người xác nhận.
2. **Phân quyền** — MCP / Hệ thống / quyền module để đúng người thao tác đúng bước.
3. **Hướng dẫn** — CRM + SX: flow Sale chọn công ty VC → xác nhận 2 bên → tạo lịch.
4. **Vận hành thử** — Kiểm tra bàn giao thật, sync CRM, sự kiện lịch sau xác nhận.
5. **Chỉnh kỹ thuật** — Hoãn tạo 3 sự kiện đến khi đủ xác nhận; tách role xác nhận khỏi phụ trách dự án.

---

*Báo cáo lập ngày 03/08/2026 — cập nhật khi tuần kết thúc.*
