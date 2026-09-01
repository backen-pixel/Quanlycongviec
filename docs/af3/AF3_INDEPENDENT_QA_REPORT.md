# AF3 Engineering Cell V1 — Independent QA Report

## 1. Control record

| Field | Value |
|---|---|
| Status | `PASS — READY FOR EVIDENCE PACKAGE` |
| Requestor | Founder |
| Actor | Independent QA Agent (`/root/independent_qa_agent`) |
| Authorized action | Independently inspect the exact implementation candidate, author and run a black-box test suite, record findings and test evidence, and commit only the two QA-owned artifacts |
| Authorization / policy basis | Founder Execution Order `OPEN AF3 — ENGINEERING CELL V1 PROOF`; root `AGENTS.md`; `docs/adr/0022-ai-software-factory-separation-of-duties.md`; `docs/architecture/software-factory/AGENT_RESPONSIBILITY_MATRIX.md`; `docs/architecture/software-factory/PERMISSION_MATRIX.md`; `docs/af3/AF3_ARCHITECT_DESIGN.md` |
| Working branch | `work/af3-engineering-cell-v1` |
| Canonical code baseline | `bd281ab1d61d7177a593e449ac04ba1d4c79d882` |
| Latest documentation record / branch start | `d8a917cab70f185c6f93a0b04e09c58ae89fa64b` |
| Initial candidate reviewed | `a4e7f11fe0c7621853aa245f7c3b66f79b34132c` / tree `a75504f5e40010d2ca30464b8993a93637beb697` |
| Repaired candidate reviewed | `c05d2f9a7cc8f8591df6d300301788dbca0ecc9b` / tree `46f858c4b7bfc324f65d43b85c7c3a685cfc6087` |
| Builder-report head inspected | `ce4ec41266d5669588e80d5efe9e111b972c202c` / tree `1611c4e45b141ec1a2fcb9ed94bc9825a091b612` |
| Runtime used | Node.js `v22.20.0`; local test process only |
| QA files changed | `qa/af3/canonical-evidence-manifest.independent.test.js`; `docs/af3/AF3_INDEPENDENT_QA_REPORT.md` |
| Repair rounds observed | `1` of Founder maximum `2` |
| QA exception | None |

## 2. Independent review objective and separation

Independent QA verified the Architect contract for a deterministic utility that
validates already-computed evidence descriptors, sorts them in ASCII path order,
serializes the exact canonical body, and binds that body with SHA-256.

The QA suite was authored from the Architect contract without importing the
Builder test, its fixture factory, its expected object, or its known-answer
digest. It imports only the public proof function. Its oracle separately builds
the canonical body, encodes it as UTF-8, and hashes it with `node:crypto`. The QA
known-answer fixture and hard-coded digest differ from the Builder fixture.

Independent QA did not modify, reformat, stage, or commit the Architect design,
Builder source, Builder test, or Builder report. During repair round 1, QA
preserved its test while the distinct Builder identity changed only Builder-owned
files. Before the QA artifact commit, the independent test had Git blob digest
`517995adb295c02c1b36953b8138d777f6407710`.

## 3. Candidate identity, lineage, and source-diff verification

The repaired implementation candidate identity was independently resolved:

```powershell
git rev-parse c05d2f9a7cc8f8591df6d300301788dbca0ecc9b
git rev-parse 'c05d2f9a7cc8f8591df6d300301788dbca0ecc9b^{tree}'
```

Result: exit code `0`; commit
`c05d2f9a7cc8f8591df6d300301788dbca0ecc9b`; tree
`46f858c4b7bfc324f65d43b85c7c3a685cfc6087`.

The candidate is an ancestor of the inspected Builder-report head. The later
head contains documentation only relative to the candidate for the two
implementation paths:

```powershell
git merge-base --is-ancestor c05d2f9a7cc8f8591df6d300301788dbca0ecc9b HEAD
git diff --exit-code c05d2f9a7cc8f8591df6d300301788dbca0ecc9b HEAD -- tools/af3/canonical-evidence-manifest.js tools/af3/canonical-evidence-manifest.test.js
```

Result: both exit code `0`; the source diff emitted no output. Therefore the
working source and Builder test exercised by QA exactly matched the repaired
candidate, despite `HEAD` being the later Builder-report commit.

The repair commit itself changed exactly the two Builder-owned implementation
paths:

```text
M  tools/af3/canonical-evidence-manifest.js
M  tools/af3/canonical-evidence-manifest.test.js
```

The candidate-stage diff from the documentation record contained exactly four
planned AF3 paths: the Architect design, Builder report, implementation, and
Builder test. No application, existing test, Business Rule, database, migration,
dependency, runtime, Production, deploy, baseline, tag, or release path changed.

## 4. Design-drift, side-effect, and security inspection

The repaired candidate has no material design drift:

- It remains one isolated CommonJS module under `tools/af3/` with the contracted
  single synchronous export.
- It accepts only 1 through 1000 descriptors with the exact enumerable own-key,
  path, digest, byte-count, and duplicate-path constraints.
- It now performs indexed validation, so a sparse position is read and rejected
  rather than skipped.
- It now evaluates every enumerable own key through `Reflect.ownKeys`, so an
  unknown enumerable Symbol key is rejected.
- It copies validated primitive fields, sorts copies through `<` / `>` ASCII
  semantics, preserves the contracted body/key order, hashes UTF-8
  `JSON.stringify(body)` bytes, and returns a new result object.
- It does not mutate the caller array or descriptor objects.

Full source inspection found only the Node.js built-in `node:crypto` dependency.
The implementation contains no filesystem, network, environment, clock,
randomness, child-process, database, Supabase, application, OpenClaw, or Business
AI Runtime access. A targeted scan for prohibited side-effect tokens against the
exact candidate returned no match. No credential, secret, real business data,
Critical/High vulnerability, hidden Production effect, or Runtime entry point was
found.

## 5. Independent black-box coverage

The QA-owned suite contains 12 top-level `node:test` cases covering:

1. Independent canonical-body construction, UTF-8 bytes, `node:crypto` SHA-256,
   and a hard-coded known-answer digest.
2. Exact output and nested key order plus ASCII path order.
3. All six permutations of a three-entry fixture.
4. Accepted entry-count boundaries of 1 and 1000.
5. Accepted path-length boundaries of 1 and 240 and byte-count boundaries of 0
   and `Number.MAX_SAFE_INTEGER`.
6. Traversal, absolute, drive-prefixed, backslash, empty-segment, dot-segment,
   overlong, whitespace, and non-ASCII path rejection.
7. Duplicate-path rejection.
8. Malformed lowercase SHA-256 and byte-count rejection.
9. Top-level type, empty, 1001-entry, entry-object, missing-key, and extra-key
   shape rejection.
10. Sparse-array rejection.
11. Unknown enumerable Symbol-key rejection.
12. Frozen caller input non-mutation and digest binding of every accepted field.

All inputs are synthetic. The QA suite does not read files, inspect real data,
call a service, or open any application/runtime.

## 6. Formal command evidence

All commands below were run from the repository root on branch
`work/af3-engineering-cell-v1`.

### 6.1 Initial candidate — independent failure evidence

Against initial candidate `a4e7f11fe0c7621853aa245f7c3b66f79b34132c`
with tree `a75504f5e40010d2ca30464b8993a93637beb697`:

```powershell
node --test qa/af3/canonical-evidence-manifest.independent.test.js
```

Result: exit code `1`; tests `12`; pass `10`; fail `2`; cancelled `0`;
skipped `0`; todo `0`. Failures reproduced sparse-array acceptance and
enumerable Symbol-key acceptance.

```powershell
node --test tools/af3/canonical-evidence-manifest.test.js qa/af3/canonical-evidence-manifest.independent.test.js
```

Result: exit code `1`; tests `21`; pass `19`; fail `2`; cancelled `0`;
skipped `0`; todo `0`. Independent QA did not fix Builder-owned files. The
Orchestrator returned both findings to the distinct Builder Agent for authorized
repair round 1.

### 6.2 Repaired candidate — QA-only formal run

Against repaired candidate `c05d2f9a7cc8f8591df6d300301788dbca0ecc9b`
with tree `46f858c4b7bfc324f65d43b85c7c3a685cfc6087`:

```powershell
node --test qa/af3/canonical-evidence-manifest.independent.test.js
```

Result: exit code `0`; tests `12`; pass `12`; fail `0`; cancelled `0`;
skipped `0`; todo `0`.

### 6.3 Repaired candidate — combined formal run

```powershell
node --test tools/af3/canonical-evidence-manifest.test.js qa/af3/canonical-evidence-manifest.independent.test.js
```

Result: exit code `0`; tests `23`; pass `23`; fail `0`; cancelled `0`;
skipped `0`; todo `0`.

### 6.4 Repository checks before QA artifact commit

```powershell
git diff --check d8a917cab70f185c6f93a0b04e09c58ae89fa64b..HEAD
git diff --exit-code
git diff --cached --exit-code
git status --short
```

Result: all tracked whitespace, tracked-diff, and staged-diff checks exited `0`
with no output. Status showed only the authorized untracked `qa/` path before
this report was authored. Post-commit QA identity, six-path scope, and clean
worktree state are necessarily captured after this document is committed and
are handed to the evidence owner for the consolidated evidence package.

## 7. Findings ledger and disposition

| ID | Severity | Initial-candidate finding | Repair and independent verification | Final state |
|---|---|---|---|---|
| `AF3-QA-P2-001` | P2 | `new Array(1)` bypassed `map` validation and produced a manifest with `entry_count:1` and `entries:[null]` | Candidate `c05d2f9...` uses mandatory indexed validation; preserved QA sparse-array test now passes | `RESOLVED` |
| `AF3-QA-P2-002` | P2 | An unknown enumerable Symbol own key was ignored by `Object.keys` despite the exact-key contract | Candidate `c05d2f9...` checks enumerable keys from `Reflect.ownKeys`; preserved QA Symbol-key test now passes | `RESOLVED` |

Final open-finding counts:

| P0 | P1 | P2 |
|---:|---:|---:|
| 0 | 0 | 0 |

Historical resolved-finding counts are separate: `P0=0`, `P1=0`, `P2=2`.
Neither historical P2 was a Critical/High vulnerability or a Founder STOP
condition. Both were contract gaps in a bounded local, non-production proof and
were closed in repair round 1. No finding was waived, accepted as open, hidden,
or fixed by QA.

## 8. Audit completeness and boundaries

The QA record identifies the Founder requestor, Architect/Builder/QA separation,
policy basis, exact initial and repaired candidate commit/tree identities, later
documentation head, changed paths, exact formal commands and counts, finding
severity/disposition, repair-round count, limitations, and exceptions. Audit
completeness for the QA stage is `COMPLETE`; the self-referential QA commit SHA,
tree, and post-commit worktree status are supplied in the handoff immediately
after the two QA files are committed together.

Independent QA did not push, merge, force-push, tag, release, deploy, change a
baseline, access Production, open OpenClaw or Business AI Runtime, approve AF3,
or open a later phase.

## 9. Limitations and rollback

- The utility validates and binds caller-supplied descriptors; it does not read
  files or prove that a descriptor hash/byte count matches file contents.
- SHA-256 collision resistance is relied upon and not proven by this exercise.
- The proof is a local developer utility, not an untrusted remote parser or a
  production evidence collector.
- Testing used synthetic in-memory values only on Node.js `v22.20.0`; no Runtime,
  database, network, application server, real data, staging, or Production was
  exercised.
- No QA exception or waived finding exists.

There is no schema or data rollback. QA artifact rollback is a Git revert of the
QA-only commit; implementation rollback remains a Git revert of the AF3-only
Builder commits. No migration, deployment, or runtime recovery action is needed.

## 10. Independent recommendation

Independent Review result: `PASS`.

The repaired candidate `c05d2f9a7cc8f8591df6d300301788dbca0ecc9b`
with tree `46f858c4b7bfc324f65d43b85c7c3a685cfc6087` conforms to the AF3 Architect
contract within the reviewed scope. Design drift is absent; formal QA and
combined tests pass; open findings are `P0=0`, `P1=0`, `P2=0`.

Recommendation: proceed only to the AF3 evidence-package and Founder baseline
decision gate. This report is not `APPROVE AF3 BASELINE`, does not self-designate
a baseline, and does not authorize merge, Runtime, Production, deployment,
release, tag, or any later phase.
