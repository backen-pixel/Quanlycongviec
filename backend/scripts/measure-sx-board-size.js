/**
 * Đo khối lượng dữ liệu thật của board SX để quyết định có cần phân trang theo cột.
 *
 *   node backend/scripts/measure-sx-board-size.js
 *
 * In ra số dự án theo từng công ty (board Kanban tải theo company_id) và số giao việc
 * Sản xuất. Ngưỡng tham chiếu: app mobile tải 500 dự án/trang, tối đa 12 trang.
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

async function countRows(table, apply) {
  let q = supabase.from(table).select('id', { count: 'exact', head: true });
  if (apply) q = apply(q);
  const { count, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);
  return count || 0;
}

(async () => {
  const PAGE_LIMIT = 500;
  const MAX_PAGES = 12;

  const totalProjects = await countRows('projects');
  const totalAssignments = await countRows('crm_assignments', (q) =>
    q.eq('assignment_module', 'production'));

  const { data: companies, error: cErr } = await supabase
    .from('companies')
    .select('id, name, short_name')
    .order('name');
  if (cErr) throw new Error(`companies: ${cErr.message}`);

  const rows = [];
  for (const c of companies || []) {
    const projects = await countRows('projects', (q) => q.eq('company_id', c.id));
    if (!projects) continue;
    const assignments = await countRows('crm_assignments', (q) =>
      q.eq('assignment_module', 'production').eq('company_id', c.id));
    rows.push({
      company: c.short_name || c.name,
      projects,
      pages: Math.ceil(projects / PAGE_LIMIT),
      assignments,
    });
  }
  rows.sort((a, b) => b.projects - a.projects);

  console.log('');
  console.log(`Tổng dự án (toàn hệ thống): ${totalProjects}`);
  console.log(`Tổng giao việc Sản xuất:    ${totalAssignments}`);
  console.log(`Mobile tải ${PAGE_LIMIT} dự án/trang, tối đa ${MAX_PAGES} trang = ${PAGE_LIMIT * MAX_PAGES}`);
  console.log('');
  console.log('Theo công ty (board Kanban lọc theo company_id):');
  for (const r of rows) {
    const flag = r.pages > MAX_PAGES ? '  ← vượt trần, board bị cắt'
      : r.pages > 2 ? '  ← nhiều hơn 2 trang'
        : '';
    console.log(
      `  ${String(r.projects).padStart(6)} dự án / ${String(r.pages).padStart(2)} trang`
      + ` | ${String(r.assignments).padStart(5)} giao việc | ${r.company}${flag}`,
    );
  }
  console.log('');
  const worst = rows[0];
  if (!worst) {
    console.log('Kết luận: chưa có dự án nào.');
    return;
  }
  if (worst.pages <= 2) {
    console.log('Kết luận: công ty lớn nhất chỉ ~' + worst.pages + ' trang → phân trang theo cột CHƯA cần thiết.');
  } else if (worst.pages <= MAX_PAGES) {
    console.log('Kết luận: công ty lớn nhất ' + worst.pages + ' trang → nên làm phân trang theo cột.');
  } else {
    console.log('Kết luận: công ty lớn nhất vượt trần 12 trang → board đang bị cắt, cần phân trang theo cột.');
  }

  // Tốc độ tăng — để biết còn bao lâu nữa mới chạm ngưỡng cần phân trang.
  const { data: created, error: gErr } = await supabase
    .from('projects')
    .select('created_at, company_id')
    .not('created_at', 'is', null);
  if (gErr) throw new Error(`projects.created_at: ${gErr.message}`);

  const worstCompany = (companies || []).find(
    (c) => (c.short_name || c.name) === worst.company,
  );
  const byMonth = new Map();
  for (const r of created || []) {
    if (worstCompany && String(r.company_id) !== String(worstCompany.id)) continue;
    const m = String(r.created_at).slice(0, 7);
    byMonth.set(m, (byMonth.get(m) || 0) + 1);
  }
  const months = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  if (months.length < 2) {
    console.log('');
    console.log('Chưa đủ lịch sử để ước tính tốc độ tăng.');
    return;
  }

  console.log('');
  console.log(`Dự án tạo mới theo tháng — ${worst.company} (công ty lớn nhất):`);
  for (const [m, n] of months.slice(-12)) {
    console.log(`  ${m}  ${String(n).padStart(4)}  ${'#'.repeat(Math.min(n, 60))}`);
  }

  const recent = months.slice(-6);
  const perMonth = recent.reduce((s, [, n]) => s + n, 0) / recent.length;
  // Ngưỡng nên bắt tay làm: ~4 trang, lúc đó mỗi lần mở board là 4 lượt tải nền.
  const THRESHOLD = PAGE_LIMIT * 4;
  console.log('');
  console.log(`Trung bình 6 tháng gần nhất: ${perMonth.toFixed(1)} dự án/tháng`);
  if (perMonth <= 0) {
    console.log('Không có dự án mới gần đây → chưa cần lo phân trang.');
  } else {
    const remaining = THRESHOLD - worst.projects;
    const monthsLeft = remaining / perMonth;
    console.log(
      `Còn ${remaining} dự án nữa mới chạm ngưỡng ${THRESHOLD}`
      + ` → khoảng ${monthsLeft.toFixed(0)} tháng (${(monthsLeft / 12).toFixed(1)} năm) với tốc độ hiện tại.`,
    );
  }
})().catch((e) => {
  console.error('Lỗi:', e.message);
  process.exit(1);
});
