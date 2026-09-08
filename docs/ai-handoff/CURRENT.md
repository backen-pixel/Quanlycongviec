# Trạng thái công việc hiện tại

Cập nhật: 2026-09-08 15:40 (UTC+7)

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
