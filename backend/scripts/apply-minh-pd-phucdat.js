/**
 * Gắn minh@pd.com — CRM + Sản xuất công ty Phúc Đạt
 * node scripts/apply-minh-pd-phucdat.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { supabase } = require('../src/config/supabase');

async function main() {
  const email = 'minh@pd.com';

  const { data: company, error: coErr } = await supabase
    .from('companies')
    .select('id, name')
    .or('name.ilike.%Phúc Đạt%,name.ilike.%Phuc Dat%')
    .order('name')
    .limit(1)
    .maybeSingle();
  if (coErr) throw coErr;
  if (!company?.id) throw new Error('Không tìm thấy công ty Phúc Đạt');

  const { data: dept } = await supabase
    .from('departments')
    .select('id, name')
    .eq('company_id', company.id)
    .ilike('name', '%sản xuất%')
    .order('name')
    .limit(1)
    .maybeSingle();

  const { data: user, error: uErr } = await supabase
    .from('users')
    .select('id, email, full_name, role, company_id')
    .ilike('email', email)
    .maybeSingle();
  if (uErr) throw uErr;
  if (!user?.id) throw new Error(`Không tìm thấy user ${email}`);

  const { error: updErr } = await supabase
    .from('users')
    .update({
      role: 'crm_production_staff',
      company_id: company.id,
      department_id: dept?.id || null,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);
  if (updErr) throw updErr;

  await supabase.from('user_companies').delete().eq('user_id', user.id).neq('company_id', company.id);
  const { error: ucErr } = await supabase.from('user_companies').upsert(
    { user_id: user.id, company_id: company.id, is_primary: true },
    { onConflict: 'user_id,company_id' },
  );
  if (ucErr) throw ucErr;

  const { data: roleRow } = await supabase.from('roles').select('id').eq('name', 'crm_production_staff').maybeSingle();
  if (roleRow?.id) {
    const { data: oldRoles } = await supabase
      .from('user_roles')
      .select('id, role_id, roles(name)')
      .eq('user_id', user.id);
    const removeIds = (oldRoles || [])
      .filter((r) => ['crm_production_admin', 'production_admin', 'production_staff', 'staff', 'sales_admin'].includes(r.roles?.name))
      .map((r) => r.id);
    if (removeIds.length) {
      await supabase.from('user_roles').delete().in('id', removeIds);
    }

    const { data: existing } = await supabase
      .from('user_roles')
      .select('id')
      .eq('user_id', user.id)
      .eq('role_id', roleRow.id)
      .is('ecosystem_unit_id', null)
      .limit(1);
    if (!existing?.length) {
      await supabase.from('user_roles').insert({
        user_id: user.id,
        role_id: roleRow.id,
        ecosystem_unit_id: null,
        granted_at: new Date().toISOString(),
      });
    }

    const { data: ecoUnit } = await supabase
      .from('ecosystem_units')
      .select('id, name')
      .or('name.ilike.%Phúc Đạt%,name.ilike.%Phuc Dat%')
      .order('name')
      .limit(1)
      .maybeSingle();
    if (ecoUnit?.id) {
      const { data: scoped } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_id', user.id)
        .eq('role_id', roleRow.id)
        .eq('ecosystem_unit_id', ecoUnit.id)
        .limit(1);
      if (!scoped?.length) {
        await supabase.from('user_roles').insert({
          user_id: user.id,
          role_id: roleRow.id,
          ecosystem_unit_id: ecoUnit.id,
          granted_at: new Date().toISOString(),
        });
      }
    }
  }

  const { error: phErr } = await supabase.from('production_handover_settings').upsert(
    {
      production_company_id: company.id,
      responsible_user_id: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'production_company_id' },
  );
  if (phErr) throw phErr;

  const { data: verify } = await supabase
    .from('users')
    .select('id, email, full_name, role, company_id, company:companies(id, name), department:departments(name)')
    .eq('id', user.id)
    .single();

  console.log('OK minh@pd.com →', {
    user: verify?.full_name,
    role: verify?.role,
    company: verify?.company?.name,
    department: verify?.department?.name,
  });
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
