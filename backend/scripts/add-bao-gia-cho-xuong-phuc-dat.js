/**
 * Thêm nhiệm vụ "Báo giá cho xưởng" vào bộ mẫu nhiệm vụ xưởng ở cột "Sản xuất" của Phúc Đạt,
 * rồi chạy bổ sung (ensure-missing, không tạo trùng) cho mọi dự án CRM đang hoạt động của Phúc Đạt.
 *
 * Dùng lại đúng hàm `ensureMissingSxTasksForLead` — logic y hệt nút "Bổ sung thiếu SX" trên
 * tab Công việc của từng deal — nên tự động bỏ qua deal nào đã có việc này rồi.
 *
 * Chạy: node backend/scripts/add-bao-gia-cho-xuong-phuc-dat.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { supabase } = require('../src/config/supabase');
const { ensureMissingSxTasksForLead } = require('../src/helpers/projectOrderFulfillment');

const PHUC_DAT = '29677f68-967e-4256-92fd-492bb580e888';
const SAN_XUAT_STAGE_ID = '678af9e1-8a6b-44c6-b346-456f59fc3705';
const WORKSHOP_TYPE_ID = 'f94e8064-3bf0-4d49-84de-11041a171d1a';
const ADMIN_USER_ID = '0db73a17-8ac2-4aaa-b2a8-c8f90360d77e';
const TASK_TITLE = 'Báo giá cho xưởng';

async function ensureTemplate() {
  const { data: existing, error: findErr } = await supabase
    .from('workshop_task_templates')
    .select('id')
    .eq('company_id', PHUC_DAT)
    .eq('production_stage_id', SAN_XUAT_STAGE_ID)
    .eq('workshop_area', 'production')
    .ilike('name', 'Sản xuất')
    .maybeSingle();
  if (findErr) throw findErr;

  let tplId = existing?.id;
  if (!tplId) {
    const { data: ins, error } = await supabase
      .from('workshop_task_templates')
      .insert({
        name: 'Sản xuất',
        workshop_area: 'production',
        company_id: PHUC_DAT,
        workshop_type_id: WORKSHOP_TYPE_ID,
        production_stage_id: SAN_XUAT_STAGE_ID,
        is_active: true,
        order_index: 0,
      })
      .select('id')
      .single();
    if (error) throw error;
    tplId = ins.id;
    console.log('Đã tạo bộ mẫu "Sản xuất":', tplId);
  } else {
    console.log('Bộ mẫu "Sản xuất" đã có sẵn:', tplId);
  }

  const { data: curItems, error: itemsErr } = await supabase
    .from('workshop_task_template_items')
    .select('id, title')
    .eq('template_id', tplId);
  if (itemsErr) throw itemsErr;

  const already = (curItems || []).some(
    (i) => String(i.title || '').trim().toLowerCase() === TASK_TITLE.toLowerCase(),
  );
  if (already) {
    console.log(`Mục "${TASK_TITLE}" đã có trong bộ mẫu — không thêm trùng.`);
  } else {
    const nextOrder = (curItems || []).length;
    const { error } = await supabase.from('workshop_task_template_items').insert({
      template_id: tplId,
      title: TASK_TITLE,
      priority: 'medium',
      deadline_days: 0,
      order_index: nextOrder,
      checklist: [],
    });
    if (error) throw error;
    console.log(`Đã thêm mục "${TASK_TITLE}" vào bộ mẫu.`);
  }
  return tplId;
}

async function fetchActiveDealLeadIds() {
  const { data: projects, error: projErr } = await supabase
    .from('projects')
    .select('id, code, status')
    .eq('company_id', PHUC_DAT);
  if (projErr) throw projErr;
  const activeProjectIds = (projects || [])
    .filter((p) => !['completed', 'cancelled', 'canceled'].includes(String(p.status || '').toLowerCase()))
    .map((p) => p.id);
  if (!activeProjectIds.length) return [];

  const { data: leads, error: leadErr } = await supabase
    .from('crm_leads')
    .select('id, project_id, code, title')
    .eq('type', 'deal')
    .in('project_id', activeProjectIds);
  if (leadErr) throw leadErr;
  return (leads || []).filter((l) => l.id);
}

async function main() {
  await ensureTemplate();

  const leads = await fetchActiveDealLeadIds();
  console.log(`\nTìm thấy ${leads.length} deal đang hoạt động của Phúc Đạt để bổ sung nhiệm vụ.\n`);

  const summary = [];
  for (const lead of leads) {
    try {
      const result = await ensureMissingSxTasksForLead({
        leadId: lead.id,
        userId: ADMIN_USER_ID,
        req: null,
        pipelineStageId: SAN_XUAT_STAGE_ID,
        allPipelineStages: false,
      });
      console.log(
        `- ${lead.code || lead.id}: created=${result.created} backfill=${result.backfill_updated} reason=${result.reason}`,
      );
      summary.push({ lead_id: lead.id, code: lead.code, ...result });
    } catch (e) {
      console.error(`- ${lead.code || lead.id}: LỖI — ${e.message}`);
      summary.push({ lead_id: lead.id, code: lead.code, ok: false, error: e.message });
    }
  }

  const { data: createdTasks, error: verifyErr } = await supabase
    .from('crm_tasks')
    .select('id, lead_id, title, production_pipeline_stage_id, created_at')
    .eq('production_pipeline_stage_id', SAN_XUAT_STAGE_ID)
    .ilike('title', TASK_TITLE);
  if (verifyErr) throw verifyErr;

  const outFile = path.join(
    __dirname,
    '..',
    'uploads',
    `_rollback_bao_gia_cho_xuong_phuc_dat_${Date.now()}.json`,
  );
  fs.writeFileSync(outFile, JSON.stringify({
    task_title: TASK_TITLE,
    stage_id: SAN_XUAT_STAGE_ID,
    created_task_ids: (createdTasks || []).map((t) => t.id),
    per_lead_summary: summary,
  }, null, 2));

  console.log(`\nTổng cộng hiện có ${createdTasks?.length || 0} nhiệm vụ "${TASK_TITLE}" ở cột Sản xuất.`);
  console.log(`Đã ghi file khôi phục: ${outFile}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
