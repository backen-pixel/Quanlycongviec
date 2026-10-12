#!/usr/bin/env node
/**
 * Tạo phân loại xưởng «Xưởng khác đặt hàng» cho Metalla và chuyển dự án nhận từ HCB
 * sang phân loại đó.
 *
 *   node backend/scripts/tao-phan-loai-xuong-khac-dat-hang.js            # thử, không ghi
 *   node backend/scripts/tao-phan-loai-xuong-khac-dat-hang.js --ghi      # ghi thật
 *
 * Vì sao cần phân loại riêng: dự án HCB đặt sang Metalla đang rơi vào phân loại
 * «Data đầu vào» — pipeline bán hàng (Tiếp nhận → Xác minh B2B → Báo giá → Chốt),
 * không có bộ mẫu nhiệm vụ nào. Đó là quy trình chào hàng, không phải quy trình
 * gia công.
 *
 * `production_pipeline_stages.workshop_type_id` gắn cứng mỗi cột vào đúng một phân
 * loại, nên không dùng chung pipeline được — phải sao chép 10 cột từ «Data đầu ra».
 *
 * Chạy lại được: phân loại và cột nhận diện theo tên, có rồi thì bỏ qua.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const { supabase } = require('../src/config/supabase');

const GHI = process.argv.includes('--ghi');

const METALLA = 'b78baba2-2486-434c-a72d-9c937fac2164';
const NGUON_TYPE = '607703bc-b86e-407a-a91d-4ab91df4c558';   // Data đầu ra
const TEN_MOI = 'Xưởng khác đặt hàng';

/** Cột chỉ thuộc về phân loại nguồn — không bê nguyên sang bản sao. */
const BO_QUA_COT = new Set(['id', 'created_at', 'workshop_type_id']);

function log(...a) { console.log(...a); }

async function duAnNhanTuXuongKhac() {
  const { data: pl, error } = await supabase
    .from('project_workshop_placements')
    .select('target_project_id, source_project_id');
  if (error) throw error;
  const ids = [...new Set((pl || []).map((r) => r.target_project_id).filter(Boolean))];
  if (!ids.length) return [];
  const { data: ps } = await supabase
    .from('projects')
    .select('id, code, name, company_id, workshop_type_id, sx_kanban_column_id')
    .in('id', ids)
    .eq('company_id', METALLA);
  return ps || [];
}

async function main() {
  log(`\nPhan loai moi cho Metalla: «${TEN_MOI}»`);
  log(GHI ? '   CHE DO: GHI THAT\n' : '   CHE DO: THU (khong ghi gi) — them --ghi de chay that\n');

  // 1. Phân loại
  let { data: loai } = await supabase
    .from('workshop_project_types')
    .select('id, name')
    .eq('company_id', METALLA)
    .eq('name', TEN_MOI)
    .maybeSingle();

  if (loai) {
    log(`1. Phan loai da co: ${loai.id}`);
  } else if (!GHI) {
    log('1. [se tao] phan loai moi');
    loai = { id: '(chua co)' };
  } else {
    const { data: goc } = await supabase
      .from('workshop_project_types').select('applies_to, order_index').eq('id', NGUON_TYPE).single();
    const { data, error } = await supabase
      .from('workshop_project_types')
      .insert({
        company_id: METALLA,
        name: TEN_MOI,
        applies_to: goc?.applies_to || 'production',
        order_index: (goc?.order_index || 104) + 1,
        is_active: true,
        description: 'Don do xuong khac dat gia cong — dung quy trinh san xuat cua Data dau ra.',
      })
      .select('id, name').single();
    if (error) throw error;
    loai = data;
    log(`1. Da tao phan loai: ${loai.id}`);
  }

  // 2. Pipeline — sao chép từ Data đầu ra
  const { data: cotNguon, error: eCot } = await supabase
    .from('production_pipeline_stages')
    .select('*')
    .eq('workshop_type_id', NGUON_TYPE)
    .eq('is_active', true)   // cột đã tắt bên nguồn thì không bê sang bản sao
    .order('order_index');
  if (eCot) throw eCot;
  log(`\n2. Pipeline nguon «Data dau ra»: ${cotNguon.length} cot`);

  let daCo = [];
  if (loai.id !== '(chua co)') {
    const { data } = await supabase
      .from('production_pipeline_stages').select('id, name').eq('workshop_type_id', loai.id);
    daCo = data || [];
  }
  const tenDaCo = new Set(daCo.map((c) => c.name));
  const canTao = cotNguon.filter((c) => !tenDaCo.has(c.name));

  log(`   da co ${daCo.length} cot, can tao them ${canTao.length}`);
  canTao.forEach((c) => log(`     ${c.order_index}. ${c.name}`));

  let cotMoi = daCo;
  if (canTao.length && GHI) {
    const rows = canTao.map((c) => {
      const row = {};
      Object.entries(c).forEach(([k, v]) => { if (!BO_QUA_COT.has(k)) row[k] = v; });
      row.workshop_type_id = loai.id;
      row.company_id = METALLA;
      // Cot chuyen phan loai cua ban goc se tro ve dung phan loai cu — bo di,
      // khong thi keo the o phan loai moi lai nhay nguoc ve Data dau ra.
      row.converts_workshop_type = false;
      row.target_workshop_type_id = null;
      return row;
    });
    const { data, error } = await supabase
      .from('production_pipeline_stages').insert(rows).select('id, name, order_index');
    if (error) throw error;
    cotMoi = [...daCo, ...data];
    log(`   Da tao ${data.length} cot`);
  }

  // 3. Dự án nhận từ xưởng khác
  const duAn = await duAnNhanTuXuongKhac();
  log(`\n3. Du an Metalla nhan tu xuong khac: ${duAn.length}`);
  if (!duAn.length) { log('   (khong co)'); return; }

  const cotDau = [...cotMoi].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))[0];
  for (const p of duAn) {
    const dangDung = String(p.workshop_type_id || '') === String(loai.id);
    log(`   ${p.code} | phan loai hien tai: ${p.workshop_type_id || '(trong)'}${dangDung ? ' — da dung' : ''}`);
    if (dangDung || !GHI) continue;
    const patch = { workshop_type_id: loai.id };
    if (cotDau?.id) patch.sx_kanban_column_id = cotDau.id;
    const { error } = await supabase.from('projects').update(patch).eq('id', p.id);
    if (error) { log(`     LOI: ${error.message}`); continue; }
    log(`     -> chuyen sang «${TEN_MOI}», cot «${cotDau?.name || '?'}»`);
  }

  log('\nXong.');
  if (!GHI) log('Chua ghi gi. Them --ghi de chay that.');
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('\nLoi:', e.message);
  process.exit(1);
});
