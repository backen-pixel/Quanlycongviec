/**
 * Transport dự phòng — điều khiển Zalo Web trong Chrome thật trên DISPLAY=:0.
 *
 * Dùng khi zca-js hỏng (Zalo đổi giao thức). Chậm và nặng hơn, nhưng giống
 * người dùng thật nên ít bị chặn.
 *
 * ⚠ Các selector dưới đây bám vào giao diện Zalo Web và SẼ đổi. Khi transport
 * này ngừng hoạt động, chạy `npm run probe:selectors` để lấy selector hiện tại
 * rồi sửa đúng khối SELECTORS này — không phải sửa rải rác trong file.
 */
const fs = require('fs');
const config = require('../config');

const ZALO_WEB_URL = 'https://chat.zalo.me/';

const SELECTORS = {
  qrCanvas: '#qrcode, canvas[class*="qr"], img[class*="qr"]',
  appShell: '#app .chat-list, [class*="conv-list"], #convesationList',
  conversationItem: '[class*="conv-item"], .conv-item',
  messageComposer: '#input_line, [contenteditable="true"][id*="input"], div[contenteditable="true"]',
  sendButton: '.btn-send, [class*="btn-send"]',
  messageRow: '[class*="chat-message"], .chat-message',
};

let chromium = null;
function loadPlaywright() {
  if (chromium) return chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch (_) {
    throw new Error('Chưa cài playwright — chạy: npm install playwright && npx playwright install chromium');
  }
  return chromium;
}

async function createPlaywrightTransport(hooks) {
  const browserType = loadPlaywright();
  fs.mkdirSync(config.chromeProfileDir, { recursive: true });

  const context = await browserType.launchPersistentContext(config.chromeProfileDir, {
    headless: false,
    channel: 'chrome',
    viewport: { width: 1280, height: 860 },
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const page = context.pages()[0] || (await context.newPage());
  await page.goto(ZALO_WEB_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const loggedIn = await page
    .waitForSelector(SELECTORS.appShell, { timeout: 20000 })
    .then(() => true)
    .catch(() => false);

  if (!loggedIn) {
    hooks.onStatus('need_qr', 'Mở Chrome trên máy công ty và quét mã QR Zalo Web');
    console.log('[playwright] Chưa đăng nhập — quét mã QR trong cửa sổ Chrome đang mở.');
    await page.waitForSelector(SELECTORS.appShell, { timeout: 0 });
  }

  hooks.onStatus('online', 'Zalo Web đã đăng nhập');
  console.log('[playwright] Zalo Web sẵn sàng.');

  // Bắt tin đến bằng cách quan sát DOM khung chat đang mở.
  await page.exposeFunction('__bridgeOnMessage', (payload) => {
    try {
      hooks.onMessage({ ...payload, transport: 'playwright' });
    } catch (e) {
      console.error('[playwright] onMessage:', e.message);
    }
  });

  await page.evaluate((sel) => {
    const seen = new Set();
    const observer = new MutationObserver(() => {
      document.querySelectorAll(sel.messageRow).forEach((row) => {
        const id = row.getAttribute('id') || row.dataset?.id;
        if (!id || seen.has(id)) return;
        seen.add(id);
        const text = (row.innerText || '').trim();
        if (!text) return;
        window.__bridgeOnMessage({
          thread_id: location.hash.replace(/^#/, '') || document.body.dataset.threadId || '',
          thread_type: 'user',
          msg_id: id,
          direction: row.className.includes('me') ? 'outbound' : 'inbound',
          content: text,
          message_type: 'text',
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }, SELECTORS);

  return {
    name: 'playwright',
    selfInfo: null,
    async send(threadId, content) {
      await page.goto(`${ZALO_WEB_URL}?u=${encodeURIComponent(threadId)}`, { waitUntil: 'domcontentloaded' });
      const composer = await page.waitForSelector(SELECTORS.messageComposer, { timeout: 15000 });
      await composer.click();
      await composer.type(String(content), { delay: 15 });
      await page.keyboard.press('Enter');
      // Zalo Web không trả msgId cho ta — CRM chấp nhận null và vẫn đánh dấu đã gửi
      return { msgId: null };
    },
    async stop() {
      try { await context.close(); } catch (_) { /* ignore */ }
    },
  };
}

module.exports = { createPlaywrightTransport, SELECTORS, ZALO_WEB_URL };
