# Controlled Publish V1 — Formal Traceable Test

Result: **PASS**, executed 2026-09-02T15:18:35Z–15:18:39Z.

| Binding | Exact identity |
|---|---|
| Technical candidate commit | `1317f1468a341379f51e33b5631d7767af7c8848` |
| Technical candidate tree | `ab7296b7ac316ea24324f5dc431a66c3375d91ca` |
| Direct parent | `c0ba1b282422c68bd96478d7585f2c2381198420` |
| Parent tree | `02f6ed227a288009f449ef9de4e94ba98ceb6c33` |
| Controlled Publish source blob | `a61d296ee6347838bbd64f94ae24bd2d6d17e1b8` |
| Controlled Publish test blob | `d2739867f20c17e0c39c0ab95bf9a06a1b874853` |

Workspace: `C:\Users\HUNG\Documents\ChatGPT\Nhà máy ai agent\BOS_AI1_CONTROLLED_PUBLISH_FTT_WORKSPACE`.
Detached HEAD, clean before and after execution. Node v22.20.0, Git
2.54.0.windows.1, Windows NT 10.0.26200.0. No dependency installation.

| Gate | Pass | Fail / skipped | Exit |
|---|---:|---:|---:|
| Controlled Publish CP01–CP10 | 80/80 | 0 / 0 | 0 |
| BOS-AI1 original full regression | 40/40 | 0 / 0 | 0 |
| REG4 Builder + Independent regression | 27/27 | 0 / 0 | 0 |
| MG5 Builder + Independent regression | 48/48 | 0 / 0 | 0 |
| Combined | 195/195 | 0 / 0 | 0 |

Group runs and combined run are repeated execution of the same 195 tests,
not 390 unique test cases. Exact commands, UTC times, raw log SHA-256 and
environment are in `formal-manifest.json`; reproducible runner is
`run-formal.ps1` in the external evidence package.

## Observed behavior

- Missing approval: REQUIRE_APPROVAL with zero fake effects. Re-entry with
  bound approval performs initial and final REG4 reads, then one APPLIED effect.
- RETIRED/BLOCKED Agent, revoked/expired delegation, lost permissions and wrong
  company/resource/version deny with zero effects. Final REG4 callbacks changing
  the authority fixture are caught by the subsequent internal authority read.
- Each approval binding is independently corrupted and denied. Expired,
  not-yet-valid, revoked, consumed and unauthorized-approver records deny.
- Sequential delivery returns the stored receipt. Conflicting delivery denies.
  Nested calls at registry, pre-effect hook and adapter return in-progress;
  one acceptance remains. Consumed approval IDs survive fixture replacement.
- PARTIAL and TIMEOUT_AFTER_ACCEPT produce terminal COMPENSATION_REQUIRED
  receipts with PARTIAL/UNKNOWN state. Three repeat deliveries invoke no retry.
  Arbitrary exceptions after acceptance also remain UNKNOWN and cached.
- Invalid and hostile data receives a safe audit. The 222-invocation audit
  test verifies hash links, correlation, one effect and isolated returned views.
- Branded authority/adapter ownership rejects replacement by a real adapter or
  rebinding into another proof instance.

## Scope and provenance

Technical candidate changes four new paths; zero baseline source/test edits.
Protected REG4/MG5 paths and original BOS-AI1 source/test and dependency manifests
match the parent. `git diff --check` passed. Repair rounds: **0/2**.

This result binds only the exact technical commit/tree above. Later evidence
documents do not create a newly tested technical baseline. Their code/test
blobs must be verified equal to this candidate before push.

Raw log hashes:

| Log | SHA-256 |
|---|---|
| formal-controlled-publish.tap | `1b48fa9af02c586d6e4531d869acf6f51a73852a6b4215a177c8e50fd7d24dff` |
| formal-bos-ai1-regression.tap | `bd57347cc3dcddb6acd5af503dbc3f8a4449056d08347df550725d3308c05a45` |
| formal-reg4-regression.tap | `323897f674fc53d7040e147189e5e5fd9e0a77ad961a29994e8c0acd2e6b2330` |
| formal-mg5-regression.tap | `5b41aa43e69ed273fc8e9cda3ce18a466eca700fc1901088e85104c1ebadee83` |
| formal-combined.tap | `af9a25e192657bc1a7a4191ef1821fe8c27442294e91fe9e8e7ae9f34b483900` |

OC6 is **PAUSED at G0**. No OpenClaw, Runtime, Production, actual model,
database, network adapter or external business system is opened by this gate.
