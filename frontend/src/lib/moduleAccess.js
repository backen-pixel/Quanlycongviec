/** Khớp backend `helpers/ecosystemModuleScope.js` KNOWN_MODULE_KEYS — các module ngoài CRM */
export const NON_CRM_MODULE_KEYS = ['production', 'logistics', 'projects', 'tasks', 'customers', 'accounting'];

/**
 * Nhân viên chỉ được phép khối kinh doanh / CRM: ecosystem chỉ bật `crm`, tắt hết module khác.
 * Admin luôn allowAll → false.
 */
export function isCrmOnlyModuleAccess(moduleAccess) {
  if (!moduleAccess || moduleAccess.allowAll) return false;
  const m = moduleAccess.modules;
  if (!m || m.crm === false) return false;
  return NON_CRM_MODULE_KEYS.every((k) => m[k] === false);
}
