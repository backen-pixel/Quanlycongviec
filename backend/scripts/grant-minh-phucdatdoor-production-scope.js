/**
 * Cấp quyền xem deal SX thuộc công ty CRM Vạn Phú Thành cho minh.phucdatdoor@gmail.com
 * Chạy: node scripts/grant-minh-phucdatdoor-production-scope.js
 * Xem trước: node scripts/grant-minh-phucdatdoor-production-scope.js --dry-run
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const EMAIL = 'minh.phucdatdoor@gmail.com';
const dryRun = process.argv.includes('--dry-run');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function findVptCompany() {
  const { data, error } = await sb
    .from('companies')
    .select('id, name')
    .or('name.ilike.%Bếp Vạn Phú%,name.ilike.%Vạn Phú%Thành%,name.ilike.%Van Phu%Thanh%,short_name.ilike.%VPT%')
    .order('name')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error('Không tìm thấy công ty Vạn Phú Thành');
  return data;
}

async function findPhucDatCompanyId() {
  const { data, error } = await sb
    .from('companies')
    .select('id')
    .or('name.ilike.%Phúc Đạt%,name.ilike.%Phuc Dat%')
    .order('name')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.id || null;
}

async function findSalesDept(companyId) {
  const { data, error } = await sb
    .from('departments')
    .select('id, name')
    .eq('company_id', companyId)
    .ilike('name', '%kinh doanh%')
    .order('name')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong backend/.env');
  }

  const company = await findVptCompany();
  const pdId = await findPhucDatCompanyId();
  const dept = await findSalesDept(company.id);

  const { data: user, error: uErr } = await sb
    .from('users')
    .select('id, email, full_name, role, company_id, department_id')
    .ilike('email', EMAIL)
    .maybeSingle();
  if (uErr) throw uErr;
  if (!user?.id) throw new Error(`Không tìm thấy user ${EMAIL}`);

  console.log(`Công ty: ${company.name} (${company.id})`);
  console.log(`User: ${user.email} — ${user.full_name || '—'}`);
  console.log(`Trước: role=${user.role}, company_id=${user.company_id || 'null'}`);
  if (dryRun) console.log('(dry-run — không ghi DB)');

  const { data: deals, error: dErr } = await sb
    .from('crm_leads')
    .select('id, code')
    .eq('type', 'deal')
    .not('project_id', 'is', null)
    .or(`company_id.eq.${company.id},external_company_id.eq.${company.id}`);
  if (dErr) throw dErr;

  console.log(`Deal VPT có project: ${(deals || []).length}`);

  if (dryRun) return;

  const { error: updErr } = await sb
    .from('users')
    .update({
      company_id: company.id,
      department_id: dept?.id || user.department_id,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);
  if (updErr) throw updErr;

  await sb.from('user_company_regions').delete().eq('user_id', user.id);
  await sb.from('user_companies').delete().eq('user_id', user.id).neq('company_id', company.id);

  const { error: ucErr } = await sb
    .from('user_companies')
    .upsert(
      { user_id: user.id, company_id: company.id, is_primary: true },
      { onConflict: 'user_id,company_id' },
    );
  if (ucErr) throw ucErr;

  if (pdId) {
    const { data: pdDeals } = await sb
      .from('crm_leads')
      .select('id')
      .eq('type', 'deal')
      .or(`company_id.eq.${pdId},external_company_id.eq.${pdId}`);
    const pdLeadIds = (pdDeals || []).map((d) => d.id).filter(Boolean);
    if (pdLeadIds.length) {
      const { error: delErr } = await sb
        .from('lead_members')
        .delete()
        .eq('user_id', user.id)
        .in('lead_id', pdLeadIds);
      if (delErr) throw delErr;
      console.log(`Gỡ lead_members deal Phúc Đạt: ${pdLeadIds.length} deal`);
    }
  }

  const memberRows = (deals || []).map((d) => ({
    lead_id: d.id,
    user_id: user.id,
    role: 'member',
  }));
  if (memberRows.length) {
    const { error: lmErr } = await sb
      .from('lead_members')
      .upsert(memberRows, { onConflict: 'lead_id,user_id', ignoreDuplicates: true });
    if (lmErr) throw lmErr;
  }

  const { data: workshops } = await sb
    .from('companies')
    .select('id, name, short_name')
    .or('short_name.ilike.HCB,name.ilike.%hucabi%,name.ilike.%metalla%');
  for (const w of workshops || []) {
    const { error: pwcErr } = await sb
      .from('production_workshop_client_companies')
      .upsert(
        { production_company_id: w.id, client_company_id: company.id, is_active: true },
        { onConflict: 'production_company_id,client_company_id' },
      );
    if (pwcErr && !String(pwcErr.message).includes('production_workshop_client_companies')) {
      console.warn(`  workshop link ${w.name}:`, pwcErr.message);
    }
  }

  console.log(`Sau: company_id=${company.id}, lead_members VPT=${memberRows.length}`);
  console.log('Đăng xuất và đăng nhập lại. SX: chip VPT + HCB/Metalla — deal CRM Vạn Phú Thành chuyển qua.');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
