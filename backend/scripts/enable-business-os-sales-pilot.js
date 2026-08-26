/**
 * Bật/tắt đúng một company cho pilot Lead → Qualification → Deal.
 *
 * Bật:
 *   node scripts/enable-business-os-sales-pilot.js --company-id <uuid>
 * Bật toàn bộ workspace theo gateway mode:
 *   node scripts/enable-business-os-sales-pilot.js --company-id <uuid> --all-modules
 * Tắt:
 *   node scripts/enable-business-os-sales-pilot.js --disable
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { supabase } = require('../src/config/supabase');
const { SALES_PILOT_SETTING_KEY } = require('../src/helpers/salesQualificationPilot');

function argValue(name) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : null;
}

async function run() {
  const disable = process.argv.includes('--disable');
  const allModules = process.argv.includes('--all-modules');
  const companyId = String(argValue('--company-id') || '').trim();

  if (!disable && !/^[0-9a-f-]{36}$/i.test(companyId)) {
    throw new Error('Cần --company-id là UUID hợp lệ, hoặc dùng --disable.');
  }

  let company = null;
  if (!disable) {
    const { data, error } = await supabase
      .from('companies')
      .select('id, name, short_name, is_active')
      .eq('id', companyId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Không tìm thấy công ty.');
    if (data.is_active === false) throw new Error('Không bật pilot cho công ty đã ngưng hoạt động.');
    company = data;
  }

  const value = disable
    ? { enabled: false, company_id: null, mode: 'enforce', workspace_mode: 'sales_only', updated_at: new Date().toISOString() }
    : {
      enabled: true,
      company_id: company.id,
      company_name: company.name,
      mode: 'enforce',
      workspace_mode: allModules ? 'all_modules_gateway' : 'sales_only',
      process_key: 'sales_lead_qualification_v1',
      updated_at: new Date().toISOString(),
    };

  const { error } = await supabase.from('app_settings').upsert({
    key: SALES_PILOT_SETTING_KEY,
    value,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' });
  if (error) throw error;

  console.log(JSON.stringify({
    ok: true,
    enabled: value.enabled,
    company_id: value.company_id,
    company_name: company?.name || null,
    workspace_mode: value.workspace_mode,
    setting_key: SALES_PILOT_SETTING_KEY,
  }, null, 2));
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
