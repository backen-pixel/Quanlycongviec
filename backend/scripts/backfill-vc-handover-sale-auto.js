/**
 * One-shot: tự xác nhận Sale trên thẻ bàn giao VC/LĐ đang awaiting_company
 * khi dự án đã có công ty VC + ngày (cùng logic autoApplyCrmPlanSelect).
 *
 * Không chạy production trừ khi được yêu cầu rõ — script ghi DB (comment + bàn giao).
 *
 * Usage (local/staging):
 *   node scripts/backfill-vc-handover-sale-auto.js          # chỉ liệt kê, không ghi
 *   node scripts/backfill-vc-handover-sale-auto.js --apply  # ghi
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { supabase } = require('../src/config/supabase');
const { autoApplyCrmPlanSelect } = require('../src/routes/vcHandover');

const COMMENT_SELECT =
  'id, lead_id, user_id, parent_id, body, attachments, comment_type, metadata, created_at, updated_at, ' +
  'user:users!crm_lead_comments_user_id_fkey(id,full_name,avatar)';

function makeReq(userId) {
  return {
    user: { userId, id: userId, role: 'admin' },
    app: { get: () => null },
  };
}

async function loadOpenHandovers() {
  const { data, error } = await supabase
    .from('crm_lead_comments')
    .select(COMMENT_SELECT)
    .eq('comment_type', 'vc_handover')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).filter((c) => (c.metadata?.state || 'awaiting_company') === 'awaiting_company');
}

async function markSuperseded(comment, keptId) {
  const meta = {
    ...(comment.metadata || {}),
    state: 'done',
    skipped_duplicate: true,
    superseded_by_comment_id: keptId,
  };
  const { error } = await supabase
    .from('crm_lead_comments')
    .update({
      metadata: meta,
      body: `${String(comment.body || '').split('\n')[0]}\n— Đã gộp: dùng thẻ bàn giao #${keptId}.`,
      updated_at: new Date().toISOString(),
    })
    .eq('id', comment.id);
  if (error) throw error;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const rows = await loadOpenHandovers();
  console.log(`Pending Sale confirm: ${rows.length}${apply ? '' : ' (dry-run, pass --apply to write)'}`);
  if (!apply) {
    for (const row of rows) {
      console.log(`  #${row.id} project=${String(row.metadata?.project_id || '').slice(0, 8) || 'none'} state=${row.metadata?.state || 'awaiting_company'}`);
    }
    return;
  }

  const byProject = new Map();
  const noProject = [];
  for (const row of rows) {
    const pid = row.metadata?.project_id ? String(row.metadata.project_id) : '';
    if (!pid) {
      noProject.push(row);
      continue;
    }
    if (!byProject.has(pid)) byProject.set(pid, []);
    byProject.get(pid).push(row);
  }

  let applied = 0;
  let skipped = 0;
  let dup = 0;
  let failed = 0;
  const skipReasons = {};

  for (const [projectId, list] of byProject) {
    const [latest, ...older] = list;
    for (const extra of older) {
      try {
        await markSuperseded(extra, latest.id);
        dup += 1;
        console.log(`  dup #${extra.id} → keep #${latest.id} project=${projectId.slice(0, 8)}`);
      } catch (e) {
        failed += 1;
        console.warn(`  dup fail #${extra.id}:`, e.message);
      }
    }

    const crmId = latest.metadata?.crm_responsible_user_id
      || (Array.isArray(latest.metadata?.sale_user_ids) ? latest.metadata.sale_user_ids[0] : null);
    const req = makeReq(crmId || latest.user_id);
    try {
      const out = await autoApplyCrmPlanSelect(req, latest, { allowTodayFallback: true });
      if (out.applied) {
        applied += 1;
        console.log(`  OK #${latest.id} project=${projectId.slice(0, 8)}`);
      } else {
        skipped += 1;
        const reason = out.reason || 'unknown';
        skipReasons[reason] = (skipReasons[reason] || 0) + 1;
        console.log(`  skip #${latest.id} ${reason} project=${projectId.slice(0, 8)}`);
      }
    } catch (e) {
      failed += 1;
      console.warn(`  FAIL #${latest.id}:`, e.message);
    }
  }

  for (const row of noProject) {
    skipped += 1;
    skipReasons.no_project = (skipReasons.no_project || 0) + 1;
    console.log(`  skip #${row.id} no_project`);
  }

  console.log('\nDone', { applied, skipped, duplicates_closed: dup, failed, skipReasons });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
