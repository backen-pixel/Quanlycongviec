# SF2-C2 Staging Durable Factory / Artifact Evidence — Implementation Contract

> Contract date: 2026-08-31  
> Authority: Founder approval for **SF2-C2 only**  
> Status at authoring: `DESIGN COMPLETE → IMPLEMENTATION AUTHORIZED`  
> As-built gate: **SF2-C2 PASS / STOP**; Independent Review `P0=0, P1=0`  
> Environment ceiling: isolated local/staging evidence; runtime and production remain `NO_GO`

## 1. Review verdict before implementation

SF2-C1 already proves the SF2-B atomic record-set contract through separate loopback
processes: SQLite WAL/FULL transaction, CAS, unique request idempotency, complete
state/checkpoint/receipt/audit/evidence/seal recovery, multi-process contention,
lost-ACK recovery, restart, HMAC lifecycle and tamper denial. It remains a
single-host temporary proof with ephemeral service credentials and a proof KMS.

SF2-C2 must not replace or duplicate those primitives. The exact gap is the
absence of durable Software Factory semantics: there is no durable aggregate for
Requirement/Run, immutable Artifact Version lineage, review/test evidence bound to
an exact artifact digest, governed gate evidence, or handoff record that can be
reconstructed after a process restart.

The repository has no approved managed staging store, service IAM/mTLS, managed
KMS, WORM anchor or staging credential. SF2-C2 therefore implements a
staging-scoped semantic adapter over the existing `DurableStatePort` and
`DurableControlPlaneFoundation`. It does not claim operational or production
infrastructure readiness and keeps `production_ready=false`.

## 2. Reuse and non-duplication boundary

SF2-C2 reuses:

- `SoftwareFactoryAgentRegistry` for delivery identities and role/capability lookup;
- `artifactContracts` for semantic Artifact construction and verification;
- `evidenceContracts` for canonical provenance, redaction and evidence integrity;
- `qualityGate` for allowed state transitions and actor types;
- `DurableControlPlaneFoundation` for authorization binding, HMAC idempotency,
  CAS, atomic record sets, transaction seals, audit chain and recovery;
- any conforming `DurableStatePort`; SF2-C1 HTTP/SQLite/KMS remains the integration
  proof backing used by tests.

SF2-C2 will not create a second identity registry, approval authority, crypto/key
provider, durable transaction format, audit ledger, Business Agent Package
Registry, Agent Factory, runtime or Business OS rule engine.

One additive SF2-B primitive change is required: a verified read of the current
durable state. `DurableControlPlaneFoundation.readCurrentState()` will expose a
read-only result after the same current-tip, history, evidence and HMAC seal
verification used by recovery. It adds no mutation or authority and receives
regression coverage.

## 3. Persistence boundary and state model

One durable scope equals one Factory Run (`scope_id = run_id`). Each successful
semantic mutation derives the complete next Factory state and submits it through
the existing atomic CAS transaction.

The versioned state contains only canonical plain JSON:

- `factory_run`: run identity, requirement identity, current gate and timestamps;
- `requirement`: immutable reference to the Requirement Artifact version/digest;
- `artifact_versions[]`: immutable Artifact identity + monotonically increasing
  version + canonical digest + provenance + exact subject/parent references;
- `reviews[]`: immutable reviewer decision bound to an exact artifact version/digest;
- `test_evidence[]`: immutable QA/eval result bound to an exact artifact version/digest;
- `gate_events[]`: allowed transition, actor and exact evidence references;
- `handoffs[]`: from/to identities and exact artifact version/digest references;
- `release_evidence[]`: candidate-only evidence; no release/deploy authority;
- `trace_events[]`: append-only hash chain covering Requirement → Run → actor →
  Artifact Version/Digest → Test → Review → Gate → Handoff;
- `latest_artifact_versions`: derived immutable lookup material persisted as plain
  data and verified against the version list.

The durable SF2 record set remains authoritative for revision, idempotency,
checkpoint, receipt, transaction audit and keyed integrity seal. The semantic
state never treats a mutable file path or caller-declared digest as identity.

## 4. Operation contract

Allowed SF2-C2 operations are exactly:

1. `SF2C2_CREATE_FACTORY_RUN` — Product Owner creates Requirement Artifact v1 and Run.
2. `SF2C2_CREATE_ARTIFACT_VERSION` — the registry-authorized role creates the next
   immutable version; non-Requirement artifacts require immutable parent refs.
3. `SF2C2_RECORD_TEST_EVIDENCE` — QA creates a Test Artifact bound to an exact
   subject version/digest.
4. `SF2C2_RECORD_REVIEW` — Independent Security/Architecture Reviewer creates a
   Review Artifact bound to an exact subject version/digest.
5. `SF2C2_TRANSITION_GATE` — only the actor type permitted by `qualityGate`; PASS
   gates require exact, current, PASS evidence and never accept `UNKNOWN`.
6. `SF2C2_CREATE_HANDOFF` — distinct allowed identities, allowlisted target, exact
   immutable artifact refs; it never moves the gate implicitly.
7. `SF2C2_RECORD_RELEASE_EVIDENCE` — Release/Baseline authority may record only a
   `CANDIDATE`/`REJECTED` Release Artifact. Baseline, deploy and production
   execution remain denied.

Every command requires opaque authenticated authorization bound to run, request,
requirement, operation and actor. Caller-supplied role/authority is ignored; the
Software Factory Agent Registry is resolved server-side.

## 5. Integrity and lineage invariants

- `(artifact_id, version)` and `version_id` are immutable and unique per run.
- A new version is exactly `latest + 1`; stale/skip/overwrite is denied.
- Caller does not supply an authoritative artifact digest. The Factory computes it.
- Every subject/parent/evidence reference contains artifact ID, version and digest;
  all three must match a verified persisted Artifact.
- Review/Test actor must differ from the subject Builder. Release authority must
  differ from Builder, Reviewer and QA identities recorded for the candidate.
- Review `PASS` with P0/P1 severity is invalid. Test `PASS` with failures is invalid.
- Gate evidence is bound to the latest applicable artifact digest. Current
  evidence is tracked per exact subject and `artifact_id` stream. Negative
  evidence is sticky: a positive Artifact ID khác không che được
  `BLOCKED/CHANGES_REQUESTED/FAIL/REJECTED`; chỉ version mới cùng stream hoặc
  subject Implementation mới sau remediation mới supersede. Missing, stale,
  forged, contradictory or mismatched evidence means DENY.
- Trace events use sequence, previous event digest and event digest. On every read
  and before every mutation the complete semantic state and trace are verified.
- Durable receipt success is accepted only with the complete SF2 atomic record set
  and keyed transaction seal.

## 6. Separation of duties

The enforced authority split is:

```text
Product Owner → Requirement
Architect      → Architecture
Builder        → Implementation
Independent Reviewer → Review/BLOCK
QA/Eval        → Test evidence
Release Authority → candidate evidence only
```

`Builder ≠ Reviewer ≠ QA/Eval ≠ Release Authority`. The orchestrator may route and
handoff but cannot create PASS evidence. Automation may assemble a command but
cannot mint identity, authorization, approval or gate evidence.

## 7. Fail-closed and recovery contract

The adapter denies unknown/missing identity, authorization, policy, revision,
artifact integrity, evidence, gate prerequisite, durable state or dependency
outcome. A timeout/unavailable/unknown commit is recovered only through the SF2
complete-set verifier. It never becomes success from a receipt or semantic object
alone.

Required evidence includes restart/read recovery, same-request replay, changed
payload replay denial, duplicate delivery, CAS conflict, stale artifact version,
partial/missing record, artifact/digest/evidence tamper, unauthorized role,
Builder self-review, stale review/test evidence, gate bypass and dependency
timeout/unavailable. Recovery cannot append a second approval/release, advance a
gate, lose audit history or convert `FAILED/UNKNOWN` to `PASS`.

## 8. Audit and observability

Authoritative audit remains the SF2 durable hash chain and transaction seal. Each
semantic trace event additionally records timestamp, actor, requirement/run,
operation, immutable subject refs and previous digest. Operational telemetry may
be added later but can never replace or grant authoritative audit.

No raw secret, credential, Business OS production data or mutable file content is
stored as audit metadata. Pattern redaction remains a residual limitation, not a
DLP claim.

## 9. Rollback

SF2-C2 is additive. Rollback disables/removes the staging semantic adapter, its
exports, tests and documentation. Existing SF2-A/B/C1 contracts and proof records
remain readable. No Business OS migration, production schema, credential, Agent
package, Registry record or runtime exists to roll back.

## 10. Explicit boundary and STOP

This contract does not authorize BOS-AI1, AF3, REG4, MG5, OC6, BA7, FC8, PROD9,
Codex/OpenClaw execution, Business AI, production migration, credential or deploy.
SF2-C2 may produce durable Software Factory evidence only. If its gates PASS it
must immediately `STOP` for a new Founder decision.
