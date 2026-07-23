/**
 * Tạo deal CRM VPT + chuyển xưởng Metalla + báo giá mẫu để test kế toán.
 * Usage: node scripts/create-ketoan-test-deal.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { supabase } = require('../src/config/supabase');
const { autoCreateProjectFromWonDeal } = require('../src/helpers/autoDealWonProject');

const VPT = '991dc79d-cbf5-49f9-a364-35227cb47635';
const METALLA = 'b78baba2-2486-434c-a72d-9c937fac2164';
const PIPELINE = '78e6251c-aea1-46bc-a19f-a401f1de7f34'; // CRM — Bếp Vạn Phú Thành
const STAGE_SIGNED = 'dc1fbdfe-a51b-44ed-8c0f-9ecf85e54cf7'; // ĐÃ KÝ HỢP ĐỒNG (is_won)
const STAGE_SX = '5b986dd4-5fc3-4a59-95c7-993a93ca3538'; // ĐANG SẢN XUẤT
const REGION_HCM = 'f68e643d-7999-442c-83ee-edb7f5237ab1';
const ADMIN_VPT = '49fcd3ff-0d7c-4d54-8f5a-1068bd10d68c';
const WTYPE_DATA_RA = '607703bc-b86e-407a-a91d-4ab91df4c558';

async function nextCode(prefix, table) {
  const year = new Date().getFullYear();
  const like = `${prefix}-${year}-%`;
  const { data } = await supabase.from(table).select('code').like('code', like).order('code', { ascending: false }).limit(30);
  let max = 0;
  for (const row of data || []) {
    const m = String(row.code || '').match(new RegExp(`^${prefix}-${year}-(\\d+)$`));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}-${year}-${String(max + 1).padStart(3, '0')}`;
}

async function main() {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const phone = `090${String(Date.now()).slice(-7)}`;
  const customerName = `TEST KẾ TOÁN ${stamp}`;
  const dealTitle = `[TEST KT] ${customerName} — Tủ bếp Metalla`;
  const dealValue = 85_000_000;

  console.log('1) Tạo customer…');
  const { data: customer, error: cErr } = await supabase.from('customers').insert({
    full_name: customerName,
    phone,
    address: '123 Đường Test, Quận 7, TP.HCM',
    company_id: VPT,
  }).select('id, full_name, phone').single();
  if (cErr) throw cErr;

  const dealCode = await nextCode('DEAL', 'crm_leads');
  console.log('2) Tạo deal', dealCode, '…');
  const { data: deal, error: dErr } = await supabase.from('crm_leads').insert({
    code: dealCode,
    type: 'deal',
    title: dealTitle,
    customer_id: customer.id,
    company_id: VPT,
    region_id: REGION_HCM,
    pipeline_id: PIPELINE,
    stage_id: STAGE_SIGNED,
    estimated_value: dealValue,
    assigned_to: ADMIN_VPT,
    lead_owner_id: ADMIN_VPT,
    created_by: ADMIN_VPT,
    install_address: '123 Đường Test, Quận 7, TP.HCM',
    description: 'Deal test kế toán: CRM BG → KT CRM ĐH → KT xưởng HĐ. Xưởng Metalla.',
    stage_entered_at: new Date().toISOString(),
  }).select('id, code, title, estimated_value, stage_id, project_id').single();
  if (dErr) throw dErr;

  console.log('3) Chuyển xưởng Metalla (autoCreateProject)…');
  const reqStub = { user: { userId: ADMIN_VPT, role: 'admin', company_id: VPT } };
  const sx = await autoCreateProjectFromWonDeal({
    req: reqStub,
    dealId: deal.id,
    userId: ADMIN_VPT,
    productionCompanyId: METALLA,
    workshopTypeId: WTYPE_DATA_RA,
  });
  if (!sx.ok) {
    console.error('SX fail:', sx);
    throw new Error(sx.error || 'Không tạo được project');
  }

  // Đưa deal sang cột ĐANG SẢN XUẤT (show_sx_transfer) để dễ thấy trên CRM
  await supabase.from('crm_leads').update({
    stage_id: STAGE_SX,
    stage_entered_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', deal.id);

  // Mirror giá deal trên project; chi phí SX để trống / nhập riêng trên SX
  if (sx.project_id) {
    await supabase.from('projects').update({
      estimated_value: dealValue,
      production_value: null,
      updated_at: new Date().toISOString(),
    }).eq('id', sx.project_id);
  }

  const quoteCode = await nextCode('BG', 'quotations');
  console.log('4) Tạo báo giá mẫu', quoteCode, '…');
  const items = [
    { name: 'Tủ bếp dưới', unit: 'md', quantity: 4, unit_price: 8_500_000, discount_percent: 0 },
    { name: 'Tủ bếp trên', unit: 'md', quantity: 3, unit_price: 6_500_000, discount_percent: 5 },
    { name: 'Mặt đá nhân tạo', unit: 'm2', quantity: 5, unit_price: 2_200_000, discount_percent: 0 },
  ].map((it, i) => {
    const gross = it.quantity * it.unit_price;
    const discount_amount = Math.round(gross * (it.discount_percent || 0) / 100);
    const amount = gross - discount_amount;
    return {
      ...it,
      item_order: i,
      discount_amount,
      amount,
      vat_rate: 0,
      vat_amount: 0,
      tax_amount: 0,
      total: amount,
    };
  });
  const subtotal = items.reduce((s, i) => s + i.amount, 0);
  const discount_value = 0;
  const tax_amount = 0;
  const total = subtotal - discount_value + tax_amount;

  const { data: quote, error: qErr } = await supabase.from('quotations').insert({
    code: quoteCode,
    title: `Báo giá test — ${customerName}`,
    lead_id: deal.id,
    customer_id: customer.id,
    customer_name: customer.full_name,
    customer_phone: customer.phone,
    customer_address: '123 Đường Test, Quận 7, TP.HCM',
    company_id: VPT,
    region_id: REGION_HCM,
    project_id: sx.project_id || null,
    status: 'accepted',
    payment_terms: 'Thanh toán 40% khi ký HĐ, Thanh toán 60% khi bàn giao',
    subtotal,
    discount_type: 'percent',
    discount_value,
    discount_amount: 0,
    sale_discount_type: 'amount',
    sale_discount_value: 0,
    sale_discount_amount: 0,
    tax_amount,
    total,
    created_by: ADMIN_VPT,
    notes: 'BG test cho luồng kế toán — có thể convert → ĐH trên /ketoan',
  }).select('id, code, total, status').single();
  if (qErr) throw qErr;

  const { error: qiErr } = await supabase.from('quotation_items').insert(
    items.map((it) => ({ ...it, quotation_id: quote.id })),
  );
  if (qiErr) throw qiErr;

  // Align deal estimated_value với BG
  await supabase.from('crm_leads').update({
    estimated_value: total,
    updated_at: new Date().toISOString(),
  }).eq('id', deal.id);
  if (sx.project_id) {
    await supabase.from('projects').update({
      estimated_value: total,
      // production_value giữ nguyên / nhập tay ở SX — không gán = tổng BG
    }).eq('id', sx.project_id);
  }

  const { data: dealFinal } = await supabase
    .from('crm_leads')
    .select('id, code, title, estimated_value, project_id, stage:crm_pipeline_stages!crm_leads_stage_id_fkey(name)')
    .eq('id', deal.id)
    .single();

  console.log('\n========== DEAL TEST KẾ TOÁN ==========');
  console.log(JSON.stringify({
    deal: dealFinal,
    project: { id: sx.project_id, code: sx.project_code, name: sx.project_name },
    quotation: quote,
    customer,
    workshop: 'Metalla · Data đầu ra',
    links: {
      crm_deal: `/crm/leads/${deal.id}`,
      ketoan: `/ketoan/deals/${deal.id}`,
      quotation: `/crm/quotations/${quote.id}`,
      sx_project: `/sx/projects/${sx.project_id}`,
    },
    how_to_test: [
      '1. CRM: mở báo giá — chỉnh CK nếu cần, Lưu',
      '2. KT CRM (/ketoan): tạo ĐH từ BG (convert-to-order) hoặc Import ĐH gắn BG',
      '3. SX / nhiệm vụ: xuất HĐ từ ĐH hoặc Import Excel HĐ',
      'Login kế toán VPT: ketoanvanphuthanh.vpt@gmail.com / ketoan1@vpt.vn',
    ],
  }, null, 2));
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
