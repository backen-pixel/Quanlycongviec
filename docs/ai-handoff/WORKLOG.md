## 2026-10-08 — P1-8: tổng hợp tạm tính chỉ đọc

File: `p1Qualification.js` (route), `trialCohort.js`, 4 tệp test route/UI, `P1QualificationPanel.jsx`, `p1Qualification.js` (frontend/lib), CURRENT.md, WORKLOG.md. `/summary` không trả danh tính khách, không kết luận mục tiêu; scope trùng tài khoản giữ tổng chưa biết để tránh cộng đôi.
Kiểm tra: Node test, `node --check`, `git diff --check` (số ca ở báo cáo cuối). Chưa kiểm DB/HTTP thật, build/trình duyệt, nguồn chi tiêu thật. Hoàn tác: bỏ đúng delta P1-8 và hai mục handoff này.
## 2026-10-08 — SX mobile: summary HCB hết 500 (chia lô id) và KPI app theo cột

- Backend `backend/src/helpers/sxKanbanSummary.js` (commit `06b530d7`): thêm `scanRowsMaybeChunked` (dùng `pickChunkTarget`, `chunkIds`, `SX_URL_SAFE_ID_MAX=300` của `sxChunkedIdPage.js`); `thinScanSummary` và `loadSxDeadlineBucketPage` tách phần phân trang thành `scanOnce`, chạy từng lô song song rồi hợp nhất theo `id`. Gốc lỗi: `applySxKanbanRowScope` → `buildScopeOrFilter` đưa `id.in.(…wonIds…)` vào URL; HCB 652 id > ~556.
- App `sx-mobile/src/lib/sxBoardKpis.ts` (commit `09a403dc`): `computeSxBoardKpis` đếm producing/awaiting/shipped bằng `sxColumnKpiKey(stageOf(...))` thay cho `projectIsProducing/AwaitingDelivery/projectIsShipped`; xóa `columnSaysShipped`. Khớp web `computeSxRevenueKpis` và BE `classifyRowStageKpi`.
- PR: #53, #54 đã merge vào main; nhánh đã gộp `origin/main` cục bộ (`a947afb2`, chỉ xung đột CURRENT.md/WORKLOG.md, giữ cả hai bên), chưa push vì cây trùng main.
- Kiểm tra (chỉ-đọc, không ghi dữ liệu thật): script Node gọi `loadSxKanbanColumnSummary` cho HCB Tủ bếp 429 / SP 41 / CVC 5 / DVC 121 / QH 7, HCB mọi loại 652, Metalla 91 (24/1/3) không đổi; đếm tay theo luật cột trong DB ra 41/5/121. Đo API (lượt 2-3): team-project-tasks 435-484 ms, bảng sản xuất 259-284 ms (690 KB), work-tasks ~780 ms. Khởi động nguội app trên LDPlayer 3,3-3,9 s (chỉ để so sánh nội bộ).
- Ngoài phạm vi, để ngỏ: TB-2026-556 bị loại khỏi bảng (web và app); `TEAM_TASKS_SCAN_CAP` cắt âm thầm; số «5 quá hạn» trên web vs 7; TB-2026-1037/1038 hiện nhãn «Đã giao»; mất thân bài mục 06/10 16:39 do gộp #55. Chưa kiểm chứng sau deploy (cần LDPlayer + Metro hoặc đăng nhập web).

---

## 2026-10-07 — P1-7b: khối đánh dấu khách hợp lệ

File: `p1Qualification.js`, `p1QualificationQueue.route.test.js`, `p1QualificationUi.test.js`, `p1Qualification.js` (frontend/lib), `P1QualificationPanel.jsx`, `AdAnalyticsPage.jsx`, CURRENT.md, WORKLOG.md.
Kiểm tra: Node 37/37 test đạt, `node --check` route, `git diff --check`; chưa chạy build, trình duyệt, DB/HTTP thật. Hoàn tác: bỏ đúng delta và tệp P1-7b nêu trên.

---

## 2026-10-07 — P1-7: route qualification mặc định tắt

File: `p1Qualification.js`, `p1Qualification.route.test.js`, một dòng `server.js`, CURRENT.md, WORKLOG.md. Admin cùng công ty hoặc admin hệ thống trong HST được duyệt; cờ tắt 404, backup 503, lỗi DB được lọc.
Kiểm tra: `node --check` route/server; route 22/22, qualification/trialRegistry 11/11, `git diff --check`. Chưa kiểm chứng HTTP thật, migration/RPC thật, failover thật.

---

## 2026-10-06 — P1-5: qualification events
File: hai SQL 712, `qualification.js`, `qualification.test.js`, CURRENT.md, WORKLOG.md. Chỉ thêm bảng sự kiện/RPC và module chưa nối runtime.
Kiểm tra: `node --check` đạt; test qualification 6/6 và test trialRegistry 5/5 đạt; `git diff --check` sạch.
Chưa kiểm chứng: SQL thực, chạy migration hai lần/rollback, ACL và giao tranh trên bản sao; test Node giả không chứng minh các điểm này.

---
## 2026-10-06 — P1-6: adapter chi tiêu chỉ đọc
- Thêm module thuần và adapter `fb_ad_accounts`/`fb_ad_spend_daily` phân trang, kiểm sync/VND/cửa sổ/tính tươi/trùng dòng/tràn số; không chọn token hoặc ghi DB.
- Kiểm tra: `node --check` hai file; P1-6 14/14, fbMarketingSync 8/8, leadMeasurement 38/38; chưa đối chiếu DB/Meta thật.
- Quyết định: tổng chỉ có bằng chứng cấp ad (`AD_LEVEL_ONLY`); không có dòng và sync không đủ thì tiền `null`. Hoàn tác: bỏ hai file JS và hai mục P1-6.

---

## 2026-10-06 — P1-2: thu hồi quyền thừa của service_role (SQL 710)
- 710 đã áp lên DB chính (PG 17.6, 3 bảng rỗng, RLS bật, anon/authenticated = 0). Kiểm tra sau áp thấy service_role còn UPDATE/DELETE/TRUNCATE trên bảng nhật ký do quyền mặc định của Supabase; thiết kế yêu cầu chỉ SELECT+INSERT.
- Sửa 710: thêm REVOKE ALL FROM service_role trước GRANT. Bài thử nhánh tạm giờ cài quyền mặc định giống DB chính; 35/35 đạt. Chưa áp bản sửa lên DB chính (cần Founder duyệt riêng).
## 2026-10-07 — SX mobile (quản lý): việc dự án cả đội, lọc hạn ở máy chủ, khử trùng trước khi lọc

- Backend `backend/src/routes/workTasks.js`: route mới `GET /team-project-tasks` (chỉ quản lý; tham số `company_id, assignee_id, q, due_days, created_days, workshop_type_id, no_deadline, due_from, due_to, page, page_size`). `computeTeamTasks` quét `unified_tasks_v` song song, cache 30 s (`teamTasksCache`), khử trùng theo `project_id|title` (ưu tiên bản không phải `crm_task`), gom nhóm theo dự án (quá hạn → sắp đến hạn → mới/không hạn). Commit cuối `698c5a68`: khi có `due_from/due_to`, lấy thêm bản không-`crm_task` của các dự án có việc CRM trong khoảng, khử trùng rồi mới lọc lại khoảng hạn. Cũng `crmAssignments.js`: `exclude_done=1`; `crmTaskLeadAccess.js`: `assigneeReadGrant` cho GET comments/members.
- App `sx-mobile`: `lib/teamProjectTasksApi.ts` (mới), `lib/workTasksApi.ts`, `screens/WorkScreen.tsx` (chip Người/Phân loại/Hạn, mục "Không hạn", hiện dần từng nhóm), `screens/OverviewScreen.tsx`, `screens/KanbanScreen.tsx` (effect `dueJumpedRef` tự nhảy tới cột đầu tiên có dự án khi áp Hạn xử lý).
- PR đã merge vào main: #49, #50, #52 (squash; lần sau gộp `origin/main` vào nhánh và giữ phía nhánh nếu báo xung đột).
- Kiểm tra: SQL chỉ-đọc (project `qlycv`) khớp app sau deploy — HCB 07/10/2026: Tủ bếp Hôm nay 43/3, Ngày mai 51/3; Cánh kính Hôm nay 7/1, Ngày mai 7/1. Trước sửa lệch 56/4 và 17/2 do dự án TB-2026-986/989. Không ghi dữ liệu thật.
- Chưa làm/để ngỏ: độ mượt cuộn trên máy thật; `/project-overview` ~13,7 s với HCB; phân quyền sửa/xóa không gian chung; badge thông báo race; giải thích hiển thị web của TB-2026-901. File chưa commit và không thuộc việc này: `backend/package.json`, `route-manifest*.json`, `route-parity-report.json`, `debug-fb4228.log`, `docs/ops/README.md`, `.claude/`, `backend/tests/sx-kanban-counts-readonly.js`.

---

## 2026-10-07 — Phát sinh trên CRM, VC, Kế toán, Mua hàng, module tùy chỉnh

- Cùng trang `/sx/phat-sinh`: tab Không phí / Có phí, lọc `phat_sinh` theo `assignment_module` của từng module.
- File: `ProductionPhatSinhPage.jsx`, `CustomModuleAssignmentsPage.jsx`, `App.jsx`, `Sidebar.jsx`, `customAppModuleSidebar.js`.

---

## 2026-10-07 — Chi phí phát sinh kế toán theo việc phát sinh không gian chung

- Thay helper `accountingExpenses.js` bằng `accountingPhatSinh.js`: `listDealPhatSinh`, `setPhatSinhCost`, `summarizePhatSinhByLeadIds`. Chi phí ghi qua `upsertCostEntry` (`source_table='crm_tasks'`, `source_row_id=crm_task_id`, `source_key='sx.project_expense'`); bỏ phí thì void.
- API mới `GET /accounting/deals/:leadId/phat-sinh`, `PUT /accounting/deals/:leadId/phat-sinh/:assignmentId/cost` (body `{ amount }`, null = bỏ). Bỏ API `/expenses`.
- `accountingDeals.js`: dòng deal có `phat_sinh_count`, `phat_sinh_missing_cost`, `extra_cost_total`. `accountingChecklist.js`: mục `phat_sinh_cost`.
- Frontend: `PhatSinhPanel.jsx` thay `ExpensesPanel.jsx`; dòng "Phát sinh (n việc)" trên thẻ dashboard trỏ tới `#phat-sinh`; nút "Ghi phí" trong checklist.
- Test: `node tests/accounting-checklist.js` ok. Đã xem LEAD-2026-958 (2 việc, chưa ghi phí) trên trình duyệt. Chưa ghi phí thật.

---

## 2026-10-07 — Kế toán ghi chi phí phát sinh (đã thay bằng mục trên)

- Helper `accountingExpenses.js` (đọc/ghi `project_expenses`, ghi sổ chi phí qua `syncProjectExpense`, xóa thì void `cost_entries`). API `GET/POST /accounting/deals/:leadId/expenses`, `DELETE .../expenses/:expenseId`.
- `accountingDeals.js`: dòng deal có `extra_cost_total/count`; summary `total_extra_cost`; CSV cột "Chi phí phát sinh".
- Frontend: `components/accounting/ExpensesPanel.jsx` ở tab Tài chính chi tiết deal; ô "Phát sinh" trong khung Chi phí theo nguồn; dòng "Phát sinh" ở bước Xưởng trên thẻ dashboard.
- Khác với trang `/ketoan/phat-sinh` (việc phát sinh trên `crm_assignments`, không có số tiền) do phiên khác thêm, chưa commit.
- Đã xem trên trình duyệt, chưa lưu khoản chi thật (bảng `project_expenses` hiện trống).

---

## 2026-10-07 — Thẻ deal kế toán dạng 4 bước

- `AccountingDashboard.jsx`: thẻ deal đổi thành đầu thẻ (mã, tên deal, khách, hồ sơ, Còn phải thu) + 4 bước CRM / Xưởng / Chứng từ / VC-LĐ có vạch màu trạng thái; số tiền nằm trong từng bước. Bỏ hàng số liệu cuối thẻ và chú thích cũ.

---

## 2026-10-07 — Kế toán thêm VC/LĐ

- Helper mới `accountingVcInfo.js` (giai đoạn VC từ cột kanban VC). `accountingDeals.js` đọc thêm `logistics_company_id, vc_kanban_column_id, vc_deleted_at, logistics_cost, delivery_date, install_date`; summary thêm `vc_breakdown`, `total_logistics_cost`; CSV thêm 5 cột VC/LĐ; lọc `vc_group=none|active|done`.
- API mới `PUT /accounting/deals/:leadId/logistics-cost`. `/checklist` trả thêm `vc`.
- Checklist thêm `vc_cost`; `collected` tính cả khi `vc_done`.
- Frontend: `AccountingDashboard.jsx` (làn VC/LĐ, chip lọc, KPI Phí VC/LĐ), `AccountingDealDetail.jsx` (ô VC/LĐ + nhập phí), `AccountingReceivablesPage.jsx` (cột VC/LĐ).
- Test: `node backend/tests/accounting-checklist.js`. Đã xem trên trình duyệt (VPT: 140 chưa bàn giao, 60 đang VC/LĐ); chưa bấm lưu phí thật.

---

## 2026-10-07 — Kế toán giai đoạn 1

- API mới: `GET /accounting/receivables`, `GET /accounting/deals/:leadId/checklist`, `POST /accounting/deals/:leadId/invoices`. `/deals` và `/export` nhận thêm `missing_docs`, `missing_item`, `name_mismatch`.
- Frontend: `AccountingChecklist.jsx`, `InvoiceFromOrderModal.jsx`, `AccountingReceivablesPage.jsx` (route `/ketoan/cong-no`, menu Sidebar), sửa `AccountingDashboard.jsx`, `AccountingDealDetail.jsx`, `App.jsx`.
- Backend: `accountingChecklist.js`, `accountingInvoices.js`, sửa `accountingDeals.js`, `accountingDealDetail.js`, `accounting.js`.
- Test: `node backend/tests/accounting-checklist.js`, `node backend/tests/accounting-deal-identity.js`. Đã xem trên trình duyệt bằng tài khoản kế toán VPT; chưa bấm tạo hóa đơn thật.
- Rollback: bỏ các file trên; không có migration.

---

## 2026-10-07 — Chuông bình luận theo module người nhận

- Deal đã có VC vẫn gửi một `ecosystem_module_key` chung, frontend chỉ nhận diện SX rồi còn lại nhảy `/crm/leads`. NV xưởng Metalla không vào được.
- Bấm chuông chọn đường dẫn theo module của người đang đăng nhập. Thông báo mới gắn `viewer_module_key` từng người nhận.
- File: `NotificationCenter.jsx`, `dealModulePathAccess.js`, `dealCommentNotifications.js`, `commentViewerModule.js`.

---

## 2026-10-07 — Kế toán đối chiếu báo giá

- Dashboard kế toán bỏ bảng nhiều cột, mỗi deal hiện tên CRM, tên xưởng và file báo giá cạnh nhau. Lọc được deal tên khác nhau. Xuất Excel thêm tên xưởng và tên file.
- Chi tiết deal hiện cùng hai tên, mỗi tài liệu ghi mã CRM và mã xưởng.
- File: `AccountingDashboard.jsx`, `AccountingDealDetail.jsx`, `accountingDeals.js`, `accountingDealDetail.js`, `accounting.js`, `accountingDealIdentity.js`, `tests/accounting-deal-identity.js`.

---

## 2026-10-06 — Sửa đếm 1/7 khi CRM còn việc mở

- `indexSxCrmCompletion` không còn coi xong nếu chỉ một bản CRM cùng tên đã completed mà bản khác vẫn pending.
- File: `projectOverviewDeadline.js`, `tests/project-overview-deadline.js`.

---

## 2026-10-06 — Kanban Quản lý nhiệm vụ

- Thêm nút Kanban / Hạn. Kanban xếp danh mục theo tiến độ việc con.
- File: `frontend/src/pages/ProjectTasksOverviewPage.jsx`.

---

## 2026-10-06 — Dải KPI trên Quản lý nhiệm vụ

- Thêm Tổng, Chưa làm, Đang làm, Đã làm, Quá hạn vào `ProjectTasksOverviewPage` (mọi module).
- File: `frontend/src/pages/ProjectTasksOverviewPage.jsx`.

---

## 2026-10-06 — Nhiệm vụ CRM cùng giao diện cột hạn với SX

- Khung `/crm/project-tasks` tràn ngang như trang xưởng. Thẻ CRM thiếu hạn thì hiện hạn lịch lắp để vào đúng cột.
- File: `workTasks.js`, `App.jsx`.

---

## 2026-10-06 — Lọc deal theo công ty và nhân viên CRM

- Picker dự án/deal thêm chọn Công ty và Nhân viên CRM (`/crm/employees-by-company?for_module=crm`).
- File: `LeadDealPicker.jsx`, `CRMAssignmentsPage.jsx`.

---

## 2026-10-06 — Cột Ngày mai ở nhóm theo hạn

- Thêm nhóm `tomorrow` vào Deadline giao việc, giữa Hôm nay và Tuần này.
- File: `frontend/src/pages/CRMAssignmentsPage.jsx`.

---

## 2026-10-06 — Form phát sinh giống Không gian chung

- Hộp giao việc phát sinh thêm phân loại, người chịu trách nhiệm, người làm. POST tạo việc ghi `phat_sinh_kind`.
- File: `CRMAssignmentsPage.jsx`, `crmAssignmentMutations.js`, `phatSinhKinds.js`.

---

## 2026-10-06 — Kéo thả thẻ giao việc

- Sửa kéo thả Kanban: `dataTransfer` + ref, không setState khi bắt đầu kéo. Thả cùng cột thì bỏ qua.
- File: `frontend/src/pages/CRMAssignmentsPage.jsx`.

---

## 2026-10-06 — Bộ lọc nhanh giao việc mặc định đóng

- `AssignQuickFilterPanel` khởi tạo `open = false` thay vì mở khi màn hình từ 768px.
- File: `frontend/src/pages/CRMAssignmentsPage.jsx`.

---

## 2026-10-06 — Giao việc: bỏ «Tất cả công ty»

- Dropdown Công ty ở bộ lọc trang giao việc chỉ còn từng công ty. Công ty trống hoặc không hợp lệ được gán mặc định; Đặt lại không xóa công ty.
- File: `frontend/src/pages/CRMAssignmentsPage.jsx`.

---

## 2026-10-06 — ★ pipeline chọn được nhiều dòng

- Dấu ★ trên liên kết loại CRM → SX đổi từ radio (một dòng) sang checkbox (nhiều dòng). Backend `replaceLeadTypeProductionLinks` giữ mọi `is_primary`, không còn xóa sao dòng thứ hai khi lưu.
- File: `frontend/src/pages/PipelineSettingsPage.jsx`, `backend/src/helpers/crmLeadTypeProductionLinks.js`.

---

## 2026-10-06 — Hiện dấu ★ setup pipeline trên chọn xưởng

- Đã làm: `companyShowsSxStar` / `workshopTypeShowsSxStar` đọc `is_primary` của `production_links`. `SxMultiTargetPicker` gắn ★ vào option công ty và phân loại. Deal không có loại dùng toàn bộ loại CRM của công ty.
- File: `frontend/src/lib/sxCompanySuggestFromLeadType.js`, `frontend/src/components/SxMultiTargetPicker.jsx`, `LeadDetail.jsx`, `CRMDashboard.jsx`, `DealProductionProjectsPanel.jsx`.
- Kiểm tra trên deal `12f731cf` (chưa có loại): ★ HCB, ★ Phúc Đạt; chọn Phúc Đạt thì ★ Cửa; chọn HCB thì ★ Tủ bếp.

---

## 2026-10-06 — Sửa đồng bộ Facebook Marketing theo BRIEF_SYNC

File: `backend/src/helpers/fbMarketingSync.js`, `backend/tests/fbMarketingSync.test.js`, `docs/ai-handoff/CURRENT.md`, `WORKLOG.md`. Phân trang báo thiếu, currency không đoán VND, số sai không ghi 0, ngày theo Việt Nam, lỗi Meta chỉ lưu mã lọc. Fetch/Supabase giả với `<TOKEN_GIA>`: V8 8/8 PASS; `node --check`/`node --test` và `git status` bị chặn khi tạo phiên sandbox. Chưa gọi DB/Meta. Hoàn tác: đảo diff bốn file này.

---

## 2026-10-06 — P1-1: bộ đo Lead hợp lệ

- File đổi: `leadMeasurement.js`, `marketingAutomation.leads.test.js`, `CURRENT.md`, `WORKLOG.md`; không commit/push.
- So sánh `spend <= target × qualified` bằng số nguyên an toàn; `uiState` theo reason và trạng thái đo.
- Kiểm: 25 → 38 test; harness JS giả lập 38/38, search caller trong `backend/src` không có. Claude review đã chạy Node 24 `node --test --test-isolation=none` (38/38) và `git diff --stat` (4 file).
- Chưa kiểm: Node thật, tích hợp/runtime, DB/mạng. Hoàn tác đúng bốn delta P1-1, giữ lịch sử cũ.

## 2026-10-06 — Chuẩn bị kích hoạt theo quyết định Founder

Đã đọc trực tiếp cấu trúc và routing Primary, Render deployment; xác nhận Admin VPT đúng công ty/tenant, default stage đúng pipeline. Phát hiện `notifications.entity_id` thật là TEXT, sửa receipt replay và đưa trigger147/568 thật vào fixture. Bổ sung khôi phục đầy đủ fixture SQL702; lỗi CI đầu do PostgreSQL chuẩn hóa ngoặc CHECK được sửa bằng round-trip nguyên DDL trong fixture, vẫn so sánh nghiêm dữ liệu/quyền và thử CHECK từ chối hàng sai.

Source `327864b759c6e5663949b87723ed7049c209d193`: tách signed Lead Ads quản lý khỏi Messenger, bảo vệ contact/receipt khỏi các writer/bảo trì cũ,234/234 Node cục bộ PASS. Review độc lập và CI đang chạy; phát hiện thiếu Page scope ở màn hình Lead Ads đang được sửa trong cùng phạm vi. Chưa thay production. [Routing, lỗi Backup, cấu hình cần xác minh và trình tự chuyển đổi](FACEBOOK_LEAD_ADS_ACTIVATION_20261006.md).

---

## 2026-10-06 — H1: gói tiếp nhận Facebook Page riêng từ main

Founder giao tiếp tục và giữ quyết định phát hành. Đã tách nhánh `codex/facebook-durable-inbox-20261006` từ main `1f879ea8`, triển khai signed durable inbox + SQL701, giữ worker paused. Không merge PR22/25 toàn khối; không sửa SQL700 của Claude. [Phạm vi, giới hạn, kiểm thử và phương án dừng](FACEBOOK_PAGE_INBOX_H1_20261006.md).

Hoàn tất PR29 draft, source `c97c2f3d`:104/104 Node PASS; CI H1 run37383522836 đạt3/3job gồm15/15 PostgreSQL17 + restore fixture; regression Messenger cũ5/5 PG PASS; reviewer độc lập PASS mã mặc định tắt. CI đầu thiếu CLI17 đã được sửa và chạy lại toàn bộ. Nghiệp vụ tự tạo Lead/projection/attribution còn pending có chủ đích; không dùng ACK/inbox làm Lead hợp lệ. Bật hệ thống thật HOLD. Không merge/deploy/áp SQL/ghi DB thật; chỉ mã, test và hồ sơ. Mục lịch sử bên dưới giữ nguyên theo thời điểm ghi.

---
## 2026-10-02 — MCRM-D0 v1: khảo sát và thiết kế thử nghiệm trợ lý Marketing–CRM

- AI thực hiện: Codex; reviewer phiên riêng theo hồ sơ VALIDATION.
- Yêu cầu Founder: thực hiện bước khảo sát/đóng gói đã đề xuất cho trợ lý Marketing–CRM.
- Đã làm: nguồn mã có SHA, phạm vi/owner/gate, 4 tool contract, mẫu báo cáo/fixture, target còn thiếu và 26 case chưa chạy.
- File thay đổi: thư mục `docs/ai-handoff/marketing-crm-assistant/`, liên kết README và mục trạng thái CURRENT/WORKLOG này.
- Kiểm chứng và kết luận review: [VALIDATION](./marketing-crm-assistant/VALIDATION.md); kiểm tài liệu/fixture không thay kiểm ứng dụng.
- Chưa làm: implementation runtime, OpenAI API, DB/Meta/CRM thật, merge/deploy. Không dùng báo cáo giả làm chỉ số vận hành.
- Bước tiếp: chốt target/người nghiệm thu/policy; mở đúng gói implementation sau khảo sát. Hoàn tác gói này bằng revert commit tài liệu.

---


## 2026-10-02 — F-13/F-14: Marketing tự động, đo Lead trước

Founder đã giao triển khai kế hoạch thay phương án A/B/nhân sự cũ, rồi chuyển phép đo trước mắt sang250.000 đồng/khách hợp lệ. Trần một đợt100 triệu/30 ngày và80/20 giữ nguyên;300 khách tương ứng75 triệu, không buộc tiêu hết.7% doanh thu đánh giá sau; không chặn giai đoạn Lead vì chưa nối kế toán.

[PR22](https://github.com/backen-pixel/Quanlycongviec/pull/22) chứa bản sửa báo cáo và nền domain/queue đang tắt, [kế hoạch](https://github.com/backen-pixel/Quanlycongviec/blob/codex/vpt-marketing-automation-20261002/docs/architecture/VPT_MARKETING_SALES_AUTOMATION_V1.md) và [trạng thái triển khai](https://github.com/backen-pixel/Quanlycongviec/blob/codex/vpt-marketing-automation-20261002/docs/ai-handoff/vpt-marketing-automation/README.md). Các adapter dữ liệu thật, atomic budget/slot, tài sản/nội dung và UAT chưa hoàn tất. Không merge/deploy/đổi ads/DB thật. PR20 là hồ sơ kiến trúc; PR19 vẫn là dependency của PR22. Xem validation đúng phiên bản trong PR22, không suy tất cả hệ thống PASS.

F-13/F-14 là quyết định mới, F-12 và nhật ký dưới đây giữ lịch sử theo thời điểm. Các gate kiến trúc/Factory và sources đồng bộ giữ nguyên.

---

## 2026-10-02 — Cập nhật ưu tiên Marketing đa kênh theo Founder

- Thực hiện: Codex. Yêu cầu: ưu tiên tạo khách qua Marketing đa kênh; Founder nêu website/Google/ChatGPT Ads/TikTok/Zalo và giao lập phương án tăng ngân sách.
- Đã làm: F-12, roadmap thu hút → nhận khách → tư vấn → đo chất lượng; gói MK-01…06 và hai phương án media chờ duyệt. Kế thừa ngân sách Facebook đã duyệt; chưa sửa chiến dịch.
- Kiểm tra: nội dung/phạm vi, phép tính ngân sách, liên kết và bảo toàn phần lịch sử; review bổ sung tại MARKETING_PRIORITY_REVIEW_20261002.md. Không dùng PASS tài liệu thay UAT hoặc phê duyệt chi tiền.
- Chưa làm: chạy Ads/CRM/DB/API, tích hợp kênh hoặc merge/deploy. Không cam kết số khách khi chưa có baseline.
- Hoàn tác: revert commit tài liệu, giữ lịch sử. Các quyết định và bằng chứng chặng 0 cũ giữ phạm vi phiên bản riêng.

---

# 2026-10-01 — Chặng 0 / bộ kiến trúc Business AI OS V1.1

Theo kế hoạch Founder yêu cầu triển khai: soạn kiến trúc, roadmap, bản đồ ownership, sổ quyết định và ADR; gắn vào mục lục/AGENTS/CLAUDE. Đã đối chiếu 31 bản nguồn với blob Git, main 0db11ce1adb0fb89fc87529036e495a62d58fce7; phát hiện lõi Order hiện có, task xưởng trong crm_tasks, hỗ trợ đa xưởng/đa đợt, giới hạn flowRuntime và 54 nhóm số SQL trùng.

Hồ sơ: [bằng chứng](ARCHITECTURE_V1_1_EVIDENCE_20261001.md), [lộ trình](../architecture/BUSINESS_AI_OS_V1_1_ROADMAP.md). Gói chỉ sửa tài liệu/hướng dẫn; không code runtime, migration, config, quyền, CI, lịch hoặc quảng cáo. Kiểm tra liên kết/phạm vi/bảo toàn lịch sử và [review độc lập](ARCHITECTURE_V1_1_INDEPENDENT_REVIEW_20261001.md) PASS; không suy test phần mềm từ kiểm tra này. Prefix mới giữ nguyên toàn bộ nội dung lịch sử phía sau.

---


## 2026-10-05 - PR A minimal: lead measurement core
Files: backend/src/modules/marketingAutomation/policy.js, leadMeasurement.js; backend/tests/marketingAutomation.leads.test.js; .github/workflows/marketing-lead-measure-core.yml; CURRENT.md and WORKLOG.md.
Source: PR #22 commit 679cb926. policy.js keeps APPROVED_PLAN, money, instant; removes DAY, deny, evaluateBudgetMove, humanDeadline.
Checks: Node 24.19.0 node --check passed for all three JS files; node --test --test-isolation=none passed 25/25. Plain node --test could not spawn in sandbox (EPERM); Node 18/22 CI is pending.
Runtime: no caller, no real-data report, no DB/API access, migration, deployment, commit, or push.
Rollback: remove the four added code/CI files and these two handoff entries.

## 2026-10-01 - Issue #15: Marketing / Business AI OS M0 candidate

**State: IN PROGRESS.** Feature branch `codex/marketing-bos-m0-20261001`, base `0bc6392286df0b986cdd6dfc59b499916dd6fd31`; implementation commit `33874dd2e3632c0a1127fd76cc7351a663138e9c`.

Added a pure normalized-evidence contract and synthetic tests, ADR-0015, an integration/dependency map, a non-runtime implementation backlog and a read-only PR CI workflow. See `MARKETING_BOS_M0_EVIDENCE_20261001.md` and `../architecture/MARKETING_BOS_INTEGRATION_V1.md`.

Verification: 73/73 synthetic tests on Node 22.16.0 in an isolated container; 73/73 on Node 24.19.0 in a fresh Windows sandbox after fetching this exact GitHub commit. All six new Git blob SHA-256 hashes match the locally tested contents. Helper/test syntax and diff checks pass. These are repeat runs by the same assistant, not independent review; no full application, staging or live E2E tests were run.

No main merge, production deploy, SQL, CRM records, ad budgets/statuses, credentials, permissions, scheduler, agent deletion or existing runtime files were changed. The helper is not registered in an application route/worker. PR #14 remains an independent workstream.

Next: review exact PR head and CI, then M1 target/schema/recipient/source verification and a scoped read adapter. M2 E2E/shadow evidence and M3 authorized release remain NOT STARTED. Preserve existing single-writer ownership and schedules. Rollback only this additive candidate; never delete customer/receipt/evidence data.

Historical entries below are preserved byte-for-byte; this entry does not re-certify their live status.

---


## 2026-10-01 — PR19 delayed-action refresh and authorized local browser verification

PR #19 original head: `1d2520d2286423269adc50104185fe3cbe10bc04`. Founder authorized a local browser using synthetic data and an independent read-only reviewer agent. Real CRM configuration access and source-to-recipient acceptance remain unverified.

Found a remaining P1: a save started under company A can finish after selecting B and invoke the old A loader; its new request ID overwrites B with A's report. Reproduced in real React browser: selected B showed A/11. The candidate uses a mounted latest-loader ref for four action completion paths, clears it on cleanup, and preserves B/22 after delayed completion. Backend business logic, permissions and configuration unchanged by this follow-up.

Validation: verified original source blob hashes; existing suite 41/41 PASS; 12 new lifecycle tests against original = 4 PASS / 8 FAIL; candidate integrated suite = 53/53 PASS. Independent agent reviewed the full functional delta against base 0db11ce1adb0fb89fc87529036e495a62d58fce7, reran 41 existing + 12 new tests successfully and approved the candidate (UI blob `565f8990b3ef599f551398ec0e342239529c7d13`). CI includes the new test on Node 18/22; check the published head before relying on CI.

Supported-browser evidence: actual UI component with mock-only API at loopback and CSP connect-src none; delayed save/filter switch, unavailable CRM/clear old data, recovery and empty state; screenshots at requested 1440/768/375 widths. No page horizontal overflow observed, table scrolls inside its container. Independent agent inspected saved browser evidence, did not rerun browser. Not whole-app build/auth, visual-baseline comparison, comprehensive accessibility or real CRM E2E.

Review detail: PR19_BROWSER_INDEPENDENT_REVIEW_20261001.md. Operational gate stays HOLD pending allowed environment/sample and Facebook → canonical CRM → active Sales Admin/report reconciliation. No main merge, production deploy, message/ad/budget/customer/config changes.

Rollback: revert only the follow-up commit; preserve all data, prior report corrections and historical handoff entries.

---

## 2026-10-01 - PR19 UI review follow-up (not production acceptance)

Found and fixed campaign row-key collisions and stale async responses after filter changes. New snapshot reset and request-generation checks preserve the current selected scope. Existing backend report corrections unchanged. 10 new tests fail 9/10 on the old PR source; combined suite now 41/41 PASS. Actual JSX transform PASS, no warnings. CI expanded to cover both tests; result must be read on new head.

Browser runner attempt was safety-blocked and not retried; no actual browser/mobile/full-build/CRM E2E PASS. Prior CRM configuration access block remains; no alternative access attempted. Same-assistant review, not independent approval. No main merge, deployment, ads/budget or customer/recipient changes. Next gates: authorized browser verification and Facebook -> canonical CRM -> active Sales Admin acceptance. Details: PR19_UI_REVIEW_20261001.md.

---

## 2026-10-01 — Marketing first: report correctness, Issue #18

Founder requested focusing on completion of marketing, not broader AI architecture. Priority remains real source -> valid CRM intake -> active Sales Admin -> accurate reporting. No new agent, scheduler or parallel dashboard in this increment.

Branch: codex/marketing-report-correctness-20261001. Base: bb6f1f26a66905de7701947c0b03c82c41343061. Correct existing ad-analytics read routes: one lead_id per group; distinguish campaigns by ID before manual labels; CRM read failure returns safe UNKNOWN/503 instead of a successful zero. UI clears earlier data on read error and explicitly shows unavailable, not an empty-result conclusion. Existing auth/company and business lifecycle rules unchanged.

Verification: same 31 tests on pinned baseline = 9 PASS / 22 FAIL; candidate = 31 PASS / 0 FAIL (Node 24.19.0). Backend/test syntax and git diff check pass. VM executes actual route handlers with synthetic DB/auth dependencies and the actual UI load callback; not full auth, browser, React render, independent review, whole-app build or live E2E. GitHub CI must be read back on exact published head. JSX parser unavailable in sandbox; no dependency installed.

Files: backend/src/routes/adAnalytics.js; frontend/src/pages/AdAnalyticsPage.jsx; backend/tests/adAnalytics.correctness.test.js; .github/workflows/marketing-report-correctness.yml; handoff/evidence. No main merge, deploy, DB/config change, ad/budget change, or live customer action. A live CRM configuration read was blocked and was not retried through another path. This patch does not complete source/recipient/E2E verification or replace PR #14/#16.

Rollback: revert only this commit; preserve all customer data and prior handoff entries. Next: exact-head review/CI, then authorized release/smoke and source-to-recipient E2E. No live activation is implied by passing synthetic tests.

# Candidate worklog

## 2026-10-05 — Bản vá quyền anon/authenticated, chỉ tạo code

- AI: Codex. Phạm vi theo `BRIEF_SECURITY.md`; không truy cập DB/Supabase, không chạy migration hay smoke, không push.
- File: `database/audit/anon_exposure_audit.sql`, `database/audit/anon_exposure_snapshot.sql`, `database/700_revoke_anon_public_access.sql`, `database/700_revoke_anon_public_access_rollback.sql`, `backend/tests/anon-exposure-smoke.js`, `backend/package.json`, `docs/ops/SECURITY_ANON_REVOKE.md`, `docs/ai-handoff/CURRENT.md`, `docs/ai-handoff/WORKLOG.md`.
- Kiểm tra tĩnh: `node --check backend/tests/anon-exposure-smoke.js`; `git diff --check`; rà RPC/backend và web/mobile bằng `rg`. Chưa xác minh cú pháp SQL bằng PostgreSQL, chưa kiểm tra hiệu quả trên staging. `git add` bị chặn khi tạo `.git/worktrees/Quanlycongviec-secfix/index.lock` ngoài writable root; chưa commit. Hoàn tác code bằng bỏ diff trong worktree; hoàn tác database bằng script rollback dùng snapshot cùng database.

## 2026-09-29 — VPT Messenger durable intake, local candidate only

Issue #7: https://github.com/backen-pixel/Quanlycongviec/issues/7. Base: `413e8f575b5b611b25a50980564d754b7bfcf211`. Founder requested finishing the Messenger A2/B trial. No remote commit, PR, migration, live test or deployment performed by this workstream.

Opt-in Page 409741855550833: persist Messenger event before ACK, retry with DB lease/token; extract referral even without message; exact ad→campaign mapping; reuse existing lead_attribution; delayed Lead linking. Auto/manual/legacy scan share atomic contact→Lead RPC for this Page and CRM Lead type. Unique nullable crm_leads.facebook_contact_id and contact row lock guard retry/concurrent creation. Existing customer/phone reuse also uses the same RPC. Other Pages remain unchanged unless explicitly opted in.

Files: two sanitized runtime schema/index/ACL fixtures; routes/facebook.js, routes/crm/routes/leadLifecycle.js, server.js (legacy scan identity), helpers/facebookAtomicLead.js, helpers/facebookMessengerReceipt.js, migrations639–641, five test files, config example and review notes. Applied migrations are unchanged. 636–638 reserved from the older unmerged package, unavailable locally (Library helper retried twice, HTTP502).

Tests: Node handler VM + helper tests and real isolated PGlite SQL; no application .env, full server import, production DB or message sends. See VPT_MESSENGER_REVIEW_20260929.md for exact commands and gates. Source-backed baseline failed ACK/retry regression tests; candidate passes 40/40 local tests. SQL tests are one PGlite connection, not multi-session PostgreSQL staging.

Runtime schema/FKs/unique indexes are now compared and represented by schema-only test fixtures. Existing attribution ACL is broad with RLS=false; no global ACL is changed. New raw/ref/source/message/phone/PSID data stays only in protected receipts, attribution gets numeric IDs and event keys. Unresolved before activation: multi-session Postgres CI + controlled staging fault/restart tests; deploy SHA/API health; Meta messaging_referrals subscription; real referral→phone→Lead→campaign E2E. Runtime historical 7 ad rows sharing one timestamp do not prove current writer. No automation for budget stop/resume or ad activation in this patch.

Rollback: keep ads paused; drain pending receipts before disabling FB_DURABLE_MESSENGER_PAGE_IDS and reverting backend. Keep evidence and additive identity columns. Never delete historical leads/contacts/attribution to roll back. Notifications/tasks after commit are not guaranteed exactly once; customer creation remains outside Lead transaction and can leave an unused customer during a race. Cross-contact shared Lead retains original first-touch attribution and this contact's pending evidence.


# Nhật ký công việc AI

## 2026-10-06 12:35 — Nút +1 +2 +3 ngày trên deadline SX

- Hộp deadline thẻ có «Dời cả lịch» và nút +1/+2/+3 trên ngày lắp cùng từng mốc còn lại. Một lần bấm dời cả kế hoạch và hạn thẻ.
- Nút + trên riêng deadline thẻ chỉ dời hạn thẻ, không đổi ngày lắp.

## 2026-10-06 12:30 — Deadline thẻ SX hiện mốc còn lại

- Nút deadline trên Kanban SX trước đây chỉ sửa hạn thẻ, không đồng bộ ngày lắp.
- Hộp thoại nay liệt kê deadline thẻ, ngày lắp và mốc kế hoạch còn lại; sửa mốc hoặc ngày lắp thì dời cả lịch và tính lại hạn thẻ.

## 2026-10-05 20:10 — Nút ⋯ xóa bình luận

- Bình luận của Lê Minh Tiển không có chỗ xóa vì nút chỉ hiện khi rê chuột và chỉ với đúng người viết.
- Gắn nút ⋯ trên bong bóng: tác giả Sửa/Xóa, admin chỉ Xóa. Sửa API xóa lead (truyền `req.user`) và cho admin xóa bình luận dự án.
- Đã mở deal LEAD-2026-1389, bấm ⋯ trên bình luận file SKP, menu hiện «Xóa». Chưa xóa dữ liệu thật.

## 2026-10-05 16:00 — NV Metalla không mở được dự án đặt sang xưởng Hucabi

- AI: Cursor. Toại (admin Metalla) mở TB-2026-909 được nhưng TB-2026-964 (Hucabi, đặt từ 909) bị 403.
- Nguyên nhân: `getAccountingClientProjectIdsAtWorkshop` gửi `.in('project_id', 641 UUID)` → PostgREST `Bad Request` (URL > ~25KB) → trả `[]` → mọi dự án Hucabi đều bị từ chối với NV công ty khác.
- Sửa: phân trang dự án + tra deal theo lô bằng `supabaseFetchAll`. Kiểm tra local: 81 dự án khớp, có TB-2026-964.
- Còn tồn: `getVptRelatedProjectIdsAtWorkshop` cùng kiểu lỗi, chưa sửa.
- File: `backend/src/helpers/accountingScope.js`.

## 2026-10-05 15:00 — Menu file Drive không đè thẻ

- AI: Cursor. Menu ⋯ nằm trong thẻ `overflow-hidden` nên Xem trước / Xóa đè lên ảnh và bị cắt.
- Đưa menu ra lớp nổi trên trang, căn theo nút ⋯, lật lên trên nếu sát đáy màn hình.
- File: `DriveFileViews.jsx`.

## 2026-10-05 14:35 — Xóa file Drive có xác nhận và báo thành công

- AI: Cursor. Menu xóa file trên hồ sơ đã hỏi xác nhận nhưng không báo khi xong.
- Giữ hộp xác nhận (kèm tên file) và thêm toast «Đã xóa». Trang Drive báo tương tự khi đưa vào thùng rác hoặc xóa vĩnh viễn.
- File: `DriveAttachments.jsx`, `DrivePage.jsx`.

## 2026-10-05 10:40 — Tải file bình luận sống qua đổi trang

- AI: Cursor. Rời trang làm mất thanh tiến trình trong ô bình luận nên tưởng như tải bị dừng. Request axios không bị hủy khi unmount.
- Gắn tiến trình vào bảng góc dưới phải của Drive: tốc độ và thời gian còn lại. File đính kèm thường và file lớn đều hiện ở đó.
- File: `FileUpload.jsx`, `drive.js`, `oversizedDriveUpload.js`.

## 2026-10-05 10:30 — Thanh tải file trong bình luận

- AI: Cursor. Tiến trình đính kèm nằm trong cột kẹp giấy (~150px) nên tên file và chữ trạng thái bị gãy trong ô nhập.
- Đưa thanh tiến trình ra hàng riêng, full width, phía trên ô soạn. File lớn dừng ở 99% vì server đang đẩy lên Google Drive sau khi trình duyệt gửi xong.
- File: `CommentsPanels.jsx`, `FileUpload.jsx`, `UploadProgressBubble.jsx`, `oversizedDriveUpload.js`, `uploadProgressEta.js`.

## 2026-10-05 09:20 — Hạn HCB bám cột, quá hạn sau 17:30

- AI: Cursor. Đổi ngày lắp HCB vẫn quá hạn vì hạn thẻ lấy nhóm việc còn mở sớm nhất, không phải cột đang đứng.
- Hạn thẻ và bảng nhiệm vụ SX tính lại từ cột Kanban, mốc 17:30. Cùng ngày chỉ quá hạn sau giờ đó.
- File: `sxCardPlanDeadline.js`, `workTasks.js`, `ProjectTasksOverviewPage.jsx`. Đã quét lại hạn thẻ HCB.

## 2026-10-05 08:52 — File trên 50MB lưu Drive, link vào bình luận

- AI: Cursor. File đính kèm lớn hơn 50MB không còn bị chặn: tải lên Google Drive, tạo link xem, gắn vào bình luận lead/dự án. Chat lead cũng đăng bình luận kèm link.
- File: `oversizedDriveUpload.js`, `CommentsPanels.jsx`, `LeadChatTabs.jsx`, `drive.js`, `helpersBundle.js`.

## 2026-10-02 16:51 — Gỡ lọc dashboard Hào, trả về xem đủ dự án xưởng

- AI: Cursor. Đã bỏ phạm vi «chỉ dự án có việc của Hào» trên dashboard SX.
- File: `dealParticipantProduction.js`. Xóa `tests/hao-task-project-scope.js`.
- `hao@metalla.com` thấy lại mọi dự án công ty, theo phân loại đang chọn.

## 2026-10-02 15:15 — Hàng nhiệm vụ hiện tên nhân viên được gán

- AI: Cursor. Dòng nhiệm vụ thu gọn (ví dụ Phôi) chỉ hiện «Chi tiết», không hiện tên người nhận.
- File: `frontend/src/components/CRMTasksTab.jsx`.
- Tên nhân viên hiện luôn trên hàng, không cần mở rộng. Đã xem TB-2026-963: Phôi và Cánh hiện «Thuận».

## 2026-10-02 13:56 — Hiện BC theo tổ chức cho quản trị HST

- AI: Cursor. Sidebar CRM ẩn mục `executiveOnly` với role `ecosystem_admin`.
- File: `adminRole.js`, `Sidebar.jsx`, `RequireRole.jsx`, `helpersBundle.js`.
- Menu và quyền vào trang dùng chung `isCrmExecutive`. API org-overview coi quản trị HST là báo cáo đầy đủ.

## 2026-10-02 11:55 — Bộ lọc Không gian chung giống Giao việc

- AI: Cursor. Tab Không gian chung trước đó chỉ lọc trạng thái và ưu tiên.
- File: `CRMAssignmentsPage.jsx`, `crmAssignments.js`, `sharedWorkspaceInbox.js`.
- Admin chọn công ty, phòng ban hoặc nhân viên thì tải việc của đúng phạm vi đó.

## 2026-10-02 11:50 — Lọc phân loại xưởng trên Giao việc Sản xuất

- AI: Cursor. Giao việc Sản xuất dùng cùng ô phân loại với dashboard xưởng (Chưa phân loại / HCB · Tủ bếp / Cánh kính / Cửa).
- File: `CRMAssignmentsPage.jsx`, `crmAssignments.js`, `sharedWorkspaceInbox.js`.
- Thử `/sx/assignments`: Tủ bếp 11 việc, Cánh kính 0 việc. API list, stats và Không gian chung trả 200. Đã trả bộ lọc về Tủ bếp.

## 2026-10-02 11:10 — Không chép nhiệm vụ mẫu xưởng sang Không gian chung

- AI: Cursor. Lưu hoặc áp bộ mẫu `sx_`/`vc_` từng tạo `crm_assignments`. Nay bỏ qua nhiệm vụ mẫu; phát sinh (`sx_shared`, `customer_request`) vẫn tạo giao việc.
- File: `workshopPipelineTask.js`, `crmTaskAssignmentSync.js`, `crmSequentialAssignment.js`, `sharedWorkspaceInbox.js`, `tests/workshop-template-no-assignment.js`.
- Thử: unit test ok. Gọi sync thật trên «Chốt công nợ» (`sx_pl_6723a412`) — bỏ qua, số giao việc trước/sau = 0. Việc mở kế tiếp của deal là «Thông tin khác hàng», không phải Phôi.

## 2026-10-02 09:55 — Sửa ngày lắp thì hạn thẻ SX chạy theo

- AI: Cursor. Tính lại hạn thẻ bị lỗi vì đọc cột `install_occurrence_dates` không có trên `projects`, nên sửa ngày lắp mà `sx_kanban_deadline_at` đứng yên.
- File: `projectDeliveryDates.js`, `sxCardPlanDeadline.js`, `projects.js`.
- Thử TB-2026-978: ngày lắp 07/10 → 14/10, hạn 03/10 → 08/10, rồi trả dữ liệu cũ.

## 2026-10-01 15:50 — Hướng sửa 4 việc module SX

- AI: Cursor. Đơn phát sinh, khóa giai đoạn khi kéo cột, bàn giao VC vào đúng pipeline, hạn thẻ theo lịch 7 ngày.
- SQL chưa chạy: `database/648_sx_phat_sinh_order.sql`.

## 2026-10-01 14:55 — Sửa dashboard SX vỡ vì filterBusy

- AI: Cursor. `/sx/dashboard` báo Cannot access filterBusy before initialization vì biến được dùng trước khi khai báo.
- File: `ProductionDashboard.jsx`.

## 2026-10-01 14:50 — Tích và kéo nhiệm vụ trên Giao việc SX

- AI: Cursor. Thẻ nhiệm vụ của dự án chỉ hiện vòng tròn, không tích và không kéo được. Nay quản trị tích hoặc kéo để đổi giai đoạn.
- File: `CRMAssignmentsPage.jsx`, `assignmentManageAccess.js`.

## 2026-10-01 14:45 — Mắt tìm Giao việc mở chi tiết đúng module

- AI: Cursor. Nút mắt trong ô tìm luôn nhảy sang deal CRM. Nay theo module đang đứng: SX mở dự án sản xuất, VC mở dự án lắp đặt, CRM vẫn mở deal.
- File: `CRMAssignmentsPage.jsx`.

## 2026-10-01 14:40 — Hạn lịch 7 ngày và tiến độ việc nhỏ trên quản lý nhiệm vụ SX

- AI: Cursor. Cột Quá hạn trống vì không lấy lịch lắp. Hạn thẻ nay theo lịch 7 ngày lùi từ ngày lắp. Tiến độ thẻ cộng nhiệm vụ SX cùng tên đã xong; danh mục chỉ hết khi việc nhỏ bên trong xong.
- File: `projectOverviewDeadline.js`, `workTasks.js`.

## 2026-10-01 14:30 — Quá hạn quản lý nhiệm vụ SX theo hạn của việc

- AI: Cursor. Cột Quá hạn đếm danh mục theo hạn giao hàng và hạn việc xưởng, nên lệch với nhiệm vụ và giao việc. Chỉ còn tính hạn riêng của nhiệm vụ và giao việc. Đã xem trang: Quá hạn 0, Chưa có hạn 807.
- File: `projectOverviewDeadline.js`.

## 2026-10-01 14:08 — Số ghi chú và file trên thẻ Giao việc

- AI: Cursor. Thẻ Kanban có nút ghi chú nhưng không cho biết đã có bao nhiêu file hay ghi chú. Hiện số ngay trên nút khi có.
- File: `CRMAssignmentsPage.jsx`, `crmTaskAssignmentSync.js`.

## 2026-10-01 14:05 — Giao việc SX không lọc thì hiện mọi việc

- AI: Cursor. Trang Giao việc Sản xuất coi quản trị hệ sinh thái như nhân viên thường nên chỉ lấy việc của đúng tài khoản đó và ra 0. Giờ không chọn bộ lọc thì hiện toàn bộ giao việc sản xuất.
- File: `CRMAssignmentsPage.jsx`.

## 2026-10-01 13:55 — Tải nhiệm vụ nhỏ song song khi mở dự án

- AI: Cursor. Cột nhỏ trên chi tiết dự án chờ hết spinner dự án, rồi tải lại dự án, rồi mới lấy nhiệm vụ. Giờ tab Công việc gọi tasks ngay khi có dự án, cùng lúc với lead.
- File: `ProductionDetail.jsx`, `CRMTasksTab.jsx`, `crmTasks.js`, `production.js` (`task-bootstrap`).

## 2026-10-01 13:42 — Ghi chú và file trên thẻ Giao việc

- AI: Cursor. Thẻ Kanban Giao việc của nhiệm vụ xưởng không có chỗ nộp ghi chú và file như chi tiết nhiệm vụ. Thêm nút mở cùng khối ghi chú và đính kèm.
- File: `CRMAssignmentsPage.jsx`, `WorkTaskExtrasPanel.jsx`, `crmAssignments.js`.

## 2026-10-01 13:32 — Thông tin dự án dưới thống kê Giao việc SX

- AI: Cursor. Lọc Giao việc theo dự án chưa cho biết đó là dự án nào ngoài mã trên dải trên. Thêm khối tóm tắt ngay dưới «Số việc theo nhân viên».
- File: `CRMAssignmentsPage.jsx`, `crmAssignments.js`.

## 2026-10-01 13:20 — Giao việc SX theo dự án chỉ tính nhiệm vụ xưởng

- AI: Cursor. Board `/sx/assignments?project_id=` đang gộp cả nhiệm vụ deal CRM. Giữ lọc module sản xuất và chỉ bổ sung nhiệm vụ pipeline `sx_`.
- File: `CRMAssignmentsPage.jsx`, `crmAssignments.js`.

## 2026-10-01 13:15 — Bấm thẻ quản lý NV xưởng vào dự án

- AI: Cursor. Thẻ Kanban `/sx/project-tasks` trước đó mở Giao việc. Bấm thân thẻ hoặc người phụ trách giờ mở chi tiết dự án. Nút Công việc giữ lối vào Giao việc đã lọc dự án.
- File: `ProjectTasksOverviewPage.jsx`.

## 2026-10-01 12:00 — Gỡ Trương Trọng Thành khỏi đội dự án

- AI: Cursor. Bỏ khỏi danh sách tự gắn HCB. Xóa đội SX, thành viên deal, NV mặc định, và các ô phụ trách đang trỏ user này trên primary và backup. Không xóa tài khoản.
- File: `dealParticipantProduction.js`, `database/647_remove_truong_trong_thanh_assignments.sql`.

## 2026-10-01 11:53 — Nút Quá hạn trên thẻ VC/LĐ

- AI: Cursor. Thẻ quá hạn lắp chỉ đổi màu chip. Thêm nút đỏ «Quá hạn» kèm ngày trên thẻ, và chữ «Quá hạn» trên nút đếm ở thanh công cụ.
- File: `LogisticsDashboard.jsx`.

## 2026-10-01 11:48 — Thẻ Kanban VC/LĐ hiện mốc thời gian

- AI: Cursor. Thẻ vận chuyển chỉ có tuổi dự án tương đối, trong khi thẻ sản xuất đã hiện ngày tạo, ngày lắp và hạn xưởng. Thêm cùng các mốc đó lên thẻ VC/LĐ, kèm ngày lấy hàng và tô vàng khi ngày lắp SX lệch ngày lắp CRM/LĐ.
- File: `LogisticsDashboard.jsx`, `logistics.js`.

## 2026-10-01 11:40 — Bảng ngày lắp / ngày lấy hàng trong Sự kiện

- AI: Cursor. Lịch lắp và lấy hàng của deal CRM với dự án sản xuất / lắp đặt nằm rải trên từng màn. Thêm bảng kiểu Excel trong Sự kiện, một dòng một dự án, tô vàng khi ngày lắp SX lệch ngày lắp CRM/LĐ.
- File: `installScheduleSheet.js`, `events.js`, `EventsInstallSchedulePage.jsx`, `EventsFeedPage.jsx`, `App.jsx`.

## 2026-10-01 11:20 — Sửa ngày trong chi tiết thì hạn thẻ Kanban đổi theo

- AI: Cursor. Ngày lắp SX từng ghi `production_deadline` bằng chính ngày lắp, và hạn thẻ không tính lại khi còn `install_date` / lịch nhiều buổi cũ hoặc lý do deadline tay. Giờ sửa một ô ngày lắp cập nhật ô kia, hoàn thiện = lắp − 2, và hạn thẻ theo nhóm cột từ ngày vừa sửa.
- File: `ProductionDetail.jsx`, `projects.js`, `projectDeliveryDates.js`, `sxInstallPlanKanbanDeadline.js`.

## 2026-10-01 11:15 — Gán NV cột lớn cho Tủ bếp và Cánh kính HCB

- AI: Cursor. Gán cùng người với Cửa: Tiếp nhận và Kế hoạch = Sang Thiết Kế VPT 1, Duyệt = Nguyễn Nhật, Gia công = Nguyễn Minh Nhựt, Hoàn thiện và Đóng gói = Hòa Bảo. Phân loại Công nợ không có cột pipeline.

## 2026-10-01 11:10 — Ô phụ trách cột lớn hiện đúng người đã gán

- AI: Cursor. Tủ bếp chưa gán NV trên từng cột; phụ trách chính của phân loại là Sang Thiết Kế (`company_id` null) nên không có trong danh sách NV HCB, ô chọn kẹt «— NV phụ trách —». API giờ trả thêm user đã gán dù khác công ty. Cột chưa có NV riêng thì hiện phụ trách chính của phân loại.
- File: `frontend/src/pages/ProductionPipelineSettingsPage.jsx`, `backend/src/routes/production.js`.

## 2026-10-01 11:00 — Hiện người phụ trách trên cột lớn setup pipeline

- AI: Cursor. Thẻ cột chính hiện tên NV đã gán (`default_staff` của các cột nhỏ). Ô chọn thêm người đó nếu họ không có trong danh sách NV phân loại, nên không còn kẹt ở «— NV phụ trách —».
- File: `frontend/src/pages/ProductionPipelineSettingsPage.jsx`. Đã xem trên HCB / Cửa: Tiếp nhận và Kế hoạch = Sang Thiết Kế VPT 1, Duyệt = Nguyễn Nhật, Gia công = Nguyễn Minh Nhựt, Hoàn thiện và Đóng gói = Hòa Bảo.

## 2026-10-01 10:40 — Xóa bản trùng NextGo ở công ty cũ, không chép sang HST NextGo

- AI: Cursor. Xóa thêm 230 lead công ty cũ trùng mã hoặc trùng tiêu đề với HST NextGo. Không insert lead/dự án mới vào HST NextGo. Giữ 8 lead Zalo không có bản trên NextGo. HST NextGo vẫn 890 lead, 2.442 hội thoại, 19.469 tin.
- Script: `backend/scripts/purge-nextgo-dup-from-default.js`.

## 2026-10-01 10:30 — Gỡ lead Facebook NextGo khỏi HST mặc định

- AI: Cursor. Trên DB primary, xóa 365 lead nguồn Facebook còn ở công ty NextGo cũ `87479a83` (HST mặc định). Hội thoại, tin nhắn, page và 890 lead HST NextGo giữ nguyên. Nguồn CRM `[FB:1102202982968909]` của công ty cũ đã xóa. Deal `DEAL-2026-998` không có bản trên HST NextGo nên chỉ còn bị gỡ khỏi HST mặc định.
- Script: `backend/scripts/purge-nextgo-fb-from-default.js`. Biên bản: `backend/uploads/_purge_nextgo_fb_from_default_primary_2026-10-01T03-29-42-615Z.json`.
- Backup chưa chạy: công ty HST NextGo trên backup có 0 lead, 524 lead FB vẫn nằm ở công ty cũ. Xóa bên đó sẽ mất bản duy nhất.

## 2026-10-01 09:50 — Nút tích Chuyển công nợ trên setup pipeline xưởng

- AI: Cursor. Tab Cột nhỏ: nút «Chuyển công nợ» gán `board_tab` sang tab Công nợ hoặc trả về Sản xuất. Form sửa cột có ô tích tương ứng.
- File: `frontend/src/pages/ProductionPipelineSettingsPage.jsx`.
- Test: trình duyệt `/sx/pipeline-settings` HCB Tủ bếp, tab Cột nhỏ — nút hiện cạnh Tắt hạn. Form sửa «Tiếp nhận đơn hàng về SX» có checkbox «Chuyển công nợ», đã Hủy không lưu. Cột bộ chung VPT bấm nút báo không có quyền sửa cột toàn hệ thống (đúng quyền cũ).

## 2026-10-01 09:40 — Sửa build: thêm hook useDefaultCompanyOnce

- AI: Cursor. Render fail vì `ProductionDashboard.jsx` import `useDefaultCompanyOnce` nhưng file chưa được commit.
- File: `frontend/src/hooks/useDefaultCompanyOnce.js`.

## 2026-10-01 09:35 — SX: giữ lọc phân loại, Deadline chỉ theo hạn thẻ

- AI: Cursor. `/sx/dashboard` bỏ mục «Tất cả» / «Tất cả loại»; không chọn thì đứng ở loại đầu của xưởng. «Chưa phân loại» vẫn chọn được. Cột Deadline và KPI quá hạn chỉ tính `sx_kanban_deadline_at`, không lấy ngày hoàn thiện / giao / hạn chung.
- File: `ProductionDashboard.jsx`, `WorkshopDashboardFilterPanel.jsx`, `ProductionViews.jsx`, `sxPipelineRevenue.js`, `useWorkshopStaffFilter.js`, `LogisticsDashboard.jsx`, `sxKanbanSummary.js`, `production.js`, `projectDeadlineExport.js`, `tests/sx-deadline-bucket.test.js`.
- Test: trình duyệt `/sx/dashboard` — select còn «Chưa phân loại» và loại của xưởng, không còn «Tất cả». `node tests/sx-deadline-bucket.test.js` in `sx-deadline-bucket: OK`.

## 2026-10-01 08:45 — SX dashboard bỏ dropdown Phân loại: Tất cả

- AI: Cursor. Gỡ select phân loại trên thanh đầu `/sx/dashboard`. KPI và badge cột vẫn theo bộ lọc xưởng; phân loại cụ thể còn trong panel bộ lọc.
- File: `frontend/src/pages/ProductionDashboard.jsx`.
- Test: HMR Vite đã nhận file. Trình duyệt MCP không có phiên đăng nhập nên chưa bấm được board đã login. Ghi chú này bị thay bởi mục 09:35: bộ lọc phân loại được giữ, chỉ bỏ nút Tất cả.

## 2026-09-28 10:02 — Chat không hiện ghi chú panel

- AI: Cursor. Comment `//` trong JSX bị in ra khung chat. Đổi thành `{/* */}`.
- File: `frontend/src/components/MessengerConversationDetailPanel.jsx`.
- Test: đối chiếu diff, chưa mở hội thoại trên trình duyệt.

## 2026-09-28 09:35 — Đặt xưởng khác chỉ cần ngày lấy

- AI: Cursor. Đặt xưởng khác và kế hoạch CRM sang sản xuất chỉ bắt ngày lấy hàng, ngày lắp không bắt buộc.
- File: `SxMultiTargetPicker.jsx`, `ProductionDetail.jsx`, `LeadDetail.jsx`, `CRMDashboard.jsx`, `DealProductionProjectsPanel.jsx`.
- Test: đối chiếu mọi form kế hoạch đều truyền `schedule="pickup"`. Chưa bấm tạo dự án thật.

## 2026-09-26 — Loại HTTP seed mật khẩu, bản sửa local riêng

Founder đã cho phép sửa local và kiểm thử cô lập; chưa cho phép push GitHub hoặc deploy. Nhánh `codex/remove-public-password-seed-20260926` bắt đầu từ SHA Production đã đối chiếu `a458a192e83a4d656561fc87b56f926c16c6140c`, tách khỏi nhánh draft Messenger. Gỡ cả hai handler reset mật khẩu mẫu không có auth trong `backend/src/server.js` và `backend/src/routes/auth.js`; gỡ dòng inventory API không còn hợp lệ. Không thêm seed command, không sửa DB/migration, tài khoản thật hoặc cấu hình Render.

Trạng thái: **local candidate PASS**, 7/7 test và lượt chạy reviewer độc lập PASS; đối chứng baseline phát hiện đúng 2 route trước khi gọi handler. Chưa công bố, chưa Production. Đăng nhập và đổi mật khẩu hợp lệ giữ nguyên code. Chi tiết, lệnh test và giới hạn trong `PASSWORD_SEED_REMOVAL_20260926.md`.

Giới hạn: không require/chạy toàn bộ server hoặc đọc application `.env` vì startup có tác động ra ngoài. Kiểm thử dùng router/handler thực với dependency mock và dữ liệu giả. Chưa xác minh trên Production các tài khoản mẫu còn tồn tại hay có hành vi khai thác.

Hoàn tác local bằng đảo commit này nếu cần, nhưng đưa route cũ trở lại sẽ mở lại lỗ hổng; không dùng việc hoàn tác như biện pháp xử lý bảo mật. Không có thay đổi dữ liệu để rollback. Bản production vẫn cần quy trình staging/review/phê duyệt triển khai riêng.

## 2026-09-25 16:20 — Deadline SX: Quá hạn theo tắt hạn

- AI: Cursor. Thẻ ở cột tắt hạn vẫn bị đếm Quá hạn vì bucket tin hạn giao và stamp server. KPI và tiêu đề cột lấy tổng đó nên lệch thẻ đang hiện.
- File: `sxKanbanSummary.js`, `sxPipelineRevenue.js`, `moduleDeadlinePolicy.js`, `ProductionViews.jsx`, `ProductionDashboard.jsx`.
- Test: `resolveSxDeadlineBucketKey` — TB-2026-493 (Đã giao) = none; TB-2026-920 và TB-2026-934 (hạn thẻ 25/09 17:30) = today. Chưa reload bảng Deadline trên trình duyệt.

## 2026-09-25 13:50 — Đặt xưởng khác: admin Metalla thấy HCB

- AI: Cursor. Modal «Đặt xưởng khác» của admin xưởng bị trống vì danh sách công ty SX khóa đúng một xưởng rồi bị loại khỏi form. Thêm `include_peer_workshops=1` chỉ cho modal này.
- File: `backend/src/routes/companies.js`, `frontend/src/pages/ProductionDetail.jsx`.
- Test: `node --check` companies.js. Chưa bấm đặt đơn thật.

## 2026-09-25 09:36 — Bình luận: dòng chuyển trạng thái nổi bật + thông báo

- AI: Cursor. Lệnh `/` chuyển cột ghi dòng tím trong khung Bình luận và thông báo «Đã chuyển trạng thái». Work Unified có hộp hướng dẫn ở đầu tab Bình luận.
- File: `commentProgressSlash.js`, `CommentsPanels.jsx`, `WorkUnifiedProjectDetailPage.jsx`, `leadComments.js`, `dealCommentNotifications.js`.
- Test: tab Bình luận dự án TB-2026-493 hiện hộp tím và ô nhập «Gõ / để chuyển trạng thái». Chưa bấm chuyển cột trên deal thật.

## 2026-09-25 00:35 — Tắt deadline khi chuyển tới cột mốc

- AI: Cursor. CRM cột Hoàn thành, SX cột tích VC/LĐ, VC/LĐ cột Xong: tự tắt deadline module đó. Bình luận và lịch sử ghi «Đã tắt deadline do chuyển trạng thái».
- File: `backend/src/helpers/stageMoveDeadlineOff.js`, `production.js`, `logistics.js`, `leadLifecycle.js`.
- Test: `node --check` các file trên. Chưa kéo thẻ trên deal thật.

## 2026-09-25 00:20 — Lệnh / hoàn thành theo module, đã giao/đã lắp dùng chung

- AI: Cursor. Cột Hoàn thành CRM/SX/VC chỉ người đúng khối mới thấy. `/Đã giao` và `/Đã lắp` ai cũng có, cả hai chuyển VC/LĐ sang cột lắp (Lắp đặt / Đã lắp / Lắp xong).
- File: `frontend/src/lib/commentProgressSlash.js`, `frontend/src/pages/ProductionDetail.jsx`.
- Test: menu `/` trên deal Tố Nga hiện nhóm Dùng chung «Đã giao», «Đã lắp». Deal chưa có dự án nên chưa bấm chuyển cột.

## 2026-09-24 23:30 — Bình luận: / chuyển tiến độ

- AI: Cursor. Gõ `/` trong bình luận hiện cột pipeline. `/Lắp xong`, `/Đã giao` (có dấu cách, không dấu) chuyển cột SX hoặc VC/LĐ và ghi một dòng bình luận.
- File: `commentProgressSlash.js`, `crmCommentMentions.js`, `crmCommentMentionUi.jsx`, `CommentsPanels.jsx`, `WorkUnifiedProjectDetailPage.jsx`, `ProductionDetail.jsx`, `LeadDetail.jsx`.

## 2026-09-24 14:20 — Hết cảnh báo migration 605 khi mở dự án SX đã xong

- AI: Cursor. PUT trạng thái cột Sản xuất không còn gửi/đọc `logistics_stage_id`. Đồng bộ ngầm «cột xong» không bật `alert`. Thiếu cột 635 báo đúng migration 635.
- File: `backend/src/routes/production.js`, `frontend/src/pages/ProductionDetail.jsx`, `frontend/src/components/CRMTasksTab.jsx`.
- Test: `node --check backend/src/routes/production.js`. Chưa deploy lên Render.

## 2026-09-24 13:10 — Nhiệm vụ và tiến độ dùng chung một tích

- AI: Cursor. Tích cột trên tab Công việc và vòng tròn PipelineStepper đọc/ghi cùng `project_substage_status`. Cột đã đi qua hiện tích cả hai bên. VC/LĐ có danh sách cột lớn và nút hoàn thành cột. SQL 635 thêm `logistics_stage_id` — chưa chạy.
- File: `cotTienDo.js`, `PipelineStepper.jsx`, `CRMTasksTab.jsx`, `ProductionDetail.jsx`, `production.js`, `database/635_vc_substage_status.sql`.

## 2026-09-22 15:25 — VC/LĐ: cột lớn / cột nhỏ + tiến trình như SX

- AI: Cursor. `logistics_pipeline_stages.group_key` + `group_sort` (SQL 632). Tab Cột chính trên `/vc/pipeline-settings`; Gộp cột trên `/vc/dashboard`; stepper chi tiết VC gom theo cột lớn. Không seed group_key live.
- File: `database/632_logistics_pipeline_group_key.sql`, `logistics.js`, `sxGopCot.js`, `LogisticsPipelineSettingsPage.jsx`, `LogisticsDashboard.jsx`, `ProductionDetail.jsx`, `tests/vc-pipeline-group.test.js`.
- Test: `node tests/vc-pipeline-group.test.js`.

## 2026-09-22 14:45 — VC/LĐ: KPI theo cột + Tắt hạn + bộ mẫu ít bấm

- AI: Cursor. Pipeline `/vc/pipeline-settings` thêm tick Đang VC / Đang LĐ / BH / Xong và Tắt hạn (SQL 631). Dashboard đếm theo cột, không theo status thẻ. Tích không reload. `/vc/task-templates` layout cột như SX.
- File: `database/631_logistics_pipeline_dashboard_kpi.sql`, `logistics.js`, `vcOverviewKpis.js`, `moduleDeadlinePolicy.js` (FE+BE), `LogisticsPipelineSettingsPage.jsx`, `LogisticsDashboard.jsx`, `LogisticsViews.jsx`, `WorkshopTaskTemplatesPage.jsx`, `vcPipelineKpi.js`, `vc-mobile/src/lib/vcBoardKpis.ts`, `tests/vc-column-stage-kpi.test.js`.
- Test: `node tests/vc-column-stage-kpi.test.js`.

## 2026-09-22 13:50 — Bộ mẫu SX: gắn theo cột, ít bấm

- AI: Cursor. Bỏ wizard Công ty→Phân loại→Pipeline. Chip loại + danh sách cột; mỗi cột hiện bộ đã gắn và nút + Gắn. Select chuyển cột trên thẻ.
- File: `frontend/src/pages/WorkshopTaskTemplatesPage.jsx`.

## 2026-09-22 11:50 — Gán cột pipeline vào ô Dashboard

- AI: Cursor. Nút tích Đang SX / Chờ VC / Đã VC trên setup pipeline; mỗi công ty map cột vào ô KPI Dashboard. Cột `dashboard_kpi` (SQL 630). Chưa tick thì tự suy như cũ.
- File: `database/630_production_pipeline_dashboard_kpi.sql`, `productionPipelineSchema.js`, `production.js`, `sxPipelineRevenue.js` (FE+BE), `sxKanbanSummary.js`, `workshopKanban.js`, `ProductionPipelineSettingsPage.jsx`, `tests/sx-column-stage-kpi.test.js`.

## 2026-09-22 11:35 — KPI SX theo cờ cột Kanban

- AI: Cursor. Đang SX / Chờ VC / Đã VC đếm theo cột (handover / đã giao), không theo đã gán VC trên dự án.
- File: `sxKanbanSummary.js`, `sxPipelineRevenue.js` (FE+BE), `ProductionDashboard.jsx`, `tests/sx-column-stage-kpi.test.js`.

## 2026-09-22 11:25 — Thứ tự Cột nhỏ theo cột chính

- AI: Cursor. Kéo cột nhỏ/cột chính ghi `order_index` 1…N theo trái→phải, trên→dưới; tab Cột nhỏ đổi số thứ tự theo.
- File: `ProductionPipelineSettingsPage.jsx`.

## 2026-09-22 11:10 — Kéo cột nhỏ lên xuống trong cột chính

- AI: Cursor. Tab Cột chính: kéo cột nhỏ lên/xuống trong thẻ đổi `order_index`; tab Cột nhỏ và Kanban gộp theo thứ tự đó. PUT reorder, không `load()` cả trang.
- File: `ProductionPipelineSettingsPage.jsx`, `sxGopCot.js`.

## 2026-09-22 10:40 — Tích cột pipeline không tải lại trang

- AI: Cursor. Nút Công / Thu / Deadline / Tắt hạn / Bỏ quá hạn / Ẩn cập nhật hàng tại chỗ (optimistic + PUT), không `load()` cả trang.
- File: `ProductionPipelineSettingsPage.jsx`.

## 2026-09-22 10:30 — Nút Tắt hạn trên cột pipeline SX

- AI: Cursor. Cột nhỏ có nút **Tắt hạn**; cột được tích thì kéo thẻ vào sẽ xóa hạn SX và không hiện quá hạn. Flag `clears_deadline` (SQL 629).
- File: `database/629_production_pipeline_clears_deadline.sql`, `productionPipelineSchema.js`, `production.js`, `clearCompletedProjectDeadlines.js`, `crmPipelineSla.js`, `sxKanbanSummary.js`, `workshopKanban.js`, `sxPipelineRevenue.js`, `moduleDeadlinePolicy.js` (FE+BE), `ProductionPipelineSettingsPage.jsx`, tests.
- Test: `node tests/sx-deadline-bucket.test.js`, `sx-delivered-overdue-guard.js`; trình duyệt HCB Tủ bếp Cột nhỏ — hàng «Tiếp nhận đơn hàng về SX» có nút Tắt hạn. Không bật cờ trên cột live.

## 2026-09-22 10:05 — Deadline SX: hiện Quá hạn, Đã giao không đếm lịch sử

- AI: Cursor. Cột Quá hạn «Đã tải 0/2»: gỡ ẩn handover-only; cột Đã giao không đếm `delivery_date` lịch sử. TB-2026-771 hiện; TB-2026-791 hết hạn SX.
- File: `moduleDeadlinePolicy.js` (FE+BE), `sxKanbanSummary.js`, `sxPipelineRevenue.js` (FE+BE), `ProductionViews.jsx`, `ProductionDashboard.jsx`, `production.js`, `tests/sx-deadline-bucket.test.js`.
- Test: `node tests/module-deadline-policy.test.js`, `sx-deadline-bucket.test.js`; trình duyệt `/sx/dashboard` HCB Tủ bếp Deadline — Quá hạn 1 thẻ TB-2026-771.

## 2026-09-22 10:00 — KPI SX theo bộ lọc phân loại

- AI: Cursor. Công nợ/Đã thu dashboard SX lấy `revenue_kpis` từ summary (cùng `workshop_type_id`), không đếm thẻ đã load.
- File: `sxKanbanSummary.js`, `ProductionDashboard.jsx`.
- Test: HCB Tủ bếp → Công nợ 215 / 35.047.380đ; Cánh kính → 175 tổng, Công nợ 6, Đã thu 162.

## 2026-09-22 09:50 — PDF HCB khoanh đỏ nút, từng bước

- AI: Cursor. Ảnh live khoanh số 1–19 (Pipeline, popup Sửa, Dashboard, menu Gộp, Quản lý nhiệm vụ, Giao việc). PDF viết lại theo bước bấm.
- File: `docs/ba/guides/huong-dan-hcb-gop-nhiem-vu/` + `bao-cao/Huong-dan_HCB_Gop-cot-va-Nhiem-vu.pdf`.

## 2026-09-22 09:35 — PDF hướng dẫn HCB gộp cột + nhiệm vụ + công việc

- AI: Cursor. Guide 8 trang: Pipeline Cột chính HCB Tủ bếp, Dashboard gộp + nút Nhiệm vụ, Quản lý nhiệm vụ + nút Công việc, Giao việc TB-2026-787.
- File: `docs/ba/guides/huong-dan-hcb-gop-nhiem-vu/` (PDF, print HTML, 5 PNG, generate-pdf.mjs); bản sao `bao-cao/Huong-dan_HCB_Gop-cot-va-Nhiem-vu.pdf`.

## 2026-09-22 09:16 — Popup sửa cột nhỏ trên tab Cột chính

- AI: Cursor. Nút **Sửa** trên `/sx/pipeline-settings` tab Cột chính mở form trong popup, không chuyển tab.
- File: `ProductionPipelineSettingsPage.jsx`.
- Test: HCB Tủ bếp — Sửa «Thiết kế & lập kế hoạch NVL» và «Chuẩn bị vật tư»; Hủy đóng, vẫn ở Cột chính.

## 2026-09-21 14:50 — Ẩn phân tích hạn SX + nút Sửa cột nhỏ pipeline

- AI: Cursor. Gỡ khối «Kế hoạch SX (tính từ ngày lắp)» khỏi `WorkshopInfoPanel`. Tab Cột chính pipeline: nút **Sửa** trên từng cột nhỏ.
- File: `ProductionDetail.jsx`, `ProductionPipelineSettingsPage.jsx`.
- Test: `/sx/projects/2587e50d-…` không còn khối indigo; `/sx/pipeline-settings` HCB Cánh kính — Sửa «Chuẩn bị Vật tư» mở form.

## 2026-09-21 14:15 — Setup chi phí: lưới nút tích

- AI: Cursor. Vùng «Nút tích» thành lưới thẻ (chọn thẻ → gắn nhiệm vụ), nhiệm vụ 2 cột; bỏ bảng tổng hợp + chuỗi 6 bước.
- File: `AccountingCostSetupPage.jsx`.
- Test: trình duyệt `/management/cost-setup` Phúc Đạt — thẻ Báo giá CRM, lưới nhiệm vụ, tab SX trống + form thêm nút.

## 2026-09-21 13:20 — Đơn hàng: điền khách hàng trên danh sách

- AI: Cursor. Cột Khách hàng `/crm/orders` bấm để nhập tên/SĐT/địa chỉ thay vì `-`.
- File: `OrdersPage.jsx`, `commercialDocs.js` (`ORDER_LIST_SELECT`).

## 2026-09-21 09:35 — CRM Deadline luôn hiện hạn (gỡ ẩn SĐT / đã SX)

- AI: Cursor. Gỡ ẩn hạn CRM khi thiếu SĐT hoặc đã có `project_id`. Badge `0/1` là loaded/total server; FE không còn đẩy thẻ sang «Không hạn» vì hai điều kiện đó.
- File: `crmLeadDeadlineDisplay.js`, `moduleDeadlinePolicy.js` (FE+BE), `leadsList.js`, `CrmLeadDeadlineOverview.jsx`, `LeadDetail.jsx`, `628_crm_deadline_always_show.sql`, `DECISIONS.md` AI-002.
- Test: `node tests/module-deadline-policy.test.js`. SQL 628 đã chạy primary + backup.

## 2026-09-19 15:05 — CRM setup chi phí dùng nút Báo giá có sẵn

- AI: Cursor. Không tạo nút tích CRM mới: `ensureCrmQuotationCostType` lấy nút Upload Excel Báo giá, gắn loại `bao_gia` / `doanhthu.bao_gia`. Tab CRM ẩn form «Thêm nút tích». Báo giá doanh thu vẫn đẩy giá vốn dòng vào `crm.product_cogs`.
- File: `costHub.js`, `costLedger.js`, `AccountingCostSetupPage.jsx`.
- Test: `node tests/cost-ledger.test.js`. Phúc Đạt 183 NV đã gắn.

## 2026-09-19 08:50 — Loại chi phí + Excel + công thức

- AI: Cursor. Tạo loại chi phí theo module, gắn bộ mẫu; checkbox setup công việc bắt upload Excel; công thức `excel.a - (excel.b + excel.c)` nhiều công thức; tab Kế toán upload Excel.
- File: `624_cost_types_excel.sql`, `costLedger.js`, `costHub.js`, `AccountingCostSetupPage.jsx`, template SX/CRM, `CostExcelUpload.jsx`, `WorkUnifiedProjectDetailPage.jsx`.
- Test: `node tests/cost-ledger.test.js`.

## 2026-09-18 16:40 — Setup chi phí: module + toán tử

- AI: Cursor. Trang setup: bật module vào sổ, ghép công thức bằng +, −, ×, / (dropdown).
- File: `AccountingCostSetupPage.jsx`, `costFormulaTerms.js`.

## 2026-09-18 16:20 — Setup chi phí chọn công ty + khu vực

- AI: Cursor. Admin HST chọn công ty/khu vực trên `/management/cost-setup`.
  Khu vực clone mặc định toàn công ty rồi chỉnh riêng (`region_id`, SQL 623).
- File: `623_cost_hub_region.sql`, `costLedger.js`, `costHub.js`, `AccountingCostSetupPage.jsx`.

## 2026-09-18 15:55 — Setup chi phí ở module Dự án + tab Kế toán Work Unified

- AI: Cursor. Gắn setup công thức vào nhóm **3. Thiết lập** (`/management/cost-setup`).
  Tab chi tiết Work Unified đổi **Kế toán** (`?tab=ketoan`) — sổ giá vốn / lợi nhuận
  + dòng tiền. API `GET /projects/:id/cost-summary`.
- File: `Sidebar.jsx`, `App.jsx`, `sidebarModuleContext.js`, `AccountingCostSetupPage.jsx`,
  `WorkUnifiedProjectDetailPage.jsx`, `projects.js`.

## 2026-09-18 14:55 — Sổ chi phí + setup công thức theo module

- AI: Cursor. Sổ `/ketoan/chi-phi`, setup công thức, ledger `cost_entries`.
- File: `622_cost_hub.sql`, `costLedger.js`, `costExpr.js`, `costHub.js`, 2 trang Kế toán, adapter SX/PO/VC/CRM COGS.
- Test: `node tests/cost-ledger.test.js`.
- SQL 622 đã chạy primary + backup.

## 2026-09-18 14:38 — Push nốt ecosystem_admin + gắn công ty HST

- AI: Cursor. Đẩy quyền role mới, Facebook HST, sync `user_companies`.

## 2026-09-18 14:35 — CRM Kanban 400 thiếu company_id trên production

- AI: Cursor. Production `userIsAdmin === admin` nên JWT `ecosystem_admin`
  bị 400. Deploy helpersBundle + adminRole BE/FE + crmAccessRoles.

## 2026-09-18 14:30 — Xóa Linh Tây Ninh + Vân Long Xuyên

- AI: Cursor. Xóa 2 công ty inactive (0 lead/project) trên primary+backup.
  Gỡ `user_companies`; giữ unit/dự án thật. Sync HST chỉ gắn công ty active.
- `admin@tubep.vn` còn 5 công ty.

## 2026-09-18 14:20 — Gắn mọi công ty HST cho admin hệ thống

- AI: Cursor. `user_companies` đủ công ty tenant cho ecosystem_admin.
  Không set `users.company_id`. File: `hstAdminCompanies.js`, login `/me`,
  tạo công ty, Users POST/PUT, SQL 621.
- `admin@tubep.vn`: 7 công ty.

## 2026-09-18 14:10 — Admin HST không bắt company_id trên CRM

- AI: Cursor. `userIsAdmin` thiếu `ecosystem_admin` nên JWT mới bị 400
  «Thiếu company_id của user». File: `helpersBundle.js`.
- Test: `node -e` userIsAdmin('ecosystem_admin') === true.

## 2026-09-18 11:50 — Role quản trị hệ sinh thái (ecosystem_admin)

- AI: Cursor. Thêm enum `ecosystem_admin`, gán `admin@tubep.vn`.
  Helper BE/FE coi role này là admin HST (không `platform_admin`).
  File: `620_user_role_ecosystem_admin.sql`, `adminRole.js`, UsersPage,
  `crmAccessRoles.js`, `facebook.js`.
- Test: `node tests/facebook-lead-chat-scope.test.js`, `npm run test:role-enum`.
- Cần đăng nhập lại để JWT nhận role mới.

## 2026-09-18 11:35 — Admin HST xem hội thoại Facebook trên deal

- AI: Cursor. Admin cả hệ sinh thái (`admin` + `tenant_id`, không khoá
  công ty) xem thread deal trong HST dù Page chưa map công ty. File:
  `facebook.js`, test `facebook-lead-chat-scope.test.js`.
- Test: `node tests/facebook-lead-chat-scope.test.js`.

## 2026-09-18 11:25 — Admin hệ thống xem hội thoại Facebook trên deal

- AI: Cursor. 403 vì lọc Page theo đúng công ty deal. Admin hệ thống
  dùng phạm vi tenant (hoặc all) + cho thread đã gắn lead. File:
  `facebook.js`, `FacebookChatTab.jsx`, test `facebook-lead-chat-scope.test.js`.
- Test: `node tests/facebook-lead-chat-scope.test.js`.

## 2026-09-17 11:45 — Trang cá nhân: cập nhật họ tên và SĐT

- AI: Cursor. Nút **Cập nhật** trên card Thông tin. PATCH profile/me
  nhận `phone`. File: `EditMyNameModal.jsx`, `SocialProfilePage.jsx`,
  `internalSocial.js`.

## 2026-09-17 11:05 — Gửi nhắc tất cả dự án trễ hạn Work Unified

- AI: Cursor. Bấm **Nhắc tiến độ (36)** VPT: 36 bình luận @ người chịu
  trách nhiệm. Proxy Vite cắt ~120s nên UI báo lỗi dù BE vẫn gửi nốt.
  Sửa: gửi song song 5; timeout `/api` 180s.
- Test: `node tests/work-unified-progress-reminder.test.js`.

## 2026-09-17 10:50 — Qua cột Lắp đặt CRM thì hết hạn lắp

- AI: Cursor. PATCH stage CRM sau Lắp đặt tắt hạn lắp (CSKH → warranty;
  Hoàn thành → project_final). File: `crmDealStageGate.js`,
  `moduleDeadlinePolicy.js`, `completeOpenWorkOnModuleDone.js`,
  `leadLifecycle.js`, `management.js`.
- Test: `node tests/module-deadline-policy.test.js`.

## 2026-09-17 10:40 — Nhắc tiến độ dự án quá hạn trên Work Unified

- AI: Cursor. Nút Nhắc tiến độ gửi bình luận @ người chịu trách nhiệm
  (tab Thành viên) cho dự án `forecast=late`. File:
  `workUnifiedProgressReminder.js`, `management.js`,
  `WorkUnifiedOverviewPage.jsx`, test `work-unified-progress-reminder.test.js`.
- Test: `node tests/work-unified-progress-reminder.test.js` OK.

## 2026-09-17 10:10 — Dọn hạn chồng theo vòng đời CRM → SX → lắp

- AI: Cursor. SQL 619 đã chạy primary + backup. Xóa hạn CRM trên
  Thua/Thắng và deal đã lập SX; xóa hạn SX sau giao/bàn giao VC.
  Không đụng ngày giao/lắp. Script:
  `backend/scripts/sync-lifecycle-deadlines.js`.
- Primary trước→sau: thẻ mất 634→0, NV mất 768→0, hạn SX sau giao 13→0.
- Backup: 409/744/2 → 0.

## 2026-09-17 09:40 — Một hạn theo vòng đời CRM → SX → lắp

- AI: Cursor. Policy: CRM lập SX thì hết hạn CRM; SX giao/bàn giao VC thì
  hết hạn SX và đếm hạn lắp; lắp xong thì hết hạn. File:
  `moduleDeadlinePolicy.js` (BE+FE), `crmLeadDeadlineDisplay.js`,
  `leadsList.js`, test, `DECISIONS.md` AI-002.
- Test: `node tests/module-deadline-policy.test.js`,
  `node tests/project-overview-deadline.js` OK.

## 2026-09-16 16:05 — Bật/tắt từng API cảnh báo hạn

- AI: Cursor. Cột công tắc trên bảng API đã cấu hình; tắt thì cron
  không gửi API đó. File: `ProjectDeadlineDispatchPage.jsx`,
  `dashboard.js`, `projectDeadlineDispatch.js`.

## 2026-09-16 16:00 — Bật/tắt cảnh báo hạn + gán hạn nhiệm vụ

- AI: Cursor. Trang `/management/project-deadlines` thêm công tắc
  cảnh báo Zalo toàn hệ thống và gán hạn module vào việc trống.
  File: `ProjectDeadlineDispatchPage.jsx`, `dashboard.js`,
  `projectDeadlineDispatch.js`, `workTasks.js`.

## 2026-09-16 15:40 — Ghi hạn module vào việc con trống trên tổng quan NV

- AI: Cursor. Việc mở chưa có `due_date`/`deadline` được ghi hạn module
  khi tải `/work-tasks/project-overview`. Mẫu xưởng mới cũng nhận hạn
  lúc tạo. File: `projectOverviewDeadline.js`, `workTasks.js`,
  `workshopApplyTemplates.js`.

## 2026-09-16 15:25 — Tổng quan NV: hạn thẻ theo deadline module

- AI: Cursor. Thẻ `/sx/project-tasks` lấy hạn module (SX / VC-LĐ / CRM)
  theo lane nhóm việc; việc con không hạn không còn đẩy thẻ vào
  «Chưa có hạn» nếu dự án đã có hạn xưởng/lắp/deal. File:
  `workTasks.js`, `projectOverviewDeadline.js`, `moduleDeadlinePolicy.js`,
  `tests/project-overview-deadline.js`.

## 2026-09-16 14:20 — Stepper CRM tích ✓ khi SX/VC đã kéo tới

- AI: Cursor. Cột Sản xuất / VC / Hoàn thành trên thanh tiến độ deal
  không còn trống nếu module xưởng/VC đã vào cột tương ứng (kể cả khi
  thẻ CRM chưa kéo theo). Bỏ rule cũ «không bao giờ ✓ cột SX/VC».
  File: `PipelineStepper.jsx`, `crmDealStageGate.js`, `LeadDetail.jsx`,
  `WorkUnifiedProjectDetailPage.jsx`.

## 2026-09-16 13:40 — Hạn Work Unified = buổi lắp VC-LĐ còn lại

- AI: Cursor. Bỏ chống chế «SX đã giao + VC Tiếp nhận thì không trễ».
  Trước khi sửa `routes/management.js`: `queryWorkUnifiedList` /
  `buildItem` dùng `resolveModuleDeadline(logistics)` sau khi gắn
  sự kiện lắp. Hạn = buổi lắp gần nhất ≥ hôm nay (đang lắp vẫn theo
  lịch VC); hết buổi thì ngày cuối — quá hạn nếu chưa Hoàn thành.
  File: `moduleDeadlinePolicy.js` (BE+FE), `projectForecast.js`,
  `management.js`, `projectDealBundle.js`, test deadline + forecast.

## 2026-09-16 13:30 — Work Unified: không trễ khi SX đã giao, VC còn Tiếp nhận

- AI: Cursor. Trước khi sửa `routes/management.js` (vùng dùng chung):
  `classifyProjectForecast` + `queryWorkUnifiedList` (`buildItem`).
  Bỏ tính Trễ hạn ngày lắp khi cột SX đã giao/hoàn thành/chốt công nợ
  và VC còn Tiếp nhận (`delivery_pending`) hoặc chưa có cột VC.
  Đơn đã vào giao/lắp VC vẫn trễ nếu hạn lắp quá khứ.
  File: `projectForecast.js`, `management.js`, `projectDealBundle.js`,
  `project-forecast-gcck.js`.

## 2026-09-16 12:10 — CRM Pipeline tự thêm thành viên theo cột

- AI: Cursor. Setup trên `/crm/pipeline-settings`: tick «Tự thêm thành
  viên CRM khi vào cột», chọn NV (forModule=all, gồm kế toán). Áp khi
  kéo Kanban, lập KH SX, gắn VC-LĐ. SQL 618 + seed Vân cột Đã ký HĐ
  Phúc Đạt. Bỏ hardcode ALWAYS_PHUCDAT.
  File: `PipelineSettingsPage.jsx`, `pipelines.js`,
  `crmPipelineStageMembers.js`, `leadLifecycle.js`, `autoDealWonProject.js`,
  `618_crm_pipeline_stage_default_members.sql`.

## 2026-09-16 11:55 — Phúc Đạt mặc định thêm NV Vân vào deal SX/VC

- AI: Cursor. Deal Phúc Đạt: tự thêm Hoàng Thị Phượng Vân vào tab
  Thành viên khi lập kế hoạch SX và khi gắn VC-LĐ. SQL 617 backfill
  38 deal đang chạy (ký HĐ → hóa đơn, không gồm hoàn thành).
  File: `dealParticipantProduction.js`, `vcHandoverDealMembers.js`,
  `productionWorkshopTypeStaff.js`, `617_phucdat_van_signed_deal_members.sql`.

## 2026-09-16 11:50 — HCB Cánh kính hoàn thành SX tắt hạn toàn dự án

- AI: Cursor. Cột Hoàn thành Cánh kính HCB đóng hết NV còn mở + tắt
  deadline CRM/SX/VC (status completed) để bên khác không quá hạn.
  File: `completeOpenWorkOnModuleDone.js`, `clearCompletedProjectDeadlines.js`,
  `projectForecast.js`. Test: `project-forecast-gcck.js`.

## 2026-09-16 11:20 — Mũi tên cuộn trang Quản lý nhiệm vụ

- AI: Cursor. Board hạn nhiệm vụ dùng cùng chrome mũi tên Dashboard
  Kanban. File: `ProjectTasksOverviewPage.jsx`.

## 2026-09-16 11:05 — Nút Nhiệm vụ trên thẻ Kanban

- AI: Cursor. Đưa nút quản lý nhiệm vụ lên đầu thẻ, gắn nhãn «Nhiệm vụ».
  SX, VC, Work Unified. File: `KanbanGotoProjectTasksBtn.jsx`,
  `ProductionDashboard.jsx`, `LogisticsDashboard.jsx`,
  `WorkUnifiedOverviewPage.jsx`.

## 2026-09-16 10:25 — Thêm cột nhỏ ngay thẻ cột chính

- AI: Cursor. Nút Thêm cột nhỏ trong từng thẻ (và thẻ nét đứt).
  POST `/production/pipeline-stages` nhận `group_sort`. File:
  `ProductionPipelineSettingsPage.jsx`, `production.js`.

## 2026-09-16 10:15 — Kéo cột nhỏ giữa các cột chính

- AI: Cursor. Setup pipeline: thả cột nhỏ vào danh sách bên trong thẻ
  cột chính (không chỉ viền thẻ). Phân biệt kéo cột nhỏ vs kéo thứ tự
  cột chính. File: `ProductionPipelineSettingsPage.jsx`.

## 2026-09-16 09:25 — Setup pipeline quanh cột chính

- AI: Cursor. Trang Pipeline xưởng: tab Cột chính (bảng thẻ), Cột nhỏ,
  Cài đặt. Công ty + phân loại trên cùng. File:
  `ProductionPipelineSettingsPage.jsx`.

## 2026-09-16 09:00 — Thêm cột Đóng gói HCB (Tủ bếp)

- AI: Cursor. Chèn cột pipeline «Đóng gói» Tủ bếp (trước KCS).
  Cửa/Cánh kính giữ «Vệ sinh đóng gói». SQL 616 primary+backup.
  File: `616_hcb_dong_goi_pipeline_column.sql`.

## 2026-09-16 08:50 — Hiện cột lớn Đóng gói HCB

- AI: Cursor. Gộp 1 cột nhỏ vẫn hiện tên cột lớn. Tủ bếp gán
  `dong_goi` cho «ĐƠN HÀNG ĐÃ CHUẨN BỊ XONG». File: `sxGopCot.js`,
  `ProductionDashboard.jsx`, `615_hcb_tubep_dong_goi_group_key.sql`.

## 2026-09-15 16:40 — Tự thêm tab Kanban xưởng

- AI: Cursor. Nút + Tab trên setup cột lớn; `board_tab` lưu tên tab
  tự đặt. Dashboard lặp các tab có cột (Sản xuất + Công nợ + tab mới).
  File: `sxTachCongNo.js`, `ProductionPipelineSettingsPage.jsx`,
  `ProductionDashboard.jsx`, `production.js`.

## 2026-09-15 16:20 — Cột lớn theo tab Sản xuất / Công nợ

- AI: Cursor. Settings Gộp cột + khối Cột pipeline có switcher
  Sản xuất / Công nợ như Dashboard. Tạo/chuyển cột lớn gắn
  `board_tab` — Kanban hiện đúng tab. SQL 614 primary+backup.
  File: `614_production_pipeline_board_tab.sql`, `sxTachCongNo.js`,
  `ProductionPipelineSettingsPage.jsx`, `productionPipelineSchema.js`,
  `workshopKanban.js`, `production.js`.

## 2026-09-15 16:05 — Form thêm cột lớn trên tab Cột pipeline

- AI: Cursor. Cùng form Thêm cột lớn trên tab Cột pipeline (khối
  violet «Cột lớn — giai đoạn nối tiếp»). File:
  `ProductionPipelineSettingsPage.jsx`.

## 2026-09-15 15:30 — Form thêm cột lớn trên tab Gộp cột

- AI: Cursor. Khối «Cột lớn đang dùng» có form tạo cột lớn: tên,
  chip gợi ý, checkbox cột pipeline. File:
  `ProductionPipelineSettingsPage.jsx`.

## 2026-09-15 15:15 — Ô Cột lớn: dropdown tên tiếng Việt

- AI: Cursor. Bảng gán cột lớn bỏ input+datalist slug. Dropdown
  nhãn «Tiếp nhận»…, lưu khi chọn, mục «+ Tên mới…». File:
  `ProductionPipelineSettingsPage.jsx`, `sxGopCot.js`.

## 2026-09-15 15:00 — Gộp cột: kéo thứ tự + sửa tên tại chỗ

- AI: Cursor. Tab Gộp cột đổi lưới 3 cột thành danh sách: kéo /
  ↑↓ đổi thứ tự cột lớn, ô tên lưu khi blur, hiện cột nhỏ, lọc NV.
  Cột `group_sort` (SQL 613, primary + backup). File:
  `ProductionPipelineSettingsPage.jsx`, `sxGopCot.js`,
  `productionPipelineSchema.js`, `workshopKanban.js`, `production.js`.

## 2026-09-15 14:40 — Đóng gói sau Hoàn thiện (Gộp cột)

- AI: Cursor. Lưới Gộp cột + Kanban gộp: `dong_goi` luôn sau
  `hoan_thien`. File: `sxGopCot.js`, `ProductionPipelineSettingsPage.jsx`.

## 2026-09-15 14:20 — Cột lớn Đóng gói (HCB Cửa/Cánh kính)

- AI: Cursor. Tách «Vệ sinh đóng gói» khỏi Hoàn thiện → `dong_goi`.
  File: `612_hcb_dong_goi_group_key.sql`, `sxGopCot.js`,
  `sxWorkshopSchedule.js`, `ProductionPipelineSettingsPage.jsx`.
  Chạy: `node scripts/run-migration-612.js`.

## 2026-09-15 14:15 — CRM: nút Zalo Đã gửi

- AI: Cursor. Chi tiết deal: nút Gửi Zalo → **Đã gửi Zalo** sau khi
  gửi thành công; đọc lại từ `crm_zalo_stage_sends`. File:
  `LeadDetail.jsx`, `leadLifecycle.js`, `helpersBundle.js`.
  Đã kiểm DEAL-2026-1549 (Nam test) hiện Đã gửi; deal chưa gửi
  vẫn Gửi Zalo. Không bấm gửi thật trên deal khách.

## 2026-09-15 13:45 — Pipeline xưởng: lọc + NV cột lớn

- AI: Cursor. Tab Gộp cột: lọc Công ty/Loại; gán người chịu trách
  nhiệm cột lớn (default_staff primary). File:
  `ProductionPipelineSettingsPage.jsx`, `ProductionDashboard.jsx`,
  `sxStageStaff.js`.

## 2026-09-15 13:25 — Lịch Work Unified: chip đủ nhận diện

- AI: Cursor. Ô ngày: mã + khách/tên ngắn · NV. Panel ngày: thêm
  Hạn SX / Giao / Lắp. File: `WorkUnifiedOverviewPage.jsx`.

## 2026-09-15 13:15 — Work Unified Deadline: cột Ngày mai

- AI: Cursor. Board Deadline thêm bucket `tomorrow` (label Ngày mai)
  giữa Hôm nay và Tuần này. File: `WorkUnifiedOverviewPage.jsx`.

## 2026-09-15 11:25 — Thanh nhiệm vụ: chỉ tìm kiếm

- AI: Cursor. Bỏ chip «Sản xuất · N»; thanh còn ô tìm, lọc từng chữ.
  File: `ProjectTasksOverviewPage.jsx`.

## 2026-09-15 11:20 — Thẻ nhiệm vụ → Giao việc + Nhật ký

- AI: Cursor. Thẻ `/sx/project-tasks` mở `/sx/assignments?project_id=`;
  nút **Công việc** (tab tasks dự án), không phải nhật ký.
  File: `ProjectTasksOverviewPage.jsx`, `CRMAssignmentsPage.jsx`,
  `assignmentSourceLink.js`.

## 2026-09-15 10:55 — Bộ lọc nhiệm vụ = Phạm vi xưởng Dashboard

- AI: Cursor. Panel `/sx/project-tasks` dùng `WorkshopScopeFields` (xưởng +
  công ty đặt hàng). API `deal_company_id`. File:
  `ProjectTasksOverviewPage.jsx`, `ProjectTasksFilterPanel.jsx`,
  `WorkshopDashboardFilterPanel.jsx`, `workTasks.js`.

## 2026-09-15 10:52 — Menu SX: Dashboard

- AI: Cursor. Nhãn sidebar `/sx/dashboard` «Deal vào xưởng» → Dashboard.
  File: `Sidebar.jsx`.

## 2026-09-15 10:50 — Bộ lọc nhiệm vụ SX theo Dashboard

- AI: Cursor. `/sx/project-tasks` dùng xưởng `for_module=production`
  (Metalla/HCB/Phúc Đạt), KV+NV `for_module=production`, đồng bộ
  `sx_dash_filters_v1`. File: `ProjectTasksOverviewPage.jsx`,
  `ProjectTasksFilterPanel.jsx`, `crossWorkshopProduction.js`,
  `WorkUnifiedFilterFields.jsx`, `Sidebar.jsx`.

## 2026-09-15 10:35 — Tắt NextGo trên HST mặc định

- AI: Cursor. `is_active=false` cho công ty nguồn
  `87479a83-1145-43b7-b090-3e40812cb5a9` (tenant default).
  Primary: `freeze-nextgo-source.js --apply`. Backup: MCP SQL.
  Clone HST nextgo không đổi. Cache `/companies` ~120s.

## 2026-09-15 10:15 — Bộ lọc NV: NV theo CT / khu vực

- AI: Cursor. Danh sách người phụ trách lọc theo công ty và khu vực
  (`crm_region_ids`). File: `ProjectTasksOverviewPage.jsx`,
  `ProjectTasksFilterPanel.jsx`.

## 2026-09-15 10:08 — Bộ lọc NV: chọn nhiều nhân viên

- AI: Cursor. Người phụ trách trên panel nhiệm vụ dự án là checkbox,
  chọn 1 hoặc nhiều. File: `ProjectTasksFilterPanel.jsx`,
  `ProjectTasksOverviewPage.jsx`.

## 2026-09-15 09:50 — Bộ lọc NV dự án: công ty / khu vực / nhân viên

- AI: Cursor. Panel bộ lọc `/sx/project-tasks` nạp đủ CT/KV/NV; khu vực
  SX lấy từ deal của dự án. File: `ProjectTasksOverviewPage.jsx`,
  `ProjectTasksFilterPanel.jsx`, `workTasks.js`.

## 2026-09-15 09:41 — Kanban SX: nút NV to, tách riêng

- AI: Cursor. Nút quản lý nhiệm vụ trên thẻ Kanban xưởng 32px, nền tím,
  nằm riêng khỏi cụm icon nhỏ. File: `ProductionDashboard.jsx`.

## 2026-09-15 09:22 — Push main: Zalo nút gửi + FE local

- AI: Cursor. Push `main`: nút Gửi Zalo mọi cột, tắt tự gửi; Work Unified
  bỏ chip module; menu 3. Setup xưởng; tab gộp cột pipeline SX.

## 2026-09-15 09:08 — Nút Gửi Zalo mọi cột deal

- AI: Cursor. Nút hiện trên mọi deal, không cần cột Hoàn thành. API
  fill/send thủ công bỏ chặn cột. Tự gửi khi kéo cột vẫn tắt.
- File: `LeadDetail.jsx`, `taxonomy.js`, `helpersBundle.js`.

## 2026-09-15 09:05 — Tắt tự gửi Zalo khi kéo cột

- AI: Cursor. `maybeSendZaloOnDealStageEnter` no-op. Ẩn toggle Zalo
  trên pipeline. Nút **Gửi Zalo** trên chi tiết deal giữ nguyên.
- File: `helpersBundle.js`, `PipelineSettingsPage.jsx`, `LeadDetail.jsx`.

## 2026-09-15 08:58 — Pipeline Zalo: hiện token từ OA accounts

- AI: Cursor. Tab Cài đặt Pipeline → Zalo OA hiện nguồn
  `zalo_oa_accounts` (tự refresh). PUT/preview dùng token hiệu lực.
- File: `taxonomy.js`, `PipelineSettingsPage.jsx`.

## 2026-09-15 08:50 — CRM: hiện lại nút Gửi Zalo OA

- AI: Cursor. Header chi tiết deal (cột Hoàn thành) hiện lại nút **Gửi Zalo**.
- File: `LeadDetail.jsx`.

## 2026-09-15 08:40 — Work Unified: bỏ chip CRM/SX/VC

- AI: Cursor. Thẻ Kanban/Deadline không hiện badge module. Calendar
  bỏ chip tương tự. File: `WorkUnifiedOverviewPage.jsx`.

## 2026-09-14 16:46 — Nhóm menu 3. Setup xưởng

- AI: Cursor. Sidebar SX: «3. Điều hành xưởng» → **3. Setup xưởng**.
- File: `Sidebar.jsx`, `dictionary.en.js`.

## 2026-09-14 16:30 — Zalo ZNS dùng token OA hiệu lực

- AI: Cursor. `getZaloAccessTokenHieuLuc` đọc `zalo_oa_accounts` rồi mới
  dự phòng `app_settings`. File: `zaloTokenHieuLuc.js`, `helpersBundle.js`,
  `taxonomy.js`.

## 2026-09-14 16:00 — Fix build Render: GiaVonExcelModal

- AI: Cursor. Commit `frontend/src/components/GiaVonExcelModal.jsx` vì trang
  mẫu nhiệm vụ đã import, deploy thiếu file.

## 2026-09-14 14:55 — Chi tiết SX: ẩn tab Sự cố

- AI: Cursor. Ẩn nút tab «Sự cố» trên `ProductionDetail`; URL cũ
  `?tab=incidents` không còn trong `DEAL_TAB_KEYS` nên về tab Công việc.
- File: `ProductionDetail.jsx`.

## 2026-09-14 14:30 — Cánh kính/Cửa: bỏ yêu cầu hoàn thành việc trước khi kéo

- AI: Cursor. Gate nhiệm vụ không còn chặn kéo cột Cánh kính và Cửa (BE + SQL 611
  tắt `blocks_stage_advance` mọi mẫu/task hai loại). Tủ bếp giữ nguyên.
- File: `workshopStageAdvanceGate.js`, `database/611_hcb_canh_kinh_cua_khong_chan_keo.sql`.

## 2026-09-14 14:20 — Cánh kính: kéo Tiếp nhận sang sản xuất

- AI: Cursor. Quản lý Nguyễn Nhật không kéo được vì 3 crm_tasks Tiếp nhận
  (Tiếp nhận thông tin / Chốt yêu cầu KT / Vẽ kế hoạch) `blocks_stage_advance`.
- Tắt cờ chặn Cánh kính+Cửa cột Tiếp nhận. Kanban SX mở `BlockingTasksAlertModal`.
- File: `database/610_hcb_canh_kinh_tiep_nhan_khong_chan_keo.sql`, `ProductionDashboard.jsx`.

## 2026-09-14 14:15 — Bình luận: hết nút tải file trùng

- AI: Cursor. Tin hệ thống 📎 vừa link tên file vừa chip Paperclip — 1 file
  hiện 2 chỗ tải. Pill chỉ còn «tên»; chip/preview là chỗ tải duy nhất.
- File: `CommentsPanels.jsx`. DB TB-2026-817 không nhân đôi bản ghi.

## 2026-09-14 14:05 — HCB: đủ thành viên mặc định trên dự án

- AI: Cursor. CRM→SX HCB không còn `primaryOnly` — copy đủ NV setup phân loại.
  SQL 609 bổ sung đội đang thiếu (không đổi phụ trách chính). File:
  `productionWorkshopTypeStaff.js`, `database/609_hcb_fill_workshop_type_staff.sql`.
- RPC: `node scripts/run-migration-609.js` primary + backup, incomplete = 0.

## 2026-09-14 13:55 — Cánh kính HCB: hiện lại cột thanh toán

- AI: Cursor. Cột Đợi thanh toán (8 thẻ) vẫn còn trên DB nhưng `group_key=cong_no`
  nên Kanban SX đẩy sang tab Công nợ. Gỡ group_key Cánh kính/Cửa; Tủ bếp không đổi.
- File: `database/608_hcb_canh_kinh_hien_cot_thanh_toan.sql`, `sxTachCongNo.js`.

## 2026-09-14 13:35 — Tab Công việc SX: Xong hết + hiện việc

- AI: Cursor. Cột lớn/cột nhỏ trên tab Công việc: nút hoàn thành hàng loạt
  và nút hiện/ẩn danh sách nhiệm vụ thuộc cột đó.
- File: `CRMTasksTab.jsx`.

## 2026-09-14 12:20 — NV xưởng dùng hạn kế hoạch SX

- AI: Cursor. API project-overview gắn deadline kế hoạch (tính từ ngày lắp)
  vào nhóm nhiệm vụ khi task chưa có hạn; cột con kế thừa hạn nhóm cha.
- File: `workTasks.js`, `sxInstallPlanKanbanDeadline.js`, `sxWorkshopSchedule.js`,
  `ProductionDetail.jsx`, `production.js`, `projects.js`.

## 2026-09-14 12:00 — Kanban SX: nút nhiệm vụ theo dự án

- AI: Cursor. Thẻ Kanban xưởng thêm nút CheckSquare → `/sx/project-tasks?project=`.
  Trang quản lý NV lọc đúng dự án, chip có thể bỏ lọc.
- File: `ProductionDashboard.jsx`, `ProjectTasksOverviewPage.jsx`.

## 2026-09-14 11:36 — Deadline Work Unified: thẻ gọn

- AI: Cursor. View Deadline lược ĐA MODULE / deal / SĐT / CRM·SX·VC.
  Hiện rõ Hạn SX, Giao, Lắp từng dòng + công đoạn · NV. File:
  `WorkUnifiedOverviewPage.jsx`.

## 2026-09-14 11:28 — Quản lý NV xưởng: cột theo hạn

- AI: Cursor. Trang `/sx/project-tasks` đổi 3 cột rủi hạn thành 6 cột:
  Quá hạn, Hôm nay, Ngày mai, Trong tuần, Tuần sau, Chưa có hạn.
- Thẻ trong cột: mã + hạn trên cùng, tên việc, dự án, thanh tiến độ, người phụ trách.
- File: `ProjectTasksOverviewPage.jsx`, `ProjectTasksFilterPanel.jsx`.

## 2026-09-14 11:30 — Hạn + NV phụ trách trên cột gộp

- AI: Cursor. Phân tích deadline chi tiết SX theo cột gộp; ô ma trận hiện hạn từ ngày lắp
  và người setup ở Cài đặt pipeline. `sxKanbanStages` thêm `deadline_group` + `default_staff`.

## 2026-09-14 10:28 — Chi tiết: tích hoàn thành trên vòng tròn tiến độ

- AI: Cursor. `PipelineStepper`: vòng tròn việc song song = tích xong / bỏ tích.
  Việc đã xong hiện ✓ và đếm n/m trên cột lớn. Tên cột vẫn chuyển thẻ Kanban.

## 2026-09-14 10:20 — HCB Tủ bếp: tách Ban thành phẩm

- AI: Cursor. Mở cột Ban thành phẩm thành Chuẩn bị vật tư / Đặt kính / Sơn.
- 3 đơn (TB-2026-839, 841, 842) ở lại Chuẩn bị vật tư.
- File: `database/607_hcb_tubep_split_ban_thanh_pham.sql`. RPC primary OK; backup cần 604 rồi 607.

## 2026-09-14 10:05 — Work Unified: số KPI ổn định khi đổi tab tiến độ

- AI: Cursor. Tab Tất cả / Đúng tiến độ / Nguy cơ / Trễ đang refetch và trộn
  `totalFiltered` (danh sách đã cắt) với `stats.total` (đôi khi chưa cùng lọc NV)
  → 34 nhảy 79. KPI luôn lấy `stats` của tập chưa cắt forecast; tab lọc trên client
  (trừ danh sách phân trang). File: `frontend/src/pages/WorkUnifiedOverviewPage.jsx`.

## 2026-09-12 11:35 — Ô Đang làm ma trận SX hiện tên dự án

- AI: Cursor. `SxMaTranSongSong` ghi `item.name` / tiêu đề deal dưới nhãn Đang làm và Xong.

## 2026-09-12 10:55 — Deadline không ẩn vì «đã tương tác»

- AI: Cursor. Admin Q2 (`adminq2@vpt.net`) không thấy LEAD-2026-279 ở Deadline
  vì cờ per-user `is_interacted` (06/06) bị dùng như «không có hạn».
- Đã tách: tick vẫn hiện, hạn vẫn tính (NV → setup → SLA).
- File: `moduleDeadlinePolicy` BE/FE, `crmLeadDeadlineDisplay.js`, `leadsList.js`,
  `dailyReportMetrics.js`, `database/606_crm_deadline_not_hidden_by_interacted.sql`.
- Test: `node tests/module-deadline-policy.test.js` OK.
- RPC: đã chạy `node scripts/run-migration-606.js` (primary + backup).

## 2026-09-12 09:30 — Xóa 2 đơn Cửa Phúc Đạt của Minh (không đụng xưởng khác)

- AI: Cursor. Đã chạy `--apply` trên DB primary.
- Xóa: `TB-2026-767` + `DEAL-2026-1401` (Anh Tám); `TB-2026-337` + `DEAL-2026-440` (Anh Hường).
- Không xóa: Metalla `TB-2026-740`, HCB `TB-2026-754/755/764/765/827` và deal `LEAD-2026-1252`, `DEAL-2026-1398/1399/1511`.
- Script: `backend/scripts/delete-phucdat-minh-two-orders.js`.

## 2026-09-12 09:20 — Kanban gộp cột cho dashboard SX (cột lớn nối tiếp / cột nhỏ song song)

- AI thực hiện: Claude, theo yêu cầu anh B.A. Chưa commit (`.git/index.lock` vẫn chặn).
- **Quyết định kiến trúc:** KHÔNG sửa bảng Kanban cũ trong `ProductionDashboard.jsx` (5.957 dòng,
  kéo-thả + lọc + đồng bộ cuộn + highlight tìm kiếm). Làm **chế độ xem thứ 7** đứng cạnh →
  rủi ro với bảng đang chạy bằng 0, bật/tắt bằng một nút.
- **DB — `database/604_production_pipeline_group_key.sql` (ĐÃ CHẠY):**
  thêm `production_pipeline_stages.group_key`, nullable. NULL = cột tự đứng riêng nên các công ty
  khác không đổi gì. Backfill board Tủ bếp HCB theo đúng logic migration 588:
  `tiep_nhan` 1 cột/8 dự án · `ke_hoach` 1/0 · `duyet` 1/0 · `gia_cong` 4/19 · `hoan_thien` 4/89 ·
  `cong_no` 5/215.
- **Backend:**
  - `helpers/productionPipelineSchema.js` — thêm `group_key` vào `buildPipelineStageSelect()` theo
    đúng khuôn cột tùy chọn sẵn có: cờ `pipelineGroupKeyColumnAvailable` + `isPipelineGroupKeyMissingError`
    + `markPipelineGroupKeyColumnMissing`, đăng ký vào bảng retry. DB chưa có cột thì tự bỏ qua, không vỡ.
  - `routes/production.js` — thêm `group_key` vào danh sách field được sửa ở `PUT /pipeline-stages/:id`,
    để sau này gom nhóm lại được từ màn Cài đặt pipeline.
- **Frontend:**
  - `components/SxGroupedKanban.jsx` (mới) — thu lại: mỗi cột lớn là một cột Kanban gộp thẻ của các
    cột nhỏ. Mở ra: lưới, **mỗi dự án đúng một hàng ngang**, thẻ neo trái, các ô phải là từng cột nhỏ.
    Mặc định **thu hết** đúng yêu cầu «dashboard mở lên thì thu các cột vào».
  - `pages/ProductionDashboard.jsx` — thêm view mode `grouped` (nhãn «Gộp cột», icon `Layers`) vào
    `WS_DASH_VIEW_MODES` + `SX_VIEW_MODES`, render `<SxGroupedKanban pipeline={filteredKanbanPipeline}>`.
    Dùng lại đúng dữ liệu đã lọc của Kanban nên mọi bộ lọc hiện có vẫn ăn.
- **GIỚI HẠN đã ghi rõ trên giao diện:** mỗi hàng chỉ sáng ĐÚNG MỘT ô, vì `projects.sx_kanban_column_id`
  chỉ lưu được một cột cho mỗi dự án. Muốn nhiều ô cùng sáng («thùng xong + nhôm đang làm») phải thêm
  bảng `project_substage_status(project_id, stage_id, trang_thai, nguoi_lam, xong_luc)` — CHƯA LÀM,
  đây mới là phần việc lớn, không phải phần giao diện.
- Còn treo chờ anh B.A quyết: (1) `cong_no` 215 dự án có nên là cột lớn thứ 6 không; (2) hai cột lớn
  `ke_hoach` và `duyet` đang 0 dự án — giữ hay bỏ.
- Kiểm thử: parse bằng `@babel/parser` của chính Vite — 2/2 đạt; `node --check` đạt cho 2 file backend.
  CHƯA chạy thử trên trình duyệt.

---

## 2026-09-12 08:35 — Chuẩn bị trả tiến độ SX của HCB về đúng ngày 10/09

- AI thực hiện: Claude. **CHƯA ghi gì vào bảng `projects`** — mới sao lưu + soạn script.
- Yêu cầu của anh B.A: trả tiến độ SX các dự án HCB về đúng vị trí ngày 10/09, **bỏ qua** dự án
  người đã kéo tay sau đó.
- **Phân biệt được «người kéo»:** `sx_pipeline_stage_entered_at` còn nguyên — route kéo thẻ
  (`PATCH /production/projects/:id/stage`) luôn ghi mốc này, còn 588 / 599 / 602 đều KHÔNG ghi.
  Hiện có **49 dự án** mốc >= 10/09 → được bảo vệ. Đáng chú ý 34 cái rơi vào 11/09 16:43–17:24,
  tức ngay sau khi 602 chạy lúc 14:25 — anh em đã kéo tay sửa lại board.
- **Vị trí thật ngày 10/09 KHÔNG còn trong DB.** Đã loại trừ 5 nguồn: `activity_logs` (trống),
  `stage_transitions` (chỉ ghi bàn giao VC, from/to đều NULL — route kéo thẻ SX không ghi vào đây),
  `_bak_20260911_hcb_projects` (chụp SAU 588), `QLCV_Backup` (cũng hậu-588, thiếu 43 dự án),
  `crm_daily_report_snapshots` (chỉ có metric CRM `deal_*`/`lead_*`, không có cột SX).
  → **Chỉ còn đường Point-in-Time Recovery** về mốc trước `2026-09-11 02:46 UTC`.
- **Đã chuẩn bị sẵn:**
  - `_bak_20260912_hcb_projects` — 509 dòng, ảnh chụp trạng thái hôm nay trước mọi thay đổi.
  - `_restore_hcb_sx_10_09` — bảng rỗng chờ nạp (project_code, ten_cot_ngay_10_09).
  - `database/603a_xuat_tien_do_10_09_tu_ban_PITR.sql` — chạy TRÊN bản PITR, sinh ra các câu INSERT.
  - `database/603_hcb_tra_tien_do_ve_10_09.sql` — script áp dụng, **chưa chạy**.
- **Điểm kỹ thuật quan trọng:** phải khớp lại theo **TÊN cột**, không theo id. 588 đã DELETE 7 cột,
  599/600/601 dựng lại nên chúng mang id MỚI — `sx_kanban_column_id` trong bản PITR là id cũ đã chết.
  603 khớp tên trong phạm vi đúng công ty + đúng `workshop_type_id` của từng dự án, và **dừng lại
  không ghi gì** nếu có bất kỳ tên cột nào không khớp được.
- Câu hoàn tác nằm ở cuối file 603.

---

## 2026-09-11 12:10 — Lệnh «/» trong ô bình luận + rà chức năng thông báo nhiệm vụ phát sinh

- AI thực hiện: Claude. Chưa commit (`.git/index.lock` vẫn chặn).
- **Rà soát (đo trên production):**
  - Thông báo giao việc: ĐÚNG — 12/12 nhiệm vụ phát sinh có `crm_assignment_assigned`, số thông báo khớp số người nhận.
  - Bình luận tự động @mention: ĐÚNG. `postSharedWorkspaceAssignmentMentionComment` vào từ commit
    `9a21fd75` (08/09 16:15) nên 11/12 nhiệm vụ cũ không có bình luận — do có TRƯỚC tính năng, không phải lỗi.
    Nhiệm vụ duy nhất sau mốc đó (11/09 03:51) chạy đủ: bình luận + 2 thông báo mention.
  - **LỖI THẬT:** vai trò `primary` («Chịu trách nhiệm chính») không được ghi cho ai **từ 21/08/2026**.
    Mốc đổi rất gắt: 20/08 primary 52 / executor 11 → 21/08 14/62 → 22/08 trở đi **0**.
    30 ngày qua: 1.751 nhiệm vụ, 1.891 lượt gán, **0 primary**.
    Nguyên nhân: `frontend/src/lib/assignmentAssignRoles.js` `DEFAULT_ASSIGN_ROLE = 'executor'` và backend
    `normalizeAssignRole(raw, fallback = 'executor')`. Hệ quả: bình luận tag tất cả ngang nhau, và
    `getPrimaryAssignee()` rơi về `ids[0]` — một người ngẫu nhiên. CHƯA SỬA, chờ anh B.A duyệt.
- **Đã làm — lệnh «/» trong ô bình luận:**
  - `lib/crmCommentMentions.js`: thêm `getActiveSlashState()` + `filterSlashCommands()`. «/» chỉ kích hoạt
    khi đứng đầu dòng hoặc sau khoảng trắng — nếu không thì URL `https://…` và ngày `12/9` đều bật nhầm bảng lệnh.
  - `components/crmCommentMentionUi.jsx`: prop `slashCommands` + `onSlashCommand`; bảng chọn dựng đúng kiểu
    bảng @mention (mũi tên, Enter/Tab chọn, Esc đóng); chọn xong tự xóa đoạn «/từ-khóa». «/» và «@» loại trừ nhau.
  - `components/CommentsPanels.jsx`: chuyển 2 prop qua `CommentThread` → composer; placeholder thêm
    gợi ý «· / tạo công việc».
  - `pages/WorkUnifiedProjectDetailPage.jsx`: khai báo 2 lệnh «Công việc» / «Phát sinh».
- **Tạo tại chỗ (anh B.A yêu cầu):** thêm `components/CommentSlashTaskForm.jsx` — form gọn bật ngay
  trên ô bình luận khi chọn lệnh, không rời trang. Trường: tiêu đề, khối phân công, loại phát sinh
  (+ khối gây lỗi nếu là lỗi nhân viên), hạn xử lý, chọn người nhận dạng chip.
  Gửi thẳng `POST /crm/leads/:id/assignments` — **cùng endpoint với form Giao việc đầy đủ**, nên dùng lại
  nguyên luồng đã kiểm chứng: thông báo từng người nhận + tự đăng bình luận @mention + đồng bộ `crm_tasks`.
  **Form này LUÔN gửi `assignee_roles` với đúng một người `primary`** (nút ★) — vá tại chỗ lỗ hổng
  «không ai chịu trách nhiệm» cho mọi nhiệm vụ tạo bằng đường này. Lỗi gốc ở mặc định hệ thống vẫn còn.
- Kiểm thử: `node --check` đạt cho file .js; JSX kiểm tra cân bằng thẻ/ngoặc ở vùng sửa. 4 file đều thống nhất
  CRLF (0 dòng LF lẻ). CHƯA chạy thử trên trình duyệt.

---

## 2026-09-11 14:25 — HCB Tủ bếp kéo thẻ đúng tiến trình

- 602: theo status / ngày giao-lắp / bàn giao VC. Không đụng cột công nợ.
- Primary: ĐÃ GIAO 70, Mai giao 2, Chuẩn bị xong 3, KCS 9, Ban TP 22.

## 2026-09-11 14:20 — CRM thêm SX: chỉ phụ trách chính

- Trước: CRM→SX ghi cả NV mặc định phân loại, fallback thì cả NV SX công ty.
- Nay: chỉ 1 người chịu trách nhiệm chính; người đó (và phụ trách CRM/VC)
  thêm NV qua chi tiết SX hoặc tab Thành viên.
- API `POST /projects/:id/production-staff`, `DELETE .../production-staff/:userId`.

## 2026-09-11 14:05 — HCB Cánh kính + Cửa trả pipeline cũ

- User: kế hoạch 5 cột chưa thực hiện — khôi phục kính/cửa như trước 589.
- Migration `601_hcb_kinh_cua_restore_pipeline.sql` primary + backup.

## 2026-09-11 13:55 — Luồng tổng quan: Giao nhận

- Đổi nhãn bước đã gộp từ «Giao hàng» → **Giao nhận**.

## 2026-09-11 13:50 — HCB Tủ bếp hoàn tác 5 cột (kế hoạch chưa làm)

- User yêu cầu trả pipeline 15 cột Tủ bếp; công nợ kéo về board Tủ bếp.
- Migration `600_hcb_tubep_restore_pipeline.sql` primary + backup.

## 2026-09-11 13:45 — Hồ sơ liên thông theo module

- Chip CRM / SX / VC trên Work Unified chỉ hiện khi dự án có module đó.
- Panel Hồ sơ liên thông thêm địa chỉ, khu vực, giai đoạn, phân loại xưởng,
  phụ trách, ngày lắp; ẩn khối VC nếu chưa vào vận chuyển/lắp đặt.

## 2026-09-11 13:35 — Báo cáo phát sinh: phân tích + bài học

- Tab Phân tích trên `/management/shared-workspace-report`: theo tuần, tháng,
  bộ phận, dự án/deal, nhân viên, loại phát sinh + thẻ bài học rút kinh nghiệm.
- API `GET /crm/assignments/shared-workspace-report` trả thêm `analysis`
  (tính trên toàn bộ dữ liệu đã lọc, không chỉ trang hiện tại).
- Excel thêm sheet tuần/tháng/bộ phận/dự án/nhân viên/bài học.

## 2026-09-11 13:40 — Tổng quan: cụm nhiệm vụ theo dự án đang mở

- Panel Tổng quan lấy cùng cụm với trang Quản lý nhiệm vụ, lọc `project_id`.
- `GET /work-tasks/project-overview?project_id=` không lọc NV theo nhân viên.

## 2026-09-11 13:30 — Luồng tổng quan gộp Giao hàng

- User chọn 3 thẻ: Chuẩn bị vật tư / Giao hàng / Lắp đặt → gộp thành «Giao hàng».
- `buildDeliveryFlow` collapse slug materials+delivery+installation.
- Work Unified `stages` + lọc `stage=` theo cùng map.

## 2026-09-11 13:25 — HCB: hạn Kanban từ ngày lắp + bộ mẫu 5 cột

- User: «hiện chỉ là kế hoạch» — panel chưa ghi hạn thẻ; Tủ bếp vẫn pipeline cũ (588 no-op).
- 599 gom Tủ bếp 5 cột (ILIKE KCS). 598 gắn bộ theo cột; backfill hạn 123 thẻ primary.
- Kéo cột / đổi ngày lắp ghi `sx_kanban_deadline_at`.

## 2026-09-11 10:00 — HCB Cánh kính/Cửa cùng mẫu 5 cột

- User báo board vẫn pipeline cũ: lọc «Tất cả» / Cánh kính còn cột Hoàn thành, Chờ giao…
- 589 đổi Cánh kính + Cửa giống Tủ bếp; công nợ trùng đã gom. F5 Kanban SX.

- Pipeline Tủ bếp: Tiếp nhận, Kế hoạch, Duyệt, Gia công (6 việc), Hoàn thiện.
- Công nợ tách phân loại riêng; giao/lắp ở VC/LĐ.
- Kế hoạch SX tính từ ngày lắp. Migration `588_hcb_tubep_kanban_to_hoan_thien.sql`.

## 2026-09-11 09:35 — Tiến độ Unified nhiều xưởng SX/VC

- Tab Tiến độ: một stepper / xưởng SX và / nơi VC-LĐ; ngày `dd/mm/yyyy` dưới cột.
- `listDealProductionProjects` thêm cột Kanban SX/VC để phân luồng.

## 2026-09-11 09:30 — Tổng quan: chỉ deal đã ký HĐ, bỏ việc lead

- `work-overview` lọc `postContract` (mốc won / ký HĐ). Việc hôm nay/quá hạn
  không còn `CRM-Lead`. KPI khách mới = deal đang ở giai đoạn đã ký, tạo trong kỳ.

## 2026-09-11 09:25 — Gỡ nút sidebar Dashboard dự án

- Xóa `Dashboard dự án` khỏi nhóm Làm việc (`Sidebar.jsx`). Trùng URL với Work Unified.

## 2026-09-11 09:20 — GCCK hoàn thành SX không hiện trễ hạn

- Forecast Work Unified bỏ «Trễ hạn» khi dự án loại Cánh kính / tên `GCCK-` đã ở cột
  SX Hoàn thành (hoặc đã giao). Helper `projectForecast.js`.
- Tủ bếp/cửa và GCCK chưa xong vẫn tính trễ theo ngày lắp.

## 2026-09-11 09:10 — Tổng quan công việc dùng cùng tập Work Unified

- `GET /management/work-overview`: số dự án đang làm + danh sách cần chú ý lấy từ
  `queryWorkUnifiedList` (cùng nguồn `/work-unified`, gồm deal đặt xưởng khác và
  lọc khu vực theo deal CRM).
- Doanh thu / khách mới / việc quá hạn giữ nguyên nguồn cũ.

## 2026-09-11 09:35 — Bộ lọc Page/Nguồn ở trang Facebook rò dữ liệu chéo hệ sinh thái

- AI thực hiện: Claude.
- Triệu chứng (người dùng báo): đăng nhập `quantri.hst@nextgo.vn` (HST NextGo) nhưng ô
  "— Nguồn (tất cả Page) —" ở CRM → Facebook → Danh bạ liệt kê đủ 11 Page của HST mặc định
  (Phúc Đạt, Vạn Phú Thành, Metalla…) lẫn Page NextGo.
- Nguyên nhân gốc (đã đo): `routes/facebook.js` KHÔNG mount `enforceTenantContext`.
  Auth ở router này là per-route (`r.get('/x', authMiddleware, ...)`) nên `r.use()` cấp router
  sẽ chạy TRƯỚC khi có `req.user` — không thể mount middleware đó như `routes/ecosystem.js`.
  Hệ quả: `req.tenantContext` luôn undefined → `isTenantScopeEnforced(req)` luôn false →
  admin không có `company_id` rơi thẳng vào nhánh `return { mode: 'all' }` của
  `resolveFacebookPageScope`. Các nhánh lọc theo tenant ĐÃ CÓ SẴN ngay bên trên nhưng
  chưa bao giờ chạy.
- Sửa:
  - `backend/src/routes/facebook.js`: thêm `attachTenantContext` (từ `middleware/tenantGate`)
    và helper `ensureFacebookTenantContext(req, res)`; gọi ở dòng đầu của
    `resolveFacebookPageScope`. Không đổi logic lọc — chỉ bật nó lên.
  - `frontend/src/pages/FacebookPage.jsx`: `GET /api/facebook/page-sources` nay gửi kèm
    `fbCompanyQs` và phụ thuộc `[fbCompanyQs]` (trước để `[]`), để chọn công ty ở đầu trang
    cũng thu hẹp danh sách nguồn.
- Phạm vi ảnh hưởng (đo trên prod): 17 endpoint FB dùng `resolveFacebookPageScope` được sửa
  cùng lúc. Tài khoản đổi hành vi: 19 admin có `tenant_id`.
  - 4 admin HST NextGo: 11 Page → 1 Page (`1102202982968909`), 10 nguồn → 1 nguồn.
  - 13 admin HST mặc định: mất Page NextGo, còn 11 Page / 10 nguồn của HST mình.
  - 2 admin HST `abc1` và `Xưởng Anh Hoang Nguyen`: 11 Page → 0 (đúng, 2 HST này không có Page).
  - 3 admin `tenant_id = NULL` và 1 `platform_admin`: KHÔNG đổi (`enforced=false` → `mode:'all'`).
  - 4 HST đều `is_active = true` → `assertTenantActive` không sinh 403 mới.
- Kiểm thử: `node --check backend/src/routes/facebook.js` đạt. CHƯA restart backend nên
  CHƯA xác nhận trên môi trường chạy — cần restart rồi đăng nhập lại `quantri.hst@nextgo.vn`.
- Rủi ro còn lại (CHƯA sửa, báo để quyết định): 65/82 endpoint FB có `authMiddleware`
  nhưng KHÔNG gọi `resolveFacebookPageScope`. Đáng lo nhất vì ghi/đọc chéo HST:
  `PUT/DELETE /contacts/:id`, `POST /contacts/:id/create-lead`, `POST /batch-create-leads`,
  `GET /comments`, `GET /lead-ads`, `POST /dedup-leads`, `POST /sync-contact-phones`.

---

## 2026-09-11 09:00 — Work Unified: deal con không che bình luận deal gốc

- TB-2026-800: `DEAL-2026-1515` (Hucabi, 0 comment) vs `DEAL-2026-1459` (Phúc Đạt, 60).
  Bundle lấy deal `updated_at` mới nhất → tab Bình luận trống. Không phải quyền NV Thành.
- Sửa `pickBundlePrimaryLead` = `sortProjectCrmDeals` (deal gốc trước); đếm comment theo
  thread cha+con. FE dùng `pickPrimarySxCrmDeal`.

## 2026-09-11 — NextGo: khôi phục quyền hệ sinh thái + chặn rò chéo tenant

- AI thực hiện: Claude (Opus 5). Yêu cầu của anh B.A: «lead không về» và «tk nào không vào được hệ sinh thái».

### Kết luận 1 — lead KHÔNG hỏng
- Trang FB NextGo đặt `default_target_type = 'deal'` từ **17/06/2026** (anh B.A xác nhận cố ý).
  Bản ghi `type='lead'` cuối cùng: 19/06; tổng cộng chỉ có 1. Dữ liệu vẫn về đều
  (54 bản ghi/7 ngày). Tab «Lead» trống là hệ quả cấu hình. **Không sửa.**
- Phát sinh: 2 deal ngày 10/09 (nguồn Zalo) rơi vào công ty NextGo **CŨ** `87479a83`, giao cho
  `tranthingochan+oldhst@` (tài khoản đã tắt). Nguồn Zalo vẫn trỏ công ty cũ — **chưa xử lý**.

### Kết luận 2 — 2 tài khoản bị chặn, đã sửa bằng DỮ LIỆU
- `getUserAccessibleUnits` (routes/ecosystem.js) cho qua `['admin','manager']`; role khác phải có
  dòng trong `ecosystem_unit_members`, không có thì trả mảng rỗng.
- Chuyển tenant đã chép `user_companies` nhưng **KHÔNG chép `ecosystem_unit_members`**:
  cả 5 đơn vị NextGo đều 0 thành viên; 4 tài khoản `+oldhst` (đã tắt) mỗi cái có 1.
- Đã chép lại y nguyên phân bổ cũ (`unit_role=member`, `can_manage_children=false`):
  Ngọc Trinh + Ngọc Hân → Phòng Kinh doanh `4471ee38`; Hải Hiền → Xưởng sản xuất `cb4bcf59`;
  Biện Anh Pháp → Phòng Marketing `50c2522f`. Dùng `ON CONFLICT DO NOTHING`, 4 dòng.
- Kiểm chứng: **Ngọc Trinh** và **Hải Hiền** từ BỊ CHẶN → VÀO ĐƯỢC.

### ĐÍNH CHÍNH — tôi nói quá ở phiên trước
- Tôi đã báo «quantri.hst@nextgo.vn nhìn thấy cả hệ sinh thái tenant khác». **Sai một nửa.**
  `GET /units` (trang hệ sinh thái) CÓ lọc tenant qua `addEcosystemUnitTenantFilter`, và
  `r.use(enforceTenantContext)` bật cho cả router; cả 5 user NextGo đều có `tenant_id`, không ai
  là platform_admin ⇒ **tenantContext.enforced = true**, danh sách đơn vị KHÔNG rò.
  Tôi kết luận từ mỗi hàm `getUserAccessibleUnits` mà không đọc route gọi nó.

### Chỗ rò THẬT (đã vá) — routes/ecosystem.js
- `getUserAccessibleUnits` nhánh admin/manager trả **mọi đơn vị đang hoạt động của TOÀN hệ thống**,
  không lọc tenant. Hai nơi dùng: `GET /my-units` (`accessible_unit_ids`) và
  `middleware/permission.js:160` — nơi này mới nặng: admin tenant này được tính **có quyền theo
  đơn vị** trên đơn vị của tenant khác.
- Đã thêm `tenantScopeOfUser(userId, userRole)` dùng `resolveTenantIdForUser` +
  `getTenantCompanyIds`, lọc y hệt khuôn `addEcosystemUnitTenantFilter`. Bỏ qua khi
  platform_admin hoặc user chưa gắn tenant — đúng như `attachTenantContext`.
- `isPlatformAdmin` lấy từ `helpers/adminRole` đã import sẵn (tránh khai báo trùng).
- Số đo trước/sau:
  · 3 admin NextGo: **54 → 13** đơn vị (đúng 13 của NextGo)
  · admin tenant mặc định (VPT/Metalla/tubep): **54 → 41** (đúng của họ, không mất gì)
  · 2 user không phải admin: giữ nguyên 1 đơn vị
  · Toàn hệ thống **0** trường hợp user là thành viên đơn vị của tenant khác ⇒ nhánh membership
    không cần đổi.
- Kiểm thử: `node --check` đạt; nạp được `routes/ecosystem` và `middleware/permission`
  (vòng require vẫn OK).

### Chưa làm
- 46 user toàn hệ thống vẫn bị chặn khỏi hệ sinh thái vì danh sách trắng cứng
  `['admin','manager']` (gồm cả `platform_admin`). Anh B.A yêu cầu **chỉ** xử lý chuyện
  chéo tenant, nên để nguyên.
- Nguồn Zalo trỏ công ty NextGo cũ.


## 2026-09-10 14:35 — Vá chỉ mục bình luận HST mặc định

- Quét DB: comment CRM HST mặc định còn đủ (27.653 dòng, không bị delta
  NextGo xóa). `project_comments` vốn ít (36) vì SX/VC đọc `crm_lead_comments`.
- Lỗi hiển thị: `GET /crm/lead-comments/index` không phân trang → PostgREST
  cắt 1.000 dòng, chỉ ~110/4.668 deal có badge. CRM gửi 2.000 UUID/URL.
- Sửa: `fetchAllByIds` trên index CRM + dự án; FE CRM chunk 200 id.

## 2026-09-10 14:10 — Xóa deal trùng Anh Tám DEAL-2026-1518

- Deal Minh tạo trên Metalla (`DEAL-2026-1518`) trùng khách của Nghĩa.
  Đã xóa (không có dự án SX). Giữ `LEAD-2026-1252` Huỳnh Văn Nghĩa / VPT.
- Snapshot thùng rác; script `delete-dup-anh-tam-deal-1518.js`.

## 2026-09-10 10:45 — Số đếm lọc Work Unified khớp dòng hiển thị

- Danh sách khi lọc NV/KV/hạn/tìm không còn cắt 20/trang — thẻ đếm = số dòng.
- Khớp NV theo deal CRM; sale/PM chỉ khi không có deal. Bỏ lọc lại phía FE.
- Deal scan `type=deal`. Test: `node tests/work-unified-user-filter.js`.

## 2026-09-10 09:20 — Chuyển Anh Tám từ Cửa Phúc Đạt về HCB Tủ bếp

- Deal gốc VPT / Metalla `TB-2026-740`. Bản Phúc Đạt `TB-2026-767` (Cửa) hủy;
  deal `DEAL-2026-1401` → Thua.
- Đặt xưởng Hucabi · Tủ bếp: `TB-2026-827`, cột Tiếp nhận, Sang Thiết Kế VPT 1.
- Giữ HCB Cánh kính `TB-2026-765`. Script `reclassify-anh-tam-to-hcb-tu.js`.

## 2026-09-10 09:10 — Lọc nhiều NV Work Unified hiện đúng người

- Bỏ response cũ khi đổi NV (tránh bảng Showroom ghi đè kết quả đã lọc).
  Khớp đúng NV deal/sale, không lấy thợ SX. FE lọc lại trên trang đang xem.
- Test: `node tests/work-unified-user-filter.js`.

## 2026-09-10 08:45 — Lọc nhiều nhân viên trên tổng quan dự án

- Bộ lọc Work Unified đổi dropdown NV thành danh sách checkbox (tìm tên, chọn
  đang hiện, bỏ chọn). Danh sách + Kanban (và các view cùng API) gửi
  `user_ids` CSV.
- Backend `GET /management/work-unified` và `/work-unified/search` lọc OR theo
  nhiều UUID (`user_ids` / `user_id`). Helper `workUnifiedUserFilter.js`.
  Test: `node tests/work-unified-user-filter.js`. Ô nhảy chi tiết dùng cùng panel.

## 2026-09-10 00:55 — Vá nhật ký hoạt động HST NextGo

- Rà nốt 22 bảng danh mục/cấu hình còn lại: đều khớp giữa công ty cũ và HST mới.
- Khoảng trống cuối: `unified_task_history`. Thêm
  `backend/scripts/fix-nextgo-history-log.js` — ghép thực thể (việc CRM 6.566,
  việc SX 737, giao việc 328) theo cha + created_at + tiêu đề, chép 1.318 dòng
  thay đổi và sửa created_at cho 7.303 dòng «created» do clone sinh ra.
- Sau vá: log HST mới trải 12/06 → 09/09, mỗi loại sự kiện ≥ bên cũ (created
  9.670, deleted 995, assignee_changed 257, status 51, completed 42, deadline 11).

## 2026-09-10 00:40 — Bù lịch sử NextGo mà clone bỏ sót

- Đối chiếu công ty cũ ↔ HST mới trên mọi bảng có `company_id` và các bảng con
  của lead/dự án: phát hiện clone không chép bình luận, tài liệu, tệp việc,
  giao việc, sự kiện, snapshot báo cáo ngày, kế hoạch phòng ban, KPI.
- Thêm `backend/scripts/copy-nextgo-history.js`: dựng map việc CRM theo
  (lead + created_at + title), chèn bản ghi mới với FK ánh xạ, vá `parent_id`
  bình luận sau khi có id mới, chèn lại từng dòng khi lô vướng ràng buộc trùng,
  lọc idempotent cho KPI, kèm dry-run và file hoàn tác (xoá theo id).
- Kết quả: 5.746 hàng chèn. HST mới khớp dump (bình luận 2.414, tệp việc 385,
  giao việc 328, sự kiện 22, snapshot 1.116, kế hoạch 20, KPI 1.622 / 146).
  Bỏ qua `trash_items` (97) và 60 điểm KPI đã do HST mới tự tính.

## 2026-09-10 00:05 — Kiểm tra FB/Google Form theo HST + chuyển delta NextGo

- Kiểm tra dữ liệu thực: cấu hình Fanpage và key `NextGo NV Yến` đều trỏ công ty
  NextGo HST mới, nhưng lead thực tế từ 21/08→09/09 (141 deal FB/Zalo/nhập tay)
  vẫn rơi vào công ty NextGo cũ vì NV còn làm trên hệ cũ; chưa có lượt FB/form
  nào chạy qua cấu hình mới để kiểm chứng.
- Thêm `backend/scripts/migrate-nextgo-delta.js`: dò delta theo bản đồ id clone,
  ánh xạ FK (công ty, pipeline, stage, khu vực, nguồn, người dùng, phòng ban),
  khớp danh mục theo tên cho phần clone không phủ, gán bot HST khác về admin HST
  NextGo, kèm dry-run và file hoàn tác.
- Đã chạy `--apply`: 5.258 bản ghi cập nhật, 0 lỗi. Kiểm chứng: công ty cũ 0 bản
  ghi sau mốc clone, HST mới 766 deal, 0 tham chiếu chéo HST.
- Lưu ý vận hành: `npm run dev` local dùng chung DB production nên lịch bật/tắt
  auto-pipeline FB bị ghi trùng đôi — tắt khi không dùng.

## 2026-09-09 20:05 — Rà soát cách ly HST NextGo + kiểm tra tài khoản NV

- Quét động mọi bảng có `company_id` (84 FK về `users`/`companies`): HST `nextgo`
  chỉ 1 công ty, 0 liên kết chéo sang HST khác (cả hai chiều).
- BE `external.js`: `/project-deadlines` giới hạn công ty theo HST của chủ key
  (không key → HST mặc định), thêm `resolveDefaultTenantId` ở `tenantScope.js`.
- BE `apiKeyAuth.js` + `mcpGateway.js`: key `all_companies` chỉ đọc trong HST của
  chủ key (`tenant_company_ids`); tool báo cáo nhận `company_whitelist` từ key.
- DB (chỉ bản ghi NextGo): tắt `saletest.ui@nextgo.vn`, `sanxuattest.ui@nextgo.vn`;
  `created_by` của `crm_referrers`/`drive_roots` NextGo → `quantri.hst@nextgo.vn`.
- Kiểm thử: 7 tài khoản HST NextGo đăng nhập OK, chỉ thấy 1 công ty / 2 KV / lead
  NextGo; HST mặc định giữ nguyên (95 thông báo hạn, 5 công ty, MCP không thấy
  công ty HST NextGo).

## 2026-09-09 19:40 — HST NextGo chỉ lấy cài đặt Google Form NextGo

- Nguồn / phân loại CRM và API key lọc tenant; form ngoài tìm `Google Form` theo `company_id` của key.
- Key `NextGo NV Yến` chuyển sang công ty / KV / pipeline / Yến bản HST mới (giữ token).
- FE nguồn: ẩn «Chung toàn hệ thống» khi có tenant.

## 2026-09-09 19:30 — HST NextGo chỉ lấy cài đặt Facebook NextGo

- BE `facebook.js`: tenant lọc Page / page-sources / auto-pipeline / image-sets;
  PUT/DELETE Page và bộ ảnh chỉ trong tenant; NextGo không bật công tắc tổng;
  auto-lead config tách theo tenant.
- FE: bỏ «Tất cả công ty» khi có tenant; ẩn master schedule trên HST NextGo.

## 2026-09-09 19:20 — Bộ lọc HST NextGo lẫn công ty HST khác

- Cache `GET /ecosystem/units` (và levels/stage-groups) `scope: role` — mọi
  `admin` dùng chung cache, admin NextGo nhận cây HST mặc định.
- Đổi `scope: company` (theo `tenant_id` khi tenantGate enforced).
- `available-companies` / `available-departments` lọc theo tenant.

## 2026-09-09 19:15 — Đưa HST NextGo vào dùng + admin cao nhất

- Script `provision-nextgo-ecosystem-live.js --apply`.
- Admin tenant: `quantri.hst@nextgo.vn` (không company_id).
- 6 NV chuyển email sang user HST mới; user cũ `+oldhst` tắt.
- Fanpage `1102202982968909` → company HST mới; remap contact lead_id khi có map.
- Không xóa dữ liệu HST mặc định. Hộp thư Yến resolve theo tenant nextgo.

## 2026-09-09 19:00 — Đồng bộ dump NextGo 100%, chờ đích

- Export lại; verify khớp nguồn (739 lead, 8325 crm_tasks, 16050 tin FB).
- Không import: chỉ có qlycv + QLCV_Backup.
- Không xóa / freeze / webhook hệ cũ.
- File: `verify-nextgo-completeness.js`, `docs/ops/nextgo-instance/SYNC-STATUS.md`.

## 2026-09-09 15:40 — Ghim góc phải tối đa 20

- AI: Cursor.
- `MAX_PINNED_PROJECTS` 5 → 20.

## 2026-09-09 14:10 — Harden lưu deadline (CRM + SX)

- AI: Cursor.
- FE: sau PATCH cập nhật lead tại chỗ qua `onLeadPatch`; `onUpdate` lỗi không còn alert «Lỗi lưu deadline».
- BE: bọc comment / emit / effective deadline; `logDealDeadlineChangeComment` không throw.

## 2026-09-09 13:55 — Ghim góc phải trên CRM và VC/LĐ

- AI: Cursor.
- CRM chi tiết: nút Ghim luôn hiện (lead chưa có dự án cũng ghim được).
- Menu `⋯` thẻ Kanban CRM / SX / VC-LĐ: mục «Ghim góc phải».
- Chi tiết module tùy chỉnh: thêm `PinProjectButton`.

## 2026-09-09 13:50 — Sửa lỗi lưu deadline thẻ CRM

- AI: Cursor.
- Nguyên nhân: `LeadInfoPanel` gọi `setLead` (không tồn tại) sau PATCH thành công
  → alert «Lỗi lưu deadline» dù DB đã ghi (LEAD-2026-809, hạn 22/9).
- FE: bỏ `setLead`, đóng modal + `onUpdate`.
- BE: bọc comment sau lưu; so sánh hạn theo timestamp để khỏi ghi lịch sử trùng.

## 2026-09-09 12:10 — Ghim dự án xuống góc phải

- AI: Cursor.
- FE: `pinnedProjects.js` (localStorage, tối đa 5), `PinProjectButton`,
  `PinnedProjectsWidget` dạng danh sách ẩn/hiện + bỏ ghim.
- Nút ghim: Work Unified, ProductionDetail (SX/VC), ProductionProjectDetailPage,
  LeadDetail (deal đã có dự án).
- `App.jsx`: widget luôn gắn (kể cả CRM-only).
- Đã kiểm TB-2026-538: ghim Work Unified, ẩn/hiện, còn trên CRM dashboard,
  bấm danh sách mở lại; nút Bỏ ghim hiện trên `/sx/projects/:id`.

## 2026-09-09 09:00 — Nhật ký công trình: lọc công ty / khu vực / NV

- AI: Cursor.
- FE: dropdown Công ty / Khu vực / Nhân viên trên `/management/project-logs`.
- Tìm CT truyền `company_id`, `region_id`, `user_id` vào `work-unified/search`.
- API log lọc theo người thao tác (`actor_id`); khu vực `__none__` = NV chưa gán KV.
- Excel ghi thêm các bộ lọc này.

## 2026-09-09 08:55 — Trang nhật ký công trình

- AI thực hiện: Cursor.
- API `GET /api/management/project-logs` gom unified_task_history, activity_logs,
  crm_activities, bình luận deal, hạn CRM, phát sinh Không gian chung.
- UI `/management/project-logs`: tìm CT, tab, phân trang, xuất Excel.
- Menu: Dự án và công việc, CRM, SX, VC-LĐ.
- Không sửa `management.js` / `logistics.js`.
- Kiểm thử trình duyệt TB-2026-819: 105 log; tab nhiệm vụ còn 70 dòng.

## 2026-09-09 09:00 — Chuẩn bị tách instance NextGo (chưa cắt)

- AI: Cursor. Đo prod: 734 lead, 32 project, 8 user, 15997 tin FB; 0 xuyên công ty.
- Script: `export-nextgo-instance.js`, `import-nextgo-instance.js`,
  `copy-nextgo-storage.js`, `freeze-nextgo-source.js` (cần NEXTGO_CUTOVER=YES).
- Docs: `docs/ops/nextgo-instance/*`. SQL 597 chỉ instance trống.
- Dump gitignore: `backend/uploads/_nextgo_instance_export/`.
- Không freeze, không import đích, không đổi webhook.

## 2026-09-09 08:30 — Chọn vai trò thành viên khi tạo phát sinh Không gian chung

- AI thực hiện: Cursor.
- Form tạo phát sinh trên tab Không gian chung (Dự án, CRM, SX, VC-LĐ) và
  modal Giao việc Không gian chung: dropdown vai trò từng NV + nút Áp dụng hàng loạt.
- Payload `assignee_roles` gửi kèm `assignee_ids`. Backend sẵn có
  `assignmentAssigneeRoles.js` — không đổi API.
- File: `frontend/src/lib/assignmentAssignRoles.js`,
  `LeadMemberAssignmentsPanel.jsx`, `CRMAssignmentsPage.jsx`.
- Chưa xác minh trên trình duyệt.

## 2026-09-08 16:52 — Thẻ SX lấy người chịu trách nhiệm sản xuất của công ty

- AI thực hiện: Cursor.
- **BÁO TRƯỚC**: tiếp `enrichTaskModuleOwners` trong `workTasks.js`.
- TB-2026-045 không có `production_person_id`, staff chỉ admin hệ thống → thẻ
  «Chưa có người phụ trách». Fallback đúng: `production_handover_settings.responsible_user_id`
  (Phúc Đạt = Minh sản xuất cửa).
- Không đụng `management.js` / `logistics.js`.

## 2026-09-08 16:48 — Không lấy admin hệ thống làm phụ trách SX trên tổng quan

- AI thực hiện: Cursor.
- **BÁO TRƯỚC**: sửa `enrichTaskModuleOwners` trong `backend/src/routes/workTasks.js`.
- TB-2026-029: `production_person_id` trống, `project_production_staff` chỉ còn
  Trương Trọng Thành → thẻ Sản xuất hiện TT.
- Admin hệ thống (`admin` không `company_id`) không còn dùng làm fallback phụ trách
  module SX/VC. Không đụng `management.js` / `logistics.js`.

## 2026-09-08 16:40 — Tổng quan nhiệm vụ tải công ty trước

- AI thực hiện: Cursor.
- Prefetch `GET /companies` khi mở sidebar / hover menu nhiệm vụ.
- Trang `ProjectTasksOverviewPage` chờ danh sách công ty, tự chọn công ty, rồi
  gọi `GET /work-tasks/project-overview` kèm `company_id`.
- Backend `workTasks.js` nhận `company_id` cho admin hệ thống.

## 2026-09-08 16:28 — Tách việc Không gian chung khỏi cột CRM Sản xuất

- AI thực hiện: Cursor.
- **BÁO TRƯỚC**: sửa `backend/src/routes/workTasks.js` — `projectOverviewCategoryId`
  và `categoryFor` trên `GET /project-overview` (+ remind cùng hàm).
- Nguyên nhân TB-2026-738: `crm_tasks.stage_slug = shared_workspace` nhưng
  `pipeline_stage_id` trỏ cột «Sản xuất.» → thẻ Sản xuất hiện người của việc PS.
- Không đụng `management.js` / `logistics.js`.

## 2026-09-08 16:20 — Commit + push WIP còn lại trong ngày

- AI thực hiện: Cursor.
- Gom working tree hôm nay lên `feat/project-phat-sinh-report`: deadline liên module,
  query-guard, tổng quan nhiệm vụ, docs/audit, migration 576 và 591–596.
- Cố ý không commit file tạm/upload/`_to_delete` và SQL trùng số `main` (400–402, 580).
- Việc còn lại: sửa 1 dòng 596 trước khi áp production (REVIEW-596).

## 2026-09-08 22:45 — Sửa 5 lỗi query-guard (BÁO TRƯỚC theo AI-004)

- AI thực hiện: Claude (Opus 5). Trả lời [`BAO-CAO-loi-query-guard-2026-09-08.md`](./BAO-CAO-loi-query-guard-2026-09-08.md) của Cursor.
- **BÁO TRƯỚC vùng dùng chung**: tôi sẽ sửa `backend/src/routes/management.js` ở 4 chỗ —
  `listSelect` (dòng ~1886), nhánh `focus === 'overdue_crm'` (~1930), `attachTaskAndDocCounts`
  (~492), và `loadSxPipelineSummary` (~545-560). Cursor đừng sửa file này tới khi tôi ghi xong.
- Đã kiểm chứng lại toàn bộ số của Cursor trên prod — **đúng hết**, hai chỗ nặng hơn:
  `tasks` đang mở = **2213** (khớp); notification chưa đọc = 130.145; nhưng
  **41 user vượt 1000 thông báo, cao nhất 9.503**; và `wonIds` union thực tế
  **713 + 525** id, vượt xa mốc gãy 643.
- Ba hiệu chỉnh cho báo cáo của Cursor:
  1. P2 notification chỉ là **nhánh dự phòng** — `pgDashboardNotificationStats` chạy trước và
     `return` sớm. Vẫn sửa, nhưng không cấp bách như mô tả.
  2. `getWonDealProjectIds(companyId = null)` **đã có sẵn** tham số companyId
     (`workshopKanban.js:249`) — không cần đổi chữ ký.
  3. `.in('id', wonIds)` có **hai** chỗ (dòng 549 và 559), không phải một.
- Ảnh terminal của anh B.A cho thấy nặng hơn báo cáo: `/api/management/deals` trả
  **HTTP 500** (213 ms, 50 byte), không phải danh sách rỗng.
- **Lỗi của tôi, Cursor bắt đúng**: patch 0003 sửa `crm_leads.budget` ở dòng 339 nhưng
  BỎ SÓT dòng 1886 vì `listSelect` là **biến template string** mà `audit.py` chỉ đọc chuỗi
  literal trong `.select()`. Và bộ quét cột-trong-bộ-lọc không bắt được `.lt('deadline')`
  dòng 1930 vì nó nằm trong `applyDealQueryFilters(query)` — `.from('crm_leads')` ở hàm khác,
  ngoài cửa sổ 800 ký tự. Query-guard bắt được cả hai trong một phiên dev; hai lần quét
  tĩnh của tôi đều trượt. Sẽ vá `audit.py` lần theo biến.
- Quyết định về `deadline`: dùng **alias PostgREST** `deadline:kanban_deadline_at` —
  MỘT cột thật, không `COALESCE` rải (AI-002). `applyDealRowFilters` dòng 386 đọc
  `d.deadline` nên giữ nguyên tên trường ra ngoài. Khi Cursor nối
  `crm_effective_deadline_at` vào route này thì thay alias bằng lời gọi policy.
- **ĐÃ SỬA XONG (22:58):**
  1. `management.js:1885` `listSelect` — bỏ `budget`, `deadline`; thêm alias
     `deadline:kanban_deadline_at` + `expected_close_date`. Kiểm chứng trên prod: câu
     select mới chạy ra hàng, không 42703.
  2. `management.js:1930` `focus=overdue_crm` — lọc theo `kanban_deadline_at` (tên cột thật;
     alias không dùng được trong filter). `applyDealRowFilters:386` vẫn đọc `d.deadline` như cũ.
  3. `management.js:492` — bỏ `d.budget` khỏi `value:`.
  4. `management.js:549 + 559` — hai `.in('id', wonIds)` chuyển sang `fetchAllByIds`
     (tự chia lô). Không đổi phạm vi «won».
  5. `dashboard.js:1275` — 2.213 task active phân trang bằng `fetchAllPagesParallel`,
     bọc lại `{ data }` nên chỗ đọc `allActiveTasks.data` không đổi.
  6. `dashboard.js:209` — nhánh dự phòng badge thông báo bỏ `.limit(1000)`, phân trang.
  7. `supabaseQueryGuard.js` — bọc `PostgrestClient.prototype.rpc`; nhãn bảng của lỗi RPC
     giờ là `rpc:<tên hàm>` thay vì `rpc` + site `khong-xac-dinh`.
  8. `audit/audit.py` — lần theo `const X = \`...\`` khi gặp `.select(X)`. Đã chứng minh
     bản vá bắt được đúng `budget` và `deadline` trên đoạn code gốc.
- Kiểm thử: `node --check` 3 file JS đạt · `test:query-guard` **8/8 ĐẠT** (2 mục hồi quy vẫn xanh)
  · `test:role-enum` ĐẠT · `test:perf-retention` **24/24 ĐẠT**.
- Chưa xác minh: chưa gọi được `GET /api/management/deals` thật (máy ảo của tôi không có
  mạng ra ngoài). **Nhờ anh B.A restart backend rồi mở lại tab tổng quan** — kỳ vọng 200
  thay vì 500, và bảng tổng hợp query-guard sau 15 phút không còn dòng
  `COT-KHONG-TON-TAI crm_leads` lẫn `FILTER-ID-QUA-DAI projects`.
- `management.js` đã trả lại vùng dùng chung — Cursor sửa tiếp được.
- **CỐ Ý chưa làm**: không truyền companyId vào `getWonDealProjectIds`. Cursor đã cảnh báo
  «không thu hẹp ý nghĩa won nếu chưa đo intake xưởng» — tôi đồng ý, nên chỉ **chia lô**
  `.in()`, không đổi phạm vi. Việc scope để lại sau khi có số đo intake HCB.


## 2026-09-08 16:10 — Admin hệ thống sửa/xóa phân công Không gian chung

- AI thực hiện: Cursor.
- Yêu cầu: Trương Trọng Thành (admin hệ thống, `trongthanh0800@gmail.com`) được sửa/xóa
  nhiệm vụ Không gian chung do người khác tạo.
- File: `helpers/assignmentManageAccess.js`, `routes/crmAssignments.js`,
  `frontend/src/lib/assignmentManageAccess.js`, `LeadMemberAssignmentsPanel.jsx`,
  `CRMAssignmentsPage.jsx`.
- Không đụng `management.js` / `logistics.js`.
- Kiểm thử: `node tests/assignment-manage-access.js`.

## 2026-09-08 15:40 — Ghi nhận lỗi query-guard + 42703 (chưa sửa)

- AI thực hiện: Cursor. Việc sửa: giao Claude.
- Log local: `[management/deals] column crm_leads.budget does not exist` + 5 dòng query-guard.
- Đo DB: `crm_leads` không có `budget`/`deadline`. Active tasks 2213; deals có project_id 657.
- Tài liệu: [`BAO-CAO-loi-query-guard-2026-09-08.md`](./BAO-CAO-loi-query-guard-2026-09-08.md).
- Chưa đụng `management.js` / `dashboard.js`.

## 2026-09-08 15:35 — Push trang phát sinh module Dự án

- AI thực hiện: Cursor.
- Phạm vi: trang Báo cáo phát sinh + Setup phát sinh trên module dự án
  (`/management/shared-workspace-report`, `/management/shared-workspace-settings`).
- Không gộp trang Tổng quan nhiệm vụ (`ProjectTasksOverviewPage`) hay chính sách deadline.
- Kiểm thử: `node tests/shared-workspace-report.js` — 6 assertions passed.
- Nhánh: `feat/project-phat-sinh-report`.

## 2026-09-08 22:05 — Rà soát migration 596 trước khi phát hành

- AI thực hiện: Claude (Opus 5).
- Yêu cầu: đọc `CURRENT.md`/`WORKLOG.md`/`DECISIONS.md` và đánh giá kế hoạch deadline liên module.
- Không sửa code. Chỉ đối chiếu working tree với DB production `qlycv`.
- **Phát hiện CHẶN PHÁT HÀNH**: `project_deadline_board` (bảng deadline VC) gọi
  `project_deadline_at(p)`, mà 596 định nghĩa lại hàm này thành chuỗi **Sản xuất**
  (không có `install_date`). Đo trên 671 dự án đang chạy: **86 dự án trên bảng VC mất
  hạn hoàn toàn**, **114 dự án hiện sai hạn**. Sửa: gọi
  `project_module_deadline_at(p, 'logistics')`.
- Xác nhận `CURRENT.md` ghi đúng: 596 **chưa** áp lên production
  (`pg_get_functiondef` trên prod vẫn là định nghĩa cũ).
- Xác nhận điểm tốt: 596 chỉ `CREATE OR REPLACE FUNCTION`, không đổi schema; và
  **không có index biểu thức nào** trên `project_deadline_at` nên không phải reindex.
- Đo được mức lệch JS↔SQL hiện tại: 117 dự án lệch chuỗi SX, 93 lệch chuỗi VC,
  **9 dự án hai bên ra hai ngày khác nhau**. Áp 596 (sau khi sửa) sẽ dứt điểm.
- Kiểm thử: `node tests/module-deadline-policy.test.js` → `module-deadline-policy: OK`.
  Nhưng chưa có `npm script`, và test cần `.env` + mạng nên không chạy được trong CI.
- Chưa làm/rủi ro: 4 hàm MỚI trong 596 mặc định `EXECUTE TO PUBLIC` → anon gọi được;
  596 chưa có file rollback; đo thấy **184 bảng** có policy `USING(true)` cho `public`
  mà `anon` có cả SELECT lẫn UPDATE (gồm `crm_leads`, `customers`, `users`, `projects`).
- Đã viết bản phân công hai bên: [`HANDOFF-2026-09-08-phan-cong.md`](./HANDOFF-2026-09-08-phan-cong.md)
  — ranh giới file, mã dán sẵn cho 3 điểm chặn của 596, thứ tự chạy 8 bước.
- Tự nhận sai: prototype RPC `project_tasks_overview` của tôi tự tính deadline bằng
  `min(deadline)` trên `crm_tasks`/`tasks` — là chuỗi ưu tiên THỨ TƯ, vi phạm AI-002.
  Bản chính thức sẽ gọi hàm chính sách của 596; số đo cũ (228 ms) phải làm lại.
- Bước tiếp theo: xem [`REVIEW-596-deadline.md`](./REVIEW-596-deadline.md) — 9 việc,
  3 việc chặn phát hành.

## 2026-09-08 15:02 — Kiểm thử cập nhật deadline CRM

- AI thực hiện: Cursor.
- Phát hiện API `PATCH /api/crm/leads/:id/deadline` trả 404 dù bản ghi tồn tại.
- Nguyên nhân: PostgREST có nhiều quan hệ giữa `crm_leads` và
  `crm_pipeline_stages`, nhưng select chưa chỉ rõ FK nên query trả `PGRST201`.
- Sửa `backend/src/routes/crm/routes/leadLifecycle.js` để dùng
  `crm_pipeline_stages!crm_leads_stage_id_fkey`.
- Kiểm thử thực tế: đổi `LEAD-6666` từ 21/09 sang 22/09; Kanban cập nhật ngay,
  view Deadline chuyển đúng sang 22/09.
- Đã đổi lại 21/09 và xác nhận DB đã khôi phục dữ liệu gốc.
- Syntax check và lint: đạt.

## 2026-09-08 14:53 — Đồng bộ deadline liên module

- AI thực hiện: Cursor.
- Yêu cầu: chuẩn hóa điều kiện deadline CRM, Sản xuất và VC-LĐ mà không thay đổi cấu trúc
  bảng hoặc bố cục giao diện.
- Đã làm:
  - Tạo policy deadline trung tâm cho backend và adapter tương thích frontend.
  - Tách việc xóa deadline theo module; chỉ hoàn thành dự án cuối mới xóa toàn bộ.
  - Đồng bộ API mutation, KPI, project enrichment và RPC deadline.
  - Bổ sung derived fields `effective_deadline_at`, `effective_deadline_source`,
    `effective_deadline_module`, `deadline_state`.
  - Bổ sung unit test cho thứ tự ưu tiên và hành vi hoàn thành liên module.
- Migration: `database/596_unified_module_deadline_policy.sql`.
- Kiểm thử: unit test policy và syntax check đạt; chưa xác nhận migration trên Supabase production.
- Rủi ro còn lại: cần kiểm thử tích hợp, realtime/cache và giao diện với dữ liệu thật.
- Chi tiết trạng thái: xem [`CURRENT.md`](./CURRENT.md).

---

Khi bắt đầu phiên mới, thêm mục mới lên đầu file, ngay dưới tiêu đề.
# 2026-10-05 — PR19/main compatibility and detail permissions

Reconciled two conflicts between e16c885a and main ca8810c5. Preserved new Page/post/embedded views and PR19 data/async protections. Independent review identified project and Lead detail disclosure in the newly introduced main route; reused existing permission gates. Separate stale action failures from report failures. Modified adAnalytics route/UI, correctness/action lifecycle tests, CI path coverage, CURRENT and integration evidence. Local regressions 127/127; full frontend build and supported-browser synthetic checks. Operational gate HOLD: read-only CRM authorized but login pending; Render workspace unconfirmed; no live changes. See PR19_MAIN_INTEGRATION_20261005.md for scope, limitations and rollback.
# 2026-10-06 — Hoàn thiện hợp đồng Lead Ads sau H1

Theo yêu cầu tiếp tục của Founder, bổ sung domain/Application Service, claim riêng cho form, SQL702 atomic và bộ thử nghiệm. Nhận lại cùng nguồn giữ nguyên Customer/Lead/receipt; sai quyền hoặc dữ liệu cũ không rõ giữ để đối soát. Giao Admin bằng thông báo trong ứng dụng; không chạy legacy auto-task hoặc gửi khách. Source a5bcabf3:194/194 Node,29/29 PG intake và15/15 PG inbox PASS; CI37393352657, regression Messenger CI37393352980 PASS. Đã sửa lỗi SQL biến phone mà review/CI đầu phát hiện, giữ đầy đủ test. [Hồ sơ gói](FACEBOOK_LEAD_ADS_INTAKE_20261006.md), [review độc lập](FACEBOOK_LEAD_ADS_INTAKE_REVIEW_20261006.md). Chưa thay hệ thống thật, kích hoạt HOLD theo các giới hạn ghi trong hồ sơ.

---

