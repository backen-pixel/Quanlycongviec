/**
 * Kiểm tra phân quyền các route CRM theo :projectId (không đi qua enforceCrmDealAssigneeAccess).
 *
 * Chạy:
 *   node scripts/crm-project-scope-authz-test.js
 *   node scripts/crm-project-scope-authz-test.js --base http://localhost:4000
 *
 * Yêu cầu: backend đang chạy + .env có JWT_SECRET/SUPABASE keys.
 *
 * Chỉ đọc dữ liệu. Nhánh CHO PHÉP của POST auto-invoice KHÔNG được test (sẽ tạo hóa đơn thật);
 * chỉ kiểm tra nhánh CHẶN xảy ra trước khi handler chạy.
 */

const jwt = require('jsonwebtoken');
const config = require('../src/config');
const { supabase } = require('../src/config/supabase');

function parseArgs() {
  const out = {};
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].startsWith('--')) out[a[i].slice(2)] = a[i + 1] && !a[i + 1].startsWith('--') ? a[i += 1] : true;
  }
  return out;
}
const args = parseArgs();
const BASE = args.base || 'http://localhost:4000';

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

async function call(method, path, token) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { Authorization: `Bearer ${token}` } });
  const raw = await res.text();
  let json = null;
  try { json = JSON.parse(raw); } catch { /* non-json */ }
  return { status: res.status, json, raw };
}

const PERSON_FIELDS = [
  'sales_person_id', 'designer_id', 'project_manager_id', 'supervisor_id',
  'production_person_id', 'logistics_person_id', 'created_by',
];

async function pickTarget() {
  // Ưu tiên project ĐANG có lead_documents — chính là dữ liệu từng bị lộ.
  const { data: docs } = await supabase
    .from('lead_documents')
    .select('project_id')
    .not('project_id', 'is', null)
    .limit(200);
  const candidateIds = [...new Set((docs || []).map((d) => String(d.project_id)))];
  for (const pid of candidateIds) {
    const { data: project } = await supabase.from('projects').select('*').eq('id', pid).maybeSingle();
    if (!project?.company_id) continue;
    const { data: lead } = await supabase
      .from('crm_leads')
      .select('id, company_id, assigned_to, lead_owner_id')
      .eq('project_id', pid)
      .limit(1)
      .maybeSingle();
    return { project, lead: lead || null, docCount: (docs || []).filter((d) => String(d.project_id) === pid).length };
  }
  return null;
}

async function pickUsers(project, lead) {
  const { data: users } = await supabase
    .from('users')
    .select('id, email, full_name, role, company_id, tenant_id, department_id, is_active')
    .eq('is_active', true)
    .limit(3000);
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
  const adminRoles = new Set(['admin', 'sales_admin', 'platform_admin']);

  const isOutsider = (u) => {
    if (adminRoles.has(String(u.role || '').toLowerCase())) return false;
    if (!u.company_id) return false;
    if (projectCompanies.has(String(u.company_id))) return false;
    if (lead?.company_id && String(u.company_id) === String(lead.company_id)) return false;
    if (projectPeople.has(String(u.id)) || leadPeople.has(String(u.id))) return false;
    return true;
  };
  // Bắt buộc cùng hệ sinh thái: nếu khác tenant thì 403 đến từ tenantScope, không chứng minh được gate mới.
  const outsider = list.find((u) => isOutsider(u) && projectTenant && String(u.tenant_id || '') === projectTenant);

  const insider = list.find((u) => u.company_id && projectCompanies.has(String(u.company_id)));
  const admin = list.find((u) => String(u.role || '').toLowerCase() === 'admin' && !u.company_id);
  return { outsider, insider, admin };
}

(async () => {
  const target = await pickTarget();
  if (!target) {
    console.log(`${c.r}Không tìm được project có lead_documents để test${c.x}`);
    process.exit(1);
  }
  const { project, lead, docCount } = target;
  const { outsider, insider, admin } = await pickUsers(project, lead);

  head('BỐI CẢNH');
  info(`project ${project.id} · company ${project.company_id} · ${docCount} lead_documents`);
  info(lead ? `deal liên kết ${lead.id} · company ${lead.company_id}` : 'không có deal liên kết');
  info(outsider ? `outsider: ${outsider.full_name} (${outsider.role}, company ${outsider.company_id})` : 'KHÔNG tìm được outsider');
  info(insider ? `insider : ${insider.full_name} (${insider.role}, company ${insider.company_id})` : 'không tìm được insider');
  info(admin ? `admin   : ${admin.full_name}` : 'không tìm được admin hệ thống');

  const docPath = `/api/crm/projects/${project.id}/documents`;
  const invPath = `/api/crm/project/${project.id}/auto-invoice`;

  head('1. GET /crm/projects/:projectId/documents — user ngoài phạm vi phải bị chặn');
  if (!outsider) {
    warn('bỏ qua: không có user nào ngoài phạm vi để thử');
  } else {
    const r = await call('GET', docPath, tokenFor(outsider));
    if (r.status === 403 && r.json?.reason === 'crm_project_scope_denied') {
      ok('outsider cùng hệ sinh thái bị chặn 403 bởi gate project-scope');
    } else if (r.status === 403) {
      fail(`403 nhưng đến từ tầng khác (${r.json?.code || r.json?.reason || 'không rõ'}) — chưa chứng minh được gate mới`);
    } else if (r.status === 200) {
      fail(`outsider vẫn đọc được ${Array.isArray(r.json) ? r.json.length : '?'} tài liệu (HTTP 200) → lỗ hổng còn nguyên`);
    } else {
      fail(`outsider nhận HTTP ${r.status} — mong đợi 403 · ${r.json?.error || r.raw.slice(0, 120)}`);
    }
  }

  head('2. GET .../documents — người trong phạm vi vẫn dùng được (không phá UI hiện có)');
  for (const [label, u] of [['admin hệ thống', admin], ['user cùng công ty dự án', insider]]) {
    if (!u) { warn(`bỏ qua ${label}`); continue; }
    const r = await call('GET', docPath, tokenFor(u));
    if (r.status === 200 && Array.isArray(r.json)) ok(`${label}: HTTP 200, ${r.json.length} tài liệu`);
    else fail(`${label}: HTTP ${r.status} · ${r.json?.error || r.raw.slice(0, 120)}`);
  }

  head('3. GET .../documents — projectId không phải UUID');
  {
    const r = await call('GET', '/api/crm/projects/not-a-uuid/documents', tokenFor(admin || outsider));
    if (r.status === 400) ok('trả 400 project_id không hợp lệ');
    else fail(`HTTP ${r.status} — mong đợi 400`);
  }

  head('4. GET .../documents — projectId hợp lệ nhưng không tồn tại');
  {
    const r = await call('GET', '/api/crm/projects/00000000-0000-4000-8000-000000000000/documents', tokenFor(admin || outsider));
    if (r.status === 404) ok('trả 404 không tìm thấy dự án');
    else fail(`HTTP ${r.status} — mong đợi 404`);
  }

  head('5. POST /crm/project/:projectId/auto-invoice — user ngoài phạm vi phải bị chặn TRƯỚC khi tạo hóa đơn');
  if (!outsider) {
    warn('bỏ qua: không có outsider');
  } else {
    const { count: before } = await supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', project.id);
    const r = await call('POST', invPath, tokenFor(outsider));
    const { count: after } = await supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', project.id);
    if (r.status === 403 && r.json?.reason === 'crm_project_scope_denied') {
      ok('outsider bị chặn 403 bởi gate project-scope');
    } else if (r.status === 403) {
      fail(`403 nhưng đến từ tầng khác (${r.json?.code || r.json?.reason || 'không rõ'})`);
    } else {
      fail(`outsider nhận HTTP ${r.status} — mong đợi 403 · ${JSON.stringify(r.json).slice(0, 160)}`);
    }
    if ((before ?? 0) === (after ?? 0)) ok(`số hóa đơn của dự án không đổi (${before ?? 0})`);
    else fail(`hóa đơn thay đổi ${before} → ${after} dù request bị chặn`);
  }

  head('KẾT QUẢ');
  console.log(`  ${c.g}${passed} PASS${c.x} · ${failed ? c.r : c.d}${failed} FAIL${c.x}`);
  if (failed) failures.forEach((f) => console.log(`  ${c.r}- ${f}${c.x}`));
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(`${c.r}Lỗi script:${c.x}`, e);
  process.exit(1);
});
