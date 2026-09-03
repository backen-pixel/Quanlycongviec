/**
 * Giải nén payload kiểu "từ điển" của GET /api/crm/assignments?dict=1 về ĐÚNG hình dạng cũ
 * (có `assignee`, `created_by`, `company`, `executor_company`, `lead`, `assignees`).
 *
 * Nhờ giải nén ngay tại tầng gọi API, toàn bộ phần còn lại của trang không cần biết là
 * server đã đổi cách trả dữ liệu — mọi component vẫn đọc `task.assignee.full_name` như cũ.
 *
 * Định dạng phải khớp với `backend/src/helpers/assignmentDictPayload.js`.
 */

/** @returns {Array<object>} danh sách nhiệm vụ ở hình dạng cũ (object nhúng đầy đủ). */
export function unpackAssignmentsDict(data) {
  const rows = data?.assignments || [];
  const dict = data?.dict;
  // Không có `dict` ⇒ server trả kiểu cũ (hoặc client gọi mà không bật `dict=1`): trả nguyên.
  if (!dict) return rows;

  const users = dict.users || {};
  const companies = dict.companies || {};
  const leads = dict.leads || {};
  const look = (bucket, id) => (id == null ? null : bucket[String(id)] || null);

  return rows.map((row) => {
    const out = { ...row };
    out.assignee = look(users, row.assignee_id);
    out.created_by = look(users, row.created_by_id);
    out.company = look(companies, row.company_id);
    out.executor_company = look(companies, row.executor_company_id);
    out.lead = look(leads, row.lead_id);

    const refs = Array.isArray(row.assignee_refs) ? row.assignee_refs : [];
    out.assignees = refs
      .map(([id, role]) => {
        const u = look(users, id);
        if (!u) return null;
        // Vai trò `null` = dòng không có bản ghi junction, server đã rơi về `assignee` đơn
        // lẻ. Giữ đúng như vậy: KHÔNG thêm assign_role, vì phía giao diện phân biệt
        // "không có vai trò" với "vai trò executor".
        return role ? { ...u, assign_role: role } : u;
      })
      .filter(Boolean);
    delete out.assignee_refs;

    return out;
  });
}
