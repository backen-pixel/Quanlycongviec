# ADR-0028: SF2-C1 Distributed Durable Store & KMS Proof

> **BR-1B reconstruction notice (2026-08-31):** Historical PASS/test/review statements below are preserved narrative from the protected snapshot. They are unverified and are not a PASS claim or commit-bound attestation for the new R50 recovery candidate. Formal traceable testing is not authorized in BR-1B.

---

- **Trạng thái:** Accepted — **SF2-C1 PASS/STOP**; staging/test-only proof, không runtime/production eligibility
- **Ngày:** 2026-08-30
- **Authority:** Founder approval for SF2-C1 only
- **Liên quan:** ADR-0022, ADR-0027

## Ngữ cảnh

SF2-B chứng minh atomic/CAS/idempotency/recovery và HMAC lifecycle bằng deterministic in-memory test port. Chưa có bằng chứng qua process boundary, database transaction thật, service restart, network timeout hoặc KMS-style service boundary. Founder cho phép riêng SF2-C1 để tạo proof staging/test-only; không cho runtime, production, OpenClaw, Business Agent, Registry service hoặc Model Gateway.

Môi trường local không có isolated PostgreSQL/container được phê duyệt và không được dùng production/staging credential có sẵn. Vì vậy proof chọn topology cô lập có thể chạy lặp lại hoàn toàn bằng local ephemeral resources:

```text
DurableControlPlaneFoundation
  ├─ loopback HTTP Durable State Port adapter
  │    → isolated store service
  │         → SQLite WAL + FULL synchronous transaction
  └─ loopback HTTP Key Provider
       → isolated KMS proof service
            → encrypted SQLite vault + runtime-only master key
```

Đây là distributed-style process/network boundary và multi-process proof, không phải distributed database hoặc production topology.

## Quyết định

### 1. Adapter boundary

Application coordinator chỉ thấy hai contract đã có từ SF2-B. Adapter chỉ chấp nhận `http://127.0.0.1`, `localhost` hoặc loopback IPv6; non-loopback/TLS production endpoint bị deny trong proof. Mỗi request dùng ephemeral service token sinh lúc test, private trong adapter, không commit source/config. Store/KMS/worker child processes nhận allowlist environment tối thiểu thay vì kế thừa credential của parent.

Core Durable State Port/Key Management contract không bị đổi theo SQLite. Proof adapter giữ `production_ready: false` và không có production credential/data access.

### 2. Durable store transaction

Store service là process riêng, sở hữu database handle và chỉ nhận database path dưới OS temporary directory. SQLite dùng:

- WAL journal;
- `synchronous=FULL`;
- `BEGIN IMMEDIATE` cho atomic writer transaction;
- primary/unique constraint theo scope/revision/request/transaction;
- một transaction cho state + checkpoint + receipt + audit + idempotency + evidence + seal;
- read transaction cho consistent recovery snapshot và toàn historical record sets.

Server xác minh exact bundle schema, digest, scope/request/transaction/revision binding và audit sequence trước insert. CAS loser hoặc duplicate request trả `CONFLICT`; core chỉ replay sau khi đọc và verify complete committed set.

### 3. Failure semantics

Timeout/unavailable/unknown response không bao giờ được đổi thành success. Proof client cấm redirect, giới hạn request/stream response byte và giữ cùng AbortController từ fetch tới khi body đã parse/validate xong. Lost ACK hoặc process crash sau commit chỉ được recovered khi consistent read tìm thấy complete, HMAC-verified record set. Timeout trước commit, slow body sau headers, unavailable store/KMS, partial records và tamper đều fail closed.

### 4. KMS proof

KMS service là process/vault riêng. Application chỉ gọi descriptor/sign/verify/list-audit/rotate/revoke; không có export API. Data key sinh bằng CSPRNG trong KMS process, mã hóa AES-256-GCM trong vault bằng master key 256-bit chỉ truyền runtime qua environment của KMS test process. Master key, raw data key và service token không nằm trong source, application database hoặc audit.

Key lifecycle giữ `key_id`, version, ACTIVE/VERIFY_ONLY/REVOKED và hash-chain audit. HKDF derive một metadata authentication key tách biệt; mỗi encrypted key row/status và lifecycle audit event có HMAC được verify trước khi dùng. Actor/reason chứa secret/PII bị chặn ngay tại KMS service trước mutation. Restart với cùng isolated temp vault/master key verify được records version cũ; revoked version làm recovery fail closed; sửa status/audit trực tiếp làm authenticated read fail closed.

Application canonicalize và SHA-256 prehash payload trước `sign`/`verify`. KMS chỉ nhận bounded digest envelope để giữ HMAC binding mà không nhận raw Business payload hoặc secret qua RPC.

### 5. Input resource boundary

Strict JSON validator bổ sung default budget depth `64`, node `50000`, per-string/key `1 MiB` và cumulative UTF-8 string/key `4 MiB`. Input vượt budget bị `CANONICAL_BUDGET_EXCEEDED` trước clone/persistence/KMS side effect. Proof RPC có byte cap riêng `8 MiB` cho request và response như defense in depth.

### 6. Domain ownership

SF2-C1 không gọi Business OS và không chứa Business Rules. SQLite chỉ là temporary Software Factory proof store; không phải Business OS database và không tạo đường Agent/OpenClaw ghi database.

## Consequences và residual risks

- Chứng minh được process/network adapter boundary, service restart, multi-process workers và hai store processes/SQLite connections tranh cùng transaction/CAS trên một host.
- Chưa chứng minh PostgreSQL/distributed consensus, replica lag, split-brain, cross-region/network partition healing hoặc lock behavior của store production tương lai.
- Node `node:sqlite` ở runtime hiện phát ExperimentalWarning; proof không tạo production support claim.
- O(N) historical verification vẫn còn; chưa có Merkle/authenticated checkpoint/segmentation.
- Vault là KMS-compatible proof, chưa phải cloud KMS/HSM/IAM/attestation.
- Metadata MAC phát hiện in-place edit nhưng không thể tự phát hiện rollback toàn vault về một snapshot cũ hợp lệ; production cần external monotonic/WORM anchor.
- Chưa có WORM, backup/restore/disaster-recovery drill, retention, observability hoặc scale/load evidence.
- Redaction heuristic chưa thay DLP.

## Gate

Quality Gate đã đóng `SF2-C1 PASS/STOP`: proof `14/14`, Software Factory `57/57`, CP1 `23/23`, Business OS + Domain Ownership `69/69`, syntax `25 + 4`; Independent Reviewer re-review sau remediation và kết luận không còn P0/P1. Kết quả không mở SF2-C2/Codex adapter, AF3, REG4, MG5, OC6, runtime hoặc production.
