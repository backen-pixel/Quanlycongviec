# VPT Messenger attribution — kết quả review ngày 26/09/2026

## Phạm vi và mốc hoàn thành

PR #2, nhánh `codex/vpt-messenger-attribution-20260924`, đã được hòa nhập với `main` tại `a458a192e83a4d656561fc87b56f926c16c6140c` (15 commit mới). Giữ nguyên các thay đổi nghiệp vụ của main. Xung đột nằm ở hai tài liệu bàn giao và đã giữ nội dung của cả hai phía.

Gói durable ngày 24/09 chưa từng có trên PR cũ. Đã phục hồi gói, xác minh manifest blob nền/thành phẩm, rồi ghép ba chiều trên nhánh hiện tại. Không đẩy commit của snapshot và không bỏ kiểm tra hash của gói.

Mốc này là **sẵn sàng review mã**, chưa nghiệm thu phát hành. Không merge main, chạy SQL lên dữ liệu thật, triển khai production hoặc bật quảng cáo trong phiên này.

## Thay đổi chính

- Lưu sự kiện Messenger đã xác thực trước khi trả HTTP 200; khi ghi lỗi trả 503 để nhà cung cấp thử lại. Worker mặc định tắt, giới hạn Page cấu hình, có lease, retry, phục hồi sau restart và chống nhận trùng.
- Lưu SĐT phát hiện và giờ gửi cùng tin nhắn; xử lý lại chỉ sửa dữ liệu attribution và liên kết lead đã tồn tại, tránh gọi lại luồng tạo lead/customer hoặc tự trả lời.
- Không dùng giờ xử lý thay cho timestamp thiếu/sai. Lỗi ghi attribution trong luồng durable phải thử lại, không đánh dấu đã xong.
- Migration 639 chỉ báo cáo các sự kiện có bằng chứng đi qua luồng xác thực chữ ký. Dữ liệu lịch sử mặc định chưa xác thực; không backfill từ việc vừa bật secret. Bảo vệ bản ghi đã xác thực khỏi sửa giả bằng quyền người dùng trực tiếp.
- Báo cáo yêu cầu referral cùng Page, cùng ngày Việt Nam, không sau tin SĐT. Nếu nhiều referral mới nhất có cùng timestamp thì bỏ qua thay vì chọn ngẫu nhiên.
- API kiểm tra phiên bản SQL/capabilities, ngày hợp lệ, Page scope và số đếm. Thiếu schema/lỗi DB/số đếm sai không được trả thành 0 khách. Hàng đợi chưa xử lý cũng không đủ điều kiện tracking-ready.
- KPI là số **liên hệ Messenger có SĐT phát hiện**, không phải số điện thoại đã gọi được, lead CRM đã nghiệm thu hoặc hợp đồng. `crm_acceptance_verified=false`; automation vẫn bị chặn.

## Kiểm thử có thể chạy lại

```bash
node backend/tests/facebook-messenger-campaign-attribution.test.js
node backend/tests/facebook-messenger-receipts.test.js
node backend/tests/facebook-phone-attribution-route.test.js
node backend/tests/facebook-lead-chat-scope.test.js
```

Các test trên chạy offline; test route chạy chính handler trong file nguồn với adapter giả lập, không gửi tin hoặc tạo khách thật.

Để thực thi SQL trong PostgreSQL cô lập:

```bash
npm install --prefix /tmp/vpt-attribution-test --ignore-scripts --no-audit --no-fund @electric-sql/pglite@0.3.14
PGLITE_TEST_MODULE=/tmp/vpt-attribution-test/node_modules/@electric-sql/pglite node backend/tests/facebook-messenger-receipts-sql.test.mjs
PGLITE_TEST_MODULE=/tmp/vpt-attribution-test/node_modules/@electric-sql/pglite node backend/tests/facebook-messenger-attribution-sql.test.mjs
```

Đã thực thi trên PGlite 0.3.14 / PostgreSQL 17.5: **39** kiểm tra queue/mapping và **49** kiểm tra report/capability/quyền/trigger dữ liệu xác thực (**88** tổng cộng). Cả hai bộ SQL chạy migration hai lần để kiểm tra khả năng chạy lặp. Kiểm tra cú pháp các JavaScript thay đổi và diff với `core.whitespace=cr-at-eol` (giữ CRLF của route) cũng đạt.

Kiểm thử nhiều kết nối đã chạy tiếp trên **PostgreSQL 17.6 thật**, trong cluster mới cô lập trên WSL Ubuntu 24.04 của DESKTOP-UFJU8SP: **124 kiểm tra đạt**, 4 kết nối DB độc lập, 3 worker tranh nhận việc qua 12 vòng. Bộ test gồm giao webhook trùng đồng thời, rollback claim/finish, thứ tự từng hội thoại, lease hết hạn cưỡng bức/nhận lại và từ chối token cũ, report xác thực, trigger chống sửa giả. Chỉ dùng fixture tổng hợp; cluster đã dừng sạch sau kiểm thử. SHA-256 file test đã chạy: `c6bb011c7d324071baf578aae3968ee6739181ff7c066b46fbc5214579cb9d43`.

Để chạy lại, chuẩn bị **cluster local mới**, database rỗng có tên bắt đầu `vpt_messenger_test_`, user có quyền tạo role/migration, cổng riêng khác 5432; không dùng một database rỗng bên trong cluster nghiệp vụ. Sau khi cài dependencies backend:

```bash
VPT_MESSENGER_TEST_URL='postgres://test_owner@127.0.0.1:56437/vpt_messenger_test_pr2' node backend/tests/facebook-messenger-concurrency.test.js
```

Script từ chối host ngoài loopback, cổng mặc định, tên DB khác prefix, query override và DB có bảng/view/sequence trong public. Trước khi tạo role, script còn từ chối cluster có database khác ngoài postgres/database test hoặc có role ngoài các role hệ thống/owner hiện tại. Người chạy chịu trách nhiệm tạo và dừng cluster riêng. Không nạp `.env` của ứng dụng.

Chưa có bằng chứng CI GitHub, staging với schema đầy đủ hoặc thử crash tiến trình thật. Kiểm thử lease hết hạn cưỡng bức/rollback không thay thế các phần đó; 124 kiểm tra này cũng không nghiệm thu giao dịch tạo lead/customer.

## Điều kiện phát hành còn mở

1. Review mã và xác nhận staging riêng cùng phiên bản backend/schema. Kiểm thử nhiều kết nối cô lập đã đạt; còn crash tiến trình và các quyền/schema thực tế của staging. Ngày 26/09 Render chuyển về trang đăng nhập nên chưa xác minh được deploy SHA hoặc staging.
2. Luồng cũ tạo customer/lead và gắn contact chưa có giao dịch/idempotency xuyên suốt. Không bật `crmLinkageRetrySafe`; receipt `done` chỉ chứng minh phần sự kiện/attribution đã xong. Không tự tạo lại lead ở replay khi chưa rõ lần trước đã ghi đến đâu. Review tiếp xác nhận cả luồng tự tạo và route tạo lead thủ công đều có nhiều lần ghi rời rạc; khóa trong bộ nhớ không bao phủ nhiều process. Phần tiếp theo cần core transaction chung với khóa contact + khóa nguồn bền vững, kiểm tra lease trong transaction và outbox cho side effect; không mở rộng PR này sang viết lại nghiệp vụ tạo lead khi chưa đối chiếu staging.
3. Kiểm thử Messenger từ quảng cáo thực tế bằng cuộc hội thoại được phép; xác minh referral → ad → campaign → số điện thoại → contact/lead, rồi loại trừ đúng tin TEST. Không bật `liveE2eVerified` từ kiểm thử offline.
4. Quy tắc chi 50.000đ/không có số và mở lại 00:00, Facebook A/B và các thay đổi ngân sách vẫn chưa được kích hoạt bởi PR này.

## Trình tự SQL và rollback

Đối chiếu schema trước; dùng đúng **tên file**, vì kho mã có migration khác cũng mang số 591:

1. `591_facebook_messenger_campaign_phone_attribution.sql`
2. `636_facebook_messenger_campaign_attribution_hardening.sql`
3. `637_facebook_messenger_webhook_receipts.sql`
4. `638_vpt_messenger_ab_campaign_mappings.sql`
5. `639_facebook_messenger_verified_daily_attribution.sql`

Đặt `FB_MESSENGER_DURABLE_DELIVERY=0` trong lúc áp SQL. Sau khi schema/capability đạt mới deploy bản đã review; thử riêng Page `409741855550833` với secret qua hệ thống bí mật và `FB_MESSENGER_DURABLE_PAGE_IDS` chính xác. Không ghi secret vào repo.

Rollback code: tắt cờ durable, deploy bản ổn định đã xác minh; giữ tables/receipts để đối soát, không xóa dữ liệu hoặc nới quyền để đưa KPI về 0. Khi rollback về code cũ, không dùng API attribution làm điều kiện tự động hóa quảng cáo. Các thay đổi SQL bổ sung cần forward-fix sau review, không sửa lịch sử migration đã chạy.

## Google Ads R0 — trạng thái liên quan

Nguồn bàn giao Google phiên bản 12 đã ghi bridge 0.2.2 LIVE trên ba trang và ba lead TEST; chúng không phải khách thật. Lần đọc Ads ngày 26/09 cho khoảng 23–26/09 chỉ thấy 5 chuyển đổi “CD zalo”, chưa có dòng form production 7789307924. Không suy từ đó rằng CRM không có khách.

Phiên CRM trong trình duyệt hiện chuyển về đăng nhập; chưa đọc được hồ sơ khách thật để đối soát source/campaign/adgroup/gclid/người xử lý/trạng thái. **Chưa đặt R0**. Đây là điều kiện truy cập/dữ liệu thật, không được thay bằng một khách thử.
