/** Pipeline + Zalo OA helpers (facade over helpersBundle). */
const h = require('./helpersBundle');

module.exports = {
  getZaloNotifySettings: h.getZaloNotifySettings,
  upsertZaloNotifySettings: h.upsertZaloNotifySettings,
  maskZaloAccessTokenPreview: h.maskZaloAccessTokenPreview,
  isDealStageHoanThanhForZalo: h.isDealStageHoanThanhForZalo,
  fetchPipelineWithStagesById: h.fetchPipelineWithStagesById,
  fetchCrmPipelineZaloSlice: h.fetchCrmPipelineZaloSlice,
  executeZaloDealStageNotify: h.executeZaloDealStageNotify,
  maybeSendZaloOnDealStageEnter: h.maybeSendZaloOnDealStageEnter,
  respondIfCrmPipelinesTableMissing: h.respondIfCrmPipelinesTableMissing,
  isCrmPipelinesTableMissingError: h.isCrmPipelinesTableMissingError,
};
