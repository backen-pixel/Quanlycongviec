# Marketing–CRM VPT — bằng chứng tích hợp và tách gói 05/10/2026

Trạng thái: **đang chuẩn bị; chưa phát hành gói tự động hóa**. Founder yêu cầu “em hoàn thành để đưa vào chạy thật nhé”. Mục tiêu ưu tiên vẫn là Facebook Lead Ads → CRM → Admin Vạn Phú Thành → chi phí/khách quảng cáo hợp lệ duy nhất, ngưỡng 250.000đ. Giữ ngân sách đã chốt. Kiến trúc, người nhận và nguồn lịch không đổi.

**Không merge nguyên khối PR22/25.** Hồ sơ Claude `work/claude-handoff-20261002/10_TRANG_THAI_VA_QUYET_DINH_20261005.md` mục “Quyết định về tách #22/#25” ghi Founder đã duyệt A tối thiểu và tách H; chưa mở B/C cho Page nào. [Đối chiếu quyết định và cổng H1](SPLIT_RELEASE_ALIGNMENT_20261005.md) là ranh giới cho phần chuẩn bị này. Retarget PR25 về main chỉ để thấy toàn bộ tác động; không biến bản tích hợp thành gói được phép merge. Bộ 50 SQL bên dưới chỉ là danh mục nguồn, không phải lệnh cài đặt. Migration mới phải dùng số từ 701 sau kiểm sổ hiện hành.

## Phiên bản và việc đã làm

- Render frontend/backend đều live main `1f879ea85dfff23629fef79c8d15f2eaf540328e` lúc 22:42 ngày05/10 giờ Việt Nam. Đây không phải ứng viên tự động hóa PR25.
- Ghép main này vào ứng viên `f138e2bd` ở nhánh riêng. Giữ toàn bộ thay đổi main; `policy.js` giữ hàm kiểm ngân sách/SLA của ứng viên vì bản core trên main là tập con. Giữ cả hai lịch sử tài liệu.
- A tối thiểu đã nằm trong main qua PR28 (`254d4bb2`, implementation `1fd9c16f`). Nó chỉ là thuật toán đo; chưa chứng minh báo cáo từ dữ liệu thật. Hàm ngân sách/SLA giữ trong nhánh tích hợp không thuộc phạm vi A tối thiểu đã duyệt.
- Tích hợp44 ca coverage đã hoàn thành:1628 PASS,0 FAIL,2 SKIP Windows,49/49 tệp đo được; dòng99,94%, nhánh92,14%, hàm97,41%.
- Bổ sung CI PostgreSQL17 với hai nền legacy/700. Nền700 dùng đúng SQL từ main trước migration Marketing; chỉ service_role có BYPASSRLS, vẫn NOLOGIN và không superuser. Restore kiểm cùng vai trò và thêm so sánh default ACL.
- Kiểm ACL intake trước fixture lịch sử cấp quyền rộng; cuối suite xác nhận fixture rộng vẫn được phát hiện. PASS suite không được diễn giải là ACL cuối đủ phát hành.
- [CI 37340712199](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37340712199): 11/11 job PASS. Intake PostgreSQL 17 legacy 507 PASS, nền 700 có 510 PASS; khôi phục logic 11 PASS cho mỗi nền. Frontend build và Node 18/22 đều đạt. Năm workflow liên quan cũng SUCCESS.
- Bản mã được kiểm: `43e502624b1454a112b0f2ee96bb0b91c5e9b1dc`. CI chạy merge `bdc259cd696bd58688ff36b84f50b502d251f795`; đã lấy commit về và xác nhận cùng tree `ba7c2778c83ee85ab7f3a436107a2d71e419f513`. Review độc lập: PASS tương thích cô lập; HOLD production. Đây là dữ liệu giả, không phải khôi phục bản sao DB thật.
- [Manifest hiện hành](LIVE_RELEASE_MANIFEST_20261005.json) ghim 50 SQL thêm so với main bằng tên đầy đủ, Git blob và SHA256. Đây là kiểm kê và dependency đã biết, chưa là thứ tự cài đặt được chứng nhận trên bản sao production. [Truy vấn kiểm trước phát hành](LIVE_PREFLIGHT_READONLY.sql) chỉ đọc catalog; đã chạy trên Primary lúc 23:39 và xác nhận sáu bảng vẫn thiếu, không biến quyền NULL do thiếu bảng thành PASS.

## Quan sát hệ thống thật, chỉ đọc

Lúc23:10–23:20 ngày05/10, cả Primary `kdxypztstbeovyedmvem` và Backup `atcfpgxkgbszglrelfgr`:
- Không có bảng/view public trong tập relkind r/p/v/m/f có quyền SELECT/INSERT/UPDATE/DELETE cho anon hoặc authenticated.
- Không còn bảng public r/p tắt RLS; không còn policy PUBLIC ALL với qual/with_check=true.
- Có snapshot bảo mật, cột facebook_contact_id và RPC create_facebook_contact_lead_once ở cả hai DB. Không sửa lại phần thu quyền của Claude.
- Đây là bằng chứng catalog tại thời điểm đọc, không chứng nhận mọi quyền column/sequence/RPC/Storage hoặc khả năng khôi phục.

Primary kiểm thêm23:20: không còn hàm public do postgres sở hữu cho anon EXECUTE. Cả sáu bảng kiểm `marketing_fb_lead_bindings`, `marketing_fb_lead_receipts`, `crm_lead_source_evidence`, `crm_lead_quality_events`, `crm_lead_identity_events`, `marketing_spend_sync_runs` chưa tồn tại.

Page409741855550833 active, auto-create bật và đầu mối hiện là Admin VPT. Pipeline mặc định ở Page rỗng; stage đã chọn thuộc pipeline78e6251c-aea1-46bc-a19f-a401f1de7f34. Phải kiểm quyền/active của pipeline khi cấu hình, không suy Page rỗng là không có pipeline hợp lệ.

Không có account `835757498658305` hoặc `act_835757498658305` trong `fb_ad_accounts`. Không có dòng `facebook_lead_ads` của Page từ 01/10 theo created_at (mốc 00:00 VN). Không suy ra không có khách ở các bảng/luồng khác.

Lúc khoảng 23:35–23:43, giao diện Meta xác nhận form `1438656288329447`, tên **VPT — Tư vấn tủ bếp HCM — 01.10.2026**, active và có 8 lượt gửi. Trung tâm khách hàng tiềm năng lọc đúng form hiển thị đủ 8 hồ sơ ở Tiếp nhận. Mẫu hỏi thời điểm làm bếp, họ tên, điện thoại; chưa hỏi địa điểm công trình. UI không chứng minh field key kỹ thuật hoặc quyền App nhận webhook.

Đối soát bổ sung chỉ đọc bằng 9 chữ số cuối điện thoại của đủ8 form, kiểm cả Lead.phone và quan hệ Customer→Lead: 1/8 có Lead VPT, nhưng Lead tạo30/09 trước chiến dịch; 2 hồ sơ khác có Lead ở công ty khác. Trong3 ứng viên đã kiểm, tên cũng khớp; Customer của2 hồ sơ chưa gắn company. 5 hồ sơ còn lại không khớp Customer/Lead trong phép kiểm. Cả8 chưa khớp Contact của Page VPT hoặc Lead Ads của đúng form. Kết quả không tự chứng minh “8 khách mới”, sự cố mất8khách, hoặc quyền chuyển công ty/tạo lại khách. Chưa tạo Lead, gắn nguồn, phân loại hợp lệ hay gửi liên hệ. Dữ liệu liên hệ không đưa vào Git; bản đối soát đã bỏ tên/số điện thoại lưu trong evidence ở workspace.

Không nhầm các kỳ thống kê: Ads Manager ở mặc định 05/09–04/10 hiển thị 8 form, chi 1.882.774đ, 235.347đ/form. Snapshot cũ đến 05/10 có chi 2.229.209đ. Hai kỳ khác nhau; cả hai đều không chứng minh chi phí/khách hợp lệ đạt 250.000đ.

Log backend lúc22:42:14VN vẫn ghi failover=on,auto=off. Trạng thái này không khớp Primary-only của ứng viên. Ledger migrations không ghi700; không dùng thiếu ledger để kết luận chưa sửa quyền vì catalog đã đổi và có thể được áp thủ công.

## Cổng thực thi còn phải khép

| Công việc | Trạng thái, điều kiện | Người thực hiện |
|---|---|---|
| Bản ghép và CI | PASS đúng tree trong phạm vi cô lập; review độc lập PASS cùng phạm vi | Codex/reviewer |
| Tách gói | Không merge cả PR22/25; kiểm từng phạm vi nhỏ theo quyết định đã có | Codex; Claude tách H theo hồ sơ riêng |
| H1 trước C | Chưa có inbox cho mọi sự kiện Page trước ACK; chưa có cờ VPT_FB_LEGACY_SCOPE_GUARD; lỗi RPC/failover sau ACK có thể mất cơ hội retry | Chưa có bằng chứng triển khai; Codex ghi nhận điều kiện chặn |
| H2 trước C | Kiểm truy vấn giới hạn theo scope, index/tải/timeout trên staging; một writer và rollback trigger/hàm | Gói C riêng |
| Bộ cập nhật DB | Chưa có schema Marketing; cần manifest toàn tên/blob, prerequisite và thử trên bản sao phù hợp | Codex chuẩn bị; người vận hành DB áp trong phạm vi phát hành |
| Bảo mật đã sửa | Catalog ghi nhận tiến triển;700 phải trước Marketing, không chạy lại700 sau gói vì mở service_role rộng | Claude/DB operator; Codex kiểm tương thích |
| Backup/khôi phục | RPC mới không đi qua REST replication; cần bằng chứng backup/restore bao phủ private schema, dữ liệu và Storage liên quan | Người vận hành DB |
| Primary duy nhất | Chưa đổi; tắt failover theo phương án đã kiểm, xác nhận mọi writer và hàng chờ | Gói cấu hình Render |
| Nguồn Meta | Form/Page và 8 hồ sơ đã xác minh qua UI; còn đăng ký account CRM, field key, quyền App/token và đối soát từng hồ sơ/đủ nguồn chi | Chủ tài khoản + Codex qua công cụ hỗ trợ |
| Nhận khách | Binding có phiên bản → drain legacy → nhận receipt khi worker paused → mở worker → đối soát Lead/Admin | Codex/Admin VPT |
| Đo250k | Xác minh khách duy nhất/hợp lệ và nguồn chi đầy đủ; lỗi/thiếu nguồn giữ UNKNOWN | Admin VPT + hệ thống |

Không thể chỉ áp SQL652–653 rồi deploy binary hiện tại: các đường legacy bắt buộc gọi682/680/671 và683/684/686; SQL687 còn ảnh hưởng18 bảng gốc và phụ thuộc FK toànCRM. Kiểm kê50 SQL trong ứng viên không tự tạo ra thứ tự áp an toàn. Khả năng restore dữ liệu giả không thay restore bản sao thật.

## Phương án chuyển luồng, chưa phải lệnh thực thi

Các bước dưới chỉ là phương án để hoàn thiện cho PR nhỏ sau khi tách. Chưa có quyền mở B/C cho Page nào trong hồ sơ quyết định hiện có; PASS CI/staging không tự mở quyền đó. Cần khép H1/H2 và gói phiên bản/cấu hình/nghiệm thu cụ thể trước chuyển luồng. Chỉ xét cờ intake/quality/identity/measurement của gói đã duyệt; giữ cờ AI gửi, inference, care, survey và quảng cáo tự điều chỉnh tắt.

1. Chuẩn bị account, Page, form, field map, vùng, owner, pipeline/stage/source/type đúng công ty bằng Application Service.
2. Kiểm schema/ACL/backup; xác nhận Primary-only, chữ ký App chung endpoint và không còn writer legacy đang chạy.
3. Bật Page409741855550833 cùng `VPT_FB_LEAD_INTAKE_WORKER_PAUSED=1`; kiểm signed receipt và loại trừ legacy. Không gửi khách hoặc tạo booking từ bước này.
4. Chỉ mở worker sau kiểm nhận và binding; nghiệm thu một Lead có nhãn thử qua receipt→CRM→Admin→báo cáo; loại thử khỏi KPI.
5. Dừng sự cố bằng PAUSED=1, giữ Page/enrollment/receipt/evidence. Không xóa Page flag, không mở grant rộng, không clone/drop hoặc xóa giao dịch.

## Áp dụng autonomous-agent-harness

Dùng hồ sơ trong repo và hàng việc [RELEASE_QUEUE.json](RELEASE_QUEUE.json) để tiếp tục có nguồn và điều kiện rõ. Claude/Codex vẫn thuộc Software Factory, không trở thành Business Runtime Agent. Không cài scheduler/Memory MCP hoặc cấp quyền rộng từ skill. Hàng việc chưa được scheduler tự chạy; mỗi bước đọc lại trạng thái và kiểm đúng phiên bản trước tác động.

Reviewer độc lập đã chỉ rõ dependency SQL, thứ tự 700, giới hạn replication RPC và phạm vi 687. Review bổ sung đã khép tại source/tree nêu trên: không có lỗi mới chặn delta kiểm thử. Review đối chiếu quyết định bổ sung yêu cầu giữ PR25 là bằng chứng tích hợp, đưa H1/H2 và tách gói trước mọi chuyển luồng. Vận hành vẫn HOLD; không dùng PASS kiểm thử để che các lỗi runtime đã biết hoặc dùng HOLD cũ về quyền bảng để che mất tiến triển đã xác minh.

Các tài liệu cũ giữ lịch sử theo thời điểm. Hoàn tác delta tích hợp bằng revert trên nhánh chuẩn bị, giữ lịch sử/bảo mật. Chưa có thay đổi production của phiên này để hoàn tác.
