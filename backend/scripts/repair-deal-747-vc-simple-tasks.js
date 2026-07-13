/**
 * Thay bộ nhiệm vụ VC/LĐ 13 bước → 7 bước đơn giản cho DEAL-2026-747 (TB-2026-367).
 *
 * Usage: node scripts/repair-deal-747-vc-simple-tasks.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const {
  applyWorkshopTemplateToProject,
  guessLogisticsPipelineBucketFromTitle,
  resolveLogisticsPipelineStageIdByBucket,
} = require('../src/helpers/workshopApplyTemplates');

const PROJECT_ID = 'e4a7986d-7572-4dc8-a46a-062b5c96fc22';
const COMPANY_ID = '29677f68-967e-4256-92fd-492bb580e888';
const ASSIGNEE_ID = '5e07fb3b-3286-4ca3-a167-4edef16f3866';

async function main() {
  const url = process.env.SUPABASE_URL || process.env.PRIMARY_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.PRIMARY_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Thiếu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  const supabase = createClient(url, key);

  const { data: tpl } = await supabase
    .from('workshop_task_templates')
    .select('id, name')
    .eq('workshop_area', 'logistics')
    .eq('company_id', COMPANY_ID)
    .eq('name', 'Quy trình VC/LĐ Phúc Đạt — Đơn giản')
    .maybeSingle();
  if (!tpl?.id) {
    console.error('Chưa có bộ mẫu «Quy trình VC/LĐ Phúc Đạt — Đơn giản». Chạy migration 419 trước.');
    process.exit(1);
  }

  const { data: oldTasks } = await supabase
    .from('tasks')
    .select('id')
    .eq('project_id', PROJECT_ID)
    .eq('metadata->>workshop_area', 'logistics');
  const oldIds = (oldTasks || []).map((t) => t.id).filter(Boolean);
  if (oldIds.length) {
    await supabase.from('task_checklists').delete().in('task_id', oldIds);
    const { error: delErr } = await supabase.from('tasks').delete().in('id', oldIds);
    if (delErr) throw delErr;
    console.log(`Đã xóa ${oldIds.length} nhiệm vụ VC/LĐ cũ.`);
  }

  const r = await applyWorkshopTemplateToProject(PROJECT_ID, tpl.id, ASSIGNEE_ID);
  if (!r.ok) {
    console.error('Apply template failed:', r.error);
    process.exit(1);
  }
  console.log(`Đã tạo ${r.count} nhiệm vụ mới từ bộ mẫu ${tpl.name}.`);

  const { data: newTasks } = await supabase
    .from('tasks')
    .select('id, title, order_index, metadata')
    .eq('project_id', PROJECT_ID)
    .eq('metadata->>workshop_template_id', tpl.id)
    .order('order_index');

  const { data: tplItems } = await supabase
    .from('workshop_task_template_items')
    .select('id, title, order_index')
    .eq('template_id', tpl.id)
    .order('order_index');
  const orderByTitle = new Map((tplItems || []).map((i) => [i.title, i.order_index]));

  for (const task of newTasks || []) {
    const bucket = guessLogisticsPipelineBucketFromTitle(task.title);
    const colId = await resolveLogisticsPipelineStageIdByBucket(bucket, COMPANY_ID);
    const orderIndex = orderByTitle.get(task.title) ?? task.order_index;
    const meta = { ...(task.metadata || {}), logistics_pipeline_stage_id: colId };
    await supabase.from('tasks').update({
      assignee_id: ASSIGNEE_ID,
      order_index: orderIndex,
      metadata: meta,
    }).eq('id', task.id);
    console.log(`  ${orderIndex}. ${task.title} → ${bucket} (${colId || '?'})`);
  }

  console.log('Hoàn tất.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
