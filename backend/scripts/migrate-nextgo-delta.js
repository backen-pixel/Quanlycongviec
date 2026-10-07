/**
 * Di chuyển dữ liệu NextGo phát sinh SAU mốc clone (còn nằm ở công ty NextGo cũ
 * thuộc HST mặc định) sang HST NextGo mới.
 *
 * Cách làm: giữ nguyên id bản ghi, chỉ ánh xạ lại các khoá ngoại theo phạm vi
 * HST (công ty, pipeline, stage, khu vực, nguồn, người dùng…) bằng bản đồ id
 * của lần clone (`uploads/_nextgo_clone_id_map.json`). Nhờ vậy công việc, bình
 * luận, lịch sử… vẫn trỏ đúng lead/dự án cũ mà không cần tạo bản mới.
 *
 *   node scripts/migrate-nextgo-delta.js            # dry-run, chỉ in kế hoạch
 *   node scripts/migrate-nextgo-delta.js --apply    # ghi thật
 *   node scripts/migrate-nextgo-delta.js --apply --limit-leads=5   # thử vài lead
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { supabase } = require('../src/config/supabase');

const MAP_FILE = path.join(__dirname, '../uploads/_nextgo_clone_id_map.json');
const APPLY = process.argv.includes('--apply');
const LIMIT_LEADS = (() => {
  const a = process.argv.find((x) => x.startsWith('--limit-leads='));
  return a ? Math.max(1, parseInt(a.split('=')[1], 10) || 0) : 0;
})();

const raw = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
const NEW_TENANT = raw.tenantId;
const NEW_COMPANY = raw.companyId;
const OLD_COMPANY = Object.values(raw.maps.company)[0][0];

/** map name → Map(oldId → newId) */
const M = {};
for (const [name, pairs] of Object.entries(raw.maps)) {
  M[name] = new Map(Object.values(pairs).map(([o, n]) => [String(o), String(n)]));
}

/** Người dùng HST mặc định (bot tự động hoá) → admin HST NextGo. */
const NEXTGO_FALLBACK_USER = 'ee8083b5-49e5-45af-ae8b-8d3bcabb5530'; // quantri.hst@nextgo.vn
/** Id đang di chuyển cùng đợt — không cần ánh xạ, cũng không phải cảnh báo. */
const movingIds = { customer: new Set(), project: new Set(), lead: new Set() };
/** Bản ghi dùng chung toàn hệ thống (company_id null) — giữ nguyên. */
const globalIds = new Set();

/**
 * Bổ sung ánh xạ theo tên cho các bảng danh mục mà lần clone không phủ hết
 * (vd công ty cũ có 5 nguồn «Google Form», HST mới chỉ có 1).
 */
async function extendMapByName(mapName, table, extraFilter = (q) => q) {
  const sel = 'id, name, company_id';
  const { data: oldRows } = await extraFilter(supabase.from(table).select(sel).eq('company_id', OLD_COMPANY));
  const { data: newRows } = await extraFilter(supabase.from(table).select(sel).eq('company_id', NEW_COMPANY));
  const byName = new Map((newRows || []).map((r) => [String(r.name || '').trim().toLowerCase(), String(r.id)]));
  for (const r of oldRows || []) {
    const key = String(r.id);
    if (M[mapName].has(key)) continue;
    const hit = byName.get(String(r.name || '').trim().toLowerCase());
    if (hit) M[mapName].set(key, hit);
  }
  const { data: shared } = await extraFilter(supabase.from(table).select(sel).is('company_id', null));
  (shared || []).forEach((r) => globalIds.add(String(r.id)));
}

function mapId(mapName, value, ctx) {
  if (!value) return { value: value ?? null, changed: false };
  const key = String(value);
  const hit = M[mapName]?.get(key);
  if (hit) return { value: hit, changed: hit !== key };
  return { value: key, changed: false, unmapped: true, ctx: `${ctx} (${mapName}=${key})` };
}

/** Build patch cho 1 hàng theo bảng cột → tên map. */
function buildPatch(row, spec, ctxLabel) {
  const patch = {};
  const unmapped = [];
  for (const [col, mapName] of Object.entries(spec)) {
    if (!(col in row)) continue;
    const cur = row[col];
    if (cur == null) continue;
    if (mapName === '@company') {
      if (String(cur) === OLD_COMPANY) patch[col] = NEW_COMPANY;
      else if (String(cur) !== NEW_COMPANY) unmapped.push(`${ctxLabel}.${col}=${cur}`);
      continue;
    }
    const r = mapId(mapName, cur, `${ctxLabel}.${col}`);
    if (r.unmapped) {
      const id = String(cur);
      // Đã thuộc HST mới rồi, hoặc là bản ghi dùng chung, hoặc đang di chuyển cùng đợt.
      if (isNewSideId(mapName, id) || globalIds.has(id) || movingIds[mapName]?.has(id)) continue;
      // User của HST khác (bot tự động hoá) → gán admin HST NextGo.
      if (mapName === 'user') {
        patch[col] = NEXTGO_FALLBACK_USER;
        continue;
      }
      unmapped.push(`${ctxLabel}.${col}=${id} [${mapName}]`);
      continue;
    }
    if (r.changed) patch[col] = r.value;
  }
  return { patch, unmapped };
}

const newSideCache = {};
function isNewSideId(mapName, id) {
  if (!newSideCache[mapName]) newSideCache[mapName] = new Set(M[mapName] ? [...M[mapName].values()] : []);
  return newSideCache[mapName].has(String(id));
}

const LEAD_SPEC = {
  company_id: '@company',
  pipeline_id: 'pipeline',
  stage_id: 'crmStage',
  region_id: 'region',
  source_id: 'source',
  lead_type_id: 'leadType',
  sx_pipeline_stage_id: 'sxStage',
  vc_pipeline_stage_id: 'vcStage',
  sx_template_company_id: '@company',
  external_company_id: '@company',
  customer_id: 'customer',
  project_id: 'project',
  parent_lead_id: 'lead',
  source_customer_deal_id: 'lead',
  assigned_to: 'user',
  lead_owner_id: 'user',
  created_by: 'user',
  deadline_disabled_by: 'user',
  sx_handover_confirmed_by: 'user',
};

const CUSTOMER_SPEC = { company_id: '@company', assigned_to: 'user' };

const PROJECT_SPEC = {
  company_id: '@company',
  logistics_company_id: '@company',
  customer_id: 'customer',
  workshop_type_id: 'workshopType',
  delivery_team_id: 'workshopTeam',
  installation_team_id: 'workshopTeam',
  production_workshop_team_id: 'workshopTeam',
  sx_kanban_column_id: 'sxStage',
  vc_kanban_column_id: 'vcStage',
  care_person_id: 'user',
  consulting_person_id: 'user',
  contract_person_id: 'user',
  design_person_id: 'user',
  designer_id: 'user',
  installation_person_id: 'user',
  installer_person_id: 'user',
  logistics_person_id: 'user',
  production_person_id: 'user',
  project_manager_id: 'user',
  quotation_person_id: 'user',
  responsible_person_id: 'user',
  sales_person_id: 'user',
  shipping_person_id: 'user',
  supervisor_id: 'user',
  vc_deleted_by: 'user',
};

const CRM_TASK_SPEC = {
  executor_company_id: '@company',
  department_id: 'dept',
  pipeline_stage_id: 'crmStage',
  production_pipeline_stage_id: 'sxStage',
  assignee_id: 'user',
  created_by: 'user',
  supervisor_id: 'user',
  quick_verdict_by: 'user',
};

const SX_TASK_SPEC = {
  production_stage_id: 'sxStage',
  assignee_id: 'user',
  created_by_id: 'user',
};

const USER_ONLY = { user_id: 'user' };

async function fetchAll(table, cols, apply) {
  const out = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select(cols).range(from, from + PAGE - 1);
    q = apply(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/** Giá trị trước khi ghi — dùng để hoàn tác (`--rollback=<file>`). */
const rollback = [];

async function updateRows(table, rows, label, report) {
  report.plan[label] = { so_hang: rows.length, vi_du: rows.slice(0, 2) };
  if (!APPLY || !rows.length) return;
  let done = 0;
  for (const { id, patch } of rows) {
    const cols = ['id', ...Object.keys(patch)].join(',');
    const { data: before } = await supabase.from(table).select(cols).eq('id', id).maybeSingle();
    if (before) rollback.push({ table, id, before });
    const { error } = await supabase.from(table).update(patch).eq('id', id);
    if (error) {
      report.loi.push(`${table} ${id}: ${error.message}`);
      continue;
    }
    done += 1;
  }
  report.da_ghi[label] = done;
}

/** Hoàn tác: ghi lại đúng các giá trị đã lưu trong file rollback. */
async function runRollback(file) {
  const entries = JSON.parse(fs.readFileSync(file, 'utf8'));
  let ok = 0;
  const errs = [];
  for (const e of entries.slice().reverse()) {
    const patch = { ...e.before };
    delete patch.id;
    const { error } = await supabase.from(e.table).update(patch).eq('id', e.id);
    if (error) errs.push(`${e.table} ${e.id}: ${error.message}`);
    else ok += 1;
  }
  console.log(JSON.stringify({ da_hoan_tac: ok, loi: errs.slice(0, 20) }, null, 2));
}

(async () => {
  const rbArg = process.argv.find((x) => x.startsWith('--rollback='));
  if (rbArg) {
    await runRollback(rbArg.split('=')[1]);
    process.exit(0);
  }
  const report = { che_do: APPLY ? 'APPLY' : 'DRY-RUN', plan: {}, da_ghi: {}, canh_bao: [], loi: [] };

  // ── 1. Lead delta: thuộc công ty cũ nhưng không có trong bản đồ clone ──
  const oldLeadIds = new Set(M.lead.keys());
  const allOldLeads = await fetchAll('crm_leads', '*', (q) => q.eq('company_id', OLD_COMPANY));
  let deltaLeads = allOldLeads.filter((l) => !oldLeadIds.has(String(l.id)));
  if (LIMIT_LEADS) deltaLeads = deltaLeads.slice(0, LIMIT_LEADS);
  const deltaLeadIds = deltaLeads.map((l) => l.id);

  // Trùng mã lead/deal với HST mới?
  const codes = deltaLeads.map((l) => l.code).filter(Boolean);
  const clash = [];
  for (let i = 0; i < codes.length; i += 200) {
    const part = codes.slice(i, i + 200);
    const { data } = await supabase.from('crm_leads').select('code').eq('company_id', NEW_COMPANY).in('code', part);
    (data || []).forEach((r) => clash.push(r.code));
  }
  if (clash.length) report.canh_bao.push(`Trùng mã với HST mới: ${clash.join(', ')}`);

  // ── 2. Khách hàng + dự án delta ──
  const oldCustomerIds = new Set(M.customer.keys());
  const allOldCustomers = await fetchAll('customers', '*', (q) => q.eq('company_id', OLD_COMPANY));
  const deltaCustomers = allOldCustomers.filter((c) => !oldCustomerIds.has(String(c.id)));

  const oldProjectIds = new Set(M.project.keys());
  const allOldProjects = await fetchAll('projects', '*', (q) => q.eq('company_id', OLD_COMPANY));
  const deltaProjects = allOldProjects.filter((p) => !oldProjectIds.has(String(p.id)));
  const deltaProjectIds = deltaProjects.map((p) => p.id);

  // ── 2b. Khách hàng do Facebook/Form tạo (company_id NULL) mà lead delta đang dùng.
  // Chỉ nhận nếu không có lead nào ngoài đợt này tham chiếu tới.
  const refCustomerIds = [...new Set(deltaLeads.map((l) => l.customer_id).filter(Boolean).map(String))];
  const deltaSet = new Set(deltaLeadIds.map(String));
  const orphanCustomers = [];
  for (const part of ((arr, n = 100) => { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; })(refCustomerIds)) {
    const { data: cs } = await supabase.from('customers').select('*').in('id', part).is('company_id', null);
    for (const c of cs || []) {
      const { data: others } = await supabase.from('crm_leads').select('id, company_id').eq('customer_id', c.id);
      const outside = (others || []).filter((l) => !deltaSet.has(String(l.id)));
      if (outside.length) {
        report.canh_bao.push(`customer ${c.full_name} (${c.id}) còn được lead ngoài đợt dùng — bỏ qua`);
        continue;
      }
      orphanCustomers.push(c);
    }
  }
  deltaCustomers.push(...orphanCustomers);

  // ── 3. Chuẩn bị ánh xạ: id đi cùng đợt + danh mục khớp theo tên ──
  deltaCustomers.forEach((c) => movingIds.customer.add(String(c.id)));
  deltaProjects.forEach((p) => movingIds.project.add(String(p.id)));
  deltaLeads.forEach((l) => movingIds.lead.add(String(l.id)));
  await extendMapByName('source', 'crm_sources');
  await extendMapByName('leadType', 'crm_lead_types');
  await extendMapByName('dept', 'departments');
  await extendMapByName('region', 'company_regions');

  // ── 4. Patch cha ──
  const leadPatches = [];
  for (const l of deltaLeads) {
    const { patch, unmapped } = buildPatch(l, LEAD_SPEC, `lead ${l.code}`);
    unmapped.forEach((u) => report.canh_bao.push(u));
    if (Object.keys(patch).length) leadPatches.push({ id: l.id, patch });
  }
  const customerPatches = [];
  for (const c of deltaCustomers) {
    const { patch, unmapped } = buildPatch(c, CUSTOMER_SPEC, `customer ${c.full_name || c.id}`);
    if (c.company_id == null) patch.company_id = NEW_COMPANY;
    unmapped.forEach((u) => report.canh_bao.push(u));
    if (Object.keys(patch).length) customerPatches.push({ id: c.id, patch });
  }
  const projectPatches = [];
  for (const p of deltaProjects) {
    const { patch, unmapped } = buildPatch(p, PROJECT_SPEC, `project ${p.code || p.id}`);
    unmapped.forEach((u) => report.canh_bao.push(u));
    if (Object.keys(patch).length) projectPatches.push({ id: p.id, patch });
  }

  // ── 4. Bảng con theo lead / project delta ──
  const chunk = (arr, n = 100) => {
    const out = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  };

  async function childPatches(table, spec, parentCol, parentIds, label) {
    const rows = [];
    for (const part of chunk(parentIds)) {
      if (!part.length) continue;
      const data = await fetchAll(table, '*', (q) => q.in(parentCol, part));
      rows.push(...data);
    }
    const patches = [];
    for (const r of rows) {
      const { patch, unmapped } = buildPatch(r, spec, `${label} ${r.id}`);
      unmapped.forEach((u) => report.canh_bao.push(u));
      if (Object.keys(patch).length) patches.push({ id: r.id, patch });
    }
    return patches;
  }

  const crmTaskPatches = await childPatches('crm_tasks', CRM_TASK_SPEC, 'lead_id', deltaLeadIds, 'crm_task');
  const commentPatches = await childPatches('crm_lead_comments', USER_ONLY, 'lead_id', deltaLeadIds, 'lead_comment');
  const memberPatches = await childPatches('lead_members', { user_id: 'user', added_by: 'user' }, 'lead_id', deltaLeadIds, 'lead_member');
  const attachPatches = await childPatches('crm_task_attachments', { created_by: 'user' }, 'lead_id', deltaLeadIds, 'task_attachment');
  const eventPatches = await childPatches('crm_events', {
    company_id: '@company', assignee_id: 'user', created_by: 'user', customer_id: 'customer',
  }, 'lead_id', deltaLeadIds, 'crm_event');
  const kpiPatches = await childPatches('crm_kpi_ledger', {
    company_id: '@company', user_id: 'user', created_by: 'user', stage_id: 'crmStage',
  }, 'lead_id', deltaLeadIds, 'kpi_ledger');
  const histLeadPatches = await childPatches('unified_task_history', {
    company_id: '@company', actor_user_id: 'user',
  }, 'lead_id', deltaLeadIds, 'history_lead');

  const sxTaskPatches = await childPatches('tasks', SX_TASK_SPEC, 'project_id', deltaProjectIds, 'sx_task');
  const projCommentPatches = await childPatches('project_comments', USER_ONLY, 'project_id', deltaProjectIds, 'project_comment');
  const histProjectPatches = await childPatches('unified_task_history', {
    company_id: '@company', actor_user_id: 'user',
  }, 'project_id', deltaProjectIds, 'history_project');

  // ── 5. Báo cáo ngày của NV NextGo ở công ty cũ ──
  const dailyRows = await fetchAll('crm_daily_reports', '*', (q) => q.eq('company_id', OLD_COMPANY));
  const dailyPatches = [];
  for (const r of dailyRows) {
    const { patch, unmapped } = buildPatch(r, { company_id: '@company', user_id: 'user' }, `daily_report ${r.id}`);
    unmapped.forEach((u) => report.canh_bao.push(u));
    if (Object.keys(patch).length) dailyPatches.push({ id: r.id, patch });
  }

  // ── 6. Ghi (theo thứ tự cha → con) ──
  await updateRows('customers', customerPatches, 'customers', report);
  await updateRows('projects', projectPatches, 'projects', report);
  await updateRows('crm_leads', leadPatches, 'crm_leads', report);
  await updateRows('crm_tasks', crmTaskPatches, 'crm_tasks', report);
  await updateRows('crm_lead_comments', commentPatches, 'crm_lead_comments', report);
  await updateRows('lead_members', memberPatches, 'lead_members', report);
  await updateRows('crm_task_attachments', attachPatches, 'crm_task_attachments', report);
  await updateRows('crm_events', eventPatches, 'crm_events', report);
  await updateRows('crm_kpi_ledger', kpiPatches, 'crm_kpi_ledger', report);
  await updateRows('unified_task_history', [...histLeadPatches, ...histProjectPatches], 'unified_task_history', report);
  await updateRows('tasks', sxTaskPatches, 'tasks', report);
  await updateRows('project_comments', projCommentPatches, 'project_comments', report);
  await updateRows('crm_daily_reports', dailyPatches, 'crm_daily_reports', report);

  report.tong_quan = {
    old_company: OLD_COMPANY,
    new_company: NEW_COMPANY,
    new_tenant: NEW_TENANT,
    lead_delta: deltaLeads.length,
    customer_delta: deltaCustomers.length,
    project_delta: deltaProjects.length,
  };
  report.canh_bao = [...new Set(report.canh_bao)].slice(0, 60);

  if (APPLY && rollback.length) {
    const rbFile = path.join(__dirname, `../uploads/_nextgo_delta_rollback_${Date.now()}.json`);
    fs.writeFileSync(rbFile, JSON.stringify(rollback, null, 1));
    report.file_hoan_tac = rbFile;
  }

  const outFile = path.join(__dirname, `../uploads/_nextgo_delta_${APPLY ? 'apply' : 'dryrun'}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, plan: Object.fromEntries(Object.entries(report.plan).map(([k, v]) => [k, v.so_hang])) }, null, 2));
  console.log('Chi tiết:', outFile);
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
