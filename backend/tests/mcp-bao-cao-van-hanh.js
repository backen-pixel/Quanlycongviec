/**
 * MCP — ba tool báo cáo vận hành. Chạy offline, không cần DB:
 *   node tests/mcp-bao-cao-van-hanh.js
 *   node tests/mcp-bao-cao-van-hanh.js --that   # chạy thật trên CSDL (chỉ đọc)
 *
 * Hai thứ phải chứng minh: scope chặn đúng, và nhãn kênh gom URL quảng cáo lại thay vì
 * để báo cáo nguồn vỡ thành hàng chục dòng URL dài.
 */
require('dotenv').config();
const {
  MCP_REPORT_OPS_TOOL_SET, MCP_REPORT_OPS_SCOPES, getMcpReportOpsTools, nhanKenh, ngayVN,
} = require('../src/helpers/mcpReportBridge');
const { getMcpReportTools, assertMcpScopeForTool } = require('../src/helpers/mcpGateway');

let dat = 0; let truot = 0;
function kiem(ten, ok, chiTiet) {
  console.log(`${ok ? '✅' : '❌'} ${ten}`);
  if (!ok) { if (chiTiet !== undefined) console.log('   ', chiTiet); truot += 1; } else dat += 1;
}
const nem = (fn) => { try { fn(); return null; } catch (e) { return e; } };

// ── 1. Gom nhãn kênh ────────────────────────────────────────────────────────
const urlAds = 'https://vanphuthanh.net/san-pham/tu-bep/?utm_source=google&utm_medium=cpc&gclid=abc123';
kiem('URL có gclid → gom về «Google Ads (qua URL)»',
  nhanKenh(urlAds) === 'Google Ads (qua URL)', nhanKenh(urlAds));
kiem('hai URL quảng cáo KHÁC NHAU gom về CÙNG một nhãn',
  nhanKenh(urlAds) === nhanKenh(`${urlAds}&keyword=tu%20bep&device=m`));
kiem('URL thường → «Website <tên miền>»',
  nhanKenh('https://vanphuthanh.net/tu-bep/') === 'Website vanphuthanh.net');
kiem('nguồn Facebook giữ nguyên để phân biệt từng trang',
  nhanKenh('[FB:812447355763701] Thi Công Tủ Bếp TP.HCM').startsWith('[FB:'));
kiem('không ghi nguồn → nhãn rõ ràng', nhanKenh('') === '(không ghi nguồn)' && nhanKenh(null) === '(không ghi nguồn)');
kiem('nguồn chữ thường giữ nguyên', nhanKenh('Google Ads VPT V1') === 'Google Ads VPT V1');

// ── 2. Ngày theo giờ VN ─────────────────────────────────────────────────────
kiem('23:30 UTC thuộc về NGÀY HÔM SAU theo giờ VN',
  ngayVN('2026-10-12T23:30:00Z') === '2026-10-13', ngayVN('2026-10-12T23:30:00Z'));
kiem('06:00 UTC vẫn là cùng ngày VN',
  ngayVN('2026-10-13T06:00:00Z') === '2026-10-13');
kiem('null → null', ngayVN(null) === null);

// ── 3. Scope ────────────────────────────────────────────────────────────────
const keyCrm = { mcp_scopes: ['crm_read'] };
const keySx = { mcp_scopes: ['production_read'] };
const keyRong = { mcp_scopes: ['reports'] };

kiem('báo cáo nguồn lead cần crm_read',
  nem(() => assertMcpScopeForTool('get_lead_source_report', keyCrm)) === null
  && nem(() => assertMcpScopeForTool('get_lead_source_report', keyRong))?.status === 403);
kiem('báo cáo xưởng cần production_read, crm_read KHÔNG đủ',
  nem(() => assertMcpScopeForTool('get_production_overview_report', keySx)) === null
  && nem(() => assertMcpScopeForTool('get_production_overview_report', keyCrm))?.status === 403);
kiem('lead đọng cần crm_read',
  nem(() => assertMcpScopeForTool('get_stuck_leads_report', keyCrm)) === null);

const tenCrm = getMcpReportTools(keyCrm).map((t) => t.name);
kiem('khoá crm_read thấy 2 báo cáo CRM, KHÔNG thấy báo cáo xưởng',
  tenCrm.includes('get_lead_source_report') && tenCrm.includes('get_stuck_leads_report')
  && !tenCrm.includes('get_production_overview_report'));

// ── 4. Khai báo tool ────────────────────────────────────────────────────────
const tools = getMcpReportOpsTools();
kiem('đủ 3 tool', tools.length === 3, tools.map((t) => t.name));
kiem('mọi tool đều bắt buộc company_id',
  tools.every((t) => t.inputSchema.required.includes('company_id')));
kiem('không lộ trường `scope` ra schema gửi client',
  tools.every((t) => t.scope === undefined));
kiem('mọi tool đều có scope đã khai trong bảng tra',
  [...MCP_REPORT_OPS_TOOL_SET].every((n) => !!MCP_REPORT_OPS_SCOPES[n]));

const byName = Object.fromEntries(getMcpReportTools(keyCrm).map((t) => [t.name, t]));
kiem('báo cáo khai readOnlyHint = true',
  byName.get_lead_source_report?.annotations?.readOnlyHint === true);

if (!process.argv.includes('--that')) {
  console.log(`\n${dat} đạt · ${truot} trượt  (thêm --that để chạy thật trên CSDL)`);
  process.exit(truot ? 1 : 0);
}

// ── 5. Chạy thật, chỉ đọc ───────────────────────────────────────────────────
const { callMcpReportOpsTool } = require('../src/helpers/mcpReportBridge');
const { supabase } = require('../src/config/supabase');

(async () => {
  const { data: cos } = await supabase.from('companies').select('id,name').limit(20);
  const vpt = (cos || []).find((c) => /Vạn Phú Thành/i.test(c.name)) || cos[0];
  const hcb = (cos || []).find((c) => /Hucabi/i.test(c.name)) || cos[0];

  const nguon = await callMcpReportOpsTool('get_lead_source_report',
    { company_id: vpt.id, date_from: '2026-10-01' });
  console.log(`\n${vpt.name} — nguồn lead từ 01/10: ${nguon.tong} (lead ${nguon.tong_lead}, deal ${nguon.tong_deal})`);
  nguon.theo_kenh.slice(0, 5).forEach((x) => console.log(`   ${String(x.so).padStart(4)}  ${String(x.ten).slice(0, 50)}`));
  kiem('báo cáo nguồn trả về số tổng khớp tổng theo kênh',
    nguon.theo_kenh.reduce((a, x) => a + x.so, 0) === nguon.tong);
  kiem('không còn dòng nào là URL dài',
    nguon.theo_kenh.every((x) => !/^https?:\/\//i.test(x.ten)),
    nguon.theo_kenh.filter((x) => /^https?:\/\//i.test(x.ten)).map((x) => x.ten));

  const dong = await callMcpReportOpsTool('get_stuck_leads_report', { company_id: vpt.id });
  console.log(`\n${vpt.name} — lead đọng: ${dong.dong}/${dong.tong_lead_cong_ty}`);
  dong.theo_nguoi_phu_trach.slice(0, 4).forEach((x) => console.log(`   ${String(x.so).padStart(5)}  ${x.ten}`));
  console.log(`   giao cho tài khoản đã tắt: ${dong.canh_bao_giao_cho_tai_khoan_da_tat}`);
  kiem('số đọng không vượt tổng lead công ty', dong.dong <= dong.tong_lead_cong_ty);

  const xuong = await callMcpReportOpsTool('get_production_overview_report', { company_id: hcb.id });
  console.log(`\n${hcb.name} — xưởng: ${xuong.tong_du_an} dự án, quá hạn ${xuong.qua_han}, sắp tới hạn ${xuong.sap_toi_han_3_ngay}`);
  xuong.theo_cot.slice(0, 5).forEach((x) => console.log(`   ${String(x.so).padStart(4)}  ${x.ten}`));
  kiem('tổng theo cột + không có cột = tổng dự án',
    xuong.theo_cot.reduce((a, x) => a + x.so, 0) + xuong.khong_co_cot === xuong.tong_du_an);

  const thieu = await callMcpReportOpsTool('get_lead_source_report', {})
    .then(() => null).catch((e) => e);
  kiem('thiếu company_id → báo lỗi 400', thieu?.status === 400, thieu?.message);

  console.log(`\n${dat} đạt · ${truot} trượt`);
  process.exit(truot ? 1 : 0);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
