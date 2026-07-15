const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const { responseCache, invalidateTags: rcInvalidateTags } = require('../middleware/responseCache');
const { pgCrmDuplicateLeadIds } = require('../helpers/pgHotQueries');
const PDFDocument = require('pdfkit');
const multer = require('multer');
const XLSX = require('xlsx');
const {
  crmTaskMeetsCompletionRequirements,
  crmTaskRequiresCompletionEvidence,
  crmTaskMeetsRequiredFileTypes,
  skipSxWorkQuickComplete,
} = require('../helpers/crmTaskCompletionEvidence');
const { logKanbanDeadlineUnifiedHistory } = require('../helpers/crmKanbanDeadlineHistory');
const { isLostOrCancelledPipelineStage: orgReportStageIsLostOrCancelled } = require('../helpers/crmLostPipelineStage');
const {
  createCrmLeadTask,
  updateCrmLeadTask,
  deleteCrmLeadTask,
  restoreCrmTaskChecklistFromWorkshopTemplate,
} = require('../helpers/crmLeadTaskMutations');
const { attachAssigneesToCrmTasks } = require('../helpers/crmTaskAssignees');
const {
  templateItemAssigneePatch,
  isDefaultAssigneeIdsColumnError,
  normalizeTemplateItemAssigneeIds,
  primaryTemplateItemAssigneeId,
  applyAssigneesToInsertedCrmTasks,
} = require('../helpers/templateItemAssignees');
const { attachAssignmentIdsToCrmTasks } = require('../helpers/crmTaskAssignmentSync');
const {
  syncTaskAttachmentToAssignment,
  syncAllTaskArtifactsToAssignment,
  deleteMirroredAssignmentFileForTaskAttachment,
  fetchAssignmentForTask,
} = require('../helpers/crmTaskAssignmentArtifactSync');
const { createCrmAssignment } = require('../helpers/crmAssignmentMutations');
const {
  persistAssignmentNotification,
  buildAssignmentNotificationInsert,
  notifyNewCrmAssignmentAssignees,
  resolveAssignmentIdForTask,
} = require('../helpers/crmAssignmentNotifications');
const { fetchOrgActivityFeed } = require('../helpers/orgActivityFeed');
const { emitCrmTaskChanged } = require('../helpers/crmTaskRealtime');
const { normalizeTemplateChecklistForCrmTask } = require('../helpers/templateChecklistNormalize');
const { resolveExecutorCompanyId, isExecutorColumnError } = require('../helpers/crossCompanyWorkspace');
const { createNotification: createNotif, notifyMultiple: notifyMultipleShared } = require('../helpers/notifications');
const {
  resolveLeadCommentMentionIds,
  fetchLeadMentionMembers,
  logLeadCommentMentionActivity,
} = require('../helpers/crmLeadCommentMentions');
const {
  fetchCrmLeadCommentNotifyUserIds,
  notifyDealCommentMentions,
  notifyDealCommentParticipants,
  postCrmStageDefaultAssigneeComment,
} = require('../helpers/dealCommentNotifications');
const { fetchLeadCommentAudienceMembers } = require('../helpers/crmLeadCommentAudience');
const { userCanAccessCrmLeadAsParticipant, userCanAccessCrmLeadViaVisibility } = require('../helpers/crmLeadParticipantAccess');
const { isVptCompanyCommercialDocViewer } = require('../helpers/dealParticipantProduction');
const { DEFAULT_CHECKLISTS } = require('../helpers/defaultChecklists');
const { generateFlowTasks, generateStepTasks } = require('../helpers/generateFlowTasks');
const { autoCreateProjectFromWonDeal } = require('../helpers/autoDealWonProject');
const { isCrmDealAssigneeLocked, stripCrmAssigneeFromWonStageUpdates } = require('../helpers/crmDealAssigneeLock');
const {
  normalizeCrmStageDefaultAssigneeUserId,
  mergeCrmStageDefaultAssigneeIntoUpdates,
} = require('../helpers/crmPipelineStageAssignee');
const {
  syncCrmLeadSxPipelineFromProject,
  syncSxKanbanFromCrmProductionStage,
  emitCrmBadgeUpdateForProject,
  repairCrmDealPipelineDisplay,
} = require('../helpers/workshopKanban');
const {
  userSeesAllCrmDeals,
  userSeesAllCrmLeads,
  userSeesAllCrmDealsForScope,
  userSeesAllCrmLeadsForScope,
  normalizeCrmUserRole,
  isCrmCompanyAdminUser,
  isCrmRegionAdminUser,
  isCrmSystemAdminUser,
} = require('../helpers/crmAccessRoles');
const { isAdminLike, isSystemAdmin, isCrmModuleAdmin, isPlatformAdmin } = require('../helpers/adminRole');
const {
  getCrmLeadRegionConstraint,
  applyCrmLeadRegionFilterToQuery,
  assertLeadReadableByRegionScope,
  assertRegionBelongsToCompany,
  assertUserCanAssignCrmRegion,
  normalizeRegionIdList,
  resolveRpcRegionIdsForCrmList,
  userCanAssignAnyCrmRegion,
} = require('../helpers/crmRegionScope');
const {
  filterUserIdsForCrmLeadScopedNotification,
  crmTaskDeadlineModuleKey,
  ecosystemModuleKeyForCrmDeadline,
} = require('../helpers/deadlineModuleNotifications');
const {
  applyDefaultWorkshopTemplatesForNewProject,
  applyWorkshopTemplateToProject,
  applyAllActiveWorkshopTemplatesForArea,
} = require('../helpers/workshopApplyTemplates');
const {
  autoGenCrmTasksForNewLead,
  applyCrmTaskTemplatesToCompanyRegions,
  resyncCrmPipelineTasksForLead,
  ensureMissingCrmTasksForPipelineStage,
  ensureMissingCrmTasksForLead,
  filterCrmTasksForLeadType,
} = require('../helpers/autoGenCrmTasks');
const { normalizeTimestamp } = require('../helpers/normalizeTimestamp');
const { enforceQuotaForRequest, invalidateTenantUsageCache, resolveTenantIdForQuota } = require('../helpers/tenantQuotas');
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
} = require('../helpers/crmTaxonomyCache');
const { ensureDefaultCrmPipelineForCompany } = require('../helpers/ensureDefaultCrmPipeline');
const { getAppSettingValue, invalidateAppSettingKey } = require('../helpers/appSettingsCache');
const {
  attachLeadUserFlagsForList,
  setLeadFlag,
} = require('../helpers/crmLeadUserFlags');
const { createFulfillmentChildDeal, applyProductionTemplateToFulfillmentLead, applyProductionTemplatesOnPipelineEnter, ensureMissingSxTasksForLead } = require('../helpers/projectOrderFulfillment');
const { isPostgresUniqueViolation, nextTbProjectCode } = require('../helpers/projectCode');
const { validateProductionCompanyId } = require('../helpers/productionCompanyGate');
const { assertDealCrmManualStageChange } = require('../helpers/crmDealStageGate');
const { assertCrmStageAdvanceAllowed } = require('../helpers/crmTaskStageAdvanceGate');
const {
  assignProductionCompanyDealResponsibility,
  resolveProductionHandoverResponsibleUserId,
} = require('../helpers/productionHandoverSettings');
const { ensureDealLeadDocumentsForModuleTransition } = require('../helpers/ensureDealLeadDocumentsForModuleTransition');
const { assertDealResponsible, assertLeadDocumentOwner, logProjectFileActivity, logDealStageChangeComment, logDealDeadlineChangeComment, logDealActivityComment } = require('../helpers/projectFileActivity');
const { getLeadDocumentFieldsFromCrmTask, getDefaultCrmAttachmentShare } = require('../helpers/crmTaskLeadDocumentMeta');
const {
  getDefaultLeadDocumentShareForDeal,
  notifyProductionDocumentUploaded,
} = require('../helpers/crmDocumentCrossModule');
const {
  findChecklistItem,
  artifactNamePrefix,
  syncChecklistItemNotes,
  buildChecklistLeadDocumentRow,
  parseChecklist,
} = require('../helpers/crmChecklistArtifacts');
const { parseVietnameseMoney, parseVietnameseMeasure, parseExcelMoneyFromMappedColumn } = require('../helpers/excelVnNumbers');
const { snapshotOrderRowFromQuotation, mapQuotationItemsToOrderRows } = require('../helpers/orderFromQuotation');
const { syncQuotationDepositToDealAndProject } = require('../helpers/syncQuotationDepositToDealAndProject');
let autoFlowFns = {};
try { autoFlowFns = require('../helpers/autoFlow'); } catch (e) { console.warn('⚠️ autoFlow not loaded:', e.message); }
let misaService = null;
try { misaService = require('../services/misaService'); } catch (e) { console.warn('⚠️ misaService not loaded:', e.message); }
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
} = require('../helpers/zaloOa');
const { addPhoneToAutoLeadBlocklist } = require('../helpers/crmAutoLeadPhoneBlocklist');
const { pipeStaffLeadDealSummaryPdf, pipeStaffPipelineDetailPdf } = require('../helpers/staffLeadDealReportPdf');
const { pipeOrgOverviewReportPdf } = require('../helpers/orgOverviewReportPdf');

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
  const { forwardGeocode } = require('../helpers/forwardGeocode');
  const { inVietnam } = require('../helpers/geoBounds');
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
    if (io) io.emit('crm:dashboard_changed', payload || {});
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
    const { resolveCompanyIdForUser } = require('../middleware/auth');
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
  let result = await supabase.from('quotations').insert(row).select('*').single();
  if (result.error && isQuotationsSourceExcelColumnMissingError(result.error)) {
    console.warn(
      '[crm] quotations.source_excel_* chưa có trên DB — lưu không kèm file Excel. Chạy database/169_quotations_source_excel_file.sql rồi Reload schema (Supabase → Settings → API).',
    );
    result = await supabase.from('quotations').insert(stripQuotationsSourceExcelFields(row)).select('*').single();
  }
  return result;
}

async function updateQuotationRow(id, row) {
  let result = await supabase.from('quotations').update(row).eq('id', id).select('*').single();
  if (result.error && isQuotationsSourceExcelColumnMissingError(result.error)) {
    console.warn(
      '[crm] quotations.source_excel_* chưa có trên DB — cập nhật không kèm file Excel. Chạy database/169_quotations_source_excel_file.sql rồi Reload schema (Supabase → Settings → API).',
    );
    result = await supabase
      .from('quotations')
      .update(stripQuotationsSourceExcelFields(row))
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

const r = Router();
r.use(auth);

function crmExecutorFieldsFromTemplateItem(it, ownerCompanyId) {
  const execId = resolveExecutorCompanyId(it, ownerCompanyId);
  if (!execId || String(execId) === String(ownerCompanyId || '')) return { executor_company_id: null };
  return { executor_company_id: execId };
}

function toCrmTaskChecklist(raw, ownerCompanyId, templateItem) {
  const ckDefaultExec = crmExecutorFieldsFromTemplateItem(templateItem || {}, ownerCompanyId).executor_company_id;
  return normalizeTemplateChecklistForCrmTask(raw, ckDefaultExec);
}

// Auto-invalidate response cache cho mọi mutation CRM
r.use((req, res, next) => {
  if (req.method === 'GET') return next();
  const origJson = res.json.bind(res);
  res.json = function crmInvalidate(body) {
    if (res.statusCode < 400) {
      void rcInvalidateTags(['crm:list', 'crm:live']);
    }
    return origJson(body);
  };
  next();
});

// Debug: xác nhận backend đang chạy đúng bản code
// GET /api/crm/_version
r.get('/_version', (req, res) => {
  res.json({
    ok: true,
    routes_hint: ['GET /lead-types', 'POST /lead-types'],
    time: new Date().toISOString(),
  });
});

const CRM_LEAD_ID_IN_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Chặn NV truy cập lead/deal của người khác (GET/PUT/...) — path /leads/:uuid/... hoặc /deals/:uuid/... */
async function enforceCrmDealAssigneeAccess(req, res, next) {
  try {
    const p = req.path || '';
    const parts = p.split('/').filter(Boolean);
    const head = parts[0];
    if ((head !== 'leads' && head !== 'deals') || !parts[1] || !CRM_LEAD_ID_IN_PATH.test(parts[1])) return next();
    // Nhiệm vụ CRM (.../tasks/...): không chặn theo phụ trách — chỉ cần đăng nhập (auth).
    if (/\/tasks(\/|$)/.test(p)) return next();
    const leadId = parts[1];
    const { data: lead, error } = await supabase
      .from('crm_leads')
      .select('id, type, company_id, assigned_to, lead_owner_id, parent_lead_id, project_id')
      .eq('id', leadId)
      .maybeSingle();
    if (error || !lead) return next();
    const { companyInTenantContext } = require('../helpers/tenantScope');
    if (!companyInTenantContext(req, lead.company_id)) {
      return res.status(403).json({ error: 'Không có quyền truy cập dữ liệu hệ sinh thái khác' });
    }
    const uid = req.user?.userId;

    /** Deal con (fulfillment theo đơn): NV sale phụ trách deal gốc vẫn cần xem/sửa tasks của deal con */
    async function userOwnsDealViaAncestor(userId, row) {
      if (!userId || !row) return false;
      if (String(row.assigned_to || '') === String(userId)) return true;
      let cur = row;
      let g = 0;
      while (cur?.parent_lead_id && g < 8) {
        const { data: par } = await supabase
          .from('crm_leads')
          .select('id, type, assigned_to, lead_owner_id, parent_lead_id')
          .eq('id', cur.parent_lead_id)
          .maybeSingle();
        if (!par) break;
        if (par.type === 'deal' && String(par.assigned_to || '') === String(userId)) return true;
        cur = par;
        g += 1;
      }
      return false;
    }

    if (lead.type === 'deal') {
      if (userSeesAllCrmDeals(req.user?.role)) return next();
      if (!uid) {
        return res.status(403).json({ error: 'Bạn chỉ được xem/sửa deal mà bạn phụ trách.' });
      }
      const ok = await userOwnsDealViaAncestor(uid, lead)
        || await userCanAccessCrmLeadAsParticipant(supabase, uid, lead)
        || await userCanAccessCrmLeadViaVisibility(supabase, uid, lead);
      if (!ok) {
        return res.status(403).json({ error: 'Bạn chỉ được xem/sửa deal mà bạn phụ trách hoặc tham gia.' });
      }
      return next();
    }
    if (lead.type === 'lead') {
      if (userSeesAllCrmLeads(req.user?.role)) return next();
      const owns =
        uid &&
        (String(lead.assigned_to || '') === String(uid) || String(lead.lead_owner_id || '') === String(uid));
      const participant = uid && (
        await userCanAccessCrmLeadAsParticipant(supabase, uid, lead)
        || await userCanAccessCrmLeadViaVisibility(supabase, uid, lead)
      );
      if (!owns && !participant) {
        return res.status(403).json({ error: 'Bạn chỉ được xem/sửa lead mà bạn phụ trách hoặc tham gia.' });
      }
      return next();
    }
    return next();
  } catch (e) {
    return next(e);
  }
}

r.use(enforceCrmDealAssigneeAccess);

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
} = require('../helpers/crmReportDateBounds');

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
      const { isCrmAccountingUser } = require('../helpers/crmAccessRoles');
      const { applyAccountingCrmCompanyFilter } = require('../helpers/accountingScope');
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
  const { listCrmModuleCompanyIds } = require('../helpers/crmModuleCompanies');
  const crmCompanyIds = company_id ? null : await listCrmModuleCompanyIds();
  const rows = [];
  let from = 0;
  for (;;) {
    let q = supabase
      .from('crm_leads')
      .select('id, stage_id, estimated_value, probability, type, assigned_to, lead_owner_id, company_id, region_id, created_at, source_id, stage_entered_at, first_touch_time, lead_type_id, kanban_deadline_at')
      .eq('type', type)
      .is('parent_lead_id', null);
    if (company_id) {
      const { isCrmAccountingUser } = require('../helpers/crmAccessRoles');
      const { applyAccountingCrmCompanyFilter } = require('../helpers/accountingScope');
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
    const { listCrmModuleCompanyIds } = require('../helpers/crmModuleCompanies');
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
      .select('id, pipeline_id, stage_id, estimated_value, probability, type, created_at, stage_entered_at, lead_type_id, first_touch_time, assigned_to, lead_owner_id, company_id, region_id, source_id')
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
r.get('/kanban-rows', responseCache({ ttl: 10, scope: 'user', tags: ['crm:list'] }), async (req, res) => {
  try {
    const leadIds = parseLeadIdsCsvQuery(req.query.lead_ids, 50);
    if (!leadIds.length) return res.json({ data: [] });

    const sac = scopedAdminCompanyId(req);
    if (!userIsAdmin(req.user?.role) && !sac) {
      const cid = await requireUserCompanyIdResolved(req, res);
      if (!cid) return;
    }

    const lite = resolveCrmLeadsKanbanLite(req.query);
    const skipDeadline = resolveCrmLeadsSkipDeadline(req.query);
    let hydrated = await fetchCrmLeadsByIdsOrdered(leadIds, { skipEnrich: lite, lite });

    if (sac) {
      hydrated = hydrated.filter((r) => String(r.company_id || '') === String(sac));
    } else if (!userIsAdmin(req.user?.role)) {
      const { resolveCompanyIdForUser } = require('../middleware/auth');
      const cid = await resolveCompanyIdForUser(req.user?.userId);
      if (cid) hydrated = hydrated.filter((r) => String(r.company_id || '') === String(cid));
    }
    hydrated = hydrated.filter((r) => {
      const ar = assertLeadReadableByRegionScope(req, r);
      return ar.ok;
    });

    let page = attachLeadNewFlagForList(hydrated, req.user?.userId);
    if (!skipDeadline) page = await attachCrmNextOpenTaskDeadline(page);
    page = await attachLeadUserFlagsForList(page, req.user?.userId);
    res.json({ data: page });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Lỗi tải kanban-rows' });
  }
});

/** GET /crm/live-version — poll nhẹ cho dashboard (chỉ số v = ms) */
r.get('/live-version', responseCache({ ttl: 5, scope: 'company', tags: ['crm:live'] }), async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
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

    const v = await computeCrmLiveVersionMs(req, effectiveCompanyId || null, date_from, date_to);
    res.json({ v });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

/** GET /crm/reports/staff-lead-deal — BC nhân viên: số lead/deal & giá trị pipeline (ước tính) / chốt / thua theo người phụ trách */
const STAFF_LEAD_DEAL_REPORT_ROLES = new Set([
  'admin', 'manager', 'director', 'supervisor', 'superadmin', 'super_admin', 'region_admin',
  'platform_admin', 'sales_admin',
]);

const {
  DEFAULT_PIPELINE_STAGE_SLA_DAYS,
  normalizePipelineStageSlaDaysForDb,
  effectivePipelineStageSlaDays,
} = require('../helpers/crmPipelineSla');

function endOfCalendarDayAfterEntered(startIso, slaDays) {
  const base = startIso ? new Date(startIso) : new Date();
  const d = new Date(base);
  d.setDate(d.getDate() + Math.max(1, slaDays));
  d.setHours(23, 59, 59, 999);
  return d;
}

const CRM_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function fetchAllLeadsForSlaWatchlist(req, effectiveCompanyId, typeFilter, explicitRegionId = null) {
  const rows = [];
  let from = 0;
  const pageSize = 800;
  for (;;) {
    let q = supabase
      .from('crm_leads')
      .select('id, code, title, type, company_id, stage_id, assigned_to, lead_owner_id, stage_entered_at, created_at, region_id')
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

/** POST /crm/admin/sla-remind — Gửi TB nhắc nhở SLA giai đoạn tới NV phụ trách (không gộp vào TB nhắc hạn tự động) */
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
    'overdue_count', 'kpi_ledger_net', 'reception_overdue_count',
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
  if (st.is_lost || st.canonical_slug === 'lost' || st.deal_report_bucket === 'lost') {
    return { inDealTab: true, inCustomerTab: false };
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
  const isLost = !!st?.is_lost;
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
  const slaDays = effectivePipelineStageSlaDays(st.sla_days);
  if (slaDays == null) return false;
  const entered = row.stage_entered_at || row.created_at;
  if (!entered) return false;
  const dueAt = endOfCalendarDayAfterEntered(entered, slaDays);
  return dueAt.getTime() < asOfMs;
}

function orgReportBumpOpenOverdue(target, row, st, asOfMs = Date.now()) {
  if (orgReportStageIsClosed(st)) return;
  target.open_count += 1;
  if (orgReportIsSlaOverdue(row, st, asOfMs)) {
    target.overdue_count += 1;
  }
}

function orgReportOverdueRatePct(m) {
  const open = Number(m?.open_count) || 0;
  const overdue = Number(m?.overdue_count) || 0;
  if (!open) return null;
  return Math.round((overdue / open) * 1000) / 10;
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
  const { positiveNumberParam } = require('../helpers/kpiCalcParams');
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
  const total = (Number(m?.lead_count) || 0)
    + (Number(m?.deal_count) || 0)
    + (Number(m?.customer_order_count) || 0);
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

/** Tỉ lệ giá trị chốt / tổng GT deal trong kỳ (pipeline + đơn hàng khi tách tab). */
function orgReportDealCloseValueRatePct(m) {
  const dealValue = (Number(m?.deal_pipeline_value) || 0) + (Number(m?.customer_order_value) || 0);
  const closedValue = orgReportClosedWonValue(m);
  if (!dealValue) return null;
  return Math.round((closedValue / dealValue) * 1000) / 10;
}

function orgReportTotalDealCount(m) {
  return (Number(m?.deal_count) || 0) + (Number(m?.customer_order_count) || 0);
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

    orgReportBumpMetrics(summary, { value: v, isLost: !!st?.is_lost }, null);
    orgReportBumpMetrics(ensureBucket(companyMap, cid), { value: v, isLost: !!st?.is_lost }, null);
    orgReportBumpMetrics(ensureBucket(regionMap, rid), { value: v, isLost: !!st?.is_lost }, null);
    orgReportBumpMetrics(ensureBucket(employeeMap, uid), { value: v, isLost: !!st?.is_lost }, null);
    orgReportBumpMetrics(ensureBucket(sourceMap, sid), { value: v, isLost: !!st?.is_lost }, null);
    orgReportBumpMetrics(ensureBucket(leadTypeMap, ltKey), { value: v, isLost: !!st?.is_lost }, null);
    orgReportBumpOpenOverdue(summary, l, st, asOfMs);
    orgReportBumpOpenOverdue(ensureBucket(companyMap, cid), l, st, asOfMs);
    orgReportBumpOpenOverdue(ensureBucket(regionMap, rid), l, st, asOfMs);
    orgReportBumpOpenOverdue(ensureBucket(employeeMap, uid), l, st, asOfMs);
    orgReportBumpOpenOverdue(ensureBucket(sourceMap, sid), l, st, asOfMs);
    orgReportBumpOpenOverdue(ensureBucket(leadTypeMap, ltKey), l, st, asOfMs);
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
      orgReportBumpMetrics(ensureBucket(funnelMap, String(l.stage_id)), { value: v, isLost: !!st?.is_lost }, null);
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
    orgReportBumpOpenOverdue(summary, l, st, asOfMs);
    orgReportBumpOpenOverdue(ensureBucket(companyMap, cid), l, st, asOfMs);
    orgReportBumpOpenOverdue(ensureBucket(regionMap, rid), l, st, asOfMs);
    orgReportBumpOpenOverdue(ensureBucket(employeeMap, uid), l, st, asOfMs);
    orgReportBumpOpenOverdue(ensureBucket(sourceMap, sid), l, st, asOfMs);
    orgReportBumpOpenOverdue(ensureBucket(leadTypeMap, leadTypeKeyForRow(l)), l, st, asOfMs);
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
      timelineMap[ck].deal_count += dealKhSplit ? (splitBuckets.inDealTab ? 1 : 0) : 1;
      if (dealKhSplit && splitBuckets.inCustomerTab) {
        timelineMap[ck].customer_order_count = (timelineMap[ck].customer_order_count || 0) + 1;
      }
      timelineMap[ck].pipeline_value += v;
      if (isClosedWon) timelineMap[ck].won_value += v;
    }
  }

  const summaryFinal = {
    ...summary,
    pipeline_value: summary.lead_pipeline_value + summary.deal_pipeline_value + (summary.customer_order_value || 0),
    conversion_rate: orgReportConversionRate(
      orgReportClosedWonDealCount(summary),
      (summary.deal_count || 0) + (summary.customer_order_count || 0),
    ),
    quote_win_rate_pct: orgReportQuoteWinRatePct(summary),
    quote_close_value_rate_pct: orgReportQuoteValueCloseRatePct(summary),
    deal_close_value_rate_pct: orgReportDealCloseValueRatePct(summary),
    overdue_rate_pct: orgReportOverdueRatePct(summary),
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
    const inPipe = patchDeal.inDealTab !== false;
    const inCust = !!patchDeal.inCustomerTab;
    if (inPipe) {
      target.deal_count += 1;
      target.deal_pipeline_value += patchDeal.value;
      if (patchDeal.isLost) {
        target.lost_deal_count += 1;
        target.lost_value += patchDeal.value;
      }
      target.expected_value += patchDeal.expected_value || 0;
      target.weighted_value += patchDeal.weighted_value || 0;
    }
    if (inCust) {
      target.customer_order_count += 1;
      target.customer_order_value += patchDeal.value || 0;
    }
    if (patchDeal.quote_deal_count) {
      target.quote_deal_count += 1;
      target.quote_value += patchDeal.quote_value || 0;
    }
    if (patchDeal.isWon) {
      target.won_deal_count += 1;
      target.won_value += patchDeal.value;
      target.won_or_later_deal_count += patchDeal.won_or_later_deal_count || 1;
      target.won_or_later_value += patchDeal.won_or_later_value || patchDeal.value;
    }
    target.completed_deal_count += patchDeal.completed_deal_count || 0;
    target.completed_value += patchDeal.completed_value || 0;
  }
}

/** Báo cáo phân cấp công ty / khu vực / nhân viên */
async function computeOrgOverviewReportData(req, res) {
  try {
    const roleNorm = normalizeCrmUserRole(req.user?.role);
    if (!STAFF_LEAD_DEAL_REPORT_ROLES.has(roleNorm)) {
      res.status(403).json({ error: 'Không có quyền xem báo cáo này' });
      return null;
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

    // BC tổ chức = phạm vi công ty/phòng/khu vực — không lọc assigned_to cá nhân
    // (tránh bot/lịch chạy bằng platform_admin → chỉ deal của 1 người → toàn số 0).
    const dealAssigneeOnly = null;
    const leadAssigneeOnly = null;

    const assignedToQuery = uuidQueryOrNull(req.query.assigned_to);
    const assignedToUser = assignedToQuery || null;

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
      const { evaluateRequiredEvidenceTypes } = require('../helpers/evidenceFileTypes');
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
            (m.deal_count || 0) + (m.customer_order_count || 0),
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

/** GET /crm/reports/org-overview — BC phân cấp công ty / khu vực / nhân viên */
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

/** GET /crm/reports/org-overview/survey-visits — sự kiện đi khảo sát trong kỳ (xuất Excel) */
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

/** GET /crm/reports/org-activity-feed — hoạt động CRM thực theo sự kiện (stage, tạo mới, ghi chú…) */
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

/** GET /crm/reports/org-overview/export.pdf */
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

/** GET /crm/reports/staff-lead-deal/:userId/pipelines — chi tiết theo từng pipeline (giá trị ước tính) */
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

const DEAL_REPORT_BUCKET_VALUES = new Set(['pre_contract', 'implementation', 'completed', 'lost']);

/** GET /crm/settings/deal-stage-report-buckets — cột Deal → nhóm BC Lead/Deal theo NV */
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

/** PUT /crm/settings/deal-stage-report-buckets — cập nhật nhóm báo cáo cho từng cột Deal */
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

r.get('/dashboard', responseCache({ ttl: 30, scope: 'user', tags: ['crm:list'] }), async (req, res) => {
  try {
    const { type = 'lead', company_id, date_from, date_to } = req.query; // 'lead' or 'deal'
    const rawC = company_id && String(company_id).trim() ? String(company_id).trim() : null;
    let effectiveCompanyId = rawC;
    const sacDash = scopedAdminCompanyId(req);
    if (sacDash) {
      effectiveCompanyId = sacDash;
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      effectiveCompanyId = cid;
    }

    // Pipeline stages for the specified type — chỉ pipeline mặc định của công ty (tránh trộn cột nhiều pipeline)
    let stagesQuery = supabase
      .from('crm_pipeline_stages')
      .select('id, name, color, icon, order_index, is_won, is_lost, pipeline_type, default_probability')
      .eq('is_active', true)
      .eq('pipeline_type', type)
      .order('order_index');
    if (effectiveCompanyId) {
      const { data: defPl } = await supabase
        .from('crm_pipelines')
        .select('id')
        .eq('company_id', effectiveCompanyId)
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('created_at')
        .limit(1)
        .maybeSingle();
      if (defPl?.id) stagesQuery = stagesQuery.eq('pipeline_id', defPl.id);
    }
    const { data: stages } = await stagesQuery;

    const dealAssigneeOnly =
      type === 'deal' && req.user?.userId && !userSeesAllCrmDealsForScope(req.user) ? req.user.userId : null;
    const leadAssigneeOnly =
      type === 'lead' && req.user?.userId && !userSeesAllCrmLeadsForScope(req.user) ? req.user.userId : null;
    const selfAssigneeOnly = type === 'deal' ? dealAssigneeOnly : leadAssigneeOnly;
    const queryAssigneeUuid = uuidQueryOrNull(req.query.assigned_to);
    const canUseAssigneeQuery =
      type === 'deal' ? userSeesAllCrmDealsForScope(req.user) : userSeesAllCrmLeadsForScope(req.user);
    const assigneeFromQuery =
      !selfAssigneeOnly && canUseAssigneeQuery && queryAssigneeUuid ? queryAssigneeUuid : null;
    const assigned_to_only = selfAssigneeOnly || assigneeFromQuery || null;
    const light = req.query.light === '1' || req.query.light === 'true';
    const minimal = req.query.minimal === '1' || req.query.minimal === 'true';
    const phone_filter = req.query.phone_filter;
    const explicitRegionId = uuidQueryOrNull(req.query.region_id);
    const canUseLight =
      light &&
      !crmListUsesLegacyFilters({
        ...req.query,
        type,
        company_id: effectiveCompanyId || undefined,
        assigned_to: assigned_to_only || undefined,
        date_from,
        date_to,
        phone_filter,
      });

    let leads = [];
    let stageStats;
    let totalItems;
    let wonCountLight = null;

    if (canUseLight) {
      const lightStats = await computeCrmDashboardLightStats(req, type, {
        effectiveCompanyId,
        region_id: explicitRegionId || undefined,
        stages: stages || [],
        assigned_to_only,
        date_from,
        date_to,
        phone_filter,
      });
      stageStats = lightStats.stageStats;
      totalItems = lightStats.totalItems;
      wonCountLight = lightStats.wonCount;
    } else {
      leads = await fetchCrmLeadsForDashboardBatched(type, {
      company_id: effectiveCompanyId || undefined,
        region_id: explicitRegionId || undefined,
      date_from,
      date_to,
      assigned_to_only,
      req,
    });
      stageStats = (stages || []).map((s) => {
        const stageLeads = (leads || []).filter((l) => l.stage_id === s.id);
      const probPct = (l) => {
        const raw = l.probability;
        const fallback = s.default_probability;
        const p = raw != null && raw !== '' ? Number(raw) : (fallback != null && fallback !== '' ? Number(fallback) : 0);
        return Number.isFinite(p) ? Math.max(0, Math.min(100, p)) : 0;
      };
      return {
        ...s,
        count: stageLeads.length,
        value: stageLeads.reduce((sum, l) => sum + (l.estimated_value || 0), 0),
        weighted: stageLeads.reduce((sum, l) => sum + (l.estimated_value || 0) * probPct(l) / 100, 0),
      };
    });
      totalItems = (leads || []).length;
    }

    const leadIdsScope = canUseLight
      ? parseLeadIdsCsvQuery(req.query.lead_ids, 500)
      : (leads || []).map((l) => l.id).filter(Boolean);
    let overdue_tasks = 0;
    if (!minimal) {
    try {
      overdue_tasks = await countOpenOverdueCrmTasksForLeadIds(leadIdsScope);
    } catch (e) {
      console.warn('[crm/dashboard] overdue_tasks count:', e.message);
      }
    }

    const rawLedgerPs = req.query.ledger_period_start && String(req.query.ledger_period_start).trim();
    const ledgerPeriodStart = (rawLedgerPs && /^\d{4}-\d{2}-\d{2}$/.test(rawLedgerPs.slice(0, 10)))
      ? rawLedgerPs.slice(0, 10)
      : defaultKpiLedgerMonthStartYmd();
    let ledgerNetByLead = {};
    if (!minimal) {
    try {
      if (leadIdsScope.length) {
        ledgerNetByLead = await sumCrmKpiLedgerNetByLeadIds(leadIdsScope, ledgerPeriodStart, 'monthly', {
          userId: assigned_to_only || null,
        });
      }
    } catch (e) {
      console.warn('[crm/dashboard] kpi ledger sums:', e.message);
      }
    }
    const kpiLedgerMonthNetSum = Math.round(
      Object.values(ledgerNetByLead).reduce((a, b) => a + Number(b || 0), 0) * 100,
    ) / 100;

    // KPIs split by type
    const wonItems = canUseLight
      ? { length: wonCountLight || 0 }
      : (leads || []).filter((l) => {
          const st = (stages || []).find((s) => s.id === l.stage_id);
      return st?.is_won;
    });
    const totalValue = canUseLight ? 0 : (leads || []).reduce((s, l) => s + (l.estimated_value || 0), 0);
    const wonValue = canUseLight
      ? 0
      : (Array.isArray(wonItems) ? wonItems : []).reduce((s, l) => s + (l.estimated_value || 0), 0);
    const wonItemCount = Array.isArray(wonItems) ? wonItems.length : (wonItems?.length ?? 0);

    let kpis = {};
    if (type === 'lead') {
      let conversionRate = 0;
      let nDeals = 0;
      if (!minimal) {
      const uid = req.user?.userId;
      let allLeadsQ = supabase.from('crm_leads').select('*', { count: 'exact', head: true }).eq('type', 'lead');
      let dealsConvertedQ = supabase.from('crm_leads').select('*', { count: 'exact', head: true }).eq('type', 'deal');
      if (effectiveCompanyId) {
        allLeadsQ = allLeadsQ.eq('company_id', effectiveCompanyId);
        dealsConvertedQ = dealsConvertedQ.eq('company_id', effectiveCompanyId);
      }
      allLeadsQ = applyCrmLeadRegionFilterToQuery(allLeadsQ, req);
      dealsConvertedQ = applyCrmLeadRegionFilterToQuery(dealsConvertedQ, req);
      if (uid && !userSeesAllCrmLeadsForScope(req.user)) {
        allLeadsQ = allLeadsQ.or(`assigned_to.eq.${uid},lead_owner_id.eq.${uid}`);
      }
      if (uid && !userSeesAllCrmDealsForScope(req.user)) {
        dealsConvertedQ = dealsConvertedQ.eq('assigned_to', uid);
      }
      const { count: allLeadsCount } = await allLeadsQ;
      const { count: dealsConvertedCount } = await dealsConvertedQ;
      const nLeads = allLeadsCount ?? 0;
        nDeals = dealsConvertedCount ?? 0;
        conversionRate = nLeads > 0 ? Math.round((nDeals / nLeads) * 100) : 0;
      }
      kpis = {
        total_leads: totalItems,
        converted_to_deals: nDeals,
        conversion_rate: conversionRate,
        total_value: totalValue,
        conversion_value: wonValue,
        overdue_tasks,
        kpi_ledger_month_net_sum: kpiLedgerMonthNetSum,
        kpi_ledger_period_start: ledgerPeriodStart,
        ...(minimal ? { deferred: true } : {}),
      };
    } else {
      // Deal KPIs
      kpis = {
        total_deals: totalItems,
        won_deals: wonItemCount,
        won_rate: totalItems > 0 ? Math.round(wonItemCount / totalItems * 100) : 0,
        total_value: totalValue,
        won_value: wonValue,
        overdue_tasks,
        kpi_ledger_month_net_sum: kpiLedgerMonthNetSum,
        kpi_ledger_period_start: ledgerPeriodStart,
        ...(minimal ? { deferred: true } : {}),
      };
    }

    // Recent quotations (only for deal dashboard)
    let recentQuotes = [];
    if (type === 'deal' && !minimal) {
      let qQ = supabase
        .from('quotations')
        .select('id, code, title, total, status, created_at, customer_name')
        .order('created_at', { ascending: false })
        .limit(5);
      if (effectiveCompanyId) qQ = qQ.eq('company_id', effectiveCompanyId);
      if (!userIsAdmin(req.user?.role) && req.user?.userId) qQ = qQ.eq('created_by', req.user.userId);
      const { data } = await qQ;
      recentQuotes = data || [];
    }

    // Recent orders (only for deal dashboard)
    let recentOrders = [];
    if (type === 'deal' && !minimal) {
      let qO = supabase
        .from('orders')
        .select('id, code, title, total, status, payment_status, created_at, customer_name')
        .order('created_at', { ascending: false })
        .limit(5);
      if (effectiveCompanyId) qO = qO.eq('company_id', effectiveCompanyId);
      const { data } = await qO;
      recentOrders = data || [];
    }

    res.json({
      pipeline: stageStats,
      kpis,
      ledger_net_by_lead: ledgerNetByLead,
      recent_quotations: recentQuotes,
      recent_orders: recentOrders,
      light: canUseLight,
      minimal: !!minimal,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

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
r.get('/ledger-net-by-leads', responseCache({ ttl: 30, scope: 'user', tags: ['crm:list'] }), async (req, res) => {
  try {
    const leadIds = parseLeadIdsCsvQuery(req.query.lead_ids, 80);
    const payload = await resolveCrmLedgerNetByLeadIdsPayload(req, leadIds, {
      ledger_period_start: req.query.ledger_period_start,
      assigned_to: req.query.assigned_to,
      type: req.query.type,
    });
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /crm/ledger-net-by-leads — batch lead_ids trong body (tránh URL quá dài). */
r.post('/ledger-net-by-leads', async (req, res) => {
  try {
    const leadIds = parseLeadIdsFromBody(req.body, 500);
    const payload = await resolveCrmLedgerNetByLeadIdsPayload(req, leadIds, {
      ledger_period_start: req.body?.ledger_period_start,
      assigned_to: req.body?.assigned_to,
      type: req.body?.type,
    });
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Doanh thu ký HĐ (ước tính) theo tháng — lọc theo `entered_at` khi deal vào giai đoạn canonical `contract_signed` (khác Kanban lọc `created_at`). */
r.get('/contract-signed-revenue', async (req, res) => {
  try {
    const rawC = req.query.company_id && String(req.query.company_id).trim() ? String(req.query.company_id).trim() : null;
    let effectiveCompanyId = rawC;
    const sac = scopedAdminCompanyId(req);
    if (sac) {
      effectiveCompanyId = sac;
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      effectiveCompanyId = cid;
    }

    const dfRaw = req.query.date_from && String(req.query.date_from).trim();
    const dtRaw = req.query.date_to && String(req.query.date_to).trim();
    const dateFrom = dfRaw && /^\d{4}-\d{2}-\d{2}$/.test(dfRaw.slice(0, 10)) ? dfRaw.slice(0, 10) : null;
    const dateTo = dtRaw && /^\d{4}-\d{2}-\d{2}$/.test(dtRaw.slice(0, 10)) ? dtRaw.slice(0, 10) : null;

    const assignedToFromQuery =
      req.query.assigned_to && String(req.query.assigned_to).trim() ? String(req.query.assigned_to).trim() : null;
    const dealSelfOnly =
      req.user?.userId && !userSeesAllCrmDealsForScope(req.user) ? req.user.userId : null;
    const effectiveAssignee = dealSelfOnly || assignedToFromQuery || null;

    let windowCapped = false;
    let enteredFromIso = dateFrom ? `${dateFrom}T00:00:00.000Z` : null;
    let enteredToIso = dateTo ? `${dateTo}T23:59:59.999Z` : null;
    if (!enteredFromIso && !enteredToIso) {
      const roll = new Date();
      roll.setUTCMonth(roll.getUTCMonth() - 24);
      enteredFromIso = roll.toISOString();
      windowCapped = true;
    }

    const numEv = (x) => {
      const n = Number(x);
      return Number.isFinite(n) ? n : 0;
    };
    const utcMonthKey = (iso) => {
      if (!iso) return null;
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return null;
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    };

    const PAGE = 1000;
    const MAX_PAGES = 500;
    const histRows = [];
    for (let page = 0, from = 0; page < MAX_PAGES; page += 1, from += PAGE) {
      let hq = supabase
        .from('crm_lead_stage_history')
        .select('lead_id, entered_at')
        .eq('to_canonical_slug', 'contract_signed')
        .eq('pipeline_type', 'deal');
      if (enteredFromIso) hq = hq.gte('entered_at', enteredFromIso);
      if (enteredToIso) hq = hq.lte('entered_at', enteredToIso);
      const { data, error } = await hq.range(from, from + PAGE - 1).order('entered_at', { ascending: true });
      if (error) throw error;
      const chunk = data || [];
      histRows.push(...chunk);
      if (chunk.length < PAGE) break;
    }

    const leadIds = [...new Set(histRows.map((h) => h.lead_id).filter(Boolean))];
    const evByLeadId = new Map();
    const CH = 200;
    for (let i = 0; i < leadIds.length; i += CH) {
      const part = leadIds.slice(i, i + CH);
      let lq = supabase
        .from('crm_leads')
        .select('id, estimated_value, company_id, assigned_to')
        .eq('type', 'deal')
        .in('id', part);
      if (effectiveCompanyId) lq = lq.eq('company_id', effectiveCompanyId);
      lq = applyCrmLeadRegionFilterToQuery(lq, req);
      if (effectiveAssignee) lq = lq.eq('assigned_to', effectiveAssignee);
      const { data: leadsChunk, error: le } = await lq;
      if (le) throw le;
      for (const L of leadsChunk || []) {
        if (L?.id) evByLeadId.set(String(L.id), numEv(L.estimated_value));
      }
    }

    const byMonthMap = Object.create(null);
    for (const h of histRows) {
      const lid = h.lead_id != null ? String(h.lead_id) : '';
      if (!lid || !evByLeadId.has(lid)) continue;
      const m = utcMonthKey(h.entered_at);
      if (!m) continue;
      if (!byMonthMap[m]) byMonthMap[m] = { total: 0, ids: new Set() };
      if (byMonthMap[m].ids.has(lid)) continue;
      byMonthMap[m].ids.add(lid);
      byMonthMap[m].total += evByLeadId.get(lid);
    }

    const by_month = Object.keys(byMonthMap)
      .sort()
      .map((month) => ({
        month,
        total: Math.round(byMonthMap[month].total * 100) / 100,
        deal_count: byMonthMap[month].ids.size,
      }));
    const total_value = Math.round(by_month.reduce((s, r) => s + r.total, 0) * 100) / 100;

    res.json({
      by_month,
      total_value,
      window_capped: windowCapped,
      date_from: dateFrom,
      date_to: dateTo,
    });
  } catch (e) {
    console.error('GET /crm/contract-signed-revenue:', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINES — Ống bán hàng theo Công ty
// ═══════════════════════════════════════════════════════════════════════════
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

    invalidatePipelinesAndStages();
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
    invalidatePipelinesAndStages();
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
    invalidatePipelinesAndStages();
    res.json({ message: 'Đã xóa pipeline' });
  } catch (e) {
    if (respondIfCrmPipelinesTableMissing(res, e)) return;
    res.status(500).json({ error: crmRouteErrorText(e) || 'Lỗi server' });
  }
});

// Copy pipeline (clone stages) — admin only
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

    invalidatePipelinesAndStages();
    res.status(201).json({ pipeline: created, stages_copied: stages.length });
  } catch (e) {
    if (respondIfCrmPipelinesTableMissing(res, e)) return;
    res.status(500).json({ error: crmRouteErrorText(e) || e.message || 'Lỗi server' });
  }
});

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
    invalidatePipelinesAndStages();
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
    invalidatePipelinesAndStages();
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * Liệt kê các cột Production Pipeline đang map về cột CRM này (qua crm_target_stage_id).
 * Phục vụ UI «Gán nhanh cột SX» trong CRM Settings.
 */
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

/**
 * Bulk-gán nhiều cột production_pipeline_stages vào cột CRM này (set crm_target_stage_id).
 * Body: { production_pipeline_stage_ids: string[], replace_existing?: boolean }
 *  - replace_existing=true: cột nào trước đây gán về stage này nhưng KHÔNG có trong danh sách mới
 *    sẽ được đặt lại crm_target_stage_id = null (bỏ gán).
 */
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
    invalidatePipelinesAndStages();
    res.json({ message: 'Đã xóa' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// LEAD/DEAL TYPES — Phân loại theo Công ty
// ═══════════════════════════════════════════════════════════════════════════
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

// ─── Người giới thiệu (theo công ty) ─────────────────────────────────────────
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
    const { listCrmReferrers } = require('../helpers/crmReferrers');
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
    const { upsertCrmReferrer, normalizeReferrerName } = require('../helpers/crmReferrers');
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

// Reorder pipeline stages
r.put('/pipeline-stages-reorder', async (req, res) => {
  try {
    const { stages } = req.body; // [{ id, order_index }]
    for (const s of stages || []) {
      await supabase.from('crm_pipeline_stages').update({ order_index: s.order_index }).eq('id', s.id);
    }
    invalidatePipelinesAndStages();
    res.json({ message: 'Đã sắp xếp lại' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ ZALO OA — Gửi tin qua SĐT (cấu hình + test) ═══
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

// ═══ Zalo OA — Xem trước + gửi thủ công khi deal ở cột «Hoàn thành» ═══
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

/** Điền template_data theo object mẫu (key) + dữ liệu deal — dùng trước khi gửi Zalo thủ công */
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

// ═══════════════════════════════════════════════════════════════════════════
// EMPLOYEES BY COMPANY — Lọc nhân viên theo công ty của user đăng nhập
// Chỉ hiển thị nhân viên thuộc phòng ban kinh doanh (sales) của công ty đó
// ═══════════════════════════════════════════════════════════════════════════
r.get('/employees-by-company', responseCache({ ttl: 120, scope: 'company', tags: ['orgtree'] }), async (req, res) => {
  try {
    const userId = req.user.userId;
    const { company_id: queryCompanyId } = req.query;
    const forModuleRaw = String(req.query?.for_module || 'crm').trim().toLowerCase();
    const forModule = ['crm', 'production', 'logistics', 'all'].includes(forModuleRaw) ? forModuleRaw : 'crm';

    const sacEmp = scopedAdminCompanyId(req);
    // Resolve company_id: admin gắn công ty → chỉ công ty đó; khác → query / user / department
    let companyId = sacEmp || queryCompanyId;
    if (!companyId) {
      const { data: userData } = await supabase.from('users')
        .select('department_id, company_id')
        .eq('id', userId).single();
      companyId = userData?.company_id || null;
      if (!companyId && userData?.department_id) {
        const { data: deptData } = await supabase.from('departments')
          .select('company_id')
          .eq('id', userData.department_id).single();
        companyId = deptData?.company_id;
      }
    }

    if (!companyId) {
      return res.json({ users: [], departments: [], company_id: null });
    }

    // Lọc phòng ban theo module để picker phụ trách chỉ hiện đúng đội.
    const { data: allDepts } = await supabase.from('departments')
      .select('id, name, color, company_id')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('name');

    const MODULE_DEPT_KEYWORDS = {
      crm: ['kinh doanh', 'sales', 'cskh', 'marketing', 'tư vấn', 'chăm sóc', 'thương mại', 'phát triển'],
      production: ['sản xuất', 'xuong', 'xưởng', 'kỹ thuật', 'ky thuat', 'gia công', 'gia cong', 'thi công', 'thi cong'],
      logistics: ['logistics', 'vận chuyển', 'van chuyen', 'giao hàng', 'giao hang', 'lắp đặt', 'lap dat', 'kho'],
    };
    const moduleKeywords = MODULE_DEPT_KEYWORDS[forModule] || MODULE_DEPT_KEYWORDS.crm;
    const moduleDepts = forModule === 'all'
      ? (allDepts || [])
      : (allDepts || []).filter((d) => {
        const lowerName = (d.name || '').toLowerCase();
        return moduleKeywords.some((kw) => lowerName.includes(kw));
      });

    // Nếu chưa map được theo keyword module → fallback tất cả phòng ban công ty.
    const targetDepts = forModule === 'all'
      ? (allDepts || [])
      : (moduleDepts.length > 0 ? moduleDepts : (allDepts || []));
    const deptIds = targetDepts.map(d => d.id);

    let userRows = [];
    if (deptIds.length) {
      const { data: users } = await supabase.from('users')
        .select('id, full_name, email, phone, avatar, role, department_id, position')
        .in('department_id', deptIds)
        .eq('is_active', true)
        .order('full_name');
      userRows = users || [];
    }

    // SX/VC/all: bổ sung NV gắn trực tiếp company_id (có thể không thuộc phòng ban keyword).
    if (forModule === 'production' || forModule === 'logistics' || forModule === 'all') {
      const { loadUsersForProductionCompany } = require('../helpers/productionWorkshopTypeStaff');
      const directUsers = await loadUsersForProductionCompany(companyId);
      const seen = new Set(userRows.map((u) => u.id));
      for (const u of directUsers) {
        if (!u?.id || seen.has(u.id)) continue;
        seen.add(u.id);
        userRows.push({
          id: u.id,
          full_name: u.full_name,
          email: u.email,
          phone: null,
          avatar: null,
          role: u.role,
          department_id: u.department?.id ?? null,
          position: null,
        });
      }
      userRows.sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || ''), 'vi'));
    }

    if (!userRows.length) {
      return res.json({ users: [], departments: targetDepts, company_id: companyId });
    }

    const userIds = userRows.map((u) => u.id).filter(Boolean);
    const regionByUser = {};
    if (userIds.length) {
      const { data: urRows } = await supabase
        .from('user_company_regions')
        .select('user_id, region_id')
        .in('user_id', userIds);
      for (const row of urRows || []) {
        if (!row.user_id) continue;
        if (!regionByUser[row.user_id]) regionByUser[row.user_id] = [];
        regionByUser[row.user_id].push(row.region_id);
      }
    }
    for (const u of userRows) {
      u.crm_region_ids = normalizeRegionIdList(regionByUser[u.id] || []);
    }

    res.json({
      users: userRows,
      departments: targetDepts,
      company_id: companyId,
      for_module: forModule,
      is_module_filtered: forModule !== 'all' && moduleDepts.length > 0,
    });
  } catch (e) {
    console.error('employees-by-company error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// SOURCES — bao gồm nguồn thông thường + FB pages gộp
// ═══════════════════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════════════════
// SOURCE CATEGORIES — Phân loại nguồn (chung / theo công ty)
// ═══════════════════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════════════════
// SOURCES — Tạo / sửa (admin)
// ═══════════════════════════════════════════════════════════════════════════
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

r.get('/leads/scan-duplicates', async (req, res) => {
  try {
    const uid = req.user?.userId;
    const scanSelect =
      'id, code, title, type, customer_id, estimated_value, created_at, updated_at, stage_id, assigned_to, lead_owner_id, source_id, customer:customers(id, full_name, phone, email), stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, color, icon), assignee:users!crm_leads_assigned_to_fkey(id, full_name), source:crm_sources(id, name, icon)';
    const seeAllLeads = !uid || userSeesAllCrmLeads(req.user.role);
    const seeAllDeals = !uid || userSeesAllCrmDeals(req.user.role);

    let duplicateIds = null;
    const pgDup = await pgCrmDuplicateLeadIds({ uid, seeAllLeads, seeAllDeals });
    if (pgDup) {
      duplicateIds = pgDup.leadIds;
    } else {
      const liteRows = await fetchCrmLeadsLiteForDuplicateScan({ uid, seeAllLeads, seeAllDeals });
      duplicateIds = duplicateLeadIdsFromLiteRows(liteRows);
    }

    if (!duplicateIds.length) {
      return res.json({ groups: [], total_groups: 0, total_duplicates: 0 });
    }

    const leads = await hydrateScanDuplicateLeads(duplicateIds, scanSelect);

    const { data: fbContacts } = await supabase.from('facebook_contacts')
      .select('id, psid, lead_id, fb_name, fb_profile_pic, page_id')
      .in('lead_id', duplicateIds);

    const leadFbMap = {};
    (fbContacts || []).forEach((fc) => {
      if (!leadFbMap[fc.lead_id]) leadFbMap[fc.lead_id] = [];
      leadFbMap[fc.lead_id].push(fc);
    });

    res.json(buildScanDuplicateGroups(leads, leadFbMap));
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
    const { enrichCrmLeadsWithProductionStaff } = require('../helpers/productionWorkshopTypeStaff');
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
    const { enrichCrmLeadsWithProductionStaff } = require('../helpers/productionWorkshopTypeStaff');
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
r.get('/leads/picker', async (req, res) => {
  try {
    const type = req.query.type === 'lead' ? 'lead' : 'deal';
    const q = String(req.query.q || '').trim();
    const customerId = uuidQueryOrNull(req.query.customer_id);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 50);

    // crm_leads không có cột `status` — trạng thái suy ra từ stage / actual_close_date.
    let query = supabase
      .from('crm_leads')
      .select(
        'id, code, title, type, stage_id, company_id, region_id, customer_id, ' +
          'assigned_to, lead_owner_id, estimated_value, created_at, actual_close_date, ' +
          'customer:customers(id, full_name, phone), ' +
          'company:companies!crm_leads_company_id_fkey(id, name, short_name), ' +
          'region:company_regions!crm_leads_region_id_fkey(id, name, code), ' +
          'assignee:users!crm_leads_assigned_to_fkey(id, full_name, email)',
      )
      .eq('type', type)
      .order('updated_at', { ascending: false })
      .limit(limit);

    // Scope theo công ty: admin công ty / nhân viên thường khoá theo company_id của user.
    const sac = scopedAdminCompanyId(req);
    if (sac) {
      query = query.eq('company_id', sac);
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      query = query.eq('company_id', cid);
    } else if (uuidQueryOrNull(req.query.company_id)) {
      query = query.eq('company_id', uuidQueryOrNull(req.query.company_id));
    }

    // Scope theo khu vực
    query = applyCrmLeadRegionFilterToQuery(query, req);
    if (uuidQueryOrNull(req.query.region_id)) {
      query = query.eq('region_id', uuidQueryOrNull(req.query.region_id));
    }

    if (customerId) query = query.eq('customer_id', customerId);

    if (q) {
      // Search theo code / title / SĐT / tên KH — crm_leads.phone hầu như luôn NULL,
      // SĐT thật nằm ở customers.phone qua customer_id nên cần tìm thêm customer_id khớp.
      const safe = q.replace(/[(),]/g, ' ').replace(/\s+/g, '%');
      const { data: custMatchRows } = await supabase
        .from('customers')
        .select('id')
        .or(`phone.ilike.%${safe}%,full_name.ilike.%${safe}%`)
        .limit(1000);
      const custMatchIds = (custMatchRows || []).map((r) => r.id);
      const orParts = [`code.ilike.%${safe}%`, `title.ilike.%${safe}%`, `phone.ilike.%${safe}%`];
      if (custMatchIds.length) orParts.push(`customer_id.in.(${custMatchIds.join(',')})`);
      query = query.or(orParts.join(','));
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({
      type,
      total: (data || []).length,
      results: (data || []).map((l) => ({
        id: l.id,
        code: l.code,
        title: l.title,
        type: l.type,
        is_closed: !!l.actual_close_date,
        stage_id: l.stage_id,
        company_id: l.company_id,
        company_name: l.company?.short_name || l.company?.name || null,
        region_id: l.region_id,
        region_name: l.region?.name || null,
        customer_id: l.customer_id,
        customer_name: l.customer?.full_name || null,
        customer_phone: l.customer?.phone || null,
        assigned_to: l.assigned_to,
        assignee_name: l.assignee?.full_name || null,
        estimated_value: l.estimated_value || 0,
        created_at: l.created_at,
      })),
    });
  } catch (e) {
    console.error('[leads/picker]', e);
    res.status(500).json({ error: e.message || 'Lỗi tìm deal' });
  }
});

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
      const { resolveCompanyIdForUser } = require('../middleware/auth');
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
r.get('/stage-counts', responseCache({ ttl: 90, scope: 'user', tags: ['crm:list'] }), async (req, res) => {
  try {
    const ctx = await resolveCrmLeadsMergedQuery(req, res);
    if (!ctx) return;
    const { type, mergedQuery, rpcAssigneeStrict, rpcRegionIds } = ctx;
    if (crmListUsesLegacyFilters(mergedQuery)) {
      return res.status(400).json({ error: 'Bộ lọc hiện tại chưa hỗ trợ stage-counts batch. Dùng GET /crm/leads từng cột.' });
    }

    const stages = await resolveKanbanStagesForCompany(
      type,
      uuidQueryOrNull(mergedQuery.company_id),
      mergedQuery.region_id,
      req,
    );
    const stageIds = stages.map((s) => s.id).filter(Boolean);
    const filterParams = buildCrmLeadsRpcFilterParams(mergedQuery, type, rpcAssigneeStrict, rpcRegionIds);
    const rpcParams = {
      ...filterParams,
      p_pipeline_stage_ids: stageIds.length ? stageIds : null,
    };

    const parsed = await invokeCrmLeadsStageCountsRpc(rpcParams);
    if (parsed) {
      return res.json({
        total: parsed.total,
        counts: parsed.counts,
        values: parsed.values,
        weighted_values: parsed.weightedValues,
      });
    }

    const counts = {};
    const STAGE_COUNT_FALLBACK_CONCURRENCY = 6;
    for (let i = 0; i < stageIds.length; i += STAGE_COUNT_FALLBACK_CONCURRENCY) {
      const chunk = stageIds.slice(i, i + STAGE_COUNT_FALLBACK_CONCURRENCY);
      const pairs = await Promise.all(
        chunk.map(async (sid) => {
          const pageRpc = {
            ...filterParams,
            p_stage_id: sid,
            p_limit: 1,
            p_offset: 0,
          };
          try {
            let { data: rpcData, error: rpcError } = await supabase.rpc('crm_leads_page_ids', pageRpc);
            if (rpcError) return [sid, 0];
            const p = parseCrmLeadsPageRpc(rpcData);
            return [sid, p ? p.total : 0];
          } catch {
            return [sid, 0];
          }
        }),
      );
      for (const [sid, total] of pairs) counts[sid] = total;
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    res.json({ total, counts, fallback: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

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
r.get('/leads-deadlines', responseCache({ ttl: 30, scope: 'user', tags: ['crm:list'] }), async (req, res) => {
  try {
    // Giới hạn thấp — URL dài dễ vượt proxy (~2–8KB); client nên dùng POST.
    const leadIds = parseLeadIdsCsvQuery(req.query.lead_ids, 80);
    const deadlines = await resolveCrmLeadsDeadlinesMap(leadIds);
    res.json({ deadlines });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /crm/leads-deadlines — batch lead_ids trong body (tránh URL quá dài). */
r.post('/leads-deadlines', async (req, res) => {
  try {
    const leadIds = parseLeadIdsFromBody(req.body, 500);
    const deadlines = await resolveCrmLeadsDeadlinesMap(leadIds);
    res.json({ deadlines });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /crm/web-dashboard-bootstrap — 1 round-trip: stages + dashboard light + kanban trang đầu.
 * Bỏ deadline task + KPI nặng lúc mở trang; frontend enrich nền sau.
 */
r.get('/web-dashboard-bootstrap', responseCache({ ttl: 15, scope: 'user', tags: ['crm:list'] }), async (req, res) => {
  try {
    const ctx = await resolveCrmLeadsMergedQuery(req, res);
    if (!ctx) return;
    const { type, mergedQuery, rpcAssigneeStrict, rpcRegionIds } = ctx;
    if (crmListUsesLegacyFilters(mergedQuery)) {
      return res.status(400).json({ error: 'Bộ lọc hiện tại chưa hỗ trợ web-dashboard-bootstrap. Dùng GET /crm/leads.' });
    }

    const companyId = uuidQueryOrNull(mergedQuery.company_id);
    const parsedLimit = Math.min(Math.max(parseInt(req.query.limit) || 500, 1), 2000);
    const skipDeadline = resolveCrmLeadsSkipDeadline(mergedQuery, { skipDeadline: true });
    const lite = resolveCrmLeadsKanbanLite(mergedQuery, { lite: true });
    const ledgerPeriodStart = defaultKpiLedgerMonthStartYmd();

    const stagesPromise = resolveKanbanStagesForCompany(type, companyId, mergedQuery.region_id, req);
    const kanbanPromise = fetchCrmLeadsPageViaRpc(req, mergedQuery, type, 0, parsedLimit, {
      lite,
      skipDeadline,
    });

    const [stages, kanbanPage] = await Promise.all([stagesPromise, kanbanPromise]);
    if (!kanbanPage) {
      return res.status(500).json({ error: 'Không tải được dữ liệu kanban' });
    }

    const lightStats = await computeCrmDashboardLightStats(req, type, {
      effectiveCompanyId: companyId,
      region_id: uuidQueryOrNull(mergedQuery.region_id),
      stages: stages || [],
      assigned_to_only: uuidQueryOrNull(mergedQuery.assigned_to),
      date_from: mergedQuery.date_from,
      date_to: mergedQuery.date_to,
      phone_filter: mergedQuery.phone_filter,
    });
    const totalItems = lightStats.totalItems ?? kanbanPage.total ?? 0;
    const wonItemCount = lightStats.wonCount || 0;
    const kpis = buildCrmDashboardMinimalKpis(type, totalItems, wonItemCount, 0, 0, ledgerPeriodStart);

    res.json({
      type,
      stages: stages || [],
      dashboard: {
        pipeline: lightStats.stageStats,
        kpis,
        ledger_net_by_lead: {},
        recent_quotations: [],
        recent_orders: [],
        light: true,
        minimal: true,
      },
      kanban: kanbanPage,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /crm/kanban-bootstrap — stages + counts + trang đầu cột active trong 1 round-trip. */
r.get('/kanban-bootstrap', responseCache({ ttl: 15, scope: 'user', tags: ['crm:list'] }), async (req, res) => {
  try {
    const ctx = await resolveCrmLeadsMergedQuery(req, res);
    if (!ctx) return;
    const { type, mergedQuery, rpcAssigneeStrict, rpcRegionIds } = ctx;
    if (crmListUsesLegacyFilters(mergedQuery)) {
      return res.status(400).json({ error: 'Bộ lọc hiện tại chưa hỗ trợ kanban-bootstrap. Dùng GET /crm/leads.' });
    }

    const companyId = uuidQueryOrNull(mergedQuery.company_id);
    const regionId = mergedQuery.region_id;
    const parsedLimit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 200);
    const requestedStageId = uuidQueryOrNull(req.query.stage_id);
    const skipCounts = req.query.skip_counts === '1' || req.query.skip_counts === 'true';
    const lite = req.query.lite === '1' || req.query.lite === 'true';

    const stages = await resolveKanbanStagesForCompany(type, companyId, regionId, req);
    const stageIds = stages.map((s) => String(s.id)).filter(Boolean);
    const initialStageId =
      requestedStageId && stageIds.includes(String(requestedStageId))
        ? String(requestedStageId)
        : (stageIds[0] || '');

    const filterParams = buildCrmLeadsRpcFilterParams(mergedQuery, type, rpcAssigneeStrict, rpcRegionIds);

    const loadInitialPage = async () => {
      if (!initialStageId) {
        return { data: [], total: 0, offset: 0, limit: parsedLimit, hasMore: false, nextOffset: 0 };
      }
      const pageRpc = {
        ...filterParams,
        p_stage_id: initialStageId,
        p_limit: parsedLimit,
        p_offset: 0,
      };
      let { data: rpcData, error: rpcError } = await supabase.rpc('crm_leads_page_ids', pageRpc);
      if (rpcError && /crm_leads_page_ids|does not exist|Could not find|argument/i.test(String(rpcError.message || ''))) {
        const { p_region_ids: _r, ...noRegion } = pageRpc;
        const r2 = await supabase.rpc('crm_leads_page_ids', noRegion);
        if (!r2.error) {
          rpcData = r2.data;
          rpcError = null;
        }
      }
      const parsedRpc = !rpcError ? parseCrmLeadsPageRpc(rpcData) : null;
      if (!parsedRpc) return null;
      return hydrateCrmLeadsRpcPage(parsedRpc, req, 0, parsedLimit, { lite });
    };

    const initialPage = await loadInitialPage();
    if (!initialPage) {
      return res.status(500).json({ error: 'Không tải được trang kanban' });
    }

    if (skipCounts) {
      const stageCounts = {};
      if (initialStageId) stageCounts[initialStageId] = initialPage.total;
      return res.json({
        stages,
        stageCounts,
        listTotal: initialPage.total,
        initialStageId,
        skipCounts: true,
        initialPage: {
          data: initialPage.data,
          total: initialPage.total,
          hasMore: initialPage.hasMore,
          nextOffset: initialPage.nextOffset,
        },
      });
    }

    const countsParsed = await invokeCrmLeadsStageCountsRpc({
      ...filterParams,
      p_pipeline_stage_ids: stageIds.length ? stageIds : null,
    });

    const stageCounts = countsParsed?.counts || {};
    if (initialStageId && stageCounts[initialStageId] === undefined) {
      stageCounts[initialStageId] = initialPage.total;
    }

    res.json({
      stages,
      stageCounts,
      listTotal: countsParsed?.total ?? initialPage.total,
      initialStageId,
      initialPage: {
        data: initialPage.data,
        total: initialPage.total,
        hasMore: initialPage.hasMore,
        nextOffset: initialPage.nextOffset,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/leads', responseCache({ ttl: 15, scope: 'user', tags: ['crm:list'] }), async (req, res) => {
  try {
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
      if (!cid) return;
      mergedQuery = { ...mergedQuery, company_id: cid };
    }
    const { stage_id, assigned_to, source_id, search, limit = 100, offset = 0, company_id, date_from, date_to, phone_filter, lead_type_id } = mergedQuery;
    const parsedLimit = Math.min(Math.max(parseInt(limit) || 100, 1), 2000);
    const parsedOffset = Math.max(parseInt(offset) || 0, 0);

    const dealAssigneeStrict = type === 'deal' && (!!uuidQueryOrNull(assigned_to) || forcedDealSelf);
    const leadAssigneeStrict = type === 'lead' && (!!uuidQueryOrNull(assigned_to) || forcedLeadSelf);
    const rpcAssigneeStrict = dealAssigneeStrict || leadAssigneeStrict;

    const referrerNameQuery = String(mergedQuery.referrer_name || '').trim();
    const customerCompanyQuery = String(mergedQuery.customer_company || '').trim();

    // RPC `crm_leads_page_ids` (database/58_...) không có tham số p_lead_type_id — gửi thêm sẽ khiến PostgREST
    // không resolve được function → 500. Lọc theo lead_type_id / referrer_name / customer_company chỉ dùng legacy.
    if (uuidQueryOrNull(lead_type_id) || referrerNameQuery || customerCompanyQuery) {
      const legacy = await getCrmLeadsListLegacy(mergedQuery, {
        assigneeStrict: rpcAssigneeStrict,
        viewerUserId: req.user?.userId,
        req,
        lite: resolveCrmLeadsKanbanLite(mergedQuery),
      });
      return res.json(legacy);
    }

    const legacyFollowUpFrom = sanitizeIsoDateQueryParam(mergedQuery.next_follow_up_from);
    const legacyFollowUpTo = sanitizeIsoDateQueryParam(mergedQuery.next_follow_up_to);
    const legacyFollowUpEmpty =
      mergedQuery.next_follow_up_empty === 'true' || mergedQuery.next_follow_up_empty === '1';
    const legacyPipelineId = uuidQueryOrNull(mergedQuery.pipeline_id);
    const forceLegacyExtended = !!(
      legacyFollowUpFrom ||
      legacyFollowUpTo ||
      legacyFollowUpEmpty ||
      legacyPipelineId
    );
    if (forceLegacyExtended) {
      const legacy = await getCrmLeadsListLegacy(mergedQuery, {
        assigneeStrict: rpcAssigneeStrict,
        viewerUserId: req.user?.userId,
        req,
        lite: resolveCrmLeadsKanbanLite(mergedQuery),
      });
      return res.json(legacy);
    }

    const rpcRegionIds = resolveRpcRegionIdsForCrmList(req, mergedQuery.region_id);

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
    // DB cũ: không có p_region_ids — thử bỏ tham số cuối
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
    const rpcOk = !!parsedRpc;
    const lite = resolveCrmLeadsKanbanLite(mergedQuery);
    const skipDeadline = resolveCrmLeadsSkipDeadline(mergedQuery);

    if (rpcOk) {
      const pageResult = await hydrateCrmLeadsRpcPage(parsedRpc, req, parsedOffset, parsedLimit, { lite, skipDeadline });
      return res.json(pageResult);
    }

    if (rpcError) {
      console.warn('[crm/leads] crm_leads_page_ids RPC unavailable, using legacy (max 5000 rows):', rpcError.message);
    }
    const legacy = await getCrmLeadsListLegacy(mergedQuery, {
      assigneeStrict: rpcAssigneeStrict,
      viewerUserId: req.user?.userId,
      req,
      lite,
    });
    return res.json(legacy);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── CUSTOMERS CRUD ──
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

// ═══ KHU VỰC CRM (company_regions) ═══
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
        const { getRestrictedDivisionIdsForModule, KNOWN_MODULE_KEYS } = require('../helpers/ecosystemModuleScope');
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
    const { inVietnam: _inVN } = require('../helpers/geoBounds');
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
      const { inVietnam: _inVN } = require('../helpers/geoBounds');
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

/**
 * POST /crm/company-regions/:id/regeocode
 *   Force re-geocode (xóa cache + reset lat/lng, gọi forwardGeocode đồng bộ).
 *   Trả về { id, lat, lng, source } hoặc { ok: false, reason }.
 */
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

    const { forwardGeocode } = require('../helpers/forwardGeocode');

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

/** POST /crm/leads/stage-history-summary — lịch sử stage theo batch (danh sách CRM) */
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

    if (await enforceQuotaForRequest(req, res, body.company_id, 'leads_per_month')) return;

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
      // Ưu tiên pipeline riêng của khu vực (nếu công ty đã tách pipeline theo khu vực);
      // không có thì rơi về pipeline mặc định của công ty.
      body.pipeline_id = body.region_id
        ? await getPipelineIdForCompanyRegion(body.company_id, body.region_id)
        : null;
      if (!body.pipeline_id) {
        body.pipeline_id = await ensureDefaultCrmPipelineForCompany(body.company_id);
      }
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
      const { resolveReferrerNameForLead } = require('../helpers/crmReferrers');
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
      const tid = await resolveTenantIdForQuota(req, data.company_id);
      if (tid) invalidateTenantUsageCache(tid);
    } catch (_) {}

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

r.post('/deals', async (req, res) => {
  try {
    const body = { ...req.body };
    delete body.priority; // crm_leads không có cột priority
    const applyWorkshopSxFromBody =
      body.apply_workshop_production_tasks === true || body.apply_workshop_production_tasks === 'true';
    delete body.apply_workshop_production_tasks;

    ['customer_id', 'source_id', 'stage_id', 'assigned_to', 'company_id', 'pipeline_id', 'lead_type_id', 'region_id'].forEach(f => {
      if (body[f] === '' || body[f] === undefined) body[f] = null;
    });

    if (!body.title) return res.status(400).json({ error: 'Nhập tên Deal' });
    const lockedDealCo = scopedCrmCompanyIdForWrite(req);
    if (lockedDealCo) {
      if (body.company_id && String(body.company_id) !== String(lockedDealCo)) {
        return res.status(403).json({ error: 'Không tạo deal cho công ty khác' });
      }
      body.company_id = lockedDealCo;
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      body.company_id = cid;
    }
    if (!body.company_id) return res.status(400).json({ error: 'Vui lòng chọn công ty' });

    if (await enforceQuotaForRequest(req, res, body.company_id, 'deals_per_month')) return;

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

    if (!body.assigned_to) body.assigned_to = req.user.userId;
    if (!userSeesAllCrmDealsForScope(req.user)) body.assigned_to = req.user.userId;
    body.lead_owner_id = body.assigned_to;

    // Resolve pipeline_id + first stage by company (company-scoped pipelines)
    if (!body.pipeline_id) {
      // Ưu tiên pipeline riêng của khu vực (nếu công ty đã tách pipeline theo khu vực);
      // không có thì rơi về pipeline mặc định của công ty.
      body.pipeline_id = body.region_id
        ? await getPipelineIdForCompanyRegion(body.company_id, body.region_id)
        : null;
      if (!body.pipeline_id) {
        body.pipeline_id = await ensureDefaultCrmPipelineForCompany(body.company_id);
      }
    }
    if (!body.pipeline_id) return res.status(500).json({ error: 'Công ty chưa có pipeline CRM' });
    const { data: pl } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', body.pipeline_id).maybeSingle();
    if (!pl) return res.status(400).json({ error: 'Pipeline không tồn tại' });
    if (String(pl.company_id || '') !== String(body.company_id || '')) return res.status(400).json({ error: 'Pipeline không thuộc công ty đã chọn' });

    const { data: firstStage } = await supabase
      .from('crm_pipeline_stages')
      .select('id')
      .eq('pipeline_id', body.pipeline_id)
      .eq('pipeline_type', 'deal')
      .eq('is_active', true)
      .order('order_index')
      .limit(1)
      .maybeSingle();
    if (!firstStage) return res.status(500).json({ error: 'Không tìm thấy giai đoạn Deal đầu tiên trong pipeline này' });

    let leadTypeTriggersWorkshopSx = false;
    if (body.lead_type_id) {
      const { data: lt } = await supabase
        .from('crm_lead_types')
        .select('id, company_id, applies_to, is_active, workshop_production_templates')
        .eq('id', body.lead_type_id)
        .maybeSingle();
      if (!lt) return res.status(400).json({ error: 'Loại Lead/Deal không tồn tại' });
      if (String(lt.company_id || '') !== String(body.company_id || '')) return res.status(400).json({ error: 'Loại không thuộc công ty đã chọn' });
      if (lt.is_active === false) return res.status(400).json({ error: 'Loại đang bị ẩn' });
      if (lt.applies_to && !['deal','both'].includes(String(lt.applies_to))) return res.status(400).json({ error: 'Loại này không áp dụng cho Deal' });
      leadTypeTriggersWorkshopSx = !!lt.workshop_production_templates;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'referrer_name')) {
      const { resolveReferrerNameForLead } = require('../helpers/crmReferrers');
      body.referrer_name = await resolveReferrerNameForLead({
        companyId: body.company_id,
        referrerName: body.referrer_name,
        userId: req.user.userId,
      });
    }

    const code = await nextCode('DEAL');
    const { data, error } = await supabase.from('crm_leads')
      .insert({
        ...body,
        code,
        type: 'deal',
        stage_id: body.stage_id || firstStage.id,
        lead_owner_id: body.assigned_to,
        created_by: req.user.userId,
        stage_entered_at: new Date().toISOString(),
      })
      .select('*, customer:customers(id, full_name, phone), stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, color, icon)')
      .single();
    if (error) throw error;

    try {
      const tid = await resolveTenantIdForQuota(req, data.company_id);
      if (tid) invalidateTenantUsageCache(tid);
    } catch (_) {}

    try {
      const targetIds = new Set();
      if (body.assigned_to) targetIds.add(body.assigned_to);
      const { data: admins } = await supabase.from('users').select('id').eq('role', 'admin').eq('is_active', true);
      (admins || []).forEach(a => targetIds.add(a.id));
      if (targetIds.size) await notifyMultiple(req, [...targetIds], 'deal_created',
        '🎯 Deal mới',
        `Deal "${body.title}" — Mã: ${code} — GT: ${formatMoney(body.estimated_value)}`,
        'crm_deal', data.id);
    } catch (ne) { console.warn('[NOTIFY] deal_created:', ne.message); }

    try {
      await autoGenCrmTasksForNewLead(data.id, req.user.userId, req);
    } catch (autoErr) { console.error('Auto-create tasks on deal create error:', autoErr.message); }

    // Nhiệm vụ SX (sx_*) từ workshop_task_templates — khi loại Deal bật cờ hoặc client gửi apply_workshop_production_tasks.
    if (applyWorkshopSxFromBody || leadTypeTriggersWorkshopSx) {
      try {
        const gate = await validateProductionCompanyId(data.company_id);
        if (gate.ok) {
          const targetLeadId = await resolveCrmTaskWriteLeadId(data.id);
          await applyProductionTemplateToFulfillmentLead({
            req,
            leadId: targetLeadId,
            createdBy: req.user.userId,
            assigneeId: data.assigned_to || data.lead_owner_id || null,
            force: false,
          });
        }
      } catch (sxErr) {
        console.warn('[POST /deals] workshop production templates:', sxErr.message);
      }
    }

    // Một deal duy nhất; task CRM trên deal đó — không tự tạo đơn «Đơn 1» hay deal con.

    emitCrmDashboardChanged(req, { type: 'deal', company_id: data.company_id, lead_id: data.id, action: 'created' });
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
      const flags = await require('../helpers/crmLeadUserFlags').fetchFlagsByLeadIds(uid, [canonicalId]);
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
      const { resolveLeadInboxChannel } = require('../helpers/crmLeadInboxChannel');
      data.inbox_channel = await resolveLeadInboxChannel(supabase, canonicalId, data);
    } catch (e) {
      data.inbox_channel = null;
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
      const { resolveReferrerNameForLead } = require('../helpers/crmReferrers');
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

    // Ghi lịch sử thay đổi người phụ trách
    try {
      const ownerChanged = Object.prototype.hasOwnProperty.call(req.body, 'assigned_to')
        || Object.prototype.hasOwnProperty.call(req.body, 'lead_owner_id');
      if (ownerChanged) {
        const newOwnerId = safeBody.assigned_to || safeBody.lead_owner_id;
        const prevOwnerId = oldLead?.assigned_to || oldLead?.lead_owner_id;
        if (String(newOwnerId || '') !== String(prevOwnerId || '')) {
          const { data: actor } = await supabase.from('users').select('full_name').eq('id', req.user.userId).maybeSingle();
          const actorName = actor?.full_name || 'Người dùng';
          let newName = 'Không ai';
          if (newOwnerId) {
            const { data: nu } = await supabase.from('users').select('full_name').eq('id', newOwnerId).maybeSingle();
            newName = nu?.full_name || 'Nhân viên';
          }
          let prevName = '';
          if (prevOwnerId) {
            const { data: pu } = await supabase.from('users').select('full_name').eq('id', prevOwnerId).maybeSingle();
            prevName = pu?.full_name || 'Nhân viên';
          }
          const fromPart = prevName ? ` (trước: ${prevName})` : '';
          await logDealActivityComment(req, {
            leadId: id,
            body: `👤 ${actorName} đã thay đổi người phụ trách CRM thành «${newName}»${fromPart}.`,
          });
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
        const { snapshotCrmLead } = require('../helpers/trashSnapshot');
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
    const { addPhoneToAutoLeadBlocklist } = require('../helpers/crmAutoLeadPhoneBlocklist');
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
  const { canViewerSeeByCompanyAndDept } = require('../helpers/documentShareScope');
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
    const { data: lead } = await supabase.from('crm_leads').select('project_id, title').eq('id', req.params.id).single();
    
    let shareMods = null;
    if (Array.isArray(allowed_share_modules) && allowed_share_modules.length) {
      const { SHARE_MODULE_KEYS } = require('../helpers/documentShareScope');
      shareMods = [...new Set(allowed_share_modules.map((x) => String(x).toLowerCase().trim()))].filter((x) =>
        SHARE_MODULE_KEYS.has(x),
      );
      if (!shareMods.length) shareMods = null;
    }
    const docShare = getDefaultLeadDocumentShareForDeal(lead?.project_id, {
      shared_to_workshop: req.body.shared_to_workshop,
      allowed_share_modules: shareMods,
    });

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
        allowed_share_modules: docShare.allowed_share_modules,
        shared_to_workshop: docShare.shared_to_workshop,
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

    await logProjectFileActivity(req, {
      projectId: lead?.project_id,
      leadId: req.params.id,
      action: 'uploaded',
      fileName: data.file_name || data.name,
      fileUrl: data.file_url,
    });
    if (lead?.project_id && docShare.shared_to_workshop) {
      await notifyProductionDocumentUploaded({
        req,
        projectId: lead.project_id,
        leadId: req.params.id,
        fileName: data.file_name || data.name,
        dealTitle: lead.title,
      });
    }

    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// BULK add documents (nhiều files 1 request)
r.post('/leads/:id/documents/bulk', async (req, res) => {
  try {
    if (!(await assertDealResponsible(req, res, { leadId: req.params.id }))) return;
    const items = req.body.items;
    if (!items?.length) return res.status(400).json({ error: 'Không có file' });

    const { data: lead } = await supabase.from('crm_leads').select('project_id, title, assigned_to, lead_owner_id').eq('id', req.params.id).single();
    const docShare = getDefaultLeadDocumentShareForDeal(lead?.project_id);
    const rows = items.map(item => ({
      lead_id: req.params.id,
      project_id: lead?.project_id || null,
      name: item.name || item.file_name || 'Tài liệu',
      doc_type: item.doc_type || 'other',
      file_url: item.file_url,
      file_name: item.file_name,
      file_size: item.file_size,
      mime_type: item.mime_type,
      shared_to_workshop: docShare.shared_to_workshop,
      allowed_share_modules: docShare.allowed_share_modules,
      created_by: req.user.userId,
    }));
    const { data, error } = await supabase.from('lead_documents')
      .insert(rows)
      .select('*, creator:users!lead_documents_created_by_fkey(id, full_name)');
    if (error) throw error;
    for (const doc of data || []) {
      await logProjectFileActivity(req, {
        projectId: lead?.project_id,
        leadId: req.params.id,
        action: 'uploaded',
        fileName: doc.file_name || doc.name,
        fileUrl: doc.file_url,
      });
      if (lead?.project_id && docShare.shared_to_workshop) {
        await notifyProductionDocumentUploaded({
          req,
          projectId: lead.project_id,
          leadId: req.params.id,
          fileName: doc.file_name || doc.name,
          dealTitle: lead.title,
        });
      }
    }
    try {
      const ownerIds = [lead?.assigned_to, lead?.lead_owner_id].filter(Boolean);
      if (ownerIds.length && data?.length) {
        await notifyMultiple(req, ownerIds, 'document_uploaded',
          '📎 Tài liệu mới',
          `${data.length} file được upload vào deal "${lead?.title || 'N/A'}"`,
          'crm_lead', req.params.id);
      }
    } catch (ne) { console.warn('[NOTIFY] document_uploaded bulk:', ne.message); }
    res.status(201).json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete document + sync xóa crm_task_attachment liên kết
r.delete('/leads/:id/documents/:docId', async (req, res) => {
  try {
    const { data: doc, error: docErr } = await supabase.from('lead_documents')
      .select('id, lead_id, project_id, source_attachment_id, source_file_attachment_id, created_by, file_name, name')
      .eq('id', req.params.docId)
      .maybeSingle();
    if (docErr) throw docErr;
    if (!doc) return res.status(404).json({ error: 'Không tìm thấy tài liệu' });
    if (doc.lead_id && String(doc.lead_id) !== String(req.params.id)) {
      return res.status(404).json({ error: 'Tài liệu không thuộc deal này' });
    }
    if (!(await assertLeadDocumentOwner(req, res, doc))) return;

    const deletedFileName = doc.file_name || doc.name || 'tài liệu';

    // Snapshot vào Thùng rác trước khi xóa thật (trừ khi permanent=true)
    if (req.query.permanent !== 'true') {
      try {
        const { snapshotLeadDocument } = require('../helpers/trashSnapshot');
        const snapRes = await snapshotLeadDocument(supabase, req.params.docId, req.user?.userId);
        if (!snapRes.ok) console.warn('[delete lead doc] snapshot trash failed:', snapRes.error);
      } catch (e) {
        console.warn('[delete lead doc] trash snapshot error:', e.message);
      }
    }

    // Mirror từ file xưởng — xóa file gốc + bản mirror trên CRM
    if (doc.source_file_attachment_id) {
      const { removeLeadDocumentForWorkshopFile } = require('../helpers/syncWorkshopFileToLeadDocument');
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
      await logProjectFileActivity(req, {
        projectId: doc.project_id,
        leadId: doc.lead_id || req.params.id,
        action: 'deleted',
        fileName: deletedFileName,
      });
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
    await logProjectFileActivity(req, {
      projectId: doc.project_id,
      leadId: doc.lead_id || req.params.id,
      action: 'deleted',
      fileName: deletedFileName,
    });
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
    const { data: before } = await supabase.from('lead_documents')
      .select('id, lead_id, project_id, created_by, file_name, name, source_file_attachment_id, source_attachment_id')
      .eq('id', req.params.docId)
      .maybeSingle();
    if (!before) return res.status(404).json({ error: 'Không tìm thấy tài liệu' });
    if (!(await assertLeadDocumentOwner(req, res, before))) return;

    const { allowed_departments, allowed_companies, shared_to_workshop, allowed_share_modules } = req.body;
    const update = {
      allowed_departments: allowed_departments || null,
      allowed_companies: allowed_companies || null,
    };
    if (shared_to_workshop !== undefined) update.shared_to_workshop = !!shared_to_workshop;
    if (allowed_share_modules !== undefined) {
      const { SHARE_MODULE_KEYS } = require('../helpers/documentShareScope');
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
    await logProjectFileActivity(req, {
      projectId: before.project_id,
      leadId: before.lead_id,
      action: 'visibility_updated',
      fileName: before.file_name || before.name,
      fileUrl: before.file_url,
    });
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
      const { applyZaloDisplayNameToCustomer } = require('../helpers/zaloBatchTools');
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
    // Ưu tiên pipeline riêng của khu vực đã chọn (khi công ty đã tách pipeline theo khu vực) —
    // quan trọng khi khu vực chọn ở màn "Chuyển sang Deal" khác khu vực gốc của lead.
    if (!pipelineForDeal && companyId && regionId) {
      const regionPid = await getPipelineIdForCompanyRegion(companyId, regionId);
      if (regionPid) pipelineForDeal = regionPid;
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
      const { recordLeadConvertedKpi } = require('../helpers/kpiLedger');
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

    // Ưu tiên cột lead được đánh dấu "is_revert_to_lead_target" (Cài đặt Pipeline);
    // nếu không có cột nào được đánh dấu (hoặc chưa chạy migration) → fallback cột lead đầu tiên.
    let targetStageQ = supabase
      .from('crm_pipeline_stages')
      .select('id')
      .eq('pipeline_type', 'lead')
      .eq('is_active', true)
      .eq('is_revert_to_lead_target', true)
      .order('order_index')
      .limit(1);
    if (pipelineForLead) targetStageQ = targetStageQ.eq('pipeline_id', pipelineForLead);
    let firstLeadStage = null;
    {
      const { data: targetStage, error: targetErr } = await targetStageQ.maybeSingle();
      if (targetErr && !/is_revert_to_lead_target/.test(targetErr.message || '')) throw targetErr;
      firstLeadStage = targetStage || null;
    }
    if (!firstLeadStage) {
      let stageQ = supabase
        .from('crm_pipeline_stages')
        .select('id')
        .eq('pipeline_type', 'lead')
        .eq('is_active', true)
        .order('order_index')
        .limit(1);
      if (pipelineForLead) stageQ = stageQ.eq('pipeline_id', pipelineForLead);
      const { data: fallbackStage, error: stagePickErr } = await stageQ.maybeSingle();
      if (stagePickErr) throw stagePickErr;
      firstLeadStage = fallbackStage || null;
    }
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
    if (!(await assertDealResponsible(req, res, { leadId: req.params.id, projectId: lead?.project_id }))) return;
    
    let { data: stage } = await supabase
      .from('crm_pipeline_stages')
      .select('id, name, order_index, is_won, is_lost, pipeline_type, send_zalo_on_enter, default_probability, sync_role, requires_deadline, counts_as_completed_revenue, apply_default_assignee_on_enter, default_assignee_user_id')
      .eq('id', stage_id)
      .single();
    if (!stage) {
      // Fallback nếu chưa migrate cột requires_deadline.
      ({ data: stage } = await supabase
        .from('crm_pipeline_stages')
        .select('id, name, order_index, is_won, is_lost, pipeline_type, send_zalo_on_enter, default_probability, sync_role, apply_default_assignee_on_enter, default_assignee_user_id')
        .eq('id', stage_id)
        .single());
    }
    if (stage && stage.apply_default_assignee_on_enter === undefined) {
      stage.apply_default_assignee_on_enter = false;
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
    let stageAssigneeTransfer = null;
    const applyDefaultAssignee = req.body?.apply_default_assignee === true;
    const assigneeOverride = normalizeCrmStageDefaultAssigneeUserId(req.body?.assignee_user_id);
    if (isStageChange) {
      const prevAssigneeId = String(lead?.assigned_to || lead?.lead_owner_id || '').trim() || null;
      await mergeCrmStageDefaultAssigneeIntoUpdates(updates, {
        stage,
        lead,
        isStageChange: true,
        applyDefaultAssignee,
        assigneeUserId: assigneeOverride,
        sb: supabase,
      });
      const newAssigneeId = updates.assigned_to ? String(updates.assigned_to).trim() : null;
      if (newAssigneeId && newAssigneeId !== prevAssigneeId) {
        stageAssigneeTransfer = {
          prevAssigneeId,
          newAssigneeId,
          stageName: stage?.name || '',
        };
      }
    }
    // Bàn giao SX: khóa người phụ trách CRM — NV xưởng gán qua project_production_staff sau auto-create.
    stripCrmAssigneeFromWonStageUpdates(updates, {
      leadType: lead?.type,
      isWon: !!stage?.is_won,
      requiresProductionPick,
    });
    if (stageAssigneeTransfer && !updates.assigned_to) {
      stageAssigneeTransfer = null;
    }
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

    if (stageAssigneeTransfer) {
      const appliedId = String(updatedLeadRow?.assigned_to || updatedLeadRow?.lead_owner_id || '').trim();
      if (appliedId === stageAssigneeTransfer.newAssigneeId) {
        try {
          await postCrmStageDefaultAssigneeComment(req, notifyMultiple, {
            leadId: req.params.id,
            senderId: req.user.userId,
            newAssigneeId: stageAssigneeTransfer.newAssigneeId,
            previousAssigneeId: stageAssigneeTransfer.prevAssigneeId,
            stageName: stageAssigneeTransfer.stageName,
            leadType: lead?.type,
          });
        } catch (assigneeCommentErr) {
          console.warn('[crm/stage] postCrmStageDefaultAssigneeComment:', assigneeCommentErr.message);
        }
      }
    }

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

    if (isStageChange && stage?.name) {
      await logDealStageChangeComment(req, {
        leadId: req.params.id,
        projectId: responseLead?.project_id || lead?.project_id,
        stageName: stage.name,
      });
    }
    if (hasDeadlineInput && parsedDeadlineTs) {
      await logDealDeadlineChangeComment(req, {
        leadId: req.params.id,
        projectId: responseLead?.project_id || lead?.project_id,
        newDeadlineAt: new Date(parsedDeadlineTs).toISOString(),
      });
    }

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
    if (!(await assertDealResponsible(req, res, { leadId, projectId: lead.project_id }))) return;

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

    const { data: leadProj } = await supabase.from('crm_leads').select('project_id').eq('id', leadId).maybeSingle();
    await logDealDeadlineChangeComment(req, {
      leadId,
      projectId: leadProj?.project_id,
      newDeadlineAt: newIso,
      cleared: !newIso,
    });

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
      const { cleanShareModulesInput } = require('../helpers/documentShareScope');
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
      const { cleanShareModulesInput } = require('../helpers/documentShareScope');
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
    const { cleanShareModulesInput } = require('../helpers/documentShareScope');

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

r.get('/quotations', async (req, res) => {
  try {
    const {
      status, search, limit = 50, lead_id,
      company_id: coQ, region_id: regQ, created_by: createdByQ,
      orphan, // 'only' | 'exclude' | undefined
    } = req.query;
    let q = supabase.from('quotations')
      .select(
        '*, customer:customers(id, full_name, phone), ' +
        'creator:users!quotations_created_by_fkey(id, full_name), ' +
        'approver:users!quotations_approved_by_fkey(id, full_name), ' +
        'company:companies!quotations_company_id_fkey(id, name, short_name), ' +
        'region:company_regions!quotations_region_id_fkey(id, name, code), ' +
        'lead:crm_leads!quotations_lead_id_fkey(id, code, title, type, assigned_to)',
      )
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));
    const qScope = resolveCommercialDocListCompanyScope(req, res, coQ);
    if (!qScope.ok) return;
    if (qScope.companyId) q = q.eq('company_id', qScope.companyId);
    if (qScope.restrictToCreator && req.user?.userId) q = q.eq('created_by', req.user.userId);
    if (regQ && /^[0-9a-f-]{36}$/i.test(String(regQ))) q = q.eq('region_id', regQ);
    if (userIsAdmin(req.user?.role) && createdByQ && /^[0-9a-f-]{36}$/i.test(String(createdByQ))) {
      q = q.eq('created_by', createdByQ);
    }
    if (status) q = q.eq('status', status);
    if (orphan === 'only') q = q.is('lead_id', null);
    else if (orphan === 'exclude') q = q.not('lead_id', 'is', null);
    if (search) q = q.or(`code.ilike.%${search}%,title.ilike.%${search}%,customer_name.ilike.%${search}%`);
    if (lead_id && /^[0-9a-f-]{36}$/i.test(String(lead_id))) q = await applyLeadOrCustomerSalesFilter(q, lead_id);
    let { data, error } = await q;
    // DB cũ chưa có FK quotations_region_id_fkey (migration 160 chưa chạy) → bỏ embed region rồi thử lại
    if (error && /quotations_region_id_fkey|company_regions/i.test(String(error.message || ''))) {
      let q2 = supabase.from('quotations')
        .select(
          '*, customer:customers(id, full_name, phone), ' +
          'creator:users!quotations_created_by_fkey(id, full_name), ' +
          'approver:users!quotations_approved_by_fkey(id, full_name), ' +
          'company:companies!quotations_company_id_fkey(id, name, short_name), ' +
          'lead:crm_leads!quotations_lead_id_fkey(id, code, title, type, assigned_to)',
        )
        .order('created_at', { ascending: false })
        .limit(parseInt(limit));
      if (qScope.companyId) q2 = q2.eq('company_id', qScope.companyId);
      if (qScope.restrictToCreator && req.user?.userId) q2 = q2.eq('created_by', req.user.userId);
      if (userIsAdmin(req.user?.role) && createdByQ && /^[0-9a-f-]{36}$/i.test(String(createdByQ))) {
        q2 = q2.eq('created_by', createdByQ);
      }
      if (regQ && /^[0-9a-f-]{36}$/i.test(String(regQ))) q2 = q2.eq('region_id', regQ);
      if (status) q2 = q2.eq('status', status);
      if (orphan === 'only') q2 = q2.is('lead_id', null);
      else if (orphan === 'exclude') q2 = q2.not('lead_id', 'is', null);
      if (search) q2 = q2.or(`code.ilike.%${search}%,title.ilike.%${search}%,customer_name.ilike.%${search}%`);
      if (lead_id && /^[0-9a-f-]{36}$/i.test(String(lead_id))) q2 = await applyLeadOrCustomerSalesFilter(q2, lead_id);
      const r2 = await q2;
      data = r2.data; error = r2.error;
    }
    if (error) throw error;
    // Tính flag is_orphan để FE hiển thị badge "Không gắn deal"
    const out = (data || []).map((row) => ({ ...row, is_orphan: !row.lead_id }));
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/quotations/:id', async (req, res) => {
  try {
    const sel =
      '*, customer:customers(id, full_name, phone, email, address, company, tax_code), ' +
      'creator:users!quotations_created_by_fkey(id, full_name, email), ' +
      'approver:users!quotations_approved_by_fkey(id, full_name), ' +
      'company:companies!quotations_company_id_fkey(id, name, short_name), ' +
      'region:company_regions!quotations_region_id_fkey(id, name, code), ' +
      'lead:crm_leads!quotations_lead_id_fkey(id, code, title, type, assigned_to, ' +
        'lead_assignee:users!crm_leads_assigned_to_fkey(id, full_name))';
    let { data: quote, error: qe } = await supabase.from('quotations').select(sel).eq('id', req.params.id).single();
    if (qe && /quotations_region_id_fkey|company_regions/i.test(String(qe.message || ''))) {
      const fb = await supabase
        .from('quotations')
        .select(
          '*, customer:customers(id, full_name, phone, email, address, company, tax_code), ' +
          'creator:users!quotations_created_by_fkey(id, full_name, email), ' +
          'approver:users!quotations_approved_by_fkey(id, full_name), ' +
          'company:companies!quotations_company_id_fkey(id, name, short_name), ' +
          'lead:crm_leads!quotations_lead_id_fkey(id, code, title, type, assigned_to)',
        )
        .eq('id', req.params.id)
        .single();
      quote = fb.data; qe = fb.error;
    }
    if (!quote) {
      const benign = qe && (qe.code === 'PGRST116' || /JSON object requested/i.test(String(qe.message || '')));
      if (qe && !benign) return res.status(500).json({ error: qe.message || 'Lỗi tải báo giá' });
      return res.status(404).json({ error: 'Không tìm thấy báo giá' });
    }
    if (!userMayAccessQuotationRow(req, quote)) {
      return res.status(403).json({ error: 'Không có quyền xem báo giá này' });
    }
    const { data: items } = await supabase.from('quotation_items')
      .select('*, product:products(id, name, code)')
      .eq('quotation_id', req.params.id).order('item_order');
    res.json({ ...quote, items: items || [], is_orphan: !quote?.lead_id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/quotations/:id/history', async (req, res) => {
  try {
    const { data: qMeta } = await supabase
      .from('quotations')
      .select('created_by, company_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!qMeta) return res.status(404).json({ error: 'Không tìm thấy báo giá' });
    if (!userMayAccessQuotationRow(req, qMeta)) {
      return res.status(403).json({ error: 'Không có quyền xem lịch sử báo giá này' });
    }
    const { data: rows, error } = await supabase
      .from('quotation_edit_history')
      .select('id, action, summary, detail, created_at, created_by')
      .eq('quotation_id', req.params.id)
      .order('created_at', { ascending: false })
      .limit(80);
    if (error) throw error;
    const userIds = [...new Set((rows || []).map((r) => r.created_by).filter(Boolean))];
    let userMap = {};
    if (userIds.length) {
      const { data: users } = await supabase.from('users').select('id, full_name').in('id', userIds);
      (users || []).forEach((u) => { userMap[u.id] = u.full_name; });
    }
    const history = (rows || []).map((r) => ({ ...r, editor_name: userMap[r.created_by] || null }));
    res.json({ history });
  } catch (e) {
    if (String(e.message || '').includes('does not exist') || e.code === '42P01'
      || (String(e.message || '').includes('relation') && String(e.message || '').includes('quotation_edit_history'))) {
      return res.json({ history: [] });
    }
    res.status(500).json({ error: e.message });
  }
});

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

r.post('/quotations', async (req, res) => {
  try {
    const { items, quotation_source, ...quoteData } = req.body;
    const code = await nextCode('BG');

    // Sanitize: empty strings → null for UUID fields
    const uuidFields = ['customer_id', 'lead_id', 'project_id', 'approved_by', 'company_id', 'region_id', 'fulfillment_lead_id', 'source_task_id'];
    uuidFields.forEach(f => { if (quoteData[f] === '' || quoteData[f] === undefined) quoteData[f] = null; });
    // Sanitize: empty strings → null for date fields
    const dateFields = ['valid_until', 'issue_date', 'sent_at', 'accepted_at', 'closed_at', 'signed_date', 'delivery_date'];
    dateFields.forEach(f => { if (quoteData[f] === '') quoteData[f] = null; });
    const quoteMoneyOrNull = (v) => {
      if (v === '' || v === undefined || v === null) return null;
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      const onlyDigits = String(v).replace(/\s/g, '').replace(/đ/gi, '').replace(/[^\d]/g, '');
      if (!onlyDigits) return null;
      const n = parseInt(onlyDigits, 10);
      return Number.isFinite(n) ? n : null;
    };
    if ('deposit_amount' in quoteData) quoteData.deposit_amount = quoteMoneyOrNull(quoteData.deposit_amount);
    if ('remaining_amount' in quoteData) quoteData.remaining_amount = quoteMoneyOrNull(quoteData.remaining_amount);
    if ('deposit_received' in quoteData) {
      const dr = quoteData.deposit_received;
      if (dr === '' || dr === undefined || dr === null) quoteData.deposit_received = null;
      else if (dr === true || dr === 'true') quoteData.deposit_received = true;
      else if (dr === false || dr === 'false') quoteData.deposit_received = false;
      else quoteData.deposit_received = null;
    }
    if (quoteData.deposit_label === '') quoteData.deposit_label = null;
    if (quoteData.remaining_note === '') quoteData.remaining_note = null;
    if (quoteData.source_excel_file_url === '') quoteData.source_excel_file_url = null;
    if (quoteData.source_excel_file_name === '') quoteData.source_excel_file_name = null;
    if (quoteData.sale_discount_type === '') quoteData.sale_discount_type = 'amount';
    if (quoteData.sale_discount_value === '') quoteData.sale_discount_value = 0;

    // ── Scope: kế thừa company_id + region_id từ deal (cho phép override; sẽ cảnh báo ở UI) ──
    let commercialCo = quoteData.company_id || null;
    let leadRegionId = null;
    if (quoteData.lead_id) {
      const { data: lrow } = await supabase
        .from('crm_leads')
        .select('company_id, region_id')
        .eq('id', quoteData.lead_id)
        .maybeSingle();
      if (lrow?.company_id) commercialCo = lrow.company_id;
      if (lrow?.region_id) leadRegionId = lrow.region_id;
    }
    const qCoWrite = enforceCommercialDocCompanyOnWrite(req, res, commercialCo, 'Báo giá');
    if (!qCoWrite.ok) return;
    commercialCo = qCoWrite.companyId;
    quoteData.company_id = commercialCo;

    // region_id: nếu client gửi → kiểm tra cùng company; nếu rỗng → kế thừa từ lead.
    if (quoteData.region_id) {
      const { data: rrow } = await supabase
        .from('company_regions')
        .select('id, company_id, is_active')
        .eq('id', quoteData.region_id)
        .maybeSingle();
      if (!rrow) {
        return res.status(400).json({ error: 'Khu vực không tồn tại' });
      }
      if (commercialCo && String(rrow.company_id) !== String(commercialCo)) {
        return res.status(400).json({ error: 'Khu vực phải cùng công ty với báo giá' });
      }
      if (rrow.is_active === false) {
        return res.status(400).json({ error: 'Khu vực đã bị vô hiệu' });
      }
    } else {
      quoteData.region_id = leadRegionId;
    }
    
    // Calc totals with per-item VAT + spec_factor (hệ số quy cách)
    // ── Excel fidelity: nếu item.lock_amount && imported_amount → giữ NGUYÊN số tiền Excel ──
    const processedItems = buildProcessedCommercialItems(items);
    const subtotal = processedItems.reduce((s, i) => s + (i.amount || 0), 0);
    const discountAmt = quoteData.discount_type === 'percent' 
      ? subtotal * (quoteData.discount_value || 0) / 100 
      : (quoteData.discount_value || 0);
    const afterRebate = subtotal - discountAmt;
    const saleDiscountAmt = quoteData.sale_discount_type === 'percent'
      ? afterRebate * (quoteData.sale_discount_value || 0) / 100
      : (quoteData.sale_discount_value || 0);
    const afterAllDiscounts = Math.max(0, afterRebate - saleDiscountAmt);
    const taxAmt = processedItems.reduce((s, i) => s + (i.vat_amount || 0), 0);
    
    const { data: quote, error } = await insertQuotationRow({
      ...quoteData, code, subtotal, discount_amount: discountAmt, sale_discount_amount: saleDiscountAmt,
      tax_amount: taxAmt, total: afterAllDiscounts + taxAmt,
      created_by: req.user.userId,
    });
    if (error) throw error;

    // Insert items with vat_rate and vat_amount
    if (processedItems.length) {
      const itemRows = processedItems.map((item, i) => ({
        ...item, quotation_id: quote.id, item_order: i,
      }));
      await supabase.from('quotation_items').insert(itemRows);
    }

    try {
      let summary = 'Tạo báo giá';
      const qs = quotation_source || {};
      if (qs.from_excel) {
        summary = qs.excel_file_name ? `Tạo báo giá từ Excel (${qs.excel_file_name})` : 'Tạo báo giá từ Excel';
        if (qs.excel_review_confirmed) summary += ' — đã xác nhận đã kiểm tra số liệu';
      }
      await supabase.from('quotation_edit_history').insert({
        quotation_id: quote.id,
        action: 'created',
        summary,
        detail: {
          total: quote.total,
          item_count: processedItems.length,
          source: qs.from_excel ? 'excel' : 'manual',
        },
        created_by: req.user.userId,
      });
    } catch (he) {
      if (!String(he.message || '').includes('does not exist')) console.warn('[quotation_edit_history]', he.message);
    }

    // ═══ ĐỒNG BỘ SẢN PHẨM: chỉ liên kết product_id theo tên, KHÔNG cập nhật giá / không tạo mới ═══
    const syncedProducts = [];
    try {
      for (const item of processedItems) {
        if (!item.name || item.name.trim().length < 3) continue;
        // Tìm sản phẩm theo tên gần đúng (case-insensitive)
        const nameSearch = item.name.trim();
        const { data: existing } = await supabase.from('products')
          .select('id, name')
          .ilike('name', `%${nameSearch}%`)
          .limit(1);
        if (existing?.length) {
          item.product_id = existing[0].id; // Gán product_id vào item
          syncedProducts.push({ name: item.name, product_id: existing[0].id });
        }
        // Không tìm thấy → giữ nguyên, không tạo mới
      }
      console.log('[QUOTATION] Product link:', syncedProducts.length, 'items linked');
    } catch (e) { console.warn('[QUOTATION] Product link error:', e.message); }

    // ═══ AUTO-LINK: Tìm deal qua customer nếu chưa có lead_id ═══
    let linkedLeadId = quote.lead_id;
    if (!linkedLeadId && (quote.customer_id || quote.customer_name)) {
      try {
        // crm_leads không có cột `status` — deal "đang mở" = chưa đóng (actual_close_date IS NULL).
        let dealQuery = supabase.from('crm_leads')
          .select('id, customer_id')
          .eq('type', 'deal')
          .is('actual_close_date', null)
          .order('created_at', { ascending: false })
          .limit(1);

        if (quote.customer_id) {
          dealQuery = dealQuery.eq('customer_id', quote.customer_id);
        } else if (quote.customer_name) {
          // Tìm customer_id qua tên
          const { data: cust } = await supabase.from('customers')
            .select('id')
            .ilike('full_name', `%${quote.customer_name}%`)
            .limit(1).single();
          if (cust) {
            dealQuery = dealQuery.eq('customer_id', cust.id);
          }
        }

        const { data: deal } = await dealQuery.single();
        if (deal) {
          linkedLeadId = deal.id;
          // Cập nhật lead_id + customer_id cho báo giá
          await supabase.from('quotations').update({
            lead_id: deal.id,
            customer_id: deal.customer_id || quote.customer_id,
          }).eq('id', quote.id);
          quote.lead_id = deal.id;
          console.log(`[QUOTATION] Auto-linked BG ${quote.code} → Deal ${deal.id}`);
        }
      } catch (linkErr) {
        console.warn('[QUOTATION] Auto-link deal error:', linkErr.message);
      }
    }

    // ═══ AUTO-COMPLETE: Hoàn thành task "Lập báo giá" trong deal ═══
    if (linkedLeadId) {
      try {
        // Tìm task chưa hoàn thành ở stage quotation, ưu tiên "Lập báo giá"
        const { data: tasks } = await supabase.from('crm_tasks')
          .select('id, title, stage_slug, status')
          .eq('lead_id', linkedLeadId)
          .in('stage_slug', ['quotation', 'deal_quote_contract'])
          .neq('status', 'completed')
          .order('order_index')
          .limit(5);

        // Tìm task phù hợp nhất: "Lập báo giá" > bất kỳ task quotation nào
        const quotationTask = (tasks || []).find(t =>
          t.title.includes('Lập báo giá') || t.title.includes('lập báo giá')
        ) || (tasks || [])[0];

        if (quotationTask) {
          // Mark completed
          await supabase.from('crm_tasks').update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            notes: `✅ Đã tạo báo giá ${quote.code} (${formatMoney(quote.total)})\n📎 Xem: /crm/quotations/${quote.id}`,
            updated_at: new Date().toISOString(),
          }).eq('id', quotationTask.id);

          // Thêm attachment vào task (link tới báo giá)
          const { data: att } = await supabase.from('crm_task_attachments').insert({
            task_id: quotationTask.id,
            lead_id: linkedLeadId,
            name: `📄 ${quote.code} - ${quote.title || 'Báo giá'}`,
            doc_type: 'quotation',
            notes: `Báo giá ${quote.code}: ${formatMoney(quote.total)}\nKH: ${quote.customer_name || ''}\nLink: /crm/quotations/${quote.id}`,
            created_by: req.user.userId,
          }).select().single();

          // Sync → lead_documents
          if (att) {
            const { data: lead } = await supabase.from('crm_leads')
              .select('project_id').eq('id', linkedLeadId).single();
            await supabase.from('lead_documents').insert({
              lead_id: linkedLeadId,
              project_id: lead?.project_id || null,
              name: `[${quotationTask.title}] 📄 ${quote.code}`,
              doc_type: 'quotation',
              notes: att.notes,
              created_by: req.user.userId,
              source_attachment_id: att.id,
              ...getLeadDocumentFieldsFromCrmTask(quotationTask, { linkToProject: !!lead?.project_id }),
            });
          }

          quote.auto_task = { taskId: quotationTask.id, taskTitle: quotationTask.title, completed: true };
          console.log(`[QUOTATION] Auto-completed task "${quotationTask.title}" for deal ${linkedLeadId}`);
        }
      } catch (taskErr) {
        console.warn('[QUOTATION] Auto-complete task error:', taskErr.message);
      }
    }

    // 🔔 NOTIFICATION: Báo giá mới
    try {
      const t = await getNotifyTargets(quote.lead_id);
      const allIds = [...new Set([...t.ownerIds, ...t.adminIds])];
      if (allIds.length) await notifyMultiple(req, allIds, 'quotation_created',
        '📄 Báo giá mới',
        `Báo giá ${quote.code} — KH: ${quote.customer_name || 'N/A'} — ${formatMoney(quote.total)}`,
        'quotation', quote.id);
    } catch (ne) { console.warn('[NOTIFY] quotation_created:', ne.message); }

    // ═══ SYNC: Update customer's last quotation amount ═══
    if (quote.customer_id) {
      try {
        const { data: allQuotes } = await supabase.from('quotations')
          .select('total')
          .eq('customer_id', quote.customer_id)
          .in('status', ['draft', 'sent', 'accepted', 'converted']);
        const totalQuotationValue = (allQuotes || []).reduce((s, q) => s + (q.total || 0), 0);
        await supabase.from('customers').update({
          last_quotation_amount: quote.total,
          last_quotation_at: new Date().toISOString(),
          total_quotation_value: totalQuotationValue,
          updated_at: new Date().toISOString(),
        }).eq('id', quote.customer_id);
        quote.customer_synced = true;
      } catch (syncErr) {
        console.warn('[QUOTATION] Sync customer error:', syncErr.message);
      }
    }

    // Sync deal estimated_value
    if (linkedLeadId && quote.total > 0) {
      try {
        await supabase.from('crm_leads').update({
          estimated_value: quote.total,
          updated_at: new Date().toISOString(),
        }).eq('id', linkedLeadId);
        quote.deal_value_synced = true;
      } catch (syncErr) {
        console.warn('[QUOTATION] Sync deal value error:', syncErr.message);
      }
    }

    // Sync tiền cọc + trạng thái cọc → deal + dự án SX
    if (linkedLeadId) {
      try {
        const depSync = await syncQuotationDepositToDealAndProject(quote, linkedLeadId);
        if (depSync.synced) quote.deposit_synced = true;
      } catch (syncErr) {
        console.warn('[QUOTATION] Sync deposit error:', syncErr.message);
      }
    }

    res.status(201).json({ ...quote, synced_products: syncedProducts });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

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


r.put('/quotations/:id', async (req, res) => {
  try {
    const { data: qAuth } = await supabase
      .from('quotations')
      .select('created_by, company_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!qAuth) return res.status(404).json({ error: 'Không tìm thấy báo giá' });
    if (!userMayAccessQuotationRow(req, qAuth)) {
      return res.status(403).json({ error: 'Không có quyền sửa báo giá này' });
    }

    const { items: itemsBody, quotation_source: _qs, ...quoteDataFromBody } = req.body;

    const { data: prevQuote } = await supabase.from('quotations')
      .select('title, total, status, customer_name, discount_value, discount_type, code')
      .eq('id', req.params.id).single();

    let quoteData = quoteDataFromBody;
    if (itemsBody === undefined) {
      const { data: fullQ } = await supabase.from('quotations').select('*').eq('id', req.params.id).single();
      if (fullQ) {
        quoteData = { ...fullQ, ...quoteDataFromBody };
        delete quoteData.id;
        delete quoteData.code;
        delete quoteData.created_at;
        delete quoteData.created_by;
      }
    }

    // Sanitize: empty strings → null for UUID fields
    const uuidFields = ['customer_id', 'lead_id', 'project_id', 'approved_by', 'company_id', 'region_id', 'fulfillment_lead_id', 'source_task_id'];
    uuidFields.forEach(f => { if (quoteData[f] === '' || quoteData[f] === undefined) quoteData[f] = null; });
    // Sanitize: empty strings → null for date fields
    ['valid_until', 'issue_date', 'sent_at', 'accepted_at', 'closed_at', 'signed_date', 'delivery_date'].forEach(f => { if (quoteData[f] === '') quoteData[f] = null; });
    let commercialCoPut = quoteData.company_id || null;
    let leadRegionIdPut = null;
    if (quoteData.lead_id) {
      const { data: lrowPut } = await supabase
        .from('crm_leads')
        .select('company_id, region_id')
        .eq('id', quoteData.lead_id)
        .maybeSingle();
      if (lrowPut?.company_id) commercialCoPut = lrowPut.company_id;
      if (lrowPut?.region_id) leadRegionIdPut = lrowPut.region_id;
    }
    const qCoPut = enforceCommercialDocCompanyOnWrite(req, res, commercialCoPut, 'Báo giá');
    if (!qCoPut.ok) return;
    commercialCoPut = qCoPut.companyId;
    quoteData.company_id = commercialCoPut;

    // region_id (PUT): nếu client gửi region_id rỗng & lead có region → kế thừa; nếu có → kiểm tra cùng company.
    if (quoteData.region_id) {
      const { data: rrowPut } = await supabase
        .from('company_regions')
        .select('id, company_id, is_active')
        .eq('id', quoteData.region_id)
        .maybeSingle();
      if (!rrowPut) return res.status(400).json({ error: 'Khu vực không tồn tại' });
      if (commercialCoPut && String(rrowPut.company_id) !== String(commercialCoPut)) {
        return res.status(400).json({ error: 'Khu vực phải cùng công ty với báo giá' });
      }
    } else if (leadRegionIdPut) {
      quoteData.region_id = leadRegionIdPut;
    }
    const quoteMoneyOrNullPut = (v) => {
      if (v === '' || v === undefined || v === null) return null;
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      const onlyDigits = String(v).replace(/\s/g, '').replace(/đ/gi, '').replace(/[^\d]/g, '');
      if (!onlyDigits) return null;
      const n = parseInt(onlyDigits, 10);
      return Number.isFinite(n) ? n : null;
    };
    if ('deposit_amount' in quoteData) quoteData.deposit_amount = quoteMoneyOrNullPut(quoteData.deposit_amount);
    if ('remaining_amount' in quoteData) quoteData.remaining_amount = quoteMoneyOrNullPut(quoteData.remaining_amount);
    if ('deposit_received' in quoteData) {
      const dr = quoteData.deposit_received;
      if (dr === '' || dr === undefined || dr === null) quoteData.deposit_received = null;
      else if (dr === true || dr === 'true') quoteData.deposit_received = true;
      else if (dr === false || dr === 'false') quoteData.deposit_received = false;
      else quoteData.deposit_received = null;
    }
    if (quoteData.deposit_label === '') quoteData.deposit_label = null;
    if (quoteData.remaining_note === '') quoteData.remaining_note = null;
    if (quoteData.source_excel_file_url === '') quoteData.source_excel_file_url = null;
    if (quoteData.source_excel_file_name === '') quoteData.source_excel_file_name = null;

    let rawItems = itemsBody;
    if (rawItems === undefined) {
      const { data: existingItems } = await supabase.from('quotation_items').select('*').eq('quotation_id', req.params.id).order('item_order');
      rawItems = existingItems || [];
    }
    
    // Calc totals with per-item VAT + spec_factor (hệ số quy cách)
    // ── Excel fidelity: nếu item.lock_amount && imported_amount → giữ NGUYÊN số tiền Excel ──
    const processedItems = buildProcessedCommercialItems(rawItems);
    const subtotal = processedItems.reduce((s, i) => s + (i.amount || 0), 0);
    const discountAmt = quoteData.discount_type === 'percent' 
      ? subtotal * (quoteData.discount_value || 0) / 100 
      : (quoteData.discount_value || 0);
    const afterRebate = subtotal - discountAmt;
    const saleDiscountAmt = quoteData.sale_discount_type === 'percent'
      ? afterRebate * (quoteData.sale_discount_value || 0) / 100
      : (quoteData.sale_discount_value || 0);
    const afterAllDiscounts = Math.max(0, afterRebate - saleDiscountAmt);
    const taxAmt = processedItems.reduce((s, i) => s + (i.vat_amount || 0), 0);

    const { data, error } = await updateQuotationRow(req.params.id, {
      ...quoteData, subtotal, discount_amount: discountAmt, sale_discount_amount: saleDiscountAmt,
      tax_amount: taxAmt, total: afterAllDiscounts + taxAmt,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;

    // Replace items with vat_rate and vat_amount
    await supabase.from('quotation_items').delete().eq('quotation_id', req.params.id);
    if (processedItems.length) {
      const itemRows = processedItems.map((item, i) => ({
        ...item, quotation_id: req.params.id, item_order: i, id: undefined,
      }));
      await supabase.from('quotation_items').insert(itemRows);
    }

    try {
      const parts = [];
      const pt = prevQuote?.total != null ? Number(prevQuote.total) : null;
      const nt = data?.total != null ? Number(data.total) : null;
      if (prevQuote && pt !== nt && pt != null && nt != null) {
        parts.push(`Tổng ${formatMoney(prevQuote.total)} → ${formatMoney(data.total)}`);
      }
      if (prevQuote && prevQuote.title !== data.title) parts.push('Đổi tiêu đề');
      if (prevQuote && prevQuote.status !== data.status) {
        parts.push(`Trạng thái ${prevQuote.status || '—'} → ${data.status || '—'}`);
      }
      const summary = parts.length ? `Cập nhật: ${parts.join('; ')}` : 'Cập nhật báo giá';
      await supabase.from('quotation_edit_history').insert({
        quotation_id: req.params.id,
        action: 'updated',
        summary,
        detail: {
          before: prevQuote ? { title: prevQuote.title, total: prevQuote.total, status: prevQuote.status } : null,
          after: { title: data.title, total: data.total, status: data.status },
          item_count: processedItems.length,
        },
        created_by: req.user.userId,
      });
    } catch (he) {
      if (!String(he.message || '').includes('does not exist')) console.warn('[quotation_edit_history]', he.message);
    }

    // AUTO-FLOW: BG chấp nhận → auto tạo ĐH + Project
    let autoResult = null;
    if (quoteData.status === 'accepted') {
      try { autoResult = await onQuotationAccepted(req.params.id, req.user.userId); } catch (e) { console.error('Auto-flow BG→ĐH error:', e.message); }
    }

    // 🔔 NOTIFICATION: Cập nhật báo giá
    try {
      const t = await getNotifyTargets(data.lead_id);
      if (t.ownerIds.length) await notifyMultiple(req, t.ownerIds, 'quotation_updated',
        '📝 Cập nhật báo giá',
        `Báo giá ${data.code} đã được cập nhật${quoteData.status === 'accepted' ? ' → Chấp nhận ✅' : ''}`,
        'quotation', data.id);
    } catch (ne) { console.warn('[NOTIFY] quotation_updated:', ne.message); }

    // Sync tiền cọc + trạng thái cọc → deal + dự án SX
    if (data?.lead_id) {
      try {
        await syncQuotationDepositToDealAndProject(data, data.lead_id);
      } catch (syncErr) {
        console.warn('[QUOTATION] Sync deposit on update error:', syncErr.message);
      }
    }

    res.json({ ...data, auto: autoResult });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
r.post('/quotations/:id/convert-to-order', async (req, res) => {
  try {
    const { data: quote } = await supabase.from('quotations').select('*').eq('id', req.params.id).single();
    if (!quote) return res.status(404).json({ error: 'Không tìm thấy báo giá' });
    if (!userMayAccessQuotationRow(req, quote)) {
      return res.status(403).json({ error: 'Không có quyền chuyển báo giá này sang đơn hàng' });
    }

    const { data: qItems } = await supabase.from('quotation_items').select('*').eq('quotation_id', req.params.id).order('item_order');

    const orderCode = await nextCode('DH');
    const { data: order, error } = await supabase.from('orders').insert({
      code: orderCode,
      ...snapshotOrderRowFromQuotation(quote),
      created_by: req.user.userId,
    }).select('*').single();
    if (error) throw error;

    if (qItems?.length) {
      await supabase.from('order_items').insert(mapQuotationItemsToOrderRows(qItems, order.id));
    }

    // Update quotation status
    await supabase.from('quotations').update({ status: 'converted', updated_at: new Date().toISOString() }).eq('id', req.params.id);

    // 🔔 NOTIFICATION: BG → ĐH
    try {
      const t = await getNotifyTargets(order.lead_id);
      const allIds = [...new Set([...t.ownerIds, ...t.adminIds])];
      if (allIds.length) await notifyMultiple(req, allIds, 'order_created',
        '🛒 Đơn hàng mới từ báo giá',
        `Đơn hàng ${orderCode} được tạo từ BG ${quote.code} — ${formatMoney(order.total)}`,
        'order', order.id);
    } catch (ne) { console.warn('[NOTIFY] bg_to_dh:', ne.message); }

    res.status(201).json(order);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══ DELETE QUOTATION ═══
r.delete('/quotations/:id', async (req, res) => {
  try {
    const { data: delScope } = await supabase
      .from('quotations')
      .select('created_by, company_id, code, lead_id, customer_name')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!delScope) return res.status(404).json({ error: 'Không tìm thấy báo giá' });
    if (!userMayAccessQuotationRow(req, delScope)) {
      return res.status(403).json({ error: 'Không có quyền xóa báo giá này' });
    }
    const delQ = { code: delScope.code, lead_id: delScope.lead_id, customer_name: delScope.customer_name };

    // Unlink orders referencing this quotation
    await supabase.from('orders').update({ quotation_id: null }).eq('quotation_id', req.params.id);
    // Delete items
    await supabase.from('quotation_items').delete().eq('quotation_id', req.params.id);
    // Delete quotation
    const { error } = await supabase.from('quotations').delete().eq('id', req.params.id);
    if (error) throw error;

    // 🔔 NOTIFICATION: Xóa báo giá
    try {
      const t = await getNotifyTargets(delQ?.lead_id);
      if (t.adminIds.length) await notifyMultiple(req, t.adminIds, 'item_deleted',
        '🗑️ Báo giá đã xóa',
        `Báo giá ${delQ?.code || ''} — KH: ${delQ?.customer_name || 'N/A'} đã bị xóa`,
        'quotation', req.params.id);
    } catch (ne) {}

    res.json({ message: 'Đã xóa báo giá' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// ORDERS (Đơn hàng)
// ═══════════════════════════════════════════════════════════════════════════
r.get('/orders', async (req, res) => {
  try {
    const { status, search, limit = 50, lead_id, company_id: coQ } = req.query;
    let q = supabase.from('orders')
      .select('*, customer:customers(id, full_name, phone), creator:users!orders_created_by_fkey(id, full_name)')
      .order('created_at', { ascending: false }).limit(parseInt(limit));
    const oScope = resolveCommercialDocListCompanyScope(req, res, coQ);
    if (!oScope.ok) return;
    if (oScope.companyId) q = q.eq('company_id', oScope.companyId);
    if (status) q = q.eq('status', status);
    if (search) q = q.or(`code.ilike.%${search}%,title.ilike.%${search}%,customer_name.ilike.%${search}%`);
    if (lead_id && /^[0-9a-f-]{36}$/i.test(String(lead_id))) q = await applyLeadOrCustomerSalesFilter(q, lead_id);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/orders/:id', async (req, res) => {
  try {
    const { data: order } = await supabase.from('orders')
      .select('*, fulfillment_lead_id, lead_id, customer:customers(id, full_name, phone, email, address, company, tax_code)')
      .eq('id', req.params.id).single();
    let { data: items } = await supabase.from('order_items')
      .select('*, product:products(id, name, code)')
      .eq('order_id', req.params.id).order('item_order');
    items = items || [];
    let source_quotation = null;
    if (order?.quotation_id) {
      const { data: q } = await supabase.from('quotations')
        .select('id, code, notes, valid_until, delivery_terms, payment_terms, deposit_amount, deposit_received, deposit_label, remaining_amount, remaining_note, description')
        .eq('id', order.quotation_id).maybeSingle();
      source_quotation = q || null;
      // Đơn hàng không có dòng (lỗi copy trước đây / DB trống) — hiển thị dòng từ báo giá gốc
      if (!items.length) {
        const { data: qItems } = await supabase.from('quotation_items')
          .select('*, product:products(id, name, code)')
          .eq('quotation_id', order.quotation_id).order('item_order');
        if (qItems?.length) items = qItems;
      }
    }
    res.json({ ...order, items, source_quotation });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/orders/:id', async (req, res) => {
  try {
    const { items: itemsBody, ...updatesFromBody } = req.body;
    const updates = { ...updatesFromBody, updated_at: new Date().toISOString() };
    // Sanitize: empty strings → null for UUID fields
    ['customer_id', 'lead_id', 'quotation_id', 'project_id'].forEach(f => {
      if (updates[f] === '') updates[f] = null;
    });
    if (updates.status === 'confirmed' && !updates.confirmed_at) updates.confirmed_at = new Date().toISOString();
    if (updates.status === 'shipped' && !updates.shipped_at) updates.shipped_at = new Date().toISOString();
    if (updates.status === 'delivered' && !updates.delivered_at) updates.delivered_at = new Date().toISOString();
    if (updates.status === 'cancelled' && !updates.cancelled_at) updates.cancelled_at = new Date().toISOString();

    // ── Re-tính totals + lưu lại order_items khi có gửi items (form Sửa đơn hàng) ──
    // Cùng logic Excel fidelity với /quotations: lock_amount/imported_amount giữ nguyên số tiền gốc.
    if (Array.isArray(itemsBody)) {
      const processedItems = buildProcessedCommercialItems(itemsBody);
      const subtotal = processedItems.reduce((s, i) => s + (i.amount || 0), 0);
      const discountAmt = updates.discount_type === 'percent' ? subtotal * (updates.discount_value || 0) / 100 : (updates.discount_value || 0);
      const afterDiscount = subtotal - discountAmt;
      const taxAmt = processedItems.reduce((s, i) => s + (i.vat_amount || 0), 0);
      updates.subtotal = subtotal;
      updates.discount_amount = discountAmt;
      updates.tax_amount = taxAmt;
      updates.total = afterDiscount + taxAmt;

      await supabase.from('order_items').delete().eq('order_id', req.params.id);
      if (processedItems.length) {
        await supabase.from('order_items').insert(processedItems.map((item, i) => ({
          ...item, order_id: req.params.id, item_order: i,
        })));
      }
    }

    const { data, error } = await supabase.from('orders').update(updates).eq('id', req.params.id).select('*').single();
    if (error) throw error;

    // AUTO-FLOW: ĐH xác nhận → tự động tạo Project + Gen Tasks
    let autoProject = null;
    if (updates.status === 'confirmed') {
      try { autoProject = await onOrderConfirmed(req.params.id, req.user.userId); } catch (e) { console.error('Auto-flow error:', e.message); }
    }

    // 🔔 NOTIFICATION: Cập nhật đơn hàng
    try {
      const statusLabels = { confirmed: 'Đã xác nhận', shipped: 'Đang giao', delivered: 'Đã giao', cancelled: 'Đã hủy' };
      const statusLabel = statusLabels[updates.status] || '';
      const t = await getNotifyTargets(data.lead_id);
      const allIds = [...new Set([...t.ownerIds, ...t.adminIds])];
      if (allIds.length && updates.status) await notifyMultiple(req, allIds, 'order_updated',
        `📦 ĐH ${data.code} — ${statusLabel}`,
        `Đơn hàng ${data.code} cập nhật trạng thái: ${statusLabel}`,
        'order', data.id);
    } catch (ne) { console.warn('[NOTIFY] order_updated:', ne.message); }

    res.json({ ...data, auto_project: autoProject });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/orders', async (req, res) => {
  try {
    const { items, ...orderData } = req.body;
    const code = await nextCode('DH');

    // Sanitize: empty strings → null for UUID fields
    ['customer_id', 'lead_id', 'quotation_id', 'project_id', 'company_id'].forEach(f => {
      if (orderData[f] === '' || orderData[f] === undefined) orderData[f] = null;
    });

    let orderCo = orderData.company_id || null;
    if (orderData.lead_id) {
      const { data: lrow } = await supabase.from('crm_leads').select('company_id').eq('id', orderData.lead_id).maybeSingle();
      if (lrow?.company_id) orderCo = lrow.company_id;
    } else if (orderData.quotation_id) {
      const { data: qrow } = await supabase.from('quotations').select('company_id, lead_id').eq('id', orderData.quotation_id).maybeSingle();
      if (qrow?.company_id) orderCo = qrow.company_id;
      else if (qrow?.lead_id) {
        const { data: l2 } = await supabase.from('crm_leads').select('company_id').eq('id', qrow.lead_id).maybeSingle();
        if (l2?.company_id) orderCo = l2.company_id;
      }
    }
    const oCoWrite = enforceCommercialDocCompanyOnWrite(req, res, orderCo, 'Đơn hàng');
    if (!oCoWrite.ok) return;
    orderCo = oCoWrite.companyId;
    orderData.company_id = orderCo;

    // Calc totals with per-item VAT + spec_factor (hệ số quy cách) — cùng logic với /quotations
    // Excel fidelity: nếu item.lock_amount && imported_amount → giữ NGUYÊN số tiền Excel.
    const processedItems = buildProcessedCommercialItems(items);
    const subtotal = processedItems.reduce((s, i) => s + (i.amount || 0), 0);
    const discountAmt = orderData.discount_type === 'percent' ? subtotal * (orderData.discount_value || 0) / 100 : (orderData.discount_value || 0);
    const afterDiscount = subtotal - discountAmt;
    const taxAmt = processedItems.reduce((s, i) => s + (i.vat_amount || 0), 0);

    const { data, error } = await supabase.from('orders').insert({
      ...orderData, code, subtotal, discount_amount: discountAmt,
      tax_amount: taxAmt, total: afterDiscount + taxAmt, created_by: req.user.userId,
    }).select('*').single();
    if (error) throw error;

    // AUTO: create fulfillment deal (CRMTasks) for this order
    try {
      if (data?.lead_id) {
        const { data: parentDeal } = await supabase
          .from('crm_leads')
          .select('id, title, customer_id, company_id, pipeline_id, stage_id, assigned_to, lead_owner_id, estimated_value, parent_lead_id, project_id, code')
          .eq('id', data.lead_id)
          .maybeSingle();
        if (parentDeal?.id) {
          const displayLabel = data.title || data.code || 'Đơn hàng';
          const childLeadId = await createFulfillmentChildDeal({
            parentDeal,
            masterProjectId: data.project_id || parentDeal.project_id || null,
            displayLabel,
            userId: req.user.userId,
            estimatedValue: data.total || 0,
          });
          const { error: uErr } = await supabase.from('orders').update({ fulfillment_lead_id: childLeadId }).eq('id', data.id);
          if (!uErr) data.fulfillment_lead_id = childLeadId;
        }
      }
    } catch (fe) {
      console.warn('[crm/orders] create fulfillment deal:', fe.message);
    }

    if (processedItems.length) {
      await supabase.from('order_items').insert(processedItems.map((item, i) => ({
        ...item, order_id: data.id, item_order: i,
      })));
    }

    // 🔔 NOTIFICATION: Đơn hàng mới
    try {
      const t = await getNotifyTargets(data.lead_id);
      const allIds = [...new Set([...t.ownerIds, ...t.adminIds])];
      if (allIds.length) await notifyMultiple(req, allIds, 'order_created',
        '🛒 Đơn hàng mới',
        `Đơn hàng ${code} — KH: ${data.customer_name || 'N/A'} — ${formatMoney(data.total)}`,
        'order', data.id);
    } catch (ne) { console.warn('[NOTIFY] order_created:', ne.message); }

    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Convert: Order → Invoice
r.post('/orders/:id/create-invoice', async (req, res) => {
  try {
    const { data: order } = await supabase.from('orders').select('*').eq('id', req.params.id).single();
    if (!order) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });

    const { data: oItems } = await supabase.from('order_items').select('*').eq('order_id', req.params.id).order('item_order');

    const invCode = await nextCode('HD');
    const { data: invoice, error } = await supabase.from('invoices').insert({
      code: invCode,
      company_id: order.company_id || null,
      customer_id: order.customer_id, customer_name: order.customer_name,
      customer_phone: order.customer_phone, customer_address: order.customer_address,
      order_id: order.id, quotation_id: order.quotation_id, project_id: order.project_id,
      title: order.title, subtotal: order.subtotal, discount_type: order.discount_type,
      discount_value: order.discount_value, discount_amount: order.discount_amount,
      tax_rate: order.tax_rate, tax_amount: order.tax_amount, total: order.total,
      created_by: req.user.userId,
    }).select('*').single();
    if (error) throw error;

    if (oItems?.length) {
      await supabase.from('invoice_items').insert(oItems.map(oi => ({
        invoice_id: invoice.id, product_id: oi.product_id, product_code: oi.product_code, order_item_id: oi.id,
        item_order: oi.item_order, name: oi.name, description: oi.description,
        unit: oi.unit, quantity: oi.quantity, unit_price: oi.unit_price,
        spec_factor: oi.spec_factor || null, standard_area: oi.standard_area || null,
        height: oi.height || null, width: oi.width || null, length: oi.length || null, weight: oi.weight || null,
        discount_percent: oi.discount_percent, discount_amount: oi.discount_amount || 0, amount: oi.amount,
        vat_rate: oi.vat_rate || 0, vat_amount: oi.vat_amount || 0, tax_amount: oi.tax_amount || oi.vat_amount || 0,
        total: oi.total || oi.amount, promo_code: oi.promo_code || null, is_promo: oi.is_promo || false,
        group_name: oi.group_name || null, notes: oi.notes,
      })));
    }

    res.status(201).json(invoice);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══ DELETE ORDER ═══
r.delete('/orders/:id', async (req, res) => {
  try {
    // Get info before delete
    const { data: delO } = await supabase.from('orders').select('code, lead_id, customer_name').eq('id', req.params.id).single();
    await supabase.from('order_items').delete().eq('order_id', req.params.id);
    const { error } = await supabase.from('orders').delete().eq('id', req.params.id);
    if (error) throw error;

    // 🔔 NOTIFICATION: Xóa đơn hàng
    try {
      const t = await getNotifyTargets(delO?.lead_id);
      if (t.adminIds.length) await notifyMultiple(req, t.adminIds, 'item_deleted',
        '🗑️ Đơn hàng đã xóa',
        `Đơn hàng ${delO?.code || ''} — KH: ${delO?.customer_name || 'N/A'} đã bị xóa`,
        'order', req.params.id);
    } catch (ne) {}

    res.json({ message: 'Đã xóa đơn hàng' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// INVOICES (Hóa đơn)
// ═══════════════════════════════════════════════════════════════════════════
r.get('/invoices', async (req, res) => {
  try {
    const { status, search, limit = 50, lead_id, company_id: coQ } = req.query;
    let q = supabase.from('invoices')
      .select('*, customer:customers(id, full_name, phone), creator:users!invoices_created_by_fkey(id, full_name)')
      .order('created_at', { ascending: false }).limit(parseInt(limit));
    const iScope = resolveCommercialDocListCompanyScope(req, res, coQ);
    if (!iScope.ok) return;
    if (iScope.companyId) q = q.eq('company_id', iScope.companyId);
    if (status) q = q.eq('status', status);
    if (search) q = q.or(`code.ilike.%${search}%,title.ilike.%${search}%,customer_name.ilike.%${search}%`);
    if (lead_id && /^[0-9a-f-]{36}$/i.test(String(lead_id))) q = await applyLeadOrCustomerSalesFilter(q, lead_id);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/invoices/:id', async (req, res) => {
  try {
    const { data: invoice } = await supabase.from('invoices')
      .select('*, customer:customers(id, full_name, phone, email, address, company, tax_code)')
      .eq('id', req.params.id).single();
    const { data: items } = await supabase.from('invoice_items')
      .select('*, product:products(id, name, code)')
      .eq('invoice_id', req.params.id).order('item_order');
    const { data: payments } = await supabase.from('payment_records')
      .select('*').eq('invoice_id', req.params.id).order('payment_date', { ascending: false });
    res.json({ ...invoice, items: items || [], payments: payments || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create invoice directly (not from order)
r.post('/invoices', async (req, res) => {
  try {
    const { items, ...invoiceData } = req.body;
    const code = await nextCode('HD');

    // Sanitize: empty strings → null for UUID fields
    ['customer_id', 'order_id', 'quotation_id', 'project_id', 'company_id', 'lead_id'].forEach(f => {
      if (invoiceData[f] === '' || invoiceData[f] === undefined) invoiceData[f] = null;
    });

    let invCo = invoiceData.company_id || null;
    if (invoiceData.lead_id) {
      const { data: lrow } = await supabase.from('crm_leads').select('company_id').eq('id', invoiceData.lead_id).maybeSingle();
      if (lrow?.company_id) invCo = lrow.company_id;
    } else if (invoiceData.order_id) {
      const { data: orow } = await supabase.from('orders').select('company_id').eq('id', invoiceData.order_id).maybeSingle();
      if (orow?.company_id) invCo = orow.company_id;
    } else if (invoiceData.quotation_id) {
      const { data: qr } = await supabase.from('quotations').select('company_id').eq('id', invoiceData.quotation_id).maybeSingle();
      if (qr?.company_id) invCo = qr.company_id;
    }
    const iCoWrite = enforceCommercialDocCompanyOnWrite(req, res, invCo, 'Hóa đơn');
    if (!iCoWrite.ok) return;
    invCo = iCoWrite.companyId;

    // Calc totals with per-item VAT + spec_factor (hệ số quy cách) — cùng logic với /quotations, /orders
    // Excel fidelity: nếu item.lock_amount && imported_amount → giữ NGUYÊN số tiền Excel.
    const processedItems = buildProcessedCommercialItems(items);
    const subtotal = processedItems.reduce((s, i) => s + (i.amount || 0), 0);
    const discountAmt = invoiceData.discount_type === 'percent' ? subtotal * (invoiceData.discount_value || 0) / 100 : (invoiceData.discount_value || 0);
    const afterDiscount = subtotal - discountAmt;
    const taxAmt = processedItems.reduce((s, i) => s + (i.vat_amount || 0), 0);

    const { data: inv, error } = await supabase.from('invoices').insert({
      code,
      company_id: invCo,
      lead_id: invoiceData.lead_id || null,
      order_id: invoiceData.order_id || null,
      quotation_id: invoiceData.quotation_id || null,
      project_id: invoiceData.project_id || null,
      customer_id: invoiceData.customer_id,
      customer_name: invoiceData.customer_name || null,
      customer_phone: invoiceData.customer_phone || null,
      customer_address: invoiceData.customer_address || null,
      customer_tax_code: invoiceData.customer_tax_code || null,
      title: invoiceData.title || null,
      subtotal,
      discount_type: invoiceData.discount_type || null,
      discount_value: invoiceData.discount_value || 0,
      discount_amount: discountAmt,
      tax_amount: taxAmt,
      total: afterDiscount + taxAmt,
      notes: invoiceData.notes || null,
      due_date: invoiceData.due_date || null,
      payment_terms: invoiceData.payment_terms || null,
      created_by: req.user.userId,
    }).select('*').single();
    if (error) throw error;

    if (processedItems.length) {
      await supabase.from('invoice_items').insert(processedItems.map((item, i) => ({
        ...item, invoice_id: inv.id, item_order: i,
      })));
    }

    // 🔔 NOTIFICATION: Hóa đơn mới
    try {
      const { data: admins } = await supabase.from('users').select('id').eq('role', 'admin').eq('is_active', true);
      const adminIds = (admins || []).map(u => u.id);
      if (adminIds.length) await notifyMultiple(req, adminIds, 'invoice_created',
        '🧾 Hóa đơn mới',
        `Hóa đơn ${code} — KH: ${inv.customer_name || 'N/A'} — ${formatMoney(inv.total)}`,
        'invoice', inv.id);
    } catch (ne) { console.warn('[NOTIFY] invoice_created:', ne.message); }

    res.status(201).json(inv);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Add items to invoice (batch) — legacy endpoint, giữ để tương thích ngược
r.post('/invoices/:id/items', async (req, res) => {
  try {
    const { items } = req.body;
    if (!items?.length) return res.status(400).json({ error: 'Không có hàng hóa' });
    const processedItems = buildProcessedCommercialItems(items);
    const itemRows = processedItems.map((item, i) => ({ ...item, invoice_id: req.params.id, item_order: i }));
    const { data, error } = await supabase.from('invoice_items').insert(itemRows).select();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══ UPDATE INVOICE (giống PUT /orders/:id) ═══
r.put('/invoices/:id', async (req, res) => {
  try {
    const { items: itemsBody, ...updatesFromBody } = req.body;
    const updates = { ...updatesFromBody, updated_at: new Date().toISOString() };
    // Sanitize: empty strings → null for UUID fields
    ['customer_id', 'order_id', 'quotation_id', 'project_id', 'company_id', 'lead_id'].forEach(f => {
      if (updates[f] === '') updates[f] = null;
    });
    if (updates.payment_status === 'paid' && !updates.paid_at) updates.paid_at = new Date().toISOString();

    // ── Re-tính totals + lưu lại invoice_items khi có gửi items (form Sửa hóa đơn) ──
    // Cùng logic Excel fidelity với /quotations, /orders: lock_amount/imported_amount giữ nguyên số tiền gốc.
    if (Array.isArray(itemsBody)) {
      const processedItems = buildProcessedCommercialItems(itemsBody);
      const subtotal = processedItems.reduce((s, i) => s + (i.amount || 0), 0);
      const discountAmt = updates.discount_type === 'percent' ? subtotal * (updates.discount_value || 0) / 100 : (updates.discount_value || 0);
      const afterDiscount = subtotal - discountAmt;
      const taxAmt = processedItems.reduce((s, i) => s + (i.vat_amount || 0), 0);
      updates.subtotal = subtotal;
      updates.discount_amount = discountAmt;
      updates.tax_amount = taxAmt;
      updates.total = afterDiscount + taxAmt;

      await supabase.from('invoice_items').delete().eq('invoice_id', req.params.id);
      if (processedItems.length) {
        await supabase.from('invoice_items').insert(processedItems.map((item, i) => ({
          ...item, invoice_id: req.params.id, item_order: i,
        })));
      }
    }

    const { data, error } = await supabase.from('invoices').update(updates).eq('id', req.params.id).select('*').single();
    if (error) throw error;

    // 🔔 NOTIFICATION: Cập nhật hóa đơn
    try {
      const statusLabels = { paid: 'Đã thanh toán đủ', partial: 'Thanh toán 1 phần', unpaid: 'Chưa thanh toán' };
      const statusLabel = statusLabels[updates.payment_status] || '';
      const t = await getNotifyTargets(data.lead_id);
      const allIds = [...new Set([...t.ownerIds, ...t.adminIds])];
      if (allIds.length && updates.payment_status) await notifyMultiple(req, allIds, 'invoice_updated',
        `🧾 HĐ ${data.code} — ${statusLabel}`,
        `Hóa đơn ${data.code} cập nhật trạng thái: ${statusLabel}`,
        'invoice', data.id);
    } catch (ne) { console.warn('[NOTIFY] invoice_updated:', ne.message); }

    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Record payment
r.post('/invoices/:id/payments', async (req, res) => {
  try {
    const body = { ...req.body };
    ['order_id', 'invoice_id'].forEach(f => { if (body[f] === '') body[f] = null; });
    const { data: payment, error } = await supabase.from('payment_records')
      .insert({ ...body, invoice_id: req.params.id, created_by: req.user.userId })
      .select('*').single();
    if (error) throw error;

    // Update invoice paid_amount
    const { data: allPayments } = await supabase.from('payment_records')
      .select('amount').eq('invoice_id', req.params.id);
    const totalPaid = (allPayments || []).reduce((s, p) => s + (p.amount || 0), 0);

    const { data: invoice } = await supabase.from('invoices').select('total').eq('id', req.params.id).single();
    const paymentStatus = totalPaid >= (invoice?.total || 0) ? 'paid' : totalPaid > 0 ? 'partial' : 'unpaid';

    await supabase.from('invoices').update({
      paid_amount: totalPaid, payment_status: paymentStatus,
      paid_at: paymentStatus === 'paid' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id);

    // 🔔 NOTIFICATION: Thanh toán
    try {
      const { data: inv } = await supabase.from('invoices').select('code, lead_id, customer_name, total, order_id').eq('id', req.params.id).single();
      const t = await getNotifyTargets(inv?.lead_id);
      const allIds = [...new Set([...t.ownerIds, ...t.adminIds])];
      const paidLabel = paymentStatus === 'paid' ? '✅ Đã thanh toán đủ' : '💰 Nhận thanh toán';
      if (allIds.length) await notifyMultiple(req, allIds, 'payment_received',
        paidLabel,
        `${inv?.code || 'HĐ'} — Nhận ${formatMoney(payment.amount)} (${formatMoney(totalPaid)}/${formatMoney(inv?.total)})`,
        'invoice', req.params.id);
    } catch (ne) { console.warn('[NOTIFY] payment:', ne.message); }

    res.status(201).json(payment);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══ DELETE INVOICE ═══
r.delete('/invoices/:id', async (req, res) => {
  try {
    // Get info before delete
    const { data: delI } = await supabase.from('invoices').select('code, customer_name').eq('id', req.params.id).single();
    await supabase.from('payment_records').delete().eq('invoice_id', req.params.id);
    await supabase.from('invoice_items').delete().eq('invoice_id', req.params.id);
    const { error } = await supabase.from('invoices').delete().eq('id', req.params.id);
    if (error) throw error;

    // 🔔 NOTIFICATION: Xóa hóa đơn
    try {
      const { data: admins } = await supabase.from('users').select('id').eq('role', 'admin').eq('is_active', true);
      const adminIds = (admins || []).map(u => u.id);
      if (adminIds.length) await notifyMultiple(req, adminIds, 'item_deleted',
        '🗑️ Hóa đơn đã xóa',
        `Hóa đơn ${delI?.code || ''} — KH: ${delI?.customer_name || 'N/A'} đã bị xóa`,
        'invoice', req.params.id);
    } catch (ne) {}

    res.json({ message: 'Đã xóa hóa đơn' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ MISA meInvoice — Phát hành hóa đơn điện tử ═══

// POST /invoices/:id/misa-publish — Phát hành HĐĐT lên MISA meInvoice
r.post('/invoices/:id/misa-publish', async (req, res) => {
  try {
    if (!misaService) return res.status(503).json({ error: 'MISA service chưa được cấu hình' });

    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .select('*, customer:customers(id, full_name, email, tax_code)')
      .eq('id', req.params.id).single();
    if (invErr || !invoice) return res.status(404).json({ error: 'Không tìm thấy hóa đơn' });

    if (invoice.misa_status === 'published') {
      return res.status(400).json({ error: 'Hóa đơn đã được phát hành lên MISA (số: ' + invoice.misa_invoice_no + ')' });
    }

    const { data: items } = await supabase
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', req.params.id)
      .order('item_order');

    // Gắn email từ customer nếu invoice không có
    const invoiceWithEmail = {
      ...invoice,
      customer_email: invoice.customer_email || invoice.customer?.email || '',
    };

    const result = await misaService.publishInvoice(invoiceWithEmail, items || []);

    // Cập nhật trạng thái MISA vào DB
    await supabase.from('invoices').update({
      misa_status: 'published',
      misa_invoice_no: result.invoiceNo,
      misa_lookup_code: result.lookupCode,
      misa_ref_id: invoice.id,
      misa_published_at: new Date().toISOString(),
      misa_error_message: null,
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id);

    res.json({
      success: true,
      invoiceNo: result.invoiceNo,
      lookupCode: result.lookupCode,
    });
  } catch (e) {
    // Lưu lỗi vào DB để dễ debug
    await supabase.from('invoices').update({
      misa_error_message: e.message,
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id);
    res.status(500).json({ error: e.message });
  }
});

// POST /invoices/:id/misa-send-email — Gửi email HĐĐT qua MISA
r.post('/invoices/:id/misa-send-email', async (req, res) => {
  try {
    if (!misaService) return res.status(503).json({ error: 'MISA service chưa được cấu hình' });

    const { data: invoice } = await supabase
      .from('invoices')
      .select('misa_invoice_no, misa_status, customer_name, customer:customers(email)')
      .eq('id', req.params.id).single();

    if (!invoice) return res.status(404).json({ error: 'Không tìm thấy hóa đơn' });
    if (invoice.misa_status !== 'published' && invoice.misa_status !== 'sent_email') {
      return res.status(400).json({ error: 'Hóa đơn chưa được phát hành lên MISA' });
    }

    const email = req.body.email || invoice.customer?.email || '';
    if (!email) return res.status(400).json({ error: 'Không có địa chỉ email để gửi' });

    await misaService.sendEmailInvoice(
      invoice.misa_invoice_no,
      email,
      invoice.customer_name || ''
    );

    await supabase.from('invoices').update({
      misa_status: 'sent_email',
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id);

    res.json({ success: true, sentTo: email });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /invoices/:id/misa-status — Kiểm tra trạng thái HĐĐT từ MISA
r.get('/invoices/:id/misa-status', async (req, res) => {
  try {
    if (!misaService) return res.status(503).json({ error: 'MISA service chưa được cấu hình' });

    const { data: invoice } = await supabase
      .from('invoices')
      .select('id, misa_status, misa_invoice_no, misa_ref_id, misa_published_at, misa_lookup_code, misa_error_message')
      .eq('id', req.params.id).single();

    if (!invoice) return res.status(404).json({ error: 'Không tìm thấy hóa đơn' });

    let misaDetail = null;
    if (invoice.misa_ref_id) {
      try {
        misaDetail = await misaService.getInvoiceStatus(invoice.misa_ref_id);
      } catch (statusErr) {
        // Không ném lỗi, chỉ trả local status
      }
    }

    res.json({
      localStatus: invoice.misa_status,
      invoiceNo: invoice.misa_invoice_no,
      publishedAt: invoice.misa_published_at,
      lookupCode: invoice.misa_lookup_code,
      errorMessage: invoice.misa_error_message,
      misaDetail,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Convert Lead → Project
r.post('/leads/:id/convert-to-project', async (req, res) => {
  // NOTE: notification added at the end of this handler
  try {
    const { data: lead } = await supabase.from('crm_leads').select('*, customer:customers(id, full_name)').eq('id', req.params.id).single();
    if (!lead) return res.status(404).json({ error: 'Lead không tồn tại' });

    if (await enforceQuotaForRequest(req, res, lead.company_id, 'projects_total')) return;

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

// ═══════════════════════════════════════════════════════════════════════════
// PROJECT CRM SUMMARY — Tab CRM trong ProjectDetail
// ═══════════════════════════════════════════════════════════════════════════
r.get('/project/:projectId/summary', async (req, res) => {
  try {
    const summary = await getProjectCRMSummary(req.params.projectId);
    res.json(summary);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// Project Lead Documents — fast lookup by project_id (no full leads scan)
// ═══════════════════════════════════════════════════════════════════════════
r.get('/project/:projectId/lead-documents', async (req, res) => {
  try {
    const { leadDocVisibleForModuleAndUser } = require('../helpers/documentShareScope');
    const forModule = String(req.query.for_module || '').toLowerCase().trim();
    const useMod = ['production', 'logistics', 'workshop'].includes(forModule) ? forModule : null;

    // Find lead linked to this project
    const { data: lead } = await supabase
      .from('crm_leads')
      .select('id, company_id')
      .eq('project_id', req.params.projectId)
      .limit(1)
      .single();

    if (!lead) return res.json([]);
    const visOpts = { leadCompanyId: lead.company_id || null };

    const { data: docs } = await supabase
      .from('lead_documents')
      .select('*, creator:users!lead_documents_created_by_fkey(id, full_name)')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false });

    let rows = docs || [];
    if (useMod) {
      rows = rows.filter((d) => leadDocVisibleForModuleAndUser(d, useMod, req.user, visOpts));
    }
    res.json(rows);
  } catch (e) {
    // No lead found → empty
    res.json([]);
  }
});

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

// ═══════════════════════════════════════════════════════════════════════════
// CRM PRODUCTS
// ═══════════════════════════════════════════════════════════════════════════
r.get('/products-list', async (req, res) => {
  try {
    const rawQ = req.query.company_id && String(req.query.company_id).trim();
    const pScope = resolveCommercialDocListCompanyScope(req, res, rawQ);
    if (!pScope.ok) return;
    const effectiveCompanyId = pScope.companyId;
    let q = supabase.from('products').select('*').order('name');
    if (effectiveCompanyId) q = q.eq('company_id', effectiveCompanyId);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.put('/products/:id', async (req, res) => {
  try {
    const { data: existing, error: exErr } = await supabase.from('products').select('company_id, category_id').eq('id', req.params.id).maybeSingle();
    if (exErr) throw exErr;
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
    if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      if (existing.company_id && String(existing.company_id) !== String(cid)) {
        return res.status(403).json({ error: 'Không có quyền sửa sản phẩm công ty khác' });
      }
    }
    const b = { ...req.body };
    if (!userIsAdmin(req.user?.role)) delete b.company_id;
    if (userIsAdmin(req.user?.role) && Object.prototype.hasOwnProperty.call(b, 'company_id')) {
      b.company_id = String(b.company_id || '').trim() || null;
    } else {
      const newCat = b.category_id !== undefined ? b.category_id : existing.category_id;
      if (newCat) {
        const { data: cat } = await supabase.from('product_categories').select('company_id').eq('id', newCat).maybeSingle();
        if (cat?.company_id) b.company_id = cat.company_id;
      }
    }
    b.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from('products').update(b).eq('id', req.params.id).select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/products', async (req, res) => {
  try {
    const row = { ...req.body };
    if (userIsAdmin(req.user?.role)) {
      if (row.company_id !== undefined) row.company_id = String(row.company_id || '').trim() || null;
    } else {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      row.company_id = cid;
    }
    if (!row.company_id && row.category_id) {
      const { data: cat } = await supabase.from('product_categories').select('company_id').eq('id', row.category_id).maybeSingle();
      if (cat?.company_id) row.company_id = cat.company_id;
    }
    const { data, error } = await supabase.from('products').insert(row).select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// FOLLOW-UP ALERTS
// ═══════════════════════════════════════════════════════════════════════════
r.get('/alerts/follow-ups', async (req, res) => {
  try {
    const overdue = await getOverdueFollowUps();
    const stale = await getStaleLeads(parseInt(req.query.days) || 7);
    res.json({ overdue, stale, total: overdue.length + stale.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// PROJECT COMPLETE → AUTO INVOICE
// ═══════════════════════════════════════════════════════════════════════════
r.post('/project/:projectId/auto-invoice', async (req, res) => {
  try {
    const invoices = await onProjectCompleted(req.params.projectId, req.user.userId);

    // 🔔 NOTIFICATION: Auto hóa đơn
    if (invoices.length) {
      try {
        const { data: admins } = await supabase.from('users').select('id').eq('role', 'admin').eq('is_active', true);
        const adminIds = (admins || []).map(u => u.id);
        if (adminIds.length) await notifyMultiple(req, adminIds, 'invoice_created',
          '🧾 Tự động tạo hóa đơn',
          `Dự án hoàn thành → tạo ${invoices.length} hóa đơn`,
          'project', req.params.projectId);
      } catch (ne) { console.warn('[NOTIFY] auto_invoice:', ne.message); }
    }

    res.json({ created: invoices.length, invoices });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// LEAD ↔ PROJECT SYNC: Tasks/Checklists + Stage Progress
// ═══════════════════════════════════════════════════════════════════════════

// Get project tasks & checklists for a lead (activity history)
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
const defaultCompanyInfo = require('../config/companyInfo');

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
} = require('../helpers/quotationExcelParser');

const excelUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

/** Liệt kê sheet trong file Excel + gợi ý sheet giống báo giá (heuristic header). */
r.post('/quotations/excel-sheets', excelUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Chưa chọn file' });
    res.json(listQuotationExcelSheets(req.file.buffer));
  } catch (e) {
    console.error('[excel-sheets]', e);
    res.status(500).json({ error: e.message || 'Lỗi đọc file' });
  }
});

r.post('/quotations/parse-excel', excelUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Chưa chọn file' });
    const data = await parseQuotationExcelBuffer(req.file.buffer, { sheetName: req.body?.sheet_name });
    res.json(data);
  } catch (e) {
    console.error('[parse-excel]', e);
    res.status(500).json({ error: e.message?.startsWith('Lỗi đọc file Excel') ? e.message : 'Lỗi đọc file Excel: ' + e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// IMPORT EXCEL → TẠO BÁO GIÁ TỪ TASK (parse + tạo quotation + complete task + sync KH)
// ═══════════════════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════════════════
// PDF EXPORT ENDPOINTS
r.get('/quotations/:id/pdf', async (req, res) => {
  try {
    const { data: quote } = await supabase.from('quotations')
      .select('*, customer:customers(id, full_name, phone, email, address, company, tax_code)')
      .eq('id', req.params.id).single();
    if (!quote) return res.status(404).json({ error: 'Khong tim thay bao gia' });
    if (!userMayAccessQuotationRow(req, quote)) {
      return res.status(403).json({ error: 'Khong co quyen xuat PDF bao gia nay' });
    }
    const { data: items } = await supabase.from('quotation_items')
      .select('*, product:products(id, name, code)')
      .eq('quotation_id', req.params.id).order('item_order');
    generateDocPdf(res, quote, items || [], 'quotation');
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/orders/:id/pdf', async (req, res) => {
  try {
    const { data: order } = await supabase.from('orders')
      .select('*, customer:customers(id, full_name, phone, email, address, company, tax_code)')
      .eq('id', req.params.id).single();
    if (!order) return res.status(404).json({ error: 'Khong tim thay don hang' });
    const { data: items } = await supabase.from('order_items')
      .select('*, product:products(id, name, code)')
      .eq('order_id', req.params.id).order('item_order');
    generateDocPdf(res, order, items || [], 'order');
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/invoices/:id/pdf', async (req, res) => {
  try {
    const { data: invoice } = await supabase.from('invoices')
      .select('*, customer:customers(id, full_name, phone, email, address, company, tax_code)')
      .eq('id', req.params.id).single();
    if (!invoice) return res.status(404).json({ error: 'Khong tim thay hoa don' });
    const { data: items } = await supabase.from('invoice_items')
      .select('*, product:products(id, name, code)')
      .eq('invoice_id', req.params.id).order('item_order');
    generateDocPdf(res, invoice, items || [], 'invoice');
  } catch (e) { res.status(500).json({ error: e.message }); }
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
        const { getProductionPipelineStagesForWorkshopType, filterSxTasksToWorkshopPipeline } = require('../helpers/sxPipelineStageSlug');
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
          const { getProductionPipelineStagesForWorkshopType, filterSxTasksToWorkshopPipeline } = require('../helpers/sxPipelineStageSlug');
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
          const { loadWorkshopLogisticsTasksForCrmLead } = require('../helpers/workshopProjectTasksForCrm');
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

    const { filterCrmTasksByCompanyScope, sanitizeTasksForSharedWorkspace } = require('../helpers/crossCompanyWorkspace');
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
      const { applyWorkshopTypeDefaultStaffToProject } = require('../helpers/productionWorkshopTypeStaff');
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
    try {
      const { data: _actor } = await supabase.from('users').select('full_name').eq('id', req.user.userId).maybeSingle();
      await logDealActivityComment(req, {
        leadId: req.params.id,
        body: `📋 ${_actor?.full_name || 'Người dùng'} đã tạo nhiệm vụ «${result.data?.title || req.body.title || 'Không tên'}».`,
      });
    } catch (_) {}
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
        const { applyWorkshopTypeDefaultStaffToProject } = require('../helpers/productionWorkshopTypeStaff');
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

// ═══════════════════════════════════════════════════════════════════════════
// TOGGLE SHARE TASK TO PROJECT (cho Khối khác xem)
// ═══════════════════════════════════════════════════════════════════════════

r.put('/leads/:leadId/tasks/:taskId/toggle-share', async (req, res) => {
  try {
    const { cleanShareModulesInput } = require('../helpers/documentShareScope');
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
      const { syncLeadDocumentsFromCrmTaskShare } = require('../helpers/syncCrmArtifactShareToLeadDocuments');
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
    const { cleanShareModulesInput } = require('../helpers/documentShareScope');
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
      const { syncLeadDocumentsFromCrmAttachmentShare } = require('../helpers/syncCrmArtifactShareToLeadDocuments');
      await syncLeadDocumentsFromCrmAttachmentShare(req.params.attId);
    } catch (syncErr) {
      console.warn('[toggle-share attachment] lead_documents:', syncErr.message);
    }
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.put('/leads/:leadId/tasks/:taskId/attachments/:attId/share-scope', async (req, res) => {
  try {
    const { cleanShareModulesInput } = require('../helpers/documentShareScope');
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
      const { syncLeadDocumentsFromCrmAttachmentShare } = require('../helpers/syncCrmArtifactShareToLeadDocuments');
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
    } = require('../helpers/documentShareScope');
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

// ═══════════════════════════════════════════════════════════════════════════
// TASK NOTES & ATTACHMENTS
// ═══════════════════════════════════════════════════════════════════════════

// UPDATE task notes (quick text note on task itself) + sync ghi chú → lead_documents
r.put('/leads/:leadId/tasks/:taskId/notes', async (req, res) => {
  try {
    const { notes } = req.body;
    const { getTaskVisibilityAllowlist } = require('../helpers/documentShareScope');
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
    const { data: leadForAccess } = await supabase.from('crm_leads').select('project_id').eq('id', req.params.leadId).maybeSingle();
    if (!(await assertDealResponsible(req, res, { leadId: req.params.leadId, projectId: leadForAccess?.project_id }))) return;
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
      .select('project_id, title, company_id').eq('id', req.params.leadId).single();
    const bulkShareOpts = {
      linkToProject: !!leadForShare?.project_id,
      leadCompanyId: leadForShare?.company_id || null,
    };
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

    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE attachment + sync xóa lead_document liên kết
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
        const { snapshotTaskAttachment } = require('../helpers/trashSnapshot');
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

// GET all CRM tasks (overview page) with filters
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

// GET CRM tasks planner (grouped by assignee)
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

// CRM Task Templates CRUD
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

// Áp dụng bộ mẫu CRM cho toàn bộ lead/deal thuộc mọi khu vực của công ty (theo pipeline).
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

// Template items CRUD
r.post('/task-templates/:tplId/items', async (req, res) => {
  try {
    const b = req.body;
    const { data: existing } = await supabase.from('crm_task_template_items').select('order_index').eq('template_id', req.params.tplId).order('order_index', { ascending: false }).limit(1);
    const nextOrder = (existing?.[0]?.order_index || 0) + 1;
    let { data, error } = await supabase.from('crm_task_template_items').insert({
      template_id: req.params.tplId,
      title: b.title, description: b.description || null,
      priority: b.priority || 'medium', deadline_days: b.deadline_days || 0,
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

// Update template item (checklist, reorder, etc.)
r.put('/task-templates/:tplId/items/:itemId', async (req, res) => {
  try {
    const update = {};
    ['title', 'description', 'priority', 'deadline_days', 'order_index', 'checklist', 'default_allowed_companies', 'default_allowed_departments', 'default_shared_to_project', 'default_allowed_share_modules', 'executor_company_id', 'completion_requires_file_or_note', 'required_evidence_file_types', 'completion_requires_customer_note', 'completion_requires_customer_contact', 'requires_quick_verdict', 'blocks_stage_advance', 'show_excel_quotation_upload'].forEach(f => {
      if (req.body[f] !== undefined) update[f] = req.body[f];
    });
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

// ═══ AUTO-PROJECT CONFIG ═══
// GET — load config
r.get('/auto-project-config', async (req, res) => {
  try {
    const { data } = await supabase.from('auto_project_config').select('*').limit(1).single();
    if (!data) {
      // Auto-create if not exists
      const { data: created } = await supabase.from('auto_project_config').insert({}).select('*').single();
      return res.json(created);
    }
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT — save config
r.put('/auto-project-config', async (req, res) => {
  try {
    const { flow_id, flow_assignments, default_status, default_priority, import_crm_tasks, create_crm_tasks } = req.body;
    // Upsert: get existing or create
    let { data: existing } = await supabase.from('auto_project_config').select('id').limit(1).single();
    if (!existing) {
      const { data: created } = await supabase.from('auto_project_config').insert({}).select('id').single();
      existing = created;
    }
    const { data, error } = await supabase.from('auto_project_config').update({
      flow_id: flow_id || null,
      flow_assignments: flow_assignments || [],
      default_status: default_status || 'consulting',
      default_priority: default_priority || 'medium',
      import_crm_tasks: import_crm_tasks !== false,
      create_crm_tasks: create_crm_tasks !== false,
      updated_by: req.user.userId,
      updated_at: new Date().toISOString(),
    }).eq('id', existing.id).select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// AUTO CREATE PROJECT FROM DEAL (chạy ngầm, không cần UI tạo dự án)
// ═══════════════════════════════════════════════════════════════════════════
r.post('/deals/:id/auto-create-project', async (req, res) => {
  try {
    const resolvedPc = await resolveProductionCompanyForDealStage(req.params.id, req.body?.production_company_id);
    const result = await autoCreateProjectFromWonDeal({
      req,
      dealId: req.params.id,
      userId: req.user.userId,
      productionCompanyId: resolvedPc,
      workshopTypeId: req.body?.workshop_type_id || null,
    });
    if (!result.ok) {
      if (result.existing_project_id) {
        return res.status(400).json({ error: result.error, project_id: result.existing_project_id });
      }
      return res.status(result.statusCode || 500).json({ error: result.error });
    }
    try {
      const { emitProductionBoardRealtime } = require('../helpers/workshopIntakeNotify');
      const io = req.app.get('io');
      await emitProductionBoardRealtime(result.project_id, io, 'auto_create_api');
    } catch (emitErr) {
      console.warn('[auto-project] emit board:', emitErr.message);
    }
    res.status(201).json({
      project_id: result.project_id,
      project_code: result.project_code,
      project_name: result.project_name,
      tasks_created: result.tasks_created,
    });
  } catch (e) {
    console.error('[auto-project] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// DEAL → SX: xác nhận thủ công (sale + ngày kế hoạch), sau đó mới đồng bộ CRM theo Kanban xưởng
// ═══════════════════════════════════════════════════════════════════════════
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
    const { applyWorkshopTypeDefaultStaffToProject } = require('../helpers/productionWorkshopTypeStaff');
    const primaryStaffId = await applyWorkshopTypeDefaultStaffToProject(
      lead.project_id,
      pcv.company.id,
      projRow?.workshop_type_id || null,
    );
    const leadHandoverPatch = {
      sx_handover_at: now,
      sx_handover_confirmed_by: uid,
      sx_template_company_id: pcv.company.id,
      construction_start_date: cStart,
      expected_production_start_date: pStart,
      expected_production_end_date: pEnd,
      updated_at: now,
    };
    const { error: upLeadErr } = await supabase.from('crm_leads').update(leadHandoverPatch).eq('id', leadId);
    if (upLeadErr) throw upLeadErr;

    const projPatch = {
      construction_start_date: cStart,
      expected_production_start_date: pStart,
      updated_at: now,
      company_id: pcv.company.id,
    };
    if (pEnd) projPatch.production_deadline = pEnd;
    // Gán NV SX trên dự án — không ghi đè assigned_to/lead_owner_id (người phụ trách CRM).
    try {
      await assignProductionCompanyDealResponsibility({
        dealId: leadId,
        productionCompanyId: pcv.company.id,
        projectId: lead.project_id,
      });
    } catch (respErr) {
      console.warn('[sx-handover] assign production responsible:', respErr.message);
      if (!primaryStaffId) {
        const sxResponsible = await resolveProductionHandoverResponsibleUserId(pcv.company.id);
        if (sxResponsible) projPatch.production_person_id = sxResponsible;
      }
    }
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
      const { ensureLeadMembersFromProjectStaff } = require('../helpers/productionWorkshopTypeStaff');
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
    const { buildDriveChatAttachments } = require('../helpers/driveChatAttachments');
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

// POST /crm/followup-care/dismiss/undo — bỏ tất cả dismissal còn hiệu lực của user (khôi phục thông báo lỡ tích nhầm)
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

// ═══ Đã chăm sóc (per-lead) ═══
// GET /crm/lead-care-marks?lead_ids=a,b,c → trả về danh sách lead_id user đã đánh dấu (chưa hết hạn)
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

// POST /crm/leads/:id/care-mark → đánh dấu đã chăm sóc lead này (30 ngày)
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

// DELETE /crm/leads/:id/care-mark → bỏ dấu chăm sóc
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

// PUT /crm/settings/deadline-config → upsert. Chỉ admin công ty hoặc system admin.
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

// ════════════════════════════════════════════════════════════════════════════
// CRM PLANNER CÁ NHÂN — user tự tạo cột & kéo-thả lead/deal vào
// ════════════════════════════════════════════════════════════════════════════

function plannerTableMissing(error) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('crm_user_planner_columns') || msg.includes('crm_user_planner_items');
}

// GET /crm/planner/me → toàn bộ columns + items của user hiện tại
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

// POST /crm/planner/columns → tạo cột mới
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

// PATCH /crm/planner/columns/:id → đổi tên / màu / vị trí
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

// DELETE /crm/planner/columns/:id → xóa cột (cascade xóa items)
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

// POST /crm/planner/columns/:id/items → thêm lead vào cột (id cuối)
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

// POST /crm/planner/reorder → batch lưu thứ tự khi kéo-thả
// body: { items: [{ id, column_id, position }, ...] }
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

// DELETE /crm/planner/items/:id → bỏ lead khỏi cột
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
r.get('/leads/:id/comments', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const leadId = String(req.params.id || '').trim();
    const forModule = String(req.query.for_module || '').toLowerCase().trim();
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
    let list = data || [];
    if (forModule === 'production' && list.length) {
      const {
        isHideQuoteContractCompany,
        isQuoteContractActivityComment,
      } = require('../helpers/hideQuoteContractFromProduction');
      const { data: leadRow } = await supabase
        .from('crm_leads')
        .select('company_id')
        .eq('id', leadId)
        .maybeSingle();
      if (isHideQuoteContractCompany(leadRow?.company_id)) {
        list = list.filter((c) => !isQuoteContractActivityComment(c.body));
      }
    }
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

/** Đánh dấu đã đọc bình luận lead/deal (cập nhật last_read_at). */
r.patch('/leads/:id/comments/read', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const leadId = String(req.params.id || '').trim();
    const last_read_at = new Date().toISOString();
    const { error } = await supabase.from('crm_lead_comment_read_receipts').upsert(
      { lead_id: leadId, user_id: userId, last_read_at },
      { onConflict: 'lead_id,user_id' },
    );
    if (error) {
      if (crmLeadCommentReadReceiptsTableMissing(error)) {
        return res.status(503).json({
          error: 'Bảng read receipt chưa có. Chạy migration database/410_crm_lead_comment_read_receipts.sql.',
        });
      }
      throw error;
    }
    const io = req.app.get('io');
    if (io) {
      io.to(`lead:${leadId}`).emit('lead:comment:read', { lead_id: leadId, user_id: userId, last_read_at });
    }
    res.json({ ok: true, last_read_at });
  } catch (e) {
    console.error('PATCH /crm/leads/:id/comments/read:', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

/** Read receipts + thành viên audience — hiển thị Đã xem / Đã nhận trên từng bình luận. */
r.get('/leads/:id/comments/read-receipts', async (req, res) => {
  try {
    const leadId = String(req.params.id || '').trim();
    const [receiptsRes, members] = await Promise.all([
      supabase.from('crm_lead_comment_read_receipts').select('user_id, last_read_at').eq('lead_id', leadId),
      fetchLeadCommentAudienceMembersForRead(leadId),
    ]);
    const audienceIds = new Set((members || []).map((m) => String(m.user_id)).filter(Boolean));
    if (receiptsRes.error) {
      if (crmLeadCommentReadReceiptsTableMissing(receiptsRes.error)) {
        return res.json({ receipts: [], members });
      }
      throw receiptsRes.error;
    }
    const receipts = (receiptsRes.data || []).filter((row) => audienceIds.has(String(row.user_id)));
    res.json({ receipts, members });
  } catch (e) {
    console.error('GET /crm/leads/:id/comments/read-receipts:', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
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
      const leadMembers = await fetchLeadCommentAudienceMembers(supabase, leadId);
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

// PATCH /crm/lead-comments/:cid → sửa bình luận (chỉ chủ sở hữu)
r.patch('/lead-comments/:cid', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const cid = Number(req.params.cid);
    const body = String(req.body?.body || '').trim();
    if (!body) return res.status(400).json({ error: 'Nội dung bắt buộc' });
    const { data, error } = await supabase
      .from('crm_lead_comments')
      .update({ body, updated_at: new Date().toISOString() })
      .eq('id', cid)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .select('id, lead_id, user_id, parent_id, body, created_at, updated_at, user:users!crm_lead_comments_user_id_fkey(id,full_name,avatar)')
      .single();
    if (error) throw error;
    const rxMap = await fetchCrmCommentReactionsAggregate(supabase, [cid], userId);
    const reactions = rxMap == null ? { summary: [], mine: null } : rxMap.get(cid) || { summary: [], mine: null };
    const row = { ...data, reactions };
    const io = req.app.get('io');
    if (io && data?.lead_id) {
      io.to(`lead:${data.lead_id}`).emit('lead:comment', { lead_id: data.lead_id, action: 'updated', comment: row });
    }
    res.json(row);
  } catch (e) {
    console.error('PATCH /crm/lead-comments/:cid:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

// PUT /crm/lead-comments/:cid/reaction → thả / đổi / bỏ cảm xúc (1 emoji / user / bình luận)
r.put('/lead-comments/:cid/reaction', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const cid = Number(req.params.cid);
    if (!Number.isFinite(cid) || cid <= 0) return res.status(400).json({ error: 'id bình luận không hợp lệ' });

    const { data: com, error: cErr } = await supabase
      .from('crm_lead_comments')
      .select('id')
      .eq('id', cid)
      .is('deleted_at', null)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!com) return res.status(404).json({ error: 'Không tìm thấy bình luận' });

    const raw = req.body?.emoji;
    const emoji = raw == null || raw === '' ? null : String(raw).trim();

    const delMine = async () => {
      const { error: dErr } = await supabase
        .from('crm_lead_comment_reactions')
        .delete()
        .eq('comment_id', cid)
        .eq('user_id', userId);
      if (dErr) {
        if (reactionsTableMissing(dErr)) {
          return res.status(503).json({
            error: 'Bảng cảm xúc chưa có. Chạy migration database/173_crm_lead_comment_reactions.sql.',
          });
        }
        throw dErr;
      }
    };

    if (!emoji) {
      await delMine();
      const rxMap = await fetchCrmCommentReactionsAggregate(supabase, [cid], userId);
      return res.json(rxMap == null ? { summary: [], mine: null } : rxMap.get(cid) || { summary: [], mine: null });
    }
    if (!CRM_COMMENT_ALLOWED_REACTION_EMOJI.has(emoji)) {
      return res.status(400).json({ error: 'Cảm xúc không hợp lệ' });
    }

    const { data: existingRow, error: exErr } = await supabase
      .from('crm_lead_comment_reactions')
      .select('emoji')
      .eq('comment_id', cid)
      .eq('user_id', userId)
      .maybeSingle();
    if (exErr) {
      if (reactionsTableMissing(exErr)) {
        return res.status(503).json({
          error: 'Bảng cảm xúc chưa có. Chạy migration database/173_crm_lead_comment_reactions.sql.',
        });
      }
      throw exErr;
    }
    if (existingRow && existingRow.emoji === emoji) {
      await delMine();
    } else {
      const { error: upErr } = await supabase.from('crm_lead_comment_reactions').upsert(
        { comment_id: cid, user_id: userId, emoji },
        { onConflict: 'comment_id,user_id' },
      );
      if (upErr) {
        if (reactionsTableMissing(upErr)) {
          return res.status(503).json({
            error: 'Bảng cảm xúc chưa có. Chạy migration database/173_crm_lead_comment_reactions.sql.',
          });
        }
        throw upErr;
      }
    }

    const rxMap = await fetchCrmCommentReactionsAggregate(supabase, [cid], userId);
    if (rxMap == null) return res.json({ summary: [], mine: null });
    res.json(rxMap.get(cid) || { summary: [], mine: null });
  } catch (e) {
    console.error('PUT /crm/lead-comments/:cid/reaction:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

// DELETE /crm/lead-comments/:cid → xóa mềm (chỉ chủ sở hữu hoặc admin)
r.delete('/lead-comments/:cid', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const cid = Number(req.params.cid);
    const isAdmin = isCrmSystemAdminUser(req.user?.role) || isCrmCompanyAdminUser(req.user?.role);
    const { data: existing } = await supabase
      .from('crm_lead_comments')
      .select('lead_id')
      .eq('id', cid)
      .maybeSingle();
    let q = supabase
      .from('crm_lead_comments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', cid);
    if (!isAdmin) q = q.eq('user_id', userId);
    const { error } = await q;
    if (error) throw error;
    const io = req.app.get('io');
    if (io && existing?.lead_id) {
      io.to(`lead:${existing.lead_id}`).emit('lead:comment', {
        lead_id: existing.lead_id,
        action: 'deleted',
        comment_id: cid,
      });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /crm/lead-comments/:cid:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

// GET /crm/lead-comments/index?lead_ids=… → Map { lead_id → {count,last_at,last_user_id} }
r.get('/lead-comments/index', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const raw = String(req.query.lead_ids || '').trim();
    let leadIds = raw
      ? raw.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
    let q = supabase
      .from('crm_lead_comments')
      .select('lead_id, user_id, created_at')
      .is('deleted_at', null);
    if (leadIds.length) q = q.in('lead_id', leadIds);
    // Bảo vệ: nếu không truyền lead_ids, giới hạn 5000 dòng gần nhất để tránh tải nặng.
    if (!leadIds.length) q = q.order('created_at', { ascending: false }).limit(5000);
    const { data, error } = await q;
    if (error) {
      if (commentsTableMissing(error)) return res.json({});
      throw error;
    }
    const out = {};
    (data || []).forEach((row) => {
      const lid = String(row.lead_id);
      const cur = out[lid] || { count: 0, last_at: null, last_user_id: null };
      cur.count += 1;
      const ts = row.created_at;
      if (!cur.last_at || (ts && ts > cur.last_at)) {
        cur.last_at = ts;
        cur.last_user_id = row.user_id;
      }
      out[lid] = cur;
    });
    res.json(out);
  } catch (e) {
    console.error('GET /crm/lead-comments/index:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

/** Cho AI Assistant — cùng logic GET /crm/reports/org-overview */
r.computeOrgOverviewReportData = computeOrgOverviewReportData;

module.exports = r;
