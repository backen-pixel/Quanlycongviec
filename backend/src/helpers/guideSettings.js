/**
 * CẤU HÌNH CHẠY ĐỘNG CỦA TRỢ LÝ HƯỚNG DẪN — một nguồn duy nhất cho cả API lẫn màn hình chỉnh.
 *
 * VÌ SAO CẦN. Trước đây mọi núm chỉnh đều là hằng đọc từ `process.env` LÚC NẠP MODULE: ngân sách
 * suy luận, số lượt nhớ, ngưỡng kinh nghiệm, trần số bước. Muốn đổi một con số thì phải sửa
 * `.env` rồi dựng lại container — mất vài phút cho mỗi lần thử, nên trên thực tế không ai chỉnh,
 * và những con số đó nằm nguyên ở giá trị đoán từ ngày đầu.
 *
 * BA NGUYÊN TẮC:
 *
 * 1. `.env` VẪN LÀ MẶC ĐỊNH. File này không thay thế biến môi trường mà nằm ĐÈ LÊN nó. Chưa ai
 *    chỉnh gì thì hành vi giống hệt trước — không có chuyện thêm màn hình cấu hình vào rồi trợ
 *    lý đổi tính nết dù chưa ai bấm gì.
 *
 * 2. ĐỌC TẠI THỜI ĐIỂM DÙNG, không đọc lúc nạp module. Agent vốn đã được dựng lại mỗi request
 *    (xem bẫy 2 trong copilotkit.js) nên chỉnh xong là lượt hỏi kế tiếp đã theo giá trị mới,
 *    không cần khởi động lại gì.
 *
 * 3. LƯỢC ĐỒ Ở ĐÂY, KHÔNG Ở GIAO DIỆN. Kiểu dữ liệu, khoảng hợp lệ, đơn vị, lời giải thích —
 *    tất cả khai báo một chỗ rồi API trả nguyên cho giao diện dựng form. Đặt khoảng hợp lệ ở
 *    giao diện là sớm muộn cũng có người gọi thẳng API và nhét vào một con số vô lý.
 *
 * Lưu cùng thư mục với kho kinh nghiệm (`uploads/guide-memory/`) vì đó là volume Docker — dựng
 * lại container không mất cấu hình.
 */

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', '..', 'uploads', 'guide-memory');
const FILE = path.join(DIR, 'settings.json');

/* ─────────────────────────── Đọc mặc định từ env ─────────────────────────── */

function numEnv(name, fallback, { min = -Infinity, max = Infinity } = {}) {
  const raw = process.env[name];
  if (raw === undefined || String(raw).trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function boolEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || String(raw).trim() === '') return fallback;
  return raw !== '0' && raw.toLowerCase() !== 'false';
}

/* ─────────────────────────── Lược đồ ─────────────────────────── */

/**
 * `group` khớp với các thẻ trên màn hình chỉnh. Thứ tự trong mảng chính là thứ tự hiển thị.
 *
 * `default` là HÀM chứ không phải giá trị: `process.env` được dotenv nạp trước module này,
 * nhưng để hàm thì giá trị mặc định luôn phản ánh env HIỆN TẠI, và test đổi env chạy được mà
 * không phải xoá cache require.
 */
/**
 * NHÀ CUNG CẤP VÀ MODEL.
 *
 * Trợ lý hướng dẫn chạy qua CopilotKit + AI SDK (`ai`, `@ai-sdk/*`), KHÁC HẲN sáu tính năng AI
 * còn lại của hệ thống — chúng gọi thẳng REST tới `api.openai.com` bằng `fetch`. Đừng gộp hai
 * đường đó lại: bên kia không đi qua `wrapLanguageModel`, không có middleware, không có
 * `providerOptions`.
 *
 * ID MODEL CLAUDE KHÔNG BAO GIỜ CÓ HẬU TỐ NGÀY. `claude-sonnet-5`, `claude-haiku-4-5` — thêm
 * `-20251001` vào là API trả 400 ngay từ request đầu.
 */
const PROVIDERS = ['anthropic', 'openai', 'token-codex'];

/**
 * `token-codex` là proxy NGOÀI, tương thích OpenAI, endpoint `https://codex.anhlaptrinh.vn/v1`.
 * Danh sách model do chủ hệ thống cung cấp — không đoán tên, và đối chiếu lại bằng `GET /v1/models`
 * của chính endpoint đó khi đã có key.
 *
 * Nó khai `"api": "openai-completions"`, tức chỉ có `/v1/chat/completions`. Chi tiết này quyết
 * định cách dựng model ở copilotkit.js: `@ai-sdk/openai` MẶC ĐỊNH gọi Responses API
 * (`/v1/responses`), nên phải chuyển sang nhánh `.chat()` cho nhà cung cấp này.
 */
const MODELS_BY_PROVIDER = {
  anthropic: ['claude-sonnet-5', 'claude-haiku-4-5'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini'],
  'token-codex': ['GPT-5.6-sol', 'GPT-5.6-terra', 'GPT-5.6-luna', 'GPT-6-astra'],
};

function modelsOf(provider) {
  return MODELS_BY_PROVIDER[provider] || [];
}

/**
 * ═══════════ KHẢ NĂNG SUY LUẬN — THEO TỪNG MODEL, KHÔNG THEO NHÀ CUNG CẤP ═══════════
 *
 * Bản đầu của tính năng đa nhà cung cấp coi suy luận là "chuyện riêng của Anthropic" và tắt sạch
 * ở mọi nơi khác. Sai, và đã đo được bằng gọi thật:
 *
 *   claude-sonnet-5   thinking.adaptive          model tự quyết câu nào cần nghĩ
 *   claude-haiku-4-5  thinking.enabled+budget    bắt nghĩ mọi lượt, có trần token
 *   GPT-5.6-*         reasoning_effort           CÓ tác dụng thật: 25,8s → 6,3s khi để 'low'
 *   gpt-4o / gpt-4.1  KHÔNG CÓ                   gửi reasoning_effort là lỗi 400
 *                                                «Unrecognized request argument supplied»
 *
 * Bốn kiểu, cắt theo MODEL chứ không theo nhà cung cấp — `gpt-4o` và `GPT-5.6-terra` đều đi qua
 * `createOpenAI` mà một bên nhận, một bên nổ 400. Bảng này là nguồn duy nhất cho cả ba việc:
 * gửi tham số nào, bật hay làm mờ núm nào trên giao diện, và mô tả model ra sao.
 */
const CAPABILITIES = {
  'claude-sonnet-5': { reasoning: 'adaptive' },
  'claude-haiku-4-5': { reasoning: 'budget' },

  'gpt-4o': { reasoning: 'none' },
  'gpt-4o-mini': { reasoning: 'none' },
  'gpt-4.1': { reasoning: 'none' },
  'gpt-4.1-mini': { reasoning: 'none' },

  'GPT-5.6-sol': { reasoning: 'effort' },
  'GPT-5.6-terra': { reasoning: 'effort' },
  'GPT-5.6-luna': { reasoning: 'effort' },
  'GPT-6-astra': { reasoning: 'effort' },
};

/** Model lạ (thêm vào danh sách mà quên khai) rơi về 'khong' — thà mất suy luận còn hơn nổ 400. */
function capabilitiesOf(modelIdOrNull) {
  const id = String(modelIdOrNull || get('model') || '').trim();
  return CAPABILITIES[id] || { reasoning: 'none' };
}

/**
 * Mặc định của `model` PHỤ THUỘC nhà cung cấp đang có hiệu lực, nên nó phải gọi `get()` chứ
 * không đọc env một mình. Thiếu chỗ này thì đổi sang OpenAI xong, `set()` so giá trị mới với
 * "mặc định" vẫn là một model Claude, và nó lưu một cặp vô nghĩa vào tệp cấu hình.
 */
function defaultModel(provider) {
  const n = provider || get('provider');
  const list = modelsOf(n);
  if (n === 'anthropic') {
    const env = String(process.env.ANTHROPIC_MODEL || '').trim();
    if (list.includes(env)) return env;
  }
  return list[0] || '';
}

/**
 * Model mặc định cho SUBAGENT Ý ĐỊNH — cố ý KHÁC `defaultModel()`.
 *
 * Việc của subagent là viết lại một câu ngắn, chạy ở MỌI lượt hỏi. Nên mặc định là bản rẻ nhất
 * trong danh sách của từng nhà cung cấp, không phải model của trợ lý chính. Ai muốn đổi thì đổi
 * trên màn hình cấu hình — nhưng mặc định phải là bản rẻ, vì cái giá này nhân với mọi câu hỏi.
 */
const SMALL_MODEL_BY_PROVIDER = {
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-4o-mini',
  'token-codex': 'GPT-5.6-luna',
};

function defaultSmallModel(provider) {
  const n = provider || get('provider');
  const list = modelsOf(n);
  const small = SMALL_MODEL_BY_PROVIDER[n];
  if (small && list.includes(small)) return small;
  return list[list.length - 1] || '';
}

const FIELDS = [
  /* ── Mô hình ── */
  {
    key: 'provider',
    group: 'model',
    label: 'Nhà cung cấp',
    type: 'select',
    choices: PROVIDERS,
    default: () => {
      const v = String(process.env.GUIDE_AI_PROVIDER || '').trim().toLowerCase();
      return PROVIDERS.includes(v) ? v : 'anthropic';
    },
    description: 'Đổi nhà cung cấp là đổi luôn danh sách model bên dưới. Mỗi nhà cung cấp dùng API key '
      + 'RIÊNG của nó (ANTHROPIC_API_KEY / OPENAI_API_KEY / CUSTOME_PROVIDER_API_KEY) — thiếu key thì '
      + 'trợ lý báo lỗi ngay ở cửa vào chứ không mượn key của bên kia. Nhóm "Độ dài suy luận" chỉ '
      + 'chạy trên Anthropic. "token-codex" là proxy ngoài (codex.anhlaptrinh.vn) — người dùng phải '
      + 'CHỜ TRỰC TIẾP trên giao diện, nên đo độ trễ trước khi để nó chạy thường xuyên.',
  },
  {
    key: 'model',
    group: 'model',
    label: 'Model',
    type: 'dependent_select',
    depends_on: 'provider',
    choices_by: MODELS_BY_PROVIDER,
    default: () => defaultModel(),
    /**
     * Mặc định của TỪNG nhà cung cấp, không chỉ nhà cung cấp đang chọn.
     *
     * Cần vì lúc đổi cha, con phải nhảy về MẶC ĐỊNH của cha mới chứ không phải phần tử đầu danh
     * sách. Đã đo lỗi thật: đang chạy `claude-haiku-4-5`, đổi sang token-codex rồi quay lại
     * anthropic thì ra `claude-sonnet-5` — im lặng đổi model của người ta sang một model khác,
     * đắt hơn và có kiểu suy luận khác hẳn.
     *
     * Giao diện cũng dùng bảng này: nó không tự tính được mặc định của một nhà cung cấp mà nó
     * chưa từng chọn.
     */
    defaults_by: () => Object.fromEntries(PROVIDERS.map((n) => [n, defaultModel(n)])),
    description: 'Đổi xong là lượt hỏi kế tiếp đã dùng model mới — agent vốn dựng lại mỗi request. '
      + 'claude-sonnet-5 mạnh và tự quyết mức suy luận; claude-haiku-4-5 rẻ và nhanh hơn nhưng '
      + 'bắt buộc nghĩ ở mọi lượt. Model của OpenAI và token-codex chưa có trong bảng giá nên sổ '
      + 'chi phí để trống thay vì đoán bừa một con số. '
      + 'ĐỘ TRỄ MỖI BƯỚC GỌI TOOL, đã đo thật (một yêu cầu đời thường tốn 5–6 bước, nhân lên mà '
      + 'ước): claude-haiku-4-5 1,6s · GPT-5.6-terra 4,6s · GPT-5.6-sol 5,1s · GPT-5.6-luna 30,8s · '
      + 'GPT-6-astra 45,4s. Bốn model token-codex đều gọi tool đúng, nhưng astra ở mức đó thì một '
      + 'yêu cầu 5 bước mất hơn 4 phút — trợ lý này là chỗ người dùng ngồi chờ trực tiếp, không '
      + 'phải job chạy nền.',
  },

  /* ── Hạn mức ngày ── */
  {
    key: 'daily_question_quota',
    group: 'quota',
    label: 'Số câu hỏi tối đa mỗi người / ngày',
    type: 'number',
    min: 0,
    max: 500,
    step: 1,
    unit: 'câu',
    default: () => numEnv('GUIDE_HAN_MUC_CAU_HOI', 0, { min: 0, max: 500 }),
    description: 'Đặt 0 = KHÔNG giới hạn (mặc định — bật tính năng này lên là một quyết định, không '
      + 'phải trạng thái vô tình). Đếm theo LƯỢT HỎI, không theo lần gọi model: một câu hỏi tốn '
      + '5–6 lần gọi vẫn tính đúng một câu. Mốc sang ngày là nửa đêm giờ Việt Nam. Áp cho MỌI '
      + 'người, kể cả quản trị viên.',
  },
  {
    key: 'daily_token_quota',
    group: 'quota',
    label: 'Số token tối đa mỗi người / ngày',
    type: 'number',
    min: 0,
    max: 20000000,
    step: 10000,
    unit: 'token',
    default: () => numEnv('GUIDE_HAN_MUC_TOKEN', 0, { min: 0 }),
    description: 'Đặt 0 = không giới hạn. Tính TỔNG token vào + ra + cache của mọi bước trong ngày. '
      + 'Dùng cùng lúc với hạn mức câu hỏi được — chạm cái nào trước thì chặn theo cái đó. '
      + 'Hạn mức token chặn câu HỎI TIẾP THEO chứ không cắt ngang câu đang trả lời dở.',
  },

  {
    key: 'chat_log_enabled',
    group: 'quota',
    label: 'Lưu nhật ký hỏi đáp',
    type: 'boolean',
    default: () => boolEnv('GUIDE_NHAT_KY', true),
    description: 'Lưu ĐẦY ĐỦ mỗi lượt vào DB: câu hỏi, câu trả lời, các bước đã làm và trạng thái từng '
      + 'bước. Khác kho kinh nghiệm (chỉ giữ lượt đáng học) và khác bảng hạn mức (chỉ đếm, không '
      + 'có nội dung). Dùng để đối chiếu khi có người báo trợ lý trả lời sai, và để biết nhân '
      + 'viên thật sự đang hỏi những gì. Tắt thì ngừng ghi ngay, dữ liệu cũ vẫn còn.',
  },

  /* ── Chi phí ── */
  {
    key: 'usd_vnd_rate',
    group: 'cost',
    label: 'Tỷ giá USD → VND',
    type: 'number',
    min: 1000,
    max: 100000,
    step: 100,
    unit: '₫ / 1 USD',
    default: () => numEnv('USD_VND_RATE', numEnv('GUIDE_USD_VND', 26000)),
    description: 'Chỉ dùng để quy đổi hiển thị trong sổ chi phí. Không ảnh hưởng gì tới cách trợ lý trả lời.',
  },

  /* ── Bộ nhớ hội thoại ── */
  {
    key: 'remembered_turns',
    group: 'memory',
    label: 'Số lượt hỏi được nhớ',
    type: 'number',
    min: 0,
    max: 100,
    step: 1,
    unit: 'lượt',
    default: () => numEnv('GUIDE_SO_LUOT', 5, { min: 0 }),
    description: 'Mỗi lượt gồm câu hỏi và TOÀN BỘ phần trợ lý xử lý cho câu đó (bước tool, kết quả, suy luận). '
      + 'Đặt 0 = không cắt, gửi lại cả hội thoại — phiên dài sẽ chạm trần ngữ cảnh của model rồi lỗi giữa chừng.',
  },

  /* ── Kinh nghiệm ── */
  {
    key: 'experience_enabled',
    group: 'experience',
    label: 'Bật bộ nhớ kinh nghiệm',
    type: 'boolean',
    default: () => boolEnv('GUIDE_KINH_NGHIEM', true),
    description: 'Tắt thì trợ lý không đọc và không ghi kinh nghiệm nữa. Kho cũ vẫn còn nguyên, bật lại là dùng tiếp.',
  },
  {
    key: 'intent_enabled',
    group: 'experience',
    label: 'Subagent diễn giải ý định',
    type: 'boolean',
    default: () => boolEnv('GUIDE_Y_DINH', true),
    description: 'BẬT: trước khi dò kho, một model NHỎ đọc câu hỏi cộng mấy lượt gần nhất rồi viết ra '
      + 'một câu việc độc lập để đem đi dò — chữa được câu tiếp nối ("còn tháng trước thì sao?") '
      + 'và câu tả triệu chứng, những câu mà dò bằng nguyên văn luôn trượt. TẮT: dò bằng đúng '
      + 'nguyên văn câu hỏi như bản cũ. Tốn thêm MỘT lời gọi model nhỏ mỗi LƯỢT HỎI (không phải '
      + 'mỗi bước — có bộ đệm theo lượt). Agent chính không thấy gì khác, nó vẫn nhận kinh nghiệm '
      + 'qua ngữ cảnh và không mất bước nào.',
  },
  {
    key: 'intent_model',
    group: 'experience',
    label: 'Model cho subagent ý định',
    type: 'dependent_select',
    depends_on: 'provider',
    choices_by: MODELS_BY_PROVIDER,
    default: () => defaultSmallModel(),
    description: 'Chọn model RẺ NHẤT dùng được: việc của nó chỉ là viết lại một câu ngắn, không cần suy '
      + 'luận sâu. Dùng model đắt ở đây là trả tiền cao cho một việc nhỏ chạy ở mọi lượt hỏi. Nó '
      + 'đi cùng nhà cung cấp và cùng API key với trợ lý chính.',
  },
  {
    key: 'background_learn_enabled',
    group: 'experience',
    label: 'Subagent thủ thư (học nền)',
    type: 'boolean',
    default: () => boolEnv('GUIDE_HOC_NEN', true),
    description: 'BẬT: sau khi một lượt kết thúc, một model đọc lại biên bản lượt đó CỘNG những bản ghi '
      + 'gần giống trong kho, rồi tự quyết thêm mới / bổ sung / sửa / bỏ qua. Nó viết được bài học '
      + 'và câu việc đọc-một-mình-vẫn-hiểu — thứ mà luồng ghi máy móc không làm được. TẮT: quay về '
      + 'ghi máy móc (chép chuỗi tool, gộp theo độ trùng chữ). Chạy NỀN sau khi người dùng đã có '
      + 'câu trả lời, nên không làm chậm lượt nào. Nó KHÔNG được phép xoá — xoá vẫn là việc của '
      + 'tool discard_experience, nơi có bằng chứng trực tiếp.',
  },
  {
    key: 'background_learn_model',
    group: 'experience',
    label: 'Model cho subagent thủ thư',
    type: 'dependent_select',
    depends_on: 'provider',
    choices_by: MODELS_BY_PROVIDER,
    default: () => defaultSmallModel(),
    description: 'Việc này KHÓ hơn diễn giải ý định — nó phải so nội dung và phán "bản cũ sai hay chỉ '
      + 'thiếu". Mặc định vẫn là model rẻ vì nó chạy nền và sai thì chỉ mất một bản ghi; nếu thấy '
      + 'kho có bản ghi lộn xộn thì nâng model ở đây trước khi nâng chỗ khác.',
  },
  {
    key: 'experience_threshold',
    group: 'experience',
    label: 'Ngưỡng giống nhau để nhắc lại',
    type: 'number',
    min: 0.1,
    max: 0.9,
    step: 0.01,
    unit: 'Jaccard 0–1',
    default: () => numEnv('GUIDE_KINH_NGHIEM_NGUONG', 0.34, { min: 0.1, max: 0.9 }),
    description: 'Hạ xuống thì nhắc rộng tay hơn nhưng dễ nhắc nhầm việc khác; nâng lên thì chỉ nhắc khi câu hỏi gần như trùng.',
  },
  {
    key: 'experience_recall_count',
    group: 'experience',
    label: 'Nhắc tối đa mỗi lượt',
    type: 'number',
    min: 1,
    max: 5,
    step: 1,
    unit: 'kinh nghiệm',
    default: () => numEnv('GUIDE_KINH_NGHIEM_SO_NHAC', 2, { min: 1, max: 5 }),
    description: 'Nhiều hơn thì ngữ cảnh phình mà model vẫn chủ yếu dùng cái đầu tiên.',
  },
  {
    key: 'rescue_min_steps',
    group: 'experience',
    label: 'Cứu hộ: tối thiểu bao nhiêu bước',
    type: 'number',
    min: 1,
    max: 10,
    step: 1,
    unit: 'bước',
    default: () => numEnv('GUIDE_CUU_HO_BUOC', 3, { min: 1, max: 10 }),
    description: 'Dưới ngần này bước thì chưa coi là bí, dù tool có trượt. Chuỗi dài là chuyện bình thường.',
  },
  {
    key: 'rescue_min_signals',
    group: 'experience',
    label: 'Cứu hộ: số tín hiệu bí',
    type: 'number',
    min: 1,
    max: 6,
    step: 1,
    unit: 'tín hiệu',
    default: () => numEnv('GUIDE_CUU_HO_TIN_HIEU', 2, { min: 1, max: 6 }),
    description: 'Tín hiệu bí = tool trả thất bại, hoặc gọi lại y hệt một lời gọi đã gọi. Đủ ngần này mới dò kinh nghiệm lần hai.',
  },
  {
    key: 'rescue_threshold',
    group: 'experience',
    label: 'Cứu hộ: ngưỡng giống nhau',
    type: 'number',
    min: 0.05,
    max: 0.8,
    step: 0.01,
    unit: 'Jaccard 0–1',
    default: () => numEnv('GUIDE_CUU_HO_NGUONG', 0.22, { min: 0.05, max: 0.8 }),
    description: 'Thấp hơn ngưỡng thường, cố ý: lúc đã bí thì một gợi ý gần đúng vẫn hơn không có gì.',
  },

  {
    key: 'semantic_enabled',
    group: 'experience',
    label: 'Dò kinh nghiệm theo ngữ nghĩa',
    type: 'boolean',
    default: () => boolEnv('GUIDE_EMBEDDING', true),
    description: 'Khi dò theo từ khoá không ra kết quả nào thì nhúng câu hỏi và dò tiếp bằng vector. '
      + 'Bắt được ca "cùng ý, khác chữ" mà từ khoá không bao giờ bắt được (đo: "đếm số công ty" ↔ '
      + '"có bao nhiêu cty", 0 từ chung). Đổi lại một vòng gọi mạng — chỉ ở những lượt từ khoá trượt.',
  },
  {
    key: 'semantic_threshold',
    group: 'experience',
    label: 'Ngưỡng ngữ nghĩa (cosine)',
    type: 'number',
    min: 0.35,
    max: 0.9,
    step: 0.01,
    unit: 'cosine 0–1',
    default: () => numEnv('GUIDE_EMBEDDING_NGUONG', 0.44, { min: 0.35, max: 0.9 }),
    description: 'Đo trên kho thật sau khi nhúng CẢ NỘI DUNG: câu liên quan thấp nhất 0,511, câu lạc đề cao '
      + 'nhất 0,361 — cách nhau 0,149. Đặt 0,44 là điểm GIỮA hai nhóm, chừa lề đều cho cả hai phía. '
      + '(Hồi chỉ nhúng câu hỏi, hai nhóm chỉ cách nhau 0,002 và không có chỗ nào an toàn để đặt.)',
  },

  /* ── Suy luận ── */
  {
    key: 'reasoning_enabled',
    group: 'reasoning',
    label: 'Bật suy luận',
    type: 'boolean',
    default: () => boolEnv('GUIDE_SHOW_THINKING', true),
    description: 'Tắt thì trợ lý trả lời thẳng, nhanh và rẻ hơn, nhưng hỏng ở những câu cần lập luận nhiều bước.',
  },
  {
    key: 'reasoning_budget',
    group: 'reasoning',
    label: 'Trần token suy luận',
    type: 'number',
    min: 1024,
    max: 32000,
    step: 256,
    unit: 'token',
    default: () => numEnv('GUIDE_THINKING_BUDGET', 2000, { min: 1024 }),
    description: 'TRẦN, không phải mức chi — dùng bao nhiêu tính tiền bấy nhiêu. Sàn 1024 là quy định của API. '
      + 'CHỈ có tác dụng với model đời cũ (Haiku 4.5); model 4.6 trở lên tự quyết và bỏ qua con số này.',
  },
  {
    key: 'reasoning_effort',
    group: 'reasoning',
    label: 'Mức công sức',
    type: 'select',
    choices: ['(mặc định của API)', 'low', 'medium', 'high', 'xhigh', 'max'],
    default: () => (['low', 'medium', 'high', 'xhigh', 'max'].includes(process.env.GUIDE_EFFORT)
      ? process.env.GUIDE_EFFORT : '(mặc định của API)'),
    description: 'Núm chỉnh chi phí/độ trễ THAY CHO trần token, và CHỈ chạy trên model 4.6 trở lên. '
      + 'Model đời cũ không có tham số này nên chọn gì cũng không đổi.',
  },

  /* ── Số lần lặp ── */
  {
    key: 'max_steps',
    group: 'iterations',
    label: 'Trần số bước mỗi lượt',
    type: 'number',
    min: 3,
    max: 30,
    step: 1,
    unit: 'bước',
    default: () => numEnv('GUIDE_MAX_STEPS', 12, { min: 3, max: 30 }),
    description: 'Một yêu cầu đời thường ở chế độ toàn quyền đã tốn 5–6 bước. Đặt sát mép thì model hết bước '
      + 'giữa chuỗi rồi im — đúng triệu chứng "chỉ suy luận rồi không trả lời". LƯU Ý: núm này chỉ '
      + 'bó được chuỗi tool CHẠY Ở SERVER; tool chạy trên trình duyệt kết thúc request nên bộ đếm '
      + 'của nó về 0 — hai núm dưới mới là trần thật.',
  },
  {
    key: 'step_guard_warn',
    group: 'iterations',
    label: 'Nhắc dừng khi tới bước',
    type: 'number',
    min: 0,
    max: 40,
    step: 1,
    unit: 'bước',
    default: () => numEnv('GUIDE_CHAN_BUOC_NHAC', 8, { min: 0, max: 40 }),
    description: 'Tới ngần này bước trong CÙNG một lượt thì chèn một lời nhắc: sắp hết, chưa xong thì '
      + 'báo thật đi. Đặt 0 để tắt. Đếm xuyên qua mọi request, không như "Trần số bước".',
  },
  {
    key: 'step_guard_stop',
    group: 'iterations',
    label: 'Chặn cứng ở bước',
    type: 'number',
    min: 0,
    max: 60,
    step: 1,
    unit: 'bước',
    default: () => numEnv('GUIDE_CHAN_BUOC_DUNG', 14, { min: 0, max: 60 }),
    description: 'Tới ngần này bước thì GỠ HẲN tool khỏi lần gọi đó — model không còn cách nào gọi tiếp, '
      + 'buộc phải trả lời bằng lời. Đây là thứ duy nhất chặn được vòng lặp mà không phụ thuộc '
      + 'model có nghe lời hay không. Đặt 0 để tắt.',
  },

  /* ── Giao diện ── */
  {
    key: 'mascot_set',
    group: 'appearance',
    label: 'Bộ nhân vật',
    type: 'select',
    choices: ['anime', 'la-ban'],
    choice_labels: {
      anime: 'Cô gái áo trắng (ảnh)',
      'la-ban': 'Robot la bàn (vector)',
    },
    default: () => 'anime',
    description: 'Hình nhân vật hiện trên mọi trang khi trợ lý làm việc. Đây là núm DUY NHẤT ở màn '
      + 'hình này mà người dùng thường thấy ngay — nó không đổi hành vi hay chi phí, chỉ đổi ảnh. '
      + 'Đổi xong có hiệu lực ở lần tải trang kế tiếp của từng người (trình duyệt nhớ lại lựa chọn '
      + 'nên không nhấp nháy đổi bộ giữa chừng). "Robot la bàn" vẽ bằng SVG: cả bộ ~10 KB thay vì '
      + '~1,4 MB, và nét không vỡ trên màn hình độ phân giải cao. Danh sách này lấy từ '
      + 'frontend/src/features/guide/lib/mascotSprite.js — thêm bộ ở đó thì phải thêm mã bộ vào đây.',
  },
];

const GROUPS = [
  { id: 'model', name: 'Nhà cung cấp & model' },
  { id: 'quota', name: 'Hạn mức mỗi người / ngày' },
  { id: 'cost', name: 'Tính toán chi phí' },
  { id: 'memory', name: 'Bộ nhớ hội thoại' },
  { id: 'experience', name: 'Bộ nhớ kinh nghiệm' },
  { id: 'reasoning', name: 'Độ dài suy luận' },
  { id: 'iterations', name: 'Số lần lặp' },
  { id: 'appearance', name: 'Giao diện' },
];

const BY_KEY = new Map(FIELDS.map((t) => [t.key, t]));

/* ─────────────────────────── Đọc / ghi tệp ─────────────────────────── */

let overrides = null; // phần ĐÈ đã lưu; null = chưa đọc

function readOverrides() {
  if (overrides) return overrides;
  try {
    const x = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    overrides = (x && typeof x === 'object' && !Array.isArray(x)) ? x : {};
  } catch {
    // Không có tệp là trạng thái BÌNH THƯỜNG (chưa ai chỉnh gì), không phải lỗi — đừng ồn ào.
    overrides = {};
  }
  return overrides;
}

function writeFile() {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    // Ghi nguyên tử, cùng lý do với kho kinh nghiệm: chết giữa chừng thì để lại JSON cụt.
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(overrides, null, 1), 'utf8');
    fs.renameSync(tmp, FILE);
    return true;
  } catch (e) {
    console.error('[guide] không ghi được cài đặt:', e?.message || e);
    return false;
  }
}

/* ─────────────────────────── API trong tiến trình ─────────────────────────── */

/** Giá trị đang có hiệu lực của một khoá. Đây là hàm mà mã chạy nên gọi. */
function get(key) {
  const t = BY_KEY.get(key);
  if (!t) return undefined;
  const d = readOverrides();
  const v = Object.prototype.hasOwnProperty.call(d, key) ? d[key] : t.default();

  /**
   * LƯỚI AN TOÀN cho trường phụ thuộc: tệp cấu hình sửa tay (hoặc còn sót từ bản cũ) có thể
   * chứa cặp vô nghĩa kiểu `openai` + `claude-sonnet-5`. Trả nguyên cặp đó ra là request đi
   * thẳng tới OpenAI với một model không tồn tại rồi 404/400 — lỗi xảy ra tận trong provider,
   * rất khó lần. Thà rơi về lựa chọn hợp lệ đầu tiên.
   */
  if (t.type === 'dependent_select') {
    const list = t.choices_by[get(t.depends_on)] || [];
    if (list.length && !list.includes(v)) return list[0];
  }
  return v;
}

/** Toàn bộ giá trị đang có hiệu lực. */
function getAll() {
  const out = {};
  for (const t of FIELDS) out[t.key] = get(t.key);
  return out;
}

/** Ép một giá trị về đúng kiểu và khoảng của lược đồ. Trả `{ok, value}` hoặc `{ok:false, errors}`. */
function coerce(t, v, ctx = null) {
  if (t.type === 'boolean') return { ok: true, value: !!v };
  if (t.type === 'select') {
    if (!t.choices.includes(v)) return { ok: false, errors: `giá trị phải là một trong: ${t.choices.join(', ')}` };
    return { ok: true, value: v };
  }
  /**
   * `dependent_select`: danh sách hợp lệ đổi theo giá trị của một trường KHÁC.
   *
   * `ctx` mang giá trị của trường cha ĐANG ÁP DỤNG TRONG CHÍNH LẦN LƯU NÀY, không phải giá trị
   * đã lưu — người dùng gửi `{nha_cung_cap:'openai', model:'gpt-4o'}` trong một request thì lúc
   * xét `model`, cha đã là `openai`. Lấy từ tệp đang lưu sẽ báo sai là "gpt-4o không hợp lệ".
   */
  if (t.type === 'dependent_select') {
    const parent = ctx ? ctx[t.depends_on] : get(t.depends_on);
    const list = t.choices_by[parent] || [];
    if (!list.length) return { ok: false, errors: `"${parent}" chưa khai model nào` };
    if (!list.includes(v)) {
      return { ok: false, errors: `"${v}" không phải model của "${parent}" — chọn một trong: ${list.join(', ')}` };
    }
    return { ok: true, value: v };
  }
  const n = Number(v);
  if (!Number.isFinite(n)) return { ok: false, errors: 'phải là số' };
  if (n < t.min || n > t.max) return { ok: false, errors: `phải nằm trong khoảng ${t.min}–${t.max}` };
  // Làm tròn theo bước để không lưu 0.3400000000000001
  const rounded = t.step >= 1 ? Math.round(n) : Math.round(n / t.step) * t.step;
  return { ok: true, value: Number(rounded.toFixed(4)) };
}

/**
 * Lưu một phần cấu hình. Chỉ nhận khoá có trong lược đồ; khoá lạ bị bỏ qua và báo lại tên.
 *
 * Giá trị TRÙNG MẶC ĐỊNH thì XOÁ khỏi phần đè thay vì lưu lại. Nhờ vậy tệp cấu hình chỉ chứa
 * đúng những thứ người ta đã cố ý đổi — đọc tệp là biết ngay ai đã chỉnh gì, và đổi mặc định
 * trong `.env` sau này vẫn có tác dụng với những khoá chưa ai đụng tới.
 */
/**
 * Đổi nhà cung cấp mà KHÔNG gửi kèm model thì model cũ thành vô nghĩa — tự chuyển sang lựa chọn
 * hợp lệ đầu tiên. Không làm việc này thì cặp `openai` + `claude-sonnet-5` nằm im trong tệp cho
 * tới lượt hỏi kế tiếp, và lỗi nổ ra tận trong provider chứ không phải ở màn hình cấu hình.
 *
 * Chỉ áp cho trường mà người dùng KHÔNG chỉ định. Có chỉ định thì đã qua `coerce` rồi, sai là
 * bị từ chối thẳng — im lặng sửa lựa chọn của người ta mới là hành vi tệ.
 */
function syncDependents(d, patch) {
  for (const t of FIELDS) {
    if (t.type !== 'dependent_select') continue;
    if (Object.prototype.hasOwnProperty.call(patch, t.key)) continue;
    const list = t.choices_by[get(t.depends_on)] || [];
    if (!list.length) continue;
    const current = Object.prototype.hasOwnProperty.call(d, t.key) ? d[t.key] : t.default();
    if (list.includes(current)) continue;
    // MẶC ĐỊNH của cha mới trước, phần tử đầu danh sách chỉ là lối cuối.
    const parentDefault = t.default();
    const picked = list.includes(parentDefault) ? parentDefault : list[0];
    if (picked === parentDefault) delete d[t.key];
    else d[t.key] = picked;
  }
}

function set(patch) {
  if (!patch || typeof patch !== 'object') return { ok: false, errors: { _: 'dữ liệu không hợp lệ' } };

  const prev = readOverrides();
  /**
   * LÀM TRÊN BẢN SAO, CAM KẾT MỘT LẦN Ở CUỐI.
   *
   * Bản cũ sửa thẳng vào `de` trong vòng lặp rồi mới kiểm lỗi. Một ô sai ở cuối là hàm trả về
   * `ok:false` nhưng những ô hợp lệ phía trước ĐÃ nằm trong bộ nhớ — không ghi ra tệp, nên
   * tiến trình chạy theo một cấu hình mà tệp không hề có, tới lần khởi động lại mới mất. Với
   * cặp nhà-cung-cấp/model thì kiểu nửa vời đó là đúng cái cặp vô nghĩa cần tránh.
   *
   * `de` được trỏ tạm vào bản sao trong lúc làm, vì `default()` của trường phụ thuộc gọi
   * `get()` — nó phải thấy nhà cung cấp MỚI, không phải cái đang lưu trên đĩa.
   */
  const d = { ...prev };
  const errors = {};
  const ignored = [];
  const prevRef = overrides;
  overrides = d;

  try {
    // Trường ĐỘC LẬP xử lý trước, PHỤ THUỘC sau — để `ctx` của con thấy giá trị mới của cha.
    const entries = Object.entries(patch)
      .map(([key, v]) => ({ key, v, t: BY_KEY.get(key) }))
      .sort((a, b) => Number(!!a.t?.depends_on) - Number(!!b.t?.depends_on));

    for (const { key, v, t } of entries) {
      if (!t) { ignored.push(key); continue; }
      const ctx = t.depends_on ? { [t.depends_on]: get(t.depends_on) } : null;
      const res = coerce(t, v, ctx);
      if (!res.ok) { errors[key] = res.loi; continue; }
      if (res.value === t.default()) delete d[key];
      else d[key] = res.value;
    }

    if (!Object.keys(errors).length) syncDependents(d, patch);
  } finally {
    overrides = prevRef;
  }

  if (Object.keys(errors).length) return { ok: false, errors, ignored: ignored };

  const changed = JSON.stringify(d) !== JSON.stringify(prev);
  if (changed) {
    overrides = d;
    if (!writeFile()) { overrides = prev; return { ok: false, errors: { _: 'không ghi được tệp cấu hình' } }; }
  }
  return { ok: true, changed: changed, ignored: ignored, value: getAll() };
}

/** Trả mọi khoá về mặc định của `.env`. */
function reset() {
  overrides = {};
  const ok = writeFile();
  return { ok: ok, value: getAll() };
}

/** Lược đồ cho giao diện dựng form — kèm mặc định để hiện nhãn "đang khác mặc định". */
function schema() {
  return {
    group: GROUPS,
    // Giao diện dùng để bật/mờ đúng núm cho model ĐANG CHỌN DỞ — nó không tự suy ra được.
    capabilities: CAPABILITIES,
    fields: FIELDS.map((t) => ({
      key: t.key,
      group: t.group,
      label: t.label,
      type: t.type,
      min: t.min,
      max: t.max,
      step: t.step,
      unit: t.unit,
      choices: t.choices,
      // Tên hiển thị cho từng lựa chọn, nếu mã lựa chọn tự nó không đọc được (ví dụ 'la-ban').
      choice_labels: t.choice_labels,
      // Giao diện cần cả hai để dựng dropdown lọc theo trường cha — xem kiểu `dependent_select`.
      depends_on: t.depends_on,
      choices_by: t.choices_by,
      defaults_by: t.defaults_by ? t.defaults_by() : undefined,
      description: t.description,
      default: t.default(),
    })),
  };
}

module.exports = { get, getAll, set, reset, schema, capabilitiesOf, FILE_PATH: FILE };
