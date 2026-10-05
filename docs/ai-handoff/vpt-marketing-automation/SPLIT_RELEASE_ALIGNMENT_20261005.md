# Đối chiếu quyết định tách gói — 05/10/2026

PR25 là **INTEGRATION_EVIDENCE_ONLY; WHOLE_PR_MERGE_NOT_ALLOWED**. Đọc cùng LIVE_RELEASE_20261005.md và RELEASE_QUEUE.json. Đây là ghi nhận hồ sơ được bàn giao, không phải quyết định Founder mới do Codex tự tạo.

## Nguồn và phạm vi

Nguồn trong Founder Control Center: `work/claude-handoff-20261002/10_TRANG_THAI_VA_QUYET_DINH_20261005.md`, mục “Quyết định về tách #22/#25”; `13_SPLIT_PLAN_PR22_PR25_20261005.md`, mục H1/H2 và staging; `12_H_PLAN_20261005.md` về phần ngoài Marketing.

- Không merge nguyên khối PR22/25. A tối thiểu gồm thuật toán/test, không migration; tách H theo từng thay đổi ngoài Marketing. A đã có trên main qua PR28; không đưa nguyên policy ngân sách/SLA của PR25 trở lại A.
- H1 là tên lỗi mất khả năng thử lại khi xử lý sau ACK, không phải tên bản sửa đã hoàn thành. Thiết kế đã được ghi nhận: mọi sự kiện Page cần lưu bền trước 200, idempotency, lease, đếm lần thử và cảnh báo backlog; ghi lỗi trả503. Guard legacy mặc định tắt; RPC thiếu/failover giữ pending và cảnh báo. Đây là điều kiện trước C, không đồng nghĩa C đã được mở.
- Chưa mở B/C cho Page nào. Gọi model, gửi tin, đặt lịch thật có cổng riêng. Bộ 18 câu đã duyệt và lựa chọn CRM/Admin không tự mở các cổng này.
- Migration mới số từ701; đối chiếu sổ hiện hành trước cấp số. Danh mục50 SQL cũ không là batch được phép áp. Mỗi gói nhỏ cần manifest/order/rollback riêng; không sửa migration đã chạy.
- Claude phụ trách phần thu quyền anon; phiên này chỉ kiểm chứng catalog và tương thích. Giao Claude tách H không chứng minh Claude đã nhận sửa H1. Chưa tìm thấy người nhận H1 trong hồ sơ đã đọc.

## Đối chiếu mã

Tại source `43e502624b1454a112b0f2ee96bb0b91c5e9b1dc`, `backend/src/routes/facebook.js` nhận care/intake có kiểm chữ ký, rồi chỉ enqueue Messenger cho Page opt-in. Dòng3429 ACK200; Messenger ngoài tập, Lead Ads/comment legacy vẫn xử lý sau ACK. `backend/src/helpers/facebookLegacyWriteScope.js` gọi RPC bắt buộc và kiểm Primary; chưa có `VPT_FB_LEGACY_SCOPE_GUARD`.

Main `1f879ea8` đã có hàng đợi Messenger theo Page, nhưng không phải inbox chung cho mọi sự kiện. Không bỏ hàng đợi hiện có hoặc chèn writer thứ hai. Trước khi viết H1 cần chọn tái sử dụng/mở rộng đúng đường nhận, kiểm các handler trả lỗi, sự kiện đã lưu nhưng chưa hoàn tất, tiến trình tắt đột ngột và bàn giao writer. Không gắn nhãn DONE cho thiết kế hay chỉ kiểm một hàm enqueue.

H2: giới hạn kết quả cuối của RPC kiểm scope chưa chứng minh giới hạn chi phí quét. Gói C cần truy vấn bắt đầu từ định danh cụ thể, ngân sách depth/nút/thời gian, index đã đối chiếu và EXPLAIN trên dữ liệu staging phù hợp. Không ghi “thiếu index” nếu chưa kiểm catalog.

## Điều kiện tiếp theo

1. Tách gói theo nền main mới, giữ bản tích hợp làm nguồn kiểm thử. Kiểm người đang nhận H1 để tránh trùng; gói H riêng không thay H1.
2. Sửa và thử H1/H2 trong môi trường cô lập: enqueue lỗi, duplicate, đồng thời, crash/restart, thiếu RPC, failover, Page managed/legacy, handler lỗi sau một phần ghi; không mất sự kiện đã ACK.
3. Chứng minh khôi phục bản sao phù hợp và quyền cuối của đúng manifest; CI trên dữ liệu giả chỉ là một phần bằng chứng.
4. Đối soát nguồn Meta/CRM từng hồ sơ có định danh, không tự tạo lại tám Lead từ kết quả tìm tên. Đăng ký account, field key và binding qua dịch vụ có kiểm quyền.
5. Chỉ chuyển luồng theo PR nhỏ/phạm vi đã được Founder duyệt và nghiệm thu đúng phiên bản. Mục tiêu250.000đ là khách hợp lệ duy nhất, không phải số lần gửi form.

Phiên này chưa sửa DB/cấu hình/chi quảng cáo, gửi khách hoặc triển khai H1. Những việc đó vẫn là công việc thực tế còn lại, không phải chỉ chờ bấm phát hành.
