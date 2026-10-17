/**
 * Sửa bộ mẫu "Sản xuất" (Báo giá cho xưởng, Phúc Đạt) thành dùng chung mọi phân loại
 * (workshop_type_id = null) — vì nhiều dự án Phúc Đạt chưa gán workshop_type_id, và
 * hàm áp bộ mẫu theo cột chỉ khớp template có workshop_type_id khớp dự án HOẶC null.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { supabase } = require('../src/config/supabase');

const PHUC_DAT = '29677f68-967e-4256-92fd-492bb580e888';
const SAN_XUAT_STAGE_ID = '678af9e1-8a6b-44c6-b346-456f59fc3705';

async function main() {
  const { data: tpl, error: findErr } = await supabase
    .from('workshop_task_templates')
    .select('id, workshop_type_id')
    .eq('company_id', PHUC_DAT)
    .eq('production_stage_id', SAN_XUAT_STAGE_ID)
    .single();
  if (findErr) throw findErr;
  console.log('Before:', tpl);

  const { data, error } = await supabase
    .from('workshop_task_templates')
    .update({ workshop_type_id: null })
    .eq('id', tpl.id)
    .select();
  if (error) throw error;
  console.log('After:', JSON.stringify(data));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
