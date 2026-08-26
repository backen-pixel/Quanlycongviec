# ADR-0002: Qualification task template, SLA escalation và KPI phễu

- **Trạng thái:** Accepted
- **Ngày:** 2026-08-25
- **Người đề xuất:** Codex theo định hướng của anh Nguyễn Phạm Hùng
- **Liên quan:** Business OS vNext · Lead → Qualification → Deal

## Ngữ cảnh

Qualification cần sinh công việc, theo dõi SLA và đo KPI theo từng công ty. Hệ thống đã có `crm_tasks`, notification nội bộ, lịch giờ làm việc và process event ledger; nếu tạo thêm bảng task vận hành song song sẽ phá nguyên tắc một nguồn dữ liệu nghiệp vụ.

## Quyết định

1. Cấu hình task/SLA nằm trong `business_os_stage_automations` và `business_os_stage_task_template_items`, scoped theo `company_id + process_key + stage_key`.
2. Khi Lead bắt đầu Qualification, template được materialize vào `crm_tasks`; không tạo bảng task thứ hai.
3. Mỗi task lưu dấu vết Business OS bằng process/stage/item key. Unique index theo Lead và các khóa nguồn bảo đảm command gọi lặp không sinh task trùng.
4. Deadline task và SLA dùng cùng business calendar qua `addBusinessMinutes`.
5. Cảnh báo `at_risk` và `overdue` được ghi vào notification nội bộ. Ledger `business_os_sla_escalations` chống gửi lặp theo process instance, mức cảnh báo và người nhận. Worker không gọi email, Zalo, webhook hoặc mobile push.
6. KPI phễu được tính từ `crm_leads`, process instance và event/audit thật. Không ghi số demo và không tạo ledger KPI trùng chỉ để phục vụ dashboard.
7. Mỗi lần publish cấu hình tạo snapshot bất biến; rollback tạo version mới.

## Phương án đã xét

1. Dùng trực tiếp `crm_task_templates` theo pipeline stage — không phù hợp vì Qualification là stage của process kernel và không luôn trùng `crm_pipeline_stages`.
2. Tạo task riêng trong Business OS — dễ triển khai nhưng tạo nguồn công việc thứ hai; loại bỏ.
3. Lớp cấu hình Business OS materialize vào `crm_tasks` — giữ được scope/version và một nguồn task; được chọn.

## Hệ quả

- Task mới chỉ sinh cho Lead bắt đầu Qualification sau khi cấu hình có hiệu lực; task lịch sử không bị sửa.
- Company có thể đặt số task bằng 0, SLA riêng và quy tắc escalation riêng.
- Cron chạy 5 phút/lần, dùng leader lock khi Redis sẵn sàng và chỉ quét company đã có automation active.
- KPI funnel hiện phản ánh phạm vi record/process được overview tải; API trả rõ nguồn tính.
- Rollback code: tắt worker bằng `BUSINESS_OS_SLA_CRON_DISABLED=1`, bỏ UI/API mới. Rollback dữ liệu chỉ drop migration 570 sau khi đã sao lưu snapshot và xác nhận không còn task trace cần truy vết.
## Liên kết

- Migration: `database/570_business_os_qualification_automation.sql`
- Helper: `backend/src/helpers/businessOsQualificationAutomation.js`
- UAT: `backend/tests/business-os-qualification-automation-staging.js`
