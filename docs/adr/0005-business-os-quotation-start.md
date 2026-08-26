# ADR-0005 — Nối Business OS với Báo giá CRM thật

- Trạng thái: Accepted
- Ngày: 2026-08-26
- Phạm vi: staging một công ty — Công ty TNHH Bếp Vạn Phú Thành

## Bối cảnh

ADR-0003 và ADR-0004 đưa Deal tới `design_completed`, nhưng việc tạo báo giá vẫn nằm hoàn toàn trong CRM legacy. Nếu Business OS tạo thêm một bản ghi báo giá riêng sẽ xuất hiện hai nguồn dữ liệu, còn nếu chỉ đặt một nút điều hướng thì process kernel không biết hồ sơ đã thực sự bước vào Báo giá.

## Quyết định

1. Bảng `quotations` và API `/api/crm/quotations` tiếp tục là System of Record duy nhất của Báo giá.
2. Business OS không tạo bảng nội dung báo giá mới. Process instance chỉ lưu `quotation_started_at`, người bắt đầu và khóa ngoại `primary_quotation_id` tới báo giá CRM đầu tiên.
3. Chỉ khi API CRM tạo thành công báo giá có `lead_id` và `company_id` trùng Deal, adapter backend mới chuyển `design_completed → quotation`.
4. Adapter chỉ áp dụng cho công ty đang bật Sales pilot, Deal đã có process instance và đang thật sự ở `design_completed`. Báo giá legacy của Deal khác không bị chặn.
5. Event `sales.quotation.created` dùng khóa idempotency ổn định theo quotation ID, đồng thời đi qua event ledger, audit và outbox hiện có.
6. Lỗi projection Business OS không rollback hoặc làm mất báo giá thật. Backend ghi cảnh báo để có thể reconcile; việc tạo chứng từ thương mại vẫn ưu tiên tính toàn vẹn nghiệp vụ hiện tại.
7. Truy vấn tự liên kết báo giá với Deal phải giới hạn theo `company_id`, không được tìm Deal của công ty khác chỉ bằng tên hoặc khách hàng.

## Hệ quả

- Người dùng bấm **Tạo báo giá** từ Deal đã đủ điều kiện và tiếp tục dùng form Báo giá hiện tại.
- Sau khi lưu thành công, Sales Process Kernel hiển thị stage `quotation` và tham chiếu đúng báo giá thật.
- Không sao chép khách hàng, Deal, dòng hàng hoặc tổng tiền sang kho Business OS.
- Negotiation và Order là các stage tiếp theo; chưa được suy diễn chỉ từ việc mở form Báo giá.

## Rollback

- Bỏ lời gọi adapter trong route tạo Báo giá và ẩn stage `quotation` trên UI.
- Dữ liệu `quotations` không bị ảnh hưởng.
- Giữ process event đã phát sinh để bảo toàn audit; có thể chuyển instance về `design_completed` bằng command/migration có kiểm soát nếu cần.
