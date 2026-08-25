/**
 * Nạp phiếu báo cáo ngày 01→18/08/2026 cho 4 tài khoản Sale Admin Vạn Phú Thành
 * từ số CRM live (kèm comment chăm lead).
 * Usage: node scripts/backfill-vpt-sale-admin-aug.js
 */
require('dotenv').config();
const { snapshotUser } = require('../src/helpers/dailyReportSnapshot');

const COMPANY_ID = '991dc79d-cbf5-49f9-a364-35227cb47635';
const SALE_ADMIN_TPL = 'a1000000-0000-4000-8000-000000000001';
const USERS = [
  ['934c6eb9-3367-427b-9b8f-88bb23d393a5', 'ADMIN CAN THO'],
  ['49fcd3ff-0d7c-4d54-8f5a-1068bd10d68c', 'Admin Van Phu Thanh'],
  ['8f9d05dd-2f83-4422-9022-430a7cec9029', 'CSKH Thu'],
  ['2a4f2392-a286-441f-b726-1954a0888253', 'Huong Sale Admin Q2'],
];

function datesInRange(from, to) {
  const out = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    const [y, m, d] = cur.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + 1));
    cur = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
  }
  return out;
}

async function main() {
  const dates = datesInRange('2026-08-01', '2026-08-18');
  let ok = 0;
  let fail = 0;
  for (const [userId, label] of USERS) {
    for (const reportDate of dates) {
      try {
        const plan = await snapshotUser({
          userId,
          reportDate,
          companyId: COMPANY_ID,
          userProfile: { id: userId, full_name: label },
          phase: 'plan',
        });
        const out = await snapshotUser({
          userId,
          reportDate,
          companyId: COMPANY_ID,
          userProfile: { id: userId, full_name: label },
          phase: 'result',
        });
        console.log(`${label} ${reportDate} → plan=${plan.auto_filled} result=${out.auto_filled}`);
        ok += 1;
      } catch (e) {
        fail += 1;
        console.log(`${label} ${reportDate} → LOI: ${e.message || e}`);
      }
    }
  }
  console.log(`\nXong: ${ok} phiếu, ${fail} lỗi`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
