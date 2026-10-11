/**
 * LỚP BỀN VỮNG CỦA KHO KINH NGHIỆM — Supabase là chính, tệp JSON là dự phòng.
 *
 * ═══════════════ VÌ SAO TÁCH RA MỘT TỆP RIÊNG ═══════════════
 *
 * `guideExperience.js` là phần LOGIC: tách token, chấm Jaccard, làm sạch PII, quyết định gộp
 * hay thêm mới. Toàn bộ phần đó chạy đồng bộ trên RAM và không cần biết dữ liệu nằm ở đâu.
 * Nhét thêm truy vấn mạng vào giữa nó là biến mọi hàm thành `async`, mà `timKinhNghiem()` lại
 * được gọi từ middleware ĐỒNG BỘ (`transformParams` của tầng model). Đổi chữ ký ở đó là phải
 * đổi cả chuỗi gọi phía trên, và mỗi lượt hỏi sẽ phải chờ một vòng mạng nữa.
 *
 * Nên chia thế này:
 *   RAM   = nguồn đọc lúc chạy. Mọi phép dò vẫn đồng bộ, đúng như trước.
 *   DB    = nguồn bền vững. Ghi ĐUỔI THEO, không chặn lượt hỏi.
 *   JSON  = lưới an toàn. Vẫn ghi song song, và là thứ được đọc khi DB không với tới được.
 *
 * ═══════════════ BA TÌNH HUỐNG PHẢI ĐÚNG ═══════════════
 *
 * 1. DB CHƯA CÓ BẢNG (chưa chạy 602_guide_assistant_en.sql). Lần gọi đầu trả lỗi
 *    "relation does not exist" → NGHỈ nhánh DB một lúc rồi TỰ THỬ LẠI (xem guideDbGate.js).
 *    Trợ lý chạy y như trước bằng JSON, và log nói rõ cần chạy migration nào.
 *
 * 2. DB CÓ NHƯNG ĐANG LỖI (mạng, Supabase khởi động lại). Ghi hỏng thì bỏ qua và giữ RAM +
 *    JSON — mất một bản ghi kinh nghiệm không đáng để hỏng một lượt trả lời của người dùng.
 *
 * 3. HAI NGUỒN LỆCH NHAU lúc khởi động. Hợp nhất theo `id`, bản nào `used_at` mới hơn thì
 *    thắng; bản chỉ có ở JSON được đẩy ngược lên DB. Nhờ vậy dữ liệu học được trong quãng DB
 *    chết không bị mất khi DB sống lại.
 */

const { supabase } = require('../config/supabase');
const embeddings = require('./guideEmbedding');
const { createDbGate } = require('./guideDbGate');

const TABLE = 'guide_experiences';

/**
 * `null` = chưa biết, `true/false` = đã thử và biết kết quả.
 * Tắt rồi thì không bật lại trong cùng tiến trình — xem tình huống 1.
 */
const gate = createDbGate({
  label: 'kho kinh nghiệm',
  target: TABLE,
  hint: 'chạy database/602_guide_assistant_en.sql',
  fallback: 'ghi/đọc bằng tệp JSON',
});

/** Bật/tắt bằng env cho ai muốn chạy thuần JSON. */
const ENABLED = process.env.GUIDE_KINH_NGHIEM_DB !== '0';

/** Bản ghi trong RAM → hàng trong DB. */
function toRow(company, x) {
  return {
    id: x.id,
    company_id: String(company || 'chung'),
    question: x.question || '',
    keywords: Array.isArray(x.keywords) ? x.keywords : [],
    path: x.path || '',
    steps: Array.isArray(x.steps) ? x.steps : [],
    dead_ends: Array.isArray(x.dead_ends) ? x.dead_ends : [],
    lesson: x.lesson || '',
    source: x.source === 'agent' ? 'agent' : 'auto',
    use_count: Number(x.use_count) || 0,
    fail_count: Number(x.fail_count) || 0,
    created_at: new Date(x.created_at || Date.now()).toISOString(),
    used_at: x.used_at ? new Date(x.used_at).toISOString() : null,
    discarded_at: x.discarded_at ? new Date(x.discarded_at).toISOString() : null,
    discard_reason: x.discard_reason || '',
    // Vector chỉ ghi khi ĐÃ CÓ. `undefined` để supabase-js bỏ hẳn trường khỏi câu lệnh, thay vì
    // ghi NULL đè lên vector đã nhúng trước đó — mỗi lần đánh dấu đã nhắc là mất công nhúng lại.
    ...(x.vec ? { embedding: embeddings.toPgVector(x.vec), embedding_model: embeddings.STORE_ID } : {}),
  };
}

/** Hàng trong DB → bản ghi trong RAM. Mốc thời gian quay về số ms, đúng dạng phần logic dùng. */
function toRecord(h) {
  const ms = (v) => (v ? Date.parse(v) || 0 : 0);
  return {
    id: h.id,
    question: h.question || '',
    keywords: Array.isArray(h.keywords) ? h.keywords : [],
    path: h.path || '',
    steps: Array.isArray(h.steps) ? h.steps : [],
    dead_ends: Array.isArray(h.dead_ends) ? h.dead_ends : [],
    lesson: h.lesson || '',
    source: h.source === 'agent' ? 'agent' : 'auto',
    use_count: Number(h.use_count) || 0,
    fail_count: Number(h.fail_count) || 0,
    created_at: ms(h.created_at) || Date.now(),
    used_at: ms(h.used_at),
    discarded_at: ms(h.discarded_at),
    discard_reason: h.discard_reason || '',
    // Vector nhúng bằng MODEL KHÁC thì bỏ — trộn hai không gian vector cho ra điểm vô nghĩa mà
    // không hề báo lỗi. Bỏ đi thì bản ghi chỉ đơn giản được nhúng lại ở nền.
    vec: h.embedding_model === embeddings.STORE_ID ? embeddings.fromPgVector(h.embedding) : null,
  };
}

/**
 * Nạp TOÀN BỘ kho từ DB, gom theo công ty.
 * @returns {Promise<{ok: boolean, kho?: Object}>}
 */
async function loadAll() {
  if (!ENABLED || gate.blocked()) return { ok: false };
  try {
    // Không phân trang: trần 300 bản mỗi công ty, vài chục công ty — vẫn dưới ngưỡng mặc định.
    const { data, error } = await supabase.from(TABLE).select('*');
    if (error) throw error;
    gate.ok();
    const store = {};
    for (const h of data || []) {
      const company = h.company_id || 'chung';
      (store[company] || (store[company] = [])).push(toRecord(h));
    }
    return { ok: true, store };
  } catch (e) {
    gate.fail(e, 'nạp kinh nghiệm từ DB');
    return { ok: false };
  }
}

/**
 * Ghi (thêm mới hoặc cập nhật) một loạt bản ghi. Gọi kiểu "bắn rồi quên" — người gọi KHÔNG chờ.
 *
 * `upsert` theo khoá chính `id`: cùng một bản ghi được sửa nhiều lần (gộp câu hỏi tương tự,
 * đánh dấu đã nhắc, bỏ đi) chỉ chiếm đúng một hàng.
 */
async function writeMany(company, records) {
  if (!ENABLED || gate.blocked() || !records?.length) return false;
  try {
    const { error } = await supabase.from(TABLE).upsert(records.map((x) => toRow(company, x)), { onConflict: 'id' });
    if (error) throw error;
    gate.ok();
    return true;
  } catch (e) {
    gate.fail(e, 'ghi kinh nghiệm vào DB');
    return false;
  }
}

/**
 * Xoá HẲN khỏi DB những bản đã bị `don()` loại khi kho chật.
 *
 * Phải có: `don()` cắt trong RAM nhưng nếu DB giữ lại thì lần khởi động sau nạp về nguyên xi,
 * và kho không bao giờ thật sự bị giới hạn ở 300.
 */
async function deleteHard(ids) {
  if (!ENABLED || gate.blocked() || !ids?.length) return false;
  try {
    const { error } = await supabase.from(TABLE).delete().in('id', ids);
    if (error) throw error;
    gate.ok();
    return true;
  } catch (e) {
    gate.fail(e, 'xoá kinh nghiệm khỏi DB');
    return false;
  }
}

/** Trạng thái để `GET /debug/kinh-nghiem` nói rõ đang lưu ở đâu. */
function status() {
  if (!ENABLED) return { on: false, reason: 'GUIDE_KINH_NGHIEM_DB=0' };
  return { on: true, ...gate.status() };
}

module.exports = { loadAll, writeMany, deleteHard, status, TABLE, ENABLED };
