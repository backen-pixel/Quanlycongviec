# SF2-A Software Factory Trust & Evidence Contracts

> Ngày: 2026-08-30  
> Phạm vi: local/test-only, code-only  
> Runtime/persistence: không triển khai  
> Boundary: Software Factory, không phải Business Agent Registry

## 1. Mục tiêu

SF2-A làm cứng trust và evidence của SF-1 trước khi xem xét bất kỳ adapter, API hoặc persistence thật nào. Contract phải fail closed khi provenance thiếu/sai, artifact/evidence bị sửa, request bị replay sai nội dung, revision cũ, concurrent writer hoặc recovery state không còn toàn vẹn.

SF2-A không tạo Codex adapter, OpenClaw runtime, Business Agent Registry service, Model Gateway, Agent runtime, HTTP API, UI, migration, database write, production configuration, release thật hoặc runtime eligibility.

## 2. Trust invariants

1. Caller không tự khai Software Factory identity, role hoặc human authority.
2. Mọi artifact có provenance, semantic validation, content digest và provenance digest.
3. Artifact ngoài Requirement phải trỏ ít nhất một parent artifact cùng Requirement/Run; parent phải còn toàn vẹn.
4. Secret/PII được redaction trước khi artifact, evidence, approval note hoặc audit metadata được lưu trong core.
5. Mọi mutation dùng request ID và expected revision; cùng request chỉ replay được khi raw canonical input/state giống hệt theo keyed HMAC, kể cả khi hai giá trị secret cùng bị redaction về một marker.
6. Mỗi scope chỉ có một mutation active; durable adapter tương lai phải bảo đảm compare-and-swap nguyên tử.
7. Recovery chỉ nhận checkpoint đúng schema, scope, revision và digest.
8. Evidence cùng canonical input tạo cùng digest; thay content/provenance/redaction làm verification thất bại.
9. Không contract nào cấp production authority. Release/eligibility tiếp tục fail closed và ngoài phạm vi.

## 3. Provenance contract

Mỗi provenance object bắt buộc có:

- `source_type`;
- `source_refs[]`, mỗi phần tử có `ref` và digest dạng `sha256:<64 hex>`;
- `parent_artifact_ids[]` không trùng;
- `policy_version`;
- `captured_by` khớp authenticated Software Factory Agent;
- `capture_method` thuộc `USER_INPUT`, `REPOSITORY_SNAPSHOT`, `TOOL_EVIDENCE`, `TEST_HARNESS`, `DERIVED`.

Core kiểm tra cấu trúc, liên kết parent, `captured_by` và `policy_version` khớp Agent policy đang thực thi. Digest của nguồn bên ngoài chỉ được kiểm tra định dạng vì SF2-A không có source repository adapter; adapter tương lai phải tự tính và đối chiếu digest tại trust boundary.

## 4. Artifact và evidence integrity

`artifactContracts.js` kiểm tra semantic theo từng loại Requirement, Architecture, Implementation, Review, Test và Release. Artifact lưu:

- `payload_digest`;
- `provenance_digest`;
- `artifact_digest` bao phủ metadata, payload, provenance và redaction findings.

`EvidenceEnvelope` version `1.0.0` lưu type, subject, provenance, redacted content, redaction findings, content/provenance/evidence digest. Canonical serialization sắp key ổn định để evidence có thể tái tạo trong test.

Verification không tin digest do caller cung cấp: core dựng lại canonical envelope/artifact rồi so sánh toàn bộ digest và semantic contract.

## 5. Secret và PII handling

Redaction chạy trước hashing/storage và hiện nhận diện:

- sensitive key hoặc free-form assignment như password, secret, token, API key, authorization, cookie, credential, private/access/refresh key;
- email;
- phone dạng phổ biến;
- bearer token, OpenAI/Supabase-like token, JWT-like value và private-key marker.

Giá trị được thay bằng marker phân loại, không hash raw secret. Pattern-based redaction không thay thế DLP/secret scanner chuyên dụng và có thể có false positive/false negative; vì vậy raw production payload chưa được phép đi vào Software Factory core.

## 6. Revision, idempotency và concurrency

- Create Requirement dùng `expected_factory_revision`.
- Artifact, transition, handoff, approval và authorized action dùng `expected_revision` của Agent Run.
- Mutation thành công tăng revision đúng một đơn vị.
- Receipt gắn `scope_id + request_id` với operation, actor, expected revision, keyed HMAC request digest, result digest và committed revision. HMAC key tối thiểu 32 bytes giúp phân biệt raw secret/PII mà không lưu hoặc phát hành digest SHA có thể dò từ điển.
- Replay cùng digest trả kết quả đã ghi, không lặp core mutation side effect.
- Cùng key nhưng khác input/state bị `IDEMPOTENCY_KEY_REUSE_DENIED` hoặc `STATE_REPLAY_MISMATCH`.
- Stale revision và active writer thứ hai bị deny.

Mock Runtime Boundary yêu cầu adapter khai báo idempotency support, truyền key đã scope theo `run_id + request_id` và cache kết quả trong process để retry evidence không gọi lại tool. Nếu process chết sau external effect nhưng trước result, adapter thật vẫn phải deduplicate bằng key này. Vì SF2-A cấm adapter thật, không được suy diễn thành distributed lock hoặc durable exactly-once guarantee.

## 7. Persistence-neutral State Port và recovery

Contract tương lai chỉ gồm:

```text
readCheckpoint(scopeId)
readReceipt(scopeId, requestId)
commitMutation({ scope_id, expected_revision, checkpoint, receipt })
```

`commitMutation` phải commit checkpoint và receipt atomically bằng compare-and-swap. Coordinator yêu cầu HMAC key do composition root cung cấp; receipt không được replay nếu checkpoint thiếu hoặc receipt/checkpoint revision/digest không khớp. SF2-A chỉ có coordinator và local test port; mọi object mang dấu hiệu production/database/Supabase adapter bị deny.

Recovery checkpoint version `1.0.0` bao gồm scope, revision, previous checkpoint digest, recovery status, redacted state, state digest và checkpoint digest. Recovery fail closed khi scope/version/revision/status/digest sai. Crash test tái tạo process bằng coordinator mới trên cùng local port, đọc checkpoint rồi replay receipt mà không chạy lại mutation.

## 8. Adversarial acceptance matrix

| Threat | Expected result |
|---|---|
| Missing provenance | DENY, không tăng revision, không ghi `REQUIREMENT_CREATED` |
| Invalid source digest | DENY |
| Fake/stale provenance policy version | DENY |
| Invalid artifact semantic | rollback local mutation, DENY |
| Cross-run parent | DENY |
| Artifact/evidence tamper | verification DENY |
| Secret/PII in payload/audit | redacted, hash chain vẫn valid |
| Stale revision | DENY |
| Same key/same request | deterministic replay |
| Same key/different request/state | DENY |
| Same key, different raw secret that redacts identically | DENY |
| Concurrent writer/CAS conflict | DENY |
| Tampered recovery checkpoint | DENY |
| Receipt exists but checkpoint missing/mismatched | DENY |
| Runtime evidence retry | same-process tool invoke not repeated; cross-run key does not collide |
| Real persistence adapter in SF2-A | DENY |

## 9. STOP gate

Sau evidence và independent review, SF2-A phải STOP. SF2-B/Codex adapter, database/API/UI, SF3+, AF3, REG4, MG5, OC6, Executive/Domain Agent runtime, production release và deploy vẫn cần Founder approval riêng.
