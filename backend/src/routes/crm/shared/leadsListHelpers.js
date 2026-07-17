/** Leads list / kanban helpers (facade over helpersBundle). */
const h = require('./helpersBundle');

module.exports = {
  fetchCrmLeadsPageViaRpc: h.fetchCrmLeadsPageViaRpc,
  hydrateCrmLeadsRpcPage: h.hydrateCrmLeadsRpcPage,
  resolveCrmLeadsKanbanLite: h.resolveCrmLeadsKanbanLite,
  countOpenOverdueCrmTasksForLeadIds: h.countOpenOverdueCrmTasksForLeadIds,
  nextCode: h.nextCode,
};
