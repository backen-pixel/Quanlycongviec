/**
 * NHẬN DIỆN LỜI CHÀO — để trợ lý trả lời ngay, không nghĩ, không gọi tool.
 *
 * ═══════════════ VẤN ĐỀ ═══════════════
 *
 * "hi" là một lượt hỏi đầy đủ với hệ thống: model đọc trọn prompt 17,4k, có thể nghĩ, có thể gọi
 * `search_knowledge_base` để xem "hi" là màn hình nào. Đo được trong nhật ký: lượt chào hỏi vẫn
 * tốn vài giây và đôi khi tốn cả một bước tool, để trả về đúng một câu "Chào bạn".
 *
 * ═══════════════ CHẶN Ở ĐÂU ═══════════════
 *
 * Không chặn ở máy chủ bằng câu trả lời soạn sẵn. Hai lý do:
 *
 *  1. Câu chào soạn cứng thì lần nào cũng y hệt, và lộ ra ngay là máy. Model viết thì nó chào
 *     hợp với nhân vật đang dùng, hợp với màn hình đang mở.
 *  2. Đường trả lời là luồng SSE do runtime dựng. Tự dựng một luồng giả ở giữa là chép lại phần
 *     dễ hỏng nhất của thư viện, để tiết kiệm một lời gọi model rẻ nhất trong ngày.
 *
 * Nên chỗ chặn là TẦNG MODEL: vẫn để model viết câu chào, nhưng gỡ tool và gỡ suy luận. Nó chỉ
 * còn một việc duy nhất là viết một câu.
 *
 * ═══════════════ CHỈ KHI CẢ CÂU LÀ LỜI CHÀO ═══════════════
 *
 * Đây là chỗ dễ làm hỏng nhất. "chào bạn, cho mình hỏi cách lọc deal" CÓ chứa lời chào nhưng là
 * một câu hỏi thật — gỡ tool của nó là trợ lý mất khả năng làm việc đúng lúc người ta cần.
 *
 * Nên phép thử không phải "có chứa từ chào" mà là "bỏ hết từ chào đi thì còn lại gì không". Còn
 * chữ có nghĩa thì đó là câu hỏi thật, để nguyên.
 */

/** Bỏ dấu, thường hoá, bỏ mọi thứ không phải chữ và số. */
function fold(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Cụm chào NHIỀU TỪ — phải thay trước khi tách từ, vì bỏ từng từ một sẽ hụt.
 * "chào buổi sáng" bỏ lẻ thành `chao` + `buoi` + `sang`, mà `buoi`/`sang` không nằm trong danh
 * sách từ đơn nên câu bị coi là còn nội dung.
 */
const CUM = [
  'chao buoi sang', 'chao buoi trua', 'chao buoi chieu', 'chao buoi toi',
  'good morning', 'good afternoon', 'good evening', 'good night',
  'xin chao', 'he lo', 'hê lô', 'a lo',
  'tam biet', 'hen gap lai', 'cam on', 'cam on ban', 'thank you',
];

/** Từ đơn mang nghĩa chào / tạm biệt / cảm ơn — bỏ hết thì câu coi như rỗng nội dung. */
const TU = new Set([
  // chào
  'hi', 'hey', 'helo', 'hello', 'hallo', 'halo', 'alo', 'chao', 'yo', 'hola',
  // tạm biệt
  'bye', 'byebye', 'goodbye', 'tambiet', 'biet',
  // cảm ơn
  'thanks', 'thank', 'thx', 'tks', 'cam', 'on', 'camon',
  // đại từ và tiểu từ hay đi kèm lời chào, không mang nội dung
  'ban', 'em', 'anh', 'chi', 'oi', 'nhe', 'nha', 'a', 'ak', 'ah', 'ui', 'voi',
  'minh', 'toi', 'ad', 'shop', 'bot', 'tro', 'ly', 'trolly',
  'sang', 'trua', 'chieu', 'toi2', 'buoi',
  'morning', 'you', 'u', 'there', 'good',
]);

/** Dài hơn ngần này thì gần như chắc chắn không phải lời chào thuần. Cắt sớm cho rẻ. */
const MAX_CHARS = 60;

/**
 * Câu này có phải LỜI CHÀO THUẦN không — tức bỏ hết từ chào đi thì không còn nội dung nào.
 *
 * @param {string} text nguyên văn người dùng gõ
 * @returns {boolean}
 */
function isGreeting(text) {
  const raw = String(text || '').trim();
  if (!raw || raw.length > MAX_CHARS) return false;

  let s = fold(raw);
  if (!s) return false;

  for (const c of CUM) {
    const cf = fold(c);
    if (cf) s = s.split(cf).join(' ');
  }

  const conLai = s.split(/\s+/).filter((t) => t && !TU.has(t));

  /**
   * Số cũng bị coi là nội dung — "chào ngày 22" là một câu hỏi về ngày 22, không phải lời chào.
   * Nhưng phải có ÍT NHẤT một từ chào thật, kẻo một câu rỗng nghĩa bất kỳ cũng lọt vào đây.
   */
  if (conLai.length) return false;
  return s.split(/\s+/).some((t) => TU.has(t)) || CUM.some((c) => fold(raw).includes(fold(c)));
}

/**
 * Lời nhắc chèn cho lượt chào hỏi. NGẮN có chủ ý: prompt hệ thống đã dạy trợ lý là ai, ở đây chỉ
 * cần nói "đừng làm gì thêm".
 */
const LOI_NHAC = [
  'Người dùng vừa chào hỏi, không hỏi việc gì.',
  '',
  'Chào lại MỘT hoặc HAI câu, đúng giọng nhân vật đang dùng. Có thể mời họ hỏi việc.',
  'ĐỪNG tra cứu, ĐỪNG đọc màn hình, ĐỪNG liệt kê tính năng, ĐỪNG hỏi lại dồn dập.',
].join('\n');

module.exports = { isGreeting, LOI_NHAC };
