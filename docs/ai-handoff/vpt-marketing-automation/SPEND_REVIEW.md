# Independent review — Facebook spend continuation

Code base: PR22 `38c71c15aa981d88653e65bb3432d01a1ed42db2`. Published implementation: `94528fa77b4610b4b90fe33df3d4858de88801c0`. Reviewer: separate read-only agent `/root/architecture_v11_review`, authorized by Founder.

Reviewer conclusion: **PASS for the reviewed code/local tests**, not operational release. Independently reran218/218 tests (55 new +163 earlier). Root added three further adapter/coverage tests and ran221/221; those three test-only additions are not attributed to the reviewer.

Closed findings: missing-tenant/company admin scope; request company replacing the null owner of a stored credential; legacy journal write after primary refusal; stale coverage numbers during/after sync; empty account name becoming string `null`. The reviewer checked pagination, reconciliation, currency, NULL publication and ACL by inspection, and verified migration644 column types at the pinned baseline. The reviewer did not personally run PostgreSQL, frontend build or browser.

Root evidence on implementation94528fa:

- [Automation CI36983657392](https://github.com/backen-pixel/Quanlycongviec/actions/runs/36983657392): Node18/22 unit+regression PASS; original PostgreSQL command job PASS; new PostgreSQL16 spend job PASS,9 scenarios + test wrapper =10PASS/0FAIL/0SKIP. Verified job110763669111 logs.
- Whole frontend Vite build PASS,10,297 modules,38.14seconds, job110763669364. Existing chunk-size/deprecation warnings; no build errors. This is a build check, not authenticated full-app UAT.
- [Existing report CI36983657387](https://github.com/backen-pixel/Quanlycongviec/actions/runs/36983657387) PASS.
- Supported browser at127.0.0.1:4183 with actual candidate page/component and synthetic API only; CSP connect-src none. CompanyA500k→B750k changed correctly; failed source hid old750k and displayedUNKNOWN; pending sync hid old500k; failed read after sync completion remainedUNKNOWN. Screenshot inspected. Server and temporary tab closed afterward.

Browser inspection prompted one UI-only follow-up: require both dates before mounting the spend card, preventing a blank period label/request. Confirmed its prompt and30-day selection in the browser. The closing commit must run CI again; inspect that head rather than treating this document as proof of its result.

No real-account response reconciliation, production rights/RLS verification, CRM-qualified Lead count, whole-trial cost, regional split, survey binding or AI customer delivery was established. All remain part of the active goal and release gate. No production deployment/DB migration or ad/customer mutation occurred.
