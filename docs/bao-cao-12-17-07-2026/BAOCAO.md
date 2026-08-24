# Báo cáo công việc tuần 12/07 – 17/07/2026

| | |
|---|---|
| **Giai đoạn** | 12/07/2026 – 17/07/2026 |
| **Ngày lập** | 21/07/2026 |
| **Số commit** | 31 (pkmax-bit: 25 · MinDuc: 6) |

---

## Công việc thường xuyên

| STT | DANH MỤC | NỘI DUNG CÔNG VIỆC | KẾT QUẢ ĐẠT ĐƯỢC | TRẠNG THÁI |
|-----|----------|--------------------|------------------|------------|
| 1 | CRM / Kanban | Sửa lead mới không hiện ở cột đầu pipeline chia theo vùng; Kanban trống với NV; tìm SĐT thiếu khớp `customer.phone` | Lead/deal hiện đúng cột đầu; NV xem đủ thẻ theo quyền vùng; tìm kiếm SĐT đầy đủ | Hoàn thành |
| 2 | Sản xuất (SX) | Sửa bàn giao SX→VC 404 (thiếu `sx_kanban_column_id`); thẻ Kanban bị snap back khi kéo cột shared; đồng bộ KPI Quá hạn với cột Deadline | Bàn giao SX→VC ổn định; kéo thẻ đúng cột; KPI Quá hạn khớp view Deadline | Hoàn thành |
| 3 | Báo giá / Đơn hàng | Sửa import Excel chiết khấu; căn chỉnh Order/Invoice theo Quotation; lỗi lưu BG khi Excel có `due_date` | Import Excel chiết khấu đúng; Order/Invoice đồng bộ BG; lưu BG không lỗi do `due_date` | Hoàn thành |
| 4 | Messenger / Comment | Sửa tải file comment bị hủy sớm (revoke blob URL); đồng bộ wallpaper chat web/app | Tải file comment ổn định; wallpaper Messenger đồng bộ giữa web và app | Hoàn thành |
| 5 | Lịch / Sự kiện | Sửa sự kiện không hiện trên calendar khi `company_id` = null | Sự kiện hiển thị đầy đủ trên lịch bất kể `company_id` | Hoàn thành |
| 6 | Hiệu năng / Vận hành | Tăng tốc dashboard CRM/SX (cache SWR, loader tách); tạm tắt cron CSKH follow-up; sửa toast socket payload rỗng; bỏ track APK trong git | Dashboard load nhanh hơn; giảm toast lỗi rỗng; repo gọn hơn (không commit APK) | Hoàn thành |

---

## Công việc phát triển

| STT | DANH MỤC | NỘI DUNG CÔNG VIỆC | KẾT QUẢ ĐẠT ĐƯỢC | TRẠNG THÁI |
|-----|----------|--------------------|------------------|------------|
| 1 | CRM Pipeline | Triển khai pipeline chia theo vùng (region-split); nút tạo sự kiện trên chi tiết lead/deal (modal tự gắn); harden UX revert deal → lead | Pipeline vùng hoạt động; tạo sự kiện nhanh từ lead/deal; quy trình revert an toàn hơn | Hoàn thành |
| 2 | Kế toán | Thêm tài khoản ngân hàng kế toán và bộ lọc theo vùng | Quản lý TK ngân hàng theo vùng trên module kế toán | Hoàn thành |
| 3 | SX / VC / Mua hàng | Procurement Lite + module Purchasing; pipeline Phúc Đạt VC/LD 10 giai đoạn + quick action Kanban VC; thêm mô tả loại dự án xưởng; bỏ hạn chế kéo dự án đã bàn giao VC | Module mua hàng sẵn sàng; pipeline Phúc Đạt VC/LD đủ 10 stage; thao tác Kanban VC nhanh hơn | Hoàn thành |
| 4 | MCP / API | Cho phép MCP client auth chỉ qua URL `/api/mcp/{uuid}`; tách CRM monolith thành router module; harden API key MCP | Kết nối MCP đơn giản hơn; CRM backend dễ bảo trì; API key an toàn hơn | Hoàn thành |
| 5 | Comment / Quản trị | Allowlist admin cho comment on-screen và đồng bộ UX liên quan | Admin được cấu hình quyền comment trên màn hình theo allowlist | Hoàn thành |

---

*Nguồn: git log 12/07–17/07/2026. Form theo mẫu STT / Danh mục / Nội dung / Kết quả / Trạng thái.*
