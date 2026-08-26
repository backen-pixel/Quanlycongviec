# ADR-0001: Dynamic Custom Fields dạng sidecar cho Business OS

- **Trạng thái:** Accepted
- **Ngày:** 2026-08-25
- **Người đề xuất:** Codex theo định hướng của anh Nguyễn Phạm Hùng
- **Liên quan:** Business OS vNext · Lead → Qualification → Deal

## Ngữ cảnh

Mỗi công ty cần tự thêm trường Qualification mà không yêu cầu ALTER TABLE `crm_leads` cho từng cấu hình. Trường mới phải tham gia Stage Contract, tenant scope, audit và rollback nhưng không được tạo bản sao Lead hoặc làm gián đoạn CRM hiện tại.

## Quyết định

Dùng hai bảng sidecar theo company:

1. `business_os_custom_field_definitions` lưu định nghĩa trường theo process/stage.
2. `business_os_custom_field_values` lưu phần mở rộng của record thật bằng `record_type + record_id`.

Stage Contract tiếp tục là nguồn xác định Bắt buộc / Tùy chọn / Ẩn. Mỗi lần publish contract tạo snapshot bất biến trong `business_os_stage_contract_versions`; rollback tạo version mới thay vì sửa lịch sử.

Chỉ hỗ trợ các kiểu có validation xác định: text, textarea, number, date, select và boolean. Xóa trường là soft-delete; giá trị cũ không bị xóa.

## Phương án đã xét

1. Thêm cột JSONB vào `crm_leads` — đơn giản nhưng gắn Business OS vào bảng CRM lõi và khó tái sử dụng cho domain khác.
2. ALTER TABLE cho từng trường — query thuận tiện nhưng không phù hợp cấu hình đa công ty và gây migration liên tục.
3. Bảng sidecar định nghĩa + giá trị — thêm một phép đọc nhưng cô lập, version được và không đổi schema CRM; được chọn.

## Hệ quả

- Core Lead vẫn nằm duy nhất trong `crm_leads`; sidecar chỉ chứa thuộc tính mở rộng.
- API backend chịu trách nhiệm tenant scope, validation, permission và audit.
- Readiness phải hợp nhất trường chuẩn với custom field trước khi cho chuyển bước.
- Overview cần batch-load giá trị custom để tránh N+1 query.
- Rollback contract không xóa định nghĩa hoặc giá trị custom.
- Rollback schema: ngừng dùng API/UI mới; chỉ drop ba bảng 569 khi đã xác nhận không cần dữ liệu tùy biến.

## Liên kết

- Spec: `docs/PROJECT_DECISION_LOG.md`
- Migration: `database/569_business_os_dynamic_custom_fields.sql`
