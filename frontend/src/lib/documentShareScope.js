/** Khớp backend/helpers/documentShareScope.js — lọc tài liệu CRM theo module chia sẻ */

const SHARE_MODULE_KEYS = new Set(['production', 'logistics', 'workshop']);

export function parseShareModules(raw) {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p.map(String).filter(Boolean);
    } catch {
      return null;
    }
  }
  return null;
}

/** Chỉ hiện ở SX/VC/xưởng khi CRM bật «chia sẻ xưởng». */
export function isLeadDocSharedToWorkshop(doc) {
  return doc?.shared_to_workshop === true;
}

/** null / rỗng sau chuẩn hóa = hiển thị mọi module (khi đã bật chia sẻ) */
export function isLeadDocVisibleInModule(doc, moduleKey) {
  const mod = String(moduleKey || '').toLowerCase().trim();
  if (!SHARE_MODULE_KEYS.has(mod)) return true;
  if (!isLeadDocSharedToWorkshop(doc)) return false;
  const arr = parseShareModules(doc?.allowed_share_modules);
  if (!arr?.length) return true;
  const cleaned = [...new Set(arr.map((x) => String(x).toLowerCase().trim()))].filter((x) =>
    SHARE_MODULE_KEYS.has(x),
  );
  if (!cleaned.length) return true;
  return cleaned.includes(mod);
}
