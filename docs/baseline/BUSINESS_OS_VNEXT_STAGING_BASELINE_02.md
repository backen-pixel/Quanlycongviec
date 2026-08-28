# Business OS vNext — staging baseline 02

## Trạng thái

**Phạm vi code/schema theo lộ trình đã hoàn tất và đủ điều kiện bàn giao UAT có kiểm soát.**

Trạng thái hiện tại là `READY_FOR_USER_UAT`. Đây chưa phải production release; chỉ dùng cho staging và 6 kịch bản trong checklist 02.

## Năm câu hỏi bắt buộc

| Câu hỏi | Câu trả lời baseline 02 |
|---|---|
| Phiên bản nào? | Tag `business-os-vnext-staging-baseline-02` trên branch `codex/business-os-deal-survey-design`; commit được tra bằng `git rev-list -n 1 business-os-vnext-staging-baseline-02`. Feature cut cuối trước hồ sơ baseline là `bc7881a9`. |
| Database nào? | Supabase staging project ref `atcfpgxkgbszglrelfgr`, database `postgres`, PostgreSQL `17.6`, region `ap-south-1`. |
| Migration nào? | `473` và chuỗi `567`–`582`; audit staging lúc `2026-08-27T01:01:30.141Z` đạt đủ `17/17` capability. Migration đã chạy không bị sửa lại. |
| Test nào đã PASS? | Business OS `37/37`; tenant isolation PASS; CRM parity có xác thực `100/100`; live smoke PASS; frontend build PASS; browser smoke các module chính PASS. |
| Nếu lỗi quay về đâu? | Quay code/UI về tag baseline 01 hoặc commit feature đã định danh; giữ schema additive, không chạy down migration. Nếu dữ liệu hỏng, restore backup đã xác minh sang môi trường tách biệt và reconcile theo runbook 02. |

## Phạm vi đã đóng gói

- Sales linh hoạt: Lead → Qualification → Deal → Khảo sát/kiểm tra thiết kế → Báo giá → Thương lượng → Đơn hàng.
- Project và Công việc dùng System of Record hiện hữu, Project Cockpit 8 chặng và read model sức khỏe thống nhất.
- Vận hành: Sản xuất → KCS → Kho/Đóng gói → Giao nhận → Lắp đặt → Nghiệm thu → After-sales.
- Phát sinh Project có approval, evidence, ảnh hưởng chi phí/tiến độ và blocker.
- Mua hàng → PO gắn Project → nhận hàng → chi phí → hóa đơn/thanh toán nhà cung cấp → phải trả.
- Hóa đơn/thu tiền khách hàng, phải thu và `project_finance_v1` tách P&L, cashflow, forecast.
- Báo cáo và AI cùng đọc `executive_intelligence_v1`; AI chỉ đọc/khuyến nghị và trả evidence/deep link.
- Blueprint có version theo tenant/company; override từng công ty được giữ khi nâng version, không sao chép dữ liệu giao dịch.

## Migration manifest

| Migration | Capability | Staging |
|---|---|---|
| 473 | Process instances + event ledger | PASS |
| 567 | Blueprint control plane | PASS |
| 568 | Stage contracts | PASS |
| 569 | Dynamic custom fields | PASS |
| 570 | Qualification automation + SLA | PASS |
| 571 | Deal → Khảo sát → Thiết kế | PASS |
| 572 | Lộ trình thiết kế linh hoạt | PASS |
| 573 | Bắt đầu Báo giá | PASS |
| 574 | Thương lượng + Đơn hàng | PASS |
| 575 | Idempotency Báo giá → Đơn hàng | PASS |
| 576 | Đơn hàng → Project → Sản xuất | PASS |
| 577 | Sản xuất → Giao nhận → Lắp đặt | PASS |
| 578 | After-sales / CSKH / bảo hành | PASS |
| 579 | Logistics → CSKH | PASS |
| 580 | Phát sinh & Thay đổi Project | PASS |
| 581 | Project procurement + finance bridge | PASS |
| 582 | Company-scoped Blueprint installation | PASS |

## Cổng mở UAT đã đạt

- Audit lúc `2026-08-28T12:21:06.927Z`: migration `17/17`, `all_applied=true`.
- Backup `COMPLETED` mới nhất: `2026-08-27T22:13:42.536Z`, id `1499151552`, mới hơn schema freeze `2026-08-27T01:01:30.141Z`.
- `uat_gate.status="READY"`; WAL-G bật, PITR chưa bật.
- CRM parity chạy trên backend Node độc lập không watcher: nhóm A `50/50`, nhóm B `50/50`.

Lệnh quyết định mở UAT:

```bash
cd backend
npm run uat:readiness:business-os
```

Lệnh chỉ sinh biên bản khi migration/backup đạt, tag baseline 02 tồn tại và trỏ đúng commit đang chạy, sau đó preflight read-only hoàn tất. Biên bản readiness không thay thế nghiệm thu nghiệp vụ của anh.

## Tài liệu liên quan

- Hồi quy: [`BUSINESS_OS_UAT_REGRESSION_02.md`](./BUSINESS_OS_UAT_REGRESSION_02.md)
- Rollback/backup: [`BUSINESS_OS_ROLLBACK_BACKUP_RUNBOOK_02.md`](./BUSINESS_OS_ROLLBACK_BACKUP_RUNBOOK_02.md)
- Checklist UAT: [`BUSINESS_OS_UAT_CHECKLIST_02.md`](./BUSINESS_OS_UAT_CHECKLIST_02.md)
- Preflight UAT: [`BUSINESS_OS_UAT_PREFLIGHT_02.md`](./BUSINESS_OS_UAT_PREFLIGHT_02.md)
- Hướng dẫn vận hành UAT: [`BUSINESS_OS_UAT_OPERATOR_GUIDE_02.md`](./BUSINESS_OS_UAT_OPERATOR_GUIDE_02.md)
