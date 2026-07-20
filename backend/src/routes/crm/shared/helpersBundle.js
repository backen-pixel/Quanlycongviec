const { Router } = require('express');
const { auth } = require('../../../middleware/auth');
const { supabase } = require('../../../config/supabase');
const { responseCache, invalidateTags: rcInvalidateTags } = require('../../../middleware/responseCache');
const { pgCrmDuplicateLeadIds } = require('../../../helpers/pgHotQueries');
const PDFDocument = require('pdfkit');
const multer = require('multer');
const XLSX = require('xlsx');
const {
  crmTaskMeetsCompletionRequirements,
  crmTaskRequiresCompletionEvidence,
  crmTaskMeetsRequiredFileTypes,
  skipSxWorkQuickComplete,
} = require('../../../helpers/crmTaskCompletionEvidence');
const { logKanbanDeadlineUnifiedHistory } = require('../../../helpers/crmKanbanDeadlineHistory');
const { isLostOrCancelledPipelineStage: orgReportStageIsLostOrCancelled } = require('../../../helpers/crmLostPipelineStage');
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
const { fetchOrgActivityFeed } = require('../../../helpers/orgActivityFeed');
const { emitCrmTaskChanged } = require('../../../helpers/crmTaskRealtime');
const { normalizeTemplateChecklistForCrmTask } = require('../../../helpers/templateChecklistNormalize');
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
  postCrmStageDefaultAssigneeComment,
} = require('../../../helpers/dealCommentNotifications');
const { fetchLeadCommentAudienceMembers } = require('../../../helpers/crmLeadCommentAudience');
const { userCanAccessCrmLeadAsParticipant, userCanAccessCrmLeadViaVisibility } = require('../../../helpers/crmLeadParticipantAccess');
const { isVptCompanyCommercialDocViewer } = require('../../../helpers/dealParticipantProduction');
const { DEFAULT_CHECKLISTS } = require('../../../helpers/defaultChecklists');
const { generateFlowTasks, generateStepTasks } = require('../../../helpers/generateFlowTasks');
const { autoCreateProjectFromWonDeal } = require('../../../helpers/autoDealWonProject');
const { isCrmDealAssigneeLocked, stripCrmAssigneeFromWonStageUpdates } = require('../../../helpers/crmDealAssigneeLock');
const {
  normalizeCrmStageDefaultAssigneeUserId,
  mergeCrmStageDefaultAssigneeIntoUpdates,
} = require('../../../helpers/crmPipelineStageAssignee');
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
  isCrmCompanyAdminUser,
  isCrmRegionAdminUser,
  isCrmSystemAdminUser,
} = require('../../../helpers/crmAccessRoles');
const { isAdminLike, isSystemAdmin, isCrmModuleAdmin, isPlatformAdmin } = require('../../../helpers/adminRole');
const {
  getCrmLeadRegionConstraint,
  applyCrmLeadRegionFilterToQuery,
  assertLeadReadableByRegionScope,
  assertRegionBelongsToCompany,
  assertUserCanAssignCrmRegion,
  normalizeRegionIdList,
  resolveRpcRegionIdsForCrmList,
  userCanAssignAnyCrmRegion,
} = require('../../../helpers/crmRegionScope');
const {
  filterUserIdsForCrmLeadScopedNotification,
  crmTaskDeadlineModuleKey,
  ecosystemModuleKeyForCrmDeadline,
} = require('../../../helpers/deadlineModuleNotifications');
const {
  applyDefaultWorkshopTemplatesForNewProject,
  applyWorkshopTemplateToProject,
  applyAllActiveWorkshopTemplatesForArea,
} = require('../../../helpers/workshopApplyTemplates');
const {
  autoGenCrmTasksForNewLead,
  applyCrmTaskTemplatesToCompanyRegions,
  resyncCrmPipelineTasksForLead,
  ensureMissingCrmTasksForPipelineStage,
  ensureMissingCrmTasksForLead,
  filterCrmTasksForLeadType,
} = require('../../../helpers/autoGenCrmTasks');
const { normalizeTimestamp } = require('../../../helpers/normalizeTimestamp');
const { enforceQuotaForRequest, invalidateTenantUsageCache, resolveTenantIdForQuota } = require('../../../helpers/tenantQuotas');
const {
  invalidatePipelinesAndStages,
  invalidateSources,
  invalidateRegions,
  getPipelinesList,
  getPipelineZaloSlice,
  getDefaultPipelineIdForCompany,
  getPipelineIdForCompanyRegion,
  getStagesByPipelineId,
  getCrmSourcesList,
  getCrmSourceCategoriesList,
  getCrmLeadTypesList,
  getCompanyRegionsList,
} = require('../../../helpers/crmTaxonomyCache');
const { ensureDefaultCrmPipelineForCompany } = require('../../../helpers/ensureDefaultCrmPipeline');
const { getAppSettingValue, invalidateAppSettingKey } = require('../../../helpers/appSettingsCache');
const {
  attachLeadUserFlagsForList,
  setLeadFlag,
} = require('../../../helpers/crmLeadUserFlags');
const { createFulfillmentChildDeal, applyProductionTemplateToFulfillmentLead, applyProductionTemplatesOnPipelineEnter, ensureMissingSxTasksForLead } = require('../../../helpers/projectOrderFulfillment');
const { isPostgresUniqueViolation, nextTbProjectCode } = require('../../../helpers/projectCode');
const { validateProductionCompanyId } = require('../../../helpers/productionCompanyGate');
const { assertDealCrmManualStageChange } = require('../../../helpers/crmDealStageGate');
const { assertCrmStageAdvanceAllowed } = require('../../../helpers/crmTaskStageAdvanceGate');
const {
  assignProductionCompanyDealResponsibility,
  resolveProductionHandoverResponsibleUserId,
} = require('../../../helpers/productionHandoverSettings');
const { ensureDealLeadDocumentsForModuleTransition } = require('../../../helpers/ensureDealLeadDocumentsForModuleTransition');
const { assertDealResponsible, assertLeadDocumentOwner, logProjectFileActivity, logDealStageChangeComment, logDealDeadlineChangeComment, logDealActivityComment } = require('../../../helpers/projectFileActivity');
const { getLeadDocumentFieldsFromCrmTask, getDefaultCrmAttachmentShare } = require('../../../helpers/crmTaskLeadDocumentMeta');
const {
  getDefaultLeadDocumentShareForDeal,
  notifyProductionDocumentUploaded,
} = require('../../../helpers/crmDocumentCrossModule');
const {
  findChecklistItem,
  artifactNamePrefix,
  syncChecklistItemNotes,
  buildChecklistLeadDocumentRow,
  parseChecklist,
} = require('../../../helpers/crmChecklistArtifacts');
const { parseVietnameseMoney, parseVietnameseMeasure, parseExcelMoneyFromMappedColumn } = require('../../../helpers/excelVnNumbers');
const { snapshotOrderRowFromQuotation, mapQuotationItemsToOrderRows } = require('../../../helpers/orderFromQuotation');
const { syncQuotationDepositToDealAndProject } = require('../../../helpers/syncQuotationDepositToDealAndProject');
let autoFlowFns = {};
try { autoFlowFns = require('../../../helpers/autoFlow'); } catch (e) { console.warn('⚠️ autoFlow not loaded:', e.message); }
let misaService = null;
try { misaService = require('../../../services/misaService'); } catch (e) { console.warn('⚠️ misaService not loaded:', e.message); }
const {
  sendZaloTemplateMessage,
  buildDealTemplateData,
  fillTemplateDataFromStructure,
  getDefaultDealZaloTemplateStructure,
  isValidDealZaloTemplateStructure,
  pickDealZaloTemplatePayload,
  resolveZaloDealTemplateId,
  normalizeVnPhoneTo84,
  formatVnPhoneLocal0From84,
} = require('../../../helpers/zaloOa');
const { addPhoneToAutoLeadBlocklist } = require('../../../helpers/crmAutoLeadPhoneBlocklist');
const { pipeStaffLeadDealSummaryPdf, pipeStaffPipelineDetailPdf } = require('../../../helpers/staffLeadDealReportPdf');
const { pipeOrgOverviewReportPdf } = require('../../../helpers/orgOverviewReportPdf');

const ZALO_APP_SETTING_KEY = 'zalo_oa_notify';

function userIsAdmin(role) {
  return normalizeCrmUserRole(role) === 'admin';
}

function companyRegionExtraColumnsMissing(error) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('address') || msg.includes('map_url');
}

function companyRegionGeoColumnsMissing(error) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('lat') || msg.includes('lng') || msg.includes('geocoded_at');
}

/**
 * Lazy forward-geocode chi nhánh thiếu lat/lng (theo address hoặc map_url).
 * Chạy nền, không chặn response. Đã có cache trong `geocode_cache` ⇒ lần sau load
 * sẽ thấy toạ độ. Giới hạn số lượng/chu kỳ để tôn trọng rate-limit Nominatim.
 */
const regionGeocodeInflight = new Set();
let lastNominatimGeocodeAt = 0;

async function scheduleRegionGeocoding(rows) {
  if (!Array.isArray(rows) || !rows.length) return;
  const { forwardGeocode } = require('../../../helpers/forwardGeocode');
  const { inVietnam } = require('../../../helpers/geoBounds');
  const candidates = rows.filter((r) => {
    if (!r || regionGeocodeInflight.has(r.id)) return false;
    const hasGeo = Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lng));
    if (hasGeo) return false;
    const hasAddr = String(r.address || '').trim() || String(r.map_url || '').trim();
    return !!hasAddr;
  }).slice(0, 5);
  if (!candidates.length) return;

  for (const row of candidates) {
    regionGeocodeInflight.add(row.id);
    setImmediate(async () => {
      try {
        const hasGoogleKey = !!(process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_GEOCODING_API_KEY);
        if (!hasGoogleKey) {
          const wait = Math.max(0, 1100 - (Date.now() - lastNominatimGeocodeAt));
          if (wait) await new Promise((r) => setTimeout(r, wait));
          lastNominatimGeocodeAt = Date.now();
        }
        const hit = await forwardGeocode({ address: row.address, map_url: row.map_url });
        if (!hit || !inVietnam(hit.lat, hit.lng)) return;
        const payload = {
          lat: Number(hit.lat.toFixed(6)),
          lng: Number(hit.lng.toFixed(6)),
          geocoded_at: new Date().toISOString(),
        };
        const { error } = await supabase
          .from('company_regions')
          .update(payload)
          .eq('id', row.id);
        if (error) {
          if (!companyRegionGeoColumnsMissing(error) && process.env.NODE_ENV !== 'production') {
            console.warn('[regions/geocode] update', row.id, error.message);
          }
          return;
        }
        invalidateRegions();
      } catch (e) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[regions/geocode]', row?.id, e?.message || e);
        }
      } finally {
        regionGeocodeInflight.delete(row.id);
      }
    });
  }
}

/**
 * Phát socket 'crm:dashboard_changed' để CRMDashboard refetch silent.
 * Dùng ở mọi handler ghi crm_leads (create/update/stage/convert/bulk/merge/delete).
 */
function emitCrmDashboardChanged(req, payload = {}) {
  try {
    const io = req.app.get('io');
    if (!io) return;
    const { emitScoped } = require('../../../helpers/socketEmit');
    const companyId = payload?.company_id
      || payload?.companyId
      || req.user?.company_id
      || null;
    emitScoped(io, { companyId }, 'crm:dashboard_changed', payload || {});
  } catch (e) {
    /* ignore */
  }
}

/** Gán lead/deal, bulk — admin hệ thống/công ty hoặc admin khu vực */
function userIsCrmCompanyOrRegionAdmin(req) {
  return userIsAdmin(req.user?.role) || isCrmRegionAdminUser(req.user);
}

/** Admin CRM / khu vực bỏ qua cấu hình «nhân viên được xóa lead/deal». */
function userCanBypassCrmDeleteRestriction(req) {
  return isCrmModuleAdmin(req.user) || isCrmRegionAdminUser(req.user);
}

async function assertCrmEmployeeDeleteAllowed(req, res, lead) {
  if (userCanBypassCrmDeleteRestriction(req)) return true;
  const pipelineId = lead?.pipeline_id;
  if (!pipelineId) return true;
  const isDeal = String(lead?.type || '').toLowerCase() === 'deal';
  const { data: pipeline, error } = await supabase
    .from('crm_pipelines')
    .select('allow_employee_delete_lead, allow_employee_delete_deal')
    .eq('id', pipelineId)
    .maybeSingle();
  if (error) {
    if (/allow_employee_delete_(lead|deal)/.test(error.message || '')) return true;
    throw error;
  }
  if (!pipeline) return true;
  const allowed = isDeal
    ? pipeline.allow_employee_delete_deal !== false
    : pipeline.allow_employee_delete_lead !== false;
  if (!allowed) {
    res.status(403).json({
      error: isDeal
        ? 'Công ty không cho phép nhân viên xóa Deal. Liên hệ quản trị viên.'
        : 'Công ty không cho phép nhân viên xóa Lead. Liên hệ quản trị viên.',
    });
    return false;
  }
  return true;
}

/** Admin công ty: `admin` + `company_id` trên JWT — khác admin hệ thống (`admin` không `company_id`). */
function scopedAdminCompanyId(req) {
  if (!isCrmCompanyAdminUser(req.user)) return null;
  return String(req.user.company_id).trim();
}

/** Khóa `company_id` khi tạo/sửa CRM: admin công ty hoặc admin khu vực. */
function scopedCrmCompanyIdForWrite(req) {
  const sac = scopedAdminCompanyId(req);
  if (sac) return sac;
  if (isCrmRegionAdminUser(req.user) && req.user.company_id) return String(req.user.company_id).trim();
  return null;
}

/** Báo giá / đơn hàng / hóa đơn — list: admin công ty & NV theo JWT; admin hệ thống theo query (tùy chọn). */
function resolveCommercialDocListCompanyScope(req, res, queryCompanyId) {
  const sac = scopedAdminCompanyId(req);
  if (sac) {
    return { ok: true, companyId: sac, restrictToCreator: false };
  }
  if (userIsAdmin(req.user?.role)) {
    const q = queryCompanyId && String(queryCompanyId).trim();
    const companyId = (q && /^[0-9a-f-]{36}$/i.test(q)) ? q : null;
    return { ok: true, companyId, restrictToCreator: false };
  }
  const cid = req.user?.company_id;
  if (!cid) {
    if (res) {
      res.status(400).json({ error: 'Thiếu company_id của user. Vui lòng đăng xuất/đăng nhập lại hoặc gán company cho tài khoản.' });
    }
    return { ok: false, companyId: null, restrictToCreator: false };
  }
  const restrictToCreator = !isVptCompanyCommercialDocViewer(req.user);
  return { ok: true, companyId: String(cid).trim(), restrictToCreator };
}

/** Báo giá / đơn hàng / hóa đơn — ghi: khóa company_id theo tài khoản (admin công ty / NV). */
function enforceCommercialDocCompanyOnWrite(req, res, payloadCompanyId, entityLabel = 'Chứng từ') {
  const sac = scopedAdminCompanyId(req);
  if (!userIsAdmin(req.user?.role)) {
    const uc = requireUserCompanyId(req, res);
    if (!uc) return { ok: false, companyId: null };
    if (payloadCompanyId && String(payloadCompanyId) !== String(uc)) {
      res.status(403).json({ error: `${entityLabel} phải cùng công ty với tài khoản` });
      return { ok: false, companyId: null };
    }
    return { ok: true, companyId: payloadCompanyId || uc };
  }
  if (sac) {
    if (payloadCompanyId && String(payloadCompanyId) !== String(sac)) {
      res.status(403).json({ error: `${entityLabel} phải cùng công ty với tài khoản` });
      return { ok: false, companyId: null };
    }
    return { ok: true, companyId: payloadCompanyId || sac };
  }
  return { ok: true, companyId: payloadCompanyId || null };
}

function requireUserCompanyId(req, res) {
  const cid = req.user?.company_id;
  if (cid) return cid;
  res.status(400).json({ error: 'Thiếu company_id của user. Vui lòng đăng xuất/đăng nhập lại hoặc gán company cho tài khoản.' });
  return null;
}

/** Fallback phòng ban → công ty khi JWT chưa có company_id (NV sales). */
async function requireUserCompanyIdResolved(req, res) {
  let cid = req.user?.company_id || null;
  if (!cid && req.user?.userId) {
    const { resolveCompanyIdForUser } = require('../../../middleware/auth');
    cid = await resolveCompanyIdForUser(req.user.userId);
    if (cid) req.user.company_id = cid;
  }
  if (!cid) {
    res.status(400).json({ error: 'Thiếu company_id của user. Vui lòng đăng xuất/đăng nhập lại hoặc gán company cho tài khoản.' });
    return null;
  }
  return cid;
}

/** Phân loại nguồn: global (company_id null) khớp mọi nguồn; phân loại theo cty chỉ khớp nguồn cùng công ty */
async function assertCategoryFitsSource(sb, categoryId, sourceCompanyId) {
  if (!categoryId) return { ok: true };
  const { data: cat, error } = await sb.from('crm_source_categories').select('id, company_id').eq('id', categoryId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!cat) return { ok: false, error: 'Phân loại không tồn tại' };
  if (!cat.company_id) return { ok: true };
  if (!sourceCompanyId) {
    return { ok: false, error: 'Phân loại này thuộc một công ty — nguồn chung (không công ty) không được gắn' };
  }
  if (String(cat.company_id) !== String(sourceCompanyId)) {
    return { ok: false, error: 'Phân loại và nguồn phải cùng công ty' };
  }
  return { ok: true };
}

async function getZaloNotifySettings() {
  const v = await getAppSettingValue(ZALO_APP_SETTING_KEY, null);
  if (!v || typeof v !== 'object') {
    return {
      enabled: false,
      access_token: '',
      template_id: '',
      sending_mode: '1',
      merge_template_data: {},
      template_structure: null,
    };
  }
  const ts = v.template_structure;
  const template_structure =
    ts != null && typeof ts === 'object' && !Array.isArray(ts) && Object.keys(ts).length ? ts : null;
  return {
    enabled: !!v.enabled,
    access_token: String(v.access_token || ''),
    template_id: String(v.template_id || ''),
    sending_mode: String(v.sending_mode || '1'),
    merge_template_data: typeof v.merge_template_data === 'object' && v.merge_template_data ? v.merge_template_data : {},
    template_structure,
  };
}

async function upsertZaloNotifySettings(nextVal) {
  const { error } = await supabase.from('app_settings').upsert(
    { key: ZALO_APP_SETTING_KEY, value: nextVal, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  );
  if (error) throw error;
  invalidateAppSettingKey(ZALO_APP_SETTING_KEY);
}

function maskZaloAccessTokenPreview(token) {
  const s = String(token || '');
  if (!s) return '';
  if (s.length <= 12) return '••••••••';
  return `${s.slice(0, 4)}…${s.slice(-4)} (${s.length} ký tự)`;
}

function maskCustomerPhoneDisplay(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length < 5) return phone ? '***' : '—';
  return `${d.slice(0, 3)}****${d.slice(-2)}`;
}

/** Zalo OA (deal): chỉ cột tên chứa «Hoàn thành» (không phân biệt hoa thường / dấu). Thêm cột này trong pipeline Deal nếu chưa có. */
function isDealStageHoanThanhForZalo(stage) {
  if (!stage) return false;
  if (stage.pipeline_type != null && stage.pipeline_type !== 'deal') return false;
  const ascii = String(stage.name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return ascii.includes('hoan thanh');
}

/** Lead/Deal chỉ một người phụ trách: đồng bộ assigned_to ↔ lead_owner_id trên object cập nhật. */
function unifyCrmLeadResponsibleFields(body) {
  const hasA = Object.prototype.hasOwnProperty.call(body, 'assigned_to');
  const hasL = Object.prototype.hasOwnProperty.call(body, 'lead_owner_id');
  if (!hasA && !hasL) return body;
  const norm = (v) => {
    if (v === undefined || v === null || v === '') return null;
    return v;
  };
  let owner;
  if (hasA && hasL) {
    const a = norm(body.assigned_to);
    const l = norm(body.lead_owner_id);
    if (a != null && l != null && String(a) !== String(l)) owner = a;
    else owner = a ?? l;
  } else if (hasA) {
    owner = norm(body.assigned_to);
  } else {
    owner = norm(body.lead_owner_id);
  }
  body.assigned_to = owner;
  body.lead_owner_id = owner;
  return body;
}

/** Gán phụ trách: nhân viên mới phải cùng `company_id` với lead/deal (khi bản ghi đã có công ty).
 *  Ngoại lệ: admin hệ thống (user.company_id = null) được phụ trách mọi lead/deal. */
async function assertCrmAssigneeUserMatchesLeadCompany(sb, assigneeUserId, leadCompanyId) {
  if (!assigneeUserId) return { ok: true };
  const { data: u, error } = await sb.from('users').select('id, company_id, role').eq('id', assigneeUserId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!u) return { ok: false, error: 'Nhân viên không tồn tại.' };
  if (!leadCompanyId) return { ok: false, error: 'Lead/Deal chưa có công ty — chọn công ty trước khi gán người phụ trách.' };
  // Admin hệ thống (không gắn company_id) được phụ trách mọi lead/deal
  if (!u.company_id) return { ok: true };
  if (String(u.company_id).trim() !== String(leadCompanyId).trim()) {
    return { ok: false, error: 'Người phụ trách phải thuộc công ty của lead/deal.' };
  }
  return { ok: true };
}

function shallowMergeTemplateData(globalObj, pipelineObj) {
  const g = globalObj && typeof globalObj === 'object' && !Array.isArray(globalObj) ? globalObj : {};
  const p = pipelineObj && typeof pipelineObj === 'object' && !Array.isArray(pipelineObj) ? pipelineObj : {};
  return { ...g, ...p };
}

function crmRouteErrorText(err) {
  if (err == null) return '';
  if (typeof err === 'string') return err;
  return String(err.message || err.error || err.details || '');
}

/** PostgREST: bảng chưa tạo / chưa vào schema cache của Supabase (crm_pipelines hoặc crm_pipeline_stages). */
function isCrmPipelinesTableMissingError(err) {
  const t = crmRouteErrorText(err).toLowerCase();
  const mentionsPipelineTable =
    t.includes('crm_pipelines') || t.includes('crm_pipeline_stages');
  if (!mentionsPipelineTable) return false;
  return (
    t.includes('schema cache') ||
    t.includes('could not find the table') ||
    t.includes('does not exist') ||
    (t.includes('relation') && t.includes('does not exist')) ||
    t.includes('pgrst200') // FK/embed relationship chưa có trong schema cache
  );
}

function respondIfCrmPipelinesTableMissing(res, err) {
  if (!isCrmPipelinesTableMissingError(err)) return false;
  const detail = crmRouteErrorText(err);
  res.status(503).json({
    code: 'CRM_PIPELINES_TABLE_MISSING',
    detail,
    error:
      'Supabase API chưa nhận bảng pipeline (schema cache cũ hoặc chưa chạy migration). '
      + 'Trên Supabase SQL Editor chạy database/21_crm_pipelines.sql (và migration pipeline stages nếu thiếu), '
      + 'sau đó Settings → API → Reload schema, restart backend, tải lại trang. '
      + `(Chi tiết: ${detail || 'schema cache'})`,
  });
  return true;
}

/** GET /pipelines/:id — lấy pipeline + stages; fallback tách query nếu embed join lỗi schema cache. */
async function fetchPipelineWithStagesById(pipelineId) {
  const { data, error } = await supabase
    .from('crm_pipelines')
    .select('*, company:companies(id, name), stages:crm_pipeline_stages(*)')
    .eq('id', pipelineId)
    .single();
  if (!error && data) {
    if (data.stages) data.stages.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    return { data, error: null };
  }

  // Fallback: tách 2 query (tránh lỗi embed/FK khi PostgREST schema cache chưa có relationship)
  const { data: pipeline, error: plErr } = await supabase
    .from('crm_pipelines')
    .select('*, company:companies(id, name)')
    .eq('id', pipelineId)
    .single();
  if (plErr) return { data: null, error: plErr };

  const { data: stages, error: stErr } = await supabase
    .from('crm_pipeline_stages')
    .select('*')
    .eq('pipeline_id', pipelineId)
    .order('order_index', { ascending: true });
  if (stErr) return { data: null, error: stErr };

  return {
    data: { ...pipeline, stages: stages || [] },
    error: null,
  };
}

const QUOTATIONS_SOURCE_EXCEL_COLS = ['source_excel_file_url', 'source_excel_file_name'];

function isQuotationsSourceExcelColumnMissingError(err) {
  const t = crmRouteErrorText(err).toLowerCase();
  if (!t.includes('schema cache') && !t.includes('could not find')) return false;
  return QUOTATIONS_SOURCE_EXCEL_COLS.some((c) => t.includes(c));
}

function stripQuotationsSourceExcelFields(row) {
  const out = { ...row };
  for (const c of QUOTATIONS_SOURCE_EXCEL_COLS) delete out[c];
  return out;
}

async function insertQuotationRow(row) {
  const prepared = { ...row };
  delete prepared.due_date;
  let result = await supabase.from('quotations').insert(prepared).select('*').single();
  if (result.error && isQuotationsSourceExcelColumnMissingError(result.error)) {
    console.warn(
      '[crm] quotations.source_excel_* chưa có trên DB — lưu không kèm file Excel. Chạy database/169_quotations_source_excel_file.sql rồi Reload schema (Supabase → Settings → API).',
    );
    result = await supabase.from('quotations').insert(stripQuotationsSourceExcelFields(prepared)).select('*').single();
  }
  return result;
}

async function updateQuotationRow(id, row) {
  const prepared = { ...row };
  delete prepared.due_date;
  let result = await supabase.from('quotations').update(prepared).eq('id', id).select('*').single();
  if (result.error && isQuotationsSourceExcelColumnMissingError(result.error)) {
    console.warn(
      '[crm] quotations.source_excel_* chưa có trên DB — cập nhật không kèm file Excel. Chạy database/169_quotations_source_excel_file.sql rồi Reload schema (Supabase → Settings → API).',
    );
    result = await supabase
      .from('quotations')
      .update(stripQuotationsSourceExcelFields(prepared))
      .eq('id', id)
      .select('*')
      .single();
  }
  return result;
}

/** Zalo: template/merge riêng theo crm_pipelines (deal có pipeline_id). */
async function fetchCrmPipelineZaloSlice(pipelineId) {
  return getPipelineZaloSlice(pipelineId);
}

/**
 * Gửi Zalo OA theo cấu hình app_settings + template deal.
 * @param {object} opts
 * @param {boolean} [opts.allowWithoutStageFlag] — true: gửi từ nút thủ công (deal ở cột Hoàn thành), không cần send_zalo_on_enter
 * @param {boolean} [opts.force] — đã gửi OK trước đó (có msg_id): gửi thêm lần nữa. Lần gửi lỗi (không msg_id) luôn cho thử lại không cần force.
 * @param {Record<string,string>|null} [opts.templateDataOverride] — gửi đúng object này làm template_data (đã điền từ deal / sửa tay); bỏ qua pickDealZaloTemplatePayload.
 */
async function executeZaloDealStageNotify({
  leadId,
  stageId,
  pipelineType,
  sendZaloOnEnter,
  allowWithoutStageFlag = false,
  force = false,
  templateDataOverride = null,
}) {
  if (pipelineType !== 'deal') {
    return { ok: false, skipped: true, reason: 'not_deal' };
  }
  if (!allowWithoutStageFlag && !sendZaloOnEnter) {
    return { ok: false, skipped: true, reason: 'stage_zalo_disabled' };
  }

  const settings = await getZaloNotifySettings();
  if (!settings.enabled || !settings.access_token) {
    console.log('[Zalo OA] Bỏ qua — tắt chức năng hoặc thiếu token');
    return { ok: false, skipped: true, reason: 'zalo_not_configured' };
  }

  const { data: prevSend } = await supabase.from('crm_zalo_stage_sends')
    .select('msg_id, error_message')
    .eq('lead_id', leadId)
    .eq('stage_id', stageId)
    .maybeSingle();
  if (!force && prevSend?.msg_id) {
    console.log('[Zalo OA] Đã gửi thành công trước đó cho lead+stage này');
    return { ok: true, skipped: true, reason: 'already_sent', msg_id: prevSend.msg_id };
  }
  /* Có error_message nhưng không msg_id → lần trước thất bại: cho gửi lại (sửa template/SĐT không cần xóa DB). */

  const { data: lead } = await supabase.from('crm_leads')
    .select('id, code, title, type, estimated_value, pipeline_id, customer:customers(id, full_name, phone, email, address)')
    .eq('id', leadId)
    .single();
  if (!lead || lead.type !== 'deal') {
    return { ok: false, skipped: true, reason: 'lead_not_found' };
  }

  const { data: zaloStageMeta } = await supabase
    .from('crm_pipeline_stages')
    .select('id, name, pipeline_type')
    .eq('id', stageId)
    .maybeSingle();
  if (!isDealStageHoanThanhForZalo(zaloStageMeta)) {
    console.log('[Zalo OA] Bỏ qua — không phải cột Hoàn thành');
    return { ok: false, skipped: true, reason: 'not_hoan_thanh_stage' };
  }

  const rawPhone = String(lead.customer?.phone || '').trim();
  const normalizedForSend = normalizeVnPhoneTo84(rawPhone);
  if (!normalizedForSend) {
    console.warn('[Zalo OA] Deal không có SĐT khách hợp lệ (không chuẩn hóa được 84…)');
    await supabase.from('crm_zalo_stage_sends').upsert({
      lead_id: leadId,
      stage_id: stageId,
      tracking_id: `no-phone-${Date.now()}`.slice(0, 48),
      msg_id: null,
      error_message: 'no_customer_phone',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'lead_id,stage_id' });
    return { ok: false, skipped: true, reason: 'no_customer_phone' };
  }

  const plZalo = await fetchCrmPipelineZaloSlice(lead.pipeline_id);
  const templateId = resolveZaloDealTemplateId(plZalo.zalo_template_id || settings.template_id);
  const mergedMerge = shallowMergeTemplateData(settings.merge_template_data, plZalo.zalo_merge_template_data);
  const trackingId = `deal-${String(leadId).replace(/-/g, '').slice(0, 12)}-${String(stageId).replace(/-/g, '').slice(0, 8)}-${Date.now()}`.slice(0, 48);

  const ov = templateDataOverride;
  let templateData;
  if (ov && typeof ov === 'object' && !Array.isArray(ov) && Object.keys(ov).length > 0) {
    templateData = { ...ov };
    Object.keys(templateData).forEach((k) => {
      if (templateData[k] == null) templateData[k] = '';
      else if (typeof templateData[k] !== 'string') templateData[k] = String(templateData[k]);
    });
  } else {
    const fullTemplateData = buildDealTemplateData(lead, lead.customer, mergedMerge);
    templateData = pickDealZaloTemplatePayload(fullTemplateData, templateId);
  }

  const result = await sendZaloTemplateMessage({
    accessToken: settings.access_token,
    phone: normalizedForSend,
    templateId,
    templateData,
    trackingId,
    sendingMode: settings.sending_mode,
  });

  await supabase.from('crm_zalo_stage_sends').upsert({
    lead_id: leadId,
    stage_id: stageId,
    tracking_id: trackingId,
    msg_id: result.msg_id || null,
    error_message: result.ok ? null : (result.message || result.error || JSON.stringify(result.data || {})).slice(0, 2000),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'lead_id,stage_id' });

  if (result.ok && lead.customer?.id) {
    const canonicalLocal = formatVnPhoneLocal0From84(normalizedForSend);
    if (canonicalLocal && rawPhone !== canonicalLocal) {
      await supabase
        .from('customers')
        .update({ phone: canonicalLocal, updated_at: new Date().toISOString() })
        .eq('id', lead.customer.id);
    }
  }

  if (result.ok) {
    console.log('[Zalo OA] Đã gửi', result.msg_id, result.quota);
  } else {
    console.warn('[Zalo OA] Lỗi gửi:', result.message || result.error, result.data);
  }

  return {
    ok: result.ok,
    skipped: false,
    msg_id: result.msg_id,
    zalo_error: result.zalo_error,
    message: result.message,
    hint_vi: result.hint_vi,
    data: result.data,
  };
}

/** Gửi Zalo khi deal vào cột có send_zalo_on_enter (chạy nền, không chặn response) */
async function maybeSendZaloOnDealStageEnter({ leadId, stageId, pipelineType, sendZaloOnEnter }) {
  await executeZaloDealStageNotify({
    leadId,
    stageId,
    pipelineType,
    sendZaloOnEnter,
    allowWithoutStageFlag: false,
    force: false,
  });
}
const { onLeadWon = async () => null, onOrderConfirmed = async () => null, onQuotationAccepted = async () => null, onProjectCompleted = async () => null, getProjectCRMSummary = async () => ({}), getOverdueFollowUps = async () => [], getStaleLeads = async () => [], createProjectFromLead = async () => null } = autoFlowFns;


function crmExecutorFieldsFromTemplateItem(it, ownerCompanyId) {
  const execId = resolveExecutorCompanyId(it, ownerCompanyId);
  if (!execId || String(execId) === String(ownerCompanyId || '')) return { executor_company_id: null };
  return { executor_company_id: execId };
}

function toCrmTaskChecklist(raw, ownerCompanyId, templateItem) {
  const ckDefaultExec = crmExecutorFieldsFromTemplateItem(templateItem || {}, ownerCompanyId).executor_company_id;
  return normalizeTemplateChecklistForCrmTask(raw, ckDefaultExec);
}


// Debug: xác nhận backend đang chạy đúng bản code
// GET /api/crm/_version


/** Chặn NV truy cập lead/deal của người khác (GET/PUT/...) — path /leads/:uuid/... hoặc /deals/:uuid/... */


// ─── HELPER: Create notification (backward compatible wrapper) ──
async function createNotification(req, userId, type, title, message, entityType, entityId, metadata) {
  return await createNotif(req, userId, type, title, message, entityType, entityId, metadata || null);
}

// ─── autoGenCrmTasksForNewLead: imported from helpers/autoGenCrmTasks.js ──

async function notifyMultiple(req, userIds, type, title, message, entityType, entityId, metadata) {
  return await notifyMultipleShared(req, userIds, type, title, message, entityType, entityId, metadata || null);
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Auto-generate code (LEAD-2026-001, BG-2026-001...)
// ═══════════════════════════════════════════════════════════════════════════
async function nextCode(prefix) {
  const year = new Date().getFullYear();
  const { data } = await supabase
    .from('code_sequences')
    .select('current_number, year')
    .eq('prefix', prefix)
    .single();

  let num = 1;
  if (data) {
    num = data.year === year ? data.current_number + 1 : 1;
  }
  await supabase.from('code_sequences').upsert({ prefix, current_number: num, year });
  return `${prefix}-${year}-${String(num).padStart(3, '0')}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// CRM DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════

/** Task CRM còn pending/in_progress, có deadline và đã quá hạn — scope theo danh sách lead/deal đang xem. */
async function countOpenOverdueCrmTasksForLeadIds(leadIds) {
  if (!leadIds?.length) return 0;
  const nowISO = new Date().toISOString();
  let total = 0;
  const chunkSize = 400;
  for (let i = 0; i < leadIds.length; i += chunkSize) {
    const chunk = leadIds.slice(i, i + chunkSize);
    const { count, error } = await supabase
      .from('crm_tasks')
      .select('*', { count: 'exact', head: true })
      .in('lead_id', chunk)
      .not('deadline', 'is', null)
      .lt('deadline', nowISO)
      .in('status', ['pending', 'in_progress']);
    if (error) throw error;
    total += count ?? 0;
  }
  return total;
}

const {
  crmReportCreatedAtFromIso,
  crmReportCreatedAtToIso,
  crmReportDayKeyVn,
  crmReportAsOfMs,
  endOfCalendarDayAfterEntered,
} = require('../../../helpers/crmReportDateBounds');

/** PostgREST mặc định ~1000 dòng/truy vấn — gom đủ bản ghi theo filter để KPI / pipeline không bị trần 1000. */
async function fetchCrmLeadsForDashboardBatched(type, { company_id, region_id, date_from, date_to, assigned_to_only, req }, pageSize = 1000) {
  const rows = [];
  let from = 0;
  for (;;) {
    let q = supabase
      .from('crm_leads')
      .select('id, stage_id, estimated_value, probability, type, assigned_to, lead_owner_id, pipeline_id')
      .eq('type', type);
    if (company_id) {
      const { isCrmAccountingUser } = require('../../../helpers/crmAccessRoles');
      const { applyAccountingCrmCompanyFilter } = require('../../../helpers/accountingScope');
      if (req?.user && isCrmAccountingUser(req.user)) {
        q = applyAccountingCrmCompanyFilter(q, company_id);
      } else {
        q = q.eq('company_id', company_id);
      }
    }
    if (region_id) q = q.eq('region_id', region_id);
    if (req) q = applyCrmLeadRegionFilterToQuery(q, req);
    if (assigned_to_only) {
      if (type === 'lead') {
        q = q.or(`assigned_to.eq.${assigned_to_only},lead_owner_id.eq.${assigned_to_only}`);
      } else {
        q = q.eq('assigned_to', assigned_to_only);
      }
    }
    const createdFrom = crmReportCreatedAtFromIso(date_from);
    const createdTo = crmReportCreatedAtToIso(date_to);
    if (createdFrom) q = q.gte('created_at', createdFrom);
    if (createdTo) q = q.lte('created_at', createdTo);
    const { data, error } = await q.range(from, from + pageSize - 1);
    if (error) throw error;
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

/** Gom lead/deal đủ trường cho báo cáo tổ chức (công ty / khu vực / NV). */
async function fetchCrmLeadsForOrgReportBatched(type, {
  company_id, region_id, date_from, date_to, assigned_to_only, assigned_to_user, req,
}, pageSize = 1000) {
  const { listCrmModuleCompanyIds } = require('../../../helpers/crmModuleCompanies');
  const crmCompanyIds = company_id ? null : await listCrmModuleCompanyIds();
  const rows = [];
  let from = 0;
  for (;;) {
    let q = supabase
      .from('crm_leads')
      .select('id, stage_id, estimated_value, probability, type, phone, assigned_to, lead_owner_id, company_id, region_id, created_at, source_id, stage_entered_at, first_touch_time, lead_type_id, kanban_deadline_at')
      .eq('type', type)
      .is('parent_lead_id', null);
    if (company_id) {
      const { isCrmAccountingUser } = require('../../../helpers/crmAccessRoles');
      const { applyAccountingCrmCompanyFilter } = require('../../../helpers/accountingScope');
      if (req?.user && isCrmAccountingUser(req.user)) {
        q = applyAccountingCrmCompanyFilter(q, company_id);
      } else {
        q = q.eq('company_id', company_id);
      }
    } else if (crmCompanyIds?.length) {
      q = q.in('company_id', crmCompanyIds);
    }
    if (region_id) q = q.eq('region_id', region_id);
    if (req) q = applyCrmLeadRegionFilterToQuery(q, req);
    if (assigned_to_only) {
      if (type === 'lead') {
        q = q.or(`assigned_to.eq.${assigned_to_only},lead_owner_id.eq.${assigned_to_only}`);
      } else {
        q = q.eq('assigned_to', assigned_to_only);
      }
    } else if (assigned_to_user) {
      if (type === 'lead') {
        q = q.or(`assigned_to.eq.${assigned_to_user},lead_owner_id.eq.${assigned_to_user}`);
      } else {
        q = q.eq('assigned_to', assigned_to_user);
      }
    }
    const createdFrom = crmReportCreatedAtFromIso(date_from);
    const createdTo = crmReportCreatedAtToIso(date_to);
    if (createdFrom) q = q.gte('created_at', createdFrom);
    if (createdTo) q = q.lte('created_at', createdTo);
    const { data, error } = await q.range(from, from + pageSize - 1);
    if (error) throw error;
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

function parseCrmReportDateRange(req) {
  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const defaultFrom = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  const endCal = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const defaultTo = `${endCal.getFullYear()}-${pad(endCal.getMonth() + 1)}-${pad(endCal.getDate())}`;
  const isoFrom = (v) => {
    if (!v || typeof v !== 'string') return null;
    const m = v.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
  };
  return {
    df: isoFrom(req.query?.date_from) || defaultFrom,
    dt: isoFrom(req.query?.date_to) || defaultTo,
  };
}

/** Phạm vi công ty + khu vực cho báo cáo CRM. Trả null nếu đã gửi response lỗi. */
async function resolveCrmReportScope(req, res) {
  const rawC = req.query.company_id && String(req.query.company_id).trim()
    ? String(req.query.company_id).trim()
    : null;
  let effectiveCompanyId = rawC;
  const sacDash = scopedAdminCompanyId(req);
  if (sacDash) {
    effectiveCompanyId = sacDash;
  } else if (!userIsAdmin(req.user?.role) && !isPlatformAdmin({ role: req.user?.role })) {
    const cid = requireUserCompanyId(req, res);
    if (!cid) return null;
    effectiveCompanyId = cid;
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
    if (!regRow?.company_id) {
      res.status(400).json({ error: 'Khu vực không tồn tại' });
      return null;
    }
    effectiveCompanyId = String(regRow.company_id);
  }

  if (explicitRegionId && effectiveCompanyId) {
    const v = await assertRegionBelongsToCompany(supabase, effectiveCompanyId, explicitRegionId);
    if (!v.ok) {
      res.status(400).json({ error: v.error });
      return null;
    }
  }

  return { effectiveCompanyId: effectiveCompanyId || null, explicitRegionId };
}

/** Tháng KPI (YYYY-MM-01) theo đồng hồ máy chủ — khớp mặc định tab «Điểm KPI» trên chi tiết lead. */
function defaultKpiLedgerMonthStartYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

/**
 * Tổng điểm ròng sổ cái KPI (crm_kpi_ledger) theo từng lead_id trong kỳ.
 * Gom theo chunk vì .in() và phân trang tránh trần PostgREST.
 * @param {{ userId?: string|null }} [opts] — Khi có `userId`, chỉ cộng điểm của nhân viên đó (khớp bộ lọc NV trên dashboard).
 */
async function sumCrmKpiLedgerNetByLeadIds(leadIds, periodStart, periodType = 'monthly', opts = {}) {
  const sums = Object.create(null);
  if (!leadIds?.length || !periodStart) return sums;
  const userId = opts.userId && String(opts.userId).trim() ? String(opts.userId).trim() : null;
  const uniq = [...new Set(leadIds.map((x) => String(x)))];
  const CHUNK = 150;
  for (let i = 0; i < uniq.length; i += CHUNK) {
    const part = uniq.slice(i, i + CHUNK);
    let from = 0;
    const PAGE = 1000;
    for (;;) {
      let q = supabase
        .from('crm_kpi_ledger')
        .select('lead_id, points')
        .in('lead_id', part)
        .eq('period_type', periodType)
        .eq('period_start', periodStart);
      if (userId) q = q.eq('user_id', userId);
      const { data, error } = await q.range(from, from + PAGE - 1);
      if (error) throw error;
      const rows = data || [];
      for (const r of rows) {
        const lid = r.lead_id;
        if (!lid) continue;
        const k = String(lid);
        sums[k] = (sums[k] || 0) + Number(r.points || 0);
      }
      if (rows.length < PAGE) break;
      from += PAGE;
    }
  }
  for (const k of Object.keys(sums)) {
    sums[k] = Math.round(sums[k] * 100) / 100;
  }
  return sums;
}

/** Tháng KPI (YYYY-MM-01) theo ngày bắt đầu báo cáo. */
function orgReportKpiPeriodStart(dateFromYmd) {
  if (dateFromYmd && /^\d{4}-\d{2}-\d{2}$/.test(String(dateFromYmd).slice(0, 10))) {
    return `${String(dateFromYmd).slice(0, 7)}-01`;
  }
  return defaultKpiLedgerMonthStartYmd();
}

/** Tổng điểm ròng crm_kpi_ledger theo user_id trong kỳ. */
async function sumCrmKpiLedgerNetByUserIds(userIds, periodStart, periodType = 'monthly') {
  const sums = Object.create(null);
  if (!userIds?.length || !periodStart) return sums;
  const uniq = [...new Set(userIds.map((x) => String(x)))];
  const CHUNK = 80;
  for (let i = 0; i < uniq.length; i += CHUNK) {
    const part = uniq.slice(i, i + CHUNK);
    let from = 0;
    const PAGE = 1000;
    for (;;) {
      const { data, error } = await supabase
        .from('crm_kpi_ledger')
        .select('user_id, points')
        .in('user_id', part)
        .eq('period_type', periodType)
        .eq('period_start', periodStart)
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const rows = data || [];
      for (const r of rows) {
        if (!r.user_id) continue;
        const k = String(r.user_id);
        sums[k] = (sums[k] || 0) + Number(r.points || 0);
      }
      if (rows.length < PAGE) break;
      from += PAGE;
    }
  }
  for (const k of Object.keys(sums)) {
    sums[k] = Math.round(sums[k] * 100) / 100;
  }
  return sums;
}

/** Tổng điểm KPI theo user — chỉ lead/deal trong cohort báo cáo, occurred_at trong kỳ (giờ VN). */
async function sumCrmKpiLedgerNetByUserForOrgReport(leadIds, dateFromYmd, dateToYmd, opts = {}) {
  const sums = Object.create(null);
  const fromIso = crmReportCreatedAtFromIso(dateFromYmd);
  const toIso = crmReportCreatedAtToIso(dateToYmd);
  const companyId = opts.companyId ? String(opts.companyId) : null;
  const uniqLeadIds = [...new Set((leadIds || []).map((x) => String(x)))].filter(Boolean);
  if (!uniqLeadIds.length || !fromIso || !toIso) return sums;

  const CHUNK = 150;
  for (let i = 0; i < uniqLeadIds.length; i += CHUNK) {
    const part = uniqLeadIds.slice(i, i + CHUNK);
    let from = 0;
    const PAGE = 1000;
    for (;;) {
      let q = supabase
        .from('crm_kpi_ledger')
        .select('user_id, points')
        .in('lead_id', part)
        .gte('occurred_at', fromIso)
        .lte('occurred_at', toIso);
      if (companyId) q = q.eq('company_id', companyId);
      const { data, error } = await q.range(from, from + PAGE - 1);
      if (error) throw error;
      const rows = data || [];
      for (const r of rows) {
        if (!r.user_id) continue;
        const k = String(r.user_id);
        sums[k] = (sums[k] || 0) + Number(r.points || 0);
      }
      if (rows.length < PAGE) break;
      from += PAGE;
    }
  }
  for (const k of Object.keys(sums)) {
    sums[k] = Math.round(sums[k] * 100) / 100;
  }
  return sums;
}

/** @deprecated — dùng sumCrmKpiLedgerNetByUserForOrgReport */
async function sumCrmKpiLedgerNetByUserIdsInDateRange(userIds, dateFromYmd, dateToYmd) {
  const sums = Object.create(null);
  const fromIso = crmReportCreatedAtFromIso(dateFromYmd);
  const toIso = crmReportCreatedAtToIso(dateToYmd);
  if (!userIds?.length || !fromIso || !toIso) return sums;
  const uniq = [...new Set(userIds.map((x) => String(x)))];
  const CHUNK = 80;
  for (let i = 0; i < uniq.length; i += CHUNK) {
    const part = uniq.slice(i, i + CHUNK);
    let from = 0;
    const PAGE = 1000;
    for (;;) {
      const { data, error } = await supabase
        .from('crm_kpi_ledger')
        .select('user_id, points')
        .in('user_id', part)
        .gte('occurred_at', fromIso)
        .lte('occurred_at', toIso)
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const rows = data || [];
      for (const r of rows) {
        if (!r.user_id) continue;
        const k = String(r.user_id);
        sums[k] = (sums[k] || 0) + Number(r.points || 0);
      }
      if (rows.length < PAGE) break;
      from += PAGE;
    }
  }
  for (const k of Object.keys(sums)) {
    sums[k] = Math.round(sums[k] * 100) / 100;
  }
  return sums;
}

const SURVEY_EVENT_TYPES = ['site_visit'];
const SURVEY_EVENT_SELECT = `id, event_type, title, description, location, start_time, end_time, all_day,
  status, result, cancel_reason, company_id, lead_id, customer_id, assignee_id, created_by,
  assignee:users!crm_events_assignee_id_fkey(id, full_name),
  creator:users!crm_events_created_by_fkey(id, full_name),
    lead:crm_leads(
    id, code, title, type, phone, region_id, assigned_to, lead_owner_id,
    customer:customers(id, full_name, phone, address),
    region:company_regions!crm_leads_region_id_fkey(id, name)
  ),
  customer:customers(id, full_name, phone, address)`;

async function fetchLeadIdsForCrmRegion(companyId, regionId) {
  const lids = [];
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    let lq = supabase.from('crm_leads').select('id').eq('region_id', regionId);
    if (companyId) lq = lq.eq('company_id', companyId);
    const { data, error } = await lq.range(from, from + pageSize - 1);
    if (error) throw error;
    const chunk = data || [];
    lids.push(...chunk.map((x) => x.id));
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return lids;
}

function normalizeOrgReportSurveyVisitRow(ev) {
  const lead = ev.lead || {};
  const cust = ev.customer || lead.customer || {};
  const assigneeName = ev.assignee?.full_name || ev.creator?.full_name || '';
  const fmtDate = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  };
  const fmtTime = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
    });
  };
  const statusLabels = {
    planned: 'Đã lên lịch',
    in_progress: 'Đang thực hiện',
    completed: 'Hoàn thành',
    cancelled: 'Đã hủy',
  };
  const isDeal = lead.type === 'deal';
  return {
    assignee_id: ev.assignee_id || ev.created_by || null,
    status: ev.status || '',
    ngay_khao_sat: fmtDate(ev.start_time),
    gio: ev.all_day ? 'Cả ngày' : fmtTime(ev.start_time),
    nhan_vien: assigneeName,
    ma_deal: isDeal ? (lead.code || '') : '',
    ma_lead: !isDeal ? (lead.code || '') : '',
    khach_hang: cust.full_name || lead.title || ev.title || '',
    sdt: cust.phone || lead.phone || '',
    dia_chi: ev.location || cust.address || '',
    khu_vuc: lead.region?.name || '',
    tieu_de: ev.title || lead.title || '',
    trang_thai: statusLabels[ev.status] || ev.status || '',
    ket_qua: ev.result || '',
    ly_do_huy: ev.cancel_reason || '',
    ghi_chu: ev.description || '',
    start_time: ev.start_time,
  };
}

async function fetchCrmSurveyEventsChunk({
  effectiveCompanyId, crmCompanyIds, leadIdChunk, df, dt, assignedToUser,
}) {
  const fromIso = crmReportCreatedAtFromIso(df);
  const toIso = crmReportCreatedAtToIso(dt);
  const rows = [];
  const pageSize = 500;
  let from = 0;
  for (;;) {
    let q = supabase
      .from('crm_events')
      .select(SURVEY_EVENT_SELECT)
      .in('event_type', SURVEY_EVENT_TYPES)
      .gte('start_time', fromIso)
      .lte('start_time', toIso)
      .order('start_time', { ascending: true });
    if (effectiveCompanyId) q = q.eq('company_id', effectiveCompanyId);
    else if (crmCompanyIds?.length) q = q.in('company_id', crmCompanyIds);
    if (assignedToUser) {
      q = q.or(`assignee_id.eq.${assignedToUser},created_by.eq.${assignedToUser}`);
    }
    if (leadIdChunk?.length) q = q.in('lead_id', leadIdChunk);
    const { data, error } = await q.range(from, from + pageSize - 1);
    if (error) throw error;
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

/** Sự kiện khảo sát (site_visit) trong kỳ báo cáo — dùng xuất Excel tab «Lịch khảo sát». */
async function fetchCrmSurveyVisitsForOrgReport(req, {
  effectiveCompanyId, explicitRegionId, df, dt, departmentId, assignedToUser, employeeUserIds,
}) {
  const fromIso = crmReportCreatedAtFromIso(df);
  const toIso = crmReportCreatedAtToIso(dt);
  if (!fromIso || !toIso) return [];

  let deptUserIds = null;
  if (departmentId) {
    const { data: deptUsers, error: duErr } = await supabase
      .from('users')
      .select('id')
      .eq('department_id', departmentId)
      .neq('is_active', false);
    if (duErr) throw duErr;
    deptUserIds = new Set((deptUsers || []).map((u) => String(u.id)));
    if (!deptUserIds.size) return [];
  }

  let crmCompanyIds = null;
  if (!effectiveCompanyId) {
    const { listCrmModuleCompanyIds } = require('../../../helpers/crmModuleCompanies');
    crmCompanyIds = await listCrmModuleCompanyIds();
    if (!crmCompanyIds?.length) return [];
  }

  let employeeIdSet = null;
  if (employeeUserIds?.length) {
    employeeIdSet = new Set(employeeUserIds.map((x) => String(x)));
    if (!employeeIdSet.size) return [];
  }

  const baseOpts = { effectiveCompanyId, crmCompanyIds, df, dt, assignedToUser };
  let raw = [];
  if (explicitRegionId) {
    const regionLeadIds = await fetchLeadIdsForCrmRegion(effectiveCompanyId, explicitRegionId);
    if (!regionLeadIds.length) return [];
    const CHUNK = 100;
    for (let i = 0; i < regionLeadIds.length; i += CHUNK) {
      const part = regionLeadIds.slice(i, i + CHUNK);
      const chunkRows = await fetchCrmSurveyEventsChunk({ ...baseOpts, leadIdChunk: part });
      raw.push(...chunkRows);
    }
  } else {
    raw = await fetchCrmSurveyEventsChunk({ ...baseOpts, leadIdChunk: null });
  }

  const seen = new Set();
  const out = [];
  for (const ev of raw) {
    if (!ev?.id || seen.has(ev.id)) continue;
    if (deptUserIds) {
      const uid = String(ev.assignee_id || ev.created_by || '');
      if (!deptUserIds.has(uid)) continue;
    }
    if (employeeIdSet) {
      const uid = String(ev.assignee_id || ev.created_by || '');
      const leadUid = String(ev.lead?.assigned_to || ev.lead?.lead_owner_id || '');
      if (!employeeIdSet.has(uid) && !employeeIdSet.has(leadUid)) continue;
    }
    seen.add(ev.id);
    out.push(normalizeOrgReportSurveyVisitRow(ev));
  }
  out.sort((a, b) => String(a.start_time || '').localeCompare(String(b.start_time || '')));
  return out;
}

/** Lead/deal của đúng một user — dùng BC chi tiết theo pipeline (tránh trần 1000 dòng). */
async function fetchCrmLeadsForUserDetailBatched(userId, type, { company_id, region_id, date_from, date_to, req }, pageSize = 1000) {
  const rows = [];
  let from = 0;
  for (;;) {
    let q = supabase
      .from('crm_leads')
      .select('id, pipeline_id, stage_id, estimated_value, probability, type, phone, created_at, stage_entered_at, lead_type_id, first_touch_time, assigned_to, lead_owner_id, company_id, region_id, source_id')
      .eq('type', type);
    if (company_id) q = q.eq('company_id', company_id);
    if (region_id) q = q.eq('region_id', region_id);
    if (req) q = applyCrmLeadRegionFilterToQuery(q, req);
      q = q.or(`assigned_to.eq.${userId},lead_owner_id.eq.${userId}`);
    const createdFrom = crmReportCreatedAtFromIso(date_from);
    const createdTo = crmReportCreatedAtToIso(date_to);
    if (createdFrom) q = q.gte('created_at', createdFrom);
    if (createdTo) q = q.lte('created_at', createdTo);
    const { data, error } = await q.range(from, from + pageSize - 1);
    if (error) throw error;
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

/**
 * Số ms từ epoch của max(updated_at) trong phạm vi lead/deal user được xem (cùng company + khoảng ngày tạo + vùng).
 * Dùng client poll 1 request nhỏ; khi v thay đổi mới refetch dashboard đầy đủ.
 */
async function computeCrmLiveVersionMs(req, effectiveCompanyId, date_from, date_to) {
  const uid = req.user?.userId;
  const seesLead = userSeesAllCrmLeadsForScope(req.user);
  const seesDeal = userSeesAllCrmDealsForScope(req.user);

  const applyCommon = (q) => {
    let x = q;
    if (effectiveCompanyId) x = x.eq('company_id', effectiveCompanyId);
    x = applyCrmLeadRegionFilterToQuery(x, req);
    if (date_from) x = x.gte('created_at', date_from);
    if (date_to) x = x.lte('created_at', date_to + 'T23:59:59.999Z');
    return x;
  };

  const maxForType = async (type) => {
    let q = supabase
      .from('crm_leads')
      .select('updated_at')
      .eq('type', type)
      .order('updated_at', { ascending: false })
      .limit(1);
    q = applyCommon(q);
    if (type === 'lead' && uid && !seesLead) {
      q = q.or(`assigned_to.eq.${uid},lead_owner_id.eq.${uid}`);
    }
    if (type === 'deal' && uid && !seesDeal) {
      q = q.eq('assigned_to', uid);
    }
    const { data, error } = await q.maybeSingle();
    if (error) throw error;
    return data?.updated_at ? new Date(data.updated_at).getTime() : 0;
  };

  const [a, b] = await Promise.all([maxForType('lead'), maxForType('deal')]);
  return Math.max(a, b);
}

/** GET /crm/kanban-rows?lead_ids=… — hydrate vài dòng Kanban cho realtime (không reload cả trang). */

/** GET /crm/live-version — poll nhẹ cho dashboard (chỉ số v = ms) */

/** GET /crm/reports/staff-lead-deal — BC nhân viên: số lead/deal & giá trị pipeline (ước tính) / chốt / thua theo người phụ trách */
const STAFF_LEAD_DEAL_REPORT_ROLES = new Set([
  'admin', 'manager', 'director', 'supervisor', 'superadmin', 'super_admin', 'region_admin',
  'platform_admin', 'sales_admin',
]);

const {
  DEFAULT_PIPELINE_STAGE_SLA_DAYS,
  normalizePipelineStageSlaDaysForDb,
  effectivePipelineStageSlaDays,
  crmLeadMissingPhone,
} = require('../../../helpers/crmPipelineSla');

const CRM_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function fetchAllLeadsForSlaWatchlist(req, effectiveCompanyId, typeFilter, explicitRegionId = null) {
  const rows = [];
  let from = 0;
  const pageSize = 800;
  for (;;) {
    let q = supabase
      .from('crm_leads')
      .select('id, code, title, type, phone, company_id, stage_id, assigned_to, lead_owner_id, stage_entered_at, created_at, region_id')
      .order('updated_at', { ascending: false });
    if (typeFilter === 'lead' || typeFilter === 'deal') q = q.eq('type', typeFilter);
    if (effectiveCompanyId) q = q.eq('company_id', effectiveCompanyId);
    if (explicitRegionId) q = q.eq('region_id', explicitRegionId);
    q = applyCrmLeadRegionFilterToQuery(q, req);
    const { data, error } = await q.range(from, from + pageSize - 1);
    if (error) throw error;
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

/** GET /crm/admin/sla-at-risk — Lead/deal đang ở giai đoạn có SLA gần quá hạn (stage_entered_at + sla_days) */

/** POST /crm/admin/sla-remind — Gửi TB nhắc nhở SLA giai đoạn tới NV phụ trách (không gộp vào TB nhắc hạn tự động) */

function emptyStaffLeadDealAgg() {
  return {
    lead_count: 0,
    lead_pipeline_value: 0,
    deal_count: 0,
    deal_pipeline_value: 0,
    won_deal_count: 0,
    won_value: 0,
    lost_deal_count: 0,
    lost_value: 0,
    lost_lead_count: 0,
    expected_value: 0,
    weighted_value: 0,
    completed_deal_count: 0,
    completed_value: 0,
    open_count: 0,
    overdue_count: 0,
    lead_open_count: 0,
    lead_overdue_count: 0,
    deal_open_count: 0,
    deal_overdue_count: 0,
    reception_eligible_count: 0,
    reception_overdue_count: 0,
    first_stage_open_count: 0,
    first_stage_on_time_count: 0,
    first_stage_overdue_count: 0,
    kpi_ledger_net: 0,
    quote_deal_count: 0,
    quote_value: 0,
    won_or_later_deal_count: 0,
    won_or_later_value: 0,
    customer_order_count: 0,
    customer_order_value: 0,
    delivered_deal_count: 0,
    on_time_deal_count: 0,
    late_deal_count: 0,
    no_evidence_deal_count: 0,
  };
}

/** Slug mặc định = giai đoạn trước ký HĐ (khi chưa cấu hình deal_report_bucket) */
const DEAL_PRE_CONTRACT_SLUGS_STAFF = new Set([
  'designing',
  'quoted',
  'negotiating',
  'waiting_deposit',
]);

/**
 * Phân loại cột Deal cho BC Lead/Deal theo NV.
 * `deal_report_bucket` trên crm_pipeline_stages ghi đè; is_lost luôn ưu tiên thua.
 * @returns {'lost'|'project_completed'|'implementation'|'pre_contract'}
 */
function classifyDealStageForStaffReport(st, slug) {
  if (!st) return 'pre_contract';
  if (orgReportStageIsLostOrCancelled(st)) return 'lost';
  const slugStr = slug || null;

  const bucket = st.deal_report_bucket || null;
  if (bucket === 'lost') return 'lost';
  if (bucket === 'completed') return 'project_completed';
  if (bucket === 'implementation') return 'implementation';
  if (bucket === 'pre_contract') return 'pre_contract';

  if (slugStr === 'completed') return 'project_completed';
  if ((slugStr && DEAL_PRE_CONTRACT_SLUGS_STAFF.has(slugStr)) || (!slugStr && !st.is_won)) return 'pre_contract';
  return 'implementation';
}

/** Trả về { df, dt, effectiveCompanyId, rows } hoặc null (đã gửi response lỗi). */
async function computeStaffLeadDealReportData(req, res) {
  try {
    const roleNorm = normalizeCrmUserRole(req.user?.role);
    if (!STAFF_LEAD_DEAL_REPORT_ROLES.has(roleNorm)) {
      res.status(403).json({ error: 'Không có quyền xem báo cáo này' });
      return null;
    }

    const { department_id, q } = req.query;
    const scope = await resolveCrmReportScope(req, res);
    if (!scope) return null;
    const { effectiveCompanyId, explicitRegionId } = scope;

    // ── Filter type: 'all' | 'lead' | 'deal' ──
    const rawType = String(req.query.type || 'all').toLowerCase();
    const typeView = rawType === 'lead' || rawType === 'deal' ? rawType : 'all';

    const { df, dt } = parseCrmReportDateRange(req);

    const numEst = (x) => {
      const n = Number(x);
      return Number.isFinite(n) ? n : 0;
    };

    const dealAssigneeOnly =
      req.user?.userId && !userSeesAllCrmDealsForScope(req.user) ? req.user.userId : null;
    const leadAssigneeOnly =
      req.user?.userId && !userSeesAllCrmLeadsForScope(req.user) ? req.user.userId : null;

    const skipLeads = typeView === 'deal';
    const skipDeals = typeView === 'lead';
    const fetchOpts = {
        company_id: effectiveCompanyId || undefined,
      region_id: explicitRegionId || undefined,
        date_from: df,
        date_to: dt,
        req,
    };
    const [leadRows, dealRows] = await Promise.all([
      skipLeads ? Promise.resolve([]) : fetchCrmLeadsForDashboardBatched('lead', {
        ...fetchOpts,
        assigned_to_only: leadAssigneeOnly,
      }),
      skipDeals ? Promise.resolve([]) : fetchCrmLeadsForDashboardBatched('deal', {
        ...fetchOpts,
        assigned_to_only: dealAssigneeOnly,
      }),
    ]);

    const stageIds = [...new Set(
      [...leadRows, ...dealRows].map((l) => l.stage_id).filter(Boolean),
    )];
    let stageMap = {};
    if (stageIds.length) {
      const { data: stages } = await supabase
        .from('crm_pipeline_stages')
        .select('id, is_won, is_lost')
        .in('id', stageIds);
      stageMap = Object.fromEntries((stages || []).map((s) => [s.id, s]));
    }

    const UNASSIGNED = '__unassigned__';
    const agg = {};

    const ownerId = (row) => String(row.assigned_to || row.lead_owner_id || '').trim() || null;

    const bump = (uid, patch) => {
      const key = uid || UNASSIGNED;
      if (!agg[key]) agg[key] = emptyStaffLeadDealAgg();
      Object.assign(agg[key], patch(agg[key]));
    };

    for (const l of leadRows) {
      const uid = ownerId(l);
      const v = numEst(l.estimated_value);
      bump(uid, (a) => ({
        lead_count: a.lead_count + 1,
        lead_pipeline_value: a.lead_pipeline_value + v,
      }));
    }

    for (const l of dealRows) {
      const uid = ownerId(l);
      const v = numEst(l.estimated_value);
      const st = l.stage_id ? stageMap[l.stage_id] : null;
      bump(uid, (a) => {
        const n = { ...a };
        n.deal_count += 1;
        n.deal_pipeline_value += v;
        if (st?.is_won) {
          n.won_deal_count += 1;
          n.won_value += v;
        }
        if (st?.is_lost) {
          n.lost_deal_count += 1;
          n.lost_value += v;
        }
        return n;
      });
    }

    if (department_id && String(department_id).trim()) {
      const depId = String(department_id).trim();
      if (effectiveCompanyId) {
        const { data: dep } = await supabase
          .from('departments')
          .select('id, company_id')
          .eq('id', depId)
          .maybeSingle();
        if (!dep || String(dep.company_id) !== String(effectiveCompanyId)) {
          res.status(400).json({ error: 'Phòng ban không thuộc công ty đang chọn' });
          return null;
        }
      }
      const { data: deptUsers } = await supabase
        .from('users')
        .select('id')
        .eq('department_id', depId)
        .neq('is_active', false);
      for (const u of deptUsers || []) {
        if (!agg[u.id]) agg[u.id] = emptyStaffLeadDealAgg();
      }
      const allowed = new Set((deptUsers || []).map((u) => u.id));
      for (const k of Object.keys(agg)) {
        if (k === UNASSIGNED) continue;
        if (!allowed.has(k)) delete agg[k];
      }
      delete agg[UNASSIGNED];
    }

    const userIds = Object.keys(agg).filter((k) => k !== UNASSIGNED);
    let userMap = {};
    if (userIds.length) {
      const { data: users } = await supabase
        .from('users')
        .select('id, full_name, email, department_id, department:departments!users_department_id_fkey(id, name, company_id)')
        .in('id', userIds);
      userMap = Object.fromEntries((users || []).map((u) => [u.id, u]));
    }

    let rows = Object.entries(agg).map(([uidKey, m]) => {
      if (uidKey === UNASSIGNED) {
        return {
          user_id: null,
          full_name: 'Chưa gán phụ trách',
          email: null,
          department_name: null,
          ...m,
        };
      }
      const u = userMap[uidKey];
      return {
        user_id: uidKey,
        full_name: u?.full_name || uidKey,
        email: u?.email || null,
        department_name: u?.department?.name || null,
        ...m,
      };
    });

    const qTerm = q && String(q).trim().toLowerCase();
    if (qTerm) {
      rows = rows.filter((r) => {
        const name = (r.full_name || '').toLowerCase();
        const em = (r.email || '').toLowerCase();
        return name.includes(qTerm) || em.includes(qTerm);
      });
    }

    rows.sort((a, b) => (b.won_value || 0) - (a.won_value || 0)
      || (b.deal_pipeline_value || 0) - (a.deal_pipeline_value || 0));

    return { df, dt, effectiveCompanyId, explicitRegionId, rows, typeView };
  } catch (e) {
    console.error('computeStaffLeadDealReportData:', e);
    if (!res.headersSent) res.status(500).json({ error: e.message || 'Lỗi' });
    return null;
  }
}

function orgReportDayKey(row) {
  return crmReportDayKeyVn(row?.created_at);
}

function orgReportOwnerId(row) {
  return String(row.assigned_to || row.lead_owner_id || '').trim() || null;
}

function orgReportConversionRate(wonCount, dealCount) {
  return dealCount > 0 ? Math.round((wonCount / dealCount) * 100) : 0;
}

function orgReportPreviousPeriod(df, dt) {
  const parse = (s) => {
    const [y, m, d] = String(s).split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const from = parse(df);
  const to = parse(dt);
  const dayMs = 86400000;
  const days = Math.max(1, Math.round((to - from) / dayMs) + 1);
  const prevTo = new Date(from.getTime() - dayMs);
  const prevFrom = new Date(prevTo.getTime() - (days - 1) * dayMs);
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { prevFrom: fmt(prevFrom), prevTo: fmt(prevTo), days };
}

function orgReportPctDelta(cur, prev) {
  const c = Number(cur) || 0;
  const p = Number(prev) || 0;
  if (p === 0) return c > 0 ? 100 : 0;
  return Math.round(((c - p) / p) * 100);
}

function orgReportCompareSummary(current, previous) {
  const metrics = [
    'lead_count', 'deal_count', 'pipeline_value', 'won_deal_count', 'won_value',
    'quote_deal_count', 'quote_value', 'won_or_later_deal_count', 'won_or_later_value',
    'customer_order_count', 'customer_order_value',
    'expected_value', 'weighted_value', 'completed_deal_count', 'completed_value',
    'overdue_count', 'lead_overdue_count', 'deal_overdue_count', 'kpi_ledger_net', 'reception_overdue_count',
  ];
  const out = {};
  for (const key of metrics) {
    const c = Number(current?.[key]) || 0;
    const p = Number(previous?.[key]) || 0;
    out[key] = {
      previous: p,
      delta: Math.round(c - p),
      pct: orgReportPctDelta(c, p),
    };
  }
  out.conversion_rate = {
    previous: Number(previous?.conversion_rate) || 0,
    delta: (Number(current?.conversion_rate) || 0) - (Number(previous?.conversion_rate) || 0),
    pct: null,
  };
  return out;
}

function orgReportNumEst(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function buildPipelineStagesMap(stageMap) {
  const byPipe = {};
  for (const st of Object.values(stageMap || {})) {
    const pid = st.pipeline_id ? String(st.pipeline_id) : '__none__';
    if (!byPipe[pid]) byPipe[pid] = [];
    byPipe[pid].push(st);
  }
  return byPipe;
}

function pipelineHasExplicitExpected(stagesInPipe) {
  return (stagesInPipe || []).some((s) => !!s.counts_as_expected_revenue);
}

function pipelineHasExplicitCompleted(stagesInPipe) {
  return (stagesInPipe || []).some((s) => !!s.counts_as_completed_revenue);
}

function pipelineHasExplicitWon(stagesInPipe) {
  return (stagesInPipe || []).some((s) => !!s.counts_as_won_revenue);
}

function orgReportDealProbability(dealRow, st) {
  const raw = dealRow?.probability;
  if (raw != null && raw !== '') {
    const n = Number(raw);
    if (Number.isFinite(n)) return Math.max(0, Math.min(100, Math.round(n)));
  }
  const fb = st?.default_probability;
  if (fb != null && fb !== '') {
    const n = Number(fb);
    if (Number.isFinite(n)) return Math.max(0, Math.min(100, Math.round(n)));
  }
  return 50;
}

function orgReportDealIsCompleted(st, stagesInPipe) {
  if (!st) return false;
  const slug = st.canonical_slug || null;
  if (st.is_lost || slug === 'lost' || st.deal_report_bucket === 'lost') return false;
  if (pipelineHasExplicitCompleted(stagesInPipe)) return !!st.counts_as_completed_revenue;
  return classifyDealStageForStaffReport(st, slug) === 'project_completed';
}

function orgReportDealCountsExpected(st, stagesInPipe) {
  if (!st || orgReportStageIsLostOrCancelled(st)) return false;
  const slug = st.canonical_slug || null;
  if (pipelineHasExplicitExpected(stagesInPipe)) return !!st.counts_as_expected_revenue;
  if (st.is_won) return false;
  if (orgReportDealIsCompleted(st, stagesInPipe)) return false;
  if (st.deal_report_bucket === 'lost' || st.deal_report_bucket === 'completed') return false;
  if (slug === 'completed' || slug === 'lost') return false;
  return true;
}

/**
 * Deal đã chốt = cột Thắng trở về sau (ký HĐ, SX, lắp đặt, hoàn thành).
 * Hoàn thành và chốt là một — không tách riêng.
 */
function buildWonStageOrderByPipeline(stageMap) {
  const byPipe = {};
  for (const st of Object.values(stageMap || {})) {
    if (!st?.pipeline_id) continue;
    if (st.is_lost || st.canonical_slug === 'lost' || st.deal_report_bucket === 'lost') continue;
    if (!st.is_won) continue;
    const pid = String(st.pipeline_id);
    const ord = Number(st.order_index);
    const order = Number.isFinite(ord) ? ord : 999;
    if (!Number.isFinite(byPipe[pid]) || order > byPipe[pid]) {
      byPipe[pid] = order;
    }
  }
  return byPipe;
}

function orgReportDealSplitBuckets(st, wonStageOrderByPipe) {
  if (!st) return { inDealTab: true, inCustomerTab: false };
  // Thua/Hủy: không vào Deal (pipeline) và không gộp Đơn hàng
  if (orgReportStageIsLostOrCancelled(st)) {
    return { inDealTab: false, inCustomerTab: false };
  }
  const pid = st.pipeline_id ? String(st.pipeline_id) : null;
  const ordRaw = Number(st.order_index);
  const ord = Number.isFinite(ordRaw) ? ordRaw : 999;
  const anchor = pid ? wonStageOrderByPipe?.[pid] : null;
  if (!Number.isFinite(anchor)) return { inDealTab: true, inCustomerTab: false };
  return {
    inDealTab: ord < anchor,
    inCustomerTab: ord >= anchor,
  };
}

function orgReportDealIsClosedWon(st, wonStageOrderByPipe, stagesInPipe) {
  if (!st || st.is_lost) return false;
  const slug = st.canonical_slug || null;
  if (slug === 'lost' || st.deal_report_bucket === 'lost') return false;

  const pid = st.pipeline_id ? String(st.pipeline_id) : null;
  const ordRaw = Number(st.order_index);
  const ord = Number.isFinite(ordRaw) ? ordRaw : 999;
  if (pid && Number.isFinite(wonStageOrderByPipe?.[pid])) {
    return ord >= wonStageOrderByPipe[pid];
  }

  if (pipelineHasExplicitWon(stagesInPipe)) return !!st.counts_as_won_revenue;
  if (st.is_won) return true;
  if (orgReportDealIsCompleted(st, stagesInPipe)) return true;
  if (st.deal_report_bucket === 'implementation' || st.deal_report_bucket === 'completed') return true;
  if (slug === 'contract_signed' || slug === 'producing' || slug === 'installing' || slug === 'completed' || slug === 'won') {
    return true;
  }
  return false;
}

function orgReportExtendedDealMetrics(dealRow, st, stagesInPipe) {
  const v = orgReportNumEst(dealRow.estimated_value);
  const isWon = !!st?.is_won;
  const isLost = orgReportStageIsLostOrCancelled(st);
  const isCompleted = orgReportDealIsCompleted(st, stagesInPipe);
  const countsExpected = orgReportDealCountsExpected(st, stagesInPipe);
  const pct = orgReportDealProbability(dealRow, st);
  return {
    value: v,
    isWon,
    isLost,
    expected_value: countsExpected ? v : 0,
    weighted_value: countsExpected ? Math.round((v * pct) / 100) : 0,
    completed_value: isCompleted ? v : 0,
    completed_deal_count: isCompleted ? 1 : 0,
  };
}

function orgReportStageIsClosed(st) {
  if (!st) return false;
  return !!st.is_won || !!st.is_lost;
}

function orgReportIsSlaOverdue(row, st, asOfMs = Date.now()) {
  if (!st || orgReportStageIsClosed(st)) return false;
  if (crmLeadMissingPhone(row)) return false;
  const slaDays = effectivePipelineStageSlaDays(st.sla_days);
  if (slaDays == null) return false;
  const entered = row.stage_entered_at || row.created_at;
  if (!entered) return false;
  const dueAt = endOfCalendarDayAfterEntered(entered, slaDays);
  return dueAt.getTime() < asOfMs;
}

/**
 * @param {'lead'|'deal'} [kind]
 */
function orgReportBumpOpenOverdue(target, row, st, asOfMs = Date.now(), kind = null) {
  if (orgReportStageIsClosed(st)) return;
  target.open_count += 1;
  const overdue = orgReportIsSlaOverdue(row, st, asOfMs);
  if (overdue) target.overdue_count += 1;
  if (kind === 'lead') {
    target.lead_open_count = (target.lead_open_count || 0) + 1;
    if (overdue) target.lead_overdue_count = (target.lead_overdue_count || 0) + 1;
  } else if (kind === 'deal') {
    target.deal_open_count = (target.deal_open_count || 0) + 1;
    if (overdue) target.deal_overdue_count = (target.deal_overdue_count || 0) + 1;
  }
}

function orgReportOverdueRatePct(m) {
  const open = Number(m?.open_count) || 0;
  const overdue = Number(m?.overdue_count) || 0;
  if (!open) return null;
  return Math.round((overdue / open) * 1000) / 10;
}

function orgReportLeadOverdueRatePct(m) {
  const open = Number(m?.lead_open_count) || 0;
  const overdue = Number(m?.lead_overdue_count) || 0;
  if (!open) return null;
  return Math.round((overdue / open) * 1000) / 10;
}

function orgReportDealOverdueRatePct(m) {
  const open = Number(m?.deal_open_count) || 0;
  const overdue = Number(m?.deal_overdue_count) || 0;
  if (!open) return null;
  return Math.round((overdue / open) * 1000) / 10;
}

function orgReportAttachOverdueRates(m) {
  return {
    overdue_rate_pct: orgReportOverdueRatePct(m),
    lead_overdue_rate_pct: orgReportLeadOverdueRatePct(m),
    deal_overdue_rate_pct: orgReportDealOverdueRatePct(m),
  };
}

function orgReportReceptionOverdueRatePct(m) {
  const eligible = Number(m?.reception_eligible_count) || 0;
  const overdue = Number(m?.reception_overdue_count) || 0;
  if (!eligible) return null;
  return Math.round((overdue / eligible) * 1000) / 10;
}

/** Cột đầu tiên (order_index nhỏ nhất) theo từng pipeline. */
function buildFirstStageIdByPipeline(stageMap) {
  const byPipe = {};
  for (const st of Object.values(stageMap || {})) {
    if (!st?.pipeline_id) continue;
    const pid = String(st.pipeline_id);
    const ord = Number(st.order_index);
    const order = Number.isFinite(ord) ? ord : 999;
    if (!byPipe[pid] || order < byPipe[pid].order) {
      byPipe[pid] = { stageId: String(st.id), order, stage: st };
    }
  }
  return byPipe;
}

/** order_index cột "Báo giá" (canonical_slug='quoted') theo từng pipeline Deal. */
function buildQuotedStageOrderByPipeline(stageMap) {
  const byPipe = {};
  for (const st of Object.values(stageMap || {})) {
    if (!st?.pipeline_id || st.pipeline_type !== 'deal') continue;
    if (st.canonical_slug !== 'quoted') continue;
    const pid = String(st.pipeline_id);
    const ord = Number(st.order_index);
    const order = Number.isFinite(ord) ? ord : 999;
    if (!Number.isFinite(byPipe[pid]) || order < byPipe[pid]) {
      byPipe[pid] = order;
    }
  }
  return byPipe;
}

function orgReportDealIsQuotedOrAfter(st, quotedStageOrderByPipe) {
  if (!st) return false;
  const pid = st.pipeline_id ? String(st.pipeline_id) : null;
  const ordRaw = Number(st.order_index);
  const ord = Number.isFinite(ordRaw) ? ordRaw : 999;
  if (pid && Number.isFinite(quotedStageOrderByPipe?.[pid])) {
    return ord >= quotedStageOrderByPipe[pid];
  }
  const slug = st.canonical_slug || null;
  if (slug && ['quoted', 'negotiating', 'waiting_deposit', 'contract_signed', 'producing', 'installing', 'completed', 'won'].includes(slug)) {
    return true;
  }
  if (st.is_won) return true;
  if (st.deal_report_bucket === 'implementation' || st.deal_report_bucket === 'completed') return true;
  return false;
}

function orgReportFirstStageOnTimeRatePct(m) {
  const open = Number(m?.first_stage_open_count) || 0;
  if (!open) return null;
  const onTime = Number(m?.first_stage_on_time_count) || 0;
  return Math.round((onTime / open) * 1000) / 10;
}

function orgReportFirstStageOverdueRatePct(m) {
  const open = Number(m?.first_stage_open_count) || 0;
  if (!open) return null;
  const overdue = Number(m?.first_stage_overdue_count) || 0;
  return Math.round((overdue / open) * 1000) / 10;
}

/** Lead/deal đang mở ở cột đầu pipeline — đúng hạn vs quá hạn SLA cột. */
function orgReportBumpFirstStageMetrics(target, row, stageMap, firstStageByPipe, asOfMs = Date.now()) {
  const st = row.stage_id ? stageMap[row.stage_id] : null;
  if (!st || orgReportStageIsClosed(st)) return;
  const pid = st.pipeline_id ? String(st.pipeline_id) : null;
  if (!pid) return;
  const first = firstStageByPipe[pid];
  if (!first || String(st.id) !== first.stageId) return;
  target.first_stage_open_count = (target.first_stage_open_count || 0) + 1;
  if (orgReportIsSlaOverdue(row, st, asOfMs)) {
    target.first_stage_overdue_count = (target.first_stage_overdue_count || 0) + 1;
  } else {
    target.first_stage_on_time_count = (target.first_stage_on_time_count || 0) + 1;
  }
}

function orgReportAttachFirstStageRates(m) {
  return {
    first_stage_on_time_rate_pct: orgReportFirstStageOnTimeRatePct(m),
    first_stage_overdue_rate_pct: orgReportFirstStageOverdueRatePct(m),
  };
}

/** Lead quá hạn tiếp nhận: chưa cham hoặc cham muộn hơn sla_minutes (wall-clock). */
function orgReportIsReceptionOverdue(leadRow, slaMinutes, asOfMs = Date.now()) {
  const createdRaw = leadRow?.created_at;
  if (!createdRaw) return false;
  const created = new Date(createdRaw).getTime();
  if (!Number.isFinite(created)) return false;
  const slaMs = Math.max(1, Number(slaMinutes) || 15) * 60 * 1000;
  const firstTouchRaw = leadRow?.first_touch_time;
  if (firstTouchRaw) {
    const touched = new Date(firstTouchRaw).getTime();
    if (!Number.isFinite(touched)) return false;
    return touched - created > slaMs;
  }
  return asOfMs - created > slaMs;
}

function orgReportBumpReceptionMetrics(target, leadRow, slaMinutes, asOfMs = Date.now()) {
  if (!leadRow || leadRow.type === 'deal') return;
  target.reception_eligible_count = (target.reception_eligible_count || 0) + 1;
  if (orgReportIsReceptionOverdue(leadRow, slaMinutes, asOfMs)) {
    target.reception_overdue_count = (target.reception_overdue_count || 0) + 1;
  }
}

async function orgReportReceptionSlaMinutes(_companyId) {
  const { positiveNumberParam } = require('../../../helpers/kpiCalcParams');
  try {
    const { data } = await supabase
      .from('kpi_definitions')
      .select('calc_params')
      .eq('code', 'A1')
      .maybeSingle();
    const params = data?.calc_params && typeof data.calc_params === 'object' ? data.calc_params : {};
    return positiveNumberParam(params, 'sla_minutes', 15);
  } catch {
    return 15;
  }
}

function orgReportCancelRatePct(m) {
  // Deal thua không còn nằm trong deal_count → cộng lost_deal_count vào mẫu số
  const total = (Number(m?.lead_count) || 0)
    + (Number(m?.deal_count) || 0)
    + (Number(m?.customer_order_count) || 0)
    + (Number(m?.lost_deal_count) || 0);
  if (!total) return null;
  const lost = (Number(m?.lost_lead_count) || 0) + (Number(m?.lost_deal_count) || 0);
  return Math.round((lost / total) * 1000) / 10;
}

function orgReportClosedWonDealCount(m) {
  return Number(m?.won_or_later_deal_count ?? m?.won_deal_count) || 0;
}

function orgReportClosedWonValue(m) {
  return Number(m?.won_or_later_value ?? m?.won_value) || 0;
}

function orgReportQuoteWinRatePct(m) {
  const quoteCount = Number(m?.quote_deal_count) || 0;
  const closedCount = orgReportClosedWonDealCount(m);
  if (!quoteCount) return null;
  return Math.round((closedCount / quoteCount) * 1000) / 10;
}

function orgReportQuoteValueCloseRatePct(m) {
  const quoteValue = Number(m?.quote_value) || 0;
  const closedValue = orgReportClosedWonValue(m);
  if (!quoteValue) return null;
  return Math.round((closedValue / quoteValue) * 1000) / 10;
}

/** Tỉ lệ giá trị chốt / tổng GT deal trong kỳ (pipeline + đơn hàng + thua khi tách). */
function orgReportDealCloseValueRatePct(m) {
  const dealValue = (Number(m?.deal_pipeline_value) || 0)
    + (Number(m?.customer_order_value) || 0)
    + (Number(m?.lost_value) || 0);
  const closedValue = orgReportClosedWonValue(m);
  if (!dealValue) return null;
  return Math.round((closedValue / dealValue) * 1000) / 10;
}

function orgReportTotalDealCount(m) {
  return (Number(m?.deal_count) || 0)
    + (Number(m?.customer_order_count) || 0)
    + (Number(m?.lost_deal_count) || 0);
}

function aggregateOrgReportRows(leadRows, dealRows, stageMap, opts = {}) {
  const { slaMinutes = 15, dealKhSplit = false, asOfMs = Date.now() } = opts;
  const pipelineStagesMap = buildPipelineStagesMap(stageMap);
  const firstStageByPipe = buildFirstStageIdByPipeline(stageMap);
  const quotedStageOrderByPipe = buildQuotedStageOrderByPipeline(stageMap);
  const wonStageOrderByPipe = buildWonStageOrderByPipeline(stageMap);
  const UNASSIGNED = '__unassigned__';
  const NONE_REGION = '__none__';
  const NONE_COMPANY = '__none__';
  const NONE_SOURCE = '__none__';
  const NONE_LEAD_TYPE = '__none_lead_type__';

  const summary = emptyStaffLeadDealAgg();
  const timelineMap = {};
  const companyMap = {};
  const regionMap = {};
  const employeeMap = {};
  const sourceMap = {};
  const leadTypeMap = {};
  const funnelMap = {};

  const ensureBucket = (map, key) => {
    if (!map[key]) map[key] = emptyStaffLeadDealAgg();
    return map[key];
  };

  const leadTypeKeyForRow = (row) => (
    row.lead_type_id ? String(row.lead_type_id) : NONE_LEAD_TYPE
  );

  for (const l of leadRows) {
    const v = orgReportNumEst(l.estimated_value);
    const st = l.stage_id ? stageMap[l.stage_id] : null;
    const ck = orgReportDayKey(l);
    const uid = orgReportOwnerId(l) || UNASSIGNED;
    const cid = l.company_id ? String(l.company_id) : NONE_COMPANY;
    const rid = l.region_id ? String(l.region_id) : NONE_REGION;
    const sid = l.source_id ? String(l.source_id) : NONE_SOURCE;
    const ltKey = leadTypeKeyForRow(l);

    const leadLost = orgReportStageIsLostOrCancelled(st);
    orgReportBumpMetrics(summary, { value: v, isLost: leadLost }, null);
    orgReportBumpMetrics(ensureBucket(companyMap, cid), { value: v, isLost: leadLost }, null);
    orgReportBumpMetrics(ensureBucket(regionMap, rid), { value: v, isLost: leadLost }, null);
    orgReportBumpMetrics(ensureBucket(employeeMap, uid), { value: v, isLost: leadLost }, null);
    orgReportBumpMetrics(ensureBucket(sourceMap, sid), { value: v, isLost: leadLost }, null);
    orgReportBumpMetrics(ensureBucket(leadTypeMap, ltKey), { value: v, isLost: leadLost }, null);
    orgReportBumpOpenOverdue(summary, l, st, asOfMs, 'lead');
    orgReportBumpOpenOverdue(ensureBucket(companyMap, cid), l, st, asOfMs, 'lead');
    orgReportBumpOpenOverdue(ensureBucket(regionMap, rid), l, st, asOfMs, 'lead');
    orgReportBumpOpenOverdue(ensureBucket(employeeMap, uid), l, st, asOfMs, 'lead');
    orgReportBumpOpenOverdue(ensureBucket(sourceMap, sid), l, st, asOfMs, 'lead');
    orgReportBumpOpenOverdue(ensureBucket(leadTypeMap, ltKey), l, st, asOfMs, 'lead');
    orgReportBumpReceptionMetrics(summary, l, slaMinutes, asOfMs);
    orgReportBumpReceptionMetrics(ensureBucket(companyMap, cid), l, slaMinutes, asOfMs);
    orgReportBumpReceptionMetrics(ensureBucket(regionMap, rid), l, slaMinutes, asOfMs);
    orgReportBumpReceptionMetrics(ensureBucket(employeeMap, uid), l, slaMinutes, asOfMs);
    orgReportBumpReceptionMetrics(ensureBucket(sourceMap, sid), l, slaMinutes, asOfMs);
    orgReportBumpReceptionMetrics(ensureBucket(leadTypeMap, ltKey), l, slaMinutes, asOfMs);
    orgReportBumpFirstStageMetrics(summary, l, stageMap, firstStageByPipe, asOfMs);
    orgReportBumpFirstStageMetrics(ensureBucket(companyMap, cid), l, stageMap, firstStageByPipe, asOfMs);
    orgReportBumpFirstStageMetrics(ensureBucket(regionMap, rid), l, stageMap, firstStageByPipe, asOfMs);
    orgReportBumpFirstStageMetrics(ensureBucket(employeeMap, uid), l, stageMap, firstStageByPipe, asOfMs);
    orgReportBumpFirstStageMetrics(ensureBucket(sourceMap, sid), l, stageMap, firstStageByPipe, asOfMs);
    orgReportBumpFirstStageMetrics(ensureBucket(leadTypeMap, ltKey), l, stageMap, firstStageByPipe, asOfMs);

    if (l.stage_id) {
      orgReportBumpMetrics(ensureBucket(funnelMap, String(l.stage_id)), { value: v, isLost: leadLost }, null);
    }

    if (ck) {
      if (!timelineMap[ck]) {
        timelineMap[ck] = { date: ck, lead_count: 0, deal_count: 0, customer_order_count: 0, won_value: 0, pipeline_value: 0 };
      }
      timelineMap[ck].lead_count += 1;
      timelineMap[ck].pipeline_value += v;
    }
  }

  for (const l of dealRows) {
    const v = orgReportNumEst(l.estimated_value);
    const st = l.stage_id ? stageMap[l.stage_id] : null;
    const pid = st?.pipeline_id ? String(st.pipeline_id) : '__none__';
    const stagesInPipe = pipelineStagesMap[pid] || [];
    const ext = orgReportExtendedDealMetrics(l, st, stagesInPipe);
    const isQuotedOrAfter = orgReportDealIsQuotedOrAfter(st, quotedStageOrderByPipe);
    const isClosedWon = orgReportDealIsClosedWon(st, wonStageOrderByPipe, stagesInPipe);
    const splitBuckets = dealKhSplit
      ? orgReportDealSplitBuckets(st, wonStageOrderByPipe)
      : { inDealTab: true, inCustomerTab: false };
    const dealPatch = {
      value: ext.value,
      isWon: isClosedWon,
      isLost: ext.isLost,
      expected_value: ext.expected_value,
      weighted_value: ext.weighted_value,
      completed_value: isClosedWon ? ext.value : 0,
      completed_deal_count: isClosedWon ? 1 : 0,
      quote_deal_count: isQuotedOrAfter ? 1 : 0,
      quote_value: isQuotedOrAfter ? ext.value : 0,
      won_or_later_deal_count: isClosedWon ? 1 : 0,
      won_or_later_value: isClosedWon ? ext.value : 0,
      inDealTab: splitBuckets.inDealTab,
      inCustomerTab: splitBuckets.inCustomerTab,
    };
    const ck = orgReportDayKey(l);
    const uid = orgReportOwnerId(l) || UNASSIGNED;
    const cid = l.company_id ? String(l.company_id) : NONE_COMPANY;
    const rid = l.region_id ? String(l.region_id) : NONE_REGION;
    const sid = l.source_id ? String(l.source_id) : NONE_SOURCE;

    orgReportBumpMetrics(summary, null, dealPatch);
    orgReportBumpMetrics(ensureBucket(companyMap, cid), null, dealPatch);
    orgReportBumpMetrics(ensureBucket(regionMap, rid), null, dealPatch);
    orgReportBumpMetrics(ensureBucket(employeeMap, uid), null, dealPatch);
    orgReportBumpMetrics(ensureBucket(sourceMap, sid), null, dealPatch);
    orgReportBumpMetrics(ensureBucket(leadTypeMap, leadTypeKeyForRow(l)), null, dealPatch);
    orgReportBumpOpenOverdue(summary, l, st, asOfMs, 'deal');
    orgReportBumpOpenOverdue(ensureBucket(companyMap, cid), l, st, asOfMs, 'deal');
    orgReportBumpOpenOverdue(ensureBucket(regionMap, rid), l, st, asOfMs, 'deal');
    orgReportBumpOpenOverdue(ensureBucket(employeeMap, uid), l, st, asOfMs, 'deal');
    orgReportBumpOpenOverdue(ensureBucket(sourceMap, sid), l, st, asOfMs, 'deal');
    orgReportBumpOpenOverdue(ensureBucket(leadTypeMap, leadTypeKeyForRow(l)), l, st, asOfMs, 'deal');
    orgReportBumpFirstStageMetrics(summary, l, stageMap, firstStageByPipe, asOfMs);
    orgReportBumpFirstStageMetrics(ensureBucket(companyMap, cid), l, stageMap, firstStageByPipe, asOfMs);
    orgReportBumpFirstStageMetrics(ensureBucket(regionMap, rid), l, stageMap, firstStageByPipe, asOfMs);
    orgReportBumpFirstStageMetrics(ensureBucket(employeeMap, uid), l, stageMap, firstStageByPipe, asOfMs);
    orgReportBumpFirstStageMetrics(ensureBucket(sourceMap, sid), l, stageMap, firstStageByPipe, asOfMs);
    orgReportBumpFirstStageMetrics(ensureBucket(leadTypeMap, leadTypeKeyForRow(l)), l, stageMap, firstStageByPipe, asOfMs);

    {
      const bumpDelivery = (bucket) => {
        bucket.delivered_deal_count = (bucket.delivered_deal_count || 0) + 1;
        const deadline = l.kanban_deadline_at;
        const enteredAt = l.stage_entered_at || l.created_at;
        if (deadline && enteredAt) {
          const dMs = new Date(deadline).getTime();
          const wMs = new Date(enteredAt).getTime();
          if (wMs <= dMs) {
            bucket.on_time_deal_count = (bucket.on_time_deal_count || 0) + 1;
          } else {
            bucket.late_deal_count = (bucket.late_deal_count || 0) + 1;
          }
        } else {
          bucket.on_time_deal_count = (bucket.on_time_deal_count || 0) + 1;
        }
      };
      bumpDelivery(summary);
      bumpDelivery(ensureBucket(companyMap, cid));
      bumpDelivery(ensureBucket(regionMap, rid));
      bumpDelivery(ensureBucket(employeeMap, uid));
      bumpDelivery(ensureBucket(sourceMap, sid));
      bumpDelivery(ensureBucket(leadTypeMap, leadTypeKeyForRow(l)));
    }

    if (l.stage_id) {
      orgReportBumpMetrics(ensureBucket(funnelMap, String(l.stage_id)), null, dealPatch);
    }

    if (ck) {
      if (!timelineMap[ck]) {
        timelineMap[ck] = { date: ck, lead_count: 0, deal_count: 0, customer_order_count: 0, won_value: 0, pipeline_value: 0 };
      }
      if (!ext.isLost) {
        timelineMap[ck].deal_count += dealKhSplit ? (splitBuckets.inDealTab ? 1 : 0) : 1;
        if (dealKhSplit && splitBuckets.inCustomerTab) {
          timelineMap[ck].customer_order_count = (timelineMap[ck].customer_order_count || 0) + 1;
        }
        timelineMap[ck].pipeline_value += v;
      }
      if (isClosedWon) timelineMap[ck].won_value += v;
    }
  }

  const summaryFinal = {
    ...summary,
    pipeline_value: summary.lead_pipeline_value + summary.deal_pipeline_value + (summary.customer_order_value || 0),
    conversion_rate: orgReportConversionRate(
      orgReportClosedWonDealCount(summary),
      orgReportTotalDealCount(summary),
    ),
    quote_win_rate_pct: orgReportQuoteWinRatePct(summary),
    quote_close_value_rate_pct: orgReportQuoteValueCloseRatePct(summary),
    deal_close_value_rate_pct: orgReportDealCloseValueRatePct(summary),
    overdue_rate_pct: orgReportOverdueRatePct(summary),
    lead_overdue_rate_pct: orgReportLeadOverdueRatePct(summary),
    deal_overdue_rate_pct: orgReportDealOverdueRatePct(summary),
    reception_overdue_rate_pct: orgReportReceptionOverdueRatePct(summary),
    ...orgReportAttachFirstStageRates(summary),
    cancel_rate_pct: orgReportCancelRatePct(summary),
    on_time_rate_pct: ((summary.on_time_deal_count || 0) + (summary.late_deal_count || 0)) > 0
      ? Math.round(((summary.on_time_deal_count || 0) / ((summary.on_time_deal_count || 0) + (summary.late_deal_count || 0))) * 100)
      : null,
  };

  return {
    summary: summaryFinal,
    timelineMap,
    companyMap,
    regionMap,
    employeeMap,
    sourceMap,
    leadTypeMap,
    funnelMap,
    UNASSIGNED,
    NONE_REGION,
    NONE_COMPANY,
    NONE_SOURCE,
    NONE_LEAD_TYPE,
  };
}

async function loadOrgReportStageMap(leadRows, dealRows) {
  const stageIds = [...new Set([...leadRows, ...dealRows].map((l) => l.stage_id).filter(Boolean))];
  if (!stageIds.length) return {};
  const stageSelect =
    'id, name, color, icon, order_index, is_won, is_lost, pipeline_type, pipeline_id, sla_days, counts_as_expected_revenue, counts_as_completed_revenue, counts_as_won_revenue, default_probability, canonical_slug, deal_report_bucket';
  const { data: stages } = await supabase
    .from('crm_pipeline_stages')
    .select(stageSelect)
    .in('id', stageIds);
  const stageMap = Object.fromEntries((stages || []).map((s) => [s.id, s]));
  const pipeIds = [...new Set((stages || []).map((s) => s.pipeline_id).filter(Boolean))];
  if (pipeIds.length) {
    const { data: allStages } = await supabase
      .from('crm_pipeline_stages')
      .select(stageSelect)
      .in('pipeline_id', pipeIds);
    for (const s of allStages || []) {
      stageMap[s.id] = s;
    }
  }
  return stageMap;
}

function orgReportBumpMetrics(target, patchLead, patchDeal) {
  if (patchLead != null) {
    const leadVal = typeof patchLead === 'object' ? orgReportNumEst(patchLead.value) : orgReportNumEst(patchLead);
    const leadLost = typeof patchLead === 'object' ? !!patchLead.isLost : false;
    target.lead_count += 1;
    target.lead_pipeline_value += leadVal;
    if (leadLost) target.lost_lead_count += 1;
  }
  if (patchDeal) {
    const isLost = !!patchDeal.isLost;
    // Thua/Hủy: chỉ vào lost_* — không gộp Deal (pipeline) hay Đơn hàng
    const inPipe = !isLost && patchDeal.inDealTab !== false;
    const inCust = !isLost && !!patchDeal.inCustomerTab;

    if (isLost) {
      target.lost_deal_count += 1;
      target.lost_value += patchDeal.value || 0;
    }
    if (inPipe) {
      target.deal_count += 1;
      target.deal_pipeline_value += patchDeal.value;
      target.expected_value += patchDeal.expected_value || 0;
      target.weighted_value += patchDeal.weighted_value || 0;
    }
    if (inCust) {
      target.customer_order_count += 1;
      target.customer_order_value += patchDeal.value || 0;
    }
    if (!isLost && patchDeal.quote_deal_count) {
      target.quote_deal_count += 1;
      target.quote_value += patchDeal.quote_value || 0;
    }
    if (!isLost && patchDeal.isWon) {
      target.won_deal_count += 1;
      target.won_value += patchDeal.value;
      target.won_or_later_deal_count += patchDeal.won_or_later_deal_count || 1;
      target.won_or_later_value += patchDeal.won_or_later_value || patchDeal.value;
    }
    if (!isLost) {
      target.completed_deal_count += patchDeal.completed_deal_count || 0;
      target.completed_value += patchDeal.completed_value || 0;
    }
  }
}

/** Báo cáo phân cấp công ty / khu vực / nhân viên */
async function computeOrgOverviewReportData(req, res) {
  try {
    const roleNorm = normalizeCrmUserRole(req.user?.role);
    const canFullOrgReport = STAFF_LEAD_DEAL_REPORT_ROLES.has(roleNorm);

    // Admin / sales_admin / manager… → BC đầy đủ trong phạm vi công ty.
    // Nhân viên thường → chỉ BC của chính mình (MCP / self-view).
    let assignedToUser = uuidQueryOrNull(req.query.assigned_to);
    if (!canFullOrgReport) {
      if (!req.user?.id) {
        res.status(403).json({ error: 'Không có quyền xem báo cáo này' });
        return null;
      }
      assignedToUser = String(req.user.id);
    }

    const scope = await resolveCrmReportScope(req, res);
    if (!scope) return null;
    const { effectiveCompanyId, explicitRegionId } = scope;
    const { df, dt } = parseCrmReportDateRange(req);

    const rawType = String(req.query.type || 'all').toLowerCase();
    const typeView = rawType === 'lead' || rawType === 'deal' ? rawType : 'all';
    const skipLeads = typeView === 'deal';
    const skipDeals = typeView === 'lead';

    const dealKhSplit = req.query.deal_kh_split === '1'
      || req.query.deal_kh_split === 'true'
      || String(req.query.deal_kh_split || '').toLowerCase() === 'yes';

    // BC tổ chức full không ép assigned_to; nhân viên đã bị khóa ở trên.
    const dealAssigneeOnly = null;
    const leadAssigneeOnly = null;

    const fetchBase = {
      company_id: effectiveCompanyId || undefined,
      region_id: explicitRegionId || undefined,
      assigned_to_user: assignedToUser || undefined,
      req,
    };

    const skipCompare =
      req.query.compare === '0'
      || req.query.compare === 'false'
      || String(req.query.compare || '').toLowerCase() === 'no';
    const { prevFrom, prevTo } = orgReportPreviousPeriod(df, dt);

    const [leadRows, dealRows, prevLeadRows, prevDealRows] = await Promise.all([
      skipLeads ? Promise.resolve([]) : fetchCrmLeadsForOrgReportBatched('lead', {
        ...fetchBase,
        date_from: df,
        date_to: dt,
        assigned_to_only: leadAssigneeOnly,
      }),
      skipDeals ? Promise.resolve([]) : fetchCrmLeadsForOrgReportBatched('deal', {
        ...fetchBase,
        date_from: df,
        date_to: dt,
        assigned_to_only: dealAssigneeOnly,
      }),
      skipCompare || skipLeads ? Promise.resolve([]) : fetchCrmLeadsForOrgReportBatched('lead', {
        ...fetchBase,
        date_from: prevFrom,
        date_to: prevTo,
        assigned_to_only: leadAssigneeOnly,
      }),
      skipCompare || skipDeals ? Promise.resolve([]) : fetchCrmLeadsForOrgReportBatched('deal', {
        ...fetchBase,
        date_from: prevFrom,
        date_to: prevTo,
        assigned_to_only: dealAssigneeOnly,
      }),
    ]);

    const [stageMap, prevStageMap, receptionSlaMinutes] = await Promise.all([
      loadOrgReportStageMap(leadRows, dealRows),
      skipCompare ? Promise.resolve({}) : loadOrgReportStageMap(prevLeadRows, prevDealRows),
      orgReportReceptionSlaMinutes(effectiveCompanyId),
    ]);

    const aggOpts = { slaMinutes: receptionSlaMinutes, dealKhSplit, asOfMs: crmReportAsOfMs(dt) };
    const aggregated = aggregateOrgReportRows(leadRows, dealRows, stageMap, aggOpts);
    const {
      summary,
      timelineMap,
      companyMap,
      regionMap,
      employeeMap,
      sourceMap,
      leadTypeMap,
      funnelMap,
      UNASSIGNED,
      NONE_REGION,
      NONE_COMPANY,
      NONE_SOURCE,
      NONE_LEAD_TYPE,
    } = aggregated;

    let period_previous = null;
    let compare = null;
    let prevAgg = null;
    if (!skipCompare) {
      prevAgg = aggregateOrgReportRows(prevLeadRows, prevDealRows, prevStageMap, aggOpts);
    }

    const department_id = req.query.department_id && String(req.query.department_id).trim();
    let appliedDepartmentId = null;
    if (department_id) {
      const depId = String(department_id).trim();
      appliedDepartmentId = depId;
      if (effectiveCompanyId) {
        const { data: dep } = await supabase
          .from('departments')
          .select('id, company_id')
          .eq('id', depId)
          .maybeSingle();
        if (!dep || String(dep.company_id) !== String(effectiveCompanyId)) {
          res.status(400).json({ error: 'Phòng ban không thuộc công ty đang chọn' });
          return null;
        }
      }
      const { data: deptUsers } = await supabase
        .from('users')
        .select('id')
        .eq('department_id', depId)
        .neq('is_active', false);
      const allowed = new Set((deptUsers || []).map((u) => String(u.id)));
      const pruneDept = (map) => {
        for (const k of Object.keys(map)) {
          if (k === UNASSIGNED) {
            delete map[k];
            continue;
          }
          if (!allowed.has(k)) delete map[k];
        }
      };
      pruneDept(employeeMap);
      if (prevAgg?.employeeMap) pruneDept(prevAgg.employeeMap);
    }

    // --- Đếm deal thiếu bằng chứng ---
    const ensureEvidenceBucket = (map, key) => {
      if (!map[key]) map[key] = emptyStaffLeadDealAgg();
      return map[key];
    };
    // Logic: deal có task bắt buộc evidence (completion_requires_file_or_note hoặc
    // required_evidence_file_types) → nếu task chưa completed hoặc completed thiếu minh chứng
    // → deal tính là thiếu bằng chứng.
    try {
      const { evaluateRequiredEvidenceTypes } = require('../../../helpers/evidenceFileTypes');
      const allDealIds = dealRows.map((l) => l.id).filter(Boolean);
      if (allDealIds.length) {
        const BATCH = 200;
        const dealsWithMissingEvidence = new Set();
        for (let i = 0; i < allDealIds.length; i += BATCH) {
          const batch = allDealIds.slice(i, i + BATCH);
          const { data: evidenceTasks } = await supabase
            .from('crm_tasks')
            .select('id, lead_id, status, notes, completion_requires_file_or_note, required_evidence_file_types')
            .in('lead_id', batch)
            .or('completion_requires_file_or_note.eq.true,required_evidence_file_types.neq.[]');
          if (!evidenceTasks?.length) continue;

          // Task chưa completed → tự động thiếu bằng chứng
          for (const t of evidenceTasks) {
            if (t.status !== 'completed') {
              dealsWithMissingEvidence.add(String(t.lead_id));
            }
          }
          // Task completed → check evidence đủ chưa
          const completedTasks = evidenceTasks.filter((t) => t.status === 'completed'
            && !dealsWithMissingEvidence.has(String(t.lead_id)));
          if (completedTasks.length) {
            const taskIds = completedTasks.map((t) => t.id);
            const attByTask = {};
            const ATT_BATCH = 200;
            for (let j = 0; j < taskIds.length; j += ATT_BATCH) {
              const attBatch = taskIds.slice(j, j + ATT_BATCH);
              const { data: atts } = await supabase
                .from('crm_task_attachments')
                .select('task_id, file_url, file_name, mime_type, notes, doc_type')
                .in('task_id', attBatch);
              for (const a of atts || []) {
                if (!attByTask[a.task_id]) attByTask[a.task_id] = [];
                attByTask[a.task_id].push(a);
              }
            }
            for (const t of completedTasks) {
              if (dealsWithMissingEvidence.has(String(t.lead_id))) continue;
              const required = (Array.isArray(t.required_evidence_file_types) && t.required_evidence_file_types.length)
                ? t.required_evidence_file_types : null;
              const attachments = attByTask[t.id] || [];
              let ok = false;
              if (required) {
                ok = evaluateRequiredEvidenceTypes(required, { taskNotes: t.notes, attachments }).ok;
              } else {
                ok = (t.notes != null && String(t.notes).trim() !== '')
                  || attachments.some((a) =>
                    (a.file_url && String(a.file_url).trim()) || (a.notes != null && String(a.notes).trim()));
              }
              if (!ok) dealsWithMissingEvidence.add(String(t.lead_id));
            }
          }
        }
        const bumpNoEvidence = (bucket) => {
          bucket.no_evidence_deal_count = (bucket.no_evidence_deal_count || 0) + 1;
        };
        for (const l of dealRows) {
          if (!dealsWithMissingEvidence.has(String(l.id))) continue;
          const uid = orgReportOwnerId(l) || UNASSIGNED;
          const cid = l.company_id ? String(l.company_id) : NONE_COMPANY;
          const rid = l.region_id ? String(l.region_id) : NONE_REGION;
          bumpNoEvidence(summary);
          bumpNoEvidence(ensureEvidenceBucket(employeeMap, uid));
          bumpNoEvidence(ensureEvidenceBucket(companyMap, cid));
          bumpNoEvidence(ensureEvidenceBucket(regionMap, rid));
        }
      }
    } catch (evErr) {
      console.warn('[crm/org-overview] evidence check:', evErr.message);
    }

    const reportLeadIds = [...leadRows, ...dealRows].map((r) => r.id).filter(Boolean);
    const prevReportLeadIds = [...prevLeadRows, ...prevDealRows].map((r) => r.id).filter(Boolean);
    const kpiLedgerOpts = { companyId: effectiveCompanyId || null };
    let kpiByUser = {};
    let prevKpiByUser = {};
    try {
      kpiByUser = await sumCrmKpiLedgerNetByUserForOrgReport(reportLeadIds, df, dt, kpiLedgerOpts);
      if (!skipCompare) {
        prevKpiByUser = await sumCrmKpiLedgerNetByUserForOrgReport(
          prevReportLeadIds,
          prevFrom,
          prevTo,
          kpiLedgerOpts,
        );
      }
    } catch (e) {
      console.warn('[crm/org-overview] kpi ledger by user:', e.message);
    }

    const activeUserIds = Object.keys(employeeMap).filter((k) => k !== UNASSIGNED);
    for (const uid of activeUserIds) {
      employeeMap[uid].kpi_ledger_net = kpiByUser[uid] ?? 0;
    }
    summary.kpi_ledger_net = Math.round(
      activeUserIds.reduce((acc, uid) => acc + (kpiByUser[uid] ?? 0), 0) * 100,
    ) / 100;

    if (prevAgg) {
      const prevUserIds = Object.keys(prevAgg.employeeMap).filter((k) => k !== UNASSIGNED);
      for (const uid of prevUserIds) {
        prevAgg.employeeMap[uid].kpi_ledger_net = prevKpiByUser[uid] ?? 0;
      }
      prevAgg.summary.kpi_ledger_net = Math.round(
        prevUserIds.reduce((acc, uid) => acc + (prevKpiByUser[uid] ?? 0), 0) * 100,
      ) / 100;
      period_previous = {
        date_from: prevFrom,
        date_to: prevTo,
        summary: prevAgg.summary,
      };
      compare = orgReportCompareSummary(summary, prevAgg.summary);
    }

    const companyIds = Object.keys(companyMap).filter((k) => k !== NONE_COMPANY);
    const regionIds = Object.keys(regionMap).filter((k) => k !== NONE_REGION);
    const userIds = Object.keys(employeeMap).filter((k) => k !== UNASSIGNED);
    const sourceIds = Object.keys(sourceMap).filter((k) => k !== NONE_SOURCE);
    const leadTypeIds = Object.keys(leadTypeMap).filter((k) => k !== NONE_LEAD_TYPE);

    const [companiesRes, regionsRes, usersRes, sourcesRes, leadTypesRes] = await Promise.all([
      companyIds.length
        ? supabase.from('companies').select('id, name, short_name').in('id', companyIds)
        : Promise.resolve({ data: [] }),
      regionIds.length
        ? supabase.from('company_regions').select('id, name, code, company_id').in('id', regionIds)
        : Promise.resolve({ data: [] }),
      userIds.length
        ? supabase.from('users').select('id, full_name, email, avatar, department_id, department:departments!users_department_id_fkey(id, name)').in('id', userIds)
        : Promise.resolve({ data: [] }),
      sourceIds.length
        ? supabase.from('crm_sources').select('id, name, icon').in('id', sourceIds)
        : Promise.resolve({ data: [] }),
      leadTypeIds.length
        ? supabase.from('crm_lead_types').select('id, name, applies_to, color, order_index, company_id').in('id', leadTypeIds)
        : Promise.resolve({ data: [] }),
    ]);

    const coNameById = Object.fromEntries((companiesRes.data || []).map((c) => [
      String(c.id),
      c.short_name || c.name || String(c.id),
    ]));
    const regById = Object.fromEntries((regionsRes.data || []).map((r) => [String(r.id), r]));
    const userById = Object.fromEntries((usersRes.data || []).map((u) => [String(u.id), u]));
    const srcById = Object.fromEntries((sourcesRes.data || []).map((s) => [String(s.id), s]));
    const leadTypeById = Object.fromEntries((leadTypesRes.data || []).map((t) => [String(t.id), t]));

    const finalizeRows = (entries, labelFn, previousMap = null) => entries
      .map(([key, m]) => {
        const prev = previousMap?.[key] || null;
        return {
          ...m,
          pipeline_value: m.lead_pipeline_value + m.deal_pipeline_value + (m.customer_order_value || 0),
          conversion_rate: orgReportConversionRate(
            orgReportClosedWonDealCount(m),
            orgReportTotalDealCount(m),
          ),
          quote_win_rate_pct: orgReportQuoteWinRatePct(m),
          quote_close_value_rate_pct: orgReportQuoteValueCloseRatePct(m),
          deal_close_value_rate_pct: orgReportDealCloseValueRatePct(m),
          monthly_growth_pct: prev
            ? orgReportPctDelta(
              orgReportClosedWonValue(m),
              orgReportClosedWonValue(prev),
            )
            : null,
          overdue_rate_pct: orgReportOverdueRatePct(m),
          lead_overdue_rate_pct: orgReportLeadOverdueRatePct(m),
          deal_overdue_rate_pct: orgReportDealOverdueRatePct(m),
          reception_overdue_rate_pct: orgReportReceptionOverdueRatePct(m),
          ...orgReportAttachFirstStageRates(m),
          cancel_rate_pct: orgReportCancelRatePct(m),
          on_time_rate_pct: ((m.on_time_deal_count || 0) + (m.late_deal_count || 0)) > 0
            ? Math.round(((m.on_time_deal_count || 0) / ((m.on_time_deal_count || 0) + (m.late_deal_count || 0))) * 100)
            : null,
          ...labelFn(key, m),
        };
      })
      .sort((a, b) => (b.won_value || 0) - (a.won_value || 0)
        || (b.pipeline_value || 0) - (a.pipeline_value || 0));

    const by_company = finalizeRows(Object.entries(companyMap), (key) => ({
      company_id: key === NONE_COMPANY ? null : key,
      company_name: key === NONE_COMPANY ? 'Chưa gán công ty' : (coNameById[key] || key),
    }), prevAgg?.companyMap || null);

    const by_region = finalizeRows(Object.entries(regionMap), (key) => {
      const reg = regById[key];
      const cid = reg?.company_id ? String(reg.company_id) : null;
      return {
        region_id: key === NONE_REGION ? null : key,
        region_name: key === NONE_REGION ? 'Chưa gán khu vực' : (reg?.name || key),
        region_code: reg?.code || null,
        company_id: cid,
        company_name: cid ? (coNameById[cid] || cid) : null,
      };
    }, prevAgg?.regionMap || null);

    const by_employee = finalizeRows(Object.entries(employeeMap), (key) => {
      if (key === UNASSIGNED) {
        return {
          user_id: null,
          full_name: 'Chưa gán phụ trách',
          email: null,
          department_name: null,
        };
      }
      const u = userById[key];
      return {
        user_id: key,
        full_name: u?.full_name || key,
        email: u?.email || null,
        avatar: u?.avatar || null,
        department_name: u?.department?.name || null,
      };
    }, prevAgg?.employeeMap || null);

    const by_source = finalizeRows(Object.entries(sourceMap), (key) => {
      const s = srcById[key];
      return {
        source_id: key === NONE_SOURCE ? null : key,
        source_name: key === NONE_SOURCE ? 'Khác / chưa gán' : (s?.name || key),
        source_icon: s?.icon || null,
      };
    }, prevAgg?.sourceMap || null);

    const by_lead_type = finalizeRows(Object.entries(leadTypeMap), (key) => {
      const lt = leadTypeById[key];
      return {
        lead_type_id: key === NONE_LEAD_TYPE ? null : key,
        lead_type_name: key === NONE_LEAD_TYPE ? 'Chưa gán phân loại' : (lt?.name || key),
        applies_to: lt?.applies_to || null,
        lead_type_color: lt?.color || null,
        order_index: lt?.order_index ?? 999,
        company_id: lt?.company_id ? String(lt.company_id) : null,
      };
    }, prevAgg?.leadTypeMap || null).sort((a, b) => (a.order_index ?? 999) - (b.order_index ?? 999)
      || (b.pipeline_value || 0) - (a.pipeline_value || 0));

    const pipeline_funnel = Object.entries(funnelMap)
      .map(([stageId, m]) => {
        const st = stageMap[stageId];
        return {
          stage_id: stageId,
          name: st?.name || 'Giai đoạn',
          color: st?.color || '#64748b',
          icon: st?.icon || '',
          order_index: st?.order_index ?? 999,
          pipeline_type: st?.pipeline_type || null,
          count: m.lead_count + m.deal_count,
          lead_count: m.lead_count,
          deal_count: m.deal_count,
          value: m.lead_pipeline_value + m.deal_pipeline_value,
          won_count: m.won_deal_count,
          won_value: m.won_value,
        };
      })
      .sort((a, b) => (a.order_index ?? 999) - (b.order_index ?? 999));

    const timeline = Object.values(timelineMap).sort((a, b) => a.date.localeCompare(b.date));

    return {
      df,
      dt,
      effectiveCompanyId,
      explicitRegionId,
      typeView,
      dealKhSplit,
      appliedDepartmentId,
      appliedAssignedTo: assignedToUser,
      summary,
      kpi_ledger_basis: 'occurred_at_on_report_leads',
      kpi_ledger_date_from: df,
      kpi_ledger_date_to: dt,
      period_previous,
      compare,
      timeline,
      pipeline_funnel,
      by_company,
      by_region,
      by_employee,
      by_source,
      by_lead_type,
      reception_sla_minutes: receptionSlaMinutes,
    };
  } catch (e) {
    console.error('computeOrgOverviewReportData:', e);
    if (!res.headersSent) res.status(500).json({ error: e.message || 'Lỗi' });
    return null;
  }
}



/** GET /crm/reports/org-overview — BC phân cấp công ty / khu vực / nhân viên */

/** GET /crm/reports/org-overview/survey-visits — sự kiện đi khảo sát trong kỳ (xuất Excel) */

/** GET /crm/reports/org-activity-feed — hoạt động CRM thực theo sự kiện (stage, tạo mới, ghi chú…) */

/** GET /crm/reports/org-overview/export.pdf */

function isUuidString(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(s || '').trim());
}

/** Chi tiết pipeline theo nhân viên — dùng cho JSON + PDF */
async function computeStaffPipelineDetailPayload(req, res) {
  try {
    const roleNorm = normalizeCrmUserRole(req.user?.role);
    if (!STAFF_LEAD_DEAL_REPORT_ROLES.has(roleNorm)) {
      res.status(403).json({ error: 'Không có quyền xem báo cáo này' });
      return null;
    }

    const targetId = String(req.params.userId || '').trim();
    if (!isUuidString(targetId)) {
      res.status(400).json({ error: 'userId không hợp lệ' });
      return null;
    }

    const leadSelfOnly = req.user?.userId && !userSeesAllCrmLeadsForScope(req.user);
    const dealSelfOnly = req.user?.userId && !userSeesAllCrmDealsForScope(req.user);
    if (leadSelfOnly && String(targetId) !== String(req.user.userId)) {
      res.status(403).json({ error: 'Chỉ xem được dữ liệu của chính bạn' });
      return null;
    }
    if (dealSelfOnly && String(targetId) !== String(req.user.userId)) {
      res.status(403).json({ error: 'Chỉ xem được dữ liệu của chính bạn' });
      return null;
    }

    const { date_from, date_to } = req.query;
    const scope = await resolveCrmReportScope(req, res);
    if (!scope) return null;
    const { effectiveCompanyId, explicitRegionId } = scope;

    const pad = (n) => String(n).padStart(2, '0');
    const now = new Date();
    const defaultFrom = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
    const endCal = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const defaultTo = `${endCal.getFullYear()}-${pad(endCal.getMonth() + 1)}-${pad(endCal.getDate())}`;

    const isoFrom = (v) => {
      if (!v || typeof v !== 'string') return null;
      const m = v.trim().match(/^(\d{4}-\d{2}-\d{2})/);
      return m ? m[1] : null;
    };
    const df = isoFrom(date_from) || defaultFrom;
    const dt = isoFrom(date_to) || defaultTo;

    const numEst = (x) => {
      const n = Number(x);
      return Number.isFinite(n) ? n : 0;
    };

    const rawType = String(req.query.type || 'all').toLowerCase();
    const typeView = rawType === 'lead' || rawType === 'deal' ? rawType : 'all';
    const skipLeads = typeView === 'deal';
    const skipDeals = typeView === 'lead';

    const [leadRows, dealRows] = await Promise.all([
      skipLeads ? Promise.resolve([]) : fetchCrmLeadsForUserDetailBatched(targetId, 'lead', {
        company_id: effectiveCompanyId || undefined,
        region_id: explicitRegionId || undefined,
        date_from: df,
        date_to: dt,
        req,
      }),
      skipDeals ? Promise.resolve([]) : fetchCrmLeadsForUserDetailBatched(targetId, 'deal', {
        company_id: effectiveCompanyId || undefined,
        region_id: explicitRegionId || undefined,
        date_from: df,
        date_to: dt,
        req,
      }),
    ]);

    const allStageIds = [...new Set(
      [...leadRows, ...dealRows].map((l) => l.stage_id).filter(Boolean),
    )];
    let stageMetaById = {};
    if (allStageIds.length) {
      const stageSelect =
        'id, name, order_index, pipeline_id, is_won, is_lost, pipeline_type, canonical_slug, deal_report_bucket, sla_days, counts_as_expected_revenue, counts_as_completed_revenue, counts_as_won_revenue, default_probability';
      const { data: stages } = await supabase
        .from('crm_pipeline_stages')
        .select(stageSelect)
        .in('id', allStageIds);
      stageMetaById = Object.fromEntries((stages || []).map((s) => [s.id, s]));
      const pipeIds = [...new Set((stages || []).map((s) => s.pipeline_id).filter(Boolean))];
      if (pipeIds.length) {
        const { data: allStages } = await supabase
          .from('crm_pipeline_stages')
          .select(stageSelect)
          .in('pipeline_id', pipeIds);
        for (const s of allStages || []) {
          stageMetaById[s.id] = s;
        }
      }
    }
    const pipelineStagesMap = buildPipelineStagesMap(stageMetaById);
    const wonStageOrderByPipe = buildWonStageOrderByPipeline(stageMetaById);

    const NONE = '__none__';
    const byPipe = {};

    const ensure = (pid) => {
      const key = pid || NONE;
      if (!byPipe[key]) {
        byPipe[key] = {
          pipeline_id: pid || null,
          lead_count: 0,
          lead_value: 0,
          deal_count: 0,
          deal_value: 0,
          won_deal_count: 0,
          won_value: 0,
          lost_deal_count: 0,
          lost_value: 0,
          completed_deal_count: 0,
          completed_value: 0,
        };
      }
      return byPipe[key];
    };

    for (const l of leadRows) {
      const b = ensure(l.pipeline_id);
      const v = numEst(l.estimated_value);
      b.lead_count += 1;
      b.lead_value += v;
    }

    for (const l of dealRows) {
      const st = l.stage_id ? stageMetaById[l.stage_id] : null;
      const pipeKey = st?.pipeline_id || l.pipeline_id;
      const b = ensure(pipeKey);
      const v = numEst(l.estimated_value);
      const pid = st?.pipeline_id ? String(st.pipeline_id) : (l.pipeline_id ? String(l.pipeline_id) : '__none__');
      const stagesInPipe = pipelineStagesMap[pid] || [];
      const ext = orgReportExtendedDealMetrics(l, st, stagesInPipe);
      b.deal_count += 1;
      b.deal_value += v;
      const isClosedWon = orgReportDealIsClosedWon(st, wonStageOrderByPipe, stagesInPipe);
      if (isClosedWon) {
        b.won_deal_count += 1;
        b.won_value += v;
      }
      if (st?.is_lost) {
        b.lost_deal_count += 1;
        b.lost_value += v;
      }
      if (ext.completed_deal_count && !isClosedWon) {
        b.completed_deal_count += 1;
        b.completed_value += ext.completed_value;
      }
    }

    const pipeIds = [...new Set(
      Object.keys(byPipe)
        .filter((k) => k !== NONE)
        .map((k) => byPipe[k].pipeline_id)
        .filter(Boolean),
    )];
    let nameMap = {};
    if (pipeIds.length) {
      const { data: pipes } = await supabase
        .from('crm_pipelines')
        .select('id, name')
        .in('id', pipeIds);
      nameMap = Object.fromEntries((pipes || []).map((p) => [p.id, p.name]));
    }

    const pipelines = Object.values(byPipe).map((b) => {
      const pid = b.pipeline_id;
      const name = pid ? (nameMap[pid] || 'Pipeline') : 'Chưa gán pipeline';
      const totalValue = b.lead_value + b.deal_value;
      const openDealCount = Math.max(0, (b.deal_count || 0) - (b.won_deal_count || 0) - (b.lost_deal_count || 0));
      let openValue = b.deal_value - (b.won_value || 0) - (b.lost_value || 0);
      if (!Number.isFinite(openValue) || openValue < 0) openValue = 0;
      return {
        ...b,
        pipeline_name: name,
        total_value: totalValue,
        open_deal_count: openDealCount,
        open_value: openValue,
        completion_rate_pct: (b.deal_count || 0) > 0
          ? Math.round(((b.completed_deal_count || 0) / b.deal_count) * 1000) / 10
          : null,
      };
    });

    pipelines.sort((a, b) => (b.total_value || 0) - (a.total_value || 0));

    /** Theo ngày (phần date của ISO) — khớp filter created_at */
    const dayKey = (row) => {
      const raw = row.created_at;
      if (!raw) return null;
      const m = String(raw).match(/^(\d{4}-\d{2}-\d{2})/);
      return m ? m[1] : null;
    };
    const timelineMap = {};
    for (const l of leadRows) {
      const k = dayKey(l);
      if (!k) continue;
      if (!timelineMap[k]) {
        timelineMap[k] = { date: k, lead_count: 0, lead_value: 0, deal_count: 0, deal_value: 0 };
      }
      timelineMap[k].lead_count += 1;
      timelineMap[k].lead_value += numEst(l.estimated_value);
    }
    for (const l of dealRows) {
      const k = dayKey(l);
      if (!k) continue;
      if (!timelineMap[k]) {
        timelineMap[k] = { date: k, lead_count: 0, lead_value: 0, deal_count: 0, deal_value: 0 };
      }
      timelineMap[k].deal_count += 1;
      timelineMap[k].deal_value += numEst(l.estimated_value);
    }

    const timeline = Object.values(timelineMap).sort((a, b) => String(a.date).localeCompare(String(b.date)));

    let dealOpenCount = 0;
    let dealOpenValue = 0;
    let dealWonCount = 0;
    let dealWonValue = 0;
    let dealLostCount = 0;
    let dealLostValue = 0;
    let dealProjectCompletedCount = 0;
    let dealProjectCompletedValue = 0;
    /** Đã ký HĐ → trước hoàn thành: SX, lắp đặt, ký HĐ… */
    let dealImplementationCount = 0;
    let dealImplementationValue = 0;
    /** Trước ký HĐ */
    let dealPreContractCount = 0;
    let dealPreContractValue = 0;
    let dealExpectedValue = 0;
    let dealWeightedValue = 0;
    for (const l of dealRows) {
      const v = numEst(l.estimated_value);
      const st = l.stage_id ? stageMetaById[l.stage_id] : null;
      const pid = st?.pipeline_id ? String(st.pipeline_id) : (l.pipeline_id ? String(l.pipeline_id) : '__none__');
      const stagesInPipe = pipelineStagesMap[pid] || [];
      const ext = orgReportExtendedDealMetrics(l, st, stagesInPipe);
      dealExpectedValue += ext.expected_value;
      dealWeightedValue += ext.weighted_value;
      const slug = st?.canonical_slug || null;
      const cls = classifyDealStageForStaffReport(st, slug);

      if (cls === 'lost') {
        dealLostCount += 1;
        dealLostValue += v;
        continue;
      }
      if (cls === 'project_completed') {
        dealProjectCompletedCount += 1;
        dealProjectCompletedValue += v;
      } else if (cls === 'pre_contract') {
        dealPreContractCount += 1;
        dealPreContractValue += v;
      } else {
        dealImplementationCount += 1;
        dealImplementationValue += v;
      }

      const isClosedWon = orgReportDealIsClosedWon(st, wonStageOrderByPipe, stagesInPipe);

      if (isClosedWon) {
        dealWonCount += 1;
        dealWonValue += v;
      } else if (!st?.is_lost) {
        dealOpenCount += 1;
        dealOpenValue += v;
      }
    }

    const leadTot = leadRows.length;
    const leadValTot = leadRows.reduce((s, l) => s + numEst(l.estimated_value), 0);
    let leadLostCount = 0;
    for (const l of leadRows) {
      const st = l.stage_id ? stageMetaById[l.stage_id] : null;
      if (st?.is_lost) leadLostCount += 1;
    }
    const dealTot = dealRows.length;
    const dealValTot = dealRows.reduce((s, l) => s + numEst(l.estimated_value), 0);
    const totalPipelineVal = leadValTot + dealValTot;
    const receptionSlaMinutes = await orgReportReceptionSlaMinutes(effectiveCompanyId);
    const { summary: orgAlignedSummary } = aggregateOrgReportRows(leadRows, dealRows, stageMetaById, {
      slaMinutes: receptionSlaMinutes,
    });
    const closedWonCount = orgReportClosedWonDealCount(orgAlignedSummary);
    const closedWonValue = orgReportClosedWonValue(orgAlignedSummary);
    const closedForRate = closedWonCount + (orgAlignedSummary.lost_deal_count || 0);
    const kpiPeriodStart = orgReportKpiPeriodStart(df);
    let kpiLedgerNet = 0;
    try {
      const kpiByUser = await sumCrmKpiLedgerNetByUserIds([targetId], kpiPeriodStart);
      kpiLedgerNet = kpiByUser[String(targetId)] ?? 0;
    } catch (e) {
      console.warn('[crm/staff-pipelines] kpi ledger:', e.message);
    }
    const summary = {
      ...orgAlignedSummary,
      lead_value: orgAlignedSummary.lead_pipeline_value,
      deal_value: orgAlignedSummary.deal_pipeline_value,
      total_pipeline_value: orgAlignedSummary.pipeline_value,
      won_deal_count: closedWonCount,
      won_value: closedWonValue,
      won_or_later_deal_count: closedWonCount,
      won_or_later_value: closedWonValue,
      completed_deal_count: closedWonCount,
      completed_value: closedWonValue,
      lost_deal_count: orgAlignedSummary.lost_deal_count,
      lost_value: orgAlignedSummary.lost_value,
      lost_lead_count: orgAlignedSummary.lost_lead_count,
      open_deal_count: dealOpenCount,
      open_value: dealOpenValue,
      project_completed_count: dealProjectCompletedCount,
      project_completed_value: dealProjectCompletedValue,
      implementation_count: dealImplementationCount,
      implementation_value: dealImplementationValue,
      pre_contract_count: dealPreContractCount,
      pre_contract_value: dealPreContractValue,
      pending_completion_count: dealImplementationCount + dealPreContractCount,
      pending_completion_value: dealImplementationValue + dealPreContractValue,
      net_won_minus_lost_value: closedWonValue - (orgAlignedSummary.lost_value || 0),
      total_excluding_lost_value: totalPipelineVal - (orgAlignedSummary.lost_value || 0),
      pipeline_count: pipelines.filter((p) => (p.lead_count || 0) + (p.deal_count || 0) > 0).length,
      win_rate_closed_pct: closedForRate > 0 ? Math.round((closedWonCount / closedForRate) * 1000) / 10 : null,
      win_rate_all_deals_pct: dealTot > 0 ? Math.round((closedWonCount / dealTot) * 1000) / 10 : null,
      kpi_ledger_net: kpiLedgerNet,
      kpi_ledger_period_start: kpiPeriodStart,
    };

    /** Gom theo từng giai đoạn (stage) — tiền đang nằm ở cột Kanban nào */
    const stageAgg = new Map();
    const bumpStageRow = (row, kind, val) => {
      const key = row.stage_id ? String(row.stage_id) : '__none__';
      if (!stageAgg.has(key)) {
        stageAgg.set(key, {
          stage_id: row.stage_id || null,
          lead_count: 0,
          lead_value: 0,
          deal_count: 0,
          deal_value: 0,
        });
      }
      const b = stageAgg.get(key);
      if (kind === 'lead') {
        b.lead_count += 1;
        b.lead_value += val;
      } else {
        b.deal_count += 1;
        b.deal_value += val;
      }
    };
    for (const l of leadRows) bumpStageRow(l, 'lead', numEst(l.estimated_value));
    for (const l of dealRows) bumpStageRow(l, 'deal', numEst(l.estimated_value));

    const stagePipelineIds = [...new Set(
      [...stageAgg.values()]
        .map((a) => (a.stage_id ? stageMetaById[a.stage_id]?.pipeline_id : null))
        .filter(Boolean),
    )];
    let stagePipeNames = {};
    if (stagePipelineIds.length) {
      const { data: spipes } = await supabase
        .from('crm_pipelines')
        .select('id, name')
        .in('id', stagePipelineIds);
      stagePipeNames = Object.fromEntries((spipes || []).map((p) => [p.id, p.name]));
    }

    const outcomeLabel = (outcome) => {
      if (outcome === 'lost') return 'Thua';
      if (outcome === 'project_completed') return 'Hoàn thành';
      if (outcome === 'implementation') return 'Đang triển khai';
      if (outcome === 'pre_contract') return 'Chưa chốt';
      return '';
    };

    const stage_breakdown = [...stageAgg.values()].map((agg) => {
      const meta = agg.stage_id ? stageMetaById[agg.stage_id] : null;
      const pid = meta?.pipeline_id || null;
      const slug = meta?.canonical_slug || null;
      let dealOutcome = null;
      if (agg.deal_count > 0 && meta) {
        const cls = classifyDealStageForStaffReport(meta, slug);
        if (cls === 'lost') dealOutcome = 'lost';
        else if (cls === 'project_completed') dealOutcome = 'project_completed';
        else if (cls === 'implementation') dealOutcome = 'implementation';
        else dealOutcome = 'pre_contract';
      }
      const stageTotalValue = agg.lead_value + agg.deal_value;
      const pt = meta?.pipeline_type || null;
      return {
        stage_id: agg.stage_id,
        stage_name: meta?.name || (agg.stage_id ? '—' : 'Chưa xác định giai đoạn'),
        pipeline_id: pid,
        pipeline_name: pid ? (stagePipeNames[pid] || 'Pipeline') : null,
        pipeline_type: pt,
        kanban_type_label: pt === 'deal' ? 'Deal' : pt === 'lead' ? 'Lead' : '',
        canonical_slug: slug || null,
        order_index: meta?.order_index ?? null,
        deal_outcome: dealOutcome,
        deal_outcome_label: dealOutcome ? outcomeLabel(dealOutcome) : '',
        deal_report_bucket: meta?.deal_report_bucket ?? null,
        lead_count: agg.lead_count,
        lead_value: agg.lead_value,
        deal_count: agg.deal_count,
        deal_value: agg.deal_value,
        stage_total_value: stageTotalValue,
      };
    });

    stage_breakdown.sort((a, b) => {
      const na = a.stage_id ? 0 : 1;
      const nb = b.stage_id ? 0 : 1;
      if (na !== nb) return na - nb;
      const pa = String(a.pipeline_id || '\uffff');
      const pb = String(b.pipeline_id || '\uffff');
      if (pa !== pb) return pa.localeCompare(pb);
      const oa = a.order_index ?? 999999;
      const ob = b.order_index ?? 999999;
      if (oa !== ob) return oa - ob;
      return String(a.stage_name || '').localeCompare(String(b.stage_name || ''));
    });

    const firstStageByPipe = buildFirstStageIdByPipeline(stageMetaById);
    const firstStageAgg = emptyStaffLeadDealAgg();
    for (const l of leadRows) {
      orgReportBumpFirstStageMetrics(firstStageAgg, l, stageMetaById, firstStageByPipe);
    }
    for (const l of dealRows) {
      orgReportBumpFirstStageMetrics(firstStageAgg, l, stageMetaById, firstStageByPipe);
    }
    const firstStageNames = [...new Set(
      Object.values(firstStageByPipe).map((x) => x.stage?.name).filter(Boolean),
    )];
    const first_stage_sla = {
      open_count: firstStageAgg.first_stage_open_count,
      on_time_count: firstStageAgg.first_stage_on_time_count,
      overdue_count: firstStageAgg.first_stage_overdue_count,
      on_time_rate_pct: orgReportFirstStageOnTimeRatePct(firstStageAgg),
      overdue_rate_pct: orgReportFirstStageOverdueRatePct(firstStageAgg),
      stage_labels: firstStageNames.slice(0, 5),
    };
    summary.first_stage_open_count = firstStageAgg.first_stage_open_count;
    summary.first_stage_on_time_count = firstStageAgg.first_stage_on_time_count;
    summary.first_stage_overdue_count = firstStageAgg.first_stage_overdue_count;
    Object.assign(summary, orgReportAttachFirstStageRates(firstStageAgg));

    const NONE_LEAD_TYPE = '__none_lead_type__';
    const leadTypeDetailMap = {};
    const ensureLeadTypeBucket = (key) => {
      if (!leadTypeDetailMap[key]) {
        leadTypeDetailMap[key] = { lead_count: 0, deal_count: 0, lead_value: 0, deal_value: 0 };
      }
      return leadTypeDetailMap[key];
    };
    for (const l of leadRows) {
      const key = l.lead_type_id ? String(l.lead_type_id) : NONE_LEAD_TYPE;
      const b = ensureLeadTypeBucket(key);
      b.lead_count += 1;
      b.lead_value += numEst(l.estimated_value);
    }
    for (const l of dealRows) {
      const key = l.lead_type_id ? String(l.lead_type_id) : NONE_LEAD_TYPE;
      const b = ensureLeadTypeBucket(key);
      b.deal_count += 1;
      b.deal_value += numEst(l.estimated_value);
    }
    const detailLeadTypeIds = Object.keys(leadTypeDetailMap).filter((k) => k !== NONE_LEAD_TYPE);
    let detailLeadTypeById = {};
    if (detailLeadTypeIds.length) {
      const { data: ltRows } = await supabase
        .from('crm_lead_types')
        .select('id, name, applies_to, color, order_index')
        .in('id', detailLeadTypeIds);
      detailLeadTypeById = Object.fromEntries((ltRows || []).map((t) => [String(t.id), t]));
    }
    const by_lead_type = Object.entries(leadTypeDetailMap)
      .map(([key, m]) => {
        const lt = detailLeadTypeById[key];
        return {
          lead_type_id: key === NONE_LEAD_TYPE ? null : key,
          lead_type_name: key === NONE_LEAD_TYPE ? 'Chưa gán phân loại' : (lt?.name || key),
          applies_to: lt?.applies_to || null,
          lead_type_color: lt?.color || null,
          order_index: lt?.order_index ?? 999,
          lead_count: m.lead_count,
          deal_count: m.deal_count,
          lead_value: m.lead_value,
          deal_value: m.deal_value,
          pipeline_value: m.lead_value + m.deal_value,
        };
      })
      .sort((a, b) => (a.order_index ?? 999) - (b.order_index ?? 999)
        || (b.pipeline_value || 0) - (a.pipeline_value || 0));

    const { data: uRow } = await supabase
      .from('users')
      .select('id, full_name, email, avatar, department:departments!users_department_id_fkey(name)')
      .eq('id', targetId)
      .maybeSingle();

    return {
      user_id: targetId,
      full_name: uRow?.full_name || null,
      email: uRow?.email || null,
      avatar: uRow?.avatar || null,
      department_name: uRow?.department?.name || null,
      df,
      dt,
      effectiveCompanyId,
      pipelines,
      summary,
      timeline,
      stage_breakdown,
      by_lead_type,
      first_stage_sla,
      typeView,
    };
  } catch (e) {
    console.error('computeStaffPipelineDetailPayload:', e);
    if (!res.headersSent) res.status(500).json({ error: e.message || 'Lỗi' });
    return null;
  }
}


/** GET /crm/reports/staff-lead-deal/:userId/pipelines — chi tiết theo từng pipeline (giá trị ước tính) */

const DEAL_REPORT_BUCKET_VALUES = new Set(['pre_contract', 'implementation', 'completed', 'lost']);

/** GET /crm/settings/deal-stage-report-buckets — cột Deal → nhóm BC Lead/Deal theo NV */

/** PUT /crm/settings/deal-stage-report-buckets — cập nhật nhóm báo cáo cho từng cột Deal */


async function resolveCrmLedgerNetByLeadIdsPayload(req, leadIds, opts = {}) {
  if (!leadIds.length) {
    return { ledger_net_by_lead: {}, kpi_ledger_period_start: defaultKpiLedgerMonthStartYmd() };
  }
  const rawLedgerPs = opts.ledger_period_start && String(opts.ledger_period_start).trim();
  const ledgerPeriodStart = (rawLedgerPs && /^\d{4}-\d{2}-\d{2}$/.test(rawLedgerPs.slice(0, 10)))
    ? rawLedgerPs.slice(0, 10)
    : defaultKpiLedgerMonthStartYmd();
  const queryAssigneeUuid = uuidQueryOrNull(opts.assigned_to);
  const type = opts.type === 'deal' ? 'deal' : 'lead';
  const selfAssignee =
    type === 'deal' && req.user?.userId && !userSeesAllCrmDealsForScope(req.user)
      ? req.user.userId
      : type === 'lead' && req.user?.userId && !userSeesAllCrmLeadsForScope(req.user)
        ? req.user.userId
        : null;
  const canUseAssigneeQuery =
    type === 'deal' ? userSeesAllCrmDealsForScope(req.user) : userSeesAllCrmLeadsForScope(req.user);
  const ledgerUserId = selfAssignee || (canUseAssigneeQuery && queryAssigneeUuid ? queryAssigneeUuid : null);
  const ledgerNetByLead = await sumCrmKpiLedgerNetByLeadIds(leadIds, ledgerPeriodStart, 'monthly', {
    userId: ledgerUserId || null,
  });
  return {
    ledger_net_by_lead: ledgerNetByLead,
    kpi_ledger_period_start: ledgerPeriodStart,
  };
}

/** GET /crm/ledger-net-by-leads — điểm KPI tháng theo danh sách lead, dùng sau khi tải Kanban. */

/** POST /crm/ledger-net-by-leads — batch lead_ids trong body (tránh URL quá dài). */

/** Doanh thu ký HĐ (ước tính) theo tháng — lọc theo `entered_at` khi deal vào giai đoạn canonical `contract_signed` (khác Kanban lọc `created_at`). */

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINES — Ống bán hàng theo Công ty
// ═══════════════════════════════════════════════════════════════════════════





// Copy pipeline (clone stages) — admin only

/** Dedupe + sort cột pipeline theo order_index (stepper/Kanban). */
function normalizePipelineStagesList(rows) {
  const seen = new Set();
  const list = [];
  for (const s of rows || []) {
    const id = String(s?.id || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    list.push(s);
  }
  list.sort((a, b) => {
    const ai = Number(a?.order_index);
    const bi = Number(b?.order_index);
    const oa = Number.isFinite(ai) ? ai : 99999;
    const ob = Number.isFinite(bi) ? bi : 99999;
    if (oa !== ob) return oa - ob;
    return String(a?.name || '').localeCompare(String(b?.name || ''), 'vi');
  });
  return list;
}

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE STAGES (CRUD)
// ═══════════════════════════════════════════════════════════════════════════



/**
 * Liệt kê các cột Production Pipeline đang map về cột CRM này (qua crm_target_stage_id).
 * Phục vụ UI «Gán nhanh cột SX» trong CRM Settings.
 */

/**
 * Bulk-gán nhiều cột production_pipeline_stages vào cột CRM này (set crm_target_stage_id).
 * Body: { production_pipeline_stage_ids: string[], replace_existing?: boolean }
 *  - replace_existing=true: cột nào trước đây gán về stage này nhưng KHÔNG có trong danh sách mới
 *    sẽ được đặt lại crm_target_stage_id = null (bỏ gán).
 */


// ═══════════════════════════════════════════════════════════════════════════
// LEAD/DEAL TYPES — Phân loại theo Công ty
// ═══════════════════════════════════════════════════════════════════════════



// ─── Người giới thiệu (theo công ty) ─────────────────────────────────────────



// Reorder pipeline stages

// ═══ ZALO OA — Gửi tin qua SĐT (cấu hình + test) ═══



// ═══ Zalo OA — Xem trước + gửi thủ công khi deal ở cột «Hoàn thành» ═══

/** Điền template_data theo object mẫu (key) + dữ liệu deal — dùng trước khi gửi Zalo thủ công */


// ═══════════════════════════════════════════════════════════════════════════
// EMPLOYEES BY COMPANY — Lọc nhân viên theo công ty của user đăng nhập
// Chỉ hiển thị nhân viên thuộc phòng ban kinh doanh (sales) của công ty đó
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// SOURCES — bao gồm nguồn thông thường + FB pages gộp
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// SOURCE CATEGORIES — Phân loại nguồn (chung / theo công ty)
// ═══════════════════════════════════════════════════════════════════════════




// ═══════════════════════════════════════════════════════════════════════════
// SOURCES — Tạo / sửa (admin)
// ═══════════════════════════════════════════════════════════════════════════


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

  for (const delId of idsToDelete) {
    if (String(delId) === String(keepId)) continue;

    if (includeSecondaryData) {
      // Chỉ chuyển nhiệm vụ CRM thường; KHÔNG chuyển nhiệm vụ SX (sx_*) khi gộp deal.
      // Vì sx_* thuộc pipeline xưởng/đơn, không nên "dính" sang deal khác sau khi merge.
      const { data: tasks } = await supabase
        .from('crm_tasks')
        .select('id')
        .eq('lead_id', delId)
        .not('stage_slug', 'like', 'sx_%');
      if (tasks?.length) {
        await supabase
          .from('crm_tasks')
          .update({ lead_id: keepId })
          .eq('lead_id', delId)
          .not('stage_slug', 'like', 'sx_%');
        movedTasks += tasks.length;
      }

      const { data: docs } = await supabase.from('lead_documents').select('id').eq('lead_id', delId);
      if (docs?.length) {
        await supabase.from('lead_documents').update({ lead_id: keepId }).eq('lead_id', delId);
        movedDocs += docs.length;
      }

      const { data: acts } = await supabase.from('crm_activities').select('id').eq('lead_id', delId);
      if (acts?.length) {
        await supabase.from('crm_activities').update({ lead_id: keepId }).eq('lead_id', delId);
        movedActivities += acts.length;
      }

      const { data: quotes } = await supabase.from('quotations').select('id').eq('lead_id', delId);
      if (quotes?.length) {
        await supabase.from('quotations').update({ lead_id: keepId }).eq('lead_id', delId);
        movedQuotations += quotes.length;
      }

      await supabase.from('orders').update({ lead_id: keepId }).eq('lead_id', delId);
      await supabase.from('invoices').update({ lead_id: keepId }).eq('lead_id', delId);

      await supabase.from('facebook_contacts').update({ lead_id: keepId }).eq('lead_id', delId);
      await supabase.from('facebook_messages').update({ lead_id: keepId }).eq('lead_id', delId);

      await supabase.from('lead_members').delete().eq('lead_id', delId);
      await supabase.from('lead_messages').delete().eq('lead_id', delId);

      await supabase.from('crm_pipeline_history').update({ lead_id: keepId }).eq('lead_id', delId);
    } else {
      await supabase.from('lead_members').delete().eq('lead_id', delId);
      await supabase.from('lead_messages').delete().eq('lead_id', delId);
      const { error: histErr } = await supabase.from('crm_pipeline_history').update({ lead_id: keepId }).eq('lead_id', delId);
      if (histErr) console.warn('[merge] pipeline_history (keep-only):', histErr.message);
    }

    const { error: delErr } = await supabase.from('crm_leads').delete().eq('id', delId);
    if (delErr) {
      console.error('Delete lead error:', delId, delErr);
      throw new Error(`Không xóa được lead/deal ${delId}: ${delErr.message || delErr.details || JSON.stringify(delErr)}`);
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
const SCAN_DUP_LITE_SELECT = 'id, customer_id, assigned_to, source_id, updated_at, created_at, type';

async function fetchCrmLeadsLiteForDuplicateScan({ uid, seeAllLeads, seeAllDeals }) {
  const liteRows = [];
  const PAGE = 1000;
    if (seeAllLeads && seeAllDeals) {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase.from('crm_leads')
        .select(SCAN_DUP_LITE_SELECT)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const chunk = data || [];
      liteRows.push(...chunk);
      if (chunk.length < PAGE) break;
    }
    return liteRows;
  }
  const fetchBatched = async (q) => {
    const rows = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await q.range(from, from + PAGE - 1);
      if (error) throw error;
      const chunk = data || [];
      rows.push(...chunk);
      if (chunk.length < PAGE) break;
    }
    return rows;
  };
  let leadQ = supabase.from('crm_leads').select(SCAN_DUP_LITE_SELECT).eq('type', 'lead').order('created_at', { ascending: false });
      if (!seeAllLeads) leadQ = leadQ.or(`assigned_to.eq.${uid},lead_owner_id.eq.${uid}`);
  let dealQ = supabase.from('crm_leads').select(SCAN_DUP_LITE_SELECT).eq('type', 'deal').order('created_at', { ascending: false });
      if (!seeAllDeals) dealQ = dealQ.eq('assigned_to', uid);
  const [leadRows, dealRows] = await Promise.all([fetchBatched(leadQ), fetchBatched(dealQ)]);
  return [...leadRows, ...dealRows];
}

function duplicateLeadIdsFromLiteRows(liteRows) {
  const byCombo = {};
  for (const l of liteRows || []) {
    if (!l.customer_id || !l.assigned_to || !l.source_id) continue;
    const key = `${l.customer_id}_${l.assigned_to}_${l.source_id}`;
    if (!byCombo[key]) byCombo[key] = [];
    byCombo[key].push(l.id);
  }
  const ids = [];
  const seen = new Set();
  for (const key of Object.keys(byCombo)) {
    if (byCombo[key].length <= 1) continue;
    for (const id of byCombo[key]) {
      const sid = String(id);
      if (!seen.has(sid)) {
        seen.add(sid);
        ids.push(sid);
      }
    }
  }
  return ids;
}

async function hydrateScanDuplicateLeads(leadIds, scanSelect) {
  if (!leadIds.length) return [];
  const leads = [];
  for (let i = 0; i < leadIds.length; i += 200) {
    const chunk = leadIds.slice(i, i + 200);
    const { data, error } = await supabase.from('crm_leads').select(scanSelect).in('id', chunk);
    if (error) throw error;
    leads.push(...(data || []));
  }
  return leads.sort(
        (a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at),
      );
    }

function buildScanDuplicateGroups(leads, leadFbMap) {
    const byCombo = {};
  for (const l of leads || []) {
    if (!l.customer_id || !l.assigned_to || !l.source_id) continue;
      const key = `${l.customer_id}_${l.assigned_to}_${l.source_id}`;
      if (!byCombo[key]) byCombo[key] = [];
      byCombo[key].push({ ...l, fb_contacts: leadFbMap[l.id] || [] });
  }
    const groups = [];
  for (const key of Object.keys(byCombo)) {
    if (byCombo[key].length <= 1) continue;
    groups.push({
          reason: 'combo_match',
      key,
          customer: byCombo[key][0].customer,
          assignee: byCombo[key][0].assignee,
          source: byCombo[key][0].source,
      leads: byCombo[key].sort(
        (a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at),
      ),
    });
  }
  const totalDuplicates = groups.reduce((s, g) => s + g.leads.length - 1, 0);
  return { groups, total_groups: groups.length, total_duplicates: totalDuplicates };
}


// ═══ GỘP LEAD — Merge duplicates: keep one, delete others (không gộp bản ghi khách) ═══

// ═══ GỘP THỦ CÔNG (Kanban): gộp khách + tài liệu + chọn tiêu đề ═══
// include_secondary_data: true (mặc định) = gộp KH + chuyển tài liệu/nhiệm vụ/báo giá/… sang bản giữ
// false = chỉ giữ dữ liệu của bản được chọn; bản xóa kèm tài liệu & liên kết (CASCADE theo DB)

// ═══ GÁN PHỤ TRÁCH HÀNG LOẠT (cùng checkbox chọn Kanban với gộp thủ công) ═══
// Một người phụ trách: assigned_to và lead_owner_id luôn cùng giá trị.

// Dọn dẹp lead trùng theo customer


// ═══════════════════════════════════════════════════════════════════════════
// LEADS (CRUD + Pipeline)
// ═══════════════════════════════════════════════════════════════════════════

/** linked_project embed added in migration 76 — included here, stripped by runtime fallback if migration not applied */
const CRM_LEAD_LIST_SELECT_EXTRA = ', linked_project:projects!crm_leads_project_id_fkey(id, code, name, order_date, delivery_date, production_deadline, production_note)';
const CRM_LEAD_REGION_EMBED = ', crm_region:company_regions!crm_leads_region_id_fkey(id, name, code)';
const CRM_LEAD_LIST_SELECT_BASE =
  `*, customer:customers(id, full_name, phone, email, company), stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, color, icon, is_won, is_lost, pipeline_type, sync_role, order_index), source:crm_sources(id, name, icon), lead_type:crm_lead_types(id, name, color), assignee:users!crm_leads_assigned_to_fkey(id, full_name), lead_owner:users!crm_leads_lead_owner_id_fkey(id, full_name), company:companies!crm_leads_company_id_fkey(id, name, short_name)${CRM_LEAD_REGION_EMBED}, sx_pipeline_stage:production_pipeline_stages(id, name, color, icon, bucket_slug, company:companies(id, name, short_name)), vc_pipeline_stage:logistics_pipeline_stages(id, name, color, icon, bucket_slug)`;
/** Select tối ưu cho Kanban web/mobile — đủ field thẻ CRM, nhẹ hơn getCrmLeadListSelect ~60%. */
const CRM_LEAD_KANBAN_LITE_SELECT =
  'id, code, title, type, phone, customer_id, estimated_value, probability, created_at, updated_at, assigned_to, lead_owner_id, stage_id, source_id, region_id, company_id, lead_type_id, project_id, stage_entered_at, kanban_deadline_at, kanban_deadline_reason, next_follow_up, expected_close_date, lost_reason, ' +
  'customer:customers(id, full_name, phone, company), ' +
  'stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, color, icon, is_won, is_lost, counts_as_completed_revenue, sla_days, sync_role, pipeline_type, order_index, default_probability), ' +
  'source:crm_sources(id, name, icon), ' +
  'lead_type:crm_lead_types(id, name, color), ' +
  'assignee:users!crm_leads_assigned_to_fkey(id, full_name), ' +
  'lead_owner:users!crm_leads_lead_owner_id_fkey(id, full_name), ' +
  'company:companies!crm_leads_company_id_fkey(id, name, short_name)' +
  CRM_LEAD_REGION_EMBED +
  ', sx_pipeline_stage:production_pipeline_stages(id, name, color, icon, bucket_slug, company:companies(id, name, short_name)), vc_pipeline_stage:logistics_pipeline_stages(id, name, color, icon, bucket_slug)' +
  CRM_LEAD_LIST_SELECT_EXTRA;

function resolveCrmLeadsKanbanLite(reqQuery, opts = {}) {
  if (opts.lite === false) return false;
  if (opts.lite === true) return true;
  if (reqQuery?.full === '1' || reqQuery?.full === 'true') return false;
  if (reqQuery?.lite === '1' || reqQuery?.lite === 'true') return true;
  if (reqQuery?.kanban === '1' || reqQuery?.kanban === 'true') return true;
  return false;
}

function resolveCrmLeadsSkipDeadline(reqQuery, opts = {}) {
  if (opts.skipDeadline === true) return true;
  if (opts.skipDeadline === false) return false;
  return reqQuery?.skip_deadline === '1' || reqQuery?.skip_deadline === 'true'
    || reqQuery?.defer_deadline === '1' || reqQuery?.defer_deadline === 'true';
}

/** Parse danh sách UUID từ query `lead_ids` (CSV) — tối đa maxIds. */
function parseLeadIdsCsvQuery(raw, maxIds = 500) {
  if (raw == null || raw === '') return [];
  const parts = String(raw).split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  return parseLeadIdUuidList(parts, maxIds);
}

/** Parse `lead_ids` từ body POST (mảng hoặc CSV) — tối đa maxIds. */
function parseLeadIdsFromBody(body, maxIds = 500) {
  const raw = body?.lead_ids;
  if (raw == null) return [];
  const parts = Array.isArray(raw)
    ? raw.map((x) => String(x).trim()).filter(Boolean)
    : String(raw).split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  return parseLeadIdUuidList(parts, maxIds);
}

function parseLeadIdUuidList(parts, maxIds = 500) {
  const out = [];
  for (const p of parts) {
    if (!/^[0-9a-f-]{36}$/i.test(p)) continue;
    out.push(p);
    if (out.length >= maxIds) break;
  }
  return out;
}
let CRM_LEAD_LIST_SELECT = CRM_LEAD_LIST_SELECT_BASE + CRM_LEAD_LIST_SELECT_EXTRA;
let _crmLeadSelectMigrationChecked = false;
let _vcPipelineStageAvailable = true; // migration 81
let _crmLeadTypeColorAvailable = true; // migration 339

function stripCrmLeadTypeColorFromSelect(selectStr) {
  return String(selectStr || '').replace(
    'lead_type:crm_lead_types(id, name, color)',
    'lead_type:crm_lead_types(id, name)',
  );
}

function isCrmLeadTypeColorMissingError(err) {
  const m = String(err?.message || '');
  return /crm_lead_types.*\bcolor\b|\blead_type\b.*\bcolor\b/i.test(m);
}

async function getCrmLeadListSelect() {
  if (_crmLeadSelectMigrationChecked) {
    let sel = CRM_LEAD_LIST_SELECT;
    if (!_vcPipelineStageAvailable) {
      sel = sel.replace(', vc_pipeline_stage:logistics_pipeline_stages(id, name, color, icon, bucket_slug)', '');
    }
    if (!_crmLeadTypeColorAvailable) sel = stripCrmLeadTypeColorFromSelect(sel);
    return sel;
  }
  const { error } = await supabase.from('projects').select('production_deadline').limit(0);
  if (error && error.message?.includes('production_deadline')) {
    CRM_LEAD_LIST_SELECT = CRM_LEAD_LIST_SELECT_BASE;
    console.warn('[crm] Migration 76 not applied — linked_project.production_deadline unavailable');
  }
  // Kiểm tra migration 81 (vc_pipeline_stage_id + FK relationship)
  // Reset về true trước khi check — để re-check sau khi migration đã chạy
  _vcPipelineStageAvailable = true;
  const { error: vcColErr } = await supabase.from('crm_leads').select('vc_pipeline_stage_id').limit(0);
  if (vcColErr && vcColErr.message?.includes('vc_pipeline_stage_id')) {
    _vcPipelineStageAvailable = false;
    console.warn('[crm] Migration 81 not applied — vc_pipeline_stage_id column missing');
  } else if (!vcColErr) {
    // Cột tồn tại, kiểm tra tiếp FK relationship bằng thử join
    const { error: vcRelErr } = await supabase
      .from('crm_leads')
      .select('vc_pipeline_stage:logistics_pipeline_stages(id)')
      .limit(0);
    if (vcRelErr && (vcRelErr.message?.includes('relationship') || vcRelErr.message?.includes('logistics_pipeline_stages'))) {
      _vcPipelineStageAvailable = false;
      console.warn('[crm] Migration 82 not applied — vc_pipeline_stage FK relationship missing. Chạy migration 88 để thêm FK.');
    } else {
      console.log('[crm] vc_pipeline_stage join available ✓');
    }
  }
  const { error: ltColorErr } = await supabase.from('crm_lead_types').select('color').limit(0);
  if (ltColorErr && ltColorErr.message?.includes('color')) {
    _crmLeadTypeColorAvailable = false;
    console.warn('[crm] Migration 339 not applied — crm_lead_types.color unavailable');
  }
  _crmLeadSelectMigrationChecked = true;
  return getCrmLeadListSelect(); // re-call with flag set
}

/** Lead/deal tạo trong N ngày và user chưa mở chi tiết → badge "Mới" */
const CRM_NEW_LEAD_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** JSONB đôi khi trả về object hoặc chuỗi JSON — chuẩn hóa thành object phẳng. */
function parseLeadSeenByRaw(raw) {
  if (raw == null || raw === '') return {};
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return p && typeof p === 'object' && !Array.isArray(p) ? p : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw };
  return {};
}

/** Khóa user_id trong JSONB luôn lowercase để tránh lệch UUID (JWT vs DB). */
function normalizeLeadSeenByKeys(raw) {
  const src = parseLeadSeenByRaw(raw);
  const out = {};
  for (const [k, v] of Object.entries(src)) {
    const kk = String(k).trim().toLowerCase();
    if (kk) out[kk] = v;
  }
  return out;
}

function userHasSeenLeadInSeenBy(rawSeen, userId) {
  const uid = String(userId || '').trim().toLowerCase();
  if (!uid) return false;
  const norm = normalizeLeadSeenByKeys(rawSeen);
  return !!norm[uid];
}

function computeIsNewLeadForUser(lead, userId) {
  if (!userId || !lead?.created_at) return false;
  if (userHasSeenLeadInSeenBy(lead.lead_seen_by, userId)) return false;
  const age = Date.now() - new Date(lead.created_at).getTime();
  if (age < 0 || age > CRM_NEW_LEAD_MAX_AGE_MS) return false;
  return true;
}

/** Trả về object list: bỏ lead_seen_by khỏi JSON, thêm is_new_for_current_user */
function attachLeadNewFlagForList(rows, userId) {
  return mapLeadDisplayPhone(rows).map((l) => {
    const is_new_for_current_user = computeIsNewLeadForUser(l, userId);
    const { lead_seen_by, ...rest } = l;
    return { ...rest, is_new_for_current_user };
  });
}

function mapLeadDisplayPhone(rows) {
  return (rows || []).map((l) => ({
    ...l,
    display_phone:
      l.customer?.phone && String(l.customer.phone).trim() !== ''
        ? l.customer.phone
        : l.phone && String(l.phone).trim() !== ''
          ? l.phone
          : null,
  }));
}

/** Lead gắn Zalo inbox — vẫn hiện Kanban khi lọc «Có SĐT» dù chưa quét được SĐT (riêng Zalo, không áp dụng FB). */
async function loadZaloLinkedLeadIdSet(leadIds) {
  const ids = [...new Set((leadIds || []).map((id) => String(id)).filter(Boolean))];
  if (!ids.length) return new Set();
  const out = new Set();
  for (let b = 0; b < ids.length; b += 500) {
    const batch = ids.slice(b, b + 500);
    const { data: zaloRows } = await supabase.from('zalo_contacts').select('lead_id').in('lead_id', batch);
    (zaloRows || []).forEach((r) => { if (r.lead_id) out.add(String(r.lead_id)); });
  }
  return out;
}

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

function uuidQueryOrNull(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  return s || null;
}

/** stage_id (đơn) hoặc stage_ids (UUID cách nhau bởi dấu phẩy) từ query string. */
function parseStageIdsFromQuery(reqQuery) {
  const raw = reqQuery?.stage_ids;
  if (raw != null && raw !== '') {
    const parts = String(raw).split(',').map((s) => s.trim()).filter(Boolean);
    const uuids = parts.filter((s) => isUuidString(s));
    if (uuids.length) return uuids;
  }
  const single = uuidQueryOrNull(reqQuery?.stage_id);
  return single && isUuidString(single) ? [single] : [];
}

function applyStageIdFilterToQuery(q, stageIds) {
  if (!stageIds?.length) return q;
  if (stageIds.length === 1) return q.eq('stage_id', stageIds[0]);
  return q.in('stage_id', stageIds);
}

/** Chỉ chấp nhận YYYY-MM-DD — tránh lỗi cast timestamptz trong RPC Postgres */
function sanitizeIsoDateQueryParam(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  console.warn('[crm/leads] Bỏ qua date_from/date_to không đúng ISO (YYYY-MM-DD):', s);
  return null;
}

/**
 * Chuẩn hoá kết quả rpc('crm_leads_page_ids') — tránh 500 khi ids không phải mảng hoặc payload lạ.
 */
function parseCrmLeadsPageRpc(raw) {
  let v = raw;
  if (Array.isArray(raw) && raw.length === 1 && raw[0] && typeof raw[0] === 'object' && Array.isArray(raw[0].ids)) {
    v = raw[0];
  }
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== 'object') return null;
  if (v.total === undefined || v.total === null) return null;
  const total = Number(v.total);
  if (Number.isNaN(total)) return null;
  let ids = v.ids;
  if (!Array.isArray(ids)) {
    if (ids && typeof ids === 'object') ids = Object.values(ids);
    else ids = [];
  }
  ids = ids.map((id) => String(id).trim()).filter(Boolean);
  const seenRpc = new Set();
  ids = ids.filter((id) => {
    if (seenRpc.has(id)) return false;
    seenRpc.add(id);
    return true;
  });
  return { total, ids };
}

/**
 * Gắn `crm_next_open_task_deadline`: ngày hẹn (`deadline`) của **một** NV CRM đang mở
 * (pending/in_progress) **mới nhất** theo `updated_at` → `created_at` → `id`.
 * Chỉ lấy hạn của NV đó (kể cả null); Kanban / view Deadline dùng khi có hẹn, không thì fallback SLA / expected_close_date.
 */
async function attachCrmNextOpenTaskDeadline(rows) {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  if (list.length === 0) return [];
  /** lead_id → { updatedMs, createdMs, idNum, deadlineTs | null } */
  const byLeadNewest = new Map();
  // Giảm từ 400 xuống 200: response Supabase nhỏ hơn → tránh undici reset TLS giữa chừng trên local Windows.
  const chunkSize = 200;
  const idChunks = [];
  for (let i = 0; i < list.length; i += chunkSize) {
    const chunk = list.slice(i, i + chunkSize).map((r) => String(r.id)).filter(Boolean);
    if (chunk.length) idChunks.push(chunk);
  }
  const taskRows = (
    await Promise.all(
      idChunks.map(async (chunk) => {
    const { data, error } = await supabase
      .from('crm_tasks')
      .select('id, lead_id, deadline, created_at, updated_at')
      .in('lead_id', chunk)
      .in('status', ['pending', 'in_progress']);
    if (error) {
      console.warn('[crm] attachCrmNextOpenTaskDeadline:', error.message);
          return [];
        }
        return data || [];
      }),
    )
  ).flat();
  for (const t of taskRows) {
      const lid = String(t.lead_id);
      const updatedMs = new Date(t.updated_at || t.created_at || 0).getTime();
      const createdMs = new Date(t.created_at || 0).getTime();
      const idNum = Number(t.id);
      const safeId = Number.isFinite(idNum) ? idNum : 0;
      const prev = byLeadNewest.get(lid);
      const newer =
        !prev ||
        updatedMs > prev.updatedMs ||
        (updatedMs === prev.updatedMs && createdMs > prev.createdMs) ||
        (updatedMs === prev.updatedMs && createdMs === prev.createdMs && safeId > prev.idNum);
      if (!newer) continue;
      let deadlineTs = null;
      if (t.deadline != null && t.deadline !== '') {
        const d = new Date(t.deadline).getTime();
        if (!Number.isNaN(d)) deadlineTs = d;
      }
      byLeadNewest.set(lid, { updatedMs, createdMs, idNum: safeId, deadlineTs });
  }
  return list.map((row) => {
    const newest = byLeadNewest.get(String(row.id));
    const ts = newest?.deadlineTs;
    return {
      ...row,
      crm_next_open_task_deadline: ts != null ? new Date(ts).toISOString() : null,
    };
  });
}

async function fetchCrmLeadsByIdsOrdered(ids, opts = {}) {
  const { skipEnrich = false, lite = false } = opts;
  const raw = Array.isArray(ids) ? ids : [];
  if (raw.length === 0) return [];
  // RPC có thể trả trùng id trong một page → hydrate ra hai row giống id khác stage snapshot → Kanban hai cột.
  const seen = new Set();
  const list = [];
  for (const id of raw) {
    const sid = String(id == null ? '' : id).trim();
    if (!sid || seen.has(sid)) continue;
    seen.add(sid);
    list.push(sid);
  }
  if (list.length === 0) return [];
  const selectStr = lite ? CRM_LEAD_KANBAN_LITE_SELECT : await getCrmLeadListSelect();
  // Giảm từ 300 xuống 150: payload mỗi chunk nhẹ hơn (~vài MB → vài trăm KB),
  // hạn chế "TypeError: fetch failed" khi local Windows gặp AV/VPN/keep-alive thối.
  const chunkSize = 150;
  const byId = new Map();
  for (let i = 0; i < list.length; i += chunkSize) {
    const chunk = list.slice(i, i + chunkSize);
    let { data, error } = await supabase.from('crm_leads').select(selectStr).in('id', chunk);
    if (error && /region|company_regions|crm_leads_region_id/i.test(String(error.message || ''))) {
      const stripped = selectStr.replace(CRM_LEAD_REGION_EMBED, '');
      const r2 = await supabase.from('crm_leads').select(stripped).in('id', chunk);
      data = r2.data;
      error = r2.error;
    }
    if (error && isCrmLeadTypeColorMissingError(error)) {
      _crmLeadTypeColorAvailable = false;
      _crmLeadSelectMigrationChecked = true;
      const stripped = stripCrmLeadTypeColorFromSelect(selectStr);
      console.warn('[crm] Auto-strip crm_lead_types.color embed (migration 339)');
      const r2 = await supabase.from('crm_leads').select(stripped).in('id', chunk);
      data = r2.data;
      error = r2.error;
    }
    if (error) throw error;
    (data || []).forEach((row) => {
      if (row?.id != null) byId.set(String(row.id), row);
    });
  }
  const rows = list.map((id) => byId.get(String(id))).filter(Boolean);
  if (skipEnrich) return rows;
  try {
    const { enrichCrmLeadsWithProductionStaff } = require('../../../helpers/productionWorkshopTypeStaff');
    return await enrichCrmLeadsWithProductionStaff(rows);
  } catch (e) {
    console.warn('[crm] enrich production_staff:', e.message);
    return rows;
  }
}

async function hydrateCrmLeadsByIdsWithStaff(raw) {
  return fetchCrmLeadsByIdsOrdered(raw);
}

/** Fallback: dùng .range() — giới hạn parsedLimit dòng để tránh egress lớn. */
async function getCrmLeadsListLegacy(reqQuery, opts = {}) {
  const { assigneeStrict = false, viewerUserId = null, req: scopeReq = null } = opts;
  const stageIds = parseStageIdsFromQuery(reqQuery);
  const {
    assigned_to,
    source_id,
    search,
    limit = 100,
    offset = 0,
    type = 'lead',
    company_id,
    date_from,
    date_to,
    phone_filter,
    lead_type_id,
    referrer_name,
    customer_company,
    pipeline_id,
    next_follow_up_from,
    next_follow_up_to,
    next_follow_up_empty,
  } = reqQuery;
  const referrerNameTrim = String(referrer_name || '').trim();
  const customerCompanyTrim = String(customer_company || '').trim();
  const searchTrim = String(search || '').trim();
  const parsedLimit = Math.min(Math.max(parseInt(limit) || 100, 1), 2000);
  const parsedOffset = Math.max(parseInt(offset) || 0, 0);
  const useLite = resolveCrmLeadsKanbanLite(reqQuery, opts);
  const skipDeadline = resolveCrmLeadsSkipDeadline(reqQuery, opts);
  // crm_leads.phone hầu như luôn NULL (SĐT thật nằm ở customers.phone qua customer_id) —
  // tìm thêm customer_id khớp SĐT/tên KH để không bị "lọc không ra lead" khi search bằng SĐT.
  let customerIdsForSearch = null;
  if (searchTrim) {
    const { data: custSearchRows, error: custSearchErr } = await supabase
      .from('customers')
      .select('id')
      .or(`phone.ilike.%${searchTrim}%,full_name.ilike.%${searchTrim}%`)
      .limit(1000);
    if (!custSearchErr) customerIdsForSearch = (custSearchRows || []).map((r) => r.id);
  }
  const buildSearchOr = () => {
    if (!searchTrim) return null;
    const parts = [`title.ilike.%${searchTrim}%`, `code.ilike.%${searchTrim}%`, `phone.ilike.%${searchTrim}%`];
    if (customerIdsForSearch && customerIdsForSearch.length) {
      parts.push(`customer_id.in.(${customerIdsForSearch.join(',')})`);
    }
    return parts.join(',');
  };
  let customerIdsForCompanyFilter = null;
  if (customerCompanyTrim && customerCompanyTrim !== '__none__') {
    const { data: custRows, error: custErr } = await supabase
      .from('customers')
      .select('id')
      .eq('company', customerCompanyTrim);
    if (custErr) throw custErr;
    customerIdsForCompanyFilter = (custRows || []).map((r) => r.id);
    if (!customerIdsForCompanyFilter.length) {
      return {
        data: [],
        total: 0,
        offset: parsedOffset,
        limit: parsedLimit,
        hasMore: false,
        nextOffset: parsedOffset,
      };
    }
  }

  const nfFrom = sanitizeIsoDateQueryParam(next_follow_up_from);
  const nfTo = sanitizeIsoDateQueryParam(next_follow_up_to);
  const nfEmpty =
    next_follow_up_empty === 'true' || next_follow_up_empty === '1' || next_follow_up_empty === true;
  const pipeId = uuidQueryOrNull(pipeline_id);
  const orderByFollowUp = !!(nfFrom || nfTo || nfEmpty);

  const selectStr = useLite ? CRM_LEAD_KANBAN_LITE_SELECT : await getCrmLeadListSelect();
  const applyPipelineFollowUpFilters = (q) => {
    let x = q;
    if (pipeId) x = x.eq('pipeline_id', pipeId);
    if (nfEmpty) x = x.is('next_follow_up', null);
    else {
      if (nfFrom) x = x.gte('next_follow_up', nfFrom);
      if (nfTo) x = x.lte('next_follow_up', nfTo);
    }
    return x;
  };

  const buildBaseQuery = () => {
    let q = supabase
      .from('crm_leads')
      .select(selectStr)
      .eq('type', type)
      .is('parent_lead_id', null)
      .order(orderByFollowUp ? 'next_follow_up' : 'created_at', { ascending: orderByFollowUp });
    q = applyStageIdFilterToQuery(q, stageIds);
    if (assigned_to) {
      if (assigneeStrict) q = q.eq('assigned_to', assigned_to);
      else q = q.or(`assigned_to.eq.${assigned_to},lead_owner_id.eq.${assigned_to}`);
    }
    if (source_id) q = q.eq('source_id', source_id);
    if (company_id) q = q.eq('company_id', company_id);
    if (lead_type_id) q = q.eq('lead_type_id', lead_type_id);
    if (referrerNameTrim) q = q.eq('referrer_name', referrerNameTrim);
    if (customerIdsForCompanyFilter) q = q.in('customer_id', customerIdsForCompanyFilter);
    q = applyPipelineFollowUpFilters(q);
    const df = sanitizeIsoDateQueryParam(date_from);
    const dt = sanitizeIsoDateQueryParam(date_to);
    if (df) q = q.gte('created_at', df);
    if (dt) q = q.lte('created_at', `${dt}T23:59:59.999Z`);
    const searchOr = buildSearchOr();
    if (searchOr) q = q.or(searchOr);
    if (scopeReq) q = applyCrmLeadRegionFilterToQuery(q, scopeReq);
    return q;
  };

  // Chỉ lấy đúng parsedLimit dòng từ parsedOffset, không vòng lặp không giới hạn
  const rows = [];
  const PAGE = Math.min(1000, parsedLimit);
  let currentSelectStr = selectStr;
  for (let fetched = 0, guard = 0; fetched < parsedLimit && guard < 20; guard += 1) {
    const need = Math.min(PAGE, parsedLimit - fetched);
    const from = parsedOffset + fetched;
    let q = supabase
      .from('crm_leads')
      .select(currentSelectStr)
      .eq('type', type)
      .is('parent_lead_id', null)
      .order(orderByFollowUp ? 'next_follow_up' : 'created_at', { ascending: orderByFollowUp });
    q = applyStageIdFilterToQuery(q, stageIds);
    if (assigned_to) {
      if (assigneeStrict) q = q.eq('assigned_to', assigned_to);
      else q = q.or(`assigned_to.eq.${assigned_to},lead_owner_id.eq.${assigned_to}`);
    }
    if (source_id) q = q.eq('source_id', source_id);
    if (company_id) q = q.eq('company_id', company_id);
    if (lead_type_id) q = q.eq('lead_type_id', lead_type_id);
    if (referrerNameTrim) q = q.eq('referrer_name', referrerNameTrim);
    if (customerIdsForCompanyFilter) q = q.in('customer_id', customerIdsForCompanyFilter);
    q = applyPipelineFollowUpFilters(q);
    const df = sanitizeIsoDateQueryParam(date_from);
    const dt = sanitizeIsoDateQueryParam(date_to);
    if (df) q = q.gte('created_at', df);
    if (dt) q = q.lte('created_at', `${dt}T23:59:59.999Z`);
    const searchOrPage = buildSearchOr();
    if (searchOrPage) q = q.or(searchOrPage);
    if (scopeReq) q = applyCrmLeadRegionFilterToQuery(q, scopeReq);
    let { data, error } = await q.range(from, from + need - 1);
    if (error && isVcRelationshipError(error)) {
      // FK chưa có — strip join và retry
      _vcPipelineStageAvailable = false;
      _crmLeadSelectMigrationChecked = false;
      currentSelectStr = currentSelectStr.replace(', vc_pipeline_stage:logistics_pipeline_stages(id, name, color, icon, bucket_slug)', '');
      console.warn('[crm] Auto-strip vc_pipeline_stage join do FK chưa tồn tại trong schema cache');
      ({ data, error } = await q.select(currentSelectStr).range(from, from + need - 1));
    }
    if (error && /region|company_regions|crm_leads_region_id/i.test(String(error.message || ''))) {
      currentSelectStr = currentSelectStr.replace(CRM_LEAD_REGION_EMBED, '');
      console.warn('[crm] Auto-strip crm_region embed (migration 131 / FK)');
      ({ data, error } = await q.select(currentSelectStr).range(from, from + need - 1));
    }
    if (error && isCrmLeadTypeColorMissingError(error)) {
      _crmLeadTypeColorAvailable = false;
      _crmLeadSelectMigrationChecked = true;
      currentSelectStr = stripCrmLeadTypeColorFromSelect(currentSelectStr);
      console.warn('[crm] Auto-strip crm_lead_types.color embed (migration 339)');
      ({ data, error } = await q.select(currentSelectStr).range(from, from + need - 1));
    }
    if (error) throw error;
    const chunk = data || [];
    rows.push(...chunk);
    fetched += chunk.length;
    if (chunk.length < need) break;
  }

  let result = mapLeadDisplayPhone(rows);
  if (customerCompanyTrim === '__none__') {
    result = result.filter((l) => !String(l.customer?.company || '').trim());
  }
  if (phone_filter === 'has_phone') {
    const zaloIds = await loadZaloLinkedLeadIdSet(result.map((l) => l.id));
    result = result.filter((l) => !!l.display_phone || zaloIds.has(String(l.id)));
  } else if (phone_filter === 'no_phone') {
    result = result.filter((l) => !l.display_phone);
  }
  if (orderByFollowUp) {
    result.sort((a, b) => {
      const na = a.next_follow_up ? new Date(a.next_follow_up).getTime() : Infinity;
      const nb = b.next_follow_up ? new Date(b.next_follow_up).getTime() : Infinity;
      if (na !== nb) return na - nb;
      const ap = a.display_phone ? 1 : 0;
      const bp = b.display_phone ? 1 : 0;
      if (bp !== ap) return bp - ap;
      const da = a.created_at ? new Date(a.created_at).getTime() : 0;
      const db = b.created_at ? new Date(b.created_at).getTime() : 0;
      return db - da;
    });
  } else {
    result.sort((a, b) => {
      const ap = a.display_phone ? 1 : 0;
      const bp = b.display_phone ? 1 : 0;
      if (bp !== ap) return bp - ap;
      const da = a.created_at ? new Date(a.created_at).getTime() : 0;
      const db = b.created_at ? new Date(b.created_at).getTime() : 0;
      return db - da;
    });
  }

  const total = result.length;
  const page = result.slice(parsedOffset, parsedOffset + parsedLimit);
  if (useLite) {
    let withDeadline = page;
    if (!skipDeadline) withDeadline = await attachCrmNextOpenTaskDeadline(page);
    const withNewFlag = attachLeadNewFlagForList(withDeadline, viewerUserId);
    return {
      data: withNewFlag,
      total,
      offset: parsedOffset,
      limit: parsedLimit,
      hasMore: parsedOffset + page.length < total,
      nextOffset: parsedOffset + page.length,
    };
  }
  const pageWithDeadline = await attachCrmNextOpenTaskDeadline(page);
  const withNewFlag = attachLeadNewFlagForList(pageWithDeadline, viewerUserId);
  const withUserFlags = await attachLeadUserFlagsForList(withNewFlag, viewerUserId);
  let enrichedStaff = withUserFlags;
  try {
    const { enrichCrmLeadsWithProductionStaff } = require('../../../helpers/productionWorkshopTypeStaff');
    enrichedStaff = await enrichCrmLeadsWithProductionStaff(withUserFlags);
  } catch (e) {
    console.warn('[crm] enrich production_staff (legacy list):', e.message);
  }
  return {
    data: enrichedStaff,
    total,
    offset: parsedOffset,
    limit: parsedLimit,
    hasMore: parsedOffset + page.length < total,
    nextOffset: parsedOffset + page.length,
  };
}

// ── Endpoint nhẹ cho deal/lead picker (form báo giá, Excel import…) ──
// Trả về list ngắn gọn, đã filter theo company của user + region scope (qua JWT).
// Query: q (search), type=deal|lead (default deal), customer_id, company_id, region_id, limit (max 50).

function parseCrmStageCountsNumericMap(obj, keepNone) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const [k, val] of Object.entries(obj)) {
    if (!keepNone && k === '__none__') continue;
    const n = Number(val);
    if (!Number.isNaN(n)) out[String(k)] = n;
  }
  return out;
}

function parseCrmStageCountsRpc(raw) {
  let v = raw;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== 'object') return null;
  const total = Number(v.total);
  if (Number.isNaN(total)) return null;
  const counts = parseCrmStageCountsNumericMap(v.counts, false);
  const values = parseCrmStageCountsNumericMap(v.values, true);
  const weightedValues = parseCrmStageCountsNumericMap(v.weighted_values, true);
  return {
    total,
    counts,
    values,
    weightedValues,
  };
}

async function invokeCrmLeadsStageCountsRpc(rpcParams) {
  let { data, error } = await supabase.rpc('crm_leads_stage_counts', rpcParams);
  if (error && /crm_leads_stage_counts|does not exist|Could not find|argument/i.test(String(error.message || ''))) {
    const { p_region_ids: _r, p_pipeline_stage_ids: _p, ...noExtras } = rpcParams;
    const r2 = await supabase.rpc('crm_leads_stage_counts', noExtras);
    if (!r2.error) {
      data = r2.data;
      error = null;
    }
  }
  if (error) {
    console.warn('[crm/stage-counts] RPC error:', error.message);
    return null;
  }
  return parseCrmStageCountsRpc(data);
}

function buildCrmLeadsRpcFilterParams(mergedQuery, type, rpcAssigneeStrict, rpcRegionIds) {
  const { assigned_to, source_id, company_id, date_from, date_to, search, phone_filter } = mergedQuery;
  return {
    p_type: type,
    p_assigned_to: uuidQueryOrNull(assigned_to),
    p_source_id: uuidQueryOrNull(source_id),
    p_company_id: uuidQueryOrNull(company_id),
    p_date_from: sanitizeIsoDateQueryParam(date_from),
    p_date_to: sanitizeIsoDateQueryParam(date_to),
    p_search: search || null,
    p_phone_filter: phone_filter || null,
    p_assigned_strict: rpcAssigneeStrict,
    p_region_ids: rpcRegionIds,
  };
}

/** Dashboard `light=1`: stage counts qua RPC — không quét toàn bộ crm_leads. */
async function computeCrmDashboardLightStats(req, type, {
  effectiveCompanyId,
  region_id,
  stages,
  assigned_to_only,
  date_from,
  date_to,
  phone_filter,
}) {
  const mergedQuery = {
    type,
    company_id: effectiveCompanyId || undefined,
    region_id: region_id || undefined,
    assigned_to: assigned_to_only || undefined,
    date_from,
    date_to,
    phone_filter: phone_filter || undefined,
  };
  const dealAssigneeStrict = type === 'deal' && !!uuidQueryOrNull(assigned_to_only);
  const leadAssigneeStrict = type === 'lead' && !!uuidQueryOrNull(assigned_to_only);
  const rpcAssigneeStrict = dealAssigneeStrict || leadAssigneeStrict;
  const rpcRegionIds = resolveRpcRegionIdsForCrmList(req, mergedQuery.region_id);
  const filterParams = buildCrmLeadsRpcFilterParams(mergedQuery, type, rpcAssigneeStrict, rpcRegionIds);
  const stageIds = (stages || []).map((s) => s.id).filter(Boolean);
  const countsParsed = await invokeCrmLeadsStageCountsRpc({
    ...filterParams,
    p_pipeline_stage_ids: stageIds.length ? stageIds : null,
  });
  const counts = countsParsed?.counts || {};
  const totalItems = countsParsed?.total ?? 0;
  const wonStageIdSet = new Set((stages || []).filter((s) => s.is_won).map((s) => String(s.id)));
  let wonCount = 0;
  for (const [sid, n] of Object.entries(counts)) {
    if (wonStageIdSet.has(String(sid))) wonCount += Number(n) || 0;
  }
  const stageStats = (stages || []).map((s) => ({
    ...s,
    count: counts[String(s.id)] || 0,
    value: 0,
    weighted: 0,
  }));
  return { stageStats, totalItems, wonCount, countsParsed };
}

async function resolveCrmLeadsMergedQuery(req, res) {
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
    if (!cid) return null;
    mergedQuery = { ...mergedQuery, company_id: cid };
  }
  const { assigned_to } = mergedQuery;
  const dealAssigneeStrict = type === 'deal' && (!!uuidQueryOrNull(assigned_to) || forcedDealSelf);
  const leadAssigneeStrict = type === 'lead' && (!!uuidQueryOrNull(assigned_to) || forcedLeadSelf);
  const rpcAssigneeStrict = dealAssigneeStrict || leadAssigneeStrict;
  const rpcRegionIds = resolveRpcRegionIdsForCrmList(req, mergedQuery.region_id);
  return { type, mergedQuery, rpcAssigneeStrict, rpcRegionIds };
}

async function hydrateCrmLeadsRpcPage(parsedRpc, req, parsedOffset, parsedLimit, opts = {}) {
  const { lite = false, skipDeadline = false } = opts;
  const { total, ids } = parsedRpc;
  const hydrated = await fetchCrmLeadsByIdsOrdered(ids, { skipEnrich: lite, lite });
  const windowLen = Array.isArray(ids) ? ids.length : hydrated.length;
  if (lite) {
    let page = attachLeadNewFlagForList(hydrated, req.user?.userId);
    if (!skipDeadline) page = await attachCrmNextOpenTaskDeadline(page);
    return {
      data: page,
      total,
      offset: parsedOffset,
      limit: parsedLimit,
      hasMore: parsedOffset + windowLen < total,
      nextOffset: parsedOffset + windowLen,
    };
  }
  const rows = await attachCrmNextOpenTaskDeadline(hydrated);
  const page = attachLeadNewFlagForList(rows, req.user?.userId);
  const pageWithUserFlags = await attachLeadUserFlagsForList(page, req.user?.userId);
  return {
    data: pageWithUserFlags,
    total,
    offset: parsedOffset,
    limit: parsedLimit,
    hasMore: parsedOffset + windowLen < total,
    nextOffset: parsedOffset + windowLen,
  };
}

async function resolveKanbanStagesForCompany(type, companyId, regionId, req) {
  let effectiveCompanyId = companyId ? String(companyId).trim() : '';
  let effectivePipelineId = null;

  if (effectiveCompanyId) {
    const rid = regionId && String(regionId).trim() ? String(regionId).trim() : '';
    effectivePipelineId = rid
      ? await getPipelineIdForCompanyRegion(effectiveCompanyId, rid)
      : await getDefaultPipelineIdForCompany(effectiveCompanyId);
  } else if (req) {
    const sac = scopedAdminCompanyId(req);
    if (sac) {
      effectivePipelineId = await getDefaultPipelineIdForCompany(sac);
    } else if (!userIsAdmin(req.user?.role)) {
      const { resolveCompanyIdForUser } = require('../../../middleware/auth');
      const cid = await resolveCompanyIdForUser(req.user?.userId);
      if (cid) {
        effectiveCompanyId = cid;
        effectivePipelineId = await getDefaultPipelineIdForCompany(cid);
      }
    } else {
      let q = supabase
        .from('crm_pipeline_stages')
        .select('*')
        .eq('is_active', true)
        .eq('pipeline_type', type || 'lead')
        .order('order_index', { ascending: true });
      const { data: rows } = await q;
      return normalizePipelineStagesList(rows || []);
    }
  }

  if (!effectivePipelineId) return [];
  const data = await getStagesByPipelineId(effectivePipelineId, { type: type || null, activeOnly: true });
  return normalizePipelineStagesList(data || []);
}

function crmListUsesLegacyFilters(mergedQuery) {
  const referrerNameQuery = String(mergedQuery.referrer_name || '').trim();
  const customerCompanyQuery = String(mergedQuery.customer_company || '').trim();
  if (uuidQueryOrNull(mergedQuery.lead_type_id) || referrerNameQuery || customerCompanyQuery) return true;
  const legacyFollowUpFrom = sanitizeIsoDateQueryParam(mergedQuery.next_follow_up_from);
  const legacyFollowUpTo = sanitizeIsoDateQueryParam(mergedQuery.next_follow_up_to);
  const legacyFollowUpEmpty =
    mergedQuery.next_follow_up_empty === 'true' || mergedQuery.next_follow_up_empty === '1';
  const legacyPipelineId = uuidQueryOrNull(mergedQuery.pipeline_id);
  return !!(legacyFollowUpFrom || legacyFollowUpTo || legacyFollowUpEmpty || legacyPipelineId);
}

/** GET /crm/stage-counts — đếm tất cả cột trong 1 request (RPC GROUP BY stage_id). */

/** Gom trang lead/deal qua RPC + hydrate — dùng chung /crm/leads và bootstrap. */
async function fetchCrmLeadsPageViaRpc(req, mergedQuery, type, parsedOffset, parsedLimit, opts = {}) {
  const forcedDealSelf = type === 'deal' && req.user?.userId && !userSeesAllCrmDealsForScope(req.user);
  const forcedLeadSelf = type === 'lead' && req.user?.userId && !userSeesAllCrmLeadsForScope(req.user);
  const dealAssigneeStrict = type === 'deal' && (!!uuidQueryOrNull(mergedQuery.assigned_to) || forcedDealSelf);
  const leadAssigneeStrict = type === 'lead' && (!!uuidQueryOrNull(mergedQuery.assigned_to) || forcedLeadSelf);
  const rpcAssigneeStrict = dealAssigneeStrict || leadAssigneeStrict;
  const rpcRegionIds = resolveRpcRegionIdsForCrmList(req, mergedQuery.region_id);
  const { assigned_to, source_id, search, company_id, date_from, date_to, phone_filter, stage_id } = mergedQuery;
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
  if (!parsedRpc) return null;
  const lite = resolveCrmLeadsKanbanLite(mergedQuery, opts);
  const skipDeadline = resolveCrmLeadsSkipDeadline(mergedQuery, opts);
  return hydrateCrmLeadsRpcPage(parsedRpc, req, parsedOffset, parsedLimit, { lite, skipDeadline });
}

function buildCrmDashboardMinimalKpis(type, totalItems, wonItemCount, totalValue, wonValue, ledgerPeriodStart) {
  if (type === 'lead') {
    return {
      total_leads: totalItems,
      converted_to_deals: 0,
      conversion_rate: 0,
      total_value: totalValue,
      conversion_value: wonValue,
      overdue_tasks: 0,
      kpi_ledger_month_net_sum: 0,
      kpi_ledger_period_start: ledgerPeriodStart,
      deferred: true,
    };
  }
  return {
    total_deals: totalItems,
    won_deals: wonItemCount,
    won_rate: totalItems > 0 ? Math.round(wonItemCount / totalItems * 100) : 0,
    total_value: totalValue,
    won_value: wonValue,
    overdue_tasks: 0,
    kpi_ledger_month_net_sum: 0,
    kpi_ledger_period_start: ledgerPeriodStart,
    deferred: true,
  };
}

async function resolveCrmLeadsDeadlinesMap(leadIds) {
  if (!leadIds.length) return {};
  const stubRows = leadIds.map((id) => ({ id }));
  const enriched = await attachCrmNextOpenTaskDeadline(stubRows);
  const deadlines = {};
  for (const row of enriched) {
    deadlines[String(row.id)] = row.crm_next_open_task_deadline ?? null;
  }
  return deadlines;
}

/** GET /crm/leads-deadlines — hạn task CRM mở theo lead_ids (nền sau bootstrap). */

/** POST /crm/leads-deadlines — batch lead_ids trong body (tránh URL quá dài). */

/**
 * GET /crm/web-dashboard-bootstrap — 1 round-trip: stages + dashboard light + kanban trang đầu.
 * Bỏ deadline task + KPI nặng lúc mở trang; frontend enrich nền sau.
 */

/** GET /crm/kanban-bootstrap — stages + counts + trang đầu cột active trong 1 round-trip. */


// ── CUSTOMERS CRUD ──



// ═══ KHU VỰC CRM (company_regions) ═══

async function assertDivisionAllowedForCompany(companyId, divisionUnitId) {
  if (!companyId || !divisionUnitId) return { ok: true };
  const sid = String(divisionUnitId);
  const { data: link } = await supabase.from('company_division_units')
    .select('id')
    .eq('company_id', companyId)
    .eq('division_unit_id', divisionUnitId)
    .maybeSingle();
  if (link) return { ok: true };
  const { data: co } = await supabase.from('companies').select('division_unit_id').eq('id', companyId).maybeSingle();
  if (co?.division_unit_id && String(co.division_unit_id) === sid) return { ok: true };
  return { ok: false };
}



/**
 * POST /crm/company-regions/:id/regeocode
 *   Force re-geocode (xóa cache + reset lat/lng, gọi forwardGeocode đồng bộ).
 *   Trả về { id, lat, lng, source } hoặc { ok: false, reason }.
 */

/** POST /crm/leads/stage-history-summary — lịch sử stage theo batch (danh sách CRM) */



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
    { cust: 'customer:customers(id, full_name, phone, email, address, company, tax_code)', st: 'stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, color, icon, is_won, is_lost, pipeline_type)', sx: true },
    { cust: 'customer:customers(id, full_name, phone, email, address)', st: 'stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, color, icon, is_won, is_lost, pipeline_type)', sx: true },
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

/** Deal cũ: làm mới badge SX/VC; chưa bàn giao SX thì đưa cột CRM về Thắng nếu đang kẹt Sản xuất/VC. */

/**
 * GET /crm/leads/:id — alias nhẹ trả về 1 row crm_leads (không kèm join nặng).
 * Dùng cho UI chỉ cần đọc nhanh pipeline_id / stage_id / company_id (vd. CRMTasksTab).
 * Endpoint chi tiết đầy đủ vẫn là /leads/:id/detail.
 */




/** SĐT đã chặn — không tự tạo lead Facebook / quét SĐT (createLeadFromFacebook, lead scan). */



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
  const { canViewerSeeByCompanyAndDept } = require('../../../helpers/documentShareScope');
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

// Add document to lead + sync → crm_task_attachments (nếu có task_id)
// Task documents cho lead — nhóm theo nhiệm vụ


// BULK add documents (nhiều files 1 request)

// Delete document + sync xóa crm_task_attachment liên kết

// ═══ PROJECT DOCUMENTS (via lead_documents with project_id) ═══

// Update document visibility

// ═══════════════════════════════════════════════════════════════════════════
// CONVERT LEAD → DEAL
// ═══════════════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════════════
// REVERT DEAL → LEAD
// Trả deal lại trạng thái lead (giữ data, đổi type/stage/pipeline). Bắt buộc
// chọn lại người chịu trách nhiệm (assigned_to). Cấm khi deal đã gắn dự án SX.
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// PRE-CHECK chuyển giai đoạn: trả về nhiệm vụ chặn (nếu có) — KHÔNG thay đổi dữ liệu.
// Dùng để frontend hiện hộp nhiệm vụ chặn TRƯỚC khi hỏi deadline.
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// MOVE LEAD/DEAL TO STAGE (with validation for deal pipeline)
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// DEADLINE THẺ CRM — đặt/sửa deadline thủ công (kèm lý do) + lịch sử
// ═══════════════════════════════════════════════════════════════════════════
/** PATCH /crm/leads/:id/deadline — đặt/sửa deadline; bắt buộc lý do nếu thẻ đã có deadline. */

/** GET /crm/leads/:id/deadline-history — lịch sử đặt/sửa deadline. */

/** Hồi lại deal/lead đã đánh dấu thua — xóa lost_reason và chuyển về giai đoạn đang chạy. */

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVITIES
// ═══════════════════════════════════════════════════════════════════════════

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


// ═══════════════════════════════════════════════════════════════════════════
// CREATE PROJECT FROM DEAL (Modal)
// ═══════════════════════════════════════════════════════════════════════════




/** Sửa ghi chú (crm_activities type = note) — tác giả hoặc admin */

/** Bật/tắt chia sẻ ghi chú (crm_activities type=note) sang SX / VC / xưởng */

// ═══════════════════════════════════════════════════════════════════════════
// QUOTATIONS (Báo giá)
// ═══════════════════════════════════════════════════════════════════════════
/** Lead/Deal detail: chứng từ có lead_id HOẶC cùng customer_id (nhiều BG tạo từ KH chưa gắn lead). */
async function applyLeadOrCustomerSalesFilter(queryBuilder, leadIdVal) {
  const lid = String(leadIdVal || '');
  if (!lid || !/^[0-9a-f-]{36}$/i.test(lid)) return queryBuilder;
  const { data: leadRow } = await supabase.from('crm_leads').select('customer_id').eq('id', lid).maybeSingle();
  const cid = leadRow?.customer_id ? String(leadRow.customer_id) : '';
  if (cid && /^[0-9a-f-]{36}$/i.test(cid)) {
    return queryBuilder.or(`lead_id.eq.${lid},customer_id.eq.${cid}`);
  }
  return queryBuilder.eq('lead_id', lid);
}

/** Admin hệ thống xem/sửa mọi báo giá; admin công ty toàn công ty; NV chỉ báo giá do mình tạo. */
function userMayAccessQuotationRow(req, row) {
  if (!row) return false;
  const sac = scopedAdminCompanyId(req);
  if (sac) return String(row.company_id || '') === String(sac);
  if (userIsAdmin(req.user?.role)) return true;
  const uid = req.user?.userId;
  const cid = req.user?.company_id;
  if (!uid || !cid) return false;
  if (String(row.company_id || '') !== String(cid)) return false;
  if (isVptCompanyCommercialDocViewer(req.user)) return true;
  return String(row.created_by || '') === String(uid);
}




// ═══ SHARED: Chuẩn hoá + tính toán items cho Báo giá / Đơn hàng / Hóa đơn ═══
// Dùng CHUNG 1 logic cho cả 3 loại chứng từ để đảm bảo tính nhất quán:
// - spec_factor (hệ số quy cách) nhân vào SL*Đơn giá để ra gross amount
// - Excel fidelity: lock_amount + imported_amount → giữ NGUYÊN "Thành tiền" gốc từ Excel
// - imported_discount_amount → giữ NGUYÊN "Số tiền CK" gốc từ Excel (không suy luận lại)
function buildProcessedCommercialItems(items) {
  return (items || []).map(item => {
    const specFactor = parseFloat(item.spec_factor) || 0;
    const grossAmount = specFactor > 0
      ? specFactor * (item.quantity || 1) * (item.unit_price || 0)
      : (item.quantity || 1) * (item.unit_price || 0);
    const importedAmount = (typeof item.imported_amount === 'number' && Number.isFinite(item.imported_amount))
      ? item.imported_amount
      : null;
    const importedDiscountAmount = (typeof item.imported_discount_amount === 'number' && Number.isFinite(item.imported_discount_amount))
      ? item.imported_discount_amount
      : null;
    const isLocked = !!item.lock_amount && importedAmount !== null;
    let amount, discountAmount;
    if (isLocked) {
      amount = importedAmount;
      discountAmount = importedDiscountAmount !== null ? importedDiscountAmount : Math.max(0, grossAmount - amount);
    } else {
      discountAmount = importedDiscountAmount !== null ? importedDiscountAmount : (grossAmount * (item.discount_percent || 0) / 100);
      amount = grossAmount - discountAmount;
    }
    const vatRate = item.vat_rate || 0;
    const vatAmount = amount * vatRate / 100;
    const total = amount + vatAmount;
    return {
      product_id: item.product_id || null, product_code: item.product_code || null,
      name: item.name, description: item.description || null,
      unit: item.unit || 'bộ', quantity: item.quantity || 1, unit_price: item.unit_price || 0,
      spec_factor: specFactor || null, standard_area: item.standard_area || null,
      height: item.height || null, width: item.width || null, length: item.length || null, weight: item.weight || null,
      discount_percent: item.discount_percent || 0, discount_amount: discountAmount,
      amount, vat_rate: vatRate, vat_amount: vatAmount, tax_amount: vatAmount, total,
      dimensions: item.dimensions || null, material: item.material || null, color: item.color || null, notes: item.notes || null,
      promo_code: item.promo_code || null, is_promo: item.is_promo || false,
      group_name: item.group_name || null,
    };
  });
}


// Helper format money cho notes
function formatMoney(n) {
  if (!n) return '0 đ';
  return new Intl.NumberFormat('vi-VN').format(Math.round(n)) + ' đ';
}
// ═══ HELPER: Lấy owner + admin IDs cho notification ═══
async function getNotifyTargets(leadId) {
  const targets = { ownerIds: [], adminIds: [] };
  try {
    if (leadId) {
      const { data: lead } = await supabase.from('crm_leads')
        .select('assigned_to, lead_owner_id, customer_id')
        .eq('id', leadId).single();
      const oid = lead?.assigned_to || lead?.lead_owner_id;
      if (oid) targets.ownerIds.push(oid);
    }
    const { data: admins } = await supabase.from('users').select('id').eq('role', 'admin').eq('is_active', true);
    targets.adminIds = (admins || []).map(u => u.id);
  } catch (e) { console.warn('[NOTIFY] getNotifyTargets error:', e.message); }
  return targets;
}



// ═══ DELETE QUOTATION ═══

// ═══════════════════════════════════════════════════════════════════════════
// ORDERS (Đơn hàng)
// ═══════════════════════════════════════════════════════════════════════════




// Convert: Order → Invoice

// ═══ DELETE ORDER ═══

// ═══════════════════════════════════════════════════════════════════════════
// INVOICES (Hóa đơn)
// ═══════════════════════════════════════════════════════════════════════════


// Create invoice directly (not from order)

// Add items to invoice (batch) — legacy endpoint, giữ để tương thích ngược

// ═══ UPDATE INVOICE (giống PUT /orders/:id) ═══

// Record payment

// ═══ DELETE INVOICE ═══

// ═══ MISA meInvoice — Phát hành hóa đơn điện tử ═══

// POST /invoices/:id/misa-publish — Phát hành HĐĐT lên MISA meInvoice

// POST /invoices/:id/misa-send-email — Gửi email HĐĐT qua MISA

// GET /invoices/:id/misa-status — Kiểm tra trạng thái HĐĐT từ MISA

// Convert Lead → Project

// ═══════════════════════════════════════════════════════════════════════════
// PROJECT CRM SUMMARY — Tab CRM trong ProjectDetail
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// Project Lead Documents — fast lookup by project_id (no full leads scan)
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// CRM CUSTOMERS - Aggregated customer view
// ═══════════════════════════════════════════════════════════════════════════
function crmLeadRowVisibleToRequestUser(row, userId, role) {
  if (!userId) return true;
  const t = row?.type || 'lead';
  if (t === 'deal') {
    return userSeesAllCrmDeals(role) || String(row.assigned_to || '') === String(userId);
  }
  return (
    userSeesAllCrmLeads(role) ||
    String(row.assigned_to || '') === String(userId) ||
    String(row.lead_owner_id || '') === String(userId)
  );
}

const CUSTOMERS_OVERVIEW_NO_MATCH_ID = '00000000-0000-0000-0000-000000000000';
const CUSTOMERS_IN_CHUNK = 80;

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Supabase/PostgREST giới hạn số phần tử trong .in() — tách batch hoặc dùng .or(). */
function applyCustomerIdInFilter(q, ids) {
  const list = (ids || []).filter(Boolean);
  if (!list.length) return q.in('id', [CUSTOMERS_OVERVIEW_NO_MATCH_ID]);
  if (list.length <= CUSTOMERS_IN_CHUNK) return q.in('id', list);
  const orParts = chunkArray(list, CUSTOMERS_IN_CHUNK).map(
    (ch) => `id.in.(${ch.join(',')})`,
  );
  return q.or(orParts.join(','));
}

function applyCustomersOverviewSearch(q, search) {
  const s = String(search || '').trim();
  if (!s) return q;
  const safe = s.replace(/[%_,().]/g, ' ').trim();
  if (!safe) return q;
  return q.or(`full_name.ilike.%${safe}%,phone.ilike.%${safe}%,email.ilike.%${safe}%,company.ilike.%${safe}%`);
}

async function fetchActivityCustomerIds(effectiveCompanyId, activity) {
  if (activity === 'active') {
    let lq = supabase.from('crm_leads').select('customer_id');
    if (effectiveCompanyId) lq = lq.eq('company_id', effectiveCompanyId);
    let oq = supabase.from('orders').select('customer_id');
    if (effectiveCompanyId) oq = oq.eq('company_id', effectiveCompanyId);
    const [{ data: lr }, { data: or }] = await Promise.all([lq, oq]);
    const ids = [...new Set([...(lr || []), ...(or || [])].map((r) => r.customer_id).filter(Boolean))];
    return ids.length ? ids : [CUSTOMERS_OVERVIEW_NO_MATCH_ID];
  }
  if (activity === 'debt') {
    let iq = supabase.from('invoices').select('customer_id, total, paid_amount');
    if (effectiveCompanyId) iq = iq.eq('company_id', effectiveCompanyId);
    const { data: invs } = await iq;
    const ids = [
      ...new Set(
        (invs || [])
          .filter((i) => (i.total || 0) - (i.paid_amount || 0) > 0)
          .map((i) => i.customer_id)
          .filter(Boolean),
      ),
    ];
    return ids.length ? ids : [CUSTOMERS_OVERVIEW_NO_MATCH_ID];
  }
  return null;
}

async function fetchScopedCrmBundles(effectiveCompanyId, uid, role, customerIds = null) {
  let leadsQ = supabase
    .from('crm_leads')
    .select(
      'id, customer_id, company_id, source_id, title, estimated_value, stage_id, code, created_at, type, assigned_to, lead_owner_id, stage:crm_pipeline_stages!crm_leads_stage_id_fkey(name, icon, is_won), source:crm_sources(id, name, icon)',
    );
  if (effectiveCompanyId) leadsQ = leadsQ.eq('company_id', effectiveCompanyId);
  if (customerIds?.length) leadsQ = leadsQ.in('customer_id', customerIds);

  let quotesQ = supabase.from('quotations').select('id, customer_id, code, title, total, status, created_at, company_id');
  if (effectiveCompanyId) quotesQ = quotesQ.eq('company_id', effectiveCompanyId);
  if (!userIsAdmin(role) && uid) quotesQ = quotesQ.eq('created_by', uid);
  if (customerIds?.length) quotesQ = quotesQ.in('customer_id', customerIds);

  let ordersQ = supabase.from('orders').select('id, customer_id, code, title, total, status, paid_amount, created_at, company_id');
  if (effectiveCompanyId) ordersQ = ordersQ.eq('company_id', effectiveCompanyId);
  if (customerIds?.length) ordersQ = ordersQ.in('customer_id', customerIds);

  let invoicesQ = supabase.from('invoices').select('id, customer_id, code, title, total, paid_amount, payment_status, created_at, company_id');
  if (effectiveCompanyId) invoicesQ = invoicesQ.eq('company_id', effectiveCompanyId);
  if (customerIds?.length) invoicesQ = invoicesQ.in('customer_id', customerIds);

  const [{ data: leadsRaw, error: leadsErr }, { data: quotes }, { data: orders }, { data: invoices }] =
    await Promise.all([leadsQ, quotesQ, ordersQ, invoicesQ]);
  if (leadsErr) throw leadsErr;

  const leads = (leadsRaw || []).filter((l) => crmLeadRowVisibleToRequestUser(l, uid, role));
  return { leads, quotes: quotes || [], orders: orders || [], invoices: invoices || [] };
}

function mapCustomerOverviewRow(c, leads, quotes, orders, invoices, includeNested = true) {
  const cLeads = (leads || []).filter((l) => l.customer_id === c.id);
  const cQuotes = (quotes || []).filter((q) => q.customer_id === c.id);
  const cOrders = (orders || []).filter((o) => o.customer_id === c.id);
  const cInvoices = (invoices || []).filter((i) => i.customer_id === c.id);
  const totalOrders = cOrders.reduce((s, o) => s + (o.total || 0), 0);
  const totalPaid = cInvoices.reduce((s, i) => s + (i.paid_amount || 0), 0);
  const totalDebt = cInvoices.reduce((s, i) => s + ((i.total || 0) - (i.paid_amount || 0)), 0);
  const row = {
    ...c,
    stats: {
      lead_count: cLeads.length,
      won_count: cLeads.filter((l) => l.stage?.is_won).length,
      quote_count: cQuotes.length,
      order_count: cOrders.length,
      invoice_count: cInvoices.length,
      total_orders: totalOrders,
      total_paid: totalPaid,
      total_debt: totalDebt,
      lead_value: cLeads.reduce((s, l) => s + (l.estimated_value || 0), 0),
    },
  };
  if (includeNested) {
    row.leads = cLeads;
    row.quotes = cQuotes;
    row.orders = cOrders;
    row.invoices = cInvoices;
  }
  return row;
}

function computeCustomersOverviewSummary(customerRows, leads, orders, invoices) {
  const idSet = new Set((customerRows || []).map((c) => c.id));
  let leadsCount = 0;
  let dealsCount = 0;
  let won = 0;
  let revenue = 0;
  let debt = 0;
  let active = 0;

  for (const c of customerRows || []) {
    const cLeads = (leads || []).filter((l) => l.customer_id === c.id);
    const cOrders = (orders || []).filter((o) => o.customer_id === c.id);
    const cInvoices = (invoices || []).filter((i) => i.customer_id === c.id);
    if (cLeads.length > 0 || cOrders.length > 0) active += 1;
    revenue += cInvoices.reduce((s, i) => s + (i.paid_amount || 0), 0);
    debt += cInvoices.reduce((s, i) => s + ((i.total || 0) - (i.paid_amount || 0)), 0);
  }

  for (const l of leads || []) {
    if (!idSet.has(l.customer_id)) continue;
    if (l.type === 'deal') dealsCount += 1;
    else leadsCount += 1;
    if (l.stage?.is_won) won += 1;
  }

  return {
    total: customerRows?.length || 0,
    active,
    leads: leadsCount,
    deals: dealsCount,
    won,
    revenue,
    debt,
  };
}

async function buildCustomersOverviewSummary(effectiveCompanyId, uid, role, search, activity) {
  let custQ = supabase.from('customers').select('id');
  if (effectiveCompanyId) custQ = custQ.eq('company_id', effectiveCompanyId);
  custQ = applyCustomersOverviewSearch(custQ, search);
  if (activity && activity !== 'all') {
    const activityIds = await fetchActivityCustomerIds(effectiveCompanyId, activity);
    if (activityIds) custQ = applyCustomerIdInFilter(custQ, activityIds);
  }
  const { data: custRows, error } = await custQ;
  if (error) throw error;
  const idSet = new Set((custRows || []).map((c) => c.id));
  if (!idSet.size) {
    return { total: 0, active: 0, leads: 0, deals: 0, won: 0, revenue: 0, debt: 0 };
  }
  // Không truyền hàng nghìn id vào .in() — lấy theo phạm vi công ty rồi lọc trong bộ nhớ.
  const { leads, orders, invoices } = await fetchScopedCrmBundles(effectiveCompanyId, uid, role, null);
  const filteredLeads = (leads || []).filter((l) => idSet.has(l.customer_id));
  const filteredOrders = (orders || []).filter((o) => idSet.has(o.customer_id));
  const filteredInvoices = (invoices || []).filter((i) => idSet.has(i.customer_id));
  return computeCustomersOverviewSummary(custRows, filteredLeads, filteredOrders, filteredInvoices);
}



// ═══════════════════════════════════════════════════════════════════════════
// CRM PRODUCTS
// ═══════════════════════════════════════════════════════════════════════════



// ═══════════════════════════════════════════════════════════════════════════
// FOLLOW-UP ALERTS
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// PROJECT COMPLETE → AUTO INVOICE
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// LEAD ↔ PROJECT SYNC: Tasks/Checklists + Stage Progress
// ═══════════════════════════════════════════════════════════════════════════

// Get project tasks & checklists for a lead (activity history)

// Sync: move lead stage → project stage + vice versa

// ═══════════════════════════════════════════════════════════════════════════
// PDF GENERATION HELPER
// ═══════════════════════════════════════════════════════════════════════════
function formatVNDPdf(n) {
  if (!n && n !== 0) return '0';
  return new Intl.NumberFormat('vi-VN').format(Math.round(n));
}

// Load company settings (from data file or default config)
const path = require('path');
const fs = require('fs');
const defaultCompanyInfo = require('../../../config/companyInfo');

function getCompanyInfo() {
  try {
    const filePath = path.join(__dirname, '../../data/company-info.json');
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return { ...defaultCompanyInfo, ...JSON.parse(raw) };
    }
  } catch (e) { /* fallback to default */ }
  return { ...defaultCompanyInfo };
}

// Register Vietnamese-capable fonts
const fontRegular = path.join(__dirname, '../../assets/fonts/DejaVuSans.ttf');
const fontBold = path.join(__dirname, '../../assets/fonts/DejaVuSans-Bold.ttf');

function generateDocPdf(res, doc, items, docType) {
  const company = getCompanyInfo();
  const margin = 40;
  const pdf = new PDFDocument({ size: 'A4', margin, bufferPages: true });

  // Register Vietnamese fonts
  pdf.registerFont('VN', fontRegular);
  pdf.registerFont('VN-Bold', fontBold);

  res.setHeader('Content-Type', 'application/pdf');
  const safeCode = (doc.code || 'unknown').replace(/[^a-zA-Z0-9\-]/g, '_');
  res.setHeader('Content-Disposition', `inline; filename="${safeCode}.pdf"`);
  pdf.pipe(res);

  const pageW = pdf.page.width - margin * 2;
  const tableX = margin;

  // ════════════════════════════════════════════════════════════════════
  // COMPANY HEADER (logo left, info right)
  // ════════════════════════════════════════════════════════════════════
  const headerStartY = margin;
  const logoW = 80;
  const infoX = margin + logoW + 15;
  const infoW = pageW - logoW - 15;

  // Try to draw logo
  let logoDrawn = false;
  if (company.logoPath) {
    try {
      const logoFile = path.resolve(__dirname, '../../', company.logoPath);
      if (fs.existsSync(logoFile)) {
        pdf.image(logoFile, margin, headerStartY, { width: logoW, height: 70 });
        logoDrawn = true;
      }
    } catch (e) { /* skip logo */ }
  }

  const textStartX = logoDrawn ? infoX : margin;
  const textWidth = logoDrawn ? infoW : pageW;

  // Company name
  pdf.font('VN-Bold').fontSize(13).fillColor('#1a1a1a');
  pdf.text(company.name, textStartX, headerStartY, { width: textWidth });
  
  // Addresses
  pdf.font('VN').fontSize(8).fillColor('#444');
  (company.addresses || []).forEach(addr => {
    pdf.text(addr, textStartX, pdf.y, { width: textWidth });
  });

  // Website
  if (company.website) {
    pdf.fillColor('#2563EB').text(company.website, textStartX, pdf.y, { width: textWidth, link: company.website });
    pdf.fillColor('#444');
  }

  // Hotline & contacts
  if (company.hotline) {
    pdf.font('VN-Bold').fontSize(8).fillColor('#444');
    pdf.text(`Hotline: ${company.hotline}`, textStartX, pdf.y, { width: textWidth, continued: false });
  }
  (company.contacts || []).forEach(c => {
    pdf.font('VN').fontSize(8).fillColor('#444');
    pdf.text(c, textStartX, pdf.y, { width: textWidth });
  });
  if (company.taxCode) {
    pdf.font('VN').fontSize(8).text(`MST: ${company.taxCode}`, textStartX, pdf.y, { width: textWidth });
  }

  // Separator line
  const afterHeaderY = Math.max(pdf.y, headerStartY + 75) + 8;
  pdf.moveTo(margin, afterHeaderY).lineTo(margin + pageW, afterHeaderY).lineWidth(1.5).strokeColor('#2563EB').stroke();

  // ════════════════════════════════════════════════════════════════════
  // DOCUMENT TITLE
  // ════════════════════════════════════════════════════════════════════
  let title = '';
  if (docType === 'quotation') title = company.quotationTitle || 'BÁO GIÁ KHỐI LƯỢNG CÔNG TRÌNH';
  else if (docType === 'order') title = company.orderTitle || 'ĐƠN HÀNG';
  else title = company.invoiceTitle || 'HÓA ĐƠN BÁN HÀNG';

  pdf.y = afterHeaderY + 15;
  pdf.font('VN-Bold').fontSize(16).fillColor('#1a1a1a');
  pdf.text(title, margin, pdf.y, { align: 'center', width: pageW });
  
  pdf.font('VN').fontSize(9).fillColor('#555');
  pdf.text(`Số: ${doc.code || ''}`, margin, pdf.y, { align: 'center', width: pageW });
  if (doc.created_at) {
    pdf.text(`Ngày: ${new Date(doc.created_at).toLocaleDateString('vi-VN')}`, margin, pdf.y, { align: 'center', width: pageW });
  }
  pdf.moveDown(0.8);

  // ════════════════════════════════════════════════════════════════════
  // GREETING TEXT
  // ════════════════════════════════════════════════════════════════════
  if (company.greeting) {
    pdf.font('VN').fontSize(9).fillColor('#333');
    const shortName = company.name.replace(/^Công Ty /i, '').split(' ').pop() || company.name;
    pdf.text(`${company.name} ${company.greeting}`, margin, pdf.y, { width: pageW });
    if (docType === 'quotation') {
      pdf.text(`${shortName} xin gửi đến quý khách bảng báo giá khối lượng công trình như sau:`, margin, pdf.y, { width: pageW });
    }
    pdf.moveDown(0.5);
  }

  // ════════════════════════════════════════════════════════════════════
  // CUSTOMER INFO
  // ════════════════════════════════════════════════════════════════════
  pdf.font('VN-Bold').fontSize(9).fillColor('#1a1a1a');
  if (doc.customer_name) pdf.text(`Khách hàng: ${doc.customer_name}`, margin);
  pdf.font('VN').fontSize(9).fillColor('#333');
  if (doc.customer_phone) pdf.text(`Điện thoại: ${doc.customer_phone}`, margin);
  if (doc.customer_address) pdf.text(`Địa chỉ: ${doc.customer_address}`, margin);
  if (doc.customer?.tax_code) pdf.text(`MST: ${doc.customer.tax_code}`, margin);
  pdf.moveDown(0.6);

  // ════════════════════════════════════════════════════════════════════
  // ITEMS TABLE
  // ════════════════════════════════════════════════════════════════════
  // Column definitions: STT | Hạng mục thi công | ĐVT | Quy cách | Số lượng | Diện tích | Đơn giá | Thành tiền | %VAT | Tiền thuế | Ghi chú
  const colWidths = [25, 120, 30, 55, 35, 45, 60, 65, 28, 52];
  const colLabels = ['STT', 'Hạng mục thi công', 'ĐVT', 'Quy cách', 'SL', 'D.tích (m²)', 'Đơn giá', 'Thành tiền', 'VAT%', 'Tiền thuế'];
  const colAligns = ['center', 'left', 'center', 'center', 'right', 'right', 'right', 'right', 'right', 'right'];

  let tableY = pdf.y;
  const rowH = 22;
  const headerH = 26;

  // Draw header background
  pdf.rect(tableX, tableY, pageW, headerH).fill('#2563EB');
  pdf.font('VN-Bold').fontSize(7).fillColor('#FFFFFF');
  let cx = tableX;
  for (let c = 0; c < colLabels.length; c++) {
    pdf.text(colLabels[c], cx + 2, tableY + 4, { width: colWidths[c] - 4, align: colAligns[c] });
    cx += colWidths[c];
  }
  tableY += headerH;
  pdf.fillColor('#000000');

  // Draw column lines for header
  pdf.strokeColor('#FFFFFF').lineWidth(0.3);
  cx = tableX;
  for (let c = 0; c < colWidths.length; c++) {
    if (c > 0) pdf.moveTo(cx, tableY - headerH).lineTo(cx, tableY).stroke();
    cx += colWidths[c];
  }

  // Draw rows
  (items || []).forEach((item, idx) => {
    if (tableY + rowH > pdf.page.height - 120) {
      pdf.addPage();
      tableY = margin;
    }

    const bg = idx % 2 === 0 ? '#F8FAFC' : '#FFFFFF';
    pdf.rect(tableX, tableY, pageW, rowH).fill(bg);
    pdf.fillColor('#000000');

    const amount = item.amount || ((item.quantity || 0) * (item.unit_price || 0) * (1 - (item.discount_percent || 0) / 100));
    const vatRate = item.vat_rate || 0;
    const vatAmount = item.vat_amount || (amount * vatRate / 100);
    const area = item.dimensions ? '' : ''; // area comes from quantity * dimensions if applicable
    
    const values = [
      String(idx + 1),
      item.name || '',
      item.unit || '',
      item.dimensions || '',
      String(item.quantity || 0),
      item.dimensions ? '' : '',
      formatVNDPdf(item.unit_price || 0),
      formatVNDPdf(amount),
      vatRate > 0 ? `${vatRate}%` : '0',
      formatVNDPdf(vatAmount),
    ];

    cx = tableX;
    pdf.font('VN').fontSize(7).fillColor('#1a1a1a');
    for (let c = 0; c < values.length; c++) {
      pdf.text(values[c], cx + 2, tableY + 5, { width: colWidths[c] - 4, align: colAligns[c] });
      cx += colWidths[c];
    }

    // Row border
    pdf.moveTo(tableX, tableY + rowH).lineTo(tableX + pageW, tableY + rowH).lineWidth(0.3).strokeColor('#D1D5DB').stroke();
    
    // Column lines
    cx = tableX;
    pdf.strokeColor('#E5E7EB').lineWidth(0.2);
    for (let c = 0; c < colWidths.length; c++) {
      if (c > 0) pdf.moveTo(cx, tableY).lineTo(cx, tableY + rowH).stroke();
      cx += colWidths[c];
    }

    tableY += rowH;
  });

  // Table outer border
  const tableStartY = pdf.y; // approximate
  pdf.rect(tableX, pdf.y, pageW, 0).strokeColor('#333').lineWidth(0.5);
  pdf.moveTo(tableX, tableY).lineTo(tableX + pageW, tableY).lineWidth(0.8).strokeColor('#333').stroke();

  // ════════════════════════════════════════════════════════════════════
  // TOTALS
  // ════════════════════════════════════════════════════════════════════
  tableY += 8;
  const subtotal = (items || []).reduce((s, i) => s + (i.amount || ((i.quantity || 0) * (i.unit_price || 0) * (1 - (i.discount_percent || 0) / 100))), 0);
  const discountAmt = doc.discount_amount || 0;
  const afterRebate = subtotal - discountAmt;
  const saleDiscountAmt = doc.sale_discount_amount != null
    ? Number(doc.sale_discount_amount) || 0
    : (doc.sale_discount_type === 'percent'
      ? afterRebate * (doc.sale_discount_value || 0) / 100
      : (doc.sale_discount_value || 0));
  const afterAllDiscounts = Math.max(0, afterRebate - saleDiscountAmt);
  const totalVat = (items || []).reduce((s, i) => {
    const amt = i.amount || ((i.quantity || 0) * (i.unit_price || 0) * (1 - (i.discount_percent || 0) / 100));
    return s + (i.vat_amount || (amt * (i.vat_rate || 0) / 100));
  }, 0);
  const total = afterAllDiscounts + totalVat;

  const rightX = tableX + pageW - 220;
  const valX = rightX + 120;
  const valW = 100;

  const drawTotal = (label, value, opts = {}) => {
    const { bold, color, underline } = opts;
    pdf.font(bold ? 'VN-Bold' : 'VN').fontSize(bold ? 10 : 9);
    pdf.fillColor(color || '#1a1a1a');
    pdf.text(label, rightX, tableY, { width: 120, align: 'left' });
    pdf.text(value, valX, tableY, { width: valW, align: 'right' });
    if (underline) {
      tableY += (bold ? 16 : 14);
      pdf.moveTo(rightX, tableY - 2).lineTo(rightX + 220, tableY - 2).lineWidth(0.5).strokeColor('#333').stroke();
      tableY += 4;
    } else {
      tableY += (bold ? 16 : 14);
    }
    pdf.fillColor('#1a1a1a');
  };

  drawTotal('Cộng tiền hàng:', formatVNDPdf(subtotal) + ' đ');
  if (discountAmt > 0) drawTotal('Chiết khấu:', '-' + formatVNDPdf(discountAmt) + ' đ');
  if (discountAmt > 0) drawTotal('Sau chiết khấu:', formatVNDPdf(afterRebate) + ' đ');
  if (saleDiscountAmt > 0) drawTotal('Giảm giá:', '-' + formatVNDPdf(saleDiscountAmt) + ' đ');
  if (saleDiscountAmt > 0) drawTotal('Cộng trước thuế:', formatVNDPdf(afterAllDiscounts) + ' đ');
  drawTotal('Thuế GTGT:', formatVNDPdf(totalVat) + ' đ');
  drawTotal('TỔNG CỘNG:', formatVNDPdf(total) + ' VNĐ', { bold: true, color: '#1D4ED8', underline: true });

  // ════════════════════════════════════════════════════════════════════
  // PAYMENT TERMS & NOTES
  // ════════════════════════════════════════════════════════════════════
  tableY += 6;
  if (doc.payment_terms) {
    pdf.font('VN-Bold').fontSize(9).fillColor('#1a1a1a');
    pdf.text('Điều khoản thanh toán:', margin, tableY, { width: pageW });
    tableY = pdf.y + 2;
    pdf.font('VN').fontSize(8).fillColor('#333');
    pdf.text(doc.payment_terms, margin + 10, tableY, { width: pageW - 10 });
    tableY = pdf.y + 6;
  }

  if (doc.valid_until) {
    pdf.font('VN-Bold').fontSize(9).fillColor('#1a1a1a');
    pdf.text(`Hiệu lực báo giá: đến ngày ${new Date(doc.valid_until).toLocaleDateString('vi-VN')}`, margin, tableY, { width: pageW });
    tableY = pdf.y + 4;
  }

  if (company.warrantyText) {
    pdf.font('VN-Bold').fontSize(9).fillColor('#1a1a1a');
    pdf.text('Bảo hành:', margin, tableY, { width: pageW });
    tableY = pdf.y + 2;
    pdf.font('VN').fontSize(8).fillColor('#333');
    pdf.text(company.warrantyText, margin + 10, tableY, { width: pageW - 10 });
    tableY = pdf.y + 6;
  }

  if (doc.notes) {
    pdf.font('VN-Bold').fontSize(9).fillColor('#1a1a1a');
    pdf.text('Ghi chú:', margin, tableY, { width: pageW });
    tableY = pdf.y + 2;
    pdf.font('VN').fontSize(8).fillColor('#333');
    pdf.text(doc.notes, margin + 10, tableY, { width: pageW - 10 });
    tableY = pdf.y + 6;
  }

  // Bank info
  if (company.bankAccount && company.bankName) {
    pdf.font('VN-Bold').fontSize(9).fillColor('#1a1a1a');
    pdf.text('Thông tin chuyển khoản:', margin, tableY, { width: pageW });
    tableY = pdf.y + 2;
    pdf.font('VN').fontSize(8).fillColor('#333');
    pdf.text(`STK: ${company.bankAccount} — ${company.bankName}`, margin + 10, tableY, { width: pageW - 10 });
    tableY = pdf.y + 6;
  }

  // ════════════════════════════════════════════════════════════════════
  // SIGNATURES
  // ════════════════════════════════════════════════════════════════════
  if (tableY + 90 > pdf.page.height - margin) pdf.addPage();
  tableY = Math.max(tableY + 25, pdf.y + 25);

  const sigLeft = company.signatureLeft || 'Đại diện khách hàng';
  const sigRight = company.signatureRight || 'Đại diện công ty';

  pdf.font('VN-Bold').fontSize(9).fillColor('#1a1a1a');
  pdf.text(sigLeft, margin, tableY, { width: pageW / 2, align: 'center' });
  pdf.text(sigRight, margin + pageW / 2, tableY, { width: pageW / 2, align: 'center' });
  tableY += 14;
  pdf.font('VN').fontSize(7).fillColor('#888');
  pdf.text('(Ký, ghi rõ họ tên)', margin, tableY, { width: pageW / 2, align: 'center' });
  pdf.text('(Ký, ghi rõ họ tên)', margin + pageW / 2, tableY, { width: pageW / 2, align: 'center' });

  pdf.end();
}

// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// IMPORT EXCEL → PARSE (chỉ parse, trả về data preview — KHÔNG lưu DB)
// ═══════════════════════════════════════════════════════════════════════════

/** Quét ô «ĐÃ NHẬN» / «CHƯA NHẬN» trên dòng Cọc — re-export từ quotationExcelParser. */
const {
  parseQuotationExcelBuffer,
  listQuotationExcelSheets,
} = require('../../../helpers/quotationExcelParser');

const excelUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

/** Liệt kê sheet trong file Excel + gợi ý sheet giống báo giá (heuristic header). */


// ═══════════════════════════════════════════════════════════════════════════
// IMPORT EXCEL → TẠO BÁO GIÁ TỪ TASK (parse + tạo quotation + complete task + sync KH)
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// PDF EXPORT ENDPOINTS



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
async function resolveCrmTaskWriteLeadId(routeLeadId) {
  const { data: leadRow } = await supabase
    .from('crm_leads')
    .select('use_order_tasks, parent_lead_id')
    .eq('id', routeLeadId)
    .maybeSingle();
  if (!leadRow?.use_order_tasks || leadRow.parent_lead_id) return routeLeadId;
  const { data: ords } = await supabase
    .from('orders')
    .select('fulfillment_lead_id')
    .eq('lead_id', routeLeadId)
    .not('fulfillment_lead_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(1);
  const fid = ords?.[0]?.fulfillment_lead_id;
  return fid ? String(fid) : routeLeadId;
}

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

// Gen lại nhiệm vụ CRM theo bộ mẫu pipeline (xóa thừa + đồng bộ giai đoạn hiện tại).

// Quét & bổ sung nhiệm vụ CRM thiếu theo bộ mẫu pipeline (không xóa task cũ).
// Body: { pipeline_stage_id?, all_stages?: boolean } — mặc định quét cột hiện tại.

// Quét & bổ sung nhiệm vụ SX (sx_*) thiếu theo bộ mẫu xưởng (không xóa task cũ).

// CREATE task

// BULK CREATE from template
// Idempotent: chỉ tạo task cho item chưa tồn tại trong cùng (lead, stage) (so theo title).
// Tránh trường hợp user bấm "Gắn mẫu" 2-3 lần → nhân tasks.

// Gen nhiệm vụ pipeline SX (sx_*) từ workshop_task_templates — ghi đúng lead (deal con khi use_order_tasks).

// UPDATE task

// Khôi phục checklist từ mẫu xưởng (khi bị ghi đè từ không gian chung)

// DELETE task

// ═══════════════════════════════════════════════════════════════════════════
// TOGGLE SHARE TASK TO PROJECT (cho Khối khác xem)
// ═══════════════════════════════════════════════════════════════════════════


// Toggle share cho từng attachment riêng lẻ


// GET shared CRM task notes for a project (dùng từ ProjectDetail)

// ═══════════════════════════════════════════════════════════════════════════
// TASK NOTES & ATTACHMENTS
// ═══════════════════════════════════════════════════════════════════════════

// UPDATE task notes (quick text note on task itself) + sync ghi chú → lead_documents

// UPDATE ghi chú cho 1 mục checklist con + sync → lead_documents

// GET attachments for a task

// BULK ADD attachments (nhiều files 1 request)

// ADD attachment (file or text note) to a task

// DELETE attachment + sync xóa lead_document liên kết

// GET all attachments for a lead/deal (across all tasks)

// GET all CRM tasks (overview page) with filters

// GET CRM tasks planner (grouped by assignee)

function crmTemplateMatchesLeadType(pipelineType, leadType) {
  const lt = String(leadType || 'both').toLowerCase();
  if (lt === 'both') return true;
  const pt = String(pipelineType || '').toLowerCase();
  return !pt || pt === 'both' || pt === lt;
}

async function resolveCrmBundleTemplateScope(sb, pipelineId, leadType) {
  const { data: stages, error: stErr } = await sb
    .from('crm_pipeline_stages')
    .select('id, pipeline_type')
    .eq('pipeline_id', pipelineId)
    .eq('is_active', true);
  if (stErr) throw stErr;

  const stageIds = (stages || [])
    .filter((s) => crmTemplateMatchesLeadType(s.pipeline_type, leadType))
    .map((s) => s.id);
  if (!stageIds.length) return { stageIds: [], templateIds: [] };

  const { data: rows, error: tplErr } = await sb
    .from('crm_task_templates')
    .select('id, pipeline_type, pipeline_stage_id')
    .eq('is_active', true)
    .in('pipeline_stage_id', stageIds);
  if (tplErr) throw tplErr;

  const templateIds = (rows || [])
    .filter((row) => crmTemplateMatchesLeadType(row.pipeline_type, leadType))
    .map((row) => row.id)
    .filter(Boolean);
  return { stageIds, templateIds };
}

// GET task templates

// CRM Task Templates CRUD




// Áp dụng bộ mẫu CRM cho toàn bộ lead/deal thuộc mọi khu vực của công ty (theo pipeline).

// Template items CRUD

// Update template item (checklist, reorder, etc.)


// ═══ AUTO-PROJECT CONFIG ═══
// GET — load config

// PUT — save config

// ═══════════════════════════════════════════════════════════════════════════
// AUTO CREATE PROJECT FROM DEAL (chạy ngầm, không cần UI tạo dự án)
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// DEAL → SX: xác nhận thủ công (sale + ngày kế hoạch), sau đó mới đồng bộ CRM theo Kanban xưởng
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// LEAD MEMBERS — Thành viên tham gia Lead/Deal
// ═══════════════════════════════════════════════════════════════════════════

// GET /leads/:id/members

// POST /leads/:id/members — thêm thành viên (1 hoặc nhiều)

// GET /leads/:id/assignments — nhiệm vụ «Giao việc CRM» gắn lead/deal này

// POST /leads/:id/assignments — giao việc CRM cho thành viên tham gia lead/deal

// DELETE /leads/:id/members/:userId — xóa thành viên

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

// POST /leads/:id/chat — gửi tin nhắn (text, file, image, video, audio)

// POST /leads/:id/chat/drive — chia sẻ file Google Drive vào chat

// POST /leads/:id/chat/upload — upload file/image/video/audio
const chatUpload = multer({ storage: multer.diskStorage({
  destination: 'uploads/lead-chat/',
  filename: (_, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_'))
}), limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB max


// POST /leads/:id/chat/:msgId/react — thêm/xóa cảm xúc

// PUT /leads/:id/chat/:msgId/pin — ghim/bỏ ghim

// GET /leads/:id/chat/pinned — danh sách tin ghim

// ═══════════════════════════════════════════════════════════════════════════
// CSKH FOLLOW-UP CARE NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════

const FOLLOWUP_TIME_BUCKETS = [
  { key: 'w1', label: '7–13 ngày trước', daysFrom: 13, daysTo: 7 },
  { key: 'w2', label: '14–20 ngày trước', daysFrom: 20, daysTo: 14 },
  { key: 'w3', label: '21–27 ngày trước', daysFrom: 27, daysTo: 21 },
  { key: 'w4', label: '28–34 ngày trước', daysFrom: 34, daysTo: 28 },
];

/** Hết hạn dismissal vào 23:59:59 hôm nay (giờ VN, UTC+7). */
function followupDismissExpiresAt() {
  const nowVn = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const todayUtcMidnight = new Date(Date.UTC(
    nowVn.getUTCFullYear(),
    nowVn.getUTCMonth(),
    nowVn.getUTCDate(),
    16, 59, 59, 999,
  ));
  if (todayUtcMidnight.getTime() < Date.now()) {
    todayUtcMidnight.setUTCDate(todayUtcMidnight.getUTCDate() + 1);
  }
  return todayUtcMidnight;
}





// POST /crm/followup-care/dismiss/undo — bỏ tất cả dismissal còn hiệu lực của user (khôi phục thông báo lỡ tích nhầm)

// ═══ Đã chăm sóc (per-lead) ═══
// GET /crm/lead-care-marks?lead_ids=a,b,c → trả về danh sách lead_id user đã đánh dấu (chưa hết hạn)

// POST /crm/leads/:id/care-mark → đánh dấu đã chăm sóc lead này (30 ngày)

// DELETE /crm/leads/:id/care-mark → bỏ dấu chăm sóc

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

/** DELETE /crm/leads/:id/pin — bỏ ghim. */

/** POST /crm/leads/:id/interacted — bật tick xanh "đã tương tác". */

/** DELETE /crm/leads/:id/interacted — tắt tick xanh. */

// ════════════════════════════════════════════════════════════════════════════
// CRM DEADLINE CONFIG (theo công ty) — phục vụ view "Deadline"
// ════════════════════════════════════════════════════════════════════════════

const DEFAULT_DEADLINE_BUCKETS = {
  overdue:     { enabled: true, label: 'Quá hạn' },
  today:       { enabled: true, label: 'Hôm nay' },
  this_week:   { enabled: true, label: 'Tuần này' },
  next_week:   { enabled: true, label: 'Tuần sau' },
  in_2_weeks:  { enabled: true, label: 'Trong 2 tuần', days: 14 },
  in_3_weeks:  { enabled: true, label: 'Trong 3 tuần', days: 21 },
  in_4_weeks:  { enabled: true, label: 'Trong 4 tuần', days: 28 },
  in_1_month:  { enabled: true, label: 'Trong 1 tháng', days: 30 },
  next_month:  { enabled: true, label: 'Tháng sau' },
  no_deadline: { enabled: true, label: 'Không hạn' },
};

const ALLOWED_DEADLINE_FIELDS = new Set(['kanban_deadline_at', 'expected_close_date', 'crm_next_open_task_deadline']);

function buildDefaultDeadlineConfig(companyId) {
  return {
    company_id: companyId || null,
    primary_field: 'crm_next_open_task_deadline',
    fallback_field: 'expected_close_date',
    buckets: { ...DEFAULT_DEADLINE_BUCKETS },
    updated_at: null,
  };
}

// GET /crm/settings/deadline-config?company_id=… → cấu hình deadline; trả mặc định nếu chưa có.

// PUT /crm/settings/deadline-config → upsert. Chỉ admin công ty hoặc system admin.

// ════════════════════════════════════════════════════════════════════════════
// CRM PLANNER CÁ NHÂN — user tự tạo cột & kéo-thả lead/deal vào
// ════════════════════════════════════════════════════════════════════════════

function plannerTableMissing(error) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('crm_user_planner_columns') || msg.includes('crm_user_planner_items');
}

// GET /crm/planner/me → toàn bộ columns + items của user hiện tại

// POST /crm/planner/columns → tạo cột mới

// PATCH /crm/planner/columns/:id → đổi tên / màu / vị trí

// DELETE /crm/planner/columns/:id → xóa cột (cascade xóa items)

// POST /crm/planner/columns/:id/items → thêm lead vào cột (id cuối)

// POST /crm/planner/reorder → batch lưu thứ tự khi kéo-thả
// body: { items: [{ id, column_id, position }, ...] }

// DELETE /crm/planner/items/:id → bỏ lead khỏi cột

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

function crmLeadCommentReadReceiptsTableMissing(error) {
  return String(error?.message || '').toLowerCase().includes('crm_lead_comment_read_receipts');
}

async function fetchLeadCommentAudienceMembersForRead(leadId) {
  return fetchLeadCommentAudienceMembers(supabase, leadId);
}

// GET /crm/leads/:id/comments → list bình luận của một lead

/** Đánh dấu đã đọc bình luận lead/deal (cập nhật last_read_at). */

/** Read receipts + thành viên audience — hiển thị Đã xem / Đã nhận trên từng bình luận. */

// POST /crm/leads/:id/comments → thêm bình luận

// PATCH /crm/lead-comments/:cid → sửa bình luận (chỉ chủ sở hữu)

// PUT /crm/lead-comments/:cid/reaction → thả / đổi / bỏ cảm xúc (1 emoji / user / bình luận)

// DELETE /crm/lead-comments/:cid → xóa mềm (chỉ chủ sở hữu hoặc admin)

// GET /crm/lead-comments/index?lead_ids=… → Map { lead_id → {count,last_at,last_user_id} }

/** Cho AI Assistant — cùng logic GET /crm/reports/org-overview */



module.exports = {
  ALLOWED_DEADLINE_FIELDS,
  CRM_COMMENT_ALLOWED_REACTION_EMOJI,
  CRM_LEAD_KANBAN_LITE_SELECT,
  CRM_LEAD_LIST_SELECT,
  CRM_LEAD_LIST_SELECT_BASE,
  CRM_LEAD_LIST_SELECT_EXTRA,
  CRM_LEAD_REGION_EMBED,
  CRM_NEW_LEAD_MAX_AGE_MS,
  CRM_TASK_SELECT,
  CRM_UUID_RE,
  CUSTOMERS_IN_CHUNK,
  CUSTOMERS_OVERVIEW_NO_MATCH_ID,
  DEAL_PRE_CONTRACT_SLUGS_STAFF,
  DEAL_REPORT_BUCKET_VALUES,
  DEFAULT_CHECKLISTS,
  DEFAULT_DEADLINE_BUCKETS,
  DEFAULT_PIPELINE_STAGE_SLA_DAYS,
  FOLLOWUP_TIME_BUCKETS,
  PDFDocument,
  QUOTATIONS_SOURCE_EXCEL_COLS,
  Router,
  SCAN_DUP_LITE_SELECT,
  STAFF_LEAD_DEAL_REPORT_ROLES,
  SURVEY_EVENT_SELECT,
  SURVEY_EVENT_TYPES,
  XLSX,
  ZALO_APP_SETTING_KEY,
  _crmLeadSelectMigrationChecked,
  _crmLeadTypeColorAvailable,
  _vcPipelineStageAvailable,
  addPhoneToAutoLeadBlocklist,
  aggregateCrmCommentReactions,
  aggregateOrgReportRows,
  appendFulfillmentChildTasksForMasterDeal,
  applyAllActiveWorkshopTemplatesForArea,
  applyAssigneesToInsertedCrmTasks,
  applyCrmLeadRegionFilterToQuery,
  applyCrmTaskTemplatesToCompanyRegions,
  applyCustomerIdInFilter,
  applyCustomersOverviewSearch,
  applyDefaultWorkshopTemplatesForNewProject,
  applyLeadOrCustomerSalesFilter,
  applyProductionTemplateToFulfillmentLead,
  applyProductionTemplatesOnPipelineEnter,
  applyStageIdFilterToQuery,
  applyWorkshopTemplateToProject,
  artifactNamePrefix,
  assertCanFlagLead,
  assertCategoryFitsSource,
  assertCrmAssigneeUserMatchesLeadCompany,
  assertCrmEmployeeDeleteAllowed,
  assertCrmStageAdvanceAllowed,
  assertDealCrmManualStageChange,
  assertDealResponsible,
  assertDivisionAllowedForCompany,
  assertLeadDocumentOwner,
  assertLeadReadableByRegionScope,
  assertRegionBelongsToCompany,
  assertUserCanAssignCrmRegion,
  assignProductionCompanyDealResponsibility,
  attachAssigneesToCrmTasks,
  attachAssignmentIdsToCrmTasks,
  attachCrmNextOpenTaskDeadline,
  attachLeadNewFlagForList,
  attachLeadReplyParents,
  attachLeadUserFlagsForList,
  auth,
  autoCreateProjectFromWonDeal,
  autoFlowFns,
  autoGenCrmTasksForNewLead,
  buildAssignmentNotificationInsert,
  buildChecklistLeadDocumentRow,
  buildCrmDashboardMinimalKpis,
  buildCrmLeadsRpcFilterParams,
  buildCustomersOverviewSummary,
  buildDealTemplateData,
  buildDefaultDeadlineConfig,
  buildFirstStageIdByPipeline,
  buildPipelineStagesMap,
  buildProcessedCommercialItems,
  buildQuotedStageOrderByPipeline,
  buildScanDuplicateGroups,
  buildWonStageOrderByPipeline,
  canUserViewDocByAllowlist,
  chatUpload,
  chunkArray,
  classifyDealStageForStaffReport,
  commentsTableMissing,
  companyRegionExtraColumnsMissing,
  companyRegionGeoColumnsMissing,
  computeCrmDashboardLightStats,
  computeCrmLiveVersionMs,
  computeCustomersOverviewSummary,
  computeIsNewLeadForUser,
  computeOrgOverviewReportData,
  computeStaffLeadDealReportData,
  computeStaffPipelineDetailPayload,
  countOpenOverdueCrmTasksForLeadIds,
  createCrmAssignment,
  createCrmLeadTask,
  createFulfillmentChildDeal,
  createNotif,
  createNotification,
  createProjectFromLead,
  crmExecutorFieldsFromTemplateItem,
  crmLeadCommentAttachmentsColumnMissing,
  crmLeadCommentReadReceiptsTableMissing,
  crmLeadRowVisibleToRequestUser,
  crmListUsesLegacyFilters,
  crmNoteActivityUpload,
  crmReportAsOfMs,
  crmReportCreatedAtFromIso,
  crmReportCreatedAtToIso,
  crmReportDayKeyVn,
  crmRouteErrorText,
  crmTaskDeadlineModuleKey,
  crmTaskMeetsCompletionRequirements,
  crmTaskMeetsRequiredFileTypes,
  crmTaskRequiresCompletionEvidence,
  crmTemplateMatchesLeadType,
  deadlineToDateOnlyIso,
  defaultCompanyInfo,
  defaultKpiLedgerMonthStartYmd,
  deleteCrmLeadTask,
  deleteMirroredAssignmentFileForTaskAttachment,
  duplicateLeadIdsFromLiteRows,
  ecosystemModuleKeyForCrmDeadline,
  effectivePipelineStageSlaDays,
  crmLeadMissingPhone,
  emitCrmBadgeUpdateForProject,
  emitCrmDashboardChanged,
  emitCrmTaskChanged,
  emptyStaffLeadDealAgg,
  endOfCalendarDayAfterEntered,
  enforceCommercialDocCompanyOnWrite,
  enforceQuotaForRequest,
  ensureDealLeadDocumentsForModuleTransition,
  ensureDefaultCrmPipelineForCompany,
  ensureMissingCrmTasksForLead,
  ensureMissingCrmTasksForPipelineStage,
  ensureMissingSxTasksForLead,
  excelUpload,
  executeLeadMerge,
  executeZaloDealStageNotify,
  fetchActivityCustomerIds,
  fetchAllLeadsForSlaWatchlist,
  fetchAssignmentForTask,
  fetchCrmCommentReactionsAggregate,
  fetchCrmLeadCommentNotifyUserIds,
  fetchCrmLeadDetailRow,
  fetchCrmLeadWithPipelineBadges,
  fetchCrmLeadsByIdsOrdered,
  fetchCrmLeadsForDashboardBatched,
  fetchCrmLeadsForOrgReportBatched,
  fetchCrmLeadsForUserDetailBatched,
  fetchCrmLeadsLiteForDuplicateScan,
  fetchCrmLeadsPageViaRpc,
  fetchCrmPipelineZaloSlice,
  fetchCrmSurveyEventsChunk,
  fetchCrmSurveyVisitsForOrgReport,
  fetchLeadCommentAudienceMembers,
  fetchLeadCommentAudienceMembersForRead,
  fetchLeadIdsForCrmRegion,
  fetchLeadMentionMembers,
  fetchOrgActivityFeed,
  fetchPipelineWithStagesById,
  fetchScopedCrmBundles,
  fillTemplateDataFromStructure,
  filterCrmTasksForLeadType,
  filterUserIdsForCrmLeadScopedNotification,
  findChecklistItem,
  followupDismissExpiresAt,
  fontBold,
  fontRegular,
  formatMoney,
  formatVNDPdf,
  formatVnPhoneLocal0From84,
  fs,
  generateDocPdf,
  generateFlowTasks,
  generateStepTasks,
  getAppSettingValue,
  getCompanyInfo,
  getCompanyRegionsList,
  getCrmLeadListSelect,
  getCrmLeadRegionConstraint,
  getCrmLeadTypesList,
  getCrmLeadsListLegacy,
  getCrmSourceCategoriesList,
  getCrmSourcesList,
  getDefaultCrmAttachmentShare,
  getDefaultDealZaloTemplateStructure,
  getDefaultLeadDocumentShareForDeal,
  getDefaultPipelineIdForCompany,
  getLeadDocumentFieldsFromCrmTask,
  getNotifyTargets,
  getOverdueFollowUps,
  getPipelineIdForCompanyRegion,
  getPipelineZaloSlice,
  getPipelinesList,
  getProjectCRMSummary,
  getStagesByPipelineId,
  getStaleLeads,
  getZaloNotifySettings,
  hydrateCrmLeadsByIdsWithStaff,
  hydrateCrmLeadsRpcPage,
  hydrateScanDuplicateLeads,
  insertQuotationRow,
  invalidateAppSettingKey,
  invalidatePipelinesAndStages,
  invalidateRegions,
  invalidateSources,
  invalidateTenantUsageCache,
  invokeCrmLeadsStageCountsRpc,
  isAdminLike,
  isAllowedLeadCommentAttachmentUrl,
  isChotSanXuatCrmTaskTitle,
  isCrmCompanyAdminUser,
  isCrmDealAssigneeLocked,
  isCrmLeadTypeColorMissingError,
  isCrmModuleAdmin,
  isCrmPipelinesTableMissingError,
  isCrmRegionAdminUser,
  isCrmSystemAdminUser,
  isDealStageHoanThanhForZalo,
  isDefaultAssigneeIdsColumnError,
  isExecutorColumnError,
  isPlatformAdmin,
  isPostgresUniqueViolation,
  isQuotationsSourceExcelColumnMissingError,
  isSxRelationshipError,
  isSystemAdmin,
  isUuidString,
  isValidDealZaloTemplateStructure,
  isVcRelationshipError,
  isVptCompanyCommercialDocViewer,
  lastNominatimGeocodeAt,
  leadChatFilesMulter,
  leadChatJsonOrFiles,
  listQuotationExcelSheets,
  loadCrmTaskAttachmentCountMap,
  loadOrgReportStageMap,
  loadZaloLinkedLeadIdSet,
  logDealActivityComment,
  logDealDeadlineChangeComment,
  logDealStageChangeComment,
  logKanbanDeadlineUnifiedHistory,
  logLeadCommentMentionActivity,
  logProjectFileActivity,
  mapCustomerOverviewRow,
  mapLeadDisplayPhone,
  mapQuotationItemsToOrderRows,
  maskCustomerPhoneDisplay,
  maskZaloAccessTokenPreview,
  maybeSendZaloOnDealStageEnter,
  mergeCrmStageDefaultAssigneeIntoUpdates,
  mergeCustomerIntoTarget,
  misaService,
  multer,
  nextCode,
  nextTbProjectCode,
  normalizeCrmActivityAttachments,
  normalizeCrmLeadCommentAttachments,
  normalizeCrmStageDefaultAssigneeUserId,
  normalizeCrmUserRole,
  normalizeLeadSeenByKeys,
  normalizeOrgReportSurveyVisitRow,
  normalizePipelineStageSlaDaysForDb,
  normalizePipelineStagesList,
  normalizeRegionIdList,
  normalizeTemplateChecklistForCrmTask,
  normalizeTemplateItemAssigneeIds,
  normalizeTimestamp,
  normalizeTitleFold,
  normalizeVnPhoneTo84,
  notifyDealCommentMentions,
  notifyDealCommentParticipants,
  notifyMultiple,
  notifyMultipleShared,
  notifyNewCrmAssignmentAssignees,
  notifyProductionDocumentUploaded,
  onLeadWon,
  onOrderConfirmed,
  onProjectCompleted,
  onQuotationAccepted,
  orgReportAttachFirstStageRates,
  orgReportBumpFirstStageMetrics,
  orgReportBumpMetrics,
  orgReportBumpOpenOverdue,
  orgReportBumpReceptionMetrics,
  orgReportCancelRatePct,
  orgReportClosedWonDealCount,
  orgReportClosedWonValue,
  orgReportCompareSummary,
  orgReportConversionRate,
  orgReportDayKey,
  orgReportDealCloseValueRatePct,
  orgReportDealCountsExpected,
  orgReportDealIsClosedWon,
  orgReportDealIsCompleted,
  orgReportDealIsQuotedOrAfter,
  orgReportDealProbability,
  orgReportDealSplitBuckets,
  orgReportExtendedDealMetrics,
  orgReportFirstStageOnTimeRatePct,
  orgReportFirstStageOverdueRatePct,
  orgReportIsReceptionOverdue,
  orgReportIsSlaOverdue,
  orgReportKpiPeriodStart,
  orgReportNumEst,
  orgReportOverdueRatePct,
  orgReportOwnerId,
  orgReportPctDelta,
  orgReportPreviousPeriod,
  orgReportQuoteValueCloseRatePct,
  orgReportQuoteWinRatePct,
  orgReportReceptionOverdueRatePct,
  orgReportReceptionSlaMinutes,
  orgReportStageIsClosed,
  orgReportStageIsLostOrCancelled,
  orgReportTotalDealCount,
  parseChecklist,
  parseCrmLeadsPageRpc,
  parseCrmReportDateRange,
  parseCrmStageCountsNumericMap,
  parseCrmStageCountsRpc,
  parseExcelMoneyFromMappedColumn,
  parseLeadIdUuidList,
  parseLeadIdsCsvQuery,
  parseLeadIdsFromBody,
  parseLeadSeenByRaw,
  parseQuotationExcelBuffer,
  parseStageIdsFromQuery,
  parseUuidArrayJsonb,
  parseVietnameseMeasure,
  parseVietnameseMoney,
  path,
  persistAssignmentNotification,
  pgCrmDuplicateLeadIds,
  pickDealZaloTemplatePayload,
  pipeOrgOverviewReportPdf,
  pipeStaffLeadDealSummaryPdf,
  pipeStaffPipelineDetailPdf,
  pipelineHasExplicitCompleted,
  pipelineHasExplicitExpected,
  pipelineHasExplicitWon,
  plannerTableMissing,
  postCrmStageDefaultAssigneeComment,
  primaryTemplateItemAssigneeId,
  rcInvalidateTags,
  reactionsTableMissing,
  redactCrmTaskNotesForViewer,
  regionGeocodeInflight,
  repairCrmDealPipelineDisplay,
  requireUserCompanyId,
  requireUserCompanyIdResolved,
  resolveAssignmentIdForTask,
  resolveCanonicalCrmLeadId,
  resolveCommercialDocListCompanyScope,
  resolveCrmBundleTemplateScope,
  resolveCrmLeadsDeadlinesMap,
  resolveCrmLeadsKanbanLite,
  resolveCrmLeadsMergedQuery,
  resolveCrmLeadsSkipDeadline,
  resolveCrmLedgerNetByLeadIdsPayload,
  resolveCrmReportScope,
  resolveCrmTaskWriteLeadId,
  resolveExecutorCompanyId,
  resolveKanbanStagesForCompany,
  resolveLeadCommentMentionIds,
  resolveProductionCompanyForDealStage,
  resolveProductionHandoverResponsibleUserId,
  resolveReopenTargetStageId,
  resolveRpcRegionIdsForCrmList,
  resolveTenantIdForQuota,
  resolveZaloDealTemplateId,
  respondIfCrmPipelinesTableMissing,
  responseCache,
  restoreCrmTaskChecklistFromWorkshopTemplate,
  resyncCrmPipelineTasksForLead,
  sanitizeIsoDateQueryParam,
  scheduleRegionGeocoding,
  scopedAdminCompanyId,
  scopedCrmCompanyIdForWrite,
  sendZaloTemplateMessage,
  setLeadFlag,
  shallowMergeTemplateData,
  skipSxWorkQuickComplete,
  snapshotOrderRowFromQuotation,
  stripCrmAssigneeFromWonStageUpdates,
  stripCrmLeadTypeColorFromSelect,
  stripQuotationsSourceExcelFields,
  sumCrmKpiLedgerNetByLeadIds,
  sumCrmKpiLedgerNetByUserForOrgReport,
  sumCrmKpiLedgerNetByUserIds,
  sumCrmKpiLedgerNetByUserIdsInDateRange,
  supabase,
  syncAllTaskArtifactsToAssignment,
  syncChecklistItemNotes,
  syncCrmLeadSxPipelineFromProject,
  syncQuotationDepositToDealAndProject,
  syncSxKanbanFromCrmProductionStage,
  syncTaskAttachmentToAssignment,
  templateItemAssigneePatch,
  toCrmTaskChecklist,
  unifyCrmLeadResponsibleFields,
  updateCrmLeadTask,
  updateQuotationRow,
  upsertZaloNotifySettings,
  userCanAccessCrmLeadAsParticipant,
  userCanAccessCrmLeadViaVisibility,
  userCanAssignAnyCrmRegion,
  userCanBypassCrmDeleteRestriction,
  userHasSeenLeadInSeenBy,
  userIsAdmin,
  userIsCrmCompanyOrRegionAdmin,
  userMayAccessQuotationRow,
  userSeesAllCrmDeals,
  userSeesAllCrmDealsForScope,
  userSeesAllCrmLeads,
  userSeesAllCrmLeadsForScope,
  uuidQueryOrNull,
  validateProductionCompanyId,
};
