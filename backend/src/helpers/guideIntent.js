/**
 * INTENT SUB-AGENT — turns "what is the user actually trying to do" into a query string for the
 * experience store.
 *
 * ═══════════════ WHAT IT FIXES ═══════════════
 *
 * Before this, the experience store was searched with the VERBATIM last user question
 * (`lastQuestion(messages)` in copilotkit.js). Cheap, but it misses three very common shapes:
 *
 *  1. FOLLOW-UP QUESTIONS. "còn tháng trước thì sao?" ("what about last month?") — the verbatim
 *     text contains not one word about the actual task. Jaccard returns 0, the embedding returns
 *     a vector for a meaningless sentence. The store holds the exact path we need and there is
 *     no way to hit it.
 *  2. FILLER WORDS. "bạn có thể giúp mình xem cách lọc deal theo công ty không" — the stopword
 *     list catches `ban/giup/xem/khong`, but only words that are ON the list; unusual filler
 *     slips through.
 *  3. SYMPTOM, NOT TASK. "sao nó không ra kết quả gì" ("why does nothing show up") — the real
 *     task ("filter deals by staff") lives in the PREVIOUS turn, not in this sentence.
 *
 * The sub-agent reads the question PLUS context (recent turns, current screen) and returns a
 * SELF-CONTAINED task sentence — one that still makes sense read on its own — to search with.
 *
 * THE MAIN AGENT NEVER KNOWS THIS HAPPENS. It still receives experience through context as
 * before: no tool to call, no step consumed. That is deliberate — making it a tool costs the
 * main agent one extra model round-trip per use (see decision 3 at the top of guideExperience.js),
 * and the main agent would not call it exactly when it matters most: when it THINKS it already
 * knows the way.
 *
 * ═══════════════ THREE LATCHES SO IT CAN NEVER BREAK A TURN ═══════════════
 *
 * Same pattern as `guideEmbedding.js`, because it is the same class of risk: a side feature is
 * never allowed to kill an answer.
 *
 *  1. DISABLED / NO KEY → return `null`. The caller falls back to the verbatim question, i.e.
 *     exactly the previous behaviour.
 *  2. NETWORK ERROR / TIMEOUT → `null`, never throws.
 *  3. MALFORMED OUTPUT → `null`. Small models like to wrap JSON in prose or drop fields; losing
 *     one lookup beats querying with garbage and then injecting an unrelated path into context.
 *
 * ═══════════════ EXACTLY ONE CALL PER TURN ═══════════════
 *
 * This is the most important cost latch, and the easiest place to get wrong.
 *
 * `addExperienceToInput` runs on EVERY request, and one user turn spans many requests (browser
 * tools end the run after each step — see "trap 2" in copilotkit.js). Without a cache, a 6-step
 * question costs 6 sub-agent calls. Cached by `threadId` + turn number, so each USER TURN costs
 * exactly one.
 *
 * The cache is RAM and dies on restart — acceptable, it only needs to survive one turn.
 */

const settings = require('./guideSettings');

const ENABLED = process.env.GUIDE_Y_DINH !== '0';
const TIMEOUT_MS = Number(process.env.GUIDE_Y_DINH_TIMEOUT) || 6000;

/** How many recent turns the sub-agent gets to read. Enough to resolve "what about the other one". */
const CONTEXT_TURNS = 4;
/** Chars kept per turn — the sub-agent only needs the GIST, not a whole data table. */
const TURN_CHAR_LIMIT = 300;

const CACHE_MAX = 200;
const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map(); // `${threadId}#${turn}` -> { intent, at }

let disabledReason = null; // why it was switched off for the rest of this process

function isEnabled() {
  return ENABLED && settings.get('intent_enabled') !== false && !disabledReason;
}

function smallModel() {
  return settings.get('intent_model') || '';
}

function status() {
  if (!ENABLED) return { enabled: false, reason: 'GUIDE_Y_DINH=0' };
  if (settings.get('intent_enabled') === false) return { enabled: false, reason: 'disabled_in_settings' };
  if (disabledReason) return { enabled: false, reason: disabledReason };
  return { enabled: true, model: smallModel(), cached: cache.size };
}

function pruneCache() {
  const cutoff = Date.now() - CACHE_TTL_MS;
  for (const [k, v] of cache) if (v.at < cutoff) cache.delete(k);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

/* ─────────────────────────── Sub-agent instructions ─────────────────────────── */

/**
 * Instructions are ENGLISH, output values stay VIETNAMESE.
 *
 * The store, the UI labels and the users are all Vietnamese, so `task` and `keywords` must come
 * back in Vietnamese or they will not match a single stored record. Only the instruction wrapper
 * is English — that is what keeps this file readable alongside the rest of the codebase.
 */
const SYSTEM_PROMPT = [
  'You are the INTENT INTERPRETER for an in-app guide assistant of a Vietnamese CRM.',
  '',
  'Your job is NOT to answer the user. Your job is to read the conversation and write ONE',
  'SELF-CONTAINED TASK SENTENCE that will be used to search a store of UI know-how.',
  '',
  'Rules:',
  '1. The task sentence must MAKE SENSE ON ITS OWN. If the user says "còn tháng trước thì sao?"',
  '   you must look at the previous turn and write "lọc deal theo tháng trước" — never copy the',
  '   user sentence as-is.',
  '2. Write it as a TASK, not a question. Drop politeness, subjects and question marks:',
  '   "bạn giúp mình xem cách lọc deal theo công ty không" becomes "lọc deal theo công ty".',
  '3. Use the domain vocabulary of the system when you recognise it: lead, deal, báo giá,',
  '   pipeline, giai đoạn, bộ lọc, công việc, deadline, sự kiện, dự án.',
  '4. NEVER include concrete values: customer names, phone numbers, amounts, specific dates.',
  '   "lọc deal của Metalla tháng 8" must become "lọc deal theo công ty và theo thời gian".',
  '5. keywords: 2 to 6 loose keywords, with or without diacritics, used for keyword matching.',
  '6. Do not invent a task the user did not ask for. When unsure, put only the part you are sure',
  '   about in `task` — do not widen the guess.',
  '',
  'WRITE `task` AND `keywords` IN VIETNAMESE. The store is Vietnamese; English will match nothing.',
  '',
  'Return JSON only — no prose, no code fences:',
  '{"task":"...","keywords":["...","..."]}',
].join('\n');

/** Flatten the context into a short block for the sub-agent. */
function buildContext({ question, path, screen, history }) {
  const out = [];
  if (path) out.push(`Current screen: ${path}${screen ? ` (${screen})` : ''}`);
  if (history && history.length) {
    out.push('', 'Recent turns (oldest to newest):');
    for (const h of history.slice(-CONTEXT_TURNS)) {
      const who = h.role === 'user' ? 'User' : 'Assistant';
      out.push(`- ${who}: ${String(h.text || '').slice(0, TURN_CHAR_LIMIT)}`);
    }
  }
  out.push('', `LATEST user message: ${String(question || '').slice(0, 600)}`);
  out.push('', 'Write the self-contained task sentence for that latest message.');
  return out.join('\n');
}

/* ─────────────────────────── Output sanitising ─────────────────────────── */

const CONTROL_CHARS = new RegExp('[\\u0000-\\u001f\\u007f]+', 'g');
const LEADING_MARKUP = new RegExp('^[\\s#>`*_-]+');

/**
 * Collapse to a single line and strip leading markup — same reason as `scrubData` in the
 * experience store.
 *
 * This string is written by A MODEL out of USER text, so it is an indirect prompt-injection
 * path. Today it only feeds matching (tokenize / embed) and is never printed into context, but
 * keeping it clean here is cheap and means a later change that does print it opens no new hole.
 */
function sanitize(value, maxLen) {
  return String(value || '')
    .replace(CONTROL_CHARS, ' ')
    .replace(LEADING_MARKUP, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, maxLen);
}

/**
 * Pull the JSON object out of the reply.
 *
 * Small models often add a lead-in ("Here is the JSON:") or wrap it in a code fence, so we do
 * not `JSON.parse` the whole thing — we slice from the first `{` to the last `}`. On failure
 * return `null`, which is latch 3.
 */
function extractJson(text) {
  const t = String(text || '');
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * @param {object} input  { threadId, turn, question, path, screen, history }
 * @param {(system: string, prompt: string, opts: {model: string, timeoutMs: number}) => Promise<string>} callModel
 *   Supplied by copilotkit.js — the only place that knows the active provider and API key.
 * @returns {Promise<{task: string, keywords: string[], path: string} | null>}
 */
async function inferIntent(input, callModel) {
  if (!isEnabled() || typeof callModel !== 'function') return null;
  const question = String(input && input.question ? input.question : '').trim();
  if (question.length < 3) return null;

  /**
   * The cache key includes the TURN NUMBER: the same thread's third turn is a different task
   * from its second, but `threadId` does not change. Leave the turn out and turn N reuses the
   * intent of turn N-1.
   *
   * With no `threadId` we DO NOT cache (rather than bucket everything under one anonymous key) —
   * bucketing would hand back someone else's intent. Paying for a repeat call beats being wrong.
   */
  const key = input && input.threadId ? `${input.threadId}#${input.turn || 1}` : '';
  if (key) {
    pruneCache();
    const hit = cache.get(key);
    if (hit) return hit.intent;
  }

  let reply = null;
  try {
    reply = await callModel(SYSTEM_PROMPT, buildContext(input), {
      model: smallModel(), timeoutMs: TIMEOUT_MS,
    });
  } catch (e) {
    const msg = String((e && e.message) || e);
    // 401/403 = bad key or no access → switch off for good, do not retry every turn.
    if (/401|403|api key|unauthorized|forbidden/i.test(msg)) {
      disabledReason = 'model_rejected';
      console.warn('[guide] intent sub-agent rejected — disabling:', msg.slice(0, 160));
    } else {
      console.error('[guide] intent sub-agent failed:', msg.slice(0, 160));
    }
    return null;
  }

  const parsed = extractJson(reply);
  const task = sanitize(parsed && parsed.task, 200);
  // `task` is the ONLY required field. Without it the whole result is useless — fall back to verbatim.
  if (!task || task.length < 3) return null;

  const keywords = (parsed && Array.isArray(parsed.keywords) ? parsed.keywords : [])
    .map((k) => sanitize(k, 40))
    .filter(Boolean)
    .slice(0, 6);

  const intent = {
    task,
    keywords,
    // Path is NOT taken from the model — the server already knows it for certain; letting the
    // model guess only invites error.
    path: String((input && input.path) || ''),
  };

  if (key) cache.set(key, { intent, at: Date.now() });
  return intent;
}

/**
 * The most recent intent for a thread — for the librarian sub-agent (guideLearn.js) to reuse.
 *
 * WHY NOT LOOK UP BY `${threadId}#${turn}`: the librarian is called from the `/experience`
 * endpoint, where the turn number is counted by the CLIENT (`turnCount(messages)`), while the
 * intent was stored under the turn number counted by the SERVER (`realTurnCount`). The two counts
 * are not guaranteed equal — `realTurnCount` filters self-inserted blocks, the client counts every
 * `role: 'user'` message. Matching on that number invites an off-by-one in the hardest place to see.
 *
 * Taking the thread's NEWEST entry is correct without matching anything: the librarian runs right
 * after a turn ends, so the newest intent for that thread is the intent of the turn just finished.
 */
function latestFor(threadId) {
  const t = String(threadId || '').trim();
  if (!t) return null;
  let best = null;
  for (const [key, value] of cache) {
    if (!key.startsWith(`${t}#`)) continue;
    if (!best || value.at > best.at) best = value;
  }
  return best ? best.intent : null;
}

/** For `/debug` — see whether the sub-agent runs at all, and what it interprets. */
function recent() {
  return [...cache.entries()].slice(-20).map(([key, value]) => ({
    key,
    at: new Date(value.at).toISOString(),
    task: value.intent.task,
    keywords: value.intent.keywords,
  }));
}

module.exports = { inferIntent, latestFor, status, recent, ENABLED };
