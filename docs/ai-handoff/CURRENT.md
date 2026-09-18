# Trạng thái công việc hiện tại

Cập nhật: 2026-09-18 13:30 (UTC+7)

## Migration Zalo cá nhân + Guide Assistant — ĐÃ THỬ LOCAL, chờ production

Trạng thái: **9/9 ĐẠT trên Postgres local; CHƯA chạy production.**

Đã thoả AI-003 bằng Postgres 16.15 + pgvector chạy docker trên máy (dự án
Supabase DEV đã mất — tenant `postgres.xfql…` không tồn tại).

Cách dựng môi trường thử (tái lập được):
- `docker run -d --name qlcv-pg -e POSTGRES_PASSWORD=... -p 55432:5432 pgvector/pgvector:pg16`
- extension cần: `pg_trgm`, `vector`, `pgcrypto` (559 dùng `gen_random_bytes`)
- phải stub `storage.buckets` — 564/565 ghi vào schema `storage` của Supabase
- bảng tiền đề sinh từ `docs/database/DATABASE_SCHEMA.md`: users, companies,
  crm_leads, customers, crm_sources, zalo_oa_accounts, zalo_contacts,
  zalo_messages (nới lỏng: bỏ FK/NOT NULL, enum về text)
- schema guide CŨ lấy từ backup `/home/bizmind/local-20260918-1137.tar.gz`
  (migration 554/555/556) để diễn đúng đường nâng cấp của 602

**Đã tìm và sửa một lỗi thật trong 602** (commit `0450a908`): thiếu
`ADD COLUMN fail_count`, khiến migration ĐỔ ở dòng COMMENT khi bảng
`guide_experiences` đã tồn tại ở schema cũ — đúng tình trạng của DB thật.

Kết quả thử:
- 8 migration Zalo: ĐẠT, idempotent (chạy 2 lần không nhân đôi dữ liệu),
  tạo 5 bảng + 9 cột trên `zalo_oa_accounts`, 565 lật `attachments.public=false`
- 602 trên schema cũ CÓ dữ liệu: ĐẠT, giữ bản ghi, đổi tên cột giữ giá trị,
  JSON `tom_tat`→`summary` đúng, `source` `tu_dong`→`auto` đúng
- 602 chạy lần 2 và trên DB sạch: ĐẠT
- trọn bộ 9 theo thứ tự trên DB mới: **9/9 ĐẠT**

CHƯA xác minh: hành vi trên dữ liệu thật khối lượng lớn; RLS/policy của
Supabase; `storage.buckets` thật (local chỉ là bảng stub).

**Khi chạy production phải chạy CẢ primary VÀ backup** — có failover; tiền lệ
ở mục HCB: "602 kéo thẻ Tủ bếp đúng cột (primary + backup)". `.env` KHÔNG có
`SUPABASE_ACCESS_TOKEN` nên không dùng được Management API như CLAUDE.md gợi ý.

**Gọi migration theo ĐÚNG TÊN FILE.** Mỗi số 558–565 có HAI file khác nhau,
một của Zalo và một của main (`558_crm_leads_rpc_tenant_scope`,
`559_crm_filter_summary_kanban_tenant_scope`,
`560_projects_sx_kanban_column_composite_index`,
`561_sx_kanban_stage_page_ids_rpc`, `562_crm_leads_page_ids_fast_path`,
`563_hcb_truong_trong_thanh_all_projects`,
`564_sx_kanban_column_counts_no_division`,
`565_rescan_clear_deadlines_on_completed`). Toàn repo 60+ số trùng — vấn đề
sẵn có. Đừng bao giờ nói "chạy 558–565".

## Trang cá nhân — cập nhật họ tên + SĐT

Trạng thái: **FE+BE local.**

Card **Thông tin** trên `/social/u/:id`: nút **Cập nhật** (chủ hồ sơ)
sửa họ tên và số điện thoại. PATCH `/internal-social/profile/me` nhận
`phone`.

Hoàn tác: revert `EditMyNameModal.jsx`, `SocialProfilePage.jsx`,
`internalSocial.js`.

## CRM stepper — qua Lắp đặt thì hết hạn lắp

Trạng thái: **FE+BE local.**

Kéo deal CRM sang cột **sau Lắp đặt** (CSKH / bảo hành / nghiệm thu /
Hoàn thành): tắt hạn lắp. `install_date` giữ. CSKH → `projects.status=warranty`
(vẫn hiện Work Unified). Hoàn thành CRM → đóng việc VC + mọi hạn còn lại.

Hoàn tác: revert `crmDealStageGate.js` (BE+FE), `moduleDeadlinePolicy.js`
(BE+FE), `completeOpenWorkOnModuleDone.js`, `leadLifecycle.js`,
`management.js` (`warranty` trong danh sách Work Unified).

## Work Unified — nhắc cập nhật tiến độ dự án quá hạn

Trạng thái: **FE+BE local. Đã gửi 36/36 dự án trễ hạn VPT hôm nay.**

Nút **Nhắc tiến độ** trên `/management/work-unified` (và chuông từng dòng
trễ hạn): ghi bình luận `@` người chịu trách nhiệm, thêm họ vào tab
Thành viên (vai trò Chịu trách nhiệm) nếu chưa có. Mỗi dự án 1 lần/ngày,
tối đa 80 dự án/lần. Gửi song song 5 dự án; proxy Vite `/api` 180s.

Hoàn tác: revert `workUnifiedProgressReminder.js`, `management.js`
(POST `/work-unified/remind-progress`), `WorkUnifiedOverviewPage.jsx`.

## Deadline — 1 hạn theo vòng đời CRM → SX → lắp

Trạng thái: **FE+BE local + SQL 619 đã chạy primary/backup.**

Một lúc chỉ đếm một hạn. Đã dọn dữ liệu chồng:
- CRM Thua/Thắng: xóa hạn thẻ + hạn NV mở (không xóa việc).
- Deal đã lập SX: xóa hạn CRM (thẻ + NV CRM, giữ NV sx_/vc_).
- SX đã giao / bàn giao VC: xóa `sx_kanban_deadline_at` + `production_deadline`.
- Giữ `install_date` / `delivery_date` / `production_finish_date`.

Hoàn tác: snapshot `backend/uploads/_lifecycle_deadline_sync_*.json`;
revert `moduleDeadlinePolicy.js` (BE+FE), `crmLeadDeadlineDisplay.js`,
`leadsList.js`, `619_sync_lifecycle_deadlines.sql`.

## Cảnh báo hạn — bật/tắt từng API

Trạng thái: **FE+BE local.**

Bảng «API đã cấu hình»: cột **Bật** từng dòng. Tắt thì cron/due-watch
bỏ API đó; gửi tay / test vẫn được. Công tắc form đồng bộ với bảng.

Hoàn tác: revert `ProjectDeadlineDispatchPage.jsx`, `dashboard.js`,
`projectDeadlineDispatch.js` (field `enabled` trên profile).

## Cảnh báo hạn — công tắc bật/tắt trên trang quản lý

Trạng thái: **FE+BE local.**

`/management/project-deadlines`: công tắc **Cảnh báo hạn công trình**
(cron Zalo) và **Gán hạn module vào nhiệm vụ trống**. Tự gửi Zalo từng
API cũng là công tắc. Gửi tay/test vẫn chạy khi tắt cron.

Hoàn tác: revert `ProjectDeadlineDispatchPage.jsx`, `dashboard.js`,
`projectDeadlineDispatch.js`; gỡ check stamp trong `workTasks.js` /
`workshopApplyTemplates.js`.

## Tổng quan nhiệm vụ — ghi hạn module vào việc con

Trạng thái: **BE local.**

Mở `/sx/project-tasks` (và CRM/VC cùng API): việc con còn mở, chưa có
hạn, được ghi hạn module (SX / VC-LĐ / CRM). Việc đã có hạn không đụng.
Tạo mẫu xưởng mới cũng nhận hạn module lúc insert. Dự án không có hạn
module (vd. TB-2026-029 không ngày SX/giao/lắp) vẫn trống.

Hoàn tác: revert `workTasks.js`, `projectOverviewDeadline.js`,
`workshopApplyTemplates.js`, `moduleDeadlinePolicy.js` (`forDisplay`).

## Stepper CRM — ✓ theo tiến độ SX/VC

Trạng thái: **FE local.**

Thanh tiến độ deal: cột Đang sản xuất / Vận chuyển / Lắp đặt / CSKH /
Hoàn thành được ✓ khi Kanban SX hoặc VC đã kéo tới (hoặc qua) giai đoạn
đó. Cột CRM đang đứng vẫn hiện icon hiện tại, không ✓.

Hoàn tác: revert `PipelineStepper.jsx`, `crmDealStageGate.js`,
`LeadDetail.jsx`, `WorkUnifiedProjectDetailPage.jsx`.

## Work Unified — hạn bàn giao = lịch lắp VC-LĐ đang chạy

Trạng thái: **BE+FE local.** Bỏ chống chế ẩn trễ khi VC còn Tiếp nhận.

Hạn tổng quan = deadline module VC/LĐ: buổi lắp **còn lại gần nhất**
(≥ hôm nay). Đang lắp nhiều buổi thì không trễ vì ngày đầu đã qua.
Hết buổi mà chưa **Hoàn thành** VC thì mới trễ. Kéo Hoàn thành / dời
lịch VC thì hạn đổi theo. Cánh kính SX xong giữ rule cũ.

Hoàn tác: revert `moduleDeadlinePolicy.js` (BE+FE), `projectForecast.js`,
`management.js`, `projectDealBundle.js`, test deadline + forecast.

## CRM Pipeline — tự thêm thành viên khi vào cột / lập KH SX

Trạng thái: **FE+BE local + SQL 618 primary/backup.**

Cài đặt Pipeline CRM (sửa cột Deal, kể cả cột Thắng): tick
**Tự thêm thành viên CRM khi vào cột**, chọn NV. Deal vào cột đó
(kéo Kanban / lập kế hoạch SX / gắn VC-LĐ) thì NV vào tab Thành viên.
Phúc Đạt «Đã ký hợp đồng» đã seed Vân. Không còn hardcode trong code.

Hoàn tác: revert `PipelineSettingsPage.jsx`, `pipelines.js`,
`crmPipelineStageMembers.js`, `leadLifecycle.js`, `autoDealWonProject.js`;
SQL trong `618_crm_pipeline_stage_default_members.sql`.

## Phúc Đạt — mặc định thêm NV Vân vào deal SX / VC-LĐ

Trạng thái: **BE local + SQL 617 primary/backup.**

Hoàng Thị Phượng Vân (`phuongvanhoang1505@gmail.com`) tự vào tab
Thành viên khi deal Phúc Đạt thiết lập kế hoạch SX hoặc gắn VC-LĐ.
Đã backfill 38 deal đang chạy (6 Đã ký HĐ, 15 SX, 13 VC/LĐ, 4 Hóa đơn).
Không thêm vào đội SX (chỉ thành viên deal).

Hoàn tác: revert `dealParticipantProduction.js`,
`vcHandoverDealMembers.js`, `productionWorkshopTypeStaff.js`;
xóa `lead_members` user Vân vừa thêm.

## HCB Cánh kính — hoàn thành SX tắt hết hạn + NV

Trạng thái: **BE local.**

Kéo loại **Cánh kính HCB** sang cột SX **Hoàn thành** (cờ Đã thu): đóng
mọi nhiệm vụ còn mở (SX, VC/LĐ, CRM, giao việc), tắt deadline CRM/SX/VC,
đánh `projects.status = completed`. Tủ bếp / Cửa / «Đợi thanh toán» không
đổi (vẫn chỉ đóng hạn SX). Job quét hạn cũng dọn đơn Cánh kính đang nằm
sẵn ở Hoàn thành.

Hoàn tác: revert `completeOpenWorkOnModuleDone.js`,
`clearCompletedProjectDeadlines.js`, `projectForecast.js`.

## Quản lý nhiệm vụ — mũi tên cuộn Kanban

Trạng thái: **FE local.**

Trang `/sx/project-tasks` (và VC/CRM/tổng quan cùng component): mép
trái/phải có mũi tên cuộn ngang giống Dashboard Kanban.

Hoàn tác: revert `ProjectTasksOverviewPage.jsx`.

## Kanban — nút Nhiệm vụ nổi trên thẻ

Trạng thái: **FE local.**

Thẻ SX / VC / Work Unified: nút **Nhiệm vụ** (chữ + icon) trên đầu
thẻ, mở trang Quản lý nhiệm vụ của đúng dự án. Không còn icon ẩn
dưới chân thẻ.

Hoàn tác: revert `KanbanGotoProjectTasksBtn.jsx`,
`ProductionDashboard.jsx`, `LogisticsDashboard.jsx`,
`WorkUnifiedOverviewPage.jsx`.

## Pipeline xưởng — thêm cột nhỏ trong thẻ cột chính

Trạng thái: **FE + BE local.**

Mỗi thẻ cột chính có nút **Thêm cột nhỏ**: nhập tên, tạo cột pipeline
gắn sẵn `group_key` + tab đang chọn. POST nhận `group_sort`.

Hoàn tác: revert `ProductionPipelineSettingsPage.jsx`, `production.js`.

## Pipeline xưởng — kéo cột nhỏ giữa cột chính

Trạng thái: **FE local.**

Tab **Cột chính**: kéo cột nhỏ từ thẻ này sang thẻ kia (kể cả thả
vào danh sách bên trong). Payload `nho:`/`lon:` + ref để không mất
drop khi `dragEnd` chạy trước. Không đổi `order_index` cột nhỏ.

Hoàn tác: revert `ProductionPipelineSettingsPage.jsx`.

## Pipeline xưởng — trang setup cột chính

Trạng thái: **FE local.**

Trang `/sx/pipeline-settings` mặc định tab **Cột chính**: bảng thẻ
theo tab Dashboard (Sản xuất / Công nợ). Cột chưa setup hiện thẻ
nét đứt. Kéo cột nhỏ vào thẻ để gán. Tab **Cột nhỏ** / **Cài đặt**
tách chi tiết và giờ deadline + NV.

Hoàn tác: revert `ProductionPipelineSettingsPage.jsx`.

## HCB — cột pipeline Đóng gói đủ loại

Trạng thái: **DB primary/backup SQL 616.**

Tủ bếp: cột Kanban **Đóng gói** (trước KCS), `group_key=dong_goi`,
`is_packaging_done`. Cửa / Cánh kính giữ «Vệ sinh đóng gói».
«ĐƠN HÀNG ĐÃ CHUẨN BỊ XONG» trả về Hoàn thiện.

Hoàn tác: SQL trong `616_hcb_dong_goi_pipeline_column.sql`.

## HCB — hiện cột lớn Đóng gói đủ loại

Trạng thái: **FE + DB primary/backup.**

Kanban gộp: cột lớn chỉ 1 cột nhỏ vẫn hiện tên lớn (Đóng gói).
Tủ bếp có cột pipeline Đóng gói (616); Cửa / Cánh kính từ 612.

Hoàn tác: SQL trong `615_hcb_tubep_dong_goi_group_key.sql`; revert
`sxGopCot.js`, `ProductionDashboard.jsx`.

## Pipeline xưởng — tự thêm tab Kanban

Trạng thái: **FE + BE local.**

Nút **+ Tab** cạnh Sản xuất / Công nợ: đặt tên tab mới, gán cột lớn
vào tab đó. Dashboard hiện mọi tab có cột. `board_tab` nhận tên tự
đặt (không chỉ sx/cong_no). Tab trống xóa bằng ×.

Hoàn tác: revert `sxTachCongNo.js`, `ProductionPipelineSettingsPage.jsx`,
`ProductionDashboard.jsx`, `production.js`.

## Pipeline xưởng — cột lớn theo tab Sản xuất / Công nợ

Trạng thái: **FE + BE local; DB primary/backup `board_tab`.**

Setup cột lớn chọn tab **Sản xuất** hoặc **Công nợ** (giống
Dashboard). Cột gán vào tab nào thì Kanban hiện đúng tab đó.
Cột `board_tab` (SQL 614). Cánh kính/Cửa: bấm «→ Công nợ» nếu
muốn tách tab (mặc định vẫn trên Sản xuất như cũ).

Hoàn tác: SQL `database/614_production_pipeline_board_tab.sql`;
revert `sxTachCongNo.js`, `ProductionPipelineSettingsPage.jsx`,
`productionPipelineSchema.js`, `workshopKanban.js`, `production.js`.

## Pipeline xưởng — thêm cột lớn cả 2 tab

Trạng thái: **FE local.**

Form **Thêm cột lớn** (tên + chip + chọn cột pipeline) có trên tab
Gộp cột và tab Cột pipeline.

Hoàn tác: revert `ProductionPipelineSettingsPage.jsx`.

## Pipeline xưởng — thêm cột lớn ngay danh sách

Trạng thái: **FE local.**

Khối «Cột lớn đang dùng»: form **Thêm cột lớn** (tên + chip gợi ý
+ chọn cột pipeline đưa vào). Không cần gán từng dòng bảng dưới.

Hoàn tác: revert `ProductionPipelineSettingsPage.jsx`.

## Pipeline xưởng — ô Cột lớn thành dropdown

Trạng thái: **FE local.**

Bảng Gộp cột (và form sửa cột): chọn **Tiếp nhận / Hoàn thiện…**
thay vì gõ slug `tiep_nhan`. Lưu ngay khi chọn; «+ Tên mới…» nếu
cần tên khác.

Hoàn tác: revert `ProductionPipelineSettingsPage.jsx`, `sxGopCot.js`.

## Pipeline xưởng — sắp xếp + sửa cột lớn dễ hơn

Trạng thái: **FE + BE local; DB primary/backup đã có `group_sort`.**

Tab «Gộp cột»: cột lớn thành danh sách (kéo / ↑↓), sửa tên ngay trên
thẻ, hiện cột nhỏ bên trong, lọc NV. Thứ tự lưu `group_sort` — không
đổi `order_index` cột nhỏ. Kanban gộp đọc cùng thứ tự.

Hoàn tác: SQL `database/613_production_pipeline_group_sort.sql`;
revert `sxGopCot.js`, `ProductionPipelineSettingsPage.jsx`,
`productionPipelineSchema.js`, `workshopKanban.js`, `production.js`.

## Pipeline xưởng — cột lớn Đóng gói

Trạng thái: **FE + DB primary/backup đã chạy.**

HCB Cửa + Cánh kính: «Vệ sinh đóng gói» ra cột lớn **Đóng gói**.
Thứ tự lưới/Kanban gộp: **Hoàn thiện rồi Đóng gói** (không theo
order_index cột nhỏ).

Hoàn tác: SQL trong `database/612_hcb_dong_goi_group_key.sql`;
revert `sxGopCot.js`, `sxWorkshopSchedule.js` (FE+BE),
`ProductionPipelineSettingsPage.jsx`.

## CRM — nút Zalo chi tiết: Đã gửi + lưu DB

Trạng thái: **FE + BE local, chưa commit.**

Nút **Gửi Zalo** trên chi tiết deal: gửi xong đổi **Đã gửi Zalo** (xanh).
Mở lại deal vẫn giữ trạng thái từ `crm_zalo_stage_sends` (`msg_id`).
Bấm lại thì hỏi gửi lần nữa. API `GET /crm/leads/:id/detail` thêm
`zalo_oa_sent` / `zalo_oa_send`.

Hoàn tác: revert `LeadDetail.jsx`, `leadLifecycle.js`, `helpersBundle.js`.

## Pipeline xưởng — lọc công ty/loại + NV cột lớn

Trạng thái: **FE local, chưa commit.**

Tab «Gộp cột» có bộ lọc Công ty + Loại (không phải sang tab Cột
pipeline). Mỗi cột lớn có ô **Người chịu trách nhiệm** — gán NV
chính cho mọi cột nhỏ trong nhóm. Kanban gộp hiện tên NV trên
cột lớn.

Hoàn tác: revert `ProductionPipelineSettingsPage.jsx`,
`ProductionDashboard.jsx`, `sxStageStaff.js`.

## Work Unified — chip lịch: mã + khách + NV

Trạng thái: **FE local, chưa commit.**

Ô ngày trên Lịch chỉ còn mã TB, khách/tên ngắn, NV phụ trách.
Lịch SX không lặp chữ «Hạn SX» (đã có màu). Bấm ngày: tên đầy đủ,
SĐT, công đoạn, cả 3 hạn SX/Giao/Lắp.

Hoàn tác: revert `WorkUnifiedOverviewPage.jsx`.

## Work Unified — cột Deadline «Ngày mai»

Trạng thái: **FE local, chưa commit.**

Board Deadline `/management/work-unified` thêm cột **Ngày mai**
(hạn đúng ngày kế tiếp), nằm giữa Hôm nay và Tuần này.

Hoàn tác: revert `WorkUnifiedOverviewPage.jsx`.

## SX — thanh chip module → ô tìm từng chữ

Trạng thái: **FE local, chưa commit.**

Thanh «Sản xuất · 770» trên `/sx/project-tasks` thành ô tìm kiếm
full-width; gõ từng chữ là lọc board ngay.

Hoàn tác: revert `ProjectTasksOverviewPage.jsx`.

## SX — thẻ nhiệm vụ → Giao việc + Nhật ký

Trạng thái: **FE + BE local, chưa commit.**

Bấm thẻ hoặc nút **Công việc** trên `/sx/project-tasks` mở
**Giao việc Sản xuất** lọc đúng dự án (`?project_id=`). Board hiện
giao việc + nhiệm vụ pipeline của dự án đó.

Hoàn tác: revert `ProjectTasksOverviewPage.jsx`, `CRMAssignmentsPage.jsx`,
`ProjectConstructionLogsPage.jsx`, `assignmentSourceLink.js`,
`crmAssignments.js`.

## SX — bộ lọc nhiệm vụ = Phạm vi xưởng Dashboard

Trạng thái: **FE + BE local, chưa commit.**

Panel `/sx/project-tasks` dùng đúng khối «Phạm vi xưởng» của Dashboard:
Công ty sản xuất (xưởng) + Công ty đặt hàng (CRM + ngoài).
`GET /work-tasks/project-overview` nhận `deal_company_id`.

Hoàn tác: revert `ProjectTasksOverviewPage.jsx`, `ProjectTasksFilterPanel.jsx`,
`WorkshopDashboardFilterPanel.jsx`, `workTasks.js`.

## Menu SX — Deal vào xưởng → Dashboard

Trạng thái: **FE local, chưa commit.**

Mục ghim `/sx/dashboard` đổi nhãn «Deal vào xưởng» → **Dashboard**.

Hoàn tác: revert `Sidebar.jsx`.

## SX — bộ lọc nhiệm vụ dự án = Dashboard xưởng

Trạng thái: **FE local, chưa commit.**

`/sx/project-tasks` lấy công ty / khu vực / NV như Dashboard SX:
`/companies?for_module=production`, không còn NextGo/VPT CRM.
Mặc định xưởng theo `sx_dash_filters_v1` (HCB/Metalla), không «Tất cả công ty».

Hoàn tác: revert `ProjectTasksOverviewPage.jsx`, `ProjectTasksFilterPanel.jsx`,
`crossWorkshopProduction.js`, `WorkUnifiedFilterFields.jsx`, `Sidebar.jsx`.

## NextGo — tắt công ty cũ trên HST mặc định

Trạng thái: **đã chạy DB primary + backup.** Không đổi code.

`Công Ty TNHH Bao Bì NextGo` trên tenant `default`
(`87479a83-1145-43b7-b090-3e40812cb5a9`) → `is_active=false`.
Ẩn khỏi `/api/companies` (CRM/SX/VC dropdown). Dữ liệu không xóa.

HST `nextgo` clone (`842cff41-…`) vẫn `is_active=true`.

Hoàn tác: `NEXTGO_CUTOVER=YES node scripts/freeze-nextgo-source.js --unfreeze --apply`
(và `UPDATE companies SET is_active=true` trên backup).

## SX — bộ lọc NV: NV theo công ty / khu vực

Trạng thái: **FE local, chưa commit.**

Danh sách người phụ trách trên panel `/sx/project-tasks` chỉ còn NV
của công ty đang chọn, và (nếu chọn khu vực) NV gắn khu vực đó.

Hoàn tác: revert `ProjectTasksOverviewPage.jsx`, `ProjectTasksFilterPanel.jsx`.

## SX — bộ lọc NV: chọn nhiều nhân viên

Trạng thái: **FE local, chưa commit.**

Tab Nhân viên trên `/sx/project-tasks` chọn 1 hoặc nhiều người phụ
trách (checkbox + tìm). Board hiện task của bất kỳ người đã chọn.

Hoàn tác: revert `ProjectTasksFilterPanel.jsx`, `ProjectTasksOverviewPage.jsx`.

## SX — bộ lọc NV: công ty / khu vực / nhân viên

Trạng thái: **FE + BE local, chưa commit.**

Bộ lọc nâng cao `/sx/project-tasks` mở tab Nhân viên, nạp đủ khu vực
(`company-regions`) và nhân viên (`employees-by-company`). Khu vực NV SX
lấy từ deal gắn `project_id` (trước chỉ có khi task có `lead_id`).

Hoàn tác: revert `ProjectTasksOverviewPage.jsx`,
`ProjectTasksFilterPanel.jsx`, `workTasks.js`.

## Zalo — tắt tự gửi, nút Gửi Zalo mọi cột deal

Trạng thái: **commit + push main.**

Kéo deal vào cột không tự gửi ZNS. Nút **Gửi Zalo** trên chi tiết deal
(mọi cột). Ẩn toggle Zalo trên Cài đặt Pipeline. Token ZNS lấy từ
`zalo_oa_accounts`.

Hoàn tác: khôi phục `maybeSendZaloOnDealStageEnter` + điều kiện cột
Hoàn thành trên nút.

## Work Unified — bỏ badge CRM/SX/VC trên thẻ

Trạng thái: **commit + push main.**

Kanban và Deadline không còn chip CRM · SX · VC (và ĐA MODULE). Lịch
cũng gỡ chip module.

## Menu SX — nhóm 3 Setup xưởng

Trạng thái: **commit + push main.**

Đổi tiêu đề nhóm sidebar «3. Điều hành xưởng» → **3. Setup xưởng**.

## Zalo ZNS — token hiệu lực từ OA

Trạng thái: **commit + push main.**

Gửi ZNS / cấu hình / test lấy access token từ `zalo_oa_accounts` (tự refresh),
không dùng bản chép cũ trong `app_settings`.

## Deploy Render — thiếu GiaVonExcelModal

Trạng thái: **commit + push main.**

`WorkshopTaskTemplatesPage` import modal giá vốn nhưng file chưa git →
vite build Render fail. Thêm `GiaVonExcelModal.jsx`.

## Chi tiết SX — ẩn tab Sự cố

Trạng thái: **FE local, chưa commit.**

Tab «⚠️ Sự cố» không còn trên chi tiết dự án xưởng. `?tab=incidents`
chuyển về Công việc.

Hoàn tác: hiện lại `tabBtn('incidents'…)` và thêm `'incidents'` vào
`DEAL_TAB_KEYS`.

## HCB Cánh kính / Cửa — bỏ chặn kéo cột

Trạng thái: **SQL 611 + BE local.**

Không còn bắt hoàn thành nhiệm vụ trước khi kéo Kanban Cánh kính/Cửa.
Gate `assertSxKanbanAdvanceAllowed` bỏ qua hai phân loại này. Tủ bếp giữ chặn.

Hoàn tác: revert `workshopStageAdvanceGate.js` + gán lại `blocks_stage_advance`.

## HCB Cánh kính — kéo Tiếp nhận → sản xuất

Trạng thái: **SQL 610 đã chạy; FE local.**

Tài khoản quản lý Cánh kính (Nguyễn Nhật): kéo thẻ bị chặn vì 3 nhiệm vụ
Tiếp nhận tick «Chặn chuyển giai đoạn» (mẫu 598). Đã tắt cờ chặn trên
Cánh kính/Cửa cột Tiếp nhận. Kanban hiện hộp nhiệm vụ nếu còn chặn.

Hoàn tác: gán lại `blocks_stage_advance=true` cho task/mẫu cột Tiếp nhận.

## Bình luận SX — tin tải file không hiện 2 nút

Trạng thái: **FE local, chưa commit.**

Upload 1 file (TB-2026-817, `ANH PHÚC LONG AN - ĐƠN 4.xlsx`) chỉ 1 bản ghi
`file_attachments` + 1 tin 📎; UI hiện tên file tải được *và* thẻ tải bên dưới.
Tên trong pill chỉ còn in đậm; tải file ở chip/preview.

Hoàn tác: revert `CommentsPanels.jsx` (`renderSystemCommentBody`).

## HCB — đủ NV mặc định phân loại trên dự án

Trạng thái: **SQL 609 đã chạy primary + backup; BE local.**

Đơn HCB mới không còn cắt còn 1 phụ trách chính. Đơn đang thiếu đã được
bổ sung đủ NV setup phân loại (Tủ bếp 20, Cánh kính 9) vào đội SX + tab
Thành viên (role SX/VC). Công ty khác vẫn `primaryOnly`.

Hoàn tác: xóa dòng staff/member vừa thêm (không đụng `is_primary` cũ).

## HCB Cánh kính — hiện lại cột thanh toán

Trạng thái: **SQL 608 đã chạy primary + backup; FE local.**

Cột «Đợi thanh toán» / thu tiền / nợ quá hạn bị `group_key=cong_no` nên tab
Sản xuất dời sang tab Công nợ. Gỡ group_key trên Cánh kính+Cửa; Tủ bếp giữ tab.

Hoàn tác: gán lại `group_key='cong_no'` cho 3 cột đó.

## Tab Công việc SX — Xong hết + hiện việc

Trạng thái: **local, chưa commit.**

Cột lớn (GIA CÔNG…) và từng cột nhỏ: nút **Xong hết** (tích hoàn thành
hàng loạt). Nút **Hiện việc** / bấm tên cột nhỏ để mở danh sách nhiệm vụ
thuộc nhóm đó (cháu).

Hoàn tác: revert khối `sxPlanGroups` trong `CRMTasksTab.jsx`.

## Quản lý NV — hạn kế hoạch SX (từ ngày lắp)

Trạng thái: **local, chưa commit.**

Thẻ `/sx/project-tasks` lấy hạn từ kế hoạch SX (panel indigo chi tiết dự án)
khi nhiệm vụ chưa có deadline. Cột song song dùng hạn cột cha (`group_key`:
Gia công → cabinet, Hoàn thiện → finishing, Tiếp nhận/KH/Duyệt → planning).

Hoàn tác: revert `workTasks.js`, `sxInstallPlanKanbanDeadline.js`,
`sxWorkshopSchedule.js` (BE+FE), `ProductionDetail.jsx`.

## Tab Công việc SX — cha / con, ẩn cháu

Trạng thái: **local, chưa commit.**

Tab Công việc chi tiết dự án: cột lớn (Tiếp nhận, Gia công…) = cha;
cột nhỏ (HT nhôm…) = con. Dòng nhiệm vụ (cháu) không hiện.

Hoàn tác: revert `CRMTasksTab.jsx` (`sxPlanGroups`).

## Quản lý NV xưởng — bấm thẻ vào chi tiết dự án

Trạng thái: **local, chưa commit.**

Thẻ trên `/sx/project-tasks` mở Giao việc của dự án (`?project_id=`).
Chi tiết dự án `/sx/projects/:id` vẫn mở từ dải trên trang Giao việc.

Hoàn tác: revert `overviewCardHref` trong `ProjectTasksOverviewPage.jsx`.

## Kanban SX — nút mở quản lý nhiệm vụ theo dự án

Trạng thái: **FE local, chưa commit.**

Nút ô vuông trên thẻ Kanban xưởng mở `/sx/project-tasks?project=…`.
Nút to hơn (32px), nền tím, nằm riêng bên trái cụm icon nhỏ.

Hoàn tác: revert `ProductionDashboard.jsx` (nút thẻ), `ProjectTasksOverviewPage.jsx`.

## Work Unified Deadline — thẻ gọn, hạn nổi

Trạng thái: **local, chưa commit.**

View Deadline bỏ ĐA MODULE, deal, SĐT, badge CRM/SX/VC. Thẻ còn mã + tên,
từng hạn SX/Giao/Lắp một dòng, rồi công đoạn · người phụ trách. Kanban/Planner
giữ thẻ cũ.

Hoàn tác: revert `WorkUnifiedOverviewPage.jsx` (`WorkKanbanCard` variant deadline).

## Quản lý nhiệm vụ xưởng — cột theo hạn

Trạng thái: **local, chưa commit.**

`/sx/project-tasks` (và CRM/VC cùng trang): 6 cột Quá hạn / Hôm nay / Ngày mai /
Trong tuần / Tuần sau / Chưa có hạn. Thẻ trong cột: mã dự án, tên việc, hạn,
tiến độ n/N, người phụ trách. Hạn sau tuần sau gom vào «Tuần sau».

Hoàn tác: revert `ProjectTasksOverviewPage.jsx`, `ProjectTasksFilterPanel.jsx`.

## Ma trận gộp cột — hạn kế hoạch + người phụ trách cột

Trạng thái: **local, chưa commit.**

Panel «Kế hoạch SX» trên chi tiết khớp cột gộp (từng cột nhỏ + NV setup pipeline).
Ô ma trận song song hiện hạn (tính từ ngày lắp) và người chịu trách nhiệm cột.

Hoàn tác: revert `WorkshopInfoPanel` / `SxMaTranSongSong` / `sxKanbanStages` default_staff.

## Chi tiết SX — bấm vòng tròn tích việc song song

Trạng thái: **local, chưa commit.**

Thanh tiến độ chi tiết: bấm vòng tròn việc song song để tích/bỏ hoàn thành;
việc đã tích hiện ✓. Bấm tên cột vẫn chuyển thẻ. Ma trận Kanban dùng cùng bảng.

Hoàn tác: revert `PipelineStepper.jsx`.

## HCB Tủ bếp — mở Ban thành phẩm thành 3 cột

Trạng thái: **đã chạy SQL 607 trên primary; backup chạy kèm 604 (thiếu group_key).**

Cột «Ban thành phẩm» → **Chuẩn bị vật tư** (3 đơn giữ nguyên) + thêm **Đặt kính**, **Sơn**.
Các cột sau (ĐANG SX THÙNG, HT NHÔM…) lùi thứ tự. `group_key` vẫn `gia_cong`.

Hoàn tác: đổi tên lại Ban thành phẩm, xóa 2 cột Đặt kính/Sơn, dồn thẻ về cột 4.

## Work Unified — KPI không đổi khi bấm tab tiến độ

Trạng thái: **đã push main (`e14b41b0`).**

Thẻ Đang thực hiện / Đúng tiến độ / Nguy cơ / Trễ luôn đếm trên cùng bộ lọc
(công ty, NV, khu vực, hạn, tìm, công đoạn). Tab tiến độ chỉ lọc danh sách,
không đổi 4 số KPI. Không trộn `items.length` của tab hiện tại với `stats` API.

Hoàn tác: revert `WorkUnifiedOverviewPage.jsx`.

## Ma trận SX — ô Đang làm / Xong hiện tên dự án

Trạng thái: **local, chưa commit.**

`SxMaTranSongSong`: ô việc song song (Đang làm, Xong) ghi tên dự án dưới nhãn
trạng thái, cùng nguồn tên với thẻ Kanban bên trái.

Hoàn tác: revert khối ô trong `ProductionDashboard.jsx` (`SxMaTranSongSong`).

## Deadline CRM — tick «đã tương tác» không còn ẩn hạn

Trạng thái: **RPC primary + backup đã chạy (SQL 606); code FE/BE local đã sửa; production FE chưa deploy.**

Tick xanh «đã tương tác» chỉ còn đánh dấu cá nhân. Không đẩy thẻ sang «Không hạn»
và không ẩn badge Quá hạn (Deadline / Kanban). LEAD-2026-279 của Admin Q2 sẽ
hiện lại ở cột Quá hạn sau khi RPC primary + FE/BE lên production.

Hoàn tác: revert `moduleDeadlinePolicy` (BE/FE), `crmLeadDeadlineDisplay.js`,
`leadsList.js` `crmDeadlineTsForRow`, `dailyReportMetrics.js`, SQL 605.

## Xóa 2 đơn Cửa Phúc Đạt (Minh)

Trạng thái: **đã chạy trên DB, script local chưa commit.**

Đã xóa đúng bản Phúc Đạt trên Kanban Cửa:
- `TB-2026-767` / `DEAL-2026-1401` (Anh Tám)
- `TB-2026-337` / `DEAL-2026-440` (Anh Hường)

Giữ nguyên xưởng khác (Anh Tám): Metalla `TB-2026-740`, HCB `754`/`755`/`764`/`765`/`827`.
Anh Hường không có bản xưởng khác. Snapshot thùng rác + rollback
`backend/uploads/_delete_phucdat_minh_two_orders_1789180288590.json`.
Script: `backend/scripts/delete-phucdat-minh-two-orders.js`.

Hoàn tác: khôi phục từ Thùng rác (project + deal).

## CRM thêm SX — chỉ 1 NV xưởng; phụ trách chính thêm người

Trạng thái: **local, chưa commit.**

Khi CRM thêm sản xuất (tạo dự án / bàn giao / intake / đổi xưởng), hệ thống
chỉ gắn **1 người chịu trách nhiệm chính** (setup phân loại hoặc NV handover),
không còn đổ cả đội / cả xưởng vào `project_production_staff`.

Phụ trách chính module (CRM / SX / VC) được thêm NV vào dự án:
`POST/DELETE /projects/:id/production-staff` + tab Thành viên (NV SX đồng bộ đội).
Chi tiết SX: ô «Thêm NV vào dự án» dưới Đội SX.

Hoàn tác: revert `productionWorkshopTypeStaff.js`, `autoDealWonProject.js`,
`projects.js` (route production-staff), `ProductionDetail.jsx`, `LeadChatTabs.jsx`.

## Báo cáo phát sinh — phân tích + bài học

Trạng thái: **local, chưa commit.**

Trang `/management/shared-workspace-report` có tab **Phân tích** (mặc định) và
**Danh sách**. Phân tích theo tuần / tháng / bộ phận / dự án / nhân viên / loại;
sinh bài học rút kinh nghiệm. Excel xuất thêm các sheet này. API field `analysis`.

Hoàn tác: revert `sharedWorkspaceAssignmentsAnalysis.js` + report helper/page/excel.

## Hồ sơ liên thông — thêm TT cơ bản theo module

Trạng thái: **local, chưa commit.**

Work Unified: chip CRM/SX/VC và khối «Hồ sơ liên thông» chỉ hiện module dự án
đang có (VC ẩn nếu chưa bàn giao / chưa gắn công ty VC hoặc cột Kanban VC).
Hồ sơ thêm địa chỉ, khu vực, giai đoạn, phân loại, phụ trách, ngày lắp.

Hoàn tác: revert `projectDealBundle.js`, `ProjectOverviewPanel.jsx`,
`WorkUnifiedProjectDetailPage.jsx`.

## Tổng quan dự án — cụm nhiệm vụ như trang Quản lý nhiệm vụ

Trạng thái: **local, chưa commit.**

Tab Tổng quan Work Unified (`ProjectOverviewPanel`) không còn liệt kê từng việc lẻ
«Công việc trọng yếu». Gọi `/work-tasks/project-overview?project_id=` — cùng thuật
gom cụm với `/crm/project-tasks`, chỉ hồ sơ đang mở. Bấm dòng → tab Công việc.

Hoàn tác: revert `workTasks.js` + `ProjectOverviewPanel.jsx` + prop `projectId`.

## Luồng tổng quan — gộp Giao nhận

Trạng thái: **local, chưa commit.**

Luồng thực hiện (Work Unified / tab Tổng quan) gộp 3 bước «Chuẩn bị vật tư»,
«Giao hàng», «Lắp đặt» thành **một** bước **Giao nhận**. Kanban cột workflow_stages
trong DB không đổi; chỉ hiển thị + lọc stage.

Hoàn tác: revert `projectDealBundle.js` + `management.js`.

## HCB — pipeline cũ + chỉnh tiến trình Tủ bếp

Trạng thái: **600/601 pipeline cũ; 602 kéo thẻ Tủ bếp đúng cột (primary + backup).**

Quy tắc 602 (không đụng CHỐT CÔNG NỢ / Cánh kính / Cửa):
- đang lắp hoặc ngày giao/lắp đã qua → ĐÃ GIAO
- shipping + giao ngày mai → NGÀY MAI GIAO
- shipping / đã bàn giao VC → ĐÃ CHUẨN BỊ XONG
- Ban thành phẩm, giao hôm nay hoặc trước → KCS

Primary Tủ bếp: Tiếp nhận 8 · Kế hoạch 1 · Ban TP 22 · KCS 9 · Chuẩn bị xong 3 · Mai giao 2 · Đã giao 70 · CHỐT CN 215.

Cánh kính giữ: sản xuất 6, Đợi TT 5, Hoàn thành 149, Hủy 2. Cửa 0 thẻ.

F5 Kanban SX.

## Tab Tiến độ Unified — nhiều xưởng SX / VC

Trạng thái: **local, chưa commit.**

Tab Tiến độ Work Unified hiện **từng dự án SX** và **từng nơi VC/LĐ** khi deal đặt
nhiều xưởng. Stepper đủ cột; dưới bước ghi ngày `dd/mm/yyyy` (không giờ). CRM lấy
lịch sử stage; SX/VC lấy ngày vào cột hiện tại và mốc hoàn thành/giao/lắp.

Hoàn tác: revert `WorkUnifiedProjectDetailPage.jsx`, `PipelineStepper.jsx`,
`autoDealWonProject.js`, `projectDealBundle.js`.

## Tổng quan công việc — chỉ từ deal đã ký HĐ

Trạng thái: **local, chưa commit.**

`/management/work-overview` không lấy lead: dự án/việc chỉ deal đã ký HĐ (mốc
`is_won` / `contract_signed`) trở đi. Thẻ «Công việc quá hạn» trước đây gọi
`/work-tasks` (gồm `CRM-Lead`, cắt 50 dòng). Nay lọc `unified_tasks_v` theo
project/deal đã ký, loại `CRM-Lead` và việc cá nhân.

Hoàn tác: revert `management.js`, `WorkOverviewPage.jsx`.

## Sidebar — gỡ «Dashboard dự án»

Trạng thái: **local, chưa commit.**

Bỏ mục trùng `/management/work-unified` ở nhóm «2. Làm việc». Vào trang đó vẫn từ
«Work Unified» (Tổng quan). Hoàn tác: thêm lại dòng trong `Sidebar.jsx`.

## GCCK đã hoàn thành SX — không hiện trễ hạn

Trạng thái: **local, chưa commit.**

Work Unified / Tổng quan công việc đếm trễ theo ngày lắp. Đơn Cánh kính (tên `GCCK-…`
hoặc loại xưởng «Cánh kính») đã sang cột SX «Hoàn thành» / đã giao thì **không** hiện
«Trễ hạn». GCCK còn đang sản xuất, và tủ bếp/cửa dù cột hoàn thành, vẫn đếm trễ như cũ.

Hoàn tác: revert `projectForecast.js`, `management.js`, `projectDealBundle.js`.

## Tổng quan công việc lấy cùng tập Work Unified

Trạng thái: **local, chưa commit.**

`/management/work-overview` trước đây đếm `projects` trực tiếp (thiếu deal CRM
đặt xưởng khác, khu vực theo project_id lead). Đã dùng chung `queryWorkUnifiedList`
với `/work-unified` cho «Dự án đang thực hiện» và «Dự án cần chú ý».

Doanh thu 6 tháng / KH mới / việc quá hạn vẫn nguồn cũ (`projects.estimated_value`,
`crm_leads` type=lead, `unified_tasks_v`).

Hoàn tác: revert `backend/src/routes/management.js`.

## Work Unified tab Bình luận — deal con che thread gốc

Trạng thái: **local, chưa commit.**

TB-2026-800 (`6ddb5e86-…`): deal con Hucabi `DEAL-2026-1515` (0 comment, updated_at mới hơn)
đè deal gốc Phúc Đạt `DEAL-2026-1459` (60 comment). Tài khoản Trương Trọng Thành
(admin HST, `comment_show_on_screen=true`) không lỗi quyền — tab Chat lấy `primary_lead`
theo `updated_at DESC`.

Đã vá: `projectDealBundle` chọn deal gốc (`sortProjectCrmDeals`) + đếm comment cả thread;
FE `pickPrimarySxCrmDeal`. Hoàn tác: revert `projectDealBundle.js`,
`WorkUnifiedProjectDetailPage.jsx`.

## Bình luận HST mặc định — chỉ mục bị cắt 1.000 dòng

Trạng thái: **đã push `cd6d001b` lên main.**

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
