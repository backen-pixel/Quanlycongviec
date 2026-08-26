# Inventory thay đổi — Business OS vNext baseline 01

## Backend

- Business OS overview, blueprint, stage contract, dynamic custom fields, automation, SLA escalation và KPI.
- Sales lifecycle từ Lead đến Qualification, Deal, Khảo sát/Thiết kế, Báo giá, Đơn hàng và Project.
- Operations unified read model, Project health 8 chặng và project change read model/contract.
- Handover giữa Sản xuất, Logistics/Lắp đặt và After-sales.
- Tenant/company guards cho tham số đơn, danh sách và ngữ cảnh cross-company hợp lệ.
- CRM split manifest/parity, commercial documents, task/read models và API route registration.
- Read-only baseline audit: `backend/scripts/audit-business-os-baseline.js`.

## Frontend

- Business OS shell và các workspace Dashboard, Work, Sales, Operations, Purchasing, Finance, Customers, Reports, Knowledge, AI và Process Studio.
- Lead Quick Create/Detail theo Stage Contract; editor custom fields và automation.
- Sales Deal workflow và hai nhánh nhận đầu vào thiết kế.
- Operations Portfolio và Project Cockpit trong cùng shell Business OS.
- Project Cockpit hiển thị 8 macro phase, blocker, owner, deadline, phát sinh/thay đổi và phê duyệt.
- Blueprint control plane trong Platform Admin; route legacy được giữ làm fallback.

## Database

Baseline chỉ chứa migration additive, không sửa migration đã chạy:

```text
473_business_os_sales_qualification_pilot.sql
567_business_blueprint_control_plane.sql
568_business_os_stage_contracts.sql
569_business_os_dynamic_custom_fields.sql
570_business_os_qualification_automation.sql
571_business_os_deal_survey_design.sql
572_business_os_flexible_design_intake.sql
573_business_os_quotation_start.sql
574_business_os_negotiation_order.sql
575_orders_quotation_idempotency.sql
576_business_os_project_production.sql
577_business_os_production_installation.sql
578_business_os_after_sales.sql
579_logistics_customer_care_stage.sql
580_project_change_record_contract.sql
```

Mỗi migration có runner riêng trong `backend/scripts/run-migration-*.js`; audit baseline không gọi các runner này.

## Tests và tài liệu

- Unit/contract tests cho Blueprint, custom fields, automation, Deal workflow, commercial workflow, Operations, Project health/change và After-sales.
- Staging tests có fixture tự dọn cho từng vertical slice; không tự động chạy trong UAT người dùng thật.
- ADR `0001`–`0014`, Blueprint, implementation status, decision log, API document và hướng dẫn nghiệp vụ.

## File chủ động loại khỏi baseline commit

| Path | Lý do |
|---|---|
| `debug-fb4228.log` | Log chẩn đoán có dữ liệu hồ sơ; không phải source code. |
| `gcm-diagnose.log` | Log máy cục bộ. |
| `AGENTS.md.local-bak` | Bản sao cục bộ, không phải nguồn chuẩn. |
| `scripts/_catalog_extract/` | Dữ liệu trích xuất tạm. |
| `frontend/public/kitchen-preview/` | 319 ảnh/155,5 MB, không có tham chiếu từ frontend hiện hành. |
| `prisma/schema.prisma` | Prototype không được backend hiện hành tham chiếu; backend đang dùng Supabase/Postgres contract hiện tại. |
| `.env`, token, database dump | Secret/dữ liệu vận hành không được đưa vào Git. |

Các file loại trừ được giữ nguyên trên máy; baseline không xóa hoặc ghi đè thay đổi của người dùng.
