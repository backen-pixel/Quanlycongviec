/**
 * So sánh tổng Lead CRM giữa các nguồn (web vs app).
 * Usage: node backend/scripts/compare-lead-totals.js [--from YYYY-MM-DD] [--to YYYY-MM-DD]
 */
require('dotenv').config();
const axios = require('axios');
const jwt = require('jsonwebtoken');

const BASE = (process.env.CHECK_API_URL || 'http://localhost:4000').replace(/\/$/, '');

function monthRange() {
  const now = new Date();
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const to = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
  return { from, to };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { ...monthRange(), companyId: '', regionId: '' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from') out.from = args[++i];
    else if (args[i] === '--to') out.to = args[++i];
    else if (args[i] === '--company') out.companyId = args[++i];
    else if (args[i] === '--region') out.regionId = args[++i];
  }
  return out;
}

async function getToken() {
  if (process.env.UPLOAD_AUTH_TOKEN || process.env.ADMIN_AUTH_TOKEN) {
    return process.env.UPLOAD_AUTH_TOKEN || process.env.ADMIN_AUTH_TOKEN;
  }
  const { supabase } = require('../src/config/supabase');
  const { data: user } = await supabase
    .from('users')
    .select('id, email, role, full_name, company_id, department_id')
    .eq('role', 'admin')
    .neq('is_active', false)
    .order('email')
    .limit(1)
    .maybeSingle();
  if (!user || !process.env.JWT_SECRET) throw new Error('Need admin user + JWT_SECRET');
  return jwt.sign({
    userId: user.id,
    email: user.email,
    role: user.role,
    fullName: user.full_name,
    company_id: user.company_id || null,
    department_id: user.department_id || null,
    crm_region_ids: [],
  }, process.env.JWT_SECRET);
}

async function apiGet(token, path, params = {}) {
  const { data } = await axios.get(`${BASE}/api${path}`, {
    params,
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}

async function main() {
  const { from, to, companyId, regionId } = parseArgs();
  const token = await getToken();
  const common = {
    type: 'lead',
    date_from: from,
    date_to: to,
    limit: 1,
    offset: 0,
    ...(companyId ? { company_id: companyId } : {}),
    ...(regionId ? { region_id: regionId } : {}),
  };

  const [
    orgReport,
    leadsAll,
    leadsHasPhone,
    stageCountsHasPhone,
    stageCountsNoPhone,
  ] = await Promise.all([
    apiGet(token, '/crm/reports/org-overview', {
      date_from: from,
      date_to: to,
      type: 'lead',
      ...(companyId ? { company_id: companyId } : {}),
      ...(regionId ? { region_id: regionId } : {}),
    }),
    apiGet(token, '/crm/leads', { ...common }),
    apiGet(token, '/crm/leads', { ...common, phone_filter: 'has_phone' }),
    apiGet(token, '/crm/stage-counts', {
      type: 'lead',
      date_from: from,
      date_to: to,
      phone_filter: 'has_phone',
      lite: '1',
      ...(companyId ? { company_id: companyId } : {}),
      ...(regionId ? { region_id: regionId } : {}),
    }),
    apiGet(token, '/crm/stage-counts', {
      type: 'lead',
      date_from: from,
      date_to: to,
      lite: '1',
      ...(companyId ? { company_id: companyId } : {}),
      ...(regionId ? { region_id: regionId } : {}),
    }),
  ]);

  const sumCounts = (counts) => Object.entries(counts || {})
    .reduce((s, [k, v]) => s + (k === '__none__' ? 0 : Number(v) || 0), 0);

  const rows = [
    ['BC org-overview (app Báo cáo)', orgReport?.summary?.lead_count ?? null],
    ['CRM /leads total (web Kanban KPI)', leadsAll?.total ?? null],
    ['CRM /leads has_phone', leadsHasPhone?.total ?? null],
    ['CRM stage-counts total has_phone (app Hub)', stageCountsHasPhone?.total ?? null],
    ['CRM stage-counts total no phone filter', stageCountsNoPhone?.total ?? null],
    ['Sum stage-counts keys (excl __none__) has_phone', sumCounts(stageCountsHasPhone?.counts)],
    ['Orphan __none__ count has_phone', stageCountsHasPhone?.counts?.__none__ ?? 0],
  ];

  console.log(`Kỳ: ${from} → ${to}`);
  if (companyId) console.log(`Công ty: ${companyId}`);
  if (regionId) console.log(`Khu vực: ${regionId}`);
  console.log('');
  for (const [label, val] of rows) {
    console.log(`${label}: ${val}`);
  }

  const webLike = leadsAll?.total;
  const appHub = stageCountsHasPhone?.total;
  const appReport = orgReport?.summary?.lead_count;
  console.log('');
  if (webLike != null && appHub != null) {
    console.log(`Chênh web Kanban (${webLike}) vs app Hub (${appHub}): ${webLike - appHub}`);
  }
  if (webLike != null && appReport != null) {
    console.log(`Chênh web Kanban (${webLike}) vs app Báo cáo (${appReport}): ${webLike - appReport}`);
  }
}

main().catch((e) => {
  console.error('ERR:', e.response?.data?.error || e.message);
  process.exit(1);
});
