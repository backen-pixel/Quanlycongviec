# Baseline staging Business OS

Thư mục này là hồ sơ kiểm soát phiên bản staging. Mỗi baseline phải trả lời được: phiên bản code, database, migration, test đã chạy và đường phục hồi.

- [`BUSINESS_OS_VNEXT_STAGING_BASELINE_01.md`](./BUSINESS_OS_VNEXT_STAGING_BASELINE_01.md): manifest mốc chuẩn.
- [`BUSINESS_OS_CHANGE_INVENTORY_01.md`](./BUSINESS_OS_CHANGE_INVENTORY_01.md): phạm vi thay đổi được đóng gói.
- [`BUSINESS_OS_ROLLBACK_BACKUP_RUNBOOK_01.md`](./BUSINESS_OS_ROLLBACK_BACKUP_RUNBOOK_01.md): rollback code, backup và phục hồi dữ liệu.
- [`BUSINESS_OS_UAT_CHECKLIST_01.md`](./BUSINESS_OS_UAT_CHECKLIST_01.md): kịch bản 3–5 hồ sơ thật.
- [`BUSINESS_OS_UAT_PREFLIGHT_01.md`](./BUSINESS_OS_UAT_PREFLIGHT_01.md): snapshot coverage không PII và các slot UAT còn thiếu.
- [`BUSINESS_OS_UAT_OPERATOR_GUIDE_01.md`](./BUSINESS_OS_UAT_OPERATOR_GUIDE_01.md): một lệnh mở UAT và quy tắc dừng/tiếp tục.
- [`BUSINESS_OS_UAT_REGRESSION_01.md`](./BUSINESS_OS_UAT_REGRESSION_01.md): bằng chứng test/build mới nhất và trạng thái `BLOCKED_BY_BACKUP`.

## Baseline 02 — sẵn sàng UAT

- [`BUSINESS_OS_VNEXT_STAGING_BASELINE_02.md`](./BUSINESS_OS_VNEXT_STAGING_BASELINE_02.md): manifest sau khi hoàn tất Mua hàng/Tài chính, Báo cáo/AI và Blueprint đa công ty.
- [`BUSINESS_OS_UAT_REGRESSION_02.md`](./BUSINESS_OS_UAT_REGRESSION_02.md): bằng chứng hồi quy, CRM parity và recovery gate.
- [`BUSINESS_OS_ROLLBACK_BACKUP_RUNBOOK_02.md`](./BUSINESS_OS_ROLLBACK_BACKUP_RUNBOOK_02.md): rollback/restore cho chuỗi migration đến 582.
- [`BUSINESS_OS_UAT_CHECKLIST_02.md`](./BUSINESS_OS_UAT_CHECKLIST_02.md): 6 kịch bản UAT xuyên toàn hệ thống.
- [`BUSINESS_OS_UAT_PREFLIGHT_02.md`](./BUSINESS_OS_UAT_PREFLIGHT_02.md): snapshot aggregate read-only/PII-safe để phân công hồ sơ.
- [`BUSINESS_OS_UAT_OPERATOR_GUIDE_02.md`](./BUSINESS_OS_UAT_OPERATOR_GUIDE_02.md): lệnh readiness, điều kiện dừng và quy tắc phân công.
