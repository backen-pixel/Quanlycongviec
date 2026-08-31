# Software Factory Permission Matrix

## 1. Capability matrix SF-1

| Agent | Code | Test code/run | Schema/new migration | Commit/tag proposal | Staging deploy | Production deploy/data |
|---|---:|---:|---:|---:|---:|---:|
| Orchestrator | No | No | No | No | No | **DENY** |
| Product Owner | No | No | No | No | No | **DENY** |
| Solution Architect | Docs only | No | No | No | No | **DENY** |
| Backend/Domain | Domain path only | Run | No | No | No | **DENY** |
| Frontend | Frontend path only | Run | No | No | No | **DENY** |
| Database/Migration | No implementation | No | New migration proposal | No | No | **DENY** |
| QA/UAT | No implementation | Test path + run | No | No | No | **DENY** |
| Independent Reviewer | No | Read evidence | No | No | No | **DENY** |
| Release/Baseline | No | Read evidence | No | Proposal only | No ở SF-1 | **DENY** |

## 2. Deny/approval policy

Luôn deny trong SF-1:

- production deployment/migration/business-data write;
- staging migration và staging/production database/business-data write; Database Agent chỉ được lập file migration proposal;
- destructive DB/data operation;
- bypass tenant/permission/Domain Rules/Quality Gate;
- rewrite migration history, force push hoặc protected baseline change;
- xóa test fail hoặc hạ Quality Gate;
- self-approve, Builder tự làm Reviewer/QA/Release;
- sửa Agent Registry/policy bằng Agent action;
- Business AI identity dùng Software Factory write tool;
- mọi ghi vào protected Manufacturing Scheduling baseline path.

Commit/tag chỉ là capability của Release Agent trong registry, không phải lệnh tự động. Candidate vẫn phải có Review/Test/UAT evidence và Founder approval trước `BASELINED`.

Identity/authority không lấy từ prompt, request body hoặc Runtime Adapter. Backend trusted principal resolver phát opaque context; policy chỉ nhận resolved identity. Founder approval là token ký, có nonce/expiry/one-time và binding ReleaseArtifact digest.

## 3. Path policy

- Path phải tương đối trong repo; absolute path và `..` bị từ chối.
- Write/test/migration-file tool bắt buộc có path; caller không được tự khai action vì backend suy ra action từ canonical tool.
- Backend Agent cần `domain` context và chỉ được ghi `backend/src/domains/{domain}/**` cùng test path.
- `source.write` không được ghi test path; test code chỉ dùng `test.write` bởi QA đã nhận đúng Run/Gate.
- QA được sửa test/evidence, không được sửa implementation.
- Database Agent chỉ tạo migration mới/rollback docs; không sửa migration đã chạy.
- Prohibited path được xét trước allowed path; policy fail closed.
