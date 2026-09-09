# Trạng thái công việc hiện tại

Cập nhật: 2026-09-09 13:55 (UTC+7)

## Sửa deadline thẻ CRM — lỗi «Lỗi lưu deadline»

Trạng thái: **đã push nhánh feature, đang gộp main.**

`LeadInfoPanel.saveKanbanDeadline` gọi `setLead` (không có trong scope) sau khi
API thành công → alert generic dù hạn đã ghi DB. Đã bỏ `setLead`, reload qua
`onUpdate`. Backend bọc comment sau lưu; so sánh hạn theo timestamp.

## Ghim dự án góc phải (tối đa 5)

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

## Tách NextGo sang instance QLCV riêng — chuẩn bị, chưa cắt

Trạng thái: **đã kiểm kê + script + dump tool; chưa freeze, chưa đổi webhook.**

Nguồn: `87479a83-1145-43b7-b090-3e40812cb5a9`. Không dùng clone cùng DB.
Tài liệu: [`docs/ops/nextgo-instance/README.md`](../ops/nextgo-instance/README.md).
Khi anh nói chuyển: làm theo `CUTOVER.md` (`NEXTGO_CUTOVER=YES`).

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
