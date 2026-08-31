# Software Factory Handoff và Artifact Contracts

Mọi artifact là immutable version, có `artifact_id`, `artifact_type`, `requirement_id`, `run_id`, `created_by`, `created_at`, `version` và `payload`. Không chấp nhận handoff chỉ ghi “Done/PASS”.

## RequirementArtifact

`objective`, `business_context`, `scope`, `out_of_scope`, `acceptance_criteria`, `risks`, `definition_of_done`.

## ArchitectureArtifact

`affected_domains`, `domain_owner`, `application_services`, `orchestration`, `schema_impact`, `api_impact`, `permission_impact`, `tenant_impact`, `migration_required`, `adr_required`, `test_strategy`.

## ImplementationArtifact

`files_changed`, `reason`, `implementation_summary`, `tests_added`, `migration_added`, `known_risks`.

## ReviewArtifact

`reviewer`, `findings`, `severity`, `architectural_conflicts`, `security_conflicts`, `status` (`PASS`, `BLOCKED`, `CHANGES_REQUESTED`).

## TestArtifact

`test_kind` (`AUTOMATED`/`UAT`), `tests_run`, `passed`, `failed`, `skipped`, `fixture`, `cleanup`, `evidence`, `status`.

## ReleaseArtifact

`commit`, `tag`, `baseline`, `database_state`, `migration_state`, `backup`, `recovery_point`, `approvals`, `release_status`.

## Handoff contract

Handoff bắt buộc có:

- `handoff_id`, `requirement_id`, `run_id`;
- `from_agent_id`, `to_agent_id`;
- ít nhất một `artifact_id` thuộc đúng Requirement/Run;
- target nằm trong `handoff_targets` của registry;
- audit event chứa target và artifact IDs.

Artifact của run khác, self-handoff hoặc thiếu evidence bị deny. Handoff không tự chuyển Quality Gate; transition là command riêng có prerequisite riêng.

