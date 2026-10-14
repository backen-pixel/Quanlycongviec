# VPT: khách quảng cáo → website → CRM → xác minh

Gói website ngày 14/10/2026 được chuẩn bị trên nhánh `codex/vpt-website-qualified-leads-20261014`, từ main `3c6761731b0e4a6e248a81e1484d101c3b82e049`. **Chưa áp SQL, cập nhật WordPress, merge/deploy hoặc bật gửi Meta.** Đây là tuyến website riêng; không chứa hoặc kích hoạt tuyến Facebook native Form của [PR #127](https://github.com/backen-pixel/Quanlycongviec/pull/127).

## Những gì đã kiểm trên hệ thống thật

- CRM primary `qlycv`: lúc 08:21 ngày 14/10 có **2** Lead/Deal thật mang nguồn website bất biến, **0** phiếu xác minh VPT; chưa có bảng receipt/outbox mới. Đọc lại nguồn ngày 14/10 xác nhận cả hai mang nhãn `google / organic`, không GCLID/FBCLID/ad ID. Không lấy số này làm số khách hợp lệ hoặc ghi nhận quảng cáo.
- Form CF7 `11116` trên `vanphuthanh.net` có thông tin liên hệ, đồng ý liên hệ, UTMs và click IDs. Chưa có lựa chọn đồng ý đo quảng cáo riêng hoặc FBC/FBP trong form hiện tại.
- Sau tương tác trên trang để tải mã trì hoãn, DOM có Google `AW-460207797`, `GTM-5HS4MSR` và hai Meta Pixel `1000623629782763`, `1129111234253260`. Chưa chứng minh chúng cùng đo đúng một lần gửi form.
- Events Manager xác nhận `Pixel tổng remarketing facebook` **1000623629782763** thuộc Công ty TNHH Bếp Vạn Phú Thành **815284983995477**, chia sẻ với VPT 01 **835757498658305** và các tài khoản VPT khác, có CAPI đang hoạt động. Đây là **đích website đề xuất**, chưa tạo token/bật sender mới. Pixel `1129111234253260` không xuất hiện trong danh sách nguồn hiện tại của business này; chưa xác định chủ/quyền hoặc gỡ mã đó.
- API logs gần nhất xác nhận bridge dùng integration tên `VPT_V1_CF7_CRM_Admin_HCM`, đang hoạt động; không đọc giá trị secret. UUID của integration cũng được auth legacy chấp nhận làm credential, vì vậy không hardcode/lưu UUID thật trong source, docs, preview hoặc JSON Lead.
- Người dùng đã đăng nhập WordPress admin trong phiên. Đã đọc/sao lưu ba file plugin và template CF7 11116 vào thư mục riêng ngoài repo `vpt-wordpress-backup-20261014`. Plugin **0.3.3**, mode **live**, secret đã cấu hình và không hiển thị. Ba file trùng Git HEAD sau chuẩn hóa CRLF/dòng trắng cuối; bản 0.4.0 giữ các CTA/category/product hooks đang chạy. Không click xử lý hàng chờ hoặc thay mode/secret. WPVibe vẫn hết quota; đọc qua editor WordPress được phép. Chưa lưu bất kỳ cập nhật plugin/form nào.

Google đã triển khai [PR #124](https://github.com/backen-pixel/Quanlycongviec/pull/124) ngày 13/10; Render backend/frontend live tại main trên. Google Ads VPT **975-957-2942** đã lưu action `VPT CRM - Lead hop le da xac minh`, ID **7842337600**, Qualified lead / One / Secondary / không giá trị / cửa sổ nhấp 90 ngày. HTTPS `qualified-google.csv` xác thực thành công nhưng CSV chưa có khách thật đủ điều kiện; **Data Manager chưa hoàn tất nguồn, lịch hoặc lần nhập**. Không đổi mục tiêu đấu giá của action này.

## Luồng mới và ranh giới bằng chứng

1. Khách vào website: giữ UTMs, click ID, trang đầu; timestamp FBC là thời điểm thật quan sát mã nhấp, không tạo lại ở thời điểm xác minh. Cookie FBC chỉ dùng nếu khớp chính xác fbclid; FBP tùy chọn, không tự tạo.
2. Khách gửi form: đồng ý liên hệ vẫn bắt buộc; **đo quảng cáo là lựa chọn riêng, không tích sẵn**, phiên bản `VPT_ADS_V1`. Từ chối vẫn lưu yêu cầu tư vấn nhưng không thu FBC/FBP hoặc phát chuyển đổi form mới của bridge.
3. PHP bridge tạo request UUID phía máy chủ và đóng băng payload trong job. `submitted_at` giữ mili giây; retry giữ request, giờ, nguồn và lựa chọn ban đầu. Business fingerprint/notes cũ không đổi; các job cũ không được viết lại hoặc replay.
4. Backend chỉ chấp nhận receipt mới từ integration chuyên dụng có tên trên, cùng công ty VPT. ID do authentication cung cấp được băm trong `crm_leads.website_intake`; UUID thật chỉ nằm trong bảng receipt service-only. SQL kiểm đúng một integration hoạt động, projection/time/consent/matching, rồi ghi **Lead + attribution 717 + receipt** trong cùng INSERT/transaction. Không backfill Lead lịch sử. Customer master của API hiện tại được tạo trước INSERT Lead bằng giao dịch khác; gói này **không** chứng minh toàn bộ Customer+Lead là một giao dịch.
5. Sau liên hệ thực tế, người có quyền ghi phiếu xác minh: liên hệ dùng được, nhu cầu phù hợp, địa bàn phù hợp, mã bằng chứng. Cột Cold/Warm/Hot/Deal không tự tạo phiếu. Xuất yêu cầu latest revision `QUALIFIED`, actor/evidence/ba bool đúng kiểu và context v2 khớp hồ sơ.
6. Kiểm khách mới theo toàn bộ Lead/Deal VPT và customer master dùng chung; khử trùng contact/customer/phone, giữ identity đầu tiên. Thiếu timestamp/lịch sử/proof hoặc hồ sơ thử giữ ngoài danh sách. Lịch sử chưa nhập ngoài CRM vẫn phải đối soát.
7. Google tiếp tục dùng GCLID và giờ xác minh với opaque Order ID. Meta website chỉ sẵn sàng khi nguồn Facebook/Instagram paid, ad/campaign đối soát catalog Marketing API của VPT 01, consent đúng, FBC/FBP nguyên bản hợp lệ và dữ liệu account/catalog còn mới. Nguồn Google/direct/organic có thể hiện trong CRM đã xác minh nhưng **không** trở thành bằng chứng Meta paid.
8. Meta nhận **custom event `VPTCRMQualifiedLead`**, giờ phiếu xác minh, `action_source=system_generated`, FBC và FBP thật nếu có, external_id mờ đã băm. Không gửi phone/email/IP, Meta native Lead ID, tên, địa chỉ hoặc bằng chứng liên hệ. Không gửi thêm browser `Lead`, không dùng CF7/CRM UUID giả làm Meta Lead ID. Event name riêng tránh lẫn với form/call/Pixel cũ; chưa chứng minh event được chấp nhận hoặc dùng được cho tối ưu chiến dịch cho tới kiểm thực tế.

UTMs/fbclid và dữ liệu browser do khách cung cấp; receipt chứng minh backend lưu lời khai nguồn qua integration đã xác thực, **không** chứng minh Meta/Google đã ghi nhận một click quảng cáo. ACK `events_received=1` + trace chỉ chứng minh API tiếp nhận, không chứng minh attribution, khách mới ngoài CRM hoặc CPL.

## Triển khai theo thứ tự

Chỉ thực hiện sau phê duyệt phát hành và quyền lưu credential/chia sẻ dữ liệu cụ thể:

1. Kiểm PR ở SHA cuối, CI đạt và backup/rollback sẵn sàng. Không merge cả PR #127 như dependency của gói website; nếu phát hành native thì làm theo hồ sơ của PR đó.
2. Áp migration mới **`20261014005710_website_intake_receipts.sql` rồi `20261014005713_website_feedback_outbox.sql`** lên primary. Chạy kiểm ACL/RLS/triggers/RPC, schema cache và integration chuyên dụng. Không seed receipt/qualification giả. Nguồn 712/717 phải sẵn.
3. Merge/deploy backend + frontend Render My Workspace. Google exporters nay select `website_intake`, nên **SQL phải có trước backend**. Worker mặc định tắt; WordPress cũ/metadata NULL vẫn tương thích.
4. Trước lúc lưu WordPress: đọc lại ba file plugin `core.php`, entrypoint, `attribution.js` cùng CF7 11116 so với backup để phát hiện sửa đồng thời. Cập nhật plugin **0.4.0** và form theo [`form-11116-0.4.0.txt`](../../integrations/wordpress/vpt-v1-crm-bridge/form-11116-0.4.0.txt), chỉ thêm checkbox/ba hidden field từ `form-hidden-fields.txt`, giữ bố cục/fields/consent liên hệ. Template candidate chuẩn bị từ form thật đã sao lưu, chưa lưu lên website. Purge cache cần thiết để JS/PHP/form cùng phiên bản; không thay API key, source nghiệp vụ hoặc mode LIVE hiện tại. Verify read-back và request payload mới.
5. Kiểm form → confirmed CRM: request UUID, Lead, projection và receipt trùng, source/click/timestamps đúng, từ chối đo vẫn tạo contact lead nhưng không gửi conversion, job uncertain/review không convert hoặc tự POST lại. Hồ sơ thử chỉ dùng chế độ TEST admin của bridge trong môi trường/quãng kiểm đã chốt; không làm giả khách thật đã xác minh. Test không dùng vào CPL.
6. Sau phê duyệt specific Meta website: dùng đúng dataset **1000623629782763**, VPT 01 và Graph version đã kiểm; tạo/store token riêng phía Render backend, không dùng token Page native, không bật Dataset Quality API để cấp thêm quyền. Lưu cấu hình sender **tắt**, mode `test`; xác nhận Test Events và chất lượng payload với nguồn được phép. Không dùng test receipt thành accepted production.
7. Có khách thật đã xác minh/đồng ý đo và đối soát nguồn thì kiểm Google CSV và hoàn tất Data Manager mapping, lịch/lần nhập; kiểm Meta Test Events/ACK rồi mode production theo quyền đã chốt. Không đổi giờ để cứu sự kiện quá hạn 7 ngày. Không tự nâng action/custom goal/chiến dịch sang tối ưu quality trước review đủ dữ liệu.

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
