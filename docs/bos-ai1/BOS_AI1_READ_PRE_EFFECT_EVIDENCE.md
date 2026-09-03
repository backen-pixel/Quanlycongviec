# BOS-AI1 READ Pre-Effect Handoff — Final Evidence Record

Disposition: **STOP for Founder APPROVE / DENY BOS-AI1 READ PRE-EFFECT HANDOFF
PROOF BASELINE**. This record does not approve a baseline or resume OC6.

## Version identity

Technical candidate: `b040d12a27ec0c99433a7c2abb988cc993cf337b`.

Technical tree: `4190816ac113d2b6352eb7d242b1d35a9f58ca1e`.

Documentation parent: `0c2b16f381421538ce220270305534612974d615`, tree `ba8e496311c9c99a9f8094a8197b41df4d066def`.

The containing evidence commit is a documentation-only direct child of the
technical candidate. It adds this record, the Formal report, Independent report
and portable JSON. The three source/fixture/test blobs remain exactly those in
the Technical candidate; the evidence commit does not replace that identity.
Its full commit/tree and verified GitHub tip are resolved after committing and
recorded in the final Founder handoff receipt, avoiding a self-referential hash.

## Gates

| Gate | Verified result |
|---|---|
| Development | 1494/1494 PASS: READ 387 + historical 1107 |
| Formal at exact candidate/tree | 1494/1494 PASS |
| Independent adversarial checks | 85/85 PASS, separately authored |
| Independent full regression | 1494/1494 PASS |
| P0 / P1 / P2 | 0 / 0 / 0 |
| Final tracked footprint | 9/10 paths, all additions |
| Conservative correction rounds | 1/2 |
| Implementation/Builder source-test repairs | 0 |
| Builder/Formal/Independent worktrees at gate | 3 CLEAN |
| Existing files preserved | 4172 |

The initial independent run was 83/85. Two reviewer-fixture assumptions were
corrected in one round: fractional numeric row input is rejected at snapshot,
and real REG4 rejects empty required permission/tool arrays. The final tests
assert early rejection and use valid unrelated nonempty grant tokens. No target
source or Builder test changed. Initial/final TAP, manifests and exact test bytes
are retained. The Builder record's 0/2 is the state at technical freeze; this
final record conservatively includes the later reviewer-fixture correction.

During initial construction, before Development or candidate freeze, Architect
inspection also led to allocating release IDs after the last callback so distinct
reentrant actions cannot collide. The Architect note and regression assertion are
preserved. No failed technical candidate was substituted or history rewritten.

## Demonstrated contract

- BOS ALLOW returns a control permit and metadata only; zero business reads.
- A distinct execution permit is issued only after pre-effect audit success.
- Application Service enters Domain; Domain ALLOW gates the private repository.
  Domain DENY/STOP produces no read, no release and no resource-existence detail.
- Fixed filtering/redaction precedes RESULT PREPARED and fresh authority/revision
  checks; then one callback-free operation returns the safe projection once.
- Audit, filter/redaction and dependency faults suppress data. Logs have metadata
  only; no raw rows, exception text, free text or row/projection content hashes.
- Agent, actors, grants, permissions, tenant/resource/version and original expiry
  remain checked. Sequential, Promise and reentrant duplicates return receipts or
  IN_PROGRESS without repeating data. Terminal receipt validation is itself locked.

The source module, Builder fixture/test, Architect contract and Builder record
are the five technical paths. Four evidence documents bring the total to nine.
MASTER CONTEXT, decision logs, historical evidence/baselines, REG4, MG5, OC6,
Business Rules, dependencies, backend, database and migrations are untouched.

## Scope and publication boundary

Only fake data, a synthetic Domain/Repository, fixed projection and in-memory
audit/state are recognized. The trusted registry primitive is the unchanged
REG4 synchronous current snapshot, with injected hooks before the real snapshot.
This does not establish real Domain Business Rules, arbitrary text redaction,
persistent/tamper-proof audit, distributed exactly-once delivery, timing-channel
resistance, production load/recovery, real models/APIs or operational readiness.
Legacy proof APIs remain historical; this record concerns the additive READ API.

Authorized destination: `https://github.com/backen-pixel/Quanlycongviec.git`,
branch `proof/bos-ai1-read-pre-effect-v1`. The final push gate checks the exact
evidence commit, clean proof worktrees, reviewed content and preserved source;
it creates the named branch or fast-forwards it only. Remote tip and main are
read back afterward, with the full witnesses in the final handoff receipt.

No force push, main update, Pull Request, merge, tag or release. No OC6 G0 rerun,
OpenClaw, real model/API, Business AI Runtime, Production or new phase. OC6 stays
PAUSED at G0. Only a later Founder baseline decision may authorize continuation.
Rollback is STOP and preserve all candidate/evidence history.

The portable JSON includes original raw test evidence, source hashes, Architect
notes, independent before/after snapshots, the corrected and original reviewer
tests, regression provenance, acceptance map and gate/action scripts. Artifact
paths/byte counts/SHA-256 are validated before the evidence commit and push.
