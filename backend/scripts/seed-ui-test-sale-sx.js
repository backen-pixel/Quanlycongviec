/**
 * Tạo 2 tài khoản test UI cho công ty NextGo:
 *  - Sale:            saletest.ui@nextgo.vn      (role sales_admin — thao tác CRM)
 *  - NV Sản xuất:     sanxuattest.ui@nextgo.vn   (role production_staff — thao tác SX)
 * Mật khẩu chung: UiTest@2026
 * Chạy: node scripts/seed-ui-test-sale-sx.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const PASSWORD = 'UiTest@2026';
const NEXTGO_ID = '87479a83-1145-43b7-b090-3e40812cb5a9';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const USERS = [
  {
    email: 'saletest.ui@nextgo.vn',
    full_name: 'Sale Test UI',
    role: 'sales_admin',
    position: 'NV Kinh doanh (test UI)',
    deptSlug: 'nextgo-marketing',
  },
  {
    email: 'sanxuattest.ui@nextgo.vn',
    full_name: 'Sản Xuất Test UI',
    role: 'production_staff',
    position: 'NV Sản xuất (test UI)',
    deptSlug: 'nextgo-production',
  },
];

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong backend/.env');
  }
  const hash = await bcrypt.hash(PASSWORD, 12);

  for (const u of USERS) {
    const { data: dept } = await sb
      .from('departments')
      .select('id')
      .eq('slug', u.deptSlug)
      .maybeSingle();

    const row = {
      email: u.email,
      password: hash,
      full_name: u.full_name,
      role: u.role,
      position: u.position,
      company_id: NEXTGO_ID,
      department_id: dept?.id || null,
      is_active: true,
    };

    const { data: existing } = await sb.from('users').select('id').eq('email', u.email).maybeSingle();
    let res;
    if (existing?.id) {
      res = await sb.from('users').update(row).eq('id', existing.id).select('id, email, role').single();
    } else {
      res = await sb.from('users').insert(row).select('id, email, role').single();
    }
    if (res.error) throw res.error;
    console.log(`${existing ? '~' : '+'} ${res.data.email} — ${res.data.role} (id=${res.data.id})`);
  }
  console.log('Mật khẩu:', PASSWORD);
}

main().catch((e) => { console.error(e); process.exit(1); });
