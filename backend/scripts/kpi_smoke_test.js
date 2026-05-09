/**
 * Smoke test KPI sau khi đã chạy migration 145-148 và seed 149.
 *
 *   $ node backend/scripts/kpi_smoke_test.js [USER_ID]
 *
 * Nếu không truyền USER_ID, script tự động tìm user có lead `KPI-TEST-*`.
 *
 * Output: 15 KPI với actual / target / điểm + kỳ vọng từ seed.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { supabase } = require('../src/config/supabase');
const { computeAndStoreForUser } = require('../src/services/kpiCalculator');

const EXPECTED = {
  // Theo seed 149: 10 lead, 1 đúng SLA (#1), 5 có first_touch (1,2,4,5,6), 1 đã ký HD (#9 750M),
  // 1 lost (#10), 2 transition tới quoted (#8,9 và #10), 1 transition quoted->signed (#9)
  hint: {
    total_leads_in_period: 10,
    leads_with_first_touch: 6, // #1,2,4,5,6,7,8,9,10 (only #3 chưa cham)
    leads_within_15min_sla: 1, // #1
    contract_signed_count: 1, // #9
    revenue_signed: 750_000_000,
    quote_to_contract: '1/2 = 50%', // #9 ký, #10 lost
  },
};

function fmt(v) {
  if (v == null) return '—';
  if (typeof v === 'number') return Math.round(v * 100) / 100;
  return v;
}

async function findOwner() {
  if (process.argv[2]) return process.argv[2];
  const { data } = await supabase
    .from('crm_leads').select('lead_owner_id').like('code', 'KPI-TEST-%').limit(1).maybeSingle();
  return data?.lead_owner_id || null;
}

async function main() {
  const ownerId = await findOwner();
  if (!ownerId) {
    console.error('❌ Không tìm thấy lead KPI-TEST-*. Chạy `psql -f database/149_seed_kpi_test_leads.sql` trước.');
    process.exit(1);
  }

  const today = new Date();
  const periodStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)).toISOString().slice(0, 10);

  console.log('═══════════════════════════════════════════════════════════');
  console.log(`KPI smoke test — owner=${ownerId}, period=${periodStart}`);
  console.log('═══════════════════════════════════════════════════════════');

  const result = await computeAndStoreForUser({
    userId: ownerId,
    companyId: null,
    periodType: 'monthly',
    periodStart,
  });

  console.log('\n📊 Tổng điểm:', result.total_final, '/ 100',
    result.gating_triggered ? `(GATING ${result.gating_kpi}: cap 70)` : '');
  console.log('\nMã   Tên KPI                                         Actual         Target      Điểm');
  console.log('─'.repeat(95));
  for (const s of result.scores) {
    const code = s.kpi_code.padEnd(4);
    const name = (s.kpi_name || '').slice(0, 45).padEnd(46);
    const actual = String(fmt(s.actual_value)).padStart(12);
    const target = String(fmt(s.target_value)).padStart(12);
    const score = String(fmt(s.capped_score)).padStart(8);
    console.log(`${code} ${name} ${actual}  ${target}  ${score}`);
  }

  console.log('\n📋 Kỳ vọng (theo seed 149):');
  console.log(JSON.stringify(EXPECTED.hint, null, 2));

  console.log('\n✅ Smoke test xong. Đối chiếu thủ công Actual vs Kỳ vọng để verify.');
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ Smoke test lỗi:', e);
  process.exit(1);
});
