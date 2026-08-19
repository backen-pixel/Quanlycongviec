/**
 * Phân quyền xem tài liệu/đính kèm chia sẻ theo công ty & module (SX / VC / Công việc).
 */

const { isSystemAdmin } = require('./adminRole');
const {
  shouldHideQuoteContractFromProduction,
  isQuoteContractLeadDocument,
  isHideQuoteContractCompany,
} = require('./hideQuoteContractFromProduction');

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
  // VC/LĐ: xem mọi tài liệu đã chia sẻ — không khóa theo allowed_share_modules.
  if (mod === 'logistics') return true;
  const allowed = normalizedShareModules(docOrAtt);
  if (!allowed) return true;
  return allowed.includes(mod);
}

/** Tài liệu / artifact thuộc giai đoạn nhiệm vụ SX — ẩn trên VC/LĐ. */
function isProductionLikeLeadDocument(doc) {
  const slug = String(doc?.crm_stage_slug || '').toLowerCase().trim();
  return slug.startsWith('sx_');
}

function isProductionLikeCrmArtifact(artifact, taskRow = null) {
  const slug = String(
    artifact?.stage_slug
    || artifact?.crm_stage_slug
    || taskRow?.stage_slug
    || '',
  ).toLowerCase().trim();
  return slug.startsWith('sx_');
}

/** Quyền xem kế thừa từ mẫu CRM (crm_tasks.default_allowed_*). */
function getTaskVisibilityAllowlist(taskRow) {
  return {
    allowed_companies: parseJsonArray(taskRow?.default_allowed_companies),
    allowed_departments: parseJsonArray(taskRow?.default_allowed_departments),
  };
}

/**
 * @param {object} docOrAtt — lead_document, attachment, hoặc crm_tasks row
 * @param {object} user — req.user
 * @param {object} [taskRow] — fallback default_allowed_* khi artifact chưa ghi allowlist
 */
function canViewerSeeByCompanyAndDept(docOrAtt, user, taskRow = null) {
  if (!user) return true;
  if (isSystemAdmin(user)) return true;
  const uc = user.company_id || null;
  const ud = user.department_id || null;
  const ac = parseJsonArray(docOrAtt?.allowed_companies)
    ?? parseJsonArray(taskRow?.default_allowed_companies)
    ?? parseJsonArray(docOrAtt?.default_allowed_companies);
  const ad = parseJsonArray(docOrAtt?.allowed_departments)
    ?? parseJsonArray(taskRow?.default_allowed_departments)
    ?? parseJsonArray(docOrAtt?.default_allowed_departments);
  if (!ac?.length && !ad?.length) return true;
  if (ac?.length && uc && ac.some((x) => String(x) === String(uc))) return true;
  if (ad?.length && ud && ad.some((x) => String(x) === String(ud))) return true;
  return false;
}

/** Chỉ hiện ở SX/VC/xưởng khi CRM bật «chia sẻ xưởng» — không dùng heuristic cột legacy. */
function isLeadDocSharedToWorkshop(doc) {
  return doc?.shared_to_workshop === true;
}

/**
 * @param {object} doc — lead_document
 * @param {'production'|'logistics'|'workshop'} moduleKey
 * @param {object} user — req.user shape
 * @param {{ leadCompanyId?: string|null }} [opts]
 */
function leadDocVisibleForModuleAndUser(doc, moduleKey, user, opts = {}) {
  const mod = String(moduleKey || '').toLowerCase().trim();

  // VC/LĐ: xem toàn bộ tài liệu deal/dự án, ẩn tài liệu giai đoạn SX + BG/HĐ (VPT/Phúc Đạt).
  if (mod === 'logistics') {
    if (isProductionLikeLeadDocument(doc)) return false;
    if (
      isHideQuoteContractCompany(opts.leadCompanyId)
      && isQuoteContractLeadDocument(doc)
    ) {
      return false;
    }
    return canViewerSeeByCompanyAndDept(doc, user);
  }

  if (SHARE_MODULE_KEYS.has(mod) && !isLeadDocSharedToWorkshop(doc)) {
    return false;
  }
  if (
    (mod === 'production' || mod === 'logistics')
    && isHideQuoteContractCompany(opts.leadCompanyId)
    && isQuoteContractLeadDocument(doc)
  ) {
    return false;
  }
  return canViewerSeeByCompanyAndDept(doc, user) && isVisibleInShareModule(doc, moduleKey);
}

/**
 * @param {object} att — file_attachments (entity_type task)
 * @param {'production'|'logistics'|'workshop'} moduleKey
 * @param {object} user
 */
function taskAttachmentVisibleForModuleAndUser(att, moduleKey, user) {
  const mod = String(moduleKey || '').toLowerCase().trim();
  if (mod === 'logistics') {
    return canViewerSeeByCompanyAndDept(att, user);
  }
  return canViewerSeeByCompanyAndDept(att, user) && isVisibleInShareModule(att, moduleKey);
}

/** CRM task attachment đã bật «chia sẻ dự án / khối khác» */
function isCrmAttachmentSharedToProject(att) {
  return att?.shared_to_project === true;
}

function crmAttachmentVisibleForModuleAndUser(att, moduleKey, user, taskRow = null, opts = {}) {
  const mod = String(moduleKey || '').toLowerCase().trim();
  if (mod === 'logistics') {
    if (isProductionLikeCrmArtifact(att, taskRow)) return false;
    if (shouldHideQuoteContractFromProduction({
      companyId: opts.leadCompanyId,
      task: taskRow,
      moduleKey: 'logistics',
    })) {
      return false;
    }
    // VC: mọi file đã chia sẻ (không cần allowed_share_modules có logistics)
    if (!isCrmAttachmentSharedToProject(att) && !isCrmTaskSharedToProject(taskRow)) return false;
    return canViewerSeeByCompanyAndDept(att, user, taskRow);
  }
  if (!isCrmAttachmentSharedToProject(att)) return false;
  if (shouldHideQuoteContractFromProduction({
    companyId: opts.leadCompanyId,
    task: taskRow,
    moduleKey,
  })) {
    return false;
  }
  return canViewerSeeByCompanyAndDept(att, user, taskRow) && isVisibleInShareModule(att, moduleKey);
}

/** CRM task ghi chú (shared_to_project trên crm_tasks) */
function isCrmTaskSharedToProject(task) {
  return task?.shared_to_project === true;
}

function crmTaskVisibleForModuleAndUser(task, moduleKey, user, opts = {}) {
  const mod = String(moduleKey || '').toLowerCase().trim();
  if (mod === 'logistics') {
    if (isProductionLikeCrmArtifact(task)) return false;
    if (shouldHideQuoteContractFromProduction({
      companyId: opts.leadCompanyId,
      task,
      moduleKey: 'logistics',
    })) {
      return false;
    }
    if (!isCrmTaskSharedToProject(task)) return false;
    return canViewerSeeByCompanyAndDept(task, user);
  }
  if (!isCrmTaskSharedToProject(task)) return false;
  if (shouldHideQuoteContractFromProduction({
    companyId: opts.leadCompanyId,
    task,
    moduleKey,
  })) {
    return false;
  }
  return canViewerSeeByCompanyAndDept(task, user) && isVisibleInShareModule(task, moduleKey);
}

function crmActivityVisibleForModuleAndUser(act, moduleKey, user) {
  const mod = String(moduleKey || '').toLowerCase().trim();
  if (mod === 'logistics') {
    if (isProductionLikeCrmArtifact(act)) return false;
    if (act && Object.prototype.hasOwnProperty.call(act, 'shared_to_workshop') && !isLeadDocSharedToWorkshop(act)) {
      return false;
    }
    return canViewerSeeByCompanyAndDept(act, user);
  }
  if (!isLeadDocSharedToWorkshop(act)) return false;
  return canViewerSeeByCompanyAndDept(act, user) && isVisibleInShareModule(act, moduleKey);
}

function cleanShareModulesInput(raw) {
  if (!Array.isArray(raw)) return null;
  const cleaned = [...new Set(raw.map((x) => String(x).toLowerCase().trim()))].filter((x) =>
    SHARE_MODULE_KEYS.has(x),
  );
  return cleaned.length ? cleaned : null;
}

module.exports = {
  SHARE_MODULE_KEYS,
  parseJsonArray,
  normalizedShareModules,
  isVisibleInShareModule,
  isLeadDocSharedToWorkshop,
  isCrmAttachmentSharedToProject,
  isCrmTaskSharedToProject,
  isProductionLikeLeadDocument,
  isProductionLikeCrmArtifact,
  getTaskVisibilityAllowlist,
  canViewerSeeByCompanyAndDept,
  leadDocVisibleForModuleAndUser,
  taskAttachmentVisibleForModuleAndUser,
  crmAttachmentVisibleForModuleAndUser,
  crmTaskVisibleForModuleAndUser,
  crmActivityVisibleForModuleAndUser,
  cleanShareModulesInput,
};
