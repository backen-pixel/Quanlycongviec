/**
 * Tạo deal test Phúc Đạt → SX Hucabi, đặt ngay trước cột trigger VC/LĐ.
 * Usage: node scripts/create-vc-handover-test-deal.js
 *
 * Cách test:
 * 1. Mở SX Hucabi → tìm project
 * 2. Kéo thẻ vào cột «ĐƠN HÀNG ĐÃ CHUẨN BỊ XONG» (is_handover_to_logistics)
 * 3. Sale CRM chọn công ty VC/LĐ trên thẻ bàn giao
 * 4. Kiểm tra CRM → cột «Vận chuyển/lắp đặt.» + module VC Phúc Đạt
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { supabase } = require('../src/config/supabase');
const { autoCreateProjectFromWonDeal } = require('../src/helpers/autoDealWonProject');

const CRM_COMPANY = '29677f68-967e-4256-92fd-492bb580e888'; // Phúc Đạt
const SX_COMPANY = '18c2563f-3495-498d-8199-23200c9f420e'; // Hucabi
const PIPELINE = '6017bdcd-5683-4f81-9f84-4a5e7bc8d373';
const STAGE_SIGNED = '448f4a0c-196d-46c2-82d9-88801db75094'; // Đã ký hợp đồng.
const STAGE_SX = '654738d6-568a-411c-9733-931b119bc844'; // Sản xuất. (sx_production)
const SALE_USER = 'baf36251-a8ce-4622-9dfe-3a697b477bef'; // Trương Minh Đức
const SX_PERSON = 'baae8329-c0a0-4893-a858-f4918323d7da'; // Sang Thiết Kế VPT 1
const WTYPE = '8814095f-f5c7-411e-b83e-aa01a1d7718c';
const COL_BEFORE_VC = 'a910bfd3-7cf1-4033-8a67-bc49463b591f'; // KT KCS SẢN PHẨM, TÍNH CN
const COL_VC_TRIGGER = 'eafcaf6b-7c1d-44b9-9944-7d7940d46d10'; // ĐƠN HÀNG ĐÃ CHUẨN BỊ XONG (handover)
const WF_PRODUCTION = 'be72da83-5ddb-498f-a51d-327eb2641cc9';

async function nextCode(prefix, table) {
  const year = new Date().getFullYear();
  const like = `${prefix}-${year}-%`;
  const { data } = await supabase.from(table).select('code').like('code', like).order('code', { ascending: false }).limit(40);
  let max = 0;
  for (const row of data || []) {
    const m = String(row.code || '').match(new RegExp(`^${prefix}-${year}-(\\d+)$`));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}-${year}-${String(max + 1).padStart(3, '0')}`;
}

async function main() {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const phone = `091${String(Date.now()).slice(-7)}`;
  const customerName = `TEST VC/LD ${stamp}`;
  const dealTitle = `test vc ld handover ${stamp}`;
  const dealValue = 45_000_000;
  const now = new Date().toISOString();

  console.log('1) Customer…');
  const { data: customer, error: cErr } = await supabase.from('customers').insert({
    full_name: customerName,
    phone,
    address: '88 Đường Test VC/LD, Quận 12, TP.HCM',
    company_id: CRM_COMPANY,
  }).select('id, full_name, phone').single();
  if (cErr) throw cErr;

  const dealCode = await nextCode('DEAL', 'crm_leads');
  console.log('2) Deal', dealCode, '…');
  const { data: deal, error: dErr } = await supabase.from('crm_leads').insert({
    code: dealCode,
    type: 'deal',
    title: dealTitle,
    customer_id: customer.id,
    company_id: CRM_COMPANY,
    pipeline_id: PIPELINE,
    stage_id: STAGE_SIGNED,
    estimated_value: dealValue,
    assigned_to: SALE_USER,
    lead_owner_id: SALE_USER,
    created_by: SALE_USER,
    install_address: '88 Đường Test VC/LD, Quận 12, TP.HCM',
    description: 'Deal test: SX kéo vào cột trigger VC/LD → Sale chọn công ty → CRM vc_delivery + module VC.',
    stage_entered_at: now,
  }).select('id, code, title').single();
  if (dErr) throw dErr;

  console.log('3) Tạo project SX Hucabi…');
  const reqStub = { user: { userId: SALE_USER, role: 'admin', company_id: CRM_COMPANY } };
  const sx = await autoCreateProjectFromWonDeal({
    req: reqStub,
    dealId: deal.id,
    userId: SALE_USER,
    productionCompanyId: SX_COMPANY,
    workshopTypeId: WTYPE,
  });
  if (!sx.ok) {
    console.error('SX fail:', sx);
    throw new Error(sx.error || 'Không tạo được project');
  }

  console.log('4) Đưa CRM → Sản xuất + project → cột trước trigger VC…');
  await supabase.from('crm_leads').update({
    stage_id: STAGE_SX,
    stage_entered_at: now,
    sx_handover_at: now,
    sx_pipeline_stage_id: COL_BEFORE_VC,
    sx_template_company_id: SX_COMPANY,
    updated_at: now,
  }).eq('id', deal.id);

  const { data: project, error: pErr } = await supabase.from('projects').update({
    status: 'producing',
    current_stage_id: WF_PRODUCTION,
    sx_kanban_column_id: COL_BEFORE_VC,
    workshop_type_id: WTYPE,
    production_person_id: SX_PERSON,
    estimated_value: dealValue,
    install_address: '88 Đường Test VC/LD, Quận 12, TP.HCM',
    // Chưa bàn giao VC
    logistics_company_id: null,
    vc_kanban_column_id: null,
    vc_handover_status: null,
    updated_at: now,
  }).eq('id', sx.project_id).select('id, code, name, status, sx_kanban_column_id, company_id').single();
  if (pErr) throw pErr;

  const { data: beforeCol } = await supabase
    .from('production_pipeline_stages')
    .select('id, name, is_handover_to_logistics')
    .eq('id', COL_BEFORE_VC)
    .maybeSingle();
  const { data: triggerCol } = await supabase
    .from('production_pipeline_stages')
    .select('id, name, is_handover_to_logistics')
    .eq('id', COL_VC_TRIGGER)
    .maybeSingle();

  console.log('\n========== DEAL TEST VC/LD HANDOVER ==========');
  console.log(JSON.stringify({
    deal: {
      id: deal.id,
      code: dealCode,
      title: dealTitle,
      crm_company: 'Phúc Đạt',
      crm_stage: 'Sản xuất.',
    },
    project: {
      id: project.id,
      code: project.code,
      name: project.name,
      status: project.status,
      sx_company: 'Hucabi',
      current_sx_column: beforeCol?.name,
      trigger_column: triggerCol?.name,
      trigger_flag: triggerCol?.is_handover_to_logistics === true,
    },
    sale: 'Trương Minh Đức',
    links: {
      crm: `/crm/leads/${deal.id}`,
      sx: `/sx/projects/${project.id}`,
      vc: '/vc',
    },
    how_to_test: [
      '1. SX Hucabi: mở Kanban, tìm thẻ «' + dealTitle + '» đang ở «' + (beforeCol?.name || 'KT KCS…') + '»',
      '2. Kéo thẻ sang «' + (triggerCol?.name || 'ĐƠN HÀNG ĐÃ CHUẨN BỊ XONG') + '» (cột trigger VC/LD)',
      '3. Xưởng yêu cầu bàn giao → comment VC handover trên deal CRM',
      '4. Sale chọn công ty VC/LĐ + ngày lấy hàng → Chọn & bàn giao',
      '5. Kỳ vọng: CRM → «Vận chuyển/lắp đặt.»; project status=shipping; hiện ở module VC Phúc Đạt (cột Nhận hàng)',
    ],
  }, null, 2));
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
