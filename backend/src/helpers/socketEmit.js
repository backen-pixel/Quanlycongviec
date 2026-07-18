/**
 * Emit Socket.IO theo phạm vi company/user thay vì broadcast toàn server.
 * Client tự join `company:{id}` khi kết nối (server.js).
 * Admin hệ thống (không có company_id) join room `admins` để vẫn nhận fan-out.
 */

function companyRoom(companyId) {
  return companyId ? `company:${String(companyId)}` : null;
}

function userRoom(userId) {
  return userId ? `user:${String(userId)}` : null;
}

/**
 * @param {import('socket.io').Server|null|undefined} io
 * @param {{ companyId?: string|null, userId?: string|null, projectId?: string|null }} scope
 * @param {string} event
 * @param {unknown} data
 * @returns {'user'|'project'|'company'|'all'|null}
 */
function emitScoped(io, scope, event, data) {
  if (!io?.to && !io?.emit) return null;
  const userId = scope?.userId != null ? String(scope.userId) : null;
  const projectId = scope?.projectId != null ? String(scope.projectId) : null;
  const companyId = scope?.companyId != null ? String(scope.companyId) : null;

  if (userId) {
    io.to(userRoom(userId)).emit(event, data);
    return 'user';
  }
  if (projectId) {
    io.to(`project:${projectId}`).emit(event, data);
    return 'project';
  }
  if (companyId) {
    io.to(companyRoom(companyId)).emit(event, data);
    // Admin hệ thống không thuộc company vẫn cần thấy realtime (CRM/SX overview)
    io.to('admins').emit(event, data);
    return 'company';
  }
  io.emit(event, data);
  return 'all';
}

module.exports = {
  companyRoom,
  userRoom,
  emitScoped,
};
