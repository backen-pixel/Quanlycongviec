/**
 * Smoke test phân quyền — catalog, roles, effective, override, mua_hang enforce.
 * Usage: node scripts/test-permissions-smoke.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const BASE = process.env.API_BASE || 'http://127.0.0.1:4000/api';
const EMAIL = process.env.TEST_ADMIN_EMAIL || 'backen@gmail.com';
const PASS = process.env.TEST_ADMIN_PASSWORD || '123456';

const results = [];
function ok(name, detail) {
  results.push({ name, pass: true, detail: detail || '' });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name, detail) {
  results.push({ name, pass: false, detail: String(detail || '') });
  console.error(`FAIL  ${name} — ${detail}`);
}

async function req(method, urlPath, { token, body, expectStatus } = {}) {
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (expectStatus != null && res.status !== expectStatus) {
    const err = new Error(`${method} ${urlPath} => ${res.status} (want ${expectStatus}): ${typeof data === 'string' ? data.slice(0, 200) : JSON.stringify(data).slice(0, 200)}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return { status: res.status, data };
}

async function main() {
  console.log(`\n=== Permission smoke @ ${BASE} ===\n`);

  // 1. Login admin
  let token;
  try {
    const { data } = await req('POST', '/auth/login', {
      body: { email: EMAIL, password: PASS },
      expectStatus: 200,
    });
    token = data.token || data.access_token || data?.data?.token;
    if (!token) throw new Error('No token in login response');
    ok('Login admin', EMAIL);
  } catch (e) {
    fail('Login admin', e.message);
    printSummary();
    process.exit(1);
  }

  // 2. Catalog completeness
  try {
    const { data } = await req('GET', '/permissions/catalog', { token, expectStatus: 200 });
    const keys = (data.modules || []).map((m) => m.key);
    const need = ['crm', 'production', 'logistics', 'accounting', 'purchasing', 'calc', 'knowledge', 'congviec', 'drive', 'work', 'hr', 'reports', 'system', 'platform'];
    const missing = need.filter((k) => !keys.includes(k));
    if (missing.length) throw new Error(`Thiếu module: ${missing.join(', ')}`);

    const crm = data.modules.find((m) => m.key === 'crm');
    const crmFeats = (crm?.groups || []).flatMap((g) => g.features.map((f) => f.resource));
    const crmNeed = ['crm_events', 'crm_leaves', 'crm_messenger', 'crm_activity', 'crm_feed', 'crm_voice', 'crm_dept_plan', 'crm_lead_journey', 'crm_categories'];
    const crmMissing = crmNeed.filter((r) => !crmFeats.includes(r));
    if (crmMissing.length) throw new Error(`CRM thiếu feature: ${crmMissing.join(', ')}`);

    const vc = data.modules.find((m) => m.key === 'logistics');
    const vcFeats = (vc?.groups || []).flatMap((g) => g.features.map((f) => f.resource));
    if (!vcFeats.includes('vc_assignments')) throw new Error('Thiếu vc_assignments');

    const sx = data.modules.find((m) => m.key === 'production');
    const sxFeats = (sx?.groups || []).flatMap((g) => g.features.map((f) => f.resource));
    if (!sxFeats.includes('sx_approvals')) throw new Error('Thiếu sx_approvals');

    const ket = data.modules.find((m) => m.key === 'accounting');
    const ketFeats = (ket?.groups || []).flatMap((g) => g.features.map((f) => f.resource));
    if (!ketFeats.includes('ketoan_bank_accounts')) throw new Error('Thiếu ketoan_bank_accounts');

    ok('GET /permissions/catalog', `${keys.length} modules, CRM ${crmFeats.length} features`);
  } catch (e) {
    fail('GET /permissions/catalog', e.message);
  }

  // 3. Roles list + by-name
  let accountingRoleId = null;
  let staffRolePermCount = 0;
  try {
    const { data } = await req('GET', '/permissions/roles', { token, expectStatus: 200 });
    const roles = data.roles || [];
    if (!roles.length) throw new Error('Không có roles');
    const names = roles.map((r) => r.name);
    for (const n of ['admin', 'sales_admin', 'accounting', 'employee']) {
      if (!names.includes(n)) throw new Error(`Thiếu role ${n}`);
    }
    accountingRoleId = roles.find((r) => r.name === 'accounting')?.id;
    ok('GET /permissions/roles', `${roles.length} roles`);
  } catch (e) {
    fail('GET /permissions/roles', e.message);
  }

  try {
    const { data } = await req('GET', '/permissions/roles/by-name/staff', { token, expectStatus: 200 });
    staffRolePermCount = (data.permissions || []).length;
    if (!data.role) throw new Error('staff/employee template missing');
    ok('GET /roles/by-name/staff', `matched=${data.role.name}, perms=${staffRolePermCount}`);
  } catch (e) {
    fail('GET /roles/by-name/staff', e.message);
  }

  try {
    const { data } = await req('GET', '/permissions/roles/by-name/accounting', { token, expectStatus: 200 });
    const n = (data.permissions || []).length;
    if (!n) throw new Error('accounting template empty');
    ok('GET /roles/by-name/accounting', `${n} permissions`);
  } catch (e) {
    fail('GET /roles/by-name/accounting', e.message);
  }

  // 4. Find AI bot user + effective permissions
  let aiUserId = null;
  try {
    const { data } = await req('GET', '/users?search=ai-bot&limit=5', { token });
    const list = data.users || data || [];
    const arr = Array.isArray(list) ? list : [];
    const ai = arr.find((u) => String(u.email || '').includes('ai-bot')) || arr[0];
    if (!ai?.id) {
      // fallback: list first page
      const { data: d2 } = await req('GET', '/users?page=1&limit=20', { token, expectStatus: 200 });
      const users = d2.users || d2.data || d2 || [];
      const found = (Array.isArray(users) ? users : []).find((u) => String(u.email || '').includes('ai-bot'));
      if (!found) throw new Error('Không tìm thấy ai-bot user');
      aiUserId = found.id;
    } else {
      aiUserId = ai.id;
    }
    ok('Find AI Assistant user', aiUserId);
  } catch (e) {
    fail('Find AI Assistant user', e.message);
  }

  if (aiUserId) {
    try {
      const { data } = await req('GET', `/permissions/users/${aiUserId}/effective`, { token, expectStatus: 200 });
      const perms = data.permissions || data.effective || [];
      ok('GET effective permissions', `${Array.isArray(perms) ? perms.length : 'obj'} rows`);
    } catch (e) {
      fail('GET effective permissions', e.message);
    }

    // 5. Override grant/clear for a safe permission (personal_tasks:view)
    let permId = null;
    try {
      const { data: cat } = await req('GET', `/permissions/catalog?_ts=${Date.now()}`, { token, expectStatus: 200 });
      outer: for (const mod of cat.modules || []) {
        if (mod.displayMode === 'tiered') {
          for (const g of mod.groups || []) {
            for (const f of g.features || []) {
              if (f.resource === 'personal_tasks') {
                const lvl = (f.levels || []).find((l) => l.action === 'view');
                permId = lvl?.permission?.id;
                break outer;
              }
            }
          }
        }
      }
      if (!permId) throw new Error('Không tìm personal_tasks:view id');

      await req('PUT', `/permissions/users/${aiUserId}/overrides`, {
        token,
        body: { changes: [{ permission_id: permId, granted: true }] },
        expectStatus: 200,
      });
      ok('PUT override grant personal_tasks:view', permId);

      await req('PUT', `/permissions/users/${aiUserId}/overrides`, {
        token,
        body: { changes: [{ permission_id: permId, clear: true }] },
        expectStatus: 200,
      });
      ok('PUT override clear personal_tasks:view', 'cleared');
    } catch (e) {
      fail('Override grant/clear', e.message);
    }
  }

  // 6. Company modules chips
  try {
    const companyId = '29677f68-967e-4256-92fd-492bb580e888'; // Phúc Đạt
    const { data } = await req('GET', `/ecosystem/company-modules?company_id=${companyId}`, { token, expectStatus: 200 });
    const mods = (data.modules || []).map((m) => m.key);
    if (!mods.includes('crm') && !mods.includes('accounting')) {
      throw new Error(`Chips trống/không đủ: ${mods.join(',')}`);
    }
    const hasPurchasing = mods.includes('purchasing');
    ok('GET company-modules Phúc Đạt', `${mods.join(', ')}${hasPurchasing ? '' : ' (chưa có purchasing — có thể tenant flag)'}`);
  } catch (e) {
    fail('GET company-modules', e.message);
  }

  // 7. mua_hang enforce — admin should pass
  try {
    const { status } = await req('GET', '/purchasing/brands', { token });
    if (status === 200 || status === 403) {
      // 200 = has permission; 403 = enforce works but admin unexpectedly denied
      if (status === 200) ok('GET /purchasing/brands (admin)', '200 allowed');
      else fail('GET /purchasing/brands (admin)', '403 — admin bị chặn');
    } else {
      fail('GET /purchasing/brands (admin)', `status ${status}`);
    }
  } catch (e) {
    fail('GET /purchasing/brands (admin)', e.message);
  }

  // 8. RPC check endpoint if exists
  try {
    const { data: cat } = await req('GET', `/permissions/catalog?_ts=${Date.now() + 1}`, { token, expectStatus: 200 });
    let driveViewId = null;
    for (const mod of cat.modules || []) {
      if (mod.key !== 'drive') continue;
      for (const f of mod.features || []) {
        const p = (f.permissions || []).find((x) => x.action === 'view');
        if (p?.id) driveViewId = p.id;
      }
    }
    // Some deployments expose POST /permissions/check
    const checkRes = await req('POST', '/permissions/check', {
      token,
      body: { resource: 'drive', action: 'view' },
    });
    if (checkRes.status === 200) {
      ok('POST /permissions/check drive:view', JSON.stringify(checkRes.data).slice(0, 120));
    } else if (checkRes.status === 404) {
      ok('POST /permissions/check', 'endpoint không có (skip)');
    } else {
      fail('POST /permissions/check', `status ${checkRes.status}`);
    }
  } catch (e) {
    fail('POST /permissions/check', e.message);
  }

  printSummary();
  const failed = results.filter((r) => !r.pass).length;
  process.exit(failed ? 1 : 0);
}

function printSummary() {
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n=== SUMMARY: ${passed} pass / ${failed} fail / ${results.length} total ===\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
