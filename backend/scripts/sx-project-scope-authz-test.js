/**
 * Kiểm tra phân quyền project-scope module SX (IDOR /api/projects, /tasks, /vc-handover).
 *
 * Chạy: node scripts/sx-project-scope-authz-test.js
 *
 * Bao gồm:
 *  - Outsider khác company (cùng tenant) → 403
 *  - Same-company non-participant → 403 documents/cashflow (mode sensitive)
 *  - Participant / company admin / system admin → 200 documents
 */

const jwt = require('jsonwebtoken');
const config = require('../src/config');
const { supabase } = require('../src/config/supabase');

const BASE = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:4000';

const c = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' };
let passed = 0;
let failed = 0;
const failures = [];
const ok = (m) => { passed += 1; console.log(`  ${c.g}PASS${c.x} ${m}`); };
const fail = (m) => { failed += 1; failures.push(m); console.log(`  ${c.r}FAIL${c.x} ${m}`); };
const info = (m) => console.log(`  ${c.d}··   ${m}${c.x}`);
const warn = (m) => console.log(`  ${c.y}WARN${c.x} ${m}`);
const head = (m) => console.log(`\n${c.b}${m}${c.x}`);

const tokenFor = (u) => jwt.sign({
  userId: u.id,
  email: u.email || null,
  role: u.role,
  fullName: u.full_name || null,
  company_id: u.company_id || null,
  tenant_id: u.tenant_id || null,
  department_id: u.department_id || null,
  crm_region_ids: [],
}, config.jwtSecret);

async function call(method, path, token, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await res.text();
  let json = null;
  try { json = JSON.parse(raw); } catch { /* */ }
  return { status: res.status, json, raw };
}

const PERSON_FIELDS = [
  'sales_person_id', 'designer_id', 'project_manager_id', 'supervisor_id',
  'production_person_id', 'logistics_person_id', 'installer_person_id', 'created_by',
];

const ADMIN_ROLES = new Set(['admin', 'sales_admin', 'platform_admin']);
const MODULE_ADMIN_ROLES = new Set([
  'admin', 'sales_admin', 'platform_admin',
  'production_admin', 'crm_production_admin', 'crm_production_staff',
  'logistics_admin',
]);

async function pickTarget() {
  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .not('company_id', 'is', null)
    .limit(200);
  const { data: users } = await supabase
    .from('users')
    .select('id, role, company_id, is_active')
    .eq('is_active', true)
    .limit(4000);
  const list = users || [];

  let fallback = null;
  for (const project of projects || []) {
    const { data: lead } = await supabase
      .from('crm_leads')
      .select('id, company_id, assigned_to, lead_owner_id')
      .eq('project_id', project.id)
      .limit(1)
      .maybeSingle();
    const projectCompanies = new Set([project.company_id, project.logistics_company_id].filter(Boolean).map(String));
    const projectPeople = new Set(PERSON_FIELDS.map((f) => project[f]).filter(Boolean).map(String));
    const leadPeople = new Set([lead?.assigned_to, lead?.lead_owner_id].filter(Boolean).map(String));
    const hasParticipant = list.some((u) => projectPeople.has(String(u.id)) || leadPeople.has(String(u.id)));
    const hasNonParticipant = list.some((u) => {
      const role = String(u.role || '').toLowerCase();
      if (MODULE_ADMIN_ROLES.has(role)) return false;
      if (!u.company_id || !projectCompanies.has(String(u.company_id))) return false;
      if (projectPeople.has(String(u.id)) || leadPeople.has(String(u.id))) return false;
      return true;
    });
    const candidate = { project, lead: lead || null };
    if (!fallback) fallback = candidate;
    if (hasParticipant && hasNonParticipant) return candidate;
  }
  return fallback;
}

async function loadStaffIds(projectId) {
  try {
    const { data } = await supabase
      .from('project_production_staff')
      .select('user_id')
      .eq('project_id', projectId);
    return new Set((data || []).map((r) => String(r.user_id)));
  } catch {
    return new Set();
  }
}

async function pickUsers(project, lead) {
  const { data: users } = await supabase
    .from('users')
    .select('id, email, full_name, role, company_id, tenant_id, department_id, is_active')
    .eq('is_active', true)
    .limit(4000);
  const list = users || [];
  const { data: company } = await supabase
    .from('companies')
    .select('id, tenant_id')
    .eq('id', project.company_id)
    .maybeSingle();
  const projectTenant = company?.tenant_id ? String(company.tenant_id) : '';
  const projectCompanies = new Set([project.company_id, project.logistics_company_id].filter(Boolean).map(String));
  const projectPeople = new Set(PERSON_FIELDS.map((f) => project[f]).filter(Boolean).map(String));
  const leadPeople = new Set([lead?.assigned_to, lead?.lead_owner_id].filter(Boolean).map(String));
  const staffIds = await loadStaffIds(project.id);

  const isOutsider = (u) => {
    if (ADMIN_ROLES.has(String(u.role || '').toLowerCase())) return false;
    if (!u.company_id) return false;
    if (projectCompanies.has(String(u.company_id))) return false;
    if (lead?.company_id && String(u.company_id) === String(lead.company_id)) return false;
    if (projectPeople.has(String(u.id)) || leadPeople.has(String(u.id)) || staffIds.has(String(u.id))) return false;
    return true;
  };

  const isSameCompanyNonParticipant = (u) => {
    const role = String(u.role || '').toLowerCase();
    if (MODULE_ADMIN_ROLES.has(role)) return false;
    if (!u.company_id || !projectCompanies.has(String(u.company_id))) return false;
    if (projectPeople.has(String(u.id)) || leadPeople.has(String(u.id)) || staffIds.has(String(u.id))) return false;
    return true;
  };

  const isParticipant = (u) => {
    if (projectPeople.has(String(u.id)) || leadPeople.has(String(u.id)) || staffIds.has(String(u.id))) return true;
    return false;
  };

  const outsider = list.find((u) => isOutsider(u) && projectTenant && String(u.tenant_id || '') === projectTenant)
    || list.find((u) => isOutsider(u));
  const sameCompanyNonParticipant = list.find((u) => isSameCompanyNonParticipant(u));
  const participant = list.find((u) => isParticipant(u));
  const companyAdmin = list.find((u) => {
    const role = String(u.role || '').toLowerCase();
    return MODULE_ADMIN_ROLES.has(role) && u.company_id && projectCompanies.has(String(u.company_id));
  });
  const insider = participant || companyAdmin || list.find((u) => u.company_id && projectCompanies.has(String(u.company_id)));
  const admin = list.find((u) => String(u.role || '').toLowerCase() === 'admin' && !u.company_id);

  return {
    outsider,
    sameCompanyNonParticipant,
    participant,
    companyAdmin,
    insider,
    admin,
  };
}

function expectDenied(label, r) {
  if (r.status === 403 && r.json?.reason === 'project_scope_denied') {
    ok(`${label}: 403 project_scope_denied`);
  } else if (r.status === 403) {
    fail(`${label}: 403 nhưng reason=${r.json?.reason || r.json?.code || '?'} (mong đợi project_scope_denied)`);
  } else if (r.status === 200) {
    fail(`${label}: vẫn HTTP 200 → lỗ hổng còn`);
  } else {
    fail(`${label}: HTTP ${r.status} · ${(r.json?.error || r.raw || '').slice(0, 100)}`);
  }
}

function expectOk(label, r) {
  if (r.status === 200) ok(`${label}: 200`);
  else fail(`${label}: HTTP ${r.status} · ${r.json?.error || r.json?.reason || ''}`);
}

(async () => {
  const target = await pickTarget();
  if (!target) {
    console.log(`${c.r}Không tìm được project để test${c.x}`);
    process.exit(1);
  }
  const { project, lead } = target;
  const users = await pickUsers(project, lead);
  const {
    outsider, sameCompanyNonParticipant, participant, companyAdmin, insider, admin,
  } = users;
  const pid = project.id;

  head('BỐI CẢNH');
  info(`project ${project.code || pid} · company ${project.company_id}`);
  info(lead ? `deal ${lead.id} · company ${lead.company_id}` : 'không có deal');
  info(outsider ? `outsider: ${outsider.full_name} (${outsider.role})` : 'KHÔNG có outsider');
  info(sameCompanyNonParticipant
    ? `same-co non-participant: ${sameCompanyNonParticipant.full_name} (${sameCompanyNonParticipant.role})`
    : 'không có same-company non-participant');
  info(participant ? `participant: ${participant.full_name}` : 'không có participant');
  info(companyAdmin ? `companyAdmin: ${companyAdmin.full_name} (${companyAdmin.role})` : 'không có companyAdmin');
  info(insider ? `insider : ${insider.full_name}` : 'không có insider');
  info(admin ? `admin   : ${admin.full_name}` : 'không có admin');

  if (!outsider) {
    fail('không tìm được outsider cùng tenant — không chứng minh được gate');
    process.exit(1);
  }
  const tokOut = tokenFor(outsider);

  head('1. Outsider bị chặn trên API nhạy cảm');
  expectDenied('GET documents', await call('GET', `/api/projects/${pid}/documents`, tokOut));
  expectDenied('GET cashflow', await call('GET', `/api/projects/${pid}/cashflow`, tokOut));
  expectDenied('GET comments', await call('GET', `/api/projects/${pid}/comments`, tokOut));
  expectDenied('GET activities', await call('GET', `/api/projects/${pid}/activities`, tokOut));
  expectDenied('GET tasks?project_id', await call('GET', `/api/tasks?project_id=${pid}`, tokOut));
  expectDenied(
    'PUT stage (slug giả)',
    await call('PUT', `/api/projects/${pid}/stage`, tokOut, {
      stage_slug: '__sx_authz_probe_no_such__',
      new_status: 'producing',
    }),
  );
  expectDenied(
    'POST vc-handover request',
    await call('POST', `/api/vc-handover/projects/${pid}/request`, tokOut, {}),
  );

  head('2. Same-company non-participant bị chặn documents/cashflow (sensitive)');
  if (!sameCompanyNonParticipant) {
    warn('bỏ qua — không tìm được user cùng company không tham gia dự án');
  } else {
    const tok = tokenFor(sameCompanyNonParticipant);
    expectDenied('same-co GET documents', await call('GET', `/api/projects/${pid}/documents`, tok));
    expectDenied('same-co GET cashflow', await call('GET', `/api/projects/${pid}/cashflow`, tok));
    // comments READ vẫn company-mode — cùng company được đọc (không fail nếu 200)
    const rComments = await call('GET', `/api/projects/${pid}/comments`, tok);
    if (rComments.status === 200 || rComments.status === 403) {
      ok(`same-co GET comments: HTTP ${rComments.status} (company-mode READ)`);
    } else {
      fail(`same-co GET comments: HTTP ${rComments.status}`);
    }
  }

  head('3. Participant / company admin / system admin đọc documents');
  for (const [label, u] of [
    ['participant', participant],
    ['companyAdmin', companyAdmin],
    ['admin', admin],
  ]) {
    if (!u) { warn(`bỏ qua ${label}`); continue; }
    expectOk(`${label} GET documents`, await call('GET', `/api/projects/${pid}/documents`, tokenFor(u)));
  }
  if (!participant && !companyAdmin && !admin) {
    fail('không có participant/companyAdmin/admin để chứng minh đọc documents vẫn được');
  }

  head('4. projectId không hợp lệ');
  {
    const r = await call('GET', '/api/projects/not-a-uuid/documents', tokenFor(admin || outsider));
    if (r.status === 400) ok('400 invalid project_id');
    else fail(`HTTP ${r.status} — mong đợi 400`);
  }

  head('KẾT QUẢ');
  console.log(`  ${c.g}${passed} PASS${c.x} · ${failed ? c.r : c.d}${failed} FAIL${c.x}`);
  if (failed) failures.forEach((f) => console.log(`  ${c.r}- ${f}${c.x}`));
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(`${c.r}Lỗi script:${c.x}`, e);
  process.exit(1);
});
