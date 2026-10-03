# Browser check — measurement period

2026-10-03. Actual `MarketingLeadTrial` and `FacebookSourceRecovery` components, React StrictMode, local synthetic API; simplified fixture CSS. Backend `reportTrial` generates responses from synthetic fixtures. No login, real CRM, provider connection or writes. CSP `connect-src 'none'`; temporary localhost4189 and IAB tab18.

Verified through supported browser AX interaction:

1. Normal closed-day fixture: two accounts,500,000 VND spend (including zero-Lead account),4 qualified/1 pending, measured Oct1 only. Recovery shown separately through Oct2 01:00 Vietnam while measured cutoff is Oct2 00:00. No CPQL attainment claim.
2. Day-one completed recovery scan: NO_CLOSED_DAY, all four metric cards show “Chưa có ngày hoàn tất”; no zero-day interval or zero-customer cards. Recovery remains available and its own interval is shown. Message does not claim intake already succeeded.
3. Out-of-period source timestamp conflict: one receipt exception remains visible in both report and reconciliation; no matched-complete claim.
4. Synthetic source failure selected in fixture: report numbers are absent and the error is visible. This fixture switches/remounts scenarios; it does not establish network race/reload behavior or replace existing state tests.

Rebuilt and reloaded after the final empty-day label changes. No full-production layout, Meta UAT, survey-calendar integration or live CPQL claim. Temporary server/tab are closed after the check.
