/** Snapshot phân trang view Deadline — dùng chung để invalidate khi đổi hạn. */

const CRM_DEADLINE_SNAPSHOT_TTL_MS = 20 * 60 * 1000;
const crmDeadlineSnapshotCache = new Map();

function pruneCrmDeadlineSnapshotCache() {
  const now = Date.now();
  for (const [key, entry] of crmDeadlineSnapshotCache) {
    if (entry.expiresAt < now) crmDeadlineSnapshotCache.delete(key);
  }
}

function invalidateCrmDeadlineSnapshots() {
  crmDeadlineSnapshotCache.clear();
}

module.exports = {
  CRM_DEADLINE_SNAPSHOT_TTL_MS,
  crmDeadlineSnapshotCache,
  pruneCrmDeadlineSnapshotCache,
  invalidateCrmDeadlineSnapshots,
};
