/**
 * Phân loại thành viên lead/deal theo khối CRM / SX / VC để hiển thị badge đếm.
 * Dựa trên users.role (và drive_module nếu có).
 */

const LOGISTICS_ROLES = new Set([
  'logistics_admin', 'logistics', 'driver', 'installer', 'shipping',
]);
const PRODUCTION_ROLES = new Set([
  'production_admin', 'production_staff', 'production', 'crm_production_admin', 'crm_production_staff',
]);
const CRM_ROLES = new Set([
  'sales', 'sales_admin', 'customer_care', 'designer', 'manager', 'staff', 'admin',
  'accounting', 'ketoan', 'region_admin', 'crm_production_admin', 'crm_production_staff',
]);

export function memberModulesFromUser(user) {
  if (!user) return ['crm'];
  const drive = String(user.drive_module || '').trim().toLowerCase();
  if (drive === 'vc' || drive === 'logistics') return ['logistics'];
  if (drive === 'sx' || drive === 'production') return ['production'];
  if (drive === 'crm') return ['crm'];

  const r = String(user.role || '').trim().toLowerCase();
  if (LOGISTICS_ROLES.has(r)) return ['logistics'];
  if (r === 'production_admin' || r === 'production_staff' || r === 'production') return ['production'];
  if (r === 'crm_production_admin' || r === 'crm_production_staff') return ['crm', 'production'];
  if (CRM_ROLES.has(r) || !r) return ['crm'];
  if (PRODUCTION_ROLES.has(r)) return ['production'];
  return ['crm'];
}

/**
 * @param {Array<{ user?: object, user_id?: string }>} members
 * @returns {{ crm: number, production: number, logistics: number, total: number }}
 */
export function countMembersByModule(members) {
  const counts = { crm: 0, production: 0, logistics: 0 };
  const seen = { crm: new Set(), production: new Set(), logistics: new Set() };
  for (const m of members || []) {
    const uid = String(m?.user_id || m?.user?.id || '').trim();
    if (!uid) continue;
    for (const mod of memberModulesFromUser(m.user || m)) {
      if (seen[mod].has(uid)) continue;
      seen[mod].add(uid);
      counts[mod] += 1;
    }
  }
  return {
    ...counts,
    total: new Set([
      ...seen.crm,
      ...seen.production,
      ...seen.logistics,
    ]).size,
  };
}
