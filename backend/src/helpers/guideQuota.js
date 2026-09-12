/**
 * HẠN MỨC NGÀY của Trợ lý hướng dẫn — mỗi người tối đa N câu hỏi và/hoặc N token mỗi ngày.
 *
 * ═══════════════ MỘT CÂU HỎI KHÔNG PHẢI MỘT REQUEST ═══════════════
 *
 * Đây là chỗ dễ làm sai nhất, và làm sai thì hạn mức 30 câu hoá ra 5 câu. 10/13 tool của trợ lý
 * chạy trên TRÌNH DUYỆT, và tool trình duyệt được runtime dựng KHÔNG có `execute` — model phát
 * lời gọi tool xong là request đóng, trình duyệt chạy tool rồi mở request MỚI gửi kết quả về.
 * Một yêu cầu đời thường vì thế tốn 5–6 lần `POST /api/copilotkit`.
 *
 * Nên đơn vị đếm là cặp `(thread_id, turnNo)`, không phải request. `turnNo` do tầng AG-UI đếm từ
 * danh sách message (xem `laMocLuot` ở copilotkit.js) và giữ nguyên suốt mọi bước của một câu.
 *
 * ═══════════════ NGÀY THEO GIỜ VIỆT NAM ═══════════════
 *
 * Tính ở Node rồi truyền xuống DB, KHÔNG dùng `current_date`: máy chủ DB có thể chạy UTC, và khi
 * đó mốc sang ngày rơi vào 7 giờ sáng — người dùng hỏi lúc 8 giờ tối thấy hạn mức chưa reset.
 * Cùng quy ước với việc tự đăng xuất nửa đêm ở middleware/auth.js.
 *
 * ═══════════════ HỎNG THÌ CHO QUA ═══════════════
 *
 * Chưa chạy migration, DB rớt, RPC lỗi → CHO QUA, ghi cảnh báo, rồi nghỉ một lúc và tự thử lại
 * (xem guideDbGate.js). Hạn mức là công cụ
 * kiểm soát chi phí, không phải cổng bảo mật; chặn cả công ty không dùng được trợ lý vì một
 * bảng chưa tạo là cái giá lớn hơn nhiều so với vài lượt hỏi vượt trần.
 */

const { supabase } = require('../config/supabase');
const settings = require('./guideSettings');
const { createDbGate } = require('./guideDbGate');

const TABLE = 'guide_quota_turn';
const gate = createDbGate({
  label: 'hạn mức ngày',
  target: TABLE,
  hint: 'chạy database/602_guide_assistant_en.sql',
  fallback: 'cho qua mọi lượt',
});

/** Ngày hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD. */
function vnDay(at = Date.now()) {
  // `en-CA` cho ra đúng dạng YYYY-MM-DD, không phải mẹo — đó là định dạng chuẩn của locale này.
  return new Date(at).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

const maxQuestions = () => Number(settings.get('daily_question_quota')) || 0;
const maxTokens = () => Number(settings.get('daily_token_quota')) || 0;

/** Có núm nào đang bật không — không bật thì khỏi đụng tới DB. */
function isEnabled() {
  return !gate.blocked() && (maxQuestions() > 0 || maxTokens() > 0);
}

/**
 * Kiểm một lượt hỏi. Gọi ở CỔNG VÀO, trước khi chạy bất cứ thứ gì.
 *
 * @returns {Promise<{allowed: boolean, reason?: string, question_count?: number, token_count?: number,
 *                    max_questions?: number, max_tokens?: number}>}
 */
async function checkTurn({ userId, companyId, threadId, turnNo }) {
  if (!isEnabled()) return { allowed: true, reason: 'off' };
  // Thiếu danh tính thì không đếm được cho ai — cho qua, và đây là ca không nên xảy ra vì
  // route đã đi sau middleware `auth`.
  if (!userId) return { allowed: true, reason: 'unknown_user' };

  const mc = maxQuestions();
  const mt = maxTokens();
  try {
    const { data, error } = await supabase.rpc('guide_quota_check', {
      p_day: vnDay(),
      p_user: userId,
      p_company: companyId || null,
      p_thread: String(threadId || ''),
      p_turn_no: Number(turnNo) || 1,
      p_max_questions: mc,
      p_max_tokens: mt,
    });
    if (error) throw error;
    gate.ok();
    const r = Array.isArray(data) ? data[0] : data;
    if (!r) return { allowed: true, reason: 'no_result' };
    return {
      allowed: !!r.allowed,
      reason: r.reason,
      question_count: Number(r.question_count) || 0,
      token_count: Number(r.token_count) || 0,
      max_questions: mc,
      max_tokens: mt,
    };
  } catch (e) {
    gate.fail(e, 'check');
    return { allowed: true, reason: 'db_error' };
  }
}

/**
 * Cộng token vào lượt đã chạy xong. Gọi SAU khi chốt sổ chi phí.
 *
 * Cố ý không `await` ở nơi gọi: đây là kế toán chạy nền, chậm một nhịp không sao, còn để nó
 * chắn đường trả lời cho người dùng thì mới là hỏng.
 */
async function addTokens({ userId, threadId, turnNo, token }) {
  if (!isEnabled() || !userId || !token) return;
  try {
    const { error } = await supabase.rpc('guide_quota_add_tokens', {
      p_day: vnDay(),
      p_user: userId,
      p_thread: String(threadId || ''),
      p_turn_no: Number(turnNo) || 1,
      p_tokens: Math.max(0, Math.round(Number(token) || 0)),
    });
    if (error) throw error;
    gate.ok();
  } catch (e) {
    gate.fail(e, 'add_tokens');
  }
}

/** Số đã dùng hôm nay của MỘT người — để giao diện hiện "còn bao nhiêu". */
async function usageToday(userId) {
  const mc = maxQuestions();
  const mt = maxTokens();
  const off = { on: false, max_questions: mc, max_tokens: mt };
  if (!isEnabled() || !userId) return off;
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('token_count')
      .eq('day', vnDay())
      .eq('user_id', userId);
    if (error) throw error;
    gate.ok();
    const rows = data || [];
    return {
      on: true,
      day: vnDay(),
      question_count: rows.length,
      token_count: rows.reduce((a, x) => a + (Number(x.token_count) || 0), 0),
      max_questions: mc,
      max_tokens: mt,
    };
  } catch (e) {
    gate.fail(e, 'usage_today');
    return off;
  }
}

/** Bảng theo dõi cho admin: ai dùng bao nhiêu trong một ngày. */
async function byDay(day, companyId) {
  try {
    const { data, error } = await supabase.rpc('guide_quota_by_day', {
      p_day: day || vnDay(),
      p_company: companyId || null,
    });
    if (error) throw error;
    gate.ok();
    return { ok: true, day: day || vnDay(), rows: data || [] };
  } catch (e) {
    gate.fail(e, 'by_day');
    return { ok: false, reason: String(e?.message || e).slice(0, 200) };
  }
}

function status() {
  return {
    table: TABLE,
    ready: !gate.blocked(),
    enforcing: isEnabled(),
    max_questions: maxQuestions(),
    max_tokens: maxTokens(),
    vn_day: vnDay(),
    ...gate.status(),
  };
}

module.exports = { checkTurn, addTokens, usageToday, byDay, status, vnDay, TABLE };
