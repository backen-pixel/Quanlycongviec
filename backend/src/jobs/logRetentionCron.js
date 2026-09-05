/**
 * Dọn các bảng log — ~03:40 sáng (sau notificationRetentionCron lúc 03:10).
 *
 * VÌ SAO CẦN (đo ngày 04/09/2026 trên project kdxypztstbeovyedmvem):
 *   facebook_webhook_logs  291.552 dòng / 199 MB  — 271.575 dòng (93%) cũ hơn 14 ngày
 *   user_activity_log      204.475 dòng / 125 MB  — cũ nhất 25/05/2026
 *   unified_task_history   167.379 dòng /  70 MB  — KHÔNG dọn, xem ghi chú dưới
 *
 *   Tổng ba bảng = 394 MB, gần một nửa dung lượng database. Chúng chưa từng
 *   được dọn nên chỉ có tăng.
 *
 * facebook_webhook_logs là log gỡ lỗi thuần:
 *   - Chỉ có 3 chỗ INSERT (routes/facebook.js) + 1 endpoint đọc 20 dòng mới nhất
 *     + 1 endpoint "xoá tất cả". Không có báo cáo hay giao diện nào đọc dữ liệu cũ.
 *   - Nằm trong danh sách bỏ qua replication (helpers/supabaseReplication.js)
 *     nên xoá ở primary không ảnh hưởng backup.
 *   => An toàn để XOÁ hẳn dòng quá hạn. Mặc định giữ 14 ngày.
 *
 * user_activity_log là log audit, CÓ nơi đọc:
 *   helpers/aiReportTools.js, helpers/aiUserMemory.js, helpers/userUsageAnalytics.js,
 *   helpers/supabaseMonitorAudit.js — tất cả đều truy vấn theo cửa sổ `since`
 *   (ngày/tuần/tháng gần đây), không đọc dữ liệu nửa năm trước.
 *   => Xoá quá hạn nhưng để mặc định RẤT thoáng: 180 ngày. Ở thời điểm viết job
 *      này, dòng cũ nhất mới 102 ngày nên job chưa xoá gì — nó là hàng rào cho
 *      tương lai, không phải thao tác dọn ngay.
 *
 * unified_task_history CỐ Ý KHÔNG DỌN:
 *   routes/workTasks.js đọc bảng này để hiện lịch sử thay đổi của từng công việc
 *   trên giao diện, và crmKanbanDeadlineHistory.js dựa vào nó để tính lại deadline.
 *   Xoá dòng cũ sẽ làm mất lịch sử người dùng đang xem. Muốn dọn thì phải quyết
 *   định nghiệp vụ trước (ví dụ chỉ xoá history của task đã đóng > 1 năm), không
 *   phải việc của một job dọn theo ngày.
 *
 * CẤU HÌNH:
 *   LOG_RETENTION_DISABLED=1                tắt toàn bộ job
 *   FB_WEBHOOK_LOG_RETENTION_DAYS=14        (tối thiểu 3, đặt 0 để bỏ qua bảng này)
 *   USER_ACTIVITY_LOG_RETENTION_DAYS=180    (tối thiểu 30, đặt 0 để bỏ qua bảng này)
 */

const { supabase } = require('../config/supabase');
const { pgQuerySafe } = require('../config/db');
const { runIfLeader } = require('../helpers/cronLeader');

const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Lô cho đường SQL trực tiếp — id không đi qua URL nên lô lớn được. */
const BATCH_SQL = 5000;
/**
 * Lô cho đường Supabase REST (fallback). PHẢI nhỏ hơn nhiều so với BATCH_SQL:
 * `.in('id', ids)` nhét cả danh sách UUID vào query string (~40 ký tự mỗi id).
 * GIỚI HẠN THẬT, ĐO TRÊN DB NÀY (helpers/supabaseQueryGuard.js):
 *   `.in(...)` gãy khi vượt 643 id, chuỗi `or(...)` gãy khi vượt 556 id,
 *   tương ứng URL ~22.000–24.000 ký tự; vượt nữa thì ĐỨT KẾT NỐI.
 * 300 là ngưỡng cảnh báo của chính guard đó (SUPABASE_GUARD_IN_WARN).
 */
const BATCH_REST = 300;
const MAX_BATCHES = 400;
/** Bảng được phép dọn — chặn truy vấn động ghép tên bảng tuỳ ý vào SQL. */
const ALLOWED = Object.freeze({
  facebook_webhook_logs: 'processed_at',
  user_activity_log: 'created_at',
});

/** Đọc số ngày giữ từ env; trả 0 nghĩa là bỏ qua bảng đó. */
function retentionDays(envKey, fallback, min) {
  const raw = process.env[envKey];
  if (raw === '0') return 0;
  const n = parseInt(raw || String(fallback), 10);
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return fallback;
  return n;
}

function msUntilNext340AM() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(3, 40, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

/**
 * Xoá theo lô các dòng cũ hơn `cutoff`.
 *
 * Ưu tiên SQL trực tiếp qua pg.Pool: `DELETE ... WHERE id IN (SELECT id ... LIMIT n)`
 * chỉ gửi MỘT câu ngắn cho mỗi lô. Đường Supabase REST (fallback khi không có pool)
 * phải liệt kê id trong query string nên dùng lô nhỏ hơn 25 lần.
 *
 * @param {string} table  phải nằm trong ALLOWED
 * @param {number} days   0 = bỏ qua
 * @returns {Promise<{ table: string, deleted: number, days: number, via?: string, skipped?: string }>}
 */
async function pruneTable(table, days) {
  const tsColumn = ALLOWED[table];
  if (!tsColumn) return { table, deleted: 0, days, skipped: 'table_not_allowed' };
  if (!days) return { table, deleted: 0, days: 0, skipped: 'retention=0' };

  const cutoff = new Date(Date.now() - days * DAY_MS).toISOString();
  let deleted = 0;
  let batches = 0;

  // ── Đường nhanh: SQL trực tiếp ─────────────────────────────────────────
  // Tên bảng/cột lấy từ ALLOWED (hằng số trong file này), không từ input.
  const sql =
    `DELETE FROM public.${table} WHERE id IN (` +
    `SELECT id FROM public.${table} WHERE ${tsColumn} < $1 LIMIT ${BATCH_SQL})`;
  for (;;) {
    const res = await pgQuerySafe(sql, [cutoff]);
    if (res == null) break; // pool không khả dụng → chuyển sang REST
    const n = res.rowCount || 0;
    deleted += n;
    batches += 1;
    if (n < BATCH_SQL) return { table, deleted, days, via: 'sql' };
    if (batches >= MAX_BATCHES) {
      console.warn(`[log-retention] ${table}: dừng ở ${MAX_BATCHES} lô (${deleted} dòng), phần còn lại để lần chạy sau`);
      return { table, deleted, days, via: 'sql' };
    }
  }

  // ── Fallback: Supabase REST, lô nhỏ ────────────────────────────────────
  for (;;) {
    const { data: rows, error: selErr } = await supabase
      .from(table)
      .select('id')
      .lt(tsColumn, cutoff)
      .limit(BATCH_REST);
    if (selErr) {
      // Bảng chưa migrate trên môi trường này — im lặng bỏ qua.
      if (/does not exist|42P01/i.test(String(selErr.message || ''))) {
        return { table, deleted, days, via: 'rest', skipped: 'missing_table' };
      }
      throw selErr;
    }
    if (!rows || !rows.length) break;

    const ids = rows.map((r) => r.id);
    const { error: delErr } = await supabase.from(table).delete().in('id', ids);
    if (delErr) throw delErr;

    deleted += ids.length;
    batches += 1;
    if (ids.length < BATCH_REST) break;
    if (batches >= MAX_BATCHES) {
      console.warn(`[log-retention] ${table}: dừng ở ${MAX_BATCHES} lô (${deleted} dòng), phần còn lại để lần chạy sau`);
      break;
    }
  }

  return { table, deleted, days, via: 'rest' };
}

/** @returns {Promise<{ results: Array<object>, totalDeleted: number }>} */
async function runOnce() {
  const startedAt = Date.now();
  const plan = [
    ['facebook_webhook_logs', retentionDays('FB_WEBHOOK_LOG_RETENTION_DAYS', 14, 3)],
    ['user_activity_log', retentionDays('USER_ACTIVITY_LOG_RETENTION_DAYS', 180, 30)],
  ];

  const results = [];
  for (const [table, days] of plan) {
    try {
      results.push(await pruneTable(table, days));
    } catch (e) {
      console.warn(`[log-retention] ${table}: lỗi — ${e.message}`);
      results.push({ table, deleted: 0, days, skipped: `error: ${e.message}` });
    }
  }

  const totalDeleted = results.reduce((s, r) => s + r.deleted, 0);
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  const detail = results
    .map((r) => (r.skipped ? `${r.table}=${r.skipped}` : `${r.table}=${r.deleted}`))
    .join(' · ');
  console.log(`[log-retention] Xong ${elapsed}s · xoá ${totalDeleted} dòng · ${detail}`);
  return { results, totalDeleted };
}

let started = false;
function start() {
  if (started) return;
  if (process.env.LOG_RETENTION_DISABLED === '1') {
    console.log('[log-retention] Disabled by LOG_RETENTION_DISABLED=1');
    return;
  }
  started = true;
  const delay = msUntilNext340AM();
  console.log(
    `[log-retention] webhook_logs=${retentionDays('FB_WEBHOOK_LOG_RETENTION_DAYS', 14, 3)}d · ` +
      `activity_log=${retentionDays('USER_ACTIVITY_LOG_RETENTION_DAYS', 180, 30)}d · ` +
      `lần chạy đầu sau ${(delay / HOUR_MS).toFixed(2)}h`,
  );
  setTimeout(function tick() {
    void runIfLeader('log-retention', () => runOnce(), { ttlSec: 21_600 })
      .catch((e) => console.warn('[log-retention] Lỗi:', e.message))
      .finally(() => { setTimeout(tick, DAY_MS); });
  }, delay);
}

module.exports = { start, runOnce, pruneTable };
