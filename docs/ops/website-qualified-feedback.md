# VPT: khách quảng cáo → website → CRM → xác minh

Người dùng đã duyệt phát hành [PR #128](https://github.com/backen-pixel/Quanlycongviec/pull/128) và tạo/lưu credential CAPI website riêng **chỉ ở chế độ test**. Gói đã áp SQL primary, merge/deploy Render và cập nhật WordPress/form ngày **14/10/2026**; **một TEST form → CRM đã được đối soát, sender Meta vẫn tắt, provider/backup chưa nghiệm thu**. Đây là tuyến website riêng; không chứa hoặc kích hoạt tuyến Facebook native Form của [PR #127](https://github.com/backen-pixel/Quanlycongviec/pull/127), vẫn draft/chưa triển khai. Các giờ phát hành dưới đây dùng **Asia/Saigon (UTC+7)**.

## Cập nhật backup 12:47 ngày 14/10/2026

Người dùng đã phê duyệt riêng `QLCV_Backup / atcfpgxkgbszglrelfgr`; migration [`20261014022725_website_intake_backup_compat.sql`](../../database/20261014022725_website_intake_backup_compat.sql) đã áp thành công lúc **12:45:05**, history `20261014054505 / website_intake_backup_compat_vpt_20261014`. Hậu kiểm **12:45:39** xác nhận cột `crm_leads.website_intake` JSONB nullable/default NULL; tổng CRM **9.544**, VPT **3.014** hàng giữ nguyên, metadata có giá trị **0**, không DDL backfill. ACL fingerprint `c1e488b30589fa3c45d7d80fe02ddcad` không đổi, RLS bật; không thêm policy/RPC/trigger/bảng receipt/outbox/private hoặc kích hoạt sender. Phê duyệt và sửa cột đã hoàn tất; backup baseline vẫn chưa đủ qualification/receipt/sender.

| Health Asia/Saigon | Applied | Failed | Queue |
|---|---:|---:|---:|
| 12:44:18, trước sửa | 2.617 | 610 | 4.933 |
| 12:46:04, sau sửa | 2.617 | 650 | 5.004 |
| 12:47:28.725 | 2.645 | 661 | 5.220 |

Primary/backup đều healthy, active primary. Last error mới **PGRST116** ở singular PATCH **`project_substage_status`**, là lỗi bản ghi/hàng đợi khác; không kết luận thiếu parent. Applied tăng sau sửa nhưng failed/backlog cũng tăng: **chưa khôi phục toàn bộ replication, chưa nghiệm thu failover**. Lúc **12:47:03.900**, metadata request TEST vẫn chưa có trên backup. Log Render lọc `website_intake` sau 12:45:05 có **0** mục; điều này không chứng minh request TEST đã đồng bộ hoặc hàng đợi đã hết lỗi. Không tự backfill/replay/tạo receipt thay cho bằng chứng.

[PR #130](https://github.com/backen-pixel/Quanlycongviec/pull/130) có hai kiểm CI PASS tại HEAD cũ `ae8d66e32cada85b97bef68d366815cb11c4e893`; đang hợp nhất origin/main, **cần CI tại SHA merge/cuối mới**. TEST form → CRM primary đã đối soát và LIVE đã khôi phục; SMTP vẫn chưa sửa, Meta sender tắt/test và chưa provider ACK, Google Data Manager vẫn chờ Lead thật đã xác minh. Không qualified CPL mới.

PR #130 chỉ SQL/docs/test, dự kiến squash với `[skip render]` theo [Render deploys](https://render.com/docs/deploys#skipping-an-auto-deploy) để không redeploy runtime/reset hàng đợi replication đang giữ trong bộ nhớ khi Redis tắt; đây là kế hoạch, chưa là kết quả merge.

## Hồ sơ phát hành 14/10/2026 — gồm bản ghi trước sửa backup

PR #128 squash-merge lúc **09:09:49**, SHA `f4d7b8d20ab83869b516b805be27bc68edd8f7f6`. Nhánh chuẩn bị trước đó là `codex/vpt-website-qualified-leads-20261014` từ main `3c6761731b0e4a6e248a81e1484d101c3b82e049`. Có **269** kiểm cục bộ PASS (220 Node, 28 PHP, 21 SQL) và **8** kiểm CI PASS tại exact candidate `8a71ac057d23568005c63c862b7ba47d7f42002f` trước release; đây không phải chứng minh form/Ads đầu-cuối.

Primary `qlycv` (`kdxypztstbeovyedmvem`) đã áp hai migration, đúng thứ tự, không seed/backfill:

| Source migration | History version / name đã áp |
|---|---|
| `20261014005710_website_intake_receipts.sql` | `20261014020814 / website_intake_receipts_vpt_20261014` |
| `20261014005713_website_feedback_outbox.sql` | `20261014020825 / website_feedback_outbox_vpt_20261014` |

Kiểm độc lập ACL/RLS, **13 RPC**, **3 trigger** và zero backfill PASS. Advisors chỉ phần schema mới: **0 ERROR / 0 WARN / 5 INFO** gồm ba bảng RLS không policy có chủ đích vì service-only, FK `outbox_id` chưa index và index pending chưa dùng. Các vấn đề baseline ngoài phạm vi không được gộp vào kết quả này.

Render **My Workspace**, tất cả cùng SHA release trên:

| Thành phần | Deployment ID | LIVE ngày 14/10 |
|---|---|---|
| Backend | `dep-db7e8ru7bikc73cub1e0` | 09:11:19.848 |
| Frontend | `dep-db7e8ru7bikc73cub1bg` | 09:11:40.515 |
| Backend redeploy cấu hình | `dep-db7ea5i5b2lc73fkc230` | 09:13:59.548930 |

**Bản ghi lịch sử trước sửa backup, 09:25:** health lúc **09:25:40** báo primary và backup đều HTTP 200, active vẫn primary, không auto-failover; replication failed **2**, lỗi `PGRST204` vì backup thiếu cột `website_intake`. Candidate [`20261014022725_website_intake_backup_compat.sql`](../../database/20261014022725_website_intake_backup_compat.sql) chỉ thêm `crm_leads.website_intake` JSONB nullable, không default, kiểm schema rồi reload PostgREST cache; không ghi rows, thêm grants/RPC/receipt/outbox hoặc trigger của primary. Review và **5/5** kiểm SQL thật qua [`website-backup-compat-sql.js`](../../backend/tests/website-backup-compat-sql.js) PASS; CI đã thêm command tương ứng. Tại thời điểm đó **chưa áp/chưa được duyệt backup**; kết quả được duyệt và áp lúc12:45 ghi trong mục cập nhật mới phía trên. Backup baseline chưa đủ qualification/receipt/outbox/sender; mirror column chỉ sửa tương thích replication Lead, không chứng minh failover hoặc tuyến Ads chạy được trên backup.

WordPress đã lưu/read-back đủ ba file plugin **0.4.0**; hash SHA-256 sau chuẩn hóa LF:

| File đã đọc lại | SHA-256 LF |
|---|---|
| `core.php` | `a6d762f81c64d4f557e997768f2e004aa917969e0ca8c14274c5c918b90e33b3` |
| `attribution.js` | `652ad2ce312a98242abe9a41e2a700b80f8fb36b93ccb53cf5bdebb9f6bad5d7` |
| `vpt-v1-crm-bridge.php` | `bfaca440b234414b380c6678cc9262cdfed12e482899babc4758efb7b84bed7b` |
| CF7 form `11116` | `d209be06b82ce63c0327541685293731f1bf2b8648ec3773359634bfc3fdd13a` |

Form đọc lại khớp [`form-11116-0.4.0.txt`](../../integrations/wordpress/vpt-v1-crm-bridge/form-11116-0.4.0.txt) nếu bỏ khác biệt newline cuối. Đã thấy lựa chọn đo quảng cáo riêng không tích sẵn, ba matching hidden field và script `attribution.js?ver=0.4.0-1791944402`. WP Rocket cache clear lúc **09:23**, kiểm cấu hình trả `preflight_verified`. Khi cài giữ LIVE/khóa cũ, không xử lý lại job cũ; sau cửa sổ TEST được duyệt đã khôi phục LIVE và xác nhận UI. CTA/category/product hooks đang chạy được giữ. Backup ba file 0.3.3 và form trước thay đổi ở thư mục ngoài repo `vpt-wordpress-backup-20261014`.

Đã tạo/lưu token CAPI website riêng cùng **tám biến cấu hình** phía Render backend: `ENABLED=0`, `CONSENT=1`, `MODE=test`, công ty VPT, VPT 01 `act_835757498658305`, Pixel **1000623629782763**, Graph **v26.0**, Test Event Code private. Không bật thêm Dataset Quality API, không ghi token/test code/credential UUID vào hồ sơ. **Chưa kiểm token hợp lệ, chưa provider ACK hoặc event; chưa chứng minh kết nối đầu-cuối.** CRM UI lúc **09:21:54** có verified-with-receipt **0**, metaReady **0**, ledger **0**, kết nối **Chưa bật**; các số này không chứng minh không có khách ngoài CRM.

**Bước 5 TEST form → CRM đã đạt sau phê duyệt cửa sổ TEST/email:** lần đầu validation tên thất bại không queue; một lần hợp lệ có request `abfb393d-d9ee-4686-a113-0dc59a29a8b4`, mode TEST, `measurement_consent=false`, `consent_version=VPT_ADS_V1`, GET receipt của chính request trả **confirmed**. SQL hậu kiểm độc lập lúc **09:33:58.944** xác nhận đúng **1 Lead + 1 receipt + 1 attribution** theo request, `is_test=true`, đúng công ty VPT/customer/source/form/site/timestamps; assignee là Admin đang hoạt động cùng VPT theo default integration. Không cookies/click IDs; public JSON chỉ có fingerprint, không credential UUID; qualification/outbox/attempts **0**. Đã khôi phục LIVE, xác nhận lại UI. Đây là kiểm tuyến lưu CRM bằng hồ sơ thử, không xác minh Lead thật hoặc nghiệm thu Ads/CPL.

**Email CF7 thất bại:** response thực tế là `mail_failed`, không báo email đã gửi. Tools SMTP đọc-only xác nhận Email Source Contact Form 7 / Mailer Other SMTP, lỗi `Could not connect to SMTP host. Failed to connect to server`; chưa gửi thêm test mail hoặc sửa credential. Queue/CRM độc lập vẫn có receipt confirmed và SQL proof nêu trên; chưa sửa hoặc nghiệm thu vận chuyển email. Bridge không có per-request TEST override khi global LIVE; cửa sổ TEST toàn site tạm ảnh hưởng public intake/CTA. `GET /wp-json/vpt-v1/v1/receipt/<request_id>` có thể dispatch job queued, không phải đọc thuần. Bỏ chọn consent chỉ chặn measurement mới của bridge, không chặn Pixel nền sẵn có; không dùng thao tác tải trang làm bằng chứng zero provider event. Không qualification thật, chế click ID hoặc phát event Meta từ sender mới.

## Khảo sát trước phát hành — giữ theo thời điểm ghi

Các trạng thái “chưa có/chưa lưu/chưa tạo token” trong mục này mô tả khảo sát trước release; kết quả hiện tại ở hồ sơ phía trên.

- CRM primary `qlycv`: lúc 08:21 ngày 14/10 có **2** Lead/Deal thật mang nguồn website bất biến, **0** phiếu xác minh VPT; chưa có bảng receipt/outbox mới. Đọc lại nguồn ngày 14/10 xác nhận cả hai mang nhãn `google / organic`, không GCLID/FBCLID/ad ID. Không lấy số này làm số khách hợp lệ hoặc ghi nhận quảng cáo.
- Form CF7 `11116` trên `vanphuthanh.net` có thông tin liên hệ, đồng ý liên hệ, UTMs và click IDs. Chưa có lựa chọn đồng ý đo quảng cáo riêng hoặc FBC/FBP trong form hiện tại.
- Sau tương tác trên trang để tải mã trì hoãn, DOM có Google `AW-460207797`, `GTM-5HS4MSR` và hai Meta Pixel `1000623629782763`, `1129111234253260`. Chưa chứng minh chúng cùng đo đúng một lần gửi form.
- Events Manager xác nhận `Pixel tổng remarketing facebook` **1000623629782763** thuộc Công ty TNHH Bếp Vạn Phú Thành **815284983995477**, chia sẻ với VPT 01 **835757498658305** và các tài khoản VPT khác, có CAPI đang hoạt động. Đây là **đích website đề xuất**, chưa tạo token/bật sender mới. Pixel `1129111234253260` không xuất hiện trong danh sách nguồn hiện tại của business này; chưa xác định chủ/quyền hoặc gỡ mã đó.
- API logs gần nhất xác nhận bridge dùng integration tên `VPT_V1_CF7_CRM_Admin_HCM`, đang hoạt động; không đọc giá trị secret. UUID của integration cũng được auth legacy chấp nhận làm credential, vì vậy không hardcode/lưu UUID thật trong source, docs, preview hoặc JSON Lead.
- Người dùng đã đăng nhập WordPress admin trong phiên. Đã đọc/sao lưu ba file plugin và template CF7 11116 vào thư mục riêng ngoài repo `vpt-wordpress-backup-20261014`. Plugin **0.3.3**, mode **live**, secret đã cấu hình và không hiển thị. Ba file trùng Git HEAD sau chuẩn hóa CRLF/dòng trắng cuối; bản 0.4.0 giữ các CTA/category/product hooks đang chạy. Không click xử lý hàng chờ hoặc thay mode/secret. WPVibe vẫn hết quota; đọc qua editor WordPress được phép. Chưa lưu bất kỳ cập nhật plugin/form nào.

Google đã triển khai [PR #124](https://github.com/backen-pixel/Quanlycongviec/pull/124) ngày 13/10; gói #128 giữ action Google Ads VPT **975-957-2942** `VPT CRM - Lead hop le da xac minh`, ID **7842337600**, Qualified lead / One / Secondary / không giá trị / cửa sổ nhấp 90 ngày. HTTPS `qualified-google.csv` xác thực thành công nhưng vẫn header-only, chờ khách thật đủ điều kiện; **Data Manager chưa hoàn tất mapping/nguồn/lịch/lần nhập**. Không đổi mục tiêu đấu giá của action này.

## Luồng mới và ranh giới bằng chứng

1. Khách vào website: giữ UTMs, click ID, trang đầu; timestamp FBC là thời điểm thật quan sát mã nhấp, không tạo lại ở thời điểm xác minh. Cookie FBC chỉ dùng nếu khớp chính xác fbclid; FBP tùy chọn, không tự tạo.
2. Khách gửi form: đồng ý liên hệ vẫn bắt buộc; **đo quảng cáo là lựa chọn riêng, không tích sẵn**, phiên bản `VPT_ADS_V1`. Từ chối vẫn lưu yêu cầu tư vấn nhưng không thu FBC/FBP hoặc phát chuyển đổi form mới của bridge.
3. PHP bridge tạo request UUID phía máy chủ và đóng băng payload trong job. `submitted_at` giữ mili giây; retry giữ request, giờ, nguồn và lựa chọn ban đầu. Business fingerprint/notes cũ không đổi; các job cũ không được viết lại hoặc replay.
4. Backend chỉ chấp nhận receipt mới từ integration chuyên dụng có tên trên, cùng công ty VPT. ID do authentication cung cấp được băm trong `crm_leads.website_intake`; UUID thật chỉ nằm trong bảng receipt service-only. SQL kiểm đúng một integration hoạt động, projection/time/consent/matching, rồi ghi **Lead + attribution 717 + receipt** trong cùng INSERT/transaction. Không backfill Lead lịch sử. Customer master của API hiện tại được tạo trước INSERT Lead bằng giao dịch khác; gói này **không** chứng minh toàn bộ Customer+Lead là một giao dịch.
5. Sau liên hệ thực tế, người có quyền ghi phiếu xác minh: liên hệ dùng được, nhu cầu phù hợp, địa bàn phù hợp, mã bằng chứng. Cột Cold/Warm/Hot/Deal không tự tạo phiếu. Xuất yêu cầu latest revision `QUALIFIED`, actor/evidence/ba bool đúng kiểu và context v2 khớp hồ sơ.
6. Kiểm khách mới theo toàn bộ Lead/Deal VPT và customer master dùng chung; khử trùng contact/customer/phone, giữ identity đầu tiên. Thiếu timestamp/lịch sử/proof hoặc hồ sơ thử giữ ngoài danh sách. Lịch sử chưa nhập ngoài CRM vẫn phải đối soát.
7. Google tiếp tục dùng GCLID và giờ xác minh với opaque Order ID. Meta website chỉ sẵn sàng khi nguồn Facebook/Instagram paid, ad/campaign đối soát catalog Marketing API của VPT 01, consent đúng, FBC/FBP nguyên bản hợp lệ và dữ liệu account/catalog còn mới. Nguồn Google/direct/organic có thể hiện trong CRM đã xác minh nhưng **không** trở thành bằng chứng Meta paid.
8. Payload Meta của tuyến này chỉ định **custom event `VPTCRMQualifiedLead`**, giờ phiếu xác minh, `action_source=system_generated`, FBC và FBP thật nếu có, external_id mờ đã băm. Không gửi phone/email/IP, Meta native Lead ID, tên, địa chỉ hoặc bằng chứng liên hệ. Không gửi thêm browser `Lead`, không dùng CF7/CRM UUID giả làm Meta Lead ID. Event name riêng tránh lẫn với form/call/Pixel cũ; sender đang tắt, chưa chứng minh event được chấp nhận hoặc dùng được cho tối ưu chiến dịch cho tới kiểm thực tế.

UTMs/fbclid và dữ liệu browser do khách cung cấp; receipt chứng minh backend lưu lời khai nguồn qua integration đã xác thực, **không** chứng minh Meta/Google đã ghi nhận một click quảng cáo. ACK `events_received=1` + trace chỉ chứng minh API tiếp nhận, không chứng minh attribution, khách mới ngoài CRM hoặc CPL.

## Tiến độ triển khai và các bước còn lại

Release và lưu credential website test-only đã được duyệt; không dùng quyền đó để tự bật gửi production hoặc xác minh khách:

1. **Đã hoàn tất:** PR #128/CI/backup và squash-merge tại SHA đã ghi. PR #127 không là dependency và chưa phát hành.
2. **Đã hoàn tất trên primary và sửa cột backup:** receipt/outbox trên primary; backup mirror column đã được duyệt/áp/hậu kiểm lúc12:45, không backfill. **Overall replication còn lỗi PGRST116 trên project_substage_status**, failed/backlog tăng và metadata TEST chưa tới backup; không coi HTTP200 hoặc applied tăng là toàn tuyến đã khôi phục. Backup chưa đủ qualified sender, không chạy lại migration primary hoặc tạo receipt từ bản sao.
3. **Đã hoàn tất:** backend/frontend Render và backend redeploy env cùng SHA. SQL đã có trước backend vì Google exporters đọc `website_intake`; worker giữ tắt.
4. **Đã hoàn tất phần cài/read-back:** plugin 0.4.0 + form11116 + purge cache, giữ key/fields/nghiệp vụ/CTA; cửa sổ TEST được duyệt kết thúc và LIVE đã khôi phục. Request thực tế được kiểm riêng ở bước 5.
5. **TEST form → CRM đạt:** own receipt confirmed + SQL proof đúng 1 Lead/receipt/attribution, is_testtrue, consentfalse, matching trống; qualification/outbox/attempts0. **CF7 mail_failed là lỗi gửi email riêng, chưa sửa/nghiệm thu email.** Không lấy queued hoặc email làm bằng chứng lưu CRM; không tự retry job uncertain/review, không qualification thật/click ID giả, TEST không tính CPL. LIVE đã khôi phục; nghiệm thu Ads/Lead thật còn chờ.
6. **Đã lưu cấu hình test, chưa nghiệm thu kết nối Meta:** dataset **1000623629782763**, VPT 01, Graphv26.0; token riêng backend, không token Page native/Dataset Quality API. Sender **tắt**; chưa kiểm token/provider ACK/Test Events. Không dùng test receipt thành accepted production và không tạo event giả để chứng minh kết nối.
7. **Chờ Lead thật:** có khách đã xác minh/đồng ý đo và đối soát nguồn thì kiểm Google CSV, hoàn tất Data Manager mapping/nguồn/lịch/lần nhập; Meta cần kiểm ACK/Test Events với nguồn được phép và quyền bật gửi riêng. Không đổi giờ để cứu sự kiện quá hạn 7 ngày, không tự nâng action/custom goal/chiến dịch sang tối ưu quality trước review đủ dữ liệu.

Các biến private backend dùng prefix `VPT_META_WEB_FEEDBACK_`: `ENABLED` (mặc định không phải `1`), `CONSENT` (cần `1` sau phê duyệt), `COMPANY_ID`, `AD_ACCOUNT_ID` (`act_…`), `DATASET_ID`, `GRAPH_VERSION` (`v26.0` đã kiểm ở guide Meta hiện tại), `TOKEN`, `MODE` (`test` hoặc `production`), `TEST_EVENT_CODE` chỉ ở mode test. `site_host` cố định `vanphuthanh.net`. Không commit token/test code; không đặt vào frontend/URL.

## Đối soát và xử lý lỗi

UI tại phần Chuyển đổi website đổi nhãn proxy cũ thành **Có mốc bán hàng**, không gọi là khách hợp lệ. Panel mới tách: đã xác minh+có receipt / sẵn sàng Meta / giữ lại / lịch sử gửi; nguồn lỗi hiển thị chưa xác nhận thay vì số 0 hay số cũ. Danh sách qualification xét 60 ngày theo **giờ xác minh**; counter ledger là toàn bộ lịch sử. Không có báo cáo qualified CPL mới trong gói này.

Outbox riêng `website_feedback_outbox`/`website_feedback_attempts`, RLS service-only, request/identity/event stable, test/production tách. RPC enqueue/claim/preflight/finish/reconcile giữ lease và serialize target. Trước HTTP kiểm lại hồ sơ, consent, scope, payload, tuổi sự kiện và DB primary. Chỉ positive ACK đúng mới accepted; explicit reject held; timeout/5xx/ACK mà finish DB không xác nhận → **UNKNOWN**, không retry mù. Unknown/lease quá hạn/accepted đổi proof giữ cả target chờ người đối soát. Full-history audit giữ accepted đã cũ qua cửa sổ gửi, không phát lại dưới identity khác.

Thu hồi/xác minh đổi sau khi gửi không tự xóa trên Google/Meta; cần xem provider history và adjustment phù hợp. Không reset/xóa ledger để gửi lại. Nếu chưa có khách thật đủ điều kiện, giữ cấu hình chờ; không tạo dòng giả chỉ để mở nút Data Manager.

## Kiểm thử và giới hạn

Các bộ source/parser, sender/outbox, service/router HTTP, Google qualified/legacy consent, WordPress JS và PHP→Node chạy bằng dữ liệu tổng hợp, không gọi khách hoặc provider. `backend/tests/website-feedback-sql.js` chạy hai migration thật và baseline 152/638/712/717 trên **PGlite 0.5.9 / PostgreSQL 18**, kiểm atomic rollback, ACL/RLS/immutability, proof/consent/chronology, duplicate/lease/ACK/unknown/reconciliation. Runtime ngoài repo, không dependency production. Một engine/connection; không chứng minh race đa phiên trên PG17 production. CI Node18/22 lặp lại các kiểm này; staging/full WordPress/end-to-end Ads còn chờ.

## Dừng và rollback

- Tắt `VPT_META_WEB_FEEDBACK_ENABLED`, restart backend; giữ ledger/receipt/phiếu xác minh, không delete/retry unknown. Dừng nguồn Google nếu có import sai, xử lý adjustment riêng.
- WordPress rollback riêng plugin+form từ backup đồng bộ và purge cache. Không đổi secret/mode hoặc job đang gửi; payload đã queue giữ nguyên. Backend cần giữ hỗ trợ receipt cho tới khi job mới được đối soát, nên không revert backend trước WordPress và hàng đợi.
- Giữ consent gate của **cả hai** Google exporters khi rollback phần còn lại: các Lead đã từ chối vẫn tồn tại sau khi hàng đợi trống. Nếu phải revert backend về trước gói này, ngắt mọi nguồn `google.csv`/`qualified-google.csv` trước và giữ ngắt tới khi gate được khôi phục, tránh legacy export lại khách đã từ chối. Dừng Meta không dừng Google.
- Frontend revert UI nếu cần. Không drop SQL/column/table và không sửa lịch sử để rollback; các migration additive không làm job cũ thành receipt mới.

Chưa có số khách mới đã nghiệm thu, đối soát chi đúng kỳ/thuế/phí, hoặc kết luận ≤250.000đ/khách. Phạm vi 130 triệu so với trần thử 100 triệu vẫn cần quyết định của chủ sở hữu.
