# BOS-AI1 READ Pre-Effect Handoff — Builder record

Authority: direct Founder decision confirmed 2026-09-03. This is a synthetic
proof candidate, not an approved baseline or permission to resume OC6.

## Origin and preservation

- Documentation parent: `0c2b16f381421538ce220270305534612974d615`.
- Verified tree: `ba8e496311c9c99a9f8094a8197b41df4d066def`.
- New branch: `proof/bos-ai1-read-pre-effect-v1`.
- Workspace: `BOS_AI1_READ_PRE_EFFECT_V1_WORKSPACE`, created clean at that exact
  parent inside the authorized local working directory.
- Approved DRAFT technical baseline remains
  `a0fbabb9e210b4fdf2ad2e7fc2b8e9f89200d0d0` /
  `6d0e3895400599570aefffaa14430231c1dfa443`.
- The existing 4,172 tracked files and all historical baseline/evidence objects
  are preserved. All READ proof changes are additions.

## Design implemented

The new module separates metadata authority, private Domain existence and the
private synthetic repository. The three public calls are `bos.evaluate`,
`preEffectAudit.record` and `applicationService.execute`. Each permit is branded,
bound to its issuing proof and all semantic request fields, and expires at the
earliest original task/delegation/request expiry. Replacing a grant cannot extend
an existing permit.

The Domain owns ALLOW/DENY/STOP. Only its ALLOW with a fresh authority check can
reach the private repository read. Missing/mismatched/vetoed resources share a
generic denial without a read or existence detail. Audit errors halt the flow.
Fixed filtering emits only enumerated status and bounded integer progress;
redaction adds a constant contact marker. Arbitrary text, nested data and raw
exceptions cannot enter the response or audit.

RESULT is recorded as PREPARED. A final current REG4/authority/expiry/Domain and
repository/pipeline revision check precedes a callback-free release. Data is
returned once and is not cached. Sequential, Promise-scheduled and reentrant
duplicates receive metadata or IN_PROGRESS. A separate receipt-check reservation
prevents a registry callback from recursively revalidating a completed request.

REG4 is a trusted synchronous current-snapshot primitive. Synthetic registry
fault/reentry hooks execute before the unchanged real REG4 lookup; the proof
does not claim to authenticate a malicious registry that fabricates approval.
Other hooks receive only frozen metadata and may inject a fault; non-undefined
returns and exceptions fail closed. Factory setup is a trusted synthetic harness,
not a production configuration API.

## Budget and verification plan

Five technical paths: one module, Builder fixture/test, Architect contract and
this record. Four evidence paths follow: Formal report, Independent report,
evidence narrative and portable JSON. Total planned footprint: 9/10 files.
No new libraries or edits to REG4, MG5, OC6, existing BOS modules/tests, backend,
Business Rules, database or migrations.

Development round 0: **1,494/1,494 PASS**, including **387/387 READ** and
**1,107/1,107 historical regression**. Fail/cancel/skip/todo: 0/0/0/0.
All three new source/fixture/test SHA-256 values and Git/worktree state were
unchanged during the run. The development manifest binds the working source
bytes; its HEAD is still the documentation parent and is not the new technical
candidate. Repairs after a Development/Formal/Independent verdict: **0/2**.

READ cases have unique names and cover R01 staged control (3), R02 audit faults
(39), R03 Domain and existence privacy (10), R04 live authority/expiry (129),
R05 permit bindings (60), R06 duplicates/reentry (35), R07 repository/pipeline and
late-change faults (40), R08 unsafe input/projection/harness (68), and R09 metadata
ledgers/log privacy (3). The portable package
retains exact case names and assertions in source plus TAP, rather than counting
manual claims as tests.

During initial construction, the Architect's alignment inspection found that
preallocating a release ID before the final registry callback could collide with
another action completed in that callback. The Builder moved ID allocation after
the final check, into the callback-free block, before any Development run or
technical candidate freeze. A focused cross-action test is included. The external
Architect notes retain the finding and confirmation; this was not the final
Independent Review.

Formal Test must run from a clean detached workspace at the frozen technical
commit/tree. Historical regression has 1,107 tests: DRAFT 176, earlier repository
suites 383, Controlled Publish independent 152, pre-effect independent 173 and
DRAFT independent 223. The six external historical fixture/test files are decoded
byte-for-byte from the approved DRAFT evidence artifact with SHA-256 checks.
READ Builder tests are counted separately; no skipped/todo/cancelled tests pass a
gate. A fresh Independent Reviewer uses a separate task and detached workspace.
All commands, output hashes, exact Git identities and source blob fingerprints
must be retained in the portable evidence package.

## Completion boundary

Only fake data, fake Domain/Repository and in-memory state/audit are exercised.
This proves same-process reservations and one API data release, not durable
multi-process idempotency, resilient storage, arbitrary redaction, timing-channel
resistance or production readiness. A lost response requires a separately
authorized new action; a duplicate never retrieves previously released data.

After every gate passes and clean scope is verified, only a non-force push to
the approved proof branch is authorized. No main/PR/merge/tag/release. OC6 stays
PAUSED at G0; no OpenClaw, model/API, Business AI Runtime or Production is opened.
Rollback is STOP and preserve candidate/evidence; do not rewrite historical refs.
The final handoff is Founder APPROVE / DENY BOS-AI1 READ Pre-Effect Handoff Proof
Baseline, not a Codex approval or an OC6 continuation.
