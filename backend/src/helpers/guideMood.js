/**
 * SUBAGENT SẮC MẶT — đọc câu hỏi vừa gõ cùng 3 câu gần nhất, rồi nói linh thú nên làm mặt gì.
 *
 * ═══════════════ ĐÂY LÀ TÙY CHỌN THEO SỞ THÍCH, KHÔNG PHẢI TRẠNG THÁI NHÂN VẬT ═══════════════
 *
 * Sáu trạng thái sẵn có (`idle`/`thinking`/`working`/`pointing`/`answering`/`done`) suy ra THUẦN
 * CƠ HỌC từ hoạt động của agent: đang gọi tool, đang chảy chữ, đã xong. Chúng luôn đúng và luôn
 * chạy. Bốn sắc mặt ở đây thì ngược lại — chúng là NHẬN XÉT về nội dung câu hỏi, nên:
 *
 *   · MẶC ĐỊNH TẮT (`mood_enabled`). Bật hay không là sở thích của từng nơi triển khai.
 *   · Chỉ CHÈN THÊM vào một nhịp ngắn sau khi lượt kết thúc, rồi trả nhân vật về trạng thái cơ
 *     học. Không bao giờ thay thế `thinking` hay `pointing` — những cái đó đang nói thông tin
 *     thật ("tôi đang chạy tool", "nút ở đây"), còn cái này chỉ là thái độ.
 *
 * TÍNH CHẤT NÀY CHỈ HỢP VỚI BẢN NỘI BỘ. Một trợ lý bĩu môi với người vừa đặt câu hỏi là thứ
 * không nên bật trên bản khách hàng dùng — xem `mood_enabled` trong guideSettings.js.
 *
 * ═══════════════ VÌ SAO LÀ MODEL RIÊNG, KHÔNG DÙNG CHUNG NHÀ CUNG CẤP ═══════════════
 *
 * `guideIntent` đi cùng nhà cung cấp với trợ lý chính, vì nó phục vụ trực tiếp câu trả lời. Cái
 * này thì không: nó là một phép phân loại nhỏ, một nhãn trong năm nhãn, và chạy được bằng model
 * rẻ nhất có. Ghim thẳng `gpt-4o-mini` của OpenAI bằng CHÍNH `OPENAI_API_KEY` — đây không phải
 * "mượn key" (thứ bị cấm ở copilotkit.js): model OpenAI dùng key OpenAI, đúng cặp.
 *
 * Thiếu key thì trả `null`, y như tắt. Không có key mà vẫn gọi là nhận 401 rồi nuốt lỗi — đúng
 * cái bẫy mà quy tắc "không cho mượn key" sinh ra để tránh.
 *
 * ═══════════════ BA CHỐT — GIỐNG guideIntent, VÌ CÙNG MỘT LOẠI RỦI RO ═══════════════
 *
 *  1. Tắt / thiếu key      → `null`. Nhân vật giữ nguyên sắc mặt cơ học.
 *  2. Lỗi mạng / hết giờ   → `null`, KHÔNG bao giờ ném.
 *  3. Trả sai dạng         → `null`. Model nhỏ hay bọc JSON trong văn xuôi; thà không đổi mặt
 *                            còn hơn đổi sang một nhãn bịa.
 *
 * ═══════════════ KHÔNG ĐƯỢC LÀM CHẬM CÂU TRẢ LỜI ═══════════════
 *
 * Chỗ gọi (copilotkit.js) KHÔNG `await` hàm này — bắn đi rồi đi tiếp. Kết quả rơi vào bộ đệm,
 * client hỏi lấy sau khi lượt đã xong. Chờ nó là cộng thẳng độ trễ của một lời gọi model vào
 * MỌI lượt hỏi, để đổi lấy một thứ trang trí. Không đáng.
 *
 * Đệm theo `${threadId}#${turn}` nên mỗi LƯỢT HỎI tốn đúng MỘT lời gọi, dù middleware chạy lại ở
 * từng bước tool (xem "bẫy 2" trong copilotkit.js).
 */

const settings = require('./guideSettings');

/** Nhãn hợp lệ. `none` = không có gì đáng nói, giữ nguyên mặt cơ học. */
const MOODS = ['none', 'speechless', 'contempt', 'amused', 'helpless'];

/** 3 câu gần nhất — đúng như yêu cầu. Đủ để thấy câu lặp mà không phình prompt. */
const HISTORY_TURNS = 3;
const TIMEOUT_MS = Number(process.env.GUIDE_SAC_MAT_TIMEOUT) || 5000;
const QUESTION_CHAR_LIMIT = 300;

const CACHE_MAX = 200;
const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map(); // `${threadId}#${turn}` -> { mood, at }
const latest = new Map(); // threadId -> { mood, turn, at }

function isEnabled() {
  return settings.get('mood_enabled') === true && !!process.env.OPENAI_API_KEY;
}

function moodModel() {
  return settings.get('mood_model') || 'gpt-4o-mini';
}

function status() {
  return {
    on: isEnabled(),
    model: moodModel(),
    has_key: !!process.env.OPENAI_API_KEY,
    cached: cache.size,
  };
}

function pruneCache() {
  const cutoff = Date.now() - CACHE_TTL_MS;
  for (const [k, v] of cache) if (v.at < cutoff) cache.delete(k);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  for (const [k, v] of latest) if (v.at < cutoff) latest.delete(k);
}

/**
 * LUẬT PHÂN LOẠI.
 *
 * Hai luật đầu do chủ hệ thống đặt, nêu nguyên văn. Hai luật sau suy từ ý nghĩa đã thống nhất
 * của hai tấm ảnh còn lại — bỏ đi thì chỉ mất hai sắc mặt, không hỏng gì.
 *
 * `none` là MẶC ĐỊNH, và prompt nói thẳng điều đó: model nhỏ có xu hướng cố chọn một nhãn "thú
 * vị" cho mỗi câu, nên không ép nó về `none` thì mọi câu hỏi đều bị dán một thái độ nào đó.
 *
 * MÔ TẢ THEO Ý ĐỊNH, KHÔNG THEO MẪU CHỮ — đây là bài học đo được, không phải sở thích trình bày.
 * Bản đầu viết luật `contempt` là 'câu hỏi kiểu "nút đó ở đâu"'. Kết quả: "nút Tạo sự kiện ở đâu"
 * ra `contempt`, còn "nút Bộ lọc nằm chỗ nào" — CÙNG một ý — ra `none`. Model nhỏ bám vào cụm
 * chữ trong ví dụ thay vì ý. Nên mỗi nhãn nay nêu Ý ĐỊNH trước, ví dụ ĐỦ NHIỀU CÁCH DIỄN ĐẠT sau,
 * kèm một dòng "KHÔNG thuộc nhãn này" để chặn phía ngược lại.
 */
const SYSTEM_PROMPT = [
  'Bạn phân loại THÁI ĐỘ mà một linh thú trợ lý nên thể hiện với câu hỏi vừa nhận.',
  'Trả về ĐÚNG một dòng JSON: {"mood":"<nhãn>"}. Không giải thích, không bọc trong ```.',
  '',
  'Phân loại theo Ý ĐỊNH của câu hỏi, KHÔNG theo từ ngữ. Ví dụ bên dưới chỉ để minh hoạ ý định;',
  'một câu diễn đạt hoàn toàn khác mà cùng ý thì vẫn thuộc nhãn đó.',
  '',
  'Các nhãn:',
  '',
  '- "contempt": người dùng hỏi VỊ TRÍ của một nút / ô / thẻ / menu / mục đang hiển thị trên màn',
  '  hình — nó nằm chỗ nào, bấm vào đâu, tìm ở đâu, sao không thấy nó.',
  '  Thuộc nhãn này: "nút Tạo sự kiện ở đâu" · "nút Bộ lọc nằm chỗ nào" · "bấm vào đâu để lưu" ·',
  '  "chỗ nào đổi mật khẩu" · "mục Báo cáo tìm kiểu gì" · "tôi không thấy nút Xoá" ·',
  '  "ô tìm kiếm nằm bên nào" · "cái này click vô đâu".',
  '  KHÔNG thuộc nhãn này: hỏi CÁCH làm một việc nhiều bước ("làm sao tạo đơn hàng", "quy trình',
  '  duyệt chạy thế nào"), hỏi vì sao, hỏi số liệu. Những cái đó là "none".',
  '',
  '- "speechless": câu hỏi này ĐÃ ĐƯỢC HỎI trong các câu gần đây — xét theo ý, không theo chữ.',
  '  "cách tạo đơn hàng" sau khi đã hỏi "tạo đơn mới làm sao" là trùng ý, chọn nhãn này.',
  '  Hỏi TIẾP một khía cạnh khác của cùng chủ đề thì KHÔNG tính là trùng: "tạo đơn xong duyệt ở',
  '  đâu" đứng sau "cách tạo đơn hàng" là câu mới.',
  '',
  '- "helpless": người dùng đang nói câu trả lời trước SAI, không đúng, hoặc làm theo không được.',
  '  "không phải cái đó" · "làm theo rồi mà không chạy" · "sai rồi" · "vẫn lỗi".',
  '',
  '- "amused": câu hỏi không liên quan gì tới phần mềm quản lý công việc này — thời tiết, tin tức,',
  '  kiến thức chung, chuyện phiếm, chuyện riêng tư của trợ lý.',
  '',
  '- "none": mọi trường hợp còn lại.',
  '',
  'QUY TẮC QUAN TRỌNG: "none" là mặc định. Chỉ chọn nhãn khác khi câu hỏi khớp RÕ RÀNG với ý định',
  'mô tả ở trên. Một câu hỏi nghiệp vụ bình thường luôn là "none".',
  'Nếu một câu vừa trùng ý câu cũ vừa là hỏi vị trí thì ưu tiên "speechless".',
].join('\n');

function sanitize(value, maxLen) {
  return String(value == null ? '' : value)
    .replace(new RegExp('[\\u0000-\\u001f\\u007f]+', 'g'), ' ')
    .trim()
    .slice(0, maxLen);
}

/** Bóc JSON ra khỏi văn xuôi / hàng rào ``` mà model nhỏ hay thêm vào. */
function extractJson(text) {
  const s = String(text || '');
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}

function buildPrompt(question, history) {
  const lines = ['CÂU HỎI VỪA NHẬN:', sanitize(question, QUESTION_CHAR_LIMIT), ''];
  const prev = (Array.isArray(history) ? history : []).slice(-HISTORY_TURNS);
  if (prev.length) {
    lines.push(`${prev.length} CÂU HỎI GẦN NHẤT TRƯỚC ĐÓ (mới nhất ở cuối):`);
    prev.forEach((q, i) => lines.push(`${i + 1}. ${sanitize(q, QUESTION_CHAR_LIMIT)}`));
  } else {
    lines.push('(chưa có câu hỏi nào trước đó)');
  }
  return lines.join('\n');
}

/**
 * @param {{threadId: string, turn: number, question: string, history: string[]}} input
 * @param {(system: string, prompt: string, opts: object) => Promise<string>} callModel
 * @returns {Promise<string|null>} nhãn trong MOODS, hoặc `null` nếu không kết luận được
 */
async function inferMood(input, callModel) {
  if (!isEnabled()) return null;

  const question = sanitize(input?.question, QUESTION_CHAR_LIMIT);
  if (!question) return null;

  const threadId = String(input?.threadId || '');
  const turn = Number(input?.turn) || 1;
  const key = `${threadId}#${turn}`;

  pruneCache();
  const hit = cache.get(key);
  if (hit) return hit.mood;

  try {
    const text = await callModel(SYSTEM_PROMPT, buildPrompt(question, input?.history), {
      model: moodModel(),
      timeoutMs: TIMEOUT_MS,
    });
    const parsed = extractJson(text);
    const mood = parsed && typeof parsed.mood === 'string' ? parsed.mood.trim().toLowerCase() : '';
    if (!MOODS.includes(mood)) {
      cache.set(key, { mood: null, at: Date.now() });
      return null;
    }
    const value = mood === 'none' ? null : mood;
    cache.set(key, { mood: value, at: Date.now() });
    if (value) latest.set(threadId, { mood: value, turn: turn, at: Date.now() });
    return value;
  } catch (e) {
    // Chốt 2. Không log ở mức error: hết giờ là chuyện thường và không ảnh hưởng câu trả lời.
    console.warn('[guide] subagent sắc mặt bỏ qua:', String(e?.message || e).slice(0, 120));
    cache.set(key, { mood: null, at: Date.now() });
    return null;
  }
}

/**
 * Sắc mặt mới nhất của một luồng, kèm số lượt để client biết nó thuộc lượt nào.
 *
 * Client ĐẾM LƯỢT KHÁC server (xem chú thích trong guideIntent.js), nên nó KHÔNG so số lượt để
 * quyết định dùng hay bỏ — nó chỉ cần biết "có gì mới so với lần hỏi trước" và tự nhớ lượt cuối
 * đã dùng.
 */
function latestFor(threadId) {
  pruneCache();
  return latest.get(String(threadId || '')) || null;
}

module.exports = { inferMood, latestFor, status, MOODS, HISTORY_TURNS };
