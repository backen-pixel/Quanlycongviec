const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const { responseCache, invalidateTags: rcInvalidateTags } = require('../middleware/responseCache');
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
const { emitNotifyBadge } = require('../helpers/notifyBadge');
const { emitCrmTaskChanged } = require('../helpers/crmTaskRealtime');
const { normalizeTemplateChecklistForCrmTask } = require('../helpers/templateChecklistNormalize');
const { resolveExecutorCompanyId, isExecutorColumnError } = require('../helpers/crossCompanyWorkspace');
const { createNotification: createNotif, notifyMultiple: notifyMultipleShared } = require('../helpers/notifications');
const {
  resolveLeadCommentMentionIds,
  fetchLeadMentionMembers,
  logLeadCommentMentionActivity,
} = require('../helpers/crmLeadCommentMentions');
const { DEFAULT_CHECKLISTS } = require('../helpers/defaultChecklists');
const { generateFlowTasks, generateStepTasks } = require('../helpers/generateFlowTasks');
const { autoCreateProjectFromWonDeal } = require('../helpers/autoDealWonProject');
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
const { isAdminLike, isSystemAdmin } = require('../helpers/adminRole');
const {
  getCrmLeadRegionConstraint,
  applyCrmLeadRegionFilterToQuery,
  assertLeadReadableByRegionScope,
  assertRegionBelongsToCompany,
  assertUserCanAssignCrmRegion,
  normalizeRegionIdList,
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
  filterCrmTasksForLeadType,
} = require('../helpers/autoGenCrmTasks');
const { normalizeTimestamp } = require('../helpers/normalizeTimestamp');
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
const { createFulfillmentChildDeal, applyProductionTemplateToFulfillmentLead } = require('../helpers/projectOrderFulfillment');
const { isPostgresUniqueViolation, nextTbProjectCode } = require('../helpers/projectCode');
const { validateProductionCompanyId } = require('../helpers/productionCompanyGate');
const { assertDealCrmManualStageChange } = require('../helpers/crmDealStageGate');
const { assertCrmStageAdvanceAllowed } = require('../helpers/crmTaskStageAdvanceGate');
const {
  assignProductionCompanyDealResponsibility,
  resolveProductionHandoverResponsibleUserId,
} = require('../helpers/productionHandoverSettings');
const { ensureDealLeadDocumentsForModuleTransition } = require('../helpers/ensureDealLeadDocumentsForModuleTransition');
const { getLeadDocumentFieldsFromCrmTask, getDefaultCrmAttachmentShare } = require('../helpers/crmTaskLeadDocumentMeta');
const {
  findChecklistItem,
  artifactNamePrefix,
  syncChecklistItemNotes,
  buildChecklistLeadDocumentRow,
  parseChecklist,
} = require('../helpers/crmChecklistArtifacts');
const { parseVietnameseMoney, parseVietnameseMeasure, parseExcelMoneyFromMappedColumn } = require('../helpers/excelVnNumbers');
const { snapshotOrderRowFromQuotation, mapQuotationItemsToOrderRows } = require('../helpers/orderFromQuotation');
let autoFlowFns = {};
try { autoFlowFns = require('../helpers/autoFlow'); } catch (e) { console.warn('ΓÜá∩╕Å autoFlow not loaded:', e.message); }
let misaService = null;
try { misaService = require('../services/misaService'); } catch (e) { console.warn('ΓÜá∩╕Å misaService not loaded:', e.message); }
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
 * Lazy forward-geocode chi nh├ính thiß║┐u lat/lng (theo address hoß║╖c map_url).
 * Chß║íy nß╗ün, kh├┤ng chß║╖n response. ─É├ú c├│ cache trong `geocode_cache` ΓçÆ lß║ºn sau load
 * sß║╜ thß║Ñy toß║í ─æß╗Ö. Giß╗¢i hß║ín sß╗æ l╞░ß╗úng/chu kß╗│ ─æß╗â t├┤n trß╗ìng rate-limit Nominatim.
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
 * Ph├ít socket 'crm:dashboard_changed' ─æß╗â CRMDashboard refetch silent.
 * D├╣ng ß╗ƒ mß╗ìi handler ghi crm_leads (create/update/stage/convert/bulk/merge/delete).
 */
function emitCrmDashboardChanged(req, payload = {}) {
  try {
    const io = req.app.get('io');
    if (io) io.emit('crm:dashboard_changed', payload || {});
  } catch (e) {
    /* ignore */
  }
}

/** G├ín lead/deal, bulk ΓÇö admin hß╗ç thß╗æng/c├┤ng ty hoß║╖c admin khu vß╗▒c */
function userIsCrmCompanyOrRegionAdmin(req) {
  return userIsAdmin(req.user?.role) || isCrmRegionAdminUser(req.user);
}

/** Admin c├┤ng ty: `admin` + `company_id` tr├¬n JWT ΓÇö kh├íc admin hß╗ç thß╗æng (`admin` kh├┤ng `company_id`). */
function scopedAdminCompanyId(req) {
  if (!isCrmCompanyAdminUser(req.user)) return null;
  return String(req.user.company_id).trim();
}

/** Kh├│a `company_id` khi tß║ío/sß╗¡a CRM: admin c├┤ng ty hoß║╖c admin khu vß╗▒c. */
function scopedCrmCompanyIdForWrite(req) {
  const sac = scopedAdminCompanyId(req);
  if (sac) return sac;
  if (isCrmRegionAdminUser(req.user) && req.user.company_id) return String(req.user.company_id).trim();
  return null;
}

function requireUserCompanyId(req, res) {
  const cid = req.user?.company_id;
  if (cid) return cid;
  res.status(400).json({ error: 'Thiß║┐u company_id cß╗ºa user. Vui l├▓ng ─æ─âng xuß║Ñt/─æ─âng nhß║¡p lß║íi hoß║╖c g├ín company cho t├ái khoß║ún.' });
  return null;
}

/** Fallback ph├▓ng ban ΓåÆ c├┤ng ty khi JWT ch╞░a c├│ company_id (NV sales). */
async function requireUserCompanyIdResolved(req, res) {
  let cid = req.user?.company_id || null;
  if (!cid && req.user?.userId) {
    const { resolveCompanyIdForUser } = require('../middleware/auth');
    cid = await resolveCompanyIdForUser(req.user.userId);
    if (cid) req.user.company_id = cid;
  }
  if (!cid) {
    res.status(400).json({ error: 'Thiß║┐u company_id cß╗ºa user. Vui l├▓ng ─æ─âng xuß║Ñt/─æ─âng nhß║¡p lß║íi hoß║╖c g├ín company cho t├ái khoß║ún.' });
    return null;
  }
  return cid;
}

/** Ph├ón loß║íi nguß╗ôn: global (company_id null) khß╗¢p mß╗ìi nguß╗ôn; ph├ón loß║íi theo cty chß╗ë khß╗¢p nguß╗ôn c├╣ng c├┤ng ty */
async function assertCategoryFitsSource(sb, categoryId, sourceCompanyId) {
  if (!categoryId) return { ok: true };
  const { data: cat, error } = await sb.from('crm_source_categories').select('id, company_id').eq('id', categoryId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!cat) return { ok: false, error: 'Ph├ón loß║íi kh├┤ng tß╗ôn tß║íi' };
  if (!cat.company_id) return { ok: true };
  if (!sourceCompanyId) {
    return { ok: false, error: 'Ph├ón loß║íi n├áy thuß╗Öc mß╗Öt c├┤ng ty ΓÇö nguß╗ôn chung (kh├┤ng c├┤ng ty) kh├┤ng ─æ╞░ß╗úc gß║»n' };
  }
  if (String(cat.company_id) !== String(sourceCompanyId)) {
    return { ok: false, error: 'Ph├ón loß║íi v├á nguß╗ôn phß║úi c├╣ng c├┤ng ty' };
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
  if (s.length <= 12) return 'ΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇó';
  return `${s.slice(0, 4)}ΓÇª${s.slice(-4)} (${s.length} k├╜ tß╗▒)`;
}

function maskCustomerPhoneDisplay(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length < 5) return phone ? '***' : 'ΓÇö';
  return `${d.slice(0, 3)}****${d.slice(-2)}`;
}

/** Zalo OA (deal): chß╗ë cß╗Öt t├¬n chß╗⌐a ┬½Ho├án th├ánh┬╗ (kh├┤ng ph├ón biß╗çt hoa th╞░ß╗¥ng / dß║Ñu). Th├¬m cß╗Öt n├áy trong pipeline Deal nß║┐u ch╞░a c├│. */
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

/** Lead/Deal chß╗ë mß╗Öt ng╞░ß╗¥i phß╗Ñ tr├ích: ─æß╗ông bß╗Ö assigned_to Γåö lead_owner_id tr├¬n object cß║¡p nhß║¡t. */
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

/** G├ín phß╗Ñ tr├ích: nh├ón vi├¬n mß╗¢i phß║úi c├╣ng `company_id` vß╗¢i lead/deal (khi bß║ún ghi ─æ├ú c├│ c├┤ng ty).
 *  Ngoß║íi lß╗ç: admin hß╗ç thß╗æng (user.company_id = null) ─æ╞░ß╗úc phß╗Ñ tr├ích mß╗ìi lead/deal. */
async function assertCrmAssigneeUserMatchesLeadCompany(sb, assigneeUserId, leadCompanyId) {
  if (!assigneeUserId) return { ok: true };
  const { data: u, error } = await sb.from('users').select('id, company_id, role').eq('id', assigneeUserId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!u) return { ok: false, error: 'Nh├ón vi├¬n kh├┤ng tß╗ôn tß║íi.' };
  if (!leadCompanyId) return { ok: false, error: 'Lead/Deal ch╞░a c├│ c├┤ng ty ΓÇö chß╗ìn c├┤ng ty tr╞░ß╗¢c khi g├ín ng╞░ß╗¥i phß╗Ñ tr├ích.' };
  // Admin hß╗ç thß╗æng (kh├┤ng gß║»n company_id) ─æ╞░ß╗úc phß╗Ñ tr├ích mß╗ìi lead/deal
  if (!u.company_id) return { ok: true };
  if (String(u.company_id).trim() !== String(leadCompanyId).trim()) {
    return { ok: false, error: 'Ng╞░ß╗¥i phß╗Ñ tr├ích phß║úi thuß╗Öc c├┤ng ty cß╗ºa lead/deal.' };
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

/** PostgREST: bß║úng ch╞░a tß║ío / ch╞░a v├áo schema cache cß╗ºa Supabase (crm_pipelines hoß║╖c crm_pipeline_stages). */
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
    t.includes('pgrst200') // FK/embed relationship ch╞░a c├│ trong schema cache
  );
}

function respondIfCrmPipelinesTableMissing(res, err) {
  if (!isCrmPipelinesTableMissingError(err)) return false;
  const detail = crmRouteErrorText(err);
  res.status(503).json({
    code: 'CRM_PIPELINES_TABLE_MISSING',
    detail,
    error:
      'Supabase API ch╞░a nhß║¡n bß║úng pipeline (schema cache c┼⌐ hoß║╖c ch╞░a chß║íy migration). '
      + 'Tr├¬n Supabase SQL Editor chß║íy database/21_crm_pipelines.sql (v├á migration pipeline stages nß║┐u thiß║┐u), '
      + 'sau ─æ├│ Settings ΓåÆ API ΓåÆ Reload schema, restart backend, tß║úi lß║íi trang. '
      + `(Chi tiß║┐t: ${detail || 'schema cache'})`,
  });
  return true;
}

/** GET /pipelines/:id ΓÇö lß║Ñy pipeline + stages; fallback t├ích query nß║┐u embed join lß╗ùi schema cache. */
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

  // Fallback: t├ích 2 query (tr├ính lß╗ùi embed/FK khi PostgREST schema cache ch╞░a c├│ relationship)
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
      '[crm] quotations.source_excel_* ch╞░a c├│ tr├¬n DB ΓÇö l╞░u kh├┤ng k├¿m file Excel. Chß║íy database/169_quotations_source_excel_file.sql rß╗ôi Reload schema (Supabase ΓåÆ Settings ΓåÆ API).',
    );
    result = await supabase.from('quotations').insert(stripQuotationsSourceExcelFields(row)).select('*').single();
  }
  return result;
}

async function updateQuotationRow(id, row) {
  let result = await supabase.from('quotations').update(row).eq('id', id).select('*').single();
  if (result.error && isQuotationsSourceExcelColumnMissingError(result.error)) {
    console.warn(
      '[crm] quotations.source_excel_* ch╞░a c├│ tr├¬n DB ΓÇö cß║¡p nhß║¡t kh├┤ng k├¿m file Excel. Chß║íy database/169_quotations_source_excel_file.sql rß╗ôi Reload schema (Supabase ΓåÆ Settings ΓåÆ API).',
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

/** Zalo: template/merge ri├¬ng theo crm_pipelines (deal c├│ pipeline_id). */
async function fetchCrmPipelineZaloSlice(pipelineId) {
  return getPipelineZaloSlice(pipelineId);
}

/**
 * Gß╗¡i Zalo OA theo cß║Ñu h├¼nh app_settings + template deal.
 * @param {object} opts
 * @param {boolean} [opts.allowWithoutStageFlag] ΓÇö true: gß╗¡i tß╗½ n├║t thß╗º c├┤ng (deal ß╗ƒ cß╗Öt Ho├án th├ánh), kh├┤ng cß║ºn send_zalo_on_enter
 * @param {boolean} [opts.force] ΓÇö ─æ├ú gß╗¡i OK tr╞░ß╗¢c ─æ├│ (c├│ msg_id): gß╗¡i th├¬m lß║ºn nß╗»a. Lß║ºn gß╗¡i lß╗ùi (kh├┤ng msg_id) lu├┤n cho thß╗¡ lß║íi kh├┤ng cß║ºn force.
 * @param {Record<string,string>|null} [opts.templateDataOverride] ΓÇö gß╗¡i ─æ├║ng object n├áy l├ám template_data (─æ├ú ─æiß╗ün tß╗½ deal / sß╗¡a tay); bß╗Å qua pickDealZaloTemplatePayload.
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
    console.log('[Zalo OA] Bß╗Å qua ΓÇö tß║»t chß╗⌐c n─âng hoß║╖c thiß║┐u token');
    return { ok: false, skipped: true, reason: 'zalo_not_configured' };
  }

  const { data: prevSend } = await supabase.from('crm_zalo_stage_sends')
    .select('msg_id, error_message')
    .eq('lead_id', leadId)
    .eq('stage_id', stageId)
    .maybeSingle();
  if (!force && prevSend?.msg_id) {
    console.log('[Zalo OA] ─É├ú gß╗¡i th├ánh c├┤ng tr╞░ß╗¢c ─æ├│ cho lead+stage n├áy');
    return { ok: true, skipped: true, reason: 'already_sent', msg_id: prevSend.msg_id };
  }
  /* C├│ error_message nh╞░ng kh├┤ng msg_id ΓåÆ lß║ºn tr╞░ß╗¢c thß║Ñt bß║íi: cho gß╗¡i lß║íi (sß╗¡a template/S─ÉT kh├┤ng cß║ºn x├│a DB). */

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
    console.log('[Zalo OA] Bß╗Å qua ΓÇö kh├┤ng phß║úi cß╗Öt Ho├án th├ánh');
    return { ok: false, skipped: true, reason: 'not_hoan_thanh_stage' };
  }

  const rawPhone = String(lead.customer?.phone || '').trim();
  const normalizedForSend = normalizeVnPhoneTo84(rawPhone);
  if (!normalizedForSend) {
    console.warn('[Zalo OA] Deal kh├┤ng c├│ S─ÉT kh├ích hß╗úp lß╗ç (kh├┤ng chuß║⌐n h├│a ─æ╞░ß╗úc 84ΓÇª)');
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
    console.log('[Zalo OA] ─É├ú gß╗¡i', result.msg_id, result.quota);
  } else {
    console.warn('[Zalo OA] Lß╗ùi gß╗¡i:', result.message || result.error, result.data);
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

/** Gß╗¡i Zalo khi deal v├áo cß╗Öt c├│ send_zalo_on_enter (chß║íy nß╗ün, kh├┤ng chß║╖n response) */
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

// Auto-invalidate response cache cho mß╗ìi mutation CRM
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

// Debug: x├íc nhß║¡n backend ─æang chß║íy ─æ├║ng bß║ún code
// GET /api/crm/_version
r.get('/_version', (req, res) => {
  res.json({
    ok: true,
    routes_hint: ['GET /lead-types', 'POST /lead-types'],
    time: new Date().toISOString(),
  });
});

const CRM_LEAD_ID_IN_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Chß║╖n NV truy cß║¡p lead/deal cß╗ºa ng╞░ß╗¥i kh├íc (GET/PUT/...) ΓÇö path /leads/:uuid/... hoß║╖c /deals/:uuid/... */
async function enforceCrmDealAssigneeAccess(req, res, next) {
  try {
    const p = req.path || '';
    const parts = p.split('/').filter(Boolean);
    const head = parts[0];
    if ((head !== 'leads' && head !== 'deals') || !parts[1] || !CRM_LEAD_ID_IN_PATH.test(parts[1])) return next();
    // Nhiß╗çm vß╗Ñ CRM (.../tasks/...): kh├┤ng chß║╖n theo phß╗Ñ tr├ích ΓÇö chß╗ë cß║ºn ─æ─âng nhß║¡p (auth).
    if (/\/tasks(\/|$)/.test(p)) return next();
    const leadId = parts[1];
    const { data: lead, error } = await supabase
      .from('crm_leads')
      .select('id, type, assigned_to, lead_owner_id, parent_lead_id')
      .eq('id', leadId)
      .maybeSingle();
    if (error || !lead) return next();
    const uid = req.user?.userId;

    /** Deal con (fulfillment theo ─æ╞ín): NV sale phß╗Ñ tr├ích deal gß╗æc vß║½n cß║ºn xem/sß╗¡a tasks cß╗ºa deal con */
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
        return res.status(403).json({ error: 'Bß║ín chß╗ë ─æ╞░ß╗úc xem/sß╗¡a deal m├á bß║ín phß╗Ñ tr├ích.' });
      }
      const ok = await userOwnsDealViaAncestor(uid, lead);
      if (!ok) {
        return res.status(403).json({ error: 'Bß║ín chß╗ë ─æ╞░ß╗úc xem/sß╗¡a deal m├á bß║ín phß╗Ñ tr├ích.' });
      }
      return next();
    }
    if (lead.type === 'lead') {
      if (userSeesAllCrmLeads(req.user?.role)) return next();
      const owns =
        uid &&
        (String(lead.assigned_to || '') === String(uid) || String(lead.lead_owner_id || '') === String(uid));
      if (!owns) {
        return res.status(403).json({ error: 'Bß║ín chß╗ë ─æ╞░ß╗úc xem/sß╗¡a lead m├á bß║ín phß╗Ñ tr├ích.' });
      }
      return next();
    }
    return next();
  } catch (e) {
    return next(e);
  }
}

r.use(enforceCrmDealAssigneeAccess);

// ΓöÇΓöÇΓöÇ HELPER: Create notification (backward compatible wrapper) ΓöÇΓöÇ
async function createNotification(req, userId, type, title, message, entityType, entityId, metadata) {
  return await createNotif(req, userId, type, title, message, entityType, entityId, metadata || null);
}

// ΓöÇΓöÇΓöÇ autoGenCrmTasksForNewLead: imported from helpers/autoGenCrmTasks.js ΓöÇΓöÇ

async function notifyMultiple(req, userIds, type, title, message, entityType, entityId, metadata) {
  return await notifyMultipleShared(req, userIds, type, title, message, entityType, entityId, metadata || null);
}

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// HELPER: Auto-generate code (LEAD-2026-001, BG-2026-001...)
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
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

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// CRM DASHBOARD
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ

/** Task CRM c├▓n pending/in_progress, c├│ deadline v├á ─æ├ú qu├í hß║ín ΓÇö scope theo danh s├ích lead/deal ─æang xem. */
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

/** PostgREST mß║╖c ─æß╗ïnh ~1000 d├▓ng/truy vß║Ñn ΓÇö gom ─æß╗º bß║ún ghi theo filter ─æß╗â KPI / pipeline kh├┤ng bß╗ï trß║ºn 1000. */
async function fetchCrmLeadsForDashboardBatched(type, { company_id, date_from, date_to, assigned_to_only, req }, pageSize = 1000) {
  const rows = [];
  let from = 0;
  for (;;) {
    let q = supabase
      .from('crm_leads')
      .select('id, stage_id, estimated_value, probability, type, assigned_to, lead_owner_id, pipeline_id')
      .eq('type', type);
    if (company_id) q = q.eq('company_id', company_id);
    if (req) q = applyCrmLeadRegionFilterToQuery(q, req);
    if (assigned_to_only) {
      if (type === 'lead') {
        q = q.or(`assigned_to.eq.${assigned_to_only},lead_owner_id.eq.${assigned_to_only}`);
      } else {
        q = q.eq('assigned_to', assigned_to_only);
      }
    }
    if (date_from) q = q.gte('created_at', date_from);
    if (date_to) q = q.lte('created_at', date_to + 'T23:59:59.999Z');
    const { data, error } = await q.range(from, from + pageSize - 1);
    if (error) throw error;
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

/** Th├íng KPI (YYYY-MM-01) theo ─æß╗ông hß╗ô m├íy chß╗º ΓÇö khß╗¢p mß║╖c ─æß╗ïnh tab ┬½─Éiß╗âm KPI┬╗ tr├¬n chi tiß║┐t lead. */
function defaultKpiLedgerMonthStartYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

/**
 * Tß╗òng ─æiß╗âm r├▓ng sß╗ò c├íi KPI (crm_kpi_ledger) theo tß╗½ng lead_id trong kß╗│.
 * Gom theo chunk v├¼ .in() v├á ph├ón trang tr├ính trß║ºn PostgREST.
 * @param {{ userId?: string|null }} [opts] ΓÇö Khi c├│ `userId`, chß╗ë cß╗Öng ─æiß╗âm cß╗ºa nh├ón vi├¬n ─æ├│ (khß╗¢p bß╗Ö lß╗ìc NV tr├¬n dashboard).
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

/** Lead/deal cß╗ºa ─æ├║ng mß╗Öt user ΓÇö d├╣ng BC chi tiß║┐t theo pipeline (tr├ính trß║ºn 1000 d├▓ng). */
async function fetchCrmLeadsForUserDetailBatched(userId, type, { company_id, date_from, date_to, req }, pageSize = 1000) {
  const rows = [];
  let from = 0;
  for (;;) {
    let q = supabase
      .from('crm_leads')
      .select('id, pipeline_id, stage_id, estimated_value, type, created_at')
      .eq('type', type);
    if (company_id) q = q.eq('company_id', company_id);
    if (req) q = applyCrmLeadRegionFilterToQuery(q, req);
    if (type === 'lead') {
      q = q.or(`assigned_to.eq.${userId},lead_owner_id.eq.${userId}`);
    } else {
      q = q.eq('assigned_to', userId);
    }
    if (date_from) q = q.gte('created_at', date_from);
    if (date_to) q = q.lte('created_at', date_to + 'T23:59:59.999Z');
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
 * Sß╗æ ms tß╗½ epoch cß╗ºa max(updated_at) trong phß║ím vi lead/deal user ─æ╞░ß╗úc xem (c├╣ng company + khoß║úng ng├áy tß║ío + v├╣ng).
 * D├╣ng client poll 1 request nhß╗Å; khi v thay ─æß╗òi mß╗¢i refetch dashboard ─æß║ºy ─æß╗º.
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

/** GET /crm/live-version ΓÇö poll nhß║╣ cho dashboard (chß╗ë sß╗æ v = ms) */
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
    res.status(500).json({ error: e.message || 'Lß╗ùi' });
  }
});

/** GET /crm/reports/staff-lead-deal ΓÇö BC nh├ón vi├¬n: sß╗æ lead/deal & gi├í trß╗ï pipeline (╞░ß╗¢c t├¡nh) / chß╗æt / thua theo ng╞░ß╗¥i phß╗Ñ tr├ích */
const STAFF_LEAD_DEAL_REPORT_ROLES = new Set([
  'admin', 'manager', 'director', 'supervisor', 'superadmin', 'super_admin', 'region_admin',
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

/** GET /crm/admin/sla-at-risk ΓÇö Lead/deal ─æang ß╗ƒ giai ─æoß║ín c├│ SLA gß║ºn qu├í hß║ín (stage_entered_at + sla_days) */
r.get('/admin/sla-at-risk', async (req, res) => {
  try {
    const roleNorm = normalizeCrmUserRole(req.user?.role);
    if (!STAFF_LEAD_DEAL_REPORT_ROLES.has(roleNorm)) {
      return res.status(403).json({ error: 'Kh├┤ng c├│ quyß╗ün xem danh s├ích SLA' });
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
      if (!regRow?.company_id) return res.status(400).json({ error: 'Khu vß╗▒c kh├┤ng tß╗ôn tß║íi' });
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
    /** Mß║╖c ─æß╗ïnh chß╗ë ┬½rß╗ºi ro┬╗: qu├í hß║ín hoß║╖c sß║»p hß║┐t trong cß╗¡a sß╗ò. true = th├¬m cß║ú lead ─æang trong hß║ín (hß║ín sau cß╗¡a sß╗ò). */
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
    res.status(500).json({ error: e.message || 'Lß╗ùi' });
  }
});

/** POST /crm/admin/sla-remind ΓÇö Gß╗¡i TB nhß║»c nhß╗ƒ SLA giai ─æoß║ín tß╗¢i NV phß╗Ñ tr├ích (kh├┤ng gß╗Öp v├áo TB nhß║»c hß║ín tß╗▒ ─æß╗Öng) */
r.post('/admin/sla-remind', async (req, res) => {
  try {
    const roleNorm = normalizeCrmUserRole(req.user?.role);
    if (!STAFF_LEAD_DEAL_REPORT_ROLES.has(roleNorm)) {
      return res.status(403).json({ error: 'Kh├┤ng c├│ quyß╗ün gß╗¡i nhß║»c SLA' });
    }

    const leadIds = Array.isArray(req.body?.lead_ids) ? req.body.lead_ids.map((x) => String(x).trim()).filter(Boolean) : [];
    if (!leadIds.length) return res.status(400).json({ error: 'Thiß║┐u lead_ids' });

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
    const actorName = req.user?.full_name || req.user?.email || 'Quß║ún l├╜';

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
        return res.status(400).json({ error: 'Cß╗Öt pipeline n├áy kh├┤ng ├íp dß╗Ñng SLA (sla_days = 0)' });
      }
      const dueAt = endOfCalendarDayAfterEntered(lead.stage_entered_at || lead.created_at, slaDays);

      const rawTargets = [...new Set([lead.assigned_to, lead.type === 'lead' ? lead.lead_owner_id : null].filter(Boolean))];
      const leadScope = { company_id: lead.company_id, region_id: lead.region_id };
      const targets = await filterUserIdsForCrmLeadScopedNotification(supabase, leadScope, rawTargets);
      const stageLabel = st?.name || 'giai ─æoß║ín';
      const title = `${lead.type === 'deal' ? 'Deal' : 'Lead'} ${lead.code || ''} ΓÇö gß║ºn hß║┐t hß║ín SLA`.trim();
      const msg = `${actorName} nhß║»c xß╗¡ l├╜ ${stageLabel}. Hß║ín SLA: ${dueAt.toLocaleString('vi-VN')}.`;

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
    res.status(500).json({ error: e.message || 'Lß╗ùi' });
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
  };
}

/** Slug mß║╖c ─æß╗ïnh = giai ─æoß║ín tr╞░ß╗¢c k├╜ H─É (khi ch╞░a cß║Ñu h├¼nh deal_report_bucket) */
const DEAL_PRE_CONTRACT_SLUGS_STAFF = new Set([
  'designing',
  'quoted',
  'negotiating',
  'waiting_deposit',
]);

/**
 * Ph├ón loß║íi cß╗Öt Deal cho BC Lead/Deal theo NV.
 * `deal_report_bucket` tr├¬n crm_pipeline_stages ghi ─æ├¿; is_lost lu├┤n ╞░u ti├¬n thua.
 * @returns {'lost'|'project_completed'|'implementation'|'pre_contract'}
 */
function classifyDealStageForStaffReport(st, slug) {
  if (!st) return 'pre_contract';
  const slugStr = slug || null;
  if (st.is_lost || slugStr === 'lost') return 'lost';

  const bucket = st.deal_report_bucket || null;
  if (bucket === 'lost') return 'lost';
  if (bucket === 'completed') return 'project_completed';
  if (bucket === 'implementation') return 'implementation';
  if (bucket === 'pre_contract') return 'pre_contract';

  if (slugStr === 'completed') return 'project_completed';
  if ((slugStr && DEAL_PRE_CONTRACT_SLUGS_STAFF.has(slugStr)) || (!slugStr && !st.is_won)) return 'pre_contract';
  return 'implementation';
}

/** Trß║ú vß╗ü { df, dt, effectiveCompanyId, rows } hoß║╖c null (─æ├ú gß╗¡i response lß╗ùi). */
async function computeStaffLeadDealReportData(req, res) {
  try {
    const roleNorm = normalizeCrmUserRole(req.user?.role);
    if (!STAFF_LEAD_DEAL_REPORT_ROLES.has(roleNorm)) {
      res.status(403).json({ error: 'Kh├┤ng c├│ quyß╗ün xem b├ío c├ío n├áy' });
      return null;
    }

    const { date_from, date_to, department_id, q } = req.query;
    const rawC = req.query.company_id && String(req.query.company_id).trim() ? String(req.query.company_id).trim() : null;
    let effectiveCompanyId = rawC;
    const sacDash = scopedAdminCompanyId(req);
    if (sacDash) {
      effectiveCompanyId = sacDash;
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return null;
      effectiveCompanyId = cid;
    }

    // ΓöÇΓöÇ Filter type: 'all' | 'lead' | 'deal' ΓöÇΓöÇ
    const rawType = String(req.query.type || 'all').toLowerCase();
    const typeView = rawType === 'lead' || rawType === 'deal' ? rawType : 'all';

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

    const dealAssigneeOnly =
      req.user?.userId && !userSeesAllCrmDealsForScope(req.user) ? req.user.userId : null;
    const leadAssigneeOnly =
      req.user?.userId && !userSeesAllCrmLeadsForScope(req.user) ? req.user.userId : null;

    const skipLeads = typeView === 'deal';
    const skipDeals = typeView === 'lead';
    const [leadRows, dealRows] = await Promise.all([
      skipLeads ? Promise.resolve([]) : fetchCrmLeadsForDashboardBatched('lead', {
        company_id: effectiveCompanyId || undefined,
        date_from: df,
        date_to: dt,
        assigned_to_only: leadAssigneeOnly,
        req,
      }),
      skipDeals ? Promise.resolve([]) : fetchCrmLeadsForDashboardBatched('deal', {
        company_id: effectiveCompanyId || undefined,
        date_from: df,
        date_to: dt,
        assigned_to_only: dealAssigneeOnly,
        req,
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
          res.status(400).json({ error: 'Ph├▓ng ban kh├┤ng thuß╗Öc c├┤ng ty ─æang chß╗ìn' });
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
          full_name: 'Ch╞░a g├ín phß╗Ñ tr├ích',
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

    return { df, dt, effectiveCompanyId, rows, typeView };
  } catch (e) {
    console.error('computeStaffLeadDealReportData:', e);
    if (!res.headersSent) res.status(500).json({ error: e.message || 'Lß╗ùi' });
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
    if (!res.headersSent) res.status(500).json({ error: e.message || 'Lß╗ùi' });
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
      basis: 'created_at',
      type: data.typeView || 'all',
      rows: data.rows,
    });
  } catch (e) {
    console.error('GET /crm/reports/staff-lead-deal:', e);
    res.status(500).json({ error: e.message || 'Lß╗ùi' });
  }
});

function isUuidString(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(s || '').trim());
}

/** Chi tiß║┐t pipeline theo nh├ón vi├¬n ΓÇö d├╣ng cho JSON + PDF */
async function computeStaffPipelineDetailPayload(req, res) {
  try {
    const roleNorm = normalizeCrmUserRole(req.user?.role);
    if (!STAFF_LEAD_DEAL_REPORT_ROLES.has(roleNorm)) {
      res.status(403).json({ error: 'Kh├┤ng c├│ quyß╗ün xem b├ío c├ío n├áy' });
      return null;
    }

    const targetId = String(req.params.userId || '').trim();
    if (!isUuidString(targetId)) {
      res.status(400).json({ error: 'userId kh├┤ng hß╗úp lß╗ç' });
      return null;
    }

    const leadSelfOnly = req.user?.userId && !userSeesAllCrmLeadsForScope(req.user);
    const dealSelfOnly = req.user?.userId && !userSeesAllCrmDealsForScope(req.user);
    if (leadSelfOnly && String(targetId) !== String(req.user.userId)) {
      res.status(403).json({ error: 'Chß╗ë xem ─æ╞░ß╗úc dß╗» liß╗çu cß╗ºa ch├¡nh bß║ín' });
      return null;
    }
    if (dealSelfOnly && String(targetId) !== String(req.user.userId)) {
      res.status(403).json({ error: 'Chß╗ë xem ─æ╞░ß╗úc dß╗» liß╗çu cß╗ºa ch├¡nh bß║ín' });
      return null;
    }

    const { date_from, date_to } = req.query;
    const rawC = req.query.company_id && String(req.query.company_id).trim() ? String(req.query.company_id).trim() : null;
    let effectiveCompanyId = rawC;
    const sacDash = scopedAdminCompanyId(req);
    if (sacDash) {
      effectiveCompanyId = sacDash;
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return null;
      effectiveCompanyId = cid;
    }

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
        date_from: df,
        date_to: dt,
        req,
      }),
      skipDeals ? Promise.resolve([]) : fetchCrmLeadsForUserDetailBatched(targetId, 'deal', {
        company_id: effectiveCompanyId || undefined,
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
      const { data: stages } = await supabase
        .from('crm_pipeline_stages')
        .select('id, name, order_index, pipeline_id, is_won, is_lost, pipeline_type, canonical_slug, deal_report_bucket')
        .in('id', allStageIds);
      stageMetaById = Object.fromEntries((stages || []).map((s) => [s.id, s]));
    }

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
      const b = ensure(l.pipeline_id);
      const v = numEst(l.estimated_value);
      const st = l.stage_id ? stageMetaById[l.stage_id] : null;
      b.deal_count += 1;
      b.deal_value += v;
      if (st?.is_won) {
        b.won_deal_count += 1;
        b.won_value += v;
      }
      if (st?.is_lost) {
        b.lost_deal_count += 1;
        b.lost_value += v;
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
      const name = pid ? (nameMap[pid] || 'Pipeline') : 'Ch╞░a g├ín pipeline';
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
      };
    });

    pipelines.sort((a, b) => (b.total_value || 0) - (a.total_value || 0));

    /** Theo ng├áy (phß║ºn date cß╗ºa ISO) ΓÇö khß╗¢p filter created_at */
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
    /** ─É├ú k├╜ H─É ΓåÆ tr╞░ß╗¢c ho├án th├ánh: SX, lß║»p ─æß║╖t, k├╜ H─ÉΓÇª */
    let dealImplementationCount = 0;
    let dealImplementationValue = 0;
    /** Tr╞░ß╗¢c k├╜ H─É */
    let dealPreContractCount = 0;
    let dealPreContractValue = 0;
    for (const l of dealRows) {
      const v = numEst(l.estimated_value);
      const st = l.stage_id ? stageMetaById[l.stage_id] : null;
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

      if (st?.is_won) {
        dealWonCount += 1;
        dealWonValue += v;
      } else {
        dealOpenCount += 1;
        dealOpenValue += v;
      }
    }

    const leadTot = leadRows.length;
    const leadValTot = leadRows.reduce((s, l) => s + numEst(l.estimated_value), 0);
    const dealTot = dealRows.length;
    const dealValTot = dealRows.reduce((s, l) => s + numEst(l.estimated_value), 0);
    const closedForRate = dealWonCount + dealLostCount;
    const totalPipelineVal = leadValTot + dealValTot;
    const summary = {
      lead_count: leadTot,
      lead_value: leadValTot,
      deal_count: dealTot,
      deal_value: dealValTot,
      /** ─É├ú k├╜ H─É / cß╗¥ chß╗æt sale (is_won) ΓÇö c├│ thß╗â vß║½n ─æang SX, lß║»p ─æß║╖tΓÇª */
      won_deal_count: dealWonCount,
      won_value: dealWonValue,
      lost_deal_count: dealLostCount,
      lost_value: dealLostValue,
      /** Deal ch╞░a cß╗¥ won v├á ch╞░a thua (th╞░ß╗¥ng l├á tr╞░ß╗¢c k├╜ H─É) */
      open_deal_count: dealOpenCount,
      open_value: dealOpenValue,
      /** Ho├án th├ánh: xong H─É, thu tiß╗ün ΓÇö slug completed */
      project_completed_count: dealProjectCompletedCount,
      project_completed_value: dealProjectCompletedValue,
      /** ─Éang triß╗ân khai: tß╗½ k├╜ H─É vß╗ü ph├¡a ho├án th├ánh (SX, lß║»p, k├╜ H─ÉΓÇª) ΓÇö kh├┤ng gß╗ôm giai ─æoß║ín ch╞░a chß╗æt */
      implementation_count: dealImplementationCount,
      implementation_value: dealImplementationValue,
      /** Ch╞░a chß╗æt: giai ─æoß║ín deal tr╞░ß╗¢c k├╜ H─É (slug designingΓÇªwaiting_deposit hoß║╖c ch╞░a c├│ slug/is_won) */
      pre_contract_count: dealPreContractCount,
      pre_contract_value: dealPreContractValue,
      /** C├▓n lß║íi sau khi trß╗½ thua & ho├án th├ánh ΓÇö = implementation + pre_contract */
      pending_completion_count: dealImplementationCount + dealPreContractCount,
      pending_completion_value: dealImplementationValue + dealPreContractValue,
      total_pipeline_value: totalPipelineVal,
      /** Giß╗æng project_completed_value ΓÇö tiß╗ün tr├¬n deal ─æ├ú qua giai ─æoß║ín ho├án th├ánh */
      completed_value: dealProjectCompletedValue,
      /** R├▓ng ΓÇ£chß╗æt saleΓÇ¥ ΓêÆ thua (k├╜ H─É ΓêÆ thua), kh├┤ng phß║úi ho├án th├ánh dß╗▒ ├ín */
      net_won_minus_lost_value: dealWonValue - dealLostValue,
      total_excluding_lost_value: leadValTot + dealValTot - dealLostValue,
      pipeline_count: pipelines.filter((p) => (p.lead_count || 0) + (p.deal_count || 0) > 0).length,
      win_rate_closed_pct: closedForRate > 0 ? Math.round((dealWonCount / closedForRate) * 1000) / 10 : null,
      win_rate_all_deals_pct: dealTot > 0 ? Math.round((dealWonCount / dealTot) * 1000) / 10 : null,
    };

    /** Gom theo tß╗½ng giai ─æoß║ín (stage) ΓÇö tiß╗ün ─æang nß║▒m ß╗ƒ cß╗Öt Kanban n├áo */
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
      if (outcome === 'project_completed') return 'Ho├án th├ánh';
      if (outcome === 'implementation') return '─Éang triß╗ân khai';
      if (outcome === 'pre_contract') return 'Ch╞░a chß╗æt';
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
        stage_name: meta?.name || (agg.stage_id ? 'ΓÇö' : 'Ch╞░a x├íc ─æß╗ïnh giai ─æoß║ín'),
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

    const { data: uRow } = await supabase
      .from('users')
      .select('id, full_name, email, department:departments!users_department_id_fkey(name)')
      .eq('id', targetId)
      .maybeSingle();

    return {
      user_id: targetId,
      full_name: uRow?.full_name || null,
      email: uRow?.email || null,
      department_name: uRow?.department?.name || null,
      df,
      dt,
      effectiveCompanyId,
      pipelines,
      summary,
      timeline,
      stage_breakdown,
      typeView,
    };
  } catch (e) {
    console.error('computeStaffPipelineDetailPayload:', e);
    if (!res.headersSent) res.status(500).json({ error: e.message || 'Lß╗ùi' });
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
    if (!res.headersSent) res.status(500).json({ error: e.message || 'Lß╗ùi' });
  }
});

/** GET /crm/reports/staff-lead-deal/:userId/pipelines ΓÇö chi tiß║┐t theo tß╗½ng pipeline (gi├í trß╗ï ╞░ß╗¢c t├¡nh) */
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
    });
  } catch (e) {
    console.error('GET /crm/reports/staff-lead-deal/:userId/pipelines:', e);
    res.status(500).json({ error: e.message || 'Lß╗ùi' });
  }
});

const DEAL_REPORT_BUCKET_VALUES = new Set(['pre_contract', 'implementation', 'completed', 'lost']);

/** GET /crm/settings/deal-stage-report-buckets ΓÇö cß╗Öt Deal ΓåÆ nh├│m BC Lead/Deal theo NV */
r.get('/settings/deal-stage-report-buckets', async (req, res) => {
  try {
    const roleNorm = normalizeCrmUserRole(req.user?.role);
    if (!STAFF_LEAD_DEAL_REPORT_ROLES.has(roleNorm)) {
      res.status(403).json({ error: 'Kh├┤ng c├│ quyß╗ün xem cß║Ñu h├¼nh n├áy' });
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
      res.status(400).json({ error: 'Cß║ºn chß╗ìn c├┤ng ty (company_id)' });
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
    if (!res.headersSent) res.status(500).json({ error: e.message || 'Lß╗ùi' });
  }
});

/** PUT /crm/settings/deal-stage-report-buckets ΓÇö cß║¡p nhß║¡t nh├│m b├ío c├ío cho tß╗½ng cß╗Öt Deal */
r.put('/settings/deal-stage-report-buckets', async (req, res) => {
  try {
    const roleNorm = normalizeCrmUserRole(req.user?.role);
    if (!STAFF_LEAD_DEAL_REPORT_ROLES.has(roleNorm)) {
      res.status(403).json({ error: 'Kh├┤ng c├│ quyß╗ün chß╗ënh cß║Ñu h├¼nh n├áy' });
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
      res.status(400).json({ error: 'Cß║ºn company_id' });
      return;
    }

    const updates = Array.isArray(body.updates) ? body.updates : [];
    if (!updates.length) {
      res.status(400).json({ error: 'updates kh├┤ng ─æ╞░ß╗úc rß╗ùng' });
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
        res.status(400).json({ error: 'stage_id kh├┤ng hß╗úp lß╗ç' });
        return;
      }
      let bucket = u.deal_report_bucket;
      if (bucket === '' || bucket === undefined) bucket = null;
      if (bucket !== null && !DEAL_REPORT_BUCKET_VALUES.has(String(bucket))) {
        res.status(400).json({ error: 'deal_report_bucket kh├┤ng hß╗úp lß╗ç' });
        return;
      }

      const { data: st, error: ste } = await supabase
        .from('crm_pipeline_stages')
        .select('id, pipeline_id, pipeline_type')
        .eq('id', sid)
        .maybeSingle();
      if (ste) throw ste;
      if (!st || st.pipeline_type !== 'deal' || !allowedPipe.has(st.pipeline_id)) {
        res.status(403).json({ error: 'Giai ─æoß║ín kh├┤ng thuß╗Öc pipeline Deal cß╗ºa c├┤ng ty ─æang chß╗ìn' });
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
    if (!res.headersSent) res.status(500).json({ error: e.message || 'Lß╗ùi' });
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

    // Pipeline stages for the specified type ΓÇö chß╗ë pipeline mß║╖c ─æß╗ïnh cß╗ºa c├┤ng ty (tr├ính trß╗Ön cß╗Öt nhiß╗üu pipeline)
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

    // Leads/Deals theo filter (─æß╗º trang) ΓÇö tr├ính trß║ºn 1000 d├▓ng cß╗ºa Supabase
    const leads = await fetchCrmLeadsForDashboardBatched(type, {
      company_id: effectiveCompanyId || undefined,
      date_from,
      date_to,
      assigned_to_only,
      req,
    });

    const stageStats = (stages || []).map(s => {
      const stageLeads = (leads || []).filter(l => l.stage_id === s.id);
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

    const leadIdsScope = (leads || []).map((l) => l.id).filter(Boolean);
    let overdue_tasks = 0;
    try {
      overdue_tasks = await countOpenOverdueCrmTasksForLeadIds(leadIdsScope);
    } catch (e) {
      console.warn('[crm/dashboard] overdue_tasks count:', e.message);
    }

    const rawLedgerPs = req.query.ledger_period_start && String(req.query.ledger_period_start).trim();
    const ledgerPeriodStart = (rawLedgerPs && /^\d{4}-\d{2}-\d{2}$/.test(rawLedgerPs.slice(0, 10)))
      ? rawLedgerPs.slice(0, 10)
      : defaultKpiLedgerMonthStartYmd();
    let ledgerNetByLead = {};
    try {
      if (leadIdsScope.length) {
        ledgerNetByLead = await sumCrmKpiLedgerNetByLeadIds(leadIdsScope, ledgerPeriodStart, 'monthly', {
          userId: assigned_to_only || null,
        });
      }
    } catch (e) {
      console.warn('[crm/dashboard] kpi ledger sums:', e.message);
    }
    const kpiLedgerMonthNetSum = Math.round(
      Object.values(ledgerNetByLead).reduce((a, b) => a + Number(b || 0), 0) * 100,
    ) / 100;

    // KPIs split by type
    const totalItems = (leads || []).length;
    const wonItems = (leads || []).filter(l => {
      const st = (stages || []).find(s => s.id === l.stage_id);
      return st?.is_won;
    });
    const totalValue = (leads || []).reduce((s, l) => s + (l.estimated_value || 0), 0);
    const wonValue = wonItems.reduce((s, l) => s + (l.estimated_value || 0), 0);

    let kpis = {};
    if (type === 'lead') {
      // Lead KPIs ΓÇö tß╗╖ lß╗ç chuyß╗ân ─æß╗òi: admin xem to├án DB; NV chß╗ë lead/deal cß╗ºa m├¼nh
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
      const nDeals = dealsConvertedCount ?? 0;
      const conversionRate = nLeads > 0 ? Math.round((nDeals / nLeads) * 100) : 0;
      kpis = {
        total_leads: totalItems,
        converted_to_deals: nDeals,
        conversion_rate: conversionRate,
        total_value: totalValue,
        conversion_value: wonValue,
        overdue_tasks,
        kpi_ledger_month_net_sum: kpiLedgerMonthNetSum,
        kpi_ledger_period_start: ledgerPeriodStart,
      };
    } else {
      // Deal KPIs
      kpis = {
        total_deals: totalItems,
        won_deals: wonItems.length,
        won_rate: totalItems > 0 ? Math.round(wonItems.length / totalItems * 100) : 0,
        total_value: totalValue,
        won_value: wonValue,
        overdue_tasks,
        kpi_ledger_month_net_sum: kpiLedgerMonthNetSum,
        kpi_ledger_period_start: ledgerPeriodStart,
      };
    }

    // Recent quotations (only for deal dashboard)
    let recentQuotes = [];
    if (type === 'deal') {
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
    if (type === 'deal') {
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
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Doanh thu k├╜ H─É (╞░ß╗¢c t├¡nh) theo th├íng ΓÇö lß╗ìc theo `entered_at` khi deal v├áo giai ─æoß║ín canonical `contract_signed` (kh├íc Kanban lß╗ìc `created_at`). */
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
    res.status(500).json({ error: e.message || 'Lß╗ùi' });
  }
});

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// PIPELINES ΓÇö ß╗Éng b├ín h├áng theo C├┤ng ty
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
r.get('/pipelines', async (req, res) => {
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
    res.status(500).json({ error: crmRouteErrorText(e) || 'Lß╗ùi server' });
  }
});

r.get('/pipelines/:id', async (req, res) => {
  try {
    const { data, error } = await fetchPipelineWithStagesById(req.params.id);
    if (error) throw error;
    const sacPl1 = scopedAdminCompanyId(req);
    if (sacPl1) {
      if (String(data.company_id || '') !== String(sacPl1)) return res.status(403).json({ error: 'Kh├┤ng c├│ quyß╗ün xem pipeline c├┤ng ty kh├íc' });
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      if (String(data.company_id || '') !== String(cid)) return res.status(403).json({ error: 'Kh├┤ng c├│ quyß╗ün xem pipeline c├┤ng ty kh├íc' });
    }
    if (data?.stages) data.stages.sort((a, b) => a.order_index - b.order_index);
    res.json(data);
  } catch (e) {
    if (respondIfCrmPipelinesTableMissing(res, e)) return;
    res.status(500).json({ error: crmRouteErrorText(e) || 'Lß╗ùi server' });
  }
});

r.post('/pipelines', async (req, res) => {
  try {
    const b = req.body;
    if (!b.name) return res.status(400).json({ error: 'Thiß║┐u t├¬n pipeline' });
    const sacPNew = scopedAdminCompanyId(req);
    if (sacPNew) {
      if (b.company_id && String(b.company_id) !== String(sacPNew)) {
        return res.status(403).json({ error: 'Kh├┤ng thß╗â tß║ío pipeline cho c├┤ng ty kh├íc' });
      }
      b.company_id = sacPNew;
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      if (b.company_id && String(b.company_id) !== String(cid)) return res.status(403).json({ error: 'Kh├┤ng thß╗â tß║ío pipeline cho c├┤ng ty kh├íc' });
      b.company_id = cid;
    }
    const { data, error } = await supabase.from('crm_pipelines').insert({
      name: b.name, company_id: b.company_id || null, description: b.description || null,
      is_default: b.is_default || false, is_active: true,
    }).select('*, company:companies(id, name)').single();
    if (error) throw error;

    // Auto-create default stages (lead + deal)
    const defaultLead = [
      { name: 'Mß╗¢i', icon: '≡ƒåò', color: '#94A3B8', order_index: 1 },
      { name: '─É├ú li├¬n hß╗ç', icon: '≡ƒô₧', color: '#3B82F6', order_index: 2 },
      { name: '─Éang t╞░ vß║Ñn', icon: '≡ƒÆ¼', color: '#8B5CF6', order_index: 3 },
      { name: 'Chß╗¥ phß║ún hß╗ôi', icon: 'ΓÅ│', color: '#F59E0B', order_index: 4 },
      { name: 'Chuyß╗ân Deal', icon: 'Γ£à', color: '#10B981', order_index: 5, is_won: true },
      { name: 'Mß║Ñt', icon: 'Γ¥î', color: '#EF4444', order_index: 6, is_lost: true },
    ];
    const defaultDeal = [
      { name: 'Deal mß╗¢i', icon: '≡ƒåò', color: '#06B6D4', order_index: 1 },
      { name: 'B├ío gi├í', icon: '≡ƒÆ░', color: '#F59E0B', order_index: 2 },
      { name: '─É├ám ph├ín', icon: '≡ƒñ¥', color: '#8B5CF6', order_index: 3 },
      { name: 'K├╜ hß╗úp ─æß╗ông', icon: '≡ƒô¥', color: '#3B82F6', order_index: 4 },
      { name: 'Thß║»ng', icon: '≡ƒÅå', color: '#10B981', order_index: 5, is_won: true },
      { name: 'Thua', icon: 'Γ¥î', color: '#EF4444', order_index: 6, is_lost: true },
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
    res.status(500).json({ error: crmRouteErrorText(e) || 'Lß╗ùi server' });
  }
});

r.put('/pipelines/:id', async (req, res) => {
  try {
    const sacPUp = scopedAdminCompanyId(req);
    if (sacPUp) {
      const { data: existing } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', req.params.id).single();
      if (!existing) return res.status(404).json({ error: 'Kh├┤ng t├¼m thß║Ñy pipeline' });
      if (String(existing.company_id || '') !== String(sacPUp)) return res.status(403).json({ error: 'Kh├┤ng c├│ quyß╗ün sß╗¡a pipeline c├┤ng ty kh├íc' });
      if (req.body.company_id !== undefined && String(req.body.company_id || '') !== String(sacPUp)) {
        return res.status(403).json({ error: 'Kh├┤ng thß╗â ─æß╗òi pipeline sang c├┤ng ty kh├íc' });
      }
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      const { data: existing } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', req.params.id).single();
      if (!existing) return res.status(404).json({ error: 'Kh├┤ng t├¼m thß║Ñy pipeline' });
      if (String(existing.company_id || '') !== String(cid)) return res.status(403).json({ error: 'Kh├┤ng c├│ quyß╗ün sß╗¡a pipeline c├┤ng ty kh├íc' });
      // Non-admin kh├┤ng ─æ╞░ß╗úc ─æß╗òi company_id
      if (req.body.company_id !== undefined && String(req.body.company_id || '') !== String(cid)) {
        return res.status(403).json({ error: 'Kh├┤ng thß╗â ─æß╗òi pipeline sang c├┤ng ty kh├íc' });
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
    update.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from('crm_pipelines').update(update)
      .eq('id', req.params.id).select('*, company:companies(id, name)').single();
    if (error) throw error;
    invalidatePipelinesAndStages();
    res.json(data);
  } catch (e) {
    if (respondIfCrmPipelinesTableMissing(res, e)) return;
    res.status(500).json({ error: crmRouteErrorText(e) || 'Lß╗ùi server' });
  }
});

r.delete('/pipelines/:id', async (req, res) => {
  try {
    const sacPDel = scopedAdminCompanyId(req);
    if (sacPDel) {
      const { data: existing } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', req.params.id).single();
      if (!existing) return res.status(404).json({ error: 'Kh├┤ng t├¼m thß║Ñy pipeline' });
      if (String(existing.company_id || '') !== String(sacPDel)) return res.status(403).json({ error: 'Kh├┤ng c├│ quyß╗ün x├│a pipeline c├┤ng ty kh├íc' });
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      const { data: existing } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', req.params.id).single();
      if (!existing) return res.status(404).json({ error: 'Kh├┤ng t├¼m thß║Ñy pipeline' });
      if (String(existing.company_id || '') !== String(cid)) return res.status(403).json({ error: 'Kh├┤ng c├│ quyß╗ün x├│a pipeline c├┤ng ty kh├íc' });
    }
    // Check leads using this pipeline
    const { count } = await supabase.from('crm_leads').select('id', { count: 'exact', head: true })
      .eq('pipeline_id', req.params.id);
    if (count > 0) return res.status(400).json({ error: `Kh├┤ng thß╗â x├│a ΓÇö ${count} lead/deal ─æang d├╣ng pipeline n├áy` });
    // Delete stages first, then pipeline
    await supabase.from('crm_pipeline_stages').delete().eq('pipeline_id', req.params.id);
    await supabase.from('crm_pipelines').delete().eq('id', req.params.id);
    invalidatePipelinesAndStages();
    res.json({ message: '─É├ú x├│a pipeline' });
  } catch (e) {
    if (respondIfCrmPipelinesTableMissing(res, e)) return;
    res.status(500).json({ error: crmRouteErrorText(e) || 'Lß╗ùi server' });
  }
});

// Copy pipeline (clone stages) ΓÇö admin only
r.post('/pipelines/:id/copy', async (req, res) => {
  try {
    if (!userIsAdmin(req.user?.role)) return res.status(403).json({ error: 'Chß╗ë admin ─æ╞░ß╗úc copy pipeline' });
    const sourceId = req.params.id;
    const b = req.body || {};
    const targetCompanyId = b.target_company_id || null;
    if (!targetCompanyId) return res.status(400).json({ error: 'Thiß║┐u target_company_id' });
    const sacCopy = scopedAdminCompanyId(req);
    if (sacCopy) {
      if (String(targetCompanyId) !== String(sacCopy)) {
        return res.status(403).json({ error: 'Chß╗ë ─æ╞░ß╗úc copy pipeline trong c├┤ng ty cß╗ºa bß║ín' });
      }
      const { data: srcRow } = await supabase.from('crm_pipelines').select('company_id').eq('id', sourceId).maybeSingle();
      if (String(srcRow?.company_id || '') !== String(sacCopy)) {
        return res.status(403).json({ error: 'Pipeline nguß╗ôn kh├┤ng thuß╗Öc c├┤ng ty cß╗ºa bß║ín' });
      }
    }

    const { data: src, error: srcErr } = await supabase
      .from('crm_pipelines')
      .select('id, name, description, is_active, stages:crm_pipeline_stages(*)')
      .eq('id', sourceId)
      .single();
    if (srcErr) throw srcErr;

    const name = (b.name || '').trim() || `${src.name} (Copy)`;
    const { data: created, error: insErr } = await supabase.from('crm_pipelines').insert({
      name,
      company_id: targetCompanyId,
      description: src.description || null,
      is_default: !!b.set_default,
      is_active: src.is_active !== false,
    }).select('*, company:companies(id, name)').single();
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
        default_probability: s.default_probability != null && s.default_probability !== '' ? s.default_probability : null,
        description: s.description != null && String(s.description).trim() !== '' ? String(s.description).trim() : null,
      }));
      await supabase.from('crm_pipeline_stages').insert(inserts);
    }

    invalidatePipelinesAndStages();
    res.status(201).json({ pipeline: created, stages_copied: stages.length });
  } catch (e) {
    if (respondIfCrmPipelinesTableMissing(res, e)) return;
    res.status(500).json({ error: crmRouteErrorText(e) || e.message || 'Lß╗ùi server' });
  }
});

/** Dedupe + sort cß╗Öt pipeline theo order_index (stepper/Kanban). */
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

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// PIPELINE STAGES (CRUD)
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
r.get('/pipeline-stages', async (req, res) => {
  const { type, pipeline_id, company_id: companyIdQuery, region_id: regionIdQuery } = req.query;
  const sacSt = scopedAdminCompanyId(req);
  const activeOnly = req.query.all !== 'true';

  let effectivePipelineId = pipeline_id || null;

  if (pipeline_id) {
    // Permission check theo pipeline ─æang truy vß║Ñn (single-row lookup, kh├┤ng cache)
    if (sacSt) {
      const { data: pl } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', pipeline_id).maybeSingle();
      if (!pl) return res.json([]);
      if (String(pl.company_id || '') !== String(sacSt)) return res.status(403).json({ error: 'Kh├┤ng c├│ quyß╗ün xem stage cß╗ºa pipeline c├┤ng ty kh├íc' });
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = await requireUserCompanyIdResolved(req, res);
      if (!cid) return;
      const { data: pl } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', pipeline_id).maybeSingle();
      if (!pl) return res.json([]);
      if (String(pl.company_id || '') !== String(cid)) return res.status(403).json({ error: 'Kh├┤ng c├│ quyß╗ün xem stage cß╗ºa pipeline c├┤ng ty kh├íc' });
    }
  } else if (companyIdQuery) {
    const companyId = String(companyIdQuery || '').trim();
    if (!companyId) return res.json([]);
    if (sacSt) {
      if (String(companyId) !== String(sacSt)) return res.status(403).json({ error: 'Kh├┤ng c├│ quyß╗ün xem stage pipeline c├┤ng ty kh├íc' });
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = await requireUserCompanyIdResolved(req, res);
      if (!cid) return;
      if (String(companyId) !== String(cid)) return res.status(403).json({ error: 'Kh├┤ng c├│ quyß╗ün xem stage pipeline c├┤ng ty kh├íc' });
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
    // Admin xem to├án bß╗Ö (kh├┤ng filter pipeline_id) ΓÇö kh├┤ng cache nh├ính hiß║┐m n├áy.
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
    if (!b.name || !b.pipeline_type) return res.status(400).json({ error: 'Thiß║┐u t├¬n hoß║╖c loß║íi pipeline' });
    const sacPst = scopedAdminCompanyId(req);
    if (sacPst) {
      if (!b.pipeline_id) return res.status(400).json({ error: 'Thiß║┐u pipeline_id' });
      const { data: pl } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', b.pipeline_id).single();
      if (String(pl.company_id || '') !== String(sacPst)) return res.status(403).json({ error: 'Kh├┤ng thß╗â th├¬m stage v├áo pipeline c├┤ng ty kh├íc' });
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      if (!b.pipeline_id) return res.status(400).json({ error: 'Thiß║┐u pipeline_id' });
      const { data: pl } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', b.pipeline_id).single();
      if (String(pl.company_id || '') !== String(cid)) return res.status(403).json({ error: 'Kh├┤ng thß╗â th├¬m stage v├áo pipeline c├┤ng ty kh├íc' });
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
    const slaInsert =
      b.sla_days !== undefined ? normalizePipelineStageSlaDaysForDb(b.sla_days) : undefined;
    const insertObj = {
      name: b.name, pipeline_type: b.pipeline_type, pipeline_id: b.pipeline_id || null,
      color: b.color || '#94A3B8', icon: b.icon || null, order_index: b.order_index ?? nextOrder,
      is_won: b.is_won || false, is_lost: b.is_lost || false, is_active: true,
      send_zalo_on_enter: !!b.send_zalo_on_enter,
      create_event_on_enter: !!b.create_event_on_enter,
      sync_role: b.sync_role || null,
      default_probability: defaultProbability,
      description: stageDesc,
      ...(b.requires_deadline !== undefined ? { requires_deadline: !!b.requires_deadline } : {}),
      ...(slaInsert !== undefined ? { sla_days: slaInsert } : {}),
      ...(b.counts_as_won_revenue !== undefined
        ? { counts_as_won_revenue: b.counts_as_won_revenue == null ? null : !!b.counts_as_won_revenue }
        : {}),
      ...(b.counts_as_completed_revenue !== undefined
        ? { counts_as_completed_revenue: b.counts_as_completed_revenue == null ? null : !!b.counts_as_completed_revenue }
        : {}),
    };
    let { data, error } = await supabase.from('crm_pipeline_stages').insert(insertObj).select().single();
    // Ch╞░a chß║íy migration requires_deadline ΓåÆ bß╗Å cß╗Öt rß╗ôi thß╗¡ lß║íi ─æß╗â kh├┤ng vß╗í tß║ío cß╗Öt.
    if (error && /requires_deadline/.test(error.message || '')) {
      delete insertObj.requires_deadline;
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
      if (String(pl.company_id || '') !== String(sacPsu)) return res.status(403).json({ error: 'Kh├┤ng c├│ quyß╗ün sß╗¡a stage pipeline c├┤ng ty kh├íc' });
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      const { data: st } = await supabase.from('crm_pipeline_stages').select('id, pipeline_id').eq('id', req.params.id).single();
      const { data: pl } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', st.pipeline_id).single();
      if (String(pl.company_id || '') !== String(cid)) return res.status(403).json({ error: 'Kh├┤ng c├│ quyß╗ün sß╗¡a stage pipeline c├┤ng ty kh├íc' });
    }
    const update = {};
    ['name', 'color', 'icon', 'order_index', 'is_won', 'is_lost', 'is_active', 'send_zalo_on_enter', 'create_event_on_enter', 'sync_role'].forEach(f => {
      if (b[f] !== undefined) update[f] = (f === 'send_zalo_on_enter' || f === 'create_event_on_enter') ? !!b[f] : b[f];
    });
    if (b.requires_deadline !== undefined) update.requires_deadline = !!b.requires_deadline;
    if (b.counts_as_won_revenue !== undefined) {
      update.counts_as_won_revenue = b.counts_as_won_revenue == null ? null : !!b.counts_as_won_revenue;
    }
    if (b.counts_as_completed_revenue !== undefined) {
      update.counts_as_completed_revenue = b.counts_as_completed_revenue == null ? null : !!b.counts_as_completed_revenue;
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
    let { data, error } = await supabase.from('crm_pipeline_stages').update(update)
      .eq('id', req.params.id).select().single();
    if (error && /requires_deadline/.test(error.message || '')) {
      delete update.requires_deadline;
      ({ data, error } = await supabase.from('crm_pipeline_stages').update(update)
        .eq('id', req.params.id).select().single());
    }
    if (error) throw error;
    invalidatePipelinesAndStages();
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * Liß╗çt k├¬ c├íc cß╗Öt Production Pipeline ─æang map vß╗ü cß╗Öt CRM n├áy (qua crm_target_stage_id).
 * Phß╗Ñc vß╗Ñ UI ┬½G├ín nhanh cß╗Öt SX┬╗ trong CRM Settings.
 */
r.get('/pipeline-stages/:id/production-columns', async (req, res) => {
  try {
    const stageId = req.params.id;
    const { data: stage } = await supabase
      .from('crm_pipeline_stages')
      .select('id, name, sync_role')
      .eq('id', stageId)
      .maybeSingle();
    if (!stage) return res.status(404).json({ error: 'Stage kh├┤ng tß╗ôn tß║íi' });

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
 * Bulk-g├ín nhiß╗üu cß╗Öt production_pipeline_stages v├áo cß╗Öt CRM n├áy (set crm_target_stage_id).
 * Body: { production_pipeline_stage_ids: string[], replace_existing?: boolean }
 *  - replace_existing=true: cß╗Öt n├áo tr╞░ß╗¢c ─æ├óy g├ín vß╗ü stage n├áy nh╞░ng KH├öNG c├│ trong danh s├ích mß╗¢i
 *    sß║╜ ─æ╞░ß╗úc ─æß║╖t lß║íi crm_target_stage_id = null (bß╗Å g├ín).
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
    if (!stage) return res.status(404).json({ error: 'Stage CRM kh├┤ng tß╗ôn tß║íi' });

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
      if (String(pl.company_id || '') !== String(sacPsd)) return res.status(403).json({ error: 'Kh├┤ng c├│ quyß╗ün x├│a stage pipeline c├┤ng ty kh├íc' });
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      const { data: st } = await supabase.from('crm_pipeline_stages').select('id, pipeline_id').eq('id', req.params.id).single();
      const { data: pl } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', st.pipeline_id).single();
      if (String(pl.company_id || '') !== String(cid)) return res.status(403).json({ error: 'Kh├┤ng c├│ quyß╗ün x├│a stage pipeline c├┤ng ty kh├íc' });
    }
    // Check if any leads use this stage
    const { count } = await supabase.from('crm_leads').select('id', { count: 'exact', head: true })
      .eq('stage_id', req.params.id);
    if (count > 0) return res.status(400).json({ error: `Kh├┤ng thß╗â x├│a ΓÇö ${count} lead/deal ─æang d├╣ng giai ─æoß║ín n├áy` });
    await supabase.from('crm_pipeline_stages').delete().eq('id', req.params.id);
    invalidatePipelinesAndStages();
    res.json({ message: '─É├ú x├│a' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// LEAD/DEAL TYPES ΓÇö Ph├ón loß║íi theo C├┤ng ty
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
r.get('/lead-types', async (req, res) => {
  try {
    const companyId = req.query.company_id || null;
    const sacLt = scopedAdminCompanyId(req);
    if (sacLt) {
      if (companyId && String(companyId) !== String(sacLt)) {
        return res.status(403).json({ error: 'Kh├┤ng c├│ quyß╗ün xem loß║íi cß╗ºa c├┤ng ty kh├íc' });
      }
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      if (companyId && String(companyId) !== String(cid)) return res.status(403).json({ error: 'Kh├┤ng c├│ quyß╗ün xem loß║íi cß╗ºa c├┤ng ty kh├íc' });
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
    if (!b.name?.trim()) return res.status(400).json({ error: 'Thiß║┐u t├¬n loß║íi' });
    let company_id = b.company_id || null;
    if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      company_id = cid;
    }
    if (!company_id) return res.status(400).json({ error: 'Thiß║┐u company_id' });

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
      if (String(existing.company_id || '') !== String(cid)) return res.status(403).json({ error: 'Kh├┤ng c├│ quyß╗ün sß╗¡a loß║íi cß╗ºa c├┤ng ty kh├íc' });
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

// ΓöÇΓöÇΓöÇ Ng╞░ß╗¥i giß╗¢i thiß╗çu (theo c├┤ng ty) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
r.get('/referrers', async (req, res) => {
  try {
    const companyId = req.query.company_id || null;
    const sacRef = scopedAdminCompanyId(req);
    if (sacRef) {
      if (companyId && String(companyId) !== String(sacRef)) {
        return res.status(403).json({ error: 'Kh├┤ng c├│ quyß╗ün xem ng╞░ß╗¥i giß╗¢i thiß╗çu cß╗ºa c├┤ng ty kh├íc' });
      }
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      if (companyId && String(companyId) !== String(cid)) {
        return res.status(403).json({ error: 'Kh├┤ng c├│ quyß╗ün xem ng╞░ß╗¥i giß╗¢i thiß╗çu cß╗ºa c├┤ng ty kh├íc' });
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
    if (!company_id) return res.status(400).json({ error: 'Thiß║┐u company_id' });
    const { upsertCrmReferrer, normalizeReferrerName } = require('../helpers/crmReferrers');
    const nameTrim = normalizeReferrerName(b.name);
    if (!nameTrim) return res.status(400).json({ error: 'Nhß║¡p t├¬n ng╞░ß╗¥i giß╗¢i thiß╗çu' });
    const saved = await upsertCrmReferrer({
      companyId: company_id,
      name: nameTrim,
      userId: req.user.userId,
    });
    if (!saved) {
      return res.status(503).json({ error: 'Ch╞░a c├ái bß║úng ng╞░ß╗¥i giß╗¢i thiß╗çu ΓÇö chß║íy migration 337' });
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
      if (String(existing.company_id || '') !== String(cid)) return res.status(403).json({ error: 'Kh├┤ng c├│ quyß╗ün x├│a loß║íi cß╗ºa c├┤ng ty kh├íc' });
    }

    const { count } = await supabase.from('crm_leads')
      .select('id', { count: 'exact', head: true })
      .eq('lead_type_id', req.params.id);
    if ((count || 0) > 0) return res.status(400).json({ error: `Kh├┤ng thß╗â x├│a ΓÇö ${count} lead/deal ─æang d├╣ng loß║íi n├áy` });

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
    res.json({ message: '─É├ú sß║»p xß║┐p lß║íi' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ΓòÉΓòÉΓòÉ ZALO OA ΓÇö Gß╗¡i tin qua S─ÉT (cß║Ñu h├¼nh + test) ΓòÉΓòÉΓòÉ
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
      return res.status(400).json({ error: 'Cß║ºn access_token v├á template_id (l╞░u trong cß║Ñu h├¼nh hoß║╖c gß╗¡i k├¿m body)' });
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

// ΓòÉΓòÉΓòÉ Zalo OA ΓÇö Xem tr╞░ß╗¢c + gß╗¡i thß╗º c├┤ng khi deal ß╗ƒ cß╗Öt ┬½Ho├án th├ánh┬╗ ΓòÉΓòÉΓòÉ
r.get('/leads/:id/zalo-notify-preview', async (req, res) => {
  try {
    const leadId = req.params.id;
    const { data: lead } = await supabase.from('crm_leads')
      .select('id, code, title, type, stage_id, estimated_value, pipeline_id, customer:customers(id, full_name, phone, email, address)')
      .eq('id', leadId)
      .single();
    if (!lead) return res.status(404).json({ error: 'Kh├┤ng t├¼m thß║Ñy' });
    if (lead.type !== 'deal') return res.status(400).json({ error: 'Chß╗ë ├íp dß╗Ñng cho deal' });

    const { data: stage } = await supabase.from('crm_pipeline_stages')
      .select('id, name, is_won, send_zalo_on_enter, pipeline_type')
      .eq('id', lead.stage_id)
      .single();
    if (!isDealStageHoanThanhForZalo(stage)) {
      return res.status(400).json({
        error:
          'Chß╗ë hiß╗ân thß╗ï khi deal ─æang ß╗ƒ cß╗Öt ┬½Ho├án th├ánh┬╗ (t├¬n giai ─æoß║ín deal chß╗⌐a ┬½Ho├án th├ánh┬╗). Th├¬m cß╗Öt n├áy trong C├ái ─æß║╖t Pipeline ΓåÆ Deal v├á k├⌐o deal v├áo ─æ├│.',
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
        tracking_id: '(tß╗▒ sinh khi gß╗¡i)',
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
          'Tr├¬n C├ái ─æß║╖t Pipeline ΓåÆ Deal: bß║¡t n├║t ┬½Zalo┬╗ tr├¬n cß╗Öt ┬½Ho├án th├ánh┬╗ ─æß╗â tß╗▒ gß╗¡i khi k├⌐o deal v├áo cß╗Öt ─æ├│ (mß╗ùi deal + cß╗Öt tß╗æi ─æa 1 lß║ºn th├ánh c├┤ng).',
        settings:
          'access_token (bß║»t buß╗Öc) + Zalo OA chung. Theo tß╗½ng pipeline CRM: chß╗ënh template_id / merge JSON ΓÇö ghi ─æ├¿ chung cho deal thuß╗Öc pipeline ─æ├│ (C├ái ─æß║╖t Pipeline ΓåÆ ┬½Zalo theo pipeline┬╗).',
        after_failed_send:
          'Nß║┐u lß║ºn tr╞░ß╗¢c Zalo b├ío lß╗ùi (ch╞░a c├│ msg_id): sß╗¡a cß║Ñu h├¼nh/template rß╗ôi bß║Ñm ┬½Gß╗¡i th├┤ng b├ío Zalo┬╗ lß║íi ΓÇö kh├┤ng cß║ºn x├│a bß║ún ghi.',
        phone_normalize:
          'S─ÉT l╞░u dß║íng 09ΓÇª, +84ΓÇª, 0084ΓÇª hoß║╖c c├│ khoß║úng trß║»ng vß║½n ─æ╞░ß╗úc ΓÇö hß╗ç thß╗æng tß╗▒ chuß║⌐n h├│a 84ΓÇª khi gß╗ìi Zalo. Sau khi gß╗¡i th├ánh c├┤ng, S─ÉT kh├ích c├│ thß╗â ─æ╞░ß╗úc cß║¡p nhß║¡t dß║íng 0xxxxxxxxx tr├¬n thß║╗ Kh├ích h├áng.',
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** ─Éiß╗ün template_data theo object mß║½u (key) + dß╗» liß╗çu deal ΓÇö d├╣ng tr╞░ß╗¢c khi gß╗¡i Zalo thß╗º c├┤ng */
r.post('/leads/:id/zalo-template-fill', async (req, res) => {
  try {
    const leadId = req.params.id;
    const { data: lead } = await supabase.from('crm_leads')
      .select('id, code, title, type, stage_id, estimated_value, pipeline_id, customer:customers(id, full_name, phone, email, address)')
      .eq('id', leadId)
      .single();
    if (!lead) return res.status(404).json({ error: 'Kh├┤ng t├¼m thß║Ñy' });
    if (lead.type !== 'deal') return res.status(400).json({ error: 'Chß╗ë ├íp dß╗Ñng cho deal' });

    const { data: stage } = await supabase.from('crm_pipeline_stages')
      .select('id, name, pipeline_type')
      .eq('id', lead.stage_id)
      .single();
    if (!isDealStageHoanThanhForZalo(stage)) {
      return res.status(400).json({ error: 'Chß╗ë d├╣ng khi deal ─æang ß╗ƒ cß╗Öt ┬½Ho├án th├ánh┬╗' });
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
    if (!lead) return res.status(404).json({ error: 'Kh├┤ng t├¼m thß║Ñy' });
    if (lead.type !== 'deal') return res.status(400).json({ error: 'Chß╗ë ├íp dß╗Ñng cho deal' });

    const { data: stage } = await supabase.from('crm_pipeline_stages')
      .select('id, name, is_won, pipeline_type')
      .eq('id', lead.stage_id)
      .single();
    if (!isDealStageHoanThanhForZalo(stage)) {
      return res.status(400).json({ error: 'Chß╗ë gß╗¡i ─æ╞░ß╗úc khi deal ─æang ß╗ƒ cß╗Öt ┬½Ho├án th├ánh┬╗' });
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

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// EMPLOYEES BY COMPANY ΓÇö Lß╗ìc nh├ón vi├¬n theo c├┤ng ty cß╗ºa user ─æ─âng nhß║¡p
// Chß╗ë hiß╗ân thß╗ï nh├ón vi├¬n thuß╗Öc ph├▓ng ban kinh doanh (sales) cß╗ºa c├┤ng ty ─æ├│
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
r.get('/employees-by-company', responseCache({ ttl: 120, scope: 'company', tags: ['orgtree'] }), async (req, res) => {
  try {
    const userId = req.user.userId;
    const { company_id: queryCompanyId } = req.query;
    const forModuleRaw = String(req.query?.for_module || 'crm').trim().toLowerCase();
    const forModule = ['crm', 'production', 'logistics'].includes(forModuleRaw) ? forModuleRaw : 'crm';

    const sacEmp = scopedAdminCompanyId(req);
    // Resolve company_id: admin gß║»n c├┤ng ty ΓåÆ chß╗ë c├┤ng ty ─æ├│; kh├íc ΓåÆ query / user / department
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

    // Lß╗ìc ph├▓ng ban theo module ─æß╗â picker phß╗Ñ tr├ích chß╗ë hiß╗çn ─æ├║ng ─æß╗Öi.
    const { data: allDepts } = await supabase.from('departments')
      .select('id, name, color, company_id')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('name');

    const MODULE_DEPT_KEYWORDS = {
      crm: ['kinh doanh', 'sales', 'cskh', 'marketing', 't╞░ vß║Ñn', 'ch─âm s├│c', 'th╞░╞íng mß║íi', 'ph├ít triß╗ân'],
      production: ['sß║ún xuß║Ñt', 'xuong', 'x╞░ß╗ƒng', 'kß╗╣ thuß║¡t', 'ky thuat', 'gia c├┤ng', 'gia cong', 'thi c├┤ng', 'thi cong'],
      logistics: ['logistics', 'vß║¡n chuyß╗ân', 'van chuyen', 'giao h├áng', 'giao hang', 'lß║»p ─æß║╖t', 'lap dat', 'kho'],
    };
    const moduleKeywords = MODULE_DEPT_KEYWORDS[forModule] || MODULE_DEPT_KEYWORDS.crm;
    const moduleDepts = (allDepts || []).filter((d) => {
      const lowerName = (d.name || '').toLowerCase();
      return moduleKeywords.some((kw) => lowerName.includes(kw));
    });

    // Nß║┐u ch╞░a map ─æ╞░ß╗úc theo keyword module ΓåÆ fallback tß║Ñt cß║ú ph├▓ng ban c├┤ng ty.
    const targetDepts = moduleDepts.length > 0 ? moduleDepts : (allDepts || []);
    const deptIds = targetDepts.map(d => d.id);

    if (!deptIds.length) {
      return res.json({ users: [], departments: [], company_id: companyId });
    }

    // Lß║Ñy nh├ón vi├¬n thuß╗Öc c├íc ph├▓ng ban ─æ├│
    const { data: users } = await supabase.from('users')
      .select('id, full_name, email, phone, avatar, role, department_id, position')
      .in('department_id', deptIds)
      .eq('is_active', true)
      .order('full_name');

    const userRows = users || [];
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
      is_module_filtered: moduleDepts.length > 0,
    });
  } catch (e) {
    console.error('employees-by-company error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// SOURCES ΓÇö bao gß╗ôm nguß╗ôn th├┤ng th╞░ß╗¥ng + FB pages gß╗Öp
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
r.get('/sources', async (req, res) => {
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

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// SOURCE CATEGORIES ΓÇö Ph├ón loß║íi nguß╗ôn (chung / theo c├┤ng ty)
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
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
    if (!userIsAdmin(req.user?.role)) return res.status(403).json({ error: 'Chß╗ë admin' });
    const b = req.body || {};
    if (!b.name?.trim()) return res.status(400).json({ error: 'Thiß║┐u t├¬n ph├ón loß║íi' });
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
    if (!userIsAdmin(req.user?.role)) return res.status(403).json({ error: 'Chß╗ë admin' });
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
    if (update.name === '') return res.status(400).json({ error: 'T├¬n kh├┤ng ─æ╞░ß╗úc trß╗æng' });

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
    if (!userIsAdmin(req.user?.role)) return res.status(403).json({ error: 'Chß╗ë admin' });
    const { count } = await supabase
      .from('crm_sources')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', req.params.id);
    if ((count || 0) > 0) {
      return res.status(400).json({ error: `Kh├┤ng x├│a ─æ╞░ß╗úc ΓÇö ${count} nguß╗ôn ─æang d├╣ng ph├ón loß║íi n├áy` });
    }
    const { error } = await supabase.from('crm_source_categories').delete().eq('id', req.params.id);
    if (error) throw error;
    invalidateSources();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// SOURCES ΓÇö Tß║ío / sß╗¡a (admin)
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
r.post('/sources', async (req, res) => {
  try {
    if (!userIsAdmin(req.user?.role)) return res.status(403).json({ error: 'Chß╗ë admin' });
    const b = req.body || {};
    if (!b.name?.trim()) return res.status(400).json({ error: 'Thiß║┐u t├¬n nguß╗ôn' });
    let company_id = b.company_id === '' || b.company_id === undefined ? null : String(b.company_id);
    const category_id = b.category_id === '' || b.category_id === undefined ? null : String(b.category_id);
    const chk = await assertCategoryFitsSource(supabase, category_id, company_id);
    if (!chk.ok) return res.status(400).json({ error: chk.error });

    const { data, error } = await supabase
      .from('crm_sources')
      .insert({
        name: b.name.trim(),
        icon: b.icon?.trim() || '≡ƒôÄ',
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
    if (!userIsAdmin(req.user?.role)) return res.status(403).json({ error: 'Chß╗ë admin' });
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
    if (update.name === '') return res.status(400).json({ error: 'T├¬n kh├┤ng ─æ╞░ß╗úc trß╗æng' });

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

// ΓòÉΓòÉΓòÉ Gß╗ÿP LEAD/DEAL ΓÇö D├╣ng chung cho merge-duplicates (auto) v├á merge-selected (thß╗º c├┤ng) ΓòÉΓòÉΓòÉ

/** Gß╗Öp bß║ún ghi kh├ích source ΓåÆ target: bß╗ò sung tr╞░ß╗¥ng trß╗æng, g├ín lß║íi FK, x├│a source */
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
 * includeSecondaryData=false: chß╗ë x├│a bß║ún ghi phß╗Ñ, kh├┤ng chuyß╗ân t├ái liß╗çu/nhiß╗çm vß╗Ñ/b├ío gi├í/ΓÇª sang bß║ún giß╗» (dß╗» liß╗çu gß║»n lead ─æ├│ cascade theo DB).
 */
async function executeLeadMerge(keepId, deleteIds, options = {}) {
  const { finalTitle, mergeCustomers = false, includeSecondaryData = true } = options;
  const idsToDelete = [...new Set((deleteIds || []).filter((id) => id && String(id) !== String(keepId)))];
  if (!keepId || !idsToDelete.length) {
    const err = new Error('keep_id v├á ├¡t nhß║Ñt mß╗Öt delete_id l├á bß║»t buß╗Öc');
    err.status = 400;
    throw err;
  }

  const { data: keepLead } = await supabase
    .from('crm_leads')
    .select('id, title, customer_id, estimated_value, type')
    .eq('id', keepId)
    .single();
  if (!keepLead) {
    const err = new Error('Lead/deal giß╗» lß║íi kh├┤ng tß╗ôn tß║íi');
    err.status = 404;
    throw err;
  }

  const { data: delLeads } = await supabase
    .from('crm_leads')
    .select('id, customer_id, type, estimated_value')
    .in('id', idsToDelete);
  if (!delLeads?.length || delLeads.length !== idsToDelete.length) {
    const err = new Error('Mß╗Öt hoß║╖c nhiß╗üu bß║ún ghi cß║ºn gß╗Öp kh├┤ng tß╗ôn tß║íi');
    err.status = 404;
    throw err;
  }
  for (const d of delLeads) {
    if (d.type !== keepLead.type) {
      const err = new Error('Chß╗ë gß╗Öp c├╣ng loß║íi: Lead vß╗¢i Lead hoß║╖c Deal vß╗¢i Deal');
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

  /** Chuß║⌐n h├│a sß╗æ cho merge (tr├ính cß╗Öng chuß╗ùi / NaN). */
  const numEstMerge = (x) => {
    const n = Number(x);
    return Number.isFinite(n) ? n : 0;
  };
  /** EV ban ─æß║ºu cß╗ºa bß║ún giß╗» + tß╗òng EV c├íc bß║ún x├│a ΓÇö chß╗ë d├╣ng khi kh├┤ng c├│ b├ío gi├í ┬½─æang t├¡nh┬╗ sau gß╗Öp. */
  const baseKeepEst = numEstMerge(keepLead.estimated_value);
  const delsEstSum = delLeads.reduce((s, d) => s + numEstMerge(d.estimated_value), 0);

  let movedTasks = 0;
  let movedDocs = 0;
  let movedActivities = 0;
  let movedQuotations = 0;

  for (const delId of idsToDelete) {
    if (String(delId) === String(keepId)) continue;

    if (includeSecondaryData) {
      // Chß╗ë chuyß╗ân nhiß╗çm vß╗Ñ CRM th╞░ß╗¥ng; KH├öNG chuyß╗ân nhiß╗çm vß╗Ñ SX (sx_*) khi gß╗Öp deal.
      // V├¼ sx_* thuß╗Öc pipeline x╞░ß╗ƒng/─æ╞ín, kh├┤ng n├¬n "d├¡nh" sang deal kh├íc sau khi merge.
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
      throw new Error(`Kh├┤ng x├│a ─æ╞░ß╗úc lead/deal ${delId}: ${delErr.message || delErr.details || JSON.stringify(delErr)}`);
    }
  }

  // Gi├í trß╗ï ╞░ß╗¢c t├¡nh sau gß╗Öp: nß║┐u ─æ├ú chuyß╗ân b├ío gi├í sang deal giß╗» ΓåÆ d├╣ng Tß╗öNG b├ío gi├í (mß╗Öt nguß╗ôn sß╗▒ thß║¡t),
  // tr├ính cß╗Öng dß╗ôn EV tß╗½ng deal (─æ├ú ─æß╗ông bß╗Ö tß╗½ BG / tr├╣ng deal chaΓÇôcon) l├ám gß║Ñp ─æ├┤i.
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

// ΓòÉΓòÉΓòÉ QU├ëT TR├ÖNG LEAD ΓÇö Scan duplicates by customer_id + Facebook PSID ΓòÉΓòÉΓòÉ
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
      // Chß╗ë nh├│m nß║┐u c├│ ─Éß╗ª 3 yß║┐u tß╗æ n├áy
      if (!l.customer_id || !l.assigned_to || !l.source_id) return;
      const key = `${l.customer_id}_${l.assigned_to}_${l.source_id}`;
      if (!byCombo[key]) byCombo[key] = [];
      byCombo[key].push({ ...l, fb_contacts: leadFbMap[l.id] || [] });
    });

    const groups = [];
    const usedLeadIds = new Set();

    // Group A: Combo tr├╣ng
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

// ΓòÉΓòÉΓòÉ Gß╗ÿP LEAD ΓÇö Merge duplicates: keep one, delete others (kh├┤ng gß╗Öp bß║ún ghi kh├ích) ΓòÉΓòÉΓòÉ
r.post('/leads/merge-duplicates', async (req, res) => {
  try {
    const { keep_id, delete_ids } = req.body;
    const result = await executeLeadMerge(keep_id, delete_ids, { mergeCustomers: false });
    emitCrmDashboardChanged(req, { action: 'merged', keep_id, count: (delete_ids || []).length });
    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// ΓòÉΓòÉΓòÉ Gß╗ÿP THß╗ª C├öNG (Kanban): gß╗Öp kh├ích + t├ái liß╗çu + chß╗ìn ti├¬u ─æß╗ü ΓòÉΓòÉΓòÉ
// include_secondary_data: true (mß║╖c ─æß╗ïnh) = gß╗Öp KH + chuyß╗ân t├ái liß╗çu/nhiß╗çm vß╗Ñ/b├ío gi├í/ΓÇª sang bß║ún giß╗»
// false = chß╗ë giß╗» dß╗» liß╗çu cß╗ºa bß║ún ─æ╞░ß╗úc chß╗ìn; bß║ún x├│a k├¿m t├ái liß╗çu & li├¬n kß║┐t (CASCADE theo DB)
r.post('/leads/merge-selected', async (req, res) => {
  try {
    const { keep_id, delete_ids, title, include_secondary_data } = req.body;
    const full = include_secondary_data !== false;
    const result = await executeLeadMerge(keep_id, delete_ids, {
      mergeCustomers: full,
      finalTitle: title,
      includeSecondaryData: full,
    });
    emitCrmDashboardChanged(req, { action: 'merged_selected', keep_id, count: (delete_ids || []).length });
    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// ΓòÉΓòÉΓòÉ G├üN PHß╗ñ TR├üCH H├ÇNG LOß║áT (c├╣ng checkbox chß╗ìn Kanban vß╗¢i gß╗Öp thß╗º c├┤ng) ΓòÉΓòÉΓòÉ
// Mß╗Öt ng╞░ß╗¥i phß╗Ñ tr├ích: assigned_to v├á lead_owner_id lu├┤n c├╣ng gi├í trß╗ï.
r.post('/leads/bulk-assign', async (req, res) => {
  try {
    const { ids, assigned_to, lead_owner_id } = req.body;
    const idList = [...new Set((ids || []).filter(Boolean))];
    if (!idList.length) {
      const err = new Error('Cß║ºn ├¡t nhß║Ñt mß╗Öt lead/deal');
      err.status = 400;
      throw err;
    }

    const hasA = assigned_to != null && String(assigned_to).trim() !== '';
    const hasL = lead_owner_id != null && String(lead_owner_id).trim() !== '';
    if (!hasA && !hasL) {
      const err = new Error('Chß╗ìn ng╞░ß╗¥i phß╗Ñ tr├ích');
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
      return res.status(403).json({ error: 'Chß╗ë admin mß╗¢i ─æ╞░ß╗úc g├ín / ─æiß╗üu chß╗ënh ng╞░ß╗¥i phß╗Ñ tr├ích.' });
    }

    const { data: olds, error: fErr } = await supabase
      .from('crm_leads')
      .select('id, type, assigned_to, lead_owner_id, title')
      .in('id', idList);
    if (fErr) throw fErr;
    if (!olds?.length) {
      const err = new Error('Kh├┤ng t├¼m thß║Ñy bß║ún ghi');
      err.status = 404;
      throw err;
    }
    if (olds.length !== idList.length) {
      const err = new Error('Mß╗Öt sß╗æ ID kh├┤ng tß╗ôn tß║íi');
      err.status = 400;
      throw err;
    }

    const uid = req.user?.userId;
    for (const o of olds) {
      if (o.type === 'deal' && uid && !userSeesAllCrmDeals(req.user.role)) {
        if (String(o.assigned_to || '') !== String(uid)) {
          const err = new Error('Bß║ín kh├┤ng ─æ╞░ß╗úc g├ín deal cß╗ºa ng╞░ß╗¥i kh├íc.');
          err.status = 403;
          throw err;
        }
      }
      if (o.type === 'lead' && uid && !userSeesAllCrmLeads(req.user.role)) {
        const owns =
          String(o.assigned_to || '') === String(uid) || String(o.lead_owner_id || '') === String(uid);
        if (!owns) {
          const err = new Error('Bß║ín kh├┤ng ─æ╞░ß╗úc g├ín lead cß╗ºa ng╞░ß╗¥i kh├íc.');
          err.status = 403;
          throw err;
        }
      }
    }
    if (olds[0].type === 'deal' && uid && !userSeesAllCrmDeals(req.user.role) && String(ownerId) !== String(uid)) {
      return res.status(403).json({ error: 'Bß║ín chß╗ë c├│ thß╗â giao deal cho ch├¡nh m├¼nh.' });
    }
    if (olds[0].type === 'lead' && uid && !userSeesAllCrmLeads(req.user.role) && String(ownerId) !== String(uid)) {
      return res.status(403).json({ error: 'Chß╗ë admin mß╗¢i giao lead cho ng╞░ß╗¥i kh├íc.' });
    }

    const types = new Set(olds.map((o) => o.type));
    if (types.size > 1) {
      const err = new Error('Kh├┤ng g├ín h├áng loß║ít trß╗Ön Lead v├á Deal trong mß╗Öt lß║ºn');
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
          `≡ƒæñ ${lab} ─æ╞░ß╗úc giao cho bß║ín`,
          `${lab} "${old.title || ''}" ─æ╞░ß╗úc giao cho bß║ín phß╗Ñ tr├ích`,
          ent,
          old.id
        );
      } catch (ne) {
        console.warn('[bulk-assign] notify:', ne.message);
      }
    }

    emitCrmDashboardChanged(req, { type: olds[0].type, action: 'bulk_assigned', count: idList.length });
    res.json({ success: true, updated: idList.length, type: olds[0].type });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Dß╗ìn dß║╣p lead tr├╣ng theo customer
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

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// LEADS (CRUD + Pipeline)
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ

/** linked_project embed added in migration 76 ΓÇö included here, stripped by runtime fallback if migration not applied */
const CRM_LEAD_LIST_SELECT_EXTRA = ', linked_project:projects!crm_leads_project_id_fkey(id, code, name, order_date, delivery_date, production_deadline, production_note)';
const CRM_LEAD_REGION_EMBED = ', crm_region:company_regions!crm_leads_region_id_fkey(id, name, code)';
const CRM_LEAD_LIST_SELECT_BASE =
  `*, customer:customers(id, full_name, phone, email, company), stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, color, icon, is_won, is_lost, pipeline_type, sync_role, order_index), source:crm_sources(id, name, icon), lead_type:crm_lead_types(id, name, color), assignee:users!crm_leads_assigned_to_fkey(id, full_name), lead_owner:users!crm_leads_lead_owner_id_fkey(id, full_name), company:companies!crm_leads_company_id_fkey(id, name, short_name)${CRM_LEAD_REGION_EMBED}, sx_pipeline_stage:production_pipeline_stages(id, name, color, icon, bucket_slug, company:companies(id, name, short_name)), vc_pipeline_stage:logistics_pipeline_stages(id, name, color, icon, bucket_slug)`;
/** Select tß╗æi thiß╗âu cho Kanban mobile ΓÇö giß║úm payload hydrate ~70%. */
const CRM_LEAD_KANBAN_LITE_SELECT =
  'id, code, title, type, phone, estimated_value, created_at, assigned_to, lead_owner_id, stage_id, region_id, next_follow_up, expected_close_date, ' +
  'customer:customers(id, full_name, phone), ' +
  'stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, color, icon), ' +
  'source:crm_sources(id, name), ' +
  'assignee:users!crm_leads_assigned_to_fkey(id, full_name), ' +
  'lead_owner:users!crm_leads_lead_owner_id_fkey(id, full_name), ' +
  'company:companies!crm_leads_company_id_fkey(id, name, short_name)';
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
    console.warn('[crm] Migration 76 not applied ΓÇö linked_project.production_deadline unavailable');
  }
  // Kiß╗âm tra migration 81 (vc_pipeline_stage_id + FK relationship)
  // Reset vß╗ü true tr╞░ß╗¢c khi check ΓÇö ─æß╗â re-check sau khi migration ─æ├ú chß║íy
  _vcPipelineStageAvailable = true;
  const { error: vcColErr } = await supabase.from('crm_leads').select('vc_pipeline_stage_id').limit(0);
  if (vcColErr && vcColErr.message?.includes('vc_pipeline_stage_id')) {
    _vcPipelineStageAvailable = false;
    console.warn('[crm] Migration 81 not applied ΓÇö vc_pipeline_stage_id column missing');
  } else if (!vcColErr) {
    // Cß╗Öt tß╗ôn tß║íi, kiß╗âm tra tiß║┐p FK relationship bß║▒ng thß╗¡ join
    const { error: vcRelErr } = await supabase
      .from('crm_leads')
      .select('vc_pipeline_stage:logistics_pipeline_stages(id)')
      .limit(0);
    if (vcRelErr && (vcRelErr.message?.includes('relationship') || vcRelErr.message?.includes('logistics_pipeline_stages'))) {
      _vcPipelineStageAvailable = false;
      console.warn('[crm] Migration 82 not applied ΓÇö vc_pipeline_stage FK relationship missing. Chß║íy migration 88 ─æß╗â th├¬m FK.');
    } else {
      console.log('[crm] vc_pipeline_stage join available Γ£ô');
    }
  }
  const { error: ltColorErr } = await supabase.from('crm_lead_types').select('color').limit(0);
  if (ltColorErr && ltColorErr.message?.includes('color')) {
    _crmLeadTypeColorAvailable = false;
    console.warn('[crm] Migration 339 not applied ΓÇö crm_lead_types.color unavailable');
  }
  _crmLeadSelectMigrationChecked = true;
  return getCrmLeadListSelect(); // re-call with flag set
}

/** Lead/deal tß║ío trong N ng├áy v├á user ch╞░a mß╗ƒ chi tiß║┐t ΓåÆ badge "Mß╗¢i" */
const CRM_NEW_LEAD_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** JSONB ─æ├┤i khi trß║ú vß╗ü object hoß║╖c chuß╗ùi JSON ΓÇö chuß║⌐n h├│a th├ánh object phß║│ng. */
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

/** Kh├│a user_id trong JSONB lu├┤n lowercase ─æß╗â tr├ính lß╗çch UUID (JWT vs DB). */
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

/** Trß║ú vß╗ü object list: bß╗Å lead_seen_by khß╗Åi JSON, th├¬m is_new_for_current_user */
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

/** Lead gß║»n Zalo inbox ΓÇö vß║½n hiß╗çn Kanban khi lß╗ìc ┬½C├│ S─ÉT┬╗ d├╣ ch╞░a qu├⌐t ─æ╞░ß╗úc S─ÉT (ri├¬ng Zalo, kh├┤ng ├íp dß╗Ñng FB). */
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

/** ╞»u ti├¬n production_company_id client gß╗¡i; nß║┐u trß╗æng ΓåÆ crm_lead_types.default_production_company_id cß╗ºa deal. */
/** Giai ─æoß║ín ─æ├¡ch khi hß╗ôi lß║íi deal/lead ─æ├ú thua ΓÇö ╞░u ti├¬n stage client gß╗¡i, rß╗ôi lß╗ïch sß╗¡, rß╗ôi cß╗Öt ─æß║ºu pipeline. */
async function resolveReopenTargetStageId(lead, requestedStageId) {
  const raw = String(requestedStageId || '').trim();
  if (raw) {
    const { data: st } = await supabase
      .from('crm_pipeline_stages')
      .select('id, is_lost, pipeline_type, is_active')
      .eq('id', raw)
      .maybeSingle();
    if (!st || st.is_lost || st.pipeline_type !== lead.type) {
      throw new Error('Giai ─æoß║ín ─æ├¡ch kh├┤ng hß╗úp lß╗ç (phß║úi thuß╗Öc pipeline v├á kh├┤ng phß║úi cß╗Öt Thua).');
    }
    if (st.is_active === false) {
      throw new Error('Giai ─æoß║ín ─æ├¡ch ─æ├ú tß║»t.');
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
  throw new Error('Kh├┤ng t├¼m ─æ╞░ß╗úc giai ─æoß║ín ─æß╗â hß╗ôi lß║íi.');
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

/** Nhiß╗çm vß╗Ñ CRM ┬½Chß╗æt sß║ún xuß║Ñt┬╗ ΓÇö ─æß║╖t ng├áy hß║╣n ΓåÆ ─æß╗ông bß╗Ö dß╗▒ kiß║┐n SX + th├┤ng b├ío x╞░ß╗ƒng. */
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

/** Chß╗ë chß║Ñp nhß║¡n YYYY-MM-DD ΓÇö tr├ính lß╗ùi cast timestamptz trong RPC Postgres */
function sanitizeIsoDateQueryParam(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  console.warn('[crm/leads] Bß╗Å qua date_from/date_to kh├┤ng ─æ├║ng ISO (YYYY-MM-DD):', s);
  return null;
}

/**
 * Chuß║⌐n ho├í kß║┐t quß║ú rpc('crm_leads_page_ids') ΓÇö tr├ính 500 khi ids kh├┤ng phß║úi mß║úng hoß║╖c payload lß║í.
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
 * Gß║»n `crm_next_open_task_deadline`: ng├áy hß║╣n (`deadline`) cß╗ºa **mß╗Öt** NV CRM ─æang mß╗ƒ
 * (pending/in_progress) **mß╗¢i nhß║Ñt** theo `updated_at` ΓåÆ `created_at` ΓåÆ `id`.
 * Chß╗ë lß║Ñy hß║ín cß╗ºa NV ─æ├│ (kß╗â cß║ú null); Kanban / view Deadline d├╣ng khi c├│ hß║╣n, kh├┤ng th├¼ fallback SLA / expected_close_date.
 */
async function attachCrmNextOpenTaskDeadline(rows) {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  if (list.length === 0) return [];
  /** lead_id ΓåÆ { updatedMs, createdMs, idNum, deadlineTs | null } */
  const byLeadNewest = new Map();
  // Giß║úm tß╗½ 400 xuß╗æng 200: response Supabase nhß╗Å h╞ín ΓåÆ tr├ính undici reset TLS giß╗»a chß╗½ng tr├¬n local Windows.
  const chunkSize = 200;
  for (let i = 0; i < list.length; i += chunkSize) {
    const chunk = list.slice(i, i + chunkSize).map((r) => String(r.id)).filter(Boolean);
    if (chunk.length === 0) continue;
    const { data, error } = await supabase
      .from('crm_tasks')
      .select('id, lead_id, deadline, created_at, updated_at')
      .in('lead_id', chunk)
      .in('status', ['pending', 'in_progress']);
    if (error) {
      console.warn('[crm] attachCrmNextOpenTaskDeadline:', error.message);
      continue;
    }
    for (const t of data || []) {
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
  // RPC c├│ thß╗â trß║ú tr├╣ng id trong mß╗Öt page ΓåÆ hydrate ra hai row giß╗æng id kh├íc stage snapshot ΓåÆ Kanban hai cß╗Öt.
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
  // Giß║úm tß╗½ 300 xuß╗æng 150: payload mß╗ùi chunk nhß║╣ h╞ín (~v├ái MB ΓåÆ v├ái tr─âm KB),
  // hß║ín chß║┐ "TypeError: fetch failed" khi local Windows gß║╖p AV/VPN/keep-alive thß╗æi.
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

/** Fallback: d├╣ng .range() ΓÇö giß╗¢i hß║ín parsedLimit d├▓ng ─æß╗â tr├ính egress lß╗¢n. */
async function getCrmLeadsListLegacy(reqQuery, opts = {}) {
  const { assigneeStrict = false, viewerUserId = null, req: scopeReq = null } = opts;
  const {
    stage_id,
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
  const parsedLimit = Math.min(Math.max(parseInt(limit) || 100, 1), 2000);
  const parsedOffset = Math.max(parseInt(offset) || 0, 0);
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

  const selectStr = await getCrmLeadListSelect();
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
    if (stage_id) q = q.eq('stage_id', stage_id);
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
    if (search) q = q.or(`title.ilike.%${search}%,code.ilike.%${search}%,phone.ilike.%${search}%`);
    if (scopeReq) q = applyCrmLeadRegionFilterToQuery(q, scopeReq);
    return q;
  };

  // Chß╗ë lß║Ñy ─æ├║ng parsedLimit d├▓ng tß╗½ parsedOffset, kh├┤ng v├▓ng lß║╖p kh├┤ng giß╗¢i hß║ín
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
    if (stage_id) q = q.eq('stage_id', stage_id);
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
    if (search) q = q.or(`title.ilike.%${search}%,code.ilike.%${search}%,phone.ilike.%${search}%`);
    if (scopeReq) q = applyCrmLeadRegionFilterToQuery(q, scopeReq);
    let { data, error } = await q.range(from, from + need - 1);
    if (error && isVcRelationshipError(error)) {
      // FK ch╞░a c├│ ΓÇö strip join v├á retry
      _vcPipelineStageAvailable = false;
      _crmLeadSelectMigrationChecked = false;
      currentSelectStr = currentSelectStr.replace(', vc_pipeline_stage:logistics_pipeline_stages(id, name, color, icon, bucket_slug)', '');
      console.warn('[crm] Auto-strip vc_pipeline_stage join do FK ch╞░a tß╗ôn tß║íi trong schema cache');
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

// ΓöÇΓöÇ Endpoint nhß║╣ cho deal/lead picker (form b├ío gi├í, Excel importΓÇª) ΓöÇΓöÇ
// Trß║ú vß╗ü list ngß║»n gß╗ìn, ─æ├ú filter theo company cß╗ºa user + region scope (qua JWT).
// Query: q (search), type=deal|lead (default deal), customer_id, company_id, region_id, limit (max 50).
r.get('/leads/picker', async (req, res) => {
  try {
    const type = req.query.type === 'lead' ? 'lead' : 'deal';
    const q = String(req.query.q || '').trim();
    const customerId = uuidQueryOrNull(req.query.customer_id);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 50);

    // crm_leads kh├┤ng c├│ cß╗Öt `status` ΓÇö trß║íng th├íi suy ra tß╗½ stage / actual_close_date.
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

    // Scope theo c├┤ng ty: admin c├┤ng ty / nh├ón vi├¬n th╞░ß╗¥ng kho├í theo company_id cß╗ºa user.
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

    // Scope theo khu vß╗▒c
    query = applyCrmLeadRegionFilterToQuery(query, req);
    if (uuidQueryOrNull(req.query.region_id)) {
      query = query.eq('region_id', uuidQueryOrNull(req.query.region_id));
    }

    if (customerId) query = query.eq('customer_id', customerId);

    if (q) {
      // Search theo code / title / S─ÉT / t├¬n KH (d├╣ng OR PostgREST)
      const safe = q.replace(/[(),]/g, ' ').replace(/\s+/g, '%');
      query = query.or(
        `code.ilike.%${safe}%,title.ilike.%${safe}%,phone.ilike.%${safe}%`,
      );
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
    res.status(500).json({ error: e.message || 'Lß╗ùi t├¼m deal' });
  }
});

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
  const countsObj = v.counts && typeof v.counts === 'object' ? v.counts : {};
  const counts = {};
  for (const [k, val] of Object.entries(countsObj)) {
    if (k === '__none__') continue;
    const n = Number(val);
    if (!Number.isNaN(n)) counts[String(k)] = n;
  }
  return { total, counts };
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
  const rcForRpc = getCrmLeadRegionConstraint(req);
  const rpcRegionIds = rcForRpc.mode === 'in' && rcForRpc.ids?.length ? rcForRpc.ids : null;
  return { type, mergedQuery, rpcAssigneeStrict, rpcRegionIds };
}

async function hydrateCrmLeadsRpcPage(parsedRpc, req, parsedOffset, parsedLimit, opts = {}) {
  const { lite = false } = opts;
  const { total, ids } = parsedRpc;
  const hydrated = await fetchCrmLeadsByIdsOrdered(ids, { skipEnrich: lite, lite });
  const windowLen = Array.isArray(ids) ? ids.length : hydrated.length;
  if (lite) {
    const page = attachLeadNewFlagForList(hydrated, req.user?.userId);
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

/** GET /crm/stage-counts ΓÇö ─æß║┐m tß║Ñt cß║ú cß╗Öt trong 1 request (RPC GROUP BY stage_id). */
r.get('/stage-counts', responseCache({ ttl: 90, scope: 'user', tags: ['crm:list'] }), async (req, res) => {
  try {
    const ctx = await resolveCrmLeadsMergedQuery(req, res);
    if (!ctx) return;
    const { type, mergedQuery, rpcAssigneeStrict, rpcRegionIds } = ctx;
    if (crmListUsesLegacyFilters(mergedQuery)) {
      return res.status(400).json({ error: 'Bß╗Ö lß╗ìc hiß╗çn tß║íi ch╞░a hß╗ù trß╗ú stage-counts batch. D├╣ng GET /crm/leads tß╗½ng cß╗Öt.' });
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
      return res.json({ total: parsed.total, counts: parsed.counts });
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

/** GET /crm/kanban-bootstrap ΓÇö stages + counts + trang ─æß║ºu cß╗Öt active trong 1 round-trip. */
r.get('/kanban-bootstrap', responseCache({ ttl: 15, scope: 'user', tags: ['crm:list'] }), async (req, res) => {
  try {
    const ctx = await resolveCrmLeadsMergedQuery(req, res);
    if (!ctx) return;
    const { type, mergedQuery, rpcAssigneeStrict, rpcRegionIds } = ctx;
    if (crmListUsesLegacyFilters(mergedQuery)) {
      return res.status(400).json({ error: 'Bß╗Ö lß╗ìc hiß╗çn tß║íi ch╞░a hß╗ù trß╗ú kanban-bootstrap. D├╣ng GET /crm/leads.' });
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
      return res.status(500).json({ error: 'Kh├┤ng tß║úi ─æ╞░ß╗úc trang kanban' });
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

    // RPC `crm_leads_page_ids` (database/58_...) kh├┤ng c├│ tham sß╗æ p_lead_type_id ΓÇö gß╗¡i th├¬m sß║╜ khiß║┐n PostgREST
    // kh├┤ng resolve ─æ╞░ß╗úc function ΓåÆ 500. Lß╗ìc theo lead_type_id / referrer_name / customer_company chß╗ë d├╣ng legacy.
    if (uuidQueryOrNull(lead_type_id) || referrerNameQuery || customerCompanyQuery) {
      const legacy = await getCrmLeadsListLegacy(mergedQuery, {
        assigneeStrict: rpcAssigneeStrict,
        viewerUserId: req.user?.userId,
        req,
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
      });
      return res.json(legacy);
    }

    const rcForRpc = getCrmLeadRegionConstraint(req);
    const rpcRegionIds = rcForRpc.mode === 'in' && rcForRpc.ids?.length ? rcForRpc.ids : null;

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
    // DB c┼⌐: kh├┤ng c├│ p_region_ids ΓÇö thß╗¡ bß╗Å tham sß╗æ cuß╗æi
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
    const lite = req.query.lite === '1' || req.query.lite === 'true';

    if (rpcOk) {
      const pageResult = await hydrateCrmLeadsRpcPage(parsedRpc, req, parsedOffset, parsedLimit, { lite });
      return res.json(pageResult);
    }

    if (rpcError) {
      console.warn('[crm/leads] crm_leads_page_ids RPC unavailable, using legacy (max 5000 rows):', rpcError.message);
    }
    const legacy = await getCrmLeadsListLegacy(mergedQuery, {
      assigneeStrict: rpcAssigneeStrict,
      viewerUserId: req.user?.userId,
      req,
    });
    return res.json(legacy);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ΓöÇΓöÇ CUSTOMERS CRUD ΓöÇΓöÇ
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
    if (!full_name?.trim()) return res.status(400).json({ error: 'T├¬n kh├ích h├áng l├á bß║»t buß╗Öc' });
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

// ΓòÉΓòÉΓòÉ KHU Vß╗░C CRM (company_regions) ΓòÉΓòÉΓòÉ
r.get('/company-regions', async (req, res) => {
  try {
    const co = req.query.company_id && String(req.query.company_id).trim();
    const div = req.query.division_unit_id && String(req.query.division_unit_id).trim();
    const idsParam = req.query.company_ids && String(req.query.company_ids).trim();
    const coIds = idsParam ? idsParam.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const forModuleRaw = req.query.for_module && String(req.query.for_module).trim().toLowerCase();
    if (!co && coIds.length === 0) return res.status(400).json({ error: 'Thiß║┐u company_id' });

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
      if (!checkOne(co)) return res.status(403).json({ error: 'Kh├┤ng c├│ quyß╗ün' });
      allowedIds = [co];
    } else {
      allowedIds = coIds.filter(checkOne);
      if (allowedIds.length === 0) return res.json([]);
    }

    // Lß╗ìc theo khß╗æi ─æ╞░ß╗úc cß║Ñu h├¼nh cho module (vd. for_module=crm) ΓÇö chß╗ë trß║ú khu vß╗▒c
    // c├│ division_unit_id thuß╗Öc c├íc khß╗æi CRM. Khu vß╗▒c ch╞░a g├ín khß╗æi ─æ╞░ß╗úc giß╗» lß║íi
    // ─æß╗â t╞░╞íng th├¡ch dß╗» liß╗çu c┼⌐.
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
    void scheduleRegionGeocoding(data);
    res.json(data);
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
    if (!company_id || !String(name || '').trim()) return res.status(400).json({ error: 'company_id v├á name l├á bß║»t buß╗Öc' });
    const sac = scopedAdminCompanyId(req);
    if (!isCrmSystemAdminUser(req.user) && !sac) {
      return res.status(403).json({ error: 'Chß╗ë admin c├┤ng ty hoß║╖c admin hß╗ç thß╗æng th├¬m khu vß╗▒c' });
    }
    if (sac && String(company_id) !== String(sac)) return res.status(403).json({ error: 'Kh├┤ng tß║ío khu vß╗▒c cho c├┤ng ty kh├íc' });

    let divId = division_unit_id || null;
    if (!divId) {
      const { data: co } = await supabase.from('companies').select('division_unit_id').eq('id', company_id).maybeSingle();
      divId = co?.division_unit_id || null;
    }
    if (divId) {
      const { ok } = await assertDivisionAllowedForCompany(company_id, divId);
      if (!ok) return res.status(400).json({ error: 'Khß╗æi kh├┤ng thuß╗Öc c├┤ng ty n├áy' });
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
      return res.status(400).json({ error: 'Toß║í ─æß╗Ö chi nh├ính phß║úi nß║▒m trong phß║ím vi Viß╗çt Nam' });
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
    if (!row) return res.status(404).json({ error: 'Kh├┤ng t├¼m thß║Ñy' });
    const sac = scopedAdminCompanyId(req);
    if (!isCrmSystemAdminUser(req.user) && !sac) {
      return res.status(403).json({ error: 'Chß╗ë admin c├┤ng ty hoß║╖c admin hß╗ç thß╗æng sß╗¡a khu vß╗▒c' });
    }
    if (sac && String(row.company_id) !== String(sac)) return res.status(403).json({ error: 'Kh├┤ng c├│ quyß╗ün' });
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
        return res.status(400).json({ error: 'Toß║í ─æß╗Ö chi nh├ính phß║úi nß║▒m trong phß║ím vi Viß╗çt Nam' });
      }
    }
    if (patch.address !== undefined || patch.map_url !== undefined) {
      patch.geocoded_at = null;
      if (patch.lat === undefined) patch.lat = null;
      if (patch.lng === undefined) patch.lng = null;
    }
    if (patch.division_unit_id) {
      const { ok } = await assertDivisionAllowedForCompany(row.company_id, patch.division_unit_id);
      if (!ok) return res.status(400).json({ error: 'Khß╗æi kh├┤ng thuß╗Öc c├┤ng ty n├áy' });
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
 *   Force re-geocode (x├│a cache + reset lat/lng, gß╗ìi forwardGeocode ─æß╗ông bß╗Ö).
 *   Trß║ú vß╗ü { id, lat, lng, source } hoß║╖c { ok: false, reason }.
 */
r.post('/company-regions/:id/regeocode', async (req, res) => {
  try {
    const { id } = req.params;
    const { data: row } = await supabase
      .from('company_regions')
      .select('id, company_id, address, map_url, name')
      .eq('id', id)
      .maybeSingle();
    if (!row) return res.status(404).json({ error: 'Kh├┤ng t├¼m thß║Ñy' });
    const sac = scopedAdminCompanyId(req);
    if (!isCrmSystemAdminUser(req.user) && !sac) {
      return res.status(403).json({ error: 'Chß╗ë admin c├┤ng ty hoß║╖c admin hß╗ç thß╗æng' });
    }
    if (sac && String(row.company_id) !== String(sac)) {
      return res.status(403).json({ error: 'Kh├┤ng c├│ quyß╗ün' });
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

/** POST /crm/leads/stage-history-summary ΓÇö lß╗ïch sß╗¡ stage theo batch (danh s├ích CRM) */
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
    res.status(500).json({ error: e.message || 'Lß╗ùi tß║úi lß╗ïch sß╗¡ stage' });
  }
});

r.post('/leads', async (req, res) => {
  try {
    const code = await nextCode('LEAD');
    const body = { ...req.body };
    delete body.priority; // crm_leads kh├┤ng c├│ cß╗Öt priority
    ['customer_id', 'source_id', 'stage_id', 'assigned_to', 'company_id', 'pipeline_id', 'lead_type_id', 'region_id'].forEach(f => {
      if (body[f] === '' || body[f] === undefined) body[f] = null;
    });
    if (!body.assigned_to) body.assigned_to = req.user.userId;
    if (!userSeesAllCrmLeadsForScope(req.user)) body.assigned_to = req.user.userId;
    body.lead_owner_id = body.assigned_to;

    const lockedLeadCo = scopedCrmCompanyIdForWrite(req);
    if (lockedLeadCo) {
      if (body.company_id && String(body.company_id) !== String(lockedLeadCo)) {
        return res.status(403).json({ error: 'Kh├┤ng tß║ío lead/deal cho c├┤ng ty kh├íc' });
      }
      body.company_id = lockedLeadCo;
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      body.company_id = cid;
    }

    // Resolve pipeline_id + first stage by company (company-scoped pipelines)
    if (!body.company_id) return res.status(400).json({ error: 'Vui l├▓ng chß╗ìn c├┤ng ty' });

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
      if (!pl) return res.status(400).json({ error: 'Pipeline kh├┤ng tß╗ôn tß║íi' });
      if (String(pl.company_id || '') !== String(body.company_id || '')) return res.status(400).json({ error: 'Pipeline kh├┤ng thuß╗Öc c├┤ng ty ─æ├ú chß╗ìn' });
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
      if (!lt) return res.status(400).json({ error: 'Loß║íi Lead/Deal kh├┤ng tß╗ôn tß║íi' });
      if (String(lt.company_id || '') !== String(body.company_id || '')) return res.status(400).json({ error: 'Loß║íi kh├┤ng thuß╗Öc c├┤ng ty ─æ├ú chß╗ìn' });
      if (lt.is_active === false) return res.status(400).json({ error: 'Loß║íi ─æang bß╗ï ß║⌐n' });
      if (lt.applies_to && !['lead','both'].includes(String(lt.applies_to))) return res.status(400).json({ error: 'Loß║íi n├áy kh├┤ng ├íp dß╗Ñng cho Lead' });
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
      const targetIds = new Set();
      if (body.assigned_to) targetIds.add(body.assigned_to);
      const { data: admins } = await supabase.from('users').select('id').eq('role', 'admin').eq('is_active', true);
      (admins || []).forEach(a => targetIds.add(a.id));
      if (targetIds.size) await notifyMultiple(req, [...targetIds], 'lead_created',
        '≡ƒåò Lead mß╗¢i',
        `Lead "${body.title}" ΓÇö M├ú: ${code}`,
        'crm_lead', data.id);
    } catch (ne) { console.warn('[NOTIFY] lead_created:', ne.message); }

    try {
      await autoGenCrmTasksForNewLead(data.id, req.user.userId, req);
    } catch (autoErr) { console.error('Auto-create tasks error:', autoErr.message); }

    // Lead: to├án bß╗Ö nhiß╗çm vß╗Ñ tr├¬n ch├¡nh lead (kh├┤ng ─É╞ín 1 / deal con).

    emitCrmDashboardChanged(req, { type: 'lead', company_id: data.company_id, lead_id: data.id, action: 'created' });
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/deals', async (req, res) => {
  try {
    const body = { ...req.body };
    delete body.priority; // crm_leads kh├┤ng c├│ cß╗Öt priority
    const applyWorkshopSxFromBody =
      body.apply_workshop_production_tasks === true || body.apply_workshop_production_tasks === 'true';
    delete body.apply_workshop_production_tasks;

    ['customer_id', 'source_id', 'stage_id', 'assigned_to', 'company_id', 'pipeline_id', 'lead_type_id', 'region_id'].forEach(f => {
      if (body[f] === '' || body[f] === undefined) body[f] = null;
    });

    if (!body.title) return res.status(400).json({ error: 'Nhß║¡p t├¬n Deal' });
    const lockedDealCo = scopedCrmCompanyIdForWrite(req);
    if (lockedDealCo) {
      if (body.company_id && String(body.company_id) !== String(lockedDealCo)) {
        return res.status(403).json({ error: 'Kh├┤ng tß║ío deal cho c├┤ng ty kh├íc' });
      }
      body.company_id = lockedDealCo;
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      body.company_id = cid;
    }
    if (!body.company_id) return res.status(400).json({ error: 'Vui l├▓ng chß╗ìn c├┤ng ty' });

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
      body.pipeline_id = await ensureDefaultCrmPipelineForCompany(body.company_id);
    }
    if (!body.pipeline_id) return res.status(500).json({ error: 'C├┤ng ty ch╞░a c├│ pipeline CRM' });
    const { data: pl } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', body.pipeline_id).maybeSingle();
    if (!pl) return res.status(400).json({ error: 'Pipeline kh├┤ng tß╗ôn tß║íi' });
    if (String(pl.company_id || '') !== String(body.company_id || '')) return res.status(400).json({ error: 'Pipeline kh├┤ng thuß╗Öc c├┤ng ty ─æ├ú chß╗ìn' });

    const { data: firstStage } = await supabase
      .from('crm_pipeline_stages')
      .select('id')
      .eq('pipeline_id', body.pipeline_id)
      .eq('pipeline_type', 'deal')
      .eq('is_active', true)
      .order('order_index')
      .limit(1)
      .maybeSingle();
    if (!firstStage) return res.status(500).json({ error: 'Kh├┤ng t├¼m thß║Ñy giai ─æoß║ín Deal ─æß║ºu ti├¬n trong pipeline n├áy' });

    let leadTypeTriggersWorkshopSx = false;
    if (body.lead_type_id) {
      const { data: lt } = await supabase
        .from('crm_lead_types')
        .select('id, company_id, applies_to, is_active, workshop_production_templates')
        .eq('id', body.lead_type_id)
        .maybeSingle();
      if (!lt) return res.status(400).json({ error: 'Loß║íi Lead/Deal kh├┤ng tß╗ôn tß║íi' });
      if (String(lt.company_id || '') !== String(body.company_id || '')) return res.status(400).json({ error: 'Loß║íi kh├┤ng thuß╗Öc c├┤ng ty ─æ├ú chß╗ìn' });
      if (lt.is_active === false) return res.status(400).json({ error: 'Loß║íi ─æang bß╗ï ß║⌐n' });
      if (lt.applies_to && !['deal','both'].includes(String(lt.applies_to))) return res.status(400).json({ error: 'Loß║íi n├áy kh├┤ng ├íp dß╗Ñng cho Deal' });
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
      const targetIds = new Set();
      if (body.assigned_to) targetIds.add(body.assigned_to);
      const { data: admins } = await supabase.from('users').select('id').eq('role', 'admin').eq('is_active', true);
      (admins || []).forEach(a => targetIds.add(a.id));
      if (targetIds.size) await notifyMultiple(req, [...targetIds], 'deal_created',
        '≡ƒÄ» Deal mß╗¢i',
        `Deal "${body.title}" ΓÇö M├ú: ${code} ΓÇö GT: ${formatMoney(body.estimated_value)}`,
        'crm_deal', data.id);
    } catch (ne) { console.warn('[NOTIFY] deal_created:', ne.message); }

    try {
      await autoGenCrmTasksForNewLead(data.id, req.user.userId, req);
    } catch (autoErr) { console.error('Auto-create tasks on deal create error:', autoErr.message); }

    // Nhiß╗çm vß╗Ñ SX (sx_*) tß╗½ workshop_task_templates ΓÇö khi loß║íi Deal bß║¡t cß╗¥ hoß║╖c client gß╗¡i apply_workshop_production_tasks.
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

    // Mß╗Öt deal duy nhß║Ñt; task CRM tr├¬n deal ─æ├│ ΓÇö kh├┤ng tß╗▒ tß║ío ─æ╞ín ┬½─É╞ín 1┬╗ hay deal con.

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
 * Chuß║⌐n h├│a id tr├¬n URL th├ánh crm_leads.id (deal/lead thß║¡t).
 * Mß╗Öt sß╗æ m├án h├¼nh lß╗í truyß╗ün project_id hoß║╖c orders.id ΓÇö vß║½n mß╗ƒ ─æ╞░ß╗úc chi tiß║┐t.
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

/** Nhiß╗üu lß╗¢p select ─æß╗â tr├ính 500 khi DB thiß║┐u cß╗Öt/embed (customers, stage, SX/VC pipeline). */
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

/** Lead k├¿m embed badge SX/VC (d├╣ng sau chuyß╗ân cß╗Öt Thß║»ng/SX). */
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

/** Lightweight: chß╗ë trß║ú vß╗ü badge SX/VC pipeline stage ΓÇö kh├┤ng c├│ side effect */
r.get('/leads/:id/badge', async (req, res) => {
  try {
    const data = await fetchCrmLeadWithPipelineBadges(req.params.id);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Deal c┼⌐: l├ám mß╗¢i badge SX/VC; ch╞░a b├án giao SX th├¼ ─æ╞░a cß╗Öt CRM vß╗ü Thß║»ng nß║┐u ─æang kß║╣t Sß║ún xuß║Ñt/VC. */
r.post('/leads/:id/repair-pipeline-display', async (req, res) => {
  try {
    const leadId = String(req.params.id || '').trim();
    const { data: lead } = await supabase
      .from('crm_leads')
      .select('id, type, company_id')
      .eq('id', leadId)
      .maybeSingle();
    if (!lead) return res.status(404).json({ error: 'Kh├┤ng t├¼m thß║Ñy deal' });
    const sac = scopedAdminCompanyId(req);
    if (sac && String(lead.company_id || '') !== String(sac)) {
      return res.status(403).json({ error: 'Kh├┤ng c├│ quyß╗ün' });
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
    res.status(500).json({ error: e.message || 'Lß╗ùi sß╗¡a hiß╗ân thß╗ï pipeline' });
  }
});

/**
 * GET /crm/leads/:id ΓÇö alias nhß║╣ trß║ú vß╗ü 1 row crm_leads (kh├┤ng k├¿m join nß║╖ng).
 * D├╣ng cho UI chß╗ë cß║ºn ─æß╗ìc nhanh pipeline_id / stage_id / company_id (vd. CRMTasksTab).
 * Endpoint chi tiß║┐t ─æß║ºy ─æß╗º vß║½n l├á /leads/:id/detail.
 */
r.get('/leads/:id', async (req, res) => {
  try {
    const rawId = String(req.params.id || '').trim();
    if (!rawId) return res.status(400).json({ error: 'Thiß║┐u id' });
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
    if (!data) return res.status(404).json({ error: 'Kh├┤ng t├¼m thß║Ñy lead/deal' });
    const sacLdLite = scopedAdminCompanyId(req);
    if (sacLdLite && String(data.company_id || '') !== String(sacLdLite)) {
      return res.status(403).json({ error: 'Kh├┤ng c├│ quyß╗ün xem lead/deal cß╗ºa c├┤ng ty kh├íc' });
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
        error: 'Kh├┤ng t├¼m thß║Ñy lead/deal',
        hint: 'D├╣ng ─æ├║ng crm_leads.id (UUID deal/lead). Nß║┐u ─æang mß╗ƒ tß╗½ dß╗▒ ├ín, d├╣ng deal gß║»n project_id; nß║┐u tß╗½ ─æ╞ín h├áng con, d├╣ng fulfillment_lead_id.',
        requested_id: rawId,
      });
    }
    if (error || !data) {
      throw new Error(error?.message || (typeof error === 'string' ? error : 'Kh├┤ng tß║úi ─æ╞░ß╗úc chi tiß║┐t lead/deal'));
    }
    const sacLd = scopedAdminCompanyId(req);
    if (sacLd && String(data.company_id || '') !== String(sacLd)) {
      return res.status(403).json({ error: 'Kh├┤ng c├│ quyß╗ün xem lead/deal cß╗ºa c├┤ng ty kh├íc' });
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
    // Per-user flags (ghim / ─æ├ú t╞░╞íng t├íc) cho user hiß╗çn tß║íi.
    try {
      const flags = await require('../helpers/crmLeadUserFlags').fetchFlagsByLeadIds(uid, [canonicalId]);
      const f = flags.get(String(canonicalId));
      data.is_pinned = !!f?.is_pinned;
      data.pinned_at = f?.pinned_at || null;
      data.is_interacted = !!f?.is_interacted;
      data.interacted_at = f?.interacted_at || null;
    } catch (e) {
      // BC: bß║úng ch╞░a migrate ΓåÆ mß║╖c ─æß╗ïnh false.
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
        return res.status(403).json({ error: 'Kh├┤ng c├│ quyß╗ün sß╗¡a lead/deal cß╗ºa c├┤ng ty kh├íc' });
      }
    } else if (isCrmRegionAdminUser(req.user) && req.user.company_id) {
      const regCo = String(req.user.company_id).trim();
      if (!oldLead || String(oldLead.company_id || '') !== String(regCo)) {
        return res.status(403).json({ error: 'Kh├┤ng c├│ quyß╗ün sß╗¡a lead/deal cß╗ºa c├┤ng ty kh├íc' });
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
      return res.status(403).json({ error: 'Kh├┤ng thß╗â chuyß╗ân lead/deal sang c├┤ng ty kh├íc' });
    }

    const wantsOwnerChange =
      Object.prototype.hasOwnProperty.call(req.body, 'assigned_to')
      || Object.prototype.hasOwnProperty.call(req.body, 'lead_owner_id');
    if (wantsOwnerChange) {
      const newOwner = safeBody.assigned_to;
      const prevOwner = oldLead?.assigned_to || oldLead?.lead_owner_id;
      const adminLike = userIsCrmCompanyOrRegionAdmin(req);
      if (newOwner == null && prevOwner != null && !adminLike) {
        return res.status(403).json({ error: 'Chß╗ë admin mß╗¢i ─æ╞░ß╗úc bß╗Å g├ín ng╞░ß╗¥i phß╗Ñ tr├ích.' });
      }
      if (newOwner != null) {
        const lc = oldLead?.company_id;
        if (!lc) {
          if (!adminLike) {
            return res.status(400).json({ error: 'Chß╗ìn c├┤ng ty cho lead/deal tr╞░ß╗¢c khi ─æß╗òi ng╞░ß╗¥i phß╗Ñ tr├ích.' });
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
        if (!lt) return res.status(400).json({ error: 'Loß║íi Lead/Deal kh├┤ng tß╗ôn tß║íi' });
        if (String(lt.company_id || '') !== String(oldLead?.company_id || '')) return res.status(400).json({ error: 'Loß║íi kh├┤ng thuß╗Öc c├┤ng ty cß╗ºa Lead/Deal' });
        if (lt.is_active === false) return res.status(400).json({ error: 'Loß║íi ─æang bß╗ï ß║⌐n' });
        const t = oldLead?.type === 'deal' ? 'deal' : 'lead';
        if (lt.applies_to && !['both', t].includes(String(lt.applies_to))) return res.status(400).json({ error: `Loß║íi n├áy kh├┤ng ├íp dß╗Ñng cho ${t === 'deal' ? 'Deal' : 'Lead'}` });
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
        console.warn('[crm PUT /leads/:id] auto-gen deal tasks after leadΓåÆdeal:', genErr.message);
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
              `≡ƒæñ ${label} ─æ╞░ß╗úc giao cho bß║ín`,
              `${label} "${oldLead?.title || data.title}" ─æ╞░ß╗úc giao cho bß║ín phß╗Ñ tr├ích`,
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
      .select('id, title, project_id, customer_id, type, company_id')
      .eq('id', req.params.id).single();
    if (!lead) return res.status(404).json({ error: 'Kh├┤ng t├¼m thß║Ñy lead' });

    const deleteReason = req.body?.delete_reason || req.query.delete_reason || '';

    // Snapshot v├áo Th├╣ng r├íc tr╞░ß╗¢c khi x├│a thß║¡t, ─æß╗â admin c├│ thß╗â phß╗Ñc hß╗ôi.
    // Nß║┐u permanent=true th├¼ kh├┤ng snapshot (x├│a v─⌐nh viß╗àn).
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
          note: `X├│a lead ${lead.title || lead.id}`,
          userId: req.user?.userId,
          display: ph,
        });
        if (!addRes.ok) console.warn('[CRM] Chß║╖n S─ÉT sau x├│a lead:', addRes.error);
      }
    }

    // Nß║┐u l├á lead/deal gß╗æc: x├│a lu├┤n deal/lead con theo ─æ╞ín + c├íc orders li├¬n quan
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

    // (lead_documents/crm_activities/crm_tasks ─æ├ú dß╗ìn theo allLeadIds ß╗ƒ tr├¬n nß║┐u l├á lead gß╗æc)
    try { await supabase.from('lead_documents').delete().eq('lead_id', lead.id); } catch (_) {}
    try { await supabase.from('crm_activities').delete().eq('lead_id', lead.id); } catch (_) {}

    const { error } = await supabase.from('crm_leads').delete().eq('id', lead.id);
    if (error) throw error;

    emitCrmDashboardChanged(req, { type: lead.type, company_id: lead.company_id, lead_id: lead.id, action: 'deleted' });
    res.json({ success: true, message: `─É├ú x├│a lead "${lead.title}"${lead.project_id ? ' v├á dß╗▒ ├ín li├¬n kß║┐t' : ''}` });
  } catch (e) {
    console.error('Delete lead error:', e);
    res.status(500).json({ error: e.message });
  }
});

/** S─ÉT ─æ├ú chß║╖n ΓÇö kh├┤ng tß╗▒ tß║ío lead Facebook / qu├⌐t S─ÉT (createLeadFromFacebook, lead scan). */
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
        // Khß╗¢p theo 9 sß╗æ cuß╗æi nß║┐u user g├╡ sß╗æ; fallback ILIKE display.
        query = query.or(`phone_last9.ilike.%${digits.slice(-9)}%,phone_display.ilike.%${digits}%,note.ilike.%${q}%`);
      } else {
        query = query.ilike('note', `%${q}%`);
      }
    }
    query = query.range(offset, offset + limit - 1);
    const { data, error, count } = await query;
    if (error) {
      // Fallback nß║┐u FK alias kh├┤ng c├│ t├¬n (DB c┼⌐).
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
    if (!phone || !String(phone).trim()) return res.status(400).json({ error: 'Thiß║┐u sß╗æ ─æiß╗çn thoß║íi' });
    const { addPhoneToAutoLeadBlocklist } = require('../helpers/crmAutoLeadPhoneBlocklist');
    const result = await addPhoneToAutoLeadBlocklist(supabase, String(phone).trim(), {
      note: note ? String(note).trim() : null,
      userId: req.user?.userId || null,
      display: String(phone).trim(),
    });
    if (!result.ok) {
      if (result.error === 'invalid_phone') return res.status(400).json({ error: 'Sß╗æ ─æiß╗çn thoß║íi kh├┤ng hß╗úp lß╗ç (cß║ºn ─æß╗º 9 sß╗æ cuß╗æi)' });
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

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// LEAD DOCUMENTS
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ

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

function canUserViewDocByAllowlist(user, doc) {
  if (isAdminLike(user)) return true;
  const uc = user?.company_id || user?.companyId || null;
  const ud = user?.department_id || null;
  const allowedCompanies = parseUuidArrayJsonb(doc?.allowed_companies);
  const allowedDepts = parseUuidArrayJsonb(doc?.allowed_departments);
  if (!allowedCompanies && !allowedDepts) return true;
  if (allowedCompanies && uc && allowedCompanies.some((x) => String(x) === String(uc))) return true;
  if (allowedDepts && ud && allowedDepts.some((x) => String(x) === String(ud))) return true;
  return false;
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

// Add document to lead + sync ΓåÆ crm_task_attachments (nß║┐u c├│ task_id)
// Task documents cho lead ΓÇö nh├│m theo nhiß╗çm vß╗Ñ
r.get('/leads/:id/task-documents', async (req, res) => {
  try {
    // Lß║Ñy tß║Ñt cß║ú crm_tasks cß╗ºa lead (c├│ stage_slug)
    const { data: crmTasks } = await supabase.from('crm_tasks')
      .select('id, title, stage_slug, checklist, pipeline_stage_id, order_index, pipeline_stage:crm_pipeline_stages!crm_tasks_pipeline_stage_id_fkey(id, name, icon, color, order_index)')
      .eq('lead_id', req.params.id)
      .order('order_index');

    // Fallback: c┼⌐ng check project tasks
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
    
    const visible = (attachments || []).filter((a) => canUserViewDocByAllowlist(req.user, a));
    const result = visible.map(a => {
      const taskInfo = taskMap[a.task_id] || {};
      const ckItem = a.checklist_id ? findChecklistItem(taskInfo, a.checklist_id) : null;
      return {
        ...a,
        task_title: taskInfo.title || 'Nhiß╗çm vß╗Ñ',
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
      const { SHARE_MODULE_KEYS } = require('../helpers/documentShareScope');
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
        name: name || file_name || 'T├ái liß╗çu',
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

    // ΓöÇΓöÇ SYNC ΓåÆ crm_task_attachments (nß║┐u c├│ task_id) ΓöÇΓöÇ
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
      } catch (syncErr) { console.warn('Sync documentΓåÆattachment:', syncErr.message); }
    }

    // ≡ƒöö NOTIFICATION: T├ái liß╗çu mß╗¢i
    try {
      const { data: leadInfo } = await supabase.from('crm_leads')
        .select('assigned_to, lead_owner_id, title').eq('id', req.params.id).single();
      const ownerIds = [leadInfo?.assigned_to, leadInfo?.lead_owner_id].filter(Boolean);
      if (ownerIds.length) await notifyMultiple(req, ownerIds, 'document_uploaded',
        '≡ƒôÄ T├ái liß╗çu mß╗¢i',
        `"${data.name}" ─æ╞░ß╗úc upload v├áo deal "${leadInfo?.title || 'N/A'}"`,
        'crm_lead', req.params.id);
    } catch (ne) { console.warn('[NOTIFY] document_uploaded:', ne.message); }

    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// BULK add documents (nhiß╗üu files 1 request)
r.post('/leads/:id/documents/bulk', async (req, res) => {
  try {
    const items = req.body.items;
    if (!items?.length) return res.status(400).json({ error: 'Kh├┤ng c├│ file' });

    const { data: lead } = await supabase.from('crm_leads').select('project_id').eq('id', req.params.id).single();
    const rows = items.map(item => ({
      lead_id: req.params.id,
      project_id: lead?.project_id || null,
      name: item.name || item.file_name || 'T├ái liß╗çu',
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

// Delete document + sync x├│a crm_task_attachment li├¬n kß║┐t
r.delete('/leads/:id/documents/:docId', async (req, res) => {
  try {
    // Snapshot v├áo Th├╣ng r├íc tr╞░ß╗¢c khi x├│a thß║¡t (trß╗½ khi permanent=true)
    if (req.query.permanent !== 'true') {
      try {
        const { snapshotLeadDocument } = require('../helpers/trashSnapshot');
        const snapRes = await snapshotLeadDocument(supabase, req.params.docId, req.user?.userId);
        if (!snapRes.ok) console.warn('[delete lead doc] snapshot trash failed:', snapRes.error);
      } catch (e) {
        console.warn('[delete lead doc] trash snapshot error:', e.message);
      }
    }
    // Check if this doc was synced FROM a task attachment
    const { data: doc } = await supabase.from('lead_documents')
      .select('source_attachment_id').eq('id', req.params.docId).single();
    
    // X├│a task attachment li├¬n kß║┐t (nß║┐u c├│)
    if (doc?.source_attachment_id) {
      await supabase.from('crm_task_attachments')
        .delete().eq('id', doc.source_attachment_id);
    }
    
    // X├│a lead_documents li├¬n kß║┐t ng╞░ß╗úc (nß║┐u doc n├áy l├á source cho attachment)
    await supabase.from('crm_task_attachments')
      .delete().eq('source_document_id', req.params.docId);

    // X├│a document ch├¡nh
    const { error } = await supabase
      .from('lead_documents')
      .delete()
      .eq('id', req.params.docId)
      .eq('lead_id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ΓòÉΓòÉΓòÉ PROJECT DOCUMENTS (via lead_documents with project_id) ΓòÉΓòÉΓòÉ
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
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// CONVERT LEAD ΓåÆ DEAL
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ

r.post('/leads/:id/convert-to-deal', async (req, res) => {
  try {
    const { data: lead } = await supabase
      .from('crm_leads')
      .select('*, customer:customers(id, full_name, phone)')
      .eq('id', req.params.id)
      .single();
    
    if (!lead) return res.status(404).json({ error: 'Lead kh├┤ng tß╗ôn tß║íi' });
    if (lead.type === 'deal') return res.status(400).json({ error: '─É├ú l├á Deal rß╗ôi' });

    // Chß╗ë cß║ºn c├│ kh├ích h├áng li├¬n kß║┐t, kh├┤ng bß║»t buß╗Öc ─æß╗º S─ÉT ─æß╗â c├│ thß╗â convert nhanh
    if (!lead.customer_id) {
      return res.status(400).json({ error: 'Lead ch╞░a ─æ╞░ß╗úc li├¬n kß║┐t kh├ích h├áng. V├áo chi tiß║┐t Lead ΓåÆ chß╗ìn Kh├ích h├áng tr╞░ß╗¢c khi chuyß╗ân Deal.' });
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

    // Bß║»t buß╗Öc chß╗ìn khu vß╗▒c CRM khi chuyß╗ân Lead ΓåÆ Deal (─æß╗ông nhß║Ñt ph├ón quyß╗ün theo region).
    const regionIdRaw =
      (req.body.region_id != null ? req.body.region_id : lead.region_id) || null;
    const regionId = regionIdRaw ? String(regionIdRaw).trim() : '';
    if (!regionId) {
      return res.status(400).json({ error: 'Vui l├▓ng chß╗ìn khu vß╗▒c tr╞░ß╗¢c khi chuyß╗ân Lead sang Deal.' });
    }
    {
      const { data: region, error: regionErr } = await supabase
        .from('company_regions')
        .select('id, company_id, is_active')
        .eq('id', regionId)
        .maybeSingle();
      if (regionErr) throw regionErr;
      if (!region) return res.status(400).json({ error: 'Khu vß╗▒c kh├┤ng tß╗ôn tß║íi.' });
      if (region.is_active === false) {
        return res.status(400).json({ error: 'Khu vß╗▒c ─æ├ú ng╞░ng hoß║ít ─æß╗Öng ΓÇö chß╗ìn khu vß╗▒c kh├íc.' });
      }
      if (companyId && String(region.company_id || '') !== String(companyId)) {
        return res.status(400).json({ error: 'Khu vß╗▒c kh├┤ng thuß╗Öc c├┤ng ty cß╗ºa lead.' });
      }
    }

    // Pipeline d├╣ng cho cß╗Öt Deal ─æß║ºu ti├¬n phß║úi tr├╣ng pipeline Kanban cß╗ºa c├┤ng ty (tr╞░ß╗¢c ─æ├óy lß║Ñy 1 cß╗Öt deal tr├¬n to├án DB ΓåÆ stage_id lß║í, kh├┤ng nß║▒m cß╗Öt n├áo tr├¬n board).
    let pipelineForDeal = null;
    if (req.body.pipeline_id) {
      const { data: pl } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', req.body.pipeline_id).maybeSingle();
      if (!pl) return res.status(400).json({ error: 'Pipeline kh├┤ng tß╗ôn tß║íi' });
      if (companyId && String(pl.company_id || '') !== String(companyId)) {
        return res.status(400).json({ error: 'Pipeline kh├┤ng thuß╗Öc c├┤ng ty cß╗ºa lead' });
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
          ? 'Kh├┤ng t├¼m thß║Ñy cß╗Öt Deal ─æß║ºu ti├¬n trong pipeline cß╗ºa c├┤ng ty. Kiß╗âm tra pipeline CRM / migration.'
          : 'Kh├┤ng t├¼m thß║Ñy giai ─æoß║ín Deal ─æß║ºu ti├¬n tr├¬n hß╗ç thß╗æng.',
      });
    }

    // Update lead ΓåÆ deal (mß╗Öt ng╞░ß╗¥i phß╗Ñ tr├ích)
    const ownerId = req.body.assigned_to || lead.assigned_to || lead.lead_owner_id || req.user.userId;
    if (req.body.assigned_to && !companyId) {
      if (!userIsCrmCompanyOrRegionAdmin(req)) {
        return res.status(400).json({ error: 'Chß╗ìn c├┤ng ty cho lead tr╞░ß╗¢c khi g├ín ng╞░ß╗¥i phß╗Ñ tr├ích khi chuyß╗ân Deal.' });
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
            '≡ƒÜÇ Deal mß╗¢i ─æ╞░ß╗úc giao',
            `Lead "${lead.title}" ─æ├ú chuyß╗ân th├ánh Deal v├á giao cho bß║ín phß╗Ñ tr├ích`,
            'crm_deal', req.params.id);
        }
      }
    } catch (notifErr) { console.error('Convert notification error:', notifErr.message); }

    // Task attachments & notes ─æ├ú ─æ╞░ß╗úc sync realtime ΓåÆ lead_documents
    // (qua source_attachment_id khi th├¬m attachment v├áo task)
    // Chß╗ë sync nhß╗»ng attachment ch╞░a c├│ bß║ún lead_document (dß╗» liß╗çu c┼⌐ tr╞░ß╗¢c sync)
    try {
      const { data: taskAtts } = await supabase.from('crm_task_attachments')
        .select('id, name, file_url, file_name, file_size, mime_type, notes, doc_type, created_by, task:crm_tasks(id, title, stage_slug)')
        .eq('lead_id', req.params.id);
      if (taskAtts?.length) {
        const { data: convLead } = await supabase.from('crm_leads')
          .select('project_id').eq('id', req.params.id).maybeSingle();
        const convDocOpts = { linkToProject: !!convLead?.project_id };
        // T├¼m nhß╗»ng attachment ch╞░a c├│ lead_document link
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
          console.log(`[convert] Synced ${unlinked.length} unlinked task attachments ΓåÆ lead_documents`);
        }
      }
    } catch (syncErr) { console.warn('Sync on convert:', syncErr.message); }

    // Log activity
    try {
      await supabase.from('crm_activities').insert({
        lead_id: req.params.id,
        type: 'note',
        title: '≡ƒÜÇ Chuyß╗ân sang Deal',
        description: 'Lead chuyß╗ân th├ánh Deal th├ánh c├┤ng',
        created_by: req.user.userId,
      });
    } catch (_) {}

    // Gen bß╗Ö nhiß╗çm vß╗Ñ Deal (1 lß║ºn) tß╗½ template pipeline c├┤ng ty; task Lead c┼⌐ giß╗» DB, UI ß║⌐n qua filter pipeline_type.
    try {
      await autoGenCrmTasksForNewLead(req.params.id, req.user.userId, req);
    } catch (autoErr) {
      console.error('Auto-create tasks on convert-to-deal error:', autoErr.message);
    }

    // Kh├┤ng bootstrap ─É╞ín 1 ΓÇö chuyß╗ân LeadΓåÆDeal giß╗» mß╗Öt deal duy nhß║Ñt, task tr├¬n deal ─æ├│.

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
      message: '─É├ú chuyß╗ân Lead sang Deal th├ánh c├┤ng.',
    });
  } catch (e) {
    console.error('Convert to deal error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// PRE-CHECK chuyß╗ân giai ─æoß║ín: trß║ú vß╗ü nhiß╗çm vß╗Ñ chß║╖n (nß║┐u c├│) ΓÇö KH├öNG thay ─æß╗òi dß╗» liß╗çu.
// D├╣ng ─æß╗â frontend hiß╗çn hß╗Öp nhiß╗çm vß╗Ñ chß║╖n TR╞»ß╗ÜC khi hß╗Åi deadline.
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
r.get('/leads/:id/stage-advance-check', async (req, res) => {
  try {
    const targetStageId = String(req.query.target_stage_id || '').trim();
    if (!targetStageId) return res.status(400).json({ error: 'Thiß║┐u target_stage_id' });

    const { data: lead } = await supabase
      .from('crm_leads')
      .select('id, type, stage_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!lead) return res.status(404).json({ error: 'Kh├┤ng t├¼m thß║Ñy lead/deal' });

    const { data: targetStage } = await supabase
      .from('crm_pipeline_stages')
      .select('id, name, order_index, is_won, is_lost, pipeline_type')
      .eq('id', targetStageId)
      .maybeSingle();

    // Kh├┤ng ─æß╗òi cß╗Öt ΓåÆ kh├┤ng cß║ºn kiß╗âm tra.
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

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// MOVE LEAD/DEAL TO STAGE (with validation for deal pipeline)
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
r.patch('/leads/:id/stage', async (req, res) => {
  try {
    const { stage_id, lost_reason, production_company_id, workshop_type_id: bodyWorkshopTypeId } = req.body;
    let { data: lead } = await supabase
      .from('crm_leads')
      .select('type, project_id, company_id, assigned_to, lead_owner_id, lead_type_id, use_order_tasks, parent_lead_id, stage_id, sx_handover_at, kanban_deadline_at')
      .eq('id', req.params.id)
      .single();
    if (!lead) {
      // Fallback nß║┐u ch╞░a migrate cß╗Öt kanban_deadline_at.
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
      // Fallback nß║┐u ch╞░a migrate cß╗Öt requires_deadline.
      ({ data: stage } = await supabase
        .from('crm_pipeline_stages')
        .select('id, name, order_index, is_won, is_lost, pipeline_type, send_zalo_on_enter, default_probability, sync_role')
        .eq('id', stage_id)
        .single());
    }
    
    // Validate: lead can only move to lead stages, deals to deal stages
    if (lead?.type !== stage?.pipeline_type) {
      return res.status(400).json({ error: `${lead?.type === 'lead' ? 'Lead' : 'Deal'} chß╗ë c├│ thß╗â di chuyß╗ân trong pipeline ri├¬ng cß╗ºa n├│` });
    }

    // Gate deadline: cß╗Öt bß║¡t requires_deadline ΓåÆ bß║»t buß╗Öc chß╗ìn deadline khi chuyß╗ân sang (cß╗Öt mß╗¢i).
    const isStageChange = String(lead?.stage_id || '') !== String(stage_id || '');
    const rawDeadline = req.body?.kanban_deadline_at;
    const hasDeadlineInput = rawDeadline !== undefined && rawDeadline !== null && rawDeadline !== '';
    let parsedDeadlineTs = null;
    if (hasDeadlineInput) {
      parsedDeadlineTs = new Date(rawDeadline).getTime();
      if (Number.isNaN(parsedDeadlineTs)) {
        return res.status(400).json({ error: 'Deadline kh├┤ng hß╗úp lß╗ç' });
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

    // Gate 1 (╞░u ti├¬n): chß║╖n chuyß╗ân giai ─æoß║ín khi c├▓n nhiß╗çm vß╗Ñ blocking ß╗ƒ giai ─æoß║ín hiß╗çn tß║íi.
    // Phß║úi b├ío TR╞»ß╗ÜC gate deadline ─æß╗â UI hiß╗çn hß╗Öp nhiß╗çm vß╗Ñ tr╞░ß╗¢c, rß╗ôi mß╗¢i tß╗¢i hß╗Öp deadline.
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

    // Gate 2: cß╗Öt bß║¡t requires_deadline ΓåÆ bß║»t buß╗Öc chß╗ìn deadline (sau khi ─æ├ú qua gate nhiß╗çm vß╗Ñ).
    // Cß╗Öt Thß║»ng/Thua/Ho├án th├ánh doanh thu kh├┤ng y├¬u cß║ºu deadline.
    if (isStageChange && stage?.requires_deadline && !stage?.is_won && !stage?.is_lost && !stage?.counts_as_completed_revenue && !hasDeadlineInput) {
      return res.status(400).json({
        error: 'Cß╗Öt n├áy y├¬u cß║ºu ─æß║╖t deadline khi chuyß╗ân thß║╗ tß╗¢i.',
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

    // For leads: if moving to "Chuyß╗ân Deal" stage, return error requesting convert-to-deal
    if (lead?.type === 'lead' && stage?.is_won) {
      return res.status(400).json({ 
        error: 'Vui l├▓ng d├╣ng n├║t "Chuyß╗ân sang Deal" ─æß╗â chuyß╗ân lead th├ánh deal',
        requires_conversion: true 
      });
    }
    
    const updates = { stage_id, updated_at: new Date().toISOString() };
    if (String(lead?.stage_id || '') !== String(stage_id || '')) {
      updates.stage_entered_at = new Date().toISOString();
    }
    // Deadline thß╗º c├┤ng cho thß║╗ (─æß║╖t khi k├⌐o sang cß╗Öt y├¬u cß║ºu deadline).
    if (hasDeadlineInput) {
      updates.kanban_deadline_at = new Date(parsedDeadlineTs).toISOString();
      const reason = (req.body?.deadline_reason || '').toString().trim();
      updates.kanban_deadline_reason = reason || null;
    }
    // ─Éß╗ông bß╗Ö % x├íc suß║Ñt theo cß║Ñu h├¼nh cß╗ºa cß╗Öt pipeline (nß║┐u c├│).
    // Mß╗Ñc ti├¬u: k├⌐o lead/deal sang cß╗Öt n├áo th├¼ probability tß╗▒ nhß║úy theo % cß╗ºa cß╗Öt ─æ├│.
    if (stage?.default_probability !== undefined && stage?.default_probability !== null && stage?.default_probability !== '') {
      const p = Number(stage.default_probability);
      if (Number.isFinite(p)) {
        updates.probability = Math.max(0, Math.min(100, Math.round(p)));
      }
    }
    if (stage?.is_won) {
      updates.actual_close_date = new Date().toISOString().split('T')[0];
      // Deal thß║»ng ΓÇö kh├┤ng c├▓n theo d├╡i deadline thß║╗.
      updates.kanban_deadline_at = null;
      updates.kanban_deadline_reason = null;
    }
    if (stage?.counts_as_completed_revenue) {
      updates.kanban_deadline_at = null;
      updates.kanban_deadline_reason = null;
    }
    if (requiresProductionPick && effectiveProductionCompanyId) {
      const sxResponsibleId = await resolveProductionHandoverResponsibleUserId(effectiveProductionCompanyId);
      if (sxResponsibleId) {
        updates.assigned_to = sxResponsibleId;
        updates.lead_owner_id = sxResponsibleId;
      }
    }
    if (stage?.is_lost) {
      updates.lost_reason = lost_reason || null;
      updates.actual_close_date = new Date().toISOString().split('T')[0];
    } else {
      if (lead?.lost_reason) updates.lost_reason = null;
      // Rß╗¥i cß╗Öt Thß║»ng / Thua ΓåÆ bß╗Å ng├áy chß╗æt ─æß╗â UI & KPI kh├┤ng coi deal c├▓n ┬½─æ├ú kß║┐t th├║c┬╗
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
          error: 'Ch╞░a c├ái ─æß║╖t cß╗Öt deadline tr├¬n database. Chß║íy migration database/280_crm_kanban_deadline.sql',
          code: 'migration_required',
        });
      }
    }
    if (error) throw error;
    let responseLead = updatedLeadRow;

    // Ghi lß╗ïch sß╗¡ deadline khi ─æß║╖t deadline l├║c chuyß╗ân cß╗Öt.
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

    // Refresh k├¿m join SX/VC ─æß╗â frontend cß║¡p nhß║¡t badge ngay (kh├┤ng phß║úi ─æß╗úi silent reload).
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

    // ≡ƒöö NOTIFICATION: Lead/Deal ─æß╗òi giai ─æoß║ín
    try {
      const { data: pStageInfo } = await supabase.from('crm_pipeline_stages')
        .select('name').eq('id', stage_id).single();
      const { data: leadInfo } = await supabase.from('crm_leads')
        .select('title, assigned_to, lead_owner_id').eq('id', req.params.id).single();
      const ownerIds = [leadInfo?.assigned_to, leadInfo?.lead_owner_id].filter(Boolean);
      if (ownerIds.length && !stage?.is_won) {
        await notifyMultiple(req, ownerIds, 'lead_stage_changed',
          `≡ƒöä ${lead?.type === 'deal' ? 'Deal' : 'Lead'} chuyß╗ân giai ─æoß║ín`,
          `"${leadInfo?.title}" ΓåÆ ${pStageInfo?.name || 'Giai ─æoß║ín mß╗¢i'}`,
          lead?.type === 'deal' ? 'crm_deal' : 'crm_lead', req.params.id);
      }
    } catch (ne) { console.warn('[NOTIFY] stage_changed:', ne.message); }

    // Deal ΓåÆ Thß║»ng: tß╗▒ tß║ío dß╗▒ ├ín x╞░ß╗ƒng server-side; nß║┐u lß╗ùi / thiß║┐u luß╗ông ΓåÆ trß║ú deal_won cho modal
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
            '≡ƒÅå Deal Thß║»ng',
            `Deal "${dealData?.title}" - Gi├í trß╗ï: ${(dealData?.estimated_value || 0).toLocaleString('vi-VN')} VND`,
            'crm_deal', req.params.id);
        }

        try {
          await supabase.from('crm_activities').insert({
            lead_id: req.params.id, type: 'note',
            title: '≡ƒÄë Deal Thß║»ng!',
            description: `Deal "${dealData?.title}" ─æ├ú chß╗æt th├ánh c├┤ng.`,
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

    // CRM ΓåÆ SX: Sale k├⌐o deal sang cß╗Öt ┬½Sß║ún xuß║Ñt┬╗ (sync_role) ΓåÆ g├ín Kanban x╞░ß╗ƒng
    if (lead?.type === 'deal' && stage?.sync_role === 'sx_production') {
      const pidForSx = projectAutoCreated?.project_id || responseLead?.project_id || lead?.project_id;
      if (pidForSx) {
        try {
          await syncSxKanbanFromCrmProductionStage(req.params.id);
        } catch (sxErr) {
          console.warn('[crm/stage] syncSxKanbanFromCrmProductionStage:', sxErr.message);
        }
      }
    }

    // Cuß╗æi luß╗ông: sync + refresh badge SX/VC (sau auto-create / gen sx_*) ─æß╗â response v├á socket kh├┤ng mß║Ñt tag.
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

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// DEADLINE THß║║ CRM ΓÇö ─æß║╖t/sß╗¡a deadline thß╗º c├┤ng (k├¿m l├╜ do) + lß╗ïch sß╗¡
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
/** PATCH /crm/leads/:id/deadline ΓÇö ─æß║╖t/sß╗¡a deadline; bß║»t buß╗Öc l├╜ do nß║┐u thß║╗ ─æ├ú c├│ deadline. */
r.patch('/leads/:id/deadline', async (req, res) => {
  try {
    const leadId = String(req.params.id || '').trim();
    const { data: lead } = await supabase
      .from('crm_leads')
      .select('id, type, company_id, stage_id, title, assigned_to, lead_owner_id, kanban_deadline_at')
      .eq('id', leadId)
      .maybeSingle();
    if (!lead) return res.status(404).json({ error: 'Kh├┤ng t├¼m thß║Ñy lead/deal' });

    const { data: leadStage } = lead.stage_id
      ? await supabase
        .from('crm_pipeline_stages')
        .select('is_won, is_lost, counts_as_completed_revenue')
        .eq('id', lead.stage_id)
        .maybeSingle()
      : { data: null };
    if (leadStage?.is_won || leadStage?.counts_as_completed_revenue) {
      return res.status(400).json({ error: 'Deal ─æ├ú chß╗æt/ho├án th├ánh ΓÇö kh├┤ng ─æß║╖t deadline', code: 'stage_terminal' });
    }

    const raw = req.body?.kanban_deadline_at;
    const clearing = raw === null || raw === '';
    let newIso = null;
    if (!clearing) {
      const ts = new Date(raw).getTime();
      if (Number.isNaN(ts)) return res.status(400).json({ error: 'Deadline kh├┤ng hß╗úp lß╗ç' });
      newIso = new Date(ts).toISOString();
    }

    const reason = (req.body?.reason || '').toString().trim();
    // Bß║»t buß╗Öc l├╜ do khi thß║╗ ─É├â c├│ deadline (sß╗¡a/─æß╗òi/x├│a).
    if (lead.kanban_deadline_at && !reason) {
      return res.status(400).json({ error: 'Vui l├▓ng nhß║¡p l├╜ do thay ─æß╗òi deadline', code: 'reason_required' });
    }
    // Kh├┤ng ─æß╗òi g├¼ th├¼ th├┤i.
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

/** GET /crm/leads/:id/deadline-history ΓÇö lß╗ïch sß╗¡ ─æß║╖t/sß╗¡a deadline. */
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

/** Hß╗ôi lß║íi deal/lead ─æ├ú ─æ├ính dß║Ñu thua ΓÇö x├│a lost_reason v├á chuyß╗ân vß╗ü giai ─æoß║ín ─æang chß║íy. */
r.post('/leads/:id/reopen', async (req, res) => {
  try {
    const leadId = String(req.params.id || '').trim();
    const { data: lead } = await supabase
      .from('crm_leads')
      .select('id, type, stage_id, company_id, pipeline_id, lost_reason, title')
      .eq('id', leadId)
      .single();
    if (!lead) return res.status(404).json({ error: 'Kh├┤ng t├¼m thß║Ñy lead/deal' });

    const sac = scopedAdminCompanyId(req);
    if (sac && String(lead.company_id || '') !== String(sac)) {
      return res.status(403).json({ error: 'Kh├┤ng c├│ quyß╗ün thao t├íc lead/deal cß╗ºa c├┤ng ty kh├íc' });
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
      return res.status(400).json({ error: 'Lead/deal ch╞░a ß╗ƒ trß║íng th├íi thua hoß║╖c ─æ├ú hß╗ºy.' });
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
        title: lead.type === 'deal' ? 'Γå⌐∩╕Å Hß╗ôi lß║íi deal' : 'Γå⌐∩╕Å Hß╗ôi lß║íi lead',
        description: `─É├ú mß╗ƒ lß║íi tß╗½ trß║íng th├íi thua/mß║Ñt ΓåÆ ${targetStage?.name || 'giai ─æoß║ín mß╗¢i'}`,
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
    const msg = e.message || 'Lß╗ùi hß╗ôi lß║íi deal';
    const status = /kh├┤ng t├¼m|kh├┤ng hß╗úp lß╗ç|ch╞░a ß╗ƒ trß║íng th├íi/i.test(msg) ? 400 : 500;
    res.status(status).json({ error: msg });
  }
});

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// ACTIVITIES
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
r.get('/leads/:id/activities', async (req, res) => {
  const { data } = await supabase.from('crm_activities')
    .select('*, creator:users!crm_activities_created_by_fkey(id, full_name)')
    .eq('lead_id', req.params.id)
    .order('activity_date', { ascending: false });
  res.json(data || []);
});

/** Chuß║⌐n ho├í ─æ├¡nh k├¿m ghi ch├║ ΓÇö chß╗ë URL nß╗Öi bß╗Ö uploads ─æ├ú x├íc thß╗▒c qua upload */
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

/** Upload file/h├¼nh cho ghi ch├║ (kh├┤ng tß║ío tin nhß║»n chat lead) */
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
    if (!uid) return res.status(401).json({ error: 'Token kh├┤ng c├│ user id' });
    if (!req.file) return res.status(400).json({ error: 'Kh├┤ng c├│ file' });
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

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// CREATE PROJECT FROM DEAL (Modal)
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
r.get('/leads/:id/project-setup', async (req, res) => {
  try {
    const { data: deal } = await supabase.from('crm_leads')
      .select('*, customer:customers(id, full_name, phone, email, address)')
      .eq('id', req.params.id).single();
    if (!deal) return res.status(404).json({ error: 'Kh├┤ng t├¼m thß║Ñy' });

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
          stage_name: t.stage?.name || 'Kh├┤ng r├╡',
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
    if (!deal) return res.status(404).json({ error: 'Deal kh├┤ng tß╗ôn tß║íi' });
    if (deal.project_id) return res.status(400).json({ error: 'Deal ─æ├ú c├│ dß╗▒ ├ín', project_id: deal.project_id });

    const yr = new Date().getFullYear();
    const { data: firstStage } = await supabase.from('workflow_stages')
      .select('id').eq('slug', 'consulting').limit(1).single();

    const makeRow = (code) => ({
      code,
      name: project_name || deal.title || 'Dß╗▒ ├ín mß╗¢i',
      description: deal.description || `Dß╗▒ ├ín tß╗½ Deal ${deal.code}`,
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
    if (!project) throw lastInsertErr || new Error('Tr├╣ng m├ú dß╗▒ ├ín');

    // Link deal ΓåÆ project
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
          title: `C├┤ng viß╗çc ${s.name}`,
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

    // Kh├┤ng ├⌐p current_stage ΓåÆ production: deal thß║»ng hiß╗çn ß╗ƒ Kanban x╞░ß╗ƒng cß╗Öt "Chß╗¥ v├áo x╞░ß╗ƒng" (bucket won_pending).
    // Vß║½n tß║ío sß║╡n nhiß╗çm vß╗Ñ x╞░ß╗ƒng (pending) ─æß╗â khi v├áo SX chß╗ë viß╗çc thß╗▒c hiß╗çn ΓÇö chß╗ë khi ch╞░a c├│ nhiß╗çm vß╗Ñ x╞░ß╗ƒng (kß╗â cß║ú tß╗½ bß╗Ö mß║½u mß║╖c ─æß╗ïnh).
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
            { title: 'Tiß║┐p nhß║¡n hß╗ô s╞í tß╗½ CRM', priority: 'high' },
            { title: 'Kiß╗âm tra bß║ún vß║╜ sß║ún xuß║Ñt', priority: 'high' },
            { title: 'Lß║¡p nhu cß║ºu vß║¡t t╞░', priority: 'high' },
            { title: 'Gia c├┤ng sß║ún xuß║Ñt', priority: 'medium' },
            { title: 'Kiß╗âm tra chß║Ñt l╞░ß╗úng nß╗Öi bß╗Ö', priority: 'high' },
          ],
          delivery: [
            { title: 'Chuß║⌐n bß╗ï giao h├áng', priority: 'medium' },
            { title: 'L├¬n lß╗ïch vß║¡n chuyß╗ân v├á lß║»p ─æß║╖t', priority: 'medium' },
          ],
          'customer-care': [
            { title: 'Nghiß╗çm thu v├á b├án giao', priority: 'medium' },
            { title: 'Theo d├╡i sau lß║»p ─æß║╖t', priority: 'low' },
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
              title: '≡ƒÅ¡ ─É├ú tß║ío nhiß╗çm vß╗Ñ x╞░ß╗ƒng',
              description: `Tß╗▒ ─æß╗Öng tß║ío ${workshopCreated.length} nhiß╗çm vß╗Ñ x╞░ß╗ƒng (dß╗▒ ├ín ─æang ß╗ƒ cß╗Öt chß╗¥ v├áo x╞░ß╗ƒng).`,
              created_by: req.user.userId,
            });
          }
        }
      }
    }

    // Activity log
    await supabase.from('crm_activities').insert({
      lead_id: dealId, type: 'note',
      title: '≡ƒôü Tß║ío dß╗▒ ├ín th├ánh c├┤ng',
      description: `Dß╗▒ ├ín ${project.code} ΓÇö ${taskCount} nhiß╗çm vß╗Ñ (${doneCount} CRM ho├án th├ánh, ${taskCount - doneCount} cß║ºn thß╗▒c hiß╗çn)`,
      created_by: req.user.userId,
    });

    console.log(`[CREATE PROJECT] ${project.code}: ${taskCount} tasks (${doneCount} done), ${checkCount} checklists`);

    try {
      await syncCrmLeadSxPipelineFromProject(project.id);
    } catch (se) {
      console.warn('[CREATE PROJECT] sync sx_pipeline_stage_id:', se.message);
    }

    // NOTE: Kh├┤ng tß╗▒ tß║ío ─É╞ín 1/2/... tß╗½ deal. ─É╞ín h├áng chß╗ë tß║ío thß╗º c├┤ng tß║íi tab ─É╞ín h├áng.
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
        return res.status(400).json({ error: 'Ghi ch├║ cß║ºn nß╗Öi dung hoß║╖c ─æ├¡nh k├¿m' });
      }
      if (!title) {
        title =
          (description && description.split('\n')[0]?.slice(0, 120)) ||
          (attachments?.[0]?.name ? String(attachments[0].name).slice(0, 120) : '') ||
          'Ghi ch├║';
      }
    } else if (!title) {
      return res.status(400).json({ error: 'Thiß║┐u ti├¬u ─æß╗ü hoß║ít ─æß╗Öng' });
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

/** Sß╗¡a ghi ch├║ (crm_activities type = note) ΓÇö t├íc giß║ú hoß║╖c admin */
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
    if (fe || !act) return res.status(404).json({ error: 'Kh├┤ng t├¼m thß║Ñy hoß║ít ─æß╗Öng' });
    if (act.lead_id !== leadId) return res.status(400).json({ error: 'Hoß║ít ─æß╗Öng kh├┤ng thuß╗Öc lead/deal n├áy' });
    if (act.type !== 'note') return res.status(400).json({ error: 'Chß╗ë sß╗¡a ─æ╞░ß╗úc loß║íi ghi ch├║' });

    const r = normalizeCrmUserRole(req.user?.role);
    const canModerate = r === 'admin' || r === 'manager';
    if (!canModerate && String(act.created_by) !== String(uid)) {
      return res.status(403).json({ error: 'Chß╗ë t├íc giß║ú hoß║╖c quß║ún l├╜/admin mß╗¢i sß╗¡a ─æ╞░ß╗úc ghi ch├║ n├áy' });
    }

    const desc =
      description !== undefined ? String(description).trim() : String(act.description || '').trim();
    const nextAttachments =
      attachmentsRaw !== undefined ? normalizeCrmActivityAttachments(attachmentsRaw) : act.attachments;

    if (!desc && !(Array.isArray(nextAttachments) && nextAttachments.length)) {
      return res.status(400).json({ error: 'Ghi ch├║ cß║ºn nß╗Öi dung hoß║╖c ├¡t nhß║Ñt mß╗Öt ─æ├¡nh k├¿m' });
    }

    let nextTitle = act.title;
    if (title != null && String(title).trim()) {
      nextTitle = String(title).trim().slice(0, 200);
    } else {
      nextTitle = desc.split('\n')[0].slice(0, 120) || 'Ghi ch├║';
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

/** Bß║¡t/tß║»t chia sß║╗ ghi ch├║ (crm_activities type=note) sang SX / VC / x╞░ß╗ƒng */
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
    if (fe || !act) return res.status(404).json({ error: 'Kh├┤ng t├¼m thß║Ñy hoß║ít ─æß╗Öng' });
    if (act.lead_id !== leadId) return res.status(400).json({ error: 'Hoß║ít ─æß╗Öng kh├┤ng thuß╗Öc lead/deal n├áy' });
    if (act.type !== 'note') return res.status(400).json({ error: 'Chß╗ë chia sß║╗ ─æ╞░ß╗úc loß║íi ghi ch├║' });

    const rRole = normalizeCrmUserRole(req.user?.role);
    const canModerate = rRole === 'admin' || rRole === 'manager';
    if (!canModerate && String(act.created_by) !== String(uid)) {
      return res.status(403).json({ error: 'Chß╗ë t├íc giß║ú hoß║╖c quß║ún l├╜/admin mß╗¢i ─æß╗òi chia sß║╗ ghi ch├║ n├áy' });
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

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// QUOTATIONS (B├ío gi├í)
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
/** Lead/Deal detail: chß╗⌐ng tß╗½ c├│ lead_id HOß║╢C c├╣ng customer_id (nhiß╗üu BG tß║ío tß╗½ KH ch╞░a gß║»n lead). */
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

/** Admin hß╗ç thß╗æng xem/sß╗¡a mß╗ìi b├ío gi├í; NV chß╗ë b├ío gi├í do ch├¡nh hß╗ì tß║ío (c├╣ng company). */
function userMayAccessQuotationRow(req, row) {
  if (!row) return false;
  if (userIsAdmin(req.user?.role)) return true;
  const uid = req.user?.userId;
  const cid = req.user?.company_id;
  if (!uid || !cid) return false;
  if (String(row.company_id || '') !== String(cid)) return false;
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
    if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      q = q.eq('company_id', cid);
      if (req.user?.userId) q = q.eq('created_by', req.user.userId);
    } else if (coQ && /^[0-9a-f-]{36}$/i.test(String(coQ))) {
      q = q.eq('company_id', coQ);
    }
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
    // DB c┼⌐ ch╞░a c├│ FK quotations_region_id_fkey (migration 160 ch╞░a chß║íy) ΓåÆ bß╗Å embed region rß╗ôi thß╗¡ lß║íi
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
      if (!userIsAdmin(req.user?.role)) {
        q2 = q2.eq('company_id', req.user.company_id);
        if (req.user?.userId) q2 = q2.eq('created_by', req.user.userId);
      } else if (coQ && /^[0-9a-f-]{36}$/i.test(String(coQ))) q2 = q2.eq('company_id', coQ);
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
    // T├¡nh flag is_orphan ─æß╗â FE hiß╗ân thß╗ï badge "Kh├┤ng gß║»n deal"
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
      if (qe && !benign) return res.status(500).json({ error: qe.message || 'Lß╗ùi tß║úi b├ío gi├í' });
      return res.status(404).json({ error: 'Kh├┤ng t├¼m thß║Ñy b├ío gi├í' });
    }
    if (!userMayAccessQuotationRow(req, quote)) {
      return res.status(403).json({ error: 'Kh├┤ng c├│ quyß╗ün xem b├ío gi├í n├áy' });
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
    if (!qMeta) return res.status(404).json({ error: 'Kh├┤ng t├¼m thß║Ñy b├ío gi├í' });
    if (!userMayAccessQuotationRow(req, qMeta)) {
      return res.status(403).json({ error: 'Kh├┤ng c├│ quyß╗ün xem lß╗ïch sß╗¡ b├ío gi├í n├áy' });
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

r.post('/quotations', async (req, res) => {
  try {
    const { items, quotation_source, ...quoteData } = req.body;
    const code = await nextCode('BG');

    // Sanitize: empty strings ΓåÆ null for UUID fields
    const uuidFields = ['customer_id', 'lead_id', 'project_id', 'approved_by', 'company_id', 'region_id', 'fulfillment_lead_id', 'source_task_id'];
    uuidFields.forEach(f => { if (quoteData[f] === '' || quoteData[f] === undefined) quoteData[f] = null; });
    // Sanitize: empty strings ΓåÆ null for date fields
    const dateFields = ['valid_until', 'issue_date', 'sent_at', 'accepted_at', 'closed_at', 'signed_date', 'delivery_date'];
    dateFields.forEach(f => { if (quoteData[f] === '') quoteData[f] = null; });
    const quoteMoneyOrNull = (v) => {
      if (v === '' || v === undefined || v === null) return null;
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      const onlyDigits = String(v).replace(/\s/g, '').replace(/─æ/gi, '').replace(/[^\d]/g, '');
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

    // ΓöÇΓöÇ Scope: kß║┐ thß╗½a company_id + region_id tß╗½ deal (cho ph├⌐p override; sß║╜ cß║únh b├ío ß╗ƒ UI) ΓöÇΓöÇ
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
    if (!userIsAdmin(req.user?.role)) {
      const uc = requireUserCompanyId(req, res);
      if (!uc) return;
      if (commercialCo && String(commercialCo) !== String(uc)) {
        return res.status(403).json({ error: 'B├ío gi├í phß║úi c├╣ng c├┤ng ty vß╗¢i t├ái khoß║ún' });
      }
      commercialCo = commercialCo || uc;
    }
    quoteData.company_id = commercialCo;

    // region_id: nß║┐u client gß╗¡i ΓåÆ kiß╗âm tra c├╣ng company; nß║┐u rß╗ùng ΓåÆ kß║┐ thß╗½a tß╗½ lead.
    if (quoteData.region_id) {
      const { data: rrow } = await supabase
        .from('company_regions')
        .select('id, company_id, is_active')
        .eq('id', quoteData.region_id)
        .maybeSingle();
      if (!rrow) {
        return res.status(400).json({ error: 'Khu vß╗▒c kh├┤ng tß╗ôn tß║íi' });
      }
      if (commercialCo && String(rrow.company_id) !== String(commercialCo)) {
        return res.status(400).json({ error: 'Khu vß╗▒c phß║úi c├╣ng c├┤ng ty vß╗¢i b├ío gi├í' });
      }
      if (rrow.is_active === false) {
        return res.status(400).json({ error: 'Khu vß╗▒c ─æ├ú bß╗ï v├┤ hiß╗çu' });
      }
    } else {
      quoteData.region_id = leadRegionId;
    }
    
    // Calc totals with per-item VAT + spec_factor (hß╗ç sß╗æ quy c├ích)
    // ΓöÇΓöÇ Excel fidelity: nß║┐u item.lock_amount && imported_amount ΓåÆ giß╗» NGUY├èN sß╗æ tiß╗ün Excel ΓöÇΓöÇ
    const processedItems = (items || []).map(item => {
      const specFactor = parseFloat(item.spec_factor) || 0;
      const grossAmount = specFactor > 0
        ? specFactor * (item.quantity || 1) * (item.unit_price || 0)
        : (item.quantity || 1) * (item.unit_price || 0);
      const importedAmount = (typeof item.imported_amount === 'number' && Number.isFinite(item.imported_amount))
        ? item.imported_amount
        : null;
      const isLocked = !!item.lock_amount && importedAmount !== null;
      let amount, discountAmount;
      if (isLocked) {
        amount = importedAmount;
        discountAmount = Math.max(0, grossAmount - amount);
      } else {
        discountAmount = grossAmount * (item.discount_percent || 0) / 100;
        amount = grossAmount - discountAmount;
      }
      const vatRate = item.vat_rate || 0;
      const vatAmount = amount * vatRate / 100;
      const total = amount + vatAmount;
      return {
        product_id: item.product_id || null, product_code: item.product_code || null,
        name: item.name, description: item.description || null,
        unit: item.unit || 'bß╗Ö', quantity: item.quantity || 1, unit_price: item.unit_price || 0,
        spec_factor: specFactor || null,
        height: item.height || null, width: item.width || null, length: item.length || null, weight: item.weight || null,
        discount_percent: item.discount_percent || 0, discount_amount: discountAmount,
        amount, vat_rate: vatRate, vat_amount: vatAmount, tax_amount: vatAmount, total,
        dimensions: item.dimensions || null, material: item.material || null, color: item.color || null, notes: item.notes || null,
        promo_code: item.promo_code || null, is_promo: item.is_promo || false,
        group_name: item.group_name || null,
      };
    });
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
      let summary = 'Tß║ío b├ío gi├í';
      const qs = quotation_source || {};
      if (qs.from_excel) {
        summary = qs.excel_file_name ? `Tß║ío b├ío gi├í tß╗½ Excel (${qs.excel_file_name})` : 'Tß║ío b├ío gi├í tß╗½ Excel';
        if (qs.excel_review_confirmed) summary += ' ΓÇö ─æ├ú x├íc nhß║¡n ─æ├ú kiß╗âm tra sß╗æ liß╗çu';
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

    // ΓòÉΓòÉΓòÉ ─Éß╗ÆNG Bß╗ÿ Sß║óN PHß║¿M: chß╗ë li├¬n kß║┐t product_id theo t├¬n, KH├öNG cß║¡p nhß║¡t gi├í / kh├┤ng tß║ío mß╗¢i ΓòÉΓòÉΓòÉ
    const syncedProducts = [];
    try {
      for (const item of processedItems) {
        if (!item.name || item.name.trim().length < 3) continue;
        // T├¼m sß║ún phß║⌐m theo t├¬n gß║ºn ─æ├║ng (case-insensitive)
        const nameSearch = item.name.trim();
        const { data: existing } = await supabase.from('products')
          .select('id, name')
          .ilike('name', `%${nameSearch}%`)
          .limit(1);
        if (existing?.length) {
          item.product_id = existing[0].id; // G├ín product_id v├áo item
          syncedProducts.push({ name: item.name, product_id: existing[0].id });
        }
        // Kh├┤ng t├¼m thß║Ñy ΓåÆ giß╗» nguy├¬n, kh├┤ng tß║ío mß╗¢i
      }
      console.log('[QUOTATION] Product link:', syncedProducts.length, 'items linked');
    } catch (e) { console.warn('[QUOTATION] Product link error:', e.message); }

    // ΓòÉΓòÉΓòÉ AUTO-LINK: T├¼m deal qua customer nß║┐u ch╞░a c├│ lead_id ΓòÉΓòÉΓòÉ
    let linkedLeadId = quote.lead_id;
    if (!linkedLeadId && (quote.customer_id || quote.customer_name)) {
      try {
        // crm_leads kh├┤ng c├│ cß╗Öt `status` ΓÇö deal "─æang mß╗ƒ" = ch╞░a ─æ├│ng (actual_close_date IS NULL).
        let dealQuery = supabase.from('crm_leads')
          .select('id, customer_id')
          .eq('type', 'deal')
          .is('actual_close_date', null)
          .order('created_at', { ascending: false })
          .limit(1);

        if (quote.customer_id) {
          dealQuery = dealQuery.eq('customer_id', quote.customer_id);
        } else if (quote.customer_name) {
          // T├¼m customer_id qua t├¬n
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
          // Cß║¡p nhß║¡t lead_id + customer_id cho b├ío gi├í
          await supabase.from('quotations').update({
            lead_id: deal.id,
            customer_id: deal.customer_id || quote.customer_id,
          }).eq('id', quote.id);
          quote.lead_id = deal.id;
          console.log(`[QUOTATION] Auto-linked BG ${quote.code} ΓåÆ Deal ${deal.id}`);
        }
      } catch (linkErr) {
        console.warn('[QUOTATION] Auto-link deal error:', linkErr.message);
      }
    }

    // ΓòÉΓòÉΓòÉ AUTO-COMPLETE: Ho├án th├ánh task "Lß║¡p b├ío gi├í" trong deal ΓòÉΓòÉΓòÉ
    if (linkedLeadId) {
      try {
        // T├¼m task ch╞░a ho├án th├ánh ß╗ƒ stage quotation, ╞░u ti├¬n "Lß║¡p b├ío gi├í"
        const { data: tasks } = await supabase.from('crm_tasks')
          .select('id, title, stage_slug, status')
          .eq('lead_id', linkedLeadId)
          .in('stage_slug', ['quotation', 'deal_quote_contract'])
          .neq('status', 'completed')
          .order('order_index')
          .limit(5);

        // T├¼m task ph├╣ hß╗úp nhß║Ñt: "Lß║¡p b├ío gi├í" > bß║Ñt kß╗│ task quotation n├áo
        const quotationTask = (tasks || []).find(t =>
          t.title.includes('Lß║¡p b├ío gi├í') || t.title.includes('lß║¡p b├ío gi├í')
        ) || (tasks || [])[0];

        if (quotationTask) {
          // Mark completed
          await supabase.from('crm_tasks').update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            notes: `Γ£à ─É├ú tß║ío b├ío gi├í ${quote.code} (${formatMoney(quote.total)})\n≡ƒôÄ Xem: /crm/quotations/${quote.id}`,
            updated_at: new Date().toISOString(),
          }).eq('id', quotationTask.id);

          // Th├¬m attachment v├áo task (link tß╗¢i b├ío gi├í)
          const { data: att } = await supabase.from('crm_task_attachments').insert({
            task_id: quotationTask.id,
            lead_id: linkedLeadId,
            name: `≡ƒôä ${quote.code} - ${quote.title || 'B├ío gi├í'}`,
            doc_type: 'quotation',
            notes: `B├ío gi├í ${quote.code}: ${formatMoney(quote.total)}\nKH: ${quote.customer_name || ''}\nLink: /crm/quotations/${quote.id}`,
            created_by: req.user.userId,
          }).select().single();

          // Sync ΓåÆ lead_documents
          if (att) {
            const { data: lead } = await supabase.from('crm_leads')
              .select('project_id').eq('id', linkedLeadId).single();
            await supabase.from('lead_documents').insert({
              lead_id: linkedLeadId,
              project_id: lead?.project_id || null,
              name: `[${quotationTask.title}] ≡ƒôä ${quote.code}`,
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

    // ≡ƒöö NOTIFICATION: B├ío gi├í mß╗¢i
    try {
      const t = await getNotifyTargets(quote.lead_id);
      const allIds = [...new Set([...t.ownerIds, ...t.adminIds])];
      if (allIds.length) await notifyMultiple(req, allIds, 'quotation_created',
        '≡ƒôä B├ío gi├í mß╗¢i',
        `B├ío gi├í ${quote.code} ΓÇö KH: ${quote.customer_name || 'N/A'} ΓÇö ${formatMoney(quote.total)}`,
        'quotation', quote.id);
    } catch (ne) { console.warn('[NOTIFY] quotation_created:', ne.message); }

    // ΓòÉΓòÉΓòÉ SYNC: Update customer's last quotation amount ΓòÉΓòÉΓòÉ
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

    res.status(201).json({ ...quote, synced_products: syncedProducts });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Helper format money cho notes
function formatMoney(n) {
  if (!n) return '0 ─æ';
  return new Intl.NumberFormat('vi-VN').format(Math.round(n)) + ' ─æ';
}
// ΓòÉΓòÉΓòÉ HELPER: Lß║Ñy owner + admin IDs cho notification ΓòÉΓòÉΓòÉ
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
    if (!qAuth) return res.status(404).json({ error: 'Kh├┤ng t├¼m thß║Ñy b├ío gi├í' });
    if (!userMayAccessQuotationRow(req, qAuth)) {
      return res.status(403).json({ error: 'Kh├┤ng c├│ quyß╗ün sß╗¡a b├ío gi├í n├áy' });
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

    // Sanitize: empty strings ΓåÆ null for UUID fields
    const uuidFields = ['customer_id', 'lead_id', 'project_id', 'approved_by', 'company_id', 'region_id', 'fulfillment_lead_id', 'source_task_id'];
    uuidFields.forEach(f => { if (quoteData[f] === '' || quoteData[f] === undefined) quoteData[f] = null; });
    // Sanitize: empty strings ΓåÆ null for date fields
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
    if (!userIsAdmin(req.user?.role)) {
      const uc = requireUserCompanyId(req, res);
      if (!uc) return;
      if (commercialCoPut && String(commercialCoPut) !== String(uc)) {
        return res.status(403).json({ error: 'B├ío gi├í phß║úi c├╣ng c├┤ng ty vß╗¢i t├ái khoß║ún' });
      }
      commercialCoPut = commercialCoPut || uc;
    }
    quoteData.company_id = commercialCoPut;

    // region_id (PUT): nß║┐u client gß╗¡i region_id rß╗ùng & lead c├│ region ΓåÆ kß║┐ thß╗½a; nß║┐u c├│ ΓåÆ kiß╗âm tra c├╣ng company.
    if (quoteData.region_id) {
      const { data: rrowPut } = await supabase
        .from('company_regions')
        .select('id, company_id, is_active')
        .eq('id', quoteData.region_id)
        .maybeSingle();
      if (!rrowPut) return res.status(400).json({ error: 'Khu vß╗▒c kh├┤ng tß╗ôn tß║íi' });
      if (commercialCoPut && String(rrowPut.company_id) !== String(commercialCoPut)) {
        return res.status(400).json({ error: 'Khu vß╗▒c phß║úi c├╣ng c├┤ng ty vß╗¢i b├ío gi├í' });
      }
    } else if (leadRegionIdPut) {
      quoteData.region_id = leadRegionIdPut;
    }
    const quoteMoneyOrNullPut = (v) => {
      if (v === '' || v === undefined || v === null) return null;
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      const onlyDigits = String(v).replace(/\s/g, '').replace(/─æ/gi, '').replace(/[^\d]/g, '');
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
    
    // Calc totals with per-item VAT + spec_factor (hß╗ç sß╗æ quy c├ích)
    // ΓöÇΓöÇ Excel fidelity: nß║┐u item.lock_amount && imported_amount ΓåÆ giß╗» NGUY├èN sß╗æ tiß╗ün Excel ΓöÇΓöÇ
    const processedItems = (rawItems || []).map(item => {
      const specFactor = parseFloat(item.spec_factor) || 0;
      const grossAmount = specFactor > 0
        ? specFactor * (item.quantity || 1) * (item.unit_price || 0)
        : (item.quantity || 1) * (item.unit_price || 0);
      const importedAmount = (typeof item.imported_amount === 'number' && Number.isFinite(item.imported_amount))
        ? item.imported_amount
        : null;
      const isLocked = !!item.lock_amount && importedAmount !== null;
      let amount, discountAmount;
      if (isLocked) {
        amount = importedAmount;
        discountAmount = Math.max(0, grossAmount - amount);
      } else {
        discountAmount = grossAmount * (item.discount_percent || 0) / 100;
        amount = grossAmount - discountAmount;
      }
      const vatRate = item.vat_rate || 0;
      const vatAmount = amount * vatRate / 100;
      const total = amount + vatAmount;
      return {
        product_id: item.product_id || null, product_code: item.product_code || null,
        name: item.name, description: item.description || null,
        unit: item.unit || 'bß╗Ö', quantity: item.quantity || 1, unit_price: item.unit_price || 0,
        spec_factor: specFactor || null,
        height: item.height || null, width: item.width || null, length: item.length || null, weight: item.weight || null,
        discount_percent: item.discount_percent || 0, discount_amount: discountAmount,
        amount, vat_rate: vatRate, vat_amount: vatAmount, tax_amount: vatAmount, total,
        dimensions: item.dimensions || null, material: item.material || null, color: item.color || null, notes: item.notes || null,
        promo_code: item.promo_code || null, is_promo: item.is_promo || false,
        group_name: item.group_name || null,
      };
    });
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
        parts.push(`Tß╗òng ${formatMoney(prevQuote.total)} ΓåÆ ${formatMoney(data.total)}`);
      }
      if (prevQuote && prevQuote.title !== data.title) parts.push('─Éß╗òi ti├¬u ─æß╗ü');
      if (prevQuote && prevQuote.status !== data.status) {
        parts.push(`Trß║íng th├íi ${prevQuote.status || 'ΓÇö'} ΓåÆ ${data.status || 'ΓÇö'}`);
      }
      const summary = parts.length ? `Cß║¡p nhß║¡t: ${parts.join('; ')}` : 'Cß║¡p nhß║¡t b├ío gi├í';
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

    // AUTO-FLOW: BG chß║Ñp nhß║¡n ΓåÆ auto tß║ío ─ÉH + Project
    let autoResult = null;
    if (quoteData.status === 'accepted') {
      try { autoResult = await onQuotationAccepted(req.params.id, req.user.userId); } catch (e) { console.error('Auto-flow BGΓåÆ─ÉH error:', e.message); }
    }

    // ≡ƒöö NOTIFICATION: Cß║¡p nhß║¡t b├ío gi├í
    try {
      const t = await getNotifyTargets(data.lead_id);
      if (t.ownerIds.length) await notifyMultiple(req, t.ownerIds, 'quotation_updated',
        '≡ƒô¥ Cß║¡p nhß║¡t b├ío gi├í',
        `B├ío gi├í ${data.code} ─æ├ú ─æ╞░ß╗úc cß║¡p nhß║¡t${quoteData.status === 'accepted' ? ' ΓåÆ Chß║Ñp nhß║¡n Γ£à' : ''}`,
        'quotation', data.id);
    } catch (ne) { console.warn('[NOTIFY] quotation_updated:', ne.message); }

    res.json({ ...data, auto: autoResult });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
r.post('/quotations/:id/convert-to-order', async (req, res) => {
  try {
    const { data: quote } = await supabase.from('quotations').select('*').eq('id', req.params.id).single();
    if (!quote) return res.status(404).json({ error: 'Kh├┤ng t├¼m thß║Ñy b├ío gi├í' });
    if (!userMayAccessQuotationRow(req, quote)) {
      return res.status(403).json({ error: 'Kh├┤ng c├│ quyß╗ün chuyß╗ân b├ío gi├í n├áy sang ─æ╞ín h├áng' });
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

    // ≡ƒöö NOTIFICATION: BG ΓåÆ ─ÉH
    try {
      const t = await getNotifyTargets(order.lead_id);
      const allIds = [...new Set([...t.ownerIds, ...t.adminIds])];
      if (allIds.length) await notifyMultiple(req, allIds, 'order_created',
        '≡ƒ¢Æ ─É╞ín h├áng mß╗¢i tß╗½ b├ío gi├í',
        `─É╞ín h├áng ${orderCode} ─æ╞░ß╗úc tß║ío tß╗½ BG ${quote.code} ΓÇö ${formatMoney(order.total)}`,
        'order', order.id);
    } catch (ne) { console.warn('[NOTIFY] bg_to_dh:', ne.message); }

    res.status(201).json(order);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ΓòÉΓòÉΓòÉ DELETE QUOTATION ΓòÉΓòÉΓòÉ
r.delete('/quotations/:id', async (req, res) => {
  try {
    const { data: delScope } = await supabase
      .from('quotations')
      .select('created_by, company_id, code, lead_id, customer_name')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!delScope) return res.status(404).json({ error: 'Kh├┤ng t├¼m thß║Ñy b├ío gi├í' });
    if (!userMayAccessQuotationRow(req, delScope)) {
      return res.status(403).json({ error: 'Kh├┤ng c├│ quyß╗ün x├│a b├ío gi├í n├áy' });
    }
    const delQ = { code: delScope.code, lead_id: delScope.lead_id, customer_name: delScope.customer_name };

    // Unlink orders referencing this quotation
    await supabase.from('orders').update({ quotation_id: null }).eq('quotation_id', req.params.id);
    // Delete items
    await supabase.from('quotation_items').delete().eq('quotation_id', req.params.id);
    // Delete quotation
    const { error } = await supabase.from('quotations').delete().eq('id', req.params.id);
    if (error) throw error;

    // ≡ƒöö NOTIFICATION: X├│a b├ío gi├í
    try {
      const t = await getNotifyTargets(delQ?.lead_id);
      if (t.adminIds.length) await notifyMultiple(req, t.adminIds, 'item_deleted',
        '≡ƒùæ∩╕Å B├ío gi├í ─æ├ú x├│a',
        `B├ío gi├í ${delQ?.code || ''} ΓÇö KH: ${delQ?.customer_name || 'N/A'} ─æ├ú bß╗ï x├│a`,
        'quotation', req.params.id);
    } catch (ne) {}

    res.json({ message: '─É├ú x├│a b├ío gi├í' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// ORDERS (─É╞ín h├áng)
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
r.get('/orders', async (req, res) => {
  try {
    const { status, search, limit = 50, lead_id, company_id: coQ } = req.query;
    let q = supabase.from('orders')
      .select('*, customer:customers(id, full_name, phone), creator:users!orders_created_by_fkey(id, full_name)')
      .order('created_at', { ascending: false }).limit(parseInt(limit));
    if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      q = q.eq('company_id', cid);
    } else if (coQ && /^[0-9a-f-]{36}$/i.test(String(coQ))) {
      q = q.eq('company_id', coQ);
    }
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
      // ─É╞ín h├áng kh├┤ng c├│ d├▓ng (lß╗ùi copy tr╞░ß╗¢c ─æ├óy / DB trß╗æng) ΓÇö hiß╗ân thß╗ï d├▓ng tß╗½ b├ío gi├í gß╗æc
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
    const updates = { ...req.body, updated_at: new Date().toISOString() };
    // Sanitize: empty strings ΓåÆ null for UUID fields
    ['customer_id', 'lead_id', 'quotation_id', 'project_id'].forEach(f => {
      if (updates[f] === '') updates[f] = null;
    });
    if (updates.status === 'confirmed' && !updates.confirmed_at) updates.confirmed_at = new Date().toISOString();
    if (updates.status === 'shipped' && !updates.shipped_at) updates.shipped_at = new Date().toISOString();
    if (updates.status === 'delivered' && !updates.delivered_at) updates.delivered_at = new Date().toISOString();
    if (updates.status === 'cancelled' && !updates.cancelled_at) updates.cancelled_at = new Date().toISOString();
    const { data, error } = await supabase.from('orders').update(updates).eq('id', req.params.id).select('*').single();
    if (error) throw error;

    // AUTO-FLOW: ─ÉH x├íc nhß║¡n ΓåÆ tß╗▒ ─æß╗Öng tß║ío Project + Gen Tasks
    let autoProject = null;
    if (updates.status === 'confirmed') {
      try { autoProject = await onOrderConfirmed(req.params.id, req.user.userId); } catch (e) { console.error('Auto-flow error:', e.message); }
    }

    // ≡ƒöö NOTIFICATION: Cß║¡p nhß║¡t ─æ╞ín h├áng
    try {
      const statusLabels = { confirmed: '─É├ú x├íc nhß║¡n', shipped: '─Éang giao', delivered: '─É├ú giao', cancelled: '─É├ú hß╗ºy' };
      const statusLabel = statusLabels[updates.status] || '';
      const t = await getNotifyTargets(data.lead_id);
      const allIds = [...new Set([...t.ownerIds, ...t.adminIds])];
      if (allIds.length && updates.status) await notifyMultiple(req, allIds, 'order_updated',
        `≡ƒôª ─ÉH ${data.code} ΓÇö ${statusLabel}`,
        `─É╞ín h├áng ${data.code} cß║¡p nhß║¡t trß║íng th├íi: ${statusLabel}`,
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

    // Sanitize: empty strings ΓåÆ null for UUID fields
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
    if (!userIsAdmin(req.user?.role)) {
      const uc = requireUserCompanyId(req, res);
      if (!uc) return;
      if (orderCo && String(orderCo) !== String(uc)) {
        return res.status(403).json({ error: '─É╞ín h├áng phß║úi c├╣ng c├┤ng ty vß╗¢i t├ái khoß║ún' });
      }
      orderCo = orderCo || uc;
    }
    orderData.company_id = orderCo;

    const processedItems = (items || []).map(item => {
      const amount = (item.quantity || 1) * (item.unit_price || 0) * (1 - (item.discount_percent || 0) / 100);
      const vatRate = item.vat_rate || 0;
      const vatAmount = amount * vatRate / 100;
      return { ...item, amount, vat_rate: vatRate, vat_amount: vatAmount };
    });
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
          const displayLabel = data.title || data.code || '─É╞ín h├áng';
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

    // ≡ƒöö NOTIFICATION: ─É╞ín h├áng mß╗¢i
    try {
      const t = await getNotifyTargets(data.lead_id);
      const allIds = [...new Set([...t.ownerIds, ...t.adminIds])];
      if (allIds.length) await notifyMultiple(req, allIds, 'order_created',
        '≡ƒ¢Æ ─É╞ín h├áng mß╗¢i',
        `─É╞ín h├áng ${code} ΓÇö KH: ${data.customer_name || 'N/A'} ΓÇö ${formatMoney(data.total)}`,
        'order', data.id);
    } catch (ne) { console.warn('[NOTIFY] order_created:', ne.message); }

    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Convert: Order ΓåÆ Invoice
r.post('/orders/:id/create-invoice', async (req, res) => {
  try {
    const { data: order } = await supabase.from('orders').select('*').eq('id', req.params.id).single();
    if (!order) return res.status(404).json({ error: 'Kh├┤ng t├¼m thß║Ñy ─æ╞ín h├áng' });

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
        invoice_id: invoice.id, product_id: oi.product_id, order_item_id: oi.id,
        item_order: oi.item_order, name: oi.name, description: oi.description,
        unit: oi.unit, quantity: oi.quantity, unit_price: oi.unit_price,
        discount_percent: oi.discount_percent, amount: oi.amount,
        vat_rate: oi.vat_rate || 0, vat_amount: oi.vat_amount || 0,
        notes: oi.notes,
      })));
    }

    res.status(201).json(invoice);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ΓòÉΓòÉΓòÉ DELETE ORDER ΓòÉΓòÉΓòÉ
r.delete('/orders/:id', async (req, res) => {
  try {
    // Get info before delete
    const { data: delO } = await supabase.from('orders').select('code, lead_id, customer_name').eq('id', req.params.id).single();
    await supabase.from('order_items').delete().eq('order_id', req.params.id);
    const { error } = await supabase.from('orders').delete().eq('id', req.params.id);
    if (error) throw error;

    // ≡ƒöö NOTIFICATION: X├│a ─æ╞ín h├áng
    try {
      const t = await getNotifyTargets(delO?.lead_id);
      if (t.adminIds.length) await notifyMultiple(req, t.adminIds, 'item_deleted',
        '≡ƒùæ∩╕Å ─É╞ín h├áng ─æ├ú x├│a',
        `─É╞ín h├áng ${delO?.code || ''} ΓÇö KH: ${delO?.customer_name || 'N/A'} ─æ├ú bß╗ï x├│a`,
        'order', req.params.id);
    } catch (ne) {}

    res.json({ message: '─É├ú x├│a ─æ╞ín h├áng' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// INVOICES (H├│a ─æ╞ín)
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
r.get('/invoices', async (req, res) => {
  try {
    const { status, search, limit = 50, lead_id, company_id: coQ } = req.query;
    let q = supabase.from('invoices')
      .select('*, customer:customers(id, full_name, phone), creator:users!invoices_created_by_fkey(id, full_name)')
      .order('created_at', { ascending: false }).limit(parseInt(limit));
    if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      q = q.eq('company_id', cid);
    } else if (coQ && /^[0-9a-f-]{36}$/i.test(String(coQ))) {
      q = q.eq('company_id', coQ);
    }
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

    // Sanitize: empty strings ΓåÆ null for UUID fields
    ['customer_id', 'order_id', 'quotation_id', 'project_id', 'company_id'].forEach(f => {
      if (invoiceData[f] === '' || invoiceData[f] === undefined) invoiceData[f] = null;
    });

    let invCo = invoiceData.company_id || null;
    if (invoiceData.order_id) {
      const { data: orow } = await supabase.from('orders').select('company_id').eq('id', invoiceData.order_id).maybeSingle();
      if (orow?.company_id) invCo = orow.company_id;
    } else if (invoiceData.quotation_id) {
      const { data: qr } = await supabase.from('quotations').select('company_id').eq('id', invoiceData.quotation_id).maybeSingle();
      if (qr?.company_id) invCo = qr.company_id;
    }
    if (!userIsAdmin(req.user?.role)) {
      const uc = requireUserCompanyId(req, res);
      if (!uc) return;
      if (invCo && String(invCo) !== String(uc)) {
        return res.status(403).json({ error: 'H├│a ─æ╞ín phß║úi c├╣ng c├┤ng ty vß╗¢i t├ái khoß║ún' });
      }
      invCo = invCo || uc;
    }
    
    const { data: inv, error } = await supabase.from('invoices').insert({
      code,
      company_id: invCo,
      customer_id: invoiceData.customer_id,
      customer_name: invoiceData.customer_name || null,
      customer_phone: invoiceData.customer_phone || null,
      customer_address: invoiceData.customer_address || null,
      customer_tax_code: invoiceData.customer_tax_code || null,
      title: invoiceData.title || null,
      subtotal: invoiceData.subtotal || 0,
      discount_type: invoiceData.discount_type || null,
      discount_value: invoiceData.discount_value || 0,
      discount_amount: invoiceData.discount_amount || 0,
      tax_amount: invoiceData.tax_amount || 0,
      total: invoiceData.total || 0,
      notes: invoiceData.notes || null,
      due_date: invoiceData.due_date || null,
      payment_terms: invoiceData.payment_terms || null,
      created_by: req.user.userId,
    }).select('*').single();
    if (error) throw error;

    // ≡ƒöö NOTIFICATION: H├│a ─æ╞ín mß╗¢i
    try {
      const { data: admins } = await supabase.from('users').select('id').eq('role', 'admin').eq('is_active', true);
      const adminIds = (admins || []).map(u => u.id);
      if (adminIds.length) await notifyMultiple(req, adminIds, 'invoice_created',
        '≡ƒº╛ H├│a ─æ╞ín mß╗¢i',
        `H├│a ─æ╞ín ${code} ΓÇö KH: ${inv.customer_name || 'N/A'} ΓÇö ${formatMoney(inv.total)}`,
        'invoice', inv.id);
    } catch (ne) { console.warn('[NOTIFY] invoice_created:', ne.message); }

    res.status(201).json(inv);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Add items to invoice (batch)
r.post('/invoices/:id/items', async (req, res) => {
  try {
    const { items } = req.body;
    if (!items?.length) return res.status(400).json({ error: 'Kh├┤ng c├│ h├áng h├│a' });
    const itemRows = items.map((item, i) => ({
      invoice_id: req.params.id,
      product_id: item.product_id || null,
      product_code: item.product_code || null,
      item_order: i,
      name: item.name,
      description: item.description || null,
      unit: item.unit || 'bß╗Ö',
      quantity: item.quantity || 1,
      unit_price: item.unit_price || 0,
      discount_percent: item.discount_percent || 0,
      discount_amount: item.discount_amount || 0,
      amount: item.amount || 0,
      vat_rate: item.vat_rate || 0,
      vat_amount: item.vat_amount || 0,
      notes: item.notes || null,
    }));
    const { data, error } = await supabase.from('invoice_items').insert(itemRows).select();
    if (error) throw error;
    res.status(201).json(data);
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

    // ≡ƒöö NOTIFICATION: Thanh to├ín
    try {
      const { data: inv } = await supabase.from('invoices').select('code, lead_id, customer_name, total, order_id').eq('id', req.params.id).single();
      const t = await getNotifyTargets(inv?.lead_id);
      const allIds = [...new Set([...t.ownerIds, ...t.adminIds])];
      const paidLabel = paymentStatus === 'paid' ? 'Γ£à ─É├ú thanh to├ín ─æß╗º' : '≡ƒÆ░ Nhß║¡n thanh to├ín';
      if (allIds.length) await notifyMultiple(req, allIds, 'payment_received',
        paidLabel,
        `${inv?.code || 'H─É'} ΓÇö Nhß║¡n ${formatMoney(payment.amount)} (${formatMoney(totalPaid)}/${formatMoney(inv?.total)})`,
        'invoice', req.params.id);
    } catch (ne) { console.warn('[NOTIFY] payment:', ne.message); }

    res.status(201).json(payment);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ΓòÉΓòÉΓòÉ DELETE INVOICE ΓòÉΓòÉΓòÉ
r.delete('/invoices/:id', async (req, res) => {
  try {
    // Get info before delete
    const { data: delI } = await supabase.from('invoices').select('code, customer_name').eq('id', req.params.id).single();
    await supabase.from('payment_records').delete().eq('invoice_id', req.params.id);
    await supabase.from('invoice_items').delete().eq('invoice_id', req.params.id);
    const { error } = await supabase.from('invoices').delete().eq('id', req.params.id);
    if (error) throw error;

    // ≡ƒöö NOTIFICATION: X├│a h├│a ─æ╞ín
    try {
      const { data: admins } = await supabase.from('users').select('id').eq('role', 'admin').eq('is_active', true);
      const adminIds = (admins || []).map(u => u.id);
      if (adminIds.length) await notifyMultiple(req, adminIds, 'item_deleted',
        '≡ƒùæ∩╕Å H├│a ─æ╞ín ─æ├ú x├│a',
        `H├│a ─æ╞ín ${delI?.code || ''} ΓÇö KH: ${delI?.customer_name || 'N/A'} ─æ├ú bß╗ï x├│a`,
        'invoice', req.params.id);
    } catch (ne) {}

    res.json({ message: '─É├ú x├│a h├│a ─æ╞ín' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ΓòÉΓòÉΓòÉ MISA meInvoice ΓÇö Ph├ít h├ánh h├│a ─æ╞ín ─æiß╗çn tß╗¡ ΓòÉΓòÉΓòÉ

// POST /invoices/:id/misa-publish ΓÇö Ph├ít h├ánh H─É─ÉT l├¬n MISA meInvoice
r.post('/invoices/:id/misa-publish', async (req, res) => {
  try {
    if (!misaService) return res.status(503).json({ error: 'MISA service ch╞░a ─æ╞░ß╗úc cß║Ñu h├¼nh' });

    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .select('*, customer:customers(id, full_name, email, tax_code)')
      .eq('id', req.params.id).single();
    if (invErr || !invoice) return res.status(404).json({ error: 'Kh├┤ng t├¼m thß║Ñy h├│a ─æ╞ín' });

    if (invoice.misa_status === 'published') {
      return res.status(400).json({ error: 'H├│a ─æ╞ín ─æ├ú ─æ╞░ß╗úc ph├ít h├ánh l├¬n MISA (sß╗æ: ' + invoice.misa_invoice_no + ')' });
    }

    const { data: items } = await supabase
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', req.params.id)
      .order('item_order');

    // Gß║»n email tß╗½ customer nß║┐u invoice kh├┤ng c├│
    const invoiceWithEmail = {
      ...invoice,
      customer_email: invoice.customer_email || invoice.customer?.email || '',
    };

    const result = await misaService.publishInvoice(invoiceWithEmail, items || []);

    // Cß║¡p nhß║¡t trß║íng th├íi MISA v├áo DB
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
    // L╞░u lß╗ùi v├áo DB ─æß╗â dß╗à debug
    await supabase.from('invoices').update({
      misa_error_message: e.message,
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id);
    res.status(500).json({ error: e.message });
  }
});

// POST /invoices/:id/misa-send-email ΓÇö Gß╗¡i email H─É─ÉT qua MISA
r.post('/invoices/:id/misa-send-email', async (req, res) => {
  try {
    if (!misaService) return res.status(503).json({ error: 'MISA service ch╞░a ─æ╞░ß╗úc cß║Ñu h├¼nh' });

    const { data: invoice } = await supabase
      .from('invoices')
      .select('misa_invoice_no, misa_status, customer_name, customer:customers(email)')
      .eq('id', req.params.id).single();

    if (!invoice) return res.status(404).json({ error: 'Kh├┤ng t├¼m thß║Ñy h├│a ─æ╞ín' });
    if (invoice.misa_status !== 'published' && invoice.misa_status !== 'sent_email') {
      return res.status(400).json({ error: 'H├│a ─æ╞ín ch╞░a ─æ╞░ß╗úc ph├ít h├ánh l├¬n MISA' });
    }

    const email = req.body.email || invoice.customer?.email || '';
    if (!email) return res.status(400).json({ error: 'Kh├┤ng c├│ ─æß╗ïa chß╗ë email ─æß╗â gß╗¡i' });

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

// GET /invoices/:id/misa-status ΓÇö Kiß╗âm tra trß║íng th├íi H─É─ÉT tß╗½ MISA
r.get('/invoices/:id/misa-status', async (req, res) => {
  try {
    if (!misaService) return res.status(503).json({ error: 'MISA service ch╞░a ─æ╞░ß╗úc cß║Ñu h├¼nh' });

    const { data: invoice } = await supabase
      .from('invoices')
      .select('id, misa_status, misa_invoice_no, misa_ref_id, misa_published_at, misa_lookup_code, misa_error_message')
      .eq('id', req.params.id).single();

    if (!invoice) return res.status(404).json({ error: 'Kh├┤ng t├¼m thß║Ñy h├│a ─æ╞ín' });

    let misaDetail = null;
    if (invoice.misa_ref_id) {
      try {
        misaDetail = await misaService.getInvoiceStatus(invoice.misa_ref_id);
      } catch (statusErr) {
        // Kh├┤ng n├⌐m lß╗ùi, chß╗ë trß║ú local status
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

// Convert Lead ΓåÆ Project
r.post('/leads/:id/convert-to-project', async (req, res) => {
  // NOTE: notification added at the end of this handler
  try {
    const { data: lead } = await supabase.from('crm_leads').select('*, customer:customers(id, full_name)').eq('id', req.params.id).single();
    if (!lead) return res.status(404).json({ error: 'Lead kh├┤ng tß╗ôn tß║íi' });

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
      console.warn('[leadΓåÆproject] ensure lead_documents:', e.message);
    }

    // ΓöÇΓöÇ AUTO-GENERATE TASKS FOR ALL STAGES ΓöÇΓöÇ
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

    // ≡ƒöö NOTIFICATION: Lead/Deal ΓåÆ Dß╗▒ ├ín
    try {
      const t = await getNotifyTargets(req.params.id);
      const allIds = [...new Set([...t.ownerIds, ...t.adminIds])];
      if (allIds.length) await notifyMultiple(req, allIds, 'project_created',
        '≡ƒÅù∩╕Å Tß║ío dß╗▒ ├ín tß╗½ Deal',
        `Dß╗▒ ├ín ${project.code} ΓÇö "${project.name}" ΓÇö ${totalCreated} tasks`,
        'project', project.id);
    } catch (ne) { console.warn('[NOTIFY] convert_project:', ne.message); }

    // NOTE: Kh├┤ng tß╗▒ tß║ío ─É╞ín 1/2/... tß╗½ deal. ─É╞ín h├áng chß╗ë tß║ío thß╗º c├┤ng tß║íi tab ─É╞ín h├áng.
    const orderOneConv = null;

    res.status(201).json({ ...project, tasks_created: totalCreated, order_one: null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// PROJECT CRM SUMMARY ΓÇö Tab CRM trong ProjectDetail
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
r.get('/project/:projectId/summary', async (req, res) => {
  try {
    const summary = await getProjectCRMSummary(req.params.projectId);
    res.json(summary);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// Project Lead Documents ΓÇö fast lookup by project_id (no full leads scan)
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
r.get('/project/:projectId/lead-documents', async (req, res) => {
  try {
    const { leadDocVisibleForModuleAndUser } = require('../helpers/documentShareScope');
    const forModule = String(req.query.for_module || '').toLowerCase().trim();
    const useMod = ['production', 'logistics', 'workshop'].includes(forModule) ? forModule : null;

    // Find lead linked to this project
    const { data: lead } = await supabase
      .from('crm_leads')
      .select('id')
      .eq('project_id', req.params.projectId)
      .limit(1)
      .single();

    if (!lead) return res.json([]);

    const { data: docs } = await supabase
      .from('lead_documents')
      .select('*, creator:users!lead_documents_created_by_fkey(id, full_name)')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false });

    let rows = docs || [];
    if (useMod) {
      rows = rows.filter((d) => leadDocVisibleForModuleAndUser(d, useMod, req.user));
    }
    res.json(rows);
  } catch (e) {
    // No lead found ΓåÆ empty
    res.json([]);
  }
});

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// CRM CUSTOMERS - Aggregated customer view
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
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

r.get('/customers-overview', async (req, res) => {
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

    let custQ = supabase.from('customers').select('*').order('full_name');
    if (effectiveCompanyId) custQ = custQ.eq('company_id', effectiveCompanyId);
    const { data: customers, error: custErr } = await custQ;
    if (custErr) throw custErr;

    let leadsQ = supabase
      .from('crm_leads')
      .select(
        'id, customer_id, company_id, source_id, title, estimated_value, stage_id, code, created_at, type, assigned_to, lead_owner_id, stage:crm_pipeline_stages!crm_leads_stage_id_fkey(name, icon, is_won), source:crm_sources(id, name, icon)',
      );
    if (effectiveCompanyId) leadsQ = leadsQ.eq('company_id', effectiveCompanyId);
    const { data: leadsRaw, error: leadsErr } = await leadsQ;
    if (leadsErr) throw leadsErr;
    const uid = req.user?.userId;
    const role = req.user?.role;
    const leads = (leadsRaw || []).filter((l) => crmLeadRowVisibleToRequestUser(l, uid, role));
    let quotesQ = supabase.from('quotations').select('id, customer_id, code, title, total, status, created_at, company_id');
    if (effectiveCompanyId) quotesQ = quotesQ.eq('company_id', effectiveCompanyId);
    if (!userIsAdmin(req.user?.role) && uid) quotesQ = quotesQ.eq('created_by', uid);
    let ordersQ = supabase.from('orders').select('id, customer_id, code, title, total, status, paid_amount, created_at, company_id');
    if (effectiveCompanyId) ordersQ = ordersQ.eq('company_id', effectiveCompanyId);
    let invoicesQ = supabase.from('invoices').select('id, customer_id, code, title, total, paid_amount, payment_status, created_at, company_id');
    if (effectiveCompanyId) invoicesQ = invoicesQ.eq('company_id', effectiveCompanyId);
    const [{ data: quotes }, { data: orders }, { data: invoices }] = await Promise.all([quotesQ, ordersQ, invoicesQ]);

    const result = (customers || []).map(c => {
      const cLeads = (leads || []).filter(l => l.customer_id === c.id);
      const cQuotes = (quotes || []).filter(q => q.customer_id === c.id);
      const cOrders = (orders || []).filter(o => o.customer_id === c.id);
      const cInvoices = (invoices || []).filter(i => i.customer_id === c.id);
      const totalOrders = cOrders.reduce((s, o) => s + (o.total || 0), 0);
      const totalPaid = cInvoices.reduce((s, i) => s + (i.paid_amount || 0), 0);
      const totalDebt = cInvoices.reduce((s, i) => s + ((i.total || 0) - (i.paid_amount || 0)), 0);
      return { ...c, leads: cLeads, quotes: cQuotes, orders: cOrders, invoices: cInvoices,
        stats: { lead_count: cLeads.length, won_count: cLeads.filter(l => l.stage?.is_won).length,
          quote_count: cQuotes.length, order_count: cOrders.length, invoice_count: cInvoices.length,
          total_orders: totalOrders, total_paid: totalPaid, total_debt: totalDebt,
          lead_value: cLeads.reduce((s, l) => s + (l.estimated_value || 0), 0) }
      };
    });
    res.json(result);
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
    if (!customer) return res.status(404).json({ error: 'KH kh├┤ng tß╗ôn tß║íi' });
    if (effectiveCompanyId && customer.company_id && String(customer.company_id) !== String(effectiveCompanyId)) {
      return res.status(403).json({ error: 'Kh├┤ng c├│ quyß╗ün xem kh├ích h├áng n├áy' });
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

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// CRM PRODUCTS
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
r.get('/products-list', async (req, res) => {
  try {
    const rawQ = req.query.company_id && String(req.query.company_id).trim();
    let effectiveCompanyId = rawQ || null;
    if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      effectiveCompanyId = cid;
    }
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
    if (!existing) return res.status(404).json({ error: 'Kh├┤ng t├¼m thß║Ñy sß║ún phß║⌐m' });
    if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      if (existing.company_id && String(existing.company_id) !== String(cid)) {
        return res.status(403).json({ error: 'Kh├┤ng c├│ quyß╗ün sß╗¡a sß║ún phß║⌐m c├┤ng ty kh├íc' });
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

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// FOLLOW-UP ALERTS
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
r.get('/alerts/follow-ups', async (req, res) => {
  try {
    const overdue = await getOverdueFollowUps();
    const stale = await getStaleLeads(parseInt(req.query.days) || 7);
    res.json({ overdue, stale, total: overdue.length + stale.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// PROJECT COMPLETE ΓåÆ AUTO INVOICE
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
r.post('/project/:projectId/auto-invoice', async (req, res) => {
  try {
    const invoices = await onProjectCompleted(req.params.projectId, req.user.userId);

    // ≡ƒöö NOTIFICATION: Auto h├│a ─æ╞ín
    if (invoices.length) {
      try {
        const { data: admins } = await supabase.from('users').select('id').eq('role', 'admin').eq('is_active', true);
        const adminIds = (admins || []).map(u => u.id);
        if (adminIds.length) await notifyMultiple(req, adminIds, 'invoice_created',
          '≡ƒº╛ Tß╗▒ ─æß╗Öng tß║ío h├│a ─æ╞ín',
          `Dß╗▒ ├ín ho├án th├ánh ΓåÆ tß║ío ${invoices.length} h├│a ─æ╞ín`,
          'project', req.params.projectId);
      } catch (ne) { console.warn('[NOTIFY] auto_invoice:', ne.message); }
    }

    res.json({ created: invoices.length, invoices });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// LEAD Γåö PROJECT SYNC: Tasks/Checklists + Stage Progress
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ

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

// Sync: move lead stage ΓåÆ project stage + vice versa
r.post('/leads/:id/sync-stage', async (req, res) => {
  try {
    const { stage_slug, direction } = req.body; // direction: 'lead-to-project' | 'project-to-lead'

    const { data: lead } = await supabase.from('crm_leads')
      .select('*, stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, order_index, is_won, is_lost)')
      .eq('id', req.params.id).single();
    if (!lead?.project_id) return res.status(400).json({ error: 'Lead ch╞░a li├¬n kß║┐t dß╗▒ ├ín' });

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

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// PDF GENERATION HELPER
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
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

  // ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
  // COMPANY HEADER (logo left, info right)
  // ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
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

  // ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
  // DOCUMENT TITLE
  // ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
  let title = '';
  if (docType === 'quotation') title = company.quotationTitle || 'B├üO GI├ü KHß╗ÉI L╞»ß╗óNG C├öNG TR├îNH';
  else if (docType === 'order') title = company.orderTitle || '─É╞áN H├ÇNG';
  else title = company.invoiceTitle || 'H├ôA ─É╞áN B├üN H├ÇNG';

  pdf.y = afterHeaderY + 15;
  pdf.font('VN-Bold').fontSize(16).fillColor('#1a1a1a');
  pdf.text(title, margin, pdf.y, { align: 'center', width: pageW });
  
  pdf.font('VN').fontSize(9).fillColor('#555');
  pdf.text(`Sß╗æ: ${doc.code || ''}`, margin, pdf.y, { align: 'center', width: pageW });
  if (doc.created_at) {
    pdf.text(`Ng├áy: ${new Date(doc.created_at).toLocaleDateString('vi-VN')}`, margin, pdf.y, { align: 'center', width: pageW });
  }
  pdf.moveDown(0.8);

  // ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
  // GREETING TEXT
  // ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
  if (company.greeting) {
    pdf.font('VN').fontSize(9).fillColor('#333');
    const shortName = company.name.replace(/^C├┤ng Ty /i, '').split(' ').pop() || company.name;
    pdf.text(`${company.name} ${company.greeting}`, margin, pdf.y, { width: pageW });
    if (docType === 'quotation') {
      pdf.text(`${shortName} xin gß╗¡i ─æß║┐n qu├╜ kh├ích bß║úng b├ío gi├í khß╗æi l╞░ß╗úng c├┤ng tr├¼nh nh╞░ sau:`, margin, pdf.y, { width: pageW });
    }
    pdf.moveDown(0.5);
  }

  // ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
  // CUSTOMER INFO
  // ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
  pdf.font('VN-Bold').fontSize(9).fillColor('#1a1a1a');
  if (doc.customer_name) pdf.text(`Kh├ích h├áng: ${doc.customer_name}`, margin);
  pdf.font('VN').fontSize(9).fillColor('#333');
  if (doc.customer_phone) pdf.text(`─Éiß╗çn thoß║íi: ${doc.customer_phone}`, margin);
  if (doc.customer_address) pdf.text(`─Éß╗ïa chß╗ë: ${doc.customer_address}`, margin);
  if (doc.customer?.tax_code) pdf.text(`MST: ${doc.customer.tax_code}`, margin);
  pdf.moveDown(0.6);

  // ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
  // ITEMS TABLE
  // ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
  // Column definitions: STT | Hß║íng mß╗Ñc thi c├┤ng | ─ÉVT | Quy c├ích | Sß╗æ l╞░ß╗úng | Diß╗çn t├¡ch | ─É╞ín gi├í | Th├ánh tiß╗ün | %VAT | Tiß╗ün thuß║┐ | Ghi ch├║
  const colWidths = [25, 120, 30, 55, 35, 45, 60, 65, 28, 52];
  const colLabels = ['STT', 'Hß║íng mß╗Ñc thi c├┤ng', '─ÉVT', 'Quy c├ích', 'SL', 'D.t├¡ch (m┬▓)', '─É╞ín gi├í', 'Th├ánh tiß╗ün', 'VAT%', 'Tiß╗ün thuß║┐'];
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

  // ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
  // TOTALS
  // ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
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

  drawTotal('Cß╗Öng tiß╗ün h├áng:', formatVNDPdf(subtotal) + ' ─æ');
  if (discountAmt > 0) drawTotal('Chiß║┐t khß║Ñu:', '-' + formatVNDPdf(discountAmt) + ' ─æ');
  if (discountAmt > 0) drawTotal('Sau chiß║┐t khß║Ñu:', formatVNDPdf(afterRebate) + ' ─æ');
  if (saleDiscountAmt > 0) drawTotal('Giß║úm gi├í:', '-' + formatVNDPdf(saleDiscountAmt) + ' ─æ');
  if (saleDiscountAmt > 0) drawTotal('Cß╗Öng tr╞░ß╗¢c thuß║┐:', formatVNDPdf(afterAllDiscounts) + ' ─æ');
  drawTotal('Thuß║┐ GTGT:', formatVNDPdf(totalVat) + ' ─æ');
  drawTotal('Tß╗öNG Cß╗ÿNG:', formatVNDPdf(total) + ' VN─É', { bold: true, color: '#1D4ED8', underline: true });

  // ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
  // PAYMENT TERMS & NOTES
  // ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
  tableY += 6;
  if (doc.payment_terms) {
    pdf.font('VN-Bold').fontSize(9).fillColor('#1a1a1a');
    pdf.text('─Éiß╗üu khoß║ún thanh to├ín:', margin, tableY, { width: pageW });
    tableY = pdf.y + 2;
    pdf.font('VN').fontSize(8).fillColor('#333');
    pdf.text(doc.payment_terms, margin + 10, tableY, { width: pageW - 10 });
    tableY = pdf.y + 6;
  }

  if (doc.valid_until) {
    pdf.font('VN-Bold').fontSize(9).fillColor('#1a1a1a');
    pdf.text(`Hiß╗çu lß╗▒c b├ío gi├í: ─æß║┐n ng├áy ${new Date(doc.valid_until).toLocaleDateString('vi-VN')}`, margin, tableY, { width: pageW });
    tableY = pdf.y + 4;
  }

  if (company.warrantyText) {
    pdf.font('VN-Bold').fontSize(9).fillColor('#1a1a1a');
    pdf.text('Bß║úo h├ánh:', margin, tableY, { width: pageW });
    tableY = pdf.y + 2;
    pdf.font('VN').fontSize(8).fillColor('#333');
    pdf.text(company.warrantyText, margin + 10, tableY, { width: pageW - 10 });
    tableY = pdf.y + 6;
  }

  if (doc.notes) {
    pdf.font('VN-Bold').fontSize(9).fillColor('#1a1a1a');
    pdf.text('Ghi ch├║:', margin, tableY, { width: pageW });
    tableY = pdf.y + 2;
    pdf.font('VN').fontSize(8).fillColor('#333');
    pdf.text(doc.notes, margin + 10, tableY, { width: pageW - 10 });
    tableY = pdf.y + 6;
  }

  // Bank info
  if (company.bankAccount && company.bankName) {
    pdf.font('VN-Bold').fontSize(9).fillColor('#1a1a1a');
    pdf.text('Th├┤ng tin chuyß╗ân khoß║ún:', margin, tableY, { width: pageW });
    tableY = pdf.y + 2;
    pdf.font('VN').fontSize(8).fillColor('#333');
    pdf.text(`STK: ${company.bankAccount} ΓÇö ${company.bankName}`, margin + 10, tableY, { width: pageW - 10 });
    tableY = pdf.y + 6;
  }

  // ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
  // SIGNATURES
  // ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
  if (tableY + 90 > pdf.page.height - margin) pdf.addPage();
  tableY = Math.max(tableY + 25, pdf.y + 25);

  const sigLeft = company.signatureLeft || '─Éß║íi diß╗çn kh├ích h├áng';
  const sigRight = company.signatureRight || '─Éß║íi diß╗çn c├┤ng ty';

  pdf.font('VN-Bold').fontSize(9).fillColor('#1a1a1a');
  pdf.text(sigLeft, margin, tableY, { width: pageW / 2, align: 'center' });
  pdf.text(sigRight, margin + pageW / 2, tableY, { width: pageW / 2, align: 'center' });
  tableY += 14;
  pdf.font('VN').fontSize(7).fillColor('#888');
  pdf.text('(K├╜, ghi r├╡ hß╗ì t├¬n)', margin, tableY, { width: pageW / 2, align: 'center' });
  pdf.text('(K├╜, ghi r├╡ hß╗ì t├¬n)', margin + pageW / 2, tableY, { width: pageW / 2, align: 'center' });

  pdf.end();
}

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// IMPORT EXCEL ΓåÆ PARSE (chß╗ë parse, trß║ú vß╗ü data preview ΓÇö KH├öNG l╞░u DB)
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ

/** Qu├⌐t ├┤ ┬½─É├â NHß║¼N┬╗ / ┬½CH╞»A NHß║¼N┬╗ tr├¬n d├▓ng Cß╗ìc (mß║½u b├ío gi├í Ph├║c ─Éß║ít). */
function parseExcelDepositReceivedFromRow(row) {
  const blob = (row || []).map((c) => String(c ?? '').trim()).filter(Boolean).join(' ');
  if (/\b─É├â\s*(NHß║¼N|THU|─É├ôNG)\b/i.test(blob)) return true;
  if (/\bCH╞»A\s*(NHß║¼N|THU|─É├ôNG)\b/i.test(blob)) return false;
  return null;
}

/** D├▓ng tiß╗ün Cß╗ìc / C├▓n lß║íi ΓÇö kh├┤ng c├│ chß╗» Tß╗öNG/Cß╗ÿNG (tr├ính tr├╣ng vß╗¢i d├▓ng tß╗òng hß║íng mß╗Ñc). */
function isExcelDepositOrRemainSummaryRow(name, stt, fullRowText) {
  const bundle = `${name || ''} ${stt || ''} ${fullRowText || ''}`.trim();
  if (!bundle) return false;
  const u = bundle.toUpperCase();
  if (/\bTß╗öNG\b/.test(u) || /\bCß╗ÿNG\b/.test(u)) return false;
  return /\bCß╗îC\b/.test(u) || /\bC├ÆN\s*Lß║áI\b/.test(u);
}

/**
 * Nhß║¡n diß╗çn ├┤/d├▓ng Excel l├á th├┤ng tin li├¬n hß╗ç NVKD ΓÇö KTΓÇª (kh├┤ng g├ín S─ÉT n├áy v├áo kh├ích h├áng).
 * Tr├ính nhß║ºm khi mß║½u c├│ "S─ÉT" / "Sß╗æ ─æiß╗çn thoß║íi" gß║»n vß╗¢i phß╗Ñ tr├ích.
 */
function excelHeaderTextIsStaffContactContext(upper) {
  const u = String(upper || '').trim().toUpperCase();
  if (!u) return false;
  if (/KH├üCH\s*H├ÇNG|KHACH\s*HANG|S─ÉT\s*KH\b|SDT\s*KH\b|LI├èN\s*Hß╗å\s*KH|LI├èN\s*Lß║áC\s*KH/i.test(u)) return false;
  if (u.includes('NVKD') || u.includes('NV KD') || u.includes('PHß╗ñ TR├üCH KD')) return true;
  if (u.includes('KT PHß╗ñ TR├üCH') || u.includes('Kß╗╕ THUß║¼T PHß╗ñ TR├üCH') || u.includes('K─¿ THUß║¼T PHß╗ñ TR├üCH')) return true;
  if (u.includes('NG╞»ß╗£I PHß╗ñ TR├üCH') || u.includes('NGUOI PHU TRACH')) return true;
  if (u.includes('LI├èN Hß╗å NV') || u.includes('LIEN HE NV')) return true;
  if (/^S─ÉT\s*(NVKD|NV|KD|KT)\b/i.test(u) || /^SDT\s*(NVKD|NV|KD|KT)\b/i.test(u)) return true;
  if (/Sß╗É\s*─ÉIß╗åN\s*THOß║áI/i.test(u) && (u.includes('NVKD') || u.includes('PHß╗ñ TR├üCH') || u.includes('Kß╗╕ THUß║¼T') || u.includes('K─¿ THUß║¼T'))) return true;
  return false;
}

function excelRowLooksLikeStaffPhoneContext(rowArr) {
  const blob = (rowArr || []).map((c) => String(c ?? '').trim().toUpperCase()).filter(Boolean).join(' | ');
  return excelHeaderTextIsStaffContactContext(blob);
}

/** Nhß║¡n diß╗çn mß║½u Excel b├ío gi├í Bao B├¼ NextGo (cß╗Öt QUY C├üCH Sß║óN PHß║¿M / header c├┤ng ty NextGo). */
function excelDetectNextGoQuotationFormat(rows, headerIdx) {
  if (headerIdx >= 0) {
    const hdr = (rows[headerIdx] || []).map((c) => String(c || '').trim().toUpperCase()).join(' ');
    if (hdr.includes('QUY C├üCH') || hdr.includes('QUY CACH')) return true;
  }
  const scanUntil = headerIdx >= 0 ? headerIdx : Math.min(rows.length, 15);
  for (let i = 0; i < scanUntil; i++) {
    const blob = (rows[i] || []).map((c) => String(c || '').trim().toUpperCase()).join(' ');
    if (blob.includes('NEXTGO') || blob.includes('BAO B├î NEXTGO') || blob.includes('BAO BI NEXTGO')) return true;
  }
  return false;
}

/** Row c├│ giß╗æng header b├ío gi├í (STT + Hß║áNG Mß╗ñC / T├èN H├ÇNG) ΓÇö d├╣ng cho excel-sheets + parse-excel. */
function excelLooksLikeHeaderRow(rowArr) {
  const upper = (rowArr || []).map((c) => String(c || '').trim().toUpperCase());
  const hasStt = upper.some((c) => c === 'STT' || c === 'TT');
  const hasName = upper.some(
    (c) =>
      (c.includes('Hß║áNG Mß╗ñC') || c.includes('T├èN H├ÇNG') || c.includes('T├èN Sß║óN PHß║¿M') ||
        c.includes('Nß╗ÿI DUNG') || c.includes('M├â H├ÇNG'))
      && !c.includes('DIß╗äN GIß║óI'),
  );
  return hasStt && hasName;
}

function resolveExcelWorksheet(wb, sheetName) {
  const names = wb.SheetNames || [];
  if (!names.length) return { sheetName: null, ws: null };
  const requested = String(sheetName || '').trim();
  const resolved = requested && names.includes(requested) ? requested : names[0];
  return { sheetName: resolved, ws: wb.Sheets[resolved] };
}

const excelUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

/** Liß╗çt k├¬ sheet trong file Excel + gß╗úi ├╜ sheet giß╗æng b├ío gi├í (heuristic header). */
r.post('/quotations/excel-sheets', excelUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Ch╞░a chß╗ìn file' });
    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellFormula: false });
    const names = wb.SheetNames || [];
    if (!names.length) return res.status(400).json({ error: 'File kh├┤ng c├│ sheet' });
    const sheets = names.map((name) => {
      const ws = wb.Sheets[name];
      const rows = ws ? XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true }) : [];
      const rowCount = rows.length;
      const isQuotation = rows.slice(0, 30).some((r) => excelLooksLikeHeaderRow(r || []));
      return { name, rowCount, isQuotation };
    });
    const defaultSheet = sheets.find((s) => s.isQuotation)?.name || sheets[0]?.name || null;
    res.json({ sheets, defaultSheet, totalSheets: sheets.length });
  } catch (e) {
    console.error('[excel-sheets]', e);
    res.status(500).json({ error: e.message || 'Lß╗ùi ─æß╗ìc file' });
  }
});

r.post('/quotations/parse-excel', excelUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Ch╞░a chß╗ìn file' });

    // cellFormula:false ΓåÆ chß╗ë ─æß╗ìc cached value, kh├┤ng parse/t├¡nh lß║íi c├┤ng thß╗⌐c Excel
    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellFormula: false });
    const { sheetName: parsedSheetName, ws } = resolveExcelWorksheet(wb, req.body?.sheet_name);
    if (!ws) return res.status(400).json({ error: 'File kh├┤ng c├│ sheet' });
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });

    if (!rows.length) return res.status(400).json({ error: 'File rß╗ùng' });

    // ΓöÇΓöÇ 1. Detect header row ΓöÇΓöÇ
    // Helper: tß╗½ 1 row (─æ├ú upper-cased) build colMap; row2 (nß║┐u c├│) l├á sub-header (merge cell "Quy C├ích"ΓÇª).
    // Format mß╗¢i (Vß║ín Ph├║ Th├ánh): c├│ th├¬m DIß╗äN GIß║óI Hß║áNG Mß╗ñC, ─É╞áN GI├ü SAU CHIß║╛T KHß║ñU, Sß╗É TIß╗ÇN CHIß║╛T KHß║ñU,
    // % CHIß║╛T KHß║ñU per-row, M├â H├ÇNG, Sß╗É L╞»ß╗óNG. Phß║úi tr├ính ghi ─æ├¿ name bß║▒ng "DIß╗äN GIß║óI Hß║áNG Mß╗ñC".
    function buildColMap(headerRow, subRow) {
      const cm = {};
      const upper = headerRow.map(c => String(c || '').trim().toUpperCase());
      // Pass thß╗⌐ tß╗▒ ╞░u ti├¬n: description ΓåÆ name ΓåÆ c├íc cß╗Öt kh├íc (─æß╗â DIß╗äN GIß║óI Hß║áNG Mß╗ñC kh├┤ng match name)
      upper.forEach((label, ci) => {
        if (!label) return;
        if (
          label.includes('DIß╗äN GIß║óI') || label.includes('M├ö Tß║ó') || label.includes('CHI TIß║╛T') ||
          label.includes('QUY C├üCH') || label.includes('QUY CACH')
        ) {
          if (cm.description === undefined) cm.description = ci;
        }
      });
      upper.forEach((label, ci) => {
        if (!label) return;
        if (label === 'STT' || label === 'TT') {
          if (cm.stt === undefined) cm.stt = ci;
        } else if (
          (label.includes('Hß║áNG Mß╗ñC') || label.includes('T├èN H├ÇNG') ||
           label.includes('T├èN Sß║óN PHß║¿M') || label === 'T├èN SP' || label.includes('Nß╗ÿI DUNG'))
          && !label.includes('DIß╗äN GIß║óI') && !label.includes('M├ö Tß║ó') && !label.includes('CHI TIß║╛T')
        ) {
          if (cm.name === undefined) cm.name = ci;
        } else if (label.includes('M├â H├ÇNG') || label === 'M├â SP' || label.includes('M├â Sß║óN PHß║¿M')) {
          if (cm.sku === undefined) cm.sku = ci;
        } else if (label === '─ÉVT' || label.includes('─É╞áN Vß╗è')) {
          if (cm.unit === undefined) cm.unit = ci;
        } else if (label.includes('KHß╗ÉI L╞»ß╗óNG') || label.includes('Sß╗É L╞»ß╗óNG') || label === 'SL' || label === 'KL') {
          if (cm.quantity === undefined) cm.quantity = ci;
        } else if (label.includes('NGANG') || (label.includes('D├ÇI') && !label.includes('Bß║óO'))) {
          if (cm.length === undefined) cm.length = ci;
        } else if (label.includes('S├éU') || label.includes('Rß╗ÿNG')) {
          if (cm.width === undefined) cm.width = ci;
        } else if (label.includes('CAO') && !label.includes('CHIß║╛T') && !label.includes('CK')) {
          if (cm.height === undefined) cm.height = ci;
        } else if (
          label.includes('% CHIß║╛T KHß║ñU') || label.includes('%CHIß║╛T KHß║ñU') ||
          (label.includes('CHIß║╛T KHß║ñU') && (label.includes('%') || label === 'CK%')) ||
          label === '%CK' || label === '% CK'
        ) {
          if (cm.discount_percent === undefined) cm.discount_percent = ci;
        } else if (
          label.includes('─É╞áN GI├ü') &&
          !label.includes('SAU') && !label.includes('Sß╗É TIß╗ÇN') && !label.includes('CHIß║╛T KHß║ñU')
        ) {
          if (cm.unit_price === undefined) cm.unit_price = ci;
        } else if (label.includes('TH├ÇNH TIß╗ÇN') || label.includes('T.TIß╗ÇN') || label.includes('TT (VN─É)')) {
          if (cm.amount === undefined) cm.amount = ci;
        } else if (label.includes('GHI CH├Ü') || label.includes('NOTE')) {
          if (cm.notes === undefined) cm.notes = ci;
        } else if (label.includes('VAT') || label.includes('THUß║╛')) {
          if (cm.vat_rate === undefined) cm.vat_rate = ci;
        }
      });

      // Sub-header (merge cell QUY C├üCH ΓåÆ NGANG/S├éU/CAO). Cho ph├⌐p override length nß║┐u super-header
      // chß╗ë l├á "D├ÇI (m)" ─æ╞ín lß║╗ v├á sub-row c├│ cß║ú NGANG: ╞░u ti├¬n NGANG.
      let subAdvance = false;
      if (subRow && subRow.length) {
        const subUpper = subRow.map(c => String(c || '').trim().toUpperCase());
        subUpper.forEach((label, ci) => {
          if (!label) return;
          if (label.includes('NGANG')) {
            cm.length = ci; subAdvance = true;
          } else if (label.includes('S├éU') || label.includes('Rß╗ÿNG')) {
            if (cm.width === undefined || cm.width === ci) cm.width = ci;
            subAdvance = true;
          } else if (label.includes('CAO') && !label.includes('CHIß║╛T') && !label.includes('CK')) {
            if (cm.height === undefined || cm.height === ci) cm.height = ci;
            subAdvance = true;
          } else if ((label.includes('KHß╗ÉI L╞»ß╗óNG') || label.includes('Sß╗É L╞»ß╗óNG') || label === 'SL' || label === 'KL') && cm.quantity === undefined) {
            cm.quantity = ci; subAdvance = true;
          } else if ((label.includes('% CHIß║╛T KHß║ñU') || label === 'CK%' || label === '%CK') && cm.discount_percent === undefined) {
            cm.discount_percent = ci; subAdvance = true;
          }
        });
      }
      return { cm, subAdvance };
    }

    let headerIdx = -1;
    let colMap = {};
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      if (!excelLooksLikeHeaderRow(rows[i] || [])) continue;
      const { cm, subAdvance } = buildColMap(rows[i], rows[i + 1] || []);
      colMap = cm;
      headerIdx = subAdvance ? i + 1 : i;
      break;
    }
    if (headerIdx < 0) return res.status(400).json({ error: 'Kh├┤ng t├¼m thß║Ñy d├▓ng ti├¬u ─æß╗ü (cß║ºn c├│ STT + Hß║áNG Mß╗ñC)' });
    const isNextGoFormat = excelDetectNextGoQuotationFormat(rows, headerIdx);
    console.log('[parse-excel] sheet:', parsedSheetName, 'headerIdx:', headerIdx, 'format:', isNextGoFormat ? 'nextgo' : 'default', 'colMap:', JSON.stringify(colMap));

    // ΓöÇΓöÇ Fill merged cells trong cß╗Öt DIß╗äN GIß║óI / GHI CH├Ü / T├èN SP / STT ΓöÇΓöÇ
    // Excel cho ph├⌐p 1 ├┤ m├┤ tß║ú gß╗Öp nhiß╗üu d├▓ng sß║ún phß║⌐m. `sheet_to_json` chß╗ë giß╗»
    // gi├í trß╗ï ├┤ ─æß║ºu, c├íc ├┤ d╞░ß╗¢i rß╗ùng ΓåÆ fan-out gi├í trß╗ï xuß╗æng c├íc d├▓ng con ─æß╗â mß╗ùi
    // sß║ún phß║⌐m ─æß╗üu mang theo m├┤ tß║ú/ghi ch├║/t├¬n nh├│m (mß║½u NextGo: STT + T├¬n SP merge dß╗ìc).
    const wsMerges = Array.isArray(ws['!merges']) ? ws['!merges'] : [];
    const mergeFanOutCols = [];
    if (colMap.description !== undefined) mergeFanOutCols.push(colMap.description);
    if (colMap.notes !== undefined) mergeFanOutCols.push(colMap.notes);
    if (colMap.name !== undefined) mergeFanOutCols.push(colMap.name);
    if (colMap.stt !== undefined) mergeFanOutCols.push(colMap.stt);
    if (wsMerges.length && mergeFanOutCols.length) {
      let filledDesc = 0;
      for (const m of wsMerges) {
        if (!m || !m.s || !m.e) continue;
        if (m.s.r === m.e.r) continue; // chß╗ë xß╗¡ l├╜ merge dß╗ìc
        if (m.e.r <= headerIdx) continue; // bß╗Å qua merge ß╗ƒ v├╣ng header/kh├ích h├áng
        const col = m.s.c;
        if (!mergeFanOutCols.includes(col)) continue;
        const topRow = rows[m.s.r];
        if (!topRow) continue;
        const val = topRow[col];
        if (val === undefined || val === null || String(val).trim() === '') continue;
        for (let rr = Math.max(m.s.r + 1, headerIdx + 1); rr <= m.e.r; rr++) {
          if (!rows[rr]) continue;
          const cur = rows[rr][col];
          if (cur === undefined || cur === null || String(cur).trim() === '') {
            rows[rr][col] = val;
            filledDesc += 1;
          }
        }
      }
      if (filledDesc > 0) console.log('[parse-excel] merged-cell fan-out:', filledDesc, 'cell(s)');
    }

    // ΓöÇΓöÇ 2. Extract customer info ΓÇö parse each cell separately ΓöÇΓöÇ
    let customer_name = '', customer_phone = '', customer_address = '', kts_info = '', title = '';
    for (let i = 0; i < headerIdx; i++) {
      // Check each cell individually for better parsing
      for (let ci = 0; ci < (rows[i]?.length || 0); ci++) {
        const cell = String(rows[i][ci] || '').trim();
        if (!cell) continue;
        const cellUpper = cell.toUpperCase();

        // Skip company headers
        if (cellUpper.includes('C├öNG TY') || cellUpper.includes('HOTLINE') || cellUpper.includes('MST') || cellUpper.includes('WEBSITE') || cellUpper.includes('WWW.')) continue;

        // KT Phß╗Ñ tr├ích (detect before customer to avoid mixing).
        // "PHß╗ñ TR├üCH KD" (format Vß║ín Ph├║ Th├ánh) c┼⌐ng r╞íi v├áo nh├ính n├áy.
        if (cellUpper.includes('KT PHß╗ñ TR├üCH') || cellUpper.includes('Kß╗╕ THUß║¼T PHß╗ñ TR├üCH') ||
            cellUpper.includes('K─¿ THUß║¼T PHß╗ñ TR├üCH') || cellUpper.includes('NVKD') ||
            cellUpper.includes('PHß╗ñ TR├üCH KD')) {
          const match = cell.match(/[:;\-]\s*(.+)/);
          if (match) kts_info = match[1].replace(/[-ΓÇô]\s*(0\d{8,10})/, ' - $1').trim();
          else kts_info = cell;
          continue;
        }
        if (excelHeaderTextIsStaffContactContext(cellUpper)) {
          const match = cell.match(/[:;\-]\s*(.+)/);
          if (match) kts_info = match[1].replace(/[-ΓÇô]\s*(0\d{8,10})/, ' - $1').trim();
          else kts_info = cell;
          continue;
        }

        // Customer name ΓÇö label "Kh├ích h├áng:" / "T├¬n kh├ích h├áng;" (Vß║ín Ph├║ Th├ánh d├╣ng `;`)
        // NextGo: "K├¡nh gß╗¡i:" c┼⌐ng chß╗⌐a t├¬n kh├ích
        if (
          cellUpper.includes('KH├üCH H├ÇNG') || cellUpper.includes('KHACH HANG') ||
          cellUpper.includes('K├ìNH Gß╗¼I') || cellUpper.includes('KINH GUI')
        ) {
          const match = cell.match(/[:;\-]\s*(.+)/);
          if (match) {
            let namePart = match[1].trim();
            // Bß╗Å ─æoß║ín NVKD / phß╗Ñ tr├ích / ΓÇª (tr├ính lß║Ñy S─ÉT nh├ón vi├¬n l├ám S─ÉT kh├ích)
            namePart = namePart.replace(
              /\s*(;|,|[-ΓÇô])\s*(NVKD|NV\s*KD|PHß╗ñ\s*TR├üCH\s*KD|PHß╗ñ\s*TR├üCH\s*(NV|KINH\s*DOANH)|KT\s*(PHß╗ñ\s*TR├üCH)?|K─¿?\s*THUß║¼T|NG╞»ß╗£I\s*PHß╗ñ\s*TR├üCH|LI├èN\s*Hß╗å\s*NV)\s*[:;]?\s*.*$/i,
              '',
            ).trim();
            // Remove KT info if embedded
            namePart = namePart.replace(/\s*[-ΓÇô]?\s*(K─⌐|Kß╗╣|KT)\s*(Thuß║¡t|thuß║¡t)?\s*(Phß╗Ñ|phß╗Ñ)\s*(Tr├ích|tr├ích)\s*[:]\s*.*/i, '').trim();
            // Extract phone from name
            const phoneMatch = namePart.match(/(0\d{8,10})/);
            if (phoneMatch) {
              customer_phone = phoneMatch[1];
              customer_name = namePart.replace(phoneMatch[0], '').replace(/[-ΓÇô\s]+$/, '').trim();
            } else {
              customer_name = namePart;
            }
          }
          continue;
        }

        // Address
        if (cellUpper.includes('─Éß╗èA CHß╗ê') || cellUpper.includes('─ÉC:')) {
          const match = cell.match(/[:;\-]\s*(.+)/);
          if (match) {
            let addr = match[1].trim();
            // Remove phone if embedded in address
            addr = addr.replace(/\s*(S─ÉT|SDT|─ÉT)\s*[:;]\s*0\d{8,10}/i, '').trim();
            customer_address = addr;
          }
          continue;
        }

        // S─ÉT standalone cell ΓÇö chß╗ë g├ín kh├ích khi nh├ún kh├┤ng phß║úi S─ÉT NVKD / phß╗Ñ tr├íchΓÇª
        if (cellUpper.includes('S─ÉT') || cellUpper.includes('SDT') || cellUpper.includes('─ÉT:')) {
          const phoneMatch = cell.match(/(0\d{8,10})/);
          if (phoneMatch) {
            if (excelHeaderTextIsStaffContactContext(cellUpper)) {
              const tail = cell.replace(/^\s*(Sß╗É\s*─ÉIß╗åN\s*THOß║áI|S─ÉT|SDT|─ÉT)\s*[:;]?\s*/i, '').trim();
              if (kts_info && !kts_info.includes(phoneMatch[1])) kts_info += ` ΓÇö ${tail || phoneMatch[1]}`;
              else if (!kts_info) kts_info = tail || phoneMatch[1];
            } else if (!customer_phone) {
              customer_phone = phoneMatch[1];
            } else if (phoneMatch[1] !== customer_phone && !kts_info.includes(phoneMatch[1])) {
              if (kts_info) kts_info += ` ΓÇö ${phoneMatch[1]}`;
              else kts_info = phoneMatch[1];
            }
          }
          continue;
        }

        // Phone in cell (not company phone) ΓÇö nß║┐u c├╣ng d├▓ng c├│ nh├ún NVKD/Phß╗Ñ tr├ích th├¼ gß║»n v├áo KT/NVKD
        if (/^0\d{8,10}$/.test(cell)) {
          if (!customer_phone && excelRowLooksLikeStaffPhoneContext(rows[i])) {
            if (kts_info && !kts_info.includes(cell)) kts_info += ` ΓÇö ${cell}`;
            else if (!kts_info) kts_info = cell;
          } else if (!customer_phone) {
            customer_phone = cell;
          }
          continue;
        }

        // Title (B├üO GI├ü...)
        if (cellUpper.includes('B├üO GI├ü') && !title) {
          title = cell;
          continue;
        }
      }
    }

    // ΓöÇΓöÇ 3. Parse items ΓÇö stop at GHI CH├Ü / notes section ΓöÇΓöÇ
    const items = [];
    let currentGroup = '';
    let currentProductName = ''; // NextGo: t├¬n SP merge dß╗ìc ΓÇö d├▓ng con kß║┐ thß╗½a
    let lastProductDesc = ''; // NextGo: quy c├ích ß╗ƒ d├▓ng ─æß║ºu, c├íc d├▓ng SL kh├íc kß║┐ thß╗½a
    let currentGroupDiscount = 0; // CK% tß╗½ header nh├│m
    let summaryRows = []; // collect all Tß╗öNG/CK rows
    let reachedNotes = false;
    let notesText = [];

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every(c => !c && c !== 0)) continue;

      // ΓöÇΓöÇ Mini-header lß║╖p lß║íi trong body (vd. format Vß║ín Ph├║ Th├ánh: row 17 cho section II,
      // row 23 cho section III c├│ "M├â H├ÇNG / Sß╗æ L╞░ß╗úng"). Strategy:
      //   1) override c├íc role trong newCm,
      //   2) clear bß║Ñt kß╗│ role c┼⌐ n├áo ─æang trß╗Å v├áo col index ─æ├ú ─æ╞░ß╗úc newCm g├ín role kh├íc
      //      (vd. section III col E = "Sß╗æ L╞░ß╗úng" ΓåÆ role length c┼⌐ ß╗ƒ col 4 phß║úi bß╗ï xo├í).
      if (excelLooksLikeHeaderRow(row)) {
        const { cm: newCm, subAdvance: newSub } = buildColMap(row, rows[i + 1] || []);
        const merged = { ...colMap, ...newCm };
        const newColsByIdx = {};
        for (const [role, idx] of Object.entries(newCm)) {
          if (typeof idx === 'number') newColsByIdx[idx] = role;
        }
        for (const role of Object.keys(merged)) {
          const idx = merged[role];
          if (typeof idx === 'number' && newColsByIdx[idx] && newColsByIdx[idx] !== role) {
            delete merged[role];
          }
        }
        colMap = merged;
        if (newSub) i += 1;
        console.log('[parse-excel] re-detected mini-header at row', i, 'colMap:', JSON.stringify(colMap));
        continue;
      }

      const stt = colMap.stt !== undefined ? String(row[colMap.stt] || '').trim() : '';
      const nameRaw = colMap.name !== undefined ? String(row[colMap.name] || '').trim() : '';
      const skuRaw = colMap.sku !== undefined ? String(row[colMap.sku] || '').trim() : '';
      const descEarly = colMap.description !== undefined ? String(row[colMap.description] || '').trim() : '';
      if (nameRaw) {
        if (nameRaw !== currentProductName) lastProductDesc = '';
        currentProductName = nameRaw;
      }
      // Nß║┐u c├│ cß║ú M├â H├ÇNG + T├èN Sß║óN PHß║¿M (section III) ΓåÆ name = T├èN, prefix m├ú v├áo notes/description b├¬n d╞░ß╗¢i.
      const name = nameRaw || (isNextGoFormat && currentProductName ? currentProductName : '') || skuRaw;
      const nameUpper = name.toUpperCase();

      // Collect all text from this row
      const fullRowText = row.map(c => String(c || '').trim()).filter(Boolean).join(' ');

      // Debug first 25 data rows
      if (i - headerIdx <= 25) {
        console.log(`[parse-excel] row ${i}: stt=[${stt}] name=[${name?.slice(0,30)}] cells=`, JSON.stringify(row.slice(0, 10)));
      }
      const fullRowUpper = fullRowText.toUpperCase();

      // Detect "GHI CH├Ü" / notes section ΓåÆ stop parsing items, collect notes
      const isNotesSection = nameUpper === 'GHI CH├Ü' || nameUpper.startsWith('GHI CH├Ü:') || 
        fullRowUpper === 'GHI CH├Ü' || stt.toUpperCase().startsWith('GHI CH├Ü') ||
        fullRowUpper.startsWith('GHI CH├Ü') || fullRowUpper.startsWith('L╞»U ├¥') ||
        fullRowUpper.startsWith('─ÉIß╗ÇU KHOß║óN') || fullRowUpper.startsWith('QUY ─Éß╗èNH');
      if (isNotesSection) {
        reachedNotes = true;
        // Include this row's text as first note line (if has content beyond "GHI CH├Ü")
        const noteContent = fullRowText.replace(/^GHI\s*CH├Ü:?\s*/i, '').trim();
        if (noteContent) notesText.push(noteContent);
        continue;
      }
      if (reachedNotes) {
        if (fullRowText) notesText.push(fullRowText);
        continue;
      }

      // ΓöÇΓöÇ IMPORTANT: Detect GROUP HEADERS before summary rows ΓöÇΓöÇ
      // Group headers like "II. PHß╗ñ KIß╗åN - CHIß║╛T KHß║ñU 35%" contain "CHIß║╛T KHß║ñU"
      // which would wrongly match summary detection. Check Roman numeral first.
      const sttUpper = stt.toUpperCase();
      const sttIsNumber = /^\d/.test(stt);
      const workingNameEarly = name || (!sttIsNumber && stt ? stt : '') || '';
      const isRomanGroupEarly = /^[IVX]+[\.\)\s]/.test(workingNameEarly) || /^[IVX]+[\.\)\s]/.test(fullRowText.trim());
      const hasUnitEarly = colMap.unit !== undefined && String(row[colMap.unit] || '').trim();
      const hasPriceEarly = parseExcelMoneyFromMappedColumn(row, colMap.unit_price) > 0;

      if (isRomanGroupEarly && !hasPriceEarly) {
        const groupName = workingNameEarly || fullRowText.trim();
        currentGroup = groupName;
        const ckMatch = groupName.match(/(?:CHIß║╛T\s*KHß║ñU|CK)\s*(\d+)\s*%/i);
        currentGroupDiscount = ckMatch ? parseFloat(ckMatch[1]) : 0;
        items.push({
          is_group: true, group_name: groupName, name: groupName,
          description: '', unit: '', quantity: 0, unit_price: 0, amount: 0,
          height: null, width: null, length: null, notes: '',
          group_discount_percent: currentGroupDiscount,
        });
        console.log('[parse-excel] GROUP:', groupName.slice(0, 50), 'CK:', currentGroupDiscount);
        continue;
      }

      // Detect summary rows: Tß╗öNG Tß╗ª, Tß╗öNG PHß╗ñ KIß╗åN, Tß╗öNG 2 Hß║áNG Mß╗ñC, CHIß║╛T KHß║ñU, Tß╗öNG SAU CK
      // Check both name column and full row text (summary rows often span merged cells)
      const isSummary = nameUpper.includes('Tß╗öNG') || nameUpper.includes('Cß╗ÿNG') ||
        nameUpper.includes('CHIß║╛T KHß║ñU') || nameUpper.includes('PHß║ªN Tß╗¬') ||
        fullRowUpper.includes('Tß╗öNG') || fullRowUpper.includes('CHIß║╛T KHß║ñU');
      // Summary rows: no STT number, OR STT contains summary text itself (merged cells)
      const sttIsSummary = sttUpper.includes('Tß╗öNG') || sttUpper.includes('CHIß║╛T KHß║ñU') || sttUpper.includes('PHß║ªN Tß╗ª') || sttUpper.includes('PHß║ªN Tß╗¬');
      if (isSummary && (!stt || sttIsSummary || !sttIsNumber)) {
        // Find amount: try amount column, then scan row for largest number
        let amt = colMap.amount !== undefined ? parseVietnameseMoney(row[colMap.amount]) : 0;
        if (amt === 0) {
          // Scan all cells for a number (summary amount might be in unexpected column)
          for (let ci = 0; ci < row.length; ci++) {
            const cellVal = parseVietnameseMoney(row[ci]);
            if (cellVal > 1000 && cellVal > amt) amt = cellVal;
          }
        }
        const summaryLabel = name || stt || fullRowText;
        summaryRows.push({ label: summaryLabel, amount: amt });
        console.log('[parse-excel] summary row:', { label: summaryLabel.slice(0,40), amt, stt, rawAmtCell: row[colMap.amount] });
        continue;
      }

      // ΓöÇΓöÇ D├▓ng Cß╗ìc / C├▓n lß║íi (khß╗æi tiß╗ün cuß╗æi b├ío gi├í ΓÇö c├│ thß╗â c├│ ┬½─É├â NHß║¼N┬╗ ß╗ƒ cß╗Öt phß╗Ñ) ΓöÇΓöÇ
      if (isExcelDepositOrRemainSummaryRow(name, stt, fullRowText)) {
        let amt = colMap.amount !== undefined ? parseVietnameseMoney(row[colMap.amount]) : 0;
        if (amt === 0) {
          for (let ci = 0; ci < row.length; ci++) {
            const cellVal = parseVietnameseMoney(row[ci]);
            if (cellVal >= 1000 && cellVal > amt) amt = cellVal;
          }
        }
        const summaryLabel = name || stt || fullRowText;
        const labelU = summaryLabel.toUpperCase();
        const rowKind = labelU.includes('C├ÆN Lß║áI') ? 'remaining' : 'deposit';
        const deposit_received = rowKind === 'deposit' ? parseExcelDepositReceivedFromRow(row) : null;
        summaryRows.push({
          label: summaryLabel,
          amount: amt,
          row_kind: rowKind,
          deposit_received,
        });
        console.log('[parse-excel] deposit/remain row:', {
          label: summaryLabel.slice(0, 48),
          amt,
          rowKind,
          deposit_received,
        });
        continue;
      }

      // Skip truly empty rows (no text at all)
      // Note: don't skip if name is empty but STT has text (merged cells)
      const effectiveName = name || (sttIsNumber ? '' : stt) || '';
      const rowUnitPrice = parseExcelMoneyFromMappedColumn(row, colMap.unit_price);
      const rowAmount = parseExcelMoneyFromMappedColumn(row, colMap.amount);
      if (!effectiveName && !name && !descEarly && rowUnitPrice <= 0 && rowAmount <= 0) continue;

      // Detect group title: has name but no STT number AND no unit_price
      const sttNum = parseInt(stt);
      const hasUnit = colMap.unit !== undefined && String(row[colMap.unit] || '').trim();
      const hasPrice = rowUnitPrice > 0;
      const workingName = effectiveName || name;
      const isGroupRow = (isNaN(sttNum) || !stt || sttIsSummary) && !hasPrice && workingName.length > 5;

      // Also check Roman numeral pattern: I., II., III., IV. at start
      const isRomanGroup = /^[IVX]+[\.\)\s]/.test(workingName);

      if ((isGroupRow && !hasUnit) || isRomanGroup) {
        currentGroup = workingName;
        // Parse chiß║┐t khß║Ñu % tß╗½ header nh├│m: "PHß╗ñ KIß╗åN Bß║╛P (CHIß║╛T KHß║ñU 35%)" hoß║╖c "CK 35%"
        const ckMatch = workingName.match(/(?:CHIß║╛T\s*KHß║ñU|CK)\s*(\d+)\s*%/i);
        currentGroupDiscount = ckMatch ? parseFloat(ckMatch[1]) : 0;
        items.push({
          is_group: true, group_name: workingName, name: workingName,
          description: '', unit: '', quantity: 0, unit_price: 0, amount: 0,
          height: null, width: null, length: null, notes: '',
          group_discount_percent: currentGroupDiscount,
        });
        continue;
      }

      // Normal item row ΓÇö must have unit_price or amount
      if (!hasPrice && rowAmount <= 0) continue;

      // Detect "Hß╗û TRß╗ó" / "MIß╗äN PH├ì" / "Tß║╢NG" in amount column ΓåÆ freebie item (CK 100%)
      const rawAmountCell = colMap.amount !== undefined ? String(row[colMap.amount] || '').trim() : '';
      const parsedAmount = rowAmount;
      const isFreebieText = /Hß╗û\s*TRß╗ó|MIß╗äN\s*PH├ì|Tß║╢NG|FREE|KM|KHUYß║╛N/i.test(rawAmountCell);
      const isFreebie = isFreebieText && parsedAmount === 0;

      const descCell = colMap.description !== undefined ? String(row[colMap.description] || '').trim() : '';
      const notesCell = colMap.notes !== undefined ? String(row[colMap.notes] || '').trim() : '';
      if (descCell) lastProductDesc = descCell;
      const effectiveDescCell = descCell || (isNextGoFormat ? lastProductDesc : '');
      const itemName = name || (isNextGoFormat && effectiveDescCell ? currentProductName || effectiveDescCell.split('\n')[0].slice(0, 120) : '') || skuRaw;
      // Nß║┐u c├│ M├â H├ÇNG ri├¬ng (section III VPT): prefix v├áo description ─æß╗â khß╗Åi mß║Ñt th├┤ng tin.
      const skuPrefix = (skuRaw && skuRaw !== name) ? `[${skuRaw}] ` : '';
      const mergedDescription = [
        skuPrefix ? `${skuPrefix.trim()}` : '',
        effectiveDescCell,
        notesCell,
      ].filter(Boolean).join('\n\n');

      // % CHIß║╛T KHß║ñU per-row: hß╗ù trß╗ú "35%", "0.35", "0,35"
      let rowDiscount = 0;
      if (colMap.discount_percent !== undefined) {
        const raw = row[colMap.discount_percent];
        if (raw != null && raw !== '') {
          const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace('%', '').replace(',', '.'));
          if (!isNaN(n) && n > 0) rowDiscount = n <= 1 ? n * 100 : n;
        }
      }
      const effectiveGroupCK = rowDiscount > 0 ? rowDiscount : currentGroupDiscount;

      items.push({
        is_group: false,
        group_name: currentGroup,
        group_discount_percent: effectiveGroupCK,
        sku: skuRaw || null,
        name: itemName,
        description: mergedDescription,
        unit: colMap.unit !== undefined ? String(row[colMap.unit] || '').trim() : 'bß╗Ö',
        length: colMap.length !== undefined ? (parseVietnameseMeasure(row[colMap.length]) ?? null) : null,
        width: colMap.width !== undefined ? (parseVietnameseMeasure(row[colMap.width]) ?? null) : null,
        height: colMap.height !== undefined ? (parseVietnameseMeasure(row[colMap.height]) ?? null) : null,
        quantity: colMap.quantity !== undefined ? (parseVietnameseMeasure(row[colMap.quantity]) ?? 1) : 1,
        unit_price: rowUnitPrice,
        amount: parsedAmount,
        vat_rate: colMap.vat_rate !== undefined ? parseFloat(row[colMap.vat_rate]) || 0 : 0,
        notes: notesCell,
        is_freebie: isFreebie,
      });
    }

    // ΓöÇΓöÇ 4. Calculate totals from summary rows ΓöÇΓöÇ
    // Priority: "Tß╗öNG 2 Hß║áNG Mß╗ñC" or "Tß╗öNG SAU CHIß║╛T KHß║ñU" > last Tß╗öNG row
    let grandTotal = 0, subtotalBeforeDiscount = 0, discountAmount = 0;

    // Track group subtotals + discount amounts for CK% calculation
    // Strategy: assign Tß╗öNG/CK rows to groups in order (simpler than name matching)
    const groupTotals = {}; // { groupName: subtotal }
    const groupDiscounts = {}; // { groupName: discountAmount }
    const groupNamesOrdered = items.filter(i => i.is_group).map(g => g.name);
    const groupsWithoutHeaderCK = items.filter(i => i.is_group && !i.group_discount_percent).map(g => g.name);
    let nextTotalGroupIdx = 0;

    for (const sr of summaryRows) {
      const label = sr.label.toUpperCase();
      if (label.includes('Tß╗öNG') && label.includes('Hß║áNG Mß╗ñC')) {
        grandTotal = sr.amount; // "Tß╗öNG 2 Hß║áNG Mß╗ñC" = final total
      } else if (label.includes('SAU') && (label.includes('CHIß║╛T KHß║ñU') || label.includes('CK'))) {
        // "Tß╗öNG Tß╗ª SAU CHIß║╛T KHß║ñU" ΓÇö skip for group calc, use as grandTotal fallback
        if (!grandTotal) grandTotal = sr.amount;
      } else if (label.includes('CHIß║╛T KHß║ñU') || label.includes('PHß║ªN Tß╗¬') || label.includes('PHß║ªN Tß╗ª')) {
        discountAmount += sr.amount;
        // Assign discount to first group without header CK that doesn't have discount yet
        const target = groupsWithoutHeaderCK.find(gn => !groupDiscounts[gn]);
        if (target) groupDiscounts[target] = (groupDiscounts[target] || 0) + sr.amount;
      } else if (label.includes('Tß╗öNG')) {
        subtotalBeforeDiscount += sr.amount;
        // Assign to groups in file order
        if (nextTotalGroupIdx < groupNamesOrdered.length) {
          groupTotals[groupNamesOrdered[nextTotalGroupIdx]] = sr.amount;
          nextTotalGroupIdx++;
        }
      }
    }
    console.log('[parse-excel] summaryRows:', JSON.stringify(summaryRows.map(s => ({ l: s.label.slice(0,35), a: s.amount }))));
    console.log('[parse-excel] groupTotals:', JSON.stringify(groupTotals));
    console.log('[parse-excel] groupDiscounts:', JSON.stringify(groupDiscounts));

    // ΓöÇΓöÇ 5. Calculate CK% for groups that don't have it from header ΓöÇΓöÇ
    // E.g. "PHß║ªN Tß╗ª CHIß║╛T KHß║ñU 1,998,101" + "Tß╗öNG Tß╗ª 66,603,375" ΓåÆ CK% = 1998101/66603375 Γëê 3%
    // NOTE: CK from summary = applied to GROUP TOTAL (Th├ánh tiß╗ün items are BEFORE discount)
    //       CK from header = applied PER ITEM (Th├ánh tiß╗ün already includes discount)
    // ΓåÆ Mark differently: group_summary_discount_percent (not applied per-item in Th├ánh tiß╗ün)
    console.log('[parse-excel] groupTotals:', JSON.stringify(groupTotals));
    console.log('[parse-excel] groupDiscounts:', JSON.stringify(groupDiscounts));
    console.log('[parse-excel] groups:', items.filter(i => i.is_group).map(g => ({ name: g.name.slice(0,30), gdk: g.group_discount_percent })));
    for (const groupItem of items.filter(i => i.is_group && !i.group_discount_percent)) {
      const gTotal = groupTotals[groupItem.name];
      const gDiscount = groupDiscounts[groupItem.name];
      console.log('[parse-excel] checking group:', groupItem.name.slice(0,30), 'gTotal:', gTotal, 'gDiscount:', gDiscount);
      if (gTotal > 0 && gDiscount > 0) {
        const ckPercent = Math.round((gDiscount / gTotal) * 10000) / 100; // round 2 decimal
        groupItem.group_summary_discount_percent = ckPercent;
        // Apply to child items as summary-level discount (NOT already in Th├ánh tiß╗ün)
        let applied = 0;
        items.forEach(i => {
          if (!i.is_group && i.group_name === groupItem.name) {
            i.group_summary_discount_percent = ckPercent;
            applied++;
          }
        });
        console.log('[parse-excel] applied summaryCK', ckPercent, '% to', applied, 'items in group:', groupItem.name.slice(0,30));
      }
    }

    // If no grand total found, sum item amounts
    const itemsTotal = items.filter(i => !i.is_group).reduce((s, i) => s + (i.amount || i.quantity * i.unit_price), 0);
    if (!grandTotal) grandTotal = itemsTotal - discountAmount;
    if (!subtotalBeforeDiscount) subtotalBeforeDiscount = itemsTotal;

    let deposit_amount = null;
    let deposit_received = null;
    let deposit_label = '';
    let remaining_amount = null;
    let remaining_note = '';
    for (const sr of summaryRows) {
      if (sr.row_kind === 'deposit') {
        if (sr.amount > 0) deposit_amount = sr.amount;
        deposit_label = sr.label || deposit_label;
        if (sr.deposit_received === true || sr.deposit_received === false) deposit_received = sr.deposit_received;
      }
      if (sr.row_kind === 'remaining') {
        remaining_amount = sr.amount > 0 ? sr.amount : remaining_amount;
        remaining_note = sr.label || remaining_note;
      }
    }

    res.json({
      customer_name,
      customer_phone,
      customer_address,
      kts_info,
      title,
      items,
      notes: notesText.join('\n'),
      summary: {
        subtotal: subtotalBeforeDiscount,
        discount_amount: discountAmount,
        total: grandTotal,
        summary_rows: summaryRows,
        deposit_amount,
        deposit_received,
        deposit_label,
        remaining_amount,
        remaining_note,
      },
      columns_detected: colMap,
      header_row: headerIdx,
      total_rows: rows.length,
      excel_format: isNextGoFormat ? 'nextgo' : 'default',
    });
  } catch (e) {
    console.error('[parse-excel]', e);
    res.status(500).json({ error: 'Lß╗ùi ─æß╗ìc file Excel: ' + e.message });
  }
});

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// IMPORT EXCEL ΓåÆ Tß║áO B├üO GI├ü Tß╗¬ TASK (parse + tß║ío quotation + complete task + sync KH)
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
r.post('/leads/:id/tasks/:taskId/import-quotation-excel', excelUpload.single('file'), async (req, res) => {
  try {
    const { id: leadId, taskId } = req.params;
    if (!req.file) return res.status(400).json({ error: 'Ch╞░a chß╗ìn file' });

    // 1. Verify task exists and belongs to this lead
    const { data: task, error: taskErr } = await supabase.from('crm_tasks')
      .select('id, title, stage_slug, status, lead_id')
      .eq('id', taskId).eq('lead_id', leadId).single();
    if (taskErr || !task) return res.status(404).json({ error: 'Kh├┤ng t├¼m thß║Ñy nhiß╗çm vß╗Ñ' });

    // 2. Get lead info (customer_id, type) + parent linkage (─É╞ín 1/2/3)
    const { data: lead } = await supabase.from('crm_leads')
      .select('id, type, customer_id, title, project_id, estimated_value, parent_lead_id, code')
      .eq('id', leadId).single();
    if (!lead) return res.status(404).json({ error: 'Kh├┤ng t├¼m thß║Ñy lead/deal' });

    // Resolve "─æ╞ín theo ─æß╗út" context (nß║┐u ─æang import tß╗½ deal con cß╗ºa ─É╞ín 1/2/3)
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

    // 3. Parse Excel ΓÇö call internal parse logic
    const XLSX = require('xlsx');
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!rows.length) return res.status(400).json({ error: 'File rß╗ùng' });

    // Forward to parse-excel logic via internal HTTP call (reuse same endpoint)
    const parseRes = await new Promise((resolve, reject) => {
      const mockReq = { file: req.file, user: req.user };
      const mockRes = {
        _data: null, _status: 200,
        status(s) { this._status = s; return this; },
        json(d) { this._data = d; if (this._status >= 400) reject(new Error(d.error || 'Parse error')); else resolve(d); },
      };
      // We can't easily call the route handler directly, so use the API
      // Instead, just do a fetch to ourselves ΓÇö simpler: use axios/api
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

    if (!parseRes.items?.length) return res.status(400).json({ error: 'Kh├┤ng t├¼m thß║Ñy sß║ún phß║⌐m trong file Excel' });

    // 4. Build quotation payload from parsed data
    const items = parseRes.items.filter(i => !i.is_group).map(i => {
      const qty = i.quantity || 1;
      const price = i.unit_price || 0;
      const excelAmount = i.amount || 0;
      let specFactor = 0, itemDiscount = 0;

      if (i.is_freebie) {
        return { name: i.name, description: i.description || '', unit: i.unit || 'bß╗Ö', quantity: qty, unit_price: 0, spec_factor: 0, discount_percent: 0, vat_rate: 0, height: i.height || '', width: i.width || '', length: i.length || '', dimensions: [i.length, i.width, i.height].filter(Boolean).join(' x ') || '', group_name: i.group_name || '', notes: 'Hß╗û TRß╗ó' };
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

      return { name: i.name, description: i.description || '', unit: i.unit || 'bß╗Ö', quantity: qty, unit_price: price, spec_factor: specFactor, discount_percent: itemDiscount, vat_rate: i.vat_rate || 0, height: i.height || '', width: i.width || '', length: i.length || '', dimensions: [i.length, i.width, i.height].filter(Boolean).join(' x ') || '', group_name: i.group_name || '', notes: i.notes || '' };
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
    if (parseRes.kts_info) notesParts.push(`KT Phß╗Ñ tr├ích: ${parseRes.kts_info}`);
    if (parseRes.notes) notesParts.push(parseRes.notes);
    const sumImp = parseRes.summary;
    if (sumImp?.deposit_amount > 0) {
      const rsDep = sumImp.deposit_received === true ? '─É├ú nhß║¡n'
        : sumImp.deposit_received === false ? 'Ch╞░a nhß║¡n' : '';
      notesParts.push(
        `Cß╗ìc: ${formatMoney(sumImp.deposit_amount)}${rsDep ? ` ΓÇö ${rsDep}` : ''}${sumImp.deposit_label ? `\n${sumImp.deposit_label}` : ''}`,
      );
    }
    if (sumImp?.remaining_note || (sumImp?.remaining_amount != null && sumImp.remaining_amount > 0)) {
      notesParts.push(
        `C├▓n lß║íi: ${sumImp.remaining_note || 'ΓÇö'}${sumImp.remaining_amount > 0 ? ` (${formatMoney(sumImp.remaining_amount)})` : ''}`,
      );
    }
    notesParts.push(`≡ƒôï Import tß╗½ task: ${task.title}`);
    if (fulfillmentLabel) notesParts.push(`≡ƒº╛ Thuß╗Öc: ${fulfillmentLabel} (Deal/Lead: ${lead.code || lead.id})`);
    if (lead.parent_lead_id) notesParts.push(`≡ƒÄ» Deal/Lead gß╗æc: ${masterLeadId}`);

    // 4b. Li├¬n kß║┐t product_id theo t├¬n ΓÇö KH├öNG cß║¡p nhß║¡t gi├í, KH├öNG tß║ío mß╗¢i
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
        // Kh├┤ng t├¼m thß║Ñy ΓåÆ giß╗» nguy├¬n item, kh├┤ng tß║ío mß╗¢i
      }
      console.log('[TASK-IMPORT] Product link:', syncedProducts.length, 'items linked');
    } catch (e) { console.warn('[TASK-IMPORT] Product link error:', e.message); }

    // 5. L╞░u file Excel gß╗æc l├¬n storage (mß╗ƒ lß║íi tß╗½ chi tiß║┐t deal / b├ío gi├í)
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
      title: parseRes.title || req.file.originalname.replace(/\.(xlsx?|xls)$/i, '') || `B├ío gi├í ${customerName}`.trim(),
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
      payment_terms: 'Thanh to├ín 50% khi k├╜ H─É, 50% khi b├án giao',
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
        notes: (task.notes ? task.notes + '\n\n' : '') + `Γ£à ─É├ú tß║ío b├ío gi├í ${quote.code} (${formatMoney(quote.total)})\n≡ƒôÄ /crm/quotations/${quote.id}`,
        updated_at: new Date().toISOString(),
      }).eq('id', taskId);
    }

    // 7. Sync estimated_value v├áo lead
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
    res.status(500).json({ error: e.message || 'Lß╗ùi import Excel' });
  }
});

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
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

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// CRM TASKS ΓÇö C├┤ng viß╗çc cho Lead/Deal
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ

const CRM_TASK_SELECT =
  '*, assignee:users!crm_tasks_assignee_id_fkey(id,full_name,avatar), supervisor:users!crm_tasks_supervisor_id_fkey(id,full_name,avatar), pipeline_stage:crm_pipeline_stages!crm_tasks_pipeline_stage_id_fkey(id, pipeline_type, name, order_index)';

/**
 * Map task_id -> { files, notes } cho tab NV CRM (khß╗¢p logic c┼⌐: doc_type = task_note ΓåÆ note).
 * ╞»u ti├¬n RPC SQL (161) ─æß╗â tr├ính trß║ú vß╗ü qu├í nhiß╗üu d├▓ng attachment ΓåÆ statement timeout.
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
    /* RPC ch╞░a deploy: fallback */
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

/** Deal gß╗æc use_order_tasks: ghi nhiß╗çm vß╗Ñ mß╗¢i v├áo deal fulfillment cß╗ºa ─æ╞ín ─æß║ºu ti├¬n (khß╗¢p tab chi tiß║┐t deal). */
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
 * Deal gß╗æc (use_order_tasks): nhiß╗çm vß╗Ñ SX v├á mß╗Öt phß║ºn luß╗ông ─æ╞ín ─æ╞░ß╗úc ghi v├áo lead fulfillment (resolveCrmTaskWriteLeadId).
 * Lu├┤n gß╗Öp task tß╗½ c├íc lead con v├áo response khi xem deal cha ΓÇö tr├ính chß╗ë gß╗Öp khi deal cha ch╞░a c├│ task n├áo
 * (tr╞░ß╗¥ng hß╗úp cha c├│ deal_* nh╞░ng sx_* nß║▒m ß╗ƒ con ΓåÆ tr╞░ß╗¢c ─æ├óy tab SX / gen SX t╞░ß╗ƒng thiß║┐u nhiß╗çm vß╗Ñ).
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

    // ─Éß║┐m sß╗æ file + ghi ch├║ cho mß╗ùi task (RPC GROUP BY ΓÇö tr├ính timeout khi nhiß╗üu ─æ├¡nh k├¿m)
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

    // Ph├ón t├ích nhiß╗çm vß╗Ñ theo module:
    // - production: chß╗ë task SX (stage_slug bß║»t ─æß║ºu sx_)
    // - crm: ß║⌐n task SX
    if (taskScope === 'production') {
      data = (data || []).filter((t) => String(t.stage_slug || '').startsWith('sx_') || t.production_pipeline_stage_id);
      const workshopTypeId = String(req.query?.workshop_type_id || '').trim() || null;
      if (workshopTypeId) {
        const { getProductionPipelineStagesForWorkshopType, filterSxTasksToWorkshopPipeline } = require('../helpers/sxPipelineStageSlug');
        const companyId = lead?.company_id || null;
        const stages = await getProductionPipelineStagesForWorkshopType(companyId, workshopTypeId);
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
    } else if (taskScope === 'crm') {
      data = (data || []).filter((t) => !String(t.stage_slug || '').startsWith('sx_'));
    }

    const { filterCrmTasksByCompanyScope, sanitizeTasksForSharedWorkspace } = require('../helpers/crossCompanyWorkspace');
    const taskCompanyScope = String(req.query?.task_company_scope || 'own').toLowerCase();
    let ownerCompanyId = String(req.query?.owner_company_id || '').trim() || null;
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

    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Gen lß║íi nhiß╗çm vß╗Ñ CRM theo bß╗Ö mß║½u pipeline (x├│a thß╗½a + ─æß╗ông bß╗Ö giai ─æoß║ín hiß╗çn tß║íi).
r.post('/leads/:id/tasks/resync-pipeline', async (req, res) => {
  try {
    const { data: leadRow } = await supabase
      .from('crm_leads')
      .select('id, company_id, region_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!leadRow) return res.status(404).json({ error: 'Lead/deal kh├┤ng tß╗ôn tß║íi' });

    const regionCheck = assertLeadReadableByRegionScope(req, leadRow);
    if (!regionCheck.ok) return res.status(403).json({ error: regionCheck.error });

    const result = await resyncCrmPipelineTasksForLead(req.params.id, req.user?.userId, req);
    if (!result.ok) return res.status(400).json(result);
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
// Idempotent: chß╗ë tß║ío task cho item ch╞░a tß╗ôn tß║íi trong c├╣ng (lead, stage) (so theo title).
// Tr├ính tr╞░ß╗¥ng hß╗úp user bß║Ñm "Gß║»n mß║½u" 2-3 lß║ºn ΓåÆ nh├ón tasks.
r.post('/leads/:id/tasks/from-template', async (req, res) => {
  try {
    const { template_id } = req.body;
    const { data: items } = await supabase.from('crm_task_template_items')
      .select('*').eq('template_id', template_id).order('order_index');
    if (!items?.length) return res.status(400).json({ error: 'Bß╗Ö mß║½u trß╗æng' });

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

    // 1) Dedupe trong ch├¡nh items cß╗ºa template (chß╗æng item bß╗ï th├¬m tr├╣ng do user)
    const seenItemKeys = new Set();
    const dedupItems = [];
    for (const item of items) {
      const k = String(item.title || '').trim().toLowerCase();
      if (!k || seenItemKeys.has(k)) continue;
      seenItemKeys.add(k);
      dedupItems.push(item);
    }

    // 2) Lß║Ñy danh s├ích title ─æ├ú tß╗ôn tß║íi tr├¬n lead n├áy trong c├╣ng stage ΓåÆ bß╗Å qua khi insert
    let existingTitleKeys = new Set();
    {
      let q = supabase
        .from('crm_tasks')
        .select('title, stage_slug, pipeline_stage_id')
        .eq('lead_id', targetLeadId);
      // Kho├í stage giß╗æng l├║c insert: ╞░u ti├¬n pipeline_stage_id, fallback stage_slug
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
        + `tpl=${template_id}: bß╗Å qua ${skipped}/${dedupItems.length} item ─æ├ú tß╗ôn tß║íi.`,
      );
    }

    if (!toInsert.length) {
      return res.status(200).json({
        tasks: [],
        count: 0,
        skipped,
        message: 'Bß╗Ö mß║½u ─æ├ú ─æ╞░ß╗úc ├íp tr╞░ß╗¢c ─æ├│ ΓÇö kh├┤ng c├│ nhiß╗çm vß╗Ñ mß╗¢i n├áo ─æ╞░ß╗úc th├¬m.',
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
    // DB ch╞░a apply migration 308 (cß╗Öt checklist) ΓåÆ bß╗Å checklist v├á thß╗¡ lß║íi.
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

// Gen nhiß╗çm vß╗Ñ pipeline SX (sx_*) tß╗½ workshop_task_templates ΓÇö ghi ─æ├║ng lead (deal con khi use_order_tasks).
r.post('/leads/:id/tasks/generate-production-template', async (req, res) => {
  try {
    const force = !!req.body?.force;
    const targetLeadId = await resolveCrmTaskWriteLeadId(req.params.id);
    const { data: lead } = await supabase
      .from('crm_leads')
      .select('id, type, company_id, assigned_to, lead_owner_id, sx_template_company_id')
      .eq('id', targetLeadId)
      .maybeSingle();
    if (!lead?.id) return res.status(404).json({ error: 'Kh├┤ng t├¼m thß║Ñy deal' });
    if (lead.type !== 'deal') return res.status(400).json({ error: 'Chß╗ë ├íp dß╗Ñng cho deal' });

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
      return res.status(400).json({ error: 'Deal ch╞░a c├│ c├┤ng ty ΓÇö kh├┤ng thß╗â gen nhiß╗çm vß╗Ñ SX theo c├┤ng ty.' });
    }
    if (r0?.reason === 'no_production_templates_for_deal_company') {
      return res.status(400).json({ error: 'Kh├┤ng c├│ bß╗Ö nhiß╗çm vß╗Ñ Sß║ún xuß║Ñt thuß╗Öc c├┤ng ty cß╗ºa deal. Vui l├▓ng tß║ío/bß║¡t bß╗Ö mß║½u ─æ├║ng c├┤ng ty rß╗ôi thß╗¡ lß║íi.' });
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
    res.status(500).json({ error: e.message || 'Lß╗ùi tß║ío nhiß╗çm vß╗Ñ SX' });
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
              error: 'Nhiß╗çm vß╗Ñ n├áy y├¬u cß║ºu chß╗ìn ┬½─É├ú ─æß╗º┬╗ trong ghi ch├║ nhanh tr╞░ß╗¢c khi ho├án th├ánh.',
              code: 'crm_task_completion_requires_evidence',
            });
          }
          const typed = await crmTaskMeetsRequiredFileTypes(supabase, req.params.taskId, prior);
          const detail = typed.missingLabel
            ? `Thiß║┐u loß║íi minh chß╗⌐ng: ${typed.missingLabel}.`
            : 'Cß║ºn ghi ch├║ kh├ích h├áng v├á/hoß║╖c file ─æ├¡nh k├¿m.';
          return res.status(400).json({
            error: `Nhiß╗çm vß╗Ñ n├áy y├¬u cß║ºu minh chß╗⌐ng tr╞░ß╗¢c khi ho├án th├ánh. ${detail}`,
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

    // ≡ƒöö NOTIFICATION: Task CRM cß║¡p nhß║¡t
    try {
      if (b.status === 'completed') {
        // Notify lead owner khi task ho├án th├ánh
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
            'Γ£à NV CRM ho├án th├ánh',
            `"${data.title}" trong deal "${leadInfo?.title}" ─æ├ú ho├án th├ánh`,
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
              '≡ƒôî ─É╞░ß╗úc giao nhiß╗çm vß╗Ñ CRM',
              `Bß║ín ─æ╞░ß╗úc giao: "${data.title}"`,
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
              '≡ƒôî ─É╞░ß╗úc giao nhiß╗çm vß╗Ñ CRM',
              `Bß║ín ─æ╞░ß╗úc giao: "${data.title}"`,
              'crm_task', data.id);
          }
        }
      }
      // ≡ƒôà Notify khi set/thay ─æß╗òi deadline (lß╗ìc NV ─æ├║ng khß╗æi/khu vß╗▒c ΓÇö createNotification c├│ thß╗â chß║╖n loß║íi deadline)
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
            '≡ƒôà ─Éß║╖t ng├áy hß║╣n nhiß╗çm vß╗Ñ',
            `"${data.title}" ΓÇö ${leadInfo2?.code || ''} ${leadInfo2?.title || ''} ΓÇö hß║ín: ${new Date(b.deadline).toLocaleDateString('vi-VN')}`,
            'crm_lead', req.params.leadId);
        }
      }
    } catch (ne) { console.warn('[NOTIFY] crm_task_update:', ne.message); }

    // ┬½Chß╗æt sß║ún xuß║Ñt┬╗: ─æß║╖t ng├áy hß║╣n ΓåÆ ghi dß╗▒ kiß║┐n SX l├¬n deal + dß╗▒ ├ín, th├┤ng b├ío phß╗Ñ tr├ích x╞░ß╗ƒng
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
                '≡ƒôà Chß╗æt sß║ún xuß║Ñt ΓÇö ng├áy dß╗▒ kiß║┐n',
                `Deal ${leadRow?.code || ''} ${leadRow?.title || ''} ΓÇö Dß╗▒ kiß║┐n SX: ${dateOnly} (tß╗½ nhiß╗çm vß╗Ñ ┬½${data.title}┬╗) ┬╖ Dß╗▒ ├ín ${proj?.code || ''}`,
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
              title: '≡ƒôà Cß║¡p nhß║¡t dß╗▒ kiß║┐n sß║ún xuß║Ñt',
              description: `Tß╗½ nhiß╗çm vß╗Ñ CRM ┬½${data.title}┬╗: ng├áy hß║╣n ${dateOnly}`,
              created_by: req.user.userId,
            });
          } catch (_) {}
        } catch (sxDateErr) {
          console.warn('[crm_task] chß╗æt SX sync:', sxDateErr.message);
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

// Kh├┤i phß╗Ñc checklist tß╗½ mß║½u x╞░ß╗ƒng (khi bß╗ï ghi ─æ├¿ tß╗½ kh├┤ng gian chung)
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

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// TOGGLE SHARE TASK TO PROJECT (cho Khß╗æi kh├íc xem)
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ

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

// Toggle share cho tß╗½ng attachment ri├¬ng lß║╗
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

// GET shared CRM task notes for a project (d├╣ng tß╗½ ProjectDetail)
r.get('/project/:projectId/shared-notes', async (req, res) => {
  try {
    const {
      crmTaskVisibleForModuleAndUser,
      crmAttachmentVisibleForModuleAndUser,
    } = require('../helpers/documentShareScope');
    const forModule = String(req.query.for_module || '').toLowerCase().trim();
    const useMod = ['production', 'logistics', 'workshop'].includes(forModule) ? forModule : null;

    const { data: lead } = await supabase.from('crm_leads')
      .select('id').eq('project_id', req.params.projectId).single();
    if (!lead) return res.json([]);

    const { data: allTasks } = await supabase.from('crm_tasks')
      .select('id, title, notes, stage_slug, shared_to_project, allowed_share_modules, allowed_companies, allowed_departments, assignee:users!crm_tasks_assignee_id_fkey(id,full_name), updated_at')
      .eq('lead_id', lead.id)
      .order('order_index');

    const taskIds = (allTasks || []).map(t => t.id);
    let sharedAtts = [];
    if (taskIds.length) {
      const { data: atts } = await supabase.from('crm_task_attachments')
        .select('id, task_id, name, file_url, file_name, file_size, mime_type, notes, doc_type, created_by, shared_to_project, allowed_share_modules, allowed_companies, allowed_departments')
        .in('task_id', taskIds)
        .eq('shared_to_project', true);
      sharedAtts = (atts || []).filter((a) => (useMod
        ? crmAttachmentVisibleForModuleAndUser(a, useMod, req.user)
        : a.shared_to_project === true));
    }

    const result = (allTasks || [])
      .map((t) => {
        const taskShared = useMod
          ? crmTaskVisibleForModuleAndUser(t, useMod, req.user)
          : t.shared_to_project === true;
        const attachments = sharedAtts.filter((a) => a.task_id === t.id);
        return {
          ...t,
          notes: taskShared ? t.notes : null,
          attachments,
        };
      })
      .filter((t) => t.notes || t.attachments.length > 0);

    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// TASK NOTES & ATTACHMENTS
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ

// UPDATE task notes (quick text note on task itself) + sync ghi ch├║ ΓåÆ lead_documents
r.put('/leads/:leadId/tasks/:taskId/notes', async (req, res) => {
  try {
    const { notes } = req.body;
    const { data, error } = await supabase.from('crm_tasks')
      .update({ notes, updated_at: new Date().toISOString() })
      .eq('id', req.params.taskId)
      .select('id, title, notes, stage_slug').single();
    if (error) throw error;

    // Sync: upsert ghi ch├║ v├áo lead_documents
    // T├¼m attachment type "task_note" cho task n├áy
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
            .update({ notes, name: `≡ƒô¥ ${data.title}` })
            .eq('id', existingAtt.id);
          // Sync lead_document (project_id + cß╗¥ x╞░ß╗ƒng khß╗¢p tab T├ái liß╗çu / SX)
          await supabase.from('lead_documents')
            .update({
              notes,
              name: `[${data.title}] ≡ƒô¥ Ghi ch├║`,
              project_id: leadForSync?.project_id ?? null,
              ...getLeadDocumentFieldsFromCrmTask(data, taskDocOpts),
            })
            .eq('source_attachment_id', existingAtt.id);
        } else {
          // Create new attachment + document
          const noteShare = getDefaultCrmAttachmentShare(data, taskDocOpts);
          const { data: att } = await supabase.from('crm_task_attachments').insert({
            task_id: req.params.taskId, lead_id: req.params.leadId,
            name: `≡ƒô¥ ${data.title}`, doc_type: 'task_inline_note', notes,
            created_by: req.user.userId,
            ...noteShare,
          }).select().single();
          if (att) {
            await supabase.from('lead_documents').insert({
              lead_id: req.params.leadId, project_id: leadForSync?.project_id || null,
              name: `[${data.title}] ≡ƒô¥ Ghi ch├║`, doc_type: 'task_inline_note',
              notes, created_by: req.user.userId, source_attachment_id: att.id,
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
      console.warn('[task notes] syncΓåÆassignment:', syncErr.message);
    }

    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// UPDATE ghi ch├║ cho 1 mß╗Ñc checklist con + sync ΓåÆ lead_documents
r.put('/leads/:leadId/tasks/:taskId/checklist/:checklistId/notes', async (req, res) => {
  try {
    const { notes } = req.body;
    const ckId = String(req.params.checklistId);
    const { data: taskRow, error: tErr } = await supabase.from('crm_tasks')
      .select('id, title, stage_slug, checklist, shared_to_project, allowed_share_modules')
      .eq('id', req.params.taskId)
      .maybeSingle();
    if (tErr) throw tErr;
    if (!taskRow) return res.status(404).json({ error: 'Nhiß╗çm vß╗Ñ kh├┤ng tß╗ôn tß║íi' });

    const ckItem = findChecklistItem(taskRow, ckId);
    if (!ckItem) return res.status(404).json({ error: 'Mß╗Ñc checklist kh├┤ng tß╗ôn tß║íi' });

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
    const { data, error } = await supabase.from('crm_task_attachments')
      .select('*, creator:users!crm_task_attachments_created_by_fkey(id, full_name)')
      .eq('task_id', req.params.taskId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// BULK ADD attachments (nhiß╗üu files 1 request)
r.post('/leads/:leadId/tasks/:taskId/attachments/bulk', async (req, res) => {
  try {
    const items = req.body.items; // [{name, doc_type, file_url, file_name, file_size, mime_type}]
    if (!items?.length) return res.status(400).json({ error: 'Kh├┤ng c├│ file' });

    // Query task visibility 1 lß║ºn duy nhß║Ñt
    const { data: task } = await supabase.from('crm_tasks')
      .select('id, title, stage_slug, checklist, default_allowed_companies, default_allowed_departments, pipeline_stage:crm_pipeline_stages!crm_tasks_pipeline_stage_id_fkey(name)')
      .eq('id', req.params.taskId).single();
    const finalCompanies = task?.default_allowed_companies || null;
    const finalDepts = task?.default_allowed_departments || null;
    const checklistId = req.body.checklist_id ? String(req.body.checklist_id) : null;
    const ckItem = checklistId ? findChecklistItem(task, checklistId) : null;
    if (checklistId && !ckItem) return res.status(400).json({ error: 'Mß╗Ñc checklist kh├┤ng tß╗ôn tß║íi' });

    const { data: leadForShare } = await supabase.from('crm_leads')
      .select('project_id').eq('id', req.params.leadId).single();
    const bulkShareOpts = { linkToProject: !!leadForShare?.project_id };
    const defaultShare = getDefaultCrmAttachmentShare(task, bulkShareOpts);

    // Insert tß║Ñt cß║ú attachments 1 lß║ºn
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

    // Sync ΓåÆ lead_documents 1 lß║ºn
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
        console.warn('[bulk attach] syncΓåÆassignment:', syncErr.message);
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
    if (ckId && !ckItem) return res.status(400).json({ error: 'Mß╗Ñc checklist kh├┤ng tß╗ôn tß║íi' });
    const { data: leadForShare } = await supabase.from('crm_leads')
      .select('project_id').eq('id', req.params.leadId).single();
    const singleShareOpts = { linkToProject: !!leadForShare?.project_id };
    const singleDefaultShare = getDefaultCrmAttachmentShare(taskForShare, singleShareOpts);

    const insertRow = {
      task_id: req.params.taskId,
      lead_id: req.params.leadId,
      checklist_id: ckId,
      name: name || file_name || 'Ghi ch├║',
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

    // ΓöÇΓöÇ SYNC ΓåÆ lead_documents ΓöÇΓöÇ
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
      if (syncErr) console.warn('Sync attachmentΓåÆdocument:', syncErr.message);
    } catch (syncErr) { console.warn('Sync attachmentΓåÆdocument:', syncErr.message); }

    try {
      await syncTaskAttachmentToAssignment(data, req);
    } catch (syncErr) {
      console.warn('[attach] syncΓåÆassignment:', syncErr.message);
    }

    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE attachment + sync x├│a lead_document li├¬n kß║┐t
r.delete('/leads/:leadId/tasks/:taskId/attachments/:attId', async (req, res) => {
  try {
    const { data: attBefore } = await supabase.from('crm_task_attachments')
      .select('id, source_assignment_file_id')
      .eq('id', req.params.attId)
      .eq('task_id', req.params.taskId)
      .maybeSingle();

    // Snapshot v├áo Th├╣ng r├íc tr╞░ß╗¢c khi x├│a thß║¡t (trß╗½ khi permanent=true)
    if (req.query.permanent !== 'true') {
      try {
        const { snapshotTaskAttachment } = require('../helpers/trashSnapshot');
        const snapRes = await snapshotTaskAttachment(supabase, req.params.attId, req.user?.userId);
        if (!snapRes.ok) console.warn('[delete task attach] snapshot trash failed:', snapRes.error);
      } catch (e) {
        console.warn('[delete task attach] trash snapshot error:', e.message);
      }
    }
    // X├│a lead_document li├¬n kß║┐t tr╞░ß╗¢c (v├¼ c├│ FK ON DELETE SET NULL)
    await supabase.from('lead_documents').delete()
      .eq('source_attachment_id', req.params.attId);
    try {
      await deleteMirroredAssignmentFileForTaskAttachment(
        req.params.attId,
        attBefore?.source_assignment_file_id,
      );
    } catch (syncErr) {
      console.warn('[delete attach] syncΓåÆassignment:', syncErr.message);
    }
    // X├│a attachment
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
      .select('*, task:crm_tasks(id, title, stage_slug), creator:users!crm_task_attachments_created_by_fkey(id, full_name)')
      .eq('lead_id', req.params.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
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
    // Tham sß╗æ:
    //   ?pipeline_id=<uuid>  ΓåÆ trß║ú vß╗ü cß║ú bß╗Ö mß║½u thuß╗Öc pipeline ─æ├│ (pipeline_stage_id IN stages cß╗ºa pipeline)
    //                          V├Ç bß╗Ö mß║½u Global (pipeline_stage_id IS NULL).
    //   ?company_id=<uuid>   ΓåÆ mß╗ìi bß╗Ö mß║½u pipeline cß╗ºa c├┤ng ty (qua stages thuß╗Öc pipelines c├┤ng ty).
    //   ?scope=global        ΓåÆ chß╗ë trß║ú vß╗ü bß╗Ö mß║½u Global (pipeline_stage_id IS NULL).
    //   ?scope=pipeline      ΓåÆ chß╗ë trß║ú vß╗ü bß╗Ö mß║½u thuß╗Öc pipeline (pipeline_stage_id NOT NULL).
    //   (mß║╖c ─æß╗ïnh)           ΓåÆ trß║ú vß╗ü Tß║ñT Cß║ó (giß╗» t╞░╞íng th├¡ch frontend c┼⌐).
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
        // Pipeline kh├┤ng c├│ stage n├áo ΓåÆ chß╗ë trß║ú global
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
      // Fallback nß║┐u ch╞░a chß║íy migration 214 (column pipeline_stage_id ch╞░a c├│)
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
    // Slug hiß╗çu lß╗▒c: ╞░u ti├¬n slug user gß╗¡i; nß║┐u gß║»n v├áo pipeline_stage_id th├¼ derive tß╗½ stage thß║¡t.
    // Mß╗Ñc ─æ├¡ch: t╞░╞íng th├¡ch vß╗¢i DB ch╞░a chß║íy migration 215 (stage_slug NOT NULL).
    let effectiveStageSlug = b.stage_slug || null;

    if (b.pipeline_stage_id) {
      const { data: st } = await supabase
        .from('crm_pipeline_stages')
        .select('pipeline_type, name, id')
        .eq('id', b.pipeline_stage_id)
        .maybeSingle();
      if (st?.pipeline_type) autoType = st.pipeline_type;
      if (!effectiveStageSlug && st) {
        // Tß║ío 1 slug ngß║»n cho legacy column. Prefix tr├ính tr├╣ng vß╗¢i slug global c┼⌐.
        const baseName = (st.name || '').toString().toLowerCase().normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        const shortId = String(st.id || '').slice(0, 8);
        effectiveStageSlug = `pl_${baseName || 'stage'}_${shortId}`.slice(0, 60);
      }
    }
    // Nß║┐u vß║½n kh├┤ng c├│ slug (rß║Ñt hiß║┐m: kh├┤ng gß║»n pipeline_stage_id, c┼⌐ng kh├┤ng gß╗¡i slug)
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

    if (!pipelineId) return res.status(400).json({ error: 'Thiß║┐u pipeline_id' });

    const { data: pipelineRow, error: plErr } = await supabase
      .from('crm_pipelines')
      .select('id, company_id')
      .eq('id', pipelineId)
      .maybeSingle();
    if (plErr) throw plErr;
    if (!pipelineRow) return res.status(400).json({ error: 'Pipeline kh├┤ng tß╗ôn tß║íi' });

    const sac = scopedAdminCompanyId(req);
    if (!isCrmSystemAdminUser(req.user) && !isAdminLike(req.user)) {
      if (sac && pipelineRow.company_id && String(sac) !== String(pipelineRow.company_id)) {
        return res.status(403).json({ error: 'Pipeline kh├┤ng thuß╗Öc c├┤ng ty cß╗ºa bß║ín' });
      }
    }

    const { stageIds, templateIds: scopeTemplateIds } = await resolveCrmBundleTemplateScope(
      supabase,
      pipelineId,
      leadType,
    );
    if (!stageIds.length) {
      return res.status(400).json({ error: 'Pipeline kh├┤ng c├│ giai ─æoß║ín ph├╣ hß╗úp loß║íi Lead/Deal ─æ├ú chß╗ìn' });
    }

    // Chß╗ë bß╗Å mß║╖c ─æß╗ïnh c├íc bß╗Ö thuß╗Öc ─É├ÜNG pipeline + loß║íi Lead/Deal n├áy ΓÇö kh├┤ng ─æß╗Ñng pipeline kh├íc.
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
      return res.status(400).json({ error: 'Kh├┤ng c├│ bß╗Ö mß║½u n├áo ─æß╗â ─æß║╖t mß║╖c ─æß╗ïnh cho pipeline n├áy' });
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

    // Nß║┐u user chuyß╗ân sang gß║»n pipeline_stage_id v├á muß╗æn clear stage_slug ΓåÆ derive slug tß╗½ stage thß║¡t
    // (tr├ính vi phß║ím NOT NULL khi DB ch╞░a chß║íy migration 215).
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
        delete update.stage_slug; // kh├┤ng update g├¼ ─æß╗â giß╗» slug c┼⌐
      }
    } else if (update.stage_slug === null || update.stage_slug === '') {
      // Kh├┤ng cho ph├⌐p set NULL trß╗▒c tiß║┐p (vi phß║ím constraint), bß╗Å field n├áy
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

// ├üp dß╗Ñng bß╗Ö mß║½u CRM cho to├án bß╗Ö lead/deal thuß╗Öc mß╗ìi khu vß╗▒c cß╗ºa c├┤ng ty (theo pipeline).
r.post('/task-templates/apply-to-company-regions', async (req, res) => {
  try {
    const b = req.body || {};
    const companyId = b.company_id && String(b.company_id).trim();
    if (!companyId) return res.status(400).json({ error: 'Thiß║┐u company_id' });

    const sac = scopedAdminCompanyId(req);
    if (!isCrmSystemAdminUser(req.user) && !isAdminLike(req.user)) {
      if (!sac || String(sac) !== String(companyId)) {
        return res.status(403).json({ error: 'Chß╗ë admin c├┤ng ty hoß║╖c admin hß╗ç thß╗æng mß╗¢i ├íp dß╗Ñng bß╗Ö mß║½u cho to├án c├┤ng ty' });
      }
    }

    let pipelineId = b.pipeline_id && String(b.pipeline_id).trim();
    if (pipelineId) {
      const { data: pl } = await supabase
        .from('crm_pipelines')
        .select('id, company_id')
        .eq('id', pipelineId)
        .maybeSingle();
      if (!pl) return res.status(400).json({ error: 'Pipeline kh├┤ng tß╗ôn tß║íi' });
      if (pl.company_id && String(pl.company_id) !== String(companyId)) {
        return res.status(400).json({ error: 'Pipeline kh├┤ng thuß╗Öc c├┤ng ty ─æ├ú chß╗ìn' });
      }
    } else {
      pipelineId = await getDefaultPipelineIdForCompany(companyId);
    }
    if (!pipelineId) {
      return res.status(400).json({ error: 'C├┤ng ty ch╞░a c├│ pipeline CRM (chß╗ìn pipeline hoß║╖c tß║ío pipeline mß║╖c ─æß╗ïnh)' });
    }

    const regionIds = normalizeRegionIdList(b.region_ids);
    if (regionIds.length) {
      for (const rid of regionIds) {
        const chk = await assertRegionBelongsToCompany(supabase, companyId, rid);
        if (!chk.ok) return res.status(400).json({ error: chk.error || 'Khu vß╗▒c kh├┤ng hß╗úp lß╗ç' });
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
        error: 'Database ch╞░a c├│ cß╗Öt minh chß╗⌐ng (migration 315/316). Chß║íy database/315_task_required_evidence_file_types.sql tr├¬n Supabase rß╗ôi thß╗¡ lß║íi.',
        code: 'db_migration_required_evidence',
      });
    }
    if (error && isExecutorColumnError(error)) {
      return res.status(503).json({
        error: 'Database ch╞░a c├│ cß╗Öt giao viß╗çc ch├⌐o (migration 323). Chß║íy database/323_crm_task_template_executor_company.sql tr├¬n Supabase rß╗ôi thß╗¡ lß║íi.',
        code: 'db_migration_executor_company',
      });
    }
    if (error && isDefaultAssigneeIdsColumnError(error)) {
      return res.status(503).json({
        error: 'Database ch╞░a c├│ cß╗Öt default_assignee_ids (migration 331). Chß║íy database/331_template_item_default_assignee_ids.sql tr├¬n Supabase rß╗ôi thß╗¡ lß║íi.',
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
    ['title', 'description', 'priority', 'deadline_days', 'order_index', 'checklist', 'default_allowed_companies', 'default_allowed_departments', 'executor_company_id', 'completion_requires_file_or_note', 'required_evidence_file_types', 'completion_requires_customer_note', 'completion_requires_customer_contact', 'requires_quick_verdict', 'blocks_stage_advance', 'show_excel_quotation_upload'].forEach(f => {
      if (req.body[f] !== undefined) update[f] = req.body[f];
    });
    Object.assign(update, templateItemAssigneePatch(req.body));
    if (req.body.executor_company_id === '' || req.body.executor_company_id === null) {
      update.executor_company_id = null;
    }
    let { data, error } = await supabase.from('crm_task_template_items')
      .update(update).eq('id', req.params.itemId).select().single();
    if (error && /required_evidence_file_types|completion_requires_file_or_note|requires_quick_verdict/.test(error.message || '')) {
      return res.status(503).json({
        error: 'Database ch╞░a c├│ cß╗Öt minh chß╗⌐ng (migration 315/316). Chß║íy database/315_task_required_evidence_file_types.sql tr├¬n Supabase rß╗ôi thß╗¡ lß║íi.',
        code: 'db_migration_required_evidence',
      });
    }
    if (error && isExecutorColumnError(error)) {
      return res.status(503).json({
        error: 'Database ch╞░a c├│ cß╗Öt giao viß╗çc ch├⌐o (migration 323). Chß║íy database/323_crm_task_template_executor_company.sql tr├¬n Supabase rß╗ôi thß╗¡ lß║íi.',
        code: 'db_migration_executor_company',
      });
    }
    if (error && isDefaultAssigneeIdsColumnError(error)) {
      return res.status(503).json({
        error: 'Database ch╞░a c├│ cß╗Öt default_assignee_ids (migration 331). Chß║íy database/331_template_item_default_assignee_ids.sql tr├¬n Supabase rß╗ôi thß╗¡ lß║íi.',
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

// ΓòÉΓòÉΓòÉ AUTO-PROJECT CONFIG ΓòÉΓòÉΓòÉ
// GET ΓÇö load config
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

// PUT ΓÇö save config
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

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// AUTO CREATE PROJECT FROM DEAL (chß║íy ngß║ºm, kh├┤ng cß║ºn UI tß║ío dß╗▒ ├ín)
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
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

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// DEAL ΓåÆ SX: x├íc nhß║¡n thß╗º c├┤ng (sale + ng├áy kß║┐ hoß║ích), sau ─æ├│ mß╗¢i ─æß╗ông bß╗Ö CRM theo Kanban x╞░ß╗ƒng
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
r.post('/leads/:id/sx-handover', async (req, res) => {
  try {
    const leadId = req.params.id;
    const uid = req.user.userId;
    const { data: lead, error: leadErr } = await supabase.from('crm_leads')
      .select('id, type, project_id, assigned_to, lead_owner_id, sx_handover_at')
      .eq('id', leadId)
      .single();
    if (leadErr || !lead) return res.status(404).json({ error: 'Kh├┤ng t├¼m thß║Ñy' });
    if (lead.type !== 'deal') return res.status(400).json({ error: 'Chß╗ë ├íp dß╗Ñng cho deal' });
    if (!lead.project_id) return res.status(400).json({ error: 'Deal ch╞░a c├│ dß╗▒ ├ín ΓÇö h├úy tß║ío dß╗▒ ├ín tr╞░ß╗¢c' });
    if (lead.sx_handover_at) return res.status(400).json({ error: '─É├ú x├íc nhß║¡n b├án giao sß║ún xuß║Ñt' });

    const can = userSeesAllCrmDeals(req.user.role)
      || String(lead.assigned_to || '') === String(uid)
      || String(lead.lead_owner_id || '') === String(uid);
    if (!can) return res.status(403).json({ error: 'Bß║ín kh├┤ng c├│ quyß╗ün x├íc nhß║¡n b├án giao deal n├áy' });

    const b = req.body || {};
    if (!b.sale_acknowledged) return res.status(400).json({ error: 'Cß║ºn tick x├íc nhß║¡n Sale' });

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
          'Deal ch╞░a c├│ nhiß╗çm vß╗Ñ Sß║ún xuß║Ñt (tab C├┤ng viß╗çc). Chuyß╗ân deal sang cß╗Öt Sß║ún xuß║Ñt (chß╗ìn c├┤ng ty x╞░ß╗ƒng) ─æß╗â hß╗ç thß╗æng gß║»n bß╗Ö nhiß╗çm vß╗Ñ, hoß║╖c bß║Ñm Gen trong tab C├┤ng viß╗çc.',
        code: 'requires_sx_crm_tasks',
      });
    }
    const incompleteSx = sxTasks.filter((t) => t.status !== 'completed');
    if (incompleteSx.length) {
      return res.status(400).json({
        error: `C├▓n ${incompleteSx.length} nhiß╗çm vß╗Ñ Sß║ún xuß║Ñt (sx_*) ch╞░a ho├án th├ánh. Ho├án tß║Ñt 100% tr╞░ß╗¢c khi b├án giao.`,
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
        error: 'Nhß║¡p ─æß╗º: ng├áy dß╗▒ kiß║┐n thi c├┤ng (bß║»t ─æß║ºu c├┤ng tr├¼nh) v├á ng├áy dß╗▒ kiß║┐n sß║ún xuß║Ñt',
      });
    }
    if (pEnd && new Date(pEnd) < new Date(pStart)) {
      return res.status(400).json({ error: 'Ng├áy ho├án th├ánh SX phß║úi sau hoß║╖c c├╣ng ng├áy bß║»t ─æß║ºu SX' });
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
        title: 'Γ£à Sale x├íc nhß║¡n b├án giao Sß║ún xuß║Ñt',
        description: `Bß║»t ─æß║ºu c├┤ng tr├¼nh: ${cStart} ┬╖ Dß╗▒ kiß║┐n SX: ${pStart} ┬╖ Dß╗▒ kiß║┐n ho├án th├ánh SX: ${pEnd}`,
        created_by: uid,
      });
    } catch (_) {}

    // Auto-generate default workshop tasks for production (nhiß╗çm vß╗Ñ mß║½u x╞░ß╗ƒng)
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
      // Fallback: d├╣ng bß╗Ö mß║½u global nß║┐u c├┤ng ty ch╞░a c├│
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

    // Gen to├án bß╗Ö bß╗Ö mß║½u x╞░ß╗ƒng (khu SX) theo cß║Ñu h├¼nh /sx/task-templates (╞░u ti├¬n theo company ─æ├ú chß╗ìn).
    // Idempotent theo metadata.workshop_template_id n├¬n gß╗ìi nhiß╗üu lß║ºn vß║½n an to├án.
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

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// LEAD MEMBERS ΓÇö Th├ánh vi├¬n tham gia Lead/Deal
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ

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

// POST /leads/:id/members ΓÇö th├¬m th├ánh vi├¬n (1 hoß║╖c nhiß╗üu)
r.post('/leads/:id/members', async (req, res) => {
  try {
    const { user_id, role = 'member', members: batchMembers } = req.body;

    // Batch mode: members: [{ user_id, role }]
    const toAdd = batchMembers?.length
      ? batchMembers.map(m => ({ user_id: m.user_id, role: m.role || 'member' }))
      : user_id ? [{ user_id, role }] : [];

    if (!toAdd.length) return res.status(400).json({ error: 'Thiß║┐u user_id hoß║╖c members[]' });

    const { data: adder } = await supabase.from('users').select('full_name').eq('id', req.user.userId).single();
    const { data: leadInfo } = await supabase.from('crm_leads').select('code,title').eq('id', req.params.id).single();
    const leadLabel = leadInfo ? `${leadInfo.code || ''} ${leadInfo.title || ''}`.trim() : 'nh├│m trao ─æß╗òi';
    const results = [];

    for (const item of toAdd) {
      const { data, error } = await supabase.from('lead_members')
        .upsert({ lead_id: req.params.id, user_id: item.user_id, role: item.role, added_by: req.user.userId }, { onConflict: 'lead_id,user_id' })
        .select('*, user:users!lead_members_user_id_fkey(id, full_name, email, avatar, role)')
        .single();
      if (error) { console.error('Add member error:', error); continue; }
      results.push(data);

      const memberName = data?.user?.full_name || 'Th├ánh vi├¬n';
      const ROLE_LABELS = { member: 'Tham gia', supervisor: 'Gi├ím s├ít', responsible: 'Chß╗ïu tr├ích nhiß╗çm', viewer: 'Xem' };
      const roleLabel = ROLE_LABELS[item.role] || item.role;

      // System message
      await supabase.from('lead_messages').insert({
        lead_id: req.params.id, user_id: req.user.userId,
        content: `${adder?.full_name || 'Admin'} ─æ├ú th├¬m ${memberName} (${roleLabel}) v├áo nh├│m`,
        message_type: 'system', is_system: true,
      });

      // Notify added user
      await createNotification(req, item.user_id, 'lead_member_added', '≡ƒæÑ Bß║ín ─æ╞░ß╗úc th├¬m v├áo nh├│m',
        `${adder?.full_name || 'Admin'} ─æ├ú th├¬m bß║ín v├áo ${leadLabel} vß╗¢i vai tr├▓ ${roleLabel}`, 'lead', req.params.id,
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
        '≡ƒæÑ Th├ánh vi├¬n mß╗¢i', `${adder?.full_name || 'Admin'} ─æ├ú th├¬m ${names} v├áo ${leadLabel}`,
        'lead', req.params.id, { nav_tab: 'team' });
    }

    // Emit realtime
    const io = req.app.get('io');
    if (io) io.to(`lead:${req.params.id}`).emit('lead:member_added', results);

    res.json(results.length === 1 ? results[0] : results);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /leads/:id/assignments ΓÇö nhiß╗çm vß╗Ñ ┬½Giao viß╗çc CRM┬╗ gß║»n lead/deal n├áy
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

// POST /leads/:id/assignments ΓÇö giao viß╗çc CRM cho th├ánh vi├¬n tham gia lead/deal
r.post('/leads/:id/assignments', async (req, res) => {
  try {
    const leadId = req.params.id;
    const b = req.body || {};
    const rawIds = Array.isArray(b.assignee_ids) ? b.assignee_ids.filter(Boolean) : [];
    if (!rawIds.length) {
      return res.status(400).json({ error: 'Chß╗ìn ├¡t nhß║Ñt mß╗Öt th├ánh vi├¬n ─æß╗â giao viß╗çc' });
    }

    const { data: memRows } = await supabase
      .from('lead_members')
      .select('user_id')
      .eq('lead_id', leadId);
    const memberSet = new Set((memRows || []).map((m) => String(m.user_id)));
    const invalid = rawIds.filter((id) => !memberSet.has(String(id)));
    if (invalid.length) {
      return res.status(400).json({
        error: 'Chß╗ë g├ín nhiß╗çm vß╗Ñ cho nh├ón vi├¬n ─æang tham gia lead/deal n├áy',
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
        title: '≡ƒôï Bß║ín vß╗½a ─æ╞░ß╗úc giao nhiß╗çm vß╗Ñ CRM',
        message: `"${data.title}"${leadSuffix}${data.deadline ? ' ΓÇö hß║ín ' + new Date(data.deadline).toLocaleString('vi-VN') : ''}`,
        assignmentId: data.id,
        metadata: { lead_id: leadId, nav_path: '/crm/assignments', open: data.id },
      });
      try {
        const io = req.app.get('io');
        if (io) io.to(`user:${uid}`).emit('notification', notif || buildAssignmentNotificationInsert(uid, {
          type: 'crm_assignment_assigned',
          title: '≡ƒôï Bß║ín vß╗½a ─æ╞░ß╗úc giao nhiß╗çm vß╗Ñ CRM',
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

// DELETE /leads/:id/members/:userId ΓÇö x├│a th├ánh vi├¬n
r.delete('/leads/:id/members/:userId', async (req, res) => {
  try {
    // Lß║Ñy t├¬n ng╞░ß╗¥i bß╗ï x├│a
    const { data: removedUser } = await supabase.from('users').select('full_name').eq('id', req.params.userId).single();
    
    await supabase.from('lead_members')
      .delete().eq('lead_id', req.params.id).eq('user_id', req.params.userId);

    // Tin nhß║»n hß╗ç thß╗æng
    const { data: remover } = await supabase.from('users').select('full_name').eq('id', req.user.userId).single();
    await supabase.from('lead_messages').insert({
      lead_id: req.params.id, user_id: req.user.userId,
      content: `${remover?.full_name || 'Admin'} ─æ├ú x├│a ${removedUser?.full_name || 'th├ánh vi├¬n'} khß╗Åi nh├│m`,
      message_type: 'system', is_system: true,
    });

    const io = req.app.get('io');
    if (io) io.to(`lead:${req.params.id}`).emit('lead:member_removed', { user_id: req.params.userId });

    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// LEAD CHAT ΓÇö Trao ─æß╗òi realtime trong Lead/Deal
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ

/** JSON body (mobile axios) kh├┤ng ─æi qua multer ΓÇö tr├ính lß╗ùi Android khi gß╗¡i application/json */
const leadChatFilesMulter = multer({ dest: 'uploads/lead-chat/' }).array('files');
function leadChatJsonOrFiles(req, res, next) {
  const ct = String(req.headers['content-type'] || '').toLowerCase();
  if (ct.includes('application/json')) return next();
  return leadChatFilesMulter(req, res, next);
}

/**
 * Hydrate parent message cho lead chat (tin nhß║»n reply). Query ri├¬ng ─æß╗â tr├ính
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

// POST /leads/:id/chat ΓÇö gß╗¡i tin nhß║»n (text, file, image, video, audio)
r.post('/leads/:id/chat', leadChatJsonOrFiles, async (req, res) => {
  try {
    const uid = req.user?.userId ?? req.user?.id;
    if (!uid) return res.status(401).json({ error: 'Token kh├┤ng c├│ user id' });
    const { content, reply_to } = req.body;
    const files = req.files || [];
    const attachments = files.map(f => ({
      name: f.originalname,
      url: `/uploads/lead-chat/${f.filename}`,
      type: f.mimetype,
      size: f.size
    }));

    if (!content && !attachments.length) return res.status(400).json({ error: 'Thiß║┐u nß╗Öi dung' });

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

    // Notify c├íc th├ánh vi├¬n kh├íc (text message) ΓÇö bß║¡t bubble + status-bar tr├¬n mobile
    try {
      const { data: chatMembers } = await supabase.from('lead_members')
        .select('user_id')
        .eq('lead_id', req.params.id)
        .neq('user_id', String(uid));
      if (chatMembers?.length) {
        const senderName = data?.user?.full_name || 'Ai ─æ├│';
        const senderAvatar = data?.user?.avatar || '';
        const preview = (content || '').toString().slice(0, 200) || '[Tin nhß║»n]';
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
          `Tin nhß║»n mß╗¢i: ${senderName}`,
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

// POST /leads/:id/chat/upload ΓÇö upload file/image/video/audio
const chatUpload = multer({ storage: multer.diskStorage({
  destination: 'uploads/lead-chat/',
  filename: (_, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_'))
}), limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB max

r.post('/leads/:id/chat/upload', chatUpload.single('file'), async (req, res) => {
  try {
    const uid = req.user?.userId ?? req.user?.id;
    if (!uid) return res.status(401).json({ error: 'Token kh├┤ng c├│ user id' });
    if (!req.file) return res.status(400).json({ error: 'Kh├┤ng c├│ file' });
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

    // Notify c├íc th├ánh vi├¬n kh├íc (upload file c┼⌐ng cß║ºn th├┤ng b├ío)
    const { data: uploadMembers } = await supabase.from('lead_members')
      .select('user_id')
      .eq('lead_id', req.params.id)
      .neq('user_id', String(uid));
    if (uploadMembers?.length) {
      const senderName = data?.user?.full_name || 'Ai ─æ├│';
      const senderAvatar = data?.user?.avatar || '';
      const preview = message_type === 'image' ? '[≡ƒû╝∩╕Å H├¼nh ß║únh]' : message_type === 'video' ? '[≡ƒÄ¼ Video]' : message_type === 'audio' ? '[≡ƒÄÖ∩╕Å Ghi ├óm]' : `[≡ƒôÄ ${req.file.originalname || 'Tß╗çp'}]`;
      let leadName = '';
      try {
        const { data: leadRow } = await supabase.from('leads').select('name').eq('id', req.params.id).single();
        leadName = leadRow?.name || '';
      } catch { /* ignore */ }
      await notifyMultipleShared(req, uploadMembers.map(m => m.user_id), 'lead_chat',
        `Tin nhß║»n mß╗¢i: ${senderName}`, preview, 'lead', req.params.id, {
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

// POST /leads/:id/chat/:msgId/react ΓÇö th├¬m/x├│a cß║úm x├║c
r.post('/leads/:id/chat/:msgId/react', async (req, res) => {
  try {
    const { emoji } = req.body;
    if (!emoji) return res.status(400).json({ error: 'Thiß║┐u emoji' });
    // Toggle: nß║┐u ─æ├ú c├│ th├¼ x├│a, ch╞░a c├│ th├¼ th├¬m
    const { data: existing } = await supabase.from('lead_message_reactions')
      .select('id').eq('message_id', req.params.msgId).eq('user_id', req.user.userId).eq('emoji', emoji).single();
    if (existing) {
      await supabase.from('lead_message_reactions').delete().eq('id', existing.id);
    } else {
      await supabase.from('lead_message_reactions').insert({
        message_id: req.params.msgId, user_id: req.user.userId, emoji,
      });
    }
    // Reload reactions cho message n├áy
    const { data: reactions } = await supabase.from('lead_message_reactions')
      .select('*, user:users(id, full_name)').eq('message_id', req.params.msgId);
    const io = req.app.get('io');
    if (io) io.to(`lead:${req.params.id}`).emit('lead:reactions', { message_id: req.params.msgId, reactions });
    res.json({ reactions });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /leads/:id/chat/:msgId/pin ΓÇö ghim/bß╗Å ghim
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

// GET /leads/:id/chat/pinned ΓÇö danh s├ích tin ghim
r.get('/leads/:id/chat/pinned', async (req, res) => {
  try {
    const { data } = await supabase.from('lead_messages')
      .select('*, user:users(id, full_name, avatar)')
      .eq('lead_id', req.params.id).eq('is_pinned', true)
      .order('created_at', { ascending: false });
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// CSKH FOLLOW-UP CARE NOTIFICATIONS
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ

const FOLLOWUP_TIME_BUCKETS = [
  { key: 'w1', label: '7ΓÇô13 ng├áy tr╞░ß╗¢c', daysFrom: 13, daysTo: 7 },
  { key: 'w2', label: '14ΓÇô20 ng├áy tr╞░ß╗¢c', daysFrom: 20, daysTo: 14 },
  { key: 'w3', label: '21ΓÇô27 ng├áy tr╞░ß╗¢c', daysFrom: 27, daysTo: 21 },
  { key: 'w4', label: '28ΓÇô34 ng├áy tr╞░ß╗¢c', daysFrom: 34, daysTo: 28 },
];

/** Hß║┐t hß║ín dismissal v├áo 23:59:59 h├┤m nay (giß╗¥ VN, UTC+7). */
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

    // Lß║Ñy danh s├ích lead user ─æ├ú ─æ├ính dß║Ñu "─æ├ú ch─âm s├│c" (ch╞░a hß║┐t hß║ín) ΓåÆ loß║íi khß╗Åi count.
    let caredLeadIds = new Set();
    try {
      const { data: marks } = await supabase
        .from('crm_lead_care_marks')
        .select('lead_id')
        .eq('user_id', userId)
        .gt('expires_at', new Date().toISOString());
      caredLeadIds = new Set((marks || []).map((m) => m.lead_id));
    } catch { /* bß║úng ch╞░a migrate ΓÇö bß╗Å qua */ }

    const countsMap = {};
    /** L╞░u type ch├¡nh x├íc cß╗ºa tß╗½ng (pipeline_id|stage_id) ΓÇö lß║Ñy tß╗½ ch├¡nh lead, ─æ├íng tin cß║¡y h╞ín cß╗Öt pipeline_type cß╗ºa stage. */
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
    res.status(500).json({ error: e.message || 'Lß╗ùi server' });
  }
});

r.post('/followup-care/dismiss', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { pipeline_id, stage_id, company_id, time_bucket } = req.body;
    if (!time_bucket) return res.status(400).json({ error: 'Thiß║┐u time_bucket' });

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
          error: 'Bß║úng crm_followup_care_dismissals ch╞░a tß║ío. Chß║íy file database/153_crm_followup_care_dismissals.sql trong Supabase SQL Editor.',
        });
      }
      throw error;
    }
    res.json({ ok: true, dismissal: data });
  } catch (e) {
    console.error('POST /crm/followup-care/dismiss:', e);
    res.status(500).json({ error: e.message || 'Lß╗ùi server' });
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
          error: 'Bß║úng crm_followup_care_dismissals ch╞░a tß║ío. Chß║íy file database/153_crm_followup_care_dismissals.sql trong Supabase SQL Editor.',
        });
      }
      throw error;
    }
    res.json({ ok: true, dismissed: rows.length });
  } catch (e) {
    console.error('POST /crm/followup-care/dismiss-all:', e);
    res.status(500).json({ error: e.message || 'Lß╗ùi server' });
  }
});

r.delete('/followup-care/dismiss', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { pipeline_id, stage_id, company_id, time_bucket } = req.query;
    if (!time_bucket) return res.status(400).json({ error: 'Thiß║┐u time_bucket' });

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
    res.status(500).json({ error: e.message || 'Lß╗ùi server' });
  }
});

// POST /crm/followup-care/dismiss/undo ΓÇö bß╗Å tß║Ñt cß║ú dismissal c├▓n hiß╗çu lß╗▒c cß╗ºa user (kh├┤i phß╗Ñc th├┤ng b├ío lß╗í t├¡ch nhß║ºm)
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
    res.status(500).json({ error: e.message || 'Lß╗ùi server' });
  }
});

// ΓòÉΓòÉΓòÉ ─É├ú ch─âm s├│c (per-lead) ΓòÉΓòÉΓòÉ
// GET /crm/lead-care-marks?lead_ids=a,b,c ΓåÆ trß║ú vß╗ü danh s├ích lead_id user ─æ├ú ─æ├ính dß║Ñu (ch╞░a hß║┐t hß║ín)
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
      // Bß║úng ch╞░a migrate ΓÇö trß║ú vß╗ü rß╗ùng ─æß╗â FE kh├┤ng vß╗í
      if (String(error.message || '').toLowerCase().includes('crm_lead_care_marks')) {
        return res.json({ marks: [] });
      }
      throw error;
    }
    res.json({ marks: data || [] });
  } catch (e) {
    console.error('GET /crm/lead-care-marks:', e);
    res.status(500).json({ error: e.message || 'Lß╗ùi server' });
  }
});

// POST /crm/leads/:id/care-mark ΓåÆ ─æ├ính dß║Ñu ─æ├ú ch─âm s├│c lead n├áy (30 ng├áy)
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
          error: 'Bß║úng crm_lead_care_marks ch╞░a ─æ╞░ß╗úc tß║ío. H├úy chß║íy migration database/157_crm_lead_care_marks.sql.',
        });
      }
      throw error;
    }
    res.json({ ok: true, mark: data });
  } catch (e) {
    console.error('POST /crm/leads/:id/care-mark:', e);
    res.status(500).json({ error: e.message || 'Lß╗ùi server' });
  }
});

// DELETE /crm/leads/:id/care-mark ΓåÆ bß╗Å dß║Ñu ch─âm s├│c
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
    res.status(500).json({ error: e.message || 'Lß╗ùi server' });
  }
});

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// PER-USER FLAGS: GHIM thß║╗ + tick XANH "─æ├ú t╞░╞íng t├íc" (crm_lead_user_flags)
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ

/** Helper: kiß╗âm tra user c├│ quyß╗ün xem lead tr╞░ß╗¢c khi flag (region scope). */
async function assertCanFlagLead(req, leadId) {
  const { data: lead, error } = await supabase
    .from('crm_leads')
    .select('id, region_id, company_id')
    .eq('id', leadId)
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: error.message };
  if (!lead) return { ok: false, status: 404, error: 'Kh├┤ng t├¼m thß║Ñy lead/deal' };
  const guard = assertLeadReadableByRegionScope(req, lead);
  if (!guard.ok) return { ok: false, status: 403, error: guard.error };
  return { ok: true };
}

/** POST /crm/leads/:id/pin ΓÇö ghim thß║╗ l├¬n ─æß║ºu (per-user). */
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
      return res.status(503).json({ error: 'Bß║úng crm_lead_user_flags ch╞░a ─æ╞░ß╗úc tß║ío. Chß║íy database/202_crm_lead_user_flags.sql.' });
    }
    console.error('POST /crm/leads/:id/pin:', e);
    res.status(500).json({ error: e.message || 'Lß╗ùi server' });
  }
});

/** DELETE /crm/leads/:id/pin ΓÇö bß╗Å ghim. */
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
      return res.status(503).json({ error: 'Bß║úng crm_lead_user_flags ch╞░a ─æ╞░ß╗úc tß║ío. Chß║íy database/202_crm_lead_user_flags.sql.' });
    }
    console.error('DELETE /crm/leads/:id/pin:', e);
    res.status(500).json({ error: e.message || 'Lß╗ùi server' });
  }
});

/** POST /crm/leads/:id/interacted ΓÇö bß║¡t tick xanh "─æ├ú t╞░╞íng t├íc". */
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
      return res.status(503).json({ error: 'Bß║úng crm_lead_user_flags ch╞░a ─æ╞░ß╗úc tß║ío. Chß║íy database/202_crm_lead_user_flags.sql.' });
    }
    console.error('POST /crm/leads/:id/interacted:', e);
    res.status(500).json({ error: e.message || 'Lß╗ùi server' });
  }
});

/** DELETE /crm/leads/:id/interacted ΓÇö tß║»t tick xanh. */
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
      return res.status(503).json({ error: 'Bß║úng crm_lead_user_flags ch╞░a ─æ╞░ß╗úc tß║ío. Chß║íy database/202_crm_lead_user_flags.sql.' });
    }
    console.error('DELETE /crm/leads/:id/interacted:', e);
    res.status(500).json({ error: e.message || 'Lß╗ùi server' });
  }
});

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// CRM DEADLINE CONFIG (theo c├┤ng ty) ΓÇö phß╗Ñc vß╗Ñ view "Deadline"
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ

const DEFAULT_DEADLINE_BUCKETS = {
  overdue:     { enabled: true, label: 'Qu├í hß║ín' },
  today:       { enabled: true, label: 'H├┤m nay' },
  this_week:   { enabled: true, label: 'Tuß║ºn n├áy' },
  next_week:   { enabled: true, label: 'Tuß║ºn sau' },
  in_2_weeks:  { enabled: true, label: 'Trong 2 tuß║ºn', days: 14 },
  in_3_weeks:  { enabled: true, label: 'Trong 3 tuß║ºn', days: 21 },
  in_4_weeks:  { enabled: true, label: 'Trong 4 tuß║ºn', days: 28 },
  in_1_month:  { enabled: true, label: 'Trong 1 th├íng', days: 30 },
  next_month:  { enabled: true, label: 'Th├íng sau' },
  no_deadline: { enabled: true, label: 'Kh├┤ng hß║ín' },
};

const ALLOWED_DEADLINE_FIELDS = new Set(['expected_close_date', 'crm_next_open_task_deadline']);

function buildDefaultDeadlineConfig(companyId) {
  return {
    company_id: companyId || null,
    primary_field: 'crm_next_open_task_deadline',
    fallback_field: 'expected_close_date',
    buckets: { ...DEFAULT_DEADLINE_BUCKETS },
    updated_at: null,
  };
}

// GET /crm/settings/deadline-config?company_id=ΓÇª ΓåÆ cß║Ñu h├¼nh deadline; trß║ú mß║╖c ─æß╗ïnh nß║┐u ch╞░a c├│.
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
    res.status(500).json({ error: e.message || 'Lß╗ùi server' });
  }
});

// PUT /crm/settings/deadline-config ΓåÆ upsert. Chß╗ë admin c├┤ng ty hoß║╖c system admin.
r.put('/settings/deadline-config', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const body = req.body || {};
    const companyId = String(body.company_id || req.user?.company_id || '').trim();
    if (!companyId) return res.status(400).json({ error: 'company_id bß║»t buß╗Öc' });

    const role = req.user?.role;
    const isSysAdmin = isCrmSystemAdminUser(role);
    const isCompanyAdmin = isCrmCompanyAdminUser(role);
    if (!isSysAdmin && !(isCompanyAdmin && String(req.user?.company_id || '') === companyId)) {
      return res.status(403).json({ error: 'Kh├┤ng c├│ quyß╗ün chß╗ënh cß║Ñu h├¼nh c├┤ng ty n├áy' });
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
          error: 'Bß║úng crm_company_deadline_config ch╞░a ─æ╞░ß╗úc tß║ío. H├úy chß║íy migration database/169_crm_company_deadline_config.sql.',
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
    res.status(500).json({ error: e.message || 'Lß╗ùi server' });
  }
});

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// CRM PLANNER C├ü NH├éN ΓÇö user tß╗▒ tß║ío cß╗Öt & k├⌐o-thß║ú lead/deal v├áo
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ

function plannerTableMissing(error) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('crm_user_planner_columns') || msg.includes('crm_user_planner_items');
}

// GET /crm/planner/me ΓåÆ to├án bß╗Ö columns + items cß╗ºa user hiß╗çn tß║íi
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
    res.status(500).json({ error: e.message || 'Lß╗ùi server' });
  }
});

// POST /crm/planner/columns ΓåÆ tß║ío cß╗Öt mß╗¢i
r.post('/planner/columns', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'T├¬n cß╗Öt bß║»t buß╗Öc' });
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
          error: 'Bß║úng planner ch╞░a ─æ╞░ß╗úc tß║ío. H├úy chß║íy migration database/170_crm_user_planner.sql.',
        });
      }
      throw error;
    }
    res.json(data);
  } catch (e) {
    console.error('POST /crm/planner/columns:', e);
    res.status(500).json({ error: e.message || 'Lß╗ùi server' });
  }
});

// PATCH /crm/planner/columns/:id ΓåÆ ─æß╗òi t├¬n / m├áu / vß╗ï tr├¡
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
    res.status(500).json({ error: e.message || 'Lß╗ùi server' });
  }
});

// DELETE /crm/planner/columns/:id ΓåÆ x├│a cß╗Öt (cascade x├│a items)
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
    res.status(500).json({ error: e.message || 'Lß╗ùi server' });
  }
});

// POST /crm/planner/columns/:id/items ΓåÆ th├¬m lead v├áo cß╗Öt (id cuß╗æi)
r.post('/planner/columns/:id/items', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const columnId = Number(req.params.id);
    const leadIds = Array.isArray(req.body?.lead_ids)
      ? req.body.lead_ids.map((v) => String(v || '').trim()).filter(Boolean)
      : (req.body?.lead_id ? [String(req.body.lead_id).trim()] : []);
    if (!leadIds.length) return res.status(400).json({ error: 'lead_id bß║»t buß╗Öc' });

    const { data: col } = await supabase
      .from('crm_user_planner_columns')
      .select('id')
      .eq('id', columnId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!col) return res.status(404).json({ error: 'Kh├┤ng t├¼m thß║Ñy cß╗Öt' });

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
    res.status(500).json({ error: e.message || 'Lß╗ùi server' });
  }
});

// POST /crm/planner/reorder ΓåÆ batch l╞░u thß╗⌐ tß╗▒ khi k├⌐o-thß║ú
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
    res.status(500).json({ error: e.message || 'Lß╗ùi server' });
  }
});

// DELETE /crm/planner/items/:id ΓåÆ bß╗Å lead khß╗Åi cß╗Öt
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
      return res.status(404).json({ error: 'Kh├┤ng t├¼m thß║Ñy' });
    }
    const { error } = await supabase
      .from('crm_user_planner_items')
      .delete()
      .eq('id', id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /crm/planner/items/:id:', e);
    res.status(500).json({ error: e.message || 'Lß╗ùi server' });
  }
});

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// CRM LEAD COMMENTS ΓÇö b├¼nh luß║¡n d├╣ng chung cho lead/deal
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ

/** Th├┤ng b├ío cho ng╞░ß╗¥i ─æ╞░ß╗úc @ trong b├¼nh luß║¡n lead/deal. */
async function notifyLeadCommentMentions(req, leadId, senderId, commentRow, mentionIds) {
  const ids = [...new Set((mentionIds || []).map(String).filter(Boolean))]
    .filter((id) => id !== String(senderId));
  if (!ids.length) return;

  const senderName = commentRow?.user?.full_name || req.user?.fullName || 'Ai ─æ├│';
  const senderAvatar = commentRow?.user?.avatar || '';
  let leadTitle = '';
  let leadCode = '';
  let leadType = 'lead';
  try {
    const { data: leadRow } = await supabase.from('crm_leads')
      .select('title, code, type')
      .eq('id', leadId)
      .maybeSingle();
    leadTitle = leadRow?.title || '';
    leadCode = leadRow?.code || '';
    leadType = leadRow?.type || 'lead';
  } catch { /* ignore */ }

  const rawBody = String(commentRow?.body || '').trim();
  const preview = rawBody.length > 160 ? `${rawBody.slice(0, 157)}ΓÇª` : rawBody;
  const label = leadTitle || leadCode || 'Lead/Deal';

  await notifyMultiple(
    req,
    ids,
    'comment_added',
    `${label} ┬╖ Nhß║»c bß║ín`,
    `${senderName} ─æ├ú nhß║»c bß║ín trong b├¼nh luß║¡n: ${preview}`,
    'lead',
    leadId,
    {
      nav_tab: 'comments',
      mentioned: true,
      sender_name: senderName,
      sender_avatar: senderAvatar,
      lead_title: leadTitle,
      lead_code: leadCode,
      lead_type: leadType,
      comment_id: commentRow?.id != null ? String(commentRow.id) : '',
    },
  );
}

function commentsTableMissing(error) {
  return String(error?.message || '').toLowerCase().includes('crm_lead_comments');
}

function reactionsTableMissing(error) {
  return String(error?.message || '').toLowerCase().includes('crm_lead_comment_reactions');
}

/** Emoji ─æ╞░ß╗úc ph├⌐p (thß║ú cß║úm x├║c) ΓÇö ─æß╗ông bß╗Ö vß╗¢i frontend CRM_COMMENT_REACTION_PICKER */
const CRM_COMMENT_ALLOWED_REACTION_EMOJI = new Set(['≡ƒæì', 'Γ¥ñ∩╕Å', '≡ƒÿé', '≡ƒÿ«', '≡ƒÿó', '≡ƒÖÅ']);

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

// GET /crm/leads/:id/comments ΓåÆ list b├¼nh luß║¡n cß╗ºa mß╗Öt lead
r.get('/leads/:id/comments', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const leadId = String(req.params.id || '').trim();
    const { data, error } = await supabase
      .from('crm_lead_comments')
      .select('id, lead_id, user_id, parent_id, body, created_at, updated_at, user:users!crm_lead_comments_user_id_fkey(id,full_name,avatar)')
      .eq('lead_id', leadId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
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
      reactions: rxMap.get(c.id) || { summary: [], mine: null },
    }));
    res.json(out);
  } catch (e) {
    console.error('GET /crm/leads/:id/comments:', e);
    res.status(500).json({ error: e.message || 'Lß╗ùi server' });
  }
});

// POST /crm/leads/:id/comments ΓåÆ th├¬m b├¼nh luß║¡n
r.post('/leads/:id/comments', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const leadId = String(req.params.id || '').trim();
    const body = String(req.body?.body || '').trim();
    if (!body) return res.status(400).json({ error: 'Nß╗Öi dung bß║»t buß╗Öc' });

    let parentId = null;
    const parentRaw = req.body?.parent_id;
    if (parentRaw != null && parentRaw !== '') {
      const n = Number(parentRaw);
      if (!Number.isFinite(n) || n <= 0) return res.status(400).json({ error: 'parent_id kh├┤ng hß╗úp lß╗ç' });
      const { data: parentRow, error: pErr } = await supabase
        .from('crm_lead_comments')
        .select('id, lead_id')
        .eq('id', n)
        .is('deleted_at', null)
        .maybeSingle();
      if (pErr) throw pErr;
      if (!parentRow) return res.status(400).json({ error: 'B├¼nh luß║¡n cß║ºn trß║ú lß╗¥i kh├┤ng tß╗ôn tß║íi' });
      if (String(parentRow.lead_id) !== leadId) return res.status(400).json({ error: 'Kh├┤ng tr├╣ng lead/deal' });
      parentId = n;
    }

    const { data, error } = await supabase
      .from('crm_lead_comments')
      .insert({ lead_id: leadId, user_id: userId, body, parent_id: parentId })
      .select('id, lead_id, user_id, parent_id, body, created_at, updated_at, user:users!crm_lead_comments_user_id_fkey(id,full_name,avatar)')
      .single();
    if (error) {
      if (commentsTableMissing(error)) {
        return res.status(500).json({
          error: 'Bß║úng crm_lead_comments ch╞░a ─æ╞░ß╗úc tß║ío. H├úy chß║íy migration database/171_crm_lead_comments.sql.',
        });
      }
      throw error;
    }
    const row = { ...data, reactions: { summary: [], mine: null } };
    const io = req.app.get('io');
    if (io) io.to(`lead:${leadId}`).emit('lead:comment', { lead_id: leadId, action: 'created', comment: row });

    try {
      const leadMembers = await fetchLeadMentionMembers(supabase, leadId);
      const mentionIds = resolveLeadCommentMentionIds(req.body, body, leadMembers, userId);
      if (mentionIds.length) {
        await notifyLeadCommentMentions(req, leadId, userId, row, mentionIds);
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
    res.status(500).json({ error: e.message || 'Lß╗ùi server' });
  }
});

// PATCH /crm/lead-comments/:cid ΓåÆ sß╗¡a b├¼nh luß║¡n (chß╗ë chß╗º sß╗ƒ hß╗»u)
r.patch('/lead-comments/:cid', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const cid = Number(req.params.cid);
    const body = String(req.body?.body || '').trim();
    if (!body) return res.status(400).json({ error: 'Nß╗Öi dung bß║»t buß╗Öc' });
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
    res.status(500).json({ error: e.message || 'Lß╗ùi server' });
  }
});

// PUT /crm/lead-comments/:cid/reaction ΓåÆ thß║ú / ─æß╗òi / bß╗Å cß║úm x├║c (1 emoji / user / b├¼nh luß║¡n)
r.put('/lead-comments/:cid/reaction', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const cid = Number(req.params.cid);
    if (!Number.isFinite(cid) || cid <= 0) return res.status(400).json({ error: 'id b├¼nh luß║¡n kh├┤ng hß╗úp lß╗ç' });

    const { data: com, error: cErr } = await supabase
      .from('crm_lead_comments')
      .select('id')
      .eq('id', cid)
      .is('deleted_at', null)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!com) return res.status(404).json({ error: 'Kh├┤ng t├¼m thß║Ñy b├¼nh luß║¡n' });

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
            error: 'Bß║úng cß║úm x├║c ch╞░a c├│. Chß║íy migration database/173_crm_lead_comment_reactions.sql.',
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
      return res.status(400).json({ error: 'Cß║úm x├║c kh├┤ng hß╗úp lß╗ç' });
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
          error: 'Bß║úng cß║úm x├║c ch╞░a c├│. Chß║íy migration database/173_crm_lead_comment_reactions.sql.',
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
            error: 'Bß║úng cß║úm x├║c ch╞░a c├│. Chß║íy migration database/173_crm_lead_comment_reactions.sql.',
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
    res.status(500).json({ error: e.message || 'Lß╗ùi server' });
  }
});

// DELETE /crm/lead-comments/:cid ΓåÆ x├│a mß╗üm (chß╗ë chß╗º sß╗ƒ hß╗»u hoß║╖c admin)
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
    res.status(500).json({ error: e.message || 'Lß╗ùi server' });
  }
});

// GET /crm/lead-comments/index?lead_ids=ΓÇª ΓåÆ Map { lead_id ΓåÆ {count,last_at,last_user_id} }
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
    // Bß║úo vß╗ç: nß║┐u kh├┤ng truyß╗ün lead_ids, giß╗¢i hß║ín 5000 d├▓ng gß║ºn nhß║Ñt ─æß╗â tr├ính tß║úi nß║╖ng.
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
    res.status(500).json({ error: e.message || 'Lß╗ùi server' });
  }
});

module.exports = r;
