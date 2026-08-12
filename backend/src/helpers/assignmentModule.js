/**
 * Chuẩn hoá khóa assignment_module cho Giao việc CRM / SX / VC / module tùy chỉnh.
 * Builtin: crm | production | logistics
 * Custom: app_modules.module_key (slug [a-z][a-z0-9_-]{0,63})
 */

const BUILTIN_ASSIGN_MODULES = new Set(['crm', 'production', 'logistics']);
const ASSIGN_MODULE_RE = /^[a-z][a-z0-9_-]{0,63}$/;

function normalizeAssignModule(raw, { fallback = 'crm' } = {}) {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return fallback;
  if (BUILTIN_ASSIGN_MODULES.has(v)) return v;
  if (ASSIGN_MODULE_RE.test(v)) return v;
  return fallback;
}

function isBuiltinAssignModule(raw) {
  return BUILTIN_ASSIGN_MODULES.has(String(raw || '').trim().toLowerCase());
}

function isCustomAssignModule(raw) {
  const v = normalizeAssignModule(raw, { fallback: '' });
  return !!v && !BUILTIN_ASSIGN_MODULES.has(v);
}

/** Đường dẫn trang Giao việc theo module. */
function navPathForAssignModule(raw) {
  const mod = normalizeAssignModule(raw);
  if (mod === 'production') return '/sx/assignments';
  if (mod === 'logistics') return '/vc/assignments';
  if (isCustomAssignModule(mod)) return `/m/${mod}/assignments`;
  return '/crm/assignments';
}

/** true nếu query/filter nên áp dụng eq assignment_module */
function isValidAssignModuleFilter(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return false;
  return BUILTIN_ASSIGN_MODULES.has(v) || ASSIGN_MODULE_RE.test(v);
}

module.exports = {
  BUILTIN_ASSIGN_MODULES,
  ASSIGN_MODULE_RE,
  normalizeAssignModule,
  isBuiltinAssignModule,
  isCustomAssignModule,
  navPathForAssignModule,
  isValidAssignModuleFilter,
};
