# ADR-0007 — Đơn hàng xác nhận → Dự án → Bàn giao Sản xuất

- Trạng thái: Accepted
- Ngày: 2026-08-26
- Phạm vi: staging một công ty — Công ty TNHH Bếp Vạn Phú Thành

## Bối cảnh

Luồng cũ có thể tạo Project ngay khi báo giá được khách chấp nhận. Thời điểm đó chưa chắc doanh nghiệp đã có Đơn hàng xác nhận, nên dễ sinh dự án rỗng và làm mờ ranh giới giữa quyết định thương mại với khởi động thực thi. Mặt khác, hệ thống đã có API bàn giao Sản xuất với các kiểm soát nhiệm vụ, người xác nhận, công ty xưởng và lịch dự kiến; Business OS cần tái sử dụng thay vì tạo một luồng Sản xuất song song.

## Quyết định

1. Chuỗi stage tiếp theo là `order → project → production`.
2. Báo giá `accepted` chỉ mở gate tạo Đơn hàng, không tự tạo Project.
3. Bản ghi `orders` thật vẫn đưa process tới `order`; chỉ khi đơn có trạng thái `confirmed`, backend mới tạo hoặc liên kết Project và chuyển process sang `project`.
4. `projects` là System of Record duy nhất cho Dự án/Sản xuất. Process kernel chỉ giữ lifecycle timestamp, người thực hiện và khóa ngoại ổn định.
5. Stage `production` chỉ được ghi sau khi `POST /api/crm/leads/:id/sx-handover` thành công. Endpoint này tiếp tục bắt buộc:
   - Deal có Project thuộc hồ sơ;
   - Sale có quyền và tick xác nhận;
   - có nhiệm vụ `sx_*` và toàn bộ nhiệm vụ không hủy đã hoàn tất;
   - công ty được chọn thuộc phạm vi module Sản xuất;
   - có ngày dự kiến thi công và bắt đầu sản xuất; ngày kết thúc hợp lệ.
6. Với process cũ đang ở `order` nhưng đã có đơn xác nhận liên kết Project, gate bàn giao được phép reconcile mốc `project` trước khi xét tiếp; không bắt người dùng sửa dữ liệu lịch sử thủ công.
7. Event chuẩn là `sales.project.started` và `sales.production.started`, chống lặp theo Project + target stage.
8. Luồng legacy ngoài công ty pilot không bị ép khởi tạo process. Việc cutover công ty khác phải đi qua Blueprint/UAT riêng.

## Hệ quả

- Không còn sinh dự án rỗng khi khách mới duyệt báo giá.
- Giao diện Deal hiển thị thêm Dự án và Sản xuất, dùng dữ liệu thật từ `projects`.
- KPI có thêm tỷ lệ Đơn hàng → Dự án và Dự án → Bàn giao Sản xuất.
- Các kiểm soát bàn giao Sản xuất hiện hữu được giữ nguyên ở backend; Business OS không tạo nguồn task hoặc lệnh bàn giao thứ hai.

## Rollback

- Tắt Sales pilot cho công ty hoặc bỏ lời gọi adapter/gate mới trong route Đơn hàng và bàn giao Sản xuất.
- Các cột migration 576 là additive, có thể giữ lại; không xóa Project, Order, task hoặc event đã phát sinh.
- Nếu cần điều chỉnh lifecycle, dùng command/migration reconcile riêng; không sửa lịch sử event trực tiếp.
