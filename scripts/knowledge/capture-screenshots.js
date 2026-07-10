#!/usr/bin/env node
/**
 * Chụp full-page screenshot CRM — quy ước file: {course}-{01..13}.png
 *
 * MCP Chrome: node scripts/knowledge/capture-screenshots.js --print-mcp
 * Puppeteer:  KNOWLEDGE_CAPTURE_EMAIL=... KNOWLEDGE_CAPTURE_PASSWORD=... node scripts/knowledge/capture-screenshots.js --puppeteer
 * Kiểm tra:   node scripts/knowledge/capture-screenshots.js
 */
const fs = require('fs');
const path = require('path');
const { allCaptureShots, CAPTURE_SRC_DIR, COURSES, LESSONS_PER_COURSE } = require('./screenshots/manifest');
const { scanCoverage } = require('./screenshots/attach');

const ROOT = path.join(__dirname, '../..');
const OUT = path.join(ROOT, CAPTURE_SRC_DIR);
const BASE = process.env.KNOWLEDGE_CAPTURE_BASE || 'http://localhost:5173';
const API = process.env.KNOWLEDGE_CAPTURE_API || 'http://localhost:4000/api';

const SHOTS = allCaptureShots();
const AUTH_FILE = path.join(__dirname, '.auth-session.json');

/** Khớp frontend/src/content/builtinUpdates.js — tránh popup builtin khi chụp */
const BUILTIN_RELEASE_NOTE_IDS = [
  '2026-07-leave-schedule-guide',
  '2026-07-crm-deal-chuyen-san-xuat',
  '2026-05-knowledge-deal-crm-courses',
  '2026-05-crm-assignments',
  '2026-05-crm-pipeline-orphan-unlock',
  '2026-05-messenger-presence-kpi',
  '2026-05-social-feed',
];

function ensureDir() {
  fs.mkdirSync(OUT, { recursive: true });
}

/** Ghi localStorage trước khi React mount — ẩn popup «Có gì mới» + banner định vị */
function overlayPrepScript() {
  try {
    localStorage.setItem('release_notes_read_builtin_ids', JSON.stringify(BUILTIN_RELEASE_NOTE_IDS));
    localStorage.setItem('crm_geo_permission_asked_v1', JSON.stringify({ at: Date.now() }));
  } catch { /* ignore */ }
}

async function markDbReleaseNotesRead(token) {
  if (!token) return;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  try {
    const bannerRes = await fetch(`${API}/release-notes/login-banner`, { headers });
    if (!bannerRes.ok) return;
    const { note } = await bannerRes.json();
    if (note?.id && !String(note.id).startsWith('builtin:')) {
      await fetch(`${API}/release-notes/${note.id}/mark-read`, { method: 'PUT', headers });
    }
  } catch { /* ignore */ }
}

async function runPrepareAction(page, prepare) {
  if (!prepare) return;
  if (prepare === 'messengerLauncher') {
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => {
        const t = b.getAttribute('title') || '';
        return /tìm nhân viên|nhóm chat/i.test(t);
      });
      btn?.click();
    });
    await new Promise((r) => setTimeout(r, 1200));
  }
}

async function dismissVisibleOverlays(page) {
  await page.evaluate(() => {
    const clickByText = (re) => {
      const btn = [...document.querySelectorAll('button')].find((b) => re.test(b.textContent || ''));
      btn?.click();
    };
    clickByText(/đã đọc,\s*không hiển thị lại/i);
    clickByText(/^để sau$/i);
    const dialog = document.querySelector('[role="dialog"][aria-labelledby="release-note-login-title"]');
    if (dialog) {
      const close = dialog.querySelector('button[aria-label="Đóng"]');
      close?.click();
    }
  });
  await new Promise((r) => setTimeout(r, 400));
}

async function injectAuth(page, auth) {
  await page.evaluateOnNewDocument(({ token, user, sessionId }) => {
    if (token) localStorage.setItem('token', token);
    if (user) localStorage.setItem('user', typeof user === 'string' ? user : JSON.stringify(user));
    localStorage.setItem('session_id', sessionId || 'capture_session');
    localStorage.setItem('login_ts', String(Date.now()));
    try {
      localStorage.setItem('release_notes_read_builtin_ids', JSON.stringify([
        '2026-05-unified-work-tasks',
        '2026-05-knowledge-deal-crm-courses',
        '2026-05-crm-assignments',
        '2026-05-crm-pipeline-orphan-unlock',
        '2026-05-messenger-presence-kpi',
        '2026-05-social-feed',
      ]));
      localStorage.setItem('crm_geo_permission_asked_v1', JSON.stringify({ at: Date.now() }));
    } catch { /* ignore */ }
  }, {
    token: auth.token,
    user: auth.user,
    sessionId: auth.session_id || 'capture_session',
  });
}

async function loginViaApi(email, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, session_id: 'capture_session' }),
  });
  if (!res.ok) throw new Error(`Login failed (${res.status})`);
  const data = await res.json();
  return {
    token: data.token,
    user: data.user ? JSON.stringify(data.user) : null,
    session_id: 'capture_session',
  };
}

function loadAuthSession() {
  if (!fs.existsSync(AUTH_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function printMcpGuide() {
  console.log(`
# Chụp ảnh MCP Chrome — 39 ảnh (lead/deal/guide × 13 bài)

Quy ước file: uploads/knowledge-screenshots/{course}-{NN}.png
Ví dụ: lead-01.png, deal-13.png, guide-06.png

1. Bật dev: .\\start-dev.ps1
2. Đăng nhập CRM trong Chrome MCP
3. Với từng mục:
   navigate_page → wait_for → take_screenshot { fullPage: true, filePath: "C:/Projects/Quanlycongviec/${UPLOAD_DIR}/<file>" }
4. node scripts/knowledge/build-seeds.js → chạy 259, 262, 263 trên DB

Danh sách:
`);
  for (const s of SHOTS) {
    const url = `${BASE}${s.path.replace('__SAMPLE_LEAD_ID__', '<lead-id>').replace('__SAMPLE_DEAL_ID__', '<deal-id>')}`;
    console.log(`- ${s.file}  (${s.course} bài ${s.lesson})`);
    console.log(`  ${url}`);
    if (s.waitFor?.length) console.log(`  wait: ${s.waitFor.join(', ')}`);
    console.log('');
  }
}

async function resolveSampleIds(page) {
  let leadId = process.env.KNOWLEDGE_SAMPLE_LEAD_ID;
  let dealId = process.env.KNOWLEDGE_SAMPLE_DEAL_ID;
  if (leadId && dealId) return { leadId, dealId };

  const token = await page.evaluate(() => localStorage.getItem('token'));
  if (!token) return { leadId: leadId || 'sample', dealId: dealId || 'sample' };

  const headers = { Authorization: `Bearer ${token}` };
  const fetchJson = async (url) => {
    const r = await fetch(url, { headers });
    return r.ok ? r.json() : null;
  };

  if (!leadId) {
    const data = await fetchJson(`${API}/crm/leads?limit=1&pipeline_type=lead`);
    leadId = data?.data?.[0]?.id || data?.items?.[0]?.id || data?.[0]?.id || 'sample';
  }
  if (!dealId) {
    const data = await fetchJson(`${API}/crm/leads?limit=1&pipeline_type=deal&type=deal`);
    const row = data?.data?.find?.((x) => x.type === 'deal' || x.stage?.pipeline_type === 'deal')
      || data?.data?.[0]
      || data?.items?.[0]
      || data?.[0];
    dealId = row?.id || 'sample';
  }
  return { leadId, dealId };
}

async function captureWithPuppeteer() {
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch {
    console.error('Cần: npm install puppeteer --save-dev');
    process.exit(1);
  }

  const email = process.env.KNOWLEDGE_CAPTURE_EMAIL;
  const password = process.env.KNOWLEDGE_CAPTURE_PASSWORD;
  const savedAuth = loadAuthSession();
  if (!savedAuth?.token && (!email || !password)) {
    console.error('Thiếu KNOWLEDGE_CAPTURE_EMAIL / KNOWLEDGE_CAPTURE_PASSWORD hoặc .auth-session.json');
    process.exit(1);
  }

  ensureDir();
  let auth = savedAuth;
  if (!auth?.token) {
    auth = await loginViaApi(email, password);
  }

  await markDbReleaseNotesRead(auth.token);

  const browser = await puppeteer.launch({ headless: 'new', defaultViewport: { width: 1440, height: 900 } });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(overlayPrepScript);
  await injectAuth(page, auth);

  await page.goto(`${BASE}/crm/dashboard`, { waitUntil: 'networkidle2', timeout: 90000 });
  await dismissVisibleOverlays(page);

  const { leadId, dealId } = await resolveSampleIds(page);
  console.log(`Sample IDs: lead=${leadId}, deal=${dealId}`);

  const courseFilter = process.argv.find((a) => a.startsWith('--course='))?.split('=')[1];

  for (const shot of SHOTS) {
    if (courseFilter && shot.course !== courseFilter) continue;
    const outPath = path.join(OUT, shot.file);
    if (fs.existsSync(outPath) && !process.argv.includes('--force')) {
      console.log('Skip:', shot.file);
      continue;
    }

    const p = shot.path
      .replace('__SAMPLE_LEAD_ID__', leadId)
      .replace('__SAMPLE_DEAL_ID__', dealId);

    if (shot.path === '/login') {
      await page.evaluate(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      });
    } else {
      await page.evaluate(({ token, user }) => {
        localStorage.setItem('token', token);
        if (user) localStorage.setItem('user', user);
        localStorage.setItem('session_id', 'capture_session');
        localStorage.setItem('login_ts', String(Date.now()));
      }, { token: auth.token, user: auth.user });
    }

    await page.goto(`${BASE}${p}`, { waitUntil: 'networkidle2', timeout: 90000 });
    await dismissVisibleOverlays(page);

    if (shot.tabSwitch === 'deal') {
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')].find((b) => /deal/i.test(b.textContent || ''));
        btn?.click();
      });
      await new Promise((r) => setTimeout(r, 1500));
      await dismissVisibleOverlays(page);
    }

    if (shot.waitFor?.length) {
      await page.waitForFunction(
        (texts) => texts.some((t) => document.body?.innerText?.includes(t)),
        { timeout: 30000 },
        shot.waitFor,
      ).catch(() => {});
    }

    await runPrepareAction(page, shot.prepare);

    await dismissVisibleOverlays(page);
    await page.screenshot({ path: outPath, fullPage: shot.fullPage !== false });
    console.log('Saved:', shot.file);
  }

  await browser.close();
  console.log('\nChạy: node scripts/knowledge/build-seeds.js');
}

function printStatus() {
  const { have, missing, total } = scanCoverage();
  console.log(`Ảnh bài học: ${have.length}/${total} (${CAPTURE_SRC_DIR}/ → sync deploy)`);
  if (missing.length) {
    console.log('\nCòn thiếu:');
    missing.forEach((k) => console.log(`  - ${k}.png`));
  } else {
    console.log(`Đủ ${total} ảnh (${COURSES.length} khoá × ${LESSONS_PER_COURSE} bài).`);
  }
  console.log('\nSinh seed: node scripts/knowledge/build-seeds.js');
}

async function main() {
  if (process.argv.includes('--print-mcp')) {
    printMcpGuide();
    return;
  }
  if (process.argv.includes('--puppeteer')) {
    await captureWithPuppeteer();
    printStatus();
    return;
  }
  ensureDir();
  printStatus();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
