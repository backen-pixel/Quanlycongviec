## Problem and behavior
Founder needs a tenant-safe Marketing → CRM control center inside ChatGPT with evidence and durable goals/decisions. This adds five governed MCP tools and three Skybridge views. Unknown/incomplete sources remain explicit; decisions are recorded with object/version/digest and never execute ads or notifications.

## Scope and integration
Reuse Express MCP gateway, API-key identity, audit, Primary DB routing, existing FB durable inbox/atomic intake receipts, attribution and CRM. Add canonical Founder domain/application service, dedicated founder_read/founder_write key permissions, default-off feature gates, and candidate SQL711 for objective/proposal/decision/idempotency receipts with atomic audit. No new orchestrator, no changes to project approval flows or the current automation shift.

VPT 08–22 UTC+7 SLA requires trusted company UUID and verified human outbound evidence. Ads >=50k/no-phone/midnight reset remain dry-run, POLICY_SCOPE_UNVERIFIED by default. No live database migration, Meta action, external message, merge or deploy.

## Validation
- Backend: 219/219 synthetic/new and existing regressions pass.
- Skybridge app: npm ci, build, typecheck and 16/16 tests pass; synthetic PostgreSQL WASM transactions/ACL and real MCP HTTP transport with mock backend.
- Not validated: Supabase staging/multi-session concurrency, OAuth/ChatGPT host, production browser/real marketing data, independent review.

## Release and rollback
Review schema/catalog/ACL, staging concurrency, OAuth identity/discovery and HTTPS MCP endpoint before enabling. Defaults remain off. Rollback disables flags/stops adapter and revokes RPC execution while preserving recorded evidence.

Full source map, run/config instructions and limitations: docs/ai-handoff/FOUNDER_CONTROL_CENTER_V1_20261007.md and apps/founder-control-center/README.md.
