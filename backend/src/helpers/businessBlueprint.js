const { supabase } = require('../config/supabase');
const {
  completeTenantFirstSetup,
  setupTenantDepartments,
} = require('./tenantSetup');
const { invalidateTenantCache } = require('./tenantScope');

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

function isMissingBlueprintSchema(error) {
  const message = text(error?.message).toLowerCase();
  return error?.code === '42P01'
    || error?.code === 'PGRST205'
    || message.includes('business_blueprints')
    || message.includes('tenant_blueprint_installations');
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

module.exports = {
  DEFAULT_BLUEPRINT_KEY,
  normalizeBlueprintDefinition,
  validateBlueprintDefinition,
  buildBlueprintChangePlan,
  isMissingBlueprintSchema,
  listPublishedBlueprints,
  listBlueprintCatalog,
  getBlueprintDetail,
  createBlueprint,
  createBlueprintVersion,
  publishBlueprintVersion,
  updateBlueprint,
  getTenantBlueprintInstallation,
  previewBlueprintForTenant,
  applyBlueprintToTenant,
};
