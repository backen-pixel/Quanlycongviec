/**
 * HCB — Tủ bếp: xóa deadline tất cả deal/dự án trong cột pipeline SX.
 * Chạy: node scripts/hcb-clear-deadlines-chuan-bi-xong-tubep.js
 *       node scripts/hcb-clear-deadlines-chuan-bi-xong-tubep.js "ĐƠN HÀNG NGÀY MAI GIAO"
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const WORKSHOP_TYPE = 'Tủ bếp';
const DEFAULT_STAGE_NAME = 'ĐƠN HÀNG ĐÃ CHUẨN BỊ XONG';
const STAGE_NAME = process.argv[2]?.trim() || DEFAULT_STAGE_NAME;

const STAGE_IDS = {
  'ĐƠN HÀNG ĐÃ CHUẨN BỊ XONG': 'eafcaf6b-7c1d-44b9-9944-7d7940d46d10',
  'ĐƠN HÀNG NGÀY MAI GIAO': '8bc02c75-e8ae-4a94-992a-488569c28bf4',
};

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function findHcbCompanyId() {
  const { data, error } = await sb.from('companies').select('id, name').order('name');
  if (error) throw error;
  const row = (data || []).find((c) => /hucabi|hcb/i.test(c.name || ''));
  return row?.id || null;
}

async function resolveStageId(companyId) {
  if (STAGE_IDS[STAGE_NAME]) return STAGE_IDS[STAGE_NAME];
  const { data: wpt } = await sb
    .from('workshop_project_types')
    .select('id')
    .eq('company_id', companyId)
    .ilike('name', WORKSHOP_TYPE)
    .maybeSingle();
  if (!wpt?.id) return null;
  const { data: stage, error } = await sb
    .from('production_pipeline_stages')
    .select('id')
    .eq('company_id', companyId)
    .eq('workshop_type_id', wpt.id)
    .eq('name', STAGE_NAME)
    .maybeSingle();
  if (error) throw error;
  return stage?.id || null;
}

async function loadTargetProjectIds(stageId) {
  const { data: stage, error: stErr } = await sb
    .from('production_pipeline_stages')
    .select('id, workflow_stage_id, company_id, workshop_type_id')
    .eq('id', stageId)
    .maybeSingle();
  if (stErr) throw stErr;
  if (!stage?.workflow_stage_id) return [];

  const { data: projects, error } = await sb
    .from('projects')
    .select('id')
    .eq('company_id', stage.company_id)
    .eq('workshop_type_id', stage.workshop_type_id)
    .eq('current_stage_id', stage.workflow_stage_id);
  if (error) throw error;
  return (projects || []).map((p) => p.id);
}

async function clearDeadlines(projectIds) {
  if (!projectIds.length) return { projects: 0, deals: 0 };

  const now = new Date().toISOString();
  let projects = 0;
  const chunk = 50;
  for (let i = 0; i < projectIds.length; i += chunk) {
    const ids = projectIds.slice(i, i + chunk);
    const { data, error } = await sb
      .from('projects')
      .update({
        production_deadline: null,
        delivery_date: null,
        sx_kanban_deadline_at: null,
        sx_kanban_deadline_reason: null,
        updated_at: now,
      })
      .in('id', ids)
      .select('id');
    if (error) throw error;
    projects += (data || []).length;
  }

  let deals = 0;
  for (let i = 0; i < projectIds.length; i += chunk) {
    const ids = projectIds.slice(i, i + chunk);
    const { data, error } = await sb
      .from('crm_leads')
      .update({
        kanban_deadline_at: null,
        kanban_deadline_reason: null,
        updated_at: now,
      })
      .eq('type', 'deal')
      .in('project_id', ids)
      .select('id');
    if (error) throw error;
    deals += (data || []).length;
  }

  return { projects, deals };
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY');
  }

  const companyId = await findHcbCompanyId();
  if (!companyId) {
    console.log('Không tìm thấy công ty HCB.');
    return;
  }

  const stageId = await resolveStageId(companyId);
  if (!stageId) {
    console.log(`Không tìm thấy cột «${STAGE_NAME}» tại HCB ${WORKSHOP_TYPE}.`);
    return;
  }

  const projectIds = await loadTargetProjectIds(stageId);
  console.log(`Cột: ${STAGE_NAME} (${WORKSHOP_TYPE}) — ${projectIds.length} dự án trong cột`);

  const before = await sb
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .in('id', projectIds)
    .or('production_deadline.not.is.null,delivery_date.not.is.null,sx_kanban_deadline_at.not.is.null');

  const result = await clearDeadlines(projectIds);
  console.log(`✅ Đã xóa deadline: ${result.projects} dự án (trước đó ~${before.count || 0} có hạn), ${result.deals} deal CRM`);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
