# Review phạm vi batch Facebook — 04/10/2026

Checkpoint tiếp theo: [batch-create đã sửa và kiểm tại c7d2a43](LEGACY_BATCH_CREATION.md); [source-backfill đã thay bằng khôi phục có bằng chứng tại8f61a18](LEGACY_SOURCE_REPAIR.md). Cả hai được review độc lập PASS đúng phạm vi. Source repair local267, PostgreSQL307/0/0; không có UI mới, chưa chuyển luồng/phát hành. Nội dung dưới là audit baseline trước sửa, không phải trạng thái lỗi hiện hành.

Baseline: `5356e185871caad7e0473842580ada7f91e5506e`.
Reviewer độc lập: phiên `/root/architecture_v11_review`.
Kết luận: **HOLD cho hai route batch**, không phủ định kết quả creator đã kiểm ở [checkpoint trước](LEGACY_CREATOR_SCOPE.md).

Đây là rà mã đọc tại baseline; chưa có bản sửa, kiểm thử delta, thay đổi DB hoặc phát hành.

## Finding

| Mức | Vị trí tại baseline | Vấn đề |
|---|---|---|
| P1 | `backend/src/routes/facebook.js:6247`, `:6290` | Hai route chỉ xác thực đăng nhập, quét contact toàn DB; chưa kiểm công ty và quyền hiện hành của người thao tác. |
| P1 | `facebook.js:6264–6279` | Backfill chọn Page đầu tiên cho Lead, có thể ghi đè nguồn đã có; thiếu kiểm Lead/Customer cùng công ty và kiểm phạm vi đang chuyển sang luồng mới. |
| P1 | `facebook.js:6387`, `:6438` | Batch ghi điện thoại trước guard; ghi liên kết Lead lên mọi message, không giữ message đã có liên kết. |
| P1 | `facebook.js:6449`, `:6465` | Broadcast tên, điện thoại, mã Lead và kết quả tới mọi socket. |
| P2 | `frontend/src/pages/FacebookPage.jsx:2183–2191` | Xác nhận số contact đang hiển thị nhưng POST không truyền danh sách/công ty; chưa kiểm HTTP lỗi hoặc loại phản hồi trễ sau đổi phạm vi. |
| P2 | `facebook.js:6323–6327`, `:6441` | Lỗi truy vấn bị hiểu là rỗng; lỗi ghi chưa kiểm; liên kết Lead có sẵn bị tính là tạo mới. |

Guard migration 680 không bảo vệ phone-only hoặc cập nhật `crm_leads.source_id`. Preflight phải bao trùm contact, Lead, Customer và liên kết lịch sử trước mọi ghi, kể cả thao tác tạo nguồn/gắn cấu hình Page. Kiểm trước qua HTTP không phải một giao dịch nguyên tử.

Không tìm thấy frontend caller của `/sync-source-ids`; endpoint vẫn có thể được gọi trực tiếp. Listener hiện tại không dùng sự kiện `create_leads` để vẽ tiến độ; có thể bỏ broadcast dữ liệu khách mà không mất phần tiến độ đang dùng.

## Tiêu chí khép

1. Giới hạn danh sách rõ ràng đúng lựa chọn trên UI; kiểm quyền hiện hành và công ty trước đọc/ghi. Dừng khi quyền bị thu hồi giữa batch.
2. Chặn Page đã chuyển quản lý, kể cả enrollment inactive hoặc liên kết gián tiếp, trước mọi thay đổi.
3. Giữ nguyên nguồn có sẵn. Bổ sung nguồn NULL chỉ khi đủ bằng chứng, phạm vi không mâu thuẫn và phép ghi không đè thay đổi đồng thời; nhiều Page hoặc thiếu bằng chứng đưa vào đối soát.
4. Không thay attribution, bằng chứng nguồn riêng, receipt hoặc thời điểm nguồn. Nhãn nguồn CRM không phải bằng chứng khách đến từ quảng cáo trả phí.
5. Không biến lỗi đọc/ghi thành số 0 hoặc thành công. Trả kết quả từng phần rõ ràng; phân biệt tạo mới, liên kết và chưa xác định.
6. Không chuyển message đã gắn Lead khác; không broadcast thông tin khách.
7. UI kiểm HTTP lỗi và loại phản hồi cũ khi người/công ty thay đổi.
8. Kiểm các trường hợp quyền sai, Page managed, lỗi DB, dữ liệu mâu thuẫn, gửi lại và xử lý đồng thời; reviewer độc lập kiểm đúng bản sửa.

## Phần còn mở sau checkpoint

Chuyển luồng và đối soát ghi một phần; bảo toàn lịch sử/gộp CRM; cấu hình AI, lịch khảo sát và người nhận; đủ phạm vi đo chi phí; nghiệm thu vận hành toàn tuyến và quyết định phát hành của Founder.

Mục tiêu tạm thời là 250.000 đồng/khách trả phí hợp lệ; chưa có dữ liệu thật chứng minh đạt. Giai đoạn này chưa mở kênh mới hoặc phát sinh ngân sách.

## Hoàn tác tài liệu

Delta này chỉ bổ sung trạng thái và hồ sơ review. Nếu cần hoàn tác, bỏ đúng phần ghi nhận và file review mới; không sửa checkpoint cũ hoặc lịch sử quyết định Founder.
