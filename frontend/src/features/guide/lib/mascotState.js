/**
 * Suy ra NHÂN VẬT ĐANG LÀM GÌ từ luồng message của agent.
 *
 * Không dựng nguồn trạng thái riêng: bảng "Hành động của trợ lý" đã đọc đúng luồng này rồi
 * (xem lib/agentActions.js). Thêm một nguồn thứ hai là hai chỗ sẽ lệch nhau, và người dùng sẽ
 * thấy nhân vật nói một đằng bảng ghi một nẻo.
 *
 * NĂM TRẠNG THÁI, theo thứ tự ưu tiên khi nhiều thứ cùng đúng:
 *
 *   pointing   — đang có vòng sáng trỏ vào một nút. Ưu tiên CAO NHẤT: lúc này việc của nhân vật
 *               là đứng cạnh nút đó, mọi thứ khác đợi.
 *   working  — vừa gọi một tool và chưa có kết quả.
 *   thinking  — đang sinh khối suy luận.
 *   answering   — đang phát câu trả lời bằng chữ.
 *   idle      — không chạy gì.
 *
 * Câu trong bong bóng cố tình NGẮN. Bong bóng không phải chỗ đọc câu trả lời — khung chat bên
 * phải mới là chỗ đó. Ở đây chỉ cần người dùng liếc một cái là biết trợ lý đang bận gì.
 */

import { LINE_BY_TOOL } from './toolRegistry';

// Câu thoại theo tool lấy từ SỔ ĐĂNG KÝ (lib/toolRegistry.js) — bảng này trước đây khai tay ở
// đây và THIẾU ba tool (`highlight_region`, `save_experience`, `discard_experience`), nên linh
// thú im re đúng lúc nó đang khoanh sáng một khu vực.

const DEFAULT_LINES = {
  idle: '',
  thinking: 'Để ta nghĩ đã…',
  working: 'Đang làm…',
  pointing: 'Ở đây!',
  answering: '',
  done: 'Xong rồi!',
};

/**
 * `done` chỉ sống một nhịp ngắn ngay sau khi lượt chạy kết thúc, rồi về `idle`.
 *
 * Không phải để trang trí: chuyển thẳng từ "đang trả lời" sang "đứng im ở góc" thì người dùng
 * không có tín hiệu nào cho biết trợ lý đã nói xong hay còn đang nghĩ tiếp — nhất là khi câu trả
 * lời ngắn và họ đang nhìn chỗ khác trên màn hình.
 */
export const DONE_MS = 2200;

/** Message cuối cùng có ý nghĩa — bỏ qua khối rỗng do stream chưa kịp có nội dung. */
function lastMessage(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (!m || typeof m !== 'object') continue;
    return m;
  }
  return null;
}

/**
 * @param {object|null} agent      giá trị `agent` từ `useAgent()`
 * @param {boolean} dangChiTro     có vòng sáng đang trỏ vào phần tử nào không
 * @param {boolean} vuaXong        lượt vừa kết thúc trong vòng XONG_MS
 * @returns {{state: string, line: string}}
 */
/**
 * Đếm số BƯỚC đã chạy trong lượt hiện tại = số message assistant có gọi tool, tính từ câu hỏi
 * gần nhất của người dùng.
 *
 * Có con số này thì chuỗi dài mới đọc được. Trước đây một yêu cầu 6 bước chỉ hiện đúng hai câu
 * thay nhau — "Đang làm…" rồi "Để ta nghĩ đã…" rồi lại "Đang làm…" — nhìn như treo, không ai
 * biết nó đang tiến hay đang quẩn.
 */
function countSteps(messages) {
  let n = 0;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m?.role === 'user') break;
    if (m?.role === 'assistant' && Array.isArray(m.toolCalls) && m.toolCalls.length) n += 1;
  }
  return n;
}

/** "Bước 3 · Đang xem cả màn hình…" — bước 1 thì bỏ số cho đỡ rườm. */
function withStepCount(n, text) {
  return n > 1 ? `Bước ${n} · ${text}` : text;
}

export function deriveMascotState(agent, isPointing = false, justFinished = false) {
  // Ưu tiên tuyệt đối: đang trỏ thì đứng yên mà trỏ, kể cả khi model đã chạy tiếp việc khác.
  // Nếu không, nhân vật sẽ rời khỏi nút ngay lúc người dùng vừa ngước lên nhìn.
  if (isPointing) return { state: 'pointing', line: DEFAULT_LINES.pointing };

  const running = !!agent?.isRunning;
  if (!running) {
    // `justFinished` do component truyền vào (nó giữ đồng hồ), không tự đo ở đây: hàm này là hàm
    // thuần, đo thời gian trong hàm thuần thì không test lại được.
    return justFinished
      ? { state: 'done', line: DEFAULT_LINES.done }
      : { state: 'idle', line: '' };
  }

  const messages = Array.isArray(agent?.messages) ? agent.messages : [];
  const last = lastMessage(messages);
  if (!last) return { state: 'thinking', line: DEFAULT_LINES.thinking };

  const steps = countSteps(messages);

  // Tool đã gọi mà chưa có message `tool` trả kết quả → vẫn đang chạy tool đó.
  if (Array.isArray(last.toolCalls) && last.toolCalls.length) {
    const toolName = last.toolCalls[last.toolCalls.length - 1]?.function?.name
      || last.toolCalls[last.toolCalls.length - 1]?.name
      || '';
    return {
      state: 'working',
      line: withStepCount(steps, LINE_BY_TOOL[toolName] || DEFAULT_LINES.working),
    };
  }

  /**
   * Kết quả tool vừa về, lượt chưa xong → model đang quyết định bước kế.
   *
   * KHÔNG nói lại "Để ta nghĩ đã…" ở đây. Trong một chuỗi dài, nhịp này lặp lại sau MỖI tool,
   * nên dùng chung câu với lúc mới bắt đầu là biến bong bóng thành cái đèn nháy hai trạng thái.
   * Nói rõ vừa xong bước mấy thì người dùng thấy được tiến độ.
   */
  if (last.role === 'tool') {
    return {
      state: 'thinking',
      line: steps > 0 ? `Xong bước ${steps}, tính tiếp…` : DEFAULT_LINES.thinking,
    };
  }

  if (last.role === 'reasoning') {
    return {
      state: 'thinking',
      line: steps > 0 ? 'Đang tính tiếp…' : DEFAULT_LINES.thinking,
    };
  }

  if (last.role === 'assistant' && String(last.content || '').trim()) {
    return { state: 'answering', line: '' };
  }

  return { state: 'thinking', line: DEFAULT_LINES.thinking };
}

/* ─────────────────────────── Câu trả lời cho bong bóng ─────────────────────────── */

/**
 * KHÔNG CẮT CÂU TRẢ LỜI NỮA.
 *
 * Trước đây cắt ở 420 ký tự kèm dòng "… đọc tiếp trong khung chat". Lý do khi đó: bong bóng
 * `pointer-events: none` nên không cuộn được, mà cho nó nhận chuột thì nhân vật — vốn đi khắp
 * màn hình — sẽ có lúc chắn đúng nút người dùng định bấm.
 *
 * Đổi ý vì cái giá thật lớn hơn: khung chat MẶC ĐỊNH ĐÓNG, nên "đọc tiếp trong khung chat"
 * không phải một lời mời mà là một ngõ cụt — người dùng vừa hỏi xong đã phải đi tìm chỗ mở
 * khung chat để đọc nốt câu trả lời của chính mình. Đã thấy trên câu hỏi về deadline: bong bóng
 * đứt ngay giữa danh sách các bước, ở đúng bước 3.
 *
 * Nay bong bóng có `max-height` + cuộn, và chỉ RIÊNG nó nhận chuột (xem `--dai` trong
 * appGuideCopilot.css) — thân nhân vật vẫn trong suốt với chuột như cũ.
 */

/**
 * Bỏ cú pháp markdown mà bong bóng không dựng được. GIỮ xuống dòng và gạch đầu dòng — đó chính
 * là thứ làm một câu trả lời nhiều ý đọc được trong bong bóng.
 */
function stripMarkdown(s) {
  return String(s || '')
    .replace(/```[\s\S]*?```/g, '[khối mã — xem khung chat]')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|\s)\*([^*\n]+)\*/g, '$1$2')
    /**
     * Dọn dấu nhấn CÒN DANG DỞ. Hai luật trên chỉ bóc được cặp đã đóng, mà bong bóng hiện chữ
     * ngay lúc đang chảy về — nên có khoảnh khắc văn bản là `**Tab Ghi âm` chưa kịp có `**` đóng.
     * Đã thấy thật: bong bóng hiện "…ở **" ở mốc 13,4 giây. Bóc nốt phần lẻ.
     */
    .replace(/\*\*/g, '')
    .replace(/(^|\s)\*(?=\S)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Nội dung message có thể là chuỗi, hoặc mảng khối khi bật suy luận. */
function textOfMessage(m) {
  const c = m?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c.filter((p) => p?.type === 'text' || typeof p?.text === 'string')
      .map((p) => p.text || '').join('');
  }
  return '';
}

/**
 * Câu trả lời MỚI NHẤT của trợ lý, đã dọn để hiện trong bong bóng.
 * @returns {{text: string}|null}
 */
export function latestAnswer(agent) {
  const messages = Array.isArray(agent?.messages) ? agent.messages : [];

  /**
   * CHỈ tìm trong LƯỢT HIỆN TẠI — tức phần sau câu hỏi mới nhất của người dùng.
   *
   * Không có ranh giới này thì lỗi rất khó chịu và rất dễ tin nhầm: người dùng gửi câu hỏi mới,
   * trợ lý bắt đầu suy nghĩ, nhưng lượt mới CHƯA có chữ nào — nên phép quét ngược đi tiếp về quá
   * khứ và móc ra câu trả lời của lượt TRƯỚC. Bong bóng hiện lại y nguyên câu cũ, trông hệt như
   * trợ lý vừa trả lời câu mới. Đây là kiểu sai tệ nhất: không báo lỗi, mà nói sai một cách
   * thuyết phục.
   *
   * Quét từ cuối, dừng hẳn khi chạm message `user` — biên của lượt.
   */
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m?.role === 'user') return null; // hết lượt hiện tại, không lấn sang lượt cũ
    if (m?.role !== 'assistant') continue;
    /**
     * KHÔNG bỏ qua message có `toolCalls`.
     *
     * Bản đầu bỏ qua, với lý do "message chỉ chứa lời gọi tool thì không phải câu trả lời" — sai,
     * vì một message assistant có thể mang ĐỒNG THỜI chữ trả lời và lời gọi tool. Đã tái hiện:
     * hỏi một câu khiến trợ lý vừa trả lời vừa điều hướng, chữ nằm chung message với lời gọi
     * `navigate_to_page`, thế là bong bóng trống trơn trong khi khung chat có đủ câu trả lời.
     *
     * `agentActions.js` — bảng hành động, chạy đúng từ lâu — xử lý hai thứ này bằng HAI câu `if`
     * độc lập chứ không phải if/else. Ở đây làm y như vậy: chỉ cần có chữ là lấy.
     */
    const text = stripMarkdown(textOfMessage(m));
    if (!text) continue;
    return { text };
  }
  return null;
}
