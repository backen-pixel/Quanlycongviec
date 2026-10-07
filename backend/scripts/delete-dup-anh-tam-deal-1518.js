/**
 * DEAL-2026-1518 (Metalla, Minh tạo hôm nay) trùng deal Anh Tám của Nghĩa.
 * Xóa bản trùng, giữ LEAD-2026-1252 (Vạn Phú Thành).
 *
 *   node scripts/delete-dup-anh-tam-deal-1518.js --apply
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { supabase } = require('../src/config/supabase');
const { snapshotCrmLead } = require('../src/helpers/trashSnapshot');

const DUP_DEAL_ID = '68fe2ffc-2889-44e2-8fa5-060c8dc7fe8f'; // DEAL-2026-1518
const KEEP_DEAL_ID = 'c246b59d-0184-455e-8463-e93e8f994654'; // LEAD-2026-1252 Nghĩa
const ADMIN_ID = '0db73a17-8ac2-4aaa-b2a8-c8f90360d77e';
const APPLY = process.argv.includes('--apply');

async function main() {
  const { data: keep } = await supabase
    .from('crm_leads')
    .select('id, code, title, company_id, assigned_to, project_id')
    .eq('id', KEEP_DEAL_ID)
    .maybeSingle();
  if (!keep) throw new Error('Không thấy deal Nghĩa LEAD-2026-1252');

  const { data: dup } = await supabase
    .from('crm_leads')
    .select('id, code, title, company_id, project_id, created_by, created_at')
    .eq('id', DUP_DEAL_ID)
    .maybeSingle();
  if (!dup) {
    console.log('DEAL-2026-1518 đã không còn. Deal Nghĩa:', keep.code);
    return;
  }
  if (dup.project_id) throw new Error('Deal trùng đang gắn project — dừng, không xóa mù');

  const { data: owner } = await supabase
    .from('users')
    .select('full_name')
    .eq('id', keep.assigned_to)
    .maybeSingle();

  console.log(JSON.stringify({
    apply: APPLY,
    keep: { code: keep.code, title: keep.title, assigned: owner?.full_name },
    delete: { code: dup.code, title: dup.title, created_at: dup.created_at },
  }, null, 2));

  if (!APPLY) {
    console.log('Dry-run. Chạy lại với --apply để xóa.');
    return;
  }

  const extra = {};
  for (const [key, table, col] of [
    ['assignments', 'crm_assignments', 'lead_id'],
    ['unified_task_history', 'unified_task_history', 'lead_id'],
    ['comments', 'crm_lead_comments', 'lead_id'],
    ['members', 'lead_members', 'lead_id'],
    ['tasks', 'crm_tasks', 'lead_id'],
    ['stage_history', 'crm_lead_stage_history', 'lead_id'],
    ['kpi', 'crm_kpi_ledger', 'lead_id'],
  ]) {
    const { data, error } = await supabase.from(table).select('*').eq(col, DUP_DEAL_ID);
    if (error) throw error;
    extra[key] = data || [];
  }

  const rollbackPath = path.join(
    __dirname,
    '..',
    'uploads',
    `_delete_deal_1518_rollback_${Date.now()}.json`,
  );
  fs.writeFileSync(rollbackPath, JSON.stringify({ lead: dup, extra }, null, 2));
  console.log('Rollback file:', rollbackPath);

  const snap = await snapshotCrmLead(supabase, DUP_DEAL_ID, ADMIN_ID, {
    delete_reason: 'Trùng deal Anh Tám của Huỳnh Văn Nghĩa (LEAD-2026-1252). Xóa DEAL-2026-1518 Minh tạo trên Metalla.',
  });
  console.log('trash snapshot:', snap);

  // Xóa con trước: CASCADE crm_tasks khi xóa lead sẽ trigger ghi history
  // lúc lead đã mất → FK 23503. Xóa việc/bình luận khi lead còn, rồi dọn history.
  const { error: asgErr } = await supabase.from('crm_assignments').delete().eq('lead_id', DUP_DEAL_ID);
  if (asgErr) throw asgErr;
  const { error: cmtErr } = await supabase.from('crm_lead_comments').delete().eq('lead_id', DUP_DEAL_ID);
  if (cmtErr) throw cmtErr;
  const { error: memErr } = await supabase.from('lead_members').delete().eq('lead_id', DUP_DEAL_ID);
  if (memErr) throw memErr;
  const { error: taskErr } = await supabase.from('crm_tasks').delete().eq('lead_id', DUP_DEAL_ID);
  if (taskErr) throw taskErr;
  const { error: histErr } = await supabase.from('unified_task_history').delete().eq('lead_id', DUP_DEAL_ID);
  if (histErr) throw histErr;
  const { error: stErr } = await supabase.from('crm_lead_stage_history').delete().eq('lead_id', DUP_DEAL_ID);
  if (stErr) throw stErr;
  const { error: kpiErr } = await supabase.from('crm_kpi_ledger').delete().eq('lead_id', DUP_DEAL_ID);
  if (kpiErr) throw kpiErr;

  const { error: delErr } = await supabase.from('crm_leads').delete().eq('id', DUP_DEAL_ID);
  if (delErr) throw delErr;

  const { data: gone } = await supabase.from('crm_leads').select('id').eq('id', DUP_DEAL_ID).maybeSingle();
  const { data: still } = await supabase
    .from('crm_leads')
    .select('id, code, title')
    .eq('id', KEEP_DEAL_ID)
    .maybeSingle();

  console.log(JSON.stringify({
    deleted: !gone,
    kept: still,
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
