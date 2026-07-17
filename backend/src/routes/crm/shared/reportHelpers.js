/** Org / staff CRM report helpers (facade over helpersBundle). */
const h = require('./helpersBundle');

module.exports = {
  computeOrgOverviewReportData: h.computeOrgOverviewReportData,
  computeStaffLeadDealReportData: h.computeStaffLeadDealReportData,
  fetchCrmLeadsForOrgReportBatched: h.fetchCrmLeadsForOrgReportBatched,
  fetchCrmLeadsForDashboardBatched: h.fetchCrmLeadsForDashboardBatched,
  parseCrmReportDateRange: h.parseCrmReportDateRange,
  resolveCrmReportScope: h.resolveCrmReportScope,
};
