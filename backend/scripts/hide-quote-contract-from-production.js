/**
 * Tắt chia sẻ SX cho file/ghi chú nhiệm vụ Báo giá & Hợp đồng (VPT + Phúc Đạt).
 * Chạy: node backend/scripts/hide-quote-contract-from-production.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { supabase } = require('../src/config/supabase');
const {
  VPT_COMPANY_ID,
  PHUC_DAT_COMPANY_ID,
  isQuoteContractCommercialTaskTitle,
  isQuoteContractLeadDocument,
} = require('../src/helpers/hideQuoteContractFromProduction');

const COMPANY_IDS = [VPT_COMPANY_ID, PHUC_DAT_COMPANY_ID];
const PAGE = 500;

async function fetchAllPages(buildQuery) {
  const out = [];
  let from = 0;
  for (;;) {
    const { data, error } = await buildQuery(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data || [];
    out.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

async function main() {
  let attUpdated = 0;
  let docUpdated = 0;
  let tplUpdated = 0;

  for (const companyId of COMPANY_IDS) {
    console.log(`\n── Company ${companyId}`);

    const leads = await fetchAllPages((from, to) =>
      supabase.from('crm_leads').select('id').eq('company_id', companyId).range(from, to),
    );
    console.log(`  Leads: ${leads.length}`);
    if (!leads.length) continue;

    // Chunk lead ids
    for (let i = 0; i < leads.length; i += 80) {
      const chunk = leads.slice(i, i + 80).map((l) => l.id);
      const { data: tasks, error: te } = await supabase
        .from('crm_tasks')
        .select('id, title, stage_slug')
        .in('lead_id', chunk);
      if (te) throw te;

      const hideTaskIds = (tasks || [])
        .filter((t) => !String(t.stage_slug || '').startsWith('sx_') && isQuoteContractCommercialTaskTitle(t.title))
        .map((t) => t.id);
      if (!hideTaskIds.length) continue;

      for (let j = 0; j < hideTaskIds.length; j += 80) {
        const tChunk = hideTaskIds.slice(j, j + 80);
        const { data: atts, error: ae } = await supabase
          .from('crm_task_attachments')
          .update({ shared_to_project: false, allowed_share_modules: null })
          .in('task_id', tChunk)
          .eq('shared_to_project', true)
          .select('id');
        if (ae) throw ae;
        attUpdated += (atts || []).length;
      }
    }

    for (let i = 0; i < leads.length; i += 80) {
      const chunk = leads.slice(i, i + 80).map((l) => l.id);
      const { data: docs, error: de } = await supabase
        .from('lead_documents')
        .select('id, name, crm_stage_slug, crm_stage_group_label')
        .in('lead_id', chunk)
        .eq('shared_to_workshop', true);
      if (de) throw de;

      const hideDocIds = (docs || [])
        .filter((d) => !String(d.crm_stage_slug || '').startsWith('sx_') && isQuoteContractLeadDocument(d))
        .map((d) => d.id);
      if (!hideDocIds.length) continue;

      for (let j = 0; j < hideDocIds.length; j += 80) {
        const dChunk = hideDocIds.slice(j, j + 80);
        const { data: updated, error: ue } = await supabase
          .from('lead_documents')
          .update({ shared_to_workshop: false, allowed_share_modules: null })
          .in('id', dChunk)
          .select('id');
        if (ue) throw ue;
        docUpdated += (updated || []).length;
      }
    }
  }

  // Template items
  const { data: pipelines, error: pe } = await supabase
    .from('crm_pipelines')
    .select('id')
    .in('company_id', COMPANY_IDS);
  if (pe) throw pe;
  const pipeIds = (pipelines || []).map((p) => p.id);
  if (pipeIds.length) {
    const { data: stageRows, error: se } = await supabase
      .from('crm_pipeline_stages')
      .select('id')
      .in('pipeline_id', pipeIds);
    if (se) throw se;
    const stageIds = (stageRows || []).map((s) => s.id);
    if (stageIds.length) {
      const { data: tpls, error: tpe } = await supabase
        .from('crm_task_templates')
        .select('id')
        .in('pipeline_stage_id', stageIds);
      if (tpe) throw tpe;
      const tplIds = (tpls || []).map((t) => t.id);
      if (tplIds.length) {
        const { data: items, error: ie } = await supabase
          .from('crm_task_template_items')
          .select('id, title')
          .in('template_id', tplIds);
        if (ie) throw ie;
        const hideItemIds = (items || [])
          .filter((i) => isQuoteContractCommercialTaskTitle(i.title))
          .map((i) => i.id);
        if (hideItemIds.length) {
          const { data: u, error: ue } = await supabase
            .from('crm_task_template_items')
            .update({ default_shared_to_project: false, default_allowed_share_modules: null })
            .in('id', hideItemIds)
            .select('id');
          if (ue) throw ue;
          tplUpdated = (u || []).length;
        }
      }
    }
  }

  console.log(`\nAttachments unshared: ${attUpdated}`);
  console.log(`Lead documents unshared: ${docUpdated}`);
  console.log(`Template items reset: ${tplUpdated}`);
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
