/**
 * Freeze / unfreeze công ty NextGo trên hệ NGUỒN.
 * MẶC ĐỊNH dry-run. Chỉ áp khi anh ra lệnh cắt:
 *
 *   NEXTGO_CUTOVER=YES node scripts/freeze-nextgo-source.js --apply
 *   NEXTGO_CUTOVER=YES node scripts/freeze-nextgo-source.js --unfreeze --apply
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const { SOURCE_COMPANY_ID } = require('./lib/nextgoInstanceSpec');

const APPLY = process.argv.includes('--apply') && process.env.NEXTGO_CUTOVER === 'YES';
const UNFREEZE = process.argv.includes('--unfreeze');

async function main() {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.from('companies')
    .select('id, name, is_active')
    .eq('id', SOURCE_COMPANY_ID)
    .maybeSingle();
  if (error || !data) throw new Error(error?.message || 'Không thấy NextGo nguồn');
  const next = !UNFREEZE ? false : true;
  console.log('Hiện tại:', data.name, 'is_active=', data.is_active, '→', next);
  if (!APPLY) {
    console.log('Dry-run. Khi anh bảo chuyển: NEXTGO_CUTOVER=YES node scripts/freeze-nextgo-source.js --apply');
    return;
  }
  const { error: upd } = await sb.from('companies').update({ is_active: next }).eq('id', SOURCE_COMPANY_ID);
  if (upd) throw upd;
  console.log('Đã cập nhật is_active=', next);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
