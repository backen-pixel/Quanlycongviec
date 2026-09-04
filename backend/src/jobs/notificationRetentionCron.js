/**
 * Dọn thông báo cũ — ~03:10 sáng.
 *
 * Vì sao cần: bảng notifications chưa từng được dọn. Đo ngày 03/09/2026:
 * 430.576 dòng / 329 MB, trong đó 271.868 dòng cũ hơn 60 ngày và 159.028 dòng
 * trong số đó VẪN chưa đọc. Câu đếm badge (pgHotQueries.pgDashboardNotificationStats)
 * lọc `is_read = false AND dismissed_at IS NULL` nên phải đọc hết số đó mỗi lần poll:
 * người nặng nhất có 22.030 dòng → sort tràn ra đĩa (8.688 kB temp) → đo được 312ms,
 * có lần chạy tới 11,1 giây. Sau khi ẩn phần cũ hơn 60 ngày: 10.387 dòng, 63ms,
 * không còn tràn đĩa.
 *
 * Cách làm — KHÔNG xóa dữ liệu:
 *   Chỉ đặt `dismissed_at` cho thông báo chưa đọc quá hạn. Mọi đường đọc đều lọc
 *   `dismissed_at IS NULL` nên chúng rời khỏi badge và danh sách, nhưng dòng vẫn còn
 *   nguyên trong bảng và hoàn tác được (xem database/583_...sql).
 *   Không đụng tới thông báo đã đọc — muốn xóa hẳn thì làm thủ công, có kiểm soát.
 *
 * Cấu hình:
 *   NOTIFICATION_RETENTION_DAYS=60      số ngày giữ trên badge (mặc định 60)
 *   NOTIFICATION_RETENTION_DISABLED=1   tắt job
 */

const { supabase } = require('../config/supabase');
const { pgQuerySafe } = require('../config/db');
const { runIfLeader } = require('../helpers/cronLeader');

const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Lô cho đường SQL trực tiếp — id không đi qua URL nên lô lớn được. */
const BATCH_SQL = 5000;
/**
 * Lô cho đường Supabase REST (fallback). PHẢI nhỏ: `.in('id', ids)` nhét cả danh
 * sách UUID vào query string, mỗi UUID ~40 ký tự → 5000 id ≈ 200 KB URL, proxy
 * sẽ trả 414 và job chết ngay lô đầu. 200 id ≈ 8 KB, đã sát giới hạn. Đừng nâng.
 */
const BATCH_REST = 200;

function retentionDays() {
  const n = parseInt(process.env.NOTIFICATION_RETENTION_DAYS || '60', 10);
  return Number.isFinite(n) && n >= 7 ? n : 60;
}

function msUntilNext310AM() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(3, 10, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

/**
 * Ẩn thông báo chưa đọc quá hạn khỏi badge, chia lô để không giữ lock lâu.
 * @returns {Promise<{ hidden: number, days: number, batches: number }>}
 */
async function runOnce() {
  const days = retentionDays();
  const cutoff = new Date(Date.now() - days * DAY_MS).toISOString();
  const startedAt = Date.now();
  let hidden = 0;
  let batches = 0;

  // ── Đường nhanh: SQL trực tiếp qua pg.Pool ────────────────────────────
  // Một câu ngắn cho mỗi lô, không đưa danh sách id qua query string.
  const SQL = `UPDATE public.notifications SET dismissed_at = now() WHERE id IN (
    SELECT id FROM public.notifications
    WHERE is_read = false AND dismissed_at IS NULL AND created_at < $1
    LIMIT ${BATCH_SQL})`;
  let viaSql = false;
  for (;;) {
    const res = await pgQuerySafe(SQL, [cutoff]);
    if (res == null) break; // pool không khả dụng → chuyển sang REST
    viaSql = true;
    const n = res.rowCount || 0;
    hidden += n;
    batches += 1;
    if (n < BATCH_SQL) break;
    if (batches > 200) {
      console.warn('[notification-retention] Dừng ở 200 lô, phần còn lại để lần chạy sau');
      break;
    }
  }

  // ── Fallback: Supabase REST, lô nhỏ ───────────────────────────────────
  while (!viaSql) {
    const { data: rows, error: selErr } = await supabase
      .from('notifications')
      .select('id')
      .eq('is_read', false)
      .is('dismissed_at', null)
      .lt('created_at', cutoff)
      .limit(BATCH_REST);
    if (selErr) throw selErr;
    if (!rows || !rows.length) break;

    const ids = rows.map((r) => r.id);
    const { error: updErr } = await supabase
      .from('notifications')
      .update({ dismissed_at: new Date().toISOString() })
      .in('id', ids);
    if (updErr) throw updErr;

    hidden += ids.length;
    batches += 1;
    if (ids.length < BATCH_REST) break;
    if (batches > 200) {
      console.warn('[notification-retention] Dừng ở 200 lô, phần còn lại để lần chạy sau');
      break;
    }
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `[notification-retention] Xong ${elapsed}s · ẩn ${hidden} thông báo chưa đọc cũ hơn ${days} ngày`,
  );
  return { hidden, days, batches };
}

let started = false;
function start() {
  if (started) return;
  if (process.env.NOTIFICATION_RETENTION_DISABLED === '1') {
    console.log('[notification-retention] Disabled by NOTIFICATION_RETENTION_DISABLED=1');
    return;
  }
  started = true;
  const delay = msUntilNext310AM();
  console.log(
    `[notification-retention] Giữ ${retentionDays()} ngày · lần chạy đầu sau ${(delay / HOUR_MS).toFixed(2)}h`,
  );
  setTimeout(function tick() {
    void runIfLeader('notification-retention', () => runOnce(), { ttlSec: 21_600 })
      .catch((e) => console.warn('[notification-retention] Lỗi:', e.message))
      .finally(() => { setTimeout(tick, DAY_MS); });
  }, delay);
}

module.exports = { start, runOnce };
