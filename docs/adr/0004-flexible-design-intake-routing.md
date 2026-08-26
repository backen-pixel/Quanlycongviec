# ADR-0004 — Lộ trình linh hoạt khi khách hàng đã có thiết kế

- Trạng thái: Accepted
- Ngày: 2026-08-26
- Phạm vi: staging một công ty — Công ty TNHH Bếp Vạn Phú Thành

## Bối cảnh

ADR-0003 triển khai đường chuẩn `Deal → Khảo sát → Thiết kế → Sẵn sàng báo giá`. Thực tế có khách hàng đã có bản vẽ trước khi vào Deal. Bắt họ làm lại toàn bộ làm tăng thời gian và chi phí, nhưng cho phép bỏ qua mọi kiểm tra sẽ đưa bản vẽ thiếu kích thước hoặc không khả thi sang Báo giá.

## Quyết định

1. Tại Deal, người dùng phải chọn một trong hai lộ trình:
   - `full_service`: Khảo sát → Thiết kế → Sẵn sàng báo giá.
   - `customer_design`: Kiểm tra thiết kế có sẵn → Sẵn sàng báo giá.
2. Nhánh `customer_design` không đi thẳng sang Báo giá. Backend materialize ba task kiểm soát: tiếp nhận file, kiểm tra kỹ thuật/kích thước, xác nhận đủ dữ liệu báo giá.
3. Trạng thái `design_review` có SLA, escalation, task gate, minh chứng, quick verdict, version và rollback độc lập theo company.
4. `workflow_path` được lưu trên process instance. Mốc Khảo sát không được giả lập cho nhánh khách có thiết kế; KPI tách rõ hai đường đi.
5. Chỉ backend được chuyển state. Command bắt buộc idempotency key và tiếp tục ghi event/audit như các stage trước.
6. Deal cũ ở `deal` chưa bị chọn lộ trình hoặc tự sinh task. Người dùng quyết định khi có đủ thông tin đầu vào.

## Gate mặc định — Kiểm tra thiết kế có sẵn

- Tiếp nhận bản thiết kế khách hàng cung cấp; cần file hoặc ghi chú vị trí hồ sơ.
- Kiểm tra kỹ thuật và kích thước; cần minh chứng và kết luận `Đã đủ`.
- Xác nhận thiết kế đủ dữ liệu để báo giá; cần kết luận `Đã đủ`.

SLA mặc định: 480 phút làm việc, cảnh báo trước 120 phút.

## Hệ quả

- Trải nghiệm phù hợp cả khách bắt đầu từ hiện trạng và khách đã có bản vẽ.
- Tỷ lệ “Deal bắt đầu khảo sát” không còn đại diện cho toàn bộ Deal đã vận hành; dashboard dùng thêm tỷ lệ chọn lộ trình, tỷ trọng khách có thiết kế và tỷ lệ sẵn sàng báo giá.
- Nhánh khách có thiết kế vẫn giữ kiểm soát chất lượng và nguồn minh chứng trước khi tính giá.
- Chưa tự động phân tích file bản vẽ bằng AI; AI chỉ được bổ sung sau khi có rule và quyền dữ liệu rõ ràng.

## Rollback

- Đặt automation `design_review` không active hoặc rollback về version trước để ngừng sinh task mới.
- Giữ process event, task và `workflow_path` đã phát sinh để bảo toàn audit.
- UI có thể ẩn lựa chọn khách có thiết kế mà không ảnh hưởng đường `full_service`.
- Chỉ rollback schema sau khi sao lưu và không còn instance ở `design_review`.
