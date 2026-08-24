/**
 * CRM routes: leadsList
 * Auto-extracted — handlers close over shared helpers via IIFE.
 */
const { Router } = require('express');
const helpers = require('../shared/helpersBundle');
const {
  sumCrmDealTabCountsFromStageCounts,
  preWonStagesForDealStats,
  postWonStagesForCustomerStats,
} = require('../../../helpers/crmDealTabTotals');
const { isLostOrCancelledPipelineStage } = require('../../../helpers/crmLostPipelineStage');
const { computeDashboardDealKpisFromStageAggregates } = require('../../../helpers/crmDealDashboardKpis');

const r = Router();

(function (ALLOWED_DEADLINE_FIELDS, CRM_COMMENT_ALLOWED_REACTION_EMOJI, CRM_LEAD_KANBAN_LITE_SELECT, CRM_LEAD_LIST_SELECT, CRM_LEAD_LIST_SELECT_BASE, CRM_LEAD_LIST_SELECT_EXTRA, CRM_LEAD_REGION_EMBED, CRM_NEW_LEAD_MAX_AGE_MS, CRM_TASK_SELECT, CRM_UUID_RE, CUSTOMERS_IN_CHUNK, CUSTOMERS_OVERVIEW_NO_MATCH_ID, DEAL_PRE_CONTRACT_SLUGS_STAFF, DEAL_REPORT_BUCKET_VALUES, DEFAULT_CHECKLISTS, DEFAULT_DEADLINE_BUCKETS, DEFAULT_PIPELINE_STAGE_SLA_DAYS, FOLLOWUP_TIME_BUCKETS, PDFDocument, QUOTATIONS_SOURCE_EXCEL_COLS, Router, SCAN_DUP_LITE_SELECT, STAFF_LEAD_DEAL_REPORT_ROLES, SURVEY_EVENT_SELECT, SURVEY_EVENT_TYPES, XLSX, ZALO_APP_SETTING_KEY, crmSchemaCompat, addPhoneToAutoLeadBlocklist, aggregateCrmCommentReactions, aggregateOrgReportRows, appendFulfillmentChildTasksForMasterDeal, applyAllActiveWorkshopTemplatesForArea, applyAssigneesToInsertedCrmTasks, applyCrmLeadRegionFilterToQuery, applyCrmTaskTemplatesToCompanyRegions, applyCustomerIdInFilter, applyCustomersOverviewSearch, applyDefaultWorkshopTemplatesForNewProject, applyLeadOrCustomerSalesFilter, applyProductionTemplateToFulfillmentLead, applyProductionTemplatesOnPipelineEnter, applyStageIdFilterToQuery, applyWorkshopTemplateToProject, artifactNamePrefix, assertCanFlagLead, assertCategoryFitsSource, assertCrmAssigneeUserMatchesLeadCompany, assertCrmEmployeeDeleteAllowed, assertCrmStageAdvanceAllowed, assertDealCrmManualStageChange, assertDealResponsible, assertDivisionAllowedForCompany, assertLeadDocumentOwner, assertLeadReadableByRegionScope, assertRegionBelongsToCompany, assertUserCanAssignCrmRegion, assignProductionCompanyDealResponsibility, attachAssigneesToCrmTasks, attachAssignmentIdsToCrmTasks, attachCrmNextOpenTaskDeadline, attachLeadNewFlagForList, attachLeadReplyParents, attachLeadUserFlagsForList, auth, autoCreateProjectFromWonDeal, autoFlowFns, autoGenCrmTasksForNewLead, buildAssignmentNotificationInsert, buildChecklistLeadDocumentRow, buildCrmDashboardMinimalKpis, buildCrmLeadsRpcFilterParams, buildCustomersOverviewSummary, buildDealTemplateData, buildDefaultDeadlineConfig, buildFirstStageIdByPipeline, buildPipelineStagesMap, buildProcessedCommercialItems, buildQuotedStageOrderByPipeline, buildScanDuplicateGroups, buildWonStageOrderByPipeline, canUserViewDocByAllowlist, chatUpload, chunkArray, classifyDealStageForStaffReport, commentsTableMissing, companyRegionExtraColumnsMissing, companyRegionGeoColumnsMissing, computeCrmDashboardLightStats, computeCrmLiveVersionMs, computeCustomersOverviewSummary, computeIsNewLeadForUser, computeOrgOverviewReportData, computeStaffLeadDealReportData, computeStaffPipelineDetailPayload, countOpenOverdueCrmTasksForLeadIds, createCrmAssignment, createCrmLeadTask, createFulfillmentChildDeal, createNotif, createNotification, createProjectFromLead, crmExecutorFieldsFromTemplateItem, crmLeadCommentAttachmentsColumnMissing, crmLeadCommentReadReceiptsTableMissing, crmLeadRowVisibleToRequestUser, crmListUsesLegacyFilters, crmNoteActivityUpload, crmReportAsOfMs, crmReportCreatedAtFromIso, crmReportCreatedAtToIso, crmReportDayKeyVn, crmRouteErrorText, crmTaskDeadlineModuleKey, crmTaskMeetsCompletionRequirements, crmTaskMeetsRequiredFileTypes, crmTaskRequiresCompletionEvidence, crmTemplateMatchesLeadType, deadlineToDateOnlyIso, defaultCompanyInfo, defaultKpiLedgerMonthStartYmd, deleteCrmLeadTask, deleteMirroredAssignmentFileForTaskAttachment, duplicateLeadIdsFromLiteRows, ecosystemModuleKeyForCrmDeadline, effectivePipelineStageSlaDays, emitCrmBadgeUpdateForProject, emitCrmDashboardChanged, emitCrmTaskChanged, emptyStaffLeadDealAgg, endOfCalendarDayAfterEntered, enforceCommercialDocCompanyOnWrite, enforceQuotaForRequest, ensureDealLeadDocumentsForModuleTransition, ensureDefaultCrmPipelineForCompany, ensureMissingCrmTasksForLead, ensureMissingCrmTasksForPipelineStage, ensureMissingSxTasksForLead, excelUpload, executeLeadMerge, executeZaloDealStageNotify, fetchActivityCustomerIds, fetchAllLeadsForSlaWatchlist, fetchAssignmentForTask, fetchCrmCommentReactionsAggregate, fetchCrmDeadlineCountRowsViaRpc, fetchCrmLeadCommentNotifyUserIds, fetchCrmLeadDetailRow, fetchCrmLeadWithPipelineBadges, fetchCrmLeadsByIdsOrdered, fetchCrmLeadsForDashboardBatched, fetchCrmLeadsForOrgReportBatched, fetchCrmLeadsForUserDetailBatched, fetchCrmLeadsLiteForDuplicateScan, fetchCrmLeadsPageViaRpc, fetchCrmPipelineZaloSlice, fetchCrmSurveyEventsChunk, fetchCrmSurveyVisitsForOrgReport, fetchLeadCommentAudienceMembers, fetchLeadCommentAudienceMembersForRead, fetchLeadIdsForCrmRegion, fetchLeadMentionMembers, fetchOrgActivityFeed, fetchPipelineWithStagesById, fetchScopedCrmBundles, fillTemplateDataFromStructure, filterCrmTasksForLeadType, filterUserIdsForCrmLeadScopedNotification, findChecklistItem, followupDismissExpiresAt, fontBold, fontRegular, formatMoney, formatVNDPdf, formatVnPhoneLocal0From84, fs, generateDocPdf, generateFlowTasks, generateStepTasks, getAppSettingValue, getCompanyInfo, getCompanyRegionsList, getCrmLeadListSelect, getCrmLeadRegionConstraint, getCrmLeadTypesList, getCrmLeadsListLegacy, getCrmSourceCategoriesList, getCrmSourcesList, getDefaultCrmAttachmentShare, getDefaultDealZaloTemplateStructure, getDefaultLeadDocumentShareForDeal, getDefaultPipelineIdForCompany, getLeadDocumentFieldsFromCrmTask, getNotifyTargets, getOverdueFollowUps, getPipelineIdForCompanyRegion, getPipelineZaloSlice, getPipelinesList, getProjectCRMSummary, getStagesByPipelineId, getStaleLeads, getZaloNotifySettings, hydrateCrmLeadsByIdsWithStaff, hydrateCrmLeadsRpcPage, hydrateScanDuplicateLeads, insertQuotationRow, invalidateAppSettingKey, invalidatePipelinesAndStages, invalidateRegions, invalidateSources, invalidateTenantUsageCache, invokeCrmLeadsStageCountsRpc, isAdminLike, isAllowedLeadCommentAttachmentUrl, isChotSanXuatCrmTaskTitle, isCrmCompanyAdminUser, isCrmDealAssigneeLocked, isCrmLeadTypeColorMissingError, isCrmModuleAdmin, isCrmPipelinesTableMissingError, isCrmRegionAdminUser, isCrmSystemAdminUser, isDealStageHoanThanhForZalo, isDefaultAssigneeIdsColumnError, isExecutorColumnError, isPlatformAdmin, isPostgresUniqueViolation, isQuotationsSourceExcelColumnMissingError, isSxRelationshipError, isSystemAdmin, isUuidString, isValidDealZaloTemplateStructure, isVcRelationshipError, isVptCompanyCommercialDocViewer, lastNominatimGeocodeAt, leadChatFilesMulter, leadChatJsonOrFiles, listQuotationExcelSheets, loadCrmTaskAttachmentCountMap, loadOrgReportStageMap, loadZaloLinkedLeadIdSet, logDealActivityComment, logDealDeadlineChangeComment, logDealStageChangeComment, logKanbanDeadlineUnifiedHistory, logLeadCommentMentionActivity, logProjectFileActivity, mapCustomerOverviewRow, mapLeadDisplayPhone, mapQuotationItemsToOrderRows, maskCustomerPhoneDisplay, maskZaloAccessTokenPreview, maybeSendZaloOnDealStageEnter, mergeCrmStageDefaultAssigneeIntoUpdates, mergeCustomerIntoTarget, misaService, multer, nextCode, nextTbProjectCode, normalizeCrmActivityAttachments, normalizeCrmLeadCommentAttachments, normalizeCrmStageDefaultAssigneeUserId, normalizeCrmUserRole, normalizeLeadSeenByKeys, normalizeOrgReportSurveyVisitRow, normalizePipelineStageSlaDaysForDb, normalizePipelineStagesList, normalizeRegionIdList, normalizeTemplateChecklistForCrmTask, normalizeTemplateItemAssigneeIds, normalizeTimestamp, normalizeTitleFold, normalizeVnPhoneTo84, notifyDealCommentMentions, notifyDealCommentParticipants, notifyMultiple, notifyMultipleShared, notifyNewCrmAssignmentAssignees, notifyProductionDocumentUploaded, onLeadWon, onOrderConfirmed, onProjectCompleted, onQuotationAccepted, orgReportAttachFirstStageRates, orgReportBumpFirstStageMetrics, orgReportBumpMetrics, orgReportBumpOpenOverdue, orgReportBumpReceptionMetrics, orgReportCancelRatePct, orgReportClosedWonDealCount, orgReportClosedWonValue, orgReportCompareSummary, orgReportConversionRate, orgReportDayKey, orgReportDealCloseValueRatePct, orgReportDealCountsExpected, orgReportDealIsClosedWon, orgReportDealIsCompleted, orgReportDealIsQuotedOrAfter, orgReportDealProbability, orgReportDealSplitBuckets, orgReportExtendedDealMetrics, orgReportFirstStageOnTimeRatePct, orgReportFirstStageOverdueRatePct, orgReportIsReceptionOverdue, orgReportIsSlaOverdue, orgReportKpiPeriodStart, orgReportNumEst, orgReportOverdueRatePct, orgReportOwnerId, orgReportPctDelta, orgReportPreviousPeriod, orgReportQuoteValueCloseRatePct, orgReportQuoteWinRatePct, orgReportReceptionOverdueRatePct, orgReportReceptionSlaMinutes, orgReportStageIsClosed, orgReportStageIsLostOrCancelled, orgReportTotalDealCount, parseChecklist, parseCrmLeadsPageRpc, parseCrmReportDateRange, parseCrmStageCountsNumericMap, parseCrmStageCountsRpc, parseExcelMoneyFromMappedColumn, parseLeadIdUuidList, parseLeadIdsCsvQuery, parseLeadIdsFromBody, parseLeadSeenByRaw, parseQuotationExcelBuffer, parseStageIdsFromQuery, parseUuidArrayJsonb, parseVietnameseMeasure, parseVietnameseMoney, path, persistAssignmentNotification, pgCrmDuplicateLeadIds, pickDealZaloTemplatePayload, pipeOrgOverviewReportPdf, pipeStaffLeadDealSummaryPdf, pipeStaffPipelineDetailPdf, pipelineHasExplicitCompleted, pipelineHasExplicitExpected, pipelineHasExplicitWon, plannerTableMissing, postCrmStageDefaultAssigneeComment, primaryTemplateItemAssigneeId, rcInvalidateTags, reactionsTableMissing, redactCrmTaskNotesForViewer, regionGeocodeInflight, repairCrmDealPipelineDisplay, requireUserCompanyId, requireUserCompanyIdResolved, resolveAssignmentIdForTask, resolveCanonicalCrmLeadId, resolveCommercialDocListCompanyScope, resolveCrmBundleTemplateScope, resolveCrmLeadsDeadlinesMap, resolveCrmLeadsKanbanLite, resolveCrmLeadsMergedQuery, resolveCrmLeadsSkipDeadline, resolveCrmLedgerNetByLeadIdsPayload, resolveCrmReportScope, resolveCrmTaskWriteLeadId, resolveExecutorCompanyId, resolveKanbanStagesForCompany, resolveLeadCommentMentionIds, resolveProductionCompanyForDealStage, resolveProductionHandoverResponsibleUserId, resolveReopenTargetStageId, resolveRpcRegionIdsForCrmList, resolveTenantIdForQuota, resolveZaloDealTemplateId, respondIfCrmPipelinesTableMissing, responseCache, restoreCrmTaskChecklistFromWorkshopTemplate, resyncCrmPipelineTasksForLead, sanitizeIsoDateQueryParam, scheduleRegionGeocoding, scopedAdminCompanyId, scopedCrmCompanyIdForWrite, sendZaloTemplateMessage, setLeadFlag, shallowMergeTemplateData, skipSxWorkQuickComplete, snapshotOrderRowFromQuotation, stripCrmAssigneeFromWonStageUpdates, stripCrmLeadTypeColorFromSelect, stripQuotationsSourceExcelFields, sumCrmKpiLedgerNetByLeadIds, sumCrmKpiLedgerNetByUserForOrgReport, sumCrmKpiLedgerNetByUserIds, sumCrmKpiLedgerNetByUserIdsInDateRange, supabase, syncAllTaskArtifactsToAssignment, syncChecklistItemNotes, syncCrmLeadSxPipelineFromProject, syncQuotationDepositToDealAndProject, syncSxKanbanFromCrmProductionStage, syncTaskAttachmentToAssignment, templateItemAssigneePatch, toCrmTaskChecklist, unifyCrmLeadResponsibleFields, updateCrmLeadTask, updateQuotationRow, upsertZaloNotifySettings, userCanAccessCrmLeadAsParticipant, userCanAccessCrmLeadViaVisibility, userCanAssignAnyCrmRegion, userCanBypassCrmDeleteRestriction, userHasSeenLeadInSeenBy, userIsAdmin, userIsCrmCompanyOrRegionAdmin, userMayAccessQuotationRow, userSeesAllCrmDeals, userSeesAllCrmDealsForScope, userSeesAllCrmLeads, userSeesAllCrmLeadsForScope, uuidQueryOrNull, validateProductionCompanyId) {
r.get('/leads-by-fb-page', async (req, res) => {
  try {
    const { page_id, source_key, type = 'lead', company_id: companyIdQ } = req.query;
    let filterCompanyId = companyIdQ && String(companyIdQ).trim() ? String(companyIdQ).trim() : null;
    const sacFb = scopedAdminCompanyId(req);
    if (sacFb) {
      filterCompanyId = sacFb;
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      filterCompanyId = cid;
    }
    let pageIds = [];

    if (source_key) {
      pageIds = [source_key];
    } else if (page_id) {
      pageIds = [page_id];
    } else {
      return res.status(400).json({ error: 'page_id or source_key required' });
    }

    pageIds = [...new Set(pageIds.filter(Boolean))];
    if (!pageIds.length) return res.json([]);

    const { data: contacts } = await supabase.from('facebook_contacts')
      .select('lead_id, page_id').in('page_id', pageIds).not('lead_id', 'is', null);
    const leadIds = [...new Set((contacts || []).map(c => c.lead_id))];
    if (!leadIds.length) return res.json([]);
    let q = supabase.from('crm_leads')
      .select('*, customer:customers(id, full_name, phone, email), stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, color, icon, is_won, is_lost, pipeline_type), source:crm_sources(id, name, icon), assignee:users!crm_leads_assigned_to_fkey(id, full_name), company:companies!crm_leads_company_id_fkey(id, name, short_name)')
      .in('id', leadIds).eq('type', type);
    if (filterCompanyId) q = q.eq('company_id', filterCompanyId);
    q = applyCrmLeadRegionFilterToQuery(q, req);
    if (type === 'deal' && req.user?.userId && !userSeesAllCrmDealsForScope(req.user)) {
      q = q.eq('assigned_to', req.user.userId);
    }
    if (type === 'lead' && req.user?.userId && !userSeesAllCrmLeadsForScope(req.user)) {
      q = q.or(`assigned_to.eq.${req.user.userId},lead_owner_id.eq.${req.user.userId}`);
    }
    const { data } = await q.order('created_at', { ascending: false });
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/leads/picker', async (req, res) => {
  try {
    const type = req.query.type === 'lead' ? 'lead' : 'deal';
    const q = String(req.query.q || '').trim();
    const customerId = uuidQueryOrNull(req.query.customer_id);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 50);
    const forModule = String(req.query.for_module || '').trim().toLowerCase();
    const { KNOWN_MODULE_KEYS } = require('../../../helpers/ecosystemModuleScope');
    const useModuleFilter = forModule && KNOWN_MODULE_KEYS.includes(forModule);
    const workshopModule = forModule === 'logistics' || forModule === 'production' ? forModule : null;

    const pickerSelect = workshopModule === 'logistics'
      ? ('id, code, title, type, stage_id, company_id, region_id, customer_id, project_id, ' +
          'assigned_to, lead_owner_id, estimated_value, created_at, actual_close_date, ' +
          'customer:customers(id, full_name, phone), ' +
          'company:companies!crm_leads_company_id_fkey(id, name, short_name), ' +
          'region:company_regions!crm_leads_region_id_fkey(id, name, code), ' +
          'assignee:users!crm_leads_assigned_to_fkey(id, full_name, email), ' +
          'project:projects!crm_leads_project_id_fkey(id, code, name, logistics_company_id, vc_kanban_column_id)')
      : ('id, code, title, type, stage_id, company_id, region_id, customer_id, project_id, ' +
          'assigned_to, lead_owner_id, estimated_value, created_at, actual_close_date, ' +
          'customer:customers(id, full_name, phone), ' +
          'company:companies!crm_leads_company_id_fkey(id, name, short_name), ' +
          'region:company_regions!crm_leads_region_id_fkey(id, name, code), ' +
          'assignee:users!crm_leads_assigned_to_fkey(id, full_name, email), ' +
          'project:projects!crm_leads_project_id_fkey(id, code, name)');

    // crm_leads không có cột `status` — trạng thái suy ra từ stage / actual_close_date.
    let query = supabase
      .from('crm_leads')
      .select(pickerSelect)
      .eq('type', type)
      .order('updated_at', { ascending: false })
      .limit(workshopModule ? Math.min(limit * 4, 80) : limit);

    const sac = scopedAdminCompanyId(req);
    const requestedCompanyId = uuidQueryOrNull(req.query.company_id);
    const userCompanyId = !userIsAdmin(req.user?.role) ? (req.user?.company_id || null) : null;
    if (!userIsAdmin(req.user?.role) && !userCompanyId && !sac) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
    }

    // SX / Lắp đặt: chỉ deal gắn dự án đã vào Kanban xưởng — không lấy lead CRM thuần
    // dù công ty CRM cũng nằm trong khối logistics.
    let workshopProjectIds = null;
    if (workshopModule) {
      const { listWorkshopPickerProjectIds } = require('../../../helpers/crmModuleCompanies');
      const scopeCompany = requestedCompanyId || sac || userCompanyId || null;
      workshopProjectIds = await listWorkshopPickerProjectIds(workshopModule, { companyId: scopeCompany });
      if (!workshopProjectIds.length) {
        return res.json({ type, total: 0, results: [], scope: workshopModule });
      }
      if (!q) {
        query = query.in('project_id', workshopProjectIds.slice(0, 120));
      }
    } else {
      let moduleCompanyIds = null;
      if (useModuleFilter) {
        const { listModuleCompanyIds } = require('../../../helpers/crmModuleCompanies');
        moduleCompanyIds = await listModuleCompanyIds(forModule);
      }

      if (sac) {
        if (moduleCompanyIds && moduleCompanyIds.length && !moduleCompanyIds.includes(String(sac))) {
          return res.json({ type, total: 0, results: [] });
        }
        query = query.eq('company_id', sac);
      } else if (!userIsAdmin(req.user?.role)) {
        const cid = userCompanyId || requireUserCompanyId(req, res);
        if (!cid) return;
        if (moduleCompanyIds && moduleCompanyIds.length && !moduleCompanyIds.includes(String(cid))) {
          return res.json({ type, total: 0, results: [] });
        }
        const { isAccountingUser, applyAccountingCrmCompanyFilter } = require('../../../helpers/accountingScope');
        if (isAccountingUser(req.user)) {
          query = applyAccountingCrmCompanyFilter(query, cid);
        } else {
          query = query.eq('company_id', cid);
        }
      } else if (requestedCompanyId) {
        if (moduleCompanyIds && moduleCompanyIds.length && !moduleCompanyIds.includes(String(requestedCompanyId))) {
          return res.json({ type, total: 0, results: [] });
        }
        query = query.eq('company_id', requestedCompanyId);
      } else if (moduleCompanyIds) {
        if (!moduleCompanyIds.length) {
          return res.json({ type, total: 0, results: [] });
        }
        query = query.in('company_id', moduleCompanyIds);
      }
    }

    // Scope theo khu vực
    query = applyCrmLeadRegionFilterToQuery(query, req);
    if (uuidQueryOrNull(req.query.region_id)) {
      query = query.eq('region_id', uuidQueryOrNull(req.query.region_id));
    }

    if (customerId) query = query.eq('customer_id', customerId);

    // Lọc theo NV phụ trách deal (assigned_to) — dùng khi gắn deal trong Giao việc
    const assigneeId = uuidQueryOrNull(req.query.assignee_id)
      || uuidQueryOrNull(req.query.assigned_to);
    if (assigneeId) {
      if (type === 'lead') {
        query = query.or(`assigned_to.eq.${assigneeId},lead_owner_id.eq.${assigneeId}`);
      } else {
        query = query.eq('assigned_to', assigneeId);
      }
    }

    if (q) {
      // Search theo code / title / SĐT / tên KH / mã dự án (TB-…)
      const safe = q.replace(/[(),]/g, ' ').replace(/\s+/g, '%');
      const orParts = [`code.ilike.%${safe}%`, `title.ilike.%${safe}%`, `phone.ilike.%${safe}%`];

      // 1 ký tự → bỏ lookup KH (quá rộng, URL PostgREST dễ 400)
      if (q.length >= 2) {
        const { data: custMatchRows } = await supabase
          .from('customers')
          .select('id')
          .or(`phone.ilike.%${safe}%,full_name.ilike.%${safe}%`)
          .limit(40);
        const custMatchIds = (custMatchRows || []).map((r) => r.id).filter(Boolean);
        if (custMatchIds.length) orParts.push(`customer_id.in.(${custMatchIds.join(',')})`);
      }

      const { data: projectMatchRows } = await supabase
        .from('projects')
        .select('id')
        .or(`code.ilike.%${safe}%,name.ilike.%${safe}%`)
        .limit(40);
      let projectMatchIds = (projectMatchRows || []).map((r) => r.id).filter(Boolean);

      if (workshopProjectIds) {
        const allow = new Set(workshopProjectIds.map(String));
        projectMatchIds = projectMatchIds.filter((id) => allow.has(String(id)));
        const scopedPids = [...new Set([
          ...workshopProjectIds.slice(0, 80).map(String),
          ...projectMatchIds.map(String),
        ])].slice(0, 120);
        if (!scopedPids.length) {
          return res.json({ type, total: 0, results: [], scope: workshopModule });
        }
        query = query.in('project_id', scopedPids);
      } else if (projectMatchIds.length) {
        orParts.push(`project_id.in.(${projectMatchIds.join(',')})`);
      }
      query = query.or(orParts.join(','));
    }

    const { data, error } = await query;
    if (error) {
      console.error('[leads/picker]', error.message || error);
      throw error;
    }

    const workshopAllow = workshopProjectIds ? new Set(workshopProjectIds.map(String)) : null;
    const rows = (data || []).filter((l) => {
      if (!workshopAllow) return true;
      const pid = l.project_id || l.project?.id;
      return pid && workshopAllow.has(String(pid));
    }).slice(0, limit);

    res.json({
      type,
      total: rows.length,
      results: rows.map((l) => ({
        id: l.id,
        code: l.code,
        title: l.title,
        type: l.type,
        is_closed: !!l.actual_close_date,
        stage_id: l.stage_id,
        company_id: l.company_id,
        company_name: l.company?.short_name || l.company?.name || null,
        region_id: l.region_id,
        region_name: l.region?.name || null,
        customer_id: l.customer_id,
        customer_name: l.customer?.full_name || null,
        customer_phone: l.customer?.phone || null,
        assigned_to: l.assigned_to,
        assignee_name: l.assignee?.full_name || null,
        estimated_value: l.estimated_value || 0,
        created_at: l.created_at,
        project_id: l.project_id || l.project?.id || null,
        project_code: l.project?.code || null,
        project_name: l.project?.name || null,
      })),
    });
  } catch (e) {
    console.error('[leads/picker]', e);
    res.status(500).json({ error: e.message || 'Lỗi tìm deal' });
  }
});

/**
 * Gợi ý tìm nhanh cho CRM Dashboard — nhẹ hơn /leads (không hydrate Kanban).
 * Chỉ khớp mã / tiêu đề / SĐT / tên KH; tối đa ~15 dòng.
 */
r.get('/leads/search-suggest', async (req, res) => {
  try {
    const q = String(req.query.q || req.query.search || '').trim();
    if (q.length < 2) {
      return res.json({ items: [], total: 0, q: '' });
    }
    const type = req.query.type === 'lead' ? 'lead' : 'deal';
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 15, 1), 25);
    const safe = q.replace(/[(),]/g, ' ').replace(/\s+/g, '%');
    const phoneFilter = String(req.query.phone_filter || '').trim();
    const fetchCap = phoneFilter === 'has_phone' || phoneFilter === 'no_phone'
      ? Math.min(limit * 4, 60)
      : limit;

    const suggestSelect = [
      'id, code, title, type, stage_id, region_id, company_id, phone, customer_id, assigned_to, lead_owner_id, created_at, updated_at',
      'customer:customers(id, full_name, phone)',
      'assignee:users!crm_leads_assigned_to_fkey(id, full_name)',
      'stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, color, is_won, is_lost)',
    ].join(', ');

    let query = supabase
      .from('crm_leads')
      .select(suggestSelect)
      .eq('type', type)
      .is('parent_lead_id', null)
      .order('updated_at', { ascending: false })
      .limit(fetchCap);

    const sac = scopedAdminCompanyId(req);
    const requestedCompanyId = uuidQueryOrNull(req.query.company_id);
    if (sac) {
      query = query.eq('company_id', sac);
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = req.user?.company_id || requireUserCompanyId(req, res);
      if (!cid) return;
      query = query.eq('company_id', cid);
    } else if (requestedCompanyId) {
      query = query.eq('company_id', requestedCompanyId);
    }

    query = applyCrmLeadRegionFilterToQuery(query, req);
    const regionId = uuidQueryOrNull(req.query.region_id);
    if (regionId) query = query.eq('region_id', regionId);

    const assignedTo = uuidQueryOrNull(req.query.assigned_to);
    if (assignedTo) {
      if (type === 'lead') {
        query = query.or(`assigned_to.eq.${assignedTo},lead_owner_id.eq.${assignedTo}`);
      } else {
        query = query.eq('assigned_to', assignedTo);
      }
    } else if (type === 'deal' && req.user?.userId && !userSeesAllCrmDealsForScope(req.user)) {
      query = query.eq('assigned_to', req.user.userId);
    } else if (type === 'lead' && req.user?.userId && !userSeesAllCrmLeadsForScope(req.user)) {
      query = query.or(`assigned_to.eq.${req.user.userId},lead_owner_id.eq.${req.user.userId}`);
    }

    const dateFrom = sanitizeIsoDateQueryParam(req.query.date_from);
    const dateTo = sanitizeIsoDateQueryParam(req.query.date_to);
    if (dateFrom) query = query.gte('created_at', dateFrom);
    if (dateTo) query = query.lte('created_at', `${String(dateTo).slice(0, 10)}T23:59:59.999Z`);

    const sourceId = uuidQueryOrNull(req.query.source_id);
    if (sourceId) query = query.eq('source_id', sourceId);

    const stageId = uuidQueryOrNull(req.query.stage_id);
    if (stageId) query = query.eq('stage_id', stageId);

    const orParts = [`code.ilike.%${safe}%`, `title.ilike.%${safe}%`, `phone.ilike.%${safe}%`];
    const { data: custMatchRows } = await supabase
      .from('customers')
      .select('id')
      .or(`phone.ilike.%${safe}%,full_name.ilike.%${safe}%`)
      .limit(50);
    const custMatchIds = (custMatchRows || []).map((r) => r.id).filter(Boolean);
    if (custMatchIds.length) {
      orParts.push(`customer_id.in.(${custMatchIds.join(',')})`);
    }
    query = query.or(orParts.join(','));

    const { data, error } = await query;
    if (error) {
      console.error('[leads/search-suggest]', error.message || error);
      throw error;
    }

    const hasPhone = (row) => {
      const p = String(row?.customer?.phone || row?.phone || '').trim();
      return !!p;
    };
    let rows = data || [];
    if (phoneFilter === 'has_phone') rows = rows.filter(hasPhone);
    else if (phoneFilter === 'no_phone') rows = rows.filter((r) => !hasPhone(r));
    rows = rows.slice(0, limit);

    res.json({
      q,
      type,
      total: rows.length,
      items: rows.map((l) => ({
        id: l.id,
        code: l.code,
        title: l.title,
        type: l.type,
        stage_id: l.stage_id,
        region_id: l.region_id || null,
        company_id: l.company_id,
        phone: l.phone || l.customer?.phone || null,
        customer: l.customer || null,
        assignee: l.assignee || null,
        stage: l.stage || null,
        created_at: l.created_at,
        _fromSuggest: true,
      })),
    });
  } catch (e) {
    console.error('[leads/search-suggest]', e);
    res.status(500).json({ error: e.message || 'Lỗi gợi ý tìm kiếm' });
  }
});

async function handleCrmStageCounts(req, res) {
  try {
    const ctx = await resolveCrmLeadsMergedQuery(req, res);
    if (!ctx) return;
    const { type, mergedQuery, rpcAssigneeStrict, rpcRegionIds } = ctx;
    if (crmListUsesLegacyFilters(mergedQuery)) {
      return res.status(400).json({ error: 'Bộ lọc hiện tại chưa hỗ trợ stage-counts batch. Dùng GET /crm/leads từng cột.' });
    }

    const stages = await resolveKanbanStagesForCompany(
      type,
      uuidQueryOrNull(mergedQuery.company_id),
      mergedQuery.region_id,
      req,
    );
    const stageIds = stages.map((s) => s.id).filter(Boolean);
    const filterParams = buildCrmLeadsRpcFilterParams(mergedQuery, type, rpcAssigneeStrict, rpcRegionIds);
    const rpcParams = {
      ...filterParams,
      p_pipeline_stage_ids: stageIds.length ? stageIds : null,
    };

    const parsed = await invokeCrmLeadsStageCountsRpc(rpcParams);
    if (parsed) {
      return res.json({
        total: parsed.total,
        counts: parsed.counts,
        values: parsed.values,
        weighted_values: parsed.weightedValues,
      });
    }

    const counts = {};
    const STAGE_COUNT_FALLBACK_CONCURRENCY = 6;
    for (let i = 0; i < stageIds.length; i += STAGE_COUNT_FALLBACK_CONCURRENCY) {
      const chunk = stageIds.slice(i, i + STAGE_COUNT_FALLBACK_CONCURRENCY);
      const pairs = await Promise.all(
        chunk.map(async (sid) => {
          const pageRpc = {
            ...filterParams,
            p_stage_id: sid,
            p_limit: 1,
            p_offset: 0,
          };
          try {
            let { data: rpcData, error: rpcError } = await supabase.rpc('crm_leads_page_ids', pageRpc);
            if (rpcError) return [sid, 0];
            const p = parseCrmLeadsPageRpc(rpcData);
            return [sid, p ? p.total : 0];
          } catch {
            return [sid, 0];
          }
        }),
      );
      for (const [sid, total] of pairs) counts[sid] = total;
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    res.json({ total, counts, fallback: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

const stageCountsCache = responseCache({ ttl: 90, scope: 'user', tags: ['crm:list'] });
r.get('/stage-counts', stageCountsCache, handleCrmStageCounts);
/** Alias — client cũ / path nhầm gọi /crm/leads/stage-counts thay vì /crm/stage-counts. */
r.get('/leads/stage-counts', stageCountsCache, handleCrmStageCounts);

r.get('/filter-summary', responseCache({ ttl: 90, scope: 'user', tags: ['crm:list'] }), async (req, res) => {
  try {
    // Lead và Deal có thể khác scope assigned_to theo role, nên resolve độc lập.
    const leadReq = { query: { ...req.query, type: 'lead' }, user: req.user };
    const dealReq = { query: { ...req.query, type: 'deal' }, user: req.user };
    const leadCtx = await resolveCrmLeadsMergedQuery(leadReq, res);
    if (!leadCtx || res.headersSent) return;
    const dealCtx = await resolveCrmLeadsMergedQuery(dealReq, res);
    if (!dealCtx || res.headersSent) return;

    const companyId =
      uuidQueryOrNull(leadCtx.mergedQuery.company_id)
      || uuidQueryOrNull(dealCtx.mergedQuery.company_id);
    // Admin hệ thống xem "Tất cả công ty": giới hạn về đúng công ty của tenant mình
    // (xem resolveCrmLeadsMergedQuery). Lead/Deal scope giống nhau nên lấy cái nào có trước.
    const companyIdsScope = Array.isArray(leadCtx.mergedQuery.company_ids_scope)
      ? leadCtx.mergedQuery.company_ids_scope
      : (Array.isArray(dealCtx.mergedQuery.company_ids_scope) ? dealCtx.mergedQuery.company_ids_scope : null);
    const regionId =
      uuidQueryOrNull(leadCtx.mergedQuery.region_id)
      || uuidQueryOrNull(dealCtx.mergedQuery.region_id);
    const [leadStages, dealStages] = await Promise.all([
      resolveKanbanStagesForCompany('lead', companyId, regionId, leadReq),
      resolveKanbanStagesForCompany('deal', companyId, regionId, dealReq),
    ]);
    const leadFilters = buildCrmLeadsRpcFilterParams(
      leadCtx.mergedQuery,
      'lead',
      leadCtx.rpcAssigneeStrict,
      leadCtx.rpcRegionIds,
    );
    const dealFilters = buildCrmLeadsRpcFilterParams(
      dealCtx.mergedQuery,
      'deal',
      dealCtx.rpcAssigneeStrict,
      dealCtx.rpcRegionIds,
    );
    const regionIds = [
      ...(Array.isArray(leadFilters.p_region_ids) ? leadFilters.p_region_ids : []),
      ...(Array.isArray(dealFilters.p_region_ids) ? dealFilters.p_region_ids : []),
    ];
    const rpcParams = {
      p_company_id: companyId,
      p_lead_assigned_to: leadFilters.p_assigned_to,
      p_deal_assigned_to: dealFilters.p_assigned_to,
      p_lead_assigned_strict: leadFilters.p_assigned_strict,
      p_deal_assigned_strict: dealFilters.p_assigned_strict,
      p_source_id: leadFilters.p_source_id || dealFilters.p_source_id,
      p_date_from: leadFilters.p_date_from || dealFilters.p_date_from,
      p_date_to: leadFilters.p_date_to || dealFilters.p_date_to,
      p_search: leadFilters.p_search || dealFilters.p_search,
      p_assignee_name: leadFilters.p_assignee_name || dealFilters.p_assignee_name,
      p_region_ids: regionIds.length ? [...new Set(regionIds)] : null,
      p_region_unassigned:
        !!leadFilters.p_region_unassigned || !!dealFilters.p_region_unassigned,
      p_lead_stage_ids: (leadStages || []).map((s) => s.id).filter(Boolean),
      p_deal_stage_ids: (dealStages || []).map((s) => s.id).filter(Boolean),
      p_phone_filter: req.query.phone_filter || null,
      p_lead_type_id: uuidQueryOrNull(req.query.lead_type_id),
      p_referrer_name: String(req.query.referrer_name || '').trim() || null,
      p_customer_company: String(req.query.customer_company || '').trim() || null,
      p_company_ids: companyIdsScope,
    };
    let { data, error } = await supabase.rpc('crm_filter_summary', rpcParams);
    if (error && companyIdsScope != null
      && /crm_filter_summary|does not exist|Could not find|argument/i.test(String(error.message || ''))) {
      // DB chưa chạy 559 — bỏ p_company_ids, thử lại chữ ký cũ (giữ hành vi trước khi có
      // giới hạn tenant thay vì hiện fallbackRequired ngay).
      const { p_company_ids: _ci, ...noTenantScope } = rpcParams;
      const r2 = await supabase.rpc('crm_filter_summary', noTenantScope);
      data = r2.data;
      error = r2.error;
    }
    if (error) {
      const unavailable = /crm_filter_summary|does not exist|Could not find|argument/i.test(
        String(error.message || ''),
      );
      if (unavailable) {
        // Giữ HTTP 200 để client chuyển sang các endpoint count cũ mà không tạo
        // request đỏ/retry liên tục trong DevTools trước khi migration 471 được chạy.
        return res.json({
          fallbackRequired: true,
          code: 'CRM_FILTER_SUMMARY_RPC_UNAVAILABLE',
        });
      }
      throw error;
    }
    const normalize = (value) => {
      const src = value && typeof value === 'object' ? value : {};
      const num = (v) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      };
      const numMap = (v) => {
        if (!v || typeof v !== 'object') return null;
        const out = {};
        Object.entries(v).forEach(([k, val]) => { out[k] = num(val); });
        return out;
      };
      return {
        all: num(src.all),
        hasPhone: num(src.has_phone),
        noPhone: num(src.no_phone),
        selectedTotal: num(src.selected_total),
        counts: src.counts && typeof src.counts === 'object' ? src.counts : {},
        // Chỉ có ở deal, và chỉ sau khi migration 557 (crm_filter_summary) được chạy —
        // null nếu RPC cũ chưa có 2 field này (chưa chạy migration).
        valueSums: numMap(src.value_sums),
        weightedValueSums: numMap(src.weighted_value_sums),
      };
    };
    const dealNorm = normalize(data?.deal);
    // Tính tổng tab Deal trên server (cùng dealStages dùng cho RPC) để FE hiện badge
    // cùng lượt với Lead — không phụ thuộc stagesDeal client đã tải đủ.
    const tabTotals = sumCrmDealTabCountsFromStageCounts(dealStages, dealNorm.counts);
    // Toàn bộ ô KPI bảng Deal (Tổng Deal, Đang xử lý, Hủy/Thua, Giá trị dự kiến, Giá trị kỳ
    // vọng...) tính trên TOÀN BỘ deal khớp bộ lọc — dùng counts/value_sums theo stage từ RPC,
    // không phụ thuộc số thẻ Kanban client đã tải (lazy-load 40 thẻ/lượt nên luôn thiếu nếu
    // tính ở FE). Chỉ tính được khi RPC đã có value_sums (migration 557 đã chạy).
    const dashboardKpis = dealNorm.valueSums && dealNorm.weightedValueSums
      ? computeDashboardDealKpisFromStageAggregates(
        dealStages,
        dealNorm.counts,
        dealNorm.valueSums,
        dealNorm.weightedValueSums,
      )
      : null;
    // Bản "tách tab KH" (mặc định bật cho admin) — Tổng Deal/Đang xử lý/Hủy/Giá trị chỉ tính
    // trên các cột TRƯỚC Thắng (không gồm cột Thắng), khớp `dealSalesKpisForDisplay` ở FE.
    const dashboardKpisPreWon = dashboardKpis
      ? computeDashboardDealKpisFromStageAggregates(
        preWonStagesForDealStats(dealStages),
        dealNorm.counts,
        dealNorm.valueSums,
        dealNorm.weightedValueSums,
      )
      : null;
    // Bản tab "Khách hàng" (cột Thắng + sau Thắng) — khớp `customerKpisFromFilters` ở FE.
    const dashboardKpisPostWon = dashboardKpis
      ? computeDashboardDealKpisFromStageAggregates(
        postWonStagesForCustomerStats(dealStages),
        dealNorm.counts,
        dealNorm.valueSums,
        dealNorm.weightedValueSums,
      )
      : null;
    const leadNorm = normalize(data?.lead);
    // Đếm lead "đang xử lý" (chưa Thắng/Thua) trên TOÀN BỘ tập khớp bộ lọc — dùng cùng
    // leadStages đã resolve cho RPC (đảm bảo khớp id với `counts`), không phụ thuộc số
    // thẻ Kanban client đã tải (lazy-load 40 thẻ/lượt nên luôn thiếu nếu đếm ở FE).
    const leadActive = (leadStages || []).reduce((sum, s) => {
      if (!s?.id || s.is_won || isLostOrCancelledPipelineStage(s)) return sum;
      const n = Number(leadNorm.counts[s.id] ?? leadNorm.counts[String(s.id)] ?? 0) || 0;
      return sum + n;
    }, 0);
    return res.json({
      lead: {
        ...leadNorm,
        active: leadActive,
      },
      deal: {
        ...dealNorm,
        tabTotals,
        dashboardKpis,
        dashboardKpisPreWon,
        dashboardKpisPostWon,
      },
    });
  } catch (e) {
    console.error('[crm/filter-summary]', e);
    return res.status(500).json({ error: e.message || 'Không tải được tổng bộ lọc CRM' });
  }
});

r.get('/leads-deadlines', responseCache({ ttl: 30, scope: 'user', tags: ['crm:list'] }), async (req, res) => {
  try {
    // Giới hạn thấp — URL dài dễ vượt proxy (~2–8KB); client nên dùng POST.
    const leadIds = parseLeadIdsCsvQuery(req.query.lead_ids, 80);
    const allowedIds = await filterAccessibleCrmLeadIds(req, res, leadIds);
    if (allowedIds == null) return;
    const deadlines = await resolveCrmLeadsDeadlinesMap(allowedIds);
    res.json({ deadlines });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/leads-deadlines', async (req, res) => {
  try {
    const leadIds = parseLeadIdsFromBody(req.body, 200);
    const allowedIds = await filterAccessibleCrmLeadIds(req, res, leadIds);
    if (allowedIds == null) return;
    const deadlines = await resolveCrmLeadsDeadlinesMap(allowedIds);
    res.json({ deadlines });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Chỉ trả hạn cho lead/deal trong phạm vi company + assignee của user. */
async function filterAccessibleCrmLeadIds(req, res, leadIds) {
  const ids = [...new Set((leadIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) return [];

  let q = supabase
    .from('crm_leads')
    .select('id, type, assigned_to, lead_owner_id')
    .in('id', ids);
  const sac = scopedAdminCompanyId(req);
  if (sac) {
    q = q.eq('company_id', sac);
  } else if (!userIsAdmin(req.user?.role)) {
    const cid = await requireUserCompanyIdResolved(req, res);
    if (!cid) return null;
    q = q.eq('company_id', cid);
  }

  const { data, error } = await q;
  if (error) throw error;

  const uid = req.user?.userId ? String(req.user.userId) : '';
  const seesLead = !uid || userSeesAllCrmLeadsForScope(req.user);
  const seesDeal = !uid || userSeesAllCrmDealsForScope(req.user);
  if (seesLead && seesDeal) {
    return (data || []).map((r) => String(r.id));
  }

  return (data || [])
    .filter((row) => {
      const mine = String(row.assigned_to || '') === uid || String(row.lead_owner_id || '') === uid;
      if (row.type === 'deal') return seesDeal || mine;
      return seesLead || mine;
    })
    .map((r) => String(r.id));
}

r.get('/web-dashboard-bootstrap', responseCache({ ttl: 15, scope: 'user', tags: ['crm:list'] }), async (req, res) => {
  try {
    const ctx = await resolveCrmLeadsMergedQuery(req, res);
    if (!ctx) return;
    const { type, mergedQuery, rpcAssigneeStrict, rpcRegionIds } = ctx;
    if (crmListUsesLegacyFilters(mergedQuery)) {
      return res.status(400).json({ error: 'Bộ lọc hiện tại chưa hỗ trợ web-dashboard-bootstrap. Dùng GET /crm/leads.' });
    }

    const companyId = uuidQueryOrNull(mergedQuery.company_id);
    const parsedLimit = Math.min(Math.max(parseInt(req.query.limit) || 500, 1), 2000);
    const skipDeadline = resolveCrmLeadsSkipDeadline(mergedQuery, { skipDeadline: true });
    const lite = resolveCrmLeadsKanbanLite(mergedQuery, { lite: true });
    const ledgerPeriodStart = defaultKpiLedgerMonthStartYmd();

    const stagesPromise = resolveKanbanStagesForCompany(type, companyId, mergedQuery.region_id, req);
    const kanbanPromise = fetchCrmLeadsPageViaRpc(req, mergedQuery, type, 0, parsedLimit, {
      lite,
      skipDeadline,
    });

    const [stages, kanbanPage] = await Promise.all([stagesPromise, kanbanPromise]);
    if (!kanbanPage) {
      return res.status(500).json({ error: 'Không tải được dữ liệu kanban' });
    }

    const lightStats = await computeCrmDashboardLightStats(req, type, {
      effectiveCompanyId: companyId,
      region_id: uuidQueryOrNull(mergedQuery.region_id),
      region_unassigned: mergedQuery.region_unassigned,
      stages: stages || [],
      assigned_to_only: uuidQueryOrNull(mergedQuery.assigned_to),
      date_from: mergedQuery.date_from,
      date_to: mergedQuery.date_to,
      phone_filter: mergedQuery.phone_filter,
      search: mergedQuery.search,
      source_id: uuidQueryOrNull(mergedQuery.source_id),
      assignee_name: mergedQuery.assignee_name,
    });
    const totalItems = lightStats.totalItems ?? kanbanPage.total ?? 0;
    const wonItemCount = lightStats.wonCount || 0;
    const kpis = buildCrmDashboardMinimalKpis(type, totalItems, wonItemCount, 0, 0, ledgerPeriodStart);

    res.json({
      type,
      stages: stages || [],
      dashboard: {
        pipeline: lightStats.stageStats,
        kpis,
        ledger_net_by_lead: {},
        recent_quotations: [],
        recent_orders: [],
        light: true,
        minimal: true,
      },
      kanban: kanbanPage,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/kanban-bootstrap', responseCache({ ttl: 15, scope: 'user', tags: ['crm:list'] }), async (req, res) => {
  try {
    const ctx = await resolveCrmLeadsMergedQuery(req, res);
    if (!ctx) return;
    const { type, mergedQuery, rpcAssigneeStrict, rpcRegionIds } = ctx;
    if (crmListUsesLegacyFilters(mergedQuery)) {
      return res.status(400).json({ error: 'Bộ lọc hiện tại chưa hỗ trợ kanban-bootstrap. Dùng GET /crm/leads.' });
    }

    const companyId = uuidQueryOrNull(mergedQuery.company_id);
    const regionId = mergedQuery.region_id;
    const parsedLimit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 200);
    const requestedStageId = uuidQueryOrNull(req.query.stage_id);
    const skipCounts = req.query.skip_counts === '1' || req.query.skip_counts === 'true';
    const lite = req.query.lite === '1' || req.query.lite === 'true';

    const stages = await resolveKanbanStagesForCompany(type, companyId, regionId, req);
    const stageIds = stages.map((s) => String(s.id)).filter(Boolean);
    const initialStageId =
      requestedStageId && stageIds.includes(String(requestedStageId))
        ? String(requestedStageId)
        : (stageIds[0] || '');

    const filterParams = buildCrmLeadsRpcFilterParams(mergedQuery, type, rpcAssigneeStrict, rpcRegionIds);

    const loadInitialPage = async () => {
      if (!initialStageId) {
        return { data: [], total: 0, offset: 0, limit: parsedLimit, hasMore: false, nextOffset: 0 };
      }
      return fetchCrmLeadsPageViaRpc(
        req,
        { ...mergedQuery, stage_id: initialStageId },
        type,
        0,
        parsedLimit,
        { lite },
      );
    };

    // Đếm số lượng theo cột không phụ thuộc trang đầu — chạy song song để bớt 1 lượt round-trip.
    let countsError = null;
    const countsPromise = skipCounts
      ? null
      : invokeCrmLeadsStageCountsRpc({
        ...filterParams,
        p_pipeline_stage_ids: stageIds.length ? stageIds : null,
      }).catch((e) => {
        countsError = e;
        return null;
      });

    const initialPage = await loadInitialPage();
    if (!initialPage) {
      if (countsPromise) await countsPromise;
      return res.status(500).json({ error: 'Không tải được trang kanban' });
    }

    if (skipCounts) {
      const stageCounts = {};
      if (initialStageId) stageCounts[initialStageId] = initialPage.total;
      return res.json({
        stages,
        stageCounts,
        listTotal: initialPage.total,
        initialStageId,
        skipCounts: true,
        initialPage: {
          data: initialPage.data,
          total: initialPage.total,
          hasMore: initialPage.hasMore,
          nextOffset: initialPage.nextOffset,
        },
      });
    }

    const countsParsed = await countsPromise;
    if (countsError) throw countsError;

    const stageCounts = countsParsed?.counts || {};
    if (initialStageId && stageCounts[initialStageId] === undefined) {
      stageCounts[initialStageId] = initialPage.total;
    }

    res.json({
      stages,
      stageCounts,
      listTotal: countsParsed?.total ?? initialPage.total,
      initialStageId,
      initialPage: {
        data: initialPage.data,
        total: initialPage.total,
        hasMore: initialPage.hasMore,
        nextOffset: initialPage.nextOffset,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const CRM_DEADLINE_BUCKET_KEYS = [
  'overdue', 'today', 'tomorrow', 'this_week', 'next_week',
  'in_2_weeks', 'in_3_weeks', 'in_4_weeks', 'in_1_month',
  'next_month', 'no_deadline',
];

function crmDeadlineStageExcluded(stage) {
  return !!(
    stage?.is_won
    || stage?.is_lost
    || stage?.counts_as_completed_revenue
    || stage?.canonical_slug === 'won'
    || stage?.canonical_slug === 'lost'
    || stage?.deal_report_bucket === 'won'
    || stage?.deal_report_bucket === 'lost'
  );
}

function crmDeadlineStartOfTodayVn(nowMs = Date.now()) {
  const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
  const shifted = new Date(nowMs + VN_OFFSET_MS);
  return Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  ) - VN_OFFSET_MS;
}

function crmDeadlineBucketFromTs(deadlineTs, buckets, nowMs = Date.now()) {
  if (deadlineTs == null || !Number.isFinite(deadlineTs)) return 'no_deadline';
  const dayMs = 24 * 60 * 60 * 1000;
  const startToday = crmDeadlineStartOfTodayVn(nowMs);
  const endToday = startToday + dayMs - 1;
  if (deadlineTs < startToday) return 'overdue';
  if (deadlineTs <= endToday) return 'today';
  if (deadlineTs <= endToday + dayMs) return 'tomorrow';

  const vnToday = new Date(startToday + 7 * 60 * 60 * 1000);
  const dow = (vnToday.getUTCDay() + 6) % 7;
  const endThisWeek = startToday - dow * dayMs + 7 * dayMs - 1;
  if (deadlineTs <= endThisWeek) return 'this_week';
  if (deadlineTs <= endThisWeek + 7 * dayMs) return 'next_week';

  const days = (key, fallback) => {
    const value = Number(buckets?.[key]?.days);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  if (deadlineTs <= startToday + days('in_2_weeks', 14) * dayMs) return 'in_2_weeks';
  if (deadlineTs <= startToday + days('in_3_weeks', 21) * dayMs) return 'in_3_weeks';
  if (deadlineTs <= startToday + days('in_4_weeks', 28) * dayMs) return 'in_4_weeks';
  if (deadlineTs <= startToday + days('in_1_month', 30) * dayMs) return 'in_1_month';

  const y = vnToday.getUTCFullYear();
  const m = vnToday.getUTCMonth();
  const nextMonthStart = Date.UTC(y, m + 1, 1) - 7 * 60 * 60 * 1000;
  const nextMonthEnd = Date.UTC(y, m + 2, 1) - 7 * 60 * 60 * 1000 - 1;
  if (deadlineTs >= nextMonthStart && deadlineTs <= nextMonthEnd) return 'next_month';
  return 'in_1_month';
}

function crmDeadlineTsForRow(row, stage, config) {
  const hasPhone = !!String(
    row?.display_phone || row?.phone || row?.customer?.phone || '',
  ).trim();
  if (!hasPhone || row?.is_interacted || crmDeadlineStageExcluded(stage)) return null;

  for (const field of ['crm_next_open_task_deadline', 'kanban_deadline_at']) {
    const raw = row?.[field];
    if (!raw) continue;
    const ts = new Date(raw).getTime();
    if (!Number.isNaN(ts)) return ts;
  }

  const slaDays = effectivePipelineStageSlaDays(stage?.sla_days);
  if (slaDays != null && row?.stage_entered_at) {
    const dueAt = endOfCalendarDayAfterEntered(row.stage_entered_at, slaDays, row?.company_id);
    const ts = dueAt?.getTime?.();
    if (Number.isFinite(ts)) return ts;
  }

  const primary = String(config?.primary_field || 'crm_next_open_task_deadline');
  const fallback = String(config?.fallback_field || 'expected_close_date');
  for (const field of [primary, fallback]) {
    if (field === 'crm_next_open_task_deadline' || field === 'kanban_deadline_at') continue;
    const raw = row?.[field];
    if (!raw) continue;
    const ts = new Date(raw).getTime();
    if (!Number.isNaN(ts)) return ts;
  }
  return null;
}

// ─── Snapshot ổn định cho phân trang tab Deadline ──────────────────────────────
// Trước đây mỗi lần tải 1 trang (cuộn/bấm Tải thêm) đều tính lại TOÀN BỘ danh sách
// id-theo-bucket từ dữ liệu MỚI NHẤT. Trên hệ thống nhiều người dùng đang hoạt động
// liên tục, nếu 1 deal đổi bucket (đổi hạn, chuyển công đoạn...) giữa 2 lần tải trang,
// thứ tự/kích thước của bucket bị xê dịch → phân trang lệch hoặc dừng sớm (hasMore=false)
// dù chưa thật sự tải hết. Cache snapshot theo user+bộ lọc đủ lâu cho MỘT phiên cuộn thực tế
// (danh sách vài trăm dòng, tải 15 dòng/lượt, realtime tick mỗi ~30s) để toàn bộ phiên dùng
// chung MỘT danh sách id ổn định — tự hết hạn sau đó để không bị cũ quá lâu. Từng thử 3 phút
// và vẫn bị "trôi trang" giữa chừng trên hệ thống nhiều người dùng hoạt động liên tục.
const CRM_DEADLINE_SNAPSHOT_TTL_MS = 20 * 60 * 1000;
const crmDeadlineSnapshotCache = new Map();

function crmDeadlineSnapshotCacheKey(req, mergedQuery, type, stageIdsKey, config) {
  return JSON.stringify({
    u: req.user?.userId || null,
    t: type,
    q: mergedQuery,
    s: stageIdsKey,
    c: config || {},
  });
}

function pruneCrmDeadlineSnapshotCache() {
  const now = Date.now();
  for (const [key, entry] of crmDeadlineSnapshotCache) {
    if (entry.expiresAt < now) crmDeadlineSnapshotCache.delete(key);
  }
}

async function getOrBuildCrmDeadlineSnapshot(req, mergedQuery, type, rpcAssigneeStrict, openStageIds, config) {
  pruneCrmDeadlineSnapshotCache();
  const stageIdsKey = [...openStageIds].sort().join(',');
  const key = crmDeadlineSnapshotCacheKey(req, mergedQuery, type, stageIdsKey, config);
  const hit = crmDeadlineSnapshotCache.get(key);
  if (hit) return hit;

  const openStageIdSet = new Set(openStageIds);
  const groupedIds = Object.fromEntries(CRM_DEADLINE_BUCKET_KEYS.map((k) => [k, []]));
  const stages = await resolveKanbanStagesForCompany(
    type,
    uuidQueryOrNull(mergedQuery.company_id),
    mergedQuery.region_id,
    req,
  );
  const stageById = new Map((stages || []).map((s) => [String(s.id), s]));
  const MAX_ROWS = 20000;
  let complete = true;

  const classifyRows = (rows) => {
    for (const row of rows || []) {
      const sid = String(row?.stage_id || '');
      if (!openStageIdSet.has(sid)) continue;
      const stage = stageById.get(sid);
      const ts = crmDeadlineTsForRow(row, stage, config);
      groupedIds[crmDeadlineBucketFromTs(ts, config?.buckets)].push(String(row.id));
    }
  };

  if (crmListUsesLegacyFilters(mergedQuery)) {
    let offset = 0;
    let scanned = 0;
    while (scanned < MAX_ROWS) {
      const page = await getCrmLeadsListLegacy({
        ...mergedQuery,
        offset,
        limit: 2000,
        lite: '1',
      }, {
        assigneeStrict: rpcAssigneeStrict,
        viewerUserId: req.user?.userId,
        req,
        lite: true,
      });
      if (!page) { complete = false; break; }
      const rows = page.data || [];
      classifyRows(rows);
      scanned += rows.length;
      if (!page.hasMore || !rows.length) break;
      if (scanned >= MAX_ROWS) { complete = false; break; }
      offset = page.nextOffset ?? (offset + rows.length);
    }
  } else {
    const result = await fetchCrmDeadlineCountRowsViaRpc(req, mergedQuery, type, MAX_ROWS);
    if (!result) throw new Error('Không tải được dữ liệu Deadline');
    classifyRows(result.rows);
    complete = result.complete;
  }

  const snapshot = { idsByBucket: groupedIds, complete, expiresAt: Date.now() + CRM_DEADLINE_SNAPSHOT_TTL_MS };
  crmDeadlineSnapshotCache.set(key, snapshot);
  return snapshot;
}

function resolveCrmDeadlineOpenStageIds(stages, requestedStageIds) {
  return (stages || [])
    .filter((stage) => (
      !crmDeadlineStageExcluded(stage)
      && (!requestedStageIds.size || requestedStageIds.has(String(stage.id)))
    ))
    .map((stage) => String(stage.id));
}

r.post('/deadline-bucket-counts', async (req, res) => {
  try {
    const ctx = await resolveCrmLeadsMergedQuery(req, res);
    if (!ctx) return;
    const { type, mergedQuery, rpcAssigneeStrict } = ctx;
    const stages = await resolveKanbanStagesForCompany(
      type,
      uuidQueryOrNull(mergedQuery.company_id),
      mergedQuery.region_id,
      req,
    );
    const requestedIds = new Set(
      (Array.isArray(req.body?.stage_ids) ? req.body.stage_ids : [])
        .map((id) => String(id || '').trim())
        .filter(Boolean),
    );
    const openStageIds = resolveCrmDeadlineOpenStageIds(stages, requestedIds);
    const config = req.body?.config && typeof req.body.config === 'object' ? req.body.config : {};

    const snapshot = await getOrBuildCrmDeadlineSnapshot(req, mergedQuery, type, rpcAssigneeStrict, openStageIds, config);
    const counts = Object.fromEntries(
      CRM_DEADLINE_BUCKET_KEYS.map((key) => [key, (snapshot.idsByBucket[key] || []).length]),
    );
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    res.json({ type, counts, total, complete: snapshot.complete });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/deadline-bucket-pages', async (req, res) => {
  try {
    const ctx = await resolveCrmLeadsMergedQuery(req, res);
    if (!ctx) return;
    const { type, mergedQuery, rpcAssigneeStrict } = ctx;
    const seenBuckets = new Set();
    const requests = [];
    for (const raw of Array.isArray(req.body?.buckets) ? req.body.buckets : []) {
      const bucket = String(raw?.bucket || '').trim();
      if (!CRM_DEADLINE_BUCKET_KEYS.includes(bucket) || seenBuckets.has(bucket)) continue;
      seenBuckets.add(bucket);
      requests.push({
        bucket,
        offset: Math.max(parseInt(raw?.offset) || 0, 0),
        limit: Math.min(Math.max(parseInt(raw?.limit) || 10, 1), 20),
      });
      if (requests.length >= 6) break;
    }
    if (!requests.length) return res.json({ type, pages: {} });

    const stages = await resolveKanbanStagesForCompany(
      type,
      uuidQueryOrNull(mergedQuery.company_id),
      mergedQuery.region_id,
      req,
    );
    const requestedStageIds = new Set(
      (Array.isArray(req.body?.stage_ids) ? req.body.stage_ids : [])
        .map((id) => String(id || '').trim())
        .filter(Boolean),
    );
    const openStageIds = resolveCrmDeadlineOpenStageIds(stages, requestedStageIds);
    const config = req.body?.config && typeof req.body.config === 'object' ? req.body.config : {};

    const snapshot = await getOrBuildCrmDeadlineSnapshot(req, mergedQuery, type, rpcAssigneeStrict, openStageIds, config);
    const pages = {};
    for (const request of requests) {
      const ids = snapshot.idsByBucket[request.bucket] || [];
      const pageIds = ids.slice(request.offset, request.offset + request.limit);
      const nextOffset = request.offset + pageIds.length;
      pages[request.bucket] = {
        ids: pageIds,
        total: ids.length,
        nextOffset,
        hasMore: nextOffset < ids.length,
      };
    }

    const allIds = [...new Set(Object.values(pages).flatMap((p) => p.ids))];
    const hydrated = await fetchCrmLeadsByIdsOrdered(allIds, { skipEnrich: true, lite: true });
    const baseRows = attachLeadNewFlagForList(hydrated, req.user?.userId);
    const [withFlags, withDeadlines] = await Promise.all([
      attachLeadUserFlagsForList(baseRows, req.user?.userId),
      attachCrmNextOpenTaskDeadline(baseRows),
    ]);
    const flagsById = new Map(withFlags.map((row) => [String(row.id), row]));
    const rowsById = new Map(withDeadlines.map((row) => [
      String(row.id),
      { ...row, ...(flagsById.get(String(row.id)) || {}) },
    ]));
    const responsePages = {};
    for (const [bucket, page] of Object.entries(pages)) {
      responsePages[bucket] = {
        // Gắn bucket server để UI không xếp lại lệch với số đếm header.
        data: page.ids
          .map((id) => {
            const row = rowsById.get(id);
            return row
              ? { ...row, _deadline_bucket: bucket, deadline_bucket: bucket }
              : null;
          })
          .filter(Boolean),
        total: page.total,
        nextOffset: page.nextOffset,
        hasMore: page.hasMore,
      };
    }
    res.json({ type, pages: responsePages, complete: snapshot.complete, source: 'snapshot' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /crm/kpi-ledger-total — tổng điểm KPI (sổ cái crm_kpi_ledger) trên TOÀN BỘ lead/deal
// khớp bộ lọc Kanban hiện tại (không chỉ số thẻ đã tải) — dùng cho ô "Điểm KPI (tháng)".
r.post('/kpi-ledger-total', async (req, res) => {
  try {
    const ctx = await resolveCrmLeadsMergedQuery(req, res);
    if (!ctx) return;
    const { type, mergedQuery, rpcAssigneeStrict } = ctx;
    const periodStart = String(req.body?.period_start || '').trim() || defaultKpiLedgerMonthStartYmd();
    const MAX_ROWS = 20000;

    let result = null;
    if (!crmListUsesLegacyFilters(mergedQuery)) {
      result = await fetchCrmDeadlineCountRowsViaRpc(req, mergedQuery, type, MAX_ROWS);
    }

    let ids = [];
    let complete = true;
    if (result) {
      ids = (result.rows || []).map((row) => String(row.id));
      complete = result.complete;
    } else {
      let offset = 0;
      for (;;) {
        const page = await getCrmLeadsListLegacy({
          ...mergedQuery,
          offset,
          limit: 2000,
          lite: '1',
        }, {
          assigneeStrict: rpcAssigneeStrict,
          viewerUserId: req.user?.userId,
          req,
          lite: true,
        });
        if (!page) break;
        const rows = page.data || [];
        ids.push(...rows.map((row) => String(row.id)));
        if (!page.hasMore || !rows.length) break;
        if (ids.length >= MAX_ROWS) { complete = false; break; }
        offset = page.nextOffset ?? (offset + rows.length);
      }
    }

    const sums = await sumCrmKpiLedgerNetByLeadIds(ids, periodStart);
    const total = Object.values(sums).reduce((s, v) => s + Number(v || 0), 0);
    res.json({
      type,
      total: Math.round(total * 100) / 100,
      matched_count: ids.length,
      complete,
      period_start: periodStart,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/kanban-stage-pages', async (req, res) => {
  try {
    const ctx = await resolveCrmLeadsMergedQuery(req, res);
    if (!ctx) return;
    const { type, mergedQuery, rpcAssigneeStrict } = ctx;
    const rawRequests = Array.isArray(req.body?.stages) ? req.body.stages : [];
    const seenStageIds = new Set();
    const stageRequests = [];

    for (const raw of rawRequests) {
      const stageId = uuidQueryOrNull(raw?.stage_id);
      if (!stageId || seenStageIds.has(stageId)) continue;
      seenStageIds.add(stageId);
      stageRequests.push({
        stageId,
        offset: Math.max(parseInt(raw?.offset) || 0, 0),
        limit: Math.min(Math.max(parseInt(raw?.limit) || 10, 1), 40),
      });
      if (stageRequests.length >= 12) break;
    }

    if (!stageRequests.length) {
      return res.json({ type, pages: {} });
    }

    const useLegacy = crmListUsesLegacyFilters(mergedQuery);
    if (!useLegacy) {
      const batchPages = await helpers.fetchCrmKanbanStagePageIdsViaRpc(
        req,
        mergedQuery,
        type,
        stageRequests,
      );
      if (batchPages) {
        const allIds = [...new Set(
          Object.values(batchPages)
            .flatMap((page) => Array.isArray(page?.ids) ? page.ids : [])
            .map((id) => String(id || '').trim())
            .filter(Boolean),
        )];
        const hydrated = await fetchCrmLeadsByIdsOrdered(allIds, {
          skipEnrich: true,
          lite: true,
        });
        let baseRows = attachLeadNewFlagForList(hydrated, req.user?.userId);
        baseRows = await attachLeadUserFlagsForList(baseRows, req.user?.userId);
        // Multi-SX: mỗi xưởng một chip pipeline trên thẻ CRM
        baseRows = await helpers.attachProductionProjectsForList(baseRows);
        const rowsById = new Map(baseRows.map((row) => [String(row.id), row]));
        const pages = {};
        for (const [stageId, page] of Object.entries(batchPages)) {
          const ids = Array.isArray(page?.ids) ? page.ids.map(String) : [];
          pages[stageId] = {
            data: ids.map((id) => rowsById.get(id)).filter(Boolean),
            total: Number(page?.total) || 0,
            hasMore: !!page?.hasMore,
            nextOffset: Number(page?.nextOffset) || 0,
          };
        }
        return res.json({ type, pages, source: 'rpc-batch' });
      }
    }

    const pages = {};
    const CONCURRENCY = 3;
    for (let i = 0; i < stageRequests.length; i += CONCURRENCY) {
      const chunk = stageRequests.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        chunk.map(async ({ stageId, offset, limit }) => {
          try {
            const stageQuery = {
              ...mergedQuery,
              stage_id: stageId,
              offset,
              limit,
              lite: '1',
              skip_deadline: '1',
            };
            const page = useLegacy
              ? await getCrmLeadsListLegacy(stageQuery, {
                  assigneeStrict: rpcAssigneeStrict,
                  viewerUserId: req.user?.userId,
                  req,
                  lite: true,
                  skipDeadline: true,
                })
              : await fetchCrmLeadsPageViaRpc(req, stageQuery, type, offset, limit, {
                  lite: true,
                  skipDeadline: true,
                });
            if (!page) {
              return [stageId, { data: [], total: 0, hasMore: false, nextOffset: offset }];
            }
            return [stageId, page];
          } catch (stageErr) {
            console.warn('[kanban-stage-pages] stage soft-fail', stageId, stageErr?.message || stageErr);
            return [stageId, { data: [], total: 0, hasMore: false, nextOffset: offset }];
          }
        }),
      );
      for (const [stageId, page] of results) {
        pages[stageId] = {
          data: page.data || [],
          total: page.total ?? 0,
          hasMore: !!page.hasMore,
          nextOffset: page.nextOffset ?? 0,
        };
      }
    }

    res.json({ type, pages });
  } catch (e) {
    console.error('[kanban-stage-pages]', e.message || e);
    res.status(500).json({ error: e.message || 'Không tải được trang Kanban theo cột' });
  }
});

r.get('/leads', responseCache({ ttl: 15, scope: 'user', tags: ['crm:list'] }), async (req, res) => {
  try {
    const ctx = await resolveCrmLeadsMergedQuery(req, res);
    if (!ctx) return;
    const { type: resolvedType, mergedQuery, rpcAssigneeStrict } = ctx;
    const { limit = 100, offset = 0 } = mergedQuery;
    const parsedLimit = Math.min(Math.max(parseInt(limit) || 100, 1), 2000);
    const parsedOffset = Math.max(parseInt(offset) || 0, 0);

    // RPC không có lead_type / referrer / customer_company / follow-up / pipeline — dùng legacy.
    if (crmListUsesLegacyFilters(mergedQuery)) {
      const legacy = await getCrmLeadsListLegacy(mergedQuery, {
        assigneeStrict: rpcAssigneeStrict,
        viewerUserId: req.user?.userId,
        req,
        lite: resolveCrmLeadsKanbanLite(mergedQuery),
      });
      return res.json(legacy);
    }

    const pageViaRpc = await fetchCrmLeadsPageViaRpc(req, mergedQuery, resolvedType, parsedOffset, parsedLimit, {
      lite: resolveCrmLeadsKanbanLite(mergedQuery),
      skipDeadline: resolveCrmLeadsSkipDeadline(mergedQuery),
    });
    if (pageViaRpc) return res.json(pageViaRpc);

    console.warn('[crm/leads] crm_leads_page_ids RPC unavailable, using legacy');
    const legacy = await getCrmLeadsListLegacy(mergedQuery, {
      assigneeStrict: rpcAssigneeStrict,
      viewerUserId: req.user?.userId,
      req,
      lite: resolveCrmLeadsKanbanLite(mergedQuery),
    });
    return res.json(legacy);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/leads/stage-history-summary', async (req, res) => {
  try {
    const leadIds = [...new Set((req.body?.lead_ids || []).map((x) => String(x).trim()).filter(Boolean))].slice(0, 500);
    if (!leadIds.length) return res.json({ by_lead: {}, parent_codes: {} });

    const pipelineId = uuidQueryOrNull(req.body?.pipeline_id);
    const companyId = uuidQueryOrNull(req.body?.company_id);
    let allowedStageIds = [...new Set((req.body?.stage_ids || []).map((x) => String(x).trim()).filter(Boolean))];

    if (!allowedStageIds.length && (pipelineId || companyId)) {
      let sq = supabase.from('crm_pipeline_stages').select('id');
      if (pipelineId) sq = sq.eq('pipeline_id', pipelineId);
      else if (companyId) {
        const { data: pipes, error: pe } = await supabase
          .from('crm_pipelines')
          .select('id')
          .eq('company_id', companyId);
        if (pe) throw pe;
        const pipeIds = (pipes || []).map((p) => p.id).filter(Boolean);
        if (!pipeIds.length) {
          return res.json({ by_lead: {}, parent_codes: {}, stage_ids: [] });
        }
        sq = sq.in('pipeline_id', pipeIds);
      }
      const { data: stageRows, error: se } = await sq;
      if (se) throw se;
      allowedStageIds = (stageRows || []).map((s) => String(s.id)).filter(Boolean);
    }

    const allowedSet = new Set(allowedStageIds);

    const PAGE = 1000;
    const histRows = [];
    for (let i = 0; i < leadIds.length; i += 200) {
      const chunk = leadIds.slice(i, i + 200);
      let from = 0;
      for (;;) {
        let hq = supabase
          .from('crm_lead_stage_history')
          .select('lead_id, to_stage_id, to_canonical_slug, entered_at, exited_at, duration_seconds')
          .in('lead_id', chunk)
          .order('entered_at', { ascending: true });
        if (allowedSet.size) hq = hq.in('to_stage_id', [...allowedSet]);
        const { data, error } = await hq.range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = data || [];
        histRows.push(...batch);
        if (batch.length < PAGE) break;
        from += PAGE;
      }
    }

    const byLead = {};
    for (const h of histRows) {
      const lid = String(h.lead_id);
      if (allowedSet.size && !allowedSet.has(String(h.to_stage_id || ''))) continue;
      if (!byLead[lid]) byLead[lid] = [];
      byLead[lid].push(h);
    }

    const parentCodes = {};
    const parentIds = new Set();
    for (let i = 0; i < leadIds.length; i += 200) {
      const chunk = leadIds.slice(i, i + 200);
      const { data: leadsChunk, error: le } = await supabase
        .from('crm_leads')
        .select('id, parent_lead_id')
        .in('id', chunk);
      if (le) throw le;
      for (const row of leadsChunk || []) {
        if (row.parent_lead_id) parentIds.add(String(row.parent_lead_id));
      }
    }
    const parentIdList = [...parentIds];
    for (let i = 0; i < parentIdList.length; i += 200) {
      const chunk = parentIdList.slice(i, i + 200);
      const { data: parents, error: pe } = await supabase
        .from('crm_leads')
        .select('id, code')
        .in('id', chunk);
      if (pe) throw pe;
      for (const p of parents || []) {
        if (p?.id) parentCodes[String(p.id)] = p.code || '';
      }
    }

    res.json({
      by_lead: byLead,
      parent_codes: parentCodes,
      stage_ids: allowedStageIds,
      pipeline_id: pipelineId,
      company_id: companyId,
    });
  } catch (e) {
    console.error('POST /crm/leads/stage-history-summary:', e);
    res.status(500).json({ error: e.message || 'Lỗi tải lịch sử stage' });
  }
});
}).call(null, helpers["ALLOWED_DEADLINE_FIELDS"], helpers["CRM_COMMENT_ALLOWED_REACTION_EMOJI"], helpers["CRM_LEAD_KANBAN_LITE_SELECT"], helpers["CRM_LEAD_LIST_SELECT"], helpers["CRM_LEAD_LIST_SELECT_BASE"], helpers["CRM_LEAD_LIST_SELECT_EXTRA"], helpers["CRM_LEAD_REGION_EMBED"], helpers["CRM_NEW_LEAD_MAX_AGE_MS"], helpers["CRM_TASK_SELECT"], helpers["CRM_UUID_RE"], helpers["CUSTOMERS_IN_CHUNK"], helpers["CUSTOMERS_OVERVIEW_NO_MATCH_ID"], helpers["DEAL_PRE_CONTRACT_SLUGS_STAFF"], helpers["DEAL_REPORT_BUCKET_VALUES"], helpers["DEFAULT_CHECKLISTS"], helpers["DEFAULT_DEADLINE_BUCKETS"], helpers["DEFAULT_PIPELINE_STAGE_SLA_DAYS"], helpers["FOLLOWUP_TIME_BUCKETS"], helpers["PDFDocument"], helpers["QUOTATIONS_SOURCE_EXCEL_COLS"], helpers["Router"], helpers["SCAN_DUP_LITE_SELECT"], helpers["STAFF_LEAD_DEAL_REPORT_ROLES"], helpers["SURVEY_EVENT_SELECT"], helpers["SURVEY_EVENT_TYPES"], helpers["XLSX"], helpers["ZALO_APP_SETTING_KEY"], helpers["crmSchemaCompat"], helpers["addPhoneToAutoLeadBlocklist"], helpers["aggregateCrmCommentReactions"], helpers["aggregateOrgReportRows"], helpers["appendFulfillmentChildTasksForMasterDeal"], helpers["applyAllActiveWorkshopTemplatesForArea"], helpers["applyAssigneesToInsertedCrmTasks"], helpers["applyCrmLeadRegionFilterToQuery"], helpers["applyCrmTaskTemplatesToCompanyRegions"], helpers["applyCustomerIdInFilter"], helpers["applyCustomersOverviewSearch"], helpers["applyDefaultWorkshopTemplatesForNewProject"], helpers["applyLeadOrCustomerSalesFilter"], helpers["applyProductionTemplateToFulfillmentLead"], helpers["applyProductionTemplatesOnPipelineEnter"], helpers["applyStageIdFilterToQuery"], helpers["applyWorkshopTemplateToProject"], helpers["artifactNamePrefix"], helpers["assertCanFlagLead"], helpers["assertCategoryFitsSource"], helpers["assertCrmAssigneeUserMatchesLeadCompany"], helpers["assertCrmEmployeeDeleteAllowed"], helpers["assertCrmStageAdvanceAllowed"], helpers["assertDealCrmManualStageChange"], helpers["assertDealResponsible"], helpers["assertDivisionAllowedForCompany"], helpers["assertLeadDocumentOwner"], helpers["assertLeadReadableByRegionScope"], helpers["assertRegionBelongsToCompany"], helpers["assertUserCanAssignCrmRegion"], helpers["assignProductionCompanyDealResponsibility"], helpers["attachAssigneesToCrmTasks"], helpers["attachAssignmentIdsToCrmTasks"], helpers["attachCrmNextOpenTaskDeadline"], helpers["attachLeadNewFlagForList"], helpers["attachLeadReplyParents"], helpers["attachLeadUserFlagsForList"], helpers["auth"], helpers["autoCreateProjectFromWonDeal"], helpers["autoFlowFns"], helpers["autoGenCrmTasksForNewLead"], helpers["buildAssignmentNotificationInsert"], helpers["buildChecklistLeadDocumentRow"], helpers["buildCrmDashboardMinimalKpis"], helpers["buildCrmLeadsRpcFilterParams"], helpers["buildCustomersOverviewSummary"], helpers["buildDealTemplateData"], helpers["buildDefaultDeadlineConfig"], helpers["buildFirstStageIdByPipeline"], helpers["buildPipelineStagesMap"], helpers["buildProcessedCommercialItems"], helpers["buildQuotedStageOrderByPipeline"], helpers["buildScanDuplicateGroups"], helpers["buildWonStageOrderByPipeline"], helpers["canUserViewDocByAllowlist"], helpers["chatUpload"], helpers["chunkArray"], helpers["classifyDealStageForStaffReport"], helpers["commentsTableMissing"], helpers["companyRegionExtraColumnsMissing"], helpers["companyRegionGeoColumnsMissing"], helpers["computeCrmDashboardLightStats"], helpers["computeCrmLiveVersionMs"], helpers["computeCustomersOverviewSummary"], helpers["computeIsNewLeadForUser"], helpers["computeOrgOverviewReportData"], helpers["computeStaffLeadDealReportData"], helpers["computeStaffPipelineDetailPayload"], helpers["countOpenOverdueCrmTasksForLeadIds"], helpers["createCrmAssignment"], helpers["createCrmLeadTask"], helpers["createFulfillmentChildDeal"], helpers["createNotif"], helpers["createNotification"], helpers["createProjectFromLead"], helpers["crmExecutorFieldsFromTemplateItem"], helpers["crmLeadCommentAttachmentsColumnMissing"], helpers["crmLeadCommentReadReceiptsTableMissing"], helpers["crmLeadRowVisibleToRequestUser"], helpers["crmListUsesLegacyFilters"], helpers["crmNoteActivityUpload"], helpers["crmReportAsOfMs"], helpers["crmReportCreatedAtFromIso"], helpers["crmReportCreatedAtToIso"], helpers["crmReportDayKeyVn"], helpers["crmRouteErrorText"], helpers["crmTaskDeadlineModuleKey"], helpers["crmTaskMeetsCompletionRequirements"], helpers["crmTaskMeetsRequiredFileTypes"], helpers["crmTaskRequiresCompletionEvidence"], helpers["crmTemplateMatchesLeadType"], helpers["deadlineToDateOnlyIso"], helpers["defaultCompanyInfo"], helpers["defaultKpiLedgerMonthStartYmd"], helpers["deleteCrmLeadTask"], helpers["deleteMirroredAssignmentFileForTaskAttachment"], helpers["duplicateLeadIdsFromLiteRows"], helpers["ecosystemModuleKeyForCrmDeadline"], helpers["effectivePipelineStageSlaDays"], helpers["emitCrmBadgeUpdateForProject"], helpers["emitCrmDashboardChanged"], helpers["emitCrmTaskChanged"], helpers["emptyStaffLeadDealAgg"], helpers["endOfCalendarDayAfterEntered"], helpers["enforceCommercialDocCompanyOnWrite"], helpers["enforceQuotaForRequest"], helpers["ensureDealLeadDocumentsForModuleTransition"], helpers["ensureDefaultCrmPipelineForCompany"], helpers["ensureMissingCrmTasksForLead"], helpers["ensureMissingCrmTasksForPipelineStage"], helpers["ensureMissingSxTasksForLead"], helpers["excelUpload"], helpers["executeLeadMerge"], helpers["executeZaloDealStageNotify"], helpers["fetchActivityCustomerIds"], helpers["fetchAllLeadsForSlaWatchlist"], helpers["fetchAssignmentForTask"], helpers["fetchCrmCommentReactionsAggregate"], helpers["fetchCrmDeadlineCountRowsViaRpc"], helpers["fetchCrmLeadCommentNotifyUserIds"], helpers["fetchCrmLeadDetailRow"], helpers["fetchCrmLeadWithPipelineBadges"], helpers["fetchCrmLeadsByIdsOrdered"], helpers["fetchCrmLeadsForDashboardBatched"], helpers["fetchCrmLeadsForOrgReportBatched"], helpers["fetchCrmLeadsForUserDetailBatched"], helpers["fetchCrmLeadsLiteForDuplicateScan"], helpers["fetchCrmLeadsPageViaRpc"], helpers["fetchCrmPipelineZaloSlice"], helpers["fetchCrmSurveyEventsChunk"], helpers["fetchCrmSurveyVisitsForOrgReport"], helpers["fetchLeadCommentAudienceMembers"], helpers["fetchLeadCommentAudienceMembersForRead"], helpers["fetchLeadIdsForCrmRegion"], helpers["fetchLeadMentionMembers"], helpers["fetchOrgActivityFeed"], helpers["fetchPipelineWithStagesById"], helpers["fetchScopedCrmBundles"], helpers["fillTemplateDataFromStructure"], helpers["filterCrmTasksForLeadType"], helpers["filterUserIdsForCrmLeadScopedNotification"], helpers["findChecklistItem"], helpers["followupDismissExpiresAt"], helpers["fontBold"], helpers["fontRegular"], helpers["formatMoney"], helpers["formatVNDPdf"], helpers["formatVnPhoneLocal0From84"], helpers["fs"], helpers["generateDocPdf"], helpers["generateFlowTasks"], helpers["generateStepTasks"], helpers["getAppSettingValue"], helpers["getCompanyInfo"], helpers["getCompanyRegionsList"], helpers["getCrmLeadListSelect"], helpers["getCrmLeadRegionConstraint"], helpers["getCrmLeadTypesList"], helpers["getCrmLeadsListLegacy"], helpers["getCrmSourceCategoriesList"], helpers["getCrmSourcesList"], helpers["getDefaultCrmAttachmentShare"], helpers["getDefaultDealZaloTemplateStructure"], helpers["getDefaultLeadDocumentShareForDeal"], helpers["getDefaultPipelineIdForCompany"], helpers["getLeadDocumentFieldsFromCrmTask"], helpers["getNotifyTargets"], helpers["getOverdueFollowUps"], helpers["getPipelineIdForCompanyRegion"], helpers["getPipelineZaloSlice"], helpers["getPipelinesList"], helpers["getProjectCRMSummary"], helpers["getStagesByPipelineId"], helpers["getStaleLeads"], helpers["getZaloNotifySettings"], helpers["hydrateCrmLeadsByIdsWithStaff"], helpers["hydrateCrmLeadsRpcPage"], helpers["hydrateScanDuplicateLeads"], helpers["insertQuotationRow"], helpers["invalidateAppSettingKey"], helpers["invalidatePipelinesAndStages"], helpers["invalidateRegions"], helpers["invalidateSources"], helpers["invalidateTenantUsageCache"], helpers["invokeCrmLeadsStageCountsRpc"], helpers["isAdminLike"], helpers["isAllowedLeadCommentAttachmentUrl"], helpers["isChotSanXuatCrmTaskTitle"], helpers["isCrmCompanyAdminUser"], helpers["isCrmDealAssigneeLocked"], helpers["isCrmLeadTypeColorMissingError"], helpers["isCrmModuleAdmin"], helpers["isCrmPipelinesTableMissingError"], helpers["isCrmRegionAdminUser"], helpers["isCrmSystemAdminUser"], helpers["isDealStageHoanThanhForZalo"], helpers["isDefaultAssigneeIdsColumnError"], helpers["isExecutorColumnError"], helpers["isPlatformAdmin"], helpers["isPostgresUniqueViolation"], helpers["isQuotationsSourceExcelColumnMissingError"], helpers["isSxRelationshipError"], helpers["isSystemAdmin"], helpers["isUuidString"], helpers["isValidDealZaloTemplateStructure"], helpers["isVcRelationshipError"], helpers["isVptCompanyCommercialDocViewer"], helpers["lastNominatimGeocodeAt"], helpers["leadChatFilesMulter"], helpers["leadChatJsonOrFiles"], helpers["listQuotationExcelSheets"], helpers["loadCrmTaskAttachmentCountMap"], helpers["loadOrgReportStageMap"], helpers["loadZaloLinkedLeadIdSet"], helpers["logDealActivityComment"], helpers["logDealDeadlineChangeComment"], helpers["logDealStageChangeComment"], helpers["logKanbanDeadlineUnifiedHistory"], helpers["logLeadCommentMentionActivity"], helpers["logProjectFileActivity"], helpers["mapCustomerOverviewRow"], helpers["mapLeadDisplayPhone"], helpers["mapQuotationItemsToOrderRows"], helpers["maskCustomerPhoneDisplay"], helpers["maskZaloAccessTokenPreview"], helpers["maybeSendZaloOnDealStageEnter"], helpers["mergeCrmStageDefaultAssigneeIntoUpdates"], helpers["mergeCustomerIntoTarget"], helpers["misaService"], helpers["multer"], helpers["nextCode"], helpers["nextTbProjectCode"], helpers["normalizeCrmActivityAttachments"], helpers["normalizeCrmLeadCommentAttachments"], helpers["normalizeCrmStageDefaultAssigneeUserId"], helpers["normalizeCrmUserRole"], helpers["normalizeLeadSeenByKeys"], helpers["normalizeOrgReportSurveyVisitRow"], helpers["normalizePipelineStageSlaDaysForDb"], helpers["normalizePipelineStagesList"], helpers["normalizeRegionIdList"], helpers["normalizeTemplateChecklistForCrmTask"], helpers["normalizeTemplateItemAssigneeIds"], helpers["normalizeTimestamp"], helpers["normalizeTitleFold"], helpers["normalizeVnPhoneTo84"], helpers["notifyDealCommentMentions"], helpers["notifyDealCommentParticipants"], helpers["notifyMultiple"], helpers["notifyMultipleShared"], helpers["notifyNewCrmAssignmentAssignees"], helpers["notifyProductionDocumentUploaded"], helpers["onLeadWon"], helpers["onOrderConfirmed"], helpers["onProjectCompleted"], helpers["onQuotationAccepted"], helpers["orgReportAttachFirstStageRates"], helpers["orgReportBumpFirstStageMetrics"], helpers["orgReportBumpMetrics"], helpers["orgReportBumpOpenOverdue"], helpers["orgReportBumpReceptionMetrics"], helpers["orgReportCancelRatePct"], helpers["orgReportClosedWonDealCount"], helpers["orgReportClosedWonValue"], helpers["orgReportCompareSummary"], helpers["orgReportConversionRate"], helpers["orgReportDayKey"], helpers["orgReportDealCloseValueRatePct"], helpers["orgReportDealCountsExpected"], helpers["orgReportDealIsClosedWon"], helpers["orgReportDealIsCompleted"], helpers["orgReportDealIsQuotedOrAfter"], helpers["orgReportDealProbability"], helpers["orgReportDealSplitBuckets"], helpers["orgReportExtendedDealMetrics"], helpers["orgReportFirstStageOnTimeRatePct"], helpers["orgReportFirstStageOverdueRatePct"], helpers["orgReportIsReceptionOverdue"], helpers["orgReportIsSlaOverdue"], helpers["orgReportKpiPeriodStart"], helpers["orgReportNumEst"], helpers["orgReportOverdueRatePct"], helpers["orgReportOwnerId"], helpers["orgReportPctDelta"], helpers["orgReportPreviousPeriod"], helpers["orgReportQuoteValueCloseRatePct"], helpers["orgReportQuoteWinRatePct"], helpers["orgReportReceptionOverdueRatePct"], helpers["orgReportReceptionSlaMinutes"], helpers["orgReportStageIsClosed"], helpers["orgReportStageIsLostOrCancelled"], helpers["orgReportTotalDealCount"], helpers["parseChecklist"], helpers["parseCrmLeadsPageRpc"], helpers["parseCrmReportDateRange"], helpers["parseCrmStageCountsNumericMap"], helpers["parseCrmStageCountsRpc"], helpers["parseExcelMoneyFromMappedColumn"], helpers["parseLeadIdUuidList"], helpers["parseLeadIdsCsvQuery"], helpers["parseLeadIdsFromBody"], helpers["parseLeadSeenByRaw"], helpers["parseQuotationExcelBuffer"], helpers["parseStageIdsFromQuery"], helpers["parseUuidArrayJsonb"], helpers["parseVietnameseMeasure"], helpers["parseVietnameseMoney"], helpers["path"], helpers["persistAssignmentNotification"], helpers["pgCrmDuplicateLeadIds"], helpers["pickDealZaloTemplatePayload"], helpers["pipeOrgOverviewReportPdf"], helpers["pipeStaffLeadDealSummaryPdf"], helpers["pipeStaffPipelineDetailPdf"], helpers["pipelineHasExplicitCompleted"], helpers["pipelineHasExplicitExpected"], helpers["pipelineHasExplicitWon"], helpers["plannerTableMissing"], helpers["postCrmStageDefaultAssigneeComment"], helpers["primaryTemplateItemAssigneeId"], helpers["rcInvalidateTags"], helpers["reactionsTableMissing"], helpers["redactCrmTaskNotesForViewer"], helpers["regionGeocodeInflight"], helpers["repairCrmDealPipelineDisplay"], helpers["requireUserCompanyId"], helpers["requireUserCompanyIdResolved"], helpers["resolveAssignmentIdForTask"], helpers["resolveCanonicalCrmLeadId"], helpers["resolveCommercialDocListCompanyScope"], helpers["resolveCrmBundleTemplateScope"], helpers["resolveCrmLeadsDeadlinesMap"], helpers["resolveCrmLeadsKanbanLite"], helpers["resolveCrmLeadsMergedQuery"], helpers["resolveCrmLeadsSkipDeadline"], helpers["resolveCrmLedgerNetByLeadIdsPayload"], helpers["resolveCrmReportScope"], helpers["resolveCrmTaskWriteLeadId"], helpers["resolveExecutorCompanyId"], helpers["resolveKanbanStagesForCompany"], helpers["resolveLeadCommentMentionIds"], helpers["resolveProductionCompanyForDealStage"], helpers["resolveProductionHandoverResponsibleUserId"], helpers["resolveReopenTargetStageId"], helpers["resolveRpcRegionIdsForCrmList"], helpers["resolveTenantIdForQuota"], helpers["resolveZaloDealTemplateId"], helpers["respondIfCrmPipelinesTableMissing"], helpers["responseCache"], helpers["restoreCrmTaskChecklistFromWorkshopTemplate"], helpers["resyncCrmPipelineTasksForLead"], helpers["sanitizeIsoDateQueryParam"], helpers["scheduleRegionGeocoding"], helpers["scopedAdminCompanyId"], helpers["scopedCrmCompanyIdForWrite"], helpers["sendZaloTemplateMessage"], helpers["setLeadFlag"], helpers["shallowMergeTemplateData"], helpers["skipSxWorkQuickComplete"], helpers["snapshotOrderRowFromQuotation"], helpers["stripCrmAssigneeFromWonStageUpdates"], helpers["stripCrmLeadTypeColorFromSelect"], helpers["stripQuotationsSourceExcelFields"], helpers["sumCrmKpiLedgerNetByLeadIds"], helpers["sumCrmKpiLedgerNetByUserForOrgReport"], helpers["sumCrmKpiLedgerNetByUserIds"], helpers["sumCrmKpiLedgerNetByUserIdsInDateRange"], helpers["supabase"], helpers["syncAllTaskArtifactsToAssignment"], helpers["syncChecklistItemNotes"], helpers["syncCrmLeadSxPipelineFromProject"], helpers["syncQuotationDepositToDealAndProject"], helpers["syncSxKanbanFromCrmProductionStage"], helpers["syncTaskAttachmentToAssignment"], helpers["templateItemAssigneePatch"], helpers["toCrmTaskChecklist"], helpers["unifyCrmLeadResponsibleFields"], helpers["updateCrmLeadTask"], helpers["updateQuotationRow"], helpers["upsertZaloNotifySettings"], helpers["userCanAccessCrmLeadAsParticipant"], helpers["userCanAccessCrmLeadViaVisibility"], helpers["userCanAssignAnyCrmRegion"], helpers["userCanBypassCrmDeleteRestriction"], helpers["userHasSeenLeadInSeenBy"], helpers["userIsAdmin"], helpers["userIsCrmCompanyOrRegionAdmin"], helpers["userMayAccessQuotationRow"], helpers["userSeesAllCrmDeals"], helpers["userSeesAllCrmDealsForScope"], helpers["userSeesAllCrmLeads"], helpers["userSeesAllCrmLeadsForScope"], helpers["uuidQueryOrNull"], helpers["validateProductionCompanyId"]);

module.exports = r;
