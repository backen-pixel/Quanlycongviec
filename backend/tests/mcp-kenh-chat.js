/**
 * Kiểm bộ công cụ MCP kênh chat (Facebook + Zalo) — scope `channels_read`.
 *
 * Mặc định chỉ kiểm cổng chặn và hình dạng dữ liệu, KHÔNG gọi dữ liệu thật.
 * Thêm --that để chạy thêm phần đọc dữ liệu thật (chỉ đọc).
 *
 * Chạy: cd backend && node tests/mcp-kenh-chat.js [--that]
 */
require('dotenv').config();
const {
  MCP_CHANNEL_TOOLS, MCP_CHANNEL_TOOL_SET, getMcpChannelTools, callMcpChannelTool,
} = require('../src/helpers/mcpChannelReadBridge');
const { getMcpReportTools, assertMcpScopeForTool, isMcpToolAllowed } = require('../src/helpers/mcpGateway');

const THAT = process.argv.includes('--that');
let dat = 0; let truot = 0;

function kiem(ten, dieuKien, chiTiet = '') {
  if (dieuKien) { dat += 1; console.log(`  ✅ ${ten}`); }
  else { truot += 1; console.log(`  ❌ ${ten}${chiTiet ? ` — ${chiTiet}` : ''}`); }
}

async function nemLoi(fn) {
  try { await fn(); return null; } catch (e) { return e; }
}

(async () => {
  console.log('=== 1. KHAI BÁO TOOL ===');
  kiem('có đúng 4 tool', MCP_CHANNEL_TOOLS.length === 4, `thấy ${MCP_CHANNEL_TOOLS.length}`);
  for (const t of MCP_CHANNEL_TOOLS) {
    kiem(`"${t.name}" có mô tả và inputSchema`, !!t.description && !!t.inputSchema);
  }
  kiem('getMcpChannelTools trả bản sao', getMcpChannelTools()[0] !== MCP_CHANNEL_TOOLS[0]);
  kiem('gateway nhận diện tool hợp lệ', MCP_CHANNEL_TOOLS.every((t) => isMcpToolAllowed(t.name)));

  console.log('\n=== 2. CỔNG CHẶN SCOPE ===');
  const khoaMacDinh = { id: 'k1', mcp_scopes: null };
  const khoaCrm = { id: 'k2', mcp_scopes: ['reports', 'crm_read'] };
  const khoaKenh = { id: 'k3', mcp_scopes: ['reports', 'crm_read', 'channels_read'] };

  for (const t of MCP_CHANNEL_TOOLS) {
    const e1 = await nemLoi(() => assertMcpScopeForTool(t.name, khoaMacDinh));
    kiem(`"${t.name}" bị chặn với khoá mặc định`, !!e1);
    const e2 = await nemLoi(() => assertMcpScopeForTool(t.name, khoaCrm));
    kiem(`"${t.name}" bị chặn khi chỉ có crm_read`, !!e2);
    const e3 = await nemLoi(() => assertMcpScopeForTool(t.name, khoaKenh));
    kiem(`"${t.name}" cho qua khi có channels_read`, !e3, e3?.message);
  }

  console.log('\n=== 3. DANH SÁCH TOOL THEO SCOPE ===');
  const dsMacDinh = getMcpReportTools(khoaMacDinh).map((t) => t.name);
  const dsKenh = getMcpReportTools(khoaKenh).map((t) => t.name);
  kiem('khoá mặc định KHÔNG thấy tool kênh chat',
    MCP_CHANNEL_TOOLS.every((t) => !dsMacDinh.includes(t.name)));
  kiem('khoá có channels_read thấy đủ 4 tool',
    MCP_CHANNEL_TOOLS.every((t) => dsKenh.includes(t.name)));
  kiem('bật channels_read không làm mất tool cũ',
    dsMacDinh.every((n) => dsKenh.includes(n)));

  console.log('\n=== 4. THAM SỐ SAI ===');
  const khoaRong = { id: 'k9', mcp_scopes: ['channels_read'], allowed_company_ids: [] };
  const r1 = await callMcpChannelTool('get_chat_conversation', khoaRong, { channel: 'tiktok', contact_id: 'x' });
  kiem('channel lạ bị từ chối', !!r1.error, JSON.stringify(r1).slice(0, 80));
  const r2 = await callMcpChannelTool('get_chat_conversation', khoaRong, { channel: 'zalo' });
  kiem('thiếu contact_id bị từ chối', !!r2.error);
  const e4 = await nemLoi(() => callMcpChannelTool('tool_khong_co', khoaRong, {}));
  kiem('tool không tồn tại thì ném lỗi', !!e4);

  console.log('\n=== 5. KHÔNG RÒ TOKEN ===');
  const nhayCam = ['access_token', 'secret_key', 'refresh_token', 'webhook_verify_token', 'n8n_trigger_token'];
  const vanBan = JSON.stringify(MCP_CHANNEL_TOOLS);
  kiem('khai báo tool không nhắc tên trường token', !nhayCam.some((k) => vanBan.includes(`"${k}"`)));

  if (!THAT) {
    console.log('\n(bỏ qua phần dữ liệu thật — thêm --that để chạy)');
  } else {
    console.log('\n=== 6. DỮ LIỆU THẬT (chỉ đọc) ===');
    const { supabase } = require('../src/config/supabase');
    const { data: cty } = await supabase.from('companies').select('id').limit(20);
    const khoaThat = {
      id: 'k-that',
      mcp_scopes: ['channels_read'],
      allowed_company_ids: (cty || []).map((c) => c.id),
    };

    const kenh = await callMcpChannelTool('list_chat_channels', khoaThat, {});
    kiem('list_chat_channels trả mảng channels', Array.isArray(kenh.channels), JSON.stringify(kenh).slice(0, 120));
    console.log(`     → ${kenh.channels?.length || 0} kênh`);
    for (const c of (kenh.channels || []).slice(0, 6)) {
      console.log(`       ${c.channel.padEnd(9)} ${String(c.name || c.ref).slice(0, 28).padEnd(30)} ${c.so_lien_he} liên hệ${c.tinh_trang_token ? ` · token: ${c.tinh_trang_token}` : ''}`);
    }
    const coToken = JSON.stringify(kenh).match(/"(access_token|secret_key|refresh_token)"/);
    kiem('kết quả thật KHÔNG chứa token', !coToken, coToken?.[0]);

    const lh = await callMcpChannelTool('search_chat_contacts', khoaThat, { limit: 5 });
    kiem('search_chat_contacts trả mảng', Array.isArray(lh.contacts));
    console.log(`     → ${lh.contacts?.length || 0} liên hệ`);
    for (const c of (lh.contacts || []).slice(0, 5)) {
      console.log(`       [${c.channel}] ${String(c.ten || '?').slice(0, 22).padEnd(24)} ${c.kenh_ten || ''}`);
    }

    const ngoai = await callMcpChannelTool('search_chat_contacts', { id: 'k0', mcp_scopes: ['channels_read'], allowed_company_ids: ['00000000-0000-0000-0000-000000000000'] }, {});
    kiem('khoá ngoài phạm vi không thấy liên hệ nào', !(ngoai.contacts || []).length, `thấy ${(ngoai.contacts || []).length}`);
  }

  console.log(`\n${dat}/${dat + truot} đạt${truot ? ` · ${truot} TRƯỢT` : ''}`);
  process.exit(truot ? 1 : 0);
})().catch((e) => { console.log('NGOẠI LỆ:', e.message); process.exit(1); });
