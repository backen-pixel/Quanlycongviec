# Nhật ký công việc AI

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
