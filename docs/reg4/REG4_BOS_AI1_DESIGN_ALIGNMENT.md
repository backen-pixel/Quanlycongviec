# REG4 to BOS-AI1 — Design Alignment Work

> Review date: 2026-09-02
>
> Work mode: read-only architecture comparison; no source/test change
>
> REG4 Technical Baseline: `3def40122e4072f266c943bc4eb84d3164501339`
>
> REG4 tree: `aef6c623ce7f549b560af46e73a7ee6d0abd35ae`
>
> Recommendation: **DO NOT OPEN BOS-AI1 IMPLEMENTATION**

## 1. Scope and source state

The exact REG4 baseline tree contains no dedicated, commit-bound BOS-AI1
architecture/design contract. The available comparison inputs are:

- [REG4 Architect Design](./REG4_ARCHITECT_DESIGN.md) and the approved
  [REG4 Evidence Package](./REG4_EVIDENCE_PACKAGE.md);
- [Business OS Blueprint](../BUSINESS_OS_BLUEPRINT.md), especially the governed
  AI permission and audit intent;
- [ADR-0025 CP1 governed thin slice](../adr/0025-cp1-governed-agent-control-plane-thin-slice.md);
- [CP1 architecture/review narrative](../architecture/CP1_AGENT_CONTROL_PLANE_AND_REVIEW.md);
- [ADR-0022 separation of duties](../adr/0022-ai-software-factory-separation-of-duties.md).

The CP1 architecture/review file carries a BR-1B reconstruction notice, so its
historical PASS statements are not used as current evidence. ADR-0022 also
links to ADR-0020, ADR-0021, `AI_AGENT_ARCHITECTURE.md` and
`AI_SOFTWARE_FACTORY_ARCHITECTURE.md`, but those artifacts are absent from the
exact baseline tree. This is a design-traceability gap, not a REG4 defect.

Accordingly, this Work compares REG4 with existing BOS/CP1 design intent. It
cannot certify a concrete BOS-AI1 design that does not yet exist.

## 2. Alignment matrix

| Approved REG4 contract | Expected BOS-AI1 integration point | Alignment | Gate before implementation |
|---|---|---|---|
| Exact `agent_id` and immutable `version` | Trusted Agent Identity and Agent Run admission | Partial conceptual match | Resolve identity/version server-side from Registry; model/caller declarations are never authoritative |
| Canonical `package_sha256` and same-version immutability | Package load and eligibility check | Gap | Verify exact package digest before dispatch; fail closed on missing, mismatch or drift |
| `permissions`, `required_tools`, `prohibited_actions` | Typed-tool and policy enforcement | Intent matches; contract absent | Define deny-by-default mapping; declarations constrain policy and never grant authority by themselves |
| Evidence required for `APPROVED` | Eligibility/evidence resolver | Gap | Resolve and verify current evidence server-side; a caller-supplied reference is not attestation |
| `DRAFT`, `IN_REVIEW`, `APPROVED`, `BLOCKED`, `RETIRED` | Admission, continued-run eligibility and revocation | Gap | Only `APPROVED` may start; define fail-closed behavior when an active version becomes `BLOCKED` or `RETIRED` |
| Self-approval denial and role-controlled transitions | Authenticated principal and approval authority | Principle matches | Author, reviewer, approver and runtime identities must remain separate and server-resolved |
| Wrong role/transition rejected | Registry control-plane boundary | REG4 complete; BOS binding absent | BOS must not reinterpret or bypass the Registry lifecycle with a separate quality-gate state |
| Exactly one safe, correlated audit per attempt | Registry → Agent Run → Context → Tool → Domain result trace | Conceptual match; operational gap | Define atomic/durable correlation, safe reason allowlist, retention, recovery and duplicate-delivery behavior |
| Synthetic in-memory proof boundary | BOS-AI1 implementation/runtime | Not runtime-sufficient | Design persistence, concurrency, IAM, revocation and recovery before implementation |
| Registry stores permission/evidence declarations only | Application Service and Domain-owned Rules | Compatible | BOS-AI1 must call allowlisted Application Services; neither Registry metadata nor prompt may own Business Rules |

## 3. Required design contract before implementation

A Founder-authorized architecture/design-only phase should produce a
commit-bound BOS-AI1 contract that closes at least these gates:

1. **Registry admission:** read-only resolver contract, exact version/digest,
   `APPROVED`-only eligibility and fail-closed unavailable/tamper behavior.
2. **Authority composition:** intersection of Registry declarations, trusted
   principal, immutable Company Context, tenant/company data scope and Domain
   policy; no authority from prompt or payload.
3. **Tool enforcement:** canonical typed-tool mapping, prohibited-action
   precedence, idempotency and no direct database/generic CRUD path.
4. **Evidence and revocation:** authoritative evidence resolution, freshness,
   `BLOCKED`/`RETIRED` handling and active-run termination policy.
5. **Audit/error contract:** system-owned reason codes, allowlisted metadata,
   end-to-end correlation, exactly-once attempt accounting, atomicity,
   durability, redaction and recovery.
6. **Separation of duties:** runtime cannot register, review, approve, mutate or
   retire its own package; Registry administration remains a separate control
   plane.
7. **Test/evidence plan:** negative tests for spoofing, digest drift, stale
   evidence, revocation race, cross-company access, forbidden tools, duplicate
   delivery, partial failure and audit tamper.

No listed gate requires changing the approved REG4 Technical Baseline. They are
consumer-side BOS-AI1 design obligations.

## 4. Explicit non-authorization

This comparison does not authorize or create:

- BOS-AI1 implementation or runtime adapter;
- Business Rules or changes to existing Application Services/Domain Rules;
- database, migration or production persistence;
- MG5, OC6, OpenClaw or Model Gateway;
- autonomous business write, Business AI Runtime or Production Deployment;
- merge to main, tag or release.

## 5. Verdict and Founder gate

Conceptual alignment is **PARTIAL**. There is no contradiction requiring a
REG4 baseline change, but there is no concrete BOS-AI1 design contract to
validate and the runtime-eligibility gaps above remain open.

```text
REG4 BASELINE STATUS = APPROVED / COMPLETE
BOS-AI1 DESIGN CONTRACT = MISSING
READY TO OPEN BOS-AI1 IMPLEMENTATION = NO
RECOMMENDED NEXT AUTHORITY = BOS-AI1 ARCHITECTURE/DESIGN-ONLY
CURRENT STATE = STOP
```

Founder must separately decide whether to authorize that design-only phase.
This Work does not self-open it.
