/**
 * CRM routes: leadsList
 * Auto-extracted — handlers close over shared helpers via IIFE.
 */
const { Router } = require('express');
const helpers = require('../shared/helpersBundle');

const r = Router();

(function (ALLOWED_DEADLINE_FIELDS, CRM_COMMENT_ALLOWED_REACTION_EMOJI, CRM_LEAD_KANBAN_LITE_SELECT, CRM_LEAD_LIST_SELECT, CRM_LEAD_LIST_SELECT_BASE, CRM_LEAD_LIST_SELECT_EXTRA, CRM_LEAD_REGION_EMBED, CRM_NEW_LEAD_MAX_AGE_MS, CRM_TASK_SELECT, CRM_UUID_RE, CUSTOMERS_IN_CHUNK, CUSTOMERS_OVERVIEW_NO_MATCH_ID, DEAL_PRE_CONTRACT_SLUGS_STAFF, DEAL_REPORT_BUCKET_VALUES, DEFAULT_CHECKLISTS, DEFAULT_DEADLINE_BUCKETS, DEFAULT_PIPELINE_STAGE_SLA_DAYS, FOLLOWUP_TIME_BUCKETS, PDFDocument, QUOTATIONS_SOURCE_EXCEL_COLS, Router, SCAN_DUP_LITE_SELECT, STAFF_LEAD_DEAL_REPORT_ROLES, SURVEY_EVENT_SELECT, SURVEY_EVENT_TYPES, XLSX, ZALO_APP_SETTING_KEY, _crmLeadSelectMigrationChecked, _crmLeadTypeColorAvailable, _vcPipelineStageAvailable, addPhoneToAutoLeadBlocklist, aggregateCrmCommentReactions, aggregateOrgReportRows, appendFulfillmentChildTasksForMasterDeal, applyAllActiveWorkshopTemplatesForArea, applyAssigneesToInsertedCrmTasks, applyCrmLeadRegionFilterToQuery, applyCrmTaskTemplatesToCompanyRegions, applyCustomerIdInFilter, applyCustomersOverviewSearch, applyDefaultWorkshopTemplatesForNewProject, applyLeadOrCustomerSalesFilter, applyProductionTemplateToFulfillmentLead, applyProductionTemplatesOnPipelineEnter, applyStageIdFilterToQuery, applyWorkshopTemplateToProject, artifactNamePrefix, assertCanFlagLead, assertCategoryFitsSource, assertCrmAssigneeUserMatchesLeadCompany, assertCrmEmployeeDeleteAllowed, assertCrmStageAdvanceAllowed, assertDealCrmManualStageChange, assertDealResponsible, assertDivisionAllowedForCompany, assertLeadDocumentOwner, assertLeadReadableByRegionScope, assertRegionBelongsToCompany, assertUserCanAssignCrmRegion, assignProductionCompanyDealResponsibility, attachAssigneesToCrmTasks, attachAssignmentIdsToCrmTasks, attachCrmNextOpenTaskDeadline, attachLeadNewFlagForList, attachLeadReplyParents, attachLeadUserFlagsForList, auth, autoCreateProjectFromWonDeal, autoFlowFns, autoGenCrmTasksForNewLead, buildAssignmentNotificationInsert, buildChecklistLeadDocumentRow, buildCrmDashboardMinimalKpis, buildCrmLeadsRpcFilterParams, buildCustomersOverviewSummary, buildDealTemplateData, buildDefaultDeadlineConfig, buildFirstStageIdByPipeline, buildPipelineStagesMap, buildProcessedCommercialItems, buildQuotedStageOrderByPipeline, buildScanDuplicateGroups, buildWonStageOrderByPipeline, canUserViewDocByAllowlist, chatUpload, chunkArray, classifyDealStageForStaffReport, commentsTableMissing, companyRegionExtraColumnsMissing, companyRegionGeoColumnsMissing, computeCrmDashboardLightStats, computeCrmLiveVersionMs, computeCustomersOverviewSummary, computeIsNewLeadForUser, computeOrgOverviewReportData, computeStaffLeadDealReportData, computeStaffPipelineDetailPayload, countOpenOverdueCrmTasksForLeadIds, createCrmAssignment, createCrmLeadTask, createFulfillmentChildDeal, createNotif, createNotification, createProjectFromLead, crmExecutorFieldsFromTemplateItem, crmLeadCommentAttachmentsColumnMissing, crmLeadCommentReadReceiptsTableMissing, crmLeadRowVisibleToRequestUser, crmListUsesLegacyFilters, crmNoteActivityUpload, crmReportAsOfMs, crmReportCreatedAtFromIso, crmReportCreatedAtToIso, crmReportDayKeyVn, crmRouteErrorText, crmTaskDeadlineModuleKey, crmTaskMeetsCompletionRequirements, crmTaskMeetsRequiredFileTypes, crmTaskRequiresCompletionEvidence, crmTemplateMatchesLeadType, deadlineToDateOnlyIso, defaultCompanyInfo, defaultKpiLedgerMonthStartYmd, deleteCrmLeadTask, deleteMirroredAssignmentFileForTaskAttachment, duplicateLeadIdsFromLiteRows, ecosystemModuleKeyForCrmDeadline, effectivePipelineStageSlaDays, emitCrmBadgeUpdateForProject, emitCrmDashboardChanged, emitCrmTaskChanged, emptyStaffLeadDealAgg, endOfCalendarDayAfterEntered, enforceCommercialDocCompanyOnWrite, enforceQuotaForRequest, ensureDealLeadDocumentsForModuleTransition, ensureDefaultCrmPipelineForCompany, ensureMissingCrmTasksForLead, ensureMissingCrmTasksForPipelineStage, ensureMissingSxTasksForLead, excelUpload, executeLeadMerge, executeZaloDealStageNotify, fetchActivityCustomerIds, fetchAllLeadsForSlaWatchlist, fetchAssignmentForTask, fetchCrmCommentReactionsAggregate, fetchCrmLeadCommentNotifyUserIds, fetchCrmLeadDetailRow, fetchCrmLeadWithPipelineBadges, fetchCrmLeadsByIdsOrdered, fetchCrmLeadsForDashboardBatched, fetchCrmLeadsForOrgReportBatched, fetchCrmLeadsForUserDetailBatched, fetchCrmLeadsLiteForDuplicateScan, fetchCrmLeadsPageViaRpc, fetchCrmPipelineZaloSlice, fetchCrmSurveyEventsChunk, fetchCrmSurveyVisitsForOrgReport, fetchLeadCommentAudienceMembers, fetchLeadCommentAudienceMembersForRead, fetchLeadIdsForCrmRegion, fetchLeadMentionMembers, fetchOrgActivityFeed, fetchPipelineWithStagesById, fetchScopedCrmBundles, fillTemplateDataFromStructure, filterCrmTasksForLeadType, filterUserIdsForCrmLeadScopedNotification, findChecklistItem, followupDismissExpiresAt, fontBold, fontRegular, formatMoney, formatVNDPdf, formatVnPhoneLocal0From84, fs, generateDocPdf, generateFlowTasks, generateStepTasks, getAppSettingValue, getCompanyInfo, getCompanyRegionsList, getCrmLeadListSelect, getCrmLeadRegionConstraint, getCrmLeadTypesList, getCrmLeadsListLegacy, getCrmSourceCategoriesList, getCrmSourcesList, getDefaultCrmAttachmentShare, getDefaultDealZaloTemplateStructure, getDefaultLeadDocumentShareForDeal, getDefaultPipelineIdForCompany, getLeadDocumentFieldsFromCrmTask, getNotifyTargets, getOverdueFollowUps, getPipelineIdForCompanyRegion, getPipelineZaloSlice, getPipelinesList, getProjectCRMSummary, getStagesByPipelineId, getStaleLeads, getZaloNotifySettings, hydrateCrmLeadsByIdsWithStaff, hydrateCrmLeadsRpcPage, hydrateScanDuplicateLeads, insertQuotationRow, invalidateAppSettingKey, invalidatePipelinesAndStages, invalidateRegions, invalidateSources, invalidateTenantUsageCache, invokeCrmLeadsStageCountsRpc, isAdminLike, isAllowedLeadCommentAttachmentUrl, isChotSanXuatCrmTaskTitle, isCrmCompanyAdminUser, isCrmDealAssigneeLocked, isCrmLeadTypeColorMissingError, isCrmModuleAdmin, isCrmPipelinesTableMissingError, isCrmRegionAdminUser, isCrmSystemAdminUser, isDealStageHoanThanhForZalo, isDefaultAssigneeIdsColumnError, isExecutorColumnError, isPlatformAdmin, isPostgresUniqueViolation, isQuotationsSourceExcelColumnMissingError, isSxRelationshipError, isSystemAdmin, isUuidString, isValidDealZaloTemplateStructure, isVcRelationshipError, isVptCompanyCommercialDocViewer, lastNominatimGeocodeAt, leadChatFilesMulter, leadChatJsonOrFiles, listQuotationExcelSheets, loadCrmTaskAttachmentCountMap, loadOrgReportStageMap, loadZaloLinkedLeadIdSet, logDealActivityComment, logDealDeadlineChangeComment, logDealStageChangeComment, logKanbanDeadlineUnifiedHistory, logLeadCommentMentionActivity, logProjectFileActivity, mapCustomerOverviewRow, mapLeadDisplayPhone, mapQuotationItemsToOrderRows, maskCustomerPhoneDisplay, maskZaloAccessTokenPreview, maybeSendZaloOnDealStageEnter, mergeCrmStageDefaultAssigneeIntoUpdates, mergeCustomerIntoTarget, misaService, multer, nextCode, nextTbProjectCode, normalizeCrmActivityAttachments, normalizeCrmLeadCommentAttachments, normalizeCrmStageDefaultAssigneeUserId, normalizeCrmUserRole, normalizeLeadSeenByKeys, normalizeOrgReportSurveyVisitRow, normalizePipelineStageSlaDaysForDb, normalizePipelineStagesList, normalizeRegionIdList, normalizeTemplateChecklistForCrmTask, normalizeTemplateItemAssigneeIds, normalizeTimestamp, normalizeTitleFold, normalizeVnPhoneTo84, notifyDealCommentMentions, notifyDealCommentParticipants, notifyMultiple, notifyMultipleShared, notifyNewCrmAssignmentAssignees, notifyProductionDocumentUploaded, onLeadWon, onOrderConfirmed, onProjectCompleted, onQuotationAccepted, orgReportAttachFirstStageRates, orgReportBumpFirstStageMetrics, orgReportBumpMetrics, orgReportBumpOpenOverdue, orgReportBumpReceptionMetrics, orgReportCancelRatePct, orgReportClosedWonDealCount, orgReportClosedWonValue, orgReportCompareSummary, orgReportConversionRate, orgReportDayKey, orgReportDealCloseValueRatePct, orgReportDealCountsExpected, orgReportDealIsClosedWon, orgReportDealIsCompleted, orgReportDealIsQuotedOrAfter, orgReportDealProbability, orgReportDealSplitBuckets, orgReportExtendedDealMetrics, orgReportFirstStageOnTimeRatePct, orgReportFirstStageOverdueRatePct, orgReportIsReceptionOverdue, orgReportIsSlaOverdue, orgReportKpiPeriodStart, orgReportNumEst, orgReportOverdueRatePct, orgReportOwnerId, orgReportPctDelta, orgReportPreviousPeriod, orgReportQuoteValueCloseRatePct, orgReportQuoteWinRatePct, orgReportReceptionOverdueRatePct, orgReportReceptionSlaMinutes, orgReportStageIsClosed, orgReportStageIsLostOrCancelled, orgReportTotalDealCount, parseChecklist, parseCrmLeadsPageRpc, parseCrmReportDateRange, parseCrmStageCountsNumericMap, parseCrmStageCountsRpc, parseExcelMoneyFromMappedColumn, parseLeadIdUuidList, parseLeadIdsCsvQuery, parseLeadIdsFromBody, parseLeadSeenByRaw, parseQuotationExcelBuffer, parseStageIdsFromQuery, parseUuidArrayJsonb, parseVietnameseMeasure, parseVietnameseMoney, path, persistAssignmentNotification, pgCrmDuplicateLeadIds, pickDealZaloTemplatePayload, pipeOrgOverviewReportPdf, pipeStaffLeadDealSummaryPdf, pipeStaffPipelineDetailPdf, pipelineHasExplicitCompleted, pipelineHasExplicitExpected, pipelineHasExplicitWon, plannerTableMissing, postCrmStageDefaultAssigneeComment, primaryTemplateItemAssigneeId, rcInvalidateTags, reactionsTableMissing, redactCrmTaskNotesForViewer, regionGeocodeInflight, repairCrmDealPipelineDisplay, requireUserCompanyId, requireUserCompanyIdResolved, resolveAssignmentIdForTask, resolveCanonicalCrmLeadId, resolveCommercialDocListCompanyScope, resolveCrmBundleTemplateScope, resolveCrmLeadsDeadlinesMap, resolveCrmLeadsKanbanLite, resolveCrmLeadsMergedQuery, resolveCrmLeadsSkipDeadline, resolveCrmLedgerNetByLeadIdsPayload, resolveCrmReportScope, resolveCrmTaskWriteLeadId, resolveExecutorCompanyId, resolveKanbanStagesForCompany, resolveLeadCommentMentionIds, resolveProductionCompanyForDealStage, resolveProductionHandoverResponsibleUserId, resolveReopenTargetStageId, resolveRpcRegionIdsForCrmList, resolveTenantIdForQuota, resolveZaloDealTemplateId, respondIfCrmPipelinesTableMissing, responseCache, restoreCrmTaskChecklistFromWorkshopTemplate, resyncCrmPipelineTasksForLead, sanitizeIsoDateQueryParam, scheduleRegionGeocoding, scopedAdminCompanyId, scopedCrmCompanyIdForWrite, sendZaloTemplateMessage, setLeadFlag, shallowMergeTemplateData, skipSxWorkQuickComplete, snapshotOrderRowFromQuotation, stripCrmAssigneeFromWonStageUpdates, stripCrmLeadTypeColorFromSelect, stripQuotationsSourceExcelFields, sumCrmKpiLedgerNetByLeadIds, sumCrmKpiLedgerNetByUserForOrgReport, sumCrmKpiLedgerNetByUserIds, sumCrmKpiLedgerNetByUserIdsInDateRange, supabase, syncAllTaskArtifactsToAssignment, syncChecklistItemNotes, syncCrmLeadSxPipelineFromProject, syncQuotationDepositToDealAndProject, syncSxKanbanFromCrmProductionStage, syncTaskAttachmentToAssignment, templateItemAssigneePatch, toCrmTaskChecklist, unifyCrmLeadResponsibleFields, updateCrmLeadTask, updateQuotationRow, upsertZaloNotifySettings, userCanAccessCrmLeadAsParticipant, userCanAccessCrmLeadViaVisibility, userCanAssignAnyCrmRegion, userCanBypassCrmDeleteRestriction, userHasSeenLeadInSeenBy, userIsAdmin, userIsCrmCompanyOrRegionAdmin, userMayAccessQuotationRow, userSeesAllCrmDeals, userSeesAllCrmDealsForScope, userSeesAllCrmLeads, userSeesAllCrmLeadsForScope, uuidQueryOrNull, validateProductionCompanyId) {
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
      stages: stages || [],
      assigned_to_only: uuidQueryOrNull(mergedQuery.assigned_to),
      date_from: mergedQuery.date_from,
      date_to: mergedQuery.date_to,
      phone_filter: mergedQuery.phone_filter,
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
      const pageRpc = {
        ...filterParams,
        p_stage_id: initialStageId,
        p_limit: parsedLimit,
        p_offset: 0,
      };
      let { data: rpcData, error: rpcError } = await supabase.rpc('crm_leads_page_ids', pageRpc);
      if (rpcError && /crm_leads_page_ids|does not exist|Could not find|argument/i.test(String(rpcError.message || ''))) {
        const { p_region_ids: _r, ...noRegion } = pageRpc;
        const r2 = await supabase.rpc('crm_leads_page_ids', noRegion);
        if (!r2.error) {
          rpcData = r2.data;
          rpcError = null;
        }
      }
      const parsedRpc = !rpcError ? parseCrmLeadsPageRpc(rpcData) : null;
      if (!parsedRpc) return null;
      return hydrateCrmLeadsRpcPage(parsedRpc, req, 0, parsedLimit, { lite });
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

r.get('/leads', responseCache({ ttl: 15, scope: 'user', tags: ['crm:list'] }), async (req, res) => {
  try {
    const type = req.query.type || 'lead';
    const forcedDealSelf = type === 'deal' && req.user?.userId && !userSeesAllCrmDealsForScope(req.user);
    const forcedLeadSelf = type === 'lead' && req.user?.userId && !userSeesAllCrmLeadsForScope(req.user);
    let mergedQuery =
      forcedDealSelf || forcedLeadSelf ? { ...req.query, assigned_to: req.user.userId } : { ...req.query };
    const sacLeads = scopedAdminCompanyId(req);
    if (sacLeads) {
      mergedQuery = { ...mergedQuery, company_id: sacLeads };
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = await requireUserCompanyIdResolved(req, res);
      if (!cid) return;
      mergedQuery = { ...mergedQuery, company_id: cid };
    }
    const { stage_id, assigned_to, source_id, search, limit = 100, offset = 0, company_id, date_from, date_to, phone_filter, lead_type_id } = mergedQuery;
    const parsedLimit = Math.min(Math.max(parseInt(limit) || 100, 1), 2000);
    const parsedOffset = Math.max(parseInt(offset) || 0, 0);

    const dealAssigneeStrict = type === 'deal' && (!!uuidQueryOrNull(assigned_to) || forcedDealSelf);
    const leadAssigneeStrict = type === 'lead' && (!!uuidQueryOrNull(assigned_to) || forcedLeadSelf);
    const rpcAssigneeStrict = dealAssigneeStrict || leadAssigneeStrict;

    const referrerNameQuery = String(mergedQuery.referrer_name || '').trim();
    const customerCompanyQuery = String(mergedQuery.customer_company || '').trim();

    // RPC `crm_leads_page_ids` (database/58_...) không có tham số p_lead_type_id — gửi thêm sẽ khiến PostgREST
    // không resolve được function → 500. Lọc theo lead_type_id / referrer_name / customer_company chỉ dùng legacy.
    if (uuidQueryOrNull(lead_type_id) || referrerNameQuery || customerCompanyQuery) {
      const legacy = await getCrmLeadsListLegacy(mergedQuery, {
        assigneeStrict: rpcAssigneeStrict,
        viewerUserId: req.user?.userId,
        req,
        lite: resolveCrmLeadsKanbanLite(mergedQuery),
      });
      return res.json(legacy);
    }

    const legacyFollowUpFrom = sanitizeIsoDateQueryParam(mergedQuery.next_follow_up_from);
    const legacyFollowUpTo = sanitizeIsoDateQueryParam(mergedQuery.next_follow_up_to);
    const legacyFollowUpEmpty =
      mergedQuery.next_follow_up_empty === 'true' || mergedQuery.next_follow_up_empty === '1';
    const legacyPipelineId = uuidQueryOrNull(mergedQuery.pipeline_id);
    const forceLegacyExtended = !!(
      legacyFollowUpFrom ||
      legacyFollowUpTo ||
      legacyFollowUpEmpty ||
      legacyPipelineId
    );
    if (forceLegacyExtended) {
      const legacy = await getCrmLeadsListLegacy(mergedQuery, {
        assigneeStrict: rpcAssigneeStrict,
        viewerUserId: req.user?.userId,
        req,
        lite: resolveCrmLeadsKanbanLite(mergedQuery),
      });
      return res.json(legacy);
    }

    const rpcRegionIds = resolveRpcRegionIdsForCrmList(req, mergedQuery.region_id);

    const rpcParams = {
      p_type: type,
      p_stage_id: uuidQueryOrNull(stage_id),
      p_assigned_to: uuidQueryOrNull(assigned_to),
      p_source_id: uuidQueryOrNull(source_id),
      p_company_id: uuidQueryOrNull(company_id),
      p_date_from: sanitizeIsoDateQueryParam(date_from),
      p_date_to: sanitizeIsoDateQueryParam(date_to),
      p_search: search || null,
      p_phone_filter: phone_filter || null,
      p_limit: parsedLimit,
      p_offset: parsedOffset,
      p_assigned_strict: rpcAssigneeStrict,
      p_region_ids: rpcRegionIds,
    };

    let { data: rpcData, error: rpcError } = await supabase.rpc('crm_leads_page_ids', rpcParams);
    // DB cũ: không có p_region_ids — thử bỏ tham số cuối
    if (rpcError && /crm_leads_page_ids|does not exist|Could not find|argument/i.test(String(rpcError.message || ''))) {
      const { p_region_ids: _reg, ...rpcNoRegion } = rpcParams;
      let r2 = await supabase.rpc('crm_leads_page_ids', rpcNoRegion);
      if (r2.error && /crm_leads_page_ids|does not exist|Could not find/i.test(String(r2.error.message || ''))) {
        const { p_assigned_strict: _s, ...rpcLegacy } = rpcNoRegion;
        r2 = await supabase.rpc('crm_leads_page_ids', rpcLegacy);
      }
      if (!r2.error) {
        rpcData = r2.data;
        rpcError = null;
      }
    }

    const parsedRpc = !rpcError ? parseCrmLeadsPageRpc(rpcData) : null;
    const rpcOk = !!parsedRpc;
    const lite = resolveCrmLeadsKanbanLite(mergedQuery);
    const skipDeadline = resolveCrmLeadsSkipDeadline(mergedQuery);

    if (rpcOk) {
      const pageResult = await hydrateCrmLeadsRpcPage(parsedRpc, req, parsedOffset, parsedLimit, { lite, skipDeadline });
      return res.json(pageResult);
    }

    if (rpcError) {
      console.warn('[crm/leads] crm_leads_page_ids RPC unavailable, using legacy (max 5000 rows):', rpcError.message);
    }
    const legacy = await getCrmLeadsListLegacy(mergedQuery, {
      assigneeStrict: rpcAssigneeStrict,
      viewerUserId: req.user?.userId,
      req,
      lite,
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
}).call(null, helpers["ALLOWED_DEADLINE_FIELDS"], helpers["CRM_COMMENT_ALLOWED_REACTION_EMOJI"], helpers["CRM_LEAD_KANBAN_LITE_SELECT"], helpers["CRM_LEAD_LIST_SELECT"], helpers["CRM_LEAD_LIST_SELECT_BASE"], helpers["CRM_LEAD_LIST_SELECT_EXTRA"], helpers["CRM_LEAD_REGION_EMBED"], helpers["CRM_NEW_LEAD_MAX_AGE_MS"], helpers["CRM_TASK_SELECT"], helpers["CRM_UUID_RE"], helpers["CUSTOMERS_IN_CHUNK"], helpers["CUSTOMERS_OVERVIEW_NO_MATCH_ID"], helpers["DEAL_PRE_CONTRACT_SLUGS_STAFF"], helpers["DEAL_REPORT_BUCKET_VALUES"], helpers["DEFAULT_CHECKLISTS"], helpers["DEFAULT_DEADLINE_BUCKETS"], helpers["DEFAULT_PIPELINE_STAGE_SLA_DAYS"], helpers["FOLLOWUP_TIME_BUCKETS"], helpers["PDFDocument"], helpers["QUOTATIONS_SOURCE_EXCEL_COLS"], helpers["Router"], helpers["SCAN_DUP_LITE_SELECT"], helpers["STAFF_LEAD_DEAL_REPORT_ROLES"], helpers["SURVEY_EVENT_SELECT"], helpers["SURVEY_EVENT_TYPES"], helpers["XLSX"], helpers["ZALO_APP_SETTING_KEY"], helpers["_crmLeadSelectMigrationChecked"], helpers["_crmLeadTypeColorAvailable"], helpers["_vcPipelineStageAvailable"], helpers["addPhoneToAutoLeadBlocklist"], helpers["aggregateCrmCommentReactions"], helpers["aggregateOrgReportRows"], helpers["appendFulfillmentChildTasksForMasterDeal"], helpers["applyAllActiveWorkshopTemplatesForArea"], helpers["applyAssigneesToInsertedCrmTasks"], helpers["applyCrmLeadRegionFilterToQuery"], helpers["applyCrmTaskTemplatesToCompanyRegions"], helpers["applyCustomerIdInFilter"], helpers["applyCustomersOverviewSearch"], helpers["applyDefaultWorkshopTemplatesForNewProject"], helpers["applyLeadOrCustomerSalesFilter"], helpers["applyProductionTemplateToFulfillmentLead"], helpers["applyProductionTemplatesOnPipelineEnter"], helpers["applyStageIdFilterToQuery"], helpers["applyWorkshopTemplateToProject"], helpers["artifactNamePrefix"], helpers["assertCanFlagLead"], helpers["assertCategoryFitsSource"], helpers["assertCrmAssigneeUserMatchesLeadCompany"], helpers["assertCrmEmployeeDeleteAllowed"], helpers["assertCrmStageAdvanceAllowed"], helpers["assertDealCrmManualStageChange"], helpers["assertDealResponsible"], helpers["assertDivisionAllowedForCompany"], helpers["assertLeadDocumentOwner"], helpers["assertLeadReadableByRegionScope"], helpers["assertRegionBelongsToCompany"], helpers["assertUserCanAssignCrmRegion"], helpers["assignProductionCompanyDealResponsibility"], helpers["attachAssigneesToCrmTasks"], helpers["attachAssignmentIdsToCrmTasks"], helpers["attachCrmNextOpenTaskDeadline"], helpers["attachLeadNewFlagForList"], helpers["attachLeadReplyParents"], helpers["attachLeadUserFlagsForList"], helpers["auth"], helpers["autoCreateProjectFromWonDeal"], helpers["autoFlowFns"], helpers["autoGenCrmTasksForNewLead"], helpers["buildAssignmentNotificationInsert"], helpers["buildChecklistLeadDocumentRow"], helpers["buildCrmDashboardMinimalKpis"], helpers["buildCrmLeadsRpcFilterParams"], helpers["buildCustomersOverviewSummary"], helpers["buildDealTemplateData"], helpers["buildDefaultDeadlineConfig"], helpers["buildFirstStageIdByPipeline"], helpers["buildPipelineStagesMap"], helpers["buildProcessedCommercialItems"], helpers["buildQuotedStageOrderByPipeline"], helpers["buildScanDuplicateGroups"], helpers["buildWonStageOrderByPipeline"], helpers["canUserViewDocByAllowlist"], helpers["chatUpload"], helpers["chunkArray"], helpers["classifyDealStageForStaffReport"], helpers["commentsTableMissing"], helpers["companyRegionExtraColumnsMissing"], helpers["companyRegionGeoColumnsMissing"], helpers["computeCrmDashboardLightStats"], helpers["computeCrmLiveVersionMs"], helpers["computeCustomersOverviewSummary"], helpers["computeIsNewLeadForUser"], helpers["computeOrgOverviewReportData"], helpers["computeStaffLeadDealReportData"], helpers["computeStaffPipelineDetailPayload"], helpers["countOpenOverdueCrmTasksForLeadIds"], helpers["createCrmAssignment"], helpers["createCrmLeadTask"], helpers["createFulfillmentChildDeal"], helpers["createNotif"], helpers["createNotification"], helpers["createProjectFromLead"], helpers["crmExecutorFieldsFromTemplateItem"], helpers["crmLeadCommentAttachmentsColumnMissing"], helpers["crmLeadCommentReadReceiptsTableMissing"], helpers["crmLeadRowVisibleToRequestUser"], helpers["crmListUsesLegacyFilters"], helpers["crmNoteActivityUpload"], helpers["crmReportAsOfMs"], helpers["crmReportCreatedAtFromIso"], helpers["crmReportCreatedAtToIso"], helpers["crmReportDayKeyVn"], helpers["crmRouteErrorText"], helpers["crmTaskDeadlineModuleKey"], helpers["crmTaskMeetsCompletionRequirements"], helpers["crmTaskMeetsRequiredFileTypes"], helpers["crmTaskRequiresCompletionEvidence"], helpers["crmTemplateMatchesLeadType"], helpers["deadlineToDateOnlyIso"], helpers["defaultCompanyInfo"], helpers["defaultKpiLedgerMonthStartYmd"], helpers["deleteCrmLeadTask"], helpers["deleteMirroredAssignmentFileForTaskAttachment"], helpers["duplicateLeadIdsFromLiteRows"], helpers["ecosystemModuleKeyForCrmDeadline"], helpers["effectivePipelineStageSlaDays"], helpers["emitCrmBadgeUpdateForProject"], helpers["emitCrmDashboardChanged"], helpers["emitCrmTaskChanged"], helpers["emptyStaffLeadDealAgg"], helpers["endOfCalendarDayAfterEntered"], helpers["enforceCommercialDocCompanyOnWrite"], helpers["enforceQuotaForRequest"], helpers["ensureDealLeadDocumentsForModuleTransition"], helpers["ensureDefaultCrmPipelineForCompany"], helpers["ensureMissingCrmTasksForLead"], helpers["ensureMissingCrmTasksForPipelineStage"], helpers["ensureMissingSxTasksForLead"], helpers["excelUpload"], helpers["executeLeadMerge"], helpers["executeZaloDealStageNotify"], helpers["fetchActivityCustomerIds"], helpers["fetchAllLeadsForSlaWatchlist"], helpers["fetchAssignmentForTask"], helpers["fetchCrmCommentReactionsAggregate"], helpers["fetchCrmLeadCommentNotifyUserIds"], helpers["fetchCrmLeadDetailRow"], helpers["fetchCrmLeadWithPipelineBadges"], helpers["fetchCrmLeadsByIdsOrdered"], helpers["fetchCrmLeadsForDashboardBatched"], helpers["fetchCrmLeadsForOrgReportBatched"], helpers["fetchCrmLeadsForUserDetailBatched"], helpers["fetchCrmLeadsLiteForDuplicateScan"], helpers["fetchCrmLeadsPageViaRpc"], helpers["fetchCrmPipelineZaloSlice"], helpers["fetchCrmSurveyEventsChunk"], helpers["fetchCrmSurveyVisitsForOrgReport"], helpers["fetchLeadCommentAudienceMembers"], helpers["fetchLeadCommentAudienceMembersForRead"], helpers["fetchLeadIdsForCrmRegion"], helpers["fetchLeadMentionMembers"], helpers["fetchOrgActivityFeed"], helpers["fetchPipelineWithStagesById"], helpers["fetchScopedCrmBundles"], helpers["fillTemplateDataFromStructure"], helpers["filterCrmTasksForLeadType"], helpers["filterUserIdsForCrmLeadScopedNotification"], helpers["findChecklistItem"], helpers["followupDismissExpiresAt"], helpers["fontBold"], helpers["fontRegular"], helpers["formatMoney"], helpers["formatVNDPdf"], helpers["formatVnPhoneLocal0From84"], helpers["fs"], helpers["generateDocPdf"], helpers["generateFlowTasks"], helpers["generateStepTasks"], helpers["getAppSettingValue"], helpers["getCompanyInfo"], helpers["getCompanyRegionsList"], helpers["getCrmLeadListSelect"], helpers["getCrmLeadRegionConstraint"], helpers["getCrmLeadTypesList"], helpers["getCrmLeadsListLegacy"], helpers["getCrmSourceCategoriesList"], helpers["getCrmSourcesList"], helpers["getDefaultCrmAttachmentShare"], helpers["getDefaultDealZaloTemplateStructure"], helpers["getDefaultLeadDocumentShareForDeal"], helpers["getDefaultPipelineIdForCompany"], helpers["getLeadDocumentFieldsFromCrmTask"], helpers["getNotifyTargets"], helpers["getOverdueFollowUps"], helpers["getPipelineIdForCompanyRegion"], helpers["getPipelineZaloSlice"], helpers["getPipelinesList"], helpers["getProjectCRMSummary"], helpers["getStagesByPipelineId"], helpers["getStaleLeads"], helpers["getZaloNotifySettings"], helpers["hydrateCrmLeadsByIdsWithStaff"], helpers["hydrateCrmLeadsRpcPage"], helpers["hydrateScanDuplicateLeads"], helpers["insertQuotationRow"], helpers["invalidateAppSettingKey"], helpers["invalidatePipelinesAndStages"], helpers["invalidateRegions"], helpers["invalidateSources"], helpers["invalidateTenantUsageCache"], helpers["invokeCrmLeadsStageCountsRpc"], helpers["isAdminLike"], helpers["isAllowedLeadCommentAttachmentUrl"], helpers["isChotSanXuatCrmTaskTitle"], helpers["isCrmCompanyAdminUser"], helpers["isCrmDealAssigneeLocked"], helpers["isCrmLeadTypeColorMissingError"], helpers["isCrmModuleAdmin"], helpers["isCrmPipelinesTableMissingError"], helpers["isCrmRegionAdminUser"], helpers["isCrmSystemAdminUser"], helpers["isDealStageHoanThanhForZalo"], helpers["isDefaultAssigneeIdsColumnError"], helpers["isExecutorColumnError"], helpers["isPlatformAdmin"], helpers["isPostgresUniqueViolation"], helpers["isQuotationsSourceExcelColumnMissingError"], helpers["isSxRelationshipError"], helpers["isSystemAdmin"], helpers["isUuidString"], helpers["isValidDealZaloTemplateStructure"], helpers["isVcRelationshipError"], helpers["isVptCompanyCommercialDocViewer"], helpers["lastNominatimGeocodeAt"], helpers["leadChatFilesMulter"], helpers["leadChatJsonOrFiles"], helpers["listQuotationExcelSheets"], helpers["loadCrmTaskAttachmentCountMap"], helpers["loadOrgReportStageMap"], helpers["loadZaloLinkedLeadIdSet"], helpers["logDealActivityComment"], helpers["logDealDeadlineChangeComment"], helpers["logDealStageChangeComment"], helpers["logKanbanDeadlineUnifiedHistory"], helpers["logLeadCommentMentionActivity"], helpers["logProjectFileActivity"], helpers["mapCustomerOverviewRow"], helpers["mapLeadDisplayPhone"], helpers["mapQuotationItemsToOrderRows"], helpers["maskCustomerPhoneDisplay"], helpers["maskZaloAccessTokenPreview"], helpers["maybeSendZaloOnDealStageEnter"], helpers["mergeCrmStageDefaultAssigneeIntoUpdates"], helpers["mergeCustomerIntoTarget"], helpers["misaService"], helpers["multer"], helpers["nextCode"], helpers["nextTbProjectCode"], helpers["normalizeCrmActivityAttachments"], helpers["normalizeCrmLeadCommentAttachments"], helpers["normalizeCrmStageDefaultAssigneeUserId"], helpers["normalizeCrmUserRole"], helpers["normalizeLeadSeenByKeys"], helpers["normalizeOrgReportSurveyVisitRow"], helpers["normalizePipelineStageSlaDaysForDb"], helpers["normalizePipelineStagesList"], helpers["normalizeRegionIdList"], helpers["normalizeTemplateChecklistForCrmTask"], helpers["normalizeTemplateItemAssigneeIds"], helpers["normalizeTimestamp"], helpers["normalizeTitleFold"], helpers["normalizeVnPhoneTo84"], helpers["notifyDealCommentMentions"], helpers["notifyDealCommentParticipants"], helpers["notifyMultiple"], helpers["notifyMultipleShared"], helpers["notifyNewCrmAssignmentAssignees"], helpers["notifyProductionDocumentUploaded"], helpers["onLeadWon"], helpers["onOrderConfirmed"], helpers["onProjectCompleted"], helpers["onQuotationAccepted"], helpers["orgReportAttachFirstStageRates"], helpers["orgReportBumpFirstStageMetrics"], helpers["orgReportBumpMetrics"], helpers["orgReportBumpOpenOverdue"], helpers["orgReportBumpReceptionMetrics"], helpers["orgReportCancelRatePct"], helpers["orgReportClosedWonDealCount"], helpers["orgReportClosedWonValue"], helpers["orgReportCompareSummary"], helpers["orgReportConversionRate"], helpers["orgReportDayKey"], helpers["orgReportDealCloseValueRatePct"], helpers["orgReportDealCountsExpected"], helpers["orgReportDealIsClosedWon"], helpers["orgReportDealIsCompleted"], helpers["orgReportDealIsQuotedOrAfter"], helpers["orgReportDealProbability"], helpers["orgReportDealSplitBuckets"], helpers["orgReportExtendedDealMetrics"], helpers["orgReportFirstStageOnTimeRatePct"], helpers["orgReportFirstStageOverdueRatePct"], helpers["orgReportIsReceptionOverdue"], helpers["orgReportIsSlaOverdue"], helpers["orgReportKpiPeriodStart"], helpers["orgReportNumEst"], helpers["orgReportOverdueRatePct"], helpers["orgReportOwnerId"], helpers["orgReportPctDelta"], helpers["orgReportPreviousPeriod"], helpers["orgReportQuoteValueCloseRatePct"], helpers["orgReportQuoteWinRatePct"], helpers["orgReportReceptionOverdueRatePct"], helpers["orgReportReceptionSlaMinutes"], helpers["orgReportStageIsClosed"], helpers["orgReportStageIsLostOrCancelled"], helpers["orgReportTotalDealCount"], helpers["parseChecklist"], helpers["parseCrmLeadsPageRpc"], helpers["parseCrmReportDateRange"], helpers["parseCrmStageCountsNumericMap"], helpers["parseCrmStageCountsRpc"], helpers["parseExcelMoneyFromMappedColumn"], helpers["parseLeadIdUuidList"], helpers["parseLeadIdsCsvQuery"], helpers["parseLeadIdsFromBody"], helpers["parseLeadSeenByRaw"], helpers["parseQuotationExcelBuffer"], helpers["parseStageIdsFromQuery"], helpers["parseUuidArrayJsonb"], helpers["parseVietnameseMeasure"], helpers["parseVietnameseMoney"], helpers["path"], helpers["persistAssignmentNotification"], helpers["pgCrmDuplicateLeadIds"], helpers["pickDealZaloTemplatePayload"], helpers["pipeOrgOverviewReportPdf"], helpers["pipeStaffLeadDealSummaryPdf"], helpers["pipeStaffPipelineDetailPdf"], helpers["pipelineHasExplicitCompleted"], helpers["pipelineHasExplicitExpected"], helpers["pipelineHasExplicitWon"], helpers["plannerTableMissing"], helpers["postCrmStageDefaultAssigneeComment"], helpers["primaryTemplateItemAssigneeId"], helpers["rcInvalidateTags"], helpers["reactionsTableMissing"], helpers["redactCrmTaskNotesForViewer"], helpers["regionGeocodeInflight"], helpers["repairCrmDealPipelineDisplay"], helpers["requireUserCompanyId"], helpers["requireUserCompanyIdResolved"], helpers["resolveAssignmentIdForTask"], helpers["resolveCanonicalCrmLeadId"], helpers["resolveCommercialDocListCompanyScope"], helpers["resolveCrmBundleTemplateScope"], helpers["resolveCrmLeadsDeadlinesMap"], helpers["resolveCrmLeadsKanbanLite"], helpers["resolveCrmLeadsMergedQuery"], helpers["resolveCrmLeadsSkipDeadline"], helpers["resolveCrmLedgerNetByLeadIdsPayload"], helpers["resolveCrmReportScope"], helpers["resolveCrmTaskWriteLeadId"], helpers["resolveExecutorCompanyId"], helpers["resolveKanbanStagesForCompany"], helpers["resolveLeadCommentMentionIds"], helpers["resolveProductionCompanyForDealStage"], helpers["resolveProductionHandoverResponsibleUserId"], helpers["resolveReopenTargetStageId"], helpers["resolveRpcRegionIdsForCrmList"], helpers["resolveTenantIdForQuota"], helpers["resolveZaloDealTemplateId"], helpers["respondIfCrmPipelinesTableMissing"], helpers["responseCache"], helpers["restoreCrmTaskChecklistFromWorkshopTemplate"], helpers["resyncCrmPipelineTasksForLead"], helpers["sanitizeIsoDateQueryParam"], helpers["scheduleRegionGeocoding"], helpers["scopedAdminCompanyId"], helpers["scopedCrmCompanyIdForWrite"], helpers["sendZaloTemplateMessage"], helpers["setLeadFlag"], helpers["shallowMergeTemplateData"], helpers["skipSxWorkQuickComplete"], helpers["snapshotOrderRowFromQuotation"], helpers["stripCrmAssigneeFromWonStageUpdates"], helpers["stripCrmLeadTypeColorFromSelect"], helpers["stripQuotationsSourceExcelFields"], helpers["sumCrmKpiLedgerNetByLeadIds"], helpers["sumCrmKpiLedgerNetByUserForOrgReport"], helpers["sumCrmKpiLedgerNetByUserIds"], helpers["sumCrmKpiLedgerNetByUserIdsInDateRange"], helpers["supabase"], helpers["syncAllTaskArtifactsToAssignment"], helpers["syncChecklistItemNotes"], helpers["syncCrmLeadSxPipelineFromProject"], helpers["syncQuotationDepositToDealAndProject"], helpers["syncSxKanbanFromCrmProductionStage"], helpers["syncTaskAttachmentToAssignment"], helpers["templateItemAssigneePatch"], helpers["toCrmTaskChecklist"], helpers["unifyCrmLeadResponsibleFields"], helpers["updateCrmLeadTask"], helpers["updateQuotationRow"], helpers["upsertZaloNotifySettings"], helpers["userCanAccessCrmLeadAsParticipant"], helpers["userCanAccessCrmLeadViaVisibility"], helpers["userCanAssignAnyCrmRegion"], helpers["userCanBypassCrmDeleteRestriction"], helpers["userHasSeenLeadInSeenBy"], helpers["userIsAdmin"], helpers["userIsCrmCompanyOrRegionAdmin"], helpers["userMayAccessQuotationRow"], helpers["userSeesAllCrmDeals"], helpers["userSeesAllCrmDealsForScope"], helpers["userSeesAllCrmLeads"], helpers["userSeesAllCrmLeadsForScope"], helpers["uuidQueryOrNull"], helpers["validateProductionCompanyId"]);

module.exports = r;
