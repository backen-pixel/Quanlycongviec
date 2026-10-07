'use strict';
const hasFounderScopes = scopes => Array.isArray(scopes) && scopes.some(s => s === 'founder_read' || s === 'founder_write');
function founderKeyManagement(role, currentScopes, requestedScopes = currentScopes) {
  if (!hasFounderScopes(currentScopes) && !hasFounderScopes(requestedScopes)) return { ok: true };
  if (!['admin', 'ecosystem_admin'].includes(role)) return { ok: false, status: 403, error: 'Chỉ admin mới quản lý ủy quyền Founder' };
  if (hasFounderScopes(requestedScopes) && requestedScopes.some(s => !['founder_read', 'founder_write'].includes(s))) {
    return { ok: false, status: 400, error: 'Dùng API key riêng cho founder_read/founder_write; không trộn scope cũ' };
  }
  return { ok: true };
}
module.exports = { hasFounderScopes, founderKeyManagement };
