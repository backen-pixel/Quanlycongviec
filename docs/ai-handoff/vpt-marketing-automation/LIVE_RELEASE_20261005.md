# Mở tuyến Marketing–CRM VPT — gói kiểm chứng 05/10/2026

Trạng thái: **đang chuẩn bị; chưa phát hành gói tự động hóa**. Founder yêu cầu “em hoàn thành để đưa vào chạy thật nhé”. Mục tiêu ưu tiên vẫn là Facebook Lead Ads → CRM → Admin Vạn Phú Thành → chi phí/khách quảng cáo hợp lệ duy nhất, ngưỡng 250.000đ. Giữ ngân sách đã chốt. Kiến trúc, người nhận và nguồn lịch không đổi.

## Phiên bản và việc đã làm

- Render frontend/backend đều live main `1f879ea85dfff23629fef79c8d15f2eaf540328e` lúc 22:42 ngày05/10 giờ Việt Nam. Đây không phải ứng viên tự động hóa PR25.
- Ghép main này vào ứng viên `f138e2bd` ở nhánh riêng. Giữ toàn bộ thay đổi main; `policy.js` giữ hàm kiểm ngân sách/SLA của ứng viên vì bản core trên main là tập con. Giữ cả hai lịch sử tài liệu.
- Tích hợp44 ca coverage đã hoàn thành:1628 PASS,0 FAIL,2 SKIP Windows,49/49 tệp đo được; dòng99,94%, nhánh92,14%, hàm97,41%.
- Bổ sung CI PostgreSQL17 với hai nền legacy/700. Nền700 dùng đúng SQL từ main trước migration Marketing; chỉ service_role có BYPASSRLS, vẫn NOLOGIN và không superuser. Restore kiểm cùng vai trò và thêm so sánh default ACL.
- Kiểm ACL intake trước fixture lịch sử cấp quyền rộng; cuối suite xác nhận fixture rộng vẫn được phát hiện. PASS suite không được diễn giải là ACL cuối đủ phát hành.
- CI của bản ghép/mode700: chờ kết quả tại lúc viết mục này. Test này là dữ liệu giả, không phải bản sao DB thật.

## Quan sát hệ thống thật, chỉ đọc

Lúc23:10–23:20 ngày05/10, cả Primary `kdxypztstbeovyedmvem` và Backup `atcfpgxkgbszglrelfgr`:
- Không có bảng/view public trong tập relkind r/p/v/m/f có quyền SELECT/INSERT/UPDATE/DELETE cho anon hoặc authenticated.
- Không còn bảng public r/p tắt RLS; không còn policy PUBLIC ALL với qual/with_check=true.
- Có snapshot bảo mật, cột facebook_contact_id và RPC create_facebook_contact_lead_once ở cả hai DB. Không sửa lại phần thu quyền của Claude.
- Đây là bằng chứng catalog tại thời điểm đọc, không chứng nhận mọi quyền column/sequence/RPC/Storage hoặc khả năng khôi phục.

Primary kiểm thêm23:20: không còn hàm public do postgres sở hữu cho anon EXECUTE. Cả sáu bảng kiểm `marketing_fb_lead_bindings`, `marketing_fb_lead_receipts`, `crm_lead_source_evidence`, `crm_lead_quality_events`, `crm_lead_identity_events`, `marketing_spend_sync_runs` chưa tồn tại.

Page409741855550833 active, auto-create bật và đầu mối hiện là Admin VPT. Pipeline mặc định ở Page rỗng; stage đã chọn thuộc pipeline78e6251c-aea1-46bc-a19f-a401f1de7f34. Phải kiểm quyền/active của pipeline khi cấu hình, không suy Page rỗng là không có pipeline hợp lệ.

Không có account835757498658305 hoặc act_835757498658305 trong fb_ad_accounts. Không có dòng facebook_lead_ads của Page từ01/10 theo created_at (mốc00:00VN). Không suy ra không có khách ở các bảng/luồng khác.8 form Meta quan sát trước đó chưa được đối soát từng hồ sơ.

Log backend lúc22:42:14VN vẫn ghi failover=on,auto=off. Trạng thái này không khớp Primary-only của ứng viên. Ledger migrations không ghi700; không dùng thiếu ledger để kết luận chưa sửa quyền vì catalog đã đổi và có thể được áp thủ công.

## Cổng thực thi còn phải khép

| Công việc | Trạng thái, điều kiện | Người thực hiện |
|---|---|---|
| Bản ghép và CI | Unit PASS; CI mới và review đúng phiên bản đang khép | Codex/reviewer |
| Bộ cập nhật DB | Chưa có schema Marketing; cần manifest toàn tên/blob, prerequisite và thử trên bản sao phù hợp | Codex chuẩn bị; người vận hành DB áp trong phạm vi phát hành |
| Bảo mật đã sửa | Catalog ghi nhận tiến triển;700 phải trước Marketing, không chạy lại700 sau gói vì mở service_role rộng | Claude/DB operator; Codex kiểm tương thích |
| Backup/khôi phục | RPC mới không đi qua REST replication; cần bằng chứng backup/restore bao phủ private schema, dữ liệu và Storage liên quan | Người vận hành DB |
| Primary duy nhất | Chưa đổi; tắt failover theo phương án đã kiểm, xác nhận mọi writer và hàng chờ | Gói cấu hình Render |
| Nguồn Meta | Đăng ký đúng account trong CRM bằng giao diện/dịch vụ; kiểm quyền Page/form/App, field map, token và đủ nguồn chi | Chủ tài khoản + Codex qua công cụ hỗ trợ |
| Nhận khách | Binding có phiên bản → drain legacy → nhận receipt khi worker paused → mở worker → đối soát Lead/Admin | Codex/Admin VPT |
| Đo250k | Xác minh khách duy nhất/hợp lệ và nguồn chi đầy đủ; lỗi/thiếu nguồn giữ UNKNOWN | Admin VPT + hệ thống |

Không thể chỉ áp SQL652–653 rồi deploy binary hiện tại: các đường legacy bắt buộc gọi682/680/671 và683/684/686; SQL687 còn ảnh hưởng18 bảng gốc và phụ thuộc FK toànCRM. Kiểm kê50 SQL trong ứng viên không tự tạo ra thứ tự áp an toàn. Khả năng restore dữ liệu giả không thay restore bản sao thật.

## Cấu hình mở và dừng

Chỉ mở các cờ intake/quality/identity/measurement cần cho gói Lead sau kiểm đầy đủ. Giữ cờ AI gửi, inference, care, survey và quảng cáo tự điều chỉnh tắt.

1. Chuẩn bị account, Page, form, field map, vùng, owner, pipeline/stage/source/type đúng công ty bằng Application Service.
2. Kiểm schema/ACL/backup; xác nhận Primary-only, chữ ký App chung endpoint và không còn writer legacy đang chạy.
3. Bật Page409741855550833 cùng `VPT_FB_LEAD_INTAKE_WORKER_PAUSED=1`; kiểm signed receipt và loại trừ legacy. Không gửi khách hoặc tạo booking từ bước này.
4. Chỉ mở worker sau kiểm nhận và binding; nghiệm thu một Lead có nhãn thử qua receipt→CRM→Admin→báo cáo; loại thử khỏi KPI.
5. Dừng sự cố bằng PAUSED=1, giữ Page/enrollment/receipt/evidence. Không xóa Page flag, không mở grant rộng, không clone/drop hoặc xóa giao dịch.

## Áp dụng autonomous-agent-harness

Dùng hồ sơ trong repo và hàng việc [RELEASE_QUEUE.json](RELEASE_QUEUE.json) để tiếp tục có nguồn và điều kiện rõ. Claude/Codex vẫn thuộc Software Factory, không trở thành Business Runtime Agent. Không cài scheduler/Memory MCP hoặc cấp quyền rộng từ skill. Hàng việc chưa được scheduler tự chạy; mỗi bước đọc lại trạng thái và kiểm đúng phiên bản trước tác động.

Reviewer độc lập đã chỉ rõ dependency SQL, thứ tự700, giới hạn replication RPC và phạm vi687. Review vận hành hiện HOLD; review bổ sung sau CI cần ghim source/tree. Không dùng HOLD cũ về quyền bảng để che mất tiến triển đã xác minh.

Các tài liệu cũ giữ lịch sử theo thời điểm. Hoàn tác delta tích hợp bằng revert trên nhánh chuẩn bị, giữ lịch sử/bảo mật. Chưa có thay đổi production của phiên này để hoàn tác.

