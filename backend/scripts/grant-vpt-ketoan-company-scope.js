/**
 * Gán kế toán VPT: staff công ty — deal/SX theo tab Thành viên; BG/ĐH/HĐ toàn công ty.
 * Chạy: node scripts/grant-vpt-ketoan-company-scope.js
 * Xem trước: node scripts/grant-vpt-ketoan-company-scope.js --dry-run
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const EMAILS = [
  'ketoanvanphuthanh.vpt@gmail.com',
  'ketoan1@vpt.vn',
];

const dryRun = process.argv.includes('--dry-run');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function findVptCompanyId() {
  const { data, error } = await sb
    .from('companies')
    .select('id, name')
    .or('name.ilike.%Bếp Vạn Phú%,name.ilike.%Vạn Phú%Thành%,name.ilike.%Van Phu%Thanh%,short_name.ilike.%VPT%')
    .order('name')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error('Không tìm thấy công ty Bếp Vạn Phú Thành');
  return data;
}

async function applyForUser(email, companyId) {
  const { data: user, error: uErr } = await sb
    .from('users')
    .select('id, email, full_name, role, company_id')
    .ilike('email', email)
    .maybeSingle();
  if (uErr) throw uErr;
  if (!user?.id) throw new Error(`Không tìm thấy user ${email}`);

  console.log(`\n→ ${user.email} (${user.full_name || '—'})`);
  console.log(`  Trước: role=${user.role}, company_id=${user.company_id || 'null'}`);

  if (dryRun) {
    console.log(`  [dry-run] Sẽ gán staff công ty VPT (${companyId})`);
    return;
  }

  const { error: updErr } = await sb
    .from('users')
    .update({
      role: 'staff',
      company_id: companyId,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);
  if (updErr) throw updErr;

  await sb.from('user_company_regions').delete().eq('user_id', user.id);
  await sb.from('user_companies').delete().eq('user_id', user.id).neq('company_id', companyId);

  const { error: ucErr } = await sb
    .from('user_companies')
    .upsert(
      { user_id: user.id, company_id: companyId, is_primary: true },
      { onConflict: 'user_id,company_id' },
    );
  if (ucErr) throw ucErr;

  console.log(`  Sau: role=staff, company_id=${companyId}`);
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong backend/.env');
  }

  const company = await findVptCompanyId();
  console.log(`Công ty: ${company.name} (${company.id})`);
  if (dryRun) console.log('(chế độ dry-run — không ghi DB)');

  for (const email of EMAILS) {
    await applyForUser(email, company.id);
  }

  console.log('\nXong. Hai tài khoản cần đăng xuất và đăng nhập lại.');
  console.log('Deal/SX: chỉ các deal được thêm vào tab Thành viên.');
  console.log('BG/ĐH/HĐ: toàn bộ công ty VPT.');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
