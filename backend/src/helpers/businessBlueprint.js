const { supabase } = require('../config/supabase');
const {
  completeTenantFirstSetup,
  setupTenantDepartments,
  DEPT_TEMPLATES,
} = require('./tenantSetup');
const { invalidateTenantCache } = require('./tenantScope');
const { syncDepartmentToEcosystem } = require('./ecosystemSync');

const DEFAULT_BLUEPRINT_KEY = 'cabinet-business-os';

function text(value) {
  return String(value || '').trim();
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => text(value))
    .filter(Boolean))];
}

function normalizeBlueprintDefinition(input = {}) {
  const rawModules = Array.isArray(input.modules) ? input.modules : [];
  const modules = [];
  const seen = new Set();
  for (const item of rawModules) {
    const key = text(typeof item === 'string' ? item : item?.key);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    modules.push({
      key,
      enabled: typeof item === 'string' ? true : item.enabled !== false,
      config: typeof item === 'object' && item?.config && !Array.isArray(item.config)
        ? item.config
        : {},
    });
  }

  return {
    ...input,
    schema_version: Number(input.schema_version) || 1,
    modules,
    department_templates: uniqueStrings(input.department_templates),
    processes: Array.isArray(input.processes) ? input.processes : [],
    operating_kernel: input.operating_kernel && typeof input.operating_kernel === 'object'
      ? input.operating_kernel
      : {},
  };
}

function validateBlueprintDefinition(input = {}) {
  const definition = normalizeBlueprintDefinition(input);
  const errors = [];
  if (!definition.modules.length) errors.push('Bộ mẫu cần ít nhất một module.');
  for (const process of definition.processes) {
    if (!text(process?.key)) errors.push('Mỗi quy trình cần có key.');
    if (!text(process?.name)) errors.push(`Quy trình ${text(process?.key) || '(chưa có key)'} cần có tên.`);
    if (!Array.isArray(process?.stages) || !process.stages.length) {
      errors.push(`Quy trình ${text(process?.key) || '(chưa có key)'} cần ít nhất một giai đoạn.`);
    }
  }
  return { definition, errors };
}

function keyed(items, keySelector) {
  return new Map((items || []).map((item) => [keySelector(item), item]).filter(([key]) => key));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Lập kế hoạch nâng Blueprint theo nguyên tắc không phá huỷ dữ liệu tenant.
 * Các mục không còn nằm trong Blueprint mới chỉ được báo là "retained";
 * apply không tự xoá module, phòng ban hay process đang có.
 */
function buildBlueprintChangePlan(currentInput = {}, targetInput = {}) {
  const current = normalizeBlueprintDefinition(currentInput);
  const target = normalizeBlueprintDefinition(targetInput);
  const currentModules = keyed(current.modules, (item) => item.key);
  const targetModules = keyed(target.modules, (item) => item.key);
  const currentProcesses = keyed(current.processes, (item) => text(item?.key));
  const targetProcesses = keyed(target.processes, (item) => text(item?.key));
  const currentDepartments = new Set(current.department_templates);
  const targetDepartments = new Set(target.department_templates);

  const modules = {
    enable: [],
    disable: [],
    reconfigure: [],
    unchanged: [],
    retained_outside_blueprint: [],
  };
  for (const [key, next] of targetModules) {
    const previous = currentModules.get(key);
    if (!previous) {
      (next.enabled ? modules.enable : modules.disable).push(key);
    } else if (previous.enabled !== next.enabled) {
      (next.enabled ? modules.enable : modules.disable).push(key);
    } else if (stableJson(previous.config || {}) !== stableJson(next.config || {})) {
      modules.reconfigure.push(key);
    } else {
      modules.unchanged.push(key);
    }
  }
  for (const key of currentModules.keys()) {
    if (!targetModules.has(key)) modules.retained_outside_blueprint.push(key);
  }

  const departments = {
    add_templates: target.department_templates.filter((key) => !currentDepartments.has(key)),
    unchanged: target.department_templates.filter((key) => currentDepartments.has(key)),
    retained_outside_blueprint: current.department_templates.filter((key) => !targetDepartments.has(key)),
  };

  const processes = {
    add: [],
    update: [],
    unchanged: [],
    retained_outside_blueprint: [],
  };
  for (const [key, next] of targetProcesses) {
    const previous = currentProcesses.get(key);
    if (!previous) processes.add.push(key);
    else if (stableJson(previous) !== stableJson(next)) processes.update.push(key);
    else processes.unchanged.push(key);
  }
  for (const key of currentProcesses.keys()) {
    if (!targetProcesses.has(key)) processes.retained_outside_blueprint.push(key);
  }

  const changeCount = modules.enable.length
    + modules.disable.length
    + modules.reconfigure.length
    + departments.add_templates.length
    + processes.add.length
    + processes.update.length;
  const retainedCount = modules.retained_outside_blueprint.length
    + departments.retained_outside_blueprint.length
    + processes.retained_outside_blueprint.length;

  return {
    has_changes: changeCount > 0,
    change_count: changeCount,
    retained_count: retainedCount,
    destructive_actions: [],
    modules,
    departments,
    processes,
  };
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/**
 * Override chỉ là cấu hình riêng của một công ty. Không nhận bất kỳ bản ghi
 * giao dịch nào; apply chỉ materialize phòng ban còn thiếu và lưu effective
 * definition để Business OS đọc theo company_id.
 */
function normalizeCompanyBlueprintOverrides(input = {}) {
  const raw = objectValue(input);
  const modules = {};
  for (const [key, value] of Object.entries(objectValue(raw.modules))) {
    const moduleKey = text(key);
    if (!moduleKey) continue;
    const item = objectValue(value);
    modules[moduleKey] = {
      ...(typeof item.enabled === 'boolean' ? { enabled: item.enabled } : {}),
      ...(Object.keys(objectValue(item.config)).length ? { config: objectValue(item.config) } : {}),
    };
  }

  const processes = {};
  for (const [key, value] of Object.entries(objectValue(raw.processes))) {
    const processKey = text(key);
    if (!processKey) continue;
    const item = objectValue(value);
    processes[processKey] = {
      ...(typeof item.enabled === 'boolean' ? { enabled: item.enabled } : {}),
      ...(Object.keys(objectValue(item.definition)).length
        ? { definition: { ...objectValue(item.definition), key: processKey } }
        : {}),
    };
  }

  const departments = objectValue(raw.department_templates);
  return {
    schema_version: 1,
    modules,
    department_templates: {
      add: uniqueStrings(departments.add),
      hidden: uniqueStrings(departments.hidden),
    },
    processes,
    operating_kernel: objectValue(raw.operating_kernel),
  };
}

function mergeCompanyBlueprintOverrides(currentInput = {}, patchInput) {
  const current = normalizeCompanyBlueprintOverrides(currentInput);
  if (patchInput === undefined) return current;
  const rawPatch = objectValue(patchInput);
  const patch = normalizeCompanyBlueprintOverrides(rawPatch);
  const modules = { ...current.modules };
  for (const [rawKey, rawValue] of Object.entries(objectValue(rawPatch.modules))) {
    const key = text(rawKey);
    if (!key) continue;
    if (rawValue === null) {
      delete modules[key];
      continue;
    }
    const value = patch.modules[key] || {};
    modules[key] = {
      ...objectValue(modules[key]),
      ...value,
      ...(value.config
        ? { config: { ...objectValue(modules[key]?.config), ...value.config } }
        : {}),
    };
  }
  const processes = { ...current.processes };
  for (const [rawKey, rawValue] of Object.entries(objectValue(rawPatch.processes))) {
    const key = text(rawKey);
    if (!key) continue;
    if (rawValue === null) {
      delete processes[key];
      continue;
    }
    const value = patch.processes[key] || {};
    processes[key] = { ...objectValue(processes[key]), ...value };
  }
  const patchDepartments = objectValue(rawPatch.department_templates);
  return normalizeCompanyBlueprintOverrides({
    modules,
    department_templates: {
      add: Object.prototype.hasOwnProperty.call(patchDepartments, 'add')
        ? patch.department_templates.add
        : current.department_templates.add,
      hidden: Object.prototype.hasOwnProperty.call(patchDepartments, 'hidden')
        ? patch.department_templates.hidden
        : current.department_templates.hidden,
    },
    processes,
    operating_kernel: {
      ...current.operating_kernel,
      ...patch.operating_kernel,
    },
  });
}

function resolveCompanyBlueprintDefinition(baseInput = {}, overrideInput = {}) {
  const base = normalizeBlueprintDefinition(baseInput);
  const overrides = normalizeCompanyBlueprintOverrides(overrideInput);
  const moduleMap = keyed(base.modules, (item) => item.key);
  for (const [key, override] of Object.entries(overrides.modules)) {
    const previous = moduleMap.get(key) || { key, enabled: true, config: {} };
    moduleMap.set(key, {
      ...previous,
      ...(typeof override.enabled === 'boolean' ? { enabled: override.enabled } : {}),
      config: { ...objectValue(previous.config), ...objectValue(override.config) },
    });
  }

  const hiddenDepartments = new Set(overrides.department_templates.hidden);
  const departmentTemplates = uniqueStrings([
    ...base.department_templates.filter((key) => !hiddenDepartments.has(key)),
    ...overrides.department_templates.add,
  ]);

  const processMap = keyed(base.processes, (item) => text(item?.key));
  for (const [key, override] of Object.entries(overrides.processes)) {
    if (override.enabled === false) {
      processMap.delete(key);
      continue;
    }
    if (override.definition) {
      processMap.set(key, { ...objectValue(processMap.get(key)), ...override.definition, key });
    }
  }

  return normalizeBlueprintDefinition({
    ...base,
    modules: [...moduleMap.values()],
    department_templates: departmentTemplates,
    processes: [...processMap.values()],
    operating_kernel: { ...base.operating_kernel, ...overrides.operating_kernel },
  });
}

function isMissingBlueprintSchema(error) {
  const message = text(error?.message).toLowerCase();
  return error?.code === '42P01'
    || error?.code === 'PGRST205'
    || message.includes('business_blueprints')
    || message.includes('tenant_blueprint_installations')
    || message.includes('company_blueprint_installations');
}

async function listPublishedBlueprints() {
  const { data, error } = await supabase
    .from('business_blueprints')
    .select(`
      id, blueprint_key, name, industry, description, is_active, published_version_id,
      published_version:business_blueprint_versions!business_blueprints_published_version_fk(
        id, version_number, status, definition, release_notes, published_at
      )
    `)
    .eq('is_active', true)
    .order('name');
  if (error) throw error;

  return (data || []).map((blueprint) => ({
    ...blueprint,
    published_version: blueprint.published_version
      ? {
        ...blueprint.published_version,
        definition: normalizeBlueprintDefinition(blueprint.published_version.definition),
      }
      : null,
  }));
}

async function listBlueprintCatalog() {
  const { data, error } = await supabase
    .from('business_blueprints')
    .select(`
      *,
      versions:business_blueprint_versions!business_blueprint_versions_blueprint_id_fkey(
        id, version_number, status, definition, release_notes, published_at, created_at, updated_at
      )
    `)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((blueprint) => ({
    ...blueprint,
    versions: (blueprint.versions || [])
      .map((version) => ({
        ...version,
        definition: normalizeBlueprintDefinition(version.definition),
      }))
      .sort((a, b) => Number(b.version_number) - Number(a.version_number)),
  }));
}

async function getBlueprintDetail(blueprintId) {
  const catalog = await listBlueprintCatalog();
  return catalog.find((item) => String(item.id) === String(blueprintId)) || null;
}

async function createBlueprint({ blueprintKey, name, industry = 'general', description = '', actorUserId = null } = {}) {
  const key = text(blueprintKey).toLowerCase();
  const blueprintName = text(name);
  if (!key || !/^[a-z0-9]+(?:[a-z0-9_-]*[a-z0-9])?$/.test(key)) {
    const error = new Error('Blueprint key chỉ gồm chữ thường, số, dấu gạch ngang hoặc gạch dưới.');
    error.code = 'BLUEPRINT_VALIDATION';
    throw error;
  }
  if (!blueprintName) {
    const error = new Error('Thiếu tên Blueprint.');
    error.code = 'BLUEPRINT_VALIDATION';
    throw error;
  }
  const { data, error } = await supabase
    .from('business_blueprints')
    .insert({
      blueprint_key: key,
      name: blueprintName,
      industry: text(industry) || 'general',
      description: text(description) || null,
      created_by: actorUserId || null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function createBlueprintVersion({ blueprintId, definition, releaseNotes = '', actorUserId = null } = {}) {
  const validation = validateBlueprintDefinition(definition);
  if (validation.errors.length) {
    const error = new Error(validation.errors.join(' '));
    error.code = 'BLUEPRINT_VALIDATION';
    error.validation_errors = validation.errors;
    throw error;
  }

  const { data: latest, error: latestError } = await supabase
    .from('business_blueprint_versions')
    .select('version_number')
    .eq('blueprint_id', blueprintId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw latestError;

  const { data, error } = await supabase
    .from('business_blueprint_versions')
    .insert({
      blueprint_id: blueprintId,
      version_number: Number(latest?.version_number || 0) + 1,
      status: 'draft',
      definition: validation.definition,
      release_notes: text(releaseNotes) || null,
      created_by: actorUserId || null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return { ...data, definition: normalizeBlueprintDefinition(data.definition) };
}

async function publishBlueprintVersion({ blueprintId, versionId } = {}) {
  const { data, error } = await supabase.rpc('publish_business_blueprint_version', {
    p_blueprint_id: blueprintId,
    p_version_id: versionId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row ? { ...row, definition: normalizeBlueprintDefinition(row.definition) } : null;
}

async function updateBlueprint(blueprintId, patch = {}) {
  const update = { updated_at: new Date().toISOString() };
  ['name', 'industry', 'description', 'is_active'].forEach((field) => {
    if (patch[field] !== undefined) update[field] = patch[field];
  });
  if (update.name !== undefined) update.name = text(update.name);
  if (update.industry !== undefined) update.industry = text(update.industry) || 'general';
  if (update.description !== undefined) update.description = text(update.description) || null;
  const { data, error } = await supabase
    .from('business_blueprints')
    .update(update)
    .eq('id', blueprintId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function resolvePublishedBlueprint(blueprintKey, requestedVersion = null) {
  const key = text(blueprintKey) || DEFAULT_BLUEPRINT_KEY;
  const { data: blueprint, error: blueprintError } = await supabase
    .from('business_blueprints')
    .select('*')
    .eq('blueprint_key', key)
    .eq('is_active', true)
    .maybeSingle();
  if (blueprintError) throw blueprintError;
  if (!blueprint) throw new Error(`Không tìm thấy bộ mẫu "${key}".`);

  let versionQuery = supabase
    .from('business_blueprint_versions')
    .select('*')
    .eq('blueprint_id', blueprint.id)
    .eq('status', 'published');
  if (requestedVersion) versionQuery = versionQuery.eq('version_number', Number(requestedVersion));
  else versionQuery = versionQuery.order('version_number', { ascending: false }).limit(1);

  const { data: versionRows, error: versionError } = await versionQuery;
  if (versionError) throw versionError;
  const version = Array.isArray(versionRows) ? versionRows[0] : versionRows;
  if (!version) throw new Error(`Bộ mẫu "${key}" chưa có phiên bản đã phát hành.`);

  return {
    blueprint,
    version: {
      ...version,
      definition: normalizeBlueprintDefinition(version.definition),
    },
  };
}

async function getTenantBlueprintInstallation(tenantId) {
  const { data, error } = await supabase
    .from('tenant_blueprint_installations')
    .select(`
      *,
      blueprint:business_blueprints(id, blueprint_key, name, industry, description),
      version:business_blueprint_versions(id, version_number, status, definition, release_notes, published_at)
    `)
    .eq('tenant_id', tenantId)
    .order('applied_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((installation) => ({
    ...installation,
    version: installation.version
      ? { ...installation.version, definition: normalizeBlueprintDefinition(installation.version.definition) }
      : null,
  }));
}

async function getCompanyBlueprintInstallations({ tenantId, companyId = null } = {}) {
  if (!text(tenantId)) throw new Error('Thiếu tenant_id để đọc Blueprint theo công ty.');
  let query = supabase
    .from('company_blueprint_installations')
    .select(`
      *,
      company:companies(id, name, short_name, tenant_id),
      blueprint:business_blueprints(id, blueprint_key, name, industry, description),
      version:business_blueprint_versions(id, version_number, status, definition, release_notes, published_at)
    `)
    .eq('tenant_id', tenantId)
    .order('applied_at', { ascending: false });
  if (text(companyId)) query = query.eq('company_id', companyId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((installation) => ({
    ...installation,
    company_overrides: normalizeCompanyBlueprintOverrides(installation.company_overrides),
    version: installation.version
      ? { ...installation.version, definition: normalizeBlueprintDefinition(installation.version.definition) }
      : null,
  }));
}

async function assertCompanyBlueprintTarget(tenantId, companyId) {
  if (!text(companyId)) throw new Error('Thiếu company_id để áp dụng Blueprint theo công ty.');
  const { data, error } = await supabase
    .from('companies')
    .select('id, tenant_id, name, short_name, division_unit_id')
    .eq('id', companyId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const targetError = new Error('Công ty không thuộc hệ sinh thái đang chọn.');
    targetError.code = 'BLUEPRINT_COMPANY_SCOPE';
    throw targetError;
  }
  return data;
}

async function previewBlueprintForCompany({
  tenantId,
  companyId,
  blueprintKey = DEFAULT_BLUEPRINT_KEY,
  versionNumber = null,
  companyOverrides,
} = {}) {
  const company = await assertCompanyBlueprintTarget(tenantId, companyId);
  const [{ blueprint, version }, installations] = await Promise.all([
    resolvePublishedBlueprint(blueprintKey, versionNumber),
    getCompanyBlueprintInstallations({ tenantId, companyId }),
  ]);
  const currentInstallation = installations.find((item) => String(item.blueprint_id) === String(blueprint.id)) || null;
  const overrides = mergeCompanyBlueprintOverrides(
    currentInstallation?.company_overrides,
    companyOverrides,
  );
  const currentDefinition = currentInstallation?.configuration?.effective_definition
    || (currentInstallation?.version?.definition
      ? resolveCompanyBlueprintDefinition(currentInstallation.version.definition, currentInstallation.company_overrides)
      : {});
  const targetDefinition = resolveCompanyBlueprintDefinition(version.definition, overrides);
  return {
    tenant_id: tenantId,
    company: { id: company.id, name: company.name, short_name: company.short_name || null },
    scope: 'company',
    blueprint: {
      id: blueprint.id,
      blueprint_key: blueprint.blueprint_key,
      name: blueprint.name,
    },
    current: currentInstallation
      ? {
        installation_id: currentInstallation.id,
        status: currentInstallation.status,
        version_number: currentInstallation.version?.version_number || null,
        applied_at: currentInstallation.applied_at || null,
      }
      : null,
    target: {
      version_id: version.id,
      version_number: version.version_number,
      release_notes: version.release_notes || null,
    },
    company_overrides: overrides,
    effective_definition: targetDefinition,
    transaction_data_copied: false,
    plan: buildBlueprintChangePlan(currentDefinition, targetDefinition),
  };
}

async function previewBlueprintForTenant({ tenantId, blueprintKey = DEFAULT_BLUEPRINT_KEY, versionNumber = null } = {}) {
  if (!text(tenantId)) throw new Error('Thiếu tenant_id để xem trước bộ mẫu.');
  const [{ blueprint, version }, installations] = await Promise.all([
    resolvePublishedBlueprint(blueprintKey, versionNumber),
    getTenantBlueprintInstallation(tenantId),
  ]);
  const currentInstallation = installations.find((item) => String(item.blueprint_id) === String(blueprint.id)) || null;
  const currentDefinition = currentInstallation?.version?.definition || {};
  return {
    tenant_id: tenantId,
    blueprint: {
      id: blueprint.id,
      blueprint_key: blueprint.blueprint_key,
      name: blueprint.name,
    },
    current: currentInstallation
      ? {
        installation_id: currentInstallation.id,
        status: currentInstallation.status,
        version_number: currentInstallation.version?.version_number || null,
        applied_at: currentInstallation.applied_at || null,
      }
      : null,
    target: {
      version_id: version.id,
      version_number: version.version_number,
      release_notes: version.release_notes || null,
    },
    plan: buildBlueprintChangePlan(currentDefinition, version.definition),
  };
}

async function markInstallation({ tenantId, blueprintId, versionId, actorUserId, status, configuration, errorMessage }) {
  const now = new Date().toISOString();
  const payload = {
    tenant_id: tenantId,
    blueprint_id: blueprintId,
    blueprint_version_id: versionId,
    status,
    configuration: configuration || {},
    applied_by: actorUserId || null,
    applied_at: status === 'active' ? now : null,
    last_error: errorMessage ? text(errorMessage).slice(0, 2000) : null,
    updated_at: now,
  };
  const { data, error } = await supabase
    .from('tenant_blueprint_installations')
    .upsert(payload, { onConflict: 'tenant_id,blueprint_id' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function applyBlueprintToTenant({
  tenantId,
  blueprintKey = DEFAULT_BLUEPRINT_KEY,
  versionNumber = null,
  actorUserId = null,
  companyName = '',
  companyShortName = '',
  bootstrapCompany = false,
  expectedCurrentVersion,
} = {}) {
  if (!text(tenantId)) throw new Error('Thiếu tenant_id để áp dụng bộ mẫu.');

  const { blueprint, version } = await resolvePublishedBlueprint(blueprintKey, versionNumber);
  if (expectedCurrentVersion !== undefined) {
    const installations = await getTenantBlueprintInstallation(tenantId);
    const current = installations.find((item) => String(item.blueprint_id) === String(blueprint.id));
    const actualVersion = current?.version?.version_number ?? null;
    const expectedVersion = expectedCurrentVersion == null ? null : Number(expectedCurrentVersion);
    if (actualVersion !== expectedVersion) {
      const conflict = new Error('Blueprint đã thay đổi sau lần xem trước. Hãy tải lại kế hoạch trước khi áp dụng.');
      conflict.code = 'BLUEPRINT_VERSION_CONFLICT';
      conflict.expected_version = expectedVersion;
      conflict.actual_version = actualVersion;
      throw conflict;
    }
  }
  const definition = version.definition;
  const configuration = {
    schema_version: definition.schema_version,
    blueprint_key: blueprint.blueprint_key,
    version_number: version.version_number,
    applied_modules: definition.modules.map((item) => item.key),
    department_templates: definition.department_templates,
  };

  await markInstallation({
    tenantId,
    blueprintId: blueprint.id,
    versionId: version.id,
    actorUserId,
    status: 'applying',
    configuration,
  });

  try {
    if (definition.modules.length) {
      const { error: featureError } = await supabase
        .from('tenant_features')
        .upsert(definition.modules.map((module) => ({
          tenant_id: tenantId,
          feature_key: module.key,
          enabled: module.enabled,
          config: module.config,
        })), { onConflict: 'tenant_id,feature_key' });
      if (featureError) throw featureError;
    }

    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, settings')
      .eq('id', tenantId)
      .single();
    if (tenantError) throw tenantError;

    const settings = {
      ...(tenant.settings || {}),
      business_blueprint: {
        key: blueprint.blueprint_key,
        version: version.version_number,
        applied_at: new Date().toISOString(),
      },
    };
    const { error: settingsError } = await supabase
      .from('tenants')
      .update({ settings, updated_at: new Date().toISOString() })
      .eq('id', tenantId);
    if (settingsError) throw settingsError;

    let company = null;
    let departments = [];
    if (bootstrapCompany && text(companyName)) {
      const { data: existingCompanies, error: companyCountError } = await supabase
        .from('companies')
        .select('id')
        .eq('tenant_id', tenantId)
        .limit(1);
      if (companyCountError) throw companyCountError;

      if (!existingCompanies?.length) {
        const { data: adminUser, error: adminError } = await supabase
          .from('users')
          .select('id, email, full_name, role, company_id, tenant_id')
          .eq('tenant_id', tenantId)
          .eq('role', 'admin')
          .is('company_id', null)
          .order('created_at')
          .limit(1)
          .maybeSingle();
        if (adminError) throw adminError;
        if (!adminUser) throw new Error('Chưa có admin tenant để tạo công ty đầu tiên.');

        const setup = await completeTenantFirstSetup(adminUser, {
          company_name: text(companyName),
          short_name: text(companyShortName) || null,
          email: adminUser.email,
        });
        company = setup.company;
        if (definition.department_templates.length) {
          const departmentSetup = await setupTenantDepartments(setup.user, {
            company_id: setup.company_id,
            templates: definition.department_templates,
          });
          departments = departmentSetup.departments || [];
        }
      }
    }

    const installation = await markInstallation({
      tenantId,
      blueprintId: blueprint.id,
      versionId: version.id,
      actorUserId,
      status: 'active',
      configuration: {
        ...configuration,
        bootstrapped_company_id: company?.id || null,
        bootstrapped_department_ids: departments.map((item) => item.id),
      },
    });
    invalidateTenantCache(tenantId);
    return { blueprint, version, installation, company, departments };
  } catch (error) {
    try {
      await markInstallation({
        tenantId,
        blueprintId: blueprint.id,
        versionId: version.id,
        actorUserId,
        status: 'failed',
        configuration,
        errorMessage: error.message,
      });
    } catch (markError) {
      console.warn('[business-blueprint] Không ghi được trạng thái lỗi:', markError.message);
    }
    throw error;
  }
}

function departmentTemplateName(templateKey) {
  const key = text(templateKey);
  return DEPT_TEMPLATES[key] || key;
}

function blueprintDepartmentSlug(templateKey, companyId) {
  const base = text(templateKey)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'department';
  return `bp-${base}-${String(companyId).replace(/-/g, '')}`.slice(0, 240);
}

async function ensureCompanyBlueprintDepartments(company, templateKeys) {
  const { data: existing, error: existingError } = await supabase
    .from('departments')
    .select('id, name, slug, company_id, division_unit_id, is_active')
    .eq('company_id', company.id);
  if (existingError) throw existingError;
  const byName = new Map((existing || []).map((item) => [text(item.name).toLocaleLowerCase('vi'), item]));
  const departments = [];
  const created = [];

  for (const templateKey of uniqueStrings(templateKeys)) {
    const name = departmentTemplateName(templateKey);
    const found = byName.get(name.toLocaleLowerCase('vi'));
    if (found) {
      departments.push(found);
      continue;
    }
    const { data, error } = await supabase
      .from('departments')
      .insert({
        name,
        slug: blueprintDepartmentSlug(templateKey, company.id),
        company_id: company.id,
        division_unit_id: company.division_unit_id || null,
        color: '#6366F1',
        is_active: true,
      })
      .select('id, name, slug, company_id, division_unit_id, is_active')
      .single();
    if (error) throw error;
    await syncDepartmentToEcosystem(data);
    byName.set(name.toLocaleLowerCase('vi'), data);
    departments.push(data);
    created.push(data);
  }
  return { departments, created };
}

async function markCompanyInstallation({
  tenantId,
  companyId,
  blueprintId,
  versionId,
  actorUserId,
  status,
  configuration,
  companyOverrides,
  errorMessage,
}) {
  const now = new Date().toISOString();
  const payload = {
    tenant_id: tenantId,
    company_id: companyId,
    blueprint_id: blueprintId,
    blueprint_version_id: versionId,
    status,
    configuration: configuration || {},
    company_overrides: normalizeCompanyBlueprintOverrides(companyOverrides),
    applied_by: actorUserId || null,
    applied_at: status === 'active' ? now : null,
    last_error: errorMessage ? text(errorMessage).slice(0, 2000) : null,
    updated_at: now,
  };
  const { data, error } = await supabase
    .from('company_blueprint_installations')
    .upsert(payload, { onConflict: 'company_id,blueprint_id' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function applyBlueprintToCompany({
  tenantId,
  companyId,
  blueprintKey = DEFAULT_BLUEPRINT_KEY,
  versionNumber = null,
  actorUserId = null,
  expectedCurrentVersion,
  companyOverrides,
} = {}) {
  const company = await assertCompanyBlueprintTarget(tenantId, companyId);
  const { blueprint, version } = await resolvePublishedBlueprint(blueprintKey, versionNumber);
  const installations = await getCompanyBlueprintInstallations({ tenantId, companyId });
  const current = installations.find((item) => String(item.blueprint_id) === String(blueprint.id)) || null;
  if (expectedCurrentVersion !== undefined) {
    const actualVersion = current?.version?.version_number ?? null;
    const expectedVersion = expectedCurrentVersion == null ? null : Number(expectedCurrentVersion);
    if (actualVersion !== expectedVersion) {
      const conflict = new Error('Blueprint công ty đã thay đổi sau lần xem trước. Hãy tải lại kế hoạch trước khi áp dụng.');
      conflict.code = 'BLUEPRINT_VERSION_CONFLICT';
      conflict.expected_version = expectedVersion;
      conflict.actual_version = actualVersion;
      throw conflict;
    }
  }

  const overrides = mergeCompanyBlueprintOverrides(current?.company_overrides, companyOverrides);
  const effectiveDefinition = resolveCompanyBlueprintDefinition(version.definition, overrides);
  const baseConfiguration = {
    schema_version: effectiveDefinition.schema_version,
    blueprint_key: blueprint.blueprint_key,
    version_number: version.version_number,
    effective_definition: effectiveDefinition,
    applied_modules: effectiveDefinition.modules.filter((item) => item.enabled !== false).map((item) => item.key),
    department_templates: effectiveDefinition.department_templates,
    process_keys: effectiveDefinition.processes.map((item) => item.key),
    transaction_data_copied: false,
  };

  await markCompanyInstallation({
    tenantId,
    companyId,
    blueprintId: blueprint.id,
    versionId: version.id,
    actorUserId,
    status: 'applying',
    configuration: baseConfiguration,
    companyOverrides: overrides,
  });

  try {
    const departmentResult = await ensureCompanyBlueprintDepartments(
      company,
      effectiveDefinition.department_templates,
    );
    const installation = await markCompanyInstallation({
      tenantId,
      companyId,
      blueprintId: blueprint.id,
      versionId: version.id,
      actorUserId,
      status: 'active',
      configuration: {
        ...baseConfiguration,
        materialized_department_ids: departmentResult.departments.map((item) => item.id),
        created_department_ids: departmentResult.created.map((item) => item.id),
      },
      companyOverrides: overrides,
    });
    invalidateTenantCache(tenantId);
    return {
      blueprint,
      version,
      company,
      installation,
      departments: departmentResult.departments,
      created_departments: departmentResult.created,
      transaction_data_copied: false,
    };
  } catch (error) {
    try {
      await markCompanyInstallation({
        tenantId,
        companyId,
        blueprintId: blueprint.id,
        versionId: version.id,
        actorUserId,
        status: 'failed',
        configuration: baseConfiguration,
        companyOverrides: overrides,
        errorMessage: error.message,
      });
    } catch (markError) {
      console.warn('[business-blueprint/company] Không ghi được trạng thái lỗi:', markError.message);
    }
    throw error;
  }
}

module.exports = {
  DEFAULT_BLUEPRINT_KEY,
  normalizeBlueprintDefinition,
  validateBlueprintDefinition,
  buildBlueprintChangePlan,
  normalizeCompanyBlueprintOverrides,
  mergeCompanyBlueprintOverrides,
  resolveCompanyBlueprintDefinition,
  isMissingBlueprintSchema,
  listPublishedBlueprints,
  listBlueprintCatalog,
  getBlueprintDetail,
  createBlueprint,
  createBlueprintVersion,
  publishBlueprintVersion,
  updateBlueprint,
  getTenantBlueprintInstallation,
  getCompanyBlueprintInstallations,
  previewBlueprintForTenant,
  previewBlueprintForCompany,
  applyBlueprintToTenant,
  applyBlueprintToCompany,
};
