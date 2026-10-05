# Response-library browser verification

Executed 2026-10-02/03 against runtime `979d62d37991d331f70b7bc9d1c718c2c0a0182f` candidate components. Supported Codex browser, local `127.0.0.1:4187`, React StrictMode, synthetic company/actor/catalog/content/API only. CSP `connect-src 'none'`. Fixture CSS is simplified. No live CRM, OpenAI, Meta, customer message or advertising change.

## Observed results

| Scenario | Result |
|---|---|
| Initial mount, company-scoped editor, product/region/channel selection | PASS; current fields and Vietnam expiry visible |
| Preview and history | PASS; script-like answer displayed literally, no execution; 50 + 5 historical rows accessible and labelled historical |
| Edit then change care tab and return | PASS; unsaved draft retained, approval/preview unavailable until saved |
| Lost SAVE reply after commit, full browser reload, exact-key retry | PASS; request `476720a8-1eec-4998-a03b-591868161185` reused, accepted remained 1, replay became 1; authoritative reload showed DRAFT revision 56 |
| Human publisher eligibility | PASS UI behavior; absent eligibility disabled approval; restoring mock eligibility plus fresh read allowed approval to revision 57. Actual authorization enforcement is separately covered in SQL tests |
| Revoke approved entry | PASS; fresh list revision 58 REVOKED; preview disabled |
| Pagination failure with unsaved draft (review P2 regression) | PASS; forced 503 removed unconfirmed list but kept editor and exact draft, with clear warning. Saving remained possible with a valid reason; reload showed DRAFT revision 59 |
| New draft and invalid/incomplete form | PASS; blank form/expiry could not save; completed new draft saved. Native date control change plus blur updated the form; CUA fill alone did not dispatch the required change |
| Wrong acknowledgement after accepted create | PASS; request `c28877bd-ad5c-4582-a544-2464ddffbef9` retained, controls locked, browser reload and same-key retry accepted no new write (accepted stayed 5; replay 1 to 2); new entry appeared once at revision 1 |
| Late company-A read after switching to and opening B | PASS; release of A reply left B's editor unchanged |
| Wrong-company read returned while in A | PASS; entry editor cleared and read failure displayed, foreign entry not painted |
| Stale preview 409 | PASS; current view cleared and required a fresh read |
| Write 403 followed by definitive 409 | PASS; 403 cleared visible data while retaining uncertain intent. Same request `ab38b574-7f8d-4c97-ba0a-1147a51e6e3a` retried; 409 cleared intent and required reload |
| Held write and tab switching | PASS; edit/retry/new actions disabled while pending; switching tabs did not submit another command; release of REVOKE completed once |
| Browser console and provider sends | No recorded error/warning in final inspection; final fake counters accepted 6, replayed 2, sent 0 |

## Explicit limitations

The native `window.confirm` cancel/accept path is **INCONCLUSIVE in browser automation**. Opening the dialog stalled the supported interaction, `getJsDialog` did not expose it, and a later dialog command reported no dialog. The editor still contained the draft after recovery, but no verified accept/dismiss action is claimed. Code review checked the confirmation guard; production-browser UAT must exercise both buttons before release.

Selector/history SQL isolation and current-rights checks are proven by isolated PostgreSQL tests, not by mock flags. Mock controls do not establish real permissions, real catalog accuracy or provider delivery. Simplified CSS does not establish full application visual acceptance. Browser observations supplement the code/CI evidence, not operational acceptance.

Temporary tab and fixture server were closed after testing. No production configuration or persisted business data was changed.
