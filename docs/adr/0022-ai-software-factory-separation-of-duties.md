# ADR-0022: AI Software Factory và separation of duties

- **Trạng thái:** Accepted
- **Ngày:** 2026-08-30
- **Người đề xuất:** Nguyễn Phạm Hùng / Codex
- **Liên quan:** ADR-0019, ADR-0020, ADR-0021

## Ngữ cảnh

Business OS cần một quy trình AI hỗ trợ phân tích, xây dựng, review, kiểm thử và chuẩn bị phát hành phần mềm. Nếu dùng một “super agent” từ Requirement đến production, Agent có thể tự sửa policy, tự duyệt code, hạ test hoặc bypass domain/baseline gate. Business AI hiện tại cũng không được có source-code privilege, còn Software Factory không được có production business-data privilege.

Repo đã có domain boundary, test scripts, audit/approval primitive và baseline/recovery gate, nhưng chưa có canonical Agent Registry, handoff artifact, separation of duties hoặc Quality Gate cho software delivery.

## Quyết định

### 1. Tách hai hệ AI

`Business AI Runtime` và `Software Factory Runtime` dùng identity namespace, permission, tool scope, runtime policy và audit trail riêng. Có thể tái sử dụng primitive Identity/Policy/Approval/Audit/Tool Contract nhưng không dùng chung privilege.

Business AI không được sửa source. Software Factory AI không được ghi production business data hoặc tự deploy/migrate production.

### 2. Không có super agent

Workflow chuẩn:

```text
Founder/Product Owner
→ Software Factory Orchestrator
→ Product Owner Agent
→ Solution Architect Agent
→ Implementation Agent
→ Independent Security/Architecture Reviewer
→ QA/UAT Agent
→ Release/Baseline Agent
→ Founder/authorized human approval
```

Builder, Reviewer, QA và Release Authority phải là identity khác nhau trên cùng Agent Run. Reviewer được `BLOCK`; không được sửa code rồi tự approve. Release Agent chỉ lập candidate/proposal và không thay Founder approval.

### 3. Canonical registry và policy

`SoftwareFactoryAgentRegistry` là nguồn capability/path/handoff/policy version. Runtime/prompt không được tự gán hoặc nâng role. Dangerous action deny-by-default, gồm production deploy/migration/data write, destructive DB, bypass tenant/permission/Domain Rules/Quality Gate, force push, rewrite migration, hạ test, self-approve và sửa protected baseline.

Backend Agent bắt buộc có Domain Context và chỉ triển khai Approved Requirement + ArchitectureArtifact qua Application Service/Domain Rules. Frontend không sở hữu Business Rules. Database Agent chỉ lập migration/rollback/backup proposal; production migration bị deny.

### 4. Artifact, handoff và quality gate

Mọi handoff cần immutable Requirement/Architecture/Implementation/Review/Test/Release Artifact gắn `requirement_id`, `run_id`, actor và evidence. “Done/PASS” không có evidence không hợp lệ.

Quality Gate dùng state machine fail-closed từ `REQUESTED` đến `BASELINED`; không cho skip. Release candidate chỉ được tạo sau Review/Test/UAT gate phù hợp và baseline cần Founder/authorized human approval.

### 5. Runtime-neutral

Agent Definition tách khỏi runtime bằng adapter contract. Codex adapter thuộc SF-2, OpenClaw orchestration thuộc SF-4. Không runtime nào được bypass registry/policy hoặc nhận production privilege mặc định.

### 6. Triển khai theo wave

- SF-0: architecture/guardrail.
- SF-1: core control plane tối thiểu.
- SF-2: Codex Execution Adapter.
- SF-3: pilot ngoài Manufacturing freeze.
- SF-4: OpenClaw orchestration.

Không tự mở wave sau khi wave hiện tại chưa có test/evidence và independent review.

## Implementation SF-1 được chấp thuận

SF-1 là package CommonJS in-memory tại `backend/src/softwareFactory/`, không route, database, migration, Supabase, UI hoặc runtime thật. Package chứa registry/policy, Artifact/Handoff, Quality Gate, human approval, trace và append-only hash-chain audit.

Thiết kế này additive và không chạm Manufacturing Backward Scheduling. Các path migration 587/588, schedule domain/helper/route/test/UAT/ADR/baseline bị policy trả `BLOCKED_BY_BASELINE_DEPENDENCY`.

### P0 Security Remediation sau independent review

Independent review đầu tiên kết luận `BLOCKED` vì identity/Founder authority còn do caller tự khai, write tool có thể thiếu tool/path, runtime contract chưa tạo execution boundary và state in-memory còn lộ mutator.

SF-1 P0 remediation chốt bổ sung:

- Control Plane không còn nhận `agent_id`, role, namespace hoặc authority từ command caller; Agent/Human actor phải là opaque authenticated context do trusted principal resolver phát.
- Human approval là HMAC token có nonce, `issued_at`, `expires_at`, one-time consumption và binding tới `requirement_id/run_id/run_cycle/release_artifact_id/target_digest`.
- Tool → Action là canonical mapping ở backend; caller tự khai action bị deny. Write/test/migration-file tool thiếu path bị deny và test path không thể được phân loại thành source implementation.
- `executeAuthorizedAction()` là đường execution duy nhất; `recordToolInvocation()` trực tiếp bị deny. Runtime không được cung cấp identity và chỉ nhận opaque grant sau policy + Agent/Run/Gate.
- Run/artifact/handoff/approval/registry/audit và helper mutating được đóng bằng private fields/methods.
- Staging/production migration và business-data/database write tools đều deny trong SF-1.

Remediation chỉ dùng mock runtime trong test, không nối Codex/OpenClaw, không schema/API/UI và không mở wave kế tiếp. Independent re-review/P1 vẫn là điều kiện trước SF-1.5/SF-2.

## Phương án đã xét

1. Một autonomous super agent — không chọn vì vi phạm separation of duties và production safety.
2. Dùng Business AI runtime/privilege cho Software Factory — không chọn vì privilege crossover.
3. Xây database/API/UI đầy đủ ngay — không chọn vì chưa kiểm chứng policy và có thể ảnh hưởng baseline đang freeze.
4. Runtime-neutral core in-memory, kiểm chứng guardrail trước persistence/adapter — được chọn.

## Hệ quả

- SF-1 kiểm chứng được policy và state machine mà không thay schema hoặc dữ liệu.
- In-memory core chưa phải hệ thống vận hành bền vững; restart mất state và chưa có concurrent/idempotent persistence.
- Chưa có independent reviewer runtime, Codex/OpenClaw adapter, Founder UI/API hoặc release automation.
- Commit/tag capability trong registry là quyền lập proposal có điều kiện, không phải production release authorization.
- Legacy `/api/assistant` direct-write vẫn là conflict riêng theo ADR-0021 và không được nối vào Factory.
- Không đổi Manufacturing scheduling behavior/UAT/baseline/tag và không deploy production.

## Rollback

SF-1 không có data/schema. Rollback bằng cách bỏ package `backend/src/softwareFactory/`, test/script và tài liệu ADR/architecture tương ứng. Không down migration và không tác động Business OS đang chạy.

## Liên kết

- [AI Software Factory Architecture](../architecture/AI_SOFTWARE_FACTORY_ARCHITECTURE.md)
- [AI Agent Architecture](../architecture/AI_AGENT_ARCHITECTURE.md)
- [ADR-0020](./0020-domain-owned-business-rules-business-os-orchestration.md)
- [ADR-0021](./0021-business-ai-os-agent-runtime-and-company-context.md)
- [Decision Log](../PROJECT_DECISION_LOG.md)
