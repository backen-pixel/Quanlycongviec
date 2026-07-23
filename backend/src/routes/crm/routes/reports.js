/**
 * CRM routes: reports
 * Auto-extracted — handlers close over shared helpers via IIFE.
 */
const { Router } = require('express');
const helpers = require('../shared/helpersBundle');

const r = Router();

(function (ALLOWED_DEADLINE_FIELDS, CRM_COMMENT_ALLOWED_REACTION_EMOJI, CRM_LEAD_KANBAN_LITE_SELECT, CRM_LEAD_LIST_SELECT, CRM_LEAD_LIST_SELECT_BASE, CRM_LEAD_LIST_SELECT_EXTRA, CRM_LEAD_REGION_EMBED, CRM_NEW_LEAD_MAX_AGE_MS, CRM_TASK_SELECT, CRM_UUID_RE, CUSTOMERS_IN_CHUNK, CUSTOMERS_OVERVIEW_NO_MATCH_ID, DEAL_PRE_CONTRACT_SLUGS_STAFF, DEAL_REPORT_BUCKET_VALUES, DEFAULT_CHECKLISTS, DEFAULT_DEADLINE_BUCKETS, DEFAULT_PIPELINE_STAGE_SLA_DAYS, FOLLOWUP_TIME_BUCKETS, PDFDocument, QUOTATIONS_SOURCE_EXCEL_COLS, Router, SCAN_DUP_LITE_SELECT, STAFF_LEAD_DEAL_REPORT_ROLES, SURVEY_EVENT_SELECT, SURVEY_EVENT_TYPES, XLSX, ZALO_APP_SETTING_KEY, crmSchemaCompat, addPhoneToAutoLeadBlocklist, aggregateCrmCommentReactions, aggregateOrgReportRows, appendFulfillmentChildTasksForMasterDeal, applyAllActiveWorkshopTemplatesForArea, applyAssigneesToInsertedCrmTasks, applyCrmLeadRegionFilterToQuery, applyCrmTaskTemplatesToCompanyRegions, applyCustomerIdInFilter, applyCustomersOverviewSearch, applyDefaultWorkshopTemplatesForNewProject, applyLeadOrCustomerSalesFilter, applyProductionTemplateToFulfillmentLead, applyProductionTemplatesOnPipelineEnter, applyStageIdFilterToQuery, applyWorkshopTemplateToProject, artifactNamePrefix, assertCanFlagLead, assertCategoryFitsSource, assertCrmAssigneeUserMatchesLeadCompany, assertCrmEmployeeDeleteAllowed, assertCrmStageAdvanceAllowed, assertDealCrmManualStageChange, assertDealResponsible, assertDivisionAllowedForCompany, assertLeadDocumentOwner, assertLeadReadableByRegionScope, assertRegionBelongsToCompany, assertUserCanAssignCrmRegion, assignProductionCompanyDealResponsibility, attachAssigneesToCrmTasks, attachAssignmentIdsToCrmTasks, attachCrmNextOpenTaskDeadline, attachLeadNewFlagForList, attachLeadReplyParents, attachLeadUserFlagsForList, auth, autoCreateProjectFromWonDeal, autoFlowFns, autoGenCrmTasksForNewLead, buildAssignmentNotificationInsert, buildChecklistLeadDocumentRow, buildCrmDashboardMinimalKpis, buildCrmLeadsRpcFilterParams, buildCustomersOverviewSummary, buildDealTemplateData, buildDefaultDeadlineConfig, buildFirstStageIdByPipeline, buildPipelineStagesMap, buildProcessedCommercialItems, buildQuotedStageOrderByPipeline, buildScanDuplicateGroups, buildWonStageOrderByPipeline, canUserViewDocByAllowlist, chatUpload, chunkArray, classifyDealStageForStaffReport, commentsTableMissing, companyRegionExtraColumnsMissing, companyRegionGeoColumnsMissing, computeCrmDashboardLightStats, computeCrmLiveVersionMs, computeCustomersOverviewSummary, computeIsNewLeadForUser, computeOrgOverviewReportData, computeStaffLeadDealReportData, computeStaffPipelineDetailPayload, countOpenOverdueCrmTasksForLeadIds, createCrmAssignment, createCrmLeadTask, createFulfillmentChildDeal, createNotif, createNotification, createProjectFromLead, crmExecutorFieldsFromTemplateItem, crmLeadCommentAttachmentsColumnMissing, crmLeadCommentReadReceiptsTableMissing, crmLeadRowVisibleToRequestUser, crmListUsesLegacyFilters, crmNoteActivityUpload, crmReportAsOfMs, crmReportCreatedAtFromIso, crmReportCreatedAtToIso, crmReportDayKeyVn, crmRouteErrorText, crmTaskDeadlineModuleKey, crmTaskMeetsCompletionRequirements, crmTaskMeetsRequiredFileTypes, crmTaskRequiresCompletionEvidence, crmTemplateMatchesLeadType, deadlineToDateOnlyIso, defaultCompanyInfo, defaultKpiLedgerMonthStartYmd, deleteCrmLeadTask, deleteMirroredAssignmentFileForTaskAttachment, duplicateLeadIdsFromLiteRows, ecosystemModuleKeyForCrmDeadline, effectivePipelineStageSlaDays, emitCrmBadgeUpdateForProject, emitCrmDashboardChanged, emitCrmTaskChanged, emptyStaffLeadDealAgg, endOfCalendarDayAfterEntered, enforceCommercialDocCompanyOnWrite, enforceQuotaForRequest, ensureDealLeadDocumentsForModuleTransition, ensureDefaultCrmPipelineForCompany, ensureMissingCrmTasksForLead, ensureMissingCrmTasksForPipelineStage, ensureMissingSxTasksForLead, excelUpload, executeLeadMerge, executeZaloDealStageNotify, fetchActivityCustomerIds, fetchAllLeadsForSlaWatchlist, fetchAssignmentForTask, fetchCrmCommentReactionsAggregate, fetchCrmLeadCommentNotifyUserIds, fetchCrmLeadDetailRow, fetchCrmLeadWithPipelineBadges, fetchCrmLeadsByIdsOrdered, fetchCrmLeadsForDashboardBatched, fetchCrmLeadsForOrgReportBatched, fetchCrmLeadsForUserDetailBatched, fetchCrmLeadsLiteForDuplicateScan, fetchCrmLeadsPageViaRpc, fetchCrmPipelineZaloSlice, fetchCrmSurveyEventsChunk, fetchCrmSurveyVisitsForOrgReport, fetchLeadCommentAudienceMembers, fetchLeadCommentAudienceMembersForRead, fetchLeadIdsForCrmRegion, fetchLeadMentionMembers, fetchOrgActivityFeed, fetchPipelineWithStagesById, fetchScopedCrmBundles, fillTemplateDataFromStructure, filterCrmTasksForLeadType, filterUserIdsForCrmLeadScopedNotification, findChecklistItem, followupDismissExpiresAt, fontBold, fontRegular, formatMoney, formatVNDPdf, formatVnPhoneLocal0From84, fs, generateDocPdf, generateFlowTasks, generateStepTasks, getAppSettingValue, getCompanyInfo, getCompanyRegionsList, getCrmLeadListSelect, getCrmLeadRegionConstraint, getCrmLeadTypesList, getCrmLeadsListLegacy, getCrmSourceCategoriesList, getCrmSourcesList, getDefaultCrmAttachmentShare, getDefaultDealZaloTemplateStructure, getDefaultLeadDocumentShareForDeal, getDefaultPipelineIdForCompany, getLeadDocumentFieldsFromCrmTask, getNotifyTargets, getOverdueFollowUps, getPipelineIdForCompanyRegion, getPipelineZaloSlice, getPipelinesList, getProjectCRMSummary, getStagesByPipelineId, getStaleLeads, getZaloNotifySettings, hydrateCrmLeadsByIdsWithStaff, hydrateCrmLeadsRpcPage, hydrateScanDuplicateLeads, insertQuotationRow, invalidateAppSettingKey, invalidatePipelinesAndStages, invalidateRegions, invalidateSources, invalidateTenantUsageCache, invokeCrmLeadsStageCountsRpc, isAdminLike, isAllowedLeadCommentAttachmentUrl, isChotSanXuatCrmTaskTitle, isCrmCompanyAdminUser, isCrmDealAssigneeLocked, isCrmLeadTypeColorMissingError, isCrmModuleAdmin, isCrmPipelinesTableMissingError, isCrmRegionAdminUser, isCrmSystemAdminUser, isDealStageHoanThanhForZalo, isDefaultAssigneeIdsColumnError, isExecutorColumnError, isPlatformAdmin, isPostgresUniqueViolation, isQuotationsSourceExcelColumnMissingError, isSxRelationshipError, isSystemAdmin, isUuidString, isValidDealZaloTemplateStructure, isVcRelationshipError, isVptCompanyCommercialDocViewer, lastNominatimGeocodeAt, leadChatFilesMulter, leadChatJsonOrFiles, listQuotationExcelSheets, loadCrmTaskAttachmentCountMap, loadOrgReportStageMap, loadZaloLinkedLeadIdSet, logDealActivityComment, logDealDeadlineChangeComment, logDealStageChangeComment, logKanbanDeadlineUnifiedHistory, logLeadCommentMentionActivity, logProjectFileActivity, mapCustomerOverviewRow, mapLeadDisplayPhone, mapQuotationItemsToOrderRows, maskCustomerPhoneDisplay, maskZaloAccessTokenPreview, maybeSendZaloOnDealStageEnter, mergeCrmStageDefaultAssigneeIntoUpdates, mergeCustomerIntoTarget, misaService, multer, nextCode, nextTbProjectCode, normalizeCrmActivityAttachments, normalizeCrmLeadCommentAttachments, normalizeCrmStageDefaultAssigneeUserId, normalizeCrmUserRole, normalizeLeadSeenByKeys, normalizeOrgReportSurveyVisitRow, normalizePipelineStageSlaDaysForDb, normalizePipelineStagesList, normalizeRegionIdList, normalizeTemplateChecklistForCrmTask, normalizeTemplateItemAssigneeIds, normalizeTimestamp, normalizeTitleFold, normalizeVnPhoneTo84, notifyDealCommentMentions, notifyDealCommentParticipants, notifyMultiple, notifyMultipleShared, notifyNewCrmAssignmentAssignees, notifyProductionDocumentUploaded, onLeadWon, onOrderConfirmed, onProjectCompleted, onQuotationAccepted, orgReportAttachFirstStageRates, orgReportBumpFirstStageMetrics, orgReportBumpMetrics, orgReportBumpOpenOverdue, orgReportBumpReceptionMetrics, orgReportCancelRatePct, orgReportClosedWonDealCount, orgReportClosedWonValue, orgReportCompareSummary, orgReportConversionRate, orgReportDayKey, orgReportDealCloseValueRatePct, orgReportDealCountsExpected, orgReportDealIsClosedWon, orgReportDealIsCompleted, orgReportDealIsQuotedOrAfter, orgReportDealProbability, orgReportDealSplitBuckets, orgReportExtendedDealMetrics, orgReportFirstStageOnTimeRatePct, orgReportFirstStageOverdueRatePct, orgReportIsReceptionOverdue, orgReportIsSlaOverdue, orgReportKpiPeriodStart, orgReportNumEst, orgReportOverdueRatePct, orgReportOwnerId, orgReportPctDelta, orgReportPreviousPeriod, orgReportQuoteValueCloseRatePct, orgReportQuoteWinRatePct, orgReportReceptionOverdueRatePct, orgReportReceptionSlaMinutes, orgReportStageIsClosed, orgReportStageIsLostOrCancelled, orgReportTotalDealCount, parseChecklist, parseCrmLeadsPageRpc, parseCrmReportDateRange, parseCrmStageCountsNumericMap, parseCrmStageCountsRpc, parseExcelMoneyFromMappedColumn, parseLeadIdUuidList, parseLeadIdsCsvQuery, parseLeadIdsFromBody, parseLeadSeenByRaw, parseQuotationExcelBuffer, parseStageIdsFromQuery, parseUuidArrayJsonb, parseVietnameseMeasure, parseVietnameseMoney, path, persistAssignmentNotification, pgCrmDuplicateLeadIds, pickDealZaloTemplatePayload, pipeOrgOverviewReportPdf, pipeStaffLeadDealSummaryPdf, pipeStaffPipelineDetailPdf, pipelineHasExplicitCompleted, pipelineHasExplicitExpected, pipelineHasExplicitWon, plannerTableMissing, postCrmStageDefaultAssigneeComment, primaryTemplateItemAssigneeId, rcInvalidateTags, reactionsTableMissing, redactCrmTaskNotesForViewer, regionGeocodeInflight, repairCrmDealPipelineDisplay, requireUserCompanyId, requireUserCompanyIdResolved, resolveAssignmentIdForTask, resolveCanonicalCrmLeadId, resolveCommercialDocListCompanyScope, resolveCrmBundleTemplateScope, resolveCrmLeadsDeadlinesMap, resolveCrmLeadsKanbanLite, resolveCrmLeadsMergedQuery, resolveCrmLeadsSkipDeadline, resolveCrmLedgerNetByLeadIdsPayload, resolveCrmReportScope, resolveCrmTaskWriteLeadId, resolveExecutorCompanyId, resolveKanbanStagesForCompany, resolveLeadCommentMentionIds, resolveProductionCompanyForDealStage, resolveProductionHandoverResponsibleUserId, resolveReopenTargetStageId, resolveRpcRegionIdsForCrmList, resolveTenantIdForQuota, resolveZaloDealTemplateId, respondIfCrmPipelinesTableMissing, responseCache, restoreCrmTaskChecklistFromWorkshopTemplate, resyncCrmPipelineTasksForLead, sanitizeIsoDateQueryParam, scheduleRegionGeocoding, scopedAdminCompanyId, scopedCrmCompanyIdForWrite, sendZaloTemplateMessage, setLeadFlag, shallowMergeTemplateData, skipSxWorkQuickComplete, snapshotOrderRowFromQuotation, stripCrmAssigneeFromWonStageUpdates, stripCrmLeadTypeColorFromSelect, stripQuotationsSourceExcelFields, sumCrmKpiLedgerNetByLeadIds, sumCrmKpiLedgerNetByUserForOrgReport, sumCrmKpiLedgerNetByUserIds, sumCrmKpiLedgerNetByUserIdsInDateRange, supabase, syncAllTaskArtifactsToAssignment, syncChecklistItemNotes, syncCrmLeadSxPipelineFromProject, syncQuotationDepositToDealAndProject, syncSxKanbanFromCrmProductionStage, syncTaskAttachmentToAssignment, templateItemAssigneePatch, toCrmTaskChecklist, unifyCrmLeadResponsibleFields, updateCrmLeadTask, updateQuotationRow, upsertZaloNotifySettings, userCanAccessCrmLeadAsParticipant, userCanAccessCrmLeadViaVisibility, userCanAssignAnyCrmRegion, userCanBypassCrmDeleteRestriction, userHasSeenLeadInSeenBy, userIsAdmin, userIsCrmCompanyOrRegionAdmin, userMayAccessQuotationRow, userSeesAllCrmDeals, userSeesAllCrmDealsForScope, userSeesAllCrmLeads, userSeesAllCrmLeadsForScope, uuidQueryOrNull, validateProductionCompanyId) {
r.get('/admin/sla-at-risk', async (req, res) => {
  try {
    const roleNorm = normalizeCrmUserRole(req.user?.role);
    if (!STAFF_LEAD_DEAL_REPORT_ROLES.has(roleNorm)) {
      return res.status(403).json({ error: 'Không có quyền xem danh sách SLA' });
    }

    const rawC = req.query.company_id && String(req.query.company_id).trim() ? String(req.query.company_id).trim() : null;
    let effectiveCompanyId = rawC;
    const sacDash = scopedAdminCompanyId(req);
    if (sacDash) {
      effectiveCompanyId = sacDash;
    } else if (userIsAdmin(req.user?.role)) {
      effectiveCompanyId = rawC || null;
    } else {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      effectiveCompanyId = rawC && String(rawC) === String(cid) ? rawC : cid;
    }

    const rawRegionQ = req.query.region_id && String(req.query.region_id).trim();
    let explicitRegionId = rawRegionQ && CRM_UUID_RE.test(rawRegionQ) ? rawRegionQ : null;

    if (explicitRegionId && !effectiveCompanyId) {
      const { data: regRow, error: regErr } = await supabase
        .from('company_regions')
        .select('company_id')
        .eq('id', explicitRegionId)
        .maybeSingle();
      if (regErr) throw regErr;
      if (!regRow?.company_id) return res.status(400).json({ error: 'Khu vực không tồn tại' });
      effectiveCompanyId = String(regRow.company_id);
    }

    if (explicitRegionId && effectiveCompanyId) {
      const v = await assertRegionBelongsToCompany(supabase, effectiveCompanyId, explicitRegionId);
      if (!v.ok) return res.status(400).json({ error: v.error });
    }

    const typeFilter = String(req.query.type || 'all').toLowerCase();
    const tf = typeFilter === 'lead' || typeFilter === 'deal' ? typeFilter : 'all';
    const horizonDays = Math.min(Math.max(parseInt(req.query.horizon_days, 10) || 3, 1), 30);
    const bucket = String(req.query.bucket || 'all').toLowerCase(); // overdue | due_soon | all
    /** Mặc định chỉ «rủi ro»: quá hạn hoặc sắp hết trong cửa sổ. true = thêm cả lead đang trong hạn (hạn sau cửa sổ). */
    const includeOnTrack =
      req.query.include_on_track === '1'
      || req.query.include_on_track === 'true'
      || String(req.query.include_on_track || '').toLowerCase() === 'yes';

    const leads = await fetchAllLeadsForSlaWatchlist(req, effectiveCompanyId || null, tf, explicitRegionId);
    const stageIds = [...new Set(leads.map((l) => l.stage_id).filter(Boolean))];
    let stageMap = {};
    if (stageIds.length) {
      const { data: stages, error: se } = await supabase
        .from('crm_pipeline_stages')
        .select('id, name, canonical_slug, sla_days, is_won, is_lost')
        .in('id', stageIds);
      if (se) throw se;
      (stages || []).forEach((s) => {
        stageMap[s.id] = s;
      });
    }

    const now = Date.now();
    const horizonEnd = now + horizonDays * 86400000;
    const out = [];

    for (const lead of leads) {
      const st = lead.stage_id ? stageMap[lead.stage_id] : null;
      if (st?.is_won || st?.is_lost) continue;
      if (!lead.phone || !String(lead.phone).trim()) continue;

      const slaDays = effectivePipelineStageSlaDays(st?.sla_days);
      if (slaDays == null) continue;
      const entered = lead.stage_entered_at || lead.created_at;
      const dueAt = endOfCalendarDayAfterEntered(entered, slaDays);
      const dueMs = dueAt.getTime();

      let risk = 'due_soon';
      if (dueMs < now) risk = 'overdue';
      else if (dueMs > horizonEnd) {
        if (!includeOnTrack) continue;
        risk = 'on_track';
      }

      if (bucket === 'overdue' && risk !== 'overdue') continue;
      if (bucket === 'due_soon' && risk !== 'due_soon') continue;

      out.push({
        lead_id: lead.id,
        code: lead.code,
        title: lead.title,
        type: lead.type,
        company_id: lead.company_id,
        region_id: lead.region_id,
        stage_id: lead.stage_id,
        stage_name: st?.name || null,
        stage_slug: st?.canonical_slug || null,
        sla_days: slaDays,
        stage_entered_at: entered,
        due_at: dueAt.toISOString(),
        risk,
        assigned_to: lead.assigned_to,
        lead_owner_id: lead.lead_owner_id,
      });
    }

    const deptFilter = req.query.department_id && String(req.query.department_id).trim();
    let working = out;
    if (deptFilter) {
      const userIdsPre = [...new Set(out.flatMap((r) => [r.assigned_to, r.lead_owner_id].filter(Boolean)))];
      let deptMap = {};
      if (userIdsPre.length) {
        const { data: usersPre } = await supabase
          .from('users')
          .select('id, department_id')
          .in('id', userIdsPre);
        (usersPre || []).forEach((u) => {
          deptMap[u.id] = u.department_id;
        });
      }
      working = out.filter((row) => {
        const a = row.assigned_to ? deptMap[row.assigned_to] : null;
        const o = row.lead_owner_id ? deptMap[row.lead_owner_id] : null;
        return String(a) === deptFilter || String(o) === deptFilter;
      });
    }

    working.sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());

    const userIds = [...new Set(working.flatMap((r) => [r.assigned_to, r.lead_owner_id].filter(Boolean)))];
    let userMap = {};
    if (userIds.length) {
      const { data: users } = await supabase
        .from('users')
        .select('id, full_name, email')
        .in('id', userIds);
      (users || []).forEach((u) => {
        userMap[u.id] = u;
      });
    }

    const rows = working.map((row) => ({
      ...row,
      assigned_to_name: row.assigned_to ? userMap[row.assigned_to]?.full_name || userMap[row.assigned_to]?.email || null : null,
      lead_owner_name: row.lead_owner_id ? userMap[row.lead_owner_id]?.full_name || userMap[row.lead_owner_id]?.email || null : null,
    }));

    res.json({
      horizon_days: horizonDays,
      bucket: bucket === 'overdue' || bucket === 'due_soon' ? bucket : 'all',
      include_on_track: includeOnTrack,
      rows,
      meta: {
        total: rows.length,
        leads_scanned: leads.length,
      },
    });
  } catch (e) {
    console.error('GET /crm/admin/sla-at-risk:', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

r.post('/admin/sla-remind', async (req, res) => {
  try {
    const roleNorm = normalizeCrmUserRole(req.user?.role);
    if (!STAFF_LEAD_DEAL_REPORT_ROLES.has(roleNorm)) {
      return res.status(403).json({ error: 'Không có quyền gửi nhắc SLA' });
    }

    const leadIds = Array.isArray(req.body?.lead_ids) ? req.body.lead_ids.map((x) => String(x).trim()).filter(Boolean) : [];
    if (!leadIds.length) return res.status(400).json({ error: 'Thiếu lead_ids' });

    const rawC = req.body?.company_id && String(req.body.company_id).trim() ? String(req.body.company_id).trim() : null;
    let effectiveCompanyId = rawC;
    const sacDash = scopedAdminCompanyId(req);
    if (sacDash) {
      effectiveCompanyId = sacDash;
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      effectiveCompanyId = cid;
    }

    const { data: leads, error: le } = await supabase
      .from('crm_leads')
      .select('id, code, title, type, company_id, region_id, stage_id, assigned_to, lead_owner_id, stage_entered_at, created_at')
      .in('id', leadIds);
    if (le) return res.status(500).json({ error: le.message });

    const list = leads || [];
    const scoped = effectiveCompanyId
      ? list.filter((l) => String(l.company_id) === String(effectiveCompanyId))
      : list;

    let sent = 0;
    const actorName = req.user?.full_name || req.user?.email || 'Quản lý';

    for (const lead of scoped) {
      const scopeOk = assertLeadReadableByRegionScope(req, lead);
      if (!scopeOk.ok) continue;
      if (!lead.phone || !String(lead.phone).trim()) continue;

      const { data: st } = await supabase
        .from('crm_pipeline_stages')
        .select('name, sla_days')
        .eq('id', lead.stage_id)
        .maybeSingle();
      const slaDays = effectivePipelineStageSlaDays(st?.sla_days);
      if (slaDays == null) {
        return res.status(400).json({ error: 'Cột pipeline này không áp dụng SLA (sla_days = 0)' });
      }
      const dueAt = endOfCalendarDayAfterEntered(lead.stage_entered_at || lead.created_at, slaDays);

      const rawTargets = [...new Set([lead.assigned_to, lead.type === 'lead' ? lead.lead_owner_id : null].filter(Boolean))];
      const leadScope = { company_id: lead.company_id, region_id: lead.region_id };
      const targets = await filterUserIdsForCrmLeadScopedNotification(supabase, leadScope, rawTargets);
      const stageLabel = st?.name || 'giai đoạn';
      const title = `${lead.type === 'deal' ? 'Deal' : 'Lead'} ${lead.code || ''} — gần hết hạn SLA`.trim();
      const msg = `${actorName} nhắc xử lý ${stageLabel}. Hạn SLA: ${dueAt.toLocaleString('vi-VN')}.`;

      const meta = {
        module_key: 'crm',
        kind: 'sla_stage_admin_reminder',
        lead_id: lead.id,
        stage_id: lead.stage_id,
        due_at: dueAt.toISOString(),
      };

      for (const uid of targets) {
        const n = await createNotification(
          req,
          uid,
          'lead_stage_sla_reminder',
          title,
          msg,
          lead.type === 'deal' ? 'crm_deal' : 'crm_lead',
          lead.id,
          meta,
        );
        if (n) sent += 1;
      }
    }

    res.json({ ok: true, sent, processed: scoped.length });
  } catch (e) {
    console.error('POST /crm/admin/sla-remind:', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

r.get('/reports/staff-lead-deal/export.pdf', async (req, res) => {
  try {
    const data = await computeStaffLeadDealReportData(req, res);
    if (!data) return;
    let companyName = '';
    if (data.effectiveCompanyId) {
      const { data: co } = await supabase
        .from('companies')
        .select('name, short_name')
        .eq('id', data.effectiveCompanyId)
        .maybeSingle();
      companyName = co?.short_name || co?.name || '';
    }
    const generatedAt = new Date().toLocaleString('vi-VN');
    pipeStaffLeadDealSummaryPdf(res, {
      rows: data.rows,
      dateFrom: data.df,
      dateTo: data.dt,
      companyName,
      generatedAt,
    });
  } catch (e) {
    console.error('GET /reports/staff-lead-deal/export.pdf:', e);
    if (!res.headersSent) res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

r.get('/reports/staff-lead-deal', async (req, res) => {
  try {
    const data = await computeStaffLeadDealReportData(req, res);
    if (!data) return;
    res.json({
      date_from: data.df,
      date_to: data.dt,
      company_id: data.effectiveCompanyId || null,
      region_id: data.explicitRegionId || null,
      basis: 'created_at',
      type: data.typeView || 'all',
      rows: data.rows,
    });
  } catch (e) {
    console.error('GET /crm/reports/staff-lead-deal:', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

r.get('/reports/org-overview', responseCache({ ttl: 45, scope: 'user', tags: ['crm:reports'] }), async (req, res) => {
  try {
    const data = await computeOrgOverviewReportData(req, res);
    if (!data) return;
    res.json({
      date_from: data.df,
      date_to: data.dt,
      company_id: data.effectiveCompanyId || null,
      region_id: data.explicitRegionId || null,
      basis: 'created_at',
      type: data.typeView || 'all',
      deal_kh_split: !!data.dealKhSplit,
      kpi_ledger_basis: data.kpi_ledger_basis || 'occurred_at_on_report_leads',
      kpi_ledger_date_from: data.kpi_ledger_date_from || data.df,
      kpi_ledger_date_to: data.kpi_ledger_date_to || data.dt,
      department_id: data.appliedDepartmentId || null,
      assigned_to: data.appliedAssignedTo || null,
      summary: data.summary,
      period_previous: data.period_previous,
      compare: data.compare,
      timeline: data.timeline,
      pipeline_funnel: data.pipeline_funnel,
      by_company: data.by_company,
      by_region: data.by_region,
      by_employee: data.by_employee,
      by_source: data.by_source,
      by_lead_type: data.by_lead_type,
      reception_sla_minutes: data.reception_sla_minutes ?? 15,
    });
  } catch (e) {
    console.error('GET /crm/reports/org-overview:', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

r.get('/reports/org-overview/survey-visits', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const roleNorm = normalizeCrmUserRole(req.user?.role);
    if (!STAFF_LEAD_DEAL_REPORT_ROLES.has(roleNorm)) {
      res.status(403).json({ error: 'Không có quyền xem báo cáo này' });
      return;
    }
    const scope = await resolveCrmReportScope(req, res);
    if (!scope) return;
    const { effectiveCompanyId, explicitRegionId } = scope;
    const { df, dt } = parseCrmReportDateRange(req);
    const departmentId = req.query.department_id && String(req.query.department_id).trim()
      ? String(req.query.department_id).trim()
      : null;
    const assignedToUser = req.query.assigned_to && String(req.query.assigned_to).trim()
      ? String(req.query.assigned_to).trim()
      : null;
    const employeeUserIds = req.query.employee_ids
      ? String(req.query.employee_ids).split(',').map((x) => x.trim()).filter(Boolean)
      : null;
    const rows = await fetchCrmSurveyVisitsForOrgReport(req, {
      effectiveCompanyId,
      explicitRegionId,
      df,
      dt,
      departmentId,
      assignedToUser,
      employeeUserIds,
    });
    res.json({
      date_from: df,
      date_to: dt,
      company_id: effectiveCompanyId || null,
      region_id: explicitRegionId || null,
      department_id: departmentId,
      assigned_to: assignedToUser,
      rows,
    });
  } catch (e) {
    console.error('GET /crm/reports/org-overview/survey-visits:', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

r.get('/reports/org-activity-feed', async (req, res) => {
  try {
    const roleNorm = normalizeCrmUserRole(req.user?.role);
    if (!STAFF_LEAD_DEAL_REPORT_ROLES.has(roleNorm)) {
      res.status(403).json({ error: 'Không có quyền xem báo cáo này' });
      return;
    }
    const scope = await resolveCrmReportScope(req, res);
    if (!scope) return;
    const { effectiveCompanyId, explicitRegionId } = scope;
    const { df, dt } = parseCrmReportDateRange(req);
    const rawType = String(req.query.type || 'all').toLowerCase();
    const typeView = rawType === 'lead' || rawType === 'deal' ? rawType : 'all';
    const dealAssigneeOnly =
      req.user?.userId && !userSeesAllCrmDealsForScope(req.user) ? req.user.userId : null;
    const leadAssigneeOnly =
      req.user?.userId && !userSeesAllCrmLeadsForScope(req.user) ? req.user.userId : null;
    const limit = Math.min(Math.max(parseInt(req.query.limit || '30', 10) || 30, 1), 100);
    const sinceRaw = req.query.since && String(req.query.since).trim() ? String(req.query.since).trim() : null;

    const items = await fetchOrgActivityFeed(req, {
      effectiveCompanyId,
      explicitRegionId,
      df,
      dt,
      typeView,
      leadAssigneeOnly,
      dealAssigneeOnly,
      limit,
      since: sinceRaw,
    });

    res.json({
      date_from: df,
      date_to: dt,
      company_id: effectiveCompanyId || null,
      region_id: explicitRegionId || null,
      items,
    });
  } catch (e) {
    console.error('GET /crm/reports/org-activity-feed:', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

r.get('/reports/org-overview/export.pdf', async (req, res) => {
  try {
    const data = await computeOrgOverviewReportData(req, res);
    if (!data) return;
    let companyName = '';
    if (data.effectiveCompanyId) {
      const { data: co } = await supabase
        .from('companies')
        .select('name, short_name')
        .eq('id', data.effectiveCompanyId)
        .maybeSingle();
      companyName = co?.short_name || co?.name || '';
    }
    let regionName = '';
    if (data.explicitRegionId) {
      const { data: reg } = await supabase
        .from('company_regions')
        .select('name')
        .eq('id', data.explicitRegionId)
        .maybeSingle();
      regionName = reg?.name || '';
    }
    pipeOrgOverviewReportPdf(res, {
      summary: data.summary,
      compare: data.compare,
      periodPrevious: data.period_previous,
      by_company: data.by_company,
      by_region: data.by_region,
      by_employee: data.by_employee,
      dateFrom: data.df,
      dateTo: data.dt,
      companyName,
      regionName,
      typeView: data.typeView,
      generatedAt: new Date().toLocaleString('vi-VN'),
    });
  } catch (e) {
    console.error('GET /crm/reports/org-overview/export.pdf:', e);
    if (!res.headersSent) res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

r.get('/reports/staff-lead-deal/:userId/pipelines/export.pdf', async (req, res) => {
  try {
    const p = await computeStaffPipelineDetailPayload(req, res);
    if (!p) return;
    let companyName = '';
    if (p.effectiveCompanyId) {
      const { data: co } = await supabase
        .from('companies')
        .select('name, short_name')
        .eq('id', p.effectiveCompanyId)
        .maybeSingle();
      companyName = co?.short_name || co?.name || '';
    }
    pipeStaffPipelineDetailPdf(res, {
      pipelines: p.pipelines,
      fullName: p.full_name,
      departmentName: p.department_name,
      dateFrom: p.df,
      dateTo: p.dt,
      companyName,
      generatedAt: new Date().toLocaleString('vi-VN'),
    });
  } catch (e) {
    console.error('GET pipelines/export.pdf:', e);
    if (!res.headersSent) res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

r.get('/reports/staff-lead-deal/:userId/pipelines', async (req, res) => {
  try {
    const p = await computeStaffPipelineDetailPayload(req, res);
    if (!p) return;
    res.json({
      user_id: p.user_id,
      full_name: p.full_name,
      email: p.email,
      department_name: p.department_name,
      date_from: p.df,
      date_to: p.dt,
      company_id: p.effectiveCompanyId || null,
      basis: 'created_at',
      type: p.typeView || 'all',
      pipelines: p.pipelines,
      summary: p.summary,
      timeline: p.timeline,
      stage_breakdown: p.stage_breakdown,
      by_lead_type: p.by_lead_type,
      first_stage_sla: p.first_stage_sla,
    });
  } catch (e) {
    console.error('GET /crm/reports/staff-lead-deal/:userId/pipelines:', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

r.get('/settings/deal-stage-report-buckets', async (req, res) => {
  try {
    const roleNorm = normalizeCrmUserRole(req.user?.role);
    if (!STAFF_LEAD_DEAL_REPORT_ROLES.has(roleNorm)) {
      res.status(403).json({ error: 'Không có quyền xem cấu hình này' });
      return;
    }
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
    if (!effectiveCompanyId) {
      res.status(400).json({ error: 'Cần chọn công ty (company_id)' });
      return;
    }

    const { data: pipes, error: pe } = await supabase
      .from('crm_pipelines')
      .select('id, name')
      .eq('company_id', effectiveCompanyId)
      .eq('is_active', true);
    if (pe) throw pe;

    const pipeIds = (pipes || []).map((p) => p.id);
    if (!pipeIds.length) {
      res.json({ company_id: effectiveCompanyId, stages: [] });
      return;
    }

    const { data: stages, error: se } = await supabase
      .from('crm_pipeline_stages')
      .select('id, name, order_index, pipeline_id, canonical_slug, is_won, is_lost, deal_report_bucket, pipeline_type')
      .in('pipeline_id', pipeIds)
      .eq('pipeline_type', 'deal')
      .eq('is_active', true)
      .order('order_index');
    if (se) throw se;

    const nameByPid = Object.fromEntries((pipes || []).map((p) => [p.id, p.name]));
    const rows = (stages || []).map((s) => ({
      ...s,
      pipeline_name: nameByPid[s.pipeline_id] || '',
    }));

    res.json({ company_id: effectiveCompanyId, stages: rows });
  } catch (e) {
    console.error('GET /crm/settings/deal-stage-report-buckets:', e);
    if (!res.headersSent) res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

r.put('/settings/deal-stage-report-buckets', async (req, res) => {
  try {
    const roleNorm = normalizeCrmUserRole(req.user?.role);
    if (!STAFF_LEAD_DEAL_REPORT_ROLES.has(roleNorm)) {
      res.status(403).json({ error: 'Không có quyền chỉnh cấu hình này' });
      return;
    }

    const body = req.body || {};
    const rawC = body.company_id && String(body.company_id).trim() ? String(body.company_id).trim() : null;
    let effectiveCompanyId = rawC;
    const sacDash = scopedAdminCompanyId(req);
    if (sacDash) {
      effectiveCompanyId = sacDash;
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      effectiveCompanyId = cid;
    }
    if (!effectiveCompanyId) {
      res.status(400).json({ error: 'Cần company_id' });
      return;
    }

    const updates = Array.isArray(body.updates) ? body.updates : [];
    if (!updates.length) {
      res.status(400).json({ error: 'updates không được rỗng' });
      return;
    }

    const { data: pipes } = await supabase
      .from('crm_pipelines')
      .select('id')
      .eq('company_id', effectiveCompanyId)
      .eq('is_active', true);
    const allowedPipe = new Set((pipes || []).map((p) => p.id));

    for (const u of updates) {
      const sid = u.stage_id && String(u.stage_id).trim();
      if (!sid || !isUuidString(sid)) {
        res.status(400).json({ error: 'stage_id không hợp lệ' });
        return;
      }
      let bucket = u.deal_report_bucket;
      if (bucket === '' || bucket === undefined) bucket = null;
      if (bucket !== null && !DEAL_REPORT_BUCKET_VALUES.has(String(bucket))) {
        res.status(400).json({ error: 'deal_report_bucket không hợp lệ' });
        return;
      }

      const { data: st, error: ste } = await supabase
        .from('crm_pipeline_stages')
        .select('id, pipeline_id, pipeline_type')
        .eq('id', sid)
        .maybeSingle();
      if (ste) throw ste;
      if (!st || st.pipeline_type !== 'deal' || !allowedPipe.has(st.pipeline_id)) {
        res.status(403).json({ error: 'Giai đoạn không thuộc pipeline Deal của công ty đang chọn' });
        return;
      }

      const { error: ue } = await supabase
        .from('crm_pipeline_stages')
        .update({ deal_report_bucket: bucket })
        .eq('id', sid);
      if (ue) throw ue;
    }

    res.json({ ok: true, updated: updates.length, company_id: effectiveCompanyId });
  } catch (e) {
    console.error('PUT /crm/settings/deal-stage-report-buckets:', e);
    if (!res.headersSent) res.status(500).json({ error: e.message || 'Lỗi' });
  }
});
}).call(null, helpers["ALLOWED_DEADLINE_FIELDS"], helpers["CRM_COMMENT_ALLOWED_REACTION_EMOJI"], helpers["CRM_LEAD_KANBAN_LITE_SELECT"], helpers["CRM_LEAD_LIST_SELECT"], helpers["CRM_LEAD_LIST_SELECT_BASE"], helpers["CRM_LEAD_LIST_SELECT_EXTRA"], helpers["CRM_LEAD_REGION_EMBED"], helpers["CRM_NEW_LEAD_MAX_AGE_MS"], helpers["CRM_TASK_SELECT"], helpers["CRM_UUID_RE"], helpers["CUSTOMERS_IN_CHUNK"], helpers["CUSTOMERS_OVERVIEW_NO_MATCH_ID"], helpers["DEAL_PRE_CONTRACT_SLUGS_STAFF"], helpers["DEAL_REPORT_BUCKET_VALUES"], helpers["DEFAULT_CHECKLISTS"], helpers["DEFAULT_DEADLINE_BUCKETS"], helpers["DEFAULT_PIPELINE_STAGE_SLA_DAYS"], helpers["FOLLOWUP_TIME_BUCKETS"], helpers["PDFDocument"], helpers["QUOTATIONS_SOURCE_EXCEL_COLS"], helpers["Router"], helpers["SCAN_DUP_LITE_SELECT"], helpers["STAFF_LEAD_DEAL_REPORT_ROLES"], helpers["SURVEY_EVENT_SELECT"], helpers["SURVEY_EVENT_TYPES"], helpers["XLSX"], helpers["ZALO_APP_SETTING_KEY"], helpers["crmSchemaCompat"], helpers["addPhoneToAutoLeadBlocklist"], helpers["aggregateCrmCommentReactions"], helpers["aggregateOrgReportRows"], helpers["appendFulfillmentChildTasksForMasterDeal"], helpers["applyAllActiveWorkshopTemplatesForArea"], helpers["applyAssigneesToInsertedCrmTasks"], helpers["applyCrmLeadRegionFilterToQuery"], helpers["applyCrmTaskTemplatesToCompanyRegions"], helpers["applyCustomerIdInFilter"], helpers["applyCustomersOverviewSearch"], helpers["applyDefaultWorkshopTemplatesForNewProject"], helpers["applyLeadOrCustomerSalesFilter"], helpers["applyProductionTemplateToFulfillmentLead"], helpers["applyProductionTemplatesOnPipelineEnter"], helpers["applyStageIdFilterToQuery"], helpers["applyWorkshopTemplateToProject"], helpers["artifactNamePrefix"], helpers["assertCanFlagLead"], helpers["assertCategoryFitsSource"], helpers["assertCrmAssigneeUserMatchesLeadCompany"], helpers["assertCrmEmployeeDeleteAllowed"], helpers["assertCrmStageAdvanceAllowed"], helpers["assertDealCrmManualStageChange"], helpers["assertDealResponsible"], helpers["assertDivisionAllowedForCompany"], helpers["assertLeadDocumentOwner"], helpers["assertLeadReadableByRegionScope"], helpers["assertRegionBelongsToCompany"], helpers["assertUserCanAssignCrmRegion"], helpers["assignProductionCompanyDealResponsibility"], helpers["attachAssigneesToCrmTasks"], helpers["attachAssignmentIdsToCrmTasks"], helpers["attachCrmNextOpenTaskDeadline"], helpers["attachLeadNewFlagForList"], helpers["attachLeadReplyParents"], helpers["attachLeadUserFlagsForList"], helpers["auth"], helpers["autoCreateProjectFromWonDeal"], helpers["autoFlowFns"], helpers["autoGenCrmTasksForNewLead"], helpers["buildAssignmentNotificationInsert"], helpers["buildChecklistLeadDocumentRow"], helpers["buildCrmDashboardMinimalKpis"], helpers["buildCrmLeadsRpcFilterParams"], helpers["buildCustomersOverviewSummary"], helpers["buildDealTemplateData"], helpers["buildDefaultDeadlineConfig"], helpers["buildFirstStageIdByPipeline"], helpers["buildPipelineStagesMap"], helpers["buildProcessedCommercialItems"], helpers["buildQuotedStageOrderByPipeline"], helpers["buildScanDuplicateGroups"], helpers["buildWonStageOrderByPipeline"], helpers["canUserViewDocByAllowlist"], helpers["chatUpload"], helpers["chunkArray"], helpers["classifyDealStageForStaffReport"], helpers["commentsTableMissing"], helpers["companyRegionExtraColumnsMissing"], helpers["companyRegionGeoColumnsMissing"], helpers["computeCrmDashboardLightStats"], helpers["computeCrmLiveVersionMs"], helpers["computeCustomersOverviewSummary"], helpers["computeIsNewLeadForUser"], helpers["computeOrgOverviewReportData"], helpers["computeStaffLeadDealReportData"], helpers["computeStaffPipelineDetailPayload"], helpers["countOpenOverdueCrmTasksForLeadIds"], helpers["createCrmAssignment"], helpers["createCrmLeadTask"], helpers["createFulfillmentChildDeal"], helpers["createNotif"], helpers["createNotification"], helpers["createProjectFromLead"], helpers["crmExecutorFieldsFromTemplateItem"], helpers["crmLeadCommentAttachmentsColumnMissing"], helpers["crmLeadCommentReadReceiptsTableMissing"], helpers["crmLeadRowVisibleToRequestUser"], helpers["crmListUsesLegacyFilters"], helpers["crmNoteActivityUpload"], helpers["crmReportAsOfMs"], helpers["crmReportCreatedAtFromIso"], helpers["crmReportCreatedAtToIso"], helpers["crmReportDayKeyVn"], helpers["crmRouteErrorText"], helpers["crmTaskDeadlineModuleKey"], helpers["crmTaskMeetsCompletionRequirements"], helpers["crmTaskMeetsRequiredFileTypes"], helpers["crmTaskRequiresCompletionEvidence"], helpers["crmTemplateMatchesLeadType"], helpers["deadlineToDateOnlyIso"], helpers["defaultCompanyInfo"], helpers["defaultKpiLedgerMonthStartYmd"], helpers["deleteCrmLeadTask"], helpers["deleteMirroredAssignmentFileForTaskAttachment"], helpers["duplicateLeadIdsFromLiteRows"], helpers["ecosystemModuleKeyForCrmDeadline"], helpers["effectivePipelineStageSlaDays"], helpers["emitCrmBadgeUpdateForProject"], helpers["emitCrmDashboardChanged"], helpers["emitCrmTaskChanged"], helpers["emptyStaffLeadDealAgg"], helpers["endOfCalendarDayAfterEntered"], helpers["enforceCommercialDocCompanyOnWrite"], helpers["enforceQuotaForRequest"], helpers["ensureDealLeadDocumentsForModuleTransition"], helpers["ensureDefaultCrmPipelineForCompany"], helpers["ensureMissingCrmTasksForLead"], helpers["ensureMissingCrmTasksForPipelineStage"], helpers["ensureMissingSxTasksForLead"], helpers["excelUpload"], helpers["executeLeadMerge"], helpers["executeZaloDealStageNotify"], helpers["fetchActivityCustomerIds"], helpers["fetchAllLeadsForSlaWatchlist"], helpers["fetchAssignmentForTask"], helpers["fetchCrmCommentReactionsAggregate"], helpers["fetchCrmLeadCommentNotifyUserIds"], helpers["fetchCrmLeadDetailRow"], helpers["fetchCrmLeadWithPipelineBadges"], helpers["fetchCrmLeadsByIdsOrdered"], helpers["fetchCrmLeadsForDashboardBatched"], helpers["fetchCrmLeadsForOrgReportBatched"], helpers["fetchCrmLeadsForUserDetailBatched"], helpers["fetchCrmLeadsLiteForDuplicateScan"], helpers["fetchCrmLeadsPageViaRpc"], helpers["fetchCrmPipelineZaloSlice"], helpers["fetchCrmSurveyEventsChunk"], helpers["fetchCrmSurveyVisitsForOrgReport"], helpers["fetchLeadCommentAudienceMembers"], helpers["fetchLeadCommentAudienceMembersForRead"], helpers["fetchLeadIdsForCrmRegion"], helpers["fetchLeadMentionMembers"], helpers["fetchOrgActivityFeed"], helpers["fetchPipelineWithStagesById"], helpers["fetchScopedCrmBundles"], helpers["fillTemplateDataFromStructure"], helpers["filterCrmTasksForLeadType"], helpers["filterUserIdsForCrmLeadScopedNotification"], helpers["findChecklistItem"], helpers["followupDismissExpiresAt"], helpers["fontBold"], helpers["fontRegular"], helpers["formatMoney"], helpers["formatVNDPdf"], helpers["formatVnPhoneLocal0From84"], helpers["fs"], helpers["generateDocPdf"], helpers["generateFlowTasks"], helpers["generateStepTasks"], helpers["getAppSettingValue"], helpers["getCompanyInfo"], helpers["getCompanyRegionsList"], helpers["getCrmLeadListSelect"], helpers["getCrmLeadRegionConstraint"], helpers["getCrmLeadTypesList"], helpers["getCrmLeadsListLegacy"], helpers["getCrmSourceCategoriesList"], helpers["getCrmSourcesList"], helpers["getDefaultCrmAttachmentShare"], helpers["getDefaultDealZaloTemplateStructure"], helpers["getDefaultLeadDocumentShareForDeal"], helpers["getDefaultPipelineIdForCompany"], helpers["getLeadDocumentFieldsFromCrmTask"], helpers["getNotifyTargets"], helpers["getOverdueFollowUps"], helpers["getPipelineIdForCompanyRegion"], helpers["getPipelineZaloSlice"], helpers["getPipelinesList"], helpers["getProjectCRMSummary"], helpers["getStagesByPipelineId"], helpers["getStaleLeads"], helpers["getZaloNotifySettings"], helpers["hydrateCrmLeadsByIdsWithStaff"], helpers["hydrateCrmLeadsRpcPage"], helpers["hydrateScanDuplicateLeads"], helpers["insertQuotationRow"], helpers["invalidateAppSettingKey"], helpers["invalidatePipelinesAndStages"], helpers["invalidateRegions"], helpers["invalidateSources"], helpers["invalidateTenantUsageCache"], helpers["invokeCrmLeadsStageCountsRpc"], helpers["isAdminLike"], helpers["isAllowedLeadCommentAttachmentUrl"], helpers["isChotSanXuatCrmTaskTitle"], helpers["isCrmCompanyAdminUser"], helpers["isCrmDealAssigneeLocked"], helpers["isCrmLeadTypeColorMissingError"], helpers["isCrmModuleAdmin"], helpers["isCrmPipelinesTableMissingError"], helpers["isCrmRegionAdminUser"], helpers["isCrmSystemAdminUser"], helpers["isDealStageHoanThanhForZalo"], helpers["isDefaultAssigneeIdsColumnError"], helpers["isExecutorColumnError"], helpers["isPlatformAdmin"], helpers["isPostgresUniqueViolation"], helpers["isQuotationsSourceExcelColumnMissingError"], helpers["isSxRelationshipError"], helpers["isSystemAdmin"], helpers["isUuidString"], helpers["isValidDealZaloTemplateStructure"], helpers["isVcRelationshipError"], helpers["isVptCompanyCommercialDocViewer"], helpers["lastNominatimGeocodeAt"], helpers["leadChatFilesMulter"], helpers["leadChatJsonOrFiles"], helpers["listQuotationExcelSheets"], helpers["loadCrmTaskAttachmentCountMap"], helpers["loadOrgReportStageMap"], helpers["loadZaloLinkedLeadIdSet"], helpers["logDealActivityComment"], helpers["logDealDeadlineChangeComment"], helpers["logDealStageChangeComment"], helpers["logKanbanDeadlineUnifiedHistory"], helpers["logLeadCommentMentionActivity"], helpers["logProjectFileActivity"], helpers["mapCustomerOverviewRow"], helpers["mapLeadDisplayPhone"], helpers["mapQuotationItemsToOrderRows"], helpers["maskCustomerPhoneDisplay"], helpers["maskZaloAccessTokenPreview"], helpers["maybeSendZaloOnDealStageEnter"], helpers["mergeCrmStageDefaultAssigneeIntoUpdates"], helpers["mergeCustomerIntoTarget"], helpers["misaService"], helpers["multer"], helpers["nextCode"], helpers["nextTbProjectCode"], helpers["normalizeCrmActivityAttachments"], helpers["normalizeCrmLeadCommentAttachments"], helpers["normalizeCrmStageDefaultAssigneeUserId"], helpers["normalizeCrmUserRole"], helpers["normalizeLeadSeenByKeys"], helpers["normalizeOrgReportSurveyVisitRow"], helpers["normalizePipelineStageSlaDaysForDb"], helpers["normalizePipelineStagesList"], helpers["normalizeRegionIdList"], helpers["normalizeTemplateChecklistForCrmTask"], helpers["normalizeTemplateItemAssigneeIds"], helpers["normalizeTimestamp"], helpers["normalizeTitleFold"], helpers["normalizeVnPhoneTo84"], helpers["notifyDealCommentMentions"], helpers["notifyDealCommentParticipants"], helpers["notifyMultiple"], helpers["notifyMultipleShared"], helpers["notifyNewCrmAssignmentAssignees"], helpers["notifyProductionDocumentUploaded"], helpers["onLeadWon"], helpers["onOrderConfirmed"], helpers["onProjectCompleted"], helpers["onQuotationAccepted"], helpers["orgReportAttachFirstStageRates"], helpers["orgReportBumpFirstStageMetrics"], helpers["orgReportBumpMetrics"], helpers["orgReportBumpOpenOverdue"], helpers["orgReportBumpReceptionMetrics"], helpers["orgReportCancelRatePct"], helpers["orgReportClosedWonDealCount"], helpers["orgReportClosedWonValue"], helpers["orgReportCompareSummary"], helpers["orgReportConversionRate"], helpers["orgReportDayKey"], helpers["orgReportDealCloseValueRatePct"], helpers["orgReportDealCountsExpected"], helpers["orgReportDealIsClosedWon"], helpers["orgReportDealIsCompleted"], helpers["orgReportDealIsQuotedOrAfter"], helpers["orgReportDealProbability"], helpers["orgReportDealSplitBuckets"], helpers["orgReportExtendedDealMetrics"], helpers["orgReportFirstStageOnTimeRatePct"], helpers["orgReportFirstStageOverdueRatePct"], helpers["orgReportIsReceptionOverdue"], helpers["orgReportIsSlaOverdue"], helpers["orgReportKpiPeriodStart"], helpers["orgReportNumEst"], helpers["orgReportOverdueRatePct"], helpers["orgReportOwnerId"], helpers["orgReportPctDelta"], helpers["orgReportPreviousPeriod"], helpers["orgReportQuoteValueCloseRatePct"], helpers["orgReportQuoteWinRatePct"], helpers["orgReportReceptionOverdueRatePct"], helpers["orgReportReceptionSlaMinutes"], helpers["orgReportStageIsClosed"], helpers["orgReportStageIsLostOrCancelled"], helpers["orgReportTotalDealCount"], helpers["parseChecklist"], helpers["parseCrmLeadsPageRpc"], helpers["parseCrmReportDateRange"], helpers["parseCrmStageCountsNumericMap"], helpers["parseCrmStageCountsRpc"], helpers["parseExcelMoneyFromMappedColumn"], helpers["parseLeadIdUuidList"], helpers["parseLeadIdsCsvQuery"], helpers["parseLeadIdsFromBody"], helpers["parseLeadSeenByRaw"], helpers["parseQuotationExcelBuffer"], helpers["parseStageIdsFromQuery"], helpers["parseUuidArrayJsonb"], helpers["parseVietnameseMeasure"], helpers["parseVietnameseMoney"], helpers["path"], helpers["persistAssignmentNotification"], helpers["pgCrmDuplicateLeadIds"], helpers["pickDealZaloTemplatePayload"], helpers["pipeOrgOverviewReportPdf"], helpers["pipeStaffLeadDealSummaryPdf"], helpers["pipeStaffPipelineDetailPdf"], helpers["pipelineHasExplicitCompleted"], helpers["pipelineHasExplicitExpected"], helpers["pipelineHasExplicitWon"], helpers["plannerTableMissing"], helpers["postCrmStageDefaultAssigneeComment"], helpers["primaryTemplateItemAssigneeId"], helpers["rcInvalidateTags"], helpers["reactionsTableMissing"], helpers["redactCrmTaskNotesForViewer"], helpers["regionGeocodeInflight"], helpers["repairCrmDealPipelineDisplay"], helpers["requireUserCompanyId"], helpers["requireUserCompanyIdResolved"], helpers["resolveAssignmentIdForTask"], helpers["resolveCanonicalCrmLeadId"], helpers["resolveCommercialDocListCompanyScope"], helpers["resolveCrmBundleTemplateScope"], helpers["resolveCrmLeadsDeadlinesMap"], helpers["resolveCrmLeadsKanbanLite"], helpers["resolveCrmLeadsMergedQuery"], helpers["resolveCrmLeadsSkipDeadline"], helpers["resolveCrmLedgerNetByLeadIdsPayload"], helpers["resolveCrmReportScope"], helpers["resolveCrmTaskWriteLeadId"], helpers["resolveExecutorCompanyId"], helpers["resolveKanbanStagesForCompany"], helpers["resolveLeadCommentMentionIds"], helpers["resolveProductionCompanyForDealStage"], helpers["resolveProductionHandoverResponsibleUserId"], helpers["resolveReopenTargetStageId"], helpers["resolveRpcRegionIdsForCrmList"], helpers["resolveTenantIdForQuota"], helpers["resolveZaloDealTemplateId"], helpers["respondIfCrmPipelinesTableMissing"], helpers["responseCache"], helpers["restoreCrmTaskChecklistFromWorkshopTemplate"], helpers["resyncCrmPipelineTasksForLead"], helpers["sanitizeIsoDateQueryParam"], helpers["scheduleRegionGeocoding"], helpers["scopedAdminCompanyId"], helpers["scopedCrmCompanyIdForWrite"], helpers["sendZaloTemplateMessage"], helpers["setLeadFlag"], helpers["shallowMergeTemplateData"], helpers["skipSxWorkQuickComplete"], helpers["snapshotOrderRowFromQuotation"], helpers["stripCrmAssigneeFromWonStageUpdates"], helpers["stripCrmLeadTypeColorFromSelect"], helpers["stripQuotationsSourceExcelFields"], helpers["sumCrmKpiLedgerNetByLeadIds"], helpers["sumCrmKpiLedgerNetByUserForOrgReport"], helpers["sumCrmKpiLedgerNetByUserIds"], helpers["sumCrmKpiLedgerNetByUserIdsInDateRange"], helpers["supabase"], helpers["syncAllTaskArtifactsToAssignment"], helpers["syncChecklistItemNotes"], helpers["syncCrmLeadSxPipelineFromProject"], helpers["syncQuotationDepositToDealAndProject"], helpers["syncSxKanbanFromCrmProductionStage"], helpers["syncTaskAttachmentToAssignment"], helpers["templateItemAssigneePatch"], helpers["toCrmTaskChecklist"], helpers["unifyCrmLeadResponsibleFields"], helpers["updateCrmLeadTask"], helpers["updateQuotationRow"], helpers["upsertZaloNotifySettings"], helpers["userCanAccessCrmLeadAsParticipant"], helpers["userCanAccessCrmLeadViaVisibility"], helpers["userCanAssignAnyCrmRegion"], helpers["userCanBypassCrmDeleteRestriction"], helpers["userHasSeenLeadInSeenBy"], helpers["userIsAdmin"], helpers["userIsCrmCompanyOrRegionAdmin"], helpers["userMayAccessQuotationRow"], helpers["userSeesAllCrmDeals"], helpers["userSeesAllCrmDealsForScope"], helpers["userSeesAllCrmLeads"], helpers["userSeesAllCrmLeadsForScope"], helpers["uuidQueryOrNull"], helpers["validateProductionCompanyId"]);

module.exports = r;
