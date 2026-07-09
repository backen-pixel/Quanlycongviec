/**
 * 1. backen@gmail.com → admin hệ thống (role admin, không company/tenant)
 * 2. Tạo / cập nhật tài khoản platform_admin riêng
 *
 * Chạy: node scripts/setup-platform-and-system-admin.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const SYSTEM_ADMIN = {
  email: 'backen@gmail.com',
  full_name: 'Khoa IT',
  role: 'admin',
  position: 'Quản trị hệ thống',
  company_id: null,
  tenant_id: null,
};

const PLATFORM_ADMIN = {
  email: 'platform@vanphuthanh.net',
  full_name: 'Quản trị nền tảng',
  role: 'platform_admin',
  position: 'Platform Admin',
  company_id: null,
  tenant_id: null,
};

const DEFAULT_PASSWORD = 'admin123';

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function upsertUser(spec, password) {
  const hash = await bcrypt.hash(password, 12);
  const { data: existing } = await sb.from('users').select('id, email, role').eq('email', spec.email).maybeSingle();

  const row = {
    email: spec.email,
    password: hash,
    full_name: spec.full_name,
    role: spec.role,
    position: spec.position,
    company_id: spec.company_id,
    tenant_id: spec.tenant_id,
    is_active: true,
  };

  if (existing?.id) {
    const { data, error } = await sb
      .from('users')
      .update(row)
      .eq('id', existing.id)
      .select('id, email, full_name, role, company_id, tenant_id, is_active')
      .single();
    if (error) throw error;
    console.log(`✅ Cập nhật: ${spec.email} (${existing.role} → ${data.role})`);
    return data;
  }

  const { data, error } = await sb
    .from('users')
    .insert(row)
    .select('id, email, full_name, role, company_id, tenant_id, is_active')
    .single();
  if (error) throw error;
  console.log(`✅ Tạo mới: ${spec.email} (${data.role})`);
  return data;
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong backend/.env');
  }

  console.log('--- Admin hệ thống ---');
  const systemUser = await upsertUser(SYSTEM_ADMIN, DEFAULT_PASSWORD);
  console.log(JSON.stringify(systemUser, null, 2));

  console.log('\n--- Platform admin ---');
  const platformUser = await upsertUser(PLATFORM_ADMIN, DEFAULT_PASSWORD);
  console.log(JSON.stringify(platformUser, null, 2));

  console.log('\nMật khẩu mặc định cả hai tài khoản:', DEFAULT_PASSWORD);
  console.log('Đăng xuất và đăng nhập lại để JWT cập nhật role.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
