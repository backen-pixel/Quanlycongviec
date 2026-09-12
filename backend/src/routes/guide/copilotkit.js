/**
 * Route runtime của Trợ lý hướng dẫn (CopilotKit v2 — BuiltInAgent + defineTool).
 *
 * Xem docs/guide-assistant-current.md §11 cho danh sách bẫy đã trả giá ở phiên bản trước —
 * TẤT CẢ đều được xử lý trong file này, đánh số lại để tiện đối chiếu:
 *
 *  1. require('reflect-metadata') TRƯỚC require('@copilotkit/runtime') — thiếu dòng này
 *     runtime ném lỗi decorator ngay lúc require.
 *  2. Client Anthropic đắt → cache module-level. BuiltInAgent rẻ → dựng MỖI REQUEST, vì tool
 *     cần `req.user` để lọc quyền — cache cả agent thì action vĩnh viễn không thấy user nào.
 *  3. Quyền lấy từ JWT đã verify (`req.user`, gắn bởi middleware `auth`), KHÔNG lấy từ context
 *     do client gửi lên — trường đó người dùng sửa được.
 *  4. Express cắt mount path khi route mount ở `/api/copilotkit` — `req.url` bên trong handler
 *     chỉ còn "/", runtime so khớp với `endpoint` cấu hình nên trả 404. Trả lại URL đầy đủ.
 *  5. Handler là async — try/catch đồng bộ không bắt được promise reject. Bắt cả hai đường.
 *  6. KHÔNG bypass express.json() cho đường dẫn này (server.js áp middleware JSON toàn cục —
 *     xem ghi chú ở đó cho lý do request nhỏ vẫn cần đi qua middleware trước khi tới đây).
 *  7. maxSteps mặc định của BuiltInAgent thấp — không đặt tường minh thì model gọi
 *     `search_knowledge_base` xong "im luôn", không sinh câu trả lời tiếp theo.
 *  8. Chỉ dẫn hệ thống PHẢI đặt ở `BuiltInAgent({ prompt })` — prop `instructions` của
 *     CopilotChat/CopilotPopup không tới model (xem helpers/guidePrompt.js).
 *  9. messageId của câu trả lời KHÔNG duy nhất khi bật suy luận → từ câu trả lời thứ hai trong
 *     một hội thoại, client bỏ luôn câu trả lời, người dùng chỉ thấy khung 💭. Xem
 *     `stableMessageIdMiddleware` bên dưới.
 *
 * Buffering SSE (đệm khiến câu trả lời tới trình duyệt một cục lúc cuối) được xử lý ở
 * server.js (gzip filter theo content-type) + header set ngay dưới đây (proxy + Nagle).
 *
 * TÊN TOOL — trợ lý có 13 tool, chia hai phía và KHÔNG chia sẻ được hằng (khác package):
 *   · 3 tool ở đây (`search_knowledge_base`, `save_experience`, `discard_experience`);
 *   · 10 tool phía client, khai trong `frontend/src/features/guide/lib/toolRegistry.js` — sổ
 *     đăng ký đó cũng giữ nhãn/icon/thoại cho CẢ BA tool backend, vì bảng "Hành động" và linh
 *     thú đều phải hiện chúng.
 * Đổi tên một tool backend ⇒ sửa `toolRegistry.js` + phần nhắc tên trong helpers/guidePrompt.js.
 *
 * TÊN THAM SỐ tool: tiếng Việt không dấu, snake_case (`question`, `path`, `reason`…). Chữ
 * `reason` được GIỮ RIÊNG cho mã lỗi ở giá trị TRẢ VỀ, đừng dùng làm tên tham số.
 */
require('reflect-metadata');

const { randomUUID } = require('crypto');
const { Router } = require('express');
const { from, map, switchMap, tap } = require('rxjs');
const { wrapLanguageModel, generateText } = require('ai');
const { createAnthropic } = require('@ai-sdk/anthropic');
const { CopilotRuntime, copilotRuntimeNodeExpressEndpoint } = require('@copilotkit/runtime');
const { BuiltInAgent, defineTool } = require('@copilotkit/runtime/v2');
const { z } = require('zod');
const Anthropic = require('@anthropic-ai/sdk');
const { auth } = require('../../middleware/auth');
const { isAdminLike } = require('../../helpers/adminRole');
const { searchKnowledge } = require('../../helpers/guideKnowledge');
const { SYSTEM_PROMPT, buildPrompt } = require('../../helpers/guidePrompt');
const { createCollector, createUsageMiddleware, readUsage, listThreads } = require('../../helpers/guideUsage');
const { reorderContextForCache, cacheControlMiddleware, ENABLED: CACHE_BAT, CONTEXT_BLOCK_MARKER } = require('../../helpers/guideCache');
const experience = require('../../helpers/guideExperience');
const stepGuard = require('../../helpers/guideStepGuard');
const flowLog = require('../../helpers/guideFlow');
const intent = require('../../helpers/guideIntent');
const librarian = require('../../helpers/guideLearn');
const quota = require('../../helpers/guideQuota');
const chatLog = require('../../helpers/guideChatLog');
const userUsage = require('../../helpers/guideUserUsage');
const settings = require('../../helpers/guideSettings');
const knowledge = require('../../helpers/guideKnowledge');
const knowledgeDb = require('../../helpers/guideKnowledgeDb');

const r = Router();
const ENDPOINT = '/api/copilotkit';
/**
 * ═══════════ NHÀ CUNG CẤP & MODEL — ĐỌC TẠI THỜI ĐIỂM DÙNG, KHÔNG PHẢI HẰNG ═══════════
 *
 * Trước đây đây là `const MODEL = process.env.ANTHROPIC_MODEL`, tính đúng MỘT LẦN lúc nạp
 * module. Từ khi model chọn được trên giao diện thì mọi hằng kiểu đó là BUG IM LẶNG: người dùng
 * đổi model, màn hình báo đã lưu, nhưng request vẫn đi theo model cũ cho tới lần khởi động lại.
 * Tệ hơn với `MODEL_ADAPTIVE` — nó quyết định gửi `thinking.adaptive` hay `thinking.enabled`,
 * nên tính sai là API trả 400 và lỗi nằm tận trong nhaCungCap, rất khó lần.
 *
 * Agent vốn đã dựng lại mỗi request (bẫy 2 bên dưới) nên gọi hàm không tốn gì.
 */
const provider = () => settings.get('provider');
const modelId = () => settings.get('model');
const isAnthropic = () => provider() === 'anthropic';

/**
 * MỖI NHÀ CUNG CẤP DÙNG KEY CỦA CHÍNH NÓ. Tuyệt đối không cho mượn key của bên kia khi thiếu:
 * đã trả giá một lần ở tính năng khác — nhaCungCap thiếu key riêng được cho mượn key OpenAI, API
 * trả 401, lỗi bị framework nuốt, người dùng chỉ thấy trợ lý im lặng và không có gì trong log để
 * lần ra. Thiếu key thì chặn ngay ở cổng vào và nói đúng tên biến còn thiếu.
 */
/**
 * `api_kind` — chi tiết nhỏ mà sai là hỏng hẳn: `@ai-sdk/openai` MẶC ĐỊNH dựng
 * `OpenAIResponsesLanguageModel`, tức gọi `POST /v1/responses`. OpenAI thật có endpoint đó;
 * một proxy chỉ khai `openai-completions` thì KHÔNG, và request rơi vào 404 mà thông báo lỗi
 * không hề nhắc gì tới chuyện sai endpoint. Với chúng thì phải đi nhánh `.chat()`.
 *
 * `default_url` cắm sẵn để không bắt người ta khai thêm một biến môi trường nữa; vẫn cho phép
 * đè bằng `env_url` nếu proxy đổi địa chỉ.
 */
const PROVIDERS = {
  anthropic: {
    env_key: 'ANTHROPIC_API_KEY',
    env_url: 'ANTHROPIC_BASE_URL',
  },
  openai: {
    env_key: 'OPENAI_API_KEY',
    env_url: 'OPENAI_BASE_URL',
    api_kind: 'responses',
  },
  'token-codex': {
    env_key: 'CUSTOME_PROVIDER_API_KEY',
    env_url: 'TOKEN_CODEX_BASE_URL',
    default_url: 'https://codex.anhlaptrinh.vn/v1',
    /**
     * `responses`, KHÔNG phải `chat`, dù cấu hình của proxy khai `"api": "openai-completions"`.
     *
     * Đã đo cả hai nhánh trên chính endpoint này:
     *   .chat()      không trả chữ suy luận → khung chat mất hẳn khối 💭
     *   .responses() có chữ suy luận, gọi tool đúng ở 4/4 model, và nhanh hơn
     *
     * Chọn theo chữ khai thì đúng tài liệu nhưng mất một nửa trải nghiệm; chọn theo số đo thì
     * được cả hai. Đổi lại `chat` bằng cách sửa đúng dòng này nếu proxy bỏ `/v1/responses`.
     */
    api_kind: 'responses',
  },
};

const keyEnvVar = () => PROVIDERS[provider()]?.env_key || PROVIDERS.anthropic.env_key;
const apiKey = () => process.env[keyEnvVar()];

/** Model Anthropic dùng khi phải rơi về dự phòng (xem `buildModel`). */
const ANTHROPIC_FALLBACK = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
// 12, không phải 6: ở chế độ toàn quyền một yêu cầu đời thường đã tốn 5–6 bước. Đã đo trên
// /crm/dashboard với "đổi bộ lọc sang công ty Metalla": fill_field (trượt, ô nằm trong panel
// đang đóng) → read_page_state → click_element "Bộ lọc" → fill_field → read_page_state → trả lời. Đặt sát mép
// thì model hết bước giữa chuỗi và im, đúng cái triệu chứng "chỉ suy luận rồi không trả lời".
/** Đọc tại thời điểm dựng agent (mỗi request một lần) nên chỉnh xong là lượt sau đã theo số mới. */
const maxSteps = () => settings.get('max_steps');

/**
 * SUY LUẬN — hai kiểu, LOẠI TRỪ NHAU, chọn theo model. Gửi nhầm kiểu là hỏng cả trợ lý.
 *
 * Đã gọi API thật để đo (27/08/2026), không suy từ tài liệu:
 *   claude-haiku-4-5  + { type: 'adaptive' }              → "adaptive thinking is not supported on this model"
 *   claude-sonnet-5   + { type: 'enabled', budgetTokens } → 400 «"thinking.type.enabled" is not supported
 *                                                            for this model. Use "thinking.type.adaptive"…»
 *
 * Nên KHÔNG hard-code một kiểu: `ANTHROPIC_MODEL` là biến trong .env, đổi model mà mã chỉ biết
 * một kiểu là trợ lý chết ngay từ câu hỏi đầu tiên, và lỗi nằm tận trong nhaCungCap nên rất khó lần.
 *
 * KHÁC NHAU Ở ĐÂU:
 *  - `enabled + budgetTokens` (model cũ): NGÂN SÁCH CỐ ĐỊNH, bắt nghĩ ở MỌI lượt, kể cả câu
 *    "nút Xuất Excel ở đâu". Đó là lý do người dùng thấy "Thought for 3 seconds" trước mỗi câu.
 *  - `adaptive` (4.6 trở lên): model TỰ quyết câu nào cần nghĩ. Đo trên claude-sonnet-5, câu dễ
 *    trả về 0 ký tự suy luận và xong trong 2,7–3,9 giây.
 *
 * Muốn "chỉ nghĩ khi gặp việc khó" thì phải chạy model 4.6+ — trên Haiku 4.5 không có cách nào,
 * ngoài bật/tắt hẳn bằng GUIDE_SHOW_THINKING.
 */
/**
 * Kiểu suy luận của model ĐANG CHỌN: 'adaptive' | 'budget' | 'effort' | 'none'.
 * Nguồn duy nhất là bảng KHA_NANG trong guideSettings — xem chú thích dài ở đó cho lý do vì sao
 * phải cắt theo model chứ không theo nhà cung cấp.
 */
const reasoningKind = () => settings.capabilitiesOf(modelId()).reasoning;
const isAdaptive = () => reasoningKind() === 'adaptive';
/**
 * `omitted` (mặc định của model mới) vẫn trả khối suy luận nhưng RỖNG CHỮ — khung chat và nhân
 * vật sẽ thấy một quãng đứng im không giải thích được. Nên mặc định ở đây là `summarized`.
 */
const THINKING_DISPLAY = process.env.GUIDE_THINKING_DISPLAY === 'omitted' ? 'omitted' : 'summarized';
/**
 * Mức công sức — núm chỉnh chi phí/độ trễ của model mới, thay cho `budgetTokens`. Rỗng thì dùng
 * mặc định của API. Không cắm sẵn một mức vào mã: chưa đo được mức nào hợp với trợ lý này, mà
 * đặt bừa rồi ghi cứng chính là sai lầm của ngân sách cố định lặp lại một lần nữa.
 */
const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];
const effort = () => {
  const v = settings.get('reasoning_effort');
  return EFFORT_LEVELS.includes(v) ? v : null;
};

/** Nhà cung cấp nào đã có key — CHỈ boolean, không bao giờ trả giá trị key. */
function keyForProvider() {
  const out = {};
  for (const [name, c] of Object.entries(PROVIDERS)) out[name] = { envVar: c.env_key, has: !!process.env[c.env_key] };
  return out;
}

/** Khối `providerOptions.anthropic` cho model hiện tại. */
/**
 * `reasoning_effort` của OpenAI CHỈ nhận low / medium / high. Núm trên giao diện còn có xhigh và
 * max vì Anthropic có — gửi thẳng sang OpenAI là 400. Kẹp ở đây, chỗ cuối cùng trước khi con số
 * rời hệ thống, chứ không tin vào lược đồ.
 */
const EFFORT_OPENAI = new Set(['low', 'medium', 'high']);
const clampEffort = (e) => (EFFORT_OPENAI.has(e) ? e : 'high');

/**
 * Khối `providerOptions` cho model hiện tại — BỐN nhánh, chọn theo bảng khả năng.
 *
 * Đây là chỗ bản đầu làm sai: nó hỏi "có phải Anthropic không" rồi tắt sạch suy luận ở mọi nơi
 * khác. Nhưng `gpt-4o` và `GPT-5.6-terra` cùng đi qua `createOpenAI`, mà một bên nổ 400 với
 * `reasoning_effort` còn một bên chạy tốt và nhanh hơn hẳn. Câu hỏi đúng là "MODEL này suy luận
 * kiểu gì", không phải "nhà cung cấp nào".
 */
function reasoningOptions() {
  if (!settings.get('reasoning_enabled')) return undefined;
  const kind = reasoningKind();
  const e = effort();

  if (kind === 'adaptive') {
    const o = { thinking: { type: 'adaptive', display: THINKING_DISPLAY } };
    if (e) o.effort = e;
    return { anthropic: o };
  }

  if (kind === 'budget') {
    // Sàn 1024 là quy định của API. `effort` không tồn tại ở model đời cũ nên không gửi.
    return {
      anthropic: {
        thinking: { type: 'enabled', budgetTokens: Math.max(1024, Number(settings.get('reasoning_budget')) || 2000) },
      },
    };
  }

  if (kind === 'effort') {
    /**
     * `reasoningSummary: 'auto'` là thứ đem lại khối 💭 trên giao diện. Đã đo: nhánh
     * `.responses()` trả chữ suy luận ("**Preparing to invoke tool…**"), nhánh `.chat()` thì
     * KHÔNG — nên nhà cung cấp dùng kiểu này phải đi `.responses()` (xem `api_kind`).
     */
    const o = { reasoningSummary: 'auto' };
    if (e) o.reasoningEffort = clampEffort(e);
    return { openai: o };
  }

  return undefined; // 'none' — gpt-4o/4.1: gửi bất cứ tham số suy luận nào cũng là 400
}

/**
 * Dựng model theo NHÀ CUNG CẤP ĐANG CHỌN.
 *
 * `require('@ai-sdk/openai')` đặt MUỘN và bọc try/catch có chủ ý: nếu package chưa được cài
 * (image build từ một lock cũ chẳng hạn) thì cả route này sập ngay lúc nạp module, tức trợ lý
 * chết hoàn toàn kể cả khi người dùng đang chạy Anthropic. Rơi về Anthropic vẫn phục vụ được.
 *
 * LƯU Ý: đây là dự phòng cho PACKAGE THIẾU, không phải cho KEY THIẾU. Key thiếu bị chặn ở cổng
 * vào với thông báo nêu đúng tên biến — không bao giờ âm thầm gọi nhaCungCap này bằng key của
 * nhaCungCap kia.
 */
function makeAnthropicProvider(id) {
  return createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseURL: process.env.ANTHROPIC_BASE_URL,
  })(id);
}

/**
 * @param {string} [idRieng] Model id CỤ THỂ. Bỏ trống thì lấy model của trợ lý chính.
 *   Subagent ý định truyền vào đây để chạy model rẻ mà vẫn đi ĐÚNG nhà cung cấp và ĐÚNG key
 *   đang cấu hình — không bao giờ mượn key của nhaCungCap khác (xem chú thích ở cổng vào).
 */
function buildModel(idRieng) {
  const name = provider();
  const id = idRieng || modelId();
  if (name === 'anthropic') return makeAnthropicProvider(id);

  const c = PROVIDERS[name];
  if (!c) {
    console.error(`[guide] nhà cung cấp lạ "${name}" — tạm chạy Anthropic "${ANTHROPIC_FALLBACK}".`);
    return makeAnthropicProvider(ANTHROPIC_FALLBACK);
  }

  try {
    // eslint-disable-next-line global-require
    const { createOpenAI } = require('@ai-sdk/openai');
    const url = (c.env_url && process.env[c.env_url]) || c.default_url || '';
    const p = createOpenAI({
      apiKey: process.env[c.env_key],
      // Chỉ truyền khi có: `baseURL: undefined` vẫn là một khoá tồn tại, và một số bản nhaCungCap
      // coi đó là "đã đặt" rồi bỏ mặc định chính thức.
      ...(url ? { baseURL: url } : {}),
    });
    return c.api_kind === 'chat' ? p.chat(id) : p(id);
  } catch (e) {
    console.error(`[guide] không dựng được model "${id}" của "${name}": ${e?.message || e}`
      + ` — tạm chạy Anthropic "${ANTHROPIC_FALLBACK}". Kiểm tra @ai-sdk/openai đã cài chưa.`);
    return makeAnthropicProvider(ANTHROPIC_FALLBACK);
  }
}

/**
 * HÀM GỌI MODEL cho subagent ý định (helpers/guideIntent.js).
 *
 * Ở đây chứ không trong `guideIntent.js` vì đây là nơi DUY NHẤT biết nhà cung cấp và key đang
 * chọn. `guideIntent` giữ phần logic thuần (chỉ dẫn, đệm, bóc JSON) nên test lại được mà không
 * cần mạng.
 *
 * `generateText`, KHÔNG phải `streamText`: không ai đọc từng chữ của subagent, và bản không
 * stream thì đo thời gian dễ hơn.
 *
 * KHÔNG gửi tham số suy luận. `reasoningOptions()` của trợ lý chính có thể bật thinking với sàn
 * 1024 token — với một việc chỉ viết lại một câu ngắn thì đó là trả tiền cho phần vô ích, và
 * `gpt-4o` còn nổ 400 khi nhận tham số đó.
 */
async function callSmallModel(system, prompt, { model, timeoutMs } = {}) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), Number(timeoutMs) || 6000);
  try {
    const result = await generateText({
      model: buildModel(model),
      system,
      prompt,
      // Câu việc chỉ dài chừng 30 chữ; trần thấp là chặn luôn ca model lan thành một đoạn văn.
      maxOutputTokens: 200,
      temperature: 0,
      abortSignal: abort.signal,
    });
    return result?.text || '';
  } finally {
    clearTimeout(timer);
  }
}

// Cache client Anthropic (đắt để dựng lại) — dùng để kiểm tra key sớm, KHÔNG dùng để cache agent.
let _anthropicClient = null;
function ensureAnthropicClient() {
  if (!_anthropicClient) _anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropicClient;
}

/** Tool tra cứu kiến thức — chạy trên backend, kết quả lọc theo quyền của user gọi request. */
function buildSearchTool(user) {
  return defineTool({
    name: 'search_knowledge_base',
    description:
      'Tra cứu màn hình / thao tác / hướng dẫn trong hệ thống theo câu hỏi tiếng Việt. '
      + 'Gọi khi người dùng hỏi về tính năng KHÔNG nằm trên màn hình đang xem, hoặc khi không '
      + 'chắc chắn đường dẫn/tên nút. Trả về tối đa 5 màn hình khớp nhất, kèm path/menu/summary.',
    parameters: z.object({
      question: z.string().describe('Nguyên văn điều người dùng muốn làm hoặc muốn tìm, ví dụ "đổi ảnh nền màn hình".'),
    }),
    execute: async ({ question }) => {
      const results = searchKnowledge(question, { isAdmin: isAdminLike(user) });
      if (results.length === 0) {
        return { results: [], note: 'Không tìm thấy màn hình phù hợp trong kho kiến thức — nói thật với người dùng, đừng bịa.' };
      }
      return {
        results: results.map((s) => ({
          path: s.path,
          label: s.label,
          menu: s.menu,
          summary: s.summary,
          // `content` là phần CHUYÊN SÂU của mỗi mục (quy tắc, phân biệt mục này với mục kia,
          // điều kiện mục mới hiện). Trước đây bị bỏ mất nên tool chỉ trả được một dòng tóm tắt,
          // trợ lý không có gì để hướng dẫn sâu ngoài việc đọc lại tên nút trên màn hình.
          content: s.content || undefined,
          allowed_actions: s.actions || undefined,
        })),
      };
    },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// CHỈ hai trường này. Không được chạm `toolCallId` — client gửi lại đúng id đó kèm tool result,
// đổi đi là runtime báo "Tool result is missing for tool call …".
const MESSAGE_ID_FIELDS = ['messageId', 'parentMessageId'];

/**
 * Bẫy 9 — vì sao trợ lý "chỉ suy luận rồi im".
 *
 * `@ai-sdk/anthropic` đặt id cho khối nội dung theo CHỈ SỐ KHỐI. Bật suy luận thì khối thinking
 * là 0, khối text là 1 → **mọi câu trả lời trong cả hội thoại đều mang `messageId` = "1"`**.
 * Guard trong `BuiltInAgent` chỉ thay id khi nó là `"0"` hoặc khớp `/^(txt|reasoning|msg)-0$/`,
 * nên `"1"` lọt qua nguyên vẹn. Client đã có message id `"1"` từ câu trả lời đầu → nó KHÔNG
 * thêm bong bóng mới, mà ghi vào bong bóng cũ ở phía trên. Người dùng thấy đúng khung 💭 rồi
 * hết — y như model không trả lời.
 *
 * Đã đo trên luồng thật: câu "tab Phân tích trên trang này để làm gì" — server phát
 * `TEXT_MESSAGE_START/CONTENT×9/END` với 444 ký tự, DOM khung chat **không có bong bóng mới
 * nào**, bong bóng id "1" vẫn giữ nội dung của câu trả lời trước đó. Lượt đầu tiên của mỗi
 * hội thoại thì bình thường (chưa có id "1"), nên lỗi trông như "thỉnh thoảng".
 *
 * Sửa: id message nào không phải UUID thì thay bằng UUID, nhất quán trong một lượt chạy (cùng
 * id gốc → cùng UUID, để START/CONTENT/END vẫn dính vào một message). Map dựng MỚI mỗi lượt
 * nên "1" của lượt sau không đụng "1" của lượt trước.
 *
 * PHẢI cài bằng MIDDLEWARE, không được kế thừa lớp. Runtime clone agent cho mỗi request
 * (`cloneAgentForRequest`), và `BuiltInAgent.clone()` hard-code `new BuiltInAgent(this.config)`
 * — mọi lớp con bị vứt. Đã đo: override `run()` KHÔNG hề được gọi lần nào. Còn `clone()` thì
 * có copy `middlewares`, nên đây là chỗ móc duy nhất sống sót qua clone.
 */
function stableMessageIdMiddleware(input, next) {
  const remap = new Map();
  return next.run(input).pipe(map((event) => {
    let patched = event;
    for (const field of MESSAGE_ID_FIELDS) {
      const value = event?.[field];
      if (typeof value !== 'string' || !value || UUID_RE.test(value)) continue;
      if (!remap.has(value)) remap.set(value, randomUUID());
      if (patched === event) patched = { ...event };
      patched[field] = remap.get(value);
    }
    return patched;
  }));
}

/**
 * Chốt sổ token/tiền khi lượt chạy kết thúc.
 *
 * Phải làm ở AG-UI middleware, không làm trong model middleware: model middleware biết usage
 * nhưng KHÔNG biết threadId / runId / đây là lượt hỏi thứ mấy. Chỗ duy nhất biết cả hai là đây,
 * vì `input` của AG-UI mang `threadId`, `runId` và toàn bộ `messages` — đếm số message
 * `role: 'user'` trong đó ra đúng số lượt, nên chi phí gán được về từng lượt hỏi.
 *
 * `finalize` (không phải `complete`) để lượt bị huỷ giữa đường vẫn ghi được phần đã tiêu.
 */
function usageMiddleware(collector, user) {
  return (input, next) => {
    const turnNo = Array.isArray(input?.messages)
      ? input.messages.filter((m) => m?.role === 'user').length
      : null;

    /**
     * ĐÓNG DẤU SỐ LƯỢT CHO SỔ LUỒNG — phải làm ở đây, tầng AG-UI, vì tầng model chỉ thấy
     * `params` chứ không thấy `input.messages`.
     *
     * Không dùng lại biến `turnNo` ngay trên: nó đếm MỌI message `role: 'user'`, kể cả khối ngữ
     * cảnh và khối kinh nghiệm ta tự chèn. Với sổ tiền thì con số đó vẫn dùng được (nó chỉ cần
     * một khoá gán chi phí), nhưng với sổ luồng thì lệch một nhịp là gom nhầm sự kiện của hai
     * lượt vào một sơ đồ. `isTurnMark` đã có sẵn phép nhận diện câu hỏi thật — dùng đúng nó.
     */
    if (Array.isArray(input?.messages)) {
      flowLog.setTurn(input?.threadId, input.messages.filter(isTurnMark).length);
    }
    let finalized = false;
    const finalize = () => {
      if (finalized) return;
      finalized = true;
      try {
        const result = collector.finalize({ threadId: input?.threadId, runId: input?.runId, turnNo, modelId: modelId() });
        /**
         * KHÔNG `await`: đây là kế toán chạy nền. Để nó chắn đường trả lời cho người dùng thì
         * một lần DB chậm là cả câu trả lời treo theo. Lỗi đã được nuốt bên trong `addTokens`.
         *
         * `realTurnCount` chứ không phải `turnNo`: biến kia đếm mọi message `role: 'user'`, kể cả khối
         * ngữ cảnh ta tự chèn — dùng nó làm khoá thì token rơi vào một lượt không tồn tại và
         * hạn mức token vĩnh viễn bằng 0.
         */
        void quota.addTokens({
          userId: user?.id || user?.userId,
          threadId: input?.threadId,
          turnNo: realTurnCount(input?.messages),
          token: result?.total_tokens,
        });
      } catch (e) {
        console.error('[guide] chot so usage loi:', e?.message || e);
      }
    };
    return next.run(input).pipe(tap({ complete: finalize, error: finalize, finalize: finalize }));
  };
}

/**
 * ═══════════ CỬA SỔ NGỮ CẢNH: giữ lại N LƯỢT HỎI gần nhất ═══════════
 *
 * Trước đây KHÔNG cắt gì: AG-UI gửi lại toàn bộ hội thoại ở mỗi lượt, và nó chỉ dừng phình khi
 * người dùng tải lại trang. Prompt cache đỡ được phần tiền (tiền tố ổn định, đọc lại giá 10%)
 * nhưng không đỡ được cửa sổ ngữ cảnh của model — một phiên đủ dài sẽ chạm trần rồi lỗi giữa
 * chừng, không cảnh báo gì trước.
 *
 * ĐƠN VỊ LÀ LƯỢT HỎI, KHÔNG PHẢI MESSAGE. Đây là khác biệt lớn chứ không phải cách gọi khác của
 * cùng một thứ: một lượt ở chế độ toàn quyền thường 5–6 bước tool, mà mỗi bước sinh 2–3 message
 * (`reasoning`, `assistant` kèm `toolCalls`, `tool`) — hơn chục message cho MỘT câu hỏi. Đếm
 * theo message thì "5" gần như luôn dừng ngay trong lượt đang chạy, tức trợ lý không nhớ gì cả.
 *
 * Đếm theo lượt thì phần XỬ LÝ của trợ lý trong những lượt được giữ vẫn nằm nguyên trong ngữ
 * cảnh — nó thấy lại nó đã bấm gì, tool trả gì, và vì sao kết luận như vậy.
 *
 * Điểm cắt luôn rơi đúng vào một câu hỏi của người dùng, nên không bao giờ có message
 * `role: 'tool'` mồ côi lời gọi sinh ra nó — thứ mà Anthropic trả 400 chứ không bỏ qua.
 *
 * Message `system` được giữ nguyên ở đầu dù cắt tới đâu.
 *
 * Cắm SAU `usageMiddleware`, cố ý: bên đó đếm số message `user` để biết đây là lượt hỏi thứ mấy
 * mà gán chi phí. Cắt trước thì số đếm reset ở mọi lượt và sổ chi phí sai hết.
 */
const rememberedTurns = () => settings.get('remembered_turns');

/** Message này có phải MỐC MỞ ĐẦU một lượt không (câu hỏi thật của người dùng)? */
function isTurnMark(m) {
  if (m?.role !== 'user') return false;
  const c = typeof m.content === 'string' ? m.content : '';
  // Khối ngữ cảnh / kinh nghiệm do ta tự chèn cũng mang role 'user' — chúng không mở đầu lượt nào,
  // và tính nhầm chúng là lượt thì cửa sổ hụt đi một nửa.
  return !c.startsWith(CONTEXT_BLOCK_MARKER) && !c.startsWith('## Kinh nghiệm');
}

/**
 * Số LƯỢT HỎI THẬT trong danh sách message — đơn vị đếm của cả sổ luồng và hạn mức ngày.
 *
 * Khác với phép đếm mọi message `role: 'user'`: khối ngữ cảnh và khối kinh nghiệm ta tự chèn
 * cũng mang role đó. Lệch một nhịp ở đây là hạn mức trừ nhầm lượt, và token ghi vào một lượt
 * không tồn tại.
 */
function realTurnCount(messages) {
  return Array.isArray(messages) ? messages.filter(isTurnMark).length : 1;
}

function trimHistory(messages) {
  const N = rememberedTurns();
  if (!N || !Array.isArray(messages)) return messages;

  let first = 0;
  while (first < messages.length && messages[first]?.role === 'system') first += 1;
  const system = messages.slice(0, first);
  const body = messages.slice(first);

  // Lùi từ cuối, đếm mốc lượt. Đủ N mốc thì cắt NGAY TẠI mốc thứ N — giữ trọn lượt đó.
  let count = 0;
  let clip = -1;
  for (let i = body.length - 1; i >= 0; i -= 1) {
    if (!isTurnMark(body[i])) continue;
    count += 1;
    if (count === N) { clip = i; break; }
  }
  if (clip <= 0) return messages; // chưa đủ N lượt → chưa cần cắt gì
  return system.concat(body.slice(clip));
}

function trimHistoryMiddleware(input, next) {
  const messages = input?.messages;
  const fresh = trimHistory(messages);
  return next.run(fresh === messages ? input : { ...input, messages: fresh });
}

/**
 * Đẩy readable BIẾN ĐỘNG ra khỏi system prompt xuống cuối danh sách message, để tiền tố cache
 * ổn định (xem helpers/guideCache.js). Phải làm ở đây vì đây là chỗ duy nhất còn sửa được
 * `input` trước khi `BuiltInAgent` nhồi context vào system prompt.
 */
function cacheContextMiddleware(input, next) {
  return next.run(reorderContextForCache(input));
}

/** Câu hỏi cuối cùng của người dùng trong danh sách message (bỏ qua khối ngữ cảnh ta tự chèn). */
function lastQuestion(messages) {
  for (let i = (messages?.length || 0) - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m?.role !== 'user') continue;
    const c = typeof m.content === 'string'
      ? m.content
      : (Array.isArray(m.content) ? m.content.find((p) => p?.type === 'text')?.text : '');
    if (!c || c.startsWith(CONTEXT_BLOCK_MARKER) || c.startsWith('## Kinh nghiệm')) continue;
    return c;
  }
  return '';
}

/**
 * MẤY LƯỢT GẦN NHẤT dạng {vai, chu} — bối cảnh cho subagent ý định.
 *
 * Bỏ mọi khối TA TỰ CHÈN (ngữ cảnh, kinh nghiệm): chúng mang `role: 'user'` nhưng không phải lời
 * của ai, và đưa vào chỉ làm subagent tưởng người dùng đang nói về kho kinh nghiệm.
 *
 * Bỏ luôn phần tử cuối nếu nó trùng `question`: câu mới nhất đã được đưa riêng trong `veBoiCanh()`,
 * để lại đây là subagent đọc nó hai lần rồi tưởng người dùng nhắc lại.
 */
function renderHistory(messages, question) {
  const out = [];
  for (const m of messages || []) {
    if (m?.role !== 'user' && m?.role !== 'assistant') continue;
    const c = typeof m.content === 'string'
      ? m.content
      : (Array.isArray(m.content) ? m.content.find((x) => x?.type === 'text')?.text : '');
    if (!c || !String(c).trim()) continue;
    if (c.startsWith(CONTEXT_BLOCK_MARKER) || c.startsWith('## Kinh nghiệm')) continue;
    /**
     * KHOÁ PHẢI LÀ `role` / `text` — đúng thứ `buildContext()` của guideIntent.js đọc.
     *
     * Bản trước trả `{ vai, chu }`, và đó là một lỗi IM LẶNG: `buildContext` đọc `h.role` nên
     * mọi dòng ra `- Assistant: ` rỗng, tức subagent MẤT SẠCH lịch sử hội thoại mà không có lỗi
     * nào, không có log nào, `status()` vẫn báo bật. Nó vẫn suy ra được ý định — nhưng chỉ từ
     * câu mới nhất, tức mất đúng thứ nó được dựng ra để làm: giải nghĩa câu tiếp nối.
     */
    out.push({ role: m.role, text: String(c) });
  }
  if (out.length && out[out.length - 1].text === question) out.pop();
  return out.slice(-8);
}

/**
 * BỘ NHỚ KINH NGHIỆM — chèn đường đi đã thành công của những lần trước (helpers/guideExperience.js).
 *
 * GẮN VÀO ĐUÔI KHỐI NGỮ CẢNH BIẾN ĐỘNG, không thêm message mới ở sau nó. Lý do là cache:
 * `cacheControlMiddleware` đặt điểm cắt ở message CUỐI CÙNG KHÔNG PHẢI khối ngữ cảnh. Thêm một
 * message nữa sau khối đó thì điểm cắt rơi đúng vào phần biến động theo từng câu hỏi — lần nào
 * cũng ghi cache mới mà không bao giờ đọc lại được. Nhét chung vào khối đã được đánh dấu "không
 * cache" thì không đụng gì tới điểm cắt.
 *
 * Trả về `input` mới; không sửa `input` gốc.
 */
async function addExperienceToInput(input, user, session) {
  const messages = Array.isArray(input?.messages) ? input.messages : [];
  const question = lastQuestion(messages);
  if (!question) return input;

  /**
   * Khoá của lượt = threadId. Đây là thứ DUY NHẤT ở đây sống xuyên nhiều request của cùng một
   * lượt hỏi — tool phía client kết thúc run sau mỗi bước, nên biến cục bộ không dùng được.
   * Thiếu threadId thì để rỗng: `getInjected('')` trả tập rỗng, hành vi lùi về đúng như trước chứ
   * không gộp nhầm lượt của người khác.
   */
  if (session) session.key = String(input?.threadId || '');

  const path = readCurrentPath(input);

  /**
   * SUBAGENT DIỄN GIẢI Ý ĐỊNH — thay nguyên văn câu hỏi làm chuỗi truy vấn.
   *
   * Trước bản này chỗ dò dùng đúng `question`, nên trượt sạch câu tiếp nối ("còn tháng trước thì
   * sao?") và câu tả triệu chứng ("sao nó không ra gì") — hai loại câu mà việc thật nằm ở lượt
   * TRƯỚC, không nằm trong chữ người dùng vừa gõ.
   *
   * `null` là đường lùi hợp lệ: subagent tắt, hết giờ, hay trả sai dạng đều cho `null`, và khi đó
   * `findCombined` dò bằng nguyên văn — đúng hành vi bản cũ, không hỏng gì.
   *
   * AGENT CHÍNH KHÔNG THẤY GÌ. Nó vẫn nhận khối kinh nghiệm qua ngữ cảnh, không có tool nào để
   * gọi, không mất bước nào trong trần bước. Cái giá nằm ở một lời gọi model NHỎ, và chỉ MỘT lần
   * mỗi lượt hỏi nhờ bộ đệm trong `guideIntent` (middleware này chạy ở mọi request).
   */
  const y = await intent.inferIntent({
    threadId: session?.key || '',
    // `turn`, KHÔNG phải `turnNo`: `inferIntent` ghép khoá đệm bằng `input.turn`. Gửi sai tên thì
    // nó rơi về `|| 1`, cả luồng dùng chung một khoá `${threadId}#1`, và từ lượt 2 trở đi mọi câu
    // hỏi đều nhận lại ý định của lượt ĐẦU TIÊN — đo được trong nhật ký luồng: 8 lần dò kinh
    // nghiệm ở lượt 2 đều mang ý định của lượt 1.
    turn: realTurnCount(messages),
    question: question,
    path: path,
    screen: readScreenLabel(input),
    history: renderHistory(messages, question),
  }, callSmallModel);

  /**
   * `findCombined` = từ khoá trước, ngữ nghĩa lấp chỗ trống (xem guideExperience.js).
   *
   * Hàm này nay BẤT ĐỒNG BỘ, và đó là lý do middleware bên dưới phải bọc qua `switchMap`. Cái
   * giá thật chỉ phát sinh ở những lượt mà từ khoá về tay không — lượt nào dò trúng bằng từ
   * khoá thì `findCombined` không đụng tới mạng, đúng như trước.
   */
  const list = await experience.findCombined(question, {
    company: user?.company_id || 'chung',
    path: path,
    turn: session?.key || '',
    y,
  });
  if (!list.length) return input;
  experience.markRecalled(list);
  // Ghi sổ NGAY ở lần tiêm đầu: cứu hộ giữa chuỗi phải biết bản nào đã đưa rồi mà tránh ra.
  experience.markInjected(session?.key, list);

  const block = experience.renderExperienceBlock(list);
  const fresh = [...messages];
  const last = fresh[fresh.length - 1];
  const isContextBlock = last?.role === 'user' && typeof last.content === 'string'
    && last.content.startsWith(CONTEXT_BLOCK_MARKER);

  if (isContextBlock) fresh[fresh.length - 1] = { ...last, content: `${last.content}\n${block}` };
  else fresh.push({ id: randomUUID(), role: 'user', content: block });

  return { ...input, messages: fresh };
}

/**
 * Tên màn hình đang mở ("Sự kiện", "Dashboard CRM") — bối cảnh cho subagent ý định.
 * Hữu ích hơn đường dẫn: subagent nhận ra nghiệp vụ qua TÊN, không qua path.
 */
function readScreenLabel(input) {
  const ctx = Array.isArray(input?.context) ? input.context : [];
  const c = ctx.find((x) => String(x?.description || '').startsWith('Màn hình người dùng đang xem'));
  const m = /"label"\s*:\s*"([^"]+)"/.exec(String(c?.value || ''));
  return m ? m[1] : '';
}

/** Trang đang mở, lấy từ readable "Màn hình người dùng đang xem" nếu có. */
function readCurrentPath(input) {
  const ctx = Array.isArray(input?.context) ? input.context : [];
  const c = ctx.find((x) => String(x?.description || '').startsWith('Màn hình người dùng đang xem'));
  const m = /"(?:duong_dan|path)"\s*:\s*"([^"]+)"/.exec(String(c?.value || ''));
  return m ? m[1] : '';
}

/** Middleware theo REQUEST — cần `user` để chia kho theo công ty. */
/**
 * Bọc qua `switchMap` vì `addExperienceToInput` nay bất đồng bộ (tầng ngữ nghĩa cần nhúng câu
 * hỏi). `next.run` nhận input đã sẵn sàng, không nhận Promise — đưa thẳng Promise vào là nó
 * nhồi một `[object Promise]` vào prompt mà không hề báo lỗi.
 *
 * Lỗi nhúng đã được nuốt bên trong `guideEmbedding` nên nhánh này không cần `catchError`; nhưng
 * nếu về sau có ai thêm phép ném ở đó thì phải thêm, không thì một lỗi phụ làm chết cả lượt.
 */
function experienceMiddleware(user, session) {
  return (input, next) => from(addExperienceToInput(input, user, session)).pipe(switchMap((x) => next.run(x)));
}

/**
 * Client tự khai chế độ của nó qua header, để server gửi ĐÚNG bộ luật chứ không gửi cả hai
 * (xem helpers/guidePrompt.js — cắt được 34% chỉ dẫn ở chế độ đọc).
 *
 * Chỉ nhận đúng chuỗi '1'. Thiếu header, header lạ, hay bất kỳ giá trị nào khác → chế độ ĐỌC,
 * tức bản dè dặt hơn. Đây KHÔNG phải kiểm soát quyền: quyền thật nằm ở chỗ client có mount tool
 * hay không, header này chỉ chọn văn bản mô tả cho khớp.
 */
function isFullAccess(req) {
  return req.get?.('x-guide-full-access') === '1';
}

/**
 * Tool để trợ lý TỰ GHI kinh nghiệm — thứ mà bản ghi tự động không lấy được.
 *
 * Bản ghi tự động (GuideExperienceRecorder.jsx) chỉ thấy được những gì ĐÃ XẢY RA: câu hỏi, chuỗi
 * tool, câu trả lời. Nó không biết vì sao model bỏ một hướng, không biết model vừa phát hiện nút
 * nằm ở chỗ khác chỗ nó tưởng, và không biết người dùng vừa sửa lưng nó. Ba thứ đó nằm trong đầu
 * model, chỉ model mới kể ra được.
 *
 * `dead_ends` là trường đáng giá nhất ở đây: biết một lối KHÔNG đi được cắt hẳn một nhánh mò cho
 * lần sau, mà bản ghi tự động thì không bao giờ suy ra được.
 *
 * Chi phí: mỗi lần gọi tốn thêm một vòng gọi model. Chỉ dẫn ở guidePrompt.js nói rõ chỉ gọi khi
 * có thứ mới đáng ghi, và gọi đúng một lần ở cuối lượt.
 */
function buildSaveExperienceTool(user) {
  return defineTool({
    name: 'save_experience',
    description:
      'Ghi lại một điều VỪA HỌC ĐƯỢC để lần sau khỏi mò lại: một lối đi đúng, một lối cụt, hoặc '
      + 'một sự thật về giao diện mà kho kiến thức chưa có. KHÔNG cần gọi để lưu việc vừa làm trót '
      + 'lọt — hệ thống đã tự lưu. Chỉ gọi khi có thứ mà lần sau CẦN BIẾT TRƯỚC. Một lần mỗi lượt.',
    parameters: z.object({
      task: z.string().describe('Việc/câu hỏi tiêu biểu, viết như người dùng sẽ hỏi lần sau. VD "lọc lead theo công ty".'),
      path: z.string().optional().describe('Màn hình áp dụng, VD "/crm/dashboard". Bỏ trống nếu đúng ở mọi trang.'),
      steps: z.array(z.string()).optional().describe('Các bước đúng, mỗi bước một dòng ngắn kèm tên nút thật.'),
      dead_ends: z.array(z.string()).optional().describe('Những cách đã thử mà KHÔNG được, kèm lý do. VD "bấm nút Lọc ngoài thanh công cụ — không có nút này, phải mở Thêm trước".'),
      lesson: z.string().optional().describe('Kết luận ngắn cho lần sau, CHỈ nói về giao diện. TUYỆT ĐỐI không chép số liệu, tên khách hàng, số tiền — kho này dùng chung trong công ty và sống lâu.'),
    }),
    execute: async ({ task, path, steps, dead_ends, lesson }) => {
      const result = experience.addExperience({
        company: user?.company_id || 'chung',
        question: task,
        path: path || '',
        steps: (steps || []).map((x) => ({ tool: '', summary: x })),
        dead_ends: dead_ends || [],
        lesson: lesson || '',
        source: 'agent',
      });
      // Trả về NGẮN: đây là bước cuối lượt, model không cần đọc lại thứ nó vừa viết.
      return result.saved
        ? { ok: true, note: result.merged ? 'Đã cập nhật kinh nghiệm cũ.' : 'Đã ghi kinh nghiệm mới.' }
        : { ok: false, reason: result.reason };
    },
  });
}

/**
 * BỎ một kinh nghiệm SAI.
 *
 * Vì sao trợ lý được phép tự xoá: kho này do chính nó viết, nên nó cũng là bên duy nhất phát
 * hiện được lúc một mục đã hỏng — giao diện đổi tên nút, luồng đổi bước, hoặc bài học viết ẩu
 * từ một lượt may mắn. Không có lối xoá thì một mục sai sẽ được nhắc lại mãi và kéo trợ lý đi
 * sai đúng chỗ đó, lượt này qua lượt khác; càng sai lâu càng khó lần ra vì nó trông như một
 * "kinh nghiệm".
 *
 * Xoá là xoá MỀM (xem `discardExperience`) — bản ghi ở lại trong tệp kèm lý do, nên một lần xoá
 * nhầm không mất gì và người quản trị lật lại được qua `GET /debug/kinh-nghiem`.
 */
function buildDiscardExperienceTool(user) {
  return defineTool({
    name: 'discard_experience',
    description:
      'Bỏ một mục trong "Kinh nghiệm từ những lần trước" khi mục đó SAI. Truyền `ma` là chuỗi '
      + 'trong ngoặc vuông ở đầu mục. CHỈ gọi khi bạn đã LÀM THEO mục đó và thấy nó dẫn sai — nút '
      + 'không còn tên đó, đường đi không còn đúng, hoặc bài học cho kết quả sai. KHÔNG gọi vì mục '
      + 'đó không liên quan tới câu đang hỏi: không liên quan thì bỏ qua là đủ.',
    parameters: z.object({
      code: z.string().describe('Mã trong ngoặc vuông ở đầu mục kinh nghiệm, VD "a1b2c3".'),
      // `reason` chứ không phải `reason`: mọi tham số tool đều đặt tên tiếng Việt không dấu
      // (`label`, `region`, `path`, `question`…), và `reason` trong hệ này đã mang nghĩa
      // khác hẳn — nó là MÃ LỖI máy đọc ở giá trị TRẢ VỀ (`{ ok: false, reason: 'ma_trung' }`).
      // Dùng chung một chữ cho hai thứ đó là mời model điền mã lỗi vào chỗ cần câu giải thích.
      reason: z.string().describe('Sai ở CHỖ NÀO, viết cụ thể để người đọc lại quyết định được. VD "bước 2 bảo bấm nút Lọc ở thanh công cụ, nút đó nay nằm trong menu Thêm".'),
    }),
    execute: async ({ code, reason: reason }) => {
      // `discardExperience` nhận khoá `reason` (API nội bộ của helper, xem guideExperience.js).
      const result = experience.discardExperience({ company: user?.company_id || 'chung', code, reason: reason });
      return result.discarded
        ? { ok: true, note: `Đã bỏ kinh nghiệm [${result.code}]. Lần sau nó không được nhắc nữa.` }
        : { ok: false, reason: result.reason, ...(result.match_count ? { match_count: result.match_count } : {}) };
    },
  });
}

/** Dựng agent MỖI REQUEST (bẫy 2) — tool bên trong đóng closure theo `user` của request này. */
function buildAgent(user, toanQuyen) {
  const providerOptions = reasoningOptions();

  // Bộ thu usage riêng cho request này. Agent cũng dựng riêng mỗi request nên không lẫn.
  const collector = createCollector();

  /**
   * CẦU NỐI giữa hai tầng middleware, chỉ để chuyển đúng một thứ: khoá của lượt hỏi.
   *
   * Tầng AG-UI có `input.threadId`; tầng model (`transformParams`) thì KHÔNG — nó chỉ thấy
   * `params`. Mà cứu hộ nằm ở tầng model lại cần biết lượt này đã được tiêm kinh nghiệm nào,
   * để không tiêm lại đúng bản vừa làm nó trượt.
   *
   * Object rỗng dựng ở đây, tầng AG-UI ghi vào (nó luôn chạy trước, vì nó bọc `next.run`), tầng
   * model đọc ra. Cả hai cùng thuộc MỘT request nên không lẫn sang người khác.
   */
  const session = { key: '' };
  // Truyền model dạng OBJECT, không dạng chuỗi "anthropic:...": `resolveModel` có dòng
  // `if (typeof spec !== "string") return spec;` nên object đi qua nguyên vẹn, còn chuỗi thì
  // nó tự tạo nhaCungCap và ta mất chỗ móc để đọc usage.
  const model = wrapLanguageModel({
    model: buildModel(),
    /**
     * Thứ tự: chèn cứu hộ → chặn bước → đặt điểm cắt cache → đo usage.
     *
     * Cứu hộ phải đứng TRƯỚC `cacheControlMiddleware`: nó nối thêm một message vào cuối prompt,
     * mà điểm cắt cache thì tính từ cuối lên. Chèn sau khi đã đặt điểm cắt là điểm cắt nằm nhầm
     * chỗ. Khối cứu hộ mang tiền tố '## Ngữ cảnh hiện tại' nên `cacheControlMiddleware` nhận ra
     * và bỏ qua nó khi chọn chỗ đặt cắt — xem guideExperience.js.
     *
     * Chặn bước đứng SAU cứu hộ, cùng lý do và cùng một mốc: gợi ý kinh nghiệm nên tới TRƯỚC lời
     * nhắc dừng, để model còn cơ hội thử đường đúng rồi mới bị giục kết thúc. Nó KHÔNG phụ thuộc
     * kho kinh nghiệm có bật hay không — trần bước là chuyện của mọi cấu hình.
     *
     * Usage đo SAU CÙNG, để con số phản ánh đúng cái thật sự gửi đi (gồm cả khối cứu hộ).
     */
    middleware: [
      ...(experience.ENABLED ? [experience.createRescueMiddleware(user, CONTEXT_BLOCK_MARKER, session)] : []),
      stepGuard.createStepGuardMiddleware(CONTEXT_BLOCK_MARKER, session),
      // Điểm cắt cache là cơ chế RIÊNG của Anthropic (`cache_control` trên từng khối nội dung).
      // OpenAI tự cache theo tiền tố, không nhận đánh dấu — gửi vào là thừa, và tuỳ bản nhaCungCap
      // có thể bị từ chối. Bỏ hẳn khi không phải Anthropic.
      ...(isAnthropic() ? [cacheControlMiddleware()] : []),
      createUsageMiddleware(collector, modelId()),
    ],
  });

  const agent = new BuiltInAgent({
    model,
    // Key của ĐÚNG nhà cung cấp đang chọn. `model` ở trên đã mang key riêng rồi, nhưng để lệch
    // ở đây là mời một lỗi 401 khó hiểu vào những đường mà runtime tự gọi.
    apiKey: apiKey(),
    tools: [
      buildSearchTool(user),
      ...(experience.ENABLED ? [buildSaveExperienceTool(user), buildDiscardExperienceTool(user)] : []),
    ],
    prompt: buildPrompt(toanQuyen),
    maxSteps: maxSteps(),
    ...(providerOptions ? { providerOptions } : {}),
  });
  agent.use(stableMessageIdMiddleware); // bẫy 9
  agent.use(usageMiddleware(collector, user));
  // Luôn cắm; `trimHistory` tự bỏ qua khi số lượt đặt về 0. Không quyết được ở đây vì con số
  // chỉnh được lúc chạy, mà agent thì dựng lại mỗi request.
  agent.use(trimHistoryMiddleware);
  /**
   * GIỮ cho MỌI nhà cung cấp, khác với `cacheControlMiddleware` ở trên. Middleware này không
   * đánh dấu `cache_control` — nó chỉ đẩy readable BIẾN ĐỘNG ra khỏi system prompt xuống cuối
   * danh sách message. Tiền tố ổn định có lợi cho cả hai bên: Anthropic cần nó để điểm cắt ăn,
   * OpenAI cache tiền tố tự động nên cũng hưởng.
   */
  if (CACHE_BAT) agent.use(cacheContextMiddleware);
  // SAU cacheContextMiddleware, cố ý: nó cần khối ngữ cảnh biến động đã nằm ở cuối để gắn nhờ.
  if (experience.ENABLED) agent.use(experienceMiddleware(user, session));
  return agent;
}

function buildHandler(user, toanQuyen) {
  const runtime = new CopilotRuntime({
    agents: { default: buildAgent(user, toanQuyen) },
  });
  return copilotRuntimeNodeExpressEndpoint({ runtime, endpoint: ENDPOINT });
}

r.use(auth); // trợ lý mô tả cấu trúc nội bộ hệ thống → không mở công khai

/**
 * Phơi chỉ dẫn hệ thống THẬT cho bảng "Hành động của trợ lý" (tab Ngữ cảnh).
 *
 * PHẢI khai TRƯỚC `r.use('/', …)` bên dưới — middleware đó khớp mọi đường dẫn, khai sau thì
 * request rơi vào runtime CopilotKit và trả 404/405.
 *
 * Chỉ dev hoặc admin: prompt mô tả ranh giới quyền của trợ lý, người dùng thường đọc được nó
 * là biết cách lách. Không phải bí mật sống còn (trợ lý vốn đã kể cấu trúc hệ thống), nhưng
 * không có lý do gì mở cho tất cả.
 */
r.get('/debug/prompt', (req, res) => {
  if (process.env.NODE_ENV === 'production' && !isAdminLike(req.user)) {
    return res.status(403).json({ error: 'admin_only' });
  }
  return res.json({
    // Phơi cả hai bản: bảng Ngữ cảnh cần biết bản THẬT đang gửi đi dài bao nhiêu.
    prompt: buildPrompt(isFullAccess(req)),
    prompt_mode: isFullAccess(req) ? 'full_access' : 'read_only',
    prompt_chars: { full: SYSTEM_PROMPT.length, sent: buildPrompt(isFullAccess(req)).length },
    provider: provider(),
    model: modelId(),
    max_steps: maxSteps(),
    /**
     * Ba trường dưới đây là chuyện RIÊNG của Anthropic. Khi đang chạy nhà cung cấp khác thì phải
     * ghi thẳng "không áp dụng" — để trống hoặc hiện giá trị cũ là bảng chẩn đoán nói dối đúng
     * lúc người ta cần nó nhất: ngay sau khi vừa đổi nhà cung cấp.
     */
    reasoning_kind: reasoningKind(),
    reasoning: (() => {
      const kind = reasoningKind();
      if (kind === 'none') return { on: false, note: `model "${modelId()}" không có tham số suy luận` };
      if (!settings.get('reasoning_enabled')) return { on: false, note: 'tắt ở màn hình cấu hình' };
      if (kind === 'adaptive') return { on: true, kind: 'adaptive — model tự quyết câu nào cần nghĩ', display: THINKING_DISPLAY };
      if (kind === 'budget') return { on: true, kind: `trần ${settings.get('reasoning_budget')} token`, thinks_every_turn: true };
      return { on: true, kind: 'reasoning_effort — có tóm tắt suy luận (reasoningSummary: auto)' };
    })(),
    effort: (() => {
      const kind = reasoningKind();
      if (kind === 'none' || kind === 'budget') return `không áp dụng cho model "${modelId()}"`;
      const e = effort();
      if (kind === 'effort') return e ? `${clampEffort(e)}${clampEffort(e) !== e ? ` (kẹp từ "${e}" — OpenAI chỉ nhận low/medium/high)` : ''}` : 'mặc định của API';
      return e || 'mặc định của API (high)';
    })(),
    remembered_turns: settings.get('remembered_turns') || 'không cắt',
    prompt_cache: !isAnthropic()
      ? `không áp dụng — điểm cắt cache là cơ chế của Anthropic; "${provider()}" tự cache theo tiền tố`
      : (CACHE_BAT ? 'bật' : 'tắt (GUIDE_PROMPT_CACHE=0)'),
  });
});

/**
 * GHI KINH NGHIỆM sau một lượt khó — client gọi khi lượt kết thúc (xem GuideExperienceRecorder.jsx).
 *
 * Vì sao client gửi chứ không phải server tự ghi: server thấy từng lần gọi model rời rạc, không
 * thấy "một lượt của người dùng" bắt đầu và kết thúc ở đâu — nhất là khi chuỗi tool chạy qua
 * nhiều request. Client có nguyên luồng message nên biết chính xác lượt nào xong, xong bằng câu
 * trả lời nào, và đã đi qua những bước nào.
 *
 * Không tin client về QUYỀN: công ty lấy từ JWT đã verify, không lấy từ body.
 */
/**
 * HỌC NỀN — chạy SAU khi đã trả lời client, không ai chờ nó.
 *
 * Thứ tự có chủ ý: thử SUBAGENT THỦ THƯ trước, chỉ khi nó KHÔNG CHẠY ĐƯỢC mới lùi về ghi máy
 * móc. Phân biệt hai chuyện rất khác nhau:
 *
 *   thủ thư phán 'skip'  → TÔN TRỌNG. Nó đã đọc kho và kết luận không có gì để thêm. Ghi máy
 *                            móc lúc này là ghi đè lên đúng cái phán đoán ta vừa trả tiền để có.
 *   thủ thư tắt / lỗi      → LÙI về ghi máy móc, tức đúng hành vi bản trước. Mất tính năng thì
 *                            được, mất luôn việc ghi thì không.
 */
async function learnThenRecord(payload) {
  const result = await librarian.learnInBackground(payload, callSmallModel);

  // Thủ thư đã chạy và đã quyết (kể cả 'skip') → xong, không ghi máy móc nữa.
  const canRewind = !result.ran || result.reason === 'model_error' || result.reason === 'bad_shape';
  if (!canRewind) return;

  const saveRes = experience.addExperience({
    company: payload.company,
    question: payload.question,
    path: payload.path,
    steps: payload.steps,
    dead_ends: payload.deadEnds,
    answer: payload.answer,
  });
  flowLog.record(payload.threadId, 'experience_write', {
    route: 'mechanical',
    saved: !!saveRes.saved,
    ...(saveRes.reason ? { reason: saveRes.reason } : {}),
    ...(saveRes.merged ? { merged: true } : {}),
    steps: Array.isArray(payload.steps) ? payload.steps.length : 0,
    dead_ends: Array.isArray(payload.deadEnds) ? payload.deadEnds.length : 0,
  });
}

r.post('/experience', (req, res) => {
  const b = req.body || {};
  const threadId = String(b.thread_id || '');

  const payload = {
    company: req.user?.company_id || 'chung',
    threadId,
    question: b.question,
    /**
     * Ý ĐỊNH đã diễn giải ở lượt này, lấy từ bộ đệm của `guideIntent`.
     *
     * `latestFor(threadId)` chứ không tra theo số lượt: client và server đếm lượt bằng hai phép
     * khác nhau (xem chú thích trong guideIntent.js). Thủ thư chạy ngay sau khi lượt kết thúc nên
     * bản mới nhất của thread chính là bản của lượt vừa xong.
     *
     * Rỗng thì thủ thư dùng nguyên văn — chỉ là dò ứng viên kém chính xác hơn, không hỏng gì.
     */
    intent: (intent.latestFor(threadId) || {}).task || '',
    path: b.path,
    screen: '',
    steps: b.steps,
    deadEnds: b.dead_ends,
    answer: b.answer,
  };

  /**
   * TRẢ LỜI NGAY, rồi mới học.
   *
   * Client vốn đã bỏ kết quả (`.catch(() => {})` trong GuideExperienceRecorder) nên nó không cần
   * gì ở đây. Còn thủ thư là một lời gọi model có thể tốn hàng chục giây — giữ request mở chừng
   * đó là treo một kết nối cho việc không ai đọc.
   *
   * KHÔNG chạm `res` sau dòng này.
   */
  res.json({ received: true });

  // Không `await`: đây là nhánh nền. Mọi lỗi đã bị nuốt bên trong, `catch` này là lớp cuối để
  // một promise bị reject không thành `unhandledRejection` làm sập tiến trình.
  learnThenRecord(payload).catch((e) => console.error('[guide] học nền lỗi:', e?.message || e));
});

/** Xem kho kinh nghiệm của công ty mình. Chỉ admin — nó chứa câu hỏi thật của người dùng. */
/* ═══════════════ CẤU HÌNH — phục vụ màn hình chỉnh trợ lý ═══════════════
 *
 * Chỉ admin. Không phải vì dữ liệu nhạy cảm mà vì đây là những núm ĐỔI CHI PHÍ VÀ HÀNH VI của
 * trợ lý cho toàn bộ người dùng: hạ số bước xuống 3 là mọi lượt phức tạp đều đứt giữa chừng.
 *
 * Lược đồ trả kèm giá trị nên giao diện dựng form được mà không cần biết trước có những núm nào
 * — thêm một núm ở `guideSettings.js` là màn hình tự mọc thêm ô, không phải sửa hai chỗ.
 */
r.get('/settings', (req, res) => {
  if (!isAdminLike(req.user)) return res.status(403).json({ error: 'admin_only' });
  return res.json({
    ...settings.schema(),
    value: settings.getAll(),
    // Hai thứ KHÔNG chỉnh được từ đây, nhưng màn hình cần biết để giải thích vì sao có núm đang
    // vô hiệu: model quyết định nhánh suy luận nào đang chạy.
    provider: provider(),
    model: modelId(),
    model_adaptive: isAdaptive(),
    reasoning_kind: reasoningKind(),
    // Cảnh báo TRƯỚC khi người dùng bấm Lưu một nhà cung cấp chưa có key — chứ không để họ đổi
    // xong, hỏi một câu, rồi nhận 503.
    key_by_provider: keyForProvider(),
  });
});

/**
 * PHẦN CẤU HÌNH MÀ MỌI NGƯỜI DÙNG ĐƯỢC ĐỌC.
 *
 * `/settings` ở trên chặn ở `admin_only`, mà đúng như vậy: nó phơi cả model, hạn mức, giá tiền.
 * Nhưng bộ nhân vật lại là thứ HIỆN RA cho mọi người — nhân viên bình thường mở trang nào cũng
 * thấy nó. Không có đường này thì họ nhận 403 rồi mãi mãi xem bộ mặc định, còn núm chọn của
 * admin chỉ đổi được cho chính admin.
 *
 * Nên tách riêng, và chỉ trả về đúng những trường vô hại. Thêm núm mới vào `/settings` KHÔNG tự
 * rò qua đây — phải liệt kê tay ở dưới, cố ý như vậy.
 */
r.get('/ui-settings', (_req, res) => {
  res.set('Cache-Control', 'no-store'); // admin đổi bộ xong, lần tải kế tiếp phải thấy ngay
  return res.json({ mascot_set: settings.get('mascot_set') });
});

r.put('/settings', (req, res) => {
  if (!isAdminLike(req.user)) return res.status(403).json({ error: 'admin_only' });
  const result = settings.set(req.body);
  return res.status(result.ok ? 200 : 400).json(result);
});

r.post('/settings/defaults', (req, res) => {
  if (!isAdminLike(req.user)) return res.status(403).json({ error: 'admin_only' });
  return res.json(settings.reset());
});

/* ═══════════════ KIẾN THỨC — phục vụ màn hình quản lý ═══════════════
 *
 * Chỉ admin: kiến thức mô tả cấu trúc nội bộ hệ thống và ranh giới quyền của trợ lý.
 *
 * MỌI ĐƯỜNG GHI ĐỀU GỌI `refreshNow()` sau khi ghi xong. Không có nó thì người sửa bấm Lưu,
 * thấy báo thành công, rồi hỏi thử trợ lý và nhận đúng câu trả lời cũ — vì cache trong RAM chưa
 * đổi. Instance KHÁC thì tự biết nhờ nhịp dò số phiên bản 60 giây; instance NÀY phải làm ngay,
 * người vừa bấm Lưu không việc gì phải chờ một phút.
 *
 * Khoá là CẶP (source, path) — xem 602_guide_assistant_en.sql.
 */
function userName(req) {
  return String(req.user?.full_name || req.user?.email || req.user?.id || '').slice(0, 120);
}

r.get('/knowledge', async (req, res) => {
  if (!isAdminLike(req.user)) return res.status(403).json({ error: 'admin_only' });
  const result = await knowledgeDb.listAll();
  if (!result.ok) {
    // Không phải lỗi: chưa chạy migration thì kho vẫn chạy bằng tệp. Nói rõ để màn hình hướng
    // dẫn người dùng chạy 555 thay vì hiện một bảng trống không giải thích gì.
    return res.json({ list: [], storage: knowledgeDb.status(), read_only: true });
  }
  return res.json({ list: result.list, storage: knowledgeDb.status(), read_only: false });
});

r.put('/knowledge', async (req, res) => {
  if (!isAdminLike(req.user)) return res.status(403).json({ error: 'admin_only' });
  const { source, path: path, ...patch } = req.body || {};
  if (!source || !path) return res.status(400).json({ ok: false, reason: 'missing_source_or_path' });
  const result = await knowledgeDb.editChunk(source, path, patch, userName(req));
  if (result.ok) await knowledge.refreshNow();
  return res.status(result.ok ? 200 : 400).json(result);
});

r.post('/knowledge', async (req, res) => {
  if (!isAdminLike(req.user)) return res.status(403).json({ error: 'admin_only' });
  const result = await knowledgeDb.addChunk(req.body, userName(req));
  if (result.ok) await knowledge.refreshNow();
  return res.status(result.ok ? 200 : 400).json(result);
});

r.post('/knowledge/discard', async (req, res) => {
  if (!isAdminLike(req.user)) return res.status(403).json({ error: 'admin_only' });
  const { source, path: path, discard } = req.body || {};
  if (!source || !path) return res.status(400).json({ ok: false, reason: 'missing_source_or_path' });
  const result = await knowledgeDb.setDiscarded(source, path, discard !== false, userName(req));
  if (result.ok) await knowledge.refreshNow();
  return res.status(result.ok ? 200 : 400).json(result);
});

/** Trả một chunk về đúng bản mà generator sinh ra — chỉ được với chunk có nguồn là tệp. */
r.post('/knowledge/reset', async (req, res) => {
  if (!isAdminLike(req.user)) return res.status(403).json({ error: 'admin_only' });
  const { source, path: path } = req.body || {};
  const original = (knowledge.readFiles()[source] || []).find((c) => c.path === path);
  if (!original) return res.status(400).json({ ok: false, reason: 'khong_co_ban_goc' });
  const result = await knowledgeDb.resetToFile(source, path, original);
  if (result.ok) await knowledge.refreshNow();
  return res.status(result.ok ? 200 : 400).json(result);
});

/**
 * Nạp lại từ tệp — dùng sau khi ai đó chạy `npm run guide:sync` và muốn đẩy kết quả lên DB.
 * GIỮ NGUYÊN hàng đã sửa tay; số bị bỏ qua được trả về để người bấm biết.
 */
r.post('/knowledge/sync', async (req, res) => {
  if (!isAdminLike(req.user)) return res.status(403).json({ error: 'admin_only' });
  const result = await knowledgeDb.syncFromFiles(knowledge.readFiles(), { giuSuaTay: true });
  if (result.ok) await knowledge.refreshNow();
  return res.status(result.ok ? 200 : 400).json(result);
});

/* ═══════════════ KINH NGHIỆM — phục vụ màn hình quản lý ═══════════════
 *
 * Chỉ admin, và luôn theo `company_id` lấy từ JWT ĐÃ XÁC THỰC — không lấy từ tham số client.
 * Kho gộp chung theo công ty và được tiêm vào ngữ cảnh của mọi người trong công ty đó, nên đọc
 * nhầm kho của công ty khác là lộ đường đi nội bộ của họ.
 */
r.get('/experience/list', (req, res) => {
  if (!isAdminLike(req.user)) return res.status(403).json({ error: 'admin_only' });
  const company = req.user?.company_id || 'chung';
  return res.json({
    company: company,
    list: experience.listAll(company),
    // Bản của kho 'chung' — người chưa có company_id ghi vào đó, và admin cần thấy cả hai.
    shared_store: company === 'chung' ? [] : experience.listAll('chung'),
    storage: require('../../helpers/guideExperienceDb').status(),
    on: experience.isEnabled(),
  });
});

r.post('/experience/discard', (req, res) => {
  if (!isAdminLike(req.user)) return res.status(403).json({ error: 'admin_only' });
  const { code, reason, store } = req.body || {};
  const company = store === 'chung' ? 'chung' : (req.user?.company_id || 'chung');
  const result = experience.discardExperience({ company, code, reason });
  return res.status(result.discarded ? 200 : 400).json({ ok: !!result.discarded, ...result });
});

r.post('/experience/restore', (req, res) => {
  if (!isAdminLike(req.user)) return res.status(403).json({ error: 'admin_only' });
  const { code, store } = req.body || {};
  const company = store === 'chung' ? 'chung' : (req.user?.company_id || 'chung');
  const result = experience.restoreExperience({ company: company, code });
  return res.status(result.ok ? 200 : 400).json(result);
});

r.get('/debug/experience', (req, res) => {
  if (!isAdminLike(req.user)) return res.status(403).json({ error: 'admin_only' });
  return res.json({
    // Đang lưu ở đâu — câu hỏi đầu tiên khi kho trống bất thường.
    storage: require('../../helpers/guideExperienceDb').status(),
    /**
     * SUBAGENT Ý ĐỊNH — chuỗi thật đem đi truy vấn, không phải câu người dùng gõ.
     *
     * `recent` là chỗ soi quan trọng nhất khi kinh nghiệm dò trượt: đọc `task` xem subagent
     * hiểu đúng việc chưa. `on: false` kèm `reason` nghĩa là đang dò bằng nguyên văn như bản cũ.
     */
    intent: { ...intent.status(), recent: intent.recent() },
    /**
     * SUBAGENT THỦ THƯ — không ai thấy nó chạy, nên đây là cửa sổ DUY NHẤT.
     *
     * `recent` cho biết nó phán gì: `action` là add/append/replace/skip, `ma` là bản
     * nó chỉnh, `candidate_count` là nó được xem mấy bản. Toàn 'add' với `candidate_count: 0` nghĩa
     * là phép dò ứng viên đang trượt — kho sẽ phình bản trùng.
     */
    background_learn: { ...librarian.status(), recent: librarian.recentRuns },
    ...experience.stats(req.user?.company_id || 'chung'),
    // Số liệu để chỉnh ngưỡng: cứu hộ có hay nổ không, nổ ở trang nào, và có tìm thấy gì không.
    rescue: {
      threshold: {
        min_steps: Number(process.env.GUIDE_CUU_HO_BUOC) || 3,
        min_signals: Number(process.env.GUIDE_CUU_HO_TIN_HIEU) || 2,
      },
      recent: experience.rescueLog,
    },
    /**
     * Trần bước — thứ `maxSteps` không làm được (xem guideStepGuard.js).
     * `muc: 'nhac'` = chỉ nhắc; `muc: 'dung'` = đã gỡ tool khỏi lượt gọi đó.
     * Toàn 'dung' mà không có 'nhac' nghĩa là ngưỡng nhắc đặt quá cao.
     */
    step_guard: stepGuard.stats(),
  });
});

/**
 * SỰ KIỆN PHÍA SERVER của một lượt hỏi — để bảng "Hành động" vẽ được sơ đồ luồng.
 *
 * Luồng message của CopilotKit chỉ cho client thấy phần nổi (gọi tool nào, trả gì). Dò kinh
 * nghiệm, gọi API nhúng, cứu hộ, trần bước đều chạy trong middleware ở server nên vô hình —
 * mà đó lại đúng là phần giải thích được vì sao một lượt chậm hay đi sai.
 *
 * Cùng cổng quyền với `/debug/usage`: ở production chỉ admin, ở bản dev thì mở để soi cho nhanh.
 */
r.get('/debug/flow', (req, res) => {
  if (process.env.NODE_ENV === 'production' && !isAdminLike(req.user)) {
    return res.status(403).json({ error: 'admin_only' });
  }
  // Mặc định CHỈ lượt hỏi mới nhất — sơ đồ để soi một lượt. `?all=1` khi cần lần lại cả buổi.
  const all = req.query.all === '1';
  return res.json({ events: flowLog.read(req.query.thread_id, { all: all }) });
});

/**
 * GHI NHẬT KÝ MỘT LƯỢT — client gọi khi lượt kết thúc (xem GuideChatLog.jsx).
 *
 * Cùng lý do với `/kinh-nghiem`: server thấy từng lần gọi model rời rạc, không thấy một lượt của
 * người dùng bắt đầu và kết thúc ở đâu, mà CÂU TRẢ LỜI CUỐI lại nằm trong luồng phát ra của
 * request cuối cùng. Client giữ nguyên `agent.messages` nên biết chính xác.
 *
 * Danh tính lấy từ JWT, KHÔNG lấy từ thân request.
 */
r.post('/chat-log', async (req, res) => {
  const b = req.body || {};
  const result = await chatLog.writeTurn({
    userId: req.user?.id || req.user?.userId,
    companyId: req.user?.company_id,
    threadId: b.thread_id,
    turnNo: b.turn,
    path: b.path,
    question: b.question,
    answer: b.answer,
    steps: b.steps,
    provider: provider(),
    model: modelId(),
  });
  return res.json(result);
});

/**
 * TRA NHẬT KÝ — chỉ admin, và luôn bó trong công ty của chính người gọi.
 *
 * Đây là nội dung câu hỏi thật của nhân viên, không phải số liệu tổng hợp — bó theo công ty ở
 * TẦNG TRUY VẤN chứ không lọc sau, để một trang kết quả bị cắt cũng không lẫn công ty khác.
 */
r.get('/chat-log', async (req, res) => {
  if (!isAdminLike(req.user)) return res.status(403).json({ error: 'admin_only' });
  const result = await chatLog.queryTurns({
    day: req.query.day,
    userId: req.query.user_id,
    companyId: req.user?.company_id || undefined,
    search: req.query.search,
    page: req.query.page,
    perPage: req.query.per_page,
  });
  return res.json({ ...result, status: chatLog.status() });
});

/**
 * HẠN MỨC CỦA CHÍNH MÌNH — mọi người dùng đều gọi được, chỉ thấy số của bản thân.
 *
 * Giao diện gọi khi trợ lý báo lỗi, để phân biệt "hết lượt" với "hỏng thật": hai chuyện đó
 * nhìn từ phía client giống hệt nhau (luồng SSE đứt), mà cách xử lý thì khác hẳn.
 */
r.get('/quota', async (req, res) => {
  const result = await quota.usageToday(req.user?.id || req.user?.userId);
  return res.json(result);
});

/** Ai đã dùng bao nhiêu trong một ngày. Chỉ admin — đây là số liệu của người khác. */
r.get('/quota/by-day', async (req, res) => {
  if (!isAdminLike(req.user)) return res.status(403).json({ error: 'admin_only' });
  const result = await quota.byDay(req.query.day, req.user?.company_id);
  return res.json({ ...result, status: quota.status() });
});

/**
 * THỐNG KÊ THEO NGƯỜI DÙNG — tab "Người dùng" ở /settings/tro-ly-huong-dan.
 *
 * Chỉ admin. Admin công ty bị bó trong công ty mình ở TẦNG TRUY VẤN (theo `company_id` của từng
 * dòng), cùng luật với GET /chat-log; admin hệ thống không có công ty thì thấy tất cả. Khoảng ngày
 * mặc định 7 ngày, tối đa 92 — xem helpers/guideUserUsage.js.
 */
r.get('/usage/users', async (req, res) => {
  if (!isAdminLike(req.user)) return res.status(403).json({ error: 'admin_only' });
  const result = await userUsage.summarizeUsers({
    from: req.query.from,
    to: req.query.to,
    companyId: req.user?.company_id || undefined,
  });
  return res.status(result.ok ? 200 : 500).json(result);
});

r.get('/usage/users/:userId', async (req, res) => {
  if (!isAdminLike(req.user)) return res.status(403).json({ error: 'admin_only' });
  const userId = String(req.params.userId || '');
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return res.status(400).json({ ok: false, reason: 'user_id không hợp lệ' });
  const result = await userUsage.userDetail({
    userId,
    from: req.query.from,
    to: req.query.to,
    companyId: req.user?.company_id || undefined,
  });
  return res.status(result.ok ? 200 : 500).json(result);
});

/** Token + tiền của từng lượt gọi model trong một hội thoại. Xem helpers/guideUsage.js. */
r.get('/debug/usage', (req, res) => {
  if (process.env.NODE_ENV === 'production' && !isAdminLike(req.user)) {
    return res.status(403).json({ error: 'admin_only' });
  }
  // Không truyền thread_id → liệt kê các thread đang có. Dùng để soi khi bảng Chi phí hiện 0.
  if (!req.query.thread_id) return res.json({ threads: listThreads() });
  return res.json(readUsage(req.query.thread_id));
});

r.use('/', (req, res, next) => {
  /**
   * Kiểm key của NHÀ CUNG CẤP ĐANG CHỌN, không phải luôn luôn Anthropic.
   *
   * Và chặn ở ĐÂY chứ không để lỗi rơi vào trong: request thiếu key đi tới nhaCungCap sẽ trả 401,
   * mà 401 ở tầng đó bị agent framework nuốt — người dùng chỉ thấy trợ lý im lặng, log không có
   * gì để lần. Nêu thẳng tên biến còn thiếu là tiết kiệm hàng giờ dò tìm.
   */
  const envVar = keyEnvVar();
  if (!process.env[envVar]) {
    return res.status(503).json({
      error: 'Trợ lý hướng dẫn chưa sẵn sàng',
      hint: `Nhà cung cấp đang chọn là "${provider()}" nhưng backend/.env chưa có ${envVar}. `
        + 'Thêm biến đó rồi dựng lại container, hoặc đổi nhà cung cấp ở màn hình cấu hình trợ lý.',
    });
  }
  // Client Anthropic chỉ dựng khi thật sự dùng Anthropic — nó đọc ANTHROPIC_API_KEY, mà biến đó
  // có thể không tồn tại khi đang chạy nhà cung cấp khác.
  if (isAnthropic()) ensureAnthropicClient();

  /**
   * ═══════════ HẠN MỨC NGÀY ═══════════
   *
   * Kiểm Ở ĐÂY, trước khi chạm tới model. Không kiểm ở tầng AG-UI vì tầng đó không trả về được
   * một phản hồi HTTP tử tế — chặn ở trong đó thì client chỉ thấy luồng SSE đứt, không có lý do.
   *
   * Đọc `req.body` được vì `express.json()` toàn cục đã phân tích xong (xem ghi chú ở server.js
   * về việc KHÔNG bypass middleware JSON cho đường dẫn này).
   *
   * Đây là hàm async trong một middleware đồng bộ, nên phải trả về promise và để nhánh gọi
   * runtime nằm bên trong — `return` sớm ở ngoài không chặn được gì.
   */
  const continueRun = () => {
    // Bẫy 4: Express cắt mount path — req.url bên trong middleware này chỉ còn "/".
    req.url = req.originalUrl;

    // Chống đệm SSE ở tầng proxy (nginx/Cloudflare) + Nagle — đặt TRƯỚC khi gọi handler,
    // vì runtime chỉ setHeader thêm chứ không xoá header đã có.
    res.setHeader('X-Accel-Buffering', 'no');
    try { res.socket?.setNoDelay(true); } catch { /* ignore */ }

    // Bẫy 5: handler là async, try/catch đồng bộ không bắt được promise reject.
    let out;
    try {
      out = buildHandler(req.user, isFullAccess(req))(req, res);
    } catch (e) { return failed(e, res, next); }
    return Promise.resolve(out).catch((e) => failed(e, res, next));
  };

  /**
   * CHỈ kiểm hạn mức trên LƯỢT CHẠY THẬT của agent.
   *
   * DỮ LIỆU NẰM TRONG PHONG BÌ, không ở tầng ngoài. Runtime v2 POST lên dạng
   * `{ method: "agent/run", params: { agentId }, body: { threadId, runId, messages, tools, … } }`
   * — bản đầu của tôi đọc `req.body.threadId` nên nó luôn rỗng, cổng bỏ qua sạch, và hạn mức
   * đếm 0 dù đã hỏi ba câu. Đo bằng cách chộp đúng thân request trình duyệt gửi đi.
   *
   * Lọc theo `method` chứ không theo `req.method === 'POST'`: cổng này khớp MỌI đường dẫn dưới
   * /api/copilotkit và runtime còn tự gọi `/info`. Chỉ `agent/run` mới là một lượt hỏi.
   */
  const body = req.body?.body;
  if (req.body?.method !== 'agent/run' || !body?.threadId) return continueRun();

  return quota
    .checkTurn({
      userId: req.user?.id || req.user?.userId,
      companyId: req.user?.company_id,
      threadId: body.threadId,
      turnNo: realTurnCount(body.messages),
    })
    .then((h) => {
      if (h.allowed) return continueRun();
      /**
       * 429, không phải 403: đây là "đã hết lượt hôm nay", một trạng thái TẠM THỜI tự hết vào
       * nửa đêm — khác hẳn "bạn không có quyền". Mã đúng giúp người đọc log phân biệt được hai
       * chuyện đó mà không phải đọc thân phản hồi.
       *
       * Thân phản hồi nêu đủ số liệu để giao diện hiện câu tử tế: hết vì câu hỏi hay vì token,
       * đã dùng bao nhiêu, trần là bao nhiêu.
       */
      const exhausted = h.reason === 'token_limit';
      return res.status(429).json({
        error: 'quota_exceeded',
        reason: h.reason,
        message: exhausted
          ? `Bạn đã dùng hết hạn mức token hôm nay (${h.token_count?.toLocaleString('vi-VN')}/`
            + `${h.max_tokens?.toLocaleString('vi-VN')} token). Hạn mức đặt lại vào nửa đêm.`
          : `Bạn đã hỏi hết ${h.max_questions} câu được phép hôm nay. Hạn mức đặt lại vào nửa đêm.`,
        question_count: h.question_count,
        max_questions: h.max_questions,
        token_count: h.token_count,
        max_token: h.max_tokens,
      });
    })
    .catch((e) => failed(e, res, next));
});

function failed(e, res, next) {
  console.error('[guide] handler error:', e?.stack || e?.message || e);
  if (res.headersSent) return undefined;
  if (process.env.NODE_ENV === 'production') return next(e);
  return res.status(500).json({ error: 'guide_handler_failed', message: String(e?.message || e) });
}

module.exports = r;
