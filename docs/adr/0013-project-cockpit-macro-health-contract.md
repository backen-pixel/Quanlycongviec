# ADR-0013 — Project Cockpit và hợp đồng sức khỏe Project xuyên suốt vận hành

- **Trạng thái:** Accepted
- **Ngày:** 2026-08-26
- **Phạm vi:** Business OS đa công ty; triển khai staging trước tại Công ty TNHH Bếp Vạn Phú Thành
- **Liên quan:** ADR-0010, ADR-0011, ADR-0012

## Ngữ cảnh

Operations Unified đã chuyển đơn vị quản lý từ Deal sang Project, nhưng màn chi tiết hiện tại vẫn nghiêng về Sản xuất. Quản lý cần nhìn một Project xuyên suốt các bộ phận và biết ngay nguyên nhân rủi ro nằm ở đâu, thay vì mở từng module rồi tự ghép thông tin.

Pipeline xưởng hiện hữu của một số công ty còn lẫn các trạng thái tài chính như Công nợ hoặc Đã thu tiền. Các trạng thái này làm sai nghĩa tiến độ Sản xuất và khiến việc phân tích nguyên nhân trễ không đáng tin cậy.

## Quyết định

1. Màn **Vận hành** là Project Portfolio mặc định: hiển thị toàn bộ Project trong phạm vi công ty, sức khỏe tổng thể, macro phase hiện tại, deadline, owner, blocker và rủi ro.
2. Bấm vào mã Project luôn mở **Tổng quan Project** trước, không mở thẳng tab Sản xuất, Deal hoặc danh sách task.
3. Project Cockpit dùng chuỗi macro chuẩn:

   **Thiết kế → Thu mua → Sản xuất → KCS → Kho/Đóng gói → Giao nhận → Lắp đặt → Nghiệm thu**

4. Mỗi macro phase phải trả về cùng một hợp đồng sức khỏe:
   - `progress_pct`: đã hoàn thành bao nhiêu phần trăm;
   - `missing_requirements`: còn thiếu thông tin, vật tư, hồ sơ hoặc evidence gì;
   - `owner`: cá nhân/đội chịu trách nhiệm hiện tại;
   - `deadline`: hạn của chính chặng đó;
   - `blockers`: vấn đề đang chặn và nguồn phát sinh;
   - `risk`: mức rủi ro kèm lý do có thể giải thích.
5. Trạng thái chi tiết của từng công ty/xưởng được map vào macro phase; không dùng tên stage tự do làm chuẩn báo cáo toàn hệ thống.
6. **Công nợ, Thu tiền, Đã thu tiền, Hóa đơn** là milestone/KPI của Finance. Chúng không phải stage Sản xuất và không được tính vào phần trăm hoàn thành Sản xuất.
7. Tài chính vẫn là một facet của Project Cockpit để quản lý xem, nhưng không làm thay đổi macro phase vận hành trừ khi một quy tắc nghiệp vụ công khai tạo blocker, ví dụ chưa đủ điều kiện tài chính để giao hàng.
8. AI giai đoạn đầu chỉ đọc hợp đồng sức khỏe Project để tổng hợp Project có nguy cơ trễ, chặng gây trễ và bằng chứng. AI không tự chuyển stage hoặc tự đóng blocker.
9. Read model phải giữ tenant/company scope của ADR-0012 và đọc từ các System of Record hiện hữu; không sao chép Project, task, vật tư hay trạng thái pipeline sang bảng vận hành thứ hai.

## Phương án đã xét

1. Giữ màn chi tiết riêng cho từng module — quen thuộc nhưng quản lý phải tự ghép dữ liệu và AI không có một ngữ cảnh Project đáng tin cậy.
2. Dùng pipeline Sản xuất làm toàn bộ vòng đời Project — nhanh nhưng trộn nghiệp vụ liên phòng ban và tiếp tục lẫn Finance vào Sản xuất.
3. Project Cockpit + macro health contract — được chọn vì thống nhất trải nghiệm, báo cáo, SLA và đầu vào AI nhưng vẫn giữ pipeline chi tiết của từng đơn vị.

## Hệ quả

- Route chuẩn đã triển khai là `/business-os/operations/projects/:id`, dùng cùng Business OS shell và giữ ngữ cảnh `company_id`; route `/management/production-overview/:id` tiếp tục được giữ làm đường rollback trong staging.
- Cần bảng mapping stage chi tiết → macro phase theo company/process variant, có kiểm tra cấu hình stage tài chính sai miền.
- Project Portfolio có thể lọc theo nguyên nhân rủi ro: Thu mua, Sản xuất, KCS, Kho, Giao nhận hoặc Lắp đặt.
- Dashboard và AI phải dùng cùng read model/hợp đồng; không tự tính một bộ KPI khác ở frontend.
- Không có migration hoặc thay đổi dữ liệu trong chính quyết định này.

## Rollback

- Giữ các route và màn module hiện tại làm đường quay lại trong staging.
- Read model mới là lớp đọc; rollback UI không xóa hoặc sửa dữ liệu Project/pipeline thật.

## Liên kết

- Blueprint: `docs/BUSINESS_OS_BLUEPRINT.md`
- Nhật ký quyết định: `docs/PROJECT_DECISION_LOG.md`
