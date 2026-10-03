# CRM merge — quyền hiện hành và bảo toàn lịch sử

Ngày 04/10/2026. Baseline `7cc7cb2342a42bf5bec8366c5dd8eaa5dc87d971`, PR #22 nháp. Đây là checkpoint đang triển khai; **CRM merge/cutover chưa READY**, full goal ACTIVE. Không thay mục tiêu nhận khách, chăm sóc, khảo sát, dashboard hoặc gate phát hành.

## Delta hiện tại

- `crmLegacyMergeAccess.js` đọc actor, công ty, tenant và quyền khu vực từ DB hiện hành. Token chỉ cung cấp ID đã xác thực, không cung cấp quyền rộng. Toàn bộ Lead giữ/xóa phải cùng công ty, cùng loại và đủ quyền trước khi giao sang thân hàm ghi cũ. View/member/task grant không tự cấp quyền xóa một Lead.
- Nhân viên phải phụ trách/sở hữu từng Lead; xóa nguồn cần pipeline hiện hữu và cờ cho phép tương ứng Lead/Deal. Pipeline/cờ thiếu dừng thao tác. Region admin cần membership cùng khu vực hiện hành, đúng công ty và hoạt động. Admin công ty không vượt sang công ty khác cùng tenant. HST admin cần tenant hiện hành; admin thiếu tenant không thành global admin.
- Hai route merge truyền chính request từ server, không nhận actor/request giả trong body. Danh sách 2–500 ID được kiểm và chuẩn hóa trước đọc/ghi. Lỗi đọc không được coi là không có dữ liệu, không lộ thông báo DB riêng tư.
- Gộp các **Customer khác nhau** trả `CRM_CUSTOMER_MERGE_REVIEW_REQUIRED` trước mutation cho mọi role. Helper Customer cũ có thể thay đổi dữ liệu ngoài các Lead được chọn; chưa có command xác minh và bảo toàn toàn bộ phạm vi. Đây là giữ thao tác chưa đủ điều kiện, không phải hoàn tất chức năng gộp Customer.
- Cleanup chỉ đọc một công ty đã xác minh, tối đa 500 hồ sơ; vượt ngưỡng dừng, không xử lý một phần do cắt dữ liệu. Lead và Deal được phân nhóm riêng. **Chung Customer không chứng minh trùng**: có nhóm ứng viên thì trả `CRM_DUPLICATES_REQUIRE_REVIEW`, `deleted=0`; không chuyển hoặc xóa dữ liệu. Không có nhóm thì trả thành công với 0 thay đổi. HST/platform phải xác định công ty, không quét tất cả.

Checkpoint dùng các HTTP read riêng, **không giữ khóa quyền suốt giao dịch merge**. Việc thu hồi được thấy khi đọc lại không chứng minh chống thay đổi đồng thời sau checkpoint. Thân `executeLeadMerge` và `mergeCustomerIntoTarget` còn vấn đề dưới đây; không phát hành chúng dựa trên green check của quyền.

## Review và kiểm thử

Reviewer riêng đã audit baseline và chạy bộ quyền đầu tiên. Bốn repro được sửa trong delta: Customer nguồn tác động Lead ngoài công ty; khu vực bị tắt/chuyển công ty; role NULL/rỗng; pipeline NULL bỏ qua cờ xóa. Reviewer độc lập đã chạy lại50/50 và PASS phạm vi bốn bản sửa quyền LOCAL; PostgreSQL đã PASS đúng runtime bên dưới. Không phải PASS merge vận hành.

Local: **50 ca mới PASS**, cộng 67 regression phone/preflight/webhook = **117 PASS, 0 FAIL, 0 SKIP**. Có test gọi route/hàm thật, ID sai, actor/tenant/company/owner/region thu hồi, read lỗi, pipeline cấm xóa, batch có nguồn không hợp lệ, request giả và cleanup không xóa cơ hội hợp lệ. Cú pháp/diff check PASS. Không có UI/model/provider call.

Thêm **7 ca PostgreSQL** tại `crmLegacyMergeAccess.cases.js`, cuối bộ intake cô lập: current ownership, khác công ty cùng tenant, actor/cờ xóa bị thu hồi, Customer sai công ty, membership bị gỡ, quyền SELECT bị thu hồi và cleanup company scope. Đã xác minh CI bên dưới: cả 7 ca PASS. Bộ này kiểm helper đọc quyền bằng PostgreSQL thật, **không kiểm merge nguyên tử hoặc bảo toàn lịch sử**.

## Findings bảo toàn dữ liệu còn phải khép

Audit mã/migration hiện có, chưa xác minh schema hệ thống đang chạy:

1. `crm_tasks` có task `sx_*` và `stage_slug NULL` bị bỏ qua; `crm_task_attachments.lead_id` còn trỏ nguồn dù task đã chuyển. DELETE Lead có thể cascade task/tệp (`28`, `29`).
2. Full merge chủ động xóa `lead_members` và `lead_messages`, kéo theo reactions. Không được tự union quyền: membership có `history_cutoff_at` (`22`, `465`).
3. Payments/payment stages (`423`), stage history (`145`), KPI ledger (`154`), nhiều Project (`502`), attribution/quality (`638`) chưa được bảo toàn. Các phép UPDATE hiện có thành công vẫn có thể mất bằng chứng khi xóa nguồn.
4. Customer helper chuyển mọi Lead/báo giá/đơn/hóa đơn/dự án/contact của nguồn; còn hoạt động CRM, sự kiện, cuộc gọi, ghi âm, Zalo, Lead Ads và liên kết ngoài selected Leads. Các lỗi `{error}` có thể bị bỏ qua và thao tác trước lỗi đã ghi.
5. Source evidence (`652`), identity (`651/654`) và booking/proposal (`665`) còn quan hệ không chỉ nằm trong FK thông thường. Không dùng kiểm FK thuần túy làm bằng chứng đủ phạm vi.

## Công việc triển khai kế tiếp

Hoàn thiện command gộp có giao dịch, receipt chống lặp và bằng chứng phạm vi trước/sau. Kiểm actor hiện hành và revision sau khi chờ khóa; tất cả bản ghi của nhóm được xử lý cùng commit. Registry quan hệ dùng để phát hiện phần chưa hỗ trợ và từ chối, không tự UPDATE mọi FK. Handler chuyên biệt phải giữ ID/tác giả/thời gian/tệp/liên kết con; xung đột unique không được bỏ qua để mất bằng chứng. Các hồ sơ có quan hệ SX/tài chính/quyền khác nhau phải đối soát, không tự gộp theo chung Customer.

Giữ ID nguồn bằng alias/archive là một phương án cần kiểm readers/quyền/báo cáo đầy đủ trước lựa chọn; checkpoint này chưa tự áp dụng hoặc chốt thay Founder. Luồng identity LINK không xóa đã có không mặc nhiên thay semantics gộp Deal/đơn. Cần thử task+tệp, SX/NULL stage, chat/cutoff, tiền/attribution, Customer ngoài nhóm, lỗi giữa chừng, dependency được ghi đồng thời và retry mất phản hồi.

Sau đó còn creator Lead/Customer đúng công ty, dừng/chờ toàn bộ writer cũ, đối soát/khôi phục; AI/lịch/người nhận/phạm vi đo; nghiệm thu toàn tuyến và Founder duyệt phát hành. Chưa DB thật, ngân sách mới, deployment hoặc CPQL 250.000đ thực tế.

## Hoàn tác

Giữ nhánh/PR nháp và không kích hoạt tuyến mới. Không rollback bằng cách mở lại cleanup tự xóa hoặc bỏ kiểm quyền. Nếu bản này lỗi sau phát hành được duyệt, dừng thao tác merge, giữ nguồn/bằng chứng và đối soát; không xóa giao dịch hoặc mở lại quyền rộng. Không migration production trong checkpoint này.


## Bằng chứng CI tại runtime 2cac0949

Commit `2cac0949aa78bb5d281f580c55c9dfe1171e6101`, tree `cdc80123047fe7e31799dda43740303466e31c28`.

- [Automation 37141807677](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37141807677): **10/10 job SUCCESS**. [Intake PostgreSQL 111257633123](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37141807677/job/111257633123): **271 PASS, 0 FAIL, 0 SKIP**, gồm 7 ca quyền mới.
- [Node22 111257633095](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37141807677/job/111257633095): **843 + 26 + 117 PASS**, không fail/skip. Node18, các PostgreSQL regression và frontend build SUCCESS.
- [Report 37141807634](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37141807634) và [Messenger 37141807632](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37141807632): SUCCESS.
- Checkout CI merge `6d0af329ad6e85bfffdebafec0118e3fc7e21e26` có tree đúng runtime; parents base `e16c885ae7c2305645be02a1227bf378cb59137f` và `2cac0949` đã đối chiếu Git API.
- Reviewer độc lập đã xác minh published helper/route blobs, cleanup không UPDATE/DELETE và tự chạy lại 50/50; đã tự đọc log CI terminal, xác minh cả 7 ca mới và kết luận **PASS checkpoint quyền/cleanup tại 2cac0949**.

Kết quả này chỉ xác minh checkpoint quyền/cleanup nêu trên. Các P1 bảo toàn lịch sử, transaction và cutover vẫn OPEN/HOLD; không thay nghiệm thu triển khai thực tế hoặc Founder release.
