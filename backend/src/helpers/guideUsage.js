/**
 * Đếm token + tính tiền cho từng lượt gọi model của Trợ lý hướng dẫn.
 *
 * VÌ SAO PHẢI TỰ LÀM: `BuiltInAgent` của @copilotkit/runtime KHÔNG hề phát ra usage — đã grep
 * cả `dist/agent/index.cjs`, không có một chữ `usage` nào. Giao thức AG-UI cũng không có event
 * mang token. Nên số token chỉ lấy được ở MỘT chỗ: chặn ngay tại model.
 *
 * Cách chặn: `BuiltInAgent` gọi `resolveModel(config.model)`, và hàm đó có dòng
 * `if (typeof spec !== "string") return spec;` — nghĩa là truyền THẲNG một model object vào
 * `new BuiltInAgent({ model })` thì nó dùng nguyên vẹn. Ta bọc model bằng
 * `wrapLanguageModel({ model, middleware })` của ai SDK và nghe chunk `finish` trong
 * `wrapStream` — đó là chỗ provider trả `usage` + `providerMetadata`.
 *
 * GIÁ: lấy từ bảng giá chính thức của Anthropic (USD / 1 triệu token).
 * Hệ số cache theo tài liệu prompt caching: đọc cache = 0,1× giá input;
 * ghi cache TTL 5 phút = 1,25×; TTL 1 giờ = 2×.
 *
 * Sonnet 5 đang trong GIÁ GIỚI THIỆU 2$/10$ tới hết 2026-08-31, sau đó về 3$/15$. Cài theo
 * mốc ngày để nó tự hết hạn, không phải sửa tay và không âm thầm báo sai sau ngày đó.
 */

const USD_PER_MTOK = {
  'claude-fable-5': { in: 10, out: 50 },
  'claude-mythos-5': { in: 10, out: 50 },
  'claude-opus-5': { in: 5, out: 25 },
  'claude-opus-4-8': { in: 5, out: 25 },
  'claude-opus-4-7': { in: 5, out: 25 },
  'claude-opus-4-6': { in: 5, out: 25 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-haiku-4-5': { in: 1, out: 5 },
};

const SONNET5 = 'claude-sonnet-5';
const SONNET5_INTRO_ENDS = Date.parse('2026-09-01T00:00:00Z'); // hết 2026-08-31
const SONNET5_INTRO = { in: 2, out: 10 };
const SONNET5_STANDARD = { in: 3, out: 15 };

const CACHE_READ_MULT = 0.1;
const CACHE_WRITE_5M_MULT = 1.25;
const CACHE_WRITE_1H_MULT = 2;

/**
 * Tỷ giá chỉ để hiện thêm cho dễ hình dung. Đọc TẠI THỜI ĐIỂM TÍNH, không đọc lúc nạp module —
 * màn hình cấu hình đổi được nó mà không phải dựng lại container.
 *
 * `.env` vẫn là mặc định, và chấp nhận CẢ HAI tên biến: `USD_VND_RATE` (tên mã vẫn đọc) lẫn
 * `GUIDE_USD_VND` (tên nằm sẵn trong .env của dự án). Trước đây mã chỉ đọc tên thứ nhất, nên
 * dòng `GUIDE_USD_VND=26000` trong .env không có tác dụng gì — trùng nhau ở 26000 nên không ai
 * thấy, cho tới lúc có người đổi nó và tự hỏi vì sao số tiền không nhúc nhích.
 */
const settings = require('./guideSettings');
const usdVndRate = () => settings.get('usd_vnd_rate');

const MAX_LOG_PER_THREAD = 60; // đủ soi một buổi thử; vượt thì bỏ bản ghi cũ nhất
const MAX_THREADS = 40;

/** Bảng giá áp cho model, tại một thời điểm. Model lạ → null (KHÔNG đoán giá). */
function priceFor(modelId, atMs) {
  const id = String(modelId || '').trim();
  if (id === SONNET5) return atMs < SONNET5_INTRO_ENDS ? SONNET5_INTRO : SONNET5_STANDARD;
  return USD_PER_MTOK[id] || null;
}

/**
 * Tính tiền một lượt gọi.
 * @returns {{usd:number|null, vnd:number|null, breakdown:object, note:string}}
 */
function computeCost(modelId, tok, atMs) {
  const price = priceFor(modelId, atMs);
  if (!price) {
    return {
      usd: null,
      vnd: null,
      breakdown: {},
      note: `Chưa có giá cho model "${modelId}" trong bảng — không tính tiền thay vì đoán.`,
    };
  }

  const perTok = (usdPerMtok) => usdPerMtok / 1e6;
  const breakdown = {
    input: tok.input_tokens * perTok(price.in),
    cache_read: tok.cache_read_tokens * perTok(price.in) * CACHE_READ_MULT,
    cache_write_5m: tok.cache_write_5m_tokens * perTok(price.in) * CACHE_WRITE_5M_MULT,
    cache_write_1h: tok.cache_write_1h_tokens * perTok(price.in) * CACHE_WRITE_1H_MULT,
    output: tok.output_tokens * perTok(price.out),
  };
  const usd = Object.values(breakdown).reduce((a, b) => a + b, 0);

  return {
    usd,
    vnd: usd * usdVndRate(),
    breakdown,
    note: `Giá ${price.in}$/${price.out}$ mỗi 1M token; đọc cache ${CACHE_READ_MULT}×,`
      + ` ghi cache ${CACHE_WRITE_5M_MULT}× (TTL 5 phút) / ${CACHE_WRITE_1H_MULT}× (TTL 1 giờ).`,
  };
}

/**
 * Đọc token từ usage của ai SDK.
 *
 * BẪY ĐÃ TRẢ GIÁ: ở ai SDK v6, `usage.inputTokens` KHÔNG phải một số mà là một OBJECT:
 *     inputTokens:  { total, noCache, cacheRead, cacheWrite }
 *     outputTokens: { total, text, reasoning }
 *     raw:          { …nguyên văn usage của Anthropic… }
 * Bản đầu của hàm này coi nó là số → `Number({...})` ra NaN → mọi ô token hiện 0 mà không có
 * lỗi nào. Đã đo bằng cách chạy agent thật ngoài server (875 token vào / 97 ra).
 * Vẫn giữ nhánh "dạng phẳng" của v5 để nâng/hạ phiên bản SDK không làm bảng câm.
 *
 * Ba ô input tách riêng vì GIÁ KHÁC NHAU: `noCache` giá gốc, `cacheRead` 0,1×, `cacheWrite`
 * 1,25× (TTL 5 phút) hoặc 2× (TTL 1 giờ). Cộng gộp là tính sai tiền.
 * `outputTokens.total` đã bao gồm token suy luận — Anthropic tính thinking theo giá output.
 */
function readTokens(usage, providerMetadata) {
  const anth = providerMetadata?.anthropic || {};
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

  const inp = usage?.inputTokens;
  const out = usage?.outputTokens;
  const raw = usage?.raw || anth.usage || {};
  // Anthropic báo riêng hai loại ghi cache; có số thì tính đúng hệ số cho từng loại thay vì
  // gộp hết vào 1,25× như bản đầu (bản đầu báo THẤP hơn thật khi dùng TTL 1 giờ).
  const w5 = num(raw?.cache_creation?.ephemeral_5m_input_tokens);
  const w1h = num(raw?.cache_creation?.ephemeral_1h_input_tokens);

  if (inp && typeof inp === 'object') {
    const totalWrite = num(inp.cacheWrite);
    return {
      input_tokens: num(inp.noCache),
      cache_read_tokens: num(inp.cacheRead),
      cache_write_tokens: totalWrite,
      // Không có chi tiết → coi hết là TTL 5 phút (mặc định của Anthropic).
      cache_write_5m_tokens: w5 || w1h ? w5 : totalWrite,
      cache_write_1h_tokens: w1h,
      output_tokens: num(out?.total),
      reasoning_tokens: num(out?.reasoning),
    };
  }

  const totalWriteFlat = num(anth.cacheCreationInputTokens);
  return {
    input_tokens: num(inp),
    cache_read_tokens: num(usage?.cachedInputTokens ?? anth.cacheReadInputTokens),
    cache_write_tokens: totalWriteFlat,
    cache_write_5m_tokens: w5 || w1h ? w5 : totalWriteFlat,
    cache_write_1h_tokens: w1h,
    output_tokens: num(out),
    reasoning_tokens: num(usage?.reasoningTokens),
  };
}

/* ─────────────────────────── Sổ ghi theo thread ─────────────────────────── */

/**
 * Bộ nhớ trong tiến trình, KHÔNG ghi DB: đây là số liệu để soi lúc phát triển, mất khi restart
 * là chấp nhận được. Ghi DB thì phải quyết bảng, quyền đọc, dọn dữ liệu cũ — quá nặng cho việc
 * chỉ hiển thị lên một bảng debug.
 */
const log = new Map(); // threadId -> [ban_ghi]

function appendRecord(threadId, record) {
  const key = String(threadId || 'khong-ro');
  if (!log.has(key)) {
    if (log.size >= MAX_THREADS) log.delete(log.keys().next().value); // bỏ thread cũ nhất
    log.set(key, []);
  }
  const arr = log.get(key);
  arr.push(record);
  if (arr.length > MAX_LOG_PER_THREAD) arr.shift();
}

/**
 * Liệt kê các thread đang có trong sổ. Dùng khi bảng Chi phí hiện 0 mà rõ ràng vừa gọi model —
 * để phân biệt "không ghi được" với "ghi dưới threadId khác cái client đang hỏi".
 */
function listThreads() {
  return [...log.entries()].map(([thread_id, arr]) => ({
    thread_id,
    call_count: arr.length,
    latest: arr.length ? arr[arr.length - 1].at : null,
  }));
}

/** Danh sách lượt gọi + tổng cộng của một thread. */
function readUsage(threadId) {
  const arr = log.get(String(threadId || 'khong-ro')) || [];
  const total = arr.reduce((acc, r) => ({
    input_tokens: acc.input_tokens + r.token.input_tokens,
    cache_read_tokens: acc.cache_read_tokens + r.token.cache_read_tokens,
    cache_write_tokens: acc.cache_write_tokens + r.token.cache_write_tokens,
    output_tokens: acc.output_tokens + r.token.output_tokens,
    usd: acc.usd + (r.cost.usd || 0),
  }), {
    input_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, output_tokens: 0, usd: 0,
  });

  return {
    usd_vnd_rate: usdVndRate(),
    call_count: arr.length,
    total: { ...total, vnd: total.usd * usdVndRate() },
    calls: arr,
  };
}

/**
 * Bộ thu usage cho MỘT request. Model middleware đẩy vào, AG-UI middleware đọc ra khi lượt
 * chạy kết thúc rồi mới biết được threadId/runId/lượt thứ mấy.
 *
 * Một request có thể gọi model NHIỀU lần (maxSteps — mỗi bước một lần gọi), nên đây là mảng.
 */
function createCollector() {
  const calls = [];
  return {
    add(usage, providerMetadata, modelId) {
      calls.push({ usage, providerMetadata, modelId, at: Date.now() });
    },
    /** Chốt sổ: ghi từng bước vào sổ của thread. */
    /**
     * @returns {{total_tokens: number}} Tổng token của cả lượt — hạn mức ngày cần con số này
     *   (xem guideQuota.js). Trả về thay vì bắt bên kia cộng lại từ sổ: phép cộng "vào + đọc
     *   cache + ghi cache + ra" mà nhân đôi ở hai chỗ thì sớm muộn hai chỗ tính khác nhau.
     */
    finalize({ threadId, runId, turnNo, modelId }) {
      let totalTokens = 0;
      calls.forEach((b, i) => {
        const at = b.at;
        const token = readTokens(b.usage, b.providerMetadata);
        // `reasoning_tokens` là TẬP CON của output, `cache_write_5m/1h` là chi tiết của
        // cache_write — cộng chúng vào nữa là tính trùng.
        totalTokens += (token.input_tokens || 0) + (token.cache_read_tokens || 0)
          + (token.cache_write_tokens || 0) + (token.output_tokens || 0);
        const cost = computeCost(b.modelId || modelId, token, at);
        appendRecord(threadId, {
          at: new Date(at).toISOString(),
          run_id: runId || null,
          turn_no: turnNo || null,
          step_no: i + 1,
          total_steps: calls.length,
          model: b.modelId || modelId,
          token,
          cost,
          // Giữ nguyên usage thô: nếu provider đổi tên trường thì bảng vẫn cho thấy sự thật,
          // thay vì im lặng hiện 0 token.
          raw_usage: b.usage || null,
          raw_provider_meta: b.providerMetadata?.anthropic || null,
        });
      });
      calls.length = 0;
      return { total_tokens: totalTokens };
    },
    get callCount() { return calls.length; },
  };
}

/**
 * Middleware của ai SDK: nghe chunk `finish` để lấy usage. Chỉ ĐỌC, không đổi gì trong stream —
 * phải `controller.enqueue(chunk)` cho MỌI chunk, bỏ sót một cái là câu trả lời mất chữ.
 */
function createUsageMiddleware(collector, modelId) {
  return {
    wrapStream: async ({ doStream }) => {
      const { stream, ...rest } = await doStream();
      const tapStream = new TransformStream({
        transform(chunk, controller) {
          if (chunk?.type === 'finish') {
            try {
              collector.add(chunk.usage, chunk.providerMetadata, modelId);
            } catch { /* đếm tiền không bao giờ được làm chết câu trả lời */ }
          }
          controller.enqueue(chunk);
        },
      });
      return { stream: stream.pipeThrough(tapStream), ...rest };
    },
  };
}

module.exports = {
  createCollector,
  createUsageMiddleware,
  readUsage,
  listThreads,
  get USD_VND() { return usdVndRate(); },
};
