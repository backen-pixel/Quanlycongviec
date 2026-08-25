/**
 * Seed snapshot báo cáo ngày (Pha 2) cho Phúc Đạt / VPT.
 * Usage:
 *   node scripts/seed-daily-report-auto-close-phucdat.js [YYYY-MM-DD] [plan|result]
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { runSnapshotBatch } = require('../src/helpers/dailyReportSnapshot');
const { crmReportTodayYmdVn } = require('../src/helpers/crmReportDateBounds');

const PHUC_DAT = '29677f68-967e-4256-92fd-492bb580e888';
const VPT = '991dc79d-cbf5-49f9-a364-35227cb47635';

async function main() {
  const reportDate = process.argv[2] || crmReportTodayYmdVn();
  const phase = process.argv[3] === 'plan' ? 'plan' : 'result';
  const companyIds = process.env.DAILY_REPORT_AUTO_CLOSE_COMPANY_IDS
    ? null
    : [PHUC_DAT, VPT];

  console.log(`Snapshot ${phase} · date=${reportDate}`);
  const summary = await runSnapshotBatch({
    reportDate,
    companyIds,
    phase,
    onProgress: (row) => {
      if (row.error) console.warn(`ERR ${row.name}: ${row.error}`);
      else console.log(`OK ${row.name} [${row.role_key}] filled=${row.auto_filled}`);
    },
  });

  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify({
    report_date: summary.report_date,
    phase: summary.phase,
    companies: summary.companies,
    ok: summary.ok,
    skipped: summary.skipped,
    errors: summary.errors,
  }, null, 2));
  process.exit(summary.errors ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
