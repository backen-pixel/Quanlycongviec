const { supabase } = require('../config/supabase');

function isWorkshopTplWorkshopTypeMissingError(err) {
  const m = String(err?.message || '').toLowerCase();
  return m.includes('workshop_type_id')
    && (m.includes('workshop_task_templates') || m.includes('column') || m.includes('does not exist'));
}

/** Lọc trang cấu hình: `global` hoặc uuid phân loại. */
function applyWorkshopTemplateWorkshopTypeFilter(q, rawWorkshopTypeId) {
  if (rawWorkshopTypeId === undefined) return q;
  if (rawWorkshopTypeId === null || String(rawWorkshopTypeId).toLowerCase() === 'global') {
    return q.is('workshop_type_id', null);
  }
  const id = String(rawWorkshopTypeId).trim();
  if (!id) return q.is('workshop_type_id', null);
  return q.eq('workshop_type_id', id);
}

/** Khi áp vào dự án: bộ của phân loại + bộ chung (NULL). */
function applyWorkshopTemplateWorkshopTypeScopeForProject(q, workshopTypeId) {
  const wkt = workshopTypeId ? String(workshopTypeId).trim() : '';
  if (!wkt) return q.is('workshop_type_id', null);
  return q.or(`workshop_type_id.eq.${wkt},workshop_type_id.is.null`);
}

function normalizeWorkshopTypeIdForInsert(raw, workshopArea) {
  if (String(workshopArea || '') !== 'production') return null;
  if (raw === undefined || raw === null || raw === '' || String(raw).toLowerCase() === 'global') {
    return null;
  }
  return String(raw).trim();
}

async function validateWorkshopTemplateWorkshopType({
  workshop_area,
  company_id,
  workshop_type_id,
  production_stage_id,
}) {
  const wkt = normalizeWorkshopTypeIdForInsert(workshop_type_id, workshop_area);
  if (!wkt) return { ok: true, workshop_type_id: null };

  const { data: wt, error } = await supabase
    .from('workshop_project_types')
    .select('id, company_id')
    .eq('id', wkt)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!wt?.id) return { ok: false, error: 'Phân loại không tồn tại' };
  if (company_id && wt.company_id && String(wt.company_id) !== String(company_id)) {
    return { ok: false, error: 'Phân loại không thuộc công ty đã chọn' };
  }

  if (production_stage_id) {
    const { data: stage } = await supabase
      .from('production_pipeline_stages')
      .select('workshop_type_id')
      .eq('id', production_stage_id)
      .maybeSingle();
    if (stage?.workshop_type_id && String(stage.workshop_type_id) !== String(wkt)) {
      return { ok: false, error: 'Phân loại bộ mẫu phải khớp phân loại của cột pipeline' };
    }
  }

  return { ok: true, workshop_type_id: wkt };
}

/** Chọn bộ mẫu SX khi áp vào deal/dự án: ưu tiên bộ đã đánh dấu is_default theo phân loại. */
function pickProductionTemplatesForWorkshopType(allRows, workshopTypeId) {
  const rows = Array.isArray(allRows) ? allRows : [];
  const wkt = workshopTypeId ? String(workshopTypeId).trim() : '';
  if (!wkt) {
    const globalRows = rows.filter((t) => !t.workshop_type_id);
    const defaults = globalRows.filter((t) => t.is_default);
    return defaults.length ? defaults : globalRows;
  }
  const forType = rows.filter((t) => t.workshop_type_id && String(t.workshop_type_id) === wkt);
  const defaults = forType.filter((t) => t.is_default);
  if (defaults.length) return defaults;
  if (forType.length) return forType;
  return [];
}

async function fetchProductionWorkshopTemplatesForApply(client, {
  companyId,
  workshopTypeId,
  wantStageCol = true,
} = {}) {
  const db = client || supabase;
  const cols = wantStageCol
    ? 'id, name, is_default, order_index, company_id, production_stage_id, workshop_type_id'
    : 'id, name, is_default, order_index, company_id, workshop_type_id';

  const loadScoped = async (cid) => {
    let q = db
      .from('workshop_task_templates')
      .select(cols)
      .eq('workshop_area', 'production')
      .eq('is_active', true)
      .order('order_index', { ascending: true });
    if (cid) q = q.eq('company_id', cid);
    else q = q.is('company_id', null);
    return q;
  };

  const runPick = async (cid) => {
    const { data, error } = await loadScoped(cid);
    if (error) return { data: null, error };
    return { data: pickProductionTemplatesForWorkshopType(data, workshopTypeId), error: null };
  };

  if (companyId) {
    let r = await runPick(companyId);
    if (r.error && isWorkshopTplWorkshopTypeMissingError(r.error)) {
      const legacyCols = wantStageCol
        ? 'id, name, is_default, order_index, company_id, production_stage_id'
        : 'id, name, is_default, order_index, company_id';
      let q = db
        .from('workshop_task_templates')
        .select(legacyCols)
        .eq('workshop_area', 'production')
        .eq('is_active', true)
        .eq('company_id', companyId)
        .order('order_index', { ascending: true });
      const legacy = await q;
      if (legacy.error) return legacy;
      return { data: legacy.data || [], error: null };
    }
    if (r.error) return r;
    if (r.data?.length) return r;
    r = await runPick(null);
    if (r.data?.length) return r;
    return { data: [], error: r.error };
  }

  return runPick(null);
}

module.exports = {
  isWorkshopTplWorkshopTypeMissingError,
  applyWorkshopTemplateWorkshopTypeFilter,
  applyWorkshopTemplateWorkshopTypeScopeForProject,
  normalizeWorkshopTypeIdForInsert,
  validateWorkshopTemplateWorkshopType,
  pickProductionTemplatesForWorkshopType,
  fetchProductionWorkshopTemplatesForApply,
};
