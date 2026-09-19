/**
 * Mở Zalo Web và in ra các selector ứng viên, để sửa khối SELECTORS trong
 * playwright.js sau mỗi lần Zalo đổi giao diện.
 *
 *   npm run probe:selectors
 */
const config = require('../config');
const { ZALO_WEB_URL } = require('./playwright');

(async () => {
  const { chromium } = require('playwright');
  const context = await chromium.launchPersistentContext(config.chromeProfileDir, {
    headless: false,
    channel: 'chrome',
    viewport: { width: 1280, height: 860 },
  });
  const page = context.pages()[0] || (await context.newPage());
  await page.goto(ZALO_WEB_URL, { waitUntil: 'domcontentloaded' });

  console.log('Đăng nhập (quét QR nếu cần), mở một hội thoại, rồi nhấn Enter tại đây…');
  await new Promise((resolve) => process.stdin.once('data', resolve));

  const report = await page.evaluate(() => {
    const pick = (predicate) => Array.from(document.querySelectorAll('*'))
      .filter(predicate)
      .slice(0, 8)
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        cls: (el.className || '').toString().slice(0, 120),
      }));

    return {
      editable: pick((el) => el.isContentEditable),
      convItems: pick((el) => /conv|thread|chat-item/i.test(el.className || '')),
      messageRows: pick((el) => /message|msg-item|chat-message/i.test(el.className || '')),
      sendButtons: pick((el) => /send/i.test(el.className || '') && el.tagName !== 'BODY'),
    };
  });

  console.log(JSON.stringify(report, null, 2));
  await context.close();
  process.exit(0);
})();
