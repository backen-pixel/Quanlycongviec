/**
 * Rà soát: dự án có thể "biến mất" khỏi bảng xưởng, và luồng bình luận có thể bị khuất.
 *
 * Chạy lại được bất cứ lúc nào, CHỈ ĐỌC, không ghi gì.
 *   node scripts/ra-soat-mat-du-an-va-binh-luan.js
 *
 * Mỗi mục là một cách thẻ/luồng biến mất đã gặp thật hoặc có thể xảy ra. Số 0 nghĩa là
 * đường đó đang sạch — giữ script để soi lại sau mỗi lần đổi pipeline hay đổi phân loại.
 */
require('dotenv').config();
const { supabase } = require('../src/config/supabase');

let canhBao = 0;
function muc(ten, so, chiTiet) {
  const ok = so === 0;
  if (!ok) canhBao += 1;
  console.log(`${ok ? '✅' : '❗'} ${ten}: ${so}`);
  (chiTiet || []).slice(0, 8).forEach((d) => console.log(`      ${d}`));
  if ((chiTiet || []).length > 8) console.log(`      … còn ${chiTiet.length - 8}`);
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
  const [cos, types, stages, projects, deals, placements] = await Promise.all([
    tatCa('companies', 'id, name'),
    tatCa('workshop_project_types', 'id, name, company_id, is_active'),
    tatCa('production_pipeline_stages', 'id, name, order_index, company_id, workshop_type_id, is_active, board_tab, clears_deadline, is_handover_to_logistics'),
    tatCa('projects', 'id, code, company_id, workshop_type_id, sx_kanban_column_id, status'),
    tatCa('crm_leads', 'id, code, type, project_id, parent_lead_id, created_at', (q) => q.eq('type', 'deal').not('project_id', 'is', null)),
    tatCa('project_workshop_placements', 'source_project_id, target_project_id'),
  ]);
  const cn = Object.fromEntries(cos.map((c) => [c.id, c.name]));
  const wn = Object.fromEntries(types.map((t) => [t.id, t.name]));
  const cotTheoId = new Map(stages.map((s) => [String(s.id), s]));
  const typeTheoId = new Map(types.map((t) => [String(t.id), t]));
  const cotTheoPipeline = new Map();
  stages.forEach((s) => {
    const k = `${s.company_id}|${s.workshop_type_id}`;
    if (!cotTheoPipeline.has(k)) cotTheoPipeline.set(k, []);
    cotTheoPipeline.get(k).push(s);
  });

  console.log(`Dữ liệu: ${projects.length} dự án · ${stages.length} cột · ${types.length} phân loại · ${deals.length} deal gắn dự án\n`);
  console.log('── MẤT DỰ ÁN ───────────────────────────────────────────────');

  const coCot = projects.filter((p) => p.sx_kanban_column_id);
  const treo = coCot.filter((p) => !cotTheoId.has(String(p.sx_kanban_column_id)));
  muc('Cột không còn tồn tại (id treo)', treo.length, treo.map((p) => p.code));

  const lech = coCot.filter((p) => {
    const s = cotTheoId.get(String(p.sx_kanban_column_id));
    if (!s) return false;
    const lechCty = p.company_id && s.company_id && String(p.company_id) !== String(s.company_id);
    // Cột không gắn phân loại = dùng chung cho cả công ty, không coi là lệch.
    const lechLoai = p.workshop_type_id && s.workshop_type_id
      && String(p.workshop_type_id) !== String(s.workshop_type_id);
    return lechCty || lechLoai;
  });
  muc('Cột thuộc CÔNG TY / PHÂN LOẠI khác (lỗi auto-advance cũ)', lech.length,
    lech.map((p) => `${p.code} (${cn[p.company_id]} · ${wn[p.workshop_type_id]}) → cột của ${cn[cotTheoId.get(String(p.sx_kanban_column_id)).company_id]}`));

  const cotTat = coCot.filter((p) => cotTheoId.get(String(p.sx_kanban_column_id))?.is_active === false);
  muc('Đang đứng ở cột ĐÃ TẮT', cotTat.length,
    cotTat.map((p) => `${p.code} → «${cotTheoId.get(String(p.sx_kanban_column_id)).name}»`));

  const loaiTat = projects.filter((p) => p.workshop_type_id && typeTheoId.get(String(p.workshop_type_id))?.is_active === false);
  muc('Thuộc phân loại ĐÃ TẮT', loaiTat.length, loaiTat.map((p) => `${p.code} → «${wn[p.workshop_type_id]}»`));

  // Cột dùng chung công ty (workshop_type_id = NULL) là pipeline hợp lệ cho MỌI phân loại
  // của công ty đó — NextGo chạy kiểu này. Không tính vào thì báo nhầm 42 dự án.
  const cotChungCongTy = new Map();
  stages.filter((s) => !s.workshop_type_id).forEach((s) => {
    const k = String(s.company_id);
    if (!cotChungCongTy.has(k)) cotChungCongTy.set(k, []);
    cotChungCongTy.get(k).push(s);
  });
  const khongPipeline = projects.filter((p) => p.workshop_type_id
    && !(cotTheoPipeline.get(`${p.company_id}|${p.workshop_type_id}`) || []).length
    && !(cotChungCongTy.get(String(p.company_id)) || []).length);
  muc('Phân loại KHÔNG CÓ CỘT nào, kể cả cột dùng chung (bảng rỗng)', khongPipeline.length,
    [...new Set(khongPipeline.map((p) => `${cn[p.company_id]} · ${wn[p.workshop_type_id]}`))]);

  const mocKhacTab = [];
  for (const [k, ds] of cotTheoPipeline) {
    const act = ds.filter((s) => s.is_active !== false && Number(s.order_index) < 90)
      .sort((a, b) => Number(a.order_index) - Number(b.order_index));
    const moc = act.find((s) => s.clears_deadline || s.is_handover_to_logistics);
    if (!moc) continue;
    const tab = String(moc.board_tab || 'sx');
    if (tab !== 'sx') {
      const [c, w] = k.split('|');
      const dem = projects.filter((p) => String(p.sx_kanban_column_id) === String(moc.id)).length;
      mocKhacTab.push(`${cn[c]} · ${wn[w]} — «${moc.name}» #${moc.order_index} ở tab «${tab}», đang giữ ${dem} dự án`);
    }
  }
  muc('Cột mốc giao hàng nằm ở TAB KHÁC (thẻ rời tab Sản xuất)', mocKhacTab.length, mocKhacTab);

  console.log('\n── MẤT BÌNH LUẬN ───────────────────────────────────────────');

  const dealTheoDuAn = new Map();
  deals.forEach((d) => {
    const k = String(d.project_id);
    if (!dealTheoDuAn.has(k)) dealTheoDuAn.set(k, []);
    dealTheoDuAn.get(k).push(d);
  });

  const nhieuGoc = [];
  for (const [pid, ds] of dealTheoDuAn) {
    const goc = ds.filter((d) => !d.parent_lead_id);
    if (goc.length > 1) {
      const p = projects.find((x) => String(x.id) === pid);
      nhieuGoc.push(`${p?.code || pid}: ${goc.length} deal gốc (${goc.map((d) => d.code).join(', ')}) — giao diện chỉ mở 1 luồng`);
    }
  }
  muc('Dự án có NHIỀU deal gốc (luồng kia bị khuất)', nhieuGoc.length, nhieuGoc);

  const canhLienQuan = new Set();
  placements.forEach((r) => {
    if (r.source_project_id) canhLienQuan.add(String(r.source_project_id));
    if (r.target_project_id) canhLienQuan.add(String(r.target_project_id));
  });
  const thieuDeal = [...canhLienQuan].filter((pid) => !(dealTheoDuAn.get(pid) || []).length);
  muc('Dự án trong liên kết đặt xưởng mà KHÔNG có deal (nút chuyển luồng trống)', thieuDeal.length,
    thieuDeal.map((pid) => projects.find((p) => String(p.id) === pid)?.code || pid));
  console.log(`      (tổng ${placements.length} liên kết đặt xưởng, chạm ${canhLienQuan.size} dự án)`);

  const cutoff = await tatCa('lead_members', 'lead_id, user_id, history_cutoff_at',
    (q) => q.not('history_cutoff_at', 'is', null));
  const uids = [...new Set(cutoff.map((m) => m.user_id))];
  let un = {};
  if (uids.length) {
    const us = await tatCa('users', 'id, full_name', (q) => q.in('id', uids));
    un = Object.fromEntries(us.map((u) => [u.id, u.full_name]));
  }
  muc('Thành viên bị CẮT LỊCH SỬ bình luận (chỉ thấy từ ngày được thêm)', cutoff.length,
    cutoff.map((m) => `${un[m.user_id] || String(m.user_id).slice(0, 8)} — từ ${String(m.history_cutoff_at).slice(0, 10)}`));

  console.log(`\n${canhBao === 0 ? '✅ Không còn đường nào đang mất dự án / mất bình luận.' : `❗ ${canhBao} mục cần xem.`}`);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
