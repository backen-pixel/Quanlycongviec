/**
 * CRM routes: dashboard
 * Auto-extracted — handlers close over shared helpers via IIFE.
 */
const { Router } = require('express');
const helpers = require('../shared/helpersBundle');

const r = Router();

(function (ALLOWED_DEADLINE_FIELDS, CRM_COMMENT_ALLOWED_REACTION_EMOJI, CRM_LEAD_KANBAN_LITE_SELECT, CRM_LEAD_LIST_SELECT, CRM_LEAD_LIST_SELECT_BASE, CRM_LEAD_LIST_SELECT_EXTRA, CRM_LEAD_REGION_EMBED, CRM_NEW_LEAD_MAX_AGE_MS, CRM_TASK_SELECT, CRM_UUID_RE, CUSTOMERS_IN_CHUNK, CUSTOMERS_OVERVIEW_NO_MATCH_ID, DEAL_PRE_CONTRACT_SLUGS_STAFF, DEAL_REPORT_BUCKET_VALUES, DEFAULT_CHECKLISTS, DEFAULT_DEADLINE_BUCKETS, DEFAULT_PIPELINE_STAGE_SLA_DAYS, FOLLOWUP_TIME_BUCKETS, PDFDocument, QUOTATIONS_SOURCE_EXCEL_COLS, Router, SCAN_DUP_LITE_SELECT, STAFF_LEAD_DEAL_REPORT_ROLES, SURVEY_EVENT_SELECT, SURVEY_EVENT_TYPES, XLSX, ZALO_APP_SETTING_KEY, crmSchemaCompat, addPhoneToAutoLeadBlocklist, aggregateCrmCommentReactions, aggregateOrgReportRows, appendFulfillmentChildTasksForMasterDeal, applyAllActiveWorkshopTemplatesForArea, applyAssigneesToInsertedCrmTasks, applyCrmLeadRegionFilterToQuery, applyCrmTaskTemplatesToCompanyRegions, applyCustomerIdInFilter, applyCustomersOverviewSearch, applyDefaultWorkshopTemplatesForNewProject, applyLeadOrCustomerSalesFilter, applyProductionTemplateToFulfillmentLead, applyProductionTemplatesOnPipelineEnter, applyStageIdFilterToQuery, applyWorkshopTemplateToProject, artifactNamePrefix, assertCanFlagLead, assertCategoryFitsSource, assertCrmAssigneeUserMatchesLeadCompany, assertCrmEmployeeDeleteAllowed, assertCrmStageAdvanceAllowed, assertDealCrmManualStageChange, assertDealResponsible, assertDivisionAllowedForCompany, assertLeadDocumentOwner, assertLeadReadableByRegionScope, assertRegionBelongsToCompany, assertUserCanAssignCrmRegion, assignProductionCompanyDealResponsibility, attachAssigneesToCrmTasks, attachAssignmentIdsToCrmTasks, attachCrmNextOpenTaskDeadline, attachLeadNewFlagForList, attachLeadReplyParents, attachLeadUserFlagsForList, auth, autoCreateProjectFromWonDeal, autoFlowFns, autoGenCrmTasksForNewLead, buildAssignmentNotificationInsert, buildChecklistLeadDocumentRow, buildCrmDashboardMinimalKpis, buildCrmLeadsRpcFilterParams, buildCustomersOverviewSummary, buildDealTemplateData, buildDefaultDeadlineConfig, buildFirstStageIdByPipeline, buildPipelineStagesMap, buildProcessedCommercialItems, buildQuotedStageOrderByPipeline, buildScanDuplicateGroups, buildWonStageOrderByPipeline, canUserViewDocByAllowlist, chatUpload, chunkArray, classifyDealStageForStaffReport, commentsTableMissing, companyRegionExtraColumnsMissing, companyRegionGeoColumnsMissing, computeCrmDashboardLightStats, computeCrmLiveVersionMs, computeCustomersOverviewSummary, computeIsNewLeadForUser, computeOrgOverviewReportData, computeStaffLeadDealReportData, computeStaffPipelineDetailPayload, countOpenOverdueCrmTasksForLeadIds, createCrmAssignment, createCrmLeadTask, createFulfillmentChildDeal, createNotif, createNotification, createProjectFromLead, crmExecutorFieldsFromTemplateItem, crmLeadCommentAttachmentsColumnMissing, crmLeadCommentReadReceiptsTableMissing, crmLeadRowVisibleToRequestUser, crmListUsesLegacyFilters, crmNoteActivityUpload, crmReportAsOfMs, crmReportCreatedAtFromIso, crmReportCreatedAtToIso, crmReportDayKeyVn, crmRouteErrorText, crmTaskDeadlineModuleKey, crmTaskMeetsCompletionRequirements, crmTaskMeetsRequiredFileTypes, crmTaskRequiresCompletionEvidence, crmTemplateMatchesLeadType, deadlineToDateOnlyIso, defaultCompanyInfo, defaultKpiLedgerMonthStartYmd, deleteCrmLeadTask, deleteMirroredAssignmentFileForTaskAttachment, duplicateLeadIdsFromLiteRows, ecosystemModuleKeyForCrmDeadline, effectivePipelineStageSlaDays, emitCrmBadgeUpdateForProject, emitCrmDashboardChanged, emitCrmTaskChanged, emptyStaffLeadDealAgg, endOfCalendarDayAfterEntered, enforceCommercialDocCompanyOnWrite, enforceQuotaForRequest, ensureDealLeadDocumentsForModuleTransition, ensureDefaultCrmPipelineForCompany, ensureMissingCrmTasksForLead, ensureMissingCrmTasksForPipelineStage, ensureMissingSxTasksForLead, excelUpload, executeLeadMerge, executeZaloDealStageNotify, fetchActivityCustomerIds, fetchAllLeadsForSlaWatchlist, fetchAssignmentForTask, fetchCrmCommentReactionsAggregate, fetchCrmLeadCommentNotifyUserIds, fetchCrmLeadDetailRow, fetchCrmLeadWithPipelineBadges, fetchCrmLeadsByIdsOrdered, fetchCrmLeadsForDashboardBatched, fetchCrmLeadsForOrgReportBatched, fetchCrmLeadsForUserDetailBatched, fetchCrmLeadsLiteForDuplicateScan, fetchCrmLeadsPageViaRpc, fetchCrmPipelineZaloSlice, fetchCrmSurveyEventsChunk, fetchCrmSurveyVisitsForOrgReport, fetchLeadCommentAudienceMembers, fetchLeadCommentAudienceMembersForRead, fetchLeadIdsForCrmRegion, fetchLeadMentionMembers, fetchOrgActivityFeed, fetchPipelineWithStagesById, fetchScopedCrmBundles, fillTemplateDataFromStructure, filterCrmTasksForLeadType, filterUserIdsForCrmLeadScopedNotification, findChecklistItem, followupDismissExpiresAt, fontBold, fontRegular, formatMoney, formatVNDPdf, formatVnPhoneLocal0From84, fs, generateDocPdf, generateFlowTasks, generateStepTasks, getAppSettingValue, getCompanyInfo, getCompanyRegionsList, getCrmLeadListSelect, getCrmLeadRegionConstraint, getCrmLeadTypesList, getCrmLeadsListLegacy, getCrmSourceCategoriesList, getCrmSourcesList, getDefaultCrmAttachmentShare, getDefaultDealZaloTemplateStructure, getDefaultLeadDocumentShareForDeal, getDefaultPipelineIdForCompany, getLeadDocumentFieldsFromCrmTask, getNotifyTargets, getOverdueFollowUps, getPipelineIdForCompanyRegion, getPipelineZaloSlice, getPipelinesList, getProjectCRMSummary, getStagesByPipelineId, getStaleLeads, getZaloNotifySettings, hydrateCrmLeadsByIdsWithStaff, hydrateCrmLeadsRpcPage, hydrateScanDuplicateLeads, insertQuotationRow, invalidateAppSettingKey, invalidatePipelinesAndStages, invalidateRegions, invalidateSources, invalidateTenantUsageCache, invokeCrmLeadsStageCountsRpc, isAdminLike, isAllowedLeadCommentAttachmentUrl, isChotSanXuatCrmTaskTitle, isCrmCompanyAdminUser, isCrmDealAssigneeLocked, isCrmLeadTypeColorMissingError, isCrmModuleAdmin, isCrmPipelinesTableMissingError, isCrmRegionAdminUser, isCrmSystemAdminUser, isDealStageHoanThanhForZalo, isDefaultAssigneeIdsColumnError, isExecutorColumnError, isPlatformAdmin, isPostgresUniqueViolation, isQuotationsSourceExcelColumnMissingError, isSxRelationshipError, isSystemAdmin, isUuidString, isValidDealZaloTemplateStructure, isVcRelationshipError, isVptCompanyCommercialDocViewer, lastNominatimGeocodeAt, leadChatFilesMulter, leadChatJsonOrFiles, listQuotationExcelSheets, loadCrmTaskAttachmentCountMap, loadOrgReportStageMap, loadZaloLinkedLeadIdSet, logDealActivityComment, logDealDeadlineChangeComment, logDealStageChangeComment, logKanbanDeadlineUnifiedHistory, logLeadCommentMentionActivity, logProjectFileActivity, mapCustomerOverviewRow, mapLeadDisplayPhone, mapQuotationItemsToOrderRows, maskCustomerPhoneDisplay, maskZaloAccessTokenPreview, maybeSendZaloOnDealStageEnter, mergeCrmStageDefaultAssigneeIntoUpdates, mergeCustomerIntoTarget, misaService, multer, nextCode, nextTbProjectCode, normalizeCrmActivityAttachments, normalizeCrmLeadCommentAttachments, normalizeCrmStageDefaultAssigneeUserId, normalizeCrmUserRole, normalizeLeadSeenByKeys, normalizeOrgReportSurveyVisitRow, normalizePipelineStageSlaDaysForDb, normalizePipelineStagesList, normalizeRegionIdList, normalizeTemplateChecklistForCrmTask, normalizeTemplateItemAssigneeIds, normalizeTimestamp, normalizeTitleFold, normalizeVnPhoneTo84, notifyDealCommentMentions, notifyDealCommentParticipants, notifyMultiple, notifyMultipleShared, notifyNewCrmAssignmentAssignees, notifyProductionDocumentUploaded, onLeadWon, onOrderConfirmed, onProjectCompleted, onQuotationAccepted, orgReportAttachFirstStageRates, orgReportBumpFirstStageMetrics, orgReportBumpMetrics, orgReportBumpOpenOverdue, orgReportBumpReceptionMetrics, orgReportCancelRatePct, orgReportClosedWonDealCount, orgReportClosedWonValue, orgReportCompareSummary, orgReportConversionRate, orgReportDayKey, orgReportDealCloseValueRatePct, orgReportDealCountsExpected, orgReportDealIsClosedWon, orgReportDealIsCompleted, orgReportDealIsQuotedOrAfter, orgReportDealProbability, orgReportDealSplitBuckets, orgReportExtendedDealMetrics, orgReportFirstStageOnTimeRatePct, orgReportFirstStageOverdueRatePct, orgReportIsReceptionOverdue, orgReportIsSlaOverdue, orgReportKpiPeriodStart, orgReportNumEst, orgReportOverdueRatePct, orgReportOwnerId, orgReportPctDelta, orgReportPreviousPeriod, orgReportQuoteValueCloseRatePct, orgReportQuoteWinRatePct, orgReportReceptionOverdueRatePct, orgReportReceptionSlaMinutes, orgReportStageIsClosed, orgReportStageIsLostOrCancelled, orgReportTotalDealCount, parseChecklist, parseCrmLeadsPageRpc, parseCrmReportDateRange, parseCrmStageCountsNumericMap, parseCrmStageCountsRpc, parseExcelMoneyFromMappedColumn, parseLeadIdUuidList, parseLeadIdsCsvQuery, parseLeadIdsFromBody, parseLeadSeenByRaw, parseQuotationExcelBuffer, parseStageIdsFromQuery, parseUuidArrayJsonb, parseVietnameseMeasure, parseVietnameseMoney, path, persistAssignmentNotification, pgCrmDuplicateLeadIds, pickDealZaloTemplatePayload, pipeOrgOverviewReportPdf, pipeStaffLeadDealSummaryPdf, pipeStaffPipelineDetailPdf, pipelineHasExplicitCompleted, pipelineHasExplicitExpected, pipelineHasExplicitWon, plannerTableMissing, postCrmStageDefaultAssigneeComment, primaryTemplateItemAssigneeId, rcInvalidateTags, reactionsTableMissing, redactCrmTaskNotesForViewer, regionGeocodeInflight, repairCrmDealPipelineDisplay, requireUserCompanyId, requireUserCompanyIdResolved, resolveAssignmentIdForTask, resolveCanonicalCrmLeadId, resolveCommercialDocListCompanyScope, resolveCrmBundleTemplateScope, resolveCrmLeadsDeadlinesMap, resolveCrmLeadsKanbanLite, resolveCrmLeadsMergedQuery, resolveCrmLeadsSkipDeadline, resolveCrmLedgerNetByLeadIdsPayload, resolveCrmReportScope, resolveCrmTaskWriteLeadId, resolveExecutorCompanyId, resolveKanbanStagesForCompany, resolveLeadCommentMentionIds, resolveProductionCompanyForDealStage, resolveProductionHandoverResponsibleUserId, resolveReopenTargetStageId, resolveRpcRegionIdsForCrmList, resolveTenantIdForQuota, resolveZaloDealTemplateId, respondIfCrmPipelinesTableMissing, responseCache, restoreCrmTaskChecklistFromWorkshopTemplate, resyncCrmPipelineTasksForLead, sanitizeIsoDateQueryParam, scheduleRegionGeocoding, scopedAdminCompanyId, scopedCrmCompanyIdForWrite, sendZaloTemplateMessage, setLeadFlag, shallowMergeTemplateData, skipSxWorkQuickComplete, snapshotOrderRowFromQuotation, stripCrmAssigneeFromWonStageUpdates, stripCrmLeadTypeColorFromSelect, stripQuotationsSourceExcelFields, sumCrmKpiLedgerNetByLeadIds, sumCrmKpiLedgerNetByUserForOrgReport, sumCrmKpiLedgerNetByUserIds, sumCrmKpiLedgerNetByUserIdsInDateRange, supabase, syncAllTaskArtifactsToAssignment, syncChecklistItemNotes, syncCrmLeadSxPipelineFromProject, syncQuotationDepositToDealAndProject, syncSxKanbanFromCrmProductionStage, syncTaskAttachmentToAssignment, templateItemAssigneePatch, toCrmTaskChecklist, unifyCrmLeadResponsibleFields, updateCrmLeadTask, updateQuotationRow, upsertZaloNotifySettings, userCanAccessCrmLeadAsParticipant, userCanAccessCrmLeadViaVisibility, userCanAssignAnyCrmRegion, userCanBypassCrmDeleteRestriction, userHasSeenLeadInSeenBy, userIsAdmin, userIsCrmCompanyOrRegionAdmin, userMayAccessQuotationRow, userSeesAllCrmDeals, userSeesAllCrmDealsForScope, userSeesAllCrmLeads, userSeesAllCrmLeadsForScope, uuidQueryOrNull, validateProductionCompanyId) {
r.get('/_version', (req, res) => {
  res.json({
    ok: true,
    routes_hint: ['GET /lead-types', 'POST /lead-types'],
    time: new Date().toISOString(),
  });
});

r.get('/kanban-rows', responseCache({ ttl: 10, scope: 'user', tags: ['crm:list'] }), async (req, res) => {
  try {
    const leadIds = parseLeadIdsCsvQuery(req.query.lead_ids, 50);
    if (!leadIds.length) return res.json({ data: [] });

    const sac = scopedAdminCompanyId(req);
    if (!userIsAdmin(req.user?.role) && !sac) {
      const cid = await requireUserCompanyIdResolved(req, res);
      if (!cid) return;
    }

    const lite = resolveCrmLeadsKanbanLite(req.query);
    const skipDeadline = resolveCrmLeadsSkipDeadline(req.query);
    let hydrated = await fetchCrmLeadsByIdsOrdered(leadIds, { skipEnrich: lite, lite });

    if (sac) {
      hydrated = hydrated.filter((r) => String(r.company_id || '') === String(sac));
    } else if (!userIsAdmin(req.user?.role)) {
      const { resolveCompanyIdForUser } = require('../../../middleware/auth');
      const cid = await resolveCompanyIdForUser(req.user?.userId);
      if (cid) hydrated = hydrated.filter((r) => String(r.company_id || '') === String(cid));
    }
    hydrated = hydrated.filter((r) => {
      const ar = assertLeadReadableByRegionScope(req, r);
      return ar.ok;
    });

    let page = attachLeadNewFlagForList(hydrated, req.user?.userId);
    if (!skipDeadline) page = await attachCrmNextOpenTaskDeadline(page);
    page = await attachLeadUserFlagsForList(page, req.user?.userId);
    res.json({ data: page });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Lỗi tải kanban-rows' });
  }
});

r.get('/live-version', responseCache({ ttl: 5, scope: 'company', tags: ['crm:live'] }), async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    const rawC = req.query.company_id && String(req.query.company_id).trim() ? String(req.query.company_id).trim() : null;
    let effectiveCompanyId = rawC;
    const sacDash = scopedAdminCompanyId(req);
    if (sacDash) {
      effectiveCompanyId = sacDash;
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      effectiveCompanyId = cid;
    }

    const v = await computeCrmLiveVersionMs(req, effectiveCompanyId || null, date_from, date_to);
    res.json({ v });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

r.get('/dashboard', responseCache({ ttl: 30, scope: 'user', tags: ['crm:list'] }), async (req, res) => {
  try {
    const { type = 'lead', company_id, date_from, date_to } = req.query; // 'lead' or 'deal'
    const rawC = company_id && String(company_id).trim() ? String(company_id).trim() : null;
    let effectiveCompanyId = rawC;
    const sacDash = scopedAdminCompanyId(req);
    if (sacDash) {
      effectiveCompanyId = sacDash;
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      effectiveCompanyId = cid;
    }

    // Pipeline stages for the specified type — chỉ pipeline mặc định của công ty (tránh trộn cột nhiều pipeline)
    let stagesQuery = supabase
      .from('crm_pipeline_stages')
      .select('id, name, color, icon, order_index, is_won, is_lost, pipeline_type, default_probability')
      .eq('is_active', true)
      .eq('pipeline_type', type)
      .order('order_index');
    if (effectiveCompanyId) {
      const { data: defPl } = await supabase
        .from('crm_pipelines')
        .select('id')
        .eq('company_id', effectiveCompanyId)
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('created_at')
        .limit(1)
        .maybeSingle();
      if (defPl?.id) stagesQuery = stagesQuery.eq('pipeline_id', defPl.id);
    }
    const { data: stages } = await stagesQuery;

    const dealAssigneeOnly =
      type === 'deal' && req.user?.userId && !userSeesAllCrmDealsForScope(req.user) ? req.user.userId : null;
    const leadAssigneeOnly =
      type === 'lead' && req.user?.userId && !userSeesAllCrmLeadsForScope(req.user) ? req.user.userId : null;
    const selfAssigneeOnly = type === 'deal' ? dealAssigneeOnly : leadAssigneeOnly;
    const queryAssigneeUuid = uuidQueryOrNull(req.query.assigned_to);
    const canUseAssigneeQuery =
      type === 'deal' ? userSeesAllCrmDealsForScope(req.user) : userSeesAllCrmLeadsForScope(req.user);
    const assigneeFromQuery =
      !selfAssigneeOnly && canUseAssigneeQuery && queryAssigneeUuid ? queryAssigneeUuid : null;
    const assigned_to_only = selfAssigneeOnly || assigneeFromQuery || null;
    const light = req.query.light === '1' || req.query.light === 'true';
    const minimal = req.query.minimal === '1' || req.query.minimal === 'true';
    const phone_filter = req.query.phone_filter;
    const explicitRegionId = uuidQueryOrNull(req.query.region_id);
    const canUseLight =
      light &&
      !crmListUsesLegacyFilters({
        ...req.query,
        type,
        company_id: effectiveCompanyId || undefined,
        assigned_to: assigned_to_only || undefined,
        date_from,
        date_to,
        phone_filter,
      });

    let leads = [];
    let stageStats;
    let totalItems;
    let wonCountLight = null;

    if (canUseLight) {
      const lightStats = await computeCrmDashboardLightStats(req, type, {
        effectiveCompanyId,
        region_id: explicitRegionId || undefined,
        stages: stages || [],
        assigned_to_only,
        date_from,
        date_to,
        phone_filter,
      });
      stageStats = lightStats.stageStats;
      totalItems = lightStats.totalItems;
      wonCountLight = lightStats.wonCount;
    } else {
      leads = await fetchCrmLeadsForDashboardBatched(type, {
      company_id: effectiveCompanyId || undefined,
        region_id: explicitRegionId || undefined,
      date_from,
      date_to,
      assigned_to_only,
      req,
    });
      stageStats = (stages || []).map((s) => {
        const stageLeads = (leads || []).filter((l) => l.stage_id === s.id);
      const probPct = (l) => {
        const raw = l.probability;
        const fallback = s.default_probability;
        const p = raw != null && raw !== '' ? Number(raw) : (fallback != null && fallback !== '' ? Number(fallback) : 0);
        return Number.isFinite(p) ? Math.max(0, Math.min(100, p)) : 0;
      };
      return {
        ...s,
        count: stageLeads.length,
        value: stageLeads.reduce((sum, l) => sum + (l.estimated_value || 0), 0),
        weighted: stageLeads.reduce((sum, l) => sum + (l.estimated_value || 0) * probPct(l) / 100, 0),
      };
    });
      totalItems = (leads || []).length;
    }

    const leadIdsScope = canUseLight
      ? parseLeadIdsCsvQuery(req.query.lead_ids, 500)
      : (leads || []).map((l) => l.id).filter(Boolean);
    let overdue_tasks = 0;
    if (!minimal) {
    try {
      overdue_tasks = await countOpenOverdueCrmTasksForLeadIds(leadIdsScope);
    } catch (e) {
      console.warn('[crm/dashboard] overdue_tasks count:', e.message);
      }
    }

    const rawLedgerPs = req.query.ledger_period_start && String(req.query.ledger_period_start).trim();
    const ledgerPeriodStart = (rawLedgerPs && /^\d{4}-\d{2}-\d{2}$/.test(rawLedgerPs.slice(0, 10)))
      ? rawLedgerPs.slice(0, 10)
      : defaultKpiLedgerMonthStartYmd();
    let ledgerNetByLead = {};
    if (!minimal) {
    try {
      if (leadIdsScope.length) {
        ledgerNetByLead = await sumCrmKpiLedgerNetByLeadIds(leadIdsScope, ledgerPeriodStart, 'monthly', {
          userId: assigned_to_only || null,
        });
      }
    } catch (e) {
      console.warn('[crm/dashboard] kpi ledger sums:', e.message);
      }
    }
    const kpiLedgerMonthNetSum = Math.round(
      Object.values(ledgerNetByLead).reduce((a, b) => a + Number(b || 0), 0) * 100,
    ) / 100;

    // KPIs split by type
    const wonItems = canUseLight
      ? { length: wonCountLight || 0 }
      : (leads || []).filter((l) => {
          const st = (stages || []).find((s) => s.id === l.stage_id);
      return st?.is_won;
    });
    const totalValue = canUseLight ? 0 : (leads || []).reduce((s, l) => s + (l.estimated_value || 0), 0);
    const wonValue = canUseLight
      ? 0
      : (Array.isArray(wonItems) ? wonItems : []).reduce((s, l) => s + (l.estimated_value || 0), 0);
    const wonItemCount = Array.isArray(wonItems) ? wonItems.length : (wonItems?.length ?? 0);

    let kpis = {};
    if (type === 'lead') {
      let conversionRate = 0;
      let nDeals = 0;
      if (!minimal) {
      const uid = req.user?.userId;
      let allLeadsQ = supabase.from('crm_leads').select('*', { count: 'exact', head: true }).eq('type', 'lead');
      let dealsConvertedQ = supabase.from('crm_leads').select('*', { count: 'exact', head: true }).eq('type', 'deal');
      if (effectiveCompanyId) {
        allLeadsQ = allLeadsQ.eq('company_id', effectiveCompanyId);
        dealsConvertedQ = dealsConvertedQ.eq('company_id', effectiveCompanyId);
      }
      allLeadsQ = applyCrmLeadRegionFilterToQuery(allLeadsQ, req);
      dealsConvertedQ = applyCrmLeadRegionFilterToQuery(dealsConvertedQ, req);
      if (uid && !userSeesAllCrmLeadsForScope(req.user)) {
        allLeadsQ = allLeadsQ.or(`assigned_to.eq.${uid},lead_owner_id.eq.${uid}`);
      }
      if (uid && !userSeesAllCrmDealsForScope(req.user)) {
        dealsConvertedQ = dealsConvertedQ.eq('assigned_to', uid);
      }
      const { count: allLeadsCount } = await allLeadsQ;
      const { count: dealsConvertedCount } = await dealsConvertedQ;
      const nLeads = allLeadsCount ?? 0;
        nDeals = dealsConvertedCount ?? 0;
        conversionRate = nLeads > 0 ? Math.round((nDeals / nLeads) * 100) : 0;
      }
      kpis = {
        total_leads: totalItems,
        converted_to_deals: nDeals,
        conversion_rate: conversionRate,
        total_value: totalValue,
        conversion_value: wonValue,
        overdue_tasks,
        kpi_ledger_month_net_sum: kpiLedgerMonthNetSum,
        kpi_ledger_period_start: ledgerPeriodStart,
        ...(minimal ? { deferred: true } : {}),
      };
    } else {
      // Deal KPIs
      kpis = {
        total_deals: totalItems,
        won_deals: wonItemCount,
        won_rate: totalItems > 0 ? Math.round(wonItemCount / totalItems * 100) : 0,
        total_value: totalValue,
        won_value: wonValue,
        overdue_tasks,
        kpi_ledger_month_net_sum: kpiLedgerMonthNetSum,
        kpi_ledger_period_start: ledgerPeriodStart,
        ...(minimal ? { deferred: true } : {}),
      };
    }

    // Recent quotations (only for deal dashboard)
    let recentQuotes = [];
    if (type === 'deal' && !minimal) {
      let qQ = supabase
        .from('quotations')
        .select('id, code, title, total, status, created_at, customer_name')
        .order('created_at', { ascending: false })
        .limit(5);
      if (effectiveCompanyId) qQ = qQ.eq('company_id', effectiveCompanyId);
      if (!userIsAdmin(req.user?.role) && req.user?.userId) qQ = qQ.eq('created_by', req.user.userId);
      const { data } = await qQ;
      recentQuotes = data || [];
    }

    // Recent orders (only for deal dashboard)
    let recentOrders = [];
    if (type === 'deal' && !minimal) {
      let qO = supabase
        .from('orders')
        .select('id, code, title, total, status, payment_status, created_at, customer_name')
        .order('created_at', { ascending: false })
        .limit(5);
      if (effectiveCompanyId) qO = qO.eq('company_id', effectiveCompanyId);
      const { data } = await qO;
      recentOrders = data || [];
    }

    res.json({
      pipeline: stageStats,
      kpis,
      ledger_net_by_lead: ledgerNetByLead,
      recent_quotations: recentQuotes,
      recent_orders: recentOrders,
      light: canUseLight,
      minimal: !!minimal,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/ledger-net-by-leads', responseCache({ ttl: 30, scope: 'user', tags: ['crm:list'] }), async (req, res) => {
  try {
    const leadIds = parseLeadIdsCsvQuery(req.query.lead_ids, 80);
    const payload = await resolveCrmLedgerNetByLeadIdsPayload(req, leadIds, {
      ledger_period_start: req.query.ledger_period_start,
      assigned_to: req.query.assigned_to,
      type: req.query.type,
    });
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/ledger-net-by-leads', async (req, res) => {
  try {
    const leadIds = parseLeadIdsFromBody(req.body, 500);
    const payload = await resolveCrmLedgerNetByLeadIdsPayload(req, leadIds, {
      ledger_period_start: req.body?.ledger_period_start,
      assigned_to: req.body?.assigned_to,
      type: req.body?.type,
    });
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/contract-signed-revenue', async (req, res) => {
  try {
    const rawC = req.query.company_id && String(req.query.company_id).trim() ? String(req.query.company_id).trim() : null;
    let effectiveCompanyId = rawC;
    const sac = scopedAdminCompanyId(req);
    if (sac) {
      effectiveCompanyId = sac;
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      effectiveCompanyId = cid;
    }

    const dfRaw = req.query.date_from && String(req.query.date_from).trim();
    const dtRaw = req.query.date_to && String(req.query.date_to).trim();
    const dateFrom = dfRaw && /^\d{4}-\d{2}-\d{2}$/.test(dfRaw.slice(0, 10)) ? dfRaw.slice(0, 10) : null;
    const dateTo = dtRaw && /^\d{4}-\d{2}-\d{2}$/.test(dtRaw.slice(0, 10)) ? dtRaw.slice(0, 10) : null;

    const assignedToFromQuery =
      req.query.assigned_to && String(req.query.assigned_to).trim() ? String(req.query.assigned_to).trim() : null;
    const dealSelfOnly =
      req.user?.userId && !userSeesAllCrmDealsForScope(req.user) ? req.user.userId : null;
    const effectiveAssignee = dealSelfOnly || assignedToFromQuery || null;

    let windowCapped = false;
    let enteredFromIso = dateFrom ? crmReportCreatedAtFromIso(dateFrom) : null;
    let enteredToIso = dateTo ? crmReportCreatedAtToIso(dateTo) : null;
    if (!enteredFromIso && !enteredToIso) {
      const roll = new Date();
      roll.setUTCMonth(roll.getUTCMonth() - 24);
      enteredFromIso = roll.toISOString();
      windowCapped = true;
    }

    const numEv = (x) => {
      const n = Number(x);
      return Number.isFinite(n) ? n : 0;
    };
    const utcMonthKey = (iso) => {
      if (!iso) return null;
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return null;
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    };

    const PAGE = 1000;
    const MAX_PAGES = 500;
    const histRows = [];
    for (let page = 0, from = 0; page < MAX_PAGES; page += 1, from += PAGE) {
      let hq = supabase
        .from('crm_lead_stage_history')
        .select('lead_id, entered_at')
        .eq('to_canonical_slug', 'contract_signed')
        .eq('pipeline_type', 'deal');
      if (enteredFromIso) hq = hq.gte('entered_at', enteredFromIso);
      if (enteredToIso) hq = hq.lte('entered_at', enteredToIso);
      const { data, error } = await hq.range(from, from + PAGE - 1).order('entered_at', { ascending: true });
      if (error) throw error;
      const chunk = data || [];
      histRows.push(...chunk);
      if (chunk.length < PAGE) break;
    }

    const leadIds = [...new Set(histRows.map((h) => h.lead_id).filter(Boolean))];
    const evByLeadId = new Map();
    const CH = 200;
    for (let i = 0; i < leadIds.length; i += CH) {
      const part = leadIds.slice(i, i + CH);
      let lq = supabase
        .from('crm_leads')
        .select('id, estimated_value, company_id, assigned_to')
        .eq('type', 'deal')
        .in('id', part);
      if (effectiveCompanyId) lq = lq.eq('company_id', effectiveCompanyId);
      lq = applyCrmLeadRegionFilterToQuery(lq, req);
      if (effectiveAssignee) lq = lq.eq('assigned_to', effectiveAssignee);
      const { data: leadsChunk, error: le } = await lq;
      if (le) throw le;
      for (const L of leadsChunk || []) {
        if (L?.id) evByLeadId.set(String(L.id), numEv(L.estimated_value));
      }
    }

    const byMonthMap = Object.create(null);
    for (const h of histRows) {
      const lid = h.lead_id != null ? String(h.lead_id) : '';
      if (!lid || !evByLeadId.has(lid)) continue;
      const m = utcMonthKey(h.entered_at);
      if (!m) continue;
      if (!byMonthMap[m]) byMonthMap[m] = { total: 0, ids: new Set() };
      if (byMonthMap[m].ids.has(lid)) continue;
      byMonthMap[m].ids.add(lid);
      byMonthMap[m].total += evByLeadId.get(lid);
    }

    const by_month = Object.keys(byMonthMap)
      .sort()
      .map((month) => ({
        month,
        total: Math.round(byMonthMap[month].total * 100) / 100,
        deal_count: byMonthMap[month].ids.size,
      }));
    const total_value = Math.round(by_month.reduce((s, r) => s + r.total, 0) * 100) / 100;

    res.json({
      by_month,
      total_value,
      window_capped: windowCapped,
      date_from: dateFrom,
      date_to: dateTo,
    });
  } catch (e) {
    console.error('GET /crm/contract-signed-revenue:', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

r.get('/employees-by-company', responseCache({ ttl: 120, scope: 'company', tags: ['orgtree'] }), async (req, res) => {
  try {
    const userId = req.user.userId;
    const { company_id: queryCompanyId } = req.query;
    const forModuleRaw = String(req.query?.for_module || 'crm').trim().toLowerCase();
    const forModule = ['crm', 'production', 'logistics', 'all'].includes(forModuleRaw) ? forModuleRaw : 'crm';

    const sacEmp = scopedAdminCompanyId(req);
    // for_module=all: thêm thành viên deal HST — cho phép chọn CT trong query (không khóa sac).
    // Còn lại: admin gắn công ty → chỉ công ty đó.
    let companyId = (forModule === 'all' && queryCompanyId)
      ? queryCompanyId
      : (sacEmp || queryCompanyId);
    if (!companyId) {
      const { data: userData } = await supabase.from('users')
        .select('department_id, company_id')
        .eq('id', userId).single();
      companyId = userData?.company_id || null;
      if (!companyId && userData?.department_id) {
        const { data: deptData } = await supabase.from('departments')
          .select('company_id')
          .eq('id', userData.department_id).single();
        companyId = deptData?.company_id;
      }
    }

    if (!companyId) {
      return res.json({ users: [], departments: [], company_id: null });
    }

    // Lọc phòng ban theo module để picker phụ trách chỉ hiện đúng đội.
    const { data: allDepts } = await supabase.from('departments')
      .select('id, name, color, company_id')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('name');

    const MODULE_DEPT_KEYWORDS = {
      crm: ['kinh doanh', 'sales', 'cskh', 'marketing', 'tư vấn', 'chăm sóc', 'thương mại', 'phát triển'],
      production: ['sản xuất', 'xuong', 'xưởng', 'kỹ thuật', 'ky thuat', 'gia công', 'gia cong', 'thi công', 'thi cong'],
      logistics: ['logistics', 'vận chuyển', 'van chuyen', 'giao hàng', 'giao hang', 'lắp đặt', 'lap dat', 'kho'],
    };
    const moduleKeywords = MODULE_DEPT_KEYWORDS[forModule] || MODULE_DEPT_KEYWORDS.crm;
    const moduleDepts = forModule === 'all'
      ? (allDepts || [])
      : (allDepts || []).filter((d) => {
        const lowerName = (d.name || '').toLowerCase();
        return moduleKeywords.some((kw) => lowerName.includes(kw));
      });

    // Nếu chưa map được theo keyword module → fallback tất cả phòng ban công ty.
    const targetDepts = forModule === 'all'
      ? (allDepts || [])
      : (moduleDepts.length > 0 ? moduleDepts : (allDepts || []));
    const deptIds = targetDepts.map(d => d.id);

    let userRows = [];
    if (deptIds.length) {
      const { data: users } = await supabase.from('users')
        .select('id, full_name, email, phone, avatar, role, department_id, position')
        .in('department_id', deptIds)
        .eq('is_active', true)
        .order('full_name');
      userRows = users || [];
    }

    // SX/VC/all: bổ sung NV gắn trực tiếp company_id (có thể không thuộc phòng ban keyword).
    if (forModule === 'production' || forModule === 'logistics' || forModule === 'all') {
      const { loadUsersForProductionCompany } = require('../../../helpers/productionWorkshopTypeStaff');
      const directUsers = await loadUsersForProductionCompany(companyId);
      const seen = new Set(userRows.map((u) => u.id));
      for (const u of directUsers) {
        if (!u?.id || seen.has(u.id)) continue;
        seen.add(u.id);
        userRows.push({
          id: u.id,
          full_name: u.full_name,
          email: u.email,
          phone: null,
          avatar: null,
          role: u.role,
          department_id: u.department?.id ?? null,
          position: null,
        });
      }
      userRows.sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || ''), 'vi'));
    }

    if (!userRows.length) {
      return res.json({ users: [], departments: targetDepts, company_id: companyId });
    }

    const userIds = userRows.map((u) => u.id).filter(Boolean);
    const regionByUser = {};
    if (userIds.length) {
      const { data: urRows } = await supabase
        .from('user_company_regions')
        .select('user_id, region_id')
        .in('user_id', userIds);
      for (const row of urRows || []) {
        if (!row.user_id) continue;
        if (!regionByUser[row.user_id]) regionByUser[row.user_id] = [];
        regionByUser[row.user_id].push(row.region_id);
      }
    }
    for (const u of userRows) {
      u.crm_region_ids = normalizeRegionIdList(regionByUser[u.id] || []);
    }

    res.json({
      users: userRows,
      departments: targetDepts,
      company_id: companyId,
      for_module: forModule,
      is_module_filtered: forModule !== 'all' && moduleDepts.length > 0,
    });
  } catch (e) {
    console.error('employees-by-company error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

r.get('/alerts/follow-ups', async (req, res) => {
  try {
    const overdue = await getOverdueFollowUps();
    const stale = await getStaleLeads(parseInt(req.query.days) || 7);
    res.json({ overdue, stale, total: overdue.length + stale.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
}).call(null, helpers["ALLOWED_DEADLINE_FIELDS"], helpers["CRM_COMMENT_ALLOWED_REACTION_EMOJI"], helpers["CRM_LEAD_KANBAN_LITE_SELECT"], helpers["CRM_LEAD_LIST_SELECT"], helpers["CRM_LEAD_LIST_SELECT_BASE"], helpers["CRM_LEAD_LIST_SELECT_EXTRA"], helpers["CRM_LEAD_REGION_EMBED"], helpers["CRM_NEW_LEAD_MAX_AGE_MS"], helpers["CRM_TASK_SELECT"], helpers["CRM_UUID_RE"], helpers["CUSTOMERS_IN_CHUNK"], helpers["CUSTOMERS_OVERVIEW_NO_MATCH_ID"], helpers["DEAL_PRE_CONTRACT_SLUGS_STAFF"], helpers["DEAL_REPORT_BUCKET_VALUES"], helpers["DEFAULT_CHECKLISTS"], helpers["DEFAULT_DEADLINE_BUCKETS"], helpers["DEFAULT_PIPELINE_STAGE_SLA_DAYS"], helpers["FOLLOWUP_TIME_BUCKETS"], helpers["PDFDocument"], helpers["QUOTATIONS_SOURCE_EXCEL_COLS"], helpers["Router"], helpers["SCAN_DUP_LITE_SELECT"], helpers["STAFF_LEAD_DEAL_REPORT_ROLES"], helpers["SURVEY_EVENT_SELECT"], helpers["SURVEY_EVENT_TYPES"], helpers["XLSX"], helpers["ZALO_APP_SETTING_KEY"], helpers["crmSchemaCompat"], helpers["addPhoneToAutoLeadBlocklist"], helpers["aggregateCrmCommentReactions"], helpers["aggregateOrgReportRows"], helpers["appendFulfillmentChildTasksForMasterDeal"], helpers["applyAllActiveWorkshopTemplatesForArea"], helpers["applyAssigneesToInsertedCrmTasks"], helpers["applyCrmLeadRegionFilterToQuery"], helpers["applyCrmTaskTemplatesToCompanyRegions"], helpers["applyCustomerIdInFilter"], helpers["applyCustomersOverviewSearch"], helpers["applyDefaultWorkshopTemplatesForNewProject"], helpers["applyLeadOrCustomerSalesFilter"], helpers["applyProductionTemplateToFulfillmentLead"], helpers["applyProductionTemplatesOnPipelineEnter"], helpers["applyStageIdFilterToQuery"], helpers["applyWorkshopTemplateToProject"], helpers["artifactNamePrefix"], helpers["assertCanFlagLead"], helpers["assertCategoryFitsSource"], helpers["assertCrmAssigneeUserMatchesLeadCompany"], helpers["assertCrmEmployeeDeleteAllowed"], helpers["assertCrmStageAdvanceAllowed"], helpers["assertDealCrmManualStageChange"], helpers["assertDealResponsible"], helpers["assertDivisionAllowedForCompany"], helpers["assertLeadDocumentOwner"], helpers["assertLeadReadableByRegionScope"], helpers["assertRegionBelongsToCompany"], helpers["assertUserCanAssignCrmRegion"], helpers["assignProductionCompanyDealResponsibility"], helpers["attachAssigneesToCrmTasks"], helpers["attachAssignmentIdsToCrmTasks"], helpers["attachCrmNextOpenTaskDeadline"], helpers["attachLeadNewFlagForList"], helpers["attachLeadReplyParents"], helpers["attachLeadUserFlagsForList"], helpers["auth"], helpers["autoCreateProjectFromWonDeal"], helpers["autoFlowFns"], helpers["autoGenCrmTasksForNewLead"], helpers["buildAssignmentNotificationInsert"], helpers["buildChecklistLeadDocumentRow"], helpers["buildCrmDashboardMinimalKpis"], helpers["buildCrmLeadsRpcFilterParams"], helpers["buildCustomersOverviewSummary"], helpers["buildDealTemplateData"], helpers["buildDefaultDeadlineConfig"], helpers["buildFirstStageIdByPipeline"], helpers["buildPipelineStagesMap"], helpers["buildProcessedCommercialItems"], helpers["buildQuotedStageOrderByPipeline"], helpers["buildScanDuplicateGroups"], helpers["buildWonStageOrderByPipeline"], helpers["canUserViewDocByAllowlist"], helpers["chatUpload"], helpers["chunkArray"], helpers["classifyDealStageForStaffReport"], helpers["commentsTableMissing"], helpers["companyRegionExtraColumnsMissing"], helpers["companyRegionGeoColumnsMissing"], helpers["computeCrmDashboardLightStats"], helpers["computeCrmLiveVersionMs"], helpers["computeCustomersOverviewSummary"], helpers["computeIsNewLeadForUser"], helpers["computeOrgOverviewReportData"], helpers["computeStaffLeadDealReportData"], helpers["computeStaffPipelineDetailPayload"], helpers["countOpenOverdueCrmTasksForLeadIds"], helpers["createCrmAssignment"], helpers["createCrmLeadTask"], helpers["createFulfillmentChildDeal"], helpers["createNotif"], helpers["createNotification"], helpers["createProjectFromLead"], helpers["crmExecutorFieldsFromTemplateItem"], helpers["crmLeadCommentAttachmentsColumnMissing"], helpers["crmLeadCommentReadReceiptsTableMissing"], helpers["crmLeadRowVisibleToRequestUser"], helpers["crmListUsesLegacyFilters"], helpers["crmNoteActivityUpload"], helpers["crmReportAsOfMs"], helpers["crmReportCreatedAtFromIso"], helpers["crmReportCreatedAtToIso"], helpers["crmReportDayKeyVn"], helpers["crmRouteErrorText"], helpers["crmTaskDeadlineModuleKey"], helpers["crmTaskMeetsCompletionRequirements"], helpers["crmTaskMeetsRequiredFileTypes"], helpers["crmTaskRequiresCompletionEvidence"], helpers["crmTemplateMatchesLeadType"], helpers["deadlineToDateOnlyIso"], helpers["defaultCompanyInfo"], helpers["defaultKpiLedgerMonthStartYmd"], helpers["deleteCrmLeadTask"], helpers["deleteMirroredAssignmentFileForTaskAttachment"], helpers["duplicateLeadIdsFromLiteRows"], helpers["ecosystemModuleKeyForCrmDeadline"], helpers["effectivePipelineStageSlaDays"], helpers["emitCrmBadgeUpdateForProject"], helpers["emitCrmDashboardChanged"], helpers["emitCrmTaskChanged"], helpers["emptyStaffLeadDealAgg"], helpers["endOfCalendarDayAfterEntered"], helpers["enforceCommercialDocCompanyOnWrite"], helpers["enforceQuotaForRequest"], helpers["ensureDealLeadDocumentsForModuleTransition"], helpers["ensureDefaultCrmPipelineForCompany"], helpers["ensureMissingCrmTasksForLead"], helpers["ensureMissingCrmTasksForPipelineStage"], helpers["ensureMissingSxTasksForLead"], helpers["excelUpload"], helpers["executeLeadMerge"], helpers["executeZaloDealStageNotify"], helpers["fetchActivityCustomerIds"], helpers["fetchAllLeadsForSlaWatchlist"], helpers["fetchAssignmentForTask"], helpers["fetchCrmCommentReactionsAggregate"], helpers["fetchCrmLeadCommentNotifyUserIds"], helpers["fetchCrmLeadDetailRow"], helpers["fetchCrmLeadWithPipelineBadges"], helpers["fetchCrmLeadsByIdsOrdered"], helpers["fetchCrmLeadsForDashboardBatched"], helpers["fetchCrmLeadsForOrgReportBatched"], helpers["fetchCrmLeadsForUserDetailBatched"], helpers["fetchCrmLeadsLiteForDuplicateScan"], helpers["fetchCrmLeadsPageViaRpc"], helpers["fetchCrmPipelineZaloSlice"], helpers["fetchCrmSurveyEventsChunk"], helpers["fetchCrmSurveyVisitsForOrgReport"], helpers["fetchLeadCommentAudienceMembers"], helpers["fetchLeadCommentAudienceMembersForRead"], helpers["fetchLeadIdsForCrmRegion"], helpers["fetchLeadMentionMembers"], helpers["fetchOrgActivityFeed"], helpers["fetchPipelineWithStagesById"], helpers["fetchScopedCrmBundles"], helpers["fillTemplateDataFromStructure"], helpers["filterCrmTasksForLeadType"], helpers["filterUserIdsForCrmLeadScopedNotification"], helpers["findChecklistItem"], helpers["followupDismissExpiresAt"], helpers["fontBold"], helpers["fontRegular"], helpers["formatMoney"], helpers["formatVNDPdf"], helpers["formatVnPhoneLocal0From84"], helpers["fs"], helpers["generateDocPdf"], helpers["generateFlowTasks"], helpers["generateStepTasks"], helpers["getAppSettingValue"], helpers["getCompanyInfo"], helpers["getCompanyRegionsList"], helpers["getCrmLeadListSelect"], helpers["getCrmLeadRegionConstraint"], helpers["getCrmLeadTypesList"], helpers["getCrmLeadsListLegacy"], helpers["getCrmSourceCategoriesList"], helpers["getCrmSourcesList"], helpers["getDefaultCrmAttachmentShare"], helpers["getDefaultDealZaloTemplateStructure"], helpers["getDefaultLeadDocumentShareForDeal"], helpers["getDefaultPipelineIdForCompany"], helpers["getLeadDocumentFieldsFromCrmTask"], helpers["getNotifyTargets"], helpers["getOverdueFollowUps"], helpers["getPipelineIdForCompanyRegion"], helpers["getPipelineZaloSlice"], helpers["getPipelinesList"], helpers["getProjectCRMSummary"], helpers["getStagesByPipelineId"], helpers["getStaleLeads"], helpers["getZaloNotifySettings"], helpers["hydrateCrmLeadsByIdsWithStaff"], helpers["hydrateCrmLeadsRpcPage"], helpers["hydrateScanDuplicateLeads"], helpers["insertQuotationRow"], helpers["invalidateAppSettingKey"], helpers["invalidatePipelinesAndStages"], helpers["invalidateRegions"], helpers["invalidateSources"], helpers["invalidateTenantUsageCache"], helpers["invokeCrmLeadsStageCountsRpc"], helpers["isAdminLike"], helpers["isAllowedLeadCommentAttachmentUrl"], helpers["isChotSanXuatCrmTaskTitle"], helpers["isCrmCompanyAdminUser"], helpers["isCrmDealAssigneeLocked"], helpers["isCrmLeadTypeColorMissingError"], helpers["isCrmModuleAdmin"], helpers["isCrmPipelinesTableMissingError"], helpers["isCrmRegionAdminUser"], helpers["isCrmSystemAdminUser"], helpers["isDealStageHoanThanhForZalo"], helpers["isDefaultAssigneeIdsColumnError"], helpers["isExecutorColumnError"], helpers["isPlatformAdmin"], helpers["isPostgresUniqueViolation"], helpers["isQuotationsSourceExcelColumnMissingError"], helpers["isSxRelationshipError"], helpers["isSystemAdmin"], helpers["isUuidString"], helpers["isValidDealZaloTemplateStructure"], helpers["isVcRelationshipError"], helpers["isVptCompanyCommercialDocViewer"], helpers["lastNominatimGeocodeAt"], helpers["leadChatFilesMulter"], helpers["leadChatJsonOrFiles"], helpers["listQuotationExcelSheets"], helpers["loadCrmTaskAttachmentCountMap"], helpers["loadOrgReportStageMap"], helpers["loadZaloLinkedLeadIdSet"], helpers["logDealActivityComment"], helpers["logDealDeadlineChangeComment"], helpers["logDealStageChangeComment"], helpers["logKanbanDeadlineUnifiedHistory"], helpers["logLeadCommentMentionActivity"], helpers["logProjectFileActivity"], helpers["mapCustomerOverviewRow"], helpers["mapLeadDisplayPhone"], helpers["mapQuotationItemsToOrderRows"], helpers["maskCustomerPhoneDisplay"], helpers["maskZaloAccessTokenPreview"], helpers["maybeSendZaloOnDealStageEnter"], helpers["mergeCrmStageDefaultAssigneeIntoUpdates"], helpers["mergeCustomerIntoTarget"], helpers["misaService"], helpers["multer"], helpers["nextCode"], helpers["nextTbProjectCode"], helpers["normalizeCrmActivityAttachments"], helpers["normalizeCrmLeadCommentAttachments"], helpers["normalizeCrmStageDefaultAssigneeUserId"], helpers["normalizeCrmUserRole"], helpers["normalizeLeadSeenByKeys"], helpers["normalizeOrgReportSurveyVisitRow"], helpers["normalizePipelineStageSlaDaysForDb"], helpers["normalizePipelineStagesList"], helpers["normalizeRegionIdList"], helpers["normalizeTemplateChecklistForCrmTask"], helpers["normalizeTemplateItemAssigneeIds"], helpers["normalizeTimestamp"], helpers["normalizeTitleFold"], helpers["normalizeVnPhoneTo84"], helpers["notifyDealCommentMentions"], helpers["notifyDealCommentParticipants"], helpers["notifyMultiple"], helpers["notifyMultipleShared"], helpers["notifyNewCrmAssignmentAssignees"], helpers["notifyProductionDocumentUploaded"], helpers["onLeadWon"], helpers["onOrderConfirmed"], helpers["onProjectCompleted"], helpers["onQuotationAccepted"], helpers["orgReportAttachFirstStageRates"], helpers["orgReportBumpFirstStageMetrics"], helpers["orgReportBumpMetrics"], helpers["orgReportBumpOpenOverdue"], helpers["orgReportBumpReceptionMetrics"], helpers["orgReportCancelRatePct"], helpers["orgReportClosedWonDealCount"], helpers["orgReportClosedWonValue"], helpers["orgReportCompareSummary"], helpers["orgReportConversionRate"], helpers["orgReportDayKey"], helpers["orgReportDealCloseValueRatePct"], helpers["orgReportDealCountsExpected"], helpers["orgReportDealIsClosedWon"], helpers["orgReportDealIsCompleted"], helpers["orgReportDealIsQuotedOrAfter"], helpers["orgReportDealProbability"], helpers["orgReportDealSplitBuckets"], helpers["orgReportExtendedDealMetrics"], helpers["orgReportFirstStageOnTimeRatePct"], helpers["orgReportFirstStageOverdueRatePct"], helpers["orgReportIsReceptionOverdue"], helpers["orgReportIsSlaOverdue"], helpers["orgReportKpiPeriodStart"], helpers["orgReportNumEst"], helpers["orgReportOverdueRatePct"], helpers["orgReportOwnerId"], helpers["orgReportPctDelta"], helpers["orgReportPreviousPeriod"], helpers["orgReportQuoteValueCloseRatePct"], helpers["orgReportQuoteWinRatePct"], helpers["orgReportReceptionOverdueRatePct"], helpers["orgReportReceptionSlaMinutes"], helpers["orgReportStageIsClosed"], helpers["orgReportStageIsLostOrCancelled"], helpers["orgReportTotalDealCount"], helpers["parseChecklist"], helpers["parseCrmLeadsPageRpc"], helpers["parseCrmReportDateRange"], helpers["parseCrmStageCountsNumericMap"], helpers["parseCrmStageCountsRpc"], helpers["parseExcelMoneyFromMappedColumn"], helpers["parseLeadIdUuidList"], helpers["parseLeadIdsCsvQuery"], helpers["parseLeadIdsFromBody"], helpers["parseLeadSeenByRaw"], helpers["parseQuotationExcelBuffer"], helpers["parseStageIdsFromQuery"], helpers["parseUuidArrayJsonb"], helpers["parseVietnameseMeasure"], helpers["parseVietnameseMoney"], helpers["path"], helpers["persistAssignmentNotification"], helpers["pgCrmDuplicateLeadIds"], helpers["pickDealZaloTemplatePayload"], helpers["pipeOrgOverviewReportPdf"], helpers["pipeStaffLeadDealSummaryPdf"], helpers["pipeStaffPipelineDetailPdf"], helpers["pipelineHasExplicitCompleted"], helpers["pipelineHasExplicitExpected"], helpers["pipelineHasExplicitWon"], helpers["plannerTableMissing"], helpers["postCrmStageDefaultAssigneeComment"], helpers["primaryTemplateItemAssigneeId"], helpers["rcInvalidateTags"], helpers["reactionsTableMissing"], helpers["redactCrmTaskNotesForViewer"], helpers["regionGeocodeInflight"], helpers["repairCrmDealPipelineDisplay"], helpers["requireUserCompanyId"], helpers["requireUserCompanyIdResolved"], helpers["resolveAssignmentIdForTask"], helpers["resolveCanonicalCrmLeadId"], helpers["resolveCommercialDocListCompanyScope"], helpers["resolveCrmBundleTemplateScope"], helpers["resolveCrmLeadsDeadlinesMap"], helpers["resolveCrmLeadsKanbanLite"], helpers["resolveCrmLeadsMergedQuery"], helpers["resolveCrmLeadsSkipDeadline"], helpers["resolveCrmLedgerNetByLeadIdsPayload"], helpers["resolveCrmReportScope"], helpers["resolveCrmTaskWriteLeadId"], helpers["resolveExecutorCompanyId"], helpers["resolveKanbanStagesForCompany"], helpers["resolveLeadCommentMentionIds"], helpers["resolveProductionCompanyForDealStage"], helpers["resolveProductionHandoverResponsibleUserId"], helpers["resolveReopenTargetStageId"], helpers["resolveRpcRegionIdsForCrmList"], helpers["resolveTenantIdForQuota"], helpers["resolveZaloDealTemplateId"], helpers["respondIfCrmPipelinesTableMissing"], helpers["responseCache"], helpers["restoreCrmTaskChecklistFromWorkshopTemplate"], helpers["resyncCrmPipelineTasksForLead"], helpers["sanitizeIsoDateQueryParam"], helpers["scheduleRegionGeocoding"], helpers["scopedAdminCompanyId"], helpers["scopedCrmCompanyIdForWrite"], helpers["sendZaloTemplateMessage"], helpers["setLeadFlag"], helpers["shallowMergeTemplateData"], helpers["skipSxWorkQuickComplete"], helpers["snapshotOrderRowFromQuotation"], helpers["stripCrmAssigneeFromWonStageUpdates"], helpers["stripCrmLeadTypeColorFromSelect"], helpers["stripQuotationsSourceExcelFields"], helpers["sumCrmKpiLedgerNetByLeadIds"], helpers["sumCrmKpiLedgerNetByUserForOrgReport"], helpers["sumCrmKpiLedgerNetByUserIds"], helpers["sumCrmKpiLedgerNetByUserIdsInDateRange"], helpers["supabase"], helpers["syncAllTaskArtifactsToAssignment"], helpers["syncChecklistItemNotes"], helpers["syncCrmLeadSxPipelineFromProject"], helpers["syncQuotationDepositToDealAndProject"], helpers["syncSxKanbanFromCrmProductionStage"], helpers["syncTaskAttachmentToAssignment"], helpers["templateItemAssigneePatch"], helpers["toCrmTaskChecklist"], helpers["unifyCrmLeadResponsibleFields"], helpers["updateCrmLeadTask"], helpers["updateQuotationRow"], helpers["upsertZaloNotifySettings"], helpers["userCanAccessCrmLeadAsParticipant"], helpers["userCanAccessCrmLeadViaVisibility"], helpers["userCanAssignAnyCrmRegion"], helpers["userCanBypassCrmDeleteRestriction"], helpers["userHasSeenLeadInSeenBy"], helpers["userIsAdmin"], helpers["userIsCrmCompanyOrRegionAdmin"], helpers["userMayAccessQuotationRow"], helpers["userSeesAllCrmDeals"], helpers["userSeesAllCrmDealsForScope"], helpers["userSeesAllCrmLeads"], helpers["userSeesAllCrmLeadsForScope"], helpers["uuidQueryOrNull"], helpers["validateProductionCompanyId"]);

module.exports = r;
