/**
 * Module mở bình luận theo người nhận (khớp frontend memberModulesFromUser).
 * Một người chỉ thuộc SX thì mở dự án SX, dù deal đã sang VC hay người gửi ở CRM.
 */

const OPS = new Set(['crm', 'production', 'logistics']);

function homesFromRoleDrive(role, driveModule) {
  const r = String(role || '').trim().toLowerCase();
  const drive = String(driveModule || '').trim().toLowerCase();
  const logisticsRoles = new Set([
    'logistics_admin', 'logistics', 'driver', 'installer', 'shipping',
  ]);
  const crmRoles = new Set([
    'sales', 'sales_admin', 'customer_care', 'designer', 'manager', 'staff', 'admin',
    'accounting', 'ketoan', 'region_admin', 'crm_production_admin', 'crm_production_staff',
  ]);

  if (logisticsRoles.has(r)) return ['logistics'];
  if (r === 'production_admin' || r === 'production_staff' || r === 'production') return ['production'];
  if (r === 'crm_production_admin' || r === 'crm_production_staff') return ['crm', 'production'];
  if (drive === 'vc' || drive === 'logistics') return ['logistics'];
  if (drive === 'sx' || drive === 'production') return ['production'];
  if (drive === 'crm') return ['crm'];
  if (crmRoles.has(r) || !r) return ['crm'];
  return ['crm'];
}

/**
 * @param {{ role?: string, driveModule?: string|null, moduleKeys?: string[] }} input
 * @returns {'crm'|'production'|'logistics'}
 */
function pickCommentViewerModule({ role, driveModule, moduleKeys } = {}) {
  const ops = [...new Set((moduleKeys || [])
    .map((k) => String(k || '').trim().toLowerCase())
    .filter((k) => OPS.has(k)))];
  if (ops.length === 1) return ops[0];

  const homes = homesFromRoleDrive(role, driveModule);
  if (homes.length === 1) return homes[0];

  const narrowed = ops.length ? homes.filter((h) => ops.includes(h)) : homes;
  const list = narrowed.length ? narrowed : homes;
  if (list.includes('production')) return 'production';
  if (list.includes('logistics')) return 'logistics';
  return list[0] || 'crm';
}

module.exports = {
  homesFromRoleDrive,
  pickCommentViewerModule,
};
