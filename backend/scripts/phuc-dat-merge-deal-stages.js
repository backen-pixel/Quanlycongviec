/**
 * Phúc Đạt: chuyển deal từ Đang xây thô / Đang thiết kế / Đàm phán → Đã Khảo sát., rồi xóa 3 cột.
 */
const { supabase } = require('../src/config/supabase');

const PIPELINE_ID = '6017bdcd-5683-4f81-9f84-4a5e7bc8d373';
const TARGET_STAGE = 'a6e13a64-121f-4f04-a12f-f6f96cca1516'; // Đã Khảo sát.
const REMOVE_STAGES = [
  'bd08a266-a4fd-47ff-857e-65a54508fba1', // Đang xây thô
  'c49f4a64-1634-4c1a-8459-61b8060f8c7d', // Đang thiết kế
  '24378e04-5197-4709-b520-d8e47fa02888', // Đàm phán.
];

(async () => {
  const { data: before, error: bErr } = await supabase
    .from('crm_leads')
    .select('id, code, title, stage_id')
    .in('stage_id', REMOVE_STAGES);
  if (bErr) throw bErr;
  console.log('Deals to move:', (before || []).length);
  for (const r of before || []) {
    console.log(' -', r.code, '|', (r.title || '').slice(0, 50));
  }

  const { data: moved, error: mErr } = await supabase
    .from('crm_leads')
    .update({
      stage_id: TARGET_STAGE,
      stage_entered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .in('stage_id', REMOVE_STAGES)
    .select('id');
  if (mErr) throw mErr;
  console.log('Moved:', (moved || []).length);

  const { data: tmpl, error: tErr } = await supabase
    .from('crm_task_templates')
    .update({ pipeline_stage_id: TARGET_STAGE })
    .eq('pipeline_stage_id', 'c49f4a64-1634-4c1a-8459-61b8060f8c7d')
    .select('id, name');
  if (tErr) throw tErr;
  console.log('Templates remapped:', tmpl || []);

  const { error: dErr } = await supabase
    .from('crm_pipeline_stages')
    .delete()
    .in('id', REMOVE_STAGES)
    .eq('pipeline_id', PIPELINE_ID);
  if (dErr) throw dErr;
  console.log('Deleted 3 stages');

  const { data: stages } = await supabase
    .from('crm_pipeline_stages')
    .select('name, order_index, is_active')
    .eq('pipeline_id', PIPELINE_ID)
    .eq('pipeline_type', 'deal')
    .order('order_index');
  console.log('Deal stages remaining:');
  for (const s of stages || []) console.log(`  ${s.order_index}. ${s.name}`);

  const { count } = await supabase
    .from('crm_leads')
    .select('id', { count: 'exact', head: true })
    .in('stage_id', REMOVE_STAGES);
  console.log('Still on removed stages:', count || 0);

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
