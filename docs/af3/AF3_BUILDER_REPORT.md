# AF3 Engineering Cell V1 — Builder Report

## 1. Control record

| Field | Value |
|---|---|
| Status | `READY FOR INDEPENDENT QA RE-REVIEW` |
| Requestor | Founder |
| Actor | Builder Agent (`/root/builder_agent`) |
| Authorized action | Implement and test only the Architect-approved canonical AF3 evidence-manifest proof; create the Builder report; make local commits |
| Authorization / policy basis | Founder Execution Order `OPEN AF3 — ENGINEERING CELL V1 PROOF`; root `AGENTS.md`; `docs/adr/0022-ai-software-factory-separation-of-duties.md`; `docs/architecture/software-factory/AGENT_RESPONSIBILITY_MATRIX.md`; `docs/architecture/software-factory/PERMISSION_MATRIX.md`; Architect contract `docs/af3/AF3_ARCHITECT_DESIGN.md` |
| Architect input commit | `8df33a52443133d3af74508f4f37cf1f3f7f7465` |
| Architect input tree | `45d2582b2c5bc6caa8db54f7460c6b2e437dcf00` |
| Working branch | `work/af3-engineering-cell-v1` |
| Canonical code baseline | `bd281ab1d61d7177a593e449ac04ba1d4c79d882` |
| Latest documentation record / branch start | `d8a917cab70f185c6f93a0b04e09c58ae89fa64b` |
| Builder exception | None |
| Self-repair rounds used | `1` of maximum `2` |

## 2. Implemented proof

The Builder implemented the Architect contract as one isolated CommonJS module.
It accepts synthetic, already-computed evidence descriptors; validates their
shape and values; copies and sorts them by ASCII path comparison; serializes
the exact canonical body; and returns that body plus its lowercase SHA-256
digest.

The utility is synchronous and does not mutate caller inputs. It uses only the
Node.js built-in `node:crypto`. It does not inspect or hash files and therefore
does not prove that a supplied descriptor matches file bytes.

## 3. Builder-owned files

| File | Action | Purpose |
|---|---|---|
| `tools/af3/canonical-evidence-manifest.js` | Added; repaired in round 1 | Contract implementation |
| `tools/af3/canonical-evidence-manifest.test.js` | Added; expanded in round 1 | Builder acceptance and regression tests using synthetic inputs |
| `docs/af3/AF3_BUILDER_REPORT.md` | Added; updated after round 1 | This Builder trace and handoff artifact |

No other file was modified by the Builder. The implementation candidate commit
contains only the first two files; this report is committed separately so the
candidate identity under independent review remains stable.

## 4. Acceptance coverage

The Builder suite covers:

1. Exact known-answer object, field order, ASCII path order, and a hard-coded
   independently precomputed digest.
2. Multiple permutations producing deep-equal output.
3. Non-mutation of caller-owned arrays and entry objects.
4. Digest changes after changing each accepted descriptor field.
5. Top-level type, empty-array, and 1001-entry rejection.
6. Missing key, extra key, and non-object entry rejection.
7. Invalid path matrix and duplicate-path rejection.
8. Invalid SHA-256 and byte-count matrices, plus byte boundary acceptance.
9. Sparse arrays rejected at every counted entry position.
10. Unknown enumerable Symbol own keys rejected.

## 5. Commands and results

All commands were run from the repository root on branch
`work/af3-engineering-cell-v1` with Node.js `v22.20.0`.

### Development acceptance run

```powershell
node --test tools/af3/canonical-evidence-manifest.test.js
```

Result: exit code `0`; tests `9`; pass `9`; fail `0`; cancelled `0`;
skipped `0`; todo `0`. This first acceptance run passed, so it did not start a
self-repair round.

### Staged-scope checks before the implementation commit

```powershell
git diff --cached --check
git diff --cached --name-only
```

Result: exit code `0`; the whitespace check emitted no errors; the only staged
paths were:

```text
tools/af3/canonical-evidence-manifest.js
tools/af3/canonical-evidence-manifest.test.js
```

### Initial implementation candidate commit

```powershell
git commit -m "feat(af3): add canonical evidence manifest proof"
git rev-parse HEAD
git rev-parse 'HEAD^{tree}'
```

Result: commit created successfully with two added files and `304` insertions.

### Initial exact-candidate formal Builder run

```powershell
node --test tools/af3/canonical-evidence-manifest.test.js
git diff --check 8df33a52443133d3af74508f4f37cf1f3f7f7465..HEAD
git diff --name-only 8df33a52443133d3af74508f4f37cf1f3f7f7465..HEAD
git status --short
git rev-parse HEAD
git rev-parse 'HEAD^{tree}'
```

Result: exit code `0`; tests `9`; pass `9`; fail `0`; cancelled `0`;
skipped `0`; todo `0`; `git diff --check` emitted no errors; changed paths were
exactly the two implementation paths; `git status --short` emitted no output;
the candidate worktree was clean.

### Independent QA findings and repair authorization

Independent QA reproduced two `P2` contract gaps in the initial candidate:

1. `new Array(1)` was accepted because `Array.prototype.map` skipped its hole,
   which allowed the output to serialize `entries:[null]`.
2. An unknown enumerable Symbol own key was ignored because `Object.keys`
   returns only string keys.

The AF3 Orchestrator (`/root`) authorized Builder repair round 1 under the
Founder's maximum-two-round self-repair corridor and the existing Architect
contract. Builder Agent (`/root/builder_agent`) performed the repair. The
Builder replaced hole-skipping iteration with mandatory indexed validation and
checked all enumerable own keys obtained from `Reflect.ownKeys`. No policy,
scope, public API, Business Rule, dependency, or runtime boundary changed.

The QA-owned file
`qa/af3/canonical-evidence-manifest.independent.test.js` was read and executed
but was not edited, staged, or committed by the Builder.

### Repair round 1 pre-commit verification

```powershell
node --test tools/af3/canonical-evidence-manifest.test.js
node --test tools/af3/canonical-evidence-manifest.test.js qa/af3/canonical-evidence-manifest.independent.test.js
git diff --cached --check
git diff --cached --name-only
```

Result: both commands exited `0`. The Builder suite reported tests `11`; pass
`11`; fail `0`; cancelled `0`; skipped `0`; todo `0`. The combined suite
reported tests `23`; pass `23`; fail `0`; cancelled `0`; skipped `0`; todo `0`.
The staged whitespace check emitted no errors, and only these Builder-owned
paths were staged:

```text
tools/af3/canonical-evidence-manifest.js
tools/af3/canonical-evidence-manifest.test.js
```

### Repair round 1 implementation candidate commit

```powershell
git commit -m "fix(af3): reject sparse and symbol-key entries"
git rev-parse HEAD
git rev-parse 'HEAD^{tree}'
```

Result: commit created successfully with two modified files, `36` insertions,
and `6` deletions.

### Exact repaired-candidate verification

```powershell
node --test tools/af3/canonical-evidence-manifest.test.js
node --test tools/af3/canonical-evidence-manifest.test.js qa/af3/canonical-evidence-manifest.independent.test.js
git diff --check a4e7f11fe0c7621853aa245f7c3b66f79b34132c..HEAD
git diff --name-only a4e7f11fe0c7621853aa245f7c3b66f79b34132c..HEAD
git diff --exit-code
git diff --cached --exit-code
git status --short --untracked-files=all
git rev-parse HEAD
git rev-parse 'HEAD^{tree}'
```

Result: both test commands exited `0`. The Builder suite reported tests `11`;
pass `11`; fail `0`; cancelled `0`; skipped `0`; todo `0`. The combined suite
reported tests `23`; pass `23`; fail `0`; cancelled `0`; skipped `0`; todo `0`.
`git diff --check` emitted no errors. Tracked and staged worktree diffs were
empty. Status showed only the preserved, untracked QA-owned independent test;
no Builder-owned path was dirty.

## 6. Implementation candidate identity

| Identity | Value |
|---|---|
| Full commit SHA | `c05d2f9a7cc8f8591df6d300301788dbca0ecc9b` |
| Tree | `46f858c4b7bfc324f65d43b85c7c3a685cfc6087` |
| Parent / preceding Builder-report commit | `8c146bcb7b5af036b330048638cf489f0cff5532` |
| Architect input in history | `8df33a52443133d3af74508f4f37cf1f3f7f7465` |
| Formal Builder test | `PASS` |
| Combined Builder + preserved QA test | `PASS` |

This candidate supersedes initial candidate
`a4e7f11fe0c7621853aa245f7c3b66f79b34132c` (tree
`a75504f5e40010d2ca30464b8993a93637beb697`), which must not be used for a
Founder baseline decision because of the two `P2` gaps recorded above. The
later updated Builder-report commit is documentation only and must not be
misrepresented as the repaired implementation candidate.

## 7. Boundaries and exceptions

- No application source, existing test, Business Rule, database, migration,
  dependency manifest, lockfile, runtime configuration, deployment, baseline,
  tag, or release file was changed.
- No filesystem, environment, network, database, OpenClaw, Business AI
  Runtime, application server, staging, Production, or real-data access was
  performed by the implementation or tests.
- Test inputs contain only synthetic paths, hashes, and byte counts.
- No credential or secret was discovered or used.
- No test was weakened. Repair round `1` of maximum `2` corrected both
  independently reproduced `P2` gaps; repair round 2 was not used.
- No STOP condition, implementation exception, or Critical/High vulnerability
  was identified by the Builder.
- The Builder did not push, merge, tag, release, deploy, change a baseline, or
  approve AF3.

## 8. Handoff to Independent QA

Independent QA should review the exact implementation candidate
`c05d2f9a7cc8f8591df6d300301788dbca0ecc9b` with tree
`46f858c4b7bfc324f65d43b85c7c3a685cfc6087`, inspect this updated report, and
re-run its preserved QA-owned black-box suite. QA may create or update only the
QA-owned artifacts named in the Architect contract and must not alter Builder
source or tests. This handoff is not AF3 baseline approval and does not
authorize Runtime, Production, merge, tag, release, deployment, or a later
phase.
