# SF2-C2 Implementation Evidence

> Ngày: 2026-08-31  
> Founder scope: SF2-C2 Staging Durable Factory Adapter / Artifact Evidence only  
> Trạng thái cuối: **SF2-C2 PASS / STOP** — Independent Reviewer `P0=0, P1=0`

## 1. Đã xây gì

| Thành phần | File | Kết quả |
|---|---|---|
| Implementation contract | `docs/architecture/software-factory/SF2C2_IMPLEMENTATION_CONTRACT.md` | Khóa scope, reuse, persistence, SoD, failure/recovery trước code |
| Durable semantic contracts | `backend/src/softwareFactory/factoryStateContracts.js` | Exact plain-JSON Factory state, immutable refs/versions/digests, indexes và trace verification |
| Staging semantic adapter | `backend/src/softwareFactory/stagingFactoryControlPlane.js` | Requirement → Artifact → Review/Test → Gate → Handoff → candidate evidence trên SF2 durable transaction |
| Verified current read | `backend/src/softwareFactory/durableControlPlane.js` | Read-only current state sau complete history/evidence/HMAC verification |
| Canonical digest redaction hardening | `backend/src/softwareFactory/evidenceContracts.js` | Không làm hỏng canonical `sha256:<hex>` ở digest fields |
| Public exports/script | `backend/src/softwareFactory/index.js`, `backend/package.json` | Expose exact SF2-C2 surface và isolated test runner |
| Integration/adversarial suite | `backend/tests/software-factory-sf2c2-staging-factory.test.js` | 12 scenario subtests + parent suite |
| Architecture/evidence | ADR-0030 và tài liệu này | Quyết định, trace, risks, review và STOP gate |

Không thêm route/API/UI/database migration/production credential, Codex/OpenClaw,
Agent Factory, Business Agent Package Registry, Model Gateway, Business Agent
runtime, deploy hoặc thay đổi Domain Rules.

## 2. Kiến trúc BEFORE → AFTER

```text
BEFORE — SF2-C1
DurableControlPlaneFoundation
  → atomic opaque next_state
  → loopback Durable Store proof + KMS proof
  → CAS/idempotency/recovery/HMAC evidence

AFTER — SF2-C2
Authenticated Founder/Factory Requirement
  → canonical Software Factory identity + policy
  → StagingDurableFactoryControlPlane
       RequirementArtifact / Factory Run
       ArchitectureArtifact / ImplementationArtifact
       ReviewArtifact / TestArtifact / ReleaseArtifact
       Quality Gate / Handoff / semantic trace
  → verified canonical semantic state
  → SF2-B/C1 atomic durable transaction
       State + Checkpoint + Receipt + Audit
       + Idempotency + Evidence + HMAC Seal

Boundary unchanged:
  no Agent Factory → no Business Registry → no OpenClaw → no Business Agent
```

SF2-C2 bổ sung semantic layer, không fork durable primitive hoặc tạo runtime.

## 3. Durable và chưa durable

| Durable/recoverable trong isolated proof | Chưa durable/operational |
|---|---|
| Complete Factory state mỗi revision | Managed/distributed staging database và consensus |
| Requirement/Artifact payload, provenance, version, digest | Artifact object store và controlled external API |
| Review/Test/Release evidence và exact subject refs | Service IAM/mTLS và external identity attestation |
| Gate events, Handoff và semantic trace hash chain | Managed KMS/HSM, WORM/monotonic anchor |
| Checkpoint/Receipt/Audit/Idempotency/Evidence/HMAC seal | Backup/restore/DR, retention, load/SLO/alerts |
| Restart, replay, lost ACK và CAS recovery | Cross-region/replica/partition/split-brain proof |

Backing vẫn là SF2-C1 loopback/temp SQLite + proof KMS, single host và
`production_ready=false`.

## 4. Trace mẫu đã chứng minh

Happy-path tạo **21 durable revisions**, **21 semantic trace events**, **7 Artifact
Versions**, **13 gate events**, 1 handoff và 1 release-candidate evidence:

```text
RequirementArtifact v1
→ Factory Run REQUESTED
→ ANALYZED
→ ArchitectureArtifact v1
→ ARCHITECTURE_APPROVED → READY_TO_BUILD → BUILDING
→ ImplementationArtifact v1
→ Handoff Builder → Independent Reviewer
→ BUILT → IN_REVIEW
→ ReviewArtifact PASS
→ REVIEW_PASSED → TESTING
→ TestArtifact AUTOMATED PASS
→ TEST_PASSED → UAT_READY
→ TestArtifact UAT PASS
→ UAT_PASSED
→ ReleaseArtifact CANDIDATE
→ RELEASE_CANDIDATE
→ AWAITING_FOUNDER_APPROVAL
→ STOP
```

Mỗi ref chứa Artifact ID/version/digest. Trace sequence/digest được semantic
validator kiểm tra; durable layer đồng thời kiểm tra revision/history/receipt/audit/
evidence/HMAC seal.

## 5. Adversarial, failure và recovery evidence

| Attack/failure | Kết quả |
|---|---|
| Same request ID, payload khác | DENY; HMAC idempotency mismatch |
| Forged evidence scope/request | DENY; không tăng revision |
| Identity/policy spoof | DENY theo canonical Software Factory Registry |
| Forged `captured_by`/obsolete provenance policy | DENY trước Artifact creation |
| Builder self-review / gate bypass / baseline execution | DENY |
| Stale Artifact version hoặc stale evidence ref | DENY |
| BLOCKED→PASS, FAIL→PASS, REJECTED→CANDIDATE bằng Artifact ID khác | DENY; negative stream sticky |
| Raw PII làm semantic digest đổi sau record construction | DENY trước commit |
| Canonical marker đã redact trong Artifact | PASS và persisted redact-before-store |
| Hai coordinator commit cùng revision | Một winner; loser `CONCURRENT_MUTATION_DENIED` |
| Duplicate delivery | Exact verified replay; không duplicate outcome |
| Lost ACK/commit rồi disconnect | Recover đúng một complete committed outcome |
| Unknown/timeout/store down/KMS down | Fail closed; không guessed success |
| Persisted state tamper/missing historical evidence | Read/recovery DENY |
| Process/store/KMS restart | State, trace và replay outcome còn nguyên |

## 6. Final regression evidence

| Gate | Result |
|---|---:|
| SF2-C2 staging durable Factory | `13/13 PASS` |
| Software Factory SF1/SF2-A/SF2-B | `57/57 PASS` |
| SF2-C1 distributed proof | `14/14 PASS` |
| CP1 Agent Control Plane | `23/23 PASS` |
| Business OS + Domain Ownership | `69/69 PASS` |
| Software Factory source syntax | `27/27 PASS` |
| Merge-marker / forbidden runtime-production scan | `PASS` |

Domain Ownership boundary không đổi: SF2-C2 không import Business OS/domain/database
và không cấp đường direct database write.

## 7. Independent Review

Independent Reviewer review source/contracts/tests và tự chạy lại toàn bộ gate.

Các P1 ban đầu:

1. Artifact provenance chưa bind `captured_by/policy_version` vào authenticated
   creator/canonical registry policy.
2. Gate/release có thể cherry-pick PASS cũ bằng Artifact ID khác, kể cả reverse
   BLOCKED/FAIL/REJECTED → positive mới.
3. Handoff purpose chứa PII có thể bị durable redaction đổi sau khi semantic record
   digest đã tính.

Remediation:

- creator/policy provenance binding ở construction và persisted wrapper check;
- current evidence theo từng `artifact_id` stream; negative sticky, mọi current
  positive stream phải được cite; chỉ same-stream new version/new subject supersede;
- canonical semantic redaction equality preflight trước durable commit;
- thêm forward/reverse adversarial tests và redact-before-store regression.

Final independent verdict: **PASS / STOP; P0=0, P1=0**.

P2 residual:

1. C1 proof backing single-host; chưa IAM/mTLS/managed KMS/WORM/backup/DR/load.
2. `readRun(run_id)` chưa có external read authorization/data-scope wrapper.
3. Chưa có versioned mandatory test-kind policy/external attestation.
4. Chưa model multi-builder Implementation completeness set.
5. Semantic trace chưa direct cross-link durable request/transaction/revision/receipt.
6. Full-history verification O(N).

P3: shared review error code cho negative gate diagnostics; timestamp chưa có
monotonic/clock attestation.

## 8. Readiness trước AF3

SF2-C2 đã đáp ứng **bounded semantic prerequisite** cho một AF3 design/implementation
exercise: durable Requirement/Artifact/evidence/gate/candidate lineage, SoD và
fail-closed recovery. Nó chưa cung cấp AF3 itself.

AF3 vẫn cần Founder approval riêng và phải quyết định package vNext, reusable
Brain/Industry Pack refs, semantic policy validator, sandbox, executable eval/
security policy, reproducible packager/SBOM/signing và candidate rollback contract.
Operational IAM/KMS/artifact API gaps phải giữ explicit non-production ceiling.

`BOS-AI1` vẫn `NOT_AUTHORIZED` và độc lập; Business OS typed tools/context/audit
readiness chưa được SF2-C2 giải quyết. OC6 chỉ được xem xét sau BOS-AI1 + REG4 +
MG5 và runtime IAM/ledger gates.

## 9. Rollback và exact verdict

Rollback: disable/remove staging semantic adapter, exports/test/docs và verified
read addition; SF2-A/B/C1 contracts/proof records không đổi. Không có Business OS
migration, package, Registry record, runtime worker hoặc production state để undo.

**Exact verdict: SF2-C2 PASS / STOP. Runtime/production NO_GO.**

Không tự mở BOS-AI1, AF3, REG4, MG5, OC6, BA7, FC8, PROD9, OpenClaw, Business
Agent runtime hoặc production. Bước tiếp theo chỉ là đề xuất cho Founder quyết định.
