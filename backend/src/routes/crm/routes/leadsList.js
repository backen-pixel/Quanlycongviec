/**
 * CRM routes: leadsList
 * Auto-extracted — handlers close over shared helpers via IIFE.
 */
const { Router } = require('express');
const helpers = require('../shared/helpersBundle');
const { sumCrmDealTabCountsFromStageCounts } = require('../../../helpers/crmDealTabTotals');

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

    // crm_leads không có cột `status` — trạng thái suy ra từ stage / actual_close_date.
    let query = supabase
      .from('crm_leads')
      .select(
        'id, code, title, type, stage_id, company_id, region_id, customer_id, ' +
          'assigned_to, lead_owner_id, estimated_value, created_at, actual_close_date, ' +
          'customer:customers(id, full_name, phone), ' +
          'company:companies!crm_leads_company_id_fkey(id, name, short_name), ' +
          'region:company_regions!crm_leads_region_id_fkey(id, name, code), ' +
          'assignee:users!crm_leads_assigned_to_fkey(id, full_name, email)',
      )
      .eq('type', type)
      .order('updated_at', { ascending: false })
      .limit(limit);

    // Scope theo công ty: admin công ty / nhân viên thường khoá theo company_id của user.
    const sac = scopedAdminCompanyId(req);
    if (sac) {
      query = query.eq('company_id', sac);
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      query = query.eq('company_id', cid);
    } else if (uuidQueryOrNull(req.query.company_id)) {
      query = query.eq('company_id', uuidQueryOrNull(req.query.company_id));
    }

    // Scope theo khu vực
    query = applyCrmLeadRegionFilterToQuery(query, req);
    if (uuidQueryOrNull(req.query.region_id)) {
      query = query.eq('region_id', uuidQueryOrNull(req.query.region_id));
    }

    if (customerId) query = query.eq('customer_id', customerId);

    if (q) {
      // Search theo code / title / SĐT / tên KH — crm_leads.phone hầu như luôn NULL,
      // SĐT thật nằm ở customers.phone qua customer_id nên cần tìm thêm customer_id khớp.
      const safe = q.replace(/[(),]/g, ' ').replace(/\s+/g, '%');
      const { data: custMatchRows } = await supabase
        .from('customers')
        .select('id')
        .or(`phone.ilike.%${safe}%,full_name.ilike.%${safe}%`)
        .limit(1000);
      const custMatchIds = (custMatchRows || []).map((r) => r.id);
      const orParts = [`code.ilike.%${safe}%`, `title.ilike.%${safe}%`, `phone.ilike.%${safe}%`];
      if (custMatchIds.length) orParts.push(`customer_id.in.(${custMatchIds.join(',')})`);
      query = query.or(orParts.join(','));
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({
      type,
      total: (data || []).length,
      results: (data || []).map((l) => ({
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
      })),
    });
  } catch (e) {
    console.error('[leads/picker]', e);
    res.status(500).json({ error: e.message || 'Lỗi tìm deal' });
  }
});

r.get('/stage-counts', responseCache({ ttl: 90, scope: 'user', tags: ['crm:list'] }), async (req, res) => {
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
});

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
    };
    const { data, error } = await supabase.rpc('crm_filter_summary', rpcParams);
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
      return {
        all: num(src.all),
        hasPhone: num(src.has_phone),
        noPhone: num(src.no_phone),
        selectedTotal: num(src.selected_total),
        counts: src.counts && typeof src.counts === 'object' ? src.counts : {},
      };
    };
    const dealNorm = normalize(data?.deal);
    // Tính tổng tab Deal trên server (cùng dealStages dùng cho RPC) để FE hiện badge
    // cùng lượt với Lead — không phụ thuộc stagesDeal client đã tải đủ.
    const tabTotals = sumCrmDealTabCountsFromStageCounts(dealStages, dealNorm.counts);
    return res.json({
      lead: normalize(data?.lead),
      deal: {
        ...dealNorm,
        tabTotals,
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
    const deadlines = await resolveCrmLeadsDeadlinesMap(leadIds);
    res.json({ deadlines });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/leads-deadlines', async (req, res) => {
  try {
    const leadIds = parseLeadIdsFromBody(req.body, 500);
    const deadlines = await resolveCrmLeadsDeadlinesMap(leadIds);
    res.json({ deadlines });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

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

    const initialPage = await loadInitialPage();
    if (!initialPage) {
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

    const countsParsed = await invokeCrmLeadsStageCountsRpc({
      ...filterParams,
      p_pipeline_stage_ids: stageIds.length ? stageIds : null,
    });

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
    const dueAt = endOfCalendarDayAfterEntered(row.stage_entered_at, slaDays);
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
    const openStages = (stages || []).filter((stage) => (
      !crmDeadlineStageExcluded(stage)
      && (!requestedIds.size || requestedIds.has(String(stage.id)))
    ));
    const counts = Object.fromEntries(CRM_DEADLINE_BUCKET_KEYS.map((key) => [key, 0]));
    const config = req.body?.config && typeof req.body.config === 'object' ? req.body.config : {};
    const useLegacy = crmListUsesLegacyFilters(mergedQuery);
    const PAGE_SIZE = 500;
    const MAX_ROWS = 20000;
    const stageById = new Map(openStages.map((stage) => [String(stage.id), stage]));
    if (!useLegacy) {
      const fastCounts = await helpers.fetchCrmDeadlineBucketCountsViaRpc(
        req,
        mergedQuery,
        type,
        [...stageById.keys()],
        config,
        MAX_ROWS,
      );
      if (fastCounts) {
        return res.json({ type, ...fastCounts, source: 'rpc' });
      }
    }

    let scannedRows = 0;
    let countedRows = 0;
    let complete = true;

    const countRows = (rows) => {
      for (const row of rows || []) {
        if (scannedRows >= MAX_ROWS) {
          complete = false;
          break;
        }
        scannedRows += 1;
        const stage = stageById.get(String(row?.stage_id || ''));
        if (!stage) continue;
        const ts = crmDeadlineTsForRow(row, stage, config);
        const bucket = crmDeadlineBucketFromTs(ts, config?.buckets);
        counts[bucket] = (counts[bucket] || 0) + 1;
        countedRows += 1;
      }
    };

    if (!useLegacy) {
      const result = await fetchCrmDeadlineCountRowsViaRpc(req, mergedQuery, type, MAX_ROWS);
      if (!result) throw new Error('Không đếm được tổng deadline');
      countRows(result.rows);
      complete = complete && result.complete;
    } else {
      let offset = 0;
      while (scannedRows < MAX_ROWS) {
        const pageQuery = {
          ...mergedQuery,
          offset,
          limit: PAGE_SIZE,
          lite: '1',
        };
        const page = await getCrmLeadsListLegacy(pageQuery, {
            assigneeStrict: rpcAssigneeStrict,
            viewerUserId: req.user?.userId,
            req,
            lite: true,
          });
        if (!page) throw new Error('Không đếm được tổng deadline');
        const rows = page.data || [];
        countRows(rows);
        if (!page.hasMore || !rows.length || scannedRows >= MAX_ROWS) {
          if (page.hasMore && scannedRows >= MAX_ROWS) complete = false;
          break;
        }
        offset = page.nextOffset ?? (offset + rows.length);
      }
    }

    res.json({ type, counts, total: countedRows, complete });
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
    const openStageIds = (stages || [])
      .filter((stage) => (
        !crmDeadlineStageExcluded(stage)
        && (!requestedStageIds.size || requestedStageIds.has(String(stage.id)))
      ))
      .map((stage) => String(stage.id));
    const config = req.body?.config && typeof req.body.config === 'object' ? req.body.config : {};
    let pageResult = null;
    let source = 'rpc';

    if (!crmListUsesLegacyFilters(mergedQuery)) {
      pageResult = await helpers.fetchCrmDeadlineBucketPageIdsViaRpc(
        req,
        mergedQuery,
        type,
        openStageIds,
        config,
        requests,
        20000,
      );
    }

    if (!pageResult) {
      source = 'fallback';
      let fallback = null;
      if (crmListUsesLegacyFilters(mergedQuery)) {
        const rows = [];
        let offset = 0;
        let complete = true;
        while (rows.length < 20000) {
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
          rows.push(...(page.data || []));
          if (!page.hasMore || !page.data?.length) break;
          offset = page.nextOffset ?? (offset + page.data.length);
          if (rows.length >= 20000) complete = false;
        }
        fallback = { rows, complete };
      } else {
        fallback = await fetchCrmDeadlineCountRowsViaRpc(req, mergedQuery, type, 20000);
      }
      if (!fallback) throw new Error('Không tải được trang Deadline');
      const stageById = new Map(
        (stages || []).map((stage) => [String(stage.id), stage]),
      );
      const groupedIds = Object.fromEntries(CRM_DEADLINE_BUCKET_KEYS.map((key) => [key, []]));
      for (const row of fallback.rows || []) {
        if (!openStageIds.includes(String(row?.stage_id || ''))) continue;
        const stage = stageById.get(String(row.stage_id));
        const ts = crmDeadlineTsForRow(row, stage, config);
        groupedIds[crmDeadlineBucketFromTs(ts, config?.buckets)].push(String(row.id));
      }
      const pages = {};
      for (const request of requests) {
        const ids = groupedIds[request.bucket] || [];
        const pageIds = ids.slice(request.offset, request.offset + request.limit);
        const nextOffset = request.offset + pageIds.length;
        pages[request.bucket] = {
          ids: pageIds,
          total: ids.length,
          nextOffset,
          hasMore: nextOffset < ids.length,
        };
      }
      pageResult = { pages, complete: fallback.complete };
    }

    const rawPages = pageResult.pages || {};
    const allIds = [...new Set(
      Object.values(rawPages)
        .flatMap((page) => Array.isArray(page?.ids) ? page.ids : [])
        .map((id) => String(id || '').trim())
        .filter(Boolean),
    )];
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
    const pages = {};
    for (const [bucket, page] of Object.entries(rawPages)) {
      const ids = Array.isArray(page?.ids) ? page.ids.map(String) : [];
      pages[bucket] = {
        // Gắn bucket server để UI không xếp lại lệch với số đếm header.
        data: ids
          .map((id) => {
            const row = rowsById.get(id);
            return row
              ? { ...row, _deadline_bucket: bucket, deadline_bucket: bucket }
              : null;
          })
          .filter(Boolean),
        total: Number(page?.total) || 0,
        nextOffset: Number(page?.nextOffset) || 0,
        hasMore: !!page?.hasMore,
      };
    }
    res.json({ type, pages, complete: pageResult.complete !== false, source });
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
        const baseRows = attachLeadNewFlagForList(hydrated, req.user?.userId);
        const withFlags = await attachLeadUserFlagsForList(baseRows, req.user?.userId);
        const rowsById = new Map(withFlags.map((row) => [String(row.id), row]));
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
