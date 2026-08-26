# Business OS vNext — staging baseline 01

## Trạng thái

**Code và schema đã khóa; chưa mở UAT hồ sơ thật cho tới khi có backup hoàn tất sau thời điểm schema freeze.**

Baseline này không phải production release và không cho phép nhân bản sang công ty thứ hai. Công ty pilot vẫn là Công ty TNHH Bếp Vạn Phú Thành.

## Năm câu hỏi bắt buộc

| Câu hỏi | Câu trả lời baseline 01 |
|---|---|
| Phiên bản nào? | Tag `business-os-vnext-staging-baseline-01` trên branch `codex/business-os-deal-survey-design`. Commit được tra bằng `git rev-list -n 1 business-os-vnext-staging-baseline-01`. Parent trước baseline: `9cab77fa424015475225c9e00a5c295694ef118c`. |
| Database nào? | Supabase staging đang cấu hình tại project ref `atcfpgxkgbszglrelfgr`, database `postgres`, PostgreSQL `17.6`, region `ap-south-1`. Không phải production target của baseline này. |
| Migration nào? | `473_business_os_sales_qualification_pilot.sql` và chuỗi `567`–`580`; cả 15 capability signature đều có trên staging lúc `2026-08-26T10:21:23.977Z`. |
| Test nào đã PASS? | Business OS unit/contract `23/23`; tenant isolation PASS; CRM route + HTTP parity có JWT `100/100`; Business OS live smoke PASS; frontend production build PASS. |
| Nếu lỗi quay về đâu? | Quay code/UI về tag này hoặc entry point legacy; không chạy down migration. Nếu có hỏng dữ liệu, phục hồi bản backup đã xác minh vào môi trường tách biệt rồi reconcile theo runbook. |

## Migration audit

Lệnh chuẩn:

```bash
cd backend
npm run db:audit:business-os
```

Audit là read-only, không tự chạy hay sửa migration.

| Migration | Capability kiểm chứng | Staging |
|---|---|---|
| 473 | Process instances + event ledger | PASS |
| 567 | Blueprint control plane | PASS |
| 568 | Stage contracts | PASS |
| 569 | Dynamic custom fields | PASS |
| 570 | Automation, task template, SLA | PASS |
| 571 | Deal → Khảo sát → Thiết kế | PASS |
| 572 | Lộ trình khách có/không có thiết kế | PASS |
| 573 | Bắt đầu Báo giá | PASS |
| 574 | Thương lượng → Đơn hàng | PASS |
| 575 | Idempotency Báo giá → Đơn hàng | PASS |
| 576 | Đơn hàng → Project → Sản xuất | PASS |
| 577 | Sản xuất → Giao nhận → Lắp đặt | PASS |
| 578 | After-sales / CSKH / bảo hành | PASS |
| 579 | Logistics chuyển sang CSKH | PASS |
| 580 | Hồ sơ Phát sinh & Thay đổi Project | PASS |

## Test evidence

| Cổng chất lượng | Lệnh | Kết quả ngày 26/08/2026 |
|---|---|---|
| Business OS unit/contract | `cd backend && npm run test:business-os` | PASS `23/23` |
| Tenant isolation | `cd backend && npm run test:tenant` | PASS |
| CRM split + authenticated HTTP parity | `cd backend && npm run test:crm-split:all` với JWT test tạm | PASS `100/100` |
| Business OS live read-only | `cd backend && node tests/business-os-live-smoke.js` | PASS; 200 records; bốn automation v1, mỗi stage 3 task template |
| Frontend production build | `cd frontend && npm run build` | PASS; Vite hoàn tất trong 1 phút 49 giây |

Build còn cảnh báo kích thước một số chunk và mixed static/dynamic import. Đây là nợ hiệu năng, không phải lỗi build và không chặn UAT nghiệp vụ.

## Backup gate

Audit Management API lúc `2026-08-26T10:21:23.977Z`:

- WAL-G enabled: `true`.
- PITR enabled: `false`.
- Có 7 backup trạng thái `COMPLETED`.
- Backup hoàn tất gần nhất: `2026-08-25T22:13:36.512Z`, id `1479609075`.

Backup gần nhất có trước thời điểm schema freeze của chuỗi migration hiện hành, do đó **không dùng nó làm pre-UAT recovery point**. Chỉ bắt đầu UAT hồ sơ thật khi thỏa một trong hai điều kiện:

1. `npm run db:audit:business-os` hiển thị một backup `COMPLETED` có thời gian sau `2026-08-26T10:21:23.977Z`; hoặc
2. có logical dump đã mã hóa, lưu ngoài Git và đã thử restore vào database tách biệt.

## Phạm vi đã khóa

- Business Blueprint và cài đặt theo tenant/company.
- Business OS shell, Dashboard, Process Studio và Sales vertical slice.
- Lead → Qualification → Deal với trường bắt buộc/tùy chọn/cấu hình động.
- Hai lộ trình thiết kế; Báo giá → Thương lượng → Đơn hàng.
- Project → Sản xuất → KCS → Kho/Đóng gói → Giao nhận → Lắp đặt → Nghiệm thu.
- Project Portfolio/Cockpit, project health, phát sinh/thay đổi, approval và read model P&L nền tảng.
- After-sales, CSKH và bảo hành.
- Tenant/company guard, CRM route parity và API documentation liên quan.

Không mở thêm module mới trong baseline này. Lát cắt kế tiếp chỉ bắt đầu sau UAT: **Mua hàng → Chi phí Project → Hóa đơn/Thanh toán → Công nợ**.

## Tài liệu liên quan

- Inventory: [`BUSINESS_OS_CHANGE_INVENTORY_01.md`](./BUSINESS_OS_CHANGE_INVENTORY_01.md)
- Rollback/backup: [`BUSINESS_OS_ROLLBACK_BACKUP_RUNBOOK_01.md`](./BUSINESS_OS_ROLLBACK_BACKUP_RUNBOOK_01.md)
- UAT: [`BUSINESS_OS_UAT_CHECKLIST_01.md`](./BUSINESS_OS_UAT_CHECKLIST_01.md)
