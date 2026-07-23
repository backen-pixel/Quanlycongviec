/**
 * CRM routes: crmTasks
 * Auto-extracted — handlers close over shared helpers via IIFE.
 */
const { Router } = require('express');
const helpers = require('../shared/helpersBundle');
const { maybeMirrorTaskAttachmentsToDrive } = require('../../../helpers/crmTaskAttachmentDriveUpload');

const r = Router();

(function (ALLOWED_DEADLINE_FIELDS, CRM_COMMENT_ALLOWED_REACTION_EMOJI, CRM_LEAD_KANBAN_LITE_SELECT, CRM_LEAD_LIST_SELECT, CRM_LEAD_LIST_SELECT_BASE, CRM_LEAD_LIST_SELECT_EXTRA, CRM_LEAD_REGION_EMBED, CRM_NEW_LEAD_MAX_AGE_MS, CRM_TASK_SELECT, CRM_UUID_RE, CUSTOMERS_IN_CHUNK, CUSTOMERS_OVERVIEW_NO_MATCH_ID, DEAL_PRE_CONTRACT_SLUGS_STAFF, DEAL_REPORT_BUCKET_VALUES, DEFAULT_CHECKLISTS, DEFAULT_DEADLINE_BUCKETS, DEFAULT_PIPELINE_STAGE_SLA_DAYS, FOLLOWUP_TIME_BUCKETS, PDFDocument, QUOTATIONS_SOURCE_EXCEL_COLS, Router, SCAN_DUP_LITE_SELECT, STAFF_LEAD_DEAL_REPORT_ROLES, SURVEY_EVENT_SELECT, SURVEY_EVENT_TYPES, XLSX, ZALO_APP_SETTING_KEY, crmSchemaCompat, addPhoneToAutoLeadBlocklist, aggregateCrmCommentReactions, aggregateOrgReportRows, appendFulfillmentChildTasksForMasterDeal, applyAllActiveWorkshopTemplatesForArea, applyAssigneesToInsertedCrmTasks, applyCrmLeadRegionFilterToQuery, applyCrmTaskTemplatesToCompanyRegions, applyCustomerIdInFilter, applyCustomersOverviewSearch, applyDefaultWorkshopTemplatesForNewProject, applyLeadOrCustomerSalesFilter, applyProductionTemplateToFulfillmentLead, applyProductionTemplatesOnPipelineEnter, applyStageIdFilterToQuery, applyWorkshopTemplateToProject, artifactNamePrefix, assertCanFlagLead, assertCategoryFitsSource, assertCrmAssigneeUserMatchesLeadCompany, assertCrmEmployeeDeleteAllowed, assertCrmStageAdvanceAllowed, assertDealCrmManualStageChange, assertDealResponsible, assertDivisionAllowedForCompany, assertLeadDocumentOwner, assertLeadReadableByRegionScope, assertRegionBelongsToCompany, assertUserCanAssignCrmRegion, assignProductionCompanyDealResponsibility, attachAssigneesToCrmTasks, attachAssignmentIdsToCrmTasks, attachCrmNextOpenTaskDeadline, attachLeadNewFlagForList, attachLeadReplyParents, attachLeadUserFlagsForList, auth, autoCreateProjectFromWonDeal, autoFlowFns, autoGenCrmTasksForNewLead, buildAssignmentNotificationInsert, buildChecklistLeadDocumentRow, buildCrmDashboardMinimalKpis, buildCrmLeadsRpcFilterParams, buildCustomersOverviewSummary, buildDealTemplateData, buildDefaultDeadlineConfig, buildFirstStageIdByPipeline, buildPipelineStagesMap, buildProcessedCommercialItems, buildQuotedStageOrderByPipeline, buildScanDuplicateGroups, buildWonStageOrderByPipeline, canUserViewDocByAllowlist, chatUpload, chunkArray, classifyDealStageForStaffReport, commentsTableMissing, companyRegionExtraColumnsMissing, companyRegionGeoColumnsMissing, computeCrmDashboardLightStats, computeCrmLiveVersionMs, computeCustomersOverviewSummary, computeIsNewLeadForUser, computeOrgOverviewReportData, computeStaffLeadDealReportData, computeStaffPipelineDetailPayload, countOpenOverdueCrmTasksForLeadIds, createCrmAssignment, createCrmLeadTask, createFulfillmentChildDeal, createNotif, createNotification, createProjectFromLead, crmExecutorFieldsFromTemplateItem, crmLeadCommentAttachmentsColumnMissing, crmLeadCommentReadReceiptsTableMissing, crmLeadRowVisibleToRequestUser, crmListUsesLegacyFilters, crmNoteActivityUpload, crmReportAsOfMs, crmReportCreatedAtFromIso, crmReportCreatedAtToIso, crmReportDayKeyVn, crmRouteErrorText, crmTaskDeadlineModuleKey, crmTaskMeetsCompletionRequirements, crmTaskMeetsRequiredFileTypes, crmTaskRequiresCompletionEvidence, crmTemplateMatchesLeadType, deadlineToDateOnlyIso, defaultCompanyInfo, defaultKpiLedgerMonthStartYmd, deleteCrmLeadTask, deleteMirroredAssignmentFileForTaskAttachment, duplicateLeadIdsFromLiteRows, ecosystemModuleKeyForCrmDeadline, effectivePipelineStageSlaDays, emitCrmBadgeUpdateForProject, emitCrmDashboardChanged, emitCrmTaskChanged, emptyStaffLeadDealAgg, endOfCalendarDayAfterEntered, enforceCommercialDocCompanyOnWrite, enforceQuotaForRequest, ensureDealLeadDocumentsForModuleTransition, ensureDefaultCrmPipelineForCompany, ensureMissingCrmTasksForLead, ensureMissingCrmTasksForPipelineStage, ensureMissingSxTasksForLead, excelUpload, executeLeadMerge, executeZaloDealStageNotify, fetchActivityCustomerIds, fetchAllLeadsForSlaWatchlist, fetchAssignmentForTask, fetchCrmCommentReactionsAggregate, fetchCrmLeadCommentNotifyUserIds, fetchCrmLeadDetailRow, fetchCrmLeadWithPipelineBadges, fetchCrmLeadsByIdsOrdered, fetchCrmLeadsForDashboardBatched, fetchCrmLeadsForOrgReportBatched, fetchCrmLeadsForUserDetailBatched, fetchCrmLeadsLiteForDuplicateScan, fetchCrmLeadsPageViaRpc, fetchCrmPipelineZaloSlice, fetchCrmSurveyEventsChunk, fetchCrmSurveyVisitsForOrgReport, fetchLeadCommentAudienceMembers, fetchLeadCommentAudienceMembersForRead, fetchLeadIdsForCrmRegion, fetchLeadMentionMembers, fetchOrgActivityFeed, fetchPipelineWithStagesById, fetchScopedCrmBundles, fillTemplateDataFromStructure, filterCrmTasksForLeadType, filterUserIdsForCrmLeadScopedNotification, findChecklistItem, followupDismissExpiresAt, fontBold, fontRegular, formatMoney, formatVNDPdf, formatVnPhoneLocal0From84, fs, generateDocPdf, generateFlowTasks, generateStepTasks, getAppSettingValue, getCompanyInfo, getCompanyRegionsList, getCrmLeadListSelect, getCrmLeadRegionConstraint, getCrmLeadTypesList, getCrmLeadsListLegacy, getCrmSourceCategoriesList, getCrmSourcesList, getDefaultCrmAttachmentShare, getDefaultDealZaloTemplateStructure, getDefaultLeadDocumentShareForDeal, getDefaultPipelineIdForCompany, getLeadDocumentFieldsFromCrmTask, getNotifyTargets, getOverdueFollowUps, getPipelineIdForCompanyRegion, getPipelineZaloSlice, getPipelinesList, getProjectCRMSummary, getStagesByPipelineId, getStaleLeads, getZaloNotifySettings, hydrateCrmLeadsByIdsWithStaff, hydrateCrmLeadsRpcPage, hydrateScanDuplicateLeads, insertQuotationRow, invalidateAppSettingKey, invalidatePipelinesAndStages, invalidateRegions, invalidateSources, invalidateTenantUsageCache, invokeCrmLeadsStageCountsRpc, isAdminLike, isAllowedLeadCommentAttachmentUrl, isChotSanXuatCrmTaskTitle, isCrmCompanyAdminUser, isCrmDealAssigneeLocked, isCrmLeadTypeColorMissingError, isCrmModuleAdmin, isCrmPipelinesTableMissingError, isCrmRegionAdminUser, isCrmSystemAdminUser, isDealStageHoanThanhForZalo, isDefaultAssigneeIdsColumnError, isExecutorColumnError, isPlatformAdmin, isPostgresUniqueViolation, isQuotationsSourceExcelColumnMissingError, isSxRelationshipError, isSystemAdmin, isUuidString, isValidDealZaloTemplateStructure, isVcRelationshipError, isVptCompanyCommercialDocViewer, lastNominatimGeocodeAt, leadChatFilesMulter, leadChatJsonOrFiles, listQuotationExcelSheets, loadCrmTaskAttachmentCountMap, loadOrgReportStageMap, loadZaloLinkedLeadIdSet, logDealActivityComment, logDealDeadlineChangeComment, logDealStageChangeComment, logKanbanDeadlineUnifiedHistory, logLeadCommentMentionActivity, logProjectFileActivity, mapCustomerOverviewRow, mapLeadDisplayPhone, mapQuotationItemsToOrderRows, maskCustomerPhoneDisplay, maskZaloAccessTokenPreview, maybeSendZaloOnDealStageEnter, mergeCrmStageDefaultAssigneeIntoUpdates, mergeCustomerIntoTarget, misaService, multer, nextCode, nextTbProjectCode, normalizeCrmActivityAttachments, normalizeCrmLeadCommentAttachments, normalizeCrmStageDefaultAssigneeUserId, normalizeCrmUserRole, normalizeLeadSeenByKeys, normalizeOrgReportSurveyVisitRow, normalizePipelineStageSlaDaysForDb, normalizePipelineStagesList, normalizeRegionIdList, normalizeTemplateChecklistForCrmTask, normalizeTemplateItemAssigneeIds, normalizeTimestamp, normalizeTitleFold, normalizeVnPhoneTo84, notifyDealCommentMentions, notifyDealCommentParticipants, notifyMultiple, notifyMultipleShared, notifyNewCrmAssignmentAssignees, notifyProductionDocumentUploaded, onLeadWon, onOrderConfirmed, onProjectCompleted, onQuotationAccepted, orgReportAttachFirstStageRates, orgReportBumpFirstStageMetrics, orgReportBumpMetrics, orgReportBumpOpenOverdue, orgReportBumpReceptionMetrics, orgReportCancelRatePct, orgReportClosedWonDealCount, orgReportClosedWonValue, orgReportCompareSummary, orgReportConversionRate, orgReportDayKey, orgReportDealCloseValueRatePct, orgReportDealCountsExpected, orgReportDealIsClosedWon, orgReportDealIsCompleted, orgReportDealIsQuotedOrAfter, orgReportDealProbability, orgReportDealSplitBuckets, orgReportExtendedDealMetrics, orgReportFirstStageOnTimeRatePct, orgReportFirstStageOverdueRatePct, orgReportIsReceptionOverdue, orgReportIsSlaOverdue, orgReportKpiPeriodStart, orgReportNumEst, orgReportOverdueRatePct, orgReportOwnerId, orgReportPctDelta, orgReportPreviousPeriod, orgReportQuoteValueCloseRatePct, orgReportQuoteWinRatePct, orgReportReceptionOverdueRatePct, orgReportReceptionSlaMinutes, orgReportStageIsClosed, orgReportStageIsLostOrCancelled, orgReportTotalDealCount, parseChecklist, parseCrmLeadsPageRpc, parseCrmReportDateRange, parseCrmStageCountsNumericMap, parseCrmStageCountsRpc, parseExcelMoneyFromMappedColumn, parseLeadIdUuidList, parseLeadIdsCsvQuery, parseLeadIdsFromBody, parseLeadSeenByRaw, parseQuotationExcelBuffer, parseStageIdsFromQuery, parseUuidArrayJsonb, parseVietnameseMeasure, parseVietnameseMoney, path, persistAssignmentNotification, pgCrmDuplicateLeadIds, pickDealZaloTemplatePayload, pipeOrgOverviewReportPdf, pipeStaffLeadDealSummaryPdf, pipeStaffPipelineDetailPdf, pipelineHasExplicitCompleted, pipelineHasExplicitExpected, pipelineHasExplicitWon, plannerTableMissing, postCrmStageDefaultAssigneeComment, primaryTemplateItemAssigneeId, rcInvalidateTags, reactionsTableMissing, redactCrmTaskNotesForViewer, regionGeocodeInflight, repairCrmDealPipelineDisplay, requireUserCompanyId, requireUserCompanyIdResolved, resolveAssignmentIdForTask, resolveCanonicalCrmLeadId, resolveCommercialDocListCompanyScope, resolveCrmBundleTemplateScope, resolveCrmLeadsDeadlinesMap, resolveCrmLeadsKanbanLite, resolveCrmLeadsMergedQuery, resolveCrmLeadsSkipDeadline, resolveCrmLedgerNetByLeadIdsPayload, resolveCrmReportScope, resolveCrmTaskWriteLeadId, resolveExecutorCompanyId, resolveKanbanStagesForCompany, resolveLeadCommentMentionIds, resolveProductionCompanyForDealStage, resolveProductionHandoverResponsibleUserId, resolveReopenTargetStageId, resolveRpcRegionIdsForCrmList, resolveTenantIdForQuota, resolveZaloDealTemplateId, respondIfCrmPipelinesTableMissing, responseCache, restoreCrmTaskChecklistFromWorkshopTemplate, resyncCrmPipelineTasksForLead, sanitizeIsoDateQueryParam, scheduleRegionGeocoding, scopedAdminCompanyId, scopedCrmCompanyIdForWrite, sendZaloTemplateMessage, setLeadFlag, shallowMergeTemplateData, skipSxWorkQuickComplete, snapshotOrderRowFromQuotation, stripCrmAssigneeFromWonStageUpdates, stripCrmLeadTypeColorFromSelect, stripQuotationsSourceExcelFields, sumCrmKpiLedgerNetByLeadIds, sumCrmKpiLedgerNetByUserForOrgReport, sumCrmKpiLedgerNetByUserIds, sumCrmKpiLedgerNetByUserIdsInDateRange, supabase, syncAllTaskArtifactsToAssignment, syncChecklistItemNotes, syncCrmLeadSxPipelineFromProject, syncQuotationDepositToDealAndProject, syncSxKanbanFromCrmProductionStage, syncTaskAttachmentToAssignment, templateItemAssigneePatch, toCrmTaskChecklist, unifyCrmLeadResponsibleFields, updateCrmLeadTask, updateQuotationRow, upsertZaloNotifySettings, userCanAccessCrmLeadAsParticipant, userCanAccessCrmLeadViaVisibility, userCanAssignAnyCrmRegion, userCanBypassCrmDeleteRestriction, userHasSeenLeadInSeenBy, userIsAdmin, userIsCrmCompanyOrRegionAdmin, userMayAccessQuotationRow, userSeesAllCrmDeals, userSeesAllCrmDealsForScope, userSeesAllCrmLeads, userSeesAllCrmLeadsForScope, uuidQueryOrNull, validateProductionCompanyId) {
r.post('/leads/:id/tasks/:taskId/import-quotation-excel', excelUpload.single('file'), async (req, res) => {
  try {
    const { id: leadId, taskId } = req.params;
    if (!req.file) return res.status(400).json({ error: 'Chưa chọn file' });

    // 1. Verify task exists and belongs to this lead
    const { data: task, error: taskErr } = await supabase.from('crm_tasks')
      .select('id, title, stage_slug, status, lead_id')
      .eq('id', taskId).eq('lead_id', leadId).single();
    if (taskErr || !task) return res.status(404).json({ error: 'Không tìm thấy nhiệm vụ' });

    // 2. Get lead info (customer_id, type) + parent linkage (Đơn 1/2/3)
    const { data: lead } = await supabase.from('crm_leads')
      .select('id, type, customer_id, title, project_id, estimated_value, parent_lead_id, code')
      .eq('id', leadId).single();
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy lead/deal' });

    // Resolve "đơn theo đợt" context (nếu đang import từ deal con của Đơn 1/2/3)
    let masterLeadId = lead.id;
    let fulfillmentLeadId = null;
    let fulfillmentLabel = null;
    if (lead.parent_lead_id) {
      masterLeadId = lead.parent_lead_id;
      fulfillmentLeadId = lead.id;
      try {
        const { data: ord } = await supabase
          .from('orders')
          .select('display_label')
          .eq('fulfillment_lead_id', lead.id)
          .limit(1)
          .maybeSingle();
        fulfillmentLabel = ord?.display_label || null;
      } catch (_) {}
    }

    // 3. Parse Excel — call internal parse logic
    const XLSX = require('xlsx');
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!rows.length) return res.status(400).json({ error: 'File rỗng' });

    // Forward to parse-excel logic via internal HTTP call (reuse same endpoint)
    const parseRes = await new Promise((resolve, reject) => {
      const mockReq = { file: req.file, user: req.user };
      const mockRes = {
        _data: null, _status: 200,
        status(s) { this._status = s; return this; },
        json(d) { this._data = d; if (this._status >= 400) reject(new Error(d.error || 'Parse error')); else resolve(d); },
      };
      // We can't easily call the route handler directly, so use the API
      // Instead, just do a fetch to ourselves — simpler: use axios/api
      // Actually simplest: just forward the file to /crm/quotations/parse-excel
      const FormData = require('form-data');
      const fd = new FormData();
      fd.append('file', req.file.buffer, { filename: req.file.originalname, contentType: req.file.mimetype });
      const axios = require('axios');
      const port = process.env.PORT || 3000;
      axios.post(`http://localhost:${port}/api/crm/quotations/parse-excel`, fd, {
        headers: { ...fd.getHeaders(), authorization: req.headers.authorization },
        maxContentLength: 20 * 1024 * 1024,
      }).then(r => resolve(r.data)).catch(e => reject(new Error(e.response?.data?.error || e.message)));
    });

    if (!parseRes.items?.length) return res.status(400).json({ error: 'Không tìm thấy sản phẩm trong file Excel' });

    // 4. Build quotation payload from parsed data
    // ── Excel fidelity: đọc THẲNG % / số tiền chiết khấu theo dòng khi Excel có cột riêng
    // (row_discount_percent / row_discount_amount, xem quotationExcelParser.js) — không suy luận
    // lại từ tỉ lệ Thành tiền. Chỉ fallback khi Excel không có cột chiết khấu rõ ràng theo dòng.
    // Cũng khoá luôn Thành tiền (imported_amount/lock_amount) theo giá trị Excel gốc.
    const items = parseRes.items.filter(i => !i.is_group).map(i => {
      const qty = i.quantity || 1;
      const price = i.unit_price || 0;
      const excelAmount = i.amount || 0;
      let specFactor = 0, itemDiscount = 0;

      if (i.is_freebie) {
        return { name: i.name, description: i.description || '', unit: i.unit || 'bộ', quantity: qty, unit_price: 0, spec_factor: 0, discount_percent: 0, vat_rate: 0, height: i.height || '', width: i.width || '', length: i.length || '', dimensions: [i.length, i.width, i.height].filter(Boolean).join(' x ') || '', group_name: i.group_name || '', notes: 'HỖ TRỢ', imported_amount: 0, lock_amount: true };
      }

      const rowPct = i.row_discount_percent || 0;
      const rowAmt = i.row_discount_amount || 0;
      if (rowPct > 0) {
        itemDiscount = rowPct;
      } else if (rowAmt > 0 && qty > 0 && price > 0) {
        itemDiscount = Math.round((rowAmt / (qty * price)) * 10000) / 100;
      } else if (price > 0 && qty > 0 && excelAmount > 0) {
        const rawRatio = excelAmount / (qty * price);
        if (rawRatio > 1.005) specFactor = Math.round(rawRatio * 1000) / 1000;
        else if (rawRatio < 0.995) {
          const impliedCK = Math.round((1 - rawRatio) * 10000) / 100;
          const headerCK = i.group_discount_percent || 0;
          itemDiscount = (headerCK > 0 && Math.abs(impliedCK - headerCK) < 1) ? headerCK : impliedCK;
        }
      }

      return {
        name: i.name, description: i.description || '', unit: i.unit || 'bộ', quantity: qty, unit_price: price,
        spec_factor: specFactor, discount_percent: itemDiscount, vat_rate: i.vat_rate || 0,
        height: i.height || '', width: i.width || '', length: i.length || '',
        dimensions: [i.length, i.width, i.height].filter(Boolean).join(' x ') || '',
        group_name: i.group_name || '', notes: i.notes || '',
        imported_amount: excelAmount > 0 ? excelAmount : null,
        lock_amount: excelAmount > 0,
        imported_discount_amount: rowAmt > 0 ? rowAmt : null,
      };
    });

    // Compute discount
    const itemsGrossTotal = items.reduce((s, i) => {
      if (i.lock_amount && typeof i.imported_amount === 'number') return s + i.imported_amount;
      const f = parseFloat(i.spec_factor) || 0;
      const gross = f > 0 ? f * (i.quantity || 1) * (i.unit_price || 0) : (i.quantity || 1) * (i.unit_price || 0);
      return s + (gross - gross * (i.discount_percent || 0) / 100);
    }, 0);
    const excelGrandTotal = parseRes.summary?.total || 0;
    const computedDiscount = (excelGrandTotal > 0 && itemsGrossTotal > excelGrandTotal)
      ? Math.round(itemsGrossTotal - excelGrandTotal)
      : (parseRes.summary?.discount_amount || 0);

    // Get customer info
    let customerName = parseRes.customer_name || '';
    let customerPhone = parseRes.customer_phone || '';
    let customerAddress = parseRes.customer_address || '';
    let customerId = lead.customer_id;

    // If lead has customer_id, get customer info
    if (customerId) {
      const { data: cust } = await supabase.from('customers').select('full_name, phone, address').eq('id', customerId).single();
      if (cust) {
        customerName = customerName || cust.full_name || '';
        customerPhone = customerPhone || cust.phone || '';
        customerAddress = customerAddress || cust.address || '';
      }
    }

    const notesParts = [];
    if (parseRes.kts_info) notesParts.push(`KT Phụ trách: ${parseRes.kts_info}`);
    if (parseRes.notes) notesParts.push(parseRes.notes);
    const sumImp = parseRes.summary;
    if (sumImp?.deposit_amount > 0) {
      const rsDep = sumImp.deposit_received === true ? 'Đã nhận'
        : sumImp.deposit_received === false ? 'Chưa nhận' : '';
      notesParts.push(
        `Cọc: ${formatMoney(sumImp.deposit_amount)}${rsDep ? ` — ${rsDep}` : ''}${sumImp.deposit_label ? `\n${sumImp.deposit_label}` : ''}`,
      );
    }
    if (sumImp?.remaining_note || (sumImp?.remaining_amount != null && sumImp.remaining_amount > 0)) {
      notesParts.push(
        `Còn lại: ${sumImp.remaining_note || '—'}${sumImp.remaining_amount > 0 ? ` (${formatMoney(sumImp.remaining_amount)})` : ''}`,
      );
    }
    notesParts.push(`📋 Import từ task: ${task.title}`);
    if (fulfillmentLabel) notesParts.push(`🧾 Thuộc: ${fulfillmentLabel} (Deal/Lead: ${lead.code || lead.id})`);
    if (lead.parent_lead_id) notesParts.push(`🎯 Deal/Lead gốc: ${masterLeadId}`);

    // 4b. Liên kết product_id theo tên — KHÔNG cập nhật giá, KHÔNG tạo mới
    const syncedProducts = [];
    try {
      for (const item of items) {
        if (!item.name || item.name.trim().length < 3) continue;
        const nameSearch = item.name.trim().toLowerCase();
        const { data: existing } = await supabase.from('products')
          .select('id, name')
          .ilike('name', `%${nameSearch}%`)
          .limit(1);
        if (existing?.length) {
          item.product_id = existing[0].id;
          syncedProducts.push({ name: item.name, product_id: existing[0].id });
        }
        // Không tìm thấy → giữ nguyên item, không tạo mới
      }
      console.log('[TASK-IMPORT] Product link:', syncedProducts.length, 'items linked');
    } catch (e) { console.warn('[TASK-IMPORT] Product link error:', e.message); }

    // 5. Lưu file Excel gốc lên storage (mở lại từ chi tiết deal / báo giá)
    let sourceExcelFileUrl = null;
    const sourceExcelFileName = req.file.originalname || 'bao-gia.xlsx';
    try {
      const FormData = require('form-data');
      const fdUp = new FormData();
      fdUp.append('files', req.file.buffer, {
        filename: req.file.originalname,
        contentType: req.file.mimetype,
      });
      const axiosUp = require('axios');
      const portUp = process.env.PORT || 3000;
      const upRes = await axiosUp.post(`http://localhost:${portUp}/api/upload`, fdUp, {
        headers: { ...fdUp.getHeaders(), authorization: req.headers.authorization },
        maxContentLength: 20 * 1024 * 1024,
      });
      sourceExcelFileUrl = upRes.data?.files?.[0]?.file_url || null;
    } catch (upErr) {
      console.warn('[TASK-IMPORT] Excel file upload:', upErr.message);
    }

    // 6. Create quotation via internal POST /crm/quotations
    const axios = require('axios');
    const port = process.env.PORT || 3000;
    const sumPost = parseRes.summary || {};
    const { data: quote } = await axios.post(`http://localhost:${port}/api/crm/quotations`, {
      title: parseRes.title || req.file.originalname.replace(/\.(xlsx?|xls)$/i, '') || `Báo giá ${customerName}`.trim(),
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_address: customerAddress,
      customer_id: customerId || '',
      lead_id: masterLeadId,
      fulfillment_lead_id: fulfillmentLeadId || '',
      fulfillment_label: fulfillmentLabel || null,
      source_task_id: task.id,
      items,
      discount_type: 'amount',
      discount_value: computedDiscount,
      notes: notesParts.join('\n\n'),
      payment_terms: 'Thanh toán 50% khi ký HĐ, 50% khi bàn giao',
      deposit_amount: sumPost.deposit_amount > 0 ? sumPost.deposit_amount : null,
      deposit_received: sumPost.deposit_received === true || sumPost.deposit_received === false ? sumPost.deposit_received : null,
      deposit_label: sumPost.deposit_label || null,
      remaining_amount: sumPost.remaining_amount > 0 ? sumPost.remaining_amount : null,
      remaining_note: sumPost.remaining_note || null,
      source_excel_file_url: sourceExcelFileUrl,
      source_excel_file_name: sourceExcelFileName,
    }, { headers: { authorization: req.headers.authorization } });

    // 7. Force-complete this specific task (in case auto-complete didn't match)
    if (task.status !== 'completed') {
      await supabase.from('crm_tasks').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        notes: (task.notes ? task.notes + '\n\n' : '') + `✅ Đã tạo báo giá ${quote.code} (${formatMoney(quote.total)})\n📎 /crm/quotations/${quote.id}`,
        updated_at: new Date().toISOString(),
      }).eq('id', taskId);
    }

    // 7. Sync estimated_value + cọc vào lead đang xem (+ dự án nếu có)
    if (quote.total > 0) {
      await supabase.from('crm_leads').update({
        estimated_value: quote.total,
        updated_at: new Date().toISOString(),
      }).eq('id', leadId);
    }
    try {
      await syncQuotationDepositToDealAndProject(quote, leadId);
    } catch (depErr) {
      console.warn('[TASK-IMPORT] Sync deposit error:', depErr.message);
    }

    // 8. Sync customer
    if (customerId && quote.total > 0) {
      try {
        const { data: allQuotes } = await supabase.from('quotations')
          .select('total').eq('customer_id', customerId)
          .in('status', ['draft', 'sent', 'accepted', 'converted']);
        const totalVal = (allQuotes || []).reduce((s, q) => s + (q.total || 0), 0);
        await supabase.from('customers').update({
          last_quotation_amount: quote.total,
          last_quotation_at: new Date().toISOString(),
          total_quotation_value: totalVal,
          updated_at: new Date().toISOString(),
        }).eq('id', customerId);
      } catch (e) { console.warn('[TASK-IMPORT] Sync customer error:', e.message); }
    }

    res.json({
      quotation_id: quote.id,
      quotation_code: quote.code,
      total: quote.total,
      item_count: items.length,
      task_completed: true,
      customer_updated: !!customerId,
      synced_products: syncedProducts,
    });
  } catch (e) {
    console.error('[TASK-IMPORT-EXCEL]', e);
    res.status(500).json({ error: e.message || 'Lỗi import Excel' });
  }
});

r.get('/leads/:id/tasks', async (req, res) => {
  try {
    const taskScope = String(req.query?.task_scope || 'all').toLowerCase();
    let { data, error } = await supabase.from('crm_tasks')
      .select(CRM_TASK_SELECT)
      .eq('lead_id', req.params.id)
      .order('stage_slug').order('order_index');
    if (error) throw error;

    const { data: lead } = await supabase.from('crm_leads')
      .select('type, created_by, parent_lead_id, use_order_tasks, pipeline_id, company_id, stage_id, project_id')
      .eq('id', req.params.id)
      .maybeSingle();

    data = await appendFulfillmentChildTasksForMasterDeal(req.params.id, data || [], lead);

    if (lead) {
      data = filterCrmTasksForLeadType(data, lead.type);
    }

    let ownerCompanyId = String(req.query?.owner_company_id || '').trim() || null;
    if (!ownerCompanyId && lead?.project_id) {
      const { data: projOwnerEarly } = await supabase
        .from('projects')
        .select('company_id')
        .eq('id', lead.project_id)
        .maybeSingle();
      ownerCompanyId = projOwnerEarly?.company_id || null;
    }

    // Đếm số file + ghi chú cho mỗi task (RPC GROUP BY — tránh timeout khi nhiều đính kèm)
    if (data?.length) {
      const taskIds = data.map((t) => t.id);
      const countMap = await loadCrmTaskAttachmentCountMap(supabase, taskIds);
      data = data.map((t) => ({
        ...t,
        file_count: countMap[t.id]?.files || 0,
        note_count: countMap[t.id]?.notes || 0,
        attachment_count: (countMap[t.id]?.files || 0) + (countMap[t.id]?.notes || 0),
      }));
    }

    // Phân tách nhiệm vụ theo module:
    // - production: chỉ task SX (stage_slug bắt đầu sx_)
    // - logistics: chỉ task VC (stage_slug bắt đầu vc_ / metadata logistics)
    // - crm: ẩn task SX (dùng cho tab VC web — nhiệm vụ deal không lẫn sx_*)
    if (taskScope === 'production') {
      data = (data || []).filter((t) => String(t.stage_slug || '').startsWith('sx_') || t.production_pipeline_stage_id);
      const workshopTypeId = String(req.query?.workshop_type_id || '').trim() || null;
      if (workshopTypeId) {
        const { getProductionPipelineStagesForWorkshopType, filterSxTasksToWorkshopPipeline } = require('../../../helpers/sxPipelineStageSlug');
        let sxCompanyId = ownerCompanyId || lead?.company_id || null;
        if (lead?.project_id) {
          const { data: projSx } = await supabase
            .from('projects')
            .select('company_id')
            .eq('id', lead.project_id)
            .maybeSingle();
          sxCompanyId = projSx?.company_id || sxCompanyId;
        }
        const stages = await getProductionPipelineStagesForWorkshopType(sxCompanyId, workshopTypeId);
        data = filterSxTasksToWorkshopPipeline(data, stages);
      } else if (lead?.project_id) {
        const { data: proj } = await supabase
          .from('projects')
          .select('workshop_type_id, company_id')
          .eq('id', lead.project_id)
          .maybeSingle();
        if (proj?.workshop_type_id) {
          const { getProductionPipelineStagesForWorkshopType, filterSxTasksToWorkshopPipeline } = require('../../../helpers/sxPipelineStageSlug');
          const stages = await getProductionPipelineStagesForWorkshopType(
            proj.company_id || lead.company_id,
            proj.workshop_type_id,
          );
          data = filterSxTasksToWorkshopPipeline(data, stages);
        }
      }
    } else if (taskScope === 'logistics') {
      const all = data || [];
      const vcOnly = all.filter((t) => {
        const slug = String(t.stage_slug || '');
        if (slug.startsWith('vc_')) return true;
        const meta = t.metadata && typeof t.metadata === 'object' ? t.metadata : {};
        return meta.workshop_module === 'logistics' || meta.workshop_area === 'logistics';
      });
      // Fallback: chưa có task vc_* trên deal → giống web VC (ẩn sx_*)
      data = vcOnly.length ? vcOnly : all.filter((t) => !String(t.stage_slug || '').startsWith('sx_'));

      // Bộ nhiệm vụ VC/LĐ trên bảng `tasks` (workshop) — hiển thị cùng UI CRMTasksTab
      if (lead?.project_id) {
        try {
          const { loadWorkshopLogisticsTasksForCrmLead } = require('../../../helpers/workshopProjectTasksForCrm');
          const wsRows = await loadWorkshopLogisticsTasksForCrmLead(req.params.id, lead.project_id);
          if (wsRows.length) {
            const nativeVc = (data || []).filter((t) => !t._workshop_project_task);
            const hasNativeVc = nativeVc.some((t) => String(t.stage_slug || '').startsWith('vc_'));
            data = hasNativeVc ? [...nativeVc, ...wsRows] : wsRows;
          }
        } catch (wsErr) {
          console.warn('[crm/leads/:id/tasks] workshop logistics:', wsErr.message);
        }
      }
    } else if (taskScope === 'crm') {
      data = (data || []).filter((t) => !String(t.stage_slug || '').startsWith('sx_'));
    }

    const { filterCrmTasksByCompanyScope, sanitizeTasksForSharedWorkspace } = require('../../../helpers/crossCompanyWorkspace');
    const taskCompanyScope = String(req.query?.task_company_scope || 'own').toLowerCase();
    if (!ownerCompanyId && lead?.project_id) {
      const { data: projOwner } = await supabase
        .from('projects')
        .select('company_id')
        .eq('id', lead.project_id)
        .maybeSingle();
      ownerCompanyId = projOwner?.company_id || null;
    }
    data = filterCrmTasksByCompanyScope(data, {
      scope: taskCompanyScope,
      userCompanyId: req.user?.company_id || null,
      leadCompanyId: lead?.company_id || null,
      ownerCompanyId,
    });
    if (taskCompanyScope === 'shared') {
      data = sanitizeTasksForSharedWorkspace(data, ownerCompanyId);
    }

    if (data?.length) {
      data = await attachAssigneesToCrmTasks(data);
      data = await attachAssignmentIdsToCrmTasks(data);
    }

    data = (data || []).map((t) => redactCrmTaskNotesForViewer(req.user, t));

    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/leads/:id/tasks/resync-pipeline', async (req, res) => {
  try {
    const { data: leadRow } = await supabase
      .from('crm_leads')
      .select('id, company_id, region_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!leadRow) return res.status(404).json({ error: 'Lead/deal không tồn tại' });

    const regionCheck = assertLeadReadableByRegionScope(req, leadRow);
    if (!regionCheck.ok) return res.status(403).json({ error: regionCheck.error });

    const result = await resyncCrmPipelineTasksForLead(req.params.id, req.user?.userId, req);
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/leads/:id/tasks/ensure-missing', async (req, res) => {
  try {
    const { data: leadRow } = await supabase
      .from('crm_leads')
      .select('id, company_id, region_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!leadRow) return res.status(404).json({ error: 'Lead/deal không tồn tại' });

    const regionCheck = assertLeadReadableByRegionScope(req, leadRow);
    if (!regionCheck.ok) return res.status(403).json({ error: regionCheck.error });

    const pipelineStageId = req.body?.pipeline_stage_id || null;
    const allStages = !!req.body?.all_stages;

    const result = await ensureMissingCrmTasksForLead({
      leadId: req.params.id,
      userId: req.user?.userId,
      req,
      pipelineStageId,
      allStages,
    });
    if (!result.ok) return res.status(400).json(result);

    if (result.created > 0) {
      await emitCrmTaskChanged(req, {
        leadId: req.params.id,
        action: 'bulk_created',
        count: result.created,
      });
    }

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/leads/:id/tasks/ensure-missing-sx', async (req, res) => {
  try {
    const targetLeadId = await resolveCrmTaskWriteLeadId(req.params.id);
    const { data: leadRow } = await supabase
      .from('crm_leads')
      .select('id, type, company_id, region_id, sx_template_company_id, project_id')
      .eq('id', targetLeadId)
      .maybeSingle();
    if (!leadRow) return res.status(404).json({ error: 'Deal không tồn tại' });
    if (leadRow.type !== 'deal') return res.status(400).json({ error: 'Chỉ áp dụng cho deal' });

    const regionCheck = assertLeadReadableByRegionScope(req, leadRow);
    if (!regionCheck.ok) return res.status(403).json({ error: regionCheck.error });

    let templateSourceCompanyId = null;
    const bodyPc = req.body?.production_company_id;
    if (bodyPc != null && String(bodyPc).trim() !== '') {
      const vPc = await validateProductionCompanyId(bodyPc);
      if (!vPc.ok) return res.status(400).json({ error: vPc.error, requires_production_company: true });
      templateSourceCompanyId = vPc.company.id;
    } else if (leadRow.sx_template_company_id) {
      const vStored = await validateProductionCompanyId(leadRow.sx_template_company_id);
      if (vStored.ok) templateSourceCompanyId = vStored.company.id;
    }

    if (templateSourceCompanyId && leadRow.project_id) {
      const { data: projRow } = await supabase
        .from('projects')
        .select('workshop_type_id, company_id')
        .eq('id', leadRow.project_id)
        .maybeSingle();
      const { applyWorkshopTypeDefaultStaffToProject } = require('../../../helpers/productionWorkshopTypeStaff');
      try {
        await applyWorkshopTypeDefaultStaffToProject(
          leadRow.project_id,
          projRow?.company_id || templateSourceCompanyId,
          projRow?.workshop_type_id || null,
        );
      } catch (staffErr) {
        console.warn('[crm/ensure-sx] apply default staff:', staffErr.message);
      }
    }

    const result = await ensureMissingSxTasksForLead({
      leadId: targetLeadId,
      userId: req.user?.userId,
      req,
      templateSourceCompanyId,
      dealCompanyId: leadRow.company_id || null,
      pipelineStageId: req.body?.pipeline_stage_id || null,
      allPipelineStages: req.body?.all_stages !== false,
    });
    if (!result.ok) return res.status(400).json(result);

    if (result.created > 0) {
      await emitCrmTaskChanged(req, {
        leadId: targetLeadId,
        action: 'bulk_created',
        count: result.created,
      });
    }

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/leads/:id/tasks', async (req, res) => {
  try {
    const result = await createCrmLeadTask(req, req.params.id, req.body);
    if (result.error) return res.status(result.status || 500).json({ error: result.error });
    // Idempotent replay: không emit realtime / không ghi activity trùng
    if (!result.idempotent) {
      await emitCrmTaskChanged(req, {
        leadId: req.params.id,
        taskId: result.data?.id,
        action: 'created',
        task: result.data,
      });
      try {
        const { data: _actor } = await supabase.from('users').select('full_name').eq('id', req.user.userId).maybeSingle();
        await logDealActivityComment(req, {
          leadId: req.params.id,
          body: `📋 ${_actor?.full_name || 'Người dùng'} đã tạo nhiệm vụ «${result.data?.title || req.body.title || 'Không tên'}».`,
        });
      } catch (_) {}
    }
    return res.status(result.status).json(result.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/leads/:id/tasks/from-template', async (req, res) => {
  try {
    const { template_id } = req.body;
    const { data: items } = await supabase.from('crm_task_template_items')
      .select('*').eq('template_id', template_id).order('order_index');
    if (!items?.length) return res.status(400).json({ error: 'Bộ mẫu trống' });

    // Get template for stage_slug + pipeline_stage_id
    const { data: tpl } = await supabase.from('crm_task_templates')
      .select('stage_slug, pipeline_stage_id').eq('id', template_id).single();

    const targetLeadId = await resolveCrmTaskWriteLeadId(req.params.id);
    const { data: leadRow } = await supabase
      .from('crm_leads')
      .select('stage_id, company_id')
      .eq('id', targetLeadId)
      .maybeSingle();
    const ownerCompanyId = leadRow?.company_id || null;
    const stageForTasks = tpl?.pipeline_stage_id || leadRow?.stage_id || null;

    // 1) Dedupe trong chính items của template (chống item bị thêm trùng do user)
    const seenItemKeys = new Set();
    const dedupItems = [];
    for (const item of items) {
      const k = String(item.title || '').trim().toLowerCase();
      if (!k || seenItemKeys.has(k)) continue;
      seenItemKeys.add(k);
      dedupItems.push(item);
    }

    // 2) Lấy danh sách title đã tồn tại trên lead này trong cùng stage → bỏ qua khi insert
    let existingTitleKeys = new Set();
    {
      let q = supabase
        .from('crm_tasks')
        .select('title, stage_slug, pipeline_stage_id')
        .eq('lead_id', targetLeadId);
      // Khoá stage giống lúc insert: ưu tiên pipeline_stage_id, fallback stage_slug
      if (stageForTasks) {
        q = q.eq('pipeline_stage_id', stageForTasks);
      } else if (tpl?.stage_slug) {
        q = q.is('pipeline_stage_id', null).eq('stage_slug', tpl.stage_slug);
      }
      const { data: existingRows } = await q;
      existingTitleKeys = new Set(
        (existingRows || []).map((t) => String(t.title || '').trim().toLowerCase()).filter(Boolean),
      );
    }

    const toInsert = dedupItems.filter(
      (item) => !existingTitleKeys.has(String(item.title || '').trim().toLowerCase()),
    );

    const skipped = dedupItems.length - toInsert.length;
    if (skipped > 0) {
      console.log(
        `[from-template] lead=${targetLeadId} stage=${stageForTasks || tpl?.stage_slug || '?'} `
        + `tpl=${template_id}: bỏ qua ${skipped}/${dedupItems.length} item đã tồn tại.`,
      );
    }

    if (!toInsert.length) {
      return res.status(200).json({
        tasks: [],
        count: 0,
        skipped,
        message: 'Bộ mẫu đã được áp trước đó — không có nhiệm vụ mới nào được thêm.',
      });
    }

    if (await enforceQuotaForRequest(req, res, ownerCompanyId, 'crm_tasks_per_month', { additional: toInsert.length })) return;

    const inserts = toInsert.map((item) => ({
      lead_id: targetLeadId,
      title: item.title,
      description: item.description || null,
      checklist: toCrmTaskChecklist(item.checklist, ownerCompanyId, item),
      priority: item.priority || 'medium',
      stage_slug: tpl?.stage_slug || null,
      pipeline_stage_id: stageForTasks,
      order_index: item.order_index,
      deadline: null,
      created_by: req.user.userId,
      completion_requires_file_or_note: !!item.completion_requires_file_or_note
        || (Array.isArray(item.required_evidence_file_types) && item.required_evidence_file_types.length > 0),
      required_evidence_file_types: Array.isArray(item.required_evidence_file_types) ? item.required_evidence_file_types : [],
      completion_requires_customer_note: !!item.completion_requires_customer_note,
      completion_requires_customer_contact: !!item.completion_requires_customer_contact,
      requires_quick_verdict: !!item.requires_quick_verdict,
      blocks_stage_advance: !!item.blocks_stage_advance,
      show_excel_quotation_upload: !!item.show_excel_quotation_upload,
      auto_upload_attachments_to_drive: !!item.auto_upload_attachments_to_drive,
      assignee_id: primaryTemplateItemAssigneeId(item),
      ...crmExecutorFieldsFromTemplateItem(item, ownerCompanyId),
    }));

    const assigneeIdsList = toInsert.map((item) => normalizeTemplateItemAssigneeIds(item));
    const sel = '*, assignee:users!crm_tasks_assignee_id_fkey(id,full_name,avatar), supervisor:users!crm_tasks_supervisor_id_fkey(id,full_name,avatar)';
    let { data, error } = await supabase.from('crm_tasks').insert(inserts).select(sel);
    // DB chưa apply migration 308 (cột checklist) → bỏ checklist và thử lại.
    if (error && String(error.message || '').toLowerCase().includes('checklist')) {
      const stripped = inserts.map(({ checklist: _c, ...rest }) => rest);
      ({ data, error } = await supabase.from('crm_tasks').insert(stripped).select(sel));
    }
    if (error && isExecutorColumnError(error)) {
      const stripped = inserts.map(({ executor_company_id: _e, ...rest }) => rest);
      ({ data, error } = await supabase.from('crm_tasks').insert(stripped).select(sel));
    }
    if (error) throw error;
    await applyAssigneesToInsertedCrmTasks(data, assigneeIdsList, req);
    if (data?.length) await attachAssigneesToCrmTasks(data);
    try {
      if (data?.length) {
        const { data: _actor } = await supabase.from('users').select('full_name').eq('id', req.user.userId).maybeSingle();
        await logDealActivityComment(req, {
          leadId: req.params.id,
          body: `📋 ${_actor?.full_name || 'Người dùng'} đã tạo ${data.length} nhiệm vụ từ bộ mẫu.`,
        });
      }
    } catch (_) {}
    res.status(201).json({ tasks: data, count: data.length, skipped });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/leads/:id/tasks/generate-production-template', async (req, res) => {
  try {
    const force = !!req.body?.force;
    const targetLeadId = await resolveCrmTaskWriteLeadId(req.params.id);
    const { data: lead } = await supabase
      .from('crm_leads')
      .select('id, type, company_id, assigned_to, lead_owner_id, sx_template_company_id')
      .eq('id', targetLeadId)
      .maybeSingle();
    if (!lead?.id) return res.status(404).json({ error: 'Không tìm thấy deal' });
    if (lead.type !== 'deal') return res.status(400).json({ error: 'Chỉ áp dụng cho deal' });

    let templateSourceCompanyId = null;
    const bodyPc = req.body?.production_company_id;
    if (bodyPc != null && String(bodyPc).trim() !== '') {
      const vPc = await validateProductionCompanyId(bodyPc);
      if (!vPc.ok) return res.status(400).json({ error: vPc.error, requires_production_company: true });
      templateSourceCompanyId = vPc.company.id;
    } else if (lead.sx_template_company_id) {
      const vStored = await validateProductionCompanyId(lead.sx_template_company_id);
      if (vStored.ok) templateSourceCompanyId = vStored.company.id;
    }

    if (templateSourceCompanyId) {
      const { data: leadProj } = await supabase
        .from('crm_leads')
        .select('project_id')
        .eq('id', targetLeadId)
        .maybeSingle();
      if (leadProj?.project_id) {
        const { data: projRow } = await supabase
          .from('projects')
          .select('workshop_type_id, company_id')
          .eq('id', leadProj.project_id)
          .maybeSingle();
        const { applyWorkshopTypeDefaultStaffToProject } = require('../../../helpers/productionWorkshopTypeStaff');
        try {
          await applyWorkshopTypeDefaultStaffToProject(
            leadProj.project_id,
            projRow?.company_id || templateSourceCompanyId,
            projRow?.workshop_type_id || null,
          );
        } catch (staffErr) {
          console.warn('[crm/gen-sx] apply default staff:', staffErr.message);
        }
      } else {
        await assignProductionCompanyDealResponsibility({
          dealId: targetLeadId,
          productionCompanyId: templateSourceCompanyId,
          projectId: null,
        });
      }
      await supabase
        .from('crm_leads')
        .update({ sx_template_company_id: templateSourceCompanyId, updated_at: new Date().toISOString() })
        .eq('id', targetLeadId);
    }

    const r0 = await applyProductionTemplateToFulfillmentLead({
      req,
      leadId: targetLeadId,
      createdBy: req.user.userId,
      assigneeId: null,
      force: force || !!templateSourceCompanyId,
      requireTemplateCompanyMatch: true,
      dealCompanyId: lead.company_id || null,
      templateSourceCompanyId,
    });
    if (r0?.reason === 'missing_deal_company') {
      return res.status(400).json({ error: 'Deal chưa có công ty — không thể gen nhiệm vụ SX theo công ty.' });
    }
    if (r0?.reason === 'no_production_templates_for_deal_company') {
      return res.status(400).json({ error: 'Không có bộ nhiệm vụ Sản xuất thuộc công ty của deal. Vui lòng tạo/bật bộ mẫu đúng công ty rồi thử lại.' });
    }
    res.json({
      ok: true,
      created: r0.created || 0,
      reason: r0.reason || 'ok',
      template_count: r0.template_count ?? null,
      template_names: r0.template_names || [],
      target_lead_id: targetLeadId,
      forced: force,
      company_id: r0.company_id || lead.company_id || null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Lỗi tạo nhiệm vụ SX' });
  }
});

r.put('/leads/:leadId/tasks/:taskId', async (req, res) => {
  try {
    const b = req.body;
    if (b.status === 'completed') {
      const { data: prior, error: pErr } = await supabase
        .from('crm_tasks')
        .select('id,status,notes,stage_slug,production_pipeline_stage_id,completion_requires_file_or_note, required_evidence_file_types, requires_quick_verdict, quick_verdict, quick_verdict_reason, completion_requires_customer_note, completion_requires_customer_contact')
        .eq('id', req.params.taskId)
        .maybeSingle();
      if (pErr) throw pErr;
      if (prior && prior.status !== 'completed' && crmTaskRequiresCompletionEvidence(prior) && !skipSxWorkQuickComplete(b, prior)) {
        const ok = await crmTaskMeetsCompletionRequirements(supabase, req.params.taskId, prior);
        if (!ok) {
          if (prior.requires_quick_verdict && prior.quick_verdict !== 'sufficient') {
            return res.status(400).json({
              error: 'Nhiệm vụ này yêu cầu chọn «Đã đủ» trong ghi chú nhanh trước khi hoàn thành.',
              code: 'crm_task_completion_requires_evidence',
            });
          }
          const typed = await crmTaskMeetsRequiredFileTypes(supabase, req.params.taskId, prior);
          const detail = typed.missingLabel
            ? `Thiếu loại minh chứng: ${typed.missingLabel}.`
            : 'Cần ghi chú khách hàng và/hoặc file đính kèm.';
          return res.status(400).json({
            error: `Nhiệm vụ này yêu cầu minh chứng trước khi hoàn thành. ${detail}`,
            code: 'crm_task_completion_requires_evidence',
            missing_file_types: typed.missing || [],
          });
        }
      }
    }

    const result = await updateCrmLeadTask(req, req.params.leadId, req.params.taskId, b);
    if (result.error) {
      if (result.code) return res.status(result.status || 400).json({ error: result.error, code: result.code });
      return res.status(result.status || 500).json({ error: result.error });
    }
    const data = result.data;

    // 🔔 NOTIFICATION: Task CRM cập nhật
    try {
      if (b.status === 'completed') {
        // Notify lead owner khi task hoàn thành
        const { data: leadInfo } = await supabase.from('crm_leads')
          .select('assigned_to, lead_owner_id, title, company_id, region_id').eq('id', req.params.leadId).single();
        const ownerIds = [leadInfo?.assigned_to, leadInfo?.lead_owner_id].filter(Boolean);
        const ecoDone = ecosystemModuleKeyForCrmDeadline(crmTaskDeadlineModuleKey(data.stage_slug));
        const filteredOwners = await filterUserIdsForCrmLeadScopedNotification(
          supabase,
          { company_id: leadInfo?.company_id, region_id: leadInfo?.region_id },
          ownerIds,
          ecoDone,
        );
        if (filteredOwners.length) {
          await notifyMultiple(req, filteredOwners, 'crm_task_completed',
            '✅ NV CRM hoàn thành',
            `"${data.title}" trong deal "${leadInfo?.title}" đã hoàn thành`,
            'crm_task', data.id);
        }
      }
      const priorSet = new Set((result.priorAssigneeIds || []).map(String));
      if (!priorSet.size && result.priorAssigneeId) priorSet.add(String(result.priorAssigneeId));
      const addedAssigneeIds = (result.newAssigneeIds || [])
        .map(String)
        .filter((uid) => uid !== String(req.user.userId) && !priorSet.has(uid));
      if (addedAssigneeIds.length && !data.crm_assignment_id) {
        const fallbackAssignmentId = await resolveAssignmentIdForTask(
          data.id,
          req.params.leadId,
          data.title,
        );
        if (fallbackAssignmentId) {
          const { data: leadPut } = await supabase.from('crm_leads')
            .select('id, code, title, company_id, region_id')
            .eq('id', req.params.leadId)
            .maybeSingle();
          await notifyNewCrmAssignmentAssignees(req, {
            assignmentId: fallbackAssignmentId,
            title: data.title,
            userIds: addedAssigneeIds,
            lead: leadPut,
            deadline: data.deadline,
            stageSlug: data.stage_slug,
            crmTaskId: data.id,
          });
        } else {
          const ecoPut = ecosystemModuleKeyForCrmDeadline(crmTaskDeadlineModuleKey(data.stage_slug));
          // Người được giao tường minh — không lọc company/region.
          for (const uid of addedAssigneeIds) {
            if (String(uid) === String(req.user.userId)) continue;
            await createNotification(req, uid, 'crm_task_assigned',
              '📌 Được giao nhiệm vụ CRM',
              `Bạn được giao: "${data.title}"`,
              'crm_task', data.id,
              { lead_id: req.params.leadId, nav_tab: 'tasks', ecosystem_module_key: ecoPut || 'crm' });
          }
        }
      } else if (b.assignee_id && String(b.assignee_id) !== String(result.priorAssigneeId || '') && !data.crm_assignment_id) {
        const fallbackAssignmentId = await resolveAssignmentIdForTask(
          data.id,
          req.params.leadId,
          data.title,
        );
        if (fallbackAssignmentId) {
          const { data: leadPut } = await supabase.from('crm_leads')
            .select('id, code, title, company_id, region_id')
            .eq('id', req.params.leadId)
            .maybeSingle();
          await notifyNewCrmAssignmentAssignees(req, {
            assignmentId: fallbackAssignmentId,
            title: data.title,
            userIds: [b.assignee_id],
            lead: leadPut,
            deadline: data.deadline,
            stageSlug: data.stage_slug,
            crmTaskId: data.id,
          });
        } else {
          const ecoPut = ecosystemModuleKeyForCrmDeadline(crmTaskDeadlineModuleKey(data.stage_slug));
          if (String(b.assignee_id) !== String(req.user.userId)) {
            await createNotification(req, b.assignee_id, 'crm_task_assigned',
              '📌 Được giao nhiệm vụ CRM',
              `Bạn được giao: "${data.title}"`,
              'crm_task', data.id,
              { lead_id: req.params.leadId, nav_tab: 'tasks', ecosystem_module_key: ecoPut || 'crm' });
          }
        }
      }
      // 📅 Notify khi set/thay đổi deadline (lọc NV đúng khối/khu vực — createNotification có thể chặn loại deadline)
      if (b.deadline !== undefined) {
        const { data: leadInfo2 } = await supabase.from('crm_leads')
          .select('assigned_to, lead_owner_id, title, code, company_id, region_id').eq('id', req.params.leadId).single();
        const targetIds = [...new Set([data.assignee_id, leadInfo2?.assigned_to, leadInfo2?.lead_owner_id].filter(Boolean))];
        const ecoDl = ecosystemModuleKeyForCrmDeadline(crmTaskDeadlineModuleKey(data.stage_slug));
        const scopedDl = await filterUserIdsForCrmLeadScopedNotification(
          supabase,
          { company_id: leadInfo2?.company_id, region_id: leadInfo2?.region_id },
          targetIds,
          ecoDl,
        );
        const filtered = scopedDl.filter((id) => id !== req.user.userId);
        if (filtered.length && b.deadline) {
          await notifyMultiple(req, filtered, 'crm_deadline_set',
            '📅 Đặt ngày hẹn nhiệm vụ',
            `"${data.title}" — ${leadInfo2?.code || ''} ${leadInfo2?.title || ''} — hạn: ${new Date(b.deadline).toLocaleDateString('vi-VN')}`,
            'crm_lead', req.params.leadId);
        }
      }
    } catch (ne) { console.warn('[NOTIFY] crm_task_update:', ne.message); }

    // «Chốt sản xuất»: đặt ngày hẹn → ghi dự kiến SX lên deal + dự án, thông báo phụ trách xưởng
    if (b.deadline !== undefined && b.deadline && isChotSanXuatCrmTaskTitle(data.title)) {
      const dateOnly = deadlineToDateOnlyIso(b.deadline);
      if (dateOnly) {
        try {
          const nowIso = new Date().toISOString();
          const { data: leadRow } = await supabase
            .from('crm_leads')
            .select('id, project_id, title, code, assigned_to, lead_owner_id')
            .eq('id', req.params.leadId)
            .maybeSingle();
          await supabase
            .from('crm_leads')
            .update({ expected_production_start_date: dateOnly, updated_at: nowIso })
            .eq('id', req.params.leadId);
          if (leadRow?.project_id) {
            await supabase
              .from('projects')
              .update({ expected_production_start_date: dateOnly, updated_at: nowIso })
              .eq('id', leadRow.project_id);
            const { data: proj } = await supabase
              .from('projects')
              .select('production_person_id, project_manager_id, code')
              .eq('id', leadRow.project_id)
              .maybeSingle();
            const teamIds = [...new Set([proj?.production_person_id, proj?.project_manager_id].filter(Boolean))].filter(
              (uid) => String(uid) !== String(req.user.userId),
            );
            if (teamIds.length) {
              await notifyMultiple(
                req,
                teamIds,
                'crm_chot_sx_date',
                '📅 Chốt sản xuất — ngày dự kiến',
                `Deal ${leadRow?.code || ''} ${leadRow?.title || ''} — Dự kiến SX: ${dateOnly} (từ nhiệm vụ «${data.title}») · Dự án ${proj?.code || ''}`,
                'project',
                leadRow.project_id,
              );
            }
            try {
              const io = req.app.get('io');
              if (io) await emitCrmBadgeUpdateForProject(leadRow.project_id, io);
            } catch (em) {
              console.warn('[crm_task] emit badge:', em.message);
            }
          }
          try {
            await supabase.from('crm_activities').insert({
              lead_id: req.params.leadId,
              type: 'note',
              title: '📅 Cập nhật dự kiến sản xuất',
              description: `Từ nhiệm vụ CRM «${data.title}»: ngày hẹn ${dateOnly}`,
              created_by: req.user.userId,
            });
          } catch (_) {}
        } catch (sxDateErr) {
          console.warn('[crm_task] chốt SX sync:', sxDateErr.message);
        }
      }
    }

    await emitCrmTaskChanged(req, {
      leadId: req.params.leadId,
      taskId: req.params.taskId,
      action: 'updated',
      task: data,
    });

    try {
      if (b.status === 'completed') {
        const { data: _actor } = await supabase.from('users').select('full_name').eq('id', req.user.userId).maybeSingle();
        await logDealActivityComment(req, {
          leadId: req.params.leadId,
          body: `✅ ${_actor?.full_name || 'Người dùng'} đã hoàn thành nhiệm vụ «${data.title || ''}».`,
        });
      }
    } catch (_) {}

    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/leads/:leadId/tasks/:taskId/restore-checklist', async (req, res) => {
  try {
    const ownerCompanyId = String(req.query?.owner_company_id || req.body?.owner_company_id || '').trim() || null;
    const result = await restoreCrmTaskChecklistFromWorkshopTemplate(req.params.taskId, ownerCompanyId);
    if (result.error) return res.status(result.status || 500).json({ error: result.error });
    await emitCrmTaskChanged(req, {
      leadId: req.params.leadId,
      taskId: req.params.taskId,
      action: 'updated',
      task: result.data,
    });
    res.json({ task: result.data, restored_count: result.restored_count });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.delete('/leads/:leadId/tasks/:taskId', async (req, res) => {
  try {
    let taskTitle = '';
    try {
      const { data: t } = await supabase.from('crm_tasks').select('title').eq('id', req.params.taskId).maybeSingle();
      taskTitle = t?.title || '';
    } catch (_) {}
    const result = await deleteCrmLeadTask(req, req.params.taskId);
    if (result.error) return res.status(result.status || 500).json({ error: result.error });
    await emitCrmTaskChanged(req, {
      leadId: req.params.leadId,
      taskId: req.params.taskId,
      action: 'deleted',
    });
    try {
      const { data: _actor } = await supabase.from('users').select('full_name').eq('id', req.user.userId).maybeSingle();
      await logDealActivityComment(req, {
        leadId: req.params.leadId,
        body: `🗑️ ${_actor?.full_name || 'Người dùng'} đã xóa nhiệm vụ «${taskTitle || 'Không tên'}».`,
      });
    } catch (_) {}
    return res.json(result.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.put('/leads/:leadId/tasks/:taskId/toggle-share', async (req, res) => {
  try {
    const { cleanShareModulesInput } = require('../../../helpers/documentShareScope');
    const { data: task, error: fetchErr } = await supabase.from('crm_tasks')
      .select('id, shared_to_project').eq('id', req.params.taskId).single();
    if (fetchErr) throw fetchErr;

    const newVal = req.body?.shared_to_project !== undefined
      ? !!req.body.shared_to_project
      : !task.shared_to_project;
    const update = { shared_to_project: newVal, updated_at: new Date().toISOString() };
    if (req.body?.allowed_share_modules !== undefined) {
      update.allowed_share_modules = newVal
        ? cleanShareModulesInput(req.body.allowed_share_modules)
        : null;
    } else if (!newVal) {
      update.allowed_share_modules = null;
    }
    const { data, error } = await supabase.from('crm_tasks')
      .update(update)
      .eq('id', req.params.taskId)
      .select('id, title, shared_to_project, allowed_share_modules').single();
    if (error) throw error;
    try {
      const { syncLeadDocumentsFromCrmTaskShare } = require('../../../helpers/syncCrmArtifactShareToLeadDocuments');
      await syncLeadDocumentsFromCrmTaskShare(req.params.taskId);
    } catch (syncErr) {
      console.warn('[toggle-share task] lead_documents:', syncErr.message);
    }
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.put('/leads/:leadId/tasks/:taskId/attachments/:attId/toggle-share', async (req, res) => {
  try {
    const { cleanShareModulesInput } = require('../../../helpers/documentShareScope');
    const { data: att, error: fetchErr } = await supabase.from('crm_task_attachments')
      .select('id, shared_to_project').eq('id', req.params.attId).single();
    if (fetchErr) throw fetchErr;

    const newVal = req.body?.shared_to_project !== undefined
      ? !!req.body.shared_to_project
      : !att.shared_to_project;
    const update = { shared_to_project: newVal };
    if (req.body?.allowed_share_modules !== undefined) {
      update.allowed_share_modules = newVal
        ? cleanShareModulesInput(req.body.allowed_share_modules)
        : null;
    } else if (!newVal) {
      update.allowed_share_modules = null;
    }
    const { data, error } = await supabase.from('crm_task_attachments')
      .update(update)
      .eq('id', req.params.attId)
      .select('id, name, shared_to_project, allowed_share_modules').single();
    if (error) throw error;
    try {
      const { syncLeadDocumentsFromCrmAttachmentShare } = require('../../../helpers/syncCrmArtifactShareToLeadDocuments');
      await syncLeadDocumentsFromCrmAttachmentShare(req.params.attId);
    } catch (syncErr) {
      console.warn('[toggle-share attachment] lead_documents:', syncErr.message);
    }
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.put('/leads/:leadId/tasks/:taskId/attachments/:attId/share-scope', async (req, res) => {
  try {
    const { cleanShareModulesInput } = require('../../../helpers/documentShareScope');
    const { allowed_share_modules, shared_to_project } = req.body;
    const update = {};
    if (shared_to_project !== undefined) update.shared_to_project = !!shared_to_project;
    if (allowed_share_modules !== undefined) {
      update.allowed_share_modules = cleanShareModulesInput(allowed_share_modules);
    }
    const { data, error } = await supabase.from('crm_task_attachments')
      .update(update)
      .eq('id', req.params.attId)
      .select('id, name, shared_to_project, allowed_share_modules').single();
    if (error) throw error;
    try {
      const { syncLeadDocumentsFromCrmAttachmentShare } = require('../../../helpers/syncCrmArtifactShareToLeadDocuments');
      await syncLeadDocumentsFromCrmAttachmentShare(req.params.attId);
    } catch (syncErr) {
      console.warn('[share-scope attachment] lead_documents:', syncErr.message);
    }
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/project/:projectId/shared-notes', async (req, res) => {
  try {
    const {
      crmTaskVisibleForModuleAndUser,
      crmAttachmentVisibleForModuleAndUser,
    } = require('../../../helpers/documentShareScope');
    const forModule = String(req.query.for_module || '').toLowerCase().trim();
    const useMod = ['production', 'logistics', 'workshop'].includes(forModule) ? forModule : null;

    const { data: lead } = await supabase.from('crm_leads')
      .select('id, company_id').eq('project_id', req.params.projectId).single();
    if (!lead) return res.json([]);
    const visOpts = { leadCompanyId: lead.company_id || null };

    const { data: allTasks } = await supabase.from('crm_tasks')
      .select('id, title, notes, stage_slug, shared_to_project, allowed_share_modules, default_allowed_companies, default_allowed_departments, assignee:users!crm_tasks_assignee_id_fkey(id,full_name), updated_at')
      .eq('lead_id', lead.id)
      .order('order_index');

    const taskIds = (allTasks || []).map(t => t.id);
    const taskMap = Object.fromEntries((allTasks || []).map((t) => [t.id, t]));
    let sharedAtts = [];
    if (taskIds.length) {
      const { data: atts } = await supabase.from('crm_task_attachments')
        .select('id, task_id, name, file_url, file_name, file_size, mime_type, notes, doc_type, created_by, shared_to_project, allowed_share_modules, allowed_companies, allowed_departments')
        .in('task_id', taskIds)
        .eq('shared_to_project', true);
      sharedAtts = (atts || []).filter((a) => {
        const taskRow = taskMap[a.task_id];
        return useMod
          ? crmAttachmentVisibleForModuleAndUser(a, useMod, req.user, taskRow, visOpts)
          : a.shared_to_project === true && canUserViewDocByAllowlist(req.user, a, taskRow);
      });
    }

    const result = (allTasks || [])
      .map((t) => {
        const taskShared = useMod
          ? crmTaskVisibleForModuleAndUser(t, useMod, req.user, visOpts)
          : t.shared_to_project === true;
        const canViewNotes = taskShared && canUserViewDocByAllowlist(req.user, t);
        const attachments = sharedAtts.filter((a) => a.task_id === t.id);
        return {
          ...t,
          notes: canViewNotes ? t.notes : null,
          attachments,
        };
      })
      .filter((t) => t.notes || t.attachments.length > 0);

    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.put('/leads/:leadId/tasks/:taskId/notes', async (req, res) => {
  try {
    const { notes } = req.body;
    const { getTaskVisibilityAllowlist } = require('../../../helpers/documentShareScope');
    const { data, error } = await supabase.from('crm_tasks')
      .update({ notes, updated_at: new Date().toISOString() })
      .eq('id', req.params.taskId)
      .select('id, title, notes, stage_slug, default_allowed_companies, default_allowed_departments, shared_to_project, allowed_share_modules')
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return res.status(404).json({
        error: 'Không tìm thấy nhiệm vụ CRM. Nhiệm vụ VC/LĐ xưởng hãy dùng ghi chú /tasks/:id/comments.',
      });
    }
    const vis = getTaskVisibilityAllowlist(data);

    // Sync: upsert ghi chú vào lead_documents
    // Tìm attachment type "task_note" cho task này
    if (notes?.trim()) {
      try {
        const { data: leadForSync } = await supabase.from('crm_leads')
          .select('project_id, company_id').eq('id', req.params.leadId).maybeSingle();
        const taskDocOpts = {
          linkToProject: !!leadForSync?.project_id,
          leadCompanyId: leadForSync?.company_id || null,
        };

        const { data: existingAtt } = await supabase.from('crm_task_attachments')
          .select('id')
          .eq('task_id', req.params.taskId)
          .eq('doc_type', 'task_inline_note')
          .limit(1)
          .maybeSingle();
        
        if (existingAtt) {
          // Update existing
          await supabase.from('crm_task_attachments')
            .update({
              notes,
              name: `📝 ${data.title}`,
              allowed_companies: vis.allowed_companies,
              allowed_departments: vis.allowed_departments,
            })
            .eq('id', existingAtt.id);
          // Sync lead_document (project_id + cờ xưởng khớp tab Tài liệu / SX)
          await supabase.from('lead_documents')
            .update({
              notes,
              name: `[${data.title}] 📝 Ghi chú`,
              project_id: leadForSync?.project_id ?? null,
              allowed_companies: vis.allowed_companies,
              allowed_departments: vis.allowed_departments,
              ...getLeadDocumentFieldsFromCrmTask(data, taskDocOpts),
            })
            .eq('source_attachment_id', existingAtt.id);
        } else {
          // Create new attachment + document
          const noteShare = getDefaultCrmAttachmentShare(data, taskDocOpts);
          const { data: att } = await supabase.from('crm_task_attachments').insert({
            task_id: req.params.taskId, lead_id: req.params.leadId,
            name: `📝 ${data.title}`, doc_type: 'task_inline_note', notes,
            created_by: req.user.userId,
            allowed_companies: vis.allowed_companies,
            allowed_departments: vis.allowed_departments,
            ...noteShare,
          }).select().single();
          if (att) {
            await supabase.from('lead_documents').insert({
              lead_id: req.params.leadId, project_id: leadForSync?.project_id || null,
              name: `[${data.title}] 📝 Ghi chú`, doc_type: 'task_inline_note',
              notes, created_by: req.user.userId, source_attachment_id: att.id,
              allowed_companies: vis.allowed_companies,
              allowed_departments: vis.allowed_departments,
              ...getLeadDocumentFieldsFromCrmTask(data, taskDocOpts),
            });
          }
        }
      } catch (syncErr) { console.warn('Sync task notes:', syncErr.message); }
    }

    await emitCrmTaskChanged(req, {
      leadId: req.params.leadId,
      taskId: req.params.taskId,
      action: notes?.trim() ? 'notes_updated' : 'notes_cleared',
      task: data,
    });

    try {
      const assignment = await fetchAssignmentForTask(req.params.taskId);
      if (assignment?.id) {
        await syncAllTaskArtifactsToAssignment(req.params.taskId, assignment.id, req);
      }
    } catch (syncErr) {
      console.warn('[task notes] sync→assignment:', syncErr.message);
    }

    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.put('/leads/:leadId/tasks/:taskId/checklist/:checklistId/notes', async (req, res) => {
  try {
    const { notes } = req.body;
    const ckId = String(req.params.checklistId);
    const { data: taskRow, error: tErr } = await supabase.from('crm_tasks')
      .select('id, title, stage_slug, checklist, shared_to_project, allowed_share_modules')
      .eq('id', req.params.taskId)
      .maybeSingle();
    if (tErr) throw tErr;
    if (!taskRow) return res.status(404).json({ error: 'Nhiệm vụ không tồn tại' });

    const ckItem = findChecklistItem(taskRow, ckId);
    if (!ckItem) return res.status(404).json({ error: 'Mục checklist không tồn tại' });

    const nextChecklist = parseChecklist(taskRow.checklist).map((c) => (
      String(c.id) === ckId ? { ...c, notes: notes || '' } : c
    ));

    const { data, error } = await supabase.from('crm_tasks')
      .update({ checklist: nextChecklist, updated_at: new Date().toISOString() })
      .eq('id', req.params.taskId)
      .select('id, title, checklist, stage_slug')
      .single();
    if (error) throw error;

    try {
      await syncChecklistItemNotes(supabase, {
        leadId: req.params.leadId,
        taskRow: { ...taskRow, checklist: nextChecklist },
        checklistId: ckId,
        notes: notes || '',
        userId: req.user.userId,
      });
    } catch (syncErr) {
      console.warn('Sync checklist notes:', syncErr.message);
    }

    await emitCrmTaskChanged(req, {
      leadId: req.params.leadId,
      taskId: req.params.taskId,
      action: notes?.trim() ? 'checklist_notes_updated' : 'checklist_notes_cleared',
      task: data,
    });

    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/leads/:leadId/tasks/:taskId/attachments', async (req, res) => {
  try {
    const { data: taskRow } = await supabase.from('crm_tasks')
      .select('id, default_allowed_companies, default_allowed_departments')
      .eq('id', req.params.taskId)
      .maybeSingle();
    const { data, error } = await supabase.from('crm_task_attachments')
      .select('*, creator:users!crm_task_attachments_created_by_fkey(id, full_name)')
      .eq('task_id', req.params.taskId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    const visible = (data || []).filter((a) => canUserViewDocByAllowlist(req.user, a, taskRow));
    res.json(visible);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/leads/:leadId/tasks/:taskId/attachments/bulk', async (req, res) => {
  try {
    const { data: leadForAccess } = await supabase.from('crm_leads').select('project_id').eq('id', req.params.leadId).maybeSingle();
    if (!(await assertDealResponsible(req, res, { leadId: req.params.leadId, projectId: leadForAccess?.project_id }))) return;
    const items = req.body.items; // [{name, doc_type, file_url, file_name, file_size, mime_type}]
    if (!items?.length) return res.status(400).json({ error: 'Không có file' });

    // Query task visibility 1 lần duy nhất
    const { data: task } = await supabase.from('crm_tasks')
      .select('id, title, stage_slug, checklist, default_allowed_companies, default_allowed_departments, auto_upload_attachments_to_drive, pipeline_stage:crm_pipeline_stages!crm_tasks_pipeline_stage_id_fkey(name)')
      .eq('id', req.params.taskId).single();
    const finalCompanies = task?.default_allowed_companies || null;
    const finalDepts = task?.default_allowed_departments || null;
    const checklistId = req.body.checklist_id ? String(req.body.checklist_id) : null;
    const ckItem = checklistId ? findChecklistItem(task, checklistId) : null;
    if (checklistId && !ckItem) return res.status(400).json({ error: 'Mục checklist không tồn tại' });

    const { data: leadForShare } = await supabase.from('crm_leads')
      .select('project_id, title, company_id').eq('id', req.params.leadId).single();
    const bulkShareOpts = {
      linkToProject: !!leadForShare?.project_id,
      leadCompanyId: leadForShare?.company_id || null,
    };
    const defaultShare = getDefaultCrmAttachmentShare(task, bulkShareOpts, ckItem);

    // Insert tất cả attachments 1 lần — bỏ trùng file_url trong payload
    const seenUrls = new Set();
    const dedupedItems = [];
    for (const item of items) {
      const url = item.file_url ? String(item.file_url) : '';
      if (url) {
        if (seenUrls.has(url)) continue;
        seenUrls.add(url);
      }
      dedupedItems.push(item);
    }
    if (seenUrls.size) {
      const { data: existing } = await supabase.from('crm_task_attachments')
        .select('file_url')
        .eq('task_id', req.params.taskId)
        .in('file_url', [...seenUrls]);
      for (const row of existing || []) {
        if (row.file_url) seenUrls.delete(String(row.file_url));
      }
    }
    const rows = dedupedItems
      .filter((item) => !item.file_url || seenUrls.has(String(item.file_url)))
      .map(item => ({
      task_id: req.params.taskId,
      lead_id: req.params.leadId,
      checklist_id: item.checklist_id ? String(item.checklist_id) : checklistId,
      name: item.name || item.file_name || 'File',
      doc_type: item.doc_type || (item.file_url ? 'other' : 'task_note'),
      file_url: item.file_url, file_name: item.file_name,
      file_size: item.file_size, mime_type: item.mime_type,
      allowed_companies: finalCompanies, allowed_departments: finalDepts,
      created_by: req.user.userId,
      shared_to_project: item.shared_to_project ?? defaultShare.shared_to_project,
      allowed_share_modules: item.allowed_share_modules ?? defaultShare.allowed_share_modules,
    }));
    if (!rows.length) {
      return res.status(200).json([]);
    }
    let { data, error } = await supabase.from('crm_task_attachments')
      .insert(rows)
      .select('*, creator:users!crm_task_attachments_created_by_fkey(id, full_name)');
    if (error && String(error.message || '').toLowerCase().includes('checklist_id')) {
      const legacyRows = rows.map(({ checklist_id: _c, ...rest }) => rest);
      ({ data, error } = await supabase.from('crm_task_attachments')
        .insert(legacyRows)
        .select('*, creator:users!crm_task_attachments_created_by_fkey(id, full_name)'));
    }
    if (error) throw error;

    // Sync → lead_documents 1 lần
    try {
      const bulkDocOpts = { linkToProject: !!leadForShare?.project_id, projectId: leadForShare?.project_id || null };
      const syncRows = (data || []).map(att => {
        const attCk = att.checklist_id ? findChecklistItem(task, att.checklist_id) : ckItem;
        return buildChecklistLeadDocumentRow({
          leadId: req.params.leadId,
          taskRow: task,
          checklistId: att.checklist_id || checklistId,
          checklistTitle: attCk?.title || null,
          att,
          taskDocOpts: bulkDocOpts,
          finalCompanies,
          finalDepts,
          userId: req.user.userId,
        });
      });
      if (syncRows.length) {
        let { error: syncErr } = await supabase.from('lead_documents').insert(syncRows);
        if (syncErr && String(syncErr.message || '').toLowerCase().includes('source_checklist_id')) {
          const legacy = syncRows.map(({ source_checklist_id: _c, ...rest }) => rest);
          ({ error: syncErr } = await supabase.from('lead_documents').insert(legacy));
        }
        if (syncErr) console.warn('Bulk sync error:', syncErr.message);
      }
    } catch (syncErr) { console.warn('Bulk sync error:', syncErr.message); }

    await emitCrmTaskChanged(req, {
      leadId: req.params.leadId,
      taskId: req.params.taskId,
      action: 'attachment_added',
      task,
    });

    for (const att of data || []) {
      try {
        await syncTaskAttachmentToAssignment(att, req);
      } catch (syncErr) {
        console.warn('[bulk attach] sync→assignment:', syncErr.message);
      }
      await logProjectFileActivity(req, {
        projectId: leadForShare?.project_id,
        leadId: req.params.leadId,
        action: 'uploaded',
        fileName: att.file_name || att.name,
        fileUrl: att.file_url,
        taskTitle: task?.title,
      });
      if (leadForShare?.project_id && att.shared_to_project) {
        await notifyProductionDocumentUploaded({
          req,
          projectId: leadForShare.project_id,
          leadId: req.params.leadId,
          fileName: att.file_name || att.name,
          dealTitle: leadForShare.title,
        });
      }
    }

    await maybeMirrorTaskAttachmentsToDrive({
      taskId: req.params.taskId,
      leadId: req.params.leadId,
      attachments: data || [],
      userId: req.user?.userId || req.user?.id,
      taskFlag: !!task?.auto_upload_attachments_to_drive,
    });

    res.status(201).json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/leads/:leadId/tasks/:taskId/attachments', async (req, res) => {
  try {
    const { name, doc_type, file_url, file_name, file_size, mime_type, notes, allowed_companies, allowed_departments, checklist_id } = req.body;
    
    // Auto-apply default visibility from CRM task (inherited from template)
    let finalCompanies = allowed_companies || null;
    let finalDepts = allowed_departments || null;
    if (!finalCompanies && !finalDepts) {
      const { data: task } = await supabase.from('crm_tasks')
        .select('id, stage_slug, default_allowed_companies, default_allowed_departments')
        .eq('id', req.params.taskId).single();
      if (task) {
        finalCompanies = task.default_allowed_companies || null;
        finalDepts = task.default_allowed_departments || null;
      }
    }
    
    const { data: taskForShare } = await supabase.from('crm_tasks')
      .select('id, title, stage_slug, checklist, default_allowed_companies, default_allowed_departments, auto_upload_attachments_to_drive')
      .eq('id', req.params.taskId).single();
    const ckId = checklist_id ? String(checklist_id) : null;
    const ckItem = ckId ? findChecklistItem(taskForShare, ckId) : null;
    if (ckId && !ckItem) return res.status(400).json({ error: 'Mục checklist không tồn tại' });
    const { data: leadForShare } = await supabase.from('crm_leads')
      .select('project_id, title, company_id').eq('id', req.params.leadId).single();
    const singleShareOpts = {
      linkToProject: !!leadForShare?.project_id,
      leadCompanyId: leadForShare?.company_id || null,
    };
    const singleDefaultShare = getDefaultCrmAttachmentShare(taskForShare, singleShareOpts, ckItem);

    const insertRow = {
      task_id: req.params.taskId,
      lead_id: req.params.leadId,
      checklist_id: ckId,
      name: name || file_name || 'Ghi chú',
      doc_type: doc_type || (file_url ? 'other' : 'task_note'),
      file_url, file_name, file_size, mime_type, notes,
      allowed_companies: finalCompanies,
      allowed_departments: finalDepts,
      created_by: req.user.userId,
      shared_to_project: req.body.shared_to_project ?? singleDefaultShare.shared_to_project,
      allowed_share_modules: req.body.allowed_share_modules ?? singleDefaultShare.allowed_share_modules,
    };
    let { data, error } = await supabase.from('crm_task_attachments')
      .insert(insertRow)
      .select('*, creator:users!crm_task_attachments_created_by_fkey(id, full_name)')
      .single();
    if (error && String(error.message || '').toLowerCase().includes('checklist_id')) {
      const { checklist_id: _c, ...legacy } = insertRow;
      ({ data, error } = await supabase.from('crm_task_attachments')
        .insert(legacy)
        .select('*, creator:users!crm_task_attachments_created_by_fkey(id, full_name)')
        .single());
    }
    if (error) throw error;

    // ── SYNC → lead_documents ──
    try {
      const task = taskForShare;
      const lead = leadForShare;
      const docRow = buildChecklistLeadDocumentRow({
        leadId: req.params.leadId,
        taskRow: task,
        checklistId: ckId,
        checklistTitle: ckItem?.title || null,
        att: data,
        taskDocOpts: { linkToProject: !!lead?.project_id, projectId: lead?.project_id || null },
        finalCompanies,
        finalDepts,
        userId: req.user.userId,
      });
      let { error: syncErr } = await supabase.from('lead_documents').insert(docRow);
      if (syncErr && String(syncErr.message || '').toLowerCase().includes('source_checklist_id')) {
        const { source_checklist_id: _c, ...legacyDoc } = docRow;
        ({ error: syncErr } = await supabase.from('lead_documents').insert(legacyDoc));
      }
      if (syncErr) console.warn('Sync attachment→document:', syncErr.message);
    } catch (syncErr) { console.warn('Sync attachment→document:', syncErr.message); }

    try {
      await syncTaskAttachmentToAssignment(data, req);
    } catch (syncErr) {
      console.warn('[attach] sync→assignment:', syncErr.message);
    }

    await logProjectFileActivity(req, {
      projectId: leadForShare?.project_id,
      leadId: req.params.leadId,
      action: 'uploaded',
      fileName: data.file_name || data.name,
      fileUrl: data.file_url,
      taskTitle: taskForShare?.title,
    });
    if (leadForShare?.project_id && data.shared_to_project) {
      await notifyProductionDocumentUploaded({
        req,
        projectId: leadForShare.project_id,
        leadId: req.params.leadId,
        fileName: data.file_name || data.name,
        dealTitle: leadForShare.title,
      });
    }

    await maybeMirrorTaskAttachmentsToDrive({
      taskId: req.params.taskId,
      leadId: req.params.leadId,
      attachments: data ? [data] : [],
      userId: req.user?.userId || req.user?.id,
      taskFlag: !!taskForShare?.auto_upload_attachments_to_drive,
    });

    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.delete('/leads/:leadId/tasks/:taskId/attachments/:attId', async (req, res) => {
  try {
    const attId = String(req.params.attId || '').trim();
    const { data: attBefore, error: fetchErr } = await supabase.from('crm_task_attachments')
      .select('id, task_id, source_assignment_file_id, created_by, file_name, name, lead_id')
      .eq('id', attId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!attBefore) return res.status(404).json({ error: 'Không tìm thấy file' });

    const resolvedTaskId = attBefore.task_id || req.params.taskId;
    const resolvedLeadId = attBefore.lead_id || req.params.leadId;

    let taskTitle = '';
    let projectId = null;
    if (resolvedTaskId) {
      const { data: taskRow } = await supabase.from('crm_tasks')
        .select('id, title')
        .eq('id', resolvedTaskId)
        .maybeSingle();
      taskTitle = taskRow?.title || '';
    }
    if (resolvedLeadId) {
      const { data: leadRow } = await supabase.from('crm_leads')
        .select('project_id')
        .eq('id', resolvedLeadId)
        .maybeSingle();
      projectId = leadRow?.project_id || null;
    }

    if (!(await assertDealResponsible(req, res, {
      leadId: resolvedLeadId,
      projectId,
    }))) return;

    // Snapshot vào Thùng rác trước khi xóa thật (trừ khi permanent=true)
    if (req.query.permanent !== 'true') {
      try {
        const { snapshotTaskAttachment } = require('../../../helpers/trashSnapshot');
        const snapRes = await snapshotTaskAttachment(supabase, attId, req.user?.userId);
        if (!snapRes.ok) console.warn('[delete task attach] snapshot trash failed:', snapRes.error);
      } catch (e) {
        console.warn('[delete task attach] trash snapshot error:', e.message);
      }
    }
    // Xóa lead_document liên kết trước (vì có FK ON DELETE SET NULL)
    await supabase.from('lead_documents').delete()
      .eq('source_attachment_id', attId);
    try {
      await deleteMirroredAssignmentFileForTaskAttachment(
        attId,
        attBefore?.source_assignment_file_id,
      );
    } catch (syncErr) {
      console.warn('[delete attach] sync→assignment:', syncErr.message);
    }
    // Xóa attachment (theo id — task_id URL có thể lệch deal con / đồng bộ giao việc)
    const { error } = await supabase.from('crm_task_attachments')
      .delete().eq('id', attId);
    if (error) throw error;
    await logProjectFileActivity(req, {
      projectId,
      leadId: resolvedLeadId,
      action: 'deleted',
      fileName: attBefore.file_name || attBefore.name,
      taskTitle,
    });
    await emitCrmTaskChanged(req, {
      leadId: resolvedLeadId,
      taskId: resolvedTaskId,
      action: 'attachment_deleted',
    });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/leads/:id/task-attachments', async (req, res) => {
  try {
    const { data, error } = await supabase.from('crm_task_attachments')
      .select('*, task:crm_tasks(id, title, stage_slug, default_allowed_companies, default_allowed_departments), creator:users!crm_task_attachments_created_by_fkey(id, full_name)')
      .eq('lead_id', req.params.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    const visible = (data || []).filter((a) => canUserViewDocByAllowlist(req.user, a, a.task));
    res.json(visible);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
}).call(null, helpers["ALLOWED_DEADLINE_FIELDS"], helpers["CRM_COMMENT_ALLOWED_REACTION_EMOJI"], helpers["CRM_LEAD_KANBAN_LITE_SELECT"], helpers["CRM_LEAD_LIST_SELECT"], helpers["CRM_LEAD_LIST_SELECT_BASE"], helpers["CRM_LEAD_LIST_SELECT_EXTRA"], helpers["CRM_LEAD_REGION_EMBED"], helpers["CRM_NEW_LEAD_MAX_AGE_MS"], helpers["CRM_TASK_SELECT"], helpers["CRM_UUID_RE"], helpers["CUSTOMERS_IN_CHUNK"], helpers["CUSTOMERS_OVERVIEW_NO_MATCH_ID"], helpers["DEAL_PRE_CONTRACT_SLUGS_STAFF"], helpers["DEAL_REPORT_BUCKET_VALUES"], helpers["DEFAULT_CHECKLISTS"], helpers["DEFAULT_DEADLINE_BUCKETS"], helpers["DEFAULT_PIPELINE_STAGE_SLA_DAYS"], helpers["FOLLOWUP_TIME_BUCKETS"], helpers["PDFDocument"], helpers["QUOTATIONS_SOURCE_EXCEL_COLS"], helpers["Router"], helpers["SCAN_DUP_LITE_SELECT"], helpers["STAFF_LEAD_DEAL_REPORT_ROLES"], helpers["SURVEY_EVENT_SELECT"], helpers["SURVEY_EVENT_TYPES"], helpers["XLSX"], helpers["ZALO_APP_SETTING_KEY"], helpers["crmSchemaCompat"], helpers["addPhoneToAutoLeadBlocklist"], helpers["aggregateCrmCommentReactions"], helpers["aggregateOrgReportRows"], helpers["appendFulfillmentChildTasksForMasterDeal"], helpers["applyAllActiveWorkshopTemplatesForArea"], helpers["applyAssigneesToInsertedCrmTasks"], helpers["applyCrmLeadRegionFilterToQuery"], helpers["applyCrmTaskTemplatesToCompanyRegions"], helpers["applyCustomerIdInFilter"], helpers["applyCustomersOverviewSearch"], helpers["applyDefaultWorkshopTemplatesForNewProject"], helpers["applyLeadOrCustomerSalesFilter"], helpers["applyProductionTemplateToFulfillmentLead"], helpers["applyProductionTemplatesOnPipelineEnter"], helpers["applyStageIdFilterToQuery"], helpers["applyWorkshopTemplateToProject"], helpers["artifactNamePrefix"], helpers["assertCanFlagLead"], helpers["assertCategoryFitsSource"], helpers["assertCrmAssigneeUserMatchesLeadCompany"], helpers["assertCrmEmployeeDeleteAllowed"], helpers["assertCrmStageAdvanceAllowed"], helpers["assertDealCrmManualStageChange"], helpers["assertDealResponsible"], helpers["assertDivisionAllowedForCompany"], helpers["assertLeadDocumentOwner"], helpers["assertLeadReadableByRegionScope"], helpers["assertRegionBelongsToCompany"], helpers["assertUserCanAssignCrmRegion"], helpers["assignProductionCompanyDealResponsibility"], helpers["attachAssigneesToCrmTasks"], helpers["attachAssignmentIdsToCrmTasks"], helpers["attachCrmNextOpenTaskDeadline"], helpers["attachLeadNewFlagForList"], helpers["attachLeadReplyParents"], helpers["attachLeadUserFlagsForList"], helpers["auth"], helpers["autoCreateProjectFromWonDeal"], helpers["autoFlowFns"], helpers["autoGenCrmTasksForNewLead"], helpers["buildAssignmentNotificationInsert"], helpers["buildChecklistLeadDocumentRow"], helpers["buildCrmDashboardMinimalKpis"], helpers["buildCrmLeadsRpcFilterParams"], helpers["buildCustomersOverviewSummary"], helpers["buildDealTemplateData"], helpers["buildDefaultDeadlineConfig"], helpers["buildFirstStageIdByPipeline"], helpers["buildPipelineStagesMap"], helpers["buildProcessedCommercialItems"], helpers["buildQuotedStageOrderByPipeline"], helpers["buildScanDuplicateGroups"], helpers["buildWonStageOrderByPipeline"], helpers["canUserViewDocByAllowlist"], helpers["chatUpload"], helpers["chunkArray"], helpers["classifyDealStageForStaffReport"], helpers["commentsTableMissing"], helpers["companyRegionExtraColumnsMissing"], helpers["companyRegionGeoColumnsMissing"], helpers["computeCrmDashboardLightStats"], helpers["computeCrmLiveVersionMs"], helpers["computeCustomersOverviewSummary"], helpers["computeIsNewLeadForUser"], helpers["computeOrgOverviewReportData"], helpers["computeStaffLeadDealReportData"], helpers["computeStaffPipelineDetailPayload"], helpers["countOpenOverdueCrmTasksForLeadIds"], helpers["createCrmAssignment"], helpers["createCrmLeadTask"], helpers["createFulfillmentChildDeal"], helpers["createNotif"], helpers["createNotification"], helpers["createProjectFromLead"], helpers["crmExecutorFieldsFromTemplateItem"], helpers["crmLeadCommentAttachmentsColumnMissing"], helpers["crmLeadCommentReadReceiptsTableMissing"], helpers["crmLeadRowVisibleToRequestUser"], helpers["crmListUsesLegacyFilters"], helpers["crmNoteActivityUpload"], helpers["crmReportAsOfMs"], helpers["crmReportCreatedAtFromIso"], helpers["crmReportCreatedAtToIso"], helpers["crmReportDayKeyVn"], helpers["crmRouteErrorText"], helpers["crmTaskDeadlineModuleKey"], helpers["crmTaskMeetsCompletionRequirements"], helpers["crmTaskMeetsRequiredFileTypes"], helpers["crmTaskRequiresCompletionEvidence"], helpers["crmTemplateMatchesLeadType"], helpers["deadlineToDateOnlyIso"], helpers["defaultCompanyInfo"], helpers["defaultKpiLedgerMonthStartYmd"], helpers["deleteCrmLeadTask"], helpers["deleteMirroredAssignmentFileForTaskAttachment"], helpers["duplicateLeadIdsFromLiteRows"], helpers["ecosystemModuleKeyForCrmDeadline"], helpers["effectivePipelineStageSlaDays"], helpers["emitCrmBadgeUpdateForProject"], helpers["emitCrmDashboardChanged"], helpers["emitCrmTaskChanged"], helpers["emptyStaffLeadDealAgg"], helpers["endOfCalendarDayAfterEntered"], helpers["enforceCommercialDocCompanyOnWrite"], helpers["enforceQuotaForRequest"], helpers["ensureDealLeadDocumentsForModuleTransition"], helpers["ensureDefaultCrmPipelineForCompany"], helpers["ensureMissingCrmTasksForLead"], helpers["ensureMissingCrmTasksForPipelineStage"], helpers["ensureMissingSxTasksForLead"], helpers["excelUpload"], helpers["executeLeadMerge"], helpers["executeZaloDealStageNotify"], helpers["fetchActivityCustomerIds"], helpers["fetchAllLeadsForSlaWatchlist"], helpers["fetchAssignmentForTask"], helpers["fetchCrmCommentReactionsAggregate"], helpers["fetchCrmLeadCommentNotifyUserIds"], helpers["fetchCrmLeadDetailRow"], helpers["fetchCrmLeadWithPipelineBadges"], helpers["fetchCrmLeadsByIdsOrdered"], helpers["fetchCrmLeadsForDashboardBatched"], helpers["fetchCrmLeadsForOrgReportBatched"], helpers["fetchCrmLeadsForUserDetailBatched"], helpers["fetchCrmLeadsLiteForDuplicateScan"], helpers["fetchCrmLeadsPageViaRpc"], helpers["fetchCrmPipelineZaloSlice"], helpers["fetchCrmSurveyEventsChunk"], helpers["fetchCrmSurveyVisitsForOrgReport"], helpers["fetchLeadCommentAudienceMembers"], helpers["fetchLeadCommentAudienceMembersForRead"], helpers["fetchLeadIdsForCrmRegion"], helpers["fetchLeadMentionMembers"], helpers["fetchOrgActivityFeed"], helpers["fetchPipelineWithStagesById"], helpers["fetchScopedCrmBundles"], helpers["fillTemplateDataFromStructure"], helpers["filterCrmTasksForLeadType"], helpers["filterUserIdsForCrmLeadScopedNotification"], helpers["findChecklistItem"], helpers["followupDismissExpiresAt"], helpers["fontBold"], helpers["fontRegular"], helpers["formatMoney"], helpers["formatVNDPdf"], helpers["formatVnPhoneLocal0From84"], helpers["fs"], helpers["generateDocPdf"], helpers["generateFlowTasks"], helpers["generateStepTasks"], helpers["getAppSettingValue"], helpers["getCompanyInfo"], helpers["getCompanyRegionsList"], helpers["getCrmLeadListSelect"], helpers["getCrmLeadRegionConstraint"], helpers["getCrmLeadTypesList"], helpers["getCrmLeadsListLegacy"], helpers["getCrmSourceCategoriesList"], helpers["getCrmSourcesList"], helpers["getDefaultCrmAttachmentShare"], helpers["getDefaultDealZaloTemplateStructure"], helpers["getDefaultLeadDocumentShareForDeal"], helpers["getDefaultPipelineIdForCompany"], helpers["getLeadDocumentFieldsFromCrmTask"], helpers["getNotifyTargets"], helpers["getOverdueFollowUps"], helpers["getPipelineIdForCompanyRegion"], helpers["getPipelineZaloSlice"], helpers["getPipelinesList"], helpers["getProjectCRMSummary"], helpers["getStagesByPipelineId"], helpers["getStaleLeads"], helpers["getZaloNotifySettings"], helpers["hydrateCrmLeadsByIdsWithStaff"], helpers["hydrateCrmLeadsRpcPage"], helpers["hydrateScanDuplicateLeads"], helpers["insertQuotationRow"], helpers["invalidateAppSettingKey"], helpers["invalidatePipelinesAndStages"], helpers["invalidateRegions"], helpers["invalidateSources"], helpers["invalidateTenantUsageCache"], helpers["invokeCrmLeadsStageCountsRpc"], helpers["isAdminLike"], helpers["isAllowedLeadCommentAttachmentUrl"], helpers["isChotSanXuatCrmTaskTitle"], helpers["isCrmCompanyAdminUser"], helpers["isCrmDealAssigneeLocked"], helpers["isCrmLeadTypeColorMissingError"], helpers["isCrmModuleAdmin"], helpers["isCrmPipelinesTableMissingError"], helpers["isCrmRegionAdminUser"], helpers["isCrmSystemAdminUser"], helpers["isDealStageHoanThanhForZalo"], helpers["isDefaultAssigneeIdsColumnError"], helpers["isExecutorColumnError"], helpers["isPlatformAdmin"], helpers["isPostgresUniqueViolation"], helpers["isQuotationsSourceExcelColumnMissingError"], helpers["isSxRelationshipError"], helpers["isSystemAdmin"], helpers["isUuidString"], helpers["isValidDealZaloTemplateStructure"], helpers["isVcRelationshipError"], helpers["isVptCompanyCommercialDocViewer"], helpers["lastNominatimGeocodeAt"], helpers["leadChatFilesMulter"], helpers["leadChatJsonOrFiles"], helpers["listQuotationExcelSheets"], helpers["loadCrmTaskAttachmentCountMap"], helpers["loadOrgReportStageMap"], helpers["loadZaloLinkedLeadIdSet"], helpers["logDealActivityComment"], helpers["logDealDeadlineChangeComment"], helpers["logDealStageChangeComment"], helpers["logKanbanDeadlineUnifiedHistory"], helpers["logLeadCommentMentionActivity"], helpers["logProjectFileActivity"], helpers["mapCustomerOverviewRow"], helpers["mapLeadDisplayPhone"], helpers["mapQuotationItemsToOrderRows"], helpers["maskCustomerPhoneDisplay"], helpers["maskZaloAccessTokenPreview"], helpers["maybeSendZaloOnDealStageEnter"], helpers["mergeCrmStageDefaultAssigneeIntoUpdates"], helpers["mergeCustomerIntoTarget"], helpers["misaService"], helpers["multer"], helpers["nextCode"], helpers["nextTbProjectCode"], helpers["normalizeCrmActivityAttachments"], helpers["normalizeCrmLeadCommentAttachments"], helpers["normalizeCrmStageDefaultAssigneeUserId"], helpers["normalizeCrmUserRole"], helpers["normalizeLeadSeenByKeys"], helpers["normalizeOrgReportSurveyVisitRow"], helpers["normalizePipelineStageSlaDaysForDb"], helpers["normalizePipelineStagesList"], helpers["normalizeRegionIdList"], helpers["normalizeTemplateChecklistForCrmTask"], helpers["normalizeTemplateItemAssigneeIds"], helpers["normalizeTimestamp"], helpers["normalizeTitleFold"], helpers["normalizeVnPhoneTo84"], helpers["notifyDealCommentMentions"], helpers["notifyDealCommentParticipants"], helpers["notifyMultiple"], helpers["notifyMultipleShared"], helpers["notifyNewCrmAssignmentAssignees"], helpers["notifyProductionDocumentUploaded"], helpers["onLeadWon"], helpers["onOrderConfirmed"], helpers["onProjectCompleted"], helpers["onQuotationAccepted"], helpers["orgReportAttachFirstStageRates"], helpers["orgReportBumpFirstStageMetrics"], helpers["orgReportBumpMetrics"], helpers["orgReportBumpOpenOverdue"], helpers["orgReportBumpReceptionMetrics"], helpers["orgReportCancelRatePct"], helpers["orgReportClosedWonDealCount"], helpers["orgReportClosedWonValue"], helpers["orgReportCompareSummary"], helpers["orgReportConversionRate"], helpers["orgReportDayKey"], helpers["orgReportDealCloseValueRatePct"], helpers["orgReportDealCountsExpected"], helpers["orgReportDealIsClosedWon"], helpers["orgReportDealIsCompleted"], helpers["orgReportDealIsQuotedOrAfter"], helpers["orgReportDealProbability"], helpers["orgReportDealSplitBuckets"], helpers["orgReportExtendedDealMetrics"], helpers["orgReportFirstStageOnTimeRatePct"], helpers["orgReportFirstStageOverdueRatePct"], helpers["orgReportIsReceptionOverdue"], helpers["orgReportIsSlaOverdue"], helpers["orgReportKpiPeriodStart"], helpers["orgReportNumEst"], helpers["orgReportOverdueRatePct"], helpers["orgReportOwnerId"], helpers["orgReportPctDelta"], helpers["orgReportPreviousPeriod"], helpers["orgReportQuoteValueCloseRatePct"], helpers["orgReportQuoteWinRatePct"], helpers["orgReportReceptionOverdueRatePct"], helpers["orgReportReceptionSlaMinutes"], helpers["orgReportStageIsClosed"], helpers["orgReportStageIsLostOrCancelled"], helpers["orgReportTotalDealCount"], helpers["parseChecklist"], helpers["parseCrmLeadsPageRpc"], helpers["parseCrmReportDateRange"], helpers["parseCrmStageCountsNumericMap"], helpers["parseCrmStageCountsRpc"], helpers["parseExcelMoneyFromMappedColumn"], helpers["parseLeadIdUuidList"], helpers["parseLeadIdsCsvQuery"], helpers["parseLeadIdsFromBody"], helpers["parseLeadSeenByRaw"], helpers["parseQuotationExcelBuffer"], helpers["parseStageIdsFromQuery"], helpers["parseUuidArrayJsonb"], helpers["parseVietnameseMeasure"], helpers["parseVietnameseMoney"], helpers["path"], helpers["persistAssignmentNotification"], helpers["pgCrmDuplicateLeadIds"], helpers["pickDealZaloTemplatePayload"], helpers["pipeOrgOverviewReportPdf"], helpers["pipeStaffLeadDealSummaryPdf"], helpers["pipeStaffPipelineDetailPdf"], helpers["pipelineHasExplicitCompleted"], helpers["pipelineHasExplicitExpected"], helpers["pipelineHasExplicitWon"], helpers["plannerTableMissing"], helpers["postCrmStageDefaultAssigneeComment"], helpers["primaryTemplateItemAssigneeId"], helpers["rcInvalidateTags"], helpers["reactionsTableMissing"], helpers["redactCrmTaskNotesForViewer"], helpers["regionGeocodeInflight"], helpers["repairCrmDealPipelineDisplay"], helpers["requireUserCompanyId"], helpers["requireUserCompanyIdResolved"], helpers["resolveAssignmentIdForTask"], helpers["resolveCanonicalCrmLeadId"], helpers["resolveCommercialDocListCompanyScope"], helpers["resolveCrmBundleTemplateScope"], helpers["resolveCrmLeadsDeadlinesMap"], helpers["resolveCrmLeadsKanbanLite"], helpers["resolveCrmLeadsMergedQuery"], helpers["resolveCrmLeadsSkipDeadline"], helpers["resolveCrmLedgerNetByLeadIdsPayload"], helpers["resolveCrmReportScope"], helpers["resolveCrmTaskWriteLeadId"], helpers["resolveExecutorCompanyId"], helpers["resolveKanbanStagesForCompany"], helpers["resolveLeadCommentMentionIds"], helpers["resolveProductionCompanyForDealStage"], helpers["resolveProductionHandoverResponsibleUserId"], helpers["resolveReopenTargetStageId"], helpers["resolveRpcRegionIdsForCrmList"], helpers["resolveTenantIdForQuota"], helpers["resolveZaloDealTemplateId"], helpers["respondIfCrmPipelinesTableMissing"], helpers["responseCache"], helpers["restoreCrmTaskChecklistFromWorkshopTemplate"], helpers["resyncCrmPipelineTasksForLead"], helpers["sanitizeIsoDateQueryParam"], helpers["scheduleRegionGeocoding"], helpers["scopedAdminCompanyId"], helpers["scopedCrmCompanyIdForWrite"], helpers["sendZaloTemplateMessage"], helpers["setLeadFlag"], helpers["shallowMergeTemplateData"], helpers["skipSxWorkQuickComplete"], helpers["snapshotOrderRowFromQuotation"], helpers["stripCrmAssigneeFromWonStageUpdates"], helpers["stripCrmLeadTypeColorFromSelect"], helpers["stripQuotationsSourceExcelFields"], helpers["sumCrmKpiLedgerNetByLeadIds"], helpers["sumCrmKpiLedgerNetByUserForOrgReport"], helpers["sumCrmKpiLedgerNetByUserIds"], helpers["sumCrmKpiLedgerNetByUserIdsInDateRange"], helpers["supabase"], helpers["syncAllTaskArtifactsToAssignment"], helpers["syncChecklistItemNotes"], helpers["syncCrmLeadSxPipelineFromProject"], helpers["syncQuotationDepositToDealAndProject"], helpers["syncSxKanbanFromCrmProductionStage"], helpers["syncTaskAttachmentToAssignment"], helpers["templateItemAssigneePatch"], helpers["toCrmTaskChecklist"], helpers["unifyCrmLeadResponsibleFields"], helpers["updateCrmLeadTask"], helpers["updateQuotationRow"], helpers["upsertZaloNotifySettings"], helpers["userCanAccessCrmLeadAsParticipant"], helpers["userCanAccessCrmLeadViaVisibility"], helpers["userCanAssignAnyCrmRegion"], helpers["userCanBypassCrmDeleteRestriction"], helpers["userHasSeenLeadInSeenBy"], helpers["userIsAdmin"], helpers["userIsCrmCompanyOrRegionAdmin"], helpers["userMayAccessQuotationRow"], helpers["userSeesAllCrmDeals"], helpers["userSeesAllCrmDealsForScope"], helpers["userSeesAllCrmLeads"], helpers["userSeesAllCrmLeadsForScope"], helpers["uuidQueryOrNull"], helpers["validateProductionCompanyId"]);

module.exports = r;
