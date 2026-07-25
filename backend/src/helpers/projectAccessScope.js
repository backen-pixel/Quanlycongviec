/**
 * Phân quyền truy cập dự án cho /api/projects/:id/*, /api/tasks, /api/vc-handover, …
 * Pattern giống resolveCrmProjectScope (CRM) — handler gọi đầu route, null = đã trả lỗi.
 *
 * opts.mode:
 *   - 'company' (default): cùng company_id / logistics / lead.company đủ để vào
 *   - 'sensitive': documents/cashflow/comments WRITE — chỉ admin, participant, CRM access
 */

const { supabase } = require('../config/supabase');
const { assertRowCompanyInTenant } = require('./tenantScope');
const {
  isSystemAdmin,
  isPlatformAdmin,
  isAdminLike,
  isProductionAdmin,
  isLogisticsAdmin,
} = require('./adminRole');
const { effectiveWorkshopCompanyId } = require('./workshopCompanyScope');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PROJECT_PERSON_FIELDS = [
  'sales_person_id',
  'designer_id',
  'project_manager_id',
  'supervisor_id',
  'production_person_id',
  'logistics_person_id',
  'installer_person_id',
  'created_by',
];

/** Cột tối thiểu cho gate — tránh select('*') trên mọi request. */
const PROJECT_ACCESS_SELECT = [
  'id',
  'company_id',
  'logistics_company_id',
  ...PROJECT_PERSON_FIELDS,
].join(', ');

const LEAD_ACCESS_SELECT = 'id, type, company_id, assigned_to, lead_owner_id, parent_lead_id, project_id, region_id';

/**
 * @param {import('express').Request} req
 * @returns {Map<string, Promise<{ project: object, lead: object|null }|null>>}
 */
function accessCacheFor(req) {
  if (!req._projectAccessCache) req._projectAccessCache = new Map();
  return req._projectAccessCache;
}

function userMatchesProjectCompany(user, project, lead) {
  const userCompany = user?.company_id ? String(user.company_id) : '';
  if (!userCompany) return false;
  const projectCompanies = [project.company_id, project.logistics_company_id]
    .filter(Boolean)
    .map(String);
  if (projectCompanies.includes(userCompany)) return true;
  if (lead?.company_id && String(lead.company_id) === userCompany) return true;
  return false;
}

/**
 * Admin công ty / production / logistics admin cùng phạm vi company dự án.
 * Dùng cho mode sensitive (thay vì mọi NV cùng company).
 */
function isScopedModuleAdminForProject(user, project, lead) {
  if (!userMatchesProjectCompany(user, project, lead)) return false;
  if (isAdminLike(user)) return true;
  if (isProductionAdmin(user)) return true;
  if (isLogisticsAdmin(user)) return true;
  return false;
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {string} projectIdRaw
 * @param {{ operation?: string, mode?: 'company'|'sensitive' }} [opts]
 * @returns {Promise<{ project: object, lead: object|null }|null>}
 */
async function assertProjectAccessible(req, res, projectIdRaw, opts = {}) {
  const projectId = String(projectIdRaw || '').trim();
  if (!UUID_RE.test(projectId)) {
    res.status(400).json({ error: 'project_id không hợp lệ', reason: 'invalid_project_id' });
    return null;
  }

  const mode = opts.mode === 'sensitive' ? 'sensitive' : 'company';
  const op = opts.operation === 'WRITE' ? 'WRITE' : 'READ';
  const cacheKey = `${projectId}|${mode}|${op}`;
  const cache = accessCacheFor(req);
  if (cache.has(cacheKey)) {
    const cached = await cache.get(cacheKey);
    if (!cached) {
      // Lần trước đã trả lỗi — không gửi response lần nữa; caller phải đã return.
      // Tạo response mới nếu cache miss do parallel (hiếm).
      if (!res.headersSent) {
        res.status(403).json({
          error: 'Không có quyền truy cập dự án này',
          reason: 'project_scope_denied',
        });
      }
      return null;
    }
    return cached;
  }

  const pending = (async () => {
    const { data: project, error } = await supabase
      .from('projects')
      .select(PROJECT_ACCESS_SELECT)
      .eq('id', projectId)
      .maybeSingle();
    if (error) throw error;
    if (!project) {
      res.status(404).json({ error: 'Không tìm thấy dự án', reason: 'project_not_found' });
      return null;
    }

    if (!assertRowCompanyInTenant(req, res, project)) return null;

    const { data: lead } = await supabase
      .from('crm_leads')
      .select(LEAD_ACCESS_SELECT)
      .eq('project_id', projectId)
      .limit(1)
      .maybeSingle();
    const scope = { project, lead: lead || null };

    if (isSystemAdmin(req.user) || isPlatformAdmin(req.user)) return scope;

    const uid = req.user?.userId ? String(req.user.userId) : '';
    if (uid && PROJECT_PERSON_FIELDS.some((f) => project[f] && String(project[f]) === uid)) {
      return scope;
    }

    // NV xưởng trong project_production_staff
    if (uid) {
      try {
        const { data: staffRow } = await supabase
          .from('project_production_staff')
          .select('user_id')
          .eq('project_id', projectId)
          .eq('user_id', uid)
          .maybeSingle();
        if (staffRow) return scope;
      } catch (e) {
        if (!String(e.message || '').includes('project_production_staff')) {
          console.warn('[projectAccessScope] production_staff:', e.message);
        }
      }
    }

    // Sensitive: admin công ty / production / logistics cùng company — không mọi NV
    if (mode === 'sensitive') {
      if (isScopedModuleAdminForProject(req.user, project, lead)) return scope;
    } else if (userMatchesProjectCompany(req.user, project, lead)) {
      return scope;
    }

    if (lead) {
      try {
        const { assertCrmLeadAccess } = require('./crmTaskLeadAccess');
        const gate = await assertCrmLeadAccess(supabase, req, lead, { operation: op });
        if (gate.ok) return scope;
      } catch (e) {
        console.warn('[projectAccessScope] assertCrmLeadAccess:', e.message);
      }
    }

    res.status(403).json({
      error: 'Không có quyền truy cập dự án này',
      reason: 'project_scope_denied',
    });
    return null;
  })();

  cache.set(cacheKey, pending);
  try {
    return await pending;
  } catch (e) {
    cache.delete(cacheKey);
    throw e;
  }
}

/**
 * Khóa CRUD pipeline/template/team theo company_id của row.
 * System/platform admin: luôn OK.
 * Row có company_id: phải khớp effectiveWorkshopCompanyId / company user.
 * Row company_id null (legacy): chỉ khi opts.allowNullCompany === true (transition).
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {{ company_id?: string|null }|null} row
 * @param {{ label?: string, queryCompanyId?: string|null, allowNullCompany?: boolean }} [opts]
 * @returns {boolean} false = đã trả lỗi
 */
function assertCompanyOwnedRow(req, res, row, opts = {}) {
  if (!row) {
    res.status(404).json({ error: `${opts.label || 'Bản ghi'} không tồn tại` });
    return false;
  }
  if (isSystemAdmin(req.user) || isPlatformAdmin(req.user)) return true;

  const rowCompany = row.company_id != null ? String(row.company_id).trim() : '';
  if (!rowCompany) {
    if (opts.allowNullCompany) return true;
    res.status(403).json({
      error: `Không có quyền sửa ${opts.label || 'bản ghi'} toàn hệ thống`,
      reason: 'company_owned_row_denied',
    });
    return false;
  }

  const scopeCompany = effectiveWorkshopCompanyId(req, opts.queryCompanyId);
  const userCompany = req.user?.company_id != null ? String(req.user.company_id).trim() : '';
  const allowed = scopeCompany || userCompany;
  if (allowed && String(allowed) === rowCompany) return true;

  res.status(403).json({
    error: `Không có quyền thao tác ${opts.label || 'bản ghi'} của công ty khác`,
    reason: 'company_owned_row_denied',
  });
  return false;
}

module.exports = {
  UUID_RE,
  PROJECT_PERSON_FIELDS,
  PROJECT_ACCESS_SELECT,
  assertProjectAccessible,
  assertCompanyOwnedRow,
  userMatchesProjectCompany,
  isScopedModuleAdminForProject,
};
