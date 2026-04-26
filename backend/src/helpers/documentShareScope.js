/**
 * Phân quyền xem tài liệu/đính kèm chia sẻ theo công ty & module (SX / VC / Công việc).
 */

const SHARE_MODULE_KEYS = new Set(['production', 'logistics', 'workshop']);

function parseJsonArray(raw) {
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

/** Danh sách module được phép xem; null/empty = tất cả */
function normalizedShareModules(docOrAtt) {
  const arr = parseJsonArray(docOrAtt?.allowed_share_modules);
  if (!arr?.length) return null;
  const uniq = [...new Set(arr.map((x) => String(x).toLowerCase().trim()))].filter((x) =>
    SHARE_MODULE_KEYS.has(x),
  );
  return uniq.length ? uniq : null;
}

/**
 * @param {object} docOrAtt — lead_document hoặc file_attachments row
 * @param {'production'|'logistics'|'workshop'} moduleKey
 */
function isVisibleInShareModule(docOrAtt, moduleKey) {
  const mod = String(moduleKey || '').toLowerCase().trim();
  if (!SHARE_MODULE_KEYS.has(mod)) return true;
  const allowed = normalizedShareModules(docOrAtt);
  if (!allowed) return true;
  return allowed.includes(mod);
}

function canViewerSeeByCompanyAndDept(docOrAtt, user) {
  if (!user) return true;
  const role = String(user.role || '').toLowerCase();
  if (role === 'admin') return true;
  const uc = user.company_id || null;
  const ud = user.department_id || null;
  const ac = parseJsonArray(docOrAtt?.allowed_companies);
  const ad = parseJsonArray(docOrAtt?.allowed_departments);
  if (!ac?.length && !ad?.length) return true;
  if (ac?.length && uc && ac.some((x) => String(x) === String(uc))) return true;
  if (ad?.length && ud && ad.some((x) => String(x) === String(ud))) return true;
  return false;
}

/**
 * @param {object} doc — lead_document
 * @param {'production'|'logistics'|'workshop'} moduleKey
 * @param {object} user — req.user shape
 */
function leadDocVisibleForModuleAndUser(doc, moduleKey, user) {
  return canViewerSeeByCompanyAndDept(doc, user) && isVisibleInShareModule(doc, moduleKey);
}

/**
 * @param {object} att — file_attachments (entity_type task)
 * @param {'production'|'logistics'|'workshop'} moduleKey
 * @param {object} user
 */
function taskAttachmentVisibleForModuleAndUser(att, moduleKey, user) {
  return canViewerSeeByCompanyAndDept(att, user) && isVisibleInShareModule(att, moduleKey);
}

module.exports = {
  SHARE_MODULE_KEYS,
  parseJsonArray,
  normalizedShareModules,
  isVisibleInShareModule,
  canViewerSeeByCompanyAndDept,
  leadDocVisibleForModuleAndUser,
  taskAttachmentVisibleForModuleAndUser,
};
