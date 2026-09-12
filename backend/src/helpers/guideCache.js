/**
 * Prompt caching cho Trợ lý hướng dẫn.
 *
 * VẤN ĐỀ ĐO ĐƯỢC TRƯỚC KHI CÓ FILE NÀY: `đọc cache: 0` ở mọi lần gọi. Một lượt hỏi có chuỗi
 * tool tốn 4 lần gọi model, mỗi lần trả lại TOÀN BỘ chỉ dẫn hệ thống (6.519 ký tự) + 7 readable
 * → lượt 2 tốn $0,0413 trong khi lượt 1 chỉ $0,0107 dù câu hỏi ngắn hơn.
 *
 * Cache của Anthropic là CACHE THEO TIỀN TỐ: đổi một byte ở bất kỳ đâu trong tiền tố là mất
 * toàn bộ phần sau. Thứ tự render là `tools` → `system` → `messages`. Nên muốn cache ăn thì mọi
 * thứ BIẾN ĐỘNG phải nằm CÀNG SAU CÀNG TỐT.
 *
 * Và đây là chỗ `BuiltInAgent` phá: nó nhồi TẤT CẢ readable vào system prompt
 * (`parts.push("\n## Context from the application\n")` rồi lặp `input.context`). Trong số đó có
 * "Ngày giờ hiện tại" — đổi mỗi giây — và "Cấu trúc giao diện" — đổi mỗi khi trợ lý bấm một
 * nút. Nghĩa là system prompt KHÔNG BAO GIỜ giống nhau hai lần, kể cả giữa hai lần gọi cách
 * nhau 2 giây trong cùng một lượt. Đặt điểm cắt cache ở đâu cũng vô nghĩa.
 *
 * Cách sửa, hai lớp:
 *
 *  1. `reorderContextForCache` (tầng AG-UI): CHỈ giữ lại trong `input.context` những readable
 *     ỔN ĐỊNH; readable biến động bị chuyển thành một message `user` gắn vào CUỐI danh sách
 *     message. Nhờ vậy system prompt trở lại ổn định, và phần biến động nằm sau cả lịch sử hội
 *     thoại. Message này chỉ tồn tại phía server, client không lưu nên không tích tụ.
 *     (Message `tool` được @ai-sdk/anthropic gom vào cùng block với `user` — đã kiểm trong
 *     `groupIntoBlocks` — nên gắn thêm một message user sau tool result là hợp lệ.)
 *
 *  2. `cacheControlMiddleware` (tầng model, `transformParams`): đặt hai điểm cắt —
 *     một ở message system (cache `tools` + toàn bộ chỉ dẫn + readable ổn định),
 *     một ở message CUỐI CÙNG KHÔNG PHẢI khối ngữ cảnh biến động (cache cả lịch sử hội thoại).
 *     Điểm cắt phải nằm TRƯỚC khối biến động, nếu không mỗi lần gọi lại ghi cache mới mà không
 *     bao giờ đọc được.
 *
 * MẶC ĐỊNH ỔN ĐỊNH LÀ "BIẾN ĐỘNG": readable nào không có trong `STABLE_DESCRIPTIONS` thì bị coi là
 * biến động. Đoán sai theo hướng này chỉ làm cache ăn ít hơn; đoán sai theo hướng kia thì model
 * đọc ngữ cảnh CŨ đã bị cache — sai dữ liệu, và rất khó phát hiện.
 *
 * Tắt bằng `GUIDE_PROMPT_CACHE=0` (mọi giá trị khác, kể cả không đặt, là bật).
 */

const { randomUUID } = require('crypto');

const ENABLED = process.env.GUIDE_PROMPT_CACHE !== '0';

/**
 * Readable ỔN ĐỊNH trong suốt một hội thoại — khớp theo tiền tố của `description` đăng ký ở
 * frontend (AppGuideCopilotPanel.jsx). Khớp tiền tố chứ không khớp tuyệt đối để đổi phần đuôi
 * mô tả không làm mất cache.
 *
 * KHÔNG có trong danh sách này, và có lý do: "Ngày giờ hiện tại" (đổi mỗi giây),
 * "Màn hình người dùng đang xem" (đổi khi điều hướng), "Cấu trúc giao diện" và
 * "Giá trị THẬT của bộ lọc" (đổi mỗi khi trợ lý bấm/điền).
 */
const STABLE_DESCRIPTIONS = [
  'Người dùng đang trò chuyện',
  'Mục lục module của hệ thống',
  'Quyền của bạn',
];

/** Tiêu đề khối ngữ cảnh biến động. Dùng luôn làm dấu nhận biết ở `transformParams`. */
const CONTEXT_BLOCK_MARKER = '## Ngữ cảnh hiện tại (cập nhật mỗi lượt, không cache)';

function isStable(desc) {
  const d = String(desc || '');
  return STABLE_DESCRIPTIONS.some((m) => d.startsWith(m));
}

function renderContextBlock(items) {
  const parts = [CONTEXT_BLOCK_MARKER, ''];
  for (const c of items) {
    parts.push(`${c?.description || '(không mô tả)'}:`);
    parts.push(`${c?.value ?? ''}`);
    parts.push('');
  }
  return parts.join('\n');
}

/**
 * Tách readable biến động khỏi system prompt, đẩy xuống cuối danh sách message.
 * Trả về `input` mới; không sửa `input` gốc.
 */
function reorderContextForCache(input) {
  if (!ENABLED) return input;
  const ctx = Array.isArray(input?.context) ? input.context : [];
  if (ctx.length === 0) return input;

  const stable = ctx.filter((c) => isStable(c?.description));
  const volatile = ctx.filter((c) => !isStable(c?.description));
  if (volatile.length === 0) return input;

  const messages = Array.isArray(input.messages) ? [...input.messages] : [];
  messages.push({
    id: randomUUID(),
    role: 'user',
    content: renderContextBlock(volatile),
  });

  return { ...input, context: stable, messages };
}

/* ─────────────────────────── Tầng model ─────────────────────────── */

const CACHE_BREAKPOINT = { type: 'ephemeral' };

/** Gộp sâu vào providerOptions.anthropic — gán phẳng sẽ xoá mất cấu hình anthropic đã có. */
function withCacheBreakpoint(msg) {
  return {
    ...msg,
    providerOptions: {
      ...(msg.providerOptions || {}),
      anthropic: { ...(msg.providerOptions?.anthropic || {}), cacheControl: CACHE_BREAKPOINT },
    },
  };
}

/** Message này có phải khối ngữ cảnh biến động ta vừa chèn? */
function isContextBlock(msg) {
  if (msg?.role !== 'user') return false;
  const c = msg.content;
  if (typeof c === 'string') return c.startsWith(CONTEXT_BLOCK_MARKER);
  if (Array.isArray(c)) {
    const firstPart = c.find((p) => p?.type === 'text');
    return typeof firstPart?.text === 'string' && firstPart.text.startsWith(CONTEXT_BLOCK_MARKER);
  }
  return false;
}

/**
 * Middleware cho `wrapLanguageModel`. Chỉ đặt `cacheControl`, không sửa nội dung gì —
 * đặt sai thì tốn tiền hoặc mất cache, nhưng không được làm sai câu trả lời.
 */
function cacheControlMiddleware() {
  let warnedMissingSystem = false;

  return {
    transformParams: async ({ params }) => {
      if (!ENABLED) return params;
      const prompt = Array.isArray(params?.prompt) ? params.prompt : null;
      if (!prompt || prompt.length === 0) return params;

      const out = [...prompt];

      // Điểm cắt 1 — hết message system (gồm cả `tools` render trước nó).
      const iSystem = out.findIndex((m) => m?.role === 'system');
      if (iSystem >= 0) {
        out[iSystem] = withCacheBreakpoint(out[iSystem]);
      } else if (!warnedMissingSystem) {
        warnedMissingSystem = true;
        console.warn('[guide] khong thay message system trong prompt — bo diem cat cache 1.');
      }

      // Điểm cắt 2 — cuối lịch sử hội thoại, TRƯỚC khối ngữ cảnh biến động. Đặt vào chính khối
      // biến động thì mỗi lần gọi ghi một cache mới và không lần nào đọc lại được.
      let i = out.length - 1;
      while (i > iSystem && isContextBlock(out[i])) i -= 1;
      if (i > iSystem) out[i] = withCacheBreakpoint(out[i]);

      return { ...params, prompt: out };
    },
  };
}

module.exports = {
  ENABLED,
  CONTEXT_BLOCK_MARKER,
  reorderContextForCache,
  cacheControlMiddleware,
};
