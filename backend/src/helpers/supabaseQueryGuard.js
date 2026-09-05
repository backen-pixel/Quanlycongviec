/**
 * Lớp cảnh báo cho hai lỗi ÂM THẦM của PostgREST — chỉ ghi log, KHÔNG đổi hành vi.
 *
 * Vì sao cần: cả hai lỗi dưới đây đều không ném exception, không trả mã lỗi, và trang
 * vẫn hiển thị bình thường với số liệu thiếu. Đó là lý do chúng sống rất lâu trong
 * code mà không ai biết (đã tìm thấy ở /sx/dashboard: một công ty có 1.141 crm_tasks
 * nhưng chỉ nhận về 1.000 → mất 3 dự án trên bảng).
 *
 *  1) CẮT Ở 1000 DÒNG — truy vấn không .range() bị PostgREST cắt im lặng ở max-rows
 *     (đặt .limit(5000) cũng không vượt được). Dấu hiệu: trả về ĐÚNG 1000 dòng.
 *
 *  2) FILTER QUÁ DÀI — mảng id nhét vào `.in(...)` hoặc chuỗi `or(id.eq...)` đi trong
 *     URL. Đo trên DB thật: `in()` gãy trên 643 id, chuỗi OR gãy trên 556 id
 *     (URL ~22–24KB); vượt nữa thì đứt kết nối.
 *
 * Cách dùng: gọi installSupabaseQueryGuard() một lần lúc khởi động.
 * Tắt bằng SUPABASE_QUERY_GUARD=0.
 *
 * Chi phí: đường bình thường chỉ tốn một phép so sánh độ dài mảng. Stack trace chỉ
 * được dựng khi thật sự có cảnh báo.
 */

const DEFAULTS = {
  // PostgREST max-rows của dự án này (đo được: 1000).
  maxRows: Number(process.env.SUPABASE_GUARD_MAX_ROWS || 1000),
  // Số phần tử trong một `.in(...)` bắt đầu đáng lo (ngưỡng gãy đo được: 556–643).
  inFilterWarn: Number(process.env.SUPABASE_GUARD_IN_WARN || 300),
  // Độ dài URL bắt đầu đáng lo (gãy quanh 22.000).
  urlWarn: Number(process.env.SUPABASE_GUARD_URL_WARN || 12000),
  // Cứ bao nhiêu lần lặp lại thì nhắc lại một lần (tránh spam log).
  repeatEvery: Number(process.env.SUPABASE_GUARD_REPEAT || 50),
  // Chu kỳ in bảng tổng hợp (phút). 0 = tắt.
  summaryMinutes: Number(process.env.SUPABASE_GUARD_SUMMARY_MIN || 15),
};

/** key -> { kind, table, site, count, detail, firstAt, lastAt } */
const findings = new Map();
let installed = false;

function tableFromUrl(url) {
  const m = /\/rest\/v1\/([^?/]+)/.exec(url);
  return m ? m[1] : '?';
}

/**
 * Khung gọi đầu tiên của mã dự án (bỏ qua node_modules và chính file này).
 * `stackErr` là Error bắt được LÚC DỰNG truy vấn — bắt lúc trả kết quả thì stack đã
 * mất qua ranh giới async và chỉ còn khung nội bộ.
 */
function callSite(stackErr) {
  const raw = (stackErr || new Error()).stack || '';
  const lines = raw.split('\n').slice(1);
  for (const l of lines) {
    if (l.includes('supabaseQueryGuard')) continue;
    if (l.includes('node_modules')) continue;
    const inSrc = /[\\/]src[\\/](.+?):(\d+):\d+/.exec(l);
    if (inSrc) return `src/${inSrc[1].replace(/\\/g, '/')}:${inSrc[2]}`;
    const any = /([^\\/(]+\.js):(\d+):\d+/.exec(l);
    if (any) return `${any[1]}:${any[2]}`;
  }
  return 'khong-xac-dinh';
}

function record(kind, table, detail, stackErr) {
  const site = callSite(stackErr);
  const key = `${kind}|${table}|${site}`;
  const now = Date.now();
  const prev = findings.get(key);
  if (prev) {
    prev.count += 1;
    prev.lastAt = now;
    if (prev.count % DEFAULTS.repeatEvery !== 0) return;
    console.warn(`[query-guard] ${kind} · ${table} · ${site} · đã gặp ${prev.count} lần · ${detail}`);
    return;
  }
  findings.set(key, { kind, table, site, count: 1, detail, firstAt: now, lastAt: now });
  console.warn(`[query-guard] ${kind} · ${table} · ${site} · ${detail}`);
}

/**
 * Phần tử lớn nhất trong các filter dạng in.(a,b,c).
 * PostgREST mã hoá URL nên `in.(` thành `in.%28` và dấu phẩy thành `%2C` — phải giải mã
 * trước khi đếm, nếu không regex trượt hoàn toàn.
 */
function biggestInFilter(decodedUrl) {
  let max = 0;
  const re = /in\.\(([^)]*)\)/g;
  let m;
  while ((m = re.exec(decodedUrl))) {
    const n = m[1] ? m[1].split(',').length : 0;
    if (n > max) max = n;
  }
  // Chuỗi or(...) kiểu id.eq.x,id.eq.y — đếm số vế
  const orCount = (decodedUrl.match(/id\.eq\./g) || []).length;
  return Math.max(max, orCount);
}

function inspect(builder, res) {
  const stackErr = builder.__guardStack;
  const url = String(builder.url || '');
  if (!url) return;
  const table = tableFromUrl(url);

  // ── 1) Nghi bị cắt ở max-rows ──────────────────────────────────────────────
  const data = res && res.data;
  if (Array.isArray(data) && data.length === DEFAULTS.maxRows) {
    // .range(a, b) sinh ra `offset=a&limit=…` trên URL (không dùng header Range),
    // nên có `offset=` nghĩa là chỗ gọi đang tự phân trang → không cảnh báo.
    const hasOffset = /[?&]offset=\d+/.test(url);
    const limitM = /[?&]limit=(\d+)/.exec(url);
    const explicitLimit = limitM ? Number(limitM[1]) : null;
    if (!hasOffset && (explicitLimit == null || explicitLimit >= DEFAULTS.maxRows)) {
      record(
        'NGHI-BI-CAT-1000-DONG',
        table,
        `trả về đúng ${DEFAULTS.maxRows} dòng, không phân trang${explicitLimit != null ? ` (có .limit(${explicitLimit}) nhưng .limit không vượt được max-rows)` : ''} — rất có thể còn dòng bị bỏ`,
        stackErr,
      );
    }
  }

  // ── 2) Filter dài, sắp vỡ URL ─────────────────────────────────────────────
  let decoded = url;
  try { decoded = decodeURIComponent(url); } catch (_) { /* URL lạ thì dùng bản gốc */ }
  const inSize = biggestInFilter(decoded);
  if (inSize >= DEFAULTS.inFilterWarn) {
    record('FILTER-ID-QUA-DAI', table, `${inSize} id trong một filter (gãy quanh 556–643) — nên chia lô`, stackErr);
  } else if (url.length >= DEFAULTS.urlWarn) {
    record('URL-QUA-DAI', table, `URL ${url.length} ký tự (gãy quanh 22.000) — nên chia lô hoặc chuyển sang RPC`, stackErr);
  }
}

function printSummary() {
  if (!findings.size) return;
  const rows = [...findings.values()].sort((a, b) => b.count - a.count);
  console.warn(`\n[query-guard] ── Tổng hợp (${rows.length} chỗ) ─────────────────────────────`);
  for (const r of rows) {
    console.warn(`  ${String(r.count).padStart(5)}×  ${r.kind.padEnd(22)} ${r.table.padEnd(26)} ${r.site}`);
  }
  console.warn('[query-guard] ────────────────────────────────────────────────────\n');
}

function getSupabaseQueryGuardReport() {
  return [...findings.values()].sort((a, b) => b.count - a.count);
}

function installSupabaseQueryGuard() {
  if (installed) return false;
  if (String(process.env.SUPABASE_QUERY_GUARD || '1') === '0') return false;

  let PostgrestBuilder;
  let PostgrestQueryBuilder;
  try {
    ({ PostgrestBuilder, PostgrestQueryBuilder } = require('@supabase/postgrest-js'));
  } catch (e) {
    console.warn('[query-guard] không nạp được @supabase/postgrest-js — bỏ qua:', e.message);
    return false;
  }

  // Ghi lại nơi dựng truy vấn. Chỉ tạo Error (rẻ) — chuỗi stack chỉ được dựng khi
  // thật sự có cảnh báo. Các hàm filter/transform của postgrest-js đều trả về `this`
  // nên thuộc tính này theo được tới builder cuối cùng.
  if (PostgrestQueryBuilder && typeof PostgrestQueryBuilder.prototype.select === 'function') {
    const originalSelect = PostgrestQueryBuilder.prototype.select;
    PostgrestQueryBuilder.prototype.select = function guardedSelect(...args) {
      const out = originalSelect.apply(this, args);
      try { out.__guardStack = new Error(); } catch (_) { /* bỏ qua */ }
      return out;
    };
  }
  const proto = PostgrestBuilder && PostgrestBuilder.prototype;
  if (!proto || typeof proto.then !== 'function') {
    console.warn('[query-guard] không tìm thấy PostgrestBuilder.prototype.then — bỏ qua');
    return false;
  }

  const originalThen = proto.then;
  proto.then = function guardedThen(onOk, onErr) {
    return originalThen.call(this, (res) => {
      try { inspect(this, res); } catch (_) { /* không bao giờ làm hỏng truy vấn */ }
      return onOk ? onOk(res) : res;
    }, onErr);
  };

  installed = true;
  if (DEFAULTS.summaryMinutes > 0) {
    const t = setInterval(printSummary, DEFAULTS.summaryMinutes * 60_000);
    if (t.unref) t.unref();
  }
  console.log(`[query-guard] đang theo dõi: cắt ${DEFAULTS.maxRows} dòng, filter ≥ ${DEFAULTS.inFilterWarn} id, URL ≥ ${DEFAULTS.urlWarn} ký tự`);
  return true;
}

module.exports = {
  installSupabaseQueryGuard,
  getSupabaseQueryGuardReport,
  printSupabaseQueryGuardSummary: printSummary,
};
