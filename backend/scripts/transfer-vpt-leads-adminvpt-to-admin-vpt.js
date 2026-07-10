/**
 * Chuyển lead từ adminvpt@gmail.com sang admin.vpt@vanphuthanh.vn
 * Chạy: node scripts/transfer-vpt-leads-adminvpt-to-admin-vpt.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const SOURCE = '93a441a3-4a5a-4547-98dd-b399050f824a'; // adminvpt@gmail.com
const TARGET = '49fcd3ff-0d7c-4d54-8f5a-1068bd10d68c'; // admin.vpt@vanphuthanh.vn

async function main() {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { count: beforeCount, error: countErr } = await sb
    .from('crm_leads')
    .select('id', { count: 'exact', head: true })
    .eq('assigned_to', SOURCE);
  if (countErr) throw countErr;

  console.log(`Lead cần chuyển (assigned_to = adminvpt@gmail.com): ${beforeCount ?? 0}`);
  if (!beforeCount) {
    console.log('Không có lead nào cần chuyển.');
    return;
  }

  const now = new Date().toISOString();
  const { data, error: upErr } = await sb
    .from('crm_leads')
    .update({ assigned_to: TARGET, lead_owner_id: TARGET, updated_at: now })
    .eq('assigned_to', SOURCE)
    .select('id');
  if (upErr) throw upErr;

  const moved = data?.length ?? 0;
  console.log(`Đã chuyển ${moved} lead sang admin.vpt@vanphuthanh.vn`);

  const { count: remain, error: remainErr } = await sb
    .from('crm_leads')
    .select('id', { count: 'exact', head: true })
    .or(`assigned_to.eq.${SOURCE},lead_owner_id.eq.${SOURCE}`);
  if (remainErr) throw remainErr;

  const { count: targetTotal, error: targetErr } = await sb
    .from('crm_leads')
    .select('id', { count: 'exact', head: true })
    .eq('assigned_to', TARGET);
  if (targetErr) throw targetErr;

  console.log(`Còn lại trên adminvpt@gmail.com: ${remain ?? 0}`);
  console.log(`Tổng lead trên admin.vpt@vanphuthanh.vn: ${targetTotal ?? 0}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
