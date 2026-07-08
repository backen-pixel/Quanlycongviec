/**
 * Phúc Đạt: bỏ yêu cầu file/ghi chú khi hoàn thành cho TẤT CẢ nhiệm vụ
 * (mẫu nhiệm vụ + task đã sinh trên deal). Chạy:
 *   node backend/scripts/phuc-dat-disable-all-task-evidence.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const CHUNK = 200;

async function findPhucDat(sb) {
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

async function updateInChunks(sb, table, ids, payload) {
  let updated = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { error } = await sb.from(table).update(payload).in('id', slice);
    if (error) throw error;
    updated += slice.length;
  }
  return updated;
}

async function main() {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const company = await findPhucDat(sb);
  console.log('Company:', company.name, company.id);

  // 1. Lấy toàn bộ pipeline → stage → template của công ty
  const { data: pipelines, error: pErr } = await sb
    .from('crm_pipelines')
    .select('id')
    .eq('company_id', company.id);
  if (pErr) throw pErr;
  const pipelineIds = (pipelines || []).map((p) => p.id);

  let tplItemUpdated = 0;
  if (pipelineIds.length) {
    const { data: stages, error: sErr } = await sb
      .from('crm_pipeline_stages')
      .select('id')
      .in('pipeline_id', pipelineIds);
    if (sErr) throw sErr;
    const stageIds = (stages || []).map((s) => s.id);

    if (stageIds.length) {
      const { data: templates, error: tErr } = await sb
        .from('crm_task_templates')
        .select('id')
        .in('pipeline_stage_id', stageIds);
      if (tErr) throw tErr;
      const templateIds = (templates || []).map((t) => t.id);

      if (templateIds.length) {
        // Lấy các item còn yêu cầu file/ghi chú hoặc file types
        const { data: items, error: iErr } = await sb
          .from('crm_task_template_items')
          .select('id, completion_requires_file_or_note, required_evidence_file_types')
          .in('template_id', templateIds);
        if (iErr) throw iErr;
        const need = (items || []).filter(
          (i) =>
            i.completion_requires_file_or_note ||
            (Array.isArray(i.required_evidence_file_types) && i.required_evidence_file_types.length > 0)
        );
        if (need.length) {
          tplItemUpdated = await updateInChunks(
            sb,
            'crm_task_template_items',
            need.map((i) => i.id),
            { completion_requires_file_or_note: false, required_evidence_file_types: [] }
          );
        }
      }
    }
  }
  console.log('Updated template items:', tplItemUpdated);

  // 2. Task đã sinh trên deal — phân trang để không bị giới hạn 1000 dòng
  let taskUpdated = 0;
  const pageSize = 1000;
  let from = 0;
  const allTaskIds = new Set();
  // Lấy task cần cập nhật: đang yêu cầu file/note hoặc có file types
  // (join qua crm_leads.company_id)
  // Supabase-js không hỗ trợ OR trên cột json_length dễ dàng, nên lấy tất cả và lọc client-side.
  while (true) {
    const { data, error } = await sb
      .from('crm_tasks')
      .select('id, completion_requires_file_or_note, required_evidence_file_types, lead:crm_leads!inner(company_id)')
      .eq('lead.company_id', company.id)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = data || [];
    for (const r of rows) {
      const hasFileTypes = Array.isArray(r.required_evidence_file_types) && r.required_evidence_file_types.length > 0;
      if (r.completion_requires_file_or_note || hasFileTypes) {
        allTaskIds.add(r.id);
      }
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  if (allTaskIds.size) {
    taskUpdated = await updateInChunks(sb, 'crm_tasks', Array.from(allTaskIds), {
      completion_requires_file_or_note: false,
      required_evidence_file_types: [],
    });
  }
  console.log('Updated existing tasks:', taskUpdated);
  console.log('Done.');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
