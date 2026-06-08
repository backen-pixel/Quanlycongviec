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
/** Cột progress_percent (migration 141) — tắt nếu DB chưa migrate */
let pipelineProgressPercentColumnAvailable = true;
/** Cột workshop_type_id (migration 251) — tắt nếu DB chưa migrate */
let pipelineWorkshopTypeColumnAvailable = true;
/** Embed workshop_type:workshop_project_types — tắt nếu schema cache chưa expose FK */
let pipelineWorkshopTypeJoinAvailable = true;
/** Cột KPI/SLA (migration 287) — tắt nếu DB chưa migrate */
let pipelineKpiSlaColumnsAvailable = true;
/** Cột counts_as_collected_revenue (migration 296) — tách khỏi 287 để không chặn «đã công» */
let pipelineCollectedRevenueColumnAvailable = true;
/** Cột requires_deadline (migration 288) — tắt nếu DB chưa migrate */
let pipelineRequiresDeadlineColumnAvailable = true;

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

function isPipelineProgressPercentMissingError(err) {
  if (!err || !pipelineProgressPercentColumnAvailable) return false;
  const s = String(err.message || err.details || err.hint || '').toLowerCase();
  return s.includes('progress_percent') && (s.includes('does not exist') || s.includes('could not find'));
}

function markPipelineProgressPercentColumnMissing() {
  if (pipelineProgressPercentColumnAvailable) {
    console.warn(
      '[production_pipeline_stages] Cột progress_percent chưa tồn tại. Chạy database/141_pipeline_stage_progress_percent.sql trên Supabase.',
    );
  }
  pipelineProgressPercentColumnAvailable = false;
}

function isPipelineWorkshopTypeMissingError(err) {
  if (!err || !pipelineWorkshopTypeColumnAvailable) return false;
  const s = String(err.message || err.details || err.hint || '').toLowerCase();
  return s.includes('workshop_type_id') && (s.includes('does not exist') || s.includes('could not find'));
}

function markPipelineWorkshopTypeColumnMissing() {
  if (pipelineWorkshopTypeColumnAvailable) {
    console.warn(
      '[production_pipeline_stages] Cột workshop_type_id chưa tồn tại. Chạy database/251_production_pipeline_workshop_type.sql trên Supabase.',
    );
  }
  pipelineWorkshopTypeColumnAvailable = false;
}

/** Lỗi PostgREST: schema cache chưa expose FK production_pipeline_stages → workshop_project_types */
function isPipelineWorkshopTypeEmbedRelationshipError(err) {
  if (!err || !pipelineWorkshopTypeJoinAvailable) return false;
  const raw = [err.message, err.details, err.hint, err.code, typeof err === 'object' ? JSON.stringify(err) : '']
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (!raw) return false;
  if (raw.includes('could not find') && raw.includes('relationship') && raw.includes('workshop_project_types')) return true;
  if (raw.includes('schema cache') && raw.includes('production_pipeline') && raw.includes('workshop_project_types')) return true;
  return false;
}

function markPipelineWorkshopTypeJoinMissing() {
  if (pipelineWorkshopTypeJoinAvailable) {
    console.warn(
      '[production_pipeline_stages] Không embed được workshop_type → workshop_project_types (schema cache / FK). Chỉ trả về workshop_type_id, không join tên loại.',
    );
  }
  pipelineWorkshopTypeJoinAvailable = false;
}

function isPipelineCollectedRevenueMissingError(err) {
  if (!err || !pipelineCollectedRevenueColumnAvailable) return false;
  const s = String(err.message || err.details || err.hint || '').toLowerCase();
  return s.includes('counts_as_collected_revenue')
    && (s.includes('does not exist') || s.includes('could not find'));
}

function markPipelineCollectedRevenueColumnMissing() {
  if (pipelineCollectedRevenueColumnAvailable) {
    console.warn(
      '[production_pipeline_stages] Cột counts_as_collected_revenue chưa tồn tại. Chạy database/296_production_pipeline_collected_revenue.sql trên Supabase.',
    );
  }
  pipelineCollectedRevenueColumnAvailable = false;
}

function isPipelineKpiSlaMissingError(err) {
  if (!err || !pipelineKpiSlaColumnsAvailable) return false;
  const s = String(err.message || err.details || err.hint || '').toLowerCase();
  return (
    (s.includes('default_probability') || s.includes('sla_days')
      || s.includes('counts_as_won_revenue') || s.includes('counts_as_completed_revenue'))
    && (s.includes('does not exist') || s.includes('could not find'))
  );
}

function markPipelineKpiSlaColumnMissing() {
  if (pipelineKpiSlaColumnsAvailable) {
    console.warn(
      '[production_pipeline_stages] Cột KPI/SLA chưa tồn tại. Chạy database/287_production_pipeline_sx_kpi_sla.sql trên Supabase.',
    );
  }
  pipelineKpiSlaColumnsAvailable = false;
}

function isPipelineRequiresDeadlineMissingError(err) {
  if (!err || !pipelineRequiresDeadlineColumnAvailable) return false;
  const s = String(err.message || err.details || err.hint || '').toLowerCase();
  return s.includes('requires_deadline') && (s.includes('does not exist') || s.includes('could not find'));
}

function markPipelineRequiresDeadlineColumnMissing() {
  if (pipelineRequiresDeadlineColumnAvailable) {
    console.warn(
      '[production_pipeline_stages] Cột requires_deadline chưa tồn tại. Chạy database/288_production_kanban_deadline.sql trên Supabase.',
    );
  }
  pipelineRequiresDeadlineColumnAvailable = false;
}

/** Chuỗi .select() cho bảng production_pipeline_stages (+ join workflow_stage) */
function buildPipelineStageSelect() {
  const cid = productionCompanyIdColumnAvailable ? 'company_id, ' : '';
  const h = handoverToLogisticsColumnAvailable ? 'is_handover_to_logistics, ' : '';
  const pp = pipelineProgressPercentColumnAvailable ? 'progress_percent, ' : '';
  const kpi287 = pipelineKpiSlaColumnsAvailable
    ? 'default_probability, sla_days, counts_as_won_revenue, counts_as_completed_revenue, '
    : '';
  const kpiCollected = pipelineCollectedRevenueColumnAvailable ? 'counts_as_collected_revenue, ' : '';
  const kpi = `${kpi287}${kpiCollected}`;
  const reqDl = pipelineRequiresDeadlineColumnAvailable ? 'requires_deadline, ' : '';
  let wt = '';
  if (pipelineWorkshopTypeColumnAvailable) {
    wt = pipelineWorkshopTypeJoinAvailable
      ? 'workshop_type_id, workshop_type:workshop_project_types(id, name, applies_to), '
      : 'workshop_type_id, ';
  }
  let t = '';
  if (crmTargetStageColumnAvailable) {
    if (crmTargetStageJoinAvailable) {
      t = 'crm_target_stage_id, crm_target_stage:crm_pipeline_stages(id, name, color, icon, order_index), ';
    } else {
      t = 'crm_target_stage_id, ';
    }
  }
  return `id, ${cid}name, color, icon, order_index, is_active, workflow_stage_id, bucket_slug, crm_sync_type, ${h}${pp}${kpi}${reqDl}${wt}${t}workflow_stage:workflow_stages(id, slug, name, color, icon)`;
}

/** Áp dụng retry khi SELECT 1 cột pipeline (embed / cột thiếu). */
async function fetchProductionPipelineStageById(supabase, stageId) {
  const run = () => supabase
    .from('production_pipeline_stages')
    .select(buildPipelineStageSelect())
    .eq('id', stageId)
    .single();

  let { data, error } = await run();
  if (error && isHandoverMissingError(error)) {
    markHandoverColumnMissing();
    ({ data, error } = await run());
  }
  if (error && isPipelineWorkshopTypeMissingError(error)) {
    markPipelineWorkshopTypeColumnMissing();
    ({ data, error } = await run());
  }
  if (error && isPipelineWorkshopTypeEmbedRelationshipError(error)) {
    markPipelineWorkshopTypeJoinMissing();
    ({ data, error } = await run());
  }
  if (error && isCrmTargetStageEmbedRelationshipError(error)) {
    markCrmTargetStageJoinMissing();
    ({ data, error } = await run());
  }
  if (error && isCrmTargetStageMissingError(error)) {
    markCrmTargetStageColumnMissing();
    ({ data, error } = await run());
  }
  if (error && isPipelineProgressPercentMissingError(error)) {
    markPipelineProgressPercentColumnMissing();
    ({ data, error } = await run());
  }
  if (error && isPipelineCollectedRevenueMissingError(error)) {
    markPipelineCollectedRevenueColumnMissing();
    ({ data, error } = await run());
  }
  if (error && isPipelineKpiSlaMissingError(error)) {
    markPipelineKpiSlaColumnMissing();
    ({ data, error } = await run());
  }
  if (error && isPipelineRequiresDeadlineMissingError(error)) {
    markPipelineRequiresDeadlineColumnMissing();
    ({ data, error } = await run());
  }
  if (data) {
    data.is_handover_to_logistics = data.is_handover_to_logistics ?? false;
  }
  return { data, error };
}

const INSERT_COLUMN_RETRIES = [
  [isHandoverMissingError, markHandoverColumnMissing],
  [isPipelineProgressPercentMissingError, markPipelineProgressPercentColumnMissing],
  [isPipelineCollectedRevenueMissingError, markPipelineCollectedRevenueColumnMissing],
  [isPipelineKpiSlaMissingError, markPipelineKpiSlaColumnMissing],
  [isPipelineRequiresDeadlineMissingError, markPipelineRequiresDeadlineColumnMissing],
  [isPipelineWorkshopTypeMissingError, markPipelineWorkshopTypeColumnMissing],
  [isCrmTargetStageMissingError, markCrmTargetStageColumnMissing],
];

/**
 * Insert cột pipeline SX: ghi DB với select tối thiểu (tránh lỗi embed),
 * rồi đọc lại bản ghi đầy đủ — không insert trùng khi chỉ select/embed lỗi.
 */
async function insertProductionPipelineStageRow(supabase, insertPayload) {
  let ins = stripHandoverFields({ ...insertPayload });
  const tryInsert = () => supabase
    .from('production_pipeline_stages')
    .insert(ins)
    .select('id')
    .single();

  let { data: row, error } = await tryInsert();

  for (let pass = 0; pass < 3 && error; pass += 1) {
    let changed = false;
    for (const [isErr, mark] of INSERT_COLUMN_RETRIES) {
      if (error && isErr(error)) {
        mark();
        ins = stripHandoverFields({ ...insertPayload });
        changed = true;
      }
    }
    if (error?.message?.includes('crm_sync_type')) {
      const { crm_sync_type: _omit, ...rest } = ins;
      ins = rest;
      changed = true;
    }
    if (!changed) break;
    ({ data: row, error } = await tryInsert());
  }

  if (error) throw error;
  if (!row?.id) throw new Error('Không tạo được cột pipeline');

  const { data, error: fetchErr } = await fetchProductionPipelineStageById(supabase, row.id);
  if (fetchErr) throw fetchErr;
  return data;
}

/** Bỏ field khỏi object insert/update nếu DB không có cột */
function stripHandoverFields(obj) {
  if (!obj) return obj;
  const o = { ...obj };
  if (!handoverToLogisticsColumnAvailable) delete o.is_handover_to_logistics;
  if (!crmTargetStageColumnAvailable) delete o.crm_target_stage_id;
  if (!pipelineProgressPercentColumnAvailable) delete o.progress_percent;
  if (!pipelineWorkshopTypeColumnAvailable) delete o.workshop_type_id;
  if (!pipelineKpiSlaColumnsAvailable) {
    delete o.default_probability;
    delete o.sla_days;
    delete o.counts_as_won_revenue;
    delete o.counts_as_completed_revenue;
  }
  if (!pipelineCollectedRevenueColumnAvailable) {
    delete o.counts_as_collected_revenue;
  }
  if (!pipelineRequiresDeadlineColumnAvailable) delete o.requires_deadline;
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
  pipelineProgressPercentColumnAvailable = true;
  pipelineWorkshopTypeColumnAvailable = true;
  pipelineWorkshopTypeJoinAvailable = true;
  pipelineKpiSlaColumnsAvailable = true;
  pipelineCollectedRevenueColumnAvailable = true;
  pipelineRequiresDeadlineColumnAvailable = true;
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
  isPipelineProgressPercentMissingError,
  markPipelineProgressPercentColumnMissing,
  isPipelineWorkshopTypeMissingError,
  markPipelineWorkshopTypeColumnMissing,
  isPipelineWorkshopTypeEmbedRelationshipError,
  markPipelineWorkshopTypeJoinMissing,
  isPipelineKpiSlaMissingError,
  markPipelineKpiSlaColumnMissing,
  isPipelineCollectedRevenueMissingError,
  markPipelineCollectedRevenueColumnMissing,
  isPipelineRequiresDeadlineMissingError,
  markPipelineRequiresDeadlineColumnMissing,
  isHandoverColumnInSchema,
  isCrmTargetStageColumnInSchema,
  isCrmTargetStageJoinInSchema,
  buildPipelineStageSelect,
  stripHandoverFields,
  fetchProductionPipelineStageById,
  insertProductionPipelineStageRow,
  INSERT_COLUMN_RETRIES,
  _resetForTests,
};
