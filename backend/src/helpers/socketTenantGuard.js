const { supabase } = require('../config/supabase');
const { companyInTenantContext, isTenantScopeEnforced } = require('./tenantScope');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isPlatformOrSystem(user) {
  const r = String(user?.role ?? '').trim().toLowerCase();
  return r === 'platform_admin' || r === 'system';
}

async function loadCompanyIdForResource(type, id) {
  if (!id || !UUID_RE.test(String(id))) return null;
  if (type === 'project') {
    const { data } = await supabase.from('projects').select('company_id, logistics_company_id').eq('id', id).maybeSingle();
    return data?.company_id || data?.logistics_company_id || null;
  }
  if (type === 'lead') {
    const { data } = await supabase.from('crm_leads').select('company_id').eq('id', id).maybeSingle();
    return data?.company_id || null;
  }
  if (type === 'dept') {
    const { data } = await supabase.from('departments').select('company_id').eq('id', id).maybeSingle();
    return data?.company_id || null;
  }
  return null;
}

/**
 * Gắn tenant context lên socket từ JWT + cache company ids.
 * @param {import('socket.io').Socket} socket
 * @param {object} reqLike — optional Express req đã qua attachTenantContext
 */
async function attachSocketTenantContext(socket, reqLike = null) {
  const user = socket.user;
  if (!user || isPlatformOrSystem(user)) {
    socket.tenantContext = { enforced: false };
    return;
  }
  if (reqLike?.tenantContext) {
    socket.tenantContext = reqLike.tenantContext;
    socket.tenantCompanyIds = reqLike.tenantCompanyIds;
    return;
  }
  const tenantId = user.tenant_id;
  if (!tenantId) {
    socket.tenantContext = { enforced: false };
    return;
  }
  const { getTenantCompanyIds, assertTenantActive } = require('./tenantScope');
  const active = await assertTenantActive(tenantId);
  if (!active.ok) {
    socket.tenantContext = { enforced: false, blocked: true, error: active.error };
    return;
  }
  const companyIds = await getTenantCompanyIds(tenantId);
  socket.tenantContext = { enforced: true, tenantId, companyIds };
  socket.tenantCompanyIds = companyIds;
}

function socketReqLike(socket) {
  return {
    user: socket.user,
    tenantContext: socket.tenantContext,
    tenantCompanyIds: socket.tenantCompanyIds,
  };
}

/**
 * Kiểm tra user socket được join room theo resource company_id.
 * @returns {Promise<boolean>}
 */
async function assertSocketResourceAccess(socket, type, id) {
  if (!socket?.user || isPlatformOrSystem(socket.user)) return true;
  if (!isTenantScopeEnforced(socketReqLike(socket))) return true;
  const companyId = await loadCompanyIdForResource(type, id);
  if (!companyId) return true;
  return companyInTenantContext(socketReqLike(socket), companyId);
}

/**
 * Wrapper join: chỉ join khi resource thuộc tenant.
 */
function guardedJoin(socket, room, type, id) {
  void (async () => {
    const ok = await assertSocketResourceAccess(socket, type, id);
    if (!ok) {
      socket.emit('tenant:access_denied', { type, id, room });
      return;
    }
    socket.join(room);
  })();
}

module.exports = {
  attachSocketTenantContext,
  assertSocketResourceAccess,
  guardedJoin,
  socketReqLike,
};
