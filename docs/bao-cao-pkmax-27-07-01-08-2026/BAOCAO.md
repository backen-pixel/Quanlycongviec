# Báo cáo công việc tuần 27/07/2026 – 01/08/2026

| | |
|---|---|
| **Người thực hiện** | Phan Nguyễn Đăng Khoa |
| **Giai đoạn** | 27/07/2026 – 01/08/2026 |
| **Ngày lập báo cáo** | 03/08/2026 |

---

## 1. Công việc thường xuyên

| STT | Loại | Danh mục | Nội dung công việc | Kết quả đạt được | Trạng thái |
|-----|------|----------|--------------------|------------------|------------|
| 1 | Sửa lỗi | CRM – Transfer | Sửa filter nhân viên khi transfer CRM | Filter NV transfer đúng scope, không lệch danh sách | Hoàn thành |
| 2 | Sửa lỗi | CRM – Kanban | Sửa live totals Kanban và giảm request thừa; sửa refresh tổng Deal khi load trang | Tổng cột/tab đúng ngay khi mở trang; giảm gọi API thừa | Hoàn thành |
| 3 | Sửa lỗi | CRM – Pipeline | Hiện lại cột SX pipeline bị ẩn; giữ tổng Lead/Deal tab cùng lúc; hiện tổng tab Deals kèm Leads từ filter-summary | Cột SX hiển thị lại; badge tổng Lead/Deal đồng bộ | Hoàn thành |
| 4 | Sửa lỗi | CRM – Pipeline UI | Sửa UI reorder stage pipeline không cập nhật sau khi lưu | Kéo thả stage lưu xong UI cập nhật đúng thứ tự | Hoàn thành |
| 5 | Sửa lỗi | CRM – Facebook | Sửa resolve stage lead Facebook để giữ đúng pipeline theo công ty của page | Lead FB vào đúng pipeline theo company của page | Hoàn thành |
| 6 | Sửa lỗi | CRM – Kanban | Harden Kanban chống 500 gián đoạn (retry + load stage-link an toàn hơn); ổn định virtualization, load cột đang nhìn sớm hơn | Kanban ít lỗi 500; scroll/virtual list ổn định hơn | Hoàn thành |
| 7 | Sửa lỗi | Hạ tầng – CORS | Cho phép header `X-No-Cache` trong CORS (preflight `/companies`) | Preflight CRM `/companies` không còn bị chặn | Hoàn thành |
| 8 | Vận hành | Thông báo | Scope thông báo admin theo công ty của deal/project | Admin chỉ nhận thông báo đúng công ty liên quan | Hoàn thành |
| 9 | Vận hành | Sản xuất | Tạm mở kéo thả kanban SX; xóa lịch khi task completed | Drag SX hoạt động tạm thời; task hoàn thành thì lịch bị xóa | Hoàn thành |
| 10 | Hỗ trợ | Messenger | Cho tìm người trên Messenger không bắt buộc scope company | Search người dùng Messenger linh hoạt hơn (không ép theo company) | Hoàn thành |

---

## 2. Công việc phát triển

| STT | Danh mục | Nội dung công việc | Kết quả đạt được | Trạng thái |
|-----|----------|--------------------|------------------|------------|
| 1 | CRM – Kanban | Bỏ giới hạn hard load 3000 của CRM kanban (All / custom load không giới hạn) | Load All/custom không còn bị cắt ở 3000 bản ghi | Hoàn thành |
| 2 | CRM – Deadline | Thêm tab Deadline (badge cột kiểu Kanban) và tải thông báo nhanh hơn | Có tab Deadline mới; badge theo cột; notification load nhanh hơn | Hoàn thành |
| 3 | CRM – Kanban | Chuyển filter CRM Kanban sang server query; tối ưu incremental loading | Filter chạy phía server; load từng đợt mượt hơn | Hoàn thành |
| 4 | CRM – Kanban | Phân trang Kanban theo từng cột; tối ưu lazy load Deadline + Kanban | Mỗi cột paginate riêng; lazy load Deadline/Kanban nhẹ hơn | Hoàn thành |
| 5 | CRM – Deadline | Cho chỉnh sửa nguồn deadline CRM theo thứ tự ưu tiên | Cấu hình nguồn deadline theo priority, chỉnh sửa được | Hoàn thành |
| 6 | Module / Workflow | Thêm app modules mở rộng và shared workflow assignments | Module app mở rộng; gán workflow dùng chung giữa module | Hoàn thành |
| 7 | CRM ↔ SX | Bắt buộc có project SX đã ký HĐ trước khi chuyển CRM sau Won; khôi phục checkmark stepper giai đoạn thiết kế | Chặn chuyển sau Won nếu chưa có dự án SX ký HĐ; stepper thiết kế hiện đúng ✓ | Hoàn thành |

---

## 3. Tóm tắt theo ngày

| Ngày | Việc chính |
|------|------------|
| **27/07** | Bỏ cap load 3000 Kanban; tab Deadline + badge cột; tăng tốc tải thông báo |
| **28/07** | Mở kéo thả Kanban SX tạm thời; xóa lịch khi task completed |
| **29/07** | Scope thông báo admin theo công ty deal/project |
| **30/07** | Filter Kanban → server; pagination theo cột; lazy load; app modules + workflow; deadline source ưu tiên; sửa filter NV transfer / tổng Deal |
| **31/07** | Hiện cột SX ẩn; ổn định virtualization + harden 500; tổng Deals từ filter-summary; CORS `X-No-Cache`; UI reorder stage; Messenger search không ép company |
| **01/08** | Bắt buộc project SX ký HĐ trước chuyển CRM sau Won; stepper thiết kế; resolve stage lead Facebook theo pipeline công ty page |

---

## 4. Ghi chú

- Báo cáo tổng hợp từ nhật ký công việc + đối chiếu `git log` (27/07–01/08/2026).
- Phần “chưa ghi” đã đối chiếu commit: các hạng mục chính đều nằm trong danh sách trên (Kanban/Deadline, module workflow, CRM↔SX, Facebook, Messenger, CORS).

---

*Báo cáo lập ngày 03/08/2026.*
