/**
 * flowActionRunner — chạy chuỗi khối hành động trên luồng: Lấy báo cáo → AI viết báo cáo → Nhắn tin.
 *
 * Dữ liệu chảy giữa các khối qua một "túi" trong bộ nhớ: mỗi khối chạy xong ghi kết quả
 * vào túi dưới khoá node_id của nó, khối sau tham chiếu bằng token {{node_id.ten_truong}}.
 * Nhờ vậy node Nhắn tin gửi được đúng đoạn AI vừa viết, mà không phải nối cứng trong code.
 *
 * Chạy được ở hai chế độ:
 *   dryRun = true  → tính đủ nội dung nhưng KHÔNG gửi (dùng cho nút Chạy thử)
 *   dryRun = false → gửi thật ra nhóm chat / phòng ban / tin riêng / thông báo
 */

const { supabase } = require('../config/supabase');

const ACTION_KINDS = new Set(['report', 'ai_report', 'notify', 'ai_classify', 'ai_extract', 'ai_ask']);
/** Khối AI đọc dữ liệu của các bước phía trước — dùng để biết cần nạp bước module nào. */
const AI_READER_KINDS = new Set(['ai_report', 'ai_classify', 'ai_extract', 'ai_ask']);
const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_\-]+)\.([a-zA-Z0-9_]+)\s*\}\}/g;

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-4o-mini';

const TONE_HINT = {
  concise: 'Viết ngắn gọn, ưu tiên con số, gạch đầu dòng.',
  detailed: 'Viết chi tiết, có phân tích nguyên nhân và so sánh.',
  friendly: 'Viết thân thiện, dễ đọc, tránh thuật ngữ khô cứng.',
  formal: 'Viết trang trọng, phù hợp gửi cấp trên.',
};

// ═══ Túi dữ liệu + thay token ═══

function stringifyValue(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** Thay {{node.field}} bằng giá trị thật trong túi. Token không có dữ liệu → chuỗi rỗng. */
function resolveTokens(text, bag) {
  return String(text || '').replace(TOKEN_RE, (whole, nodeId, key) => {
    const outputs = bag.get(nodeId);
    if (!outputs || !(key in outputs)) return '';
    return stringifyValue(outputs[key]);
  });
}

function tokensIn(text) {
  const out = [];
  for (const m of String(text || '').matchAll(TOKEN_RE)) out.push({ nodeId: m[1], key: m[2] });
  return out;
}

// ═══ Gọi AI ═══

async function callOpenAiText({ system, user, maxWords, model, maxTokens: maxTokensIn, temperature, jsonMode }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const err = new Error('Chưa cấu hình OPENAI_API_KEY nên AI không viết được báo cáo.');
    err.code = 'NO_OPENAI_KEY';
    throw err;
  }
  const maxTokens = Number(maxTokensIn) > 0
    ? Math.min(Math.max(Math.round(Number(maxTokensIn)), 200), 4000)
    : Math.min(Math.max(Math.round((Number(maxWords) || 200) * 3), 200), 2000);
  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: model || OPENAI_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: maxTokens,
      temperature: Number.isFinite(Number(temperature)) ? Number(temperature) : 0.4,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('AI không trả về nội dung.');
  return text;
}

// ═══ Khối: Lấy báo cáo ═══

async function runReportNode(node) {
  const cfg = node.node_config || {};
  const tools = require('./aiReportTools');
  const period = cfg.period || 'today';
  const range = tools.resolveTimeRange(period);
  const periodLabel = range?.label_vn || period;
  const type = cfg.report_type || 'company_leads';

  if (type === 'company_leads') {
    if (!cfg.company_id) throw new Error('Khối Lấy báo cáo chưa chọn công ty.');
    const args = {
      company_id: cfg.company_id,
      time_scope: period,
      department_id: cfg.department_id || undefined,
    };
    const [data, text] = await Promise.all([
      tools.getCompanyLeadSummary(args),
      tools.formatCompanyReportText(args),
    ]);
    return { data, text: String(text || ''), period: periodLabel };
  }

  if (type === 'org_overview') {
    if (!cfg.company_id) throw new Error('Khối Lấy báo cáo chưa chọn công ty.');
    const result = await tools.executeTool('format_org_overview_report_text', {
      company_id: cfg.company_id,
      time_scope: period,
      department_id: cfg.department_id || undefined,
    }, {});
    const text = typeof result === 'string' ? result : (result?.text || '');
    return { data: result, text, period: periodLabel };
  }

  if (type === 'deal_risk') {
    const result = await tools.formatLeadDealRiskText({
      company_id: cfg.company_id || undefined,
    });
    const text = typeof result === 'string' ? result : (result?.text || '');
    return { data: result, text, period: periodLabel };
  }

  if (type === 'employee_activity') {
    if (!cfg.user_id) throw new Error('Khối Lấy báo cáo chưa chọn nhân viên.');
    const result = await tools.formatEmployeeActivityReportText({
      user_id: cfg.user_id,
      time_scope: period,
    });
    const text = typeof result === 'string' ? result : (result?.text || '');
    return { data: result, text, period: periodLabel };
  }

  throw new Error(`Loại báo cáo chưa hỗ trợ: ${type}`);
}

// ═══ Khối: AI viết báo cáo ═══

/** Gom dữ liệu đầu vào cho AI: hoặc theo biến người dùng chọn, hoặc mọi khối phía trước. */
/**
 * Một khối phía trước diễn đạt thành đoạn cho AI đọc.
 *
 * Khối báo cáo có sẵn bản chữ / bảng số liệu nên dùng thẳng. Bước module trả về bộ
 * trường rời (tên khách, cột hiện tại, deadline…) thì liệt kê từng dòng, bỏ ô trống
 * để AI không tưởng nhầm là thiếu dữ liệu.
 */
function describeOutputs(outputs) {
  const primary = outputs.text || outputs.report_text || outputs.data;
  if (primary != null && primary !== '') return stringifyValue(primary);
  return Object.entries(outputs)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${stringifyValue(v)}`)
    .join('\n');
}

function collectAiInput(node, bag, upstreamIds, labelById = null) {
  const cfg = node.node_config || {};
  const parts = [];
  const used = [];
  const nameOf = (nodeId) => labelById?.get(nodeId) || nodeId;

  if (cfg.source === 'pick' && Array.isArray(cfg.source_vars) && cfg.source_vars.length) {
    for (const token of cfg.source_vars) {
      for (const { nodeId, key } of tokensIn(token)) {
        const value = bag.get(nodeId)?.[key];
        if (value == null || value === '') continue;
        parts.push(`### ${nameOf(nodeId)} · ${key}\n${stringifyValue(value)}`);
        used.push(`${nodeId}.${key}`);
      }
    }
  } else {
    for (const nodeId of upstreamIds) {
      const outputs = bag.get(nodeId);
      if (!outputs) continue;
      const body = describeOutputs(outputs);
      if (!body) continue;
      parts.push(`### ${nameOf(nodeId)}\n${body}`);
      used.push(nodeId);
    }
  }

  return { input: parts.join('\n\n'), used };
}

/** Model chạy thật: `default` (hoặc bỏ trống) → model chung của hệ thống. */
function resolveModel(cfg) {
  const picked = String(cfg.model || 'default').trim();
  if (picked === 'custom') return String(cfg.model_custom || '').trim().slice(0, 80) || OPENAI_MODEL;
  if (!picked || picked === 'default') return OPENAI_MODEL;
  return picked.slice(0, 80);
}

/**
 * Mẫu AI dùng chung với AI Chat Bot (tab «Mẫu nội dung»): lấy prompt, độ dài và
 * temperature đã duyệt sẵn. Riêng `data_source` của mẫu bị bỏ qua — trên luồng,
 * dữ liệu luôn đến từ các khối phía trước chứ không tự quét lại.
 */
async function loadPlaybook(playbookId) {
  const { data, error } = await supabase
    .from('ai_chat_bot_playbooks')
    .select('id, name, system_prompt, user_prompt_extra, max_tokens, temperature, enabled')
    .eq('id', playbookId)
    .maybeSingle();
  if (error) throw new Error(`Không đọc được mẫu AI: ${error.message}`);
  if (!data) throw new Error('Mẫu AI đã chọn không còn tồn tại. Chọn lại mẫu khác.');
  if (data.enabled === false) throw new Error(`Mẫu AI «${data.name}» đang tắt. Bật lại ở Cài đặt AI Chat Bot.`);
  return data;
}

/** Ràng buộc định dạng bắt buộc: kết quả đẩy thẳng vào khung chat nên Markdown sẽ hiện thô. */
const CHAT_PLAIN_TEXT_RULES = [
  'Luôn trả lời bằng tiếng Việt.',
  'Chỉ dùng số liệu có trong dữ liệu được cung cấp, tuyệt đối không bịa thêm con số.',
  'Viết thuần văn bản cho khung chat: không dùng #, ##, ** hay bảng Markdown.',
  'Không dùng link Markdown [text](url) và không tự bịa URL — chỉ ghi mã lead/task dạng chữ.',
  'Tách ý bằng dòng trống và gạch đầu dòng «•».',
].join(' ');

async function runAiReportNode(node, bag, upstreamIds, labelById = null) {
  const cfg = node.node_config || {};
  const { input, used } = collectAiInput(node, bag, upstreamIds, labelById);
  if (!input.trim()) {
    throw new Error(
      'Không có dữ liệu phía trước để AI đọc. Nối khối «Lấy báo cáo» hoặc một bước module '
      + '(CRM / Sản xuất / VC) vào trước khối này, và chọn deal / dự án khi chạy.',
    );
  }

  const model = resolveModel(cfg);
  const usePlaybook = cfg.mode === 'playbook' && cfg.playbook_id;
  const playbook = usePlaybook ? await loadPlaybook(cfg.playbook_id) : null;

  let system;
  let instruction;
  let maxWords;
  let maxTokens;
  let temperature;

  if (playbook) {
    system = [String(playbook.system_prompt || '').trim(), CHAT_PLAIN_TEXT_RULES]
      .filter(Boolean).join('\n\n');
    instruction = String(playbook.user_prompt_extra || '').trim()
      || 'Viết báo cáo từ dữ liệu bên dưới theo đúng vai trò đã mô tả.';
    maxTokens = playbook.max_tokens;
    temperature = playbook.temperature;
  } else {
    maxWords = Number(cfg.max_words) || 200;
    system = [
      'Bạn là trợ lý viết báo cáo nội bộ cho công ty sản xuất tủ bếp tại Việt Nam.',
      CHAT_PLAIN_TEXT_RULES,
      TONE_HINT[cfg.tone] || TONE_HINT.concise,
      `Giới hạn khoảng ${maxWords} chữ.`,
    ].join(' ');
    instruction = String(cfg.instruction || '').trim()
      || 'Tóm tắt số liệu thành báo cáo ngắn gọn, nêu điểm đáng chú ý và đề xuất hành động.';
  }

  const text = await callOpenAiText({
    system,
    user: `Yêu cầu: ${instruction}\n\nDữ liệu:\n\n${input}`,
    maxWords,
    maxTokens,
    temperature,
    model,
  });

  return {
    report_text: text,
    used_sources: used,
    model_used: model,
    playbook_used: playbook?.name || null,
  };
}

// ═══ Khối AI đọc – phân loại – bóc dữ liệu ═══

/**
 * Model đôi khi vẫn bọc JSON trong ```json dù đã bật json_object, nên cắt rào trước
 * rồi mới lấy đoạn từ { đầu tiên tới } cuối cùng.
 */
function parseJsonLoose(raw) {
  const text = String(raw || '').replace(/```json|```/gi, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  const body = start >= 0 && end > start ? text.slice(start, end + 1) : text;
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`AI trả về không phải JSON đọc được: ${text.slice(0, 200)}`);
  }
}

async function callOpenAiJson(opts) {
  return parseJsonLoose(await callOpenAiText({ ...opts, jsonMode: true }));
}

const NO_UPSTREAM_HINT = 'Không có dữ liệu phía trước để AI đọc. Nối khối «Lấy báo cáo» hoặc một bước module '
  + '(CRM / Sản xuất / VC) vào trước khối này, và chọn deal / dự án khi chạy.';

/**
 * AI phân loại: đọc dữ liệu phía trước, chọn đúng một nhãn trong danh sách.
 * Nhãn trả ra khớp với label của cạnh đi ra để runtime biết chạy nhánh nào.
 */
async function runAiClassifyNode(node, bag, upstreamIds, labelById = null) {
  const cfg = node.node_config || {};
  const labels = (Array.isArray(cfg.labels) ? cfg.labels : [])
    .map((l) => String(l || '').trim())
    .filter(Boolean);
  if (labels.length < 2) {
    throw new Error('Khối AI phân loại cần ít nhất hai nhãn để có cái mà chọn.');
  }

  const { input, used } = collectAiInput(node, bag, upstreamIds, labelById);
  if (!input.trim()) throw new Error(NO_UPSTREAM_HINT);

  const model = resolveModel(cfg);
  const criteria = String(cfg.instruction || '').trim()
    || 'Chọn nhãn phù hợp nhất với tình trạng hồ sơ.';

  const json = await callOpenAiJson({
    system: [
      'Bạn là bộ phân loại hồ sơ cho công ty sản xuất tủ bếp tại Việt Nam.',
      `Chỉ được chọn đúng một nhãn trong danh sách: ${labels.map((l) => `"${l}"`).join(', ')}.`,
      'Chỉ dựa vào dữ liệu được cung cấp, không suy diễn thêm dữ kiện.',
      'Trả về JSON dạng {"label": "...", "reason": "một câu tiếng Việt", "confidence": 0.0-1.0}.',
    ].join(' '),
    user: `Tiêu chí phân loại: ${criteria}\n\nDữ liệu:\n\n${input}`,
    model,
    maxTokens: 400,
    temperature: 0,
  });

  const fallback = labels.includes(String(cfg.fallback_label || '').trim())
    ? String(cfg.fallback_label).trim()
    : labels[0];
  const picked = labels.find(
    (l) => l.toLowerCase() === String(json.label || '').trim().toLowerCase(),
  );
  const confidence = Math.min(Math.max(Number(json.confidence) || 0, 0), 1);
  const minConfidence = Math.min(Math.max(Number(cfg.min_confidence) || 0, 0), 1);
  const belowBar = minConfidence > 0 && confidence < minConfidence;
  const label = picked && !belowBar ? picked : fallback;

  return {
    label,
    reason: String(json.reason || '').trim()
      || (picked ? '' : 'AI trả nhãn ngoài danh sách nên dùng nhãn dự phòng.'),
    confidence,
    fell_back: label !== picked,
    used_sources: used,
    model_used: model,
  };
}

/**
 * AI bóc dữ liệu: rút các trường đã khai báo ra khỏi văn bản phía trước.
 * Mỗi trường thành một output riêng để khối sau chèn bằng {{node.ten_truong}}.
 */
async function runAiExtractNode(node, bag, upstreamIds, labelById = null) {
  const cfg = node.node_config || {};
  const fields = (Array.isArray(cfg.fields) ? cfg.fields : [])
    .filter((f) => f && String(f.key || '').trim())
    .map((f) => ({ key: String(f.key).trim(), label: String(f.label || '').trim() || String(f.key).trim() }));
  if (!fields.length) throw new Error('Khối AI bóc dữ liệu chưa khai báo trường nào cần rút ra.');

  const { input, used } = collectAiInput(node, bag, upstreamIds, labelById);
  if (!input.trim()) throw new Error(NO_UPSTREAM_HINT);

  const model = resolveModel(cfg);
  const json = await callOpenAiJson({
    system: [
      'Bạn là bộ bóc tách thông tin từ dữ liệu nội bộ của công ty sản xuất tủ bếp.',
      'Chỉ lấy giá trị có thật trong dữ liệu, tuyệt đối không suy đoán và không bịa.',
      'Không tìm thấy trường nào thì để giá trị chuỗi rỗng.',
      `Trả về JSON đúng các khoá: ${fields.map((f) => `"${f.key}"`).join(', ')}.`,
    ].join(' '),
    user: [
      'Các trường cần bóc:',
      ...fields.map((f) => `- ${f.key}: ${f.label}`),
      '',
      'Dữ liệu:',
      '',
      input,
    ].join('\n'),
    model,
    maxTokens: 800,
    temperature: 0,
  });

  const values = {};
  const missing = [];
  for (const f of fields) {
    const raw = json[f.key];
    const value = raw == null ? '' : stringifyValue(raw).trim();
    values[f.key] = value;
    if (!value) missing.push(f.label);
  }
  if (missing.length && cfg.on_missing === 'error') {
    throw new Error(`AI không tìm thấy trong dữ liệu: ${missing.join(', ')}.`);
  }

  return {
    ...values,
    extracted: values,
    missing_fields: missing,
    used_sources: used,
    model_used: model,
  };
}

const ASK_NOT_FOUND = 'KHÔNG CÓ TRONG TÀI LIỆU';

/** Bài học Kiến thức làm tài liệu tham chiếu — cắt bớt để prompt không phình. */
async function loadLessonDocs(lessonIds) {
  const ids = (Array.isArray(lessonIds) ? lessonIds : []).map(String).filter(Boolean);
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from('knowledge_lessons')
    .select('id, title, summary, content_md')
    .in('id', ids);
  if (error) throw new Error(`Không đọc được bài học: ${error.message}`);
  return (data || []).map((l) => ({
    title: l.title || 'Bài học',
    body: [l.summary, l.content_md].filter(Boolean).join('\n\n').slice(0, 8000),
  }));
}

/** AI hỏi đáp: trả lời một câu hỏi dựa trên dữ liệu phía trước và tài liệu đã chọn. */
async function runAiAskNode(node, bag, upstreamIds, labelById = null) {
  const cfg = node.node_config || {};
  const question = resolveTokens(cfg.question || '', bag).trim();
  if (!question) throw new Error('Khối AI hỏi đáp chưa nhập câu hỏi.');

  const { input, used } = collectAiInput(node, bag, upstreamIds, labelById);
  const docs = await loadLessonDocs(cfg.lesson_ids);
  if (!input.trim() && !docs.length) {
    throw new Error(
      'Chưa có gì để AI đọc. Chọn tài liệu tham chiếu, hoặc nối một khối dữ liệu vào trước khối này.',
    );
  }

  const model = resolveModel(cfg);
  const maxWords = Number(cfg.max_words) || 150;
  const context = [
    ...docs.map((d) => `### Tài liệu: ${d.title}\n${d.body}`),
    ...(input.trim() ? [input] : []),
  ].join('\n\n');

  const answer = await callOpenAiText({
    system: [
      'Bạn trả lời câu hỏi nội bộ cho công ty sản xuất tủ bếp tại Việt Nam.',
      'Chỉ được dùng thông tin trong phần tài liệu bên dưới, không dùng kiến thức ngoài.',
      `Nếu tài liệu không chứa câu trả lời, trả lời đúng một dòng: ${ASK_NOT_FOUND}.`,
      CHAT_PLAIN_TEXT_RULES,
      `Giới hạn khoảng ${maxWords} chữ.`,
    ].join(' '),
    user: `Câu hỏi: ${question}\n\nTài liệu:\n\n${context}`,
    maxWords,
    model,
    temperature: 0.2,
  });

  return {
    answer,
    question,
    not_found: answer.trim().toUpperCase().startsWith(ASK_NOT_FOUND),
    sources_used: [...used, ...docs.map((d) => `Tài liệu: ${d.title}`)],
    model_used: model,
  };
}

// ═══ Khối: Nhắn tin ═══

async function resolveMessageContent(node, bag, upstreamIds) {
  const cfg = node.node_config || {};
  const raw = String(cfg.content || '').trim();
  if (raw) return resolveTokens(raw, bag);

  // Để trống → lấy nguyên văn kết quả của khối hành động gần nhất phía trước.
  for (const nodeId of upstreamIds) {
    const outputs = bag.get(nodeId);
    if (!outputs) continue;
    const value = outputs.report_text || outputs.text;
    if (value) return String(value);
  }
  return '';
}

async function sendMessage({ channel, targetId, userIds = [], title, content, io, label }) {
  const sender = require('./aiBotSender');

  if (channel === 'group') {
    if (!targetId) throw new Error('Chưa chọn nhóm chat để gửi.');
    const row = await sender.insertGroupBotMessage(targetId, content, io, { name: label });
    return { message_id: row?.id || null, sent_to: [`group:${targetId}`] };
  }

  if (channel === 'department') {
    if (!targetId) throw new Error('Chưa chọn phòng ban để gửi.');
    const row = await sender.insertDepartmentBotMessage(targetId, content, io, { name: label });
    return { message_id: row?.id || null, sent_to: [`department:${targetId}`] };
  }

  if (channel === 'dm') {
    if (!userIds.length) throw new Error('Chưa chọn người nhận.');
    const sentTo = [];
    for (const uid of userIds) {
      const groupId = await sender.ensureDmGroupWithBot(uid);
      if (!groupId) continue;
      await sender.insertGroupBotMessage(groupId, content, io, { name: label });
      sentTo.push(`user:${uid}`);
    }
    if (!sentTo.length) throw new Error('Không mở được hộp thoại riêng với người nhận nào.');
    return { sent_to: sentTo };
  }

  if (channel === 'in_app') {
    if (!userIds.length) throw new Error('Chưa chọn người nhận thông báo.');
    const rows = userIds.map((uid) => ({
      user_id: uid,
      type: 'flow_report',
      title: title || 'Báo cáo từ luồng công việc',
      message: content.slice(0, 1000),
      entity_type: 'workflow_flow',
      entity_id: null,
      is_read: false,
    }));
    const { data, error } = await supabase.from('notifications').insert(rows).select();
    if (error) throw new Error(`insert notifications: ${error.message}`);
    try {
      const { dispatchNotificationToUser } = require('./notifications');
      for (const row of data || []) await dispatchNotificationToUser(io, row.user_id, row);
    } catch (dispatchErr) {
      console.warn('[flow-action] dispatchNotification:', dispatchErr.message);
    }
    return { sent_to: userIds.map((uid) => `user:${uid}`) };
  }

  throw new Error(`Kênh gửi chưa hỗ trợ: ${channel}`);
}

/**
 * Người nhận của kênh tin riêng / thông báo: danh sách chọn tay cộng các nhóm động
 * (hiện có «Thành viên hồ sơ») được suy ra tại thời điểm chạy. Cấu hình cũ chỉ có
 * một người ở `target_id` nên vẫn đọc lên như danh sách một phần tử.
 */
async function resolveRecipients(cfg, subject) {
  const picked = cfg.recipients && typeof cfg.recipients === 'object' ? cfg.recipients : null;
  const ids = new Set(
    (picked?.user_ids || (cfg.target_id ? [cfg.target_id] : [])).map(String).filter(Boolean),
  );

  if (picked?.dynamic?.includes('project_members')) {
    if (!subject) {
      throw new Error('Đang gửi cho «Thành viên hồ sơ» nhưng chưa có deal / dự án nào để tra người phụ trách.');
    }
    const { resolveSubjectMemberIds } = require('./flowModuleVariables');
    for (const id of await resolveSubjectMemberIds(subject)) ids.add(id);
  }
  return [...ids];
}

async function runNotifyNode(node, bag, upstreamIds, { io, dryRun, label, subject }) {
  const cfg = node.node_config || {};
  const content = await resolveMessageContent(node, bag, upstreamIds);
  if (!content.trim()) {
    throw new Error('Nội dung tin rỗng — soạn nội dung hoặc nối một khối báo cáo vào trước.');
  }
  const channel = cfg.channel || 'group';
  const userIds = ['dm', 'in_app'].includes(channel) ? await resolveRecipients(cfg, subject) : [];

  if (dryRun) {
    return {
      channel,
      message: content,
      sent_to: userIds.map((uid) => `user:${uid}`),
      preview_only: true,
    };
  }

  const sent = await sendMessage({
    channel,
    targetId: cfg.target_id,
    userIds,
    title: cfg.title,
    content,
    io,
    label,
  });
  return { channel, message: content, ...sent };
}

// ═══ Điều phối ═══

/** Tổ tiên của một node, gần → xa. */
function upstreamOf(edgesBySource, nodeId) {
  const incoming = new Map();
  for (const [source, targets] of edgesBySource.entries()) {
    for (const t of targets) {
      if (!incoming.has(t)) incoming.set(t, []);
      incoming.get(t).push(source);
    }
  }
  const seen = new Set();
  const ordered = [];
  let frontier = incoming.get(nodeId) || [];
  while (frontier.length) {
    const next = [];
    for (const id of frontier) {
      if (seen.has(id)) continue;
      seen.add(id);
      ordered.push(id);
      next.push(...(incoming.get(id) || []));
    }
    frontier = next;
  }
  return ordered;
}

async function logActionRun(row) {
  try {
    const { error } = await supabase.from('workflow_flow_action_runs').insert(row);
    if (error) console.warn('[flow-action] log:', error.message);
  } catch (err) {
    console.warn('[flow-action] log:', err.message);
  }
}

/** Token {{node.key}} mà các khối hành động đang dùng — để biết cần nạp bước module nào. */
function tokensReferencedBy(actionNodes) {
  const refs = new Set();
  for (const node of actionNodes) {
    for (const value of Object.values(node.node_config || {})) {
      const texts = Array.isArray(value) ? value : [value];
      for (const t of texts) {
        if (typeof t !== 'string') continue;
        for (const [, nodeId] of t.matchAll(TOKEN_RE)) refs.add(nodeId);
      }
    }
  }
  return refs;
}

/**
 * Bước module mà chuỗi hành động thật sự cần số liệu.
 *
 * Hai đường tiêu thụ: token {{bước.trường}} viết trong nội dung, và khối AI để chế độ
 * «đọc mọi khối phía trước» — khối này nuốt hết tổ tiên nên mọi module đứng trước nó
 * đều phải nạp. Không gom cả luồng vì một canvas đủ ba module mà chỉ nhắc tên deal thì
 * không cần đọc dự án lẫn bảng công việc.
 */
function neededModuleNodeIds(actionNodes, edgesBySource) {
  const needed = tokensReferencedBy(actionNodes);
  for (const node of actionNodes) {
    if (!AI_READER_KINDS.has(node.node_kind)) continue;
    const cfg = node.node_config || {};
    if (cfg.source === 'pick') continue;
    for (const id of upstreamOf(edgesBySource, node.node_id)) needed.add(id);
  }
  return needed;
}

/**
 * Nhánh bị loại sau khi khối AI phân loại chọn nhãn.
 *
 * Cạnh không đặt nhãn luôn chạy; cạnh có nhãn chỉ chạy khi trùng nhãn AI vừa chọn.
 * Node nào vẫn tới được qua một nhánh hợp lệ thì không chặn — nhờ vậy điểm gộp nhánh
 * phía sau (khối Nhắn tin dùng chung chẳng hạn) vẫn chạy bình thường.
 */
function blockedByLabel(outEdges, edgesBySource, nodeId, label) {
  const chosen = String(label || '').trim().toLowerCase();
  const allowed = [];
  const rejected = [];
  for (const e of outEdges.get(nodeId) || []) {
    const edgeLabel = String(e.label || '').trim().toLowerCase();
    const target = String(e.target_node_id);
    if (!edgeLabel || edgeLabel === chosen) allowed.push(target);
    else rejected.push(target);
  }
  if (!rejected.length) return new Set();

  const forward = (roots) => {
    const seen = new Set();
    const stack = [...roots];
    while (stack.length) {
      const id = stack.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      stack.push(...(edgesBySource.get(id) || []));
    }
    return seen;
  };

  const reachable = forward(allowed);
  const blocked = new Set();
  for (const id of forward(rejected)) {
    if (!reachable.has(id)) blocked.add(id);
  }
  return blocked;
}

/** Nạp sẵn giá trị của các bước module mà chuỗi hành động sẽ đọc. */
async function preloadModuleValues(graph, actionNodes, edgesBySource, subject, bag) {
  const needed = neededModuleNodeIds(actionNodes, edgesBySource);
  const moduleNodes = graph.nodes.filter(
    (n) => n.node_kind === 'module' && needed.has(n.node_id) && n.module_key,
  );
  if (!moduleNodes.length) return [];

  if (!subject) {
    throw new Error(
      'Tin nhắn đang dùng dữ liệu của bước module nhưng chưa có deal / dự án nào để lấy số liệu.',
    );
  }

  const { createDataContext, resolveModuleVariables, MODULE_LABEL } = require('./flowModuleVariables');
  const ctx = createDataContext(subject);
  const missing = [];
  for (const node of moduleNodes) {
    const values = await resolveModuleVariables(node.module_key, ctx);
    if (values) bag.set(node.node_id, values);
    else missing.push(MODULE_LABEL[node.module_key] || node.description || node.module_key);
  }
  return missing;
}

/**
 * Chạy toàn bộ khối hành động của một luồng theo thứ tự topo.
 *
 * @param {string} flowId
 * @param {object} opts { dryRun, io, userId, onlyNodeId, subject }
 *   subject = { dealId, projectId } — chủ thể để lấy dữ liệu cho bước module
 * @returns {Promise<{ steps: Array, ran: number, failed: number, missingSubjects: string[] }>}
 */
async function runFlowActions(flowId, opts = {}) {
  const { dryRun = true, io = null, userId = null, onlyNodeId = null, subject = null } = opts;
  const { loadGraph } = require('./flowRuntime');
  const graph = await loadGraph(flowId);
  if (!graph) {
    throw new Error('Luồng chưa có dữ liệu đồ thị. Mở Setup luồng và lưu lại một lần.');
  }

  const edgesBySource = new Map();
  for (const [src, list] of graph.outEdges.entries()) {
    edgesBySource.set(src, list.map((e) => String(e.target_node_id)));
  }

  // order_index đã là thứ tự topo do flowGraph tính khi lưu.
  const actionNodes = graph.nodes
    .filter((n) => ACTION_KINDS.has(n.node_kind))
    .sort((a, b) => (Number(a.order_index) || 0) - (Number(b.order_index) || 0));

  if (!actionNodes.length) {
    return { steps: [], ran: 0, failed: 0, missingSubjects: [] };
  }

  const bag = new Map();
  const steps = [];
  let failed = 0;

  const missingSubjects = await preloadModuleValues(graph, actionNodes, edgesBySource, subject, bag);

  // Tên bước để AI thấy «Sản xuất — xưởng» thay vì node_id vô nghĩa.
  const { MODULE_LABEL } = require('./flowModuleVariables');
  const labelById = new Map(graph.nodes.map((n) => [
    n.node_id,
    n.node_config?.label || n.description || MODULE_LABEL[n.module_key] || n.module_key || n.node_kind,
  ]));

  const blocked = new Set();

  for (const node of actionNodes) {
    const label = node.node_config?.label || node.description || node.node_kind;
    if (onlyNodeId && node.node_id !== onlyNodeId && !upstreamOf(edgesBySource, onlyNodeId).includes(node.node_id)) {
      continue;
    }
    if (blocked.has(node.node_id)) {
      steps.push({
        node_id: node.node_id,
        node_kind: node.node_kind,
        label,
        status: 'skipped',
        ms: 0,
        note: 'Nhánh này không trúng nhãn AI phân loại vừa chọn.',
      });
      continue;
    }

    const upstreamIds = upstreamOf(edgesBySource, node.node_id);
    const started = Date.now();
    try {
      let outputs;
      if (node.node_kind === 'report') outputs = await runReportNode(node);
      else if (node.node_kind === 'ai_report') outputs = await runAiReportNode(node, bag, upstreamIds, labelById);
      else if (node.node_kind === 'ai_classify') outputs = await runAiClassifyNode(node, bag, upstreamIds, labelById);
      else if (node.node_kind === 'ai_extract') outputs = await runAiExtractNode(node, bag, upstreamIds, labelById);
      else if (node.node_kind === 'ai_ask') outputs = await runAiAskNode(node, bag, upstreamIds, labelById);
      else outputs = await runNotifyNode(node, bag, upstreamIds, { io, dryRun, label, subject });

      if (node.node_kind === 'ai_classify') {
        for (const id of blockedByLabel(graph.outEdges, edgesBySource, node.node_id, outputs.label)) {
          blocked.add(id);
        }
      }

      bag.set(node.node_id, outputs);
      steps.push({
        node_id: node.node_id,
        node_kind: node.node_kind,
        label,
        status: 'ok',
        ms: Date.now() - started,
        output: outputs,
      });
      await logActionRun({
        flow_id: flowId,
        node_id: node.node_id,
        node_kind: node.node_kind,
        status: 'ok',
        dry_run: dryRun,
        triggered_by: userId,
        input_summary: { upstream: upstreamIds },
        output_summary: summarizeOutput(outputs),
      });
    } catch (err) {
      failed += 1;
      steps.push({
        node_id: node.node_id,
        node_kind: node.node_kind,
        label,
        status: 'error',
        ms: Date.now() - started,
        error: err.message,
      });
      await logActionRun({
        flow_id: flowId,
        node_id: node.node_id,
        node_kind: node.node_kind,
        status: 'error',
        dry_run: dryRun,
        triggered_by: userId,
        input_summary: { upstream: upstreamIds },
        output_summary: {},
        error: err.message,
      });
    }
  }

  const skipped = steps.filter((s) => s.status === 'skipped').length;
  return { steps, ran: steps.length - skipped, skipped, failed, missingSubjects };
}

/** Bản rút gọn để ghi nhật ký — tránh nhét cả cục JSON báo cáo vào DB. */
function summarizeOutput(outputs) {
  const out = {};
  for (const [k, v] of Object.entries(outputs || {})) {
    if (typeof v === 'string') out[k] = v.slice(0, 500);
    else if (Array.isArray(v)) out[k] = v.slice(0, 20);
    else if (v && typeof v === 'object') out[k] = '[object]';
    else out[k] = v;
  }
  return out;
}

module.exports = {
  ACTION_KINDS,
  runFlowActions,
  resolveTokens,
  callOpenAiText,
};
