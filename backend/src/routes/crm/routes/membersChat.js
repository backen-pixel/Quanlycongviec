/**
 * CRM routes: membersChat
 * Auto-extracted — handlers close over shared helpers via IIFE.
 */
const { Router } = require('express');
const helpers = require('../shared/helpersBundle');

const r = Router();

(function (ALLOWED_DEADLINE_FIELDS, CRM_COMMENT_ALLOWED_REACTION_EMOJI, CRM_LEAD_KANBAN_LITE_SELECT, CRM_LEAD_LIST_SELECT, CRM_LEAD_LIST_SELECT_BASE, CRM_LEAD_LIST_SELECT_EXTRA, CRM_LEAD_REGION_EMBED, CRM_NEW_LEAD_MAX_AGE_MS, CRM_TASK_SELECT, CRM_UUID_RE, CUSTOMERS_IN_CHUNK, CUSTOMERS_OVERVIEW_NO_MATCH_ID, DEAL_PRE_CONTRACT_SLUGS_STAFF, DEAL_REPORT_BUCKET_VALUES, DEFAULT_CHECKLISTS, DEFAULT_DEADLINE_BUCKETS, DEFAULT_PIPELINE_STAGE_SLA_DAYS, FOLLOWUP_TIME_BUCKETS, PDFDocument, QUOTATIONS_SOURCE_EXCEL_COLS, Router, SCAN_DUP_LITE_SELECT, STAFF_LEAD_DEAL_REPORT_ROLES, SURVEY_EVENT_SELECT, SURVEY_EVENT_TYPES, XLSX, ZALO_APP_SETTING_KEY, crmSchemaCompat, addPhoneToAutoLeadBlocklist, aggregateCrmCommentReactions, aggregateOrgReportRows, appendFulfillmentChildTasksForMasterDeal, applyAllActiveWorkshopTemplatesForArea, applyAssigneesToInsertedCrmTasks, applyCrmLeadRegionFilterToQuery, applyCrmTaskTemplatesToCompanyRegions, applyCustomerIdInFilter, applyCustomersOverviewSearch, applyDefaultWorkshopTemplatesForNewProject, applyLeadOrCustomerSalesFilter, applyProductionTemplateToFulfillmentLead, applyProductionTemplatesOnPipelineEnter, applyStageIdFilterToQuery, applyWorkshopTemplateToProject, artifactNamePrefix, assertCanFlagLead, assertCategoryFitsSource, assertCrmAssigneeUserMatchesLeadCompany, assertCrmEmployeeDeleteAllowed, assertCrmStageAdvanceAllowed, assertDealCrmManualStageChange, assertDealResponsible, assertDivisionAllowedForCompany, assertLeadDocumentOwner, assertLeadReadableByRegionScope, assertRegionBelongsToCompany, assertUserCanAssignCrmRegion, assignProductionCompanyDealResponsibility, attachAssigneesToCrmTasks, attachAssignmentIdsToCrmTasks, attachCrmNextOpenTaskDeadline, attachLeadNewFlagForList, attachLeadReplyParents, attachLeadUserFlagsForList, auth, autoCreateProjectFromWonDeal, autoFlowFns, autoGenCrmTasksForNewLead, buildAssignmentNotificationInsert, buildChecklistLeadDocumentRow, buildCrmDashboardMinimalKpis, buildCrmLeadsRpcFilterParams, buildCustomersOverviewSummary, buildDealTemplateData, buildDefaultDeadlineConfig, buildFirstStageIdByPipeline, buildPipelineStagesMap, buildProcessedCommercialItems, buildQuotedStageOrderByPipeline, buildScanDuplicateGroups, buildWonStageOrderByPipeline, canUserViewDocByAllowlist, chatUpload, chunkArray, classifyDealStageForStaffReport, commentsTableMissing, companyRegionExtraColumnsMissing, companyRegionGeoColumnsMissing, computeCrmDashboardLightStats, computeCrmLiveVersionMs, computeCustomersOverviewSummary, computeIsNewLeadForUser, computeOrgOverviewReportData, computeStaffLeadDealReportData, computeStaffPipelineDetailPayload, countOpenOverdueCrmTasksForLeadIds, createCrmAssignment, createCrmLeadTask, createFulfillmentChildDeal, createNotif, createNotification, createProjectFromLead, crmExecutorFieldsFromTemplateItem, crmLeadCommentAttachmentsColumnMissing, crmLeadCommentReadReceiptsTableMissing, crmLeadRowVisibleToRequestUser, crmListUsesLegacyFilters, crmNoteActivityUpload, crmReportAsOfMs, crmReportCreatedAtFromIso, crmReportCreatedAtToIso, crmReportDayKeyVn, crmRouteErrorText, crmTaskDeadlineModuleKey, crmTaskMeetsCompletionRequirements, crmTaskMeetsRequiredFileTypes, crmTaskRequiresCompletionEvidence, crmTemplateMatchesLeadType, deadlineToDateOnlyIso, defaultCompanyInfo, defaultKpiLedgerMonthStartYmd, deleteCrmLeadTask, deleteMirroredAssignmentFileForTaskAttachment, duplicateLeadIdsFromLiteRows, ecosystemModuleKeyForCrmDeadline, effectivePipelineStageSlaDays, emitCrmBadgeUpdateForProject, emitCrmDashboardChanged, emitCrmTaskChanged, emptyStaffLeadDealAgg, endOfCalendarDayAfterEntered, enforceCommercialDocCompanyOnWrite, enforceQuotaForRequest, ensureDealLeadDocumentsForModuleTransition, ensureDefaultCrmPipelineForCompany, ensureMissingCrmTasksForLead, ensureMissingCrmTasksForPipelineStage, ensureMissingSxTasksForLead, excelUpload, executeLeadMerge, executeZaloDealStageNotify, fetchActivityCustomerIds, fetchAllLeadsForSlaWatchlist, fetchAssignmentForTask, fetchCrmCommentReactionsAggregate, fetchCrmLeadCommentNotifyUserIds, fetchCrmLeadDetailRow, fetchCrmLeadWithPipelineBadges, fetchCrmLeadsByIdsOrdered, fetchCrmLeadsForDashboardBatched, fetchCrmLeadsForOrgReportBatched, fetchCrmLeadsForUserDetailBatched, fetchCrmLeadsLiteForDuplicateScan, fetchCrmLeadsPageViaRpc, fetchCrmPipelineZaloSlice, fetchCrmSurveyEventsChunk, fetchCrmSurveyVisitsForOrgReport, fetchLeadCommentAudienceMembers, fetchLeadCommentAudienceMembersForRead, fetchLeadIdsForCrmRegion, fetchLeadMentionMembers, fetchOrgActivityFeed, fetchPipelineWithStagesById, fetchScopedCrmBundles, fillTemplateDataFromStructure, filterCrmTasksForLeadType, filterUserIdsForCrmLeadScopedNotification, findChecklistItem, followupDismissExpiresAt, fontBold, fontRegular, formatMoney, formatVNDPdf, formatVnPhoneLocal0From84, fs, generateDocPdf, generateFlowTasks, generateStepTasks, getAppSettingValue, getCompanyInfo, getCompanyRegionsList, getCrmLeadListSelect, getCrmLeadRegionConstraint, getCrmLeadTypesList, getCrmLeadsListLegacy, getCrmSourceCategoriesList, getCrmSourcesList, getDefaultCrmAttachmentShare, getDefaultDealZaloTemplateStructure, getDefaultLeadDocumentShareForDeal, getDefaultPipelineIdForCompany, getLeadDocumentFieldsFromCrmTask, getNotifyTargets, getOverdueFollowUps, getPipelineIdForCompanyRegion, getPipelineZaloSlice, getPipelinesList, getProjectCRMSummary, getStagesByPipelineId, getStaleLeads, getZaloNotifySettings, hydrateCrmLeadsByIdsWithStaff, hydrateCrmLeadsRpcPage, hydrateScanDuplicateLeads, insertQuotationRow, invalidateAppSettingKey, invalidatePipelinesAndStages, invalidateRegions, invalidateSources, invalidateTenantUsageCache, invokeCrmLeadsStageCountsRpc, isAdminLike, isAllowedLeadCommentAttachmentUrl, isChotSanXuatCrmTaskTitle, isCrmCompanyAdminUser, isCrmDealAssigneeLocked, isCrmLeadTypeColorMissingError, isCrmModuleAdmin, isCrmPipelinesTableMissingError, isCrmRegionAdminUser, isCrmSystemAdminUser, isDealStageHoanThanhForZalo, isDefaultAssigneeIdsColumnError, isExecutorColumnError, isPlatformAdmin, isPostgresUniqueViolation, isQuotationsSourceExcelColumnMissingError, isSxRelationshipError, isSystemAdmin, isUuidString, isValidDealZaloTemplateStructure, isVcRelationshipError, isVptCompanyCommercialDocViewer, lastNominatimGeocodeAt, leadChatFilesMulter, leadChatJsonOrFiles, listQuotationExcelSheets, loadCrmTaskAttachmentCountMap, loadOrgReportStageMap, loadZaloLinkedLeadIdSet, logDealActivityComment, logDealDeadlineChangeComment, logDealStageChangeComment, logKanbanDeadlineUnifiedHistory, logLeadCommentMentionActivity, logProjectFileActivity, mapCustomerOverviewRow, mapLeadDisplayPhone, mapQuotationItemsToOrderRows, maskCustomerPhoneDisplay, maskZaloAccessTokenPreview, maybeSendZaloOnDealStageEnter, mergeCrmStageDefaultAssigneeIntoUpdates, mergeCustomerIntoTarget, misaService, multer, nextCode, nextTbProjectCode, normalizeCrmActivityAttachments, normalizeCrmLeadCommentAttachments, normalizeCrmStageDefaultAssigneeUserId, normalizeCrmUserRole, normalizeLeadSeenByKeys, normalizeOrgReportSurveyVisitRow, normalizePipelineStageSlaDaysForDb, normalizePipelineStagesList, normalizeRegionIdList, normalizeTemplateChecklistForCrmTask, normalizeTemplateItemAssigneeIds, normalizeTimestamp, normalizeTitleFold, normalizeVnPhoneTo84, notifyDealCommentMentions, notifyDealCommentParticipants, notifyMultiple, notifyMultipleShared, notifyNewCrmAssignmentAssignees, notifyProductionDocumentUploaded, onLeadWon, onOrderConfirmed, onProjectCompleted, onQuotationAccepted, orgReportAttachFirstStageRates, orgReportBumpFirstStageMetrics, orgReportBumpMetrics, orgReportBumpOpenOverdue, orgReportBumpReceptionMetrics, orgReportCancelRatePct, orgReportClosedWonDealCount, orgReportClosedWonValue, orgReportCompareSummary, orgReportConversionRate, orgReportDayKey, orgReportDealCloseValueRatePct, orgReportDealCountsExpected, orgReportDealIsClosedWon, orgReportDealIsCompleted, orgReportDealIsQuotedOrAfter, orgReportDealProbability, orgReportDealSplitBuckets, orgReportExtendedDealMetrics, orgReportFirstStageOnTimeRatePct, orgReportFirstStageOverdueRatePct, orgReportIsReceptionOverdue, orgReportIsSlaOverdue, orgReportKpiPeriodStart, orgReportNumEst, orgReportOverdueRatePct, orgReportOwnerId, orgReportPctDelta, orgReportPreviousPeriod, orgReportQuoteValueCloseRatePct, orgReportQuoteWinRatePct, orgReportReceptionOverdueRatePct, orgReportReceptionSlaMinutes, orgReportStageIsClosed, orgReportStageIsLostOrCancelled, orgReportTotalDealCount, parseChecklist, parseCrmLeadsPageRpc, parseCrmReportDateRange, parseCrmStageCountsNumericMap, parseCrmStageCountsRpc, parseExcelMoneyFromMappedColumn, parseLeadIdUuidList, parseLeadIdsCsvQuery, parseLeadIdsFromBody, parseLeadSeenByRaw, parseQuotationExcelBuffer, parseStageIdsFromQuery, parseUuidArrayJsonb, parseVietnameseMeasure, parseVietnameseMoney, path, persistAssignmentNotification, pgCrmDuplicateLeadIds, pickDealZaloTemplatePayload, pipeOrgOverviewReportPdf, pipeStaffLeadDealSummaryPdf, pipeStaffPipelineDetailPdf, pipelineHasExplicitCompleted, pipelineHasExplicitExpected, pipelineHasExplicitWon, plannerTableMissing, postCrmStageDefaultAssigneeComment, primaryTemplateItemAssigneeId, rcInvalidateTags, reactionsTableMissing, redactCrmTaskNotesForViewer, regionGeocodeInflight, repairCrmDealPipelineDisplay, requireUserCompanyId, requireUserCompanyIdResolved, resolveAssignmentIdForTask, resolveCanonicalCrmLeadId, resolveCommercialDocListCompanyScope, resolveCrmBundleTemplateScope, resolveCrmLeadsDeadlinesMap, resolveCrmLeadsKanbanLite, resolveCrmLeadsMergedQuery, resolveCrmLeadsSkipDeadline, resolveCrmLedgerNetByLeadIdsPayload, resolveCrmReportScope, resolveCrmTaskWriteLeadId, resolveExecutorCompanyId, resolveKanbanStagesForCompany, resolveLeadCommentMentionIds, resolveProductionCompanyForDealStage, resolveProductionHandoverResponsibleUserId, resolveReopenTargetStageId, resolveRpcRegionIdsForCrmList, resolveTenantIdForQuota, resolveZaloDealTemplateId, respondIfCrmPipelinesTableMissing, responseCache, restoreCrmTaskChecklistFromWorkshopTemplate, resyncCrmPipelineTasksForLead, sanitizeIsoDateQueryParam, scheduleRegionGeocoding, scopedAdminCompanyId, scopedCrmCompanyIdForWrite, sendZaloTemplateMessage, setLeadFlag, shallowMergeTemplateData, skipSxWorkQuickComplete, snapshotOrderRowFromQuotation, stripCrmAssigneeFromWonStageUpdates, stripCrmLeadTypeColorFromSelect, stripQuotationsSourceExcelFields, sumCrmKpiLedgerNetByLeadIds, sumCrmKpiLedgerNetByUserForOrgReport, sumCrmKpiLedgerNetByUserIds, sumCrmKpiLedgerNetByUserIdsInDateRange, supabase, syncAllTaskArtifactsToAssignment, syncChecklistItemNotes, syncCrmLeadSxPipelineFromProject, syncQuotationDepositToDealAndProject, syncSxKanbanFromCrmProductionStage, syncTaskAttachmentToAssignment, templateItemAssigneePatch, toCrmTaskChecklist, unifyCrmLeadResponsibleFields, updateCrmLeadTask, updateQuotationRow, upsertZaloNotifySettings, userCanAccessCrmLeadAsParticipant, userCanAccessCrmLeadViaVisibility, userCanAssignAnyCrmRegion, userCanBypassCrmDeleteRestriction, userHasSeenLeadInSeenBy, userIsAdmin, userIsCrmCompanyOrRegionAdmin, userMayAccessQuotationRow, userSeesAllCrmDeals, userSeesAllCrmDealsForScope, userSeesAllCrmLeads, userSeesAllCrmLeadsForScope, uuidQueryOrNull, validateProductionCompanyId) {
r.get('/leads/:id/members', async (req, res) => {
  try {
    try {
      const { ensureLeadMembersFromProjectStaff } = require('../../../helpers/productionWorkshopTypeStaff');
      await ensureLeadMembersFromProjectStaff(req.params.id);
    } catch (syncErr) {
      console.warn('[crm/leads/members] sync production staff:', syncErr.message);
    }
    const merged = await fetchLeadMentionMembers(supabase, req.params.id);
    res.json(merged);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/leads/:id/members', async (req, res) => {
  try {
    const { user_id, role = 'member', members: batchMembers } = req.body;

    // Batch mode: members: [{ user_id, role }]
    const toAdd = batchMembers?.length
      ? batchMembers.map(m => ({ user_id: m.user_id, role: m.role || 'member' }))
      : user_id ? [{ user_id, role }] : [];

    if (!toAdd.length) return res.status(400).json({ error: 'Thiếu user_id hoặc members[]' });

    const { data: adder } = await supabase.from('users').select('full_name').eq('id', req.user.userId).single();
    const { data: leadInfo } = await supabase.from('crm_leads').select('code,title').eq('id', req.params.id).single();
    const leadLabel = leadInfo ? `${leadInfo.code || ''} ${leadInfo.title || ''}`.trim() : 'nhóm trao đổi';
    const results = [];

    for (const item of toAdd) {
      const { data, error } = await supabase.from('lead_members')
        .upsert({ lead_id: req.params.id, user_id: item.user_id, role: item.role, added_by: req.user.userId }, { onConflict: 'lead_id,user_id' })
        .select('*, user:users!lead_members_user_id_fkey(id, full_name, email, avatar, role, company_id, drive_module)')
        .single();
      if (error) { console.error('Add member error:', error); continue; }
      results.push(data);

      const memberName = data?.user?.full_name || 'Thành viên';
      const ROLE_LABELS = { member: 'Tham gia', supervisor: 'Giám sát', responsible: 'Chịu trách nhiệm', viewer: 'Xem' };
      const roleLabel = ROLE_LABELS[item.role] || item.role;

      // System message
      await supabase.from('lead_messages').insert({
        lead_id: req.params.id, user_id: req.user.userId,
        content: `${adder?.full_name || 'Admin'} đã thêm ${memberName} (${roleLabel}) vào nhóm`,
        message_type: 'system', is_system: true,
      });

      // Notify added user
      await createNotification(req, item.user_id, 'lead_member_added', '👥 Bạn được thêm vào nhóm',
        `${adder?.full_name || 'Admin'} đã thêm bạn vào ${leadLabel} với vai trò ${roleLabel}`, 'lead', req.params.id,
        { nav_tab: 'team' });
    }

    // Notify existing members
    const { data: otherMembers } = await supabase.from('lead_members')
      .select('user_id').eq('lead_id', req.params.id)
      .not('user_id', 'in', `(${toAdd.map(m => m.user_id).join(',')})`)
      .neq('user_id', req.user.userId);
    if (otherMembers?.length) {
      const names = results.map(r => r?.user?.full_name).filter(Boolean).join(', ');
      await notifyMultipleShared(req, otherMembers.map(m => m.user_id), 'lead_member_added',
        '👥 Thành viên mới', `${adder?.full_name || 'Admin'} đã thêm ${names} vào ${leadLabel}`,
        'lead', req.params.id, { nav_tab: 'team' });
    }

    // Emit realtime
    const io = req.app.get('io');
    if (io) io.to(`lead:${req.params.id}`).emit('lead:member_added', results);

    res.json(results.length === 1 ? results[0] : results);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/leads/:id/assignments', async (req, res) => {
  try {
    const ASSIGN_LIST_SELECT = `
        id, company_id, column_id, lead_id, crm_task_id, assignment_module,
        task_source_type, employee_error_module, title, description,
        assignee_id, created_by_id, priority, status, deadline,
        position, created_at, updated_at, completed_at,
        assignee:users!crm_assignments_assignee_id_fkey(id, full_name, email, avatar, role, drive_module),
        created_by:users!crm_assignments_created_by_id_fkey(id, full_name, email, avatar),
        lead:crm_leads(id, code, title, type)
      `;
    const ASSIGN_LIST_SELECT_LEGACY = `
        id, company_id, column_id, lead_id, assignment_module, title, description,
        assignee_id, created_by_id, priority, status, deadline,
        position, created_at, updated_at, completed_at,
        assignee:users!crm_assignments_assignee_id_fkey(id, full_name, email, avatar, role, drive_module),
        created_by:users!crm_assignments_created_by_id_fkey(id, full_name, email, avatar),
        lead:crm_leads(id, code, title, type)
      `;
    let q = supabase
      .from('crm_assignments')
      .select(ASSIGN_LIST_SELECT)
      .eq('lead_id', req.params.id)
      .order('created_at', { ascending: false });
    let { data, error } = await q;
    if (error && /task_source_type|employee_error_module|crm_task_id/.test(error.message || '')) {
      ({ data, error } = await supabase
        .from('crm_assignments')
        .select(ASSIGN_LIST_SELECT_LEGACY)
        .eq('lead_id', req.params.id)
        .order('created_at', { ascending: false }));
    }
    if (error && /lead_id/.test(error.message || '')) {
      return res.json({ assignments: [] });
    }
    if (error) throw error;
    const list = data || [];
    if (list.length) {
      const ids = list.map((x) => x.id);
      const { data: rows } = await supabase
        .from('crm_assignment_assignees')
        .select('assignment_id, user_id, user:users(id, full_name, email, avatar, role, drive_module)')
        .in('assignment_id', ids);
      const byId = new Map();
      (rows || []).forEach((r) => {
        if (!byId.has(r.assignment_id)) byId.set(r.assignment_id, []);
        if (r.user) byId.get(r.assignment_id).push(r.user);
      });
      list.forEach((a) => {
        a.assignees = byId.get(a.id) || (a.assignee ? [a.assignee] : []);
      });
    }
    res.json({ assignments: list });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/leads/:id/assignments', async (req, res) => {
  try {
    const leadId = req.params.id;
    const b = req.body || {};
    const {
      createSharedWorkspaceLinkedAssignment,
    } = require('../../../helpers/sharedWorkspaceAssignmentCreate');
    const { emitNotifyBadge: emitAssignBadge } = require('../../../helpers/notifyBadge');

    const result = await createSharedWorkspaceLinkedAssignment(req, leadId, b);
    if (result.error) {
      return res.status(result.status || 500).json({
        error: result.error,
        ...(result.invalid_user_ids ? { invalid_user_ids: result.invalid_user_ids } : {}),
        ...(result.code ? { code: result.code } : {}),
      });
    }

    const data = result.data?.assignment;
    const assigneeIds = result.data?.assignee_ids || [];
    const leadInfo = result.data?.lead;
    const leadLabel = leadInfo
      ? `${leadInfo.code || ''} ${leadInfo.title || ''}`.trim()
      : 'lead/deal';
    const leadSuffix = leadLabel ? ` (${leadLabel})` : '';
    const pushFn = req.app?.get?.('pushNotification');
    const mod = String(data?.assignment_module || b.assignment_module || 'crm').toLowerCase();
    const notifTitle = mod === 'production'
      ? '📋 Bạn vừa được giao nhiệm vụ SX'
      : mod === 'logistics'
        ? '📋 Bạn vừa được giao nhiệm vụ VC/LĐ'
        : '📋 Bạn vừa được giao nhiệm vụ CRM';
    const navPath = mod === 'production' ? '/sx/assignments' : '/crm/assignments';
    for (const uid of assigneeIds) {
      if (String(uid) === String(req.user.userId)) continue;
      const message = `"${data.title}"${leadSuffix}${data.deadline ? ' — hạn ' + new Date(data.deadline).toLocaleString('vi-VN') : ''}`;
      const meta = {
        lead_id: leadId,
        crm_task_id: data.crm_task_id || result.data?.task?.id || null,
        nav_path: navPath,
        open: data.id,
        module_key: mod === 'logistics' ? 'vc' : (mod === 'production' ? 'sx' : 'crm'),
        ecosystem_module_key: mod === 'logistics' ? 'logistics' : mod,
        task_source_type: data.task_source_type || b.task_source_type || null,
        employee_error_module: data.employee_error_module || b.employee_error_module || null,
      };
      const notif = await persistAssignmentNotification(supabase, uid, {
        type: 'crm_assignment_assigned',
        title: notifTitle,
        message,
        assignmentId: data.id,
        metadata: meta,
      });
      const payload = notif || buildAssignmentNotificationInsert(uid, {
        type: 'crm_assignment_assigned',
        title: notifTitle,
        message,
        assignmentId: data.id,
        metadata: meta,
      });
      if (typeof pushFn === 'function') {
        void pushFn(uid, payload);
      } else {
        try {
          const io = req.app.get('io');
          if (io) io.to(`user:${uid}`).emit('notification', payload);
        } catch { /* ignore */ }
      }
    }
    if (assigneeIds.length) {
      try {
        emitAssignBadge(req.app, 'assignments', { company_id: req.user?.company_id || null });
      } catch (_) { /* ignore */ }
    }

    try {
      await emitCrmTaskChanged(req, {
        leadId,
        taskId: data.crm_task_id || result.data?.task?.id || null,
        action: 'created',
        task: result.data?.task || data,
      });
    } catch (_) { /* ignore */ }

    void rcInvalidateTags(['crm:assignments']);
    res.status(result.status).json({
      assignment: data,
      task: result.data?.task || null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.delete('/leads/:id/members/:userId', async (req, res) => {
  try {
    // Lấy tên người bị xóa
    const { data: removedUser } = await supabase.from('users').select('full_name').eq('id', req.params.userId).single();
    
    await supabase.from('lead_members')
      .delete().eq('lead_id', req.params.id).eq('user_id', req.params.userId);

    // Tin nhắn hệ thống
    const { data: remover } = await supabase.from('users').select('full_name').eq('id', req.user.userId).single();
    await supabase.from('lead_messages').insert({
      lead_id: req.params.id, user_id: req.user.userId,
      content: `${remover?.full_name || 'Admin'} đã xóa ${removedUser?.full_name || 'thành viên'} khỏi nhóm`,
      message_type: 'system', is_system: true,
    });

    const io = req.app.get('io');
    if (io) io.to(`lead:${req.params.id}`).emit('lead:member_removed', { user_id: req.params.userId });

    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/leads/:id/chat', async (req, res) => {
  try {
    let { data } = await supabase.from('lead_messages')
      .select('*, user:users(id, full_name, avatar)')
      .eq('lead_id', req.params.id)
      .order('created_at', { ascending: true })
      .limit(500);
    // Ẩn lịch sử chat cho thành viên VC/LĐ mới thêm (lead_members.history_cutoff_at).
    try {
      const { data: memRow } = await supabase
        .from('lead_members')
        .select('history_cutoff_at')
        .eq('lead_id', req.params.id)
        .eq('user_id', req.user?.userId)
        .maybeSingle();
      const cutoffMs = memRow?.history_cutoff_at ? new Date(memRow.history_cutoff_at).getTime() : null;
      if (cutoffMs && Number.isFinite(cutoffMs)) {
        data = (data || []).filter((m) => {
          const t = new Date(m.created_at).getTime();
          return Number.isFinite(t) && t >= cutoffMs;
        });
      }
    } catch (_) { /* cột chưa migrate — bỏ qua */ }
    const msgIds = (data || []).map(m => m.id);
    let reactionsMap = {};
    if (msgIds.length) {
      const { data: reactions } = await supabase.from('lead_message_reactions')
        .select('*, user:users(id, full_name)').in('message_id', msgIds);
      (reactions || []).forEach(r => {
        if (!reactionsMap[r.message_id]) reactionsMap[r.message_id] = [];
        reactionsMap[r.message_id].push(r);
      });
    }
    const withReply = await attachLeadReplyParents(data || []);
    const result = withReply.map(m => ({ ...m, reactions: reactionsMap[m.id] || [] }));
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/leads/:id/chat', leadChatJsonOrFiles, async (req, res) => {
  try {
    const uid = req.user?.userId ?? req.user?.id;
    if (!uid) return res.status(401).json({ error: 'Token không có user id' });
    const { content, reply_to } = req.body;
    const files = req.files || [];
    const attachments = files.map(f => ({
      name: f.originalname,
      url: `/uploads/lead-chat/${f.filename}`,
      type: f.mimetype,
      size: f.size
    }));

    if (!content && !attachments.length) return res.status(400).json({ error: 'Thiếu nội dung' });

    const { data: inserted, error } = await supabase.from('lead_messages').insert({
      lead_id: req.params.id,
      user_id: String(uid),
      content: content || '',
      attachments: attachments.length ? attachments : null,
      reply_to: reply_to || null,
    }).select('id').single();

    if (error) return res.status(400).json({ error: error.message });

    const { data: basic } = await supabase.from('lead_messages')
      .select('*, user:users!lead_messages_user_id_fkey(id, full_name, avatar)')
      .eq('id', inserted.id)
      .single();
    const [hydrated] = await attachLeadReplyParents([basic]);
    const data = hydrated || basic;

    const io = req.app.get('io');
    if (io) io.to(`lead:${req.params.id}`).emit('lead:chat', data);

    // Notify các thành viên khác (text message) — bật bubble + status-bar trên mobile
    try {
      const { data: chatMembers } = await supabase.from('lead_members')
        .select('user_id')
        .eq('lead_id', req.params.id)
        .neq('user_id', String(uid));
      if (chatMembers?.length) {
        const senderName = data?.user?.full_name || 'Ai đó';
        const senderAvatar = data?.user?.avatar || '';
        const preview = (content || '').toString().slice(0, 200) || '[Tin nhắn]';
        let leadName = '';
        try {
          const { data: leadRow } = await supabase.from('leads')
            .select('name')
            .eq('id', req.params.id)
            .single();
          leadName = leadRow?.name || '';
        } catch { /* ignore */ }
        await notifyMultipleShared(
          req,
          chatMembers.map(m => m.user_id),
          'lead_chat',
          `Tin nhắn mới: ${senderName}`,
          preview,
          'lead',
          req.params.id,
          {
            nav_tab: 'chat',
            sender_name: senderName,
            sender_avatar: senderAvatar,
            group_name: leadName,
            bubble_key: `lead:${req.params.id}`,
            bubble_wake: true,
            message_id: data?.id ? String(data.id) : '',
            sender_id: String(uid),
            message_type: 'text',
          },
        );
      }
    } catch (notifyErr) {
      console.warn('[lead-chat-notify]', notifyErr?.message || notifyErr);
    }

    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/leads/:id/chat/drive', async (req, res) => {
  try {
    const uid = req.user?.userId ?? req.user?.id;
    if (!uid) return res.status(401).json({ error: 'Token không có user id' });
    const { file_ids, content, reply_to } = req.body || {};
    const { buildDriveChatAttachments } = require('../../../helpers/driveChatAttachments');
    const attachments = await buildDriveChatAttachments(req.user, file_ids);
    if (!attachments.length) return res.status(403).json({ error: 'Không có quyền với file Drive đã chọn' });
    if (!content && !attachments.length) return res.status(400).json({ error: 'Thiếu nội dung' });

    const { data: inserted, error } = await supabase.from('lead_messages').insert({
      lead_id: req.params.id,
      user_id: String(uid),
      content: content || '',
      message_type: 'file',
      attachments,
      reply_to: reply_to || null,
    }).select('id').single();
    if (error) return res.status(400).json({ error: error.message });

    const { data: basic } = await supabase.from('lead_messages')
      .select('*, user:users!lead_messages_user_id_fkey(id, full_name, avatar)')
      .eq('id', inserted.id)
      .single();
    const [hydrated] = await attachLeadReplyParents([basic]);
    const data = hydrated || basic;

    const io = req.app.get('io');
    if (io) io.to(`lead:${req.params.id}`).emit('lead:chat', data);

    try {
      const { data: chatMembers } = await supabase.from('lead_members')
        .select('user_id')
        .eq('lead_id', req.params.id)
        .neq('user_id', String(uid));
      if (chatMembers?.length) {
        const senderName = data?.user?.full_name || 'Ai đó';
        const senderAvatar = data?.user?.avatar || '';
        const preview = attachments.length === 1
          ? `[☁️ ${attachments[0].name || 'File Drive'}]`
          : `[☁️ ${attachments.length} file Drive]`;
        let leadName = '';
        try {
          const { data: leadRow } = await supabase.from('leads')
            .select('name')
            .eq('id', req.params.id)
            .single();
          leadName = leadRow?.name || '';
        } catch { /* ignore */ }
        await notifyMultipleShared(
          req,
          chatMembers.map((m) => m.user_id),
          'lead_chat',
          `Tin nhắn mới: ${senderName}`,
          preview,
          'lead',
          req.params.id,
          {
            nav_tab: 'chat',
            sender_name: senderName,
            sender_avatar: senderAvatar,
            group_name: leadName,
            bubble_key: `lead:${req.params.id}`,
            bubble_wake: true,
            message_id: data?.id ? String(data.id) : '',
            sender_id: String(uid),
            message_type: 'file',
          },
        );
      }
    } catch (notifyErr) {
      console.warn('[lead-chat-drive-notify]', notifyErr?.message || notifyErr);
    }

    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/leads/:id/chat/upload', chatUpload.single('file'), async (req, res) => {
  try {
    const uid = req.user?.userId ?? req.user?.id;
    if (!uid) return res.status(401).json({ error: 'Token không có user id' });
    if (!req.file) return res.status(400).json({ error: 'Không có file' });
    const mime = req.file.mimetype;
    let message_type = 'file';
    if (mime.startsWith('image/')) message_type = 'image';
    else if (mime.startsWith('video/')) message_type = 'video';
    else if (mime.startsWith('audio/')) message_type = 'audio';

    const attachment_url = `/uploads/lead-chat/${req.file.filename}`;
    const { data: inserted, error } = await supabase.from('lead_messages').insert({
      lead_id: req.params.id, user_id: String(uid),
      content: req.body.content || '', message_type,
      attachment_url, attachment_name: req.file.originalname,
      attachment_size: req.file.size, attachment_mime: mime,
      reply_to: req.body.reply_to || null,
    }).select('id').single();
    if (error) return res.status(400).json({ error: error.message });

    const { data: basic } = await supabase.from('lead_messages')
      .select('*, user:users(id, full_name, avatar)')
      .eq('id', inserted.id)
      .single();
    const [hydrated] = await attachLeadReplyParents([basic]);
    const data = hydrated || basic;

    const io = req.app.get('io');
    if (io) io.to(`lead:${req.params.id}`).emit('lead:chat', data);

    // Notify các thành viên khác (upload file cũng cần thông báo)
    const { data: uploadMembers } = await supabase.from('lead_members')
      .select('user_id')
      .eq('lead_id', req.params.id)
      .neq('user_id', String(uid));
    if (uploadMembers?.length) {
      const senderName = data?.user?.full_name || 'Ai đó';
      const senderAvatar = data?.user?.avatar || '';
      const preview = message_type === 'image' ? '[🖼️ Hình ảnh]' : message_type === 'video' ? '[🎬 Video]' : message_type === 'audio' ? '[🎙️ Ghi âm]' : `[📎 ${req.file.originalname || 'Tệp'}]`;
      let leadName = '';
      try {
        const { data: leadRow } = await supabase.from('leads').select('name').eq('id', req.params.id).single();
        leadName = leadRow?.name || '';
      } catch { /* ignore */ }
      await notifyMultipleShared(req, uploadMembers.map(m => m.user_id), 'lead_chat',
        `Tin nhắn mới: ${senderName}`, preview, 'lead', req.params.id, {
          nav_tab: 'chat',
          sender_name: senderName,
          sender_avatar: senderAvatar,
          group_name: leadName,
          bubble_key: `lead:${req.params.id}`,
          bubble_wake: true,
          message_id: data?.id ? String(data.id) : '',
          sender_id: String(uid),
          message_type: message_type,
        });
    }

    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/leads/:id/chat/:msgId/react', async (req, res) => {
  try {
    const { emoji } = req.body;
    if (!emoji) return res.status(400).json({ error: 'Thiếu emoji' });
    // Toggle: nếu đã có thì xóa, chưa có thì thêm
    const { data: existing } = await supabase.from('lead_message_reactions')
      .select('id').eq('message_id', req.params.msgId).eq('user_id', req.user.userId).eq('emoji', emoji).single();
    if (existing) {
      await supabase.from('lead_message_reactions').delete().eq('id', existing.id);
    } else {
      await supabase.from('lead_message_reactions').insert({
        message_id: req.params.msgId, user_id: req.user.userId, emoji,
      });
    }
    // Reload reactions cho message này
    const { data: reactions } = await supabase.from('lead_message_reactions')
      .select('*, user:users(id, full_name)').eq('message_id', req.params.msgId);
    const io = req.app.get('io');
    if (io) io.to(`lead:${req.params.id}`).emit('lead:reactions', { message_id: req.params.msgId, reactions });
    res.json({ reactions });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.put('/leads/:id/chat/:msgId/pin', async (req, res) => {
  try {
    const { data: msg } = await supabase.from('lead_messages').select('is_pinned').eq('id', req.params.msgId).single();
    const newPin = !msg?.is_pinned;
    await supabase.from('lead_messages').update({ is_pinned: newPin }).eq('id', req.params.msgId);
    const io = req.app.get('io');
    if (io) io.to(`lead:${req.params.id}`).emit('lead:pin', { message_id: req.params.msgId, is_pinned: newPin });
    res.json({ is_pinned: newPin });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/leads/:id/chat/pinned', async (req, res) => {
  try {
    const { data } = await supabase.from('lead_messages')
      .select('*, user:users(id, full_name, avatar)')
      .eq('lead_id', req.params.id).eq('is_pinned', true)
      .order('created_at', { ascending: false });
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
}).call(null, helpers["ALLOWED_DEADLINE_FIELDS"], helpers["CRM_COMMENT_ALLOWED_REACTION_EMOJI"], helpers["CRM_LEAD_KANBAN_LITE_SELECT"], helpers["CRM_LEAD_LIST_SELECT"], helpers["CRM_LEAD_LIST_SELECT_BASE"], helpers["CRM_LEAD_LIST_SELECT_EXTRA"], helpers["CRM_LEAD_REGION_EMBED"], helpers["CRM_NEW_LEAD_MAX_AGE_MS"], helpers["CRM_TASK_SELECT"], helpers["CRM_UUID_RE"], helpers["CUSTOMERS_IN_CHUNK"], helpers["CUSTOMERS_OVERVIEW_NO_MATCH_ID"], helpers["DEAL_PRE_CONTRACT_SLUGS_STAFF"], helpers["DEAL_REPORT_BUCKET_VALUES"], helpers["DEFAULT_CHECKLISTS"], helpers["DEFAULT_DEADLINE_BUCKETS"], helpers["DEFAULT_PIPELINE_STAGE_SLA_DAYS"], helpers["FOLLOWUP_TIME_BUCKETS"], helpers["PDFDocument"], helpers["QUOTATIONS_SOURCE_EXCEL_COLS"], helpers["Router"], helpers["SCAN_DUP_LITE_SELECT"], helpers["STAFF_LEAD_DEAL_REPORT_ROLES"], helpers["SURVEY_EVENT_SELECT"], helpers["SURVEY_EVENT_TYPES"], helpers["XLSX"], helpers["ZALO_APP_SETTING_KEY"], helpers["crmSchemaCompat"], helpers["addPhoneToAutoLeadBlocklist"], helpers["aggregateCrmCommentReactions"], helpers["aggregateOrgReportRows"], helpers["appendFulfillmentChildTasksForMasterDeal"], helpers["applyAllActiveWorkshopTemplatesForArea"], helpers["applyAssigneesToInsertedCrmTasks"], helpers["applyCrmLeadRegionFilterToQuery"], helpers["applyCrmTaskTemplatesToCompanyRegions"], helpers["applyCustomerIdInFilter"], helpers["applyCustomersOverviewSearch"], helpers["applyDefaultWorkshopTemplatesForNewProject"], helpers["applyLeadOrCustomerSalesFilter"], helpers["applyProductionTemplateToFulfillmentLead"], helpers["applyProductionTemplatesOnPipelineEnter"], helpers["applyStageIdFilterToQuery"], helpers["applyWorkshopTemplateToProject"], helpers["artifactNamePrefix"], helpers["assertCanFlagLead"], helpers["assertCategoryFitsSource"], helpers["assertCrmAssigneeUserMatchesLeadCompany"], helpers["assertCrmEmployeeDeleteAllowed"], helpers["assertCrmStageAdvanceAllowed"], helpers["assertDealCrmManualStageChange"], helpers["assertDealResponsible"], helpers["assertDivisionAllowedForCompany"], helpers["assertLeadDocumentOwner"], helpers["assertLeadReadableByRegionScope"], helpers["assertRegionBelongsToCompany"], helpers["assertUserCanAssignCrmRegion"], helpers["assignProductionCompanyDealResponsibility"], helpers["attachAssigneesToCrmTasks"], helpers["attachAssignmentIdsToCrmTasks"], helpers["attachCrmNextOpenTaskDeadline"], helpers["attachLeadNewFlagForList"], helpers["attachLeadReplyParents"], helpers["attachLeadUserFlagsForList"], helpers["auth"], helpers["autoCreateProjectFromWonDeal"], helpers["autoFlowFns"], helpers["autoGenCrmTasksForNewLead"], helpers["buildAssignmentNotificationInsert"], helpers["buildChecklistLeadDocumentRow"], helpers["buildCrmDashboardMinimalKpis"], helpers["buildCrmLeadsRpcFilterParams"], helpers["buildCustomersOverviewSummary"], helpers["buildDealTemplateData"], helpers["buildDefaultDeadlineConfig"], helpers["buildFirstStageIdByPipeline"], helpers["buildPipelineStagesMap"], helpers["buildProcessedCommercialItems"], helpers["buildQuotedStageOrderByPipeline"], helpers["buildScanDuplicateGroups"], helpers["buildWonStageOrderByPipeline"], helpers["canUserViewDocByAllowlist"], helpers["chatUpload"], helpers["chunkArray"], helpers["classifyDealStageForStaffReport"], helpers["commentsTableMissing"], helpers["companyRegionExtraColumnsMissing"], helpers["companyRegionGeoColumnsMissing"], helpers["computeCrmDashboardLightStats"], helpers["computeCrmLiveVersionMs"], helpers["computeCustomersOverviewSummary"], helpers["computeIsNewLeadForUser"], helpers["computeOrgOverviewReportData"], helpers["computeStaffLeadDealReportData"], helpers["computeStaffPipelineDetailPayload"], helpers["countOpenOverdueCrmTasksForLeadIds"], helpers["createCrmAssignment"], helpers["createCrmLeadTask"], helpers["createFulfillmentChildDeal"], helpers["createNotif"], helpers["createNotification"], helpers["createProjectFromLead"], helpers["crmExecutorFieldsFromTemplateItem"], helpers["crmLeadCommentAttachmentsColumnMissing"], helpers["crmLeadCommentReadReceiptsTableMissing"], helpers["crmLeadRowVisibleToRequestUser"], helpers["crmListUsesLegacyFilters"], helpers["crmNoteActivityUpload"], helpers["crmReportAsOfMs"], helpers["crmReportCreatedAtFromIso"], helpers["crmReportCreatedAtToIso"], helpers["crmReportDayKeyVn"], helpers["crmRouteErrorText"], helpers["crmTaskDeadlineModuleKey"], helpers["crmTaskMeetsCompletionRequirements"], helpers["crmTaskMeetsRequiredFileTypes"], helpers["crmTaskRequiresCompletionEvidence"], helpers["crmTemplateMatchesLeadType"], helpers["deadlineToDateOnlyIso"], helpers["defaultCompanyInfo"], helpers["defaultKpiLedgerMonthStartYmd"], helpers["deleteCrmLeadTask"], helpers["deleteMirroredAssignmentFileForTaskAttachment"], helpers["duplicateLeadIdsFromLiteRows"], helpers["ecosystemModuleKeyForCrmDeadline"], helpers["effectivePipelineStageSlaDays"], helpers["emitCrmBadgeUpdateForProject"], helpers["emitCrmDashboardChanged"], helpers["emitCrmTaskChanged"], helpers["emptyStaffLeadDealAgg"], helpers["endOfCalendarDayAfterEntered"], helpers["enforceCommercialDocCompanyOnWrite"], helpers["enforceQuotaForRequest"], helpers["ensureDealLeadDocumentsForModuleTransition"], helpers["ensureDefaultCrmPipelineForCompany"], helpers["ensureMissingCrmTasksForLead"], helpers["ensureMissingCrmTasksForPipelineStage"], helpers["ensureMissingSxTasksForLead"], helpers["excelUpload"], helpers["executeLeadMerge"], helpers["executeZaloDealStageNotify"], helpers["fetchActivityCustomerIds"], helpers["fetchAllLeadsForSlaWatchlist"], helpers["fetchAssignmentForTask"], helpers["fetchCrmCommentReactionsAggregate"], helpers["fetchCrmLeadCommentNotifyUserIds"], helpers["fetchCrmLeadDetailRow"], helpers["fetchCrmLeadWithPipelineBadges"], helpers["fetchCrmLeadsByIdsOrdered"], helpers["fetchCrmLeadsForDashboardBatched"], helpers["fetchCrmLeadsForOrgReportBatched"], helpers["fetchCrmLeadsForUserDetailBatched"], helpers["fetchCrmLeadsLiteForDuplicateScan"], helpers["fetchCrmLeadsPageViaRpc"], helpers["fetchCrmPipelineZaloSlice"], helpers["fetchCrmSurveyEventsChunk"], helpers["fetchCrmSurveyVisitsForOrgReport"], helpers["fetchLeadCommentAudienceMembers"], helpers["fetchLeadCommentAudienceMembersForRead"], helpers["fetchLeadIdsForCrmRegion"], helpers["fetchLeadMentionMembers"], helpers["fetchOrgActivityFeed"], helpers["fetchPipelineWithStagesById"], helpers["fetchScopedCrmBundles"], helpers["fillTemplateDataFromStructure"], helpers["filterCrmTasksForLeadType"], helpers["filterUserIdsForCrmLeadScopedNotification"], helpers["findChecklistItem"], helpers["followupDismissExpiresAt"], helpers["fontBold"], helpers["fontRegular"], helpers["formatMoney"], helpers["formatVNDPdf"], helpers["formatVnPhoneLocal0From84"], helpers["fs"], helpers["generateDocPdf"], helpers["generateFlowTasks"], helpers["generateStepTasks"], helpers["getAppSettingValue"], helpers["getCompanyInfo"], helpers["getCompanyRegionsList"], helpers["getCrmLeadListSelect"], helpers["getCrmLeadRegionConstraint"], helpers["getCrmLeadTypesList"], helpers["getCrmLeadsListLegacy"], helpers["getCrmSourceCategoriesList"], helpers["getCrmSourcesList"], helpers["getDefaultCrmAttachmentShare"], helpers["getDefaultDealZaloTemplateStructure"], helpers["getDefaultLeadDocumentShareForDeal"], helpers["getDefaultPipelineIdForCompany"], helpers["getLeadDocumentFieldsFromCrmTask"], helpers["getNotifyTargets"], helpers["getOverdueFollowUps"], helpers["getPipelineIdForCompanyRegion"], helpers["getPipelineZaloSlice"], helpers["getPipelinesList"], helpers["getProjectCRMSummary"], helpers["getStagesByPipelineId"], helpers["getStaleLeads"], helpers["getZaloNotifySettings"], helpers["hydrateCrmLeadsByIdsWithStaff"], helpers["hydrateCrmLeadsRpcPage"], helpers["hydrateScanDuplicateLeads"], helpers["insertQuotationRow"], helpers["invalidateAppSettingKey"], helpers["invalidatePipelinesAndStages"], helpers["invalidateRegions"], helpers["invalidateSources"], helpers["invalidateTenantUsageCache"], helpers["invokeCrmLeadsStageCountsRpc"], helpers["isAdminLike"], helpers["isAllowedLeadCommentAttachmentUrl"], helpers["isChotSanXuatCrmTaskTitle"], helpers["isCrmCompanyAdminUser"], helpers["isCrmDealAssigneeLocked"], helpers["isCrmLeadTypeColorMissingError"], helpers["isCrmModuleAdmin"], helpers["isCrmPipelinesTableMissingError"], helpers["isCrmRegionAdminUser"], helpers["isCrmSystemAdminUser"], helpers["isDealStageHoanThanhForZalo"], helpers["isDefaultAssigneeIdsColumnError"], helpers["isExecutorColumnError"], helpers["isPlatformAdmin"], helpers["isPostgresUniqueViolation"], helpers["isQuotationsSourceExcelColumnMissingError"], helpers["isSxRelationshipError"], helpers["isSystemAdmin"], helpers["isUuidString"], helpers["isValidDealZaloTemplateStructure"], helpers["isVcRelationshipError"], helpers["isVptCompanyCommercialDocViewer"], helpers["lastNominatimGeocodeAt"], helpers["leadChatFilesMulter"], helpers["leadChatJsonOrFiles"], helpers["listQuotationExcelSheets"], helpers["loadCrmTaskAttachmentCountMap"], helpers["loadOrgReportStageMap"], helpers["loadZaloLinkedLeadIdSet"], helpers["logDealActivityComment"], helpers["logDealDeadlineChangeComment"], helpers["logDealStageChangeComment"], helpers["logKanbanDeadlineUnifiedHistory"], helpers["logLeadCommentMentionActivity"], helpers["logProjectFileActivity"], helpers["mapCustomerOverviewRow"], helpers["mapLeadDisplayPhone"], helpers["mapQuotationItemsToOrderRows"], helpers["maskCustomerPhoneDisplay"], helpers["maskZaloAccessTokenPreview"], helpers["maybeSendZaloOnDealStageEnter"], helpers["mergeCrmStageDefaultAssigneeIntoUpdates"], helpers["mergeCustomerIntoTarget"], helpers["misaService"], helpers["multer"], helpers["nextCode"], helpers["nextTbProjectCode"], helpers["normalizeCrmActivityAttachments"], helpers["normalizeCrmLeadCommentAttachments"], helpers["normalizeCrmStageDefaultAssigneeUserId"], helpers["normalizeCrmUserRole"], helpers["normalizeLeadSeenByKeys"], helpers["normalizeOrgReportSurveyVisitRow"], helpers["normalizePipelineStageSlaDaysForDb"], helpers["normalizePipelineStagesList"], helpers["normalizeRegionIdList"], helpers["normalizeTemplateChecklistForCrmTask"], helpers["normalizeTemplateItemAssigneeIds"], helpers["normalizeTimestamp"], helpers["normalizeTitleFold"], helpers["normalizeVnPhoneTo84"], helpers["notifyDealCommentMentions"], helpers["notifyDealCommentParticipants"], helpers["notifyMultiple"], helpers["notifyMultipleShared"], helpers["notifyNewCrmAssignmentAssignees"], helpers["notifyProductionDocumentUploaded"], helpers["onLeadWon"], helpers["onOrderConfirmed"], helpers["onProjectCompleted"], helpers["onQuotationAccepted"], helpers["orgReportAttachFirstStageRates"], helpers["orgReportBumpFirstStageMetrics"], helpers["orgReportBumpMetrics"], helpers["orgReportBumpOpenOverdue"], helpers["orgReportBumpReceptionMetrics"], helpers["orgReportCancelRatePct"], helpers["orgReportClosedWonDealCount"], helpers["orgReportClosedWonValue"], helpers["orgReportCompareSummary"], helpers["orgReportConversionRate"], helpers["orgReportDayKey"], helpers["orgReportDealCloseValueRatePct"], helpers["orgReportDealCountsExpected"], helpers["orgReportDealIsClosedWon"], helpers["orgReportDealIsCompleted"], helpers["orgReportDealIsQuotedOrAfter"], helpers["orgReportDealProbability"], helpers["orgReportDealSplitBuckets"], helpers["orgReportExtendedDealMetrics"], helpers["orgReportFirstStageOnTimeRatePct"], helpers["orgReportFirstStageOverdueRatePct"], helpers["orgReportIsReceptionOverdue"], helpers["orgReportIsSlaOverdue"], helpers["orgReportKpiPeriodStart"], helpers["orgReportNumEst"], helpers["orgReportOverdueRatePct"], helpers["orgReportOwnerId"], helpers["orgReportPctDelta"], helpers["orgReportPreviousPeriod"], helpers["orgReportQuoteValueCloseRatePct"], helpers["orgReportQuoteWinRatePct"], helpers["orgReportReceptionOverdueRatePct"], helpers["orgReportReceptionSlaMinutes"], helpers["orgReportStageIsClosed"], helpers["orgReportStageIsLostOrCancelled"], helpers["orgReportTotalDealCount"], helpers["parseChecklist"], helpers["parseCrmLeadsPageRpc"], helpers["parseCrmReportDateRange"], helpers["parseCrmStageCountsNumericMap"], helpers["parseCrmStageCountsRpc"], helpers["parseExcelMoneyFromMappedColumn"], helpers["parseLeadIdUuidList"], helpers["parseLeadIdsCsvQuery"], helpers["parseLeadIdsFromBody"], helpers["parseLeadSeenByRaw"], helpers["parseQuotationExcelBuffer"], helpers["parseStageIdsFromQuery"], helpers["parseUuidArrayJsonb"], helpers["parseVietnameseMeasure"], helpers["parseVietnameseMoney"], helpers["path"], helpers["persistAssignmentNotification"], helpers["pgCrmDuplicateLeadIds"], helpers["pickDealZaloTemplatePayload"], helpers["pipeOrgOverviewReportPdf"], helpers["pipeStaffLeadDealSummaryPdf"], helpers["pipeStaffPipelineDetailPdf"], helpers["pipelineHasExplicitCompleted"], helpers["pipelineHasExplicitExpected"], helpers["pipelineHasExplicitWon"], helpers["plannerTableMissing"], helpers["postCrmStageDefaultAssigneeComment"], helpers["primaryTemplateItemAssigneeId"], helpers["rcInvalidateTags"], helpers["reactionsTableMissing"], helpers["redactCrmTaskNotesForViewer"], helpers["regionGeocodeInflight"], helpers["repairCrmDealPipelineDisplay"], helpers["requireUserCompanyId"], helpers["requireUserCompanyIdResolved"], helpers["resolveAssignmentIdForTask"], helpers["resolveCanonicalCrmLeadId"], helpers["resolveCommercialDocListCompanyScope"], helpers["resolveCrmBundleTemplateScope"], helpers["resolveCrmLeadsDeadlinesMap"], helpers["resolveCrmLeadsKanbanLite"], helpers["resolveCrmLeadsMergedQuery"], helpers["resolveCrmLeadsSkipDeadline"], helpers["resolveCrmLedgerNetByLeadIdsPayload"], helpers["resolveCrmReportScope"], helpers["resolveCrmTaskWriteLeadId"], helpers["resolveExecutorCompanyId"], helpers["resolveKanbanStagesForCompany"], helpers["resolveLeadCommentMentionIds"], helpers["resolveProductionCompanyForDealStage"], helpers["resolveProductionHandoverResponsibleUserId"], helpers["resolveReopenTargetStageId"], helpers["resolveRpcRegionIdsForCrmList"], helpers["resolveTenantIdForQuota"], helpers["resolveZaloDealTemplateId"], helpers["respondIfCrmPipelinesTableMissing"], helpers["responseCache"], helpers["restoreCrmTaskChecklistFromWorkshopTemplate"], helpers["resyncCrmPipelineTasksForLead"], helpers["sanitizeIsoDateQueryParam"], helpers["scheduleRegionGeocoding"], helpers["scopedAdminCompanyId"], helpers["scopedCrmCompanyIdForWrite"], helpers["sendZaloTemplateMessage"], helpers["setLeadFlag"], helpers["shallowMergeTemplateData"], helpers["skipSxWorkQuickComplete"], helpers["snapshotOrderRowFromQuotation"], helpers["stripCrmAssigneeFromWonStageUpdates"], helpers["stripCrmLeadTypeColorFromSelect"], helpers["stripQuotationsSourceExcelFields"], helpers["sumCrmKpiLedgerNetByLeadIds"], helpers["sumCrmKpiLedgerNetByUserForOrgReport"], helpers["sumCrmKpiLedgerNetByUserIds"], helpers["sumCrmKpiLedgerNetByUserIdsInDateRange"], helpers["supabase"], helpers["syncAllTaskArtifactsToAssignment"], helpers["syncChecklistItemNotes"], helpers["syncCrmLeadSxPipelineFromProject"], helpers["syncQuotationDepositToDealAndProject"], helpers["syncSxKanbanFromCrmProductionStage"], helpers["syncTaskAttachmentToAssignment"], helpers["templateItemAssigneePatch"], helpers["toCrmTaskChecklist"], helpers["unifyCrmLeadResponsibleFields"], helpers["updateCrmLeadTask"], helpers["updateQuotationRow"], helpers["upsertZaloNotifySettings"], helpers["userCanAccessCrmLeadAsParticipant"], helpers["userCanAccessCrmLeadViaVisibility"], helpers["userCanAssignAnyCrmRegion"], helpers["userCanBypassCrmDeleteRestriction"], helpers["userHasSeenLeadInSeenBy"], helpers["userIsAdmin"], helpers["userIsCrmCompanyOrRegionAdmin"], helpers["userMayAccessQuotationRow"], helpers["userSeesAllCrmDeals"], helpers["userSeesAllCrmDealsForScope"], helpers["userSeesAllCrmLeads"], helpers["userSeesAllCrmLeadsForScope"], helpers["uuidQueryOrNull"], helpers["validateProductionCompanyId"]);

module.exports = r;
