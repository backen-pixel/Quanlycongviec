# ADR-0027: SF2-B Durable Control Plane Foundation

> **BR-1B reconstruction notice (2026-08-31):** Historical PASS/test/review statements below are preserved narrative from the protected snapshot. They are unverified and are not a PASS claim or commit-bound attestation for the new consolidated R30AB recovery candidate.

---

- **Trạng thái:** Accepted — Foundation Contract; production/runtime vẫn NO_GO
- **Ngày:** 2026-08-30
- **Người phê duyệt phạm vi:** Founder
- **Liên quan:** ADR-0020, ADR-0021, ADR-0022, ADR-0026

## Ngữ cảnh

SF2-A đã chứng minh trust/evidence contract ở local/in-memory nhưng chưa bảo đảm lịch sử sống qua process restart, transaction atomic, multi-worker compare-and-swap hoặc HMAC key lifecycle. Nếu receipt, state, checkpoint, audit, idempotency và evidence được ghi rời, một operation có thể bị báo thành công trong khi recovery state thiếu. Nếu canonicalizer chấp nhận object có runtime semantics như `Map`, `Set`, `Date`, accessor hoặc cycle, digest/evidence có thể không phản ánh đúng input.

Founder chỉ cho phép xây durable-ready contract/test foundation. Không cho database adapter thật, API, UI, OpenClaw, Codex runtime adapter, Business Agent runtime, production deployment hoặc thay đổi Domain Rules.

## Quyết định

### 1. Durable State Port

Software Factory phụ thuộc một port persistence-neutral có các capability bắt buộc:

- consistent recovery snapshot;
- async atomic commit của state + checkpoint + receipt + audit + idempotency + evidence + keyed transaction seal;
- compare-and-swap theo `scope_id/expected_revision`;
- uniqueness theo `scope_id/request_id`;
- giữ lịch sử state/checkpoint theo revision để replay request cũ sau revision mới.

Port tự khai `production_ready`, chứa database client hoặc thiếu một capability trên bị deny. SF2-B chỉ có test port; không có adapter production.

### 2. Atomic mutation invariant

Mọi mutation đi theo chuỗi:

```text
Requirement
→ Authorization
→ Policy ALLOW
→ expected revision
→ durable HMAC idempotency
→ atomic CAS transaction
→ state + checkpoint + receipt + audit + evidence
→ verified recovery snapshot
```

Toàn record set dùng cùng `transaction_id`, committed revision và digest linkage. HMAC Transaction Seal ký manifest của toàn record set để chống attacker recompute SHA. Bất kỳ partial set nào đều là `DURABLE_PARTIAL_COMMIT_DETECTED`; unknown outcome không có complete record set là `DURABLE_COMMIT_INDETERMINATE`. Cả hai đều fail closed.

### 3. Concurrency và recovery

Port là nơi thực thi CAS/unique constraint atomically. Coordinator không dùng in-process mutex làm durable guarantee. Sau lost acknowledgement, coordinator đọc consistent snapshot: chỉ complete, untampered record set mới được recovered thành success. Current state được tách khỏi transaction state để request cũ vẫn replay/verify được sau các revision mới.

Mọi consistent snapshot phải mang complete record set và keyed seal của current tip, requested transaction và từng historical audit revision. Vì vậy state/checkpoint/receipt/evidence/idempotency/seal lịch sử bị mất không thể bị bỏ qua để commit revision kế tiếp. Async coordinator snapshot/freeze command trước await và deny TOCTOU mutation sau verification.

### 4. Durable idempotency

Request digest HMAC-bind canonical raw command material, gồm scope/request/requirement/revision/operation/actor/authorization/input/next state/evidence digest. ADR-0028 hardening canonicalize và SHA-256 prehash material tại application boundary trước khi gửi bounded digest envelope cho KMS; hai raw input khác nhau vẫn không collapse thành cùng idempotency value. Cùng request ID với payload khác bị deny; replay cùng payload không commit lần hai.

### 5. HMAC Key Management boundary

Coordinator chỉ lưu key reference `{key_id, version, algorithm, purpose}`. Key Provider có exact public surface, private state, async cryptographic methods và hash-chain lifecycle audit. Raw key không được export hoặc xuất hiện trong descriptor/receipt/audit. Key ID, lifecycle actor/reason và durable/audit identifiers chứa secret/PII bị deny; rotation/revocation validate trước provider mutation. Key `ACTIVE` được sign/verify; `VERIFY_ONLY` chỉ verify; `REVOKED` làm replay và recovery fail closed. Rotation/revocation bắt buộc actor, reason và versioned audit.

### 6. Canonical/evidence validator

Canonical value chỉ gồm null, string, boolean, finite number, dense array và plain object có `Object.prototype` hoặc null prototype. Deny rõ `undefined`, function, symbol, bigint, non-finite number, cycle, `Map`, `Set`, `Date`, class instance, Buffer/typed object, RegExp, sparse/custom array, symbol key, accessor và hidden property.

### 7. Domain ownership và runtime boundary

Foundation không gọi Business OS, không chứa Business Rules và không ghi database. OpenClaw/Business Agent/Model Gateway không thuộc ADR này. Production eligibility không được suy ra từ SF2-B PASS.

## Hệ quả

- Durable adapter tương lai phải chứng minh isolation/transaction/CAS/unique/consistent-read bằng integration test riêng; implement interface không đủ.
- HMAC Provider tương lai phải dùng secret manager/KMS/HSM phù hợp; local test key không phải production key design.
- Recovery có thể xác minh record integrity khi không có original command; full idempotency authenticity chỉ được xác minh khi replay command và HMAC material.
- Đây là foundation local/test-only, không phải deployment architecture.

## Gate

SF2-B chỉ PASS sau full regression, adversarial/recovery/concurrency/key tests và independent review không còn P0/P1. Sau PASS phải STOP; phase sau cần Founder approval mới.

**Kết quả ngày 2026-08-30:** `PASS / STOP`. Software Factory `57/57`, CP1 `23/23`, Business OS + Domain Ownership `69/69`, syntax `21/21`; Independent Reviewer không còn P0/P1. Kết quả này không tạo runtime/production eligibility và không mở phase sau.
