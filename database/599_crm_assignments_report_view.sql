-- 599 — View phục vụ báo cáo nhiệm vụ phát sinh (/management/shared-workspace-report)
--
-- ĐÃ CHẠY TRÊN PRODUCTION (2026-09-11). Chạy lại an toàn (drop + create).
--
-- ══ VÌ SAO ══
-- Endpoint cũ nạp TOÀN BỘ dòng khớp rồi mới lọc / sắp / phân trang trong JS, nên
-- `limit`/`offset` không giảm việc gì. Đo trên dữ liệu thật, select đầy đủ (6 bảng join):
--        50 dòng →  241ms (   61KB)
--       200 dòng →  344ms (  245KB)
--       500 dòng →  464ms (  617KB)
--     1.000 dòng →  621ms (1.228KB)
-- Trong khi chỉ lấy id thì phẳng ~150ms bất kể số dòng. Nghĩa là chi phí của cách cũ
-- tăng tuyến tính theo TỔNG số dòng khớp, dù người dùng chỉ xem 50 dòng đầu.
--
-- Không đẩy được bộ lọc xuống SQL vì hai bộ lọc nằm ngoài bảng chính:
--   • tìm theo chữ  — quét cả mã/tên lead, mã/tên dự án, tên người tạo, tên+email người nhận
--   • lọc người nhận — nằm ở bảng junction crm_assignment_assignees
--
-- ══ VIEW NÀY LÀM GÌ ══
-- Chỉ thêm 3 CỘT DẪN XUẤT. Không chứa quyết định nghiệp vụ nào — mọi luật lọc vẫn nằm
-- trong JS (helpers/sharedWorkspaceAssignmentsReport.js), dựng bằng query builder. Chủ ý
-- như vậy để không lặp lại bài học ở workTasks: nhân đôi logic sang SQL thì mỗi lần sửa
-- một bên là bên kia SAI IM LẶNG.
--
--   search_text            gộp đúng các trường mà matchesClientFilters() vẫn quét
--   effective_assignee_ids người nhận: junction nếu có, không thì cột assignee_id
--   involved_user_ids      ai "có liên quan": được giao / người tạo / trong junction
--                          (đúng định nghĩa getUserInvolvedAssignmentIds)
--
-- Ba cột dùng subquery tương quan nên Postgres CHỈ tính khi truy vấn thật sự dùng tới.
-- Mở trang mà không tìm kiếm: kế hoạch rút còn 2 bảng, 1,46 ms.
--
-- ══ ĐỐI CHIẾU ══
-- effective_assignee_ids khớp 12/12 dòng với row.assignees của JS.
-- search_text cho cùng kết quả với matchesClientFilters trên 8 từ khoá (kể cả tiếng Việt
-- có dấu và từ không khớp gì).
-- involved_user_ids: lệch đúng 4 dòng so với đếm thô, và cả 4 đều có lead_id = null —
-- vốn đã bị báo cáo loại từ đầu (view dùng inner join crm_leads, giống lead:crm_leads!inner).

drop view if exists public.crm_assignments_report_v;

create view public.crm_assignments_report_v as
select
  a.id, a.company_id, a.executor_company_id, a.lead_id, a.crm_task_id, a.assignment_module,
  a.task_source_type, a.employee_error_module, a.error_type_id, a.department_id, a.phat_sinh_kind,
  a.assignee_id, a.created_by_id, a.priority, a.status, a.deadline, a.created_at,

  coalesce(
    (select array_agg(aa.user_id) from crm_assignment_assignees aa where aa.assignment_id = a.id),
    case when a.assignee_id is null then null else array[a.assignee_id] end
  ) as effective_assignee_ids,

  (
    select array_agg(distinct x) from (
      select aa.user_id as x from crm_assignment_assignees aa where aa.assignment_id = a.id
      union all select a.assignee_id where a.assignee_id is not null
      union all select a.created_by_id where a.created_by_id is not null
    ) s
  ) as involved_user_ids,

  lower(concat_ws(' ',
    a.title, a.description, l.code, l.title, p.code, p.name, cb.full_name,
    (select string_agg(concat_ws(' ', u.full_name, u.email), ' ')
       from crm_assignment_assignees aa join users u on u.id = aa.user_id
      where aa.assignment_id = a.id)
  )) as search_text

from crm_assignments a
join crm_leads l on l.id = a.lead_id          -- khớp lead:crm_leads!inner của báo cáo
left join projects p on p.id = l.project_id
left join users cb on cb.id = a.created_by_id;

comment on view public.crm_assignments_report_v is
  'Báo cáo phát sinh: chỉ thêm cột dẫn xuất (search_text, effective_assignee_ids, involved_user_ids) để lọc/phân trang được trong SQL. Luật lọc vẫn ở JS.';

grant select on public.crm_assignments_report_v to authenticated, service_role;
