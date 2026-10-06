# SQL702 — kiểm thử khôi phục dữ liệu Lead Ads

Trạng thái tại lúc viết: đã thêm ca kiểm thử, Python AST và kiểm khoảng trắng đạt; PostgreSQL **chưa chạy cho delta này**. Bằng chứng khôi phục SQL701 trước đó không thay thế phép thử SQL702. Không thay SQL702, quyền, cấu hình hay dữ liệu vận hành.

CI đầu ở `2fec52e837518be107aebf97dfff619f0d2e6094` chạy31 ca,30 đạt; ca30 dừng ở so sánh biểu diễn CHECK sau restore. PostgreSQL đã đổi ngoặc dư khi serialize/reparse biểu thức `BETWEEN` thành các phép so sánh và `AND`. Bản sửa chỉ trong test cho PostgreSQL đọc lại nguyên `pg_get_constraintdef` của CHECK trong fixture nguồn, giữ tên/cột/validated/no-inherit/comment, rồi đọc lại lần hai để kiểm biểu diễn ổn định trước dump. Không xóa ngoặc bằng regex hoặc thay predicate. Một INSERT sai trực tiếp vẫn phải bị CHECK từ chối23514. So sánh nguồn–đích tiếp tục strict; lỗi in tối đa12 đường dẫn khác nhau thay cho toàn bộ inventory. Kết quả PostgreSQL của bản sửa vẫn chờ CI mới.

Nguồn kiểm thử: [facebookLeadAdsIntake.postgres.test.py](../../backend/tests/facebookLeadAdsIntake.postgres.test.py), ca `test_30_full_logical_restore_preserves_domain_receipts_queue_replay_and_restricted_acl`. [CI cô lập](../../.github/workflows/facebook-page-inbox.yml) bật `VPT_ISOLATED_PG_TEST=1` và `VPT_INBOX_RESTORE_TEST=1`, dùng PostgreSQL 17 cùng phiên bản với công cụ dump/restore.

## Phạm vi và điều kiện an toàn

- Chỉ chấp nhận nguồn mới `vpt_lead_ads_ci` trên `127.0.0.1`; bộ kiểm thử từ chối nguồn đã có bảng trước khi dựng fixture.
- Đích cố định `vpt_lead_ads_restore_ci`, khác nguồn và phải chưa tồn tại. Tự tạo từ `template0`, kiểm đích rỗng và OID database khác. Chỉ dọn đích do chính ca này tạo; không ghi đè hoặc khôi phục lên nguồn.
- Dump **toàn bộ database fixture**, không dùng bộ lọc bảng/schema hoặc tùy chọn bỏ owner/ACL; restore một giao dịch với `--exit-on-error`. Không gọi Meta, model hoặc bootstrap ứng dụng.
- Nguồn và đích nằm cùng cluster cô lập; các role kiểm thử đã tồn tại. Đây không phải chứng cứ tái tạo role trên cluster mới, PITR, backup đang có writer đồng thời hoặc khôi phục toàn bộ production.

## Điều kiện phải đạt

1. Tạo hai Customer/Lead qua RPC SQL702 thực, bao gồm contact, Lead Ads, attribution, notification giao người nhận và receipt. Một inbox đã hoàn tất; một inbox còn processing sau khi CRM đã commit, mô phỏng mất phản hồi trước ACK. Giữ thêm một Messenger pending và một Lead Ads pending.
2. Trước khi xử lý hàng đợi ở đích, so số dòng và SHA-256 nội dung mọi bảng fixture, owner, ACL đã chuẩn hóa, RLS/policy, cấu trúc/công thức cột, FK/constraint, index, trigger và function, định nghĩa/trạng thái sequence. Nạp nguyên migration145/147/392/568 và việc bỏ trigger tự sinh task qua227. Giá trị nhiệt độ do trigger147 tạo phải giữ nguyên sau restore; intake mới ở đích chạy trigger568 với `project_id=NULL` mà không tạo deal/project/task.
3. Cấp thử một quyền SELECT sai ở đích phải làm bộ so sánh phát hiện khác biệt; thu hồi lại phải khớp. `anon`/`authenticated` vẫn không đọc/ghi các bảng nghiệp vụ; `service_role` không được ghi binding/receipt hoặc xóa/truncate inbox. Receipt vẫn bất biến; RPC intake chỉ service được thực thi.
4. Token cũ/sai không được hoàn tất hoặc chạy intake. Sau khi lease ở **đích** hết hạn theo mô phỏng, claim lease mới rồi dùng `lead_data`/`provider_data` đã lưu để gọi lại intake; trả `existing` với nguyên Customer/Lead/contact/recipient/receipt, không cần truy cập provider và không tạo thêm notification.
5. Enqueue lại cùng event đã hoàn tất không mở lại hàng; event envelope mới cùng danh tính provider cũng dùng receipt cũ. Messenger pending không bị mất. Intake mới ở Page còn lại vẫn tạo dữ liệu, trigger stage history và ACK thành công sau restore.
6. Toàn bộ dữ liệu/metadata/sequence ở nguồn phải giữ nguyên sau mọi thao tác ở đích. Log chỉ ghi hash archive, kích thước, số bảng, tên database kiểm thử và giới hạn `sameCluster=true`/`productionRestore=false`.

## Bằng chứng và giới hạn

Chỉ ghi PASS PostgreSQL khi ca30 thực sự chạy (không skip) trên commit chứa delta và log có kết quả terminal. Log sẽ xuất SHA-256 archive và số bảng thực tế; không dự đoán số hoặc điền bằng chứng từ bộ701. Đây là mở rộng test, không tự phê duyệt chuyển luồng hay thay thế backup/restore vận hành được Founder duyệt.

Schema nền CRM trong bộ thử là fixture tổng hợp; các migration Facebook, attribution, atomic639, ACL700, inbox701 và intake702 dùng mã thật. Fixture thêm tối thiểu `crm_activities`, `crm_deal_projects`, `crm_leads.phone/estimated_value/project_id` để nạp nguyên147 và568. Ca31 xác nhận cả ba trigger temperature INSERT/UPDATE và project đang bật, SQL702 giữ NULL project/temperature và `info_complete=false`, không làm đổi project hiện có; UPDATE thời gian thi công chạy trigger thật từ hot sang warm. Đây là kiểm tương thích các trigger đã xác định, không chứng nhận toàn bộ CRM/trigger khác chưa nạp vào fixture.
