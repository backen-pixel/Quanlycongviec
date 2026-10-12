/**
 * MCP — phiên phải sống sót qua deploy và qua việc request rơi sang instance khác.
 * Chạy offline, không cần DB: `node tests/mcp-phien-song-sot.js`
 *
 * Giả lập bằng cách xoá sạch bảng phiên trong bộ nhớ giữa hai lượt gọi — đúng thứ xảy ra khi
 * tiến trình khởi động lại, hoặc khi instance B nhận request của phiên mở ở instance A.
 */
require('dotenv').config();
const { handleMcpPost, getSessionState, _xoaPhienDeTest } = require('../src/helpers/mcpServer');

let dat = 0; let truot = 0;
function kiem(ten, ok, chiTiet) {
  console.log(`${ok ? '✅' : '❌'} ${ten}`);
  if (!ok) { if (chiTiet !== undefined) console.log('   ', chiTiet); truot += 1; } else dat += 1;
}

function reqGia(headers = {}, apiKeyId = 'key-1') {
  const h = {};
  for (const [k, v] of Object.entries(headers)) h[k.toLowerCase()] = v;
  return {
    headers: h,
    apiKey: apiKeyId ? { id: apiKeyId } : null,
    get(name) { return this.headers[String(name).toLowerCase()]; },
    header(name) { return this.get(name); },
  };
}

(async () => {
  // 1. initialize bình thường
  const init = await handleMcpPost(
    reqGia({ 'Mcp-Protocol-Version': '2025-06-18' }),
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'kt', version: '1' } },
    },
  );
  const sid = init.sessionId;
  kiem('initialize tạo được phiên', init.httpStatus === 200 && !!sid, init.body?.error);
  kiem('phiên có trong bảng ngay sau initialize', !!getSessionState(sid));

  // 2. Giả lập deploy / rơi sang instance khác: bảng phiên trống trơn
  _xoaPhienDeTest();

  const sauKhiMat = getSessionState(sid);
  kiem('đã giả lập được việc mất phiên', !sauKhiMat, 'vẫn còn phiên — không giả lập được');

  // 3. Gọi tiếp với CÙNG session id — trước đây trả -32002, nay phải chạy tiếp
  const tiep = await handleMcpPost(
    reqGia({ 'Mcp-Protocol-Version': '2025-06-18', 'Mcp-Session-Id': sid }),
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
  );
  kiem('gọi tiếp sau khi mất phiên KHÔNG còn lỗi -32002',
    tiep.body?.error?.code !== -32002,
    tiep.body?.error);
  kiem('gọi tiếp trả về HTTP 200', tiep.httpStatus === 200, tiep.httpStatus);
  kiem('tools/list vẫn ra danh sách tool',
    Array.isArray(tiep.body?.result?.tools) && tiep.body.result.tools.length > 0,
    tiep.body?.result ? Object.keys(tiep.body.result) : tiep.body);
  kiem('phiên được dựng lại và đánh dấu adopted', getSessionState(sid)?.adopted === true);

  // 4. Không có khoá API thì KHÔNG được nhận nuôi
  _xoaPhienDeTest();
  const khongKhoa = await handleMcpPost(
    reqGia({ 'Mcp-Protocol-Version': '2025-06-18', 'Mcp-Session-Id': sid }, null),
    { jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} },
  );
  kiem('không có khoá API thì vẫn từ chối (không nhận nuôi bừa)',
    khongKhoa.body?.error?.code === -32002,
    khongKhoa.body?.error);

  // 5. Thiếu hẳn header session vẫn phải báo lỗi rõ ràng
  const thieuHeader = await handleMcpPost(
    reqGia({ 'Mcp-Protocol-Version': '2025-06-18' }),
    { jsonrpc: '2.0', id: 4, method: 'tools/list', params: {} },
  );
  kiem('thiếu hẳn Mcp-Session-Id vẫn báo lỗi', !!thieuHeader.body?.error);

  console.log(`\n${dat} đạt · ${truot} trượt`);
  process.exit(truot ? 1 : 0);
})().catch((e) => { console.error('LỖI:', e.message); process.exit(1); });
