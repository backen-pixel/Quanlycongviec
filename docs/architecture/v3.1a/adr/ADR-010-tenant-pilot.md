# ADR-010 — Pilot một tenant, nhiều company, scope từ server

- Trạng thái: **ASSUMPTION_PENDING_FOUNDER**, không di chuyển mapping/company/tenant thật.
- Nhiệm vụ: BOS-V31A-ARCH-01; ngày **16/10/2026, Asia/Ho_Chi_Minh**.

## Bối cảnh và lựa chọn

Tenant là không gian hợp đồng/khách thuê; company là đơn vị kinh doanh/pháp nhân. V3.1 và gói cũ hỗ trợ nhiều company trong tenant với cách ly toàn tuyến. W0 A5 có tenantGate legacy/platform/system bypass, company→tenant SQL check, MCP API-key scope và X-User-Id act-as path cần delegation proof; đây là static candidate gap, chưa khai thác hoặc kết luận đã rò dữ liệu thật.

| Phương án | Lợi ích | Đánh đổi |
|---|---|---|
| A — Mỗi company luôn một tenant | Hợp đồng đơn giản | Không đáp ứng tenant nhiều company, có thể nhân cấu hình/chi phí |
| B — Chung tenant đồng nghĩa chung dữ liệu/quyền | Dễ tổng hợp | Sai company/mục đích/PII/account boundaries |
| C — Pilot1tenant nhiều company, operation company-scoped/server resolved | Đủ khả năng nhân bản, giữ pháp nhân | Cần membership/binding/field policy/tests toàn tuyến |

Chọn **C** như giả định pilot pending Founder/hợp đồng. Không tự suy VPT/Phúc Đạt thật cùng tenant; mapping ID/phạm vi có owner xác nhận trước live. Fixture tenantA/A1/A2 và tenantB/B1 kiểm cả company/tenant isolation; tenantB không là mở khách thuê thật.

## Danh tính và quyền

- Backend xác thực session/workload credential rồi resolve effective tenant/company membership, delegation/binding/authority epoch. Company selector chỉ chọn trong quyền đã có.
- **X-User-Id không là identity hoặc quyền act-as.** Header chỉ là selector khi server chứng minh delegated subject/allowlist/TTL/scope; user active/cùng company không đủ impersonation. Audit credential actor và effective actor riêng.
- Missing/unknown/conflicting tenant/company/binding/membership bị từ chối hoặc NEEDS_INPUT theo semantics; không kế thừa legacy bypass vào BOS. Platform role không tự cho agent/caller đọc/ghi khách.
- Company/account-scoped Party relationships, Need/Consent/audience/spend/assets/session/memory/queue/cache/file/callback/export/search/support. Aggregate-read không cấp raw PII/write/shared memory/audience upload/training liên công ty.
- FK/unique/dedup và adapter target phải chứa/check scope. Service-role chỉ ở đường kiểm soát hẹp với effective context/audit khi có nhiệm vụ được giao, không là credential inventory hiện tại. Không có role read-only live thì giữ UNKNOWN, không dùng/tạo admin/service-role để thay.
- D6 session/memory gắn một company, chuyển company chọn namespace đúng auth, không carry cache/memory cũ. Intercompany buyer/executor chỉ qua hợp đồng/source refs và quyền hai phía, không wildcard.

## Trade-off, chuyển đổi và kiểm

Shared DB/RLS hay dedicated storage chọn sau bằng isolation/load/economics; pilot không hứa HA/margin hoặc mở SaaS billing/self-service. RLS enabled/migration source không chứng minh effective grants/runtime. Thay tenant mapping là cutover hợp đồng/key scope/history/evidence, không chỉ UPDATE tenant_id. Giữ hệ đang chạy tới nhiệm vụ chuyển đổi có fence/reconcile/rollback.

[TASK](../TASK.md) A5/D6/B2; W0 A5/A8; [ADR D6](ADR-006-D6-ai-boundary.md); [contracts](../contracts/). [Acceptance](../acceptance-matrix.md) T01/T11/T18/T27, V3A-T03/T17/T19/T20 kiểm CRUD/FK/job/cache/file/export/support/callback/revocation. Chưa kiểm quyền/DB/network thật: NOT_RUN.
