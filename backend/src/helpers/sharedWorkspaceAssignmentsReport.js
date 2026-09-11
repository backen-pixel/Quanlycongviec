/**
 * Báo cáo nhiệm vụ phát sinh (/management/shared-workspace-report).
 *
 * ══ VÌ SAO CÓ VIEW crm_assignments_report_v ══
 * Bản trước nạp TOÀN BỘ dòng khớp rồi mới lọc / sắp / phân trang trong JS, nên
 * `limit`/`offset` không giảm việc gì: mở trang xem 50 dòng vẫn kéo về đủ mọi dòng kèm
 * 6 bảng join. Lọc theo chữ và theo người nhận cũng ở JS nên không đẩy xuống SQL được —
 * chúng quét cả tên dự án, tên người nhận, mã lead… nằm ở bảng khác.
 *
 * View chỉ thêm ba CỘT DẪN XUẤT, không chứa quyết định nghiệp vụ nào:
 *   • search_text            — gộp đúng các trường mà bản JS vẫn quét
 *   • effective_assignee_ids — người nhận (junction nếu có, không thì cột assignee_id)
 *   • involved_user_ids      — ai "có liên quan" (được giao / người tạo / trong junction)
 * Mọi quyết định LỌC vẫn nằm ở file này, dựng bằng query builder — nên không có chuyện
 * hai nơi cùng định nghĩa một luật rồi lệch nhau.
 *
 * Postgres chỉ tính các cột đó khi truy vấn thật sự dùng tới: mở trang mà không tìm kiếm
 * thì kế hoạch chỉ còn 2 bảng (đo được 1,46 ms).
 */

const { supabase } = require('../config/supabase');
const { fetchAllByIdsParallel } = require('./supabaseFetchAll');

const REPORT_VIEW = 'crm_assignments_report_v';
const PAGE_SIZE = 1000;
/** Chặn vòng lặp chạy hoang nếu server phớt lờ .range(); 200 trang = 200.000 dòng. */
const MAX_PAGES = 200;
const SOURCE_TYPES = ['customer_request', 'employee_error'];
const MODULES = new Set(['crm', 'production', 'logistics']);
const STATUSES = new Set(['pending', 'in_progress', 'completed', 'cancelled']);
const PRIORITIES = new Set(['low', 'medium', 'high', 'urgent']);

const REPORT_SELECT = `
  id, company_id, executor_company_id, lead_id, crm_task_id, assignment_module,
  task_source_type, employee_error_module, error_type_id, department_id, phat_sinh_kind,
  title, description, assignee_id, created_by_id, priority, status, deadline,
  created_at, updated_at, completed_at,
  assignee:users!crm_assignments_assignee_id_fkey(id, full_name, email, department_id),
  created_by:users!crm_assignments_created_by_id_fkey(id, full_name, email),
  company:companies!crm_assignments_company_id_fkey(id, name, short_name),
  executor_company:companies!crm_assignments_executor_company_id_fkey(id, name, short_name),
  department:departments!crm_assignments_department_id_fkey(id, name),
  lead:crm_leads!inner(id, code, title, type, project_id)
`;

function clean(value) {
  return String(value == null ? '' : value).trim();
}

function parseLimit(value, fallback = 50) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(200, Math.max(1, Math.floor(n))) : fallback;
}

function parseOffset(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function startOfDateIso(value) {
  const s = clean(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00+07:00` : null;
}

function endOfDateIso(value) {
  const s = clean(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T23:59:59.999+07:00` : null;
}

/** `%` và `_` trong từ khoá người dùng là ký tự thường, không phải wildcard của LIKE. */
function escapeLike(value) {
  return String(value).replace(/([\\%_])/g, '\\$1');
}

function applyScalarFilters(query, filters, fixedCompanyId) {
  let q = query
    .not('lead_id', 'is', null)
    .in('task_source_type', SOURCE_TYPES);

  const companyId = fixedCompanyId || clean(filters.company_id);
  if (companyId) q = q.or(`company_id.eq.${companyId},executor_company_id.eq.${companyId}`);

  const moduleKey = clean(filters.assignment_module).toLowerCase();
  if (MODULES.has(moduleKey)) q = q.eq('assignment_module', moduleKey);

  const sourceType = clean(filters.task_source_type).toLowerCase();
  if (SOURCE_TYPES.includes(sourceType)) q = q.eq('task_source_type', sourceType);

  const errorModule = clean(filters.employee_error_module).toLowerCase();
  if (MODULES.has(errorModule)) q = q.eq('employee_error_module', errorModule);

  const status = clean(filters.status).toLowerCase();
  if (STATUSES.has(status)) q = q.eq('status', status);

  const priority = clean(filters.priority).toLowerCase();
  if (PRIORITIES.has(priority)) q = q.eq('priority', priority);

  const departmentId = clean(filters.department_id);
  if (departmentId) q = q.eq('department_id', departmentId);

  const phatSinhKind = clean(filters.phat_sinh_kind);
  if (phatSinhKind) q = q.eq('phat_sinh_kind', phatSinhKind);

  const from = startOfDateIso(filters.date_from);
  const to = endOfDateIso(filters.date_to);
  if (from) q = q.gte('created_at', from);
  if (to) q = q.lte('created_at', to);

  return q;
}

/**
 * Toàn bộ bộ lọc của báo cáo, dựng trên view.
 * `extra` để thêm điều kiện cho từng ô thống kê mà không phải viết lại bộ lọc.
 */
function buildReportFilter(filters, ctx, selectCols, selectOpts, extra) {
  let q = applyScalarFilters(
    supabase.from(REPORT_VIEW).select(selectCols, selectOpts),
    filters,
    ctx.fixedCompanyId,
  );

  // Người không phải admin chỉ thấy việc mình có liên quan. Bản cũ phải đọc trước danh
  // sách id rồi nhét vào .in(): vừa bị cắt im lặng ở 1.000 dòng (đo được: có người mất
  // 197 dòng), vừa đụng trần độ dài URL khi danh sách dài.
  if (ctx.viewerUserId) q = q.contains('involved_user_ids', [ctx.viewerUserId]);

  const assigneeId = clean(filters.assignee_id);
  if (assigneeId) q = q.contains('effective_assignee_ids', [assigneeId]);

  const term = clean(filters.q).toLocaleLowerCase('vi');
  if (term) q = q.like('search_text', `%${escapeLike(term)}%`);

  return extra ? extra(q) : q;
}

const sortPage = (q) => q
  .order('created_at', { ascending: false })
  .order('id', { ascending: false });

/** Đọc hết id khớp bộ lọc — chỉ dùng cho export. */
async function fetchAllMatchingIds(filters, ctx) {
  const ids = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const offset = page * PAGE_SIZE;
    const { data, error } = await sortPage(buildReportFilter(filters, ctx, 'id'))
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const chunk = data || [];
    ids.push(...chunk.map((row) => row.id));
    if (chunk.length < PAGE_SIZE) return ids;
  }
  console.warn(`[shared-workspace-report] chạm trần ${MAX_PAGES} trang — có thể còn dòng chưa đọc`);
  return ids;
}

/**
 * Thống kê trên TOÀN BỘ tập đã lọc — đếm bằng `head: true` nên không kéo dòng nào về.
 * Điều kiện của từng ô vẫn do JS quyết định, chỉ là diễn đạt dưới dạng filter.
 */
async function fetchSummary(filters, ctx, total) {
  const countOf = async (extra) => {
    const { count, error } = await buildReportFilter(
      filters, ctx, 'id', { count: 'exact', head: true }, extra,
    );
    if (error) throw error;
    return count || 0;
  };
  const nowIso = new Date().toISOString();
  const [pending, inProgress, completed, cancelled, customerRequest, employeeError, overdue] = await Promise.all([
    countOf((q) => q.eq('status', 'pending')),
    countOf((q) => q.eq('status', 'in_progress')),
    countOf((q) => q.eq('status', 'completed')),
    countOf((q) => q.eq('status', 'cancelled')),
    countOf((q) => q.eq('task_source_type', 'customer_request')),
    countOf((q) => q.eq('task_source_type', 'employee_error')),
    countOf((q) => q.neq('status', 'completed').not('deadline', 'is', null).lt('deadline', nowIso)),
  ]);
  return {
    total,
    pending,
    in_progress: inProgress,
    completed,
    cancelled,
    overdue,
    customer_request: customerRequest,
    employee_error: employeeError,
  };
}

/**
 * Một assignment có NHIỀU người nhận (đo được: trung bình 1,05 — cao nhất 44) nên một lô
 * id có thể trả về nhiều dòng hơn số id; fetchAllByIdsParallel lo cả phân trang lẫn chạy
 * các lô song song.
 */
async function attachReportAssignees(rows) {
  if (!rows.length) return;
  const ids = rows.map((row) => row.id);
  const COLS_FULL = 'assignment_id, user_id, assign_role, user:users(id, full_name, email, department_id)';
  const COLS_LEGACY = 'assignment_id, user_id, user:users(id, full_name, email, department_id)';
  // Phân trang bắt buộc phải có thứ tự tất định. Bản cũ không sắp xếp nên thứ tự người
  // nhận là thứ tự vật lý tuỳ tiện (đổi được sau mỗi lần cập nhật bảng); nay cố định
  // theo lúc được thêm vào.
  const tune = (q) => q.order('assignment_id', { ascending: true })
    .order('added_at', { ascending: true })
    .order('user_id', { ascending: true });

  let data;
  try {
    data = await fetchAllByIdsParallel({
      table: 'crm_assignment_assignees', columns: COLS_FULL, key: 'assignment_id', ids, tune,
    });
  } catch (e) {
    // DB chưa có cột assign_role → đọc lại bản rút gọn, giữ nguyên hành vi cũ.
    if (!/assign_role/.test(e.message || '')) throw e;
    data = await fetchAllByIdsParallel({
      table: 'crm_assignment_assignees', columns: COLS_LEGACY, key: 'assignment_id', ids, tune,
    });
  }

  const byAssignment = new Map();
  for (const item of data) {
    const key = String(item.assignment_id);
    if (!byAssignment.has(key)) byAssignment.set(key, []);
    if (item.user) byAssignment.get(key).push({ ...item.user, assign_role: item.assign_role || null });
  }
  for (const row of rows) {
    row.assignees = byAssignment.get(String(row.id)) || (row.assignee ? [row.assignee] : []);
  }
}

async function attachProjectLabels(rows) {
  const projectIds = [...new Set(rows.map((row) => row.lead?.project_id).filter(Boolean).map(String))];
  if (!projectIds.length) {
    rows.forEach((row) => { row.project = null; });
    return;
  }
  const projects = await fetchAllByIdsParallel({
    table: 'projects', columns: 'id, code, name', key: 'id', ids: projectIds,
    tune: (q) => q.order('id', { ascending: true }),
  });
  const map = new Map(projects.map((project) => [String(project.id), project]));
  rows.forEach((row) => {
    row.project = row.lead?.project_id ? (map.get(String(row.lead.project_id)) || null) : null;
  });
}

async function loadKindLabels() {
  const { data, error } = await supabase
    .from('shared_workspace_phat_sinh_kinds')
    .select('id, slug, name, company_id')
    .order('sort_order', { ascending: true })
    .range(0, PAGE_SIZE - 1);
  if (error) return {};
  const labels = {};
  for (const row of data || []) {
    if (row.id) labels[String(row.id)] = row.name;
    if (row.slug) labels[String(row.slug)] = row.name;
  }
  return labels;
}

/** Lấy đủ dữ liệu hiển thị cho ĐÚNG các dòng của trang hiện tại. */
async function hydrateRows(ids) {
  if (!ids.length) return [];
  const rows = await fetchAllByIdsParallel({
    table: 'crm_assignments', columns: REPORT_SELECT, key: 'id', ids,
    tune: (q) => q.order('id', { ascending: false }),
  });
  const byId = new Map(rows.map((row) => [String(row.id), row]));
  const ordered = ids.map((id) => byId.get(String(id))).filter(Boolean);
  const [, , kindLabels] = await Promise.all([
    attachReportAssignees(ordered),
    attachProjectLabels(ordered),
    loadKindLabels(),
  ]);
  ordered.forEach((row) => {
    row.phat_sinh_kind_name = kindLabels[String(row.phat_sinh_kind || '')] || row.phat_sinh_kind || null;
  });
  return ordered;
}

async function listSharedWorkspaceAssignmentsReport(filters = {}, scope = {}) {
  const ctx = {
    viewerUserId: scope.viewerUserId || null,
    fixedCompanyId: scope.fixedCompanyId || null,
  };

  const exportAll = clean(filters.export).toLowerCase() === '1';
  const offset = exportAll ? 0 : parseOffset(filters.offset);
  const limit = parseLimit(filters.limit);

  if (exportAll) {
    const ids = await fetchAllMatchingIds(filters, ctx);
    const [rows, summary] = await Promise.all([
      hydrateRows(ids),
      fetchSummary(filters, ctx, ids.length),
    ]);
    return {
      rows, summary, total: ids.length, offset: 0, limit: ids.length, has_more: false,
    };
  }

  // Một lượt: id của đúng trang này + tổng số dòng khớp.
  const { data, error, count } = await sortPage(
    buildReportFilter(filters, ctx, 'id', { count: 'exact' }),
  ).range(offset, offset + limit - 1);
  if (error) throw error;
  const total = count || 0;
  const ids = (data || []).map((row) => row.id);

  const [rows, summary] = await Promise.all([
    hydrateRows(ids),
    fetchSummary(filters, ctx, total),
  ]);
  return {
    rows, summary, total, offset, limit, has_more: offset + ids.length < total,
  };
}

module.exports = {
  listSharedWorkspaceAssignmentsReport,
};
