/**
 * Clone pipeline CRM + bộ nhiệm vụ mẫu từ Phúc Đạt → Metala.
 * Chạy: node scripts/clone-crm-pipeline-phuc-dat-to-metala.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const MARKER = '[crm-clone-metala-from-pd]';

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function findCompany(patterns) {
  const { data, error } = await sb.from('companies').select('id, name, short_name');
  if (error) throw error;
  const rows = data || [];
  for (const p of patterns) {
    const hit = rows.find((c) => p.test(c.name || '') || p.test(c.short_name || ''));
    if (hit) return hit;
  }
  return null;
}

async function main() {
  const phuc = await findCompany([/phúc.*đạt/i, /phuc.*dat/i]);
  const metala = await findCompany([/metala/i]);
  if (!phuc) throw new Error('Không tìm thấy công ty Phúc Đạt');
  if (!metala) throw new Error('Không tìm thấy công ty Metala');

  console.log('Nguồn:', phuc.name, phuc.id);
  console.log('Đích:', metala.name, metala.id);

  const { data: existing } = await sb
    .from('crm_pipelines')
    .select('id, description')
    .eq('company_id', metala.id)
    .ilike('description', `%${MARKER}%`)
    .maybeSingle();
  if (existing) {
    console.log('Đã clone trước đó — pipeline Metala:', existing.id);
    return;
  }

  const { data: srcPipelines, error: pErr } = await sb
    .from('crm_pipelines')
    .select('id, name, description, is_active, is_default')
    .eq('company_id', phuc.id)
    .eq('is_active', true)
    .order('is_default', { ascending: false });
  if (pErr) throw pErr;
  const srcPipeline = (srcPipelines || [])[0];
  if (!srcPipeline) throw new Error('Phúc Đạt chưa có pipeline CRM active');

  const { data: srcStages, error: stErr } = await sb
    .from('crm_pipeline_stages')
    .select('*')
    .eq('pipeline_id', srcPipeline.id)
    .order('pipeline_type')
    .order('order_index');
  if (stErr) throw stErr;
  if (!srcStages?.length) throw new Error('Pipeline nguồn không có cột nào');

  const { data: newPipeline, error: insPErr } = await sb
    .from('crm_pipelines')
    .insert({
      name: 'CRM Pipeline',
      company_id: metala.id,
      description: `Pipeline CRM clone từ Phúc Đạt ${MARKER}`,
      is_default: true,
      is_active: true,
    })
    .select('id')
    .single();
  if (insPErr) throw insPErr;

  const stageMap = new Map();
  for (const s of srcStages) {
    const { id: _oldId, created_at: _ca, ...rest } = s;
    const payload = {
      ...rest,
      pipeline_id: newPipeline.id,
      is_active: rest.is_active !== false,
      is_won: !!rest.is_won,
      is_lost: !!rest.is_lost,
      send_zalo_on_enter: !!rest.send_zalo_on_enter,
      create_event_on_enter: !!rest.create_event_on_enter,
      counts_as_won_revenue: !!rest.counts_as_won_revenue,
      counts_as_completed_revenue: !!rest.counts_as_completed_revenue,
      requires_deadline: !!rest.requires_deadline,
      show_deadline_box: !!rest.show_deadline_box,
    };
    const { data: newStage, error: insSErr } = await sb
      .from('crm_pipeline_stages')
      .insert(payload)
      .select('id')
      .single();
    if (insSErr) throw insSErr;
    stageMap.set(s.id, newStage.id);
  }

  const oldStageIds = [...stageMap.keys()];
  const { data: srcTemplates, error: tplErr } = await sb
    .from('crm_task_templates')
    .select('*')
    .in('pipeline_stage_id', oldStageIds)
    .eq('is_active', true)
    .order('order_index');
  if (tplErr) throw tplErr;

  let tplCount = 0;
  let itemCount = 0;
  for (const tpl of srcTemplates || []) {
    const newStageId = stageMap.get(tpl.pipeline_stage_id);
    if (!newStageId) continue;

    const desc = (tpl.description || '').trim();
    const { data: newTpl, error: insTplErr } = await sb
      .from('crm_task_templates')
      .insert({
        name: tpl.name,
        stage_slug: tpl.stage_slug,
        description: desc ? `${desc}\n${MARKER}` : MARKER,
        is_active: tpl.is_active !== false,
        is_default: false,
        order_index: tpl.order_index,
        pipeline_type: tpl.pipeline_type || 'both',
        pipeline_stage_id: newStageId,
      })
      .select('id')
      .single();
    if (insTplErr) throw insTplErr;
    tplCount += 1;

    const { data: items, error: itemErr } = await sb
      .from('crm_task_template_items')
      .select('*')
      .eq('template_id', tpl.id)
      .order('order_index');
    if (itemErr) throw itemErr;

    if (items?.length) {
      const rows = items.map((i) => ({
        template_id: newTpl.id,
        title: i.title,
        description: i.description,
        priority: i.priority || 'medium',
        deadline_days: i.deadline_days ?? 0,
        order_index: i.order_index,
        checklist: i.checklist || [],
        default_allowed_companies: [metala.id],
        default_allowed_departments: i.default_allowed_departments,
        completion_requires_file_or_note: !!i.completion_requires_file_or_note,
        completion_requires_customer_note: !!i.completion_requires_customer_note,
        completion_requires_customer_contact: !!i.completion_requires_customer_contact,
        blocks_stage_advance: !!i.blocks_stage_advance,
        show_excel_quotation_upload: !!i.show_excel_quotation_upload,
      }));
      const { error: insItemErr } = await sb.from('crm_task_template_items').insert(rows);
      if (insItemErr) throw insItemErr;
      itemCount += rows.length;
    }
  }

  console.log('✅ Hoàn tất');
  console.log('  Pipeline Metala:', newPipeline.id);
  console.log('  Cột pipeline:', stageMap.size);
  console.log('  Bộ nhiệm vụ mẫu:', tplCount);
  console.log('  Mục nhiệm vụ:', itemCount);
}

main().catch((e) => {
  console.error('❌', e.message || e);
  process.exit(1);
});
