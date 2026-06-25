const { supabase } = require('../../../config/supabase');
const { getAppSettingValue, invalidateAppSettingKey } = require('../../../helpers/appSettingsCache');
const { getPipelineZaloSlice } = require('../../../helpers/crmTaxonomyCache');
const {
  sendZaloTemplateMessage,
  buildDealTemplateData,
  pickDealZaloTemplatePayload,
  resolveZaloDealTemplateId,
  normalizeVnPhoneTo84,
  formatVnPhoneLocal0From84,
} = require('../../../helpers/zaloOa');
const { crmRouteErrorText } = require('./crmRouteHelpers');

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

module.exports = {
  getZaloNotifySettings,
  upsertZaloNotifySettings,
  maskZaloAccessTokenPreview,
  maskCustomerPhoneDisplay,
  isDealStageHoanThanhForZalo,
  shallowMergeTemplateData,
  isCrmPipelinesTableMissingError,
  respondIfCrmPipelinesTableMissing,
  fetchPipelineWithStagesById,
  fetchCrmPipelineZaloSlice,
  executeZaloDealStageNotify,
  maybeSendZaloOnDealStageEnter,
  normalizePipelineStagesList,
};
