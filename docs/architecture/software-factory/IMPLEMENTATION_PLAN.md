# Software Factory Implementation Plan

## SF-0 — Architecture & Guardrail

**Trạng thái:** PASS. Đã có architecture, ADR, registry/matrix/contract/state machine, gap analysis và baseline protection. Không schema/UI/runtime.

## SF-1 — Core Control Plane

**Trạng thái:** P0 security remediation PASS. SF2-A/SF2-B/SF2-C1 PASS/STOP. Independent Review SF2-C1 không còn P0/P1. Runtime/production và mọi phase sau vẫn chưa được phép.

- In-memory Agent Registry, Requirement/Run, Artifact, Handoff, Quality Gate, authenticated approval và hash-chain audit.
- Identity chỉ đến từ trusted principal resolver/opaque context; caller không tự khai Agent role hoặc human authority.
- Approval token ký HMAC, có nonce/issued/expiry/one-time và gắn ReleaseArtifact digest.
- Tool action do backend suy ra; write path bắt buộc; direct recording bị deny; execution đi qua private authorized boundary.
- 28 automated tests PASS, gồm toàn bộ guardrail cũ và adversarial P0 identity/approval/replay/action/path/runtime/state tests.
- Chưa có database migration, HTTP API, tenant-auth integration hoặc UI.

P0 đã hoàn tất ở technical core. SF2-A đã xử lý contract local cho optimistic concurrency/idempotency, artifact/evidence provenance, semantic validation, redaction và recovery. Điều kiện vận hành vẫn gồm persistence/API review, service/JWT principal resolver thật, tenant/repository context, durable audit/retention, distributed concurrency và recovery trên adapter thật.

## SF2-A — Trust & Evidence Hardening

**Trạng thái:** PASS/STOP. 16 adversarial tests, full regression và independent review PASS; không có P0/P1.

- Chỉ code local/test trong Software Factory core.
- Có provenance/digest, redaction, revision/idempotency, persistence-neutral State Port và recovery contract.
- Không database/API/UI/runtime adapter/production release.
- Contract chi tiết: [SF2-A Trust & Evidence Contracts](./SF2A_TRUST_EVIDENCE_CONTRACTS.md).
- Evidence: [SF2-A Implementation Evidence](./SF2A_IMPLEMENTATION_EVIDENCE.md).

## SF2-B — Durable Control Plane Foundation

**Trạng thái:** **PASS/STOP.** Đã implement async durable State Port, atomic record-set + keyed transaction seal/CAS, trusted authorization verification, restart/recovery, durable HMAC idempotency, private versioned Key Management + lifecycle audit contract và strict canonical validator. Software Factory `57/57`, CP1 `23/23`, Business OS + Domain Ownership `69/69`, syntax `21/21`; independent review không còn P0/P1. Chỉ local/test foundation.

- Contract: [SF2-B Durable Control Plane Contracts](./SF2B_DURABLE_CONTROL_PLANE_CONTRACTS.md).
- Evidence: [SF2-B Implementation Evidence](./SF2B_IMPLEMENTATION_EVIDENCE.md).
- Không database adapter/migration/API/UI/runtime/production.

## SF2-C — Codex Execution Adapter

Chưa được Founder cho phép. Adapter tương lai không cung cấp identity/role; tool call chỉ đi qua private authorized execution boundary; không có production data/deploy privilege.

## SF2-C1 — Distributed Durable Store & KMS Proof

**Trạng thái:** **PASS/STOP.** Founder phê duyệt SF2-C1 only. Đã implement isolated loopback Durable Store/KMS services, SQLite WAL atomic CAS/recovery, multi-process workers, encrypted KMS vault, lifecycle/failure injection và resource budget. Proof `14/14`, Software Factory `57/57`, CP1 `23/23`, Business OS + Domain Ownership `69/69`, syntax `25 + 4` PASS; Independent Reviewer không còn P0/P1.

- Architecture/threat model: [SF2-C1 Distributed Store & KMS Proof](./SF2C1_DISTRIBUTED_STORE_KMS_PROOF.md).
- Evidence: [SF2-C1 Implementation Evidence](./SF2C1_IMPLEMENTATION_EVIDENCE.md).
- Không production database/credential/migration/API/UI/runtime/deploy.

## SF-3 — Pilot

Chọn lát cắt nhỏ ngoài Manufacturing freeze. Chạy trọn Requirement → Architecture → Build → Review → Test → Release Candidate; không deploy production. Có human UAT/evidence và cleanup nếu dùng fixture.

## SF-4 — OpenClaw Orchestration

Chỉ mở sau SF-0→SF-3 PASS. OpenClaw gọi Runtime Adapter/Tool Contract, không nhận shell/database/production privilege trực tiếp và không chứa Business Architecture/Domain Rules.

## Thứ tự đề xuất tiếp theo

1. SF2-C1 đã đóng PASS/STOP; không tự mở Codex/OpenClaw/runtime/production hoặc phase khác.
2. Mọi bước sau cần Founder approval mới và Quality Gate riêng.
