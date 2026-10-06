# Kích hoạt tuyến Facebook Form → CRM → Admin Vạn Phú Thành

## Kiểm tra tiếp — Chrome Work đã kết nối, 06/10/2026 khoảng 11:07 (UTC+7)

**Đã giải quyết quyền truy cập Render. Điểm chặn hiện tại là cấu hình và quyền Meta, không còn là đăng nhập Render. Intake mới vẫn tắt.**

- Founder cung cấp ảnh đúng dịch vụ trên hồ sơ Chrome Work. Sau khi kết nối tiện ích, Codex thấy hồ sơ `vanphuthanh.net` và mở được Environment/Shell của đúng `srv-d6gguqq4d50c73emh20g`. Không yêu cầu đăng nhập lại Render.
- Đọc từ process Shell trên instance `c2brv`, commit `6494f870d756ba294f6d4fdbb64f4acba8483547`: `VPT_FACEBOOK_APP_SECRET` **chưa có**, `VPT_META_GRAPH_VERSION` **chưa có**; inbox/intake/guard đều `0`, worker paused=`1`, managed Page rỗng. Messenger Page=`409741855550833`, auto-failover=`0`. Chỉ in boolean và cấu hình không bí mật; không xuất token/secret.
- Phép GET Graph chỉ đọc dùng Page token đã lưu trên Primary, giữ token trong bộ nhớ process. Yêu cầu `v22.0` trả header phiên bản thực `v25.0`; lần kiểm riêng tiếp theo dùng `v25.0` trực tiếp. Đây là phiên bản thử đọc, **chưa được lưu vào cấu hình dịch vụ**.
- `GET /me?fields=id` trên v25 trả HTTP200, định danh khớp Page VPT. Vì vậy không kết luận token hết hạn hoặc thuộc Page khác.
- `GET /409741855550833/subscribed_apps?fields=id,subscribed_fields` trả HTTP403, Meta code200, thông báo nhắc `pages_manage_metadata`. Chưa đọc được App ID và đăng ký `leadgen`; chưa xác minh callback hoặc khóa ký.
- `GET /1438656288329447?fields=id,page_id` trả HTTP400, code100/subcode33. Token hiện tại không đọc được đối tượng này; lỗi chưa đủ phân biệt thiếu quyền, đối tượng không tồn tại hoặc giới hạn truy cập. Nhật ký giao diện ngày01/10 ghi đã tạo form, ngày05/10 ghi quảng cáo hoạt động; cần đối chiếu lại trong Meta bằng tài khoản quản trị, không tự sửa ID binding từ lỗi này.
- Một lệnh nhập nhiều dòng đầu tiên lỗi cú pháp trước khi thực thi; sau khi sửa cách xuống dòng, các phép GET trên mới thực chạy. Không có POST Graph, thay token, cấp quyền, đổi env, mở binding, gửi form TEST hoặc tạo Lead trong đợt kiểm này.
- Tab Meta for Developers trên chính Chrome Work yêu cầu đăng nhập Facebook. Đã mở sẵn và gửi yêu cầu Founder đăng nhập tài khoản quản trị ứng dụng VPT, không gửi mật khẩu/khóa vào chat. Sau đăng nhập: đối chiếu App/callback, bổ sung khóa ký và quyền Page/form đúng phạm vi, kiểm lại dữ liệu mẫu rồi mới thực hiện trình tự bật receiver/binding/worker đã review.

---

## Kiểm tra tiếp — 10:34 ngày 06/10/2026 (UTC+7)

**Intake mới vẫn chưa bật. Quyết định phát hành của Founder vẫn có hiệu lực.**

- Render hiện live commit `6494f870d756ba294f6d4fdbb64f4acba8483547`, deploy `dep-db25vnjtqb8s73c6ff9g` hoàn tất 02:42:47 UTC. Đây là thay đổi PR30 của người làm song song; so với merge PR29, chỉ bổ sung quyền đọc bình luận/thành viên cho người được giao việc. Các file Facebook, worker, router DB và SQL701/702 đã review không đổi.
- Đọc lại Primary lúc khoảng 03:26 UTC: binding còn `active=false, version=1`; Page và Admin active, cùng công ty; token Page có mặt (không đọc/xuất giá trị). Inbox/receipt mới đều 0, Messenger 93 receipt đều done. `/api/health` lúc 03:27:29 UTC: `ok`, Primary khỏe, active Primary, auto-failover tắt. Những kết quả này không thay nghiệm thu một sự kiện Meta thật.
- Sau hai lần Founder báo đã chuyển/đăng nhập, tab Chrome đang kết nối vẫn trả tài khoản `kinhphucdat@gmail.com`, workspace chỉ có hai dịch vụ `web-cong-dong`, và `Access denied` với backend VPT. Đã đưa đúng tab về đăng nhập, điền email quản lý `backen@vanphuthanh.net`, nhờ Founder xác nhận khi nhìn thấy `tubep-backend`. Không xin duyệt lại release và không coi đăng nhập thành công vào tài khoản khác là đã có quyền backend.
- Reviewer độc lập rà lại trình tự kích hoạt: phải xác minh đúng **App ID** đăng ký `leadgen` và callback của backend. Route cũ `/api/facebook/webhook-fields` gộp field của nhiều app, nên kết quả có `leadgen` riêng lẻ chưa đủ. Có thể dùng Shell của đúng backend để GET Graph với Page token trong bộ nhớ, chỉ xuất ID/boolean/mã HTTP; chưa chạy preflight này.
- Khi đủ cấu hình, bật đồng thời scoped receiver/intake/legacy guard và danh sách Page, vẫn giữ worker paused. Chờ bản cũ dừng rồi mới mở binding một lần và unpause. Không bật riêng inbox vì có thể chuyển cả Messenger. Dừng thông thường bằng pause worker; không cập nhật binding chỉ để pause vì trigger tăng phiên bản và receipt cũ cần đối soát.
- Khóa ký có mặt không chứng minh khóa đúng; webhook GET challenge không xác minh App Secret. Chưa xác minh khóa/Graph nên chưa đổi cờ, chưa mở binding, chưa gửi thêm form TEST hoặc liên hệ khách.

---

## Kết quả thực hiện — 08:20 ngày06/10/2026 (UTC+7)

**Đã triển khai lên production ở trạng thái tắt. Chưa bật tiếp nhận Lead Ads mới.** Founder đã duyệt; không có yêu cầu duyệt phát hành còn chờ.

- [PR29](https://github.com/backen-pixel/Quanlycongviec/pull/29) đã merge lúc01:17UTC: `b51078d3fe546eb2dd43f254e988a6195bb24df7`, head kiểm chứng `b94f4ef01e2fc13964df0770a42144e67dbe23d2`, runtime được review `66d2a5d7` không đổi.
- CI đúng headb94: [inbox37397952631](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37397952631) Node18/22 và PostgreSQL đều success; [Messenger37397953036](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37397953036) success. PG job112058299518 chạy15/15 inbox +31/31 intake, ca30 restore thực chạy31bảng,175554bytes, hash `ff47523736c49106cefd5c0601736f9cbc89d76acc27d13e60573e8a1b43c59c`. Đây vẫn là fixture, không phải restore production.
- Primary đã áp `facebook_page_inbox_701` version`20261006011452` và `facebook_lead_ads_intake_702` version`20261006011508`, đúng fileSQL trong source được review. Không sửa SQL700 hoặc DB Backup. Binding Page`409741855550833`/form`1438656288329447` đã tạo đúng routing dưới đây, **active=false, version1**.
- Kiểm quyền thực01:16UTC: cả3bảng mới có RLS, anon/authenticated không SELECT; service không INSERT/DELETE binding/receipt, không DELETE inbox; intake RPC chỉ service có EXECUTE, không anon/authenticated. Không cấp quyền lại trên bảng cũ.
- Render đã xác nhận lưu đúng5cờ off/paused bằng merge-env, không thay các biến khác; thao tác tự tạo deploy cấu hình`dep-db24mumk1f9s7393kp5g`. Merge tự tạo deploy mã`dep-db24o3rncjis73c877fg`, trạng thái **live**, hoàn tất01:18:09UTC, đúng mergeSHA trên; không gọi deploy lần nữa.
- Sau deploy: `/api/health` lúc01:19:18UTC trả`ok`, uptime73s,`active=primary`,`auto_failover_enabled=false`,Primaryhealthy. Startup instance`...-w2flx` ghi probe failoveron/autooff lúc01:18:04UTC. Quyền chuyển DB thủ công vẫn có, không dùng nó trong đợt này.
- Đối soát01:20:40UTC: inbox0,receipt0,bindinginactive; Messenger93receipt đều done, không có receipt dangdở. Giao diện CRM đăng nhập hiện tại tải lại tabLeadAds thành công, hiển thị chưa có LeadAds; đây không phải nghiệm thu bằng tài khoản AdminVPT hoặc một Lead thật.
- Công cụ auto-review đã từ chối merge lần đầu vì chưa ghi nhận đủ CI headcuối. Sau khi đọc lại cảhai workflow completed/success đúngb94 và cung cấp evidence trong lời gọi, cùng công cụ đã cho merge thành công. Không dùng đường vòng hoặc bỏ qua kiểm soát.

**Điểm chưa mở:** phiên Render UI đang là tài khoản không có quyền dịch vụ VPT; cần phiên đúng để xác minh`VPT_FACEBOOK_APP_SECRET` và`VPT_META_GRAPH_VERSION`, quyền Page/form và đối chiếu chữ ký Meta. Không suy secret thiếu hoặc đúng khi chưa đọc; không dùng webhook verify token thay AppSecret. Root đã gửi câu hỏi nhờ Founder chuyển tài khoản; không xin duyệt lại release. Sau khi xác minh, bật signed scoped receiver với workerpaused, chờ bản cũ dừng, đối soát chuyển đổi rồi mới mở binding/worker và xác nhận hành trình Meta→Admin. Chưa gửi thêm formTEST, nhắn khách hoặc đổi ngân sách.

Phần dưới giữ hồ sơ trước triển khai và trình tự còn lại theo thời điểm.

---

Founder đã yêu cầu rõ: **“cho bật chạy thật luôn nhé”** ngày 06/10/2026, tiếp nối quyết định phát hành. Quyền phát hành tuyến đang làm đã có; không chờ duyệt lại. Phạm vi không mở AI gửi tin, tăng chi quảng cáo hoặc merge toàn bộ PR22/25. Phần thu quyền anon/SQL700 vẫn thuộc Claude, Codex không thay.

Trạng thái trước triển khai: source `66d2a5d7c867cb5574ac61709fe39669cbbcec67` đã qua260/260 kiểm thử Node độc lập và review mã; đang chuẩn bị triển khai dormant với mọi cờ intake tắt. CI PostgreSQL của phần SQL/restore tại327864b7 đạt15/15 inbox và31/31 intake; vẫn kiểm CI head cuối trước merge. Chưa merge PR29, áp701/702 hay bật worker tại checkpoint này. Không dùng hồ sơ này làm bằng chứng đã chạy thật.

## Đối chiếu hệ thống thật ngày 06/10

Qua kết nối Render và SQL chỉ đọc, không đọc token/mật khẩu:

- Workspace `tea-d47g0824d50c73856e80` đã được Founder xác nhận trước đó; backend `srv-d6gguqq4d50c73emh20g`, một instance, auto-deploy nhánh main. Bản live `1f879ea85dfff23629fef79c8d15f2eaf540328e`, deploy `dep-db1sa67f3r2c73ce3dig`.
- Primary `kdxypztstbeovyedmvem`: chưa có inbox701/binding702; không có `crm_care_control` hoặc `marketing_fb_lead_bindings`. Các vai anon/authenticated/service_role không có CREATE trong public. Messenger có93receipt done, không có pending/processing tại lần đọc.
- Page `409741855550833` — Bếp Vạn Phú Thành: active, auto_create_lead, CRM/Lead; token đã lưu (không xuất giá trị). Công ty `991dc79d-cbf5-49f9-a364-35227cb47635` và Admin `49fcd3ff-0d7c-4d54-8f5a-1068bd10d68c` đều active, cùng tenant `7d42e731-895b-4ba8-99d6-0005c4e23544` đang active; role Admin gắn đúng công ty.
- Stage hiện tại `a799f5e5-513c-4d55-b403-1ec2010574d3` (TIẾP NHẬN) thuộc pipeline `78e6251c-aea1-46bc-a19f-a401f1de7f34` (CRM — Bếp Vạn Phú Thành), active, Lead, chưa thắng/thua. Page.default_pipeline_id đang NULL; binding mới dùng pipeline từ quan hệ stage đã xác minh, không sửa cấu hình Page chung.
- Nguồn `b791ee5f-7dba-4e11-b015-6b9d232cdf1e` và vùng `f68e643d-7999-442c-83ee-edb7f5237ab1` (TP.Hồ Chí Minh) đều active, thuộc VPT. Vùng nhận việc không phải bằng chứng địa chỉ khách.
- Form mục tiêu `1438656288329447`, chưa có mapping tùy chỉnh trong `fb_lead_form_mapping`; cần xác nhận trường standard và quyền Graph thực trước bật. Form khác trên cùng Page phải được giữ pending nếu thiếu binding, không trả về writer cũ.
- `notifications.entity_id` và `type` thực là TEXT: đã sửa so sánh receipt retry về TEXT, chỉnh fixture cho đúng. Trigger Lead đang có145(stage history),147(temperature),392(tenant),568(project): nạp147/568 vào kiểm thử, không vô hiệu trigger. Không có legacy auto-task39 đang chạy.
- `fb_auto_pipeline.master=false`, `companies={}`, nhưng `fb_master_schedule.enabled=true`, phase run; không được dựa riêng master=false để suy không có lịch ghi. Cần bảo vệ Lead Ads khỏi scan/dedup/cleanup cũ trong mã trước bật.
- Đồng bộ Backup theo lịch đang bật; lượt cuối `2026-10-05T21:00:17.143Z` ghi failed, lỗi gọn `clone-primary-to-backup.js exit 1`. Chưa chứng minh khôi phục production hoặc Backup đồng bộ. Không tự chạy clone/restore đè Backup.
- Đã đọc Dashboard Supabase Primary: native restore point `05 Oct 2026 22:35:34 (+0000)`, PHYSICAL, có nút Restore; không nhấn khôi phục. Custom sync lỗi do thiếu shared-memory locks trong bước chuẩn bị schema, khác với native snapshot. [Bằng chứng và giới hạn phục hồi](FACEBOOK_LEAD_ADS_BACKUP_PREFLIGHT_20261006.md). Bước additive701/702 có thể dùng native snapshot cùng CI restore và phương án pause/giữ dữ liệu; lỗi custom clone giữ là ngoại lệ riêng, không tự chặn deploy dormant. Khi intake bật phải Primary-only/auto-failover off.

## Chuyển đổi và dừng

Bản sửa source `327864b759c6e5663949b87723ed7049c209d193`:234/234 ca Node cục bộ đạt; đã đẩy CI. Khi lane bật, tạm khóa các POST bảo trì `/dedup-leads`, `/sync-source-ids`, `/sync-contact-phones`, `/batch-extract-phones`, `/tools/link-only-phones/execute`, `/rescan-phones`, `/scan-leads-by-date`, `/phone-quality-apply`. Lịch rescan dùng cùng khóa; phần sync toàn bộ mô tả Lead của sync-then-extract bị bỏ qua có mã lý do. Pipeline/AutoTool/scanner server và manual create/link/update/delete/reconcile kiểm contact hiện tại cùng receipt trước ghi. Messenger và timer tiếp tục chạy. Không chạy CLI bảo trì cũ trong pilot; các helper ngoài entrypoint đã rà và chỉnh sửa CRM chung chưa được chứng nhận là công cụ sửa receipt.

Review độc lập phát hiện route đọc `/facebook/lead-ads` cũ chưa lọc Page theo công ty; đã sửa ở66d2a5d7 với20 ca đúng/sai quyền/lỗi nguồn. Hai vòng batch-sync-messages và refresh-names cũng bỏ qua contact được bảo vệ trước Graph/ghi;6 ca bổ sung. Toàn bộ260 ca Node đạt trong lượt độc lập; [review chuyển đổi](FACEBOOK_LEAD_ADS_SCOPED_REVIEW_20261006.md).

Triển khai dormant dùng đúng5 cấu hình: `VPT_FB_PAGE_INBOX=0`, `VPT_FB_LEAD_ADS_INTAKE=0`, `VPT_FB_LEGACY_SCOPE_GUARD=0`, `VPT_FB_PAGE_INBOX_WORKER_PAUSED=1`, `VPT_FB_MANAGED_PAGE_IDS` rỗng. Schema và binding có thể cài trước ởactive=false; không đòi App Secret/Graph khi tất cả cờ tắt. Đây không phải bước bật tiếp nhận mới. Khi chuyển sang signed ingress, phải có App Secret đúng để không làm lỗi cả Messenger.

1. Signed receiver tách đúng Lead Ads của Page quản lý vào inbox701; Messenger/bình luận/Page khác đi đường hiện tại. Chỉ ACK sau khi các lần lưu hàng đợi cần thiết đều xác nhận; hai hàng đợi không được gọi là một transaction chung.
2. Bảo vệ các đường tạo/sửa/xóa/bảo trì cũ để không có hai writer cho contact Lead Ads thuộc lane mới. Chức năng bảo trì chưa thể tách an toàn được tạm khóa khi lane bật, ghi rõ danh sách trong bản cuối.
3. Hoàn tất CI PostgreSQL31ca gồm khôi phục đầy đủ fixture, kiểm thử signed mixed webhook, review độc lập đúng SHA. Fixture không thay chứng cứ khôi phục toàn bộ hệ thống thật.
4. Xác minh khóa ký App, Graph và cấu hình Primary. Cài schema mới/binding mặc định chưa hoạt động; deploy mã chuyển đổi với worker paused. Chỉ mở binding/worker sau khi bản cũ đã dừng và đối soát các lần nhận trong chuyển đổi.
5. Xác nhận health, pending/errors và một sự kiện Meta thật đi đúng Lead/Admin/notification. Không gửi form TEST bổ sung hoặc nhắn khách dưới danh nghĩa kiểm thử khi chưa có phạm vi tương ứng.
6. Dừng bằng pause worker, giữ signed receiver/inbox/receipt. Không xóa dữ liệu, mở lại quyền anon hoặc bật writer cũ khi còn sự kiện của lane mới.

Tab Render qua Chrome hiện đăng nhập tài khoản `kinhphucdat@gmail.com`, báo không có quyền dịch vụ; đã nhờ Founder chuyển sang tài khoản quản lý VPT để đọc cấu hình khóa kết nối qua giao diện. Kết nối MCP Render vẫn đọc đúng workspace. Đây là thiếu phiên truy cập cấu hình, không phải thiếu quyết định phát hành.
