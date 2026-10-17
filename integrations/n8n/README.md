# VPT website email ownership gate — M1

This gate prevents the mail transport from creating another CRM Lead for the
existing CF7 form11116 bridge. It does not confirm a CRM receipt, authenticate a
sender, create a request UUID, or qualify a customer. The sole intake writer stays
the WordPress bridge; quality still comes from the first new Warm/Hot/direct-Deal
canonical CRM event and its existing consent/source/deduplication gates.

The real CF7 template read by the root operator has this subject prefix and body
line:

```text
Subject prefix (JSON): "[VPT V1] Tư vấn tủ bếp / thiết bị — "
Mã form: VPT_V1
```

Both exact markers route to `hold / bridge_form_reconcile_required`. One, malformed,
quoted or duplicate markers route to `hold / ambiguous_bridge_markers`.
Unreadable inputs also HOLD. Emails with readable structured subject/plain text
and neither marker route to `legacy`; their existing fields remain intact.
Gmail's parsed `subject` is authoritative when present. Structured header forms
are fallback inputs only; the gate never extracts a subject from the body.

These static markers identify a form template, not a persisted bridge job. In
the current plugin, `capture()` can fail its payload build and still let CF7 send
email; that message has the static markers but may have no job or CRM receipt.
The markers are also unsigned and can be imitated by customer text. A HOLD is
therefore transport suppression plus reconciliation, never capture/delivery
success. Keep the original Gmail message and execution as the manual source;
do not delete/archive it or call it confirmed. This deliberately has no receipt lookup: the existing WP
`GET /receipt/<rid>` can dispatch queued jobs and must not be used by this gate.
Do not add fallback POSTs, timers, retries or old-queue replay for held messages.

## Root-owned inactive workflow wiring

The published workflow observed read-only was `Form website PĐ-VPT`, ID
`ptqU5elHz1yrDMmW`, active version `f78674d8-7c08-4cd3-b2ea-c3cf47002243`.
Only insert this gate between `Gmail Trigger1` (sender filter `noti@itso.vn`,
`simple:false`) and `Text Classifier`. Keep the Ladipage/Phúc Đạt branch and the
legacy classifier/extractor/HTTP nodes unchanged.

Use **Run Once for All Items** in a Code node with the exact string returned by
`getN8nCode()`. It embeds the tested classifier itself; do not reimplement the
regex in an expression or ask the LLM to detect the markers. It adds only
`_vptWebsiteMailOwnerV1={version,route,reason}`, keeps existing JSON/binary fields,
and sets `pairedItem` to the current input index for n8n lineage.

The following IF node allows only metadata `version === 1` AND
`route === 'legacy'` into the old `Text Classifier`. Every other/default output
goes to a clearly labelled terminal HOLD node emitting only the safe guard
version/route/reason, with no body/contact fields or HTTP/Bitrix/receipt/CRM action.
All input items are emitted by the guard, including HOLD; none are silently filtered out.
Do not wire HOLD back into either VPT create path. Metadata collisions stop with
the sanitized `VPT_MAIL_OWNER_INPUT_INVALID` error.

Root must inspect the latest published graph again before changing it, prepare
and validate the inactive candidate, and verify both managed and legacy synthetic
mail shapes before publishing. A new managed form remains held even while its
bridge job is queued/unknown; the existing bridge/admin queue owns investigation.
This file does not enable that queue or replay the older unresolved job.

## Isolated checks

The reviewed synthetic-only candidate was created inactive on 16 October 2026:
[VPT website — kiểm thử chống trùng](https://brain.ai.vn/workflow/gE1H2WGDyRUnopnq).
Its six nodes and connections were read back unchanged; n8n validation reports
zero errors and zero warnings. It has only a manual trigger, four synthetic
mail fixtures and terminal outputs, with no credential, Gmail, CRM or Ads call.
The source export is `vpt-website-mail-owner-v1.synthetic.json`. The workflow
has not been executed in n8n or published into the production form workflow;
the browser requires an authenticated n8n session. Fourteen local tests execute
the exact generated guard source. The production workflow remains unchanged.

The attempted inactive full clone was rejected before creation because the
existing `Kiểm tra user` node is disconnected. No production node was removed
or connected to satisfy that validator. Publish by inserting the three reviewed
guard nodes into the current production graph after the synthetic run, without
cloning or enabling another Gmail trigger.

```sh
node --test integrations/n8n/vpt-website-mail-owner-v1.test.js
```

Tests run the generated Code-node source in a VM with only synthetic `$input`.
They cover marker/legacy decisions, malformed/duplicate/forged content, Unicode,
header fallback, unknown shapes, field/binary preservation, item lineage and
metadata collisions. No WordPress/n8n/CRM request or customer data is used.
