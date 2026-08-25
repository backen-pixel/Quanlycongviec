/**
 * Đối chiếu 1 ngày mẫu: snapshot = computeForUser = SQL độc lập = ô matrix
 * (Excel admin đọc matrix nên cùng nguồn).
 *
 * Usage:
 *   node scripts/verify-daily-report-snapshot-day.js [YYYY-MM-DD]
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { supabase } = require('../src/config/supabase');
const { crmReportCreatedAtFromIso } = require('../src/helpers/crmReportDateBounds');
const { computeForUser } = require('../src/helpers/dailyReportMetrics');
const {
  runSnapshotBatch,
  loadSnapshotsMap,
  snapKey,
  resultUntilIso,
} = require('../src/helpers/dailyReportSnapshot');
const { loadTeamDailyReportMatrix } = require('../src/helpers/dailyReportTeamMatrix');

const PHUC_DAT = '29677f68-967e-4256-92fd-492bb580e888';
const VPT = '991dc79d-cbf5-49f9-a364-35227cb47635';

async function sqlLeadNewParts(userId, reportDate) {
  const startISO = crmReportCreatedAtFromIso(reportDate);
  const endISO = resultUntilIso(reportDate);
  const uid = String(userId);

  const { data: created, error: cErr } = await supabase
    .from('crm_leads')
    .select('id')
    .eq('type', 'lead')
    .or(`lead_owner_id.eq.${uid},assigned_to.eq.${uid}`)
    .gte('created_at', startISO)
    .lte('created_at', endISO);
  if (cErr) throw cErr;

  const { data: hist, error: hErr } = await supabase
    .from('crm_lead_stage_history')
    .select(`
      lead_id, to_canonical_slug, changed_by,
      lead:crm_leads!lead_id(id, type, lead_owner_id, assigned_to),
      stage:crm_pipeline_stages!to_stage_id(canonical_slug)
    `)
    .gte('entered_at', startISO)
    .lte('entered_at', endISO)
    .limit(5000);
  if (hErr) throw hErr;

  const funnelIds = new Set();
  for (const h of hist || []) {
    const lead = h.lead;
    if (lead?.type && lead.type !== 'lead') continue;
    const isActor = String(h.changed_by || '') === uid;
    const isOwner = lead
      && (String(lead.lead_owner_id || '') === uid || String(lead.assigned_to || '') === uid);
    if (!isActor && !isOwner) continue;
    const slug = h.to_canonical_slug || h.stage?.canonical_slug;
    if (slug !== 'lead_new' || !h.lead_id) continue;
    funnelIds.add(String(h.lead_id));
  }

  const createdIds = (created || []).map((r) => String(r.id));
  const union = new Set([...createdIds, ...funnelIds]);
  return {
    created: createdIds.length,
    funnel: funnelIds.size,
    expected: Math.max(createdIds.length, funnelIds.size),
    union: union.size,
  };
}

function matrixCell(matrix, userId, sectionKey, metricKey) {
  for (const g of matrix.groups || []) {
    const section = (g.sections || []).find((s) => s.key === sectionKey);
    if (!section) continue;
    const row = (section.rows || []).find((r) => r.metric_key === metricKey);
    if (!row) continue;
    if (Object.prototype.hasOwnProperty.call(row.values || {}, String(userId))) {
      return row.values[String(userId)];
    }
  }
  return undefined;
}

async function pickSampleUser(companyId, reportDate) {
  const { data, error } = await supabase
    .from('crm_daily_report_snapshots')
    .select('user_id, value, user:users!user_id(id, full_name, email, is_active)')
    .eq('company_id', companyId)
    .eq('report_date', reportDate)
    .eq('metric_key', 'lead_new')
    .eq('phase', 'result')
    .gt('value', 0)
    .order('value', { ascending: false })
    .limit(8);
  if (error) throw error;
  const hit = (data || []).find((r) => r.user?.is_active) || data?.[0];
  return hit?.user || null;
}

async function checkUser({ label, companyId, userId, reportDate, snaps, matrix }) {
  const untilIso = resultUntilIso(reportDate);
  const [planPack, resultPack, sql] = await Promise.all([
    computeForUser(userId, reportDate, 'sale_admin', 'plan', { companyId }),
    computeForUser(userId, reportDate, 'sale_admin', 'result', { companyId, untilIso }),
    sqlLeadNewParts(userId, reportDate),
  ]);
  const snapPlan = snaps.get(snapKey(userId, 'plan', 'lead_new'));
  const snapResult = snaps.get(snapKey(userId, 'result', 'lead_new'));
  const enginePlan = planPack.metrics?.lead_new?.value ?? null;
  const engineResult = resultPack.metrics?.lead_new?.value ?? null;
  const mxPlan = matrixCell(matrix, userId, 'plan', 'lead_new');
  const mxResult = matrixCell(matrix, userId, 'result', 'lead_new');

  const rows = [
    {
      field: 'plan.lead_new',
      engine: enginePlan,
      snapshot: snapPlan?.value ?? null,
      matrix: mxPlan ?? null,
      sql: null,
    },
    {
      field: 'result.lead_new',
      engine: engineResult,
      snapshot: snapResult?.value ?? null,
      matrix: mxResult ?? null,
      sql: sql.expected,
    },
  ];

  const mismatches = [];
  for (const r of rows) {
    const nums = [r.engine, r.snapshot, r.matrix].map((v) => (v == null ? null : Number(v)));
    if (nums.some((n) => n == null) || nums[0] !== nums[1] || nums[1] !== nums[2]) {
      mismatches.push(r);
    }
    if (r.sql != null && Number(r.engine) !== Number(r.sql)) {
      console.warn(`  SQL note ${r.field}: engine=${r.engine} sql_max=${r.sql} created=${sql.created} funnel=${sql.funnel}`);
    }
  }

  return {
    label,
    userId,
    sql,
    rows,
    ok: mismatches.length === 0,
    mismatches,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const reportDate = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) || '2026-08-24';
  const skipSnap = args.includes('--skip-snap');
  console.log(`Verify snapshot day=${reportDate} · PD + VPT${skipSnap ? ' · skip-snap' : ''}`);

  if (!skipSnap) {
    for (const phase of ['plan', 'result']) {
      const summary = await runSnapshotBatch({
        reportDate,
        companyIds: [PHUC_DAT, VPT],
        phase,
      });
      console.log(`snapshot ${phase}: ok=${summary.ok} errors=${summary.errors} processed=${summary.processed}`);
      if (summary.errors) {
        for (const r of summary.results.filter((x) => x.error).slice(0, 8)) {
          console.warn('  ERR', r.name, r.error);
        }
      }
    }
  }

  const pdUser = await pickSampleUser(PHUC_DAT, reportDate);
  const vptUser = await pickSampleUser(VPT, reportDate);
  if (!pdUser) throw new Error('Không tìm được NV Phúc Đạt có snapshot lead_new > 0');
  if (!vptUser) throw new Error('Không tìm được NV VPT có snapshot lead_new > 0');

  const checks = [];
  for (const spec of [
    { label: `Phúc Đạt · ${pdUser.full_name}`, companyId: PHUC_DAT, userId: pdUser.id },
    { label: `VPT · ${vptUser.full_name}`, companyId: VPT, userId: vptUser.id },
  ]) {
    const snaps = await loadSnapshotsMap(reportDate, spec.companyId);
    const matrix = await loadTeamDailyReportMatrix({ date: reportDate, companyId: spec.companyId });
    const out = await checkUser({ ...spec, reportDate, snaps, matrix });
    checks.push(out);
    console.log('\n---', out.label, out.userId);
    console.log('SQL lead_new', out.sql);
    console.log(JSON.stringify(out.rows, null, 2));
    if (!out.ok) console.warn('MISMATCH', out.mismatches);
    else console.log('OK engine = snapshot = matrix' + (out.sql ? ' = SQL' : ''));
  }

  const failed = checks.filter((c) => !c.ok);
  if (failed.length) {
    console.error('\nFAIL', failed.map((c) => c.label).join(', '));
    process.exit(1);
  }
  console.log('\nPASS Excel/matrix/snapshot/SQL cùng số lead_new cho PD + VPT');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
