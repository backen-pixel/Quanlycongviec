/**
 * NV nhiều module — mỗi module đúng 1 role.
 * users.role được suy ra (derived) để JWT / helper legacy không vỡ.
 */
const { supabase } = require('../config/supabase');
const { normalizeDriveModule } = require('./driveModuleDefaults');

const ALLOWED_MODULE_KEYS = new Set([
  'crm',
  'production',
  'logistics',
  'accounting',
  'purchasing',
  'tinhtoan',
]);

/** Role được phép theo module (UI + validate API). */
const MODULE_ROLE_OPTIONS = {
  crm: [
    'sales',
    'sales_admin',
    'designer',
    'customer_care',
    'region_admin',
    'manager',
    'crm_production_staff',
    'crm_production_admin',
    'staff',
  ],
  production: [
    'production_staff',
    'production_admin',
    'production',
    'crm_production_staff',
    'crm_production_admin',
  ],
  logistics: ['logistics_admin', 'driver', 'installer'],
  accounting: ['accounting'],
  purchasing: ['staff'],
  tinhtoan: ['staff'],
};

/** Module_key → các key Sidebar / canAccessModule được mở kèm. */
const MODULE_ACCESS_ALIASES = {
  crm: ['crm', 'customers'],
  production: ['production', 'tasks', 'projects'],
  logistics: ['logistics'],
  accounting: ['accounting'],
  purchasing: ['purchasing'],
  tinhtoan: ['tinhtoan'],
};

const MODULE_TO_DRIVE = {
  crm: 'crm',
  production: 'sx',
  logistics: 'vc',
  accounting: 'crm',
  purchasing: 'crm',
  tinhtoan: 'crm',
};

const DRIVE_PRIORITY = ['crm', 'production', 'logistics', 'accounting', 'purchasing', 'tinhtoan'];

/** Ưu tiên derive users.role (cao → thấp). */
const PRIMARY_ROLE_PRIORITY = [
  'admin',
  'platform_admin',
  'superadmin',
  'super_admin',
  'sales_admin',
  'crm_production_admin',
  'production_admin',
  'logistics_admin',
  'crm_production_staff',
  'production_staff',
  'region_admin',
  'manager',
  'accounting',
  'production',
  'sales',
  'designer',
  'customer_care',
  'driver',
  'installer',
  'staff',
];

function normalizeModuleKey(key) {
  const k = String(key || '').trim().toLowerCase();
  return ALLOWED_MODULE_KEYS.has(k) ? k : null;
}

function normalizeRoleName(role) {
  const r = String(role || '').trim().toLowerCase();
  return r || null;
}

/**
 * @param {Record<string, string>|Array<{module_key:string,role:string}>|null} input
 * @returns {Record<string, string>}
 */
function normalizeModuleRolesMap(input) {
  const out = {};
  if (!input) return out;
  if (Array.isArray(input)) {
    for (const row of input) {
      const mk = normalizeModuleKey(row?.module_key || row?.module);
      const role = normalizeRoleName(row?.role);
      if (!mk || !role) continue;
      const allowed = MODULE_ROLE_OPTIONS[mk] || [];
      if (allowed.length && !allowed.includes(role)) continue;
      out[mk] = role;
    }
    return out;
  }
  if (typeof input === 'object') {
    for (const [k, v] of Object.entries(input)) {
      const mk = normalizeModuleKey(k);
      const role = normalizeRoleName(v);
      if (!mk || !role) continue;
      const allowed = MODULE_ROLE_OPTIONS[mk] || [];
      if (allowed.length && !allowed.includes(role)) continue;
      out[mk] = role;
    }
  }
  return out;
}

/**
 * @param {Record<string, string>} moduleRoles
 * @param {{ isSystemAdmin?: boolean }} [opts]
 */
function derivePrimaryRole(moduleRoles, opts = {}) {
  if (opts.isSystemAdmin) return 'admin';
  const roles = Object.values(moduleRoles || {}).map(normalizeRoleName).filter(Boolean);
  if (!roles.length) return 'staff';
  for (const p of PRIMARY_ROLE_PRIORITY) {
    if (roles.includes(p)) return p;
  }
  return roles[0] || 'staff';
}

/**
 * @param {Record<string, string>} moduleRoles
 * @param {string|null} [explicitDrive]
 */
function deriveDriveModule(moduleRoles, explicitDrive = null) {
  const explicit = normalizeDriveModule(explicitDrive);
  if (explicit) return explicit;
  const keys = Object.keys(moduleRoles || {});
  for (const mk of DRIVE_PRIORITY) {
    if (keys.includes(mk) && MODULE_TO_DRIVE[mk]) return MODULE_TO_DRIVE[mk];
  }
  return 'crm';
}

async function listUserModuleRoles(userId) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('user_module_roles')
    .select('id, user_id, module_key, role, granted_at')
    .eq('user_id', userId)
    .order('module_key');
  if (error) {
    // Bảng chưa migrate — fail soft
    if (/user_module_roles|relation|does not exist/i.test(error.message || '')) return [];
    throw error;
  }
  return data || [];
}

async function getUserModuleRolesMap(userId) {
  const rows = await listUserModuleRoles(userId);
  const map = {};
  for (const r of rows) {
    if (r.module_key && r.role) map[r.module_key] = String(r.role).toLowerCase();
  }
  return map;
}

/**
 * Sync map module→role. Xóa module không còn trong map.
 * @returns {Promise<{ map: Record<string,string>, primaryRole: string, driveModule: string }>}
 */
async function syncUserModuleRoles(userId, moduleRolesInput, {
  grantedBy = null,
  isSystemAdmin = false,
  explicitDrive = null,
} = {}) {
  if (!userId) throw new Error('Thiếu user_id');
  const map = normalizeModuleRolesMap(moduleRolesInput);
  const primaryRole = derivePrimaryRole(map, { isSystemAdmin });
  const driveModule = deriveDriveModule(map, explicitDrive);

  const existing = await listUserModuleRoles(userId);
  const existingKeys = new Set(existing.map((r) => r.module_key));
  const nextKeys = new Set(Object.keys(map));

  const toDelete = [...existingKeys].filter((k) => !nextKeys.has(k));
  if (toDelete.length) {
    const { error: delErr } = await supabase
      .from('user_module_roles')
      .delete()
      .eq('user_id', userId)
      .in('module_key', toDelete);
    if (delErr) throw delErr;
  }

  for (const [module_key, role] of Object.entries(map)) {
    const { error: upErr } = await supabase
      .from('user_module_roles')
      .upsert(
        {
          user_id: userId,
          module_key,
          role,
          granted_by: grantedBy || null,
          granted_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,module_key' },
      );
    if (upErr) throw upErr;
  }

  return { map, primaryRole, driveModule };
}

/**
 * Tập module_key (và alias) user được vào nhờ user_module_roles.
 * @returns {Promise<Set<string>|null>} null = chưa có bảng / lỗi soft → bỏ qua layer này
 */
async function getModuleAccessKeysForUser(userId) {
  if (!userId) return new Set();
  try {
    const rows = await listUserModuleRoles(userId);
    if (!rows.length) return new Set();
    const keys = new Set();
    for (const r of rows) {
      const aliases = MODULE_ACCESS_ALIASES[r.module_key] || [r.module_key];
      aliases.forEach((k) => keys.add(k));
    }
    return keys;
  } catch {
    return null;
  }
}

/**
 * Resolve role template ids từ nhiều role name (union).
 */
async function resolvePermissionIdsForRoleNames(roleNames = []) {
  const names = [...new Set((roleNames || []).map(normalizeRoleName).filter(Boolean))];
  if (!names.length) return { roleIds: [], permissionIds: new Set() };

  const { data: roles, error } = await supabase
    .from('roles')
    .select('id, name')
    .in('name', names);
  if (error) throw error;
  const roleIds = (roles || []).map((r) => r.id).filter(Boolean);
  if (!roleIds.length) return { roleIds: [], permissionIds: new Set() };

  const { data: rp, error: rpErr } = await supabase
    .from('role_permissions')
    .select('permission_id')
    .in('role_id', roleIds);
  if (rpErr) throw rpErr;

  return {
    roleIds,
    permissionIds: new Set((rp || []).map((r) => r.permission_id).filter(Boolean)),
  };
}

module.exports = {
  ALLOWED_MODULE_KEYS,
  MODULE_ROLE_OPTIONS,
  MODULE_ACCESS_ALIASES,
  normalizeModuleKey,
  normalizeModuleRolesMap,
  derivePrimaryRole,
  deriveDriveModule,
  listUserModuleRoles,
  getUserModuleRolesMap,
  syncUserModuleRoles,
  getModuleAccessKeysForUser,
  resolvePermissionIdsForRoleNames,
};
