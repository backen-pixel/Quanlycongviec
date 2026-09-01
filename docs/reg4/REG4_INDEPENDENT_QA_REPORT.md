# REG4 — Agent Registry V1 Proof — Independent QA Report

## Control record

| Field | Value |
|---|---|
| Status | `INDEPENDENT QA PASS` |
| Actor | Independent QA Agent (`/root/reg4_independent_qa`) |
| Technical Git identity | `tudonghoa-dev <tudonghoa@vanphuthanh.net>` |
| Branch | `work/reg4-agent-registry-v1` |
| Implementation candidate | `66b291fe01aaf62d61c72b3cf9feecd4c2d1a9ef` |
| Candidate tree | `ba3162906f1cbcac5c8a703bbe9bf4367195efef` |
| Builder report input HEAD | `510ade1a06d572b07ace02c40e17da34702b6b21` |
| Builder report input tree | `4f43c1ea6b6479b57c033c431cdc8cf1e118462e` |
| QA test artifact / formally tested HEAD | `c4cf2d2af8ad95f3196e846ac84e499cadcbee18` |
| QA test artifact / formally tested tree | `90b50c2d223ddb08c980e0881d8febda48657a3b` |
| QA repair or candidate-fix rounds | `0` |
| Exception / waiver | None |

QA read the root `AGENTS.md`, Architect design, implementation source, Builder
test, and Builder report. QA authored independent fixtures and SHA-256/audit
oracles using `node:crypto`; it did not import Builder test helpers.

## Candidate immutability and artifact identity

`git diff --exit-code 66b291fe01aaf62d61c72b3cf9feecd4c2d1a9ef..c4cf2d2af8ad95f3196e846ac84e499cadcbee18 -- tools/reg4/agent-registry.js tools/reg4/agent-registry.test.js`
exited `0` with no output.

| Artifact | Git blob at candidate and tested HEAD | File SHA-256 |
|---|---|---|
| `tools/reg4/agent-registry.js` | `e08b58ba8c5e8dbdcdc0a097defb54f74f26f586` | `554e6447a85ad83f3e7c9a00cc323f6f653fd634b3a7386508c961e475ed1245` |
| `tools/reg4/agent-registry.test.js` | `762223cf28a489615e813d67eaf9219ba39f3075` | `ac3c66fc0e360caf1697fccffd0fe18b3040801696d00e98cff4687c460598e6` |
| `qa/reg4/agent-registry.independent.test.js` | Tested at QA artifact commit | `79176b1c6b7b23971f45ec4bd67d754f1113549b9dc35e6a5025be5032545a28` |

The AF3 implementation commit `c05d2f9a7cc8f8591df6d300301788dbca0ecc9b`
and SF2-C2 canonical commit `bd281ab1d61d7177a593e449ac04ba1d4c79d882`
were both verified as ancestors of branch start
`b19fef26e6ded04d6496c6478ff84eaf879f074e`.

## Formal commands and totals

| Command | Exact Git state | Exit | Tests | Pass | Fail | Cancelled | Skipped | Todo |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| `node --test tools/reg4/agent-registry.test.js` | `510ade1a06d572b07ace02c40e17da34702b6b21` | 0 | 12 | 12 | 0 | 0 | 0 | 0 |
| `node --test qa/reg4/agent-registry.independent.test.js` | `c4cf2d2af8ad95f3196e846ac84e499cadcbee18` | 0 | 12 | 12 | 0 | 0 | 0 | 0 |
| `node --test tools/reg4/agent-registry.test.js qa/reg4/agent-registry.independent.test.js` | `c4cf2d2af8ad95f3196e846ac84e499cadcbee18` | 0 | 24 | 24 | 0 | 0 | 0 | 0 |

At the formally tested QA commit, `git diff --check
b19fef26e6ded04d6496c6478ff84eaf879f074e..HEAD` exited `0`, the worktree
was clean, the branch was exact, and the commit author matched the authorized
technical identity.

## Independent trace matrix

| QA ID | Independent control | Result |
|---|---|---|
| `REG4-Q01` | Registration identity, exact minimum record, initial `DRAFT`, accepted audit | PASS |
| `REG4-Q02` | All five statuses and all seven legal lifecycle edges | PASS |
| `REG4-Q03` | Self-approval denial for creator and Agent identity | PASS |
| `REG4-Q04` | Same-content duplicate and different-content same-version immutability | PASS |
| `REG4-Q05` | Valid-format mismatched package SHA-256 rejection | PASS |
| `REG4-Q06` | Both mandatory passing evidence types required for approval | PASS |
| `REG4-Q07` | Every illegal edge, every wrong role on legal edges, missing package and invalid target | PASS |
| `REG4-Q08` | One audit per accepted/rejected attempt, sequence continuity and independent hash-chain recomputation | PASS |
| `REG4-Q09` | Hard-coded canonical known answer, independent preimage, permutations and field sensitivity | PASS |
| `REG4-Q10` | Deep-copy isolation for inputs, returns, reads and audit snapshots; reads do not audit | PASS |
| `REG4-Q11` | Strict objects, bounds, duplicates, sparse arrays, extra/non-enumerable/Symbol/accessor rejection without getter execution | PASS |
| `REG4-Q12` | Deterministic timestamps and rejected-operation package timestamp non-mutation | PASS |

## Findings and separation of duties

| Severity | Open findings |
|---|---:|
| P0 | 0 |
| P1 | 0 |
| P2 | 0 |

QA made no fix to Builder source, Builder tests, Builder report, or Architect
design. QA changed only its two owned paths: the independent test and this
report. No candidate failure was returned to Builder, and no QA waiver was
used.

At tested commit `c4cf2d2a`, the branch-start diff contained exactly five
planned REG4 files: Architect design, the two implementation-candidate files,
Builder report, and QA test. This report is the sixth planned REG4 file, keeping
the proof within `6/20` changed files. No dependency, database, migration,
Business Rule, application code, AF3 artifact, baseline record, Runtime,
Production, secret, credential, or real data was changed or required.

## Limitations and QA decision

The proof remains intentionally in-memory and process-local. Actor contexts
and evidence references are synthetic trusted metadata, declared permissions
are not runtime enforcement, and the audit chain is neither durable nor
externally signed. Concurrency, persistence, authentication, API integration,
OpenClaw, Model Gateway, Business AI Runtime, deployment, and Production remain
out of scope.

Independent QA decision: `PASS — READY FOR INDEPENDENT REVIEW AND EVIDENCE PACKAGING`.

This is not Independent Review, Founder approval, or an REG4 baseline claim.
QA did not push, force push, merge, tag, release, deploy, or open MG5, OC6,
Runtime, or Production.
