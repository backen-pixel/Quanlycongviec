# Pre-Effect Handoff V1 — Formal Traceable Test

Result: **PASS**. Executed 2026-09-03T00:29:42Z–00:29:45Z.

| Binding | Exact identity |
|---|---|
| Technical candidate commit | `a4c80f30e3afcf8d0c2fec43d8634368890b383d` |
| Technical candidate tree | `7850bf028741e6319c62262cbd2b2f86c822134a` |
| Direct parent (initial candidate, finding retained) | `3d2b647a5d106590b86a18408bf1d631f491dc04` |
| Documentation branch base | `f259c891e266b51e44cc1691562443054c3fc812` |
| Approved prior technical source | `1317f1468a341379f51e33b5631d7767af7c8848` |
| Prior technical tree | `ab7296b7ac316ea24324f5dc431a66c3375d91ca` |
| New source Git blob | `5ff9e019c0c16fbfaa40eb6f36442f3cf66088d8` |
| New test Git blob | `d88aa3591ed71a185893e5ed5ef23db389ed40d3` |

Formal workspace: `BOS_AI1_PRE_EFFECT_HANDOFF_FTT_R2_WORKSPACE`, separate detached
worktree, clean before and after. Node v22.20.0, Windows x64, Git 2.54.0.windows.1.
No dependency installation. Exact commands and timestamps are in the portable
`formal-final/formal-manifest.json` artifact.

| Suite | PASS | FAIL / skipped |
|---|---:|---:|
| H01–H08 new handoff suite | 188/188 | 0 / 0 |
| Existing BOS-AI1, REG4, MG5 Builder/Independent regression | 195/195 | 0 / 0 |
| Historical Controlled Publish independent adversarial regression | 152/152 | 0 / 0 |
| Unique tests in this formal run | **535/535** | **0 / 0** |

The historical 152 assertions/fixtures are unchanged. Only their external ROOT
line is adapted to `process.cwd()` so the pinned formal worktree is tested.
Original file SHA-256: `f78adfaaf741eb3cd20f3cfc70653ef24c7de0beae9e480cbfc3816c6d5fe880`.
Adapted SHA-256: `e5344c76b57c6c9a93a17f5a838605cac82694d1deff34dd5f8c38c2a38f6cca`.
These remain historical regression, not a new independent review of the handoff.

## Observed control behavior

- BOS ALLOW returns an immutable branded permit with zero effects and zero
  Application Service/Domain/Adapter calls. Approval re-enters BOS first.
- Intent and ALLOW audit precede Domain; write failure stops with zero effect.
- Domain DENY/STOP and changed resource version veto before the Adapter.
- Domain state mutation during audit or the final REG4 read cannot bypass veto.
- 34 authority/expiry mutations at three boundaries (handoff, Domain audit and
  final REG4 callback) each prevent execution. BLOCKED/RETIRED checks also pass.
- Every permit binding, copying/forgery/cross-instance use and immutable expiry
  are checked. Replacing authority fixtures cannot reset approval consumption.
- Fifty sequential duplicates, 64 Promise-scheduled callers and reentrant calls
  at eight callback boundaries produce at most one adapter call/effect per key.
- Known pre-effect reject returns FAILED with zero effect. Partial/unknown
  returns COMPENSATION_REQUIRED; duplicates do not retry the Adapter.
- Terminal audit failure after effect preserves secondary receipts and returns
  COMPENSATION_REQUIRED. Hostile inputs/exceptions do not escape into metadata.
- Primary and secondary audit chains are independently recomputed, correlated,
  redacted, and protected from mutation through returned copies.
- Primary/secondary audit and both effect views remain readable beyond 200
  records; 500 duplicate compensation receipts preserve access to evidence.

## Raw evidence

| TAP artifact | SHA-256 |
|---|---|
| formal-final/handoff.tap | `a513d43f1b2e93157bb8ead4dde988dd3af56ec2554de0b9e577f332b0e10d0f` |
| formal-final/baseline-regression.tap | `2e8ea3604208b6662dfe92363a81404c1c4eabbad88e519c89200c6e4e0cbe81` |
| formal-final/historical-adversarial.tap | `a1d85a8cc6034f5bc4c15dfa11cf497a64eaa9d7274b6e0280665ef2ba796619` |

Canonical source SHA-256: `6b22c25bcdfacf3718b220a96adb46ce32400f0f810873cdd4dd1148cca67b85`.
Canonical test SHA-256: `9e05d99add28bedbb230628b8bae1fa93758438f3a6227c42aa4f4ec4da10ced`.
Four new tracked paths at the technical candidate; all baseline source/tests and
dependencies unchanged. Repair rounds used: **2/2**: the fixture counter and
IR-HANDOFF-001 ledger export repair. No test/source changes occurred during final
formal execution. Initial 533-test formal and failed independent review evidence
remain in `formal/` and `independent/`, bound to the initial candidate only.

This report is a test verdict for this exact technical candidate. It is not
Founder baseline approval, OC6 G0 PASS, or authorization for Runtime/Production.
