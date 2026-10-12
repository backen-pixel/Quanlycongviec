#!/usr/bin/env node
/**
 * Gắn cột pipeline cho các bộ mẫu nhiệm vụ SX của HCB đang bỏ trống `production_stage_id`.
 *
 *   node backend/scripts/gan-cot-bo-mau-xuong-hcb.js          # thử, không ghi
 *   node backend/scripts/gan-cot-bo-mau-xuong-hcb.js --ghi    # ghi thật
 *
 * Bộ mẫu không gắn cột thì khi sinh nhiệm vụ, người nhận rơi về «phụ trách chính của
 * phân loại xưởng» — một người ôm hết, kể cả việc công nợ và thu tiền.
 * Xem nguoiPhuTrachCotSx / nguoiPhuTrachPhanLoaiXuong trong workshopApplyTemplates.js.
 *
 * Ánh xạ dưới đây khai TAY theo tên cột, không đoán bằng thuật toán khớp chuỗi:
 * đã thử khớp tự động và nó hút sai (tên cột dài như «Sản xuất kiểm tra chéo đặt kính»
 * ăn hết các việc có chữ «sản xuất», «đặt», «kính»).
 *
 * 8 bộ mẫu không gắn phân loại nằm ngoài phạm vi script: `production_stage_id` chỉ trỏ
 * được một cột, mà ba phân loại Tủ bếp / Cánh kính / Cửa có ba pipeline khác nhau.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const { supabase } = require('../src/config/supabase');

const GHI = process.argv.includes('--ghi');
const HCB = '18c2563f-3495-498d-8199-23200c9f420e';

/** [tên phân loại, tên bộ mẫu, tên cột pipeline] */
const ANH_XA = [
  ['Tủ bếp', 'Công nợ và thu tiền', 'Thu tiền'],
  ['Tủ bếp', 'Chuẩn bị và vận chuyển', 'ĐƠN HÀNG NGÀY MAI GIAO'],
  ['Cánh kính', 'Tiếp nhận và lên kế hoạch', 'Tiếp Nhận'],
  ['Cánh kính', 'Chuẩn bị sản xuất', 'Vẽ lên kế hoạch sản xuất'],
  ['Cánh kính', 'Sản xuất và chuẩn bị vận chuyển', 'Vẽ lên kế hoạch sản xuất'],
  ['Cánh kính', 'Vận chuyển và thu tiền', 'thu tiền'],
];

async function tenNguoi(userId) {
  if (!userId) return null;
  const { data } = await supabase.from('users').select('full_name').eq('id', userId).maybeSingle();
  return data?.full_name || null;
}

async function phuTrachCot(stageId) {
  const { data } = await supabase
    .from('production_pipeline_stage_default_staff')
    .select('user_id')
    .eq('production_pipeline_stage_id', stageId)
    .eq('is_primary', true)
    .order('order_index', { ascending: true })
    .limit(1);
  return tenNguoi(data?.[0]?.user_id);
}

async function main() {
  console.log(`\nGan cot pipeline cho bo mau SX cua HCB`);
  console.log(GHI ? '   CHE DO: GHI THAT\n' : '   CHE DO: THU (khong ghi) — them --ghi de chay that\n');

  const { data: loai } = await supabase
    .from('workshop_project_types').select('id, name').eq('company_id', HCB);
  const idLoai = new Map((loai || []).map((l) => [l.name, String(l.id)]));

  let ok = 0;
  let loi = 0;

  for (const [tenLoai, tenBoMau, tenCot] of ANH_XA) {
    const loaiId = idLoai.get(tenLoai);
    if (!loaiId) { console.log(`!! khong co phan loai «${tenLoai}»`); loi += 1; continue; }

    const { data: tpl } = await supabase
      .from('workshop_task_templates')
      .select('id, name, production_stage_id')
      .eq('company_id', HCB)
      .eq('workshop_area', 'production')
      .eq('workshop_type_id', loaiId)
      .eq('name', tenBoMau)
      .maybeSingle();
    if (!tpl) { console.log(`!! khong co bo mau «${tenBoMau}» trong «${tenLoai}»`); loi += 1; continue; }

    const { data: cot } = await supabase
      .from('production_pipeline_stages')
      .select('id, name')
      .eq('company_id', HCB)
      .eq('workshop_type_id', loaiId)
      .eq('name', tenCot)
      .eq('is_active', true)
      .maybeSingle();
    if (!cot) { console.log(`!! khong co cot «${tenCot}» trong pipeline «${tenLoai}»`); loi += 1; continue; }

    const nguoi = await phuTrachCot(cot.id);
    const daDung = String(tpl.production_stage_id || '') === String(cot.id);

    console.log(`[${tenLoai}] ${tenBoMau}`);
    console.log(`    -> cot «${cot.name}» | phu trach: ${nguoi || 'CHUA KHAI NGUOI'}${daDung ? ' (da dung tu truoc)' : ''}`);

    if (daDung || !GHI) { ok += 1; continue; }
    const { error } = await supabase
      .from('workshop_task_templates')
      .update({ production_stage_id: cot.id })
      .eq('id', tpl.id);
    if (error) { console.log(`    LOI: ${error.message}`); loi += 1; continue; }
    ok += 1;
  }

  console.log(`\nXong: ${ok} bo mau ok, ${loi} loi.`);
  if (!GHI) console.log('Chua ghi gi. Them --ghi de chay that.');
  console.log('\nLuu y: anh xa chi doi nguoi nhan cua NHIEM VU SINH RA TU GIO.');
  console.log('Nhiem vu da tao truoc do giu nguyen nguoi cu.');
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('\nLoi:', e.message);
  process.exit(1);
});
