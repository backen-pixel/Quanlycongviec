/**
 * NHẬT KÝ HỎI ĐÁP — lưu đầy đủ mọi lượt hỏi vào Supabase (xem database/602_guide_assistant_en.sql).
 *
 * ═══════════════ VÌ SAO CLIENT GỬI CHỨ KHÔNG PHẢI SERVER TỰ GHI ═══════════════
 *
 * Cùng lý do với kho kinh nghiệm: server chỉ thấy từng lần gọi model rời rạc. Một lượt hỏi ở chế
 * độ toàn quyền chạy qua 5–6 request, và CÂU TRẢ LỜI CUỐI nằm trong luồng phát ra của request
 * cuối — lúc `chot()` sổ chi phí thì `input.messages` mới chỉ có lịch sử tới câu hỏi, chưa có
 * câu trả lời. Client giữ nguyên `agent.messages` nên biết chính xác lượt nào vừa xong và trả
 * lời bằng gì.
 *
 * KHÔNG TIN CLIENT VỀ DANH TÍNH: `user_id` và `company_id` lấy từ JWT đã xác thực, không lấy từ
 * thân request. Client chỉ đề nghị nội dung.
 *
 * ═══════════════ CHẶN TRÊN KÍCH THƯỚC ═══════════════
 *
 * Cắt ở đây, chỗ cuối cùng trước khi dữ liệu vào DB, chứ không tin vào client. Một kết quả đọc
 * màn hình thô có thể vài nghìn ký tự; để nguyên thì bảng phình rất nhanh và phần thừa cũng
 * chẳng ai đọc.
 */

const { supabase } = require('../config/supabase');
const settings = require('./guideSettings');
const { createDbGate } = require('./guideDbGate');

const TABLE = 'guide_chat_log';

const MAX_QUESTION_LEN = 4000;
const MAX_ANSWER_LEN = 8000;
const MAX_STEPS = 40;
const MAX_SUMMARY_LEN = 300;

const gate = createDbGate({
  label: 'nhật ký hỏi đáp',
  target: TABLE,
  hint: 'chạy database/602_guide_assistant_en.sql',
  fallback: 'không ghi nhật ký',
});

/** Ngày hôm nay theo giờ Việt Nam — cùng quy ước với hạn mức và việc tự đăng xuất nửa đêm. */
function vnDay(at = Date.now()) {
  return new Date(at).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

const isEnabled = () => !gate.blocked() && settings.get('chat_log_enabled') !== false;

function clip(v, max) {
  const s = String(v ?? '').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * Chuẩn hoá danh sách bước. Client gửi `{tool, summary, status}`; giữ đúng ba trường đó,
 * bỏ mọi thứ khác — không để client bơm dữ liệu tuỳ ý vào cột jsonb.
 */
function normalizeSteps(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, MAX_STEPS).map((b) => ({
    tool: clip(b?.tool, 60),
    summary: clip(b?.summary, MAX_SUMMARY_LEN),
    status: clip(b?.status, 20),
  }));
}

/** Bước nào coi là hỏng — cùng danh sách với chỗ chặn ghi kinh nghiệm ở client. */
const BROKEN_STATUSES = new Set(['failed', 'empty', 'cancelled']);

/**
 * Bản nào "đầy đủ hơn"? Nhiều bước hơn thắng; bằng bước thì câu trả lời dài hơn thắng.
 *
 * Cần phép so này vì bản ghi ĐẦU TIÊN của một lượt không phải lúc nào cũng là bản đúng: client
 * dò trạng thái, và một lượt có điều hướng có thể bị chộp lúc mới đi được nửa đường (xem
 * `useTurnFinished`). Chặn ở client là chính, nhưng nhật ký là thứ người ta mở ra khi có người
 * báo "trợ lý trả lời sai" — để nó giữ một câu cụt thì đúng lúc cần nhất lại không tra được gì.
 */
function isMoreComplete(fresh, old) {
  if (!old) return true;
  const oldSteps = Number(old.step_count) || 0;
  if (fresh.step_count !== oldSteps) return fresh.step_count > oldSteps;
  return String(fresh.answer || '').length > String(old.answer || '').length;
}

/**
 * Ghi một lượt. Trùng `(thread_id, turn_no)` thì chỉ ghi đè khi bản mới ĐẦY ĐỦ HƠN — người dùng
 * F5 giữa chừng hoặc client thử lại là chuyện bình thường, không phải lỗi, nhưng cũng không được
 * để một lần thử lại nghèo nàn xoá mất bản tử tế.
 */
async function writeTurn({ userId, companyId, threadId, turnNo, path, question, answer, steps, provider, model }) {
  if (!isEnabled()) return { ok: false, reason: 'off' };
  if (!userId || !threadId || !String(question || '').trim()) {
    return { ok: false, reason: 'missing_data' };
  }

  const rows = normalizeSteps(steps);
  const record = {
    day: vnDay(),
    user_id: userId,
    company_id: companyId || null,
    thread_id: String(threadId),
    turn_no: Number(turnNo) || 1,
    path: clip(path, 300),
    question: clip(question, MAX_QUESTION_LEN),
    answer: clip(answer, MAX_ANSWER_LEN),
    steps: rows,
    step_count: rows.length,
    has_failed_step: rows.some((b) => BROKEN_STATUSES.has(b.status)),
    provider: clip(provider, 40),
    model: clip(model, 60),
  };

  try {
    /**
     * `ignoreDuplicates` + `.select()`: PostgREST dịch thành `ON CONFLICT DO NOTHING RETURNING`,
     * nên mảng RỖNG chính là tín hiệu "đã có dòng rồi". Nhờ vậy đường đi thường gặp — lượt mới —
     * vẫn đúng MỘT lượt gọi, chỉ ca trùng mới phải đọc thêm.
     */
    const { data, error } = await supabase
      .from(TABLE)
      .upsert(record, { onConflict: 'thread_id,turn_no', ignoreDuplicates: true })
      .select('id');
    if (error) throw error;
    gate.ok();
    if (Array.isArray(data) && data.length) return { ok: true };

    const { data: old, error: readErr } = await supabase
      .from(TABLE)
      .select('id,answer,step_count')
      .eq('thread_id', record.thread_id)
      .eq('turn_no', record.turn_no)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!isMoreComplete(record, old)) return { ok: true, reason: 'kept_existing' };

    const { error: upErr } = await supabase.from(TABLE).update(record).eq('id', old.id);
    if (upErr) throw upErr;
    return { ok: true, reason: 'replaced_partial' };
  } catch (e) {
    gate.fail(e, 'write');
    return { ok: false, reason: 'db_error' };
  }
}

/**
 * Tra nhật ký cho màn hình quản lý.
 * @param {{day?: string, userId?: string, companyId?: string, search?: string, page?: number, perPage?: number}} o
 */
async function queryTurns({ day, userId, companyId, search, page = 0, perPage = 50 } = {}) {
  try {
    const from = Math.max(0, Number(page) || 0) * Math.min(200, Number(perPage) || 50);
    let q = supabase
      .from(TABLE)
      .select('id,created_at,day,user_id,thread_id,turn_no,path,question,answer,steps,step_count,has_failed_step,model,provider',
        { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, from + Math.min(200, Number(perPage) || 50) - 1);

    if (day) q = q.eq('day', day);
    if (userId) q = q.eq('user_id', userId);
    // Lọc theo công ty ở TẦNG TRUY VẤN, không lọc sau khi lấy về: admin của công ty A không
    // được thấy câu hỏi của công ty B, kể cả trong một trang kết quả bị cắt.
    if (companyId) q = q.eq('company_id', companyId);
    if (search) q = q.ilike('question', `%${String(search).slice(0, 100)}%`);

    const { data, error, count } = await q;
    if (error) throw error;
    gate.ok();
    return { ok: true, list: data || [], total: count ?? null };
  } catch (e) {
    gate.fail(e, 'query');
    return { ok: false, reason: String(e?.message || e).slice(0, 200) };
  }
}

function status() {
  return { table: TABLE, ready: !gate.blocked(), writing: isEnabled(), vn_day: vnDay(), ...gate.status() };
}

module.exports = { writeTurn, queryTurns, status, vnDay, TABLE };
