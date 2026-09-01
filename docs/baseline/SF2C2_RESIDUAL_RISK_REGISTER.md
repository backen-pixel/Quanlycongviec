# SF2-C2 Canonical Baseline — Residual Risk Register

> Decision date: 2026-09-01
>
> Current baseline: `bd281ab1d61d7177a593e449ac04ba1d4c79d882`
>
> Current tree: `3eb2266e4177fba76960316fa167895b01ec84fb`
>
> Founder disposition: three P2 findings accepted and retained open

## 1. Current gate summary

- Formal Traceable Test: `160/160 PASS`.
- Existing development checks: `153/153 PASS`.
- Independent rerun: `160/160 PASS`.
- Dependency audit: Critical `0`, High `0`, Moderate `0`, Low `0`, Info `0`.
- Independent Review: **PASS / STOP**.
- P0: `0`.
- P1: `0`.
- P2: `3` Founder-accepted open residuals.
- Blocking findings: `0`.

Acceptance means the three P2 findings do not block recording this exact
commit/tree as the SF2-C2 canonical technical baseline. Acceptance does not
close them, prove Production readiness or waive future Runtime/Production
controls.

## 2. Active P2 residual risks

| ID | Severity | Status | Residual risk | Continuing control / required future handling |
|---|---:|---|---|---|
| `IR-SX1-P2-01` | P2 | `FOUNDER-ACCEPTED RESIDUAL / OPEN` | The candidate commit and local FTT/IR attestations are exact-object and digest bound but are not cryptographically signed. | Preserve the exact commit/tree, tarball digest and FTT/IR archive digests. Use signed commits and attestations in a separately authorized future release/non-repudiation workflow. |
| `IR-SX1-P2-02` | P2 | `FOUNDER-ACCEPTED RESIDUAL / OPEN` | CPU/time/memory isolation is demonstrated by the adversarial development/formal test worker. Existing application XLSX parsers retain their current in-process architecture. | Do not infer Runtime or Production resource-isolation assurance. Address runtime parser isolation only if Founder separately authorizes a production-hardening scope. |
| `IR-SX1-P2-03` | P2 | `FOUNDER-ACCEPTED RESIDUAL / OPEN` | Excel export compatibility is demonstrated by representative write/reopen behavior, existing write-call contract and module loading, not through live delivery and storage. | Preserve the scoped compatibility claim. Require an authorized live integration gate before any Production delivery/storage assurance. |

## 3. P3 notes retained for audit

| ID | Status | Note | Boundary |
|---|---|---|---|
| `IR-SX1-P3-01` | `OPEN` | Independent execution used one Windows x64 / Node.js 22.20.0 environment. | Add a platform matrix only if a future release policy requires it. |
| `IR-SX1-P3-02` | `OPEN` | npm retained maintenance/deprecation warnings and Node retained its established experimental SQLite warning in SF2-C1/SF2-C2. | Audit is zero and suites pass; do not convert proof results into Production runtime support. |
| `IR-SX1-P3-03` | `DISCLOSED / SUPERSEDED` | IR retained initial harness, launcher and supplemental reporting probes before the final successful records. | Final authoritative records are `00c`, `01b`, `10c` and `11b`; probes did not modify or fail the candidate or FTT evidence. |

## 4. Historical predecessor risks

The former baseline `9c1bae61aa853eb438922b14bff720a32b6125d8`
retains its original three accepted P2 items in historical evidence:

1. no canonical aggregate regression command;
2. no dependency-vulnerability audit;
3. partial historical provenance/non-repudiation.

Those dispositions remain part of the historical audit trail and are not
deleted or rewritten. They are not the active P2 set for the current baseline.
The former no-audit gap is not carried into the current baseline because both
FTT and IR ran `npm audit --omit=dev` and reported zero at every severity. The
unsigned-attestation aspect continues through current `IR-SX1-P2-01`.

Historical record:
[SF2C2_HISTORICAL_BASELINE_9c1bae61.md](./SF2C2_HISTORICAL_BASELINE_9c1bae61.md).

## 5. Authorization boundary

This register does not authorize or open:

- merge into main, push, tag or release;
- AF3;
- BOS-AI1;
- REG4;
- MG5;
- OC6;
- Business AI Runtime;
- OpenClaw Production;
- Production Deployment;
- migration or database execution;
- any successor phase.

The baseline is explicitly **not Production-ready**. Each later gate requires
a separate Founder decision and must reassess the residual risks relevant to
its own scope.

**Register state: FOUNDER-ACCEPTED RESIDUALS OPEN / TRACKED / STOP.**
