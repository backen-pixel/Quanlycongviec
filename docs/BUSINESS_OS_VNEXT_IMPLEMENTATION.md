# Business OS vNext — trạng thái triển khai

Business OS vNext chạy song song với hệ thống hiện tại, dùng chung đăng nhập, tenant/company scope và dữ liệu Supabase. Không tạo nguồn dữ liệu nghiệp vụ thứ hai.

Công ty TNHH Bếp Vạn Phú Thành đang là pilot staging `all_modules_gateway`: toàn bộ workspace vNext được mở đồng thời. Sales có process gate mới; các module còn lại sử dụng API và permission hiện tại cho tới khi từng kernel domain được cutover. Tenant `abc1` vẫn giữ Blueprint v1 làm sandbox control-plane, không còn là company pilot dữ liệu thật.

Mốc code/schema hiện hành được khóa tại tag `business-os-vnext-staging-baseline-01`. Kết quả migration, test, backup gate, rollback và UAT 3–5 hồ sơ thật nằm trong [`baseline/BUSINESS_OS_VNEXT_STAGING_BASELINE_01.md`](./baseline/BUSINESS_OS_VNEXT_STAGING_BASELINE_01.md). Chưa mở UAT thật cho tới khi có backup hoàn tất sau schema freeze của baseline.

## Route map

| Workspace | Route | Trạng thái |
|---|---|---|
| Trung tâm điều hành | `/business-os` | Live overview theo company và permission |
| Công việc | `/business-os/work` | Gateway đang hoạt động trên task hiện tại |
| Kinh doanh | `/business-os/sales` | Pilot live: Lead → Qualification → Deal → chọn lộ trình thiết kế |
| Vận hành | `/business-os/operations` | Gateway đang hoạt động trên project/production hiện tại |
| Project Cockpit | `/business-os/operations/projects/:id` | Chi tiết 8 chặng trong cùng shell Business OS; route `/management/production-overview/:id` được giữ để rollback |
| Mua hàng | `/business-os/purchasing` | Gateway đang hoạt động trên catalog hiện tại |
| Tài chính | `/business-os/finance` | Gateway đang hoạt động trên accounting hiện tại |
| Khách hàng | `/business-os/customers` | Gateway đang hoạt động trên Customer hiện tại |
| Báo cáo | `/business-os/reports` | Gateway đang hoạt động trên reporting hiện tại |
| Kiến thức | `/business-os/knowledge` | Gateway đang hoạt động trên Knowledge hiện tại |
| AI Agent Center | `/business-os/ai` | Governed AI, bắt đầu ở Read/Recommend |
| Process Studio | `/business-os/admin` | Sales process canvas và stage contract |

Project Cockpit chuẩn tại `/business-os/operations/projects/:projectId` đã dùng read model `project_health_v1` với tám macro phase **Thiết kế → Thu mua → Sản xuất → KCS → Kho/Đóng gói → Giao nhận → Lắp đặt → Nghiệm thu**. Danh sách Vận hành mở Project trong cùng Business OS shell, giữ `company_id` của workspace và ghi rõ ngữ cảnh Project liên công ty; đổi công ty khi đang xem chi tiết sẽ quay về Portfolio của công ty mới. Route chuyển tiếp `/management/production-overview/:projectId` vẫn được giữ làm rollback. Mỗi chặng trả về phần trăm, owner, deadline, thông tin còn thiếu, blocker và mức rủi ro từ dữ liệu Project, yêu cầu mua hàng, pipeline SX/VC-LĐ và công việc hiện hữu. Trạng thái Công nợ/Thu tiền/Hóa đơn bị nhận diện là Finance và không được tính vào tiến độ Sản xuất. Khi cột VC xác nhận **Đã giao**, chặng hiện tại tự chuyển sang **Lắp đặt** để deadline và cảnh báo không bị lệch.

Facet **Phát sinh & Thay đổi** trong cùng Project Cockpit dùng read model `project_changes_v1`, tổng hợp từ `project_incidents`, `project_approvals` và Deal phát sinh qua `crm_leads.source_customer_deal_id`. Migration additive `580_project_change_record_contract.sql` mở rộng ngay System of Record `project_incidents`, không tạo bảng song song: hồ sơ mới bắt buộc **Loại phát sinh, Tiêu đề, Nguyên nhân**; owner, giai đoạn, bằng chứng, ảnh hưởng chi phí/tiến độ, bên chịu chi phí, liên kết chứng từ và yêu cầu phê duyệt là trường có thể bổ sung theo tình huống. Backend kiểm soát quyền duyệt/từ chối, không cho đóng hồ sơ còn chờ duyệt và ghi activity/audit. Sự cố mức cao/nghiêm trọng chưa xử lý được đưa vào blocker đúng macro phase của `project_health_v1`; chỉ Deal phát sinh ở trạng thái thắng mới được tính vào doanh thu phát sinh đã duyệt. UAT staging ngày 26/08/2026 đã xác nhận trọn chu trình tạo → chờ duyệt → phê duyệt → đóng hồ sơ và blocker tự giảm sau khi xử lý.

## Business Blueprint đa công ty

Platform Admin quản trị bộ mẫu tại `/platform/blueprints`, phát hành từng phiên bản bất biến và cài bộ mẫu cho từng tenant trong tab **Bộ mẫu vận hành**. Trước khi áp dụng hoặc nâng cấp, hệ thống lập kế hoạch thay đổi gồm module, phòng ban và quy trình; mọi cấu hình nằm ngoài Blueprint được giữ nguyên.

Lệnh áp dụng mang theo phiên bản tenant đã xem trước. Nếu một quản trị viên khác nâng cấp Blueprint trong lúc đó, backend trả `BLUEPRINT_VERSION_CONFLICT` và yêu cầu tải lại kế hoạch, tránh ghi đè từ giao diện cũ.

## Pilot dùng thật

Công ty TNHH Bếp Vạn Phú Thành dùng dữ liệu CRM thật và là company duy nhất bật feature flag staging. Quick Create đọc Stage Contract của công ty, tạo Customer + Lead qua API nghiệp vụ hiện tại và mở hồ sơ để bắt đầu quy trình.

Stage Contract Qualification hiện có tám trường chuẩn nhưng không còn bắt buộc đồng loạt. Mặc định bốn trường chặn chuyển bước là **Khách hàng liên kết, Khu vực phụ trách, Người chịu trách nhiệm, Nhu cầu khách hàng**; bốn trường **Số điện thoại, Ngân sách sơ bộ, Thời điểm dự kiến, Địa điểm lắp đặt** là tùy chọn. Quản trị viên đổi từng trường giữa Bắt buộc / Tùy chọn / Ẩn tại `/business-os/admin`; ba trường lõi phục vụ tenant scope và ownership được khóa bắt buộc. Cấu hình chỉ đổi validation và hiển thị, không xóa dữ liệu Lead đã có.

Process Studio đã hỗ trợ Dynamic Custom Fields theo từng company cho sáu kiểu `text`, `textarea`, `number`, `date`, `select`, `boolean`. Định nghĩa và giá trị nằm trong sidecar của Business OS, trong khi Lead thật vẫn ở `crm_leads`. Quick Create và Lead Detail dựng input từ Stage Contract; readiness backend hợp nhất trường chuẩn và trường tùy biến trước khi cho chuyển bước. Mỗi lần publish cấu hình tạo version bất biến, rollback tạo version mới và xóa trường là soft-delete.

Process Studio cũng đã có Qualification automation theo company. Quản trị viên cấu hình checklist task, hạn tương đối theo giờ làm việc, chiến lược phân công, cờ chặn chuyển bước, quick verdict và SLA/escalation. Khi bắt đầu Qualification, backend materialize task vào `crm_tasks`; source key và unique index ngăn sinh trùng khi command hoặc retry chạy lặp. Cấu hình có version bất biến và rollback.

Worker SLA chạy 5 phút/lần, chỉ quét company có automation active. `at_risk` gửi owner; `overdue` gửi owner và admin công ty theo policy. Worker chỉ insert notification nội bộ, không gọi socket/mobile push/email/Zalo/webhook. `business_os_sla_escalations` chống lặp theo instance + level + recipient.

Sales Workspace hiển thị KPI phễu bắt đầu Qualification, hoàn tất, Lead → Deal, đúng hạn SLA và thời gian Qualification trung bình. Số liệu được tính từ `crm_leads`, `business_os_process_instances` và process event/audit, không dùng dữ liệu demo.

Deal workflow đã mở tiếp hai stage Khảo sát và Thiết kế trên cùng process instance. Bắt đầu Khảo sát sinh 3 task vào `crm_tasks`; hoàn tất task chặn, minh chứng và quick verdict mới được bàn giao Thiết kế. Bàn giao tự bắt đầu SLA Thiết kế và sinh 3 task tiếp theo. Khi hoàn tất, hồ sơ ở `design_completed`, đủ điều kiện tạo Báo giá.

Deal hiện có hai đường đi theo đầu vào thực tế. Nếu khách chưa có bản vẽ, người dùng chọn `full_service` để đi Khảo sát → Thiết kế. Nếu khách đã có bản vẽ, chọn `customer_design` để vào `design_review`, bỏ qua việc làm lại nhưng vẫn phải hoàn tất ba task tiếp nhận file, kiểm tra kỹ thuật/kích thước và xác nhận đủ dữ liệu báo giá. Lộ trình được lưu trên process instance và không giả lập mốc Khảo sát.

Process Studio cấu hình riêng automation, SLA, escalation, version và rollback cho Qualification, Khảo sát, Thiết kế và Kiểm tra thiết kế có sẵn. Vạn Phú Thành hiện có Survey v1 (1.440 phút), Design v1 (1.920 phút) và Design Review v1 (480 phút làm việc), mỗi stage 3 task mẫu.

Sales Workspace có KPI lộ trình Deal: tỷ lệ đã chọn đường đi, tỷ trọng khách có thiết kế, tỷ lệ kiểm tra đạt và tỷ lệ sẵn sàng báo giá. Nguồn số liệu là Deal thật, `workflow_path` cùng lifecycle timestamp trong `business_os_process_instances`.

Lát cắt Báo giá đầu tiên đã được nối bằng adapter backend. Nút **Tạo báo giá** mở form CRM hiện tại với Deal được điền sẵn; chỉ sau khi `quotations` lưu thành công, process kernel mới chuyển `design_completed → quotation`, lưu tham chiếu `primary_quotation_id` và phát event `sales.quotation.created`. Báo giá CRM vẫn là System of Record duy nhất. Funnel giữ nguyên các mốc Survey/Design khi hồ sơ đi xuống stage mới và bổ sung `quotation_started` cùng tỷ lệ bắt đầu Báo giá. Tự liên kết báo giá theo khách hàng cũng bị giới hạn cùng `company_id` để tránh gắn nhầm Deal công ty khác.

Tenant gate đã chặn thêm các tham số công ty chuyên biệt và danh sách `company_ids` ở query/body. Một ID ngoài tenant làm request bị từ chối và ghi `tenant_access_audit`; các luồng cross-company hợp lệ vẫn phải nằm trong cùng tenant.

Gate chuyển bước gồm required information, owner, các task thuộc `consulting/qualification`, SLA, idempotency và business event. Task của các stage Deal sau (`deal_new`, quotation, ordering, schedule) không chặn Qualification. Mọi module chưa cutover chỉ đọc hoặc dẫn người dùng sang công cụ hiện tại. Feature flag chỉ bật theo company và luôn giữ đường quay lại UI cũ.

Kiểm thử staging các vertical slice tạo fixture có tiền tố `[STAGING]` và dọn sạch sau khi hoàn tất. Migration `569`, `570`, `571`, `572` và `573_business_os_quotation_start.sql` đã được áp dụng trên database pilot. Qualification, Survey, Design và Design Review đều có automation v1 theo company; connector Báo giá đã qua UAT tạo chứng từ thật, chuyển process, ghi event đúng một lần và dọn fixture. Chưa deploy production hoặc nhân sang công ty khác.
