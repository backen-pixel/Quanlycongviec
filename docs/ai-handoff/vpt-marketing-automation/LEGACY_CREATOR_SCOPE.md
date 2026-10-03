# Facebook legacy creator — current company and recipient

## Status — 04/10/2026

Runtime `925cae0687623dc4654b81f461eb5d88dedece3b`, tree `7fc924ef8630350772bc30c7facfcf33e08a28e5`, from baseline `a102450752f7d86ba676bb759df71a0c65c7508b`; not deployed. Local 66 new cases and 117 regressions pass (183 total). PostgreSQL and independent review PASS for this scope. Full Marketing–Sales objective remains ACTIVE. No production DB, model/provider call, enrollment, spend or release was performed.

## Behavior

- Both automatic and manual creators load the actual contact and current Page company. A body company override must match. Cached Page/global company defaults cannot authorize creation.
- Every discovered Lead and Customer must match the Page company, requested Lead/Deal type and existing contact/customer relationship. Multiple phone or Lead candidates require reconciliation. Phone suffix candidates additionally require equal normalized numbers; the query is company-scoped.
- Customer inserts include `company_id`; existing Customer writes filter by the validated company. Current recipient, tenant and regional membership are checked before Customer preparation, again before Lead creation and before automatic notification. Manual creation verifies the current actor instead of trusting cached role/company claims.
- Sources are read within the Page company. The resolver never retags a foreign/shared legacy source. When a same-company Page source must be attached, compare-and-set preserves a concurrent explicit Page selection. The selected source is rechecked before creating a Lead.
- The manual CRM request includes the validated pipeline/stage pair. Missing or failed reads no longer clear an existing Lead mapping or mean no matching Customer. Failures in the identity, company, recipient, source, pipeline, code-allocation and mapping operations repaired here stop the request. Existing optional Lead/SX classification and some legacy side-effects still contain unchecked errors; this checkpoint does not claim every database failure in the old creator is fail-closed.
- Contact mapping uses compare-and-set on the observed Lead/Customer links. Historical messages linked to a different Lead cause a conflict; manual repair fills only null links.

## Evidence and scope

`facebookLegacyCreationScope.test.js` runs the actual helper, automatic creator body and manual route against synthetic persistence. It covers current company/tenant/Page, mismatched Customer and Lead, revoked recipient membership, source/pipeline conflicts, read failures, stale caller data, ambiguous matches, concurrent mapping/source changes, notification revocation and manual retry. The pre-existing managed-Page tests isolate that gate using explicit stubs; they do not claim to verify the new scope rules.

`facebookLegacyCreationScope.cases.js` runs actual helper queries on PostgreSQL using a service-role connection: Page transfer, foreign targets, current recipient/actor, source ownership, scoped phone match, pipeline pair, denied reads, retained message history and a competing committed contact mapping. Fixtures and grants affect the isolated test DB only. No production migration is included.

Changed runtime: `backend/src/helpers/facebookLegacyCreationScope.js`, relevant sections of `backend/src/routes/facebook.js`. Supporting changes: creator harness/unit/PostgreSQL cases, old gate fixture adaptation, intake registration and CI workflow.

Independent review identified four issues in the first draft: NULL Page activity, swallowed Lead/code-allocation errors, stale JWT assignment and resolver fallback on read error. The current revision fixes them and adds regression tests using the actual resolver and CRM assignment policy; independent re-review and published CI passed for runtime925cae0. Manual creation requires an explicit region to prevent the legacy CRM endpoint from silently selecting one.

### Published evidence

- [Automation37144662300](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37144662300): all10jobs SUCCESS. [Intake PostgreSQL111266015711](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37144662300/job/111266015711):281PASS/0FAIL/0SKIP; new cases271–280 cover this helper. [Node22 regression111266015772](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37144662300/job/111266015772):843+26+183PASS. Node18 also SUCCESS; full frontend build10,329modules succeeded.
- [Report37144662293](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37144662293) and [Messenger37144662317](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37144662317):SUCCESS.
- CI checkout merge `b835082cff9c851c8bd873b80c329bbcd137aed9` has the exact runtime tree and parents base `e16c885ae7c2305645be02a1227bf378cb59137f` plus runtime925cae0; verified via Git API.
- Independent reviewer verified critical published helper/route/PG/unit blobs, reran66local cases and inspected final CI logs. Verdict **PASS creator repair only**. SQL tests use isolated PostgreSQL; route and CRM transport tests use synthetic data. This does not approve production, atomic HTTP behavior, full measurement coverage, cutover or UAT.

## Remaining release gates

These are repeated reads and individual compare-and-set updates across HTTP, not a transaction spanning company/recipient/Customer/Lead/source/attribution/tasks/messages. A failure after an earlier successful write can leave a partial Customer, source or Lead. Source creation is not a concurrent uniqueness guarantee. Review and cutover must preserve these records and reconcile outcomes; no destructive retry or claim of atomic creation is permitted.

Global legacy source-backfill and other legacy callers still need the cutover audit. Physical CRM merge data preservation and Founder choice on linking versus physical merging remain open. This change does not decide that business rule.

Next: finish source-backfill/caller checks, legacy drain/reconciliation and operational configuration → full Facebook→CRM→survey→dashboard UAT → Founder release. No live 250,000 VND result is inferred from synthetic tests. Calendar, recipients, AI credentials/cost approval and measurement coverage remain operational dependencies.

## Rollback / stop

Before any approved rollout, retain a versioned backup and test restoration. On failure, stop the new/legacy creator workers for the affected scope, drain in-flight work and preserve receipts and partial records for reconciliation. Do not switch back to an unsafe global-company writer, delete newly created transactions, or open a second writer. This unpublished patch can be revised in the feature branch; it has not changed live state.
