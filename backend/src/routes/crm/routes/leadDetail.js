/**
 * CRM Lead detail — merge, CRUD, stage, tasks, chat, documents, comments on lead.
 */
const { Router } = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const { supabase } = require('../../../config/supabase');
const { invalidateTags: rcInvalidateTags } = require('../../../middleware/responseCache');
const {
  crmTaskMeetsCompletionRequirements,
  crmTaskRequiresCompletionEvidence,
  crmTaskMeetsRequiredFileTypes,
  skipSxWorkQuickComplete,
} = require('../../../helpers/crmTaskCompletionEvidence');
const { logKanbanDeadlineUnifiedHistory } = require('../../../helpers/crmKanbanDeadlineHistory');
const {
  createCrmLeadTask,
  updateCrmLeadTask,
  deleteCrmLeadTask,
  restoreCrmTaskChecklistFromWorkshopTemplate,
} = require('../../../helpers/crmLeadTaskMutations');
const { attachAssigneesToCrmTasks } = require('../../../helpers/crmTaskAssignees');
const {
  templateItemAssigneePatch,
  isDefaultAssigneeIdsColumnError,
  normalizeTemplateItemAssigneeIds,
  primaryTemplateItemAssigneeId,
  applyAssigneesToInsertedCrmTasks,
} = require('../../../helpers/templateItemAssignees');
const { attachAssignmentIdsToCrmTasks } = require('../../../helpers/crmTaskAssignmentSync');
const {
  syncTaskAttachmentToAssignment,
  syncAllTaskArtifactsToAssignment,
  deleteMirroredAssignmentFileForTaskAttachment,
  fetchAssignmentForTask,
} = require('../../../helpers/crmTaskAssignmentArtifactSync');
const { createCrmAssignment } = require('../../../helpers/crmAssignmentMutations');
const {
  persistAssignmentNotification,
  buildAssignmentNotificationInsert,
  notifyNewCrmAssignmentAssignees,
  resolveAssignmentIdForTask,
} = require('../../../helpers/crmAssignmentNotifications');
const { emitNotifyBadge } = require('../../../helpers/notifyBadge');
const { emitCrmTaskChanged } = require('../../../helpers/crmTaskRealtime');
const { resolveExecutorCompanyId, isExecutorColumnError } = require('../../../helpers/crossCompanyWorkspace');
const { createNotification: createNotif, notifyMultiple: notifyMultipleShared } = require('../../../helpers/notifications');
const {
  resolveLeadCommentMentionIds,
  fetchLeadMentionMembers,
  logLeadCommentMentionActivity,
} = require('../../../helpers/crmLeadCommentMentions');
const {
  fetchCrmLeadCommentNotifyUserIds,
  notifyDealCommentMentions,
  notifyDealCommentParticipants,
} = require('../../../helpers/dealCommentNotifications');
const { userCanAccessCrmLeadAsParticipant } = require('../../../helpers/crmLeadParticipantAccess');
const { autoCreateProjectFromWonDeal } = require('../../../helpers/autoDealWonProject');
const { isCrmDealAssigneeLocked, stripCrmAssigneeFromWonStageUpdates } = require('../../../helpers/crmDealAssigneeLock');
const {
  syncCrmLeadSxPipelineFromProject,
  syncSxKanbanFromCrmProductionStage,
  emitCrmBadgeUpdateForProject,
  repairCrmDealPipelineDisplay,
} = require('../../../helpers/workshopKanban');
const {
  userSeesAllCrmDeals,
  userSeesAllCrmLeads,
  userSeesAllCrmDealsForScope,
  userSeesAllCrmLeadsForScope,
  normalizeCrmUserRole,
  isCrmRegionAdminUser,
} = require('../../../helpers/crmAccessRoles');
const {
  applyCrmLeadRegionFilterToQuery,
  assertLeadReadableByRegionScope,
  assertRegionBelongsToCompany,
  assertUserCanAssignCrmRegion,
} = require('../../../helpers/crmRegionScope');
const {
  invalidatePipelinesAndStages,
  getDefaultPipelineIdForCompany,
  getStagesByPipelineId,
} = require('../../../helpers/crmTaxonomyCache');
const { ensureDefaultCrmPipelineForCompany } = require('../../../helpers/ensureDefaultCrmPipeline');
const {
  attachLeadUserFlagsForList,
  setLeadFlag,
} = require('../../../helpers/crmLeadUserFlags');
const {
  createFulfillmentChildDeal,
  applyProductionTemplateToFulfillmentLead,
  applyProductionTemplatesOnPipelineEnter,
  ensureMissingSxTasksForLead,
} = require('../../../helpers/projectOrderFulfillment');
const { validateProductionCompanyId } = require('../../../helpers/productionCompanyGate');
const { assertDealCrmManualStageChange } = require('../../../helpers/crmDealStageGate');
const { assertCrmStageAdvanceAllowed } = require('../../../helpers/crmTaskStageAdvanceGate');
const {
  assignProductionCompanyDealResponsibility,
  resolveProductionHandoverResponsibleUserId,
} = require('../../../helpers/productionHandoverSettings');
const { ensureDealLeadDocumentsForModuleTransition } = require('../../../helpers/ensureDealLeadDocumentsForModuleTransition');
const { getLeadDocumentFieldsFromCrmTask, getDefaultCrmAttachmentShare } = require('../../../helpers/crmTaskLeadDocumentMeta');
const {
  findChecklistItem,
  artifactNamePrefix,
  syncChecklistItemNotes,
  buildChecklistLeadDocumentRow,
  parseChecklist,
} = require('../../../helpers/crmChecklistArtifacts');
const { parseVietnameseMoney, parseVietnameseMeasure, parseExcelMoneyFromMappedColumn } = require('../../../helpers/excelVnNumbers');
const { snapshotOrderRowFromQuotation, mapQuotationItemsToOrderRows } = require('../../../helpers/orderFromQuotation');
const {
  autoGenCrmTasksForNewLead,
  resyncCrmPipelineTasksForLead,
  ensureMissingCrmTasksForPipelineStage,
  ensureMissingCrmTasksForLead,
  filterCrmTasksForLeadType,
} = require('../../../helpers/autoGenCrmTasks');
const { normalizeTimestamp } = require('../../../helpers/normalizeTimestamp');
const { isPostgresUniqueViolation, nextTbProjectCode } = require('../../../helpers/projectCode');
const { addPhoneToAutoLeadBlocklist } = require('../../../helpers/crmAutoLeadPhoneBlocklist');
const { crmRouteErrorText } = require('../shared/crmRouteHelpers');
const { maybeSendZaloOnDealStageEnter } = require('../shared/pipelineHelpers');
const { emitCrmDashboardChanged, nextCode } = require('../shared/crmMutationHelpers');
const {
  userIsCrmCompanyOrRegionAdmin,
  assertCrmEmployeeDeleteAllowed,
  scopedCrmCompanyIdForWrite,
} = require('../shared/leadAccessHelpers');
const {
  getNotifyTargets,
  resolveCrmTaskWriteLeadId,
  crmExecutorFieldsFromTemplateItem,
  toCrmTaskChecklist,
} = require('../shared/leadDetailHelpers');
const {
  userIsAdmin,
  scopedAdminCompanyId,
  requireUserCompanyId,
  requireUserCompanyIdResolved,
} = require('../shared/requestScope');
const { CRM_LEAD_REGION_EMBED } = require('../shared/leadsListHelpers');
const { normalizeLeadSeenByKeys, attachCrmNextOpenTaskDeadline } = require('../shared/leadsListHelpers');

let autoFlowFns = {};
try { autoFlowFns = require('../../../helpers/autoFlow'); } catch (e) { console.warn('⚠️ autoFlow not loaded:', e.message); }
const {
  onLeadWon = async () => null,
  onOrderConfirmed = async () => null,
  onQuotationAccepted = async () => null,
  onProjectCompleted = async () => null,
  createProjectFromLead = async () => null,
} = autoFlowFns;

const excelUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

let _vcPipelineStageAvailable = true;
let _crmLeadSelectMigrationChecked = false;

const r = Router();

async function createNotification(req, userId, type, title, message, entityType, entityId, metadata) {
  return createNotif(req, userId, type, title, message, entityType, entityId, metadata || null);
}

async function notifyMultiple(req, userIds, type, title, message, entityType, entityId, metadata) {
  return notifyMultipleShared(req, userIds, type, title, message, entityType, entityId, metadata || null);
}

function formatMoney(n) {
  if (!n) return '0 đ';
  return new Intl.NumberFormat('vi-VN').format(Math.round(n)) + ' đ';
}

// ═══ GỘP LEAD/DEAL — Dùng chung cho merge-duplicates (auto) và merge-selected (thủ công) ═══

/** Gộp bản ghi khách source → target: bổ sung trường trống, gán lại FK, xóa source */
async function mergeCustomerIntoTarget(sb, targetId, sourceId) {
  if (!targetId || !sourceId || String(targetId) === String(sourceId)) return;
  const { data: t } = await sb.from('customers').select('*').eq('id', targetId).single();
  const { data: s } = await sb.from('customers').select('*').eq('id', sourceId).single();
  if (!t || !s) return;
  const pick = (a, b) =>
    a != null && String(a).trim() !== '' ? a : b != null && String(b).trim() !== '' ? b : a;
  const merged = {
    full_name: pick(t.full_name, s.full_name),
    phone: pick(t.phone, s.phone),
    email: pick(t.email, s.email),
    address: pick(t.address, s.address),
    district: pick(t.district, s.district),
    city: pick(t.city, s.city),
    company: pick(t.company, s.company),
    tax_code: pick(t.tax_code, s.tax_code),
    notes: [t.notes, s.notes].filter((x) => x && String(x).trim()).join('\n---\n') || null,
    source: pick(t.source, s.source),
    updated_at: new Date().toISOString(),
  };
  await sb.from('customers').update(merged).eq('id', targetId);
  const reassign = async (table) => {
    try {
      await sb.from(table).update({ customer_id: targetId }).eq('customer_id', sourceId);
    } catch (e) {
      console.warn(`[mergeCustomer] ${table}:`, e.message);
    }
  };
  await reassign('crm_leads');
  await reassign('quotations');
  await reassign('orders');
  await reassign('invoices');
  await reassign('projects');
  await reassign('facebook_contacts');
  try {
    await sb.from('customer_interactions').update({ customer_id: targetId }).eq('customer_id', sourceId);
  } catch (_) {}
  const { error: delErr } = await sb.from('customers').delete().eq('id', sourceId);
  if (delErr) console.warn('[mergeCustomer] delete source customer:', delErr.message);
}

/**
 * @param {string} keepId
 * @param {string[]} deleteIds
 * @param {{ finalTitle?: string, mergeCustomers?: boolean, includeSecondaryData?: boolean }} options
 * includeSecondaryData=false: chỉ xóa bản ghi phụ, không chuyển tài liệu/nhiệm vụ/báo giá/… sang bản giữ (dữ liệu gắn lead đó cascade theo DB).
 */
async function executeLeadMerge(keepId, deleteIds, options = {}) {
  const { finalTitle, mergeCustomers = false, includeSecondaryData = true } = options;
  const idsToDelete = [...new Set((deleteIds || []).filter((id) => id && String(id) !== String(keepId)))];
  if (!keepId || !idsToDelete.length) {
    const err = new Error('keep_id và ít nhất một delete_id là bắt buộc');
    err.status = 400;
    throw err;
  }

  const { data: keepLead } = await supabase
    .from('crm_leads')
    .select('id, title, customer_id, estimated_value, type')
    .eq('id', keepId)
    .single();
  if (!keepLead) {
    const err = new Error('Lead/deal giữ lại không tồn tại');
    err.status = 404;
    throw err;
  }

  const { data: delLeads } = await supabase
    .from('crm_leads')
    .select('id, customer_id, type, estimated_value')
    .in('id', idsToDelete);
  if (!delLeads?.length || delLeads.length !== idsToDelete.length) {
    const err = new Error('Một hoặc nhiều bản ghi cần gộp không tồn tại');
    err.status = 404;
    throw err;
  }
  for (const d of delLeads) {
    if (d.type !== keepLead.type) {
      const err = new Error('Chỉ gộp cùng loại: Lead với Lead hoặc Deal với Deal');
      err.status = 400;
      throw err;
    }
  }

  if (mergeCustomers) {
    let primaryCustomerId = keepLead.customer_id;
    if (!primaryCustomerId) {
      const firstCust = delLeads.find((d) => d.customer_id);
      if (firstCust?.customer_id) {
        await supabase
          .from('crm_leads')
          .update({ customer_id: firstCust.customer_id, updated_at: new Date().toISOString() })
          .eq('id', keepId);
        primaryCustomerId = firstCust.customer_id;
      }
    }
    if (primaryCustomerId) {
      const secondaryIds = [...new Set(delLeads.map((d) => d.customer_id).filter(Boolean))].filter(
        (cid) => String(cid) !== String(primaryCustomerId)
      );
      for (const sid of secondaryIds) {
        await mergeCustomerIntoTarget(supabase, primaryCustomerId, sid);
      }
    }
    const { data: k2 } = await supabase.from('crm_leads').select('estimated_value, customer_id').eq('id', keepId).single();
    if (k2) {
      keepLead.estimated_value = k2.estimated_value;
      keepLead.customer_id = k2.customer_id;
    }
  }

  if (finalTitle != null && String(finalTitle).trim()) {
    await supabase
      .from('crm_leads')
      .update({ title: String(finalTitle).trim(), updated_at: new Date().toISOString() })
      .eq('id', keepId);
  }

  /** Chuẩn hóa số cho merge (tránh cộng chuỗi / NaN). */
  const numEstMerge = (x) => {
    const n = Number(x);
    return Number.isFinite(n) ? n : 0;
  };
  /** EV ban đầu của bản giữ + tổng EV các bản xóa — chỉ dùng khi không có báo giá «đang tính» sau gộp. */
  const baseKeepEst = numEstMerge(keepLead.estimated_value);
  const delsEstSum = delLeads.reduce((s, d) => s + numEstMerge(d.estimated_value), 0);

  let movedTasks = 0;
  let movedDocs = 0;
  let movedActivities = 0;
  let movedQuotations = 0;

  if (idsToDelete.length) {
    if (includeSecondaryData) {
      // Chỉ chuyển nhiệm vụ CRM thường; KHÔNG chuyển nhiệm vụ SX (sx_*) khi gộp deal.
      const [tasksRes, docsRes, actsRes, quotesRes] = await Promise.all([
        supabase
          .from('crm_tasks')
          .select('id', { count: 'exact', head: true })
          .in('lead_id', idsToDelete)
          .not('stage_slug', 'like', 'sx_%'),
        supabase.from('lead_documents').select('id', { count: 'exact', head: true }).in('lead_id', idsToDelete),
        supabase.from('crm_activities').select('id', { count: 'exact', head: true }).in('lead_id', idsToDelete),
        supabase.from('quotations').select('id', { count: 'exact', head: true }).in('lead_id', idsToDelete),
      ]);
      movedTasks = tasksRes.count || 0;
      movedDocs = docsRes.count || 0;
      movedActivities = actsRes.count || 0;
      movedQuotations = quotesRes.count || 0;

      await Promise.all([
        supabase
          .from('crm_tasks')
          .update({ lead_id: keepId })
          .in('lead_id', idsToDelete)
          .not('stage_slug', 'like', 'sx_%'),
        supabase.from('lead_documents').update({ lead_id: keepId }).in('lead_id', idsToDelete),
        supabase.from('crm_activities').update({ lead_id: keepId }).in('lead_id', idsToDelete),
        supabase.from('quotations').update({ lead_id: keepId }).in('lead_id', idsToDelete),
        supabase.from('orders').update({ lead_id: keepId }).in('lead_id', idsToDelete),
        supabase.from('invoices').update({ lead_id: keepId }).in('lead_id', idsToDelete),
        supabase.from('facebook_contacts').update({ lead_id: keepId }).in('lead_id', idsToDelete),
        supabase.from('facebook_messages').update({ lead_id: keepId }).in('lead_id', idsToDelete),
        supabase.from('crm_pipeline_history').update({ lead_id: keepId }).in('lead_id', idsToDelete),
        supabase.from('lead_members').delete().in('lead_id', idsToDelete),
        supabase.from('lead_messages').delete().in('lead_id', idsToDelete),
      ]);
    } else {
      await Promise.all([
        supabase.from('lead_members').delete().in('lead_id', idsToDelete),
        supabase.from('lead_messages').delete().in('lead_id', idsToDelete),
      ]);
      const { error: histErr } = await supabase
        .from('crm_pipeline_history')
        .update({ lead_id: keepId })
        .in('lead_id', idsToDelete);
      if (histErr) console.warn('[merge] pipeline_history (keep-only):', histErr.message);
    }

    const { error: delErr } = await supabase.from('crm_leads').delete().in('id', idsToDelete);
    if (delErr) {
      console.error('Delete leads error:', delErr);
      throw new Error(`Không xóa được lead/deal: ${delErr.message || delErr.details || JSON.stringify(delErr)}`);
    }
  }

  // Giá trị ước tính sau gộp: nếu đã chuyển báo giá sang deal giữ → dùng TỔNG báo giá (một nguồn sự thật),
  // tránh cộng dồn EV từng deal (đã đồng bộ từ BG / trùng deal cha–con) làm gấp đôi.
  if (includeSecondaryData) {
    const { data: qAfter } = await supabase
      .from('quotations')
      .select('total')
      .eq('lead_id', keepId)
      .in('status', ['draft', 'sent', 'accepted', 'converted']);
    const sumQuotes = (qAfter || []).reduce((s, q) => s + numEstMerge(q.total), 0);
    const finalEst = sumQuotes > 0 ? sumQuotes : baseKeepEst + delsEstSum;
    await supabase
      .from('crm_leads')
      .update({ estimated_value: finalEst, updated_at: new Date().toISOString() })
      .eq('id', keepId);
  }

  return {
    success: true,
    kept: keepId,
    deleted: idsToDelete.length,
    moved: { tasks: movedTasks, documents: movedDocs, activities: movedActivities, quotations: movedQuotations },
  };
}

// ═══ QUÉT TRÙNG LEAD — Scan duplicates by customer_id + Facebook PSID ═══
r.get('/leads/scan-duplicates', async (req, res) => {
  try {
    const uid = req.user?.userId;
    const scanSelect =
      'id, code, title, type, customer_id, estimated_value, created_at, updated_at, stage_id, assigned_to, lead_owner_id, source_id, customer:customers(id, full_name, phone, email), stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, color, icon), assignee:users!crm_leads_assigned_to_fkey(id, full_name), source:crm_sources(id, name, icon)';
    const seeAllLeads = !uid || userSeesAllCrmLeads(req.user.role);
    const seeAllDeals = !uid || userSeesAllCrmDeals(req.user.role);
    let leads = [];
    if (seeAllLeads && seeAllDeals) {
      const { data } = await supabase.from('crm_leads').select(scanSelect).order('created_at', { ascending: false });
      leads = data || [];
    } else {
      let leadQ = supabase.from('crm_leads').select(scanSelect).eq('type', 'lead').order('created_at', { ascending: false });
      if (!seeAllLeads) leadQ = leadQ.or(`assigned_to.eq.${uid},lead_owner_id.eq.${uid}`);
      let dealQ = supabase.from('crm_leads').select(scanSelect).eq('type', 'deal').order('created_at', { ascending: false });
      if (!seeAllDeals) dealQ = dealQ.eq('assigned_to', uid);
      const [{ data: leadRows }, { data: dealRows }] = await Promise.all([leadQ, dealQ]);
      leads = [...(leadRows || []), ...(dealRows || [])].sort(
        (a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at),
      );
    }

    const { data: fbContacts } = await supabase.from('facebook_contacts')
      .select('id, psid, lead_id, fb_name, fb_profile_pic, page_id')
      .not('lead_id', 'is', null);

    const leadFbMap = {};
    (fbContacts || []).forEach(fc => {
      if (!leadFbMap[fc.lead_id]) leadFbMap[fc.lead_id] = [];
      leadFbMap[fc.lead_id].push(fc);
    });

    // Group by Combo: customer_id + assigned_to + source_id
    const byCombo = {};
    (leads || []).forEach(l => {
      // Chỉ nhóm nếu có ĐỦ 3 yếu tố này
      if (!l.customer_id || !l.assigned_to || !l.source_id) return;
      const key = `${l.customer_id}_${l.assigned_to}_${l.source_id}`;
      if (!byCombo[key]) byCombo[key] = [];
      byCombo[key].push({ ...l, fb_contacts: leadFbMap[l.id] || [] });
    });

    const groups = [];
    const usedLeadIds = new Set();

    // Group A: Combo trùng
    for (const key in byCombo) {
      if (byCombo[key].length > 1) {
        const group = {
          reason: 'combo_match',
          key: key,
          customer: byCombo[key][0].customer,
          assignee: byCombo[key][0].assignee,
          source: byCombo[key][0].source,
          leads: byCombo[key].sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)),
        };
        group.leads.forEach(l => usedLeadIds.add(l.id));
        groups.push(group);
      }
    }

    const totalDuplicates = groups.reduce((s, g) => s + g.leads.length - 1, 0);
    res.json({ groups, total_groups: groups.length, total_duplicates: totalDuplicates });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ GỘP LEAD — Merge duplicates: keep one, delete others (không gộp bản ghi khách) ═══
r.post('/leads/merge-duplicates', async (req, res) => {
  try {
    const { keep_id, delete_ids } = req.body;
    const result = await executeLeadMerge(keep_id, delete_ids, { mergeCustomers: false });
    emitCrmDashboardChanged(req, {
      action: 'merged',
      keep_id,
      delete_ids: (delete_ids || []).map((x) => String(x)),
      count: (delete_ids || []).length,
    });
    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// ═══ GỘP THỦ CÔNG (Kanban): gộp khách + tài liệu + chọn tiêu đề ═══
// include_secondary_data: true (mặc định) = gộp KH + chuyển tài liệu/nhiệm vụ/báo giá/… sang bản giữ
// false = chỉ giữ dữ liệu của bản được chọn; bản xóa kèm tài liệu & liên kết (CASCADE theo DB)
r.post('/leads/merge-selected', async (req, res) => {
  try {
    const { keep_id, delete_ids, title, include_secondary_data } = req.body;
    const full = include_secondary_data !== false;
    const result = await executeLeadMerge(keep_id, delete_ids, {
      mergeCustomers: full,
      finalTitle: title,
      includeSecondaryData: full,
    });
    emitCrmDashboardChanged(req, {
      action: 'merged_selected',
      keep_id,
      delete_ids: (delete_ids || []).map((x) => String(x)),
      count: (delete_ids || []).length,
    });
    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// ═══ GÁN PHỤ TRÁCH HÀNG LOẠT (cùng checkbox chọn Kanban với gộp thủ công) ═══
// Một người phụ trách: assigned_to và lead_owner_id luôn cùng giá trị.
r.post('/leads/bulk-assign', async (req, res) => {
  try {
    const { ids, assigned_to, lead_owner_id } = req.body;
    const idList = [...new Set((ids || []).filter(Boolean))];
    if (!idList.length) {
      const err = new Error('Cần ít nhất một lead/deal');
      err.status = 400;
      throw err;
    }

    const hasA = assigned_to != null && String(assigned_to).trim() !== '';
    const hasL = lead_owner_id != null && String(lead_owner_id).trim() !== '';
    if (!hasA && !hasL) {
      const err = new Error('Chọn người phụ trách');
      err.status = 400;
      throw err;
    }

    let ownerId = null;
    if (hasA && hasL && String(assigned_to).trim() !== String(lead_owner_id).trim()) {
      ownerId = String(assigned_to).trim();
    } else if (hasA) {
      ownerId = String(assigned_to).trim();
    } else {
      ownerId = String(lead_owner_id).trim();
    }

    if (!userIsAdmin(req.user?.role)) {
      return res.status(403).json({ error: 'Chỉ admin mới được gán / điều chỉnh người phụ trách.' });
    }

    const { data: olds, error: fErr } = await supabase
      .from('crm_leads')
      .select('id, type, assigned_to, lead_owner_id, title')
      .in('id', idList);
    if (fErr) throw fErr;
    if (!olds?.length) {
      const err = new Error('Không tìm thấy bản ghi');
      err.status = 404;
      throw err;
    }
    if (olds.length !== idList.length) {
      const err = new Error('Một số ID không tồn tại');
      err.status = 400;
      throw err;
    }

    const uid = req.user?.userId;
    for (const o of olds) {
      if (o.type === 'deal' && uid && !userSeesAllCrmDeals(req.user.role)) {
        if (String(o.assigned_to || '') !== String(uid)) {
          const err = new Error('Bạn không được gán deal của người khác.');
          err.status = 403;
          throw err;
        }
      }
      if (o.type === 'lead' && uid && !userSeesAllCrmLeads(req.user.role)) {
        const owns =
          String(o.assigned_to || '') === String(uid) || String(o.lead_owner_id || '') === String(uid);
        if (!owns) {
          const err = new Error('Bạn không được gán lead của người khác.');
          err.status = 403;
          throw err;
        }
      }
    }
    if (olds[0].type === 'deal' && uid && !userSeesAllCrmDeals(req.user.role) && String(ownerId) !== String(uid)) {
      return res.status(403).json({ error: 'Bạn chỉ có thể giao deal cho chính mình.' });
    }
    if (olds[0].type === 'lead' && uid && !userSeesAllCrmLeads(req.user.role) && String(ownerId) !== String(uid)) {
      return res.status(403).json({ error: 'Chỉ admin mới giao lead cho người khác.' });
    }

    const types = new Set(olds.map((o) => o.type));
    if (types.size > 1) {
      const err = new Error('Không gán hàng loạt trộn Lead và Deal trong một lần');
      err.status = 400;
      throw err;
    }

    const updatePayload = {
      updated_at: new Date().toISOString(),
      assigned_to: ownerId,
      lead_owner_id: ownerId,
    };

    const { error: uErr } = await supabase.from('crm_leads').update(updatePayload).in('id', idList);
    if (uErr) throw uErr;

    const labelRow = (o) => (o.type === 'deal' ? 'Deal' : 'Lead');
    const entityType = (o) => (o.type === 'deal' ? 'crm_deal' : 'crm_lead');

    for (const old of olds) {
      try {
        const prev = old.assigned_to || old.lead_owner_id;
        const changed = String(ownerId || '') !== String(prev || '');
        if (!changed) continue;
        if (!ownerId || String(ownerId) === String(req.user.userId)) continue;
        const lab = labelRow(old);
        const ent = entityType(old);
        await createNotification(
          req,
          ownerId,
          'lead_assigned',
          `👤 ${lab} được giao cho bạn`,
          `${lab} "${old.title || ''}" được giao cho bạn phụ trách`,
          ent,
          old.id
        );
      } catch (ne) {
        console.warn('[bulk-assign] notify:', ne.message);
      }
    }

    emitCrmDashboardChanged(req, {
      type: olds[0].type,
      action: 'bulk_assigned',
      lead_ids: idList.map((x) => String(x)),
      count: idList.length,
    });
    res.json({ success: true, updated: idList.length, type: olds[0].type });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Dọn dẹp lead trùng theo customer
r.post('/leads/cleanup-duplicates', async (req, res) => {
  try {
    const { data: leads } = await supabase.from('crm_leads')
      .select('id, title, customer_id, created_at');
    const grouped = {};
    leads.forEach(l => {
      if (!l.customer_id) return;
      if (!grouped[l.customer_id]) grouped[l.customer_id] = [];
      grouped[l.customer_id].push(l);
    });

    let deleted = 0;
    for (const cid in grouped) {
      const arr = grouped[cid].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      if (arr.length > 1) {
        const keep = arr[0];
        const dupes = arr.slice(1);
        for (const d of dupes) {
          await supabase.from('crm_tasks').update({ lead_id: keep.id }).eq('lead_id', d.id);
          await supabase.from('crm_activities').update({ lead_id: keep.id }).eq('lead_id', d.id);
          await supabase.from('lead_documents').update({ lead_id: keep.id }).eq('lead_id', d.id);
          await supabase.from('quotations').update({ lead_id: keep.id }).eq('lead_id', d.id);
          await supabase.from('crm_leads').delete().eq('id', d.id);
          deleted++;
        }
      }
    }

    if (deleted > 0) emitCrmDashboardChanged(req, { action: 'cleanup_duplicates', count: deleted });
    res.json({ success: true, deleted });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

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

/** Ưu tiên production_company_id client gửi; nếu trống → crm_lead_types.default_production_company_id của deal. */
/** Giai đoạn đích khi hồi lại deal/lead đã thua — ưu tiên stage client gửi, rồi lịch sử, rồi cột đầu pipeline. */
async function resolveReopenTargetStageId(lead, requestedStageId) {
  const raw = String(requestedStageId || '').trim();
  if (raw) {
    const { data: st } = await supabase
      .from('crm_pipeline_stages')
      .select('id, is_lost, pipeline_type, is_active')
      .eq('id', raw)
      .maybeSingle();
    if (!st || st.is_lost || st.pipeline_type !== lead.type) {
      throw new Error('Giai đoạn đích không hợp lệ (phải thuộc pipeline và không phải cột Thua).');
    }
    if (st.is_active === false) {
      throw new Error('Giai đoạn đích đã tắt.');
    }
    return raw;
  }

  const { data: histRows } = await supabase
    .from('crm_lead_stage_history')
    .select('to_stage_id, to_canonical_slug')
    .eq('lead_id', lead.id)
    .order('entered_at', { ascending: false })
    .limit(40);

  for (const h of histRows || []) {
    const slug = String(h.to_canonical_slug || '').toLowerCase();
    if (slug === 'lost' || slug === 'thua') continue;
    if (h.to_stage_id) return String(h.to_stage_id);
  }

  let sq = supabase
    .from('crm_pipeline_stages')
    .select('id')
    .eq('pipeline_type', lead.type)
    .eq('is_lost', false)
    .eq('is_active', true)
    .order('order_index', { ascending: true })
    .limit(1);
  if (lead.pipeline_id) sq = sq.eq('pipeline_id', lead.pipeline_id);
  else if (lead.company_id) sq = sq.eq('company_id', lead.company_id);
  const { data: stages } = await sq;
  if (stages?.[0]?.id) return String(stages[0].id);
  throw new Error('Không tìm được giai đoạn để hồi lại.');
}

async function resolveProductionCompanyForDealStage(leadId, explicitProductionCompanyId) {
  const raw = String(explicitProductionCompanyId || '').trim();
  if (raw) {
    const v = await validateProductionCompanyId(raw);
    return v.ok ? raw : null;
  }
  const { data: lead } = await supabase
    .from('crm_leads')
    .select('lead_type_id')
    .eq('id', leadId)
    .maybeSingle();
  if (!lead?.lead_type_id) return null;
  const { data: lt } = await supabase
    .from('crm_lead_types')
    .select('default_production_company_id')
    .eq('id', lead.lead_type_id)
    .maybeSingle();
  const def = String(lt?.default_production_company_id || '').trim();
  if (!def) return null;
  const v = await validateProductionCompanyId(def);
  return v.ok ? def : null;
}

function normalizeTitleFold(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Nhiệm vụ CRM «Chốt sản xuất» — đặt ngày hẹn → đồng bộ dự kiến SX + thông báo xưởng. */
function isChotSanXuatCrmTaskTitle(title) {
  const t = normalizeTitleFold(title);
  return t.includes('chot') && t.includes('san xuat');
}

function deadlineToDateOnlyIso(deadlineVal) {
  if (deadlineVal == null || deadlineVal === '') return null;
  const d = new Date(deadlineVal);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}




// ── CUSTOMERS CRUD ── moved to routes/customers.js / crm.js

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

r.post('/leads', async (req, res) => {
  try {
    const code = await nextCode('LEAD');
    const body = { ...req.body };
    delete body.priority; // crm_leads không có cột priority
    ['customer_id', 'source_id', 'stage_id', 'assigned_to', 'company_id', 'pipeline_id', 'lead_type_id', 'region_id'].forEach(f => {
      if (body[f] === '' || body[f] === undefined) body[f] = null;
    });
    if (!body.assigned_to) body.assigned_to = req.user.userId;
    if (!userSeesAllCrmLeadsForScope(req.user)) body.assigned_to = req.user.userId;
    body.lead_owner_id = body.assigned_to;

    const lockedLeadCo = scopedCrmCompanyIdForWrite(req);
    if (lockedLeadCo) {
      if (body.company_id && String(body.company_id) !== String(lockedLeadCo)) {
        return res.status(403).json({ error: 'Không tạo lead/deal cho công ty khác' });
      }
      body.company_id = lockedLeadCo;
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      body.company_id = cid;
    }

    // Resolve pipeline_id + first stage by company (company-scoped pipelines)
    if (!body.company_id) return res.status(400).json({ error: 'Vui lòng chọn công ty' });

    if (body.region_id) {
      const v = await assertRegionBelongsToCompany(supabase, body.company_id, body.region_id);
      if (!v.ok) return res.status(400).json({ error: v.error });
      const ar = assertUserCanAssignCrmRegion(req, body.region_id);
      if (!ar.ok) return res.status(403).json({ error: ar.error });
    } else {
      const { data: defR } = await supabase
        .from('company_regions')
        .select('id')
        .eq('company_id', body.company_id)
        .eq('is_active', true)
        .order('order_index')
        .limit(1)
        .maybeSingle();
      body.region_id = defR?.id || null;
    }
    if (!body.pipeline_id) {
      body.pipeline_id = await ensureDefaultCrmPipelineForCompany(body.company_id);
    }
    if (body.pipeline_id) {
      const { data: pl } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', body.pipeline_id).maybeSingle();
      if (!pl) return res.status(400).json({ error: 'Pipeline không tồn tại' });
      if (String(pl.company_id || '') !== String(body.company_id || '')) return res.status(400).json({ error: 'Pipeline không thuộc công ty đã chọn' });
      if (!body.stage_id) {
        const { data: firstStage } = await supabase
          .from('crm_pipeline_stages')
          .select('id')
          .eq('pipeline_id', body.pipeline_id)
          .eq('pipeline_type', 'lead')
          .eq('is_active', true)
          .order('order_index')
          .limit(1)
          .maybeSingle();
        body.stage_id = firstStage?.id || null;
      }
    }

    if (body.lead_type_id) {
      const { data: lt } = await supabase.from('crm_lead_types').select('id, company_id, applies_to, is_active').eq('id', body.lead_type_id).maybeSingle();
      if (!lt) return res.status(400).json({ error: 'Loại Lead/Deal không tồn tại' });
      if (String(lt.company_id || '') !== String(body.company_id || '')) return res.status(400).json({ error: 'Loại không thuộc công ty đã chọn' });
      if (lt.is_active === false) return res.status(400).json({ error: 'Loại đang bị ẩn' });
      if (lt.applies_to && !['lead','both'].includes(String(lt.applies_to))) return res.status(400).json({ error: 'Loại này không áp dụng cho Lead' });
    }

    if (Object.prototype.hasOwnProperty.call(body, 'referrer_name')) {
      const { resolveReferrerNameForLead } = require('../../helpers/crmReferrers');
      body.referrer_name = await resolveReferrerNameForLead({
        companyId: body.company_id,
        referrerName: body.referrer_name,
        userId: req.user.userId,
      });
    }

    const { data, error } = await supabase.from('crm_leads')
      .insert({ ...body, code, type: 'lead', lead_owner_id: body.assigned_to, created_by: req.user.userId, stage_entered_at: new Date().toISOString() })
      .select('*, customer:customers(id, full_name, phone), stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, color, icon)')
      .single();
    if (error) throw error;

    try {
      const targetIds = new Set();
      if (body.assigned_to) targetIds.add(body.assigned_to);
      const { data: admins } = await supabase.from('users').select('id').eq('role', 'admin').eq('is_active', true);
      (admins || []).forEach(a => targetIds.add(a.id));
      if (targetIds.size) await notifyMultiple(req, [...targetIds], 'lead_created',
        '🆕 Lead mới',
        `Lead "${body.title}" — Mã: ${code}`,
        'crm_lead', data.id);
    } catch (ne) { console.warn('[NOTIFY] lead_created:', ne.message); }

    try {
      await autoGenCrmTasksForNewLead(data.id, req.user.userId, req);
    } catch (autoErr) { console.error('Auto-create tasks error:', autoErr.message); }

    // Lead: toàn bộ nhiệm vụ trên chính lead (không Đơn 1 / deal con).

    emitCrmDashboardChanged(req, { type: 'lead', company_id: data.company_id, lead_id: data.id, action: 'created' });
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const isVcRelationshipError = (err) =>
  err?.message?.includes('logistics_pipeline_stages') ||
  (err?.message?.includes('relationship') && err?.message?.includes('vc_pipeline'));

const isSxRelationshipError = (err) =>
  err?.message?.includes('production_pipeline_stages') ||
  (err?.message?.includes('relationship') && String(err?.message || '').includes('sx_pipeline'));

/**
 * Chuẩn hóa id trên URL thành crm_leads.id (deal/lead thật).
 * Một số màn hình lỡ truyền project_id hoặc orders.id — vẫn mở được chi tiết.
 */
async function resolveCanonicalCrmLeadId(rawId) {
  const rid = String(rawId || '').trim();
  if (!rid) return null;
  const { data: direct } = await supabase.from('crm_leads').select('id').eq('id', rid).maybeSingle();
  if (direct?.id) return rid;

  const { data: ordByPk } = await supabase
    .from('orders')
    .select('fulfillment_lead_id, lead_id')
    .eq('id', rid)
    .maybeSingle();
  if (ordByPk?.fulfillment_lead_id) {
    const { data: fl } = await supabase.from('crm_leads').select('id').eq('id', ordByPk.fulfillment_lead_id).maybeSingle();
    if (fl?.id) return String(fl.id);
  }
  if (ordByPk?.lead_id) {
    const { data: ml } = await supabase.from('crm_leads').select('id').eq('id', ordByPk.lead_id).maybeSingle();
    if (ml?.id) return String(ml.id);
  }

  const { data: proj } = await supabase.from('projects').select('id').eq('id', rid).maybeSingle();
  if (proj?.id) {
    const { data: deals } = await supabase
      .from('crm_leads')
      .select('id, type, parent_lead_id, created_at')
      .eq('project_id', rid)
      .order('created_at', { ascending: false })
      .limit(20);
    const list = deals || [];
    const masterDeal = list.find((d) => d.type === 'deal' && !d.parent_lead_id);
    const anyDeal = list.find((d) => d.type === 'deal');
    const pick = masterDeal || anyDeal || list[0];
    if (pick?.id) return String(pick.id);
  }

  return null;
}

/** Nhiều lớp select để tránh 500 khi DB thiếu cột/embed (customers, stage, SX/VC pipeline). */
async function fetchCrmLeadDetailRow(leadId) {
  const LEAD_DETAIL_EMBED_CORE = 'source:crm_sources(id, name, icon), assignee:users!crm_leads_assigned_to_fkey(id, full_name, avatar), lead_owner:users!crm_leads_lead_owner_id_fkey(id, full_name, avatar), creator:users!crm_leads_created_by_fkey(id, full_name)';
  const LEAD_DETAIL_REGION_EMBED = CRM_LEAD_REGION_EMBED;
  const sxE = ', sx_pipeline_stage:production_pipeline_stages(id, name, color, icon, bucket_slug, company:companies(id, name, short_name))';
  const vcE = ', vc_pipeline_stage:logistics_pipeline_stages(id, name, color, icon, bucket_slug)';
  const combos = [
    { cust: 'customer:customers(id, full_name, phone, email, address, company, tax_code)', st: 'stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, color, icon, is_won, is_lost, pipeline_type, sla_days, counts_as_completed_revenue)', sx: true },
    { cust: 'customer:customers(id, full_name, phone, email, address)', st: 'stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, color, icon, is_won, is_lost, pipeline_type, sla_days, counts_as_completed_revenue)', sx: true },
    { cust: 'customer:customers(id, full_name, phone, email, address)', st: 'stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, color, icon, is_won, is_lost)', sx: true },
    { cust: 'customer:customers(id, full_name, phone, email)', st: 'stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, color, icon, is_won, is_lost)', sx: true },
    { cust: 'customer:customers(id, full_name, phone, email)', st: 'stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, color, icon)', sx: true },
    { cust: 'customer:customers(id, full_name, phone)', st: 'stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, color, icon)', sx: true },
    { cust: 'customer:customers(id, full_name, phone)', st: 'stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, color, icon)', sx: false },
  ];

  let skipVcAttempts = !_vcPipelineStageAvailable;
  const attempts = [];
  for (const c of combos) {
    if (!skipVcAttempts) attempts.push({ ...c, useVc: true });
  }
  for (const c of combos) {
    attempts.push({ ...c, useVc: false });
  }

  let lastErr = null;
  let lastPgrst116 = null;
  for (const a of attempts) {
    if (a.useVc && skipVcAttempts) continue;
    const sxPart = a.sx ? sxE : '';
    const vcPart = a.useVc ? vcE : '';
    let sel = `*, ${a.cust}, ${a.st}, ${LEAD_DETAIL_EMBED_CORE}${sxPart}${vcPart}${LEAD_DETAIL_REGION_EMBED}`;
    let { data, error } = await supabase.from('crm_leads').select(sel).eq('id', leadId).single();
    if (error && /region|company_regions|crm_leads_region_id/i.test(String(error.message || ''))) {
      sel = `*, ${a.cust}, ${a.st}, ${LEAD_DETAIL_EMBED_CORE}${sxPart}${vcPart}`;
      ({ data, error } = await supabase.from('crm_leads').select(sel).eq('id', leadId).single());
    }
    lastErr = error;
    if (!error && data) return { data, error: null };
    if (error?.code === 'PGRST116') {
      lastPgrst116 = error;
      continue;
    }
    if (a.useVc && isVcRelationshipError(error)) {
      _vcPipelineStageAvailable = false;
      _crmLeadSelectMigrationChecked = false;
      skipVcAttempts = true;
      continue;
    }
    if (a.sx && isSxRelationshipError(error)) {
      continue;
    }
  }

  const bare = await supabase.from('crm_leads').select('*').eq('id', leadId).single();
  if (bare.error?.code === 'PGRST116') {
    return { data: null, error: bare.error };
  }
  if (!bare.error && bare.data) {
    return { data: bare.data, error: null };
  }
  return { data: bare.data, error: bare.error || lastErr || lastPgrst116 };
}

/** Lead kèm embed badge SX/VC (dùng sau chuyển cột Thắng/SX). */
async function fetchCrmLeadWithPipelineBadges(leadId) {
  const patchVcJoin = _vcPipelineStageAvailable
    ? ', vc_pipeline_stage:logistics_pipeline_stages(id, name, color, icon, bucket_slug)'
    : '';
  const { data, error } = await supabase
    .from('crm_leads')
    .select(`*, sx_pipeline_stage:production_pipeline_stages(id, name, color, icon, bucket_slug, company:companies(id, name, short_name))${patchVcJoin}`)
    .eq('id', leadId)
    .single();
  if (error) throw error;
  return data;
}

/** Lightweight: chỉ trả về badge SX/VC pipeline stage — không có side effect */
r.get('/leads/:id/badge', async (req, res) => {
  try {
    const data = await fetchCrmLeadWithPipelineBadges(req.params.id);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Deal cũ: làm mới badge SX/VC; chưa bàn giao SX thì đưa cột CRM về Thắng nếu đang kẹt Sản xuất/VC. */
r.post('/leads/:id/repair-pipeline-display', async (req, res) => {
  try {
    const leadId = String(req.params.id || '').trim();
    const { data: lead } = await supabase
      .from('crm_leads')
      .select('id, type, company_id')
      .eq('id', leadId)
      .maybeSingle();
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy deal' });
    const sac = scopedAdminCompanyId(req);
    if (sac && String(lead.company_id || '') !== String(sac)) {
      return res.status(403).json({ error: 'Không có quyền' });
    }
    const ar = assertLeadReadableByRegionScope(req, lead);
    if (!ar.ok) return res.status(403).json({ error: ar.error });

    const result = await repairCrmDealPipelineDisplay(leadId);
    if (!result.ok) return res.status(400).json(result);

    let refreshed = null;
    try {
      refreshed = await fetchCrmLeadWithPipelineBadges(leadId);
    } catch (_) {
      /* optional */
    }
    const io = req.app.get('io');
    if (io && result.project_id) {
      await emitCrmBadgeUpdateForProject(result.project_id, io);
    }
    res.json({ ...result, lead: refreshed });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Lỗi sửa hiển thị pipeline' });
  }
});

/**
 * GET /crm/leads/:id — alias nhẹ trả về 1 row crm_leads (không kèm join nặng).
 * Dùng cho UI chỉ cần đọc nhanh pipeline_id / stage_id / company_id (vd. CRMTasksTab).
 * Endpoint chi tiết đầy đủ vẫn là /leads/:id/detail.
 */
r.get('/leads/:id', async (req, res) => {
  try {
    const rawId = String(req.params.id || '').trim();
    if (!rawId) return res.status(400).json({ error: 'Thiếu id' });
    const canonicalId = (await resolveCanonicalCrmLeadId(rawId)) || rawId;
    const baseFields = 'id, title, type, company_id, pipeline_id, stage_id, assigned_to, lead_owner_id, created_by, parent_lead_id, use_order_tasks, sx_template_company_id, project_id, deposit_amount, deposit_received, deposit_label';
    const projectEmbed = ', linked_project:projects!crm_leads_project_id_fkey(id, code, name, order_date, delivery_date, production_deadline)';
    let { data, error } = await supabase
      .from('crm_leads')
      .select(`${baseFields}${projectEmbed}`)
      .eq('id', canonicalId)
      .maybeSingle();
    if (error && /order_date|delivery_date|linked_project|column/i.test(String(error.message || ''))) {
      ({ data, error } = await supabase
        .from('crm_leads')
        .select(`${baseFields}, linked_project:projects!crm_leads_project_id_fkey(id, code, name, production_deadline)`)
        .eq('id', canonicalId)
        .maybeSingle());
    }
    if (error && /linked_project|relationship/i.test(String(error.message || ''))) {
      ({ data, error } = await supabase
        .from('crm_leads')
        .select(baseFields)
        .eq('id', canonicalId)
        .maybeSingle());
    }
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Không tìm thấy lead/deal' });
    const sacLdLite = scopedAdminCompanyId(req);
    if (sacLdLite && String(data.company_id || '') !== String(sacLdLite)) {
      return res.status(403).json({ error: 'Không có quyền xem lead/deal của công ty khác' });
    }
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/leads/:id/detail', async (req, res) => {
  try {
    const rawId = String(req.params.id || '').trim();
    const canonicalId = (await resolveCanonicalCrmLeadId(rawId)) || rawId;
    let { data, error } = await fetchCrmLeadDetailRow(canonicalId);
    if (error?.code === 'PGRST116') {
      return res.status(404).json({
        error: 'Không tìm thấy lead/deal',
        hint: 'Dùng đúng crm_leads.id (UUID deal/lead). Nếu đang mở từ dự án, dùng deal gắn project_id; nếu từ đơn hàng con, dùng fulfillment_lead_id.',
        requested_id: rawId,
      });
    }
    if (error || !data) {
      throw new Error(error?.message || (typeof error === 'string' ? error : 'Không tải được chi tiết lead/deal'));
    }
    const sacLd = scopedAdminCompanyId(req);
    if (sacLd && String(data.company_id || '') !== String(sacLd)) {
      return res.status(403).json({ error: 'Không có quyền xem lead/deal của công ty khác' });
    }
    const arLd = assertLeadReadableByRegionScope(req, data);
    if (!arLd.ok) return res.status(403).json({ error: arLd.error });
    const uid = req.user?.userId;
    if (uid) {
      const key = String(uid).trim().toLowerCase();
      const curNorm = normalizeLeadSeenByKeys(data.lead_seen_by);
      if (!curNorm[key]) {
        const next = { ...curNorm, [key]: new Date().toISOString() };
        const { error: uerr } = await supabase.from('crm_leads').update({ lead_seen_by: next }).eq('id', canonicalId);
        if (uerr) console.warn('[crm/leads/:id/detail] lead_seen_by update:', uerr.message);
        if (!uerr) data.lead_seen_by = next;
      }
    }
    delete data.lead_seen_by;
    // Per-user flags (ghim / đã tương tác) cho user hiện tại.
    try {
      const flags = await require('../../helpers/crmLeadUserFlags').fetchFlagsByLeadIds(uid, [canonicalId]);
      const f = flags.get(String(canonicalId));
      data.is_pinned = !!f?.is_pinned;
      data.pinned_at = f?.pinned_at || null;
      data.is_interacted = !!f?.is_interacted;
      data.interacted_at = f?.interacted_at || null;
    } catch (e) {
      // BC: bảng chưa migrate → mặc định false.
      data.is_pinned = false;
      data.pinned_at = null;
      data.is_interacted = false;
      data.interacted_at = null;
    }
    try {
      const { resolveLeadInboxChannel } = require('../../helpers/crmLeadInboxChannel');
      data.inbox_channel = await resolveLeadInboxChannel(supabase, canonicalId, data);
    } catch (e) {
      data.inbox_channel = null;
    }
    try {
      const [enriched] = await attachCrmNextOpenTaskDeadline([data]);
      data = enriched;
    } catch (e) {
      console.warn('[crm/leads/:id/detail] attachCrmNextOpenTaskDeadline:', e.message);
    }
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/leads/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data: oldLead } = await supabase.from('crm_leads').select('assigned_to, lead_owner_id, title, type, company_id, region_id, stage_id, project_id, sx_handover_at').eq('id', id).single();
    const sacPut = scopedAdminCompanyId(req);
    if (sacPut) {
      if (!oldLead || String(oldLead.company_id || '') !== String(sacPut)) {
        return res.status(403).json({ error: 'Không có quyền sửa lead/deal của công ty khác' });
      }
    } else if (isCrmRegionAdminUser(req.user) && req.user.company_id) {
      const regCo = String(req.user.company_id).trim();
      if (!oldLead || String(oldLead.company_id || '') !== String(regCo)) {
        return res.status(403).json({ error: 'Không có quyền sửa lead/deal của công ty khác' });
      }
      const ar0 = assertLeadReadableByRegionScope(req, oldLead);
      if (!ar0.ok) return res.status(403).json({ error: ar0.error });
    }

    const safeBody = { ...req.body };
    delete safeBody.stage_entered_at;
    delete safeBody.sx_pipeline_stage_id;
    delete safeBody.lead_seen_by;
    delete safeBody.sx_handover_at;
    delete safeBody.sx_template_company_id;
    delete safeBody.sx_handover_confirmed_by;
    delete safeBody.construction_start_date;
    delete safeBody.expected_production_start_date;
    delete safeBody.expected_production_end_date;
    if (Object.prototype.hasOwnProperty.call(req.body, 'assigned_to') || Object.prototype.hasOwnProperty.call(req.body, 'lead_owner_id')) {
      unifyCrmLeadResponsibleFields(safeBody);
    }
    if (sacPut && Object.prototype.hasOwnProperty.call(safeBody, 'company_id') && String(safeBody.company_id || '') !== String(sacPut)) {
      return res.status(403).json({ error: 'Không thể chuyển lead/deal sang công ty khác' });
    }

    const wantsOwnerChange =
      Object.prototype.hasOwnProperty.call(req.body, 'assigned_to')
      || Object.prototype.hasOwnProperty.call(req.body, 'lead_owner_id');
    if (wantsOwnerChange) {
      const newOwner = safeBody.assigned_to;
      const prevOwner = oldLead?.assigned_to || oldLead?.lead_owner_id;
      const adminLike = userIsCrmCompanyOrRegionAdmin(req);
      if (
        oldLead?.type === 'deal'
        && await isCrmDealAssigneeLocked(supabase, oldLead)
        && String(newOwner || '') !== String(prevOwner || '')
        && !adminLike
      ) {
        return res.status(403).json({
          error: 'Deal đã chốt Thắng — không thể đổi người phụ trách CRM. Liên hệ admin nếu cần chuyển giao.',
          code: 'crm_assignee_locked',
        });
      }
      if (newOwner == null && prevOwner != null && !adminLike) {
        return res.status(403).json({ error: 'Chỉ admin mới được bỏ gán người phụ trách.' });
      }
      if (newOwner != null) {
        const lc = oldLead?.company_id;
        if (!lc) {
          if (!adminLike) {
            return res.status(400).json({ error: 'Chọn công ty cho lead/deal trước khi đổi người phụ trách.' });
          }
        } else {
          const v = await assertCrmAssigneeUserMatchesLeadCompany(supabase, newOwner, lc);
          if (!v.ok) return res.status(400).json({ error: v.error });
        }
      }
    }

    if (Object.prototype.hasOwnProperty.call(safeBody, 'region_id')) {
      if (safeBody.region_id === '' || safeBody.region_id === undefined) safeBody.region_id = null;
    }
    if (Object.prototype.hasOwnProperty.call(safeBody, 'region_id') && safeBody.region_id != null) {
      const effectiveCompanyId = safeBody.company_id ?? oldLead?.company_id;
      const v = await assertRegionBelongsToCompany(supabase, effectiveCompanyId, safeBody.region_id);
      if (!v.ok) return res.status(400).json({ error: v.error });
      const ar = assertUserCanAssignCrmRegion(req, safeBody.region_id);
      if (!ar.ok) return res.status(403).json({ error: ar.error });
    }

    if (
      Object.prototype.hasOwnProperty.call(safeBody, 'stage_id')
      && String(safeBody.stage_id || '') !== String(oldLead?.stage_id || '')
    ) {
      safeBody.stage_entered_at = new Date().toISOString();
    }

    if (
      Object.prototype.hasOwnProperty.call(safeBody, 'stage_id')
      && String(safeBody.stage_id || '') !== String(oldLead?.stage_id || '')
    ) {
      const { data: targetStage } = await supabase
        .from('crm_pipeline_stages')
        .select('id, name, order_index, is_won, is_lost, sync_role, pipeline_type')
        .eq('id', safeBody.stage_id)
        .maybeSingle();

      const { data: prevStage } = oldLead?.stage_id
        ? await supabase
          .from('crm_pipeline_stages')
          .select('id, name, order_index, is_won, is_lost, pipeline_type, sync_role')
          .eq('id', oldLead.stage_id)
          .maybeSingle()
        : { data: null };

      if (oldLead?.type === 'deal') {
        const stageGatePut = assertDealCrmManualStageChange(oldLead, targetStage, prevStage);
        if (!stageGatePut.ok) {
          return res.status(400).json({ error: stageGatePut.error, code: stageGatePut.code });
        }
      }

      const taskGate = await assertCrmStageAdvanceAllowed({
        leadId: req.params.id,
        leadType: oldLead?.type,
        currentStage: prevStage,
        targetStage,
      });
      if (!taskGate.ok) {
        return res.status(400).json({
          error: taskGate.error,
          code: taskGate.code,
          remaining_tasks: taskGate.remaining_tasks,
        });
      }
    }

    if (Object.prototype.hasOwnProperty.call(safeBody, 'referrer_name')) {
      const { resolveReferrerNameForLead } = require('../../helpers/crmReferrers');
      safeBody.referrer_name = await resolveReferrerNameForLead({
        companyId: safeBody.company_id ?? oldLead?.company_id,
        referrerName: safeBody.referrer_name,
        userId: req.user.userId,
      });
    }

    if ('deposit_amount' in safeBody) {
      const raw = safeBody.deposit_amount;
      if (raw === '' || raw === undefined || raw === null) safeBody.deposit_amount = null;
      else {
        const n = Number(raw);
        safeBody.deposit_amount = Number.isFinite(n) && n > 0 ? n : null;
      }
    }
    if ('deposit_received' in safeBody) {
      const dr = safeBody.deposit_received;
      if (dr === '' || dr === undefined || dr === null) safeBody.deposit_received = null;
      else if (dr === true || dr === 'true') safeBody.deposit_received = true;
      else if (dr === false || dr === 'false') safeBody.deposit_received = false;
      else safeBody.deposit_received = null;
    }
    if ('deposit_label' in safeBody && safeBody.deposit_label === '') safeBody.deposit_label = null;

    if (Object.prototype.hasOwnProperty.call(safeBody, 'lead_type_id')) {
      if (!safeBody.lead_type_id) {
        safeBody.lead_type_id = null;
      } else {
        const { data: lt } = await supabase
          .from('crm_lead_types')
          .select('id, company_id, applies_to, is_active')
          .eq('id', safeBody.lead_type_id)
          .maybeSingle();
        if (!lt) return res.status(400).json({ error: 'Loại Lead/Deal không tồn tại' });
        if (String(lt.company_id || '') !== String(oldLead?.company_id || '')) return res.status(400).json({ error: 'Loại không thuộc công ty của Lead/Deal' });
        if (lt.is_active === false) return res.status(400).json({ error: 'Loại đang bị ẩn' });
        const t = oldLead?.type === 'deal' ? 'deal' : 'lead';
        if (lt.applies_to && !['both', t].includes(String(lt.applies_to))) return res.status(400).json({ error: `Loại này không áp dụng cho ${t === 'deal' ? 'Deal' : 'Lead'}` });
      }
    }

    const patchVcJoin = _vcPipelineStageAvailable ? ', vc_pipeline_stage:logistics_pipeline_stages(id, name, color, icon, bucket_slug)' : '';
    let { data, error } = await supabase.from('crm_leads')
      .update({ ...safeBody, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*, customer:customers(id, full_name, phone), stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, color, icon), sx_pipeline_stage:production_pipeline_stages(id, name, color, icon, bucket_slug, company:companies(id, name, short_name))' + patchVcJoin)
      .single();
    if (error && isVcRelationshipError(error)) {
      _vcPipelineStageAvailable = false;
      _crmLeadSelectMigrationChecked = false;
      ({ data, error } = await supabase.from('crm_leads')
        .update({ ...safeBody, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*, customer:customers(id, full_name, phone), stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, color, icon), sx_pipeline_stage:production_pipeline_stages(id, name, color, icon, bucket_slug, company:companies(id, name, short_name))')
        .single());
    }
    if (error) throw error;

    if (oldLead?.type === 'lead' && data?.type === 'deal') {
      try {
        await autoGenCrmTasksForNewLead(id, req.user.userId, req);
      } catch (genErr) {
        console.warn('[crm PUT /leads/:id] auto-gen deal tasks after lead→deal:', genErr.message);
      }
    }

    if (
      oldLead?.type === 'deal'
      && data?.project_id
      && Object.prototype.hasOwnProperty.call(safeBody, 'stage_id')
      && String(safeBody.stage_id || '') !== String(oldLead?.stage_id || '')
    ) {
      try {
        const { data: targetSxStage } = await supabase
          .from('crm_pipeline_stages')
          .select('sync_role')
          .eq('id', safeBody.stage_id)
          .maybeSingle();
        if (targetSxStage?.sync_role === 'sx_production') {
          await syncSxKanbanFromCrmProductionStage(id);
          try {
            await syncCrmLeadSxPipelineFromProject(data.project_id);
          } catch (syncErr) {
            console.warn('[crm PUT /leads/:id] syncCrmLeadSxPipelineFromProject:', syncErr.message);
          }
          try {
            const io = req.app.get('io');
            if (io) await emitCrmBadgeUpdateForProject(data.project_id, io);
          } catch (emitErr) {
            console.warn('[crm PUT /leads/:id] emitCrmBadgeUpdateForProject:', emitErr.message);
          }
        }
      } catch (sxErr) {
        console.warn('[crm PUT /leads/:id] syncSxKanbanFromCrmProductionStage:', sxErr.message);
      }
    }

    try {
      const ownerUpdated = Object.prototype.hasOwnProperty.call(req.body, 'assigned_to')
        || Object.prototype.hasOwnProperty.call(req.body, 'lead_owner_id');
      if (ownerUpdated) {
        const newOwner = safeBody.assigned_to;
        const prevOwner = oldLead?.assigned_to || oldLead?.lead_owner_id;
        if (newOwner && String(newOwner) !== String(prevOwner || '') && String(newOwner) !== String(req.user.userId)) {
          const label = oldLead?.type === 'deal' ? 'Deal' : 'Lead';
          const scopeLead = { company_id: data.company_id, region_id: data.region_id };
          const okOwners = await filterUserIdsForCrmLeadScopedNotification(supabase, scopeLead, [newOwner]);
          if (okOwners.some((x) => String(x) === String(newOwner))) {
            await createNotification(req, newOwner, 'lead_assigned',
              `👤 ${label} được giao cho bạn`,
              `${label} "${oldLead?.title || data.title}" được giao cho bạn phụ trách`,
              oldLead?.type === 'deal' ? 'crm_deal' : 'crm_lead', id);
          }
        }
      }
    } catch (_) {}

    emitCrmDashboardChanged(req, { type: data?.type || oldLead?.type, company_id: data?.company_id || oldLead?.company_id, lead_id: id, action: 'updated' });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.delete('/leads/:id', async (req, res) => {
  try {
    const { data: lead } = await supabase.from('crm_leads')
      .select('id, title, project_id, customer_id, type, company_id, pipeline_id')
      .eq('id', req.params.id).single();
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy lead' });

    if (!(await assertCrmEmployeeDeleteAllowed(req, res, lead))) return;

    const deleteReason = req.body?.delete_reason || req.query.delete_reason || '';

    // Snapshot vào Thùng rác trước khi xóa thật, để admin có thể phục hồi.
    // Nếu permanent=true thì không snapshot (xóa vĩnh viễn).
    const permanent = req.query.permanent === 'true';
    if (!permanent) {
      try {
        const { snapshotCrmLead } = require('../../helpers/trashSnapshot');
        const snapRes = await snapshotCrmLead(supabase, lead.id, req.user?.userId, {
          delete_reason: deleteReason || null,
        });
        if (!snapRes.ok) console.warn('[delete lead] snapshot trash failed:', snapRes.error);
      } catch (e) {
        console.warn('[delete lead] trash snapshot error:', e.message);
      }
    }

    const blockAuto = req.query.block_auto_recreate_phone === 'true';
    if (blockAuto && lead.customer_id) {
      const { data: cust } = await supabase.from('customers').select('phone').eq('id', lead.customer_id).maybeSingle();
      const ph = cust?.phone && String(cust.phone).trim() ? String(cust.phone).trim() : null;
      if (ph) {
        const addRes = await addPhoneToAutoLeadBlocklist(supabase, ph, {
          note: `Xóa lead ${lead.title || lead.id}`,
          userId: req.user?.userId,
          display: ph,
        });
        if (!addRes.ok) console.warn('[CRM] Chặn SĐT sau xóa lead:', addRes.error);
      }
    }

    // Nếu là lead/deal gốc: xóa luôn deal/lead con theo đơn + các orders liên quan
    try {
      const { data: childLeads } = await supabase
        .from('crm_leads')
        .select('id')
        .eq('parent_lead_id', lead.id);
      const childIds = (childLeads || []).map((c) => c.id);

      const allLeadIds = [lead.id, ...childIds];

      // Delete CRM orders linked to this lead or to child fulfillment leads
      const { data: ords } = await supabase
        .from('orders')
        .select('id')
        .or(`lead_id.eq.${lead.id}${childIds.length ? `,fulfillment_lead_id.in.(${childIds.join(',')})` : ''}`);
      const orderIds = (ords || []).map((o) => o.id);
      if (orderIds.length) {
        try { await supabase.from('order_items').delete().in('order_id', orderIds); } catch (_) {}
        try { await supabase.from('orders').delete().in('id', orderIds); } catch (_) {}
      }

      // Delete CRM tasks on parent + children (attachments cascade by FK)
      try { await supabase.from('crm_tasks').delete().in('lead_id', allLeadIds); } catch (_) {}
      try { await supabase.from('crm_activities').delete().in('lead_id', allLeadIds); } catch (_) {}
      try { await supabase.from('lead_documents').delete().in('lead_id', allLeadIds); } catch (_) {}

      // Finally delete child leads (before parent) to avoid orphans (parent_lead_id is ON DELETE SET NULL)
      if (childIds.length) {
        try { await supabase.from('crm_leads').delete().in('id', childIds); } catch (_) {}
      }
    } catch (e) {
      console.warn('[delete lead] cascade children/orders:', e.message);
    }

    if (lead.project_id) {
      const { data: taskIds } = await supabase.from('tasks').select('id').eq('project_id', lead.project_id);
      if (taskIds?.length) {
        const ids = taskIds.map(t => t.id);
        try { await supabase.from('task_checklists').delete().in('task_id', ids); } catch (_) {}
        try { await supabase.from('task_comments').delete().in('task_id', ids); } catch (_) {}
        try { await supabase.from('task_participants').delete().in('task_id', ids); } catch (_) {}
        try { await supabase.from('task_time_logs').delete().in('task_id', ids); } catch (_) {}
        try { await supabase.from('file_attachments').delete().eq('entity_type', 'task').in('entity_id', ids); } catch (_) {}
      }

      try { await supabase.from('tasks').delete().eq('project_id', lead.project_id); } catch (_) {}
      try { await supabase.from('project_comments').delete().eq('project_id', lead.project_id); } catch (_) {}
      try { await supabase.from('stage_transitions').delete().eq('project_id', lead.project_id); } catch (_) {}
      try { await supabase.from('project_workflow_lines').delete().eq('project_id', lead.project_id); } catch (_) {}
      try { await supabase.from('project_products').delete().eq('project_id', lead.project_id); } catch (_) {}
      try { await supabase.from('project_company_assignments').delete().eq('project_id', lead.project_id); } catch (_) {}
      try { await supabase.from('project_approvals').delete().eq('project_id', lead.project_id); } catch (_) {}
      try { await supabase.from('activity_logs').delete().eq('entity_type', 'project').eq('entity_id', lead.project_id); } catch (_) {}
      try { await supabase.from('notifications').delete().eq('entity_type', 'project').eq('entity_id', lead.project_id); } catch (_) {}
      await supabase.from('projects').delete().eq('id', lead.project_id);
    }

    // (lead_documents/crm_activities/crm_tasks đã dọn theo allLeadIds ở trên nếu là lead gốc)
    try { await supabase.from('lead_documents').delete().eq('lead_id', lead.id); } catch (_) {}
    try { await supabase.from('crm_activities').delete().eq('lead_id', lead.id); } catch (_) {}

    const { error } = await supabase.from('crm_leads').delete().eq('id', lead.id);
    if (error) throw error;

    emitCrmDashboardChanged(req, { type: lead.type, company_id: lead.company_id, lead_id: lead.id, action: 'deleted' });
    res.json({ success: true, message: `Đã xóa lead "${lead.title}"${lead.project_id ? ' và dự án liên kết' : ''}` });
  } catch (e) {
    console.error('Delete lead error:', e);
    res.status(500).json({ error: e.message });
  }
});

/** SĐT đã chặn — không tự tạo lead Facebook / quét SĐT (createLeadFromFacebook, lead scan). */
r.get('/auto-lead-blocked-phones', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 500);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const q = String(req.query.q || '').trim();
    let query = supabase
      .from('crm_auto_lead_blocked_phones')
      .select('id, phone_last9, phone_display, note, created_at, created_by, creator:users!crm_auto_lead_blocked_phones_created_by_fkey(id, full_name)', { count: 'exact' })
      .order('created_at', { ascending: false });
    if (q) {
      const digits = q.replace(/\D/g, '');
      if (digits) {
        // Khớp theo 9 số cuối nếu user gõ số; fallback ILIKE display.
        query = query.or(`phone_last9.ilike.%${digits.slice(-9)}%,phone_display.ilike.%${digits}%,note.ilike.%${q}%`);
      } else {
        query = query.ilike('note', `%${q}%`);
      }
    }
    query = query.range(offset, offset + limit - 1);
    const { data, error, count } = await query;
    if (error) {
      // Fallback nếu FK alias không có tên (DB cũ).
      if (/crm_auto_lead_blocked_phones_created_by_fkey/.test(error.message || '')) {
        const fb = await supabase
          .from('crm_auto_lead_blocked_phones')
          .select('id, phone_last9, phone_display, note, created_at, created_by', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);
        if (fb.error) throw fb.error;
        return res.json({ items: fb.data || [], total: fb.count || 0, limit, offset });
      }
      throw error;
    }
    res.json({ items: data || [], total: count || 0, limit, offset });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/auto-lead-blocked-phones', async (req, res) => {
  try {
    const { phone, note } = req.body || {};
    if (!phone || !String(phone).trim()) return res.status(400).json({ error: 'Thiếu số điện thoại' });
    const { addPhoneToAutoLeadBlocklist } = require('../../helpers/crmAutoLeadPhoneBlocklist');
    const result = await addPhoneToAutoLeadBlocklist(supabase, String(phone).trim(), {
      note: note ? String(note).trim() : null,
      userId: req.user?.userId || null,
      display: String(phone).trim(),
    });
    if (!result.ok) {
      if (result.error === 'invalid_phone') return res.status(400).json({ error: 'Số điện thoại không hợp lệ (cần đủ 9 số cuối)' });
      return res.status(500).json({ error: result.error });
    }
    const { data } = await supabase
      .from('crm_auto_lead_blocked_phones')
      .select('id, phone_last9, phone_display, note, created_at, created_by')
      .eq('phone_last9', result.last9)
      .maybeSingle();
    res.json({ success: true, item: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.delete('/auto-lead-blocked-phones/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('crm_auto_lead_blocked_phones').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// LEAD DOCUMENTS
// ═══════════════════════════════════════════════════════════════════════════

function parseUuidArrayJsonb(raw) {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p.map(String).filter(Boolean);
    } catch { return null; }
  }
  return null;
}

function canUserViewDocByAllowlist(user, doc, taskRow = null) {
  const { canViewerSeeByCompanyAndDept } = require('../../helpers/documentShareScope');
  return canViewerSeeByCompanyAndDept(doc, user, taskRow);
}

function redactCrmTaskNotesForViewer(user, task) {
  if (canUserViewDocByAllowlist(user, task)) return task;
  const redactChecklist = (raw) => {
    if (!Array.isArray(raw)) return raw;
    return raw.map((c) => {
      if (typeof c === 'string') return c;
      return { ...c, notes: '' };
    });
  };
  const filesOnly = task.file_count || 0;
  return {
    ...task,
    notes: null,
    checklist: redactChecklist(task.checklist),
    note_count: 0,
    attachment_count: filesOnly,
  };
}

// Get lead documents
r.get('/leads/:id/documents', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('lead_documents')
      .select('*, creator:users!lead_documents_created_by_fkey(id, full_name)')
      .eq('lead_id', req.params.id)
      .order('created_at', { ascending: false });
    if (error) throw error;

    // Mark documents that came from task attachments
    const filtered = (data || []).filter((doc) => canUserViewDocByAllowlist(req.user, doc));
    const result = filtered.map(doc => ({
      ...doc,
      is_from_task: !!doc.source_attachment_id,
    }));

    res.set('Cache-Control', 'private, no-store');
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Add document to lead + sync → crm_task_attachments (nếu có task_id)
// Task documents cho lead — nhóm theo nhiệm vụ
r.get('/leads/:id/task-documents', async (req, res) => {
  try {
    // Lấy tất cả crm_tasks của lead (có stage_slug)
    const { data: crmTasks } = await supabase.from('crm_tasks')
      .select('id, title, stage_slug, checklist, pipeline_stage_id, order_index, pipeline_stage:crm_pipeline_stages!crm_tasks_pipeline_stage_id_fkey(id, name, icon, color, order_index)')
      .eq('lead_id', req.params.id)
      .order('order_index');

    // Fallback: cũng check project tasks
    const { data: lead } = await supabase.from('crm_leads')
      .select('project_id').eq('id', req.params.id).single();
    
    let projectTasks = [];
    if (lead?.project_id) {
      const { data: pTasks } = await supabase.from('tasks')
        .select('id, title').eq('project_id', lead.project_id);
      projectTasks = pTasks || [];
    }

    const allTaskIds = [
      ...(crmTasks || []).map(t => t.id),
      ...projectTasks.map(t => t.id),
    ];
    if (!allTaskIds.length) return res.json([]);

    const { data: attachments } = await supabase.from('crm_task_attachments')
      .select('*').in('task_id', allTaskIds).order('created_at', { ascending: false });
    
    // Build task info map
    const taskMap = {};
    (crmTasks || []).forEach((t) => {
      taskMap[t.id] = {
        title: t.title,
        stage_slug: t.stage_slug,
        checklist: t.checklist,
        pipeline_stage_id: t.pipeline_stage_id,
        order_index: t.order_index,
        pipeline_stage: t.pipeline_stage,
      };
    });
    projectTasks.forEach(t => { if (!taskMap[t.id]) taskMap[t.id] = { title: t.title, stage_slug: null, checklist: [] }; });
    
    const visible = (attachments || []).filter((a) => canUserViewDocByAllowlist(req.user, a, taskMap[a.task_id]));
    const result = visible.map(a => {
      const taskInfo = taskMap[a.task_id] || {};
      const ckItem = a.checklist_id ? findChecklistItem(taskInfo, a.checklist_id) : null;
      return {
        ...a,
        task_title: taskInfo.title || 'Nhiệm vụ',
        stage_slug: taskInfo.stage_slug || null,
        pipeline_stage_id: taskInfo.pipeline_stage_id || null,
        order_index: taskInfo.order_index ?? 0,
        checklist_id: a.checklist_id || null,
        checklist_title: ckItem?.title || null,
      };
    });

    res.set('Cache-Control', 'private, no-store');
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/leads/:id/documents', async (req, res) => {
  try {
    const {
      name, doc_type, file_url, file_name, file_size, mime_type, notes,
      allowed_departments, allowed_companies, allowed_share_modules, task_id,
    } = req.body;
    
    // Get project_id from lead/deal (for sync)
    const { data: lead } = await supabase.from('crm_leads').select('project_id').eq('id', req.params.id).single();
    
    let shareMods = null;
    if (Array.isArray(allowed_share_modules) && allowed_share_modules.length) {
      const { SHARE_MODULE_KEYS } = require('../../helpers/documentShareScope');
      shareMods = [...new Set(allowed_share_modules.map((x) => String(x).toLowerCase().trim()))].filter((x) =>
        SHARE_MODULE_KEYS.has(x),
      );
      if (!shareMods.length) shareMods = null;
    }

    const { data, error } = await supabase
      .from('lead_documents')
      .insert({
        lead_id: req.params.id,
        project_id: lead?.project_id || null,
        name: name || file_name || 'Tài liệu',
        doc_type: doc_type || 'other',
        file_url,
        file_name,
        file_size,
        mime_type,
        notes,
        allowed_departments: allowed_departments || null,
        allowed_companies: allowed_companies || null,
        allowed_share_modules: shareMods,
        created_by: req.user.userId,
      })
      .select('*, creator:users!lead_documents_created_by_fkey(id, full_name)')
      .single();
    if (error) throw error;

    // ── SYNC → crm_task_attachments (nếu có task_id) ──
    if (task_id) {
      try {
        await supabase.from('crm_task_attachments').insert({
          task_id, lead_id: req.params.id,
          name: data.name, doc_type: data.doc_type, file_url: data.file_url,
          file_name: data.file_name, file_size: data.file_size, mime_type: data.mime_type,
          notes: data.notes,
          allowed_companies: allowed_companies || null,
          allowed_departments: allowed_departments || null,
          created_by: req.user.userId,
          source_document_id: data.id,
        });
      } catch (syncErr) { console.warn('Sync document→attachment:', syncErr.message); }
    }

    // 🔔 NOTIFICATION: Tài liệu mới
    try {
      const { data: leadInfo } = await supabase.from('crm_leads')
        .select('assigned_to, lead_owner_id, title').eq('id', req.params.id).single();
      const ownerIds = [leadInfo?.assigned_to, leadInfo?.lead_owner_id].filter(Boolean);
      if (ownerIds.length) await notifyMultiple(req, ownerIds, 'document_uploaded',
        '📎 Tài liệu mới',
        `"${data.name}" được upload vào deal "${leadInfo?.title || 'N/A'}"`,
        'crm_lead', req.params.id);
    } catch (ne) { console.warn('[NOTIFY] document_uploaded:', ne.message); }

    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// BULK add documents (nhiều files 1 request)
r.post('/leads/:id/documents/bulk', async (req, res) => {
  try {
    const items = req.body.items;
    if (!items?.length) return res.status(400).json({ error: 'Không có file' });

    const { data: lead } = await supabase.from('crm_leads').select('project_id').eq('id', req.params.id).single();
    const rows = items.map(item => ({
      lead_id: req.params.id,
      project_id: lead?.project_id || null,
      name: item.name || item.file_name || 'Tài liệu',
      doc_type: item.doc_type || 'other',
      file_url: item.file_url,
      file_name: item.file_name,
      file_size: item.file_size,
      mime_type: item.mime_type,
      created_by: req.user.userId,
    }));
    const { data, error } = await supabase.from('lead_documents')
      .insert(rows)
      .select('*, creator:users!lead_documents_created_by_fkey(id, full_name)');
    if (error) throw error;
    res.status(201).json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete document + sync xóa crm_task_attachment liên kết
r.delete('/leads/:id/documents/:docId', async (req, res) => {
  try {
    const { data: doc, error: docErr } = await supabase.from('lead_documents')
      .select('id, lead_id, source_attachment_id, source_file_attachment_id')
      .eq('id', req.params.docId)
      .maybeSingle();
    if (docErr) throw docErr;
    if (!doc) return res.status(404).json({ error: 'Không tìm thấy tài liệu' });
    if (doc.lead_id && String(doc.lead_id) !== String(req.params.id)) {
      return res.status(404).json({ error: 'Tài liệu không thuộc deal này' });
    }

    // Snapshot vào Thùng rác trước khi xóa thật (trừ khi permanent=true)
    if (req.query.permanent !== 'true') {
      try {
        const { snapshotLeadDocument } = require('../../helpers/trashSnapshot');
        const snapRes = await snapshotLeadDocument(supabase, req.params.docId, req.user?.userId);
        if (!snapRes.ok) console.warn('[delete lead doc] snapshot trash failed:', snapRes.error);
      } catch (e) {
        console.warn('[delete lead doc] trash snapshot error:', e.message);
      }
    }

    // Mirror từ file xưởng — xóa file gốc + bản mirror trên CRM
    if (doc.source_file_attachment_id) {
      const { removeLeadDocumentForWorkshopFile } = require('../../helpers/syncWorkshopFileToLeadDocument');
      await removeLeadDocumentForWorkshopFile(doc.source_file_attachment_id);
      const { error: fileDelErr } = await supabase
        .from('file_attachments')
        .delete()
        .eq('id', doc.source_file_attachment_id);
      if (fileDelErr) throw fileDelErr;
      const { data: mirrorDeleted, error: mirrorErr } = await supabase
        .from('lead_documents')
        .delete()
        .eq('id', req.params.docId)
        .select('id');
      if (mirrorErr) throw mirrorErr;
      if (!mirrorDeleted?.length) {
        return res.status(404).json({ error: 'Không xóa được tài liệu' });
      }
      return res.json({ success: true, via: 'workshop_file' });
    }

    // Xóa task attachment liên kết (nếu có)
    if (doc.source_attachment_id) {
      await supabase.from('crm_task_attachments')
        .delete().eq('id', doc.source_attachment_id);
    }

    // Xóa lead_documents liên kết ngược (nếu doc này là source cho attachment)
    await supabase.from('crm_task_attachments')
      .delete().eq('source_document_id', req.params.docId);

    const { data: deleted, error } = await supabase
      .from('lead_documents')
      .delete()
      .eq('id', req.params.docId)
      .select('id');
    if (error) throw error;
    if (!deleted?.length) {
      return res.status(404).json({ error: 'Không xóa được tài liệu' });
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══ PROJECT DOCUMENTS (via lead_documents with project_id) ═══
r.get('/projects/:projectId/documents', async (req, res) => {
  try {
    const { data, error } = await supabase.from('lead_documents')
      .select('*, creator:users!lead_documents_created_by_fkey(id, full_name)')
      .eq('project_id', req.params.projectId)
      .order('created_at', { ascending: false });
    if (error) throw error;

    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Update document visibility
r.put('/documents/:docId/visibility', async (req, res) => {
  try {
    const { allowed_departments, allowed_companies, shared_to_workshop, allowed_share_modules } = req.body;
    const update = {
      allowed_departments: allowed_departments || null,
      allowed_companies: allowed_companies || null,
    };
    if (shared_to_workshop !== undefined) update.shared_to_workshop = !!shared_to_workshop;
    if (allowed_share_modules !== undefined) {
      const { SHARE_MODULE_KEYS } = require('../../helpers/documentShareScope');
      const raw = Array.isArray(allowed_share_modules) ? allowed_share_modules : [];
      const cleaned = [...new Set(raw.map((x) => String(x).toLowerCase().trim()))].filter((x) =>
        SHARE_MODULE_KEYS.has(x),
      );
      update.allowed_share_modules = cleaned.length ? cleaned : null;
    }
    const { data, error } = await supabase.from('lead_documents')
      .update(update)
      .eq('id', req.params.docId)
      .select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// CONVERT LEAD → DEAL
// ═══════════════════════════════════════════════════════════════════════════

r.post('/leads/:id/convert-to-deal', async (req, res) => {
  try {
    const { data: lead } = await supabase
      .from('crm_leads')
      .select('*, customer:customers(id, full_name, phone)')
      .eq('id', req.params.id)
      .single();
    
    if (!lead) return res.status(404).json({ error: 'Lead không tồn tại' });
    if (lead.type === 'deal') return res.status(400).json({ error: 'Đã là Deal rồi' });

    // Chỉ cần có khách hàng liên kết, không bắt buộc đủ SĐT để có thể convert nhanh
    if (!lead.customer_id) {
      return res.status(400).json({ error: 'Lead chưa được liên kết khách hàng. Vào chi tiết Lead → chọn Khách hàng trước khi chuyển Deal.' });
    }

    try {
      const { applyZaloDisplayNameToCustomer } = require('../../helpers/zaloBatchTools');
      const { data: zc } = await supabase.from('zalo_contacts')
        .select('display_name, user_id')
        .eq('lead_id', req.params.id)
        .limit(1)
        .maybeSingle();
      if (zc?.display_name) {
        await applyZaloDisplayNameToCustomer(lead.customer_id, zc.display_name, { zaloUserId: zc.user_id });
      }
    } catch (zaloNameErr) {
      console.warn('[convert-to-deal] sync Zalo customer name:', zaloNameErr.message);
    }

    const companyId = req.body.company_id || lead.company_id || null;

    // Bắt buộc chọn khu vực CRM khi chuyển Lead → Deal (đồng nhất phân quyền theo region).
    const regionIdRaw =
      (req.body.region_id != null ? req.body.region_id : lead.region_id) || null;
    const regionId = regionIdRaw ? String(regionIdRaw).trim() : '';
    if (!regionId) {
      return res.status(400).json({ error: 'Vui lòng chọn khu vực trước khi chuyển Lead sang Deal.' });
    }
    {
      const { data: region, error: regionErr } = await supabase
        .from('company_regions')
        .select('id, company_id, is_active')
        .eq('id', regionId)
        .maybeSingle();
      if (regionErr) throw regionErr;
      if (!region) return res.status(400).json({ error: 'Khu vực không tồn tại.' });
      if (region.is_active === false) {
        return res.status(400).json({ error: 'Khu vực đã ngưng hoạt động — chọn khu vực khác.' });
      }
      if (companyId && String(region.company_id || '') !== String(companyId)) {
        return res.status(400).json({ error: 'Khu vực không thuộc công ty của lead.' });
      }
    }

    // Pipeline dùng cho cột Deal đầu tiên phải trùng pipeline Kanban của công ty (trước đây lấy 1 cột deal trên toàn DB → stage_id lạ, không nằm cột nào trên board).
    let pipelineForDeal = null;
    if (req.body.pipeline_id) {
      const { data: pl } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', req.body.pipeline_id).maybeSingle();
      if (!pl) return res.status(400).json({ error: 'Pipeline không tồn tại' });
      if (companyId && String(pl.company_id || '') !== String(companyId)) {
        return res.status(400).json({ error: 'Pipeline không thuộc công ty của lead' });
      }
      pipelineForDeal = pl.id;
    }
    if (!pipelineForDeal && lead.pipeline_id && companyId) {
      const { data: pl } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', lead.pipeline_id).maybeSingle();
      if (pl && String(pl.company_id || '') === String(companyId)) pipelineForDeal = pl.id;
    }
    if (!pipelineForDeal && companyId) {
      const { data: pls } = await supabase.from('crm_pipelines')
        .select('id, is_default')
        .eq('company_id', companyId)
        .eq('is_active', true);
      const list = pls || [];
      const def = list.find((p) => p.is_default) || list[0];
      pipelineForDeal = def?.id || null;
    }

    let stageQ = supabase
      .from('crm_pipeline_stages')
      .select('id')
      .eq('pipeline_type', 'deal')
      .eq('is_active', true)
      .order('order_index')
      .limit(1);
    if (pipelineForDeal) {
      stageQ = stageQ.eq('pipeline_id', pipelineForDeal);
    }
    const { data: firstDealStage, error: stagePickErr } = await stageQ.maybeSingle();
    if (stagePickErr) throw stagePickErr;
    if (!firstDealStage) {
      return res.status(500).json({
        error: pipelineForDeal
          ? 'Không tìm thấy cột Deal đầu tiên trong pipeline của công ty. Kiểm tra pipeline CRM / migration.'
          : 'Không tìm thấy giai đoạn Deal đầu tiên trên hệ thống.',
      });
    }

    // Update lead → deal (một người phụ trách)
    const ownerId = req.body.assigned_to || lead.assigned_to || lead.lead_owner_id || req.user.userId;
    if (req.body.assigned_to && !companyId) {
      if (!userIsCrmCompanyOrRegionAdmin(req)) {
        return res.status(400).json({ error: 'Chọn công ty cho lead trước khi gán người phụ trách khi chuyển Deal.' });
      }
    }
    if (ownerId && companyId) {
      const v = await assertCrmAssigneeUserMatchesLeadCompany(supabase, ownerId, companyId);
      if (!v.ok) return res.status(400).json({ error: v.error });
    }
    const { data: updatedLead, error: leadError } = await supabase
      .from('crm_leads')
      .update({
        type: 'deal',
        stage_id: firstDealStage.id,
        pipeline_id: pipelineForDeal || lead.pipeline_id || null,
        assigned_to: ownerId,
        lead_owner_id: ownerId,
        company_id: companyId,
        region_id: regionId,
        updated_at: new Date().toISOString(),
        stage_entered_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select('*')
      .single();

    if (leadError) throw leadError;

    try {
      if (ownerId && String(ownerId) !== String(req.user.userId)) {
        const scopeLead = { company_id: updatedLead.company_id, region_id: updatedLead.region_id };
        const okOwners = await filterUserIdsForCrmLeadScopedNotification(supabase, scopeLead, [ownerId]);
        if (okOwners.some((x) => String(x) === String(ownerId))) {
          await createNotification(req, ownerId, 'deal_assigned',
            '🚀 Deal mới được giao',
            `Lead "${lead.title}" đã chuyển thành Deal và giao cho bạn phụ trách`,
            'crm_deal', req.params.id);
        }
      }
    } catch (notifErr) { console.error('Convert notification error:', notifErr.message); }

    // Task attachments & notes đã được sync realtime → lead_documents
    // (qua source_attachment_id khi thêm attachment vào task)
    // Chỉ sync những attachment chưa có bản lead_document (dữ liệu cũ trước sync)
    try {
      const { data: taskAtts } = await supabase.from('crm_task_attachments')
        .select('id, name, file_url, file_name, file_size, mime_type, notes, doc_type, created_by, task:crm_tasks(id, title, stage_slug)')
        .eq('lead_id', req.params.id);
      if (taskAtts?.length) {
        const { data: convLead } = await supabase.from('crm_leads')
          .select('project_id').eq('id', req.params.id).maybeSingle();
        const convDocOpts = { linkToProject: !!convLead?.project_id };
        // Tìm những attachment chưa có lead_document link
        const { data: existingLinks } = await supabase.from('lead_documents')
          .select('source_attachment_id')
          .eq('lead_id', req.params.id)
          .not('source_attachment_id', 'is', null);
        const linkedIds = new Set((existingLinks || []).map(d => d.source_attachment_id));
        const unlinked = taskAtts.filter(att => !linkedIds.has(att.id));
        if (unlinked.length) {
          await supabase.from('lead_documents').insert(unlinked.map(att => ({
            lead_id: req.params.id,
            name: `[${att.task?.title || 'Task'}] ${att.name}`,
            doc_type: att.file_url ? (att.doc_type || 'other') : 'requirement',
            file_url: att.file_url || null, file_name: att.file_name || null,
            file_size: att.file_size || null, mime_type: att.mime_type || null,
            notes: att.notes || null, created_by: att.created_by,
            source_attachment_id: att.id,
            ...getLeadDocumentFieldsFromCrmTask(att.task, convDocOpts),
          })));
          console.log(`[convert] Synced ${unlinked.length} unlinked task attachments → lead_documents`);
        }
      }
    } catch (syncErr) { console.warn('Sync on convert:', syncErr.message); }

    // Log activity
    try {
      await supabase.from('crm_activities').insert({
        lead_id: req.params.id,
        type: 'note',
        title: '🚀 Chuyển sang Deal',
        description: 'Lead chuyển thành Deal thành công',
        created_by: req.user.userId,
      });
    } catch (_) {}

    // Gen bộ nhiệm vụ Deal (1 lần) từ template pipeline công ty; task Lead cũ giữ DB, UI ẩn qua filter pipeline_type.
    try {
      await autoGenCrmTasksForNewLead(req.params.id, req.user.userId, req);
    } catch (autoErr) {
      console.error('Auto-create tasks on convert-to-deal error:', autoErr.message);
    }

    // Không bootstrap Đơn 1 — chuyển Lead→Deal giữ một deal duy nhất, task trên deal đó.

    try {
      const { recordLeadConvertedKpi } = require('../../helpers/kpiLedger');
      const kpiOwner = ownerId || updatedLead?.lead_owner_id || updatedLead?.assigned_to;
      await recordLeadConvertedKpi({
        leadId: req.params.id,
        userId: kpiOwner,
        companyId: updatedLead?.company_id || companyId,
        createdBy: req.user.userId,
      });
    } catch (kpiErr) {
      console.warn('[convert-to-deal] KPI lead_converted:', kpiErr.message);
    }

    emitCrmDashboardChanged(req, { type: 'deal', company_id: updatedLead?.company_id, lead_id: req.params.id, action: 'converted_to_deal' });
    res.status(200).json({
      lead: updatedLead,
      message: 'Đã chuyển Lead sang Deal thành công.',
    });
  } catch (e) {
    console.error('Convert to deal error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// REVERT DEAL → LEAD
// Trả deal lại trạng thái lead (giữ data, đổi type/stage/pipeline). Bắt buộc
// chọn lại người chịu trách nhiệm (assigned_to). Cấm khi deal đã gắn dự án SX.
// ═══════════════════════════════════════════════════════════════════════════
r.post('/leads/:id/convert-to-lead', async (req, res) => {
  try {
    const { data: lead, error: leadFetchErr } = await supabase
      .from('crm_leads')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (leadFetchErr) throw leadFetchErr;
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy lead/deal' });
    if (lead.type !== 'deal') {
      return res.status(400).json({ error: 'Chỉ áp dụng cho Deal (bản ghi này đã là Lead).' });
    }
    if (lead.project_id) {
      return res.status(400).json({ error: 'Deal đã có dự án SX — không thể trả về Lead. Hủy/xóa dự án trước nếu thật sự cần.' });
    }

    // Quyền: admin công ty/khu vực hoặc đang là người phụ trách deal hiện tại.
    const uid = req.user?.userId;
    const isOwnerNow =
      uid &&
      (String(lead.assigned_to || '') === String(uid) ||
        String(lead.lead_owner_id || '') === String(uid));
    if (!userIsCrmCompanyOrRegionAdmin(req) && !isOwnerNow) {
      return res.status(403).json({ error: 'Bạn không có quyền trả deal này về Lead.' });
    }

    // Bắt buộc chọn lại người phụ trách khi trả về Lead.
    const newOwnerId = req.body?.assigned_to ? String(req.body.assigned_to).trim() : '';
    if (!newOwnerId) {
      return res.status(400).json({ error: 'Vui lòng chọn người phụ trách Lead sau khi trả về.' });
    }
    if (lead.company_id) {
      const v = await assertCrmAssigneeUserMatchesLeadCompany(supabase, newOwnerId, lead.company_id);
      if (!v.ok) return res.status(400).json({ error: v.error });
    }

    // Pipeline để chọn cột lead đầu tiên: ưu tiên pipeline hiện tại của deal,
    // fallback theo công ty (pipeline default/active).
    let pipelineForLead = lead.pipeline_id || null;
    if (!pipelineForLead && lead.company_id) {
      const { data: pls } = await supabase
        .from('crm_pipelines')
        .select('id, is_default')
        .eq('company_id', lead.company_id)
        .eq('is_active', true);
      const list = pls || [];
      const def = list.find((p) => p.is_default) || list[0];
      pipelineForLead = def?.id || null;
    }

    let stageQ = supabase
      .from('crm_pipeline_stages')
      .select('id')
      .eq('pipeline_type', 'lead')
      .eq('is_active', true)
      .order('order_index')
      .limit(1);
    if (pipelineForLead) stageQ = stageQ.eq('pipeline_id', pipelineForLead);
    const { data: firstLeadStage, error: stagePickErr } = await stageQ.maybeSingle();
    if (stagePickErr) throw stagePickErr;
    if (!firstLeadStage) {
      return res.status(500).json({
        error: pipelineForLead
          ? 'Không tìm thấy cột Lead đầu tiên trong pipeline. Kiểm tra cấu hình pipeline CRM.'
          : 'Không tìm thấy giai đoạn Lead đầu tiên trên hệ thống.',
      });
    }

    const nowIso = new Date().toISOString();
    const updatePayload = {
      type: 'lead',
      stage_id: firstLeadStage.id,
      pipeline_id: pipelineForLead || lead.pipeline_id || null,
      assigned_to: newOwnerId,
      lead_owner_id: newOwnerId,
      stage_entered_at: nowIso,
      updated_at: nowIso,
      lost_reason: null,
      lost_at: null,
    };

    const { data: updatedLead, error: updateErr } = await supabase
      .from('crm_leads')
      .update(updatePayload)
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (updateErr) throw updateErr;

    try {
      await supabase.from('crm_activities').insert({
        lead_id: req.params.id,
        type: 'note',
        title: '↩️ Trả deal về Lead',
        description: req.body?.reason
          ? `Deal được trả về Lead. Lý do: ${String(req.body.reason).slice(0, 500)}`
          : 'Deal được trả về Lead, gán lại người phụ trách.',
        created_by: req.user.userId,
      });
    } catch (_) { /* ignore activity log error */ }

    try {
      if (newOwnerId && String(newOwnerId) !== String(req.user.userId)) {
        await createNotification(
          req,
          newOwnerId,
          'lead_assigned',
          '↩️ Lead được giao',
          `Deal "${lead.title || lead.code || ''}" đã trả về Lead và giao cho bạn phụ trách.`,
          'crm_lead',
          req.params.id,
        );
      }
    } catch (notifErr) {
      console.error('[convert-to-lead] notify error:', notifErr.message);
    }

    emitCrmDashboardChanged(req, {
      type: 'lead',
      company_id: updatedLead?.company_id,
      lead_id: req.params.id,
      action: 'reverted_to_lead',
    });
    res.status(200).json({
      lead: updatedLead,
      message: 'Đã trả Deal về Lead. Đã gán người phụ trách mới.',
    });
  } catch (e) {
    console.error('Convert to lead (revert) error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PRE-CHECK chuyển giai đoạn: trả về nhiệm vụ chặn (nếu có) — KHÔNG thay đổi dữ liệu.
// Dùng để frontend hiện hộp nhiệm vụ chặn TRƯỚC khi hỏi deadline.
// ═══════════════════════════════════════════════════════════════════════════
r.get('/leads/:id/stage-advance-check', async (req, res) => {
  try {
    const targetStageId = String(req.query.target_stage_id || '').trim();
    if (!targetStageId) return res.status(400).json({ error: 'Thiếu target_stage_id' });

    const { data: lead } = await supabase
      .from('crm_leads')
      .select('id, type, stage_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy lead/deal' });

    const { data: targetStage } = await supabase
      .from('crm_pipeline_stages')
      .select('id, name, order_index, is_won, is_lost, pipeline_type')
      .eq('id', targetStageId)
      .maybeSingle();

    // Không đổi cột → không cần kiểm tra.
    if (String(lead.stage_id || '') === String(targetStageId)) {
      return res.json({ ok: true, remaining_tasks: [] });
    }

    const { data: prevStage } = lead.stage_id
      ? await supabase
        .from('crm_pipeline_stages')
        .select('id, name, order_index, is_won, is_lost, pipeline_type')
        .eq('id', lead.stage_id)
        .maybeSingle()
      : { data: null };

    const taskGate = await assertCrmStageAdvanceAllowed({
      leadId: req.params.id,
      leadType: lead.type,
      currentStage: prevStage,
      targetStage,
    });

    if (!taskGate.ok) {
      return res.json({
        ok: false,
        code: taskGate.code,
        error: taskGate.error,
        remaining_tasks: taskGate.remaining_tasks || [],
        current_stage_id: prevStage?.id || null,
        target_stage_id: targetStageId,
      });
    }
    res.json({ ok: true, remaining_tasks: [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// MOVE LEAD/DEAL TO STAGE (with validation for deal pipeline)
// ═══════════════════════════════════════════════════════════════════════════
r.patch('/leads/:id/stage', async (req, res) => {
  try {
    const { stage_id, lost_reason, production_company_id, workshop_type_id: bodyWorkshopTypeId } = req.body;
    let { data: lead } = await supabase
      .from('crm_leads')
      .select('type, project_id, company_id, assigned_to, lead_owner_id, lead_type_id, use_order_tasks, parent_lead_id, stage_id, sx_handover_at, kanban_deadline_at')
      .eq('id', req.params.id)
      .single();
    if (!lead) {
      // Fallback nếu chưa migrate cột kanban_deadline_at.
      ({ data: lead } = await supabase
        .from('crm_leads')
        .select('type, project_id, company_id, assigned_to, lead_owner_id, lead_type_id, use_order_tasks, parent_lead_id, stage_id, sx_handover_at')
        .eq('id', req.params.id)
        .single());
    }
    
    let { data: stage } = await supabase
      .from('crm_pipeline_stages')
      .select('id, name, order_index, is_won, is_lost, pipeline_type, send_zalo_on_enter, default_probability, sync_role, requires_deadline, counts_as_completed_revenue')
      .eq('id', stage_id)
      .single();
    if (!stage) {
      // Fallback nếu chưa migrate cột requires_deadline.
      ({ data: stage } = await supabase
        .from('crm_pipeline_stages')
        .select('id, name, order_index, is_won, is_lost, pipeline_type, send_zalo_on_enter, default_probability, sync_role')
        .eq('id', stage_id)
        .single());
    }
    
    // Validate: lead/deal chỉ vào cột pipeline_type khớp (lead | deal | both)
    if (!crmTemplateMatchesLeadType(stage?.pipeline_type, lead?.type)) {
      return res.status(400).json({ error: `${lead?.type === 'lead' ? 'Lead' : 'Deal'} chỉ có thể di chuyển trong pipeline riêng của nó` });
    }

    // Gate deadline: cột bật requires_deadline → bắt buộc chọn deadline khi chuyển sang (cột mới).
    const isStageChange = String(lead?.stage_id || '') !== String(stage_id || '');
    const rawDeadline = req.body?.kanban_deadline_at;
    const hasDeadlineInput = rawDeadline !== undefined && rawDeadline !== null && rawDeadline !== '';
    let parsedDeadlineTs = null;
    if (hasDeadlineInput) {
      parsedDeadlineTs = new Date(rawDeadline).getTime();
      if (Number.isNaN(parsedDeadlineTs)) {
        return res.status(400).json({ error: 'Deadline không hợp lệ' });
      }
    }
    const isStageChangeEarly = String(lead?.stage_id || '') !== String(stage_id || '');
    const { data: prevStageForGate } = isStageChangeEarly && lead?.stage_id
      ? await supabase
        .from('crm_pipeline_stages')
        .select('id, name, order_index, is_won, is_lost, pipeline_type, sync_role, counts_as_completed_revenue')
        .eq('id', lead.stage_id)
        .maybeSingle()
      : { data: null };

    const stageGate = assertDealCrmManualStageChange(lead, stage, prevStageForGate);
    if (!stageGate.ok) {
      return res.status(400).json({ error: stageGate.error, code: stageGate.code });
    }

    // Gate 1 (ưu tiên): chặn chuyển giai đoạn khi còn nhiệm vụ blocking ở giai đoạn hiện tại.
    // Phải báo TRƯỚC gate deadline để UI hiện hộp nhiệm vụ trước, rồi mới tới hộp deadline.
    if (isStageChangeEarly) {
      const prevStage = prevStageForGate;
      const taskGate = await assertCrmStageAdvanceAllowed({
        leadId: req.params.id,
        leadType: lead?.type,
        currentStage: prevStage,
        targetStage: stage,
      });
      if (!taskGate.ok) {
        return res.status(400).json({
          error: taskGate.error,
          code: taskGate.code,
          remaining_tasks: taskGate.remaining_tasks,
        });
      }
    }

    // Gate 2: cột bật requires_deadline → bắt buộc chọn deadline (sau khi đã qua gate nhiệm vụ).
    // Cột Thắng/Thua/Hoàn thành doanh thu không yêu cầu deadline.
    if (isStageChange && stage?.requires_deadline && !stage?.is_won && !stage?.is_lost && !stage?.counts_as_completed_revenue && !hasDeadlineInput) {
      return res.status(400).json({
        error: 'Cột này yêu cầu đặt deadline khi chuyển thẻ tới.',
        code: 'requires_deadline',
        requires_deadline: true,
        stage_id: stage.id,
        stage_name: stage.name,
      });
    }

    const requiresProductionPick = lead?.type === 'deal' && !lead?.project_id && !!stage?.is_won;

    let effectiveProductionCompanyId = null;
    if (requiresProductionPick) {
      effectiveProductionCompanyId = await resolveProductionCompanyForDealStage(req.params.id, production_company_id);
      const v = await validateProductionCompanyId(effectiveProductionCompanyId);
      if (!v.ok) {
        return res.status(400).json({ error: v.error, requires_production_company: true });
      }
    }

    // For leads: if moving to "Chuyển Deal" stage, return error requesting convert-to-deal
    if (lead?.type === 'lead' && stage?.is_won) {
      return res.status(400).json({ 
        error: 'Vui lòng dùng nút "Chuyển sang Deal" để chuyển lead thành deal',
        requires_conversion: true 
      });
    }
    
    const updates = { stage_id, updated_at: new Date().toISOString() };
    if (String(lead?.stage_id || '') !== String(stage_id || '')) {
      updates.stage_entered_at = new Date().toISOString();
    }
    // Deadline thủ công cho thẻ (đặt khi kéo sang cột yêu cầu deadline).
    if (hasDeadlineInput) {
      updates.kanban_deadline_at = new Date(parsedDeadlineTs).toISOString();
      const reason = (req.body?.deadline_reason || '').toString().trim();
      updates.kanban_deadline_reason = reason || null;
    }
    // Đồng bộ % xác suất theo cấu hình của cột pipeline (nếu có).
    // Mục tiêu: kéo lead/deal sang cột nào thì probability tự nhảy theo % của cột đó.
    if (stage?.default_probability !== undefined && stage?.default_probability !== null && stage?.default_probability !== '') {
      const p = Number(stage.default_probability);
      if (Number.isFinite(p)) {
        updates.probability = Math.max(0, Math.min(100, Math.round(p)));
      }
    }
    if (stage?.is_won) {
      updates.actual_close_date = new Date().toISOString().split('T')[0];
      // Deal thắng — không còn theo dõi deadline thẻ.
      updates.kanban_deadline_at = null;
      updates.kanban_deadline_reason = null;
    }
    if (stage?.counts_as_completed_revenue) {
      updates.kanban_deadline_at = null;
      updates.kanban_deadline_reason = null;
    }
    // Bàn giao SX: khóa người phụ trách CRM — NV xưởng gán qua project_production_staff sau auto-create.
    stripCrmAssigneeFromWonStageUpdates(updates, {
      leadType: lead?.type,
      isWon: !!stage?.is_won,
      requiresProductionPick,
    });
    if (stage?.is_lost) {
      updates.lost_reason = lost_reason || null;
      updates.actual_close_date = new Date().toISOString().split('T')[0];
    } else {
      if (lead?.lost_reason) updates.lost_reason = null;
      // Rời cột Thắng / Thua → bỏ ngày chốt để UI & KPI không coi deal còn «đã kết thúc»
      if (!stage?.is_won) {
        updates.actual_close_date = null;
      }
    }
    
    let { data: updatedLeadRow, error } = await supabase.from('crm_leads').update(updates).eq('id', req.params.id).select('*').single();
    if (error && /kanban_deadline/.test(error.message || '')) {
      delete updates.kanban_deadline_at;
      delete updates.kanban_deadline_reason;
      ({ data: updatedLeadRow, error } = await supabase.from('crm_leads').update(updates).eq('id', req.params.id).select('*').single());
      if (!error && hasDeadlineInput) {
        return res.status(503).json({
          error: 'Chưa cài đặt cột deadline trên database. Chạy migration database/280_crm_kanban_deadline.sql',
          code: 'migration_required',
        });
      }
    }
    if (error) throw error;
    let responseLead = updatedLeadRow;

    // Bổ sung nhiệm vụ CRM thiếu theo bộ mẫu của cột đích (chỉ thêm phần chưa có).
    if (isStageChange && stage_id) {
      try {
        const taskLeadId = await resolveCrmTaskWriteLeadId(req.params.id);
        const ensureResult = await ensureMissingCrmTasksForPipelineStage({
          leadId: taskLeadId,
          pipelineStageId: stage_id,
          userId: req.user.userId,
          req,
        });
        if (ensureResult.created > 0) {
          console.log(
            `[crm/stage] ensure missing tasks: +${ensureResult.created} for lead=${taskLeadId} stage=${stage_id}`,
          );
          await emitCrmTaskChanged(req, {
            leadId: taskLeadId,
            action: 'bulk_created',
            count: ensureResult.created,
          });
        }
      } catch (ensureErr) {
        console.warn('[crm/stage] ensureMissingCrmTasksForPipelineStage:', ensureErr.message);
      }
    }

    // Ghi lịch sử deadline khi đặt deadline lúc chuyển cột.
    if (hasDeadlineInput) {
      const dlReason = (req.body?.deadline_reason || '').toString().trim() || null;
      const newDlIso = new Date(parsedDeadlineTs).toISOString();
      try {
        await supabase.from('crm_lead_deadline_history').insert({
          lead_id: req.params.id,
          stage_id,
          old_deadline_at: lead?.kanban_deadline_at || null,
          new_deadline_at: newDlIso,
          reason: dlReason,
          source: 'stage_move',
          changed_by: req.user.userId,
        });
      } catch (histErr) {
        console.warn('[crm/stage] deadline history:', histErr.message);
      }
      await logKanbanDeadlineUnifiedHistory({
        leadId: req.params.id,
        companyId: lead?.company_id,
        actorUserId: req.user.userId,
        oldDeadlineAt: lead?.kanban_deadline_at || null,
        newDeadlineAt: newDlIso,
        reason: dlReason,
        source: 'stage_move',
      });
    }

    // Refresh kèm join SX/VC để frontend cập nhật badge ngay (không phải đợi silent reload).
    try {
      const vcJoin = _vcPipelineStageAvailable
        ? ', vc_pipeline_stage:logistics_pipeline_stages(id, name, color, icon, bucket_slug)'
        : '';
      const { data: refreshedWithBadges } = await supabase
        .from('crm_leads')
        .select(`*, sx_pipeline_stage:production_pipeline_stages(id, name, color, icon, bucket_slug, company:companies(id, name, short_name))${vcJoin}`)
        .eq('id', req.params.id)
        .single();
      if (refreshedWithBadges) responseLead = refreshedWithBadges;
    } catch (badgeErr) {
      console.warn('[crm/stage] refresh badges:', badgeErr.message);
    }

    // 🔔 NOTIFICATION: Lead/Deal đổi giai đoạn
    try {
      const { data: pStageInfo } = await supabase.from('crm_pipeline_stages')
        .select('name').eq('id', stage_id).single();
      const { data: leadInfo } = await supabase.from('crm_leads')
        .select('title, assigned_to, lead_owner_id').eq('id', req.params.id).single();
      const ownerIds = [leadInfo?.assigned_to, leadInfo?.lead_owner_id].filter(Boolean);
      if (ownerIds.length && !stage?.is_won) {
        await notifyMultiple(req, ownerIds, 'lead_stage_changed',
          `🔄 ${lead?.type === 'deal' ? 'Deal' : 'Lead'} chuyển giai đoạn`,
          `"${leadInfo?.title}" → ${pStageInfo?.name || 'Giai đoạn mới'}`,
          lead?.type === 'deal' ? 'crm_deal' : 'crm_lead', req.params.id);
      }
    } catch (ne) { console.warn('[NOTIFY] stage_changed:', ne.message); }

    // Deal → Thắng: tự tạo dự án xưởng server-side; nếu lỗi / thiếu luồng → trả deal_won cho modal
    let dealWonData = null;
    let projectAutoCreated = null;
    if (lead?.type === 'deal' && !lead?.project_id && stage?.is_won) {
      const { data: dealData } = await supabase.from('crm_leads')
        .select('*, customer:customers(id, full_name, phone, email, address)')
        .eq('id', req.params.id).single();

      if (stage?.is_won) {
        const { data: adminUsers } = await supabase.from('users').select('id').eq('role', 'admin');
        const adminIds = (adminUsers || []).map(u => u.id);
        if (adminIds.length > 0) {
          await notifyMultiple(req, adminIds, 'deal_won',
            '🏆 Deal Thắng',
            `Deal "${dealData?.title}" - Giá trị: ${(dealData?.estimated_value || 0).toLocaleString('vi-VN')} VND`,
            'crm_deal', req.params.id);
        }

        try {
          await supabase.from('crm_activities').insert({
            lead_id: req.params.id, type: 'note',
            title: '🎉 Deal Thắng!',
            description: `Deal "${dealData?.title}" đã chốt thành công.`,
            created_by: req.user.userId,
          });
        } catch (_) {}
      }

      const auto = await autoCreateProjectFromWonDeal({
        req,
        dealId: req.params.id,
        userId: req.user.userId,
        productionCompanyId: effectiveProductionCompanyId,
        workshopTypeId: bodyWorkshopTypeId || null,
      });

      if (auto.ok) {
        projectAutoCreated = {
          project_id: auto.project_id,
          project_code: auto.project_code,
          tasks_created: auto.tasks_created,
        };
        if (effectiveProductionCompanyId) {
          try {
            await assignProductionCompanyDealResponsibility({
              dealId: req.params.id,
              productionCompanyId: effectiveProductionCompanyId,
              projectId: auto.project_id,
            });
          } catch (respErr) {
            console.warn('[crm/stage] assign production company responsible:', respErr.message);
          }
        }
      } else {
        const { data: flows } = await supabase.from('workflow_flows')
          .select('id, name, description, is_default').eq('is_active', true).order('is_default', { ascending: false });
        const { data: tplSets } = await supabase.from('company_template_sets')
          .select('id, name, is_default, company_id')
          .or(`company_id.eq.${dealData?.company_id || '00000000-0000-0000-0000-000000000000'},company_id.is.null`)
          .order('is_default', { ascending: false });

        for (const ts of tplSets || []) {
          const { count } = await supabase.from('company_template_tasks')
            .select('id', { count: 'exact', head: true }).eq('template_set_id', ts.id);
          ts.task_count = count || 0;
        }

        dealWonData = {
          deal: dealData,
          flows: flows || [],
          template_sets: (tplSets || []).filter(s => s.task_count > 0),
          auto_project_error: auto.error || null,
        };
      }
    }

    setImmediate(() => {
      maybeSendZaloOnDealStageEnter({
        leadId: req.params.id,
        stageId: stage_id,
        pipelineType: stage?.pipeline_type,
        sendZaloOnEnter: !!stage?.send_zalo_on_enter,
      }).catch((err) => console.error('[Zalo OA] maybeSend:', err.message));
    });

    emitCrmDashboardChanged(req, { type: lead?.type, company_id: lead?.company_id, lead_id: req.params.id, action: 'stage_changed', stage_id });

    // CRM → SX: Sale kéo deal sang cột «Sản xuất» (sync_role) → gán Kanban xưởng + bổ sung nhiệm vụ SX thiếu
    if (lead?.type === 'deal' && stage?.sync_role === 'sx_production') {
      const pidForSx = projectAutoCreated?.project_id || responseLead?.project_id || lead?.project_id;
      if (pidForSx) {
        try {
          const sxSync = await syncSxKanbanFromCrmProductionStage(req.params.id);
          if (sxSync?.ok && sxSync.sx_pipeline_stage_id) {
            try {
              const sxTpl = await applyProductionTemplatesOnPipelineEnter({
                projectId: pidForSx,
                pipelineStageId: sxSync.sx_pipeline_stage_id,
                userId: req.user.userId,
                req,
              });
              if (sxTpl?.created > 0) {
                console.log(
                  `[crm/stage] SX templates on CRM→SX: project=${pidForSx} stage=${sxSync.sx_pipeline_stage_id} +${sxTpl.created}`,
                );
              }
            } catch (tplErr) {
              console.warn('[crm/stage] applyProductionTemplatesOnPipelineEnter:', tplErr.message);
            }
          }
        } catch (sxErr) {
          console.warn('[crm/stage] syncSxKanbanFromCrmProductionStage:', sxErr.message);
        }
      }
    }

    // Cuối luồng: sync + refresh badge SX/VC (sau auto-create / gen sx_*) để response và socket không mất tag.
    if (lead?.type === 'deal') {
      const pid =
        projectAutoCreated?.project_id ||
        responseLead?.project_id ||
        lead?.project_id ||
        null;
      if (pid) {
        try {
          await syncCrmLeadSxPipelineFromProject(pid);
        } catch (se) {
          console.warn('[crm/stage] sync sx_pipeline_stage_id (final):', se.message);
        }
        try {
          const freshBadges = await fetchCrmLeadWithPipelineBadges(req.params.id);
          if (freshBadges) responseLead = freshBadges;
        } catch (badgeFinalErr) {
          console.warn('[crm/stage] refresh badges (final):', badgeFinalErr.message);
        }
        try {
          const io = req.app.get('io');
          if (io) await emitCrmBadgeUpdateForProject(pid, io);
        } catch (emitErr) {
          console.warn('[crm/stage] emitCrmBadgeUpdateForProject:', emitErr.message);
        }
      }
    }

    res.json({ ...responseLead, deal_won: dealWonData, project_auto_created: projectAutoCreated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// DEADLINE THẺ CRM — đặt/sửa deadline thủ công (kèm lý do) + lịch sử
// ═══════════════════════════════════════════════════════════════════════════
/** PATCH /crm/leads/:id/deadline — đặt/sửa deadline; bắt buộc lý do nếu thẻ đã có deadline. */
r.patch('/leads/:id/deadline', async (req, res) => {
  try {
    const leadId = String(req.params.id || '').trim();
    const { data: lead } = await supabase
      .from('crm_leads')
      .select('id, type, company_id, stage_id, title, assigned_to, lead_owner_id, kanban_deadline_at')
      .eq('id', leadId)
      .maybeSingle();
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy lead/deal' });

    const { data: leadStage } = lead.stage_id
      ? await supabase
        .from('crm_pipeline_stages')
        .select('is_won, is_lost, counts_as_completed_revenue')
        .eq('id', lead.stage_id)
        .maybeSingle()
      : { data: null };
    if (leadStage?.is_won || leadStage?.counts_as_completed_revenue) {
      return res.status(400).json({ error: 'Deal đã chốt/hoàn thành — không đặt deadline', code: 'stage_terminal' });
    }

    const raw = req.body?.kanban_deadline_at;
    const clearing = raw === null || raw === '';
    let newIso = null;
    if (!clearing) {
      const ts = new Date(raw).getTime();
      if (Number.isNaN(ts)) return res.status(400).json({ error: 'Deadline không hợp lệ' });
      newIso = new Date(ts).toISOString();
    }

    const reason = (req.body?.reason || '').toString().trim();
    // Bắt buộc lý do khi thẻ ĐÃ có deadline (sửa/đổi/xóa).
    if (lead.kanban_deadline_at && !reason) {
      return res.status(400).json({ error: 'Vui lòng nhập lý do thay đổi deadline', code: 'reason_required' });
    }
    // Không đổi gì thì thôi.
    if (String(lead.kanban_deadline_at || '') === String(newIso || '')) {
      return res.json({ ok: true, unchanged: true, kanban_deadline_at: lead.kanban_deadline_at });
    }

    const { error: upErr } = await supabase
      .from('crm_leads')
      .update({
        kanban_deadline_at: newIso,
        kanban_deadline_reason: reason || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId);
    if (upErr) throw upErr;

    try {
      await supabase.from('crm_lead_deadline_history').insert({
        lead_id: leadId,
        stage_id: lead.stage_id || null,
        old_deadline_at: lead.kanban_deadline_at || null,
        new_deadline_at: newIso,
        reason: reason || null,
        source: 'manual_edit',
        changed_by: req.user.userId,
      });
    } catch (histErr) {
      console.warn('[crm/deadline] history:', histErr.message);
    }

    await logKanbanDeadlineUnifiedHistory({
      leadId,
      companyId: lead.company_id,
      actorUserId: req.user.userId,
      oldDeadlineAt: lead.kanban_deadline_at || null,
      newDeadlineAt: newIso,
      reason,
      source: 'manual_edit',
    });

    emitCrmDashboardChanged(req, { type: lead.type, company_id: lead.company_id, lead_id: leadId, action: 'deadline_changed' });
    res.json({ ok: true, kanban_deadline_at: newIso, kanban_deadline_reason: reason || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /crm/leads/:id/deadline-history — lịch sử đặt/sửa deadline. */
r.get('/leads/:id/deadline-history', async (req, res) => {
  try {
    const leadId = String(req.params.id || '').trim();
    const { data, error } = await supabase
      .from('crm_lead_deadline_history')
      .select('id, old_deadline_at, new_deadline_at, reason, source, created_at, changed_by, changer:users!crm_lead_deadline_history_changed_by_fkey(id, full_name), stage:crm_pipeline_stages!crm_lead_deadline_history_stage_id_fkey(id, name, color, icon)')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Hồi lại deal/lead đã đánh dấu thua — xóa lost_reason và chuyển về giai đoạn đang chạy. */
r.post('/leads/:id/reopen', async (req, res) => {
  try {
    const leadId = String(req.params.id || '').trim();
    const { data: lead } = await supabase
      .from('crm_leads')
      .select('id, type, stage_id, company_id, pipeline_id, lost_reason, title')
      .eq('id', leadId)
      .single();
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy lead/deal' });

    const sac = scopedAdminCompanyId(req);
    if (sac && String(lead.company_id || '') !== String(sac)) {
      return res.status(403).json({ error: 'Không có quyền thao tác lead/deal của công ty khác' });
    }
    const ar = assertLeadReadableByRegionScope(req, lead);
    if (!ar.ok) return res.status(403).json({ error: ar.error });

    const { data: curStage } = await supabase
      .from('crm_pipeline_stages')
      .select('is_lost')
      .eq('id', lead.stage_id)
      .maybeSingle();
    const isClosedLost = !!lead.lost_reason || !!curStage?.is_lost;
    if (!isClosedLost) {
      return res.status(400).json({ error: 'Lead/deal chưa ở trạng thái thua hoặc đã hủy.' });
    }

    const targetStageId = await resolveReopenTargetStageId(lead, req.body?.stage_id);
    const { data: targetStage } = await supabase
      .from('crm_pipeline_stages')
      .select('name, default_probability')
      .eq('id', targetStageId)
      .single();

    const updates = {
      stage_id: targetStageId,
      lost_reason: null,
      actual_close_date: null,
      stage_entered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (targetStage?.default_probability !== undefined && targetStage?.default_probability !== null && targetStage?.default_probability !== '') {
      const p = Number(targetStage.default_probability);
      if (Number.isFinite(p)) {
        updates.probability = Math.max(0, Math.min(100, Math.round(p)));
      }
    }

    const { data: updated, error } = await supabase
      .from('crm_leads')
      .update(updates)
      .eq('id', leadId)
      .select('*')
      .single();
    if (error) throw error;

    try {
      await supabase.from('crm_activities').insert({
        lead_id: leadId,
        type: 'note',
        title: lead.type === 'deal' ? '↩️ Hồi lại deal' : '↩️ Hồi lại lead',
        description: `Đã mở lại từ trạng thái thua/mất → ${targetStage?.name || 'giai đoạn mới'}`,
        created_by: req.user?.userId,
      });
    } catch (_) { /* ignore */ }

    emitCrmDashboardChanged(req, {
      type: lead.type,
      company_id: lead.company_id,
      lead_id: leadId,
      action: 'reopened',
      stage_id: targetStageId,
    });

    let responseLead = updated;
    try {
      responseLead = await fetchCrmLeadWithPipelineBadges(leadId);
    } catch (_) {
      /* optional badges */
    }

    res.json(responseLead);
  } catch (e) {
    const msg = e.message || 'Lỗi hồi lại deal';
    const status = /không tìm|không hợp lệ|chưa ở trạng thái/i.test(msg) ? 400 : 500;
    res.status(status).json({ error: msg });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVITIES
// ═══════════════════════════════════════════════════════════════════════════
r.get('/leads/:id/activities', async (req, res) => {
  const { data } = await supabase.from('crm_activities')
    .select('*, creator:users!crm_activities_created_by_fkey(id, full_name)')
    .eq('lead_id', req.params.id)
    .order('activity_date', { ascending: false });
  res.json(data || []);
});

/** Chuẩn hoá đính kèm ghi chú — chỉ URL nội bộ uploads đã xác thực qua upload */
function normalizeCrmActivityAttachments(raw) {
  if (raw == null) return null;
  const arr = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const a of arr) {
    if (!a || typeof a !== 'object') continue;
    const url = typeof a.url === 'string' ? a.url.trim() : '';
    if (!url || !url.startsWith('/uploads/')) continue;
    out.push({
      url: url.slice(0, 600),
      name: String(a.name != null ? a.name : '').slice(0, 400),
      type: String(a.type != null ? a.type : '').slice(0, 120),
      size: Number.isFinite(Number(a.size)) ? Number(a.size) : 0,
    });
  }
  return out.length ? out : null;
}

/** Upload file/hình cho ghi chú (không tạo tin nhắn chat lead) */
const crmNoteActivityUpload = multer({
  storage: multer.diskStorage({
    destination: 'uploads/lead-chat/',
    filename: (_, file, cb) =>
      cb(null, Date.now() + '-' + String(file.originalname || 'file').replace(/[^a-zA-Z0-9._-]/g, '_')),
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});

r.post('/leads/:id/activities/upload', crmNoteActivityUpload.single('file'), async (req, res) => {
  try {
    const uid = req.user?.userId ?? req.user?.id;
    if (!uid) return res.status(401).json({ error: 'Token không có user id' });
    if (!req.file) return res.status(400).json({ error: 'Không có file' });
    const url = `/uploads/lead-chat/${req.file.filename}`;
    res.json({
      url,
      name: req.file.originalname || req.file.filename,
      type: req.file.mimetype || 'application/octet-stream',
      size: req.file.size || 0,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// CREATE PROJECT FROM DEAL (Modal)
// ═══════════════════════════════════════════════════════════════════════════
r.get('/leads/:id/project-setup', async (req, res) => {
  try {
    const { data: deal } = await supabase.from('crm_leads')
      .select('*, customer:customers(id, full_name, phone, email, address)')
      .eq('id', req.params.id).single();
    if (!deal) return res.status(404).json({ error: 'Không tìm thấy' });

    const { data: flows } = await supabase.from('workflow_flows')
      .select('id, name, description, is_default').eq('is_active', true).order('is_default', { ascending: false });
    const { data: tplSets } = await supabase.from('company_template_sets')
      .select('id, name, is_default, company_id')
      .or(`company_id.eq.${deal.company_id || '00000000-0000-0000-0000-000000000000'},company_id.is.null`)
      .order('is_default', { ascending: false });

    for (const ts of tplSets || []) {
      const { count } = await supabase.from('company_template_tasks')
        .select('id', { count: 'exact', head: true }).eq('template_set_id', ts.id);
      ts.task_count = count || 0;
    }

    res.json({
      deal,
      flows: flows || [],
      template_sets: (tplSets || []).filter(s => s.task_count > 0),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/leads/:id/preview-project-tasks', async (req, res) => {
  try {
    const tplSetId = req.query.template_set_id;
    if (!tplSetId) return res.json([]);
    const { data: tasks } = await supabase.from('company_template_tasks')
      .select('id, title, description, stage_id, order_index, priority, estimated_hours, stage:workflow_stages!inner(id, name, slug, order_index)')
      .eq('template_set_id', tplSetId)
      .order('stage_id').order('order_index');
    
    const CRM_SLUGS = ['consulting', 'design', 'quotation', 'contract'];
    const grouped = {};
    for (const t of tasks || []) {
      const slug = t.stage?.slug?.replace(/-[a-f0-9]+$/, '') || '';
      const isCRM = CRM_SLUGS.includes(slug);
      const stageKey = t.stage_id;
      if (!grouped[stageKey]) {
        grouped[stageKey] = {
          stage_id: t.stage_id,
          stage_name: t.stage?.name || 'Không rõ',
          stage_order: t.stage?.order_index || 0,
          is_crm: isCRM,
          tasks: [],
        };
      }
      const checklists = DEFAULT_CHECKLISTS[t.title] || [];
      grouped[stageKey].tasks.push({
        title: t.title,
        description: t.description,
        priority: t.priority || 'medium',
        estimated_hours: t.estimated_hours,
        is_crm: isCRM,
        checklists,
      });
    }
    const result = Object.values(grouped).sort((a, b) => a.stage_order - b.stage_order);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/leads/:id/create-project', async (req, res) => {
  try {
    const { flow_id, template_set_id, project_name } = req.body;
    const dealId = req.params.id;

    // Load deal
    const { data: deal } = await supabase.from('crm_leads')
      .select('*, customer:customers(id, full_name, phone, email, address)')
      .eq('id', dealId).single();
    if (!deal) return res.status(404).json({ error: 'Deal không tồn tại' });
    if (deal.project_id) return res.status(400).json({ error: 'Deal đã có dự án', project_id: deal.project_id });

    const yr = new Date().getFullYear();
    const { data: firstStage } = await supabase.from('workflow_stages')
      .select('id').eq('slug', 'consulting').limit(1).single();

    const makeRow = (code) => ({
      code,
      name: project_name || deal.title || 'Dự án mới',
      description: deal.description || `Dự án từ Deal ${deal.code}`,
      customer_id: deal.customer_id || null,
      company_id: deal.company_id || null,
      status: 'consulting',
      current_stage_id: firstStage?.id || null,
      flow_id: flow_id || null,
      install_address: deal.customer?.address || null,
      estimated_value: deal.estimated_value || null,
      priority: 'medium',
      sales_person_id: deal.assigned_to || null,
      consult_date: new Date().toISOString(),
    });

    let project;
    let lastInsertErr;
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const code = await nextTbProjectCode(supabase, yr);
      const { data, error: projErr } = await supabase
        .from('projects')
        .insert(makeRow(code))
        .select()
        .single();
      if (!projErr) {
        project = data;
        break;
      }
      lastInsertErr = projErr;
      if (isPostgresUniqueViolation(projErr)) continue;
      throw projErr;
    }
    if (!project) throw lastInsertErr || new Error('Trùng mã dự án');

    // Link deal → project
    await supabase.from('crm_leads').update({ project_id: project.id }).eq('id', dealId);

    try {
      await ensureDealLeadDocumentsForModuleTransition({ leadId: dealId, projectId: project.id });
    } catch (e) {
      console.warn('[CREATE PROJECT] ensure lead_documents:', e.message);
    }

    // Auto move into workshop module immediately after deal won.
    const CRM_SLUGS = ['consulting', 'design', 'quotation', 'contract'];
    const WORKSHOP_SLUGS = ['production', 'delivery', 'customer-care'];
    let taskCount = 0, checkCount = 0, doneCount = 0;

    if (template_set_id) {
      const { data: tplTasks } = await supabase.from('company_template_tasks')
        .select('*, stage:workflow_stages!inner(slug)')
        .eq('template_set_id', template_set_id).order('stage_id').order('order_index');

      if (tplTasks?.length) {
        const taskInserts = tplTasks.map(t => {
          const slug = t.stage?.slug?.replace(/-[a-f0-9]+$/, '') || '';
          const isCRM = CRM_SLUGS.includes(slug);
          return {
            project_id: project.id, stage_id: t.stage_id,
            title: t.title, description: t.description || null,
            status: isCRM ? 'done' : 'pending',
            priority: t.priority || 'medium',
            order_index: t.order_index,
            estimated_hours: t.estimated_hours || null,
            completed_at: isCRM ? new Date().toISOString() : null,
            created_by_id: req.user.userId,
          };
        });
        const { data: created } = await supabase.from('tasks').insert(taskInserts).select('id, title, status');
        taskCount = (created || []).length;
        doneCount = (created || []).filter(t => t.status === 'done').length;

        // Gen checklists
        const checkInserts = [];
        for (const t of created || []) {
          const items = DEFAULT_CHECKLISTS[t.title];
          if (items?.length) {
            const isCRM = t.status === 'done';
            items.forEach((c, i) => checkInserts.push({
              task_id: t.id, title: c, order_index: i,
              is_completed: isCRM,
              completed_at: isCRM ? new Date().toISOString() : null,
            }));
          }
        }
        if (checkInserts.length) {
          await supabase.from('task_checklists').insert(checkInserts);
          checkCount = checkInserts.length;
        }
      }
    }

    // Fallback if no tasks
    if (taskCount === 0) {
      const { data: stages } = await supabase.from('workflow_stages')
        .select('id, name, slug')
        .in('slug', ['consulting','design','quotation','contract','production','delivery','shipping','installation','customer-care'])
        .order('order_index');
      if (stages?.length) {
        const fallback = stages.map(s => ({
          project_id: project.id, stage_id: s.id,
          title: `Công việc ${s.name}`,
          status: CRM_SLUGS.includes(s.slug) ? 'done' : 'pending',
          completed_at: CRM_SLUGS.includes(s.slug) ? new Date().toISOString() : null,
          priority: 'medium', order_index: 1, created_by_id: req.user.userId,
        }));
        await supabase.from('tasks').insert(fallback);
        taskCount = fallback.length;
        doneCount = fallback.filter(t => t.status === 'done').length;
      }
    }

    let workshopDefaultTemplateCount = 0;
    try {
      workshopDefaultTemplateCount = await applyDefaultWorkshopTemplatesForNewProject(project.id, req.user.userId);
      taskCount += workshopDefaultTemplateCount;
    } catch (we) {
      console.warn('[CREATE PROJECT] workshop default templates:', we.message);
    }

    // Không ép current_stage → production: deal thắng hiện ở Kanban xưởng cột "Chờ vào xưởng" (bucket won_pending).
    // Vẫn tạo sẵn nhiệm vụ xưởng (pending) để khi vào SX chỉ việc thực hiện — chỉ khi chưa có nhiệm vụ xưởng (kể cả từ bộ mẫu mặc định).
    const { data: workshopStages } = await supabase.from('workflow_stages')
      .select('id, slug, name')
      .in('slug', WORKSHOP_SLUGS)
      .order('order_index');
    if ((workshopStages || []).length) {
      const workshopStageIds = (workshopStages || []).map((s) => s.id).filter(Boolean);
      const { data: existingWorkshopTasks } = await supabase.from('tasks')
        .select('id, stage_id')
        .eq('project_id', project.id)
        .in('stage_id', workshopStageIds);

      if (!existingWorkshopTasks?.length && workshopDefaultTemplateCount === 0) {
        const workshopBlueprint = {
          production: [
            { title: 'Tiếp nhận hồ sơ từ CRM', priority: 'high' },
            { title: 'Kiểm tra bản vẽ sản xuất', priority: 'high' },
            { title: 'Lập nhu cầu vật tư', priority: 'high' },
            { title: 'Gia công sản xuất', priority: 'medium' },
            { title: 'Kiểm tra chất lượng nội bộ', priority: 'high' },
          ],
          delivery: [
            { title: 'Chuẩn bị giao hàng', priority: 'medium' },
            { title: 'Lên lịch vận chuyển và lắp đặt', priority: 'medium' },
          ],
          'customer-care': [
            { title: 'Nghiệm thu và bàn giao', priority: 'medium' },
            { title: 'Theo dõi sau lắp đặt', priority: 'low' },
          ],
        };

        const workshopTaskInserts = [];
        (workshopStages || []).forEach((stage) => {
          const items = workshopBlueprint[stage.slug] || [];
          items.forEach((item, index) => {
            workshopTaskInserts.push({
              project_id: project.id,
              stage_id: stage.id,
              title: item.title,
              status: 'pending',
              priority: item.priority,
              order_index: index + 1,
              created_by_id: req.user.userId,
            });
          });
        });

        if (workshopTaskInserts.length) {
          const { data: workshopCreated } = await supabase.from('tasks').insert(workshopTaskInserts).select('id');
          taskCount += workshopTaskInserts.length;
          if (workshopCreated?.length) {
            await supabase.from('crm_activities').insert({
              lead_id: dealId,
              type: 'note',
              title: '🏭 Đã tạo nhiệm vụ xưởng',
              description: `Tự động tạo ${workshopCreated.length} nhiệm vụ xưởng (dự án đang ở cột chờ vào xưởng).`,
              created_by: req.user.userId,
            });
          }
        }
      }
    }

    // Activity log
    await supabase.from('crm_activities').insert({
      lead_id: dealId, type: 'note',
      title: '📁 Tạo dự án thành công',
      description: `Dự án ${project.code} — ${taskCount} nhiệm vụ (${doneCount} CRM hoàn thành, ${taskCount - doneCount} cần thực hiện)`,
      created_by: req.user.userId,
    });

    console.log(`[CREATE PROJECT] ${project.code}: ${taskCount} tasks (${doneCount} done), ${checkCount} checklists`);

    try {
      await syncCrmLeadSxPipelineFromProject(project.id);
    } catch (se) {
      console.warn('[CREATE PROJECT] sync sx_pipeline_stage_id:', se.message);
    }

    // NOTE: Không tự tạo Đơn 1/2/... từ deal. Đơn hàng chỉ tạo thủ công tại tab Đơn hàng.
    const orderOne = null;

    res.json({
      id: project.id, code: project.code, name: project.name,
      tasks_created: taskCount, tasks_done: doneCount,
      tasks_pending: taskCount - doneCount,
      checklists_created: checkCount,
      order_one: null,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/leads/:id/activities', async (req, res) => {
  try {
    const b = req.body || {};
    const leadId = req.params.id;
    const attachments = normalizeCrmActivityAttachments(b.attachments);
    const type = String(b.type || 'note').trim() || 'note';
    let title = b.title != null ? String(b.title).trim().slice(0, 500) : '';
    const description = b.description != null ? String(b.description).trim() : '';
    const outcome = b.outcome != null && String(b.outcome).trim() ? String(b.outcome).trim().slice(0, 500) : null;
    let durationMinutes = null;
    if (b.duration_minutes !== '' && b.duration_minutes != null && !Number.isNaN(Number(b.duration_minutes))) {
      durationMinutes = parseInt(b.duration_minutes, 10);
    }
    const activityDate = b.activity_date || null;
    const customerId = b.customer_id || null;

    if (String(type).toLowerCase() === 'note') {
      if (!description && !attachments?.length) {
        return res.status(400).json({ error: 'Ghi chú cần nội dung hoặc đính kèm' });
      }
      if (!title) {
        title =
          (description && description.split('\n')[0]?.slice(0, 120)) ||
          (attachments?.[0]?.name ? String(attachments[0].name).slice(0, 120) : '') ||
          'Ghi chú';
      }
    } else if (!title) {
      return res.status(400).json({ error: 'Thiếu tiêu đề hoạt động' });
    }

    const row = {
      lead_id: leadId,
      type,
      title,
      description: description || null,
      outcome,
      duration_minutes: durationMinutes,
      activity_date: activityDate,
      customer_id: customerId,
      attachments,
      created_by: req.user.userId,
    };
    if (b.shared_to_workshop !== undefined) row.shared_to_workshop = !!b.shared_to_workshop;
    if (b.allowed_share_modules !== undefined) {
      const { cleanShareModulesInput } = require('../../helpers/documentShareScope');
      row.allowed_share_modules = row.shared_to_workshop
        ? cleanShareModulesInput(b.allowed_share_modules)
        : null;
    } else if (row.shared_to_workshop) {
      row.allowed_share_modules = null;
    }

    const { data, error } = await supabase.from('crm_activities').insert(row).select('*').single();
    if (error) throw error;
    await supabase.from('crm_leads').update({ last_activity_at: new Date().toISOString() }).eq('id', leadId);
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Sửa ghi chú (crm_activities type = note) — tác giả hoặc admin */
r.patch('/leads/:id/activities/:activityId', async (req, res) => {
  try {
    const leadId = req.params.id;
    const activityId = req.params.activityId;
    const uid = req.user?.userId;
    const { title, description, attachments: attachmentsRaw } = req.body || {};

    const { data: act, error: fe } = await supabase.from('crm_activities')
      .select('id, lead_id, type, created_by, title, description, attachments')
      .eq('id', activityId)
      .single();
    if (fe || !act) return res.status(404).json({ error: 'Không tìm thấy hoạt động' });
    if (act.lead_id !== leadId) return res.status(400).json({ error: 'Hoạt động không thuộc lead/deal này' });
    if (act.type !== 'note') return res.status(400).json({ error: 'Chỉ sửa được loại ghi chú' });

    const r = normalizeCrmUserRole(req.user?.role);
    const canModerate = r === 'admin' || r === 'manager';
    if (!canModerate && String(act.created_by) !== String(uid)) {
      return res.status(403).json({ error: 'Chỉ tác giả hoặc quản lý/admin mới sửa được ghi chú này' });
    }

    const desc =
      description !== undefined ? String(description).trim() : String(act.description || '').trim();
    const nextAttachments =
      attachmentsRaw !== undefined ? normalizeCrmActivityAttachments(attachmentsRaw) : act.attachments;

    if (!desc && !(Array.isArray(nextAttachments) && nextAttachments.length)) {
      return res.status(400).json({ error: 'Ghi chú cần nội dung hoặc ít nhất một đính kèm' });
    }

    let nextTitle = act.title;
    if (title != null && String(title).trim()) {
      nextTitle = String(title).trim().slice(0, 200);
    } else {
      nextTitle = desc.split('\n')[0].slice(0, 120) || 'Ghi chú';
    }

    const patch = {
      title: nextTitle,
      description: desc || null,
      updated_at: new Date().toISOString(),
    };
    if (attachmentsRaw !== undefined) patch.attachments = nextAttachments;
    if (req.body?.shared_to_workshop !== undefined) {
      patch.shared_to_workshop = !!req.body.shared_to_workshop;
      if (!patch.shared_to_workshop) patch.allowed_share_modules = null;
    }
    if (req.body?.allowed_share_modules !== undefined) {
      const { cleanShareModulesInput } = require('../../helpers/documentShareScope');
      patch.allowed_share_modules = cleanShareModulesInput(req.body.allowed_share_modules);
    }

    const { data, error } = await supabase.from('crm_activities')
      .update(patch)
      .eq('id', activityId)
      .select('*, creator:users!crm_activities_created_by_fkey(id, full_name)')
      .single();
    if (error) throw error;
    await supabase.from('crm_leads').update({ last_activity_at: new Date().toISOString() }).eq('id', leadId);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Bật/tắt chia sẻ ghi chú (crm_activities type=note) sang SX / VC / xưởng */
r.put('/leads/:id/activities/:activityId/share', async (req, res) => {
  try {
    const leadId = req.params.id;
    const activityId = req.params.activityId;
    const uid = req.user?.userId;
    const { cleanShareModulesInput } = require('../../helpers/documentShareScope');

    const { data: act, error: fe } = await supabase.from('crm_activities')
      .select('id, lead_id, type, created_by, shared_to_workshop, allowed_share_modules')
      .eq('id', activityId)
      .single();
    if (fe || !act) return res.status(404).json({ error: 'Không tìm thấy hoạt động' });
    if (act.lead_id !== leadId) return res.status(400).json({ error: 'Hoạt động không thuộc lead/deal này' });
    if (act.type !== 'note') return res.status(400).json({ error: 'Chỉ chia sẻ được loại ghi chú' });

    const rRole = normalizeCrmUserRole(req.user?.role);
    const canModerate = rRole === 'admin' || rRole === 'manager';
    if (!canModerate && String(act.created_by) !== String(uid)) {
      return res.status(403).json({ error: 'Chỉ tác giả hoặc quản lý/admin mới đổi chia sẻ ghi chú này' });
    }

    const newShared = req.body?.shared_to_workshop !== undefined
      ? !!req.body.shared_to_workshop
      : !act.shared_to_workshop;
    const update = { shared_to_workshop: newShared, updated_at: new Date().toISOString() };
    if (req.body?.allowed_share_modules !== undefined) {
      update.allowed_share_modules = newShared
        ? cleanShareModulesInput(req.body.allowed_share_modules)
        : null;
    } else if (!newShared) {
      update.allowed_share_modules = null;
    }

    const { data, error } = await supabase.from('crm_activities')
      .update(update)
      .eq('id', activityId)
      .select('*, creator:users!crm_activities_created_by_fkey(id, full_name)')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/leads/:id/convert-to-project', async (req, res) => {
  // NOTE: notification added at the end of this handler
  try {
    const { data: lead } = await supabase.from('crm_leads').select('*, customer:customers(id, full_name)').eq('id', req.params.id).single();
    if (!lead) return res.status(404).json({ error: 'Lead không tồn tại' });

    // Get flow (from body or default)
    const { flow_id: reqFlowId } = req.body || {};
    let flowId = reqFlowId || null;
    if (!flowId) {
      const { data: flows } = await supabase.from('workflow_flows').select('id').limit(1);
      flowId = flows?.[0]?.id || null;
    }

    // Get first stage
    const { data: firstStage } = await supabase.from('workflow_stages').select('id').is('company_id', null).eq('is_active', true).order('order_index').limit(1).single();

    // Create project code
    const year = new Date().getFullYear();
    const { count } = await supabase.from('projects').select('*', { count: 'exact', head: true });
    const code = `TB-${year}-${String((count || 0) + 1).padStart(3, '0')}`;

    const { data: project, error } = await supabase.from('projects').insert({
      code, name: lead.title, status: 'consulting', customer_id: lead.customer_id,
      estimated_value: lead.estimated_value, flow_id: flowId,
      current_stage_id: firstStage?.id, created_by: req.user.userId,
    }).select('*').single();
    if (error) throw error;

    // Link lead to project
    await supabase.from('crm_leads').update({ project_id: project.id, updated_at: new Date().toISOString() }).eq('id', req.params.id);

    try {
      await ensureDealLeadDocumentsForModuleTransition({ leadId: req.params.id, projectId: project.id });
    } catch (e) {
      console.warn('[lead→project] ensure lead_documents:', e.message);
    }

    // ── AUTO-GENERATE TASKS FOR ALL STAGES ──
    const allStageSlugs = ['consulting', 'design', 'quotation', 'contract', 'production', 'delivery', 'customer-care'];
    let totalCreated = 0;

    for (const slug of allStageSlugs) {
      try {
        // Find stage (exact match first, then pattern)
        let stg = null;
        const { data: exact } = await supabase.from('workflow_stages').select('id, name, slug').eq('slug', slug).single();
        if (exact) stg = exact;
        else {
          const { data: pattern } = await supabase.from('workflow_stages').select('id, name, slug').ilike('slug', slug + '%').limit(1);
          stg = pattern?.[0];
        }
        if (!stg) continue;

        // Load templates from task_templates
        const { data: templates } = await supabase.from('task_templates')
          .select('*').eq('stage_id', stg.id).eq('is_active', true).order('order_index');
        if (!templates?.length) continue;

        // Create tasks
        const { data: ins } = await supabase.from('tasks').insert(templates.map((t, i) => ({
          project_id: project.id, stage_id: stg.id, title: t.title,
          description: t.description || null, priority: t.priority || 'medium', status: 'pending',
          created_by_id: req.user.userId, order_index: i, task_type: 'project',
          estimated_hours: t.estimated_hours || null,
        }))).select();

        // Create checklists
        for (const tmpl of templates) {
          if (tmpl.checklist_items?.length) {
            const newTask = (ins || []).find(t2 => t2.title === tmpl.title);
            if (newTask) {
              await supabase.from('task_checklists').insert(
                tmpl.checklist_items.map((c, j) => ({ task_id: newTask.id, title: typeof c === 'string' ? c : c.title, order_index: j }))
              );
            }
          }
        }
        totalCreated += (ins?.length || 0);
      } catch (e) { console.warn(`convert-to-project: auto-tasks ${slug} failed:`, e.message); }
    }

    // 🔔 NOTIFICATION: Lead/Deal → Dự án
    try {
      const t = await getNotifyTargets(req.params.id);
      const allIds = [...new Set([...t.ownerIds, ...t.adminIds])];
      if (allIds.length) await notifyMultiple(req, allIds, 'project_created',
        '🏗️ Tạo dự án từ Deal',
        `Dự án ${project.code} — "${project.name}" — ${totalCreated} tasks`,
        'project', project.id);
    } catch (ne) { console.warn('[NOTIFY] convert_project:', ne.message); }

    // NOTE: Không tự tạo Đơn 1/2/... từ deal. Đơn hàng chỉ tạo thủ công tại tab Đơn hàng.
    const orderOneConv = null;

    res.status(201).json({ ...project, tasks_created: totalCreated, order_one: null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


r.get('/leads/:id/project-tasks', async (req, res) => {
  try {
    const { data: lead } = await supabase.from('crm_leads').select('project_id').eq('id', req.params.id).single();
    if (!lead?.project_id) return res.json({ tasks: [], stages: [] });

    const { data: tasks } = await supabase.from('tasks')
      .select(`*, assignee:users!tasks_assignee_id_fkey(id, full_name, avatar),
        stage:workflow_stages(id, name, slug, color, icon, order_index),
        checklists:task_checklists(id, title, is_completed, order_index, notes, attachments)`)
      .eq('project_id', lead.project_id)
      .order('order_index');

    // Get project stage info
    const { data: project } = await supabase.from('projects')
      .select('id, code, name, status, current_stage_id, current_stage:workflow_stages(id, name, slug, color, icon)')
      .eq('id', lead.project_id).single();

    // Get all workflow stages for progress display
    const { data: stages } = await supabase.from('workflow_stages')
      .select('id, name, slug, color, icon, order_index')
      .is('company_id', null).eq('is_active', true).order('order_index');

    res.json({ tasks: tasks || [], stages: stages || [], project });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Sync: move lead stage → project stage + vice versa
r.post('/leads/:id/sync-stage', async (req, res) => {
  try {
    const { stage_slug, direction } = req.body; // direction: 'lead-to-project' | 'project-to-lead'

    const { data: lead } = await supabase.from('crm_leads')
      .select('*, stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, order_index, is_won, is_lost)')
      .eq('id', req.params.id).single();
    if (!lead?.project_id) return res.status(400).json({ error: 'Lead chưa liên kết dự án' });

    if (direction === 'lead-to-project' && stage_slug) {
      // Move project to matching stage
      const { data: wStage } = await supabase.from('workflow_stages')
        .select('id, name, slug').eq('slug', stage_slug).single();
      if (wStage) {
        await supabase.from('projects').update({
          current_stage_id: wStage.id, updated_at: new Date().toISOString(),
        }).eq('id', lead.project_id);

        // Also sync order status
        if (autoFlowFns.onProjectStageChanged) {
          try { await autoFlowFns.onProjectStageChanged(lead.project_id, wStage.id); } catch {}
        }
      }
    }

    // Always return updated state
    const { data: project } = await supabase.from('projects')
      .select('id, code, name, status, current_stage_id, current_stage:workflow_stages(id, name, slug, color, icon, order_index)')
      .eq('id', lead.project_id).single();

    res.json({ lead, project });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


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
    const items = parseRes.items.filter(i => !i.is_group).map(i => {
      const qty = i.quantity || 1;
      const price = i.unit_price || 0;
      const excelAmount = i.amount || 0;
      let specFactor = 0, itemDiscount = 0;

      if (i.is_freebie) {
        return { name: i.name, description: i.description || '', unit: i.unit || 'bộ', quantity: qty, unit_price: 0, spec_factor: 0, discount_percent: 0, vat_rate: 0, height: i.height || '', width: i.width || '', length: i.length || '', dimensions: [i.length, i.width, i.height].filter(Boolean).join(' x ') || '', group_name: i.group_name || '', notes: 'HỖ TRỢ' };
      }

      if (price > 0 && qty > 0 && excelAmount > 0) {
        const rawRatio = excelAmount / (qty * price);
        if (rawRatio > 1.005) specFactor = Math.round(rawRatio * 1000) / 1000;
        else if (rawRatio < 0.995) {
          const impliedCK = Math.round((1 - rawRatio) * 10000) / 100;
          const headerCK = i.group_discount_percent || 0;
          itemDiscount = (headerCK > 0 && Math.abs(impliedCK - headerCK) < 1) ? headerCK : impliedCK;
        }
      }

      return { name: i.name, description: i.description || '', unit: i.unit || 'bộ', quantity: qty, unit_price: price, spec_factor: specFactor, discount_percent: itemDiscount, vat_rate: i.vat_rate || 0, height: i.height || '', width: i.width || '', length: i.length || '', dimensions: [i.length, i.width, i.height].filter(Boolean).join(' x ') || '', group_name: i.group_name || '', notes: i.notes || '' };
    });

    // Compute discount
    const itemsGrossTotal = items.reduce((s, i) => {
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

    // 7. Sync estimated_value vào lead
    if (quote.total > 0) {
      await supabase.from('crm_leads').update({
        estimated_value: quote.total,
        updated_at: new Date().toISOString(),
      }).eq('id', leadId);
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


// ═══════════════════════════════════════════════════════════════════════════
// CRM TASKS — Công việc cho Lead/Deal
// ═══════════════════════════════════════════════════════════════════════════

const CRM_TASK_SELECT =
  '*, assignee:users!crm_tasks_assignee_id_fkey(id,full_name,avatar), supervisor:users!crm_tasks_supervisor_id_fkey(id,full_name,avatar), pipeline_stage:crm_pipeline_stages!crm_tasks_pipeline_stage_id_fkey(id, pipeline_type, name, order_index)';

/**
 * Map task_id -> { files, notes } cho tab NV CRM (khớp logic cũ: doc_type = task_note → note).
 * Ưu tiên RPC SQL (161) để tránh trả về quá nhiều dòng attachment → statement timeout.
 */
async function loadCrmTaskAttachmentCountMap(supabase, taskIds) {
  const countMap = {};
  if (!taskIds?.length) return countMap;

  try {
    const { data: rows, error } = await supabase.rpc('crm_task_attachment_counts_by_tasks', {
      p_task_ids: taskIds,
    });
    if (!error && Array.isArray(rows)) {
      for (const r of rows) {
        if (!r?.task_id) continue;
        countMap[r.task_id] = {
          files: Number(r.file_count || 0),
          notes: Number(r.note_count || 0),
        };
      }
      return countMap;
    }
  } catch (_) {
    /* RPC chưa deploy: fallback */
  }

  const CHUNK = 80;
  for (let i = 0; i < taskIds.length; i += CHUNK) {
    const chunk = taskIds.slice(i, i + CHUNK);
    const { data: attCounts, error } = await supabase
      .from('crm_task_attachments')
      .select('task_id, doc_type')
      .in('task_id', chunk);
    if (error) throw error;
    (attCounts || []).forEach((a) => {
      if (!countMap[a.task_id]) countMap[a.task_id] = { files: 0, notes: 0 };
      if (a.doc_type === 'task_note') countMap[a.task_id].notes += 1;
      else countMap[a.task_id].files += 1;
    });
  }
  return countMap;
}

/** Deal gốc use_order_tasks: ghi nhiệm vụ mới vào deal fulfillment của đơn đầu tiên (khớp tab chi tiết deal). */

/**
 * Deal gốc (use_order_tasks): nhiệm vụ SX và một phần luồng đơn được ghi vào lead fulfillment (resolveCrmTaskWriteLeadId).
 * Luôn gộp task từ các lead con vào response khi xem deal cha — tránh chỉ gộp khi deal cha chưa có task nào
 * (trường hợp cha có deal_* nhưng sx_* nằm ở con → trước đây tab SX / gen SX tưởng thiếu nhiệm vụ).
 */
async function appendFulfillmentChildTasksForMasterDeal(masterLeadId, parentTasks, leadRow) {
  if (!leadRow?.use_order_tasks || leadRow.parent_lead_id) return parentTasks || [];

  const { data: orderRows, error: oErr } = await supabase
    .from('orders')
    .select('id, display_label, code, fulfillment_lead_id')
    .eq('lead_id', masterLeadId);
  if (oErr) throw oErr;
  const fidToOrder = new Map();
  (orderRows || []).forEach((o) => {
    if (o.fulfillment_lead_id && !fidToOrder.has(o.fulfillment_lead_id)) {
      fidToOrder.set(o.fulfillment_lead_id, o);
    }
  });
  const childIds = [...fidToOrder.keys()];
  if (!childIds.length) return parentTasks || [];

  const { data: merged, error: mErr } = await supabase.from('crm_tasks')
    .select(CRM_TASK_SELECT)
    .in('lead_id', childIds)
    .order('stage_slug')
    .order('order_index');
  if (mErr) throw mErr;

  const parentIds = new Set((parentTasks || []).map((t) => t.id).filter(Boolean));
  const childAnnotated = (merged || [])
    .filter((t) => t.id && !parentIds.has(t.id))
    .map((t) => {
      const ord = fidToOrder.get(t.lead_id);
      return {
        ...t,
        order_id: ord?.id || null,
        order_label: ord?.display_label || ord?.code || null,
      };
    });

  return [...(parentTasks || []), ...childAnnotated];
}

// GET tasks for a lead/deal
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
    // - crm: ẩn task SX
    if (taskScope === 'production') {
      data = (data || []).filter((t) => String(t.stage_slug || '').startsWith('sx_') || t.production_pipeline_stage_id);
      const workshopTypeId = String(req.query?.workshop_type_id || '').trim() || null;
      if (workshopTypeId) {
        const { getProductionPipelineStagesForWorkshopType, filterSxTasksToWorkshopPipeline } = require('../../helpers/sxPipelineStageSlug');
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
          const { getProductionPipelineStagesForWorkshopType, filterSxTasksToWorkshopPipeline } = require('../../helpers/sxPipelineStageSlug');
          const stages = await getProductionPipelineStagesForWorkshopType(
            proj.company_id || lead.company_id,
            proj.workshop_type_id,
          );
          data = filterSxTasksToWorkshopPipeline(data, stages);
        }
      }
    } else if (taskScope === 'crm') {
      data = (data || []).filter((t) => !String(t.stage_slug || '').startsWith('sx_'));
    }

    const { filterCrmTasksByCompanyScope, sanitizeTasksForSharedWorkspace } = require('../../helpers/crossCompanyWorkspace');
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

// Gen lại nhiệm vụ CRM theo bộ mẫu pipeline (xóa thừa + đồng bộ giai đoạn hiện tại).
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

// Quét & bổ sung nhiệm vụ CRM thiếu theo bộ mẫu pipeline (không xóa task cũ).
// Body: { pipeline_stage_id?, all_stages?: boolean } — mặc định quét cột hiện tại.
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

// Quét & bổ sung nhiệm vụ SX (sx_*) thiếu theo bộ mẫu xưởng (không xóa task cũ).
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
      const { applyWorkshopTypeDefaultStaffToProject } = require('../../helpers/productionWorkshopTypeStaff');
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

// CREATE task
r.post('/leads/:id/tasks', async (req, res) => {
  try {
    const result = await createCrmLeadTask(req, req.params.id, req.body);
    if (result.error) return res.status(result.status || 500).json({ error: result.error });
    await emitCrmTaskChanged(req, {
      leadId: req.params.id,
      taskId: result.data?.id,
      action: 'created',
      task: result.data,
    });
    return res.status(result.status).json(result.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// BULK CREATE from template
// Idempotent: chỉ tạo task cho item chưa tồn tại trong cùng (lead, stage) (so theo title).
// Tránh trường hợp user bấm "Gắn mẫu" 2-3 lần → nhân tasks.
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
    res.status(201).json({ tasks: data, count: data.length, skipped });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Gen nhiệm vụ pipeline SX (sx_*) từ workshop_task_templates — ghi đúng lead (deal con khi use_order_tasks).
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
        const { applyWorkshopTypeDefaultStaffToProject } = require('../../helpers/productionWorkshopTypeStaff');
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

// UPDATE task
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
          const { data: leadPut } = await supabase.from('crm_leads')
            .select('company_id, region_id')
            .eq('id', req.params.leadId)
            .maybeSingle();
          const ecoPut = ecosystemModuleKeyForCrmDeadline(crmTaskDeadlineModuleKey(data.stage_slug));
          const okNew = await filterUserIdsForCrmLeadScopedNotification(
            supabase,
            leadPut || {},
            addedAssigneeIds,
            ecoPut,
          );
          for (const uid of okNew) {
            await createNotification(req, uid, 'crm_task_assigned',
              '📌 Được giao nhiệm vụ CRM',
              `Bạn được giao: "${data.title}"`,
              'crm_task', data.id,
              { lead_id: req.params.leadId, nav_tab: 'tasks' });
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
          const { data: leadPut } = await supabase.from('crm_leads')
            .select('company_id, region_id')
            .eq('id', req.params.leadId)
            .maybeSingle();
          const ecoPut = ecosystemModuleKeyForCrmDeadline(crmTaskDeadlineModuleKey(data.stage_slug));
          const okNew = await filterUserIdsForCrmLeadScopedNotification(
            supabase,
            leadPut || {},
            [b.assignee_id],
            ecoPut,
          );
          if (okNew.some((x) => String(x) === String(b.assignee_id))) {
            await createNotification(req, b.assignee_id, 'crm_task_assigned',
              '📌 Được giao nhiệm vụ CRM',
              `Bạn được giao: "${data.title}"`,
              'crm_task', data.id);
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

    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Khôi phục checklist từ mẫu xưởng (khi bị ghi đè từ không gian chung)
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

// DELETE task
r.delete('/leads/:leadId/tasks/:taskId', async (req, res) => {
  try {
    const result = await deleteCrmLeadTask(req, req.params.taskId);
    if (result.error) return res.status(result.status || 500).json({ error: result.error });
    await emitCrmTaskChanged(req, {
      leadId: req.params.leadId,
      taskId: req.params.taskId,
      action: 'deleted',
    });
    return res.json(result.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// TOGGLE SHARE TASK TO PROJECT (cho Khối khác xem)
// ═══════════════════════════════════════════════════════════════════════════

r.put('/leads/:leadId/tasks/:taskId/toggle-share', async (req, res) => {
  try {
    const { cleanShareModulesInput } = require('../../helpers/documentShareScope');
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
      const { syncLeadDocumentsFromCrmTaskShare } = require('../../helpers/syncCrmArtifactShareToLeadDocuments');
      await syncLeadDocumentsFromCrmTaskShare(req.params.taskId);
    } catch (syncErr) {
      console.warn('[toggle-share task] lead_documents:', syncErr.message);
    }
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Toggle share cho từng attachment riêng lẻ
r.put('/leads/:leadId/tasks/:taskId/attachments/:attId/toggle-share', async (req, res) => {
  try {
    const { cleanShareModulesInput } = require('../../helpers/documentShareScope');
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
      const { syncLeadDocumentsFromCrmAttachmentShare } = require('../../helpers/syncCrmArtifactShareToLeadDocuments');
      await syncLeadDocumentsFromCrmAttachmentShare(req.params.attId);
    } catch (syncErr) {
      console.warn('[toggle-share attachment] lead_documents:', syncErr.message);
    }
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.put('/leads/:leadId/tasks/:taskId/attachments/:attId/share-scope', async (req, res) => {
  try {
    const { cleanShareModulesInput } = require('../../helpers/documentShareScope');
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
      const { syncLeadDocumentsFromCrmAttachmentShare } = require('../../helpers/syncCrmArtifactShareToLeadDocuments');
      await syncLeadDocumentsFromCrmAttachmentShare(req.params.attId);
    } catch (syncErr) {
      console.warn('[share-scope attachment] lead_documents:', syncErr.message);
    }
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET shared CRM task notes for a project (dùng từ ProjectDetail)
r.get('/project/:projectId/shared-notes', async (req, res) => {
  try {
    const {
      crmTaskVisibleForModuleAndUser,
      crmAttachmentVisibleForModuleAndUser,
    } = require('../../helpers/documentShareScope');
    const forModule = String(req.query.for_module || '').toLowerCase().trim();
    const useMod = ['production', 'logistics', 'workshop'].includes(forModule) ? forModule : null;

    const { data: lead } = await supabase.from('crm_leads')
      .select('id').eq('project_id', req.params.projectId).single();
    if (!lead) return res.json([]);

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
          ? crmAttachmentVisibleForModuleAndUser(a, useMod, req.user, taskRow)
          : a.shared_to_project === true && canUserViewDocByAllowlist(req.user, a, taskRow);
      });
    }

    const result = (allTasks || [])
      .map((t) => {
        const taskShared = useMod
          ? crmTaskVisibleForModuleAndUser(t, useMod, req.user)
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

// ═══════════════════════════════════════════════════════════════════════════
// TASK NOTES & ATTACHMENTS
// ═══════════════════════════════════════════════════════════════════════════

// UPDATE task notes (quick text note on task itself) + sync ghi chú → lead_documents
r.put('/leads/:leadId/tasks/:taskId/notes', async (req, res) => {
  try {
    const { notes } = req.body;
    const { getTaskVisibilityAllowlist } = require('../../helpers/documentShareScope');
    const { data, error } = await supabase.from('crm_tasks')
      .update({ notes, updated_at: new Date().toISOString() })
      .eq('id', req.params.taskId)
      .select('id, title, notes, stage_slug, default_allowed_companies, default_allowed_departments, shared_to_project, allowed_share_modules').single();
    if (error) throw error;
    const vis = getTaskVisibilityAllowlist(data);

    // Sync: upsert ghi chú vào lead_documents
    // Tìm attachment type "task_note" cho task này
    if (notes?.trim()) {
      try {
        const { data: leadForSync } = await supabase.from('crm_leads')
          .select('project_id').eq('id', req.params.leadId).single();
        const taskDocOpts = { linkToProject: !!leadForSync?.project_id };

        const { data: existingAtt } = await supabase.from('crm_task_attachments')
          .select('id')
          .eq('task_id', req.params.taskId)
          .eq('doc_type', 'task_inline_note')
          .limit(1).single();
        
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

// UPDATE ghi chú cho 1 mục checklist con + sync → lead_documents
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

// GET attachments for a task
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

// BULK ADD attachments (nhiều files 1 request)
r.post('/leads/:leadId/tasks/:taskId/attachments/bulk', async (req, res) => {
  try {
    const items = req.body.items; // [{name, doc_type, file_url, file_name, file_size, mime_type}]
    if (!items?.length) return res.status(400).json({ error: 'Không có file' });

    // Query task visibility 1 lần duy nhất
    const { data: task } = await supabase.from('crm_tasks')
      .select('id, title, stage_slug, checklist, default_allowed_companies, default_allowed_departments, pipeline_stage:crm_pipeline_stages!crm_tasks_pipeline_stage_id_fkey(name)')
      .eq('id', req.params.taskId).single();
    const finalCompanies = task?.default_allowed_companies || null;
    const finalDepts = task?.default_allowed_departments || null;
    const checklistId = req.body.checklist_id ? String(req.body.checklist_id) : null;
    const ckItem = checklistId ? findChecklistItem(task, checklistId) : null;
    if (checklistId && !ckItem) return res.status(400).json({ error: 'Mục checklist không tồn tại' });

    const { data: leadForShare } = await supabase.from('crm_leads')
      .select('project_id').eq('id', req.params.leadId).single();
    const bulkShareOpts = { linkToProject: !!leadForShare?.project_id };
    const defaultShare = getDefaultCrmAttachmentShare(task, bulkShareOpts, ckItem);

    // Insert tất cả attachments 1 lần
    const rows = items.map(item => ({
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
    }

    res.status(201).json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ADD attachment (file or text note) to a task
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
      .select('id, title, stage_slug, checklist, default_allowed_companies, default_allowed_departments')
      .eq('id', req.params.taskId).single();
    const ckId = checklist_id ? String(checklist_id) : null;
    const ckItem = ckId ? findChecklistItem(taskForShare, ckId) : null;
    if (ckId && !ckItem) return res.status(400).json({ error: 'Mục checklist không tồn tại' });
    const { data: leadForShare } = await supabase.from('crm_leads')
      .select('project_id').eq('id', req.params.leadId).single();
    const singleShareOpts = { linkToProject: !!leadForShare?.project_id };
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

    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE attachment + sync xóa lead_document liên kết
r.delete('/leads/:leadId/tasks/:taskId/attachments/:attId', async (req, res) => {
  try {
    const { data: attBefore } = await supabase.from('crm_task_attachments')
      .select('id, source_assignment_file_id')
      .eq('id', req.params.attId)
      .eq('task_id', req.params.taskId)
      .maybeSingle();

    // Snapshot vào Thùng rác trước khi xóa thật (trừ khi permanent=true)
    if (req.query.permanent !== 'true') {
      try {
        const { snapshotTaskAttachment } = require('../../helpers/trashSnapshot');
        const snapRes = await snapshotTaskAttachment(supabase, req.params.attId, req.user?.userId);
        if (!snapRes.ok) console.warn('[delete task attach] snapshot trash failed:', snapRes.error);
      } catch (e) {
        console.warn('[delete task attach] trash snapshot error:', e.message);
      }
    }
    // Xóa lead_document liên kết trước (vì có FK ON DELETE SET NULL)
    await supabase.from('lead_documents').delete()
      .eq('source_attachment_id', req.params.attId);
    try {
      await deleteMirroredAssignmentFileForTaskAttachment(
        req.params.attId,
        attBefore?.source_assignment_file_id,
      );
    } catch (syncErr) {
      console.warn('[delete attach] sync→assignment:', syncErr.message);
    }
    // Xóa attachment
    const { error } = await supabase.from('crm_task_attachments')
      .delete().eq('id', req.params.attId).eq('task_id', req.params.taskId);
    if (error) throw error;
    await emitCrmTaskChanged(req, {
      leadId: req.params.leadId,
      taskId: req.params.taskId,
      action: 'attachment_deleted',
    });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET all attachments for a lead/deal (across all tasks)
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


r.post('/leads/:id/sx-handover', async (req, res) => {
  try {
    const leadId = req.params.id;
    const uid = req.user.userId;
    const { data: lead, error: leadErr } = await supabase.from('crm_leads')
      .select('id, type, project_id, assigned_to, lead_owner_id, sx_handover_at')
      .eq('id', leadId)
      .single();
    if (leadErr || !lead) return res.status(404).json({ error: 'Không tìm thấy' });
    if (lead.type !== 'deal') return res.status(400).json({ error: 'Chỉ áp dụng cho deal' });
    if (!lead.project_id) return res.status(400).json({ error: 'Deal chưa có dự án — hãy tạo dự án trước' });
    if (lead.sx_handover_at) return res.status(400).json({ error: 'Đã xác nhận bàn giao sản xuất' });

    const can = userSeesAllCrmDeals(req.user.role)
      || String(lead.assigned_to || '') === String(uid)
      || String(lead.lead_owner_id || '') === String(uid);
    if (!can) return res.status(403).json({ error: 'Bạn không có quyền xác nhận bàn giao deal này' });

    const b = req.body || {};
    if (!b.sale_acknowledged) return res.status(400).json({ error: 'Cần tick xác nhận Sale' });

    const targetTaskLeadId = await resolveCrmTaskWriteLeadId(leadId);
    const { data: sxTasksAll } = await supabase
      .from('crm_tasks')
      .select('id, status')
      .eq('lead_id', targetTaskLeadId)
      .like('stage_slug', 'sx_%');
    const sxTasks = (sxTasksAll || []).filter((t) => t.status !== 'cancelled');
    if (!sxTasks.length) {
      return res.status(400).json({
        error:
          'Deal chưa có nhiệm vụ Sản xuất (tab Công việc). Chuyển deal sang cột Sản xuất (chọn công ty xưởng) để hệ thống gắn bộ nhiệm vụ, hoặc bấm Gen trong tab Công việc.',
        code: 'requires_sx_crm_tasks',
      });
    }
    const incompleteSx = sxTasks.filter((t) => t.status !== 'completed');
    if (incompleteSx.length) {
      return res.status(400).json({
        error: `Còn ${incompleteSx.length} nhiệm vụ Sản xuất (sx_*) chưa hoàn thành. Hoàn tất 100% trước khi bàn giao.`,
        code: 'requires_sx_crm_tasks_complete',
        incomplete_count: incompleteSx.length,
      });
    }

    const resolvedHandoverPc = await resolveProductionCompanyForDealStage(leadId, b.production_company_id);
    const pcv = await validateProductionCompanyId(resolvedHandoverPc);
    if (!pcv.ok) return res.status(400).json({ error: pcv.error, requires_production_company: true });
    const cStart = b.construction_start_date || null;
    const pStart = b.expected_production_start_date || null;
    const pEnd = b.expected_production_end_date || null;
    if (!cStart || !pStart) {
      return res.status(400).json({
        error: 'Nhập đủ: ngày dự kiến thi công (bắt đầu công trình) và ngày dự kiến sản xuất',
      });
    }
    if (pEnd && new Date(pEnd) < new Date(pStart)) {
      return res.status(400).json({ error: 'Ngày hoàn thành SX phải sau hoặc cùng ngày bắt đầu SX' });
    }

    const now = new Date().toISOString();
    const { data: projRow } = await supabase
      .from('projects')
      .select('workshop_type_id')
      .eq('id', lead.project_id)
      .maybeSingle();
    const { applyWorkshopTypeDefaultStaffToProject } = require('../../helpers/productionWorkshopTypeStaff');
    const primaryStaffId = await applyWorkshopTypeDefaultStaffToProject(
      lead.project_id,
      pcv.company.id,
      projRow?.workshop_type_id || null,
    );
    const sxResponsible = primaryStaffId || await resolveProductionHandoverResponsibleUserId(pcv.company.id);
    const leadHandoverPatch = {
      sx_handover_at: now,
      sx_handover_confirmed_by: uid,
      sx_template_company_id: pcv.company.id,
      construction_start_date: cStart,
      expected_production_start_date: pStart,
      expected_production_end_date: pEnd,
      updated_at: now,
    };
    if (sxResponsible) {
      leadHandoverPatch.assigned_to = sxResponsible;
      leadHandoverPatch.lead_owner_id = sxResponsible;
    }
    const { error: upLeadErr } = await supabase.from('crm_leads').update(leadHandoverPatch).eq('id', leadId);
    if (upLeadErr) throw upLeadErr;

    const projPatch = {
      construction_start_date: cStart,
      expected_production_start_date: pStart,
      updated_at: now,
      company_id: pcv.company.id,
    };
    if (pEnd) projPatch.production_deadline = pEnd;
    const { error: projErr } = await supabase.from('projects').update(projPatch).eq('id', lead.project_id);
    if (projErr) console.warn('[sx-handover] project dates:', projErr.message);

    try {
      await ensureDealLeadDocumentsForModuleTransition({ leadId, projectId: lead.project_id });
    } catch (docEns) {
      console.warn('[sx-handover] ensure lead_documents:', docEns.message);
    }

    try {
      await syncCrmLeadSxPipelineFromProject(lead.project_id);
    } catch (se) {
      console.warn('[sx-handover] syncCrmLeadSxPipelineFromProject:', se.message);
    }
    try {
      const io = req.app.get('io');
      if (io) await emitCrmBadgeUpdateForProject(lead.project_id, io);
    } catch (em) {
      console.warn('[sx-handover] emit badge:', em.message);
    }

    try {
      await supabase.from('crm_activities').insert({
        lead_id: leadId,
        type: 'note',
        title: '✅ Sale xác nhận bàn giao Sản xuất',
        description: `Bắt đầu công trình: ${cStart} · Dự kiến SX: ${pStart} · Dự kiến hoàn thành SX: ${pEnd}`,
        created_by: uid,
      });
    } catch (_) {}

    // Auto-generate default workshop tasks for production (nhiệm vụ mẫu xưởng)
    // Only apply once: check if the project already has tasks created from workshop templates.
    try {
      const forcedCompanyId = pcv?.company?.id || null;
      const { data: defTpl } = await supabase
        .from('workshop_task_templates')
        .select('id')
        .eq('workshop_area', 'production')
        .eq('is_default', true)
        .eq('is_active', true)
        .eq('company_id', forcedCompanyId)
        .limit(1)
        .maybeSingle();
      // Fallback: dùng bộ mẫu global nếu công ty chưa có
      let defTplId = defTpl?.id || null;
      if (!defTplId) {
        const { data: globalTpl } = await supabase
          .from('workshop_task_templates')
          .select('id')
          .eq('workshop_area', 'production')
          .eq('is_default', true)
          .eq('is_active', true)
          .is('company_id', null)
          .limit(1)
          .maybeSingle();
        defTplId = globalTpl?.id || null;
      }

      if (defTplId) {
        const { count } = await supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', lead.project_id)
          .contains('metadata', { workshop_template_id: defTplId });
        if (!count || count === 0) {
          const r = await applyWorkshopTemplateToProject(lead.project_id, defTplId, uid);
          if (!r.ok) console.warn('[sx-handover] apply workshop template:', r.error);
        }
      }
    } catch (wt) {
      console.warn('[sx-handover] workshop templates:', wt.message);
    }

    // Gen toàn bộ bộ mẫu xưởng (khu SX) theo cấu hình /sx/task-templates (ưu tiên theo company đã chọn).
    // Idempotent theo metadata.workshop_template_id nên gọi nhiều lần vẫn an toàn.
    try {
      const forcedCompanyId = pcv?.company?.id || null;
      const rAll = await applyAllActiveWorkshopTemplatesForArea(lead.project_id, uid, {
        workshopArea: 'production',
        companyId: forcedCompanyId,
      });
      if (!rAll.ok) console.warn('[sx-handover] gen all workshop templates:', rAll.error);
    } catch (e) {
      console.warn('[sx-handover] gen all workshop templates:', e.message);
    }

    res.json({
      ok: true,
      sx_handover_at: now,
      construction_start_date: cStart,
      expected_production_start_date: pStart,
      expected_production_end_date: pEnd,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// LEAD MEMBERS — Thành viên tham gia Lead/Deal
// ═══════════════════════════════════════════════════════════════════════════

// GET /leads/:id/members
r.get('/leads/:id/members', async (req, res) => {
  try {
    try {
      const { ensureLeadMembersFromProjectStaff } = require('../../helpers/productionWorkshopTypeStaff');
      await ensureLeadMembersFromProjectStaff(req.params.id);
    } catch (syncErr) {
      console.warn('[crm/leads/members] sync production staff:', syncErr.message);
    }
    const merged = await fetchLeadMentionMembers(supabase, req.params.id);
    res.json(merged);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /leads/:id/members — thêm thành viên (1 hoặc nhiều)
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
        .select('*, user:users!lead_members_user_id_fkey(id, full_name, email, avatar, role)')
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

// GET /leads/:id/assignments — nhiệm vụ «Giao việc CRM» gắn lead/deal này
r.get('/leads/:id/assignments', async (req, res) => {
  try {
    let q = supabase
      .from('crm_assignments')
      .select(`
        id, company_id, column_id, lead_id, title, description,
        assignee_id, created_by_id, priority, status, deadline,
        position, created_at, updated_at, completed_at,
        assignee:users!crm_assignments_assignee_id_fkey(id, full_name, email, avatar),
        created_by:users!crm_assignments_created_by_id_fkey(id, full_name, email, avatar),
        lead:crm_leads(id, code, title, type)
      `)
      .eq('lead_id', req.params.id)
      .order('created_at', { ascending: false });
    let { data, error } = await q;
    if (error && /lead_id/.test(error.message || '')) {
      return res.json({ assignments: [] });
    }
    if (error) throw error;
    const list = data || [];
    if (list.length) {
      const ids = list.map((x) => x.id);
      const { data: rows } = await supabase
        .from('crm_assignment_assignees')
        .select('assignment_id, user_id, user:users(id, full_name, email, avatar)')
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

// POST /leads/:id/assignments — giao việc CRM cho thành viên tham gia lead/deal
r.post('/leads/:id/assignments', async (req, res) => {
  try {
    const leadId = req.params.id;
    const b = req.body || {};
    const rawIds = Array.isArray(b.assignee_ids) ? b.assignee_ids.filter(Boolean) : [];
    if (!rawIds.length) {
      return res.status(400).json({ error: 'Chọn ít nhất một thành viên để giao việc' });
    }

    const { data: memRows } = await supabase
      .from('lead_members')
      .select('user_id')
      .eq('lead_id', leadId);
    const memberSet = new Set((memRows || []).map((m) => String(m.user_id)));
    const invalid = rawIds.filter((id) => !memberSet.has(String(id)));
    if (invalid.length) {
      return res.status(400).json({
        error: 'Chỉ gán nhiệm vụ cho nhân viên đang tham gia lead/deal này',
        invalid_user_ids: invalid,
      });
    }

    const { data: leadInfo } = await supabase
      .from('crm_leads')
      .select('code, title, type')
      .eq('id', leadId)
      .maybeSingle();
    const leadLabel = leadInfo
      ? `${leadInfo.code || ''} ${leadInfo.title || ''}`.trim()
      : 'lead/deal';

    const result = await createCrmAssignment(req, {
      title: b.title,
      description: b.description,
      assignee_ids: rawIds,
      column_id: b.column_id,
      company_id: b.company_id,
      priority: b.priority,
      status: b.status,
      deadline: b.deadline,
      lead_id: leadId,
    });
    if (result.error) return res.status(result.status || 500).json({ error: result.error });

    const data = result.data?.assignment;
    const assigneeIds = result.data?.assignee_ids || [];
    const leadSuffix = leadLabel ? ` (${leadLabel})` : '';
    for (const uid of assigneeIds) {
      if (String(uid) === String(req.user.userId)) continue;
      const notif = await persistAssignmentNotification(supabase, uid, {
        type: 'crm_assignment_assigned',
        title: '📋 Bạn vừa được giao nhiệm vụ CRM',
        message: `"${data.title}"${leadSuffix}${data.deadline ? ' — hạn ' + new Date(data.deadline).toLocaleString('vi-VN') : ''}`,
        assignmentId: data.id,
        metadata: { lead_id: leadId, nav_path: '/crm/assignments', open: data.id },
      });
      try {
        const io = req.app.get('io');
        if (io) io.to(`user:${uid}`).emit('notification', notif || buildAssignmentNotificationInsert(uid, {
          type: 'crm_assignment_assigned',
          title: '📋 Bạn vừa được giao nhiệm vụ CRM',
          message: `"${data.title}"${leadSuffix}`,
          assignmentId: data.id,
        }));
      } catch { /* ignore */ }
    }
    if (assigneeIds.length) emitNotifyBadge(req.app, 'assignments');

    if (assigneeIds.length) {
      const { data: asnRows } = await supabase
        .from('crm_assignment_assignees')
        .select('user:users(id, full_name, email, avatar)')
        .eq('assignment_id', data.id);
      data.assignees = (asnRows || []).map((r) => r.user).filter(Boolean);
    }

    void rcInvalidateTags(['crm:assignments']);
    res.status(result.status).json({ assignment: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /leads/:id/members/:userId — xóa thành viên
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

// ═══════════════════════════════════════════════════════════════════════════
// LEAD CHAT — Trao đổi realtime trong Lead/Deal
// ═══════════════════════════════════════════════════════════════════════════

/** JSON body (mobile axios) không đi qua multer — tránh lỗi Android khi gửi application/json */
const leadChatFilesMulter = multer({ dest: 'uploads/lead-chat/' }).array('files');
function leadChatJsonOrFiles(req, res, next) {
  const ct = String(req.headers['content-type'] || '').toLowerCase();
  if (ct.includes('application/json')) return next();
  return leadChatFilesMulter(req, res, next);
}

/**
 * Hydrate parent message cho lead chat (tin nhắn reply). Query riêng để tránh
 * Supabase fail join self-FK `lead_messages_reply_to_fkey`.
 */
async function attachLeadReplyParents(rows) {
  if (!Array.isArray(rows) || !rows.length) return rows;
  const ids = [...new Set(
    rows.map((m) => m?.reply_to).filter(Boolean).map((x) => String(x))
  )];
  if (!ids.length) return rows;
  const { data: parents, error } = await supabase
    .from('lead_messages')
    .select('id, content, message_type, attachment_name, attachment_url, user:users(id, full_name, avatar)')
    .in('id', ids);
  if (error || !parents?.length) return rows;
  const parentMap = new Map(parents.map((p) => [String(p.id), p]));
  return rows.map((m) => {
    if (!m?.reply_to) return m;
    const parent = parentMap.get(String(m.reply_to)) || null;
    return parent ? { ...m, reply: parent } : m;
  });
}

// GET /leads/:id/chat
r.get('/leads/:id/chat', async (req, res) => {
  try {
    const { data } = await supabase.from('lead_messages')
      .select('*, user:users(id, full_name, avatar)')
      .eq('lead_id', req.params.id)
      .order('created_at', { ascending: true })
      .limit(500);
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

// POST /leads/:id/chat — gửi tin nhắn (text, file, image, video, audio)
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

// POST /leads/:id/chat/drive — chia sẻ file Google Drive vào chat
r.post('/leads/:id/chat/drive', async (req, res) => {
  try {
    const uid = req.user?.userId ?? req.user?.id;
    if (!uid) return res.status(401).json({ error: 'Token không có user id' });
    const { file_ids, content, reply_to } = req.body || {};
    const { buildDriveChatAttachments } = require('../../helpers/driveChatAttachments');
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

// POST /leads/:id/chat/upload — upload file/image/video/audio
const chatUpload = multer({ storage: multer.diskStorage({
  destination: 'uploads/lead-chat/',
  filename: (_, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_'))
}), limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB max

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

// POST /leads/:id/chat/:msgId/react — thêm/xóa cảm xúc
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

// PUT /leads/:id/chat/:msgId/pin — ghim/bỏ ghim
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

// GET /leads/:id/chat/pinned — danh sách tin ghim
r.get('/leads/:id/chat/pinned', async (req, res) => {
  try {
    const { data } = await supabase.from('lead_messages')
      .select('*, user:users(id, full_name, avatar)')
      .eq('lead_id', req.params.id).eq('is_pinned', true)
      .order('created_at', { ascending: false });
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// PER-USER FLAGS: GHIM thẻ + tick XANH "đã tương tác" (crm_lead_user_flags)
// ════════════════════════════════════════════════════════════════════════════

/** Helper: kiểm tra user có quyền xem lead trước khi flag (region scope). */
async function assertCanFlagLead(req, leadId) {
  const { data: lead, error } = await supabase
    .from('crm_leads')
    .select('id, region_id, company_id')
    .eq('id', leadId)
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: error.message };
  if (!lead) return { ok: false, status: 404, error: 'Không tìm thấy lead/deal' };
  const guard = assertLeadReadableByRegionScope(req, lead);
  if (!guard.ok) return { ok: false, status: 403, error: guard.error };
  return { ok: true };
}

/** POST /crm/leads/:id/pin — ghim thẻ lên đầu (per-user). */
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

/** DELETE /crm/leads/:id/pin — bỏ ghim. */
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

/** POST /crm/leads/:id/interacted — bật tick xanh "đã tương tác". */
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

/** DELETE /crm/leads/:id/interacted — tắt tick xanh. */
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


// ════════════════════════════════════════════════════════════════════════════
// CRM LEAD COMMENTS — bình luận dùng chung cho lead/deal
// ════════════════════════════════════════════════════════════════════════════

function commentsTableMissing(error) {
  return String(error?.message || '').toLowerCase().includes('crm_lead_comments');
}

function crmLeadCommentAttachmentsColumnMissing(error) {
  return String(error?.message || '').toLowerCase().includes('attachments')
    && String(error?.message || '').toLowerCase().includes('crm_lead_comments');
}

/** Chuẩn hóa đính kèm bình luận lead — nhận {url|file_url, name|file_name, type|mime_type, size|file_size}. */
function isAllowedLeadCommentAttachmentUrl(url) {
  if (!url) return false;
  if (url.startsWith('data:')) return false;
  if (url.startsWith('/uploads/')) return true;
  if (/^https?:\/\//i.test(url)) return true;
  return false;
}

function normalizeCrmLeadCommentAttachments(raw) {
  if (raw == null) return [];
  const arr = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const a of arr) {
    if (!a || typeof a !== 'object') continue;
    const url = typeof a.url === 'string' ? a.url.trim()
      : (typeof a.file_url === 'string' ? a.file_url.trim() : '');
    if (!isAllowedLeadCommentAttachmentUrl(url)) continue;
    out.push({
      url: url.slice(0, 600),
      name: String(a.name != null ? a.name : (a.file_name != null ? a.file_name : '')).slice(0, 400),
      type: String(a.type != null ? a.type : (a.mime_type != null ? a.mime_type : '')).slice(0, 120),
      size: Number.isFinite(Number(a.size != null ? a.size : a.file_size)) ? Number(a.size != null ? a.size : a.file_size) : 0,
    });
  }
  return out;
}

function reactionsTableMissing(error) {
  return String(error?.message || '').toLowerCase().includes('crm_lead_comment_reactions');
}

/** Emoji được phép (thả cảm xúc) — đồng bộ với frontend CRM_COMMENT_REACTION_PICKER */
const CRM_COMMENT_ALLOWED_REACTION_EMOJI = new Set(['👍', '❤️', '😂', '😮', '😢', '🙏']);

function aggregateCrmCommentReactions(rows, currentUserId) {
  const counts = new Map();
  let mine = null;
  for (const r of rows || []) {
    const em = r.emoji;
    if (!CRM_COMMENT_ALLOWED_REACTION_EMOJI.has(em)) continue;
    counts.set(em, (counts.get(em) || 0) + 1);
    if (String(r.user_id) === String(currentUserId)) mine = em;
  }
  const summary = [...counts.entries()]
    .map(([emoji, count]) => ({ emoji, count }))
    .sort((a, b) => b.count - a.count || String(a.emoji).localeCompare(String(b.emoji)));
  return { summary, mine };
}

async function fetchCrmCommentReactionsAggregate(supabase, commentIds, userId) {
  if (!commentIds.length) return new Map();
  const { data: rx, error: rxErr } = await supabase
    .from('crm_lead_comment_reactions')
    .select('comment_id, user_id, emoji')
    .in('comment_id', commentIds);
  if (rxErr) {
    if (reactionsTableMissing(rxErr)) return null;
    throw rxErr;
  }
  const byComment = new Map();
  for (const row of rx || []) {
    const k = row.comment_id;
    if (!byComment.has(k)) byComment.set(k, []);
    byComment.get(k).push(row);
  }
  const out = new Map();
  for (const cid of commentIds) {
    out.set(cid, aggregateCrmCommentReactions(byComment.get(cid) || [], userId));
  }
  return out;
}

// GET /crm/leads/:id/comments → list bình luận của một lead
r.get('/leads/:id/comments', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const leadId = String(req.params.id || '').trim();
    let { data, error } = await supabase
      .from('crm_lead_comments')
      .select('id, lead_id, user_id, parent_id, body, attachments, created_at, updated_at, user:users!crm_lead_comments_user_id_fkey(id,full_name,avatar)')
      .eq('lead_id', leadId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    if (error && crmLeadCommentAttachmentsColumnMissing(error)) {
      ({ data, error } = await supabase
        .from('crm_lead_comments')
        .select('id, lead_id, user_id, parent_id, body, created_at, updated_at, user:users!crm_lead_comments_user_id_fkey(id,full_name,avatar)')
        .eq('lead_id', leadId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true }));
    }
    if (error) {
      if (commentsTableMissing(error)) return res.json([]);
      throw error;
    }
    const list = data || [];
    if (!list.length) return res.json([]);
    const ids = list.map((c) => c.id);
    let rxMap = await fetchCrmCommentReactionsAggregate(supabase, ids, userId);
    if (rxMap == null) {
      rxMap = new Map();
      for (const id of ids) rxMap.set(id, { summary: [], mine: null });
    }
    const out = list.map((c) => ({
      ...c,
      attachments: normalizeCrmLeadCommentAttachments(c.attachments),
      reactions: rxMap.get(c.id) || { summary: [], mine: null },
    }));
    res.json(out);
  } catch (e) {
    console.error('GET /crm/leads/:id/comments:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

// POST /crm/leads/:id/comments → thêm bình luận
r.post('/leads/:id/comments', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const leadId = String(req.params.id || '').trim();
    const body = String(req.body?.body || '').trim();
    const attachmentsRaw = req.body?.attachments;
    const attachments = normalizeCrmLeadCommentAttachments(attachmentsRaw);
    if (Array.isArray(attachmentsRaw) && attachmentsRaw.length && !attachments.length) {
      return res.status(400).json({ error: 'File đính kèm không hợp lệ hoặc URL không được hỗ trợ' });
    }
    if (!body && !attachments.length) return res.status(400).json({ error: 'Nội dung hoặc đính kèm bắt buộc' });

    let parentId = null;
    const parentRaw = req.body?.parent_id;
    if (parentRaw != null && parentRaw !== '') {
      const n = Number(parentRaw);
      if (!Number.isFinite(n) || n <= 0) return res.status(400).json({ error: 'parent_id không hợp lệ' });
      const { data: parentRow, error: pErr } = await supabase
        .from('crm_lead_comments')
        .select('id, lead_id')
        .eq('id', n)
        .is('deleted_at', null)
        .maybeSingle();
      if (pErr) throw pErr;
      if (!parentRow) return res.status(400).json({ error: 'Bình luận cần trả lời không tồn tại' });
      if (String(parentRow.lead_id) !== leadId) return res.status(400).json({ error: 'Không trùng lead/deal' });
      parentId = n;
    }

    const insertRow = { lead_id: leadId, user_id: userId, body, parent_id: parentId };
    if (attachments.length) insertRow.attachments = attachments;

    let { data, error } = await supabase
      .from('crm_lead_comments')
      .insert(insertRow)
      .select('id, lead_id, user_id, parent_id, body, attachments, created_at, updated_at, user:users!crm_lead_comments_user_id_fkey(id,full_name,avatar)')
      .single();
    if (error && crmLeadCommentAttachmentsColumnMissing(error)) {
      return res.status(500).json({
        error: 'Cột attachments chưa có. Chạy migration database/362_crm_lead_comments_attachments.sql trên Supabase.',
      });
    }
    if (error) {
      if (commentsTableMissing(error)) {
        return res.status(500).json({
          error: 'Bảng crm_lead_comments chưa được tạo. Hãy chạy migration database/171_crm_lead_comments.sql.',
        });
      }
      throw error;
    }
    const row = {
      ...data,
      attachments: normalizeCrmLeadCommentAttachments(data.attachments),
      reactions: { summary: [], mine: null },
    };
    const io = req.app.get('io');
    if (io) io.to(`lead:${leadId}`).emit('lead:comment', { lead_id: leadId, action: 'created', comment: row });

    try {
      const leadMembers = await fetchLeadMentionMembers(supabase, leadId);
      const mentionIds = resolveLeadCommentMentionIds(req.body, body, leadMembers, userId);
      const notifyIds = await fetchCrmLeadCommentNotifyUserIds(supabase, leadId);

      await notifyDealCommentParticipants(req, notifyMultiple, leadId, userId, row, notifyIds, mentionIds);

      if (mentionIds.length) {
        await notifyDealCommentMentions(req, notifyMultiple, leadId, userId, row, mentionIds);
        const activityRow = await logLeadCommentMentionActivity(supabase, {
          leadId,
          senderId: userId,
          commentRow: row,
          mentionIds,
          members: leadMembers,
        });
        if (io && activityRow) {
          io.to(`lead:${leadId}`).emit('lead:activity', { lead_id: leadId, activity: activityRow });
        }
      }
    } catch (notifyErr) {
      console.warn('[lead-comment-mention-notify]', notifyErr?.message || notifyErr);
    }

    res.json(row);
  } catch (e) {
    console.error('POST /crm/leads/:id/comments:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});


module.exports = r;
