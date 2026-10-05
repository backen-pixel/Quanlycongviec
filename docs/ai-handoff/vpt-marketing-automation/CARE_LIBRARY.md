# Thư viện nội dung tư vấn có duyệt
2026-10-02. Baseline PR22 af19ea5c2c39ad41c6ced3b8829ef8dbb8d3f92d. This increment is independent of the pending OpenAI credential decision and makes no model/API calls.

## Purpose and ownership
CRM owns customer-facing response entries. Existing products remain the canonical product catalog; knowledge_lessons is an internal training library, not approval to publish claims to customers. A response references a product (optional for general qualification/handoff), actual company regions, allowed channels, a source document reference and an expiry. It contains an intended question and exact answer text, with purpose ADVICE, QUALIFY or HANDOFF. No actual VPT facts/prices are seeded or inferred from the Founder's average order estimate. Source references are human-supplied evidence, not automatically verified external documents.

The response library authorizes reusable wording. It does not authorize final quotations, closing orders, messages, AI execution or spending. Future runtime can select approved responses and must revalidate at dispatch. This increment has authenticated APIs and operator preview; its editing UI and AI consumer are still pending.

## Versioned workflow
SQL661 adds three private tables: entries, named human publishers, and immutable-through-application command receipts/history. Every SAVE creates a DRAFT revision and clears approval. APPROVE requires a current explicit publisher enrollment plus current company administration, exact current entry version, unchanged product/region snapshot and unexpired content. REVOKE retains history. Exact request retries replay the original acknowledgement; that acknowledgement is never current dispatch authority. Re-read before displaying current state or using content.

A publisher enrollment is provisioned only through a reviewed Founder release operation, never through an Agent or ordinary admin endpoint. No enrollment is seeded; existing admin/sales_admin alone cannot approve. Every update to an enrollment rotates its authorization identifier, so re-enabling it cannot resurrect older approvals. Account credentials must identify the enrolled human; this code cannot distinguish a human from someone sharing that human's login. Agents must use separate identities and must not be enrolled.

Current active actor/company/tenant rights are checked on every RPC, including retries. Product records must belong explicitly to the company and be active; null-company/shared products are not treated as approved. All listed regions must be active in that company. The product/region digest covers complete current rows but only the digest leaves the dependency helper: internal costs/stock are not exposed. Any current row difference invalidates source readiness. This is snapshot comparison, not a full product change-history guarantee. Removing a product can still leave a readable unavailable draft for correction.

Content/history writes commit atomically; resource and request locks plus exact version checks handle simultaneous edits and ambiguous replies. Tables deny browser roles and direct service-role access. Service role may call only the three scoped application RPCs. Reads are primary-only and non-cacheable.

## API
Under authenticated /api/facebook/customer-care:
- GET /library?companyId=...&after=...: live UUID cursor, 50 summaries per page. Not a frozen inventory.
- GET /library/entry?companyId=...&entryId=...: current document/readiness/version.
- POST /library/change: companyId, requestId and command {entryId, action, expectedVersion, reason, document only for SAVE}. First SAVE uses expectedVersion:null. Human approval applies only to the exact displayed version.
- POST /library/preview: companyId, entryId, version, channel, regionId. Exact approved text only; always send:false. Checks current approval, expiry, source, channel/region and allowed purpose. It never calls a model or Messenger.

Feature flag VPT_CARE_LIBRARY_ADMIN=1 plus primary target required. Flag defaults off; library does not depend on or turn on care receiving/sending. Content review does not open a trial or public rights.

## Acceptance and rollback
Local service tests cover spoofing, wrong-scope replies, default-off/primary-only, exact receipts, expiry, revoked/draft content, audience mismatch and template substitution rejection. Isolated PostgreSQL tests cover RLS/privileges, publisher enrollment, source/version changes, grant rotation, expiry after lock waits, concurrent replay/edit, rollback, retained revocation and pagination. Runtime880f495: local9, PostgreSQL83 (14 library), Node22 547, all10 automation jobs/full build and independent final review PASS. See [exact-version evidence](CARE_LIBRARY_REVIEW.md).

Deployment, live publisher enrollment, production schema/performance/backup checks and actual VPT content acceptance remain separate release gates. Disable the library flag to stop app access; preserve entries/events and publisher records for evidence. Do not delete customer history or reopen unsafe privileges. No live migration, deployment, provider/account/ad change, paid AI call or trial activation was performed.

