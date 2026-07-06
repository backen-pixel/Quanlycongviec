/**
 * Khôi phục NVKD làm người phụ trách deal Phúc Đạt bị ghi đè sang Minh SX khi qua xưởng.
 * Chạy: node scripts/restore-phucdat-sales-assignee.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const PHUC_DAT = '29677f68-967e-4256-92fd-492bb580e888';
const MINH_SX = 'a9e1da57-9b5e-4443-b967-70d281fcf918';

async function main() {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: deals, error: fetchErr } = await sb
    .from('crm_leads')
    .select('id, code, title, created_by, assigned_to, creator:users!crm_leads_created_by_fkey(id, full_name, role, is_active)')
    .eq('company_id', PHUC_DAT)
    .eq('type', 'deal')
    .not('project_id', 'is', null)
    .eq('assigned_to', MINH_SX);
  if (fetchErr) throw fetchErr;

  const toRestore = (deals || []).filter((d) => {
    const c = d.creator;
    if (!c?.id || String(c.id) === MINH_SX) return false;
    if (!c.is_active) return false;
    return ['sales', 'staff', 'crm_production_staff'].includes(String(c.role || ''));
  });

  console.log(`Tìm thấy ${toRestore.length} deal cần khôi phục NVKD:`);
  for (const d of toRestore) {
    console.log(`  ${d.code} → ${d.creator.full_name} (${d.title?.slice(0, 50)})`);
  }
  if (!toRestore.length) {
    console.log('Không có deal nào cần sửa.');
    return;
  }

  const now = new Date().toISOString();
  for (const d of toRestore) {
    const salesId = d.created_by;
    const { error: upErr } = await sb
      .from('crm_leads')
      .update({ assigned_to: salesId, lead_owner_id: salesId, updated_at: now })
      .eq('id', d.id);
    if (upErr) throw upErr;

    await sb.from('lead_members').upsert(
      { lead_id: d.id, user_id: salesId, role: 'responsible' },
      { onConflict: 'lead_id,user_id' },
    );
    await sb.from('lead_members').upsert(
      { lead_id: d.id, user_id: MINH_SX, role: 'member' },
      { onConflict: 'lead_id,user_id' },
    );
  }

  console.log(`Đã khôi phục ${toRestore.length} deal.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
