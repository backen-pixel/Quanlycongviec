/**
 * HCB · Tủ bếp — tách việc BÀN GIAO VC ra một cột riêng.
 *
 * HIỆN TRẠNG SAI
 * Cờ «bàn giao sang VC/LĐ» đang nằm trên cột #16 «KT KCS SẢN PHẨM, TÍNH CN». Kéo thẻ vào
 * đó là hệ thống bàn giao ngay sang Lắp đặt — trong khi hàng chưa đóng gói (#17), chưa
 * chuẩn bị xong (#18), chưa giao (#19, #20). Nhân viên hiểu KCS là kiểm tra chất lượng,
 * không nghĩ nó là bàn giao; họ không sai.
 *
 * Cờ này còn là MỐC tắt hạn (`clears_deadline || is_handover_to_logistics`), nên đặt ở #16
 * khiến mỗi lần vào KCS là tắt sạch deadline sản xuất — và trước bản vá «đóng oan» thì còn
 * đóng luôn nhiệm vụ công nợ ở #21–#25.
 *
 * VIỆC SCRIPT LÀM
 *  1. Chèn cột mới «BÀN GIAO VC» ngay TRƯỚC «ĐƠN HÀNG ĐÃ GIAO», dời các cột sau xuống 1 bậc.
 *  2. Tích cờ bàn giao VC lên cột mới.
 *  3. Bỏ tích cờ đó khỏi #16 «KT KCS SẢN PHẨM, TÍNH CN».
 *
 * KHÔNG HỒI TỐ: dự án đã bàn giao sớm vẫn nằm bên VC, phải xử lý tay.
 *
 * DÙNG
 *   node scripts/them-cot-ban-giao-vc-hcb.js            # chỉ xem
 *   node scripts/them-cot-ban-giao-vc-hcb.js --apply    # ghi
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { supabase } = require('../src/config/supabase');

const CTY = '18c2563f-3495-498d-8199-23200c9f420e'; // Công ty Hucabi
const LOAI = '8814095f-f5c7-411e-b83e-aa01a1d7718c'; // Tủ bếp
const TEN_COT_MOI = 'BÀN GIAO VC';
const TEN_COT_NEO = 'ĐƠN HÀNG ĐÃ GIAO'; // chèn NGAY TRƯỚC cột này
const apply = process.argv.includes('--apply');

(async () => {
  const { data: stages, error } = await supabase
    .from('production_pipeline_stages')
    .select('id, name, order_index, group_key, group_sort, board_tab, color, icon, workflow_stage_id, crm_sync_type, is_active, is_handover_to_logistics, clears_deadline, dashboard_kpi')
    .eq('company_id', CTY)
    .eq('workshop_type_id', LOAI)
    .order('order_index');
  if (error) throw error;

  const daCo = stages.find((s) => String(s.name).trim().toUpperCase() === TEN_COT_MOI);
  if (daCo) {
    console.log(`Cột «${TEN_COT_MOI}» đã tồn tại ở #${daCo.order_index} — không tạo lại.`);
  }
  const neo = stages.find((s) => String(s.name).trim() === TEN_COT_NEO);
  if (!neo) throw new Error(`Không thấy cột neo «${TEN_COT_NEO}»`);
  const dangGiuCo = stages.filter((s) => s.is_handover_to_logistics === true);
  const viTriMoi = Number(neo.order_index);

  // Cột cần dời xuống: từ vị trí chèn trở đi, bỏ qua cột phụ (#90+) và chính cột mới nếu có.
  const canDoi = stages.filter((s) => Number(s.order_index) >= viTriMoi
    && Number(s.order_index) < 90
    && (!daCo || String(s.id) !== String(daCo.id)));

  console.log(`HCB · Tủ bếp — ${stages.length} cột\n`);
  console.log(`Cờ «bàn giao VC» hiện ở: ${dangGiuCo.map((s) => `#${s.order_index} «${s.name}»`).join(', ') || '(không có)'}`);
  console.log(`Chèn «${TEN_COT_MOI}» vào vị trí #${viTriMoi}, ngay trước «${TEN_COT_NEO}»`);
  console.log(`Dời xuống 1 bậc: ${canDoi.length} cột (#${viTriMoi} → #${viTriMoi + canDoi.length - 1} thành #${viTriMoi + 1} → #${viTriMoi + canDoi.length})`);
  console.log('\nPipeline sau khi đổi:');
  const sau = [
    ...stages.filter((s) => Number(s.order_index) < viTriMoi).map((s) => ({ i: s.order_index, n: s.name, co: s.is_handover_to_logistics && String(s.name).trim() !== 'KT KCS SẢN PHẨM, TÍNH CN' })),
    { i: viTriMoi, n: `${TEN_COT_MOI}  ← CỜ BÀN GIAO VC Ở ĐÂY`, co: true, moi: true },
    ...canDoi.map((s) => ({ i: Number(s.order_index) + 1, n: s.name })),
  ];
  sau.filter((x) => x.i >= 14).forEach((x) => console.log(`   #${String(x.i).padStart(2)} ${x.n}${x.moi ? '   (MỚI)' : ''}`));
  console.log(`\nBỏ cờ bàn giao khỏi: ${dangGiuCo.map((s) => `«${s.name}»`).join(', ')}`);

  if (!apply) return console.log('\n(chỉ xem — thêm --apply để ghi)');

  const bak = path.join(__dirname, '..', 'uploads', `_rollback_cot_ban_giao_vc_${Date.now()}.json`);
  fs.writeFileSync(bak, JSON.stringify({ truoc: stages }, null, 2));

  // 1. Dời từ CUỐI lên để không đụng ràng buộc trùng order_index (nếu có).
  for (const s of [...canDoi].sort((a, b) => Number(b.order_index) - Number(a.order_index))) {
    const { error: e } = await supabase.from('production_pipeline_stages')
      .update({ order_index: Number(s.order_index) + 1 })
      .eq('id', s.id);
    if (e) throw new Error(`dời «${s.name}»: ${e.message}`);
  }

  // 2. Tạo cột mới — lấy khuôn từ cột neo để nằm đúng nhóm, đúng tab.
  let cotMoiId = daCo?.id || null;
  if (!cotMoiId) {
    const { data: tao, error: e2 } = await supabase.from('production_pipeline_stages').insert({
      company_id: CTY,
      workshop_type_id: LOAI,
      name: TEN_COT_MOI,
      order_index: viTriMoi,
      color: '#6366F1',
      icon: '🤝',
      is_active: true,
      group_key: neo.group_key,
      group_sort: neo.group_sort,
      board_tab: neo.board_tab || 'sx',
      workflow_stage_id: neo.workflow_stage_id,
      crm_sync_type: neo.crm_sync_type,
      is_handover_to_logistics: true,
    }).select('id').single();
    if (e2) throw new Error(`tạo cột mới: ${e2.message}`);
    cotMoiId = tao.id;
  } else {
    const { error: e3 } = await supabase.from('production_pipeline_stages')
      .update({ order_index: viTriMoi, is_handover_to_logistics: true })
      .eq('id', cotMoiId);
    if (e3) throw new Error(`cập nhật cột sẵn có: ${e3.message}`);
  }

  // 3. Gỡ cờ khỏi các cột cũ.
  for (const s of dangGiuCo) {
    if (String(s.id) === String(cotMoiId)) continue;
    const { error: e4 } = await supabase.from('production_pipeline_stages')
      .update({ is_handover_to_logistics: false })
      .eq('id', s.id);
    if (e4) throw new Error(`gỡ cờ «${s.name}»: ${e4.message}`);
  }

  const { data: kt } = await supabase.from('production_pipeline_stages')
    .select('name, order_index, is_handover_to_logistics')
    .eq('company_id', CTY).eq('workshop_type_id', LOAI)
    .gte('order_index', 14).lte('order_index', 27).order('order_index');
  console.log('\n✅ xong. Pipeline hiện tại:');
  (kt || []).forEach((s) => console.log(`   #${String(s.order_index).padStart(2)} ${String(s.name).slice(0, 34).padEnd(34)}${s.is_handover_to_logistics ? '  → VC' : ''}`));
  console.log(`\nHoàn tác: ${path.basename(bak)}`);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
