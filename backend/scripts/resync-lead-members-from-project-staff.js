/**
 * Dọn lead_members không còn trong project_production_staff (deal SX theo phân loại).
 * Chạy: node scripts/resync-lead-members-from-project-staff.js --company HCB --type "Cánh kính"
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { supabase } = require('../src/config/supabase');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

async function main() {
  const companyKey = arg('--company') || 'HCB';
  const typeName = arg('--type') || 'Cánh kính';

  const { data: companies } = await supabase.from('companies').select('id, short_name, name');
  const company = (companies || []).find(
    (c) => String(c.short_name || '').toLowerCase() === companyKey.toLowerCase(),
  );
  if (!company) throw new Error(`Không tìm thấy công ty ${companyKey}`);

  const { data: wt } = await supabase
    .from('workshop_project_types')
    .select('id, name')
    .eq('company_id', company.id)
    .ilike('name', typeName)
    .maybeSingle();
  if (!wt) throw new Error(`Không tìm thấy phân loại ${typeName}`);

  const { data: projects } = await supabase
    .from('projects')
    .select('id, code')
    .eq('company_id', company.id)
    .eq('workshop_type_id', wt.id);

  let removed = 0;
  for (const p of projects || []) {
    const { data: staff } = await supabase
      .from('project_production_staff')
      .select('user_id, is_primary, order_index')
      .eq('project_id', p.id)
      .order('order_index');
    const staffIds = (staff || []).map((s) => String(s.user_id)).filter(Boolean);
    if (!staffIds.length) continue;

    const primaryId = staff.find((s) => s.is_primary)?.user_id || staffIds[0];

    const { data: deals } = await supabase
      .from('crm_leads')
      .select('id')
      .eq('project_id', p.id)
      .eq('type', 'deal');

    for (const deal of deals || []) {
      const { data: members } = await supabase
        .from('lead_members')
        .select('user_id')
        .eq('lead_id', deal.id);
      const stale = (members || [])
        .map((m) => String(m.user_id))
        .filter((uid) => !staffIds.includes(uid));
      if (stale.length) {
        const { error } = await supabase
          .from('lead_members')
          .delete()
          .eq('lead_id', deal.id)
          .in('user_id', stale);
        if (error) throw error;
        removed += stale.length;
      }

      const rows = staffIds.map((uid) => ({
        lead_id: deal.id,
        user_id: uid,
        role: String(uid) === String(primaryId) ? 'responsible' : 'member',
      }));
      const { error: upErr } = await supabase
        .from('lead_members')
        .upsert(rows, { onConflict: 'lead_id,user_id' });
      if (upErr) throw upErr;
    }
    console.log(`✓ ${p.code}: ${staffIds.length} NV`);
  }

  console.log(`Done — removed ${removed} stale lead_member row(s)`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
