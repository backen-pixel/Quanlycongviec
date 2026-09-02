# REG4 — Agent Registry V1 — Final Evidence Package

## 1. Control record

| Field | Value |
|---|---|
| Status | `READY FOR CONTROLLED PUSH AND FOUNDER BASELINE DECISION` |
| Requestor | Founder |
| Evidence owner | Orchestrator (`/root`) |
| Working target | `work/reg4-agent-registry-v1` |
| Branch start / AF3 documentation record | `b19fef26e6ded04d6496c6478ff84eaf879f074e` |
| Original implementation candidate | `66b291fe01aaf62d61c72b3cf9feecd4c2d1a9ef` |
| Original stopped HEAD | `65d268aa682ff0c7888f731ed7aa98f632a307ca` |
| Audit-hardening exception parent | `5d1ea91ab77acae8d9d2adf372b69378119428a2` |
| Final implementation candidate | `a5f3770e9795938d1d5d445a143a4015bf3be58a` |
| Final implementation tree | `c423554dccff7d949dc2aa946ec0fd2f0250751a` |
| Final Independent QA test commit | `8efbadac8513c7abb28ed50b3ff743c1cae40c52` |
| Formal-test / review target | `3def40122e4072f266c943bc4eb84d3164501339` |
| Formal-test / review tree | `aef6c623ce7f549b560af46e73a7ee6d0abd35ae` |
| Technical Git identity | `tudonghoa-dev <tudonghoa@vanphuthanh.net>` |
| Baseline authority | Founder only |

This package binds the completed REG4 proof chain:

`Founder requirement -> Architect -> Builder -> Independent QA -> Formal Traceable Test -> Independent Review -> Evidence Package -> Founder decision`

It is not a REG4 baseline approval and does not authorize merge, tag, release,
Business Rules, database, migration, OpenClaw, Model Gateway, Runtime, or
Production.

## 2. Proof objective and result

REG4 proves that a synthetic, in-memory Agent Package can be registered,
identified, versioned, fingerprinted with SHA-256, assigned declarative
permissions/tools/prohibitions/evidence, governed through approval states, and
traced through an append-only SHA-256 audit chain.

Final result: `PASS`.

The proof rejects:

- self-approval;
- same-version content replacement;
- mismatched package fingerprints;
- approval without required passing evidence;
- unauthorized or invalid lifecycle transitions;
- hostile Proxy failures that previously bypassed audit;
- attacker-mutated error metadata; and
- cross-context replay of genuine prior system reason codes.

Every tested accepted or rejected mutating attempt creates exactly one audit
record. Rejected hostile attempts do not partially mutate Registry state.

## 3. Separation of duties and permissions

| Role | Identity / ownership | Authorized scope |
|---|---|---|
| Architect Agent | `/root/reg4_architect` | Design contract and trace matrix only |
| Builder Agent | `/root/reg4_builder` | REG4 module, Builder test, Builder report |
| Independent QA Agent | `/root/reg4_independent_qa` | Independent test and QA report only; no Builder fixes |
| Independent Reviewer | `/root/reg4_independent_review` | Read-only review in a separate clean worktree |
| Orchestrator | `/root` | Gates, formal test, evidence packaging, controlled push |

Registry authorization proven by the implementation:

| Registry actor role | Allowed action |
|---|---|
| `AUTHOR` | Register a package whose `created_by` matches the actor |
| `REVIEWER` | `DRAFT -> IN_REVIEW` and `IN_REVIEW -> BLOCKED` |
| `APPROVER` | `IN_REVIEW -> APPROVED` only when non-self and evidence-complete |
| `REGISTRY_ADMIN` | Retire a non-retired package |

Agent Package permissions are immutable declarative metadata only. They do not
grant Registry authority and are not runtime-enforced by this proof.

## 4. Preserved failure evidence and remediation history

### 4.1 Original P1-01

At stopped HEAD `65d268aa682ff0c7888f731ed7aa98f632a307ca`, a
Proxy `getPrototypeOf` trap could throw before the caught mutation boundary.
The rejected attempt produced no audit record.

Founder-authorized repair candidate
`2e8e42af4bfb4d41881cee1eaeae56e487e54d26` added safe extraction,
correlation IDs, error normalization, and Proxy tests. Independent QA then
proved that a previously issued `RegistryError` could be attacker-mutated and
re-thrown to control `reason_code` and error metadata.

### 4.2 Failure-test preservation gate

The failing Independent QA file was retained in the prior failure workspace,
then copied byte-for-byte into a new detached worktree created from
`5d1ea91ab77acae8d9d2adf372b69378119428a2`.

| Evidence | SHA-256 | Bytes |
|---|---|---:|
| Original copied failing QA test | `a73aecdc712fff1b017793ff18a53dc711bc7b6c69a158a860cc89ad5a95f0d9` | 40485 |
| Strengthened QA test before final candidate | `dce0facb1bcddd00bd995b53cbfbdfe6c5ac78625edd4b27f09a4864bea9055d` | 49700 |

The original assertions were retained. Independent QA added a stronger case
that replays genuine prior `SELF_APPROVAL_DENIED` and
`ACTOR_NOT_AUTHORIZED` errors through new request/actor Proxy contexts.

### 4.3 Audit-hardening exception

Exception round 1 candidate
`907636bccca80e3a6921aa6a5e9e3e473409971f` established a system-controlled
reason catalog, fixed audit allowlist, canonical error metadata, and private
error provenance. The copied original failure test passed, but strengthened QA
showed that provenance alone allowed a genuine system reason to cross into a
new validation context.

Exception round 2 candidate
`a5f3770e9795938d1d5d445a143a4015bf3be58a` introduced context-owned
validation boundaries and descriptor snapshots. Proxy-sensitive reflection is
contained at the current validation context, and later logic reads only copied
plain data. A thrown value is not trusted merely because it was once a genuine
Registry error.

The audit-hardening exception budget is exhausted at `2 / 2`.

## 5. Final error and audit controls

- Rejection codes come only from the immutable system error catalog.
- Accepted audit codes come only from the fixed operation map.
- Audit append revalidates the selected reason code against the allowlist.
- Hostile reflection failures become a new canonical context error:
  `INVALID_INPUT` for request/command/package data and `INVALID_ACTOR` for
  actor context.
- Outgoing errors use canonical bounded `name`, `code`, `message`, safe stack
  string, and `correlation_id` only.
- External message, origin stack, `cause`, arbitrary fields, symbols, payload,
  credentials, and secrets are not copied into audit or the returned error.
- `correlation_id` is system-generated, fixed-format, present in both the
  rejected audit and returned error, and covered by the audit hash.
- Every tested mutating attempt appends exactly one audit record.
- Rejected attempts do not change package content, status, or timestamps.
- Audit sequence, previous hash, and current hash are independently
  recomputed by QA.

## 6. Formal Traceable Test

Formal execution target:

```text
commit = 3def40122e4072f266c943bc4eb84d3164501339
tree   = aef6c623ce7f549b560af46e73a7ee6d0abd35ae
node   = v22.20.0
```

| Gate | Tests | Pass | Fail | Cancelled | Skipped | Todo | Exit |
|---|---:|---:|---:|---:|---:|---:|---:|
| Builder targeted `REG4-P1-01` | 1 | 1 | 0 | 0 | 0 | 0 | 0 |
| QA targeted original + strengthened `REG4-QP1` | 2 | 2 | 0 | 0 | 0 | 0 | 0 |
| Full Builder | 13 | 13 | 0 | 0 | 0 | 0 | 0 |
| Full Independent QA | 14 | 14 | 0 | 0 | 0 | 0 | 0 |
| Combined REG4 regression | 27 | 27 | 0 | 0 | 0 | 0 | 0 |

Repository gates:

| Check | Result |
|---|---|
| `git diff --check b19fef26...HEAD` | PASS, exit 0 |
| `git diff --check 5d1ea91...HEAD` | PASS, exit 0 |
| Source/Builder-test immutability from `a5f3770e...` | PASS, exit 0 |
| Changed paths before Evidence Package | 6 / 20 |
| Formal worktree | Clean |
| Main and baseline refs | Unchanged |

## 7. Founder requirement trace

| Requirement | Builder evidence | Independent evidence | Result |
|---|---|---|---|
| Register and identify Agent Package | `REG4-B01` | `REG4-Q01` | PASS |
| Version and lifecycle states | `REG4-B02` | `REG4-Q02` | PASS |
| No self-approval | `REG4-B03` | `REG4-Q03` | PASS |
| Same-version immutability | `REG4-B04` | `REG4-Q04` | PASS |
| Fingerprint mismatch rejection | `REG4-B05` | `REG4-Q05` | PASS |
| Required approval evidence | `REG4-B06` | `REG4-Q06` | PASS |
| Role and transition enforcement | `REG4-B07` | `REG4-Q07` | PASS |
| Complete accepted/rejected audit chain | `REG4-B08`, `REG4-P1-01` | `REG4-Q08`, both `REG4-QP1-01` tests | PASS |
| Canonical SHA-256 | `REG4-B09` | `REG4-Q09` | PASS |
| Defensive-copy isolation | `REG4-B10` | `REG4-Q10` | PASS |
| Strict malformed/Proxy input rejection | `REG4-B11`, `REG4-P1-01` | `REG4-Q11`, both `REG4-QP1-01` tests | PASS |
| Deterministic timestamps/no partial mutation | `REG4-B12`, `REG4-P1-01` | `REG4-Q12`, both `REG4-QP1-01` tests | PASS |

## 8. Independent Review

Independent Reviewer used a separate detached clean worktree at exact target
`3def40122e4072f266c943bc4eb84d3164501339`.

Final ledger:

```text
P0 = 0
P1 = 0
P2 = 0
P1-01 CLOSED = YES
READY FOR EVIDENCE PACKAGING = YES
```

The review independently exercised raw, poisoned, and Proxy-wrapped genuine
system errors across request, actor, and transition contexts. A reentrancy
probe produced two correct audits for two real attempts: the inner policy
rejection retained its system code while the outer hostile input used its own
context code. No ambient/global-token bypass, attacker-controlled audit code,
secret leak, duplicate audit, partial Registry mutation, dependency drift, or
scope expansion was found.

## 9. Canonical artifact fingerprints

To avoid Windows CRLF checkout variance, this manifest hashes canonical Git
blob bytes at formal target `3def40122e4072f266c943bc4eb84d3164501339`.
It covers the six upstream artifacts and intentionally excludes this Evidence
Package to avoid a self-referential hash.

| Path | SHA-256 of Git blob bytes | Bytes |
|---|---|---:|
| `docs/reg4/REG4_ARCHITECT_DESIGN.md` | `1cbbc7451ac12d112d26598130cddee1fcf683b6fcc926eaefba76217ad8759f` | 27433 |
| `docs/reg4/REG4_BUILDER_REPORT.md` | `e72bf5150933a48ed4d5d7d06a24925b031df303116fbfbb2e3823e56ab33b21` | 14645 |
| `docs/reg4/REG4_INDEPENDENT_QA_REPORT.md` | `61f05c2bd25e9e45b8da1e5041767f8f4edafa0c806aff55ffb81bea8a826d35` | 6757 |
| `qa/reg4/agent-registry.independent.test.js` | `3e99bf1116b8d7d507bf9d5172f8ddd6cecd3d0d8d6d73e4695027a212173d6d` | 48902 |
| `tools/reg4/agent-registry.js` | `20b8ac790590e5eb36b05f1f55fe4e8251558ad75396805c214d194f2459f3f5` | 24825 |
| `tools/reg4/agent-registry.test.js` | `eebbf6e00464f05558fa85603adef6021ee4ac75a3764986bde5ec8c4b129344` | 41973 |

Canonical six-artifact manifest:

```text
schema_version  = af3-evidence-manifest/v1
hash_algorithm = sha256
entry_count    = 6
manifest_sha256 = f0bc70af049a4acc2983c584c29bff615ad9c459d5de4c6887a9c6b209f5c33b
```

Canonical implementation identity:

```text
implementation commit = a5f3770e9795938d1d5d445a143a4015bf3be58a
implementation tree   = c423554dccff7d949dc2aa946ec0fd2f0250751a
source Git blob       = be69c77be7559f8fb2ccf896612e65e0f605b595
source blob SHA-256   = 20b8ac790590e5eb36b05f1f55fe4e8251558ad75396805c214d194f2459f3f5
```

## 10. Final changed-file scope

REG4 uses exactly seven planned additive paths, below the Founder limit of 20:

1. `docs/reg4/REG4_ARCHITECT_DESIGN.md`
2. `docs/reg4/REG4_BUILDER_REPORT.md`
3. `docs/reg4/REG4_INDEPENDENT_QA_REPORT.md`
4. `docs/reg4/REG4_EVIDENCE_PACKAGE.md`
5. `qa/reg4/agent-registry.independent.test.js`
6. `tools/reg4/agent-registry.js`
7. `tools/reg4/agent-registry.test.js`

No dependency manifest, lockfile, application source, existing application
test, database, migration, Business Rule, baseline, deployment, Runtime, or
Production artifact changed.

## 11. Audit completeness and residual limitations

Audit completeness for the REG4 proof contract: `COMPLETE`.

The final implementation proves exactly-one audit behavior for the accepted and
rejected operations in scope, including hostile reflection, poisoned errors,
cross-context system-code replay, nested arrays, and reentrancy probes.

Residual limitations are explicit and unchanged:

- actor identity and evidence are synthetic test metadata;
- the injected clock and host realm are trusted;
- Registry and audit state are process-local and non-durable;
- the audit chain is not externally signed;
- declared Agent permissions are not runtime-enforced; and
- Production identity, persistence, concurrency, API, Runtime, deployment, and
  release are outside REG4 V1.

## 12. Delivery gate and Founder decision

Controlled delivery may proceed only by a non-force push of the final clean
Evidence Package commit to:

`origin/work/reg4-agent-registry-v1`

After push, the Orchestrator must read back the remote SHA and require an exact
match with the local final Evidence Package commit. No merge, tag, release, or
baseline mutation is authorized.

After a successful matching push, the only remaining decision belongs to the
Founder:

`APPROVE REG4 BASELINE` or `DENY REG4 BASELINE`.

