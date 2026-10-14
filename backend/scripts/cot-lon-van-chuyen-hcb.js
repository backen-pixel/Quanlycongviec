#!/usr/bin/env node
/**
 * Tach cot lon «Van chuyen» khoi «Dong goi» trong pipeline Tu bep HCB,
 * giao Cong Truong phu trach, va giao lai nhiem vu chua xong cua cac cot do.
 *
 *   node backend/scripts/cot-lon-van-chuyen-hcb.js          # thu, khong ghi
 *   node backend/scripts/cot-lon-van-chuyen-hcb.js --ghi    # ghi that
 *
 * Ba cot «DON HANG NGAY MAI GIAO», «DON HANG DA GIAO», «Van chuyen» dang nam chung
 * cot lon dong_goi. Dong goi va giao hang la hai khau khac nhau, hai nguoi khac nhau —
 * gop chung thi bang Kanban khong tach duoc, va phu trach cot cung bi tron.
 *
 * Nhan «van_chuyen» -> «Van chuyen» khai trong frontend/src/lib/sxGopCot.js.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const { supabase } = require('../src/config/supabase');

const GHI = process.argv.includes('--ghi');
const HCB = '18c2563f-3495-498d-8199-23200c9f420e';
const TUBEP = '8814095f-f5c7-411e-b83e-aa01a1d7718c';
const NHOM = 'van_chuyen';
const TEN_PHU_TRACH = 'Công Trương';
const TEN_COT = ['ĐƠN HÀNG NGÀY MAI GIAO', 'ĐƠN HÀNG ĐÃ GIAO', 'Vận chuyển'];

async function main() {
  console.log('\nTach cot lon «Van chuyen» — pipeline Tu bep HCB');
  console.log(GHI ? '   CHE DO: GHI THAT\n' : '   CHE DO: THU (khong ghi) — them --ghi\n');

  const { data: nv } = await supabase
    .from('users').select('id, full_name').eq('full_name', TEN_PHU_TRACH).maybeSingle();
  if (!nv) { console.log(`Khong tim thay nhan vien «${TEN_PHU_TRACH}»`); return; }
  console.log(`Phu trach: ${nv.full_name} (${nv.id})\n`);

  const { data: cot } = await supabase
    .from('production_pipeline_stages')
    .select('id, name, order_index, group_key')
    .eq('company_id', HCB).eq('workshop_type_id', TUBEP).eq('is_active', true)
    .in('name', TEN_COT);
  if (cot?.length !== TEN_COT.length) {
    console.log(`!! chi tim thay ${cot?.length || 0}/${TEN_COT.length} cot`);
    (cot || []).forEach((c) => console.log(`   co: ${c.name}`));
  }

  for (const c of cot || []) {
    console.log(`${c.order_index}. ${c.name}`);
    console.log(`     cot lon: ${c.group_key || '(khong)'} -> ${NHOM}`);

    if (!GHI) {
      const { data: st } = await supabase
        .from('production_pipeline_stage_default_staff')
        .select('user_id, is_primary').eq('production_pipeline_stage_id', c.id).eq('is_primary', true).limit(1);
      const cu = st?.[0]?.user_id
        ? (await supabase.from('users').select('full_name').eq('id', st[0].user_id).maybeSingle()).data?.full_name
        : '(chua khai)';
      console.log(`     phu trach: ${cu} -> ${nv.full_name}`);

      const { data: tpls } = await supabase
        .from('workshop_task_templates').select('id, name').eq('production_stage_id', c.id).eq('is_active', true);
      let n = 0;
      for (const t of tpls || []) {
        const { count } = await supabase.from('tasks').select('id', { count: 'exact', head: true })
          .neq('status', 'done').neq('assignee_id', nv.id)
          .contains('metadata', { workshop_template_id: String(t.id) });
        n += count || 0;
      }
      console.log(`     bo mau gan cot nay: ${(tpls || []).length} | nhiem vu se giao lai: ${n}`);
      continue;
    }

    const { error: e1 } = await supabase
      .from('production_pipeline_stages')
      .update({ group_key: NHOM })
      .eq('id', c.id);
    if (e1) { console.log(`     LOI cot lon: ${e1.message}`); continue; }

    // Dung chung duong luu cua trang Pipeline xuong — no tu giao lai nhiem vu cua cot.
    const { savePipelineStageDefaultStaff } = require('../src/helpers/productionWorkshopTypeStaff');
    try {
      const r = await savePipelineStageDefaultStaff(c.id, HCB, {
        user_ids: [nv.id],
        primary_user_id: nv.id,
      });
      console.log(`     da gan phu trach | nhiem vu giao lai: ${r.nhiem_vu_giao_lai ?? 0}`);
    } catch (e) {
      console.log(`     LOI phu trach: ${e.message}`);
    }
  }

  console.log(GHI ? '\nXong.' : '\nChua ghi gi. Them --ghi de chay that.');
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('\nLoi:', e.message);
  process.exit(1);
});
