/**
 * Suy ra DÒNG HÀNH ĐỘNG của trợ lý từ danh sách message của agent.
 *
 * Vì sao lấy từ `agent.messages` chứ không bám vào các callback tool phía client
 * (`onToolExecutionStart/End` của CopilotKitCore): hai callback đó CHỈ bắn cho tool chạy ở
 * client. `search_knowledge_base` chạy trên backend nên sẽ không bao giờ xuất hiện — mất đúng cái
 * hành động quan trọng nhất. Trong `messages` thì mọi tool call đều có mặt: assistant mang
 * `toolCalls`, kết quả nằm ở message `role: 'tool'` khớp `toolCallId`.
 *
 * Hàm này thuần (pure) và không phụ thuộc React để test/đọc lại dễ.
 */

import { TOOL_META, HUMAN_CONFIRM_TOOLS } from './toolRegistry';

// Icon, nhãn và tập tool cần xác nhận đều lấy từ SỔ ĐĂNG KÝ (lib/toolRegistry.js) — bảng này
// trước đây khai tay ở đây, còn linh thú khai một bảng khác, và hai bảng đã trôi khỏi nhau.

function parseJson(value) {
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function clip(text, max = 60) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Mô tả ngắn tham số tool để hiện dưới nhãn. */
function describeArgs(toolName, args) {
  if (!args || typeof args !== 'object') return '';
  if (toolName === 'search_knowledge_base') return args.question ? `“${clip(args.question, 44)}”` : '';
  if (toolName === 'highlight_button') return args.label ? `“${clip(args.label, 32)}”` : '';
  if (toolName === 'navigate_to_page') return args.path ? clip(args.path, 40) : '';
  if (toolName === 'read_screen_metrics') return '';
  if (toolName === 'click_element') return args.label ? `“${clip(args.label, 32)}”` : '';
  if (toolName === 'fill_field') return args.label ? `${clip(args.label, 22)} = ${clip(args.value, 22) || '(trống)'}` : '';
  if (toolName === 'read_page_state') return '';
  if (toolName === 'find_on_page') return args.keyword ? `“${clip(args.keyword, 30)}”` : '';
  if (toolName === 'highlight_region') return args.region ? `“${clip(args.region, 30)}”` : '';
  if (toolName === 'read_region') return args.region ? `“${clip(args.region, 30)}”` : '';
  if (toolName === 'open_page_tour') return args.keyword ? `“${clip(args.keyword, 30)}”` : '';
  if (toolName === 'save_experience') return args.task ? `“${clip(args.task, 34)}”` : '';
  if (toolName === 'discard_experience') return args.code ? `[${clip(args.code, 10)}]` : '';
  const keys = Object.keys(args);
  return keys.length ? clip(keys.map((k) => `${k}=${args[k]}`).join(', '), 48) : '';
}

/**
 * Đọc kết quả tool → { status, note }.
 * Chuỗi bắt đầu bằng "Error:" là do thư viện tự chèn khi handler ném lỗi (xem `guardTool`).
 */
function describeResult(toolName, rawResult) {
  const raw = typeof rawResult === 'string' ? rawResult : '';
  if (raw.startsWith('Error:')) return { status: 'failed', note: clip(raw.slice(6), 50) || 'lỗi thao tác' };

  const parsed = parseJson(raw);
  if (!parsed || typeof parsed !== 'object') {
    return { status: 'done', note: clip(raw, 50) };
  }
  if (parsed.reason === 'tool_error' || parsed.reason === 'tool_not_found') {
    return { status: 'failed', note: clip(parsed.loi || parsed.note || 'lỗi thao tác', 50) };
  }

  if (toolName === 'search_knowledge_base') {
    const n = Array.isArray(parsed.results) ? parsed.results.length : 0;
    return { status: 'done', note: n ? `${n} màn hình khớp` : 'không tìm thấy' };
  }
  if (toolName === 'read_screen_metrics') {
    const n = Array.isArray(parsed.metrics) ? parsed.metrics.length : 0;
    return n
      ? { status: 'done', note: `đọc được ${n} chỉ số` }
      : { status: 'empty', note: 'không đọc được chỉ số nào' };
  }
  if (toolName === 'highlight_button') {
    if (parsed.ok) return { status: 'done', note: 'đã làm sáng nút' };
    return { status: 'empty', note: 'không thấy nút đang hiển thị' };
  }
  if (toolName === 'navigate_to_page') {
    if (parsed.ok) return { status: 'done', note: `đã chuyển tới ${clip(parsed.path, 34)}` };
    if (parsed.reason === 'user_declined') return { status: 'cancelled', note: 'bạn đã từ chối' };
    if (parsed.reason === 'path_not_found') return { status: 'failed', note: 'đường dẫn không tồn tại' };
    return { status: 'cancelled', note: 'không điều hướng' };
  }
  if (toolName === 'click_element') {
    if (parsed.ok) return { status: 'done', note: `đã bấm “${clip(parsed.clicked, 30)}”` };
    if (parsed.reason === 'button_locked') return { status: 'empty', note: 'nút đang bị khoá' };
    return { status: 'empty', note: 'không thấy nút đó' };
  }
  if (toolName === 'fill_field') {
    if (parsed.ok) {
      const set = parsed.selected || parsed.entered || parsed.set_to || '';
      return { status: 'done', note: set ? `đã đặt “${clip(set, 30)}”` : 'đã xoá trắng' };
    }
    if (parsed.reason === 'no_matching_option') return { status: 'empty', note: 'không có lựa chọn khớp' };
    if (parsed.reason === 'field_locked') return { status: 'empty', note: 'trường bị khoá' };
    return { status: 'empty', note: 'không thấy trường đó' };
  }
  if (toolName === 'find_on_page') {
    const n = Array.isArray(parsed.results) ? parsed.results.length : 0;
    return n
      ? { status: 'done', note: `${n} kết quả khớp` }
      : { status: 'empty', note: 'không thấy trên trang đang hiển thị' };
  }
  if (toolName === 'read_page_state') {
    const n = Array.isArray(parsed.fields_and_filters) ? parsed.fields_and_filters.length : 0;
    const rows = parsed.table?.rows_read || 0;
    if (!n && !rows) return { status: 'empty', note: 'không đọc được gì' };
    return { status: 'done', note: `${n} trường${rows ? `, bảng ${rows} dòng` : ''}` };
  }
  return { status: 'done', note: clip(raw, 50) };
}

/**
 * @param {Array} messages  `agent.messages`
 * @param {boolean} isRunning  agent đang chạy lượt nào đó
 * @param {{fullAccess?: boolean}} opts  fullAccess=true thì không tool nào chờ người xác nhận
 * @returns {Array<{key,type,icon,label,detail,note,status}>} theo thứ tự thời gian
 */
export function deriveAgentActions(messages, isRunning = false, { fullAccess = false } = {}) {
  const list = Array.isArray(messages) ? messages : [];

  // Mỗi dòng mang thêm `raw`: DỮ LIỆU THÔ ĐẦY ĐỦ, không cắt ngắn, để mở ra xem trong bảng.
  // Phải tách khỏi `detail`/`note` (bản cắt ngắn hiện trên dòng hẹp) — trước đây chỉ có bản
  // cắt nên muốn biết tool nhận đúng tham số gì thì phải mở DevTools.

  // Gom kết quả theo toolCallId trước: kết quả LUÔN nằm sau tool call, nhưng quét trước cho
  // gọn và để không phụ thuộc khoảng cách giữa hai message.
  const resultByCallId = new Map();
  for (const m of list) {
    if (m?.role === 'tool' && m.toolCallId) resultByCallId.set(String(m.toolCallId), m.content);
  }

  const out = [];
  let turn = 0;
  for (const m of list) {
    if (!m || typeof m !== 'object') continue;

    if (m.role === 'user') {
      turn += 1;
      out.push({
        key: `u-${m.id || turn}`,
        type: 'turn',
        turn,
        icon: '›',
        label: `Lượt ${turn}`,
        detail: clip(m.content, 52),
        note: '',
        status: 'turn',
        raw: { turn: turn, message_id: m.id || null, question: String(m.content ?? '') },
      });
      continue;
    }

    if (m.role === 'reasoning') {
      const text = String(m.content || '');
      out.push({
        key: `r-${m.id || out.length}`,
        type: 'reasoning',
        turn,
        icon: '💭',
        label: 'Suy luận',
        detail: text.length ? `${text.length.toLocaleString('vi-VN')} ký tự` : '',
        note: '',
        status: 'muted',
        raw: { message_id: m.id || null, char_count: text.length, reasoning: text },
      });
      continue;
    }

    // Câu trả lời bằng chữ — trước đây KHÔNG hiện trong bảng, nên khi trợ lý trả lời sai không
    // đối chiếu được câu trả lời với chuỗi tool đã chạy ngay trên cùng một dòng thời gian.
    if (m.role === 'assistant' && typeof m.content === 'string' && m.content.trim()) {
      const text = m.content.trim();
      out.push({
        key: `a-${m.id || out.length}`,
        type: 'answer',
        turn,
        icon: '💬',
        label: 'Trả lời',
        detail: clip(text, 52),
        note: '',
        status: 'muted',
        raw: { message_id: m.id || null, char_count: text.length, answer: text },
      });
    }

    if (m.role === 'assistant' && Array.isArray(m.toolCalls) && m.toolCalls.length) {
      for (const call of m.toolCalls) {
        const name = call?.function?.name || 'tool';
        const meta = TOOL_META[name] || { icon: '🔧', label: name };
        const args = parseJson(call?.function?.arguments) || {};
        const callId = call?.id ? String(call.id) : '';
        const hasResult = callId && resultByCallId.has(callId);

        let status;
        let note;
        if (hasResult) {
          ({ status, note } = describeResult(name, resultByCallId.get(callId)));
        } else if (!fullAccess && HUMAN_CONFIRM_TOOLS.has(name)) {
          status = 'waiting';
          note = 'đang chờ bạn xác nhận';
        } else {
          status = 'running';
          note = 'đang chạy…';
        }

        const rawResult = hasResult ? resultByCallId.get(callId) : null;
        out.push({
          key: `t-${callId || `${out.length}-${name}`}`,
          type: 'tool',
          turn,
          icon: meta.icon,
          label: meta.label,
          detail: describeArgs(name, args),
          note,
          status,
          raw: {
            tool_name: name,
            tool_call_id: callId || null,
            // Giữ CẢ chuỗi gốc lẫn bản đã parse: khi model sinh JSON hỏng thì `args` rỗng
            // mà `raw_args` mới cho thấy nó gửi cái gì — đúng ca cần soi nhất.
            args: args,
            raw_args: call?.function?.arguments ?? null,
            results: parseJson(rawResult) ?? rawResult,
            raw_result: rawResult,
          },
        });
      }
    }
  }

  // Lượt đang chạy mà chưa gọi tool nào → vẫn cho thấy trợ lý đang làm việc.
  const last = out[out.length - 1];
  if (isRunning && (!last || last.status !== 'running')) {
    out.push({
      key: 'running-tail',
      type: 'pending',
      icon: '⏳',
      label: 'Đang xử lý',
      detail: '',
      note: '',
      status: 'running',
    });
  }

  return out;
}

/** Đếm số hành động THẬT (bỏ dòng phân lượt và dòng suy luận) — dùng cho badge. */
export function countRealActions(actions) {
  return (actions || []).filter((a) => a.type === 'tool').length;
}
