/**
 * Bộ tra cứu kiến thức cho Trợ lý hướng dẫn (CopilotKit).
 *
 * Đọc `data/guide-knowledge/*.json` lúc boot, cache ở module level — theo đúng pattern
 * `helpers/aiBotSkillLibrary.js` sẵn có trong repo. Xem docs/guide-assistant-current.md §9
 * cho ba lần sửa thuật toán chấm điểm (đã áp dụng thẳng ở đây, không lặp lại lỗi cũ):
 *
 *  1. Chấm theo TỪNG TỪ, không theo nguyên câu — câu hỏi tiếng Việt thường dài.
 *  2. Mỗi từ chỉ tính điểm CAO NHẤT trong các trường khớp, KHÔNG cộng dồn — tránh một trang
 *     có từ phổ biến lặp ở nhiều trường đè bẹp trang khớp đúng cụm từ.
 *  3. IDF — từ hiếm (VD "lead") phải nặng hơn từ phổ biến (VD "danh", "sách").
 *  4. "trang" là stopword — mọi màn hình đều là một "trang".
 *  5. Ngưỡng TƯƠNG ĐỐI (0.35 × điểm đỉnh), không phải ngưỡng tuyệt đối hay `score > 0` —
 *     khớp đúng một từ chung không được lọt vào top nếu có kết quả khớp tốt hơn nhiều.
 */
const fs = require('fs');
const path = require('path');
const db = require('./guideKnowledgeDb');

const DIR = path.join(__dirname, '..', '..', 'data', 'guide-knowledge');
// screens.json  — SINH bởi scripts/guide/generate-registry.js (giữ lại summary/keywords viết tay)
// guides.json   — VIẾT TAY
// tour-guides.json — SINH bởi scripts/guide/generate-tour-guides.js từ product tour. Để riêng
//   chứ không nhập vào guides.json: trộn máy sinh với dữ liệu tay thì chạy lại lần hai là nhân
//   đôi bản ghi, và không ai còn biết dòng nào được phép sửa tay.
// tasks.json / business-rules.json — chưa có, `load()` bỏ qua êm.
const FILES = ['screens.json', 'guides.json', 'tour-guides.json', 'lead-detail.json', 'tasks.json', 'business-rules.json'];
const STOPWORDS = new Set(['trang', 'la', 'gi', 'the', 'nao', 'o', 'dau', 'lam', 'sao', 'nhu', 'the nao', 'cua', 'cho', 'toi', 'minh']);
const MIN_TOKEN_LEN_FOR_SUBSTRING = 4; // token ngắn phải khớp đúng từ, không khớp chuỗi con

let cache = null; // { chunks, chunkTokenSets, idf }

/**
 * ═══════════ DB LÀ NGUỒN CHÍNH, TỆP LÀ HẠT GIỐNG VÀ LƯỚI AN TOÀN ═══════════
 *
 * `load()` PHẢI GIỮ NGUYÊN CHỮ KÝ ĐỒNG BỘ. Nó được gọi từ `searchKnowledge()`, vốn chạy trong
 * một tool đồng bộ; đổi nó thành `async` là phải đổi cả chuỗi gọi phía trên và mỗi lượt hỏi
 * phải chờ thêm một vòng mạng. Nên chia đôi:
 *
 *   - `load()`  — đồng bộ, luôn trả cache. Chưa có cache thì dựng TỪ TỆP, không chờ ai.
 *   - `loadFromDb()` — bất đồng bộ, chạy nền: nạp kho từ DB rồi THAY cache. Cũng là chỗ gieo hạt
 *     lần đầu và chỗ dò số phiên bản để biết instance khác có sửa gì không.
 *
 * Vài giây đầu sau khi khởi động, trợ lý tra trên kiến thức từ tệp. Chấp nhận được, và tốt hơn
 * hẳn việc chặn request đầu tiên để chờ mạng.
 */
const VERSION_POLL_MS = Number(process.env.GUIDE_KIEN_THUC_NHIP) || 60_000;
let knownVersion = null;
let loading = false;

const COMBINING = new RegExp('[\\u0300-\\u036f]', 'g');

/** Bỏ dấu tiếng Việt: "báo giá" → "bao gia" — để câu gõ không dấu vẫn khớp được. */
function fold(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(COMBINING, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .trim();
}

function tokenize(s) {
  return fold(s)
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

/**
 * Văn bản gộp của một chunk theo từng trường, có trọng số riêng (khớp §9 current.md).
 *
 * Hai lần chỉnh 2026-08-26, đều từ số đo:
 *
 *  - BỎ `chunk.viec` (trước chấm trọng số 4). Đếm thật: **0/251 bản ghi** có trường này — nó
 *    chưa bao giờ ăn điểm, chỉ làm người đọc tưởng dữ liệu có trường đó.
 *  - `content` 1 → 3. Đây là phần CHUYÊN SÂU (quy tắc, phân biệt mục này với mục kia, điều
 *    kiện mục mới hiện) và chỉ 21/251 bản ghi có. Để ngang `summary` nghĩa là một bản ghi viết
 *    kỹ không hề được xếp trên bản ghi chỉ có một dòng tóm tắt — đúng chỗ ta cần ưu tiên ngược
 *    lại. Vẫn để DƯỚI `label` (3 điểm khớp tên màn hình) và `keywords`, vì `content` dài nên
 *    dễ chứa từ chung; cho nó cao hơn là mọi câu hỏi đều rơi vào vài bản ghi dài nhất.
 */
function fieldTexts(chunk) {
  return [
    { text: (chunk.keywords || []).join(' '), weight: 5 },
    { text: (chunk.actions || []).map((t) => t.label).join(' '), weight: 4 },
    { text: chunk.label || '', weight: 3 },
    { text: chunk.content || '', weight: 3 },
    { text: chunk.menu || '', weight: 2 },
    { text: chunk.summary || '', weight: 1 },
  ];
}

/** Đọc chunk từ tệp, gom theo tên tệp — dùng cho cả `load()` lẫn việc gieo hạt lên DB. */
function readFiles() {
  const byFile = {};
  for (const f of FILES) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
      if (Array.isArray(raw) && raw.length) byFile[f] = raw;
    } catch { /* file chưa có (tasks.json, business-rules.json) — bỏ qua êm */ }
  }
  return byFile;
}

/** Dựng cache (gồm bảng IDF) từ một danh sách chunk. Tốn ~35 ms với 316 chunk. */
function buildCache(chunks) {

  // Document frequency cho IDF: đếm mỗi token xuất hiện ở bao nhiêu chunk (không nhân trọng số).
  const df = new Map();
  const chunkTokenSets = chunks.map((c) => {
    const allText = fieldTexts(c).map((f) => f.text).join(' ');
    const set = new Set(tokenize(allText));
    for (const t of set) df.set(t, (df.get(t) || 0) + 1);
    return set;
  });
  const N = chunks.length || 1;
  const idf = new Map();
  for (const [token, count] of df) {
    idf.set(token, Math.log(N / count) + 1); // +1: token xuất hiện ở mọi chunk vẫn có trọng số > 0
  }

  cache = { chunks, chunkTokenSets, idf };
  return cache;
}

function load() {
  if (cache) return cache;
  return buildCache(Object.values(readFiles()).flat());
}

/**
 * Nạp lại kho từ DB (nếu có). Chạy nền, không ai chờ.
 *
 * Ba việc trong một hàm vì chúng dùng chung một lần đi mạng:
 *  1. Bảng trống → gieo hạt từ tệp rồi nạp lại.
 *  2. Có dữ liệu → thay cache.
 *  3. Ghi nhớ số phiên bản để lần sau chỉ nạp lại khi nó đổi.
 */
async function loadFromDb({ force = false } = {}) {
  if (!db.ENABLED || loading) return false;
  loading = true;
  try {
    if (!force && knownVersion !== null) {
      const p = await db.readVersion();
      if (p === null || p === knownVersion) return false;  // không đổi → khỏi nạp lại cả kho
    }
    const res = await db.loadAll();
    if (!res.ok) return false;

    if (res.empty) {
      const byFile = readFiles();
      const chunkCount = Object.values(byFile).reduce((a, b) => a + b.length, 0);
      if (!chunkCount) return false;
      // Lần gieo đầu: bảng trống nên chưa ai sửa gì, ghi đè thoải mái.
      const seeded = await db.syncFromFiles(byFile, { keepHandEdits: false });
      if (!seeded.ok) return false;
      console.log(`[guide] đã gieo ${seeded.count} chunk kiến thức từ tệp lên Supabase.`);
      const reloaded = await db.loadAll();
      if (!reloaded.ok || !reloaded.chunks?.length) return false;
      buildCache(reloaded.chunks);
      knownVersion = reloaded.version;
      return true;
    }

    /**
     * Màn hình MỚI do generator sinh ra phải tự vào kho.
     *
     * Bản đầu chỉ gieo khi bảng rỗng, nên sau lần đầu là kho đông cứng: thêm route mới, chạy
     * `guide:sync`, mà trợ lý vẫn nói "đường dẫn đó không tồn tại". Chỉ CHÈN cái thiếu, không
     * đụng cái đã có — hàng cũ có thể đã được sửa tay.
     */
    const inserted = await db.insertMissing(readFiles());
    if (inserted.ok && inserted.count) {
      console.log(`[guide] đã thêm ${inserted.count} chunk kiến thức mới từ tệp vào Supabase.`);
      const reloaded = await db.loadAll();
      if (reloaded.ok && reloaded.chunks?.length) {
        buildCache(reloaded.chunks);
        knownVersion = reloaded.version;
        return true;
      }
    }

    buildCache(res.chunks);
    knownVersion = res.version;
    return true;
  } finally {
    loading = false;
  }
}

/** Buộc nạp lại ngay — dùng sau khi chính instance này vừa sửa kiến thức. */
function refreshNow() {
  knownVersion = null;
  return loadFromDb({ force: true });
}

if (db.ENABLED) {
  // Trễ 3 giây: để `config/supabase` kịp dựng client và server không phải chờ một vòng mạng.
  setTimeout(() => { loadFromDb({ force: true }).catch(() => {}); }, 3000).unref?.();
  // Dò phiên bản định kỳ: instance KHÁC sửa kiến thức thì instance này phải biết mà nạp lại,
  // nếu không nó dùng bản cũ cho tới lần khởi động sau. Chỉ hỏi một số, không nạp cả kho.
  setInterval(() => { loadFromDb().catch(() => {}); }, VERSION_POLL_MS).unref?.();
}

/**
 * Thưởng khi câu hỏi chứa TRỌN một cụm keyword, không phải chỉ trùng các từ rời.
 *
 * Vì sao cần: chấm theo từng token thì "tạo deal như thế nào" cho *Auto tạo dự án* đúng bằng
 * điểm của *Tạo Deal mới* — cả hai đều có `tao` và `deal` trong `keywords` (cụm của Auto là
 * "deal thang tu tao du an", chỉ tình cờ chứa hai từ đó). Hoà điểm thì thứ hạng do thứ tự nạp
 * file quyết định, tức ngẫu nhiên. Đã đo: bản ghi đúng rơi xuống hạng 4.
 *
 * Cụm khớp trọn là tín hiệu mạnh hơn hẳn từ rời, nên thưởng theo SỐ TỪ của cụm — cụm dài khớp
 * được thì càng chắc. Cụm dưới 5 ký tự bỏ qua: "lead", "deal" đứng một mình không phải tín hiệu
 * chủ đề, chúng đã được tính ở phần token rồi.
 */
const PHRASE_BONUS = 6; // trên trọng số keyword (5) một bậc, đủ để phá thế hoà
const MIN_PHRASE_LEN = 5;

function phraseBonus(chunk, queryFolded) {
  let best = 0;
  for (const k of chunk.keywords || []) {
    const folded = fold(k).replace(/\s+/g, ' ').trim();
    if (folded.length < MIN_PHRASE_LEN) continue;
    if (!queryFolded.includes(folded)) continue;
    const wordCount = folded.split(' ').length;
    if (wordCount > best) best = wordCount;
  }
  return best * PHRASE_BONUS;
}

function scoreOf(chunk, queryTokens, idf, queryFolded = '') {
  let total = queryFolded ? phraseBonus(chunk, queryFolded) : 0;
  const texts = fieldTexts(chunk).map((f) => ({ tokens: tokenize(f.text), weight: f.weight }));
  for (const qToken of queryTokens) {
    let best = 0;
    for (const { tokens, weight } of texts) {
      // Chiều ngược (token của chunk nằm trong token câu hỏi) cũng phải đủ dài. Nếu không,
      // token 2 ký tự như "du" khớp được mọi câu hỏi chứa "duyet" → mọi trang có chữ "dự án"
      // đều ăn trọn điểm của từ "duyệt", và trang đúng bị chìm. Đã đo với câu
      // "duyệt dự án ở đâu": trước khi siết, «Dự án → mục Duyệt» không lọt nổi top 5.
      const hit = qToken.length >= MIN_TOKEN_LEN_FOR_SUBSTRING
        ? tokens.some((t) => t.includes(qToken)
          || (t.length >= MIN_TOKEN_LEN_FOR_SUBSTRING && qToken.includes(t)))
        : tokens.includes(qToken);
      if (hit && weight > best) best = weight;
    }
    total += best * (idf.get(qToken) || 1);
  }
  return total;
}

/**
 * @param {string} query   câu hỏi của người dùng (tiếng Việt, có/không dấu đều được)
 * @param {{isAdmin: boolean}} opts  quyền lấy từ JWT đã verify — KHÔNG lấy từ client
 * @returns {Array} tối đa 5 chunk khớp nhất, đã lọc theo quyền
 */
function searchKnowledge(query, { isAdmin = false } = {}) {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];
  // Chuỗi câu hỏi đã bỏ dấu, giữ nguyên thứ tự từ — cần cho `phraseBonus`, thứ mà danh sách
  // token rời không biểu diễn được.
  const queryFolded = fold(query).replace(/\s+/g, ' ').trim();

  const { chunks, idf } = load();
  const scored = chunks
    .filter((c) => isAdmin || !c.needs_admin)
    .map((c) => ({ c, score: scoreOf(c, queryTokens, idf, queryFolded) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return [];
  const topScore = scored[0].score;
  return scored
    .filter((x) => x.score >= topScore * 0.35)
    .slice(0, 5)
    .map((x) => x.c);
}

/** Cho matchScreen phía server / route context — mô tả một path cụ thể nếu có trong kho. */
function describeScreenByPath(pathname) {
  const { chunks } = load();
  return chunks.find((c) => c.path === pathname) || null;
}

module.exports = { searchKnowledge, describeScreenByPath, load, fold, readFiles, loadFromDb, refreshNow };
