/**
 * Tiến trình con — giữ vài phiên Zalo cùng lúc.
 *
 * Nhận danh sách tài khoản qua biến môi trường ZALO_ACCOUNTS (JSON), nói
 * chuyện với bộ điều phối qua process message. Chết thì bộ điều phối dựng lại.
 */
const { createAccountRunner } = require('./account');

const runners = new Map();

function send(msg) {
  try { process.send?.(msg); } catch (_) { /* ignore */ }
}

function reportState() {
  send({ type: 'state', accounts: [...runners.values()].map((r) => r.state()) });
}

async function main() {
  let accounts = [];
  try {
    accounts = JSON.parse(process.env.ZALO_ACCOUNTS || '[]');
  } catch (e) {
    console.error('[worker] ZALO_ACCOUNTS không đọc được:', e.message);
    process.exit(1);
  }

  console.log(`[worker ${process.pid}] Giữ ${accounts.length} tài khoản.`);

  // Khởi động so le: bật 15 phiên Zalo cùng một giây từ cùng một IP là dấu hiệu
  // bất thường rõ rệt với Zalo.
  for (const account of accounts) {
    const runner = createAccountRunner(account);
    runners.set(account.oa_id, runner);
    runner.start().catch((e) => console.error(`[worker] ${account.oa_id}:`, e.message));
    await new Promise((r) => setTimeout(r, 4000));
  }

  setInterval(reportState, 10000);
  reportState();
}

process.on('message', async (msg) => {
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'state') return reportState();

  if (msg.type === 'logout' && msg.oa_id) {
    const runner = runners.get(msg.oa_id);
    if (runner) {
      await runner.logout();
      send({ type: 'command_done', command_id: msg.command_id, ok: true, result: 'Đã đăng xuất' });
    } else {
      send({ type: 'command_done', command_id: msg.command_id, ok: false, result: 'Tài khoản không nằm ở tiến trình này' });
    }
    reportState();
  }
});

async function shutdown() {
  for (const runner of runners.values()) {
    try { await runner.stop(); } catch (_) { /* ignore */ }
  }
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

main().catch((e) => {
  console.error('[worker] Dừng do lỗi:', e);
  process.exit(1);
});
