# SF2-C1 Implementation Evidence

> **BR-1B reconstruction notice (2026-08-31):** The material below is preserved historical narrative from the protected snapshot. Its PASS/review statements are unverified and are not a PASS claim or independent attestation for R50. R50 is a new SF2-C1 recovery candidate with SF2-C2 de-overlay; formal traceable testing is not authorized in BR-1B.

---

> Ngày: 2026-08-30  
> Founder scope: SF2-C1 Distributed Durable Store & KMS Proof only  
> Trạng thái cuối: **SF2-C1 PASS / STOP** — Independent Reviewer không còn P0/P1

## 1. Implemented

- loopback-only async Durable State Port RPC adapter;
- isolated SQLite WAL/FULL transactional store engine and process;
- multi-process worker proof;
- loopback-only exact KMS Provider adapter;
- separate KMS process with encrypted SQLite vault, runtime master key, version/rotation/revocation/audit and HKDF-separated metadata MAC;
- minimal child environment allowlist, temp-only store/vault path and service-side lifecycle secret/PII denial;
- failure injection for unknown, timeout-before-commit, lost ACK/disconnect and post-commit worker crash;
- proof HTTP deny-redirect, end-to-end timeout and bounded request/streamed response;
- default JSON depth/node/per-string/cumulative UTF-8 resource budget;
- local canonical SHA-256 prehash so KMS RPC never receives raw Business payload/secret;
- SF2-C1 integration/adversarial suite and npm script.

Không thêm Business OS route/domain rule, production migration/credential/database access, UI, Codex/OpenClaw/Business Agent/Registry/Model Gateway runtime hoặc deployment.

## 2. Final test results

| Gate | Result |
|---|---:|
| SF2-C1 proof runner | `14/14 PASS` (13 scenario subtests + parent suite) |
| Software Factory SF1/SF2-A/SF2-B regression | `57/57 PASS` |
| CP1 Agent Control Plane | `23/23 PASS` |
| Business OS + Domain Ownership | `69/69 PASS` |
| Software Factory source syntax | `25/25 PASS` |
| SF2-C1 fixture/test syntax | `4/4 PASS` |

## 3. Evidence matrix

- persistence: state and encrypted key vault survive service/application restart;
- concurrency/CAS: two worker + two store service processes/SQLite connections, different requests yield one commit/one conflict;
- concurrent retry: same request across two store processes yields one commit/one verified replay;
- idempotency: changed payload with same request ID fails HMAC verification;
- recovery: lost ACK and killed worker recover one existing outcome;
- failure injection: unknown/timeout/store/KMS unavailable fail closed;
- integrity: partial current set, missing historical evidence and invalid HMAC fail closed;
- KMS: descriptor-only app surface, old-version verify, rotation, restart, revocation, audit and fail-closed metadata MAC verification;
- security: non-loopback/non-temp proof use denied, redirect target receives no forwarded RPC body, no inherited parent credential, no raw Business secret crosses KMS RPC, no raw secret/master/token in persisted proof files, sensitive lifecycle audit rejected pre-mutation;
- trust: forged authorization and async command mutation denied before side effect;
- resource safety: depth >64, >50000 nodes, oversized string/key and streamed response denied; timeout remains active after headers until bounded body/validation completes;
- KMS tamper: out-of-band status rewrite plus revoked-audit deletion cannot re-enable a revoked key because authenticated metadata read fails closed.

## 4. Residual risks

1. SQLite WAL is a single-host transactional proof, not a distributed consensus database.
2. No replica/lag/split-brain/cross-region partition test; behavior belongs to the future chosen store adapter.
3. `node:sqlite` emits ExperimentalWarning in Node 22 and is not a production support decision.
4. KMS vault is compatible proof, not cloud KMS/HSM/IAM/attestation.
5. O(N) history verification remains and has no scale/load benchmark.
6. Metadata MAC detects in-place vault edits but cannot detect rollback to a complete previously valid vault snapshot without an external monotonic/WORM anchor; no retention, backup/restore, disaster-recovery drill or operational observability.
7. Secret scanning/redaction does not replace DLP or memory-forensics protection.
8. Loopback ephemeral token proof does not establish production service identity/mTLS.

## 5. Independent Review

Independent Reviewer đã re-review toàn bộ adapters, contracts, proof engines/services, fixtures, adversarial tests, ADR/architecture/evidence sau remediation và tự chạy lại các gate:

- SF2-C1 proof `14/14 PASS`;
- Software Factory `57/57 PASS`;
- CP1 `23/23 PASS`;
- Business OS + Domain Ownership `69/69 PASS`;
- syntax `25 + 4 PASS`;
- no merge marker.

Spot adversarial độc lập xác nhận redirect target nhận `0` RPC body, slow body sau headers vẫn timeout, oversized string/key bị deny, KMS chỉ thấy canonical prehash và vault status/audit tamper fail closed.

Verdict cuối: **PASS / STOP — không còn P0/P1**. Các residual ở mục 4 là P2/non-production gaps, không tạo runtime eligibility.

## 6. Rollback

Revert SF2-C1 adapter/fixture/test/script/export/resource-budget/docs changes. Tests create only isolated OS-temp SQLite files and remove them; no migration or business/production state exists.

## 7. STOP gate

SF2-C1 đã đạt **PASS / STOP**. Không tự mở SF2-C2, Codex/OpenClaw, AF3, REG4, MG5, OC6, Agent pilot hoặc production. Mọi phase sau cần Founder approval mới.
