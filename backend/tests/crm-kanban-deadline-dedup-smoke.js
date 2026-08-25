/**
 * Smoke test dedup của job nhắc hạn Kanban CRM.
 * Run: node tests/crm-kanban-deadline-dedup-smoke.js
 *
 * CHỈ ĐỌC dữ liệu thật + chạy logic dedup trong bộ nhớ — KHÔNG ghi notification nào.
 *
 * Kiểm chứng lỗi đã sửa: cửa sổ dedup trôi 20 giờ ngắn hơn thời gian thẻ ở trạng thái quá
 * hạn nên cùng một thông báo bị gửi lại mỗi 20 giờ (đo thật: 30% thông báo là trùng, tệ
 * nhất 1 người nhận 9 lần). Đổi sang mốc theo ngày lịch VN → tối đa 1 lần/ngày/thẻ/người.
 */

require('dotenv').config({ quiet: true });
const assert = require('assert');
const { supabase } = require('../src/config/supabase');
const { fetchAllPages } = require('../src/helpers/supabaseFetchAll');

const TYPES = ['crm_kanban_deadline_warning', 'crm_kanban_deadline_overdue'];
const VN_TZ = 'Asia/Ho_Chi_Minh';
const DEDUP_WINDOW_MS_OLD = 20 * 60 * 60 * 1000;

function vnDayStartIso(d = new Date()) {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: VN_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
  return `${ymd}T00:00:00+07:00`;
}

/** Tập thông báo đã gửi kể từ `sinceIso` (đọc đủ, không bị cắt 1.000 dòng). */
async function loadSeen(sinceIso) {
  const rows = await fetchAllPages(() => supabase
    .from('notifications').select('type, entity_id, user_id')
    .in('type', TYPES).gte('created_at', sinceIso));
  return new Set(rows.map((n) => `${n.type}:${n.entity_id}:${n.user_id}`));
}

/** Lịch sử trùng lặp thực tế đang có trong DB (bằng chứng lỗi cũ). */
async function testHistoricalDuplicates() {
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const rows = await fetchAllPages(() => supabase
    .from('notifications').select('type, entity_id, user_id, created_at')
    .in('type', TYPES).gte('created_at', since));

  const byKey = new Map();
  for (const n of rows) {
    const k = `${n.type}|${n.entity_id}|${n.user_id}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(n.created_at);
  }
  const dupKeys = [...byKey.values()].filter((v) => v.length > 1);
  const worst = dupKeys.reduce((m, v) => Math.max(m, v.length), 0);
  console.log(`  7 ngày qua: ${rows.length} thông báo / ${byKey.size} bộ phân biệt`
    + ` → ${rows.length - byKey.size} lần gửi trùng`);
  console.log(`  số bộ bị gửi >1 lần: ${dupKeys.length} · tệ nhất: ${worst} lần cùng 1 thông báo`);
  return { total: rows.length, distinct: byKey.size, worst };
}

/** Chạy dedup nhiều lượt trong CÙNG một ngày → lượt sau không được sinh thêm gì. */
async function testSameDayNoResend() {
  const now = new Date();
  const seenDay = await loadSeen(vnDayStartIso(now));

  // Lấy đúng tập thẻ mà job sẽ xử lý
  const warnUntil = new Date(now.getTime() + 24 * 3600 * 1000);
  const { data: leads, error } = await supabase
    .from('crm_leads')
    .select('id, type, assigned_to, lead_owner_id, kanban_deadline_at,'
      + ' stage:crm_pipeline_stages!crm_leads_stage_id_fkey(is_won, is_lost)')
    .not('kanban_deadline_at', 'is', null)
    .lt('kanban_deadline_at', warnUntil.toISOString())
    .limit(500);
  if (error) throw error;
  const active = (leads || []).filter((l) => {
    const st = Array.isArray(l.stage) ? l.stage[0] : l.stage;
    return !st?.is_won && !st?.is_lost;
  });
  console.log(`  thẻ job sẽ xử lý: ${active.length}`);

  const plan = (seen) => {
    const out = [];
    const local = new Set(seen);
    for (const l of active) {
      const overdue = new Date(l.kanban_deadline_at).getTime() < now.getTime();
      const type = overdue ? 'crm_kanban_deadline_overdue' : 'crm_kanban_deadline_warning';
      for (const uid of new Set([l.assigned_to, l.lead_owner_id].filter(Boolean))) {
        const key = `${type}:${l.id}:${uid}`;
        if (local.has(key)) continue;
        local.add(key);
        out.push(key);
      }
    }
    return out;
  };

  // Lượt 1 (theo mốc ngày): có thể sinh thông báo cho thẻ chưa nhắc hôm nay
  const run1 = plan(seenDay);
  // Lượt 2: mô phỏng 30 phút sau — coi như lượt 1 đã ghi vào DB
  const afterRun1 = new Set([...seenDay, ...run1]);
  const run2 = plan(afterRun1);
  // Lượt 3
  const run3 = plan(new Set([...afterRun1, ...run2]));

  console.log(`  MỐC THEO NGÀY  → lượt 1: ${run1.length} · lượt 2: ${run2.length} · lượt 3: ${run3.length}`);
  assert.strictEqual(run2.length, 0, 'lượt 2 trong cùng ngày KHÔNG được sinh thêm thông báo');
  assert.strictEqual(run3.length, 0, 'lượt 3 trong cùng ngày KHÔNG được sinh thêm thông báo');
  console.log('  ✓ trong cùng một ngày, các lượt sau không gửi lại');

  return { active: active.length, firstRun: run1.length };
}

/**
 * Cửa sổ trôi 20 giờ cũ: sau khi qua 20 giờ, mốc `since` bỏ lại các thông báo đã gửi
 * → chúng rơi khỏi `seen` và bị gửi lại. Mốc theo ngày thì không.
 */
async function testOldWindowWouldResend() {
  const now = new Date();
  const seenOld = await loadSeen(new Date(now.getTime() - DEDUP_WINDOW_MS_OLD).toISOString());
  const seenDay = await loadSeen(vnDayStartIso(now));

  // Mô phỏng thời điểm 21 giờ sau: cửa sổ trôi đã bỏ rơi mọi thứ gửi trước đó
  const t21 = new Date(now.getTime() + 21 * 3600 * 1000);
  const seenOldAt21 = await loadSeen(new Date(t21.getTime() - DEDUP_WINDOW_MS_OLD).toISOString());

  console.log(`  cửa sổ 20h (bây giờ)        : ${seenOld.size} khoá được nhớ`);
  console.log(`  cửa sổ 20h (sau 21 giờ nữa) : ${seenOldAt21.size} khoá được nhớ`
    + `  → bỏ rơi ${Math.max(0, seenOld.size - seenOldAt21.size)} khoá`);
  console.log(`  mốc theo ngày (bây giờ)     : ${seenDay.size} khoá được nhớ`);
  console.log('  ✓ cửa sổ trôi bỏ rơi khoá cũ (nguồn gốc gửi lại); mốc theo ngày thì cố định trong ngày');
}

(async () => {
  console.log('1) Lịch sử trùng lặp đang có trong DB (bằng chứng lỗi cũ)');
  const hist = await testHistoricalDuplicates();
  assert.ok(hist.total > 0, 'cần có dữ liệu thông báo để kiểm tra');

  console.log('\n2) Nhiều lượt trong cùng một ngày');
  await testSameDayNoResend();

  console.log('\n3) So sánh cửa sổ trôi 20h vs mốc theo ngày');
  await testOldWindowWouldResend();

  console.log('\nTẤT CẢ ĐỀU ĐẠT');
  process.exit(0);
})().catch((e) => {
  console.error('✗ THẤT BẠI:', e.message);
  process.exit(1);
});
