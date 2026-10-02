# Validation — implementation candidate

Source: PR19 e16c885ae7c2305645be02a1227bf378cb59137f; approved plan02/10. Local Node24,131 unit/regression cases passed before publication. Node test runner child spawn returned EPERM; same tests ran in-process with node:test. This is not an approval-review rejection or a production test.

Tests cover domain boundaries, synthetic accounting projection, content source guards, opt-out/handoff, uncertain provider/commit result, backup write rejection and53 prior report/UI logic regressions (two estimate assertions updated to corrected semantics), plus MCP/insight financial regression. They do not prove real auth, channel API capabilities, financial completeness, atomic budget reservations, calendar availability or autonomous runtime.

PostgreSQL workflow uses a fresh loopback-only database named marketing_automation_test, no live credentials; migration reapply, denied anon/authenticated access, RLS deny-all, wrong scope/version/action,12 concurrent idempotent submits, changed-content conflict, revoked/expired grants, concurrent claim, terminal idempotency and crash recovery. Local PostgreSQL is unavailable; record CI results on final head separately.

Independent reviewer report and CI/browser observations are appended after execution. Until then the full plan/UAT/release status is IN PROGRESS/HOLD, not DONE.
