/**
 * Đồng bộ hai sổ nhiệm vụ sản xuất — kiểm phần ghép tên (offline) và đo trên dữ liệu thật.
 *
 *   node tests/dong-bo-hai-so-nhiem-vu-sx.js          # chỉ phần offline
 *   node tests/dong-bo-hai-so-nhiem-vu-sx.js --that   # thêm phần đo trên CSDL thật (chỉ đọc)
 *
 * Phần quan trọng nhất phải chứng minh: ghép tên không bắt nhầm việc khác, và biết trước
 * bao nhiêu cặp đang lệch sẽ ghép được — phần còn lại là vùng mù, phải nói ra.
 */
require('dotenv').config();
const { chuanTen } = require('../src/helpers/dongBoHaiSoNhiemVuSx');

let dat = 0; let truot = 0;
function kiem(ten, ok, chiTiet) {
  console.log(`${ok ? '✅' : '❌'} ${ten}`);
  if (!ok) { if (chiTiet !== undefined) console.log('   ', chiTiet); truot += 1; } else dat += 1;
}

// ── 1. Chuẩn hoá tên ────────────────────────────────────────────────────────
kiem('bỏ dấu + thường hoá: «Đặt Đá» khớp «đặt đá»', chuanTen('Đặt Đá') === chuanTen('đặt đá'));
kiem('gộp khoảng trắng thừa', chuanTen('Kiểm  tra   KCS') === chuanTen('Kiểm tra KCS'));
kiem('cắt khoảng trắng đầu/cuối', chuanTen('  Sơn  ') === chuanTen('Sơn'));
kiem('chữ đ/Đ về d', chuanTen('Đóng gói') === chuanTen('dong goi'));

// ── 2. KHÔNG được ghép nhầm việc khác nhau ──────────────────────────────────
kiem('«Đặt kính» KHÁC «Đặt kính ốp»', chuanTen('Đặt kính') !== chuanTen('Đặt kính ốp'));
kiem('«Thu tiền» KHÁC «Chốt và kiểm tra công nợ»',
  chuanTen('Thu tiền') !== chuanTen('Chốt và kiểm tra công nợ'));
kiem('«Sơn» KHÁC «Sơn kính»', chuanTen('Sơn') !== chuanTen('Sơn kính'));

// ── 3. Vùng mù đã biết: lỗi chính tả trong bộ mẫu ───────────────────────────
kiem('«Tiếp nhập…» KHÔNG khớp «Tiếp nhận…» — vùng mù, phải ghi log',
  chuanTen('Tiếp nhập thông tin dự án') !== chuanTen('Tiếp nhận thông tin dự án'));

kiem('tên rỗng → chuỗi rỗng (chỗ gọi bỏ qua)', chuanTen(null) === '' && chuanTen('   ') === '');

if (!process.argv.includes('--that')) {
  console.log(`\n${dat} đạt · ${truot} trượt  (thêm --that để đo trên dữ liệu thật)`);
  process.exit(truot ? 1 : 0);
}

// ── 4. Đo trên dữ liệu thật — chỉ đọc ───────────────────────────────────────
const { supabase } = require('../src/config/supabase');
const { isLogisticsWorkshopTask } = require('../src/helpers/logisticsTaskSplit');

async function tatCa(table, select, build) {
  const ra = []; let from = 0;
  for (;;) {
    let q = supabase.from(table).select(select);
    if (build) q = build(q);
    const { data, error } = await q.range(from, from + 999);
    if (error) throw error;
    ra.push(...(data || []));
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  return ra;
}

(async () => {
  const [deals, crmSx, taskRows] = await Promise.all([
    tatCa('crm_leads', 'id, project_id', (q) => q.eq('type', 'deal').not('project_id', 'is', null)),
    tatCa('crm_tasks', 'id, lead_id, title, status', (q) => q.like('stage_slug', 'sx_%')),
    tatCa('tasks', 'id, project_id, title, status, metadata'),
  ]);
  const duAnCuaDeal = new Map(deals.map((d) => [String(d.id), String(d.project_id)]));

  const crmTheoDuAn = new Map();
  crmSx.forEach((t) => {
    const pid = duAnCuaDeal.get(String(t.lead_id));
    if (!pid) return;
    if (!crmTheoDuAn.has(pid)) crmTheoDuAn.set(pid, []);
    crmTheoDuAn.get(pid).push(t);
  });
  const taskTheoDuAn = new Map();
  taskRows.forEach((t) => {
    if (isLogisticsWorkshopTask(t)) return;
    const pid = String(t.project_id || '');
    if (!pid) return;
    if (!taskTheoDuAn.has(pid)) taskTheoDuAn.set(pid, []);
    taskTheoDuAn.get(pid).push(t);
  });

  let ghepDuoc = 0; let khongGhep = 0; let nhieuBanSao = 0;
  const viDuKhongGhep = {};
  for (const [pid, A] of crmTheoDuAn) {
    const B = taskTheoDuAn.get(pid) || [];
    if (!B.length) continue;
    const theoTen = new Map();
    B.forEach((t) => {
      const k = chuanTen(t.title);
      if (!theoTen.has(k)) theoTen.set(k, []);
      theoTen.get(k).push(t);
    });
    for (const a of A) {
      const ds = theoTen.get(chuanTen(a.title));
      if (!ds) { khongGhep += 1; viDuKhongGhep[a.title] = (viDuKhongGhep[a.title] || 0) + 1; continue; }
      ghepDuoc += 1;
      if (ds.length > 1) nhieuBanSao += 1;
    }
  }
  const tong = ghepDuoc + khongGhep;
  console.log(`\nSổ «theo deal» có ${tong} việc nằm trên dự án CÓ cả hai sổ:`);
  console.log(`   ghép được sang sổ dự án : ${ghepDuoc} (${(ghepDuoc * 100 / tong).toFixed(1)}%)`);
  console.log(`   KHÔNG ghép được         : ${khongGhep} (${(khongGhep * 100 / tong).toFixed(1)}%)  ← vùng mù, sẽ ghi log`);
  console.log(`   ghép ra NHIỀU hơn 1 bản sao: ${nhieuBanSao}  ← sửa cả cụm, cố ý`);
  console.log('   Tên không ghép được, nhiều nhất:');
  Object.entries(viDuKhongGhep).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .forEach(([n, c]) => console.log(`      ${String(c).padStart(5)}  ${n}`));

  kiem('tỉ lệ ghép được ≥ 85%', ghepDuoc * 100 / tong >= 85, `${(ghepDuoc * 100 / tong).toFixed(1)}%`);
  console.log(`\n${dat} đạt · ${truot} trượt`);
  process.exit(truot ? 1 : 0);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
