# Internal Live V1 — narrow corrections / C3-R1 history and C3-R2 current

The earlier Founder execution instruction approved only browser-verifier readiness
and owned stop/PID/lock lifecycle corrections, their regressions, and directly
related documentation/evidence. The current timestamp-correction authorization
adds only the bounded timestamp correction, its regressions, the evidence-namespace
rollover, and directly related documentation. No domain/module implementation or
security-policy change is authorized by either correction.

## Candidate and evidence convention

Historical C3 remains commit `08772648e69d40673e6825dae8af87e8e565e3a7`,
tree `6f53cffa8bfa7a7b288a8980091411c80b4443b2`. Its flat `runtime/`
JSON artifacts and `FOUNDER_VALIDATION_C3_RESULT.md` are immutable historical
evidence: live read PASS, reconciliation MATCH 36/36, runtime FAIL, browser FAIL,
Founder Acceptance HOLD. These results cannot satisfy a new candidate gate.

`C3-R1` denotes the first corrected **implementation** refreeze of C3 at commit
`eb10d926ae8d1752141bb5d5c615ea12305374c4`, tree
`4a4ac25b8c7b54f682bff96f62f7f6516bac32ac`. It is now historical. Its generated
artifacts under `runtime/candidates/c3-r1/` remain byte-preserved and cannot satisfy
the current candidate gate.

`C3-R2` denotes the current timestamp-corrected **implementation** refreeze. It is
not C4: C4 remains the later, explicitly approved docs-only acceptance step. All
current generators, consumers and manifest references use the fixed ignored
namespace `evidence/internal-live-operation-v1/runtime-safety/runtime/candidates/c3-r2/`.
The parent `runtime/.gitignore` continues to protect the entire generated tree.
Exact commit/tree and the attestation-byte hash, not this human label, bind proof.
If another code correction is required after freezing C3-R2, preserve every prior
generation, advance the fixed namespace to `c3-r3` before the next local commit,
and rerun every affected acceptance check on the newly frozen clean candidate.

## Correction verification sequence

C3-R2 keeps UTC source text intact when parsing timestamp-bearing JSON. The
timestamp validator accepts explicit UTC ISO text, UTC DateTime and zero-offset
DateTimeOffset without a locale-dependent string conversion. Unknown/local kinds,
nonzero offsets, missing timezone, stale and future values remain rejected.
Attestation/order/latest-gate comparisons preserve full tick precision and the
existing commit/tree/hash binding. Health uses the same UTC validation and keeps
its five-minute maximum age. No timezone, execution policy or acceptance guard is
relaxed. `timestamp-verifier-regression.test.ps1` loads production function ASTs
and uses only isolated fixtures inside the worktree; it is a required static check.

The existing 6/19/1/1 contract is unchanged: six entries from
`founderCockpitReadModel.SYSTEM_DEFINITIONS`, nineteen keys from
`founderPlatformCapabilities`, one Signal Hub object and one Configuration Center
object. `businessOsContract.js` validates the snapshot before `BusinessOSPage.jsx`
mounts `FounderCockpit.jsx`; the latter maps each system/capability to one card and
mounts both singleton sections once. The browser waits for the matching scoped
response and exact rendered counts, including visible non-empty semantic headings
(Signal Hub uses its title paragraph). Offscreen full-page content is valid;
hidden, missing or blank content is not. Only counts/booleans enter evidence.

1. Verify the authorized worktree root/branch/HEAD/tree and inspect a clear diff.
   Run isolated browser slow/error/timeout and lifecycle ownership regressions.
   Obtain independent review of browser, stop and credential boundaries.
2. Create the new local C3-R2 implementation commit; record exact HEAD/tree and
   clean status. Do not amend historical C3/C3-R1 or generate acceptance evidence
   before freeze.
3. Generate a fresh attestation and run `run-static-verification.js`. Keep all
   existing checks and include browser, lifecycle, evidence-isolation and timestamp regressions.
   Confine TEMP, TMP, npm cache and any compile cache to the authorized workspace.
4. Use the single currently Founder-approved credential path variable for both
   existence check and loading through the reviewed verification programs only.
   Report only AVAILABLE/MISSING/INSUFFICIENT or ACCESS DENIED; never inspect or
   print values. Retain the existing narrow data-key allowlist, guarded active admin,
   ecosystem/company membership, bounded session and no-write controls.
5. Rerun real-data read and source reconciliation, start the guarded integrated
   application on loopback, then rerun runtime/browser proof on this exact candidate.
   CRM drill-down must actually load under the selected company scope. A matching
   HTTP response alone is not proof that the UI is ready.
6. Verify normal stop, repeat stop, clean restart and a second stop without manual
   PID/lock deletion. Isolated tests must also cover stale dead owned records and
   insufficient/mismatched ownership. Never kill an unverified PID or remove broad
   temporary directories.
   After stopping the browser-verification run, execute
   `node evidence/internal-live-operation-v1/runtime-safety/verify-founder-local-lifecycle.js`
   with the same protected source variable. It creates two fresh guarded sessions,
   attests each pair and listener, verifies stop/repeat-stop/restart without manual
   cleanup, then writes `lifecycle-runtime-verification.json` in this generation.
7. Recheck clean HEAD/tree and historical C3/C3-R1 evidence hashes. Produce a
   sanitized consolidated report with fresh C3-R2 artifact hashes and separate
   outcomes. Keep tracked acceptance/daily-use gates HOLD pending the existing
   acceptance process.

## Historical credential incident (not retroactively approved)

The earlier completed read/parse command exited 0 and emitted only five boolean
presence flags. The individual event timestamp is unavailable; the known enclosing
interval is **2026-09-06 03:30:57–05:55:19 UTC**. It is incorrect to say that the
file had never been accessed. A separate later denied command does not erase that
earlier successful read. No credential values were emitted by that completed
command. The current narrow exception authorizes only this correction verification
run and does not retroactively authorize the earlier event.

## Unchanged limits

Evidence contains no secrets, credential-file paths or raw business records.
Canonical writes and background writers stay off; no real migration, schema,
Business Rules, permission/RLS, merge, push, PR, tag, release, public bind or
AI/OpenClaw activation. WP3 STOP. Advisory operation stays OFF. Backup/failover
remains NOT VERIFIED unless separately proven. A technical READY FOR REVIEW is
not Founder Acceptance, daily-use activation, or completion of all Platform V1.
