/**
 * FLOW LOG — records what happens ON THE SERVER during one turn, so the diagram can be drawn.
 *
 * ═══════════════ WHY A SEPARATE LOG ═══════════════
 *
 * The "Assistant actions" panel builds its diagram from CopilotKit's message stream, so it only
 * sees the SURFACE: which tool the model called, what the tool returned. Everything underneath
 * is invisible to it:
 *
 *   · did the start-of-turn experience lookup hit or miss, and did it hit by KEYWORD or by MEANING
 *   · was the embedding API called, how long did it take, or did it come from the cache
 *   · did rescue fire, at which step, and did it inject a HINT or a STOP notice
 *   · did the step ceiling warn or block
 *
 * Those are exactly the things that decide why a turn ran long or went the wrong way — and the
 * person reading the panel cannot see any of them. This log fills that gap.
 *
 * ═══════════════ WHY NOT FOLD IT INTO `guideUsage` ═══════════════
 *
 * `guideUsage` is the MONEY log: every record is one model call, with tokens and a price. Putting
 * free events (an experience cache hit, a vector read from cache) in there corrupts the sums —
 * and sooner or later someone adds them up and reports the wrong cost. Two logs, two jobs; the
 * client stitches them by timestamp.
 *
 * ═══════════════ CONSTRAINTS ═══════════════
 *
 * RAM only, lost on restart — this is a runtime inspection tool, not business data. Caps mirror
 * `guideUsage` so a long test session cannot eat all the memory.
 *
 * ═══════════════ WIRE SHAPE — CHANGE BOTH SIDES TOGETHER ═══════════════
 *
 * Every field written here is read by `AgentActivityPanel.jsx` over HTTP. Renaming one on this
 * side alone makes the panel render blanks with no error anywhere. Event types in use:
 *
 *   'experience'       tier, found, keyword, semantic, ms, embed_ms, intent
 *   'rescue'           mode, steps, signals, found
 *   'step_guard'       mode, steps, signals, remaining
 *   'learn'            action, code, candidates, reason
 *   'experience_write' route, saved, reason, steps, dead_ends, merged
 */

const MAX_PER_TURN = 80;   // a full-access turn runs ~12 steps; 80 is generous
const MAX_TURNS = 40;

const book = new Map(); // threadId -> [event]

/**
 * threadId -> the turn number currently running.
 *
 * This log groups by threadId, and one conversation has many turns — so without stamping the turn
 * number the "Flow" tab draws every recent turn on top of each other: one diagram with three
 * "experience lookup" events and twenty tool steps, while the turn just asked had four. The
 * diagram is for inspecting ONE turn, not a whole session.
 *
 * The AG-UI layer sets this on every request (it is the only place that sees `input.messages`);
 * `record` stamps against it, and `read` returns only the highest turn.
 */
const currentTurn = new Map();

function setTurn(threadId, n) {
  const key = String(threadId || '').trim();
  if (!key) return;
  const value = Number(n);
  if (Number.isFinite(value) && value > 0) currentTurn.set(key, value);
}

/**
 * @param {string} threadId
 * @param {string} type  'experience' | 'embed' | 'rescue' | 'step_guard' | 'learn' | 'experience_write'
 * @param {object} detail  type-specific fields — keep them SHORT, this is what the UI renders
 */
function record(threadId, type, detail = {}) {
  const key = String(threadId || '').trim();
  if (!key) return; // no key means drop it, never bucket into one anonymous pile

  let list = book.get(key);
  if (!list) {
    list = [];
    book.set(key, list);
    // Out of room means drop the OLDEST thread. JS Map keeps insertion order, so `keys().next()`
    // gives exactly that one.
    if (book.size > MAX_TURNS) {
      const oldest = book.keys().next().value;
      book.delete(oldest);
      currentTurn.delete(oldest);
    }
  }
  list.push({ at: Date.now(), turn: currentTurn.get(key) || 1, type, ...detail });
  if (list.length > MAX_PER_TURN) list.shift();
}

/**
 * By default returns only the NEWEST TURN — exactly what the "Flow" tab needs to draw.
 * `all: true` to inspect the whole conversation when tracing an older turn.
 */
function read(threadId, { all = false } = {}) {
  const key = String(threadId || '');
  const list = book.get(key) || [];
  if (all || list.length === 0) return list;
  /*
   * Take the RUNNING turn, not the highest turn recorded. The two differ at the start of every new
   * turn: nothing has been recorded yet, and "highest turn recorded" is still the previous one —
   * so the Flow tab would redraw the old question's diagram while the new one is running.
   * Returning empty is better: blank beats wrong.
   */
  let mark = currentTurn.get(key) || 0;
  if (!mark) for (const e of list) if ((e.turn || 0) > mark) mark = e.turn || 0;
  return list.filter((e) => (e.turn || 0) === mark);
}

function clear(threadId) {
  const key = String(threadId || '');
  book.delete(key);
  currentTurn.delete(key);
}

module.exports = { record, read, clear, setTurn, MAX_PER_TURN };
