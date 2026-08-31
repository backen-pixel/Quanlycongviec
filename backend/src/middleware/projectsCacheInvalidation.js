/**
 * Tự động xoá response-cache của danh sách dự án khi có thay đổi.
 *
 * Bảng `projects` bị ghi từ hơn 40 chỗ nằm rải rác ở nhiều route (projects, production,
 * logistics, crm, vc-handover, workshop-teams…). Rắc `invalidateTags` vào từng chỗ vừa
 * dễ sót vừa khó bảo trì, nên thay vào đó chặn ở tầng middleware: bất kỳ request KHÔNG
 * phải GET nào đi vào các prefix có thể sửa dự án, nếu trả về thành công (<400) thì xoá
 * tag `projects:list`.
 *
 * TTL của cache vốn đã ngắn (20–30s) nên kể cả có sót đường ghi nào thì dữ liệu cũng tự
 * làm mới sau vài chục giây — đây là lưới an toàn, không phải nguồn đúng đắn duy nhất.
 */

const { invalidateTags } = require('./responseCache');

const PROJECTS_LIST_TAG = 'projects:list';

/** Xoá cache danh sách dự án (fire-and-forget, không chặn response). */
function invalidateProjectsList() {
  void invalidateTags([PROJECTS_LIST_TAG, 'project-deal']).catch(() => {});
}

/**
 * POST nhưng CHỈ ĐỌC — các endpoint truy vấn buộc dùng POST vì payload dài (danh sách id).
 * CRM Dashboard gọi chúng liên tục mỗi lần tải/đổi bộ lọc. Nếu tính là "ghi" thì cache
 * `projects:list` bị xoá gần như không ngừng — mà xoá theo tag nên ảnh hưởng cache của MỌI
 * người dùng, triệt tiêu tác dụng của cache (đo được: 2.3s → 0.12s khi còn cache).
 * Đã rà từng handler: không có .update/.insert/.delete/.upsert nào.
 * Đường dẫn tính theo req.path (tương đối với prefix đã mount, vd '/api/crm').
 */
const READ_ONLY_POST_PATHS = new Set([
  '/ledger-net-by-leads',
  '/leads-deadlines',
  '/kanban-stage-pages',
  '/deadline-bucket-counts',
  '/deadline-bucket-pages',
  '/kpi-ledger-total',
]);

/** Middleware: xoá cache sau khi một request ghi kết thúc thành công. */
function invalidateProjectsListOnWrite(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  if (req.method === 'POST' && READ_ONLY_POST_PATHS.has(req.path)) return next();
  res.on('finish', () => {
    if (res.statusCode < 400) invalidateProjectsList();
  });
  next();
}

module.exports = { PROJECTS_LIST_TAG, invalidateProjectsList, invalidateProjectsListOnWrite };
