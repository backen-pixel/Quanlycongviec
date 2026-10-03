# Tạo khách hàng loạt theo danh sách đã xác nhận

Baseline trước sửa: `5356e185871caad7e0473842580ada7f91e5506e`. Trạng thái: bản sửa cục bộ đang nghiệm thu; chưa phát hành.

## Thay đổi

- POST `/api/facebook/batch-create-leads` yêu cầu 1–500 `contact_ids` và một công ty. Công ty lấy từ lựa chọn hoặc tài khoản hiện hành; quyền vẫn kiểm từ DB. Toàn bộ danh sách được kiểm trước ghi, từng hồ sơ kiểm lại khi xử lý. Không quét toàn DB hoặc âm thầm chọn nhóm khác.
- Giữ chính sách phân công hiện hành của CRM; kiểm cả Lead phát hiện qua Customer/điện thoại, khu vực và người nhận. Page đã chuyển quản lý bị chặn bởi guard hiện có, kể cả liên kết gián tiếp.
- Đọc cấu hình tenant trực tiếp, không dùng cache/fallback khi lỗi DB. Cấu hình hoặc thông tin nhận diện/tạm dừng đổi trong lúc chuẩn bị thì dừng. Callback quyền nằm trong dịch vụ tạo khách, không nhận từ body người dùng.
- Chỉ trích thông tin inbound. Nối message chỉ khi Lead đang NULL; không chuyển lịch sử sang Lead khác. CAS điện thoại không đè giá trị vừa đổi.
- Không phát thông tin khách qua socket batch. HTTP trả ID thuộc phạm vi đã kiểm; mất quyền thì ẩn chi tiết.
- Kết quả dùng `processed` (đã nối CRM), không coi tái dùng Lead là tạo mới. Lỗi trả mã HTTP, số đã xử lý/bỏ qua/cần đối soát/chưa xử lý. Dừng batch ở lỗi đầu; không báo thành công toàn bộ khi có ghi một phần.
- UI gửi đúng ID đã xác nhận, kiểm HTTP lỗi, loại phản hồi cũ khi đổi actor/công ty hoặc thao tác khác. Có nút đối soát rõ ràng theo ID lỗi/lượt chưa rõ kết quả, kể cả contact đã gắn Lead sau lần trước. Không tự gửi lại khi mất phản hồi.

## Kiểm thử

Local54 ca mới:43 backend thực thi route/helper/creator thật với DB giả;11 UI thực thi handler và loader hiện hành. Cùng66 creator và117 regression hiện có:237 PASS.

Bổ sung9 ca PostgreSQL16 trong runner intake: đúng lựa chọn, khác công ty, enrollment inactive, thu hồi actor, đổi đầu vào, repair Lead đã gắn, cạnh tranh message, cạnh tranh phone, quyền UPDATE bị thu hồi. Adapter chạy query thật dưới service_role; callback tạo Lead ở các ca này mô phỏng bước nối vào Lead fixture có sẵn, không chứng minh toàn bộ creator là giao dịch nguyên tử.

CI PostgreSQL, build, browser và review cuối: chưa có bằng chứng tại bản ghi này. Reviewer đã tìm các lỗi stale input, pause và retry UI; đã thêm sửa/test tương ứng, chờ kiểm lại đúng bản cuối.

## Giới hạn và các cổng còn mở

- Đường cũ vẫn gồm nhiều lần ghi HTTP, chưa có receipt/giao dịch nguyên tử cho cả batch. Preflight không khóa Page cho toàn thời gian xử lý; chưa đủ bằng chứng chuyển sang luồng mới.
- Nút retry trong trang hiện hành không thay hồ sơ đối soát bền vững qua đóng/reload trình duyệt. Không tự xóa dữ liệu đã phát sinh hoặc tự coi một HTTP lỗi là chưa ghi.
- Source-backfill `/sync-source-ids` là finding riêng còn OPEN, không thuộc khẳng định đã sửa ở đây.
- Các phần phụ của creator cũ như task/thông báo vẫn có cơ chế best-effort; processed chứng minh nối CRM/message/phone trong phạm vi kiểm, không chứng minh mọi tác vụ phụ hoàn tất.
- Quyền DB thật, UAT, AI/lịch/người nhận, chuyển luồng và Founder release chưa mở. Không tác động Meta, không gọi model, không chi tiền;250.000đ/khách vẫn là mục tiêu.

## Hoàn tác

Dừng sử dụng thao tác batch mới nếu chưa nghiệm thu. Giữ lại mọi Lead/Customer/message đã ghi để đối soát. Hoàn tác triển khai phải đồng bộ API và giao diện; không phục hồi endpoint quét toàn hệ thống hoặc ghi đè lịch sử làm phương án vận hành.
