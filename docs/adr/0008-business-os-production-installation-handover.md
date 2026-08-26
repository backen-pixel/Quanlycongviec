# ADR-0008 — Sản xuất → Sẵn sàng giao → Vận chuyển/Lắp đặt → Hoàn tất bàn giao

- Trạng thái: Accepted
- Ngày: 2026-08-26
- Phạm vi: staging một công ty — Công ty TNHH Bếp Vạn Phú Thành

## Bối cảnh

Hệ thống hiện tại đã có quy trình bàn giao VC/LĐ vận hành bằng Project, thẻ bình luận tương tác và Kanban Logistics. Xưởng yêu cầu bàn giao, Sale chọn công ty/lịch, sau đó đội VC/LĐ cập nhật tiến độ tới cột Hoàn thành. Business OS cần nhìn thấy trọn vòng đời này nhưng không được tạo thêm bảng lắp đặt, task hoặc nút chuyển bước song song.

## Quyết định

1. Mở rộng chuỗi stage thành `production → delivery_ready → installation → completed`.
2. `POST /api/vc-handover/projects/:id/request` thành công là tín hiệu `delivery_ready`. Thẻ `crm_lead_comments.comment_type = 'vc_handover'` vẫn là System of Record cho yêu cầu và trao đổi bàn giao.
3. `PATCH /api/vc-handover/comments/:cid/select` thành công là tín hiệu `installation`. Đây là lúc Sale đã chốt đơn vị thực hiện và lịch; Project thật được đưa vào module VC/LĐ. Trường hợp thuê đơn vị ngoài vẫn vào cùng macro stage nhưng không tạo thẻ Kanban VC/LĐ giả.
4. Với đội VC/LĐ dùng hệ thống, chỉ `PATCH /api/logistics/projects/:id/stage` đưa Project vào cột có `bucket_slug = completed/done/install_completed` hoặc tên Hoàn thành/Hoàn thiện mới ghi stage `completed`.
5. Với đội lắp đặt thuê ngoài (`skip_logistics_module = true`), không tạo thẻ Kanban Logistics giả. `PUT /api/events/:id` chuyển đúng sự kiện Lắp đặt sang `completed` là tín hiệu đóng process. Adapter bắt buộc đối chiếu đồng thời `lead_id`, `project_id`, `install_event_id`, `comment_type = vc_handover`, `state = done` và marker thuê ngoài; sự kiện lịch thông thường không được đóng process.
6. `projects`, `crm_lead_comments`, `logistics_pipeline_stages`, `crm_events` và task hiện hữu tiếp tục là nguồn nghiệp vụ duy nhất. Kernel chỉ lưu milestone, actor và reference ổn định.
7. Process chỉ nhận sự kiện từ đúng `production_project_id/installation_project_id`; Project xưởng phụ không được vô tình hoàn tất lifecycle chính.
8. Event chuẩn là `sales.delivery.ready`, `sales.installation.started` và `sales.installation.completed`. Mỗi event chống lặp theo thẻ bàn giao hoặc Project + target stage.
9. Hoàn tất cột VC/LĐ tiếp tục tự đóng đúng nhóm task/deadline/event Logistics. Bộ lọc trạng thái phải dùng đúng enum từng bảng (`tasks = done`, `crm_assignments = completed`).
10. Công ty ngoài pilot hoặc Deal chưa có process vẫn chạy luồng legacy; adapter chỉ quan sát và không chặn.

## Hệ quả

- Deal Detail hiển thị xuyên suốt tới Sẵn sàng giao, VC/LĐ và Đã bàn giao.
- Sales Workspace có stage count và KPI tỷ lệ Sản xuất sẵn sàng, bàn giao VC/LĐ và hoàn tất lắp đặt từ dữ liệu thật.
- Nhân viên thao tác tại màn hình SX, thẻ Bình luận và Kanban VC/LĐ quen thuộc; không nhập lại trạng thái trong Business OS.
- Nhánh thuê ngoài được hoàn tất ngay từ sự kiện Lắp đặt hiện hữu, vẫn có dấu vết người thực hiện và không phụ thuộc vào một Kanban Logistics không tồn tại.
- Migration 577 chỉ thêm lifecycle fields, FK/index và stage constraint; không sao chép Project hoặc dữ liệu lắp đặt.

## Rollback

- Tắt Sales pilot hoặc bỏ các lời gọi adapter tại route VC handover/Logistics/Events; luồng nghiệp vụ cũ vẫn hoạt động.
- Giữ các cột additive và event lịch sử của migration 577; không xóa Project, comment, task hoặc sự kiện thật.
- Nếu cần sửa lifecycle đã ghi, dùng command/migration reconcile có audit; không sửa event ledger trực tiếp.
