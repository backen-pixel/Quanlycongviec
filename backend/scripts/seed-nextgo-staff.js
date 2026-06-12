/**
 * Tạo nhân viên NextGo: Marketing (2 NV) + Admin Sản xuất (1).
 * Chạy: node scripts/seed-nextgo-staff.js
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const DEFAULT_PASSWORD = 'tubep123';
const EMAIL_DOMAIN = 'nextgo.vn';

const STAFF = [
  { full_name: 'Biện Anh Pháp', role: 'staff', position: 'NV Marketing', deptKey: 'marketing' },
  { full_name: 'Trần thị ngọc Hân', role: 'staff', position: 'NV Marketing', deptKey: 'marketing' },
  { full_name: 'Hải Hiền', role: 'production_admin', position: 'Admin Sản xuất', deptKey: 'production' },
];

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function removeDiacritics(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd');
}

/** Họ tên → email @nextgo.vn (bien.anh.phap@...) */
function emailFromFullName(fullName) {
  const slug = removeDiacritics(fullName)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join('.');
  return `${slug}@${EMAIL_DOMAIN}`;
}

async function findNextGo() {
  const { data, error } = await sb.from('companies').select('id, name, short_name');
  if (error) throw error;
  return (data || []).find(
    (c) => /nextgo/i.test(c.name || '') || /nextgo/i.test(c.short_name || ''),
  );
}

async function upsertDepartment(companyId, { slug, name, color }) {
  const { data: existing } = await sb
    .from('departments')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (existing?.id) {
    const { data, error } = await sb
      .from('departments')
      .update({ name, company_id: companyId, color, is_active: true, description: `${name} — NextGo [seed-338]` })
      .eq('id', existing.id)
      .select('id, name, slug')
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await sb
    .from('departments')
    .insert({
      name,
      slug,
      color,
      company_id: companyId,
      is_active: true,
      description: `${name} — NextGo [seed-338]`,
    })
    .select('id, name, slug')
    .single();
  if (error) throw error;
  return data;
}

async function upsertUser({ email, full_name, role, position, company_id, department_id, passwordHash }) {
  const { data: existing } = await sb.from('users').select('id, email').eq('email', email).maybeSingle();
  const row = {
    email,
    password: passwordHash,
    full_name,
    role,
    position,
    company_id,
    department_id,
    is_active: true,
  };

  if (existing?.id) {
    const { data, error } = await sb.from('users').update(row).eq('id', existing.id).select('id, email, full_name, role, position').single();
    if (error) throw error;
    return { ...data, created: false };
  }

  const { data, error } = await sb.from('users').insert(row).select('id, email, full_name, role, position').single();
  if (error) throw error;
  return { ...data, created: true };
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong backend/.env');
  }

  const company = await findNextGo();
  if (!company) throw new Error('Không tìm thấy công ty NextGo');

  const deptMarketing = await upsertDepartment(company.id, {
    slug: 'nextgo-marketing',
    name: 'Marketing',
    color: '#8B5CF6',
  });
  const deptProduction = await upsertDepartment(company.id, {
    slug: 'nextgo-production',
    name: 'Sản xuất',
    color: '#EA580C',
  });

  const deptByKey = {
    marketing: deptMarketing.id,
    production: deptProduction.id,
  };

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);
  const results = [];

  for (const s of STAFF) {
    const email = emailFromFullName(s.full_name);
    const user = await upsertUser({
      email,
      full_name: s.full_name,
      role: s.role,
      position: s.position,
      company_id: company.id,
      department_id: deptByKey[s.deptKey],
      passwordHash,
    });
    results.push({ ...user, email, dept: s.deptKey });
  }

  console.log('Công ty:', company.name, company.id);
  console.log('Phòng ban:', deptMarketing.slug, deptProduction.slug);
  console.log('Mật khẩu mặc định:', DEFAULT_PASSWORD);
  console.log('Nhân viên:');
  for (const u of results) {
    console.log(`  ${u.created ? '+' : '~'} ${u.full_name} <${u.email}> — ${u.role} / ${u.position}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
