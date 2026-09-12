/**
 * SUBAGENT THỦ THƯ — đọc lượt vừa xong, tự tra kho, tự quyết thêm / bổ sung / sửa / bỏ qua.
 *
 * ═══════════════ VẤN ĐỀ NÓ CHỮA ═══════════════
 *
 * Luồng ghi tự động cũ là một cái máy khâu: nhặt chuỗi tool thô, cắt bớt, đẩy vào kho, rồi để
 * `addExperience()` gộp theo ngưỡng Jaccard 0,62. Không ai ĐỌC nội dung. Hậu quả đo được trên
 * kho thật (65 bản):
 *
 *  - `question` là nguyên văn, nên kho đầy những dòng đọc một mình không hiểu gì:
 *    "có cách sử dụng chi tiết không", "Tôi đã mở 1 deal rồi", "bấm 1 deal làm ví dụ".
 *  - `lesson` chỉ 7/65 bản có — máy khâu không biết viết bài học, nó chỉ biết chép bước.
 *  - Gộp theo CÂU CHỮ nên hai bản cùng một việc mà khác cách diễn đạt thì nằm cạnh nhau, cùng
 *    được dò trúng, mâu thuẫn nhau; còn hai bản khác việc mà trùng chữ thì bị nhập làm một.
 *
 * Thủ thư đọc cả biên bản lượt CỘNG những bản ghi gần giống (kèm mã), rồi phán bằng NGỮ NGHĨA
 * chứ không bằng độ trùng chữ.
 *
 * ═══════════════ CHẠY NỀN, KHÔNG DÍNH GÌ TỚI AGENT CHÍNH ═══════════════
 *
 * Endpoint `/kinh-nghiem` trả lời NGAY rồi mới gọi hàm này; không `await`, không giữ `res`.
 * Agent chính lúc đó đã trả lời xong người dùng từ lâu — lượt đã kết thúc mới có cái để học.
 *
 * Nên mọi thứ ở đây đều là "được thì tốt": lỗi thì thôi, hết giờ thì thôi, không có đường nào
 * làm chậm hay làm hỏng một câu trả lời. Đổi lại KHÔNG có ai nhìn thấy lỗi — nên phải ghi sổ
 * luồng đầy đủ, đó là cửa sổ duy nhất để biết nó có chạy và phán ra cái gì.
 *
 * ═══════════════ VÌ SAO KHÔNG CHO NÓ XOÁ ═══════════════
 *
 * Nó chỉ có `add` / `append` / `replace` / `skip`. Không có xoá.
 *
 * Xoá vẫn là việc của tool `discard_experience` do agent chính gọi, vì ở đó có BẰNG CHỨNG TRỰC
 * TIẾP: trợ lý đã đọc gợi ý, làm theo, và thấy nó dẫn sai. Thủ thư chỉ đọc lại biên bản một
 * lượt — đó là suy đoán. Cho suy đoán quyền xoá là dựng lại đúng cái heuristic đã hạ bậc oan
 * 34/55 bản ghi hồi trước (xem `createRescueMiddleware` trong guideExperience.js).
 *
 * Cùng lý do, `replace` (đè nội dung) bắt buộc kèm lý do và được ghi sổ; còn `append` (chỉ thêm,
 * không mất gì) là chế độ mặc định và là chỗ rơi khi nó lưỡng lự.
 */

const settings = require('./guideSettings');
const experience = require('./guideExperience');
const flowLog = require('./guideFlow');

const ENABLED = process.env.GUIDE_HOC_NEN !== '0';
const TIMEOUT_MS = Number(process.env.GUIDE_HOC_NEN_TIMEOUT) || 20000;

/** Bao nhiêu bản ghi gần giống đưa cho thủ thư đọc. Nhiều hơn là prompt phình mà nó vẫn chỉ so vài cái đầu. */
const CANDIDATE_LIMIT = 5;

let disabledReason = null;

function isEnabled() {
  return ENABLED && settings.get('background_learn_enabled') !== false && !disabledReason;
}

function learnModel() {
  return settings.get('background_learn_model') || '';
}

function status() {
  if (!ENABLED) return { on: false, reason: 'GUIDE_HOC_NEN=0' };
  if (settings.get('background_learn_enabled') === false) return { on: false, reason: 'disabled_in_settings' };
  if (disabledReason) return { on: false, reason: disabledReason };
  return { on: true, model: learnModel(), recent: recentRuns.length };
}

/** 20 lần gần nhất — để soi thủ thư phán gì, vì không ai thấy nó chạy. */
const recentRuns = [];
function recordRun(entry) {
  recentRuns.unshift({ at: Date.now(), ...entry });
  recentRuns.length = Math.min(recentRuns.length, 20);
}

/* ─────────────────────────── Chỉ dẫn ─────────────────────────── */

const INSTRUCTIONS = [
  'Bạn là THỦ THƯ của một kho kinh nghiệm THAO TÁC cho phần mềm CRM tiếng Việt.',
  '',
  'Bạn vừa được đưa biên bản của MỘT LƯỢT trợ lý làm việc trên giao diện, cộng những bản ghi',
  'đang có trong kho mà gần giống. Việc của bạn: quyết định kho cần ghi gì.',
  '',
  'CHỌN MỘT hành động:',
  '- "skip": lượt này không dạy được gì mới. Kho đã có đủ, hoặc lượt quá tầm thường.',
  '- "add": kho CHƯA có việc này. Viết bản ghi mới.',
  '- "append": kho ĐÃ có bản đúng nhưng THIẾU (thiếu ngõ cụt, thiếu bài học). Chỉ thêm vào.',
  '- "replace": kho có bản SAI — đường đi không còn đúng, bài học dẫn tới kết quả sai. Đè lại.',
  '',
  'QUY TẮC BẮT BUỘC:',
  '1. Lưỡng lự giữa "append" và "replace" thì chọn "append". "replace" làm MẤT nội dung cũ; chỉ dùng',
  '   khi bản cũ SAI, không dùng khi nó chỉ THIẾU.',
  '2. "append" và "replace" phải kèm "code" — lấy đúng mã trong danh sách ứng viên. Không được bịa mã.',
  '3. "task" phải ĐỌC MỘT MÌNH VẪN HIỂU, viết như một việc cần làm. Người dùng hỏi "có cách sử',
  '   dụng chi tiết không" thì bạn nhìn biên bản để viết "xem hướng dẫn chi tiết Không gian',
  '   chung của deal", chứ không chép lại câu đó.',
  '4. TUYỆT ĐỐI KHÔNG ghi giá trị thật: tên khách, tên công ty cụ thể, số điện thoại, số tiền,',
  '   ngày cụ thể, số lượng bản ghi. Kho này DÙNG CHUNG trong công ty và sống rất lâu.',
  '   "lọc deal của Metalla tháng 8" phải viết thành "lọc deal theo công ty và theo thời gian".',
  '5. "steps": các bước ĐÚNG, mỗi bước một dòng ngắn, nêu tên nút/trường thật, KHÔNG nêu giá',
  '   trị đã điền. Bỏ bước dư (đọc lại màn hình cho chắc, tra cứu không dùng tới).',
  '6. "dead_ends": những cách đã thử mà KHÔNG được, kèm lý do. Đây là phần GIÁ TRỊ NHẤT — nó cắt',
  '   hẳn một nhánh mò cho lần sau. Có thì đừng bỏ.',
  '7. "lesson": một câu kết luận cho lần sau, CHỈ nói về giao diện.',
  '8. Không suy diễn thêm điều biên bản không cho thấy. Không chắc thì "skip".',
  '9. Chỉ "skip" khi lượt KHÔNG có ngõ cụt nào mới VÀ kho đã có đủ. Lượt có ngõ cụt mới thì',
  '   gần như luôn đáng ghi, kể cả khi nó thất bại.',
  '',
  'LƯỢT THẤT BẠI VẪN PHẢI GHI — đây là ca quan trọng, đừng bỏ qua nó:',
  'Biên bản ghi "KẾT THÚC KHÔNG THÀNH CÔNG" nghĩa là trợ lý thử mấy cách, không cách nào được,',
  'rồi báo thật với người dùng. Lượt đó tốn thật và người dùng ngồi xem thật. "Mấy cách này',
  'không được" là tri thức HOÀN CHỈNH, không phải tri thức thiếu — nó cắt hẳn mấy nhánh mò cho',
  'lần sau. Khi đó:',
  '  - "steps" để MẢNG RỖNG. TUYỆT ĐỐI không bịa ra đường đi mà biên bản không có.',
  '  - "dead_ends" ghi đầy đủ từng cách đã thử kèm lý do nó không được.',
  '  - "lesson" nói thẳng là chưa tìm ra cách, và nêu chỗ đáng nghi (thiếu quyền, tính năng',
  '    không có ở màn hình đó, cần làm ở màn hình khác).',
  '  - Hành động thường là "add", hoặc "append" nếu kho đã có bản cùng việc.',
  '',
  'Chỉ trả về JSON, không thêm chữ nào ngoài JSON, không bọc trong khối mã:',
  '{"action":"add|append|replace|skip","code":"","task":"","steps":[],'
  + '"dead_ends":[],"lesson":"","reason":""}',
  '',
  '"reason": bắt buộc khi hành động là "replace" — nói rõ bản cũ sai ở CHỖ NÀO.',
].join('\n');

function buildReport({ question, intent, path, screen, steps, deadEnds, candidates }) {
  const d = [];
  d.push('## Biên bản lượt vừa xong');
  d.push('');
  d.push(`Người dùng gõ: ${String(question || '').slice(0, 400)}`);
  if (intent) d.push(`Ý định đã diễn giải: ${intent}`);
  if (path) d.push(`Màn hình: ${path}${screen ? ` (${screen})` : ''}`);
  d.push('');
  const b = (steps || []).map((x) => (typeof x === 'string' ? x : (x?.summary || x?.tool || '')))
    .filter(Boolean);

  /**
   * NÓI THẲNG LƯỢT NÀY THÀNH CÔNG HAY KHÔNG.
   *
   * Không có dòng này thì model nhỏ nhìn danh sách bước rỗng rồi tự bịa ra một đường đi "hợp
   * lý" — đúng kiểu hỏng tệ nhất cho một kho dùng chung: bản ghi trông có thẩm quyền, nội dung
   * là suy diễn, và không ai biết cho tới lúc có người làm theo.
   */
  if (!b.length) {
    d.push('KẾT THÚC KHÔNG THÀNH CÔNG — không có bước nào chạy được. Trợ lý đã thử rồi báo thật');
    d.push('với người dùng. Ghi lại các ngõ cụt; để "thao_tac" rỗng, ĐỪNG bịa đường đi.');
    d.push('');
  }

  d.push('Các bước CHẠY ĐƯỢC (theo thứ tự):');
  if (b.length) b.forEach((x, i) => d.push(`  ${i + 1}. ${x}`));
  else d.push('  (không có bước nào)');

  d.push('');
  d.push('Những cách KHÔNG được (ngõ cụt phát hiện trong lượt này):');
  if (deadEnds && deadEnds.length) deadEnds.forEach((x) => d.push(`  - ${x}`));
  else d.push('  (không có)');

  d.push('');
  d.push('## Kho đang có, những bản gần giống');
  d.push('');
  if (!candidates || !candidates.length) {
    d.push('(không có bản nào gần giống — nếu lượt này đáng học thì đó là "add")');
  } else {
    for (const u of candidates) {
      d.push(`[${u.code}] giống ${u.similarity}${u.discarded ? ' — ĐÃ BỊ BỎ' : ''}`);
      d.push(`  Hỏi: ${u.question}${u.path ? ` (ở ${u.path})` : ''}`);
      if (u.steps?.length) d.push(`  Đường đi: ${u.steps.join(' → ')}`);
      if (u.dead_ends?.length) d.push(`  Ngõ cụt: ${u.dead_ends.join(' | ')}`);
      if (u.lesson) d.push(`  Bài học: ${u.lesson}`);
      if (u.discarded && u.discard_reason) d.push(`  Lý do bị bỏ: ${u.discard_reason}`);
      d.push('');
    }
  }
  d.push('Quyết định đi.');
  return d.join('\n');
}

/* ─────────────────────────── Làm sạch đầu ra ─────────────────────────── */

const CONTROL_CHARS = new RegExp('[\\u0000-\\u001f\\u007f]+', 'g');
const LEADING_MARKUP = new RegExp('^[\\s#>`*_-]+');

function sanitize(s, maxLen) {
  return String(s || '')
    .replace(CONTROL_CHARS, ' ')
    .replace(LEADING_MARKUP, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function extractJson(text) {
  const t = String(text || '');
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(t.slice(a, b + 1));
  } catch {
    return null;
  }
}

const ACTIONS = new Set(['add', 'append', 'replace', 'skip']);

/**
 * Đọc phán quyết và SIẾT nó về cái an toàn.
 *
 * Đây là lớp không tin model. Ba chỗ siết, mỗi chỗ chữa một kiểu phán sai đã lường được:
 *
 *  1. Hành động lạ → 'skip'. Không đoán ý.
 *  2. 'append'/'replace' mà mã KHÔNG nằm trong danh sách ứng viên đã đưa → 'skip'. Model bịa mã
 *     là chuyện thường, mà `updateExperience` chỉ khớp TIỀN TỐ nên một mã bịa vẫn có thể trúng
 *     một bản khác. Đối chiếu với danh sách ta tự đưa ra là chặn hẳn đường đó.
 *  3. 'replace' mà không có lý do → HẠ xuống 'append'. Không chặn hẳn: nội dung nó viết vẫn có thể
 *     dùng được, chỉ là không được phép đè.
 */
function readVerdict(json, validCodes) {
  if (!json) return null;
  let action = String(json.action || '').trim();
  if (!ACTIONS.has(action)) action = 'skip';

  const code = String(json.code || '').replace(/[^0-9a-fA-F]/g, '').toLowerCase();
  const reason = sanitize(json.reason, 200);

  if (action === 'append' || action === 'replace') {
    if (!code || !validCodes.has(code)) return { action: 'skip', note: 'code_not_in_candidates' };
    if (action === 'replace' && !reason) action = 'append';
  }

  const steps = (Array.isArray(json.steps) ? json.steps : [])
    .map((x) => sanitize(x, 120)).filter(Boolean).slice(0, 8);
  const deadEnds = (Array.isArray(json.dead_ends) ? json.dead_ends : [])
    .map((x) => sanitize(x, 200)).filter(Boolean).slice(0, 4);

  return {
    action: action,
    code,
    task: sanitize(json.task, 200),
    steps: steps,
    dead_ends: deadEnds,
    lesson: sanitize(json.lesson, 200),
    reason: reason,
  };
}

/* ─────────────────────────── Vòng chạy nền ─────────────────────────── */

/**
 * @param {object} du  { company, threadId, question, intent, path, screen, steps, deadEnds }
 * @param {Function} goi  hàm gọi model (copilotkit.js cấp) — (chiDan, chu, {model, choMs}) => Promise<string>
 * @returns {Promise<object>} kết quả để ghi sổ. KHÔNG BAO GIỜ ném.
 */
async function learnInBackground(input, callModel) {
  const key = String(input?.threadId || '');
  const company = String(input?.company || 'chung');

  if (!isEnabled() || typeof callModel !== 'function') return { ran: false, reason: 'off' };
  const question = String(input?.question || '').trim();
  if (question.length < 3) return { ran: false, reason: 'question_too_short' };

  /**
   * Chuỗi đem tra ứng viên: ưu tiên Ý ĐỊNH đã diễn giải (guideIntent), không phải nguyên văn.
   *
   * Cùng lý do như phía truy vấn: câu tiếp nối ("còn tháng trước thì sao") không chứa từ nào về
   * việc đang làm, nên tra bằng nó thì danh sách ứng viên về tay không, và thủ thư kết luận
   * "kho chưa có" rồi tạo bản trùng. Sai ở đây tốn kém hơn sai ở phía đọc: phía đọc chỉ mất một
   * gợi ý, phía ghi thì để lại rác vĩnh viễn.
   */
  const topic = String(input?.intent || '').trim() || question;
  const candidates = experience.findCandidates(topic, {
    company, path: input?.path || '', limit: CANDIDATE_LIMIT,
  });
  const validCodes = new Set(candidates.map((u) => u.code));

  let text = null;
  try {
    text = await callModel(INSTRUCTIONS, buildReport({
      question,
      intent: input?.intent || '',
      path: input?.path || '',
      screen: input?.screen || '',
      steps: input?.steps || [],
      deadEnds: input?.deadEnds || [],
      candidates,
    }), { model: learnModel(), timeoutMs: TIMEOUT_MS });
  } catch (e) {
    const m = String((e && e.message) || e);
    if (/401|403|api key|unauthorized|forbidden/i.test(m)) {
      disabledReason = 'model_rejected';
      console.warn('[guide] thủ thư bị từ chối — tắt hẳn:', m.slice(0, 160));
    } else {
      console.error('[guide] thủ thư lỗi:', m.slice(0, 160));
    }
    const res = { ran: true, reason: 'model_error' };
    recordRun({ ...res, question: question.slice(0, 80) });
    flowLog.record(key, 'learn', res);
    return res;
  }

  const verdict = readVerdict(extractJson(text), validCodes);
  if (!verdict) {
    const res = { ran: true, reason: 'bad_shape' };
    recordRun({ ...res, question: question.slice(0, 80) });
    flowLog.record(key, 'learn', res);
    return res;
  }

  let res;
  if (verdict.action === 'skip') {
    res = { ran: true, action: 'skip', ...(verdict.note ? { note: verdict.note } : {}) };
  } else if (verdict.action === 'add') {
    /**
     * Đi qua `addExperience` với `source: 'agent'`, KHÔNG ghi thẳng — cố ý.
     *
     * Hàm đó vẫn tự gộp nếu tìm được bản giống ≥ 0,62. Nghe như đang bỏ qua phán đoán của thủ
     * thư ("kho chưa có"), nhưng đó là LƯỚI CHẶN TRÙNG cuối cùng: thủ thư chỉ thấy 5 ứng viên
     * trên một ngưỡng lỏng, còn `addExperience` quét CẢ kho. Nó bắt được ca thủ thư không được
     * xem tới. Gộp thì mất ít (một bản ghi hợp nhất), tạo trùng thì mất nhiều.
     *
     * `source: 'agent'` vì nội dung này ĐÃ qua biên tập — và nhờ đó nó không bị bản `auto`
     * thô đè lại sau này (xem `mayOverwriteContent` trong addExperience).
     */
    const r = experience.addExperience({
      company: company,
      question: verdict.task || question,
      path: input?.path || '',
      steps: verdict.steps.map((t) => ({ summary: t })),
      dead_ends: verdict.dead_ends,
      lesson: verdict.lesson,
      source: 'agent',
    });
    res = { ran: true, action: 'add', ...r };
  } else {
    const r = experience.updateExperience({
      company: company,
      code: verdict.code,
      steps: verdict.steps.map((t) => ({ summary: t })),
      dead_ends: verdict.dead_ends,
      lesson: verdict.lesson,
      mode: verdict.action,
      reason: verdict.reason,
    });
    res = { ran: true, action: verdict.action, ...r };
    // `replace` là hành động DUY NHẤT làm mất nội dung — nêu ra console để còn lần lại được sau khi
    // sổ luồng (RAM, có trần) đã cuốn qua.
    if (verdict.action === 'replace' && r.ok) {
      console.warn(`[guide] thủ thư ĐÈ kinh nghiệm [${r.code}]: ${verdict.reason}`);
    }
  }

  const entry = {
    ...res,
    question: question.slice(0, 80),
    task: verdict.task,
    candidate_count: candidates.length,
  };
  recordRun(entry);
  flowLog.record(key, 'learn', {
    action: res.action || null,
    ...(res.reason ? { reason: res.reason } : {}),
    ...(res.code ? { code: res.code } : {}),
    candidates: candidates.length,
  });
  return res;
}

module.exports = { learnInBackground, status, recentRuns, ENABLED };
