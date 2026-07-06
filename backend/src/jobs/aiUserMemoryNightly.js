/**
 * AI User Memory nightly — ~02:30 sáng (sau KPI cron 01:00).
 *
 * Quét user_activity_log 7 ngày → rút fact → lưu ai_chat_bot_user_facts.
 * Disable: AI_USER_MEMORY_CRON_DISABLED=1
 */

const { rebuildAllActiveUsers } = require('../helpers/aiUserMemory');
const { runIfLeader } = require('../helpers/cronLeader');

const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;

function msUntilNext230AM() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(2, 30, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

async function runOnce() {
  const startedAt = Date.now();
  console.log('[ai-memory-cron] Bắt đầu rebuild user facts', new Date().toISOString());
  try {
    const result = await rebuildAllActiveUsers({ days: 7, useGpt: true });
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(
      `[ai-memory-cron] Xong ${elapsed}s · processed=${result.processed} · ok=${result.ok}`,
    );
    return result;
  } catch (err) {
    console.error('[ai-memory-cron] Lỗi:', err);
    throw err;
  }
}

let started = false;
function start() {
  if (started) return;
  if (process.env.AI_USER_MEMORY_CRON_DISABLED === '1') {
    console.log('[ai-memory-cron] Disabled by AI_USER_MEMORY_CRON_DISABLED=1');
    return;
  }
  started = true;
  const delay = msUntilNext230AM();
  console.log(`[ai-memory-cron] Lần chạy đầu sau ${(delay / HOUR_MS).toFixed(2)}h`);
  setTimeout(function tick() {
    void runIfLeader('ai-user-memory-nightly', () => runOnce(), { ttlSec: 21_600 }).finally(() => {
      setTimeout(tick, DAY_MS);
    });
  }, delay);
}

module.exports = { start, runOnce };
