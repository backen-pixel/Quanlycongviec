/**
 * MCP — lưới chặn lọc hàng theo phạm vi công ty của API key.
 * Chạy offline, không cần DB: `node tests/mcp-loc-cong-ty.js`
 */
require('dotenv').config();
const { locHangTheoCongTyChoPhep: loc } = require('../src/helpers/mcpGateway');

const VPT = '991dc79d-cbf5-49f9-a364-35227cb47635';
const PD = '29677f68-967e-4256-92fd-492bb580e888';
const HCB = '18c2563f-3495-498d-8199-23200c9f420e';
const CHO_PHEP = [VPT, PD];

let dat = 0; let truot = 0;
function kiem(ten, thuc, mong) {
  const ok = JSON.stringify(thuc) === JSON.stringify(mong);
  console.log(`${ok ? '✅' : '❌'} ${ten}`);
  if (!ok) { console.log('   nhận :', JSON.stringify(thuc)); console.log('   đợi  :', JSON.stringify(mong)); truot += 1; } else dat += 1;
}

// 1. Đúng lỗi đã đo: list_crm_pipelines trả về pipeline của mọi công ty
kiem('bỏ pipeline ngoài phạm vi, giữ pipeline dùng chung (company_id = null)',
  loc({ status: 200, data: [
    { id: 'p1', company_id: VPT }, { id: 'p2', company_id: HCB },
    { id: 'p3', company_id: null }, { id: 'p4', company_id: PD },
  ] }, CHO_PHEP, 'list_crm_pipelines'),
  { status: 200, data: [{ id: 'p1', company_id: VPT }, { id: 'p3', company_id: null }, { id: 'p4', company_id: PD }] });

// 2. Dạng lồng {data:{data,total}} — total phải trừ theo số hàng đã bỏ
kiem('dạng phân trang: lọc hàng và trừ total',
  loc({ status: 200, data: { data: [{ id: 'l1', company_id: VPT }, { id: 'l2', company_id: HCB }], total: 334 } }, CHO_PHEP, 'search_crm_leads'),
  { status: 200, data: { data: [{ id: 'l1', company_id: VPT }], total: 333 } });

// 3. QUAN TRỌNG NHẤT — liên kết chéo công ty bên trong hàng phải còn nguyên.
//    Deal VPT đặt Hucabi gia công: production_projects[].company_id = HCB là hợp lệ.
const dealVpt = {
  id: 'd1', company_id: VPT, title: 'CHÚ ĐỆ - TÂN PHÚ',
  production_projects: [{ project_id: 'tb1', company_id: HCB, company_name: 'HCB' }],
  sx_pipeline_stage: { id: 's1', company: { id: HCB, name: 'Công ty Hucabi' } },
};
kiem('GIỮ nguyên xưởng Hucabi lồng trong deal của VPT (không lọc đệ quy)',
  loc({ status: 200, data: { data: [dealVpt], total: 1 } }, CHO_PHEP, 'search_crm_leads'),
  { status: 200, data: { data: [dealVpt], total: 1 } });

// 4. Key không giới hạn → không đụng gì
const nguyen = { status: 200, data: [{ id: 'p2', company_id: HCB }] };
kiem('key toàn quyền (allowed = null) → trả nguyên vẹn', loc(nguyen, null, 'x'), nguyen);

// 5. Báo cáo là một object, không phải danh sách → không đụng
const bc = { company_id: VPT, summary: { deal_count: 3 }, by_employee: [{ user_id: 'u1' }] };
kiem('object báo cáo → không đụng', loc(bc, CHO_PHEP, 'get_org_overview_report'), bc);

// 6. Mảng trần
kiem('mảng trần → lọc đúng',
  loc([{ company_id: VPT }, { company_id: HCB }], CHO_PHEP, 'x'), [{ company_id: VPT }]);

// 7. Hàng không có trường company_id → giữ
kiem('hàng không có company_id → giữ',
  loc({ status: 200, data: [{ id: 'a' }, { id: 'b', company_id: HCB }] }, CHO_PHEP, 'x'),
  { status: 200, data: [{ id: 'a' }] });

console.log(`\n${dat} đạt · ${truot} trượt`);
process.exit(truot ? 1 : 0);
