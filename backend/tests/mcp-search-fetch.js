/**
 * MCP — khuôn kết quả `search` / `fetch` theo chuẩn OpenAI, và metadata tool.
 * Chạy offline: `node tests/mcp-search-fetch.js`
 */
require('dotenv').config();
const { getMcpReportTools } = require('../src/helpers/mcpGateway');
const {
  tieuDeLead, vanBanLead, urlLeadCrm, boTheoWhitelist, layHangCrm,
} = require('../src/helpers/mcpCrmReadBridge');

const VPT = '991dc79d-cbf5-49f9-a364-35227cb47635';
const HCB = '18c2563f-3495-498d-8199-23200c9f420e';

let dat = 0; let truot = 0;
function kiem(ten, ok, chiTiet) {
  console.log(`${ok ? '✅' : '❌'} ${ten}`);
  if (!ok) { if (chiTiet !== undefined) console.log('   ', chiTiet); truot += 1; } else dat += 1;
}

// Hàng lead thật, chép từ phản hồi /leads của bản đang chạy
const leadThat = {
  id: 'a4c2b06e-25c9-4c7b-8f6b-8affecfceda9',
  code: 'DEAL-2026-1870',
  title: 'CHÚ ĐỆ - TÂN PHÚ',
  type: 'deal',
  company_id: VPT,
  estimated_value: 60761600,
  deposit_amount: 20000000,
  install_address: '-118 CHUNG CƯ TÂN HƯƠNG',
  referrer_name: 'KHÁCH CŨ LÀM ĐƠN 2',
  created_at: '2026-10-09T07:24:47.683535+00:00',
  customer: { full_name: 'CHÚ ĐỆ', phone: '0796616122' },
  stage: { name: 'ĐANG SẢN XUẤT' },
  assignee: { full_name: 'Huỳnh Văn Nghĩa' },
  company: { name: 'Công ty TNHH Bếp Vạn Phú Thành', short_name: 'VPT' },
  crm_region: { name: 'TP.Hồ Chí Minh' },
  linked_project: {
    code: 'TB-2026-1053', name: 'CHÚ ĐỆ - TÂN PHÚ',
    delivery_date: '2026-10-18', production_deadline: '2026-10-16',
  },
};

// --- khuôn search ---
const ketQuaSearch = {
  results: [leadThat].map((r) => ({ id: `lead:${r.id}`, title: tieuDeLead(r), url: urlLeadCrm(r.id) })),
};
const r0 = ketQuaSearch.results[0];
kiem('search: mỗi kết quả có đủ id / title / url',
  typeof r0.id === 'string' && typeof r0.title === 'string' && typeof r0.url === 'string', r0);
kiem('search: id mang tiền tố lead: để `fetch` phân loại được', r0.id === `lead:${leadThat.id}`, r0.id);
kiem('search: url trỏ đúng trang lead trên giao diện',
  /^https?:\/\/.+\/crm\/leads\/a4c2b06e-/.test(r0.url), r0.url);
kiem('search: title nhận ra được bản ghi (mã + tên + công ty)',
  r0.title.includes('DEAL-2026-1870') && r0.title.includes('VPT'), r0.title);

// --- khuôn fetch ---
const ketQuaFetch = {
  id: `lead:${leadThat.id}`,
  title: tieuDeLead(leadThat),
  text: vanBanLead(leadThat),
  url: urlLeadCrm(leadThat.id),
  metadata: { type: leadThat.type, company_id: leadThat.company_id },
};
kiem('fetch: có đủ 4 trường bắt buộc id/title/text/url',
  ['id', 'title', 'text', 'url'].every((k) => typeof ketQuaFetch[k] === 'string' && ketQuaFetch[k]));
kiem('fetch: text là văn bản đọc được, không phải JSON thô',
  !ketQuaFetch.text.trim().startsWith('{') && ketQuaFetch.text.includes('Khách hàng: CHÚ ĐỆ'));
kiem('fetch: text có số tiền đã định dạng tiếng Việt',
  ketQuaFetch.text.includes('60.761.600 đ'), ketQuaFetch.text.split('\n').find((x) => x.includes('ước tính')));
kiem('fetch: text kèm dự án xưởng liên kết',
  ketQuaFetch.text.includes('TB-2026-1053'));

// --- chặn phạm vi công ty ---
const hang = [{ id: '1', company_id: VPT }, { id: '2', company_id: HCB }, { id: '3', company_id: null }];
kiem('search: bỏ hàng ngoài phạm vi, giữ hàng không có công ty',
  JSON.stringify(boTheoWhitelist(hang, [VPT]).map((x) => x.id)) === '["1","3"]');
kiem('search: whitelist rỗng/không có → không đụng',
  boTheoWhitelist(hang, null).length === 3);
kiem('layHangCrm: đọc được cả {data:{data}}, {data} và mảng trần',
  layHangCrm({ data: { data: [1, 2] } }).length === 2
  && layHangCrm({ data: [1] }).length === 1
  && layHangCrm([1, 2, 3]).length === 3);

// --- metadata tool ---
const tools = getMcpReportTools({ mcp_scopes: ['reports', 'crm_read', 'ads_read'] });
const byName = new Map(tools.map((t) => [t.name, t]));
kiem('tools/list: có đủ cặp search + fetch', byName.has('search') && byName.has('fetch'));
kiem('tools/list: mọi tool đều readOnlyHint = true',
  tools.every((t) => t.annotations?.readOnlyHint === true));
kiem('tools/list: mọi tool đều openWorldHint = false (CRM nội bộ)',
  tools.every((t) => t.annotations?.openWorldHint === false));
kiem('tools/list: mọi tool đều có title khác tên kỹ thuật',
  tools.every((t) => t.title && t.title !== t.name));
kiem('tools/list: search/fetch khai outputSchema đúng chuẩn',
  byName.get('search').outputSchema?.properties?.results?.type === 'array'
  && byName.get('fetch').outputSchema?.required?.includes('text'));

console.log(`\n${dat} đạt · ${truot} trượt`);
process.exit(truot ? 1 : 0);
