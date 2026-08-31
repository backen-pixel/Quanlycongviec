# SF2-C2 Canonical Baseline — Residual Risk Register

> Decision date: 2026-08-31
>
> Baseline commit: `9c1bae61aa853eb438922b14bff720a32b6125d8`
>
> Baseline tree: `4cc8bde842bab081323e196caf41947112749b71`
>
> Founder disposition: three P2 findings accepted as residual risk for this canonical-baseline decision

## 1. Gate summary

- TT-1: **PASS**.
- IR-1: **PASS / STOP**.
- Independent rerun: `144/144 PASS`.
- P0: `0`.
- P1: `0`.
- P2: `3` Founder-accepted residual risks.

Acceptance means the P2 findings do not block recording this exact commit/tree as the SF2-C2 canonical technical baseline. Acceptance does not close the findings, prove Production readiness or waive future Runtime/Production controls.

## 2. Active residual risks

| ID | Severity | Status | Residual risk | Continuing control / required future handling |
|---|---:|---|---|---|
| `IR1-P2-01` | P2 | `FOUNDER-ACCEPTED RESIDUAL / OPEN` | The repository has no established `test`, `test:full`, `test:regression` or equivalent canonical aggregate command. TT-1 and IR-1 ran all five established suites, but cannot claim an additional full-regression result. | Preserve the scoped `144/144` claim. Define and separately authorize a canonical aggregate command before relying on a single full-regression gate. |
| `IR1-P2-02` | P2 | `FOUNDER-ACCEPTED RESIDUAL / OPEN` | Locked dependency installation used `npm ci --ignore-scripts --no-audit --no-fund`; no vulnerability-audit result exists. Warnings identified `node-domexception@1.0.0` and `glob@10.5.0`. | Dependency-vulnerability status remains unknown. Require a separately authorized audit and any approved remediation before Runtime or Production eligibility. |
| `IR1-P2-03` | P2 | `FOUNDER-ACCEPTED RESIDUAL / OPEN` | Protected `assistant.js` bytes/blob are traceable, but historical commit association is unavailable. The remediation commit is unsigned and the local review attestation is digest-bound rather than cryptographically signed. | Preserve exact commit/tree and artifact digests. Use signed commits and attestations for a future release workflow. |

## 3. Non-P2 review notes retained for audit

- `IR1-P3-01` remains an open proof-runtime note: Node emitted `ExperimentalWarning` for built-in SQLite during SF2-C1 and SF2-C2. Passing proof suites do not establish Production SQLite support.
- `IR1-P3-02` is disclosed/closed as an execution-evidence note: the sandbox setup probe and initial static-runner expectation issue did not alter the candidate or produce a candidate/test defect; the surviving logs retain the audit trail.

## 4. Authorization boundary

This register does not authorize or open:

- AF3;
- BOS-AI1;
- REG4;
- MG5;
- OC6;
- Business AI Runtime;
- OpenClaw Production;
- Production Deployment;
- any successor phase, push, tag, merge, migration or deployment.

The baseline is explicitly **not Production-ready**. Each later gate requires a separate Founder decision and must reassess the residual risks relevant to its scope.

**Register state: RECORDED / RESIDUALS OPEN / STOP.**
