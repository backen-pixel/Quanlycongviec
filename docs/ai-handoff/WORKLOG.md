# Nhật ký công việc AI

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
