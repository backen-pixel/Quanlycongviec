/**
 * Tương thích script cũ. Runtime mới: dailyReportSnapshot + dailyReportStaffing.
 */
const staffing = require('./dailyReportStaffing');
const { runSnapshotBatch, listCrmUsersForSnapshot, listCompanyIdsForSnapshot } = require('./dailyReportSnapshot');

module.exports = {
  ...staffing,
  resultDateForReport: (d) => d,
  runAutoCloseBatch: runSnapshotBatch,
  listCrmUsersForAutoClose: listCrmUsersForSnapshot,
  listCompanyIdsForAutoClose: listCompanyIdsForSnapshot,
  autoCloseDailyReportForUser: async () => {
    throw new Error('autoCloseDailyReportForUser đã gỡ — dùng snapshotUser / runSnapshotBatch');
  },
};
