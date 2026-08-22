/**
 * Backfill projects.current_stage_id từ cột module SX/VC (hoặc status legacy).
 *
 * Ưu tiên: vc_kanban_column_id.workflow_stage_id
 *       → sx_kanban_column_id.workflow_stage_id (nếu chưa VC)
 *       → map projects.status → slug Dashboard 543
 *
 * Usage:
 *   node scripts/backfill-project-delivery-from-module.js
 *   node scripts/backfill-project-delivery-from-module.js --apply
 *   node scripts/backfill-project-delivery-from-module.js --apply --limit=200
 */
require('dotenv').config();
const { supabase } = require('../src/config/supabase');
const {
  loadWorkflowStageBySlug,
  resolveWorkflowStageIdFromPipelineColumn,
  DELIVERY_SLUG_STATUS,
} = require('../src/helpers/syncProjectDeliveryStage');

const APPLY = process.argv.includes('--apply');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Math.max(1, Number(limitArg.split('=')[1]) || 500) : 500;

const STATUS_TO_SLUG = {
  consulting: 'order',
  designing: 'design',
  quoting: 'design',
  contract_signed: 'order',
  producing: 'production',
  shipping: 'delivery',
  installing: 'installation',
  completed: 'acceptance',
  warranty: 'warranty',
  on_hold: 'order',
  new: 'order',
};

async function main() {
  console.log(APPLY ? 'MODE: APPLY' : 'MODE: dry-run (thêm --apply để ghi)');

  let q = supabase
    .from('projects')
    .select('id, code, status, current_stage_id, company_id, logistics_company_id, sx_kanban_column_id, vc_kanban_column_id')
    .order('updated_at', { ascending: false })
    .limit(LIMIT);
  const { data: projects, error } = await q;
  if (error) {
    console.error(error);
    process.exit(1);
  }

  let changed = 0;
  let skipped = 0;
  let failed = 0;

  for (const p of projects || []) {
    let targetStageId = null;
    let source = null;

    if (p.vc_kanban_column_id) {
      const { data: vc } = await supabase
        .from('logistics_pipeline_stages')
        .select('id, name, bucket_slug, crm_sync_type, workflow_stage_id')
        .eq('id', p.vc_kanban_column_id)
        .maybeSingle();
      if (vc) {
        targetStageId = vc.workflow_stage_id || await resolveWorkflowStageIdFromPipelineColumn(vc);
        source = 'vc';
      }
    }

    if (!targetStageId && p.sx_kanban_column_id && !p.vc_kanban_column_id && !p.logistics_company_id) {
      const { data: sx } = await supabase
        .from('production_pipeline_stages')
        .select('id, name, bucket_slug, crm_sync_type, workflow_stage_id')
        .eq('id', p.sx_kanban_column_id)
        .maybeSingle();
      if (sx) {
        targetStageId = sx.workflow_stage_id || await resolveWorkflowStageIdFromPipelineColumn(sx);
        source = 'sx';
      }
    }

    if (!targetStageId) {
      const slug = STATUS_TO_SLUG[String(p.status || '').toLowerCase()];
      if (slug) {
        const st = await loadWorkflowStageBySlug(slug);
        targetStageId = st?.id || null;
        source = `status:${p.status}→${slug}`;
      }
    }

    if (!targetStageId) {
      skipped += 1;
      continue;
    }
    if (String(p.current_stage_id || '') === String(targetStageId)) {
      skipped += 1;
      continue;
    }

    const { data: st } = await supabase
      .from('workflow_stages')
      .select('slug')
      .eq('id', targetStageId)
      .maybeSingle();
    const status = DELIVERY_SLUG_STATUS[String(st?.slug || '').toLowerCase()] || null;

    console.log(
      `${p.code || p.id}: current=${p.current_stage_id || 'null'} → ${targetStageId} (${source})`
      + (status ? ` status=${status}` : ''),
    );

    if (APPLY) {
      const patch = {
        current_stage_id: targetStageId,
        updated_at: new Date().toISOString(),
      };
      if (status) patch.status = status;
      const { error: upErr } = await supabase.from('projects').update(patch).eq('id', p.id);
      if (upErr) {
        console.warn('  FAIL', upErr.message);
        failed += 1;
      } else {
        changed += 1;
      }
    } else {
      changed += 1;
    }
  }

  console.log(`\nDone. would_change/changed=${changed} skipped=${skipped} failed=${failed} scanned=${(projects || []).length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
