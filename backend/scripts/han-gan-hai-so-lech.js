/**
 * Hàn gắn 1.934 cặp nhiệm vụ đang LỆCH trạng thái giữa hai sổ sản xuất.
 *
 *   «theo deal»  : crm_tasks stage_slug `sx_%`, bám lead_id
 *   «theo dự án» : tasks (không phải việc VC/LĐ), bám project_id
 *
 * LUẬT: bên nào đã xong thì coi là xong, đóng nốt bên kia.
 * Lý do: lệch gần như cân hai chiều (1.019 / 915) — cả hai bên đều có người làm thật.
 * Chọn "chưa xong thắng" là bắt người ta làm lại việc đã làm.
 *
 * BA CHỖ KHÔNG ĐỤNG VÀO
 *
 *  1. Việc CÔNG NỢ (thu tiền, chốt/kiểm tra công nợ, đợi thanh toán, xuất hoá đơn).
 *     Đóng nhầm ở đây là ghi khống tiền. Liệt kê riêng để kế toán xác nhận tay.
 *
 *  2. Việc đang nằm ở cột ĐỨNG TRƯỚC chỗ thẻ đang đậu VÀ bị đóng theo lô — chính là
 *     dấu vết của lỗi «đóng oan» cũ. Lấy bên đó làm chuẩn là LÂY lỗi sang sổ còn lại.
 *     Phải chạy `ra-soat-nhiem-vu-dong-oan.js --apply` TRƯỚC; script này tự kiểm và
 *     cảnh báo nếu thấy còn sót.
 *
 *  3. Cặp mà một bên `cancelled` — hủy khác xong, không suy ra nhau được.
 *
 * DÙNG
 *   node scripts/han-gan-hai-so-lech.js            # chỉ rà
 *   node scripts/han-gan-hai-so-lech.js --apply    # hàn gắn
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { supabase } = require('../src/config/supabase');
const { isLogisticsWorkshopTask } = require('../src/helpers/logisticsTaskSplit');
const { chuanTen } = require('../src/helpers/dongBoHaiSoNhiemVuSx');

const apply = process.argv.includes('--apply');
const TOI_THIEU_MOT_LO = 3;

const XONG_CRM = new Set(['completed']);
const HUY_CRM = new Set(['cancelled']);
const XONG_TASK = new Set(['done']);
const HUY_TASK = new Set(['cancelled', 'canceled']);

/** Tên việc tiền nong — không tự đóng, phải người xác nhận. */
const TU_KHOA_CONG_NO = [
  'thu tien', 'cong no', 'thanh toan', 'xuat hoa don', 'xuat hd', 'hoa don',
  'chot cn', 'khau tru', 'da thu',
];
function laViecTien(title) {
  const t = chuanTen(title);
  return TU_KHOA_CONG_NO.some((k) => t.includes(k));
}

const chunk = (a, n = 150) => {
  const o = [];
  for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n));
  return o;
};

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
  const [projects, stages, deals, crmSx, taskRows] = await Promise.all([
    tatCa('projects', 'id, code, company_id, workshop_type_id, sx_kanban_column_id'),
    tatCa('production_pipeline_stages', 'id, name, order_index, company_id, workshop_type_id'),
    tatCa('crm_leads', 'id, project_id', (q) => q.eq('type', 'deal').not('project_id', 'is', null)),
    tatCa('crm_tasks', 'id, lead_id, title, status, completed_at, production_pipeline_stage_id, stage_slug',
      (q) => q.like('stage_slug', 'sx_%')),
    tatCa('tasks', 'id, project_id, title, status, completed_at, metadata, production_stage_id'),
  ]);

  const cotTheoId = new Map(stages.map((s) => [String(s.id), s]));
  const duAnTheoId = new Map(projects.map((p) => [String(p.id), p]));
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

  /** Dấu vết «đóng oan»: ở cột đứng TRƯỚC chỗ thẻ đang đậu + đóng theo lô. */
  const demTheoGiay = new Map();
  crmSx.forEach((t) => {
    if (!t.completed_at) return;
    const k = `${t.lead_id}|${String(t.completed_at).slice(0, 19)}`;
    demTheoGiay.set(k, (demTheoGiay.get(k) || 0) + 1);
  });
  function laDongOan(t) {
    if (!t.completed_at || !t.production_pipeline_stage_id) return false;
    const pid = duAnCuaDeal.get(String(t.lead_id));
    const p = pid ? duAnTheoId.get(pid) : null;
    const cotDuAn = p ? cotTheoId.get(String(p.sx_kanban_column_id)) : null;
    const cotViec = cotTheoId.get(String(t.production_pipeline_stage_id));
    if (!cotDuAn || !cotViec) return false;
    if (!(Number(cotViec.order_index) > Number(cotDuAn.order_index))) return false;
    const k = `${t.lead_id}|${String(t.completed_at).slice(0, 19)}`;
    return (demTheoGiay.get(k) || 0) >= TOI_THIEU_MOT_LO;
  }

  const dongCrm = [];   // crm_task cần đóng theo
  const dongTask = [];  // tasks cần đóng theo
  const giuLaiTien = [];
  const giuLaiOan = [];
  const giuLaiHuy = [];

  for (const [pid, A] of crmTheoDuAn) {
    const B = taskTheoDuAn.get(pid) || [];
    if (!B.length) continue;
    const p = duAnTheoId.get(pid);
    const theoTen = new Map();
    B.forEach((t) => {
      const k = chuanTen(t.title);
      if (!theoTen.has(k)) theoTen.set(k, []);
      theoTen.get(k).push(t);
    });

    for (const a of A) {
      const ds = theoTen.get(chuanTen(a.title));
      if (!ds || !ds.length) continue;
      const aSt = String(a.status || '').toLowerCase();
      const aXong = XONG_CRM.has(aSt);
      const aHuy = HUY_CRM.has(aSt);

      for (const b of ds) {
        const bSt = String(b.status || '').toLowerCase();
        const bXong = XONG_TASK.has(bSt);
        const bHuy = HUY_TASK.has(bSt);
        if (aXong === bXong && !aHuy && !bHuy) continue;
        if ((aXong || bXong) === false) continue;

        const nhan = `${p?.code || pid} · «${a.title}»`;
        if (aHuy || bHuy) { giuLaiHuy.push(nhan); continue; }
        // Kiểm «đóng oan» TRƯỚC «tiền nong»: phần lớn việc đóng oan là Thu tiền / công nợ,
        // để sau thì nó rơi hết vào rổ tiền và báo cáo nói dối rằng không còn dấu vết nào.
        if (aXong && laDongOan(a)) {
          giuLaiOan.push(`${nhan} — bên deal là dấu vết đóng oan, chưa mở lại`);
          continue;
        }
        if (laViecTien(a.title)) {
          giuLaiTien.push(`${nhan} — deal:${aSt} | dự án:${bSt}`);
          continue;
        }
        if (aXong && !bXong) dongTask.push({ id: b.id, nhan });
        if (bXong && !aXong) dongCrm.push({ id: a.id, nhan });
      }
    }
  }

  console.log('── HÀN GẮN ────────────────────────────────────────────────');
  console.log(`Đóng theo ở sổ «theo dự án» (tasks)      : ${dongTask.length}`);
  console.log(`Đóng theo ở sổ «theo deal»  (crm_tasks)  : ${dongCrm.length}`);
  console.log('\n── GIỮ NGUYÊN, KHÔNG ĐỤNG ─────────────────────────────────');
  console.log(`Việc tiền nong — kế toán xác nhận tay    : ${giuLaiTien.length}`);
  giuLaiTien.slice(0, 10).forEach((v) => console.log(`      ${v}`));
  if (giuLaiTien.length > 10) console.log(`      … còn ${giuLaiTien.length - 10}`);
  console.log(`Dấu vết «đóng oan» chưa mở lại           : ${giuLaiOan.length}`);
  giuLaiOan.slice(0, 5).forEach((v) => console.log(`      ${v}`));
  console.log(`Có bên bị HỦY (hủy ≠ xong)               : ${giuLaiHuy.length}`);

  if (giuLaiOan.length) {
    console.log('\n⚠️  CHẠY `node scripts/ra-soat-nhiem-vu-dong-oan.js --apply` TRƯỚC,');
    console.log('    rồi chạy lại script này — nếu không, lỗi đóng oan sẽ lây sang sổ còn lại.');
  }

  if (!apply) return console.log('\n(chỉ rà — thêm --apply để hàn gắn)');

  const bak = path.join(__dirname, '..', 'uploads', `_rollback_han_gan_hai_so_${Date.now()}.json`);
  fs.writeFileSync(bak, JSON.stringify({ dongTask, dongCrm, giuLaiTien, giuLaiOan }, null, 2));

  const nowIso = new Date().toISOString();
  for (const part of chunk(dongTask.map((x) => x.id))) {
    const { error } = await supabase.from('tasks')
      .update({ status: 'done', completed_at: nowIso, updated_at: nowIso }).in('id', part);
    if (error) throw error;
  }
  for (const part of chunk(dongCrm.map((x) => x.id))) {
    const { error } = await supabase.from('crm_tasks')
      .update({ status: 'completed', completed_at: nowIso, updated_at: nowIso }).in('id', part);
    if (error) throw error;
  }
  console.log(`\n✅ hàn gắn ${dongTask.length + dongCrm.length} dòng. Hoàn tác: ${path.basename(bak)}`);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
