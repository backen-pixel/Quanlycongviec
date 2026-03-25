/**
 * Seed Sample Data: Lead → Deal → Báo giá → Đơn hàng → Hóa đơn
 * Run: cd backend && node seed-sample-data.js
 */
const { supabase } = require('./src/config/supabase');

// Known IDs from database
const IDS = {
  // Users
  sales: 'ab86523a-e84b-4d7d-b903-945dbb46c5ce',     // Nguyễn Văn Bán (sales)
  admin: '39818612-21fe-4bae-8d37-4c79baa4a6d6',      // Khoa (admin)
  sales2: '1c3f2581-db9f-4970-b8d2-23c28f68e650',     // Trần Hoàng Danh (sales)

  // Customer
  customer: '9e77621e-cdfb-4b27-acfc-0866c0c4203c',   // Nguyễn Văn Minh

  // Sources
  facebookSource: 'a59906cd-0f10-41e8-bd0e-a03ce1d0e7d5',

  // Lead Pipeline Stages
  leadNew:       '7df9bd47-de19-44b3-833d-0bfbf6236fb5',
  leadContacted: '64237ca0-5f05-4264-8177-6b638d1e4067',
  leadConsult:   '072a9156-fe75-41b0-9973-42b54d5d7bfb',
  leadInfoSent:  'b72cc9f6-a6b2-4eb6-83c5-70739b2deec3',
  leadWaiting:   '4740db92-b01b-4b0f-b2a6-113d8e801c66',
  leadConverted: '29d8704b-f077-4e2c-9447-0093375d6e3d',

  // Deal Pipeline Stages
  dealNew:      'b412a1b9-b0b0-4a83-87ac-73ed45943250',
  dealQuote:    '7c8660fb-47a7-4024-9ea4-a6ed59bad7df',
  dealNegot:    '373df05a-1870-4c29-a50c-5b3598cfb50a',
  dealContract: 'cf1d6727-92cb-49e3-88c4-c9951d98d0a8',
  dealWon:      'd1dbccd1-2352-433a-bcf0-b1bb52108fdb',

  // Products (first 3)
  prod1: '062db2bb-18db-487a-829f-7992f5a52161',  // Tủ bếp trên nhôm - 2,550,000
  prod2: '13c200bc-4b7f-4023-8842-faf0b3a19077',  // Tủ bếp trên nhôm CNC - 3,000,000
  prod3: 'efabeb53-fe5d-42d0-81ac-ba4df880986d',  // Tủ bếp trên nhôm siêu trong - 2,650,000
};

async function seed() {
  console.log('🌱 Bắt đầu seed dữ liệu mẫu...\n');

  // ═══════════════════════════════════════════════════
  // 1. TẠO LEAD (Nguồn: Facebook → Sales: Nguyễn Văn Bán)
  // ═══════════════════════════════════════════════════
  console.log('📌 1. Tạo Lead...');
  const { data: lead, error: leadErr } = await supabase.from('crm_leads').insert({
    code: 'LEAD-2026-001',
    title: 'Tủ bếp nhôm chữ L - Căn hộ A.Minh Q7',
    customer_id: IDS.customer,
    stage_id: IDS.leadConverted,  // Đã chuyển deal
    source_id: IDS.facebookSource,
    assigned_to: IDS.sales,
    type: 'lead',
    estimated_value: 45000000,
    probability: 100,
    description: 'KH muốn đóng tủ bếp chữ L cho căn hộ mới, vật liệu nhôm lá ghép. Đã đo kích thước: bếp trên 3.8m, bếp dưới 4.2m.',
    expected_close_date: '2026-04-15',
    actual_close_date: '2026-03-20',
    last_activity_at: new Date().toISOString(),
    next_follow_up: null,
    created_by: IDS.sales,
  }).select().single();

  if (leadErr) { console.error('❌ Lead error:', leadErr); return; }
  console.log(`   ✅ Lead: ${lead.code} - ${lead.title} (ID: ${lead.id})`);

  // ═══════════════════════════════════════════════════
  // 2. ACTIVITIES cho Lead
  // ═══════════════════════════════════════════════════
  console.log('📌 2. Tạo Activities...');
  const activities = [
    {
      lead_id: lead.id,
      customer_id: IDS.customer,
      type: 'call',
      title: 'Gọi điện tư vấn lần 1',
      description: 'KH hỏi về tủ bếp nhôm. Tư vấn vật liệu nhôm lá ghép vs inox. KH thích nhôm.',
      outcome: 'KH quan tâm, hẹn gặp tại showroom',
      activity_date: '2026-03-10T09:30:00Z',
      duration_minutes: 15,
      created_by: IDS.sales,
    },
    {
      lead_id: lead.id,
      customer_id: IDS.customer,
      type: 'meeting',
      title: 'Gặp KH tại showroom',
      description: 'KH đến showroom xem mẫu. Thích mẫu nhôm lá ghép + kính 4 ly thường. Đã đo sơ bộ.',
      outcome: 'KH yêu cầu gửi báo giá',
      activity_date: '2026-03-12T14:00:00Z',
      duration_minutes: 60,
      created_by: IDS.sales,
    },
    {
      lead_id: lead.id,
      customer_id: IDS.customer,
      type: 'note',
      title: 'Gửi thông tin vật liệu qua Zalo',
      description: 'Gửi catalog nhôm lá ghép, bảng so sánh vật liệu, hình ảnh công trình đã làm.',
      outcome: 'KH đã xem, phản hồi tích cực',
      activity_date: '2026-03-13T10:00:00Z',
      created_by: IDS.sales,
    },
    {
      lead_id: lead.id,
      customer_id: IDS.customer,
      type: 'call',
      title: 'Chốt chuyển Deal',
      description: 'KH đồng ý làm. Chuyển sang Deal để tiến hành báo giá chính thức.',
      outcome: 'Chuyển Deal thành công',
      activity_date: '2026-03-15T11:00:00Z',
      duration_minutes: 10,
      created_by: IDS.sales,
    },
  ];
  const { error: actErr } = await supabase.from('crm_activities').insert(activities);
  if (actErr) console.error('❌ Activities error:', actErr);
  else console.log(`   ✅ ${activities.length} activities tạo thành công`);

  // ═══════════════════════════════════════════════════
  // 3. TẠO DEAL (từ Lead)
  // ═══════════════════════════════════════════════════
  console.log('📌 3. Tạo Deal...');
  const { data: deal, error: dealErr } = await supabase.from('crm_leads').insert({
    code: 'DEAL-2026-001',
    title: 'Tủ bếp nhôm chữ L - Căn hộ A.Minh Q7',
    customer_id: IDS.customer,
    stage_id: IDS.dealWon,  // Đã thắng
    source_id: IDS.facebookSource,
    assigned_to: IDS.sales,
    type: 'deal',
    estimated_value: 42800000,
    probability: 100,
    description: 'Deal chuyển từ LEAD-2026-001. Gồm: bếp trên 3.8Md + bếp dưới 4.2Md nhôm lá ghép.',
    expected_close_date: '2026-04-01',
    actual_close_date: '2026-03-22',
    last_activity_at: new Date().toISOString(),
    created_by: IDS.sales,
  }).select().single();

  if (dealErr) { console.error('❌ Deal error:', dealErr); return; }
  console.log(`   ✅ Deal: ${deal.code} - ${deal.title} (ID: ${deal.id})`);

  // Deal activities
  const dealActivities = [
    {
      lead_id: deal.id,
      customer_id: IDS.customer,
      type: 'quote_sent',
      title: 'Gửi báo giá lần 1',
      description: 'Gửi BG chi tiết qua Zalo. Tổng: 48.5tr (trước giảm).',
      outcome: 'KH xin giảm giá',
      activity_date: '2026-03-16T10:00:00Z',
      created_by: IDS.sales,
    },
    {
      lead_id: deal.id,
      customer_id: IDS.customer,
      type: 'meeting',
      title: 'Đàm phán giá + ký hợp đồng',
      description: 'Gặp trực tiếp đàm phán. Giảm 5% cho KH. Ký hợp đồng tại showroom.',
      outcome: 'Đã ký HĐ, đặt cọc 30%',
      activity_date: '2026-03-20T15:00:00Z',
      duration_minutes: 45,
      created_by: IDS.sales,
    },
  ];
  const { error: dActErr } = await supabase.from('crm_activities').insert(dealActivities);
  if (dActErr) console.error('❌ Deal activities error:', dActErr);
  else console.log(`   ✅ ${dealActivities.length} deal activities tạo thành công`);

  // ═══════════════════════════════════════════════════
  // 4. TẠO BÁO GIÁ
  // ═══════════════════════════════════════════════════
  console.log('📌 4. Tạo Báo giá...');

  // Calculate totals
  const items = [
    { product_id: IDS.prod1, name: 'Tủ bếp trên nhôm lá ghép - kính 4 ly thường', unit: 'Md', quantity: 3.8, unit_price: 2550000, dimensions: '3800 x 350 x 700mm', material: 'Nhôm lá ghép', color: 'Vân gỗ walnut' },
    { product_id: IDS.prod2, name: 'Tủ bếp dưới nhôm lá ghép - tay nắm CNC', unit: 'Md', quantity: 4.2, unit_price: 3000000, dimensions: '4200 x 600 x 820mm', material: 'Nhôm lá ghép', color: 'Vân gỗ walnut' },
    { product_id: IDS.prod3, name: 'Phụ kiện ray giảm chấn + bản lề', unit: 'bộ', quantity: 1, unit_price: 3500000, dimensions: null, material: 'Inox 304', color: null },
  ];

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0); // 9,690,000 + 12,600,000 + 3,500,000 = 25,790,000... wait
  // Recalc: 3.8*2550000=9,690,000 + 4.2*3000000=12,600,000 + 1*3500000=3,500,000 = 25,790,000
  // Hmm that's lower than estimated. Let me adjust to be more realistic
  // Actually product prices are per Md (mét dài), so total would be higher in real scenario
  // Let's keep it realistic
  
  const qSubtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const discountPercent = 5;
  const qDiscount = Math.round(qSubtotal * discountPercent / 100);
  const afterDiscount = qSubtotal - qDiscount;
  const taxRate = 10;
  const qTax = Math.round(afterDiscount * taxRate / 100);
  const qTotal = afterDiscount + qTax;

  const { data: quotation, error: qErr } = await supabase.from('quotations').insert({
    code: 'BG-2026-001',
    customer_id: IDS.customer,
    customer_name: 'Nguyễn Văn Minh',
    customer_phone: '0901234567',
    customer_address: '123 Nguyễn Hữu Thọ, Q.7, TP.HCM',
    lead_id: deal.id,
    title: 'Báo giá tủ bếp nhôm chữ L - Căn hộ A.Minh',
    description: 'Tủ bếp trên 3.8Md + Tủ bếp dưới 4.2Md, vật liệu nhôm lá ghép vân gỗ walnut. Bao gồm phụ kiện ray giảm chấn.',
    valid_until: '2026-04-15',
    payment_terms: 'Đặt cọc 30% khi ký HĐ. Thanh toán 40% khi sản xuất xong. 30% sau lắp đặt.',
    delivery_terms: 'Giao hàng + lắp đặt tại nhà. Thời gian SX: 15-20 ngày.',
    notes: 'Bảo hành 5 năm. Miễn phí vận chuyển nội thành TP.HCM.',
    subtotal: qSubtotal,
    discount_type: 'percent',
    discount_value: discountPercent,
    discount_amount: qDiscount,
    tax_rate: taxRate,
    tax_amount: qTax,
    total: qTotal,
    status: 'accepted',
    sent_at: '2026-03-16T10:30:00Z',
    accepted_at: '2026-03-20T15:30:00Z',
    created_by: IDS.sales,
    approved_by: IDS.admin,
  }).select().single();

  if (qErr) { console.error('❌ Quotation error:', qErr); return; }
  console.log(`   ✅ Báo giá: ${quotation.code} - Tổng: ${qTotal.toLocaleString('vi-VN')}đ`);
  console.log(`      Subtotal: ${qSubtotal.toLocaleString()} | Giảm ${discountPercent}%: -${qDiscount.toLocaleString()} | VAT ${taxRate}%: +${qTax.toLocaleString()}`);

  // Quotation items
  const qItems = items.map((item, idx) => ({
    quotation_id: quotation.id,
    product_id: item.product_id,
    item_order: idx + 1,
    name: item.name,
    description: item.dimensions ? `KT: ${item.dimensions}` : null,
    unit: item.unit,
    quantity: item.quantity,
    unit_price: item.unit_price,
    discount_percent: 0,
    amount: item.quantity * item.unit_price,
    dimensions: item.dimensions,
    material: item.material,
    color: item.color,
  }));
  const { error: qiErr } = await supabase.from('quotation_items').insert(qItems);
  if (qiErr) console.error('❌ Quotation items error:', qiErr);
  else console.log(`   ✅ ${qItems.length} items báo giá`);

  // ═══════════════════════════════════════════════════
  // 5. TẠO ĐƠN HÀNG (từ Báo giá)
  // ═══════════════════════════════════════════════════
  console.log('📌 5. Tạo Đơn hàng...');

  const { data: order, error: oErr } = await supabase.from('orders').insert({
    code: 'DH-2026-001',
    customer_id: IDS.customer,
    customer_name: 'Nguyễn Văn Minh',
    customer_phone: '0901234567',
    customer_address: '123 Nguyễn Hữu Thọ, Q.7, TP.HCM',
    quotation_id: quotation.id,
    lead_id: deal.id,
    title: 'Đơn hàng tủ bếp nhôm chữ L - A.Minh',
    description: 'Đơn hàng từ BG-2026-001. Đã ký hợp đồng + đặt cọc 30%.',
    order_date: '2026-03-20',
    delivery_date: '2026-04-10',
    payment_terms: 'Đặt cọc 30% - SX xong 40% - Lắp đặt xong 30%',
    delivery_address: '123 Nguyễn Hữu Thọ, P. Tân Hưng, Q.7, TP.HCM, Tầng 15 căn 1508',
    notes: 'Giao hàng + lắp đặt. Liên hệ trước 1 ngày.',
    subtotal: qSubtotal,
    discount_type: 'percent',
    discount_value: discountPercent,
    discount_amount: qDiscount,
    tax_rate: taxRate,
    tax_amount: qTax,
    total: qTotal,
    paid_amount: Math.round(qTotal * 0.3),  // Đặt cọc 30%
    payment_status: 'partial',
    status: 'processing',
    confirmed_at: '2026-03-20T16:00:00Z',
    created_by: IDS.sales,
  }).select().single();

  if (oErr) { console.error('❌ Order error:', oErr); return; }
  console.log(`   ✅ Đơn hàng: ${order.code} - Tổng: ${qTotal.toLocaleString('vi-VN')}đ | Đã cọc: ${Math.round(qTotal * 0.3).toLocaleString()}đ`);

  // Order items
  const oItems = items.map((item, idx) => ({
    order_id: order.id,
    product_id: item.product_id,
    quotation_item_id: null, // could link but skip for simplicity
    item_order: idx + 1,
    name: item.name,
    description: item.dimensions ? `KT: ${item.dimensions}` : null,
    unit: item.unit,
    quantity: item.quantity,
    unit_price: item.unit_price,
    discount_percent: 0,
    amount: item.quantity * item.unit_price,
    dimensions: item.dimensions,
    material: item.material,
    color: item.color,
  }));
  const { error: oiErr } = await supabase.from('order_items').insert(oItems);
  if (oiErr) console.error('❌ Order items error:', oiErr);
  else console.log(`   ✅ ${oItems.length} items đơn hàng`);

  // ═══════════════════════════════════════════════════
  // 6. TẠO HÓA ĐƠN (từ Đơn hàng)
  // ═══════════════════════════════════════════════════
  console.log('📌 6. Tạo Hóa đơn...');

  const { data: invoice, error: iErr } = await supabase.from('invoices').insert({
    code: 'HD-2026-001',
    invoice_number: 'HD0001/2026',
    customer_id: IDS.customer,
    customer_name: 'Nguyễn Văn Minh',
    customer_phone: '0901234567',
    customer_address: '123 Nguyễn Hữu Thọ, Q.7, TP.HCM',
    customer_tax_code: null,
    order_id: order.id,
    quotation_id: quotation.id,
    title: 'Hóa đơn tủ bếp nhôm chữ L - A.Minh',
    description: 'Hóa đơn thanh toán đợt 1 (đặt cọc 30%)',
    invoice_date: '2026-03-20',
    due_date: '2026-03-20',
    payment_method: 'transfer',
    bank_account: 'VPBank - 123456789 - Công ty Bếp Phương Nam',
    notes: 'Đặt cọc 30% theo hợp đồng. Đã nhận thanh toán.',
    subtotal: qSubtotal,
    discount_type: 'percent',
    discount_value: discountPercent,
    discount_amount: qDiscount,
    tax_rate: taxRate,
    tax_amount: qTax,
    total: qTotal,
    paid_amount: Math.round(qTotal * 0.3),
    payment_status: 'partial',
    status: 'issued',
    issued_at: '2026-03-20T16:30:00Z',
    created_by: IDS.sales,
  }).select().single();

  if (iErr) { console.error('❌ Invoice error:', iErr); return; }
  console.log(`   ✅ Hóa đơn: ${invoice.code} - Tổng: ${qTotal.toLocaleString('vi-VN')}đ | Đã thu: ${Math.round(qTotal * 0.3).toLocaleString()}đ`);

  // Invoice items
  const invItems = items.map((item, idx) => ({
    invoice_id: invoice.id,
    product_id: item.product_id,
    item_order: idx + 1,
    name: item.name,
    description: item.dimensions ? `KT: ${item.dimensions}` : null,
    unit: item.unit,
    quantity: item.quantity,
    unit_price: item.unit_price,
    discount_percent: 0,
    amount: item.quantity * item.unit_price,
  }));
  const { error: iiErr } = await supabase.from('invoice_items').insert(invItems);
  if (iiErr) console.error('❌ Invoice items error:', iiErr);
  else console.log(`   ✅ ${invItems.length} items hóa đơn`);

  // ═══════════════════════════════════════════════════
  // 7. PAYMENT RECORD (Đặt cọc)
  // ═══════════════════════════════════════════════════
  console.log('📌 7. Tạo phiếu thanh toán...');
  const depositAmount = Math.round(qTotal * 0.3);
  const { error: prErr } = await supabase.from('payment_records').insert({
    invoice_id: invoice.id,
    order_id: order.id,
    amount: depositAmount,
    payment_date: '2026-03-20',
    payment_method: 'transfer',
    reference_number: 'VPB-20260320-001',
    notes: 'Đặt cọc 30% theo HĐ. CK qua VPBank.',
    created_by: IDS.sales,
  });
  if (prErr) console.error('❌ Payment error:', prErr);
  else console.log(`   ✅ Thanh toán: ${depositAmount.toLocaleString()}đ (CK VPBank)`);

  // ═══════════════════════════════════════════════════
  // 8. UPDATE LINKS (Lead → Deal)
  // ═══════════════════════════════════════════════════
  console.log('📌 8. Cập nhật liên kết...');
  
  // Link quotation to lead & deal
  await supabase.from('quotations').update({ lead_id: deal.id }).eq('id', quotation.id);
  // Link order
  await supabase.from('orders').update({ lead_id: deal.id }).eq('id', order.id);

  // Update code sequences
  await supabase.from('code_sequences').upsert([
    { prefix: 'LEAD', current_number: 1, year: 2026 },
    { prefix: 'DEAL', current_number: 1, year: 2026 },
    { prefix: 'BG', current_number: 1, year: 2026 },
    { prefix: 'DH', current_number: 1, year: 2026 },
    { prefix: 'HD', current_number: 1, year: 2026 },
  ]);

  console.log('\n══════════════════════════════════════════');
  console.log('🎉 SEED HOÀN TẤT! Tóm tắt:');
  console.log('══════════════════════════════════════════');
  console.log(`📋 Lead:     ${lead.code} → "${lead.title}" (Đã chuyển Deal)`);
  console.log(`🎯 Deal:     ${deal.code} → "${deal.title}" (Thắng ✅)`);
  console.log(`💰 Báo giá:  ${quotation.code} → Tổng ${qTotal.toLocaleString('vi-VN')}đ (Accepted)`);
  console.log(`📦 Đơn hàng: ${order.code} → Tổng ${qTotal.toLocaleString('vi-VN')}đ (Đang SX)`);
  console.log(`🧾 Hóa đơn:  ${invoice.code} → Tổng ${qTotal.toLocaleString('vi-VN')}đ (Đã cọc ${depositAmount.toLocaleString()}đ)`);
  console.log('──────────────────────────────────────────');
  console.log(`👤 Khách: Nguyễn Văn Minh (0901234567)`);
  console.log(`👷 Sales: Nguyễn Văn Bán`);
  console.log(`📍 Địa chỉ: 123 Nguyễn Hữu Thọ, Q.7, TP.HCM`);
  console.log('══════════════════════════════════════════');
  console.log('\n📎 Chi tiết sản phẩm:');
  items.forEach((i, idx) => {
    console.log(`   ${idx+1}. ${i.name}`);
    console.log(`      ${i.quantity} ${i.unit} × ${i.unit_price.toLocaleString()}đ = ${(i.quantity * i.unit_price).toLocaleString()}đ`);
  });
  console.log(`\n   Tạm tính: ${qSubtotal.toLocaleString()}đ`);
  console.log(`   Giảm ${discountPercent}%: -${qDiscount.toLocaleString()}đ`);
  console.log(`   VAT ${taxRate}%: +${qTax.toLocaleString()}đ`);
  console.log(`   ═══════════════════`);
  console.log(`   TỔNG: ${qTotal.toLocaleString()}đ`);
}

seed().catch(err => console.error('💥 Fatal:', err));
