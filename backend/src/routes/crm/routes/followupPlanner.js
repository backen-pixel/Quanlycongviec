/**
 * CRM routes: followupPlanner
 * Auto-extracted — handlers close over shared helpers via IIFE.
 */
const { Router } = require('express');
const helpers = require('../shared/helpersBundle');
const { invalidateCrmDeadlineSnapshots } = require('../../../helpers/crmDeadlineSnapshotCache');

const r = Router();

(function (ALLOWED_DEADLINE_FIELDS, CRM_COMMENT_ALLOWED_REACTION_EMOJI, CRM_LEAD_KANBAN_LITE_SELECT, CRM_LEAD_LIST_SELECT, CRM_LEAD_LIST_SELECT_BASE, CRM_LEAD_LIST_SELECT_EXTRA, CRM_LEAD_REGION_EMBED, CRM_NEW_LEAD_MAX_AGE_MS, CRM_TASK_SELECT, CRM_UUID_RE, CUSTOMERS_IN_CHUNK, CUSTOMERS_OVERVIEW_NO_MATCH_ID, DEAL_PRE_CONTRACT_SLUGS_STAFF, DEAL_REPORT_BUCKET_VALUES, DEFAULT_CHECKLISTS, DEFAULT_DEADLINE_BUCKETS, DEFAULT_PIPELINE_STAGE_SLA_DAYS, FOLLOWUP_TIME_BUCKETS, PDFDocument, QUOTATIONS_SOURCE_EXCEL_COLS, Router, SCAN_DUP_LITE_SELECT, STAFF_LEAD_DEAL_REPORT_ROLES, SURVEY_EVENT_SELECT, SURVEY_EVENT_TYPES, XLSX, ZALO_APP_SETTING_KEY, crmSchemaCompat, addPhoneToAutoLeadBlocklist, aggregateCrmCommentReactions, aggregateOrgReportRows, appendFulfillmentChildTasksForMasterDeal, applyAllActiveWorkshopTemplatesForArea, applyAssigneesToInsertedCrmTasks, applyCrmLeadRegionFilterToQuery, applyCrmTaskTemplatesToCompanyRegions, applyCustomerIdInFilter, applyCustomersOverviewSearch, applyDefaultWorkshopTemplatesForNewProject, applyLeadOrCustomerSalesFilter, applyProductionTemplateToFulfillmentLead, applyProductionTemplatesOnPipelineEnter, applyStageIdFilterToQuery, applyWorkshopTemplateToProject, artifactNamePrefix, assertCanFlagLead, assertCategoryFitsSource, assertCrmAssigneeUserMatchesLeadCompany, assertCrmEmployeeDeleteAllowed, assertCrmStageAdvanceAllowed, assertDealCrmManualStageChange, assertDealResponsible, assertDivisionAllowedForCompany, assertLeadDocumentOwner, assertLeadReadableByRegionScope, assertRegionBelongsToCompany, assertUserCanAssignCrmRegion, assignProductionCompanyDealResponsibility, attachAssigneesToCrmTasks, attachAssignmentIdsToCrmTasks, attachCrmNextOpenTaskDeadline, attachLeadNewFlagForList, attachLeadReplyParents, attachLeadUserFlagsForList, auth, autoCreateProjectFromWonDeal, autoFlowFns, autoGenCrmTasksForNewLead, buildAssignmentNotificationInsert, buildChecklistLeadDocumentRow, buildCrmDashboardMinimalKpis, buildCrmLeadsRpcFilterParams, buildCustomersOverviewSummary, buildDealTemplateData, buildDefaultDeadlineConfig, buildFirstStageIdByPipeline, buildPipelineStagesMap, buildProcessedCommercialItems, buildQuotedStageOrderByPipeline, buildScanDuplicateGroups, buildWonStageOrderByPipeline, canUserViewDocByAllowlist, chatUpload, chunkArray, classifyDealStageForStaffReport, commentsTableMissing, companyRegionExtraColumnsMissing, companyRegionGeoColumnsMissing, computeCrmDashboardLightStats, computeCrmLiveVersionMs, computeCustomersOverviewSummary, computeIsNewLeadForUser, computeOrgOverviewReportData, computeStaffLeadDealReportData, computeStaffPipelineDetailPayload, countOpenOverdueCrmTasksForLeadIds, createCrmAssignment, createCrmLeadTask, createFulfillmentChildDeal, createNotif, createNotification, createProjectFromLead, crmExecutorFieldsFromTemplateItem, crmLeadCommentAttachmentsColumnMissing, crmLeadCommentReadReceiptsTableMissing, crmLeadRowVisibleToRequestUser, crmListUsesLegacyFilters, crmNoteActivityUpload, crmReportAsOfMs, crmReportCreatedAtFromIso, crmReportCreatedAtToIso, crmReportDayKeyVn, crmRouteErrorText, crmTaskDeadlineModuleKey, crmTaskMeetsCompletionRequirements, crmTaskMeetsRequiredFileTypes, crmTaskRequiresCompletionEvidence, crmTemplateMatchesLeadType, deadlineToDateOnlyIso, defaultCompanyInfo, defaultKpiLedgerMonthStartYmd, deleteCrmLeadTask, deleteMirroredAssignmentFileForTaskAttachment, duplicateLeadIdsFromLiteRows, ecosystemModuleKeyForCrmDeadline, effectivePipelineStageSlaDays, emitCrmBadgeUpdateForProject, emitCrmDashboardChanged, emitCrmTaskChanged, emptyStaffLeadDealAgg, endOfCalendarDayAfterEntered, enforceCommercialDocCompanyOnWrite, enforceQuotaForRequest, ensureDealLeadDocumentsForModuleTransition, ensureDefaultCrmPipelineForCompany, ensureMissingCrmTasksForLead, ensureMissingCrmTasksForPipelineStage, ensureMissingSxTasksForLead, excelUpload, executeLeadMerge, executeZaloDealStageNotify, fetchActivityCustomerIds, fetchAllLeadsForSlaWatchlist, fetchAssignmentForTask, fetchCrmCommentReactionsAggregate, fetchCrmLeadCommentNotifyUserIds, fetchCrmLeadDetailRow, fetchCrmLeadWithPipelineBadges, fetchCrmLeadsByIdsOrdered, fetchCrmLeadsForDashboardBatched, fetchCrmLeadsForOrgReportBatched, fetchCrmLeadsForUserDetailBatched, fetchCrmLeadsLiteForDuplicateScan, fetchCrmLeadsPageViaRpc, fetchCrmPipelineZaloSlice, fetchCrmSurveyEventsChunk, fetchCrmSurveyVisitsForOrgReport, fetchLeadCommentAudienceMembers, fetchLeadCommentAudienceMembersForRead, fetchLeadIdsForCrmRegion, fetchLeadMentionMembers, fetchOrgActivityFeed, fetchPipelineWithStagesById, fetchScopedCrmBundles, fillTemplateDataFromStructure, filterCrmTasksForLeadType, filterUserIdsForCrmLeadScopedNotification, findChecklistItem, followupDismissExpiresAt, fontBold, fontRegular, formatMoney, formatVNDPdf, formatVnPhoneLocal0From84, fs, generateDocPdf, generateFlowTasks, generateStepTasks, getAppSettingValue, getCompanyInfo, getCompanyRegionsList, getCrmLeadListSelect, getCrmLeadRegionConstraint, getCrmLeadTypesList, getCrmLeadsListLegacy, getCrmSourceCategoriesList, getCrmSourcesList, getDefaultCrmAttachmentShare, getDefaultDealZaloTemplateStructure, getDefaultLeadDocumentShareForDeal, getDefaultPipelineIdForCompany, getLeadDocumentFieldsFromCrmTask, getNotifyTargets, getOverdueFollowUps, getPipelineIdForCompanyRegion, getPipelineZaloSlice, getPipelinesList, getProjectCRMSummary, getStagesByPipelineId, getStaleLeads, getZaloNotifySettings, hydrateCrmLeadsByIdsWithStaff, hydrateCrmLeadsRpcPage, hydrateScanDuplicateLeads, insertQuotationRow, invalidateAppSettingKey, invalidatePipelinesAndStages, invalidateRegions, invalidateSources, invalidateTenantUsageCache, invokeCrmLeadsStageCountsRpc, isAdminLike, isAllowedLeadCommentAttachmentUrl, isChotSanXuatCrmTaskTitle, isCrmCompanyAdminUser, isCrmDealAssigneeLocked, isCrmLeadTypeColorMissingError, isCrmModuleAdmin, isCrmPipelinesTableMissingError, isCrmRegionAdminUser, isCrmSystemAdminUser, isDealStageHoanThanhForZalo, isDefaultAssigneeIdsColumnError, isExecutorColumnError, isPlatformAdmin, isPostgresUniqueViolation, isQuotationsSourceExcelColumnMissingError, isSxRelationshipError, isSystemAdmin, isUuidString, isValidDealZaloTemplateStructure, isVcRelationshipError, isVptCompanyCommercialDocViewer, lastNominatimGeocodeAt, leadChatFilesMulter, leadChatJsonOrFiles, listQuotationExcelSheets, loadCrmTaskAttachmentCountMap, loadOrgReportStageMap, loadZaloLinkedLeadIdSet, logDealActivityComment, logDealDeadlineChangeComment, logDealStageChangeComment, logKanbanDeadlineUnifiedHistory, logLeadCommentMentionActivity, logProjectFileActivity, mapCustomerOverviewRow, mapLeadDisplayPhone, mapQuotationItemsToOrderRows, maskCustomerPhoneDisplay, maskZaloAccessTokenPreview, maybeSendZaloOnDealStageEnter, mergeCrmStageDefaultAssigneeIntoUpdates, mergeCustomerIntoTarget, misaService, multer, nextCode, nextTbProjectCode, normalizeCrmActivityAttachments, normalizeCrmLeadCommentAttachments, normalizeCrmStageDefaultAssigneeUserId, normalizeCrmUserRole, normalizeLeadSeenByKeys, normalizeOrgReportSurveyVisitRow, normalizePipelineStageSlaDaysForDb, normalizePipelineStagesList, normalizeRegionIdList, normalizeTemplateChecklistForCrmTask, normalizeTemplateItemAssigneeIds, normalizeTimestamp, normalizeTitleFold, normalizeVnPhoneTo84, notifyDealCommentMentions, notifyDealCommentParticipants, notifyMultiple, notifyMultipleShared, notifyNewCrmAssignmentAssignees, notifyProductionDocumentUploaded, onLeadWon, onOrderConfirmed, onProjectCompleted, onQuotationAccepted, orgReportAttachFirstStageRates, orgReportBumpFirstStageMetrics, orgReportBumpMetrics, orgReportBumpOpenOverdue, orgReportBumpReceptionMetrics, orgReportCancelRatePct, orgReportClosedWonDealCount, orgReportClosedWonValue, orgReportCompareSummary, orgReportConversionRate, orgReportDayKey, orgReportDealCloseValueRatePct, orgReportDealCountsExpected, orgReportDealIsClosedWon, orgReportDealIsCompleted, orgReportDealIsQuotedOrAfter, orgReportDealProbability, orgReportDealSplitBuckets, orgReportExtendedDealMetrics, orgReportFirstStageOnTimeRatePct, orgReportFirstStageOverdueRatePct, orgReportIsReceptionOverdue, orgReportIsSlaOverdue, orgReportKpiPeriodStart, orgReportNumEst, orgReportOverdueRatePct, orgReportOwnerId, orgReportPctDelta, orgReportPreviousPeriod, orgReportQuoteValueCloseRatePct, orgReportQuoteWinRatePct, orgReportReceptionOverdueRatePct, orgReportReceptionSlaMinutes, orgReportStageIsClosed, orgReportStageIsLostOrCancelled, orgReportTotalDealCount, parseChecklist, parseCrmLeadsPageRpc, parseCrmReportDateRange, parseCrmStageCountsNumericMap, parseCrmStageCountsRpc, parseExcelMoneyFromMappedColumn, parseLeadIdUuidList, parseLeadIdsCsvQuery, parseLeadIdsFromBody, parseLeadSeenByRaw, parseQuotationExcelBuffer, parseStageIdsFromQuery, parseUuidArrayJsonb, parseVietnameseMeasure, parseVietnameseMoney, path, persistAssignmentNotification, pgCrmDuplicateLeadIds, pickDealZaloTemplatePayload, pipeOrgOverviewReportPdf, pipeStaffLeadDealSummaryPdf, pipeStaffPipelineDetailPdf, pipelineHasExplicitCompleted, pipelineHasExplicitExpected, pipelineHasExplicitWon, plannerTableMissing, postCrmStageDefaultAssigneeComment, primaryTemplateItemAssigneeId, rcInvalidateTags, reactionsTableMissing, redactCrmTaskNotesForViewer, regionGeocodeInflight, repairCrmDealPipelineDisplay, requireUserCompanyId, requireUserCompanyIdResolved, resolveAssignmentIdForTask, resolveCanonicalCrmLeadId, resolveCommercialDocListCompanyScope, resolveCrmBundleTemplateScope, resolveCrmLeadsDeadlinesMap, resolveCrmLeadsKanbanLite, resolveCrmLeadsMergedQuery, resolveCrmLeadsSkipDeadline, resolveCrmLedgerNetByLeadIdsPayload, resolveCrmReportScope, resolveCrmTaskWriteLeadId, resolveExecutorCompanyId, resolveKanbanStagesForCompany, resolveLeadCommentMentionIds, resolveProductionCompanyForDealStage, resolveProductionHandoverResponsibleUserId, resolveReopenTargetStageId, resolveRpcRegionIdsForCrmList, resolveTenantIdForQuota, resolveZaloDealTemplateId, respondIfCrmPipelinesTableMissing, responseCache, restoreCrmTaskChecklistFromWorkshopTemplate, resyncCrmPipelineTasksForLead, sanitizeIsoDateQueryParam, scheduleRegionGeocoding, scopedAdminCompanyId, scopedCrmCompanyIdForWrite, sendZaloTemplateMessage, setLeadFlag, shallowMergeTemplateData, skipSxWorkQuickComplete, snapshotOrderRowFromQuotation, stripCrmAssigneeFromWonStageUpdates, stripCrmLeadTypeColorFromSelect, stripQuotationsSourceExcelFields, sumCrmKpiLedgerNetByLeadIds, sumCrmKpiLedgerNetByUserForOrgReport, sumCrmKpiLedgerNetByUserIds, sumCrmKpiLedgerNetByUserIdsInDateRange, supabase, syncAllTaskArtifactsToAssignment, syncChecklistItemNotes, syncCrmLeadSxPipelineFromProject, syncQuotationDepositToDealAndProject, syncSxKanbanFromCrmProductionStage, syncTaskAttachmentToAssignment, templateItemAssigneePatch, toCrmTaskChecklist, unifyCrmLeadResponsibleFields, updateCrmLeadTask, updateQuotationRow, upsertZaloNotifySettings, userCanAccessCrmLeadAsParticipant, userCanAccessCrmLeadViaVisibility, userCanAssignAnyCrmRegion, userCanBypassCrmDeleteRestriction, userHasSeenLeadInSeenBy, userIsAdmin, userIsCrmCompanyOrRegionAdmin, userMayAccessQuotationRow, userSeesAllCrmDeals, userSeesAllCrmDealsForScope, userSeesAllCrmLeads, userSeesAllCrmLeadsForScope, uuidQueryOrNull, validateProductionCompanyId) {
r.get('/followup-care/notifications', responseCache({ ttl: 30, scope: 'user', tags: ['crm:list'] }), async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const isAdminUser = userIsAdmin(req.user?.role);
    const sacId = scopedAdminCompanyId(req);

    let companyFilter = req.query.company_id || null;
    if (sacId) companyFilter = sacId;
    else if (!isAdminUser) {
      companyFilter = req.user?.company_id || null;
    }

    let dismissedSet = new Set();
    try {
      const { data: dismissals } = await supabase
        .from('crm_followup_care_dismissals')
        .select('pipeline_id, stage_id, company_id, time_bucket, expires_at')
        .eq('user_id', userId)
        .gt('expires_at', new Date().toISOString());
      dismissedSet = new Set(
        (dismissals || []).map((d) => `${d.pipeline_id || ''}|${d.stage_id || ''}|${d.company_id || ''}|${d.time_bucket}`)
      );
    } catch { }

    let pipelinesQuery = supabase
      .from('crm_pipelines')
      .select('id, name, company_id, company:companies(id, name, short_name)')
      .eq('is_active', true);
    if (companyFilter) pipelinesQuery = pipelinesQuery.eq('company_id', companyFilter);
    const { data: pipelines } = await pipelinesQuery;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const maxDaysBack = Math.max(...FOLLOWUP_TIME_BUCKETS.map((b) => b.daysFrom));
    const globalDateFrom = new Date(today);
    globalDateFrom.setDate(globalDateFrom.getDate() - maxDaysBack);

    const allPipelineIds = (pipelines || []).map((p) => p.id);
    if (!allPipelineIds.length) return res.json({ notifications: [], total: 0 });

    const pipelineMap = Object.fromEntries((pipelines || []).map((p) => [p.id, p]));

    const stagePromises = allPipelineIds.map((pid) =>
      supabase
        .from('crm_pipeline_stages')
        .select('id, name, color, icon, order_index, is_won, is_lost, pipeline_id, pipeline_type')
        .eq('pipeline_id', pid)
        .eq('is_active', true)
        .order('order_index')
    );
    const stageResults = await Promise.all(stagePromises);
    const stageMap = {};
    const openStageIds = [];
    const pipelineTypeMap = {};
    stageResults.forEach((r) => {
      (r.data || []).forEach((s) => {
        stageMap[s.id] = s;
        if (!s.is_won && !s.is_lost) openStageIds.push(s.id);
        if (s.pipeline_type && s.pipeline_id) pipelineTypeMap[s.pipeline_id] = s.pipeline_type;
      });
    });

    if (!openStageIds.length) return res.json({ notifications: [], total: 0 });

    const batchSize = 500;
    let allLeads = [];
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      let q = supabase
        .from('crm_leads')
        .select('id, stage_id, pipeline_id, created_at, type')
        .is('parent_lead_id', null)
        .in('pipeline_id', allPipelineIds)
        .in('stage_id', openStageIds)
        .gte('created_at', globalDateFrom.toISOString().split('T')[0])
        .lte('created_at', `${today.toISOString().split('T')[0]}T23:59:59.999Z`)
        .range(offset, offset + batchSize - 1);

      if (!isAdminUser && !sacId) {
        q = q.or(`assigned_to.eq.${userId},lead_owner_id.eq.${userId}`);
      } else if (companyFilter) {
        q = q.eq('company_id', companyFilter);
      }

      const { data: batch } = await q;
      const rows = batch || [];
      allLeads = allLeads.concat(rows);
      hasMore = rows.length === batchSize;
      offset += batchSize;
    }

    // Lấy danh sách lead user đã đánh dấu "đã chăm sóc" (chưa hết hạn) → loại khỏi count.
    let caredLeadIds = new Set();
    try {
      const { data: marks } = await supabase
        .from('crm_lead_care_marks')
        .select('lead_id')
        .eq('user_id', userId)
        .gt('expires_at', new Date().toISOString());
      caredLeadIds = new Set((marks || []).map((m) => m.lead_id));
    } catch { /* bảng chưa migrate — bỏ qua */ }

    const countsMap = {};
    /** Lưu type chính xác của từng (pipeline_id|stage_id) — lấy từ chính lead, đáng tin cậy hơn cột pipeline_type của stage. */
    const groupTypeMap = {};
    for (const lead of allLeads) {
      if (caredLeadIds.has(lead.id)) continue;
      const createdMs = new Date(lead.created_at).getTime();
      for (const bucket of FOLLOWUP_TIME_BUCKETS) {
        const from = new Date(today);
        from.setDate(from.getDate() - bucket.daysFrom);
        const to = new Date(today);
        to.setDate(to.getDate() - bucket.daysTo);
        to.setHours(23, 59, 59, 999);
        if (createdMs >= from.getTime() && createdMs <= to.getTime()) {
          const key = `${lead.pipeline_id}|${lead.stage_id}|${bucket.key}`;
          countsMap[key] = (countsMap[key] || 0) + 1;
          if (lead.type === 'lead' || lead.type === 'deal') {
            groupTypeMap[`${lead.pipeline_id}|${lead.stage_id}`] = lead.type;
          }
          break;
        }
      }
    }

    const notifications = [];
    for (const [key, count] of Object.entries(countsMap)) {
      const [pipelineId, stageId, timeBucket] = key.split('|');
      const pipeline = pipelineMap[pipelineId];
      const stage = stageMap[stageId];
      if (!pipeline || !stage) continue;

      const dismissKey = `${pipelineId}|${stageId}|${pipeline.company_id || ''}|${timeBucket}`;
      if (dismissedSet.has(dismissKey)) continue;

      const bucketMeta = FOLLOWUP_TIME_BUCKETS.find((b) => b.key === timeBucket);
      const resolvedType =
        groupTypeMap[`${pipelineId}|${stageId}`] ||
        stage.pipeline_type ||
        pipelineTypeMap[pipelineId] ||
        'lead';
      notifications.push({
        pipeline_id: pipelineId,
        pipeline_name: pipeline.name,
        pipeline_type: resolvedType,
        stage_id: stageId,
        stage_name: stage.name,
        stage_color: stage.color,
        stage_icon: stage.icon,
        company_id: pipeline.company_id,
        company_name: pipeline.company?.short_name || pipeline.company?.name || null,
        time_bucket: timeBucket,
        time_label: bucketMeta?.label || timeBucket,
        lead_count: count,
      });
    }

    notifications.sort((a, b) => b.lead_count - a.lead_count);
    res.json({ notifications, total: notifications.length });
  } catch (e) {
    console.error('GET /crm/followup-care/notifications:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

r.post('/followup-care/dismiss', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { pipeline_id, stage_id, company_id, time_bucket } = req.body;
    if (!time_bucket) return res.status(400).json({ error: 'Thiếu time_bucket' });

    const expiresAt = followupDismissExpiresAt();

    const { data, error } = await supabase
      .from('crm_followup_care_dismissals')
      .insert({
        user_id: userId,
        pipeline_id: pipeline_id || null,
        stage_id: stage_id || null,
        company_id: company_id || null,
        time_bucket,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (error) {
      const msg = String(error.message || '');
      if (msg.includes('does not exist') || msg.includes('schema cache')) {
        return res.status(503).json({
          error: 'Bảng crm_followup_care_dismissals chưa tạo. Chạy file database/153_crm_followup_care_dismissals.sql trong Supabase SQL Editor.',
        });
      }
      throw error;
    }
    res.json({ ok: true, dismissal: data });
  } catch (e) {
    console.error('POST /crm/followup-care/dismiss:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

r.post('/followup-care/dismiss-all', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) return res.json({ ok: true, dismissed: 0 });

    const expiresAt = followupDismissExpiresAt().toISOString();
    const rows = items
      .filter((i) => i?.time_bucket)
      .map((i) => ({
        user_id: userId,
        pipeline_id: i.pipeline_id || null,
        stage_id: i.stage_id || null,
        company_id: i.company_id || null,
        time_bucket: i.time_bucket,
        expires_at: expiresAt,
      }));

    if (!rows.length) return res.json({ ok: true, dismissed: 0 });

    const { error } = await supabase.from('crm_followup_care_dismissals').insert(rows);
    if (error) {
      const msg = String(error.message || '');
      if (msg.includes('does not exist') || msg.includes('schema cache')) {
        return res.status(503).json({
          error: 'Bảng crm_followup_care_dismissals chưa tạo. Chạy file database/153_crm_followup_care_dismissals.sql trong Supabase SQL Editor.',
        });
      }
      throw error;
    }
    res.json({ ok: true, dismissed: rows.length });
  } catch (e) {
    console.error('POST /crm/followup-care/dismiss-all:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

r.delete('/followup-care/dismiss', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { pipeline_id, stage_id, company_id, time_bucket } = req.query;
    if (!time_bucket) return res.status(400).json({ error: 'Thiếu time_bucket' });

    let q = supabase
      .from('crm_followup_care_dismissals')
      .delete()
      .eq('user_id', userId)
      .eq('time_bucket', time_bucket);

    if (pipeline_id) q = q.eq('pipeline_id', pipeline_id);
    else q = q.is('pipeline_id', null);
    if (stage_id) q = q.eq('stage_id', stage_id);
    else q = q.is('stage_id', null);
    if (company_id) q = q.eq('company_id', company_id);
    else q = q.is('company_id', null);

    const { error } = await q;
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /crm/followup-care/dismiss:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

r.post('/followup-care/dismiss/undo', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { error, count } = await supabase
      .from('crm_followup_care_dismissals')
      .delete({ count: 'exact' })
      .eq('user_id', userId)
      .gt('expires_at', new Date().toISOString());

    if (error) {
      const msg = String(error.message || '');
      if (msg.includes('does not exist') || msg.includes('schema cache')) {
        return res.json({ ok: true, restored: 0 });
      }
      throw error;
    }
    res.json({ ok: true, restored: count || 0 });
  } catch (e) {
    console.error('POST /crm/followup-care/dismiss/undo:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

r.get('/lead-care-marks', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const ids = String(req.query.lead_ids || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    let q = supabase
      .from('crm_lead_care_marks')
      .select('lead_id, marked_at, expires_at, note')
      .eq('user_id', userId)
      .gt('expires_at', new Date().toISOString());
    if (ids.length) q = q.in('lead_id', ids);

    const { data, error } = await q;
    if (error) {
      // Bảng chưa migrate — trả về rỗng để FE không vỡ
      if (String(error.message || '').toLowerCase().includes('crm_lead_care_marks')) {
        return res.json({ marks: [] });
      }
      throw error;
    }
    res.json({ marks: data || [] });
  } catch (e) {
    console.error('GET /crm/lead-care-marks:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

r.post('/leads/:id/care-mark', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const leadId = req.params.id;
    const note = req.body?.note ? String(req.body.note).trim() || null : null;

    const row = {
      lead_id: leadId,
      user_id: userId,
      marked_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      note,
    };
    const { data, error } = await supabase
      .from('crm_lead_care_marks')
      .upsert(row, { onConflict: 'lead_id,user_id' })
      .select('lead_id, marked_at, expires_at, note')
      .maybeSingle();
    if (error) {
      if (String(error.message || '').toLowerCase().includes('crm_lead_care_marks')) {
        return res.status(503).json({
          error: 'Bảng crm_lead_care_marks chưa được tạo. Hãy chạy migration database/157_crm_lead_care_marks.sql.',
        });
      }
      throw error;
    }
    res.json({ ok: true, mark: data });
  } catch (e) {
    console.error('POST /crm/leads/:id/care-mark:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

r.delete('/leads/:id/care-mark', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const leadId = req.params.id;
    const { error } = await supabase
      .from('crm_lead_care_marks')
      .delete()
      .eq('lead_id', leadId)
      .eq('user_id', userId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /crm/leads/:id/care-mark:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

r.post('/leads/:id/pin', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const chk = await assertCanFlagLead(req, req.params.id);
    if (!chk.ok) return res.status(chk.status).json({ error: chk.error });
    const row = await setLeadFlag(userId, req.params.id, { is_pinned: true });
    res.json({ ok: true, flag: row });
  } catch (e) {
    if (/crm_lead_user_flags/.test(e.message || '')) {
      return res.status(503).json({ error: 'Bảng crm_lead_user_flags chưa được tạo. Chạy database/202_crm_lead_user_flags.sql.' });
    }
    console.error('POST /crm/leads/:id/pin:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

r.delete('/leads/:id/pin', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const chk = await assertCanFlagLead(req, req.params.id);
    if (!chk.ok) return res.status(chk.status).json({ error: chk.error });
    const row = await setLeadFlag(userId, req.params.id, { is_pinned: false });
    res.json({ ok: true, flag: row });
  } catch (e) {
    if (/crm_lead_user_flags/.test(e.message || '')) {
      return res.status(503).json({ error: 'Bảng crm_lead_user_flags chưa được tạo. Chạy database/202_crm_lead_user_flags.sql.' });
    }
    console.error('DELETE /crm/leads/:id/pin:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

r.post('/leads/:id/interacted', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const chk = await assertCanFlagLead(req, req.params.id);
    if (!chk.ok) return res.status(chk.status).json({ error: chk.error });
    const row = await setLeadFlag(userId, req.params.id, { is_interacted: true });
    res.json({ ok: true, flag: row });
  } catch (e) {
    if (/crm_lead_user_flags/.test(e.message || '')) {
      return res.status(503).json({ error: 'Bảng crm_lead_user_flags chưa được tạo. Chạy database/202_crm_lead_user_flags.sql.' });
    }
    console.error('POST /crm/leads/:id/interacted:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

r.delete('/leads/:id/interacted', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const chk = await assertCanFlagLead(req, req.params.id);
    if (!chk.ok) return res.status(chk.status).json({ error: chk.error });
    const row = await setLeadFlag(userId, req.params.id, { is_interacted: false });
    res.json({ ok: true, flag: row });
  } catch (e) {
    if (/crm_lead_user_flags/.test(e.message || '')) {
      return res.status(503).json({ error: 'Bảng crm_lead_user_flags chưa được tạo. Chạy database/202_crm_lead_user_flags.sql.' });
    }
    console.error('DELETE /crm/leads/:id/interacted:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

r.get('/settings/deadline-config', async (req, res) => {
  try {
    const companyId = String(req.query.company_id || req.user?.company_id || '').trim();
    if (!companyId) return res.json(buildDefaultDeadlineConfig(null));
    const { data, error } = await supabase
      .from('crm_company_deadline_config')
      .select('*')
      .eq('company_id', companyId)
      .maybeSingle();
    if (error && !String(error.message || '').toLowerCase().includes('crm_company_deadline_config')) {
      throw error;
    }
    if (!data) return res.json(buildDefaultDeadlineConfig(companyId));
    res.json({
      company_id: data.company_id,
      primary_field: data.primary_field,
      fallback_field: data.fallback_field,
      buckets: { ...DEFAULT_DEADLINE_BUCKETS, ...(data.buckets || {}) },
      updated_at: data.updated_at,
    });
  } catch (e) {
    console.error('GET /crm/settings/deadline-config:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

r.put('/settings/deadline-config', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const body = req.body || {};
    const companyId = String(body.company_id || req.user?.company_id || '').trim();
    if (!companyId) return res.status(400).json({ error: 'company_id bắt buộc' });

    const role = req.user?.role;
    const isSysAdmin = isCrmSystemAdminUser(role);
    const isCompanyAdmin = isCrmCompanyAdminUser(role);
    if (!isSysAdmin && !(isCompanyAdmin && String(req.user?.company_id || '') === companyId)) {
      return res.status(403).json({ error: 'Không có quyền chỉnh cấu hình công ty này' });
    }

    const primary = ALLOWED_DEADLINE_FIELDS.has(body.primary_field) ? body.primary_field : 'crm_next_open_task_deadline';
    let fallback = body.fallback_field;
    if (fallback === '' || fallback === undefined) fallback = null;
    if (fallback != null && !ALLOWED_DEADLINE_FIELDS.has(fallback)) fallback = null;
    if (fallback === primary) fallback = null;

    const incomingBuckets = (body.buckets && typeof body.buckets === 'object') ? body.buckets : {};
    const buckets = {};
    Object.keys(DEFAULT_DEADLINE_BUCKETS).forEach((key) => {
      const def = DEFAULT_DEADLINE_BUCKETS[key];
      const cur = incomingBuckets[key] || {};
      const cfg = {
        enabled: cur.enabled != null ? !!cur.enabled : def.enabled,
        label: typeof cur.label === 'string' && cur.label.trim() ? cur.label.trim() : def.label,
      };
      if (def.days != null) {
        const d = Number(cur.days);
        cfg.days = Number.isFinite(d) && d > 0 ? Math.round(d) : def.days;
      }
      buckets[key] = cfg;
    });

    const payload = {
      company_id: companyId,
      primary_field: primary,
      fallback_field: fallback,
      buckets,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('crm_company_deadline_config')
      .upsert(payload, { onConflict: 'company_id' })
      .select('*')
      .single();
    if (error) {
      if (String(error.message || '').toLowerCase().includes('crm_company_deadline_config')) {
        return res.status(500).json({
          error: 'Bảng crm_company_deadline_config chưa được tạo. Hãy chạy migration database/169_crm_company_deadline_config.sql.',
        });
      }
      throw error;
    }
    invalidateCrmDeadlineSnapshots();
    res.json({
      company_id: data.company_id,
      primary_field: data.primary_field,
      fallback_field: data.fallback_field,
      buckets: { ...DEFAULT_DEADLINE_BUCKETS, ...(data.buckets || {}) },
      updated_at: data.updated_at,
    });
  } catch (e) {
    console.error('PUT /crm/settings/deadline-config:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

r.get('/planner/me', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { data: cols, error: colErr } = await supabase
      .from('crm_user_planner_columns')
      .select('*')
      .eq('user_id', userId)
      .order('position', { ascending: true })
      .order('id', { ascending: true });
    if (colErr) {
      if (plannerTableMissing(colErr)) return res.json({ columns: [], items: [] });
      throw colErr;
    }

    const columnIds = (cols || []).map((c) => c.id);
    let items = [];
    if (columnIds.length) {
      const { data: itemRows, error: itemErr } = await supabase
        .from('crm_user_planner_items')
        .select('id, column_id, lead_id, position, added_at')
        .in('column_id', columnIds)
        .order('position', { ascending: true })
        .order('id', { ascending: true });
      if (itemErr && !plannerTableMissing(itemErr)) throw itemErr;
      items = itemRows || [];
    }

    res.json({ columns: cols || [], items });
  } catch (e) {
    console.error('GET /crm/planner/me:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

r.post('/planner/columns', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Tên cột bắt buộc' });
    const color = req.body?.color || null;
    const companyId = (req.body?.company_id || req.user?.company_id || null) || null;

    const { data: maxRow } = await supabase
      .from('crm_user_planner_columns')
      .select('position')
      .eq('user_id', userId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPos = (maxRow?.position ?? -1) + 1;

    const { data, error } = await supabase
      .from('crm_user_planner_columns')
      .insert({ user_id: userId, company_id: companyId, name, color, position: nextPos })
      .select('*')
      .single();
    if (error) {
      if (plannerTableMissing(error)) {
        return res.status(500).json({
          error: 'Bảng planner chưa được tạo. Hãy chạy migration database/170_crm_user_planner.sql.',
        });
      }
      throw error;
    }
    res.json(data);
  } catch (e) {
    console.error('POST /crm/planner/columns:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

r.patch('/planner/columns/:id', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const id = Number(req.params.id);
    const patch = {};
    if (typeof req.body?.name === 'string' && req.body.name.trim()) patch.name = req.body.name.trim();
    if (req.body?.color !== undefined) patch.color = req.body.color || null;
    if (req.body?.position !== undefined) patch.position = Number(req.body.position) || 0;
    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('crm_user_planner_columns')
      .update(patch)
      .eq('id', id)
      .eq('user_id', userId)
      .select('*')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('PATCH /crm/planner/columns/:id:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

r.delete('/planner/columns/:id', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const id = Number(req.params.id);
    const { error } = await supabase
      .from('crm_user_planner_columns')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /crm/planner/columns/:id:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

r.post('/planner/columns/:id/items', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const columnId = Number(req.params.id);
    const leadIds = Array.isArray(req.body?.lead_ids)
      ? req.body.lead_ids.map((v) => String(v || '').trim()).filter(Boolean)
      : (req.body?.lead_id ? [String(req.body.lead_id).trim()] : []);
    if (!leadIds.length) return res.status(400).json({ error: 'lead_id bắt buộc' });

    const { data: col } = await supabase
      .from('crm_user_planner_columns')
      .select('id')
      .eq('id', columnId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!col) return res.status(404).json({ error: 'Không tìm thấy cột' });

    const { data: maxRow } = await supabase
      .from('crm_user_planner_items')
      .select('position')
      .eq('column_id', columnId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();
    let nextPos = (maxRow?.position ?? -1) + 1;

    const rows = leadIds.map((lid) => ({ column_id: columnId, lead_id: lid, position: nextPos++ }));
    const { data, error } = await supabase
      .from('crm_user_planner_items')
      .upsert(rows, { onConflict: 'column_id,lead_id', ignoreDuplicates: true })
      .select('*');
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('POST /crm/planner/columns/:id/items:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

r.post('/planner/reorder', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) return res.json({ ok: true });

    const { data: myCols } = await supabase
      .from('crm_user_planner_columns')
      .select('id')
      .eq('user_id', userId);
    const allowed = new Set((myCols || []).map((c) => Number(c.id)));

    for (const it of items) {
      const id = Number(it.id);
      const columnId = Number(it.column_id);
      const position = Number(it.position) || 0;
      if (!id || !columnId || !allowed.has(columnId)) continue;
      await supabase
        .from('crm_user_planner_items')
        .update({ column_id: columnId, position })
        .eq('id', id);
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('POST /crm/planner/reorder:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

r.delete('/planner/items/:id', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const id = Number(req.params.id);
    const { data: row } = await supabase
      .from('crm_user_planner_items')
      .select('id, column:crm_user_planner_columns!inner(user_id)')
      .eq('id', id)
      .maybeSingle();
    if (!row || String(row.column?.user_id || '') !== String(userId || '')) {
      return res.status(404).json({ error: 'Không tìm thấy' });
    }
    const { error } = await supabase
      .from('crm_user_planner_items')
      .delete()
      .eq('id', id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /crm/planner/items/:id:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});
}).call(null, helpers["ALLOWED_DEADLINE_FIELDS"], helpers["CRM_COMMENT_ALLOWED_REACTION_EMOJI"], helpers["CRM_LEAD_KANBAN_LITE_SELECT"], helpers["CRM_LEAD_LIST_SELECT"], helpers["CRM_LEAD_LIST_SELECT_BASE"], helpers["CRM_LEAD_LIST_SELECT_EXTRA"], helpers["CRM_LEAD_REGION_EMBED"], helpers["CRM_NEW_LEAD_MAX_AGE_MS"], helpers["CRM_TASK_SELECT"], helpers["CRM_UUID_RE"], helpers["CUSTOMERS_IN_CHUNK"], helpers["CUSTOMERS_OVERVIEW_NO_MATCH_ID"], helpers["DEAL_PRE_CONTRACT_SLUGS_STAFF"], helpers["DEAL_REPORT_BUCKET_VALUES"], helpers["DEFAULT_CHECKLISTS"], helpers["DEFAULT_DEADLINE_BUCKETS"], helpers["DEFAULT_PIPELINE_STAGE_SLA_DAYS"], helpers["FOLLOWUP_TIME_BUCKETS"], helpers["PDFDocument"], helpers["QUOTATIONS_SOURCE_EXCEL_COLS"], helpers["Router"], helpers["SCAN_DUP_LITE_SELECT"], helpers["STAFF_LEAD_DEAL_REPORT_ROLES"], helpers["SURVEY_EVENT_SELECT"], helpers["SURVEY_EVENT_TYPES"], helpers["XLSX"], helpers["ZALO_APP_SETTING_KEY"], helpers["crmSchemaCompat"], helpers["addPhoneToAutoLeadBlocklist"], helpers["aggregateCrmCommentReactions"], helpers["aggregateOrgReportRows"], helpers["appendFulfillmentChildTasksForMasterDeal"], helpers["applyAllActiveWorkshopTemplatesForArea"], helpers["applyAssigneesToInsertedCrmTasks"], helpers["applyCrmLeadRegionFilterToQuery"], helpers["applyCrmTaskTemplatesToCompanyRegions"], helpers["applyCustomerIdInFilter"], helpers["applyCustomersOverviewSearch"], helpers["applyDefaultWorkshopTemplatesForNewProject"], helpers["applyLeadOrCustomerSalesFilter"], helpers["applyProductionTemplateToFulfillmentLead"], helpers["applyProductionTemplatesOnPipelineEnter"], helpers["applyStageIdFilterToQuery"], helpers["applyWorkshopTemplateToProject"], helpers["artifactNamePrefix"], helpers["assertCanFlagLead"], helpers["assertCategoryFitsSource"], helpers["assertCrmAssigneeUserMatchesLeadCompany"], helpers["assertCrmEmployeeDeleteAllowed"], helpers["assertCrmStageAdvanceAllowed"], helpers["assertDealCrmManualStageChange"], helpers["assertDealResponsible"], helpers["assertDivisionAllowedForCompany"], helpers["assertLeadDocumentOwner"], helpers["assertLeadReadableByRegionScope"], helpers["assertRegionBelongsToCompany"], helpers["assertUserCanAssignCrmRegion"], helpers["assignProductionCompanyDealResponsibility"], helpers["attachAssigneesToCrmTasks"], helpers["attachAssignmentIdsToCrmTasks"], helpers["attachCrmNextOpenTaskDeadline"], helpers["attachLeadNewFlagForList"], helpers["attachLeadReplyParents"], helpers["attachLeadUserFlagsForList"], helpers["auth"], helpers["autoCreateProjectFromWonDeal"], helpers["autoFlowFns"], helpers["autoGenCrmTasksForNewLead"], helpers["buildAssignmentNotificationInsert"], helpers["buildChecklistLeadDocumentRow"], helpers["buildCrmDashboardMinimalKpis"], helpers["buildCrmLeadsRpcFilterParams"], helpers["buildCustomersOverviewSummary"], helpers["buildDealTemplateData"], helpers["buildDefaultDeadlineConfig"], helpers["buildFirstStageIdByPipeline"], helpers["buildPipelineStagesMap"], helpers["buildProcessedCommercialItems"], helpers["buildQuotedStageOrderByPipeline"], helpers["buildScanDuplicateGroups"], helpers["buildWonStageOrderByPipeline"], helpers["canUserViewDocByAllowlist"], helpers["chatUpload"], helpers["chunkArray"], helpers["classifyDealStageForStaffReport"], helpers["commentsTableMissing"], helpers["companyRegionExtraColumnsMissing"], helpers["companyRegionGeoColumnsMissing"], helpers["computeCrmDashboardLightStats"], helpers["computeCrmLiveVersionMs"], helpers["computeCustomersOverviewSummary"], helpers["computeIsNewLeadForUser"], helpers["computeOrgOverviewReportData"], helpers["computeStaffLeadDealReportData"], helpers["computeStaffPipelineDetailPayload"], helpers["countOpenOverdueCrmTasksForLeadIds"], helpers["createCrmAssignment"], helpers["createCrmLeadTask"], helpers["createFulfillmentChildDeal"], helpers["createNotif"], helpers["createNotification"], helpers["createProjectFromLead"], helpers["crmExecutorFieldsFromTemplateItem"], helpers["crmLeadCommentAttachmentsColumnMissing"], helpers["crmLeadCommentReadReceiptsTableMissing"], helpers["crmLeadRowVisibleToRequestUser"], helpers["crmListUsesLegacyFilters"], helpers["crmNoteActivityUpload"], helpers["crmReportAsOfMs"], helpers["crmReportCreatedAtFromIso"], helpers["crmReportCreatedAtToIso"], helpers["crmReportDayKeyVn"], helpers["crmRouteErrorText"], helpers["crmTaskDeadlineModuleKey"], helpers["crmTaskMeetsCompletionRequirements"], helpers["crmTaskMeetsRequiredFileTypes"], helpers["crmTaskRequiresCompletionEvidence"], helpers["crmTemplateMatchesLeadType"], helpers["deadlineToDateOnlyIso"], helpers["defaultCompanyInfo"], helpers["defaultKpiLedgerMonthStartYmd"], helpers["deleteCrmLeadTask"], helpers["deleteMirroredAssignmentFileForTaskAttachment"], helpers["duplicateLeadIdsFromLiteRows"], helpers["ecosystemModuleKeyForCrmDeadline"], helpers["effectivePipelineStageSlaDays"], helpers["emitCrmBadgeUpdateForProject"], helpers["emitCrmDashboardChanged"], helpers["emitCrmTaskChanged"], helpers["emptyStaffLeadDealAgg"], helpers["endOfCalendarDayAfterEntered"], helpers["enforceCommercialDocCompanyOnWrite"], helpers["enforceQuotaForRequest"], helpers["ensureDealLeadDocumentsForModuleTransition"], helpers["ensureDefaultCrmPipelineForCompany"], helpers["ensureMissingCrmTasksForLead"], helpers["ensureMissingCrmTasksForPipelineStage"], helpers["ensureMissingSxTasksForLead"], helpers["excelUpload"], helpers["executeLeadMerge"], helpers["executeZaloDealStageNotify"], helpers["fetchActivityCustomerIds"], helpers["fetchAllLeadsForSlaWatchlist"], helpers["fetchAssignmentForTask"], helpers["fetchCrmCommentReactionsAggregate"], helpers["fetchCrmLeadCommentNotifyUserIds"], helpers["fetchCrmLeadDetailRow"], helpers["fetchCrmLeadWithPipelineBadges"], helpers["fetchCrmLeadsByIdsOrdered"], helpers["fetchCrmLeadsForDashboardBatched"], helpers["fetchCrmLeadsForOrgReportBatched"], helpers["fetchCrmLeadsForUserDetailBatched"], helpers["fetchCrmLeadsLiteForDuplicateScan"], helpers["fetchCrmLeadsPageViaRpc"], helpers["fetchCrmPipelineZaloSlice"], helpers["fetchCrmSurveyEventsChunk"], helpers["fetchCrmSurveyVisitsForOrgReport"], helpers["fetchLeadCommentAudienceMembers"], helpers["fetchLeadCommentAudienceMembersForRead"], helpers["fetchLeadIdsForCrmRegion"], helpers["fetchLeadMentionMembers"], helpers["fetchOrgActivityFeed"], helpers["fetchPipelineWithStagesById"], helpers["fetchScopedCrmBundles"], helpers["fillTemplateDataFromStructure"], helpers["filterCrmTasksForLeadType"], helpers["filterUserIdsForCrmLeadScopedNotification"], helpers["findChecklistItem"], helpers["followupDismissExpiresAt"], helpers["fontBold"], helpers["fontRegular"], helpers["formatMoney"], helpers["formatVNDPdf"], helpers["formatVnPhoneLocal0From84"], helpers["fs"], helpers["generateDocPdf"], helpers["generateFlowTasks"], helpers["generateStepTasks"], helpers["getAppSettingValue"], helpers["getCompanyInfo"], helpers["getCompanyRegionsList"], helpers["getCrmLeadListSelect"], helpers["getCrmLeadRegionConstraint"], helpers["getCrmLeadTypesList"], helpers["getCrmLeadsListLegacy"], helpers["getCrmSourceCategoriesList"], helpers["getCrmSourcesList"], helpers["getDefaultCrmAttachmentShare"], helpers["getDefaultDealZaloTemplateStructure"], helpers["getDefaultLeadDocumentShareForDeal"], helpers["getDefaultPipelineIdForCompany"], helpers["getLeadDocumentFieldsFromCrmTask"], helpers["getNotifyTargets"], helpers["getOverdueFollowUps"], helpers["getPipelineIdForCompanyRegion"], helpers["getPipelineZaloSlice"], helpers["getPipelinesList"], helpers["getProjectCRMSummary"], helpers["getStagesByPipelineId"], helpers["getStaleLeads"], helpers["getZaloNotifySettings"], helpers["hydrateCrmLeadsByIdsWithStaff"], helpers["hydrateCrmLeadsRpcPage"], helpers["hydrateScanDuplicateLeads"], helpers["insertQuotationRow"], helpers["invalidateAppSettingKey"], helpers["invalidatePipelinesAndStages"], helpers["invalidateRegions"], helpers["invalidateSources"], helpers["invalidateTenantUsageCache"], helpers["invokeCrmLeadsStageCountsRpc"], helpers["isAdminLike"], helpers["isAllowedLeadCommentAttachmentUrl"], helpers["isChotSanXuatCrmTaskTitle"], helpers["isCrmCompanyAdminUser"], helpers["isCrmDealAssigneeLocked"], helpers["isCrmLeadTypeColorMissingError"], helpers["isCrmModuleAdmin"], helpers["isCrmPipelinesTableMissingError"], helpers["isCrmRegionAdminUser"], helpers["isCrmSystemAdminUser"], helpers["isDealStageHoanThanhForZalo"], helpers["isDefaultAssigneeIdsColumnError"], helpers["isExecutorColumnError"], helpers["isPlatformAdmin"], helpers["isPostgresUniqueViolation"], helpers["isQuotationsSourceExcelColumnMissingError"], helpers["isSxRelationshipError"], helpers["isSystemAdmin"], helpers["isUuidString"], helpers["isValidDealZaloTemplateStructure"], helpers["isVcRelationshipError"], helpers["isVptCompanyCommercialDocViewer"], helpers["lastNominatimGeocodeAt"], helpers["leadChatFilesMulter"], helpers["leadChatJsonOrFiles"], helpers["listQuotationExcelSheets"], helpers["loadCrmTaskAttachmentCountMap"], helpers["loadOrgReportStageMap"], helpers["loadZaloLinkedLeadIdSet"], helpers["logDealActivityComment"], helpers["logDealDeadlineChangeComment"], helpers["logDealStageChangeComment"], helpers["logKanbanDeadlineUnifiedHistory"], helpers["logLeadCommentMentionActivity"], helpers["logProjectFileActivity"], helpers["mapCustomerOverviewRow"], helpers["mapLeadDisplayPhone"], helpers["mapQuotationItemsToOrderRows"], helpers["maskCustomerPhoneDisplay"], helpers["maskZaloAccessTokenPreview"], helpers["maybeSendZaloOnDealStageEnter"], helpers["mergeCrmStageDefaultAssigneeIntoUpdates"], helpers["mergeCustomerIntoTarget"], helpers["misaService"], helpers["multer"], helpers["nextCode"], helpers["nextTbProjectCode"], helpers["normalizeCrmActivityAttachments"], helpers["normalizeCrmLeadCommentAttachments"], helpers["normalizeCrmStageDefaultAssigneeUserId"], helpers["normalizeCrmUserRole"], helpers["normalizeLeadSeenByKeys"], helpers["normalizeOrgReportSurveyVisitRow"], helpers["normalizePipelineStageSlaDaysForDb"], helpers["normalizePipelineStagesList"], helpers["normalizeRegionIdList"], helpers["normalizeTemplateChecklistForCrmTask"], helpers["normalizeTemplateItemAssigneeIds"], helpers["normalizeTimestamp"], helpers["normalizeTitleFold"], helpers["normalizeVnPhoneTo84"], helpers["notifyDealCommentMentions"], helpers["notifyDealCommentParticipants"], helpers["notifyMultiple"], helpers["notifyMultipleShared"], helpers["notifyNewCrmAssignmentAssignees"], helpers["notifyProductionDocumentUploaded"], helpers["onLeadWon"], helpers["onOrderConfirmed"], helpers["onProjectCompleted"], helpers["onQuotationAccepted"], helpers["orgReportAttachFirstStageRates"], helpers["orgReportBumpFirstStageMetrics"], helpers["orgReportBumpMetrics"], helpers["orgReportBumpOpenOverdue"], helpers["orgReportBumpReceptionMetrics"], helpers["orgReportCancelRatePct"], helpers["orgReportClosedWonDealCount"], helpers["orgReportClosedWonValue"], helpers["orgReportCompareSummary"], helpers["orgReportConversionRate"], helpers["orgReportDayKey"], helpers["orgReportDealCloseValueRatePct"], helpers["orgReportDealCountsExpected"], helpers["orgReportDealIsClosedWon"], helpers["orgReportDealIsCompleted"], helpers["orgReportDealIsQuotedOrAfter"], helpers["orgReportDealProbability"], helpers["orgReportDealSplitBuckets"], helpers["orgReportExtendedDealMetrics"], helpers["orgReportFirstStageOnTimeRatePct"], helpers["orgReportFirstStageOverdueRatePct"], helpers["orgReportIsReceptionOverdue"], helpers["orgReportIsSlaOverdue"], helpers["orgReportKpiPeriodStart"], helpers["orgReportNumEst"], helpers["orgReportOverdueRatePct"], helpers["orgReportOwnerId"], helpers["orgReportPctDelta"], helpers["orgReportPreviousPeriod"], helpers["orgReportQuoteValueCloseRatePct"], helpers["orgReportQuoteWinRatePct"], helpers["orgReportReceptionOverdueRatePct"], helpers["orgReportReceptionSlaMinutes"], helpers["orgReportStageIsClosed"], helpers["orgReportStageIsLostOrCancelled"], helpers["orgReportTotalDealCount"], helpers["parseChecklist"], helpers["parseCrmLeadsPageRpc"], helpers["parseCrmReportDateRange"], helpers["parseCrmStageCountsNumericMap"], helpers["parseCrmStageCountsRpc"], helpers["parseExcelMoneyFromMappedColumn"], helpers["parseLeadIdUuidList"], helpers["parseLeadIdsCsvQuery"], helpers["parseLeadIdsFromBody"], helpers["parseLeadSeenByRaw"], helpers["parseQuotationExcelBuffer"], helpers["parseStageIdsFromQuery"], helpers["parseUuidArrayJsonb"], helpers["parseVietnameseMeasure"], helpers["parseVietnameseMoney"], helpers["path"], helpers["persistAssignmentNotification"], helpers["pgCrmDuplicateLeadIds"], helpers["pickDealZaloTemplatePayload"], helpers["pipeOrgOverviewReportPdf"], helpers["pipeStaffLeadDealSummaryPdf"], helpers["pipeStaffPipelineDetailPdf"], helpers["pipelineHasExplicitCompleted"], helpers["pipelineHasExplicitExpected"], helpers["pipelineHasExplicitWon"], helpers["plannerTableMissing"], helpers["postCrmStageDefaultAssigneeComment"], helpers["primaryTemplateItemAssigneeId"], helpers["rcInvalidateTags"], helpers["reactionsTableMissing"], helpers["redactCrmTaskNotesForViewer"], helpers["regionGeocodeInflight"], helpers["repairCrmDealPipelineDisplay"], helpers["requireUserCompanyId"], helpers["requireUserCompanyIdResolved"], helpers["resolveAssignmentIdForTask"], helpers["resolveCanonicalCrmLeadId"], helpers["resolveCommercialDocListCompanyScope"], helpers["resolveCrmBundleTemplateScope"], helpers["resolveCrmLeadsDeadlinesMap"], helpers["resolveCrmLeadsKanbanLite"], helpers["resolveCrmLeadsMergedQuery"], helpers["resolveCrmLeadsSkipDeadline"], helpers["resolveCrmLedgerNetByLeadIdsPayload"], helpers["resolveCrmReportScope"], helpers["resolveCrmTaskWriteLeadId"], helpers["resolveExecutorCompanyId"], helpers["resolveKanbanStagesForCompany"], helpers["resolveLeadCommentMentionIds"], helpers["resolveProductionCompanyForDealStage"], helpers["resolveProductionHandoverResponsibleUserId"], helpers["resolveReopenTargetStageId"], helpers["resolveRpcRegionIdsForCrmList"], helpers["resolveTenantIdForQuota"], helpers["resolveZaloDealTemplateId"], helpers["respondIfCrmPipelinesTableMissing"], helpers["responseCache"], helpers["restoreCrmTaskChecklistFromWorkshopTemplate"], helpers["resyncCrmPipelineTasksForLead"], helpers["sanitizeIsoDateQueryParam"], helpers["scheduleRegionGeocoding"], helpers["scopedAdminCompanyId"], helpers["scopedCrmCompanyIdForWrite"], helpers["sendZaloTemplateMessage"], helpers["setLeadFlag"], helpers["shallowMergeTemplateData"], helpers["skipSxWorkQuickComplete"], helpers["snapshotOrderRowFromQuotation"], helpers["stripCrmAssigneeFromWonStageUpdates"], helpers["stripCrmLeadTypeColorFromSelect"], helpers["stripQuotationsSourceExcelFields"], helpers["sumCrmKpiLedgerNetByLeadIds"], helpers["sumCrmKpiLedgerNetByUserForOrgReport"], helpers["sumCrmKpiLedgerNetByUserIds"], helpers["sumCrmKpiLedgerNetByUserIdsInDateRange"], helpers["supabase"], helpers["syncAllTaskArtifactsToAssignment"], helpers["syncChecklistItemNotes"], helpers["syncCrmLeadSxPipelineFromProject"], helpers["syncQuotationDepositToDealAndProject"], helpers["syncSxKanbanFromCrmProductionStage"], helpers["syncTaskAttachmentToAssignment"], helpers["templateItemAssigneePatch"], helpers["toCrmTaskChecklist"], helpers["unifyCrmLeadResponsibleFields"], helpers["updateCrmLeadTask"], helpers["updateQuotationRow"], helpers["upsertZaloNotifySettings"], helpers["userCanAccessCrmLeadAsParticipant"], helpers["userCanAccessCrmLeadViaVisibility"], helpers["userCanAssignAnyCrmRegion"], helpers["userCanBypassCrmDeleteRestriction"], helpers["userHasSeenLeadInSeenBy"], helpers["userIsAdmin"], helpers["userIsCrmCompanyOrRegionAdmin"], helpers["userMayAccessQuotationRow"], helpers["userSeesAllCrmDeals"], helpers["userSeesAllCrmDealsForScope"], helpers["userSeesAllCrmLeads"], helpers["userSeesAllCrmLeadsForScope"], helpers["uuidQueryOrNull"], helpers["validateProductionCompanyId"]);

module.exports = r;
