/**
 * CRM routes: commercialDocs
 * Auto-extracted — handlers close over shared helpers via IIFE.
 */
const { Router } = require('express');
const helpers = require('../shared/helpersBundle');
const { getCompanyScopedAdminIds } = require('../../../helpers/notifications');

const r = Router();

(function (ALLOWED_DEADLINE_FIELDS, CRM_COMMENT_ALLOWED_REACTION_EMOJI, CRM_LEAD_KANBAN_LITE_SELECT, CRM_LEAD_LIST_SELECT, CRM_LEAD_LIST_SELECT_BASE, CRM_LEAD_LIST_SELECT_EXTRA, CRM_LEAD_REGION_EMBED, CRM_NEW_LEAD_MAX_AGE_MS, CRM_TASK_SELECT, CRM_UUID_RE, CUSTOMERS_IN_CHUNK, CUSTOMERS_OVERVIEW_NO_MATCH_ID, DEAL_PRE_CONTRACT_SLUGS_STAFF, DEAL_REPORT_BUCKET_VALUES, DEFAULT_CHECKLISTS, DEFAULT_DEADLINE_BUCKETS, DEFAULT_PIPELINE_STAGE_SLA_DAYS, FOLLOWUP_TIME_BUCKETS, PDFDocument, QUOTATIONS_SOURCE_EXCEL_COLS, Router, SCAN_DUP_LITE_SELECT, STAFF_LEAD_DEAL_REPORT_ROLES, SURVEY_EVENT_SELECT, SURVEY_EVENT_TYPES, XLSX, ZALO_APP_SETTING_KEY, crmSchemaCompat, addPhoneToAutoLeadBlocklist, aggregateCrmCommentReactions, aggregateOrgReportRows, appendFulfillmentChildTasksForMasterDeal, applyAllActiveWorkshopTemplatesForArea, applyAssigneesToInsertedCrmTasks, applyCrmLeadRegionFilterToQuery, applyCrmTaskTemplatesToCompanyRegions, applyCustomerIdInFilter, applyCustomersOverviewSearch, applyDefaultWorkshopTemplatesForNewProject, applyLeadOrCustomerSalesFilter, applyProductionTemplateToFulfillmentLead, applyProductionTemplatesOnPipelineEnter, applyStageIdFilterToQuery, applyWorkshopTemplateToProject, artifactNamePrefix, assertCanFlagLead, assertCategoryFitsSource, assertCrmAssigneeUserMatchesLeadCompany, assertCrmEmployeeDeleteAllowed, assertCrmStageAdvanceAllowed, assertDealCrmManualStageChange, assertDealResponsible, assertDivisionAllowedForCompany, assertLeadDocumentOwner, assertLeadReadableByRegionScope, assertRegionBelongsToCompany, assertUserCanAssignCrmRegion, assignProductionCompanyDealResponsibility, attachAssigneesToCrmTasks, attachAssignmentIdsToCrmTasks, attachCrmNextOpenTaskDeadline, attachLeadNewFlagForList, attachLeadReplyParents, attachLeadUserFlagsForList, auth, autoCreateProjectFromWonDeal, autoFlowFns, autoGenCrmTasksForNewLead, buildAssignmentNotificationInsert, buildChecklistLeadDocumentRow, buildCrmDashboardMinimalKpis, buildCrmLeadsRpcFilterParams, buildCustomersOverviewSummary, buildDealTemplateData, buildDefaultDeadlineConfig, buildFirstStageIdByPipeline, buildPipelineStagesMap, buildProcessedCommercialItems, buildQuotedStageOrderByPipeline, buildScanDuplicateGroups, buildWonStageOrderByPipeline, canUserViewDocByAllowlist, chatUpload, chunkArray, classifyDealStageForStaffReport, commentsTableMissing, companyRegionExtraColumnsMissing, companyRegionGeoColumnsMissing, computeCrmDashboardLightStats, computeCrmLiveVersionMs, computeCustomersOverviewSummary, computeIsNewLeadForUser, computeOrgOverviewReportData, computeStaffLeadDealReportData, computeStaffPipelineDetailPayload, countOpenOverdueCrmTasksForLeadIds, createCrmAssignment, createCrmLeadTask, createFulfillmentChildDeal, createNotif, createNotification, createProjectFromLead, crmExecutorFieldsFromTemplateItem, crmLeadCommentAttachmentsColumnMissing, crmLeadCommentReadReceiptsTableMissing, crmLeadRowVisibleToRequestUser, crmListUsesLegacyFilters, crmNoteActivityUpload, crmReportAsOfMs, crmReportCreatedAtFromIso, crmReportCreatedAtToIso, crmReportDayKeyVn, crmRouteErrorText, crmTaskDeadlineModuleKey, crmTaskMeetsCompletionRequirements, crmTaskMeetsRequiredFileTypes, crmTaskRequiresCompletionEvidence, crmTemplateMatchesLeadType, deadlineToDateOnlyIso, defaultCompanyInfo, defaultKpiLedgerMonthStartYmd, deleteCrmLeadTask, deleteMirroredAssignmentFileForTaskAttachment, duplicateLeadIdsFromLiteRows, ecosystemModuleKeyForCrmDeadline, effectivePipelineStageSlaDays, emitCrmBadgeUpdateForProject, emitCrmDashboardChanged, emitCrmTaskChanged, emptyStaffLeadDealAgg, endOfCalendarDayAfterEntered, enforceCommercialDocCompanyOnWrite, enforceQuotaForRequest, ensureDealLeadDocumentsForModuleTransition, ensureDefaultCrmPipelineForCompany, ensureMissingCrmTasksForLead, ensureMissingCrmTasksForPipelineStage, ensureMissingSxTasksForLead, excelUpload, executeLeadMerge, executeZaloDealStageNotify, fetchActivityCustomerIds, fetchAllLeadsForSlaWatchlist, fetchAssignmentForTask, fetchCrmCommentReactionsAggregate, fetchCrmLeadCommentNotifyUserIds, fetchCrmLeadDetailRow, fetchCrmLeadWithPipelineBadges, fetchCrmLeadsByIdsOrdered, fetchCrmLeadsForDashboardBatched, fetchCrmLeadsForOrgReportBatched, fetchCrmLeadsForUserDetailBatched, fetchCrmLeadsLiteForDuplicateScan, fetchCrmLeadsPageViaRpc, fetchCrmPipelineZaloSlice, fetchCrmSurveyEventsChunk, fetchCrmSurveyVisitsForOrgReport, fetchLeadCommentAudienceMembers, fetchLeadCommentAudienceMembersForRead, fetchLeadIdsForCrmRegion, fetchLeadMentionMembers, fetchOrgActivityFeed, fetchPipelineWithStagesById, fetchScopedCrmBundles, fillTemplateDataFromStructure, filterCrmTasksForLeadType, filterUserIdsForCrmLeadScopedNotification, findChecklistItem, followupDismissExpiresAt, fontBold, fontRegular, formatMoney, formatVNDPdf, formatVnPhoneLocal0From84, fs, generateDocPdf, generateFlowTasks, generateStepTasks, getAppSettingValue, getCompanyInfo, getCompanyRegionsList, getCrmLeadListSelect, getCrmLeadRegionConstraint, getCrmLeadTypesList, getCrmLeadsListLegacy, getCrmSourceCategoriesList, getCrmSourcesList, getDefaultCrmAttachmentShare, getDefaultDealZaloTemplateStructure, getDefaultLeadDocumentShareForDeal, getDefaultPipelineIdForCompany, getLeadDocumentFieldsFromCrmTask, getNotifyTargets, getOverdueFollowUps, getPipelineIdForCompanyRegion, getPipelineZaloSlice, getPipelinesList, getProjectCRMSummary, getStagesByPipelineId, getStaleLeads, getZaloNotifySettings, hydrateCrmLeadsByIdsWithStaff, hydrateCrmLeadsRpcPage, hydrateScanDuplicateLeads, insertQuotationRow, invalidateAppSettingKey, invalidatePipelinesAndStages, invalidateRegions, invalidateSources, invalidateTenantUsageCache, invokeCrmLeadsStageCountsRpc, isAdminLike, isAllowedLeadCommentAttachmentUrl, isChotSanXuatCrmTaskTitle, isCrmCompanyAdminUser, isCrmDealAssigneeLocked, isCrmLeadTypeColorMissingError, isCrmModuleAdmin, isCrmPipelinesTableMissingError, isCrmRegionAdminUser, isCrmSystemAdminUser, isDealStageHoanThanhForZalo, isDefaultAssigneeIdsColumnError, isExecutorColumnError, isPlatformAdmin, isPostgresUniqueViolation, isQuotationsSourceExcelColumnMissingError, isSxRelationshipError, isSystemAdmin, isUuidString, isValidDealZaloTemplateStructure, isVcRelationshipError, isVptCompanyCommercialDocViewer, lastNominatimGeocodeAt, leadChatFilesMulter, leadChatJsonOrFiles, listQuotationExcelSheets, loadCrmTaskAttachmentCountMap, loadOrgReportStageMap, loadZaloLinkedLeadIdSet, logDealActivityComment, logDealDeadlineChangeComment, logDealStageChangeComment, logKanbanDeadlineUnifiedHistory, logLeadCommentMentionActivity, logProjectFileActivity, mapCustomerOverviewRow, mapLeadDisplayPhone, mapQuotationItemsToOrderRows, maskCustomerPhoneDisplay, maskZaloAccessTokenPreview, maybeSendZaloOnDealStageEnter, mergeCrmStageDefaultAssigneeIntoUpdates, mergeCustomerIntoTarget, misaService, multer, nextCode, nextTbProjectCode, normalizeCrmActivityAttachments, normalizeCrmLeadCommentAttachments, normalizeCrmStageDefaultAssigneeUserId, normalizeCrmUserRole, normalizeLeadSeenByKeys, normalizeOrgReportSurveyVisitRow, normalizePipelineStageSlaDaysForDb, normalizePipelineStagesList, normalizeRegionIdList, normalizeTemplateChecklistForCrmTask, normalizeTemplateItemAssigneeIds, normalizeTimestamp, normalizeTitleFold, normalizeVnPhoneTo84, notifyDealCommentMentions, notifyDealCommentParticipants, notifyMultiple, notifyMultipleShared, notifyNewCrmAssignmentAssignees, notifyProductionDocumentUploaded, onLeadWon, onOrderConfirmed, onProjectCompleted, onQuotationAccepted, orgReportAttachFirstStageRates, orgReportBumpFirstStageMetrics, orgReportBumpMetrics, orgReportBumpOpenOverdue, orgReportBumpReceptionMetrics, orgReportCancelRatePct, orgReportClosedWonDealCount, orgReportClosedWonValue, orgReportCompareSummary, orgReportConversionRate, orgReportDayKey, orgReportDealCloseValueRatePct, orgReportDealCountsExpected, orgReportDealIsClosedWon, orgReportDealIsCompleted, orgReportDealIsQuotedOrAfter, orgReportDealProbability, orgReportDealSplitBuckets, orgReportExtendedDealMetrics, orgReportFirstStageOnTimeRatePct, orgReportFirstStageOverdueRatePct, orgReportIsReceptionOverdue, orgReportIsSlaOverdue, orgReportKpiPeriodStart, orgReportNumEst, orgReportOverdueRatePct, orgReportOwnerId, orgReportPctDelta, orgReportPreviousPeriod, orgReportQuoteValueCloseRatePct, orgReportQuoteWinRatePct, orgReportReceptionOverdueRatePct, orgReportReceptionSlaMinutes, orgReportStageIsClosed, orgReportStageIsLostOrCancelled, orgReportTotalDealCount, parseChecklist, parseCrmLeadsPageRpc, parseCrmReportDateRange, parseCrmStageCountsNumericMap, parseCrmStageCountsRpc, parseExcelMoneyFromMappedColumn, parseLeadIdUuidList, parseLeadIdsCsvQuery, parseLeadIdsFromBody, parseLeadSeenByRaw, parseQuotationExcelBuffer, parseStageIdsFromQuery, parseUuidArrayJsonb, parseVietnameseMeasure, parseVietnameseMoney, path, persistAssignmentNotification, pgCrmDuplicateLeadIds, pickDealZaloTemplatePayload, pipeOrgOverviewReportPdf, pipeStaffLeadDealSummaryPdf, pipeStaffPipelineDetailPdf, pipelineHasExplicitCompleted, pipelineHasExplicitExpected, pipelineHasExplicitWon, plannerTableMissing, postCrmStageDefaultAssigneeComment, primaryTemplateItemAssigneeId, rcInvalidateTags, reactionsTableMissing, redactCrmTaskNotesForViewer, regionGeocodeInflight, repairCrmDealPipelineDisplay, requireUserCompanyId, requireUserCompanyIdResolved, resolveAssignmentIdForTask, resolveCanonicalCrmLeadId, resolveCommercialDocListCompanyScope, resolveCrmBundleTemplateScope, resolveCrmLeadsDeadlinesMap, resolveCrmLeadsKanbanLite, resolveCrmLeadsMergedQuery, resolveCrmLeadsSkipDeadline, resolveCrmLedgerNetByLeadIdsPayload, resolveCrmReportScope, resolveCrmTaskWriteLeadId, resolveExecutorCompanyId, resolveKanbanStagesForCompany, resolveLeadCommentMentionIds, resolveProductionCompanyForDealStage, resolveProductionHandoverResponsibleUserId, resolveReopenTargetStageId, resolveRpcRegionIdsForCrmList, resolveTenantIdForQuota, resolveZaloDealTemplateId, respondIfCrmPipelinesTableMissing, responseCache, restoreCrmTaskChecklistFromWorkshopTemplate, resyncCrmPipelineTasksForLead, sanitizeIsoDateQueryParam, scheduleRegionGeocoding, scopedAdminCompanyId, scopedCrmCompanyIdForWrite, sendZaloTemplateMessage, setLeadFlag, shallowMergeTemplateData, skipSxWorkQuickComplete, snapshotOrderRowFromQuotation, stripCrmAssigneeFromWonStageUpdates, stripCrmLeadTypeColorFromSelect, stripQuotationsSourceExcelFields, sumCrmKpiLedgerNetByLeadIds, sumCrmKpiLedgerNetByUserForOrgReport, sumCrmKpiLedgerNetByUserIds, sumCrmKpiLedgerNetByUserIdsInDateRange, supabase, syncAllTaskArtifactsToAssignment, syncChecklistItemNotes, syncCrmLeadSxPipelineFromProject, syncQuotationDepositToDealAndProject, syncSxKanbanFromCrmProductionStage, syncTaskAttachmentToAssignment, templateItemAssigneePatch, toCrmTaskChecklist, unifyCrmLeadResponsibleFields, updateCrmLeadTask, updateQuotationRow, upsertZaloNotifySettings, userCanAccessCrmLeadAsParticipant, userCanAccessCrmLeadViaVisibility, userCanAssignAnyCrmRegion, userCanBypassCrmDeleteRestriction, userHasSeenLeadInSeenBy, userIsAdmin, userIsCrmCompanyOrRegionAdmin, userMayAccessQuotationRow, userSeesAllCrmDeals, userSeesAllCrmDealsForScope, userSeesAllCrmLeads, userSeesAllCrmLeadsForScope, uuidQueryOrNull, validateProductionCompanyId) {
// List endpoints: chỉ lấy cột cần cho bảng — tránh select('*') + text dài (notes/terms…)
const QUOTATION_LIST_SELECT =
  'id, code, title, customer_id, customer_name, total, status, created_at, lead_id, company_id, region_id, created_by, approved_by, ' +
  'customer:customers(id, full_name, phone), ' +
  'creator:users!quotations_created_by_fkey(id, full_name), ' +
  'approver:users!quotations_approved_by_fkey(id, full_name), ' +
  'company:companies!quotations_company_id_fkey(id, name, short_name), ' +
  'region:company_regions!quotations_region_id_fkey(id, name, code), ' +
  'lead:crm_leads!quotations_lead_id_fkey(id, code, title, type)';
const QUOTATION_LIST_SELECT_NO_REGION =
  'id, code, title, customer_id, customer_name, total, status, created_at, lead_id, company_id, region_id, created_by, approved_by, ' +
  'customer:customers(id, full_name, phone), ' +
  'creator:users!quotations_created_by_fkey(id, full_name), ' +
  'approver:users!quotations_approved_by_fkey(id, full_name), ' +
  'company:companies!quotations_company_id_fkey(id, name, short_name), ' +
  'lead:crm_leads!quotations_lead_id_fkey(id, code, title, type)';
const ORDER_LIST_SELECT =
  'id, code, title, customer_id, customer_name, total, status, payment_status, created_at, created_by, company_id, ' +
  'customer:customers(id, full_name, phone), creator:users!orders_created_by_fkey(id, full_name)';
const INVOICE_LIST_SELECT =
  'id, code, title, customer_id, customer_name, total, paid_amount, payment_status, created_at, created_by, company_id, misa_status, misa_invoice_no, ' +
  'customer:customers(id, full_name, phone), creator:users!invoices_created_by_fkey(id, full_name)';

/** BG status=converted nhưng không còn ĐH gắn → trả về accepted để hiện lại nút →ĐH */
async function restoreConvertedQuotationsWithoutOrders(quoteIds) {
  const ids = [...new Set((quoteIds || []).filter(Boolean).map(String))];
  if (!ids.length) return new Set();
  const { data: linked, error } = await supabase
    .from('orders')
    .select('quotation_id')
    .in('quotation_id', ids);
  if (error) throw error;
  const stillLinked = new Set((linked || []).map((o) => o.quotation_id).filter(Boolean).map(String));
  const orphaned = ids.filter((id) => !stillLinked.has(id));
  if (orphaned.length) {
    await supabase
      .from('quotations')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .in('id', orphaned)
      .eq('status', 'converted');
  }
  return new Set(orphaned);
}

r.get('/quotations', responseCache({ ttl: 20, scope: 'user', tags: ['crm:list'] }), async (req, res) => {
  try {
    const {
      status, search, limit = 50, lead_id,
      company_id: coQ, region_id: regQ, created_by: createdByQ,
      orphan, // 'only' | 'exclude' | undefined
    } = req.query;
    let q = supabase.from('quotations')
      .select(QUOTATION_LIST_SELECT)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));
    const qScope = resolveCommercialDocListCompanyScope(req, res, coQ);
    if (!qScope.ok) return;
    if (qScope.companyId) q = q.eq('company_id', qScope.companyId);
    if (qScope.restrictToCreator && req.user?.userId) q = q.eq('created_by', req.user.userId);
    if (regQ && /^[0-9a-f-]{36}$/i.test(String(regQ))) q = q.eq('region_id', regQ);
    if (userIsAdmin(req.user?.role) && createdByQ && /^[0-9a-f-]{36}$/i.test(String(createdByQ))) {
      q = q.eq('created_by', createdByQ);
    }
    if (status) q = q.eq('status', status);
    if (orphan === 'only') q = q.is('lead_id', null);
    else if (orphan === 'exclude') q = q.not('lead_id', 'is', null);
    if (search) q = q.or(`code.ilike.%${search}%,title.ilike.%${search}%,customer_name.ilike.%${search}%`);
    if (lead_id && /^[0-9a-f-]{36}$/i.test(String(lead_id))) q = await applyLeadOrCustomerSalesFilter(q, lead_id);
    let { data, error } = await q;
    // DB cũ chưa có FK quotations_region_id_fkey (migration 160 chưa chạy) → bỏ embed region rồi thử lại
    if (error && /quotations_region_id_fkey|company_regions/i.test(String(error.message || ''))) {
      let q2 = supabase.from('quotations')
        .select(QUOTATION_LIST_SELECT_NO_REGION)
        .order('created_at', { ascending: false })
        .limit(parseInt(limit));
      if (qScope.companyId) q2 = q2.eq('company_id', qScope.companyId);
      if (qScope.restrictToCreator && req.user?.userId) q2 = q2.eq('created_by', req.user.userId);
      if (userIsAdmin(req.user?.role) && createdByQ && /^[0-9a-f-]{36}$/i.test(String(createdByQ))) {
        q2 = q2.eq('created_by', createdByQ);
      }
      if (regQ && /^[0-9a-f-]{36}$/i.test(String(regQ))) q2 = q2.eq('region_id', regQ);
      if (status) q2 = q2.eq('status', status);
      if (orphan === 'only') q2 = q2.is('lead_id', null);
      else if (orphan === 'exclude') q2 = q2.not('lead_id', 'is', null);
      if (search) q2 = q2.or(`code.ilike.%${search}%,title.ilike.%${search}%,customer_name.ilike.%${search}%`);
      if (lead_id && /^[0-9a-f-]{36}$/i.test(String(lead_id))) q2 = await applyLeadOrCustomerSalesFilter(q2, lead_id);
      const r2 = await q2;
      data = r2.data; error = r2.error;
    }
    if (error) throw error;
    // BG đã chuyển ĐH nhưng ĐH bị xóa → khôi phục status để hiện nút →ĐH
    const convertedIds = (data || []).filter((r) => r.status === 'converted').map((r) => r.id);
    let restored = new Set();
    try {
      restored = await restoreConvertedQuotationsWithoutOrders(convertedIds);
    } catch (re) {
      console.warn('[QUOTATIONS LIST] restore converted without orders:', re.message);
    }
    const out = (data || []).map((row) => ({
      ...row,
      status: restored.has(String(row.id)) ? 'accepted' : row.status,
      is_orphan: !row.lead_id,
    }));
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/quotations/:id', async (req, res) => {
  try {
    const sel =
      '*, customer:customers(id, full_name, phone, email, address, company, tax_code), ' +
      'creator:users!quotations_created_by_fkey(id, full_name, email), ' +
      'approver:users!quotations_approved_by_fkey(id, full_name), ' +
      'company:companies!quotations_company_id_fkey(id, name, short_name), ' +
      'region:company_regions!quotations_region_id_fkey(id, name, code), ' +
      'lead:crm_leads!quotations_lead_id_fkey(id, code, title, type, assigned_to, ' +
        'lead_assignee:users!crm_leads_assigned_to_fkey(id, full_name))';
    let { data: quote, error: qe } = await supabase.from('quotations').select(sel).eq('id', req.params.id).single();
    if (qe && /quotations_region_id_fkey|company_regions/i.test(String(qe.message || ''))) {
      const fb = await supabase
        .from('quotations')
        .select(
          '*, customer:customers(id, full_name, phone, email, address, company, tax_code), ' +
          'creator:users!quotations_created_by_fkey(id, full_name, email), ' +
          'approver:users!quotations_approved_by_fkey(id, full_name), ' +
          'company:companies!quotations_company_id_fkey(id, name, short_name), ' +
          'lead:crm_leads!quotations_lead_id_fkey(id, code, title, type, assigned_to)',
        )
        .eq('id', req.params.id)
        .single();
      quote = fb.data; qe = fb.error;
    }
    if (!quote) {
      const benign = qe && (qe.code === 'PGRST116' || /JSON object requested/i.test(String(qe.message || '')));
      if (qe && !benign) return res.status(500).json({ error: qe.message || 'Lỗi tải báo giá' });
      return res.status(404).json({ error: 'Không tìm thấy báo giá' });
    }
    if (!userMayAccessQuotationRow(req, quote)) {
      return res.status(403).json({ error: 'Không có quyền xem báo giá này' });
    }
    if (quote.status === 'converted') {
      try {
        const restored = await restoreConvertedQuotationsWithoutOrders([quote.id]);
        if (restored.has(String(quote.id))) quote = { ...quote, status: 'accepted' };
      } catch (re) {
        console.warn('[QUOTATION DETAIL] restore converted without orders:', re.message);
      }
    }
    const { data: items } = await supabase.from('quotation_items')
      .select('*, product:products(id, name, code)')
      .eq('quotation_id', req.params.id).order('item_order');
    res.json({ ...quote, items: items || [], is_orphan: !quote?.lead_id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/quotations/:id/history', async (req, res) => {
  try {
    const { data: qMeta } = await supabase
      .from('quotations')
      .select('created_by, company_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!qMeta) return res.status(404).json({ error: 'Không tìm thấy báo giá' });
    if (!userMayAccessQuotationRow(req, qMeta)) {
      return res.status(403).json({ error: 'Không có quyền xem lịch sử báo giá này' });
    }
    const { data: rows, error } = await supabase
      .from('quotation_edit_history')
      .select('id, action, summary, detail, created_at, created_by')
      .eq('quotation_id', req.params.id)
      .order('created_at', { ascending: false })
      .limit(80);
    if (error) throw error;
    const userIds = [...new Set((rows || []).map((r) => r.created_by).filter(Boolean))];
    let userMap = {};
    if (userIds.length) {
      const { data: users } = await supabase.from('users').select('id, full_name').in('id', userIds);
      (users || []).forEach((u) => { userMap[u.id] = u.full_name; });
    }
    const history = (rows || []).map((r) => ({ ...r, editor_name: userMap[r.created_by] || null }));
    res.json({ history });
  } catch (e) {
    if (String(e.message || '').includes('does not exist') || e.code === '42P01'
      || (String(e.message || '').includes('relation') && String(e.message || '').includes('quotation_edit_history'))) {
      return res.json({ history: [] });
    }
    res.status(500).json({ error: e.message });
  }
});

r.post('/quotations', async (req, res) => {
  try {
    const { items, quotation_source, ...quoteData } = req.body;
    const code = await nextCode('BG');

    // Sanitize: empty strings → null for UUID fields
    const uuidFields = ['customer_id', 'lead_id', 'project_id', 'approved_by', 'company_id', 'region_id', 'fulfillment_lead_id', 'source_task_id'];
    uuidFields.forEach(f => { if (quoteData[f] === '' || quoteData[f] === undefined) quoteData[f] = null; });
    // Sanitize: empty strings → null for date fields
    const dateFields = ['valid_until', 'issue_date', 'sent_at', 'accepted_at', 'closed_at', 'signed_date', 'delivery_date'];
    dateFields.forEach(f => { if (quoteData[f] === '') quoteData[f] = null; });
    const quoteMoneyOrNull = (v) => {
      if (v === '' || v === undefined || v === null) return null;
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      const onlyDigits = String(v).replace(/\s/g, '').replace(/đ/gi, '').replace(/[^\d]/g, '');
      if (!onlyDigits) return null;
      const n = parseInt(onlyDigits, 10);
      return Number.isFinite(n) ? n : null;
    };
    if ('deposit_amount' in quoteData) quoteData.deposit_amount = quoteMoneyOrNull(quoteData.deposit_amount);
    if ('remaining_amount' in quoteData) quoteData.remaining_amount = quoteMoneyOrNull(quoteData.remaining_amount);
    if ('deposit_received' in quoteData) {
      const dr = quoteData.deposit_received;
      if (dr === '' || dr === undefined || dr === null) quoteData.deposit_received = null;
      else if (dr === true || dr === 'true') quoteData.deposit_received = true;
      else if (dr === false || dr === 'false') quoteData.deposit_received = false;
      else quoteData.deposit_received = null;
    }
    if (quoteData.deposit_label === '') quoteData.deposit_label = null;
    if (quoteData.remaining_note === '') quoteData.remaining_note = null;
    if ('deposit_installments' in quoteData) {
      const { aggregateDepositFromInstallments } = require('../../../helpers/depositInstallments');
      const agg = aggregateDepositFromInstallments(quoteData.deposit_installments);
      quoteData.deposit_installments = agg.deposit_installments;
      quoteData.deposit_amount = agg.deposit_amount;
      quoteData.deposit_received = agg.deposit_received;
      quoteData.deposit_label = agg.deposit_label;
    }
    if (quoteData.source_excel_file_url === '') quoteData.source_excel_file_url = null;
    if (quoteData.source_excel_file_name === '') quoteData.source_excel_file_name = null;
    if (quoteData.sale_discount_type === '') quoteData.sale_discount_type = 'amount';
    if (quoteData.sale_discount_value === '') quoteData.sale_discount_value = 0;

    // ── Scope: kế thừa company_id + region_id từ deal (cho phép override; sẽ cảnh báo ở UI) ──
    let commercialCo = quoteData.company_id || null;
    let leadRegionId = null;
    if (quoteData.lead_id) {
      const { data: lrow } = await supabase
        .from('crm_leads')
        .select('company_id, region_id')
        .eq('id', quoteData.lead_id)
        .maybeSingle();
      if (lrow?.company_id) commercialCo = lrow.company_id;
      if (lrow?.region_id) leadRegionId = lrow.region_id;
    }
    const qCoWrite = await enforceCommercialDocCompanyOnWrite(req, res, commercialCo, 'Báo giá', {
      leadId: quoteData.lead_id || null,
    });
    if (!qCoWrite.ok) return;
    commercialCo = qCoWrite.companyId;
    quoteData.company_id = commercialCo;

    // region_id: nếu client gửi → kiểm tra cùng company; nếu rỗng → kế thừa từ lead.
    if (quoteData.region_id) {
      const { data: rrow } = await supabase
        .from('company_regions')
        .select('id, company_id, is_active')
        .eq('id', quoteData.region_id)
        .maybeSingle();
      if (!rrow) {
        return res.status(400).json({ error: 'Khu vực không tồn tại' });
      }
      if (commercialCo && String(rrow.company_id) !== String(commercialCo)) {
        return res.status(400).json({ error: 'Khu vực phải cùng công ty với báo giá' });
      }
      if (rrow.is_active === false) {
        return res.status(400).json({ error: 'Khu vực đã bị vô hiệu' });
      }
    } else {
      quoteData.region_id = leadRegionId;
    }
    
    // Calc totals with per-item VAT + spec_factor (hệ số quy cách)
    // ── Excel fidelity: nếu item.lock_amount && imported_amount → giữ NGUYÊN số tiền Excel ──
    const processedItems = buildProcessedCommercialItems(items);
    const subtotal = processedItems.reduce((s, i) => s + (i.amount || 0), 0);
    const discountAmt = quoteData.discount_type === 'percent' 
      ? subtotal * (quoteData.discount_value || 0) / 100 
      : (quoteData.discount_value || 0);
    const afterRebate = subtotal - discountAmt;
    const saleDiscountAmt = quoteData.sale_discount_type === 'percent'
      ? afterRebate * (quoteData.sale_discount_value || 0) / 100
      : (quoteData.sale_discount_value || 0);
    const afterAllDiscounts = Math.max(0, afterRebate - saleDiscountAmt);
    const taxAmt = processedItems.reduce((s, i) => s + (i.vat_amount || 0), 0);
    
    const { data: quote, error } = await insertQuotationRow({
      ...quoteData, code, subtotal, discount_amount: discountAmt, sale_discount_amount: saleDiscountAmt,
      tax_amount: taxAmt, total: afterAllDiscounts + taxAmt,
      created_by: req.user.userId,
    });
    if (error) throw error;

    // Insert items with vat_rate and vat_amount
    if (processedItems.length) {
      const itemRows = processedItems.map((item, i) => ({
        ...item, quotation_id: quote.id, item_order: i,
      }));
      await supabase.from('quotation_items').insert(itemRows);
    }

    try {
      let summary = 'Tạo báo giá';
      const qs = quotation_source || {};
      if (qs.from_excel) {
        summary = qs.excel_file_name ? `Tạo báo giá từ Excel (${qs.excel_file_name})` : 'Tạo báo giá từ Excel';
        if (qs.excel_review_confirmed) summary += ' — đã xác nhận đã kiểm tra số liệu';
      }
      await supabase.from('quotation_edit_history').insert({
        quotation_id: quote.id,
        action: 'created',
        summary,
        detail: {
          total: quote.total,
          item_count: processedItems.length,
          source: qs.from_excel ? 'excel' : 'manual',
        },
        created_by: req.user.userId,
      });
    } catch (he) {
      if (!String(he.message || '').includes('does not exist')) console.warn('[quotation_edit_history]', he.message);
    }

    // ═══ ĐỒNG BỘ SẢN PHẨM: chỉ liên kết product_id theo tên, KHÔNG cập nhật giá / không tạo mới ═══
    const syncedProducts = [];
    try {
      for (const item of processedItems) {
        if (!item.name || item.name.trim().length < 3) continue;
        // Tìm sản phẩm theo tên gần đúng (case-insensitive)
        const nameSearch = item.name.trim();
        const { data: existing } = await supabase.from('products')
          .select('id, name')
          .ilike('name', `%${nameSearch}%`)
          .limit(1);
        if (existing?.length) {
          item.product_id = existing[0].id; // Gán product_id vào item
          syncedProducts.push({ name: item.name, product_id: existing[0].id });
        }
        // Không tìm thấy → giữ nguyên, không tạo mới
      }
      console.log('[QUOTATION] Product link:', syncedProducts.length, 'items linked');
    } catch (e) { console.warn('[QUOTATION] Product link error:', e.message); }

    // ═══ AUTO-LINK: Tìm deal qua customer nếu chưa có lead_id ═══
    let linkedLeadId = quote.lead_id;
    if (!linkedLeadId && (quote.customer_id || quote.customer_name)) {
      try {
        // crm_leads không có cột `status` — deal "đang mở" = chưa đóng (actual_close_date IS NULL).
        let dealQuery = supabase.from('crm_leads')
          .select('id, customer_id')
          .eq('type', 'deal')
          .is('actual_close_date', null)
          .order('created_at', { ascending: false })
          .limit(1);

        if (quote.customer_id) {
          dealQuery = dealQuery.eq('customer_id', quote.customer_id);
        } else if (quote.customer_name) {
          // Tìm customer_id qua tên
          const { data: cust } = await supabase.from('customers')
            .select('id')
            .ilike('full_name', `%${quote.customer_name}%`)
            .limit(1).single();
          if (cust) {
            dealQuery = dealQuery.eq('customer_id', cust.id);
          }
        }

        const { data: deal } = await dealQuery.single();
        if (deal) {
          linkedLeadId = deal.id;
          // Cập nhật lead_id + customer_id cho báo giá
          await supabase.from('quotations').update({
            lead_id: deal.id,
            customer_id: deal.customer_id || quote.customer_id,
          }).eq('id', quote.id);
          quote.lead_id = deal.id;
          console.log(`[QUOTATION] Auto-linked BG ${quote.code} → Deal ${deal.id}`);
        }
      } catch (linkErr) {
        console.warn('[QUOTATION] Auto-link deal error:', linkErr.message);
      }
    }

    // ═══ AUTO-COMPLETE: Hoàn thành task "Lập báo giá" trong deal ═══
    if (linkedLeadId) {
      try {
        // Tìm task chưa hoàn thành ở stage quotation, ưu tiên "Lập báo giá"
        const { data: tasks } = await supabase.from('crm_tasks')
          .select('id, title, stage_slug, status')
          .eq('lead_id', linkedLeadId)
          .in('stage_slug', ['quotation', 'deal_quote_contract'])
          .neq('status', 'completed')
          .order('order_index')
          .limit(5);

        // Tìm task phù hợp nhất: "Lập báo giá" > bất kỳ task quotation nào
        const quotationTask = (tasks || []).find(t =>
          t.title.includes('Lập báo giá') || t.title.includes('lập báo giá')
        ) || (tasks || [])[0];

        if (quotationTask) {
          // Mark completed
          await supabase.from('crm_tasks').update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            notes: `✅ Đã tạo báo giá ${quote.code} (${formatMoney(quote.total)})\n📎 Xem: /crm/quotations/${quote.id}`,
            updated_at: new Date().toISOString(),
          }).eq('id', quotationTask.id);

          // Thêm attachment vào task (link tới báo giá)
          const { data: att } = await supabase.from('crm_task_attachments').insert({
            task_id: quotationTask.id,
            lead_id: linkedLeadId,
            name: `📄 ${quote.code} - ${quote.title || 'Báo giá'}`,
            doc_type: 'quotation',
            notes: `Báo giá ${quote.code}: ${formatMoney(quote.total)}\nKH: ${quote.customer_name || ''}\nLink: /crm/quotations/${quote.id}`,
            created_by: req.user.userId,
          }).select().single();

          // Sync → lead_documents
          if (att) {
            const { data: lead } = await supabase.from('crm_leads')
              .select('project_id').eq('id', linkedLeadId).single();
            await supabase.from('lead_documents').insert({
              lead_id: linkedLeadId,
              project_id: lead?.project_id || null,
              name: `[${quotationTask.title}] 📄 ${quote.code}`,
              doc_type: 'quotation',
              notes: att.notes,
              created_by: req.user.userId,
              source_attachment_id: att.id,
              ...getLeadDocumentFieldsFromCrmTask(quotationTask, { linkToProject: !!lead?.project_id }),
            });
          }

          quote.auto_task = { taskId: quotationTask.id, taskTitle: quotationTask.title, completed: true };
          console.log(`[QUOTATION] Auto-completed task "${quotationTask.title}" for deal ${linkedLeadId}`);
        }
      } catch (taskErr) {
        console.warn('[QUOTATION] Auto-complete task error:', taskErr.message);
      }
    }

    // 🔔 NOTIFICATION: Báo giá mới
    try {
      const t = await getNotifyTargets(quote.lead_id);
      const allIds = [...new Set([...t.ownerIds, ...t.adminIds])];
      if (allIds.length) await notifyMultiple(req, allIds, 'quotation_created',
        '📄 Báo giá mới',
        `Báo giá ${quote.code} — KH: ${quote.customer_name || 'N/A'} — ${formatMoney(quote.total)}`,
        'quotation', quote.id);
    } catch (ne) { console.warn('[NOTIFY] quotation_created:', ne.message); }

    // ═══ SYNC: Update customer's last quotation amount ═══
    if (quote.customer_id) {
      try {
        const { data: allQuotes } = await supabase.from('quotations')
          .select('total')
          .eq('customer_id', quote.customer_id)
          .in('status', ['draft', 'sent', 'accepted', 'converted']);
        const totalQuotationValue = (allQuotes || []).reduce((s, q) => s + (q.total || 0), 0);
        await supabase.from('customers').update({
          last_quotation_amount: quote.total,
          last_quotation_at: new Date().toISOString(),
          total_quotation_value: totalQuotationValue,
          updated_at: new Date().toISOString(),
        }).eq('id', quote.customer_id);
        quote.customer_synced = true;
      } catch (syncErr) {
        console.warn('[QUOTATION] Sync customer error:', syncErr.message);
      }
    }

    // Sync deal estimated_value
    if (linkedLeadId && quote.total > 0) {
      try {
        await supabase.from('crm_leads').update({
          estimated_value: quote.total,
          updated_at: new Date().toISOString(),
        }).eq('id', linkedLeadId);
        quote.deal_value_synced = true;
      } catch (syncErr) {
        console.warn('[QUOTATION] Sync deal value error:', syncErr.message);
      }
    }

    // Sync tiền cọc + trạng thái cọc → deal + dự án SX
    if (linkedLeadId) {
      try {
        const depSync = await syncQuotationDepositToDealAndProject(quote, linkedLeadId);
        if (depSync.synced) quote.deposit_synced = true;
      } catch (syncErr) {
        console.warn('[QUOTATION] Sync deposit error:', syncErr.message);
      }
    }

    res.status(201).json({ ...quote, synced_products: syncedProducts });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/quotations/:id', async (req, res) => {
  try {
    const { data: qAuth } = await supabase
      .from('quotations')
      .select('created_by, company_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!qAuth) return res.status(404).json({ error: 'Không tìm thấy báo giá' });
    if (!userMayAccessQuotationRow(req, qAuth)) {
      return res.status(403).json({ error: 'Không có quyền sửa báo giá này' });
    }

    const { items: itemsBody, quotation_source: _qs, ...quoteDataFromBody } = req.body;

    const { data: prevQuote } = await supabase.from('quotations')
      .select('title, total, status, customer_name, discount_value, discount_type, code')
      .eq('id', req.params.id).single();

    let quoteData = quoteDataFromBody;
    if (itemsBody === undefined) {
      const { data: fullQ } = await supabase.from('quotations').select('*').eq('id', req.params.id).single();
      if (fullQ) {
        quoteData = { ...fullQ, ...quoteDataFromBody };
        delete quoteData.id;
        delete quoteData.code;
        delete quoteData.created_at;
        delete quoteData.created_by;
      }
    }

    // Sanitize: empty strings → null for UUID fields
    const uuidFields = ['customer_id', 'lead_id', 'project_id', 'approved_by', 'company_id', 'region_id', 'fulfillment_lead_id', 'source_task_id'];
    uuidFields.forEach(f => { if (quoteData[f] === '' || quoteData[f] === undefined) quoteData[f] = null; });
    // Sanitize: empty strings → null for date fields
    ['valid_until', 'issue_date', 'sent_at', 'accepted_at', 'closed_at', 'signed_date', 'delivery_date'].forEach(f => { if (quoteData[f] === '') quoteData[f] = null; });
    let commercialCoPut = quoteData.company_id || null;
    let leadRegionIdPut = null;
    if (quoteData.lead_id) {
      const { data: lrowPut } = await supabase
        .from('crm_leads')
        .select('company_id, region_id')
        .eq('id', quoteData.lead_id)
        .maybeSingle();
      if (lrowPut?.company_id) commercialCoPut = lrowPut.company_id;
      if (lrowPut?.region_id) leadRegionIdPut = lrowPut.region_id;
    }
    const qCoPut = await enforceCommercialDocCompanyOnWrite(req, res, commercialCoPut, 'Báo giá', {
      leadId: quoteData.lead_id || null,
    });
    if (!qCoPut.ok) return;
    commercialCoPut = qCoPut.companyId;
    quoteData.company_id = commercialCoPut;

    // region_id (PUT): nếu client gửi region_id rỗng & lead có region → kế thừa; nếu có → kiểm tra cùng company.
    if (quoteData.region_id) {
      const { data: rrowPut } = await supabase
        .from('company_regions')
        .select('id, company_id, is_active')
        .eq('id', quoteData.region_id)
        .maybeSingle();
      if (!rrowPut) return res.status(400).json({ error: 'Khu vực không tồn tại' });
      if (commercialCoPut && String(rrowPut.company_id) !== String(commercialCoPut)) {
        return res.status(400).json({ error: 'Khu vực phải cùng công ty với báo giá' });
      }
    } else if (leadRegionIdPut) {
      quoteData.region_id = leadRegionIdPut;
    }
    const quoteMoneyOrNullPut = (v) => {
      if (v === '' || v === undefined || v === null) return null;
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      const onlyDigits = String(v).replace(/\s/g, '').replace(/đ/gi, '').replace(/[^\d]/g, '');
      if (!onlyDigits) return null;
      const n = parseInt(onlyDigits, 10);
      return Number.isFinite(n) ? n : null;
    };
    if ('deposit_amount' in quoteData) quoteData.deposit_amount = quoteMoneyOrNullPut(quoteData.deposit_amount);
    if ('remaining_amount' in quoteData) quoteData.remaining_amount = quoteMoneyOrNullPut(quoteData.remaining_amount);
    if ('deposit_received' in quoteData) {
      const dr = quoteData.deposit_received;
      if (dr === '' || dr === undefined || dr === null) quoteData.deposit_received = null;
      else if (dr === true || dr === 'true') quoteData.deposit_received = true;
      else if (dr === false || dr === 'false') quoteData.deposit_received = false;
      else quoteData.deposit_received = null;
    }
    if (quoteData.deposit_label === '') quoteData.deposit_label = null;
    if (quoteData.remaining_note === '') quoteData.remaining_note = null;
    if ('deposit_installments' in quoteData) {
      const { aggregateDepositFromInstallments } = require('../../../helpers/depositInstallments');
      const agg = aggregateDepositFromInstallments(quoteData.deposit_installments);
      quoteData.deposit_installments = agg.deposit_installments;
      quoteData.deposit_amount = agg.deposit_amount;
      quoteData.deposit_received = agg.deposit_received;
      quoteData.deposit_label = agg.deposit_label;
    }
    if (quoteData.source_excel_file_url === '') quoteData.source_excel_file_url = null;
    if (quoteData.source_excel_file_name === '') quoteData.source_excel_file_name = null;

    let rawItems = itemsBody;
    if (rawItems === undefined) {
      const { data: existingItems } = await supabase.from('quotation_items').select('*').eq('quotation_id', req.params.id).order('item_order');
      rawItems = existingItems || [];
    }
    
    // Calc totals with per-item VAT + spec_factor (hệ số quy cách)
    // ── Excel fidelity: nếu item.lock_amount && imported_amount → giữ NGUYÊN số tiền Excel ──
    const processedItems = buildProcessedCommercialItems(rawItems);
    const subtotal = processedItems.reduce((s, i) => s + (i.amount || 0), 0);
    const discountAmt = quoteData.discount_type === 'percent' 
      ? subtotal * (quoteData.discount_value || 0) / 100 
      : (quoteData.discount_value || 0);
    const afterRebate = subtotal - discountAmt;
    const saleDiscountAmt = quoteData.sale_discount_type === 'percent'
      ? afterRebate * (quoteData.sale_discount_value || 0) / 100
      : (quoteData.sale_discount_value || 0);
    const afterAllDiscounts = Math.max(0, afterRebate - saleDiscountAmt);
    const taxAmt = processedItems.reduce((s, i) => s + (i.vat_amount || 0), 0);

    const { data, error } = await updateQuotationRow(req.params.id, {
      ...quoteData, subtotal, discount_amount: discountAmt, sale_discount_amount: saleDiscountAmt,
      tax_amount: taxAmt, total: afterAllDiscounts + taxAmt,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;

    // Replace items — KHÔNG gửi id: null/undefined (PostgREST sẽ insert NULL → mất hết dòng sau khi DELETE)
    const { data: prevItems } = await supabase
      .from('quotation_items')
      .select('*')
      .eq('quotation_id', req.params.id)
      .order('item_order');
    const { error: delItemsErr } = await supabase.from('quotation_items').delete().eq('quotation_id', req.params.id);
    if (delItemsErr) throw delItemsErr;
    if (processedItems.length) {
      const itemRows = processedItems.map((item, i) => {
        const row = { ...item, quotation_id: req.params.id, item_order: i };
        delete row.id;
        return row;
      });
      const { error: insItemsErr } = await supabase.from('quotation_items').insert(itemRows);
      if (insItemsErr) {
        // Khôi phục dòng cũ nếu insert fail (tránh mất chi tiết hàng hóa)
        if (prevItems?.length) {
          const restoreRows = prevItems.map(({ id: _id, ...rest }, i) => ({
            ...rest,
            quotation_id: req.params.id,
            item_order: rest.item_order ?? i,
          }));
          const { error: restoreErr } = await supabase.from('quotation_items').insert(restoreRows);
          if (restoreErr) console.error('[QUOTE PUT] restore items failed:', restoreErr.message);
        }
        throw insItemsErr;
      }
    }

    try {
      const parts = [];
      const pt = prevQuote?.total != null ? Number(prevQuote.total) : null;
      const nt = data?.total != null ? Number(data.total) : null;
      if (prevQuote && pt !== nt && pt != null && nt != null) {
        parts.push(`Tổng ${formatMoney(prevQuote.total)} → ${formatMoney(data.total)}`);
      }
      if (prevQuote && prevQuote.title !== data.title) parts.push('Đổi tiêu đề');
      if (prevQuote && prevQuote.status !== data.status) {
        parts.push(`Trạng thái ${prevQuote.status || '—'} → ${data.status || '—'}`);
      }
      const summary = parts.length ? `Cập nhật: ${parts.join('; ')}` : 'Cập nhật báo giá';
      await supabase.from('quotation_edit_history').insert({
        quotation_id: req.params.id,
        action: 'updated',
        summary,
        detail: {
          before: prevQuote ? { title: prevQuote.title, total: prevQuote.total, status: prevQuote.status } : null,
          after: { title: data.title, total: data.total, status: data.status },
          item_count: processedItems.length,
        },
        created_by: req.user.userId,
      });
    } catch (he) {
      if (!String(he.message || '').includes('does not exist')) console.warn('[quotation_edit_history]', he.message);
    }

    // AUTO-FLOW: BG chấp nhận → auto tạo ĐH + Project
    let autoResult = null;
    if (quoteData.status === 'accepted') {
      try { autoResult = await onQuotationAccepted(req.params.id, req.user.userId); } catch (e) { console.error('Auto-flow BG→ĐH error:', e.message); }
    }

    // 🔔 NOTIFICATION: Cập nhật báo giá
    try {
      const t = await getNotifyTargets(data.lead_id);
      if (t.ownerIds.length) await notifyMultiple(req, t.ownerIds, 'quotation_updated',
        '📝 Cập nhật báo giá',
        `Báo giá ${data.code} đã được cập nhật${quoteData.status === 'accepted' ? ' → Chấp nhận ✅' : ''}`,
        'quotation', data.id);
    } catch (ne) { console.warn('[NOTIFY] quotation_updated:', ne.message); }

    // Sync tiền cọc + trạng thái cọc → deal + dự án SX
    if (data?.lead_id) {
      try {
        await syncQuotationDepositToDealAndProject(data, data.lead_id);
      } catch (syncErr) {
        console.warn('[QUOTATION] Sync deposit on update error:', syncErr.message);
      }
    }

    res.json({ ...data, auto: autoResult });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/quotations/:id/convert-to-order', async (req, res) => {
  try {
    const { data: quote } = await supabase.from('quotations').select('*').eq('id', req.params.id).single();
    if (!quote) return res.status(404).json({ error: 'Không tìm thấy báo giá' });
    if (!userMayAccessQuotationRow(req, quote)) {
      return res.status(403).json({ error: 'Không có quyền chuyển báo giá này sang đơn hàng' });
    }

    const { data: qItems } = await supabase.from('quotation_items').select('*').eq('quotation_id', req.params.id).order('item_order');

    const orderCode = await nextCode('DH');
    const { data: order, error } = await supabase.from('orders').insert({
      code: orderCode,
      ...snapshotOrderRowFromQuotation(quote),
      created_by: req.user.userId,
    }).select('*').single();
    if (error) throw error;

    if (qItems?.length) {
      await supabase.from('order_items').insert(mapQuotationItemsToOrderRows(qItems, order.id));
    }

    // Update quotation status
    await supabase.from('quotations').update({ status: 'converted', updated_at: new Date().toISOString() }).eq('id', req.params.id);

    // 🔔 NOTIFICATION: BG → ĐH
    try {
      const t = await getNotifyTargets(order.lead_id);
      const allIds = [...new Set([...t.ownerIds, ...t.adminIds])];
      if (allIds.length) await notifyMultiple(req, allIds, 'order_created',
        '🛒 Đơn hàng mới từ báo giá',
        `Đơn hàng ${orderCode} được tạo từ BG ${quote.code} — ${formatMoney(order.total)}`,
        'order', order.id);
    } catch (ne) { console.warn('[NOTIFY] bg_to_dh:', ne.message); }

    res.status(201).json(order);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.delete('/quotations/:id', async (req, res) => {
  try {
    const { data: delScope } = await supabase
      .from('quotations')
      .select('created_by, company_id, code, lead_id, customer_name')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!delScope) return res.status(404).json({ error: 'Không tìm thấy báo giá' });
    if (!userMayAccessQuotationRow(req, delScope)) {
      return res.status(403).json({ error: 'Không có quyền xóa báo giá này' });
    }
    const delQ = { code: delScope.code, lead_id: delScope.lead_id, customer_name: delScope.customer_name };

    // Unlink orders referencing this quotation
    await supabase.from('orders').update({ quotation_id: null }).eq('quotation_id', req.params.id);
    // Delete items
    await supabase.from('quotation_items').delete().eq('quotation_id', req.params.id);
    // Delete quotation
    const { error } = await supabase.from('quotations').delete().eq('id', req.params.id);
    if (error) throw error;

    // 🔔 NOTIFICATION: Xóa báo giá
    try {
      const t = await getNotifyTargets(delQ?.lead_id);
      if (t.adminIds.length) await notifyMultiple(req, t.adminIds, 'item_deleted',
        '🗑️ Báo giá đã xóa',
        `Báo giá ${delQ?.code || ''} — KH: ${delQ?.customer_name || 'N/A'} đã bị xóa`,
        'quotation', req.params.id);
    } catch (ne) {}

    res.json({ message: 'Đã xóa báo giá' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/orders', responseCache({ ttl: 20, scope: 'user', tags: ['crm:list'] }), async (req, res) => {
  try {
    const { status, search, limit = 50, lead_id, company_id: coQ } = req.query;
    let q = supabase.from('orders')
      .select(ORDER_LIST_SELECT)
      .order('created_at', { ascending: false }).limit(parseInt(limit));
    const oScope = resolveCommercialDocListCompanyScope(req, res, coQ);
    if (!oScope.ok) return;
    if (oScope.companyId) q = q.eq('company_id', oScope.companyId);
    if (status) q = q.eq('status', status);
    if (search) q = q.or(`code.ilike.%${search}%,title.ilike.%${search}%,customer_name.ilike.%${search}%`);
    if (lead_id && /^[0-9a-f-]{36}$/i.test(String(lead_id))) q = await applyLeadOrCustomerSalesFilter(q, lead_id);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/orders/:id', async (req, res) => {
  try {
    const { data: order } = await supabase.from('orders')
      .select('*, fulfillment_lead_id, lead_id, customer:customers(id, full_name, phone, email, address, company, tax_code)')
      .eq('id', req.params.id).single();
    let { data: items } = await supabase.from('order_items')
      .select('*, product:products(id, name, code)')
      .eq('order_id', req.params.id).order('item_order');
    items = items || [];
    let source_quotation = null;
    if (order?.quotation_id) {
      const { data: q } = await supabase.from('quotations')
        .select('id, code, notes, valid_until, delivery_terms, payment_terms, deposit_amount, deposit_received, deposit_label, deposit_installments, remaining_amount, remaining_note, description')
        .eq('id', order.quotation_id).maybeSingle();
      source_quotation = q || null;
      // Đơn hàng không có dòng (lỗi copy trước đây / DB trống) — hiển thị dòng từ báo giá gốc
      if (!items.length) {
        const { data: qItems } = await supabase.from('quotation_items')
          .select('*, product:products(id, name, code)')
          .eq('quotation_id', order.quotation_id).order('item_order');
        if (qItems?.length) items = qItems;
      }
    }
    res.json({ ...order, items, source_quotation });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/orders/:id', async (req, res) => {
  try {
    const { items: itemsBody, ...updatesFromBody } = req.body;
    const updates = { ...updatesFromBody, updated_at: new Date().toISOString() };
    // Sanitize: empty strings → null for UUID fields
    ['customer_id', 'lead_id', 'quotation_id', 'project_id'].forEach(f => {
      if (updates[f] === '') updates[f] = null;
    });
    if (updates.status === 'confirmed' && !updates.confirmed_at) updates.confirmed_at = new Date().toISOString();
    if (updates.status === 'shipped' && !updates.shipped_at) updates.shipped_at = new Date().toISOString();
    if (updates.status === 'delivered' && !updates.delivered_at) updates.delivered_at = new Date().toISOString();
    if (updates.status === 'cancelled' && !updates.cancelled_at) updates.cancelled_at = new Date().toISOString();

    // ── Re-tính totals + lưu lại order_items khi có gửi items (form Sửa đơn hàng) ──
    // Cùng logic Excel fidelity với /quotations: lock_amount/imported_amount giữ nguyên số tiền gốc.
    if (Array.isArray(itemsBody)) {
      const processedItems = buildProcessedCommercialItems(itemsBody);
      const subtotal = processedItems.reduce((s, i) => s + (i.amount || 0), 0);
      const discountAmt = updates.discount_type === 'percent' ? subtotal * (updates.discount_value || 0) / 100 : (updates.discount_value || 0);
      const afterDiscount = subtotal - discountAmt;
      const taxAmt = processedItems.reduce((s, i) => s + (i.vat_amount || 0), 0);
      updates.subtotal = subtotal;
      updates.discount_amount = discountAmt;
      updates.tax_amount = taxAmt;
      updates.total = afterDiscount + taxAmt;

      await supabase.from('order_items').delete().eq('order_id', req.params.id);
      if (processedItems.length) {
        await supabase.from('order_items').insert(processedItems.map((item, i) => ({
          ...item, order_id: req.params.id, item_order: i,
        })));
      }
    }

    const { data, error } = await supabase.from('orders').update(updates).eq('id', req.params.id).select('*').single();
    if (error) throw error;

    // AUTO-FLOW: ĐH xác nhận → tự động tạo Project + Gen Tasks
    let autoProject = null;
    if (updates.status === 'confirmed') {
      try { autoProject = await onOrderConfirmed(req.params.id, req.user.userId); } catch (e) { console.error('Auto-flow error:', e.message); }
    }

    // 🔔 NOTIFICATION: Cập nhật đơn hàng
    try {
      const statusLabels = { confirmed: 'Đã xác nhận', shipped: 'Đang giao', delivered: 'Đã giao', cancelled: 'Đã hủy' };
      const statusLabel = statusLabels[updates.status] || '';
      const t = await getNotifyTargets(data.lead_id);
      const allIds = [...new Set([...t.ownerIds, ...t.adminIds])];
      if (allIds.length && updates.status) await notifyMultiple(req, allIds, 'order_updated',
        `📦 ĐH ${data.code} — ${statusLabel}`,
        `Đơn hàng ${data.code} cập nhật trạng thái: ${statusLabel}`,
        'order', data.id);
    } catch (ne) { console.warn('[NOTIFY] order_updated:', ne.message); }

    res.json({ ...data, auto_project: autoProject });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/orders', async (req, res) => {
  try {
    const { items, ...orderData } = req.body;
    const code = await nextCode('DH');

    // Sanitize: empty strings → null for UUID fields
    ['customer_id', 'lead_id', 'quotation_id', 'project_id', 'company_id'].forEach(f => {
      if (orderData[f] === '' || orderData[f] === undefined) orderData[f] = null;
    });

    let orderCo = orderData.company_id || null;
    let orderLeadIdForScope = orderData.lead_id || null;
    if (orderData.lead_id) {
      const { data: lrow } = await supabase.from('crm_leads').select('company_id').eq('id', orderData.lead_id).maybeSingle();
      if (lrow?.company_id) orderCo = lrow.company_id;
    } else if (orderData.quotation_id) {
      const { data: qrow } = await supabase.from('quotations').select('company_id, lead_id').eq('id', orderData.quotation_id).maybeSingle();
      if (qrow?.lead_id) orderLeadIdForScope = qrow.lead_id;
      if (qrow?.company_id) orderCo = qrow.company_id;
      else if (qrow?.lead_id) {
        const { data: l2 } = await supabase.from('crm_leads').select('company_id').eq('id', qrow.lead_id).maybeSingle();
        if (l2?.company_id) orderCo = l2.company_id;
      }
    }
    const oCoWrite = await enforceCommercialDocCompanyOnWrite(req, res, orderCo, 'Đơn hàng', {
      leadId: orderLeadIdForScope,
    });
    if (!oCoWrite.ok) return;
    orderCo = oCoWrite.companyId;
    orderData.company_id = orderCo;

    // Calc totals with per-item VAT + spec_factor (hệ số quy cách) — cùng logic với /quotations
    // Excel fidelity: nếu item.lock_amount && imported_amount → giữ NGUYÊN số tiền Excel.
    const processedItems = buildProcessedCommercialItems(items);
    const subtotal = processedItems.reduce((s, i) => s + (i.amount || 0), 0);
    const discountAmt = orderData.discount_type === 'percent' ? subtotal * (orderData.discount_value || 0) / 100 : (orderData.discount_value || 0);
    const afterDiscount = subtotal - discountAmt;
    const taxAmt = processedItems.reduce((s, i) => s + (i.vat_amount || 0), 0);

    const { data, error } = await supabase.from('orders').insert({
      ...orderData, code, subtotal, discount_amount: discountAmt,
      tax_amount: taxAmt, total: afterDiscount + taxAmt, created_by: req.user.userId,
    }).select('*').single();
    if (error) throw error;

    // AUTO: create fulfillment deal (CRMTasks) for this order
    try {
      if (data?.lead_id) {
        const { data: parentDeal } = await supabase
          .from('crm_leads')
          .select('id, title, customer_id, company_id, pipeline_id, stage_id, assigned_to, lead_owner_id, estimated_value, parent_lead_id, project_id, code')
          .eq('id', data.lead_id)
          .maybeSingle();
        if (parentDeal?.id) {
          const displayLabel = data.title || data.code || 'Đơn hàng';
          const childLeadId = await createFulfillmentChildDeal({
            parentDeal,
            masterProjectId: data.project_id || parentDeal.project_id || null,
            displayLabel,
            userId: req.user.userId,
            estimatedValue: data.total || 0,
          });
          const { error: uErr } = await supabase.from('orders').update({ fulfillment_lead_id: childLeadId }).eq('id', data.id);
          if (!uErr) data.fulfillment_lead_id = childLeadId;
        }
      }
    } catch (fe) {
      console.warn('[crm/orders] create fulfillment deal:', fe.message);
    }

    if (processedItems.length) {
      await supabase.from('order_items').insert(processedItems.map((item, i) => ({
        ...item, order_id: data.id, item_order: i,
      })));
    }

    // 🔔 NOTIFICATION: Đơn hàng mới
    try {
      const t = await getNotifyTargets(data.lead_id);
      const allIds = [...new Set([...t.ownerIds, ...t.adminIds])];
      if (allIds.length) await notifyMultiple(req, allIds, 'order_created',
        '🛒 Đơn hàng mới',
        `Đơn hàng ${code} — KH: ${data.customer_name || 'N/A'} — ${formatMoney(data.total)}`,
        'order', data.id);
    } catch (ne) { console.warn('[NOTIFY] order_created:', ne.message); }

    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/orders/:id/create-invoice', async (req, res) => {
  try {
    const { data: order } = await supabase.from('orders').select('*').eq('id', req.params.id).single();
    if (!order) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });

    const { data: oItems } = await supabase.from('order_items').select('*').eq('order_id', req.params.id).order('item_order');

    const invCode = await nextCode('HD');
    const { data: invoice, error } = await supabase.from('invoices').insert({
      code: invCode,
      company_id: order.company_id || null,
      customer_id: order.customer_id, customer_name: order.customer_name,
      customer_phone: order.customer_phone, customer_address: order.customer_address,
      order_id: order.id, quotation_id: order.quotation_id, project_id: order.project_id,
      title: order.title, subtotal: order.subtotal, discount_type: order.discount_type,
      discount_value: order.discount_value, discount_amount: order.discount_amount,
      tax_rate: order.tax_rate, tax_amount: order.tax_amount, total: order.total,
      created_by: req.user.userId,
    }).select('*').single();
    if (error) throw error;

    if (oItems?.length) {
      await supabase.from('invoice_items').insert(oItems.map(oi => ({
        invoice_id: invoice.id, product_id: oi.product_id, product_code: oi.product_code, order_item_id: oi.id,
        item_order: oi.item_order, name: oi.name, description: oi.description,
        unit: oi.unit, quantity: oi.quantity, unit_price: oi.unit_price,
        spec_factor: oi.spec_factor || null, standard_area: oi.standard_area || null,
        height: oi.height || null, width: oi.width || null, length: oi.length || null, weight: oi.weight || null,
        discount_percent: oi.discount_percent, discount_amount: oi.discount_amount || 0, amount: oi.amount,
        vat_rate: oi.vat_rate || 0, vat_amount: oi.vat_amount || 0, tax_amount: oi.tax_amount || oi.vat_amount || 0,
        total: oi.total || oi.amount, promo_code: oi.promo_code || null, is_promo: oi.is_promo || false,
        group_name: oi.group_name || null, notes: oi.notes,
      })));
    }

    res.status(201).json(invoice);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.delete('/orders/:id', async (req, res) => {
  try {
    // Get info before delete
    const { data: delO } = await supabase
      .from('orders')
      .select('code, lead_id, customer_name, quotation_id')
      .eq('id', req.params.id)
      .single();
    await supabase.from('order_items').delete().eq('order_id', req.params.id);
    const { error } = await supabase.from('orders').delete().eq('id', req.params.id);
    if (error) throw error;

    // Nếu ĐH tạo từ BG và không còn ĐH nào khác gắn BG đó → khôi phục nút chuyển BG→ĐH
    if (delO?.quotation_id) {
      try {
        await restoreConvertedQuotationsWithoutOrders([delO.quotation_id]);
      } catch (re) {
        console.warn('[ORDER DELETE] restore quotation status:', re.message);
      }
    }

    // 🔔 NOTIFICATION: Xóa đơn hàng
    try {
      const t = await getNotifyTargets(delO?.lead_id);
      if (t.adminIds.length) await notifyMultiple(req, t.adminIds, 'item_deleted',
        '🗑️ Đơn hàng đã xóa',
        `Đơn hàng ${delO?.code || ''} — KH: ${delO?.customer_name || 'N/A'} đã bị xóa`,
        'order', req.params.id);
    } catch (ne) {}

    res.json({ message: 'Đã xóa đơn hàng' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/invoices', responseCache({ ttl: 20, scope: 'user', tags: ['crm:list'] }), async (req, res) => {
  try {
    const { status, search, limit = 50, lead_id, company_id: coQ } = req.query;
    let q = supabase.from('invoices')
      .select(INVOICE_LIST_SELECT)
      .order('created_at', { ascending: false }).limit(parseInt(limit));
    const iScope = resolveCommercialDocListCompanyScope(req, res, coQ);
    if (!iScope.ok) return;
    if (iScope.companyId) q = q.eq('company_id', iScope.companyId);
    if (status) q = q.eq('status', status);
    if (search) q = q.or(`code.ilike.%${search}%,title.ilike.%${search}%,customer_name.ilike.%${search}%`);
    if (lead_id && /^[0-9a-f-]{36}$/i.test(String(lead_id))) q = await applyLeadOrCustomerSalesFilter(q, lead_id);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/invoices/:id', async (req, res) => {
  try {
    const { data: invoice } = await supabase.from('invoices')
      .select('*, customer:customers(id, full_name, phone, email, address, company, tax_code)')
      .eq('id', req.params.id).single();
    const { data: items } = await supabase.from('invoice_items')
      .select('*, product:products(id, name, code)')
      .eq('invoice_id', req.params.id).order('item_order');
    const { data: payments } = await supabase.from('payment_records')
      .select('*').eq('invoice_id', req.params.id).order('payment_date', { ascending: false });
    res.json({ ...invoice, items: items || [], payments: payments || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/invoices', async (req, res) => {
  try {
    const { items, ...invoiceData } = req.body;
    const code = await nextCode('HD');

    // Sanitize: empty strings → null for UUID fields
    ['customer_id', 'order_id', 'quotation_id', 'project_id', 'company_id', 'lead_id'].forEach(f => {
      if (invoiceData[f] === '' || invoiceData[f] === undefined) invoiceData[f] = null;
    });

    let invCo = invoiceData.company_id || null;
    let invLeadIdForScope = invoiceData.lead_id || null;
    if (invoiceData.lead_id) {
      const { data: lrow } = await supabase.from('crm_leads').select('company_id').eq('id', invoiceData.lead_id).maybeSingle();
      if (lrow?.company_id) invCo = lrow.company_id;
    } else if (invoiceData.order_id) {
      const { data: orow } = await supabase.from('orders').select('company_id, lead_id').eq('id', invoiceData.order_id).maybeSingle();
      if (orow?.lead_id) invLeadIdForScope = orow.lead_id;
      if (orow?.company_id) invCo = orow.company_id;
    } else if (invoiceData.quotation_id) {
      const { data: qr } = await supabase.from('quotations').select('company_id, lead_id').eq('id', invoiceData.quotation_id).maybeSingle();
      if (qr?.lead_id) invLeadIdForScope = qr.lead_id;
      if (qr?.company_id) invCo = qr.company_id;
    }
    const iCoWrite = await enforceCommercialDocCompanyOnWrite(req, res, invCo, 'Hóa đơn', {
      leadId: invLeadIdForScope,
    });
    if (!iCoWrite.ok) return;
    invCo = iCoWrite.companyId;

    // Calc totals with per-item VAT + spec_factor (hệ số quy cách) — cùng logic với /quotations, /orders
    // Excel fidelity: nếu item.lock_amount && imported_amount → giữ NGUYÊN số tiền Excel.
    const processedItems = buildProcessedCommercialItems(items);
    const subtotal = processedItems.reduce((s, i) => s + (i.amount || 0), 0);
    const discountAmt = invoiceData.discount_type === 'percent' ? subtotal * (invoiceData.discount_value || 0) / 100 : (invoiceData.discount_value || 0);
    const afterDiscount = subtotal - discountAmt;
    const taxAmt = processedItems.reduce((s, i) => s + (i.vat_amount || 0), 0);

    const { data: inv, error } = await supabase.from('invoices').insert({
      code,
      company_id: invCo,
      lead_id: invoiceData.lead_id || null,
      order_id: invoiceData.order_id || null,
      quotation_id: invoiceData.quotation_id || null,
      project_id: invoiceData.project_id || null,
      customer_id: invoiceData.customer_id,
      customer_name: invoiceData.customer_name || null,
      customer_phone: invoiceData.customer_phone || null,
      customer_address: invoiceData.customer_address || null,
      customer_tax_code: invoiceData.customer_tax_code || null,
      title: invoiceData.title || null,
      subtotal,
      discount_type: invoiceData.discount_type || null,
      discount_value: invoiceData.discount_value || 0,
      discount_amount: discountAmt,
      tax_amount: taxAmt,
      total: afterDiscount + taxAmt,
      notes: invoiceData.notes || null,
      due_date: invoiceData.due_date || null,
      payment_terms: invoiceData.payment_terms || null,
      created_by: req.user.userId,
    }).select('*').single();
    if (error) throw error;

    if (processedItems.length) {
      await supabase.from('invoice_items').insert(processedItems.map((item, i) => ({
        ...item, invoice_id: inv.id, item_order: i,
      })));
    }

    // 🔔 NOTIFICATION: Hóa đơn mới
    try {
      const adminIds = await getCompanyScopedAdminIds(invCo || inv.company_id);
      if (adminIds.length) await notifyMultiple(req, adminIds, 'invoice_created',
        '🧾 Hóa đơn mới',
        `Hóa đơn ${code} — KH: ${inv.customer_name || 'N/A'} — ${formatMoney(inv.total)}`,
        'invoice', inv.id);
    } catch (ne) { console.warn('[NOTIFY] invoice_created:', ne.message); }

    res.status(201).json(inv);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/invoices/:id/items', async (req, res) => {
  try {
    const { items } = req.body;
    if (!items?.length) return res.status(400).json({ error: 'Không có hàng hóa' });
    const processedItems = buildProcessedCommercialItems(items);
    const itemRows = processedItems.map((item, i) => ({ ...item, invoice_id: req.params.id, item_order: i }));
    const { data, error } = await supabase.from('invoice_items').insert(itemRows).select();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/invoices/:id', async (req, res) => {
  try {
    const { items: itemsBody, ...updatesFromBody } = req.body;
    const updates = { ...updatesFromBody, updated_at: new Date().toISOString() };
    // Sanitize: empty strings → null for UUID fields
    ['customer_id', 'order_id', 'quotation_id', 'project_id', 'company_id', 'lead_id'].forEach(f => {
      if (updates[f] === '') updates[f] = null;
    });
    if (updates.payment_status === 'paid' && !updates.paid_at) updates.paid_at = new Date().toISOString();

    // ── Re-tính totals + lưu lại invoice_items khi có gửi items (form Sửa hóa đơn) ──
    // Cùng logic Excel fidelity với /quotations, /orders: lock_amount/imported_amount giữ nguyên số tiền gốc.
    if (Array.isArray(itemsBody)) {
      const processedItems = buildProcessedCommercialItems(itemsBody);
      const subtotal = processedItems.reduce((s, i) => s + (i.amount || 0), 0);
      const discountAmt = updates.discount_type === 'percent' ? subtotal * (updates.discount_value || 0) / 100 : (updates.discount_value || 0);
      const afterDiscount = subtotal - discountAmt;
      const taxAmt = processedItems.reduce((s, i) => s + (i.vat_amount || 0), 0);
      updates.subtotal = subtotal;
      updates.discount_amount = discountAmt;
      updates.tax_amount = taxAmt;
      updates.total = afterDiscount + taxAmt;

      await supabase.from('invoice_items').delete().eq('invoice_id', req.params.id);
      if (processedItems.length) {
        await supabase.from('invoice_items').insert(processedItems.map((item, i) => ({
          ...item, invoice_id: req.params.id, item_order: i,
        })));
      }
    }

    const { data, error } = await supabase.from('invoices').update(updates).eq('id', req.params.id).select('*').single();
    if (error) throw error;

    // 🔔 NOTIFICATION: Cập nhật hóa đơn
    try {
      const statusLabels = { paid: 'Đã thanh toán đủ', partial: 'Thanh toán 1 phần', unpaid: 'Chưa thanh toán' };
      const statusLabel = statusLabels[updates.payment_status] || '';
      const t = await getNotifyTargets(data.lead_id);
      const allIds = [...new Set([...t.ownerIds, ...t.adminIds])];
      if (allIds.length && updates.payment_status) await notifyMultiple(req, allIds, 'invoice_updated',
        `🧾 HĐ ${data.code} — ${statusLabel}`,
        `Hóa đơn ${data.code} cập nhật trạng thái: ${statusLabel}`,
        'invoice', data.id);
    } catch (ne) { console.warn('[NOTIFY] invoice_updated:', ne.message); }

    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/invoices/:id/payments', async (req, res) => {
  try {
    const body = { ...req.body };
    ['order_id', 'invoice_id'].forEach(f => { if (body[f] === '') body[f] = null; });
    const { data: payment, error } = await supabase.from('payment_records')
      .insert({ ...body, invoice_id: req.params.id, created_by: req.user.userId })
      .select('*').single();
    if (error) throw error;

    // Update invoice paid_amount
    const { data: allPayments } = await supabase.from('payment_records')
      .select('amount').eq('invoice_id', req.params.id);
    const totalPaid = (allPayments || []).reduce((s, p) => s + (p.amount || 0), 0);

    const { data: invoice } = await supabase.from('invoices').select('total').eq('id', req.params.id).single();
    const paymentStatus = totalPaid >= (invoice?.total || 0) ? 'paid' : totalPaid > 0 ? 'partial' : 'unpaid';

    await supabase.from('invoices').update({
      paid_amount: totalPaid, payment_status: paymentStatus,
      paid_at: paymentStatus === 'paid' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id);

    // 🔔 NOTIFICATION: Thanh toán
    try {
      const { data: inv } = await supabase.from('invoices').select('code, lead_id, customer_name, total, order_id').eq('id', req.params.id).single();
      const t = await getNotifyTargets(inv?.lead_id);
      const allIds = [...new Set([...t.ownerIds, ...t.adminIds])];
      const paidLabel = paymentStatus === 'paid' ? '✅ Đã thanh toán đủ' : '💰 Nhận thanh toán';
      if (allIds.length) await notifyMultiple(req, allIds, 'payment_received',
        paidLabel,
        `${inv?.code || 'HĐ'} — Nhận ${formatMoney(payment.amount)} (${formatMoney(totalPaid)}/${formatMoney(inv?.total)})`,
        'invoice', req.params.id);
    } catch (ne) { console.warn('[NOTIFY] payment:', ne.message); }

    res.status(201).json(payment);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.delete('/invoices/:id', async (req, res) => {
  try {
    // Get info before delete
    const { data: delI } = await supabase.from('invoices').select('code, customer_name, company_id').eq('id', req.params.id).single();
    await supabase.from('payment_records').delete().eq('invoice_id', req.params.id);
    await supabase.from('invoice_items').delete().eq('invoice_id', req.params.id);
    const { error } = await supabase.from('invoices').delete().eq('id', req.params.id);
    if (error) throw error;

    // 🔔 NOTIFICATION: Xóa hóa đơn
    try {
      const adminIds = await getCompanyScopedAdminIds(delI?.company_id);
      if (adminIds.length) await notifyMultiple(req, adminIds, 'item_deleted',
        '🗑️ Hóa đơn đã xóa',
        `Hóa đơn ${delI?.code || ''} — KH: ${delI?.customer_name || 'N/A'} đã bị xóa`,
        'invoice', req.params.id);
    } catch (ne) {}

    res.json({ message: 'Đã xóa hóa đơn' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/invoices/:id/misa-publish', async (req, res) => {
  try {
    if (!misaService) return res.status(503).json({ error: 'MISA service chưa được cấu hình' });

    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .select('*, customer:customers(id, full_name, email, tax_code)')
      .eq('id', req.params.id).single();
    if (invErr || !invoice) return res.status(404).json({ error: 'Không tìm thấy hóa đơn' });

    if (invoice.misa_status === 'published') {
      return res.status(400).json({ error: 'Hóa đơn đã được phát hành lên MISA (số: ' + invoice.misa_invoice_no + ')' });
    }

    const { data: items } = await supabase
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', req.params.id)
      .order('item_order');

    // Gắn email từ customer nếu invoice không có
    const invoiceWithEmail = {
      ...invoice,
      customer_email: invoice.customer_email || invoice.customer?.email || '',
    };

    const result = await misaService.publishInvoice(invoiceWithEmail, items || []);

    // Cập nhật trạng thái MISA vào DB
    await supabase.from('invoices').update({
      misa_status: 'published',
      misa_invoice_no: result.invoiceNo,
      misa_lookup_code: result.lookupCode,
      misa_ref_id: invoice.id,
      misa_published_at: new Date().toISOString(),
      misa_error_message: null,
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id);

    res.json({
      success: true,
      invoiceNo: result.invoiceNo,
      lookupCode: result.lookupCode,
    });
  } catch (e) {
    // Lưu lỗi vào DB để dễ debug
    await supabase.from('invoices').update({
      misa_error_message: e.message,
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id);
    res.status(500).json({ error: e.message });
  }
});

r.post('/invoices/:id/misa-send-email', async (req, res) => {
  try {
    if (!misaService) return res.status(503).json({ error: 'MISA service chưa được cấu hình' });

    const { data: invoice } = await supabase
      .from('invoices')
      .select('misa_invoice_no, misa_status, customer_name, customer:customers(email)')
      .eq('id', req.params.id).single();

    if (!invoice) return res.status(404).json({ error: 'Không tìm thấy hóa đơn' });
    if (invoice.misa_status !== 'published' && invoice.misa_status !== 'sent_email') {
      return res.status(400).json({ error: 'Hóa đơn chưa được phát hành lên MISA' });
    }

    const email = req.body.email || invoice.customer?.email || '';
    if (!email) return res.status(400).json({ error: 'Không có địa chỉ email để gửi' });

    await misaService.sendEmailInvoice(
      invoice.misa_invoice_no,
      email,
      invoice.customer_name || ''
    );

    await supabase.from('invoices').update({
      misa_status: 'sent_email',
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id);

    res.json({ success: true, sentTo: email });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/invoices/:id/misa-status', async (req, res) => {
  try {
    if (!misaService) return res.status(503).json({ error: 'MISA service chưa được cấu hình' });

    const { data: invoice } = await supabase
      .from('invoices')
      .select('id, misa_status, misa_invoice_no, misa_ref_id, misa_published_at, misa_lookup_code, misa_error_message')
      .eq('id', req.params.id).single();

    if (!invoice) return res.status(404).json({ error: 'Không tìm thấy hóa đơn' });

    let misaDetail = null;
    if (invoice.misa_ref_id) {
      try {
        misaDetail = await misaService.getInvoiceStatus(invoice.misa_ref_id);
      } catch (statusErr) {
        // Không ném lỗi, chỉ trả local status
      }
    }

    res.json({
      localStatus: invoice.misa_status,
      invoiceNo: invoice.misa_invoice_no,
      publishedAt: invoice.misa_published_at,
      lookupCode: invoice.misa_lookup_code,
      errorMessage: invoice.misa_error_message,
      misaDetail,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/products-list', async (req, res) => {
  try {
    const rawQ = req.query.company_id && String(req.query.company_id).trim();
    const pScope = resolveCommercialDocListCompanyScope(req, res, rawQ);
    if (!pScope.ok) return;
    const effectiveCompanyId = pScope.companyId;
    let q = supabase.from('products').select('*').order('name');
    if (effectiveCompanyId) q = q.eq('company_id', effectiveCompanyId);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.put('/products/:id', async (req, res) => {
  try {
    const { data: existing, error: exErr } = await supabase.from('products').select('company_id, category_id').eq('id', req.params.id).maybeSingle();
    if (exErr) throw exErr;
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
    if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      if (existing.company_id && String(existing.company_id) !== String(cid)) {
        return res.status(403).json({ error: 'Không có quyền sửa sản phẩm công ty khác' });
      }
    }
    const b = { ...req.body };
    if (!userIsAdmin(req.user?.role)) delete b.company_id;
    if (userIsAdmin(req.user?.role) && Object.prototype.hasOwnProperty.call(b, 'company_id')) {
      b.company_id = String(b.company_id || '').trim() || null;
    } else {
      const newCat = b.category_id !== undefined ? b.category_id : existing.category_id;
      if (newCat) {
        const { data: cat } = await supabase.from('product_categories').select('company_id').eq('id', newCat).maybeSingle();
        if (cat?.company_id) b.company_id = cat.company_id;
      }
    }
    b.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from('products').update(b).eq('id', req.params.id).select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/products', async (req, res) => {
  try {
    const row = { ...req.body };
    if (userIsAdmin(req.user?.role)) {
      if (row.company_id !== undefined) row.company_id = String(row.company_id || '').trim() || null;
    } else {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      row.company_id = cid;
    }
    if (!row.company_id && row.category_id) {
      const { data: cat } = await supabase.from('product_categories').select('company_id').eq('id', row.category_id).maybeSingle();
      if (cat?.company_id) row.company_id = cat.company_id;
    }
    const { data, error } = await supabase.from('products').insert(row).select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/quotations/excel-sheets', excelUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Chưa chọn file' });
    res.json(listQuotationExcelSheets(req.file.buffer));
  } catch (e) {
    console.error('[excel-sheets]', e);
    res.status(500).json({ error: e.message || 'Lỗi đọc file' });
  }
});

r.post('/quotations/parse-excel', excelUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Chưa chọn file' });
    const data = await parseQuotationExcelBuffer(req.file.buffer, { sheetName: req.body?.sheet_name });
    res.json(data);
  } catch (e) {
    console.error('[parse-excel]', e);
    res.status(500).json({ error: e.message?.startsWith('Lỗi đọc file Excel') ? e.message : 'Lỗi đọc file Excel: ' + e.message });
  }
});

r.get('/quotations/:id/pdf', async (req, res) => {
  try {
    const { data: quote } = await supabase.from('quotations')
      .select('*, customer:customers(id, full_name, phone, email, address, company, tax_code)')
      .eq('id', req.params.id).single();
    if (!quote) return res.status(404).json({ error: 'Khong tim thay bao gia' });
    if (!userMayAccessQuotationRow(req, quote)) {
      return res.status(403).json({ error: 'Khong co quyen xuat PDF bao gia nay' });
    }
    const { data: items } = await supabase.from('quotation_items')
      .select('*, product:products(id, name, code)')
      .eq('quotation_id', req.params.id).order('item_order');
    generateDocPdf(res, quote, items || [], 'quotation');
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/orders/:id/pdf', async (req, res) => {
  try {
    const { data: order } = await supabase.from('orders')
      .select('*, customer:customers(id, full_name, phone, email, address, company, tax_code)')
      .eq('id', req.params.id).single();
    if (!order) return res.status(404).json({ error: 'Khong tim thay don hang' });
    const { data: items } = await supabase.from('order_items')
      .select('*, product:products(id, name, code)')
      .eq('order_id', req.params.id).order('item_order');
    generateDocPdf(res, order, items || [], 'order');
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/invoices/:id/pdf', async (req, res) => {
  try {
    const { data: invoice } = await supabase.from('invoices')
      .select('*, customer:customers(id, full_name, phone, email, address, company, tax_code)')
      .eq('id', req.params.id).single();
    if (!invoice) return res.status(404).json({ error: 'Khong tim thay hoa don' });
    const { data: items } = await supabase.from('invoice_items')
      .select('*, product:products(id, name, code)')
      .eq('invoice_id', req.params.id).order('item_order');
    generateDocPdf(res, invoice, items || [], 'invoice');
  } catch (e) { res.status(500).json({ error: e.message }); }
});
}).call(null, helpers["ALLOWED_DEADLINE_FIELDS"], helpers["CRM_COMMENT_ALLOWED_REACTION_EMOJI"], helpers["CRM_LEAD_KANBAN_LITE_SELECT"], helpers["CRM_LEAD_LIST_SELECT"], helpers["CRM_LEAD_LIST_SELECT_BASE"], helpers["CRM_LEAD_LIST_SELECT_EXTRA"], helpers["CRM_LEAD_REGION_EMBED"], helpers["CRM_NEW_LEAD_MAX_AGE_MS"], helpers["CRM_TASK_SELECT"], helpers["CRM_UUID_RE"], helpers["CUSTOMERS_IN_CHUNK"], helpers["CUSTOMERS_OVERVIEW_NO_MATCH_ID"], helpers["DEAL_PRE_CONTRACT_SLUGS_STAFF"], helpers["DEAL_REPORT_BUCKET_VALUES"], helpers["DEFAULT_CHECKLISTS"], helpers["DEFAULT_DEADLINE_BUCKETS"], helpers["DEFAULT_PIPELINE_STAGE_SLA_DAYS"], helpers["FOLLOWUP_TIME_BUCKETS"], helpers["PDFDocument"], helpers["QUOTATIONS_SOURCE_EXCEL_COLS"], helpers["Router"], helpers["SCAN_DUP_LITE_SELECT"], helpers["STAFF_LEAD_DEAL_REPORT_ROLES"], helpers["SURVEY_EVENT_SELECT"], helpers["SURVEY_EVENT_TYPES"], helpers["XLSX"], helpers["ZALO_APP_SETTING_KEY"], helpers["crmSchemaCompat"], helpers["addPhoneToAutoLeadBlocklist"], helpers["aggregateCrmCommentReactions"], helpers["aggregateOrgReportRows"], helpers["appendFulfillmentChildTasksForMasterDeal"], helpers["applyAllActiveWorkshopTemplatesForArea"], helpers["applyAssigneesToInsertedCrmTasks"], helpers["applyCrmLeadRegionFilterToQuery"], helpers["applyCrmTaskTemplatesToCompanyRegions"], helpers["applyCustomerIdInFilter"], helpers["applyCustomersOverviewSearch"], helpers["applyDefaultWorkshopTemplatesForNewProject"], helpers["applyLeadOrCustomerSalesFilter"], helpers["applyProductionTemplateToFulfillmentLead"], helpers["applyProductionTemplatesOnPipelineEnter"], helpers["applyStageIdFilterToQuery"], helpers["applyWorkshopTemplateToProject"], helpers["artifactNamePrefix"], helpers["assertCanFlagLead"], helpers["assertCategoryFitsSource"], helpers["assertCrmAssigneeUserMatchesLeadCompany"], helpers["assertCrmEmployeeDeleteAllowed"], helpers["assertCrmStageAdvanceAllowed"], helpers["assertDealCrmManualStageChange"], helpers["assertDealResponsible"], helpers["assertDivisionAllowedForCompany"], helpers["assertLeadDocumentOwner"], helpers["assertLeadReadableByRegionScope"], helpers["assertRegionBelongsToCompany"], helpers["assertUserCanAssignCrmRegion"], helpers["assignProductionCompanyDealResponsibility"], helpers["attachAssigneesToCrmTasks"], helpers["attachAssignmentIdsToCrmTasks"], helpers["attachCrmNextOpenTaskDeadline"], helpers["attachLeadNewFlagForList"], helpers["attachLeadReplyParents"], helpers["attachLeadUserFlagsForList"], helpers["auth"], helpers["autoCreateProjectFromWonDeal"], helpers["autoFlowFns"], helpers["autoGenCrmTasksForNewLead"], helpers["buildAssignmentNotificationInsert"], helpers["buildChecklistLeadDocumentRow"], helpers["buildCrmDashboardMinimalKpis"], helpers["buildCrmLeadsRpcFilterParams"], helpers["buildCustomersOverviewSummary"], helpers["buildDealTemplateData"], helpers["buildDefaultDeadlineConfig"], helpers["buildFirstStageIdByPipeline"], helpers["buildPipelineStagesMap"], helpers["buildProcessedCommercialItems"], helpers["buildQuotedStageOrderByPipeline"], helpers["buildScanDuplicateGroups"], helpers["buildWonStageOrderByPipeline"], helpers["canUserViewDocByAllowlist"], helpers["chatUpload"], helpers["chunkArray"], helpers["classifyDealStageForStaffReport"], helpers["commentsTableMissing"], helpers["companyRegionExtraColumnsMissing"], helpers["companyRegionGeoColumnsMissing"], helpers["computeCrmDashboardLightStats"], helpers["computeCrmLiveVersionMs"], helpers["computeCustomersOverviewSummary"], helpers["computeIsNewLeadForUser"], helpers["computeOrgOverviewReportData"], helpers["computeStaffLeadDealReportData"], helpers["computeStaffPipelineDetailPayload"], helpers["countOpenOverdueCrmTasksForLeadIds"], helpers["createCrmAssignment"], helpers["createCrmLeadTask"], helpers["createFulfillmentChildDeal"], helpers["createNotif"], helpers["createNotification"], helpers["createProjectFromLead"], helpers["crmExecutorFieldsFromTemplateItem"], helpers["crmLeadCommentAttachmentsColumnMissing"], helpers["crmLeadCommentReadReceiptsTableMissing"], helpers["crmLeadRowVisibleToRequestUser"], helpers["crmListUsesLegacyFilters"], helpers["crmNoteActivityUpload"], helpers["crmReportAsOfMs"], helpers["crmReportCreatedAtFromIso"], helpers["crmReportCreatedAtToIso"], helpers["crmReportDayKeyVn"], helpers["crmRouteErrorText"], helpers["crmTaskDeadlineModuleKey"], helpers["crmTaskMeetsCompletionRequirements"], helpers["crmTaskMeetsRequiredFileTypes"], helpers["crmTaskRequiresCompletionEvidence"], helpers["crmTemplateMatchesLeadType"], helpers["deadlineToDateOnlyIso"], helpers["defaultCompanyInfo"], helpers["defaultKpiLedgerMonthStartYmd"], helpers["deleteCrmLeadTask"], helpers["deleteMirroredAssignmentFileForTaskAttachment"], helpers["duplicateLeadIdsFromLiteRows"], helpers["ecosystemModuleKeyForCrmDeadline"], helpers["effectivePipelineStageSlaDays"], helpers["emitCrmBadgeUpdateForProject"], helpers["emitCrmDashboardChanged"], helpers["emitCrmTaskChanged"], helpers["emptyStaffLeadDealAgg"], helpers["endOfCalendarDayAfterEntered"], helpers["enforceCommercialDocCompanyOnWrite"], helpers["enforceQuotaForRequest"], helpers["ensureDealLeadDocumentsForModuleTransition"], helpers["ensureDefaultCrmPipelineForCompany"], helpers["ensureMissingCrmTasksForLead"], helpers["ensureMissingCrmTasksForPipelineStage"], helpers["ensureMissingSxTasksForLead"], helpers["excelUpload"], helpers["executeLeadMerge"], helpers["executeZaloDealStageNotify"], helpers["fetchActivityCustomerIds"], helpers["fetchAllLeadsForSlaWatchlist"], helpers["fetchAssignmentForTask"], helpers["fetchCrmCommentReactionsAggregate"], helpers["fetchCrmLeadCommentNotifyUserIds"], helpers["fetchCrmLeadDetailRow"], helpers["fetchCrmLeadWithPipelineBadges"], helpers["fetchCrmLeadsByIdsOrdered"], helpers["fetchCrmLeadsForDashboardBatched"], helpers["fetchCrmLeadsForOrgReportBatched"], helpers["fetchCrmLeadsForUserDetailBatched"], helpers["fetchCrmLeadsLiteForDuplicateScan"], helpers["fetchCrmLeadsPageViaRpc"], helpers["fetchCrmPipelineZaloSlice"], helpers["fetchCrmSurveyEventsChunk"], helpers["fetchCrmSurveyVisitsForOrgReport"], helpers["fetchLeadCommentAudienceMembers"], helpers["fetchLeadCommentAudienceMembersForRead"], helpers["fetchLeadIdsForCrmRegion"], helpers["fetchLeadMentionMembers"], helpers["fetchOrgActivityFeed"], helpers["fetchPipelineWithStagesById"], helpers["fetchScopedCrmBundles"], helpers["fillTemplateDataFromStructure"], helpers["filterCrmTasksForLeadType"], helpers["filterUserIdsForCrmLeadScopedNotification"], helpers["findChecklistItem"], helpers["followupDismissExpiresAt"], helpers["fontBold"], helpers["fontRegular"], helpers["formatMoney"], helpers["formatVNDPdf"], helpers["formatVnPhoneLocal0From84"], helpers["fs"], helpers["generateDocPdf"], helpers["generateFlowTasks"], helpers["generateStepTasks"], helpers["getAppSettingValue"], helpers["getCompanyInfo"], helpers["getCompanyRegionsList"], helpers["getCrmLeadListSelect"], helpers["getCrmLeadRegionConstraint"], helpers["getCrmLeadTypesList"], helpers["getCrmLeadsListLegacy"], helpers["getCrmSourceCategoriesList"], helpers["getCrmSourcesList"], helpers["getDefaultCrmAttachmentShare"], helpers["getDefaultDealZaloTemplateStructure"], helpers["getDefaultLeadDocumentShareForDeal"], helpers["getDefaultPipelineIdForCompany"], helpers["getLeadDocumentFieldsFromCrmTask"], helpers["getNotifyTargets"], helpers["getOverdueFollowUps"], helpers["getPipelineIdForCompanyRegion"], helpers["getPipelineZaloSlice"], helpers["getPipelinesList"], helpers["getProjectCRMSummary"], helpers["getStagesByPipelineId"], helpers["getStaleLeads"], helpers["getZaloNotifySettings"], helpers["hydrateCrmLeadsByIdsWithStaff"], helpers["hydrateCrmLeadsRpcPage"], helpers["hydrateScanDuplicateLeads"], helpers["insertQuotationRow"], helpers["invalidateAppSettingKey"], helpers["invalidatePipelinesAndStages"], helpers["invalidateRegions"], helpers["invalidateSources"], helpers["invalidateTenantUsageCache"], helpers["invokeCrmLeadsStageCountsRpc"], helpers["isAdminLike"], helpers["isAllowedLeadCommentAttachmentUrl"], helpers["isChotSanXuatCrmTaskTitle"], helpers["isCrmCompanyAdminUser"], helpers["isCrmDealAssigneeLocked"], helpers["isCrmLeadTypeColorMissingError"], helpers["isCrmModuleAdmin"], helpers["isCrmPipelinesTableMissingError"], helpers["isCrmRegionAdminUser"], helpers["isCrmSystemAdminUser"], helpers["isDealStageHoanThanhForZalo"], helpers["isDefaultAssigneeIdsColumnError"], helpers["isExecutorColumnError"], helpers["isPlatformAdmin"], helpers["isPostgresUniqueViolation"], helpers["isQuotationsSourceExcelColumnMissingError"], helpers["isSxRelationshipError"], helpers["isSystemAdmin"], helpers["isUuidString"], helpers["isValidDealZaloTemplateStructure"], helpers["isVcRelationshipError"], helpers["isVptCompanyCommercialDocViewer"], helpers["lastNominatimGeocodeAt"], helpers["leadChatFilesMulter"], helpers["leadChatJsonOrFiles"], helpers["listQuotationExcelSheets"], helpers["loadCrmTaskAttachmentCountMap"], helpers["loadOrgReportStageMap"], helpers["loadZaloLinkedLeadIdSet"], helpers["logDealActivityComment"], helpers["logDealDeadlineChangeComment"], helpers["logDealStageChangeComment"], helpers["logKanbanDeadlineUnifiedHistory"], helpers["logLeadCommentMentionActivity"], helpers["logProjectFileActivity"], helpers["mapCustomerOverviewRow"], helpers["mapLeadDisplayPhone"], helpers["mapQuotationItemsToOrderRows"], helpers["maskCustomerPhoneDisplay"], helpers["maskZaloAccessTokenPreview"], helpers["maybeSendZaloOnDealStageEnter"], helpers["mergeCrmStageDefaultAssigneeIntoUpdates"], helpers["mergeCustomerIntoTarget"], helpers["misaService"], helpers["multer"], helpers["nextCode"], helpers["nextTbProjectCode"], helpers["normalizeCrmActivityAttachments"], helpers["normalizeCrmLeadCommentAttachments"], helpers["normalizeCrmStageDefaultAssigneeUserId"], helpers["normalizeCrmUserRole"], helpers["normalizeLeadSeenByKeys"], helpers["normalizeOrgReportSurveyVisitRow"], helpers["normalizePipelineStageSlaDaysForDb"], helpers["normalizePipelineStagesList"], helpers["normalizeRegionIdList"], helpers["normalizeTemplateChecklistForCrmTask"], helpers["normalizeTemplateItemAssigneeIds"], helpers["normalizeTimestamp"], helpers["normalizeTitleFold"], helpers["normalizeVnPhoneTo84"], helpers["notifyDealCommentMentions"], helpers["notifyDealCommentParticipants"], helpers["notifyMultiple"], helpers["notifyMultipleShared"], helpers["notifyNewCrmAssignmentAssignees"], helpers["notifyProductionDocumentUploaded"], helpers["onLeadWon"], helpers["onOrderConfirmed"], helpers["onProjectCompleted"], helpers["onQuotationAccepted"], helpers["orgReportAttachFirstStageRates"], helpers["orgReportBumpFirstStageMetrics"], helpers["orgReportBumpMetrics"], helpers["orgReportBumpOpenOverdue"], helpers["orgReportBumpReceptionMetrics"], helpers["orgReportCancelRatePct"], helpers["orgReportClosedWonDealCount"], helpers["orgReportClosedWonValue"], helpers["orgReportCompareSummary"], helpers["orgReportConversionRate"], helpers["orgReportDayKey"], helpers["orgReportDealCloseValueRatePct"], helpers["orgReportDealCountsExpected"], helpers["orgReportDealIsClosedWon"], helpers["orgReportDealIsCompleted"], helpers["orgReportDealIsQuotedOrAfter"], helpers["orgReportDealProbability"], helpers["orgReportDealSplitBuckets"], helpers["orgReportExtendedDealMetrics"], helpers["orgReportFirstStageOnTimeRatePct"], helpers["orgReportFirstStageOverdueRatePct"], helpers["orgReportIsReceptionOverdue"], helpers["orgReportIsSlaOverdue"], helpers["orgReportKpiPeriodStart"], helpers["orgReportNumEst"], helpers["orgReportOverdueRatePct"], helpers["orgReportOwnerId"], helpers["orgReportPctDelta"], helpers["orgReportPreviousPeriod"], helpers["orgReportQuoteValueCloseRatePct"], helpers["orgReportQuoteWinRatePct"], helpers["orgReportReceptionOverdueRatePct"], helpers["orgReportReceptionSlaMinutes"], helpers["orgReportStageIsClosed"], helpers["orgReportStageIsLostOrCancelled"], helpers["orgReportTotalDealCount"], helpers["parseChecklist"], helpers["parseCrmLeadsPageRpc"], helpers["parseCrmReportDateRange"], helpers["parseCrmStageCountsNumericMap"], helpers["parseCrmStageCountsRpc"], helpers["parseExcelMoneyFromMappedColumn"], helpers["parseLeadIdUuidList"], helpers["parseLeadIdsCsvQuery"], helpers["parseLeadIdsFromBody"], helpers["parseLeadSeenByRaw"], helpers["parseQuotationExcelBuffer"], helpers["parseStageIdsFromQuery"], helpers["parseUuidArrayJsonb"], helpers["parseVietnameseMeasure"], helpers["parseVietnameseMoney"], helpers["path"], helpers["persistAssignmentNotification"], helpers["pgCrmDuplicateLeadIds"], helpers["pickDealZaloTemplatePayload"], helpers["pipeOrgOverviewReportPdf"], helpers["pipeStaffLeadDealSummaryPdf"], helpers["pipeStaffPipelineDetailPdf"], helpers["pipelineHasExplicitCompleted"], helpers["pipelineHasExplicitExpected"], helpers["pipelineHasExplicitWon"], helpers["plannerTableMissing"], helpers["postCrmStageDefaultAssigneeComment"], helpers["primaryTemplateItemAssigneeId"], helpers["rcInvalidateTags"], helpers["reactionsTableMissing"], helpers["redactCrmTaskNotesForViewer"], helpers["regionGeocodeInflight"], helpers["repairCrmDealPipelineDisplay"], helpers["requireUserCompanyId"], helpers["requireUserCompanyIdResolved"], helpers["resolveAssignmentIdForTask"], helpers["resolveCanonicalCrmLeadId"], helpers["resolveCommercialDocListCompanyScope"], helpers["resolveCrmBundleTemplateScope"], helpers["resolveCrmLeadsDeadlinesMap"], helpers["resolveCrmLeadsKanbanLite"], helpers["resolveCrmLeadsMergedQuery"], helpers["resolveCrmLeadsSkipDeadline"], helpers["resolveCrmLedgerNetByLeadIdsPayload"], helpers["resolveCrmReportScope"], helpers["resolveCrmTaskWriteLeadId"], helpers["resolveExecutorCompanyId"], helpers["resolveKanbanStagesForCompany"], helpers["resolveLeadCommentMentionIds"], helpers["resolveProductionCompanyForDealStage"], helpers["resolveProductionHandoverResponsibleUserId"], helpers["resolveReopenTargetStageId"], helpers["resolveRpcRegionIdsForCrmList"], helpers["resolveTenantIdForQuota"], helpers["resolveZaloDealTemplateId"], helpers["respondIfCrmPipelinesTableMissing"], helpers["responseCache"], helpers["restoreCrmTaskChecklistFromWorkshopTemplate"], helpers["resyncCrmPipelineTasksForLead"], helpers["sanitizeIsoDateQueryParam"], helpers["scheduleRegionGeocoding"], helpers["scopedAdminCompanyId"], helpers["scopedCrmCompanyIdForWrite"], helpers["sendZaloTemplateMessage"], helpers["setLeadFlag"], helpers["shallowMergeTemplateData"], helpers["skipSxWorkQuickComplete"], helpers["snapshotOrderRowFromQuotation"], helpers["stripCrmAssigneeFromWonStageUpdates"], helpers["stripCrmLeadTypeColorFromSelect"], helpers["stripQuotationsSourceExcelFields"], helpers["sumCrmKpiLedgerNetByLeadIds"], helpers["sumCrmKpiLedgerNetByUserForOrgReport"], helpers["sumCrmKpiLedgerNetByUserIds"], helpers["sumCrmKpiLedgerNetByUserIdsInDateRange"], helpers["supabase"], helpers["syncAllTaskArtifactsToAssignment"], helpers["syncChecklistItemNotes"], helpers["syncCrmLeadSxPipelineFromProject"], helpers["syncQuotationDepositToDealAndProject"], helpers["syncSxKanbanFromCrmProductionStage"], helpers["syncTaskAttachmentToAssignment"], helpers["templateItemAssigneePatch"], helpers["toCrmTaskChecklist"], helpers["unifyCrmLeadResponsibleFields"], helpers["updateCrmLeadTask"], helpers["updateQuotationRow"], helpers["upsertZaloNotifySettings"], helpers["userCanAccessCrmLeadAsParticipant"], helpers["userCanAccessCrmLeadViaVisibility"], helpers["userCanAssignAnyCrmRegion"], helpers["userCanBypassCrmDeleteRestriction"], helpers["userHasSeenLeadInSeenBy"], helpers["userIsAdmin"], helpers["userIsCrmCompanyOrRegionAdmin"], helpers["userMayAccessQuotationRow"], helpers["userSeesAllCrmDeals"], helpers["userSeesAllCrmDealsForScope"], helpers["userSeesAllCrmLeads"], helpers["userSeesAllCrmLeadsForScope"], helpers["uuidQueryOrNull"], helpers["validateProductionCompanyId"]);

module.exports = r;
