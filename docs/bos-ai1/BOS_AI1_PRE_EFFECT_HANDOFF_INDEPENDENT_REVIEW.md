# Independent final review — IR-HANDOFF-1

Verdict: **PASS** for commit `a4c80f30e3afcf8d0c2fec43d8634368890b383d`, tree `7850bf028741e6319c62262cbd2b2f86c822134a`, parent `3d2b647a5d106590b86a18408bf1d631f491dc04`. Documentation base remains `f259c891e266b51e44cc1691562443054c3fc812`. Repair rounds used: **2/2**. IR-HANDOFF-001 (P2) is **CLOSED** on this repaired candidate; open P0/P1/P2 = 0/0/0. No new P0/P1/P2 finding was reproduced. This technical review does not approve the proof baseline or resume OC6.

| Run against this exact candidate | Result | Raw TAP |
|---|---:|---|
| Complete repository regression | 383/383 PASS | repository-regression.stdout.txt |
| Historical independent Controlled Publish | 152/152 PASS | historical-independent-controlled-publish.stdout.txt |
| Original independent adversarial assertions, unchanged | 173/173 PASS | independent-adversarial.stdout.txt |

The independently authored test file and its synthetic fixture were executed directly from the preserved independent/ directory. Their SHA-256 hashes still match the original FAIL manifest; no assertion was removed, changed, skipped or copied from Builder tests. ROOT is selected by the new pinned cwd already supported by the original fixture. All 708 tests passed, with no cancelled/skipped/todo cases. The standalone original IR-HANDOFF-001 reproducer now exits 0. Historical Controlled Publish adaptation was byte-checked as a ROOT-only change.

## Repair review and finding closure

The source repair changes only four read APIs: fake audit listRecords, fake adapter listEffects, proof listEffects and proof listSecondaryAudit. Each now maps the private array and invokes copy() separately for each record. This removes the accumulated-array/1000-node export failure while preserving bounded untrusted input validation, copied record isolation, existing sequence/hash/effect/correlation data, and all execution/authority/idempotency logic. No input validation, Domain veto or pre-effect audit control was weakened by the repair diff. Two additive Builder regression cases and a repair documentation record accompany this change.

On the old commit, independently authored IR24-P2, IR25-P2 and both IR26-P2 variants failed because readers threw after accumulated valid data; all four now pass unchanged. Secondary compensation records remain readable after 70 duplicates, primary records after 35 evaluations, and both effect getters after 100 independently approved actions. Existing tests retain safe snapshot isolation, correct hash chains, permit bindings and correlation. The original reproducer now retains access for all 70 duplicate reads and reports the primary audit readable.

The full independent suite also retains all original controls: permit-only ALLOW, complete bindings/provenance/expiry, intent/ALLOW and execution audit fail-closed behavior, Domain veto and post-check state changes, final Agent/delegation/approval/identity/policy revalidation, sequential/Promise/nested idempotency and cross-key approval races, known reject/partial/unknown/no retry, compensation receipts before terminal audit failure, hostile Proxy/getter/exception metadata, and audit integrity.

## Trace and preservation

Workspace: `C:\Users\HUNG\Documents\ChatGPT\Nhà máy ai agent\BOS_AI1_PRE_EFFECT_HANDOFF_IR_R2_WORKSPACE`. It was detached and clean before and after testing. All 4158 tracked files retain their pre-test SHA-256. Only four additive proof/documentation paths differ from the documentation base; all original baseline paths, REG4 and MG5 source/tests remain unchanged. Ancestry and original tools/qa source equality are recorded.

The initial FAIL candidate `3d2b647a5d106590b86a18408bf1d631f491dc04` / tree `b80e757929c5c976a7af4d08a4504bd273549592` remains documented with 169/173 independent passes and one historical P2. Its independent/ directory is byte-identical before/after this review, including manifest, raw TAP and fixture/tests. All 4158 tracked files in the original IR workspace remain byte-identical to its prior post-review inventory, and that workspace is clean. The history is preserved separately from this final PASS.

independent-manifest.json records exact executable/argument arrays, cwd, UTC start/end times, return codes, raw stdout/stderr hashes, Node v22.20.0, git version 2.54.0.windows.1, source Git blobs, canonical Git SHA-256 and local file SHA-256, pre/post clean checks, historical evidence hashes, counts and limitations. A sibling independent-manifest.sha256 seals the manifest.

No network, real model, OpenClaw, database, secrets, Runtime, Production, push, tracked edit, commit, branch change or baseline self-approval was performed. This remains a synchronous, synthetic, process-local proof; no distributed serialization, durable audit or crash-recovery guarantee is inferred. Founder retains the baseline approval decision.
