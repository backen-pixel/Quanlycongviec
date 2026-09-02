# REG4 — Agent Registry V1 Proof — Final Independent QA Report

## Control record

| Field | Value |
|---|---|
| Status | `INDEPENDENT QA PASS — P1-01 CLOSED` |
| Actor | Independent QA Agent (`/root/reg4_independent_qa`) |
| Technical identity | `tudonghoa-dev <tudonghoa@vanphuthanh.net>` |
| Execution state | Detached HEAD in the approved REG4 hardening workspace |
| Original implementation candidate | `66b291fe01aaf62d61c72b3cf9feecd4c2d1a9ef` |
| First audit-hardening candidate / tree | `907636bccca80e3a6921aa6a5e9e3e473409971f` / `4cc9677a8c81cd8f13bb34bf9aa5ecb290968606` |
| Final context-hardening candidate / tree | `a5f3770e9795938d1d5d445a143a4015bf3be58a` / `c423554dccff7d949dc2aa946ec0fd2f0250751a` |
| Final Builder report HEAD / tree | `38a77fe65812c82b5b9fe3895d60f9dec685ac4b` / `1c06d0211b426e98c0e7fd97c4a3a29be586f3d8` |
| Formally tested QA commit / tree | `8efbadac8513c7abb28ed50b3ff743c1cae40c52` / `bc17216d9ded5271f98de9afaa4feb0634f36cf9` |
| Builder repair budget | `2/2` consumed |
| Founder-authorized audit-hardening exception budget | `2/2` consumed |
| Exception / waiver remaining | None |

QA preserved its independently authored fixtures and `node:crypto` package/audit
oracles and did not import Builder helpers.

## Preserved QA artifacts and exception history

| Evidence | SHA-256 / result |
|---|---|
| Original P1 failure test copied before Builder hardening | `a73aecdc712fff1b017793ff18a53dc711bc7b6c69a158a860cc89ad5a95f0d9` |
| Strengthened final Independent QA test | `dce0facb1bcddd00bd995b53cbfbdfe6c5ac78625edd4b27f09a4864bea9055d` |
| First hardening candidate targeted re-test | Original test passed; strengthened replay test failed: `1/2` pass, P1 remained |
| First hardening failure | A genuine prior `SELF_APPROVAL_DENIED` error replayed from a malformed registration-request Proxy was emitted and audited as `SELF_APPROVAL_DENIED`, not context-owned `INVALID_INPUT` |
| Final hardening candidate targeted re-test | Original and strengthened tests passed: `2/2` |

The original hostile Proxy assertions remain present. The strengthened test adds
raw and Proxy-wrapped replay of genuine prior `SELF_APPROVAL_DENIED` and
`ACTOR_NOT_AUTHORIZED` errors through registration request/actor and transition
command/actor traps. No assertion was removed or weakened.

## Candidate immutability and artifact identity

The command below exited `0` with no output:

```powershell
git diff --exit-code a5f3770e9795938d1d5d445a143a4015bf3be58a..8efbadac8513c7abb28ed50b3ff743c1cae40c52 -- tools/reg4/agent-registry.js tools/reg4/agent-registry.test.js
```

| Artifact | Git blob at candidate and tested QA commit | File SHA-256 |
|---|---|---|
| `tools/reg4/agent-registry.js` | `be69c77be7559f8fb2ccf896612e65e0f605b595` | `417cab2beaa09c6e9649a9f1126f2af7937036f5ce84c721c84d1e1d001e6120` |
| `tools/reg4/agent-registry.test.js` | `9f77ce02b3d7dd8a499a6b77a7ee42e72259178c` | `019ac839a15f652cf43d314e04f29c206b545b0651f2b237948be9c37f827ae1` |
| `qa/reg4/agent-registry.independent.test.js` | QA-owned artifact at `8efbadac...` | `dce0facb1bcddd00bd995b53cbfbdfe6c5ac78625edd4b27f09a4864bea9055d` |

Builder did not edit the QA test. QA did not edit the implementation, Builder
test/report, Architect design, dependencies, application code, database,
migration, baseline, Runtime, or Production files.

## Exact formal commands and totals

All commands below were repeated after QA test commit
`8efbadac8513c7abb28ed50b3ff743c1cae40c52` and produced the exact totals shown.

| Command | Exit | Tests | Pass | Fail | Cancelled | Skipped | Todo |
|---|---:|---:|---:|---:|---:|---:|---:|
| `node --test --test-name-pattern="REG4-QP1" qa/reg4/agent-registry.independent.test.js` | 0 | 2 | 2 | 0 | 0 | 0 | 0 |
| `node --test qa/reg4/agent-registry.independent.test.js` | 0 | 14 | 14 | 0 | 0 | 0 | 0 |
| `node --test tools/reg4/agent-registry.test.js` | 0 | 13 | 13 | 0 | 0 | 0 | 0 |
| `node --test tools/reg4/agent-registry.test.js qa/reg4/agent-registry.independent.test.js` | 0 | 27 | 27 | 0 | 0 | 0 | 0 |

The same four commands also passed with identical totals immediately before the
QA artifact commit.

## Independent trace and audit completeness

| Test scope | Result |
|---|---|
| `REG4-Q01`–`REG4-Q12`: registration, all lifecycle states/edges, roles, self-approval, evidence, immutable versions, fingerprint, strict input, deep copy, timestamps, and canonical SHA | PASS |
| Original `REG4-QP1-01`: registration/transition Proxy traps, nested/hostile thrown Proxy, poisoned error, exactly-one correlated audit, no partial state | PASS |
| Strengthened `REG4-QP1-01`: raw and Proxy-wrapped genuine system-code replay across request/actor/command contexts | PASS |
| Context ownership | Malformed request/command resolves to `INVALID_INPUT`; malformed actor resolves to `INVALID_ACTOR`; prior system reason codes are not replayed | PASS |
| Outgoing error | Fixed metadata allowlist, canonical bounded message/stack, no internal path, cause, origin stack, payload, arbitrary property, secret, or credential marker | PASS |
| Audit record | Fixed key allowlist and reason catalog; exactly one rejected audit per attempt; safe actor/null fields; no raw payload or secret | PASS |
| Audit continuity | Deterministic correlation IDs, continuous sequence, previous-hash linkage, and independent full-chain SHA-256 recomputation including `correlation_id` | PASS |
| Mutation safety | Rejected attempts create no package and do not change status, fingerprint, evidence, or timestamps | PASS |

## Findings and scope

| Severity | Open findings |
|---|---:|
| P0 | 0 |
| P1 | 0 |
| P2 | 0 |

P1-01 closure conclusion: `CLOSED BY FINAL INDEPENDENT QA`.

QA made no source fix. Its only owned changes are
`qa/reg4/agent-registry.independent.test.js` and this report. The REG4 proof
still changes only the six planned paths relative to branch start, within the
Founder limit of `20`. No dependency, database, migration, Business Rule,
secret, credential, real data, OpenClaw, Model Gateway, Runtime, deployment, or
Production access was introduced.

## Limitations and decision

The proof remains process-local and in-memory. Synthetic actor contexts are not
authenticated, evidence references are declared metadata rather than opened
artifacts, declared permissions are not Runtime enforcement, and the audit
chain is not durable or externally signed. Concurrency, persistence, APIs,
deployment, Runtime, and Production remain out of scope.

Independent QA decision:
`PASS — READY FOR INDEPENDENT REVIEW AND EVIDENCE PACKAGING`.

This report is not Founder approval or a REG4 baseline declaration. QA did not
push, force push, merge, tag, release, deploy, or open MG5, OC6, Runtime, or
Production.
