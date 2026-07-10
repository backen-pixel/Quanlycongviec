/**
 * Thiết lập checklist bàn giao «Bản vẽ sản xuất» + tự chia sẻ ghi chú/file sang SX.
 * Gộp checklist giữ id/done/notes; bật shared_to_project trên attachment đã có.
 *
 * Chạy: node scripts/phuc-dat-ban-ve-sx-checklist-share.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const {
  BAN_VE_SX_TASK_TITLE,
  BAN_VE_SX_HANDOFF_CHECKLIST,
  mergeBanVeSxChecklist,
} = require('../src/helpers/banVeSxHandoffChecklist');
const { getLeadDocumentFieldsFromCrmTask } = require('../src/helpers/crmTaskLeadDocumentMeta');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const COMPANY_PATTERNS = ['%Phúc Đạt%', '%Phuc Dat%', '%Vạn Phú Thành%', '%Van Phu Thanh%', '%VPT%'];

async function findTargetCompanies() {
  const { data, error } = await sb.from('companies').select('id, name').order('name');
  if (error) throw error;
  return (data || []).filter((c) => COMPANY_PATTERNS.some((p) => {
    const needle = p.replace(/%/g, '').toLowerCase();
    return String(c.name || '').toLowerCase().includes(needle);
  }));
}

async function updateTemplates(companyId) {
  const { data: pipelines, error: pErr } = await sb
    .from('crm_pipelines')
    .select('id')
    .eq('company_id', companyId);
  if (pErr) throw pErr;
  const pipelineIds = (pipelines || []).map((p) => p.id);
  if (!pipelineIds.length) return 0;

  const { data: stages, error: stErr } = await sb
    .from('crm_pipeline_stages')
    .select('id')
    .in('pipeline_id', pipelineIds);
  if (stErr) throw stErr;
  const stageIds = (stages || []).map((s) => s.id);
  if (!stageIds.length) return 0;

  const { data: templates, error: tplErr } = await sb
    .from('crm_task_templates')
    .select('id')
    .in('pipeline_stage_id', stageIds);
  if (tplErr) throw tplErr;
  const templateIds = (templates || []).map((t) => t.id);
  if (!templateIds.length) return 0;

  const { data: items, error } = await sb
    .from('crm_task_template_items')
    .select('id, title')
    .in('template_id', templateIds);
  if (error) throw error;

  let n = 0;
  for (const item of items || []) {
    if (String(item.title || '').trim() !== BAN_VE_SX_TASK_TITLE) continue;
    const { error: upErr } = await sb
      .from('crm_task_template_items')
      .update({ checklist: BAN_VE_SX_HANDOFF_CHECKLIST })
      .eq('id', item.id);
    if (upErr) throw upErr;
    n += 1;
  }
  return n;
}

async function updateTasks(companyId) {
  const { data: leads, error: leadErr } = await sb
    .from('crm_leads')
    .select('id, project_id')
    .eq('company_id', companyId);
  if (leadErr) throw leadErr;
  const leadProjectById = Object.fromEntries((leads || []).map((l) => [l.id, l.project_id]));

  let n = 0;
  const leadIds = (leads || []).map((l) => l.id);
  const chunkSize = 80;
  for (let i = 0; i < leadIds.length; i += chunkSize) {
    const chunk = leadIds.slice(i, i + chunkSize);
    const { data: tasks, error } = await sb
      .from('crm_tasks')
      .select('id, title, checklist, lead_id')
      .in('lead_id', chunk);
    if (error) throw error;

    for (const task of tasks || []) {
      if (String(task.title || '').trim() !== BAN_VE_SX_TASK_TITLE) continue;
      const merged = mergeBanVeSxChecklist(task.checklist);
      const { error: upErr } = await sb
        .from('crm_tasks')
        .update({ checklist: merged, updated_at: new Date().toISOString() })
        .eq('id', task.id);
      if (upErr) throw upErr;
      n += 1;
      await backfillAttachments(task, merged, leadProjectById[task.lead_id]);
    }
  }
  return n;
}

async function backfillAttachments(task, checklist, projectId) {
  const shareCkIds = new Set(
    (checklist || []).filter((c) => c.shared_to_project).map((c) => String(c.id)),
  );
  if (!shareCkIds.size) return;

  const { data: atts, error } = await sb
    .from('crm_task_attachments')
    .select('id, checklist_id, shared_to_project')
    .eq('task_id', task.id);
  if (error) throw error;

  for (const att of atts || []) {
    if (!att.checklist_id || !shareCkIds.has(String(att.checklist_id))) continue;
    if (att.shared_to_project) continue;
    const share = { shared_to_project: true, allowed_share_modules: ['production'] };
    await sb.from('crm_task_attachments').update(share).eq('id', att.id);
    const docFields = getLeadDocumentFieldsFromCrmTask(
      task,
      { linkToProject: !!projectId },
      { ...share },
    );
    await sb.from('lead_documents')
      .update(docFields)
      .eq('source_attachment_id', att.id);
  }
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY');
  }

  const companies = await findTargetCompanies();
  if (!companies.length) {
    console.log('Không tìm thấy công ty Phúc Đạt / VPT.');
    return;
  }

  for (const c of companies) {
    const tpl = await updateTemplates(c.id);
    const tasks = await updateTasks(c.id);
    console.log(`✅ ${c.name}: ${tpl} mẫu, ${tasks} nhiệm vụ «${BAN_VE_SX_TASK_TITLE}»`);
  }

  console.log('\nChecklist:', BAN_VE_SX_HANDOFF_CHECKLIST.map((x) => x.title).join(' · '));
  console.log('Ghi chú/file up vào từng mục sẽ tự chia sẻ sang module Sản xuất.');
}

main().catch((e) => {
  console.error(e?.message || e);
  if (e?.details) console.error(e.details);
  if (e?.hint) console.error(e.hint);
  process.exit(1);
});
