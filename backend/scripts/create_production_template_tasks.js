const { supabase } = require('../src/config/supabase');

const STEP_TITLES = [
  'Tiếp nhận',
  'Thiết kế và lên kế hoạch',
  'Kiểm tra chéo',
  'Vật tư',
  'Sản xuất thùng',
  'Sản xuất alu',
  'Hoàn thiện',
  'Đóng gói',
  'Giao hàng',
];

async function resolveTemplateId(inputTemplateId) {
  if (inputTemplateId) return inputTemplateId;

  const { data: defTpl, error: defErr } = await supabase
    .from('workshop_task_templates')
    .select('id,name')
    .eq('workshop_area', 'production')
    .eq('is_active', true)
    .eq('is_default', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (defErr) throw defErr;
  if (defTpl?.id) return defTpl.id;

  const { data: anyTpl, error: anyErr } = await supabase
    .from('workshop_task_templates')
    .select('id,name')
    .eq('workshop_area', 'production')
    .eq('is_active', true)
    .order('order_index', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (anyErr) throw anyErr;
  if (!anyTpl?.id) {
    throw new Error('Không tìm thấy template production. Hãy tạo workshop_task_templates trước.');
  }
  return anyTpl.id;
}

async function main() {
  const templateId = process.argv[2] || '';
  const targetTemplateId = await resolveTemplateId(templateId);

  const { error: delErr } = await supabase
    .from('workshop_task_template_items')
    .delete()
    .eq('template_id', targetTemplateId);
  if (delErr) throw delErr;

  const rows = STEP_TITLES.map((title, idx) => ({
    template_id: targetTemplateId,
    title,
    description: null,
    priority: 'medium',
    deadline_days: 0,
    order_index: idx + 1,
    checklist: [],
  }));

  const { error: insErr } = await supabase
    .from('workshop_task_template_items')
    .insert(rows);
  if (insErr) throw insErr;

  console.log(JSON.stringify({
    ok: true,
    template_id: targetTemplateId,
    steps: STEP_TITLES,
    count: STEP_TITLES.length,
  }, null, 2));
}

main().catch((e) => {
  console.error('[create_production_template_tasks] failed:', e.message);
  process.exit(1);
});

