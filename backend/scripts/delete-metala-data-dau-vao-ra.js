/**
 * Xóa phân loại «Data đầu vào» + «Data đầu ra» của Metala và mọi dữ liệu liên quan.
 * Chạy: node scripts/delete-metala-data-dau-vao-ra.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const METALA_ID = 'b78baba2-2486-434c-a72d-9c937fac2164';
const TYPE_NAMES = ['Data đầu vào', 'Data đầu ra'];
const EXTRA_LEAD_TYPE_NAMES = ['B2B', 'Data đầu vào', 'Data đầu ra'];

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function findMetalaId() {
  const { data } = await sb.from('companies').select('id, name').ilike('name', '%Metall%').limit(1).maybeSingle();
  return data?.id || METALA_ID;
}

async function main() {
  const companyId = await findMetalaId();

  const { data: types, error: typeErr } = await sb
    .from('workshop_project_types')
    .select('id, name')
    .eq('company_id', companyId)
    .in('name', TYPE_NAMES);
  if (typeErr) throw typeErr;

  const typeIds = (types || []).map((t) => t.id);
  if (!typeIds.length) {
    console.log('Không có phân loại Data đầu vào / Data đầu ra trên Metala.');
  } else {
    console.log('Phân loại sẽ xóa:', (types || []).map((t) => `${t.name} (${t.id})`).join(', '));
  }

  let stageIds = [];
  if (typeIds.length) {
    const { data: stages, error: stErr } = await sb
      .from('production_pipeline_stages')
      .select('id, name, workshop_type_id')
      .eq('company_id', companyId)
      .in('workshop_type_id', typeIds);
    if (stErr) throw stErr;
    stageIds = (stages || []).map((s) => s.id);
    console.log('Cột pipeline sẽ xóa:', stageIds.length);
  }

  // 1) Dự án → chưa phân loại
  if (typeIds.length) {
    const { data: projRows, error: projErr } = await sb
      .from('projects')
      .update({ workshop_type_id: null })
      .eq('company_id', companyId)
      .in('workshop_type_id', typeIds)
      .select('id, code, name');
    if (projErr) throw projErr;
    console.log('Dự án gỡ phân loại:', (projRows || []).length, (projRows || []).map((p) => p.code).join(', ') || '—');
  }

  // 2) Deal sx_pipeline_stage_id
  if (stageIds.length) {
    const { error: leadErr } = await sb
      .from('crm_leads')
      .update({ sx_pipeline_stage_id: null })
      .in('sx_pipeline_stage_id', stageIds);
    if (leadErr) throw leadErr;
  }

  // 3) Task sx gắn cột pipeline
  if (stageIds.length) {
    const { error: taskErr } = await sb
      .from('crm_tasks')
      .update({ production_pipeline_stage_id: null })
      .in('production_pipeline_stage_id', stageIds);
    if (taskErr) throw taskErr;
  }

  // 4) Bộ mẫu xưởng theo phân loại / cột
  if (typeIds.length) {
    const { data: tplByType } = await sb
      .from('workshop_task_templates')
      .select('id')
      .eq('company_id', companyId)
      .in('workshop_type_id', typeIds);
    const tplIds = (tplByType || []).map((t) => t.id);
    if (tplIds.length) {
      await sb.from('workshop_task_template_items').delete().in('template_id', tplIds);
      await sb.from('workshop_task_templates').delete().in('id', tplIds);
      console.log('Bộ mẫu xưởng (theo phân loại):', tplIds.length);
    }
  }

  if (stageIds.length) {
    const { data: tplByStage } = await sb
      .from('workshop_task_templates')
      .select('id')
      .in('production_stage_id', stageIds);
    const tplStageIds = (tplByStage || []).map((t) => t.id);
    if (tplStageIds.length) {
      await sb.from('workshop_task_template_items').delete().in('template_id', tplStageIds);
      await sb.from('workshop_task_templates').delete().in('id', tplStageIds);
      console.log('Bộ mẫu xưởng (theo cột):', tplStageIds.length);
    }
  }

  // 5) NV mặc định theo phân loại
  if (typeIds.length) {
    const { error: staffErr } = await sb
      .from('production_workshop_type_default_staff')
      .delete()
      .eq('production_company_id', companyId)
      .in('workshop_type_id', typeIds);
    if (staffErr && !String(staffErr.message || '').includes('does not exist')) throw staffErr;
  }

  // 6) Cột pipeline
  if (stageIds.length) {
    const { error: delStageErr } = await sb
      .from('production_pipeline_stages')
      .delete()
      .in('id', stageIds);
    if (delStageErr) throw delStageErr;
    console.log('Đã xóa cột pipeline:', stageIds.length);
  }

  // 7) Loại Lead/Deal CRM liên quan (B2B, …)
  const { data: leadTypes } = await sb
    .from('crm_lead_types')
    .select('id, name')
    .eq('company_id', companyId)
    .in('name', EXTRA_LEAD_TYPE_NAMES);

  for (const lt of leadTypes || []) {
    await sb.from('crm_leads').update({ lead_type_id: null }).eq('lead_type_id', lt.id);
    await sb.from('facebook_pages').update({ default_lead_type_id: null }).eq('default_lead_type_id', lt.id);
    const { error: delLtErr } = await sb.from('crm_lead_types').delete().eq('id', lt.id);
    if (delLtErr) throw delLtErr;
    console.log('Đã xóa loại CRM:', lt.name);
  }

  // 8) Phân loại xưởng
  if (typeIds.length) {
    const { error: delTypeErr } = await sb.from('workshop_project_types').delete().in('id', typeIds);
    if (delTypeErr) throw delTypeErr;
    console.log('Đã xóa phân loại xưởng:', typeIds.length);
  }

  // Xác nhận
  const { data: remainTypes } = await sb
    .from('workshop_project_types')
    .select('id, name')
    .eq('company_id', companyId)
    .in('name', TYPE_NAMES);
  const { count: remainStages } = await sb
    .from('production_pipeline_stages')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .in('workshop_type_id', typeIds.length ? typeIds : ['00000000-0000-0000-0000-000000000000']);

  console.log('\n✅ Hoàn tất');
  console.log('  Phân loại còn lại (Data):', (remainTypes || []).length);
  console.log('  Cột pipeline còn lại:', remainStages ?? 0);
}

main().catch((e) => {
  console.error('❌', e.message || e);
  process.exit(1);
});
