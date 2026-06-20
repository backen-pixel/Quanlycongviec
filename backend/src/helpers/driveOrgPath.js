/**
 * Helper xây cây folder Drive theo cơ cấu tổ chức (phẳng — không có folder nhãn trung gian):
 *
 *   <ROOT_FOLDER_ID>/
 *   ├── <Module>/
 *   │   └── <Tên công ty>/
 *   │       ├── _Tài liệu chung công ty/
 *   │       └── <Tên khu vực>/                    ← trực tiếp dưới công ty
 *   │           ├── _Tài liệu chung khu vực/
 *   │           └── <Loại>/                     ← departments.drive_category
 *   │               └── <Tên phòng ban>/
 *   │                   └── <Tên NV>/           ← ensureUserOrgPath()
 *   └── Chung công ty/ …
 *
 * Khi user đổi module / khu vực / loại / phòng ban → folder NV được MOVE trên GDrive.
 */
const { supabase } = require('../config/supabase');
const gdrive = require('../services/googleDrive');

const SEG_COMPANY_BUCKET = 'Chung công ty';
const SEG_COMPANY_SHARED = '_Tài liệu chung công ty';
const SEG_SHARED_COMPANY = '_Tài liệu chung công ty';
const SEG_SHARED_REGION = '_Tài liệu chung khu vực';

/** @deprecated Chỉ dùng để nhận diện folder cũ khi migrate */
const LEGACY_SEG_REGIONS = 'Khu vực';
const LEGACY_SEG_DEPARTMENTS = 'Phòng ban';
const LEGACY_SEG_EMPLOYEES = 'Nhân viên';

const MODULES = {
  crm: 'CRM',
  sx: 'Sản xuất',
  vc: 'Vận chuyển',
  mkt: 'Marketing',
  other: 'Khác',
};

const FALLBACK = {
  module: 'Khác',
  company: 'Chưa phân loại công ty',
  region: 'Chưa phân loại khu vực',
  category: 'Chưa phân loại',
  department: 'Chưa phân loại phòng ban',
  employee: 'Người dùng',
};

function moduleLabel(key) {
  if (!key) return MODULES.other;
  const lower = String(key).trim().toLowerCase();
  return MODULES[lower] || MODULES.other;
}

function sanitizeSegment(name, fallback) {
  const s = String(name || '').trim();
  if (!s) return fallback;
  return s.length > 120 ? s.slice(0, 120) : s;
}

async function getUserOrgInfo(userId) {
  if (!userId) return null;
  let user = null;
  {
    const r = await supabase
      .from('users')
      .select('id, full_name, email, company_id, department_id, drive_module')
      .eq('id', userId)
      .maybeSingle();
    if (r.error) {
      const r2 = await supabase
        .from('users')
        .select('id, full_name, email, company_id, department_id')
        .eq('id', userId)
        .maybeSingle();
      if (r2.error) {
        console.error('[driveOrgPath] users lookup failed:', r2.error.message);
        return null;
      }
      user = r2.data ? { ...r2.data, drive_module: null } : null;
    } else {
      user = r.data;
    }
  }
  if (!user) return null;

  const [companyRes, deptRes, regionRes] = await Promise.all([
    user.company_id
      ? supabase.from('companies').select('id,name').eq('id', user.company_id).maybeSingle()
      : Promise.resolve({ data: null }),
    user.department_id
      ? (async () => {
          const r = await supabase
            .from('departments')
            .select('id,name,company_id,drive_category')
            .eq('id', user.department_id)
            .maybeSingle();
          if (r.error) {
            const r2 = await supabase
              .from('departments')
              .select('id,name,company_id')
              .eq('id', user.department_id)
              .maybeSingle();
            return { data: r2.data ? { ...r2.data, drive_category: null } : null };
          }
          return r;
        })()
      : Promise.resolve({ data: null }),
    supabase
      .from('user_company_regions')
      .select('region:company_regions(id,name,company_id,order_index)')
      .eq('user_id', userId)
      .limit(5),
  ]);

  let region = null;
  const list = (regionRes.data || []).map((r) => r.region).filter(Boolean);
  if (user.company_id) {
    region = list.find((r) => r.company_id === user.company_id) || null;
  }
  if (!region) region = list[0] || null;

  return {
    user,
    company: companyRes.data || null,
    department: deptRes.data || null,
    region,
    module_key: user.drive_module || 'other',
    module_name: moduleLabel(user.drive_module),
    category: deptRes.data?.drive_category || null,
  };
}

async function getCompanyInfo(companyId) {
  if (!companyId) return null;
  const { data } = await supabase.from('companies').select('id,name').eq('id', companyId).maybeSingle();
  return data || null;
}

async function getRegionInfo(regionId) {
  if (!regionId) return null;
  const { data } = await supabase
    .from('company_regions')
    .select('id,name,company_id')
    .eq('id', regionId)
    .maybeSingle();
  return data || null;
}

/**
 * Tạo chuỗi folder org phẳng tới parent của folder nhân viên.
 * Trả về { segments, deptFolder, names, org }.
 */
async function buildFlatOrgFolders({
  moduleName,
  companyName,
  regionName,
  categoryName,
  deptName,
  orgMeta,
}) {
  const rootId = gdrive.getRootFolderId();
  const segments = [];

  const moduleFolder = await gdrive.createFolder({ parentId: rootId, name: moduleName });
  segments.push({ kind: 'module', name: moduleName, google_folder_id: moduleFolder.id });

  const companyFolder = await gdrive.createFolder({ parentId: moduleFolder.id, name: companyName });
  segments.push({ kind: 'company', name: companyName, google_folder_id: companyFolder.id });

  const regionFolder = await gdrive.createFolder({ parentId: companyFolder.id, name: regionName });
  segments.push({ kind: 'region', name: regionName, google_folder_id: regionFolder.id });

  const categoryFolder = await gdrive.createFolder({ parentId: regionFolder.id, name: categoryName });
  segments.push({ kind: 'category', name: categoryName, google_folder_id: categoryFolder.id });

  const deptFolder = await gdrive.createFolder({ parentId: categoryFolder.id, name: deptName });
  segments.push({ kind: 'department', name: deptName, google_folder_id: deptFolder.id });

  return {
    segments,
    deptFolder,
    org: orgMeta,
  };
}

/**
 * Đảm bảo folder nhân viên đúng vị trí; nếu đã có drive root → MOVE folder trên GDrive khi phân loại đổi.
 */
async function ensureEmployeeFolder({ userId, deptFolder, employeeName, segments, org }) {
  const { data: rootRow } = await supabase
    .from('drive_roots')
    .select('id, google_folder_id, name')
    .eq('scope', 'user')
    .eq('owner_id', userId)
    .maybeSingle();

  let employeeFolder;
  let relocated = false;

  if (rootRow?.google_folder_id) {
    let meta;
    try {
      meta = await gdrive.getFileMeta(rootRow.google_folder_id);
    } catch (_) {
      meta = null;
    }

    if (meta) {
      const oldParentId = meta.parents?.[0];
      if (oldParentId && oldParentId !== deptFolder.id) {
        await gdrive.moveItem(rootRow.google_folder_id, deptFolder.id, oldParentId);
        relocated = true;
      }
      if (meta.name !== employeeName) {
        await gdrive.renameItem(rootRow.google_folder_id, employeeName);
      }
      employeeFolder = { id: rootRow.google_folder_id, name: employeeName };
    } else {
      employeeFolder = await gdrive.createFolder({ parentId: deptFolder.id, name: employeeName });
    }
  } else {
    employeeFolder = await gdrive.createFolder({ parentId: deptFolder.id, name: employeeName });
  }

  segments.push({ kind: 'employee', name: employeeName, google_folder_id: employeeFolder.id });

  if (rootRow && (relocated || rootRow.google_folder_id !== employeeFolder.id || rootRow.name !== employeeName)) {
    await supabase
      .from('drive_roots')
      .update({
        google_folder_id: employeeFolder.id,
        name: employeeName,
        updated_at: new Date().toISOString(),
      })
      .eq('id', rootRow.id);
  }

  return { employeeFolder, relocated };
}

async function ensureCompanyOrgPath(companyId) {
  const rootId = gdrive.getRootFolderId();
  const company = await getCompanyInfo(companyId);
  const companyName = sanitizeSegment(company?.name, FALLBACK.company);

  const bucket = await gdrive.createFolder({ parentId: rootId, name: SEG_COMPANY_BUCKET });
  const companyFolder = await gdrive.createFolder({ parentId: bucket.id, name: companyName });
  await gdrive.createFolder({ parentId: companyFolder.id, name: SEG_COMPANY_SHARED });

  return {
    google_folder_id: companyFolder.id,
    name: companyName,
    segments: [
      { kind: 'company_bucket', name: SEG_COMPANY_BUCKET, google_folder_id: bucket.id },
      { kind: 'company', name: companyName, google_folder_id: companyFolder.id },
    ],
  };
}

/**
 * Path Drive cá nhân: <Module>/<Cty>/<KV>/<Loại>/<PB>/<NV>/
 */
async function ensureUserOrgPath(userId, options = {}) {
  const { ensureUserDriveModuleAssigned } = require('./driveModuleDefaults');
  await ensureUserDriveModuleAssigned(userId, { contextModule: options.contextModule });
  const info = await getUserOrgInfo(userId);
  if (!info) throw new Error('User không tồn tại');

  const moduleName = sanitizeSegment(info.module_name, FALLBACK.module);
  const companyName = sanitizeSegment(info.company?.name, FALLBACK.company);
  const regionName = sanitizeSegment(info.region?.name, FALLBACK.region);
  const categoryName = sanitizeSegment(info.category, FALLBACK.category);
  const deptName = sanitizeSegment(info.department?.name, FALLBACK.department);
  const employeeName = sanitizeSegment(
    info.user.full_name || info.user.email || `User-${String(userId).slice(0, 8)}`,
    FALLBACK.employee,
  );

  const org = {
    module_key: info.module_key,
    module_name: moduleName,
    company_id: info.company?.id || null,
    region_id: info.region?.id || null,
    department_id: info.department?.id || null,
    user_id: userId,
    company_name: companyName,
    region_name: regionName,
    category_name: categoryName,
    department_name: deptName,
    employee_name: employeeName,
  };

  const { segments, deptFolder } = await buildFlatOrgFolders({
    moduleName,
    companyName,
    regionName,
    categoryName,
    deptName,
    orgMeta: org,
  });

  const { employeeFolder, relocated } = await ensureEmployeeFolder({
    userId,
    deptFolder,
    employeeName,
    segments,
    org,
  });

  return {
    google_folder_id: employeeFolder.id,
    name: employeeName,
    segments,
    org,
    relocated,
  };
}

/** Đồng bộ lại path khi phân loại thay đổi (alias rõ nghĩa cho admin hooks). */
async function syncUserDriveOrg(userId) {
  return ensureUserOrgPath(userId);
}

/** Di chuyển Drive tất cả user thuộc phòng ban (khi đổi drive_category). */
async function syncDepartmentUsersDrive(departmentId) {
  if (!departmentId) return { synced: 0 };
  const { data: users } = await supabase
    .from('users')
    .select('id')
    .eq('department_id', departmentId)
    .eq('is_active', true);
  let synced = 0;
  for (const u of users || []) {
    try {
      await ensureUserOrgPath(u.id);
      synced += 1;
    } catch (e) {
      console.warn('[driveOrgPath] sync dept user', u.id, e.message);
    }
  }
  return { synced };
}

const ENTITY_KIND_LABELS = {
  lead: 'Lead',
  deal: 'Deal',
  production_project: 'Dự án sản xuất',
  vc_project: 'Dự án vận chuyển',
  project: 'Dự án',
  task: 'Task',
};

const ENTITY_MODULE_MAP = {
  lead: 'crm',
  deal: 'crm',
  production_project: 'sx',
  vc_project: 'vc',
};

/** Map drive_module (crm|sx|vc) → ecosystem_module_scopes.module_key */
const DRIVE_TO_ECOSYSTEM_MODULE = {
  crm: 'crm',
  sx: 'production',
  vc: 'logistics',
  mkt: 'crm',
};

/**
 * Lọc công ty theo khối được phép của module (ecosystem_module_scopes).
 * Không có cấu hình scope → trả về nguyên danh sách (tương thích ngược).
 */
async function filterCompaniesForDriveModule(companies, driveModuleKey) {
  const list = Array.isArray(companies) ? companies : [];
  if (!list.length) return list;
  const ecoKey = DRIVE_TO_ECOSYSTEM_MODULE[String(driveModuleKey || '').toLowerCase()];
  if (!ecoKey) return list;

  const { getRestrictedDivisionIdsForModule } = require('./ecosystemModuleScope');
  const restricted = await getRestrictedDivisionIdsForModule(ecoKey);
  if (!restricted) return list;

  const ids = list.map((c) => c.id);
  const [{ data: coRows }, { data: links }] = await Promise.all([
    supabase.from('companies').select('id, division_unit_id').in('id', ids),
    supabase.from('company_division_units').select('company_id, division_unit_id').in('company_id', ids),
  ]);

  const divsByCompany = new Map();
  for (const c of coRows || []) {
    const set = new Set();
    if (c.division_unit_id) set.add(String(c.division_unit_id));
    divsByCompany.set(c.id, set);
  }
  for (const l of links || []) {
    if (!divsByCompany.has(l.company_id)) divsByCompany.set(l.company_id, new Set());
    divsByCompany.get(l.company_id).add(String(l.division_unit_id));
  }

  return list.filter((c) => {
    const divs = divsByCompany.get(c.id);
    if (!divs?.size) return false;
    return [...divs].some((d) => restricted.has(d));
  });
}

function entityModuleKey(entityType) {
  return ENTITY_MODULE_MAP[entityType] || 'other';
}

function entityKindLabel(entityType) {
  return ENTITY_KIND_LABELS[entityType] || 'Khác';
}

async function lookupEntity(entityType, entityId) {
  if (!entityId) return null;
  if (entityType === 'lead' || entityType === 'deal') {
    const r = await supabase
      .from('crm_leads')
      .select('id, code, title, type, company_id, region_id, assigned_to, lead_owner_id, created_by, customer_id')
      .eq('id', entityId)
      .maybeSingle();
    if (r.error) {
      const r2 = await supabase
        .from('crm_leads')
        .select('id, code, title, type, company_id, assigned_to, created_by')
        .eq('id', entityId)
        .maybeSingle();
      return r2.data || null;
    }
    return r.data || null;
  }
  if (entityType === 'production_project' || entityType === 'vc_project' || entityType === 'project') {
    const r = await supabase
      .from('projects')
      .select('id, code, name, company_id, created_by, project_manager_id, customer_id')
      .eq('id', entityId)
      .maybeSingle();
    if (r.error) {
      const r2 = await supabase
        .from('projects')
        .select('id, code, name, created_by')
        .eq('id', entityId)
        .maybeSingle();
      return r2.data || null;
    }
    return r.data || null;
  }
  return null;
}

function buildEntityFolderName(entity) {
  const code = String(entity.code || entity.id || '').trim();
  const title = String(entity.title || entity.name || '').trim();
  if (code && title) return sanitizeSegment(`${code} — ${title}`, code);
  if (code) return sanitizeSegment(code, 'NO-CODE');
  if (title) return sanitizeSegment(title, 'KHÔNG TÊN');
  return 'KHÔNG TÊN';
}

async function ensureSharedCompanyPath({ companyId, moduleKey }) {
  if (!companyId) throw new Error('companyId bắt buộc');
  const rootId = gdrive.getRootFolderId();
  const company = await getCompanyInfo(companyId);
  const companyName = sanitizeSegment(company?.name, FALLBACK.company);
  const mKey = (moduleKey || 'other').toLowerCase();
  const mName = moduleLabel(mKey);

  const moduleFolder = await gdrive.createFolder({ parentId: rootId, name: mName });
  const companyFolder = await gdrive.createFolder({ parentId: moduleFolder.id, name: companyName });
  const sharedFolder = await gdrive.createFolder({ parentId: companyFolder.id, name: SEG_SHARED_COMPANY });

  return {
    google_folder_id: sharedFolder.id,
    name: `${mName} · ${companyName} — Chung công ty`,
    module_key: mKey,
    module_name: mName,
    company_id: companyId,
    company_name: companyName,
    segments: [
      { kind: 'module', name: mName, google_folder_id: moduleFolder.id },
      { kind: 'company', name: companyName, google_folder_id: companyFolder.id },
      { kind: 'shared_company', name: SEG_SHARED_COMPANY, google_folder_id: sharedFolder.id },
    ],
  };
}

async function ensureSharedRegionPath({ regionId, moduleKey }) {
  const region = await getRegionInfo(regionId);
  if (!region) throw new Error('Khu vực không tồn tại');
  const rootId = gdrive.getRootFolderId();
  const company = await getCompanyInfo(region.company_id);
  const companyName = sanitizeSegment(company?.name, FALLBACK.company);
  const regionName = sanitizeSegment(region.name, FALLBACK.region);
  const mKey = (moduleKey || 'other').toLowerCase();
  const mName = moduleLabel(mKey);

  const moduleFolder = await gdrive.createFolder({ parentId: rootId, name: mName });
  const companyFolder = await gdrive.createFolder({ parentId: moduleFolder.id, name: companyName });
  const regionFolder = await gdrive.createFolder({ parentId: companyFolder.id, name: regionName });
  const sharedFolder = await gdrive.createFolder({ parentId: regionFolder.id, name: SEG_SHARED_REGION });

  return {
    google_folder_id: sharedFolder.id,
    name: `${mName} · ${companyName} · ${regionName} — Chung khu vực`,
    module_key: mKey,
    module_name: mName,
    company_id: region.company_id,
    company_name: companyName,
    region_id: regionId,
    region_name: regionName,
    segments: [
      { kind: 'module', name: mName, google_folder_id: moduleFolder.id },
      { kind: 'company', name: companyName, google_folder_id: companyFolder.id },
      { kind: 'region', name: regionName, google_folder_id: regionFolder.id },
      { kind: 'shared_region', name: SEG_SHARED_REGION, google_folder_id: sharedFolder.id },
    ],
  };
}

async function ensureEntityOrgPath({ entityType, entityId, uploaderUserId }) {
  const entity = await lookupEntity(entityType, entityId);
  if (!entity) throw new Error('Entity không tồn tại: ' + entityType + '/' + entityId);

  const ownerId = entity.lead_owner_id || entity.assigned_to || entity.project_manager_id || entity.created_by || uploaderUserId;
  const moduleKey = entityModuleKey(entityType);
  const moduleName = moduleLabel(moduleKey);
  const ownerInfo = ownerId ? await getUserOrgInfo(ownerId) : null;

  let companyId = entity.company_id || ownerInfo?.company?.id || null;
  let companyName = ownerInfo?.company?.name || null;
  if (companyId && (!companyName || companyId !== ownerInfo?.company?.id)) {
    const c = await getCompanyInfo(companyId);
    companyName = c?.name || null;
  }
  companyName = sanitizeSegment(companyName, FALLBACK.company);

  let regionName = ownerInfo?.region?.name || null;
  if (entity.region_id) {
    const r = await supabase.from('company_regions').select('id,name').eq('id', entity.region_id).maybeSingle();
    regionName = r.data?.name || regionName;
  }
  regionName = sanitizeSegment(regionName, FALLBACK.region);

  const categoryName = sanitizeSegment(ownerInfo?.category, FALLBACK.category);
  const deptName = sanitizeSegment(ownerInfo?.department?.name, FALLBACK.department);
  const employeeName = ownerInfo
    ? sanitizeSegment(ownerInfo.user.full_name || ownerInfo.user.email || `User-${String(ownerId).slice(0, 8)}`, FALLBACK.employee)
    : 'Chưa gán';

  const entityKindFolderName = entityKindLabel(entityType);
  const entityFolderName = buildEntityFolderName(entity);

  const org = {
    module_key: moduleKey,
    module_name: moduleName,
    company_id: companyId,
    company_name: companyName,
    region_id: entity.region_id || ownerInfo?.region?.id || null,
    region_name: regionName,
    category_name: categoryName,
    department_id: ownerInfo?.department?.id || null,
    department_name: deptName,
    user_id: ownerId,
    employee_name: employeeName,
  };

  const { segments, deptFolder } = await buildFlatOrgFolders({
    moduleName,
    companyName,
    regionName,
    categoryName,
    deptName,
    orgMeta: org,
  });

  let employeeFolder;
  const pathSegments = [...segments];
  if (ownerId) {
    const ensured = await ensureEmployeeFolder({
      userId: ownerId,
      deptFolder,
      employeeName,
      segments: pathSegments,
      org,
    });
    employeeFolder = ensured.employeeFolder;
  } else {
    employeeFolder = await gdrive.createFolder({ parentId: deptFolder.id, name: employeeName });
    pathSegments.push({ kind: 'employee', name: employeeName, google_folder_id: employeeFolder.id });
  }

  const kindFolder = await gdrive.createFolder({ parentId: employeeFolder.id, name: entityKindFolderName });
  pathSegments.push({ kind: 'entity_kind', name: entityKindFolderName, google_folder_id: kindFolder.id });

  const entityFolder = await gdrive.createFolder({ parentId: kindFolder.id, name: entityFolderName });
  pathSegments.push({ kind: 'entity', name: entityFolderName, google_folder_id: entityFolder.id });

  return {
    google_folder_id: entityFolder.id,
    google_kind_folder_id: kindFolder.id,
    google_user_folder_id: employeeFolder.id,
    owner_user_id: ownerId || null,
    module_key: moduleKey,
    module_name: moduleName,
    entity,
    entity_type: entityType,
    entity_kind_label: entityKindFolderName,
    entity_folder_name: entityFolderName,
    segments: pathSegments,
    org,
  };
}

module.exports = {
  ensureUserOrgPath,
  syncUserDriveOrg,
  syncDepartmentUsersDrive,
  ensureCompanyOrgPath,
  ensureEntityOrgPath,
  ensureSharedCompanyPath,
  ensureSharedRegionPath,
  lookupEntity,
  buildEntityFolderName,
  entityModuleKey,
  entityKindLabel,
  getUserOrgInfo,
  getCompanyInfo,
  getRegionInfo,
  MODULES,
  moduleLabel,
  DRIVE_TO_ECOSYSTEM_MODULE,
  filterCompaniesForDriveModule,
  SEG_COMPANY_BUCKET,
  SEG_COMPANY_SHARED,
  SEG_SHARED_COMPANY,
  SEG_SHARED_REGION,
  LEGACY_SEG_REGIONS,
  LEGACY_SEG_DEPARTMENTS,
  LEGACY_SEG_EMPLOYEES,
  ENTITY_KIND_LABELS,
};
