# ADR-0030: SF2-C2 Staging Durable Factory / Artifact Evidence

- **Trạng thái:** Accepted — **SF2-C2 PASS/STOP**; isolated staging proof, runtime/production `NO_GO`
- **Ngày:** 2026-08-31
- **Authority:** Founder approval for SF2-C2 only
- **Liên quan:** ADR-0022, ADR-0027, ADR-0028, ADR-0029

## Ngữ cảnh

SF2-B định nghĩa complete atomic record set, CAS, durable idempotency, recovery và
HMAC key lifecycle. SF2-C1 chứng minh các primitive này qua process/network
boundary bằng loopback HTTP, temporary SQLite WAL store và encrypted proof KMS.
Chúng chưa tạo durable Software Factory semantics: Requirement/Factory Run,
immutable Artifact Version lineage, Review/Test/Release evidence, Quality Gate và
Handoff chưa được phục hồi như một aggregate có thể kiểm chứng sau restart.

Founder chỉ mở SF2-C2. Không có managed staging store, IAM/mTLS, managed KMS,
WORM anchor, production credential hoặc quyền mở Agent Factory/runtime. Vì vậy
quyết định đúng phạm vi là thêm semantic adapter staging trên port SF2 đã có,
không giả lập một operational/production service chưa tồn tại.

## Quyết định

### 1. Một Factory Run là một durable aggregate

```text
Authenticated Factory command
  → canonical Software Factory identity/policy
  → semantic operation + immutable Artifact refs
  → verified next Factory state
  → SF2-B/C1 atomic CAS commit
       state + checkpoint + receipt + audit
       + idempotency + evidence + HMAC seal
```

`scope_id = run_id`. State versioned chứa Requirement, Factory Run, immutable
Artifact Versions, review/test/release evidence, gate events, handoffs, latest
artifact lookup và semantic trace hash chain. Mọi read/recovery xác minh cả durable
history/seal lẫn semantic state trước khi trả kết quả.

### 2. Reuse, không tạo control plane thứ hai

Adapter tái sử dụng `SoftwareFactoryAgentRegistry`, `artifactContracts`,
`evidenceContracts`, `qualityGate`, `DurableControlPlaneFoundation`,
`DurableStatePort` và `KeyProvider`. Thay đổi primitive duy nhất là verified
`readCurrentState()` trên Durable Control Plane. Không tạo Registry, crypto,
approval authority, transaction format, runtime hay Business Rule engine mới.

### 3. Immutable version, digest và provenance authority

- `(artifact_id, version)` tăng đúng một và không overwrite/retype.
- Subject/parent/evidence ref khóa `artifact_id + version + digest`.
- Factory tự tính digest; caller không tự tuyên bố authoritative digest.
- `provenance.captured_by` phải bằng authenticated creator và
  `provenance.policy_version` phải bằng canonical registry policy tại lúc tạo.
- Persisted wrapper xác minh creator/provenance binding; durable HMAC/history phát
  hiện sửa state hoặc lineage ngoài transaction.
- Semantic state phải ở canonical redacted form trước khi record digest/commit;
  raw secret/PII làm mutation fail closed, còn marker đã redact được giữ nguyên.

### 4. Negative evidence là sticky theo Artifact stream

Current evidence được tính theo exact subject và từng `artifact_id` stream. Version
mới của cùng stream supersede version cũ; Artifact ID khác không được che một
`BLOCKED`, `CHANGES_REQUESTED`, `FAIL` hoặc `REJECTED` còn current.

Gate elevation yêu cầu mọi current applicable Review/Test/UAT/Release stream đều
positive và mọi exact ref đều được cite. Một negative stream chỉ hết hiệu lực khi:

1. có version mới trong chính stream đó sau remediation/retest/re-review; hoặc
2. có Implementation version/subject mới, khi đó evidence cũ không áp dụng và
   toàn bộ evidence bắt buộc phải tạo lại.

### 5. Separation of duties và release boundary

Product Owner tạo Requirement; Architect tạo Architecture; Builder tạo
Implementation; Independent Reviewer tạo Review; QA/UAT tạo Test; Release
Authority chỉ lập candidate evidence. Builder không tự review/test; Release
Authority không trùng Builder/Reviewer/QA cho candidate.

`BASELINED`, `ROLLED_BACK`, deploy, production release và runtime eligibility bị
deny rõ. SF2-C2 lưu `CANDIDATE/REJECTED` evidence, không phát hành Agent hoặc source.

## Durable và chưa durable

Durable trong proof: complete Factory aggregate per revision; immutable Artifact
payload/provenance/digest; Review/Test/Gate/Handoff/Release candidate evidence;
receipt/audit/idempotency/checkpoint/evidence/seal; replay, CAS và restart recovery.

Chưa operational/production durable: managed distributed database/consensus,
service IAM/mTLS, managed KMS/HSM, WORM/monotonic anchor, artifact object store/API,
backup/restore/DR, retention, load/SLO/observability và cross-region evidence.

## Consequences và residual risks

- SF2-C2 chứng minh end-to-end semantic trace trên SF2-C1 proof backing nhưng vẫn
  `production_ready=false`.
- `readRun(run_id)` chưa có external read authorization/data-scope; hiện chỉ an
  toàn vì class in-process và không có route. Bắt buộc wrap trước service/API.
- Test policy mới yêu cầu ít nhất một non-UAT PASS và UAT PASS; chưa có versioned
  policy bắt buộc SECURITY/ADVERSARIAL/RECOVERY hoặc external attestation.
- Một latest Implementation được chọn cho run; multi-builder completeness set
  chưa được model.
- Semantic trace chưa cross-link trực tiếp durable request/transaction/revision/
  receipt; có thể reconstruct qua durable audit nhưng cần strengthen trước scale.
- Historical verification O(N); chưa có Merkle/compaction/authenticated checkpoint.
- Timestamps chưa có monotonic/clock attestation; một shared review error code làm
  diagnostics BLOCKED/CHANGES chưa chính xác.

## Gate

Final evidence:

- SF2-C2 `13/13 PASS`;
- Software Factory SF1/SF2-A/SF2-B `57/57 PASS`;
- SF2-C1 `14/14 PASS`;
- CP1 `23/23 PASS`;
- Business OS + Domain Ownership `69/69 PASS`;
- Software Factory syntax `27/27 PASS`;
- no merge marker và no forbidden runtime/production boundary.

Independent Reviewer phát hiện provenance spoof, redaction/digest mismatch và
negative-evidence cherry-pick. Sau fix, retest và independent re-review, kết luận
cuối là **P0=0, P1=0, PASS/STOP**. Residual phía trên là P2/P3 non-production gaps.

ADR này không mở BOS-AI1, AF3, REG4, MG5, OC6, BA7, FC8, PROD9, OpenClaw,
Business Agent runtime hoặc production. SF2-C2 phải **STOP**.
