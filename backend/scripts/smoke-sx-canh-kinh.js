/**
 * Smoke test: SX Kanban HCB Cánh kính cho production_admin (tuvan2).
 * Chạy: node backend/scripts/smoke-sx-canh-kinh.js
 * (Backend phải đang chạy localhost:4000)
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const http = require('http');

const HCB = '18c2563f-3495-498d-8199-23200c9f420e';
const CANH_KINH = '710708fc-ac0c-41ca-a397-e5ed393d1b1a';
const TEST_EMAIL = 'tuvan2.vanphuthanh@gmail.com';

async function main() {
  const { supabase } = require('../src/config/supabase');
  const { buildAuthSessionForUser } = require('../src/helpers/authSession');

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', TEST_EMAIL)
    .maybeSingle();
  if (error || !user) {
    console.error('User not found:', error?.message || TEST_EMAIL);
    process.exit(1);
  }

  const { token } = await buildAuthSessionForUser(user, { sessionId: 'smoke-test' });
  const headers = { Authorization: `Bearer ${token}`, 'x-no-cache': '1' };

  const get = (path) => new Promise((resolve, reject) => {
    const req = http.get(
      { hostname: 'localhost', port: 4000, path, headers },
      (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(body || '{}') });
          } catch {
            resolve({ status: res.statusCode, raw: body.slice(0, 200) });
          }
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(30_000, () => { req.destroy(new Error('timeout')); });
  });

  const q = `company_id=${HCB}&workshop_type_id=${CANH_KINH}&limit=10`;
  const [me, projects, pipeline, stages] = await Promise.all([
    get('/api/auth/me'),
    get(`/api/production/projects?${q}`),
    get(`/api/production/pipeline-stages?company_id=${HCB}&workshop_type_id=${CANH_KINH}`),
    get(`/api/production/dashboard?company_id=${HCB}&workshop_type_id=${CANH_KINH}`),
  ]);

  console.log('--- User /auth/me ---');
  console.log('  company_id:', me.data?.user?.company_id || '(null)');
  console.log('  role:', me.data?.user?.role);

  console.log('--- GET /production/projects ---');
  console.log('  status:', projects.status);
  console.log('  total:', projects.data?.total);
  console.log('  returned:', projects.data?.projects?.length ?? 0);
  const sample = projects.data?.projects?.[0];
  if (sample) {
    console.log('  sample:', sample.code, '| sx_col:', sample.sx_kanban_column_id || '(none)');
  }

  console.log('--- GET /production/pipeline-stages ---');
  console.log('  status:', pipeline.status);
  const cols = Array.isArray(pipeline.data) ? pipeline.data : [];
  console.log('  columns:', cols.length, cols[0]?.name ? `(first: ${cols[0].name})` : '');

  console.log('--- GET /production/dashboard ---');
  console.log('  status:', stages.status);
  console.log('  kpis.total_projects:', stages.data?.kpis?.total_projects);
  console.log('  pipeline cols:', stages.data?.pipeline?.length ?? 0);

  const ok =
    projects.status === 200
    && (projects.data?.total ?? 0) > 0
    && cols.length > 0
    && (stages.data?.kpis?.total_projects ?? 0) > 0;

  if (ok) {
    console.log('\n✓ PASS — Cánh kính HCB có dữ liệu hiển thị được.');
    process.exit(0);
  }
  console.log('\n✗ FAIL — kiểm tra lại scope / pipeline.');
  process.exit(1);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
