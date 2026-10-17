/**
 * Chạy TIẾP cho các deal Phúc Đạt còn thiếu "Báo giá cho xưởng" ở cột Sản xuất, sau khi đã
 * sửa bộ mẫu thành dùng chung mọi phân loại (xem fix-bao-gia-cho-xuong-workshop-type.js).
 *
 * CHỈ gọi applyProductionTemplatesOnPipelineEnter (gắn đúng 1 cột) — KHÔNG gọi lại
 * ensureMissingSxTasksForLead/applyProductionTemplateToFulfillmentLead (bước "bộ mặc định")
 * để tránh lặp lại sự cố tạo thêm 332 nhiệm vụ ngoài ý muốn ở lần chạy trước.
 *
 * Chạy: node backend/scripts/fill-missing-bao-gia-cho-xuong-phuc-dat.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { supabase } = require('../src/config/supabase');
const { applyProductionTemplatesOnPipelineEnter } = require('../src/helpers/projectOrderFulfillment');

const PHUC_DAT = '29677f68-967e-4256-92fd-492bb580e888';
const SAN_XUAT_STAGE_ID = '678af9e1-8a6b-44c6-b346-456f59fc3705';
const ADMIN_USER_ID = '0db73a17-8ac2-4aaa-b2a8-c8f90360d77e';
const TASK_TITLE = 'Báo giá cho xưởng';

async function main() {
  const { data: projects, error: projErr } = await supabase
    .from('projects')
    .select('id, code, status, workshop_type_id')
    .eq('company_id', PHUC_DAT);
  if (projErr) throw projErr;
  const activeProjects = (projects || []).filter(
    (p) => !['completed', 'cancelled', 'canceled'].includes(String(p.status || '').toLowerCase()),
  );

  const { data: leads, error: leadErr } = await supabase
    .from('crm_leads')
    .select('id, project_id, code, title')
    .eq('type', 'deal')
    .in('project_id', activeProjects.map((p) => p.id));
  if (leadErr) throw leadErr;

  const { data: existing, error: existErr } = await supabase
    .from('crm_tasks')
    .select('lead_id')
    .eq('production_pipeline_stage_id', SAN_XUAT_STAGE_ID)
    .ilike('title', TASK_TITLE);
  if (existErr) throw existErr;
  const haveIt = new Set((existing || []).map((t) => t.lead_id));

  const missing = leads.filter((l) => !haveIt.has(l.id));
  console.log(`Tổng ${leads.length} deal đang hoạt động — ${haveIt.size} đã có việc — ${missing.length} còn thiếu.\n`);

  const summary = [];
  for (const lead of missing) {
    const project = activeProjects.find((p) => p.id === lead.project_id);
    try {
      const result = await applyProductionTemplatesOnPipelineEnter({
        projectId: lead.project_id,
        pipelineStageId: SAN_XUAT_STAGE_ID,
        userId: ADMIN_USER_ID,
        req: null,
      });
      console.log(`- ${lead.code || lead.id}: created=${result.created} reason=${result.reason}`);
      summary.push({ lead_id: lead.id, project_id: lead.project_id, code: lead.code, ...result });
    } catch (e) {
      console.error(`- ${lead.code || lead.id}: LỖI — ${e.message}`);
      summary.push({ lead_id: lead.id, code: lead.code, ok: false, error: e.message });
    }
  }

  const { data: finalCheck, error: finalErr } = await supabase
    .from('crm_tasks')
    .select('id, lead_id, title, created_at')
    .eq('production_pipeline_stage_id', SAN_XUAT_STAGE_ID)
    .ilike('title', TASK_TITLE);
  if (finalErr) throw finalErr;

  const outFile = path.join(
    __dirname, '..', 'uploads',
    `_rollback_bao_gia_cho_xuong_phuc_dat_fillmissing_${Date.now()}.json`,
  );
  fs.writeFileSync(outFile, JSON.stringify({
    task_title: TASK_TITLE,
    stage_id: SAN_XUAT_STAGE_ID,
    total_task_ids_now: (finalCheck || []).map((t) => t.id),
    per_lead_summary: summary,
  }, null, 2));

  console.log(`\nTổng cộng hiện có ${finalCheck?.length || 0}/${leads.length} deal có "${TASK_TITLE}" ở cột Sản xuất.`);
  console.log(`Đã ghi file khôi phục: ${outFile}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
