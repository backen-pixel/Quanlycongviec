/**
 * NHÚNG NGỮ NGHĨA cho kho kinh nghiệm — lớp mỏng quanh API embedding của OpenAI.
 *
 * ═══════════════ VÌ SAO OPENAI, TRONG KHI TRỢ LÝ CHẠY ANTHROPIC ═══════════════
 *
 * Anthropic không có API embedding. Dự án đã có sẵn `OPENAI_API_KEY` (con bot chat dùng), nên
 * đây không phải thêm một nhà cung cấp mới vào hệ thống — nhưng NÓ LÀ một bên xử lý mới nhận
 * câu hỏi của trợ lý hướng dẫn. Đáng biết khi rà soát dữ liệu ra ngoài.
 *
 * Gọi bằng `fetch` trần, không thêm SDK — đúng nếp `aiBotSender.js`, `aiConversation.js` đang
 * dùng cho OpenAI trong repo này.
 *
 * ═══════════════ BA CHỐT KHIẾN NÓ KHÔNG BAO GIỜ LÀM HỎNG MỘT LƯỢT HỎI ═══════════════
 *
 * 1. THIẾU KHÓA / TẮT → trả `null`, bên gọi bỏ qua tầng ngữ nghĩa. Trợ lý chạy y như trước.
 * 2. LỖI MẠNG → `null`, không ném. Mất một lần dò tốt hơn hỏng một câu trả lời.
 * 3. SAI SỐ CHIỀU → bỏ, không tính. Trộn hai không gian vector cho ra điểm vô nghĩa mà KHÔNG
 *    hề báo lỗi — đây là kiểu hỏng tệ nhất, nên chặn thẳng bằng kiểm số chiều.
 */

const DIMS = 1536;                    // text-embedding-3-small

/**
 * MÃ KHO — ghi kèm mỗi vector để biết nó được sinh ra bằng CÔNG THỨC nào.
 *
 * Không chỉ là tên model: đổi cách dựng chuỗi đem nhúng (chỉ câu hỏi → câu hỏi + nội dung) cũng
 * làm mọi vector cũ thành lạc lõng, dù model không đổi. Thiếu phần `|nd1` thì vector cũ vẫn
 * được coi là hợp lệ và bị đem so với vector mới — hai công thức khác nhau, điểm vô nghĩa, mà
 * không có gì báo. Tăng số này mỗi lần đổi công thức là kho tự nhúng lại ở nền.
 */
const RECIPE = 'nd1';
const MODEL = process.env.GUIDE_EMBEDDING_MODEL || 'text-embedding-3-small';
const URL = 'https://api.openai.com/v1/embeddings';
const ENABLED = process.env.GUIDE_EMBEDDING !== '0';

/**
 * Chờ tối đa bao lâu.
 *
 * 4 giây là con số đầu tiên tôi đặt, và nó SAI: lần gọi đầu tiên của tiến trình tốn ~4 giây chỉ
 * để phân giải DNS và bắt tay TLS với api.openai.com, nên nó bị huỷ ngay trước khi có kết quả —
 * trong khi lần gọi thứ hai, lúc kết nối đã ấm, chỉ mất ~0,5 giây. Đo được: cùng một request
 * chạy trực tiếp trả về 200 trong 515 ms.
 *
 * Hai cách chữa, dùng cả hai: nới trần lên 8 giây, và HÂM NÓNG kết nối lúc khởi động
 * (`warmUp()`) để lượt hỏi thật không bao giờ là lượt phải trả phí bắt tay.
 */
const TIMEOUT_MS = Number(process.env.GUIDE_EMBEDDING_TIMEOUT) || 8000;

/**
 * Bộ nhớ đệm câu hỏi → vector.
 *
 * Người dùng hỏi lại gần như y hệt là chuyện thường, và mỗi lần nhúng lại là một vòng mạng cho
 * cùng một kết quả. Giới hạn 500 mục, vứt mục cũ nhất — Map của JS giữ đúng thứ tự chèn nên
 * `keys().next()` cho ra mục vào sớm nhất mà không cần cấu trúc dữ liệu nào khác.
 */
const MAX_CACHE = 500;
const cache = new Map();

let disabledReason = null;   // lý do đã tắt hẳn trong tiến trình này

function hasKey() {
  return !!process.env.OPENAI_API_KEY;
}

/** Bật hay không — dùng cho màn hình cấu hình và cho `/debug`. */
function status() {
  if (!ENABLED) return { on: false, reason: 'GUIDE_EMBEDDING=0' };
  if (!hasKey()) return { on: false, reason: 'missing_OPENAI_API_KEY' };
  if (disabledReason) return { on: false, reason: disabledReason };
  return { on: true, model: MODEL, dims: DIMS, cache: cache.size };
}

/**
 * 2.000 ký tự, không phải 500.
 *
 * Trần cũ hợp với việc nhúng MỖI CÂU HỎI. Nay bản ghi được nhúng cả nội dung (đường đi, ngõ cụt,
 * bài học) nên chuỗi dài hơn nhiều — cắt ở 500 là cắt mất đúng phần mang thông tin. API nhận tới
 * 8.191 token, nên 2.000 ký tự vẫn rất thoải mái.
 */
function normalizeText(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 2000);
}

/**
 * Nhúng một loạt chuỗi. Trả mảng cùng độ dài, phần tử là `Float32Array` hoặc `null`.
 *
 * Gọi theo LÔ vì nhúng 40 bản ghi bằng 40 request là 40 vòng mạng cho một việc mà API nhận
 * mảng. Trần 96 chuỗi mỗi lô — dưới giới hạn của API và đủ nhỏ để một lô hỏng không mất nhiều.
 */
async function embedMany(texts) {
  if (!ENABLED || !hasKey() || disabledReason) return texts.map(() => null);

  const clean = texts.map(normalizeText);
  const out = new Array(clean.length).fill(null);

  // Lấy từ đệm trước, chỉ gọi mạng cho phần còn thiếu.
  const toFetch = [];
  clean.forEach((s, i) => {
    if (!s) return;
    const hit = cache.get(s);
    if (hit) { out[i] = hit; return; }
    toFetch.push({ i, s });
  });
  if (!toFetch.length) return out;

  for (let b = 0; b < toFetch.length; b += 96) {
    const batch = toFetch.slice(b, b + 96);
    const vectors = await callApi(batch.map((x) => x.s));
    if (!vectors) return out; // hỏng thì giữ phần đã có, không thử tiếp
    vectors.forEach((v, k) => {
      if (!v) return;
      out[batch[k].i] = v;
      cache.set(batch[k].s, v);
      if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
    });
  }
  return out;
}

async function callApi(texts) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(URL, {
      method: 'POST',
      signal: abort.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ model: MODEL, input: texts }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      // 401/403 = khoá sai hoặc không có quyền → tắt hẳn, đừng thử lại mỗi lượt.
      if (res.status === 401 || res.status === 403) {
        disabledReason = `openai_rejected_${res.status}`;
        console.warn('[guide] embedding bị từ chối — tắt tầng ngữ nghĩa:', body.slice(0, 160));
      } else {
        console.error(`[guide] embedding lỗi ${res.status}:`, body.slice(0, 160));
      }
      return null;
    }
    const js = await res.json();
    return (js?.data || []).map((d) => {
      const v = d?.embedding;
      // Sai số chiều = model khác đang trả về. Bỏ, đừng tính — xem chốt 3 ở đầu tệp.
      if (!Array.isArray(v) || v.length !== DIMS) return null;
      return Float32Array.from(v);
    });
  } catch (e) {
    if (e?.name !== 'AbortError') console.error('[guide] embedding lỗi:', e?.message || e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Nhúng một chuỗi. `null` nếu không nhúng được. */
async function embed(body) {
  const [v] = await embedMany([body]);
  return v || null;
}

/**
 * Cosine giữa hai vector đã nhúng.
 *
 * KHÔNG chuẩn hoá sẵn rồi chỉ nhân vô hướng: vector của OpenAI vốn đã chuẩn hoá đơn vị, nhưng
 * vector đọc lên từ Postgres có thể mất chút chính xác khi qua lại dạng chữ. Tính đủ mẫu số
 * tốn thêm vài chục phép nhân trên 300 bản — không đáng để đánh cược.
 */
function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Chuỗi `[0.1,0.2,…]` của pgvector → Float32Array. Sai chiều thì bỏ. */
function fromPgVector(s) {
  if (!s) return null;
  if (Array.isArray(s)) return s.length === DIMS ? Float32Array.from(s) : null;
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) && v.length === DIMS ? Float32Array.from(v) : null;
  } catch {
    return null;
  }
}

/** Float32Array → chuỗi pgvector. */
function toPgVector(v) {
  if (!v) return null;
  return `[${Array.from(v).map((x) => Number(x.toFixed(6))).join(',')}]`;
}

/**
 * Gọi một lần lúc khởi động để trả phí DNS + TLS TRƯỚC, thay vì bắt lượt hỏi đầu tiên trả.
 * Kết quả vứt đi; thứ giữ lại là kết nối đã ấm trong pool của Node.
 */
function warmUp() {
  if (!ENABLED || !hasKey()) return;
  embedMany(['warm up']).catch(() => {});
}

const STORE_ID = `${MODEL}|${RECIPE}`;

module.exports = { embed, embedMany, cosine, fromPgVector, toPgVector, status, warmUp, MODEL, STORE_ID, DIMS, ENABLED };
