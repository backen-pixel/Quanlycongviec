/**
 * Báo cáo log cập nhật Primary ↔ Backup cho tab giám sát.
 */
const config = require('../config');
const { getActiveTarget } = require('../config/supabaseRouter');
const { listReplicationQueue, getQueueDepth, getReplicationStatus } = require('./supabaseReplication');
const { fetchFailbackLogEntries, getPendingCount, getFailbackStatus, hasFailbackEndpoints } = require('./supabaseFailback');

async function getUpdateLogsReport({ limit = 80, failbackPendingOnly = false } = {}) {
  const cap = Math.min(200, Math.max(1, parseInt(limit, 10) || 80));

  let primaryLog = {
    label: 'Primary (Chính)',
    direction: 'Chính → Dự phòng',
    description: 'Thay đổi ghi khi đang dùng Primary — chờ replay lên Backup',
    enabled: false,
    queue_depth: 0,
    items: [],
    error: null,
  };

  let backupLog = {
    label: 'Backup (Dự phòng)',
    direction: 'Dự phòng → Chính',
    description: 'Thay đổi ghi trên Backup (supabase_failback_log) — replay về Primary',
    enabled: false,
    pending: 0,
    items: [],
    error: null,
  };

  const loggingOn = config.supabaseSwitchLogEnabled
    || config.supabaseReplicationEnabled
    || config.supabaseFailoverEnabled;

  try {
    const repStatus = getReplicationStatus();
    primaryLog.enabled = loggingOn && repStatus.enabled === true;
    const repList = await listReplicationQueue({ limit: cap });
    primaryLog.queue_depth = repList.total ?? await getQueueDepth().catch(() => 0);
    primaryLog.items = repList.items || [];
    primaryLog.stats = {
      enqueued: repStatus.enqueued,
      applied: repStatus.applied,
      failed: repStatus.failed,
      last_applied_at: repStatus.last_applied_at,
      last_error: repStatus.last_error,
    };
  } catch (e) {
    primaryLog.error = e.message;
  }

  try {
    const fbStatus = getFailbackStatus();
    backupLog.enabled = loggingOn && hasFailbackEndpoints();
    backupLog.pending = await getPendingCount().catch(() => 0);
    backupLog.items = await fetchFailbackLogEntries({
      limit: cap,
      pendingOnly: failbackPendingOnly === true,
    });
    backupLog.stats = {
      logged: fbStatus.logged,
      replayed: fbStatus.replayed,
      replay_failed: fbStatus.replay_failed,
      last_replay_at: fbStatus.last_replay_at,
      last_error: fbStatus.last_error,
    };
  } catch (e) {
    backupLog.error = e.message;
  }

  return {
    checked_at: new Date().toISOString(),
    active_target: getActiveTarget(),
    primary_log: primaryLog,
    backup_log: backupLog,
  };
}

module.exports = {
  getUpdateLogsReport,
};
