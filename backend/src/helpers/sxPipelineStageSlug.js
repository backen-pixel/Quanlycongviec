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
  if (t.includes('ban thanh pham') || (t.includes('thanh pham') && !t.includes('thanh toan'))) return 'sx_ban_thanh_pham';
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
 * Giữ bộ mẫu gắn cột pipeline của phân loại. Ưu tiên is_default;
 * nếu chưa đặt mặc định → dùng mọi bộ khớp cột/phân loại (quét bổ sung thiếu).
 * Bộ chưa gắn production_stage_id vẫn được giữ (map slug theo tên bộ mẫu).
 */
function filterSxTemplatesToWorkshopPipeline(templates, pipelineStages, workshopTypeId) {
  const allowedStageIds = new Set((pipelineStages || []).map((s) => String(s.id)));
  const wkt = workshopTypeId ? String(workshopTypeId).trim() : '';
  const pool = (templates || []).filter((t) => {
    if (!t?.id) return false;
    const stageId = t.production_stage_id ? String(t.production_stage_id) : '';
    if (stageId && !allowedStageIds.has(stageId)) return false;
    if (wkt) {
      return t.workshop_type_id && String(t.workshop_type_id) === wkt;
    }
    if (t.workshop_type_id) return false;
    return true;
  });
  const defaults = pool.filter((t) => !!t.is_default);
  return defaults.length ? defaults : pool;
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

/** Gợi ý từ khóa bundle mẫu ↔ tên cột pipeline (khi bộ mẫu chưa gắn production_stage_id). */
const SX_STAGE_MATCH_HINTS = [
  ['tiep nhan', 'tiep nhan'],
  ['len ke hoach', 'ke hoach'],
  ['len ke hoach', 'thiet ke'],
  ['thiet ke', 'thiet ke'],
  ['kiem tra cheo', 'kiem tra'],
  ['vat tu', 'vat tu'],
  ['ban thanh pham', 'thanh pham'],
  ['cat kinh', 'cat'],
  ['san xuat', 'san xuat'],
  ['hoan thien', 'hoan thien'],
  ['dong goi', 'dong goi'],
  ['van chuyen', 'giao'],
  ['van chuyen', 'van chuyen'],
  ['da giao', 'da giao'],
  ['cong no', 'cong no'],
  ['thu tien', 'thu tien'],
  ['kcs', 'kcs'],
  ['san pham', 'san pham'],
];

function scoreProductionStageLabelMatch(labelNorm, stageNorm) {
  if (!labelNorm || !stageNorm) return 0;
  let score = 0;
  const legacyL = legacySxSlugFromStageName(labelNorm);
  const legacyS = legacySxSlugFromStageName(stageNorm);
  if (legacyL && legacyS && legacyL === legacyS) score += 24;

  const words = labelNorm.split(/\s+/).filter((w) => w.length > 2);
  for (const w of words) {
    if (stageNorm.includes(w)) score += 3;
  }
  for (const [a, b] of SX_STAGE_MATCH_HINTS) {
    if (labelNorm.includes(a) && stageNorm.includes(b)) score += 6;
  }
  return score;
}

/**
 * Suy cột pipeline SX từ tên bộ mẫu / tiêu đề nhiệm vụ (fallback khi chưa gắn production_stage_id).
 */
function matchProductionStageForLabel(label, stageRows) {
  const labelNorm = normalizeSxStageText(label);
  if (!labelNorm || !stageRows?.length) return null;

  let best = null;
  let bestScore = 0;
  for (const s of stageRows) {
    const stageNorm = normalizeSxStageText(s?.name);
    const sc = scoreProductionStageLabelMatch(labelNorm, stageNorm);
    if (sc > bestScore) {
      bestScore = sc;
      best = s;
    }
  }
  return bestScore >= 3 ? best : null;
}

function matchProductionStageForLegacySlug(slug, stageRows) {
  const s = String(slug || '').trim();
  if (!s || !stageRows?.length) return null;
  const legacyMap = buildLegacySxSlugToStageId(stageRows);
  const id = legacyMap.get(s);
  if (!id) return null;
  return stageRows.find((row) => String(row.id) === String(id)) || null;
}

/** Chỉ giữ nhiệm vụ SX thuộc pipeline của phân loại hiện tại. */
function filterSxTasksToWorkshopPipeline(tasks, pipelineStages) {
  const allowedStageIds = new Set((pipelineStages || []).map((s) => String(s.id)));
  return (tasks || []).filter((t) => {
    const isSx = String(t?.stage_slug || '').startsWith('sx_') || !!t?.production_pipeline_stage_id;
    if (!isSx) return false;
    const pid = t?.production_pipeline_stage_id ? String(t.production_pipeline_stage_id) : null;
    if (pid) return allowedStageIds.has(pid);
    // Legacy / sx_other chưa gắn cột: vẫn hiển thị (đã lọc theo lead_id ở tầng trên)
    return true;
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
  matchProductionStageForLabel,
  matchProductionStageForLegacySlug,
  scoreProductionStageLabelMatch,
};
