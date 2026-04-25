/**
 * Cột is_handover_to_logistics (migration 78) có thể chưa tồn tại trên Supabase.
 * Cột crm_target_stage_id (migration 91) có thể chưa tồn tại trên Supabase.
 * Embed `crm_target_stage:crm_pipeline_stages` có thể lỗi schema cache dù cột đã có (FK/chưa expose relationship).
 * Cờ bộ nhớ: sau lỗi tương ứng sẽ bỏ field/embed khỏi select/insert/update.
 */
let handoverToLogisticsColumnAvailable = true;
let crmTargetStageColumnAvailable = true;
/** Khi false: vẫn select crm_target_stage_id nhưng không embed crm_target_stage (tránh lỗi relationship) */
let crmTargetStageJoinAvailable = true;
/** Cột company_id (migration 101) — tắt nếu DB chưa migrate */
let productionCompanyIdColumnAvailable = true;

function isHandoverMissingError(err) {
  if (!err) return false;
  const s = String(err.message || err.details || err.hint || '');
  return s.includes('is_handover_to_logistics');
}

/** Lỗi PostgREST: không embed được CRM stage (schema cache / chưa FK / chưa reload API) */
function isCrmTargetStageEmbedRelationshipError(err) {
  if (!err) return false;
  const raw = [err.message, err.details, err.hint, err.code, typeof err === 'object' ? JSON.stringify(err) : '']
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (!raw) return false;
  if (raw.includes('could not find') && raw.includes('relationship')) return true;
  if (raw.includes('schema cache') && raw.includes('production_pipeline') && raw.includes('crm_pipeline')) {
    return true;
  }
  return raw.includes('relationship') && (raw.includes('crm_pipeline') || raw.includes('crm_target'));
}

/** Cột crm_target_stage_id thật sự chưa có trên bảng (không nhầm với lỗi embed) */
function isCrmTargetStageMissingError(err) {
  if (!err) return false;
  if (isCrmTargetStageEmbedRelationshipError(err)) return false;
  const s = String(err.message || err.details || err.hint || '');
  return s.includes('crm_target_stage_id');
}

function markHandoverColumnMissing() {
  if (handoverToLogisticsColumnAvailable) {
    console.warn(
      '[production_pipeline_stages] Cột is_handover_to_logistics chưa tồn tại. Chạy database/78_pipeline_sync_flags.sql trên Supabase nếu cần. Tạm tương thích không dùng cột này.',
    );
  }
  handoverToLogisticsColumnAvailable = false;
}

function markCrmTargetStageColumnMissing() {
  if (crmTargetStageColumnAvailable) {
    console.warn(
      '[production_pipeline_stages] Cột crm_target_stage_id chưa tồn tại. Chạy database/91_pipeline_crm_target_stage.sql trên Supabase. Tạm tương thích không dùng cột này.',
    );
  }
  crmTargetStageColumnAvailable = false;
}

function markCrmTargetStageJoinMissing() {
  if (crmTargetStageJoinAvailable) {
    console.warn(
      '[production_pipeline_stages] Không embed được crm_target_stage → crm_pipeline_stages (schema cache / FK). Chỉ trả về crm_target_stage_id, không join tên cột CRM.',
    );
  }
  crmTargetStageJoinAvailable = false;
}

function isHandoverColumnInSchema() {
  return handoverToLogisticsColumnAvailable;
}

function isCrmTargetStageColumnInSchema() {
  return crmTargetStageColumnAvailable;
}

function isCrmTargetStageJoinInSchema() {
  return crmTargetStageJoinAvailable;
}

function isProductionCompanyIdMissingError(err) {
  if (!err || !productionCompanyIdColumnAvailable) return false;
  const s = String(err.message || err.details || err.hint || '').toLowerCase();
  return s.includes('company_id') && (s.includes('does not exist') || s.includes('could not find'));
}

function markProductionCompanyIdColumnMissing() {
  if (productionCompanyIdColumnAvailable) {
    console.warn(
      '[production_pipeline_stages] Cột company_id chưa tồn tại. Chạy database/101_sx_vc_pipeline_company_id.sql trên Supabase.',
    );
  }
  productionCompanyIdColumnAvailable = false;
}

/** Chuỗi .select() cho bảng production_pipeline_stages (+ join workflow_stage) */
function buildPipelineStageSelect() {
  const cid = productionCompanyIdColumnAvailable ? 'company_id, ' : '';
  const h = handoverToLogisticsColumnAvailable ? 'is_handover_to_logistics, ' : '';
  let t = '';
  if (crmTargetStageColumnAvailable) {
    if (crmTargetStageJoinAvailable) {
      t = 'crm_target_stage_id, crm_target_stage:crm_pipeline_stages(id, name, color, icon, order_index), ';
    } else {
      t = 'crm_target_stage_id, ';
    }
  }
  return `id, ${cid}name, color, icon, order_index, is_active, workflow_stage_id, bucket_slug, crm_sync_type, ${h}${t}workflow_stage:workflow_stages(id, slug, name, color, icon)`;
}

/** Bỏ field khỏi object insert/update nếu DB không có cột */
function stripHandoverFields(obj) {
  if (!obj) return obj;
  const o = { ...obj };
  if (!handoverToLogisticsColumnAvailable) delete o.is_handover_to_logistics;
  if (!crmTargetStageColumnAvailable) delete o.crm_target_stage_id;
  return o;
}

/**
 * Dùng cho Jest / reset: không export ra production trừ khi cần test
 */
function _resetForTests() {
  handoverToLogisticsColumnAvailable = true;
  crmTargetStageColumnAvailable = true;
  crmTargetStageJoinAvailable = true;
  productionCompanyIdColumnAvailable = true;
}

module.exports = {
  isHandoverMissingError,
  isCrmTargetStageMissingError,
  isCrmTargetStageEmbedRelationshipError,
  markHandoverColumnMissing,
  markCrmTargetStageColumnMissing,
  markCrmTargetStageJoinMissing,
  isProductionCompanyIdMissingError,
  markProductionCompanyIdColumnMissing,
  isHandoverColumnInSchema,
  isCrmTargetStageColumnInSchema,
  isCrmTargetStageJoinInSchema,
  buildPipelineStageSelect,
  stripHandoverFields,
  _resetForTests,
};
