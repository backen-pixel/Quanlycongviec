/**
 * Chuẩn bị dữ liệu nền tối thiểu cho company chạy pilot Sales Business OS.
 * Hiện tại chỉ bảo đảm có một CRM region hoạt động.
 * Chỉ gán đúng một user khi truyền rõ `--assign-user <uuid>`.
 *
 * Chạy:
 *   node scripts/prepare-business-os-sales-pilot-company.js --company-id <uuid>
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { supabase } = require('../src/config/supabase');

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function run() {
  const companyId = String(argValue('--company-id') || '').trim();
  const assignUserId = String(argValue('--assign-user') || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(companyId)) {
    throw new Error('Cần --company-id là UUID hợp lệ.');
  }
  if (assignUserId && !/^[0-9a-f-]{36}$/i.test(assignUserId)) {
    throw new Error('--assign-user phải là UUID hợp lệ.');
  }

  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('id, name, short_name, is_active')
    .eq('id', companyId)
    .maybeSingle();
  if (companyError) throw companyError;
  if (!company) throw new Error('Không tìm thấy công ty.');
  if (company.is_active === false) throw new Error('Công ty đang ngưng hoạt động.');

  const { data: existingRegions, error: regionReadError } = await supabase
    .from('company_regions')
    .select('id, name, code, is_active, order_index')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('order_index')
    .limit(1);
  if (regionReadError) throw regionReadError;

  let region = existingRegions?.[0] || null;
  let regionCreated = false;
  if (!region) {
    const { data, error } = await supabase
      .from('company_regions')
      .insert({
        company_id: companyId,
        name: 'Mặc định',
        code: 'DEFAULT',
        order_index: 0,
        is_active: true,
      })
      .select('id, name, code, is_active, order_index')
      .single();
    if (error) throw error;
    region = data;
    regionCreated = true;
  }

  let assignedUser = null;
  if (assignUserId) {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, full_name, company_id, is_active')
      .eq('id', assignUserId)
      .maybeSingle();
    if (userError) throw userError;
    if (!user || String(user.company_id || '') !== companyId || user.is_active === false) {
      throw new Error('User cần gán phải đang hoạt động và thuộc đúng công ty.');
    }
    const { error: membershipError } = await supabase
      .from('user_company_regions')
      .upsert({ user_id: user.id, region_id: region.id }, { onConflict: 'user_id,region_id' });
    if (membershipError) throw membershipError;
    assignedUser = { id: user.id, full_name: user.full_name };
  }

  console.log(JSON.stringify({
    ok: true,
    company: { id: company.id, name: company.name },
    region: { id: region.id, name: region.name, code: region.code },
    region_created: regionCreated,
    assigned_user: assignedUser,
  }, null, 2));
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
