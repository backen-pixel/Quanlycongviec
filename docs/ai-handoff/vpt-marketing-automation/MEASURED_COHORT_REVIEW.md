# Measured cohort — independent review and validation

2026-10-02. **PASS for this isolated increment; full Marketing–Sales goal IN PROGRESS.** No merge, deployment, live database change, provider call, account permission change or trial activation.

## Version and scope

Backend implementation `1c6507db7d497234e4068285cc199973e860a678`; final runtime revision `af14635c27ac0f2223b03a56e23a7be09c34bc1e` fixes the UI reload/save race without changing the backend. Base PR19 remains `e16c885ae7c2305645be02a1227bf378cb59137f`. CI tested synthetic merge `fd9f5be8c71d9f35cdefe8f94ffd31434db123c4`, containing af14635 plus that base. This does not mean either PR was merged.

Delivered: versioned30-day measurement registry with every configured Facebook account, private and audited write service, one-statement snapshot across spend/receipt/source/identity/quality, observed-customer classification and scoped dashboard. Configuration does not approve spending or another100m period. See [contract](MEASURED_COHORT.md).

## Evidence

| Check | Result and exact evidence |
|---|---|
| Independent review | Separate reviewer Agent `/root/architecture_v11_review`: PASS at af14635. Independently checked SQL655, trialReport and UI against published blobs, reran25 local tests and read CI logs. |
| Domain/service |25 local PASS. CI Node22:435 PASS,0 FAIL,0 SKIP; Node18 job SUCCESS. [Automation run](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37008287434). |
| Isolated PostgreSQL16 |13 PASS,0 FAIL,0 SKIP (12 child cases plus parent). Migrations649–655 applied twice. [Trial job](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37008287434/job/110841652486). |
| Regression and build | All9 automation jobs SUCCESS, including existing command/spend/quality/identity/intake PostgreSQL suites. Full frontend:10,301 modules built in39.91s. [Build job](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37008287434/job/110841652805). |
| Other required workflows | [Report correctness](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37008287440) and [Messenger](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37008287475): SUCCESS. |
| Browser | Parent tested actual candidate component in React StrictMode with synthetic API and CSP connect-src none, supported in-app browser; no login/live data. Scenarios below PASS; browser console errors empty. Reviewer read evidence, did not independently rerun browser. |

PostgreSQL cases cover private ACLs, current actor/company/tenant authority, registry replay, simultaneous same-UUID writes from two companies, account cost with zero customers, real652 receipt to650 qualification to654 identity, pure snapshot parity/no enrollment, rejected unassigned customers, older Lead/Customer history, A–B–A context staleness, confirmed concurrent qualification change during the SQL read, later failed/disabled spend source, and retained evidence after Lead deletion.

## Findings resolved

1. P1: two companies creating the same trial UUID could race. Global trial-ID serialization and fresh ownership/revision check prevent overwrite; concurrent test proves one winner.
2. P2: a newer first-touch could hide an older Lead/Customer. Earliest known creation/touch history now controls classification; missing history stays unresolved.
3. P2: a fresh rejected decision required ready routing. Rejected remains rejected without an assignee; qualified still needs valid routing.
4. P2: simultaneous acquisition sources on different Leads could select by UUID. Such ties remain ambiguous.
5. P2: reload during save could discard acknowledgement and strand the form. Form controls, submit button and submit handler block while loading.

Browser acceptance: default1280x720 readable; own saved period and all-account scope clear; incomplete coverage warning displayed without CPQL attainment. A valid form cannot submit during a held reload and resumes after release. A lost save response preserves the exact request UUID/payload on retry and yields one measurement record. Read failures hide old values. Delayed companyA reads and companyB saves cannot overwrite the newly selected company. Missing scope shows no report/configuration controls. Temporary tab/server were closed. Local reproducible fixture and transcript are in `work/vpt-measured-cohort/` of the Founder Control Center workspace.

## Limits and next dependency

Provider enumeration/reconciliation is **not yet implemented**. Observed counts are not proof that all Facebook customers arrived. CPQL stays null, target attainment false, survey source disconnected, and the new report flag remains default-off. This PASS does not certify provider coverage, live data/rights, ad execution, or the full goal.

Next: connect official provider enumeration with pagination, bounded watermarks and durable reconciliation; account for missing/legacy/orphan receipts, then prove a complete positive measurement path including1m spend/4qualified=250k and error paths. Preserve actual account capability/retention limitations instead of accepting a caller-supplied completeness flag. Continue AI advice/handoff/opt-out/calendar and other channels after their dependencies.

Before real release, verify schema/numbering/backup and restore, actual permissions, trial dates, account roster and exception owner, performance and operational UAT, then present the concrete release package for Founder approval. Stop the new path by disabling its flag; retain audit, source and accepted records. No unsafe permission rollback.
