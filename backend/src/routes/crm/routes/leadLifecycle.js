/**
 * CRM routes: leadLifecycle
 * Auto-extracted — handlers close over shared helpers via IIFE.
 */
const { Router } = require('express');
const helpers = require('../shared/helpersBundle');
const { markVoiceRecordingsSkipAutoCreateForLeadIds } = require('../../../helpers/voiceRecordingCrmAuto');
const { getCompanyScopedAdminIds } = require('../../../helpers/notifications');
const {
  executeLeadCompanyTransfer,
  getTransferOptions,
} = require('../../../helpers/crmLeadCompanyTransfer');
const { createAdditionalCustomerDeal } = require('../../../helpers/projectOrderFulfillment');
const {
  isCrmCompletedStage,
  completeOpenWorkOnModuleDone,
} = require('../../../helpers/completeOpenWorkOnModuleDone');
const { deleteExclusiveProjectsForLeads } = require('../../../helpers/deleteExclusiveProjectsForLeads');

const r = Router();

(function (ALLOWED_DEADLINE_FIELDS, CRM_COMMENT_ALLOWED_REACTION_EMOJI, CRM_LEAD_KANBAN_LITE_SELECT, CRM_LEAD_LIST_SELECT, CRM_LEAD_LIST_SELECT_BASE, CRM_LEAD_LIST_SELECT_EXTRA, CRM_LEAD_REGION_EMBED, CRM_NEW_LEAD_MAX_AGE_MS, CRM_TASK_SELECT, CRM_UUID_RE, CUSTOMERS_IN_CHUNK, CUSTOMERS_OVERVIEW_NO_MATCH_ID, DEAL_PRE_CONTRACT_SLUGS_STAFF, DEAL_REPORT_BUCKET_VALUES, DEFAULT_CHECKLISTS, DEFAULT_DEADLINE_BUCKETS, DEFAULT_PIPELINE_STAGE_SLA_DAYS, FOLLOWUP_TIME_BUCKETS, PDFDocument, QUOTATIONS_SOURCE_EXCEL_COLS, Router, SCAN_DUP_LITE_SELECT, STAFF_LEAD_DEAL_REPORT_ROLES, SURVEY_EVENT_SELECT, SURVEY_EVENT_TYPES, XLSX, ZALO_APP_SETTING_KEY, crmSchemaCompat, addPhoneToAutoLeadBlocklist, aggregateCrmCommentReactions, aggregateOrgReportRows, appendFulfillmentChildTasksForMasterDeal, applyAllActiveWorkshopTemplatesForArea, applyAssigneesToInsertedCrmTasks, applyCrmLeadRegionFilterToQuery, applyCrmTaskTemplatesToCompanyRegions, applyCustomerIdInFilter, applyCustomersOverviewSearch, applyDefaultWorkshopTemplatesForNewProject, applyLeadOrCustomerSalesFilter, applyProductionTemplateToFulfillmentLead, applyProductionTemplatesOnPipelineEnter, applyStageIdFilterToQuery, applyWorkshopTemplateToProject, artifactNamePrefix, assertCanFlagLead, assertCategoryFitsSource, assertCrmAssigneeUserMatchesLeadCompany, assertCrmEmployeeDeleteAllowed, assertCrmStageAdvanceAllowed, assertDealCrmManualStageChange, assertDealResponsible, assertDivisionAllowedForCompany, assertLeadDocumentOwner, assertLeadReadableByRegionScope, assertRegionBelongsToCompany, assertUserCanAssignCrmRegion, assignProductionCompanyDealResponsibility, attachAssigneesToCrmTasks, attachAssignmentIdsToCrmTasks, attachCrmNextOpenTaskDeadline, attachLeadNewFlagForList, attachLeadReplyParents, attachLeadUserFlagsForList, auth, autoCreateProjectFromWonDeal, autoFlowFns, autoGenCrmTasksForNewLead, buildAssignmentNotificationInsert, buildChecklistLeadDocumentRow, buildCrmDashboardMinimalKpis, buildCrmLeadsRpcFilterParams, buildCustomersOverviewSummary, buildDealTemplateData, buildDefaultDeadlineConfig, buildFirstStageIdByPipeline, buildPipelineStagesMap, buildProcessedCommercialItems, buildQuotedStageOrderByPipeline, buildScanDuplicateGroups, buildWonStageOrderByPipeline, canUserViewDocByAllowlist, chatUpload, chunkArray, classifyDealStageForStaffReport, commentsTableMissing, companyRegionExtraColumnsMissing, companyRegionGeoColumnsMissing, computeCrmDashboardLightStats, computeCrmLiveVersionMs, computeCustomersOverviewSummary, computeIsNewLeadForUser, computeOrgOverviewReportData, computeStaffLeadDealReportData, computeStaffPipelineDetailPayload, countOpenOverdueCrmTasksForLeadIds, createCrmAssignment, createCrmLeadTask, createFulfillmentChildDeal, createNotif, createNotification, createProjectFromLead, crmExecutorFieldsFromTemplateItem, crmLeadCommentAttachmentsColumnMissing, crmLeadCommentReadReceiptsTableMissing, crmLeadRowVisibleToRequestUser, crmListUsesLegacyFilters, crmNoteActivityUpload, crmReportAsOfMs, crmReportCreatedAtFromIso, crmReportCreatedAtToIso, crmReportDayKeyVn, crmRouteErrorText, crmTaskDeadlineModuleKey, crmTaskMeetsCompletionRequirements, crmTaskMeetsRequiredFileTypes, crmTaskRequiresCompletionEvidence, crmTemplateMatchesLeadType, deadlineToDateOnlyIso, defaultCompanyInfo, defaultKpiLedgerMonthStartYmd, deleteCrmLeadTask, deleteMirroredAssignmentFileForTaskAttachment, duplicateLeadIdsFromLiteRows, ecosystemModuleKeyForCrmDeadline, effectivePipelineStageSlaDays, emitCrmBadgeUpdateForProject, emitCrmDashboardChanged, emitCrmTaskChanged, emptyStaffLeadDealAgg, endOfCalendarDayAfterEntered, enforceCommercialDocCompanyOnWrite, enforceQuotaForRequest, ensureDealLeadDocumentsForModuleTransition, ensureDefaultCrmPipelineForCompany, ensureMissingCrmTasksForLead, ensureMissingCrmTasksForPipelineStage, ensureMissingSxTasksForLead, excelUpload, executeLeadMerge, executeZaloDealStageNotify, fetchActivityCustomerIds, fetchAllLeadsForSlaWatchlist, fetchAssignmentForTask, fetchCrmCommentReactionsAggregate, fetchCrmLeadCommentNotifyUserIds, fetchCrmLeadDetailRow, fetchCrmLeadWithPipelineBadges, fetchCrmLeadsByIdsOrdered, fetchCrmLeadsForDashboardBatched, fetchCrmLeadsForOrgReportBatched, fetchCrmLeadsForUserDetailBatched, fetchCrmLeadsLiteForDuplicateScan, fetchCrmLeadsPageViaRpc, fetchCrmPipelineZaloSlice, fetchCrmSurveyEventsChunk, fetchCrmSurveyVisitsForOrgReport, fetchLeadCommentAudienceMembers, fetchLeadCommentAudienceMembersForRead, fetchLeadIdsForCrmRegion, fetchLeadMentionMembers, fetchOrgActivityFeed, fetchPipelineWithStagesById, fetchScopedCrmBundles, fillTemplateDataFromStructure, filterCrmTasksForLeadType, filterUserIdsForCrmLeadScopedNotification, findChecklistItem, followupDismissExpiresAt, fontBold, fontRegular, formatMoney, formatVNDPdf, formatVnPhoneLocal0From84, fs, generateDocPdf, generateFlowTasks, generateStepTasks, getAppSettingValue, getCompanyInfo, getCompanyRegionsList, getCrmLeadListSelect, getCrmLeadRegionConstraint, getCrmLeadTypesList, getCrmLeadsListLegacy, getCrmSourceCategoriesList, getCrmSourcesList, getDefaultCrmAttachmentShare, getDefaultDealZaloTemplateStructure, getDefaultLeadDocumentShareForDeal, getDefaultPipelineIdForCompany, getLeadDocumentFieldsFromCrmTask, getNotifyTargets, getOverdueFollowUps, getPipelineIdForCompanyRegion, getPipelineZaloSlice, getPipelinesList, getProjectCRMSummary, getStagesByPipelineId, getStaleLeads, getZaloNotifySettings, hydrateCrmLeadsByIdsWithStaff, hydrateCrmLeadsRpcPage, hydrateScanDuplicateLeads, insertQuotationRow, invalidateAppSettingKey, invalidatePipelinesAndStages, invalidateRegions, invalidateSources, invalidateTenantUsageCache, invokeCrmLeadsStageCountsRpc, isAdminLike, isAllowedLeadCommentAttachmentUrl, isChotSanXuatCrmTaskTitle, isCrmCompanyAdminUser, isCrmDealAssigneeLocked, isCrmLeadTypeColorMissingError, isCrmModuleAdmin, isCrmPipelinesTableMissingError, isCrmRegionAdminUser, isCrmSystemAdminUser, isDealStageHoanThanhForZalo, isDefaultAssigneeIdsColumnError, isExecutorColumnError, isPlatformAdmin, isPostgresUniqueViolation, isQuotationsSourceExcelColumnMissingError, isSxRelationshipError, isSystemAdmin, isUuidString, isValidDealZaloTemplateStructure, isVcRelationshipError, isVptCompanyCommercialDocViewer, lastNominatimGeocodeAt, leadChatFilesMulter, leadChatJsonOrFiles, listQuotationExcelSheets, loadCrmTaskAttachmentCountMap, loadOrgReportStageMap, loadZaloLinkedLeadIdSet, logDealActivityComment, logDealDeadlineChangeComment, logDealStageChangeComment, logKanbanDeadlineUnifiedHistory, logLeadCommentMentionActivity, logProjectFileActivity, mapCustomerOverviewRow, mapLeadDisplayPhone, mapQuotationItemsToOrderRows, maskCustomerPhoneDisplay, maskZaloAccessTokenPreview, maybeSendZaloOnDealStageEnter, mergeCrmStageDefaultAssigneeIntoUpdates, mergeCustomerIntoTarget, misaService, multer, nextCode, nextTbProjectCode, normalizeCrmActivityAttachments, normalizeCrmLeadCommentAttachments, normalizeCrmStageDefaultAssigneeUserId, normalizeCrmUserRole, normalizeLeadSeenByKeys, normalizeOrgReportSurveyVisitRow, normalizePipelineStageSlaDaysForDb, normalizePipelineStagesList, normalizeRegionIdList, normalizeTemplateChecklistForCrmTask, normalizeTemplateItemAssigneeIds, normalizeTimestamp, normalizeTitleFold, normalizeVnPhoneTo84, notifyDealCommentMentions, notifyDealCommentParticipants, notifyMultiple, notifyMultipleShared, notifyNewCrmAssignmentAssignees, notifyProductionDocumentUploaded, onLeadWon, onOrderConfirmed, onProjectCompleted, onQuotationAccepted, orgReportAttachFirstStageRates, orgReportBumpFirstStageMetrics, orgReportBumpMetrics, orgReportBumpOpenOverdue, orgReportBumpReceptionMetrics, orgReportCancelRatePct, orgReportClosedWonDealCount, orgReportClosedWonValue, orgReportCompareSummary, orgReportConversionRate, orgReportDayKey, orgReportDealCloseValueRatePct, orgReportDealCountsExpected, orgReportDealIsClosedWon, orgReportDealIsCompleted, orgReportDealIsQuotedOrAfter, orgReportDealProbability, orgReportDealSplitBuckets, orgReportExtendedDealMetrics, orgReportFirstStageOnTimeRatePct, orgReportFirstStageOverdueRatePct, orgReportIsReceptionOverdue, orgReportIsSlaOverdue, orgReportKpiPeriodStart, orgReportNumEst, orgReportOverdueRatePct, orgReportOwnerId, orgReportPctDelta, orgReportPreviousPeriod, orgReportQuoteValueCloseRatePct, orgReportQuoteWinRatePct, orgReportReceptionOverdueRatePct, orgReportReceptionSlaMinutes, orgReportStageIsClosed, orgReportStageIsLostOrCancelled, orgReportTotalDealCount, parseChecklist, parseCrmLeadsPageRpc, parseCrmReportDateRange, parseCrmStageCountsNumericMap, parseCrmStageCountsRpc, parseExcelMoneyFromMappedColumn, parseLeadIdUuidList, parseLeadIdsCsvQuery, parseLeadIdsFromBody, parseLeadSeenByRaw, parseQuotationExcelBuffer, parseStageIdsFromQuery, parseUuidArrayJsonb, parseVietnameseMeasure, parseVietnameseMoney, path, persistAssignmentNotification, pgCrmDuplicateLeadIds, pickDealZaloTemplatePayload, pipeOrgOverviewReportPdf, pipeStaffLeadDealSummaryPdf, pipeStaffPipelineDetailPdf, pipelineHasExplicitCompleted, pipelineHasExplicitExpected, pipelineHasExplicitWon, plannerTableMissing, postCrmStageDefaultAssigneeComment, primaryTemplateItemAssigneeId, rcInvalidateTags, reactionsTableMissing, redactCrmTaskNotesForViewer, regionGeocodeInflight, repairCrmDealPipelineDisplay, requireUserCompanyId, requireUserCompanyIdResolved, resolveAssignmentIdForTask, resolveCanonicalCrmLeadId, resolveCommercialDocListCompanyScope, resolveCrmBundleTemplateScope, resolveCrmLeadsDeadlinesMap, resolveCrmLeadsKanbanLite, resolveCrmLeadsMergedQuery, resolveCrmLeadsSkipDeadline, resolveCrmLedgerNetByLeadIdsPayload, resolveCrmReportScope, resolveCrmTaskWriteLeadId, resolveExecutorCompanyId, resolveKanbanStagesForCompany, resolveLeadCommentMentionIds, resolveProductionCompanyForDealStage, resolveProductionHandoverResponsibleUserId, resolveReopenTargetStageId, resolveRpcRegionIdsForCrmList, resolveTenantIdForQuota, resolveZaloDealTemplateId, respondIfCrmPipelinesTableMissing, responseCache, restoreCrmTaskChecklistFromWorkshopTemplate, resyncCrmPipelineTasksForLead, syncCrmTasksAfterPipelineChange, sanitizeIsoDateQueryParam, scheduleRegionGeocoding, scopedAdminCompanyId, scopedCrmCompanyIdForWrite, sendZaloTemplateMessage, setLeadFlag, shallowMergeTemplateData, skipSxWorkQuickComplete, snapshotOrderRowFromQuotation, stripCrmAssigneeFromWonStageUpdates, stripCrmLeadTypeColorFromSelect, stripQuotationsSourceExcelFields, sumCrmKpiLedgerNetByLeadIds, sumCrmKpiLedgerNetByUserForOrgReport, sumCrmKpiLedgerNetByUserIds, sumCrmKpiLedgerNetByUserIdsInDateRange, supabase, syncAllTaskArtifactsToAssignment, syncChecklistItemNotes, syncCrmLeadSxPipelineFromProject, syncQuotationDepositToDealAndProject, syncSxKanbanFromCrmProductionStage, syncTaskAttachmentToAssignment, templateItemAssigneePatch, toCrmTaskChecklist, unifyCrmLeadResponsibleFields, updateCrmLeadTask, updateQuotationRow, upsertZaloNotifySettings, userCanAccessCrmLeadAsParticipant, userCanAccessCrmLeadViaVisibility, userCanAssignAnyCrmRegion, userCanBypassCrmDeleteRestriction, userHasSeenLeadInSeenBy, userIsAdmin, userIsCrmCompanyOrRegionAdmin, userMayAccessQuotationRow, userSeesAllCrmDeals, userSeesAllCrmDealsForScope, userSeesAllCrmLeads, userSeesAllCrmLeadsForScope, uuidQueryOrNull, validateProductionCompanyId) {
r.post('/leads', async (req, res) => {
  try {
    const code = await nextCode('LEAD');
    const body = { ...req.body };
    delete body.priority; // crm_leads không có cột priority
    ['customer_id', 'source_id', 'stage_id', 'assigned_to', 'company_id', 'pipeline_id', 'lead_type_id', 'region_id'].forEach(f => {
      if (body[f] === '' || body[f] === undefined) body[f] = null;
    });
    if (!body.assigned_to) body.assigned_to = req.user.userId;
    if (!userSeesAllCrmLeadsForScope(req.user)) body.assigned_to = req.user.userId;
    body.lead_owner_id = body.assigned_to;

    const lockedLeadCo = scopedCrmCompanyIdForWrite(req);
    if (lockedLeadCo) {
      if (body.company_id && String(body.company_id) !== String(lockedLeadCo)) {
        return res.status(403).json({ error: 'Không tạo lead/deal cho công ty khác' });
      }
      body.company_id = lockedLeadCo;
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      body.company_id = cid;
    }

    // Resolve pipeline_id + first stage by company (company-scoped pipelines)
    if (!body.company_id) return res.status(400).json({ error: 'Vui lòng chọn công ty' });

    if (await enforceQuotaForRequest(req, res, body.company_id, 'leads_per_month')) return;

    if (body.region_id) {
      const v = await assertRegionBelongsToCompany(supabase, body.company_id, body.region_id);
      if (!v.ok) return res.status(400).json({ error: v.error });
      const ar = assertUserCanAssignCrmRegion(req, body.region_id);
      if (!ar.ok) return res.status(403).json({ error: ar.error });
    } else {
      const { data: defR } = await supabase
        .from('company_regions')
        .select('id')
        .eq('company_id', body.company_id)
        .eq('is_active', true)
        .order('order_index')
        .limit(1)
        .maybeSingle();
      body.region_id = defR?.id || null;
    }
    if (!body.pipeline_id) {
      // Ưu tiên pipeline riêng của khu vực (nếu công ty đã tách pipeline theo khu vực);
      // không có thì rơi về pipeline mặc định của công ty.
      body.pipeline_id = body.region_id
        ? await getPipelineIdForCompanyRegion(body.company_id, body.region_id)
        : null;
      if (!body.pipeline_id) {
        body.pipeline_id = await ensureDefaultCrmPipelineForCompany(body.company_id);
      }
    }
    if (body.pipeline_id) {
      const { data: pl } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', body.pipeline_id).maybeSingle();
      if (!pl) return res.status(400).json({ error: 'Pipeline không tồn tại' });
      if (String(pl.company_id || '') !== String(body.company_id || '')) return res.status(400).json({ error: 'Pipeline không thuộc công ty đã chọn' });
      if (!body.stage_id) {
        const { data: firstStage } = await supabase
          .from('crm_pipeline_stages')
          .select('id')
          .eq('pipeline_id', body.pipeline_id)
          .eq('pipeline_type', 'lead')
          .eq('is_active', true)
          .order('order_index')
          .limit(1)
          .maybeSingle();
        body.stage_id = firstStage?.id || null;
      }
    }

    if (body.lead_type_id) {
      const { data: lt } = await supabase.from('crm_lead_types').select('id, company_id, applies_to, is_active').eq('id', body.lead_type_id).maybeSingle();
      if (!lt) return res.status(400).json({ error: 'Loại Lead/Deal không tồn tại' });
      if (String(lt.company_id || '') !== String(body.company_id || '')) return res.status(400).json({ error: 'Loại không thuộc công ty đã chọn' });
      if (lt.is_active === false) return res.status(400).json({ error: 'Loại đang bị ẩn' });
      if (lt.applies_to && !['lead','both'].includes(String(lt.applies_to))) return res.status(400).json({ error: 'Loại này không áp dụng cho Lead' });
    }

    if (Object.prototype.hasOwnProperty.call(body, 'referrer_name')) {
      const { resolveReferrerNameForLead } = require('../../../helpers/crmReferrers');
      body.referrer_name = await resolveReferrerNameForLead({
        companyId: body.company_id,
        referrerName: body.referrer_name,
        userId: req.user.userId,
      });
    }

    const { data, error } = await supabase.from('crm_leads')
      .insert({ ...body, code, type: 'lead', lead_owner_id: body.assigned_to, created_by: req.user.userId, stage_entered_at: new Date().toISOString() })
      .select('*, customer:customers(id, full_name, phone), stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, color, icon)')
      .single();
    if (error) throw error;

    try {
      const tid = await resolveTenantIdForQuota(req, data.company_id);
      if (tid) invalidateTenantUsageCache(tid);
    } catch (_) {}

    try {
      const targetIds = new Set();
      if (body.assigned_to) targetIds.add(body.assigned_to);
      const adminIds = await getCompanyScopedAdminIds(data.company_id || body.company_id);
      adminIds.forEach((id) => targetIds.add(id));
      if (targetIds.size) await notifyMultiple(req, [...targetIds], 'lead_created',
        '🆕 Lead mới',
        `Lead "${body.title}" — Mã: ${code}`,
        'crm_lead', data.id, { ecosystem_module_key: 'crm', company_id: data.company_id || body.company_id || null });
    } catch (ne) { console.warn('[NOTIFY] lead_created:', ne.message); }

    try {
      await autoGenCrmTasksForNewLead(data.id, req.user.userId, req);
    } catch (autoErr) { console.error('Auto-create tasks error:', autoErr.message); }

    // Lead: toàn bộ nhiệm vụ trên chính lead (không Đơn 1 / deal con).

    emitCrmDashboardChanged(req, { type: 'lead', company_id: data.company_id, lead_id: data.id, action: 'created' });
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/deals', async (req, res) => {
  try {
    const body = { ...req.body };
    delete body.priority; // crm_leads không có cột priority
    const applyWorkshopSxFromBody =
      body.apply_workshop_production_tasks === true || body.apply_workshop_production_tasks === 'true';
    delete body.apply_workshop_production_tasks;

    ['customer_id', 'source_id', 'stage_id', 'assigned_to', 'company_id', 'pipeline_id', 'lead_type_id', 'region_id'].forEach(f => {
      if (body[f] === '' || body[f] === undefined) body[f] = null;
    });

    if (!body.title) return res.status(400).json({ error: 'Nhập tên Deal' });
    const lockedDealCo = scopedCrmCompanyIdForWrite(req);
    if (lockedDealCo) {
      if (body.company_id && String(body.company_id) !== String(lockedDealCo)) {
        return res.status(403).json({ error: 'Không tạo deal cho công ty khác' });
      }
      body.company_id = lockedDealCo;
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      body.company_id = cid;
    }
    if (!body.company_id) return res.status(400).json({ error: 'Vui lòng chọn công ty' });

    if (await enforceQuotaForRequest(req, res, body.company_id, 'deals_per_month')) return;

    if (body.region_id) {
      const v = await assertRegionBelongsToCompany(supabase, body.company_id, body.region_id);
      if (!v.ok) return res.status(400).json({ error: v.error });
      const ar = assertUserCanAssignCrmRegion(req, body.region_id);
      if (!ar.ok) return res.status(403).json({ error: ar.error });
    } else {
      const { data: defR } = await supabase
        .from('company_regions')
        .select('id')
        .eq('company_id', body.company_id)
        .eq('is_active', true)
        .order('order_index')
        .limit(1)
        .maybeSingle();
      body.region_id = defR?.id || null;
    }

    if (!body.assigned_to) body.assigned_to = req.user.userId;
    if (!userSeesAllCrmDealsForScope(req.user)) body.assigned_to = req.user.userId;
    body.lead_owner_id = body.assigned_to;

    // Resolve pipeline_id + first stage by company (company-scoped pipelines)
    if (!body.pipeline_id) {
      // Ưu tiên pipeline riêng của khu vực (nếu công ty đã tách pipeline theo khu vực);
      // không có thì rơi về pipeline mặc định của công ty.
      body.pipeline_id = body.region_id
        ? await getPipelineIdForCompanyRegion(body.company_id, body.region_id)
        : null;
      if (!body.pipeline_id) {
        body.pipeline_id = await ensureDefaultCrmPipelineForCompany(body.company_id);
      }
    }
    if (!body.pipeline_id) return res.status(500).json({ error: 'Công ty chưa có pipeline CRM' });
    const { data: pl } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', body.pipeline_id).maybeSingle();
    if (!pl) return res.status(400).json({ error: 'Pipeline không tồn tại' });
    if (String(pl.company_id || '') !== String(body.company_id || '')) return res.status(400).json({ error: 'Pipeline không thuộc công ty đã chọn' });

    const { data: firstStage } = await supabase
      .from('crm_pipeline_stages')
      .select('id')
      .eq('pipeline_id', body.pipeline_id)
      .eq('pipeline_type', 'deal')
      .eq('is_active', true)
      .order('order_index')
      .limit(1)
      .maybeSingle();
    if (!firstStage) return res.status(500).json({ error: 'Không tìm thấy giai đoạn Deal đầu tiên trong pipeline này' });

    let leadTypeTriggersWorkshopSx = false;
    if (body.lead_type_id) {
      const { data: lt } = await supabase
        .from('crm_lead_types')
        .select('id, company_id, applies_to, is_active, workshop_production_templates')
        .eq('id', body.lead_type_id)
        .maybeSingle();
      if (!lt) return res.status(400).json({ error: 'Loại Lead/Deal không tồn tại' });
      if (String(lt.company_id || '') !== String(body.company_id || '')) return res.status(400).json({ error: 'Loại không thuộc công ty đã chọn' });
      if (lt.is_active === false) return res.status(400).json({ error: 'Loại đang bị ẩn' });
      if (lt.applies_to && !['deal','both'].includes(String(lt.applies_to))) return res.status(400).json({ error: 'Loại này không áp dụng cho Deal' });
      leadTypeTriggersWorkshopSx = !!lt.workshop_production_templates;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'referrer_name')) {
      const { resolveReferrerNameForLead } = require('../../../helpers/crmReferrers');
      body.referrer_name = await resolveReferrerNameForLead({
        companyId: body.company_id,
        referrerName: body.referrer_name,
        userId: req.user.userId,
      });
    }

    const code = await nextCode('DEAL');
    const { data, error } = await supabase.from('crm_leads')
      .insert({
        ...body,
        code,
        type: 'deal',
        stage_id: body.stage_id || firstStage.id,
        lead_owner_id: body.assigned_to,
        created_by: req.user.userId,
        stage_entered_at: new Date().toISOString(),
      })
      .select('*, customer:customers(id, full_name, phone), stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, color, icon)')
      .single();
    if (error) throw error;

    try {
      const tid = await resolveTenantIdForQuota(req, data.company_id);
      if (tid) invalidateTenantUsageCache(tid);
    } catch (_) {}

    try {
      const targetIds = new Set();
      if (body.assigned_to) targetIds.add(body.assigned_to);
      const adminIds = await getCompanyScopedAdminIds(data.company_id || body.company_id);
      adminIds.forEach((id) => targetIds.add(id));
      if (targetIds.size) await notifyMultiple(req, [...targetIds], 'deal_created',
        '🎯 Deal mới',
        `Deal "${body.title}" — Mã: ${code} — GT: ${formatMoney(body.estimated_value)}`,
        'crm_deal', data.id, { ecosystem_module_key: 'crm', company_id: data.company_id || body.company_id || null });
    } catch (ne) { console.warn('[NOTIFY] deal_created:', ne.message); }

    try {
      await autoGenCrmTasksForNewLead(data.id, req.user.userId, req);
    } catch (autoErr) { console.error('Auto-create tasks on deal create error:', autoErr.message); }

    // Nhiệm vụ SX (sx_*) từ workshop_task_templates — khi loại Deal bật cờ hoặc client gửi apply_workshop_production_tasks.
    if (applyWorkshopSxFromBody || leadTypeTriggersWorkshopSx) {
      try {
        const gate = await validateProductionCompanyId(data.company_id);
        if (gate.ok) {
          const targetLeadId = await resolveCrmTaskWriteLeadId(data.id);
          await applyProductionTemplateToFulfillmentLead({
            req,
            leadId: targetLeadId,
            createdBy: req.user.userId,
            assigneeId: data.assigned_to || data.lead_owner_id || null,
            force: false,
          });
        }
      } catch (sxErr) {
        console.warn('[POST /deals] workshop production templates:', sxErr.message);
      }
    }

    // Một deal duy nhất; task CRM trên deal đó — không tự tạo đơn «Đơn 1» hay deal con.

    emitCrmDashboardChanged(req, { type: 'deal', company_id: data.company_id, lead_id: data.id, action: 'created' });
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Id các deal khách hàng đã có đơn phát sinh (để tô màu thẻ Kanban). */
r.get('/deals/spawn-source-ids', async (req, res) => {
  try {
    const companyId = String(req.query.company_id || '').trim() || null;
    const sac = scopedAdminCompanyId(req);
    const scopeCo = sac || companyId || null;

    let q = supabase
      .from('crm_leads')
      .select('source_customer_deal_id')
      .not('source_customer_deal_id', 'is', null)
      .eq('type', 'deal');
    if (scopeCo) q = q.eq('company_id', scopeCo);

    const { data, error } = await q.limit(5000);
    if (error && /source_customer_deal_id/i.test(String(error.message || ''))) {
      return res.json({ ids: [] });
    }
    if (error) throw error;

    const ids = [...new Set((data || []).map((r) => String(r.source_customer_deal_id || '')).filter(Boolean))];
    res.json({ ids });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Lỗi tải danh sách deal gốc phát sinh' });
  }
});

/** Tạo deal đơn hàng phát sinh từ deal khách hàng — cột đầu tab Khách hàng. */
r.post('/deals/:id/spawn-additional', async (req, res) => {
  try {
    const parentId = String(req.params.id || '').trim();
    if (!CRM_UUID_RE.test(parentId)) {
      return res.status(400).json({ error: 'Id deal không hợp lệ' });
    }
    const title = String(req.body?.title || '').trim();
    if (!title) return res.status(400).json({ error: 'Nhập tên deal phát sinh' });
    const notes = String(req.body?.notes || '').trim() || null;

    const { data: parentDeal, error: pErr } = await supabase
      .from('crm_leads')
      .select('id, type, code, title, customer_id, company_id, pipeline_id, stage_id, assigned_to, lead_owner_id, estimated_value, parent_lead_id, project_id, region_id, phone, install_address, lead_type_id, source_id')
      .eq('id', parentId)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!parentDeal) return res.status(404).json({ error: 'Không tìm thấy deal nguồn' });
    if (parentDeal.type !== 'deal') {
      return res.status(400).json({ error: 'Chỉ tạo đơn hàng phát sinh từ deal' });
    }
    if (parentDeal.parent_lead_id) {
      return res.status(400).json({ error: 'Không tạo phát sinh từ deal fulfillment (deal con)' });
    }

    const sac = scopedAdminCompanyId(req);
    if (sac && String(parentDeal.company_id || '') !== String(sac)) {
      return res.status(403).json({ error: 'Không có quyền' });
    }
    const ar = assertLeadReadableByRegionScope(req, parentDeal);
    if (!ar.ok) return res.status(403).json({ error: ar.error });

    const created = await createAdditionalCustomerDeal({
      parentDeal,
      title,
      notes,
      userId: req.user.userId,
    });

    try {
      await autoGenCrmTasksForNewLead(created.id, req.user.userId, req);
    } catch (autoErr) {
      console.warn('[spawn-additional] auto tasks:', autoErr.message);
    }

    emitCrmDashboardChanged(req, {
      type: 'deal',
      company_id: created.company_id || parentDeal.company_id,
      lead_id: created.id,
      action: 'created',
    });

    res.status(201).json({
      ...created,
      source_customer_deal_id: created.source_customer_deal_id || parentDeal.id,
      source_deal: { id: parentDeal.id, code: parentDeal.code, title: parentDeal.title },
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Lỗi tạo deal phát sinh' });
  }
});

/** Danh sách deal đơn hàng phát sinh gắn deal khách hàng nguồn. */
r.get('/deals/:id/spawned-additional', async (req, res) => {
  try {
    const parentId = String(req.params.id || '').trim();
    if (!CRM_UUID_RE.test(parentId)) {
      return res.status(400).json({ error: 'Id deal không hợp lệ' });
    }

    const { data: parentDeal, error: pErr } = await supabase
      .from('crm_leads')
      .select('id, type, company_id, region_id, assigned_to, lead_owner_id, parent_lead_id')
      .eq('id', parentId)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!parentDeal) return res.status(404).json({ error: 'Không tìm thấy deal' });

    const sac = scopedAdminCompanyId(req);
    if (sac && String(parentDeal.company_id || '') !== String(sac)) {
      return res.status(403).json({ error: 'Không có quyền' });
    }
    const ar = assertLeadReadableByRegionScope(req, parentDeal);
    if (!ar.ok) return res.status(403).json({ error: ar.error });

    let { data: rows, error } = await supabase
      .from('crm_leads')
      .select('id, code, title, created_at, stage_id, estimated_value, stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, color, is_won, is_lost)')
      .eq('source_customer_deal_id', parentId)
      .eq('type', 'deal')
      .order('created_at', { ascending: false });

    if (error && /source_customer_deal_id/i.test(String(error.message || ''))) {
      return res.json({ items: [], parent_id: parentId });
    }
    if (error && /crm_pipeline_stages|relationship/i.test(String(error.message || ''))) {
      ({ data: rows, error } = await supabase
        .from('crm_leads')
        .select('id, code, title, created_at, stage_id, estimated_value')
        .eq('source_customer_deal_id', parentId)
        .eq('type', 'deal')
        .order('created_at', { ascending: false }));
    }
    if (error) throw error;

    res.json({
      parent_id: parentId,
      items: rows || [],
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Lỗi tải đơn hàng phát sinh' });
  }
});

r.get('/leads/:id/inbox-links', async (req, res) => {
  try {
    const leadId = String(req.params.id || '').trim();
    if (!leadId) return res.status(400).json({ error: 'Thiếu lead id' });
    const { data: lead } = await supabase
      .from('crm_leads')
      .select(`
        id, company_id, customer_id, title, description,
        customer:customers(id, source),
        source:crm_sources(id, name)
      `)
      .eq('id', leadId)
      .maybeSingle();
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy lead/deal' });
    const ar = assertLeadReadableByRegionScope(req, lead);
    if (!ar.ok) return res.status(403).json({ error: ar.error });
    const { resolveLeadInboxLinks } = require('../../../helpers/crmLeadInboxChannel');
    const links = await resolveLeadInboxLinks(supabase, leadId, lead);
    res.json(links);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/leads/:id/badge', async (req, res) => {
  try {
    const data = await fetchCrmLeadWithPipelineBadges(req.params.id);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/leads/:id/repair-pipeline-display', async (req, res) => {
  try {
    const leadId = String(req.params.id || '').trim();
    const { data: lead } = await supabase
      .from('crm_leads')
      .select('id, type, company_id')
      .eq('id', leadId)
      .maybeSingle();
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy deal' });
    const sac = scopedAdminCompanyId(req);
    if (sac && String(lead.company_id || '') !== String(sac)) {
      return res.status(403).json({ error: 'Không có quyền' });
    }
    const ar = assertLeadReadableByRegionScope(req, lead);
    if (!ar.ok) return res.status(403).json({ error: ar.error });

    const result = await repairCrmDealPipelineDisplay(leadId);
    if (!result.ok) return res.status(400).json(result);

    let refreshed = null;
    try {
      refreshed = await fetchCrmLeadWithPipelineBadges(leadId);
    } catch (_) {
      /* optional */
    }
    const io = req.app.get('io');
    if (io && result.project_id) {
      await emitCrmBadgeUpdateForProject(result.project_id, io);
    }
    res.json({ ...result, lead: refreshed });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Lỗi sửa hiển thị pipeline' });
  }
});

r.get('/leads/:id', async (req, res) => {
  try {
    const rawId = String(req.params.id || '').trim();
    if (!rawId) return res.status(400).json({ error: 'Thiếu id' });
    // Reserved / không phải UUID (vd. path nhầm /leads/stage-counts) → 400, không 500 Postgres.
    if (!CRM_UUID_RE.test(rawId)) {
      return res.status(400).json({ error: 'Id lead/deal không hợp lệ', requested_id: rawId });
    }
    const canonicalId = (await resolveCanonicalCrmLeadId(rawId)) || rawId;
    const baseFields = 'id, title, type, company_id, pipeline_id, stage_id, assigned_to, lead_owner_id, created_by, parent_lead_id, use_order_tasks, sx_template_company_id, project_id, deposit_amount, deposit_received, deposit_label, deposit_installments';
    const projectEmbed = ', linked_project:projects!crm_leads_project_id_fkey(id, code, name, order_date, delivery_date, production_deadline)';
    let { data, error } = await supabase
      .from('crm_leads')
      .select(`${baseFields}${projectEmbed}`)
      .eq('id', canonicalId)
      .maybeSingle();
    if (error && /order_date|delivery_date|linked_project|column/i.test(String(error.message || ''))) {
      ({ data, error } = await supabase
        .from('crm_leads')
        .select(`${baseFields}, linked_project:projects!crm_leads_project_id_fkey(id, code, name, production_deadline)`)
        .eq('id', canonicalId)
        .maybeSingle());
    }
    if (error && /linked_project|relationship/i.test(String(error.message || ''))) {
      ({ data, error } = await supabase
        .from('crm_leads')
        .select(baseFields)
        .eq('id', canonicalId)
        .maybeSingle());
    }
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Không tìm thấy lead/deal' });
    const sacLdLite = scopedAdminCompanyId(req);
    if (sacLdLite && String(data.company_id || '') !== String(sacLdLite)) {
      return res.status(403).json({ error: 'Không có quyền xem lead/deal của công ty khác' });
    }
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/leads/:id/detail', async (req, res) => {
  try {
    const rawId = String(req.params.id || '').trim();
    const canonicalId = (await resolveCanonicalCrmLeadId(rawId)) || rawId;
    let { data, error } = await fetchCrmLeadDetailRow(canonicalId);
    if (error?.code === 'PGRST116') {
      return res.status(404).json({
        error: 'Không tìm thấy lead/deal',
        hint: 'Dùng đúng crm_leads.id (UUID deal/lead). Nếu đang mở từ dự án, dùng deal gắn project_id; nếu từ đơn hàng con, dùng fulfillment_lead_id.',
        requested_id: rawId,
      });
    }
    if (error || !data) {
      throw new Error(error?.message || (typeof error === 'string' ? error : 'Không tải được chi tiết lead/deal'));
    }
    const sacLd = scopedAdminCompanyId(req);
    if (sacLd && String(data.company_id || '') !== String(sacLd)) {
      return res.status(403).json({ error: 'Không có quyền xem lead/deal của công ty khác' });
    }
    const arLd = assertLeadReadableByRegionScope(req, data);
    if (!arLd.ok) return res.status(403).json({ error: arLd.error });
    const uid = req.user?.userId;
    if (uid) {
      const key = String(uid).trim().toLowerCase();
      const curNorm = normalizeLeadSeenByKeys(data.lead_seen_by);
      if (!curNorm[key]) {
        const next = { ...curNorm, [key]: new Date().toISOString() };
        const { error: uerr } = await supabase.from('crm_leads').update({ lead_seen_by: next }).eq('id', canonicalId);
        if (uerr) console.warn('[crm/leads/:id/detail] lead_seen_by update:', uerr.message);
        if (!uerr) data.lead_seen_by = next;
      }
    }
    delete data.lead_seen_by;
    // Per-user flags (ghim / đã tương tác) cho user hiện tại.
    try {
      const flags = await require('../../../helpers/crmLeadUserFlags').fetchFlagsByLeadIds(uid, [canonicalId]);
      const f = flags.get(String(canonicalId));
      data.is_pinned = !!f?.is_pinned;
      data.pinned_at = f?.pinned_at || null;
      data.is_interacted = !!f?.is_interacted;
      data.interacted_at = f?.interacted_at || null;
    } catch (e) {
      // BC: bảng chưa migrate → mặc định false.
      data.is_pinned = false;
      data.pinned_at = null;
      data.is_interacted = false;
      data.interacted_at = null;
    }
    try {
      const { resolveLeadInboxChannel } = require('../../../helpers/crmLeadInboxChannel');
      data.inbox_channel = await resolveLeadInboxChannel(supabase, canonicalId, data);
    } catch (e) {
      data.inbox_channel = null;
    }
    try {
      const { listDealProductionProjects } = require('../../../helpers/autoDealWonProject');
      data.production_projects = await listDealProductionProjects(canonicalId);
    } catch (e) {
      console.warn('[crm/leads/:id/detail] production_projects:', e.message);
      data.production_projects = data.project_id
        ? [{ project_id: data.project_id, is_primary: true }]
        : [];
    }
    try {
      const srcId = data.source_customer_deal_id || null;
      if (srcId) {
        const { data: src } = await supabase
          .from('crm_leads')
          .select('id, code, title, type')
          .eq('id', srcId)
          .maybeSingle();
        data.source_customer_deal = src || { id: srcId };
      } else {
        data.source_customer_deal = null;
      }
    } catch (_) {
      data.source_customer_deal = null;
    }
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/leads/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data: oldLead } = await supabase.from('crm_leads').select('assigned_to, lead_owner_id, title, type, company_id, region_id, stage_id, pipeline_id, project_id, sx_handover_at').eq('id', id).single();
    const sacPut = scopedAdminCompanyId(req);
    if (sacPut) {
      if (!oldLead || String(oldLead.company_id || '') !== String(sacPut)) {
        return res.status(403).json({ error: 'Không có quyền sửa lead/deal của công ty khác' });
      }
    } else if (isCrmRegionAdminUser(req.user) && req.user.company_id) {
      const regCo = String(req.user.company_id).trim();
      if (!oldLead || String(oldLead.company_id || '') !== String(regCo)) {
        return res.status(403).json({ error: 'Không có quyền sửa lead/deal của công ty khác' });
      }
      const ar0 = assertLeadReadableByRegionScope(req, oldLead);
      if (!ar0.ok) return res.status(403).json({ error: ar0.error });
    }

    const safeBody = { ...req.body };
    delete safeBody.stage_entered_at;
    delete safeBody.sx_pipeline_stage_id;
    delete safeBody.lead_seen_by;
    delete safeBody.sx_handover_at;
    delete safeBody.sx_template_company_id;
    delete safeBody.sx_handover_confirmed_by;
    delete safeBody.construction_start_date;
    delete safeBody.expected_production_start_date;
    delete safeBody.expected_production_end_date;
    if (Object.prototype.hasOwnProperty.call(req.body, 'assigned_to') || Object.prototype.hasOwnProperty.call(req.body, 'lead_owner_id')) {
      unifyCrmLeadResponsibleFields(safeBody);
    }
    if (sacPut && Object.prototype.hasOwnProperty.call(safeBody, 'company_id') && String(safeBody.company_id || '') !== String(sacPut)) {
      return res.status(403).json({ error: 'Không thể chuyển lead/deal sang công ty khác' });
    }

    const wantsOwnerChange =
      Object.prototype.hasOwnProperty.call(req.body, 'assigned_to')
      || Object.prototype.hasOwnProperty.call(req.body, 'lead_owner_id');
    if (wantsOwnerChange) {
      const newOwner = safeBody.assigned_to;
      const prevOwner = oldLead?.assigned_to || oldLead?.lead_owner_id;
      const adminLike = userIsCrmCompanyOrRegionAdmin(req);
      if (
        oldLead?.type === 'deal'
        && await isCrmDealAssigneeLocked(supabase, oldLead)
        && String(newOwner || '') !== String(prevOwner || '')
        && !adminLike
      ) {
        return res.status(403).json({
          error: 'Deal đã chốt Thắng — không thể đổi người phụ trách CRM. Liên hệ admin nếu cần chuyển giao.',
          code: 'crm_assignee_locked',
        });
      }
      if (newOwner == null && prevOwner != null && !adminLike) {
        return res.status(403).json({ error: 'Chỉ admin mới được bỏ gán người phụ trách.' });
      }
      if (newOwner != null) {
        const lc = oldLead?.company_id;
        if (!lc) {
          if (!adminLike) {
            return res.status(400).json({ error: 'Chọn công ty cho lead/deal trước khi đổi người phụ trách.' });
          }
        } else {
          const v = await assertCrmAssigneeUserMatchesLeadCompany(supabase, newOwner, lc);
          if (!v.ok) return res.status(400).json({ error: v.error });
        }
      }
    }

    if (Object.prototype.hasOwnProperty.call(safeBody, 'region_id')) {
      if (safeBody.region_id === '' || safeBody.region_id === undefined) safeBody.region_id = null;
    }
    if (Object.prototype.hasOwnProperty.call(safeBody, 'region_id') && safeBody.region_id != null) {
      const effectiveCompanyId = safeBody.company_id ?? oldLead?.company_id;
      const v = await assertRegionBelongsToCompany(supabase, effectiveCompanyId, safeBody.region_id);
      if (!v.ok) return res.status(400).json({ error: v.error });
      const ar = assertUserCanAssignCrmRegion(req, safeBody.region_id);
      if (!ar.ok) return res.status(403).json({ error: ar.error });
    }

    if (
      Object.prototype.hasOwnProperty.call(safeBody, 'stage_id')
      && String(safeBody.stage_id || '') !== String(oldLead?.stage_id || '')
    ) {
      safeBody.stage_entered_at = new Date().toISOString();
    }

    if (
      Object.prototype.hasOwnProperty.call(safeBody, 'stage_id')
      && String(safeBody.stage_id || '') !== String(oldLead?.stage_id || '')
    ) {
      const { data: targetStage } = await supabase
        .from('crm_pipeline_stages')
        .select('id, name, order_index, is_won, is_lost, sync_role, pipeline_type, pipeline_id, counts_as_completed_revenue')
        .eq('id', safeBody.stage_id)
        .maybeSingle();

      const { data: prevStage } = oldLead?.stage_id
        ? await supabase
          .from('crm_pipeline_stages')
          .select('id, name, order_index, is_won, is_lost, pipeline_type, sync_role, counts_as_completed_revenue')
          .eq('id', oldLead.stage_id)
          .maybeSingle()
        : { data: null };

      if (oldLead?.type === 'deal') {
        let gateLead = oldLead;
        try {
          const vcJoin = crmSchemaCompat.vcPipelineStageAvailable
            ? ', vc_pipeline_stage:logistics_pipeline_stages(id, name, crm_sync_type)'
            : '';
          const { data: badgeLead } = await supabase
            .from('crm_leads')
            .select(`id, type, project_id, stage_id, sx_pipeline_stage:production_pipeline_stages(id, name, crm_sync_type)${vcJoin}`)
            .eq('id', id)
            .maybeSingle();
          if (badgeLead) gateLead = { ...oldLead, ...badgeLead };
        } catch (_) { /* giữ oldLead — gate sẽ chặn post-won nếu thiếu badge */ }
        const { loadWonAnchorOrderForPipeline } = require('../../../helpers/crmDealStageGate');
        const wonAnchorOrder = await loadWonAnchorOrderForPipeline(
          targetStage?.pipeline_id || oldLead?.pipeline_id || null,
        );
        const stageGatePut = assertDealCrmManualStageChange(gateLead, targetStage, prevStage, { wonAnchorOrder });
        if (!stageGatePut.ok) {
          return res.status(400).json({
            error: stageGatePut.error,
            code: stageGatePut.code,
            ...(stageGatePut.requires_production_company ? { requires_production_company: true } : {}),
          });
        }
      }

      const taskGate = await assertCrmStageAdvanceAllowed({
        leadId: req.params.id,
        leadType: oldLead?.type,
        currentStage: prevStage,
        targetStage,
      });
      if (!taskGate.ok) {
        return res.status(400).json({
          error: taskGate.error,
          code: taskGate.code,
          remaining_tasks: taskGate.remaining_tasks,
        });
      }
    }

    if (Object.prototype.hasOwnProperty.call(safeBody, 'referrer_name')) {
      const { resolveReferrerNameForLead } = require('../../../helpers/crmReferrers');
      safeBody.referrer_name = await resolveReferrerNameForLead({
        companyId: safeBody.company_id ?? oldLead?.company_id,
        referrerName: safeBody.referrer_name,
        userId: req.user.userId,
      });
    }

    if ('deposit_installments' in safeBody) {
      const { aggregateDepositFromInstallments } = require('../../../helpers/depositInstallments');
      const agg = aggregateDepositFromInstallments(safeBody.deposit_installments);
      safeBody.deposit_installments = agg.deposit_installments;
      safeBody.deposit_amount = agg.deposit_amount;
      safeBody.deposit_received = agg.deposit_received;
      safeBody.deposit_label = agg.deposit_label;
    } else {
      if ('deposit_amount' in safeBody) {
        const raw = safeBody.deposit_amount;
        if (raw === '' || raw === undefined || raw === null) safeBody.deposit_amount = null;
        else {
          const n = Number(raw);
          safeBody.deposit_amount = Number.isFinite(n) && n > 0 ? n : null;
        }
      }
      if ('deposit_received' in safeBody) {
        const dr = safeBody.deposit_received;
        if (dr === '' || dr === undefined || dr === null) safeBody.deposit_received = null;
        else if (dr === true || dr === 'true') safeBody.deposit_received = true;
        else if (dr === false || dr === 'false') safeBody.deposit_received = false;
        else safeBody.deposit_received = null;
      }
      if ('deposit_label' in safeBody && safeBody.deposit_label === '') safeBody.deposit_label = null;
    }

    if (Object.prototype.hasOwnProperty.call(safeBody, 'lead_type_id')) {
      if (!safeBody.lead_type_id) {
        safeBody.lead_type_id = null;
      } else {
        const { data: lt } = await supabase
          .from('crm_lead_types')
          .select('id, company_id, applies_to, is_active')
          .eq('id', safeBody.lead_type_id)
          .maybeSingle();
        if (!lt) return res.status(400).json({ error: 'Loại Lead/Deal không tồn tại' });
        if (String(lt.company_id || '') !== String(oldLead?.company_id || '')) return res.status(400).json({ error: 'Loại không thuộc công ty của Lead/Deal' });
        if (lt.is_active === false) return res.status(400).json({ error: 'Loại đang bị ẩn' });
        const t = oldLead?.type === 'deal' ? 'deal' : 'lead';
        if (lt.applies_to && !['both', t].includes(String(lt.applies_to))) return res.status(400).json({ error: `Loại này không áp dụng cho ${t === 'deal' ? 'Deal' : 'Lead'}` });
      }
    }

    const patchVcJoin = crmSchemaCompat.vcPipelineStageAvailable ? ', vc_pipeline_stage:logistics_pipeline_stages(id, name, color, icon, bucket_slug)' : '';
    let { data, error } = await supabase.from('crm_leads')
      .update({ ...safeBody, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*, customer:customers(id, full_name, phone), stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, color, icon), sx_pipeline_stage:production_pipeline_stages(id, name, color, icon, bucket_slug, company:companies(id, name, short_name))' + patchVcJoin)
      .single();
    if (error && isVcRelationshipError(error)) {
      crmSchemaCompat.vcPipelineStageAvailable = false;
      crmSchemaCompat.leadSelectMigrationChecked = false;
      ({ data, error } = await supabase.from('crm_leads')
        .update({ ...safeBody, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*, customer:customers(id, full_name, phone), stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, color, icon), sx_pipeline_stage:production_pipeline_stages(id, name, color, icon, bucket_slug, company:companies(id, name, short_name))')
        .single());
    }
    if (error) throw error;

    const pipelineChanged = Object.prototype.hasOwnProperty.call(safeBody, 'pipeline_id')
      && String(safeBody.pipeline_id || '') !== String(oldLead?.pipeline_id || '');
    if (pipelineChanged) {
      try {
        const taskLeadId = await resolveCrmTaskWriteLeadId(id);
        const taskResync = await syncCrmTasksAfterPipelineChange(taskLeadId, req.user.userId, req);
        if (taskResync?.ok && ((taskResync.deleted || 0) > 0 || (taskResync.tasks_created || 0) > 0)) {
          await emitCrmTaskChanged(req, {
            leadId: taskLeadId,
            action: 'pipeline_resync',
            count: taskResync.tasks_created || 0,
          });
        }
      } catch (resyncErr) {
        console.warn('[crm PUT /leads/:id] syncCrmTasksAfterPipelineChange:', resyncErr.message);
      }
    }

    if (oldLead?.type === 'lead' && data?.type === 'deal') {
      try {
        await autoGenCrmTasksForNewLead(id, req.user.userId, req);
      } catch (genErr) {
        console.warn('[crm PUT /leads/:id] auto-gen deal tasks after lead→deal:', genErr.message);
      }
    }

    if (
      oldLead?.type === 'deal'
      && data?.project_id
      && Object.prototype.hasOwnProperty.call(safeBody, 'stage_id')
      && String(safeBody.stage_id || '') !== String(oldLead?.stage_id || '')
    ) {
      try {
        const { data: targetSxStage } = await supabase
          .from('crm_pipeline_stages')
          .select('sync_role')
          .eq('id', safeBody.stage_id)
          .maybeSingle();
        if (targetSxStage?.sync_role === 'sx_production') {
          await syncSxKanbanFromCrmProductionStage(id);
          try {
            await syncCrmLeadSxPipelineFromProject(data.project_id);
          } catch (syncErr) {
            console.warn('[crm PUT /leads/:id] syncCrmLeadSxPipelineFromProject:', syncErr.message);
          }
          try {
            const io = req.app.get('io');
            if (io) await emitCrmBadgeUpdateForProject(data.project_id, io);
          } catch (emitErr) {
            console.warn('[crm PUT /leads/:id] emitCrmBadgeUpdateForProject:', emitErr.message);
          }
        }
      } catch (sxErr) {
        console.warn('[crm PUT /leads/:id] syncSxKanbanFromCrmProductionStage:', sxErr.message);
      }
    }

    try {
      const ownerUpdated = Object.prototype.hasOwnProperty.call(req.body, 'assigned_to')
        || Object.prototype.hasOwnProperty.call(req.body, 'lead_owner_id');
      if (ownerUpdated) {
        const newOwner = safeBody.assigned_to;
        const prevOwner = oldLead?.assigned_to || oldLead?.lead_owner_id;
        if (newOwner && String(newOwner) !== String(prevOwner || '') && String(newOwner) !== String(req.user.userId)) {
          const label = oldLead?.type === 'deal' ? 'Deal' : 'Lead';
          // Người được giao tường minh — luôn nhận TB (không lọc company/region).
          await createNotification(req, newOwner, 'lead_assigned',
            `👤 ${label} được giao cho bạn`,
            `${label} "${oldLead?.title || data.title}" được giao cho bạn phụ trách`,
            oldLead?.type === 'deal' ? 'crm_deal' : 'crm_lead', id,
            { ecosystem_module_key: 'crm' });
        }
      }
    } catch (_) {}

    // Ghi lịch sử thay đổi người phụ trách
    try {
      const ownerChanged = Object.prototype.hasOwnProperty.call(req.body, 'assigned_to')
        || Object.prototype.hasOwnProperty.call(req.body, 'lead_owner_id');
      if (ownerChanged) {
        const newOwnerId = safeBody.assigned_to || safeBody.lead_owner_id;
        const prevOwnerId = oldLead?.assigned_to || oldLead?.lead_owner_id;
        if (String(newOwnerId || '') !== String(prevOwnerId || '')) {
          const { data: actor } = await supabase.from('users').select('full_name').eq('id', req.user.userId).maybeSingle();
          const actorName = actor?.full_name || 'Người dùng';
          let newName = 'Không ai';
          if (newOwnerId) {
            const { data: nu } = await supabase.from('users').select('full_name').eq('id', newOwnerId).maybeSingle();
            newName = nu?.full_name || 'Nhân viên';
          }
          let prevName = '';
          if (prevOwnerId) {
            const { data: pu } = await supabase.from('users').select('full_name').eq('id', prevOwnerId).maybeSingle();
            prevName = pu?.full_name || 'Nhân viên';
          }
          const fromPart = prevName ? ` (trước: ${prevName})` : '';
          await logDealActivityComment(req, {
            leadId: id,
            body: `👤 ${actorName} đã thay đổi người phụ trách CRM thành «${newName}»${fromPart}.`,
          });
        }
      }
    } catch (_) {}

    // Giao việc tuần tự: đổi người phụ trách → gán lại assignment mở nếu NV không có assignee riêng
    try {
      const ownerReassign = Object.prototype.hasOwnProperty.call(req.body, 'assigned_to')
        || Object.prototype.hasOwnProperty.call(req.body, 'lead_owner_id');
      if (ownerReassign) {
        const newOwnerId = safeBody.assigned_to || safeBody.lead_owner_id || data?.assigned_to || data?.lead_owner_id;
        const prevOwnerId = oldLead?.assigned_to || oldLead?.lead_owner_id;
        if (newOwnerId && String(newOwnerId) !== String(prevOwnerId || '')) {
          const {
            reassignOpenSequentialAssignmentOnLeadOwnerChange,
          } = require('../../../helpers/crmSequentialAssignment');
          await reassignOpenSequentialAssignmentOnLeadOwnerChange(req, id, newOwnerId);
        }
      }
    } catch (reErr) {
      console.warn('[crm-seq-asn] reassign on lead owner change:', reErr.message);
    }

    // Đồng bộ tên dự án SX/VC — card Kanban dùng projects.name, chi tiết deal dùng crm_leads.title
    try {
      const nextTitle = typeof safeBody.title === 'string' ? safeBody.title.trim() : '';
      const projectId = data?.project_id || oldLead?.project_id;
      if (
        nextTitle
        && projectId
        && Object.prototype.hasOwnProperty.call(safeBody, 'title')
        && String(oldLead?.title || '') !== nextTitle
      ) {
        const { error: projNameErr } = await supabase
          .from('projects')
          .update({ name: nextTitle, updated_at: new Date().toISOString() })
          .eq('id', projectId);
        if (projNameErr) console.warn('[crm PUT /leads/:id] sync project.name:', projNameErr.message);
        else {
          try { await rcInvalidateTags(['production']); } catch (_) {}
        }
      }
    } catch (syncNameErr) {
      console.warn('[crm PUT /leads/:id] sync project.name:', syncNameErr.message);
    }

    emitCrmDashboardChanged(req, {
      type: data?.type || oldLead?.type,
      company_id: data?.company_id || oldLead?.company_id,
      lead_id: id,
      action: 'updated',
      ...(Object.prototype.hasOwnProperty.call(safeBody, 'title') && typeof data?.title === 'string'
        ? { title: data.title }
        : {}),
    });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.delete('/leads/:id', async (req, res) => {
  try {
    const { data: lead } = await supabase.from('crm_leads')
      .select('id, title, project_id, customer_id, type, company_id, pipeline_id')
      .eq('id', req.params.id).single();
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy lead' });

    if (!(await assertCrmEmployeeDeleteAllowed(req, res, lead))) return;

    const deleteReason = req.body?.delete_reason || req.query.delete_reason || '';

    // Snapshot vào Thùng rác trước khi xóa thật, để admin có thể phục hồi.
    // Nếu permanent=true thì không snapshot (xóa vĩnh viễn).
    const permanent = req.query.permanent === 'true';
    if (!permanent) {
      try {
        const { snapshotCrmLead } = require('../../../helpers/trashSnapshot');
        const snapRes = await snapshotCrmLead(supabase, lead.id, req.user?.userId, {
          delete_reason: deleteReason || null,
        });
        if (!snapRes.ok) console.warn('[delete lead] snapshot trash failed:', snapRes.error);
      } catch (e) {
        console.warn('[delete lead] trash snapshot error:', e.message);
      }
    }

    const blockAuto = req.query.block_auto_recreate_phone === 'true';
    if (blockAuto && lead.customer_id) {
      const { data: cust } = await supabase.from('customers').select('phone').eq('id', lead.customer_id).maybeSingle();
      const ph = cust?.phone && String(cust.phone).trim() ? String(cust.phone).trim() : null;
      if (ph) {
        const addRes = await addPhoneToAutoLeadBlocklist(supabase, ph, {
          note: `Xóa lead ${lead.title || lead.id}`,
          userId: req.user?.userId,
          display: ph,
        });
        if (!addRes.ok) console.warn('[CRM] Chặn SĐT sau xóa lead:', addRes.error);
      }
    }

    // Nếu là lead/deal gốc: xóa luôn deal/lead con theo đơn + các orders liên quan
    let deletedSxCount = 0;
    try {
      const { data: childLeads } = await supabase
        .from('crm_leads')
        .select('id')
        .eq('parent_lead_id', lead.id);
      const childIds = (childLeads || []).map((c) => c.id);

      const allLeadIds = [lead.id, ...childIds];

      // Xóa SX TRƯỚC khi xóa lead: crm_deal_projects CASCADE theo deal, nếu xóa deal trước
      // thì mất liên kết và dự án phát sinh / xưởng phụ bị mồ côi trên Kanban SX.
      try {
        const sxDel = await deleteExclusiveProjectsForLeads(supabase, allLeadIds, {
          io: req.app?.get?.('io') || null,
          deletedBy: req.user?.userId || null,
          deleteReason: deleteReason || null,
          skipSnapshot: permanent,
        });
        deletedSxCount = sxDel?.deleted || 0;
        if (sxDel?.failed?.length) {
          console.warn('[delete lead] SX projects still present:', sxDel.failed.join(','));
        }
      } catch (sxErr) {
        console.warn('[delete lead] linked SX projects:', sxErr.message);
      }

      // Khóa ghi âm trước khi xóa lead (FK SET NULL) — không auto tạo lại.
      try {
        await markVoiceRecordingsSkipAutoCreateForLeadIds(supabase, allLeadIds);
      } catch (e) {
        console.warn('[delete lead] mark voice skip auto-create:', e.message);
      }

      // Delete CRM orders linked to this lead or to child fulfillment leads
      const { data: ords } = await supabase
        .from('orders')
        .select('id')
        .or(`lead_id.eq.${lead.id}${childIds.length ? `,fulfillment_lead_id.in.(${childIds.join(',')})` : ''}`);
      const orderIds = (ords || []).map((o) => o.id);
      if (orderIds.length) {
        try { await supabase.from('order_items').delete().in('order_id', orderIds); } catch (_) {}
        try { await supabase.from('orders').delete().in('id', orderIds); } catch (_) {}
      }

      // Delete CRM tasks on parent + children (attachments cascade by FK)
      try { await supabase.from('crm_tasks').delete().in('lead_id', allLeadIds); } catch (_) {}
      try { await supabase.from('crm_activities').delete().in('lead_id', allLeadIds); } catch (_) {}
      try { await supabase.from('lead_documents').delete().in('lead_id', allLeadIds); } catch (_) {}

      // Finally delete child leads (before parent) to avoid orphans (parent_lead_id is ON DELETE SET NULL)
      if (childIds.length) {
        try { await supabase.from('crm_leads').delete().in('id', childIds); } catch (_) {}
      }
    } catch (e) {
      console.warn('[delete lead] cascade children/orders:', e.message);
    }

    // (lead_documents/crm_activities/crm_tasks đã dọn theo allLeadIds ở trên nếu là lead gốc)
    try { await supabase.from('lead_documents').delete().eq('lead_id', lead.id); } catch (_) {}
    try { await supabase.from('crm_activities').delete().eq('lead_id', lead.id); } catch (_) {}

    // Lead không có con: vẫn khóa ghi âm gắn lead này.
    try {
      await markVoiceRecordingsSkipAutoCreateForLeadIds(supabase, [lead.id]);
    } catch (e) {
      console.warn('[delete lead] mark voice skip auto-create:', e.message);
    }

    const { error } = await supabase.from('crm_leads').delete().eq('id', lead.id);
    if (error) throw error;

    emitCrmDashboardChanged(req, { type: lead.type, company_id: lead.company_id, lead_id: lead.id, action: 'deleted' });
    const sxNote = deletedSxCount ? ` và ${deletedSxCount} dự án sản xuất liên kết` : '';
    res.json({ success: true, message: `Đã xóa lead "${lead.title}"${sxNote}` });
  } catch (e) {
    console.error('Delete lead error:', e);
    res.status(500).json({ error: e.message });
  }
});

r.get('/auto-lead-blocked-phones', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 500);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const q = String(req.query.q || '').trim();
    let query = supabase
      .from('crm_auto_lead_blocked_phones')
      .select('id, phone_last9, phone_display, note, created_at, created_by, creator:users!crm_auto_lead_blocked_phones_created_by_fkey(id, full_name)', { count: 'exact' })
      .order('created_at', { ascending: false });
    if (q) {
      const digits = q.replace(/\D/g, '');
      if (digits) {
        // Khớp theo 9 số cuối nếu user gõ số; fallback ILIKE display.
        query = query.or(`phone_last9.ilike.%${digits.slice(-9)}%,phone_display.ilike.%${digits}%,note.ilike.%${q}%`);
      } else {
        query = query.ilike('note', `%${q}%`);
      }
    }
    query = query.range(offset, offset + limit - 1);
    const { data, error, count } = await query;
    if (error) {
      // Fallback nếu FK alias không có tên (DB cũ).
      if (/crm_auto_lead_blocked_phones_created_by_fkey/.test(error.message || '')) {
        const fb = await supabase
          .from('crm_auto_lead_blocked_phones')
          .select('id, phone_last9, phone_display, note, created_at, created_by', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);
        if (fb.error) throw fb.error;
        return res.json({ items: fb.data || [], total: fb.count || 0, limit, offset });
      }
      throw error;
    }
    res.json({ items: data || [], total: count || 0, limit, offset });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/auto-lead-blocked-phones', async (req, res) => {
  try {
    const { phone, note } = req.body || {};
    if (!phone || !String(phone).trim()) return res.status(400).json({ error: 'Thiếu số điện thoại' });
    const { addPhoneToAutoLeadBlocklist } = require('../../../helpers/crmAutoLeadPhoneBlocklist');
    const result = await addPhoneToAutoLeadBlocklist(supabase, String(phone).trim(), {
      note: note ? String(note).trim() : null,
      userId: req.user?.userId || null,
      display: String(phone).trim(),
    });
    if (!result.ok) {
      if (result.error === 'invalid_phone') return res.status(400).json({ error: 'Số điện thoại không hợp lệ (cần đủ 9 số cuối)' });
      return res.status(500).json({ error: result.error });
    }
    const { data } = await supabase
      .from('crm_auto_lead_blocked_phones')
      .select('id, phone_last9, phone_display, note, created_at, created_by')
      .eq('phone_last9', result.last9)
      .maybeSingle();
    res.json({ success: true, item: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.delete('/auto-lead-blocked-phones/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('crm_auto_lead_blocked_phones').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/leads/:id/documents', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('lead_documents')
      .select('*, creator:users!lead_documents_created_by_fkey(id, full_name)')
      .eq('lead_id', req.params.id)
      .order('created_at', { ascending: false });
    if (error) throw error;

    // Mark documents that came from task attachments
    const filtered = (data || []).filter((doc) => canUserViewDocByAllowlist(req.user, doc));
    const result = filtered.map(doc => ({
      ...doc,
      is_from_task: !!doc.source_attachment_id,
    }));

    res.set('Cache-Control', 'private, no-store');
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/leads/:id/task-documents', async (req, res) => {
  try {
    // Lấy tất cả crm_tasks của lead (có stage_slug)
    const { data: crmTasks } = await supabase.from('crm_tasks')
      .select('id, title, stage_slug, checklist, pipeline_stage_id, order_index, pipeline_stage:crm_pipeline_stages!crm_tasks_pipeline_stage_id_fkey(id, name, icon, color, order_index)')
      .eq('lead_id', req.params.id)
      .order('order_index');

    // Fallback: cũng check project tasks
    const { data: lead } = await supabase.from('crm_leads')
      .select('project_id').eq('id', req.params.id).single();
    
    let projectTasks = [];
    if (lead?.project_id) {
      const { data: pTasks } = await supabase.from('tasks')
        .select('id, title').eq('project_id', lead.project_id);
      projectTasks = pTasks || [];
    }

    const allTaskIds = [
      ...(crmTasks || []).map(t => t.id),
      ...projectTasks.map(t => t.id),
    ];
    if (!allTaskIds.length) return res.json([]);

    const { data: attachments } = await supabase.from('crm_task_attachments')
      .select('*').in('task_id', allTaskIds).order('created_at', { ascending: false });
    
    // Build task info map
    const taskMap = {};
    (crmTasks || []).forEach((t) => {
      taskMap[t.id] = {
        title: t.title,
        stage_slug: t.stage_slug,
        checklist: t.checklist,
        pipeline_stage_id: t.pipeline_stage_id,
        order_index: t.order_index,
        pipeline_stage: t.pipeline_stage,
      };
    });
    projectTasks.forEach(t => { if (!taskMap[t.id]) taskMap[t.id] = { title: t.title, stage_slug: null, checklist: [] }; });
    
    const visible = (attachments || []).filter((a) => canUserViewDocByAllowlist(req.user, a, taskMap[a.task_id]));
    const result = visible.map(a => {
      const taskInfo = taskMap[a.task_id] || {};
      const ckItem = a.checklist_id ? findChecklistItem(taskInfo, a.checklist_id) : null;
      return {
        ...a,
        task_title: taskInfo.title || 'Nhiệm vụ',
        stage_slug: taskInfo.stage_slug || null,
        pipeline_stage_id: taskInfo.pipeline_stage_id || null,
        order_index: taskInfo.order_index ?? 0,
        checklist_id: a.checklist_id || null,
        checklist_title: ckItem?.title || null,
      };
    });

    res.set('Cache-Control', 'private, no-store');
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/leads/:id/documents', async (req, res) => {
  try {
    const {
      name, doc_type, file_url, file_name, file_size, mime_type, notes,
      allowed_departments, allowed_companies, allowed_share_modules, task_id,
    } = req.body;
    
    // Get project_id from lead/deal (for sync)
    const { data: lead } = await supabase.from('crm_leads').select('project_id, title').eq('id', req.params.id).single();
    
    let shareMods = null;
    if (Array.isArray(allowed_share_modules) && allowed_share_modules.length) {
      const { SHARE_MODULE_KEYS } = require('../../../helpers/documentShareScope');
      shareMods = [...new Set(allowed_share_modules.map((x) => String(x).toLowerCase().trim()))].filter((x) =>
        SHARE_MODULE_KEYS.has(x),
      );
      if (!shareMods.length) shareMods = null;
    }
    const docShare = getDefaultLeadDocumentShareForDeal(lead?.project_id, {
      shared_to_workshop: req.body.shared_to_workshop,
      allowed_share_modules: shareMods,
    });

    const { data, error } = await supabase
      .from('lead_documents')
      .insert({
        lead_id: req.params.id,
        project_id: lead?.project_id || null,
        name: name || file_name || 'Tài liệu',
        doc_type: doc_type || 'other',
        file_url,
        file_name,
        file_size,
        mime_type,
        notes,
        allowed_departments: allowed_departments || null,
        allowed_companies: allowed_companies || null,
        allowed_share_modules: docShare.allowed_share_modules,
        shared_to_workshop: docShare.shared_to_workshop,
        created_by: req.user.userId,
      })
      .select('*, creator:users!lead_documents_created_by_fkey(id, full_name)')
      .single();
    if (error) throw error;

    // ── SYNC → crm_task_attachments (nếu có task_id) ──
    if (task_id) {
      try {
        await supabase.from('crm_task_attachments').insert({
          task_id, lead_id: req.params.id,
          name: data.name, doc_type: data.doc_type, file_url: data.file_url,
          file_name: data.file_name, file_size: data.file_size, mime_type: data.mime_type,
          notes: data.notes,
          allowed_companies: allowed_companies || null,
          allowed_departments: allowed_departments || null,
          created_by: req.user.userId,
          source_document_id: data.id,
        });
      } catch (syncErr) { console.warn('Sync document→attachment:', syncErr.message); }
    }

    // 🔔 NOTIFICATION: Tài liệu mới
    try {
      const { data: leadInfo } = await supabase.from('crm_leads')
        .select('assigned_to, lead_owner_id, title').eq('id', req.params.id).single();
      const ownerIds = [leadInfo?.assigned_to, leadInfo?.lead_owner_id].filter(Boolean);
      if (ownerIds.length) await notifyMultiple(req, ownerIds, 'document_uploaded',
        '📎 Tài liệu mới',
        `"${data.name}" được upload vào deal "${leadInfo?.title || 'N/A'}"`,
        'crm_lead', req.params.id);
    } catch (ne) { console.warn('[NOTIFY] document_uploaded:', ne.message); }

    await logProjectFileActivity(req, {
      projectId: lead?.project_id,
      leadId: req.params.id,
      action: 'uploaded',
      fileName: data.file_name || data.name,
      fileUrl: data.file_url,
    });
    if (lead?.project_id && docShare.shared_to_workshop) {
      await notifyProductionDocumentUploaded({
        req,
        projectId: lead.project_id,
        leadId: req.params.id,
        fileName: data.file_name || data.name,
        dealTitle: lead.title,
      });
    }

    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/leads/:id/documents/bulk', async (req, res) => {
  try {
    if (!(await assertDealResponsible(req, res, { leadId: req.params.id }))) return;
    const items = req.body.items;
    if (!items?.length) return res.status(400).json({ error: 'Không có file' });

    const { data: lead } = await supabase.from('crm_leads').select('project_id, title, assigned_to, lead_owner_id').eq('id', req.params.id).single();
    const docShare = getDefaultLeadDocumentShareForDeal(lead?.project_id);
    const rows = items.map(item => ({
      lead_id: req.params.id,
      project_id: lead?.project_id || null,
      name: item.name || item.file_name || 'Tài liệu',
      doc_type: item.doc_type || 'other',
      file_url: item.file_url,
      file_name: item.file_name,
      file_size: item.file_size,
      mime_type: item.mime_type,
      shared_to_workshop: docShare.shared_to_workshop,
      allowed_share_modules: docShare.allowed_share_modules,
      created_by: req.user.userId,
    }));
    const { data, error } = await supabase.from('lead_documents')
      .insert(rows)
      .select('*, creator:users!lead_documents_created_by_fkey(id, full_name)');
    if (error) throw error;
    for (const doc of data || []) {
      await logProjectFileActivity(req, {
        projectId: lead?.project_id,
        leadId: req.params.id,
        action: 'uploaded',
        fileName: doc.file_name || doc.name,
        fileUrl: doc.file_url,
      });
      if (lead?.project_id && docShare.shared_to_workshop) {
        await notifyProductionDocumentUploaded({
          req,
          projectId: lead.project_id,
          leadId: req.params.id,
          fileName: doc.file_name || doc.name,
          dealTitle: lead.title,
        });
      }
    }
    try {
      const ownerIds = [lead?.assigned_to, lead?.lead_owner_id].filter(Boolean);
      if (ownerIds.length && data?.length) {
        await notifyMultiple(req, ownerIds, 'document_uploaded',
          '📎 Tài liệu mới',
          `${data.length} file được upload vào deal "${lead?.title || 'N/A'}"`,
          'crm_lead', req.params.id);
      }
    } catch (ne) { console.warn('[NOTIFY] document_uploaded bulk:', ne.message); }
    res.status(201).json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.delete('/leads/:id/documents/:docId', async (req, res) => {
  try {
    const { data: doc, error: docErr } = await supabase.from('lead_documents')
      .select('id, lead_id, project_id, source_attachment_id, source_file_attachment_id, created_by, file_name, name')
      .eq('id', req.params.docId)
      .maybeSingle();
    if (docErr) throw docErr;
    if (!doc) return res.status(404).json({ error: 'Không tìm thấy tài liệu' });
    if (doc.lead_id && String(doc.lead_id) !== String(req.params.id)) {
      return res.status(404).json({ error: 'Tài liệu không thuộc deal này' });
    }
    if (!(await assertLeadDocumentOwner(req, res, doc))) return;

    const deletedFileName = doc.file_name || doc.name || 'tài liệu';

    // Snapshot vào Thùng rác trước khi xóa thật (trừ khi permanent=true)
    if (req.query.permanent !== 'true') {
      try {
        const { snapshotLeadDocument } = require('../../../helpers/trashSnapshot');
        const snapRes = await snapshotLeadDocument(supabase, req.params.docId, req.user?.userId);
        if (!snapRes.ok) console.warn('[delete lead doc] snapshot trash failed:', snapRes.error);
      } catch (e) {
        console.warn('[delete lead doc] trash snapshot error:', e.message);
      }
    }

    // Mirror từ file xưởng — xóa file gốc + bản mirror trên CRM
    if (doc.source_file_attachment_id) {
      const { removeLeadDocumentForWorkshopFile } = require('../../../helpers/syncWorkshopFileToLeadDocument');
      await removeLeadDocumentForWorkshopFile(doc.source_file_attachment_id);
      const { error: fileDelErr } = await supabase
        .from('file_attachments')
        .delete()
        .eq('id', doc.source_file_attachment_id);
      if (fileDelErr) throw fileDelErr;
      const { data: mirrorDeleted, error: mirrorErr } = await supabase
        .from('lead_documents')
        .delete()
        .eq('id', req.params.docId)
        .select('id');
      if (mirrorErr) throw mirrorErr;
      if (!mirrorDeleted?.length) {
        return res.status(404).json({ error: 'Không xóa được tài liệu' });
      }
      await logProjectFileActivity(req, {
        projectId: doc.project_id,
        leadId: doc.lead_id || req.params.id,
        action: 'deleted',
        fileName: deletedFileName,
      });
      return res.json({ success: true, via: 'workshop_file' });
    }
    
    // Xóa task attachment liên kết (nếu có)
    if (doc.source_attachment_id) {
      await supabase.from('crm_task_attachments')
        .delete().eq('id', doc.source_attachment_id);
    }
    
    // Xóa lead_documents liên kết ngược (nếu doc này là source cho attachment)
    await supabase.from('crm_task_attachments')
      .delete().eq('source_document_id', req.params.docId);

    const { data: deleted, error } = await supabase
      .from('lead_documents')
      .delete()
      .eq('id', req.params.docId)
      .select('id');
    if (error) throw error;
    if (!deleted?.length) {
      return res.status(404).json({ error: 'Không xóa được tài liệu' });
    }
    await logProjectFileActivity(req, {
      projectId: doc.project_id,
      leadId: doc.lead_id || req.params.id,
      action: 'deleted',
      fileName: deletedFileName,
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Route theo `:projectId` KHÔNG đi qua `enforceCrmDealAssigneeAccess` (middleware chỉ khớp
 * `/leads|deals/<uuid>`), nên từng handler phải tự kiểm quyền — nếu không, mọi user đã đăng nhập
 * chỉ cần biết projectId là đọc/ghi được dữ liệu CRM của dự án bất kỳ.
 * @returns {Promise<{ project: object, lead: object|null }|null>} null = đã trả lỗi cho client
 */
async function resolveCrmProjectScope(req, res, projectIdRaw) {
  const projectId = String(projectIdRaw || '').trim();
  if (!CRM_UUID_RE.test(projectId)) {
    res.status(400).json({ error: 'project_id không hợp lệ' });
    return null;
  }

  const { data: project, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .maybeSingle();
  if (error) throw error;
  if (!project) {
    res.status(404).json({ error: 'Không tìm thấy dự án' });
    return null;
  }

  const { assertRowCompanyInTenant } = require('../../../helpers/tenantScope');
  if (!assertRowCompanyInTenant(req, res, project)) return null;

  const { data: lead } = await supabase
    .from('crm_leads')
    .select('id, type, company_id, assigned_to, lead_owner_id, parent_lead_id, project_id, region_id')
    .eq('project_id', projectId)
    .limit(1)
    .maybeSingle();
  const scope = { project, lead: lead || null };

  if (isSystemAdmin(req.user) || isPlatformAdmin(req.user)) return scope;

  const uid = req.user?.userId ? String(req.user.userId) : '';
  const projectPersonFields = [
    'sales_person_id', 'designer_id', 'project_manager_id', 'supervisor_id',
    'production_person_id', 'logistics_person_id', 'created_by',
  ];
  if (uid && projectPersonFields.some((f) => project[f] && String(project[f]) === uid)) return scope;

  const userCompany = req.user?.company_id ? String(req.user.company_id) : '';
  if (userCompany) {
    const projectCompanies = [project.company_id, project.logistics_company_id]
      .filter(Boolean)
      .map(String);
    if (projectCompanies.includes(userCompany)) return scope;
    // Sale/kế toán bên công ty CRM: dự án thuộc công ty SX khác nhưng deal là của họ.
    if (lead?.company_id && String(lead.company_id) === userCompany) return scope;
  }

  if (lead) {
    const { assertCrmLeadAccess } = require('../../../helpers/crmTaskLeadAccess');
    const gate = await assertCrmLeadAccess(supabase, req, lead, { operation: 'READ' });
    if (gate.ok) return scope;
  }

  res.status(403).json({ error: 'Không có quyền truy cập dự án này', reason: 'crm_project_scope_denied' });
  return null;
}

r.get('/projects/:projectId/documents', async (req, res) => {
  try {
    if (!(await resolveCrmProjectScope(req, res, req.params.projectId))) return;

    const { data, error } = await supabase.from('lead_documents')
      .select('*, creator:users!lead_documents_created_by_fkey(id, full_name)')
      .eq('project_id', req.params.projectId)
      .order('created_at', { ascending: false });
    if (error) throw error;

    // Cùng bộ lọc allowlist như GET /leads/:id/documents — không lộ tài liệu giới hạn phòng ban/công ty.
    const visible = (data || []).filter((doc) => canUserViewDocByAllowlist(req.user, doc));
    res.set('Cache-Control', 'private, no-store');
    res.json(visible);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.put('/documents/:docId/visibility', async (req, res) => {
  try {
    const { data: before } = await supabase.from('lead_documents')
      .select('id, lead_id, project_id, created_by, file_name, name, source_file_attachment_id, source_attachment_id')
      .eq('id', req.params.docId)
      .maybeSingle();
    if (!before) return res.status(404).json({ error: 'Không tìm thấy tài liệu' });
    if (!(await assertLeadDocumentOwner(req, res, before))) return;

    const { allowed_departments, allowed_companies, shared_to_workshop, allowed_share_modules } = req.body;
    const update = {
      allowed_departments: allowed_departments || null,
      allowed_companies: allowed_companies || null,
    };
    if (shared_to_workshop !== undefined) update.shared_to_workshop = !!shared_to_workshop;
    if (allowed_share_modules !== undefined) {
      const { SHARE_MODULE_KEYS } = require('../../../helpers/documentShareScope');
      const raw = Array.isArray(allowed_share_modules) ? allowed_share_modules : [];
      const cleaned = [...new Set(raw.map((x) => String(x).toLowerCase().trim()))].filter((x) =>
        SHARE_MODULE_KEYS.has(x),
      );
      update.allowed_share_modules = cleaned.length ? cleaned : null;
    }
    const { data, error } = await supabase.from('lead_documents')
      .update(update)
      .eq('id', req.params.docId)
      .select('*').single();
    if (error) throw error;
    await logProjectFileActivity(req, {
      projectId: before.project_id,
      leadId: before.lead_id,
      action: 'visibility_updated',
      fileName: before.file_name || before.name,
      fileUrl: before.file_url,
    });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/leads/:id/convert-to-deal', async (req, res) => {
  try {
    const { data: lead } = await supabase
      .from('crm_leads')
      .select('*, customer:customers(id, full_name, phone)')
      .eq('id', req.params.id)
      .single();
    
    if (!lead) return res.status(404).json({ error: 'Lead không tồn tại' });
    if (lead.type === 'deal') return res.status(400).json({ error: 'Đã là Deal rồi' });

    // Chỉ cần có khách hàng liên kết, không bắt buộc đủ SĐT để có thể convert nhanh
    if (!lead.customer_id) {
      return res.status(400).json({ error: 'Lead chưa được liên kết khách hàng. Vào chi tiết Lead → chọn Khách hàng trước khi chuyển Deal.' });
    }

    try {
      const { applyZaloDisplayNameToCustomer } = require('../../../helpers/zaloBatchTools');
      const { data: zc } = await supabase.from('zalo_contacts')
        .select('display_name, user_id')
        .eq('lead_id', req.params.id)
        .limit(1)
        .maybeSingle();
      if (zc?.display_name) {
        await applyZaloDisplayNameToCustomer(lead.customer_id, zc.display_name, { zaloUserId: zc.user_id });
      }
    } catch (zaloNameErr) {
      console.warn('[convert-to-deal] sync Zalo customer name:', zaloNameErr.message);
    }

    const companyId = req.body.company_id || lead.company_id || null;

    // Bắt buộc chọn khu vực CRM khi chuyển Lead → Deal (đồng nhất phân quyền theo region).
    const regionIdRaw =
      (req.body.region_id != null ? req.body.region_id : lead.region_id) || null;
    const regionId = regionIdRaw ? String(regionIdRaw).trim() : '';
    if (!regionId) {
      return res.status(400).json({ error: 'Vui lòng chọn khu vực trước khi chuyển Lead sang Deal.' });
    }
    {
      const { data: region, error: regionErr } = await supabase
        .from('company_regions')
        .select('id, company_id, is_active')
        .eq('id', regionId)
        .maybeSingle();
      if (regionErr) throw regionErr;
      if (!region) return res.status(400).json({ error: 'Khu vực không tồn tại.' });
      if (region.is_active === false) {
        return res.status(400).json({ error: 'Khu vực đã ngưng hoạt động — chọn khu vực khác.' });
      }
      if (companyId && String(region.company_id || '') !== String(companyId)) {
        return res.status(400).json({ error: 'Khu vực không thuộc công ty của lead.' });
      }
    }

    // Pipeline dùng cho cột Deal đầu tiên phải trùng pipeline Kanban của công ty (trước đây lấy 1 cột deal trên toàn DB → stage_id lạ, không nằm cột nào trên board).
    let pipelineForDeal = null;
    if (req.body.pipeline_id) {
      const { data: pl } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', req.body.pipeline_id).maybeSingle();
      if (!pl) return res.status(400).json({ error: 'Pipeline không tồn tại' });
      if (companyId && String(pl.company_id || '') !== String(companyId)) {
        return res.status(400).json({ error: 'Pipeline không thuộc công ty của lead' });
      }
      pipelineForDeal = pl.id;
    }
    // Ưu tiên pipeline riêng của khu vực đã chọn (khi công ty đã tách pipeline theo khu vực) —
    // quan trọng khi khu vực chọn ở màn "Chuyển sang Deal" khác khu vực gốc của lead.
    if (!pipelineForDeal && companyId && regionId) {
      const regionPid = await getPipelineIdForCompanyRegion(companyId, regionId);
      if (regionPid) pipelineForDeal = regionPid;
    }
    if (!pipelineForDeal && lead.pipeline_id && companyId) {
      const { data: pl } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', lead.pipeline_id).maybeSingle();
      if (pl && String(pl.company_id || '') === String(companyId)) pipelineForDeal = pl.id;
    }
    if (!pipelineForDeal && companyId) {
      const { data: pls } = await supabase.from('crm_pipelines')
        .select('id, is_default')
        .eq('company_id', companyId)
        .eq('is_active', true);
      const list = pls || [];
      const def = list.find((p) => p.is_default) || list[0];
      pipelineForDeal = def?.id || null;
    }

    let stageQ = supabase
      .from('crm_pipeline_stages')
      .select('id')
      .eq('pipeline_type', 'deal')
      .eq('is_active', true)
      .order('order_index')
      .limit(1);
    if (pipelineForDeal) {
      stageQ = stageQ.eq('pipeline_id', pipelineForDeal);
    }
    const { data: firstDealStage, error: stagePickErr } = await stageQ.maybeSingle();
    if (stagePickErr) throw stagePickErr;
    if (!firstDealStage) {
      return res.status(500).json({
        error: pipelineForDeal
          ? 'Không tìm thấy cột Deal đầu tiên trong pipeline của công ty. Kiểm tra pipeline CRM / migration.'
          : 'Không tìm thấy giai đoạn Deal đầu tiên trên hệ thống.',
      });
    }

    // Update lead → deal (một người phụ trách)
    const ownerId = req.body.assigned_to || lead.assigned_to || lead.lead_owner_id || req.user.userId;
    if (req.body.assigned_to && !companyId) {
      if (!userIsCrmCompanyOrRegionAdmin(req)) {
        return res.status(400).json({ error: 'Chọn công ty cho lead trước khi gán người phụ trách khi chuyển Deal.' });
      }
    }
    if (ownerId && companyId) {
      const v = await assertCrmAssigneeUserMatchesLeadCompany(supabase, ownerId, companyId);
      if (!v.ok) return res.status(400).json({ error: v.error });
    }
    const { data: updatedLead, error: leadError } = await supabase
      .from('crm_leads')
      .update({
        type: 'deal',
        stage_id: firstDealStage.id,
        pipeline_id: pipelineForDeal || lead.pipeline_id || null,
        assigned_to: ownerId,
        lead_owner_id: ownerId,
        company_id: companyId,
        region_id: regionId,
        updated_at: new Date().toISOString(),
        stage_entered_at: new Date().toISOString(),
        revert_to_lead_reason: null,
      })
      .eq('id', req.params.id)
      .select('*')
      .single();

    if (leadError) throw leadError;

    try {
      if (ownerId && String(ownerId) !== String(req.user.userId)) {
        await createNotification(req, ownerId, 'deal_assigned',
          '🚀 Deal mới được giao',
          `Lead "${lead.title}" đã chuyển thành Deal và giao cho bạn phụ trách`,
          'crm_deal', req.params.id,
          { ecosystem_module_key: 'crm' });
      }
    } catch (notifErr) { console.error('Convert notification error:', notifErr.message); }

    // Task attachments & notes đã được sync realtime → lead_documents
    // (qua source_attachment_id khi thêm attachment vào task)
    // Chỉ sync những attachment chưa có bản lead_document (dữ liệu cũ trước sync)
    try {
      const { data: taskAtts } = await supabase.from('crm_task_attachments')
        .select('id, name, file_url, file_name, file_size, mime_type, notes, doc_type, created_by, task:crm_tasks(id, title, stage_slug)')
        .eq('lead_id', req.params.id);
      if (taskAtts?.length) {
        const { data: convLead } = await supabase.from('crm_leads')
          .select('project_id').eq('id', req.params.id).maybeSingle();
        const convDocOpts = { linkToProject: !!convLead?.project_id };
        // Tìm những attachment chưa có lead_document link
        const { data: existingLinks } = await supabase.from('lead_documents')
          .select('source_attachment_id')
          .eq('lead_id', req.params.id)
          .not('source_attachment_id', 'is', null);
        const linkedIds = new Set((existingLinks || []).map(d => d.source_attachment_id));
        const unlinked = taskAtts.filter(att => !linkedIds.has(att.id));
        if (unlinked.length) {
          await supabase.from('lead_documents').insert(unlinked.map(att => ({
            lead_id: req.params.id,
            name: `[${att.task?.title || 'Task'}] ${att.name}`,
            doc_type: att.file_url ? (att.doc_type || 'other') : 'requirement',
            file_url: att.file_url || null, file_name: att.file_name || null,
            file_size: att.file_size || null, mime_type: att.mime_type || null,
            notes: att.notes || null, created_by: att.created_by,
            source_attachment_id: att.id,
            ...getLeadDocumentFieldsFromCrmTask(att.task, convDocOpts),
          })));
          console.log(`[convert] Synced ${unlinked.length} unlinked task attachments → lead_documents`);
        }
      }
    } catch (syncErr) { console.warn('Sync on convert:', syncErr.message); }

    // Log activity
    try {
      await supabase.from('crm_activities').insert({
        lead_id: req.params.id,
        type: 'note',
        title: '🚀 Chuyển sang Deal',
        description: 'Lead chuyển thành Deal thành công. Nhiệm vụ Lead còn mở sẽ được hoàn thành tự động.',
        created_by: req.user.userId,
      });
    } catch (_) {}

    // Hoàn thành mọi NV CRM + Giao việc còn mở (Lead) trước khi gen bộ Deal.
    let convertCompleteStats = { tasks: 0, assignments: 0 };
    try {
      const {
        forceCompleteOpenCrmWorkOnLeadConvert,
        ensureActiveAssignmentForLead,
      } = require('../../../helpers/crmSequentialAssignment');
      convertCompleteStats = await forceCompleteOpenCrmWorkOnLeadConvert(req.params.id);
      if (convertCompleteStats.tasks > 0 || convertCompleteStats.assignments > 0) {
        console.log(
          `[convert-to-deal] lead=${req.params.id}: completed ${convertCompleteStats.tasks} tasks, `
          + `${convertCompleteStats.assignments} assignments`,
        );
      }
      // Gen bộ nhiệm vụ Deal (1 lần); task Lead cũ giữ DB (đã completed), UI ẩn qua filter pipeline_type.
      try {
        await autoGenCrmTasksForNewLead(req.params.id, req.user.userId, req);
      } catch (autoErr) {
        console.error('Auto-create tasks on convert-to-deal error:', autoErr.message);
      }
      try {
        await ensureActiveAssignmentForLead(req, req.params.id);
      } catch (seqErr) {
        console.warn('[convert-to-deal] sequential assignment:', seqErr.message);
      }
    } catch (completeErr) {
      console.error('[convert-to-deal] complete open work:', completeErr.message);
      try {
        await autoGenCrmTasksForNewLead(req.params.id, req.user.userId, req);
      } catch (autoErr) {
        console.error('Auto-create tasks on convert-to-deal error:', autoErr.message);
      }
    }

    // Không bootstrap Đơn 1 — chuyển Lead→Deal giữ một deal duy nhất, task trên deal đó.

    try {
      const { recordLeadConvertedKpi } = require('../../../helpers/kpiLedger');
      const kpiOwner = ownerId || updatedLead?.lead_owner_id || updatedLead?.assigned_to;
      await recordLeadConvertedKpi({
        leadId: req.params.id,
        userId: kpiOwner,
        companyId: updatedLead?.company_id || companyId,
        createdBy: req.user.userId,
      });
    } catch (kpiErr) {
      console.warn('[convert-to-deal] KPI lead_converted:', kpiErr.message);
    }

    emitCrmDashboardChanged(req, { type: 'deal', company_id: updatedLead?.company_id, lead_id: req.params.id, action: 'converted_to_deal' });
    res.status(200).json({
      lead: updatedLead,
      message: 'Đã chuyển Lead sang Deal thành công.',
    });
  } catch (e) {
    console.error('Convert to deal error:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Tùy chọn chuyển phụ trách / công ty: danh sách CT CRM + khu vực + NV theo CT đích.
 */
r.get('/leads/:id/transfer-options', async (req, res) => {
  try {
    const leadId = req.params.id;
    const { data: lead } = await supabase
      .from('crm_leads')
      .select('id, company_id, region_id, type')
      .eq('id', leadId)
      .maybeSingle();
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy lead/deal' });
    const ar0 = assertLeadReadableByRegionScope(req, lead);
    if (!ar0.ok) return res.status(403).json({ error: ar0.error });

    const companyId = req.query.company_id
      ? String(req.query.company_id).trim()
      : (lead.company_id ? String(lead.company_id) : '');
    const opts = await getTransferOptions(req, { companyId });
    if (opts.ok === false) return res.status(403).json({ error: opts.error, companies: opts.companies || [] });
    res.json({
      ...opts,
      lead: {
        id: lead.id,
        company_id: lead.company_id,
        region_id: lead.region_id,
        type: lead.type,
      },
      can_cross_company: !!isAdminLike(req.user),
    });
  } catch (e) {
    console.error('[transfer-options]', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Chuyển khu vực CRM (cùng công ty) hoặc chuyển sang công ty CRM khác (admin-like).
 * Remap pipeline/stage khi cần; sao chép khách hàng khi đổi công ty.
 */
r.post('/leads/:id/transfer-region', async (req, res) => {
  try {
    const leadId = req.params.id;
    const regionIdRaw = req.body?.region_id != null ? String(req.body.region_id).trim() : '';
    const assigneeRaw = req.body?.assigned_to != null ? String(req.body.assigned_to).trim() : '';
    const companyIdRaw = req.body?.company_id != null ? String(req.body.company_id).trim() : '';

    const result = await executeLeadCompanyTransfer(req, {
      leadId,
      companyId: companyIdRaw || undefined,
      regionId: regionIdRaw,
      assignedTo: assigneeRaw,
    });
    if (!result.ok) {
      return res.status(result.status || 400).json({
        error: result.error,
        code: result.code,
        blockers: result.blockers,
      });
    }

    let taskResync = null;
    if (result.pipelineChanged) {
      try {
        const taskLeadId = await resolveCrmTaskWriteLeadId(leadId);
        taskResync = await syncCrmTasksAfterPipelineChange(taskLeadId, req.user.userId, req);
        if (taskResync?.ok && ((taskResync.deleted || 0) > 0 || (taskResync.tasks_created || 0) > 0)) {
          await emitCrmTaskChanged(req, {
            leadId: taskLeadId,
            action: 'pipeline_resync',
            count: taskResync.tasks_created || 0,
          });
        }
      } catch (resyncErr) {
        console.warn('[transfer-region] syncCrmTasksAfterPipelineChange:', resyncErr.message);
      }
    }

    // Hydrate list select nếu có
    let responseLead = result.lead;
    try {
      const { data: hydrated } = await supabase
        .from('crm_leads')
        .select(await getCrmLeadListSelect())
        .eq('id', leadId)
        .single();
      if (hydrated) responseLead = hydrated;
    } catch (_) { /* giữ raw */ }

    try {
      const { data: actor } = await supabase.from('users').select('full_name').eq('id', req.user.userId).maybeSingle();
      const actorName = actor?.full_name || 'Người dùng';
      let fromRegion = '';
      let toRegion = '';
      let fromCompany = '';
      let toCompany = '';
      if (result.previous?.region_id) {
        const { data: fr } = await supabase.from('company_regions').select('name').eq('id', result.previous.region_id).maybeSingle();
        fromRegion = fr?.name || '';
      }
      {
        const { data: tr } = await supabase.from('company_regions').select('name').eq('id', regionIdRaw).maybeSingle();
        toRegion = tr?.name || '—';
      }
      if (result.companyChanged) {
        const { data: cos } = await supabase
          .from('companies')
          .select('id, name, short_name')
          .in('id', [result.sourceCompanyId, result.targetCompanyId]);
        const byId = Object.fromEntries((cos || []).map((c) => [String(c.id), c.short_name || c.name]));
        fromCompany = byId[String(result.sourceCompanyId)] || '';
        toCompany = byId[String(result.targetCompanyId)] || '';
      }
      const { data: nu } = await supabase.from('users').select('full_name').eq('id', assigneeRaw).maybeSingle();
      const assigneePart = ` · Người phụ trách: «${nu?.full_name || 'Nhân viên'}»`;
      let taskPart = '';
      if (result.pipelineChanged && taskResync?.ok) {
        taskPart = ` · Đã đồng bộ nhiệm vụ CRM theo pipeline mới (xóa ${taskResync.deleted || 0}, tạo ${taskResync.tasks_created || 0}).`;
      }
      let customerPart = '';
      if (result.customerResult?.copied) customerPart = ' · Đã sao chép khách hàng sang công ty đích.';
      else if (result.customerResult?.reused) customerPart = ' · Đã liên kết khách hàng trùng SĐT ở công ty đích.';

      const body = result.companyChanged
        ? `🏢 ${actorName} đã chuyển ${responseLead?.type === 'deal' ? 'Deal' : 'Lead'} sang công ty «${toCompany}»`
          + (fromCompany ? ` (trước: ${fromCompany})` : '')
          + ` · Khu vực «${toRegion}»${fromRegion ? ` (trước: ${fromRegion})` : ''}.${assigneePart}${customerPart}${taskPart}`
        : `📍 ${actorName} đã chuyển khu vực CRM thành «${toRegion}»${fromRegion ? ` (trước: ${fromRegion})` : ''}.${assigneePart}${taskPart}`;

      await logDealActivityComment(req, { leadId, body });
    } catch (_) { /* ignore activity log error */ }

    emitCrmDashboardChanged(req, {
      type: responseLead?.type || result.lead?.type,
      company_id: result.targetCompanyId,
      lead_id: leadId,
      action: result.companyChanged ? 'transfer_company' : 'transfer_region',
    });
    if (result.companyChanged && result.sourceCompanyId !== result.targetCompanyId) {
      emitCrmDashboardChanged(req, {
        type: responseLead?.type || result.lead?.type,
        company_id: result.sourceCompanyId,
        lead_id: leadId,
        action: 'transfer_company_left',
      });
    }

    res.json({
      lead: responseLead,
      message: result.companyChanged
        ? 'Đã chuyển Lead/Deal sang công ty khác thành công.'
        : 'Đã chuyển khu vực thành công.',
      company_changed: !!result.companyChanged,
      task_resync: taskResync || undefined,
      customer: result.customerResult || undefined,
    });
  } catch (e) {
    console.error('[transfer-region]', e);
    res.status(500).json({ error: e.message });
  }
});

r.post('/leads/:id/convert-to-lead', async (req, res) => {
  try {
    const { data: lead, error: leadFetchErr } = await supabase
      .from('crm_leads')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (leadFetchErr) throw leadFetchErr;
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy lead/deal' });
    if (lead.type !== 'deal') {
      return res.status(400).json({ error: 'Chỉ áp dụng cho Deal (bản ghi này đã là Lead).' });
    }
    const unlinkProject = !!req.body?.unlink_project;
    if (lead.project_id && !unlinkProject) {
      return res.status(400).json({
        error: 'Deal đã có dự án SX — tích «Gỡ liên kết dự án SX» trong form hoặc hủy/xóa dự án trước.',
        code: 'HAS_PROJECT',
        project_id: lead.project_id,
      });
    }

    // Quyền: admin công ty/khu vực hoặc đang là người phụ trách deal hiện tại.
    // Gỡ liên kết dự án SX khi trả về Lead chỉ dành cho admin công ty/khu vực.
    const uid = req.user?.userId;
    const isOwnerNow =
      uid &&
      (String(lead.assigned_to || '') === String(uid) ||
        String(lead.lead_owner_id || '') === String(uid));
    if (!userIsCrmCompanyOrRegionAdmin(req) && !isOwnerNow) {
      return res.status(403).json({ error: 'Bạn không có quyền trả deal này về Lead.' });
    }
    if (lead.project_id && unlinkProject && !userIsCrmCompanyOrRegionAdmin(req)) {
      return res.status(403).json({ error: 'Chỉ admin công ty/khu vực mới được gỡ liên kết dự án SX khi trả về Lead.' });
    }

    // Bắt buộc chọn lại người phụ trách khi trả về Lead.
    const newOwnerId = req.body?.assigned_to ? String(req.body.assigned_to).trim() : '';
    if (!newOwnerId) {
      return res.status(400).json({ error: 'Vui lòng chọn người phụ trách Lead sau khi trả về.' });
    }
    const revertReason = req.body?.reason != null ? String(req.body.reason).trim() : '';
    if (!revertReason) {
      return res.status(400).json({ error: 'Vui lòng nhập lý do trả Deal về Lead.' });
    }
    if (revertReason.length > 500) {
      return res.status(400).json({ error: 'Lý do tối đa 500 ký tự.' });
    }
    if (lead.company_id) {
      const v = await assertCrmAssigneeUserMatchesLeadCompany(supabase, newOwnerId, lead.company_id);
      if (!v.ok) return res.status(400).json({ error: v.error });
    }

    // Pipeline để chọn cột lead đầu tiên: ưu tiên pipeline hiện tại của deal,
    // fallback theo công ty (pipeline default/active).
    let pipelineForLead = lead.pipeline_id || null;
    if (!pipelineForLead && lead.company_id) {
      const { data: pls } = await supabase
        .from('crm_pipelines')
        .select('id, is_default')
        .eq('company_id', lead.company_id)
        .eq('is_active', true);
      const list = pls || [];
      const def = list.find((p) => p.is_default) || list[0];
      pipelineForLead = def?.id || null;
    }

    // Ưu tiên cột lead được đánh dấu "is_revert_to_lead_target" (Cài đặt Pipeline);
    // nếu không có cột nào được đánh dấu (hoặc chưa chạy migration) → fallback cột lead đầu tiên.
    let targetStageQ = supabase
      .from('crm_pipeline_stages')
      .select('id')
      .eq('pipeline_type', 'lead')
      .eq('is_active', true)
      .eq('is_revert_to_lead_target', true)
      .order('order_index')
      .limit(1);
    if (pipelineForLead) targetStageQ = targetStageQ.eq('pipeline_id', pipelineForLead);
    let firstLeadStage = null;
    {
      const { data: targetStage, error: targetErr } = await targetStageQ.maybeSingle();
      if (targetErr && !/is_revert_to_lead_target/.test(targetErr.message || '')) throw targetErr;
      firstLeadStage = targetStage || null;
    }
    if (!firstLeadStage) {
      let stageQ = supabase
        .from('crm_pipeline_stages')
        .select('id')
        .eq('pipeline_type', 'lead')
        .eq('is_active', true)
        .order('order_index')
        .limit(1);
      if (pipelineForLead) stageQ = stageQ.eq('pipeline_id', pipelineForLead);
      const { data: fallbackStage, error: stagePickErr } = await stageQ.maybeSingle();
      if (stagePickErr) throw stagePickErr;
      firstLeadStage = fallbackStage || null;
    }
    if (!firstLeadStage) {
      return res.status(500).json({
        error: pipelineForLead
          ? 'Không tìm thấy cột Lead đầu tiên trong pipeline. Kiểm tra cấu hình pipeline CRM.'
          : 'Không tìm thấy giai đoạn Lead đầu tiên trên hệ thống.',
      });
    }

    const nowIso = new Date().toISOString();
    const updatePayload = {
      type: 'lead',
      stage_id: firstLeadStage.id,
      pipeline_id: pipelineForLead || lead.pipeline_id || null,
      assigned_to: newOwnerId,
      lead_owner_id: newOwnerId,
      stage_entered_at: nowIso,
      updated_at: nowIso,
      lost_reason: null,
      revert_to_lead_reason: revertReason.slice(0, 500),
    };
    if (lead.project_id && unlinkProject) {
      updatePayload.project_id = null;
    }

    const { data: updatedLead, error: updateErr } = await supabase
      .from('crm_leads')
      .update(updatePayload)
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (updateErr) throw updateErr;

    try {
      const unlinkNote = lead.project_id && unlinkProject
        ? ` Đã gỡ liên kết dự án SX (${lead.project_id}) khỏi deal (không xóa dự án trên module SX).`
        : '';
      await supabase.from('crm_activities').insert({
        lead_id: req.params.id,
        type: 'note',
        title: '↩️ Trả deal về Lead',
        description: `Deal được trả về Lead. Lý do: ${revertReason.slice(0, 500)}` + unlinkNote,
        created_by: req.user.userId,
      });
    } catch (_) { /* ignore activity log error */ }

    try {
      if (newOwnerId && String(newOwnerId) !== String(req.user.userId)) {
        await createNotification(
          req,
          newOwnerId,
          'lead_assigned',
          '↩️ Lead được giao',
          `Deal "${lead.title || lead.code || ''}" đã trả về Lead và giao cho bạn phụ trách.`,
          'crm_lead',
          req.params.id,
        );
      }
    } catch (notifErr) {
      console.error('[convert-to-lead] notify error:', notifErr.message);
    }

    emitCrmDashboardChanged(req, {
      type: 'lead',
      company_id: updatedLead?.company_id,
      lead_id: req.params.id,
      action: 'reverted_to_lead',
    });
    res.status(200).json({
      lead: updatedLead,
      message: 'Đã trả Deal về Lead. Đã gán người phụ trách mới.',
    });
  } catch (e) {
    console.error('Convert to lead (revert) error:', e);
    res.status(500).json({ error: e.message });
  }
});

r.get('/leads/:id/stage-advance-check', async (req, res) => {
  try {
    const targetStageId = String(req.query.target_stage_id || '').trim();
    if (!targetStageId) return res.status(400).json({ error: 'Thiếu target_stage_id' });

    const { data: lead } = await supabase
      .from('crm_leads')
      .select('id, type, stage_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy lead/deal' });

    const { data: targetStage } = await supabase
      .from('crm_pipeline_stages')
      .select('id, name, order_index, is_won, is_lost, pipeline_type, counts_as_completed_revenue')
      .eq('id', targetStageId)
      .maybeSingle();

    // Không đổi cột → không cần kiểm tra.
    if (String(lead.stage_id || '') === String(targetStageId)) {
      return res.json({ ok: true, remaining_tasks: [] });
    }

    const { data: prevStage } = lead.stage_id
      ? await supabase
        .from('crm_pipeline_stages')
        .select('id, name, order_index, is_won, is_lost, pipeline_type')
        .eq('id', lead.stage_id)
        .maybeSingle()
      : { data: null };

    const taskGate = await assertCrmStageAdvanceAllowed({
      leadId: req.params.id,
      leadType: lead.type,
      currentStage: prevStage,
      targetStage,
    });

    if (!taskGate.ok) {
      return res.json({
        ok: false,
        code: taskGate.code,
        error: taskGate.error,
        remaining_tasks: taskGate.remaining_tasks || [],
        current_stage_id: prevStage?.id || null,
        target_stage_id: targetStageId,
      });
    }
    res.json({ ok: true, remaining_tasks: [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.patch('/leads/:id/stage', async (req, res) => {
  try {
    const {
      stage_id,
      lost_reason,
      production_company_id,
      workshop_type_id: bodyWorkshopTypeId,
      targets: bodySxTargets,
      delivery_date: bodyDeliveryDate,
      production_deadline: bodyProductionDeadline,
      production_finish_date: bodyProductionFinishDate,
      flow_id: bodyFlowId,
    } = req.body;
    const leadStageSelectWithBadges =
      'type, project_id, company_id, assigned_to, lead_owner_id, lead_type_id, use_order_tasks, parent_lead_id, stage_id, sx_handover_at, kanban_deadline_at'
      + ', sx_pipeline_stage:production_pipeline_stages(id, name, crm_sync_type)'
      + (crmSchemaCompat.vcPipelineStageAvailable
        ? ', vc_pipeline_stage:logistics_pipeline_stages(id, name, crm_sync_type)'
        : '');
    let { data: lead } = await supabase
      .from('crm_leads')
      .select(leadStageSelectWithBadges)
      .eq('id', req.params.id)
      .single();
    if (!lead) {
      // Fallback nếu chưa migrate cột kanban_deadline_at / crm_sync_type trên badge.
      ({ data: lead } = await supabase
        .from('crm_leads')
        .select('type, project_id, company_id, assigned_to, lead_owner_id, lead_type_id, use_order_tasks, parent_lead_id, stage_id, sx_handover_at')
        .eq('id', req.params.id)
        .single());
    }
    if (!(await assertDealResponsible(req, res, { leadId: req.params.id, projectId: lead?.project_id }))) return;
    
    let { data: stage } = await supabase
      .from('crm_pipeline_stages')
      .select('id, name, order_index, is_won, is_lost, pipeline_type, pipeline_id, send_zalo_on_enter, default_probability, sync_role, requires_deadline, counts_as_completed_revenue, apply_default_assignee_on_enter, default_assignee_user_id')
      .eq('id', stage_id)
      .single();
    if (!stage) {
      // Fallback nếu chưa migrate cột requires_deadline.
      ({ data: stage } = await supabase
        .from('crm_pipeline_stages')
        .select('id, name, order_index, is_won, is_lost, pipeline_type, pipeline_id, send_zalo_on_enter, default_probability, sync_role, apply_default_assignee_on_enter, default_assignee_user_id')
        .eq('id', stage_id)
        .single());
    }
    if (stage && stage.apply_default_assignee_on_enter === undefined) {
      stage.apply_default_assignee_on_enter = false;
    }
    
    // Validate: lead/deal chỉ vào cột pipeline_type khớp (lead | deal | both)
    if (!crmTemplateMatchesLeadType(stage?.pipeline_type, lead?.type)) {
      return res.status(400).json({ error: `${lead?.type === 'lead' ? 'Lead' : 'Deal'} chỉ có thể di chuyển trong pipeline riêng của nó` });
    }

    // Gate deadline: cột bật requires_deadline → bắt buộc chọn deadline khi chuyển sang (cột mới).
    const isStageChange = String(lead?.stage_id || '') !== String(stage_id || '');
    const rawDeadline = req.body?.kanban_deadline_at;
    const hasDeadlineInput = rawDeadline !== undefined && rawDeadline !== null && rawDeadline !== '';
    let parsedDeadlineTs = null;
    if (hasDeadlineInput) {
      parsedDeadlineTs = new Date(rawDeadline).getTime();
      if (Number.isNaN(parsedDeadlineTs)) {
        return res.status(400).json({ error: 'Deadline không hợp lệ' });
      }
    }
    const isStageChangeEarly = String(lead?.stage_id || '') !== String(stage_id || '');
    const { data: prevStageForGate } = isStageChangeEarly && lead?.stage_id
      ? await supabase
        .from('crm_pipeline_stages')
        .select('id, name, order_index, is_won, is_lost, pipeline_type, sync_role, counts_as_completed_revenue')
        .eq('id', lead.stage_id)
        .maybeSingle()
      : { data: null };

    const { loadWonAnchorOrderForPipeline } = require('../../../helpers/crmDealStageGate');
    const wonAnchorOrder = await loadWonAnchorOrderForPipeline(stage?.pipeline_id || lead?.pipeline_id || null);
    const stageGate = assertDealCrmManualStageChange(lead, stage, prevStageForGate, { wonAnchorOrder });
    if (!stageGate.ok) {
      return res.status(400).json({
        error: stageGate.error,
        code: stageGate.code,
        ...(stageGate.requires_production_company ? { requires_production_company: true } : {}),
      });
    }

    // Gate 1 (ưu tiên): chặn chuyển giai đoạn khi còn nhiệm vụ blocking ở giai đoạn hiện tại.
    // Phải báo TRƯỚC gate deadline để UI hiện hộp nhiệm vụ trước, rồi mới tới hộp deadline.
    if (isStageChangeEarly) {
      const prevStage = prevStageForGate;
      const taskGate = await assertCrmStageAdvanceAllowed({
        leadId: req.params.id,
        leadType: lead?.type,
        currentStage: prevStage,
        targetStage: stage,
      });
      if (!taskGate.ok) {
        return res.status(400).json({
          error: taskGate.error,
          code: taskGate.code,
          remaining_tasks: taskGate.remaining_tasks,
        });
      }
    }

    // Gate 2: cột bật requires_deadline → bắt buộc có deadline (body hoặc đã gắn trên thẻ).
    // Cột Thắng/Thua/Hoàn thành doanh thu không yêu cầu deadline.
    const leadHasDeadline = !!(lead?.kanban_deadline_at);
    if (
      isStageChange
      && stage?.requires_deadline
      && !stage?.is_won
      && !stage?.is_lost
      && !stage?.counts_as_completed_revenue
      && !hasDeadlineInput
      && !leadHasDeadline
    ) {
      return res.status(400).json({
        error: 'Cột này yêu cầu đặt deadline khi chuyển thẻ tới.',
        code: 'requires_deadline',
        requires_deadline: true,
        stage_id: stage.id,
        stage_name: stage.name,
      });
    }

    const requiresProductionPick = lead?.type === 'deal' && !lead?.project_id && !!stage?.is_won;

    let effectiveProductionCompanyId = null;
    const sxTargets = Array.isArray(bodySxTargets) && bodySxTargets.length
      ? bodySxTargets
      : null;
    if (requiresProductionPick) {
      if (sxTargets) {
        for (const t of sxTargets) {
          const cid = t?.production_company_id || t?.company_id;
          if (!cid) {
            return res.status(400).json({ error: 'Mỗi dòng SX cần chọn công ty', requires_production_company: true });
          }
          if (!t?.workshop_type_id) {
            return res.status(400).json({ error: 'Mỗi dòng SX cần chọn phân loại sản xuất' });
          }
          const v = await validateProductionCompanyId(cid);
          if (!v.ok) {
            return res.status(400).json({ error: v.error, requires_production_company: true });
          }
        }
        effectiveProductionCompanyId = sxTargets[0].production_company_id || sxTargets[0].company_id;
      } else {
        effectiveProductionCompanyId = await resolveProductionCompanyForDealStage(req.params.id, production_company_id);
        const v = await validateProductionCompanyId(effectiveProductionCompanyId);
        if (!v.ok) {
          return res.status(400).json({ error: v.error, requires_production_company: true });
        }
      }
    }

    // For leads: if moving to "Chuyển Deal" stage, return error requesting convert-to-deal
    if (lead?.type === 'lead' && stage?.is_won) {
      return res.status(400).json({ 
        error: 'Vui lòng dùng nút "Chuyển sang Deal" để chuyển lead thành deal',
        requires_conversion: true 
      });
    }
    
    const updates = { stage_id, updated_at: new Date().toISOString() };
    if (String(lead?.stage_id || '') !== String(stage_id || '')) {
      updates.stage_entered_at = new Date().toISOString();
    }
    // Deadline thủ công cho thẻ (đặt khi kéo sang cột yêu cầu deadline).
    if (hasDeadlineInput) {
      updates.kanban_deadline_at = new Date(parsedDeadlineTs).toISOString();
      const reason = (req.body?.deadline_reason || '').toString().trim();
      updates.kanban_deadline_reason = reason || null;
    }
    // Đồng bộ % xác suất theo cấu hình của cột pipeline (nếu có).
    // Mục tiêu: kéo lead/deal sang cột nào thì probability tự nhảy theo % của cột đó.
    if (stage?.default_probability !== undefined && stage?.default_probability !== null && stage?.default_probability !== '') {
      const p = Number(stage.default_probability);
      if (Number.isFinite(p)) {
        updates.probability = Math.max(0, Math.min(100, Math.round(p)));
      }
    }
    if (stage?.is_won) {
      updates.actual_close_date = new Date().toISOString().split('T')[0];
      // Deal thắng — không còn theo dõi deadline thẻ.
      updates.kanban_deadline_at = null;
      updates.kanban_deadline_reason = null;
    }
    if (stage?.counts_as_completed_revenue) {
      updates.kanban_deadline_at = null;
      updates.kanban_deadline_reason = null;
    }
    let stageAssigneeTransfer = null;
    const applyDefaultAssignee = req.body?.apply_default_assignee === true;
    const assigneeOverride = normalizeCrmStageDefaultAssigneeUserId(req.body?.assignee_user_id);
    if (isStageChange) {
      const prevAssigneeId = String(lead?.assigned_to || lead?.lead_owner_id || '').trim() || null;
      await mergeCrmStageDefaultAssigneeIntoUpdates(updates, {
        stage,
        lead,
        isStageChange: true,
        applyDefaultAssignee,
        assigneeUserId: assigneeOverride,
        sb: supabase,
      });
      const newAssigneeId = updates.assigned_to ? String(updates.assigned_to).trim() : null;
      if (newAssigneeId && newAssigneeId !== prevAssigneeId) {
        stageAssigneeTransfer = {
          prevAssigneeId,
          newAssigneeId,
          stageName: stage?.name || '',
        };
      }
    }
    // Bàn giao SX: khóa người phụ trách CRM — NV xưởng gán qua project_production_staff sau auto-create.
    stripCrmAssigneeFromWonStageUpdates(updates, {
      leadType: lead?.type,
      isWon: !!stage?.is_won,
      requiresProductionPick,
    });
    if (stageAssigneeTransfer && !updates.assigned_to) {
      stageAssigneeTransfer = null;
    }
    if (stage?.is_lost) {
      updates.lost_reason = lost_reason || null;
      updates.actual_close_date = new Date().toISOString().split('T')[0];
    } else {
      if (lead?.lost_reason) updates.lost_reason = null;
      // Rời cột Thắng / Thua → bỏ ngày chốt để UI & KPI không coi deal còn «đã kết thúc»
      if (!stage?.is_won) {
        updates.actual_close_date = null;
      }
    }
    
    let { data: updatedLeadRow, error } = await supabase.from('crm_leads').update(updates).eq('id', req.params.id).select('*').single();
    if (error && /kanban_deadline/.test(error.message || '')) {
      delete updates.kanban_deadline_at;
      delete updates.kanban_deadline_reason;
      ({ data: updatedLeadRow, error } = await supabase.from('crm_leads').update(updates).eq('id', req.params.id).select('*').single());
      if (!error && hasDeadlineInput) {
        return res.status(503).json({
          error: 'Chưa cài đặt cột deadline trên database. Chạy migration database/280_crm_kanban_deadline.sql',
          code: 'migration_required',
        });
      }
    }
    if (error) throw error;
    let responseLead = updatedLeadRow;

    if (stageAssigneeTransfer) {
      const appliedId = String(updatedLeadRow?.assigned_to || updatedLeadRow?.lead_owner_id || '').trim();
      if (appliedId === stageAssigneeTransfer.newAssigneeId) {
        try {
          await postCrmStageDefaultAssigneeComment(req, notifyMultiple, {
            leadId: req.params.id,
            senderId: req.user.userId,
            newAssigneeId: stageAssigneeTransfer.newAssigneeId,
            previousAssigneeId: stageAssigneeTransfer.prevAssigneeId,
            stageName: stageAssigneeTransfer.stageName,
            leadType: lead?.type,
          });
        } catch (assigneeCommentErr) {
          console.warn('[crm/stage] postCrmStageDefaultAssigneeComment:', assigneeCommentErr.message);
        }
      }
    }

    // Bổ sung nhiệm vụ CRM thiếu theo bộ mẫu của cột đích (chỉ thêm phần chưa có).
    // Cột hoàn thành: không gen thêm NV — đóng hết NV + deadline CRM còn mở.
    if (isStageChange && stage_id && isCrmCompletedStage(stage)) {
      try {
        const done = await completeOpenWorkOnModuleDone({
          module: 'crm',
          leadIds: [req.params.id],
          projectIds: lead?.project_id ? [lead.project_id] : [],
        });
        if (done.crm_tasks > 0) {
          await emitCrmTaskChanged(req, {
            leadId: req.params.id,
            action: 'bulk_completed',
            count: done.crm_tasks,
          });
        }
      } catch (doneErr) {
        console.warn('[crm/stage] complete open CRM work:', doneErr.message);
      }
    } else if (isStageChange && stage_id) {
      try {
        const taskLeadId = await resolveCrmTaskWriteLeadId(req.params.id);
        const ensureResult = await ensureMissingCrmTasksForPipelineStage({
          leadId: taskLeadId,
          pipelineStageId: stage_id,
          userId: req.user.userId,
          req,
        });
        if (ensureResult.created > 0) {
          console.log(
            `[crm/stage] ensure missing tasks: +${ensureResult.created} for lead=${taskLeadId} stage=${stage_id}`,
          );
          await emitCrmTaskChanged(req, {
            leadId: taskLeadId,
            action: 'bulk_created',
            count: ensureResult.created,
          });
        }
      } catch (ensureErr) {
        console.warn('[crm/stage] ensureMissingCrmTasksForPipelineStage:', ensureErr.message);
      }
    }

    // Ghi lịch sử deadline khi đặt deadline lúc chuyển cột.
    if (hasDeadlineInput) {
      const dlReason = (req.body?.deadline_reason || '').toString().trim() || null;
      const newDlIso = new Date(parsedDeadlineTs).toISOString();
      try {
        await supabase.from('crm_lead_deadline_history').insert({
          lead_id: req.params.id,
          stage_id,
          old_deadline_at: lead?.kanban_deadline_at || null,
          new_deadline_at: newDlIso,
          reason: dlReason,
          source: 'stage_move',
          changed_by: req.user.userId,
        });
      } catch (histErr) {
        console.warn('[crm/stage] deadline history:', histErr.message);
      }
      await logKanbanDeadlineUnifiedHistory({
        leadId: req.params.id,
        companyId: lead?.company_id,
        actorUserId: req.user.userId,
        oldDeadlineAt: lead?.kanban_deadline_at || null,
        newDeadlineAt: newDlIso,
        reason: dlReason,
        source: 'stage_move',
      });
    }

    // Refresh kèm join SX/VC để frontend cập nhật badge ngay (không phải đợi silent reload).
    try {
      const vcJoin = crmSchemaCompat.vcPipelineStageAvailable
        ? ', vc_pipeline_stage:logistics_pipeline_stages(id, name, color, icon, bucket_slug)'
        : '';
      const { data: refreshedWithBadges } = await supabase
        .from('crm_leads')
        .select(`*, sx_pipeline_stage:production_pipeline_stages(id, name, color, icon, bucket_slug, company:companies(id, name, short_name))${vcJoin}`)
        .eq('id', req.params.id)
        .single();
      if (refreshedWithBadges) responseLead = refreshedWithBadges;
    } catch (badgeErr) {
      console.warn('[crm/stage] refresh badges:', badgeErr.message);
    }

    // 🔔 NOTIFICATION: Lead/Deal đổi giai đoạn
    try {
      const { data: pStageInfo } = await supabase.from('crm_pipeline_stages')
        .select('name').eq('id', stage_id).single();
      const { data: leadInfo } = await supabase.from('crm_leads')
        .select('title, assigned_to, lead_owner_id').eq('id', req.params.id).single();
      const ownerIds = [leadInfo?.assigned_to, leadInfo?.lead_owner_id].filter(Boolean);
      if (ownerIds.length && !stage?.is_won) {
        await notifyMultiple(req, ownerIds, 'lead_stage_changed',
          `🔄 ${lead?.type === 'deal' ? 'Deal' : 'Lead'} chuyển giai đoạn`,
          `"${leadInfo?.title}" → ${pStageInfo?.name || 'Giai đoạn mới'}`,
          lead?.type === 'deal' ? 'crm_deal' : 'crm_lead', req.params.id);
      }
    } catch (ne) { console.warn('[NOTIFY] stage_changed:', ne.message); }

    // Deal → Thắng: tự tạo dự án xưởng server-side; nếu lỗi / thiếu luồng → trả deal_won cho modal
    let dealWonData = null;
    let projectAutoCreated = null;
    if (lead?.type === 'deal' && !lead?.project_id && stage?.is_won) {
      const { data: dealData } = await supabase.from('crm_leads')
        .select('*, customer:customers(id, full_name, phone, email, address)')
        .eq('id', req.params.id).single();

      if (stage?.is_won) {
        // Notify + activity không chặn tạo dự án
        const wonDealId = req.params.id;
        const wonTitle = dealData?.title;
        const wonValue = dealData?.estimated_value || 0;
        const wonCompanyId = dealData?.company_id;
        const wonUserId = req.user.userId;
        setImmediate(() => {
          void (async () => {
            try {
              const adminIds = await getCompanyScopedAdminIds(wonCompanyId);
              if (adminIds.length > 0) {
                await notifyMultiple(req, adminIds, 'deal_won',
                  '🏆 Deal Thắng',
                  `Deal "${wonTitle}" - Giá trị: ${Number(wonValue).toLocaleString('vi-VN')} VND`,
                  'crm_deal', wonDealId, { ecosystem_module_key: 'crm', company_id: wonCompanyId || null });
              }
            } catch (ne) {
              console.warn('[crm/stage] deal_won notify:', ne.message);
            }
            try {
              await supabase.from('crm_activities').insert({
                lead_id: wonDealId, type: 'note',
                title: '🎉 Deal Thắng!',
                description: `Deal "${wonTitle}" đã chốt thành công.`,
                created_by: wonUserId,
              });
            } catch (_) { /* ignore */ }
          })();
        });
      }

      const auto = await autoCreateProjectFromWonDeal({
        req,
        dealId: req.params.id,
        userId: req.user.userId,
        productionCompanyId: effectiveProductionCompanyId,
        workshopTypeId: bodyWorkshopTypeId || null,
        targets: sxTargets,
        flowId: bodyFlowId || null,
        projectDates: {
          delivery_date: bodyDeliveryDate || null,
          production_deadline: bodyProductionDeadline || bodyDeliveryDate || null,
          production_finish_date: bodyProductionFinishDate || null,
        },
      });

      if (auto.ok) {
        projectAutoCreated = {
          project_id: auto.project_id,
          project_code: auto.project_code,
          tasks_created: auto.tasks_created,
          projects: auto.projects || null,
          primary_project_id: auto.primary_project_id || auto.project_id,
          partial: auto.partial || false,
          partial_error: auto.partial_error || null,
          warning: auto.warning || null,
          background_pending: !!auto.background_pending,
        };
        const respCompanies = auto.projects?.length
          ? [...new Set(auto.projects.map((p) => p.company_id).filter(Boolean))]
          : (effectiveProductionCompanyId ? [effectiveProductionCompanyId] : []);
        await Promise.all(respCompanies.map(async (pcId) => {
          try {
            await assignProductionCompanyDealResponsibility({
              dealId: req.params.id,
              productionCompanyId: pcId,
              projectId: auto.projects?.find((p) => String(p.company_id) === String(pcId))?.project_id
                || auto.project_id,
            });
          } catch (respErr) {
            console.warn('[crm/stage] assign production company responsible:', respErr.message);
          }
        }));
      } else {
        const { data: flows } = await supabase.from('workflow_flows')
          .select('id, name, description, is_default').eq('is_active', true).order('is_default', { ascending: false });
        const { data: tplSets } = await supabase.from('company_template_sets')
          .select('id, name, is_default, company_id')
          .or(`company_id.eq.${dealData?.company_id || '00000000-0000-0000-0000-000000000000'},company_id.is.null`)
          .order('is_default', { ascending: false });

        for (const ts of tplSets || []) {
          const { count } = await supabase.from('company_template_tasks')
            .select('id', { count: 'exact', head: true }).eq('template_set_id', ts.id);
          ts.task_count = count || 0;
        }

        dealWonData = {
          deal: dealData,
          flows: flows || [],
          template_sets: (tplSets || []).filter(s => s.task_count > 0),
          auto_project_error: auto.error || null,
        };
      }
    }

    setImmediate(() => {
      maybeSendZaloOnDealStageEnter({
        leadId: req.params.id,
        stageId: stage_id,
        pipelineType: stage?.pipeline_type,
        sendZaloOnEnter: !!stage?.send_zalo_on_enter,
      }).catch((err) => console.error('[Zalo OA] maybeSend:', err.message));
    });

    emitCrmDashboardChanged(req, { type: lead?.type, company_id: lead?.company_id, lead_id: req.params.id, action: 'stage_changed', stage_id });

    if (isStageChange && stage?.name) {
      await logDealStageChangeComment(req, {
        leadId: req.params.id,
        projectId: responseLead?.project_id || lead?.project_id,
        stageName: stage.name,
      });
    }
    if (hasDeadlineInput && parsedDeadlineTs) {
      await logDealDeadlineChangeComment(req, {
        leadId: req.params.id,
        projectId: responseLead?.project_id || lead?.project_id,
        newDeadlineAt: new Date(parsedDeadlineTs).toISOString(),
      });
    }

    // CRM → SX: Sale kéo deal sang cột «Sản xuất» (sync_role) → gán Kanban xưởng + bổ sung nhiệm vụ SX thiếu
    if (lead?.type === 'deal' && stage?.sync_role === 'sx_production') {
      const pidForSx = projectAutoCreated?.project_id || responseLead?.project_id || lead?.project_id;
      if (pidForSx) {
        try {
          const sxSync = await syncSxKanbanFromCrmProductionStage(req.params.id);
          if (sxSync?.ok && sxSync.sx_pipeline_stage_id) {
            try {
              const sxTpl = await applyProductionTemplatesOnPipelineEnter({
                projectId: pidForSx,
                pipelineStageId: sxSync.sx_pipeline_stage_id,
                userId: req.user.userId,
                req,
              });
              if (sxTpl?.created > 0) {
                console.log(
                  `[crm/stage] SX templates on CRM→SX: project=${pidForSx} stage=${sxSync.sx_pipeline_stage_id} +${sxTpl.created}`,
                );
              }
            } catch (tplErr) {
              console.warn('[crm/stage] applyProductionTemplatesOnPipelineEnter:', tplErr.message);
            }
          }
        } catch (sxErr) {
          console.warn('[crm/stage] syncSxKanbanFromCrmProductionStage:', sxErr.message);
        }
      }
    }

    // Cuối luồng: sync + refresh badge SX/VC (sau auto-create / gen sx_*) để response và socket không mất tag.
    if (lead?.type === 'deal') {
      const pid =
        projectAutoCreated?.project_id ||
        responseLead?.project_id ||
        lead?.project_id ||
        null;
      if (pid) {
        try {
          // keepCrmStageLeadIds: giữ đúng cột Sale vừa kéo — sync chỉ làm mới badge SX.
          await syncCrmLeadSxPipelineFromProject(pid, { keepCrmStageLeadIds: [req.params.id] });
        } catch (se) {
          console.warn('[crm/stage] sync sx_pipeline_stage_id (final):', se.message);
        }
        try {
          const freshBadges = await fetchCrmLeadWithPipelineBadges(req.params.id);
          if (freshBadges) responseLead = freshBadges;
        } catch (badgeFinalErr) {
          console.warn('[crm/stage] refresh badges (final):', badgeFinalErr.message);
        }
        try {
          const io = req.app.get('io');
          if (io) await emitCrmBadgeUpdateForProject(pid, io);
        } catch (emitErr) {
          console.warn('[crm/stage] emitCrmBadgeUpdateForProject:', emitErr.message);
        }
      }
    }

    res.json({ ...responseLead, deal_won: dealWonData, project_auto_created: projectAutoCreated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.patch('/leads/:id/deadline', async (req, res) => {
  try {
    const leadId = String(req.params.id || '').trim();
    const { data: lead } = await supabase
      .from('crm_leads')
      .select('id, type, company_id, stage_id, title, assigned_to, lead_owner_id, kanban_deadline_at')
      .eq('id', leadId)
      .maybeSingle();
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy lead/deal' });
    if (!(await assertDealResponsible(req, res, { leadId, projectId: lead.project_id }))) return;

    const { data: leadStage } = lead.stage_id
      ? await supabase
        .from('crm_pipeline_stages')
        .select('is_won, is_lost, counts_as_completed_revenue')
        .eq('id', lead.stage_id)
        .maybeSingle()
      : { data: null };
    if (leadStage?.is_won || leadStage?.counts_as_completed_revenue) {
      return res.status(400).json({ error: 'Deal đã chốt/hoàn thành — không đặt deadline', code: 'stage_terminal' });
    }

    const raw = req.body?.kanban_deadline_at;
    const clearing = raw === null || raw === '';
    let newIso = null;
    if (!clearing) {
      const ts = new Date(raw).getTime();
      if (Number.isNaN(ts)) return res.status(400).json({ error: 'Deadline không hợp lệ' });
      newIso = new Date(ts).toISOString();
    }

    const reason = (req.body?.reason || '').toString().trim();
    // Bắt buộc lý do khi thẻ ĐÃ có deadline (sửa/đổi/xóa).
    if (lead.kanban_deadline_at && !reason) {
      return res.status(400).json({ error: 'Vui lòng nhập lý do thay đổi deadline', code: 'reason_required' });
    }
    // Không đổi gì thì thôi.
    if (String(lead.kanban_deadline_at || '') === String(newIso || '')) {
      return res.json({ ok: true, unchanged: true, kanban_deadline_at: lead.kanban_deadline_at });
    }

    const { error: upErr } = await supabase
      .from('crm_leads')
      .update({
        kanban_deadline_at: newIso,
        kanban_deadline_reason: reason || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId);
    if (upErr) throw upErr;

    try {
      await supabase.from('crm_lead_deadline_history').insert({
        lead_id: leadId,
        stage_id: lead.stage_id || null,
        old_deadline_at: lead.kanban_deadline_at || null,
        new_deadline_at: newIso,
        reason: reason || null,
        source: 'manual_edit',
        changed_by: req.user.userId,
      });
    } catch (histErr) {
      console.warn('[crm/deadline] history:', histErr.message);
    }

    await logKanbanDeadlineUnifiedHistory({
      leadId,
      companyId: lead.company_id,
      actorUserId: req.user.userId,
      oldDeadlineAt: lead.kanban_deadline_at || null,
      newDeadlineAt: newIso,
      reason,
      source: 'manual_edit',
    });

    emitCrmDashboardChanged(req, { type: lead.type, company_id: lead.company_id, lead_id: leadId, action: 'deadline_changed' });

    const { data: leadProj } = await supabase.from('crm_leads').select('project_id').eq('id', leadId).maybeSingle();
    await logDealDeadlineChangeComment(req, {
      leadId,
      projectId: leadProj?.project_id,
      newDeadlineAt: newIso,
      cleared: !newIso,
    });

    res.json({ ok: true, kanban_deadline_at: newIso, kanban_deadline_reason: reason || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Tắt/bật lại toàn bộ nguồn deadline của Lead/Deal.
 * Khi tắt: xóa deadline thẻ + deadline các nhiệm vụ CRM đang mở và dùng
 * deadline_disabled_at để bỏ qua SLA cột / ngày dự kiến chốt trên view Deadline.
 */
r.patch('/leads/:id/deadline/disable-all', async (req, res) => {
  try {
    const leadId = String(req.params.id || '').trim();
    const disabled = req.body?.disabled !== false;
    const reason = String(req.body?.reason || '').trim();
    if (disabled && reason.length < 3) {
      return res.status(400).json({
        error: 'Vui lòng nhập lý do tắt deadline (ít nhất 3 ký tự).',
        code: 'reason_required',
      });
    }

    const { data: lead, error: leadErr } = await supabase
      .from('crm_leads')
      .select(
        'id, type, company_id, project_id, stage_id, title, assigned_to, lead_owner_id, '
        + 'kanban_deadline_at, deadline_disabled_at, deadline_disabled_reason',
      )
      .eq('id', leadId)
      .maybeSingle();
    if (leadErr) throw leadErr;
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy lead/deal' });
    if (!(await assertDealResponsible(req, res, { leadId, projectId: lead.project_id }))) return;

    if (disabled && lead.deadline_disabled_at) {
      return res.json({
        ok: true,
        unchanged: true,
        deadline_disabled_at: lead.deadline_disabled_at,
        deadline_disabled_reason: lead.deadline_disabled_reason,
      });
    }
    if (!disabled && !lead.deadline_disabled_at) {
      return res.json({ ok: true, unchanged: true, deadline_disabled_at: null });
    }

    const now = new Date().toISOString();
    const leadPatch = disabled
      ? {
        deadline_disabled_at: now,
        deadline_disabled_reason: reason,
        deadline_disabled_by: req.user.userId,
        kanban_deadline_at: null,
        kanban_deadline_reason: reason,
        updated_at: now,
      }
      : {
        deadline_disabled_at: null,
        deadline_disabled_reason: null,
        deadline_disabled_by: null,
        updated_at: now,
      };

    const { data: updated, error: updateErr } = await supabase
      .from('crm_leads')
      .update(leadPatch)
      .eq('id', leadId)
      .select(
        'id, deadline_disabled_at, deadline_disabled_reason, deadline_disabled_by, '
        + 'kanban_deadline_at, kanban_deadline_reason',
      )
      .single();
    if (updateErr) throw updateErr;

    let clearedTaskDeadlines = 0;
    if (disabled) {
      const { data: openTasks, error: taskReadErr } = await supabase
        .from('crm_tasks')
        .select('id')
        .eq('lead_id', leadId)
        .not('deadline', 'is', null);
      if (taskReadErr) throw taskReadErr;
      const taskIds = (openTasks || []).map((t) => t.id);
      if (taskIds.length) {
        const { error: taskUpdateErr } = await supabase
          .from('crm_tasks')
          .update({ deadline: null, updated_at: now })
          .in('id', taskIds);
        if (taskUpdateErr) throw taskUpdateErr;
        clearedTaskDeadlines = taskIds.length;
      }

      try {
        await supabase.from('crm_lead_deadline_history').insert({
          lead_id: leadId,
          stage_id: lead.stage_id || null,
          old_deadline_at: lead.kanban_deadline_at || null,
          new_deadline_at: null,
          reason,
          source: 'disable_all',
          changed_by: req.user.userId,
        });
      } catch (histErr) {
        console.warn('[crm/deadline/disable-all] history:', histErr.message);
      }
    }

    try {
      const actionText = disabled ? 'tắt toàn bộ deadline' : 'bật lại deadline';
      const reasonText = reason ? ` Lý do: ${reason}` : '';
      await logDealActivityComment(req, {
        leadId,
        body: `⏱️ Đã ${actionText}.${reasonText}`,
      });
    } catch (_) { /* ignore activity log */ }

    emitCrmDashboardChanged(req, {
      type: lead.type,
      company_id: lead.company_id,
      lead_id: leadId,
      action: disabled ? 'deadline_disabled' : 'deadline_enabled',
    });

    res.json({
      ok: true,
      disabled,
      ...updated,
      cleared_task_deadlines: clearedTaskDeadlines,
    });
  } catch (e) {
    console.error('[crm/deadline/disable-all]', e);
    res.status(500).json({ error: e.message });
  }
});

r.get('/leads/:id/deadline-history', async (req, res) => {
  try {
    const leadId = String(req.params.id || '').trim();
    const { data, error } = await supabase
      .from('crm_lead_deadline_history')
      .select('id, old_deadline_at, new_deadline_at, reason, source, created_at, changed_by, changer:users!crm_lead_deadline_history_changed_by_fkey(id, full_name), stage:crm_pipeline_stages!crm_lead_deadline_history_stage_id_fkey(id, name, color, icon)')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/leads/:id/reopen', async (req, res) => {
  try {
    const leadId = String(req.params.id || '').trim();
    const { data: lead } = await supabase
      .from('crm_leads')
      .select('id, type, stage_id, company_id, pipeline_id, lost_reason, title')
      .eq('id', leadId)
      .single();
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy lead/deal' });

    const sac = scopedAdminCompanyId(req);
    if (sac && String(lead.company_id || '') !== String(sac)) {
      return res.status(403).json({ error: 'Không có quyền thao tác lead/deal của công ty khác' });
    }
    const ar = assertLeadReadableByRegionScope(req, lead);
    if (!ar.ok) return res.status(403).json({ error: ar.error });

    const { data: curStage } = await supabase
      .from('crm_pipeline_stages')
      .select('is_lost')
      .eq('id', lead.stage_id)
      .maybeSingle();
    const isClosedLost = !!lead.lost_reason || !!curStage?.is_lost;
    if (!isClosedLost) {
      return res.status(400).json({ error: 'Lead/deal chưa ở trạng thái thua hoặc đã hủy.' });
    }

    const targetStageId = await resolveReopenTargetStageId(lead, req.body?.stage_id);
    const { data: targetStage } = await supabase
      .from('crm_pipeline_stages')
      .select('name, default_probability')
      .eq('id', targetStageId)
      .single();

    const updates = {
      stage_id: targetStageId,
      lost_reason: null,
      actual_close_date: null,
      stage_entered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (targetStage?.default_probability !== undefined && targetStage?.default_probability !== null && targetStage?.default_probability !== '') {
      const p = Number(targetStage.default_probability);
      if (Number.isFinite(p)) {
        updates.probability = Math.max(0, Math.min(100, Math.round(p)));
      }
    }

    const { data: updated, error } = await supabase
      .from('crm_leads')
      .update(updates)
      .eq('id', leadId)
      .select('*')
      .single();
    if (error) throw error;

    try {
      await supabase.from('crm_activities').insert({
        lead_id: leadId,
        type: 'note',
        title: lead.type === 'deal' ? '↩️ Hồi lại deal' : '↩️ Hồi lại lead',
        description: `Đã mở lại từ trạng thái thua/mất → ${targetStage?.name || 'giai đoạn mới'}`,
        created_by: req.user?.userId,
      });
    } catch (_) { /* ignore */ }

    emitCrmDashboardChanged(req, {
      type: lead.type,
      company_id: lead.company_id,
      lead_id: leadId,
      action: 'reopened',
      stage_id: targetStageId,
    });

    let responseLead = updated;
    try {
      responseLead = await fetchCrmLeadWithPipelineBadges(leadId);
    } catch (_) {
      /* optional badges */
    }

    res.json(responseLead);
  } catch (e) {
    const msg = e.message || 'Lỗi hồi lại deal';
    const status = /không tìm|không hợp lệ|chưa ở trạng thái/i.test(msg) ? 400 : 500;
    res.status(status).json({ error: msg });
  }
});

r.get('/leads/:id/activities', async (req, res) => {
  const { data } = await supabase.from('crm_activities')
    .select('*, creator:users!crm_activities_created_by_fkey(id, full_name)')
    .eq('lead_id', req.params.id)
    .order('activity_date', { ascending: false });
  res.json(data || []);
});

r.post('/leads/:id/activities/upload', crmNoteActivityUpload.single('file'), async (req, res) => {
  try {
    const uid = req.user?.userId ?? req.user?.id;
    if (!uid) return res.status(401).json({ error: 'Token không có user id' });
    if (!req.file) return res.status(400).json({ error: 'Không có file' });
    const url = `/uploads/lead-chat/${req.file.filename}`;
    res.json({
      url,
      name: req.file.originalname || req.file.filename,
      type: req.file.mimetype || 'application/octet-stream',
      size: req.file.size || 0,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/leads/:id/project-setup', async (req, res) => {
  try {
    const { data: deal } = await supabase.from('crm_leads')
      .select('*, customer:customers(id, full_name, phone, email, address)')
      .eq('id', req.params.id).single();
    if (!deal) return res.status(404).json({ error: 'Không tìm thấy' });

    const { data: flows } = await supabase.from('workflow_flows')
      .select('id, name, description, is_default').eq('is_active', true).order('is_default', { ascending: false });
    const { data: tplSets } = await supabase.from('company_template_sets')
      .select('id, name, is_default, company_id')
      .or(`company_id.eq.${deal.company_id || '00000000-0000-0000-0000-000000000000'},company_id.is.null`)
      .order('is_default', { ascending: false });

    for (const ts of tplSets || []) {
      const { count } = await supabase.from('company_template_tasks')
        .select('id', { count: 'exact', head: true }).eq('template_set_id', ts.id);
      ts.task_count = count || 0;
    }

    res.json({
      deal,
      flows: flows || [],
      template_sets: (tplSets || []).filter(s => s.task_count > 0),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/leads/:id/preview-project-tasks', async (req, res) => {
  try {
    const tplSetId = req.query.template_set_id;
    if (!tplSetId) return res.json([]);
    const { data: tasks } = await supabase.from('company_template_tasks')
      .select('id, title, description, stage_id, order_index, priority, estimated_hours, stage:workflow_stages!inner(id, name, slug, order_index)')
      .eq('template_set_id', tplSetId)
      .order('stage_id').order('order_index');
    
    const CRM_SLUGS = ['consulting', 'design', 'quotation', 'contract'];
    const grouped = {};
    for (const t of tasks || []) {
      const slug = t.stage?.slug?.replace(/-[a-f0-9]+$/, '') || '';
      const isCRM = CRM_SLUGS.includes(slug);
      const stageKey = t.stage_id;
      if (!grouped[stageKey]) {
        grouped[stageKey] = {
          stage_id: t.stage_id,
          stage_name: t.stage?.name || 'Không rõ',
          stage_order: t.stage?.order_index || 0,
          is_crm: isCRM,
          tasks: [],
        };
      }
      const checklists = DEFAULT_CHECKLISTS[t.title] || [];
      grouped[stageKey].tasks.push({
        title: t.title,
        description: t.description,
        priority: t.priority || 'medium',
        estimated_hours: t.estimated_hours,
        is_crm: isCRM,
        checklists,
      });
    }
    const result = Object.values(grouped).sort((a, b) => a.stage_order - b.stage_order);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/leads/:id/create-project', async (req, res) => {
  try {
    const { flow_id, template_set_id, project_name } = req.body;
    const dealId = req.params.id;

    // Load deal
    const { data: deal } = await supabase.from('crm_leads')
      .select('*, customer:customers(id, full_name, phone, email, address)')
      .eq('id', dealId).single();
    if (!deal) return res.status(404).json({ error: 'Deal không tồn tại' });
    if (deal.project_id) return res.status(400).json({ error: 'Deal đã có dự án', project_id: deal.project_id });

    const yr = new Date().getFullYear();
    const { data: firstStage } = await supabase.from('workflow_stages')
      .select('id').eq('slug', 'consulting').limit(1).single();

    const makeRow = (code) => ({
      code,
      name: project_name || deal.title || 'Dự án mới',
      description: deal.description || `Dự án từ Deal ${deal.code}`,
      customer_id: deal.customer_id || null,
      company_id: deal.company_id || null,
      status: 'consulting',
      current_stage_id: firstStage?.id || null,
      flow_id: flow_id || null,
      install_address: deal.customer?.address || null,
      estimated_value: deal.estimated_value || null,
      priority: 'medium',
      sales_person_id: deal.assigned_to || null,
      consult_date: new Date().toISOString(),
    });

    let project;
    let lastInsertErr;
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const code = await nextTbProjectCode(supabase, yr);
      const { data, error: projErr } = await supabase
        .from('projects')
        .insert(makeRow(code))
        .select()
        .single();
      if (!projErr) {
        project = data;
        break;
      }
      lastInsertErr = projErr;
      if (isPostgresUniqueViolation(projErr)) continue;
      throw projErr;
    }
    if (!project) throw lastInsertErr || new Error('Trùng mã dự án');

    // Link deal → project
    await supabase.from('crm_leads').update({ project_id: project.id }).eq('id', dealId);

    try {
      await ensureDealLeadDocumentsForModuleTransition({ leadId: dealId, projectId: project.id });
    } catch (e) {
      console.warn('[CREATE PROJECT] ensure lead_documents:', e.message);
    }

    // Auto move into workshop module immediately after deal won.
    const CRM_SLUGS = ['consulting', 'design', 'quotation', 'contract'];
    const WORKSHOP_SLUGS = ['production', 'delivery', 'customer-care'];
    let taskCount = 0, checkCount = 0, doneCount = 0;

    if (template_set_id) {
      const { data: tplTasks } = await supabase.from('company_template_tasks')
        .select('*, stage:workflow_stages!inner(slug)')
        .eq('template_set_id', template_set_id).order('stage_id').order('order_index');

      if (tplTasks?.length) {
        const taskInserts = tplTasks.map(t => {
          const slug = t.stage?.slug?.replace(/-[a-f0-9]+$/, '') || '';
          const isCRM = CRM_SLUGS.includes(slug);
          return {
            project_id: project.id, stage_id: t.stage_id,
            title: t.title, description: t.description || null,
            status: isCRM ? 'done' : 'pending',
            priority: t.priority || 'medium',
            order_index: t.order_index,
            estimated_hours: t.estimated_hours || null,
            completed_at: isCRM ? new Date().toISOString() : null,
            created_by_id: req.user.userId,
          };
        });
        const { data: created } = await supabase.from('tasks').insert(taskInserts).select('id, title, status');
        taskCount = (created || []).length;
        doneCount = (created || []).filter(t => t.status === 'done').length;

        // Gen checklists
        const checkInserts = [];
        for (const t of created || []) {
          const items = DEFAULT_CHECKLISTS[t.title];
          if (items?.length) {
            const isCRM = t.status === 'done';
            items.forEach((c, i) => checkInserts.push({
              task_id: t.id, title: c, order_index: i,
              is_completed: isCRM,
              completed_at: isCRM ? new Date().toISOString() : null,
            }));
          }
        }
        if (checkInserts.length) {
          await supabase.from('task_checklists').insert(checkInserts);
          checkCount = checkInserts.length;
        }
      }
    }

    // Fallback if no tasks
    if (taskCount === 0) {
      const { data: stages } = await supabase.from('workflow_stages')
        .select('id, name, slug')
        .in('slug', ['consulting','design','quotation','contract','production','delivery','shipping','installation','customer-care'])
        .order('order_index');
      if (stages?.length) {
        const fallback = stages.map(s => ({
          project_id: project.id, stage_id: s.id,
          title: `Công việc ${s.name}`,
          status: CRM_SLUGS.includes(s.slug) ? 'done' : 'pending',
          completed_at: CRM_SLUGS.includes(s.slug) ? new Date().toISOString() : null,
          priority: 'medium', order_index: 1, created_by_id: req.user.userId,
        }));
        await supabase.from('tasks').insert(fallback);
        taskCount = fallback.length;
        doneCount = fallback.filter(t => t.status === 'done').length;
      }
    }

    let workshopDefaultTemplateCount = 0;
    try {
      workshopDefaultTemplateCount = await applyDefaultWorkshopTemplatesForNewProject(project.id, req.user.userId);
      taskCount += workshopDefaultTemplateCount;
    } catch (we) {
      console.warn('[CREATE PROJECT] workshop default templates:', we.message);
    }

    // Không ép current_stage → production: deal thắng hiện ở Kanban xưởng cột "Chờ vào xưởng" (bucket won_pending).
    // Vẫn tạo sẵn nhiệm vụ xưởng (pending) để khi vào SX chỉ việc thực hiện — chỉ khi chưa có nhiệm vụ xưởng (kể cả từ bộ mẫu mặc định).
    const { data: workshopStages } = await supabase.from('workflow_stages')
      .select('id, slug, name')
      .in('slug', WORKSHOP_SLUGS)
      .order('order_index');
    if ((workshopStages || []).length) {
      const workshopStageIds = (workshopStages || []).map((s) => s.id).filter(Boolean);
      const { data: existingWorkshopTasks } = await supabase.from('tasks')
        .select('id, stage_id')
        .eq('project_id', project.id)
        .in('stage_id', workshopStageIds);

      if (!existingWorkshopTasks?.length && workshopDefaultTemplateCount === 0) {
        const workshopBlueprint = {
          production: [
            { title: 'Tiếp nhận hồ sơ từ CRM', priority: 'high' },
            { title: 'Kiểm tra bản vẽ sản xuất', priority: 'high' },
            { title: 'Lập nhu cầu vật tư', priority: 'high' },
            { title: 'Gia công sản xuất', priority: 'medium' },
            { title: 'Kiểm tra chất lượng nội bộ', priority: 'high' },
          ],
          delivery: [
            { title: 'Chuẩn bị giao hàng', priority: 'medium' },
            { title: 'Lên lịch vận chuyển và lắp đặt', priority: 'medium' },
          ],
          'customer-care': [
            { title: 'Nghiệm thu và bàn giao', priority: 'medium' },
            { title: 'Theo dõi sau lắp đặt', priority: 'low' },
          ],
        };

        const workshopTaskInserts = [];
        (workshopStages || []).forEach((stage) => {
          const items = workshopBlueprint[stage.slug] || [];
          items.forEach((item, index) => {
            workshopTaskInserts.push({
              project_id: project.id,
              stage_id: stage.id,
              title: item.title,
              status: 'pending',
              priority: item.priority,
              order_index: index + 1,
              created_by_id: req.user.userId,
            });
          });
        });

        if (workshopTaskInserts.length) {
          const { data: workshopCreated } = await supabase.from('tasks').insert(workshopTaskInserts).select('id');
          taskCount += workshopTaskInserts.length;
          if (workshopCreated?.length) {
            await supabase.from('crm_activities').insert({
              lead_id: dealId,
              type: 'note',
              title: '🏭 Đã tạo nhiệm vụ xưởng',
              description: `Tự động tạo ${workshopCreated.length} nhiệm vụ xưởng (dự án đang ở cột chờ vào xưởng).`,
              created_by: req.user.userId,
            });
          }
        }
      }
    }

    // Activity log
    await supabase.from('crm_activities').insert({
      lead_id: dealId, type: 'note',
      title: '📁 Tạo dự án thành công',
      description: `Dự án ${project.code} — ${taskCount} nhiệm vụ (${doneCount} CRM hoàn thành, ${taskCount - doneCount} cần thực hiện)`,
      created_by: req.user.userId,
    });

    console.log(`[CREATE PROJECT] ${project.code}: ${taskCount} tasks (${doneCount} done), ${checkCount} checklists`);

    try {
      await syncCrmLeadSxPipelineFromProject(project.id);
    } catch (se) {
      console.warn('[CREATE PROJECT] sync sx_pipeline_stage_id:', se.message);
    }

    // NOTE: Không tự tạo Đơn 1/2/... từ deal. Đơn hàng chỉ tạo thủ công tại tab Đơn hàng.
    const orderOne = null;

    res.json({
      id: project.id, code: project.code, name: project.name,
      tasks_created: taskCount, tasks_done: doneCount,
      tasks_pending: taskCount - doneCount,
      checklists_created: checkCount,
      order_one: null,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/leads/:id/activities', async (req, res) => {
  try {
    const b = req.body || {};
    const leadId = req.params.id;
    const attachments = normalizeCrmActivityAttachments(b.attachments);
    const type = String(b.type || 'note').trim() || 'note';
    let title = b.title != null ? String(b.title).trim().slice(0, 500) : '';
    const description = b.description != null ? String(b.description).trim() : '';
    const outcome = b.outcome != null && String(b.outcome).trim() ? String(b.outcome).trim().slice(0, 500) : null;
    let durationMinutes = null;
    if (b.duration_minutes !== '' && b.duration_minutes != null && !Number.isNaN(Number(b.duration_minutes))) {
      durationMinutes = parseInt(b.duration_minutes, 10);
    }
    const activityDate = b.activity_date || null;
    const customerId = b.customer_id || null;

    if (String(type).toLowerCase() === 'note') {
      if (!description && !attachments?.length) {
        return res.status(400).json({ error: 'Ghi chú cần nội dung hoặc đính kèm' });
      }
      if (!title) {
        title =
          (description && description.split('\n')[0]?.slice(0, 120)) ||
          (attachments?.[0]?.name ? String(attachments[0].name).slice(0, 120) : '') ||
          'Ghi chú';
      }
    } else if (!title) {
      return res.status(400).json({ error: 'Thiếu tiêu đề hoạt động' });
    }

    const row = {
      lead_id: leadId,
      type,
      title,
      description: description || null,
      outcome,
      duration_minutes: durationMinutes,
      activity_date: activityDate,
      customer_id: customerId,
      attachments,
      created_by: req.user.userId,
    };
    if (b.shared_to_workshop !== undefined) row.shared_to_workshop = !!b.shared_to_workshop;
    if (b.allowed_share_modules !== undefined) {
      const { cleanShareModulesInput } = require('../../../helpers/documentShareScope');
      row.allowed_share_modules = row.shared_to_workshop
        ? cleanShareModulesInput(b.allowed_share_modules)
        : null;
    } else if (row.shared_to_workshop) {
      row.allowed_share_modules = null;
    }

    const { data, error } = await supabase.from('crm_activities').insert(row).select('*').single();
    if (error) throw error;
    await supabase.from('crm_leads').update({ last_activity_at: new Date().toISOString() }).eq('id', leadId);
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.patch('/leads/:id/activities/:activityId', async (req, res) => {
  try {
    const leadId = req.params.id;
    const activityId = req.params.activityId;
    const uid = req.user?.userId;
    const { title, description, attachments: attachmentsRaw } = req.body || {};

    const { data: act, error: fe } = await supabase.from('crm_activities')
      .select('id, lead_id, type, created_by, title, description, attachments')
      .eq('id', activityId)
      .single();
    if (fe || !act) return res.status(404).json({ error: 'Không tìm thấy hoạt động' });
    if (act.lead_id !== leadId) return res.status(400).json({ error: 'Hoạt động không thuộc lead/deal này' });
    if (act.type !== 'note') return res.status(400).json({ error: 'Chỉ sửa được loại ghi chú' });

    const r = normalizeCrmUserRole(req.user?.role);
    const canModerate = r === 'admin' || r === 'manager';
    if (!canModerate && String(act.created_by) !== String(uid)) {
      return res.status(403).json({ error: 'Chỉ tác giả hoặc quản lý/admin mới sửa được ghi chú này' });
    }

    const desc =
      description !== undefined ? String(description).trim() : String(act.description || '').trim();
    const nextAttachments =
      attachmentsRaw !== undefined ? normalizeCrmActivityAttachments(attachmentsRaw) : act.attachments;

    if (!desc && !(Array.isArray(nextAttachments) && nextAttachments.length)) {
      return res.status(400).json({ error: 'Ghi chú cần nội dung hoặc ít nhất một đính kèm' });
    }

    let nextTitle = act.title;
    if (title != null && String(title).trim()) {
      nextTitle = String(title).trim().slice(0, 200);
    } else {
      nextTitle = desc.split('\n')[0].slice(0, 120) || 'Ghi chú';
    }

    const patch = {
      title: nextTitle,
      description: desc || null,
      updated_at: new Date().toISOString(),
    };
    if (attachmentsRaw !== undefined) patch.attachments = nextAttachments;
    if (req.body?.shared_to_workshop !== undefined) {
      patch.shared_to_workshop = !!req.body.shared_to_workshop;
      if (!patch.shared_to_workshop) patch.allowed_share_modules = null;
    }
    if (req.body?.allowed_share_modules !== undefined) {
      const { cleanShareModulesInput } = require('../../../helpers/documentShareScope');
      patch.allowed_share_modules = cleanShareModulesInput(req.body.allowed_share_modules);
    }

    const { data, error } = await supabase.from('crm_activities')
      .update(patch)
      .eq('id', activityId)
      .select('*, creator:users!crm_activities_created_by_fkey(id, full_name)')
      .single();
    if (error) throw error;
    await supabase.from('crm_leads').update({ last_activity_at: new Date().toISOString() }).eq('id', leadId);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/leads/:id/activities/:activityId/share', async (req, res) => {
  try {
    const leadId = req.params.id;
    const activityId = req.params.activityId;
    const uid = req.user?.userId;
    const { cleanShareModulesInput } = require('../../../helpers/documentShareScope');

    const { data: act, error: fe } = await supabase.from('crm_activities')
      .select('id, lead_id, type, created_by, shared_to_workshop, allowed_share_modules')
      .eq('id', activityId)
      .single();
    if (fe || !act) return res.status(404).json({ error: 'Không tìm thấy hoạt động' });
    if (act.lead_id !== leadId) return res.status(400).json({ error: 'Hoạt động không thuộc lead/deal này' });
    if (act.type !== 'note') return res.status(400).json({ error: 'Chỉ chia sẻ được loại ghi chú' });

    const rRole = normalizeCrmUserRole(req.user?.role);
    const canModerate = rRole === 'admin' || rRole === 'manager';
    if (!canModerate && String(act.created_by) !== String(uid)) {
      return res.status(403).json({ error: 'Chỉ tác giả hoặc quản lý/admin mới đổi chia sẻ ghi chú này' });
    }

    const newShared = req.body?.shared_to_workshop !== undefined
      ? !!req.body.shared_to_workshop
      : !act.shared_to_workshop;
    const update = { shared_to_workshop: newShared, updated_at: new Date().toISOString() };
    if (req.body?.allowed_share_modules !== undefined) {
      update.allowed_share_modules = newShared
        ? cleanShareModulesInput(req.body.allowed_share_modules)
        : null;
    } else if (!newShared) {
      update.allowed_share_modules = null;
    }

    const { data, error } = await supabase.from('crm_activities')
      .update(update)
      .eq('id', activityId)
      .select('*, creator:users!crm_activities_created_by_fkey(id, full_name)')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/leads/:id/convert-to-project', async (req, res) => {
  // NOTE: notification added at the end of this handler
  try {
    const { data: lead } = await supabase.from('crm_leads').select('*, customer:customers(id, full_name)').eq('id', req.params.id).single();
    if (!lead) return res.status(404).json({ error: 'Lead không tồn tại' });

    if (await enforceQuotaForRequest(req, res, lead.company_id, 'projects_total')) return;

    // Get flow (from body or default)
    const { flow_id: reqFlowId } = req.body || {};
    let flowId = reqFlowId || null;
    if (!flowId) {
      const { data: flows } = await supabase.from('workflow_flows').select('id').limit(1);
      flowId = flows?.[0]?.id || null;
    }

    // Get first stage
    const { data: firstStage } = await supabase.from('workflow_stages').select('id').is('company_id', null).eq('is_active', true).order('order_index').limit(1).single();

    // Create project code
    const year = new Date().getFullYear();
    const { count } = await supabase.from('projects').select('*', { count: 'exact', head: true });
    const code = `TB-${year}-${String((count || 0) + 1).padStart(3, '0')}`;

    const { data: project, error } = await supabase.from('projects').insert({
      code, name: lead.title, status: 'consulting', customer_id: lead.customer_id,
      estimated_value: lead.estimated_value, flow_id: flowId,
      current_stage_id: firstStage?.id, created_by: req.user.userId,
    }).select('*').single();
    if (error) throw error;

    // Link lead to project
    await supabase.from('crm_leads').update({ project_id: project.id, updated_at: new Date().toISOString() }).eq('id', req.params.id);

    try {
      await ensureDealLeadDocumentsForModuleTransition({ leadId: req.params.id, projectId: project.id });
    } catch (e) {
      console.warn('[lead→project] ensure lead_documents:', e.message);
    }

    // ── AUTO-GENERATE TASKS FOR ALL STAGES ──
    const allStageSlugs = ['consulting', 'design', 'quotation', 'contract', 'production', 'delivery', 'customer-care'];
    let totalCreated = 0;

    for (const slug of allStageSlugs) {
      try {
        // Find stage (exact match first, then pattern)
        let stg = null;
        const { data: exact } = await supabase.from('workflow_stages').select('id, name, slug').eq('slug', slug).single();
        if (exact) stg = exact;
        else {
          const { data: pattern } = await supabase.from('workflow_stages').select('id, name, slug').ilike('slug', slug + '%').limit(1);
          stg = pattern?.[0];
        }
        if (!stg) continue;

        // Load templates from task_templates
        const { data: templates } = await supabase.from('task_templates')
          .select('*').eq('stage_id', stg.id).eq('is_active', true).order('order_index');
        if (!templates?.length) continue;

        // Create tasks
        const { data: ins } = await supabase.from('tasks').insert(templates.map((t, i) => ({
          project_id: project.id, stage_id: stg.id, title: t.title,
          description: t.description || null, priority: t.priority || 'medium', status: 'pending',
          created_by_id: req.user.userId, order_index: i, task_type: 'project',
          estimated_hours: t.estimated_hours || null,
        }))).select();

        // Create checklists
        for (const tmpl of templates) {
          if (tmpl.checklist_items?.length) {
            const newTask = (ins || []).find(t2 => t2.title === tmpl.title);
            if (newTask) {
              await supabase.from('task_checklists').insert(
                tmpl.checklist_items.map((c, j) => ({ task_id: newTask.id, title: typeof c === 'string' ? c : c.title, order_index: j }))
              );
            }
          }
        }
        totalCreated += (ins?.length || 0);
      } catch (e) { console.warn(`convert-to-project: auto-tasks ${slug} failed:`, e.message); }
    }

    // 🔔 NOTIFICATION: Lead/Deal → Dự án
    try {
      const t = await getNotifyTargets(req.params.id);
      const allIds = [...new Set([...t.ownerIds, ...t.adminIds])];
      if (allIds.length) await notifyMultiple(req, allIds, 'project_created',
        '🏗️ Tạo dự án từ Deal',
        `Dự án ${project.code} — "${project.name}" — ${totalCreated} tasks`,
        'project', project.id);
    } catch (ne) { console.warn('[NOTIFY] convert_project:', ne.message); }

    // NOTE: Không tự tạo Đơn 1/2/... từ deal. Đơn hàng chỉ tạo thủ công tại tab Đơn hàng.
    const orderOneConv = null;

    res.status(201).json({ ...project, tasks_created: totalCreated, order_one: null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/project/:projectId/summary', async (req, res) => {
  try {
    const summary = await getProjectCRMSummary(req.params.projectId);
    res.json(summary);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/project/:projectId/lead-documents', async (req, res) => {
  try {
    const { leadDocVisibleForModuleAndUser } = require('../../../helpers/documentShareScope');
    const forModule = String(req.query.for_module || '').toLowerCase().trim();
    const useMod = ['production', 'logistics', 'workshop'].includes(forModule) ? forModule : null;

    // Find lead linked to this project
    const { data: lead } = await supabase
      .from('crm_leads')
      .select('id, company_id')
      .eq('project_id', req.params.projectId)
      .limit(1)
      .single();

    if (!lead) return res.json([]);
    const visOpts = { leadCompanyId: lead.company_id || null };

    const { data: docs } = await supabase
      .from('lead_documents')
      .select('*, creator:users!lead_documents_created_by_fkey(id, full_name)')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false });

    let rows = docs || [];
    if (useMod) {
      rows = rows.filter((d) => leadDocVisibleForModuleAndUser(d, useMod, req.user, visOpts));
    }
    res.json(rows);
  } catch (e) {
    // No lead found → empty
    res.json([]);
  }
});

r.post('/project/:projectId/auto-invoice', async (req, res) => {
  try {
    if (!(await resolveCrmProjectScope(req, res, req.params.projectId))) return;

    const invoices = await onProjectCompleted(req.params.projectId, req.user.userId);

    // 🔔 NOTIFICATION: Auto hóa đơn
    if (invoices.length) {
      try {
        const { data: proj } = await supabase.from('projects')
          .select('company_id').eq('id', req.params.projectId).maybeSingle();
        const adminIds = await getCompanyScopedAdminIds(proj?.company_id);
        if (adminIds.length) await notifyMultiple(req, adminIds, 'invoice_created',
          '🧾 Tự động tạo hóa đơn',
          `Dự án hoàn thành → tạo ${invoices.length} hóa đơn`,
          'project', req.params.projectId, { company_id: proj?.company_id || null });
      } catch (ne) { console.warn('[NOTIFY] auto_invoice:', ne.message); }
    }

    res.json({ created: invoices.length, invoices });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/leads/:id/project-tasks', async (req, res) => {
  try {
    const { data: lead } = await supabase.from('crm_leads').select('project_id').eq('id', req.params.id).single();
    if (!lead?.project_id) return res.json({ tasks: [], stages: [] });

    const { data: tasks } = await supabase.from('tasks')
      .select(`*, assignee:users!tasks_assignee_id_fkey(id, full_name, avatar),
        stage:workflow_stages(id, name, slug, color, icon, order_index),
        checklists:task_checklists(id, title, is_completed, order_index, notes, attachments)`)
      .eq('project_id', lead.project_id)
      .order('order_index');

    // Get project stage info
    const { data: project } = await supabase.from('projects')
      .select('id, code, name, status, current_stage_id, current_stage:workflow_stages(id, name, slug, color, icon)')
      .eq('id', lead.project_id).single();

    // Get all workflow stages for progress display
    const { data: stages } = await supabase.from('workflow_stages')
      .select('id, name, slug, color, icon, order_index')
      .is('company_id', null).eq('is_active', true).order('order_index');

    res.json({ tasks: tasks || [], stages: stages || [], project });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/leads/:id/sync-stage', async (req, res) => {
  try {
    const { stage_slug, direction } = req.body; // direction: 'lead-to-project' | 'project-to-lead'

    const { data: lead } = await supabase.from('crm_leads')
      .select('*, stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, order_index, is_won, is_lost)')
      .eq('id', req.params.id).single();
    if (!lead?.project_id) return res.status(400).json({ error: 'Lead chưa liên kết dự án' });

    if (direction === 'lead-to-project' && stage_slug) {
      // Move project to matching stage
      const { data: wStage } = await supabase.from('workflow_stages')
        .select('id, name, slug').eq('slug', stage_slug).single();
      if (wStage) {
        await supabase.from('projects').update({
          current_stage_id: wStage.id, updated_at: new Date().toISOString(),
        }).eq('id', lead.project_id);

        // Also sync order status
        if (autoFlowFns.onProjectStageChanged) {
          try { await autoFlowFns.onProjectStageChanged(lead.project_id, wStage.id); } catch {}
        }
      }
    }

    // Always return updated state
    const { data: project } = await supabase.from('projects')
      .select('id, code, name, status, current_stage_id, current_stage:workflow_stages(id, name, slug, color, icon, order_index)')
      .eq('id', lead.project_id).single();

    res.json({ lead, project });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/auto-project-config', async (req, res) => {
  try {
    const { data } = await supabase.from('auto_project_config').select('*').limit(1).single();
    if (!data) {
      // Auto-create if not exists
      const { data: created } = await supabase.from('auto_project_config').insert({}).select('*').single();
      return res.json(created);
    }
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.put('/auto-project-config', async (req, res) => {
  try {
    const { flow_id, flow_assignments, default_status, default_priority, import_crm_tasks, create_crm_tasks } = req.body;
    // Upsert: get existing or create
    let { data: existing } = await supabase.from('auto_project_config').select('id').limit(1).single();
    if (!existing) {
      const { data: created } = await supabase.from('auto_project_config').insert({}).select('id').single();
      existing = created;
    }
    const { data, error } = await supabase.from('auto_project_config').update({
      flow_id: flow_id || null,
      flow_assignments: flow_assignments || [],
      default_status: default_status || 'consulting',
      default_priority: default_priority || 'medium',
      import_crm_tasks: import_crm_tasks !== false,
      create_crm_tasks: create_crm_tasks !== false,
      updated_by: req.user.userId,
      updated_at: new Date().toISOString(),
    }).eq('id', existing.id).select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/deals/:id/auto-create-project', async (req, res) => {
  try {
    const mode = String(req.body?.mode || 'create').toLowerCase() === 'additional'
      ? 'additional'
      : 'create';
    const targets = Array.isArray(req.body?.targets) && req.body.targets.length
      ? req.body.targets
      : null;
    let resolvedPc = req.body?.production_company_id || targets?.[0]?.production_company_id || null;
    if (!targets && resolvedPc) {
      resolvedPc = await resolveProductionCompanyForDealStage(req.params.id, resolvedPc);
    }
    if (targets) {
      for (const t of targets) {
        const cid = t?.production_company_id || t?.company_id;
        if (!cid) return res.status(400).json({ error: 'Mỗi dòng SX cần chọn công ty' });
        if (!t?.workshop_type_id) return res.status(400).json({ error: 'Mỗi dòng SX cần chọn phân loại' });
        const v = await validateProductionCompanyId(cid);
        if (!v.ok) return res.status(400).json({ error: v.error });
      }
    }
    const result = await autoCreateProjectFromWonDeal({
      req,
      dealId: req.params.id,
      userId: req.user.userId,
      productionCompanyId: resolvedPc,
      workshopTypeId: req.body?.workshop_type_id || null,
      targets,
      mode,
      flowId: req.body?.flow_id || null,
      projectDates: {
        delivery_date: req.body?.delivery_date || null,
        production_deadline: req.body?.production_deadline || req.body?.delivery_date || null,
        production_finish_date: req.body?.production_finish_date || null,
      },
    });
    if (!result.ok) {
      if (result.existing_project_id) {
        return res.status(400).json({
          error: result.error,
          project_id: result.existing_project_id,
          projects: result.projects || undefined,
          partial: result.partial || undefined,
        });
      }
      return res.status(result.statusCode || 500).json({
        error: result.error,
        projects: result.projects || undefined,
        partial: result.partial || undefined,
      });
    }
    try {
      const { emitProductionBoardRealtime } = require('../../../helpers/workshopIntakeNotify');
      const io = req.app.get('io');
      const emitIds = result.projects?.length
        ? result.projects.map((p) => p.project_id)
        : [result.project_id];
      for (const pid of emitIds) {
        await emitProductionBoardRealtime(pid, io, mode === 'additional' ? 'auto_create_additional' : 'auto_create_api');
      }
    } catch (emitErr) {
      console.warn('[auto-project] emit board:', emitErr.message);
    }
    res.status(201).json({
      project_id: result.project_id,
      project_code: result.project_code,
      project_name: result.project_name,
      tasks_created: result.tasks_created,
      projects: result.projects || [{
        project_id: result.project_id,
        project_code: result.project_code,
        project_name: result.project_name,
        tasks_created: result.tasks_created,
        is_primary: true,
      }],
      primary_project_id: result.primary_project_id || result.project_id,
      partial: result.partial || false,
      partial_error: result.partial_error || null,
      warning: result.warning || null,
    });
  } catch (e) {
    console.error('[auto-project] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/** Admin chọn lại công ty SX + phân loại (deal đã có dự án) — thay NV + tạo lại NV mẫu. */
r.post('/deals/:id/reassign-sx', async (req, res) => {
  try {
    if (!isAdminLike(req.user)) {
      return res.status(403).json({ error: 'Chỉ admin được chọn lại công ty / phân loại SX' });
    }
    const productionCompanyId = req.body?.production_company_id || null;
    const workshopTypeId = req.body?.workshop_type_id || null;
    const targetProjectId = req.body?.project_id || null;
    if (!productionCompanyId) {
      return res.status(400).json({ error: 'Vui lòng chọn công ty Sản xuất', requires_production_company: true });
    }
    if (!workshopTypeId) {
      return res.status(400).json({ error: 'Vui lòng chọn phân loại sản xuất' });
    }
    const { reassignDealSxCompanyAndType } = require('../../../helpers/reassignDealSx');
    const result = await reassignDealSxCompanyAndType({
      dealId: req.params.id,
      userId: req.user.userId,
      productionCompanyId,
      workshopTypeId,
      projectId: targetProjectId,
      req,
    });
    try {
      const { emitProductionBoardRealtime } = require('../../../helpers/workshopIntakeNotify');
      const io = req.app.get('io');
      await emitProductionBoardRealtime(result.project_id, io, 'reassign_sx');
    } catch (emitErr) {
      console.warn('[reassign-sx] emit board:', emitErr.message);
    }
    res.json(result);
  } catch (e) {
    console.error('[reassign-sx]', e.message);
    res.status(e.status || 500).json({ error: e.message || 'Lỗi chọn lại SX' });
  }
});

r.post('/leads/:id/sx-handover', async (req, res) => {
  try {
    const leadId = req.params.id;
    const uid = req.user.userId;
    const { data: lead, error: leadErr } = await supabase.from('crm_leads')
      .select('id, type, project_id, assigned_to, lead_owner_id, sx_handover_at')
      .eq('id', leadId)
      .single();
    if (leadErr || !lead) return res.status(404).json({ error: 'Không tìm thấy' });
    if (lead.type !== 'deal') return res.status(400).json({ error: 'Chỉ áp dụng cho deal' });
    if (!lead.project_id) return res.status(400).json({ error: 'Deal chưa có dự án — hãy tạo dự án trước' });
    if (lead.sx_handover_at) return res.status(400).json({ error: 'Đã xác nhận bàn giao sản xuất' });

    const can = userSeesAllCrmDeals(req.user.role)
      || String(lead.assigned_to || '') === String(uid)
      || String(lead.lead_owner_id || '') === String(uid);
    if (!can) return res.status(403).json({ error: 'Bạn không có quyền xác nhận bàn giao deal này' });

    const b = req.body || {};
    if (!b.sale_acknowledged) return res.status(400).json({ error: 'Cần tick xác nhận Sale' });

    let handoverProjectId = lead.project_id;
    if (b.project_id && String(b.project_id) !== String(lead.project_id)) {
      const { data: link } = await supabase
        .from('crm_deal_projects')
        .select('project_id')
        .eq('deal_id', leadId)
        .eq('project_id', b.project_id)
        .maybeSingle();
      if (!link?.project_id) {
        return res.status(400).json({ error: 'Dự án không thuộc deal này' });
      }
      handoverProjectId = link.project_id;
    }

    const targetTaskLeadId = await resolveCrmTaskWriteLeadId(leadId);
    const { data: sxTasksAll } = await supabase
      .from('crm_tasks')
      .select('id, status')
      .eq('lead_id', targetTaskLeadId)
      .like('stage_slug', 'sx_%');
    const sxTasks = (sxTasksAll || []).filter((t) => t.status !== 'cancelled');
    if (!sxTasks.length) {
      return res.status(400).json({
        error:
          'Deal chưa có nhiệm vụ Sản xuất (tab Công việc). Chuyển deal sang cột Sản xuất (chọn công ty xưởng) để hệ thống gắn bộ nhiệm vụ, hoặc bấm Gen trong tab Công việc.',
        code: 'requires_sx_crm_tasks',
      });
    }
    const incompleteSx = sxTasks.filter((t) => t.status !== 'completed');
    if (incompleteSx.length) {
      return res.status(400).json({
        error: `Còn ${incompleteSx.length} nhiệm vụ Sản xuất (sx_*) chưa hoàn thành. Hoàn tất 100% trước khi bàn giao.`,
        code: 'requires_sx_crm_tasks_complete',
        incomplete_count: incompleteSx.length,
      });
    }

    const resolvedHandoverPc = await resolveProductionCompanyForDealStage(leadId, b.production_company_id);
    const pcv = await validateProductionCompanyId(resolvedHandoverPc);
    if (!pcv.ok) return res.status(400).json({ error: pcv.error, requires_production_company: true });
    const cStart = b.construction_start_date || null;
    const pStart = b.expected_production_start_date || null;
    const pEnd = b.expected_production_end_date || null;
    if (!cStart || !pStart) {
      return res.status(400).json({
        error: 'Nhập đủ: ngày dự kiến thi công (bắt đầu công trình) và ngày dự kiến sản xuất',
      });
    }
    if (pEnd && new Date(pEnd) < new Date(pStart)) {
      return res.status(400).json({ error: 'Ngày hoàn thành SX phải sau hoặc cùng ngày bắt đầu SX' });
    }

    const now = new Date().toISOString();
    const { data: projRow } = await supabase
      .from('projects')
      .select('workshop_type_id')
      .eq('id', handoverProjectId)
      .maybeSingle();
    const { applyWorkshopTypeDefaultStaffToProject } = require('../../../helpers/productionWorkshopTypeStaff');
    const primaryStaffId = await applyWorkshopTypeDefaultStaffToProject(
      handoverProjectId,
      pcv.company.id,
      projRow?.workshop_type_id || null,
    );
    const leadHandoverPatch = {
      sx_handover_at: now,
      sx_handover_confirmed_by: uid,
      sx_template_company_id: pcv.company.id,
      construction_start_date: cStart,
      expected_production_start_date: pStart,
      expected_production_end_date: pEnd,
      updated_at: now,
    };
    const { error: upLeadErr } = await supabase.from('crm_leads').update(leadHandoverPatch).eq('id', leadId);
    if (upLeadErr) throw upLeadErr;

    const projPatch = {
      construction_start_date: cStart,
      expected_production_start_date: pStart,
      updated_at: now,
      company_id: pcv.company.id,
    };
    if (pEnd) projPatch.production_deadline = pEnd;
    // Gán NV SX trên dự án — không ghi đè assigned_to/lead_owner_id (người phụ trách CRM).
    try {
      await assignProductionCompanyDealResponsibility({
        dealId: leadId,
        productionCompanyId: pcv.company.id,
        projectId: handoverProjectId,
      });
    } catch (respErr) {
      console.warn('[sx-handover] assign production responsible:', respErr.message);
      if (!primaryStaffId) {
        const sxResponsible = await resolveProductionHandoverResponsibleUserId(pcv.company.id);
        if (sxResponsible) projPatch.production_person_id = sxResponsible;
      }
    }
    const { error: projErr } = await supabase.from('projects').update(projPatch).eq('id', handoverProjectId);
    if (projErr) console.warn('[sx-handover] project dates:', projErr.message);

    try {
      await ensureDealLeadDocumentsForModuleTransition({ leadId, projectId: handoverProjectId });
    } catch (docEns) {
      console.warn('[sx-handover] ensure lead_documents:', docEns.message);
    }

    try {
      await syncCrmLeadSxPipelineFromProject(handoverProjectId);
    } catch (se) {
      console.warn('[sx-handover] syncCrmLeadSxPipelineFromProject:', se.message);
    }
    try {
      const io = req.app.get('io');
      if (io) await emitCrmBadgeUpdateForProject(handoverProjectId, io);
    } catch (em) {
      console.warn('[sx-handover] emit badge:', em.message);
    }

    try {
      await supabase.from('crm_activities').insert({
        lead_id: leadId,
        type: 'note',
        title: '✅ Sale xác nhận bàn giao Sản xuất',
        description: `Bắt đầu công trình: ${cStart} · Dự kiến SX: ${pStart} · Dự kiến hoàn thành SX: ${pEnd}`,
        created_by: uid,
      });
    } catch (_) {}

    // Auto-generate default workshop tasks for production (nhiệm vụ mẫu xưởng)
    // Only apply once: check if the project already has tasks created from workshop templates.
    try {
      const forcedCompanyId = pcv?.company?.id || null;
      const { data: defTpl } = await supabase
        .from('workshop_task_templates')
        .select('id')
        .eq('workshop_area', 'production')
        .eq('is_default', true)
        .eq('is_active', true)
        .eq('company_id', forcedCompanyId)
        .limit(1)
        .maybeSingle();
      // Fallback: dùng bộ mẫu global nếu công ty chưa có
      let defTplId = defTpl?.id || null;
      if (!defTplId) {
        const { data: globalTpl } = await supabase
          .from('workshop_task_templates')
          .select('id')
          .eq('workshop_area', 'production')
          .eq('is_default', true)
          .eq('is_active', true)
          .is('company_id', null)
          .limit(1)
          .maybeSingle();
        defTplId = globalTpl?.id || null;
      }

      if (defTplId) {
        const { count } = await supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', handoverProjectId)
          .contains('metadata', { workshop_template_id: defTplId });
        if (!count || count === 0) {
          const r = await applyWorkshopTemplateToProject(handoverProjectId, defTplId, uid);
          if (!r.ok) console.warn('[sx-handover] apply workshop template:', r.error);
        }
      }
    } catch (wt) {
      console.warn('[sx-handover] workshop templates:', wt.message);
    }

    // Gen toàn bộ bộ mẫu xưởng (khu SX) theo cấu hình /sx/task-templates (ưu tiên theo company đã chọn).
    // Idempotent theo metadata.workshop_template_id nên gọi nhiều lần vẫn an toàn.
    try {
      const forcedCompanyId = pcv?.company?.id || null;
      const rAll = await applyAllActiveWorkshopTemplatesForArea(handoverProjectId, uid, {
        workshopArea: 'production',
        companyId: forcedCompanyId,
      });
      if (!rAll.ok) console.warn('[sx-handover] gen all workshop templates:', rAll.error);
    } catch (e) {
      console.warn('[sx-handover] gen all workshop templates:', e.message);
    }

    res.json({
      ok: true,
      sx_handover_at: now,
      construction_start_date: cStart,
      expected_production_start_date: pStart,
      expected_production_end_date: pEnd,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
}).call(null, helpers["ALLOWED_DEADLINE_FIELDS"], helpers["CRM_COMMENT_ALLOWED_REACTION_EMOJI"], helpers["CRM_LEAD_KANBAN_LITE_SELECT"], helpers["CRM_LEAD_LIST_SELECT"], helpers["CRM_LEAD_LIST_SELECT_BASE"], helpers["CRM_LEAD_LIST_SELECT_EXTRA"], helpers["CRM_LEAD_REGION_EMBED"], helpers["CRM_NEW_LEAD_MAX_AGE_MS"], helpers["CRM_TASK_SELECT"], helpers["CRM_UUID_RE"], helpers["CUSTOMERS_IN_CHUNK"], helpers["CUSTOMERS_OVERVIEW_NO_MATCH_ID"], helpers["DEAL_PRE_CONTRACT_SLUGS_STAFF"], helpers["DEAL_REPORT_BUCKET_VALUES"], helpers["DEFAULT_CHECKLISTS"], helpers["DEFAULT_DEADLINE_BUCKETS"], helpers["DEFAULT_PIPELINE_STAGE_SLA_DAYS"], helpers["FOLLOWUP_TIME_BUCKETS"], helpers["PDFDocument"], helpers["QUOTATIONS_SOURCE_EXCEL_COLS"], helpers["Router"], helpers["SCAN_DUP_LITE_SELECT"], helpers["STAFF_LEAD_DEAL_REPORT_ROLES"], helpers["SURVEY_EVENT_SELECT"], helpers["SURVEY_EVENT_TYPES"], helpers["XLSX"], helpers["ZALO_APP_SETTING_KEY"], helpers["crmSchemaCompat"], helpers["addPhoneToAutoLeadBlocklist"], helpers["aggregateCrmCommentReactions"], helpers["aggregateOrgReportRows"], helpers["appendFulfillmentChildTasksForMasterDeal"], helpers["applyAllActiveWorkshopTemplatesForArea"], helpers["applyAssigneesToInsertedCrmTasks"], helpers["applyCrmLeadRegionFilterToQuery"], helpers["applyCrmTaskTemplatesToCompanyRegions"], helpers["applyCustomerIdInFilter"], helpers["applyCustomersOverviewSearch"], helpers["applyDefaultWorkshopTemplatesForNewProject"], helpers["applyLeadOrCustomerSalesFilter"], helpers["applyProductionTemplateToFulfillmentLead"], helpers["applyProductionTemplatesOnPipelineEnter"], helpers["applyStageIdFilterToQuery"], helpers["applyWorkshopTemplateToProject"], helpers["artifactNamePrefix"], helpers["assertCanFlagLead"], helpers["assertCategoryFitsSource"], helpers["assertCrmAssigneeUserMatchesLeadCompany"], helpers["assertCrmEmployeeDeleteAllowed"], helpers["assertCrmStageAdvanceAllowed"], helpers["assertDealCrmManualStageChange"], helpers["assertDealResponsible"], helpers["assertDivisionAllowedForCompany"], helpers["assertLeadDocumentOwner"], helpers["assertLeadReadableByRegionScope"], helpers["assertRegionBelongsToCompany"], helpers["assertUserCanAssignCrmRegion"], helpers["assignProductionCompanyDealResponsibility"], helpers["attachAssigneesToCrmTasks"], helpers["attachAssignmentIdsToCrmTasks"], helpers["attachCrmNextOpenTaskDeadline"], helpers["attachLeadNewFlagForList"], helpers["attachLeadReplyParents"], helpers["attachLeadUserFlagsForList"], helpers["auth"], helpers["autoCreateProjectFromWonDeal"], helpers["autoFlowFns"], helpers["autoGenCrmTasksForNewLead"], helpers["buildAssignmentNotificationInsert"], helpers["buildChecklistLeadDocumentRow"], helpers["buildCrmDashboardMinimalKpis"], helpers["buildCrmLeadsRpcFilterParams"], helpers["buildCustomersOverviewSummary"], helpers["buildDealTemplateData"], helpers["buildDefaultDeadlineConfig"], helpers["buildFirstStageIdByPipeline"], helpers["buildPipelineStagesMap"], helpers["buildProcessedCommercialItems"], helpers["buildQuotedStageOrderByPipeline"], helpers["buildScanDuplicateGroups"], helpers["buildWonStageOrderByPipeline"], helpers["canUserViewDocByAllowlist"], helpers["chatUpload"], helpers["chunkArray"], helpers["classifyDealStageForStaffReport"], helpers["commentsTableMissing"], helpers["companyRegionExtraColumnsMissing"], helpers["companyRegionGeoColumnsMissing"], helpers["computeCrmDashboardLightStats"], helpers["computeCrmLiveVersionMs"], helpers["computeCustomersOverviewSummary"], helpers["computeIsNewLeadForUser"], helpers["computeOrgOverviewReportData"], helpers["computeStaffLeadDealReportData"], helpers["computeStaffPipelineDetailPayload"], helpers["countOpenOverdueCrmTasksForLeadIds"], helpers["createCrmAssignment"], helpers["createCrmLeadTask"], helpers["createFulfillmentChildDeal"], helpers["createNotif"], helpers["createNotification"], helpers["createProjectFromLead"], helpers["crmExecutorFieldsFromTemplateItem"], helpers["crmLeadCommentAttachmentsColumnMissing"], helpers["crmLeadCommentReadReceiptsTableMissing"], helpers["crmLeadRowVisibleToRequestUser"], helpers["crmListUsesLegacyFilters"], helpers["crmNoteActivityUpload"], helpers["crmReportAsOfMs"], helpers["crmReportCreatedAtFromIso"], helpers["crmReportCreatedAtToIso"], helpers["crmReportDayKeyVn"], helpers["crmRouteErrorText"], helpers["crmTaskDeadlineModuleKey"], helpers["crmTaskMeetsCompletionRequirements"], helpers["crmTaskMeetsRequiredFileTypes"], helpers["crmTaskRequiresCompletionEvidence"], helpers["crmTemplateMatchesLeadType"], helpers["deadlineToDateOnlyIso"], helpers["defaultCompanyInfo"], helpers["defaultKpiLedgerMonthStartYmd"], helpers["deleteCrmLeadTask"], helpers["deleteMirroredAssignmentFileForTaskAttachment"], helpers["duplicateLeadIdsFromLiteRows"], helpers["ecosystemModuleKeyForCrmDeadline"], helpers["effectivePipelineStageSlaDays"], helpers["emitCrmBadgeUpdateForProject"], helpers["emitCrmDashboardChanged"], helpers["emitCrmTaskChanged"], helpers["emptyStaffLeadDealAgg"], helpers["endOfCalendarDayAfterEntered"], helpers["enforceCommercialDocCompanyOnWrite"], helpers["enforceQuotaForRequest"], helpers["ensureDealLeadDocumentsForModuleTransition"], helpers["ensureDefaultCrmPipelineForCompany"], helpers["ensureMissingCrmTasksForLead"], helpers["ensureMissingCrmTasksForPipelineStage"], helpers["ensureMissingSxTasksForLead"], helpers["excelUpload"], helpers["executeLeadMerge"], helpers["executeZaloDealStageNotify"], helpers["fetchActivityCustomerIds"], helpers["fetchAllLeadsForSlaWatchlist"], helpers["fetchAssignmentForTask"], helpers["fetchCrmCommentReactionsAggregate"], helpers["fetchCrmLeadCommentNotifyUserIds"], helpers["fetchCrmLeadDetailRow"], helpers["fetchCrmLeadWithPipelineBadges"], helpers["fetchCrmLeadsByIdsOrdered"], helpers["fetchCrmLeadsForDashboardBatched"], helpers["fetchCrmLeadsForOrgReportBatched"], helpers["fetchCrmLeadsForUserDetailBatched"], helpers["fetchCrmLeadsLiteForDuplicateScan"], helpers["fetchCrmLeadsPageViaRpc"], helpers["fetchCrmPipelineZaloSlice"], helpers["fetchCrmSurveyEventsChunk"], helpers["fetchCrmSurveyVisitsForOrgReport"], helpers["fetchLeadCommentAudienceMembers"], helpers["fetchLeadCommentAudienceMembersForRead"], helpers["fetchLeadIdsForCrmRegion"], helpers["fetchLeadMentionMembers"], helpers["fetchOrgActivityFeed"], helpers["fetchPipelineWithStagesById"], helpers["fetchScopedCrmBundles"], helpers["fillTemplateDataFromStructure"], helpers["filterCrmTasksForLeadType"], helpers["filterUserIdsForCrmLeadScopedNotification"], helpers["findChecklistItem"], helpers["followupDismissExpiresAt"], helpers["fontBold"], helpers["fontRegular"], helpers["formatMoney"], helpers["formatVNDPdf"], helpers["formatVnPhoneLocal0From84"], helpers["fs"], helpers["generateDocPdf"], helpers["generateFlowTasks"], helpers["generateStepTasks"], helpers["getAppSettingValue"], helpers["getCompanyInfo"], helpers["getCompanyRegionsList"], helpers["getCrmLeadListSelect"], helpers["getCrmLeadRegionConstraint"], helpers["getCrmLeadTypesList"], helpers["getCrmLeadsListLegacy"], helpers["getCrmSourceCategoriesList"], helpers["getCrmSourcesList"], helpers["getDefaultCrmAttachmentShare"], helpers["getDefaultDealZaloTemplateStructure"], helpers["getDefaultLeadDocumentShareForDeal"], helpers["getDefaultPipelineIdForCompany"], helpers["getLeadDocumentFieldsFromCrmTask"], helpers["getNotifyTargets"], helpers["getOverdueFollowUps"], helpers["getPipelineIdForCompanyRegion"], helpers["getPipelineZaloSlice"], helpers["getPipelinesList"], helpers["getProjectCRMSummary"], helpers["getStagesByPipelineId"], helpers["getStaleLeads"], helpers["getZaloNotifySettings"], helpers["hydrateCrmLeadsByIdsWithStaff"], helpers["hydrateCrmLeadsRpcPage"], helpers["hydrateScanDuplicateLeads"], helpers["insertQuotationRow"], helpers["invalidateAppSettingKey"], helpers["invalidatePipelinesAndStages"], helpers["invalidateRegions"], helpers["invalidateSources"], helpers["invalidateTenantUsageCache"], helpers["invokeCrmLeadsStageCountsRpc"], helpers["isAdminLike"], helpers["isAllowedLeadCommentAttachmentUrl"], helpers["isChotSanXuatCrmTaskTitle"], helpers["isCrmCompanyAdminUser"], helpers["isCrmDealAssigneeLocked"], helpers["isCrmLeadTypeColorMissingError"], helpers["isCrmModuleAdmin"], helpers["isCrmPipelinesTableMissingError"], helpers["isCrmRegionAdminUser"], helpers["isCrmSystemAdminUser"], helpers["isDealStageHoanThanhForZalo"], helpers["isDefaultAssigneeIdsColumnError"], helpers["isExecutorColumnError"], helpers["isPlatformAdmin"], helpers["isPostgresUniqueViolation"], helpers["isQuotationsSourceExcelColumnMissingError"], helpers["isSxRelationshipError"], helpers["isSystemAdmin"], helpers["isUuidString"], helpers["isValidDealZaloTemplateStructure"], helpers["isVcRelationshipError"], helpers["isVptCompanyCommercialDocViewer"], helpers["lastNominatimGeocodeAt"], helpers["leadChatFilesMulter"], helpers["leadChatJsonOrFiles"], helpers["listQuotationExcelSheets"], helpers["loadCrmTaskAttachmentCountMap"], helpers["loadOrgReportStageMap"], helpers["loadZaloLinkedLeadIdSet"], helpers["logDealActivityComment"], helpers["logDealDeadlineChangeComment"], helpers["logDealStageChangeComment"], helpers["logKanbanDeadlineUnifiedHistory"], helpers["logLeadCommentMentionActivity"], helpers["logProjectFileActivity"], helpers["mapCustomerOverviewRow"], helpers["mapLeadDisplayPhone"], helpers["mapQuotationItemsToOrderRows"], helpers["maskCustomerPhoneDisplay"], helpers["maskZaloAccessTokenPreview"], helpers["maybeSendZaloOnDealStageEnter"], helpers["mergeCrmStageDefaultAssigneeIntoUpdates"], helpers["mergeCustomerIntoTarget"], helpers["misaService"], helpers["multer"], helpers["nextCode"], helpers["nextTbProjectCode"], helpers["normalizeCrmActivityAttachments"], helpers["normalizeCrmLeadCommentAttachments"], helpers["normalizeCrmStageDefaultAssigneeUserId"], helpers["normalizeCrmUserRole"], helpers["normalizeLeadSeenByKeys"], helpers["normalizeOrgReportSurveyVisitRow"], helpers["normalizePipelineStageSlaDaysForDb"], helpers["normalizePipelineStagesList"], helpers["normalizeRegionIdList"], helpers["normalizeTemplateChecklistForCrmTask"], helpers["normalizeTemplateItemAssigneeIds"], helpers["normalizeTimestamp"], helpers["normalizeTitleFold"], helpers["normalizeVnPhoneTo84"], helpers["notifyDealCommentMentions"], helpers["notifyDealCommentParticipants"], helpers["notifyMultiple"], helpers["notifyMultipleShared"], helpers["notifyNewCrmAssignmentAssignees"], helpers["notifyProductionDocumentUploaded"], helpers["onLeadWon"], helpers["onOrderConfirmed"], helpers["onProjectCompleted"], helpers["onQuotationAccepted"], helpers["orgReportAttachFirstStageRates"], helpers["orgReportBumpFirstStageMetrics"], helpers["orgReportBumpMetrics"], helpers["orgReportBumpOpenOverdue"], helpers["orgReportBumpReceptionMetrics"], helpers["orgReportCancelRatePct"], helpers["orgReportClosedWonDealCount"], helpers["orgReportClosedWonValue"], helpers["orgReportCompareSummary"], helpers["orgReportConversionRate"], helpers["orgReportDayKey"], helpers["orgReportDealCloseValueRatePct"], helpers["orgReportDealCountsExpected"], helpers["orgReportDealIsClosedWon"], helpers["orgReportDealIsCompleted"], helpers["orgReportDealIsQuotedOrAfter"], helpers["orgReportDealProbability"], helpers["orgReportDealSplitBuckets"], helpers["orgReportExtendedDealMetrics"], helpers["orgReportFirstStageOnTimeRatePct"], helpers["orgReportFirstStageOverdueRatePct"], helpers["orgReportIsReceptionOverdue"], helpers["orgReportIsSlaOverdue"], helpers["orgReportKpiPeriodStart"], helpers["orgReportNumEst"], helpers["orgReportOverdueRatePct"], helpers["orgReportOwnerId"], helpers["orgReportPctDelta"], helpers["orgReportPreviousPeriod"], helpers["orgReportQuoteValueCloseRatePct"], helpers["orgReportQuoteWinRatePct"], helpers["orgReportReceptionOverdueRatePct"], helpers["orgReportReceptionSlaMinutes"], helpers["orgReportStageIsClosed"], helpers["orgReportStageIsLostOrCancelled"], helpers["orgReportTotalDealCount"], helpers["parseChecklist"], helpers["parseCrmLeadsPageRpc"], helpers["parseCrmReportDateRange"], helpers["parseCrmStageCountsNumericMap"], helpers["parseCrmStageCountsRpc"], helpers["parseExcelMoneyFromMappedColumn"], helpers["parseLeadIdUuidList"], helpers["parseLeadIdsCsvQuery"], helpers["parseLeadIdsFromBody"], helpers["parseLeadSeenByRaw"], helpers["parseQuotationExcelBuffer"], helpers["parseStageIdsFromQuery"], helpers["parseUuidArrayJsonb"], helpers["parseVietnameseMeasure"], helpers["parseVietnameseMoney"], helpers["path"], helpers["persistAssignmentNotification"], helpers["pgCrmDuplicateLeadIds"], helpers["pickDealZaloTemplatePayload"], helpers["pipeOrgOverviewReportPdf"], helpers["pipeStaffLeadDealSummaryPdf"], helpers["pipeStaffPipelineDetailPdf"], helpers["pipelineHasExplicitCompleted"], helpers["pipelineHasExplicitExpected"], helpers["pipelineHasExplicitWon"], helpers["plannerTableMissing"], helpers["postCrmStageDefaultAssigneeComment"], helpers["primaryTemplateItemAssigneeId"], helpers["rcInvalidateTags"], helpers["reactionsTableMissing"], helpers["redactCrmTaskNotesForViewer"], helpers["regionGeocodeInflight"], helpers["repairCrmDealPipelineDisplay"], helpers["requireUserCompanyId"], helpers["requireUserCompanyIdResolved"], helpers["resolveAssignmentIdForTask"], helpers["resolveCanonicalCrmLeadId"], helpers["resolveCommercialDocListCompanyScope"], helpers["resolveCrmBundleTemplateScope"], helpers["resolveCrmLeadsDeadlinesMap"], helpers["resolveCrmLeadsKanbanLite"], helpers["resolveCrmLeadsMergedQuery"], helpers["resolveCrmLeadsSkipDeadline"], helpers["resolveCrmLedgerNetByLeadIdsPayload"], helpers["resolveCrmReportScope"], helpers["resolveCrmTaskWriteLeadId"], helpers["resolveExecutorCompanyId"], helpers["resolveKanbanStagesForCompany"], helpers["resolveLeadCommentMentionIds"], helpers["resolveProductionCompanyForDealStage"], helpers["resolveProductionHandoverResponsibleUserId"], helpers["resolveReopenTargetStageId"], helpers["resolveRpcRegionIdsForCrmList"], helpers["resolveTenantIdForQuota"], helpers["resolveZaloDealTemplateId"], helpers["respondIfCrmPipelinesTableMissing"], helpers["responseCache"], helpers["restoreCrmTaskChecklistFromWorkshopTemplate"], helpers["resyncCrmPipelineTasksForLead"], helpers["syncCrmTasksAfterPipelineChange"], helpers["sanitizeIsoDateQueryParam"], helpers["scheduleRegionGeocoding"], helpers["scopedAdminCompanyId"], helpers["scopedCrmCompanyIdForWrite"], helpers["sendZaloTemplateMessage"], helpers["setLeadFlag"], helpers["shallowMergeTemplateData"], helpers["skipSxWorkQuickComplete"], helpers["snapshotOrderRowFromQuotation"], helpers["stripCrmAssigneeFromWonStageUpdates"], helpers["stripCrmLeadTypeColorFromSelect"], helpers["stripQuotationsSourceExcelFields"], helpers["sumCrmKpiLedgerNetByLeadIds"], helpers["sumCrmKpiLedgerNetByUserForOrgReport"], helpers["sumCrmKpiLedgerNetByUserIds"], helpers["sumCrmKpiLedgerNetByUserIdsInDateRange"], helpers["supabase"], helpers["syncAllTaskArtifactsToAssignment"], helpers["syncChecklistItemNotes"], helpers["syncCrmLeadSxPipelineFromProject"], helpers["syncQuotationDepositToDealAndProject"], helpers["syncSxKanbanFromCrmProductionStage"], helpers["syncTaskAttachmentToAssignment"], helpers["templateItemAssigneePatch"], helpers["toCrmTaskChecklist"], helpers["unifyCrmLeadResponsibleFields"], helpers["updateCrmLeadTask"], helpers["updateQuotationRow"], helpers["upsertZaloNotifySettings"], helpers["userCanAccessCrmLeadAsParticipant"], helpers["userCanAccessCrmLeadViaVisibility"], helpers["userCanAssignAnyCrmRegion"], helpers["userCanBypassCrmDeleteRestriction"], helpers["userHasSeenLeadInSeenBy"], helpers["userIsAdmin"], helpers["userIsCrmCompanyOrRegionAdmin"], helpers["userMayAccessQuotationRow"], helpers["userSeesAllCrmDeals"], helpers["userSeesAllCrmDealsForScope"], helpers["userSeesAllCrmLeads"], helpers["userSeesAllCrmLeadsForScope"], helpers["uuidQueryOrNull"], helpers["validateProductionCompanyId"]);

module.exports = r;
