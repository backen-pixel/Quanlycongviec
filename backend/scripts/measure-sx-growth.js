/**
 * Đo tốc độ phát sinh dự án theo tháng — để biết bao lâu nữa mới cần phân trang theo cột.
 *
 *   node backend/scripts/measure-sx-growth.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Thiếu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY trong backend/.env');
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

/** Trần một trang của mobile — vượt mốc này board mới phải tải nhiều trang. */
const PAGE_LIMIT = 500;

(async () => {
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('projects')
      .select('created_at, company_id')
      .order('created_at', { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`projects: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
    from += 1000;
  }

  const { data: companies } = await supabase.from('companies').select('id, name, short_name');
  const nameOf = new Map((companies || []).map((c) => [c.id, c.short_name || c.name]));

  const byMonth = new Map();
  for (const r of rows) {
    if (!r.created_at) continue;
    const m = String(r.created_at).slice(0, 7);
    byMonth.set(m, (byMonth.get(m) || 0) + 1);
  }
  const months = [...byMonth.keys()].sort();

  console.log('');
  console.log('Dự án tạo mới theo tháng:');
  for (const m of months) {
    const n = byMonth.get(m);
    console.log(`  ${m}  ${String(n).padStart(4)}  ${'#'.repeat(Math.min(n, 60))}`);
  }

  const last6 = months.slice(-6);
  const sum6 = last6.reduce((s, m) => s + byMonth.get(m), 0);
  const perMonth = last6.length ? sum6 / last6.length : 0;

  const byCompany = new Map();
  for (const r of rows) byCompany.set(r.company_id, (byCompany.get(r.company_id) || 0) + 1);
  let topId = null;
  let topCount = 0;
  for (const [id, n] of byCompany) if (n > topCount) { topCount = n; topId = id; }

  // Tốc độ riêng của công ty lớn nhất — sát thực tế hơn giả định dồn hết vào một chỗ.
  const topByMonth = new Map();
  for (const r of rows) {
    if (r.company_id !== topId || !r.created_at) continue;
    const m = String(r.created_at).slice(0, 7);
    topByMonth.set(m, (topByMonth.get(m) || 0) + 1);
  }
  const topPerMonth = last6.length
    ? last6.reduce((s, m) => s + (topByMonth.get(m) || 0), 0) / last6.length
    : 0;

  console.log('');
  console.log(`Trung bình ${perMonth.toFixed(1)} dự án/tháng (6 tháng gần nhất, toàn hệ thống)`);
  console.log(`Công ty lớn nhất: ${nameOf.get(topId) || topId} — ${topCount} dự án`);
  console.log(`Riêng công ty này: ${topPerMonth.toFixed(1)} dự án/tháng`);

  if (topPerMonth <= 0) {
    console.log('Không đủ dữ liệu để suy ra thời điểm.');
    return;
  }
  console.log('');
  for (const mark of [PAGE_LIMIT, 1000, 2000, PAGE_LIMIT * 12]) {
    if (mark <= topCount) {
      console.log(`  ${String(mark).padStart(5)} dự án: đã vượt`);
      continue;
    }
    const m = Math.ceil((mark - topCount) / topPerMonth);
    console.log(
      `  ${String(mark).padStart(5)} dự án: còn ~${String(m).padStart(3)} tháng`
      + ` (~${(m / 12).toFixed(1)} năm)`,
    );
  }
})().catch((e) => {
  console.error('Lỗi:', e.message);
  process.exit(1);
});
