# ADR-0006 — Báo giá → Thương lượng → Sẵn sàng đặt hàng → Đơn hàng

- Trạng thái: Accepted
- Ngày: 2026-08-26
- Phạm vi: staging một công ty — Công ty TNHH Bếp Vạn Phú Thành

## Bối cảnh

ADR-0005 chỉ ghi nhận việc tạo báo giá thật. Nếu suy diễn Đơn hàng ngay từ lúc báo giá được tạo hoặc gửi, hệ thống sẽ bỏ qua quyết định của khách hàng. Nếu Business OS tự tạo một loại chứng từ thương mại riêng, Báo giá và Đơn hàng lại có hai nguồn dữ liệu.

## Quyết định

1. `quotations` và `orders` tiếp tục là System of Record duy nhất. Process kernel chỉ lưu lifecycle timestamp và khóa ngoại tới chứng từ thật.
2. Chuỗi stage thương mại là `quotation → negotiation → order_ready → order`:
   - tạo báo giá thành công: `quotation`;
   - báo giá `sent`, `rejected` hoặc `expired`: `negotiation`;
   - báo giá `accepted`: `order_ready`;
   - tạo thành công một bản ghi `orders`: `order`.
3. Khách có thể chấp nhận ngay báo giá mà không cần trạng thái `sent`; kernel ghi cả mốc bắt đầu thương lượng và chấp nhận trong cùng lần chuyển.
4. Process chỉ tiến về phía trước. Việc sửa chứng từ về trạng thái cũ không tự hồi quy lifecycle đã audit.
5. `converted` là trạng thái do hệ thống ghi sau khi có đơn hàng thật; người dùng không được chọn thủ công. API chuyển đơn chỉ nhận báo giá `accepted`.
6. Với Deal thuộc công ty pilot và đã có process instance, backend chặn tạo đơn trước gate `order_ready`. Luồng legacy ngoài pilot không bị ép khởi tạo process.
7. Gọi lại API chuyển cùng báo giá sẽ trả đơn hàng đã tồn tại. Unique partial index trên `orders.quotation_id` bảo vệ cả trường hợp hai yêu cầu chạy đồng thời; đơn tạo thủ công không có báo giá nguồn không bị ảnh hưởng.
8. Event chuẩn là `sales.negotiation.started`, `sales.quotation.accepted`, `sales.order.created`; mỗi mốc có idempotency key ổn định theo chứng từ và target stage.

## Hệ quả

- Giao diện Deal hiển thị đầy đủ Báo giá, Thương lượng, Sẵn sàng đặt hàng và Đơn hàng.
- Nút tạo đơn chỉ xuất hiện khi báo giá đã được khách chấp nhận.
- KPI có thêm tỷ lệ bắt đầu thương lượng, chấp nhận báo giá và tạo đơn.
- Nhiều phiên bản báo giá vẫn được phép; `accepted_quotation_id` chỉ rõ báo giá mở gate, `primary_order_id` chỉ rõ đơn hàng đầu tiên.

## Rollback

- Bỏ các lời gọi adapter/gate trong route Báo giá và Đơn hàng, đồng thời ẩn ba stage mới trên UI.
- Không xóa `quotations` hoặc `orders`; đây vẫn là dữ liệu nghiệp vụ chuẩn.
- Giữ event đã phát sinh để bảo toàn audit. Nếu phải điều chỉnh process instance, dùng migration/command reconcile riêng thay vì sửa lịch sử.
