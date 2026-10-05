/**
 * Xóa 2 đơn Cửa Phúc Đạt trên Kanban SX (Minh):
 *   TB-2026-767 Anh Tám  / DEAL-2026-1401
 *   TB-2026-337 Anh Hường / DEAL-2026-440
 * Giữ nguyên bản xưởng khác (HCB / Metalla / VPT).
 *
 *   node scripts/delete-phucdat-minh-two-orders.js
 *   node scripts/delete-phucdat-minh-two-orders.js --apply
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { supabase } = require('../src/config/supabase');
const { snapshotProject, snapshotCrmLead } = require('../src/helpers/trashSnapshot');
const { hardDeleteProductionProject } = require('../src/helpers/deleteExclusiveProjectsForLeads');

const PHUC_DAT = '29677f68-967e-4256-92fd-492bb580e888';
const ADMIN_ID = '0db73a17-8ac2-4aaa-b2a8-c8f90360d77e';
const APPLY = process.argv.includes('--apply');
const REASON = 'Xóa đơn Cửa Phúc Đạt (Minh) — không đụng xưởng khác';

const TARGETS = [
  {
    projectId: '7955c600-23d5-4e11-a462-00fea010866d',
    projectCode: 'TB-2026-767',
    dealId: '126cda84-8799-4b51-bd6a-a2b137e12654',
    dealCode: 'DEAL-2026-1401',
  },
  {
    projectId: 'c5bd4cd4-6d04-413b-bb3d-31e09b796bc7',
    projectCode: 'TB-2026-337',
    dealId: 'e699e83e-20d6-45eb-9fc1-e8b340310991',
    dealCode: 'DEAL-2026-440',
  },
];

const KEEP_PROJECT_CODES = [
  'TB-2026-740',
  'TB-2026-754',
  'TB-2026-755',
  'TB-2026-764',
  'TB-2026-765',
  'TB-2026-827',
];

const KEEP_DEAL_CODES = [
  'LEAD-2026-1252',
  'DEAL-2026-1398',
  'DEAL-2026-1399',
  'DEAL-2026-1511',
];

async function loadRow(table, id, cols) {
  const { data, error } = await supabase.from(table).select(cols).eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

async function deleteDealChildren(dealId) {
  const steps = [
    ['crm_assignments', 'lead_id'],
    ['crm_lead_comments', 'lead_id'],
    ['lead_members', 'lead_id'],
    ['crm_tasks', 'lead_id'],
    ['unified_task_history', 'lead_id'],
    ['crm_lead_stage_history', 'lead_id'],
    ['crm_kpi_ledger', 'lead_id'],
    ['crm_deal_projects', 'deal_id'],
  ];
  for (const [table, col] of steps) {
    const { error } = await supabase.from(table).delete().eq(col, dealId);
    if (error && !new RegExp(table, 'i').test(error.message || '')) throw error;
  }
}

async function assertKeepAlive() {
  const { data: projects, error: pErr } = await supabase
    .from('projects')
    .select('id, code, status, company_id')
    .in('code', KEEP_PROJECT_CODES);
  if (pErr) throw pErr;
  const foundP = new Set((projects || []).map((r) => r.code));
  const missingP = KEEP_PROJECT_CODES.filter((c) => !foundP.has(c));
  if (missingP.length) throw new Error(`Thiếu dự án xưởng khác trước khi xóa: ${missingP.join(', ')}`);

  const { data: deals, error: dErr } = await supabase
    .from('crm_leads')
    .select('id, code, project_id')
    .in('code', KEEP_DEAL_CODES);
  if (dErr) throw dErr;
  const foundD = new Set((deals || []).map((r) => r.code));
  const missingD = KEEP_DEAL_CODES.filter((c) => !foundD.has(c));
  if (missingD.length) throw new Error(`Thiếu deal xưởng khác trước khi xóa: ${missingD.join(', ')}`);
  return { projects, deals };
}

async function main() {
  const preview = [];
  for (const t of TARGETS) {
    const project = await loadRow('projects', t.projectId, 'id, code, name, status, company_id, workshop_type_id');
    const deal = await loadRow('crm_leads', t.dealId, 'id, code, title, company_id, project_id, type');
    if (!project) throw new Error(`Không thấy ${t.projectCode}`);
    if (String(project.company_id) !== PHUC_DAT) {
      throw new Error(`${t.projectCode} không thuộc Phúc Đạt — dừng`);
    }
    if (project.code !== t.projectCode) throw new Error(`Mã dự án lệch: ${project.code}`);
    if (deal && String(deal.company_id) !== PHUC_DAT) {
      throw new Error(`${t.dealCode} không thuộc Phúc Đạt — dừng`);
    }
    if (deal && deal.project_id && String(deal.project_id) !== t.projectId) {
      throw new Error(`${t.dealCode} đang gắn project khác ${deal.project_id}`);
    }
    preview.push({
      project: { code: project.code, name: project.name, status: project.status },
      deal: deal ? { code: deal.code, title: deal.title } : null,
    });
  }

  const keepBefore = await assertKeepAlive();
  console.log(JSON.stringify({ apply: APPLY, preview, keep_count: keepBefore.projects.length }, null, 2));
  if (!APPLY) {
    console.log('Dry-run. Chạy lại với --apply để xóa.');
    return;
  }

  const rollback = { targets: [], keep_before: keepBefore };
  for (const t of TARGETS) {
    const project = await loadRow('projects', t.projectId, '*');
    const deal = await loadRow('crm_leads', t.dealId, '*');
    rollback.targets.push({ project, deal });
  }
  const rollbackPath = path.join(
    __dirname,
    '..',
    'uploads',
    `_delete_phucdat_minh_two_orders_${Date.now()}.json`,
  );
  fs.writeFileSync(rollbackPath, JSON.stringify(rollback, null, 2));
  console.log('Rollback file:', rollbackPath);

  for (const t of TARGETS) {
    const pSnap = await snapshotProject(supabase, t.projectId, ADMIN_ID, { delete_reason: REASON });
    console.log('project trash', t.projectCode, pSnap);
    if (t.dealId) {
      const dSnap = await snapshotCrmLead(supabase, t.dealId, ADMIN_ID, { delete_reason: REASON });
      console.log('deal trash', t.dealCode, dSnap);
    }

    await deleteDealChildren(t.dealId);
    const delProj = await hardDeleteProductionProject(supabase, t.projectId);
    if (!delProj.ok) throw new Error(`Xóa ${t.projectCode} thất bại: ${delProj.error}`);

    const { error: delDealErr } = await supabase.from('crm_leads').delete().eq('id', t.dealId);
    if (delDealErr) throw delDealErr;
    console.log('Đã xóa', t.projectCode, t.dealCode);
  }

  const keepAfter = await assertKeepAlive();
  const gone = [];
  for (const t of TARGETS) {
    const p = await loadRow('projects', t.projectId, 'id');
    const d = await loadRow('crm_leads', t.dealId, 'id');
    gone.push({ project: t.projectCode, projectGone: !p, deal: t.dealCode, dealGone: !d });
  }
  console.log(JSON.stringify({
    gone,
    kept_projects: keepAfter.projects.map((r) => r.code),
    kept_deals: keepAfter.deals.map((r) => r.code),
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
