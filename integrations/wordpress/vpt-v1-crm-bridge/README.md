## 0.4.0 (14/10/2026) — receipt form và lựa chọn đo quảng cáo (chưa cài trên WordPress)

Candidate website form11116 adds immutable request/time/source/consent metadata to the CRM payload. The entrypoint's server-generated request UUID is injected before queue persistence; retries retain it and the original payload. Submit time now preserves milliseconds so an actual click in the same second remains earlier. Business fingerprint, legacy notes and contact-consent intake stay unchanged; old jobs are not replayed or rewritten.

Install the optional, initially unchecked `your-ads-consent` and three matching hidden fields from `form-hidden-fields.txt` together with plugin/PHP/JS0.4.0, after both new database migrations and the backend are live. Denial still saves the enquiry and strips matching metadata. The browser requires literal consent plus `VPT_ADS_V1` before queuing/resuming a measurement, and confirms the saved CRM lead before any new Google form conversion. Old cached responses or pending entries lacking that proof do not convert. Actual original FBC/FBP are validated; an FBC may be formed only from a real observed URL fbclid and its original observation time, never an invented click or verification-time timestamp.

The authenticated editor was read on14October: installed0.3.3 PHP/JS matches GitHEAD after CRLF/trailingblank normalization. Keep its existing WooCommerce product form and kitchen-category/product CTA hooks. [`form-11116-0.4.0.txt`](./form-11116-0.4.0.txt) is the full candidate prepared from the actual backed-up form, adding only the measurement choice/hidden fields. It has not been saved to WordPress. Re-read before updating to catch concurrent edits.

Both Google exports exclude new website metadata without explicit measurement consent. Legacy NULL metadata retains its prior policy. The server-only receipt binds to the dedicated integration label, form/site/company and exact source projection; the raw integration UUID is a legacy credential and must not be put in public source or Lead JSON. Receipt proves saved intake, while qualification still requires real contact evidence and deduplication. Neither browser form conversion nor a queued/sent job establishes a qualified new customer or paid attribution.

Current public website has two Meta Pixels and Google tags. No new browser MetaLead is added. Qualified feedback uses a separate, default-off server event and requires approved credentials/data destination plus actual source verification. [Rollout order, acceptance limits and rollback](../../../docs/ops/website-qualified-feedback.md). Full installed WordPress/CF7/CRM/Ads acceptance remains outstanding; source tests do not establish production completion.

## 0.3.1 (12/10/2026) — Google Ads conversion only after CRM confirmation

Before 0.3.1 the browser reported the Google Ads form conversion as soon as the form was queued in WordPress, even if the CRM later rejected or never received the lead. Now the browser keeps the existing `vpt_v1_lead_request` dataLayer event, then asks `GET /wp-json/vpt-v1/v1/receipt/<request_id>` every few seconds (up to 10 minutes, resumed on the next page of the visit) and fires the conversion (and `vpt_v1_lead_confirmed`) only when the job state is `sent` (CRM returned a lead id). `review`/`blocked`/unknown never convert. The endpoint is public but keyed by the random request UUID known only to the submitting browser; it returns one state word and no contact data. A queued job older than 2 s is dispatched from that request instead of waiting for WP-Cron (same CAS-guarded `dispatch()`, no double send).

## 0.3.0 (11/10/2026) — structured website attribution

Merges the 08/10 structured-attribution update (CRM migration renumbered **717**) with the 0.2.4 SEO candidate (Google Organic source, referrer host, first landing page) and adds **fbclid** plus Facebook ad IDs: when utm_source is facebook/fb/instagram/ig, a numeric utm_campaign becomes campaign_id and a numeric utm_content becomes ad_id. Facebook ads must link with utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.id}}&utm_content={{ad.id}}. CF7 form 11116 needs the hidden fields in form-hidden-fields.txt (adds [hidden fbclid]). Install only after migration 717 and the backend are live.

### Prepared update 08/10/2026

The current branch adds `is_test` and structured `attribution` to the existing CRM payload, mapping `campaignid`/`adgroupid` to generic `campaign_id`/`adset_id` and retaining captured UTM/gclid/gbraid/wbraid. Description, notes, company/owner/pipeline, source selection, business fingerprint and queue/confirmation policy are preserved. The source/fingerprint and deployment statements below describe the earlier patch, not this uninstalled update.

Deploy only after CRM migration 717 and the backend contract are accepted. Existing queued jobs keep their serialized old payload; this patch does not replay/rewrite jobs. Roll back this additive update by reverting its `core.php` diff (not by reverting the older ChatGPT source fix). No WordPress settings or runtime network calls are part of the isolated tests. Full staging WordPress + CF7 + worker acceptance remains outstanding.

# VPT V1 WordPress CRM bridge — ChatGPT paid source

Bridge CF7 form `11116` → CRM VPT. This reviewed change maps normalized
`utm_source=chatgpt` plus `utm_medium=paid` to `ChatGPT Ads VPT V1`.
TEST takes precedence; Google paid media and Website fallback retain the original
behavior. Tracking remains visitor-supplied evidence, not proof of a paid click,
CRM confirmation or a sale.

`core.php` was saved on WordPress on 30 September 2026 and reloaded; read-back
SHA-256 matches `fdf5c29e9f5ffe6fece3b8760df99b8d483a368f0df0da1dbebbb51213bdb238`.
The bridge remained LIVE; its authenticated GET checks reported
`preflight_verified`. Four existing `sent` jobs are historical evidence, not new
ChatGPT lead tests. A real ChatGPT ad → form → confirmed CRM lead test has not
been completed.

The original plugin entrypoint and JS are preserved byte-for-byte. No API key,
mode setting, backend, schema, business rule or queue policy changed. The plugin
header and JS still identify version `0.2.2`; use file fingerprints to identify
this source-selector patch.

| File | SHA-256 |
|---|---|
| `core.php` | `fdf5c29e9f5ffe6fece3b8760df99b8d483a368f0df0da1dbebbb51213bdb238` |
| `tests/baseline/core_0.2.2.php` | `019c9552d18f68c3fe3ab95f0b0f5cf34b441ca52301552e53934a2556711396` |
| `vpt-v1-crm-bridge.php` | `057e30c5a266392885785f8c33ba4179f4c61db480008fdef60e118175a77ef6` |
| `attribution.js` | `4eb886082361b4789e46f39f6ea858aaa21a28ae6d496e4cd518835ae1905c6e` |

## Isolated verification

Run from this directory, passing the PHP CLI executable explicitly if needed:

```bash
php -n -l core.php
php -n -l vpt-v1-crm-bridge.php
php -n -l tests/baseline/core_0.2.2.php
php -n -l tests/core_probe.php
python3 tests/test_core.py /absolute/path/to/php
```

The probe loads original and patched cores in separate PHP processes; `-n`
ignores `php.ini`. It does not bootstrap WordPress, read application environment
files, start a server or make DB/HTTP calls. Twelve test methods cover 43
scenarios: original-code counterexample, full build equality except eligible
`source_name`, UTM notes, business fingerprints, scope constants, TEST/admin/form/
consent/contact guards, sanitization, and confirmed/uncertain response policy.

Adapted suite passed **12/12** on PHP CLI 8.3.6 extracted into scratch from the
official Ubuntu 24.04 package, without system installation. The suite does not
establish live queue/cron operation, Ads attribution or end-to-end acceptance.
The existing JS emits a Google lead-request signal on `queued/live`; that signal
must not be reported as a confirmed CRM lead.

## Rollback

Restore only the installed `core.php` from `tests/baseline/core_0.2.2.php`, then
reload and verify its baseline SHA-256. Keep the entrypoint, JS, API key, settings
and existing jobs unchanged. No data deletion, schema change or historical replay
is part of rollback. This directory contains source and synthetic tests only;
credentials stay in the existing server-side configuration.
