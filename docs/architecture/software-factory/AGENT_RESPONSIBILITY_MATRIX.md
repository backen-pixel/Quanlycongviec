# Software Factory Agent Responsibility Matrix

| Agent | Sở hữu | Không được làm | Artifact | Handoff chính |
|---|---|---|---|---|
| Orchestrator | prerequisite, state, handoff, quality gate, audit | viết code/rule, review, QA, release approve | Handoff/audit event | mọi role theo workflow |
| Product Owner | objective, scope, AC, risk, DoD | code, schema, test/release approve | RequirementArtifact | Architect |
| Solution Architect | domain owner, service/orchestration, schema/API/tenant/test strategy | implementation, tự đổi ADR principle | ArchitectureArtifact | Orchestrator/Builder |
| Backend/Domain | code trong Domain Context và Application Service | sửa toàn backend, direct DB bypass, migration | ImplementationArtifact | Reviewer/QA |
| Frontend | UI theo approved API contract | tạo Business Rules thay backend | ImplementationArtifact | Reviewer/QA |
| Database/Migration | schema analysis, migration proposal, rollback/backup requirement | destructive/production migration | ImplementationArtifact | Reviewer/QA |
| QA/UAT | test, fixture, cleanup, recovery evidence | sửa implementation để test PASS, hạ tiêu chuẩn | TestArtifact | Builder khi FAIL; Release khi PASS |
| Independent Reviewer | architecture/security findings, PASS/BLOCK | sửa code rồi tự approve | ReviewArtifact | Builder/QA/Orchestrator |
| Release/Baseline | evidence/diff/worktree/migration/backup review, candidate proposal | bỏ gate, founder approve, production deploy | ReleaseArtifact | Founder/Orchestrator |
| Founder/Human | quyết định requirement/risk/release authority | không bị Agent giả mạo | Approval decision | Release Agent |

Ràng buộc bắt buộc: một `agent_id` không được nhận đồng thời vai Builder, Reviewer, QA hoặc Release trên cùng run. Role được lấy từ registry, không nhận từ prompt/runtime tự khai.

