/**
 * Chụp ảnh minh họa (crop đúng khối) — multi SX deal guide.
 * node docs/huong-dan-multi-sx-deal/capture-imgs.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const outDir = path.join(__dirname, 'imgs');
fs.mkdirSync(outDir, { recursive: true });

const require = createRequire(import.meta.url);
const puppeteer = require(path.join(root, 'backend/node_modules/puppeteer'));
const auth = JSON.parse(fs.readFileSync(path.join(root, 'backend/uploads/_auth_capture.json'), 'utf8'));
const BASE = process.env.GUIDE_BASE_URL || 'http://localhost:5173';
const DEAL_MULTI = 'a7977a09-96f8-44a2-a237-b9341c8c86d9';
const DEAL_WON = '900b51cf-aa41-469c-a65a-fd3c012d502a';

async function dismissNoise(page) {
  // Chặn popup «Có gì mới» + tour trước khi chụp (không để modal release note đè lên ảnh).
  await page.evaluate(() => {
    try {
      localStorage.setItem('release_notes_login_popup_off', '1');
    } catch { /* ignore */ }
    document.querySelectorAll('[data-product-tour-overlay]').forEach((el) => el.remove());
    document.getElementById('guide-shot-root')?.remove();
    // Đóng «Có gì mới» (ReleaseNoteLoginModal)
    const releaseDlg = [...document.querySelectorAll('[role="dialog"]')].find((d) =>
      (d.innerText || '').includes('Có gì mới'),
    );
    if (releaseDlg) {
      const tat =
        [...releaseDlg.querySelectorAll('button')].find((b) =>
          /^(Tắt|Đang lưu)/.test((b.textContent || '').trim()) || b.getAttribute('aria-label') === 'Tắt',
        ) || null;
      try { tat?.click(); } catch { /* ignore */ }
      releaseDlg.remove();
    }
    [...document.querySelectorAll('button')].forEach((b) => {
      const t = `${b.textContent || ''} ${b.getAttribute('aria-label') || ''}`;
      if (/Thu gọn|Để sau|Bỏ qua tour|Đóng hướng dẫn|Skip|^Tắt$/i.test(t.trim())) {
        try { b.click(); } catch { /* ignore */ }
      }
    });
  });
  await new Promise((r) => setTimeout(r, 400));
  // Lần 2: nếu dialog còn, gỡ hẳn
  await page.evaluate(() => {
    [...document.querySelectorAll('[role="dialog"]')].forEach((d) => {
      if ((d.innerText || '').includes('Có gì mới')) d.remove();
    });
  });
}

async function shotEl(page, handle, file) {
  const el = handle?.asElement?.() || handle;
  if (!el) throw new Error(`missing element for ${file}`);
  await el.evaluate((node) => node.scrollIntoView({ block: 'center' }));
  await new Promise((r) => setTimeout(r, 200));
  const dest = path.join(outDir, file);
  await el.screenshot({ path: dest, type: 'png' });
  console.log('✓', file, fs.statSync(dest).size);
}

async function findByEval(page, fn, ...args) {
  const h = await page.evaluateHandle(fn, ...args);
  return h;
}

async function findModalPanel(page, titleIncludes) {
  return findByEval(page, (title) => {
    const h = [...document.querySelectorAll('h3,h2')].find((x) => (x.textContent || '').includes(title));
    if (!h) return null;
    const candidates = [];
    let n = h.parentElement;
    while (n && n !== document.body) {
      const r = n.getBoundingClientRect();
      const cls = (n.className || '').toString();
      if (
        r.width >= 320 && r.width <= 900 && r.height >= 200 && r.height <= 860
        && (cls.includes('bg-white') || cls.includes('rounded'))
      ) {
        candidates.push(n);
      }
      n = n.parentElement;
    }
    if (candidates.length) {
      candidates.sort((a, b) => {
        const aw = a.getBoundingClientRect().width;
        const bw = b.getBoundingClientRect().width;
        return Math.abs(aw - 560) - Math.abs(bw - 560);
      });
      return candidates[0];
    }
    return h.closest('[role="dialog"]') || h.closest('.bg-white');
  }, titleIncludes);
}

const fillWorkshopFn = async (title, rows) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const h = [...document.querySelectorAll('h3')].find((x) => (x.textContent || '').includes(title));
  let modal = null;
  let n = h?.parentElement;
  while (n && n !== document.body) {
    const cls = (n.className || '').toString();
    if (cls.includes('bg-white') && cls.includes('rounded')) { modal = n; break; }
    n = n.parentElement;
  }
  modal = modal || h?.closest('.bg-white');
  if (!modal) return { ok: false };

  const workshopBlocks = [...modal.querySelectorAll('div.rounded-xl.border')].filter((d) =>
    /Xưởng\s+\d+/.test((d.innerText || '').split('\n')[0] || ''),
  );

  const results = [];
  for (let i = 0; i < rows.length; i++) {
    const block = workshopBlocks[i];
    if (!block) { results.push({ i, err: 'no-block' }); continue; }
    const prefer = rows[i].company;
    // Mở dropdown công ty (nút aria-haspopup=listbox)
    const trigger = block.querySelector('button[aria-haspopup="listbox"]');
    if (!trigger) { results.push({ i, err: 'no-trigger' }); continue; }
    trigger.click();
    await sleep(250);
    const opts = [...document.querySelectorAll('[role="option"], button')].filter((b) => {
      const t = (b.textContent || '').trim();
      return t.includes(prefer) && b !== trigger && !b.closest('[data-tour]');
    });
    // Ưu tiên option trong listbox gần trigger
    const listbox = trigger.parentElement?.querySelector('[role="listbox"]')
      || [...document.querySelectorAll('[role="listbox"]')].pop();
    const fromList = listbox
      ? [...listbox.querySelectorAll('button, [role="option"]')].find((b) => (b.textContent || '').includes(prefer))
      : null;
    const opt = fromList || opts[0];
    if (!opt) { results.push({ i, err: 'no-opt', prefer }); trigger.click(); continue; }
    opt.click();
    await sleep(700);
    // Chọn phân loại nếu có
    const typeSel = block.querySelector('select');
    if (typeSel && !typeSel.disabled && rows[i].type) {
      const idx = [...typeSel.options].findIndex((o) => (o.textContent || '').includes(rows[i].type));
      if (idx >= 0) {
        typeSel.value = typeSel.options[idx].value;
        typeSel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    results.push({
      i,
      company: (trigger.textContent || '').trim().slice(0, 40),
      type: typeSel ? (typeSel.options[typeSel.selectedIndex]?.textContent || '').trim() : null,
    });
  }
  return { ok: true, results };
};

const browser = await puppeteer.launch({
  headless: true,
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();

await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.evaluate((authPayload) => {
  localStorage.setItem('token', String(authPayload.token || '').replace(/^Bearer\s+/i, ''));
  localStorage.setItem('user', JSON.stringify(authPayload.user || {}));
  if (authPayload.session_id) localStorage.setItem('session_id', authPayload.session_id);
  localStorage.setItem('login_ts', String(Date.now()));
  // Tắt popup «Có gì mới» khi login — tránh chụp nhầm nội dung release notes
  localStorage.setItem('release_notes_login_popup_off', '1');
}, auth);

// ========== MULTI DEAL ==========
await page.goto(`${BASE}/crm/leads/${DEAL_MULTI}`, { waitUntil: 'networkidle2', timeout: 120000 });
await page.waitForFunction(() => [...document.querySelectorAll('h4')].some((h) => h.textContent?.includes('Dự án sản xuất')), { timeout: 60000 });
await new Promise((r) => setTimeout(r, 1000));
await dismissNoise(page);

// 01 — banner + card Dự án sản xuất
{
  const el = await findByEval(page, () => {
    const card = [...document.querySelectorAll('div.rounded-xl')].find((n) => {
      const t = n.innerText || '';
      return t.includes('Dự án sản xuất') && t.includes('Thêm dự án SX') && t.includes('TB-');
    });
    if (!card) return null;
    const banner = card.previousElementSibling;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'background:#fff;padding:8px;display:inline-block;min-width:640px;';
    if (banner && (banner.innerText || '').includes('dự án SX')) wrap.appendChild(banner.cloneNode(true));
    wrap.appendChild(card.cloneNode(true));
    // mount off-screen clean for screenshot of only this tree
    const host = document.createElement('div');
    host.id = 'guide-shot-root';
    host.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483000;background:#fff;';
    host.appendChild(wrap);
    document.getElementById('guide-shot-root')?.remove();
    document.body.appendChild(host);
    return host;
  });
  await shotEl(page, el, '01-deal-hai-xuong.png');
  await page.evaluate(() => document.getElementById('guide-shot-root')?.remove());
}

// 04 — sidebar CÔNG TY SX (smallest container)
{
  const el = await findByEval(page, () => {
    const all = [...document.querySelectorAll('div')].filter((n) => {
      const t = n.innerText || '';
      if (t.includes('Có gì mới') || t.includes('Bàn giao SX')) return false;
      return t.includes('CÔNG TY SX') && t.includes('(2 xưởng)') && t.includes('+ Thêm công ty SX') && t.includes('Hướng dẫn chọn xưởng');
    });
    all.sort((a, b) => (a.innerText.length - b.innerText.length) || (a.clientHeight - b.clientHeight));
    return all[0] || null;
  });
  await shotEl(page, el, '04-sidebar-cong-ty-sx.png');
}

// 02 — open modal
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').includes('Thêm dự án SX'));
  if (!b) throw new Error('no Thêm dự án SX');
  b.click();
});
await page.waitForFunction(() => [...document.querySelectorAll('h3')].some((h) => h.textContent?.includes('Thêm dự án SX')), { timeout: 15000 });
await new Promise((r) => setTimeout(r, 400));
{
  const el = await findModalPanel(page, 'Thêm dự án SX');
  await shotEl(page, el, '02-modal-them-du-an-sx.png');
}

// 03 — add second workshop row + chọn Phúc Đạt / HCB
await page.evaluate(() => {
  const h = [...document.querySelectorAll('h3')].find((x) => x.textContent?.includes('Thêm dự án SX'));
  let modal = null;
  let n = h?.parentElement;
  while (n && n !== document.body) {
    if (String(n.className || '').includes('bg-white')) { modal = n; break; }
    n = n.parentElement;
  }
  [...(modal?.querySelectorAll('button') || [])].find((b) => (b.textContent || '').includes('Thêm công ty SX'))?.click();
});
await new Promise((r) => setTimeout(r, 400));
console.log('03 fill', await page.evaluate(fillWorkshopFn, 'Thêm dự án SX', [
  { company: 'Phúc Đạt', type: 'Cửa' },
  { company: 'HCB', type: 'Tủ bếp' },
]));
await new Promise((r) => setTimeout(r, 400));
{
  const el = await findModalPanel(page, 'Thêm dự án SX');
  await shotEl(page, el, '03-modal-hai-xuong.png');
}
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'Hủy')?.click();
});
await new Promise((r) => setTimeout(r, 400));

// 07 Thành viên — crop panel
await page.evaluate(() => {
  const tab = [...document.querySelectorAll('button,[role="tab"]')].find((b) =>
    /^\s*Thành viên/.test((b.textContent || '').trim()) || (b.textContent || '').includes('Thành viên'),
  );
  tab?.click();
});
await new Promise((r) => setTimeout(r, 1200));
{
  const el = await findByEval(page, () => {
    const candidates = [...document.querySelectorAll('div')].filter((n) => {
      const t = n.innerText || '';
      const r = n.getBoundingClientRect();
      if (t.includes('Có gì mới') || t.includes('Bàn giao SX →')) return false;
      if (!(t.includes('Thêm thành viên') || t.includes('thành viên'))) return false;
      if (!t.includes('Thành viên')) return false;
      return r.width > 420 && r.height > 180 && r.height < 1100;
    });
    candidates.sort((a, b) => a.innerText.length - b.innerText.length);
    return candidates[0] || null;
  });
  if (el.asElement()) await shotEl(page, el, '07-thanh-vien.png');
  else {
    console.warn('skip 07 — fallback panel');
    const fallback = await findByEval(page, () => {
      const t = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes('Thành viên'));
      return t?.closest('.bg-white') || document.querySelector('[data-tour="lead-members"]') || null;
    });
    if (fallback.asElement()) await shotEl(page, fallback, '07-thanh-vien.png');
    else console.warn('skip 07');
  }
}

// 08 Bình luận
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes('Bình luận'))?.click();
});
await new Promise((r) => setTimeout(r, 900));
{
  const el = await findByEval(page, () => {
    const candidates = [...document.querySelectorAll('div')].filter((n) => {
      const t = n.innerText || '';
      const r = n.getBoundingClientRect();
      if (t.includes('Có gì mới') || t.includes('Bàn giao SX →')) return false;
      return r.width > 420 && r.height > 200 && r.height < 900
        && (t.includes('Đăng') || t.includes('Nhập bình luận') || t.includes('bình luận'))
        && (t.includes('Bình luận') || n.querySelector('textarea'));
    });
    candidates.sort((a, b) => a.innerText.length - b.innerText.length);
    return candidates[0] || null;
  });
  if (el.asElement()) await shotEl(page, el, '08-binh-luan.png');
  else console.warn('skip 08');
}

// ========== WON POPUP ==========
await page.goto(`${BASE}/crm/leads/${DEAL_WON}`, { waitUntil: 'networkidle2', timeout: 120000 });
await page.waitForFunction(() => document.body.innerText.includes('DEAL-2026-1079'), { timeout: 60000 });
await new Promise((r) => setTimeout(r, 1000));
await dismissNoise(page);

await dismissNoise(page);
const opened = await page.evaluate(() => {
  const step = [...document.querySelectorAll('button')].find((x) => {
    const title = (x.getAttribute('title') || '').trim();
    const aria = (x.getAttribute('aria-label') || '').trim();
    return title === 'Đã ký hợp đồng.' || aria === 'Đã ký hợp đồng.' || title.includes('Đã ký hợp đồng');
  });
  if (!step) {
    const titles = [...document.querySelectorAll('button[title]')].map((b) => b.getAttribute('title'));
    return { ok: false, reason: 'no-step', titles };
  }
  step.click();
  return { ok: true, label: step.getAttribute('title') };
});
console.log('won open', opened);
if (!opened?.ok) console.warn('won step button missing');

try {
  await page.waitForFunction(
    () => [...document.querySelectorAll('h3')].some((h) => (h.textContent || '').includes('Chọn công ty Sản xuất')),
    { timeout: 25000 },
  );
} catch (e) {
  await page.screenshot({ path: path.join(outDir, '_debug-won.png'), fullPage: false });
  throw e;
}
await new Promise((r) => setTimeout(r, 500));

{
  const el = await findModalPanel(page, 'Chọn công ty Sản xuất');
  await shotEl(page, el, '05-popup-chon-cong-ty-thang.png');
}

await page.evaluate(() => {
  [...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes('Thêm công ty SX khác'))?.click();
});
await new Promise((r) => setTimeout(r, 400));
console.log('06 fill', await page.evaluate(fillWorkshopFn, 'Chọn công ty Sản xuất', [
  { company: 'Phúc Đạt', type: 'Cửa' },
  { company: 'HCB', type: 'Tủ bếp' },
]));
await new Promise((r) => setTimeout(r, 400));
{
  const el = await findModalPanel(page, 'Chọn công ty Sản xuất');
  await shotEl(page, el, '06-popup-thang-hai-xuong.png');
}

await page.evaluate(() => {
  [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'Hủy')?.click();
});

await browser.close();
console.log('Done', outDir);
