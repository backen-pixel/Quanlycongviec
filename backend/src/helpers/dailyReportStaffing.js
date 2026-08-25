/**
 * Ai xuất hiện trên bảng báo cáo ngày (gán mẫu / suy vai trò).
 * Không tính số CRM.
 */
const { normalizeRole } = require('./adminRole');

function guessRoleKey(user, departmentName = '') {
  const role = normalizeRole(user?.role);
  const dept = String(departmentName || '').toLowerCase();
  const name = String(user?.full_name || '').toLowerCase();
  if (
    role === 'sales_admin'
    || /sale\s*admin|sales?\s*admin|chăm\s*sóc|cham\s*soc|\bcskh\b|care\s*lead/.test(dept)
    || /sale\s*admin/.test(name)
    || (/(^|\s)sales?(\s|$)/.test(dept) && !/deal/.test(dept))
  ) {
    return 'sale_admin';
  }
  if (/thiết\s*kế|thiet\s*ke|design/.test(dept)) return 'design_survey';
  if (
    role === 'admin'
    || role === 'manager'
    || role === 'platform_admin'
    || role === 'crm_production_admin'
    || role === 'sales'
    || /sale\s*-?\s*deal|kinh\s*doanh|admin|quản\s*lý|quan\s*ly|giám\s*đốc/.test(dept)
    || /sale\s*-?\s*deal/.test(name)
  ) {
    return 'sale_deal';
  }
  return null;
}

function isCrmSalesDept(name) {
  const t = String(name || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  if (!t) return false;
  if (/san\s*xuat|van\s*chuyen|lap\s*dat|nhan\s*su|tai\s*chinh|ke\s*toan|mua\s*hang|kho\b|cong\s*nhan|hanh\s*chinh|xuong|workshop|logistics/.test(t)) {
    return false;
  }
  return /cskh|cham\s*soc|kinh\s*doanh|sale|sales|marketing|thiet\s*ke|design|crm|tu\s*van/.test(t);
}

function looksLikeNonCrmUser(user) {
  const name = String(user?.full_name || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  const role = String(user?.role || '').toLowerCase();
  if (/san\s*xuat|lap\s*dat|van\s*chuyen|ke\s*toan|mua\s*hang|cong\s*nhan|nhan\s*su|xuong|hanh\s*chinh/.test(name)) return true;
  if (/production|logistics|warehouse|accountant|hr\b/.test(role)) return true;
  return false;
}

function normalizeDailyRoleKey(roleKey) {
  const k = String(roleKey || '').trim();
  if (k === 'deal_admin') return 'sale_deal';
  return k || null;
}

module.exports = {
  guessRoleKey,
  isCrmSalesDept,
  looksLikeNonCrmUser,
  normalizeDailyRoleKey,
};
