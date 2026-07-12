/**
 * Phúc Đạt: bỏ yêu cầu file/ghi chú cho nhiệm vụ Bản vẽ 2D / 3D (mẫu + task deal hiện có).
 * Chạy: node backend/scripts/phuc-dat-disable-2d3d-evidence.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const TITLES = new Set(['bản vẽ 2d', 'bản vẽ 3d']);

function normTitle(s) {
  return String(s || '').trim().toLowerCase();
}

async function findPhucDatCompanyId(sb) {
  const { data, error } = await sb
    .from('companies')
    .select('id, name')
    .or('name.ilike.%Phúc Đạt%,name.ilike.%Phuc Dat%')
    .limit(5);
  if (error) throw error;
  const row = (data || []).find((c) => /phúc đạt|phuc dat/i.test(c.name || '')) || data?.[0];
  if (!row?.id) throw new Error('Không tìm thấy công ty Phúc Đạt');
  return row;
}

async function main() {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const company = await findPhucDatCompanyId(sb);
  console.log('Company:', company.name, company.id);

  const { data: pipelines, error: pipeErr } = await sb
    .from('crm_pipelines')
    .select('id')
    .eq('company_id', company.id);
  if (pipeErr) throw pipeErr;
  const pipelineIds = (pipelines || []).map((p) => p.id);
  if (!pipelineIds.length) throw new Error('Phúc Đạt chưa có pipeline CRM');

  const { data: stages, error: stageErr } = await sb
    .from('crm_pipeline_stages')
    .select('id')
    .in('pipeline_id', pipelineIds);
  if (stageErr) throw stageErr;
  const stageIds = (stages || []).map((s) => s.id);

  const { data: templates, error: tplListErr } = await sb
    .from('crm_task_templates')
    .select('id')
    .in('pipeline_stage_id', stageIds);
  if (tplListErr) throw tplListErr;
  const templateIds = (templates || []).map((t) => t.id);

  let tplUpdated = 0;
  if (templateIds.length) {
    const { data: items, error: itemsErr } = await sb
      .from('crm_task_template_items')
      .select('id, title, completion_requires_file_or_note')
      .in('template_id', templateIds);
    if (itemsErr) throw itemsErr;
    const need = (items || []).filter((i) => TITLES.has(normTitle(i.title)) && i.completion_requires_file_or_note);
    if (need.length) {
      const { error } = await sb
        .from('crm_task_template_items')
        .update({ completion_requires_file_or_note: false, required_evidence_file_types: [] })
        .in('id', need.map((i) => i.id));
      if (error) throw error;
      tplUpdated = need.length;
    }
  }
  console.log('Updated template items:', tplUpdated);

  // Cập nhật task theo title — quét trực tiếp theo company (tránh giới hạn 1000 row mặc định khi lấy lead).
  const { data: pendingTasks, error: pendingErr } = await sb
    .from('crm_tasks')
    .select('id, title, completion_requires_file_or_note, lead:crm_leads!inner(company_id)')
    .eq('lead.company_id', company.id)
    .eq('completion_requires_file_or_note', true);
  if (pendingErr) throw pendingErr;
  const need = (pendingTasks || []).filter((t) => TITLES.has(normTitle(t.title)));
  let tasksUpdated = 0;
  const taskChunk = 100;
  for (let i = 0; i < need.length; i += taskChunk) {
    const slice = need.slice(i, i + taskChunk);
    const { error } = await sb
      .from('crm_tasks')
      .update({ completion_requires_file_or_note: false, required_evidence_file_types: [] })
      .in('id', slice.map((t) => t.id));
    if (error) throw error;
    tasksUpdated += slice.length;
  }
  console.log('Updated existing tasks:', tasksUpdated);
  console.log('Done.');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
