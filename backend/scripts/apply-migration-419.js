/**
 * Apply migration 419 via Supabase REST (service role).
 * Usage: node scripts/apply-migration-419.js
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const COMPANY_ID = '29677f68-967e-4256-92fd-492bb580e888';
const ASSIGNEE_ID = '5e07fb3b-3286-4ca3-a167-4edef16f3866';

const ITEMS = [
  {
    title: 'Kiểm tra đơn hàng',
    description: 'Đối chiếu mã dự án, packing list và số kiện trước khi lập lệnh giao.',
    priority: 'high', deadline_days: 0, order_index: 1, blocks_stage_advance: false,
    checklist: [
      { text: 'Đối chiếu mã dự án / mã đơn trên phiếu và thùng hàng' },
      { text: 'Xác nhận tổng số kiện và phụ kiện đi kèm' },
      { text: 'Ghi nhận hạng mục thiếu / cần bổ sung (nếu có)' },
    ],
  },
  {
    title: 'Xác nhận nhận hàng',
    description: 'Xác nhận đã nhận đủ hàng tại kho / trước khi xuất đi giao.',
    priority: 'high', deadline_days: 0, order_index: 2, blocks_stage_advance: true,
    checklist: [
      { text: 'Kiểm đếm kiện thực tế so với packing list' },
      { text: 'Chụp ảnh tổng quan hàng trước xuất kho' },
      { text: 'Ký / tick xác nhận đã nhận đủ hàng' },
    ],
  },
  {
    title: 'Kiểm tra sau vận chuyển',
    description: 'Kiểm tra tình trạng hàng sau khi vận chuyển đến công trình.',
    priority: 'high', deadline_days: 1, order_index: 3, blocks_stage_advance: false,
    checklist: [
      { text: 'Kiểm tra kiện hàng có va quệt / hư hỏng trên đường' },
      { text: 'Đối chiếu số kiện đến công trình' },
      { text: 'Chụp ảnh hiện trường sau vận chuyển' },
    ],
  },
  {
    title: 'Xác nhận đã vận chuyển',
    description: 'Biên bản giao hàng tại công trình (POD).',
    priority: 'high', deadline_days: 1, order_index: 4, blocks_stage_advance: true,
    checklist: [
      { text: 'Khách ký biên bản giao hàng hoặc OTP xác nhận' },
      { text: 'Chụp ảnh proof of delivery (POD)' },
      { text: 'Ghi nhận khu vực tập kết hàng trên công trình' },
    ],
  },
  {
    title: 'Kiểm tra nhận hàng',
    description: 'Kiểm tra hàng và mặt bằng trước khi bắt đầu lắp đặt.',
    priority: 'high', deadline_days: 0, order_index: 5, blocks_stage_advance: false,
    checklist: [
      { text: 'Kiểm tra kiện / phụ kiện trước lắp' },
      { text: 'Kiểm tra mặt bằng trống, sạch, đủ điều kiện thi công' },
      { text: 'Đo lại kích thước thực tế so với bản vẽ' },
    ],
  },
  {
    title: 'Quá trình lắp đặt',
    description: 'Thi công lắp đặt theo bản vẽ tại công trình.',
    priority: 'high', deadline_days: 2, order_index: 6, blocks_stage_advance: false,
    checklist: [
      { text: 'Lắp theo bản vẽ hiện trường đã duyệt' },
      { text: 'Ghi nhận phát sinh / sai lệch (nếu có)' },
      { text: 'Thu gom rác thi công, giữ vệ sinh công trình' },
    ],
  },
  {
    title: 'Nghiệm thu',
    description: 'Nghiệm thu và bàn giao với khách.',
    priority: 'high', deadline_days: 1, order_index: 7, blocks_stage_advance: true,
    checklist: [
      { text: 'Khách kiểm tra và ký biên bản nghiệm thu' },
      { text: 'Ghi rõ hạng mục tồn / hẹn xử lý (nếu có)' },
      { text: 'Chụp ảnh công trình hoàn thiện' },
    ],
  },
];

async function main() {
  const url = process.env.SUPABASE_URL || process.env.PRIMARY_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.PRIMARY_SERVICE_ROLE_KEY;
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = process.env.SUPABASE_PROJECT_REF || process.env.PRIMARY_PROJECT_REF;
  if (!url || !key) {
    console.error('Thiếu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  const supabase = createClient(url, key);

  // Hoàn thành pipeline
  const { data: existingCompleted } = await supabase
    .from('logistics_pipeline_stages')
    .select('id')
    .is('company_id', null)
    .eq('bucket_slug', 'completed')
    .maybeSingle();
  if (!existingCompleted?.id) {
    const { error: insErr } = await supabase.from('logistics_pipeline_stages').insert({
      name: 'Hoàn thành',
      color: '#16a34a',
      icon: '✅',
      order_index: 5,
      is_active: true,
      bucket_slug: 'completed',
      company_id: null,
    });
    if (insErr) throw insErr;
    console.log('Đã thêm cột pipeline Hoàn thành.');
  } else {
    console.log('Cột Hoàn thành đã có:', existingCompleted.id);
  }

  await supabase
    .from('workshop_task_templates')
    .update({ is_active: false, is_default: false })
    .eq('workshop_area', 'logistics')
    .eq('company_id', COMPANY_ID)
    .in('name', [
      'Quy trình VC/LĐ Phúc Đạt — Giao hàng & bàn giao',
      'Bộ mẫu Vận chuyển & Lắp đặt — Phúc Đạt',
    ]);

  let { data: tpl } = await supabase
    .from('workshop_task_templates')
    .select('id, name')
    .eq('workshop_area', 'logistics')
    .eq('company_id', COMPANY_ID)
    .eq('name', 'Quy trình VC/LĐ Phúc Đạt — Đơn giản')
    .maybeSingle();

  if (!tpl?.id) {
    const { data: created, error: ce } = await supabase
      .from('workshop_task_templates')
      .insert({
        name: 'Quy trình VC/LĐ Phúc Đạt — Đơn giản',
        workshop_area: 'logistics',
        description: 'Bộ vận chuyển (4 bước) + bộ lắp đặt (3 bước) cho Phúc Đạt.',
        company_id: COMPANY_ID,
        is_active: true,
        is_default: true,
        order_index: 1,
      })
      .select('id, name')
      .single();
    if (ce) throw ce;
    tpl = created;
    console.log('Đã tạo bộ mẫu:', tpl.name);
  } else {
    await supabase.from('workshop_task_templates').update({ is_active: true, is_default: true }).eq('id', tpl.id);
    console.log('Bộ mẫu đã có:', tpl.name);
  }

  const { data: existingItems } = await supabase
    .from('workshop_task_template_items')
    .select('title')
    .eq('template_id', tpl.id);
  const have = new Set((existingItems || []).map((i) => i.title));
  const toInsert = ITEMS.filter((i) => !have.has(i.title)).map((i) => ({
    template_id: tpl.id,
    title: i.title,
    description: i.description,
    priority: i.priority,
    deadline_days: i.deadline_days,
    order_index: i.order_index,
    checklist: i.checklist,
    default_assignee_id: ASSIGNEE_ID,
    blocks_stage_advance: i.blocks_stage_advance,
  }));
  if (toInsert.length) {
    const { error: ie } = await supabase.from('workshop_task_template_items').insert(toInsert);
    if (ie) throw ie;
    console.log(`Đã thêm ${toInsert.length} mục bộ mẫu.`);
  } else {
    console.log('Các mục bộ mẫu đã đủ.');
  }

  const { data: stages } = await supabase
    .from('logistics_pipeline_stages')
    .select('id, name, bucket_slug, order_index')
    .is('company_id', null)
    .order('order_index');
  console.log('Pipeline VC global:', stages?.map((s) => `${s.order_index}. ${s.name}`).join(' | '));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
