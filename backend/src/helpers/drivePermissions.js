/**
 * Module Drive — phân quyền truy cập file/folder/root.
 *
 * Hai tầng kết hợp:
 *  1) Quyền module (`drive.view|upload|share|delete|...`) qua bảng permissions/user_permissions.
 *     - Admin & các role có permission `drive.*` được xét trước.
 *  2) ACL chi tiết trên `drive_acl` (target_type/target_id ↔ principal_type/principal_id).
 *     - Kế thừa: 1 folder share → mọi file/folder con kế thừa role đó.
 *     - Owner mặc định:
 *         + Drive cá nhân (scope='user'): owner = chính user đó.
 *         + Drive công ty (scope='company'): mọi user thuộc company là 'editor', owner = user có drive.manage_shared trong company.
 *         + Drive chung (scope='shared'): chỉ thành viên được share mới truy cập (trừ admin / drive.manage_shared).
 *  3) Hierarchy ROLES: owner > editor > commenter > viewer.
 */

const { supabase } = require('../config/supabase');
const { isAdminLike } = require('./adminRole');

const ROLE_ORDER = { viewer: 1, commenter: 2, editor: 3, owner: 4 };

function roleAtLeast(have, need) {
  return (ROLE_ORDER[have] || 0) >= (ROLE_ORDER[need] || 0);
}

function maxRole(a, b) {
  if (!a) return b;
  if (!b) return a;
  return (ROLE_ORDER[a] || 0) >= (ROLE_ORDER[b] || 0) ? a : b;
}

/** Trả về danh sách principal id user thuộc về: { user_id, dept_ids, company_id, role_ids } */
async function resolveUserPrincipals(user) {
  const userId = user?.userId || user?.id;
  if (!userId) return { user_id: null, dept_ids: [], company_id: null, role_ids: [] };

  const out = { user_id: userId, dept_ids: [], company_id: user?.company_id || null, role_ids: [] };

  // department + company
  try {
    const { data: u } = await supabase
      .from('users')
      .select('department_id,company_id')
      .eq('id', userId)
      .maybeSingle();
    if (u?.department_id) out.dept_ids.push(u.department_id);
    if (!out.company_id && u?.company_id) out.company_id = u.company_id;
  } catch (_) {}

  // user_departments nhiều phòng ban (nếu có)
  try {
    const { data: ud } = await supabase
      .from('user_departments')
      .select('department_id')
      .eq('user_id', userId);
    for (const r of ud || []) if (r.department_id) out.dept_ids.push(r.department_id);
  } catch (_) {}

  // role names → ids (đối chiếu với bảng roles)
  try {
    const names = Array.from(new Set([user?.role, ...(Array.isArray(user?.roles) ? user.roles : [])].filter(Boolean)));
    if (names.length) {
      const { data: roles } = await supabase.from('roles').select('id,name').in('name', names);
      out.role_ids = (roles || []).map((r) => r.id);
    }
  } catch (_) {}

  out.dept_ids = Array.from(new Set(out.dept_ids));
  return out;
}

/**
 * Tải tổ tiên (root + folder cha → folder cha cha ...) của 1 file hoặc folder.
 * Trả về [{ type, id }, ...] theo thứ tự từ ngoài vào trong (root trước).
 */
async function loadAncestors({ targetType, targetId }) {
  const chain = [];
  let curType = targetType;
  let curId = targetId;
  let rootId = null;

  if (curType === 'root') {
    chain.push({ type: 'root', id: curId });
    return { chain, rootId: curId };
  }

  if (curType === 'file') {
    const { data: f } = await supabase
      .from('drive_files')
      .select('id, folder_id, root_id')
      .eq('id', curId)
      .maybeSingle();
    if (!f) return { chain, rootId: null };
    chain.unshift({ type: 'file', id: f.id });
    rootId = f.root_id;
    curType = 'folder';
    curId = f.folder_id;
  }

  // walk up folders
  const visited = new Set();
  while (curType === 'folder' && curId && !visited.has(curId)) {
    visited.add(curId);
    const { data: fld } = await supabase
      .from('drive_folders')
      .select('id, parent_id, root_id')
      .eq('id', curId)
      .maybeSingle();
    if (!fld) break;
    chain.unshift({ type: 'folder', id: fld.id });
    rootId = rootId || fld.root_id;
    curId = fld.parent_id;
  }

  if (rootId) chain.unshift({ type: 'root', id: rootId });
  return { chain, rootId };
}

/**
 * Tải tất cả ACL áp dụng cho 1 chain (root → ... → target).
 * Trả về role tốt nhất user có trên target.
 */
async function aclRoleForChain(chain, principals) {
  if (!chain.length) return null;

  const targets = chain.map((c) => c.id);
  const targetTypes = Array.from(new Set(chain.map((c) => c.type)));

  // 1) load all ACL rows for any target in chain
  const { data: acls } = await supabase
    .from('drive_acl')
    .select('target_type,target_id,principal_type,principal_id,role')
    .in('target_id', targets)
    .in('target_type', targetTypes);

  let best = null;
  for (const a of acls || []) {
    // verify target_type/target_id pair belongs to chain
    if (!chain.some((c) => c.type === a.target_type && c.id === a.target_id)) continue;

    if (a.principal_type === 'everyone') {
      best = maxRole(best, a.role);
      continue;
    }
    if (a.principal_type === 'user' && a.principal_id === principals.user_id) {
      best = maxRole(best, a.role);
    } else if (a.principal_type === 'department' && principals.dept_ids.includes(a.principal_id)) {
      best = maxRole(best, a.role);
    } else if (a.principal_type === 'company' && a.principal_id === principals.company_id) {
      best = maxRole(best, a.role);
    } else if (a.principal_type === 'role' && principals.role_ids.includes(a.principal_id)) {
      best = maxRole(best, a.role);
    }
  }

  return best;
}

/**
 * Trả về role tối đa của user trên 1 root (không xét ACL chi tiết của file/folder con).
 * - Owner mặc định: scope='user' → chính user owner_id.
 * - scope='company': mọi user thuộc company được editor; user có quyền drive.manage_shared trên company là owner.
 * - scope='shared': không mặc định gì (phải share rõ ràng).
 */
async function defaultRoleOnRoot(root, principals, user) {
  if (!root) return null;
  if (root.scope === 'user') {
    if (root.owner_id === principals.user_id) return 'owner';
    return null;
  }
  if (root.scope === 'company') {
    if (root.owner_id && root.owner_id === principals.company_id) {
      // user trong cùng company có editor mặc định.
      // Nếu user có quyền drive.manage_shared → coi như owner.
      if (isAdminLike(user)) return 'owner';
      return 'editor';
    }
    return null;
  }
  if (root.scope === 'shared') return null;
  return null;
}

/**
 * Tính role thực tế của user trên 1 target (file/folder/root).
 * Trả về string role hoặc null nếu không có quyền nào.
 */
async function effectiveRole({ user, targetType, targetId }) {
  if (!user) return null;
  if (isAdminLike(user)) return 'owner';

  const principals = await resolveUserPrincipals(user);
  const { chain, rootId } = await loadAncestors({ targetType, targetId });
  if (!chain.length) return null;

  // ACL trên chain
  const aclRole = await aclRoleForChain(chain, principals);

  // Default role trên root
  let rootRole = null;
  if (rootId) {
    const { data: root } = await supabase.from('drive_roots').select('*').eq('id', rootId).maybeSingle();
    rootRole = await defaultRoleOnRoot(root, principals, user);
  }

  return maxRole(aclRole, rootRole);
}

/**
 * Kiểm quyền và trả về { ok, role }. Không throw — dùng trong route.
 */
async function canAccess({ user, targetType, targetId, requiredRole = 'viewer' }) {
  const role = await effectiveRole({ user, targetType, targetId });
  return { ok: !!role && roleAtLeast(role, requiredRole), role };
}

/**
 * Lọc danh sách target_id user có quyền tối thiểu requiredRole.
 * Dùng cho list folder/file (gọi theo lô để tiết kiệm round-trip).
 */
async function filterAccessibleIds({ user, targetType, targetIds, requiredRole = 'viewer' }) {
  if (!Array.isArray(targetIds) || targetIds.length === 0) return [];
  if (isAdminLike(user)) return targetIds.slice();
  const out = [];
  // Đơn giản hoá: chạy tuần tự nhưng có cache root (effectiveRole tự cache).
  // Có thể tối ưu sau bằng 1 SQL bulk.
  for (const id of targetIds) {
    const r = await effectiveRole({ user, targetType, targetId: id });
    if (r && roleAtLeast(r, requiredRole)) out.push(id);
  }
  return out;
}

/**
 * Liệt kê tất cả root_id mà user có quyền truy cập (>= viewer).
 * - Owner roots (user scope của chính user).
 * - Company roots khi user thuộc company.
 * - Roots/folders/files được share trực tiếp (ACL).
 */
async function listAccessibleRoots(user) {
  const principals = await resolveUserPrincipals(user);

  const accessible = new Map(); // root_id -> root

  // Roots mặc định: user của chính họ + company của họ.
  const orParts = [];
  if (principals.user_id) orParts.push(`and(scope.eq.user,owner_id.eq.${principals.user_id})`);
  if (principals.company_id) orParts.push(`and(scope.eq.company,owner_id.eq.${principals.company_id})`);

  if (orParts.length) {
    const { data: defRoots } = await supabase
      .from('drive_roots')
      .select('*')
      .or(orParts.join(','));
    for (const r of defRoots || []) accessible.set(r.id, r);
  }

  // Roots/file/folder được share qua ACL → trace ngược root_id.
  const principalFilters = [];
  if (principals.user_id) principalFilters.push(`and(principal_type.eq.user,principal_id.eq.${principals.user_id})`);
  if (principals.dept_ids.length) {
    const list = principals.dept_ids.join(',');
    principalFilters.push(`and(principal_type.eq.department,principal_id.in.(${list}))`);
  }
  if (principals.company_id) principalFilters.push(`and(principal_type.eq.company,principal_id.eq.${principals.company_id})`);
  if (principals.role_ids.length) {
    const list = principals.role_ids.join(',');
    principalFilters.push(`and(principal_type.eq.role,principal_id.in.(${list}))`);
  }
  principalFilters.push(`principal_type.eq.everyone`);

  const { data: acls } = await supabase
    .from('drive_acl')
    .select('target_type,target_id,role')
    .or(principalFilters.join(','));

  const sharedRootIds = new Set();
  const folderIds = [];
  const fileIds = [];
  for (const a of acls || []) {
    if (a.target_type === 'root') sharedRootIds.add(a.target_id);
    else if (a.target_type === 'folder') folderIds.push(a.target_id);
    else if (a.target_type === 'file') fileIds.push(a.target_id);
  }

  if (folderIds.length) {
    const { data: fs } = await supabase.from('drive_folders').select('root_id').in('id', folderIds);
    for (const f of fs || []) if (f.root_id) sharedRootIds.add(f.root_id);
  }
  if (fileIds.length) {
    const { data: fs } = await supabase.from('drive_files').select('root_id').in('id', fileIds);
    for (const f of fs || []) if (f.root_id) sharedRootIds.add(f.root_id);
  }

  if (sharedRootIds.size) {
    const { data: rs } = await supabase.from('drive_roots').select('*').in('id', Array.from(sharedRootIds));
    for (const r of rs || []) if (!accessible.has(r.id)) accessible.set(r.id, r);
  }

  // Admin: thấy mọi root.
  if (isAdminLike(user)) {
    const { data: all } = await supabase.from('drive_roots').select('*').limit(500);
    for (const r of all || []) if (!accessible.has(r.id)) accessible.set(r.id, r);
  }

  return Array.from(accessible.values());
}

module.exports = {
  ROLE_ORDER,
  roleAtLeast,
  maxRole,
  resolveUserPrincipals,
  effectiveRole,
  canAccess,
  filterAccessibleIds,
  listAccessibleRoots,
};
