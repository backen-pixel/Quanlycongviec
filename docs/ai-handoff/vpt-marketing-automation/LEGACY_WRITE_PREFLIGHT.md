# Kiểm tra đường ghi cũ trước chuyển đổi — bản đang làm 03/10/2026

## Trạng thái và phạm vi

Bản làm việc trên HEAD `a4da197847289f64c6729c5535481df1bfd06351`, chưa commit/phát hành hoặc chạy SQL682 trên PostgreSQL. Bằng chứng SQL681 ở [hồ sơ giao diện đối chiếu](CARE_CONNECTION_CONSOLE_REVIEW.md) không thay thế kiểm thử gói này. Full goal ACTIVE; cutover và enrollment vẫn HOLD.

SQL682 thêm kiểm tra server-only cho tập Page/Contact/Lead/Customer. Kiểm tra gồm liên kết trực tiếp, liên kết ngược, Customer dùng chung, lịch sử tin nhắn/bình luận, biên nhận intake và nguồn Lead Ads. Page có bản ghi enrollment vẫn được bảo vệ khi `active=false`. Page là điểm cuối của đồ thị, không tự mở rộng sang tất cả khách cùng Page. Phạm vi quá rộng, thiếu bản ghi, lỗi nguồn hoặc không còn Primary đều dừng thao tác.

Helper kiểm đúng phản hồi, đúng danh tính yêu cầu và Primary trước/sau RPC; không cache quyền cho lần sau. Tác vụ cũ kiểm tra trước bước ghi đầu tiên; Lead/Customer vừa tìm thấy khi tra số điện thoại, PSID hoặc đọc lại contact phải được kiểm tra riêng trước khi tái dùng. API đọc contact không tự sửa liên kết hỏng.

Đây là kiểm tra phạm vi tại thời điểm gọi, **không phải giao dịch bao trùm các HTTP request tiếp theo**. Không dùng kết quả này làm giấy phép ghi. Muốn chuyển Page phải dừng và chờ tất cả đường cũ kết thúc trước enrollment; danh sách caller, batch, script, rollback và khả năng chạy lại còn phải được kiểm chứng.

## Review và kiểm thử

Reviewer độc lập yêu cầu sửa:

1. P1: kiểm tra ban đầu chưa bao gồm hồ sơ được tìm thấy sau đó. Đã thêm kiểm target trước return, atomic reuse và mutation; test chạy chính hàm creator trong cả hai nhánh atomic/legacy.
2. P2: thiếu lịch sử `facebook_messages.contact_id ↔ lead_id` và `facebook_lead_ads.customer_id → page_id`. Đã bổ sung cạnh SQL; **chưa có bằng chứng PostgreSQL cho hai tình huống này**.

Đồng thời sửa cleanup: lỗi đọc hoặc count thiếu không được hiểu là không có phụ thuộc; lỗi mutation đầu tiên dừng các bước sau. Giao dịch nhiều bước của đường cũ vẫn chưa nguyên tử.

Local: `facebookLegacyWriteScope.test.js` 26 ca; cộng `facebookWebhookRecovery.test.js` và `facebookLeadIntake.integration.test.js` là **43 PASS, 0 FAIL, 0 SKIP**. Có kiểm không ghi khi bị bảo vệ/lỗi nguồn, chuyển Primary, phản hồi sai phạm vi, target xuất hiện muộn, webhook Page gate, retry và lỗi giữa chừng. Recovery fixture được cập nhật cho dependency care/intake hiện hành; các assertion ACK/retry giữ nguyên. Kết quả này dùng fake DB và không chứng minh đồ thị SQL, xử lý đồng thời hoặc quyền PostgreSQL.

Reviewer độc lập đã rà lại và tự chạy43/43 PASS: khép hai finding về mã, không còn finding chặn trong delta vừa rà. Bổ sung14 ca PostgreSQL trong `careLegacyWrite.cases.js` và lịch sử comment theo schema42, đang chuẩn bị chạy trên CI và review delta. **SQL682/PostgreSQL và cutover toàn bộ vẫn HOLD**; không phải kết luận cho giao dịch xuyên HTTP hoặc phát hành. Workflow thêm bộ test local và trigger cho các file liên quan. Chưa có CI đúng bản làm việc này.

## Việc tiếp theo

1. Thêm/chạy PostgreSQL cô lập cho SQL682 hai lần, ACL, Page inactive, direct/inverse/shared Customer, lịch sử chỉ còn message, receipt chỉ còn Customer, nguồn thiếu và giới hạn đồ thị.
2. Kiểm các caller còn lại, thao tác theo nhóm, lỗi giữa chừng, dừng/chờ tác vụ cũ và khôi phục. Không coi một RPC preflight là hoàn tất chuyển đổi.
3. Khép review theo đúng phiên bản và cập nhật PR22; giữ khả năng tắt đường mới, không xóa giao dịch hoặc mở lại quyền không an toàn khi hoàn tác.
4. Khép cấu hình AI/lịch/người nhận/phạm vi đo, nghiệm thu toàn tuyến và trình Founder gói phát hành trước dữ liệu thật hoặc mở thêm kênh.

Mốc vận hành vẫn là 250.000đ/khách trả phí hợp lệ không trùng; chưa có dữ liệu thật chứng minh đạt. Hạn mức 100 triệu/30 ngày là một đợt thử, không phải cam kết tiêu hết hoặc ngân sách lặp lại. Không có model/API call, DB thật, quyền AI mới, chi quảng cáo hay deployment trong gói kiểm tra này.
