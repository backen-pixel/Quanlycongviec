# Nhật ký quyết định dự án Quanlycongviec

> Đây là nguồn ghi nhớ bền vững cho dự án. Khi bắt đầu một task mới, cần đọc file này trước khi đề xuất hoặc triển khai thay đổi kiến trúc lớn.

## 1. Xứ mệnh sản phẩm

Chuyển `Quanlycongviec` từ phần mềm quản lý công việc thành **Business Operating System** cho doanh nghiệp sản xuất và thi công nội thất, bắt đầu từ ngành tủ bếp.

Hệ thống phải giúp doanh nghiệp vận hành bằng quy trình, trách nhiệm và dữ liệu rõ ràng; không phụ thuộc vào trí nhớ cá nhân.

Kiến trúc nghiệp vụ dài hạn:

**Company → Department → Process → Stage → Record → Task → SLA → KPI → Dashboard → AI Agent**

Mỗi stage phải có khả năng định nghĩa:

- Thông tin bắt buộc và thông tin tùy chọn.
- Người chịu trách nhiệm.
- Công việc cần hoàn thành.
- Deadline và SLA.
- Điều kiện chuyển bước.
- Automation và business event.
- KPI đo lường.
- Quyền và phạm vi hỗ trợ của AI.

## 2. Nguyên tắc kiến trúc đã chốt

### 2.1 Một hệ sinh thái, nhiều công ty

- Nền tảng phải có khả năng nhân bản cho nhiều công ty và nhiều tenant.
- Dữ liệu, cấu hình, quyền và báo cáo phải được cô lập theo tenant/company.
- Dùng Business Blueprint có version để triển khai bộ mẫu vận hành cho tenant mới.
- Cấu hình riêng của từng công ty không được ghi đè khi nâng cấp Blueprint.

### 2.2 Không tạo nguồn dữ liệu nghiệp vụ thứ hai

- Business OS vNext dùng chung Supabase, API, đăng nhập và permission hiện tại.
- Không sao chép Lead, Deal, Customer, Project hoặc Task sang một kho dữ liệu song song.
- Module chưa cutover dùng gateway tới chức năng hiện tại.
- Luôn giữ đường quay lại giao diện cũ trong giai đoạn staging.

### 2.3 Triển khai theo vertical slice

Vertical slice đầu tiên:

**Lead → Qualification → Deal**

Sau khi kiểm chứng ổn định mới mở tiếp:

**Deal → Survey → Design → Quotation → Negotiation → Order → Production → Installation → Customer Care**

### 2.4 AI có kiểm soát

- Giai đoạn đầu AI chỉ đọc, phân tích và khuyến nghị.
- AI không tự ý Won/Lost, duyệt báo giá, gửi nội dung ra ngoài hoặc thực hiện hành động nhạy cảm.
- Hành động ghi dữ liệu phải đi qua API nghiệp vụ, permission, idempotency và audit.
- Hành động nhạy cảm cần người có thẩm quyền phê duyệt.

### 2.5 Cải tổ cuốn chiếu, không đập bỏ toàn bộ

- Không viết lại toàn bộ hệ thống và không tiếp tục vá giao diện rời rạc.
- Giữ các System of Record, đăng nhập, tenant/permission, chứng từ và quy trình nghiệp vụ hiện hữu đã được kiểm chứng.
- Thay dần lớp dùng chung còn yếu: ngữ cảnh công ty, API/read model, KPI, điều hướng, shell và trải nghiệm chi tiết module.
- Mỗi module được thay theo vertical slice có cờ mở, kiểm thử staging, đường quay lại giao diện cũ và tiêu chí cutover rõ ràng.
- Chỉ rút giao diện cũ sau khi dữ liệu, phân quyền, hiệu năng và UAT của lát cắt mới đạt nghiệm thu.

## 3. Quyết định về giao diện và module

- Không chỉ “làm đẹp từng màn hình”; phải thiết kế theo toàn bộ luồng vận hành.
- Sidebar Business OS gồm: Trung tâm điều hành, Công việc, Kinh doanh, Vận hành, Mua hàng, Tài chính, Khách hàng, Báo cáo, Kiến thức, AI Agent Center và Thiết kế hệ thống.
- Các module được mở đồng thời theo mô hình gateway để người dùng trải nghiệm toàn hệ sinh thái.
- Sales là module đầu tiên có process kernel và transition gate mới.
- Giao diện mới phải luôn hiển thị dữ liệu thật của công ty đang chọn, không dùng số liệu demo giả làm dữ liệu vận hành.

### 3.1 Vận hành và Project Cockpit

- Màn Vận hành là Project Portfolio để quản lý toàn bộ Project và phát hiện thiếu vật tư, trễ sản xuất, chờ KCS/đóng gói, sẵn sàng giao và rủi ro.
- Bấm mã Project luôn mở Tổng quan Project theo chuỗi: **Thiết kế → Thu mua → Sản xuất → KCS → Kho/Đóng gói → Giao nhận → Lắp đặt → Nghiệm thu**.
- Mỗi chặng phải trả lời thống nhất: phần trăm hoàn thành, phần còn thiếu, owner, deadline, blocker và rủi ro có nguyên nhân.
- Công nợ, thu tiền và hóa đơn thuộc Finance; không phải stage và không được tính vào tiến độ Sản xuất.
- Dashboard và AI dùng cùng Project health read model; AI giai đoạn đầu chỉ đọc, cảnh báo Project trễ và chỉ ra chặng gây trễ.
- Chi tiết quyết định: `docs/adr/0013-project-cockpit-macro-health-contract.md`.

### 3.2 Phát sinh và tài chính theo Project

- Phát sinh công trình nằm trong facet Phát sinh & Thay đổi của Project, có owner, bằng chứng, ảnh hưởng chi phí/tiến độ, bên chịu chi phí và approval.
- Phát sinh chưa xử lý có thể trở thành blocker; chỉ phát sinh thương mại đã duyệt mới điều chỉnh doanh thu Project.
- Hóa đơn, thanh toán và công nợ thuộc Finance; Project Cockpit chỉ tổng hợp và mở chứng từ nguồn.
- Lãi lỗ phải tách P&L, cashflow và forecast. Tiền đã thu không đồng nghĩa với lợi nhuận.
- Công nợ/thu tiền không phải stage và không được tính vào tiến độ Sản xuất.
- Chi tiết quyết định: `docs/adr/0014-project-change-finance-profitability.md`.

## 4. Stage Contract Qualification

Tám trường chuẩn hiện tại:

| Trường | Mặc định | Ghi chú |
|---|---|---|
| Khách hàng liên kết | Bắt buộc | Trường lõi, không được ẩn |
| Số điện thoại | Tùy chọn | Có thể bổ sung sau |
| Khu vực phụ trách | Bắt buộc | Trường lõi, không được ẩn |
| Người chịu trách nhiệm | Bắt buộc | Trường lõi, không được ẩn; Quick Create tự gán người tạo |
| Nhu cầu khách hàng | Bắt buộc | Tối thiểu 10 ký tự |
| Ngân sách sơ bộ | Tùy chọn | Không chặn Qualification mặc định |
| Thời điểm dự kiến | Tùy chọn | Không chặn Qualification mặc định |
| Địa điểm lắp đặt | Tùy chọn | Không chặn Qualification mặc định |

Quản trị viên có thể chuyển từng trường không bị khóa giữa:

- **Bắt buộc:** thiếu sẽ chặn hoàn tất Qualification.
- **Tùy chọn:** hiển thị nhưng thiếu không chặn quy trình.
- **Ẩn:** không hiển thị trong form; dữ liệu đã có không bị xóa.

Tên Lead vẫn là thông tin nhận diện hồ sơ và luôn bắt buộc khi tạo mới; đây không phải một trường trong tám điều kiện Qualification.

Quản trị viên cũng có thể tạo trường riêng cho Qualification theo từng công ty với sáu kiểu: văn bản ngắn, văn bản dài, số, ngày, danh sách chọn và Có/Không. Trường tùy biến dùng sidecar nên không thêm cột vào `crm_leads`, không tạo bản sao Lead và vẫn tham gia cùng Stage Contract/readiness.

Mỗi lần đổi Stage Contract tạo một snapshot bất biến. Khôi phục một bản cũ luôn tạo version mới; xóa trường riêng là soft-delete và không xóa giá trị lịch sử.

## 5. Trạng thái triển khai hiện tại

### Môi trường

- Đang chạy staging, chưa deploy đại trà.
- Công ty pilot dữ liệu thật: **Công ty TNHH Bếp Vạn Phú Thành**.
- Workspace mode: `all_modules_gateway`.
- Storage process: Business OS kernel.
- Blueprint v1 của tenant sandbox vẫn được giữ làm control-plane; chưa áp Blueprint tenant-wide cho công ty pilot.

### Đã hoàn thành

- Design Foundation và Business OS workspace.
- Dashboard/Trung tâm điều hành theo company.
- Gateway cho toàn bộ nhóm module chính.
- Quick Create Lead dùng dữ liệu CRM thật.
- Process Lead → Qualification → Deal.
- SLA theo lịch làm việc.
- Task gate chỉ xét task của Lead/Qualification; task Deal tương lai không chặn bước Qualification.
- Event ledger, idempotency và audit khi chuyển bước.
- Stage Contract theo từng công ty.
- Trang quản trị Bắt buộc / Tùy chọn / Ẩn tại `/business-os/admin`.
- Form tạo Lead và Lead Detail đọc cùng Stage Contract từ backend.
- Dynamic Custom Fields theo company/process/stage, có validation backend và audit khi lưu giá trị.
- Quick Create và Lead Detail tự dựng input theo kiểu trường tùy biến.
- Lịch sử version và rollback Stage Contract tại `/business-os/admin`.
- Migration `569_business_os_dynamic_custom_fields.sql` đã áp dụng cho database pilot.
- Qualification task template theo công ty; khi bắt đầu bước, task được sinh vào `crm_tasks` và chống trùng bằng source key.
- SLA Qualification và deadline task cùng dùng lịch giờ làm việc; worker escalation nội bộ chạy 5 phút/lần và có ledger chống lặp.
- KPI phễu Qualification đọc từ Lead, process instance và event/audit thật.
- Process Studio quản trị task, SLA, escalation, version và rollback tại `/business-os/admin`.
- Migration `570_business_os_qualification_automation.sql` đã áp dụng cho database pilot; cấu hình Vạn Phú Thành ở version 1 với 3 task mẫu.
- Vertical slice Deal → Khảo sát → Thiết kế đã nối vào cùng Sales process kernel; Deal cũ không bị tự chuyển bước.
- Khảo sát và Thiết kế có task template, task gate, SLA, escalation theo stage, version/rollback và KPI riêng.
- Migration `571_business_os_deal_survey_design.sql` đã áp dụng staging; Vạn Phú Thành có Survey v1 và Design v1, mỗi stage 3 task mẫu.
- Deal được chọn lộ trình theo đầu vào: `full_service` hoặc `customer_design`; khách đã có bản vẽ không phải làm lại Khảo sát/Thiết kế.
- Nhánh `customer_design` đi qua `design_review` có 3 task kiểm soát, minh chứng, quick verdict, SLA 480 phút, escalation và KPI riêng; không cho bỏ kiểm tra để đi thẳng Báo giá.
- Migration `572_business_os_flexible_design_intake.sql` đã áp dụng staging; Vạn Phú Thành có Design Review v1 với 3 task mẫu.
- Tenant gate chặn cả company parameter đơn và danh sách `company_ids`; truy cập công ty ngoài tenant được từ chối và ghi audit.
- Design hoàn tất đã nối sang Báo giá CRM thật. Tạo thành công `quotations` mới chuyển process sang `quotation`, lưu `primary_quotation_id` và ghi event idempotent; không tạo nguồn dữ liệu Báo giá thứ hai.
- Migration `573_business_os_quotation_start.sql` đã áp dụng database pilot.
- Báo giá đã nối tiếp qua `negotiation → order_ready → order`; chứng từ CRM vẫn là nguồn dữ liệu duy nhất và process không hồi quy khi người dùng sửa lại trạng thái.
- Chỉ báo giá `accepted` mới được tạo Đơn hàng; `converted` là trạng thái hệ thống, retry tuần tự trả lại đơn hàng đã có thay vì tạo trùng.
- Migration `574_business_os_negotiation_order.sql` đã áp dụng database pilot.
- Migration `575_orders_quotation_idempotency.sql` đã áp dụng database pilot; unique partial index bảo đảm một báo giá nguồn không sinh hai đơn hàng kể cả khi có request đồng thời.
- Chuỗi `order → project → production` đã nối vào cùng Sales process kernel; duyệt báo giá không còn tạo Project sớm.
- Chỉ Đơn hàng `confirmed` mới tạo/liên kết Project; bàn giao Sản xuất tiếp tục dùng API, task `sx_*`, quyền Sale, công ty xưởng và lịch dự kiến hiện hữu làm gate backend.
- Migration `576_business_os_project_production.sql` đã áp dụng database pilot; Project/Sản xuất vẫn dùng bảng `projects` làm System of Record.
- Chuỗi `production → delivery_ready → installation → completed` đã nối vào cùng Sales process kernel, dùng thẻ bàn giao VC/LĐ và Kanban Logistics hiện hữu làm tín hiệu thật.
- Xưởng yêu cầu bàn giao mở `delivery_ready`; Sale chọn công ty/lịch mở `installation`. Đội nội bộ đóng process bằng cột VC/LĐ Hoàn thành; đội thuê ngoài đóng bằng chính sự kiện Lắp đặt có marker bàn giao hợp lệ. Project, comment, lịch sự kiện và task không bị sao chép sang nguồn mới.
- Migration `577_business_os_production_installation.sql` đã áp dụng database pilot; bộ lọc tự đóng task/assignment khi hoàn thành đã được sửa theo đúng enum từng bảng.
- Sau bàn giao, hệ thống tự mở process riêng `customer_after_sales_v1`; Sales process vẫn đóng để không làm sai KPI doanh thu khi phát sinh bảo hành.
- Ba lịch CSKH 7/30/90 ngày được materialize vào `crm_tasks` thật và chống trùng theo source key. Case Bảo hành/Dịch vụ/Khiếu nại có SLA giờ làm việc, trạng thái backend, kết quả bắt buộc và event ledger.
- Business OS Khách hàng đã có dashboard kế hoạch sau bán, case đang mở/quá SLA, form tạo yêu cầu và hành động Tiếp nhận → Xử lý → Hoàn tất → Đóng.
- Migration `578_business_os_after_sales.sql` đã áp dụng database pilot; chỉ thêm bảng case bảo hành và index, không sao chép Customer/Deal/Project/task.
- Migration `579_logistics_customer_care_stage.sql` đã áp dụng staging; thêm 2 cột CSKH còn thiếu cho pipeline global và công ty VC/LĐ, giữ nguyên ID/cấu hình cột cũ.
- Đã chốt ADR-0010: cải tổ cuốn chiếu, giữ System of Record và business rules hiện hữu; không viết lại big-bang.
- Operations đã bỏ các cột CRM không tồn tại (`budget`, `deadline`), dùng `estimated_value` và `kanban_deadline_at` theo schema chuẩn.
- KPI Sản xuất/VC-LĐ trong Business OS tính Project theo công ty thương mại liên kết qua Lead/Deal, kể cả khi Project được thực thi tại xưởng khác; Vạn Phú Thành hiện đọc được 71 Project SX thay vì 0 sai.
- Deep link Business OS → Kế toán giữ `client_company_id` xuyên suốt dashboard, chi tiết và đường quay lại; tenant guard backend vẫn chặn công ty ngoài phạm vi.
- API Khách hàng tôn trọng `company_id` được chọn thay vì trả toàn bộ công ty trong cùng tenant.
- Đã chốt ADR-0011 cho lát cắt Dự án & Công việc: `projects` và ba nguồn task hiện hữu vẫn là System of Record; `unified_tasks_v` là read gateway, không tạo kho công việc song song.
- Hợp đồng KPI `work_kpi_v1` dùng exact count toàn phạm vi company/employee, coi `done`, `completed`, `cancelled` là trạng thái kết thúc; đã bỏ giới hạn tổng hợp 3.000 dòng và dùng chung helper với Dashboard quản trị.
- Business OS Công việc lọc Cần làm/Hôm nay/Quá hạn/Đã xong ở backend trước phân trang, hiển thị nguồn KPI và mở trực tiếp vòng đời Dự án có giữ `company_id`.
- API Work đã áp tenant guard cho summary, danh sách, tùy chọn Lead, lịch sử và công việc theo Project; request trực tiếp tới công ty ngoài hệ sinh thái trả 403.
- Chi tiết Project có lớp `next_actions` ưu tiên việc quá hạn/gần hạn, bộ lọc Đang mở/Quá hạn/Đã xong và giữ company context khi đi từ danh sách vào chi tiết rồi quay lại.
- Với mô hình nhiều công ty, Project phân biệt công ty sở hữu và công ty vận hành/logistics; quyền xem chấp nhận một trong hai thuộc scope nhưng response luôn trả rõ `company_id`, `logistics_company_id`, `scope_company_id`.

### Kiểm thử gần nhất

- Business OS unit/integration: **9/9 đạt**.
- CRM regression: **50/50 đạt**.
- Frontend production build: **đạt**.
- API overview của công ty pilot đọc được 200 hồ sơ thật.
- Lead kiểm chứng đạt 4/4 trường bắt buộc và 1/4 trường tùy chọn vẫn được phép đi tiếp.
- UAT Dynamic Custom Fields: tạo field → lưu value → readiness → rollback → soft-delete **đạt**, fixture đã dọn sạch.
- Sau UAT, công ty pilot trở lại đúng 8 trường chuẩn và 1 phiên bản nền.
- UAT Qualification automation: tạo task đúng một lần khi command lặp, task gate, deadline giờ làm việc, notification SLA chống lặp, KPI funnel và cleanup fixture **đạt**.
- Live smoke: overview trả 200 hồ sơ, automation v1 có 3 task và funnel KPI có nguồn dữ liệu thật.
- UAT Deal → Khảo sát → Thiết kế: chống sinh task trùng, task gate, minh chứng, quick verdict, mốc lifecycle và KPI overview **đạt**; fixture đã dọn sạch.
- CRM regression sau khi mở 4 endpoint Deal workflow: **50/50 đạt**; route inventory 260 endpoint, missing 0, unexpected 0.
- UAT nhánh khách đã có thiết kế: chọn route, chống sinh task trùng, gate/minh chứng, không tạo mốc Khảo sát giả, sẵn sàng báo giá và KPI overview **đạt**; fixture đã dọn sạch.
- Route inventory sau khi thêm hai command lộ trình linh hoạt: **262 endpoint**, missing 0, unexpected 0.
- Tenant isolation smoke sau khi mở rộng guard company parameters: **đạt**.
- UAT `design_completed → quotation`: tạo báo giá qua API CRM, process chuyển đúng stage, `sales.quotation.created` chỉ có một event và fixture đã dọn sạch: **đạt**.
- UAT thương mại đầy đủ `quotation → negotiation → order_ready → order`: chặn đơn từ báo giá nháp, ghi đúng ba event, retry không tạo đơn thứ hai và fixture đã dọn sạch: **đạt**.
- UAT staging đầy đủ `design_completed → quotation → negotiation → order_ready → order → project → production`: không tạo Project khi duyệt báo giá, xác nhận đơn mới tạo Project, bàn giao tái sử dụng đầy đủ gate SX, event không trùng và fixture đã dọn sạch: **đạt**.
- UAT staging toàn tuyến `design_completed → quotation → negotiation → order_ready → order → project → production → delivery_ready → installation → completed`: tái sử dụng thẻ bàn giao, Project/Kanban VC-LĐ thật, retry không sinh event trùng, tự đóng công việc đúng enum và fixture đã dọn sạch: **đạt**.
- UAT staging nhánh lắp đặt thuê ngoài: hoàn tất đúng sự kiện lịch có marker bàn giao đã đóng process, retry không ghi event lần hai và fixture đã dọn sạch: **đạt**.
- UAT staging After-sales theo tuyến thật `Lắp đặt → Bảo hành/CSKH → Hoàn thành`: tạo process tách Sales tại cột CSKH, cột cuối là fallback idempotent, sinh đúng ba lịch 7/30/90, case khẩn cấp có SLA, chặn transition sai, bắt buộc kết quả, chặn đóng khi còn việc và cleanup fixture: **đạt**.
- Frontend production build sau khi mở stage/KPI VC-LĐ và bàn giao: **đạt**.
- Frontend production build sau khi mở giao diện Customer Care/Warranty: **đạt** (còn cảnh báo chia chunk đã có từ trước).
- Frontend production build sau lát cắt ổn định nền tảng: **đạt** (còn cảnh báo chunk đã có từ trước).
- Tenant-admin staging smoke sau khi sửa Operations/company context: **đạt**; kiểm tra 5 công ty trong tenant, 200 hồ sơ pilot, toàn bộ module gateway và chặn công ty ngoài tenant.
- Browser staging: Operations tải dữ liệu thật, KPI SX = 71 và chờ tiếp nhận = 5; Kế toán hiển thị 136 deal của Vạn Phú Thành và giữ company context khi mở chi tiết/quay lại.
- Project & Work staging: `work_kpi_v1` đọc 32.826 việc của Vạn Phú Thành, gồm 29.450 việc mở, 3.376 việc kết thúc và 43 việc quá hạn; KPI Work khớp tuyệt đối Dashboard quản trị.
- Browser staging Work: tab Cần làm nhận đủ tổng 29.450; tab Quá hạn lọc backend trước phân trang và trả đúng 43 việc; link vòng đời Dự án giữ `company_id` pilot.
- Browser staging Project: Project do công ty khác sở hữu nhưng Vạn Phú Thành vận hành mở được đúng scope; đường quay lại giữ company pilot, tab Công việc hiển thị 42 mở / 56 hoàn thành và 5 Next Action ưu tiên.

## 6. Lộ trình ưu tiên tiếp theo

### Điều kiện tiên quyết — Ổn định nền tảng dùng chung

Trước khi mở thêm tính năng hoặc làm lại sâu một module, xử lý theo thứ tự:

1. Thống nhất ngữ cảnh tenant/company giữa Business OS và module hiện hữu.
2. Loại bỏ truy vấn lệch schema và lỗi chặn tải dữ liệu.
3. Chuẩn hóa định nghĩa, phạm vi và nguồn dữ liệu của KPI/read model.
4. Kiểm thử staging theo công ty pilot và giữ đường quay lại giao diện hiện tại.

Làn cải tổ giao diện/nghiệp vụ được thực hiện tuần tự: **Dự án & Công việc → Vận hành/Sản xuất/VC-LĐ → CRM chi tiết → Mua hàng & Tài chính → Báo cáo & AI → Blueprint đa công ty → UAT cutover và rút giao diện cũ**. Mỗi vertical slice vẫn phải vượt test tự động, tenant isolation và build trước khi mở lát cắt kế tiếp; UAT của anh và người dùng nghiệp vụ được gom về cuối, sau khi baseline 02 đủ module.

### Giai đoạn 1 — Mua hàng → Chi phí → Công nợ

Triển khai một vertical slice nối từ Dự án/Sản xuất đến:

1. Yêu cầu mua hàng.
2. Đơn mua hàng gắn Project và truy ngược yêu cầu nguồn.
3. Nhận hàng và đối chiếu.
4. Ghi nhận chi phí theo Dự án.
5. Hóa đơn, thanh toán và công nợ phải thu/phải trả.
6. Phát sinh thương mại đã duyệt và ảnh hưởng của nó tới doanh thu/forecast Project.
7. Read model tài chính Project, tách riêng P&L, dòng tiền và dự báo.

Tiếp tục dùng chứng từ và bảng nghiệp vụ hiện hữu làm System of Record; Business OS chỉ điều phối stage, task, SLA, KPI và audit, không tạo nguồn dữ liệu song song. Các lát cắt phải có test tự động và fallback tương thích khi migration mới chưa được áp dụng.

### Giai đoạn 2 — Báo cáo điều hành

- Dashboard xuyên phòng ban từ Lead đến doanh thu, chi phí, biên lợi nhuận, công nợ và sau bán.
- Project Cockpit hiển thị doanh thu hợp đồng, phát sinh đã duyệt, chi phí kế hoạch/cam kết/thực tế/dự báo, lợi nhuận và biên lợi nhuận; mọi số liệu phải drill-down về chứng từ nguồn.
- KPI phải truy ngược được về hồ sơ/chứng từ thật; không dùng số liệu minh họa khi chạy thật.
- Có góc nhìn theo công ty, phòng ban, người phụ trách, quy trình và thời gian.

### Giai đoạn 3 — Governed AI Agent

- AI đọc dữ liệu theo đúng tenant và quyền người dùng.
- AI ưu tiên tóm tắt, cảnh báo, đề xuất hành động và soạn nội dung; gồm cảnh báo phát sinh chưa duyệt, công nợ đến hạn và nguy cơ giảm biên lợi nhuận Project.
- Mọi hành động làm thay đổi dữ liệu quan trọng phải có quyền, xác nhận và audit; AI không tự ý duyệt chứng từ hoặc bỏ qua process gate.

### Giai đoạn 4 — Blueprint đa công ty

- Chuẩn hóa process template, stage contract, task/SLA/KPI template, role mapping và cấu hình module thành Blueprint có version.
- Nhân bản thử sang công ty thứ hai mà không sao chép dữ liệu giao dịch của công ty pilot.
- Kiểm thử tenant isolation, cấu hình riêng từng công ty và rollback version trước khi cho phép nhân rộng.

### Giai đoạn 5 — Ổn định tích hợp và chốt baseline 02

- Chạy hồi quy tự động toàn tuyến, tenant isolation, build và browser smoke trên toàn bộ module Business OS.
- Kiểm tra migration additive, schema, hiệu năng truy vấn và khả năng drill-down về chứng từ nguồn.
- Chốt commit/tag baseline 02, database/migration manifest, test evidence, backup và rollback trước khi giao anh kiểm thử.

### Giai đoạn 6 — UAT toàn hệ thống với dữ liệu thật

Chạy xuyên suốt tối thiểu 3–5 hồ sơ thật, bao phủ:

1. Hai lộ trình Sales: khách cần thiết kế và khách đã có thiết kế.
2. Dự án lắp đặt nội bộ và thuê ngoài.
3. Mua hàng, nhận hàng, chi phí, hóa đơn, thu/chi và công nợ.
4. Phát sinh Project có phê duyệt, bằng chứng và ảnh hưởng lợi nhuận/tiến độ.
5. CSKH 7/30/90 và một case Bảo hành/Dịch vụ/Khiếu nại.
6. Dashboard, AI cảnh báo và Blueprint công ty thứ hai trong đúng tenant scope.

Nghiệm thu theo vai trò thực tế, kiểm tra task gate, SLA, thông báo, KPI, phân quyền và khả năng truy vết. Lỗi chặn vận hành phải được sửa, kiểm thử lại và cập nhật baseline 02 trước cutover.

### Giai đoạn 7 — Sẵn sàng triển khai rộng

- Hoàn tất kiểm thử hồi quy, hiệu năng, sao lưu/khôi phục, quan sát lỗi, hướng dẫn sử dụng và đào tạo người dùng.
- Chỉ deploy production hoặc mở rộng nhiều công ty sau khi staging một công ty đạt tiêu chí nghiệm thu.
- Thứ tự thực hiện đã chốt ngày 2026-08-26: **Mua hàng/Chi phí/Công nợ → Báo cáo → AI có kiểm soát → Blueprint công ty thứ hai → baseline 02 → UAT toàn hệ thống → Deploy rộng**.

## 7. Nguyên tắc làm việc giữa anh Hùng và Codex

- Khi anh chốt một quyết định kiến trúc hoặc nghiệp vụ quan trọng, Codex cập nhật file này trong cùng task.
- Nội dung trò chuyện vẫn nằm trong lịch sử task, nhưng quyết định dài hạn phải được ghi vào file này.
- Thay đổi code phải được kiểm thử tương xứng với rủi ro trước khi bàn giao.
- Không tự deploy production, mở rộng tenant hoặc thay đổi dữ liệu diện rộng nếu anh chưa yêu cầu rõ.
- Không làm mất dữ liệu cũ và không phá luồng vận hành hiện tại trong quá trình chuyển đổi.
- Nếu quyết định mới thay thế quyết định cũ, phải ghi rõ ngày, lý do và phần bị thay thế trong mục lịch sử bên dưới.

## 8. Lịch sử quyết định

### 2026-08-28 — Chốt baseline 02, sẵn sàng UAT có kiểm soát

- Các lát cắt theo lộ trình đã hoàn tất ở mức code/schema: Mua hàng–Tài chính Project, Báo cáo/AI có kiểm soát và Blueprint theo công ty.
- Staging đã áp dụng migration additive 581–582; audit toàn chuỗi đạt 17/17 capability tại schema freeze `2026-08-27T01:01:30.141Z`.
- CRM parity chạy liền mạch trên backend Node độc lập đạt 100/100; Business OS đạt 37/37 và tenant isolation PASS.
- Backup `1499151552` hoàn tất lúc `2026-08-27T22:13:42.536Z`, mới hơn schema freeze; audit trả `uat_gate.status="READY"`.
- Tag `business-os-vnext-staging-baseline-02` chỉ trỏ commit hồ sơ baseline đã kiểm chứng; baseline 01 không bị di chuyển.
- Lệnh readiness baseline 02 bắt buộc đồng thời: migration/backup READY, tag tồn tại và trỏ đúng commit đang chạy, preflight read-only/PII-safe hoàn tất.
- UAT cuối gồm 6 kịch bản: hai lộ trình Sales; Project/vận hành nội bộ; liên công ty/After-sales; phát sinh–Mua hàng–Tài chính; Báo cáo/AI; Blueprint công ty thứ hai.
- Không deploy production và không sao chép dữ liệu giao dịch khi nhân Blueprint.
- Hồ sơ baseline: `docs/baseline/BUSINESS_OS_VNEXT_STAGING_BASELINE_02.md`.

### 2026-08-26 — Blueprint có bản cài và override độc lập theo công ty

- Thêm control plane `company_blueprint_installations` bằng migration additive `582`; trigger database và backend cùng chặn company/tenant scope sai.
- Platform Admin có thể preview/apply Blueprint cho mặc định tenant hoặc một công ty cụ thể. Business OS ưu tiên effective definition của công ty và fallback tenant để tương thích ngược.
- Override module, phòng ban, quy trình và operating kernel của từng công ty được giữ khi nâng Blueprint version; override công ty A không ảnh hưởng công ty B.
- Apply theo công ty chỉ tạo phòng ban mẫu còn thiếu; không xóa cấu hình ngoài Blueprint và không sao chép dữ liệu giao dịch.
- Migration `581` và `582` đã áp dụng, verify và audit đủ 17/17 capability trên staging ngày 27/08/2026; backup hậu-migration vẫn là gate bắt buộc trước khi chốt baseline 02 và mở UAT.
- Chi tiết quyết định: `docs/adr/0016-company-scoped-blueprint-installation.md`.

### 2026-08-26 — Báo cáo điều hành và AI dùng chung Executive Intelligence

- Backend phát hành `executive_intelligence_v1`, hợp nhất Sales, Work KPI, `operations_kpi_v1` và `project_finance_v1` trong đúng company/tenant scope.
- Màn Báo cáo và AI Agent Center cùng đọc `/api/management/executive-brief`; mọi cảnh báo/khuyến nghị có evidence và deep link về hồ sơ nguồn.
- AI hiện chỉ `read_recommend`, không ghi dữ liệu, không gửi ra ngoài và mọi đề xuất cần người xem xét.
- Không công bố lợi nhuận toàn danh mục khi còn Project thiếu nguồn chi phí; phải hiển thị rõ độ phủ complete/partial.
- Live smoke tại công ty pilot đọc được 71 Project, 15 Project cần chú ý và 18 khuyến nghị có evidence; do migration 581 chưa áp dụng nên lợi nhuận danh mục được ẩn đúng guard.
- Hồi quy sau lát cắt đạt Business OS **37/37**, tenant isolation PASS và frontend production build exit code `0`.
- Chi tiết quyết định: `docs/adr/0015-executive-intelligence-report-ai-contract.md`.

### 2026-08-26 — Đổi thứ tự: hoàn thiện module trước, UAT người dùng sau

- Theo quyết định mới của anh Hùng, Codex tiếp tục hoàn thiện các vertical slice còn lại trước khi anh kiểm thử nghiệp vụ toàn hệ thống.
- Quyết định này thay thế phần thứ tự “không mở thêm module trước UAT” của baseline 01 và lộ trình UAT-trước đó; không xóa hoặc di chuyển tag baseline 01.
- Baseline 01 chỉ còn là mốc lịch sử/rollback. Nhánh phát triển tiến tới baseline 02 sau khi Mua hàng/Tài chính, Báo cáo/AI và Blueprint đã qua test tự động.
- Mỗi lát cắt vẫn phải kiểm thử hồi quy, tenant isolation và build; việc dời UAT người dùng không được hiểu là bỏ kiểm thử kỹ thuật.
- Quyết định này không cho phép deploy production. Chỉ UAT/cutover sau khi baseline 02 có migration manifest, backup và rollback rõ ràng.

### 2026-08-26 — Khóa Business OS vNext staging baseline 01

- Mốc code dùng tag `business-os-vnext-staging-baseline-01`; điều kiện “không mở thêm module trước UAT” đã được quyết định mới cùng ngày thay thế, còn tag vẫn giữ nguyên làm mốc lịch sử.
- Database staging phải vượt read-only audit của migration 473 và 567–580; test Business OS, tenant isolation, CRM parity có xác thực, live smoke và frontend build đều phải PASS.
- Rollback code không chạy down migration và không xóa dữ liệu/audit UAT; route legacy được giữ làm fallback.
- UAT 3–5 hồ sơ thật chỉ bắt đầu sau khi có backup hoàn tất mới hơn schema freeze của baseline; PITR hiện chưa bật.
- Cổng tự động `npm run db:gate:business-os-uat` là điều kiện kỹ thuật bắt buộc; trạng thái `BLOCKED` không được bỏ qua để chạy UAT thật.
- Preflight `npm run uat:preflight:business-os` chỉ đọc số liệu tổng hợp, không xuất PII; dùng để xác định slot UAT còn thiếu nhưng không tự chọn hoặc sửa hồ sơ khách.
- Lệnh chuẩn để mở phiên là `npm run uat:readiness:business-os`; gate backup phải PASS trước khi preflight và phân công hồ sơ được thực hiện.
- Logic backup gate có unit test riêng cho `READY`, backup cũ/bằng schema freeze, backup chưa xác minh, migration thiếu và timestamp sai; kiểm thử gate/session hiện tại đạt **8/8**, toàn bộ Business OS đạt **31/31**.
- Khi gate `READY`, lệnh readiness mới được sinh biên bản phiên UAT cục bộ; manifest chỉ whitelist số liệu tổng hợp, commit/database/backup/migration và không đưa PII vào Git.
- Hồi quy commit `d71f8a2d`: Business OS **31/31**, tenant isolation PASS, frontend build exit code `0`; kỹ thuật đạt nhưng UAT thật vẫn `BLOCKED_BY_BACKUP`.
- Browser smoke chỉ đọc đạt **11/11** màn Business OS, không màn trắng, login redirect hoặc console error; localhost được trả về `/business-os` sau kiểm tra.
- Trình tự “sau UAT mới mở lát cắt Mua hàng/Tài chính” đã được quyết định mới cùng ngày thay thế; lát cắt này là bước phát triển đầu tiên hướng tới baseline 02.
- Hồ sơ baseline: `docs/baseline/BUSINESS_OS_VNEXT_STAGING_BASELINE_01.md`.

### 2026-08-26 — Đưa Project Cockpit vào cùng Business OS shell

- Route chuẩn của chi tiết Project là `/business-os/operations/projects/:id`; bấm Project từ Portfolio không còn đổi sang sidebar Quản lý cũ.
- `company_id` của workspace được giữ xuyên suốt; Project liên công ty phải ghi rõ công ty đang xem và đơn vị thực hiện.
- Khi đổi công ty ở màn chi tiết, hệ thống quay về Portfolio của công ty mới thay vì cố mở cùng Project ngoài ngữ cảnh.
- Route `/management/production-overview/:id` và hồ sơ nguồn vẫn được giữ làm đường rollback trong staging.

### 2026-08-26 — Chuẩn hóa hồ sơ Phát sinh & Thay đổi của Project

- Dùng `project_incidents` làm System of Record và chỉ thêm migration additive 580; không tạo kho hồ sơ phát sinh song song.
- Ba trường bắt buộc khi tạo là Loại phát sinh, Tiêu đề và Nguyên nhân. Các trường theo ngữ cảnh gồm owner, giai đoạn, bằng chứng, ảnh hưởng chi phí/tiến độ, bên chịu chi phí, liên kết chứng từ và yêu cầu phê duyệt.
- Hồ sơ yêu cầu phê duyệt không được đóng khi còn chờ quyết định; duyệt/từ chối cần quyền quản trị vận hành và được ghi activity/audit.
- Phát sinh cao/nghiêm trọng chưa xử lý trở thành blocker của đúng macro phase; khi đóng hồ sơ, blocker phát sinh tự được loại khỏi Project health.
- UAT staging tại Vạn Phú Thành đã chạy thành công chu trình tạo → phê duyệt → đóng hồ sơ; hồ sơ kiểm thử được giữ lại với tiền tố `[UAT]` để bảo toàn audit.

### 2026-08-26 — Chọn cải tổ cuốn chiếu thay cho sửa vá hoặc viết lại toàn bộ

- Giữ dữ liệu lõi và business rules hiện hữu; không tạo hệ thống song song và không chuyển đổi big-bang.
- Ưu tiên đầu tiên là sửa ngữ cảnh công ty, truy vấn lệch schema và thống nhất KPI/read model trước khi thiết kế lại sâu các module.
- Thứ tự cải tổ: Dự án/Công việc → Vận hành → CRM → Mua hàng/Tài chính → Báo cáo/AI → UAT cutover.
- Chi tiết quyết định: `docs/adr/0010-progressive-business-os-modernization.md`.

### 2026-08-26 — Chốt lộ trình sau khi hoàn thành tuyến Sales và After-sales

- Ưu tiên trước mắt là UAT 3–5 hồ sơ thật tại một công ty, bao phủ hai lộ trình thiết kế, hai hình thức lắp đặt và một tình huống sau bán.
- Vertical slice tiếp theo là Mua hàng → Chi phí theo Dự án → Hóa đơn/Thanh toán → Công nợ; không mở đồng loạt các màn hình rời rạc.
- Sau khi dữ liệu tài chính vận hành ổn định mới hoàn thiện Dashboard điều hành và AI Agent có kiểm soát.
- Blueprint chỉ được dùng để nhân bản sang công ty thứ hai sau khi pilot đạt nghiệm thu; chưa deploy production ở giai đoạn này.

### 2026-08-26 — Đưa phát sinh và tài chính Project vào lộ trình hiện hữu

- Không mở một workstream riêng và không thay đổi thứ tự ưu tiên đã chốt.
- UAT Project bổ sung tình huống phát sinh có approval và audit; phần này đi cùng Project Cockpit/Vận hành.
- Giai đoạn Mua hàng → Chi phí → Công nợ bổ sung phát sinh thương mại, read model P&L/dòng tiền/dự báo và giữ Finance làm System of Record.
- Báo cáo và AI chỉ sử dụng dữ liệu tài chính sau khi chứng từ nguồn, tenant scope và khả năng drill-down đạt nghiệm thu.
- Chi tiết nguyên tắc: `docs/adr/0014-project-change-finance-profitability.md`.

### 2026-08-26 — After-sales tách khỏi Sales: CSKH và Bảo hành

- Sales kết thúc tại bàn giao; `customer_after_sales_v1` quản lý quan hệ sau bán theo Project để case bảo hành không mở lại Deal.
- Tự sinh lịch CSKH 7/30/90 ngày trong `crm_tasks`; case bảo hành có SLA, transition, kết quả và event ledger riêng.
- Chỉ đóng After-sales khi không còn case và task mở; tenant/company guard áp dụng cho cả đọc và ghi.
- Chi tiết quyết định: `docs/adr/0009-business-os-after-sales-customer-care-warranty.md`.

### 2026-08-26 — Sản xuất → Sẵn sàng giao → VC/LĐ → Hoàn tất bàn giao

- Không tạo module hoặc trạng thái lắp đặt song song: dùng request bàn giao SX, thẻ comment tương tác, Project và Kanban VC/LĐ thật.
- Sale chọn công ty/lịch là mốc bắt đầu VC/LĐ; nhánh nội bộ đóng bằng cột Logistics Hoàn thành, nhánh thuê ngoài đóng bằng sự kiện Lắp đặt đã liên kết với thẻ bàn giao.
- Event chống lặp theo thẻ bàn giao/Project; lifecycle chỉ theo đúng Project chính của process.
- Sửa bộ lọc enum khi tự đóng task/assignment ở cột hoàn thành để không còn để sót công việc do truy vấn sai kiểu.
- Chi tiết quyết định: `docs/adr/0008-business-os-production-installation-handover.md`.

### 2026-08-26 — Đơn hàng xác nhận → Dự án → Bàn giao Sản xuất

- Báo giá được chấp nhận không còn tạo Project sớm; chỉ Đơn hàng `confirmed` mới khởi tạo/liên kết Dự án thật.
- `projects` tiếp tục là System of Record; kernel chỉ lưu milestone, actor và reference.
- Stage Sản xuất chỉ mở sau API bàn giao hiện hữu vượt quyền Sale, task `sx_*`, công ty xưởng và lịch dự kiến.
- Process cũ ở `order` có đơn xác nhận + Project được reconcile an toàn; ngoài pilot vẫn chạy legacy.
- Chi tiết quyết định: `docs/adr/0007-business-os-order-project-production.md`.

### 2026-08-26 — Báo giá → Thương lượng → Sẵn sàng đặt hàng → Đơn hàng

- `quotations` và `orders` tiếp tục là System of Record; kernel chỉ giữ lifecycle và reference.
- Báo giá gửi đi mở Thương lượng; khách chấp nhận mở gate Sẵn sàng đặt hàng; chỉ đơn hàng thật mới chuyển process sang Đơn hàng.
- Không cho chọn thủ công `converted`; không cho tạo đơn từ báo giá chưa chấp nhận; process chỉ tiến về phía trước.
- Retry API chuyển đơn trả đơn hiện có; unique partial index chống trùng cả khi request đồng thời và event lifecycle chống lặp theo chứng từ + target stage.
- Chi tiết quyết định: `docs/adr/0006-business-os-negotiation-order.md`.

### 2026-08-26 — Nối Design hoàn tất sang Báo giá CRM thật

- `quotations` tiếp tục là System of Record; Business OS chỉ giữ lifecycle timestamp và tham chiếu báo giá đầu tiên.
- Chỉ tạo báo giá thành công mới chuyển `design_completed → quotation`; mở form không làm thay đổi process.
- Adapter kiểm tra Deal, company, pilot và stage; event dùng idempotency theo quotation ID.
- Lỗi projection không rollback chứng từ thật; luồng legacy ngoài pilot không bị chặn.
- Auto-link Deal của Báo giá được giới hạn cùng `company_id`.
- Chi tiết quyết định: `docs/adr/0005-business-os-quotation-start.md`.

### 2026-08-26 — Lộ trình linh hoạt cho khách hàng đã có thiết kế

- Tại Deal, người dùng chọn quy trình đầy đủ hoặc nhánh kiểm tra thiết kế khách cung cấp.
- Không bắt khách làm lại thiết kế, nhưng vẫn bắt buộc kiểm tra file, kỹ thuật/kích thước và xác nhận đủ dữ liệu trước Báo giá.
- `workflow_path` và lifecycle timestamp được ghi trên process instance; KPI tách hai nhánh và không giả lập mốc Khảo sát.
- Chi tiết quyết định: `docs/adr/0004-flexible-design-intake-routing.md`.

### 2026-08-25 — Deal → Khảo sát → Thiết kế

- Mở rộng cùng Sales process kernel; không tạo bản sao Deal hoặc nguồn task thứ hai.
- Mỗi stage materialize task vào `crm_tasks`, có SLA riêng và gate dựa trên trạng thái, minh chứng, quick verdict.
- Escalation được chống lặp theo process instance + stage + level + người nhận.
- KPI đọc Deal thật và lifecycle timestamp trong process instance.
- Chi tiết quyết định: `docs/adr/0003-business-os-deal-survey-design.md`.

### 2026-08-25 — Qualification task template, SLA escalation và KPI phễu

- Task template là cấu hình Business OS theo company/process/stage nhưng task thực thi vẫn nằm duy nhất trong `crm_tasks`.
- Dùng source key + unique index để start Qualification/idempotency gọi lặp không tạo task trùng.
- SLA dùng business calendar; cảnh báo chỉ materialize notification nội bộ và có ledger chống lặp.
- KPI funnel tính từ Lead, process instance và event/audit thật; không dùng số liệu demo.
- Mỗi lần publish automation có version bất biến và rollback tạo version mới.
- Chi tiết quyết định: `docs/adr/0002-business-os-qualification-task-sla-kpi.md`.

### 2026-08-25 — Dynamic Custom Fields dạng sidecar

- Không ALTER TABLE `crm_leads` theo từng trường; dùng definition/value sidecar scoped theo company/process/stage.
- Hỗ trợ sáu kiểu dữ liệu có validation backend: text, textarea, number, date, select và boolean.
- Stage Contract vẫn là nguồn xác định Bắt buộc / Tùy chọn / Ẩn cho cả trường chuẩn và trường tùy biến.
- Xóa trường là soft-delete, giá trị cũ được giữ; mỗi thay đổi contract có version và rollback tạo version mới.
- Chi tiết quyết định: `docs/adr/0001-business-os-dynamic-custom-fields.md`.

### 2026-08-25 — Stage Contract theo công ty

- Không bắt buộc đồng loạt tám thông tin Qualification.
- Áp dụng mặc định 4 bắt buộc + 4 tùy chọn.
- Cho phép quản trị viên cấu hình Bắt buộc / Tùy chọn / Ẩn.
- Khóa ba trường lõi: khách hàng, khu vực và người chịu trách nhiệm.
- Cấu hình được lưu riêng theo company và không xóa dữ liệu Lead cũ.

### 2026-08-25 — Pilot dữ liệu thật

- Chọn Công ty TNHH Bếp Vạn Phú Thành làm công ty staging duy nhất.
- Mở toàn bộ workspace theo gateway nhưng chỉ Sales có process gate mới.
- Kiểm thử với một công ty trước khi nhân rộng và deploy.

### 2026-08-25 — Kiến trúc Business OS

- Phát triển theo chuỗi Company → Department → Process → Stage → Record → Task → SLA → KPI → Dashboard → AI Agent.
- Giữ một nguồn dữ liệu nghiệp vụ và triển khai từng vertical slice.

### 2026-08-26 — Vận hành thống nhất theo Project

- Project là đơn vị hàng đợi và đơn vị KPI duy nhất cho Sản xuất → Vận chuyển → Lắp đặt; Deal chỉ cung cấp ngữ cảnh thương mại.
- `operations_kpi_v1` khử trùng Project, dùng cùng một tenant/company scope cho KPI, danh sách, chi tiết và task.
- Phạm vi vận hành bao gồm Project sở hữu, Project Logistics và Project liên kết từ Lead/Deal thương mại khi xưởng khác thực thi.
- Business OS dùng `/api/management/operations-queue`; không tạo bảng trạng thái, Project hoặc task song song.
- Chi tiết quyết định: `docs/adr/0012-operations-unified-project-read-model.md`.
