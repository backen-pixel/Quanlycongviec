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
const crypto = require('crypto');
const db = require('./guideKnowledgeDb');
const settings = require('./guideSettings');

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

/**
 * Kho đang phục vụ. DB LÀ NGUỒN DUY NHẤT — tệp JSON chỉ còn là hạt giống.
 *
 * ═══════════════ VÌ SAO BỎ ĐƯỜNG LÙI VỀ TỆP ═══════════════
 *
 * Bản trước, chưa nạp xong DB thì `load()` dựng kho từ tệp. Nghe như một lưới an toàn, thực ra là
 * một cái bẫy: tệp là bản GIEO HẠT, không có bất kỳ sửa đổi nào làm qua giao diện, và cũng không
 * có vector. Nên trong vài giây đầu — hoặc suốt thời gian DB hỏng — trợ lý trả lời bằng một kho
 * CŨ mà không có gì báo. Sai âm thầm, và sai theo kiểu rất khó lần: câu trả lời vẫn trôi chảy,
 * chỉ là theo một bản tài liệu đã bị sửa từ lâu.
 *
 * Nay kho rỗng cho tới khi DB trả lời. Tool tra cứu trả về "không tìm thấy" và trợ lý nói thẳng
 * là chưa tra được — người dùng thấy ngay có chuyện, thay vì nhận một câu trả lời sai tự tin.
 *
 * `readFiles()` VẪN CÒN, và vẫn phải còn: nó là thứ gieo hạt cho một CSDL trống (xem
 * `loadFromDb`). Bỏ nó đi là một lần cài mới sẽ có kho kiến thức rỗng vĩnh viễn.
 */
function load() {
  if (cache) return cache;
  // Không dựng cache rỗng: dựng rồi thì `loadFromDb` xong cũng không ai thay nó, mà `if (cache)`
  // ở trên sẽ trả về mãi một kho rỗng.
  return { chunks: [], chunkTokenSets: [], idf: new Map() };
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
function rankKeyword(query, { isAdmin = false } = {}) {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];
  // Chuỗi câu hỏi đã bỏ dấu, giữ nguyên thứ tự từ — cần cho `phraseBonus`, thứ mà danh sách
  // token rời không biểu diễn được.
  const queryFolded = fold(query).replace(/\s+/g, ' ').trim();

  const { chunks, idf } = load();
  return chunks
    .filter((c) => isAdmin || !c.needs_admin)
    .map((c) => ({ c, score: scoreOf(c, queryTokens, idf, queryFolded) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
}

function searchKnowledge(query, { isAdmin = false } = {}) {
  const scored = rankKeyword(query, { isAdmin });
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

/* ═══════════════════════ TRA CỨU LAI — TỪ KHOÁ + NGỮ NGHĨA ═══════════════════════
 *
 * ĐANG Ở DIỆN THỬ NGHIỆM. `searchKnowledge()` ở trên KHÔNG đổi hành vi một ly nào; nhánh này chỉ
 * chạy khi có ai đó gọi thẳng và ĐƯA VÀO bộ vector. Không có vector → không có gì xảy ra.
 *
 * ═══════ VÌ SAO KHÔNG PHẢI `0,7 × cosine + 0,3 × điểm_từ_khoá` ═══════
 *
 * Hai thang điểm không cùng đơn vị, và chênh nhau gần hai bậc. Đo trên chính kho này:
 * điểm từ khoá đỉnh rơi vào khoảng 41–74, còn cosine thì luôn nằm trong 0–1. Cộng thẳng với
 * trọng số 70/30 sẽ cho 0,7×0,8 = 0,56 đối đầu với 0,3×65 = 19,5 — tức ngữ nghĩa chỉ thật sự
 * chiếm ~3% ảnh hưởng chứ không phải 70%. Con số 70/30 khi đó là một lời nói dối dễ tin.
 *
 * Nên phải đưa hai bên về cùng thang TRƯỚC khi trộn. Hai cách, cài cả hai để còn so được:
 *
 *   'rrf'   — hợp nhất theo THỨ HẠNG: Σ trọng_số / (K + hạng). Không cần biết thang điểm, nên
 *             miễn nhiễm với chuyện trên. Đây là cách chuẩn cho tra cứu lai, và là mặc định.
 *   'blend' — chuẩn hoá mỗi bên theo ĐIỂM ĐỈNH CỦA CHÍNH NÓ trong truy vấn này rồi mới trộn.
 *             Sát nghĩa "70% ngữ nghĩa" hơn, nhưng nhạy với ngoại lai: một bản ghi lạc đề có
 *             điểm rất cao sẽ ép cả danh sách còn lại xuống gần 0.
 *
 * `weight` LUÔN là phần của NGỮ NGHĨA (0,7 = 70% ngữ nghĩa / 30% từ khoá), cho cả hai chế độ.
 */

/* ═══════════════════════ DỮ LIỆU NHẤT THỜI LỌT VÀO TÀI LIỆU ═══════════════════════
 *
 * Kiến thức mô tả màn hình LÀM GÌ, không mô tả màn hình ĐANG HIỂN THỊ GÌ. Ranh giới đó dễ mờ đi
 * khi tài liệu được soạn từ một lần quét giao diện: lúc quét thấy "3.802 lead" thì con số ấy rất
 * dễ trôi vào `content` và nằm đó vĩnh viễn.
 *
 * Hỏng theo kiểu tệ nhất: câu trả lời vẫn trôi chảy, vẫn đúng ngữ pháp, chỉ là sai sự thật — và
 * sai một cách tự tin. Tuần sau trợ lý vẫn khẳng định hệ thống có 3.802 lead.
 *
 * ═══════ VÌ SAO BA LUẬT NÀY, KHÔNG PHẢI "CÓ CHỮ SỐ THÌ BÁO" ═══════
 *
 * Luật ngây thơ `/\d/` bắt 5/87 mục, trong đó 3 là báo động giả hợp lệ: số thứ tự các bước
 * ("10. Đóng form"), mã ví dụ ("LEAD-6535"), tỷ lệ ("100%"). Bộ dò kêu oan là bộ dò sẽ bị tắt.
 *
 * Ba luật dưới đây đo trên chính 87 mục đang có: bắt ĐÚNG 1 mục — đúng mục hỏng — và không báo
 * động giả lần nào.
 *
 *   `(đang chọn)` — hậu tố do `pageStructureScanner` gắn để nói tab nào ĐANG mở. Đúng cho ngữ
 *                   cảnh trực tiếp, nhưng trong tài liệu thì nó vĩnh viễn sai.
 *   số có dấu phân cách nghìn — "3.802", "4.188". Không ai viết tài liệu bằng những con số này;
 *                   chúng luôn là số đếm chụp được lúc quét.
 *   số ≥ 2 chữ số kèm danh từ đếm được — "36 deal", "12 khách hàng". Ngưỡng 2 chữ số là có đo:
 *                   một chữ số thường là cách diễn đạt ("mỗi sản phẩm 1 dòng"), và nới xuống 1
 *                   chữ số tạo ra 2 báo động giả trên cùng bộ dữ liệu.
 */
const TRANSIENT_RULES = [
  { ten: 'trạng thái lúc quét', re: /\(đang chọn\)/gi },
  { ten: 'số đếm', re: /\b\d{1,3}[.,]\d{3}\b/g },
  { ten: 'số đếm', re: /\b\d{2,6}\s+(lead|deal|khách hàng|khách|bản ghi|mục|công ty|nhân viên|dòng|thẻ)\b/gi },
];

/**
 * Những mẩu nhất thời tìm thấy trong một đoạn văn bản. Mảng rỗng = sạch.
 *
 * CẢNH BÁO chứ không tự sửa: một con số có thể là thật và cố ý (giới hạn "tối đa 50 dòng"), và
 * xoá hộ người viết là cách chắc chắn để họ mất lòng tin vào bộ dò. Người đọc quyết định.
 */
function findTransient(text) {
  const s = String(text || '');
  const out = [];
  for (const { ten, re } of TRANSIENT_RULES) {
    re.lastIndex = 0;
    const m = s.match(re);
    if (m) for (const x of new Set(m)) out.push({ loai: ten, mau: x.trim() });
  }
  return out;
}

/**
 * Bỏ hậu tố trạng thái khỏi một nhãn quan sát được.
 *
 * Dùng ở đường SOẠN TÀI LIỆU, không dùng ở đường ngữ cảnh trực tiếp — đó là hai việc ngược nhau:
 * ngữ cảnh trực tiếp CẦN biết tab nào đang mở, tài liệu thì không được nhớ điều đó.
 */
function stripLiveState(label) {
  return String(label || '').replace(/\s*\(đang chọn\)\s*$/i, '').trim();
}

/** K của RRF. 60 là giá trị gốc trong bài RRF và cũng là mặc định của phần lớn thư viện. */
const RRF_K = 60;

/**
 * 50/50 — con số ĐO ĐƯỢC, không phải đặt cho đẹp. `scripts/guide/knowledge-eval.js --sweep` quét
 * cả dải trên 30 câu: blend 50% cho đỉnh (hit@1 23/30, MRR 0,861) trong khi 70% tụt xuống 21/30
 * và 100% xuống 18/30. Đổi số này thì chạy lại phép quét trước, đừng đoán.
 */
const SEMANTIC_WEIGHT = 0.5;

/**
 * 'blend' chứ không phải 'rrf', cũng từ phép quét đó: RRF vứt đi ĐỘ LỚN của điểm, mà khoảng cách
 * điểm giữa hạng 1 và hạng 2 ở kho này lại là tín hiệu thật — RRF 50% cho 18/30, blend 50% cho
 * 23/30. (Tôi đã đoán ngược, và số liệu bác bỏ.)
 */
const FUSION_MODE = 'blend';

/**
 * Băm chuỗi đem nhúng. 12 hex là đủ: nó chỉ phải phân biệt "nội dung đã đổi hay chưa" trên vài
 * trăm bản ghi, không chống được ai cố tình tạo va chạm mà cũng không cần.
 */
function fingerprint(text) {
  return crypto.createHash('sha1').update(String(text || ''), 'utf8').digest('hex').slice(0, 12);
}

/**
 * KHOÁ ghép vector với chunk.
 *
 * KHÔNG dùng `path` một mình: kho có path trùng thật — `/crm/leads/:id` xuất hiện ở cả
 * screens.json ("Chi tiết Lead / Deal") lẫn lead-detail.json ("Các mục trong chi tiết Lead /
 * Deal"). Cặp (path, label) là duy nhất.
 */
function vectorKeyOf(chunk) {
  return `${chunk.path || ''}::${chunk.label || ''}`;
}

/**
 * Chuỗi đem đi nhúng cho một chunk. XUẤT RA NGOÀI vì vòng lặp bù và script CLI phải dùng ĐÚNG
 * công thức này — lệch một chi tiết là toàn bộ vector cũ thành vô nghĩa mà không có gì báo (xem
 * ghi chú `RECIPE` trong guideEmbedding.js). Cũng là chuỗi được BĂM để làm vân tay.
 */
function embedTextOf(chunk) {
  return [
    chunk.label || '',
    chunk.menu || '',
    (chunk.keywords || []).join(', '),
    chunk.summary || '',
    chunk.content || '',
  ].filter(Boolean).join(' — ').slice(0, 2000);
}

/* ═══════════════════════ VÒNG LẶP BÙ VECTOR ═══════════════════════
 *
 * Kiến thức sửa được bất cứ lúc nào — giao diện Kiến thức, bảng "Kiến thức trang này", hay
 * `guide:sync` thêm màn hình mới. Nhúng lại là một vòng gọi mạng, không thể nhét vào cùng giao
 * dịch với lần lưu mà không bắt người dùng ngồi chờ và không làm việc lưu hỏng theo khi OpenAI
 * hỏng. Nên nhúng chạy NỀN, và DB là chỗ hai bên gặp nhau.
 *
 * Cùng hình dạng với `backfillVectors` của kho kinh nghiệm, cố ý: hai kho có cùng loại vấn đề thì
 * nên có cùng loại lời giải, để người đọc mã không phải học hai cơ chế.
 *
 * BA CHỐT:
 *   1. Mỗi nhịp chỉ lấy một LÔ. Kho 330 mục thì vài nhịp là xong; kho lớn hơn cũng không bao giờ
 *      dựng một request khổng lồ hay giữ event loop quá lâu.
 *   2. KHÔNG bao giờ ném. Nhúng hỏng thì hàng đó vẫn NULL và nhịp sau thử lại — trợ lý trong lúc
 *      đó tra bằng từ khoá, y như trước khi có tầng ngữ nghĩa.
 *   3. Nhúng xong KHÔNG tự nạp lại cả kho. Trigger `trg_guide_knowledge_bump` đã tăng số phiên
 *      bản, nên `loadFromDb` ở nhịp dò kế tiếp sẽ kéo về — một đường nạp lại duy nhất, không phải
 *      hai đường chạy song song.
 */

/**
 * Hàng ĐÃ CÓ vector nhưng vân tay lệch — tức nội dung sửa sau lần nhúng gần nhất.
 *
 * ═══════════════ VÌ SAO PHẢI DÒ Ở NODE, KHÔNG HỎI ĐƯỢC BẰNG SQL ═══════════════
 *
 * `listNeedEmbedding` chỉ bắt được hai ca: chưa có vector, và nhúng bằng model khác. Nó KHÔNG bắt
 * được ca thứ ba — nội dung đổi — vì vân tay là băm của chuỗi do `embedTextOf()` dựng, mà công
 * thức đó nằm trong mã Node chứ không nằm trong Postgres. SQL không tính lại được.
 *
 * Không có phép dò này thì hàng vừa sửa rơi vào một trạng thái chết: vector cũ còn đó nên truy vấn
 * SQL coi là "đã nhúng", trong khi lúc tra cứu `vectorOf()` từ chối nó vì vân tay lệch. Không ai
 * nhúng lại, và mục đó mất tầng ngữ nghĩa VĨNH VIỄN mà không có gì báo. Đã tái hiện được: sửa
 * `summary` của một hàng thẳng trong DB, vòng lặp vẫn báo "thiếu 0".
 *
 * Dò ở đây rẻ vì mọi thứ cần thiết đã nằm sẵn trong bộ nhớ: kho đã nạp, vân tay đi kèm từng chunk.
 * Chỉ là băm lại vài trăm chuỗi ngắn, không đụng mạng, không đụng DB.
 *
 * Cố ý đặt SAU nhánh DB: hàng chưa có vector là ca phổ biến và rẻ hơn, làm hết nó trước.
 */
function findStaleInMemory(storeId, limit) {
  const out = [];
  for (const c of load().chunks) {
    if (out.length >= limit) break;
    if (!c._vec || !c._source) continue;              // chưa nhúng → nhánh DB lo
    if (c._vecModel !== storeId) continue;            // đổi model → nhánh DB lo
    const text = embedTextOf(c);
    if (c._vecHash === fingerprint(text)) continue;   // còn khớp
    out.push({ source: c._source, path: c.path, text: text });
  }
  return out;
}

/** Mỗi nhịp nhúng tối đa bao nhiêu hàng. 32 vừa đủ một request OpenAI mà không phình bộ nhớ. */
const BACKFILL_BATCH = 32;

/**
 * Nhịp vòng lặp. Thưa hơn nhịp dò phiên bản (60 giây) vì nó TỐN TIỀN và tốn mạng, còn việc nó
 * chậm vài phút thì không ai thấy: mục chưa nhúng vẫn tra được bằng từ khoá.
 */
const BACKFILL_MS = Number(process.env.GUIDE_KIEN_THUC_NHUNG_NHIP) || 120_000;

let backfilling = false;
let lastBackfill = { at: 0, done: 0, failed: 0 };

/**
 * Bù một lô. Trả về số hàng đã nhúng được — 0 nghĩa là hết việc HOẶC không làm được, và hai cái
 * đó phân biệt bằng `lastBackfill.failed`.
 */
async function backfillVectorsOnce({ batch = BACKFILL_BATCH } = {}) {
  if (backfilling) return 0;
  if (!db.ENABLED) return 0;

  // eslint-disable-next-line global-require
  const embeddings = require('./guideEmbedding');
  if (!embeddings.ENABLED) return 0;

  backfilling = true;
  let done = 0;
  let failed = 0;
  try {
    const need = await db.listNeedEmbedding(embeddings.STORE_ID, batch);
    if (!need.ok) return 0;

    // Hàng chưa nhúng trước, hết mới tới hàng nội dung đã đổi — xem `findStaleInMemory`.
    let rows = (need.list || []).map((h) => ({
      source: h.source,
      path: h.path,
      text: embedTextOf({
        label: h.label, menu: h.menu, summary: h.summary, content: h.content, keywords: h.keywords,
      }),
    }));
    if (!rows.length) rows = findStaleInMemory(embeddings.STORE_ID, batch);
    if (!rows.length) return 0;

    const texts = rows.map((r) => r.text);
    const vecs = await embeddings.embedMany(texts);

    for (let i = 0; i < rows.length; i += 1) {
      if (!vecs[i]) { failed += 1; continue; }
      // eslint-disable-next-line no-await-in-loop
      const w = await db.writeEmbedding(
        rows[i].source, rows[i].path, embeddings.toPgVector(vecs[i]),
        fingerprint(texts[i]), embeddings.STORE_ID,
      );
      if (!w.ok) { failed += 1; continue; }
      done += 1;
      /**
       * Cập nhật LUÔN bản trong bộ nhớ, đừng đợi lần nạp lại từ DB.
       *
       * Không làm thì `findStaleInMemory` ở lô kế tiếp vẫn thấy vân tay cũ và nhúng lại đúng
       * hàng vừa nhúng. Đã đo: một hàng lệch làm `backfillVectorsNow` gọi model BA lần (bằng số
       * lô tối đa) cho cùng một nội dung — đúng, nhưng trả tiền ba lần.
       *
       * Chỉ đụng ba trường vector; nội dung vẫn do DB làm chủ và lần nạp lại kế tiếp vẫn ghi đè
       * toàn bộ như thường.
       */
      const hit = load().chunks.find((c) => c._source === rows[i].source && c.path === rows[i].path);
      if (hit) {
        hit._vec = embeddings.toPgVector(vecs[i]);
        hit._vecHash = fingerprint(texts[i]);
        hit._vecModel = embeddings.STORE_ID;
        delete hit._vecParsed;
      }
    }

    if (done) console.log(`[guide] đã nhúng ${done} mục kiến thức${failed ? `, ${failed} lỗi` : ''}.`);
    return done;
  } catch (e) {
    console.warn('[guide] vòng lặp nhúng kiến thức bỏ qua nhịp này:', String(e?.message || e).slice(0, 140));
    return 0;
  } finally {
    /**
     * CHỈ ghi lại nhịp có làm được việc.
     *
     * `backfillVectorsNow` chạy tới khi hết việc, nên lô CUỐI luôn rỗng — ghi đè vô điều kiện là
     * bảng chẩn đoán luôn hiện `done: 0` ngay sau một đợt bù thành công, và người đọc kết luận
     * vòng lặp hỏng. Nhịp rỗng không phải thông tin; nhịp làm được việc mới là.
     */
    if (done || failed) lastBackfill = { at: Date.now(), done, failed };
    backfilling = false;
  }
}

if (db.ENABLED) {
  // Lệch pha với nhịp dò phiên bản (3 giây) để hai việc không cùng ra mạng một lúc lúc khởi động.
  setTimeout(() => { backfillVectorsOnce().catch(() => {}); }, 12_000).unref?.();
  setInterval(() => { backfillVectorsOnce().catch(() => {}); }, BACKFILL_MS).unref?.();
}

/**
 * Bù CHO TỚI KHI HẾT — dùng sau khi vừa lưu một mục, và cho CLI.
 *
 * Chờ ở đây là có chủ ý và chỉ ở đây: người vừa bấm Lưu thường mở ngay bảng tra cứu để xem mục
 * mới ra chưa, nên một mục lẻ phải có vector ngay thay vì chờ tới nhịp sau. Có trần vòng lặp để
 * một kho lớn chưa nhúng không biến lần lưu thành mười phút.
 */
async function backfillVectorsNow({ maxBatches = 3 } = {}) {
  let total = 0;
  for (let i = 0; i < maxBatches; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const n = await backfillVectorsOnce();
    total += n;
    if (!n) break;
  }
  return total;
}

/** Cho bảng chẩn đoán và `guide:check`: kho đã nhúng tới đâu. */
async function vectorStatus() {
  // eslint-disable-next-line global-require
  const embeddings = require('./guideEmbedding');
  const inMemory = load().chunks.filter((c) => c._vec).length;
  const out = {
    on: embeddings.ENABLED && db.ENABLED,
    store: embeddings.STORE_ID,
    in_memory: inMemory,
    // Đếm riêng với `missing`: `missing` là "chưa nhúng bao giờ" (SQL thấy được), `stale` là
    // "nhúng rồi nhưng nội dung đã đổi" (chỉ Node thấy được). Gộp hai cái là giấu mất phân biệt
    // quan trọng nhất khi đi tìm lý do một mục không được tra ra.
    stale: findStaleInMemory(embeddings.STORE_ID, Number.MAX_SAFE_INTEGER).length,
    last_backfill: lastBackfill,
  };
  if (!db.ENABLED) return { ...out, total: 0, missing: 0, db: false };
  const st = await db.embeddingStats(embeddings.STORE_ID);
  return st.ok ? { ...out, db: true, total: st.total, missing: st.missing } : { ...out, db: false };
}

/** Tra cứu lai có đang bật không — công tắc đổi được lúc chạy, không cần dựng lại. */
function hybridOn() {
  return settings.get('knowledge_hybrid') !== false;
}

/**
 * Vector của một chunk, đã giải mã và đã kiểm vân tay. `null` = không dùng được.
 *
 * Đệm kết quả giải mã ngay trên chunk (`_vecParsed`): pgvector về dạng chuỗi, và phân tích 1536
 * số cho 330 chunk ở MỖI lượt hỏi là công việc vô ích lặp lại — cache của kho chỉ dựng lại khi
 * kiến thức đổi, nên bám theo vòng đời đó là đúng chỗ.
 */
function vectorOf(chunk) {
  if (chunk._vecParsed !== undefined) return chunk._vecParsed;
  let out = null;
  try {
    // eslint-disable-next-line global-require
    const embeddings = require('./guideEmbedding');
    if (chunk._vec
      && chunk._vecModel === embeddings.STORE_ID
      && chunk._vecHash === fingerprint(embedTextOf(chunk))) {
      const v = embeddings.fromPgVector(chunk._vec);
      out = (v && v.length === embeddings.DIMS) ? v : null;
    }
  } catch { out = null; }
  chunk._vecParsed = out;
  return out;
}

async function searchKnowledgeHybrid(query, {
  isAdmin = false, vectors = null, mode = FUSION_MODE, weight = SEMANTIC_WEIGHT, limit = 5,
  explain = false,
} = {}) {
  const keyword = rankKeyword(query, { isAdmin });

  /**
   * MỌI đường lùi đều trả về ĐÚNG kết quả của `searchKnowledge()`, không phải một danh sách
   * gần giống. Không có vector, nhúng hỏng, hết giờ, trọng số 0 — người dùng phải thấy hành vi
   * y hệt hôm nay, chứ không phải một biến thể lặng lẽ kém hơn.
   */
  const keywordOnly = () => {
    if (!keyword.length) return [];
    const top = keyword[0].score;
    const kept = keyword.filter((x) => x.score >= top * 0.35).slice(0, limit);
    if (!explain) return kept.map((x) => x.c);
    return kept.map((x, i) => ({
      chunk: x.c, rank: i + 1, score: x.score / top, tier: 'keyword',
      keyword_raw: x.score, keyword_part: 1, semantic_cos: null, semantic_part: 0,
      keyword_rank: i + 1, semantic_rank: null,
    }));
  };
  /**
   * `vectors` truyền tay chỉ dùng cho phép đo (`knowledge-eval.js --sweep`). Lúc chạy thật để
   * trống: vector đi kèm chính chunk, lấy từ DB cùng lần nạp với nội dung.
   *
   * MỌI nhánh dưới đây trả về MẢNG, không bao giờ `null`: chỗ gọi không phải nhớ rằng hàm này
   * đôi khi trả về thứ khác, và tắt công tắc thì kết quả trùng khít `searchKnowledge()`.
   */
  if (!vectors && !hybridOn()) return keywordOnly();
  if (weight <= 0) return keywordOnly();

  // require ở TRONG hàm: module này được nạp lúc boot và phải giữ nguyên chi phí khởi động.
  // eslint-disable-next-line global-require
  const embeddings = require('./guideEmbedding');
  const qv = await embeddings.embed(query).catch(() => null);
  if (!qv) return keywordOnly();

  /**
   * VÂN TAY PHẢI KHỚP. Vector nằm cùng hàng với nội dung, nhưng nhúng chạy NỀN nên giữa lúc sửa
   * nội dung và lúc vòng lặp bù kịp, hàng đó mang một vector tả bản cũ. Bỏ qua nó (mục đó lùi về
   * thuần từ khoá) thay vì xếp hạng theo một bản ghi không còn tồn tại.
   *
   * Cũng là chỗ bắt được ca đổi model: `_vecModel` khác `STORE_ID` thì con số vẫn hợp lệ nhưng
   * thuộc một không gian vector khác, so cosine với nó là vô nghĩa.
   */
  const { chunks } = load();
  const semantic = chunks
    .filter((c) => isAdmin || !c.needs_admin)
    .map((c) => {
      const vec = vectors
        ? (vectors.get(vectorKeyOf(c)) || vectors.get(c.path))   // đường của phép đo
        : vectorOf(c);
      if (!vec) return null;
      return { c, score: embeddings.cosine(qv, vec.v || vec) };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  if (!semantic.length) return keywordOnly();

  /**
   * Khoá gộp phải là (path, label), KHÔNG phải path.
   *
   * `/crm/leads/:id` có HAI chunk khác nhau (xem `vectorKeyOf`). Khoá bằng path thì hai bản ghi
   * tách biệt bị gộp làm một: điểm CỘNG DỒN vào một chunk, và nó leo lên đầu bảng bằng điểm của
   * bản ghi khác. Đã thấy triệu chứng: "Các mục trong chi tiết Lead / Deal" đứng hạng 1 cho cả
   * những câu hỏi chẳng liên quan gì.
   */
  /**
   * GIỮ RIÊNG phần đóng góp của từng tầng thay vì cộng dồn vào một số.
   *
   * Không phải để cho đẹp: bảng "Thử tra cứu" trong màn hình Kiến thức hiện đúng hai con số này,
   * và nếu nó tự tính lại thì sẽ có HAI đường tính điểm chạy song song — sửa trọng số ở đây,
   * quên sửa ở kia, rồi bảng chẩn đoán nói dối về chính hệ thống nó đang chẩn đoán.
   */
  const fused = new Map(); // (path,label) → { c, kw, sem, kRank, sRank }
  const slot = (c) => {
    const key = vectorKeyOf(c);
    const cur = fused.get(key) || { c: c, kw: 0, sem: 0, kRank: null, sRank: null };
    fused.set(key, cur);
    return cur;
  };

  if (mode === 'rrf') {
    keyword.forEach((x, i) => { const t = slot(x.c); t.kw = (1 - weight) / (RRF_K + i + 1); t.kRank = i + 1; });
    semantic.forEach((x, i) => { const t = slot(x.c); t.sem = weight / (RRF_K + i + 1); t.sRank = i + 1; });
  } else {
    // Chuẩn hoá theo đỉnh CỦA TỪNG BÊN trong đúng truy vấn này — xem ghi chú đầu khối.
    const kTop = keyword[0]?.score || 1;
    const sTop = semantic[0]?.score || 1;
    keyword.forEach((x, i) => { const t = slot(x.c); t.kw = (1 - weight) * (x.score / kTop); t.kRank = i + 1; t.kRaw = x.score; });
    semantic.forEach((x, i) => { const t = slot(x.c); t.sem = weight * (x.score / sTop); t.sRank = i + 1; t.cos = x.score; });
  }

  const ranked = [...fused.values()]
    .map((x) => ({ ...x, score: x.kw + x.sem }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (!explain) return ranked.map((x) => x.c);
  return ranked.map((x, i) => ({
    chunk: x.c,
    rank: i + 1,
    score: x.score,
    tier: (x.kw && x.sem) ? 'ca-hai' : (x.kw ? 'keyword' : 'semantic'),
    keyword_raw: x.kRaw ?? null,
    keyword_part: x.kw,
    semantic_cos: x.cos ?? null,
    semantic_part: x.sem,
    keyword_rank: x.kRank,
    semantic_rank: x.sRank,
  }));
}

module.exports = {
  searchKnowledge, searchKnowledgeHybrid, rankKeyword,
  embedTextOf, fingerprint, vectorKeyOf, vectorStatus,
  findTransient, stripLiveState,
  backfillVectorsNow, backfillVectorsOnce,
  describeScreenByPath, load, fold, readFiles, loadFromDb, refreshNow,
};
