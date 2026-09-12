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
 *  3) TRUY VẤN BỊ TỪ CHỐI CẢ CÂU — cột/bảng/enum sai làm Postgres huỷ TOÀN BỘ câu.
 *     Chỗ gọi viết `const { data } = await supabase...` (không đọc `error`) sẽ nhận
 *     data === undefined và trả [] như không có gì. Đây là cách 29 cột sai sống
 *     nhiều tháng, và cách `role = 'logistics'` làm trống danh sách user xưởng.
 *     Bắt tại chỗ theo SQLSTATE nên hiện trên log Render trong vài phút, không
 *     phải chờ quét log Postgres 24h bằng tay.
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

/**
 * Mã lỗi làm HỎNG CẢ CÂU truy vấn (không phải lỗi từng dòng).
 * Mã Postgres 5 ký tự + mã PostgREST (PGRST…) khi lỗi chặn ngay ở tầng REST.
 */
const MA_LOI_GIET_CA_CAU = {
  '42703': 'COT-KHONG-TON-TAI',
  '42P01': 'BANG-KHONG-TON-TAI',
  '42883': 'HAM-KHONG-TON-TAI',
  '22P02': 'GIA-TRI-SAI-KIEU',
  '42P18': 'THAM-SO-KHONG-RO-KIEU',
  '42601': 'CU-PHAP-SAI',
  PGRST200: 'THIEU-QUAN-HE-EMBED',
  PGRST202: 'RPC-KHONG-TON-TAI',
  PGRST204: 'COT-KHONG-TON-TAI-KHI-GHI',
};

/** key -> { kind, table, site, count, detail, firstAt, lastAt } */
const findings = new Map();
let installed = false;

function tableFromUrl(url, builder) {
  const m = /\/rest\/v1\/([^?/]+)/.exec(url);
  const t = m ? m[1] : '?';
  // RPC: /rest/v1/rpc/<ten> — ghi kèm tên hàm để còn đi tìm được.
  if (t === 'rpc') {
    const ten = builder && builder.__guardRpcName;
    const tuUrl = /\/rest\/v1\/rpc\/([^?/]+)/.exec(url);
    return `rpc:${ten || (tuUrl && tuUrl[1]) || '?'}`;
  }
  return t;
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
  const table = tableFromUrl(url, builder);

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

  // ── 3) Truy vấn bị từ chối cả câu (cột/bảng/enum sai) ─────────────────────
  const err = res && res.error;
  const kind = err && err.code ? MA_LOI_GIET_CA_CAU[String(err.code)] : null;
  if (kind) {
    const phu = [err.details, err.hint].filter(Boolean).join(' · ');
    record(kind, table, `${err.code} · ${err.message}${phu ? ` · ${phu}` : ''}`, stackErr);
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
  let PostgrestClient;
  try {
    ({ PostgrestBuilder, PostgrestQueryBuilder, PostgrestClient } = require('@supabase/postgrest-js'));
  } catch (e) {
    console.warn('[query-guard] không nạp được @supabase/postgrest-js — bỏ qua:', e.message);
    return false;
  }

  // Ghi lại nơi dựng truy vấn. Chỉ tạo Error (rẻ) — chuỗi stack chỉ được dựng khi
  // thật sự có cảnh báo. Các hàm filter/transform của postgrest-js đều trả về `this`
  // nên thuộc tính này theo được tới builder cuối cùng.
  // Bọc cả các lệnh GHI: mã 42703 / PGRST204 hay xảy ra ở insert/update, mà nếu
  // không bắt stack ở đây thì báo cáo chỉ ghi được «khong-xac-dinh».
  for (const ten of ['select', 'insert', 'update', 'upsert', 'delete']) {
    const proto0 = PostgrestQueryBuilder && PostgrestQueryBuilder.prototype;
    if (!proto0 || typeof proto0[ten] !== 'function') continue;
    const gocc = proto0[ten];
    proto0[ten] = function guardedBuilder(...args) {
      const out = gocc.apply(this, args);
      try { if (out && !out.__guardStack) out.__guardStack = new Error(); } catch (_) { /* bỏ qua */ }
      return out;
    };
  }
  // `.rpc()` nằm trên PostgrestClient chứ không phải PostgrestQueryBuilder. Không bọc
  // thì mã PGRST202 (RPC không tồn tại) chỉ ghi được «khong-xac-dinh», vô dụng để đi tìm.
  const rpcProto = PostgrestClient && PostgrestClient.prototype;
  if (rpcProto && typeof rpcProto.rpc === 'function') {
    const rpcGoc = rpcProto.rpc;
    rpcProto.rpc = function guardedRpc(...args) {
      const out = rpcGoc.apply(this, args);
      try {
        if (out && !out.__guardStack) out.__guardStack = new Error();
        if (out && !out.__guardRpcName) out.__guardRpcName = String(args[0] || '?');
      } catch (_) { /* bỏ qua */ }
      return out;
    };
  } else {
    console.warn('[query-guard] không bọc được PostgrestClient.prototype.rpc — site của lỗi RPC sẽ là «khong-xac-dinh»');
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
  console.log(`[query-guard] đang theo dõi: cắt ${DEFAULTS.maxRows} dòng, filter ≥ ${DEFAULTS.inFilterWarn} id, URL ≥ ${DEFAULTS.urlWarn} ký tự, và ${Object.keys(MA_LOI_GIET_CA_CAU).length} mã lỗi giết cả câu (42703, 22P02, PGRST204…)`);
  return true;
}

module.exports = {
  installSupabaseQueryGuard,
  getSupabaseQueryGuardReport,
  printSupabaseQueryGuardSummary: printSummary,
};
