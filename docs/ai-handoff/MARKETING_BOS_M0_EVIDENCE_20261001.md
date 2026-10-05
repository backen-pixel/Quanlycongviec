# Marketing / Business AI OS M0 - Verification record

Date: 2026-10-01. Issue #15. State: IN PROGRESS / implementation candidate, not production acceptance.

## Source identity

- Repository: backen-pixel/Quanlycongviec.
- Baseline: 0bc6392286df0b986cdd6dfc59b499916dd6fd31.
- Implementation tested: 33874dd2e3632c0a1127fd76cc7351a663138e9c.
- Six-file tree: 2d58a0abc5b73d48a878ea50245c1473c8d35d85.
- Branch: codex/marketing-bos-m0-20261001. Follow-up handoff-only commit preserves this code.

## Executed verification

| Check | Result | Boundary |
|---|---|---|
| Node 22.16.0 isolated container: node --test backend/tests/marketingEvidenceContract.test.js | 73 pass, 0 fail/skip | Synthetic data only |
| Node 24.19.0 fresh Windows clone of exact implementation commit: same command | 73 pass, 0 fail/skip | No app startup, env files, network calls or database from tests |
| node --check on helper and test | PASS | Syntax only |
| SHA-256 of six new Git blobs versus local tested files | 6/6 MATCH | Exact source identity, not runtime attestation |
| git diff --check | PASS | Whitespace check |
| Original CURRENT/WORKLOG contents after prepending this handoff | Byte-preserved suffix | No unrelated entry deleted |

The same assistant authored and reran these tests. Do not describe this as independent review or a full regression suite. GitHub CI has not run at the time this record is written; inspect the PR run on its exact head for a later result.

## Explicit non-results

No main merge, production release, migration, live adapter, new endpoint, application startup, DB/CRM read or write, advertising change, permission change, new background schedule, agent removal, independent reviewer verdict, full application build, staging smoke or actual source-to-CRM E2E occurred in M0.

The helper consumes normalized trusted adapter observations. It does not verify source signatures itself, authenticate the caller, supply a production Policy Engine, deduplicate through storage, count a campaign cohort, or authorize writes. UTM stays classification-only. Missing evidence stays UNKNOWN, never fabricated zero. Raw PII is not included in fixtures or outputs; pseudonymous hashes still require access controls.

## Rollback and next gates

Remove/revert only additive helper/test/workflow/docs and the two new handoff prefixes if abandoning M0; keep all original history and all customer data. No DB rollback exists because no DB was changed.

Review/CI exact head -> M1 scoped read adapter on approved target -> M2 controlled E2E, duplicates/retry, company/recipient and shadow reconciliation -> M3 specifically authorized release. Do not use the M0 pass count or a merge/deploy status as permission to turn on/increase advertising.
