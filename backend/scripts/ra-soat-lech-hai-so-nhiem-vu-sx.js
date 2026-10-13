/**
 * Rà độ vênh giữa HAI SỔ nhiệm vụ sản xuất của cùng một dự án:
 *   - «theo deal»  : crm_tasks có stage_slug bắt đầu `sx_`, bám lead_id
 *   - «theo dự án» : tasks (metadata.workshop_area != 'logistics'), bám project_id
 *
 * 93% dự án có CẢ HAI sổ, phần lớn là hai bản chép của cùng một bộ việc. Hai sổ
 * không có ràng buộc đồng bộ nào ở tầng cơ sở dữ liệu, nên tick bên này không đổi
 * bên kia. Script này đo xem đã vênh tới đâu.
 *
 * CHỈ ĐỌC. Chạy: node scripts/ra-soat-lech-hai-so-nhiem-vu-sx.js
 */
require('dotenv').config();
const { supabase } = require('../src/config/supabase');

const XONG_CRM = new Set(['completed', 'cancelled']);
const XONG_TASK = new Set(['done', 'cancelled', 'canceled']);

function chuanTen(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

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
  const [cos, projects, deals, crmSx, taskRows] = await Promise.all([
    tatCa('companies', 'id, name'),
    tatCa('projects', 'id, code, company_id, workshop_type_id, sx_kanban_column_id'),
    tatCa('crm_leads', 'id, code, project_id', (q) => q.eq('type', 'deal').not('project_id', 'is', null)),
    tatCa('crm_tasks', 'id, lead_id, title, status, stage_slug, blocks_stage_advance, production_pipeline_stage_id',
      (q) => q.like('stage_slug', 'sx_%')),
    tatCa('tasks', 'id, project_id, title, status, metadata, blocks_stage_advance, production_stage_id'),
  ]);
  const cn = Object.fromEntries(cos.map((c) => [c.id, c.name]));

  const duAnCuaDeal = new Map(deals.map((d) => [String(d.id), String(d.project_id)]));
  const crmTheoDuAn = new Map();
  for (const t of crmSx) {
    const pid = duAnCuaDeal.get(String(t.lead_id));
    if (!pid) continue;
    if (!crmTheoDuAn.has(pid)) crmTheoDuAn.set(pid, []);
    crmTheoDuAn.get(pid).push(t);
  }
  const taskTheoDuAn = new Map();
  for (const t of taskRows) {
    if (t.metadata && t.metadata.workshop_area === 'logistics') continue;
    const pid = String(t.project_id || '');
    if (!pid) continue;
    if (!taskTheoDuAn.has(pid)) taskTheoDuAn.set(pid, []);
    taskTheoDuAn.get(pid).push(t);
  }

  console.log(`Dự án: ${projects.length} · crm_tasks sx_*: ${crmSx.length} · tasks (không phải VC): ${taskRows.length}\n`);

  // ── 1. Dự án nào thiếu sổ nào, vì sao ──────────────────────────────────────
  const coDeal = new Set(deals.map((d) => String(d.project_id)));
  const chiTask = [];
  const chiCrm = [];
  for (const p of projects) {
    const pid = String(p.id);
    const a = (crmTheoDuAn.get(pid) || []).length > 0;
    const b = (taskTheoDuAn.get(pid) || []).length > 0;
    if (b && !a) chiTask.push(p);
    if (a && !b) chiCrm.push(p);
  }
  const chiTaskKhongDeal = chiTask.filter((p) => !coDeal.has(String(p.id)));
  console.log('── VÌ SAO CÓ DỰ ÁN CHỈ CÓ MỘT SỔ ───────────────────────────');
  console.log(`Chỉ có sổ «theo dự án» (tasks): ${chiTask.length}`);
  console.log(`   trong đó KHÔNG có deal CRM nào: ${chiTaskKhongDeal.length}  ← không có lead_id thì không sinh được crm_tasks`);
  console.log(`   có deal nhưng vẫn thiếu crm_tasks sx_*: ${chiTask.length - chiTaskKhongDeal.length}`);
  const theoCty = {};
  chiTask.forEach((p) => { const k = cn[p.company_id] || '?'; theoCty[k] = (theoCty[k] || 0) + 1; });
  Object.entries(theoCty).sort((a, b) => b[1] - a[1])
    .forEach(([n, c]) => console.log(`      ${String(c).padStart(4)}  ${n}`));
  console.log(`Chỉ có sổ «theo deal» (crm_tasks): ${chiCrm.length}`);
  chiCrm.forEach((p) => console.log(`      ${p.code} — ${cn[p.company_id]}`));

  // ── 2. Cùng tên, lệch trạng thái ──────────────────────────────────────────
  let capTrung = 0;
  let lechTrangThai = 0;
  const viDu = [];
  const lechTheoTen = {};
  let crmXongTaskChua = 0;
  let taskXongCrmChua = 0;
  for (const p of projects) {
    const pid = String(p.id);
    const A = crmTheoDuAn.get(pid) || [];
    const B = taskTheoDuAn.get(pid) || [];
    if (!A.length || !B.length) continue;
    const bTheoTen = new Map();
    B.forEach((t) => {
      const k = chuanTen(t.title);
      if (!bTheoTen.has(k)) bTheoTen.set(k, []);
      bTheoTen.get(k).push(t);
    });
    for (const a of A) {
      const k = chuanTen(a.title);
      const ds = bTheoTen.get(k);
      if (!ds || !ds.length) continue;
      const b = ds[0];
      capTrung += 1;
      const aXong = XONG_CRM.has(String(a.status || '').toLowerCase());
      const bXong = XONG_TASK.has(String(b.status || '').toLowerCase());
      if (aXong !== bXong) {
        lechTrangThai += 1;
        if (aXong) crmXongTaskChua += 1; else taskXongCrmChua += 1;
        lechTheoTen[a.title] = (lechTheoTen[a.title] || 0) + 1;
        if (viDu.length < 6) {
          viDu.push(`${p.code} · «${a.title}» — theo deal: ${a.status} | theo dự án: ${b.status}`);
        }
      }
    }
  }
  console.log('\n── HAI SỔ VÊNH NHAU ────────────────────────────────────────');
  console.log(`Cặp việc TRÙNG TÊN trên cùng dự án: ${capTrung}`);
  console.log(`   LỆCH trạng thái: ${lechTrangThai}  (${capTrung ? (lechTrangThai * 100 / capTrung).toFixed(1) : 0}%)`);
  console.log(`      sổ deal xong · sổ dự án CHƯA: ${crmXongTaskChua}`);
  console.log(`      sổ dự án xong · sổ deal CHƯA: ${taskXongCrmChua}`);
  viDu.forEach((v) => console.log(`      ${v}`));
  console.log('   Tên bị lệch nhiều nhất:');
  Object.entries(lechTheoTen).sort((a, b) => b[1] - a[1]).slice(0, 10)
    .forEach(([n, c]) => console.log(`      ${String(c).padStart(5)}  ${n}`));

  // ── 3. Hậu quả: cờ chặn kéo cột ───────────────────────────────────────────
  let chanChiMotBen = 0;
  const chanViDu = [];
  for (const p of projects) {
    const pid = String(p.id);
    const A = (crmTheoDuAn.get(pid) || []).filter((t) => t.blocks_stage_advance === true
      && !XONG_CRM.has(String(t.status || '').toLowerCase()));
    const B = (taskTheoDuAn.get(pid) || []).filter((t) => t.blocks_stage_advance === true
      && !XONG_TASK.has(String(t.status || '').toLowerCase()));
    const tenA = new Set(A.map((t) => chuanTen(t.title)));
    const tenB = new Set(B.map((t) => chuanTen(t.title)));
    for (const k of tenA) {
      if (!tenB.has(k)) continue;
    }
    const chiA = [...tenA].filter((k) => !tenB.has(k));
    const chiB = [...tenB].filter((k) => !tenA.has(k));
    if (chiA.length || chiB.length) {
      chanChiMotBen += chiA.length + chiB.length;
      if (chanViDu.length < 5 && (chiA.length || chiB.length)) {
        chanViDu.push(`${p.code}: chặn chỉ ở sổ deal ${chiA.length}, chỉ ở sổ dự án ${chiB.length}`);
      }
    }
  }
  console.log('\n── HẬU QUẢ ─────────────────────────────────────────────────');
  console.log(`Việc CHẶN KÉO CỘT còn mở ở MỘT sổ mà bên kia đã xong: ${chanChiMotBen}`);
  chanViDu.forEach((v) => console.log(`      ${v}`));
  console.log('   → Người tick ở màn này vẫn bị chặn kéo thẻ vì bản sao bên kia chưa đóng.');
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
