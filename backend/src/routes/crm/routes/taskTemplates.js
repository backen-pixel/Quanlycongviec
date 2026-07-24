/**
 * CRM routes: taskTemplates
 * Auto-extracted — handlers close over shared helpers via IIFE.
 */
const { Router } = require('express');
const helpers = require('../shared/helpersBundle');

const r = Router();

(function (ALLOWED_DEADLINE_FIELDS, CRM_COMMENT_ALLOWED_REACTION_EMOJI, CRM_LEAD_KANBAN_LITE_SELECT, CRM_LEAD_LIST_SELECT, CRM_LEAD_LIST_SELECT_BASE, CRM_LEAD_LIST_SELECT_EXTRA, CRM_LEAD_REGION_EMBED, CRM_NEW_LEAD_MAX_AGE_MS, CRM_TASK_SELECT, CRM_UUID_RE, CUSTOMERS_IN_CHUNK, CUSTOMERS_OVERVIEW_NO_MATCH_ID, DEAL_PRE_CONTRACT_SLUGS_STAFF, DEAL_REPORT_BUCKET_VALUES, DEFAULT_CHECKLISTS, DEFAULT_DEADLINE_BUCKETS, DEFAULT_PIPELINE_STAGE_SLA_DAYS, FOLLOWUP_TIME_BUCKETS, PDFDocument, QUOTATIONS_SOURCE_EXCEL_COLS, Router, SCAN_DUP_LITE_SELECT, STAFF_LEAD_DEAL_REPORT_ROLES, SURVEY_EVENT_SELECT, SURVEY_EVENT_TYPES, XLSX, ZALO_APP_SETTING_KEY, crmSchemaCompat, addPhoneToAutoLeadBlocklist, aggregateCrmCommentReactions, aggregateOrgReportRows, appendFulfillmentChildTasksForMasterDeal, applyAllActiveWorkshopTemplatesForArea, applyAssigneesToInsertedCrmTasks, applyCrmLeadRegionFilterToQuery, applyCrmTaskTemplatesToCompanyRegions, applyCustomerIdInFilter, applyCustomersOverviewSearch, applyDefaultWorkshopTemplatesForNewProject, applyLeadOrCustomerSalesFilter, applyProductionTemplateToFulfillmentLead, applyProductionTemplatesOnPipelineEnter, applyStageIdFilterToQuery, applyWorkshopTemplateToProject, artifactNamePrefix, assertCanFlagLead, assertCategoryFitsSource, assertCrmAssigneeUserMatchesLeadCompany, assertCrmEmployeeDeleteAllowed, assertCrmStageAdvanceAllowed, assertDealCrmManualStageChange, assertDealResponsible, assertDivisionAllowedForCompany, assertLeadDocumentOwner, assertLeadReadableByRegionScope, assertRegionBelongsToCompany, assertUserCanAssignCrmRegion, assignProductionCompanyDealResponsibility, attachAssigneesToCrmTasks, attachAssignmentIdsToCrmTasks, attachCrmNextOpenTaskDeadline, attachLeadNewFlagForList, attachLeadReplyParents, attachLeadUserFlagsForList, auth, autoCreateProjectFromWonDeal, autoFlowFns, autoGenCrmTasksForNewLead, buildAssignmentNotificationInsert, buildChecklistLeadDocumentRow, buildCrmDashboardMinimalKpis, buildCrmLeadsRpcFilterParams, buildCustomersOverviewSummary, buildDealTemplateData, buildDefaultDeadlineConfig, buildFirstStageIdByPipeline, buildPipelineStagesMap, buildProcessedCommercialItems, buildQuotedStageOrderByPipeline, buildScanDuplicateGroups, buildWonStageOrderByPipeline, canUserViewDocByAllowlist, chatUpload, chunkArray, classifyDealStageForStaffReport, commentsTableMissing, companyRegionExtraColumnsMissing, companyRegionGeoColumnsMissing, computeCrmDashboardLightStats, computeCrmLiveVersionMs, computeCustomersOverviewSummary, computeIsNewLeadForUser, computeOrgOverviewReportData, computeStaffLeadDealReportData, computeStaffPipelineDetailPayload, countOpenOverdueCrmTasksForLeadIds, createCrmAssignment, createCrmLeadTask, createFulfillmentChildDeal, createNotif, createNotification, createProjectFromLead, crmExecutorFieldsFromTemplateItem, crmLeadCommentAttachmentsColumnMissing, crmLeadCommentReadReceiptsTableMissing, crmLeadRowVisibleToRequestUser, crmListUsesLegacyFilters, crmNoteActivityUpload, crmReportAsOfMs, crmReportCreatedAtFromIso, crmReportCreatedAtToIso, crmReportDayKeyVn, crmRouteErrorText, crmTaskDeadlineModuleKey, crmTaskMeetsCompletionRequirements, crmTaskMeetsRequiredFileTypes, crmTaskRequiresCompletionEvidence, crmTemplateMatchesLeadType, deadlineToDateOnlyIso, defaultCompanyInfo, defaultKpiLedgerMonthStartYmd, deleteCrmLeadTask, deleteMirroredAssignmentFileForTaskAttachment, duplicateLeadIdsFromLiteRows, ecosystemModuleKeyForCrmDeadline, effectivePipelineStageSlaDays, emitCrmBadgeUpdateForProject, emitCrmDashboardChanged, emitCrmTaskChanged, emptyStaffLeadDealAgg, endOfCalendarDayAfterEntered, enforceCommercialDocCompanyOnWrite, enforceQuotaForRequest, ensureDealLeadDocumentsForModuleTransition, ensureDefaultCrmPipelineForCompany, ensureMissingCrmTasksForLead, ensureMissingCrmTasksForPipelineStage, ensureMissingSxTasksForLead, excelUpload, executeLeadMerge, executeZaloDealStageNotify, fetchActivityCustomerIds, fetchAllLeadsForSlaWatchlist, fetchAssignmentForTask, fetchCrmCommentReactionsAggregate, fetchCrmLeadCommentNotifyUserIds, fetchCrmLeadDetailRow, fetchCrmLeadWithPipelineBadges, fetchCrmLeadsByIdsOrdered, fetchCrmLeadsForDashboardBatched, fetchCrmLeadsForOrgReportBatched, fetchCrmLeadsForUserDetailBatched, fetchCrmLeadsLiteForDuplicateScan, fetchCrmLeadsPageViaRpc, fetchCrmPipelineZaloSlice, fetchCrmSurveyEventsChunk, fetchCrmSurveyVisitsForOrgReport, fetchLeadCommentAudienceMembers, fetchLeadCommentAudienceMembersForRead, fetchLeadIdsForCrmRegion, fetchLeadMentionMembers, fetchOrgActivityFeed, fetchPipelineWithStagesById, fetchScopedCrmBundles, fillTemplateDataFromStructure, filterCrmTasksForLeadType, filterUserIdsForCrmLeadScopedNotification, findChecklistItem, followupDismissExpiresAt, fontBold, fontRegular, formatMoney, formatVNDPdf, formatVnPhoneLocal0From84, fs, generateDocPdf, generateFlowTasks, generateStepTasks, getAppSettingValue, getCompanyInfo, getCompanyRegionsList, getCrmLeadListSelect, getCrmLeadRegionConstraint, getCrmLeadTypesList, getCrmLeadsListLegacy, getCrmSourceCategoriesList, getCrmSourcesList, getDefaultCrmAttachmentShare, getDefaultDealZaloTemplateStructure, getDefaultLeadDocumentShareForDeal, getDefaultPipelineIdForCompany, getLeadDocumentFieldsFromCrmTask, getNotifyTargets, getOverdueFollowUps, getPipelineIdForCompanyRegion, getPipelineZaloSlice, getPipelinesList, getProjectCRMSummary, getStagesByPipelineId, getStaleLeads, getZaloNotifySettings, hydrateCrmLeadsByIdsWithStaff, hydrateCrmLeadsRpcPage, hydrateScanDuplicateLeads, insertQuotationRow, invalidateAppSettingKey, invalidatePipelinesAndStages, invalidateRegions, invalidateSources, invalidateTenantUsageCache, invokeCrmLeadsStageCountsRpc, isAdminLike, isAllowedLeadCommentAttachmentUrl, isChotSanXuatCrmTaskTitle, isCrmCompanyAdminUser, isCrmDealAssigneeLocked, isCrmLeadTypeColorMissingError, isCrmModuleAdmin, isCrmPipelinesTableMissingError, isCrmRegionAdminUser, isCrmSystemAdminUser, isDealStageHoanThanhForZalo, isDefaultAssigneeIdsColumnError, isExecutorColumnError, isPlatformAdmin, isPostgresUniqueViolation, isQuotationsSourceExcelColumnMissingError, isSxRelationshipError, isSystemAdmin, isUuidString, isValidDealZaloTemplateStructure, isVcRelationshipError, isVptCompanyCommercialDocViewer, lastNominatimGeocodeAt, leadChatFilesMulter, leadChatJsonOrFiles, listQuotationExcelSheets, loadCrmTaskAttachmentCountMap, loadOrgReportStageMap, loadZaloLinkedLeadIdSet, logDealActivityComment, logDealDeadlineChangeComment, logDealStageChangeComment, logKanbanDeadlineUnifiedHistory, logLeadCommentMentionActivity, logProjectFileActivity, mapCustomerOverviewRow, mapLeadDisplayPhone, mapQuotationItemsToOrderRows, maskCustomerPhoneDisplay, maskZaloAccessTokenPreview, maybeSendZaloOnDealStageEnter, mergeCrmStageDefaultAssigneeIntoUpdates, mergeCustomerIntoTarget, misaService, multer, nextCode, nextTbProjectCode, normalizeCrmActivityAttachments, normalizeCrmLeadCommentAttachments, normalizeCrmStageDefaultAssigneeUserId, normalizeCrmUserRole, normalizeLeadSeenByKeys, normalizeOrgReportSurveyVisitRow, normalizePipelineStageSlaDaysForDb, normalizePipelineStagesList, normalizeRegionIdList, normalizeTemplateChecklistForCrmTask, normalizeTemplateItemAssigneeIds, normalizeTimestamp, normalizeTitleFold, normalizeVnPhoneTo84, notifyDealCommentMentions, notifyDealCommentParticipants, notifyMultiple, notifyMultipleShared, notifyNewCrmAssignmentAssignees, notifyProductionDocumentUploaded, onLeadWon, onOrderConfirmed, onProjectCompleted, onQuotationAccepted, orgReportAttachFirstStageRates, orgReportBumpFirstStageMetrics, orgReportBumpMetrics, orgReportBumpOpenOverdue, orgReportBumpReceptionMetrics, orgReportCancelRatePct, orgReportClosedWonDealCount, orgReportClosedWonValue, orgReportCompareSummary, orgReportConversionRate, orgReportDayKey, orgReportDealCloseValueRatePct, orgReportDealCountsExpected, orgReportDealIsClosedWon, orgReportDealIsCompleted, orgReportDealIsQuotedOrAfter, orgReportDealProbability, orgReportDealSplitBuckets, orgReportExtendedDealMetrics, orgReportFirstStageOnTimeRatePct, orgReportFirstStageOverdueRatePct, orgReportIsReceptionOverdue, orgReportIsSlaOverdue, orgReportKpiPeriodStart, orgReportNumEst, orgReportOverdueRatePct, orgReportOwnerId, orgReportPctDelta, orgReportPreviousPeriod, orgReportQuoteValueCloseRatePct, orgReportQuoteWinRatePct, orgReportReceptionOverdueRatePct, orgReportReceptionSlaMinutes, orgReportStageIsClosed, orgReportStageIsLostOrCancelled, orgReportTotalDealCount, parseChecklist, parseCrmLeadsPageRpc, parseCrmReportDateRange, parseCrmStageCountsNumericMap, parseCrmStageCountsRpc, parseExcelMoneyFromMappedColumn, parseLeadIdUuidList, parseLeadIdsCsvQuery, parseLeadIdsFromBody, parseLeadSeenByRaw, parseQuotationExcelBuffer, parseStageIdsFromQuery, parseUuidArrayJsonb, parseVietnameseMeasure, parseVietnameseMoney, path, persistAssignmentNotification, pgCrmDuplicateLeadIds, pickDealZaloTemplatePayload, pipeOrgOverviewReportPdf, pipeStaffLeadDealSummaryPdf, pipeStaffPipelineDetailPdf, pipelineHasExplicitCompleted, pipelineHasExplicitExpected, pipelineHasExplicitWon, plannerTableMissing, postCrmStageDefaultAssigneeComment, primaryTemplateItemAssigneeId, rcInvalidateTags, reactionsTableMissing, redactCrmTaskNotesForViewer, regionGeocodeInflight, repairCrmDealPipelineDisplay, requireUserCompanyId, requireUserCompanyIdResolved, resolveAssignmentIdForTask, resolveCanonicalCrmLeadId, resolveCommercialDocListCompanyScope, resolveCrmBundleTemplateScope, resolveCrmLeadsDeadlinesMap, resolveCrmLeadsKanbanLite, resolveCrmLeadsMergedQuery, resolveCrmLeadsSkipDeadline, resolveCrmLedgerNetByLeadIdsPayload, resolveCrmReportScope, resolveCrmTaskWriteLeadId, resolveExecutorCompanyId, resolveKanbanStagesForCompany, resolveLeadCommentMentionIds, resolveProductionCompanyForDealStage, resolveProductionHandoverResponsibleUserId, resolveReopenTargetStageId, resolveRpcRegionIdsForCrmList, resolveTenantIdForQuota, resolveZaloDealTemplateId, respondIfCrmPipelinesTableMissing, responseCache, restoreCrmTaskChecklistFromWorkshopTemplate, resyncCrmPipelineTasksForLead, sanitizeIsoDateQueryParam, scheduleRegionGeocoding, scopedAdminCompanyId, scopedCrmCompanyIdForWrite, sendZaloTemplateMessage, setLeadFlag, shallowMergeTemplateData, skipSxWorkQuickComplete, snapshotOrderRowFromQuotation, stripCrmAssigneeFromWonStageUpdates, stripCrmLeadTypeColorFromSelect, stripQuotationsSourceExcelFields, sumCrmKpiLedgerNetByLeadIds, sumCrmKpiLedgerNetByUserForOrgReport, sumCrmKpiLedgerNetByUserIds, sumCrmKpiLedgerNetByUserIdsInDateRange, supabase, syncAllTaskArtifactsToAssignment, syncChecklistItemNotes, syncCrmLeadSxPipelineFromProject, syncQuotationDepositToDealAndProject, syncSxKanbanFromCrmProductionStage, syncTaskAttachmentToAssignment, templateItemAssigneePatch, toCrmTaskChecklist, unifyCrmLeadResponsibleFields, updateCrmLeadTask, updateQuotationRow, upsertZaloNotifySettings, userCanAccessCrmLeadAsParticipant, userCanAccessCrmLeadViaVisibility, userCanAssignAnyCrmRegion, userCanBypassCrmDeleteRestriction, userHasSeenLeadInSeenBy, userIsAdmin, userIsCrmCompanyOrRegionAdmin, userMayAccessQuotationRow, userSeesAllCrmDeals, userSeesAllCrmDealsForScope, userSeesAllCrmLeads, userSeesAllCrmLeadsForScope, uuidQueryOrNull, validateProductionCompanyId) {
r.get('/tasks/overview', async (req, res) => {
  try {
    let effectiveCompanyId = null;
    if (!isSystemAdmin(req.user)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      effectiveCompanyId = cid;
    } else {
      const q = req.query.company_id;
      effectiveCompanyId = q && String(q).trim() ? String(q).trim() : null;
    }

    let leadIds = null;
    if (effectiveCompanyId) {
      const { data: leads, error: leErr } = await supabase.from('crm_leads').select('id').eq('company_id', effectiveCompanyId);
      if (leErr) throw leErr;
      leadIds = (leads || []).map((x) => x.id);
      if (!leadIds.length) return res.json([]);
    }

    const { status, assignee_id, stage_slug, type } = req.query;
    const taskScope = String(req.query?.task_scope || 'all').toLowerCase();
    let q = supabase.from('crm_tasks')
      .select('*, lead:crm_leads(id,title,code,type,project_id,customer:customers(id,full_name)), assignee:users!crm_tasks_assignee_id_fkey(id,full_name,avatar), supervisor:users!crm_tasks_supervisor_id_fkey(id,full_name,avatar)')
      .order('deadline', { ascending: true, nullsFirst: false });
    if (leadIds?.length) q = q.in('lead_id', leadIds);
    if (status) q = q.eq('status', status);
    if (assignee_id) q = q.eq('assignee_id', assignee_id);
    if (stage_slug) q = q.eq('stage_slug', stage_slug);

    const { applyCrmTasksListAccessScope } = require('../../../helpers/crmTaskOverviewScope');
    const scoped = await applyCrmTasksListAccessScope(q, supabase, req, { companyId: effectiveCompanyId });
    if (scoped.empty) return res.json([]);
    q = scoped.q;

    const { data, error } = await q;
    if (error) throw error;
    let rows = data || [];
    if (type) rows = rows.filter((t) => (t.lead?.type || '') === type);
    if (taskScope === 'production') {
      rows = rows.filter((t) => String(t.stage_slug || '').startsWith('sx_') || t.production_pipeline_stage_id);
    } else if (taskScope === 'logistics') {
      const vcRows = rows.filter((t) => {
        const slug = String(t.stage_slug || '');
        if (slug.startsWith('vc_')) return true;
        const meta = t.metadata && typeof t.metadata === 'object' ? t.metadata : {};
        return meta.workshop_module === 'logistics' || meta.workshop_area === 'logistics';
      });
      // Chưa có task vc_* → ẩn sx_* (khớp tab VC)
      rows = vcRows.length ? vcRows : rows.filter((t) => !String(t.stage_slug || '').startsWith('sx_'));
    } else if (taskScope === 'crm') {
      rows = rows.filter((t) => !String(t.stage_slug || '').startsWith('sx_'));
    }
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/tasks/planner', async (req, res) => {
  try {
    let effectiveCompanyId = null;
    if (!isSystemAdmin(req.user)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      effectiveCompanyId = cid;
    } else {
      const q = req.query.company_id;
      effectiveCompanyId = q && String(q).trim() ? String(q).trim() : null;
    }
    let leadIds = null;
    if (effectiveCompanyId) {
      const { data: leads, error: leErr } = await supabase.from('crm_leads').select('id').eq('company_id', effectiveCompanyId);
      if (leErr) throw leErr;
      leadIds = (leads || []).map((x) => x.id);
      if (!leadIds.length) return res.json({ assignees: [], unassigned: [] });
    }

    let tq = supabase.from('crm_tasks')
      .select('*, lead:crm_leads(id,title,code,type), assignee:users!crm_tasks_assignee_id_fkey(id,full_name,avatar)')
      .in('status', ['pending', 'in_progress'])
      .order('deadline', { ascending: true, nullsFirst: false });
    if (leadIds?.length) tq = tq.in('lead_id', leadIds);

    const { applyCrmTasksListAccessScope } = require('../../../helpers/crmTaskOverviewScope');
    const scoped = await applyCrmTasksListAccessScope(tq, supabase, req, { companyId: effectiveCompanyId });
    if (scoped.empty) return res.json({ assignees: [], unassigned: [] });
    tq = scoped.q;

    const { data, error } = await tq;
    if (error) throw error;

    // Group by assignee
    const byAssignee = {};
    const unassigned = [];
    (data || []).forEach(t => {
      if (t.assignee_id) {
        if (!byAssignee[t.assignee_id]) byAssignee[t.assignee_id] = { user: t.assignee, tasks: [] };
        byAssignee[t.assignee_id].tasks.push(t);
      } else {
        unassigned.push(t);
      }
    });
    res.json({ assignees: Object.values(byAssignee), unassigned });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/task-templates', async (req, res) => {
  try {
    // Tham số:
    //   ?pipeline_id=<uuid>  → trả về cả bộ mẫu thuộc pipeline đó (pipeline_stage_id IN stages của pipeline)
    //                          VÀ bộ mẫu Global (pipeline_stage_id IS NULL).
    //   ?company_id=<uuid>   → mọi bộ mẫu pipeline của công ty (qua stages thuộc pipelines công ty).
    //   ?scope=global        → chỉ trả về bộ mẫu Global (pipeline_stage_id IS NULL).
    //   ?scope=pipeline      → chỉ trả về bộ mẫu thuộc pipeline (pipeline_stage_id NOT NULL).
    //   (mặc định)           → trả về TẤT CẢ (giữ tương thích frontend cũ).
    const pipelineId = req.query.pipeline_id ? String(req.query.pipeline_id).trim() : null;
    const companyId = req.query.company_id ? String(req.query.company_id).trim() : null;
    const scope = String(req.query.scope || '').trim();

    let q = supabase
      .from('crm_task_templates')
      .select('*, items:crm_task_template_items(*), pipeline_stage:crm_pipeline_stages!crm_task_templates_pipeline_stage_id_fkey(id, name, color, icon, order_index, pipeline_id, pipeline_type)')
      .eq('is_active', true)
      .order('order_index');

    if (scope === 'global') {
      q = q.is('pipeline_stage_id', null);
    } else if (scope === 'pipeline') {
      q = q.not('pipeline_stage_id', 'is', null);
    }

    if (pipelineId) {
      const { data: stages, error: stErr } = await supabase
        .from('crm_pipeline_stages')
        .select('id')
        .eq('pipeline_id', pipelineId);
      if (stErr) throw stErr;
      const stageIds = (stages || []).map((s) => s.id);
      if (stageIds.length === 0) {
        // Pipeline không có stage nào → chỉ trả global
        q = q.is('pipeline_stage_id', null);
      } else if (scope === 'pipeline') {
        q = q.in('pipeline_stage_id', stageIds);
      } else {
        const orClause = `pipeline_stage_id.in.(${stageIds.join(',')}),pipeline_stage_id.is.null`;
        q = q.or(orClause);
      }
    } else if (companyId) {
      const { data: companyPipelines, error: plErr } = await supabase
        .from('crm_pipelines')
        .select('id')
        .eq('company_id', companyId);
      if (plErr) throw plErr;
      const pipelineIds = (companyPipelines || []).map((p) => p.id);
      if (!pipelineIds.length) {
        if (scope === 'pipeline') return res.json([]);
        q = q.is('pipeline_stage_id', null);
      } else {
        const { data: stages, error: stErr } = await supabase
          .from('crm_pipeline_stages')
          .select('id')
          .in('pipeline_id', pipelineIds);
        if (stErr) throw stErr;
        const stageIds = (stages || []).map((s) => s.id);
        if (!stageIds.length) {
          if (scope === 'pipeline') return res.json([]);
          q = q.is('pipeline_stage_id', null);
        } else {
          q = q.in('pipeline_stage_id', stageIds);
        }
      }
    }

    const { data, error } = await q;
    if (error) {
      // Fallback nếu chưa chạy migration 214 (column pipeline_stage_id chưa có)
      if (String(error.message || '').includes('pipeline_stage_id')) {
        const { data: fbData, error: fbErr } = await supabase
          .from('crm_task_templates')
          .select('*, items:crm_task_template_items(*)')
          .eq('is_active', true)
          .order('order_index');
        if (fbErr) throw fbErr;
        return res.json(fbData || []);
      }
      throw error;
    }
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/task-templates', async (req, res) => {
  try {
    const b = req.body;
    // Auto-detect pipeline_type from stage_slug
    let autoType = b.stage_slug?.startsWith('deal_') ? 'deal' : (b.pipeline_type || 'both');
    // Slug hiệu lực: ưu tiên slug user gửi; nếu gắn vào pipeline_stage_id thì derive từ stage thật.
    // Mục đích: tương thích với DB chưa chạy migration 215 (stage_slug NOT NULL).
    let effectiveStageSlug = b.stage_slug || null;

    if (b.pipeline_stage_id) {
      const { data: st } = await supabase
        .from('crm_pipeline_stages')
        .select('pipeline_type, name, id')
        .eq('id', b.pipeline_stage_id)
        .maybeSingle();
      if (st?.pipeline_type) autoType = st.pipeline_type;
      if (!effectiveStageSlug && st) {
        // Tạo 1 slug ngắn cho legacy column. Prefix tránh trùng với slug global cũ.
        const baseName = (st.name || '').toString().toLowerCase().normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        const shortId = String(st.id || '').slice(0, 8);
        effectiveStageSlug = `pl_${baseName || 'stage'}_${shortId}`.slice(0, 60);
      }
    }
    // Nếu vẫn không có slug (rất hiếm: không gắn pipeline_stage_id, cũng không gửi slug)
    if (!effectiveStageSlug) effectiveStageSlug = 'pl_unassigned';

    const insertBody = {
      name: b.name,
      stage_slug: effectiveStageSlug,
      description: b.description || null,
      is_default: b.is_default || false,
      order_index: b.order_index || 0,
      pipeline_type: autoType,
    };
    if (b.pipeline_stage_id) insertBody.pipeline_stage_id = b.pipeline_stage_id;

    const { data, error } = await supabase.from('crm_task_templates').insert(insertBody).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.put('/task-templates/set-default-bundle', async (req, res) => {
  try {
    const pipelineId = req.body.pipeline_id && String(req.body.pipeline_id).trim();
    const leadTypeRaw = String(req.body.lead_type || 'both').toLowerCase();
    const leadType = ['lead', 'deal', 'both'].includes(leadTypeRaw) ? leadTypeRaw : 'both';
    const markDefault = req.body.is_default !== false;
    const templateIds = Array.isArray(req.body.template_ids)
      ? req.body.template_ids.map(String).filter(Boolean)
      : null;

    if (!pipelineId) return res.status(400).json({ error: 'Thiếu pipeline_id' });

    const { data: pipelineRow, error: plErr } = await supabase
      .from('crm_pipelines')
      .select('id, company_id')
      .eq('id', pipelineId)
      .maybeSingle();
    if (plErr) throw plErr;
    if (!pipelineRow) return res.status(400).json({ error: 'Pipeline không tồn tại' });

    const sac = scopedAdminCompanyId(req);
    if (!isCrmSystemAdminUser(req.user) && !isAdminLike(req.user)) {
      if (sac && pipelineRow.company_id && String(sac) !== String(pipelineRow.company_id)) {
        return res.status(403).json({ error: 'Pipeline không thuộc công ty của bạn' });
      }
    }

    const { stageIds, templateIds: scopeTemplateIds } = await resolveCrmBundleTemplateScope(
      supabase,
      pipelineId,
      leadType,
    );
    if (!stageIds.length) {
      return res.status(400).json({ error: 'Pipeline không có giai đoạn phù hợp loại Lead/Deal đã chọn' });
    }

    // Chỉ bỏ mặc định các bộ thuộc ĐÚNG pipeline + loại Lead/Deal này — không đụng pipeline khác.
    if (scopeTemplateIds.length) {
      const { error: clearErr } = await supabase
        .from('crm_task_templates')
        .update({ is_default: false })
        .in('id', scopeTemplateIds);
      if (clearErr) throw clearErr;
    }

    if (!markDefault) {
      return res.json({ ok: true, updated: 0, is_default: false, pipeline_id: pipelineId, lead_type: leadType });
    }

    let ids = templateIds;
    if (!ids?.length) {
      ids = scopeTemplateIds;
    } else {
      const allowed = new Set(scopeTemplateIds.map(String));
      ids = ids.filter((id) => allowed.has(String(id)));
    }

    if (!ids.length) {
      return res.status(400).json({ error: 'Không có bộ mẫu nào để đặt mặc định cho pipeline này' });
    }

    const { data: updated, error: updErr } = await supabase
      .from('crm_task_templates')
      .update({ is_default: true })
      .in('id', ids)
      .select('id, name, is_default, order_index, pipeline_stage_id');
    if (updErr) throw updErr;

    res.json({
      ok: true,
      updated: updated?.length || 0,
      is_default: true,
      pipeline_id: pipelineId,
      lead_type: leadType,
      templates: (updated || []).sort((a, b) => (a.order_index || 0) - (b.order_index || 0)),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/task-templates/:id', async (req, res) => {
  try {
    const update = {};
    ['name', 'stage_slug', 'description', 'is_default', 'is_active', 'order_index', 'pipeline_type', 'pipeline_stage_id'].forEach(f => {
      if (req.body[f] !== undefined) update[f] = req.body[f];
    });

    if (update.is_default === true) {
      const { data: cur } = await supabase
        .from('crm_task_templates')
        .select('pipeline_stage_id, pipeline_type')
        .eq('id', req.params.id)
        .maybeSingle();
      const stageId = update.pipeline_stage_id || cur?.pipeline_stage_id || null;
      const tplType = update.pipeline_type || cur?.pipeline_type || null;
      if (stageId) {
        const { data: siblings } = await supabase
          .from('crm_task_templates')
          .select('id, pipeline_type')
          .eq('pipeline_stage_id', stageId)
          .neq('id', req.params.id);
        const toClear = (siblings || [])
          .filter((row) => {
            if (!tplType) return true;
            const pt = String(row.pipeline_type || '').toLowerCase();
            const tt = String(tplType || '').toLowerCase();
            if (!pt || pt === 'both') return true;
            if (!tt || tt === 'both') return true;
            return pt === tt;
          })
          .map((row) => row.id);
        if (toClear.length) {
          await supabase
            .from('crm_task_templates')
            .update({ is_default: false })
            .in('id', toClear);
        }
      }
    }

    // Nếu user chuyển sang gắn pipeline_stage_id và muốn clear stage_slug → derive slug từ stage thật
    // (tránh vi phạm NOT NULL khi DB chưa chạy migration 215).
    if (update.pipeline_stage_id && (update.stage_slug === null || update.stage_slug === '')) {
      const { data: st } = await supabase
        .from('crm_pipeline_stages')
        .select('id, name')
        .eq('id', update.pipeline_stage_id)
        .maybeSingle();
      if (st) {
        const baseName = (st.name || '').toString().toLowerCase().normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        const shortId = String(st.id || '').slice(0, 8);
        update.stage_slug = `pl_${baseName || 'stage'}_${shortId}`.slice(0, 60);
      } else {
        delete update.stage_slug; // không update gì để giữ slug cũ
      }
    } else if (update.stage_slug === null || update.stage_slug === '') {
      // Không cho phép set NULL trực tiếp (vi phạm constraint), bỏ field này
      delete update.stage_slug;
    }

    const { data, error } = await supabase.from('crm_task_templates').update(update).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.delete('/task-templates/:id', async (req, res) => {
  try {
    await supabase.from('crm_task_template_items').delete().eq('template_id', req.params.id);
    const { error } = await supabase.from('crm_task_templates').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/task-templates/apply-to-company-regions', async (req, res) => {
  try {
    const b = req.body || {};
    const companyId = b.company_id && String(b.company_id).trim();
    if (!companyId) return res.status(400).json({ error: 'Thiếu company_id' });

    const sac = scopedAdminCompanyId(req);
    if (!isCrmSystemAdminUser(req.user) && !isAdminLike(req.user)) {
      if (!sac || String(sac) !== String(companyId)) {
        return res.status(403).json({ error: 'Chỉ admin công ty hoặc admin hệ thống mới áp dụng bộ mẫu cho toàn công ty' });
      }
    }

    let pipelineId = b.pipeline_id && String(b.pipeline_id).trim();
    if (pipelineId) {
      const { data: pl } = await supabase
        .from('crm_pipelines')
        .select('id, company_id')
        .eq('id', pipelineId)
        .maybeSingle();
      if (!pl) return res.status(400).json({ error: 'Pipeline không tồn tại' });
      if (pl.company_id && String(pl.company_id) !== String(companyId)) {
        return res.status(400).json({ error: 'Pipeline không thuộc công ty đã chọn' });
      }
    } else {
      pipelineId = await getDefaultPipelineIdForCompany(companyId);
    }
    if (!pipelineId) {
      return res.status(400).json({ error: 'Công ty chưa có pipeline CRM (chọn pipeline hoặc tạo pipeline mặc định)' });
    }

    const regionIds = normalizeRegionIdList(b.region_ids);
    if (regionIds.length) {
      for (const rid of regionIds) {
        const chk = await assertRegionBelongsToCompany(supabase, companyId, rid);
        if (!chk.ok) return res.status(400).json({ error: chk.error || 'Khu vực không hợp lệ' });
      }
    }

    const leadTypeRaw = String(b.lead_type || 'both').toLowerCase();
    const leadType = ['lead', 'deal', 'both'].includes(leadTypeRaw) ? leadTypeRaw : 'both';

    const result = await applyCrmTaskTemplatesToCompanyRegions({
      companyId,
      pipelineId,
      leadType,
      regionIds: regionIds.length ? regionIds : null,
      userId: req.user?.userId,
    });

    if (!result.ok) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/task-templates/:tplId/items', async (req, res) => {
  try {
    const b = req.body;
    const { data: existing } = await supabase.from('crm_task_template_items').select('order_index').eq('template_id', req.params.tplId).order('order_index', { ascending: false }).limit(1);
    const nextOrder = (existing?.[0]?.order_index || 0) + 1;
    let { data, error } = await supabase.from('crm_task_template_items').insert({
      template_id: req.params.tplId,
      title: b.title, description: b.description || null,
      priority: b.priority || 'medium',
      deadline_days: Number(b.deadline_days) > 0 ? Math.floor(Number(b.deadline_days)) : 0,
      deadline_hours: Number(b.deadline_hours) > 0 ? Math.floor(Number(b.deadline_hours)) : 0,
      deadline_minutes: Math.min(59, Number(b.deadline_minutes) > 0 ? Math.floor(Number(b.deadline_minutes)) : 0),
      order_index: nextOrder, checklist: b.checklist || [],
      executor_company_id: b.executor_company_id || null,
      completion_requires_file_or_note: !!b.completion_requires_file_or_note
        || (Array.isArray(b.required_evidence_file_types) && b.required_evidence_file_types.length > 0),
      required_evidence_file_types: Array.isArray(b.required_evidence_file_types) ? b.required_evidence_file_types : [],
      completion_requires_customer_note: !!b.completion_requires_customer_note,
      completion_requires_customer_contact: !!b.completion_requires_customer_contact,
      requires_quick_verdict: !!b.requires_quick_verdict,
      blocks_stage_advance: !!b.blocks_stage_advance,
      show_excel_quotation_upload: !!b.show_excel_quotation_upload,
      auto_upload_attachments_to_drive: !!b.auto_upload_attachments_to_drive,
      show_fill_form: !!b.show_fill_form,
      form_config: (b.form_config && typeof b.form_config === 'object' && !Array.isArray(b.form_config))
        ? b.form_config
        : {},
      ...templateItemAssigneePatch(b),
    }).select().single();
    if (error && /required_evidence_file_types|requires_quick_verdict/.test(error.message || '')) {
      return res.status(503).json({
        error: 'Database chưa có cột minh chứng (migration 315/316). Chạy database/315_task_required_evidence_file_types.sql trên Supabase rồi thử lại.',
        code: 'db_migration_required_evidence',
      });
    }
    if (error && isExecutorColumnError(error)) {
      return res.status(503).json({
        error: 'Database chưa có cột giao việc chéo (migration 323). Chạy database/323_crm_task_template_executor_company.sql trên Supabase rồi thử lại.',
        code: 'db_migration_executor_company',
      });
    }
    if (error && isDefaultAssigneeIdsColumnError(error)) {
      return res.status(503).json({
        error: 'Database chưa có cột default_assignee_ids (migration 331). Chạy database/331_template_item_default_assignee_ids.sql trên Supabase rồi thử lại.',
        code: 'db_migration_default_assignee_ids',
      });
    }
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.put('/task-templates/:tplId/items/:itemId', async (req, res) => {
  try {
    const update = {};
    ['title', 'description', 'priority', 'deadline_days', 'deadline_hours', 'deadline_minutes', 'order_index', 'checklist', 'default_allowed_companies', 'default_allowed_departments', 'default_shared_to_project', 'default_allowed_share_modules', 'executor_company_id', 'completion_requires_file_or_note', 'required_evidence_file_types', 'completion_requires_customer_note', 'completion_requires_customer_contact', 'requires_quick_verdict', 'blocks_stage_advance', 'show_excel_quotation_upload', 'auto_upload_attachments_to_drive', 'show_fill_form', 'form_config'].forEach(f => {
      if (req.body[f] !== undefined) update[f] = req.body[f];
    });
    ['deadline_days', 'deadline_hours', 'deadline_minutes'].forEach((f) => {
      if (update[f] !== undefined) {
        const n = Number(update[f]);
        update[f] = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
      }
    });
    if (update.deadline_minutes != null) update.deadline_minutes = Math.min(59, update.deadline_minutes);
    Object.assign(update, templateItemAssigneePatch(req.body));
    if (req.body.executor_company_id === '' || req.body.executor_company_id === null) {
      update.executor_company_id = null;
    }
    if (req.body.default_shared_to_project === false) {
      update.default_allowed_share_modules = null;
    }
    let { data, error } = await supabase.from('crm_task_template_items')
      .update(update).eq('id', req.params.itemId).select().single();
    if (error && /default_shared_to_project|default_allowed_share_modules/.test(error.message || '')) {
      return res.status(503).json({
        error: 'Database chưa có cột chia sẻ mẫu — chạy database/409_crm_template_item_share_defaults.sql trên Supabase rồi thử lại.',
        code: 'db_migration_template_share_defaults',
      });
    }
    if (error && /required_evidence_file_types|completion_requires_file_or_note|requires_quick_verdict/.test(error.message || '')) {
      return res.status(503).json({
        error: 'Database chưa có cột minh chứng (migration 315/316). Chạy database/315_task_required_evidence_file_types.sql trên Supabase rồi thử lại.',
        code: 'db_migration_required_evidence',
      });
    }
    if (error && isExecutorColumnError(error)) {
      return res.status(503).json({
        error: 'Database chưa có cột giao việc chéo (migration 323). Chạy database/323_crm_task_template_executor_company.sql trên Supabase rồi thử lại.',
        code: 'db_migration_executor_company',
      });
    }
    if (error && isDefaultAssigneeIdsColumnError(error)) {
      return res.status(503).json({
        error: 'Database chưa có cột default_assignee_ids (migration 331). Chạy database/331_template_item_default_assignee_ids.sql trên Supabase rồi thử lại.',
        code: 'db_migration_default_assignee_ids',
      });
    }
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.delete('/task-templates/:tplId/items/:itemId', async (req, res) => {
  try {
    const { error } = await supabase.from('crm_task_template_items').delete().eq('id', req.params.itemId);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
}).call(null, helpers["ALLOWED_DEADLINE_FIELDS"], helpers["CRM_COMMENT_ALLOWED_REACTION_EMOJI"], helpers["CRM_LEAD_KANBAN_LITE_SELECT"], helpers["CRM_LEAD_LIST_SELECT"], helpers["CRM_LEAD_LIST_SELECT_BASE"], helpers["CRM_LEAD_LIST_SELECT_EXTRA"], helpers["CRM_LEAD_REGION_EMBED"], helpers["CRM_NEW_LEAD_MAX_AGE_MS"], helpers["CRM_TASK_SELECT"], helpers["CRM_UUID_RE"], helpers["CUSTOMERS_IN_CHUNK"], helpers["CUSTOMERS_OVERVIEW_NO_MATCH_ID"], helpers["DEAL_PRE_CONTRACT_SLUGS_STAFF"], helpers["DEAL_REPORT_BUCKET_VALUES"], helpers["DEFAULT_CHECKLISTS"], helpers["DEFAULT_DEADLINE_BUCKETS"], helpers["DEFAULT_PIPELINE_STAGE_SLA_DAYS"], helpers["FOLLOWUP_TIME_BUCKETS"], helpers["PDFDocument"], helpers["QUOTATIONS_SOURCE_EXCEL_COLS"], helpers["Router"], helpers["SCAN_DUP_LITE_SELECT"], helpers["STAFF_LEAD_DEAL_REPORT_ROLES"], helpers["SURVEY_EVENT_SELECT"], helpers["SURVEY_EVENT_TYPES"], helpers["XLSX"], helpers["ZALO_APP_SETTING_KEY"], helpers["crmSchemaCompat"], helpers["addPhoneToAutoLeadBlocklist"], helpers["aggregateCrmCommentReactions"], helpers["aggregateOrgReportRows"], helpers["appendFulfillmentChildTasksForMasterDeal"], helpers["applyAllActiveWorkshopTemplatesForArea"], helpers["applyAssigneesToInsertedCrmTasks"], helpers["applyCrmLeadRegionFilterToQuery"], helpers["applyCrmTaskTemplatesToCompanyRegions"], helpers["applyCustomerIdInFilter"], helpers["applyCustomersOverviewSearch"], helpers["applyDefaultWorkshopTemplatesForNewProject"], helpers["applyLeadOrCustomerSalesFilter"], helpers["applyProductionTemplateToFulfillmentLead"], helpers["applyProductionTemplatesOnPipelineEnter"], helpers["applyStageIdFilterToQuery"], helpers["applyWorkshopTemplateToProject"], helpers["artifactNamePrefix"], helpers["assertCanFlagLead"], helpers["assertCategoryFitsSource"], helpers["assertCrmAssigneeUserMatchesLeadCompany"], helpers["assertCrmEmployeeDeleteAllowed"], helpers["assertCrmStageAdvanceAllowed"], helpers["assertDealCrmManualStageChange"], helpers["assertDealResponsible"], helpers["assertDivisionAllowedForCompany"], helpers["assertLeadDocumentOwner"], helpers["assertLeadReadableByRegionScope"], helpers["assertRegionBelongsToCompany"], helpers["assertUserCanAssignCrmRegion"], helpers["assignProductionCompanyDealResponsibility"], helpers["attachAssigneesToCrmTasks"], helpers["attachAssignmentIdsToCrmTasks"], helpers["attachCrmNextOpenTaskDeadline"], helpers["attachLeadNewFlagForList"], helpers["attachLeadReplyParents"], helpers["attachLeadUserFlagsForList"], helpers["auth"], helpers["autoCreateProjectFromWonDeal"], helpers["autoFlowFns"], helpers["autoGenCrmTasksForNewLead"], helpers["buildAssignmentNotificationInsert"], helpers["buildChecklistLeadDocumentRow"], helpers["buildCrmDashboardMinimalKpis"], helpers["buildCrmLeadsRpcFilterParams"], helpers["buildCustomersOverviewSummary"], helpers["buildDealTemplateData"], helpers["buildDefaultDeadlineConfig"], helpers["buildFirstStageIdByPipeline"], helpers["buildPipelineStagesMap"], helpers["buildProcessedCommercialItems"], helpers["buildQuotedStageOrderByPipeline"], helpers["buildScanDuplicateGroups"], helpers["buildWonStageOrderByPipeline"], helpers["canUserViewDocByAllowlist"], helpers["chatUpload"], helpers["chunkArray"], helpers["classifyDealStageForStaffReport"], helpers["commentsTableMissing"], helpers["companyRegionExtraColumnsMissing"], helpers["companyRegionGeoColumnsMissing"], helpers["computeCrmDashboardLightStats"], helpers["computeCrmLiveVersionMs"], helpers["computeCustomersOverviewSummary"], helpers["computeIsNewLeadForUser"], helpers["computeOrgOverviewReportData"], helpers["computeStaffLeadDealReportData"], helpers["computeStaffPipelineDetailPayload"], helpers["countOpenOverdueCrmTasksForLeadIds"], helpers["createCrmAssignment"], helpers["createCrmLeadTask"], helpers["createFulfillmentChildDeal"], helpers["createNotif"], helpers["createNotification"], helpers["createProjectFromLead"], helpers["crmExecutorFieldsFromTemplateItem"], helpers["crmLeadCommentAttachmentsColumnMissing"], helpers["crmLeadCommentReadReceiptsTableMissing"], helpers["crmLeadRowVisibleToRequestUser"], helpers["crmListUsesLegacyFilters"], helpers["crmNoteActivityUpload"], helpers["crmReportAsOfMs"], helpers["crmReportCreatedAtFromIso"], helpers["crmReportCreatedAtToIso"], helpers["crmReportDayKeyVn"], helpers["crmRouteErrorText"], helpers["crmTaskDeadlineModuleKey"], helpers["crmTaskMeetsCompletionRequirements"], helpers["crmTaskMeetsRequiredFileTypes"], helpers["crmTaskRequiresCompletionEvidence"], helpers["crmTemplateMatchesLeadType"], helpers["deadlineToDateOnlyIso"], helpers["defaultCompanyInfo"], helpers["defaultKpiLedgerMonthStartYmd"], helpers["deleteCrmLeadTask"], helpers["deleteMirroredAssignmentFileForTaskAttachment"], helpers["duplicateLeadIdsFromLiteRows"], helpers["ecosystemModuleKeyForCrmDeadline"], helpers["effectivePipelineStageSlaDays"], helpers["emitCrmBadgeUpdateForProject"], helpers["emitCrmDashboardChanged"], helpers["emitCrmTaskChanged"], helpers["emptyStaffLeadDealAgg"], helpers["endOfCalendarDayAfterEntered"], helpers["enforceCommercialDocCompanyOnWrite"], helpers["enforceQuotaForRequest"], helpers["ensureDealLeadDocumentsForModuleTransition"], helpers["ensureDefaultCrmPipelineForCompany"], helpers["ensureMissingCrmTasksForLead"], helpers["ensureMissingCrmTasksForPipelineStage"], helpers["ensureMissingSxTasksForLead"], helpers["excelUpload"], helpers["executeLeadMerge"], helpers["executeZaloDealStageNotify"], helpers["fetchActivityCustomerIds"], helpers["fetchAllLeadsForSlaWatchlist"], helpers["fetchAssignmentForTask"], helpers["fetchCrmCommentReactionsAggregate"], helpers["fetchCrmLeadCommentNotifyUserIds"], helpers["fetchCrmLeadDetailRow"], helpers["fetchCrmLeadWithPipelineBadges"], helpers["fetchCrmLeadsByIdsOrdered"], helpers["fetchCrmLeadsForDashboardBatched"], helpers["fetchCrmLeadsForOrgReportBatched"], helpers["fetchCrmLeadsForUserDetailBatched"], helpers["fetchCrmLeadsLiteForDuplicateScan"], helpers["fetchCrmLeadsPageViaRpc"], helpers["fetchCrmPipelineZaloSlice"], helpers["fetchCrmSurveyEventsChunk"], helpers["fetchCrmSurveyVisitsForOrgReport"], helpers["fetchLeadCommentAudienceMembers"], helpers["fetchLeadCommentAudienceMembersForRead"], helpers["fetchLeadIdsForCrmRegion"], helpers["fetchLeadMentionMembers"], helpers["fetchOrgActivityFeed"], helpers["fetchPipelineWithStagesById"], helpers["fetchScopedCrmBundles"], helpers["fillTemplateDataFromStructure"], helpers["filterCrmTasksForLeadType"], helpers["filterUserIdsForCrmLeadScopedNotification"], helpers["findChecklistItem"], helpers["followupDismissExpiresAt"], helpers["fontBold"], helpers["fontRegular"], helpers["formatMoney"], helpers["formatVNDPdf"], helpers["formatVnPhoneLocal0From84"], helpers["fs"], helpers["generateDocPdf"], helpers["generateFlowTasks"], helpers["generateStepTasks"], helpers["getAppSettingValue"], helpers["getCompanyInfo"], helpers["getCompanyRegionsList"], helpers["getCrmLeadListSelect"], helpers["getCrmLeadRegionConstraint"], helpers["getCrmLeadTypesList"], helpers["getCrmLeadsListLegacy"], helpers["getCrmSourceCategoriesList"], helpers["getCrmSourcesList"], helpers["getDefaultCrmAttachmentShare"], helpers["getDefaultDealZaloTemplateStructure"], helpers["getDefaultLeadDocumentShareForDeal"], helpers["getDefaultPipelineIdForCompany"], helpers["getLeadDocumentFieldsFromCrmTask"], helpers["getNotifyTargets"], helpers["getOverdueFollowUps"], helpers["getPipelineIdForCompanyRegion"], helpers["getPipelineZaloSlice"], helpers["getPipelinesList"], helpers["getProjectCRMSummary"], helpers["getStagesByPipelineId"], helpers["getStaleLeads"], helpers["getZaloNotifySettings"], helpers["hydrateCrmLeadsByIdsWithStaff"], helpers["hydrateCrmLeadsRpcPage"], helpers["hydrateScanDuplicateLeads"], helpers["insertQuotationRow"], helpers["invalidateAppSettingKey"], helpers["invalidatePipelinesAndStages"], helpers["invalidateRegions"], helpers["invalidateSources"], helpers["invalidateTenantUsageCache"], helpers["invokeCrmLeadsStageCountsRpc"], helpers["isAdminLike"], helpers["isAllowedLeadCommentAttachmentUrl"], helpers["isChotSanXuatCrmTaskTitle"], helpers["isCrmCompanyAdminUser"], helpers["isCrmDealAssigneeLocked"], helpers["isCrmLeadTypeColorMissingError"], helpers["isCrmModuleAdmin"], helpers["isCrmPipelinesTableMissingError"], helpers["isCrmRegionAdminUser"], helpers["isCrmSystemAdminUser"], helpers["isDealStageHoanThanhForZalo"], helpers["isDefaultAssigneeIdsColumnError"], helpers["isExecutorColumnError"], helpers["isPlatformAdmin"], helpers["isPostgresUniqueViolation"], helpers["isQuotationsSourceExcelColumnMissingError"], helpers["isSxRelationshipError"], helpers["isSystemAdmin"], helpers["isUuidString"], helpers["isValidDealZaloTemplateStructure"], helpers["isVcRelationshipError"], helpers["isVptCompanyCommercialDocViewer"], helpers["lastNominatimGeocodeAt"], helpers["leadChatFilesMulter"], helpers["leadChatJsonOrFiles"], helpers["listQuotationExcelSheets"], helpers["loadCrmTaskAttachmentCountMap"], helpers["loadOrgReportStageMap"], helpers["loadZaloLinkedLeadIdSet"], helpers["logDealActivityComment"], helpers["logDealDeadlineChangeComment"], helpers["logDealStageChangeComment"], helpers["logKanbanDeadlineUnifiedHistory"], helpers["logLeadCommentMentionActivity"], helpers["logProjectFileActivity"], helpers["mapCustomerOverviewRow"], helpers["mapLeadDisplayPhone"], helpers["mapQuotationItemsToOrderRows"], helpers["maskCustomerPhoneDisplay"], helpers["maskZaloAccessTokenPreview"], helpers["maybeSendZaloOnDealStageEnter"], helpers["mergeCrmStageDefaultAssigneeIntoUpdates"], helpers["mergeCustomerIntoTarget"], helpers["misaService"], helpers["multer"], helpers["nextCode"], helpers["nextTbProjectCode"], helpers["normalizeCrmActivityAttachments"], helpers["normalizeCrmLeadCommentAttachments"], helpers["normalizeCrmStageDefaultAssigneeUserId"], helpers["normalizeCrmUserRole"], helpers["normalizeLeadSeenByKeys"], helpers["normalizeOrgReportSurveyVisitRow"], helpers["normalizePipelineStageSlaDaysForDb"], helpers["normalizePipelineStagesList"], helpers["normalizeRegionIdList"], helpers["normalizeTemplateChecklistForCrmTask"], helpers["normalizeTemplateItemAssigneeIds"], helpers["normalizeTimestamp"], helpers["normalizeTitleFold"], helpers["normalizeVnPhoneTo84"], helpers["notifyDealCommentMentions"], helpers["notifyDealCommentParticipants"], helpers["notifyMultiple"], helpers["notifyMultipleShared"], helpers["notifyNewCrmAssignmentAssignees"], helpers["notifyProductionDocumentUploaded"], helpers["onLeadWon"], helpers["onOrderConfirmed"], helpers["onProjectCompleted"], helpers["onQuotationAccepted"], helpers["orgReportAttachFirstStageRates"], helpers["orgReportBumpFirstStageMetrics"], helpers["orgReportBumpMetrics"], helpers["orgReportBumpOpenOverdue"], helpers["orgReportBumpReceptionMetrics"], helpers["orgReportCancelRatePct"], helpers["orgReportClosedWonDealCount"], helpers["orgReportClosedWonValue"], helpers["orgReportCompareSummary"], helpers["orgReportConversionRate"], helpers["orgReportDayKey"], helpers["orgReportDealCloseValueRatePct"], helpers["orgReportDealCountsExpected"], helpers["orgReportDealIsClosedWon"], helpers["orgReportDealIsCompleted"], helpers["orgReportDealIsQuotedOrAfter"], helpers["orgReportDealProbability"], helpers["orgReportDealSplitBuckets"], helpers["orgReportExtendedDealMetrics"], helpers["orgReportFirstStageOnTimeRatePct"], helpers["orgReportFirstStageOverdueRatePct"], helpers["orgReportIsReceptionOverdue"], helpers["orgReportIsSlaOverdue"], helpers["orgReportKpiPeriodStart"], helpers["orgReportNumEst"], helpers["orgReportOverdueRatePct"], helpers["orgReportOwnerId"], helpers["orgReportPctDelta"], helpers["orgReportPreviousPeriod"], helpers["orgReportQuoteValueCloseRatePct"], helpers["orgReportQuoteWinRatePct"], helpers["orgReportReceptionOverdueRatePct"], helpers["orgReportReceptionSlaMinutes"], helpers["orgReportStageIsClosed"], helpers["orgReportStageIsLostOrCancelled"], helpers["orgReportTotalDealCount"], helpers["parseChecklist"], helpers["parseCrmLeadsPageRpc"], helpers["parseCrmReportDateRange"], helpers["parseCrmStageCountsNumericMap"], helpers["parseCrmStageCountsRpc"], helpers["parseExcelMoneyFromMappedColumn"], helpers["parseLeadIdUuidList"], helpers["parseLeadIdsCsvQuery"], helpers["parseLeadIdsFromBody"], helpers["parseLeadSeenByRaw"], helpers["parseQuotationExcelBuffer"], helpers["parseStageIdsFromQuery"], helpers["parseUuidArrayJsonb"], helpers["parseVietnameseMeasure"], helpers["parseVietnameseMoney"], helpers["path"], helpers["persistAssignmentNotification"], helpers["pgCrmDuplicateLeadIds"], helpers["pickDealZaloTemplatePayload"], helpers["pipeOrgOverviewReportPdf"], helpers["pipeStaffLeadDealSummaryPdf"], helpers["pipeStaffPipelineDetailPdf"], helpers["pipelineHasExplicitCompleted"], helpers["pipelineHasExplicitExpected"], helpers["pipelineHasExplicitWon"], helpers["plannerTableMissing"], helpers["postCrmStageDefaultAssigneeComment"], helpers["primaryTemplateItemAssigneeId"], helpers["rcInvalidateTags"], helpers["reactionsTableMissing"], helpers["redactCrmTaskNotesForViewer"], helpers["regionGeocodeInflight"], helpers["repairCrmDealPipelineDisplay"], helpers["requireUserCompanyId"], helpers["requireUserCompanyIdResolved"], helpers["resolveAssignmentIdForTask"], helpers["resolveCanonicalCrmLeadId"], helpers["resolveCommercialDocListCompanyScope"], helpers["resolveCrmBundleTemplateScope"], helpers["resolveCrmLeadsDeadlinesMap"], helpers["resolveCrmLeadsKanbanLite"], helpers["resolveCrmLeadsMergedQuery"], helpers["resolveCrmLeadsSkipDeadline"], helpers["resolveCrmLedgerNetByLeadIdsPayload"], helpers["resolveCrmReportScope"], helpers["resolveCrmTaskWriteLeadId"], helpers["resolveExecutorCompanyId"], helpers["resolveKanbanStagesForCompany"], helpers["resolveLeadCommentMentionIds"], helpers["resolveProductionCompanyForDealStage"], helpers["resolveProductionHandoverResponsibleUserId"], helpers["resolveReopenTargetStageId"], helpers["resolveRpcRegionIdsForCrmList"], helpers["resolveTenantIdForQuota"], helpers["resolveZaloDealTemplateId"], helpers["respondIfCrmPipelinesTableMissing"], helpers["responseCache"], helpers["restoreCrmTaskChecklistFromWorkshopTemplate"], helpers["resyncCrmPipelineTasksForLead"], helpers["sanitizeIsoDateQueryParam"], helpers["scheduleRegionGeocoding"], helpers["scopedAdminCompanyId"], helpers["scopedCrmCompanyIdForWrite"], helpers["sendZaloTemplateMessage"], helpers["setLeadFlag"], helpers["shallowMergeTemplateData"], helpers["skipSxWorkQuickComplete"], helpers["snapshotOrderRowFromQuotation"], helpers["stripCrmAssigneeFromWonStageUpdates"], helpers["stripCrmLeadTypeColorFromSelect"], helpers["stripQuotationsSourceExcelFields"], helpers["sumCrmKpiLedgerNetByLeadIds"], helpers["sumCrmKpiLedgerNetByUserForOrgReport"], helpers["sumCrmKpiLedgerNetByUserIds"], helpers["sumCrmKpiLedgerNetByUserIdsInDateRange"], helpers["supabase"], helpers["syncAllTaskArtifactsToAssignment"], helpers["syncChecklistItemNotes"], helpers["syncCrmLeadSxPipelineFromProject"], helpers["syncQuotationDepositToDealAndProject"], helpers["syncSxKanbanFromCrmProductionStage"], helpers["syncTaskAttachmentToAssignment"], helpers["templateItemAssigneePatch"], helpers["toCrmTaskChecklist"], helpers["unifyCrmLeadResponsibleFields"], helpers["updateCrmLeadTask"], helpers["updateQuotationRow"], helpers["upsertZaloNotifySettings"], helpers["userCanAccessCrmLeadAsParticipant"], helpers["userCanAccessCrmLeadViaVisibility"], helpers["userCanAssignAnyCrmRegion"], helpers["userCanBypassCrmDeleteRestriction"], helpers["userHasSeenLeadInSeenBy"], helpers["userIsAdmin"], helpers["userIsCrmCompanyOrRegionAdmin"], helpers["userMayAccessQuotationRow"], helpers["userSeesAllCrmDeals"], helpers["userSeesAllCrmDealsForScope"], helpers["userSeesAllCrmLeads"], helpers["userSeesAllCrmLeadsForScope"], helpers["uuidQueryOrNull"], helpers["validateProductionCompanyId"]);

module.exports = r;
