# SF2-B Implementation Evidence

> **BR-1B reconstruction notice (2026-08-31):** The material below is preserved historical narrative from the protected snapshot. Its PASS/review statements are unverified and are not a PASS claim or independent attestation for R30AB. R30AB is a new consolidated SF2-A+B recovery candidate, not an original historical SF2-B commit.

---

> Ngày: 2026-08-30  
> Founder scope: SF2-B Durable Control Plane Foundation only  
> Trạng thái cuối: **SF2-B PASS / STOP** — independent review không còn P0/P1

## 1. Implemented surface

- `plainJson.js`: strict JSON-compatible plain value validator.
- `canonical.js`, `evidenceContracts.js`: canonical/evidence fail closed với unsupported object.
- `durableStatePort.js`: exact async-compatible durable port/capability contract; atomic record-set + transaction seal; deny real/production adapter.
- `durableAuthorizationContract.js`: exact trusted verifier surface và opaque issued decision binding; caller clone/self-declaration bị deny.
- `keyManagementContract.js`: private/exact HMAC Provider surface, versioned sign/verify/rotation/revocation và lifecycle audit hash chain; không export material.
- `durableControlPlane.js`: trusted Requirement/Authorization/Policy/Evidence binding, HMAC idempotency, keyed transaction seal, atomic CAS, audit-tip/history binding, complete-set recovery và tamper verification.
- `index.js`: public contract exports.
- `software-factory-control-plane.test.js`: test-only key provider/durable port/fault injection và adversarial suite.

Không thêm route, API, UI, migration, database/Supabase client, secret config, Codex/OpenClaw adapter, Business Agent/Registry service, Model Gateway hoặc production deployment.

## 2. Test evidence hiện tại

```powershell
node --test backend/tests/software-factory-control-plane.test.js
```

Kết quả cuối: `57/57 PASS`:

- `28/28` SF1 baseline;
- `16/16` SF2-A adversarial/recovery;
- `13/13` SF2-B strict canonical, durable port, atomicity, restart, replay, CAS, idempotency, key lifecycle, authorization/evidence và tamper tests.

Full regression hiện tại:

- CP1 Agent Control Plane: `23/23 PASS`;
- Business OS, gồm Domain Ownership boundary: `69/69 PASS`;
- syntax toàn bộ `backend/src/softwareFactory/*.js`: `21/21 PASS`.

Independent Reviewer đã chạy lại cùng các gate trên và xác nhận kết quả tương ứng.

## 3. Failure/recovery cases đã kiểm chứng

- Map/Set/Date/function/undefined/bigint/cycle/class/Buffer/RegExp/sparse/accessor/symbol bị deny;
- port thiếu capability hoặc tự khai production-ready bị deny;
- key export/raw descriptor, key ID và lifecycle audit chứa secret/PII bị deny; lifecycle mutation bị chặn trước side effect;
- async atomic record-set + keyed seal commit và secret không xuất hiện trong persisted snapshot;
- restart + replay request cũ sau revision mới không commit lại;
- cùng request ID/payload khác bị HMAC deny;
- stale worker và CAS conflict fail closed;
- commit đã thành công nhưng lost ACK được recover đúng một lần;
- unknown-no-write và receipt-only partial write không được coi thành công;
- xóa receipt của current committed tip rồi xin commit revision mới bị complete-set gate chặn;
- mọi historical audit revision phải còn đủ state/checkpoint/receipt/idempotency/evidence/keyed seal; không chỉ current tip/request đang đọc;
- exact private Key Provider, rotation verify version cũ/sign version mới; revocation được audit và làm replay/recovery fail closed;
- opaque trusted authorization/policy/evidence binding bắt buộc; self-declared clone và identifier chứa secret/PII bị deny;
- command/authorization bị đổi trong lúc async verifier chờ bị TOCTOU gate deny và không commit;
- state/audit/receipt/idempotency/evidence tamper và attacker recompute toàn bộ SHA linkage bị keyed seal phát hiện.

## 4. Independent Review

Verdict cuối: **PASS / STOP**, không còn P0/P1.

Reviewer xác minh độc lập:

- Software Factory `57/57 PASS`;
- CP1 `23/23 PASS`;
- Business OS + Domain Ownership `69/69 PASS`;
- Software Factory syntax `21/21 PASS`;
- atomic complete-set, keyed current/historical seal, CAS, replay/idempotency, lost-ACK/partial recovery, trusted authorization/TOCTOU, key lifecycle và strict canonical fail-closed;
- không có database/migration/API/UI/OpenClaw/Codex runtime/Business Agent/production adapter và không phá Domain Ownership.

## 5. Residual risk trước production

1. Chưa có database/remote durable adapter; transaction/CAS mới được chứng minh bằng deterministic test port và contract.
2. Chưa có KMS/HSM/secret-manager provider, retention/access policy hoặc emergency rotation runbook.
3. Chưa có distributed integration/chaos test trên store thật, network partition hoặc replica lag.
4. Audit/evidence retention, WORM storage, encryption at rest, backup/restore và observability chưa triển khai.
5. External source authenticity chưa có signature/recompute qua repository adapter.
6. Redaction pattern không thay thế DLP/secret scanning.
7. Identity vẫn là trusted resolver contract/test fixture, chưa phải production service identity/JWT integration.
8. Verify toàn history trên mỗi snapshot hiện là O(N); cần authenticated checkpoint/Merkle hoặc segmentation trước production-scale.
9. Strict validator chưa có depth/size budget; input cực lớn có thể gây resource exhaustion.

## 6. Rollback

Revert các file SF2-B trong `backend/src/softwareFactory/`, phần test 45–57 và tài liệu ADR/contract/evidence. Không có schema/data/runtime state cần rollback và không chạy destructive database command.

## 7. Stop gate

SF2-B đã đạt Quality Gate và đóng ở **PASS / STOP**. Không tự mở SF2-C, AF3, REG4, MG5, OC6 hoặc production; mọi phase sau cần Founder approval riêng.
