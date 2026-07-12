/**
 * Seed bộ mẫu «Báo giá» cho cột Công nợ — Metalla Data đầu ra.
 * Chạy: node backend/scripts/seed-metalla-cong-no-bao-gia-template.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const METALLA = 'b78baba2-2486-434c-a72d-9c937fac2164';
const TYPE_ID = '607703bc-b86e-407a-a91d-4ab91df4c558';
const STAGE_ID = '6723a412-77ce-4481-aa70-8cae1bf69ee7';
const ITEMS = ['Lập báo giá', 'Gửi báo giá cho khách'];

async function main() {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: existing, error: findErr } = await sb
    .from('workshop_task_templates')
    .select('id')
    .eq('company_id', METALLA)
    .eq('workshop_type_id', TYPE_ID)
    .eq('workshop_area', 'production')
    .eq('production_stage_id', STAGE_ID)
    .ilike('name', 'Báo giá')
    .maybeSingle();
  if (findErr) throw findErr;

  let tplId = existing?.id;
  if (!tplId) {
    const { data: ins, error } = await sb
      .from('workshop_task_templates')
      .insert({
        name: 'Báo giá',
        workshop_area: 'production',
        company_id: METALLA,
        workshop_type_id: TYPE_ID,
        production_stage_id: STAGE_ID,
        is_active: true,
        is_default: true,
        order_index: 5,
      })
      .select('id')
      .single();
    if (error) throw error;
    tplId = ins.id;
    console.log('Created template:', tplId);
  } else {
    const { error } = await sb
      .from('workshop_task_templates')
      .update({ is_active: true, is_default: true, production_stage_id: STAGE_ID })
      .eq('id', tplId);
    if (error) throw error;
    console.log('Updated template:', tplId);
  }

  const { data: curItems, error: itemsErr } = await sb
    .from('workshop_task_template_items')
    .select('title')
    .eq('template_id', tplId);
  if (itemsErr) throw itemsErr;

  const have = new Set((curItems || []).map((i) => String(i.title || '').trim().toLowerCase()));
  for (let i = 0; i < ITEMS.length; i += 1) {
    const title = ITEMS[i];
    if (have.has(title.toLowerCase())) continue;
    const { error } = await sb.from('workshop_task_template_items').insert({
      template_id: tplId,
      title,
      priority: 'medium',
      deadline_days: 0,
      order_index: i + 1,
      checklist: [],
    });
    if (error) throw error;
    console.log('Added item:', title);
  }

  const { data: verify, error: verifyErr } = await sb
    .from('workshop_task_templates')
    .select('id, name, is_default, production_stage_id, items:workshop_task_template_items(title, order_index)')
    .eq('id', tplId)
    .single();
  if (verifyErr) throw verifyErr;
  console.log(JSON.stringify(verify, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
