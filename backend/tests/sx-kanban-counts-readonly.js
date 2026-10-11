/**
 * SX Kanban — kiểm tra SỐ ĐẾM (badge cột, tổng bảng, KPI «Quá hạn») — CHỈ ĐỌC.
 *
 * Chỉ dùng GET. Không tạo/sửa/xoá/kéo thả gì. An toàn để chạy với backend đang nối DB thật.
 * Không đăng nhập, không nhận mật khẩu: JWT do người chạy cấp qua biến môi trường.
 *
 * Kiểm tra (đều qua API mà trang /sx gọi, cùng tham số như ProductionDashboard.jsx):
 *   1) Σ badge các cột (summary.counts) == summary.total            (tổng bảng)
 *   2) Σ thẻ thực tế của mọi cột (list phân trang theo cột) == summary.total
 *   3) Σ deadline_counts (mọi bucket) == summary.total
 *   4) KPI «Quá hạn» (deadline_counts.overdue) == total của deadline-bucket-page?bucket=overdue
 *      == số thẻ thực sự trả về khi đọc hết mọi trang của bucket đó
 *   5) Từng cột: badge == số thẻ trong cột. Lệch từng cột chỉ CẢNH BÁO (xem ghi chú dưới),
 *      trừ khi có --strict-columns.
 *
 * Ghi chú về (5): summary đếm theo cột HIỂN THỊ (ép thẻ đã bàn giao VC sang cột «Bàn giao VC»,
 * thẻ chưa có cột `__none__` gom về cột đầu) còn list lọc theo cột THÔ trong DB. Bước remap đó
 * nằm ở frontend (resolveSxDisplayColumnId) nên test API không tái hiện được; vì vậy lệch từng
 * cột có thể hợp lệ, còn (1)(2) — bảo toàn tổng — luôn phải đúng.
 *
 * Usage:
 *   SX_TEST_TOKEN=<jwt> node tests/sx-kanban-counts-readonly.js
 *   CRM_TEST_TOKEN=<jwt> npm run test:sx-counts
 *   node tests/sx-kanban-counts-readonly.js --token <jwt> [--company <uuid>] [--strict-columns]
 *
 * Biến môi trường: SX_TEST_TOKEN | CRM_TEST_TOKEN, SX_TEST_BASE (mặc định http://localhost:4000),
 *                  SX_TEST_COMPANY_ID (tuỳ chọn, admin hệ thống chọn công ty).
 */
const http = require('http');
const https = require('https');

const API = process.env.SX_TEST_BASE || process.env.CRM_TEST_BASE || 'http://localhost:4000';
const LIST_LIMIT = 500; // trần của GET /production/projects
const BUCKET_LIMIT = 50; // trần của deadline-bucket-page

function parseArgs() {
  const a = process.argv.slice(2);
  const out = { strictColumns: false };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--token') out.token = a[++i];
    else if (a[i] === '--company') out.company = a[++i];
    else if (a[i] === '--strict-columns') out.strictColumns = true;
  }
  return out;
}

/** Chỉ GET — cố ý không có tham số method/body. */
function get(urlPath, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(API.replace(/\/$/, '') + urlPath);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'x-no-cache': '1' },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try { json = JSON.parse(raw); } catch { /* ignore */ }
          resolve({ status: res.statusCode, json, raw: raw.slice(0, 300) });
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(120000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

function qs(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

async function getOk(urlPath, token) {
  const r = await get(urlPath, token);
  if (r.status !== 200 || !r.json) {
    throw new Error(`GET ${urlPath.split('?')[0]} → HTTP ${r.status} ${r.raw}`);
  }
  return r.json;
}

const sum = (o) => Object.values(o || {}).reduce((s, v) => s + (Number(v) || 0), 0);

async function loadSnapshot(token, company) {
  const base = { view: 'kanban', company_id: company };
  const summary = await getOk(`/api/production/projects?${qs({ ...base, summary: 1 })}`, token);
  const counts = summary.counts || {};
  const deadline = summary.deadline_counts || {};

  // Đọc hết từng cột (như bấm «Tải thêm» tới khi hết) và đếm thẻ duy nhất.
  const cards = {};
  for (const colId of Object.keys(counts)) {
    const ids = new Set();
    let rows = 0;
    for (let page = 1; page <= 200; page++) {
      const j = await getOk(`/api/production/projects?${qs({
        ...base, limit: LIST_LIMIT, page, sx_kanban_column_id: colId,
      })}`, token);
      const list = j.projects || [];
      rows += list.length;
      list.forEach((p) => ids.add(String(p.id)));
      if (list.length < LIST_LIMIT) break;
    }
    cards[colId] = { unique: ids.size, rows };
  }

  // Đọc hết bảng KHÔNG lọc cột. Không cộng dồn theo cột được: summary đếm theo
  // cột HIỂN THỊ, còn list lọc theo cột THÔ trong DB. Cột nào có 0 thẻ hiển thị
  // sẽ không xuất hiện trong counts, nên vòng lặp theo cột ở trên bỏ sót đúng
  // những thẻ nằm trên cột toàn cục / cột lạ — chính ca HCB.
  const allIds = new Set();
  let allRows = 0;
  for (let page = 1; page <= 500; page++) {
    const j = await getOk(`/api/production/projects?${qs({ ...base, limit: LIST_LIMIT, page })}`, token);
    const list = j.projects || [];
    allRows += list.length;
    list.forEach((p) => allIds.add(String(p.id)));
    if (list.length < LIST_LIMIT) break;
  }

  // Đọc hết bucket «Quá hạn».
  const overdueIds = new Set();
  let overdueRows = 0;
  let overdueTotal = null;
  let offset = 0;
  for (let i = 0; i < 2000; i++) {
    const j = await getOk(`/api/production/deadline-bucket-page?${qs({
      ...base, bucket: 'overdue', offset, limit: BUCKET_LIMIT,
    })}`, token);
    overdueTotal = j.total;
    const list = j.projects || [];
    overdueRows += list.length;
    list.forEach((p) => overdueIds.add(String(p.id)));
    if (!j.hasMore || !list.length) break;
    offset = j.nextOffset;
  }
  return {
    summary, counts, deadline, cards,
    all: { unique: allIds.size, rows: allRows },
    overdue: { total: overdueTotal, rows: overdueRows, unique: overdueIds.size },
  };
}

async function main() {
  const args = parseArgs();
  const token = args.token || process.env.SX_TEST_TOKEN || process.env.CRM_TEST_TOKEN || '';
  if (!token) {
    console.log('BỎ QUA: thiếu JWT. Đặt SX_TEST_TOKEN (hoặc CRM_TEST_TOKEN) hoặc truyền --token <jwt>.');
    console.log('Test này chỉ đọc (GET), không đăng nhập hộ và không ghi dữ liệu.');
    process.exit(0);
  }
  const company = args.company || process.env.SX_TEST_COMPANY_ID || undefined;
  const summaryUrl = `/api/production/projects?${qs({ view: 'kanban', company_id: company, summary: 1 })}`;

  // Dữ liệu thật có thể đổi giữa các request → đo lại tối đa 3 lần nếu tổng bị trôi.
  let snap;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const before = await getOk(summaryUrl, token);
    snap = await loadSnapshot(token, company);
    const after = await getOk(summaryUrl, token);
    if (before.total === after.total && before.deadline_counts?.overdue === after.deadline_counts?.overdue) break;
    console.log(`(dữ liệu đổi giữa chừng, đo lại lần ${attempt + 1})`);
  }

  const { summary, counts, deadline, cards, all, overdue } = snap;
  const total = Number(summary.total) || 0;
  let failed = 0;
  const check = (name, ok, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — ${detail}`}`);
    if (!ok) failed += 1;
  };

  console.log(`Backend ${API} | total=${total} | ${Object.keys(counts).length} cột | quá hạn=${deadline.overdue}`);
  if (summary.truncated) console.log('CẢNH BÁO: summary bị cắt ở ngưỡng 20000 — số đếm có thể thiếu.');

  check('1. Σ badge cột == tổng bảng', sum(counts) === total, `Σ badge=${sum(counts)} total=${total}`);
  check('2. Số thẻ thực tế trong bảng == tổng bảng', all.unique === total,
    `thẻ=${all.unique} total=${total} (dòng=${all.rows})`);
  check('2c. Không thẻ nào lặp giữa các trang của bảng', all.unique === all.rows,
    `duy nhất=${all.unique} dòng=${all.rows}`);
  check('2b. Không thẻ nào lặp giữa các trang của một cột',
    Object.values(cards).every((c) => c.unique === c.rows),
    JSON.stringify(Object.fromEntries(Object.entries(cards).filter(([, c]) => c.unique !== c.rows))));
  check('3. Σ deadline bucket == tổng bảng', sum(deadline) === total, `Σ bucket=${sum(deadline)} total=${total}`);
  check('4a. KPI Quá hạn == total của bucket overdue', Number(deadline.overdue) === Number(overdue.total),
    `KPI=${deadline.overdue} bucket.total=${overdue.total}`);
  check('4b. KPI Quá hạn == số thẻ thực sự trong bucket overdue', Number(deadline.overdue) === overdue.unique,
    `KPI=${deadline.overdue} thẻ=${overdue.unique} (dòng=${overdue.rows})`);

  // 5) Từng cột.
  const colDiffs = Object.keys(counts)
    .map((id) => ({ id, badge: Number(counts[id]) || 0, cards: cards[id]?.unique ?? 0 }))
    .filter((c) => c.badge !== c.cards);
  if (args.strictColumns) {
    check('5. Từng cột: badge == số thẻ', colDiffs.length === 0, JSON.stringify(colDiffs));
  } else if (colDiffs.length) {
    console.log(`CẢNH BÁO  5. ${colDiffs.length} cột lệch badge/thẻ thô (có thể do remap cột hiển thị ở FE; dùng --strict-columns để coi là lỗi):`);
    colDiffs.forEach((c) => console.log(`          ${c.id}: badge=${c.badge} thẻ=${c.cards}`));
  } else {
    console.log('PASS  5. Từng cột: badge == số thẻ');
  }

  console.log(failed ? `\n${failed} kiểm tra THẤT BẠI` : '\nTất cả kiểm tra bắt buộc đều đạt');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  const refused = /ECONNREFUSED/.test(String(e.code || e.message));
  console.error(refused ? `LỖI: không kết nối được backend ${API}` : `LỖI: ${e.message}`);
  process.exit(2);
});
