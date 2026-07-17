/**
 * CRM routes: taxonomy
 * Auto-extracted — handlers close over shared helpers via IIFE.
 */
const { Router } = require('express');
const helpers = require('../shared/helpersBundle');

const r = Router();

(function (ALLOWED_DEADLINE_FIELDS, CRM_COMMENT_ALLOWED_REACTION_EMOJI, CRM_LEAD_KANBAN_LITE_SELECT, CRM_LEAD_LIST_SELECT, CRM_LEAD_LIST_SELECT_BASE, CRM_LEAD_LIST_SELECT_EXTRA, CRM_LEAD_REGION_EMBED, CRM_NEW_LEAD_MAX_AGE_MS, CRM_TASK_SELECT, CRM_UUID_RE, CUSTOMERS_IN_CHUNK, CUSTOMERS_OVERVIEW_NO_MATCH_ID, DEAL_PRE_CONTRACT_SLUGS_STAFF, DEAL_REPORT_BUCKET_VALUES, DEFAULT_CHECKLISTS, DEFAULT_DEADLINE_BUCKETS, DEFAULT_PIPELINE_STAGE_SLA_DAYS, FOLLOWUP_TIME_BUCKETS, PDFDocument, QUOTATIONS_SOURCE_EXCEL_COLS, Router, SCAN_DUP_LITE_SELECT, STAFF_LEAD_DEAL_REPORT_ROLES, SURVEY_EVENT_SELECT, SURVEY_EVENT_TYPES, XLSX, ZALO_APP_SETTING_KEY, _crmLeadSelectMigrationChecked, _crmLeadTypeColorAvailable, _vcPipelineStageAvailable, addPhoneToAutoLeadBlocklist, aggregateCrmCommentReactions, aggregateOrgReportRows, appendFulfillmentChildTasksForMasterDeal, applyAllActiveWorkshopTemplatesForArea, applyAssigneesToInsertedCrmTasks, applyCrmLeadRegionFilterToQuery, applyCrmTaskTemplatesToCompanyRegions, applyCustomerIdInFilter, applyCustomersOverviewSearch, applyDefaultWorkshopTemplatesForNewProject, applyLeadOrCustomerSalesFilter, applyProductionTemplateToFulfillmentLead, applyProductionTemplatesOnPipelineEnter, applyStageIdFilterToQuery, applyWorkshopTemplateToProject, artifactNamePrefix, assertCanFlagLead, assertCategoryFitsSource, assertCrmAssigneeUserMatchesLeadCompany, assertCrmEmployeeDeleteAllowed, assertCrmStageAdvanceAllowed, assertDealCrmManualStageChange, assertDealResponsible, assertDivisionAllowedForCompany, assertLeadDocumentOwner, assertLeadReadableByRegionScope, assertRegionBelongsToCompany, assertUserCanAssignCrmRegion, assignProductionCompanyDealResponsibility, attachAssigneesToCrmTasks, attachAssignmentIdsToCrmTasks, attachCrmNextOpenTaskDeadline, attachLeadNewFlagForList, attachLeadReplyParents, attachLeadUserFlagsForList, auth, autoCreateProjectFromWonDeal, autoFlowFns, autoGenCrmTasksForNewLead, buildAssignmentNotificationInsert, buildChecklistLeadDocumentRow, buildCrmDashboardMinimalKpis, buildCrmLeadsRpcFilterParams, buildCustomersOverviewSummary, buildDealTemplateData, buildDefaultDeadlineConfig, buildFirstStageIdByPipeline, buildPipelineStagesMap, buildProcessedCommercialItems, buildQuotedStageOrderByPipeline, buildScanDuplicateGroups, buildWonStageOrderByPipeline, canUserViewDocByAllowlist, chatUpload, chunkArray, classifyDealStageForStaffReport, commentsTableMissing, companyRegionExtraColumnsMissing, companyRegionGeoColumnsMissing, computeCrmDashboardLightStats, computeCrmLiveVersionMs, computeCustomersOverviewSummary, computeIsNewLeadForUser, computeOrgOverviewReportData, computeStaffLeadDealReportData, computeStaffPipelineDetailPayload, countOpenOverdueCrmTasksForLeadIds, createCrmAssignment, createCrmLeadTask, createFulfillmentChildDeal, createNotif, createNotification, createProjectFromLead, crmExecutorFieldsFromTemplateItem, crmLeadCommentAttachmentsColumnMissing, crmLeadCommentReadReceiptsTableMissing, crmLeadRowVisibleToRequestUser, crmListUsesLegacyFilters, crmNoteActivityUpload, crmReportAsOfMs, crmReportCreatedAtFromIso, crmReportCreatedAtToIso, crmReportDayKeyVn, crmRouteErrorText, crmTaskDeadlineModuleKey, crmTaskMeetsCompletionRequirements, crmTaskMeetsRequiredFileTypes, crmTaskRequiresCompletionEvidence, crmTemplateMatchesLeadType, deadlineToDateOnlyIso, defaultCompanyInfo, defaultKpiLedgerMonthStartYmd, deleteCrmLeadTask, deleteMirroredAssignmentFileForTaskAttachment, duplicateLeadIdsFromLiteRows, ecosystemModuleKeyForCrmDeadline, effectivePipelineStageSlaDays, emitCrmBadgeUpdateForProject, emitCrmDashboardChanged, emitCrmTaskChanged, emptyStaffLeadDealAgg, endOfCalendarDayAfterEntered, enforceCommercialDocCompanyOnWrite, enforceQuotaForRequest, ensureDealLeadDocumentsForModuleTransition, ensureDefaultCrmPipelineForCompany, ensureMissingCrmTasksForLead, ensureMissingCrmTasksForPipelineStage, ensureMissingSxTasksForLead, excelUpload, executeLeadMerge, executeZaloDealStageNotify, fetchActivityCustomerIds, fetchAllLeadsForSlaWatchlist, fetchAssignmentForTask, fetchCrmCommentReactionsAggregate, fetchCrmLeadCommentNotifyUserIds, fetchCrmLeadDetailRow, fetchCrmLeadWithPipelineBadges, fetchCrmLeadsByIdsOrdered, fetchCrmLeadsForDashboardBatched, fetchCrmLeadsForOrgReportBatched, fetchCrmLeadsForUserDetailBatched, fetchCrmLeadsLiteForDuplicateScan, fetchCrmLeadsPageViaRpc, fetchCrmPipelineZaloSlice, fetchCrmSurveyEventsChunk, fetchCrmSurveyVisitsForOrgReport, fetchLeadCommentAudienceMembers, fetchLeadCommentAudienceMembersForRead, fetchLeadIdsForCrmRegion, fetchLeadMentionMembers, fetchOrgActivityFeed, fetchPipelineWithStagesById, fetchScopedCrmBundles, fillTemplateDataFromStructure, filterCrmTasksForLeadType, filterUserIdsForCrmLeadScopedNotification, findChecklistItem, followupDismissExpiresAt, fontBold, fontRegular, formatMoney, formatVNDPdf, formatVnPhoneLocal0From84, fs, generateDocPdf, generateFlowTasks, generateStepTasks, getAppSettingValue, getCompanyInfo, getCompanyRegionsList, getCrmLeadListSelect, getCrmLeadRegionConstraint, getCrmLeadTypesList, getCrmLeadsListLegacy, getCrmSourceCategoriesList, getCrmSourcesList, getDefaultCrmAttachmentShare, getDefaultDealZaloTemplateStructure, getDefaultLeadDocumentShareForDeal, getDefaultPipelineIdForCompany, getLeadDocumentFieldsFromCrmTask, getNotifyTargets, getOverdueFollowUps, getPipelineIdForCompanyRegion, getPipelineZaloSlice, getPipelinesList, getProjectCRMSummary, getStagesByPipelineId, getStaleLeads, getZaloNotifySettings, hydrateCrmLeadsByIdsWithStaff, hydrateCrmLeadsRpcPage, hydrateScanDuplicateLeads, insertQuotationRow, invalidateAppSettingKey, invalidatePipelinesAndStages, invalidateRegions, invalidateSources, invalidateTenantUsageCache, invokeCrmLeadsStageCountsRpc, isAdminLike, isAllowedLeadCommentAttachmentUrl, isChotSanXuatCrmTaskTitle, isCrmCompanyAdminUser, isCrmDealAssigneeLocked, isCrmLeadTypeColorMissingError, isCrmModuleAdmin, isCrmPipelinesTableMissingError, isCrmRegionAdminUser, isCrmSystemAdminUser, isDealStageHoanThanhForZalo, isDefaultAssigneeIdsColumnError, isExecutorColumnError, isPlatformAdmin, isPostgresUniqueViolation, isQuotationsSourceExcelColumnMissingError, isSxRelationshipError, isSystemAdmin, isUuidString, isValidDealZaloTemplateStructure, isVcRelationshipError, isVptCompanyCommercialDocViewer, lastNominatimGeocodeAt, leadChatFilesMulter, leadChatJsonOrFiles, listQuotationExcelSheets, loadCrmTaskAttachmentCountMap, loadOrgReportStageMap, loadZaloLinkedLeadIdSet, logDealActivityComment, logDealDeadlineChangeComment, logDealStageChangeComment, logKanbanDeadlineUnifiedHistory, logLeadCommentMentionActivity, logProjectFileActivity, mapCustomerOverviewRow, mapLeadDisplayPhone, mapQuotationItemsToOrderRows, maskCustomerPhoneDisplay, maskZaloAccessTokenPreview, maybeSendZaloOnDealStageEnter, mergeCrmStageDefaultAssigneeIntoUpdates, mergeCustomerIntoTarget, misaService, multer, nextCode, nextTbProjectCode, normalizeCrmActivityAttachments, normalizeCrmLeadCommentAttachments, normalizeCrmStageDefaultAssigneeUserId, normalizeCrmUserRole, normalizeLeadSeenByKeys, normalizeOrgReportSurveyVisitRow, normalizePipelineStageSlaDaysForDb, normalizePipelineStagesList, normalizeRegionIdList, normalizeTemplateChecklistForCrmTask, normalizeTemplateItemAssigneeIds, normalizeTimestamp, normalizeTitleFold, normalizeVnPhoneTo84, notifyDealCommentMentions, notifyDealCommentParticipants, notifyMultiple, notifyMultipleShared, notifyNewCrmAssignmentAssignees, notifyProductionDocumentUploaded, onLeadWon, onOrderConfirmed, onProjectCompleted, onQuotationAccepted, orgReportAttachFirstStageRates, orgReportBumpFirstStageMetrics, orgReportBumpMetrics, orgReportBumpOpenOverdue, orgReportBumpReceptionMetrics, orgReportCancelRatePct, orgReportClosedWonDealCount, orgReportClosedWonValue, orgReportCompareSummary, orgReportConversionRate, orgReportDayKey, orgReportDealCloseValueRatePct, orgReportDealCountsExpected, orgReportDealIsClosedWon, orgReportDealIsCompleted, orgReportDealIsQuotedOrAfter, orgReportDealProbability, orgReportDealSplitBuckets, orgReportExtendedDealMetrics, orgReportFirstStageOnTimeRatePct, orgReportFirstStageOverdueRatePct, orgReportIsReceptionOverdue, orgReportIsSlaOverdue, orgReportKpiPeriodStart, orgReportNumEst, orgReportOverdueRatePct, orgReportOwnerId, orgReportPctDelta, orgReportPreviousPeriod, orgReportQuoteValueCloseRatePct, orgReportQuoteWinRatePct, orgReportReceptionOverdueRatePct, orgReportReceptionSlaMinutes, orgReportStageIsClosed, orgReportStageIsLostOrCancelled, orgReportTotalDealCount, parseChecklist, parseCrmLeadsPageRpc, parseCrmReportDateRange, parseCrmStageCountsNumericMap, parseCrmStageCountsRpc, parseExcelMoneyFromMappedColumn, parseLeadIdUuidList, parseLeadIdsCsvQuery, parseLeadIdsFromBody, parseLeadSeenByRaw, parseQuotationExcelBuffer, parseStageIdsFromQuery, parseUuidArrayJsonb, parseVietnameseMeasure, parseVietnameseMoney, path, persistAssignmentNotification, pgCrmDuplicateLeadIds, pickDealZaloTemplatePayload, pipeOrgOverviewReportPdf, pipeStaffLeadDealSummaryPdf, pipeStaffPipelineDetailPdf, pipelineHasExplicitCompleted, pipelineHasExplicitExpected, pipelineHasExplicitWon, plannerTableMissing, postCrmStageDefaultAssigneeComment, primaryTemplateItemAssigneeId, rcInvalidateTags, reactionsTableMissing, redactCrmTaskNotesForViewer, regionGeocodeInflight, repairCrmDealPipelineDisplay, requireUserCompanyId, requireUserCompanyIdResolved, resolveAssignmentIdForTask, resolveCanonicalCrmLeadId, resolveCommercialDocListCompanyScope, resolveCrmBundleTemplateScope, resolveCrmLeadsDeadlinesMap, resolveCrmLeadsKanbanLite, resolveCrmLeadsMergedQuery, resolveCrmLeadsSkipDeadline, resolveCrmLedgerNetByLeadIdsPayload, resolveCrmReportScope, resolveCrmTaskWriteLeadId, resolveExecutorCompanyId, resolveKanbanStagesForCompany, resolveLeadCommentMentionIds, resolveProductionCompanyForDealStage, resolveProductionHandoverResponsibleUserId, resolveReopenTargetStageId, resolveRpcRegionIdsForCrmList, resolveTenantIdForQuota, resolveZaloDealTemplateId, respondIfCrmPipelinesTableMissing, responseCache, restoreCrmTaskChecklistFromWorkshopTemplate, resyncCrmPipelineTasksForLead, sanitizeIsoDateQueryParam, scheduleRegionGeocoding, scopedAdminCompanyId, scopedCrmCompanyIdForWrite, sendZaloTemplateMessage, setLeadFlag, shallowMergeTemplateData, skipSxWorkQuickComplete, snapshotOrderRowFromQuotation, stripCrmAssigneeFromWonStageUpdates, stripCrmLeadTypeColorFromSelect, stripQuotationsSourceExcelFields, sumCrmKpiLedgerNetByLeadIds, sumCrmKpiLedgerNetByUserForOrgReport, sumCrmKpiLedgerNetByUserIds, sumCrmKpiLedgerNetByUserIdsInDateRange, supabase, syncAllTaskArtifactsToAssignment, syncChecklistItemNotes, syncCrmLeadSxPipelineFromProject, syncQuotationDepositToDealAndProject, syncSxKanbanFromCrmProductionStage, syncTaskAttachmentToAssignment, templateItemAssigneePatch, toCrmTaskChecklist, unifyCrmLeadResponsibleFields, updateCrmLeadTask, updateQuotationRow, upsertZaloNotifySettings, userCanAccessCrmLeadAsParticipant, userCanAccessCrmLeadViaVisibility, userCanAssignAnyCrmRegion, userCanBypassCrmDeleteRestriction, userHasSeenLeadInSeenBy, userIsAdmin, userIsCrmCompanyOrRegionAdmin, userMayAccessQuotationRow, userSeesAllCrmDeals, userSeesAllCrmDealsForScope, userSeesAllCrmLeads, userSeesAllCrmLeadsForScope, uuidQueryOrNull, validateProductionCompanyId) {
r.get('/lead-types', async (req, res) => {
  try {
    const companyId = req.query.company_id || null;
    const sacLt = scopedAdminCompanyId(req);
    if (sacLt) {
      if (companyId && String(companyId) !== String(sacLt)) {
        return res.status(403).json({ error: 'Không có quyền xem loại của công ty khác' });
      }
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      if (companyId && String(companyId) !== String(cid)) return res.status(403).json({ error: 'Không có quyền xem loại của công ty khác' });
    }
    const cidFinal = companyId || (req.user?.company_id || null);
    if (!cidFinal) return res.json([]);
    const data = await getCrmLeadTypesList({
      companyId: cidFinal,
      activeOnly: req.query.all !== 'true',
    });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/lead-types', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name?.trim()) return res.status(400).json({ error: 'Thiếu tên loại' });
    let company_id = b.company_id || null;
    if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      company_id = cid;
    }
    if (!company_id) return res.status(400).json({ error: 'Thiếu company_id' });

    const applies_to = ['lead','deal','both'].includes(String(b.applies_to || 'both')) ? String(b.applies_to || 'both') : 'both';
    const { data: last } = await supabase.from('crm_lead_types')
      .select('order_index')
      .eq('company_id', company_id)
      .order('order_index', { ascending: false })
      .limit(1);
    const nextOrder = (last?.[0]?.order_index ?? 0) + 1;

    let defaultProductionCompanyId = null;
    if (b.default_production_company_id != null && String(b.default_production_company_id).trim() !== '') {
      const pv = await validateProductionCompanyId(b.default_production_company_id);
      if (!pv.ok) return res.status(400).json({ error: pv.error });
      defaultProductionCompanyId = pv.company.id;
    }

    const { data, error } = await supabase.from('crm_lead_types').insert({
      company_id,
      name: b.name.trim(),
      applies_to,
      order_index: b.order_index ?? nextOrder,
      is_active: b.is_active !== false,
      workshop_production_templates: !!b.workshop_production_templates,
      default_production_company_id: defaultProductionCompanyId,
      updated_at: new Date().toISOString(),
    }).select('*').single();
    if (error) throw error;
    invalidateSources();
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/lead-types/:id', async (req, res) => {
  try {
    const b = req.body || {};
    const { data: existing, error: exErr } = await supabase.from('crm_lead_types').select('id, company_id').eq('id', req.params.id).single();
    if (exErr) throw exErr;
    if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      if (String(existing.company_id || '') !== String(cid)) return res.status(403).json({ error: 'Không có quyền sửa loại của công ty khác' });
    }

    const update = {};
    ['name', 'order_index', 'is_active'].forEach((f) => { if (b[f] !== undefined) update[f] = b[f]; });
    if (b.workshop_production_templates !== undefined) update.workshop_production_templates = !!b.workshop_production_templates;
    if (b.applies_to !== undefined) {
      const at = String(b.applies_to || 'both');
      update.applies_to = ['lead','deal','both'].includes(at) ? at : 'both';
    }
    if (b.default_production_company_id !== undefined) {
      const raw = b.default_production_company_id;
      if (raw === null || raw === '') {
        update.default_production_company_id = null;
      } else {
        const pv = await validateProductionCompanyId(raw);
        if (!pv.ok) return res.status(400).json({ error: pv.error });
        update.default_production_company_id = pv.company.id;
      }
    }
    update.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from('crm_lead_types').update(update).eq('id', req.params.id).select('*').single();
    if (error) throw error;
    invalidateSources();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/referrers', async (req, res) => {
  try {
    const companyId = req.query.company_id || null;
    const sacRef = scopedAdminCompanyId(req);
    if (sacRef) {
      if (companyId && String(companyId) !== String(sacRef)) {
        return res.status(403).json({ error: 'Không có quyền xem người giới thiệu của công ty khác' });
      }
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      if (companyId && String(companyId) !== String(cid)) {
        return res.status(403).json({ error: 'Không có quyền xem người giới thiệu của công ty khác' });
      }
    }
    const cidFinal = companyId || (req.user?.company_id || null);
    if (!cidFinal) return res.json({ items: [] });
    const { listCrmReferrers } = require('../../../helpers/crmReferrers');
    const items = await listCrmReferrers(cidFinal);
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/referrers', async (req, res) => {
  try {
    const b = req.body || {};
    let company_id = b.company_id || null;
    if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      company_id = cid;
    }
    if (!company_id) return res.status(400).json({ error: 'Thiếu company_id' });
    const { upsertCrmReferrer, normalizeReferrerName } = require('../../../helpers/crmReferrers');
    const nameTrim = normalizeReferrerName(b.name);
    if (!nameTrim) return res.status(400).json({ error: 'Nhập tên người giới thiệu' });
    const saved = await upsertCrmReferrer({
      companyId: company_id,
      name: nameTrim,
      userId: req.user.userId,
    });
    if (!saved) {
      return res.status(503).json({ error: 'Chưa cài bảng người giới thiệu — chạy migration 337' });
    }
    res.status(saved.created ? 201 : 200).json(saved);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.delete('/lead-types/:id', async (req, res) => {
  try {
    const { data: existing, error: exErr } = await supabase.from('crm_lead_types').select('id, company_id').eq('id', req.params.id).single();
    if (exErr) throw exErr;
    if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      if (String(existing.company_id || '') !== String(cid)) return res.status(403).json({ error: 'Không có quyền xóa loại của công ty khác' });
    }

    const { count } = await supabase.from('crm_leads')
      .select('id', { count: 'exact', head: true })
      .eq('lead_type_id', req.params.id);
    if ((count || 0) > 0) return res.status(400).json({ error: `Không thể xóa — ${count} lead/deal đang dùng loại này` });

    const { error } = await supabase.from('crm_lead_types').delete().eq('id', req.params.id);
    if (error) throw error;
    invalidateSources();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/zalo-notify-settings', async (_req, res) => {
  try {
    const s = await getZaloNotifySettings();
    res.json({
      enabled: s.enabled,
      template_id: s.template_id,
      sending_mode: s.sending_mode,
      has_token: !!(s.access_token && s.access_token.length > 8),
      merge_template_data: s.merge_template_data || {},
      template_structure: s.template_structure,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.put('/zalo-notify-settings', async (req, res) => {
  try {
    const prev = await getZaloNotifySettings();
    let nextTemplateStructure = prev.template_structure;
    if (req.body.template_structure !== undefined) {
      if (req.body.template_structure === null) {
        nextTemplateStructure = null;
      } else if (typeof req.body.template_structure === 'object' && !Array.isArray(req.body.template_structure)) {
        nextTemplateStructure = Object.keys(req.body.template_structure).length ? req.body.template_structure : null;
      }
    }
    const next = {
      ...prev,
      enabled: req.body.enabled !== undefined ? !!req.body.enabled : prev.enabled,
      template_id: req.body.template_id !== undefined ? String(req.body.template_id || '').trim() : prev.template_id,
      sending_mode: req.body.sending_mode !== undefined ? String(req.body.sending_mode || '1') : prev.sending_mode,
      merge_template_data:
        req.body.merge_template_data !== undefined
          ? (typeof req.body.merge_template_data === 'object' && req.body.merge_template_data ? req.body.merge_template_data : {})
          : prev.merge_template_data,
      template_structure: nextTemplateStructure,
      access_token: prev.access_token,
    };
    if (req.body.access_token !== undefined && String(req.body.access_token).trim() !== '') {
      next.access_token = String(req.body.access_token).trim();
    }
    await upsertZaloNotifySettings(next);
    res.json({
      enabled: next.enabled,
      template_id: next.template_id,
      sending_mode: next.sending_mode,
      has_token: !!(next.access_token && next.access_token.length > 8),
      merge_template_data: next.merge_template_data || {},
      template_structure: next.template_structure,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/zalo-notify-test', async (req, res) => {
  try {
    const s = await getZaloNotifySettings();
    const token = (req.body.access_token && String(req.body.access_token).trim()) || s.access_token;
    const tid = (req.body.template_id && String(req.body.template_id).trim()) || s.template_id;
    if (!token || !tid) {
      return res.status(400).json({ error: 'Cần access_token và template_id (lưu trong cấu hình hoặc gửi kèm body)' });
    }
    const phone = req.body.phone;
    const templateData = req.body.template_data && typeof req.body.template_data === 'object' ? { ...req.body.template_data } : {};
    Object.keys(templateData).forEach((k) => {
      if (templateData[k] != null && typeof templateData[k] !== 'string') templateData[k] = String(templateData[k]);
    });
    const trackingId = (req.body.tracking_id && String(req.body.tracking_id).slice(0, 48).replace(/[^a-zA-Z0-9_-]/g, '')) || `test${Date.now()}`.slice(0, 48);
    const result = await sendZaloTemplateMessage({
      accessToken: token,
      phone,
      templateId: tid,
      templateData,
      trackingId,
      sendingMode: req.body.sending_mode != null ? String(req.body.sending_mode) : s.sending_mode,
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/leads/:id/zalo-notify-preview', async (req, res) => {
  try {
    const leadId = req.params.id;
    const { data: lead } = await supabase.from('crm_leads')
      .select('id, code, title, type, stage_id, estimated_value, pipeline_id, customer:customers(id, full_name, phone, email, address)')
      .eq('id', leadId)
      .single();
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy' });
    if (lead.type !== 'deal') return res.status(400).json({ error: 'Chỉ áp dụng cho deal' });

    const { data: stage } = await supabase.from('crm_pipeline_stages')
      .select('id, name, is_won, send_zalo_on_enter, pipeline_type')
      .eq('id', lead.stage_id)
      .single();
    if (!isDealStageHoanThanhForZalo(stage)) {
      return res.status(400).json({
        error:
          'Chỉ hiển thị khi deal đang ở cột «Hoàn thành» (tên giai đoạn deal chứa «Hoàn thành»). Thêm cột này trong Cài đặt Pipeline → Deal và kéo deal vào đó.',
      });
    }

    const settings = await getZaloNotifySettings();
    const plZalo = await fetchCrmPipelineZaloSlice(lead.pipeline_id);
    const effectiveTemplateId = resolveZaloDealTemplateId(plZalo.zalo_template_id || settings.template_id);
    const mergedMerge = shallowMergeTemplateData(settings.merge_template_data, plZalo.zalo_merge_template_data);
    const fullTemplateData = buildDealTemplateData(lead, lead.customer, mergedMerge);
    const templateData = pickDealZaloTemplatePayload(fullTemplateData, effectiveTemplateId);
    const rawPhone = String(lead.customer?.phone || '').trim();
    const normalized = normalizeVnPhoneTo84(rawPhone);
    const phoneCanonicalLocal = formatVnPhoneLocal0From84(normalized);
    const { data: prevSend } = await supabase.from('crm_zalo_stage_sends')
      .select('msg_id, error_message, tracking_id, updated_at')
      .eq('lead_id', leadId)
      .eq('stage_id', lead.stage_id)
      .maybeSingle();

    const hasToken = !!(settings.access_token && settings.access_token.length > 8);
    const eligible = !!(settings.enabled && hasToken && normalized);

    res.json({
      eligible,
      stage: {
        id: stage.id,
        name: stage.name,
        is_won: !!stage.is_won,
        send_zalo_on_enter: !!stage.send_zalo_on_enter,
      },
      zalo_app: {
        enabled: settings.enabled,
        template_id: settings.template_id || null,
        effective_template_id: effectiveTemplateId,
        sending_mode: settings.sending_mode || '1',
        has_access_token: hasToken,
        access_token_preview: hasToken ? maskZaloAccessTokenPreview(settings.access_token) : '',
        merge_template_data: settings.merge_template_data || {},
      },
      pipeline_zalo: {
        pipeline_id: lead.pipeline_id || null,
        pipeline_name: plZalo.pipeline?.name || null,
        zalo_template_id: plZalo.zalo_template_id,
        zalo_merge_template_data: plZalo.zalo_merge_template_data || {},
        merged_preview: mergedMerge,
      },
      customer: {
        full_name: lead.customer?.full_name || lead.title || '',
        phone_display: maskCustomerPhoneDisplay(lead.customer?.phone),
      },
      destination_phone_e164: normalized || null,
      destination_phone_ok: !!normalized,
      phone_for_zalo_84: normalized || null,
      phone_canonical_local: phoneCanonicalLocal || null,
      template_data: templateData,
      request_payload_preview: {
        phone: normalized || null,
        template_id: effectiveTemplateId,
        template_data: templateData,
        sending_mode: settings.sending_mode && settings.sending_mode !== '1' ? settings.sending_mode : undefined,
        tracking_id: '(tự sinh khi gửi)',
      },
      previous_send: prevSend
        ? {
            msg_id: prevSend.msg_id,
            error_message: prevSend.error_message,
            tracking_id: prevSend.tracking_id,
            updated_at: prevSend.updated_at,
          }
        : null,
      hints: {
        pipeline_toggle:
          'Trên Cài đặt Pipeline → Deal: bật nút «Zalo» trên cột «Hoàn thành» để tự gửi khi kéo deal vào cột đó (mỗi deal + cột tối đa 1 lần thành công).',
        settings:
          'access_token (bắt buộc) + Zalo OA chung. Theo từng pipeline CRM: chỉnh template_id / merge JSON — ghi đè chung cho deal thuộc pipeline đó (Cài đặt Pipeline → «Zalo theo pipeline»).',
        after_failed_send:
          'Nếu lần trước Zalo báo lỗi (chưa có msg_id): sửa cấu hình/template rồi bấm «Gửi thông báo Zalo» lại — không cần xóa bản ghi.',
        phone_normalize:
          'SĐT lưu dạng 09…, +84…, 0084… hoặc có khoảng trắng vẫn được — hệ thống tự chuẩn hóa 84… khi gọi Zalo. Sau khi gửi thành công, SĐT khách có thể được cập nhật dạng 0xxxxxxxxx trên thẻ Khách hàng.',
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/leads/:id/zalo-template-fill', async (req, res) => {
  try {
    const leadId = req.params.id;
    const { data: lead } = await supabase.from('crm_leads')
      .select('id, code, title, type, stage_id, estimated_value, pipeline_id, customer:customers(id, full_name, phone, email, address)')
      .eq('id', leadId)
      .single();
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy' });
    if (lead.type !== 'deal') return res.status(400).json({ error: 'Chỉ áp dụng cho deal' });

    const { data: stage } = await supabase.from('crm_pipeline_stages')
      .select('id, name, pipeline_type')
      .eq('id', lead.stage_id)
      .single();
    if (!isDealStageHoanThanhForZalo(stage)) {
      return res.status(400).json({ error: 'Chỉ dùng khi deal đang ở cột «Hoàn thành»' });
    }

    const settings = await getZaloNotifySettings();
    const plZalo = await fetchCrmPipelineZaloSlice(lead.pipeline_id);
    const mergedMerge = shallowMergeTemplateData(settings.merge_template_data, plZalo.zalo_merge_template_data);

    const bodyStruct = req.body?.structure;
    let structure;
    if (isValidDealZaloTemplateStructure(bodyStruct)) {
      structure = bodyStruct;
    } else if (isValidDealZaloTemplateStructure(settings.template_structure)) {
      structure = settings.template_structure;
    } else {
      structure = getDefaultDealZaloTemplateStructure();
    }

    const filled = fillTemplateDataFromStructure(structure, lead, lead.customer, mergedMerge);
    res.json({ filled });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/leads/:id/zalo-notify-send', async (req, res) => {
  try {
    const leadId = req.params.id;
    const force = !!req.body?.force;
    const rawTd = req.body?.template_data;
    const templateDataOverride =
      rawTd && typeof rawTd === 'object' && !Array.isArray(rawTd) && Object.keys(rawTd).length > 0 ? rawTd : null;

    const { data: lead } = await supabase.from('crm_leads').select('id, type, stage_id').eq('id', leadId).single();
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy' });
    if (lead.type !== 'deal') return res.status(400).json({ error: 'Chỉ áp dụng cho deal' });

    const { data: stage } = await supabase.from('crm_pipeline_stages')
      .select('id, name, is_won, pipeline_type')
      .eq('id', lead.stage_id)
      .single();
    if (!isDealStageHoanThanhForZalo(stage)) {
      return res.status(400).json({ error: 'Chỉ gửi được khi deal đang ở cột «Hoàn thành»' });
    }

    const out = await executeZaloDealStageNotify({
      leadId,
      stageId: lead.stage_id,
      pipelineType: stage.pipeline_type,
      sendZaloOnEnter: true,
      allowWithoutStageFlag: true,
      force,
      templateDataOverride,
    });
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/sources', responseCache({ ttl: 120, scope: 'company', tags: ['crm:taxonomy'] }), async (req, res) => {
  try {
    const qCo = req.query.company_id && String(req.query.company_id).trim() ? String(req.query.company_id).trim() : null;
    let filterCo = qCo;
    const sacSrc = scopedAdminCompanyId(req);
    if (sacSrc) {
      filterCo = sacSrc;
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      filterCo = cid;
    }

    const includeInactive = userIsAdmin(req.user?.role) && String(req.query.include_inactive) === '1';
    const data = await getCrmSourcesList({ filterCo, includeInactive });

    let pagesQ = supabase
      .from('facebook_pages')
      .select('id, page_id, page_name, is_active, default_company_id')
      .eq('is_active', true);
    if (filterCo) {
      pagesQ = pagesQ.or(`default_company_id.is.null,default_company_id.eq.${filterCo}`);
    }
    const { data: rawPages, error: pgErr } = await pagesQ;
    if (pgErr) throw pgErr;

    const pages = (rawPages || [])
      .filter(p => p.page_id)
      .sort((a, b) => (a.page_name || '').localeCompare(b.page_name || ''))
      .map(p => ({
        id: p.id,
        page_id: p.page_id,
        page_name: (p.page_name || '').trim(),
        is_active: !!p.is_active,
        default_company_id: p.default_company_id || null,
        source_key: p.page_id,
        page_ids: [p.page_id],
        page_count: 1,
      }));

    res.json({ sources: data || [], fb_pages: pages });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/source-categories', async (req, res) => {
  try {
    let filterCo = req.query.company_id && String(req.query.company_id).trim() ? String(req.query.company_id).trim() : null;
    const sacCat = scopedAdminCompanyId(req);
    if (sacCat) {
      filterCo = sacCat;
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      filterCo = cid;
    }
    const includeInactive = userIsAdmin(req.user?.role) && String(req.query.include_inactive) === '1';
    const data = await getCrmSourceCategoriesList({ filterCo, includeInactive });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/source-categories', async (req, res) => {
  try {
    if (!userIsAdmin(req.user?.role)) return res.status(403).json({ error: 'Chỉ admin' });
    const b = req.body || {};
    if (!b.name?.trim()) return res.status(400).json({ error: 'Thiếu tên phân loại' });
    let company_id = b.company_id === '' || b.company_id === undefined ? null : b.company_id;
    if (company_id && typeof company_id !== 'string') company_id = String(company_id);

    const { data: lastRow } = await supabase
      .from('crm_source_categories')
      .select('order_index')
      .order('order_index', { ascending: false })
      .limit(1);
    const nextOrder = (lastRow?.[0]?.order_index ?? 0) + 1;

    const { data, error } = await supabase
      .from('crm_source_categories')
      .insert({
        name: b.name.trim(),
        icon: b.icon?.trim() || null,
        color: b.color?.trim() || null,
        order_index: b.order_index ?? nextOrder,
        company_id,
        is_active: b.is_active !== false,
      })
      .select('*')
      .single();
    if (error) throw error;
    invalidateSources();
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/source-categories/:id', async (req, res) => {
  try {
    if (!userIsAdmin(req.user?.role)) return res.status(403).json({ error: 'Chỉ admin' });
    const { data: existing, error: exErr } = await supabase
      .from('crm_source_categories')
      .select('id, company_id')
      .eq('id', req.params.id)
      .single();
    if (exErr) throw exErr;
    const b = req.body || {};
    const update = {};
    if (b.name !== undefined) update.name = String(b.name || '').trim();
    if (b.icon !== undefined) update.icon = b.icon?.trim() || null;
    if (b.color !== undefined) update.color = b.color?.trim() || null;
    if (b.order_index !== undefined) update.order_index = b.order_index;
    if (b.is_active !== undefined) update.is_active = !!b.is_active;
    if (b.company_id !== undefined) {
      update.company_id = b.company_id === '' || b.company_id === null ? null : String(b.company_id);
    }
    if (update.name === '') return res.status(400).json({ error: 'Tên không được trống' });

    const { data, error } = await supabase
      .from('crm_source_categories')
      .update(update)
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;
    invalidateSources();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.delete('/source-categories/:id', async (req, res) => {
  try {
    if (!userIsAdmin(req.user?.role)) return res.status(403).json({ error: 'Chỉ admin' });
    const { count } = await supabase
      .from('crm_sources')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', req.params.id);
    if ((count || 0) > 0) {
      return res.status(400).json({ error: `Không xóa được — ${count} nguồn đang dùng phân loại này` });
    }
    const { error } = await supabase.from('crm_source_categories').delete().eq('id', req.params.id);
    if (error) throw error;
    invalidateSources();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/sources', async (req, res) => {
  try {
    if (!userIsAdmin(req.user?.role)) return res.status(403).json({ error: 'Chỉ admin' });
    const b = req.body || {};
    if (!b.name?.trim()) return res.status(400).json({ error: 'Thiếu tên nguồn' });
    let company_id = b.company_id === '' || b.company_id === undefined ? null : String(b.company_id);
    const category_id = b.category_id === '' || b.category_id === undefined ? null : String(b.category_id);
    const chk = await assertCategoryFitsSource(supabase, category_id, company_id);
    if (!chk.ok) return res.status(400).json({ error: chk.error });

    const { data, error } = await supabase
      .from('crm_sources')
      .insert({
        name: b.name.trim(),
        icon: b.icon?.trim() || '📎',
        color: b.color?.trim() || null,
        company_id,
        category_id,
        is_active: b.is_active !== false,
      })
      .select('*, category:crm_source_categories(id, name, icon, color, company_id)')
      .single();
    if (error) throw error;
    invalidateSources();
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/sources/:id', async (req, res) => {
  try {
    if (!userIsAdmin(req.user?.role)) return res.status(403).json({ error: 'Chỉ admin' });
    const b = req.body || {};
    const { data: existing, error: exErr } = await supabase
      .from('crm_sources')
      .select('id, company_id, category_id')
      .eq('id', req.params.id)
      .single();
    if (exErr) throw exErr;

    let company_id = existing.company_id;
    if (b.company_id !== undefined) {
      company_id = b.company_id === '' || b.company_id === null ? null : String(b.company_id);
    }
    let category_id = existing.category_id;
    if (b.category_id !== undefined) {
      category_id = b.category_id === '' || b.category_id === null ? null : String(b.category_id);
    }
    const chk = await assertCategoryFitsSource(supabase, category_id, company_id);
    if (!chk.ok) return res.status(400).json({ error: chk.error });

    const update = {};
    if (b.name !== undefined) update.name = String(b.name || '').trim();
    if (b.icon !== undefined) update.icon = b.icon?.trim() || null;
    if (b.color !== undefined) update.color = b.color?.trim() || null;
    if (b.is_active !== undefined) update.is_active = !!b.is_active;
    if (b.company_id !== undefined) update.company_id = company_id;
    if (b.category_id !== undefined) update.category_id = category_id;
    if (update.name === '') return res.status(400).json({ error: 'Tên không được trống' });

    const { data, error } = await supabase
      .from('crm_sources')
      .update(update)
      .eq('id', req.params.id)
      .select('*, category:crm_source_categories(id, name, icon, color, company_id)')
      .single();
    if (error) throw error;
    invalidateSources();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
}).call(null, helpers["ALLOWED_DEADLINE_FIELDS"], helpers["CRM_COMMENT_ALLOWED_REACTION_EMOJI"], helpers["CRM_LEAD_KANBAN_LITE_SELECT"], helpers["CRM_LEAD_LIST_SELECT"], helpers["CRM_LEAD_LIST_SELECT_BASE"], helpers["CRM_LEAD_LIST_SELECT_EXTRA"], helpers["CRM_LEAD_REGION_EMBED"], helpers["CRM_NEW_LEAD_MAX_AGE_MS"], helpers["CRM_TASK_SELECT"], helpers["CRM_UUID_RE"], helpers["CUSTOMERS_IN_CHUNK"], helpers["CUSTOMERS_OVERVIEW_NO_MATCH_ID"], helpers["DEAL_PRE_CONTRACT_SLUGS_STAFF"], helpers["DEAL_REPORT_BUCKET_VALUES"], helpers["DEFAULT_CHECKLISTS"], helpers["DEFAULT_DEADLINE_BUCKETS"], helpers["DEFAULT_PIPELINE_STAGE_SLA_DAYS"], helpers["FOLLOWUP_TIME_BUCKETS"], helpers["PDFDocument"], helpers["QUOTATIONS_SOURCE_EXCEL_COLS"], helpers["Router"], helpers["SCAN_DUP_LITE_SELECT"], helpers["STAFF_LEAD_DEAL_REPORT_ROLES"], helpers["SURVEY_EVENT_SELECT"], helpers["SURVEY_EVENT_TYPES"], helpers["XLSX"], helpers["ZALO_APP_SETTING_KEY"], helpers["_crmLeadSelectMigrationChecked"], helpers["_crmLeadTypeColorAvailable"], helpers["_vcPipelineStageAvailable"], helpers["addPhoneToAutoLeadBlocklist"], helpers["aggregateCrmCommentReactions"], helpers["aggregateOrgReportRows"], helpers["appendFulfillmentChildTasksForMasterDeal"], helpers["applyAllActiveWorkshopTemplatesForArea"], helpers["applyAssigneesToInsertedCrmTasks"], helpers["applyCrmLeadRegionFilterToQuery"], helpers["applyCrmTaskTemplatesToCompanyRegions"], helpers["applyCustomerIdInFilter"], helpers["applyCustomersOverviewSearch"], helpers["applyDefaultWorkshopTemplatesForNewProject"], helpers["applyLeadOrCustomerSalesFilter"], helpers["applyProductionTemplateToFulfillmentLead"], helpers["applyProductionTemplatesOnPipelineEnter"], helpers["applyStageIdFilterToQuery"], helpers["applyWorkshopTemplateToProject"], helpers["artifactNamePrefix"], helpers["assertCanFlagLead"], helpers["assertCategoryFitsSource"], helpers["assertCrmAssigneeUserMatchesLeadCompany"], helpers["assertCrmEmployeeDeleteAllowed"], helpers["assertCrmStageAdvanceAllowed"], helpers["assertDealCrmManualStageChange"], helpers["assertDealResponsible"], helpers["assertDivisionAllowedForCompany"], helpers["assertLeadDocumentOwner"], helpers["assertLeadReadableByRegionScope"], helpers["assertRegionBelongsToCompany"], helpers["assertUserCanAssignCrmRegion"], helpers["assignProductionCompanyDealResponsibility"], helpers["attachAssigneesToCrmTasks"], helpers["attachAssignmentIdsToCrmTasks"], helpers["attachCrmNextOpenTaskDeadline"], helpers["attachLeadNewFlagForList"], helpers["attachLeadReplyParents"], helpers["attachLeadUserFlagsForList"], helpers["auth"], helpers["autoCreateProjectFromWonDeal"], helpers["autoFlowFns"], helpers["autoGenCrmTasksForNewLead"], helpers["buildAssignmentNotificationInsert"], helpers["buildChecklistLeadDocumentRow"], helpers["buildCrmDashboardMinimalKpis"], helpers["buildCrmLeadsRpcFilterParams"], helpers["buildCustomersOverviewSummary"], helpers["buildDealTemplateData"], helpers["buildDefaultDeadlineConfig"], helpers["buildFirstStageIdByPipeline"], helpers["buildPipelineStagesMap"], helpers["buildProcessedCommercialItems"], helpers["buildQuotedStageOrderByPipeline"], helpers["buildScanDuplicateGroups"], helpers["buildWonStageOrderByPipeline"], helpers["canUserViewDocByAllowlist"], helpers["chatUpload"], helpers["chunkArray"], helpers["classifyDealStageForStaffReport"], helpers["commentsTableMissing"], helpers["companyRegionExtraColumnsMissing"], helpers["companyRegionGeoColumnsMissing"], helpers["computeCrmDashboardLightStats"], helpers["computeCrmLiveVersionMs"], helpers["computeCustomersOverviewSummary"], helpers["computeIsNewLeadForUser"], helpers["computeOrgOverviewReportData"], helpers["computeStaffLeadDealReportData"], helpers["computeStaffPipelineDetailPayload"], helpers["countOpenOverdueCrmTasksForLeadIds"], helpers["createCrmAssignment"], helpers["createCrmLeadTask"], helpers["createFulfillmentChildDeal"], helpers["createNotif"], helpers["createNotification"], helpers["createProjectFromLead"], helpers["crmExecutorFieldsFromTemplateItem"], helpers["crmLeadCommentAttachmentsColumnMissing"], helpers["crmLeadCommentReadReceiptsTableMissing"], helpers["crmLeadRowVisibleToRequestUser"], helpers["crmListUsesLegacyFilters"], helpers["crmNoteActivityUpload"], helpers["crmReportAsOfMs"], helpers["crmReportCreatedAtFromIso"], helpers["crmReportCreatedAtToIso"], helpers["crmReportDayKeyVn"], helpers["crmRouteErrorText"], helpers["crmTaskDeadlineModuleKey"], helpers["crmTaskMeetsCompletionRequirements"], helpers["crmTaskMeetsRequiredFileTypes"], helpers["crmTaskRequiresCompletionEvidence"], helpers["crmTemplateMatchesLeadType"], helpers["deadlineToDateOnlyIso"], helpers["defaultCompanyInfo"], helpers["defaultKpiLedgerMonthStartYmd"], helpers["deleteCrmLeadTask"], helpers["deleteMirroredAssignmentFileForTaskAttachment"], helpers["duplicateLeadIdsFromLiteRows"], helpers["ecosystemModuleKeyForCrmDeadline"], helpers["effectivePipelineStageSlaDays"], helpers["emitCrmBadgeUpdateForProject"], helpers["emitCrmDashboardChanged"], helpers["emitCrmTaskChanged"], helpers["emptyStaffLeadDealAgg"], helpers["endOfCalendarDayAfterEntered"], helpers["enforceCommercialDocCompanyOnWrite"], helpers["enforceQuotaForRequest"], helpers["ensureDealLeadDocumentsForModuleTransition"], helpers["ensureDefaultCrmPipelineForCompany"], helpers["ensureMissingCrmTasksForLead"], helpers["ensureMissingCrmTasksForPipelineStage"], helpers["ensureMissingSxTasksForLead"], helpers["excelUpload"], helpers["executeLeadMerge"], helpers["executeZaloDealStageNotify"], helpers["fetchActivityCustomerIds"], helpers["fetchAllLeadsForSlaWatchlist"], helpers["fetchAssignmentForTask"], helpers["fetchCrmCommentReactionsAggregate"], helpers["fetchCrmLeadCommentNotifyUserIds"], helpers["fetchCrmLeadDetailRow"], helpers["fetchCrmLeadWithPipelineBadges"], helpers["fetchCrmLeadsByIdsOrdered"], helpers["fetchCrmLeadsForDashboardBatched"], helpers["fetchCrmLeadsForOrgReportBatched"], helpers["fetchCrmLeadsForUserDetailBatched"], helpers["fetchCrmLeadsLiteForDuplicateScan"], helpers["fetchCrmLeadsPageViaRpc"], helpers["fetchCrmPipelineZaloSlice"], helpers["fetchCrmSurveyEventsChunk"], helpers["fetchCrmSurveyVisitsForOrgReport"], helpers["fetchLeadCommentAudienceMembers"], helpers["fetchLeadCommentAudienceMembersForRead"], helpers["fetchLeadIdsForCrmRegion"], helpers["fetchLeadMentionMembers"], helpers["fetchOrgActivityFeed"], helpers["fetchPipelineWithStagesById"], helpers["fetchScopedCrmBundles"], helpers["fillTemplateDataFromStructure"], helpers["filterCrmTasksForLeadType"], helpers["filterUserIdsForCrmLeadScopedNotification"], helpers["findChecklistItem"], helpers["followupDismissExpiresAt"], helpers["fontBold"], helpers["fontRegular"], helpers["formatMoney"], helpers["formatVNDPdf"], helpers["formatVnPhoneLocal0From84"], helpers["fs"], helpers["generateDocPdf"], helpers["generateFlowTasks"], helpers["generateStepTasks"], helpers["getAppSettingValue"], helpers["getCompanyInfo"], helpers["getCompanyRegionsList"], helpers["getCrmLeadListSelect"], helpers["getCrmLeadRegionConstraint"], helpers["getCrmLeadTypesList"], helpers["getCrmLeadsListLegacy"], helpers["getCrmSourceCategoriesList"], helpers["getCrmSourcesList"], helpers["getDefaultCrmAttachmentShare"], helpers["getDefaultDealZaloTemplateStructure"], helpers["getDefaultLeadDocumentShareForDeal"], helpers["getDefaultPipelineIdForCompany"], helpers["getLeadDocumentFieldsFromCrmTask"], helpers["getNotifyTargets"], helpers["getOverdueFollowUps"], helpers["getPipelineIdForCompanyRegion"], helpers["getPipelineZaloSlice"], helpers["getPipelinesList"], helpers["getProjectCRMSummary"], helpers["getStagesByPipelineId"], helpers["getStaleLeads"], helpers["getZaloNotifySettings"], helpers["hydrateCrmLeadsByIdsWithStaff"], helpers["hydrateCrmLeadsRpcPage"], helpers["hydrateScanDuplicateLeads"], helpers["insertQuotationRow"], helpers["invalidateAppSettingKey"], helpers["invalidatePipelinesAndStages"], helpers["invalidateRegions"], helpers["invalidateSources"], helpers["invalidateTenantUsageCache"], helpers["invokeCrmLeadsStageCountsRpc"], helpers["isAdminLike"], helpers["isAllowedLeadCommentAttachmentUrl"], helpers["isChotSanXuatCrmTaskTitle"], helpers["isCrmCompanyAdminUser"], helpers["isCrmDealAssigneeLocked"], helpers["isCrmLeadTypeColorMissingError"], helpers["isCrmModuleAdmin"], helpers["isCrmPipelinesTableMissingError"], helpers["isCrmRegionAdminUser"], helpers["isCrmSystemAdminUser"], helpers["isDealStageHoanThanhForZalo"], helpers["isDefaultAssigneeIdsColumnError"], helpers["isExecutorColumnError"], helpers["isPlatformAdmin"], helpers["isPostgresUniqueViolation"], helpers["isQuotationsSourceExcelColumnMissingError"], helpers["isSxRelationshipError"], helpers["isSystemAdmin"], helpers["isUuidString"], helpers["isValidDealZaloTemplateStructure"], helpers["isVcRelationshipError"], helpers["isVptCompanyCommercialDocViewer"], helpers["lastNominatimGeocodeAt"], helpers["leadChatFilesMulter"], helpers["leadChatJsonOrFiles"], helpers["listQuotationExcelSheets"], helpers["loadCrmTaskAttachmentCountMap"], helpers["loadOrgReportStageMap"], helpers["loadZaloLinkedLeadIdSet"], helpers["logDealActivityComment"], helpers["logDealDeadlineChangeComment"], helpers["logDealStageChangeComment"], helpers["logKanbanDeadlineUnifiedHistory"], helpers["logLeadCommentMentionActivity"], helpers["logProjectFileActivity"], helpers["mapCustomerOverviewRow"], helpers["mapLeadDisplayPhone"], helpers["mapQuotationItemsToOrderRows"], helpers["maskCustomerPhoneDisplay"], helpers["maskZaloAccessTokenPreview"], helpers["maybeSendZaloOnDealStageEnter"], helpers["mergeCrmStageDefaultAssigneeIntoUpdates"], helpers["mergeCustomerIntoTarget"], helpers["misaService"], helpers["multer"], helpers["nextCode"], helpers["nextTbProjectCode"], helpers["normalizeCrmActivityAttachments"], helpers["normalizeCrmLeadCommentAttachments"], helpers["normalizeCrmStageDefaultAssigneeUserId"], helpers["normalizeCrmUserRole"], helpers["normalizeLeadSeenByKeys"], helpers["normalizeOrgReportSurveyVisitRow"], helpers["normalizePipelineStageSlaDaysForDb"], helpers["normalizePipelineStagesList"], helpers["normalizeRegionIdList"], helpers["normalizeTemplateChecklistForCrmTask"], helpers["normalizeTemplateItemAssigneeIds"], helpers["normalizeTimestamp"], helpers["normalizeTitleFold"], helpers["normalizeVnPhoneTo84"], helpers["notifyDealCommentMentions"], helpers["notifyDealCommentParticipants"], helpers["notifyMultiple"], helpers["notifyMultipleShared"], helpers["notifyNewCrmAssignmentAssignees"], helpers["notifyProductionDocumentUploaded"], helpers["onLeadWon"], helpers["onOrderConfirmed"], helpers["onProjectCompleted"], helpers["onQuotationAccepted"], helpers["orgReportAttachFirstStageRates"], helpers["orgReportBumpFirstStageMetrics"], helpers["orgReportBumpMetrics"], helpers["orgReportBumpOpenOverdue"], helpers["orgReportBumpReceptionMetrics"], helpers["orgReportCancelRatePct"], helpers["orgReportClosedWonDealCount"], helpers["orgReportClosedWonValue"], helpers["orgReportCompareSummary"], helpers["orgReportConversionRate"], helpers["orgReportDayKey"], helpers["orgReportDealCloseValueRatePct"], helpers["orgReportDealCountsExpected"], helpers["orgReportDealIsClosedWon"], helpers["orgReportDealIsCompleted"], helpers["orgReportDealIsQuotedOrAfter"], helpers["orgReportDealProbability"], helpers["orgReportDealSplitBuckets"], helpers["orgReportExtendedDealMetrics"], helpers["orgReportFirstStageOnTimeRatePct"], helpers["orgReportFirstStageOverdueRatePct"], helpers["orgReportIsReceptionOverdue"], helpers["orgReportIsSlaOverdue"], helpers["orgReportKpiPeriodStart"], helpers["orgReportNumEst"], helpers["orgReportOverdueRatePct"], helpers["orgReportOwnerId"], helpers["orgReportPctDelta"], helpers["orgReportPreviousPeriod"], helpers["orgReportQuoteValueCloseRatePct"], helpers["orgReportQuoteWinRatePct"], helpers["orgReportReceptionOverdueRatePct"], helpers["orgReportReceptionSlaMinutes"], helpers["orgReportStageIsClosed"], helpers["orgReportStageIsLostOrCancelled"], helpers["orgReportTotalDealCount"], helpers["parseChecklist"], helpers["parseCrmLeadsPageRpc"], helpers["parseCrmReportDateRange"], helpers["parseCrmStageCountsNumericMap"], helpers["parseCrmStageCountsRpc"], helpers["parseExcelMoneyFromMappedColumn"], helpers["parseLeadIdUuidList"], helpers["parseLeadIdsCsvQuery"], helpers["parseLeadIdsFromBody"], helpers["parseLeadSeenByRaw"], helpers["parseQuotationExcelBuffer"], helpers["parseStageIdsFromQuery"], helpers["parseUuidArrayJsonb"], helpers["parseVietnameseMeasure"], helpers["parseVietnameseMoney"], helpers["path"], helpers["persistAssignmentNotification"], helpers["pgCrmDuplicateLeadIds"], helpers["pickDealZaloTemplatePayload"], helpers["pipeOrgOverviewReportPdf"], helpers["pipeStaffLeadDealSummaryPdf"], helpers["pipeStaffPipelineDetailPdf"], helpers["pipelineHasExplicitCompleted"], helpers["pipelineHasExplicitExpected"], helpers["pipelineHasExplicitWon"], helpers["plannerTableMissing"], helpers["postCrmStageDefaultAssigneeComment"], helpers["primaryTemplateItemAssigneeId"], helpers["rcInvalidateTags"], helpers["reactionsTableMissing"], helpers["redactCrmTaskNotesForViewer"], helpers["regionGeocodeInflight"], helpers["repairCrmDealPipelineDisplay"], helpers["requireUserCompanyId"], helpers["requireUserCompanyIdResolved"], helpers["resolveAssignmentIdForTask"], helpers["resolveCanonicalCrmLeadId"], helpers["resolveCommercialDocListCompanyScope"], helpers["resolveCrmBundleTemplateScope"], helpers["resolveCrmLeadsDeadlinesMap"], helpers["resolveCrmLeadsKanbanLite"], helpers["resolveCrmLeadsMergedQuery"], helpers["resolveCrmLeadsSkipDeadline"], helpers["resolveCrmLedgerNetByLeadIdsPayload"], helpers["resolveCrmReportScope"], helpers["resolveCrmTaskWriteLeadId"], helpers["resolveExecutorCompanyId"], helpers["resolveKanbanStagesForCompany"], helpers["resolveLeadCommentMentionIds"], helpers["resolveProductionCompanyForDealStage"], helpers["resolveProductionHandoverResponsibleUserId"], helpers["resolveReopenTargetStageId"], helpers["resolveRpcRegionIdsForCrmList"], helpers["resolveTenantIdForQuota"], helpers["resolveZaloDealTemplateId"], helpers["respondIfCrmPipelinesTableMissing"], helpers["responseCache"], helpers["restoreCrmTaskChecklistFromWorkshopTemplate"], helpers["resyncCrmPipelineTasksForLead"], helpers["sanitizeIsoDateQueryParam"], helpers["scheduleRegionGeocoding"], helpers["scopedAdminCompanyId"], helpers["scopedCrmCompanyIdForWrite"], helpers["sendZaloTemplateMessage"], helpers["setLeadFlag"], helpers["shallowMergeTemplateData"], helpers["skipSxWorkQuickComplete"], helpers["snapshotOrderRowFromQuotation"], helpers["stripCrmAssigneeFromWonStageUpdates"], helpers["stripCrmLeadTypeColorFromSelect"], helpers["stripQuotationsSourceExcelFields"], helpers["sumCrmKpiLedgerNetByLeadIds"], helpers["sumCrmKpiLedgerNetByUserForOrgReport"], helpers["sumCrmKpiLedgerNetByUserIds"], helpers["sumCrmKpiLedgerNetByUserIdsInDateRange"], helpers["supabase"], helpers["syncAllTaskArtifactsToAssignment"], helpers["syncChecklistItemNotes"], helpers["syncCrmLeadSxPipelineFromProject"], helpers["syncQuotationDepositToDealAndProject"], helpers["syncSxKanbanFromCrmProductionStage"], helpers["syncTaskAttachmentToAssignment"], helpers["templateItemAssigneePatch"], helpers["toCrmTaskChecklist"], helpers["unifyCrmLeadResponsibleFields"], helpers["updateCrmLeadTask"], helpers["updateQuotationRow"], helpers["upsertZaloNotifySettings"], helpers["userCanAccessCrmLeadAsParticipant"], helpers["userCanAccessCrmLeadViaVisibility"], helpers["userCanAssignAnyCrmRegion"], helpers["userCanBypassCrmDeleteRestriction"], helpers["userHasSeenLeadInSeenBy"], helpers["userIsAdmin"], helpers["userIsCrmCompanyOrRegionAdmin"], helpers["userMayAccessQuotationRow"], helpers["userSeesAllCrmDeals"], helpers["userSeesAllCrmDealsForScope"], helpers["userSeesAllCrmLeads"], helpers["userSeesAllCrmLeadsForScope"], helpers["uuidQueryOrNull"], helpers["validateProductionCompanyId"]);

module.exports = r;
