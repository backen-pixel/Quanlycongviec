/**
 * Clone dữ liệu NextGo sang hệ sinh thái riêng — KHÔNG chuyển nhân viên.
 *
 * - Tạo tenant slug=nextgo + công ty mới + cây org
 * - Copy config CRM/SX + khách hàng + deal/lead + dự án + task
 * - User clone chỉ là bản ghi alias (email +ngclone) để giữ FK; is_active=false
 * - KHÔNG đụng company/user cũ, KHÔNG swap email, KHÔNG retarget Facebook
 *
 * Usage:
 *   node scripts/clone-nextgo-to-tenant.js --dry-run
 *   node scripts/clone-nextgo-to-tenant.js
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const SOURCE_COMPANY_ID = '87479a83-1145-43b7-b090-3e40812cb5a9';
const TENANT_SLUG = 'nextgo';
const TENANT_NAME = 'NextGo';
const EMAIL_ALIAS_TAG = '+ngclone';
const MAP_FILE = path.join(__dirname, '..', 'uploads', '_nextgo_clone_id_map.json');
const DRY = process.argv.includes('--dry-run');

const FEATURES = [
  'crm', 'tasks', 'projects', 'production', 'logistics', 'customers',
  'ai_assistant', 'drive', 'accounting', 'api_access', 'tinhtoan', 'purchasing',
];

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const maps = {
  company: new Map(),
  user: new Map(),
  dept: new Map(),
  region: new Map(),
  sourceCat: new Map(),
  source: new Map(),
  leadType: new Map(),
  pipeline: new Map(),
  crmStage: new Map(),
  sxStage: new Map(),
  vcStage: new Map(),
  workshopType: new Map(),
  workshopTeam: new Map(),
  sxTemplate: new Map(),
  crmTemplate: new Map(),
  customer: new Map(),
  lead: new Map(),
  project: new Map(),
  unit: new Map(),
};

function nid() {
  return crypto.randomUUID();
}

function aliasEmail(email) {
  const s = String(email || '').trim();
  const at = s.lastIndexOf('@');
  if (at < 1) return `clone.${s || nid()}@nextgo.invalid`;
  return `${s.slice(0, at)}${EMAIL_ALIAS_TAG}${s.slice(at)}`.toLowerCase();
}

function remap(id, map) {
  if (id == null || id === '') return null;
  const key = String(id);
  return map.has(key) ? map.get(key) : null;
}

function remapKeep(id, map) {
  if (id == null || id === '') return null;
  const key = String(id);
  return map.has(key) ? map.get(key) : key;
}

function remapArr(arr, map, { dropUnmapped = false } = {}) {
  if (!Array.isArray(arr)) return arr == null ? arr : [];
  const out = [];
  for (const v of arr) {
    if (v == null) continue;
    const key = String(v);
    if (map.has(key)) out.push(map.get(key));
    else if (!dropUnmapped) out.push(key);
  }
  return out;
}

function strip(row, extra = []) {
  const skip = new Set(['id', 'weighted_value', 'info_complete', ...extra]);
  const out = {};
  for (const [k, v] of Object.entries(row || {})) {
    if (!skip.has(k)) out[k] = v;
  }
  return out;
}

async function fetchAll(table, apply, attempt = 0) {
  const page = 1000;
  let from = 0;
  const out = [];
  try {
    for (;;) {
      let q = sb.from(table).select('*');
      if (apply) q = apply(q);
      const { data, error } = await q.range(from, from + page - 1);
      if (error) throw new Error(`${table} select: ${error.message}`);
      out.push(...(data || []));
      if (!data || data.length < page) break;
      from += page;
    }
    return out;
  } catch (e) {
    if (attempt < 3 && /fetch failed|network|ECONNRESET|ETIMEDOUT/i.test(String(e.message))) {
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      return fetchAll(table, apply, attempt + 1);
    }
    throw e;
  }
}

async function insertRows(table, rows, chunk = 80) {
  if (DRY || !rows.length) return;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const { error } = await sb.from(table).insert(slice);
    if (error) throw new Error(`${table} insert [${i}]: ${error.message}`);
    process.stdout.write(`  ${table} ${Math.min(i + slice.length, rows.length)}/${rows.length}\r`);
  }
  console.log(`  ${table} ${rows.length}/${rows.length} ok`);
}

function saveMap() {
  if (DRY) return;
  const obj = { tenantId: STATE.tenantId, companyId: STATE.newCompanyId, maps: {} };
  for (const [k, m] of Object.entries(maps)) {
    obj.maps[k] = [...m.entries()];
  }
  fs.mkdirSync(path.dirname(MAP_FILE), { recursive: true });
  fs.writeFileSync(MAP_FILE, JSON.stringify(obj, null, 2));
}

function loadMap() {
  if (DRY) return;
  if (!fs.existsSync(MAP_FILE)) return;
  try {
    const obj = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
    STATE.tenantId = obj.tenantId || STATE.tenantId;
    STATE.newCompanyId = obj.companyId || STATE.newCompanyId;
    for (const [k, entries] of Object.entries(obj.maps || {})) {
      if (!maps[k]) maps[k] = new Map();
      for (const [oldId, newId] of entries) maps[k].set(oldId, newId);
    }
    console.log('Đã nạp map clone từ', MAP_FILE);
  } catch (e) {
    console.warn('Không đọc được map file:', e.message);
  }
}

const STATE = {
  tenantId: null,
  newCompanyId: null,
  rootUnitId: null,
  kdId: null,
  sxId: null,
  vcId: null,
  fallbackCustomerId: null,
};

async function mustOne(table, apply, label) {
  const rows = await fetchAll(table, apply);
  if (!rows.length) throw new Error(`Không thấy ${label}`);
  return rows[0];
}

async function ensureTenant() {
  const { data: existing, error } = await sb.from('tenants').select('*').eq('slug', TENANT_SLUG).maybeSingle();
  if (error) throw error;
  if (existing) {
    STATE.tenantId = existing.id;
    console.log('Tenant đã có:', existing.id, existing.name);
    return existing;
  }
  const payload = {
    id: nid(),
    name: TENANT_NAME,
    slug: TENANT_SLUG,
    tier: 'enterprise',
    max_users: 200,
    max_companies: 10,
    is_active: true,
    settings: { clone_from_company_id: SOURCE_COMPANY_ID, clone_mode: 'data-only' },
  };
  console.log('Tạo tenant', payload.id);
  if (!DRY) {
    const { data, error: insErr } = await sb.from('tenants').insert(payload).select('*').single();
    if (insErr) throw insErr;
    STATE.tenantId = data.id;
  } else {
    STATE.tenantId = payload.id;
  }
  const feats = FEATURES.map((feature_key) => ({
    tenant_id: STATE.tenantId,
    feature_key,
    enabled: true,
    config: {},
  }));
  await insertRows('tenant_features', feats, 20);
  return payload;
}

async function levels() {
  const rows = await fetchAll('ecosystem_levels');
  const bySlug = {};
  rows.forEach((l) => { bySlug[l.slug] = l.id; });
  if (!bySlug.group || !bySlug.division || !bySlug.subsidiary) {
    throw new Error('Thiếu ecosystem_levels group/division/subsidiary');
  }
  return bySlug;
}

async function ensureOrg(level) {
  const existing = await fetchAll('ecosystem_units', (q) => q.eq('tenant_id', STATE.tenantId));
  const root = existing.find((u) => !u.parent_id && u.level_id === level.group);
  const findDiv = (name) => existing.find((u) => u.parent_id && (root ? u.parent_id === root.id : true) && u.name === name);

  if (root) {
    STATE.rootUnitId = root.id;
    const kd = findDiv('Khối Kinh Doanh') || existing.find((u) => u.name === 'Khối Kinh Doanh');
    const sx = findDiv('Khối Sản Xuất') || existing.find((u) => u.name === 'Khối Sản Xuất');
    const vc = findDiv('Khối Vận Chuyển') || existing.find((u) => u.name === 'Khối Vận Chuyển');
    STATE.kdId = kd?.id;
    STATE.sxId = sx?.id;
    STATE.vcId = vc?.id;
    console.log('Org đã có: root/kd/sx/vc', STATE.rootUnitId, STATE.kdId, STATE.sxId, STATE.vcId);
    return;
  }

  STATE.rootUnitId = nid();
  STATE.kdId = nid();
  STATE.sxId = nid();
  STATE.vcId = nid();
  const units = [
    { id: STATE.rootUnitId, name: 'NextGo', short_name: 'NextGo', level_id: level.group, parent_id: null, tenant_id: STATE.tenantId, is_active: true, order_index: 0 },
    { id: STATE.kdId, name: 'Khối Kinh Doanh', short_name: 'KD', level_id: level.division, parent_id: STATE.rootUnitId, tenant_id: STATE.tenantId, is_active: true, order_index: 1 },
    { id: STATE.sxId, name: 'Khối Sản Xuất', short_name: 'SX', level_id: level.division, parent_id: STATE.rootUnitId, tenant_id: STATE.tenantId, is_active: true, order_index: 2 },
    { id: STATE.vcId, name: 'Khối Vận Chuyển', short_name: 'VC', level_id: level.division, parent_id: STATE.rootUnitId, tenant_id: STATE.tenantId, is_active: true, order_index: 3 },
  ];
  await insertRows('ecosystem_units', units, 10);
}

async function ensureCompany(src, level) {
  const existing = await fetchAll('companies', (q) => q.eq('tenant_id', STATE.tenantId));
  const hit = existing.find((c) => c.name === src.name) || existing[0];
  if (hit) {
    STATE.newCompanyId = hit.id;
    maps.company.set(SOURCE_COMPANY_ID, hit.id);
    console.log('Company clone đã có:', hit.id, hit.name);
    return hit;
  }
  const id = nid();
  STATE.newCompanyId = id;
  maps.company.set(SOURCE_COMPANY_ID, id);
  const row = {
    id,
    name: src.name,
    short_name: src.short_name || 'NextGo',
    tax_code: src.tax_code,
    address: src.address,
    phone: src.phone,
    email: src.email,
    logo_url: src.logo_url,
    is_active: true,
    division_unit_id: STATE.kdId,
    tenant_id: STATE.tenantId,
  };
  await insertRows('companies', [row], 1);

  const subKd = nid();
  const subSx = nid();
  const subVc = nid();
  maps.unit.set('sub-kd', subKd);
  maps.unit.set('sub-sx', subSx);
  maps.unit.set('sub-vc', subVc);
  await insertRows('ecosystem_units', [
    { id: subKd, name: src.name, short_name: src.short_name, level_id: level.subsidiary, parent_id: STATE.kdId, company_id: id, tenant_id: STATE.tenantId, is_active: true, order_index: 0 },
    { id: subSx, name: src.name, short_name: src.short_name, level_id: level.subsidiary, parent_id: STATE.sxId, company_id: id, tenant_id: STATE.tenantId, is_active: true, order_index: 0 },
    { id: subVc, name: src.name, short_name: src.short_name, level_id: level.subsidiary, parent_id: STATE.vcId, company_id: id, tenant_id: STATE.tenantId, is_active: true, order_index: 0 },
  ], 10);

  await insertRows('company_division_units', [
    { company_id: id, division_unit_id: STATE.kdId, is_primary: true },
    { company_id: id, division_unit_id: STATE.sxId, is_primary: false },
    { company_id: id, division_unit_id: STATE.vcId, is_primary: false },
  ], 10);

  const scopes = [
    { module_key: 'crm', division_unit_id: STATE.kdId },
    { module_key: 'production', division_unit_id: STATE.sxId },
    { module_key: 'logistics', division_unit_id: STATE.vcId },
    { module_key: 'projects', division_unit_id: STATE.kdId },
    { module_key: 'projects', division_unit_id: STATE.sxId },
    { module_key: 'projects', division_unit_id: STATE.vcId },
    { module_key: 'tasks', division_unit_id: STATE.kdId },
    { module_key: 'tasks', division_unit_id: STATE.sxId },
    { module_key: 'tasks', division_unit_id: STATE.vcId },
  ];
  await insertRows('ecosystem_module_scopes', scopes, 20);
  await insertRows('crm_company_visible_production_companies', [
    { crm_company_id: id, production_company_id: id },
  ], 1);
}

async function destCount(table, col = 'company_id') {
  if (DRY || !STATE.newCompanyId) return 0;
  const { count, error } = await sb.from(table).select('id', { count: 'exact', head: true }).eq(col, STATE.newCompanyId);
  if (error) return 0;
  return count || 0;
}

async function destCountByIds(table, col, ids) {
  if (DRY || !ids.length) return 0;
  const { count, error } = await sb.from(table).select('id', { count: 'exact', head: true }).in(col, ids.slice(0, 80));
  if (error) return 0;
  return count || 0;
}

async function cloneSimple(table, mapKey, remapRow, { apply, skipIf } = {}) {
  if (await destCount(table) > 0 && maps[mapKey] && maps[mapKey].size) {
    console.log(`- ${table}: dest đã có, skip insert`);
    return [];
  }
  const src = await fetchAll(table, apply || ((q) => q.eq('company_id', SOURCE_COMPANY_ID)));
  if (skipIf && skipIf(src)) {
    console.log(`- ${table}: skip`);
    return [];
  }
  if (maps[mapKey] && maps[mapKey].size && maps[mapKey].size >= src.length) {
    console.log(`- ${table}: đã map ${maps[mapKey].size}, skip insert`);
    return src;
  }
  const rows = [];
  for (const r of src) {
    const id = nid();
    if (mapKey) maps[mapKey].set(r.id, id);
    rows.push({ ...remapRow(r), id });
  }
  console.log(`- ${table}: ${src.length} → clone`);
  await insertRows(table, rows);
  return src;
}

function remapCompanyFks(row) {
  const o = strip(row);
  if ('company_id' in o) o.company_id = STATE.newCompanyId;
  if ('executor_company_id' in o) o.executor_company_id = remap(row.executor_company_id, maps.company) || (row.executor_company_id === SOURCE_COMPANY_ID ? STATE.newCompanyId : row.executor_company_id);
  if ('sx_template_company_id' in o) o.sx_template_company_id = remap(row.sx_template_company_id, maps.company);
  if ('logistics_company_id' in o) o.logistics_company_id = remap(row.logistics_company_id, maps.company);
  if ('default_production_company_id' in o) o.default_production_company_id = remap(row.default_production_company_id, maps.company) || STATE.newCompanyId;
  if ('production_company_id' in o) o.production_company_id = remap(row.production_company_id, maps.company) || STATE.newCompanyId;
  if ('external_company_id' in o) o.external_company_id = remap(row.external_company_id, maps.company);
  if ('division_unit_id' in o && o.division_unit_id) {
    o.division_unit_id = remapKeep(row.division_unit_id, maps.unit);
    if (String(row.division_unit_id) === String(row.division_unit_id) && maps.unit.has('div-kd') === false) {
      /* filled after org map */
    }
  }
  return o;
}

async function mapOldDivisions() {
  const srcCo = await mustOne('companies', (q) => q.eq('id', SOURCE_COMPANY_ID), 'công ty NextGo nguồn');
  if (srcCo.division_unit_id) maps.unit.set(srcCo.division_unit_id, STATE.kdId);
  const links = await fetchAll('company_division_units', (q) => q.eq('company_id', SOURCE_COMPANY_ID));
  for (const l of links) {
    const nameRows = await fetchAll('ecosystem_units', (q) => q.eq('id', l.division_unit_id));
    const n = (nameRows[0]?.name || '').toLowerCase();
    if (n.includes('kinh doanh')) maps.unit.set(l.division_unit_id, STATE.kdId);
    else if (n.includes('sản xuất') || n.includes('san xuat')) maps.unit.set(l.division_unit_id, STATE.sxId);
    else if (n.includes('vận') || n.includes('lắp') || n.includes('van chuyen')) maps.unit.set(l.division_unit_id, STATE.vcId);
  }
  const srcUnits = await fetchAll('ecosystem_units', (q) => q.eq('company_id', SOURCE_COMPANY_ID));
  for (const u of srcUnits) {
    const parent = u.parent_id && maps.unit.get(u.parent_id);
    if (parent === STATE.kdId) maps.unit.set(u.id, maps.unit.get('sub-kd') || u.id);
    else if (parent === STATE.sxId) maps.unit.set(u.id, maps.unit.get('sub-sx') || u.id);
    else if (parent === STATE.vcId) maps.unit.set(u.id, maps.unit.get('sub-vc') || u.id);
  }
}

async function cloneDepartments() {
  const src = await fetchAll('departments', (q) => q.eq('company_id', SOURCE_COMPANY_ID));
  if ((maps.dept.size >= src.length && src.length) || (await destCount('departments')) > 0) {
    console.log('- departments: skip');
    return;
  }
  const rows = src.map((r) => {
    const id = nid();
    maps.dept.set(r.id, id);
    const o = strip(r, ['manager_id']);
    o.id = id;
    o.company_id = STATE.newCompanyId;
    o.slug = `${String(r.slug || 'dept').slice(0, 70)}-ngc`;
    o.division_unit_id = remap(r.division_unit_id, maps.unit);
    o.parent_id = null;
    o.manager_id = null;
    return o;
  });
  console.log(`- departments: ${src.length}`);
  await insertRows('departments', rows);
  const parents = [];
  for (const r of src) {
    if (!r.parent_id || !maps.dept.has(r.parent_id)) continue;
    parents.push({ id: maps.dept.get(r.id), parent_id: maps.dept.get(r.parent_id) });
  }
  if (!DRY) {
    for (const p of parents) {
      const { error } = await sb.from('departments').update({ parent_id: p.parent_id }).eq('id', p.id);
      if (error) throw new Error(`departments parent: ${error.message}`);
    }
  }
}

async function cloneUsers() {
  const src = await fetchAll('users', (q) => q.eq('company_id', SOURCE_COMPANY_ID));
  if ((maps.user.size >= src.length && src.length) || (await destCount('users')) > 0) {
    console.log('- users alias: skip');
    return src;
  }
  const rows = src.map((r) => {
    const id = nid();
    maps.user.set(r.id, id);
    return {
      id,
      email: aliasEmail(r.email),
      password: r.password,
      full_name: r.full_name,
      phone: r.phone,
      avatar: r.avatar,
      role: r.role,
      department_id: remap(r.department_id, maps.dept),
      is_active: false,
      position: r.position,
      date_of_birth: r.date_of_birth,
      hire_date: r.hire_date,
      address: r.address,
      emergency_contact: r.emergency_contact,
      salary: r.salary,
      notes: `[clone-data NextGo] ${r.notes || ''}`.trim(),
      skills: r.skills,
      team_id: null,
      primary_division_id: remap(r.primary_division_id, maps.unit),
      company_id: STATE.newCompanyId,
      cover_url: r.cover_url,
      bio: r.bio,
      is_bot: r.is_bot,
      drive_module: r.drive_module,
      tenant_id: STATE.tenantId,
      google_id: null,
      auth_provider: 'local',
      zalo_id: null,
    };
  });
  console.log(`- users alias (inactive): ${src.length}`);
  rows.forEach((u) => console.log('   ', u.email, '←', [...maps.user.entries()].find((e) => e[1] === u.id)?.[0]));
  await insertRows('users', rows, 20);

  const ucSrc = await fetchAll('user_companies', (q) => q.eq('company_id', SOURCE_COMPANY_ID));
  const ucRows = [];
  const seen = new Set();
  for (const r of ucSrc) {
    const uid = remap(r.user_id, maps.user);
    if (!uid) continue;
    seen.add(uid);
    ucRows.push({ user_id: uid, company_id: STATE.newCompanyId, is_primary: r.is_primary !== false });
  }
  for (const r of src) {
    const uid = maps.user.get(r.id);
    if (uid && !seen.has(uid)) {
      ucRows.push({ user_id: uid, company_id: STATE.newCompanyId, is_primary: true });
    }
  }
  await insertRows('user_companies', ucRows, 40);

  const srcUserIds = [...maps.user.keys()];
  const roles = [];
  for (let i = 0; i < srcUserIds.length; i += 200) {
    const part = await fetchAll('user_roles', (q) => q.in('user_id', srcUserIds.slice(i, i + 200)));
    roles.push(...part);
  }
  const roleRows = [];
  for (const r of roles) {
    if (!maps.user.has(r.user_id)) continue;
    roleRows.push({
      id: nid(),
      user_id: maps.user.get(r.user_id),
      role_id: r.role_id,
      ecosystem_unit_id: remap(r.ecosystem_unit_id, maps.unit),
      granted_by: remap(r.granted_by, maps.user),
    });
  }
  if (roleRows.length) await insertRows('user_roles', roleRows, 40);

  const depts = await fetchAll('departments', (q) => q.eq('company_id', SOURCE_COMPANY_ID));
  if (!DRY) {
    for (const d of depts) {
      if (!d.manager_id || !maps.dept.has(d.id)) continue;
      const mid = remap(d.manager_id, maps.user);
      if (!mid) continue;
      const { error } = await sb.from('departments').update({ manager_id: mid }).eq('id', maps.dept.get(d.id));
      if (error) throw new Error(`dept manager: ${error.message}`);
    }
  }
  return src;
}

function person(row, field) {
  return remap(row[field], maps.user);
}

async function cloneConfig() {
  await cloneSimple('company_regions', 'region', (r) => {
    const o = remapCompanyFks(r);
    o.division_unit_id = remap(r.division_unit_id, maps.unit);
    return o;
  });

  await cloneSimple('crm_source_categories', 'sourceCat', (r) => remapCompanyFks(r));
  await cloneSimple('crm_sources', 'source', (r) => {
    const o = remapCompanyFks(r);
    o.category_id = remap(r.category_id, maps.sourceCat);
    return o;
  });

  await cloneSimple('workshop_project_types', 'workshopType', (r) => remapCompanyFks(r));

  await cloneSimple('crm_lead_types', 'leadType', (r) => {
    const o = remapCompanyFks(r);
    o.default_workshop_type_id = remap(r.default_workshop_type_id, maps.workshopType);
    o.default_production_company_id = STATE.newCompanyId;
    if (Array.isArray(o.workshop_production_templates)) {
      o.workshop_production_templates = o.workshop_production_templates;
    }
    return o;
  });

  await cloneSimple('crm_pipelines', 'pipeline', (r) => {
    const o = remapCompanyFks(r);
    o.region_id = remap(r.region_id, maps.region);
    return o;
  });

  const srcPipelines = [...maps.pipeline.keys()];
  const allStages = srcPipelines.length
    ? await fetchAll('crm_pipeline_stages', (q) => q.in('pipeline_id', srcPipelines))
    : [];
  if (maps.crmStage.size < allStages.length) {
    const rows = allStages.map((r) => {
      const id = nid();
      maps.crmStage.set(r.id, id);
      const o = strip(r);
      o.id = id;
      o.pipeline_id = remap(r.pipeline_id, maps.pipeline);
      o.default_assignee_user_id = person(r, 'default_assignee_user_id');
      return o;
    });
    console.log(`- crm_pipeline_stages: ${rows.length}`);
    await insertRows('crm_pipeline_stages', rows);
  } else {
    console.log('- crm_pipeline_stages: skip');
  }

  await cloneSimple('production_pipeline_stages', 'sxStage', (r) => {
    const o = remapCompanyFks(r);
    o.workshop_type_id = remap(r.workshop_type_id, maps.workshopType);
    o.target_workshop_type_id = remap(r.target_workshop_type_id, maps.workshopType);
    o.crm_target_stage_id = remap(r.crm_target_stage_id, maps.crmStage);
    return o;
  });

  await cloneSimple('logistics_pipeline_stages', 'vcStage', (r) => {
    const o = remapCompanyFks(r);
    o.crm_target_stage_id = remap(r.crm_target_stage_id, maps.crmStage);
    return o;
  });

  await cloneSimple('workshop_teams', 'workshopTeam', (r) => remapCompanyFks(r));

  await cloneSimple('workshop_task_templates', 'sxTemplate', (r) => {
    const o = remapCompanyFks(r);
    o.workshop_type_id = remap(r.workshop_type_id, maps.workshopType);
    o.production_stage_id = remap(r.production_stage_id, maps.sxStage);
    o.logistics_stage_id = remap(r.logistics_stage_id, maps.vcStage);
    return o;
  });

  const destTplIds = [...maps.sxTemplate.values()];
  const destHasSxItems = destTplIds.length
    ? (await destCountByIds('workshop_task_template_items', 'template_id', destTplIds)) > 0
    : false;
  if (destHasSxItems) {
    console.log('- workshop_task_template_items: dest đã có, skip');
  } else {
    const sxItemsSrc = maps.sxTemplate.size
      ? await fetchAll('workshop_task_template_items', (q) => q.in('template_id', [...maps.sxTemplate.keys()]))
      : [];
    const sxItems = sxItemsSrc.map((r) => {
      const o = strip(r);
      o.id = nid();
      o.template_id = remap(r.template_id, maps.sxTemplate);
      o.executor_company_id = remap(r.executor_company_id, maps.company) || STATE.newCompanyId;
      o.default_assignee_id = person(r, 'default_assignee_id');
      o.default_assignee_ids = remapArr(r.default_assignee_ids, maps.user, { dropUnmapped: true });
      o.default_allowed_companies = remapArr(r.default_allowed_companies, maps.company, { dropUnmapped: true });
      if (!o.default_allowed_companies?.length) o.default_allowed_companies = [STATE.newCompanyId];
      o.default_allowed_departments = remapArr(r.default_allowed_departments, maps.dept, { dropUnmapped: true });
      return o;
    });
    if (sxItems.length) {
      console.log(`- workshop_task_template_items: ${sxItems.length}`);
      await insertRows('workshop_task_template_items', sxItems);
    }
  }

  const destCrmTpl = maps.crmStage.size
    ? await destCountByIds('crm_task_templates', 'pipeline_stage_id', [...maps.crmStage.values()])
    : 0;
  if (destCrmTpl > 0) {
    console.log('- crm_task_templates: dest đã có, skip');
  } else {
    const crmTplSrc = maps.crmStage.size
      ? await fetchAll('crm_task_templates', (q) => q.in('pipeline_stage_id', [...maps.crmStage.keys()]))
      : [];
    const crmTplRows = crmTplSrc.map((r) => {
      const id = nid();
      maps.crmTemplate.set(r.id, id);
      const o = strip(r);
      o.id = id;
      o.pipeline_stage_id = remap(r.pipeline_stage_id, maps.crmStage);
      return o;
    });
    if (crmTplRows.length) {
      console.log(`- crm_task_templates: ${crmTplRows.length}`);
      await insertRows('crm_task_templates', crmTplRows);
    }
    const crmItemsSrc = maps.crmTemplate.size
      ? await fetchAll('crm_task_template_items', (q) => q.in('template_id', [...maps.crmTemplate.keys()]))
      : [];
    const crmItems = crmItemsSrc.map((r) => {
      const o = strip(r);
      o.id = nid();
      o.template_id = remap(r.template_id, maps.crmTemplate);
      o.executor_company_id = remap(r.executor_company_id, maps.company) || STATE.newCompanyId;
      o.default_assignee_id = person(r, 'default_assignee_id');
      o.default_assignee_ids = remapArr(r.default_assignee_ids, maps.user, { dropUnmapped: true });
      o.default_allowed_companies = remapArr(r.default_allowed_companies, maps.company, { dropUnmapped: true });
      o.default_allowed_departments = remapArr(r.default_allowed_departments, maps.dept, { dropUnmapped: true });
      return o;
    });
    if (crmItems.length) {
      console.log(`- crm_task_template_items: ${crmItems.length}`);
      await insertRows('crm_task_template_items', crmItems);
    }
  }

  if (await destCount('crm_lead_type_production_links', 'production_company_id') > 0) {
    console.log('- crm_lead_type_production_links: dest đã có, skip');
  } else {
    const links = await fetchAll('crm_lead_type_production_links', (q) => q.eq('production_company_id', SOURCE_COMPANY_ID));
    const linkRows = links.map((r) => ({
      id: nid(),
      lead_type_id: remap(r.lead_type_id, maps.leadType) || r.lead_type_id,
      production_company_id: STATE.newCompanyId,
      workshop_type_id: remap(r.workshop_type_id, maps.workshopType),
      is_primary: r.is_primary,
      order_index: r.order_index,
    })).filter((r) => r.lead_type_id && r.workshop_type_id);
    if (linkRows.length) {
      console.log(`- crm_lead_type_production_links: ${linkRows.length}`);
      await insertRows('crm_lead_type_production_links', linkRows);
    }
  }

  for (const opt of ['crm_company_deadline_config', 'sx_company_schedule_config', 'crm_referrers', 'crm_payment_stages']) {
    try {
      if (await destCount(opt) > 0) {
        console.log(`- ${opt}: dest đã có, skip`);
        continue;
      }
      const src = await fetchAll(opt, (q) => q.eq('company_id', SOURCE_COMPANY_ID));
      if (!src.length) continue;
      const rows = src.map((r) => {
        const o = remapCompanyFks(r);
        o.id = nid();
        return o;
      });
      console.log(`- ${opt}: ${rows.length}`);
      await insertRows(opt, rows);
    } catch (e) {
      console.warn(`  skip ${opt}:`, e.message);
    }
  }
}

async function alreadyClonedOps() {
  if (!STATE.newCompanyId || DRY) return false;
  const destLeads = await destCount('crm_leads');
  const destProj = await destCount('projects');
  const srcLeads = (await sb.from('crm_leads').select('id', { count: 'exact', head: true }).eq('company_id', SOURCE_COMPANY_ID)).count || 0;
  const srcProj = (await sb.from('projects').select('id', { count: 'exact', head: true }).eq('company_id', SOURCE_COMPANY_ID)).count || 0;
  return destLeads >= srcLeads && destProj >= srcProj && srcLeads > 0 && srcProj > 0;
}

async function cloneCustomers() {
  await cloneSimple('customers', 'customer', (r) => {
    const o = remapCompanyFks(r);
    o.assigned_to = person(r, 'assigned_to');
    return o;
  }, { skipIf: () => maps.customer.size > 0 && maps.customer.size >= 1 && false });
}

async function ensureFallbackCustomer() {
  if (STATE.fallbackCustomerId) return STATE.fallbackCustomerId;
  const existing = await fetchAll('customers', (q) => q.eq('company_id', STATE.newCompanyId).eq('full_name', '[Clone] Khách thiếu map'));
  if (existing[0]) {
    STATE.fallbackCustomerId = existing[0].id;
    return STATE.fallbackCustomerId;
  }
  const id = nid();
  await insertRows('customers', [{
    id,
    full_name: '[Clone] Khách thiếu map',
    phone: '0000000000',
    company_id: STATE.newCompanyId,
    notes: 'placeholder FK project clone',
  }], 1);
  STATE.fallbackCustomerId = id;
  return id;
}

async function cloneLeadsAndProjects() {
  const destLeadN = await destCount('crm_leads');
  const destProjN = await destCount('projects');
  const leads = await fetchAll('crm_leads', (q) => q.eq('company_id', SOURCE_COMPANY_ID));
  if (destLeadN > 0 && destLeadN < leads.length && destProjN === 0) {
    console.log(`- xóa ${destLeadN} crm_leads dở trên company clone rồi clone lại`);
    if (!DRY) {
      const { error } = await sb.from('crm_leads').delete().eq('company_id', STATE.newCompanyId);
      if (error) throw new Error(`xóa leads dở: ${error.message}`);
    }
    maps.lead.clear();
  }

  if (destLeadN >= leads.length && maps.lead.size >= leads.length) {
    console.log(`- crm_leads: dest đã đủ ${destLeadN}, skip insert`);
  } else if (destLeadN >= leads.length) {
    const destLeads = await fetchAll('crm_leads', (q) => q.eq('company_id', STATE.newCompanyId));
    const destByCode = new Map();
    for (const d of destLeads) destByCode.set(`${d.type}|${d.code}`, d.id);
    for (const r of leads) {
      const code = r.type === 'lead' && r.code ? `${String(r.code).slice(0, 40)}-NGC` : r.code;
      const hit = destByCode.get(`${r.type}|${code}`);
      if (hit) maps.lead.set(r.id, hit);
    }
    console.log(`- crm_leads: rebuild map ${maps.lead.size}/${leads.length}`);
  } else {
  const leadRows = [];
  for (const r of leads) {
    const id = nid();
    maps.lead.set(r.id, id);
    const o = strip(r, ['project_id']);
    o.id = id;
    o.company_id = STATE.newCompanyId;
    o.customer_id = remap(r.customer_id, maps.customer);
    o.stage_id = remap(r.stage_id, maps.crmStage);
    o.source_id = remap(r.source_id, maps.source);
    o.assigned_to = person(r, 'assigned_to');
    o.lead_owner_id = person(r, 'lead_owner_id');
    o.created_by = person(r, 'created_by');
    o.sx_pipeline_stage_id = remap(r.sx_pipeline_stage_id, maps.sxStage);
    o.vc_pipeline_stage_id = remap(r.vc_pipeline_stage_id, maps.vcStage);
    o.pipeline_id = remap(r.pipeline_id, maps.pipeline);
    o.lead_type_id = remap(r.lead_type_id, maps.leadType);
    o.parent_lead_id = null;
    o.region_id = remap(r.region_id, maps.region);
    o.sx_template_company_id = remap(r.sx_template_company_id, maps.company);
    o.sx_handover_confirmed_by = person(r, 'sx_handover_confirmed_by');
    o.deadline_disabled_by = person(r, 'deadline_disabled_by');
    o.external_company_id = remap(r.external_company_id, maps.company);
    o.source_customer_deal_id = null;
    o.project_id = null;
    if (r.type === 'lead' && r.code) o.code = `${String(r.code).slice(0, 40)}-NGC`;
    leadRows.push(o);
  }
  console.log(`- crm_leads (phase1, project_id null): ${leadRows.length}`);
  await insertRows('crm_leads', leadRows, 60);
  }

  const parentUpdates = [];
  for (const r of leads) {
    if (r.parent_lead_id && maps.lead.has(r.parent_lead_id) && maps.lead.has(r.id)) {
      parentUpdates.push({ id: maps.lead.get(r.id), parent_lead_id: maps.lead.get(r.parent_lead_id) });
    }
    if (r.source_customer_deal_id && maps.lead.has(r.source_customer_deal_id) && maps.lead.has(r.id)) {
      parentUpdates.push({ id: maps.lead.get(r.id), source_customer_deal_id: maps.lead.get(r.source_customer_deal_id) });
    }
  }

  const fallbackCustomerId = await ensureFallbackCustomer();
  const projects = await fetchAll('projects', (q) => q.eq('company_id', SOURCE_COMPANY_ID));
  if (destProjN >= projects.length && projects.length && maps.project.size >= projects.length) {
    console.log(`- projects: dest đã đủ, skip insert`);
  } else {
  const projRows = projects.map((r) => {
    const id = nid();
    maps.project.set(r.id, id);
    const o = remapCompanyFks(r);
    o.id = id;
    o.code = `${String(r.code || 'P').slice(0, 40)}-NGC`;
    o.customer_id = remap(r.customer_id, maps.customer) || fallbackCustomerId;
    o.current_stage_id = remap(r.current_stage_id, maps.sxStage) || remap(r.current_stage_id, maps.crmStage);
    o.sales_person_id = person(r, 'sales_person_id');
    o.designer_id = person(r, 'designer_id');
    o.project_manager_id = person(r, 'project_manager_id');
    o.consulting_person_id = person(r, 'consulting_person_id');
    o.design_person_id = person(r, 'design_person_id');
    o.quotation_person_id = person(r, 'quotation_person_id');
    o.contract_person_id = person(r, 'contract_person_id');
    o.production_person_id = person(r, 'production_person_id');
    o.shipping_person_id = person(r, 'shipping_person_id');
    o.installation_person_id = person(r, 'installation_person_id');
    o.care_person_id = person(r, 'care_person_id');
    o.created_by = person(r, 'created_by');
    o.supervisor_id = person(r, 'supervisor_id');
    o.installer_person_id = person(r, 'installer_person_id');
    o.logistics_person_id = person(r, 'logistics_person_id');
    o.delivery_team_id = remap(r.delivery_team_id, maps.workshopTeam);
    o.installation_team_id = remap(r.installation_team_id, maps.workshopTeam);
    o.production_workshop_team_id = remap(r.production_workshop_team_id, maps.workshopTeam);
    o.workshop_type_id = remap(r.workshop_type_id, maps.workshopType);
    o.sx_kanban_column_id = remap(r.sx_kanban_column_id, maps.sxStage);
    o.vc_kanban_column_id = remap(r.vc_kanban_column_id, maps.vcStage);
    o.vc_deleted_by = person(r, 'vc_deleted_by');
    o.logistics_company_id = remap(r.logistics_company_id, maps.company);
    o.flow_id = null;
    return o;
  });
  console.log(`- projects: ${projRows.length}`);
  await insertRows('projects', projRows, 40);
  }

  if (!DRY) {
    const leadProj = [];
    for (const r of leads) {
      if (!r.project_id || !maps.lead.has(r.id) || !maps.project.has(r.project_id)) continue;
      leadProj.push({ id: maps.lead.get(r.id), project_id: maps.project.get(r.project_id) });
    }
    for (const u of leadProj) {
      const { error } = await sb.from('crm_leads').update({ project_id: u.project_id }).eq('id', u.id);
      if (error) throw new Error(`lead.project_id: ${error.message}`);
    }
    console.log(`- crm_leads project_id gắn lại: ${leadProj.length}`);
    for (const u of parentUpdates) {
      const patch = {};
      if (u.parent_lead_id) patch.parent_lead_id = u.parent_lead_id;
      if (u.source_customer_deal_id) patch.source_customer_deal_id = u.source_customer_deal_id;
      if (!Object.keys(patch).length) continue;
      const { error } = await sb.from('crm_leads').update(patch).eq('id', u.id);
      if (error) throw new Error(`lead parent: ${error.message}`);
    }
  }
}

async function cloneMembersAndTasks() {
  if (!maps.lead.size) {
    console.log('- skip members/tasks: chưa có lead map');
    return;
  }
  const destTaskN = await destCountByIds('crm_tasks', 'lead_id', [...maps.lead.values()]);
  if (destTaskN > 100) {
    console.log(`- crm_tasks dest đã có ~${destTaskN}, skip members/tasks`);
    return;
  }
  const srcLeadIds = [...maps.lead.keys()];
  const members = [];
  for (let i = 0; i < srcLeadIds.length; i += 80) {
    const part = await fetchAll('lead_members', (q) => q.in('lead_id', srcLeadIds.slice(i, i + 80)));
    members.push(...part);
  }
  const memberRows = [];
  for (const r of members) {
    const leadId = remap(r.lead_id, maps.lead);
    const uid = remap(r.user_id, maps.user);
    if (!leadId || !uid) continue;
    memberRows.push({
      id: nid(),
      lead_id: leadId,
      user_id: uid,
      role: r.role,
      added_by: person(r, 'added_by'),
      created_at: r.created_at,
      history_cutoff_at: r.history_cutoff_at,
    });
  }
  console.log(`- lead_members: ${memberRows.length}`);
  await insertRows('lead_members', memberRows, 100);

  const leadIds = [...maps.lead.keys()];
  const crmTasks = [];
  const page = 80;
  for (let i = 0; i < leadIds.length; i += page) {
    const slice = leadIds.slice(i, i + page);
    const part = await fetchAll('crm_tasks', (q) => q.in('lead_id', slice));
    crmTasks.push(...part);
  }
  const taskRows = crmTasks.map((r) => {
    const o = strip(r);
    o.id = nid();
    o.lead_id = remap(r.lead_id, maps.lead);
    o.assignee_id = person(r, 'assignee_id');
    o.supervisor_id = person(r, 'supervisor_id');
    o.created_by = person(r, 'created_by');
    o.pipeline_stage_id = remap(r.pipeline_stage_id, maps.crmStage);
    o.production_pipeline_stage_id = remap(r.production_pipeline_stage_id, maps.sxStage);
    o.executor_company_id = remap(r.executor_company_id, maps.company) || STATE.newCompanyId;
    o.quick_verdict_by = person(r, 'quick_verdict_by');
    o.department_id = remap(r.department_id, maps.dept);
    o.default_allowed_companies = remapArr(r.default_allowed_companies, maps.company, { dropUnmapped: true });
    o.default_allowed_departments = remapArr(r.default_allowed_departments, maps.dept, { dropUnmapped: true });
    o.error_type_id = null;
    return o;
  }).filter((r) => r.lead_id);
  console.log(`- crm_tasks: ${taskRows.length}`);
  await insertRows('crm_tasks', taskRows, 40);

  const projIds = [...maps.project.keys()];
  const sxTasks = [];
  for (let i = 0; i < projIds.length; i += page) {
    const slice = projIds.slice(i, i + page);
    if (!slice.length) break;
    const part = await fetchAll('tasks', (q) => q.in('project_id', slice));
    sxTasks.push(...part);
  }
  const sxRows = sxTasks.map((r) => {
    const o = strip(r);
    o.id = nid();
    o.project_id = remap(r.project_id, maps.project);
    o.stage_id = remap(r.stage_id, maps.sxStage) || remap(r.stage_id, maps.crmStage);
    o.assignee_id = person(r, 'assignee_id');
    o.created_by_id = person(r, 'created_by_id');
    o.production_stage_id = remap(r.production_stage_id, maps.sxStage);
    o.workflow_line_id = null;
    return o;
  }).filter((r) => r.project_id);
  console.log(`- tasks (SX): ${sxRows.length}`);
  await insertRows('tasks', sxRows, 50);
}

async function printSummary() {
  if (DRY || !STATE.newCompanyId) return;
  const q = async (table, col = 'company_id') => {
    const { count, error } = await sb.from(table).select('id', { count: 'exact', head: true }).eq(col, STATE.newCompanyId);
    if (error) return `err:${error.message}`;
    return count;
  };
  console.log('\n=== Clone NextGo xong (data-only) ===');
  console.log('Tenant:', STATE.tenantId, TENANT_SLUG);
  console.log('Company mới:', STATE.newCompanyId);
  console.log('Users alias inactive:', maps.user.size);
  console.log('leads mới:', await q('crm_leads'));
  console.log('projects mới:', await q('projects'));
  console.log('customers mới:', await q('customers'));
  console.log('Map file:', MAP_FILE);
  console.log('\nNHÂN VIÊN CŨ: không đổi email, không đổi tenant, vẫn vào HST mặc định.');
  console.log('Facebook: không đụng. Không login được alias vì is_active=false.');
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Thiếu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  }
  console.log(DRY ? '=== DRY-RUN — không ghi DB ===' : '=== CLONE NextGo data-only ===');
  loadMap();
  const src = await mustOne('companies', (q) => q.eq('id', SOURCE_COMPANY_ID), 'NextGo nguồn');
  console.log('Nguồn:', src.name, src.id, 'tenant', src.tenant_id);

  await ensureTenant();
  const level = await levels();
  await ensureOrg(level);
  await ensureCompany(src, level);
  await mapOldDivisions();
  saveMap();

  await cloneDepartments();
  saveMap();
  await cloneUsers();
  saveMap();
  await cloneConfig();
  saveMap();

  if (await alreadyClonedOps()) {
    console.log('crm_leads + projects trên company mới đã đủ — bỏ qua clone deal/dự án/task.');
  } else {
    await cloneCustomers();
    saveMap();
    await cloneLeadsAndProjects();
    saveMap();
    await cloneMembersAndTasks();
    saveMap();
  }

  saveMap();
  await printSummary();
}

main().catch((e) => {
  console.error('\nCLONE FAILED:', e);
  try { saveMap(); } catch (_) { /* ignore */ }
  process.exit(1);
});
