## Prepared update 08/10/2026 — not installed on WordPress

The current branch adds `is_test` and structured `attribution` to the existing CRM payload, mapping `campaignid`/`adgroupid` to generic `campaign_id`/`adset_id` and retaining captured UTM/gclid/gbraid/wbraid. Description, notes, company/owner/pipeline, source selection, business fingerprint and queue/confirmation policy are preserved. The source/fingerprint and deployment statements below describe the earlier patch, not this uninstalled update.

Deploy only after CRM migration 714 and the backend contract are accepted. Existing queued jobs keep their serialized old payload; this patch does not replay/rewrite jobs. Roll back this additive update by reverting its `core.php` diff (not by reverting the older ChatGPT source fix). No WordPress settings or runtime network calls are part of the isolated tests. Full staging WordPress + CF7 + worker acceptance remains outstanding.

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
