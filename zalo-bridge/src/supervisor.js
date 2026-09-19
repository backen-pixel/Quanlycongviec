/**
 * Bộ điều phối — tiến trình chính của cổng Zalo tại máy công ty.
 *
 *  - Lấy danh sách tài khoản từ CRM, giữ một bản sao trên đĩa để chạy khi mất mạng
 *  - Chia tài khoản thành cụm, mỗi cụm một tiến trình con
 *  - Dựng lại tiến trình con khi nó chết
 *  - Gom trạng thái báo lên CRM, nhận lệnh quản trị từ CRM
 *  - Mở trang quản trị nội bộ
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { fork } = require('child_process');

const config = require('./config');
const store = require('./crm');
const { startAdminServer } = require('./admin/server');

const WORKER_PATH = path.join(__dirname, 'worker.js');
const RESTART_DELAY_MS = 5000;

const workers = new Map();   // index → { child, accounts, restarts }
const accountState = new Map(); // oa_id → state gần nhất từ worker
let registry = [];
let stopping = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Danh sách tài khoản ──────────────────────────────────────

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(config.registryFile, 'utf8'));
  } catch (_) {
    return [];
  }
}

function writeCache(accounts) {
  try {
    const tmp = `${config.registryFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(accounts, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, config.registryFile);
  } catch (e) {
    console.warn('[điều phối] Không lưu được bản sao danh sách:', e.message);
  }
}

/**
 * Danh sách ĐẦY ĐỦ, gồm cả tài khoản đang tắt.
 *
 * Trang quản trị vẽ từ đây, nên lọc bỏ tài khoản tắt ở bước này là tắt xong
 * thẻ biến mất — người dùng không còn chỗ nào để bật lại, y như đã xoá.
 * Việc lọc để CHẠY nằm ở `runnable()`.
 */
async function loadRegistry() {
  try {
    const accounts = await store.listAccounts();
    writeCache(accounts || []);
    return accounts || [];
  } catch (e) {
    const cached = readCache();
    console.warn(`[điều phối] Không lấy được danh sách từ CRM (${e.message}) — dùng bản sao ${cached.length} tài khoản.`);
    return cached;
  }
}

/** Chỉ tài khoản đang bật mới được cấp tiến trình. */
const runnable = (list) => (list || []).filter((a) => a.is_active);

// ── Tiến trình con ───────────────────────────────────────────

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function spawnWorker(index, accounts) {
  const child = fork(WORKER_PATH, [], {
    env: { ...process.env, ZALO_ACCOUNTS: JSON.stringify(accounts) },
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });

  const entry = workers.get(index) || { restarts: 0 };
  entry.retired = false;
  entry.child = child;
  entry.accounts = accounts;
  workers.set(index, entry);

  console.log(`[điều phối] Cụm ${index}: pid ${child.pid}, ${accounts.length} tài khoản.`);

  child.on('message', (msg) => {
    if (msg?.type === 'state') {
      for (const s of msg.accounts || []) accountState.set(s.oa_id, s);
    }
    if (msg?.type === 'command_done' && msg.command_id) {
      store.ackCommand(msg.command_id, { ok: msg.ok, result: msg.result })
        .catch((e) => console.warn('[điều phối] Báo kết quả lệnh thất bại:', e.message));
    }
  });

  child.on('exit', (code, signal) => {
    // Cụm bị dừng có chủ đích (dựng lại, đổi cấu hình) thì KHÔNG hồi sinh —
    // nếu không sẽ có hai tiến trình cùng đăng nhập một tài khoản Zalo và đá nhau.
    if (stopping || entry.retired) return;
    entry.restarts += 1;
    console.error(`[điều phối] Cụm ${index} chết (code ${code}, signal ${signal}) — dựng lại sau ${RESTART_DELAY_MS / 1000}s. Lần thứ ${entry.restarts}.`);
    for (const a of accounts) {
      accountState.set(a.oa_id, { oa_id: a.oa_id, oa_name: a.oa_name, status: 'offline', note: 'Tiến trình đang khởi động lại' });
    }
    setTimeout(() => { if (!stopping) spawnWorker(index, accounts); }, RESTART_DELAY_MS);
  });

  return child;
}

function startWorkers(accounts) {
  const groups = chunk(accounts, config.accountsPerWorker);
  groups.forEach((group, i) => spawnWorker(i, group));
  if (!groups.length) console.warn('[điều phối] Chưa có tài khoản nào — không bật tiến trình con.');
}

/** Dừng mọi cụm và CHỜ chúng chết hẳn trước khi bật cụm mới. */
async function stopWorkers() {
  const dying = [];
  for (const entry of workers.values()) {
    entry.retired = true;
    const { child } = entry;
    if (!child || child.exitCode !== null) continue;
    dying.push(new Promise((resolve) => {
      const done = setTimeout(() => { try { child.kill('SIGKILL'); } catch (_) {} resolve(); }, 8000);
      child.once('exit', () => { clearTimeout(done); resolve(); });
    }));
    try { child.kill('SIGTERM'); } catch (_) { /* ignore */ }
  }
  workers.clear();
  await Promise.all(dying);
}

function findWorkerFor(oaId) {
  for (const entry of workers.values()) {
    if (entry.accounts?.some((a) => a.oa_id === oaId)) return entry.child;
  }
  return null;
}

// ── Vòng lặp nền ─────────────────────────────────────────────

function hostInfo() {
  const mem = process.memoryUsage().rss;
  return {
    hostname: os.hostname(),
    node: process.version,
    uptime_s: Math.round(process.uptime()),
    load1: os.loadavg()[0].toFixed(2),
    free_mem_mb: Math.round(os.freemem() / 1048576),
    supervisor_rss_mb: Math.round(mem / 1048576),
    workers: workers.size,
  };
}

async function statusLoop() {
  while (!stopping) {
    const accounts = [...accountState.values()].map((s) => ({
      oa_id: s.oa_id,
      status: s.status,
      transport: s.transport,
      note: s.note,
      account_phone: s.account_phone || null,
    }));

    if (accounts.length) {
      try {
        await store.reportStatus(accounts, hostInfo());
      } catch (e) {
        console.warn('[điều phối] Báo trạng thái thất bại:', e.message);
      }
    }
    await sleep(config.statusReportMs);
  }
}

/** Nạp lại danh sách và dựng lại các cụm nếu có thay đổi. */
async function reloadRegistry({ force = false } = {}) {
  const next = await loadRegistry();
  const sig = (l) => l.map((a) => `${a.oa_id}:${a.oa_name}:${a.is_active}`).sort().join(',');
  const before = sig(registry);
  const after = sig(next);
  registry = next;

  if (force || before !== after) {
    console.log('[điều phối] Danh sách tài khoản đổi — dựng lại các cụm.');
    // Bỏ trạng thái sống của tài khoản không còn chạy (bị xoá hoặc bị tắt),
    // nếu không thẻ đã tắt vẫn hiện "đang chạy" từ lần chạy trước.
    const running = new Set(runnable(next).map((a) => a.oa_id));
    for (const id of [...accountState.keys()]) {
      if (!running.has(id)) accountState.delete(id);
    }
    await stopWorkers();
    startWorkers(runnable(registry));
    return true;
  }
  return false;
}

async function registryLoop() {
  while (!stopping) {
    await sleep(config.registrySyncMs);
    const next = await loadRegistry();
    const sig = (l) => l.map((a) => `${a.oa_id}:${a.oa_name}:${a.is_active}`).sort().join(',');
    if (sig(registry) !== sig(next)) await reloadRegistry({ force: true });
  }
}

async function commandLoop() {
  while (!stopping) {
    try {
      const commands = await store.getCommands();
      for (const cmd of commands || []) {
        if (cmd.command === 'logout' && cmd.oa_id) {
          const child = findWorkerFor(cmd.oa_id);
          if (child) child.send({ type: 'logout', oa_id: cmd.oa_id, command_id: cmd.id });
          else await store.ackCommand(cmd.id, { ok: false, result: 'Không tìm thấy tài khoản trên máy này' });
        } else if (cmd.command === 'restart' || cmd.command === 'relogin') {
          console.log(`[điều phối] Nhận lệnh ${cmd.command} — dựng lại các cụm.`);
          await store.ackCommand(cmd.id, { ok: true, result: 'Đang khởi động lại' });
          await stopWorkers();
          startWorkers(runnable(registry));
        }
      }
    } catch (e) {
      console.warn('[điều phối] Lấy lệnh thất bại:', e.message);
    }
    await sleep(config.commandPollMs);
  }
}

// ── Chạy ─────────────────────────────────────────────────────

async function main() {
  console.log(`[điều phối] CRM: ${store.describe()} | mỗi cụm ${config.accountsPerWorker} tài khoản`);

  registry = await loadRegistry();
  console.log(`[điều phối] ${registry.length} tài khoản: ${registry.map((a) => a.oa_name || a.oa_id).join(', ') || '(trống)'}`);

  startWorkers(runnable(registry));
  startAdminServer({
    state: () => ({ host: hostInfo(), accounts: [...accountState.values()], registry }),
    reload: reloadRegistry,
  });

  await Promise.all([statusLoop(), registryLoop(), commandLoop()]);
}

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`[điều phối] Nhận ${signal}, đang dừng…`);
  await stopWorkers();

  const offline = [...accountState.keys()].map((oa_id) => ({ oa_id, status: 'offline', note: `Máy dừng bởi ${signal}` }));
  if (offline.length) {
    try { await store.reportStatus(offline, hostInfo()); } catch (_) { /* ignore */ }
  }
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

main().catch((e) => {
  console.error('[điều phối] Dừng do lỗi:', e);
  process.exit(1);
});
