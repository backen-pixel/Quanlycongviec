/** Chuẩn hoá tên/slug giai đoạn SX — dùng khi gen task và hiển thị tab Nhiệm vụ. */

const { loadProductionPipelineStagesRows, filterProductionPipelineStagesForWorkshopType } = require('./workshopKanban');

function normalizeSxStageText(raw) {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/** Suy slug sx_* cổ điển từ tên cột pipeline (fallback khi không có bucket_slug). */
function legacySxSlugFromStageName(nameRaw) {
  const t = normalizeSxStageText(nameRaw);
  if (!t) return null;
  if (t.includes('tiep nhan')) return 'sx_tiep_nhan';
  if (t.includes('thiet ke') || t.includes('len ke hoach')) return 'sx_thiet_ke_ke_hoach';
  if (t.includes('kiem tra cheo')) return 'sx_kiem_tra_cheo';
  if (t.includes('vat tu')) return 'sx_vat_tu';
  if (t.includes('san xuat thung')) return 'sx_san_xuat_thung';
  if (t.includes('san xuat alu')) return 'sx_san_xuat_alu';
  if (t.includes('hoan thien')) return 'sx_hoan_thien';
  if (t.includes('dong goi')) return 'sx_dong_goi';
  if (t.includes('giao hang')) return 'sx_giao_hang';
  return null;
}

function sxStageSlugFromPipelineRow(stage) {
  if (!stage) return 'sx_other';
  const bucket = String(stage.bucket_slug || '').trim();
  if (bucket) return `sx_${bucket}`;
  const legacy = legacySxSlugFromStageName(stage.name);
  if (legacy) return legacy;
  if (stage.id) return `sx_pl_${String(stage.id).slice(0, 8)}`;
  return 'sx_other';
}

function buildSxStageSlugByProductionStageId(stageRows) {
  const map = new Map();
  for (const row of stageRows || []) {
    if (!row?.id) continue;
    map.set(String(row.id), sxStageSlugFromPipelineRow(row));
  }
  return map;
}

/** Map slug sx_* (cũ) → production_pipeline_stages.id */
function buildLegacySxSlugToStageId(stageRows) {
  const map = new Map();
  for (const row of stageRows || []) {
    if (!row?.id) continue;
    const slug = sxStageSlugFromPipelineRow(row);
    if (slug && !map.has(slug)) map.set(slug, row.id);
    const bucket = String(row.bucket_slug || '').trim();
    if (bucket) map.set(`sx_${bucket}`, row.id);
  }
  return map;
}

/** Cột pipeline SX thuộc phân loại (workshop_type) — không lấy cột phân loại khác. */
async function getProductionPipelineStagesForWorkshopType(companyId, workshopTypeId) {
  let rows = await loadProductionPipelineStagesRows(false, companyId);
  if (!rows?.length && companyId) {
    rows = await loadProductionPipelineStagesRows(false, null);
  }
  const out = filterProductionPipelineStagesForWorkshopType(rows, workshopTypeId);
  return out.sort((a, b) => (Number(a.order_index) || 0) - (Number(b.order_index) || 0));
}

/**
 * Chỉ giữ bộ mẫu gắn đúng cột pipeline của phân loại + bộ mặc định (is_default).
 * Không lấy bộ global / phân loại khác → tránh tạo nhiệm vụ dư.
 */
function filterSxTemplatesToWorkshopPipeline(templates, pipelineStages, workshopTypeId) {
  const allowedStageIds = new Set((pipelineStages || []).map((s) => String(s.id)));
  const wkt = workshopTypeId ? String(workshopTypeId).trim() : '';
  return (templates || []).filter((t) => {
    if (!t?.id) return false;
    const stageId = t.production_stage_id ? String(t.production_stage_id) : '';
    if (!stageId || !allowedStageIds.has(stageId)) return false;
    if (wkt) {
      return t.workshop_type_id && String(t.workshop_type_id) === wkt && !!t.is_default;
    }
    if (t.workshop_type_id) return false;
    return !!t.is_default;
  });
}

function resolveSxTaskProductionStageId(task, stageRows) {
  const stages = stageRows || [];
  const validIds = new Set(stages.map((s) => String(s.id)));
  const pid = task?.production_pipeline_stage_id;
  // Đã gắn cột pipeline cụ thể: chỉ khớp đúng phân loại — không fallback slug sang pipeline khác.
  if (pid) return validIds.has(String(pid)) ? pid : null;

  const legacyMap = buildLegacySxSlugToStageId(stages);
  const slug = String(task?.stage_slug || '').trim();
  if (slug && legacyMap.has(slug)) return legacyMap.get(slug);
  if (slug.startsWith('sx_pl_')) {
    const prefix = slug.slice(6);
    const hit = (stageRows || []).find((s) => s?.id && String(s.id).startsWith(prefix));
    if (hit && validIds.has(String(hit.id))) return hit.id;
  }

  return null;
}

/** Chỉ giữ nhiệm vụ SX thuộc pipeline của phân loại hiện tại. */
function filterSxTasksToWorkshopPipeline(tasks, pipelineStages) {
  return (tasks || []).filter((t) => {
    const isSx = String(t?.stage_slug || '').startsWith('sx_') || !!t?.production_pipeline_stage_id;
    if (!isSx) return false;
    return resolveSxTaskProductionStageId(t, pipelineStages) != null;
  });
}

module.exports = {
  normalizeSxStageText,
  legacySxSlugFromStageName,
  sxStageSlugFromPipelineRow,
  buildSxStageSlugByProductionStageId,
  buildLegacySxSlugToStageId,
  getProductionPipelineStagesForWorkshopType,
  filterSxTemplatesToWorkshopPipeline,
  resolveSxTaskProductionStageId,
  filterSxTasksToWorkshopPipeline,
};
