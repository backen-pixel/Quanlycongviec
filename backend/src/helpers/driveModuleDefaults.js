/**
 * Gán mặc định users.drive_module (crm|sx|vc|mkt|other) khi chưa có.
 * Tránh xếp nhầm vào folder "Khác" trên Google Drive.
 */
const { supabase } = require('../config/supabase');

const VALID_DRIVE_MODULES = new Set(['crm', 'sx', 'vc', 'mkt', 'other']);

function normalizeDriveModule(key) {
  const k = String(key ?? '').trim().toLowerCase();
  return VALID_DRIVE_MODULES.has(k) ? k : null;
}

/** Suy module Drive từ role (khi drive_module còn NULL). */
function inferDriveModuleFromRole(role) {
  const r = String(role ?? '').trim().toLowerCase();
  if (!r) return null;
  if (r === 'sales_admin' || r === 'crm_production_admin') return 'crm';
  if (r === 'crm_production_staff') return 'crm';
  if (r === 'production_admin' || r === 'production_staff' || r === 'production') return 'sx';
  if (r === 'logistics_admin' || r === 'logistics' || r === 'shipping') return 'vc';
  if (
    r === 'staff' || r === 'manager' || r === 'sales' || r === 'customer_care'
    || r === 'admin' || r === 'accounting' || r === 'ketoan'
  ) return 'crm';
  return null;
}

/** Module mặc định khi tạo user mới (hoặc cập nhật role mà chưa có drive_module). */
function inferDriveModuleForNewUser({ role, drive_module } = {}) {
  const explicit = normalizeDriveModule(drive_module);
  if (explicit) return explicit;
  return inferDriveModuleFromRole(role) || 'crm';
}

/**
 * Ghi drive_module vào DB nếu user chưa có.
 * Ưu tiên: giá trị có sẵn → role → contextModule (vd. mở Drive CRM) → crm.
 */
async function ensureUserDriveModuleAssigned(userId, { contextModule } = {}) {
  if (!userId) return null;
  const { data: user, error } = await supabase
    .from('users')
    .select('id, role, drive_module')
    .eq('id', userId)
    .maybeSingle();
  if (error || !user) return null;

  const existing = normalizeDriveModule(user.drive_module);
  if (existing) return existing;

  let mod = inferDriveModuleFromRole(user.role);
  if (!mod) {
    const ctx = normalizeDriveModule(contextModule);
    if (ctx && ctx !== 'other') mod = ctx;
  }
  if (!mod) mod = 'crm';

  const { error: upErr } = await supabase.from('users').update({ drive_module: mod }).eq('id', userId);
  if (upErr) console.warn('[driveModuleDefaults] update drive_module:', upErr.message);
  return mod;
}

module.exports = {
  VALID_DRIVE_MODULES: [...VALID_DRIVE_MODULES],
  normalizeDriveModule,
  inferDriveModuleFromRole,
  inferDriveModuleForNewUser,
  ensureUserDriveModuleAssigned,
};
