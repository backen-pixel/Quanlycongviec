/**
 * CRM routes: customers
 * Auto-extracted — handlers close over shared helpers via IIFE.
 */
const { Router } = require('express');
const helpers = require('../shared/helpersBundle');

const r = Router();

(function (ALLOWED_DEADLINE_FIELDS, CRM_COMMENT_ALLOWED_REACTION_EMOJI, CRM_LEAD_KANBAN_LITE_SELECT, CRM_LEAD_LIST_SELECT, CRM_LEAD_LIST_SELECT_BASE, CRM_LEAD_LIST_SELECT_EXTRA, CRM_LEAD_REGION_EMBED, CRM_NEW_LEAD_MAX_AGE_MS, CRM_TASK_SELECT, CRM_UUID_RE, CUSTOMERS_IN_CHUNK, CUSTOMERS_OVERVIEW_NO_MATCH_ID, DEAL_PRE_CONTRACT_SLUGS_STAFF, DEAL_REPORT_BUCKET_VALUES, DEFAULT_CHECKLISTS, DEFAULT_DEADLINE_BUCKETS, DEFAULT_PIPELINE_STAGE_SLA_DAYS, FOLLOWUP_TIME_BUCKETS, PDFDocument, QUOTATIONS_SOURCE_EXCEL_COLS, Router, SCAN_DUP_LITE_SELECT, STAFF_LEAD_DEAL_REPORT_ROLES, SURVEY_EVENT_SELECT, SURVEY_EVENT_TYPES, XLSX, ZALO_APP_SETTING_KEY, _crmLeadSelectMigrationChecked, _crmLeadTypeColorAvailable, _vcPipelineStageAvailable, addPhoneToAutoLeadBlocklist, aggregateCrmCommentReactions, aggregateOrgReportRows, appendFulfillmentChildTasksForMasterDeal, applyAllActiveWorkshopTemplatesForArea, applyAssigneesToInsertedCrmTasks, applyCrmLeadRegionFilterToQuery, applyCrmTaskTemplatesToCompanyRegions, applyCustomerIdInFilter, applyCustomersOverviewSearch, applyDefaultWorkshopTemplatesForNewProject, applyLeadOrCustomerSalesFilter, applyProductionTemplateToFulfillmentLead, applyProductionTemplatesOnPipelineEnter, applyStageIdFilterToQuery, applyWorkshopTemplateToProject, artifactNamePrefix, assertCanFlagLead, assertCategoryFitsSource, assertCrmAssigneeUserMatchesLeadCompany, assertCrmEmployeeDeleteAllowed, assertCrmStageAdvanceAllowed, assertDealCrmManualStageChange, assertDealResponsible, assertDivisionAllowedForCompany, assertLeadDocumentOwner, assertLeadReadableByRegionScope, assertRegionBelongsToCompany, assertUserCanAssignCrmRegion, assignProductionCompanyDealResponsibility, attachAssigneesToCrmTasks, attachAssignmentIdsToCrmTasks, attachCrmNextOpenTaskDeadline, attachLeadNewFlagForList, attachLeadReplyParents, attachLeadUserFlagsForList, auth, autoCreateProjectFromWonDeal, autoFlowFns, autoGenCrmTasksForNewLead, buildAssignmentNotificationInsert, buildChecklistLeadDocumentRow, buildCrmDashboardMinimalKpis, buildCrmLeadsRpcFilterParams, buildCustomersOverviewSummary, buildDealTemplateData, buildDefaultDeadlineConfig, buildFirstStageIdByPipeline, buildPipelineStagesMap, buildProcessedCommercialItems, buildQuotedStageOrderByPipeline, buildScanDuplicateGroups, buildWonStageOrderByPipeline, canUserViewDocByAllowlist, chatUpload, chunkArray, classifyDealStageForStaffReport, commentsTableMissing, companyRegionExtraColumnsMissing, companyRegionGeoColumnsMissing, computeCrmDashboardLightStats, computeCrmLiveVersionMs, computeCustomersOverviewSummary, computeIsNewLeadForUser, computeOrgOverviewReportData, computeStaffLeadDealReportData, computeStaffPipelineDetailPayload, countOpenOverdueCrmTasksForLeadIds, createCrmAssignment, createCrmLeadTask, createFulfillmentChildDeal, createNotif, createNotification, createProjectFromLead, crmExecutorFieldsFromTemplateItem, crmLeadCommentAttachmentsColumnMissing, crmLeadCommentReadReceiptsTableMissing, crmLeadRowVisibleToRequestUser, crmListUsesLegacyFilters, crmNoteActivityUpload, crmReportAsOfMs, crmReportCreatedAtFromIso, crmReportCreatedAtToIso, crmReportDayKeyVn, crmRouteErrorText, crmTaskDeadlineModuleKey, crmTaskMeetsCompletionRequirements, crmTaskMeetsRequiredFileTypes, crmTaskRequiresCompletionEvidence, crmTemplateMatchesLeadType, deadlineToDateOnlyIso, defaultCompanyInfo, defaultKpiLedgerMonthStartYmd, deleteCrmLeadTask, deleteMirroredAssignmentFileForTaskAttachment, duplicateLeadIdsFromLiteRows, ecosystemModuleKeyForCrmDeadline, effectivePipelineStageSlaDays, emitCrmBadgeUpdateForProject, emitCrmDashboardChanged, emitCrmTaskChanged, emptyStaffLeadDealAgg, endOfCalendarDayAfterEntered, enforceCommercialDocCompanyOnWrite, enforceQuotaForRequest, ensureDealLeadDocumentsForModuleTransition, ensureDefaultCrmPipelineForCompany, ensureMissingCrmTasksForLead, ensureMissingCrmTasksForPipelineStage, ensureMissingSxTasksForLead, excelUpload, executeLeadMerge, executeZaloDealStageNotify, fetchActivityCustomerIds, fetchAllLeadsForSlaWatchlist, fetchAssignmentForTask, fetchCrmCommentReactionsAggregate, fetchCrmLeadCommentNotifyUserIds, fetchCrmLeadDetailRow, fetchCrmLeadWithPipelineBadges, fetchCrmLeadsByIdsOrdered, fetchCrmLeadsForDashboardBatched, fetchCrmLeadsForOrgReportBatched, fetchCrmLeadsForUserDetailBatched, fetchCrmLeadsLiteForDuplicateScan, fetchCrmLeadsPageViaRpc, fetchCrmPipelineZaloSlice, fetchCrmSurveyEventsChunk, fetchCrmSurveyVisitsForOrgReport, fetchLeadCommentAudienceMembers, fetchLeadCommentAudienceMembersForRead, fetchLeadIdsForCrmRegion, fetchLeadMentionMembers, fetchOrgActivityFeed, fetchPipelineWithStagesById, fetchScopedCrmBundles, fillTemplateDataFromStructure, filterCrmTasksForLeadType, filterUserIdsForCrmLeadScopedNotification, findChecklistItem, followupDismissExpiresAt, fontBold, fontRegular, formatMoney, formatVNDPdf, formatVnPhoneLocal0From84, fs, generateDocPdf, generateFlowTasks, generateStepTasks, getAppSettingValue, getCompanyInfo, getCompanyRegionsList, getCrmLeadListSelect, getCrmLeadRegionConstraint, getCrmLeadTypesList, getCrmLeadsListLegacy, getCrmSourceCategoriesList, getCrmSourcesList, getDefaultCrmAttachmentShare, getDefaultDealZaloTemplateStructure, getDefaultLeadDocumentShareForDeal, getDefaultPipelineIdForCompany, getLeadDocumentFieldsFromCrmTask, getNotifyTargets, getOverdueFollowUps, getPipelineIdForCompanyRegion, getPipelineZaloSlice, getPipelinesList, getProjectCRMSummary, getStagesByPipelineId, getStaleLeads, getZaloNotifySettings, hydrateCrmLeadsByIdsWithStaff, hydrateCrmLeadsRpcPage, hydrateScanDuplicateLeads, insertQuotationRow, invalidateAppSettingKey, invalidatePipelinesAndStages, invalidateRegions, invalidateSources, invalidateTenantUsageCache, invokeCrmLeadsStageCountsRpc, isAdminLike, isAllowedLeadCommentAttachmentUrl, isChotSanXuatCrmTaskTitle, isCrmCompanyAdminUser, isCrmDealAssigneeLocked, isCrmLeadTypeColorMissingError, isCrmModuleAdmin, isCrmPipelinesTableMissingError, isCrmRegionAdminUser, isCrmSystemAdminUser, isDealStageHoanThanhForZalo, isDefaultAssigneeIdsColumnError, isExecutorColumnError, isPlatformAdmin, isPostgresUniqueViolation, isQuotationsSourceExcelColumnMissingError, isSxRelationshipError, isSystemAdmin, isUuidString, isValidDealZaloTemplateStructure, isVcRelationshipError, isVptCompanyCommercialDocViewer, lastNominatimGeocodeAt, leadChatFilesMulter, leadChatJsonOrFiles, listQuotationExcelSheets, loadCrmTaskAttachmentCountMap, loadOrgReportStageMap, loadZaloLinkedLeadIdSet, logDealActivityComment, logDealDeadlineChangeComment, logDealStageChangeComment, logKanbanDeadlineUnifiedHistory, logLeadCommentMentionActivity, logProjectFileActivity, mapCustomerOverviewRow, mapLeadDisplayPhone, mapQuotationItemsToOrderRows, maskCustomerPhoneDisplay, maskZaloAccessTokenPreview, maybeSendZaloOnDealStageEnter, mergeCrmStageDefaultAssigneeIntoUpdates, mergeCustomerIntoTarget, misaService, multer, nextCode, nextTbProjectCode, normalizeCrmActivityAttachments, normalizeCrmLeadCommentAttachments, normalizeCrmStageDefaultAssigneeUserId, normalizeCrmUserRole, normalizeLeadSeenByKeys, normalizeOrgReportSurveyVisitRow, normalizePipelineStageSlaDaysForDb, normalizePipelineStagesList, normalizeRegionIdList, normalizeTemplateChecklistForCrmTask, normalizeTemplateItemAssigneeIds, normalizeTimestamp, normalizeTitleFold, normalizeVnPhoneTo84, notifyDealCommentMentions, notifyDealCommentParticipants, notifyMultiple, notifyMultipleShared, notifyNewCrmAssignmentAssignees, notifyProductionDocumentUploaded, onLeadWon, onOrderConfirmed, onProjectCompleted, onQuotationAccepted, orgReportAttachFirstStageRates, orgReportBumpFirstStageMetrics, orgReportBumpMetrics, orgReportBumpOpenOverdue, orgReportBumpReceptionMetrics, orgReportCancelRatePct, orgReportClosedWonDealCount, orgReportClosedWonValue, orgReportCompareSummary, orgReportConversionRate, orgReportDayKey, orgReportDealCloseValueRatePct, orgReportDealCountsExpected, orgReportDealIsClosedWon, orgReportDealIsCompleted, orgReportDealIsQuotedOrAfter, orgReportDealProbability, orgReportDealSplitBuckets, orgReportExtendedDealMetrics, orgReportFirstStageOnTimeRatePct, orgReportFirstStageOverdueRatePct, orgReportIsReceptionOverdue, orgReportIsSlaOverdue, orgReportKpiPeriodStart, orgReportNumEst, orgReportOverdueRatePct, orgReportOwnerId, orgReportPctDelta, orgReportPreviousPeriod, orgReportQuoteValueCloseRatePct, orgReportQuoteWinRatePct, orgReportReceptionOverdueRatePct, orgReportReceptionSlaMinutes, orgReportStageIsClosed, orgReportStageIsLostOrCancelled, orgReportTotalDealCount, parseChecklist, parseCrmLeadsPageRpc, parseCrmReportDateRange, parseCrmStageCountsNumericMap, parseCrmStageCountsRpc, parseExcelMoneyFromMappedColumn, parseLeadIdUuidList, parseLeadIdsCsvQuery, parseLeadIdsFromBody, parseLeadSeenByRaw, parseQuotationExcelBuffer, parseStageIdsFromQuery, parseUuidArrayJsonb, parseVietnameseMeasure, parseVietnameseMoney, path, persistAssignmentNotification, pgCrmDuplicateLeadIds, pickDealZaloTemplatePayload, pipeOrgOverviewReportPdf, pipeStaffLeadDealSummaryPdf, pipeStaffPipelineDetailPdf, pipelineHasExplicitCompleted, pipelineHasExplicitExpected, pipelineHasExplicitWon, plannerTableMissing, postCrmStageDefaultAssigneeComment, primaryTemplateItemAssigneeId, rcInvalidateTags, reactionsTableMissing, redactCrmTaskNotesForViewer, regionGeocodeInflight, repairCrmDealPipelineDisplay, requireUserCompanyId, requireUserCompanyIdResolved, resolveAssignmentIdForTask, resolveCanonicalCrmLeadId, resolveCommercialDocListCompanyScope, resolveCrmBundleTemplateScope, resolveCrmLeadsDeadlinesMap, resolveCrmLeadsKanbanLite, resolveCrmLeadsMergedQuery, resolveCrmLeadsSkipDeadline, resolveCrmLedgerNetByLeadIdsPayload, resolveCrmReportScope, resolveCrmTaskWriteLeadId, resolveExecutorCompanyId, resolveKanbanStagesForCompany, resolveLeadCommentMentionIds, resolveProductionCompanyForDealStage, resolveProductionHandoverResponsibleUserId, resolveReopenTargetStageId, resolveRpcRegionIdsForCrmList, resolveTenantIdForQuota, resolveZaloDealTemplateId, respondIfCrmPipelinesTableMissing, responseCache, restoreCrmTaskChecklistFromWorkshopTemplate, resyncCrmPipelineTasksForLead, sanitizeIsoDateQueryParam, scheduleRegionGeocoding, scopedAdminCompanyId, scopedCrmCompanyIdForWrite, sendZaloTemplateMessage, setLeadFlag, shallowMergeTemplateData, skipSxWorkQuickComplete, snapshotOrderRowFromQuotation, stripCrmAssigneeFromWonStageUpdates, stripCrmLeadTypeColorFromSelect, stripQuotationsSourceExcelFields, sumCrmKpiLedgerNetByLeadIds, sumCrmKpiLedgerNetByUserForOrgReport, sumCrmKpiLedgerNetByUserIds, sumCrmKpiLedgerNetByUserIdsInDateRange, supabase, syncAllTaskArtifactsToAssignment, syncChecklistItemNotes, syncCrmLeadSxPipelineFromProject, syncQuotationDepositToDealAndProject, syncSxKanbanFromCrmProductionStage, syncTaskAttachmentToAssignment, templateItemAssigneePatch, toCrmTaskChecklist, unifyCrmLeadResponsibleFields, updateCrmLeadTask, updateQuotationRow, upsertZaloNotifySettings, userCanAccessCrmLeadAsParticipant, userCanAccessCrmLeadViaVisibility, userCanAssignAnyCrmRegion, userCanBypassCrmDeleteRestriction, userHasSeenLeadInSeenBy, userIsAdmin, userIsCrmCompanyOrRegionAdmin, userMayAccessQuotationRow, userSeesAllCrmDeals, userSeesAllCrmDealsForScope, userSeesAllCrmLeads, userSeesAllCrmLeadsForScope, uuidQueryOrNull, validateProductionCompanyId) {
r.get('/customers', async (req, res) => {
  try {
    const { search, company_id: coQ } = req.query;
    let q = supabase.from('customers').select('*').order('created_at', { ascending: false }).limit(100);
    const sacCu = scopedAdminCompanyId(req);
    if (sacCu) {
      q = q.eq('company_id', sacCu);
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      q = q.eq('company_id', cid);
    } else if (coQ && /^[0-9a-f-]{36}$/i.test(String(coQ))) {
      q = q.eq('company_id', coQ);
    }
    if (search) q = q.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
    const { data } = await q;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/customers', async (req, res) => {
  try {
    const { full_name, phone, email, address, company, tax_code, source, notes, company_id: bodyCo } = req.body;
    if (!full_name?.trim()) return res.status(400).json({ error: 'Tên khách hàng là bắt buộc' });
    let coId = bodyCo || null;
    const sacCuPost = scopedAdminCompanyId(req);
    if (sacCuPost) {
      coId = sacCuPost;
    } else if (!userIsAdmin(req.user?.role)) {
      const uc = requireUserCompanyId(req, res);
      if (!uc) return;
      coId = uc;
    }
    const { data, error } = await supabase.from('customers')
      .insert({
        full_name,
        phone: phone || null,
        email: email || null,
        address: address || null,
        company: company || null,
        tax_code: tax_code || null,
        source: source || null,
        notes: notes || null,
        company_id: coId || null,
      })
      .select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.put('/customers/:id', async (req, res) => {
  try {
    const update = {};
    ['full_name', 'phone', 'email', 'address', 'company', 'tax_code', 'notes', 'source', 'gender', 'birthday'].forEach(f => {
      if (req.body[f] !== undefined) update[f] = req.body[f] || null;
    });
    update.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from('customers').update(update).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/company-regions', async (req, res) => {
  try {
    const co = req.query.company_id && String(req.query.company_id).trim();
    const div = req.query.division_unit_id && String(req.query.division_unit_id).trim();
    const idsParam = req.query.company_ids && String(req.query.company_ids).trim();
    const coIds = idsParam ? idsParam.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const forModuleRaw = req.query.for_module && String(req.query.for_module).trim().toLowerCase();
    if (!co && coIds.length === 0) return res.status(400).json({ error: 'Thiếu company_id' });

    const sac = scopedAdminCompanyId(req);
    const checkOne = (id) => {
      if (sac && String(id) !== String(sac)) return false;
      if (isCrmRegionAdminUser(req.user)) {
        if (String(id) !== String(req.user.company_id)) return false;
      } else if (!userIsAdmin(req.user?.role)) {
        if (String(id) !== String(req.user?.company_id || '')) return false;
      }
      return true;
    };

    let allowedIds = [];
    if (co) {
      if (!checkOne(co)) return res.status(403).json({ error: 'Không có quyền' });
      allowedIds = [co];
    } else {
      allowedIds = coIds.filter(checkOne);
      if (allowedIds.length === 0) return res.json([]);
    }

    // Lọc theo khối được cấu hình cho module (vd. for_module=crm) — chỉ trả khu vực
    // có division_unit_id thuộc các khối CRM. Khu vực chưa gán khối được giữ lại
    // để tương thích dữ liệu cũ.
    let moduleDivIds = null;
    if (forModuleRaw) {
      try {
        const { getRestrictedDivisionIdsForModule, KNOWN_MODULE_KEYS } = require('../../../helpers/ecosystemModuleScope');
        if (KNOWN_MODULE_KEYS.includes(forModuleRaw)) {
          const restricted = await getRestrictedDivisionIdsForModule(forModuleRaw);
          if (restricted && restricted.size > 0) moduleDivIds = [...restricted];
        }
      } catch { /* ignore */ }
    }

    const data = await getCompanyRegionsList({ allowedIds, div: div || null, moduleDivIds });
    let rows = data;
    if (!userCanAssignAnyCrmRegion(req.user)) {
      const scopedIds = normalizeRegionIdList(req.user?.crm_region_ids);
      if (scopedIds.length) {
        const allowed = new Set(scopedIds.map(String));
        rows = (rows || []).filter((r) => allowed.has(String(r.id)));
      }
    }
    void scheduleRegionGeocoding(rows);
    res.json(rows);
  } catch (e) {
    if (String(e.message || '').includes('company_regions')) {
      return res.json([]);
    }
    res.status(500).json({ error: e.message });
  }
});

r.post('/company-regions', async (req, res) => {
  try {
    const { company_id, name, code, division_unit_id, address, map_url } = req.body || {};
    if (!company_id || !String(name || '').trim()) return res.status(400).json({ error: 'company_id và name là bắt buộc' });
    const sac = scopedAdminCompanyId(req);
    if (!isCrmSystemAdminUser(req.user) && !sac) {
      return res.status(403).json({ error: 'Chỉ admin công ty hoặc admin hệ thống thêm khu vực' });
    }
    if (sac && String(company_id) !== String(sac)) return res.status(403).json({ error: 'Không tạo khu vực cho công ty khác' });

    let divId = division_unit_id || null;
    if (!divId) {
      const { data: co } = await supabase.from('companies').select('division_unit_id').eq('id', company_id).maybeSingle();
      divId = co?.division_unit_id || null;
    }
    if (divId) {
      const { ok } = await assertDivisionAllowedForCompany(company_id, divId);
      if (!ok) return res.status(400).json({ error: 'Khối không thuộc công ty này' });
    }

    const baseInsert = {
      company_id,
      division_unit_id: divId,
      name: String(name).trim(),
      code: code != null && String(code).trim() ? String(code).trim() : null,
      updated_at: new Date().toISOString(),
    };
    const extInsert = {
      address: address != null && String(address).trim() ? String(address).trim() : null,
      map_url: map_url != null && String(map_url).trim() ? String(map_url).trim() : null,
    };
    const { inVietnam: _inVN } = require('../../../helpers/geoBounds');
    const latRaw = req.body?.lat;
    const lngRaw = req.body?.lng;
    const latNum = latRaw != null && latRaw !== '' ? Number(latRaw) : null;
    const lngNum = lngRaw != null && lngRaw !== '' ? Number(lngRaw) : null;
    const geoInsert = {};
    if (_inVN(latNum, lngNum)) {
      geoInsert.lat = Number(latNum.toFixed(6));
      geoInsert.lng = Number(lngNum.toFixed(6));
      geoInsert.geocoded_at = new Date().toISOString();
    } else if (latRaw != null && latRaw !== '' && lngRaw != null && lngRaw !== '') {
      return res.status(400).json({ error: 'Toạ độ chi nhánh phải nằm trong phạm vi Việt Nam' });
    }
    let { data, error } = await supabase
      .from('company_regions')
      .insert({ ...baseInsert, ...extInsert, ...geoInsert })
      .select()
      .single();
    if (error && companyRegionGeoColumnsMissing(error)) {
      ({ data, error } = await supabase
        .from('company_regions')
        .insert({ ...baseInsert, ...extInsert })
        .select()
        .single());
    }
    if (error && companyRegionExtraColumnsMissing(error)) {
      ({ data, error } = await supabase
        .from('company_regions')
        .insert(baseInsert)
        .select()
        .single());
    }
    if (error) throw error;
    invalidateRegions();
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.patch('/company-regions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data: row } = await supabase.from('company_regions').select('id, company_id, division_unit_id').eq('id', id).maybeSingle();
    if (!row) return res.status(404).json({ error: 'Không tìm thấy' });
    const sac = scopedAdminCompanyId(req);
    if (!isCrmSystemAdminUser(req.user) && !sac) {
      return res.status(403).json({ error: 'Chỉ admin công ty hoặc admin hệ thống sửa khu vực' });
    }
    if (sac && String(row.company_id) !== String(sac)) return res.status(403).json({ error: 'Không có quyền' });
    const patch = { updated_at: new Date().toISOString() };
    ['name', 'code', 'order_index', 'is_active', 'division_unit_id', 'address', 'map_url'].forEach((f) => {
      if (req.body[f] !== undefined) patch[f] = req.body[f];
    });
    if (req.body.lat !== undefined || req.body.lng !== undefined) {
      const { inVietnam: _inVN } = require('../../../helpers/geoBounds');
      const latNum = req.body.lat != null && req.body.lat !== '' ? Number(req.body.lat) : null;
      const lngNum = req.body.lng != null && req.body.lng !== '' ? Number(req.body.lng) : null;
      if (_inVN(latNum, lngNum)) {
        patch.lat = Number(latNum.toFixed(6));
        patch.lng = Number(lngNum.toFixed(6));
        patch.geocoded_at = new Date().toISOString();
      } else if (req.body.lat === null || req.body.lng === null) {
        patch.lat = null;
        patch.lng = null;
      } else if (req.body.lat != null && req.body.lat !== '' && req.body.lng != null && req.body.lng !== '') {
        return res.status(400).json({ error: 'Toạ độ chi nhánh phải nằm trong phạm vi Việt Nam' });
      }
    }
    if (patch.address !== undefined || patch.map_url !== undefined) {
      patch.geocoded_at = null;
      if (patch.lat === undefined) patch.lat = null;
      if (patch.lng === undefined) patch.lng = null;
    }
    if (patch.division_unit_id) {
      const { ok } = await assertDivisionAllowedForCompany(row.company_id, patch.division_unit_id);
      if (!ok) return res.status(400).json({ error: 'Khối không thuộc công ty này' });
    }
    let { data, error } = await supabase.from('company_regions').update(patch).eq('id', id).select().single();
    if (error && companyRegionGeoColumnsMissing(error)) {
      const fallback = { ...patch };
      delete fallback.lat;
      delete fallback.lng;
      delete fallback.geocoded_at;
      ({ data, error } = await supabase.from('company_regions').update(fallback).eq('id', id).select().single());
    }
    if (error && companyRegionExtraColumnsMissing(error)) {
      const fallbackPatch = { ...patch };
      delete fallbackPatch.address;
      delete fallbackPatch.map_url;
      delete fallbackPatch.lat;
      delete fallbackPatch.lng;
      delete fallbackPatch.geocoded_at;
      ({ data, error } = await supabase.from('company_regions').update(fallbackPatch).eq('id', id).select().single());
    }
    if (error) throw error;
    invalidateRegions();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/company-regions/:id/regeocode', async (req, res) => {
  try {
    const { id } = req.params;
    const { data: row } = await supabase
      .from('company_regions')
      .select('id, company_id, address, map_url, name')
      .eq('id', id)
      .maybeSingle();
    if (!row) return res.status(404).json({ error: 'Không tìm thấy' });
    const sac = scopedAdminCompanyId(req);
    if (!isCrmSystemAdminUser(req.user) && !sac) {
      return res.status(403).json({ error: 'Chỉ admin công ty hoặc admin hệ thống' });
    }
    if (sac && String(row.company_id) !== String(sac)) {
      return res.status(403).json({ error: 'Không có quyền' });
    }

    const { forwardGeocode } = require('../../../helpers/forwardGeocode');

    if (req.body?.clear_cache) {
      const norm = String(row.address || '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 240);
      if (norm) {
        try { await supabase.from('geocode_cache').delete().eq('key', `fwd:${norm}`); } catch { /* ignore */ }
      }
    }

    const hit = await forwardGeocode({ address: row.address, map_url: row.map_url });
    if (!hit) {
      try {
        await supabase
          .from('company_regions')
          .update({ lat: null, lng: null, geocoded_at: null })
          .eq('id', id);
      } catch { /* ignore */ }
      invalidateRegions();
      return res.json({ ok: false, reason: 'no_match', address: row.address, map_url: row.map_url });
    }

    const payload = {
      lat: Number(hit.lat.toFixed(6)),
      lng: Number(hit.lng.toFixed(6)),
      geocoded_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('company_regions').update(payload).eq('id', id);
    if (error) throw error;
    invalidateRegions();
    res.json({ ok: true, id, ...payload, source: hit.source, formatted_address: hit.address });
  } catch (e) {
    console.error('POST /crm/company-regions/:id/regeocode:', e);
    res.status(500).json({ error: e.message });
  }
});

r.get('/customers-overview', async (req, res) => {
  try {
    let effectiveCompanyId = null;
    if (!isSystemAdmin(req.user)) {
      const cid = await requireUserCompanyIdResolved(req, res);
      if (!cid) return;
      effectiveCompanyId = cid;
    } else {
      const q = req.query.company_id;
      effectiveCompanyId = q && String(q).trim() ? String(q).trim() : null;
    }

    const uid = req.user?.userId;
    const role = req.user?.role;
    const paginated = req.query.page != null || req.query.limit != null;

    if (!paginated) {
      let custQ = supabase.from('customers').select('*').order('full_name');
      if (effectiveCompanyId) custQ = custQ.eq('company_id', effectiveCompanyId);
      const { data: customers, error: custErr } = await custQ;
      if (custErr) throw custErr;

      const { leads, quotes, orders, invoices } = await fetchScopedCrmBundles(effectiveCompanyId, uid, role);
      const result = (customers || []).map((c) =>
        mapCustomerOverviewRow(c, leads, quotes, orders, invoices, true),
      );
      res.json(result);
      return;
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 30));
    const sort = req.query.sort === 'oldest' ? 'oldest' : 'newest';
    const search = String(req.query.search || '').trim();
    const activity = ['active', 'debt'].includes(String(req.query.activity || ''))
      ? String(req.query.activity)
      : 'all';

    let custQ = supabase.from('customers').select('*', { count: 'exact' });
    if (effectiveCompanyId) custQ = custQ.eq('company_id', effectiveCompanyId);
    custQ = applyCustomersOverviewSearch(custQ, search);
    if (activity !== 'all') {
      const activityIds = await fetchActivityCustomerIds(effectiveCompanyId, activity);
      if (activityIds) custQ = applyCustomerIdInFilter(custQ, activityIds);
    }
    custQ = custQ.order('created_at', { ascending: sort === 'oldest' });
    const from = (page - 1) * limit;
    custQ = custQ.range(from, from + limit - 1);

    const { data: customers, count, error: custErr } = await custQ;
    if (custErr) throw custErr;

    const pageIds = (customers || []).map((c) => c.id);
    const { leads, quotes, orders, invoices } = pageIds.length
      ? await fetchScopedCrmBundles(effectiveCompanyId, uid, role, pageIds)
      : { leads: [], quotes: [], orders: [], invoices: [] };

    const items = (customers || []).map((c) =>
      mapCustomerOverviewRow(c, leads, quotes, orders, invoices, false),
    );
    const total = count || 0;
    let summary;
    if (page === 1) {
      try {
        summary = await buildCustomersOverviewSummary(effectiveCompanyId, uid, role, search, activity);
      } catch (summaryErr) {
        console.error('[customers-overview] summary failed:', summaryErr?.message || summaryErr);
        summary = {
          total,
          active: 0,
          leads: 0,
          deals: 0,
          won: 0,
          revenue: 0,
          debt: 0,
        };
      }
    }

    res.json({
      customers: items,
      total,
      page,
      limit,
      hasMore: from + items.length < total,
      summary,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/customers-overview/:id', async (req, res) => {
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

    const { data: customer } = await supabase.from('customers').select('*').eq('id', req.params.id).single();
    if (!customer) return res.status(404).json({ error: 'KH không tồn tại' });
    if (effectiveCompanyId && customer.company_id && String(customer.company_id) !== String(effectiveCompanyId)) {
      return res.status(403).json({ error: 'Không có quyền xem khách hàng này' });
    }

    let leadsQ = supabase
      .from('crm_leads')
      .select(
        'id, customer_id, company_id, source_id, title, code, estimated_value, stage_id, created_at, type, assigned_to, lead_owner_id, stage:crm_pipeline_stages!crm_leads_stage_id_fkey(name, icon, color, is_won), source:crm_sources(id, name, icon)',
      )
      .eq('customer_id', req.params.id)
      .order('created_at', { ascending: false });
    if (effectiveCompanyId) leadsQ = leadsQ.eq('company_id', effectiveCompanyId);
    const { data: leadsRaw } = await leadsQ;
    const uid = req.user?.userId;
    const role = req.user?.role;
    const leads = (leadsRaw || []).filter((l) => crmLeadRowVisibleToRequestUser(l, uid, role));
    let quotesQ = supabase.from('quotations').select('id, customer_id, code, title, total, status, created_at').eq('customer_id', req.params.id).order('created_at', { ascending: false });
    if (effectiveCompanyId) quotesQ = quotesQ.eq('company_id', effectiveCompanyId);
    if (!userIsAdmin(req.user?.role) && req.user?.userId) quotesQ = quotesQ.eq('created_by', req.user.userId);
    let ordersQ = supabase.from('orders').select('id, customer_id, code, title, total, status, paid_amount, created_at').eq('customer_id', req.params.id).order('created_at', { ascending: false });
    if (effectiveCompanyId) ordersQ = ordersQ.eq('company_id', effectiveCompanyId);
    let invoicesQ = supabase.from('invoices').select('id, customer_id, code, title, total, paid_amount, payment_status, created_at').eq('customer_id', req.params.id).order('created_at', { ascending: false });
    if (effectiveCompanyId) invoicesQ = invoicesQ.eq('company_id', effectiveCompanyId);
    const [{ data: quotes }, { data: orders }, { data: invoices }] = await Promise.all([quotesQ, ordersQ, invoicesQ]);
    res.json({ ...customer, leads: leads || [], quotes: quotes || [], orders: orders || [], invoices: invoices || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
}).call(null, helpers["ALLOWED_DEADLINE_FIELDS"], helpers["CRM_COMMENT_ALLOWED_REACTION_EMOJI"], helpers["CRM_LEAD_KANBAN_LITE_SELECT"], helpers["CRM_LEAD_LIST_SELECT"], helpers["CRM_LEAD_LIST_SELECT_BASE"], helpers["CRM_LEAD_LIST_SELECT_EXTRA"], helpers["CRM_LEAD_REGION_EMBED"], helpers["CRM_NEW_LEAD_MAX_AGE_MS"], helpers["CRM_TASK_SELECT"], helpers["CRM_UUID_RE"], helpers["CUSTOMERS_IN_CHUNK"], helpers["CUSTOMERS_OVERVIEW_NO_MATCH_ID"], helpers["DEAL_PRE_CONTRACT_SLUGS_STAFF"], helpers["DEAL_REPORT_BUCKET_VALUES"], helpers["DEFAULT_CHECKLISTS"], helpers["DEFAULT_DEADLINE_BUCKETS"], helpers["DEFAULT_PIPELINE_STAGE_SLA_DAYS"], helpers["FOLLOWUP_TIME_BUCKETS"], helpers["PDFDocument"], helpers["QUOTATIONS_SOURCE_EXCEL_COLS"], helpers["Router"], helpers["SCAN_DUP_LITE_SELECT"], helpers["STAFF_LEAD_DEAL_REPORT_ROLES"], helpers["SURVEY_EVENT_SELECT"], helpers["SURVEY_EVENT_TYPES"], helpers["XLSX"], helpers["ZALO_APP_SETTING_KEY"], helpers["_crmLeadSelectMigrationChecked"], helpers["_crmLeadTypeColorAvailable"], helpers["_vcPipelineStageAvailable"], helpers["addPhoneToAutoLeadBlocklist"], helpers["aggregateCrmCommentReactions"], helpers["aggregateOrgReportRows"], helpers["appendFulfillmentChildTasksForMasterDeal"], helpers["applyAllActiveWorkshopTemplatesForArea"], helpers["applyAssigneesToInsertedCrmTasks"], helpers["applyCrmLeadRegionFilterToQuery"], helpers["applyCrmTaskTemplatesToCompanyRegions"], helpers["applyCustomerIdInFilter"], helpers["applyCustomersOverviewSearch"], helpers["applyDefaultWorkshopTemplatesForNewProject"], helpers["applyLeadOrCustomerSalesFilter"], helpers["applyProductionTemplateToFulfillmentLead"], helpers["applyProductionTemplatesOnPipelineEnter"], helpers["applyStageIdFilterToQuery"], helpers["applyWorkshopTemplateToProject"], helpers["artifactNamePrefix"], helpers["assertCanFlagLead"], helpers["assertCategoryFitsSource"], helpers["assertCrmAssigneeUserMatchesLeadCompany"], helpers["assertCrmEmployeeDeleteAllowed"], helpers["assertCrmStageAdvanceAllowed"], helpers["assertDealCrmManualStageChange"], helpers["assertDealResponsible"], helpers["assertDivisionAllowedForCompany"], helpers["assertLeadDocumentOwner"], helpers["assertLeadReadableByRegionScope"], helpers["assertRegionBelongsToCompany"], helpers["assertUserCanAssignCrmRegion"], helpers["assignProductionCompanyDealResponsibility"], helpers["attachAssigneesToCrmTasks"], helpers["attachAssignmentIdsToCrmTasks"], helpers["attachCrmNextOpenTaskDeadline"], helpers["attachLeadNewFlagForList"], helpers["attachLeadReplyParents"], helpers["attachLeadUserFlagsForList"], helpers["auth"], helpers["autoCreateProjectFromWonDeal"], helpers["autoFlowFns"], helpers["autoGenCrmTasksForNewLead"], helpers["buildAssignmentNotificationInsert"], helpers["buildChecklistLeadDocumentRow"], helpers["buildCrmDashboardMinimalKpis"], helpers["buildCrmLeadsRpcFilterParams"], helpers["buildCustomersOverviewSummary"], helpers["buildDealTemplateData"], helpers["buildDefaultDeadlineConfig"], helpers["buildFirstStageIdByPipeline"], helpers["buildPipelineStagesMap"], helpers["buildProcessedCommercialItems"], helpers["buildQuotedStageOrderByPipeline"], helpers["buildScanDuplicateGroups"], helpers["buildWonStageOrderByPipeline"], helpers["canUserViewDocByAllowlist"], helpers["chatUpload"], helpers["chunkArray"], helpers["classifyDealStageForStaffReport"], helpers["commentsTableMissing"], helpers["companyRegionExtraColumnsMissing"], helpers["companyRegionGeoColumnsMissing"], helpers["computeCrmDashboardLightStats"], helpers["computeCrmLiveVersionMs"], helpers["computeCustomersOverviewSummary"], helpers["computeIsNewLeadForUser"], helpers["computeOrgOverviewReportData"], helpers["computeStaffLeadDealReportData"], helpers["computeStaffPipelineDetailPayload"], helpers["countOpenOverdueCrmTasksForLeadIds"], helpers["createCrmAssignment"], helpers["createCrmLeadTask"], helpers["createFulfillmentChildDeal"], helpers["createNotif"], helpers["createNotification"], helpers["createProjectFromLead"], helpers["crmExecutorFieldsFromTemplateItem"], helpers["crmLeadCommentAttachmentsColumnMissing"], helpers["crmLeadCommentReadReceiptsTableMissing"], helpers["crmLeadRowVisibleToRequestUser"], helpers["crmListUsesLegacyFilters"], helpers["crmNoteActivityUpload"], helpers["crmReportAsOfMs"], helpers["crmReportCreatedAtFromIso"], helpers["crmReportCreatedAtToIso"], helpers["crmReportDayKeyVn"], helpers["crmRouteErrorText"], helpers["crmTaskDeadlineModuleKey"], helpers["crmTaskMeetsCompletionRequirements"], helpers["crmTaskMeetsRequiredFileTypes"], helpers["crmTaskRequiresCompletionEvidence"], helpers["crmTemplateMatchesLeadType"], helpers["deadlineToDateOnlyIso"], helpers["defaultCompanyInfo"], helpers["defaultKpiLedgerMonthStartYmd"], helpers["deleteCrmLeadTask"], helpers["deleteMirroredAssignmentFileForTaskAttachment"], helpers["duplicateLeadIdsFromLiteRows"], helpers["ecosystemModuleKeyForCrmDeadline"], helpers["effectivePipelineStageSlaDays"], helpers["emitCrmBadgeUpdateForProject"], helpers["emitCrmDashboardChanged"], helpers["emitCrmTaskChanged"], helpers["emptyStaffLeadDealAgg"], helpers["endOfCalendarDayAfterEntered"], helpers["enforceCommercialDocCompanyOnWrite"], helpers["enforceQuotaForRequest"], helpers["ensureDealLeadDocumentsForModuleTransition"], helpers["ensureDefaultCrmPipelineForCompany"], helpers["ensureMissingCrmTasksForLead"], helpers["ensureMissingCrmTasksForPipelineStage"], helpers["ensureMissingSxTasksForLead"], helpers["excelUpload"], helpers["executeLeadMerge"], helpers["executeZaloDealStageNotify"], helpers["fetchActivityCustomerIds"], helpers["fetchAllLeadsForSlaWatchlist"], helpers["fetchAssignmentForTask"], helpers["fetchCrmCommentReactionsAggregate"], helpers["fetchCrmLeadCommentNotifyUserIds"], helpers["fetchCrmLeadDetailRow"], helpers["fetchCrmLeadWithPipelineBadges"], helpers["fetchCrmLeadsByIdsOrdered"], helpers["fetchCrmLeadsForDashboardBatched"], helpers["fetchCrmLeadsForOrgReportBatched"], helpers["fetchCrmLeadsForUserDetailBatched"], helpers["fetchCrmLeadsLiteForDuplicateScan"], helpers["fetchCrmLeadsPageViaRpc"], helpers["fetchCrmPipelineZaloSlice"], helpers["fetchCrmSurveyEventsChunk"], helpers["fetchCrmSurveyVisitsForOrgReport"], helpers["fetchLeadCommentAudienceMembers"], helpers["fetchLeadCommentAudienceMembersForRead"], helpers["fetchLeadIdsForCrmRegion"], helpers["fetchLeadMentionMembers"], helpers["fetchOrgActivityFeed"], helpers["fetchPipelineWithStagesById"], helpers["fetchScopedCrmBundles"], helpers["fillTemplateDataFromStructure"], helpers["filterCrmTasksForLeadType"], helpers["filterUserIdsForCrmLeadScopedNotification"], helpers["findChecklistItem"], helpers["followupDismissExpiresAt"], helpers["fontBold"], helpers["fontRegular"], helpers["formatMoney"], helpers["formatVNDPdf"], helpers["formatVnPhoneLocal0From84"], helpers["fs"], helpers["generateDocPdf"], helpers["generateFlowTasks"], helpers["generateStepTasks"], helpers["getAppSettingValue"], helpers["getCompanyInfo"], helpers["getCompanyRegionsList"], helpers["getCrmLeadListSelect"], helpers["getCrmLeadRegionConstraint"], helpers["getCrmLeadTypesList"], helpers["getCrmLeadsListLegacy"], helpers["getCrmSourceCategoriesList"], helpers["getCrmSourcesList"], helpers["getDefaultCrmAttachmentShare"], helpers["getDefaultDealZaloTemplateStructure"], helpers["getDefaultLeadDocumentShareForDeal"], helpers["getDefaultPipelineIdForCompany"], helpers["getLeadDocumentFieldsFromCrmTask"], helpers["getNotifyTargets"], helpers["getOverdueFollowUps"], helpers["getPipelineIdForCompanyRegion"], helpers["getPipelineZaloSlice"], helpers["getPipelinesList"], helpers["getProjectCRMSummary"], helpers["getStagesByPipelineId"], helpers["getStaleLeads"], helpers["getZaloNotifySettings"], helpers["hydrateCrmLeadsByIdsWithStaff"], helpers["hydrateCrmLeadsRpcPage"], helpers["hydrateScanDuplicateLeads"], helpers["insertQuotationRow"], helpers["invalidateAppSettingKey"], helpers["invalidatePipelinesAndStages"], helpers["invalidateRegions"], helpers["invalidateSources"], helpers["invalidateTenantUsageCache"], helpers["invokeCrmLeadsStageCountsRpc"], helpers["isAdminLike"], helpers["isAllowedLeadCommentAttachmentUrl"], helpers["isChotSanXuatCrmTaskTitle"], helpers["isCrmCompanyAdminUser"], helpers["isCrmDealAssigneeLocked"], helpers["isCrmLeadTypeColorMissingError"], helpers["isCrmModuleAdmin"], helpers["isCrmPipelinesTableMissingError"], helpers["isCrmRegionAdminUser"], helpers["isCrmSystemAdminUser"], helpers["isDealStageHoanThanhForZalo"], helpers["isDefaultAssigneeIdsColumnError"], helpers["isExecutorColumnError"], helpers["isPlatformAdmin"], helpers["isPostgresUniqueViolation"], helpers["isQuotationsSourceExcelColumnMissingError"], helpers["isSxRelationshipError"], helpers["isSystemAdmin"], helpers["isUuidString"], helpers["isValidDealZaloTemplateStructure"], helpers["isVcRelationshipError"], helpers["isVptCompanyCommercialDocViewer"], helpers["lastNominatimGeocodeAt"], helpers["leadChatFilesMulter"], helpers["leadChatJsonOrFiles"], helpers["listQuotationExcelSheets"], helpers["loadCrmTaskAttachmentCountMap"], helpers["loadOrgReportStageMap"], helpers["loadZaloLinkedLeadIdSet"], helpers["logDealActivityComment"], helpers["logDealDeadlineChangeComment"], helpers["logDealStageChangeComment"], helpers["logKanbanDeadlineUnifiedHistory"], helpers["logLeadCommentMentionActivity"], helpers["logProjectFileActivity"], helpers["mapCustomerOverviewRow"], helpers["mapLeadDisplayPhone"], helpers["mapQuotationItemsToOrderRows"], helpers["maskCustomerPhoneDisplay"], helpers["maskZaloAccessTokenPreview"], helpers["maybeSendZaloOnDealStageEnter"], helpers["mergeCrmStageDefaultAssigneeIntoUpdates"], helpers["mergeCustomerIntoTarget"], helpers["misaService"], helpers["multer"], helpers["nextCode"], helpers["nextTbProjectCode"], helpers["normalizeCrmActivityAttachments"], helpers["normalizeCrmLeadCommentAttachments"], helpers["normalizeCrmStageDefaultAssigneeUserId"], helpers["normalizeCrmUserRole"], helpers["normalizeLeadSeenByKeys"], helpers["normalizeOrgReportSurveyVisitRow"], helpers["normalizePipelineStageSlaDaysForDb"], helpers["normalizePipelineStagesList"], helpers["normalizeRegionIdList"], helpers["normalizeTemplateChecklistForCrmTask"], helpers["normalizeTemplateItemAssigneeIds"], helpers["normalizeTimestamp"], helpers["normalizeTitleFold"], helpers["normalizeVnPhoneTo84"], helpers["notifyDealCommentMentions"], helpers["notifyDealCommentParticipants"], helpers["notifyMultiple"], helpers["notifyMultipleShared"], helpers["notifyNewCrmAssignmentAssignees"], helpers["notifyProductionDocumentUploaded"], helpers["onLeadWon"], helpers["onOrderConfirmed"], helpers["onProjectCompleted"], helpers["onQuotationAccepted"], helpers["orgReportAttachFirstStageRates"], helpers["orgReportBumpFirstStageMetrics"], helpers["orgReportBumpMetrics"], helpers["orgReportBumpOpenOverdue"], helpers["orgReportBumpReceptionMetrics"], helpers["orgReportCancelRatePct"], helpers["orgReportClosedWonDealCount"], helpers["orgReportClosedWonValue"], helpers["orgReportCompareSummary"], helpers["orgReportConversionRate"], helpers["orgReportDayKey"], helpers["orgReportDealCloseValueRatePct"], helpers["orgReportDealCountsExpected"], helpers["orgReportDealIsClosedWon"], helpers["orgReportDealIsCompleted"], helpers["orgReportDealIsQuotedOrAfter"], helpers["orgReportDealProbability"], helpers["orgReportDealSplitBuckets"], helpers["orgReportExtendedDealMetrics"], helpers["orgReportFirstStageOnTimeRatePct"], helpers["orgReportFirstStageOverdueRatePct"], helpers["orgReportIsReceptionOverdue"], helpers["orgReportIsSlaOverdue"], helpers["orgReportKpiPeriodStart"], helpers["orgReportNumEst"], helpers["orgReportOverdueRatePct"], helpers["orgReportOwnerId"], helpers["orgReportPctDelta"], helpers["orgReportPreviousPeriod"], helpers["orgReportQuoteValueCloseRatePct"], helpers["orgReportQuoteWinRatePct"], helpers["orgReportReceptionOverdueRatePct"], helpers["orgReportReceptionSlaMinutes"], helpers["orgReportStageIsClosed"], helpers["orgReportStageIsLostOrCancelled"], helpers["orgReportTotalDealCount"], helpers["parseChecklist"], helpers["parseCrmLeadsPageRpc"], helpers["parseCrmReportDateRange"], helpers["parseCrmStageCountsNumericMap"], helpers["parseCrmStageCountsRpc"], helpers["parseExcelMoneyFromMappedColumn"], helpers["parseLeadIdUuidList"], helpers["parseLeadIdsCsvQuery"], helpers["parseLeadIdsFromBody"], helpers["parseLeadSeenByRaw"], helpers["parseQuotationExcelBuffer"], helpers["parseStageIdsFromQuery"], helpers["parseUuidArrayJsonb"], helpers["parseVietnameseMeasure"], helpers["parseVietnameseMoney"], helpers["path"], helpers["persistAssignmentNotification"], helpers["pgCrmDuplicateLeadIds"], helpers["pickDealZaloTemplatePayload"], helpers["pipeOrgOverviewReportPdf"], helpers["pipeStaffLeadDealSummaryPdf"], helpers["pipeStaffPipelineDetailPdf"], helpers["pipelineHasExplicitCompleted"], helpers["pipelineHasExplicitExpected"], helpers["pipelineHasExplicitWon"], helpers["plannerTableMissing"], helpers["postCrmStageDefaultAssigneeComment"], helpers["primaryTemplateItemAssigneeId"], helpers["rcInvalidateTags"], helpers["reactionsTableMissing"], helpers["redactCrmTaskNotesForViewer"], helpers["regionGeocodeInflight"], helpers["repairCrmDealPipelineDisplay"], helpers["requireUserCompanyId"], helpers["requireUserCompanyIdResolved"], helpers["resolveAssignmentIdForTask"], helpers["resolveCanonicalCrmLeadId"], helpers["resolveCommercialDocListCompanyScope"], helpers["resolveCrmBundleTemplateScope"], helpers["resolveCrmLeadsDeadlinesMap"], helpers["resolveCrmLeadsKanbanLite"], helpers["resolveCrmLeadsMergedQuery"], helpers["resolveCrmLeadsSkipDeadline"], helpers["resolveCrmLedgerNetByLeadIdsPayload"], helpers["resolveCrmReportScope"], helpers["resolveCrmTaskWriteLeadId"], helpers["resolveExecutorCompanyId"], helpers["resolveKanbanStagesForCompany"], helpers["resolveLeadCommentMentionIds"], helpers["resolveProductionCompanyForDealStage"], helpers["resolveProductionHandoverResponsibleUserId"], helpers["resolveReopenTargetStageId"], helpers["resolveRpcRegionIdsForCrmList"], helpers["resolveTenantIdForQuota"], helpers["resolveZaloDealTemplateId"], helpers["respondIfCrmPipelinesTableMissing"], helpers["responseCache"], helpers["restoreCrmTaskChecklistFromWorkshopTemplate"], helpers["resyncCrmPipelineTasksForLead"], helpers["sanitizeIsoDateQueryParam"], helpers["scheduleRegionGeocoding"], helpers["scopedAdminCompanyId"], helpers["scopedCrmCompanyIdForWrite"], helpers["sendZaloTemplateMessage"], helpers["setLeadFlag"], helpers["shallowMergeTemplateData"], helpers["skipSxWorkQuickComplete"], helpers["snapshotOrderRowFromQuotation"], helpers["stripCrmAssigneeFromWonStageUpdates"], helpers["stripCrmLeadTypeColorFromSelect"], helpers["stripQuotationsSourceExcelFields"], helpers["sumCrmKpiLedgerNetByLeadIds"], helpers["sumCrmKpiLedgerNetByUserForOrgReport"], helpers["sumCrmKpiLedgerNetByUserIds"], helpers["sumCrmKpiLedgerNetByUserIdsInDateRange"], helpers["supabase"], helpers["syncAllTaskArtifactsToAssignment"], helpers["syncChecklistItemNotes"], helpers["syncCrmLeadSxPipelineFromProject"], helpers["syncQuotationDepositToDealAndProject"], helpers["syncSxKanbanFromCrmProductionStage"], helpers["syncTaskAttachmentToAssignment"], helpers["templateItemAssigneePatch"], helpers["toCrmTaskChecklist"], helpers["unifyCrmLeadResponsibleFields"], helpers["updateCrmLeadTask"], helpers["updateQuotationRow"], helpers["upsertZaloNotifySettings"], helpers["userCanAccessCrmLeadAsParticipant"], helpers["userCanAccessCrmLeadViaVisibility"], helpers["userCanAssignAnyCrmRegion"], helpers["userCanBypassCrmDeleteRestriction"], helpers["userHasSeenLeadInSeenBy"], helpers["userIsAdmin"], helpers["userIsCrmCompanyOrRegionAdmin"], helpers["userMayAccessQuotationRow"], helpers["userSeesAllCrmDeals"], helpers["userSeesAllCrmDealsForScope"], helpers["userSeesAllCrmLeads"], helpers["userSeesAllCrmLeadsForScope"], helpers["uuidQueryOrNull"], helpers["validateProductionCompanyId"]);

module.exports = r;
