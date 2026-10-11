/**
 * CỔNG DB của Trợ lý hướng dẫn — bốn kho (kiến thức, kinh nghiệm, hạn mức, nhật ký) dùng chung.
 *
 * ═══════════════ VÌ SAO CÓ TỆP NÀY ═══════════════
 *
 * Bản trước, mỗi kho tự giữ một cờ `usable` và TẮT HẲN nhánh DB cho tới lần khởi động sau khi
 * gặp lỗi "thiếu bảng". Ý định đúng: bảng chưa tạo là lỗi cấu hình, hỏi lại mỗi lượt chỉ tổ
 * tốn một vòng mạng và một dòng log.
 *
 * Nhưng PostgREST trả về ĐÚNG CÁI THÔNG BÁO ẤY khi nó chưa dựng xong schema cache lúc mới bật:
 *
 *     {"code":"PGRST205","message":"Could not find the table 'public.guide_knowledge' in the schema cache"}
 *
 * Backend gọi DB lần đầu 3 giây sau khi khởi động. Dựng cả stack cùng lúc (docker compose up)
 * là gần như chắc chắn rơi vào cửa sổ đó. Hậu quả đã xảy ra thật trên máy production nội bộ:
 * bảng có đủ, dữ liệu có đủ, nhưng tiến trình đó tắt kho kiến thức + kho kinh nghiệm cho tới
 * lần restart kế tiếp — màn hình quản trị hiện "0 mục, chưa chạy migration", còn trợ lý âm thầm
 * chạy bằng tệp JSON. Không ai biết, vì cảnh báo chỉ in ĐÚNG MỘT LẦN và nằm lẫn trong log khởi
 * động.
 *
 * ═══════════════ CÁCH SỬA ═══════════════
 *
 * Thay "tắt hẳn" bằng "nghỉ một lúc rồi thử lại", với thời gian nghỉ tăng dần:
 *
 *   lỗi lần 1–2  → nghỉ 1 phút    (đủ để PostgREST dựng xong cache; tự khỏi, không cần restart)
 *   lần 3–4      → nghỉ 5 phút
 *   từ lần 5     → nghỉ 15 phút   (bảng thật sự chưa có → mỗi giờ 4 truy vấn, không đáng kể)
 *
 * Và LOG MỌI LẦN đổi trạng thái, cả lúc hỏng lẫn lúc nối lại được. Bản cũ im lặng sau dòng đầu
 * tiên, nên khi sự cố xảy ra không có gì để lần.
 *
 * Lỗi KHÔNG phải "thiếu đối tượng" (mạng chập, DB bận) thì chỉ ghi log, KHÔNG nghỉ: chúng là
 * chuyện của một lời gọi, chặn cả kho vì một lần chập là phản ứng thái quá.
 */

/** Thiếu bảng / thiếu hàm / cache chưa dựng — cùng một cách xử lý. */
const MISSING_RE = /relation .* does not exist|could not find the (table|function)|schema cache|function .* does not exist/i;

/**
 * Nghỉ bao lâu sau lần hỏng thứ n (n tính từ 1).
 *
 * `GUIDE_DB_GATE_COOLDOWN_MS` ép một con số cố định cho MỌI lần — dùng khi cần siết/nới nhịp
 * thử lại ở một môi trường cụ thể, và để phép kiểm tự động không phải chờ một phút thật.
 */
const FORCED_MS = Number(process.env.GUIDE_DB_GATE_COOLDOWN_MS) || 0;

function cooldownFor(streak) {
  if (FORCED_MS > 0) return FORCED_MS;
  if (streak <= 2) return 60_000;
  if (streak <= 4) return 5 * 60_000;
  return 15 * 60_000;
}

/**
 * @param {object} o
 * @param {string} o.label   tên kho, hiện trong log: 'kho kiến thức', 'hạn mức ngày'…
 * @param {string} o.target  bảng/hàm nhắc trong log: 'guide_knowledge'
 * @param {string} o.hint    câu hướng dẫn khi thiếu thật: 'Chạy database/602_… để bật.'
 * @param {string} [o.fallback] mô tả đường lùi, hiện trong log: 'đọc từ tệp JSON'
 * @param {(n: number) => number} [o.cooldown] cho test bơm thời gian nghỉ ngắn
 */
function createDbGate({ label, target, hint, fallback = '', cooldown = cooldownFor }) {
  let tried = false;          // đã từng gọi DB thành công hay hỏng lần nào chưa
  let healthy = false;        // lần gọi gần nhất có thành công không
  let pausedUntil = 0;
  let streak = 0;             // số lần hỏng liên tiếp — quyết định thời gian nghỉ
  let lastError = '';

  /** Có đang nghỉ không. `false` = cứ gọi DB bình thường. */
  function blocked() {
    if (!pausedUntil) return false;
    if (Date.now() < pausedUntil) return true;
    // Hết giờ nghỉ: mở cổng để lời gọi kế tiếp THỬ LẠI. Không log ở đây — chưa biết kết quả.
    pausedUntil = 0;
    return false;
  }

  /** Gọi khi một truy vấn thành công. */
  function ok() {
    const wasDown = streak > 0 || !healthy;
    tried = true;
    healthy = true;
    pausedUntil = 0;
    if (wasDown && streak > 0) {
      console.log(`[guide] ${label}: DB dùng được trở lại sau ${streak} lần hỏng.`);
    }
    streak = 0;
    lastError = '';
  }

  /**
   * Gọi khi một truy vấn hỏng. Trả về `true` nếu vừa mở kỳ nghỉ (để bên gọi biết mà lùi về
   * đường dự phòng), `false` nếu chỉ là lỗi lẻ.
   */
  function fail(e, op) {
    const msg = String(e?.message || e || '');
    tried = true;
    lastError = msg.slice(0, 200);

    if (!MISSING_RE.test(msg)) {
      // Lỗi lẻ: ghi rồi thôi, không chặn cả kho.
      console.error(`[guide] ${label} — ${op} lỗi:`, lastError);
      return false;
    }

    healthy = false;
    streak += 1;
    const ms = cooldown(streak);
    pausedUntil = Date.now() + ms;
    console.warn(`[guide] ${label}: không với tới ${target} (${op}) — nghỉ ${Math.round(ms / 1000)}s`
      + ` rồi thử lại${fallback ? `, tạm ${fallback}` : ''}.`
      + (streak >= 3 ? ` Hỏng ${streak} lần liên tiếp — nếu bảng chưa có thì: ${hint}` : '')
      + ` Lỗi: ${lastError}`);
    return true;
  }

  /**
   * Cho màn hình debug và cho `status()` của từng kho. Giữ đúng ba giá trị mà giao diện đang
   * đọc (`in_use` = đang dùng DB, còn lại hiện "tệp JSON") — thời gian nghỉ nằm ở `retry_in_s`
   * chứ không đẻ thêm một trạng thái mới mà màn hình chưa biết.
   */
  function state() {
    if (!tried) return 'untried';
    return healthy ? 'in_use' : 'unusable_using_json';
  }

  function status() {
    const out = { state: state() };
    if (streak) out.fail_streak = streak;
    if (pausedUntil > Date.now()) out.retry_in_s = Math.ceil((pausedUntil - Date.now()) / 1000);
    if (lastError) out.last_error = lastError;
    return out;
  }

  return { blocked, ok, fail, status, state };
}

module.exports = { createDbGate, MISSING_RE };
