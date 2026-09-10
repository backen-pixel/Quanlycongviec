# Trạng thái công việc hiện tại

Cập nhật: 2026-09-10 14:35 (UTC+7)

## Bình luận HST mặc định — chỉ mục bị cắt 1.000 dòng

Trạng thái: **đã commit, đang push main.**

Dữ liệu không mất: HST mặc định còn 27.653 bình luận deal (9.767 hội thoại,
17.881 hệ thống), 587/651 dự án có comment CRM. View «Bình luận» CRM/SX trống
vì `GET /crm/lead-comments/index` chỉ lấy 1.000 dòng PostgREST → ~110/4.668
deal hiện badge. CRM còn gửi tối đa 2.000 UUID một URL (vượt ~600 UUID).

Đã vá: index dùng `fetchAllByIds` (chia khúc + phân trang); CRM chunk 200 id.
Hoàn tác: revert `leadComments.js`, `projects.js`, `CRMDashboard.jsx`.

## Xóa deal trùng Anh Tám DEAL-2026-1518

Trạng thái: **đã chạy trên DB, script local chưa commit.**

Minh (Phúc Đạt) tạo `DEAL-2026-1518` trên Metalla hôm nay — trùng khách
Anh Tám / 0946714857. Đã xóa; giữ deal Nghĩa `LEAD-2026-1252` (VPT,
ĐANG SẢN XUẤT). Snapshot thùng rác `de7e69ed-3d13-4ff5-baed-7028e649a13e`.

Hoàn tác: khôi phục từ Thùng rác hoặc
`backend/uploads/_delete_deal_1518_rollback_1789024228487.json`.
Script: `backend/scripts/delete-dup-anh-tam-deal-1518.js`.

Còn bản đặt xưởng (không xóa): HCB `1398`/`1399`/`1511`, Phúc Đạt `1401` (Thua).

## Bộ lọc nhân viên Work Unified — chọn nhiều NV

Trạng thái: **local, đang vá số đếm khớp bảng.**

Đã push `71c5cc17` (checkbox `user_ids`). Vá tiếp: danh sách khi đang lọc
tải **đủ dòng** (không cắt 20/trang) nên thẻ «Đang thực hiện» = số dòng bảng.
Khớp NV theo **deal CRM**; sale/PM chỉ khi dự án không có deal (tránh đếm
dự án hiện tên NV khác). Chỉ lấy `crm_leads.type=deal`.

Hoàn tác: revert `management.js`, `workUnifiedUserFilter.js`,
`WorkUnifiedFilterFields.jsx`, `WorkUnifiedOverviewPage.jsx`.

## Anh Tám — chuyển Cửa Phúc Đạt về HCB Tủ bếp

Trạng thái: **đã chạy trên DB, script local chưa commit.**

`TB-2026-767` (Phúc Đạt · Cửa) hủy. Nguồn Metalla `TB-2026-740` đặt thêm
Hucabi · Tủ bếp → `TB-2026-827` / `DEAL-2026-1511`, cột Tiếp nhận, phụ trách
Sang Thiết Kế VPT 1. Deal clone Phúc Đạt `DEAL-2026-1401` → Thua.
Giữ HCB Cánh kính `TB-2026-765`.

Hoàn tác: khôi phục placement Phúc Đạt, `status=producing` cho `TB-2026-767`,
gỡ `TB-2026-827`. Script: `backend/scripts/reclassify-anh-tam-to-hcb-tu.js`.

## Bộ lọc nhân viên Work Unified — chọn nhiều NV

Trạng thái: **local, chưa commit — đã vá cột Người phụ trách.**

Tổng quan dự án lọc nhiều NV bằng checkbox. API nhận `user_ids` CSV.
Khớp theo **mọi deal gắn dự án** (không chỉ deal được pick), cột «Người phụ
trách» ưu tiên NV deal đang lọc (tránh hiện PM/xưởng như Hoàng Dương khi
đang lọc Vũ / Rốt Trần). Chip hiện từng tên NV.

Hoàn tác: revert `management.js`, `workUnifiedUserFilter.js`,
`WorkUnifiedFilterFields.jsx`, `WorkUnifiedOverviewPage.jsx`,
`WorkUnifiedProjectDetailPage.jsx`.

## Nhật ký hoạt động HST NextGo (đã vá)

Clone không mang log thật; 7.716 dòng «created» ở HST mới là do trigger sinh ra
khi clone (dồn về 21/08). Đã vá bằng `backend/scripts/fix-nextgo-history-log.js`:
chép 1.318 dòng thay đổi (xoá / đổi người / đổi trạng thái / hoàn thành / đổi
deadline) và trả lại thời điểm gốc cho 7.303 dòng «created». Log HST mới giờ
trải 12/06 → 09/09, số dòng mỗi loại ≥ công ty cũ. 1.002 `source_id` của bản ghi
đã xoá giữ nguyên id cũ (cột text, không phải khoá ngoại).

Hoàn tác: `node scripts/fix-nextgo-history-log.js --rollback=uploads/_nextgo_log_rollback_1788975783246.json`.

## Bù lịch sử trước mốc clone (đã xong)

`clone-nextgo-to-tenant.js` chỉ sao chép lead / khách hàng / dự án / việc /
thành viên, nên 625 deal trước 21/08 ở HST mới thiếu phần phụ. Đã bù bằng
`backend/scripts/copy-nextgo-history.js` (id mới, ánh xạ FK theo bản đồ clone,
việc CRM ghép theo lead + thời điểm tạo + tiêu đề — 6.566/6.587 khớp):
bình luận 2.414, tài liệu lead 386, tệp việc 385, giao việc 328, sự kiện 22,
snapshot báo cáo ngày 1.116, kế hoạch phòng ban 20, KPI ledger 1.622, điểm KPI
146 — khớp đúng bản dump. Không chép `trash_items` (97, thùng rác).
Kiểm tra: 0 bản ghi trỏ người dùng / việc ngoài HST NextGo.

Hoàn tác: `node scripts/copy-nextgo-history.js --rollback=uploads/_nextgo_history_rollback_1788974016467.json`
(và file `..._1788974138250.json` cho phần KPI bù sau).

## Chuyển delta NextGo về HST mới (đã xong)

Từ 21/08 (mốc clone) đến 09/09, NV NextGo vẫn làm trên công ty cũ ở HST mặc định
nên dữ liệu mới rơi vào đó. Đã chuyển bằng `backend/scripts/migrate-nextgo-delta.js`
(giữ nguyên id, chỉ ánh xạ lại FK theo `uploads/_nextgo_clone_id_map.json`):
141 deal, 150 khách hàng, 6 dự án, 1.738 việc CRM, 532 bình luận, 9 thành viên,
78 tệp việc, 6 sự kiện, 242 dòng KPI, 2.049 dòng lịch sử, 167 việc SX, 140 báo
cáo ngày. Sau khi chạy: công ty cũ còn 0 bản ghi sau mốc clone, HST mới 766 deal,
0 tham chiếu chéo HST (người dùng / pipeline / stage / khu vực / nguồn).

Hoàn tác: `node scripts/migrate-nextgo-delta.js --rollback=uploads/_nextgo_delta_rollback_1788973190866.json`.

Còn lại: chưa có lượt Facebook / Google Form nào chạy qua cấu hình HST mới để
kiểm chứng đầu-cuối (cần 1 tin nhắn FB có SĐT và 1 lượt submit form thật).

## Rà soát cách ly HST NextGo (đã xong)

Quét toàn bộ bảng có `company_id` và 84 khoá ngoại → HST `nextgo` chỉ có 1 công
ty, không có công ty/nhân sự HST khác. 7 tài khoản HST NextGo đăng nhập được,
chỉ thấy công ty + khu vực + lead NextGo (6 NV chưa tự đăng nhập lần nào).

Đã siết thêm: `/api/external/project-deadlines` và API key không gắn công ty
(`all_companies`) giờ chỉ đọc trong HST của chủ key (`tenant_company_ids`),
nên MCP «toàn quyền» không còn thấy công ty HST NextGo. HST mặc định giữ nguyên
phạm vi cũ (đã kiểm: 95 thông báo hạn, 5 công ty như trước).

Đã tắt 2 tài khoản test `saletest.ui@nextgo.vn`, `sanxuattest.ui@nextgo.vn`
(còn sống ở HST mặc định, `tenant_id` rỗng) và trả `created_by` của
`crm_referrers`/`drive_roots` NextGo về `quantri.hst@nextgo.vn`.

## Facebook + Google Form HST NextGo — chỉ cài đặt NextGo

Nguồn CRM / API key / form ngoài (`source_name=Google Form`) lọc theo tenant.
Key `NextGo NV Yến` đã gắn công ty HST mới (cùng token Apps Script).

## Facebook HST NextGo — chỉ cài đặt NextGo

Admin/NV tenant `nextgo` không còn thấy Page, auto pipeline, nguồn, bộ ảnh,
công tắc tổng hay auto-lead config của HST mặc định. Page phải gắn công ty
NextGo; auto-lead lưu `app_settings.auto_lead_config:<tenant_id>`.

## NextGo HST mới — đã đưa vào dùng (cùng app)

Tenant `nextgo` + công ty clone. Admin HST: `quantri.hst@nextgo.vn`.
6 NV đăng nhập email cũ → HST mới (bản cũ `+oldhst`, tắt, không xóa).
Fanpage gắn công ty HST mới. Webhook URL không đổi.
Dữ liệu HST mới = bản clone 21/08 + delta 21/08→09/09 đã chuyển về (xem mục trên).

## Sửa deadline thẻ CRM — lỗi «Lỗi lưu deadline»

Trạng thái: **đang harden thêm (local) — PATCH thành công không bị side-effect làm 500.**

`LeadInfoPanel.saveKanbanDeadline` gọi `setLead` (không có trong scope) sau khi
API thành công → alert generic dù hạn đã ghi DB. Đã bỏ `setLead`, reload qua
`onUpdate`. Backend bọc comment sau lưu; so sánh hạn theo timestamp.

## Ghim dự án góc phải (tối đa 20)

Trạng thái: **bổ sung CRM + VC/LĐ, đang gộp main.**

Nút **Ghim** trên chi tiết CRM (kể cả chưa có `project_id`). Menu thẻ Kanban
CRM / SX / VC-LĐ có **Ghim góc phải**. Chi tiết VC (`/vc/projects/:id`) đã có nút.

Nút **Ghim** trên chi tiết dự án: Work Unified, SX (`/sx/projects/:id`),
VC (`/vc/projects/:id`), tổng quan SX, CRM deal đã có `project_id`.
Danh sách góc phải (localStorage), giữ khi đổi trang; bấm mở lại đúng module;
bỏ ghim; ẩn/hiện. Tối đa 5. Widget hiện cả tài khoản CRM-only.

Đã kiểm trên TB-2026-538: ghim từ Work Unified → danh sách góc phải;
ẩn thành nút số; sang `/crm/dashboard` vẫn còn; bấm mở lại dự án.

## Nhật ký công trình — trang gom log + xuất Excel

## Nhật ký công trình — trang gom log + xuất Excel

Trạng thái: **đã commit, đang push.**

Trang `/management/project-logs`: tìm công trình, tab Tất cả / nhiệm vụ / phát sinh /
dự án / CRM / bình luận, lọc công ty / khu vực / nhân viên + ngày + nội dung, xuất Excel.
API `GET /api/management/project-logs` (route mới, không sửa `management.js`).
Lọc công ty/khu vực/NV: tìm CT (`work-unified/search`) và lọc log theo người thao tác.
Đã kiểm thử trên TB-2026-819: 105 dòng (70 nhiệm vụ, 8 CRM, 27 bình luận).

## Không gian chung — chọn vai trò thành viên khi tạo phát sinh

Trạng thái: **đã commit cùng nhật ký công trình.**

Form tạo/sửa phân công phát sinh (tab Không gian chung trên Dự án / CRM / SX / VC-LĐ
và modal Giao việc Không gian chung) chọn vai trò từng NV:
`primary` / `executor` / `observer` / `manager`. Gửi `assignee_roles` lên API
(backend đã hỗ trợ). Nút **Áp dụng** gán cùng vai trò cho mọi người đã chọn.

File: `frontend/src/lib/assignmentAssignRoles.js`,
`frontend/src/components/LeadMemberAssignmentsPanel.jsx`,
`frontend/src/pages/CRMAssignmentsPage.jsx`.

Chưa xác minh trình duyệt (dev server / phiên đăng nhập chưa mở).

## Tổng quan nhiệm vụ — tải công ty trước cho nhanh

Trạng thái: **đã sửa local, chưa commit.**

`/management/project-tasks` prefetch `/companies` từ sidebar, tự chọn công ty
(mặc định CRM / công ty đăng nhập), rồi mới gọi `GET /work-tasks/project-overview?company_id=`.
Admin hệ thống có thể đổi công ty trên header; không còn tải hết mọi công ty lúc mở trang.

## Tổng quan nhiệm vụ — thẻ SX lấy người chịu trách nhiệm sản xuất

Khi dự án chưa có `production_person_id` và staff xưởng chỉ admin hệ thống, fallback
`production_handover_settings.responsible_user_id` (Phúc Đạt: Minh sản xuất cửa).

## Tổng quan nhiệm vụ — không hiện admin hệ thống trên thẻ SX

TB-2026-029 (CHÚ ĐẠT TÂN PHÚ): không có `production_person_id`, staff xưởng chỉ
Trương Trọng Thành → fallback hiện TT. Đã bỏ admin hệ thống khỏi phụ trách mặc định.

## Tổng quan nhiệm vụ — việc PS không dính cột Sản xuất

Trạng thái: **đã sửa local, chưa commit.**

`crm_tasks` Không gian chung (`shared_workspace` / `sx_shared` / `vc_shared`) từng lấy
`pipeline_stage_id` của deal (vd. «Sản xuất.») nên người được giao việc PS hiện trên
thẻ Sản xuất (TB-2026-738). Nay tách thành danh mục «Không gian chung».

## 2026-09-08 16:20 — Commit + push WIP còn lại trong ngày

## Đã commit + push phần WIP còn lại (16:20)

Nhánh `feat/project-phat-sinh-report`. Gom phần chưa commit của hôm nay:
đồng bộ deadline, sửa query-guard, tổng quan nhiệm vụ, tài liệu bàn giao.

Không commit: `.idea`, upload, `_to_delete`, log/ảnh tạm, SQL trùng số trên
`main` (`400`–`402`, `580_clear_all_project_deadlines_*`). Migration 596
vẫn **chặn phát hành** — xem mục dưới.

## Không gian chung — admin hệ thống sửa/xóa việc người khác

Trạng thái: **đã commit trên `feat/project-phat-sinh-report`.**

Người tạo vẫn sửa/xóa được việc của mình. Admin hệ thống (role `admin`, không
`company_id` — gồm Trương Trọng Thành) sửa/xóa được việc người khác trên
Không gian chung và bảng Giao việc. Admin/sales_admin gắn công ty chỉ trong
phạm vi `company_id` / `executor_company_id`. NV thường không thấy nút Sửa/Xóa
trên việc không phải của mình.

## Lỗi query-guard / 42703 trên tổng quan dự án — Claude lên kế hoạch sửa

Trạng thái: **đã ghi nhận, chưa sửa code.**

Tab tổng quan deal (`GET /api/management/deals?...&all=1500`) trả ~50 byte vì
`column crm_leads.budget does not exist` (42703). Đo DB: `crm_leads` không có
`budget` lẫn `deadline`; có `estimated_value`, `kanban_deadline_at`,
`expected_close_date`.

Báo cáo + kế hoạch 7 bước: [`BAO-CAO-loi-query-guard-2026-09-08.md`](./BAO-CAO-loi-query-guard-2026-09-08.md).

`routes/management.js` là vùng dùng chung — ghi `WORKLOG.md` trước khi sửa.

## Trang phát sinh module Dự án

Trạng thái: commit `4877842c` trên `feat/project-phat-sinh-report`; đang đẩy lên `main`.
Working tree local vẫn còn các thay đổi khác (deadline, tổng quan nhiệm vụ) chưa commit.

## Đồng bộ deadline CRM, Sản xuất và VC-LĐ

Trạng thái: đã triển khai code và kiểm thử cục bộ; migration chưa được xác nhận đã áp dụng
lên Supabase production.

### Chính sách đã thống nhất

- CRM: nhiệm vụ mở của cột hiện tại → hạn Kanban → SLA → ngày dự kiến chốt.
- Sản xuất: hạn Kanban SX → ngày hoàn thành SX → hạn SX → ngày giao → hạn dự án.
- VC-LĐ: ngày lắp → ngày giao → hạn dự án.
- Hoàn thành một module chỉ tắt deadline thuộc module đó.
- Hoàn thành dự án cuối tại bước lắp đặt mới xóa các deadline còn mở của toàn dự án.
- Trường ngày không có giờ được quy đổi theo giờ kết thúc làm việc của công ty tại múi giờ
  `Asia/Ho_Chi_Minh`.

### File chính

- `backend/src/helpers/moduleDeadlinePolicy.js`
- `backend/src/helpers/clearCompletedProjectDeadlines.js`
- `backend/src/helpers/completeOpenWorkOnModuleDone.js`
- `backend/src/routes/production.js`
- `backend/src/routes/logistics.js`
- `backend/src/routes/management.js`
- `backend/src/routes/crm/routes/leadLifecycle.js`
- `backend/src/helpers/projectModuleCompanies.js`
- `backend/src/helpers/vcOverviewKpis.js`
- `frontend/src/lib/moduleDeadlinePolicy.js`
- `frontend/src/lib/crmLeadDeadlineDisplay.js`
- `frontend/src/lib/sxPipelineRevenue.js`
- `frontend/src/components/LogisticsViews.jsx`
- `database/596_unified_module_deadline_policy.sql`
- `backend/tests/module-deadline-policy.test.js`

### Đã kiểm thử

- Kiểm thử trình duyệt CRM với bản ghi `LEAD-6666`: đổi hạn 21/09 → 22/09,
  thẻ Kanban cập nhật ngay và view Deadline hiển thị `Hạn: 22/9/2026`.
- Đã hoàn tác bản ghi thử về 21/09 và xác nhận trực tiếp trong DB.
- Đã sửa lỗi API PATCH trả 404 do PostgREST không xác định được quan hệ
  `crm_leads` → `crm_pipeline_stages`; join hiện dùng FK rõ ràng.
- `node --check src/routes/crm/routes/leadLifecycle.js` — đạt.
- `node --check src/routes/management.js`
- `node tests/module-deadline-policy.test.js` — đạt.
- `git diff --check -- backend/src/routes/management.js database/596_unified_module_deadline_policy.sql` — đạt.
- IDE không báo lỗi lint mới trên `backend/src/routes/management.js`.

## Đã sửa 5 lỗi query-guard (Claude, 22:58) — chờ anh restart backend xác minh

Nguồn: [`BAO-CAO-loi-query-guard-2026-09-08.md`](./BAO-CAO-loi-query-guard-2026-09-08.md) của Cursor.
Số của Cursor kiểm chứng lại trên prod: **đúng hết**, hai chỗ nặng hơn (41 user >1.000 thông báo,
cao nhất 9.503; wonIds thực tế 713+525 id).

- P0 `GET /management/deals` trả HTTP 500 — `crm_leads.budget`/`deadline` không tồn tại. **Đã sửa.**
- P1 `.in('id', wonIds)` vượt mốc gãy URL — **đã chia lô**, không đổi phạm vi «won».
- P1 2.213 task active bị cắt ở 1.000 dòng — **đã phân trang**.
- P2 badge thông báo (nhánh dự phòng) — **đã phân trang**.
- P2 guard không có site cho `.rpc()` — **đã bọc**, nhãn thành `rpc:<tên hàm>`.
- Bonus: `audit/audit.py` nay lần theo `.select(BIẾN)` — đúng lỗ đã để lọt lỗi P0.

**Cần anh B.A**: restart backend local, mở lại tab tổng quan module Dự án. Kỳ vọng 200 thay vì
500; sau 15 phút bảng query-guard không còn `COT-KHONG-TON-TAI crm_leads` và
`FILTER-ID-QUA-DAI projects`.

`routes/management.js` đã trả lại vùng dùng chung.

## Phân công hai bên: [`HANDOFF-2026-09-08-phan-cong.md`](./HANDOFF-2026-09-08-phan-cong.md)

Có ranh giới file, mã dán sẵn cho 3 điểm chặn của 596, và thứ tự chạy 8 bước.
Hai file `routes/management.js` và `routes/logistics.js` là **vùng dùng chung** —
ghi `WORKLOG.md` TRƯỚC khi sửa.

## CHẶN PHÁT HÀNH — migration 596 cần sửa 1 dòng

Rà soát 2026-09-08 22:05 (Claude): `project_deadline_board` gọi `project_deadline_at(p)`,
mà 596 định nghĩa lại hàm đó thành chuỗi **Sản xuất** (không có `install_date`).
Đo trên 671 dự án đang chạy: **86 dự án trên bảng VC mất hạn**, **114 dự án sai hạn**.
Sửa thành `project_module_deadline_at(p, 'logistics')` trước khi áp.

Kèm 2 việc chặn khác: thu quyền `EXECUTE` của 4 hàm mới khỏi `anon`, và tạo
`596_rollback.sql` trước khi chạy. Chi tiết + số đo: [`REVIEW-596-deadline.md`](./REVIEW-596-deadline.md).

### Cần xác nhận trước khi phát hành

- Rà soát SQL migration 596 trên môi trường thử nghiệm trước khi chạy production.
- Tiếp tục kiểm thử tích hợp và hồi quy giao diện SX/VC-LĐ với dữ liệu thật.
- Xác nhận cache/socket cập nhật đúng khi đổi deadline từ một màn hình và quan sát ở màn hình khác.
- Không tự ý commit các file tạm, upload, lock hoặc thay đổi `.idea` đang tồn tại trong working tree.
