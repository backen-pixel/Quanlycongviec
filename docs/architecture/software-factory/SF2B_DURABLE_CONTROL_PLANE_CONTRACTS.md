# SF2-B Durable Control Plane Contracts

> Phạm vi: durable-ready contract và local test foundation. Không phải persistence adapter hay production deployment.

## 1. Boundary

`DurableControlPlaneFoundation` là async coordinator; `DurableStatePort` sở hữu atomicity/CAS/consistent read; `HMAC Key Provider` sở hữu key lifecycle và cryptographic operation; trusted Authorization Decision Verifier xác nhận opaque decision do control boundary phát.

```text
Approved Requirement + authenticated Agent
  → trusted Authorization Decision verification + Policy ALLOW binding
  → Evidence binding + strict canonical validation
  → HMAC request digest via Key Provider
  → Durable State Port atomic CAS
      ├─ State record (current + revision history)
      ├─ Recovery checkpoint (current + revision history)
      ├─ Receipt
      ├─ Audit event/hash chain
      ├─ Idempotency record
      ├─ Evidence record
      └─ keyed Transaction Seal
  → consistent snapshot verification
```

Không thành phần nào trong SF2-B có database credential, HTTP route, OpenClaw/Codex adapter, Business Agent runtime hoặc production privilege.

## 2. Durable State Port contract

Port version `1.0.0` phải cung cấp:

| Method | Contract |
|---|---|
| `getCapabilities()` | Exact capability khai async methods, atomic record-set + seal, CAS, unique scope/request, consistent recovery read; `production_ready` không được true |
| `readScopeState(scopeId)` | Đọc current state của scope |
| `readCheckpoint(scopeId, revision?)` | Đọc current/historical checkpoint |
| `readReceipt(scopeId, requestId)` | Đọc receipt theo durable idempotency key |
| `readAuditEntries(scopeId)` | Đọc ordered audit hash chain |
| `readIdempotencyRecord(scopeId, requestId)` | Đọc request digest/key reference/status |
| `readEvidenceRecord(scopeId, requestId)` | Đọc immutable evidence record |
| `readTransactionSeal(scopeId, requestId)` | Đọc HMAC seal của toàn persisted transaction manifest |
| `readRecoverySnapshot({scope_id, request_id})` | Một consistent snapshot gồm current state và transaction history của request |
| `commitAtomicMutation(bundle)` | Atomic CAS/unique commit toàn bộ bundle hoặc không record nào |

`readRecoverySnapshot` tách:

- `state_record/checkpoint`: current revision để quyết định CAS;
- `current_receipt/current_idempotency_record/current_evidence_record/current_transaction_seal`: complete set và keyed manifest của current tip, bắt buộc verify trên mọi read/recover/replay/new commit;
- `transaction_state_record/transaction_checkpoint`: revision đã commit của request đang recover/replay;
- `receipt/idempotency_record/evidence_record/transaction_seal` của requested transaction và audit chain.
- `history_record_sets`: complete record set của từng audit revision; mọi revision đều phải được verify, kể cả khi không phải current tip hoặc requested transaction.

Tách hai lớp này tránh lỗi replay request revision 1 khi current scope đã ở revision 2+.

## 3. Transaction/CAS invariants

Một commit hợp lệ phải thỏa đồng thời:

1. current revision bằng `expected_revision` tại thời điểm atomic commit;
2. `(scope_id, request_id)` chưa tồn tại;
3. `next_revision = expected_revision + 1` và chỉ một worker thắng;
4. state/checkpoint/receipt/audit/idempotency/evidence/seal có cùng transaction/revision/digest linkage;
5. audit sequence/hash chain liên tục;
6. bundle digest hợp lệ;
7. consistent read sau commit xác nhận complete set.

`CONFLICT` → `CONCURRENT_MUTATION_DENIED`. Unknown/no complete records → `DURABLE_COMMIT_INDETERMINATE`. Có một phần record → `DURABLE_PARTIAL_COMMIT_DETECTED`. Không case nào được trả success.

Coordinator deep-clone/freeze command trước await đầu tiên và so canonical snapshot lại sau async authorization verification. Caller thay command/authorization trong khoảng await bị `DURABLE_COMMAND_TOCTOU_DENIED`, không commit.

## 4. Durable idempotency/recovery

HMAC input gồm raw JSON-compatible input và next state trước redaction. Một HMAC Transaction Seal riêng ký manifest chứa digest của state/checkpoint/receipt/audit/idempotency/evidence; vì vậy attacker không thể sửa persisted records rồi chỉ recompute SHA. Replay còn so redacted `next_state` với persisted state. Lost ACK chỉ recovered thành công khi store đã chứa complete verified set; side effect không lặp.

State/checkpoint và toàn transaction record set được giữ theo revision. Xóa/mất bất kỳ state/checkpoint/receipt/idempotency/evidence/seal lịch sử nào khiến consistent snapshot fail closed; một current tip còn nguyên không che được historical corruption.

## 5. HMAC Key Management contract

Key Provider versioned phải có:

- exact public surface `getActiveKey`, `getKey`, `sign`, `verify`, `listAuditEvents`, `rotateKey`, `revokeKey`; không public state/getter/Symbol/Proxy/extra method;
- `sign`, `verify` trên canonical value;
- hash-chain lifecycle audit exact schema cho create/rotate/revoke, gắn actor/reason/version;
- descriptor: `key_id`, integer `version`, `HMAC-SHA-256`, purpose `SOFTWARE_FACTORY_IDEMPOTENCY`, status;
- không có `exportKey`, `getKeyMaterial` hay field chứa material/secret/private/raw/bytes/plaintext.
- `key_id`, lifecycle `actor_id/reason` và durable/audit identifiers không được chứa secret/PII; rotation/revocation validate trước khi gọi provider mutation.

| Status | Sign | Verify |
|---|---:|---:|
| `ACTIVE` | Có | Có |
| `VERIFY_ONLY` | Không | Có |
| `REVOKED` | Không | Không; fail closed |

Mọi port/provider operation I/O là async-compatible. SF2-B không chọn secret manager/KMS, không lưu secret config và không hard-code production key.

## 6. Strict canonical contract

Chỉ JSON-compatible plain value được hash, redact, đưa vào evidence hoặc durable mutation. Validator đi qua property descriptor để cấm accessor/non-enumerable/symbol semantics và phát hiện cycle bằng ancestor set. Unsupported object không được âm thầm chuẩn hóa thành `{}`.

## 7. Error/retry policy

- Validation/auth/policy/evidence/HMAC/tamper: không retry tự động.
- CAS conflict: caller phải đọc revision mới và tạo Requirement-authorized command mới; không đổi expected revision âm thầm.
- Unknown outcome: recovery read đúng request; chỉ complete verified set mới trả recovered success.
- Revoked/unknown key: fail closed; không tự chọn key khác để xác minh lịch sử.
- Timeout/budget ở adapter tương lai không được đổi atomicity contract.

## 8. Explicitly forbidden

Không có OpenClaw, Codex runtime adapter thật, Agent Registry service, Business Agent, Model Gateway production, database/migration/API/UI, autonomous business write, production deploy hoặc sửa Domain Rules. `PASS` của document/code này không tạo runtime eligibility.
