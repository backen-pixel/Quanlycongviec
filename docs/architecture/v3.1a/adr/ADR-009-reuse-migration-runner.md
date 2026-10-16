# ADR-009 — Dùng lại runner, baseline schema có provenance

- Trạng thái: **ASSUMPTION_PENDING_FOUNDER**, technical proposal theo D5, không chạy vào shared/live DB.
- Nhiệm vụ: BOS-V31A-ARCH-01; ngày **16/10/2026, Asia/Ho_Chi_Minh**.

## Bối cảnh và lựa chọn

W0 A2 xác minh database/ có738 SQL gốc,722 forward được runner chọn,11 rollback/5 unnumbered bỏ qua,68 nhóm trùng số; còn source SQL ngoài selector ở backend/migrations và backend/supabase. Đây là count source SHA, không applied history. [Manifest](../inventory/migration-manifest.json) giữ selector/checksum.

Runner đã có: backend/scripts/migrate.js, scripts/lib/migrationPlan.js, package scripts db:status/db:apply/db:baseline, migrationPlan.test.js và CI db-migrations.yml. Entry point nạp .env/chọn API hoặc DB theo credential sẵn; “status” không tự bảo đảm không đọc secret/gọi thật.

| Phương án | Lợi ích | Đánh đổi |
|---|---|---|
| A — Framework migration mới ngay | Standard tooling | Chuyển history/ownership/dependency và chi phí chưa chứng minh |
| B — Replay mọi file theo số rồi stamp | Ít thiết kế | Root set thiếu base schema, có repair/data SQL/duplicate prefixes |
| C — Reuse planner/runner, curated baseline + isolated harness/guards | Giữ history/CI/checksum, không tool trùng | Cần dependency manifest/source snapshot và tái lập |

Chọn **C** theo giả định D5. Không cài DB/framework/service để khớp sơ đồ.

## Baseline và guard đề xuất

1. Snapshot catalog live bằng **role read-only đã xác minh**, không row khách: columns/types/defaults/keys/indexes/RLS/grants/functions/triggers/extensions/history và server version. Không có role thì UNKNOWN; không admin/service-role fallback hoặc thêm role live.
2. Baseline schema có provenance/hash, tách Supabase/auth/role/extension prerequisites, domain DDL và data migrations. Helper bootstrap/history stamp/backup file không thay schema đã dựng được.
3. Reuse pure planner để full filename/checksum/order; bổ sung explicit dependency manifest/guarded local target trong harness/gói xây. Không silent retarget runtime env. **baseline --upto chỉ stamp ledger, không chạy SQL dựng schema**; stamp sau comparison có evidence.
4. DB tạm dùng PGDATA/port/identity mới, task marker, no outbound; không data directory/port/socket/service thật. Xác minh resolved target trước create/stop/remove. Shared/dev/staging/production không chạy migration trong đợt này.
5. Từ empty catalog apply curated baseline rồi additive M1 schema ở DB tạm; catalog diff version-aware với live snapshot. Root báo LOCAL_BASELINE_CHECK riêng, gồm lệnh/target/hash/log/diff/reviewer; failed scratch replay không phải full baseline đã hoàn thành.
6. W0 source dependency đã chỉ ra root replay không tự đủ: SQL000 tham chiếu crm_leads, SQL19 cần customers/users/projects; base tables ở backend/supabase/01_migration ngoài selector. Kết quả thử cô lập thực tế lưu ở root evidence, không gán source inference thành replay PASS.
7. Primary/backup catalog/history riêng, không copy ledger sang backup để làm xanh. SHA256 normalized CRLF→LF, full filename và history phải khớp; số lớn nhất/số file không là applied proof.

## Trade-off, tình trạng evidence và kiểm

Root đã báo scratch runner cô lập gặp lỗi42704 thiếu role anon, sau prerequisite fixture gặp42P01 crm_leads; ledger0 và teardown thành công. Đây là **bằng chứng gap root replay**, không nghiệm thu curated baseline/live comparison. Chi tiết artifacts/commands thuộc inventory/baseline evidence của root; không tự thêm prerequisite hoặc dùng DB thật để lấp lỗi trong ADR.

Live PostgreSQL version/schema/quyền còn UNKNOWN thì không cam kết binary local cùng semantics. Stub Supabase prerequisites phải có phạm vi; không giả toàn platform. Không sửa SQL đã chạy chỉ vì baseline cần order khác; curated baseline/additive migration tương thích có provenance riêng.

Thiếu tool/input/quyền ghi/shared/login hoặc chi phí mới ghi UNKNOWN và tiếp tục thiết kế độc lập. [TASK](../TASK.md) D5/PhaA2/mục7; W0 A2; [data-model](../data-model.md); [acceptance](../acceptance-matrix.md) R03/V3A-T16/T17. R03 chưa full baseline+live input thì không full acceptance.
