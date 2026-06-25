/**
 * Tạo / cập nhật tài khoản admin hệ thống backen@gmail.com
 * Chạy: node scripts/create-backen-admin.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const EMAIL = 'backen@gmail.com';
const FULL_NAME = 'Khoa IT';
const DEFAULT_PASSWORD = 'admin123';

const ALL_PERMISSIONS = [
  'projects.view_all', 'projects.view_unit', 'projects.view_assigned', 'projects.create', 'projects.edit_all', 'projects.edit_assigned', 'projects.delete', 'projects.approve',
  'tasks.view_all', 'tasks.view_unit', 'tasks.view_assigned', 'tasks.create', 'tasks.edit_all', 'tasks.edit_assigned', 'tasks.delete', 'tasks.reassign',
  'customers.view_all', 'customers.view_unit', 'customers.create', 'customers.edit', 'customers.delete',
  'ecosystem.view', 'ecosystem.manage_unit', 'ecosystem.manage_children', 'ecosystem.manage_all', 'ecosystem.add_members', 'ecosystem.assign_roles',
  'workflows.view', 'workflows.create', 'workflows.edit', 'workflows.delete',
  'reports.view_all', 'reports.view_unit', 'reports.export', 'reports.finance',
  'settings.workflow', 'settings.templates', 'settings.users', 'settings.system',
];

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong backend/.env');
  }

  const hash = await bcrypt.hash(DEFAULT_PASSWORD, 12);
  const { data: existing } = await sb.from('users').select('id, email').eq('email', EMAIL).maybeSingle();

  const row = {
    email: EMAIL,
    password: hash,
    full_name: FULL_NAME,
    role: 'admin',
    position: 'Quản trị hệ thống',
    company_id: null,
    is_active: true,
  };

  let user;
  if (existing?.id) {
    const { data, error } = await sb
      .from('users')
      .update(row)
      .eq('id', existing.id)
      .select('id, email, full_name, role, company_id, is_active')
      .single();
    if (error) throw error;
    user = data;
    console.log('Đã cập nhật tài khoản có sẵn');
  } else {
    const { data, error } = await sb
      .from('users')
      .insert(row)
      .select('id, email, full_name, role, company_id, is_active')
      .single();
    if (error) throw error;
    user = data;
    console.log('Đã tạo tài khoản mới');
  }

  for (const permission of ALL_PERMISSIONS) {
    const { data: dup } = await sb
      .from('user_permission_overrides')
      .select('id')
      .eq('user_id', user.id)
      .eq('permission', permission)
      .is('unit_id', null)
      .maybeSingle();

    const payload = {
      user_id: user.id,
      permission,
      is_allowed: true,
      reason: 'Admin hệ thống — full access',
      granted_at: new Date().toISOString(),
    };

    if (dup?.id) {
      const { error } = await sb.from('user_permission_overrides').update(payload).eq('id', dup.id);
      if (error) throw error;
    } else {
      const { error } = await sb.from('user_permission_overrides').insert(payload);
      if (error) throw error;
    }
  }

  const { count } = await sb
    .from('user_permission_overrides')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_allowed', true);

  console.log('Email:', user.email);
  console.log('Họ tên:', user.full_name);
  console.log('Role:', user.role, '(admin hệ thống — không gắn công ty)');
  console.log('Quyền override:', count);
  console.log('Mật khẩu mặc định:', DEFAULT_PASSWORD);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
