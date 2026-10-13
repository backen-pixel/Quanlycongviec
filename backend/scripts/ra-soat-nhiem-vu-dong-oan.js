/**
 * Rà và mở lại nhiệm vụ SX bị ĐÓNG OAN.
 *
 * LỖI (đã vá ở commit «khong dong oan viec cong no»): kéo thẻ vào cột tích tắt hạn /
 * bàn giao VC thì hệ thống đóng MỌI nhiệm vụ `sx_*` còn mở, không nhìn thứ tự cột.
 * Pipeline nào xếp công nợ, xuất hoá đơn, thu tiền SAU cột mốc thì những việc đó bị
 * đánh dấu xong trong khi chưa ai làm — số liệu công nợ sai theo.
 *
 * CÁCH NHẬN DIỆN
 * Nạn nhân phải thỏa CẢ HAI:
 *   1. Nhiệm vụ nằm ở cột có `order_index` LỚN HƠN cột HIỆN TẠI của dự án — tức việc ở
 *      phía trước chỗ thẻ từng đi tới, không đời nào làm xong được.
 *      KHÔNG so với cột mốc: thẻ đi tiếp qua mốc thì việc ở các cột giữa mốc và chỗ đang
 *      đứng được đóng là ĐÚNG, so với mốc sẽ bắt oan hàng trăm cái.
 *   2. Đóng theo LÔ — cùng `completed_at` tới từng giây với ≥3 nhiệm vụ khác của cùng deal.
 *      Để không đụng vào việc người ta bấm xong thật: người thật không bấm xong 3 việc
 *      trong cùng một giây.
 *
 * KHÔNG khôi phục được `deadline` — lệnh đóng oan đã set null, giá trị cũ không lưu ở đâu.
 * Mở lại chỉ trả `status` về `pending` và xoá `completed_at`.
 *
 * DÙNG
 *   node scripts/ra-soat-nhiem-vu-dong-oan.js            # chỉ rà, không ghi
 *   node scripts/ra-soat-nhiem-vu-dong-oan.js --apply    # mở lại
 *   node scripts/ra-soat-nhiem-vu-dong-oan.js --lead=<id> [--apply]   # giới hạn 1 deal
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { supabase } = require('../src/config/supabase');
const { resolveSxTaskProductionStageId } = require('../src/helpers/sxPipelineStageSlug');

const apply = process.argv.includes('--apply');
const chiLead = (process.argv.find((a) => a.startsWith('--lead=')) || '').split('=')[1] || null;
const TOI_THIEU_MOT_LO = 3;

const chunk = (a, n = 150) => {
  const o = [];
  for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n));
  return o;
};

async function tatCa(table, select, build) {
  const ra = [];
  let from = 0;
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
  const stages = await tatCa('production_pipeline_stages',
    'id, name, order_index, company_id, workshop_type_id, clears_deadline, is_handover_to_logistics, is_active');
  const theoPipeline = new Map();
  for (const s of stages) {
    const k = `${s.company_id}|${s.workshop_type_id}`;
    if (!theoPipeline.has(k)) theoPipeline.set(k, []);
    theoPipeline.get(k).push(s);
  }

  const cotTheoId = new Map(stages.map((s) => [String(s.id), s]));
  const pipelineCuaCot = new Map(); // stageId -> danh sách cột cùng pipeline
  for (const [, ds] of theoPipeline) ds.forEach((s) => pipelineCuaCot.set(String(s.id), ds));

  // Vị trí hiện tại của từng dự án, và deal nào thuộc dự án nào.
  const duAn = await tatCa('projects', 'id, code, company_id, workshop_type_id, sx_kanban_column_id',
    (q) => q.not('sx_kanban_column_id', 'is', null));
  const viTriDuAn = new Map(duAn.map((p) => [String(p.id), p]));
  const deals = await tatCa('crm_leads', 'id, code, project_id',
    (q) => q.eq('type', 'deal').not('project_id', 'is', null));
  const duAnCuaDeal = new Map(deals.map((d) => [String(d.id), String(d.project_id)]));
  const maDeal = new Map(deals.map((d) => [String(d.id), d.code]));
  console.log(`Dự án có vị trí cột: ${duAn.length} · deal gắn dự án: ${deals.length}`);

  // Nhiệm vụ sx_* đã completed
  let tasks = await tatCa('crm_tasks',
    'id, lead_id, title, status, stage_slug, completed_at, production_pipeline_stage_id',
    (q) => {
      let x = q.eq('status', 'completed').like('stage_slug', 'sx_%').not('completed_at', 'is', null);
      if (chiLead) x = x.eq('lead_id', chiLead);
      return x;
    });
  console.log(`Nhiệm vụ sx_* đã đóng: ${tasks.length}`);

  // Giải cột cho từng nhiệm vụ, giữ cái nằm TRƯỚC MẶT chỗ dự án đang đứng.
  const vuotMat = [];
  for (const t of tasks) {
    const pid = duAnCuaDeal.get(String(t.lead_id));
    const p = pid ? viTriDuAn.get(pid) : null;
    if (!p) continue;
    const cotDuAn = cotTheoId.get(String(p.sx_kanban_column_id));
    if (!cotDuAn || !Number.isFinite(Number(cotDuAn.order_index))) continue;
    const dsCot = pipelineCuaCot.get(String(p.sx_kanban_column_id)) || [];
    const sid = resolveSxTaskProductionStageId(t, dsCot);
    if (!sid) continue;
    const cot = cotTheoId.get(String(sid));
    if (!cot || Number(cot.order_index) >= 90) continue;
    if (Number(cot.order_index) > Number(cotDuAn.order_index)) {
      vuotMat.push({ ...t, cot, cotDuAn, duAn: p });
    }
  }
  console.log(`  nằm ở cột ĐỨNG TRƯỚC chỗ dự án đang ở: ${vuotMat.length}`);

  // Dấu vết đóng theo lô: cùng deal + cùng giây
  const lo = new Map();
  for (const t of vuotMat) {
    const k = `${t.lead_id}|${String(t.completed_at).slice(0, 19)}`;
    if (!lo.has(k)) lo.set(k, []);
    lo.get(k).push(t);
  }
  // Đếm cả nhiệm vụ KHÔNG nằm sau mốc cùng giây đó — lô thật thường gồm cả hai loại.
  const demTheoGiay = new Map();
  for (const t of tasks) {
    const k = `${t.lead_id}|${String(t.completed_at).slice(0, 19)}`;
    demTheoGiay.set(k, (demTheoGiay.get(k) || 0) + 1);
  }
  const nanNhan = [];
  for (const [k, ds] of lo) {
    if ((demTheoGiay.get(k) || 0) >= TOI_THIEU_MOT_LO) nanNhan.push(...ds);
  }

  const theoDeal = new Map();
  nanNhan.forEach((t) => {
    if (!theoDeal.has(t.lead_id)) theoDeal.set(t.lead_id, []);
    theoDeal.get(t.lead_id).push(t);
  });
  console.log(`\n❗ ĐÓNG OAN: ${nanNhan.length} nhiệm vụ trên ${theoDeal.size} deal`);

  const theoTen = {};
  nanNhan.forEach((t) => { theoTen[t.title] = (theoTen[t.title] || 0) + 1; });
  console.log('\nTheo tên nhiệm vụ:');
  Object.entries(theoTen).sort((a, b) => b[1] - a[1]).slice(0, 20)
    .forEach(([n, c]) => console.log(`   ${String(c).padStart(5)}  ${n}`));

  const theoCot = {};
  nanNhan.forEach((t) => { theoCot[`#${t.cot.order_index} ${t.cot.name}`] = (theoCot[`#${t.cot.order_index} ${t.cot.name}`] || 0) + 1; });
  console.log('\nTheo cột:');
  Object.entries(theoCot).sort((a, b) => b[1] - a[1]).slice(0, 20)
    .forEach(([n, c]) => console.log(`   ${String(c).padStart(5)}  ${n}`));

  if (!apply) return console.log('\n(chỉ rà — thêm --apply để mở lại)');

  const bak = path.join(__dirname, '..', 'uploads', `_rollback_mo_lai_nhiem_vu_${Date.now()}.json`);
  fs.writeFileSync(bak, JSON.stringify(nanNhan.map((t) => ({
    id: t.id, lead_id: t.lead_id, title: t.title, status: t.status, completed_at: t.completed_at,
  })), null, 2));

  let xong = 0;
  for (const part of chunk(nanNhan.map((t) => t.id))) {
    const { error } = await supabase.from('crm_tasks')
      .update({ status: 'pending', completed_at: null, updated_at: new Date().toISOString() })
      .in('id', part);
    if (error) throw error;
    xong += part.length;
  }
  console.log(`\n✅ mở lại ${xong} nhiệm vụ. Hoàn tác: ${path.basename(bak)}`);
  console.log('   Lưu ý: deadline cũ KHÔNG khôi phục được (đã bị set null lúc đóng oan).');
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
