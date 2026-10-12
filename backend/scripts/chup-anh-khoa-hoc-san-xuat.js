#!/usr/bin/env node
/**
 * Chụp ảnh minh hoạ cho khoá «Hướng dẫn sử dụng module sản xuất».
 *
 *   KB_EMAIL=... KB_PASSWORD=... node backend/scripts/chup-anh-khoa-hoc-san-xuat.js
 *   ... --headed        # mở cửa sổ thật để nhìn nó chạy
 *   ... --base=http://localhost:5173
 *
 * Ảnh lưu vào frontend/public/guides/module-san-xuat/, sau đó đẩy lên Supabase Storage
 * và nhúng vào bài bằng đường dẫn /uploads/knowledge-screenshots/<tên>.png
 * (xem frontend/src/lib/publicFileUrl.js).
 *
 * CHỈ ĐỌC: script điều hướng, mở panel/modal rồi chụp. Không bấm Lưu, Xoá hay kéo thả —
 * nó chạy trên cơ sở dữ liệu thật nên mọi thao tác ghi đều bị cấm ở đây.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const BASE = (process.argv.find((a) => a.startsWith('--base=')) || '').split('=')[1]
  || 'http://localhost:5173';
const HEADED = process.argv.includes('--headed');
const EMAIL = process.env.KB_EMAIL;
const PASSWORD = process.env.KB_PASSWORD;

const OUT_DIR = path.join(__dirname, '../../frontend/public/guides/module-san-xuat');

if (!EMAIL || !PASSWORD) {
  console.error('Thiếu KB_EMAIL / KB_PASSWORD trong biến môi trường.');
  process.exit(1);
}

/** Chờ trang lặng: hết spinner và không còn request mạng. */
async function settle(page, ms = 1200) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(ms);
}

/** Đóng popup «Có gì mới» bật lên sau khi đăng nhập — nó phủ kín màn và chặn mọi cú bấm. */
async function dismissOverlays(page) {
  for (let i = 0; i < 3; i += 1) {
    const dlg = page.locator('div[role="dialog"][aria-labelledby="release-note-login-title"]');
    if (!(await dlg.isVisible().catch(() => false))) return;
    const tat = dlg.getByRole('button', { name: /^Tắt$/ }).first();
    if (await tat.isVisible().catch(() => false)) await tat.click().catch(() => {});
    else await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(1200);
  }
}

/**
 * Giấu mọi thứ nổi ở rìa màn trước khi chụp: xin quyền định vị, chip tour, trợ lý
 * hướng dẫn, bong bóng chat, avatar. Ảnh minh hoạ phải sạch — không để thứ gì của
 * riêng phiên đăng nhập lọt vào.
 *
 * Lọc theo VỊ TRÍ chứ không theo tên class: class Tailwind đổi luôn, còn «dính rìa
 * dưới hoặc rìa phải và nhỏ hơn 3/4 bề ngang màn» thì mô tả đúng cái cần giấu.
 */
async function hideFloaters(page) {
  await page.evaluate(() => {
    document.querySelectorAll('body *').forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' || cs.display === 'none') return;
      // Panel bộ lọc / modal cũng là position:fixed sát rìa — đó lại đúng thứ cần chụp.
      // Nhận ra chúng qua vai trò ARIA rồi chừa ra, nếu không ảnh sẽ trống trơn.
      if (el.closest('[role="region"], [role="dialog"], [aria-modal="true"]')) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      if (r.width > window.innerWidth * 0.75) return;
      const nearBottom = r.bottom > window.innerHeight - 240;
      const nearRight = r.right > window.innerWidth - 120;
      if (nearBottom || nearRight) el.style.setProperty('display', 'none', 'important');
    });
  }).catch(() => {});
  await page.waitForTimeout(250);
}

/** Tìm phần tử cuộn ngang rộng nhất trên trang (chính là hàng cột Kanban). */
const BOARD_SCROLL_JS = `(() => {
  let best = null;
  document.querySelectorAll('div').forEach((el) => {
    if (el.scrollWidth - el.clientWidth < 80) return;
    const ox = getComputedStyle(el).overflowX;
    if (ox !== 'auto' && ox !== 'scroll') return;
    if (!best || el.clientWidth > best.clientWidth) best = el;
  });
  return best;
})()`;

async function scrollBoardRight(page) {
  await page.evaluate(`const el = ${BOARD_SCROLL_JS}; if (el) el.scrollLeft = el.scrollWidth;`).catch(() => {});
  await page.waitForTimeout(900);
}

async function scrollBoardLeft(page) {
  await page.evaluate(`const el = ${BOARD_SCROLL_JS}; if (el) el.scrollLeft = 0;`).catch(() => {});
  await page.waitForTimeout(600);
}

async function shot(page, name, opts = {}) {
  await dismissOverlays(page);
  await hideFloaters(page);
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, ...opts });
  const kb = Math.round(fs.statSync(file).size / 1024);
  console.log(`   📸 ${name}.png  (${kb} KB)`);
}

/** Bấm nút theo chữ hiện trên nút; trả false nếu không thấy. */
async function clickText(page, text, timeout = 4000) {
  const el = page.getByRole('button', { name: new RegExp(text, 'i') }).first();
  try {
    await el.waitFor({ state: 'visible', timeout });
    await el.click();
    return true;
  } catch {
    return false;
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`\nChup anh khoa hoc — ${BASE}`);
  console.log(`   Luu vao: ${OUT_DIR}\n`);

  const browser = await chromium.launch({ headless: !HEADED });
  const ctx = await browser.newContext({
    // 6 rổ hạn × ~310px + sidebar ~260px ≈ 2120 — lấy dư một chút cho khỏi cắt cột cuối.
    // Hạ deviceScaleFactor xuống 1.5 để file ảnh không phình quá (2340×1000 ×1.5 ≈ 3510px).
    viewport: { width: 2340, height: 1000 },
    deviceScaleFactor: 1.5,
    locale: 'vi-VN',
    permissions: [],
  });
  const page = await ctx.newPage();

  try {
    console.log('1. Dang nhap...');
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.locator('input[type="email"], input[placeholder*="@"]').first().fill(EMAIL);
    await page.locator('input[type="password"]').first().fill(PASSWORD);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL((u) => !/\/login/.test(u.toString()), { timeout: 25000 });
    await settle(page, 2500);
    await dismissOverlays(page);
    console.log('   OK — dang o', page.url());

    // ── BÀI 1 ────────────────────────────────────────────────────────────────
    console.log('\n2. Bai 1 — quan ly nhiem vu / cong viec');

    await page.goto(`${BASE}/sx/project-tasks`, { waitUntil: 'domcontentloaded' });
    await settle(page, 3500);

    if (await clickText(page, '^Hạn$')) {
      await settle(page, 2000);
      await shot(page, 'b1-01-che-do-han');
    } else {
      console.log('   !! khong thay nut che do «Han»');
    }

    // Rổ «Chưa có hạn» nằm cuối hàng, ngoài vùng nhìn của board (board tự cuộn ngang).
    // Nó mới là rổ đáng xem — ảnh trên 5 rổ đầu đều rỗng. Cuộn hết sang phải rồi chụp.
    await scrollBoardRight(page);
    await shot(page, 'b1-02-ro-chua-co-han');
    await scrollBoardLeft(page);

    // Dải KPI — cắt riêng, bỏ sidebar bên trái
    await shot(page, 'b1-03-dai-kpi', { clip: { x: 300, y: 130, width: 1660, height: 120 } });

    if (await clickText(page, '^Kanban$')) {
      await settle(page, 2000);
      await shot(page, 'b1-04-che-do-kanban');
    } else {
      console.log('   !! khong thay nut che do «Kanban»');
    }

    await page.goto(`${BASE}/sx/dashboard`, { waitUntil: 'domcontentloaded' });
    await settle(page, 4000);
    await shot(page, 'b1-05-dashboard-xuong');

    // ── BÀI 2 ────────────────────────────────────────────────────────────────
    console.log('\n3. Bai 2 — phat sinh');

    await page.goto(`${BASE}/sx/phat-sinh?pageTab=private`, { waitUntil: 'domcontentloaded' });
    await settle(page, 3500);
    await shot(page, 'b2-01-quan-ly-phat-sinh');

    const filterBtn = page.locator('button[aria-label="Bộ lọc"], button[title="Bộ lọc"]').first();
    if (await filterBtn.isVisible().catch(() => false)) {
      await filterBtn.click();
      await page.waitForTimeout(1000);
      await shot(page, 'b2-02-bo-loc-hai-cong-ty');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    } else {
      console.log('   !! khong thay nut Bo loc');
    }

    // Form tạo phát sinh — mở xem rồi ĐÓNG, tuyệt đối không bấm Lưu
    if (await clickText(page, 'Tạo phát sinh')) {
      await page.waitForTimeout(2000);
      await shot(page, 'b2-03-form-tao-phat-sinh');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(600);
    } else {
      console.log('   !! khong thay nut «Tao phat sinh»');
    }

    await page.goto(`${BASE}/management/shared-workspace-settings`, { waitUntil: 'domcontentloaded' });
    await settle(page, 3000);
    await shot(page, 'b2-04-setup-loai-phat-sinh');

    await page.goto(`${BASE}/management/shared-workspace-report`, { waitUntil: 'domcontentloaded' });
    await settle(page, 4000);
    await shot(page, 'b2-05-bao-cao-phat-sinh');

    console.log('\nXong. Buoc sau: upload len Supabase Storage roi nhung vao bai.');
  } catch (e) {
    console.error('\nLoi:', e.message);
    try { await shot(page, '_loi-man-hinh-cuoi'); } catch { /* bỏ qua */ }
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
