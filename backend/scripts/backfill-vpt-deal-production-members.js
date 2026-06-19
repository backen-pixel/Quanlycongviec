/**
 * Backfill: thêm kế toán VPT vào tab Thành viên mọi deal Vạn Phú Thành đã có project (đang/đã qua SX).
 * Chạy: node scripts/backfill-vpt-deal-production-members.js
 * Xem trước: node scripts/backfill-vpt-deal-production-members.js --dry-run
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { supabase } = require('../src/config/supabase');
const {
  resolveVptCompanyId,
  ensureDealProductionAutoParticipants,
  resolveConfiguredProductionParticipantUserIds,
} = require('../src/helpers/dealParticipantProduction');

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const vptId = await resolveVptCompanyId();
  if (!vptId) throw new Error('Không tìm thấy công ty Vạn Phú Thành');

  const participantIds = await resolveConfiguredProductionParticipantUserIds();
  if (!participantIds.length) throw new Error('Không tìm thấy tài khoản kế toán VPT đã cấu hình');

  console.log(`Công ty VPT: ${vptId}`);
  console.log(`Thành viên tự thêm: ${participantIds.length} user`);
  if (dryRun) console.log('(dry-run — không ghi DB)');

  const { data: deals, error } = await supabase
    .from('crm_leads')
    .select('id, code, title, project_id')
    .eq('type', 'deal')
    .eq('company_id', vptId)
    .not('project_id', 'is', null)
    .order('updated_at', { ascending: false });
  if (error) throw error;

  console.log(`Deal VPT có project: ${(deals || []).length}`);

  let addedTotal = 0;
  for (const deal of deals || []) {
    if (dryRun) {
      const { data: existing } = await supabase
        .from('lead_members')
        .select('user_id')
        .eq('lead_id', deal.id);
      const have = new Set((existing || []).map((r) => String(r.user_id)));
      const missing = participantIds.filter((id) => !have.has(String(id)));
      if (missing.length) {
        console.log(`  [dry-run] ${deal.code || deal.id} — sẽ thêm ${missing.length} thành viên`);
        addedTotal += missing.length;
      }
      continue;
    }
    const r = await ensureDealProductionAutoParticipants({
      dealId: deal.id,
      dealCompanyId: vptId,
    });
    if (r.added) {
      console.log(`  + ${deal.code || deal.id}: thêm ${r.added} thành viên`);
      addedTotal += r.added;
    }
  }

  console.log(`\nXong. Tổng thành viên mới: ${addedTotal}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
