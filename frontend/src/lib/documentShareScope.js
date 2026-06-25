/** Khớp backend/helpers/documentShareScope.js — lọc tài liệu CRM theo module chia sẻ */

export const SHARE_MODULE_KEYS = new Set(['production', 'logistics', 'workshop']);

export const SHARE_MODULE_OPTIONS = [
  { id: 'production', label: '🏭 Sản xuất (SX)' },
  { id: 'logistics', label: '🚚 Vận chuyển (VC)' },
  { id: 'workshop', label: '📁 Công việc dự án' },
];

const MODULE_LABEL = Object.fromEntries(SHARE_MODULE_OPTIONS.map((o) => [o.id, o.label]));

export function shareModuleLabels(modules) {
  const arr = parseShareModules(modules);
  if (!arr?.length) return 'Mọi khối (SX, VC, CV)';
  return arr.map((id) => MODULE_LABEL[id] || id).join(' · ');
}

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

/** Chuẩn hóa mảng module trước khi gửi API */
export function cleanShareModulesForApi(modules) {
  const arr = parseShareModules(modules);
  if (!arr?.length) return null;
  const cleaned = [...new Set(arr.map((x) => String(x).toLowerCase().trim()))].filter((x) =>
    SHARE_MODULE_KEYS.has(x),
  );
  return cleaned.length ? cleaned : null;
}

/** Chỉ hiện ở SX/VC/xưởng khi CRM bật «chia sẻ xưởng». */
export function isLeadDocSharedToWorkshop(doc) {
  return doc?.shared_to_workshop === true;
}

export function isCrmArtifactShared(artifact) {
  return artifact?.shared_to_workshop === true || artifact?.shared_to_project === true;
}

/** null / rỗng sau chuẩn hóa = hiển thị mọi module (khi đã bật chia sẻ) */
export function isVisibleInShareModule(artifact, moduleKey) {
  const mod = String(moduleKey || '').toLowerCase().trim();
  if (!SHARE_MODULE_KEYS.has(mod)) return true;
  const arr = parseShareModules(artifact?.allowed_share_modules);
  if (!arr?.length) return true;
  const cleaned = [...new Set(arr.map((x) => String(x).toLowerCase().trim()))].filter((x) =>
    SHARE_MODULE_KEYS.has(x),
  );
  if (!cleaned.length) return true;
  return cleaned.includes(mod);
}

/** Tài liệu đồng bộ từ nhiệm vụ SX (sx_*) đã gắn project — luôn hiện ở module Sản xuất. */
export function isSxTaskDocForProject(doc) {
  return !!doc?.project_id
    && !!doc?.source_crm_task_id
    && String(doc.crm_stage_slug || '').startsWith('sx_');
}

/** lead_documents trong module xưởng */
export function isLeadDocVisibleInModule(doc, moduleKey) {
  const mod = String(moduleKey || '').toLowerCase().trim();
  if (!SHARE_MODULE_KEYS.has(mod)) return true;
  if (!isLeadDocSharedToWorkshop(doc) && !(mod === 'production' && isSxTaskDocForProject(doc))) return false;
  return isVisibleInShareModule(doc, mod);
}

/** crm_task_attachments / crm_tasks / crm_activities đã chia sẻ sang khối khác */
export function isCrmSharedArtifactVisibleInModule(artifact, moduleKey) {
  const mod = String(moduleKey || '').toLowerCase().trim();
  if (!SHARE_MODULE_KEYS.has(mod)) return true;
  if (!isCrmArtifactShared(artifact)) return false;
  return isVisibleInShareModule(artifact, mod);
}
