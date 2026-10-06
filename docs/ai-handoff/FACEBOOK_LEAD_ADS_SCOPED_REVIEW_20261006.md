# Review độc lập — chuyển riêng Facebook Lead Ads sang inbox/CRM

Ngày review: 06/10/2026. Reviewer: agent `marketing_release_review`, phiên riêng với các agent viết mã/SQL/test. Reviewer chỉ đọc source, chạy kiểm thử tổng hợp và đọc CI; chỉ viết hồ sơ review này. Đây không phải review/approval của một người trên GitHub, không phải bằng chứng triển khai hoặc nghiệm thu Meta thật.

## Kết luận theo phạm vi

| Phần | Kết luận |
|---|---|
| Mã chuyển luồng, bảo vệ writer cũ và quyền đọc Lead Ads | **PASS có phạm vi** trên source `66d2a5d7c867cb5574ac61709fe39669cbbcec67`; các finding cần sửa trong lượt này đã được xử lý. |
| Node cục bộ do reviewer chạy | **PASS 260/260**, không fail/skip; kiểm cú pháp route và kiểm diff với EOL gốc đạt. |
| PostgreSQL/khôi phục fixture | **PASS** trên `327864b759c6e5663949b87723ed7049c209d193`; source SQL/test PostgreSQL không đổi ở `66d2a5d7`. CI terminal của toàn bộ bản cuối phải được gắn trước merge. |
| Deploy ở trạng thái tắt | Không thấy blocker trong code cho deploy dormant sau khi CI bản cuối đạt, với bộ cờ tắt đầy đủ và binding inactive nêu dưới đây. |
| Bật worker/tiếp nhận thật | **HOLD về điều kiện vận hành**, không phải thiếu quyền Founder: còn xác minh cấu hình ký/Graph/Primary và thực hiện kiểm tra chuyển đổi trên đúng bản live. Không được ghi là đã chạy thật từ review này. |

Founder đã duyệt bật chạy thật. Review không yêu cầu duyệt lại quyết định đó; parent phụ trách thực hiện các bước kỹ thuật và ghi bằng chứng. Phạm vi vẫn là tiếp nhận Lead Ads, không mở AI nhắn khách, chi quảng cáo, H2/Messenger projection mới hoặc toàn bộ PR22/25.

## Source đã rà

Base chính: `1f879ea85dfff23629fef79c8d15f2eaf540328e`. Delta được rà tiếp sau review intake cũ `a5bcabf3`: parity notification TEXT, scoped receiver, guard legacy, restore fixture và các sửa cuối ở `66d2a5d7`. Các Git blob dưới đây được đọc bằng `git hash-object` từ tệp thật:

| Tệp | Git blob |
|---|---|
| `backend/src/helpers/facebookPageInbox.js` | `445eec062d07f8b35529d169647c61c634a77b4a` |
| `backend/src/helpers/autoTool.js` | `9783dd0dc9969ec4a74daacee628b39e61ed36db` |
| `backend/src/routes/facebook.js` | `ce99b930377048ccbcb6b352a57802a9d9b1a669` |
| `backend/src/server.js` | `60adb0573698d83adc63787f6c1666f87623b70b` |
| `backend/src/config/supabaseRouter.js` | `ca122fbd2f4259b06e7bc1ad0459374b5acf89d0` |
| `backend/src/domain/facebookLeadAdsIntake.js` | `5c325fe210e9d35151a69a7636a69a64fd37be8a` |
| `backend/src/services/facebookLeadAdsIntake.js` | `b2b652a99f1bb4de73e53705877a10e0f30ba61b` |
| `database/701_facebook_page_inbox.sql` | `6aa36356c12904f7f72ca85392805b4108f877eb` |
| `database/702_facebook_lead_ads_intake.sql` | `268830b8b998987b307bba816ff008bdc7d57b6c` |
| `backend/tests/facebookPageScopedWebhook.test.js` | `c0f81ad72807bba656ec09e961522188e4d8d76b` |
| `backend/tests/facebookPageLeadAdsReadScope.test.js` | `1c5381f307c0bc94a7188f7a03482ab0c05d5f9a` |
| `backend/tests/facebookLeadAdsIntake.postgres.test.py` | `1e192534b664a8ee9357387bb6013e31dd125f71` |
| `.github/workflows/facebook-page-inbox.yml` | `4c2b53bb20749d01fe72e4a4e6ca31284b2760fc` |

Nếu runtime/SQL/test thay đổi sau các blob này, kết luận không tự áp dụng cho delta mới. Commit chỉ tài liệu có thể giữ nguyên bằng chứng nếu đối chiếu blob/tree xác nhận source không đổi.

## Phát hiện đã xử lý và hành vi được xác nhận

1. Receiver dùng raw body đã xác thực HMAC, tách mọi `leadgen` trên Page được quản lý vào inbox mới, kể cả form chưa có binding. Các form đó chờ xử lý thay vì rơi lại writer cũ. Messenger/bình luận/Page khác giữ đường hiện tại. Chỉ ACK sau các thao tác queue cần thiết đã thành công; đây là hai lần ghi chống trùng riêng, không phải một giao dịch chung giữa hai queue. Messenger chỉ có bảo đảm của queue cũ trên Page vốn đã bật durable Messenger; không tuyên bố mọi sự kiện dư đã được nâng cấp sang inbox mới.
2. Worker scoped chỉ claim Lead Ads của Page được quản lý, vì vậy không cần chờ queue Messenger rỗng. Generic H1 vẫn giữ điều kiện cũ. Timer Messenger được giữ hoạt động trong scoped mode. Primary pin/lease/retry vẫn là ranh giới cho lane mới; thiếu binding, quyền hay bằng chứng phải giữ pending.
3. Writer cũ kiểm contact hiện tại và receipt, không tin `psid/page_id` do caller đưa. Common creator, manual create/link/update/delete/reconcile/sync-history, Pipeline cả xử lý lẫn cleanup và AutoTool được bảo vệ. Các tác vụ bảo trì rộng chưa tách an toàn bị khóa khi intake bật. Scanner cũ trong server có kiểm Page/identity nếu được bật lại; reviewer không chứng nhận scanner đó có toàn bộ receipt guard của route.
4. Hai đường inline `/batch-sync-messages` và `/refresh-names` được thêm kiểm quyền sở hữu contact trước Graph/write. Với batch sync, kiểm đặt ngoài catch cũ vốn vẫn ghi `last_synced_at` khi lỗi, nên lỗi đọc scope không biến thành quyền ghi. Ca protected/ordinary/read-error chạy exact route đều đạt.
5. Finding P1: GET `/facebook/lead-ads` trước đây dùng service role lấy toàn bộ PII mà không lọc Page. Đã sửa dùng resolver scope hiện có, `.in/.eq` trước query và kiểm membership trước trả kết quả; Page ngoài phạm vi bị từ chối, tập Page rỗng không query, lỗi đọc không trả success giả. Có 20 ca dùng route/resolver/role predicates thật, storage/tenant attachment tổng hợp.
6. SQL702 so sánh `notifications.entity_id` với Lead ID qua TEXT phù hợp schema thật do parent đối chiếu. Fixture đã dùng TEXT; retry vẫn kiểm đúng recipient/entity/type/receipt/company. Không sửa SQL700, không tắt trigger CRM để làm test đạt.

Guard không phải khóa toàn bộ CRM/CLI. Trong pilot không chạy các script bảo trì cũ trực tiếp trên contact/Lead của lane mới; sửa CRM chung hoặc thay đổi danh tính sau intake chưa được chứng nhận là công cụ sửa receipt. Không diễn giải việc nhận thành công là khách hợp lệ, ở đúng địa bàn hoặc đã đạt 250.000 đồng/khách.

## Bằng chứng kiểm thử

Reviewer chạy độc lập các tệp Node trực tiếp, không bootstrap server hoặc dùng DB/Meta thật: handlers67, Primary14, inbox28, intake76, read scope20, scoped webhook46, recovery9; tổng260, fail0/skip0. Kiểm `node --check` route đạt. Repo giữ CRLF của route; `git -c core.whitespace=cr-at-eol diff --check` đạt, không rewrite cả tệp chỉ để đổi EOL.

Reviewer đã đọc trực tiếp trạng thái và log [CI37397233336](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37397233336), job PostgreSQL `112055983896`: SQL701 **15/15**, SQL702 **31/31**, ca30 restore thực sự chạy và đạt. Checkout log là merge `327864b7` vào base `1f879ea8`. Node18 job `112055984318` và Node22 job `112055984086` đều terminal success của bản đó; các sửa cuối được reviewer kiểm260ca cục bộ và chờ gắn CI bản cuối trước merge.

Log ca30 ghi dump **31 bảng fixture**, 175.558 byte, SHA-256 `ff04098efdaaaffd14f1ec2b9730f6d8442d98a27fe437eb1d6f2ac8e8eaea1b`, `sameCluster=true`, `productionRestore=false`. Test kiểm dữ liệu/metadata/ACL/trigger/sequence, phát hiện grant drift, replay receipt sau mất phản hồi/lease mới, event trùng và intake mới ở DB khôi phục; nguồn giữ nguyên sau xử lý ở đích.

CHECK fixture được PostgreSQL đọc lại nguyên DDL của chính nó trước dump để ổn định biểu diễn serialize/reparse; test giữ thuộc tính và đòi lần đọc thứ hai ổn định, kèm INSERT sai trực tiếp phải bị từ chối. Đây không phải xóa ngoặc/đổi predicate bằng regex. Restore vẫn chỉ là fixture tổng hợp cùng cluster, các role đã có; không chứng minh full production restore, PITR, cross-cluster roles hoặc backup khi có writer thật đồng thời.

## Điều kiện triển khai và dừng

Deploy dormant có thể tiếp tục trong quyền đã duyệt sau CI cuối: giữ `VPT_FB_PAGE_INBOX=0`, `VPT_FB_LEAD_ADS_INTAKE=0`, `VPT_FB_LEGACY_SCOPE_GUARD=0`, `VPT_FB_PAGE_INBOX_WORKER_PAUSED=1`, `VPT_FB_MANAGED_PAGE_IDS` rỗng; không đổi các cờ durable Messenger đang dùng. Chỉ tắt intake mà còn scope guard/Page enrollment có thể chặn đường cũ. SQL701/702 thêm object riêng, binding phải `active=false`; xác minh live version/flags/health/Messenger sau deploy. Không gọi bước này là đã bật intake mới.

Trước mở scoped receiver/worker: xác minh khóa App đúng cho chữ ký của cả delivery, Graph version/quyền Page/form, Primary và auto-failover off; giữ Backup chưa đối soát ngoài vai trò writer. Bảo đảm process cũ đã dừng và đối soát các lần nhận trong cửa sổ chuyển đổi, rồi mở đúng binding/worker và quan sát sự kiện thật đến đúng công ty/Admin/notification. Không tạo thêm form TEST hoặc gửi tin ngoài phạm vi được giao.

Khi có lỗi phải pause worker, giữ signed receiver/inbox/receipt và guard ownership; không rollback bằng cách mở lại writer cũ, xóa giao dịch hoặc khôi phục quyền anon. Binding inactive không thay thế việc dừng worker khi cần ngừng xử lý.

Parent báo đã nhìn thấy native physical backup Primary ngày05/10 lúc22:35:34UTC và đang ghi bằng chứng riêng; reviewer không tự kiểm Dashboard đó. Lỗi custom clone không chứng minh native backup hỏng, cũng không chứng minh Backup đã đầy đủ. Release additive với recovery pause/preserve không đòi thao tác restore đè production để thử; cần ghi nguồn khôi phục khả dụng và đường thao tác vận hành, không gọi isolated restore là production restore. Nếu chỉ deploy dormant, giữ cờ tắt cho đến khi các gate kích hoạt được hoàn tất.

Tại thời điểm review, parent đang xử lý phiên Render đủ quyền để xác minh cấu hình. Đây là trở ngại kỹ thuật/truy cập, không phải yêu cầu Founder duyệt lại. Theo [hồ sơ kích hoạt](FACEBOOK_LEAD_ADS_ACTIVATION_20261006.md), chưa có bằng chứng trong review này về merge/deploy/SQL apply/unpause hoặc hành trình Meta thật hoàn tất.
