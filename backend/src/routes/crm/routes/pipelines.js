/**
 * CRM routes: pipelines
 * Auto-extracted — handlers close over shared helpers via IIFE.
 */
const { Router } = require('express');
const helpers = require('../shared/helpersBundle');

const r = Router();

(function (ALLOWED_DEADLINE_FIELDS, CRM_COMMENT_ALLOWED_REACTION_EMOJI, CRM_LEAD_KANBAN_LITE_SELECT, CRM_LEAD_LIST_SELECT, CRM_LEAD_LIST_SELECT_BASE, CRM_LEAD_LIST_SELECT_EXTRA, CRM_LEAD_REGION_EMBED, CRM_NEW_LEAD_MAX_AGE_MS, CRM_TASK_SELECT, CRM_UUID_RE, CUSTOMERS_IN_CHUNK, CUSTOMERS_OVERVIEW_NO_MATCH_ID, DEAL_PRE_CONTRACT_SLUGS_STAFF, DEAL_REPORT_BUCKET_VALUES, DEFAULT_CHECKLISTS, DEFAULT_DEADLINE_BUCKETS, DEFAULT_PIPELINE_STAGE_SLA_DAYS, FOLLOWUP_TIME_BUCKETS, PDFDocument, QUOTATIONS_SOURCE_EXCEL_COLS, Router, SCAN_DUP_LITE_SELECT, STAFF_LEAD_DEAL_REPORT_ROLES, SURVEY_EVENT_SELECT, SURVEY_EVENT_TYPES, XLSX, ZALO_APP_SETTING_KEY, _crmLeadSelectMigrationChecked, _crmLeadTypeColorAvailable, _vcPipelineStageAvailable, addPhoneToAutoLeadBlocklist, aggregateCrmCommentReactions, aggregateOrgReportRows, appendFulfillmentChildTasksForMasterDeal, applyAllActiveWorkshopTemplatesForArea, applyAssigneesToInsertedCrmTasks, applyCrmLeadRegionFilterToQuery, applyCrmTaskTemplatesToCompanyRegions, applyCustomerIdInFilter, applyCustomersOverviewSearch, applyDefaultWorkshopTemplatesForNewProject, applyLeadOrCustomerSalesFilter, applyProductionTemplateToFulfillmentLead, applyProductionTemplatesOnPipelineEnter, applyStageIdFilterToQuery, applyWorkshopTemplateToProject, artifactNamePrefix, assertCanFlagLead, assertCategoryFitsSource, assertCrmAssigneeUserMatchesLeadCompany, assertCrmEmployeeDeleteAllowed, assertCrmStageAdvanceAllowed, assertDealCrmManualStageChange, assertDealResponsible, assertDivisionAllowedForCompany, assertLeadDocumentOwner, assertLeadReadableByRegionScope, assertRegionBelongsToCompany, assertUserCanAssignCrmRegion, assignProductionCompanyDealResponsibility, attachAssigneesToCrmTasks, attachAssignmentIdsToCrmTasks, attachCrmNextOpenTaskDeadline, attachLeadNewFlagForList, attachLeadReplyParents, attachLeadUserFlagsForList, auth, autoCreateProjectFromWonDeal, autoFlowFns, autoGenCrmTasksForNewLead, buildAssignmentNotificationInsert, buildChecklistLeadDocumentRow, buildCrmDashboardMinimalKpis, buildCrmLeadsRpcFilterParams, buildCustomersOverviewSummary, buildDealTemplateData, buildDefaultDeadlineConfig, buildFirstStageIdByPipeline, buildPipelineStagesMap, buildProcessedCommercialItems, buildQuotedStageOrderByPipeline, buildScanDuplicateGroups, buildWonStageOrderByPipeline, canUserViewDocByAllowlist, chatUpload, chunkArray, classifyDealStageForStaffReport, commentsTableMissing, companyRegionExtraColumnsMissing, companyRegionGeoColumnsMissing, computeCrmDashboardLightStats, computeCrmLiveVersionMs, computeCustomersOverviewSummary, computeIsNewLeadForUser, computeOrgOverviewReportData, computeStaffLeadDealReportData, computeStaffPipelineDetailPayload, countOpenOverdueCrmTasksForLeadIds, createCrmAssignment, createCrmLeadTask, createFulfillmentChildDeal, createNotif, createNotification, createProjectFromLead, crmExecutorFieldsFromTemplateItem, crmLeadCommentAttachmentsColumnMissing, crmLeadCommentReadReceiptsTableMissing, crmLeadRowVisibleToRequestUser, crmListUsesLegacyFilters, crmNoteActivityUpload, crmReportAsOfMs, crmReportCreatedAtFromIso, crmReportCreatedAtToIso, crmReportDayKeyVn, crmRouteErrorText, crmTaskDeadlineModuleKey, crmTaskMeetsCompletionRequirements, crmTaskMeetsRequiredFileTypes, crmTaskRequiresCompletionEvidence, crmTemplateMatchesLeadType, deadlineToDateOnlyIso, defaultCompanyInfo, defaultKpiLedgerMonthStartYmd, deleteCrmLeadTask, deleteMirroredAssignmentFileForTaskAttachment, duplicateLeadIdsFromLiteRows, ecosystemModuleKeyForCrmDeadline, effectivePipelineStageSlaDays, emitCrmBadgeUpdateForProject, emitCrmDashboardChanged, emitCrmTaskChanged, emptyStaffLeadDealAgg, endOfCalendarDayAfterEntered, enforceCommercialDocCompanyOnWrite, enforceQuotaForRequest, ensureDealLeadDocumentsForModuleTransition, ensureDefaultCrmPipelineForCompany, ensureMissingCrmTasksForLead, ensureMissingCrmTasksForPipelineStage, ensureMissingSxTasksForLead, excelUpload, executeLeadMerge, executeZaloDealStageNotify, fetchActivityCustomerIds, fetchAllLeadsForSlaWatchlist, fetchAssignmentForTask, fetchCrmCommentReactionsAggregate, fetchCrmLeadCommentNotifyUserIds, fetchCrmLeadDetailRow, fetchCrmLeadWithPipelineBadges, fetchCrmLeadsByIdsOrdered, fetchCrmLeadsForDashboardBatched, fetchCrmLeadsForOrgReportBatched, fetchCrmLeadsForUserDetailBatched, fetchCrmLeadsLiteForDuplicateScan, fetchCrmLeadsPageViaRpc, fetchCrmPipelineZaloSlice, fetchCrmSurveyEventsChunk, fetchCrmSurveyVisitsForOrgReport, fetchLeadCommentAudienceMembers, fetchLeadCommentAudienceMembersForRead, fetchLeadIdsForCrmRegion, fetchLeadMentionMembers, fetchOrgActivityFeed, fetchPipelineWithStagesById, fetchScopedCrmBundles, fillTemplateDataFromStructure, filterCrmTasksForLeadType, filterUserIdsForCrmLeadScopedNotification, findChecklistItem, followupDismissExpiresAt, fontBold, fontRegular, formatMoney, formatVNDPdf, formatVnPhoneLocal0From84, fs, generateDocPdf, generateFlowTasks, generateStepTasks, getAppSettingValue, getCompanyInfo, getCompanyRegionsList, getCrmLeadListSelect, getCrmLeadRegionConstraint, getCrmLeadTypesList, getCrmLeadsListLegacy, getCrmSourceCategoriesList, getCrmSourcesList, getDefaultCrmAttachmentShare, getDefaultDealZaloTemplateStructure, getDefaultLeadDocumentShareForDeal, getDefaultPipelineIdForCompany, getLeadDocumentFieldsFromCrmTask, getNotifyTargets, getOverdueFollowUps, getPipelineIdForCompanyRegion, getPipelineZaloSlice, getPipelinesList, getProjectCRMSummary, getStagesByPipelineId, getStaleLeads, getZaloNotifySettings, hydrateCrmLeadsByIdsWithStaff, hydrateCrmLeadsRpcPage, hydrateScanDuplicateLeads, insertQuotationRow, invalidateAppSettingKey, invalidatePipelinesAndStages, invalidateRegions, invalidateSources, invalidateTenantUsageCache, invokeCrmLeadsStageCountsRpc, isAdminLike, isAllowedLeadCommentAttachmentUrl, isChotSanXuatCrmTaskTitle, isCrmCompanyAdminUser, isCrmDealAssigneeLocked, isCrmLeadTypeColorMissingError, isCrmModuleAdmin, isCrmPipelinesTableMissingError, isCrmRegionAdminUser, isCrmSystemAdminUser, isDealStageHoanThanhForZalo, isDefaultAssigneeIdsColumnError, isExecutorColumnError, isPlatformAdmin, isPostgresUniqueViolation, isQuotationsSourceExcelColumnMissingError, isSxRelationshipError, isSystemAdmin, isUuidString, isValidDealZaloTemplateStructure, isVcRelationshipError, isVptCompanyCommercialDocViewer, lastNominatimGeocodeAt, leadChatFilesMulter, leadChatJsonOrFiles, listQuotationExcelSheets, loadCrmTaskAttachmentCountMap, loadOrgReportStageMap, loadZaloLinkedLeadIdSet, logDealActivityComment, logDealDeadlineChangeComment, logDealStageChangeComment, logKanbanDeadlineUnifiedHistory, logLeadCommentMentionActivity, logProjectFileActivity, mapCustomerOverviewRow, mapLeadDisplayPhone, mapQuotationItemsToOrderRows, maskCustomerPhoneDisplay, maskZaloAccessTokenPreview, maybeSendZaloOnDealStageEnter, mergeCrmStageDefaultAssigneeIntoUpdates, mergeCustomerIntoTarget, misaService, multer, nextCode, nextTbProjectCode, normalizeCrmActivityAttachments, normalizeCrmLeadCommentAttachments, normalizeCrmStageDefaultAssigneeUserId, normalizeCrmUserRole, normalizeLeadSeenByKeys, normalizeOrgReportSurveyVisitRow, normalizePipelineStageSlaDaysForDb, normalizePipelineStagesList, normalizeRegionIdList, normalizeTemplateChecklistForCrmTask, normalizeTemplateItemAssigneeIds, normalizeTimestamp, normalizeTitleFold, normalizeVnPhoneTo84, notifyDealCommentMentions, notifyDealCommentParticipants, notifyMultiple, notifyMultipleShared, notifyNewCrmAssignmentAssignees, notifyProductionDocumentUploaded, onLeadWon, onOrderConfirmed, onProjectCompleted, onQuotationAccepted, orgReportAttachFirstStageRates, orgReportBumpFirstStageMetrics, orgReportBumpMetrics, orgReportBumpOpenOverdue, orgReportBumpReceptionMetrics, orgReportCancelRatePct, orgReportClosedWonDealCount, orgReportClosedWonValue, orgReportCompareSummary, orgReportConversionRate, orgReportDayKey, orgReportDealCloseValueRatePct, orgReportDealCountsExpected, orgReportDealIsClosedWon, orgReportDealIsCompleted, orgReportDealIsQuotedOrAfter, orgReportDealProbability, orgReportDealSplitBuckets, orgReportExtendedDealMetrics, orgReportFirstStageOnTimeRatePct, orgReportFirstStageOverdueRatePct, orgReportIsReceptionOverdue, orgReportIsSlaOverdue, orgReportKpiPeriodStart, orgReportNumEst, orgReportOverdueRatePct, orgReportOwnerId, orgReportPctDelta, orgReportPreviousPeriod, orgReportQuoteValueCloseRatePct, orgReportQuoteWinRatePct, orgReportReceptionOverdueRatePct, orgReportReceptionSlaMinutes, orgReportStageIsClosed, orgReportStageIsLostOrCancelled, orgReportTotalDealCount, parseChecklist, parseCrmLeadsPageRpc, parseCrmReportDateRange, parseCrmStageCountsNumericMap, parseCrmStageCountsRpc, parseExcelMoneyFromMappedColumn, parseLeadIdUuidList, parseLeadIdsCsvQuery, parseLeadIdsFromBody, parseLeadSeenByRaw, parseQuotationExcelBuffer, parseStageIdsFromQuery, parseUuidArrayJsonb, parseVietnameseMeasure, parseVietnameseMoney, path, persistAssignmentNotification, pgCrmDuplicateLeadIds, pickDealZaloTemplatePayload, pipeOrgOverviewReportPdf, pipeStaffLeadDealSummaryPdf, pipeStaffPipelineDetailPdf, pipelineHasExplicitCompleted, pipelineHasExplicitExpected, pipelineHasExplicitWon, plannerTableMissing, postCrmStageDefaultAssigneeComment, primaryTemplateItemAssigneeId, rcInvalidateTags, reactionsTableMissing, redactCrmTaskNotesForViewer, regionGeocodeInflight, repairCrmDealPipelineDisplay, requireUserCompanyId, requireUserCompanyIdResolved, resolveAssignmentIdForTask, resolveCanonicalCrmLeadId, resolveCommercialDocListCompanyScope, resolveCrmBundleTemplateScope, resolveCrmLeadsDeadlinesMap, resolveCrmLeadsKanbanLite, resolveCrmLeadsMergedQuery, resolveCrmLeadsSkipDeadline, resolveCrmLedgerNetByLeadIdsPayload, resolveCrmReportScope, resolveCrmTaskWriteLeadId, resolveExecutorCompanyId, resolveKanbanStagesForCompany, resolveLeadCommentMentionIds, resolveProductionCompanyForDealStage, resolveProductionHandoverResponsibleUserId, resolveReopenTargetStageId, resolveRpcRegionIdsForCrmList, resolveTenantIdForQuota, resolveZaloDealTemplateId, respondIfCrmPipelinesTableMissing, responseCache, restoreCrmTaskChecklistFromWorkshopTemplate, resyncCrmPipelineTasksForLead, sanitizeIsoDateQueryParam, scheduleRegionGeocoding, scopedAdminCompanyId, scopedCrmCompanyIdForWrite, sendZaloTemplateMessage, setLeadFlag, shallowMergeTemplateData, skipSxWorkQuickComplete, snapshotOrderRowFromQuotation, stripCrmAssigneeFromWonStageUpdates, stripCrmLeadTypeColorFromSelect, stripQuotationsSourceExcelFields, sumCrmKpiLedgerNetByLeadIds, sumCrmKpiLedgerNetByUserForOrgReport, sumCrmKpiLedgerNetByUserIds, sumCrmKpiLedgerNetByUserIdsInDateRange, supabase, syncAllTaskArtifactsToAssignment, syncChecklistItemNotes, syncCrmLeadSxPipelineFromProject, syncQuotationDepositToDealAndProject, syncSxKanbanFromCrmProductionStage, syncTaskAttachmentToAssignment, templateItemAssigneePatch, toCrmTaskChecklist, unifyCrmLeadResponsibleFields, updateCrmLeadTask, updateQuotationRow, upsertZaloNotifySettings, userCanAccessCrmLeadAsParticipant, userCanAccessCrmLeadViaVisibility, userCanAssignAnyCrmRegion, userCanBypassCrmDeleteRestriction, userHasSeenLeadInSeenBy, userIsAdmin, userIsCrmCompanyOrRegionAdmin, userMayAccessQuotationRow, userSeesAllCrmDeals, userSeesAllCrmDealsForScope, userSeesAllCrmLeads, userSeesAllCrmLeadsForScope, uuidQueryOrNull, validateProductionCompanyId) {
r.get('/pipelines', responseCache({ ttl: 120, scope: 'company', tags: ['crm:taxonomy'] }), async (req, res) => {
  try {
    const activeOnly = req.query.active !== 'false';
    let companyFilter = null;
    const sacPl = scopedAdminCompanyId(req);
    if (sacPl) {
      companyFilter = sacPl;
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      companyFilter = cid;
    }
    const data = await getPipelinesList({ companyFilter, activeOnly });
    res.json(data);
  } catch (e) {
    if (respondIfCrmPipelinesTableMissing(res, e)) return;
    res.status(500).json({ error: crmRouteErrorText(e) || 'Lỗi server' });
  }
});

r.get('/pipelines/:id', async (req, res) => {
  try {
    const { data, error } = await fetchPipelineWithStagesById(req.params.id);
    if (error) throw error;
    const sacPl1 = scopedAdminCompanyId(req);
    if (sacPl1) {
      if (String(data.company_id || '') !== String(sacPl1)) return res.status(403).json({ error: 'Không có quyền xem pipeline công ty khác' });
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      if (String(data.company_id || '') !== String(cid)) return res.status(403).json({ error: 'Không có quyền xem pipeline công ty khác' });
    }
    if (data?.stages) data.stages.sort((a, b) => a.order_index - b.order_index);
    res.json(data);
  } catch (e) {
    if (respondIfCrmPipelinesTableMissing(res, e)) return;
    res.status(500).json({ error: crmRouteErrorText(e) || 'Lỗi server' });
  }
});

r.post('/pipelines', async (req, res) => {
  try {
    const b = req.body;
    if (!b.name) return res.status(400).json({ error: 'Thiếu tên pipeline' });
    const sacPNew = scopedAdminCompanyId(req);
    if (sacPNew) {
      if (b.company_id && String(b.company_id) !== String(sacPNew)) {
        return res.status(403).json({ error: 'Không thể tạo pipeline cho công ty khác' });
      }
      b.company_id = sacPNew;
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      if (b.company_id && String(b.company_id) !== String(cid)) return res.status(403).json({ error: 'Không thể tạo pipeline cho công ty khác' });
      b.company_id = cid;
    }
    const { data, error } = await supabase.from('crm_pipelines').insert({
      name: b.name, company_id: b.company_id || null, description: b.description || null,
      is_default: b.is_default || false, is_active: true,
    }).select('*, company:companies(id, name)').single();
    if (error) throw error;

    // Auto-create default stages (lead + deal)
    const defaultLead = [
      { name: 'Mới', icon: '🆕', color: '#94A3B8', order_index: 1 },
      { name: 'Đã liên hệ', icon: '📞', color: '#3B82F6', order_index: 2 },
      { name: 'Đang tư vấn', icon: '💬', color: '#8B5CF6', order_index: 3 },
      { name: 'Chờ phản hồi', icon: '⏳', color: '#F59E0B', order_index: 4 },
      { name: 'Chuyển Deal', icon: '✅', color: '#10B981', order_index: 5, is_won: true },
      { name: 'Mất', icon: '❌', color: '#EF4444', order_index: 6, is_lost: true },
    ];
    const defaultDeal = [
      { name: 'Deal mới', icon: '🆕', color: '#06B6D4', order_index: 1 },
      { name: 'Báo giá', icon: '💰', color: '#F59E0B', order_index: 2 },
      { name: 'Đàm phán', icon: '🤝', color: '#8B5CF6', order_index: 3 },
      { name: 'Ký hợp đồng', icon: '📝', color: '#3B82F6', order_index: 4 },
      { name: 'Thắng', icon: '🏆', color: '#10B981', order_index: 5, is_won: true },
      { name: 'Thua', icon: '❌', color: '#EF4444', order_index: 6, is_lost: true },
    ];
    const stages = [
      ...defaultLead.map(s => ({ ...s, pipeline_id: data.id, pipeline_type: 'lead', is_active: true })),
      ...defaultDeal.map(s => ({ ...s, pipeline_id: data.id, pipeline_type: 'deal', is_active: true })),
    ];
    await supabase.from('crm_pipeline_stages').insert(stages);

    await invalidatePipelinesAndStages();
    res.status(201).json(data);
  } catch (e) {
    if (respondIfCrmPipelinesTableMissing(res, e)) return;
    res.status(500).json({ error: crmRouteErrorText(e) || 'Lỗi server' });
  }
});

r.put('/pipelines/:id', async (req, res) => {
  try {
    const sacPUp = scopedAdminCompanyId(req);
    if (sacPUp) {
      const { data: existing } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', req.params.id).single();
      if (!existing) return res.status(404).json({ error: 'Không tìm thấy pipeline' });
      if (String(existing.company_id || '') !== String(sacPUp)) return res.status(403).json({ error: 'Không có quyền sửa pipeline công ty khác' });
      if (req.body.company_id !== undefined && String(req.body.company_id || '') !== String(sacPUp)) {
        return res.status(403).json({ error: 'Không thể đổi pipeline sang công ty khác' });
      }
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      const { data: existing } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', req.params.id).single();
      if (!existing) return res.status(404).json({ error: 'Không tìm thấy pipeline' });
      if (String(existing.company_id || '') !== String(cid)) return res.status(403).json({ error: 'Không có quyền sửa pipeline công ty khác' });
      // Non-admin không được đổi company_id
      if (req.body.company_id !== undefined && String(req.body.company_id || '') !== String(cid)) {
        return res.status(403).json({ error: 'Không thể đổi pipeline sang công ty khác' });
      }
    }
    const update = {};
    ['name', 'company_id', 'description', 'is_default', 'is_active'].forEach(f => {
      if (req.body[f] !== undefined) update[f] = req.body[f];
    });
    if (req.body.zalo_template_id !== undefined) {
      const zt = req.body.zalo_template_id;
      update.zalo_template_id = zt == null || String(zt).trim() === '' ? null : String(zt).trim();
    }
    if (req.body.zalo_merge_template_data !== undefined) {
      const m = req.body.zalo_merge_template_data;
      update.zalo_merge_template_data =
        m && typeof m === 'object' && !Array.isArray(m) ? m : {};
    }
    if (req.body.allow_employee_delete_lead !== undefined) {
      update.allow_employee_delete_lead = !!req.body.allow_employee_delete_lead;
    }
    if (req.body.allow_employee_delete_deal !== undefined) {
      update.allow_employee_delete_deal = !!req.body.allow_employee_delete_deal;
    }
    if (req.body.region_id !== undefined) {
      const rawRegion = req.body.region_id;
      if (rawRegion === null || String(rawRegion).trim() === '') {
        update.region_id = null;
      } else {
        let companyIdForCheck = update.company_id;
        if (!companyIdForCheck) {
          const { data: curPl } = await supabase.from('crm_pipelines').select('company_id').eq('id', req.params.id).maybeSingle();
          companyIdForCheck = curPl?.company_id || null;
        }
        const { data: region } = await supabase.from('company_regions').select('id, company_id').eq('id', rawRegion).maybeSingle();
        if (!region || (companyIdForCheck && String(region.company_id || '') !== String(companyIdForCheck))) {
          return res.status(400).json({ error: 'Khu vực không thuộc công ty của pipeline' });
        }
        update.region_id = rawRegion;
      }
    }
    update.updated_at = new Date().toISOString();
    let { data, error } = await supabase.from('crm_pipelines').update(update)
      .eq('id', req.params.id).select('*, company:companies(id, name)').single();
    if (error && /allow_employee_delete_(lead|deal)/.test(error.message || '')) {
      delete update.allow_employee_delete_lead;
      delete update.allow_employee_delete_deal;
      ({ data, error } = await supabase.from('crm_pipelines').update(update)
        .eq('id', req.params.id).select('*, company:companies(id, name)').single());
    }
    if (error) throw error;
    await invalidatePipelinesAndStages();
    res.json(data);
  } catch (e) {
    if (respondIfCrmPipelinesTableMissing(res, e)) return;
    res.status(500).json({ error: crmRouteErrorText(e) || 'Lỗi server' });
  }
});

r.delete('/pipelines/:id', async (req, res) => {
  try {
    const sacPDel = scopedAdminCompanyId(req);
    if (sacPDel) {
      const { data: existing } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', req.params.id).single();
      if (!existing) return res.status(404).json({ error: 'Không tìm thấy pipeline' });
      if (String(existing.company_id || '') !== String(sacPDel)) return res.status(403).json({ error: 'Không có quyền xóa pipeline công ty khác' });
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      const { data: existing } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', req.params.id).single();
      if (!existing) return res.status(404).json({ error: 'Không tìm thấy pipeline' });
      if (String(existing.company_id || '') !== String(cid)) return res.status(403).json({ error: 'Không có quyền xóa pipeline công ty khác' });
    }
    // Check leads using this pipeline
    const { count } = await supabase.from('crm_leads').select('id', { count: 'exact', head: true })
      .eq('pipeline_id', req.params.id);
    if (count > 0) return res.status(400).json({ error: `Không thể xóa — ${count} lead/deal đang dùng pipeline này` });
    // Delete stages first, then pipeline
    await supabase.from('crm_pipeline_stages').delete().eq('pipeline_id', req.params.id);
    await supabase.from('crm_pipelines').delete().eq('id', req.params.id);
    await invalidatePipelinesAndStages();
    res.json({ message: 'Đã xóa pipeline' });
  } catch (e) {
    if (respondIfCrmPipelinesTableMissing(res, e)) return;
    res.status(500).json({ error: crmRouteErrorText(e) || 'Lỗi server' });
  }
});

r.post('/pipelines/:id/copy', async (req, res) => {
  try {
    if (!userIsAdmin(req.user?.role)) return res.status(403).json({ error: 'Chỉ admin được copy pipeline' });
    const sourceId = req.params.id;
    const b = req.body || {};
    const targetCompanyId = b.target_company_id || null;
    if (!targetCompanyId) return res.status(400).json({ error: 'Thiếu target_company_id' });
    const sacCopy = scopedAdminCompanyId(req);
    if (sacCopy) {
      if (String(targetCompanyId) !== String(sacCopy)) {
        return res.status(403).json({ error: 'Chỉ được copy pipeline trong công ty của bạn' });
      }
      const { data: srcRow } = await supabase.from('crm_pipelines').select('company_id').eq('id', sourceId).maybeSingle();
      if (String(srcRow?.company_id || '') !== String(sacCopy)) {
        return res.status(403).json({ error: 'Pipeline nguồn không thuộc công ty của bạn' });
      }
    }

    const { data: src, error: srcErr } = await supabase
      .from('crm_pipelines')
      .select('id, name, description, is_active, allow_employee_delete_lead, allow_employee_delete_deal, stages:crm_pipeline_stages(*)')
      .eq('id', sourceId)
      .single();
    if (srcErr) throw srcErr;

    const name = (b.name || '').trim() || `${src.name} (Copy)`;
    const copyInsert = {
      name,
      company_id: targetCompanyId,
      description: src.description || null,
      is_default: !!b.set_default,
      is_active: src.is_active !== false,
    };
    if (src.allow_employee_delete_lead !== undefined) {
      copyInsert.allow_employee_delete_lead = src.allow_employee_delete_lead !== false;
    }
    if (src.allow_employee_delete_deal !== undefined) {
      copyInsert.allow_employee_delete_deal = src.allow_employee_delete_deal !== false;
    }
    let { data: created, error: insErr } = await supabase.from('crm_pipelines').insert(copyInsert)
      .select('*, company:companies(id, name)').single();
    if (insErr && /allow_employee_delete_(lead|deal)/.test(insErr.message || '')) {
      delete copyInsert.allow_employee_delete_lead;
      delete copyInsert.allow_employee_delete_deal;
      ({ data: created, error: insErr } = await supabase.from('crm_pipelines').insert(copyInsert)
        .select('*, company:companies(id, name)').single());
    }
    if (insErr) throw insErr;

    const stages = (src.stages || []).slice().sort((a, b2) => (a.order_index ?? 0) - (b2.order_index ?? 0));
    if (stages.length) {
      const inserts = stages.map((s) => ({
        pipeline_id: created.id,
        pipeline_type: s.pipeline_type,
        name: s.name,
        color: s.color,
        icon: s.icon,
        order_index: s.order_index,
        is_active: s.is_active !== false,
        is_won: !!s.is_won,
        is_lost: !!s.is_lost,
        send_zalo_on_enter: !!s.send_zalo_on_enter,
        create_event_on_enter: !!s.create_event_on_enter,
        sync_role: s.sync_role || null,
        apply_default_assignee_on_enter: !!s.apply_default_assignee_on_enter,
        default_assignee_user_id: s.default_assignee_user_id || null,
        default_probability: s.default_probability != null && s.default_probability !== '' ? s.default_probability : null,
        description: s.description != null && String(s.description).trim() !== '' ? String(s.description).trim() : null,
        counts_as_won_revenue: !!s.counts_as_won_revenue,
        counts_as_completed_revenue: !!s.counts_as_completed_revenue,
        counts_as_expected_revenue: !!s.counts_as_expected_revenue,
      }));
      await supabase.from('crm_pipeline_stages').insert(inserts);
    }

    await invalidatePipelinesAndStages();
    res.status(201).json({ pipeline: created, stages_copied: stages.length });
  } catch (e) {
    if (respondIfCrmPipelinesTableMissing(res, e)) return;
    res.status(500).json({ error: crmRouteErrorText(e) || e.message || 'Lỗi server' });
  }
});

r.get('/pipeline-stages', responseCache({ ttl: 120, scope: 'company', tags: ['crm:taxonomy'] }), async (req, res) => {
  const { type, pipeline_id, company_id: companyIdQuery, region_id: regionIdQuery } = req.query;
  const sacSt = scopedAdminCompanyId(req);
  const activeOnly = req.query.all !== 'true';

  let effectivePipelineId = pipeline_id || null;

  if (pipeline_id) {
    // Permission check theo pipeline đang truy vấn (single-row lookup, không cache)
    if (sacSt) {
      const { data: pl } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', pipeline_id).maybeSingle();
      if (!pl) return res.json([]);
      if (String(pl.company_id || '') !== String(sacSt)) return res.status(403).json({ error: 'Không có quyền xem stage của pipeline công ty khác' });
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = await requireUserCompanyIdResolved(req, res);
      if (!cid) return;
      const { data: pl } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', pipeline_id).maybeSingle();
      if (!pl) return res.json([]);
      if (String(pl.company_id || '') !== String(cid)) return res.status(403).json({ error: 'Không có quyền xem stage của pipeline công ty khác' });
    }
  } else if (companyIdQuery) {
    const companyId = String(companyIdQuery || '').trim();
    if (!companyId) return res.json([]);
    if (sacSt) {
      if (String(companyId) !== String(sacSt)) return res.status(403).json({ error: 'Không có quyền xem stage pipeline công ty khác' });
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = await requireUserCompanyIdResolved(req, res);
      if (!cid) return;
      if (String(companyId) !== String(cid)) return res.status(403).json({ error: 'Không có quyền xem stage pipeline công ty khác' });
    }
    const regionId = String(regionIdQuery || '').trim();
    effectivePipelineId = regionId
      ? await getPipelineIdForCompanyRegion(companyId, regionId)
      : await getDefaultPipelineIdForCompany(companyId);
  } else if (sacSt) {
    effectivePipelineId = await getDefaultPipelineIdForCompany(sacSt);
  } else if (!userIsAdmin(req.user?.role)) {
    const cid = await requireUserCompanyIdResolved(req, res);
    if (!cid) return;
    effectivePipelineId = await getDefaultPipelineIdForCompany(cid);
  }

  let data;
  if (effectivePipelineId) {
    data = await getStagesByPipelineId(effectivePipelineId, { type: type || null, activeOnly });
  } else {
    // Admin xem toàn bộ (không filter pipeline_id) — không cache nhánh hiếm này.
    let q = supabase.from('crm_pipeline_stages').select('*').order('order_index', { ascending: true });
    if (type) q = q.eq('pipeline_type', type);
    if (activeOnly) q = q.eq('is_active', true);
    const { data: rows } = await q;
    data = rows || [];
  }

  const ensureStageId = String(req.query.ensure_stage_id || '').trim();
  if (ensureStageId && !data.some((s) => String(s.id) === ensureStageId)) {
    const { data: extra } = await supabase
      .from('crm_pipeline_stages')
      .select('*')
      .eq('id', ensureStageId)
      .maybeSingle();
    if (extra) data = [...data, extra];
  }
  res.json(normalizePipelineStagesList(data));
});

r.post('/pipeline-stages', async (req, res) => {
  try {
    const b = req.body;
    if (!b.name || !b.pipeline_type) return res.status(400).json({ error: 'Thiếu tên hoặc loại pipeline' });
    const sacPst = scopedAdminCompanyId(req);
    if (sacPst) {
      if (!b.pipeline_id) return res.status(400).json({ error: 'Thiếu pipeline_id' });
      const { data: pl } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', b.pipeline_id).single();
      if (String(pl.company_id || '') !== String(sacPst)) return res.status(403).json({ error: 'Không thể thêm stage vào pipeline công ty khác' });
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      if (!b.pipeline_id) return res.status(400).json({ error: 'Thiếu pipeline_id' });
      const { data: pl } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', b.pipeline_id).single();
      if (String(pl.company_id || '') !== String(cid)) return res.status(403).json({ error: 'Không thể thêm stage vào pipeline công ty khác' });
    }
    // Auto order_index within pipeline_id + pipeline_type
    let orderQ = supabase.from('crm_pipeline_stages')
      .select('order_index').eq('pipeline_type', b.pipeline_type).order('order_index', { ascending: false }).limit(1);
    if (b.pipeline_id) orderQ = orderQ.eq('pipeline_id', b.pipeline_id);
    const { data: existing } = await orderQ;
    const nextOrder = (existing?.[0]?.order_index || 0) + 1;
    let defaultProbability = null;
    if (b.default_probability !== undefined && b.default_probability !== null && b.default_probability !== '') {
      const n = Number(b.default_probability);
      if (Number.isFinite(n)) defaultProbability = Math.max(0, Math.min(100, Math.round(n)));
    }
    const stageDesc =
      b.description != null && String(b.description).trim() !== ''
        ? String(b.description).trim()
        : null;
    if (b.apply_default_assignee_on_enter && !normalizeCrmStageDefaultAssigneeUserId(b.default_assignee_user_id)) {
      return res.status(400).json({ error: 'Chọn người phụ trách trước khi bật «Chuyển người phụ trách».' });
    }
    const slaInsert =
      b.sla_days !== undefined ? normalizePipelineStageSlaDaysForDb(b.sla_days) : undefined;
    const insertObj = {
      name: b.name, pipeline_type: b.pipeline_type, pipeline_id: b.pipeline_id || null,
      color: b.color || '#94A3B8', icon: b.icon || null, order_index: b.order_index ?? nextOrder,
      is_won: b.is_won || false, is_lost: b.is_lost || false, is_active: true,
      send_zalo_on_enter: !!b.send_zalo_on_enter,
      create_event_on_enter: !!b.create_event_on_enter,
      sync_role: b.sync_role || null,
      apply_default_assignee_on_enter: !!b.apply_default_assignee_on_enter,
      default_assignee_user_id: normalizeCrmStageDefaultAssigneeUserId(b.default_assignee_user_id) ?? null,
      default_probability: defaultProbability,
      description: stageDesc,
      ...(b.requires_deadline !== undefined ? { requires_deadline: !!b.requires_deadline } : {}),
      ...(b.allow_revert_to_lead !== undefined ? { allow_revert_to_lead: !!b.allow_revert_to_lead } : {}),
      ...(b.is_revert_to_lead_target !== undefined ? { is_revert_to_lead_target: !!b.is_revert_to_lead_target } : {}),
      ...(slaInsert !== undefined ? { sla_days: slaInsert } : {}),
      ...(b.counts_as_won_revenue !== undefined
        ? { counts_as_won_revenue: b.counts_as_won_revenue == null ? null : !!b.counts_as_won_revenue }
        : {}),
      ...(b.counts_as_completed_revenue !== undefined
        ? { counts_as_completed_revenue: b.counts_as_completed_revenue == null ? null : !!b.counts_as_completed_revenue }
        : {}),
      ...(b.counts_as_expected_revenue !== undefined
        ? { counts_as_expected_revenue: b.counts_as_expected_revenue == null ? null : !!b.counts_as_expected_revenue }
        : {}),
    };
    let { data, error } = await supabase.from('crm_pipeline_stages').insert(insertObj).select().single();
    // Chưa chạy migration requires_deadline → bỏ cột rồi thử lại để không vỡ tạo cột.
    if (error && /requires_deadline/.test(error.message || '')) {
      delete insertObj.requires_deadline;
      ({ data, error } = await supabase.from('crm_pipeline_stages').insert(insertObj).select().single());
    }
    if (error && /allow_revert_to_lead/.test(error.message || '')) {
      delete insertObj.allow_revert_to_lead;
      ({ data, error } = await supabase.from('crm_pipeline_stages').insert(insertObj).select().single());
    }
    if (error && /is_revert_to_lead_target/.test(error.message || '')) {
      delete insertObj.is_revert_to_lead_target;
      ({ data, error } = await supabase.from('crm_pipeline_stages').insert(insertObj).select().single());
    }
    if (error && /apply_default_assignee_on_enter|default_assignee_user_id/.test(error.message || '')) {
      delete insertObj.apply_default_assignee_on_enter;
      delete insertObj.default_assignee_user_id;
      ({ data, error } = await supabase.from('crm_pipeline_stages').insert(insertObj).select().single());
    }
    if (error) throw error;
    await invalidatePipelinesAndStages();
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.put('/pipeline-stages/:id', async (req, res) => {
  try {
    const b = req.body;
    const sacPsu = scopedAdminCompanyId(req);
    if (sacPsu) {
      const { data: st } = await supabase.from('crm_pipeline_stages').select('id, pipeline_id').eq('id', req.params.id).single();
      const { data: pl } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', st.pipeline_id).single();
      if (String(pl.company_id || '') !== String(sacPsu)) return res.status(403).json({ error: 'Không có quyền sửa stage pipeline công ty khác' });
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      const { data: st } = await supabase.from('crm_pipeline_stages').select('id, pipeline_id').eq('id', req.params.id).single();
      const { data: pl } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', st.pipeline_id).single();
      if (String(pl.company_id || '') !== String(cid)) return res.status(403).json({ error: 'Không có quyền sửa stage pipeline công ty khác' });
    }
    const update = {};
    ['name', 'color', 'icon', 'order_index', 'is_won', 'is_lost', 'is_active', 'send_zalo_on_enter', 'create_event_on_enter', 'sync_role'].forEach(f => {
      if (b[f] !== undefined) update[f] = (f === 'send_zalo_on_enter' || f === 'create_event_on_enter') ? !!b[f] : b[f];
    });
    if (b.requires_deadline !== undefined) update.requires_deadline = !!b.requires_deadline;
    if (b.show_sx_transfer !== undefined) update.show_sx_transfer = !!b.show_sx_transfer;
    if (b.allow_revert_to_lead !== undefined) update.allow_revert_to_lead = !!b.allow_revert_to_lead;
    if (b.is_revert_to_lead_target !== undefined) update.is_revert_to_lead_target = !!b.is_revert_to_lead_target;
    if (b.counts_as_won_revenue !== undefined) {
      update.counts_as_won_revenue = b.counts_as_won_revenue == null ? null : !!b.counts_as_won_revenue;
    }
    if (b.counts_as_completed_revenue !== undefined) {
      update.counts_as_completed_revenue = b.counts_as_completed_revenue == null ? null : !!b.counts_as_completed_revenue;
    }
    if (b.counts_as_expected_revenue !== undefined) {
      update.counts_as_expected_revenue = b.counts_as_expected_revenue == null ? null : !!b.counts_as_expected_revenue;
    }
    if (b.sla_days !== undefined) {
      update.sla_days = normalizePipelineStageSlaDaysForDb(b.sla_days);
    }
    if (b.description !== undefined) {
      update.description =
        b.description == null || String(b.description).trim() === ''
          ? null
          : String(b.description).trim();
    }
    if (b.default_probability !== undefined) {
      if (b.default_probability === null || b.default_probability === '') {
        update.default_probability = null;
      } else {
        const n = Number(b.default_probability);
        update.default_probability = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null;
      }
    }
    if (b.apply_default_assignee_on_enter !== undefined) {
      update.apply_default_assignee_on_enter = !!b.apply_default_assignee_on_enter;
    }
    if (b.default_assignee_user_id !== undefined) {
      update.default_assignee_user_id = normalizeCrmStageDefaultAssigneeUserId(b.default_assignee_user_id);
    }
    if (update.apply_default_assignee_on_enter && !update.default_assignee_user_id) {
      const { data: cur } = await supabase
        .from('crm_pipeline_stages')
        .select('default_assignee_user_id')
        .eq('id', req.params.id)
        .maybeSingle();
      if (!cur?.default_assignee_user_id) {
        return res.status(400).json({ error: 'Chọn người phụ trách trước khi bật «Chuyển người phụ trách».' });
      }
    }
    let { data, error } = await supabase.from('crm_pipeline_stages').update(update)
      .eq('id', req.params.id).select().single();
    if (error && /requires_deadline/.test(error.message || '')) {
      delete update.requires_deadline;
      ({ data, error } = await supabase.from('crm_pipeline_stages').update(update)
        .eq('id', req.params.id).select().single());
    }
    if (error && /allow_revert_to_lead/.test(error.message || '')) {
      delete update.allow_revert_to_lead;
      ({ data, error } = await supabase.from('crm_pipeline_stages').update(update)
        .eq('id', req.params.id).select().single());
    }
    if (error && /is_revert_to_lead_target/.test(error.message || '')) {
      delete update.is_revert_to_lead_target;
      ({ data, error } = await supabase.from('crm_pipeline_stages').update(update)
        .eq('id', req.params.id).select().single());
    }
    if (error && /apply_default_assignee_on_enter|default_assignee_user_id/.test(error.message || '')) {
      delete update.apply_default_assignee_on_enter;
      delete update.default_assignee_user_id;
      ({ data, error } = await supabase.from('crm_pipeline_stages').update(update)
        .eq('id', req.params.id).select().single());
    }
    if (error) throw error;
    await invalidatePipelinesAndStages();
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/pipeline-stages/:id/production-columns', async (req, res) => {
  try {
    const stageId = req.params.id;
    const { data: stage } = await supabase
      .from('crm_pipeline_stages')
      .select('id, name, sync_role')
      .eq('id', stageId)
      .maybeSingle();
    if (!stage) return res.status(404).json({ error: 'Stage không tồn tại' });

    const { data: allCols, error } = await supabase
      .from('production_pipeline_stages')
      .select(`
        id, name, color, icon, order_index, bucket_slug, is_active,
        company_id, workshop_type_id, crm_target_stage_id,
        company:companies(id, name),
        workshop_type:workshop_project_types(id, name)
      `)
      .eq('is_active', true)
      .order('order_index');
    if (error) throw error;

    const cols = (allCols || []).map((c) => ({
      ...c,
      assigned: String(c.crm_target_stage_id || '') === String(stageId),
    }));

    res.json({
      stage: { id: stage.id, name: stage.name, sync_role: stage.sync_role || null },
      production_columns: cols,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/pipeline-stages/:id/assign-production-columns', async (req, res) => {
  try {
    const stageId = req.params.id;
    const ids = Array.isArray(req.body?.production_pipeline_stage_ids)
      ? req.body.production_pipeline_stage_ids.filter(Boolean).map(String)
      : [];
    const replaceExisting = req.body?.replace_existing !== false;

    const { data: stage } = await supabase
      .from('crm_pipeline_stages')
      .select('id, name')
      .eq('id', stageId)
      .maybeSingle();
    if (!stage) return res.status(404).json({ error: 'Stage CRM không tồn tại' });

    let assignedCount = 0;
    let unassignedCount = 0;

    if (ids.length) {
      const { data: assigned, error: aErr } = await supabase
        .from('production_pipeline_stages')
        .update({ crm_target_stage_id: stageId, crm_sync_type: null })
        .in('id', ids)
        .select('id');
      if (aErr) throw aErr;
      assignedCount = (assigned || []).length;
    }

    if (replaceExisting) {
      let q = supabase
        .from('production_pipeline_stages')
        .update({ crm_target_stage_id: null })
        .eq('crm_target_stage_id', stageId);
      if (ids.length) q = q.not('id', 'in', `(${ids.join(',')})`);
      const { data: unassigned, error: uErr } = await q.select('id');
      if (uErr) throw uErr;
      unassignedCount = (unassigned || []).length;
    }

    res.json({
      stage_id: stageId,
      assigned_count: assignedCount,
      unassigned_count: unassignedCount,
      total_target_columns: ids.length,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.delete('/pipeline-stages/:id', async (req, res) => {
  try {
    const sacPsd = scopedAdminCompanyId(req);
    if (sacPsd) {
      const { data: st } = await supabase.from('crm_pipeline_stages').select('id, pipeline_id').eq('id', req.params.id).single();
      const { data: pl } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', st.pipeline_id).single();
      if (String(pl.company_id || '') !== String(sacPsd)) return res.status(403).json({ error: 'Không có quyền xóa stage pipeline công ty khác' });
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      const { data: st } = await supabase.from('crm_pipeline_stages').select('id, pipeline_id').eq('id', req.params.id).single();
      const { data: pl } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', st.pipeline_id).single();
      if (String(pl.company_id || '') !== String(cid)) return res.status(403).json({ error: 'Không có quyền xóa stage pipeline công ty khác' });
    }
    // Check if any leads use this stage
    const { count } = await supabase.from('crm_leads').select('id', { count: 'exact', head: true })
      .eq('stage_id', req.params.id);
    if (count > 0) return res.status(400).json({ error: `Không thể xóa — ${count} lead/deal đang dùng giai đoạn này` });
    await supabase.from('crm_pipeline_stages').delete().eq('id', req.params.id);
    await invalidatePipelinesAndStages();
    res.json({ message: 'Đã xóa' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.put('/pipeline-stages-reorder', async (req, res) => {
  try {
    const { stages } = req.body; // [{ id, order_index }]
    for (const s of stages || []) {
      await supabase.from('crm_pipeline_stages').update({ order_index: s.order_index }).eq('id', s.id);
    }
    await invalidatePipelinesAndStages();
    res.json({ message: 'Đã sắp xếp lại' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
}).call(null, helpers["ALLOWED_DEADLINE_FIELDS"], helpers["CRM_COMMENT_ALLOWED_REACTION_EMOJI"], helpers["CRM_LEAD_KANBAN_LITE_SELECT"], helpers["CRM_LEAD_LIST_SELECT"], helpers["CRM_LEAD_LIST_SELECT_BASE"], helpers["CRM_LEAD_LIST_SELECT_EXTRA"], helpers["CRM_LEAD_REGION_EMBED"], helpers["CRM_NEW_LEAD_MAX_AGE_MS"], helpers["CRM_TASK_SELECT"], helpers["CRM_UUID_RE"], helpers["CUSTOMERS_IN_CHUNK"], helpers["CUSTOMERS_OVERVIEW_NO_MATCH_ID"], helpers["DEAL_PRE_CONTRACT_SLUGS_STAFF"], helpers["DEAL_REPORT_BUCKET_VALUES"], helpers["DEFAULT_CHECKLISTS"], helpers["DEFAULT_DEADLINE_BUCKETS"], helpers["DEFAULT_PIPELINE_STAGE_SLA_DAYS"], helpers["FOLLOWUP_TIME_BUCKETS"], helpers["PDFDocument"], helpers["QUOTATIONS_SOURCE_EXCEL_COLS"], helpers["Router"], helpers["SCAN_DUP_LITE_SELECT"], helpers["STAFF_LEAD_DEAL_REPORT_ROLES"], helpers["SURVEY_EVENT_SELECT"], helpers["SURVEY_EVENT_TYPES"], helpers["XLSX"], helpers["ZALO_APP_SETTING_KEY"], helpers["_crmLeadSelectMigrationChecked"], helpers["_crmLeadTypeColorAvailable"], helpers["_vcPipelineStageAvailable"], helpers["addPhoneToAutoLeadBlocklist"], helpers["aggregateCrmCommentReactions"], helpers["aggregateOrgReportRows"], helpers["appendFulfillmentChildTasksForMasterDeal"], helpers["applyAllActiveWorkshopTemplatesForArea"], helpers["applyAssigneesToInsertedCrmTasks"], helpers["applyCrmLeadRegionFilterToQuery"], helpers["applyCrmTaskTemplatesToCompanyRegions"], helpers["applyCustomerIdInFilter"], helpers["applyCustomersOverviewSearch"], helpers["applyDefaultWorkshopTemplatesForNewProject"], helpers["applyLeadOrCustomerSalesFilter"], helpers["applyProductionTemplateToFulfillmentLead"], helpers["applyProductionTemplatesOnPipelineEnter"], helpers["applyStageIdFilterToQuery"], helpers["applyWorkshopTemplateToProject"], helpers["artifactNamePrefix"], helpers["assertCanFlagLead"], helpers["assertCategoryFitsSource"], helpers["assertCrmAssigneeUserMatchesLeadCompany"], helpers["assertCrmEmployeeDeleteAllowed"], helpers["assertCrmStageAdvanceAllowed"], helpers["assertDealCrmManualStageChange"], helpers["assertDealResponsible"], helpers["assertDivisionAllowedForCompany"], helpers["assertLeadDocumentOwner"], helpers["assertLeadReadableByRegionScope"], helpers["assertRegionBelongsToCompany"], helpers["assertUserCanAssignCrmRegion"], helpers["assignProductionCompanyDealResponsibility"], helpers["attachAssigneesToCrmTasks"], helpers["attachAssignmentIdsToCrmTasks"], helpers["attachCrmNextOpenTaskDeadline"], helpers["attachLeadNewFlagForList"], helpers["attachLeadReplyParents"], helpers["attachLeadUserFlagsForList"], helpers["auth"], helpers["autoCreateProjectFromWonDeal"], helpers["autoFlowFns"], helpers["autoGenCrmTasksForNewLead"], helpers["buildAssignmentNotificationInsert"], helpers["buildChecklistLeadDocumentRow"], helpers["buildCrmDashboardMinimalKpis"], helpers["buildCrmLeadsRpcFilterParams"], helpers["buildCustomersOverviewSummary"], helpers["buildDealTemplateData"], helpers["buildDefaultDeadlineConfig"], helpers["buildFirstStageIdByPipeline"], helpers["buildPipelineStagesMap"], helpers["buildProcessedCommercialItems"], helpers["buildQuotedStageOrderByPipeline"], helpers["buildScanDuplicateGroups"], helpers["buildWonStageOrderByPipeline"], helpers["canUserViewDocByAllowlist"], helpers["chatUpload"], helpers["chunkArray"], helpers["classifyDealStageForStaffReport"], helpers["commentsTableMissing"], helpers["companyRegionExtraColumnsMissing"], helpers["companyRegionGeoColumnsMissing"], helpers["computeCrmDashboardLightStats"], helpers["computeCrmLiveVersionMs"], helpers["computeCustomersOverviewSummary"], helpers["computeIsNewLeadForUser"], helpers["computeOrgOverviewReportData"], helpers["computeStaffLeadDealReportData"], helpers["computeStaffPipelineDetailPayload"], helpers["countOpenOverdueCrmTasksForLeadIds"], helpers["createCrmAssignment"], helpers["createCrmLeadTask"], helpers["createFulfillmentChildDeal"], helpers["createNotif"], helpers["createNotification"], helpers["createProjectFromLead"], helpers["crmExecutorFieldsFromTemplateItem"], helpers["crmLeadCommentAttachmentsColumnMissing"], helpers["crmLeadCommentReadReceiptsTableMissing"], helpers["crmLeadRowVisibleToRequestUser"], helpers["crmListUsesLegacyFilters"], helpers["crmNoteActivityUpload"], helpers["crmReportAsOfMs"], helpers["crmReportCreatedAtFromIso"], helpers["crmReportCreatedAtToIso"], helpers["crmReportDayKeyVn"], helpers["crmRouteErrorText"], helpers["crmTaskDeadlineModuleKey"], helpers["crmTaskMeetsCompletionRequirements"], helpers["crmTaskMeetsRequiredFileTypes"], helpers["crmTaskRequiresCompletionEvidence"], helpers["crmTemplateMatchesLeadType"], helpers["deadlineToDateOnlyIso"], helpers["defaultCompanyInfo"], helpers["defaultKpiLedgerMonthStartYmd"], helpers["deleteCrmLeadTask"], helpers["deleteMirroredAssignmentFileForTaskAttachment"], helpers["duplicateLeadIdsFromLiteRows"], helpers["ecosystemModuleKeyForCrmDeadline"], helpers["effectivePipelineStageSlaDays"], helpers["emitCrmBadgeUpdateForProject"], helpers["emitCrmDashboardChanged"], helpers["emitCrmTaskChanged"], helpers["emptyStaffLeadDealAgg"], helpers["endOfCalendarDayAfterEntered"], helpers["enforceCommercialDocCompanyOnWrite"], helpers["enforceQuotaForRequest"], helpers["ensureDealLeadDocumentsForModuleTransition"], helpers["ensureDefaultCrmPipelineForCompany"], helpers["ensureMissingCrmTasksForLead"], helpers["ensureMissingCrmTasksForPipelineStage"], helpers["ensureMissingSxTasksForLead"], helpers["excelUpload"], helpers["executeLeadMerge"], helpers["executeZaloDealStageNotify"], helpers["fetchActivityCustomerIds"], helpers["fetchAllLeadsForSlaWatchlist"], helpers["fetchAssignmentForTask"], helpers["fetchCrmCommentReactionsAggregate"], helpers["fetchCrmLeadCommentNotifyUserIds"], helpers["fetchCrmLeadDetailRow"], helpers["fetchCrmLeadWithPipelineBadges"], helpers["fetchCrmLeadsByIdsOrdered"], helpers["fetchCrmLeadsForDashboardBatched"], helpers["fetchCrmLeadsForOrgReportBatched"], helpers["fetchCrmLeadsForUserDetailBatched"], helpers["fetchCrmLeadsLiteForDuplicateScan"], helpers["fetchCrmLeadsPageViaRpc"], helpers["fetchCrmPipelineZaloSlice"], helpers["fetchCrmSurveyEventsChunk"], helpers["fetchCrmSurveyVisitsForOrgReport"], helpers["fetchLeadCommentAudienceMembers"], helpers["fetchLeadCommentAudienceMembersForRead"], helpers["fetchLeadIdsForCrmRegion"], helpers["fetchLeadMentionMembers"], helpers["fetchOrgActivityFeed"], helpers["fetchPipelineWithStagesById"], helpers["fetchScopedCrmBundles"], helpers["fillTemplateDataFromStructure"], helpers["filterCrmTasksForLeadType"], helpers["filterUserIdsForCrmLeadScopedNotification"], helpers["findChecklistItem"], helpers["followupDismissExpiresAt"], helpers["fontBold"], helpers["fontRegular"], helpers["formatMoney"], helpers["formatVNDPdf"], helpers["formatVnPhoneLocal0From84"], helpers["fs"], helpers["generateDocPdf"], helpers["generateFlowTasks"], helpers["generateStepTasks"], helpers["getAppSettingValue"], helpers["getCompanyInfo"], helpers["getCompanyRegionsList"], helpers["getCrmLeadListSelect"], helpers["getCrmLeadRegionConstraint"], helpers["getCrmLeadTypesList"], helpers["getCrmLeadsListLegacy"], helpers["getCrmSourceCategoriesList"], helpers["getCrmSourcesList"], helpers["getDefaultCrmAttachmentShare"], helpers["getDefaultDealZaloTemplateStructure"], helpers["getDefaultLeadDocumentShareForDeal"], helpers["getDefaultPipelineIdForCompany"], helpers["getLeadDocumentFieldsFromCrmTask"], helpers["getNotifyTargets"], helpers["getOverdueFollowUps"], helpers["getPipelineIdForCompanyRegion"], helpers["getPipelineZaloSlice"], helpers["getPipelinesList"], helpers["getProjectCRMSummary"], helpers["getStagesByPipelineId"], helpers["getStaleLeads"], helpers["getZaloNotifySettings"], helpers["hydrateCrmLeadsByIdsWithStaff"], helpers["hydrateCrmLeadsRpcPage"], helpers["hydrateScanDuplicateLeads"], helpers["insertQuotationRow"], helpers["invalidateAppSettingKey"], helpers["invalidatePipelinesAndStages"], helpers["invalidateRegions"], helpers["invalidateSources"], helpers["invalidateTenantUsageCache"], helpers["invokeCrmLeadsStageCountsRpc"], helpers["isAdminLike"], helpers["isAllowedLeadCommentAttachmentUrl"], helpers["isChotSanXuatCrmTaskTitle"], helpers["isCrmCompanyAdminUser"], helpers["isCrmDealAssigneeLocked"], helpers["isCrmLeadTypeColorMissingError"], helpers["isCrmModuleAdmin"], helpers["isCrmPipelinesTableMissingError"], helpers["isCrmRegionAdminUser"], helpers["isCrmSystemAdminUser"], helpers["isDealStageHoanThanhForZalo"], helpers["isDefaultAssigneeIdsColumnError"], helpers["isExecutorColumnError"], helpers["isPlatformAdmin"], helpers["isPostgresUniqueViolation"], helpers["isQuotationsSourceExcelColumnMissingError"], helpers["isSxRelationshipError"], helpers["isSystemAdmin"], helpers["isUuidString"], helpers["isValidDealZaloTemplateStructure"], helpers["isVcRelationshipError"], helpers["isVptCompanyCommercialDocViewer"], helpers["lastNominatimGeocodeAt"], helpers["leadChatFilesMulter"], helpers["leadChatJsonOrFiles"], helpers["listQuotationExcelSheets"], helpers["loadCrmTaskAttachmentCountMap"], helpers["loadOrgReportStageMap"], helpers["loadZaloLinkedLeadIdSet"], helpers["logDealActivityComment"], helpers["logDealDeadlineChangeComment"], helpers["logDealStageChangeComment"], helpers["logKanbanDeadlineUnifiedHistory"], helpers["logLeadCommentMentionActivity"], helpers["logProjectFileActivity"], helpers["mapCustomerOverviewRow"], helpers["mapLeadDisplayPhone"], helpers["mapQuotationItemsToOrderRows"], helpers["maskCustomerPhoneDisplay"], helpers["maskZaloAccessTokenPreview"], helpers["maybeSendZaloOnDealStageEnter"], helpers["mergeCrmStageDefaultAssigneeIntoUpdates"], helpers["mergeCustomerIntoTarget"], helpers["misaService"], helpers["multer"], helpers["nextCode"], helpers["nextTbProjectCode"], helpers["normalizeCrmActivityAttachments"], helpers["normalizeCrmLeadCommentAttachments"], helpers["normalizeCrmStageDefaultAssigneeUserId"], helpers["normalizeCrmUserRole"], helpers["normalizeLeadSeenByKeys"], helpers["normalizeOrgReportSurveyVisitRow"], helpers["normalizePipelineStageSlaDaysForDb"], helpers["normalizePipelineStagesList"], helpers["normalizeRegionIdList"], helpers["normalizeTemplateChecklistForCrmTask"], helpers["normalizeTemplateItemAssigneeIds"], helpers["normalizeTimestamp"], helpers["normalizeTitleFold"], helpers["normalizeVnPhoneTo84"], helpers["notifyDealCommentMentions"], helpers["notifyDealCommentParticipants"], helpers["notifyMultiple"], helpers["notifyMultipleShared"], helpers["notifyNewCrmAssignmentAssignees"], helpers["notifyProductionDocumentUploaded"], helpers["onLeadWon"], helpers["onOrderConfirmed"], helpers["onProjectCompleted"], helpers["onQuotationAccepted"], helpers["orgReportAttachFirstStageRates"], helpers["orgReportBumpFirstStageMetrics"], helpers["orgReportBumpMetrics"], helpers["orgReportBumpOpenOverdue"], helpers["orgReportBumpReceptionMetrics"], helpers["orgReportCancelRatePct"], helpers["orgReportClosedWonDealCount"], helpers["orgReportClosedWonValue"], helpers["orgReportCompareSummary"], helpers["orgReportConversionRate"], helpers["orgReportDayKey"], helpers["orgReportDealCloseValueRatePct"], helpers["orgReportDealCountsExpected"], helpers["orgReportDealIsClosedWon"], helpers["orgReportDealIsCompleted"], helpers["orgReportDealIsQuotedOrAfter"], helpers["orgReportDealProbability"], helpers["orgReportDealSplitBuckets"], helpers["orgReportExtendedDealMetrics"], helpers["orgReportFirstStageOnTimeRatePct"], helpers["orgReportFirstStageOverdueRatePct"], helpers["orgReportIsReceptionOverdue"], helpers["orgReportIsSlaOverdue"], helpers["orgReportKpiPeriodStart"], helpers["orgReportNumEst"], helpers["orgReportOverdueRatePct"], helpers["orgReportOwnerId"], helpers["orgReportPctDelta"], helpers["orgReportPreviousPeriod"], helpers["orgReportQuoteValueCloseRatePct"], helpers["orgReportQuoteWinRatePct"], helpers["orgReportReceptionOverdueRatePct"], helpers["orgReportReceptionSlaMinutes"], helpers["orgReportStageIsClosed"], helpers["orgReportStageIsLostOrCancelled"], helpers["orgReportTotalDealCount"], helpers["parseChecklist"], helpers["parseCrmLeadsPageRpc"], helpers["parseCrmReportDateRange"], helpers["parseCrmStageCountsNumericMap"], helpers["parseCrmStageCountsRpc"], helpers["parseExcelMoneyFromMappedColumn"], helpers["parseLeadIdUuidList"], helpers["parseLeadIdsCsvQuery"], helpers["parseLeadIdsFromBody"], helpers["parseLeadSeenByRaw"], helpers["parseQuotationExcelBuffer"], helpers["parseStageIdsFromQuery"], helpers["parseUuidArrayJsonb"], helpers["parseVietnameseMeasure"], helpers["parseVietnameseMoney"], helpers["path"], helpers["persistAssignmentNotification"], helpers["pgCrmDuplicateLeadIds"], helpers["pickDealZaloTemplatePayload"], helpers["pipeOrgOverviewReportPdf"], helpers["pipeStaffLeadDealSummaryPdf"], helpers["pipeStaffPipelineDetailPdf"], helpers["pipelineHasExplicitCompleted"], helpers["pipelineHasExplicitExpected"], helpers["pipelineHasExplicitWon"], helpers["plannerTableMissing"], helpers["postCrmStageDefaultAssigneeComment"], helpers["primaryTemplateItemAssigneeId"], helpers["rcInvalidateTags"], helpers["reactionsTableMissing"], helpers["redactCrmTaskNotesForViewer"], helpers["regionGeocodeInflight"], helpers["repairCrmDealPipelineDisplay"], helpers["requireUserCompanyId"], helpers["requireUserCompanyIdResolved"], helpers["resolveAssignmentIdForTask"], helpers["resolveCanonicalCrmLeadId"], helpers["resolveCommercialDocListCompanyScope"], helpers["resolveCrmBundleTemplateScope"], helpers["resolveCrmLeadsDeadlinesMap"], helpers["resolveCrmLeadsKanbanLite"], helpers["resolveCrmLeadsMergedQuery"], helpers["resolveCrmLeadsSkipDeadline"], helpers["resolveCrmLedgerNetByLeadIdsPayload"], helpers["resolveCrmReportScope"], helpers["resolveCrmTaskWriteLeadId"], helpers["resolveExecutorCompanyId"], helpers["resolveKanbanStagesForCompany"], helpers["resolveLeadCommentMentionIds"], helpers["resolveProductionCompanyForDealStage"], helpers["resolveProductionHandoverResponsibleUserId"], helpers["resolveReopenTargetStageId"], helpers["resolveRpcRegionIdsForCrmList"], helpers["resolveTenantIdForQuota"], helpers["resolveZaloDealTemplateId"], helpers["respondIfCrmPipelinesTableMissing"], helpers["responseCache"], helpers["restoreCrmTaskChecklistFromWorkshopTemplate"], helpers["resyncCrmPipelineTasksForLead"], helpers["sanitizeIsoDateQueryParam"], helpers["scheduleRegionGeocoding"], helpers["scopedAdminCompanyId"], helpers["scopedCrmCompanyIdForWrite"], helpers["sendZaloTemplateMessage"], helpers["setLeadFlag"], helpers["shallowMergeTemplateData"], helpers["skipSxWorkQuickComplete"], helpers["snapshotOrderRowFromQuotation"], helpers["stripCrmAssigneeFromWonStageUpdates"], helpers["stripCrmLeadTypeColorFromSelect"], helpers["stripQuotationsSourceExcelFields"], helpers["sumCrmKpiLedgerNetByLeadIds"], helpers["sumCrmKpiLedgerNetByUserForOrgReport"], helpers["sumCrmKpiLedgerNetByUserIds"], helpers["sumCrmKpiLedgerNetByUserIdsInDateRange"], helpers["supabase"], helpers["syncAllTaskArtifactsToAssignment"], helpers["syncChecklistItemNotes"], helpers["syncCrmLeadSxPipelineFromProject"], helpers["syncQuotationDepositToDealAndProject"], helpers["syncSxKanbanFromCrmProductionStage"], helpers["syncTaskAttachmentToAssignment"], helpers["templateItemAssigneePatch"], helpers["toCrmTaskChecklist"], helpers["unifyCrmLeadResponsibleFields"], helpers["updateCrmLeadTask"], helpers["updateQuotationRow"], helpers["upsertZaloNotifySettings"], helpers["userCanAccessCrmLeadAsParticipant"], helpers["userCanAccessCrmLeadViaVisibility"], helpers["userCanAssignAnyCrmRegion"], helpers["userCanBypassCrmDeleteRestriction"], helpers["userHasSeenLeadInSeenBy"], helpers["userIsAdmin"], helpers["userIsCrmCompanyOrRegionAdmin"], helpers["userMayAccessQuotationRow"], helpers["userSeesAllCrmDeals"], helpers["userSeesAllCrmDealsForScope"], helpers["userSeesAllCrmLeads"], helpers["userSeesAllCrmLeadsForScope"], helpers["uuidQueryOrNull"], helpers["validateProductionCompanyId"]);

module.exports = r;
