# Kết quả UAT kỹ thuật — Business OS baseline 02

- Ngày chạy: `2026-08-28`
- Môi trường: Supabase staging `atcfpgxkgbszglrelfgr`
- Mốc xuất phát: `business-os-vnext-staging-baseline-02`
- Trạng thái: `TECHNICAL_UAT_PASS`
- Cutover/production: `BLOCKED_BY_POST_583_BACKUP_AND_BUSINESS_SIGNOFF`

Biên bản này ghi nhận kiểm thử kỹ thuật có kiểm soát. Nó không thay chữ ký nghiệm thu nghiệp vụ của người dùng cuối.

## Kết quả 6 kịch bản

| # | Kịch bản | Kết quả | Bằng chứng chính |
|---|---|---|---|
| 1 | Khách chưa có thiết kế | `PASS` | Qualification/Survey/Design có task, SLA, gate, timestamp, KPI và idempotency; fixture đã dọn sạch. |
| 2 | Khách đã có thiết kế | `PASS` | Đi `customer_design`, không tạo mốc khảo sát giả, Design Review chặn đúng điều kiện; fixture đã dọn sạch. |
| 3 | Project và vận hành nội bộ | `PASS` | Báo giá → Đơn hàng → Project → Sản xuất → Giao/Lắp → Hoàn tất; retry không tạo trùng; fixture đã dọn sạch. |
| 4 | Liên công ty và After-sales | `PASS` | Nhánh lắp đặt ngoài, CSKH 7/30/90, case bảo hành/SLA và close gate đạt; fixture đã dọn sạch. |
| 5 | Phát sinh, Mua hàng và Tài chính | `PASS` | Approval phát sinh, PO, hóa đơn/chi nhà cung cấp, hóa đơn/thu khách và `project_finance_v1` đạt; fixture đã dọn sạch. |
| 6 | Báo cáo, AI và Blueprint công ty thứ hai | `PASS` | `executive_intelligence_v1`, evidence/deep link, AI `read_recommend`, company scope/tenant guard, apply idempotent và không đổi số lượng giao dịch. |

Blueprint công ty thứ hai được giữ lại có chủ đích để tiếp tục UAT. Cấu hình có rollout ring `uat-secondary`; các hồ sơ giao dịch không bị sao chép.

## Lỗi tìm thấy và đã sửa

1. API tạo Hóa đơn ghi `payment_terms` nhưng schema staging thiếu cột, gây HTTP 500.
   - Sửa bằng migration additive `583_invoice_payment_terms.sql`; không sửa migration đã chạy.
   - Migration 583 đã áp dụng và verify trên staging; kịch bản số 5 chạy lại `PASS`.
2. Blueprint tạo phòng ban gặp unique constraint khi Company đã có ecosystem node ở trạng thái inactive.
   - `findSubsidiaryUnderDivision` nay tái sử dụng node cũ để kích hoạt lại thay vì insert trùng.
   - Apply lặp không tạo phòng ban trùng; toàn bộ phòng ban materialized đã đồng bộ thành ecosystem unit active.
3. Gate audit còn hard-code 17 migration.
   - Đã nâng manifest lên 18 capability và audit staging trả `all_applied=true`.

## Hồi quy sau sửa lỗi

| Cổng | Kết quả |
|---|---|
| Business OS unit/contract | `PASS 37/37` |
| Tenant isolation | `PASS` |
| CRM authenticated parity | `PASS 100/100`; JWT chỉ tồn tại trong memory |
| Frontend production build | `PASS`; 10.289 module, chỉ còn cảnh báo chunk đã biết |
| Migration audit | `PASS 18/18`; `473`, `567`–`583` |
| Browser Báo cáo | `PASS`; dữ liệu thật, độ phủ tài chính và deep link tải thành công |
| Browser AI Agent Center | `PASS`; recommendation có evidence và cần người duyệt |

## Recovery gate còn thiếu

- Schema freeze hậu-UAT: `2026-08-28T14:26:19.498Z`.
- Backup managed mới nhất: `2026-08-27T22:13:42.536Z`, id `1499151552`.
- Backup này bảo vệ baseline 02 nhưng cũ hơn migration 583; vì vậy chưa được dùng để mở cutover cho bản vá UAT.
- Supabase Management API chỉ cho liệt kê/restore backup; tài liệu chính thức hướng dẫn dùng CLI `db dump` nếu cần tự tạo logical backup. Máy hiện tại chưa có Supabase CLI/`pg_dump` và không có DB URL/password trong workspace.

Điều kiện tiếp theo duy nhất để tạo baseline staging mới là có backup `COMPLETED` mới hơn schema freeze trên, chạy lại gate, rồi anh xác nhận nghiệp vụ. Không deploy production trước hai điều kiện này.

## Lệnh tái hiện

```bash
cd backend
node tests/business-os-deal-workflow-staging.js --confirm VPT
node tests/business-os-flexible-design-staging.js --confirm VPT
node tests/business-os-quotation-staging.js --confirm VPT
node tests/business-os-project-finance-staging.js --confirm VPT
node tests/business-os-executive-blueprint-staging.js --confirm VPT
npm run test:business-os
npm run test:tenant
npm run test:crm-split:staging
npm run db:audit:business-os
cd ../frontend && npm run build
```
