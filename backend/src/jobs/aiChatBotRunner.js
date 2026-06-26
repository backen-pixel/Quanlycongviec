/**
 * Cron worker cho "🤖 AI Assistant" trong chat phòng ban / nhóm.
 *
 * Cách hoạt động:
 *   - Tick mỗi 60 giây (đầu phút).
 *   - Lấy mọi schedule enabled, với mỗi slot (h:m) trong run_slots:
 *     • Nếu giờ:phút VN hiện tại == slot (cùng phút) → kiểm tra:
 *         · Đúng weekday (nếu có cấu hình weekdays)
 *         · Đếm ai_chat_bot_runs theo (schedule_id, vn_date) < max_runs_per_day
 *         · Chưa chạy slot này trong ngày (dedupe theo slot_label)
 *       → gọi runScheduleSend(schedule, io)
 *       → ghi log ai_chat_bot_runs + update last_run_* trên schedule
 *
 * Lý do chọn poll-by-minute thay vì setTimeout(theo slot):
 *   - Admin có thể CRUD/đổi slots bất kỳ lúc nào — không cần khởi động lại cron.
 *   - Đảm bảo idempotent kể cả server restart giữa ngày.
 *
 * Tắt: AI_CHAT_BOT_CRON_DISABLED=1
 */

const { supabase } = require('../config/supabase');
const { runScheduleSend } = require('../helpers/aiBotSender');
const { runIfLeader } = require('../helpers/cronLeader');

const TICK_MS = 60 * 1000;
const VN_TZ = 'Asia/Ho_Chi_Minh';

function vnDateYmd(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: VN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** {hh,mm,weekday(1..7)} theo giờ VN, weekday: 1=T2..7=CN */
function vnNowParts() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: VN_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(new Date());
  const hh = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
  const mm = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
  const wd = parts.find((p) => p.type === 'weekday')?.value || '';
  const wdMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return { hh, mm, weekday: wdMap[wd] || 1 };
}

function slotLabel(slot) {
  return `${String(slot.h).padStart(2, '0')}:${String(slot.m).padStart(2, '0')}`;
}

async function processSchedule(sched, io, nowParts, vnDate) {
  const slots = Array.isArray(sched.run_slots) ? sched.run_slots : [];
  const matching = slots.filter((s) => parseInt(s.h, 10) === nowParts.hh && parseInt(s.m, 10) === nowParts.mm);
  if (!matching.length) return;

  if (Array.isArray(sched.weekdays) && sched.weekdays.length && !sched.weekdays.includes(nowParts.weekday)) {
    return;
  }

  // Đếm số lần đã chạy hôm nay (bỏ qua slot_label='manual' để bấm tay không ăn quota)
  const { count: runsToday } = await supabase
    .from('ai_chat_bot_runs')
    .select('id', { count: 'exact', head: true })
    .eq('schedule_id', sched.id)
    .eq('vn_date', vnDate)
    .neq('slot_label', 'manual');

  if ((runsToday || 0) >= (sched.max_runs_per_day || 1)) {
    return;
  }

  const label = slotLabel(matching[0]);

  // Dedupe: nếu slot này đã chạy hôm nay rồi → skip (tránh tick lặp do worker chạy chồng)
  const { data: dupe } = await supabase
    .from('ai_chat_bot_runs')
    .select('id')
    .eq('schedule_id', sched.id)
    .eq('vn_date', vnDate)
    .eq('slot_label', label)
    .limit(1);
  if (dupe?.length) return;

  console.log(`[ai-bot-cron] Chạy schedule ${sched.id} (${sched.title}) slot ${label}`);

  let result;
  try {
    result = await runScheduleSend(sched, io);
  } catch (e) {
    result = { status: 'error', error: e.message };
  }

  await supabase.from('ai_chat_bot_runs').insert({
    schedule_id: sched.id,
    vn_date: vnDate,
    slot_label: label,
    status: result.status,
    message_preview: result.preview || null,
    error_text: result.error || null,
    message_id: result.message_id || null,
    triggered_by: null,
  });

  await supabase
    .from('ai_chat_bot_schedules')
    .update({
      last_run_at: new Date().toISOString(),
      last_run_status: result.status,
      last_run_message: result.preview || result.error || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sched.id);
}

async function tick(io) {
  const nowParts = vnNowParts();
  const vnDate = vnDateYmd();

  const { data: schedules, error } = await supabase
    .from('ai_chat_bot_schedules')
    .select('*')
    .eq('enabled', true);
  if (error) {
    console.warn('[ai-bot-cron] Load schedules lỗi:', error.message);
    return;
  }
  if (!schedules?.length) return;

  // Chạy tuần tự để tránh spike OpenAI/DB; số lượng lịch thường <= vài chục.
  for (const sched of schedules) {
    try {
      await processSchedule(sched, io, nowParts, vnDate);
    } catch (e) {
      console.error(`[ai-bot-cron] schedule ${sched.id} lỗi:`, e.message);
    }
  }
}

let started = false;
let timer = null;

function start(io) {
  if (started) return;
  if (process.env.AI_CHAT_BOT_CRON_DISABLED === '1') {
    console.log('[ai-bot-cron] Disabled by env AI_CHAT_BOT_CRON_DISABLED=1');
    return;
  }
  started = true;

  // Căn về đầu phút tiếp theo rồi tick mỗi 60s
  const now = new Date();
  const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
  console.log(
    `[ai-bot-cron] Khởi động · tick mỗi 60s · lần đầu sau ${Math.round(msToNextMinute / 1000)}s`,
  );

  setTimeout(() => {
    runIfLeader('ai-chat-bot', () => tick(io), { ttlSec: 55 }).catch((e) => console.error('[ai-bot-cron] tick lỗi:', e.message));
    timer = setInterval(() => {
      runIfLeader('ai-chat-bot', () => tick(io), { ttlSec: 55 }).catch((e) => console.error('[ai-bot-cron] tick lỗi:', e.message));
    }, TICK_MS);
  }, Math.max(msToNextMinute, 1000));
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}

module.exports = { start, stop, tick };
