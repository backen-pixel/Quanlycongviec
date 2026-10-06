# Google Organic → form → CRM: 0.2.4 candidate, not installed

Local branch: codex/vpt-attribution-20261006. Parent bridge checkpoint c504623.
The Organic candidate is commit 05bd00a; the TTL-at-submit follow-up has passed
root review. This changes WordPress attribution only; the local TTL work made
no backend/database change, external call or deployment. Candidate 0.2.4 is not
installed, and the earlier attempted core editor save is not confirmed.

Google search referrers from a conservative explicit host allowlist populate
utm_source=google and utm_medium=organic only when no campaign/click parameters
are present. The 30-minute session persists the complete source bundle during
internal navigation. A new campaign or external touch replaces that bundle;
expired storage never revives a source. The original deadline is rechecked when
form fields are populated, including the capture-phase submit handler: all
attribution fields and session storage are cleared at or after that deadline.
The current page's URL parameters are not reread to revive an expired source.
Browsers without storage retain only the current page's signal until the same
deadline. Direct/unknown traffic remains Website VPT V1. Version/cache suffix
0.2.4 avoids collision with two historical uninstalled 0.2.3 candidates.

The core assigns SEO Google VPT V1 only for google/organic without gclid,
gbraid or wbraid. TEST and existing Google/ChatGPT paid priorities are preserved.
Only referrer host and landing host/path are retained, never their query or
fragment. Visitor-supplied attribution signals do not prove a real sale or a
Google click. A queued form request is still not a confirmed CRM lead.

## Validation

PHP 8.3 CLI from official Ubuntu 24.04 package, extracted locally, without
system installation. Both changed PHP files pass syntax validation. Pure-core
suite: 15/15 methods. Actual attribution.js in Node VM: 13/13 tests, covering
organic/internal navigation, paid precedence, source replacement, expired or
blocked storage, malicious/unknown referrer hosts, and no personal data events.
Four new TTL regressions failed against the pre-fix candidate and passed after
the change. They cover Organic and Google/ChatGPT paid forms open 29/31 minutes
with storage available/blocked, a restored bundle's original deadline, and the
exact 30-minute boundary without reusing expired page parameters. JS syntax and
git diff --check also pass. Core mapping, queue policy and event names/timing are
unchanged by the TTL follow-up.
No WordPress bootstrap, application .env, HTTP intake, customer contact or
production test record was used by these tests.

| Candidate file | SHA-256 |
| --- | --- |
| core.php | 6190ee5d827a3b83089d695672e5412752da18fb32852982eaabc4e557a33772 |
| attribution.js | 2010fd4af815b62e24c2754a3a87fb59848f1ec5f1bb9d43b03c45e656b4f73c |
| vpt-v1-crm-bridge.php | 3e9913bfdf68025be31a1f667db758048fac54ed524bc4e23be2fe61bf4bd3f6 |

## Activation and acceptance still required

Verified prior-turn evidence: the two hidden tags in form-hidden-fields.txt were
saved to CF7 form 11116 and read back with the notice “Thay đổi đã được lưu.”.
The installed entrypoint and core.php were read before the attempted editor
paste; their checksums and lengths matched c504623 exactly. Installed
attribution.js was not read. No core save confirmation was obtained, so this
earlier baseline read does not rule out partial-save drift afterward.

1. Freshly read all three installed plugin files. Compare actual bytes with
   c504623 and the candidate fingerprints above, then review any partial or
   intervening change before applying. Do not infer installation from the
   editor paste or the historical version number.
2. Recheck that the two already-saved hidden tags remain in form 11116 without
   duplicates. Preserve every other form field and setting; do not replace
   the whole form or add the tags again blindly.
3. Save core.php, attribution.js and entrypoint version 0.2.4, read back each
   installed file and flush the site's normal cache. Verify the public script
   version and both hidden fields on the actual form.
4. Validate organically referred traffic through internal navigation without
   creating a live synthetic customer. For an end-to-end test, use the existing
   administrator-only diagnostic mode and synthetic-contact guard; keep its
   records out of business counts and return the mode to its recorded value.
   Diagnostic mode forces the TEST source; it validates transport, not the live
   SEO source label. Also verify cleared hidden fields on an expired open form.
5. Accept a real lead only after a CRM lead ID and matching successful API log
   are present. Qualification/survey/order counts need the CRM's real stages
   and staff actions; website sessions or Zalo/call clicks are insufficient.

No historical relabeling or replay: one of the five current website records
contains a Google paid click signal and must not be classified as SEO. Four
customer links have null customers.company_id; all five linked customer records
have phones. Company-scoped reporting must start from crm_leads.company_id.
The null customer company field alone does not establish a backend defect.

## Rollback

Restore candidate 05bd00a locally if needed to undo the TTL-at-submit follow-up.
Candidate 0.2.4 is not installed; a fresh live-file read is required to determine
whether the earlier unconfirmed core save left any partial change.

Restore the three files from checkpoint c504623 and remove only the two newly
added CF7 hidden tags. Restore the prior script version/cache. Preserve existing
jobs, customer/lead data, API key, mode and settings. No backend or schema rollback.

## Other SEO blockers

Sitemap module enabled earlier; valid public XML is still unverified. Site Kit
Search Console/Analytics returns an invalid server response. WordPress Site
Health reports REST context execution mismatch; the redirect-to-home callback
for 404s is present. Neither proves the sitemap root cause. Search Console
indexing, search-query data, sitemap submission and URL inspection are pending
verified account access. Do not mark these tasks complete from public metadata.
