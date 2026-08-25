/**
 * Seed / auto-nộp Phần II (KQ CRM đúng ngày phiếu) cho NV CRM — thử bảng tổng hợp.
 * Usage:
 *   node scripts/seed-daily-report-auto-close-phucdat.js [YYYY-MM-DD]
 *   DAILY_REPORT_AUTO_CLOSE_COMPANY_IDS=<uuid> node scripts/seed-daily-report-auto-close-phucdat.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { runAutoCloseBatch } = require('../src/helpers/dailyReportAutoSubmit');
const { crmReportTodayYmdVn } = require('../src/helpers/crmReportDateBounds');

const PHUC_DAT = '29677f68-967e-4256-92fd-492bb580e888';

async function main() {
  const reportDate = process.argv[2] || crmReportTodayYmdVn();
  const companyIds = process.env.DAILY_REPORT_AUTO_CLOSE_COMPANY_IDS
    ? null // helper đọc env
    : [PHUC_DAT];

  console.log(`Report date=${reportDate} · auto-nộp Phần II (KQ ngày phiếu)`);
  const summary = await runAutoCloseBatch({
    reportDate,
    companyIds,
    force: true,
    onProgress: (row) => {
      if (row.error) console.warn(`ERR ${row.name}: ${row.error}`);
      else if (row.skipped) console.log(`SKIP ${row.name}`);
      else console.log(`OK ${row.name} [${row.role_key}] filled=${row.auto_filled}`, row);
    },
  });

  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify({
    report_date: summary.report_date,
    result_date: summary.result_date,
    companies: summary.companies,
    ok: summary.ok,
    skipped: summary.skipped,
    errors: summary.errors,
    results: summary.results,
  }, null, 2));
  process.exit(summary.errors ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
