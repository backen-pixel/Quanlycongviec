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
  void invalidateTags([PROJECTS_LIST_TAG]).catch(() => {});
}

/** Middleware: xoá cache sau khi một request ghi kết thúc thành công. */
function invalidateProjectsListOnWrite(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  res.on('finish', () => {
    if (res.statusCode < 400) invalidateProjectsList();
  });
  next();
}

module.exports = { PROJECTS_LIST_TAG, invalidateProjectsList, invalidateProjectsListOnWrite };
